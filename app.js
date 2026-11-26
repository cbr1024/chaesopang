/* Chaeso Pang V6 — every little match leaves a trace in the Sunpatch. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  let sessionInterrupted=false, interruptSession=()=>{};
  function blockSession(reason='blocked') {
    sessionInterrupted=true;interruptSession();
    const notice=$('session-notice');
    $('session-title').textContent=reason==='blocked'?'다른 창에서 함께 놀고 있어요':'새로운 정원 기록을 불러올게요';
    $('session-description').textContent=reason==='blocked'
      ?'기록을 안전하게 간직하려고 한 창에서만 플레이해요. 다른 게임 창을 닫은 뒤 다시 불러와 주세요.'
      :'다른 창의 기록이나 새로 저장된 진행을 확인했어요. 최신 기록을 불러오면 안전하게 이어갈 수 있어요.';
    document.querySelector('.app-shell').inert=true;
    $('modal-backdrop').inert=true;
    notice.hidden=false;document.body.style.overflow='hidden';
    $('session-reload').focus({preventScroll:true});
  }
  $('session-reload').addEventListener('click',()=>location.reload());
  $('session-notice').addEventListener('keydown',event=>{
    if(event.key==='Tab'){event.preventDefault();$('session-reload').focus();}
  });
  const sessionGuard=LumiSession.createGuard({onChange:state=>{
    if(state.status==='lost')blockSession(state.reason||'lost');
  }});
  LumiSession.current=sessionGuard;
  if(!await sessionGuard.acquire()){blockSession('blocked');return;}
  window.addEventListener('lumi:storage-conflict',()=>blockSession('conflict'));
  window.addEventListener('pageshow',event=>{if(event.persisted)blockSession('resume');});
  const icon = id => '<svg class="icon" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const esc = text => String(text).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const wait = ms => new Promise(resolve => setTimeout(resolve, motion.matches ? Math.min(ms, 20) : ms));
  const same = (a,b) => Boolean(a && b && a.r === b.r && a.c === b.c);
  const neighbors = (a,b) => Math.abs(a.r-b.r) + Math.abs(a.c-b.c) === 1;
  const initial = LumiProgress.load();
  const profile = initial.profile;
  const settings = initial.settings;
  const TOTAL = LumiLevels.length;
  const ranking = new LumiRanking({baseUrl:LumiConfig.rankingApiBase,timeoutMs:LumiConfig.rankingTimeout});
  let rankRun=null, rankSubmission=null, rankStartIssue=null, rankRequest=0, rankFetch=0, rankRetry=null, rankScope="campaign", rankPeriod="week", rankStage=1;
  let sidebarSignature="", scoreTarget=-1, reactionSequence=0;
  LumiMobile.setHaptics(settings.haptics);
  const fx = new LumiFX({canvas:$('effects'),ambientCanvas:$('ambient'),boardEl:$('board')});
  const audio = new LumiAudio();
  let uid = 0;
  const art = (type, mood = 'idle') => LumiArt.sprite(type, 'ui-' + (++uid), mood);
  const portrait = (type,mood='happy') => LumiHome.portrait(profile,type,mood);
  let screen='play', gardenChapter=1, mode='campaign', dailyDay=null;
  let game, level = 1, busy = false, turnInFlight=false, blastMode = false, shuffles = 2, blasts = 2, maxCombo = 0;
  let storedSession = initial.session, modalType = null, pendingModal = null, returnFocus = null;
  let epoch = 0, hintTimer, toastTimer, buddyTimer, comboAnimation, comboTimer, scoreAnimation;
  let shownScore = 0, goalsSignature = '', storageNotice = false, lastFever = false, resultDetails = {};
  let companionSignature='', companionAnimation=null, reactionUntil=0, reactionPriority=0, coachTimer=null, coachCheckTimer=null, coachKind=null, coachVisibleSince=null, newSpecial=null;
  let weeklyState=null, claimBusy=false, recoveryBusy=false, backupBusy=false, weeklyRecipient=profile.selectedBuddy, lastLowWarning=-1, friendshipAnimation=null;
  let journeyRun=null, journeySignature='';
  const view = new LumiBoard({
    board:$('board'),tiles:$('tiles'),budLayer:$('bud-layer'),cells:$('board-cells'),wrap:$('board-wrap'),fx,
    onChoose:choose, onSwap:swap, onInteract:unlockAudio,
    onCue:(kind,event)=>{if(kind==='impact'){
      if(event.specialCombo)audio.play('combo-'+event.specialCombo,event.combo);
      else if(event.activated.length || event.created.length)audio.play('special',event.combo);
      else if(audio.playMatch){
        const counts=Array(6).fill(0);for(const cell of event.cells)counts[cell.tile.type]++;
        audio.playMatch(counts.indexOf(Math.max(...counts)),event.combo,Math.min(1.5,1+event.cells.length/36));
      }else audio.play('match',event.combo);
      const major=Boolean(event.specialCombo),special=Boolean(event.activated.length||event.created.length),cleared=event.bloomedCells.length||(event.terrainHit||[]).some(t=>!t.after),delivered=(event.deliveryHit||[]).some(t=>t.delivered);
      LumiMobile.feedback(major?'combo':special||delivered?'special':event.combo>1?'cascade':'match');
      if(!major&&!special){if(cleared)audio.play('bloom');else if(delivered)audio.play('seedReward');}
      if(major)combo(event.combo,false,event.specialCombo);else if(event.combo>1)combo(event.combo);
      if(mode==='campaign'){
        if(event.combo>=4)buddy('excited',event.combo+'연쇄! 우리 정말 잘 맞는다!','combo');
        else if(special)buddy('excited','반짝! 우리 마법이 터졌어!','special');
        else buddy('happy',event.combo>1?event.combo+'연쇄! 행복이 이어져!':'좋아! 마음이 한 뼘 가까워졌어.','match');
      }
      collectionTrails(event);hud(event);
    }},
    onEscape:() => { blastMode=false; view.select(null); controls(); setHint(); scheduleHint(); }
  });
  interruptSession=()=>{
    epoch++;busy=true;turnInFlight=false;modalType=null;clearHints();dismissSpecialCoach();
    clearTimeout(buddyTimer);clearTimeout(comboTimer);cancelAnimationFrame(scoreAnimation);
    comboAnimation?.cancel();companionAnimation?.cancel();view.setDisabled(true);
    fx.setPaused(true);audio.suspend(true);LumiMobile.stopFeedback?.();
  };

  function unlockAudio() { if(!sessionInterrupted)audio.unlock(); }
  function applyAudio() {
    audio.setMusicEnabled(settings.music); audio.setSfxEnabled(settings.sfx);
    audio.setVolume(settings.volume); audio.setEnabled(settings.music || settings.sfx);
    const enabled=settings.music || settings.sfx;
    $('sound-button').innerHTML=icon(enabled?'sound':'muted');
    $('sound-button').setAttribute('aria-label',enabled?'전체 소리 끄기':'전체 소리 켜기');
    $('sound-button').setAttribute('aria-pressed',String(enabled));
  }
  applyAudio();
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('keydown',event=>{if(['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))unlockAudio();});

  function persist() {
    if(sessionInterrupted || backupBusy || !sessionGuard.canWrite())return false;
    LumiProgress.rememberMemories(profile);
    const okay=LumiProgress.save({profile,settings,session:storedSession});
    if(!okay && !storageNotice) { storageNotice=true; toast('저장하지 못했어요. 새로고침 전에 다시 저장해 주세요.',4500); }
    if(okay)storageNotice=false;
    $('v2-storage-warning').hidden=okay;
    return okay;
  }
  function rememberSession() {
    if(mode==='daily')return persist();
    storedSession=game && !game.won && !game.over ? {level,game:game.exportState(),shuffles,blasts,maxCombo,journey:LumiJourney.createRun(level,journeyRun)} : null;
    return persist();
  }
  function toast(text,duration=2300) {
    clearTimeout(toastTimer); $('board-toast').textContent=text; $('board-toast').classList.add('visible');
    toastTimer=setTimeout(()=>$('board-toast').classList.remove('visible'),duration);
  }
  const isV2Game=()=>game instanceof LumiEngineV2.Game;
  const activeDefinition=(id=level)=>{
    const state=storedSession?.level===id?storedSession.game:null;
    if(state)return state.version!==LumiEngineV2.STATE_VERSION?LumiLevels[id-1]:state.rulesRevision===LumiEngineV2.FUN_REVISION?LumiLevelsFun[id-1]:LumiLevelsV2[id-1];
    return LumiLevelsFun[id-1];
  };
  const coaching=()=>mode==='campaign'&&level===1&&isV2Game()&&!profile.stars[0]?LumiFun.introHint(game):null;
  const terrainName=kind=>({weed:'잡초',frost:'서리',crate:'상자',delivery:'씨앗 운반'})[kind]||kind;
  const terrainIcon=kind=>icon(({weed:'leaf',frost:'frost',crate:'crate',delivery:'seed'})[kind]||'leaf');
  function setHint(text) {
    $('play-hint').textContent=text || (mode==='daily'?'15턴 안에 최대 점수! 오늘은 모두 같은 시작 보드를 사용해요.':coaching()?.text|| (blastMode?'꽃비를 내릴 친구를 톡! 주변 3×3칸이 꽃피어요':profile.hasSeenTutorial?(activeDefinition()?.recommendedSkill||'남은 목표를 먼저 확인해요'):'같은 빛모습 3개를 나란히 모아보세요'));
  }
  function controls() {
    const ended=game && (game.won || game.over);
    view.setDisabled(sessionInterrupted || busy || screen!=='play' || Boolean(modalType) || ended);
    view.setBlastMode(blastMode);
    $('v2-home-back').disabled=(busy&&!turnInFlight) || backupBusy || recoveryBusy || sessionInterrupted;
    $('hint-button').disabled=busy || ended;
    $('shuffle-button').disabled=busy || ended || mode==='daily' || shuffles<1;
    $('blast-button').disabled=busy || ended || mode==='daily' || blasts<1;
    $('shuffle-count').textContent=shuffles; $('blast-count').textContent=blasts;
    $('shuffle-button').setAttribute('aria-label','보드 섞기, '+shuffles+'회 남음');
    $('blast-button').setAttribute('aria-label','마법 터뜨리기, '+blasts+'회 남음');
    $('blast-button').setAttribute('aria-pressed',String(blastMode));
    $('blast-button').classList.toggle('active',blastMode);
    $('board').setAttribute('aria-busy',String(busy));
    const finished=Boolean(ended && !busy);
    $('finish-dock').hidden=!finished;
    document.body.classList.toggle('has-finished',finished);
    if(finished){
      if(mode==='daily'){$('finish-dock-title').textContent='오늘의 도전 완료!';$('finish-dock-stars').innerHTML=starMarkup(LumiFun.medal(game.score));$('finish-next').textContent='도전 기록 보기 →';return;}
      $('finish-dock-title').textContent=game.won?'정원이 활짝 피었어요!':'조금만 더, 함께 해봐요';
      $('finish-dock-stars').innerHTML=game.won?starMarkup(game.stars):icon('heart');
      $('finish-next').innerHTML=(game.won?(level<TOTAL?'다음 단계로':'햇살밭 지도 보기'):'다시 도전')+' <span aria-hidden="true">→</span>';
    }
  }
  function pulse(node) {
    if(!node || motion.matches) return;
    node.animate([{transform:'scale(1)'},{transform:'scale(1.17)',offset:.4},{transform:'scale(1)'}],{duration:270,easing:'ease-out'}).finished.catch(()=>{});
  }
  function prepareGoals(snapshot) {
    const terrainGoals=Object.entries(snapshot.terrainGoal||{}).filter(([,n])=>n>0);
    const signature=mode+'|'+snapshot.objectives.map(g=>g.type+':'+g.target).join('|')+'|'+snapshot.budsGoal+'|'+JSON.stringify(terrainGoals)+'|'+(snapshot.deliveryGoal||0);
    if(signature===goalsSignature)return;
    goalsSignature=signature;
    if(mode==='daily'){$('mission-goals').innerHTML='<div class="daily-score-goal">'+icon('trophy')+'<span>최고 점수 도전</span></div>';$('mission-goals').classList.remove('many');return;}
    $('mission-goals').innerHTML=snapshot.objectives.map(g=>'<div class="mission-goal" id="goal-'+g.type+'"><span class="goal-art">'+art(g.type)+'</span><strong>'+g.target+'</strong></div>').join('')+
      (snapshot.budsGoal?'<div class="mission-goal" id="goal-buds"><span class="goal-art goal-bud">'+icon('flower')+'</span><strong>'+snapshot.budsGoal+'</strong></div>':'')+terrainGoals.map(([kind,n])=>'<div class="mission-goal" id="goal-terrain-'+kind+'"><span class="goal-art goal-'+kind+'">'+terrainIcon(kind)+'</span><strong>'+n+'</strong></div>').join('')+(snapshot.deliveryGoal?'<div class="mission-goal" id="goal-delivery"><span class="goal-art goal-delivery">'+terrainIcon('delivery')+'</span><strong>'+snapshot.deliveryGoal+'</strong></div>':'');
    $('mission-goals').classList.toggle('many',snapshot.objectives.length+(snapshot.budsGoal?1:0)+terrainGoals.length+(snapshot.deliveryGoal?1:0)>=4);
  }
  function updateGoal(node,remaining,label) {
    if(!node)return;
    const before=node.dataset.remaining;
    if(before===String(remaining))return;
    node.dataset.remaining=remaining;
    node.classList.toggle('done',remaining===0);
    node.setAttribute('aria-label',label+(remaining===0?' 완료':', '+remaining+'개 남음'));
    node.querySelector('strong').innerHTML=remaining===0?icon('check'):String(remaining);
    if(before!==undefined && before!==String(remaining))pulse(node);
  }
  function hud(snapshot,instant=false) {
    prepareGoals(snapshot);
    for(const goal of snapshot.objectives) updateGoal($('goal-'+goal.type),Math.max(0,goal.target-goal.current),LumiArt.names[goal.type]+'의 팡빛 모으기');
    if(snapshot.budsGoal)updateGoal($('goal-buds'),Math.max(0,snapshot.budsGoal-snapshot.bloomed),'꽃봉오리 피우기');
    for(const [kind,n] of Object.entries(snapshot.terrainRemaining||{}))if(snapshot.terrainGoal[kind])updateGoal($('goal-terrain-'+kind),n,terrainName(kind)+' 제거');
    if(snapshot.deliveryGoal)updateGoal($('goal-delivery'),snapshot.deliveryRemaining,'씨앗 운반');
    const from=shownScore,to=snapshot.score,start=performance.now();
    if (to!==scoreTarget || instant) {
    scoreTarget=to; cancelAnimationFrame(scoreAnimation);
    const tick=now=>{
      const p=instant || motion.matches?1:Math.min(1,(now-start)/300);
      shownScore=from+(to-from)*(1-Math.pow(1-p,3)); $('score').textContent=fmt(shownScore);
      if(p<1)scoreAnimation=requestAnimationFrame(tick);
    }; tick(start);
    }
    $('moves').textContent=snapshot.moves; $('moves').classList.toggle('low',snapshot.moves<=5 && !snapshot.won);
    const thresholds=mode==='daily'?LumiFun.THRESHOLDS:(snapshot.starThresholds||LumiRewards.starThresholds(snapshot.target));
    const benchmark=thresholds[2];
    $('progress-fill').style.width=Math.min(100,snapshot.score/benchmark*100)+'%';
    $('score-progress').setAttribute('aria-valuemax',Math.round(benchmark));
    $('score-progress').setAttribute('aria-valuenow',Math.min(snapshot.score,Math.round(benchmark)));
    document.querySelectorAll('.progress-star').forEach((n,i)=>{
      const earned=mode==='daily'?snapshot.score>=thresholds[i]:snapshot.won?i<snapshot.stars:!snapshot.over&&snapshot.score>=thresholds[i];
      const wasEarned=n.classList.contains('earned');
      n.classList.toggle('earned',earned);n.style.left=(thresholds[i]/benchmark*100)+'%';
      n.querySelector('small').textContent=fmt(thresholds[i]);
      n.setAttribute('aria-label','별 '+(i+1)+'개 점수선 '+fmt(thresholds[i])+'점'+(earned?(snapshot.won?' · 획득':' · 점수선 도달'):''));
      if(earned&&!wasEarned&&!instant)pulse(n.querySelector('svg'));
    });
    const failed=mode!=='daily'&&snapshot.over&&!snapshot.won;
    const dailyIndex=thresholds.findIndex(n=>n>snapshot.score);
    const next=mode==='daily'?(dailyIndex<0?null:{stars:dailyIndex+1,remaining:thresholds[dailyIndex]-snapshot.score}):failed?null:snapshot.won?(snapshot.stars<3?{stars:snapshot.stars+1,remaining:Math.max(0,thresholds[snapshot.stars]-snapshot.score)}:null):LumiRewards.nextStar(snapshot.score,snapshot.target);
    $('next-star').innerHTML=failed?'<strong>미션을 완성하면 별을 받아요.</strong> 다시 함께 도전해요'
      :next?'별 <strong>'+next.stars+'개</strong>까지 <strong>'+fmt(next.remaining)+'점</strong>'
      :snapshot.won?'<strong>별 3개 획득!</strong> 새로운 최고 기록에 도전해요'
      :'<strong>별 3개 점수선 도달!</strong> 남은 미션을 완성해요';
    if(mode==='daily')$('next-star').textContent=dailyIndex<0?'금메달 점수선 달성! 최고 기록을 높여요.':['동메달','은메달','금메달'][dailyIndex]+'까지 '+fmt(thresholds[dailyIndex]-snapshot.score)+'점';
    $('score-progress').setAttribute('aria-valuetext',fmt(snapshot.score)+'점, '+(failed?'미션 미완성, 획득한 별 0개':next?'별 '+next.stars+'개까지 '+fmt(next.remaining)+'점':snapshot.won?'별 3개 획득':'별 3개 점수선 도달, 미션 완료 필요'));
    const active=snapshot.feverTurns>0&&!snapshot.won&&!snapshot.over;
    $('fever-title').textContent=active?'햇살 합창 · 피버!':'햇살 합창 · 피버';
    $('fever-caption').textContent=active?snapshot.feverTurns+'턴 남음 · 매치 점수 두 배':'충전 '+Math.round(snapshot.feverCharge)+'% · 완충하면 3턴';
    $('fever-multiplier').textContent=active?'×2':Math.round(snapshot.feverCharge)+'%';
    $('fever-fill').style.width=(active?100:snapshot.feverCharge)+'%';
    $('fever-progress').setAttribute('aria-valuenow',active?100:snapshot.feverCharge);
    $('fever-progress').setAttribute('aria-label',active?'피버 '+snapshot.feverTurns+'턴 남음':'피버 게이지');
    document.body.classList.toggle('is-fever',active);
    if(active!==lastFever){lastFever=active;fx.fever(active);audio.setFever(active);}
    $('combo-record').textContent='BEST ×'+maxCombo;
    updateCompanion();
  }
  function companionXp(type,verified=Boolean(ranking.getIdentity()?.id===profile.verifiedBuddyPlayerId && rankRun)) {
    return LumiProgress.buddyTotal(profile,type,verified);
  }
  function updateCompanion() {
    const type=profile.selectedBuddy,c=LumiArt.characters[type],bond=LumiRewards.bond(companionXp(type));
    const active=game?.scoringVersion===4?game.buddy:null,changed=active && active.type!==type;
    const signature=[type,bond.level,bond.progress,changed,active?.tier,LumiWardrobe.selected(profile,type)?.id].join('|');
    if(signature===companionSignature)return;companionSignature=signature;
    $('companion-button').style.setProperty('--buddy-color',c.color);
    $('companion-button').style.setProperty('--buddy-light',c.lightColor);
    $('companion-avatar').innerHTML=portrait(type,'happy');
    $('companion-name').textContent=c.name;
    $('companion-level').textContent=game?.scoringVersion===2?'새 혜택은 다음 정원부터':changed?'다음 판부터 함께':'Lv.'+(active?.tier||bond.level)+' · '+LumiRewards.BONDS[(active?.tier||bond.level)-1].label;
    $('companion-button').setAttribute('aria-label',c.name+' 동행 친구, '+$('companion-level').textContent+(changed?', 이번 판 응원과 클리어 XP는 '+LumiArt.names[active.type]+'에게':'')+', 친밀도와 혜택 보기');
    if(performance.now()>reactionUntil)$('companion-message').textContent=companionIdleMessage();
  }
  function companionIdleMessage() {
    const active=game?.scoringVersion===4?game.buddy:null;
    return active && active.type!==profile.selectedBuddy?'이번 판 응원·XP는 '+LumiArt.names[active.type]+'에게!':LumiArt.characters[profile.selectedBuddy].tagline;
  }
  function syncRewards(payload) {
    if(!payload || sessionInterrupted)return;
    if(payload.companions?.playerId && payload.companions.playerId!==ranking.getIdentity()?.id)return;
    if(payload.companions)LumiProgress.applyCompanions(profile,payload.companions);
    if(payload.weekly)weeklyState=LumiProgress.mergeWeekly(weeklyState,payload.weekly);
    persist();sidebars();updateCompanion();
  }
  function sidebars() {
    const type=profile.selectedBuddy,c=LumiArt.characters[type],bond=LumiRewards.bond(companionXp(type));
    const signature=[type,bond.level,level,profile.unlocked,profile.stars.join(','),profile.journey?.stamps.join(',')].join('|');
    if(signature===sidebarSignature)return; sidebarSignature=signature;
    $('brand-friend').innerHTML=art(type,'happy');
    $('portrait-spirit').innerHTML=portrait(type);
    $('friend-name').textContent=c.name; $('friend-en').textContent=c.en;
    $('friend-tagline').textContent=c.tagline; $('friend-bond').textContent=bond.label;
    $('friend-card').setAttribute('aria-label',c.name+'와 인사하기');
    $('friend-card').style.background='radial-gradient(circle at 50% 32%,#fffcf7,'+c.lightColor+' 74%)';
    $('total-stars').textContent=profile.stars.reduce((a,b)=>a+b,0);
    const completed=profile.stars.filter(n=>n>0).length;
    $('journey-count').textContent=completed+' / '+TOTAL;
    $('journey-fill').style.width=(completed/TOTAL*100)+'%';
    $('journey-tip').textContent=LumiStory.chapterForLevel(level).goal;
    const places=LumiJourney.restorationSummary(profile).reduce((n,c)=>n+c.restored,0);
    $('world-sidebar-count').textContent=places+' / 15 장소에 돌아온 햇살';
    const start=Math.min(TOTAL-5,Math.floor((level-1)/5)*5+1);
    $('mini-path').innerHTML=Array.from({length:6},(_,n)=>{
      const id=start+n,done=profile.stars[id-1]>0,locked=id>profile.unlocked;
      return '<button class="mini-node '+(id===level?'current':done?'complete':'')+'" data-level="'+id+'" '+(locked?'disabled':'')+' aria-label="'+id+'번 정원 '+(locked?'잠김':LumiLevels[id-1].title)+'">'+(locked?icon('lock'):done?icon('check'):id)+'</button>';
    }).join('');
    $('mini-path').querySelectorAll('button').forEach(n=>n.addEventListener('click',()=>showModal('level',{id:Number(n.dataset.level)})));
    $('little-trio').innerHTML=[1,4,5].map(t=>art(t,'happy')).join('');
    updateCompanion();
  }
  function buddy(mood,line,kind='match') {
    const response=LumiStory.characters[profile.selectedBuddy]?.reactions?.[kind];
    const voice=Array.isArray(response)?response[(reactionSequence++)%response.length]:response;
    if(voice && kind!=='selected')line=(kind==='danger'?game.moves+'번 남았어. ':'')+voice;
    const priorities={match:1,greet:2,special:3,combo:4,fever:5,danger:6,lose:8,clear:8,selected:9};
    const priority=priorities[kind]||1,now=performance.now();
    if(now<reactionUntil && (priority<reactionPriority || kind==='match'&&priority===reactionPriority))return;
    reactionPriority=priority;reactionUntil=now+(kind==='match'?850:1700);
    clearTimeout(buddyTimer); $('portrait-spirit').innerHTML=portrait(profile.selectedBuddy,mood);
    const avatar=$('companion-avatar');avatar.innerHTML=portrait(profile.selectedBuddy,mood);
    if(line)$('friend-speech').textContent=line;
    if(line)$('companion-message').textContent=line;
    $('companion-button').dataset.reaction=kind;
    const start=companionAnimation?getComputedStyle(avatar).transform:'none';companionAnimation?.cancel();
    if(!motion.matches){
      const lift=kind==='clear'||kind==='combo'?9:kind==='lose'?2:kind==='match'?3:6;
      companionAnimation=avatar.animate([
        {transform:start==='none'?'translateY(0) scale(1)':start},
        {transform:'translateY(2px) scale(1.08,.92)',offset:.16},
        {transform:'translateY(-'+lift+'px) scale(.96,1.04) rotate(-4deg)',offset:.43},
        {transform:'translateY(0) scale(1.04,.97) rotate(2deg)',offset:.76},
        {transform:'translateY(0) scale(1) rotate(0)'}
      ],{duration:kind==='match'?420:680,easing:'cubic-bezier(.25,.7,.28,1)'});
      companionAnimation.finished.catch(()=>{});
      if(priority>=3){const rect=avatar.getBoundingClientRect();fx.companion?.(rect.x+rect.width/2,rect.y+rect.height/2,LumiArt.colors[profile.selectedBuddy],kind==='clear'?2:1);}
    }
    buddyTimer=setTimeout(()=>{
      reactionUntil=0;reactionPriority=0;$('portrait-spirit').innerHTML=portrait(profile.selectedBuddy,'idle');
      avatar.innerHTML=portrait(profile.selectedBuddy,'idle');$('companion-message').textContent=companionIdleMessage();
      delete $('companion-button').dataset.reaction;
    },kind==='clear'?4200:2700);
  }
  function acknowledgeSpecialCoach() {
    if(coachKind&&!profile.seenSpecials[coachKind]){profile.seenSpecials[coachKind]=true;persist();}
  }
  function dismissSpecialCoach(acknowledged=false) {
    if(acknowledged)acknowledgeSpecialCoach();
    clearTimeout(coachTimer);clearTimeout(coachCheckTimer);coachKind=null;coachVisibleSince=null;
    $('special-coach').hidden=true;view.clearSpecialHighlight?.();
  }
  function inspectSpecialCoach() {
    clearTimeout(coachCheckTimer);
    const coach=$('special-coach');
    if(coach.hidden||!coachKind||sessionInterrupted)return;
    const viewport=window.visualViewport,top=viewport?.offsetTop||0,bottom=top+(viewport?.height||window.innerHeight);
    const boardRect=$('board-wrap').getBoundingClientRect();
    coach.style.bottom=Math.max(8,Math.min(Math.max(8,boardRect.height-coach.offsetHeight-8),boardRect.bottom-bottom+12))+'px';
    const rect=coach.getBoundingClientRect();
    const visible=!document.hidden&&!modalType&&rect.width>0&&rect.height>0&&rect.top>=top&&rect.bottom<=bottom&&rect.left>=0&&rect.right<=window.innerWidth;
    if(visible){
      if(coachVisibleSince===null)coachVisibleSince=performance.now();
      if(performance.now()-coachVisibleSince>=900)acknowledgeSpecialCoach();
    }else coachVisibleSince=null;
    coachCheckTimer=setTimeout(inspectSpecialCoach,180);
  }
  function showSpecialCoach(item) {
    if(!item || profile.seenSpecials[item.kind] || game.won || game.over)return;
    const copy={row:['가로 팡빛을 만들었어요!','이웃과 바꾸면 가로 한 줄이 팡!'],col:['세로 팡빛을 만들었어요!','이웃과 바꾸면 세로 한 줄이 팡!'],bomb:['씨앗 폭탄을 만들었어요!','이웃과 바꾸면 주변 3×3칸이 팡!'],rainbow:['무지개 빛모습을 만들었어요!','이웃과 바꾸면 그 친구 색이 모두 팡!']}[item.kind];
    if(!copy)return;
    const position=game.board.flatMap((row,r)=>row.map((tile,c)=>({tile,r,c}))).find(p=>p.tile.id===item.id);
    if(!position)return;
    dismissSpecialCoach();coachKind=item.kind;
    $('coach-title').textContent=copy[0];$('coach-description').textContent=copy[1];
    $('coach-symbol').innerHTML=LumiArt.special(item.kind,'coach-'+(++uid));
    $('special-coach').hidden=false;
    view.highlightSpecial?.(position);inspectSpecialCoach();
    coachTimer=setTimeout(()=>dismissSpecialCoach(),6500);
  }
  function clearHints(){clearTimeout(hintTimer);view.clearHints();}
  function scheduleHint() {
    clearTimeout(hintTimer);
    if(!game || game.won || game.over || busy || screen!=='play' || modalType || blastMode || document.hidden)return;
    hintTimer=setTimeout(()=>showHint(false),coaching()?300:profile.hasSeenTutorial?9000:2000);
  }
  function showHint(manual=true) {
    if(busy || modalType || !game || game.won || game.over || screen!=='play')return;
    if(!manual&&(view.pointer||view.selected)){clearTimeout(hintTimer);hintTimer=setTimeout(()=>showHint(false),1800);return;}
    clearHints();blastMode=false;view.select(null);controls();setHint();
    const guide=coaching(),pair=guide||(isV2Game()?game.hint():LumiHints.hint(game));if(!pair)return;
    view.showHint(pair);if(guide)setHint(guide.text);
    if(manual){audio.play('hint');toast('반짝이는 두 친구를 바꿔보세요');}
    else if(!profile.hasSeenTutorial)toast('친구를 톡톡 누르거나, 옆으로 밀어봐요!',3000);
    hintTimer=setTimeout(()=>{view.clearHints();scheduleHint();},4500);
  }
  function combo(number,fever=false,special=null) {
    const words=['팡!','빛이 톡톡!','팡빛 물결!','햇살이 활짝!','모두 함께 팡!'];
    const comboNames={'line-line':'십자 햇살!','line-bomb':'꽃비 폭풍!','bomb-bomb':'커다란 씨앗 폭발!','rainbow-special':'무지개 팡빛!','rainbow-rainbow':'햇살 대폭발!'};
    $('combo-label').textContent=fever?'햇살 합창!':comboNames[special]||words[Math.min(number-1,4)];
    $('combo-caption').textContent=fever?'지금부터 · 다음 교환 3회까지 ×2':special?'특수 팡빛 조합 성공!':number+'연쇄 · 마음을 잇는 팡빛';
    clearTimeout(comboTimer);comboAnimation?.cancel();
    const display=$('combo-display');display.style.removeProperty('opacity');display.style.removeProperty('transform');
    if(motion.matches){
      display.style.opacity='1';display.style.transform='none';
      comboTimer=setTimeout(()=>{display.style.removeProperty('opacity');display.style.removeProperty('transform');},1100);
      return;
    }
    comboAnimation=$('combo-display').animate([
      {opacity:0,transform:'translateY(8px) scale(.55) rotate(-7deg)'},
      {opacity:1,transform:'translateY(0) scale(1.08) rotate(2deg)',offset:.2},
      {opacity:1,transform:'translateY(-2px) scale(1) rotate(0)',offset:.6},
      {opacity:0,transform:'translateY(-26px) scale(1.03)'}
    ],{duration:1000,easing:'cubic-bezier(.2,.8,.3,1)'});
    comboAnimation.finished.catch(()=>{});
  }
  function collectionTrails(event) {
    const used=new Map();
    for(const p of [...event.cells,...event.created]){
      const target=$('goal-'+p.tile.type);
      if(!target || (used.get(p.tile.type)||0)>=3)continue;
      used.set(p.tile.type,(used.get(p.tile.type)||0)+1);
      const from=view.center(p.r,p.c),rect=target.getBoundingClientRect();
      fx.trail(from.x,from.y,rect.x+rect.width/2,rect.y+rect.height/2,LumiArt.colors[p.tile.type],'star');
    }
    const budsTarget=$('goal-buds');
    if(budsTarget)for(const p of event.bloomedCells.slice(0,3)){
      const from=view.center(p.r,p.c),rect=budsTarget.getBoundingClientRect();
      fx.trail(from.x,from.y,rect.x+rect.width/2,rect.y+rect.height/2,'#e7a3c6','petal');
    }
  }
  function commitTurn(before,action,valid,deferUi=false) {
    if(mode==='daily'){
      const done=LumiFun.checkpoint(profile.daily,game,maxCombo);
      if(!done.ok){resultDetails.dailyError=true;toast('도전 기록을 저장할 수 없어요. 홈으로 돌아가 다시 이어주세요.',3500);return;}
      profile.daily=done.state;const saved=persist();
      if(done.finished)resultDetails={daily:done.result,persisted:saved};
      if(!deferUi)refreshTurnUI();return;
    }
    const seedsBefore=LumiGarden.earnedParts(profile);
    const memoriesBefore=Array.from({length:6},(_,type)=>LumiProgress.memoryLevel(profile,type));
    const placesBefore=game.won?LumiJourney.restorationSummary(profile).flatMap(c=>c.projects.filter(p=>p.state==='restored').map(p=>p.id)):[];
    if(rankRun && action && valid && !ranking.commitAction(action,game.exportState())) {
      rankRun=null;ranking.abandonRun();toast('이번 판은 연습 기록으로 남겨요');
    }
    for(let i=0;i<6;i++)profile.totalCollected[i]+=Math.max(0,game.collected[i]-before[i]);
    profile.maxCombo=Math.max(profile.maxCombo,maxCombo);
    profile.bestScore=Math.max(profile.bestScore,game.score);
    if(game.collected.some((n,i)=>n>before[i]))profile.hasSeenTutorial=true;
    if(game.won){
      const friendType=game.scoringVersion===4?game.buddy.type:profile.selectedBuddy;
      const clearXp=LumiRewards.clearXp({stars:game.stars});
      profile.buddyClearXp[friendType]+=clearXp;
      const afterXp=profile.totalCollected[friendType]+profile.buddyClearXp[friendType],gainedXp=game.collected[friendType]+clearXp;
      const beforeXp=Math.max(0,afterXp-gainedXp),verifiedXp=profile.verifiedBuddyXp?.[friendType]||0;
      const previous=profile.bestScores[level-1];
      const previousStars=profile.stars[level-1];
      profile.stars[level-1]=Math.max(previousStars,game.snapshot().stars);
      profile.bestScores[level-1]=Math.max(previous,game.score);
      profile.unlocked=Math.max(profile.unlocked,Math.min(TOTAL,level+1));
      resultDetails={firstClear:previousStars===0,newBest:game.score>previous,starsAdded:profile.stars[level-1]-previousStars,
        friendship:{buddyType:friendType,beforeXp,afterXp,displayBeforeXp:Math.max(verifiedXp,beforeXp),displayAfterXp:LumiProgress.buddyTotal(profile,friendType,false),memoryBeforeLevel:Math.max(profile.buddyMemoryLevels?.[friendType]||1,LumiRewards.bond(Math.max(verifiedXp,beforeXp)).level),collectedXp:game.collected[friendType],clearXp,gainedXp}};
      resultDetails.journey=LumiJourney.finish(profile,level,journeyRun,true);
      const seedsAfter=LumiGarden.earnedParts(profile);
      resultDetails.seedParts=Object.fromEntries(Object.entries(seedsAfter).map(([kind,n])=>[kind,Math.max(0,n-seedsBefore[kind])]));
      resultDetails.seedAward=Object.values(resultDetails.seedParts).reduce((a,b)=>a+b,0);
      LumiProgress.rememberMemories(profile);
      resultDetails.newKeepsakes=LumiWardrobe.catalog.filter(i=>memoriesBefore[i.type]<i.tier&&LumiProgress.memoryLevel(profile,i.type)>=i.tier).map(i=>i.id);
      resultDetails.restored=LumiJourney.restorationSummary(profile).flatMap(c=>c.projects.filter(p=>p.state==='restored'&&!placesBefore.includes(p.id)).map(p=>({...p,chapter:c.chapter})));
    }
    if(game.won && rankRun) {
      const submittingEpoch=epoch;rankSubmission={status:'sending'};
      ranking.finishRun().then(reply=>{
        if(reply.result)syncRewards(reply.result);
        if(submittingEpoch!==epoch)return;
        rankSubmission=reply.result?{status:'verified',result:reply.result}:{status:reply.queued?'queued':'error',error:reply.error};
        updateRankStatus();updateResultRanking();updateFriendshipResult();
      }).catch(error=>{if(submittingEpoch===epoch){rankSubmission={status:'error',error};updateResultRanking();updateFriendshipResult();}});
    } else if(game.over) {rankRun=null;ranking.abandonRun();}
    const saved=rememberSession();if(game.won||game.over)resultDetails.persisted=saved;
    if(!deferUi)refreshTurnUI();
  }
  function refreshTurnUI(){
    if(mode==='daily'){updateRankStatus();return;}
    sidebars();updateRankStatus();updateJourneyHUD();
    const placeState=LumiJourney.getRestoration(profile,Math.ceil(level/10));view.setChapter?.(placeState.chapter,placeState.restored,Boolean(profile.stars[placeState.chapter*10-1]));
  }
  async function playResult(result,before,action=null) {
    if(!result.events.length){if(['frozen','crate'].includes(result.reason)){view.select(null);audio.play('invalid');LumiMobile.feedback('invalid');toast(result.reason==='crate'?'상자 칸은 교환할 수 없어요. 바로 옆에서 매치해 잠금을 열어요.':'서리 칸은 교환할 수 없어요. 직접 매치하거나 특수 팡빛으로 녹여요.',3200);}scheduleHint();return;}
    const turnEpoch=epoch,focus=view.focusedPosition();
    busy=true;turnInFlight=true;clearHints();dismissSpecialCoach();newSpecial=null;view.select(null);blastMode=false;controls();
    if(result.valid){
      if(mode==='campaign')LumiJourney.recordResult(journeyRun,result);
      maxCombo=Math.max(maxCombo,...result.events.filter(e=>e.kind==='clear').map(e=>e.combo||0));
      // Commit the stable, authoritative board and rewards before the first animation await.
      commitTurn(before,action,true,true);
    }
    try {
      for(const event of result.events){
        if(turnEpoch!==epoch)return;
        if(event.kind==='swap'){audio.play('swap');await view.render(event,'swap');}
        else if(event.kind==='invalid'){audio.play('invalid');LumiMobile.feedback('invalid');await view.render(event,'invalid');if(turnEpoch!==epoch)return;toast('세 친구가 모이면 자리를 바꿀 수 있어요',1700);}
        else if(event.kind==='clear'){
          maxCombo=Math.max(maxCombo,event.combo);
          if(mode==='campaign'&&!newSpecial){const made=event.created.find(p=>!profile.seenSpecials[p.tile.special]);if(made)newSpecial={kind:made.tile.special,id:made.tile.id};}
          await view.clear(event);
        }
        else if(event.kind==='fall'){await view.render(event,'fall');}
        else if(event.kind==='shuffle'){audio.play('shuffle');toast('산들바람이 새로운 만남을 데려와요');await view.render(event,'shuffle');}
        else if(event.kind==='feverStart'){audio.play('feverStart');LumiMobile.feedback('fever');combo(3,true);if(mode==='campaign')buddy('excited','피버 타임! 지금은 점수 두 배!','fever');}
        else if(event.kind==='feverEnd'){audio.play('feverEnd');}
        else if(event.kind==='completionBonus'){
          const from=$('moves').getBoundingClientRect(),to=$('score').getBoundingClientRect();
          toast('남은 '+event.movesRemaining+'회 → 보너스 +'+fmt(event.scoreDelta)+'점',2300);
          audio.play('collect');fx.bonus?.(from.x+from.width/2,from.y+from.height/2,to.x+to.width/2,to.y+to.height/2,event.scoreDelta);
          buddy('excited','남겨 둔 여유도 반짝이는 선물이야!','clear');
          hud(event);await wait(motion.matches?140:560);
        }
        if(turnEpoch!==epoch)return;
        hud(event);
      }
    } catch(error) {
      if(turnEpoch!==epoch)return;
      console.error('Lumi animation recovered:',error);await view.render(game.snapshot());
    }
    if(turnEpoch!==epoch)return;
    const snapshot=game.snapshot();hud(snapshot);refreshTurnUI();
    const turnCombo=Math.max(0,...result.events.filter(event=>event.kind==='clear').map(event=>event.combo||0));
    $('announcer').textContent=fmt(snapshot.score)+'점, '+snapshot.moves+'회 남음. '+(turnCombo>1?turnCombo+'연쇄. ':'')+snapshot.objectives.map(g=>LumiArt.names[g.type]+' '+Math.max(0,g.target-g.current)+'개 남음').join(', ')+Object.entries(snapshot.terrainRemaining||{}).filter(([k])=>snapshot.terrainGoal[k]).map(([k,n])=>', '+terrainName(k)+' '+n+'개 남음').join('');
    if(snapshot.won || snapshot.over){
      pendingModal=null;
      setHint(mode==='daily'?'15번의 도전을 마쳤어요!':snapshot.won?'우리의 작은 정원이 활짝 피었어요!':'괜찮아요. 새로운 만남이 기다리고 있어요');
      await wait(motion.matches?100:320);
      if(turnEpoch!==epoch)return;
      busy=false;turnInFlight=false;controls();
      if(mode==='daily'){audio.play('win');LumiMobile.feedback('win');fx.confetti();showModal('daily-result');return;}
      if(snapshot.won){audio.play('win');LumiMobile.feedback('win');fx.confetti();if(resultDetails.restored?.length)fx.worldRestore?.(Math.ceil(level/10));buddy('excited','너랑 함께여서 오늘도 행복했어!','clear');}
      else{audio.play('lose');buddy('sleep','조금 쉬었다, 다시 같이 해보자.','lose');}
      showModal(snapshot.won?'win':'lose');
    } else {
      busy=false;turnInFlight=false;controls();
      if(focus&&screen==='play')view.focusAt(focus);
      if(pendingModal){const next=pendingModal;pendingModal=null;showModal(next.type,next.data);}
      else{
        setHint();scheduleHint();showSpecialCoach(newSpecial);
        if(snapshot.moves<=3&&snapshot.moves!==lastLowWarning){lastLowWarning=snapshot.moves;buddy('wink',snapshot.moves+'번 남았어. 남은 목표부터 같이 보자!','danger');}
      }
    }
  }
  function choose(position) {
    if(sessionInterrupted || busy || modalType || game.won || game.over || !sessionGuard.canWrite())return;
    clearHints();dismissSpecialCoach();
    if(!blastMode&&['frost','crate'].includes(game.terrain?.[position.r]?.[position.c]?.kind)){view.select(null);audio.play('invalid');LumiMobile.feedback('invalid');toast(game.terrain[position.r][position.c].kind==='crate'?'상자 옆에서 매치해 잠금을 풀어요.':'이 칸의 서리를 직접 매치하거나 특수 팡빛으로 녹여요.');scheduleHint();return;}
    if(blastMode){
      if(blasts<1)return;
      const before=game.collected.slice();blasts--;playResult(game.blast(position),before,{kind:'blast',position:{...position}});
    } else if(same(view.selected,position)){view.select(null);scheduleHint();}
    else if(view.selected && neighbors(view.selected,position))swap(view.selected,position);
    else{view.select(position);audio.play('select');scheduleHint();}
  }
  function swap(from,to) {
    if(sessionInterrupted || busy || modalType || game.won || game.over || !sessionGuard.canWrite())return;
    const before=game.collected.slice();playResult(game.play(from,to),before,{kind:'swap',from:{...from},to:{...to}});
  }

  async function startGarden(id,restore=null,{ranked=false,silent=false,daily=null}={}) {
    if(sessionInterrupted || !sessionGuard.canWrite())return;
    epoch++;busy=true;turnInFlight=false;modalType=null;pendingModal=null;blastMode=false;goalsSignature='';rankSubmission=null;rankStartIssue=null;rankRun=null;
    mode=daily?'daily':'campaign';dailyDay=daily?.state.active.day||null;document.body.dataset.v2Mode=mode;
    const loadingEpoch=epoch;$('board-wrap').classList.add('board-loading');
    clearHints();dismissSpecialCoach();clearTimeout(toastTimer);clearTimeout(comboTimer);comboAnimation?.cancel();
    $('combo-display').style.removeProperty('opacity');$('combo-display').style.removeProperty('transform');fx.clear();view.reset();
    newSpecial=null;lastLowWarning=-1;reactionUntil=0;reactionPriority=0;resultDetails={};journeySignature='';
    $('board-toast').classList.remove('visible');
    level=Math.max(1,Math.min(profile.unlocked,id));
    let definition=daily?LumiFun.definition(dailyDay):restore?(restore.game.version===LumiEngineV2.STATE_VERSION?(restore.game.rulesRevision===LumiEngineV2.FUN_REVISION?LumiLevelsFun[level-1]:LumiLevelsV2[level-1]):LumiLevels[level-1]):ranked?LumiLevels[level-1]:LumiLevelsFun[level-1];
    $('stage-title').textContent=definition.title;controls();
    if(daily){game=daily.game;shuffles=0;blasts=0;maxCombo=daily.state.active.maxCombo;}
    else if(restore){
      const restoreApi=restore.game.version===LumiEngineV2.STATE_VERSION?LumiEngineV2:LumiEngine;
      game=restoreApi.Game.fromState(restore.game);shuffles=restore.shuffles;blasts=restore.blasts;maxCombo=restore.maxCombo;
      rankRun=restoreApi===LumiEngine?ranking.restoreRun(game.exportState()):null;
      if(game.scoringVersion!==LumiRewards.SCORING_VERSION){ranking.abandonRun();rankRun=null;}
    } else {
      profile.attempts[level-1]++;
      let startedRun=null;
      try {
        if(ranked){if(!ranking.getIdentity()||navigator.onLine===false)throw Object.assign(new Error('인터넷 연결과 닉네임이 필요해요. 이번 판은 싱글 플레이예요.'),{code:'RANKING_OFFLINE'});startedRun=await ranking.startRun(level,{buddyType:profile.selectedBuddy});}
        else if(ranking.getCurrentRun())ranking.abandonRun();
      } catch(error) {
        if(loadingEpoch!==epoch)return;
        rankStartIssue={code:error.code||'NETWORK_ERROR',message:error.message||'랭킹 서버 연결에 실패했어요. 이번 판은 연습으로 진행돼요.'};
        ranking.abandonRun();
      }
      if(loadingEpoch!==epoch)return;
      rankRun=startedRun;
      if(startedRun)syncRewards(startedRun);
      definition=rankRun?LumiLevels[level-1]:LumiLevelsFun[level-1];
      const firstTutorial=!rankRun&&level===1&&!profile.hasSeenTutorial&&!profile.stars[0];
      const GameClass=rankRun?LumiEngine.Game:LumiEngineV2.Game;
      game=new GameClass({...definition,buddy:{type:profile.selectedBuddy,tier:LumiRewards.bond(companionXp(profile.selectedBuddy,false)).level},...(rankRun?.options||{}),rows:6,cols:6,types:6,requireScore:false,seed:rankRun?.seed??(firstTutorial?LumiFun.INTRO_SEED:((Date.now()^Math.floor(Math.random()*0xffffffff))>>>0))});
      if(firstTutorial)LumiFun.decorateIntro(game);
      if(rankRun && !ranking.bindState(game.exportState())){ranking.abandonRun();rankRun=null;}
      shuffles=2;blasts=2;maxCombo=0;
    }
    journeyRun=daily?null:LumiJourney.createRun(level,restore?.journey);
    const placeState=LumiJourney.getRestoration(profile,daily?definition.chapter:Math.ceil(level/10));view.setChapter?.(placeState.chapter,placeState.restored,Boolean(profile.stars[placeState.chapter*10-1]));
    $('stage-title').textContent=definition.title;
    $('stage-title').dataset.stageSummary=(daily?'DAILY '+dailyDay.slice(5):'STAGE '+String(level).padStart(2,'0'))+' · '+definition.difficultyLabel;
    $('stage-title').setAttribute('aria-label',(daily?'오늘의 도전':level+'단계')+', '+definition.title+', '+definition.difficultyLabel);
    $('board-wrap').classList.remove('board-loading');
    $('stage-subtitle').textContent=daily||isV2Game()&&(definition.terrain?.length||definition.delivery?.length)?definition.subtitle:LumiStory.stageForLevel(level).action;
    $('difficulty-badge').textContent=definition.difficultyLabel||'산책';
    $('difficulty-badge').dataset.difficulty=definition.difficulty||'normal';
    if(!daily)rankStage=level;updateRankStatus();
    $('chapter-number').textContent=daily?'DAILY '+dailyDay.slice(5):'STAGE '+String(level).padStart(2,'0');
    setHint(coaching()?.text||(daily?definition.recommendedSkill:'이번 단계 요령 · '+(definition.recommendedSkill||'목표를 먼저 확인하세요')));sidebars();hud(game.snapshot(),true);if(!daily)updateJourneyHUD();controls();rememberSession();
    const gardenEpoch=epoch;
    await view.render(game.snapshot(),'entry');
    if(gardenEpoch!==epoch)return;
    busy=false;controls();scheduleHint();
    if(silent||daily)return;
    if(rankStartIssue)toast(rankStartIssue.message,4500);
    else if(initial.migrationNotice){toast(initial.migrationNotice,3800);initial.migrationNotice=null;}
    else if(restore)toast(game.scoringVersion===LumiRewards.SCORING_VERSION?'친구들이 기다렸어요. 이어서 놀아볼까요?':'기존 판을 이어가요. 새 보너스와 랭킹은 다음 판부터!',4000);
    else if(definition.terrain?.length||definition.delivery?.length)toast(definition.recommendedSkill,3600);
    else if(game.budsGoal)toast(definition.buds.some(b=>b.hp>1)?'두 겹 봉오리는 같은 자리에서 두 번, 톡톡!':'봉오리 위에서 빛모습을 모으면 꽃이 피어요',3000);
    if(pendingModal){const next=pendingModal;pendingModal=null;showModal(next.type,next.data);}
    else if(!restore)buddy('wink',game.perks.startScore?'오늘의 응원 선물 +'+fmt(game.perks.startScore)+'점!':LumiArt.characters[profile.selectedBuddy].tagline,'selected');
    // Stories remain available from the map, result and friend menus; never block a first match.
  }

  // Dialogs are actual game features, not links to placeholder pages.
  function modalButton(text,action,primary=false) {
    const node=document.createElement('button');node.className=primary?'primary-button':'secondary-button';
    node.textContent=text;node.addEventListener('click',()=>{audio.play('button');action();});$('modal-actions').appendChild(node);
  }
  function closeModal() {
    if(sessionInterrupted||recoveryBusy||backupBusy)return;
    $('modal-backdrop').hidden=true;modalType=null;
    document.querySelector('.app-shell').inert=false;document.body.style.overflow='';
    document.body.classList.remove('modal-open');
    fx.setPaused(document.hidden);audio.suspend(document.hidden);
    controls();
    if(screen!=='play'){if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});else $('v2-heading')?.focus({preventScroll:true});}
    else if(game && (game.won||game.over))revealFinishActions();
    else if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});
    else if(game && !game.won && !game.over)view.focusAt({r:0,c:0});
    scheduleHint();
  }
  function revealFinishActions() {
    const expectedEpoch=epoch;
    requestAnimationFrame(()=>{
      if(sessionInterrupted||expectedEpoch!==epoch||screen!=='play'||modalType||busy||!game||!(game.won||game.over))return;
      $('finish-dock').scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
      $('finish-next').focus({preventScroll:true});
    });
  }
  function renderHome(){
    const active=Boolean(storedSession),next=active?storedSession.level:Math.min(TOTAL,profile.unlocked);
    LumiHome.render($('v2-home'),{profile,level:next,definition:activeDefinition(next),active,busy,ranked:active&&Boolean(ranking.getCurrentRun()&&storedSession.game.version!==LumiEngineV2.STATE_VERSION),identity:ranking.getIdentity(),view:screen,chapter:screen==='garden'?gardenChapter:Math.ceil(next/10),act:homeAct});
  }
  function setScreen(next,focus=true){
    if(sessionInterrupted||busy||backupBusy||recoveryBusy)return;
    screen=next;document.body.dataset.v2Screen=screen;
    const playing=screen==='play';$('v2-home').hidden=playing;$('v2-nav').hidden=playing;$('v2-playfield').hidden=!playing;$('v2-home-back').hidden=!playing;
    $('v2-nav').querySelectorAll('[data-v2-nav]').forEach(b=>{if(b.dataset.v2Nav===screen)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    clearHints();controls();
    if(playing){view.measure();if(game){const snap=game.snapshot();view.render(snap);hud(snap,true);}LumiMobile.fit?.();scheduleHint();if(focus&&!modalType)view.focusAt({r:0,c:0});}
    else{fx.clear();fx.fever(false);audio.setFever(false);lastFever=false;document.body.classList.remove('is-fever');renderHome();if(focus)$('v2-heading')?.focus({preventScroll:true});}
    window.scrollTo({top:0,behavior:'auto'});
  }
  function homeMessage(message){const n=$('v2-home').querySelector('.v2-home-status');if(n)n.textContent=message;}
  function applyGarden(op,id){
    if(sessionInterrupted||busy||!sessionGuard.canWrite())return;
    const item=LumiGarden.catalog.find(i=>i.id===id);if(!item)return;
    const result=op==='purchase'?LumiGarden.purchase(profile,id):op==='equip'?LumiGarden.equip(profile,id):LumiGarden.unequip(profile,item.slot);
    if(!result.ok){homeMessage(result.code==='INSUFFICIENT'?'햇살씨앗이 더 필요해요.':'아직 꾸밀 수 없는 소품이에요.');return;}
    const previous=profile.garden;profile.garden=result.garden;
    if(!persist()){profile.garden=previous;const msg='저장하지 못했어요. 소품과 씨앗은 그대로예요.';if(modalType==='garden-item')$('garden-purchase-status').textContent=msg;else homeMessage(msg);return;}
    if(modalType)closeModal();renderHome();homeMessage(op==='unequip'?'소품을 보관했어요.':item.name+'을(를) 배치했어요!');audio.play('collect');
    if(op!=='unequip')revealGardenPlacement(item);
  }
  function revealGardenPlacement(item){
    const hero=$('v2-home').querySelector('.v2-landscape');if(!hero)return;
    const index=LumiJourney.PROJECTS.filter(p=>p.chapter===item.chapter).findIndex(p=>p.id===item.slot);
    const placed=hero.querySelector('.v2-placed > [data-slot="'+index+'"]');
    hero.classList.add('is-revealing');placed?.classList.add('is-new-placement');
    const note=document.createElement('p');note.className='garden-reveal-note';note.setAttribute('role','status');
    note.textContent=LumiArt.names[profile.selectedBuddy]+' · '+item.name+'이 우리 정원에 생겼어!';hero.after(note);
    requestAnimationFrame(()=>{
      if(screen!=='garden'||!hero.isConnected)return;
      hero.scrollIntoView({block:'start',behavior:motion.matches?'auto':'smooth'});
    });
    setTimeout(()=>{if(hero.isConnected)hero.classList.remove('is-revealing');if(placed?.isConnected)placed.classList.remove('is-new-placement');},1800);
  }
  function homeAct(action,value){
    if(sessionInterrupted||busy||modalType)return;
    unlockAudio();
    if(action==='play')resumeCampaign();
    else if(action==='daily'){if(profile.stars[0]>0)showModal('daily-info');}
    else if(action==='home'||action==='garden'){if(action==='garden')gardenChapter=Number.isInteger(value)?Math.max(1,Math.min(5,value)):Math.ceil((storedSession?.level||profile.unlocked)/10);setScreen(action);}
    else if(action==='chapter'){gardenChapter=Math.max(1,Math.min(5,value));renderHome();$('v2-home').querySelector('[data-chapter="'+gardenChapter+'"]')?.focus({preventScroll:true});}
    else if(action==='purchase')showModal('garden-item',{id:value});
    else if(action==='equip'||action==='unequip')applyGarden(action,value);
    else if(action==='friend')showModal('character',{type:profile.selectedBuddy});
    else if(action==='restoration'&&Number.isInteger(value)&&value>=1&&value<=profile.unlocked)showModal('level',{id:value});
    else if(['map','album','ranking'].includes(action))showModal(action);
  }
  function gardenItemModal(id){
    const item=LumiGarden.catalog.find(i=>i.id===id);if(!item){closeModal();return;}
    const summary=LumiGarden.summary(profile);
    modalHeader('SUNPATCH DECORATION',item.name,'happy',null);
    $('modal-content').innerHTML='<div class="v2-item-preview">'+LumiHome.decoration(item)+'</div><p>햇살씨앗 '+item.price+'개로 소품을 얻어요.<br>한 번 얻으면 언제든 무료로 배치하거나 보관할 수 있어요.</p><p>현재 '+summary.balance+'개 · 구매 후 '+Math.max(0,summary.balance-item.price)+'개</p><p id="garden-purchase-status" role="status"></p>';
    modalButton(item.price+' 씨앗으로 얻고 배치하기',()=>applyGarden('purchase',id),true);modalButton('조금 더 둘러보기',closeModal);
  }
  function openGarden(id,ranked=false) { closeModal();setScreen('play',false);startGarden(id,null,{ranked}).then(()=>{if(!modalType&&screen==='play')view.focusAt({r:0,c:0});}); }
  function resumeCampaign(){
    closeModal();
    if(mode==='campaign'&&game&&!game.won&&!game.over&&storedSession?.level===level){setScreen('play');return;}
    const restore=storedSession;setScreen('play',false);startGarden(restore?.level||profile.unlocked,restore).then(()=>{if(!modalType&&screen==='play')view.focusAt({r:0,c:0});});
  }
  function openDaily(){
    if(sessionInterrupted||busy||backupBusy||recoveryBusy||!profile.stars[0]||!sessionGuard.canWrite())return;
    const next=LumiFun.begin(profile.daily);
    if(!next.ok){showModal('daily-info');return;}
    const previous=profile.daily;profile.daily=next.state;
    if(!persist()){profile.daily=previous;const node=$('daily-notice');if(node)node.textContent='도전 시작을 저장하지 못했어요. 저장 공간을 확인해 주세요.';return;}
    closeModal();setScreen('play',false);startGarden(storedSession?.level||profile.unlocked,null,{daily:next}).then(()=>{if(!modalType&&screen==='play')view.focusAt({r:0,c:0});});
  }
  function firstDecoration(){closeModal();gardenChapter=1;setScreen('garden');requestAnimationFrame(()=>$('v2-home').querySelector('[data-item="'+LumiGarden.catalog[0].id+'"]')?.scrollIntoView({block:'center',behavior:'auto'}));}
  function dailyMedals(count){return '<div class="daily-medals" aria-label="메달 '+count+'개">'+['동','은','금'].map((label,i)=>'<span class="'+(i<count?'earned':'')+'">'+icon('star')+'<small>'+label+'</small></span>').join('')+'</div>';}
  function dailyInfoModal(){
    const info=LumiFun.overview(profile.daily),day=info.active?.day||info.day,record=LumiFun.overview(profile.daily,day),theme=LumiFun.definition(day);
    const otherDay=day!==info.day,label=otherDay?day.slice(5).replace('-','/'):'오늘';
    modalHeader('DAILY SUNPATCH · '+day.slice(5),'매일 15턴 햇살 도전','excited',null);
    $('modal').classList.add('daily-modal');
    const badges=LumiFun.milestones.map(m=>'<span class="'+(info.days>=m.days?'earned':'')+'">'+icon(info.days>=m.days?'star':'lock')+'<strong>'+esc(m.title)+'</strong><small>'+m.days+'일</small></span>').join('');
    $('modal-content').innerHTML='<div class="daily-theme"><span>'+icon('spark')+'</span><div><strong>'+esc(theme.title)+'</strong><p>'+esc(theme.subtitle)+'</p></div></div><p class="daily-rules">15턴 · 하루 3회 · 고정 친구 Lv.1 · 부스터 없음<br>같은 날짜에는 같은 보드로 최고 점수에 도전해요.</p>'+dailyMedals(record.medal)+
      '<div class="daily-stat"><div><small>'+label+' 최고 점수</small><strong id="daily-record-best" data-day="'+day+'">'+fmt(record.entry.best)+'</strong></div><div><small>'+label+' 남은 도전</small><strong id="daily-record-attempts" data-day="'+day+'">'+record.remaining+' / 3</strong></div><div><small>전체 최고 기록</small><strong>'+fmt(info.best)+'</strong></div></div>'+
      (otherDay?'<p class="daily-date-note">진행 중인 판은 '+esc(label)+' 기록으로 이어집니다.<br><span id="daily-today-attempts" data-day="'+info.day+'">오늘 새 도전 '+info.remaining+'회</span>는 이 판을 마친 뒤 시작할 수 있어요.</p>':'')+
      '<div class="daily-badge-heading"><strong>햇살 도전 칭호</strong><small>완주한 날짜 '+info.days+'일</small></div><div class="daily-badges">'+badges+'</div>'+
      (info.nextBadge?'<p class="daily-next-badge">'+esc(info.nextBadge.title)+'까지 '+(info.nextBadge.days-info.days)+'일 · 연속 접속이 아니어도 쌓여요.</p>':'')+
      '<p class="save-note">한국 시간 자정에 새 도전이 열려요. 진행 중인 판은 시작한 날짜로 기록합니다. 기록과 칭호는 이 기기에만 저장되며 온라인 순위에 등록되지 않습니다.</p><p id="daily-notice" role="status">'+(!info.eligible?'기기의 날짜가 이전으로 설정되어 있어요.':!info.remaining&&!info.active?'오늘의 도전을 모두 사용했어요. 내일 새로운 보드에서 만나요!':'')+'</p>';
    if(info.active||info.remaining)modalButton(info.active?'진행 중인 도전 이어하기':'오늘의 도전 시작',openDaily,true);
    modalButton('햇살밭으로 돌아가기',goHome,!info.active&&!info.remaining);
  }
  function dailyResultModal(){
    const r=resultDetails.daily,info=LumiFun.overview(profile.daily),day=r?.day||dailyDay,record=LumiFun.overview(profile.daily,day);
    const otherDay=day!==info.day,label=otherDay?day.slice(5).replace('-','/'):'오늘';
    modalHeader('DAILY SUNPATCH · '+day.slice(5),r?.newBest?'새로운 최고 기록!':'도전을 마쳤어요','excited',null);
    $('modal').classList.add('result-modal','daily-modal');
    $('modal-content').innerHTML=dailyMedals(LumiFun.medal(game.score))+'<div class="result-score">'+fmt(game.score)+'</div><span class="result-caption">'+label+'에 시작한 15턴의 기록</span>'+
      '<div class="daily-stat"><div><small>'+label+' 최고</small><strong id="daily-record-best" data-day="'+day+'">'+fmt(r?.best??record.entry.best)+'</strong></div><div><small>최고 연쇄</small><strong>×'+maxCombo+'</strong></div><div><small>'+label+' 남은 도전</small><strong id="daily-record-attempts" data-day="'+day+'">'+record.remaining+' / 3</strong></div></div>'+
      (otherDay?'<p class="daily-date-note" id="daily-today-attempts" data-day="'+info.day+'">오늘의 새 퍼즐 · '+info.remaining+'회 도전할 수 있어요.</p>':'')+
      (r?.first?'<p class="daily-award">'+icon('check')+label+'의 완주 도장 획득!</p>':'')+
      (r?.newBest&&r.previous>0?'<p class="daily-improvement">이전 최고보다 '+fmt(r.score-r.previous)+'점 더 모았어요.</p>':'')+
      '<p id="v2-result-save" class="v2-result-save" role="status">'+(resultDetails.persisted===false?'기록 저장 실패 · 다시 저장하세요.':'기기 도전 기록 저장 완료')+'</p><p class="save-note">모험의 별·햇살씨앗·친밀도와 분리된 기록이에요.</p>';
    if(info.remaining)modalButton(otherDay?'오늘의 새 도전':'한 번 더 도전',openDaily,true);
    else modalButton('햇살밭으로 돌아가기',goHome,true);
    if(resultDetails.persisted===false)modalButton('기록 다시 저장',()=>{$('v2-result-save').textContent=persist()?'기기 도전 기록 저장 완료':'아직 저장하지 못했어요.';});
    modalButton('도전 기록 보기',()=>showModal('daily-info'));
    if(info.remaining)modalButton('홈으로 돌아가기',goHome);
  }
  function goHome(){
    if(sessionInterrupted||backupBusy||recoveryBusy||busy&&!turnInFlight)return;
    if(screen==='home'&&!modalType)return;
    if(turnInFlight){
      // Model/reward commit is synchronous before the first animation await.
      // Cancel presentation only; late callbacks are invalidated by both epochs.
      epoch++;turnInFlight=false;busy=false;pendingModal=null;blastMode=false;
      clearHints();dismissSpecialCoach();clearTimeout(comboTimer);clearTimeout(buddyTimer);clearTimeout(toastTimer);
      comboAnimation?.cancel();companionAnimation?.cancel();cancelAnimationFrame(scoreAnimation);
      $('combo-display').style.removeProperty('opacity');$('combo-display').style.removeProperty('transform');
      $('board-toast').classList.remove('visible');reactionUntil=0;reactionPriority=0;companionSignature='';view.reset();
      fx.clear();audio.stopEffects?.();LumiMobile.stopFeedback?.();
    }
    if(modalType)closeModal();persist();setScreen('home');
  }
  function modalHeader(eyebrow,title,mood='idle',type=profile.selectedBuddy) {
    $('modal-eyebrow').textContent=eyebrow;$('modal-title').textContent=title;
    $('modal-art').innerHTML=type===null?'':art(type,mood);
  }
  function showModal(type,data={}) {
    if(sessionInterrupted||recoveryBusy||backupBusy)return;
    if(busy){pendingModal={type,data};return;}
    const wasOpen=Boolean(modalType);
    if(!wasOpen)returnFocus=document.activeElement;
    clearHints();dismissSpecialCoach();modalType=type;view.select(null);blastMode=false;controls();
    $('modal').className='modal';$('modal-content').replaceChildren();$('modal-actions').replaceChildren();
    $('modal-art').style.display='';$('modal-art').innerHTML='';
    $('modal').scrollTop=0;
    if(type==='daily-info')dailyInfoModal();
    else if(type==='daily-result')dailyResultModal();
    else if(type==='garden-item') gardenItemModal(data.id);
    else if(type==='ranked-start'){
      modalHeader('SUNPATCH LEAGUE','랭킹 도전 시작','happy',null);
      $('modal-content').innerHTML='<p>서버가 발급한 새로운 퍼즐로 도전해요. 지금 진행 중인 판은 종료되지만 별과 정원, 친구 기록은 그대로 유지됩니다.</p><p class="save-note">현재 리그는 기존 친밀도 규칙을 사용해요. 동일 조건 경쟁 모드는 다음 룰셋에서 별도로 제공됩니다.</p>';
      modalButton('새 랭킹 판 시작',()=>openGarden(data.id||level,true),true);modalButton('돌아가기',()=>showModal('ranking'));
    }
    else if(type==='help') helpModal();
    else if(type==='score-info') scoreInfoModal();
    else if(type==='pause') {
      modalHeader('TAKE A LITTLE BREATH','잠깐, 몽글몽글 쉬어요','sleep');
      $('modal-content').innerHTML='<p>서두르지 않아도 괜찮아요.<br>친구들이 여기서 기다릴게요.</p><p class="save-note">'+(storageNotice?'기록이 아직 기기에 저장되지 않았어요. 먼저 저장을 다시 시도해 주세요.':'지금까지의 진행은 이 기기에 저장됐어요.')+'</p>';
      modalButton('이어서 놀기',closeModal,true);
      modalButton('홈으로 돌아가기',goHome);
      if(mode==='campaign')modalButton('이 정원 새로 시작',()=>showModal('restart'));
      else modalButton('오늘의 도전 규칙',()=>showModal('daily-info'));
      audio.suspend(true);
    }
    else if(type==='restart') {
      modalHeader('A FRESH LITTLE START','새롭게 만나볼까요?','wink');
      $('modal-content').innerHTML='<p>현재 판의 미션과 횟수가 초기화돼요.<br>모은 별과 친구 친밀도는 그대로 간직해요.</p>';
      modalButton('새로 시작하기',()=>openGarden(level),true);modalButton('계속 놀기',closeModal);
    }
    else if(type==='win' || type==='lose') resultModal(type==='win');
    else if(type==='map') mapModal(data.chapter);
    else if(type==='ranking') rankingModal();
    else if(type==='ranking-recovery') rankingRecoveryModal();
    else if(type==='level') levelModal(data.id);
    else if(type==='album') albumModal();
    else if(type==='character') characterModal(data.type);
    else if(type==='storybook') storybookModal();
    else if(type==='story') storyModal(data);
    else if(type==='promise') promiseModal(data.level||level);
    else if(type==='world') worldModal(data.chapter||Math.ceil(level/10));
    else if(type==='journal') journalModal(data.chapter||Math.ceil(level/10));
    else if(type==='relations') relationsModal(data.type);
    else if(type==='world-guide') worldGuideModal();
    else if(type==='settings') settingsModal();
    else if(type==='more') moreModal();
    else if(type==='backup-export'||type==='backup-import') backupModal(type);
    $('modal-backdrop').hidden=false;
    $('modal-content').scrollTop=0;
    document.querySelector('.app-shell').inert=true;document.body.style.overflow='hidden';document.body.classList.add('modal-open');
    if(type!=='win'&&type!=='daily-result')fx.setPaused(true);else fx.setPaused(false);
    requestAnimationFrame(()=>{
      if(sessionInterrupted||modalType!==type)return;
      const memory=type==='character'&&Number.isInteger(data.memoryTier)?$('memory-'+data.type+'-'+data.memoryTier):null;
      if(memory){
        memory.open=true;memory.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
        memory.querySelector('summary').focus({preventScroll:true});
      }else ($('modal-actions').querySelector('button')||$('modal-close')).focus({preventScroll:true});
    });
  }
  function updateRankStatus() {
    if(mode==='daily'){$('rank-mode').textContent='일일 도전';$('rank-mode').classList.remove('connected');$('rank-mode').setAttribute('aria-label','기기 내 일일 도전 기록 보기');return;}
    const active=Boolean(rankRun);
    const recovery=ranking.getRecoveryState();
    $('rank-mode').textContent=recovery.required?'계정 확인 필요':active?'랭킹 도전':rankStartIssue?.code==='RULESET_CHANGED'?'업데이트 필요':ranking.pendingCount?'제출 대기 '+ranking.pendingCount:'싱글 플레이';
    $('rank-mode').classList.toggle('connected',active);
    $('rank-mode').setAttribute('aria-label',active?'서버 검증 랭킹 도전 중':rankStartIssue?.message||'랭킹 상태와 기록 보기');
    $('header-ranking').classList.toggle('has-pending',ranking.pendingCount>0);
  }
  function updateResultRanking() {
    const panel=$('result-ranking');if(!panel)return;
    if(rankSubmission?.status==='verified') {
      const r=rankSubmission.result;
      panel.innerHTML=icon('trophy')+'<div><strong>검증된 기록이 등록됐어요</strong><small>이 정원 주간 '+(r.weeklyStageRank?fmt(r.weeklyStageRank)+'위':'집계 중')+' · 전체 모험 '+(r.weeklyCampaignRank?fmt(r.weeklyCampaignRank)+'위':'집계 중')+'</small></div>';
      panel.dataset.state='verified';
    } else if(rankSubmission?.status==='sending') {
      panel.innerHTML='<span class="mini-spinner"></span><div><strong>기록을 확인하고 있어요</strong><small>완료되면 랭킹에 반영돼요.</small></div>';
    } else if(rankSubmission?.status==='queued') {
      panel.innerHTML=icon('trophy')+'<div><strong>연결되면 기록을 제출해요</strong><small>이 기기에 제출할 기록을 보관했어요.</small></div>';
    } else if(rankSubmission?.status==='error') {
      panel.innerHTML=icon('help')+'<div><strong>이번 기록을 등록하지 못했어요</strong><small>'+esc(rankSubmission.error?.message||'정원 기록은 이 기기에 남아 있어요.')+'</small></div>';
    } else {
      panel.innerHTML=icon('flower')+'<div><strong>이 기기에 남긴 정원 기록</strong><small>'+(rankRun?'정원을 완성하면 랭킹에 도전할 수 있어요.':'경쟁 메뉴에서 랭킹 도전을 선택하면 서버 검증 순위에 참여할 수 있어요.')+'</small></div>';
    }
  }
  async function retryRankings() {
    if(sessionInterrupted||!ranking.pendingCount||rankRetry)return;
    try {
      rankRetry=ranking.flushPending();
      const reply=await rankRetry;
      if(sessionInterrupted)return;
      updateRankStatus();
      if(reply.authRequired&&modalType==='ranking'){loadRanking(rankRequest);return;}
      if(reply.submitted.length){
        for(const result of reply.submitted)syncRewards(result);
        const current=reply.submitted.find(result=>result.runId===rankRun?.runId);
        if(current){rankSubmission={status:'verified',result:current};updateResultRanking();updateFriendshipResult();}
        toast('보관한 기록 '+reply.submitted.length+'개를 랭킹에 반영했어요');
        if(modalType==='ranking')loadRanking(rankRequest);
      }
    } catch(_) {} finally {rankRetry=null;}
  }
  function rankRow(entry,own=false) {
    if(!entry)return '';
    return '<li class="rank-row '+(own||entry.isYou?'is-you':'')+'"><span class="rank-position '+(entry.rank<=3?'medal-'+entry.rank:'')+'">'+(entry.rank===1?icon('crown'):entry.rank)+'</span><span class="rank-avatar">'+art(Math.abs(entry.nickname.split('').reduce((a,c)=>a+c.charCodeAt(0),0))%6,'happy')+'</span><span class="rank-person"><strong>'+esc(entry.nickname)+(entry.isYou?'<i>나</i>':'')+'</strong><small>'+(rankScope==='campaign'?entry.completedStages+'개 정원 · 별 '+entry.stars:'검증된 최고 기록')+'</small></span><strong class="rank-points">'+fmt(entry.score)+'<small>점</small></strong></li>';
  }
  function renderCompetition(result) {
    const own=result.own,rival=result.rival,card=$('ranking-competition');
    const state=own?(rival?'chasing':'leader'):'unranked';card.dataset.state=state;
    let headline,caption;
    if(rival){
      headline=result.rivalTied?(own.rank===1?'단독 1위까지':'공동 '+own.rank+'위에서 앞서기까지'):'<span>'+fmt(rival.rank)+'위까지</span>';
      headline+=' <strong>'+fmt(result.pointsToOvertake)+'점</strong>';
      caption=esc(rival.nickname)+' · '+fmt(rival.score)+'점';
    }else if(own){headline=result.totalPlayers>1?'지금은 우리가 <strong>1위!</strong>':'<strong>첫 기록의 주인공!</strong>';caption=result.totalPlayers>1?'최고 기록을 높여 자리를 지켜봐요.':'다른 친구가 참여하면 순위 경쟁이 시작돼요.';}
    else{headline='<strong>우리의 첫 순위를 만들어봐요</strong>';caption='정원 하나를 완성하면 리그에 이름이 올라가요.';}
    card.innerHTML='<div class="competition-top"><span>'+icon('trophy')+(rankPeriod==='week'?'이번 주':'전체 기간')+' · '+(rankScope==='campaign'?'전체 모험':'정원 '+String(rankStage).padStart(2,'0'))+'</span><b>'+(own?fmt(own.rank)+'위':'기록 대기')+'</b></div>'+
      '<div class="competition-gap">'+headline+'</div><p class="competition-rival">'+caption+'</p>'+
      '<div class="competition-score"><span>내 기록</span><strong>'+fmt(own?.score||0)+'<small>점</small></strong></div>';
    const candidates=LumiLevels.filter(d=>d.id<=profile.unlocked && profile.stars[d.id-1]<3);
    const candidate=(rankScope==='stage'&&rankStage<=profile.unlocked?LumiLevels[rankStage-1]:candidates.find(d=>profile.stars[d.id-1]>0)||candidates[0]||LumiLevels[Math.min(TOTAL,profile.unlocked)-1]);
    if(candidate){
      const suggestion=document.createElement('button');suggestion.className='rank-recommendation';
      suggestion.innerHTML='<span>'+icon('spark')+'다음 도전 · '+String(candidate.id).padStart(2,'0')+' '+esc(candidate.title)+'</span><strong>'+(profile.stars[candidate.id-1]===0?'첫 클리어 도전':'최고 기록 도전')+' →</strong>';
      suggestion.addEventListener('click',()=>showModal('level',{id:candidate.id}));card.appendChild(suggestion);
    }
  }
  function renderWeekly(available=true) {
    const panel=$('weekly-panel');if(!panel)return;
    if(!weeklyState || !available){panel.innerHTML='<div class="weekly-head"><strong>'+icon('heart')+' 이번 주의 작은 약속</strong></div><p class="weekly-status">연결되면 주간 목표와 받을 선물을 확인할 수 있어요.</p>';return;}
    panel.innerHTML='<div class="weekly-head"><div><strong>'+icon('heart')+' 이번 주의 작은 약속</strong><small>정원 완성 '+fmt(weeklyState.clears)+'회 · 클리어할수록 가까워져요</small></div></div>'+
      '<label class="weekly-recipient">선물 받을 친구<select id="weekly-buddy" aria-label="주간 선물 받을 친구">'+LumiArt.characters.map((c,i)=>'<option value="'+i+'" '+(i===weeklyRecipient?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'+
      weeklyState.goals.map(g=>'<div class="weekly-goal '+(g.claimed?'claimed':'')+'"><div class="weekly-goal-head"><strong>'+esc(g.label)+'</strong><span>'+Math.min(g.target,g.progress)+' / '+g.target+'</span></div><div class="weekly-track" role="progressbar" aria-label="'+esc(g.label)+'" aria-valuemin="0" aria-valuemax="'+g.target+'" aria-valuenow="'+Math.min(g.target,g.progress)+'"><span style="width:'+Math.min(100,g.progress/g.target*100)+'%"></span></div><div class="weekly-reward"><span>'+icon('heart')+'친밀도 <strong>+'+g.reward.amount+'</strong>'+(g.claimed?'<small>'+esc(LumiArt.names[g.claimedBuddyType??weeklyRecipient])+'에게 전달했어요</small>':'')+'</span><button class="weekly-claim" data-goal-id="'+esc(g.id)+'" '+(g.claimed||!g.ready||claimBusy?'disabled':'')+'>'+(g.claimed?'받았어요 ✓':g.ready?'선물 받기':(g.target-g.progress)+'회 더 완성')+'</button></div></div>').join('')+
      '<p class="weekly-status" id="weekly-status" role="status">선물로 올라간 친구 혜택은 다음 정원부터 적용돼요.</p>';
    $('weekly-buddy').addEventListener('change',e=>{weeklyRecipient=Number(e.target.value);});
    panel.querySelectorAll('[data-goal-id]').forEach(button=>button.addEventListener('click',()=>claimWeeklyGift(button.dataset.goalId,weeklyState.weekKey)));
  }
  async function claimWeeklyGift(goalId,weekKey) {
    if(claimBusy)return;claimBusy=true;const request=rankRequest,type=weeklyRecipient;renderWeekly();
    try{
      const response=await ranking.claimWeekly(goalId,type,weekKey);syncRewards(response);
      if(modalType!=='ranking'||request!==rankRequest)return;
      renderWeekly();const recipient=response.claim.buddyType;
      $('weekly-status').textContent=response.claimedNow?LumiArt.names[recipient]+'에게 선물을 전했어요! 다음 정원부터 새 혜택을 만나봐요.':'이미 '+LumiArt.names[recipient]+'에게 전달한 선물이에요.';
      audio.play('collect');pulse($('weekly-panel'));
    }catch(error){if(modalType==='ranking'&&request===rankRequest&&$('weekly-status')){$('weekly-status').textContent=error.message||'연결 후 다시 받아주세요. 선물은 중복 지급되지 않아요.';if(ranking.getRecoveryState().required)loadRanking(request);}}
    finally{claimBusy=false;if(modalType==='ranking'&&$('weekly-panel'))$('weekly-panel').querySelectorAll('[data-goal-id]').forEach(button=>{const goal=weeklyState?.goals.find(g=>g.id===button.dataset.goalId);button.disabled=!goal?.ready||goal.claimed;});}
  }
  function rankingModal() {
    const request=++rankRequest;
    $('modal').classList.add('wide','ranking-modal');modalHeader('SUNPATCH LEAGUE','우리의 반짝이는 순위','happy',null);
    const identity=ranking.getIdentity();
    if(!identity){rankingJoinModal(request);return;}
    $('modal-content').innerHTML=
      '<div class="rank-segments" role="group" aria-label="랭킹 범위"><button data-scope="campaign" aria-pressed="'+(rankScope==='campaign')+'">전체 모험</button><button data-scope="stage" aria-pressed="'+(rankScope==='stage')+'">정원별</button></div>'+
      '<div class="rank-period" role="group" aria-label="랭킹 기간"><button data-period="week" aria-pressed="'+(rankPeriod==='week')+'">이번 주</button><button data-period="all" aria-pressed="'+(rankPeriod==='all')+'">전체 기간</button><span id="ranking-population"></span></div>'+
      (rankScope==='stage'?'<label class="rank-stage-select"><span>정원 선택</span><select id="ranking-stage" aria-label="랭킹 정원">'+LumiLevels.map(d=>'<option value="'+d.id+'" '+(d.id===rankStage?'selected':'')+'>'+String(d.id).padStart(2,'0')+' · '+esc(d.title)+'</option>').join('')+'</select></label>':'')+
      '<div id="ranking-competition" class="competition-card"><div class="ranking-loading"><span class="mini-spinner"></span>다음 도전을 찾고 있어요</div></div>'+
      '<section id="weekly-panel" class="weekly-panel" aria-label="주간 목표와 보상"></section>'+
      '<div class="ranking-section-heading"><strong>정원의 반짝이는 친구들</strong><span>최고 기록 TOP 50</span></div>'+
      '<div id="ranking-results" class="ranking-results" aria-live="polite"><div class="ranking-loading"><span class="mini-spinner"></span>반짝이는 기록을 불러와요</div></div>'+
      '<div id="ranking-own"></div><p class="ranking-reset" id="ranking-reset"></p><p class="ranking-legacy" id="ranking-legacy"></p>'+
      '<details class="ranking-profile"><summary>'+icon('settings')+'랭킹 이름 · 기록 안내</summary><form id="nickname-form"><label for="nickname-input">다른 친구에게 보이는 이름</label><div><input id="nickname-input" name="nickname" maxlength="16" minlength="2" autocomplete="off" spellcheck="false" value="'+esc(identity?.nickname||'')+'" placeholder="정원에서 사용할 이름" required><button type="submit">저장</button></div><p id="nickname-status" role="status"></p></form><p>전체 모험은 정원별 최고 점수의 합이에요. 같은 정원을 반복해도 점수는 중복 가산되지 않아요. 완성한 정원의 검증된 기록만 반영돼요.</p><p>이번 주는 월요일 오전 9시(한국 시간)에 새로 시작해요. 시작한 주의 기록으로 집계되며 72시간 안에 제출해야 해요.</p></details>';
    $('modal-actions').replaceChildren();
    modalButton('현재 단계 랭킹 도전',()=>showModal('ranked-start',{id:Math.min(TOTAL,profile.unlocked)}),true);
    modalButton(screen==='play'?'퍼즐로 돌아가기':'홈으로 돌아가기',closeModal);
    for(const button of $('modal-content').querySelectorAll('[data-scope]'))button.addEventListener('click',()=>{rankScope=button.dataset.scope;rankingModal();});
    for(const button of $('modal-content').querySelectorAll('[data-period]'))button.addEventListener('click',()=>{rankPeriod=button.dataset.period;rankingModal();});
    $('ranking-stage')?.addEventListener('change',e=>{rankStage=Number(e.target.value);rankingModal();});
    $('nickname-form').addEventListener('submit',async e=>{
      e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
      try {
        const name=$('nickname-input').value.trim();
        if(ranking.getIdentity())await ranking.setNickname(name);else await ranking.register(name);
        if(modalType!=='ranking'||request!==rankRequest)return;
        $('nickname-status').textContent='이 이름으로 만나요!';
        loadRanking(request);
      }catch(error){if(modalType==='ranking'&&request===rankRequest&&$('nickname-status'))$('nickname-status').textContent=error.message||'이름을 저장하지 못했어요.';}
      finally{if(button.isConnected)button.disabled=false;}
    });
    renderWeekly();loadRanking(request);
  }
  function rankingJoinModal(request) {
    $('modal-content').innerHTML='<div class="ranking-banner"><span class="league-trophy">'+icon('trophy')+'</span><div><strong>나만의 닉네임으로 랭킹에 참여해요</strong><small>가입 없이도 퍼즐을 계속 즐길 수 있어요.</small></div></div><p>이메일·전화번호·로그인 비밀번호 없이 닉네임만 등록합니다. 이름은 랭킹에서 공개되며 중복되지 않아요.</p><form id="nickname-form" class="ranking-profile"><label for="nickname-input">닉네임 (2~16자)</label><div><input id="nickname-input" name="nickname" minlength="2" maxlength="16" autocomplete="off" spellcheck="false" required placeholder="나만의 이름"><button type="submit">가입</button></div><p id="nickname-status" role="status"></p></form><p class="save-note">이 기기에 계정 인증 정보가 저장돼요. 다른 기기에서는 백업 파일로 복원할 수 있습니다.</p>';
    modalButton('퍼즐 계속하기',closeModal,true);
    $('nickname-form').addEventListener('submit',async e=>{
      e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;const status=$('nickname-status');
      try{
        const name=$('nickname-input').value.normalize('NFKC').trim().replace(/ +/g,' ');
        if(Array.from(name).length<2||Array.from(name).length>16){status.textContent='닉네임은 2~16자로 입력해 주세요.';return;}
        await ranking.register(name);
        updateRankStatus();if(screen!=='play')renderHome();
        if(modalType==='ranking'&&request===rankRequest){showModal('ranking');toast('다음 판부터 랭킹 기록에 도전할 수 있어요.',3500);}
      }catch(error){if(status.isConnected)status.textContent=error.code==='NICKNAME_TAKEN'?'이미 사용 중인 닉네임이에요. 다른 이름을 입력해 주세요.':error.message||'가입에 실패했어요. 다시 연결해 주세요.';}
      finally{if(button.isConnected)button.disabled=false;}
    });
  }
  async function loadRanking(request) {
    const fetchId=++rankFetch;
    try {
      if(ranking.pendingCount)retryRankings();
      if(!ranking.getIdentity()){rankingModal();return;}
      const [result,account]=await Promise.all([ranking.leaderboard({scope:rankScope,period:rankPeriod,level:rankStage}),ranking.getProfile()]);
      if(modalType!=='ranking'||request!==rankRequest||fetchId!==rankFetch)return;
      syncRewards(result);syncRewards(account);
      $('ranking-population').textContent=fmt(result.totalPlayers)+'명 참여';
      $('ranking-results').innerHTML=result.entries.length?'<ol class="ranking-list">'+result.entries.map(e=>rankRow(e)).join('')+'</ol>':'<div class="ranking-empty"><span>'+icon('trophy')+'</span><strong>첫 번째 반짝임을 기다려요</strong><p>정원을 완성하고 첫 기록을 남겨보세요.</p></div>';
      renderCompetition(result);renderWeekly();
      $('ranking-own').innerHTML=result.neighbors?.length>1?'<div class="own-rank-label">내 주변의 라이벌</div><ol class="ranking-list ranking-neighbors">'+result.neighbors.map(e=>rankRow(e,e.isYou)).join('')+'</ol>':'';
      $('ranking-legacy').textContent=(rankStartIssue?.code==='RULESET_CHANGED'?rankStartIssue.message+' ':'')+(account.legacyStats?.records?'이전 점수 규칙의 '+account.legacyStats.completedStages+'개 정원 기록과 해금은 보관 중이에요. 새 리그는 새 점수 규칙으로 도전해요.':'');
      const weekEnd=new Date(result.week.endsAt);
      $('ranking-reset').textContent=rankPeriod==='week'?'새 주의 시작 · '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(weekEnd):'정원별 최고 기록을 계속 간직해요.';
      updateRankStatus();
    }catch(error){
      if(modalType!=='ranking'||request!==rankRequest||fetchId!==rankFetch)return;
      const recovery=ranking.getRecoveryState();
      if(recovery.required){
        $('ranking-results').innerHTML='<div class="ranking-empty offline"><span>'+icon('help')+'</span><strong>리그 계정의 연결을 확인해 주세요</strong><p>서버가 저장된 계정을 확인하지 못했어요.<br>기기 진행과 대기 기록은 그대로 보관하고 있어요.</p><button id="recover-ranking" class="secondary-button">리그 연결 방법 보기</button></div>';
        $('ranking-own').replaceChildren();$('ranking-reset').textContent='다시 연결할 때 기존 기록의 보관 방법을 먼저 안내해요.';
        $('ranking-competition').innerHTML='<strong>정원과 친구의 기억은 그대로예요</strong><p>계정을 확인한 뒤 새 리그 도전을 시작해요.</p>';renderWeekly(false);updateRankStatus();
        $('recover-ranking').addEventListener('click',()=>showModal('ranking-recovery'));return;
      }
      const offlineTitle=error.code==='REQUEST_TIMEOUT'?'연결에 시간이 조금 더 필요해요':error.code==='NETWORK_ERROR'?'랭킹 연결을 확인해 주세요':'잠시 연결을 기다리고 있어요';
      const offlineMessage=error.code==='REQUEST_TIMEOUT'?'서버 응답을 기다리다 잠시 멈췄어요.<br>기록은 보관 중이니 다시 연결해 주세요.':error.code==='NETWORK_ERROR'?'네트워크 연결을 확인한 뒤 다시 눌러 주세요.<br>정원은 계속 즐길 수 있어요.':esc(String(error.message||'정원은 계속 즐길 수 있어요. 연결되면 다른 친구들의 기록을 만나봐요.').slice(0,160));
      $('ranking-results').innerHTML='<div class="ranking-empty offline"><span>'+icon('flower')+'</span><strong>'+offlineTitle+'</strong><p>'+offlineMessage+'</p>'+(ranking.pendingCount?'<small>제출을 기다리는 기록 '+ranking.pendingCount+'개</small>':'')+'<button id="retry-ranking" class="secondary-button">다시 연결하기</button></div>';
      $('ranking-own').replaceChildren();$('ranking-reset').textContent='연습 기록은 이 기기에 저장돼요.';
      $('ranking-competition').innerHTML='<strong>연결되면 다음 라이벌을 만나요</strong><p>플레이 기록은 이 기기에 보관해요.</p>';renderWeekly(false);
      $('retry-ranking').addEventListener('click',rankingModal);
    }
  }
  function rankingRecoveryModal() {
    const recovery=ranking.getRecoveryState();
    if(!recovery.required){rankingModal();return;}
    modalHeader('SUNPATCH LEAGUE','리그를 다시 연결할까요?','wink');
    $('modal-content').innerHTML='<p><strong>'+esc(recovery.nickname||'기존 리그 친구')+'</strong> 계정을 서버에서 확인하지 못했어요.</p>'+
      '<p>새 리그 계정을 연결하면 기존 계정 정보와 대기 기록 '+fmt(recovery.pendingCount)+'건을 이 기기에 따로 보관해요. 기존 기록을 새 계정의 점수로 옮기지는 않아요.</p>'+
      '<p class="save-note">정원 해금·별·친구의 기억은 유지돼요. 현재 판은 연습 기록으로 마무리하고, 다음 정원부터 새 계정으로 도전해요.</p><label class="backup-field">새로운 고유 닉네임<input id="recovery-nickname" type="text" minlength="2" maxlength="16" autocomplete="off" placeholder="기존 계정과 다른 이름"></label><p id="recovery-status" class="save-note" role="status"></p>';
    modalButton('기존 기록 보관하고 새로 연결',async()=>{
      if(recoveryBusy)return;
      recoveryBusy=true;$('modal-close').disabled=true;
      $('recovery-status').textContent='기존 기록을 안전하게 보관하고 새 계정을 연결하고 있어요.';
      const buttons=[...$('modal-actions').querySelectorAll('button')];buttons.forEach(button=>{button.disabled=true;});
      const request=++rankRequest;
      try{
        await ranking.reconnectIdentity({confirmed:true,nickname:$('recovery-nickname').value});
        if(sessionInterrupted)return;
        rankRun=null;rankSubmission=null;rankStartIssue=null;weeklyState=null;sidebarSignature='';companionSignature='';
        persist();sidebars();updateRankStatus();
        try{syncRewards(await ranking.getProfile());}catch(_){}
        if(sessionInterrupted)return;
        recoveryBusy=false;$('modal-close').disabled=false;
        if(modalType==='ranking-recovery'&&request===rankRequest)showModal('ranking');
        toast('기존 기록을 보관했어요. 다음 정원부터 새 리그로 만나요',3500);
      }catch(error){
        if(modalType==='ranking-recovery'&&$('recovery-status'))$('recovery-status').textContent=error.message||'계정을 바꾸지 못했어요. 기존 기록을 유지했어요.';
      }finally{recoveryBusy=false;$('modal-close').disabled=false;buttons.forEach(button=>{if(button.isConnected)button.disabled=false;});}
    },true);
    modalButton('지금은 기존 기록 유지',()=>showModal('ranking'));
  }

  function helpModal() {
    modalHeader('LITTLE MATCHES, BIG HAPPINESS','같이 놀면 더 반짝여요','happy',0);
    $('modal').classList.add('help');
    $('modal-content').innerHTML='<p>이웃한 빛모습을 밀거나 하나씩 눌러 바꿔요.<br><strong>목표 색 팡빛과 봉오리를 모두 채우면 성공!</strong></p>'+
      '<div class="help-rules">'+
      '<div class="help-rule"><span>3</span><span><strong>같은 빛모습 3개</strong>이 만나면 팡!<br>연쇄가 이어질수록 점수가 올라가요.</span></div>'+
      '<div class="help-rule"><span>4</span><span><strong>4개는 한 줄 팡빛, 5개는 무지개.</strong><br>특수 빛모습은 이웃과 바꾸면 바로 발동!</span></div>'+
      '<div class="help-rule"><span>✿</span><span><strong>꽃봉오리 위에서 매치</strong>하면 꽃이 피어요.<br>두 겹 봉오리는 두 번. T·L 매치는 3×3 폭탄!</span></div>'+
      '<div class="help-rule"><span>×2</span><span><strong>햇살 합창! 충전 직후부터 매치 점수 두 배.</strong><br>남은 연쇄와 다음 교환 3회에 적용돼요.<br>힌트는 무제한, 바람·꽃비는 각각 2번!</span></div></div>'+
      '<div class="help-rules"><div class="help-rule"><span>'+terrainIcon('weed')+'</span><span><strong>잡초</strong>는 직접 또는 옆 칸 매치로 제거해요. 두 겹은 두 번!</span></div><div class="help-rule"><span>'+terrainIcon('frost')+'</span><span><strong>서리</strong>는 직접 매치나 특수 팡빛으로 녹여요. 서리 위 친구는 교환할 수 없어요.</span></div><div class="help-rule"><span>'+icon('spark')+'</span><span>싱글 플레이에서 특수 팡빛끼리 교환하면 새로운 조합이 발동해요.</span></div></div><p class="help-bonus"><strong>남은 이동도 점수가 돼요.</strong><br>10회 이상 남기고 완성하면 별 3개!<br>친구 친밀도 혜택은 새 정원을 시작할 때 적용돼요.</p>'+
      '<div class="help-rules"><div class="help-rule"><span>'+terrainIcon('crate')+'</span><span><strong>상자</strong>는 교환을 막아요. 직접 또는 옆 매치로 한 겹씩 열어요.</span></div><div class="help-rule"><span>'+terrainIcon('delivery')+'</span><span><strong>씨앗 운반</strong>은 씨앗 아래 같은 열을 터뜨린 칸 수만큼 아래로 내려요.</span></div></div><p class="keyboard-note">방향키: 이동 · Enter/Space: 선택<br>Shift + 방향키: 바로 교환 · Esc: 닫기</p>';
    modalButton('친구들과 놀러 가기',closeModal,true);modalButton('햇살밭의 작은 약속들',()=>showModal('world-guide'));
  }
  function starMarkup(count,large=false) {
    return Array.from({length:3},(_,i)=>'<svg class="'+(i<count?'earned':'')+'" style="--delay:'+(.12+i*.14)+'s" aria-hidden="true"><use href="#i-star"/></svg>').join('');
  }
  function scoreInfoModal() {
    modalHeader('EVERY MOVE COUNTS','여유 있게, 더 반짝이게','happy',4);
    const targets=LumiRewards.starThresholds(game.target),rate=LumiRewards.moveValue(game.target);
    $('modal-content').innerHTML='<div class="star-guide">'+targets.map((target,i)=>'<div>'+icon('star')+'<strong>별 '+(i+1)+'개</strong><span>'+fmt(target)+'점</span></div>').join('')+'</div>'+
      '<p>미션을 완성하면 별 1개는 꼭 받아요.<br>별 2·3개는 보너스까지 더한 최종 점수로 정해져요.</p>'+
      '<div class="bonus-guide"><strong>이 정원은 남은 이동 1회마다 +'+fmt(rate)+'점</strong><p>10회 이상 남기고 완성하면 별 3개까지 부족한 점수도 선물해요. 이 추가 점수는 결과창에 따로 보여요.</p></div>'+
      '<p class="save-note">친구의 시작·매치 보너스도 총점에 포함돼요.<br>진행 중이던 이전 버전의 판은 기존 규칙으로 마무리해요.</p>';
    modalButton('좋아, 같이 모아보자!',closeModal,true);
  }
  function friendshipReward() {
    return rankSubmission?.result?.friendshipReward||resultDetails.friendship;
  }
  function updateFriendshipResult() {
    const node=$('result-friendship'),reward=friendshipReward();
    if(!node || !reward)return;
    const verified=Boolean(rankSubmission?.result?.friendshipReward);
    const {buddyType,beforeXp,afterXp,gainedXp}=reward,c=LumiArt.characters[buddyType];
    const displayBefore=verified?beforeXp:reward.displayBeforeXp??beforeXp,displayAfter=verified?afterXp:reward.displayAfterXp??afterXp;
    const before=LumiRewards.bond(displayBefore),after=LumiRewards.bond(displayAfter),up=after.level>before.level;
    const memoryBefore=resultDetails.friendship?.memoryBeforeLevel??LumiRewards.bond(resultDetails.friendship?.displayBeforeXp??displayBefore).level;
    const memoryAfter=LumiProgress.memoryLevel(profile,buddyType);
    const next=LumiRewards.BONDS[after.level];
    const pending=['sending','queued'].includes(rankSubmission?.status);
    const signature=[buddyType,beforeXp,afterXp,displayBefore,displayAfter,memoryBefore,memoryAfter,verified,pending].join('|');
    if(node.dataset.signature===signature)return;node.dataset.signature=signature;
    friendshipAnimation?.cancel();
    node.innerHTML='<div class="friendship-result-head"><span class="friendship-result-avatar">'+art(buddyType,up?'excited':'happy')+'</span><div><small>'+esc(c.name)+' · '+(verified?'리그 친밀도':'친구 친밀도')+'</small><strong>'+(up?'Lv.'+after.level+' '+after.label+'!':'Lv.'+after.level+' '+after.label)+'</strong></div><b>+'+fmt(gainedXp)+' XP</b></div>'+
      '<div class="friendship-result-meter" role="progressbar" aria-label="'+esc(c.name)+' 친밀도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(after.progress*100)+'"><span style="width:'+after.progress*100+'%"></span></div>'+
      '<div class="friendship-result-detail"><span>팡빛 모으기 +'+fmt(reward.collectedXp)+' · 클리어 +'+fmt(reward.clearXp)+'</span><span>'+fmt(displayAfter)+(after.next?' / '+after.next:'')+'</span></div>'+
      '<p class="friendship-perk '+(up?'unlocked':'')+'">'+icon(up?'spark':'heart')+'<span><strong>'+(up?'새 혜택 · ':'')+esc(after.perkLabel)+'</strong>'+esc(after.perkDescription)+(up?' 다음 정원부터 적용돼요.':'')+'</span></p>'+
      (next?'<small class="friendship-next">다음 선물 · Lv.'+(after.level+1)+' '+esc(next.perkLabel)+'</small>':'<small class="friendship-next">모든 친구 혜택이 열렸어요!</small>')+
      (!verified?'<small class="friendship-verification">'+(pending?'연결 후 검증되면 리그 친밀도에도 반영돼요.':'이번 판 +'+fmt(gainedXp)+' XP는 기기에 적립했어요. 리그는 연결된 플레이로 성장해요.')+(displayAfter>afterXp?' 보관된 '+fmt(displayAfter)+' XP와 열린 혜택은 유지돼요.':'')+'</small>':'');
    if(memoryAfter>memoryBefore){
      const memory=LumiStory.characters[reward.buddyType].memories[memoryAfter-1];
      const note=document.createElement('button');note.className='friendship-memory';
      note.innerHTML=icon('book')+'<span>새 추억 · '+esc(memory.title)+'</span>';
      note.addEventListener('click',()=>showModal('character',{type:reward.buddyType,memoryTier:memory.tier}));node.appendChild(note);
    }
    if(!motion.matches){
      const fill=node.querySelector('.friendship-result-meter span');
      const frames=up?[{width:(before.progress*100)+'%'},{width:'100%',offset:.45},{width:'0%',offset:.46},{width:(after.progress*100)+'%'}]:[{width:(before.progress*100)+'%'},{width:(after.progress*100)+'%'}];
      friendshipAnimation=fill.animate(frames,{duration:up?1300:900,easing:'cubic-bezier(.22,.8,.25,1)'});friendshipAnimation.finished.catch(()=>{});
      if(up)pulse(node.querySelector('.friendship-result-avatar'));
    }
  }
  function firstGardenAvailable(){
    const garden=LumiGarden.summary(profile);
    return level===1&&garden.balance>=LumiGarden.catalog[0].price&&!garden.garden.owned.some(id=>LumiGarden.catalog.slice(0,2).some(i=>i.id===id));
  }
  function rewardSummary(win){
    if(!win)return '';
    const amount=resultDetails.seedAward||0;
    return '<section class="v2-reward-ceremony reward-compact" aria-label="획득 보상"><div class="v2-reward-head"><span class="v2-seed-medal">'+icon('leaf')+'</span><div><small>이번 판 햇살씨앗</small><strong>'+(amount?'+'+fmt(amount):'추가 보상 없음')+'</strong></div><span class="v2-reward-total">보유 '+fmt(LumiGarden.summary(profile).balance)+'</span></div></section>';
  }
  function resultMoment(){
    const story=LumiStory.stageForLevel(level,storyDefinition(level)),friend=LumiArt.names[story.speaker];
    let kind='story',picture=portrait(story.speaker,'happy'),eyebrow=friend+'와 함께 바꾼 하루',title=story.place,body=story.after,action='';
    const restored=resultDetails.restored?.[0],keepsake=LumiWardrobe.catalog.find(i=>resultDetails.newKeepsakes?.includes(i.id));
    if(firstGardenAvailable()){
      const item=LumiGarden.catalog[0];kind='first-garden';picture=LumiHome.decoration(item);eyebrow='첫 퍼즐 → 나의 정원';title='첫 화단을 꾸밀 수 있어요';
      body='모은 씨앗 '+item.price+'개로 '+item.name+'을 놓아 보세요. 포포가 돌아올 자리가 달라져요.';
    }else if(restored){
      const state=LumiJourney.getRestoration(profile,restored.chapter);kind='restoration';eyebrow='우리 손으로 복원 완료';title=restored.name;body=restored.restoredText;
      picture=LumiArt.landmark(restored.chapter,state.restored,'result-place-'+(++uid),state.projects.map(p=>p.state==='restored'),Boolean(profile.stars[restored.chapter*10-1]));
      action='<button type="button" data-result-garden="'+restored.chapter+'">변한 정원 보기 →</button>';
    }else if(keepsake){
      kind='keepsake';picture=LumiWardrobe.illustration(keepsake,'result-keepsake-'+(++uid));eyebrow=LumiArt.names[keepsake.type]+'와 더 가까워졌어요';title=keepsake.name+' 해금';
      body='함께 모은 빛으로 친구의 소품이 열렸어요. 지금 착용하면 홈과 퍼즐에서도 함께해요.';
      action='<button type="button" data-world-friend="'+keepsake.type+'">친구에게 입혀 주기 →</button>';
    }else if(!resultDetails.firstClear){
      kind='record';eyebrow='다시 걸으며 남긴 기록';title=resultDetails.newBest?'새로운 최고 기록!':resultDetails.starsAdded?'별 '+resultDetails.starsAdded+'개를 더 모았어요':'다시 함께 걸은 길';
      body=resultDetails.starsAdded?'별이 더 모여 정원 복원에 가까워졌어요.':resultDetails.newBest?'지난 최고 기록을 넘어섰어요. 이번에 찾은 길을 기억해요.':'이미 받은 씨앗은 유지돼요. 아직 없는 별이나 약속 도장에 도전해 보세요.';
    }
    return '<section class="result-moment" data-moment="'+kind+'" aria-label="이번 판의 변화"><span class="result-moment-art" aria-hidden="true">'+picture+'</span><div><small>'+esc(eyebrow)+'</small><h3>'+esc(title)+'</h3><p>'+esc(body)+'</p>'+action+'</div></section>';
  }
  function retryAdvice(snapshot){
    const remaining=snapshot.terrainRemaining||{};
    if(snapshot.deliveryRemaining>0)return {kind:'delivery',title:'씨앗 '+snapshot.deliveryRemaining+'개를 더 내려야 해요',tip:'금빛 씨앗이 있는 세로줄의 아래쪽을 비워요. 세로 특수 블록을 같은 줄에 놓으면 길게 열 수 있어요.'};
    if(remaining.crate>0)return {kind:'crate',title:'상자 '+remaining.crate+'칸이 남았어요',tip:'상자는 움직일 수 없어요. 상자 바로 옆에서 매치하거나 특수 블록으로 직접 맞혀요. 두 겹은 두 번 열어요.'};
    if(remaining.frost>0)return {kind:'frost',title:'서리 '+remaining.frost+'칸이 남았어요',tip:'서리 속 친구는 움직일 수 없어요. 주변 친구를 옮겨 그 칸을 포함한 매치를 만들거나 특수 블록으로 맞혀요.'};
    if(remaining.weed>0)return {kind:'weed',title:'잡초 '+remaining.weed+'칸이 남았어요',tip:'잡초가 있는 칸이나 바로 옆에서 매치해요. 가장자리 잡초부터 정리하면 마지막 한 칸을 놓치지 않아요.'};
    const buds=Math.max(0,snapshot.budsGoal-snapshot.bloomed);
    if(buds)return {kind:'buds',title:'봉오리 '+buds+'개가 남았어요',tip:'봉오리가 있는 바로 그 칸에서 매치해요. 옆칸만 터뜨려서는 열리지 않아요. 두 겹 봉오리는 같은 칸을 두 번 비춰요.'};
    const color=snapshot.objectives.map(g=>({...g,remaining:Math.max(0,g.target-g.current)})).filter(g=>g.remaining>0).sort((a,b)=>b.remaining-a.remaining)[0];
    if(color)return {kind:'color',title:LumiArt.names[color.type]+' '+color.remaining+'개를 더 모아요',tip:'완료한 색보다 남은 목표 색을 먼저 찾아요. 무지개 블록이 있다면 '+LumiArt.names[color.type]+'와 바꿔 같은 색을 함께 모아요.'};
    return {kind:'score',title:'목표 점수까지 '+fmt(Math.max(0,snapshot.target-snapshot.score))+'점',tip:'4개를 모아 특수 블록을 만들고, 특수 블록 두 개를 서로 바꿔 큰 조합을 노려요.'};
  }
  function resultModal(win) {
    const snapshot=game.snapshot(),stars=snapshot.stars,parts=snapshot.scoreBreakdown,advice=win?null:retryAdvice(snapshot);
    $('modal').classList.add('result-modal','experience-result');
    modalHeader(win?'STAGE '+String(level).padStart(2,'0')+' · IN FULL BLOOM':'다음 판에서 바꿀 한 가지',win?(level===TOTAL?'우리 정원이 완성됐어요!':resultDetails.firstClear?'함께 한 걸음 더!':'우리의 기록이 반짝여요'):'이번엔 여기까지 왔어요',win?'excited':'wink',game.scoringVersion===4?game.buddy.type:profile.selectedBuddy);
    const goals=snapshot.objectives.map(g=>'<span>'+art(g.type,win?'happy':'idle')+(g.current>=g.target?icon('check'):Math.max(0,g.target-g.current)+' 남음')+'</span>').join('')+
      (game.budsGoal?'<span>'+icon('flower')+(game.bloomed>=game.budsGoal?icon('check'):(game.budsGoal-game.bloomed)+' 남음')+'</span>':'')+Object.entries(snapshot.terrainRemaining||{}).filter(([kind])=>snapshot.terrainGoal[kind]).map(([kind,n])=>'<span aria-label="'+terrainName(kind)+' '+n+'개 남음">'+terrainIcon(kind)+(n?n+' 남음':icon('check'))+'</span>').join('')+(snapshot.deliveryGoal?'<span aria-label="씨앗 '+snapshot.deliveryRemaining+'개 남음">'+terrainIcon('delivery')+(snapshot.deliveryRemaining?snapshot.deliveryRemaining+' 남음':icon('check'))+'</span>':'');
    const labels={clears:'첫 클리어',stars:'새 별',promises:'새 약속 도장',chapters:'챕터 완성'},seedParts=Object.entries(resultDetails.seedParts||{}).filter(([,n])=>n>0);
    const keepsakes=LumiWardrobe.catalog.filter(i=>resultDetails.newKeepsakes?.includes(i.id));
    const highlight=[maxCombo>1?'최고 '+maxCombo+'연쇄':'',journeyRun?.metrics.specialsCreated?'특수 블록 '+journeyRun.metrics.specialsCreated+'개 생성':'',win&&game.moves?'이동 '+game.moves+'회 남김':''].filter(Boolean);
    const details='<details class="v2-result-details result-more"><summary>점수 · 보상 · 약속 자세히</summary><div class="result-detail-body">'+
      (parts?'<dl class="score-breakdown"><div><dt>퍼즐 · 연쇄 점수</dt><dd>'+fmt(parts.matchScore)+'</dd></div>'+
        (parts.buddyStartBonus+parts.buddyMatchBonus+(parts.buddyFeverBonus||0)?'<div><dt>친구 응원 보너스</dt><dd>+'+fmt(parts.buddyStartBonus+parts.buddyMatchBonus+(parts.buddyFeverBonus||0))+'</dd></div>':'')+
        (win&&snapshot.scoringVersion===4?'<div><dt>남은 이동 보너스</dt><dd>+'+fmt(parts.moveBonus)+'</dd></div>':'')+
        (parts.efficiencyBonus?'<div><dt>10회 여유 클리어 선물</dt><dd>+'+fmt(parts.efficiencyBonus)+'</dd></div>':'')+'</dl>':'')+
      (seedParts.length?'<div class="v2-reward-parts">'+seedParts.map(([kind,n])=>'<span>'+labels[kind]+' <b>+'+n+'</b></span>').join('')+'</div>':win?'<p class="v2-reward-note">이미 받은 보상은 중복 지급하지 않아요. 새 별과 약속 도장을 모으면 씨앗을 더 얻어요.</p>':'')+
      (keepsakes.length?'<div class="result-all-keepsakes" aria-label="이번 판에 열린 모든 소품">'+keepsakes.map(i=>'<button type="button" data-world-friend="'+i.type+'">'+LumiWardrobe.illustration(i,'all-keepsakes-'+(++uid))+'<span>'+esc(LumiArt.names[i.type])+' · '+esc(i.name)+'<small>친구에게 입혀 주기 →</small></span></button>').join('')+'</div>':'')+
      '<div class="result-detail"><div><span>남은 횟수</span><strong>'+game.moves+'</strong></div><div><span>최고 연쇄</span><strong>×'+maxCombo+'</strong></div><div><span>피운 꽃</span><strong>'+game.bloomed+'</strong></div></div>'+
      (win?'<div class="result-goals">'+goals+'</div>':'')+journeyResultCard(win)+(win?chapterResultCard()+'<div id="result-friendship" class="result-friendship"></div>':'')+
      '<div id="result-ranking" class="result-ranking"></div><button type="button" class="result-replay" id="result-replay">'+(win?'이 정원 한 번 더':'햇살밭 지도 보기')+'</button></div></details>';
    $('modal-content').innerHTML=(win?'<div class="result-rating"><div class="result-stars" aria-label="별 '+stars+'개 획득">'+starMarkup(stars,true)+'</div><div class="result-score">'+fmt(game.score)+'<small>점</small></div></div>'+resultMoment():
      '<section class="retry-coach" data-focus="'+advice.kind+'"><small>남은 목표에서 찾은 다음 요령</small><h3>'+esc(advice.title)+'</h3><p>'+esc(advice.tip)+'</p></section><div class="result-goals">'+goals+'</div><p class="retry-reassurance">모은 별과 정원은 그대로예요. 횟수 제한 없이 다시 도전할 수 있어요.</p>')+
      (highlight.length?'<div class="result-highlights" aria-label="이번 판의 성취">'+highlight.map(t=>'<span>'+esc(t)+'</span>').join('')+'</div>':'')+
      rewardSummary(win)+'<p id="v2-result-save" class="v2-result-save" role="status">'+(resultDetails.persisted===false?'기록 저장 실패 · 아래에서 다시 저장하세요.':'기기 기록 저장 완료')+'</p>'+
      (win&&level<TOTAL?'<div class="result-next-preview"><small>다음에 함께할 일</small><strong>'+String(level+1).padStart(2,'0')+' · '+esc(LumiLevelsFun[level].title)+'</strong></div>':'')+details;
    wireStoryLinks();wireWorldLinks();updateResultRanking();
    $('result-replay').addEventListener('click',()=>win?openGarden(level):showModal('map'));
    $('modal-content').querySelectorAll('[data-result-garden]').forEach(n=>n.addEventListener('click',()=>{gardenChapter=Number(n.dataset.resultGarden);closeModal();setScreen('garden');}));
    if(win&&firstGardenAvailable()){
      modalButton('첫 정원 소품 꾸미기',firstDecoration,true);
      modalButton('다음 단계로 →',()=>openGarden(level+1));
    }else if(win&&level<TOTAL)modalButton('다음 단계로 →',()=>openGarden(level+1),true);
    else modalButton(win?'햇살밭 지도 둘러보기':'다시 만나러 가기',()=>win?showModal('map'):openGarden(level),true);
    if(resultDetails.persisted===false)modalButton('기기 기록 다시 저장',()=>{resultDetails.persisted=rememberSession();$('v2-result-save').textContent=resultDetails.persisted?'기기 기록 저장 완료':'아직 저장할 수 없어요. 저장 공간을 확인해 주세요.';});
    modalButton('홈으로 돌아가기',goHome);
    updateFriendshipResult();
  }
  function storyScene(chapter,types) {
    return '<div class="story-diorama scene-chapter-'+chapter+'" aria-hidden="true"><span class="story-sun"></span><span class="story-cloud cloud-one"></span><span class="story-cloud cloud-two"></span><span class="story-hill hill-one"></span><span class="story-hill hill-two"></span><span class="story-lighthouse"><i>'+icon('flower')+'</i><b></b><em></em></span><span class="story-seed seed-one">'+icon('spark')+'</span><span class="story-seed seed-two">'+icon('spark')+'</span><div class="story-cast">'+types.map((type,i)=>'<span style="--cast-order:'+i+'">'+art(type,'happy')+'</span>').join('')+'</div></div>';
  }
  function worldVignette(chapterId,cast=true) {
    const chapter=LumiStory.chapters[chapterId-1],state=LumiJourney.getRestoration(profile,chapterId);
    if(!LumiArt.landmark)return storyScene(chapterId,cast?chapter.spotlight:[]);
    return '<div class="world-vignette" data-world-chapter="'+chapterId+'" data-restored="'+state.restored+'">'+
      '<span class="world-vignette-art" role="img" aria-label="'+esc(chapter.title)+', 세 곳 중 '+state.restored+'곳 복원">'+LumiArt.landmark(chapterId,state.restored,'world-'+(++uid),state.projects.map(p=>p.state==='restored'),Boolean(profile.stars[chapterId*10-1]))+'</span>'+
      (cast?'<div class="world-vignette-cast" aria-hidden="true">'+chapter.spotlight.map(type=>art(type,'happy')).join('')+'</div>':'')+
      '<span class="world-vignette-label">'+icon('leaf')+esc(chapter.title)+' <b>'+state.restored+' / 3</b></span></div>';
  }
  function chapterTabs(chapterId,attribute) {
    return '<div class="chapter-tabs world-tabs" role="tablist" aria-label="햇살밭 지역">'+LumiStory.chapters.map(c=>'<button role="tab" aria-selected="'+(chapterId===c.id)+'" '+attribute+'="'+c.id+'" aria-label="'+c.id+'장 '+esc(c.title)+'"><span>'+String(c.id).padStart(2,'0')+'</span><small>'+esc(['새싹','수로','온실','과수원','축제'][c.id-1])+'</small></button>').join('')+'</div>';
  }
  function storyDefinition(id){
    if(id===level&&mode==='campaign'&&game){
      return isV2Game()?(game.rulesRevision===LumiEngineV2.FUN_REVISION?LumiLevelsFun[id-1]:LumiLevelsV2[id-1]):LumiLevels[id-1];
    }
    return activeDefinition(id);
  }
  function promiseCopy(id,task){
    const definition=storyDefinition(id);
    if(!definition.terrain?.length&&!definition.delivery?.length)return {description:task.description,tip:task.tip};
    const metric=LumiJourney.METRICS[task.metric];
    const description=!definition.buds.length&&task.description.includes('봉오리')?metric.label+' '+task.target+metric.unit+'에 도전해요.':task.description;
    return {description,tip:definition.recommendedSkill||task.tip};
  }
  function updateJourneyHUD() {
    if(!journeyRun)return;
    const status=LumiJourney.status(level,journeyRun),earned=Boolean(profile.journey?.stamps[level-1]);
    const signature=[level,status.current,status.complete,earned].join('|');
    if(signature===journeySignature)return;
    const changed=Boolean(journeySignature);journeySignature=signature;
    $('promise-title').textContent=status.task.title;
    $('promise-caption').textContent=earned?'햇살 약속 · 도장 간직 중':status.complete?'약속 달성 · 클리어하면 도장!':'햇살 약속 · 선택 목표';
    $('promise-count').innerHTML=earned?icon('check')+' 도장':fmt(Math.min(status.current,status.target))+' / '+fmt(status.target);
    $('promise-fill').style.width=(earned?100:Math.min(100,status.progress*100))+'%';
    $('promise-button').classList.toggle('complete',status.complete||earned);
    $('promise-button').setAttribute('aria-label','이번 이야기와 햇살 약속: '+promiseCopy(level,status.task).description+', '+Math.min(status.current,status.target)+' / '+status.target+(earned?', 도장 획득':status.complete?', 이 판을 클리어하면 도장을 받아요':', 선택 목표'));
    if(changed&&status.complete&&!earned)pulse($('promise-count'));
  }
  function promiseCard(id,run=null) {
    const status=LumiJourney.status(id,run),earned=Boolean(profile.journey?.stamps[id-1]);
    const displayed=earned?status.target:Math.min(status.current,status.target),copy=promiseCopy(id,status.task);
    return '<section class="promise-detail '+(earned?'earned':'')+'"><div class="promise-detail-heading"><span class="promise-seal">'+icon(earned?'check':'leaf')+'</span><div><small>선택 목표 · 햇살 약속</small><h3>'+esc(status.task.title)+'</h3></div><b>'+ (earned?'도장 보관 중':Math.min(status.current,status.target)+' / '+status.target)+'</b></div><p>'+esc(copy.description)+'</p><div class="promise-detail-track" role="progressbar" aria-label="'+(earned?'간직한 햇살 약속 도장':'이번 판 햇살 약속')+'" aria-valuemin="0" aria-valuemax="'+status.target+'" aria-valuenow="'+displayed+'"><span style="width:'+(earned?100:status.progress*100)+'%"></span></div><p class="promise-tip">'+icon('bulb')+esc(copy.tip)+'</p><small class="promise-rule">'+(earned?'이 단계의 도장은 이미 간직했어요. 다시 도전해도 도장 수는 늘지 않아요.':'이번 판에서 약속을 이루고 클리어하면 도장 1개! 도장은 햇살밭 복원에 쓰여요.')+'<br>약속을 놓쳐도 다음 단계로 갈 수 있어요.</small></section>';
  }
  function stageStoryCard(id,after=false) {
    const story=LumiStory.stageForLevel(id,storyDefinition(id)),friend=LumiArt.characters[story.speaker];
    return '<article class="stage-story-card" style="--story-friend:'+friend.lightColor+'"><span class="stage-story-avatar" aria-hidden="true">'+art(story.speaker,after?'happy':'idle')+'</span><div><small>'+esc(friend.name)+'의 빛씨앗 일기 · '+String(id).padStart(2,'0')+'</small><strong>'+esc(story.place)+'</strong><p>'+esc(after?story.after:story.before)+'</p></div></article>';
  }
  function promiseModal(id) {
    id=Math.max(1,Math.min(profile.unlocked,Math.floor(Number(id)||level)));
    const def=storyDefinition(id),story=LumiStory.stageForLevel(id,def);
    $('modal').classList.add('promise-modal');
    modalHeader('A LITTLE PROMISE · '+String(id).padStart(2,'0'),def.title,'happy',null);
    $('modal-content').innerHTML=worldVignette(def.chapter)+stageStoryCard(id)+
      '<div class="story-play-link"><span>'+icon('spark')+'이번에 함께 할 일</span><strong>'+esc(def.terrain?.length||def.delivery?.length?def.recommendedSkill:story.action)+'</strong><p>위쪽에 표시된 목표를 모두 채우면 다음 길이 열려요.</p></div>'+
      promiseCard(id,id===level?journeyRun:null)+
      '<button class="world-text-link" id="promise-world">'+icon('leaf')+'도장이 바꾸는 햇살밭 보기 <span>→</span></button>';
    $('promise-world').addEventListener('click',()=>showModal('world',{chapter:def.chapter}));
    modalButton(id===level&&!game.won&&!game.over?'약속 기억하고 계속하기':'이 단계 만나보기',()=>id===level&&!game.won&&!game.over?closeModal():showModal('level',{id}),true);
    modalButton('햇살밭 일기 모아보기',()=>showModal('journal',{chapter:def.chapter}));
  }
  function journeyResultCard(win) {
    const status=LumiJourney.status(level,journeyRun),earned=Boolean(profile.journey?.stamps[level-1]),awarded=resultDetails.journey?.awarded;
    const title=awarded?'햇살 약속 도장을 받았어요!':earned?'간직한 약속 위에, 새로운 추억':status.complete?'약속은 이뤘어요. 다음에는 클리어까지!':'다음에는 이 약속도 함께해요';
    return '<button class="result-promise '+(awarded?'new-stamp':'')+'" data-promise-level="'+level+'"><span class="result-promise-seal">'+icon(awarded||earned?'check':'leaf')+'</span><span><strong>'+title+'</strong><small>'+esc(status.task.title)+' · '+Math.min(status.current,status.target)+' / '+status.target+'</small></span><b aria-hidden="true">›</b></button>'+
      (resultDetails.restored?.length?'<button class="restoration-earned" data-world-chapter="'+Math.ceil(level/10)+'">'+icon('spark')+'<span><small>햇살밭에 생긴 변화</small><strong>'+resultDetails.restored.map(p=>esc(p.name)).join(' · ')+'</strong><span>우리의 손길로 돌아왔어요. 보러 가기 →</span></span></button>':'');
  }
  function nextJourneyLevel(chapterId) {
    return LumiJourney.recommendLevel(profile,chapterId);
  }
  function worldModal(chapterId) {
    $('modal-actions').replaceChildren();
    chapterId=Math.max(1,Math.min(5,Math.floor(Number(chapterId)||1)));
    const chapter=LumiStory.chapters[chapterId-1],state=LumiJourney.getRestoration(profile,chapterId);
    const all=LumiJourney.restorationSummary(profile),total=all.reduce((n,c)=>n+c.restored,0);
    $('modal').classList.add('world-modal');
    modalHeader('OUR SUNPATCH · '+total+' / 15','우리 손으로 밝힌 햇살밭','happy',null);
    $('modal-content').innerHTML=chapterTabs(chapterId,'data-world-tab')+worldVignette(chapterId)+
      '<div class="world-status"><span>'+icon('star')+'<b>'+state.stars+'</b> / 30 별</span><span>'+icon('leaf')+'<b>'+state.stamps+'</b> / 10 약속</span><span>'+icon('flower')+'<b>'+state.restored+'</b> / 3 장소</span></div>'+
      '<p class="world-intent">'+esc(chapter.goal)+'</p><p class="world-hint">이야기로 되찾은 장소를 별과 도장으로 더 풍성하게 꾸며요. 모은 별과 도장은 사라지지 않고, 조건을 채우면 꾸밈이 자동으로 완성돼요.</p>'+
      '<div class="restoration-projects">'+state.projects.map((p,i)=>'<article class="restoration-project '+p.state+'"><span class="restoration-number">'+(p.state==='restored'?icon('check'):String(i+1).padStart(2,'0'))+'</span><div class="restoration-project-body"><small>'+(p.state==='restored'?'우리의 꾸밈 완성':'함께 가꾸는 장소')+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.state==='restored'?p.restoredText:p.description)+'</p><div class="restoration-requirements">'+p.requirements.map(r=>'<span class="'+(r.complete?'done':'')+'">'+icon(r.complete?'check':'lock')+esc(r.label)+' <b>'+r.current+' / '+r.target+'</b></span>').join('')+'</div><div class="restoration-track" role="progressbar" aria-label="'+esc(p.name)+' 복원" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(p.progress*100)+'"><span style="width:'+p.progress*100+'%"></span></div></div></article>').join('')+'</div>'+
      '<div class="world-note">'+icon('heart')+'이곳의 도장과 복원 풍경은 이 기기에 간직해요.</div>';
    $('modal-content').querySelectorAll('[data-world-tab]').forEach(n=>n.addEventListener('click',()=>worldModal(Number(n.dataset.worldTab))));
    const next=nextJourneyLevel(chapterId);
    modalButton(state.restored===3?'이 장의 추억 다시 만나기':profile.unlocked<(chapterId-1)*10+1?'지금 열린 길부터 함께하기':'햇살을 모으러 가기',()=>showModal('level',{id:next}),true);
    modalButton('이 지역의 일기',()=>showModal('journal',{chapter:chapterId}));
    modalButton('지금 퍼즐로 돌아가기',closeModal);
  }
  function journalModal(chapterId) {
    $('modal-actions').replaceChildren();
    chapterId=Math.max(1,Math.min(5,Math.floor(Number(chapterId)||1)));
    $('modal').classList.add('journal-modal');
    modalHeader('FIFTY LITTLE MEMORIES','빛씨앗 여행 일기','happy',null);
    $('modal-content').innerHTML=chapterTabs(chapterId,'data-journal-tab')+worldVignette(chapterId)+
      '<p class="journal-intro">걸어온 길은 이야기로, 지킨 약속은 작은 도장으로 남아요.</p><div class="journal-pages">'+LumiStory.stages.filter(s=>s.chapter===chapterId).map(s=>{
        const complete=profile.stars[s.level-1]>0,available=s.level<=profile.unlocked,stamp=Boolean(profile.journey?.stamps[s.level-1]);
        if(!available)return '<div class="journal-page locked"><span>'+String(s.level).padStart(2,'0')+'</span><strong>아직 펼치지 않은 하루</strong>'+icon('lock')+'</div>';
        return '<details class="journal-page" '+(s.level===level?'open':'')+'><summary><span>'+String(s.level).padStart(2,'0')+'</span><strong>'+esc(s.title)+'</strong><b>'+icon(stamp?'leaf':complete?'check':'book')+'</b></summary><div class="journal-page-body">'+stageStoryCard(s.level)+'<div class="journal-after"><small>'+(complete?'함께 지나온 뒤':'아직 이어 쓰는 중')+'</small><p>'+esc(complete?s.after:'이 단계를 클리어하면 다음 이야기가 기록돼요.')+'</p></div><button data-promise-level="'+s.level+'" class="journal-promise">'+icon(stamp?'check':'leaf')+esc(LumiJourney.taskForLevel(s.level).title)+(stamp?' · 도장 획득':' · 약속 보기')+'<span>→</span></button></div></details>';
      }).join('')+'</div>';
    $('modal-content').querySelectorAll('[data-journal-tab]').forEach(n=>n.addEventListener('click',()=>journalModal(Number(n.dataset.journalTab))));
    wireWorldLinks();modalButton('우리의 햇살밭 보기',()=>showModal('world',{chapter:chapterId}),true);modalButton('지금 모험으로 돌아가기',closeModal);
  }
  function worldGuideModal() {
    $('modal').classList.add('world-guide-modal');
    modalHeader('A SMALL WORLD, A SHARED HEART','햇살밭의 작은 약속들','happy',null);
    $('modal-content').innerHTML=worldVignette(1)+
      '<div class="world-rule-intro"><strong>'+esc(LumiStory.brand.tagline)+'</strong><p>'+esc(LumiStory.world.playerRole)+'</p></div><div class="world-glossary">'+LumiStory.glossary.map((g,i)=>'<details '+(i===0?'open':'')+'><summary><span>'+icon(i%2?'leaf':'spark')+'</span><strong>'+esc(g.term)+'</strong><b>+</b></summary><p>'+esc(g.meaning)+'</p><div>'+esc(g.play)+'</div></details>').join('')+'</div>';
    modalButton('친구들의 이야기 만나기',()=>showModal('album'),true);modalButton('지금 모험으로 돌아가기',closeModal);
  }
  function relationsModal(type) {
    const focus=Number.isInteger(type)&&type>=0&&type<6?type:null;
    const pairs=LumiStory.relations.filter(r=>focus===null||r.a===focus||r.b===focus);
    $('modal').classList.add('relations-modal');
    modalHeader('SIX FRIENDS, FIFTEEN CONNECTIONS',focus===null?'우리가 서로에게 주는 힘':LumiArt.names[focus]+'와 친구들','happy',null);
    $('modal-content').innerHTML='<p class="relations-intro">좋아하는 것도, 서툰 것도 서로 달라요.<br>함께 놀 때 새로운 이야기가 시작됩니다.</p><div class="relationship-list">'+pairs.map(r=>'<details class="relationship-pair"><summary><span class="relationship-portraits" aria-hidden="true">'+art(r.a,'happy')+art(r.b,'wink')+'</span><span><small>'+esc(LumiArt.names[r.a])+' × '+esc(LumiArt.names[r.b])+'</small><strong>'+esc(r.name)+'</strong></span><b>+</b></summary><div class="relationship-prose"><p>'+esc(r.tension)+'</p><p>'+esc(r.payoff)+'</p><div>'+[r.a,r.b].map(t=>'<button data-world-friend="'+t+'">'+esc(LumiArt.names[t])+' 만나기 →</button>').join('')+'</div></div></details>').join('')+'</div>';
    wireWorldLinks();modalButton('여섯 친구 도감',()=>showModal('album'),true);modalButton('지금 모험으로 돌아가기',closeModal);
  }
  function playCharacterLight(type,button) {
    audio.unlock();audio.playMatch?.(type,2,1);LumiMobile.feedback('light');
    const sprite=button.querySelector('.character-pop-art');
    button.getAnimations().forEach(a=>a.cancel());
    if(sprite&&!motion.matches){sprite.getAnimations().forEach(a=>a.cancel());sprite.animate([{transform:'scale(1)'},{transform:'scale(1.09,.91)',offset:.2},{transform:'translateY(-8px) scale(.96,1.05)',offset:.48},{transform:'scale(1.035,.98)',offset:.78},{transform:'scale(1)'}],{duration:620,easing:'cubic-bezier(.22,.8,.24,1)'}).finished.catch(()=>{});}
    const markers=[...button.querySelectorAll('.character-pop-light')];
    markers.forEach((n,i)=>{
      n.getAnimations().forEach(a=>a.cancel());
      const angle=(i/markers.length)*Math.PI*2,x=Math.cos(angle)*72,y=Math.sin(angle)*58;
      n.animate(motion.matches?[{opacity:0},{opacity:1,offset:.3},{opacity:0}]:[{opacity:0,transform:'translate(0,0) scale(.3)'},{opacity:1,transform:'translate('+x*.65+'px,'+y*.65+'px) scale(1.1)',offset:.4},{opacity:0,transform:'translate('+x+'px,'+y+'px) scale(.6) rotate(40deg)'}],{duration:motion.matches?250:620,delay:motion.matches?0:i*12,easing:'cubic-bezier(.18,.65,.25,1)'}).finished.catch(()=>{});
    });
  }
  function characterLightMarkup(type) {
    const c=LumiArt.characters[type];
    const motif=type===1?'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(24 12 12)" fill="currentColor" stroke="none"/></svg>':type===5?'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="10" cy="9" r="1.3" fill="currentColor" stroke="none"/></svg>':type===4?'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3A9 9 0 1 0 21 18 11 11 0 0 1 19 3Z" fill="currentColor" stroke="none"/></svg>':icon(['leaf','spark','heart','star','spark','flower'][type]);
    return '<button class="character-pop" id="character-pop" style="--produce-color:'+c.color+';--produce-light:'+c.lightColor+'" aria-label="'+esc(c.name)+'의 '+esc(['초록','주황','사과 빨강','토마토 다홍','노랑','크림빛'][type])+' 팡빛과 소리 느껴보기"><span class="character-pop-art">'+portrait(type,'happy')+'</span><span class="character-pop-lights" aria-hidden="true">'+Array.from({length:8},()=>'<span class="character-pop-light">'+motif+'</span>').join('')+'</span><span class="character-pop-caption">'+icon('spark')+'톡! '+esc(c.name)+'의 팡빛을 느껴봐요</span></button>';
  }
  function wireWorldLinks() {
    $('modal-content').querySelectorAll('[data-promise-level]').forEach(n=>n.addEventListener('click',()=>showModal('promise',{level:Number(n.dataset.promiseLevel)})));
    $('modal-content').querySelectorAll('[data-world-chapter]').forEach(n=>{if(n.tagName==='BUTTON')n.addEventListener('click',()=>showModal('world',{chapter:Number(n.dataset.worldChapter)}));});
    $('modal-content').querySelectorAll('[data-world-friend]').forEach(n=>n.addEventListener('click',()=>showModal('character',{type:Number(n.dataset.worldFriend)})));
  }
  function storybookModal() {
    $('modal').classList.add('storybook-modal');
    modalHeader('THE SUNPATCH CHRONICLES','햇살밭 이야기','happy',null);
    const restored=LumiStory.chapters.filter(c=>profile.stars[c.id*10-1]>0).length;
    $('modal-content').innerHTML=worldVignette(Math.ceil(level/10))+
      '<div class="world-intro"><strong>우리는 밭뭉치!</strong><p>과일과 채소에 빛씨앗이 깃들어 깨어난 친구들. 흩어진 빛씨앗을 찾아 함께 여행해요.</p><button id="story-prologue" class="story-inline-button">'+icon('book')+'처음 이야기 다시 읽기</button></div>'+
      '<div class="storybook-progress"><span>해바라기 등대의 빛</span><strong>'+restored+' / 5</strong><div><span style="width:'+restored*20+'%"></span></div></div>'+
      '<div class="world-hub-links"><button id="storybook-world">'+icon('leaf')+'<span><strong>우리의 햇살밭</strong><small>별과 도장으로 가꾸는 15곳</small></span><b>›</b></button><button id="storybook-journal">'+icon('book')+'<span><strong>빛씨앗 여행 일기</strong><small>50번의 만남, 50개의 작은 약속</small></span><b>›</b></button><button id="storybook-guide">'+icon('spark')+'<span><strong>햇살밭의 작은 약속들</strong><small>팡빛과 씨앗 거울은 무엇일까요?</small></span><b>›</b></button></div>'+
      '<div class="story-chapters">'+LumiStory.chapters.map(c=>{
        const available=profile.unlocked>=(c.id-1)*10+1,complete=profile.stars[c.id*10-1]>0;
        return '<article class="story-chapter '+(complete?'complete':'')+'"><span class="chapter-seal">'+(complete?icon('flower'):String(c.id).padStart(2,'0'))+'</span><div><small>STAGE '+((c.id-1)*10+1)+'–'+c.id*10+'</small><h3>'+esc(c.title)+'</h3><p>'+esc(c.summary)+'</p><div class="story-chapter-actions"><button data-story-opening="'+c.id+'" '+(available?'':'disabled')+'>'+icon(available?'book':'lock')+(available?'이야기 읽기':((c.id-1)*10+1)+'단계에서 열려요')+'</button>'+(complete?'<button data-story-ending="'+c.id+'">'+icon('spark')+'빛씨앗의 기억</button>':'')+'</div><span class="story-keepsake">'+icon(complete?'check':'lock')+esc(c.keepsake.name)+(complete?' · 간직한 추억':' · '+c.id*10+'단계 완료 시')+'</span></div></article>';
      }).join('')+'</div>';
    $('story-prologue').addEventListener('click',()=>showModal('story',{phase:'prologue'}));
    $('storybook-world').addEventListener('click',()=>showModal('world'));
    $('storybook-journal').addEventListener('click',()=>showModal('journal'));
    $('storybook-guide').addEventListener('click',()=>showModal('world-guide'));
    wireStoryLinks();modalButton('빛씨앗 찾으러 가기',closeModal,true);modalButton('밭뭉치 친구들',()=>showModal('album'));
  }
  function wireStoryLinks() {
    $('modal-content').querySelectorAll('[data-story-opening]').forEach(n=>n.addEventListener('click',()=>showModal('story',{chapter:Number(n.dataset.storyOpening),phase:'opening'})));
    $('modal-content').querySelectorAll('[data-story-ending]').forEach(n=>n.addEventListener('click',()=>showModal('story',{chapter:Number(n.dataset.storyEnding),phase:'ending'})));
  }
  function storyModal(data={}) {
    const prologue=data.phase==='prologue',chapter=LumiStory.chapters[Math.max(0,Math.min(4,(Number(data.chapter)||1)-1))];
    const ending=data.phase==='ending';
    if(!prologue && (profile.unlocked<(chapter.id-1)*10+1 || ending && !profile.stars[chapter.id*10-1])){storybookModal();return;}
    const page=prologue?LumiStory.prologue:ending?chapter.ending:chapter.opening;
    $('modal').classList.add('story-modal');
    modalHeader(prologue?LumiStory.prologue.eyebrow:'CHAPTER '+String(chapter.id).padStart(2,'0')+' · '+(ending?'OUR LITTLE KEEPSAKE':'A NEW LITTLE JOURNEY'),page.title,'happy',null);
    $('modal-content').innerHTML=worldVignette(prologue?1:chapter.id)+'<div class="story-prose">'+page.body.map(p=>'<p>'+esc(p)+'</p>').join('')+'</div>'+
      (prologue?'<div class="story-world-rule">'+icon('spark')+'<p>퍼즐 속 친구는 씨앗 거울에 비친 <strong>빛모습</strong>이에요. 셋이 만나면 각자의 색으로 <strong>팡빛</strong>을 나누고, 친구는 우리 곁에 남아요.</p></div>':ending?'<div class="keepsake-card">'+icon('flower')+'<div><small>우리의 추억을 간직했어요</small><strong>'+esc(chapter.keepsake.name)+'</strong><p>'+esc(chapter.keepsake.description)+'</p></div></div>':'<div class="story-mission"><span>이번 여행의 약속</span><strong>'+esc(chapter.goal)+'</strong></div>');
    if(prologue){profile.storySeen.prologue=true;}
    else profile.storySeen[ending?'endings':'openings'][chapter.id-1]=true;
    persist();
    const justFinished=ending && level===chapter.id*10 && game?.won;
    modalButton(prologue?LumiStory.prologue.cta:justFinished?(level<TOTAL?'다음 단계로 →':'햇살밭 지도 보기'):'지금 모험으로 돌아가기',()=>justFinished?(level<TOTAL?openGarden(level+1):showModal('map')):closeModal(),true);
    if(prologue&&!profile.storySeen.openings[0])modalButton('포포와 캐로의 첫 출발 읽기',()=>showModal('story',{chapter:1,phase:'opening'}));
    modalButton('이야기 모아보기',()=>showModal('storybook'));
  }
  function chapterResultCard() {
    const chapter=LumiStory.chapterForLevel(level);
    if(level%10!==0){
      const moment=chapter.milestones.find(m=>m.level===level);
      return moment?'<div class="chapter-moment">'+icon('book')+'<div><small>우리 여행의 한 장면</small><strong>'+esc(moment.title)+'</strong><p>'+esc(moment.text)+'</p></div></div>':'';
    }
    return '<button class="chapter-result" data-story-ending="'+chapter.id+'">'+icon('flower')+'<span><small>'+chapter.id+'장 · '+(level===TOTAL?'해바라기 등대를 밝혔어요':'빛씨앗을 찾았어요')+'</small><strong>'+esc(chapter.keepsake.name)+'</strong><span>'+esc(chapter.ending.title)+' →</span></span></button>';
  }
  function memoryMarkup(type,bond) {
    const character=LumiStory.characters[type];
    return '<section class="character-memories"><div class="memories-heading"><h3>둘만의 작은 기억</h3><span>'+bond.level+' / 5</span></div><p class="memory-note">한 번 가까워진 마음은, 어느 모드에서도 간직해요.</p>'+character.memories.map(m=>m.tier<=bond.level?'<details class="memory-entry" id="memory-'+type+'-'+m.tier+'" '+(m.tier===bond.level?'open':'')+'><summary><span>Lv.'+m.tier+'</span><strong>'+esc(m.title)+'</strong>'+icon('heart')+'</summary><p>'+esc(m.text)+'</p></details>':'<div class="memory-entry locked"><span>Lv.'+m.tier+'</span>'+icon('lock')+'<span>친해지면 꺼내 줄 이야기</span></div>').join('')+'</section>';
  }
  function mapModal(chapterId=Math.ceil(level/10)) {
    $('modal-actions').replaceChildren();
    chapterId=Math.max(1,Math.min(5,chapterId));
    const chapter=LumiLevels.chapters[chapterId-1];
    $('modal').classList.add('wide','garden-map');modalHeader('FIFTY LITTLE ADVENTURES','빛씨앗을 찾아, 50단계','happy',null);
    $('modal-content').innerHTML='<div class="chapter-tabs" role="tablist" aria-label="정원 챕터">'+LumiLevels.chapters.map(c=>'<button role="tab" aria-selected="'+(c.id===chapterId)+'" data-chapter="'+c.id+'" aria-label="'+c.id+'장 '+esc(c.title)+'"><span>'+String(c.id).padStart(2,'0')+'</span><small>'+((c.id-1)*10+1)+'–'+(c.id*10)+'</small></button>').join('')+'</div>'+
      '<div class="chapter-intro" style="--chapter-color:'+chapter.color+'"><span>CHAPTER '+String(chapterId).padStart(2,'0')+'</span><h3>'+esc(chapter.title)+'</h3><p>'+esc(chapter.subtitle)+'</p></div><div class="map-grid map-fifty">'+LumiLevelsFun.filter(d=>d.chapter===chapterId).map(def=>{
        const locked=def.id>profile.unlocked;
        return '<button class="map-level '+(def.id===level?'current':'')+' '+def.difficulty+'" data-level="'+def.id+'" '+(locked?'disabled':'')+' aria-label="'+def.id+'번 '+esc(def.title)+', '+(locked?'잠김':profile.stars[def.id-1]+'별')+(profile.journey?.stamps[def.id-1]?', 햇살 도장 획득':'')+'"><strong>'+String(def.id).padStart(2,'0')+'</strong><span class="map-stars">'+(locked?icon('lock'):starMarkup(profile.stars[def.id-1]))+'</span>'+(profile.journey?.stamps[def.id-1]?'<span class="map-promise-stamp" aria-hidden="true">'+icon('leaf')+'</span>':'')+(def.difficulty!=='normal'?'<small>'+esc(def.difficultyLabel)+'</small>':'')+'</button>';
      }).join('')+'</div><div class="map-legend"><span>● 산책</span><span class="hard">● 도전</span><span class="expert">● 대모험</span></div><p class="save-note">별 '+profile.stars.reduce((a,b)=>a+b,0)+' / '+(TOTAL*3)+' · '+profile.stars.filter(n=>n>0).length+' / '+TOTAL+' 정원 완료</p>';
    $('modal-content').querySelectorAll('[data-chapter]').forEach(n=>n.addEventListener('click',()=>mapModal(Number(n.dataset.chapter))));
    $('modal-content').querySelectorAll('.map-level').forEach(n=>n.addEventListener('click',()=>{audio.play('button');showModal('level',{id:Number(n.dataset.level)});}));
    const lore=LumiStory.chapters[chapterId-1];
    const storyPanel=document.createElement('div');storyPanel.className='map-story';
    storyPanel.innerHTML='<span class="map-story-art">'+art(lore.spotlight[0],'happy')+'</span><div><small>햇살지기의 이번 약속</small><strong>'+esc(lore.goal)+'</strong><button data-story-opening="'+chapterId+'" '+(profile.unlocked<(chapterId-1)*10+1?'disabled':'')+'>'+icon('book')+'이 장의 이야기</button></div>';
    $('modal-content').querySelector('.chapter-intro').after(storyPanel);wireStoryLinks();
    const town=document.createElement('button');town.className='map-world-preview';
    const restored=LumiJourney.getRestoration(profile,chapterId);
    town.innerHTML=worldVignette(chapterId,false)+'<span><strong>우리가 바꾸는 '+esc(chapter.title)+'</strong><small>복원 '+restored.restored+' / 3 · 약속 '+restored.stamps+' / 10</small></span><b>›</b>';
    town.addEventListener('click',()=>showModal('world',{chapter:chapterId}));
    $('modal-content').querySelector('.chapter-intro').after(town);
    modalButton('햇살밭 이야기 모아보기',()=>showModal('storybook'));
    modalButton('지금 정원으로 돌아가기',closeModal,true);
  }
  function levelModal(id) {
    if(!Number.isInteger(id) || id<1 || id>profile.unlocked){showModal('map');return;}
    const def=activeDefinition(id),replacing=Boolean(storedSession&&storedSession.level!==id);
    modalHeader('STAGE '+String(id).padStart(2,'0'),def.title,'happy',def.objectives[0].type);
    $('modal-content').innerHTML=stageStoryCard(id)+'<div class="level-preview-goals">'+
      def.objectives.map(g=>'<span>'+art(g.type)+g.target+'</span>').join('')+
      (def.buds.length?'<span>'+icon('flower')+def.buds.length+'</span>':'')+['weed','frost','crate'].map(kind=>{const n=(def.terrain||[]).filter(t=>t.kind===kind).length;return n?'<span aria-label="'+terrainName(kind)+' '+n+'개">'+terrainIcon(kind)+n+'</span>':'';}).join('')+(def.delivery?.length?'<span aria-label="씨앗 운반 '+def.delivery.length+'개">'+terrainIcon('delivery')+def.delivery.length+'</span>':'')+
      '</div><div class="level-info">이동 '+def.moves+'번 · 최고 기록 '+fmt(profile.bestScores[id-1])+'점</div>'+
      '<p class="level-strategy"><strong>'+esc(def.difficultyLabel)+' · '+('●'.repeat(def.rating||1))+'</strong><br>'+esc(def.recommendedSkill||def.intent||'세 친구의 만남을 찾아보세요.')+'</p>'+
      '<div class="result-stars">'+starMarkup(profile.stars[id-1])+'</div>'+promiseCard(id,id===level?journeyRun:null)+
      (replacing?'<p class="level-resume-notice">'+storedSession.level+'단계 퍼즐이 진행 중이에요. 새 판을 시작하면 그 판의 남은 횟수와 보드는 바뀌며, 모은 별과 정원은 유지돼요.</p>':'');
    if(storedSession?.level===id)modalButton('이어서 놀기',resumeCampaign,true);
    else modalButton(replacing?'이 단계 새 판 시작':'이 정원에서 놀기',()=>openGarden(id),true);
    if(replacing)modalButton(storedSession.level+'단계 이어하기',resumeCampaign);
    if(ranking.getIdentity())modalButton('이 단계 랭킹 도전',()=>showModal('ranked-start',{id}));
    modalButton('햇살밭 지도로',()=>showModal('map'));
  }
  function albumModal() {
    $('modal').classList.add('album');modalHeader('MEET THE BATMUNGCHI','우리는 밭뭉치!','idle',null);
    $('modal-content').innerHTML='<p>햇살밭에서 태어난 과일·채소 친구들.<br>마음이 가까워질수록 작은 비밀을 들려줘요.</p><div class="album-grid">'+LumiArt.characters.map((c,i)=>{
      const xp=companionXp(i,false),bond=LumiRewards.bond(xp),benefit=LumiRewards.bond(companionXp(i));
      return '<button class="album-card '+(profile.selectedBuddy===i?'selected':'')+'" data-type="'+i+'" style="--friend-light:'+c.lightColor+'" aria-label="'+esc(c.name)+', '+esc(c.species)+', '+bond.label+'"><span class="album-art">'+art(i,i===profile.selectedBuddy?'happy':'idle')+'</span><strong>'+esc(c.name)+'</strong><small>'+esc(c.species)+' · '+c.en+'</small><span class="friend-bond">'+icon('heart')+'Lv.'+bond.level+' · '+fmt(xp)+' XP</span><span class="album-perk">'+(rankRun?'리그 Lv.'+benefit.level+' · ':'')+esc(benefit.level===1?'첫 만남':benefit.perkLabel)+'</span></button>';
    }).join('')+'</div>';
    $('modal-content').querySelectorAll('.album-card').forEach(n=>n.addEventListener('click',()=>{audio.play('select');showModal('character',{type:Number(n.dataset.type)});}));
    const relations=document.createElement('button');relations.className='world-text-link';relations.innerHTML=icon('heart')+'여섯 친구, 열다섯 가지 사이 <span>→</span>';relations.addEventListener('click',()=>showModal('relations'));$('modal-content').appendChild(relations);
    modalButton('정원으로 돌아가기',closeModal,true);
  }
  function wardrobeMarkup(type){
    const selected=LumiWardrobe.selected(profile,type),today=LumiWardrobe.today(),greeted=LumiWardrobe.normalize(profile.wardrobe,profile).greetings[type]===today;
    const options=LumiWardrobe.catalog.filter(item=>item.type===type);
    return '<section class="v2-wardrobe"><div class="v2-wardrobe-heading"><strong>우리만의 작은 소품</strong><span>'+LumiWardrobe.owned(profile,type).length+'/2</span></div><p>친밀도가 오르면 특별한 소품을 선물해요. 꾸미기는 점수에 영향을 주지 않아요.</p><div class="v2-wardrobe-options">'+options.map(item=>{
      const locked=LumiWardrobe.tier(profile,type)<item.tier,active=selected?.id===item.id;
      return '<button type="button" class="v2-wardrobe-item '+(active?'equipped':'')+'" data-wardrobe="'+item.id+'" aria-pressed="'+Boolean(active)+'" '+(locked?'disabled':'')+'>'+LumiWardrobe.illustration(item,'wardrobe-ui-'+(++uid))+'<strong>'+esc(item.name)+'</strong><small>'+(locked?'Lv.'+item.tier+'에 해금':active?'착용 중 · 해제':'착용하기')+'</small></button>';
    }).join('')+'</div><button class="v2-greet" id="friend-greet">'+icon('heart')+(greeted?'한 번 더 인사하기':'오늘의 인사 건네기')+'</button><p id="friend-feedback" role="status" aria-live="polite">'+(greeted?'오늘 인사를 나눴어요.':'친구에게 먼저 손을 흔들어 봐요.')+'</p></section>';
  }
  function updateWardrobe(type,id){
    if(sessionInterrupted||!sessionGuard.canWrite())return;
    const current=LumiWardrobe.selected(profile,type),result=LumiWardrobe.equip(profile,type,current?.id===id?null:id);
    if(!result.ok)return;
    const previous=profile.wardrobe;profile.wardrobe=result.state;
    if(!persist()){profile.wardrobe=previous;$('friend-feedback').textContent='저장하지 못했어요. 이전 모습은 그대로예요.';return;}
    const offset=$('modal').scrollTop;
    showModal('character',{type});$('modal').scrollTop=offset;
    const next=$('modal-content').querySelector('[data-wardrobe="'+id+'"]');next?.focus({preventScroll:true});
    $('friend-feedback').textContent=LumiWardrobe.selected(profile,type)?'새 소품을 착용했어요!':'소품을 다시 보관했어요.';
    companionSignature='';sidebarSignature='';sidebars();updateCompanion();
    if(screen!=='play')renderHome();audio.play('collect');
  }
  function greetFriend(type){
    if(sessionInterrupted||!sessionGuard.canWrite())return;
    const result=LumiWardrobe.greet(profile,type);if(!result.ok)return;
    const before=profile.wardrobe;profile.wardrobe=result.state;
    if(!persist()){profile.wardrobe=before;$('friend-feedback').textContent='인사를 기록하지 못했어요.';return;}
    const lines=['네 자리를 따뜻하게 준비했어!','오늘도 함께 탐험할래?','작은 흠까지 반짝이는 하루야.','네 목소리를 들으니 좋아.','우리 잠깐 웃고 시작하자!','오늘의 작은 별을 같이 찾아보자.'];
    $('friend-feedback').textContent=lines[type];
    $('friend-greet').innerHTML=icon('heart')+'한 번 더 인사하기';
    playCharacterLight(type,$('character-pop'));if(screen!=='play')renderHome();
  }
  function characterModal(type) {
    const c=LumiArt.characters[type];if(!c){showModal('album');return;}
    const lore=LumiStory.characters[type];
    const total=companionXp(type),bond=LumiRewards.bond(total),local=companionXp(type,false),memoryBond={level:LumiProgress.memoryLevel(profile,type)};
    const verified=Boolean(rankRun && profile.verifiedBuddyPlayerId===ranking.getIdentity()?.id);
    $('modal').classList.add('character-modal');
    modalHeader(c.species+' · BATMUNGCHI',c.name,'happy',null);
    $('modal-content').innerHTML=characterLightMarkup(type)+wardrobeMarkup(type)+
      '<span class="character-tag" style="--friend-light:'+c.lightColor+'">'+esc(c.tagline)+'</span>'+
      '<p>'+esc(lore.personality)+'</p><div class="character-story">'+esc(lore.story)+'</div>'+
      '<div class="character-traits">'+c.signature.split(',').map(t=>'<span>'+esc(t.trim())+'</span>').join('')+'</div>'+
      '<dl class="character-heart"><div><dt>작은 꿈</dt><dd>'+esc(lore.want)+'</dd></div><div><dt>아직 서툰 것</dt><dd>'+esc(lore.flaw)+'</dd></div><div><dt>친구에게 주는 힘</dt><dd>'+esc(lore.gift)+'</dd></div></dl>'+
      '<button class="character-relationship" id="relationship-friend"><span>'+art(lore.relationship.with,'happy')+'</span><span><small>'+esc(LumiArt.names[lore.relationship.with])+'와의 이야기</small>'+esc(lore.relationship.text)+'</span></button>'+
      '<div class="bond-meter"><div class="bond-head"><strong>'+icon('heart')+(verified?'리그 ':'')+'Lv.'+bond.level+' '+bond.label+'</strong><span>'+fmt(total)+(bond.next===null?'':' / '+bond.next)+'</span></div><div class="bond-track"><span style="width:'+bond.progress*100+'%"></span></div></div>'+
      '<p class="bond-description">'+(bond.next===null?'모든 응원 혜택이 열렸어요. 오래오래 함께해요!':'다음 선물까지 '+fmt(bond.next-total)+' XP · 팡빛 모으기 + 정원 클리어로 모아요.')+'</p>'+
      '<div class="perk-ladder">'+LumiRewards.BONDS.map((b,i)=>'<div class="perk-step '+(i<bond.level?'unlocked':'')+' '+(i===bond.level-1?'current':'')+'"><span class="perk-level">'+(i<bond.level?icon('check'):icon('lock'))+'Lv.'+(i+1)+'</span><div><strong>'+esc(b.perkLabel)+'</strong><p>'+esc(b.perkDescription)+'</p><small>'+(b.at?fmt(b.at)+' XP':'우리의 첫 만남')+'</small></div></div>').join('')+'</div>'+
      '<p class="perk-note">친구 혜택은 정원을 시작할 때 정해져요. 플레이 중 친구를 바꾸거나 레벨이 오르면 다음 정원부터 새 혜택이 적용돼요.'+(game?.scoringVersion===4?' 이번 판 응원과 클리어 XP는 '+esc(LumiArt.names[game.buddy.type])+'에게 전해요.':'')+'</p>'+
      '<p class="save-note">'+(verified?'리그 친밀도 '+fmt(total)+' XP · 연결된 정원 완성과 주간 선물로 모아요.':'친구 친밀도 '+fmt(total)+' XP · 기기와 리그에서 가장 가까워진 마음을 간직해요.')+(verified&&local>total?'<br>추억은 '+fmt(local)+' XP, Lv.'+memoryBond.level+'까지 그대로 열려 있어요.':'')+'</p>'+memoryMarkup(type,memoryBond);
    $('relationship-friend').addEventListener('click',()=>showModal('character',{type:lore.relationship.with}));
    $('character-pop').addEventListener('click',()=>playCharacterLight(type,$('character-pop')));
    $('modal-content').querySelectorAll('[data-wardrobe]').forEach(b=>b.addEventListener('click',()=>updateWardrobe(type,b.dataset.wardrobe)));
    $('friend-greet').addEventListener('click',()=>greetFriend(type));
    const links=document.createElement('button');links.className='world-text-link';links.innerHTML=icon('heart')+esc(c.name)+'와 다섯 친구의 이야기 <span>→</span>';links.addEventListener('click',()=>showModal('relations',{type}));$('relationship-friend').after(links);
    modalButton(profile.selectedBuddy===type?'지금 함께하는 친구':'오늘은 '+c.name+'와 함께!',()=>{
      const previous=profile.selectedBuddy;profile.selectedBuddy=type;weeklyRecipient=type;if(!persist()){profile.selectedBuddy=previous;weeklyRecipient=previous;$('friend-feedback').textContent='친구 선택을 저장하지 못했어요.';return;}sidebars();updateCompanion();closeModal();if(screen!=='play')renderHome();buddy('wink',c.tagline,'selected');audio.play('collect');
    },true);
    modalButton('다른 친구 만나보기',()=>showModal('album'));
  }
  function moreModal() {
    modalHeader('MORE TO EXPLORE','햇살밭 더 둘러보기','happy',null);
    $('modal-content').innerHTML='<p>퍼즐에 집중할 수 있도록 부가 메뉴를 이곳에 모았어요.</p>';
    for(const [label,type] of [['이야기','storybook'],['놀이 방법','help'],['햇살밭 복원','world'],['이번 약속','promise'],['환경 설정·계정 백업','settings']]) modalButton(label,()=>showModal(type));
    modalButton('게임으로 돌아가기',closeModal,true);
  }
  function backupModal(mode) {
    const exporting=mode==='backup-export';
    modalHeader('ACCOUNT RECOVERY',exporting?'복구용 백업 만들기':'백업 파일에서 복원하기','idle',null);
    $('modal-content').innerHTML='<p>'+(exporting?'진행 기록과 랭킹 계정을 암호화하여 이 기기에 파일로 저장해요.':'백업 당시의 정원 기록으로 현재 기기 데이터를 교체합니다. 온라인 랭킹은 백업 계정의 소유권을 서버에서 검증해요.')+'</p>'+
      '<p class="save-note">암호는 12자 이상이며 서버로 전송되지 않습니다. 암호 또는 백업 파일을 잃으면 이 방법으로 복구할 수 없어요.</p>'+
      '<label class="backup-field">복구 암호<input id="backup-password" type="password" minlength="12" autocomplete="new-password" placeholder="12자 이상 입력"></label>'+
      (exporting?'<label class="backup-field">암호 다시 입력<input id="backup-confirm" type="password" minlength="12" autocomplete="new-password" placeholder="암호 확인"></label>':'<label class="backup-field">암호화 백업 파일<input id="backup-file" type="file" accept=".json,application/json"></label>')+
      '<p id="backup-status" role="status" aria-live="polite"></p>';
    modalButton(exporting?'암호화 파일 저장':'복원 실행',async()=>{
      const pw=$('backup-password').value,status=$('backup-status');status.textContent='';
      if(pw.length<12){status.textContent='암호를 12자 이상 입력해 주세요.';return;}
      if(exporting&&pw!==$('backup-confirm').value){status.textContent='확인 암호가 다릅니다.';return;}
      const file=!exporting?$('backup-file').files[0]:null;
      if(!exporting&&!file){status.textContent='백업 파일을 선택해 주세요.';return;}
      if(!exporting&&!confirm('현재 기기의 진행 기록과 계정이 백업 파일의 기록으로 교체됩니다. 계속할까요?'))return;
      if(backupBusy||!sessionGuard.canWrite())return;
      if(exporting&&!persist()){status.textContent='현재 기록을 저장하지 못했어요. 저장 공간을 확인해 주세요.';return;}
      backupBusy=true;$('modal-close').disabled=true;
      const buttons=[...$('modal-actions').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      status.textContent=exporting?'암호화 파일을 만들고 있어요.':'계정을 검증하고 복원하고 있어요.';
      try {
        const result=exporting?await LumiAccountBackup.create(pw):await LumiAccountBackup.restore(file,pw,LumiConfig.rankingApiBase);
        status.textContent=exporting?'백업 파일 저장을 요청했어요. 다운로드 폴더를 확인하세요.':'복원 성공. 게임을 다시 불러옵니다.';
        if(!exporting){sessionInterrupted=true;location.reload();}
      }catch(error){status.textContent=error.message||'작업에 실패했어요. 현재 기록은 유지됩니다.';}
      finally{backupBusy=false;$('modal-close').disabled=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
    },true);
    modalButton('돌아가기',()=>showModal('settings'));
  }
  function settingsModal() {
    modalHeader('MAKE YOURSELF AT HOME','내게 꼭 맞는 정원','wink',3);
    $('modal-content').innerHTML='<div class="settings-list">'+
      '<label class="setting-row"><span><strong>신나는 정원 음악</strong><small>Sunbeam Parade · 오리지널 16마디 루프</small></span><input class="switch" id="music-setting" type="checkbox" '+(settings.music?'checked':'')+' aria-label="배경 음악"></label>'+
      '<label class="setting-row"><span><strong>반짝반짝 효과음</strong><small>매치, 연쇄, 꽃피는 순간의 작은 소리</small></span><input class="switch" id="sfx-setting" type="checkbox" '+(settings.sfx?'checked':'')+' aria-label="효과음"></label>'+
      '<label class="setting-row"><span><strong>손끝의 작은 반짝임</strong><small>매치·연쇄·특수 조합에 맞춘 진동</small></span><input class="switch" id="haptics-setting" type="checkbox" '+(settings.haptics?'checked':'')+' aria-label="진동 피드백"></label>'+
      '<label class="volume-row"><input id="volume-setting" type="range" min="0" max="100" step="1" value="'+Math.round(settings.volume*100)+'" aria-label="전체 음량"><output id="volume-value">'+Math.round(settings.volume*100)+'%</output></label></div>'+
      '<div class="settings-stat"><div><small>최고 점수</small><strong>'+fmt(profile.bestScore)+'</strong></div><div><small>최고 연쇄</small><strong>×'+profile.maxCombo+'</strong></div></div>'+
      '<p class="save-note">정원과 친밀도는 이 브라우저에 자동 저장돼요. 다른 기기에서 계속하려면 암호화 백업을 만들어 두세요.<br>기기의 동작 줄이기 설정을 따릅니다.</p>'+
      '<div class="backup-actions"><button id="backup-export-button" type="button">복구용 백업 저장</button><button id="backup-import-button" type="button">백업에서 복원</button></div>'; 
    $('backup-export-button').addEventListener('click',()=>showModal('backup-export'));
    $('backup-import-button').addEventListener('click',()=>showModal('backup-import'));
    $('music-setting').addEventListener('change',e=>{settings.music=e.target.checked;applyAudio();unlockAudio();persist();});
    $('sfx-setting').addEventListener('change',e=>{settings.sfx=e.target.checked;applyAudio();unlockAudio();if(settings.sfx)audio.play('button');persist();});
    $('volume-setting').addEventListener('input',e=>{settings.volume=Number(e.target.value)/100;audio.setVolume(settings.volume);$('volume-value').textContent=e.target.value+'%';});
    $('volume-setting').addEventListener('change',persist);
    $('haptics-setting').addEventListener('change',e=>{settings.haptics=e.target.checked;LumiMobile.setHaptics(settings.haptics);LumiMobile.feedback();persist();});
    modalButton('이대로 좋아요',closeModal,true);
  }

  $('v2-storage-retry').addEventListener('click',()=>{if(persist())toast('기기 기록을 저장했어요.');});
  $('v2-home-back').addEventListener('click',goHome);
  $('v2-nav').addEventListener('click',event=>{const button=event.target.closest('[data-v2-nav]');if(button)homeAct(button.dataset.v2Nav);});
  $('hint-button').addEventListener('click',()=>showHint(true));
  $('coach-dismiss').addEventListener('click',()=>dismissSpecialCoach(true));
  $('score-help').addEventListener('click',()=>showModal(mode==='daily'?'daily-info':'score-info'));
  $('companion-button').addEventListener('click',()=>showModal('character',{type:profile.selectedBuddy}));
  $('finish-next').addEventListener('click',()=>mode==='daily'?showModal('daily-result'):game.won?(level<TOTAL?openGarden(level+1):showModal('map')):openGarden(level));
  $('finish-retry').addEventListener('click',()=>mode==='daily'?showModal('daily-info'):openGarden(level));
  $('finish-map').addEventListener('click',()=>mode==='daily'?goHome():showModal('map'));
  $('finish-result').addEventListener('click',()=>showModal(mode==='daily'?'daily-result':game.won?'win':'lose'));
  $('shuffle-button').addEventListener('click',()=>{
    if(sessionInterrupted || busy || modalType || shuffles<1 || game.won || game.over || !sessionGuard.canWrite())return;
    const before=game.collected.slice();shuffles--;playResult(game.shuffle(),before,{kind:'shuffle'});
  });
  $('blast-button').addEventListener('click',()=>{
    if(sessionInterrupted || busy || modalType || blasts<1 || game.won || game.over || !sessionGuard.canWrite())return;
    clearHints();view.select(null);blastMode=!blastMode;controls();setHint();audio.play('select');
    if(blastMode)toast('어디에 꽃비를 내려볼까요?');else scheduleHint();
  });
  for(const id of ['ranking-button','header-ranking'])$(id).addEventListener('click',()=>showModal('ranking'));
  $('rank-mode').addEventListener('click',()=>showModal(mode==='daily'?'daily-info':'ranking'));
  $('pause-button').addEventListener('click',()=>showModal(mode==='daily'&&game.over?'daily-result':game.won?'win':game.over?'lose':'pause'));
  $('help-button').addEventListener('click',()=>showModal('help'));
  $('story-button').addEventListener('click',()=>showModal('storybook'));
  $('more-button').addEventListener('click',()=>showModal('more'));
  $('promise-button').addEventListener('click',()=>showModal('promise'));
  $('side-world-button').addEventListener('click',()=>showModal('world'));
  $('settings-button').addEventListener('click',()=>showModal('settings'));
  $('brand-button').addEventListener('click',goHome);
  for(const id of ['stars-button','map-button'])$(id).addEventListener('click',()=>showModal('map'));
  $('stage-map-button').addEventListener('click',()=>showModal(mode==='daily'?'daily-info':'map'));
  for(const id of ['album-button','side-album-button'])$(id).addEventListener('click',()=>showModal('album'));
  $('friend-card').addEventListener('click',()=>{
    const lines=[LumiArt.characters[profile.selectedBuddy].tagline,'너랑 함께면 매일이 소풍 같아!','작은 행복도, 같이 모아보자.','잘하고 있어. 우리 천천히 가자!'];
    buddy('wink',lines[Math.floor(Math.random()*lines.length)],'greet');audio.play('select');
    pulse($('friend-card'));
  });
  $('sound-button').addEventListener('click',()=>{
    const enabled=settings.music || settings.sfx;settings.music=!enabled;settings.sfx=!enabled;
    applyAudio();unlockAudio();persist();if(!enabled)audio.play('button');
  });
  $('modal-close').addEventListener('click',closeModal);
  $('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeModal();});
  document.addEventListener('keydown',e=>{
    if(!modalType)return;
    if(e.key==='Escape'){e.preventDefault();closeModal();}
    if(e.key==='Tab'){
      const focusable=[...$('modal').querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary')].filter(n=>!n.hidden&&n.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(sessionInterrupted){fx.setPaused(true);audio.suspend(true);return;}
    fx.setPaused(document.hidden || Boolean(modalType && modalType!=='win'));
    audio.suspend(document.hidden || modalType==='pause');
    if(document.hidden){clearHints();LumiMobile.stopFeedback?.();}else scheduleHint();
  });
  window.addEventListener('pagehide',()=>{persist();sessionGuard.release();});
  window.addEventListener('lumi:back',event=>{
    if(sessionInterrupted)return;
    if(backupBusy||recoveryBusy||busy&&!turnInFlight){event.preventDefault();return;}
    if(modalType){event.preventDefault();closeModal();}
    else if(screen==='play'){event.preventDefault();showModal('pause');}
    else if(screen==='garden'){event.preventDefault();goHome();}
    else if(!persist())event.preventDefault();
  });
  window.addEventListener('lumi:app-state',e=>{if(sessionInterrupted){fx.setPaused(true);audio.suspend(true);return;}persist();audio.suspend(!e.detail.active||modalType==='pause');fx.setPaused(!e.detail.active||Boolean(modalType&&modalType!=='win'));if(!e.detail.active){clearHints();LumiMobile.stopFeedback?.();}else{scheduleHint();retryRankings();}});
  window.addEventListener('online',retryRankings);
  retryRankings();
  await startGarden(initial.session?.level || profile.unlocked,initial.session,{silent:true});
  if(!sessionInterrupted&&!modalType)setScreen('home',false);
})().catch(error=>{
  console.error('Chaeso Pang startup:',error);
  window.LumiSession?.current?.release();
  const notice=document.getElementById('session-notice');
  if(notice){
    document.getElementById('session-title').textContent='정원을 다시 불러와 주세요';
    document.getElementById('session-description').textContent='게임을 시작하는 중 연결이나 화면 준비를 마치지 못했어요. 저장된 기록을 다시 확인할게요.';
    document.querySelector('.app-shell').inert=true;
    document.getElementById('modal-backdrop').inert=true;
    notice.hidden=false;
  }
});
