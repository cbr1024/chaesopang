/* Fun density: deterministic, device-local daily score attack and first-match coaching.
 * Neither score attack nor its badges is a verified online leaderboard. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./engine-v2.js'):root.LumiEngineV2);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.LumiFun=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Engine){
 'use strict';
 const VERSION=1,MOVES=15,LIMIT=3,TARGET=1000000000,INTRO_SEED=1102;
 const THRESHOLDS=Object.freeze([5000,10000,18000]);
 const themes=Object.freeze([
  {title:'첫 햇살의 십자',specials:['row','col'],description:'줄 특수 두 개를 교환해 십자 연쇄를 시작해요.'},
  {title:'꽃비 소나기',specials:['row','bomb'],description:'줄과 폭탄을 조합해 넓은 꽃비를 만들어요.'},
  {title:'별빛 씨앗 폭풍',specials:['bomb','bomb'],description:'폭탄 두 개가 만드는 커다란 연쇄를 활용해요.'},
  {title:'무지개 산책',specials:['rainbow','row'],description:'무지개와 줄 특수의 색상 연쇄를 이용해요.'},
  {title:'햇살 한가득',specials:['col','bomb'],description:'세로 줄과 폭탄으로 보드를 시원하게 열어요.'}
 ]);
 const milestones=Object.freeze([{days:1,title:'첫 햇살'},{days:3,title:'새싹 도전자'},{days:7,title:'햇살 수집가'},{days:14,title:'정원의 친구'},{days:30,title:'햇살밭 달인'}]);
 const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
 const dayKey=(date=new Date())=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
 function validDay(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
 const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
 function definition(day){
  if(!validDay(day))throw Error('Invalid challenge day');
  const seed=hash('sunpatch-daily-v1:'+day),theme=themes[seed%themes.length];
  return {day,seed,title:theme.title,subtitle:theme.description,recommendedSkill:theme.description,chapter:seed%5+1,difficulty:'normal',difficultyLabel:'점수 도전',specials:theme.specials,moves:MOVES,target:TARGET,rows:6,cols:6,types:6,objectives:[],buds:[],terrain:[],buddy:{type:0,tier:1},requireScore:true};
 }
 function newGame(day){
  const d=definition(day),g=new Engine.Game(d);
  g.board[2][2].special=d.specials[0];g.board[2][3].special=d.specials[1];
  g.exportState();return g;
 }
 function validGame(day,raw,finished=false){
  try{
   const g=Engine.Game.fromState(raw),d=definition(day);
   if(g.rulesRevision!==Engine.REVISION||g.delivery.length||g.seed!==d.seed||g.rows!==6||g.cols!==6||g.types!==6||g.initialMoves!==MOVES||g.target!==TARGET||g.requireScore!==true||g.objectives.length||g.budsGoal||Object.values(g.terrainGoal).some(Boolean)||g.buddy.type!==0||g.buddy.tier!==1||g.won||Boolean(g.over)!==finished)return null;
   return g;
  }catch{return null;}
 }
 const medal=score=>THRESHOLDS.filter(n=>score>=n).length;
 function normalize(raw){
  const valid=raw?.version===VERSION;
  const entries={};
  if(valid&&raw.entries&&typeof raw.entries==='object'&&!Array.isArray(raw.entries)){
   for(const day of Object.keys(raw.entries).filter(validDay).sort().slice(-3660)){
    const e=raw.entries[day];
    if(!e||!int(e.attempts,0,LIMIT)||!int(e.completed,0,e.attempts)||!int(e.best,0,TARGET-1)||!int(e.last,0,e.best))continue;
    if(e.completed===0&&(e.best!==0||e.last!==0))continue;
    entries[day]={attempts:e.attempts,completed:e.completed,best:e.best,last:e.last};
   }
  }
  let active=null;
  const a=valid?raw.active:null;
  if(a&&validDay(a.day)&&entries[a.day]&&entries[a.day].attempts>entries[a.day].completed&&a.attempt===entries[a.day].attempts&&int(a.maxCombo,0,65)){
   const g=validGame(a.day,a.game);
   if(g)active={day:a.day,attempt:a.attempt,maxCombo:a.maxCombo,game:g.exportState()};
  }
  const lastDay=Object.keys(entries).sort().at(-1)||null;
  return {version:VERSION,entries,active,lastDay};
 }
 function overview(raw,day=dayKey()){
  const state=normalize(raw),entry=state.entries[day]||{attempts:0,completed:0,best:0,last:0};
  const completedDays=Object.keys(state.entries).filter(d=>state.entries[d].completed>0).sort();
  const best=Math.max(0,...Object.values(state.entries).map(e=>e.best));
  const eligible=!state.lastDay||day>=state.lastDay;
  return {state,day,entry,remaining:eligible?LIMIT-entry.attempts:0,eligible,best,days:completedDays.length,badges:milestones.filter(m=>completedDays.length>=m.days),nextBadge:milestones.find(m=>completedDays.length<m.days)||null,medal:medal(entry.best),active:state.active,theme:definition(day)};
 }
 function begin(raw,day=dayKey()){
  const info=overview(raw,day),state=info.state;
  if(state.active)return {ok:true,state,game:Engine.Game.fromState(state.active.game),resumed:true};
  if(!info.remaining)return {ok:false,code:info.eligible?'LIMIT':'DATE',state};
  const game=newGame(day),entry={...info.entry,attempts:info.entry.attempts+1};
  state.entries[day]=entry;state.lastDay=day;
  state.active={day,attempt:entry.attempts,maxCombo:0,game:game.exportState()};
  return {ok:true,state,game,resumed:false};
 }
 function checkpoint(raw,game,maxCombo){
  const state=normalize(raw),a=state.active;
  if(!a||!int(maxCombo,0,65))return {ok:false,code:'NO_RUN',state};
  const g=validGame(a.day,game.exportState(),game.over);
  if(!g||g.moves!==a.game.moves-1)return {ok:false,code:'INVALID_MOVE',state};
  if(!g.over){state.active={...a,maxCombo:Math.max(a.maxCombo,maxCombo),game:g.exportState()};return {ok:true,state,finished:false};}
  const e=state.entries[a.day],previous=e.best,first=e.completed===0;
  e.completed++;e.last=g.score;e.best=Math.max(e.best,g.score);state.active=null;
  return {ok:true,state,finished:true,result:{day:a.day,attempt:a.attempt,score:g.score,previous,best:e.best,newBest:g.score>previous,first,medal:medal(g.score),maxCombo:Math.max(a.maxCombo,maxCombo)}};
 }
 function introOptions(){return {seed:INTRO_SEED};}
 function decorateIntro(game){
  if(game.seed!==INTRO_SEED||game.moves!==game.initialMoves||game.rows!==6||game.cols!==6)return;
  game.board[0][0].special='row';game.board[0][1].special='bomb';game.exportState();
 }
 function introHint(game){
  if(!game||game.seed!==INTRO_SEED||game.won||game.over)return null;
  if(game.moves===game.initialMoves)return {from:{r:4,c:3},to:{r:5,c:3},text:'첫 매치! 반짝이는 두 친구를 바꿔 3개를 모아 보세요.'};
  if(game.moves===game.initialMoves-1){
   const pair=game.legalMoves().find(m=>{const a=game.board[m.from.r][m.from.c].special,b=game.board[m.to.r][m.to.c].special;return a&&b&&[a,b].includes('row')&&[a,b].includes('bomb');});
   if(pair)return {...pair,text:'이번엔 줄 팡빛과 씨앗폭탄을 서로 바꿔 큰 꽃비를 만들어요!'};
  }
  return null;
 }
 return Object.freeze({VERSION,MOVES,LIMIT,THRESHOLDS,INTRO_SEED,dayKey,definition,newGame,normalize,overview,begin,checkpoint,medal,introOptions,decorateIntro,introHint,milestones});
});
