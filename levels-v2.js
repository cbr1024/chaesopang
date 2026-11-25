/* Local campaign terrain layouts. Existing ranking definitions stay untouched. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./levels.js'):root.LumiLevels);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.LumiLevelsV2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(legacy){
  'use strict';
  const t=(kind,cells)=>cells.map(([r,c,hp=1])=>({r,c,kind,hp}));
  const weed=cells=>t('weed',cells),frost=cells=>t('frost',cells);
  const goals=(...pairs)=>pairs.map(([type,target])=>({type,target}));
  const bud=cells=>cells.map(([r,c,hp=1])=>({r,c,hp}));
  const rules={
    11:{moves:25,objectives:goals([3,12]),buds:[],terrain:weed([[2,2],[2,3],[3,2],[3,3]]),recommendedSkill:'잡초 칸 또는 바로 옆에서 매치하면 뿌리가 사라져요.',subtitle:'물길을 막은 작은 잡초를 먼저 뽑아 주세요.'},
    12:{moves:27,objectives:goals([3,14],[0,10]),buds:[],terrain:weed([[1,0],[2,0],[3,0],[2,5],[3,5],[4,5]]),recommendedSkill:'양쪽 가장자리 잡초를 한 줄씩 정리해요.',subtitle:'수로 양옆에서 햇살이 피어날 자리를 만들어요.'},
    13:{moves:28,objectives:goals([4,16],[3,12]),buds:[],terrain:weed([[0,3],[1,4],[2,1],[3,4],[4,1],[5,2]]),recommendedSkill:'직접 닿기 어려운 잡초는 바로 옆 매치로 제거해요.',subtitle:'징검돌 주변에 숨은 잡초를 찾아요.'},
    14:{moves:30,terrain:weed([[1,1],[1,4],[4,1],[4,4]]),recommendedSkill:'두 겹 봉오리는 직접 매치, 잡초는 옆 매치로 제거해요.',subtitle:'봉오리와 잡초가 함께 있는 작은 정원이에요.'},
    15:{moves:29,buds:[],terrain:weed([[0,1,2],[0,2],[0,3],[0,4,2],[3,1],[3,4]]),recommendedSkill:'두 겹 잡초는 서로 다른 매치 파동 두 번이 필요해요.',subtitle:'돌 틈에 깊이 뿌리내린 잡초를 제거해요.'},
    17:{moves:30,buds:[],terrain:weed([[0,2,2],[1,2],[2,2],[3,2,2],[4,2],[5,2],[5,3]]),recommendedSkill:'세로 팡빛으로 물길을 따라 잡초를 정리해요.',subtitle:'위에서 아래로 이어지는 수로를 청소해요.'},
    18:{moves:30,buds:bud([[2,1],[2,2,2],[3,3,2],[3,4]]),terrain:weed([[0,0],[1,0],[1,5],[4,0],[4,5],[5,5]]),recommendedSkill:'가운데 봉오리와 가장자리 잡초를 다른 방식으로 공략해요.',subtitle:'물결이 돌아오도록 두 가지 장애물을 함께 제거해요.'},
    19:{moves:31,buds:[],terrain:weed([[1,2],[1,3],[2,1,2],[3,4,2],[4,2],[4,3]]),recommendedSkill:'필요한 세 가지 색을 모으면서 잡초에도 매치 파동을 닿게 해요.',subtitle:'친구 세 색과 수로의 잡초를 동시에 정리해요.'},
    20:{moves:31,buds:bud([[1,2],[1,3],[2,2,2],[2,3,2],[3,2,2],[3,3,2],[4,2],[4,3]]),terrain:weed([[0,1,2],[0,4],[2,0],[3,5],[5,1],[5,4,2]]),recommendedSkill:'특수 블록 조합으로 봉오리와 잡초를 동시에 해결해요.',subtitle:'마지막 물길을 열어 물방울 수로를 완성해요.'},
    21:{moves:29,objectives:goals([2,14]),buds:[],terrain:frost([[2,2],[2,3],[3,2]]),recommendedSkill:'서리 칸은 교환할 수 없어요. 다른 칸을 움직여 서리 위에 매치를 만들어요.',subtitle:'달빛 온실의 차가운 서리를 녹여 주세요.'},
    22:{moves:32,buds:[],terrain:frost([[1,1],[1,4],[2,3],[3,2],[4,4]]),recommendedSkill:'서리 위 직접 매치 또는 특수 팡빛으로 잠금을 풀어요.',subtitle:'온실 유리 주변에 흩어진 서리를 녹여요.'},
    23:{moves:33,buds:[],terrain:frost([[1,2,2],[2,2,2],[2,4],[3,1],[3,3,2],[4,3,2]]),recommendedSkill:'두 겹 서리는 직접 두 번 맞혀야 잠금이 풀려요.',subtitle:'두껍게 얼어붙은 서리에 햇살을 전해요.'},
    24:{moves:33,buds:bud([[1,2],[1,3],[4,2],[4,3],[2,1,2],[3,4,2]]),terrain:frost([[0,2],[2,4],[3,1],[5,3]]),recommendedSkill:'서리 칸은 잠겨 있어요. 줄 특수로 봉오리와 서리를 같이 맞혀요.',subtitle:'창가 봉오리와 얼어붙은 유리를 함께 살펴요.'},
    25:{moves:33,buds:[],terrain:[...frost([[1,1],[1,4,2],[2,2],[3,3,2],[4,1],[4,4]]),...weed([[0,2],[2,5],[3,0],[5,3]])],recommendedSkill:'잡초는 옆에서, 서리는 직접 터뜨려야 해요. 특수 조합을 활용하세요.',subtitle:'차가운 창과 따뜻한 흙의 서로 다른 장애물을 풀어요.'},
    27:{moves:32,buds:[],terrain:frost([[0,2],[1,3,2],[2,1],[3,4],[4,2,2],[5,3]]),recommendedSkill:'폭탄을 가까이 옮기면 여러 서리를 동시에 깰 수 있어요.',subtitle:'바람개비 주변의 서리를 정리해요.'},
    29:{moves:33,objectives:goals([0,20],[2,18]),buds:[],terrain:[...frost([[1,1,2],[1,4],[4,1],[4,4,2]]),...weed([[0,2],[2,2],[3,3,2],[5,3]])],recommendedSkill:'햇살 합창을 만들면서 서리와 잡초를 차례로 해결해요.',subtitle:'온실의 안과 밖을 함께 되살려요.'},
    30:{moves:34,buds:[],terrain:[...frost([[1,1,2],[1,3],[2,4],[3,1],[4,2,2],[4,4,2]]),...weed([[0,0,2],[0,5],[2,0],[3,5],[5,0],[5,5,2]])],recommendedSkill:'무지개와 다른 특수 블록을 합쳐 얼음과 잡초를 동시에 정리해요.',subtitle:'달빛 온실의 마지막 얼어붙은 길을 열어요.'}
  };
  const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  const levels=legacy.map(def=>{
    const next={...def,terrain:[],...rules[def.id],rulesRevision:'campaign-v2-a'};
    const seen=new Set();
    for(const p of next.terrain){const key=p.r+','+p.c;if(seen.has(key)||p.r<0||p.r>5||p.c<0||p.c>5)throw Error('Invalid V2 level '+def.id);seen.add(key);}
    return freeze(next);
  });
  Object.defineProperty(levels,'chapters',{value:legacy.chapters,enumerable:false});
  return Object.freeze(levels);
});
