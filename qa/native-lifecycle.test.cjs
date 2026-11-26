/* Native bridge contract: Android back is consumed by navigation before exit,
 * unsupported optional plugins stay harmless, and inactive apps stop feedback. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','mobile.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const results=[];

function boot({native=true,plugins={},registerPlugin,capacitor=true}={}){
  const window=new EventTarget(),document=new EventTarget(),vibrations=[],classes=[];
  let time=0;
  document.hidden=false;
  document.documentElement={classList:{add:name=>classes.push(name)}};
  document.querySelector=()=>null;
  window.matchMedia=()=>({matches:true});
  window.innerWidth=390;window.innerHeight=844;
  if(capacitor)window.Capacitor={isNativePlatform:()=>native,Plugins:plugins,registerPlugin};
  const navigator={maxTouchPoints:1,vibrate:value=>{vibrations.push(Array.isArray(value)?Array.from(value):value);return true;}};
  const context={window,document,navigator,CustomEvent,performance:{now:()=>time},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}};
  vm.runInNewContext(source,context,{filename:'mobile.js'});
  return {window,document,mobile:window.LumiMobile,vibrations,classes,advance:ms=>{time+=ms;}};
}

function appBridge(extra={}){
  const callbacks=new Map(),calls={exit:0};
  const App={addListener:(name,fn)=>{callbacks.set(name,fn);return Promise.resolve({remove:()=>{}});},exitApp:()=>{calls.exit++;return Promise.resolve();},...extra};
  return {App,callbacks,calls};
}

async function check(name,run){await run();await tick();results.push(name);console.log('PASS '+name);}

(async()=>{
  await check('handled Android back stays in the app; unhandled back exits exactly once',async()=>{
    const bridge=appBridge(),b=boot({plugins:{App:bridge.App}});
    assert.deepEqual([...bridge.callbacks.keys()].sort(),['appStateChange','backButton']);
    const consume=event=>{assert.equal(event.cancelable,true);event.preventDefault();};
    b.window.addEventListener('lumi:back',consume);
    bridge.callbacks.get('backButton')();
    assert.equal(bridge.calls.exit,0,'A modal, navigation or failed save must prevent exit');
    b.window.removeEventListener('lumi:back',consume);
    bridge.callbacks.get('backButton')();
    assert.equal(bridge.calls.exit,1,'One unhandled native event must request one exit');
  });

  await check('optional native plugins and synchronous unsupported methods cannot crash startup or back',async()=>{
    assert(boot().mobile.native);
    assert(boot({registerPlugin:()=>{throw Error('Plugin unavailable');}}).mobile.native);
    const bridge=appBridge({exitApp:()=>{throw Error('Exit unsupported');}});
    const b=boot({plugins:{App:bridge.App,ScreenOrientation:{lock:()=>{throw Error('Orientation unsupported');}}}});
    bridge.callbacks.get('backButton')();
    assert.equal(b.mobile.feedback('match'),true,'Missing native haptics still allow web feedback');
    const missing=appBridge();delete missing.App.exitApp;
    boot({plugins:{App:missing.App}});missing.callbacks.get('backButton')();
    assert(boot({plugins:{App:{addListener:()=>{throw Error('Listener unsupported');}},Haptics:{},ScreenOrientation:{}}}).mobile.native);
    assert.equal(boot({plugins:{Haptics:{impact:()=>{throw Error('Haptic unsupported');}}}}).mobile.feedback('match'),false);
  });

  await check('rejected bridge promises do not escape as unhandled errors',async()=>{
    let exits=0,impacts=0;const callbacks=new Map();
    const b=boot({plugins:{
      App:{addListener:(name,fn)=>{callbacks.set(name,fn);return Promise.reject(Error('Listener rejected'));},exitApp:()=>{exits++;return Promise.reject(Error('Exit rejected'));}},
      ScreenOrientation:{lock:()=>Promise.reject(Error('Orientation rejected'))},
      Haptics:{impact:()=>{impacts++;return Promise.reject(Error('Haptic rejected'));}}
    }});
    callbacks.get('backButton')();b.mobile.feedback('match');
    await tick();assert.equal(exits,1);assert.equal(impacts,1);
  });

  await check('web execution installs no native lifecycle hooks',async()=>{
    let nativeCalls=0;const unsupported=()=>{nativeCalls++;throw Error('Native API called on web');};
    const b=boot({native:false,plugins:{App:{addListener:unsupported,exitApp:unsupported},ScreenOrientation:{lock:unsupported},Haptics:{impact:unsupported}},registerPlugin:unsupported});
    assert.equal(b.mobile.native,false);assert.deepEqual(b.classes,[]);assert.equal(nativeCalls,0);
    assert.equal(boot({capacitor:false}).mobile.native,false);
    b.window.dispatchEvent(new CustomEvent('lumi:back',{cancelable:true}));
    assert.equal(nativeCalls,0);
  });

  await check('native background transition cancels web vibration and suppresses new feedback until active',async()=>{
    const bridge=appBridge(),b=boot({plugins:{App:bridge.App}}),states=[];
    b.window.addEventListener('lumi:app-state',event=>states.push(event.detail.active));
    assert.equal(b.mobile.feedback('combo'),true);assert.deepEqual(b.vibrations,[[18,27,19]]);
    bridge.callbacks.get('appStateChange')({isActive:false});
    assert.deepEqual(b.vibrations,[[18,27,19],0]);
    b.advance(1000);assert.equal(b.mobile.feedback('win'),false);assert.equal(b.vibrations.length,2);
    bridge.callbacks.get('appStateChange')({isActive:true});
    assert.equal(b.mobile.feedback('match'),true);assert.deepEqual(b.vibrations,[[18,27,19],0,10]);
    assert.deepEqual(states,[false,true]);
  });

  console.log(JSON.stringify({passed:results.length,tests:results}));
})().catch(error=>{console.error(error);process.exitCode=1;});
