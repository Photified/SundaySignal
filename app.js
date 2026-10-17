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
function isNamed(author){return Boolean(author)&&!/(?:staff|editorial|team|model|predictive|artificial|\bAI\b)/i.test(author)}
function selectionIdentity(label,market,player){
 if(market==='Props'&&player?.athleteId){
  const text=label.toLowerCase().replace(/\btds?\b/g,'touchdowns'),direction=text.match(/\b(over|under)\s*(\d+(?:\.\d+)?)/);
  let stat=null;const stats=[['passing yards',/passing yards/],['rushing yards',/rushing yards/],['receiving yards',/receiving yards/],['receptions',/receptions/],['passing touchdowns',/passing touchdowns/],['pass attempts',/pass(?:ing)? attempts/],['completions',/completions/],['interceptions',/interceptions/],['sacks',/sacks?/]];
  for(const [name,pattern] of stats)if(pattern.test(text)){stat=name;break}
  const base='player:'+player.athleteId+':';
  if(stat&&direction){const total=Number(direction[2]),side=direction[1];return {key:base+stat+':'+side+':'+total,family:base+stat,comparison:base+stat+':'+total,side}}
  const td=/first (?:touchdown|touchdowns)/.test(text)?'first touchdown':/anytime (?:touchdown|touchdowns)/.test(text)?'anytime touchdown':null;
  if(td)return {key:base+td,family:base+td,comparison:base+td,side:'yes'};
 }

 const teams=teamNames(label),line=label.match(/([+-]\d+(?:\.\d+)?)/),direction=label.match(/\b(over|under)\s*(\d+(?:\.\d+)?)/i);
 if(market==='Spread'&&teams.length===1&&line)return {key:teams[0]+' '+Number(line[1]),family:'spread',comparison:'spread:'+Math.abs(Number(line[1])),side:teams[0]};
 if(market==='Moneyline'&&teams.length===1)return {key:teams[0],family:'moneyline',comparison:'moneyline',side:teams[0]};
 if(market==='Totals'&&direction){const target=teams.length===1?teams[0]:'game';return {key:target+':'+direction[1].toLowerCase()+':'+Number(direction[2]),family:'total:'+target,comparison:'total:'+target+':'+Number(direction[2]),side:direction[1].toLowerCase()}}
 const normalized=label.toLowerCase().replace(/[^a-z0-9.+-]+/g,' ').trim();return {key:normalized,family:normalized,comparison:normalized,side:normalized};
}
function buildPicks(articles){
 return articles.flatMap(a=>(a.picks||[]).map((p,i)=>{
  const parsed=parseSelection(p.selection,p.market),identity=selectionIdentity(parsed.label,p.market,p.player);
  const event=p.event||null;let teams=teamNames(p.context||'');if(teams.length!==2)teams=teamNames(a.title);
  const matchup=event?event.matchup.replace(' at ',' @ '):teams.length===2?teams.join(' vs '):'';
  const id=a.id+'-'+i,scope=event?.id||id;
  return {id,articleId:a.id,selection:p.selection,label:parsed.label,american:parsed.american,contract:parsed.contract,market:p.market,matchup,event,groupKey:scope+'|'+p.market+'|'+identity.key,familyKey:scope+'|'+p.market+'|'+identity.family,comparisonKey:scope+'|'+p.market+'|'+identity.comparison,side:identity.side,author:a.author,publisher:a.publisher,sourceId:a.sourceId,url:a.url,publishedAt:a.publishedAt,observedAt:a.observedAt,timestampType:a.timestampType||'published',articleTitle:a.title};
 }));
}
function voteTime(p){return p.observedAt||p.publishedAt}
function groupPicks(rows){
 const groups=new Map(),seenAnalysts=new Set();
 for(const row of [...rows].sort((a,b)=>voteTime(b).localeCompare(voteTime(a)))){
  const nameKey=row.author.toLowerCase().trim(),named=isNamed(row.author);
  // One current vote per named analyst and game/market. Reposts do not add votes.
  const analystKey=row.familyKey+'|'+nameKey;
  if(named&&seenAnalysts.has(analystKey))continue;
  if(named)seenAnalysts.add(analystKey);
  const groupKey=named?row.groupKey:row.id;
  if(!groups.has(groupKey))groups.set(groupKey,{...row,supporters:[],contributors:[]});
  const group=groups.get(groupKey);group.contributors.push(row);if(named)group.supporters.push(row);
 }
 const list=[...groups.values()];
 return list.map(g=>({...g,support:g.supporters.length,publisherCount:new Set(g.supporters.map(p=>p.sourceId)).size,opponents:list.filter(o=>o.comparisonKey===g.comparisonKey&&o.side!==g.side).flatMap(o=>o.supporters)}));
}
function ranked(rows){return groupPicks(rows).sort((a,b)=>b.publisherCount-a.publisherCount||(b.support-b.opponents.length)-(a.support-a.opponents.length)||b.support-a.support||b.publishedAt.localeCompare(a.publishedAt))}
function propCategory(label){if(/touchdown|\btds?\b|scorer/i.test(label))return 'touchdown';if(/passing|pass attempts|completions|interceptions/i.test(label))return 'passing';if(/rushing|rush attempts|carries/i.test(label))return 'rushing';if(/receiving|receptions/i.test(label))return 'receiving';return 'other'}
function upcoming(p){return p.event&&p.event.state==='pre'&&new Date(p.event.startAt).getTime()>Date.now()}
function buildParlays(articles){return articles.flatMap(a=>(a.parlays||[]).map((p,i)=>({...p,id:a.id+'-parlay-'+i,author:a.author,publisher:a.publisher,url:a.url,publishedAt:a.publishedAt,title:a.title,sourceId:a.sourceId})))}
let data=null,allPicks=[],allParlays=[],tab='best',chosenMarket='all',busy=false,offlineCopy=false,installPrompt=null;
let oddsFormat=readStore('ss-odds-format','decimal');if(!['decimal','american','fractional'].includes(oddsFormat))oddsFormat='decimal';
let mutedPublishers=readStore('ss-muted-publishers-v1',[]);if(!Array.isArray(mutedPublishers))mutedPublishers=[];
function follows(p){return !mutedPublishers.includes(p.sourceId||p.id)}
let saved=readStore('ss-saved-picks-v2',{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
const stamp=s=>{if(!s)return 'Not available';const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available'};
const ageHours=s=>(Date.now()-new Date(s).getTime())/3600000;
function relative(s){const h=ageHours(s);if(!Number.isFinite(h))return 'Date unknown';if(h<1)return 'Just published';if(h<24)return Math.floor(h)+'h ago';return Math.floor(h/24)+'d ago'}
function notify(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').style.display='none',3500)}
function scheduleFresh(){return data?.scheduleStatus?.status==='ok'&&ageHours(data.scheduleStatus.lastSuccessAt)<3}
function sourceReady(p){return data?.sources?.find(s=>s.id===p.sourceId)?.status==='ok'}
function updateStatus(){
 const messages=[];if(!navigator.onLine||offlineCopy)messages.push('Offline edition');
 const overdue=!data?.lastSuccessfulUpdate||ageHours(data.lastSuccessfulUpdate)>3;
 if(data&&overdue)messages.push('Update overdue. Check Publishers.');
 if(data?.sources.some(s=>s.status!=='ok'))messages.push('A source is unavailable.');
 if(data?.rosterStatus==='unavailable')messages.push('Player matching is unavailable. Some props may be missing.');
 if(data&&!scheduleFresh())messages.push('Schedule needs an update. Upcoming recommendations are paused.');
 $('#coverage').textContent=data?new Set(allPicks.filter(p=>follows(p)&&isNamed(p.author)).map(p=>p.author.toLowerCase())).size+' analysts · '+data.sources.filter(s=>follows(s)).length+' publishers followed':'Loading analysts…';
 $('#notice').hidden=!messages.length;$('#notice').textContent=messages.join(' · ');
 $('#freshness').textContent=data?.lastSuccessfulUpdate?'Updated '+stamp(data.lastSuccessfulUpdate):'No edition';$('#freshness').classList.toggle('stale',overdue||offlineCopy);
 $('#updateDetails').textContent=data?.lastSuccessfulUpdate?'Last feed update: '+stamp(data.lastSuccessfulUpdate):'No successful feed update.';
 $('#savedCount').textContent=Object.keys(saved).length;
 $('#sources').innerHTML=(data?.sources||[]).map(s=>{const selected=follows(s),count=allPicks.filter(p=>p.sourceId===s.id).length,analysts=new Set(allPicks.filter(p=>p.sourceId===s.id&&isNamed(p.author)).map(p=>p.author.toLowerCase())).size;return '<div class="panel publisher-card '+(selected?'is-followed':'')+'"><div class="publisher-top"><span class="publisher-mark">'+esc(s.name.split(' ').map(w=>w[0]).slice(0,2).join(''))+'</span><button class="follow-button" data-follow="'+esc(s.id)+'" aria-pressed="'+selected+'" aria-label="'+(selected?'Unfollow ':'Follow ')+esc(s.name)+'">'+(selected?'Following':'Follow')+'</button></div><h2>'+esc(s.name)+'</h2><p>'+count+' picks · '+analysts+' named analysts</p><div class="publisher-bottom"><span class="status '+(s.status==='ok'?'':'bad')+'">'+(s.status==='ok'?'Connected':'Unavailable')+'</span><a href="'+safeUrl(s.website)+'" target="_blank" rel="noopener noreferrer">Visit ↗</a></div><small>Last retrieved '+esc(stamp(s.lastSuccessAt))+'</small></div>'}).join('');
}
function setTab(next){tab=next;$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});render()}
function kickoff(p){if(!p.event)return 'Kickoff unverified';if(p.event.state==='post')return 'Final';if(p.event.state==='in'||new Date(p.event.startAt).getTime()<=Date.now())return 'Started';return new Date(p.event.startAt).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})}
function oddsChip(p){const value=p.american!==null&&p.american!==undefined?formatOdds(p.american,oddsFormat):p.contract?p.contract+'¢':'—';return '<span class="odds '+(value==='—'?'missing':'')+'" title="'+esc(value==='—'?'Price not published':p.contract&&!p.american?'Prediction contract price':'Article price; verify current odds')+'">'+esc(value)+'</span>'}
function contributorRows(rows){return rows.map(p=>'<a class="contributor" href="'+safeUrl(p.url)+'" target="_blank" rel="noopener noreferrer"><span><b>'+esc(p.author)+'</b><small>'+esc(p.publisher)+' · '+(p.timestampType==='observed'?'Checked ':'Published ')+esc(stamp(voteTime(p)))+'</small></span><span>'+esc(p.label)+' ↗</span></a>').join('')}
function pickCard(p,index){
 const wasSaved=Boolean(saved[p.id]);const supporters=p.supporters||[p],opponents=p.opponents||[],support=p.support??(isNamed(p.author)?1:0),sourceCount=p.publisherCount||1;
 const agreement=support>=2?support+' analysts agree':support===1?'1 analyst':'Publisher selection';
 return '<article class="pick-card '+(support>=2?'consensus':'')+'"><div class="card-top"><span class="tag">'+esc(p.market)+'</span><button class="save '+(wasSaved?'saved':'')+'" data-save="'+esc(p.id)+'" aria-label="'+(wasSaved?'Unsave pick':'Save pick')+'" aria-pressed="'+wasSaved+'">'+(wasSaved?'★':'☆')+'</button></div><div class="matchup">'+esc(p.matchup||'NFL')+'<span>'+esc(kickoff(p))+'</span></div><div class="pick-main"><h2>'+esc(p.label)+'</h2>'+oddsChip(p)+'</div><div class="agreement"><span class="avatar-stack">'+supporters.slice(0,3).map(c=>'<span class="avatar" title="'+esc(c.author)+'">'+esc(c.author.split(/\s+/).slice(0,2).map(n=>n[0]).join(''))+'</span>').join('')+'</span><div><b>'+agreement+'</b><small>'+sourceCount+' source'+(sourceCount===1?'':'s')+(opponents.length?' · '+opponents.length+' on the other side':'')+'</small></div></div><details class="backers"><summary>'+(support>=2?'See who agrees':'View expert')+'<span>＋</span></summary><div class="backer-body">'+contributorRows(supporters.length?supporters:p.contributors||[p])+(opponents.length?'<div class="other-side">Other side, same line</div>'+contributorRows(opponents):'')+'<p>Agreement among tracked analysts at this exact line. It is not a probability of winning.</p></div></details></article>';
}
function parlayCard(p){
 const starts=p.legs.map(l=>l.event?.startAt).filter(Boolean).sort();const verified=p.legs.every(l=>l.event),active=verified&&p.legs.every(upcoming);
 const status=active?'Upcoming':verified?'Started / finished':'Kickoffs unverified';
 return '<article class="pick-card parlay-card"><div class="card-top"><span class="tag">'+p.legs.length+'-LEG PARLAY</span><span class="parlay-status">'+status+'</span></div><div class="parlay-heading"><h2>'+esc(p.label==='Expert parlay'?'Expert parlay':p.label.replace(/^Early NFL Week \d+ /,''))+'</h2><span class="odds">'+esc(formatOdds(p.americanOdds,oddsFormat))+'</span></div><ol class="legs">'+p.legs.map(l=>{const x=parseSelection(l.selection,l.market);return '<li><b>'+esc(x.label)+'</b><small>'+esc(l.event?l.event.matchup.replace(' at ',' @ '):'Matchup unverified')+'</small></li>'}).join('')+'</ol><div class="parlay-author"><b>'+esc(p.author)+'</b><span>'+esc(p.publisher)+'</span></div><div class="card-bottom"><span>'+esc(relative(p.publishedAt))+'</span><a href="'+safeUrl(p.url)+'" target="_blank" rel="noopener noreferrer">View expert’s parlay ↗</a></div></article>';
}
let visibleRows=[];
function render(){
 $('#board').hidden=tab==='settings';$('#settings').hidden=tab!=='settings';if(tab==='settings')return;
 $('#viewTitle').textContent=({best:'The consensus',all:'Explore picks',props:'Player props',parlays:'Expert parlays',saved:'Your saved picks'})[tab];
 $('#sortInfo').hidden=tab!=='best';$('#rangeLabel').hidden=tab!=='all'&&tab!=='parlays'&&tab!=='props';$('#marketFilters').hidden=tab==='parlays'||tab==='props';$('#propCategoryLabel').hidden=tab!=='props';
 const query=$('#search').value.toLowerCase().trim(),mode=$('#range').value;
 const match=p=>!query||[p.label,p.matchup,p.author,p.publisher,p.title].join(' ').toLowerCase().includes(query);
 if(tab==='parlays'){
  const rows=allParlays.filter(p=>follows(p)&&match({...p,label:p.legs.map(l=>l.selection).join(' ')})&&(mode==='recent'||(scheduleFresh()&&sourceReady(p)&&p.legs.every(upcoming)))).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  visibleRows=[];$('#resultCount').textContent=rows.length+' published parlays';$('#morePicks').hidden=true;
  $('#results').innerHTML=rows.length?rows.map(parlayCard).join(''):'<div class="empty"><h2>No verified upcoming parlays yet.</h2>Choose Recent to browse earlier expert parlays.</div>';return;
 }
 let rows=tab==='saved'?Object.values(saved):allPicks.filter(follows);
 rows=rows.filter(p=>(tab==='props'?p.market==='Props'&&( $('#propCategory').value==='all'||propCategory(p.label)===$('#propCategory').value):(chosenMarket==='all'||p.market===chosenMarket))&&(tab==='saved'||(tab==='best'?(scheduleFresh()&&upcoming(p)&&sourceReady(p)):(mode==='recent'||upcoming(p)))));
 const grouped=(tab==='saved'?rows:ranked(rows)).filter(p=>match(p)||(p.contributors||[]).some(match));
 const selected=tab==='best'?grouped.filter(p=>p.support>=2&&p.support>p.opponents.length):grouped;
 visibleRows=tab==='best'?selected.slice(0,9):selected;
 $('#resultCount').textContent=tab==='best'?selected.length+' picks with agreement':visibleRows.length+(tab==='props'?' player props':' picks');$('#morePicks').hidden=tab!=='best';
 if(visibleRows.length){$('#results').innerHTML=visibleRows.map(pickCard).join('');return}
 $('#results').innerHTML='<div class="empty"><h2>'+(tab==='saved'?'No saved picks yet.':tab==='best'?'No consensus in this view.':tab==='props'?'No upcoming props in this view.':'No picks in this view.')+'</h2>'+(tab==='saved'?'Tap a star to save a pick.':tab==='best'?'Requires two named analysts, the same line, and an upcoming game.':'Try another market or choose Recent.')+(tab==='best'?'<br><button id="showAll">Explore individual picks</button>':'')+'</div>';
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
  if(data){allPicks=buildPicks(data.articles);allParlays=buildParlays(data.articles);const oldSaved=readStore('ss-saved-v1',{});if(!readStore('ss-saved-migrated-v2',false)&&oldSaved&&typeof oldSaved==='object'){for(const p of buildPicks(Object.values(oldSaved)))saved[p.id]=p;writeStore('ss-saved-picks-v2',saved);writeStore('ss-saved-migrated-v2',true)}const currentGroups=groupPicks(allPicks);for(const key of Object.keys(saved)){const fresh=currentGroups.find(p=>p.contributors.some(c=>c.id===key));if(fresh)saved[key]={...fresh,id:key}}updateStatus();render()}
 }
}
$('#sources').addEventListener('click',e=>{const button=e.target.closest('[data-follow]');if(!button)return;const id=button.dataset.follow;if(mutedPublishers.includes(id))mutedPublishers=mutedPublishers.filter(x=>x!==id);else mutedPublishers.push(id);if(!writeStore('ss-muted-publishers-v1',mutedPublishers))notify('Preference saved for this session only.');updateStatus();render()});
$('#oddsFormat').value=oddsFormat;$('#oddsFormat').addEventListener('change',e=>{oddsFormat=e.target.value;writeStore('ss-odds-format',oddsFormat);render()});
$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$$('[data-market]').forEach(b=>b.addEventListener('click',()=>{chosenMarket=b.dataset.market;setChips();render()}));
$('#propCategory').addEventListener('change',render);$('#search').addEventListener('input',render);$('#range').addEventListener('change',render);$('#refresh').addEventListener('click',()=>load(true));
function showAll(){chosenMarket='all';$('#search').value='';$('#range').value='upcoming';setChips();setTab('all')}
$('#morePicks').addEventListener('click',showAll);$('#sourceShortcut').addEventListener('click',()=>setTab('settings'));
$('#results').addEventListener('click',e=>{
 if(e.target.closest('#showAll'))showAll();
 const button=e.target.closest('[data-save]');if(!button)return;const id=button.dataset.save;
 if(saved[id])delete saved[id];else{const pick=visibleRows.find(p=>p.id===id);if(!pick)return;const {bylines,...plain}=pick;saved[id]=plain}
 if(!writeStore('ss-saved-picks-v2',saved))notify('Saved for this session. Device storage is unavailable.');$('#savedCount').textContent=Object.keys(saved).length;render();
});
$('#sortInfo').addEventListener('click',()=>$('#infoDialog').showModal());$('#closeInfo').addEventListener('click',()=>$('#infoDialog').close());
let installedThisSession=false;
function standaloneMode(){return Boolean(window.matchMedia?.('(display-mode: standalone)').matches||window.matchMedia?.('(display-mode: fullscreen)').matches||navigator.standalone)}
function updateInstallUI(){
 const button=$('#install'),hint=$('#installHint');
 if(standaloneMode()){button.textContent='Installed';button.disabled=true;hint.textContent='You are using the installed app.';return}
 button.disabled=false;
 if(installedThisSession){button.textContent='Open from your apps';hint.textContent='Installation accepted. Open Sunday Signal from your phone’s apps or home screen.';return}
 if(installPrompt){button.textContent='Install Sunday Signal';hint.textContent='Install to open Sunday Signal in its own app window.';return}
 button.textContent='How to install';hint.textContent=/iPad|iPhone|iPod/.test(navigator.userAgent||'')?'In Safari, tap Share → Add to Home Screen.':'In Chrome, use the menu → Add to Home screen. If it says “already installed”, choose that option to open the app. “Create shortcut” opens a browser tab.';
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installedThisSession=false;updateInstallUI()});
$('#install').addEventListener('click',async()=>{
 if(!installPrompt){updateInstallUI();notify(installedThisSession?'Open Sunday Signal from your phone’s apps or home screen.':$('#installHint').textContent);return}
 const prompt=installPrompt;installPrompt=null;
 try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')installedThisSession=true}
 catch{notify('Use your browser menu to install or open the existing app.')}
 updateInstallUI();
});
window.addEventListener('appinstalled',()=>{installedThisSession=true;installPrompt=null;updateInstallUI();notify('Installed. Open Sunday Signal from your apps.')});
window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',updateInstallUI);
updateInstallUI();
window.addEventListener('online',()=>load());window.addEventListener('offline',updateStatus);
let lastVisibleCheck=Date.now();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastVisibleCheck>60000){lastVisibleCheck=Date.now();load()}});setInterval(()=>{if(!document.hidden)load()},300000);
// Reload on a new service worker so old cached JS cannot mix with the new layout.
if('serviceWorker' in navigator){let refreshing=false;const alreadyControlled=Boolean(navigator.serviceWorker.controller);navigator.serviceWorker.addEventListener('controllerchange',()=>{if(alreadyControlled&&!refreshing){refreshing=true;location.reload()}});navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update().catch(()=>{})).catch(()=>{})}
load();
