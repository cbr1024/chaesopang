/* V2: device-local garden economy. Earned currency is derived from irreversible
 * milestones, not a mutable balance. Purchase ownership is the spending ledger.
 * No network, clock, or random dependency; one profile save includes all changes. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./journey.js'):root.LumiJourney);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.LumiGarden=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Journey){
  'use strict';
  const VERSION=1;
  const designs=[
    ['path','잎새 화단','들꽃 돌길','flowers','stone'],['shelter','민트 벤치','복숭아 쉼터','bench','shelter'],['bridge','햇살 등불','리본 다리','lantern','ribbon'],
    ['spring','연꽃 물결','조약돌 샘','flowers','stone'],['waterwheel','물빛 벤치','푸른 쉼터','bench','shelter'],['bell','물방울 등불','물빛 리본','lantern','ribbon'],
    ['window','달빛 화단','별빛 돌길','flowers','stone'],['pinwheel','보라 벤치','꿈빛 쉼터','bench','shelter'],['greenhouse','유리 등불','별자리 리본','lantern','ribbon'],
    ['sign','사과 꽃길','바람 돌길','flowers','stone'],['windhouse','살구 벤치','나뭇잎 쉼터','bench','shelter'],['ribbons','바람 등불','무지개 리본','lantern','ribbon'],
    ['gate','축제 화단','금빛 돌길','flowers','stone'],['plaza','축제 벤치','햇살 쉼터','bench','shelter'],['lighthouse','해바라기 등불','여섯빛 리본','lantern','ribbon']
  ];
  const palette=[['#efb1b2','#78ae82'],['#8ccbd2','#5c99a0'],['#c1a8df','#897bb9'],['#edbe83','#b48155'],['#f0ca72','#c18c58']];
  const catalog=Object.freeze(Journey.PROJECTS.flatMap((p,i)=>{
    const d=designs[i],colors=palette[p.chapter-1];
    if(d[0]!==p.key)throw Error('Garden catalog order mismatch');
    return [0,1].map(n=>Object.freeze({id:p.id+'-'+(n+1),slot:p.id,chapter:p.chapter,name:d[n+1],kind:d[n+3],color:colors[0],accent:colors[1],price:[[15,25],[20,35],[30,50]][p.step-1][n]}));
  }));
  const lookup=new Map(catalog.map(i=>[i.id,i]));
  const earnedParts=profile=>{
    const stars=Array.from({length:50},(_,i)=>Number.isInteger(profile?.stars?.[i])?Math.max(0,Math.min(3,profile.stars[i])):0);
    return {clears:stars.filter(n=>n>0).length*10,stars:stars.reduce((a,b)=>a+b,0)*2,
      promises:stars.filter((n,i)=>n>0&&profile?.journey?.stamps?.[i]===true).length*5,
      chapters:Array.from({length:5},(_,i)=>stars.slice(i*10,i*10+10).every(n=>n>0)?20:0).reduce((a,b)=>a+b,0)};
  };
  const earned=profile=>Object.values(earnedParts(profile)).reduce((a,b)=>a+b,0);
  const unlockedSlots=profile=>new Set(Journey.restorationSummary(profile).flatMap(c=>c.projects.filter(p=>p.state==='restored').map(p=>p.id)));
  function normalize(value,profile){
    const valid=value&&value.version===VERSION;
    const allowed=unlockedSlots(profile),budget=earned(profile),owned=[];
    let spent=0;
    for(const id of (valid&&Array.isArray(value.owned)?value.owned:[])){
      const item=lookup.get(id);
      if(!item||owned.includes(id)||!allowed.has(item.slot)||spent+item.price>budget)continue;
      spent+=item.price;owned.push(id);
    }
    const equipped={};
    for(const [slot,id] of Object.entries(valid&&value.equipped&&typeof value.equipped==='object'&&!Array.isArray(value.equipped)?value.equipped:{})){
      if(owned.includes(id)&&lookup.get(id).slot===slot)equipped[slot]=id;
    }
    return {version:VERSION,owned,equipped};
  }
  function summary(profile){
    const garden=normalize(profile?.garden,profile),total=earned(profile);
    const spent=garden.owned.reduce((n,id)=>n+lookup.get(id).price,0);
    return {earned:total,spent,balance:total-spent,owned:garden.owned.length,equipped:Object.keys(garden.equipped).length,garden};
  }
  function purchase(profile,id){
    const item=lookup.get(id),state=summary(profile);
    if(!item)return {ok:false,code:'UNKNOWN_ITEM'};
    if(!unlockedSlots(profile).has(item.slot))return {ok:false,code:'LOCKED'};
    if(state.garden.owned.includes(id))return {ok:false,code:'OWNED'};
    if(state.balance<item.price)return {ok:false,code:'INSUFFICIENT'};
    return {ok:true,garden:{version:VERSION,owned:[...state.garden.owned,id],equipped:{...state.garden.equipped,[item.slot]:id}}};
  }
  function equip(profile,id){
    const item=lookup.get(id),state=summary(profile);
    if(!item||!state.garden.owned.includes(id))return {ok:false,code:'NOT_OWNED'};
    return {ok:true,garden:{...state.garden,equipped:{...state.garden.equipped,[item.slot]:id}}};
  }
  function unequip(profile,slot){
    const state=summary(profile),equipped={...state.garden.equipped};delete equipped[slot];
    return {ok:true,garden:{...state.garden,equipped}};
  }
  return Object.freeze({VERSION,catalog,earned,earnedParts,normalize,summary,purchase,equip,unequip,unlockedSlots});
});
