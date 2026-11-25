/* Real-browser regression tests. The live ranking endpoint is never contacted. */
'use strict';
const { chromium, webkit } = require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const Progress=require('../progress.js');
const Garden=require('../garden-economy.js');
const Game=require('../engine-v2.js').Game;
const Levels=require('../levels-v2.js');
const Journey=require('../journey.js');
const ROOT=path.resolve(__dirname,'..'), KEY='lumi-garden-v3', OUT=path.join(ROOT,'qa-output');
fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const file=path.join(ROOT,new URL(req.url,'http://127.0.0.1').pathname==='/'?'index.html':decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,''));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const results=[];
async function idle(page){await page.waitForFunction(()=>document.body.dataset.v2Screen==='play'&&document.querySelector('#board')?.getAttribute('aria-busy')==='false'&&document.querySelector('#modal-backdrop').hidden,{},{timeout:20000});}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);}
function stageFixture(level,extras={}){
  const d=Progress.defaults();d.profile.unlocked=level;d.profile.stars.fill(0);for(let i=0;i<level-1;i++){d.profile.stars[i]=3;d.profile.journey.stamps[i]=true;}
  d.profile.hasSeenTutorial=level>1;
  const g=new Game({...Levels[level-1],rows:6,cols:6,types:6,requireScore:false,seed:91000+level});
  d.session={level,game:g.exportState(),shuffles:2,blasts:2,maxCombo:0,journey:Journey.createRun(level)};
  Object.assign(d.profile,extras);return {version:3,...d};
}
async function boot(browser,origin,width,height,{fixture=null,engine='chromium',reducedMotion='reduce'}={}){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion,locale:'ko-KR'});
  const unexpected=[],errors=[];
  await ctx.route('**/*',route=>{
    if(new URL(route.request().url()).origin===origin)return route.continue();
    unexpected.push(route.request().url());return route.abort();
  });
  if(fixture)await ctx.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:KEY,data:fixture});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push('HTTP '+r.status()+' '+r.url());});
  await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.v2Screen==='home'&&!document.querySelector('#v2-home').hidden,{},{timeout:25000});
  return {ctx,page,unexpected,errors,engine,width,height};
}
async function checkLayout(page,width,screen){
  const sizes=await page.evaluate(()=>{
    const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
    const nodes=[...document.querySelectorAll('#v2-home button,#v2-nav button,#v2-home-back,#hint-button,#shuffle-button,#blast-button,#pause-button,#rank-mode,#settings-button')].filter(e=>e.getClientRects().length&&!e.disabled);
    const board=document.querySelector('#board');
    return {viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,board:board.getClientRects().length?rect(board):null,buttons:nodes.map(e=>({id:e.id||e.textContent.trim().slice(0,24),...rect(e)}))};
  });
  assert(sizes.scrollWidth<=sizes.viewport+1,screen+' horizontal overflow: '+JSON.stringify(sizes));
  if(screen==='play'){assert(sizes.board&&sizes.board.w>=260&&sizes.board.x>=-1&&sizes.board.right<=width+1,'board clipped '+JSON.stringify(sizes.board));assert(Math.abs(sizes.board.w-sizes.board.h)<3,'board not square');}
  for(const b of sizes.buttons){assert(b.x>=-1&&b.right<=width+1,'control clipped '+JSON.stringify(b));assert(b.h>=43,'tap height '+JSON.stringify(b));}
  return sizes;
}
async function moveFor(page){return page.evaluate(key=>{
  const s=JSON.parse(localStorage.getItem(key)).session;
  const game=(s.game.version===LumiEngineV2.STATE_VERSION?LumiEngineV2.Game:LumiEngine.Game).fromState(s.game);
  const h=game.hint();return {h,moves:game.moves,seed:game.seed};
},KEY);}
async function point(page,pos){
  const tile=page.locator('#tiles .tile:not(.retiring)[data-r="'+pos.r+'"][data-c="'+pos.c+'"]');
  await tile.scrollIntoViewIfNeeded();const r=await tile.boundingBox();assert(r,'tile missing');return {x:r.x+r.width/2,y:r.y+r.height/2};
}
async function touchMove(env,swipe=false){
  const {page,ctx}=env;await idle(page);const before=await moveFor(page);assert(before.h);
  const a=await point(page,before.h.from),b=await point(page,before.h.to);
  if(swipe&&env.engine==='chromium'){
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
    for(let n=1;n<=4;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/4,y:a.y+(b.y-a.y)*n/4}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{await page.touchscreen.tap(a.x,a.y);await page.touchscreen.tap(b.x,b.y);}
  await page.waitForFunction(({key,old})=>{const s=JSON.parse(localStorage.getItem(key));return !s.session||s.session.game.moves===old-1;},{key:KEY,old:before.moves},{timeout:12000});
  return before;
}
async function verify(env,tag){
  assert.deepEqual(env.errors,[],tag+' browser errors');assert.deepEqual(env.unexpected,[],tag+' unexpected network calls');results.push({tag,pass:true});await env.ctx.close();
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    for(const [w,h] of [[320,568],[360,740],[390,844],[430,932]]){
      const env=await boot(browser,origin,w,h);const {page}=env;await checkLayout(page,w,'home');await page.screenshot({path:path.join(OUT,'home-'+w+'.png'),fullPage:true});
      await page.locator('[data-action=play]').tap();await idle(page);await checkLayout(page,w,'play');await page.screenshot({path:path.join(OUT,'play-'+w+'.png'),fullPage:true});
      const before=await touchMove(env,w===390);await idle(page);const after=await saved(page);assert(after.session.game.moves===before.moves-1);
      await page.locator('#v2-home-back').tap();await page.waitForFunction(()=>document.body.dataset.v2Screen==='home');
      await page.reload();await page.waitForFunction(()=>document.body.dataset.v2Screen==='home');assert((await saved(page)).session.game.moves===before.moves-1);
      await verify(env,'mobile '+w+'x'+h+' touch/resume');
    }
    for(const level of [11,21,25,30]){
      const env=await boot(browser,origin,390,844,{fixture:stageFixture(level)});const {page}=env;
      await page.locator('[data-action=play]').tap();await idle(page);assert(await page.locator('.v2-terrain').count()>0);
      await page.screenshot({path:path.join(OUT,'stage-'+level+'.png'),fullPage:true});
      if([21,25,30].includes(level)){
        const state=await saved(page);const pos=state.session.game.terrain.flatMap((row,r)=>row.map((t,c)=>t?.kind==='frost'?{r,c}:null)).find(Boolean);
        const p=await point(page,pos);await page.touchscreen.tap(p.x,p.y);assert.equal((await saved(page)).session.game.moves,state.session.game.moves);
      }
      await touchMove(env,true);await idle(page);await verify(env,'terrain '+level);
    }
    const env=await boot(browser,origin,390,844,{fixture:stageFixture(4)});const {page}=env;
    await page.locator('[data-v2-nav=garden]').tap();await page.waitForFunction(()=>document.body.dataset.v2Screen==='garden');
    const initial=await saved(page),item=Garden.catalog[0];assert(Garden.summary(initial.profile).balance>=item.price);
    await page.locator('[data-item="'+item.id+'"]').tap();await page.locator('#modal-actions .primary-button').tap();
    await page.waitForFunction(id=>JSON.parse(localStorage.getItem('lumi-garden-v3')).profile.garden.owned.includes(id),item.id);
    const purchased=await saved(page);assert.equal(Garden.summary(purchased.profile).balance,Garden.summary(initial.profile).balance-item.price);
    assert.equal(purchased.profile.garden.equipped[item.slot],item.id);
    await page.screenshot({path:path.join(OUT,'garden-equipped.png'),fullPage:true});
    await page.reload();await page.waitForFunction(()=>document.body.dataset.v2Screen==='home');assert.equal((await saved(page)).profile.garden.equipped[item.slot],item.id);
    await page.locator('[data-v2-nav=ranking]').tap();await page.waitForSelector('#nickname-input');assert.equal(await page.locator('#nickname-input').inputValue(),'');await verify(env,'garden purchase persistence and optional ranking');
  }finally{await browser.close();}
  if(process.env.QA_WEBKIT==='1'){
    const b=await webkit.launch({headless:true});
    try{const env=await boot(b,origin,390,844,{engine:'webkit'});await env.page.locator('[data-action=play]').tap();await touchMove(env);await idle(env.page);await verify(env,'WebKit mobile tap');}finally{await b.close();}
  }
})().then(()=>{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,results},null,2));},error=>{console.error(error);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,error:String(error)},null,2));process.exitCode=1;}).finally(()=>server.close());
