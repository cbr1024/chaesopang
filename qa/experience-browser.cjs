/* Real Chromium touch checks for first-screen clarity, rewards and honest coaching.
 * No live ranking service, payments or remote requests are used. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const P=require('../progress.js'),E=require('../engine-v2.js'),Legacy=require('../engine.js');
const L=require('../levels-fun.js'),OldLevels=require('../levels.js'),F=require('../fun-loop.js'),G=require('../garden-economy.js'),J=require('../journey.js'),W=require('../wardrobe.js');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'qa-output','experience'),KEY=P.KEY;
const TODAY='2026-11-26',YESTERDAY='2026-11-25',FIXED_NOW='2026-11-26T03:00:00.000Z';
const results=[],diagnostics=[],contexts=new Set();let browser,origin,currentStep='setup';
fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 const file=path.resolve(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,''));
 if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const pass=(tag,extra={})=>{results.push({tag,pass:true,...extra});console.log('PASS '+tag);};
async function home(page){await page.waitForFunction(()=>document.body.dataset.v2Screen==='home'&&!document.querySelector('#v2-home').hidden&&!document.querySelector('#v2-home .v2-play')?.disabled,{},{timeout:25000});}
async function idle(page){await page.waitForFunction(()=>document.body.dataset.v2Screen==='play'&&document.querySelector('#board')?.getAttribute('aria-busy')==='false'&&document.querySelector('#modal-backdrop').hidden,{},{timeout:25000});}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);}
async function modal(page){await page.waitForSelector('#modal-backdrop:not([hidden])',{timeout:25000});}
async function painted(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function shot(page,name){await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false});}
async function boot({fixture=null,width=390,height=844,fixedNowDate=null}={}){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'ko-KR',timezoneId:'Asia/Seoul'});
 contexts.add(context);const errors=[],external=[];
 try{
  await context.route('**/*',route=>{
   if(new URL(route.request().url()).origin===origin)return route.continue();
   external.push(route.request().url());return route.abort();
  });
  await context.addInitScript(({key,data,fixedNow})=>{
   if(fixedNow){
    const NativeDate=Date,now=NativeDate.parse(fixedNow);
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
   }
   if(data&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));
  },{key:KEY,data:fixture,fixedNow:fixedNowDate});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
  page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push({type:'console',message:m.text()});});
  page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push({type:'http',message:r.status()+' '+r.url()});});
  await page.goto(origin);await home(page);return {context,page,errors,external,width,height};
 }catch(error){diagnostics.push({step:currentStep,errors,external});await context.close();contexts.delete(context);throw error;}
}
async function using(options,fn){
 const env=await boot(options);
 try{await fn(env);assert.deepEqual(env.errors,[],'browser errors');assert.deepEqual(env.external,[],'unexpected external requests');}
 catch(error){await shot(env.page,'failure-'+diagnostics.length).catch(()=>{});throw error;}
 finally{diagnostics.push({step:currentStep,errors:env.errors,external:env.external});await env.context.close();contexts.delete(env.context);}
}
function stageFixture(level,{legacy=false,game=null,journey=null,maxCombo=0}={}){
 const data=P.defaults(),definition=(legacy?OldLevels:L)[level-1],API=legacy?Legacy:E;
 data.profile.unlocked=level;data.profile.hasSeenTutorial=true;
 for(let n=0;n<level-1;n++){data.profile.stars[n]=3;data.profile.journey.stamps[n]=true;}
 data.profile.seenSpecials={row:true,col:true,bomb:true,rainbow:true};
 data.profile.storySeen={prologue:true,openings:Array(5).fill(true),endings:Array(5).fill(true)};
 game=game||new API.Game({...definition,rows:6,cols:6,types:6,requireScore:false,seed:95000+level,buddy:{type:0,tier:1}});
 data.profile.totalCollected=game.collected.slice();
 data.session={level,game:game.exportState(),shuffles:2,blasts:2,maxCombo,journey:journey||J.createRun(level)};
 const fixture={version:3,...data},normalized=P.normalize(fixture);
 assert(normalized.session,'fixture must survive real save validation');
 assert.deepEqual(normalized.session.game,fixture.session.game,'fixture must not migrate or lose its game');
 return fixture;
}
async function tapTile(page,pos){
 const tile=page.locator('#tiles .tile:not(.retiring)[data-r="'+pos.r+'"][data-c="'+pos.c+'"]');
 await tile.scrollIntoViewIfNeeded();const box=await tile.boundingBox();assert(box,'tile missing');
 await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
}
async function touchMove(env,pick=null,kind='campaign'){
 const {page}=env;await idle(page);
 if(await page.locator('#special-coach').isVisible())await page.locator('#coach-dismiss').tap();
 const before=await saved(page),state=kind==='daily'?before.profile.daily.active.game:before.session.game,game=E.Game.fromState(state),move=pick?pick(game):game.hint();assert(move,'no legal move');
 await tapTile(page,move.from);await tapTile(page,move.to);
 await page.waitForFunction(({key,moves,kind})=>{const s=JSON.parse(localStorage.getItem(key)),run=kind==='daily'?s.profile.daily.active:s.session;return !run||run.game.moves===moves-1;},{key:KEY,moves:game.moves,kind},{timeout:20000});
 return {before,move};
}
async function firstScreen(){
 for(const returning of [false,true])for(const [width,height] of [[320,568],[360,740],[390,844]]){
  currentStep=(returning?'returning':'new')+' home '+width+'x'+height;
  await using({fixture:returning?stageFixture(23):null,width,height},async({page})=>{
   // No locator tap or scrollIntoView is allowed before this assertion.
   await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));await painted(page);
   assert.match(await page.locator('#v2-home .v2-play').innerText(),returning?/이어서 놀기/:/첫 퍼즐 시작/,'first visit and saved gameplay must have distinct labels');
   const layout=await page.evaluate(()=>{
    const button=document.querySelector('#v2-home .v2-play'),nav=document.querySelector('#v2-nav'),b=button.getBoundingClientRect(),n=nav.getBoundingClientRect();
    const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
    return {scrollY:window.scrollY,viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
     button:{top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:b.width,height:b.height},navTop:n.top,hit:hit?.closest('.v2-play')===button};
   });
   assert.equal(layout.scrollY,0,'home was scrolled before checking the CTA');
   assert(layout.scrollWidth<=layout.viewport+1,'horizontal overflow '+JSON.stringify(layout));
   assert(layout.button.top>=0&&layout.button.left>=0&&layout.button.right<=width+1,'CTA outside viewport '+JSON.stringify(layout));
   assert(layout.button.bottom<layout.navTop-4,'CTA hidden under navigation '+JSON.stringify(layout));
   assert(layout.button.height>=44&&layout.hit,'CTA center is not an accessible touch target '+JSON.stringify(layout));
   await shot(page,'home-'+(returning?'returning-':'new-')+width);
   pass(currentStep,{layout});
  });
 }
}
async function firstRewardAndGarden(){
 currentStep='first clear reward, decoration and persistence';
 await using({},async env=>{
  const {page}=env;await page.locator('#v2-home .v2-play').tap();await idle(page);
  let turns=0,lastTurn;
  while((await saved(page)).session&&turns<24){lastTurn=await touchMove(env,g=>F.introHint(g)||g.hint());turns++;}
  await modal(page);const won=await saved(page);assert(won.profile.stars[0]>0,'intro must finish as a real win');
  const item=G.catalog[0],moment=page.locator('.result-moment[data-moment="first-garden"]');await moment.waitFor({state:'visible'});
  assert((await moment.locator('p').innerText()).includes(item.name),'first-garden moment must name the actual obtainable decoration');
  assert(await moment.locator('.result-moment-art svg').count()>0,'first-garden moment lacks a visual scene');
  assert(await page.evaluate(()=>{
   const scene=document.querySelector('.result-moment[data-moment="first-garden"]'),reward=document.querySelector('.v2-reward-ceremony');
   return Boolean(scene&&reward&&(scene.compareDocumentPosition(reward)&Node.DOCUMENT_POSITION_FOLLOWING));
  }),'story moment must precede the seed reward');
  const primary=page.locator('#modal-actions .primary-button');
  assert.match(await primary.innerText(),/첫 정원 소품 꾸미기/,'first decoration must be the primary first-win action');
  const next=page.locator('#modal-actions button').filter({hasText:'다음 단계'});
  assert.equal(await next.count(),1,'next stage must remain available');
  assert(!(await next.evaluate(el=>el.classList.contains('primary-button'))),'next stage must be secondary on the first reward');
  await shot(page,'first-reward');
  const newKeepsakes=W.catalog.filter(i=>P.memoryLevel(lastTurn.before.profile,i.type)<i.tier&&P.memoryLevel(won.profile,i.type)>=i.tier);
  if(newKeepsakes.length){
   const summary=page.locator('.result-more > summary');await summary.tap();
   const allKeepsakes=await page.locator('.result-all-keepsakes').innerText();
   assert(newKeepsakes.every(i=>allKeepsakes.includes(i.name)),'result details omit a keepsake unlocked by the actual final turn');
   await summary.tap();
  }
  await primary.tap();await page.waitForFunction(()=>document.body.dataset.v2Screen==='garden');
  const balance=G.summary(won.profile).balance;
  await page.locator('[data-item="'+item.id+'"]').tap();await modal(page);await page.locator('#modal-actions .primary-button').tap();
  await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).profile.garden.owned.includes(id),{key:KEY,id:item.id});
  await page.waitForFunction(id=>{
   const scene=document.querySelector('#v2-home .v2-landscape'),item=scene?.querySelector('.v2-placed [data-item-id="'+id+'"]'),nav=document.querySelector('#v2-nav');
   if(!scene||!item||!nav)return false;const b=scene.getBoundingClientRect(),n=nav.getBoundingClientRect();
   return b.top>=0&&b.bottom<n.top-4;
  },item.id,{timeout:7000}).catch(async error=>{
   const layout=await page.evaluate(id=>{
    const scene=document.querySelector('#v2-home .v2-landscape'),nav=document.querySelector('#v2-nav');
    return {scrollY,scene:scene?.getBoundingClientRect().toJSON(),nav:nav?.getBoundingClientRect().toJSON(),itemVisible:!!scene?.querySelector('.v2-placed [data-item-id="'+id+'"]')};
   },item.id);
   error.message+='; garden layout '+JSON.stringify(layout);throw error;
  });
  const after=await saved(page);assert.equal(after.profile.garden.equipped[item.slot],item.id);assert.equal(G.summary(after.profile).balance,balance-item.price);
  assert.equal(await page.locator('.v2-placed [data-slot][data-item-id="'+item.id+'"]').count(),1);
  await shot(page,'first-decoration-in-view');
  await page.reload();await home(page);const reloaded=await saved(page);
  assert.deepEqual(reloaded.profile.garden,after.profile.garden,'decoration purchase did not persist');
  assert.equal(await page.locator('.v2-landscape .v2-placed [data-item-id="'+item.id+'"]').count(),1,'purchased decoration absent after reload');
  pass(currentStep,{turns,item:item.id,balanceAfter:G.summary(after.profile).balance});
 });
}
function midnightFixture(){
 const fixture=stageFixture(2),raw={version:F.VERSION,entries:{[YESTERDAY]:{attempts:1,completed:1,best:5000,last:5000}},active:null,lastDay:YESTERDAY};
 const run=F.begin(raw,YESTERDAY);assert(run.ok);const move=run.game.hint(),turn=run.game.play(move.from,move.to);assert(turn.valid);
 const maxCombo=Math.max(0,...turn.events.filter(e=>e.kind==='clear').map(e=>e.combo));
 const checkpoint=F.checkpoint(run.state,run.game,maxCombo);assert(checkpoint.ok&&!checkpoint.finished);
 fixture.profile.daily=checkpoint.state;
 assert.equal(fixture.profile.daily.active.game.moves,14);assert.equal(F.overview(checkpoint.state,TODAY).remaining,3);
 assert.equal(F.overview(checkpoint.state,YESTERDAY).remaining,1);assert.equal(P.normalize(fixture).profile.daily.active.day,YESTERDAY);
 return fixture;
}
async function dailyAcrossMidnight(){
 currentStep='unfinished daily keeps its own date and records';
 await using({fixture:midnightFixture(),fixedNowDate:FIXED_NOW},async env=>{
  const {page}=env,campaign=(await saved(page)).session;
  assert.equal(await page.evaluate(()=>LumiFun.dayKey()),TODAY,'test clock did not set the Korean day');
  await page.locator('[data-action="daily"]').tap();await modal(page);
  const best=page.locator('#daily-record-best[data-day="'+YESTERDAY+'"]'),attempts=page.locator('#daily-record-attempts[data-day="'+YESTERDAY+'"]');
  assert.equal(Number((await best.innerText()).replace(/[^0-9]/g,'')),5000,'yesterday best was replaced by today zero');
  assert.match(await attempts.innerText(),/1\s*\/\s*3/,'unfinished day must show one remaining attempt');
  const todayText=await page.locator('#daily-today-attempts').innerText();assert.equal(Number(todayText.match(/\d+/)?.[0]),3,'today must retain all three new attempts');
  assert(!/undefined|NaN/.test(await page.locator('#modal-content').innerText()),'invalid daily display value');
  assert.equal((await saved(page)).profile.daily.active.game.moves,14,'opening daily info changed the unfinished game');
  await shot(page,'daily-after-midnight');
  await page.getByRole('button',{name:'진행 중인 도전 이어하기',exact:true}).tap();await idle(page);
  let turns=0;
  while((await saved(page)).profile.daily.active&&turns<14){await touchMove(env,null,'daily');turns++;}
  await modal(page);const finished=await saved(page),yesterday=finished.profile.daily.entries[YESTERDAY];
  assert.equal(turns,14,'unfinished daily must use exactly its fourteen remaining turns');
  assert.equal(finished.profile.daily.active,null);assert.equal(yesterday.completed,2);assert.equal(yesterday.attempts,2);
  assert.equal(Number((await best.innerText()).replace(/[^0-9]/g,'')),yesterday.best,'result must show the completed day best');
  assert.match(await attempts.innerText(),/1\s*\/\s*3/,'yesterday must retain its final unused attempt');
  assert.equal(Number((await page.locator('#daily-today-attempts[data-day="'+TODAY+'"]').innerText()).match(/\d+/)?.[0]),3,'finishing yesterday consumed a today attempt');
  assert(!/undefined|NaN/.test(await page.locator('#modal-content').innerText()),'invalid cross-day result display');
  assert.match((await page.locator('#modal-actions .primary-button').innerText()).trim(),/^오늘의 새 도전$/);
  await shot(page,'daily-prior-day-result');
  await page.locator('#modal-actions .primary-button').tap();await idle(page);const today=await saved(page);
  assert.equal(today.profile.daily.active.day,TODAY);assert.equal(today.profile.daily.active.game.moves,15);
  assert.equal(today.profile.daily.entries[TODAY].attempts,1);assert.equal(today.profile.daily.entries[TODAY].completed,0);
  assert.deepEqual(today.profile.daily.entries[YESTERDAY],yesterday,'starting today rewrote yesterday results');
  assert.deepEqual(today.session,campaign,'cross-day daily changed the independent campaign');
  pass(currentStep,{activeDay:YESTERDAY,currentDay:TODAY,completedBest:yesterday.best,completedYesterday:2,remainingYesterday:1,todayStartedAt:15,todayAttempts:1,turns});
 });
}
const colorMissing=s=>s.objectives.reduce((n,g)=>n+Math.max(0,g.target-g.current),0);
const focusRemaining=(s,focus)=>focus==='buds'?s.budsGoal-s.bloomed:focus==='delivery'?s.deliveryRemaining:focus==='color'?colorMissing(s):s.terrainRemaining[focus];
function lossFixture(level,focus){
 // Every checkpoint and final swap is reached through Game.play. Moves, goals,
 // terrain and RNG state are never edited to fabricate a failure screen.
 for(let seedAttempt=0;seedAttempt<8;seedAttempt++){
  const seed=99000+level+seedAttempt*97;let game=new E.Game({...L[level-1],rows:6,cols:6,types:6,requireScore:false,seed,buddy:{type:0,tier:1}}),run=J.createRun(level),maxCombo=0;
  while(!game.over&&!game.won){
   const candidates=game.legalMoves().map(move=>{
    const next=E.Game.fromState(game.exportState()),result=next.play(move.from,move.to),snapshot=next.snapshot();
    return {move,next,result,snapshot};
   }).filter(x=>x.result.valid&&!x.next.won&&focusRemaining(x.snapshot,focus)>0);
   candidates.sort((a,b)=>focus==='color'?colorMissing(b.snapshot)-colorMissing(a.snapshot):colorMissing(a.snapshot)-colorMissing(b.snapshot)||focusRemaining(b.snapshot,focus)-focusRemaining(a.snapshot,focus));
   const chosen=candidates[0];if(!chosen)break;
   if(game.moves===1){
    if(!chosen.next.over||(focus!=='color'&&colorMissing(chosen.snapshot)))break;
    return {fixture:stageFixture(level,{game,journey:run,maxCombo}),move:chosen.move,expected:chosen.snapshot,seed,focus};
   }
   J.recordResult(run,chosen.result);maxCombo=Math.max(maxCombo,...chosen.result.events.filter(e=>e.kind==='clear').map(e=>e.combo));game=chosen.next;
  }
 }
 throw Error('Could not reach a legitimate '+focus+' loss for level '+level);
}
async function lossCoaching(){
 for(const [level,focus] of [[23,'frost'],[31,'crate'],[37,'delivery']]){
  currentStep='remaining '+focus+' gives a truthful retry tip';const test=lossFixture(level,focus);
  await using({fixture:test.fixture},async env=>{
   const {page}=env;await page.locator('#v2-home .v2-play').tap();await idle(page);
   assert.equal((await saved(page)).session.game.moves,1,'loss checkpoint lost its last move');
   await touchMove(env,()=>test.move);await modal(page);
   const coach=page.locator('.retry-coach[data-focus="'+focus+'"]');await coach.waitFor({state:'visible'});const text=await coach.innerText();
   assert(focusRemaining(test.expected,focus)>0,'expected failure has no remaining target');
   assert.equal(colorMissing(test.expected),0,'obstacle test should have completed its color targets');
   assert.match(text,{frost:/서리/,crate:/상자/,delivery:/씨앗/}[focus]);
   assert.match(text,{frost:/직접|특수/,crate:/옆|인접/,delivery:/아래|열/}[focus]);
   for(const [kind,term] of [['buds','봉오리'],['frost','서리'],['crate','상자'],['delivery','운반']]){
    if(kind!==focus&&!focusRemaining(test.expected,kind))assert(!text.includes(term),'retry advice mentions absent '+kind+': '+text);
   }
   assert(!/undefined|NaN/.test(text));assert.equal((await saved(page)).profile.stars[level-1],0,'failed level received a clear reward');
   await shot(page,'retry-'+focus);pass(currentStep,{level,seed:test.seed,remaining:focusRemaining(test.expected,focus),text});
  });
 }
}
async function revisionAwarePromise(){
 for(const legacy of [false,true]){
  currentStep=(legacy?'legacy buds':'current frost')+' stage 23 promise';
  const fixture=stageFixture(23,{legacy});
  await using({fixture},async({page})=>{
   await page.locator('#v2-home .v2-play').tap();await idle(page);
   const before=(await saved(page)).session.game;
   assert.deepEqual(before,fixture.session.game,'resuming must preserve the exact saved revision and game');
   await page.locator('#promise-button').tap();await modal(page);
   const detail=await page.locator('.promise-detail').innerText();
   assert.match(detail,legacy?/봉오리/:/서리/,'task advice does not describe this saved revision');
   assert(!(legacy?/서리/:/봉오리/).test(detail),'task advice leaked from the other revision: '+detail);
   const state=(await saved(page)).session.game;
   assert.equal(state.version,fixture.session.game.version,'opening task modal migrated the actual fixture version');
   assert.deepEqual(state,before,'opening task modal changed the saved game');
   await shot(page,'promise-'+(legacy?'legacy-buds':'current-frost'));pass(currentStep);
  });
 }
}
async function main(){
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  await firstScreen();await firstRewardAndGarden();await dailyAcrossMidnight();await lossCoaching();await revisionAwarePromise();
 }finally{
  for(const context of contexts)await context.close().catch(()=>{});contexts.clear();
  if(browser)await browser.close();
 }
}
main().then(()=>{
 const report={passed:results.length,results,diagnostics};fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
},error=>{
 const report={passed:results.length,failedStep:currentStep,error:String(error),stack:error.stack,results,diagnostics};
 console.error(error);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));process.exitCode=1;
}).finally(()=>server.close());
