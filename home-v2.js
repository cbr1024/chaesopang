/* V2 home and garden UI. Existing art is reused; game state is owned by app.js. */
(function(root){
  'use strict';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=id=>'<svg class="icon" aria-hidden="true"><use href="#i-'+id+'"/></svg>';
  let serial=0;
  function decoration(item){
    const id='decoration-'+(++serial),c='url(#'+id+'-c)',a='url(#'+id+'-a)',sh='#6b7955';
    const paths={
      flowers:'<path d="M18 60Q40 45 78 60L73 69H22Z" fill="'+a+'"/>'+[24,43,65].map((x,i)=>'<path d="M'+x+' 58v-'+(20+i*3)+'" stroke="'+sh+'" stroke-width="3" stroke-linecap="round"/><circle cx="'+x+'" cy="'+(34-i*3)+'" r="10" fill="'+c+'" stroke="#fff9e8" stroke-width="2"/><circle cx="'+x+'" cy="'+(34-i*3)+'" r="3.5" fill="#f3cc68"/>').join(''),
      stone:'<path d="M16 64Q45 28 82 62L75 72H20Z" fill="'+a+'"/><g fill="'+c+'" stroke="#fff9e8" stroke-width="2"><ellipse cx="29" cy="59" rx="12" ry="7"/><ellipse cx="51" cy="48" rx="13" ry="8"/><ellipse cx="73" cy="60" rx="12" ry="7"/></g>',
      bench:'<g stroke="'+sh+'" stroke-width="4" stroke-linecap="round"><path d="M26 61v13M73 61v13M29 38v17M70 38v17"/></g><rect x="21" y="28" width="57" height="23" rx="6" fill="'+c+'" stroke="#fff8e8" stroke-width="2"/><rect x="19" y="52" width="61" height="13" rx="5" fill="'+a+'"/>',
      shelter:'<path d="M15 39Q50 4 85 39Z" fill="'+c+'" stroke="#fff8e8" stroke-width="3"/><path d="M22 40v31M78 40v31" stroke="'+sh+'" stroke-width="4" stroke-linecap="round"/><path d="M24 65h52" stroke="'+a+'" stroke-width="9" stroke-linecap="round"/><circle cx="50" cy="25" r="5" fill="#fff5c4"/>',
      lantern:'<path d="M50 16v10M50 61v13M34 74h32" stroke="'+sh+'" stroke-width="4" stroke-linecap="round"/><rect x="34" y="27" width="32" height="34" rx="9" fill="'+c+'" stroke="'+a+'" stroke-width="3"/><path d="M42 34v19M57 34v19" stroke="#fff6d6" stroke-width="5" stroke-linecap="round"/><path d="m28 30 22-11 22 11Z" fill="'+a+'"/>',
      ribbon:'<path d="M18 22v52M82 22v52M18 26Q50 48 82 26" fill="none" stroke="'+sh+'" stroke-width="3" stroke-linecap="round"/><path d="m25 30 13 4-11 15Z" fill="'+c+'"/><path d="m43 36 14 0-7 17Z" fill="#e9c56c"/><path d="m62 34 13-4-1 19Z" fill="'+a+'"/>'
    };
    return '<svg viewBox="0 0 100 88" aria-hidden="true"><defs><linearGradient id="'+id+'-c" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff1d9"/><stop offset=".35" stop-color="'+item.color+'"/><stop offset="1" stop-color="'+item.accent+'"/></linearGradient><linearGradient id="'+id+'-a" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+item.color+'"/><stop offset="1" stop-color="'+item.accent+'"/></linearGradient></defs><ellipse cx="50" cy="76" rx="36" ry="7" fill="#59764d" opacity=".18"/>'+paths[item.kind]+'</svg>';
  }
  function portrait(profile,type,mood='happy'){
    const id='v2-friend-'+(++serial),item=root.LumiWardrobe.selected(profile,type);
    return '<span class="v2-friend-portrait">'+root.LumiArt.sprite(type,id,mood)+(item?'<span class="v2-worn-item">'+root.LumiWardrobe.illustration(item,id)+'</span>':'')+'</span>';
  }
  function render(node,{profile,level,definition,active,busy,ranked,identity,view='home',chapter,act}){
    const summary=root.LumiGarden.summary(profile),all=root.LumiJourney.restorationSummary(profile);
    const complete=profile.stars.filter(n=>n>0).length, fresh=!profile.hasSeenTutorial&&complete===0;
    const actual=Number.isInteger(chapter)?chapter:Math.ceil(level/10),region=all[actual-1];
    const itemMap=new Map(root.LumiGarden.catalog.map(i=>[i.id,i]));
    const equipped=region.projects.map(p=>itemMap.get(summary.garden.equipped[p.id])).filter(Boolean);
    const def=definition||root.LumiLevelsV2[level-1],buddy=profile.selectedBuddy;
    const title=view==='garden'?'나의 햇살밭':'오늘도, 햇살 한 줌';
    const character=root.LumiArt.characters[buddy],tier=root.LumiWardrobe.tier(profile,buddy),nextGift=root.LumiWardrobe.next(profile,buddy),saidHello=root.LumiWardrobe.normalize(profile.wardrobe,profile).greetings[buddy]===root.LumiWardrobe.today();
    const next=region.projects.find(p=>p.state!=='restored');
    const hero='<div class="v2-landscape"><div class="v2-landmark">'+root.LumiArt.landmark(actual,region.restored,'v2-land-'+(++serial),region.projects.map(p=>p.state==='restored'),Boolean(profile.stars[actual*10-1]))+'</div><div class="v2-cast">'+[buddy,(buddy+1)%6,(buddy+3)%6].map(t=>portrait(profile,t)).join('')+'</div><div class="v2-placed">'+equipped.map(i=>'<span title="'+esc(i.name)+'">'+decoration(i)+'</span>').join('')+'</div><span class="v2-location">'+icon('leaf')+esc(root.LumiLevels.chapters[actual-1].title)+' · '+region.restored+'/3 복원</span></div>';
    const header='<div class="v2-intro"><span class="v2-kicker">SUNPATCH · 채소팡</span><h1 tabindex="-1" id="v2-heading">'+title+'</h1><p>'+ (view==='garden'?'퍼즐에서 모은 햇살씨앗으로 우리만의 풍경을 만들어요.':'작은 팡빛을 모아 친구들과 정원을 가꿔요.')+'</p></div><div class="v2-wallet"><span>'+icon('star')+'<b>'+profile.stars.reduce((a,b)=>a+b,0)+'</b><small>별</small></span><span>'+icon('leaf')+'<b>'+summary.balance+'</b><small>햇살씨앗</small></span><span>'+icon('flower')+'<b>'+all.reduce((n,c)=>n+c.restored,0)+'/15</b><small>복원</small></span></div>';
    let content;
    if(view==='garden'){
      const tabs='<div class="v2-chapters" aria-label="정원 지역">'+root.LumiLevels.chapters.map(c=>'<button data-chapter="'+c.id+'" aria-pressed="'+(c.id===actual)+'">'+esc(['새싹','수로','온실','과수원','축제'][c.id-1])+'</button>').join('')+'</div>';
      content=tabs+hero+'<div class="v2-section-title"><h2>정원 꾸미기</h2><span>'+summary.owned+'/30 소품</span></div>'+
        region.projects.map(p=>'<article class="v2-slot"><div class="v2-slot-heading"><div><small>'+(p.state==='restored'?'복원 완료 · 꾸미기 가능':'아직 복원 중')+'</small><h3>'+esc(p.name)+'</h3></div><b>'+Math.round(p.progress*100)+'%</b></div>'+
          (p.state!=='restored'?'<div class="v2-requirements">'+p.requirements.map(req=>'<span class="'+(req.complete?'is-done':'')+'">'+esc(req.label)+' '+req.current+'/'+req.target+'</span>').join('')+'</div>':'<div class="v2-items">'+root.LumiGarden.catalog.filter(i=>i.slot===p.id).map(i=>{
            const owned=summary.garden.owned.includes(i.id),equipped=summary.garden.equipped[p.id]===i.id;
            return '<button class="v2-item '+(equipped?'equipped':'')+'" data-item="'+i.id+'" data-op="'+(equipped?'unequip':owned?'equip':'purchase')+'" aria-label="'+esc(i.name)+', '+(equipped?'배치 해제':owned?'배치하기':i.price+'씨앗으로 얻기')+'" '+(!owned&&summary.balance<i.price?'disabled':'')+'>'+decoration(i)+'<strong>'+esc(i.name)+'</strong><span>'+(equipped?'배치 중 · 해제':owned?'보유 · 배치':i.price+' 씨앗')+'</span></button>';
          }).join('')+'</div>')+'</article>').join('')+'<p class="v2-note">소품은 한 번 얻으면 다시 비용 없이 배치할 수 있어요. 정원과 씨앗은 이 기기에 저장됩니다.</p>';
    }else{
      content=hero+'<div class="v2-next"><div><small>'+(fresh?'첫 모험':active?'이어갈 퍼즐':complete===50?'마지막 정원':'다음 모험')+'</small><h2>'+String(def.id).padStart(2,'0')+' · '+esc(def.title)+'</h2><p>'+esc(def.recommendedSkill)+'</p></div><button class="v2-map" data-action="map" aria-label="50개 스테이지 지도">'+icon('map')+'지도</button></div><button class="v2-play" data-action="play" '+(busy?'disabled':'')+'>'+icon('play')+'<span>'+(fresh?'첫 퍼즐 시작':active?'이어서 놀기':complete===50?'최고 기록에 도전':'다음 퍼즐 시작')+'<small>'+(ranked?'이전 랭킹 판 이어하기':'가입 없이 · 기기 저장')+'</small></span><b>›</b></button>'+
        '<div class="v2-section-title"><h2>오늘의 작은 목표</h2><span>'+complete+'/50 클리어</span></div><div class="v2-progress"><span style="width:'+complete/50*100+'%"></span></div><div class="v2-goal"><span>'+icon('flower')+'</span><div><strong>'+esc(next?.name||'정원 꾸미기')+'</strong><small>'+esc(next?'복원 조건을 확인하고 햇살밭을 밝혀요.':'모은 소품으로 풍경을 바꾸어 보세요.')+'</small></div><button data-action="garden">보기 ›</button></div>'+
        '<button class="v2-friend-card" data-action="friend">'+portrait(profile,buddy,saidHello?'happy':'wink')+'<span><small>함께하는 친구 · Lv.'+tier+'</small><strong>'+esc(character.name)+'</strong><small>'+esc(saidHello?'오늘도 만나서 반가워!':nextGift?'Lv.'+nextGift.tier+'에 '+nextGift.name+' 해금':'둘만의 소품을 꾸며요')+'</small></span><b aria-hidden="true">›</b></button>'+
        '<button class="v2-rank-card" data-action="ranking">'+icon('trophy')+'<span><strong>햇살 리그</strong><small>'+esc(identity?identity.nickname+'님의 온라인 순위':'고유 닉네임으로 참여')+'</small></span><b>›</b></button>';
    }
    node.innerHTML=header+content+'<div class="v2-home-status" role="status" aria-live="polite"></div>';
    node.onclick=e=>{
      const b=e.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.chapter)act('chapter',Number(b.dataset.chapter));
      else if(b.dataset.item)act(b.dataset.op,b.dataset.item);
      else if(b.dataset.action)act(b.dataset.action);
    };
  }
  root.LumiHome=Object.freeze({render,decoration,portrait});
})(globalThis);
