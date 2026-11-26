/* V2-B regression: deterministic puzzle, economy and independent daily state. */
'use strict';
const assert=require('node:assert/strict');
const E=require('../engine-v2.js'),A=require('../levels-v2.js'),L=require('../levels-fun.js'),F=require('../fun-loop.js'),P=require('../progress.js'),G=require('../garden-economy.js'),J=require('../journey.js');
const tests=[];let count=0;
const check=(label,fn)=>{fn();tests.push(label);console.log('PASS '+label);};
const date='2026-11-25',gameFor=(def,seed=4312)=>new E.Game({...def,rows:6,cols:6,types:6,requireScore:false,seed,buddy:{type:0,tier:1}});
function run(g){let actions=0;while(!g.won&&!g.over){const m=g.hint();assert(m);assert(g.play(m.from,m.to).valid);actions++;assert(!g.findMatches().length);assert(g.won||g.over||g.legalMoves().length);const state=g.exportState();assert.deepEqual(E.Game.fromState(state).exportState(),state);}return actions;}
function dailyRun(s,day){const a=F.begin(s,day);assert(a.ok);let state=a.state,game=a.game,result=null;while(!game.over){const m=game.hint(),r=game.play(m.from,m.to);assert(r.valid);const q=F.checkpoint(state,game,Math.max(0,...r.events.map(x=>x.combo||0)));assert(q.ok);state=q.state;result=q.result||result;}return {state,result};}
check('KST date boundaries and deterministic daily rules',()=>{
 assert.equal(F.dayKey(new Date('2026-11-24T14:59:59Z')),'2026-11-24');assert.equal(F.dayKey(new Date('2026-11-24T15:00:00Z')),'2026-11-25');
 assert.deepEqual(F.newGame(date).exportState(),F.newGame(date).exportState());
 assert.notEqual(F.definition(date).seed,F.definition('2026-11-26').seed);
 assert.equal(F.newGame(date).buddy.tier,1);
});
check('first normal match followed by actual large combo',()=>{
 const g=gameFor(L[0],F.INTRO_SEED);F.decorateIntro(g);const first=F.introHint(g);const r=g.play(first.from,first.to);assert.equal(r.events.find(x=>x.kind==='clear').cells.length,3);
 const second=F.introHint(g),q=g.play(second.from,second.to),hit=q.events.find(x=>x.specialCombo==='line-bomb');assert(hit);assert.equal(hit.cells.length,24);assert.equal(F.introHint(g),null);
});
check('daily three attempts, no repeat badge, rollover and resume',()=>{
 let s=F.begin(null,date);const m=s.game.hint(),r=s.game.play(m.from,m.to);assert(r.valid);
 const q=F.checkpoint(s.state,s.game,1);assert(q.ok&&!q.finished);const resume=F.begin(JSON.parse(JSON.stringify(q.state)),'2026-11-26');
 assert(resume.resumed);assert.equal(resume.state.active.day,date);assert.equal(resume.game.moves,14);assert.equal(resume.state.entries[date].attempts,1);
 let a=dailyRun(q.state,date);assert(a.result.first);assert.equal(a.state.entries[date].attempts,1);
 a=dailyRun(a.state,date);assert(!a.result.first);assert.equal(F.overview(a.state,date).days,1);
 a=dailyRun(a.state,date);assert.equal(a.state.entries[date].completed,3);assert.equal(F.begin(a.state,date).code,'LIMIT');
 assert.equal(F.begin(a.state,'2026-11-24').code,'DATE');const next=F.begin(a.state,'2026-11-26');assert(next.ok&&next.game.moves===15);
 assert.equal(next.state.entries[date].completed,3);
});
check('first decoration affordable and cannot be bought twice',()=>{
 const p=P.defaults().profile;assert(!G.unlockedSlots(p).size);p.unlocked=2;p.stars[0]=1;p.journey.stamps[0]=true;
 const item=G.catalog[0],purchase=G.purchase(p,item.id);assert(purchase.ok);p.garden=purchase.garden;assert.equal(G.summary(p).balance,2);
 assert.equal(G.purchase(p,item.id).code,'OWNED');
 const n=P.normalize({version:3,profile:p,settings:P.defaults().settings,session:null});assert(n.profile.garden.owned.includes(item.id));
});
check('legacy and revised saved session contracts',()=>{
 const profile=P.defaults().profile;profile.unlocked=50;
 for(const def of [A[39],L[30],L[36],L[49]]){
  const g=gameFor(def);const m=g.hint();g.play(m.from,m.to);const session={level:def.id,game:g.exportState(),shuffles:2,blasts:2,maxCombo:g.combo,journey:J.createRun(def.id)};
  profile.daily=F.begin(null,date).state;
  const n=P.normalize({version:3,profile,settings:P.defaults().settings,session});
  assert.deepEqual(n.session.game,session.game);assert.equal(n.profile.daily.active.game.moves,15);
 }
});
check('crate rejects swaps and loses only one layer per clear',()=>{
 const g=gameFor(L[32]);const cell=L[32].terrain.find(x=>x.hp===2);const other={r:cell.r,c:cell.c+1};const before=g.exportState();const invalid=g.play(cell,other);assert(!invalid.valid&&invalid.reason==='crate');assert.deepEqual(g.exportState(),before);
 const target={r:cell.r,c:cell.c};const events=[];g._clear([target,{r:cell.r,c:cell.c-1}],[],events);const event=events.find(e=>e.kind==='clear');assert.equal(event.terrainHit.find(t=>t.r===cell.r&&t.c===cell.c).after,1);
});
check('delivery only advances for removed cells below its lane',()=>{
 const def=L[36],g=gameFor(def),seed=g.delivery[0];assert.equal(seed.r,0);
 const events=[];g._clear([{r:1,c:seed.c},{r:3,c:seed.c},{r:2,c:seed.c+1}],[],events);
 assert.equal(g.delivery[0].r,2);assert.deepEqual(events.find(e=>e.kind==='clear').deliveryHit,[{c:seed.c,before:0,after:2,delivered:false}]);
});
check('all 50 authored stages remain deterministic and playable',()=>{
 for(const def of L){const g=gameFor(def,10091+def.id*271);count+=run(g);}
});
console.log(JSON.stringify({passed:tests.length,engineActions:count,tests}));
