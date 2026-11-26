/* Real Chromium sensory QA. Instrumentation is test-only; no ranking requests.
 * Vibration is captured at the browser API boundary, not a physical motor. */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const P=require('../progress.js'),E=require('../engine-v2.js'),L=require('../levels-v2.js'),F=require('../fun-loop.js'),J=require('../journey.js');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'qa-output','sensory'),KEY=P.KEY;
fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),file=path.resolve(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,''));
 if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
let browser,origin;const results=[];
const pass=(tag,extra={})=>{results.push({tag,pass:true,...extra});console.log('PASS '+tag+' '+JSON.stringify(extra));};
const read=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const waitHome=page=>page.waitForFunction(()=>document.body.dataset.v2Screen==='home'&&!document.querySelector('#v2-home').hidden,{},{timeout:15000});
const idle=page=>page.waitForFunction(()=>document.body.dataset.v2Screen==='play'&&document.querySelector('#board').getAttribute('aria-busy')==='false'&&document.querySelector('#modal-backdrop').hidden,{},{timeout:20000});
const shot=(page,name)=>page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false});
function fixture(level=25,pairKinds=null){
 const d=P.defaults();d.profile.unlocked=level;d.profile.hasSeenTutorial=true;
 for(let i=0;i<level-1;i++){d.profile.stars[i]=3;d.profile.journey.stamps[i]=true;}
 const g=new E.Game({...L[level-1],rows:6,cols:6,types:6,requireScore:false,seed:31911+level,buddy:{type:0,tier:1}});
 let move=g.legalMoves().find(m=>!g.terrain[m.from.r][m.from.c]&&!g.terrain[m.to.r][m.to.c]);
 if(pairKinds){g.board[move.from.r][move.from.c].special=pairKinds[0];g.board[move.to.r][move.to.c].special=pairKinds[1];}
 d.session={level,game:g.exportState(),shuffles:2,blasts:2,maxCombo:0,journey:J.createRun(level)};return {data:{version:3,...d},move};
}
async function boot(data=null,{record=false,reducedMotion='no-preference'}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion,locale:'ko-KR',...(record?{recordVideo:{dir:path.join(OUT,'video'),size:{width:390,height:844}}}:{})});
 const errors=[],external=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 await context.addInitScript(({data,key})=>{
   if(data&&!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));
   window.__sensory={events:[],frames:[],collectFrames:false};
   const log=(kind,value)=>window.__sensory.events.push({kind,value,at:performance.now()});
   Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>{log('vibrate',Array.isArray(pattern)?[...pattern]:pattern);return true;}});
   for(const t of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(t,e=>{
     if(e.target.closest?.('#board'))log(t,{x:e.clientX,y:e.clientY});
   },{capture:true,passive:true});
   let prev=0;function frame(now){if(window.__sensory.collectFrames&&prev)window.__sensory.frames.push(now-prev);prev=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
 },{data,key:KEY});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/Lumi animation recovered|Chaeso Pang startup/.test(m.text()))errors.push(m.text());});
 page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push('HTTP '+r.status()+' '+r.url());});
 await page.goto(origin);await waitHome(page);
 await page.evaluate(()=>{
   const log=(kind,value)=>window.__sensory.events.push({kind,value,at:performance.now()});
   const wrap=(obj,name,kind)=>{const fn=obj[name];obj[name]=function(...args){log(kind,args[0]);return fn.apply(this,args);};};
   wrap(LumiAudio.prototype,'play','audio');wrap(LumiAudio.prototype,'playMatch','matchAudio');
   wrap(LumiAudio.prototype,'_tone','tone');wrap(LumiFX.prototype,'comboImpact','halo');
   const fx=LumiFX.prototype.comboImpact;LumiFX.prototype.comboImpact=function(...args){log('comboKind',args[2]);return fx.apply(this,args);};
   const tactile=LumiMobile.feedback;LumiMobile.feedback=function(kind){const sent=tactile(kind);log('feedback',{kind,sent});return sent;};
 });
 await page.locator('[data-action=play]').tap();await idle(page);
 return {context,page,errors,external};
}
async function point(page,p){
 const loc=page.locator('#tiles .tile:not(.retiring)[data-r="'+p.r+'"][data-c="'+p.c+'"]');
 const b=await loc.boundingBox();assert(b);return {x:b.x+b.width/2,y:b.y+b.height/2};
}
async function clearTrace(page){await page.evaluate(()=>{window.__sensory.events=[];window.__sensory.frames=[];window.__sensory.collectFrames=true;});}
async function trace(page){return page.evaluate(()=>{window.__sensory.collectFrames=false;return window.__sensory;});}
async function tapMove(page,m){await page.locator('#board').scrollIntoViewIfNeeded();const a=await point(page,m.from),b=await point(page,m.to);await page.touchscreen.tap(a.x,a.y);await page.touchscreen.tap(b.x,b.y);}
async function swipe(env,m,{measure=false,cancel=false}={}){
 const {page,context}=env;
 await page.locator('#board').scrollIntoViewIfNeeded();const a=await point(page,m.from),b=await point(page,m.to);
 const tile=page.locator('#tiles .tile:not(.retiring)[data-r="'+m.from.r+'"][data-c="'+m.from.c+'"]');
 const start=await tile.evaluate(n=>{const matrix=new DOMMatrixReadOnly(getComputedStyle(n).transform);return {x:matrix.m41,y:matrix.m42};});
 const cdp=await context.newCDPSession(page),dx=b.x-a.x,dy=b.y-a.y;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+dx*.55,y:a.y+dy*.55}]});
 let metrics=null;
 if(measure){
   metrics=await tile.evaluate((n,{start,dx,dy})=>{const mat=new DOMMatrixReadOnly(getComputedStyle(n).transform);const amount=Math.abs(dx)>Math.abs(dy)?(mat.m41-start.x)*Math.sign(dx):(mat.m42-start.y)*Math.sign(dy);const move=window.__sensory.events.filter(e=>e.kind==='pointermove').at(-1);return {distance:Math.round(amount*10)/10,expected:Math.round(Math.max(Math.abs(dx),Math.abs(dy))*.55*10)/10,readAfterEventMs:move?Math.round((performance.now()-move.at)*10)/10:null};},{start,dx,dy});
 }
 if(cancel)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 else {
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await cdp.detach();return metrics;
}
async function verify(env){assert.deepEqual(env.errors,[],'browser errors');assert.deepEqual(env.external,[],'unexpected server requests');await env.context.close();}
function summary(t){
 const up=t.events.filter(e=>e.kind==='pointerup').at(-1),impact=t.events.find(e=>e.kind==='feedback'&&e.value.kind==='combo'),sound=t.events.find(e=>e.kind==='audio'&&String(e.value).startsWith('combo-')),halo=t.events.find(e=>e.kind==='comboKind'),vibe=t.events.find(e=>e.kind==='vibrate'&&Array.isArray(e.value)&&e.value[0]===18);
 const frames=t.frames.filter(x=>x>0&&x<500).sort((a,b)=>a-b),round=n=>Math.round(n*10)/10;
 return {releaseToImpactMs:up&&impact?round(impact.at-up.at):null,audioToHapticMs:sound&&impact?round(Math.abs(sound.at-impact.at)):null,haloToHapticMs:halo&&impact?round(Math.abs(halo.at-impact.at)):null,vibrationPattern:vibe?.value||null,frameSamples:frames.length,frameP95Ms:frames.length?round(frames[Math.min(frames.length-1,Math.floor(frames.length*.95))]):null};
}
async function combos(){
 for(const [name,kinds] of [['line-line',['row','col']],['line-bomb',['row','bomb']],['bomb-bomb',['bomb','bomb']],['rainbow-special',['rainbow','row']],['rainbow-rainbow',['rainbow','rainbow']]]){
   const {data,move}=fixture(25,kinds),env=await boot(data,{record:name==='line-bomb'}),{page}=env;
   await clearTrace(page);const metrics=await swipe(env,move,{measure:true});
   assert(metrics.distance>=metrics.expected*.74&&metrics.distance<=metrics.expected*1.25,'drag did not follow finger '+JSON.stringify(metrics));
   await page.waitForFunction(kind=>window.__sensory.events.some(e=>e.kind==='comboKind'&&e.value===kind),name,{timeout:5000});
   await shot(page,'combo-'+name);
   await idle(page);const t=await trace(page),stats=summary(t),saved=await read(page);
   assert.equal(saved.session.game.moves,data.session.game.moves-1);
   assert(t.events.some(e=>e.kind==='audio'&&e.value==='combo-'+name));
   assert(stats.vibrationPattern,'combo vibration API was not called '+JSON.stringify({stats,device:await page.evaluate(()=>({touch:navigator.maxTouchPoints,coarse:matchMedia('(pointer:coarse)').matches,native:LumiMobile.native,hidden:document.hidden,haptics:JSON.parse(localStorage.getItem('lumi-garden-v3')).settings.haptics})),events:t.events.filter(e=>['feedback','vibrate','comboKind'].includes(e.kind))}));
   assert(stats.audioToHapticMs!==null&&stats.audioToHapticMs<35,'audio and haptic out of sync');
   assert(stats.haloToHapticMs!==null&&stats.haloToHapticMs<35,'visual and haptic out of sync');
   assert(stats.releaseToImpactMs!==null&&stats.releaseToImpactMs<650,'impact too late');
   pass('actual touch '+name,{drag:metrics,...stats});await verify(env);
 }
}
async function interruption(){
 const {data,move}=fixture(25,['row','bomb']),env=await boot(data),{page}=env;
 const expected=E.Game.fromState(data.session.game);assert(expected.play(move.from,move.to).valid);
 await clearTrace(page);await swipe(env,move);
 await page.waitForFunction(()=>document.querySelector('#board').getAttribute('aria-busy')==='true');
 await page.locator('#v2-home-back').tap();await waitHome(page);
 await page.waitForTimeout(950);
 assert.equal(await page.locator('body').getAttribute('data-v2-screen'),'home');
 let s=await read(page);assert.deepEqual(s.session.game,expected.exportState());
 await page.locator('[data-action=play]').tap();await idle(page);
 assert.equal(Number(await page.locator('#moves').textContent()),expected.moves);
 assert.equal((await page.locator('#tiles .tile:not(.retiring)').count()),36);
 s=await read(page);assert.deepEqual(s.session.game,expected.exportState());
 pass('interrupt active cascade and resume exact committed board');await verify(env);
}
async function selection(){
 const env=await boot(),{page}=env;
 let g=E.Game.fromState((await read(page)).session.game),first=F.introHint(g);assert(first);
 await page.locator('#board').scrollIntoViewIfNeeded();
 const a=await point(page,first.from),b=await point(page,first.to);
 await page.touchscreen.tap(a.x,a.y);await page.waitForTimeout(800);
 assert.equal(await page.locator('#tiles .tile[data-r="'+first.from.r+'"][data-c="'+first.from.c+'"]').getAttribute('aria-selected'),'true');
 await page.touchscreen.tap(b.x,b.y);await idle(page);
 assert.equal((await read(page)).session.game.moves,g.moves-1);pass('automatic hint never clears active selection');await verify(env);
}
async function invalidAndMute(){
 const {data}=fixture(16),env=await boot(data),{page}=env,g=E.Game.fromState(data.session.game);
 let invalid=null;
 for(let r=0;r<6&&!invalid;r++)for(let c=0;c<5&&!invalid;c++){
   const q={from:{r,c},to:{r,c:c+1}},copy=E.Game.fromState(g.exportState()),result=copy.play(q.from,q.to);
   if(!result.valid&&result.events.some(e=>e.kind==='invalid'))invalid=q;
 }
 assert(invalid);await clearTrace(page);await swipe(env,invalid);await idle(page);
 assert.deepEqual((await read(page)).session.game,data.session.game);
 const t=await trace(page),kinds=t.events.filter(e=>e.kind==='feedback').map(e=>e.value.kind);
 assert.deepEqual(kinds,['invalid']);assert(t.events.some(e=>e.kind==='vibrate'&&e.value===8));
 pass('invalid swipe has one distinct feedback and no consumed move');
 const m=g.hint();await clearTrace(page);await swipe(env,m,{cancel:true});await page.waitForTimeout(360);assert.deepEqual((await read(page)).session.game,data.session.game);
 assert(!(await page.locator('.tile.dragging,.tile.swap-target').count()));pass('touch cancellation restores board and never consumes a turn');
 await page.locator('#settings-button').tap();await page.waitForSelector('#haptics-setting');
 await page.locator('#haptics-setting').uncheck();await page.locator('#music-setting').uncheck();await page.locator('#sfx-setting').uncheck();
 await page.locator('#modal-actions .primary-button').tap();await idle(page);await clearTrace(page);
 await tapMove(page,g.hint());await idle(page);
 const mute=await trace(page);assert(!mute.events.some(e=>e.kind==='vibrate'&&e.value!==0));
 assert(!mute.events.some(e=>e.kind==='tone'),'sound oscillator was generated with sound disabled');
 assert.equal((await read(page)).session.game.moves,g.moves-1);pass('sound and haptic settings suppress physical API calls, not gameplay');await verify(env);
}
async function controller(){
 const {data}=fixture(16),env=await boot(data),{page}=env;
 const detail=await page.evaluate(()=>{
   let at=0,active=true,cancels=0;const calls=[],h=LumiMobile.createFeedback({now:()=>at,active:()=>active,send:c=>{calls.push(c);return true;},cancel:()=>cancels++});
   const outcomes=[];outcomes.push(h.feedback('match'));at=8;outcomes.push(h.feedback('cascade'));at=22;outcomes.push(h.feedback('combo'));at=45;outcomes.push(h.feedback('match'));at=60;outcomes.push(h.feedback('win'));h.setEnabled(false);at=400;outcomes.push(h.feedback('win'));h.setEnabled(true);active=false;outcomes.push(h.feedback('match'));return {outcomes,cancels,patterns:calls.map(c=>c.pattern)};
 });
 assert.deepEqual(detail.outcomes,[true,false,true,false,true,false,false]);assert.equal(detail.cancels,1);pass('feedback priority, cooldown, disable and inactive gate',detail);await verify(env);
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});try{await controller();await combos();await interruption();await selection();await invalidAndMute();}finally{await browser.close();}})().then(()=>{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({passed:results.length,results},null,2));console.log(JSON.stringify({passed:results.length,results}));},error=>{console.error(error);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({passed:results.length,results,error:String(error)},null,2));process.exitCode=1;}).finally(()=>server.close());
