/* Real Chromium touch regression for the V2-B fun loop. No remote requests. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const P=require('../progress.js'),E=require('../engine-v2.js'),L=require('../levels-fun.js'),F=require('../fun-loop.js'),G=require('../garden-economy.js'),J=require('../journey.js');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'qa-output','fun'),KEY=P.KEY;
fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),file=path.resolve(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,''));
 if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const results=[];let browser,origin;
const pass=(tag,extra={})=>{results.push({tag,pass:true,...extra});console.log('PASS '+tag);};
async function boot(fixture=null,width=390,height=844){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce',locale:'ko-KR'});
 const errors=[],external=[];await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 if(fixture)await context.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:KEY,data:fixture});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push('HTTP '+r.status()+' '+r.url());});
 await page.goto(origin);await home(page);return {context,page,errors,external};
}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);}
async function home(page){await page.waitForFunction(()=>document.body.dataset.v2Screen==='home'&&!document.querySelector('#v2-home').hidden&&!document.querySelector('#v2-home .v2-play')?.disabled,{},{timeout:25000});}
async function idle(page){await page.waitForFunction(()=>document.body.dataset.v2Screen==='play'&&document.querySelector('#board')?.getAttribute('aria-busy')==='false'&&document.querySelector('#modal-backdrop').hidden,{},{timeout:25000});}
async function modal(page){await page.waitForSelector('#modal-backdrop:not([hidden])');}
async function snapshot(page,name){await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});}
async function tapPos(page,p){
 const t=page.locator('#tiles .tile:not(.retiring)[data-r="'+p.r+'"][data-c="'+p.c+'"]');
 await t.scrollIntoViewIfNeeded();const r=await t.boundingBox();assert(r,'tile missing');await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);
}
async function move(env,kind='campaign',pick=null){
 const {page}=env;await idle(page);
 if(await page.locator('#special-coach').isVisible())await page.locator('#coach-dismiss').tap();
 await page.locator('#board').scrollIntoViewIfNeeded();
 const before=await saved(page),state=kind==='daily'?before.profile.daily.active.game:before.session.game,g=E.Game.fromState(state);
 const m=pick?pick(g):g.hint();assert(m,'no legal move');await tapPos(page,m.from);await tapPos(page,m.to);
 await page.waitForFunction(({key,kind,old})=>{const s=JSON.parse(localStorage.getItem(key)),a=kind==='daily'?s.profile.daily.active:s.session;return !a||a.game.moves===old-1;},{key:KEY,kind,old:g.moves},{timeout:15000});
 return {before,after:await saved(page),m};
}
function fixture(level){
 const d=P.defaults();d.profile.unlocked=level;for(let n=0;n<level-1;n++){d.profile.stars[n]=3;d.profile.journey.stamps[n]=true;}d.profile.hasSeenTutorial=true;
 const g=new E.Game({...L[level-1],rows:6,cols:6,types:6,requireScore:false,seed:7711+level,buddy:{type:0,tier:1}});
 d.session={level,game:g.exportState(),shuffles:2,blasts:2,maxCombo:0,journey:J.createRun(level)};return {version:3,...d};
}
async function verify(env){assert.deepEqual(env.errors,[]);assert.deepEqual(env.external,[]);await env.context.close();}
async function firstAndDaily(){
 const env=await boot(),{page}=env;
 assert.equal((await saved(page)).session.game.seed,F.INTRO_SEED);
 await page.locator('[data-action=play]').tap();await idle(page);
 await page.waitForFunction(()=>document.querySelector('#play-hint').textContent.includes('첫 매치'));
 await snapshot(page,'01-first-match');
 await move(env,'campaign',g=>F.introHint(g));await idle(page);
 await page.waitForFunction(()=>document.querySelector('#play-hint').textContent.includes('씨앗폭탄'));
 await page.evaluate(()=>{window.__funCombos=[];new MutationObserver(()=>window.__funCombos.push(document.querySelector('#combo-label').textContent)).observe(document.querySelector('#combo-label'),{childList:true,subtree:true,characterData:true});});
 await move(env,'campaign',g=>F.introHint(g));
 await page.waitForFunction(()=>window.__funCombos.includes('꽃비 폭풍!'));
 pass('guided basic match and real large combo');
 let turns=2;
 while((await saved(page)).session&&turns<24){await move(env);turns++;}
 await modal(page);let s=await saved(page);assert(s.profile.stars[0]>0,'intro must clear');assert(s.profile.unlocked>=2);assert(G.summary(s.profile).balance>=G.catalog[0].price);
 await snapshot(page,'02-first-reward');
 await page.getByRole('button',{name:'첫 정원 소품 꾸미기'}).tap();await page.waitForFunction(()=>document.body.dataset.v2Screen==='garden');
 const item=G.catalog[0],balance=G.summary(s.profile).balance;
 await page.locator('[data-item="'+item.id+'"]').tap();await modal(page);
 await page.locator('#modal-actions .primary-button').tap();await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).profile.garden.owned.includes(id),{key:KEY,id:item.id});
 s=await saved(page);assert.equal(s.profile.garden.equipped[item.slot],item.id);assert.equal(G.summary(s.profile).balance,balance-item.price);
 await snapshot(page,'03-first-garden');pass('first stage clear and immediately purchased placed decoration',{turns});
 await page.locator('[data-v2-nav=home]').tap();await home(page);
 await page.locator('[data-action=play]').tap();await idle(page);await move(env);await idle(page);
 await page.locator('#v2-home-back').tap();await home(page);const campaign=await saved(page);
 assert.equal(campaign.session.level,2);
 await page.locator('[data-action=daily]').tap();await modal(page);await snapshot(page,'04-daily-info');
 await page.locator('#modal-actions .primary-button').tap();await idle(page);
 assert.equal(await page.locator('body').getAttribute('data-v2-mode'),'daily');assert.equal((await saved(page)).profile.daily.active.game.moves,15);
 assert(!(await page.locator('#shuffle-button').isVisible()));assert(!(await page.locator('#blast-button').isVisible()));
 const initial=(await saved(page)).profile.daily.active.game;await move(env,'daily');await idle(page);
 const mid=await saved(page);assert.equal(mid.profile.daily.active.game.moves,14);assert.deepEqual(mid.session,campaign.session);
 await snapshot(page,'05-daily-board');await page.locator('#v2-home-back').tap();await home(page);await page.reload();await home(page);
 await page.locator('[data-action=play]').tap();await idle(page);assert.equal(await page.locator('body').getAttribute('data-v2-mode'),'campaign');
 assert.deepEqual((await saved(page)).session,campaign.session);
 await page.locator('#v2-home-back').tap();await home(page);
 await page.locator('[data-action=daily]').tap();await modal(page);await page.locator('#modal-actions .primary-button').tap();await idle(page);
 assert.equal((await saved(page)).profile.daily.active.game.moves,14);
 assert.equal((await saved(page)).profile.daily.entries[mid.profile.daily.active.day].attempts,1);
 pass('independent daily and campaign checkpoint after navigation and reload');
 let actions=1;while((await saved(page)).profile.daily.active&&actions<15){await move(env,'daily');actions++;}
 await modal(page);const end=await saved(page),day=mid.profile.daily.active.day;
 assert.equal(actions,15);assert.equal(end.profile.daily.active,null);assert.equal(end.profile.daily.entries[day].completed,1);assert(end.profile.daily.entries[day].best>0);
 assert.deepEqual(end.session,campaign.session);
 for(const key of ['stars','bestScores','totalCollected','buddyClearXp','garden','journey'])assert.deepEqual(end.profile[key],campaign.profile[key],key+' leaked into campaign');
 await page.waitForSelector('.daily-medals');await snapshot(page,'06-daily-result');pass('15-turn real daily completion without campaign reward leakage',{score:end.profile.daily.entries[day].best,actions});
 await page.locator('#modal-actions .primary-button').tap();await idle(page);const retry=await saved(page);
 assert.equal(retry.profile.daily.entries[day].attempts,2);assert.deepEqual(retry.profile.daily.active.game,initial);
 pass('daily retry uses exactly the same board and consumes one attempt');await verify(env);
}
async function later(){
 for(const level of [31,37,50]){
  const env=await boot(fixture(level)),{page}=env;await page.locator('[data-action=play]').tap();await idle(page);
  const first=await saved(page),g=E.Game.fromState(first.session.game);
  assert.equal(g.rulesRevision,E.FUN_REVISION);
  if(g.terrainGoal.crate){
   const cell=g.terrain.flatMap((row,r)=>row.map((t,c)=>t?.kind==='crate'?{r,c}:null)).find(Boolean);
   assert(await page.locator('.v2-terrain[data-kind=crate]').count()>0);
   await tapPos(page,cell);await page.waitForTimeout(180);assert.equal((await saved(page)).session.game.moves,g.moves);
   pass('stage '+level+' crate lock rejects touch');
  }
  if(g.delivery.length){
   let advanced=false;
   for(let k=0;k<8&&!advanced;k++){
    const q=await move(env,'campaign',model=>model.legalMoves().find(m=>{const copy=E.Game.fromState(model.exportState()),r=copy.play(m.from,m.to);return r.events.some(e=>e.deliveryHit?.length);})||model.hint());
    if(!q.after.session)break;
    const prior=q.before.session.game.delivery,next=q.after.session.game.delivery;
    advanced=next.some((v,i)=>v.r>prior[i].r);await idle(page);
    if(advanced){for(const s of next)assert.equal(await page.locator('.v2-delivery-marker[data-column="'+s.c+'"]').getAttribute('data-row'),String(s.r));}
   }
   assert(advanced,'seed delivery must visibly advance');pass('stage '+level+' real seed delivery marker follows model');
  }else {await move(env);await idle(page);}
  await snapshot(page,'late-'+level);await page.locator('#v2-home-back').tap();await home(page);const prior=(await saved(page)).session;
  await page.reload();await home(page);await page.locator('[data-action=play]').tap();await idle(page);assert.deepEqual((await saved(page)).session,prior);
  pass('stage '+level+' revision B reload');await verify(env);
 }
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});try{await firstAndDaily();await later();}finally{await browser.close();}})().then(()=>{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,passed:results.length},null,2));console.log(JSON.stringify({passed:results.length,results}));},error=>{console.error(error);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,error:String(error),passed:results.length},null,2));process.exitCode=1;}).finally(()=>server.close());
