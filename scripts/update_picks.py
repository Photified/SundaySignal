#!/usr/bin/env python3
"""Fetch publisher RSS, retain attribution, and extract only explicit selection blocks.
Python standard library only. Never infers a selection from odds tables or prose.
"""
import concurrent.futures, datetime as dt, email.utils, hashlib, html, json, os, re, time
import urllib.request, urllib.parse, xml.etree.ElementTree as ET
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
        parlays=extract_parlays(content) if 'parlay' in title.lower() else []
        picks=[] if 'parlay' in title.lower() else selections(content)
        if not picks and not parlays and not re.search(r'pick|bet|odds|prediction|prop|spread|total',title,re.I):continue
        author=clean(item.findtext('{http://purl.org/dc/elements/1.1/}creator')) or source['name']+' editorial team'
        found=sorted({t for t in TEAMS if re.search(r'\b'+re.escape(t)+r'\b', title+' '+' '.join(p['selection'] for p in picks),re.I)})
        articles.append({'id':hashlib.sha256(url.encode()).hexdigest()[:16], 'title':title,'url':url,'publisher':source['name'],'sourceId':source['id'],'author':author,'publishedAt':published.isoformat(),'picks':picks,'parlays':parlays,'markets':sorted({p['market'] for p in picks}) or [market(title)],'teams':found})
    return articles

def fetch_source(source,now,previous):
    error=''
    for attempt in range(2):
        try:
            if source.get('kind') in ('cbs','covers','articles'):
                articles=fetch_cbs(source,now,previous) if source['kind']=='cbs' else fetch_covers(source,now) if source['kind']=='covers' else fetch_articles(source,now)
                if not articles:raise ValueError('No current picks could be verified')
                return articles,{**source,'status':'ok','checkedAt':now.isoformat(),'lastSuccessAt':now.isoformat(),'count':len(articles),'message':'Public expert selections retrieved'}
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

ABBR=dict(zip('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WSH'.split(),TEAMS))
ABBR.update({'JAC':'Jaguars','LA':'Rams','WAS':'Commanders'})
def names(text):return [t for t in TEAMS if re.search(r'\b'+re.escape(t)+r'\b',text,re.I)]
def fetch_text(url):
    req=urllib.request.Request(url,headers={'User-Agent':'SundaySignal/2.0 (public NFL picks reader; hourly)','Accept':'text/html,application/json,application/rss+xml'})
    with urllib.request.urlopen(req,timeout=22) as response:raw=response.read(5_000_001)
    if len(raw)>5_000_000:raise ValueError('Response too large')
    return raw.decode('utf-8')
def plain(raw):return clean(re.sub(r'<[^>]*>',' ',raw))

class TableCells(HTMLParser):
    def __init__(self):super().__init__();self.rows=[];self.row=[];self.cell=None;self.parts=[];self.images=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='tr':self.row=[]
        if tag in ('td','th'):self.cell=tag;self.parts=[];self.images=[]
        if tag=='img' and self.cell and attrs.get('alt') in TEAMS:self.images.append(attrs['alt'])
    def handle_data(self,data):
        if self.cell:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag==self.cell:self.row.append({'text':clean(' '.join(self.parts)),'images':self.images[:]});self.cell=None
        if tag=='tr' and self.row:self.rows.append(self.row);self.row=[]

class CBSRows(HTMLParser):
    def __init__(self):super().__init__();self.rows=[];self.row=None;self.button=None;self.parts=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='tr':self.row={'game':'','picks':[]}
        if self.row is None:return
        if tag=='a' and '/gametracker/' in attrs.get('href',''):self.row['game']=attrs['href']
        if tag=='button' and 'data-config' in attrs:
            try:
                conf=json.loads(attrs['data-config']);author=conf.get('meta',{}).get('bets',[{}])[0].get('expertLabel')
                if author and conf.get('marketName')=='Spread':self.button=conf;self.parts=[]
            except (ValueError,IndexError):pass
    def handle_data(self,data):
        if self.button is not None:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=='button' and self.button is not None:
            label=clean(' '.join(self.parts));m=re.search(r'\b([A-Z]{2,3})\s+([+-]\d+(?:\.\d+)?)',label)
            if m and m[1] in ABBR and self.row is not None:self.row['picks'].append((self.button['meta']['bets'][0]['expertLabel'],ABBR[m[1]]+' '+m[2]))
            self.button=None
        if tag=='tr' and self.row is not None:
            if self.row['game'] and self.row['picks']:self.rows.append(self.row)
            self.row=None

