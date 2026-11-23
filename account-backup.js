/* Encrypted, user-managed recovery. Never export a plaintext player token. */
(function (root) {
  'use strict';
  const KEYS = ['lumi-garden-v3', 'lumi.ranking.identity.v1', 'lumi.ranking.journal.v1'];
  const VERSION = 1, ITERATIONS = 250000, MAX_BYTES = 2 * 1024 * 1024;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const encode = bytes => btoa(String.fromCharCode(...bytes));
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  function available() {
    if (!root.crypto?.subtle || !root.crypto.getRandomValues || !root.localStorage) throw Error('HTTPS 및 브라우저 저장 기능이 필요해요.');
  }
  async function key(password,salt) {
    if (typeof password !== 'string' || password.length < 12) throw Error('12자 이상 복구 암호를 입력해 주세요.');
    const material = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  function identityFrom(values) {
    let identity;
    try {
      const journal=JSON.parse(values['lumi.ranking.journal.v1']||'null');
      identity=journal?.identity || JSON.parse(values['lumi.ranking.identity.v1']||'null');
      if (journal?.identity?.player?.id && identity?.player?.id !== journal.identity.player.id) throw Error('계정 정보가 일치하지 않아요.');
    } catch { throw Error('백업 파일의 랭킹 정보가 올바르지 않아요.'); }
    if (!identity || !/^[A-Za-z0-9_-]{43}$/.test(identity.token||'') || typeof identity.player?.id !== 'string') throw Error('유효한 랭킹 계정이 없어 백업할 수 없어요.');
    return identity;
  }
  async function create(password) {
    available();
    const values=Object.fromEntries(KEYS.map(k=>[k,root.localStorage.getItem(k)]));
    const identity=identityFrom(values);
    if (!values['lumi-garden-v3']) throw Error('저장된 정원 진행 기록을 찾을 수 없어요.');
    const body=encoder.encode(JSON.stringify({version:VERSION,values}));
    if (body.length > MAX_BYTES) throw Error('백업 데이터가 너무 커요.');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt),body);
    const envelope={format:'chaesopang-encrypted-backup',version:VERSION,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(cipher))};
    const blob=new Blob([JSON.stringify(envelope)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='chaesopang-recovery-'+new Date().toISOString().slice(0,10)+'.json';a.style.display='none';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
    return {playerId:identity.player.id};
  }
  async function restore(file,password,baseUrl) {
    available();
    if (!file || file.size > MAX_BYTES * 2) throw Error('백업 파일 크기를 확인해 주세요.');
    let packet;
    try { packet=JSON.parse(await file.text()); }
    catch { throw Error('올바른 백업 파일이 아니에요.'); }
    if(packet?.format!=='chaesopang-encrypted-backup'||packet.version!==VERSION||packet.iterations!==ITERATIONS||packet.kdf!=='PBKDF2-SHA256') throw Error('지원하지 않는 백업 형식이에요.');
    let values;
    try {
      const salt=decode(packet.salt),iv=decode(packet.iv),data=decode(packet.data);
      if(salt.length!==16||iv.length!==12||data.length>MAX_BYTES+32) throw Error('format');
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(password,salt),data);
      const record=JSON.parse(decoder.decode(plaintext));
      if(record.version!==VERSION||!record.values||typeof record.values!=='object'||Object.keys(record.values).some(k=>!KEYS.includes(k))) throw Error('format');
      values=record.values;
    }catch(error) {
      if (error.message?.includes('12자')) throw error;
      throw Error('암호가 다르거나 백업 파일이 손상됐어요.');
    }
    if(!KEYS.every(k=>typeof values[k]==='string'||values[k]===null)) throw Error('백업 데이터 형식이 잘못됐어요.');
    const identity=identityFrom(values);
    if (!values['lumi-garden-v3']) throw Error('진행 기록이 없는 백업이에요.');
    const url=new URL(baseUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw Error('안전한 서버 주소를 확인해 주세요.');
    // Validate actual ownership before touching current local progress.
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch(url.href.replace(/\/$/,'')+'/me',{headers:{Authorization:'Bearer '+identity.token,Accept:'application/json'},signal:controller.signal,cache:'no-store',credentials:'omit'});
      if(!response.ok) throw Error('서버에서 복구 계정을 인증하지 못했어요.');
      const profile=await response.json();
      if(profile.player?.id!==identity.player.id) throw Error('백업 계정의 소유자가 일치하지 않아요.');
    } catch(error) { throw Error(error.name==='AbortError'?'서버 연결 시간이 초과됐어요. 데이터는 변경하지 않았어요.':error.message); }
    finally {clearTimeout(timeout);}
    const before=Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]));
    try {
      for(const k of KEYS) {if(values[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,values[k]);}
    }catch(error) {
      for(const k of KEYS){try{if(before[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,before[k]);}catch{}}
      throw Error('기기 저장 공간이 부족해 복원하지 못했어요.');
    }
    return {playerId:identity.player.id};
  }
  root.LumiAccountBackup=Object.freeze({create,restore});
  if (typeof module==='object'&&module.exports) module.exports={create,restore};
})(typeof globalThis!=='undefined'?globalThis:this);
