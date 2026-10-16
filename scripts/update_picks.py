#!/usr/bin/env python3
"""Fetch publisher RSS, retain attribution, and extract only explicit selection blocks.
Python standard library only. Never infers a selection from odds tables or prose.
"""
import concurrent.futures, datetime as dt, email.utils, hashlib, html, json, os, re, time
import urllib.request, xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
TEAMS = 'Cardinals Falcons Ravens Bills Panthers Bears Bengals Browns Cowboys Broncos Lions Packers Texans Colts Jaguars Chiefs Raiders Chargers Rams Dolphins Vikings Patriots Saints Giants Jets Eagles Steelers 49ers Seahawks Buccaneers Titans Commanders'.split()

def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(s or '')).strip()

class Blocks(HTMLParser):
    def __init__(self):
        super().__init__(); self.blocks=[]; self.parts=[]; self.tag=None; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.skip+=1
        if tag in ('h2','h3','h4','h5','p','li'):
            if self.tag: self.flush()
            self.tag=tag; self.parts=[]
        elif tag=='br' and self.tag: self.parts.append(' ')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
        if tag==self.tag: self.flush()
    def handle_data(self, data):
        if self.tag and not self.skip: self.parts.append(data)
    def flush(self):
        if self.tag:
            self.blocks.append((self.tag,clean(' '.join(self.parts))))
        self.tag=None;self.parts=[]

def market(text):
    if re.search(r'prop|scorer|touchdown|receiving|rushing|passing|reception|sack|yards|interception|completion|attempt|tackles',text,re.I):return 'Props'
    if re.search(r'\bover\b|\bunder\b|total|o/u',text,re.I):return 'Totals'
    if re.search(r'moneyline|\bml\b|straight.up|to win',text,re.I):return 'Moneyline'
    if re.search(r'against.the.spread|\bats\b|spread|[+-]\d(?:\.\d)?\b',text,re.I):return 'Spread'
    return 'Other'

def selections(content):
    parser=Blocks();parser.feed(content);parser.flush();result=[];words=0;context='';fingerprints=set()
    for tag,text in parser.blocks:
        named_teams=[t for t in TEAMS if re.search(r'\b'+re.escape(t)+r'\b',text,re.I)]
        if tag.startswith('h') and len(named_teams)>=2 and len(text)<120:
            context=re.sub(r'\s*(?:O/U )?Picks?$', '', text, flags=re.I)
        # Explicitly labelled selections, or short betting selection headings only.
        label=re.search(r"(?:\b(?:my |our |best |erickson.s |nfl week \d+ )?(?:pick|bet)(?:s)?\s*(?:#\d+)?\s*:)\s*(.+)",text,re.I)
        candidate=label.group(1) if label else text if tag.startswith('h') else ''
        candidate=clean(candidate)
        if not candidate or len(candidate)>110 or len(candidate.split())>17:continue
        if re.search(r'promo|bonus|sign.up|cheat sheet|more nfl|strategy|best bets for|odds courtesy|parlay|[+-]\d+(?:\.\d+)?\s+to\s+[+-]\d',candidate,re.I):continue
        has_team=any(re.search(r'\b'+re.escape(t)+r'\b',candidate,re.I) for t in TEAMS)
        has_line=bool(re.search(r'(?:\b(?:over|under)\s*\d|[+-]\d+(?:\.\d+)?|\d+\+\s*(?:yards|receptions)|touchdown scorer|to record a sack)',candidate,re.I))
        if not has_line:continue
        if not has_team and not re.search(r'over|under|yards|scorer|sack|touchdown',candidate,re.I):continue
        signature=re.sub(r'\s+vs\.?\s+.*$','',candidate.lower())
        signature=re.sub(r'\s*\(.*?\)','',signature).strip()
        if signature in fingerprints:continue
        fingerprints.add(signature)
        if words+len(candidate.split())>22:continue
        result.append({'selection':candidate,'market':market(candidate),'context':context,'method':'Explicit selection in publisher feed'})
        words+=len(candidate.split())
        if len(result)>=3:break
    return result

