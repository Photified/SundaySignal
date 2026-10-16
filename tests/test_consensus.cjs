const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ctx={document:{querySelector(){},querySelectorAll(){return[]}}};vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf('let data=null')),ctx);
const event={id:'game1',startAt:'2099-10-18T17:00Z',state:'pre',matchup:'Bears at Falcons'};
function article(id,author,selection,sourceId='a',when='2026-10-16T12:00:00Z',game=event){return{id,author,title:'NFL picks',publishedAt:when,publisher:sourceId,sourceId,url:'https://example.com/'+id,picks:[{selection,market:'Spread',context:'Bears vs Falcons',event:game}]}}
function grouped(articles){return ctx.ranked(ctx.buildPicks(articles))}
let groups=grouped([article('1','Expert One','Falcons +3.5 (-110)'),article('2','Expert Two','Atlanta Falcons +3.5 (-105)','b')]);assert.equal(groups.length,1);assert.equal(groups[0].support,2);assert.equal(groups[0].publisherCount,2);assert.equal(groups[0].supporters.length,2);
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Expert One','Falcons +3.5','b')]);assert.equal(groups[0].support,1);
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Expert Two','Falcons +1.5')]);assert.equal(groups.length,2);
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Expert Two','Bears -3.5')]);assert.equal(groups[0].opponents.length,1);
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Expert Two','Bears -1.5')]);assert.equal(groups[0].opponents.length,0);
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Expert One','Falcons +1.5','a','2026-10-16T14:00:00Z')]);assert.equal(groups.length,1);assert.equal(groups[0].label,'Falcons +1.5');
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Editorial Staff','Falcons +3.5')]);assert.equal(groups.filter(g=>g.support>=2).length,0);
groups=grouped([article('1','Expert One','Falcons +3.5'),article('2','Expert Two','Falcons +3.5','a','2026-10-16T12:00:00Z',{...event,id:'game2'})]);assert.equal(groups.length,2);
assert.equal(ctx.upcoming({event}),true);assert.equal(ctx.upcoming({event:{...event,state:'post'}}),false);assert.equal(Boolean(ctx.upcoming({event:null})),false);
assert.equal(ctx.formatOdds(-110,'decimal'),'1.91');assert.equal(ctx.formatOdds(150,'fractional'),'3/2');assert.equal(ctx.formatOdds(null,'decimal'),'—');assert.equal(ctx.parseSelection('Falcons +3.5','Spread').american,null);
console.log('Consensus checks passed: exact lines, same game, distinct analysts, cross-source agreement, opposing picks, latest votes, staff exclusion, kickoff, odds.');