def fetch_cbs(source,now,previous):
    parser=CBSRows();parser.feed(fetch_text(source['feed']));out=[]
    existing={a['id']:a for a in previous.get('articles',[])}
    for row in parser.rows:
        m=re.search(r'NFL_(\d{8})_([A-Z]+)@([A-Z]+)',row['game'])
        if not m or m[2] not in ABBR or m[3] not in ABBR:continue
        date=dt.datetime.strptime(m[1],'%Y%m%d').replace(tzinfo=UTC)
        if abs((date-now).days)>14:continue
        matchup=ABBR[m[2]]+' vs '+ABBR[m[3]]
        for author,selection in row['picks']:
            key=hashlib.sha256((source['id']+m[0]+author+'Spread').encode()).hexdigest()[:16]
            prior=existing.get(key,{});published=prior.get('publishedAt',now.isoformat())
            # The board has no publication timestamp. Preserve first observation, label it as observed.
            out.append({'id':key,'title':'NFL '+matchup+' expert spread pick','url':source['feed'],'publisher':source['name'],'sourceId':source['id'],'author':author,'publishedAt':published,'observedAt':now.isoformat(),'timestampType':'observed','picks':[{'selection':selection,'market':'Spread','context':matchup,'eventDate':date.date().isoformat(),'method':'Named analyst selection on public CBS board'}],'parlays':[],'markets':['Spread'],'teams':names(matchup)})
    return out

def fetch_covers(source,now):
    index=fetch_text(source['feed']);links=[]
    # Discover current weekly article URLs instead of hardcoding a season or week.
    for href in re.findall(r'href=[\"\']([^\"\']+)[\"\']',index):
        url=urllib.parse.urljoin(source['feed'],html.unescape(href))
        if urllib.parse.urlparse(url).netloc=='www.covers.com' and re.search(r'/nfl/(?:picks-against-the-spread|moneyline-picks)-week-\d+-\d{4}$',url) and url not in links:links.append(url)
    def read_article(url):
        raw=fetch_text(url);meta=None
        for block in re.findall(r'<script[^>]*type=[\"\']application/ld\+json[\"\'][^>]*>(.*?)</script>',raw,re.S|re.I):
            try:obj=json.loads(block)
            except ValueError:continue
            if isinstance(obj,dict) and obj.get('@type')=='NewsArticle':meta=obj;break
        if not meta:return None
        date=dt.datetime.fromisoformat(meta['datePublished'].replace('Z','+00:00')).astimezone(UTC)
        if now-date>dt.timedelta(days=14) or date>now+dt.timedelta(hours=1):return None
        authors=meta.get('author',[]);authors=authors if isinstance(authors,list) else [authors]
        people=[x.get('mainEntity',x).get('name') for x in authors if isinstance(x,dict)]
        if len(people)!=1 or not people[0]:return None
        is_spread='against-the-spread' in url;picks=[]
        for table in re.findall(r'<table\b.*?</table>',raw,re.S|re.I):
            parser=TableCells();parser.feed(table)
            if not parser.rows:continue
            header=' '.join(c['text'] for c in parser.rows[0]).lower()
            if 'matchup' not in header or not (('ats pick' in header and is_spread) or ('probability' in header and not is_spread)):continue
            for row in parser.rows[1:]:
                if len(row)!=2 or len(names(row[0]['text']))!=2:continue
                teams=set(row[1]['images'])
                if len(teams)!=1:continue
                team=next(iter(teams));line=re.search(r'[+-]\d+(?:\.\d+)?',row[1]['text'])
                if is_spread and not line:continue
                selection=team+' '+(line[0] if is_spread else 'Moneyline')
                picks.append({'selection':selection,'market':'Spread' if is_spread else 'Moneyline','context':row[0]['text'],'method':'Explicit team logo and selection in publisher pick table'})
        if not picks:return None
        return {'id':hashlib.sha256(url.encode()).hexdigest()[:16],'title':clean(meta['headline']),'url':url,'publisher':source['name'],'sourceId':source['id'],'author':people[0],'publishedAt':date.isoformat(),'picks':picks,'parlays':[],'markets':['Spread' if is_spread else 'Moneyline'],'teams':[]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(read_article,links[:4]))
    return [a for a in results if a]

