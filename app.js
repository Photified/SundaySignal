'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?esc(u.href):'#'}catch{return '#'}};
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
let data=null,tab='picks',chosenMarket='all',saved=readStore('ss-saved-v1',{}),busy=false,offlineCopy=false,installPrompt=null;
if(typeof saved!=='object'||!saved||Array.isArray(saved))saved={};
const stamp=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available'};
const ageHours=s=>(Date.now()-new Date(s).getTime())/3600000;
function notify(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').style.display='none',3500)}
function updateNotice(){
 const messages=[];
 if(!navigator.onLine||offlineCopy)messages.push('Offline / cached edition. Showing the last loaded articles.');
 if(data&&(!data.lastSuccessfulUpdate||ageHours(data.lastSuccessfulUpdate)>3))messages.push('The feed update is overdue. Check the Sources tab and your repository’s Actions page.');
 const failed=data?.sources?.filter(s=>s.status!=='ok')||[];
 if(failed.length)messages.push('A publisher feed is unavailable: '+failed.map(s=>s.name).join(', ')+'. Earlier articles may be retained.');
 $('#notice').textContent=messages.join(' ');$('#notice').hidden=!messages.length;
}
function updateStats(){
 const articles=data?.articles||[];
 $('#articleCount').textContent=articles.length;
 $('#expertCount').textContent=new Set(articles.map(a=>a.author)).size;
 $('#pickCount').textContent=articles.reduce((n,a)=>n+a.picks.length,0);
 $('#savedCount').textContent=Object.keys(saved).length;
 $('#lastUpdate').textContent=data?.lastSuccessfulUpdate?'Feed updated '+stamp(data.lastSuccessfulUpdate):'No successful update yet';
 $('#healthDot').style.background=(!navigator.onLine||!data?.lastSuccessfulUpdate||ageHours(data.lastSuccessfulUpdate)>3)?'#c79639':'#8cad55';
 const current=$('#publisher').value;
 $('#publisher').innerHTML='<option value="all">All publishers</option>'+(data?.sources||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
 if([...$('#publisher').options].some(o=>o.value===current))$('#publisher').value=current;
 updateNotice();
}
function setTab(next){tab=next;$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});render()}
function card(a){
 const old=ageHours(a.publishedAt)>48,wasSaved=Boolean(saved[a.id]);
 const picks=chosenMarket==='all'?a.picks:a.picks.filter(p=>p.market===chosenMarket);
 return '<article class="card"><div class="card-top"><span class="publisher-label">'+esc(a.publisher)+'</span><button class="save '+(wasSaved?'saved':'')+'" data-save="'+esc(a.id)+'" aria-label="'+(wasSaved?'Remove saved article':'Save article')+'" aria-pressed="'+wasSaved+'">'+(wasSaved?'★':'☆')+'</button></div><h3><a href="'+safeUrl(a.url)+'" target="_blank" rel="noopener noreferrer">'+esc(a.title)+'</a></h3><div class="byline"><span class="avatar" aria-hidden="true">'+esc(a.author.split(/\s+/).slice(0,2).map(s=>s[0]).join(''))+'</span><div><div class="author">'+esc(a.author)+'</div><div class="published">Published '+esc(stamp(a.publishedAt))+'</div></div></div>'+(picks.length?'<div class="picks">'+picks.map(p=>'<div class="pick"><small>'+esc(p.market)+' · source selection</small>'+(p.context?'<span class="pick-context">'+esc(p.context)+'</span>':'')+'<b>'+esc(p.selection)+'</b></div>').join('')+'</div>':'<p class="analysis-label">NFL betting analysis. Read the source for the full picks and reasoning.</p>')+'<div class="card-bottom"><span class="'+(old?'age':'')+'">'+(old?'Older article · verify game date':'Article lines · verify kickoff')+'</span><a href="'+safeUrl(a.url)+'" target="_blank" rel="noopener noreferrer">Read source ↗</a></div></article>';
}
function render(){
 $('#filters').hidden=tab==='sources';
 $('#viewTitle').textContent=({picks:'The latest expert picks',analysis:'The NFL reading list',saved:'Your saved reading list',sources:'Behind the signal'})[tab];
 if(tab==='sources'){
   $('#resultCount').textContent=(data?.sources?.length||0)+' publishers';
   $('#results').innerHTML=(data?.sources||[]).map(s=>'<article class="source-card"><h3>'+esc(s.name)+'</h3><span class="source-status '+(s.status==='ok'?'':'bad')+'">'+(s.status==='ok'?'Feed connected':'Feed unavailable')+'</span><p>'+esc(s.count)+' recent NFL articles · Checked '+esc(stamp(s.checkedAt))+'<br>Last successful retrieval: '+esc(stamp(s.lastSuccessAt))+'</p><p>'+esc(s.message)+'</p><a href="'+safeUrl(s.website)+'" target="_blank" rel="noopener noreferrer">Visit publisher ↗</a></article>').join('')+'<article class="source-card"><h3>What makes it onto the board?</h3><p>Only recent NFL betting articles from the configured publisher RSS feeds. A selection appears when a short, explicit pick label or selection heading can be read from the feed. We show up to three selections per article; the original may contain more. Articles without an extractable selection appear under All analysis.</p><p>The listed author is the article byline. Individual guest picks may be attributed differently within a roundtable article. Open the source to confirm. No picks are generated by AI, no paywalls are bypassed, and article lines are not live sportsbook odds.</p><p>Hourly updates run through GitHub Actions. Publisher feed changes, GitHub delays or disabled workflows can interrupt updates. Check this page for source health. Sources can be edited in sources.json.</p></article>';
   return;
 }
 let articles=tab==='saved'?Object.values(saved):data?.articles||[];
 if(tab==='saved')articles=articles.map(a=>(data?.articles||[]).find(n=>n.id===a.id)||a);
 const query=$('#search').value.toLowerCase().trim(),publisher=$('#publisher').value,days=Number($('#range').value);
 articles=articles.filter(a=>
 (tab!=='picks'||a.picks.length>0)&&
 (tab==='saved'||ageHours(a.publishedAt)<=days*24)&&
 (publisher==='all'||a.sourceId===publisher)&&
 (chosenMarket==='all'||a.markets.includes(chosenMarket))&&
 (!query||[a.title,a.author,a.publisher,...a.picks.map(p=>p.selection)].join(' ').toLowerCase().includes(query))
 ).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 $('#resultCount').textContent=articles.length+' article'+(articles.length===1?'':'s');
 if(articles.length){$('#results').innerHTML=articles.map(card).join('');return}
 const heading=tab==='saved'?'Build your own reading list.':'No articles in this view.';
 const text=tab==='saved'?'Tap the star on any article to keep it here. Saved articles remain available on this device.':'Try another bet type, publisher, or date range. In the offseason, fewer NFL picks are published.';
 $('#results').innerHTML='<div class="empty"><h3>'+heading+'</h3>'+text+(tab==='saved'?'':'<br><button id="resetFilters">Reset filters</button>')+'</div>';
}
function resetFilters(){chosenMarket='all';$('#search').value='';$('#publisher').value='all';$('#range').value='7';setChips();render()}
function setChips(){$$('[data-market]').forEach(b=>{const active=b.dataset.market===chosenMarket;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))})}
async function load(manual=false){
 if(busy)return;busy=true;$('#refresh').disabled=true;
 try{
   const response=await fetch('./data/picks.json?t='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('Feed unavailable');
   const next=await response.json();
   if(next.schemaVersion!==1||!Array.isArray(next.articles)||!Array.isArray(next.sources))throw Error('Invalid feed');
   data=next;offlineCopy=!navigator.onLine||response.headers.get('X-Sunday-Signal-Cached')==='true';writeStore('ss-edition-v1',data);
   if(manual)notify('Checked the published edition. Feed updated '+stamp(data.lastSuccessfulUpdate)+'.');
 }catch(error){
   data=data||readStore('ss-edition-v1',null);offlineCopy=true;
   if(!data){$('#results').innerHTML='<div class="empty"><h3>The feed is not available yet.</h3>Connect to the internet and try again. On a new repository, run “Update NFL picks and deploy” in GitHub Actions.</div>';$('#resultCount').textContent='No edition loaded';$('#lastUpdate').textContent='Could not load an edition';return}
   if(manual)notify('Could not reach the latest edition. Showing cached articles.');
 }finally{busy=false;$('#refresh').disabled=false;if(data){updateStats();render()}}
}
$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$$('[data-market]').forEach(b=>b.addEventListener('click',()=>{chosenMarket=b.dataset.market;setChips();render()}));
$('#search').addEventListener('input',render);$('#publisher').addEventListener('change',render);$('#range').addEventListener('change',render);
$('#refresh').addEventListener('click',()=>load(true));$('#sourcesLink').addEventListener('click',e=>{e.preventDefault();setTab('sources')});
$('#results').addEventListener('click',e=>{
 const button=e.target.closest('[data-save]');
 if(e.target.closest('#resetFilters'))resetFilters();
 if(!button)return;
 const id=button.dataset.save;
 if(saved[id])delete saved[id];else{const article=data?.articles.find(a=>a.id===id);if(!article)return;saved[id]=article}
 if(!writeStore('ss-saved-v1',saved))notify('Device storage unavailable. Saved for this session only.');
 $('#savedCount').textContent=Object.keys(saved).length;render();
});
$('#help').addEventListener('click',()=>$('#helpDialog').showModal());$('.close').addEventListener('click',()=>$('#helpDialog').close());
$('#helpDialog').addEventListener('click',e=>{if(e.target===$('#helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false});
$('#install').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install').hidden=true});
window.addEventListener('appinstalled',()=>{$('#install').hidden=true;notify('Sunday Signal is installed.')});
window.addEventListener('online',()=>load());window.addEventListener('offline',()=>{updateStats()});
let lastVisibleCheck=Date.now();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastVisibleCheck>60000){lastVisibleCheck=Date.now();load()}});
setInterval(()=>{if(!document.hidden)load()},5*60*1000);
$('#year').textContent=new Date().getFullYear();$('#seasonLabel').textContent='NFL · '+new Date().getFullYear()+' and beyond';$('#savedCount').textContent=Object.keys(saved).length;
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(reg=>{reg.update().catch(()=>{});reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)notify('An app update is ready. Reopen the app to load it.')})})}).catch(()=>{});
load();
