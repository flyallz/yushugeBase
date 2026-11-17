'use strict';
(()=>{
 const frame=()=>document.getElementById('contentFrame');
 window.addEventListener('message',async event=>{
  const m=event.data||{},f=frame();
  if(m.type!=='vocabulary-progress-request'||!f||event.source!==f.contentWindow||event.origin!==location.origin||!currentUser||isTeacher)return;
  if(typeof m.request_id!=='string'||m.request_id.length>100||m.student_id!==currentUser.authId)return;
  const owner=currentUser.authId,url=f.src,path=new URL(url,location.href),p=m.params||{};
  if(!path.pathname.endsWith('/game-center/index.html')&&!path.pathname.endsWith('/game-center/games/hsk-vocabulary/index.html'))return;
  try{
   const names={list:'ntc_list_vocabulary_progress',load:'ntc_load_vocabulary_progress',save:'ntc_save_vocabulary_progress'};
   if(!Object.hasOwn(names,m.operation))throw Error('Yêu cầu lưu tiến độ không hợp lệ.');
   let args={};
   if(m.operation!=='list'){
    if(!['race','head'].includes(p.mode)||!Number.isInteger(p.level)||p.level<1||p.level>6||typeof p.unit_key!=='string'||p.unit_key.length>30||!['easy','medium','hard'].includes(p.difficulty))throw Error('Bài chơi không hợp lệ.');
    const ctx=window.ntcGetAssignedContext?.(),assigned=path.searchParams.has('assignment');
    if(assigned&&(!ctx||ctx.owner_id!==owner||ctx.run_id!==p.run_id||ctx.mode!==p.mode||ctx.level!==p.level||ctx.unit_key!==p.unit_key||ctx.difficulty!==p.difficulty))throw Error('Lượt chơi không khớp bài được giao.');
    if(!assigned&&p.run_id)throw Error('Không được chuyển lượt chơi sang bài khác.');
    args={p_mode:p.mode,p_level:p.level,p_unit:p.unit_key,p_difficulty:p.difficulty,p_run:p.run_id||null};
    if(m.operation==='save')Object.assign(args,{p_snapshot:p.snapshot,p_expected_revision:p.revision});
   }
   const result=await sb.rpc(names[m.operation],args);if(result.error)throw result.error;
   if(owner!==currentUser?.authId||url!==f.src)return;
   f.contentWindow.postMessage({type:'vocabulary-progress-response',request_id:m.request_id,student_id:owner,data:result.data},location.origin);
  }catch(e){if(owner===currentUser?.authId&&url===f.src)f.contentWindow.postMessage({type:'vocabulary-progress-response',request_id:m.request_id,student_id:owner,error:e.message||String(e)},location.origin);}
 });
})();