def parse_feed(raw,source,now):
    root=ET.fromstring(raw);articles=[]
    for item in root.findall('.//item'):
        title=clean(item.findtext('title')); url=clean(item.findtext('link'))
        if not url.startswith('https://'):continue
        categories=' '.join(item.findtext('category') or '' for _ in [0])
        # NFL-only titles avoid college, other sports and publisher promotional posts.
        if not re.search(r'\bNFL\b|\b(?:Monday|Thursday|Sunday) Night Football\b',title,re.I):continue
        if re.search(r'college|\bNCAAF\b|promo code|bonus code|sportsbook review',title,re.I):continue
        try: published=email.utils.parsedate_to_datetime(item.findtext('pubDate')).astimezone(UTC)
        except (ValueError,TypeError,AttributeError):continue
        if published>now+dt.timedelta(hours=1) or now-published>dt.timedelta(days=14):continue
        content=item.findtext('{http://purl.org/rss/1.0/modules/content/}encoded') or item.findtext('description') or ''
        picks=selections(content)
        if not picks and not re.search(r'pick|bet|odds|prediction|prop|spread|total',title,re.I):continue
        author=clean(item.findtext('{http://purl.org/dc/elements/1.1/}creator')) or source['name']+' editorial team'
        found=sorted({t for t in TEAMS if re.search(r'\b'+re.escape(t)+r'\b', title+' '+' '.join(p['selection'] for p in picks),re.I)})
        articles.append({'id':hashlib.sha256(url.encode()).hexdigest()[:16], 'title':title,'url':url,'publisher':source['name'],'sourceId':source['id'],'author':author,'publishedAt':published.isoformat(),'picks':picks,'markets':sorted({p['market'] for p in picks}) or [market(title)],'teams':found})
    return articles

def fetch_source(source,now,previous):
    error=''
    for attempt in range(2):
        try:
            req=urllib.request.Request(source['feed'],headers={'User-Agent':'SundaySignal/1.0 (RSS reader; hourly refresh)','Accept':'application/rss+xml,application/xml,text/xml'})
            with urllib.request.urlopen(req,timeout=25) as response:raw=response.read(5_000_001)
            if len(raw)>5_000_000:raise ValueError('Feed exceeds safety limit')
            articles=parse_feed(raw,source,now)
            if not articles:raise ValueError('No recent NFL betting items in this feed')
            return articles,{**source,'status':'ok','checkedAt':now.isoformat(),'lastSuccessAt':now.isoformat(),'count':len(articles),'message':'Feed retrieved successfully'}
        except Exception as exc:
            error=str(exc)[:180]
            if attempt==0:time.sleep(1)
    oldsource=next((s for s in previous.get('sources',[]) if s['id']==source['id']),{})
    retained=[a for a in previous.get('articles',[]) if a.get('sourceId')==source['id'] and now-dt.datetime.fromisoformat(a['publishedAt'])<dt.timedelta(days=14)]
    return retained,{**source,'status':'unavailable','checkedAt':now.isoformat(),'lastSuccessAt':oldsource.get('lastSuccessAt'),'count':len(retained),'message':'Publisher feed unavailable. Retaining earlier articles. '+error}

def main():
    now=dt.datetime.now(UTC);path=ROOT/'data/picks.json'
    try:previous=json.loads(path.read_text())
    except (OSError,ValueError):previous={}
    sources=json.loads((ROOT/'sources.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda s:fetch_source(s,now,previous),[s for s in sources if s.get('enabled',True)]))
    articles={a['url']:a for rows,_ in results for a in rows}
    statuses=[s for _,s in results];success=any(s['status']=='ok' for s in statuses)
    payload={'schemaVersion':1,'checkedAt':now.isoformat(),'lastSuccessfulUpdate':now.isoformat() if success else previous.get('lastSuccessfulUpdate'),'sources':statuses,'articles':sorted(articles.values(),key=lambda a:a['publishedAt'],reverse=True),'refreshMinutes':60}
    path.parent.mkdir(exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');os.replace(tmp,path)
    for s in statuses:print(f"{s['name']}: {s['status']} ({s['count']} articles)")
    print(f"Saved {len(articles)} NFL articles; {sum(len(a['picks']) for a in articles.values())} explicit selections")
    if not success:raise SystemExit('All feeds failed. Preserved available cached articles; inspect publisher status.')
if __name__=='__main__':main()