def extract_parlays(content):
    parser=Blocks();parser.feed(content);parser.flush();out=[];legs=[];label='Expert parlay';expected=1;context=''
    for tag,text in parser.blocks:
        if tag.startswith('h') and len(names(text))==2:context=text
        if tag.startswith('h') and re.search(r'parlay\s*#?\s*\d+',text,re.I):label=text;legs=[];expected=1
        m=re.match(r'Leg\s+(\d+)\s*:\s*(.+)',text,re.I)
        if m and len(m[2])<=160:
            n=int(m[1])
            if n==1:legs=[];expected=1
            if n!=expected:legs=[];expected=1;continue
            legs.append({'selection':m[2],'market':market(m[2]),'context':context});expected+=1
        price=re.match(r'Parlay Odds\s*:\s*([+-]\d{3,5})\s*$',text,re.I)
        if price and 2<=len(legs)<=8:
            out.append({'label':label,'americanOdds':int(price[1]),'legs':legs[:]});legs=[];expected=1
    return out


def article_metadata(raw):
    def walk(x):
        if isinstance(x,list):
            for v in x:yield from walk(v)
        elif isinstance(x,dict):
            yield x
            if '@graph' in x:yield from walk(x['@graph'])
    for block in re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',raw,re.S|re.I):
        try:
            for m in walk(json.loads(block)):
                if m.get('@type') in ('NewsArticle','Article','BlogPosting') and m.get('author') and m.get('datePublished'):return m
        except ValueError:pass
    return None

def publisher_selections(raw,source_id):
    if source_id=='sbr':
        table=TableCells();table.feed(raw);out=[]
        for row in table.rows:
            if len(row)<2 or len(names(row[0]['text']))!=2:continue
            label=row[1]['text'];m=re.fullmatch(r'([A-Za-z0-9 ]+)\s*\(([+-]\d+(?:\.\d+)?)\)',label)
            if m and len(names(m[1]))==1:
                out.append({'selection':names(m[1])[0]+' '+m[2],'market':'Spread','context':row[0]['text'],'method':'Explicit publisher pick table'})
        return out
    if source_id=='sportingnews':
        b=Blocks();b.feed(raw);b.flush();out=[];context='';line_team=None;line=None
        for tag,text in b.blocks:
            if tag.startswith('h'):
                context=text;line_team=None
                m=re.search(r'('+ '|'.join(TEAMS)+r')\s*\(([+-]\d+(?:\.\d+)?)',text)
                if m and len(names(text))==2:line_team=m[1];line=float(m[2])
            if line_team and text.startswith('Pick:'):
                # This column's heading explicitly marks the ATS selection and line.
                # Require its matching result statement before admitting the selection.
                if not re.search(r'\bwin\b.*\d+-\d+',text):continue
                out.append({'selection':line_team+' '+format(line,'+g'),'market':'Spread','context':context,'method':'Publisher ATS pick heading and accompanying Pick statement'})
                line_team=None
        return out
    return selections(raw)

def fetch_articles(source,now):
    raw=fetch_text(source['feed']);links=[]
    for href in re.findall(r'href=["\']([^"\']+)',raw):
        url=urllib.parse.urljoin(source['feed'],html.unescape(href))
        if urllib.parse.urlparse(url).netloc!=urllib.parse.urlparse(source['feed']).netloc:continue
        if re.search(source['articlePattern'],url) and url not in links:links.append(url)
    def one(url):
        raw=fetch_text(url);meta=article_metadata(raw)
        if not meta:return None
        date=dt.datetime.fromisoformat(meta['datePublished'].replace('Z','+00:00')).astimezone(UTC)
        if now-date>dt.timedelta(days=14) or date>now+dt.timedelta(hours=1):return None
        authors=meta['author'];authors=authors if isinstance(authors,list) else [authors]
        author=', '.join(clean(a.get('name','')) for a in authors if isinstance(a,dict))
        if not author:return None
        picks=publisher_selections(raw,source['id'])
        title=clean(meta.get('headline',meta.get('name','NFL picks')))
        for pick in picks:
            if not pick.get('context') and len(names(title))==2:pick['context']=title
        if not picks:return None
        return {'id':hashlib.sha256(url.encode()).hexdigest()[:16],'title':title,'url':url,'publisher':source['name'],'sourceId':source['id'],'author':author,'publishedAt':date.isoformat(),'picks':picks,'parlays':[],'markets':sorted({p['market'] for p in picks}),'teams':names(title)}
    out=[];errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(one,url) for url in links[:12]]
        for f in futures:
            try:
                item=f.result()
                if item:out.append(item)
            except Exception as exc:errors.append(str(exc))
    if not out and errors:raise ValueError(errors[0])
    return out

