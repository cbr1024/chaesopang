/* Campaign V2-B: late-stage rules add locked crates and moving seed markers.
 * V2-A and server-backed legacy definitions are never mutated. */
(function(root,factory){
 const levels=factory(typeof module==='object'&&module.exports?require('./levels-v2.js'):root.LumiLevelsV2);
 if(typeof module==='object'&&module.exports)module.exports=levels;
 root.LumiLevelsFun=levels;
})(typeof globalThis!=='undefined'?globalThis:this,function(previous){
 'use strict';
 const t=(kind,cells)=>cells.map(([r,c,hp=1])=>({kind,r,c,hp}));
 const crate=cells=>t('crate',cells),frost=cells=>t('frost',cells),weed=cells=>t('weed',cells);
 const goal=(type,target)=>[{type,target}],delivery=(...cols)=>cols.map(c=>({c,r:0}));
 const late={
 31:{moves:27,objectives:goal(4,14),buds:[],terrain:crate([[2,1],[2,4],[3,2],[3,3]]),recommendedSkill:'나무 상자 칸은 교환할 수 없어요. 직접 또는 바로 옆 매치로 잠금을 풀어요.'},
 32:{moves:29,objectives:goal(4,19),buds:[],terrain:crate([[1,0],[1,5],[2,2],[3,3],[4,0],[4,5]]),recommendedSkill:'상자 옆 매치로 양쪽 길을 열고, 아래에서 연쇄를 만들어요.'},
 33:{moves:30,objectives:goal(1,20),buds:[],terrain:crate([[1,1,2],[1,4,2],[3,1],[3,4],[4,2,2],[4,3,2]]),recommendedSkill:'겹상자는 한 파동에 한 겹씩 열려요. 줄 팡빛으로 여러 개를 동시에 열어요.'},
 34:{moves:34,objectives:goal(0,18),terrain:crate([[0,0],[0,5],[5,0],[5,5]]),recommendedSkill:'네 모서리 상자와 두 겹 봉오리를 함께 열어요.'},
 35:{moves:32,objectives:goal(4,22),buds:[],terrain:[...crate([[2,0,2],[2,5,2],[3,1],[3,4]]),...frost([[1,2,2],[4,3,2]])],recommendedSkill:'상자는 옆 매치, 서리는 직접 매치로 제거해요. 두 특수를 조합해 보세요.'},
 37:{moves:27,objectives:goal(3,18),buds:[],terrain:[],delivery:delivery(2),recommendedSkill:'금빛 씨앗 아래 같은 열을 터뜨리면 씨앗이 빈 칸 수만큼 내려와요. 맨 아래까지 보내세요.'},
 38:{moves:29,objectives:goal(0,19),buds:[],terrain:[],delivery:delivery(1,4),recommendedSkill:'두 씨앗의 서로 다른 열을 번갈아 열어요. 세로 팡빛은 씨앗을 크게 내려요.'},
 39:{moves:30,objectives:goal(2,21),buds:[],terrain:crate([[2,1],[3,1,2],[2,4],[4,4,2]]),delivery:delivery(1,4),recommendedSkill:'상자를 먼저 열고 씨앗 아래를 폭발시켜 두 길을 완성해요.'},
 40:{moves:33,objectives:goal(4,24),buds:[],terrain:[...crate([[1,0,2],[3,5,2]]),...frost([[3,1],[4,4]])],delivery:delivery(1,4),recommendedSkill:'상자와 서리를 열면서 두 씨앗을 전달하세요. 특수 블록 조합이 핵심이에요.'},
 41:{moves:28,objectives:goal(5,19),buds:[],terrain:weed([[0,2],[5,3],[2,0],[3,5]]),delivery:delivery(3),recommendedSkill:'잡초는 옆에서 정리하고 중앙 씨앗을 축제 마당으로 보내요.'},
 42:{moves:30,objectives:goal(0,22),buds:[],terrain:crate([[0,1],[0,4],[2,2,2],[3,3,2],[5,1],[5,4]]),delivery:delivery(2),recommendedSkill:'상단과 하단의 상자를 함께 열고 한 줄 특수로 씨앗 길을 만들어요.'},
 43:{moves:31,objectives:goal(5,22),buds:[],terrain:[...crate([[1,1,2],[1,4,2],[4,1,2],[4,4,2]]),...weed([[2,2],[3,3]])],recommendedSkill:'두 겹 상자를 먼저 부수고 잡초를 동시에 정리해요. 폭탄 조합이 유리해요.'},
 44:{moves:33,objectives:goal(1,25),buds:[],terrain:frost([[1,2],[2,3,2],[3,2,2],[4,3]]),delivery:delivery(0,5),recommendedSkill:'양쪽 끝 씨앗과 중앙 서리를 함께 공략하세요. 피버도 활용해요.'},
 45:{moves:34,objectives:goal(3,25),buds:[],terrain:crate([[1,0,2],[1,5,2],[2,2,2],[3,3,2],[4,0],[4,5]]),delivery:delivery(0,2,5),recommendedSkill:'세 개의 씨앗을 모두 전달하세요. 막힌 상자를 먼저 열고 세로 팡빛으로 길을 내요.'},
 47:{moves:32,objectives:goal(4,25),buds:[],terrain:[...crate([[2,0],[3,5],[4,2,2],[4,3,2]]),...frost([[1,1],[1,4]])],delivery:delivery(2,3),recommendedSkill:'인접 상자와 직접 서리를 구분하고 두 씨앗을 끝까지 보내요.'},
 48:{moves:34,objectives:goal(0,22),buds:[[1,2],[1,3],[2,1],[3,4],[4,2],[4,3]].map(([r,c])=>({r,c,hp:1})),terrain:frost([[0,1],[0,4],[5,1,2],[5,4,2]]),delivery:delivery(2),recommendedSkill:'봉오리와 서리를 깨우면서 중앙 씨앗을 내려요. 큰 연쇄를 만들수록 효율적이에요.'},
 49:{moves:34,objectives:goal(1,24),buds:[],terrain:[...crate([[1,0,2],[1,5,2],[4,0,2],[4,5,2]]),...frost([[2,2,2],[3,3,2]])],delivery:delivery(1,4),recommendedSkill:'등대로 가는 두 씨앗 길을 열어요. 무지개와 특수 팡빛을 조합해 보세요.'},
 50:{moves:36,objectives:goal(0,28),buds:[],terrain:[...crate([[1,1,2],[1,4,2],[4,1,2],[4,4,2]]),...frost([[2,2,2],[3,3,2]])],delivery:delivery(0,3,5),recommendedSkill:'마지막 세 씨앗을 등대로 보내요. 상자·서리·수집을 동시에 해결하며 축제를 완성하세요.'}
 };
 const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 const levels=previous.map(def=>{
  if(!late[def.id])return def;
  const newDef={...def,delivery:[],...late[def.id],rulesRevision:'campaign-v2-b'};
  newDef.subtitle=newDef.recommendedSkill;
  return freeze(newDef);
 });
 Object.defineProperty(levels,'chapters',{value:previous.chapters,enumerable:false});
 return Object.freeze(levels);
});
