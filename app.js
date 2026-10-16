'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
const TEAMS='Cardinals Falcons Ravens Bills Panthers Bears Bengals Browns Cowboys Broncos Lions Packers Texans Colts Jaguars Chiefs Raiders Chargers Rams Dolphins Vikings Patriots Saints Giants Jets Eagles Steelers 49ers Seahawks Buccaneers Titans Commanders'.split(' ');
function teamNames(s){return TEAMS.filter(t=>new RegExp('\\b'+t+'\\b','i').test(s))}
function parseSelection(raw,market){
 let american=null,contract=null;
 const bracket=raw.match(/\(\s*([+-]\s*\d{3,5})(?=\s|\/|\))/);
 if(bracket)american=Number(bracket[1].replace(/\s/g,''));
 if(!american&&market==='Moneyline'){const m=raw.match(/([+-]\s*\d{3,5})\b/);if(m)american=Number(m[1].replace(/\s/g,''))}
 if(american!==null&&Math.abs(american)<100)american=null;
 const cents=raw.match(/\b(\d{1,2})\s*¢/);if(cents&&!american)contract=Number(cents[1]);
 let label=raw.replace(/\([^)]*[+-]\s*\d{3,5}[^)]*\)/g,'').replace(/\s+vs\.?\s+.*$/i,'').replace(/\s+(?:at\s+)?\d{1,2}\s*¢.*$/i,'').trim();
 if(market==='Moneyline'&&american!==null)label=label.replace(new RegExp('[+-]\\s*'+Math.abs(american)+'\\b'),'').replace(/to win/i,'moneyline').trim();
 label=label.replace(/\s+/g,' ').replace(/[.,:]$/,'');
 return {label,american,contract};
}
function gcd(a,b){while(b){const t=b;b=a%b;a=t}return a}
function formatOdds(american,format){
 if(!Number.isFinite(american)||Math.abs(american)<100)return '—';
 if(format==='american')return american>0?'+'+american:String(american);
 const numerator=american>0?american:100,denominator=american>0?100:-american;
 if(format==='fractional'){const g=gcd(numerator,denominator);return numerator/g+'/'+denominator/g}
 return (1+numerator/denominator).toFixed(2);
}
function buildPicks(articles){
 return articles.flatMap(a=>(a.picks||[]).map((p,i)=>{
  const parsed=parseSelection(p.selection,p.market);
  let teams=teamNames(p.context||'');if(teams.length!==2)teams=teamNames(a.title);
  const matchup=teams.length===2?teams.join(' vs '):'';
  const normalized=parsed.label.toLowerCase().replace(/new york |los angeles |san francisco |buffalo |cleveland |atlanta |carolina |jacksonville /g,'');
  // Only combine selections with the same matchup, market and exact line/player.
  const groupKey=matchup?[matchup,p.market,normalized].join('|'):a.id+'|'+i;
  return {id:a.id+'-'+i,articleId:a.id,selection:p.selection,label:parsed.label,american:parsed.american,contract:parsed.contract,market:p.market,matchup,groupKey,author:a.author,publisher:a.publisher,sourceId:a.sourceId,url:a.url,publishedAt:a.publishedAt,publisherBest:/best\s+(?:bets|picks)|top\s+(?:bets|picks)/i.test(a.title),articleTitle:a.title};
 }));
}
function groupPicks(rows){
 const groups=new Map();
 for(const row of [...rows].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))){
  if(!groups.has(row.groupKey))groups.set(row.groupKey,{...row,bylines:new Set(),publisherBest:false});
  const group=groups.get(row.groupKey);group.bylines.add(row.author.toLowerCase());group.publisherBest=group.publisherBest||row.publisherBest;
 }
 return [...groups.values()].map(g=>({...g,support:g.bylines.size}));
}
function ranked(rows){return groupPicks(rows).sort((a,b)=>b.support-a.support||Number(b.publisherBest)-Number(a.publisherBest)||b.publishedAt.localeCompare(a.publishedAt))}
let data=null,allPicks=[],tab='best',chosenMarket='all',busy=false,offlineCopy=false,installPrompt=null;
let oddsFormat=readStore('ss-odds-format','decimal');if(!['decimal','american','fractional'].includes(oddsFormat))oddsFormat='decimal';
let saved=readStore('ss-saved-picks-v2',{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const stamp=s=>{if(!s)return 'Not available';const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available'};
const ageHours=s=>(Date.now()-new Date(s).getTime())/3600000;
function relative(s){const h=ageHours(s);if(!Number.isFinite(h))return 'Date unknown';if(h<1)return 'Just published';if(h<24)return Math.floor(h)+'h ago';return Math.floor(h/24)+'d ago'}
function notify(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').style.display='none',3500)}
function updateStatus(){
 const messages=[];if(!navigator.onLine||offlineCopy)messages.push('Offline edition');
 const overdue=!data?.lastSuccessfulUpdate||ageHours(data.lastSuccessfulUpdate)>3;
 if(data&&overdue)messages.push('Update overdue. Check Settings.');
 if(data?.sources.some(s=>s.status!=='ok'))messages.push('A source is unavailable.');
 $('#notice').hidden=!messages.length;$('#notice').textContent=messages.join(' · ');
 $('#freshness').textContent=data?.lastSuccessfulUpdate?'Updated '+stamp(data.lastSuccessfulUpdate):'No edition';$('#freshness').classList.toggle('stale',overdue||offlineCopy);
 $('#updateDetails').textContent=data?.lastSuccessfulUpdate?'Last feed update: '+stamp(data.lastSuccessfulUpdate):'No successful feed update.';
 $('#savedCount').textContent=Object.keys(saved).length;
 $('#sources').innerHTML=(data?.sources||[]).map(s=>'<div class="panel"><h2>'+esc(s.name)+'</h2><div class="status '+(s.status==='ok'?'':'bad')+'">'+(s.status==='ok'?'Connected':'Unavailable')+'</div><p>Last retrieved '+esc(stamp(s.lastSuccessAt))+'</p><a href="'+safeUrl(s.website)+'" target="_blank" rel="noopener noreferrer">Visit publisher ↗</a></div>').join('');
}
function setTab(next){tab=next;$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});render()}
function pickCard(p,index){
 const wasSaved=Boolean(saved[p.id]),old=ageHours(p.publishedAt)>48;
 const odds=p.american!==null&&p.american!==undefined?formatOdds(p.american,oddsFormat):p.contract?p.contract+'¢':'—';
 const oddsLabel=p.american!==null&&p.american!==undefined?oddsFormat:p.contract?'contract price':'not published';
 const sourceCount=p.support>1?p.support+' bylines agree':p.publisherBest?'Publisher best bets':relative(p.publishedAt);
 return '<article class="pick-card '+(tab==='best'&&index===0?'featured':'')+'"><div class="card-top"><span class="tag">'+esc(p.market)+(tab==='best'?'<span class="top-tag">TOP '+(index+1)+'</span>':'')+'</span><button class="save '+(wasSaved?'saved':'')+'" data-save="'+esc(p.id)+'" aria-label="'+(wasSaved?'Unsave pick':'Save pick')+'" aria-pressed="'+wasSaved+'">'+(wasSaved?'★':'☆')+'</button></div><div class="matchup">'+esc(p.matchup||'NFL · '+p.market)+'</div><div class="pick-main"><h2>'+esc(p.label)+'</h2><div class="odds '+(odds==='—'?'missing':'')+'"><strong>'+esc(odds)+'</strong><small>'+esc(oddsLabel)+'</small></div></div><div class="expert-row"><span class="avatar" aria-hidden="true">'+esc(p.author.split(/\s+/).slice(0,2).map(s=>s[0]).join(''))+'</span><div><div class="expert-name">'+esc(p.author)+'</div><div class="expert-publisher">'+esc(p.publisher)+'</div></div></div><div class="card-bottom"><span class="'+(old?'age':p.support>1?'support':'')+'" title="Published '+esc(stamp(p.publishedAt))+'">'+esc(old?'Older pick · '+relative(p.publishedAt):sourceCount)+'</span><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener noreferrer">Expert’s pick ↗</a></div></article>';
}
let visibleRows=[];
function render(){
 $('#board').hidden=tab==='settings';$('#settings').hidden=tab!=='settings';
 if(tab==='settings')return;
 $('#viewTitle').textContent=({best:'Best picks',all:'All picks',saved:'Saved picks'})[tab];$('#sortInfo').hidden=tab!=='best';$('#rangeLabel').hidden=tab!=='all';
 const query=$('#search').value.toLowerCase().trim(),days=tab==='best'?2:Number($('#range').value);
 let rows=tab==='saved'?Object.values(saved):allPicks;
 rows=rows.filter(p=>(tab==='saved'||ageHours(p.publishedAt)<=days*24)&&(chosenMarket==='all'||p.market===chosenMarket)&&(!query||[p.label,p.matchup,p.author,p.publisher].join(' ').toLowerCase().includes(query)));
 const selected=tab==='best'?ranked(rows):tab==='all'?groupPicks(rows).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)):rows.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 visibleRows=tab==='best'?selected.slice(0,6):selected;
 $('#resultCount').textContent=tab==='best'?'Top '+visibleRows.length+' · Past 48 hours':visibleRows.length+' pick'+(visibleRows.length===1?'':'s');
 $('#morePicks').hidden=tab!=='best'||!allPicks.length;
 if(visibleRows.length){$('#results').innerHTML=visibleRows.map(pickCard).join('');return}
 $('#results').innerHTML='<div class="empty"><h2>'+(tab==='saved'?'No saved picks yet.':'No picks in this view.')+'</h2>'+(tab==='saved'?'Tap a star to keep a pick here.':'Try All picks or clear your filters.')+(tab==='best'?'<br><button id="showAll">Browse all picks</button>':'')+'</div>';
}
function setChips(){$$('[data-market]').forEach(b=>{const active=b.dataset.market===chosenMarket;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))})}
async function load(manual=false){
 if(busy)return;busy=true;$('#refresh').disabled=true;
 try{
  const response=await fetch('./data/picks.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('Feed unavailable');
  const next=await response.json();if(next.schemaVersion!==1||!Array.isArray(next.articles)||!Array.isArray(next.sources))throw Error('Invalid feed');
  data=next;offlineCopy=!navigator.onLine||response.headers.get('X-Sunday-Signal-Cached')==='true';writeStore('ss-edition-v1',data);if(manual)notify('Checked the latest published edition.');
 }catch(error){
  data=data||readStore('ss-edition-v1',null);offlineCopy=true;
  if(!data){$('#results').innerHTML='<div class="empty"><h2>No edition loaded.</h2>Connect to the internet and check again.</div>';$('#resultCount').textContent='Offline';$('#freshness').textContent='Unavailable';return}
  if(manual)notify('Showing the last downloaded edition.');
 }finally{
  busy=false;$('#refresh').disabled=false;
  if(data){allPicks=buildPicks(data.articles);const oldSaved=readStore('ss-saved-v1',{});if(!readStore('ss-saved-migrated-v2',false)&&oldSaved&&typeof oldSaved==='object'){for(const p of buildPicks(Object.values(oldSaved)))saved[p.id]=p;writeStore('ss-saved-picks-v2',saved);writeStore('ss-saved-migrated-v2',true)}updateStatus();render()}
 }
}
$('#oddsFormat').value=oddsFormat;$('#oddsFormat').addEventListener('change',e=>{oddsFormat=e.target.value;writeStore('ss-odds-format',oddsFormat);render()});
$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$$('[data-market]').forEach(b=>b.addEventListener('click',()=>{chosenMarket=b.dataset.market;setChips();render()}));
$('#search').addEventListener('input',render);$('#range').addEventListener('change',render);$('#refresh').addEventListener('click',()=>load(true));
function showAll(){chosenMarket='all';$('#search').value='';$('#range').value='7';setChips();setTab('all')}
$('#morePicks').addEventListener('click',showAll);$('#sourceShortcut').addEventListener('click',()=>setTab('settings'));
$('#results').addEventListener('click',e=>{
 if(e.target.closest('#showAll'))showAll();
 const button=e.target.closest('[data-save]');if(!button)return;const id=button.dataset.save;
 if(saved[id])delete saved[id];else{const pick=visibleRows.find(p=>p.id===id);if(!pick)return;const {bylines,...plain}=pick;saved[id]=plain}
 if(!writeStore('ss-saved-picks-v2',saved))notify('Saved for this session. Device storage is unavailable.');$('#savedCount').textContent=Object.keys(saved).length;render();
});
$('#sortInfo').addEventListener('click',()=>$('#infoDialog').showModal());$('#closeInfo').addEventListener('click',()=>$('#infoDialog').close());
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installHint').textContent='Install for quick access and offline picks.'});
$('#install').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else notify('Use your browser menu → Install app or Add to Home Screen.')});
window.addEventListener('appinstalled',()=>notify('Sunday Signal installed.'));
window.addEventListener('online',()=>load());window.addEventListener('offline',updateStatus);
let lastVisibleCheck=Date.now();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastVisibleCheck>60000){lastVisibleCheck=Date.now();load()}});setInterval(()=>{if(!document.hidden)load()},300000);
// Reload on a new service worker so old cached JS cannot mix with the new layout.
if('serviceWorker' in navigator){let refreshing=false;const alreadyControlled=Boolean(navigator.serviceWorker.controller);navigator.serviceWorker.addEventListener('controllerchange',()=>{if(alreadyControlled&&!refreshing){refreshing=true;location.reload()}});navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update().catch(()=>{})).catch(()=>{})}
load();