def fetch_schedule(now,previous):
    base='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
    try:
        current=json.loads(fetch_text(base));boards=[current]
        season=current.get('season',{});week=current.get('week',{}).get('number')
        if season.get('type')==2 and isinstance(week,int) and week<18:
            try:boards.append(json.loads(fetch_text(base+'?dates='+str(season['year'])+'&seasontype=2&week='+str(week+1))))
            except Exception:pass
        games={}
        for board in boards:
            for e in board.get('events',[]):
                teams=[c['team']['name'] for c in e['competitions'][0]['competitors']]
                if len(teams)!=2 or any(t not in TEAMS for t in teams):continue
                games[e['id']]={'id':e['id'],'startAt':e['date'],'state':e['status']['type']['state'],'teams':teams,'matchup':e['name'],'week':e.get('week',{}).get('number',board.get('week',{}).get('number')),'season':board.get('season',{}).get('year')}
        if not games:raise ValueError('No NFL schedule returned')
        return list(games.values()),{'status':'ok','checkedAt':now.isoformat(),'lastSuccessAt':now.isoformat()}
    except Exception as exc:
        return previous.get('games',[]),{'status':'unavailable','checkedAt':now.isoformat(),'lastSuccessAt':previous.get('scheduleStatus',{}).get('lastSuccessAt'),'message':str(exc)[:140]}

def match_event(pick,article,games):
    from zoneinfo import ZoneInfo
    teams=names(pick.get('context',''))
    if len(teams)!=2:teams=names(article['title'])
    week_match=re.search(r'\bWeek\s+(\d+)\b',article['title'],re.I)
    if len(teams)!=2:
        teams=names(pick['selection'])
        # A lone team can be resolved only when the article explicitly identifies its week.
        if len(teams)!=1 or not week_match:return None
    published=dt.datetime.fromisoformat(article['publishedAt'])
    matches=[]
    for game in games:
        start=dt.datetime.fromisoformat(game['startAt'].replace('Z','+00:00'))
        if not set(teams).issubset(game['teams']):continue
        if week_match and int(week_match[1])!=game.get('week'):continue
        if pick.get('eventDate') and start.astimezone(ZoneInfo('America/New_York')).date().isoformat()!=pick['eventDate']:continue
        if article.get('timestampType')!='observed' and not -dt.timedelta(hours=3)<=start-published<=dt.timedelta(days=14):continue
        matches.append(game)
    return matches[0] if len(matches)==1 else None


def main():
    now=dt.datetime.now(UTC);path=ROOT/'data/picks.json'
    try:previous=json.loads(path.read_text())
    except (OSError,ValueError):previous={}
    sources=json.loads((ROOT/'sources.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda s:fetch_source(s,now,previous),[s for s in sources if s.get('enabled',True)]))
    articles={a['id']:a for rows,_ in results for a in rows}
    games,schedule_status=fetch_schedule(now,previous)
    for a in articles.values():
        for pick in a.get('picks',[]):pick['event']=match_event(pick,a,games)
        for parlay in a.get('parlays',[]):
            for leg in parlay['legs']:leg['event']=match_event(leg,a,games)
    statuses=[s for _,s in results];success=any(s['status']=='ok' for s in statuses)
    payload={'schemaVersion':1,'checkedAt':now.isoformat(),'lastSuccessfulUpdate':now.isoformat() if success else previous.get('lastSuccessfulUpdate'),'sources':statuses,'articles':sorted(articles.values(),key=lambda a:a['publishedAt'],reverse=True),'refreshMinutes':60,'games':games,'scheduleStatus':schedule_status}
    path.parent.mkdir(exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');os.replace(tmp,path)
    for s in statuses:print(f"{s['name']}: {s['status']} ({s['count']} articles)")
    print(f"Saved {len(articles)} NFL articles; {sum(len(a['picks']) for a in articles.values())} explicit selections")
    if not success:raise SystemExit('All feeds failed. Preserved available cached articles; inspect publisher status.')
if __name__=='__main__':main()
