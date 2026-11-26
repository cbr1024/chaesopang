/* Native lifecycle and small tactile cues; the web version remains standalone. */
(function (root) {
  'use strict';
  // One tactile cue per actual impact. Stronger cues may replace weaker ones,
  // never build an asynchronous vibration queue or punish the user with repeated buzzes.
  const PATTERNS=Object.freeze({
    light:{pattern:7,priority:1,hold:38,style:'LIGHT'},
    invalid:{pattern:8,priority:1,hold:55,style:'LIGHT'},
    match:{pattern:10,priority:2,hold:45,style:'LIGHT'},
    cascade:{pattern:14,priority:3,hold:55,style:'MEDIUM'},
    special:{pattern:[13,22,12],priority:4,hold:76,style:'MEDIUM'},
    combo:{pattern:[18,27,19],priority:5,hold:90,style:'HEAVY'},
    fever:{pattern:[13,24,14,24,20],priority:6,hold:114,style:'HEAVY'},
    win:{pattern:[12,36,18,36,24],priority:7,hold:146,notification:'SUCCESS'}
  });
  function createFeedback({now,active,send,cancel}){
    let enabled=true,last=-Infinity,until=-Infinity,priority=0;
    function stop(){try{cancel?.();}catch{}last=-Infinity;until=-Infinity;priority=0;}
    return Object.freeze({
      setEnabled(value){enabled=Boolean(value);if(!enabled)stop();},
      stop,
      feedback(kind='light'){
        if(!enabled||!active())return false;
        const cue=PATTERNS[kind]||PATTERNS.light,t=now();
        if(t-last<18||(t<until&&cue.priority<=priority))return false;
        try{if(send(cue)===false)return false;}catch{return false;}
        last=t;until=t+cue.hold;priority=cue.priority;return true;
      }
    });
  }
  const cap = root.Capacitor;
  let appActive=true,webVibrating=false,lastPointer='';
  document.addEventListener('pointerdown',event=>{lastPointer=event.pointerType||'';},{capture:true,passive:true});
  const native = (() => {try{return Boolean(cap?.isNativePlatform?.());}catch{return false;}})();
  const plugin = name => {try{return native ? (cap?.Plugins?.[name] || cap?.registerPlugin?.(name) || null) : null;}catch{return null;}};
  const Haptics = plugin('Haptics'), App = plugin('App'), Orientation = plugin('ScreenOrientation');
  // An optional bridge may be missing, reject asynchronously, or throw before
  // returning a Promise. None of those cases should prevent the web game loading.
  const quiet = operation => {try{Promise.resolve(operation()).catch(() => {});return true;}catch{return false;}};
  const emit = (name, detail) => root.dispatchEvent(new CustomEvent(name, {detail}));
  const tactile=createFeedback({
    now:()=>performance.now(),
    active:()=>appActive&&!document.hidden,
    send:cue=>{
      const method=cue.notification?'notification':'impact';
      if(typeof Haptics?.[method]==='function')return quiet(()=>Haptics[method](cue.notification?{type:cue.notification}:{style:cue.style}));
      if(typeof navigator.vibrate==='function'&&(lastPointer==='touch'||lastPointer==='pen'||Number(navigator.maxTouchPoints)>0||root.matchMedia('(pointer:coarse)').matches)){
        const ok=navigator.vibrate(Array.isArray(cue.pattern)?cue.pattern.slice():cue.pattern);
        webVibrating=ok!==false;return webVibrating;
      }
      return false;
    },
    cancel:()=>{if(webVibrating){navigator.vibrate?.(0);webVibrating=false;}}
  });
  if (native) {
    document.documentElement.classList.add('native-app');
    quiet(()=>Orientation?.lock?.({orientation:'portrait'}));
    quiet(()=>App?.addListener?.('appStateChange', state => {appActive=Boolean(state.isActive);if(!appActive)tactile.stop();emit('lumi:app-state', {active:appActive});}));
    quiet(()=>App?.addListener?.('backButton', () => {
      // A registered native listener disables Android's default back behavior.
      // Dialogs, the board and unsaved progress can consume this event; only an
      // unhandled back from the application's root reaches the native exit.
      const event=new CustomEvent('lumi:back',{cancelable:true});
      if(root.dispatchEvent(event))quiet(()=>App?.exitApp?.());
    }));
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)tactile.stop();});
  root.addEventListener('pagehide',()=>tactile.stop());
  root.LumiMobile = {
    native,
    setHaptics:tactile.setEnabled,
    stopFeedback:tactile.stop,
    feedback:tactile.feedback,
    createFeedback
  };
  // Fit only the board. The mission/score/companion HUD keeps its full readable
  // width; short screens scroll rather than reducing six touch cells below
  // their intended size. Safe-area padding is already part of the shell.
  let fitFrame=0,fitObserver=null;
  function fit() {
    cancelAnimationFrame(fitFrame);
    fitFrame=requestAnimationFrame(()=>{
      fitFrame=0;
      const shell=document.querySelector('.app-shell'),game=document.querySelector('.game'),board=document.querySelector('.board-wrap');
      if(!shell||!game||!board)return;
      if(!game.getClientRects().length||!board.clientWidth)return;
      shell.style.removeProperty('--mobile-board-width');
      if(root.innerWidth>959){shell.style.removeProperty('--board-fit-size');return;}
      const css=getComputedStyle(shell),rect=game.getBoundingClientRect(),boardRect=board.getBoundingClientRect();
      const number=value=>Number.parseFloat(value)||0;
      const header=document.querySelector('.app-header')?.getBoundingClientRect().height||0;
      const footer=document.querySelector('.page-footer')?.getBoundingClientRect().height||0;
      const layout=document.querySelector('.game-layout'),layoutCss=layout?getComputedStyle(layout):null;
      const pads=number(css.paddingTop)+number(css.paddingBottom)+(layoutCss?number(layoutCss.paddingTop)+number(layoutCss.paddingBottom):0);
      const availableWidth=Math.min(420,game.clientWidth,shell.clientWidth-number(css.paddingLeft)-number(css.paddingRight));
      const viewportHeight=root.visualViewport?.height||root.innerHeight;
      const availableHeight=viewportHeight-header-footer-pads-(rect.height-boardRect.height)-8;
      const minimum=Math.min(308,availableWidth);
      const value=Math.floor(Math.max(minimum,Math.min(availableWidth,availableHeight)))+'px';
      if(shell.style.getPropertyValue('--board-fit-size')!==value)shell.style.setProperty('--board-fit-size',value);
    });
  }
  root.LumiMobile.fit=fit;
  root.addEventListener('resize',fit,{passive:true});
  root.visualViewport?.addEventListener('resize',fit,{passive:true});
  document.addEventListener('DOMContentLoaded',()=>{
    fit();requestAnimationFrame(fit);
    if(root.ResizeObserver){fitObserver=new root.ResizeObserver(fit);const game=document.querySelector('.game');if(game)fitObserver.observe(game);}
  });
})(window);
