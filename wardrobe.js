/* Device-local, cosmetic-only character keepsakes. No ranking or score effects. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LumiWardrobe=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1;
  const designs=[
    [['leaf-map','지도 잎 브로치','leaf','#72aa67','#d9edb2'],['sun-bag','햇살 여행 가방','bag','#e9b96f','#f9dfa3']],
    [['trail-ribbon','탐험 리본','ribbon','#e8a46b','#ffe4ac'],['brave-badge','용기의 별','star','#e9c66b','#fff3bd']],
    [['ruby-bow','루비의 작은 리본','ribbon','#df8598','#f8c4d1'],['repair-lens','조각빛 루페','lens','#b19fd4','#e9dff8']],
    [['dew-leaf','물방울 잎 배지','leaf','#78b8a1','#d6f0ce'],['spring-bell','수로의 작은 종','bell','#80bacb','#d2f2ef']],
    [['moon-star','달빛 별 장식','star','#e4be56','#fff1bc'],['joy-ribbon','웃음 리본','ribbon','#dc9bbc','#ffdfec']],
    [['pebble-bag','별자리 주머니','bag','#c3a17b','#f6dfbc'],['wish-lens','소원 조각 루페','lens','#a9afd5','#e0e7fa']]
  ];
  const catalog=Object.freeze(designs.flatMap((items,type)=>items.map(([id,name,kind,color,light],i)=>Object.freeze({id,type,name,kind,color,light,tier:i?4:2}))));
  const itemById=new Map(catalog.map(i=>[i.id,i]));
  const tier=(profile,type)=>Math.max(1,Math.min(5,Number.isInteger(profile?.buddyMemoryLevels?.[type])?profile.buddyMemoryLevels[type]:1));
  const today=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  function normalize(value,profile){
    const valid=value?.version===VERSION;
    const equipped=Array.from({length:6},(_,type)=>{
      const i=itemById.get(valid?value.equipped?.[type]:null);
      return i&&i.type===type&&tier(profile,type)>=i.tier?i.id:null;
    });
    const greetings=Array.from({length:6},(_,type)=>{
      const day=valid?value.greetings?.[type]:null;
      return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)?day:null;
    });
    return {version:VERSION,equipped,greetings};
  }
  function equip(profile,type,id){
    if(!Number.isInteger(type)||type<0||type>5)return {ok:false,code:'INVALID_FRIEND'};
    const state=normalize(profile?.wardrobe,profile);
    if(id!==null){const i=itemById.get(id);if(!i||i.type!==type)return {ok:false,code:'INVALID_ITEM'};if(tier(profile,type)<i.tier)return {ok:false,code:'LOCKED'};}
    state.equipped[type]=id;
    return {ok:true,state};
  }
  function greet(profile,type,day=today()){
    if(!Number.isInteger(type)||type<0||type>5||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return {ok:false,code:'INVALID_GREETING'};
    const state=normalize(profile?.wardrobe,profile),first=state.greetings[type]!==day;
    state.greetings[type]=day;
    return {ok:true,state,first}; // cosmetic memory only; never grants XP or currency
  }
  function owned(profile,type){return catalog.filter(i=>i.type===type&&tier(profile,type)>=i.tier);}
  function next(profile,type){return catalog.find(i=>i.type===type&&tier(profile,type)<i.tier)||null;}
  function selected(profile,type){const id=normalize(profile?.wardrobe,profile).equipped[type];return itemById.get(id)||null;}
  const paths={
    leaf:(f,s)=>'<path d="M14 46C5 12 30 3 51 8c-1 24-14 40-32 40Z" fill="'+f+'" stroke="'+s+'" stroke-width="2.4"/><path d="M12 53 40 20M23 39l-1-11M31 31l11-3" fill="none" stroke="#fff9dc" stroke-width="2.8" stroke-linecap="round"/>',
    bag:(f,s)=>'<path d="M15 23Q12 6 31 7t17 16" fill="none" stroke="'+s+'" stroke-width="5"/><rect x="8" y="20" width="48" height="36" rx="13" fill="'+f+'" stroke="'+s+'" stroke-width="2.4"/><path d="M9 29q23 17 46 0" fill="none" stroke="#fff4d4" stroke-width="3"/><rect x="27" y="33" width="10" height="12" rx="4" fill="#fff5d8" stroke="'+s+'" stroke-width="1.6"/>',
    ribbon:(f,s)=>'<path d="m27 24-17-11Q1 10 5 27l4 13q3 5 18-6l-6 20 10-8 8 9-3-21Q54 48 58 30l1-10q1-14-10-8L35 24Z" fill="'+f+'" stroke="'+s+'" stroke-width="2.4" stroke-linejoin="round"/><circle cx="32" cy="29" r="8" fill="#fff0d7" stroke="'+s+'" stroke-width="1.6"/>',
    star:(f,s)=>'<path d="m32 4 8 19 21 2-16 14 5 21-18-11-18 11 5-21L3 25l21-2Z" fill="'+f+'" stroke="'+s+'" stroke-width="2.4" stroke-linejoin="round"/><path d="m32 12 3 12 12 2" fill="none" stroke="#fff9e4" stroke-width="4" stroke-linecap="round"/>',
    lens:(f,s)=>'<circle cx="27" cy="27" r="20" fill="'+f+'" stroke="'+s+'" stroke-width="4"/><circle cx="27" cy="27" r="13" fill="#edf5fa" stroke="#fff" stroke-width="2"/><path d="m41 43 16 15" stroke="'+s+'" stroke-width="9" stroke-linecap="round"/><path d="M17 23q4-9 14-7" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
    bell:(f,s)=>'<path d="M16 38V24a16 16 0 0 1 32 0v14l6 9H10Z" fill="'+f+'" stroke="'+s+'" stroke-width="2.4" stroke-linejoin="round"/><circle cx="32" cy="51" r="6" fill="'+s+'"/><path d="M28 7q4-9 8 0M21 26v10" stroke="#fff6dc" fill="none" stroke-width="3.5" stroke-linecap="round"/>'
  };
  function illustration(item,prefix='wardrobe'){
    if(!item||!itemById.has(item.id))return '';
    item=itemById.get(item.id);const p=String(prefix).replace(/[^A-Za-z0-9_-]/g,'')+'-trim',fill='url(#'+p+')';
    return '<svg viewBox="0 0 64 64" class="wardrobe-art" aria-hidden="true" focusable="false"><defs><linearGradient id="'+p+'" x1="0" y1="0" x2=".7" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="'+item.light+'"/><stop offset="1" stop-color="'+item.color+'"/></linearGradient></defs>'+paths[item.kind](fill,item.color)+'</svg>';
  }
  return Object.freeze({VERSION,catalog,tier,today,normalize,equip,greet,owned,next,selected,illustration});
});
