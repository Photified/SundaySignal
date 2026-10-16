const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),script=fs.readFileSync(path.join(root,'app.js'),'utf8');
const elements=new Map();function element(){return{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,style:{},events:{},classList:{toggle(){}},setAttribute(){},addEventListener(k,fn){this.events[k]=fn},showModal(){this.open=true},close(){this.open=false}}}
for(const match of html.matchAll(/id="([^"]+)"/g))elements.set('#'+match[1],element());
elements.get('#range').value='upcoming';elements.get('#propCategory').value='all';
const tabs=['best','props','all','parlays','saved','settings'].map(tab=>({...element(),dataset:{tab}}));const markets=['all','Spread','Moneyline','Totals','Props'].map(market=>({...element(),dataset:{market}}));
const store=new Map(),edition=JSON.parse(fs.readFileSync(path.join(root,'data/picks.json'),'utf8'));
let resolveFetch;const responsePromise=new Promise(r=>resolveFetch=r);
const ctx={console,URL,Date,Set,Map,Promise,location:{reload(){}},navigator:{onLine:true},document:{hidden:false,querySelector:s=>{assert(elements.has(s),'Missing DOM target '+s);return elements.get(s)},querySelectorAll:s=>s==='[data-tab]'?tabs:markets,addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout(){return 1},clearTimeout(){},setInterval(){},fetch:()=>responsePromise};
vm.createContext(ctx);vm.runInContext(script,ctx);resolveFetch({ok:true,json:async()=>edition,headers:{get:()=>null}});
setTimeout(()=>{
 assert.equal(elements.get('#oddsFormat').value,'decimal');
 const cards=elements.get('#results').innerHTML;assert(cards.includes('analysts agree'));assert(cards.includes('See who agrees'));assert(!cards.includes('<small>decimal</small>'));
 tabs.find(b=>b.dataset.tab==='parlays').events.click();assert(elements.get('#results').innerHTML.includes('LEG PARLAY'));assert(elements.get('#results').innerHTML.includes('Steve Krebs'));
 tabs.find(b=>b.dataset.tab==='all').events.click();assert(elements.get('#results').innerHTML.includes('pick-card'));
 elements.get('#oddsFormat').events.change({target:{value:'american'}});assert.equal(JSON.parse(store.get('ss-odds-format')),'american');
 tabs.find(b=>b.dataset.tab==='settings').events.click();assert.equal(elements.get('#settings').hidden,false);assert.equal(elements.get('#board').hidden,true);assert(elements.get('#sources').innerHTML.includes('CBS Sports'));assert(elements.get('#sources').innerHTML.includes('Covers'));
 tabs.find(b=>b.dataset.tab==='props').events.click();assert.equal(elements.get('#viewTitle').textContent,'Player props');assert(elements.get('#results').innerHTML.includes('pick-card'));assert(!elements.get('#results').innerHTML.includes('49ers -7.5'));
 elements.get('#propCategory').value='touchdown';elements.get('#propCategory').events.change();assert(elements.get('#results').innerHTML.includes('TD'));elements.get('#propCategory').value='all';
 const toggle=id=>elements.get('#sources').events.click({target:{closest:()=>({dataset:{follow:id}})}});
 toggle('cbs');assert(JSON.parse(store.get('ss-muted-publishers-v1')).includes('cbs'));assert.equal(vm.runInContext("allPicks.filter(follows).some(p=>p.sourceId==='cbs')",ctx),false);
 for(const source of edition.sources.filter(s=>s.id!=='cbs'))toggle(source.id);
 tabs.find(b=>b.dataset.tab==='all').events.click();assert(!elements.get('#results').innerHTML.includes('pick-card'));
 tabs.find(b=>b.dataset.tab==='parlays').events.click();assert(!elements.get('#results').innerHTML.includes('LEG PARLAY'));
 toggle('cbs');assert.equal(vm.runInContext("allPicks.filter(follows).every(p=>p.sourceId==='cbs')",ctx),true);
 console.log('App integration passed: load, consensus cards, parlay tab, odds preference, sources and settings.');
},20);
