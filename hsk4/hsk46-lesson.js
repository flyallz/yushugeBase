/* LMS adapter: the original questions, answer keys and graders remain in each book. */
(function(){
 'use strict';
 if(new URLSearchParams(location.search).get('lms')!=='1')return;
 const level=Number(document.currentScript.dataset.level),lesson=Number(document.currentScript.dataset.lesson);
 const byId=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
 const controlsIds=level===4?['submit']:['submitTop','submitBottom'];
 let context=null,busy=false,restored='',practiceSent=false;
 const panel=document.createElement('section');panel.className='ntc-lms-status';
 panel.style.cssText='margin:14px 0;padding:16px;border:1px solid #dab0bd;border-radius:12px;background:#fff7fa;font:16px/1.6 system-ui';
 const note=document.createElement('p');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 const resend=document.createElement('button');resend.type='button';resend.className='primary';resend.textContent='Gửi lại kết quả cho giáo viên';resend.hidden=true;
 const returned=document.createElement('div');panel.append(note,resend,returned);
 byId('exercise').before(panel);
 const post=(type,more={})=>parent.postMessage({type,level,lesson,...more},location.origin);
 function snapshot(){
  const questions=level===4?DATA.questions.map(q=>({n:q.n,prompt:q.prompt||'',answer:response(q),reference:q.kind==='free'?(q.answerText||q.accepted?.join(' / ')||''):answerLabel(q),correct:q.kind==='free'?null:correct(q),explanation:q.explanation||'',manual:q.kind==='free'})):
   DATA.questions.map(q=>({n:q.id,prompt:q.prompt||'',answer:state.answers[q.id]===undefined?'':q.options[state.answers[q.id]],reference:q.options[q.correct],correct:state.answers[q.id]===q.correct,explanation:q.explanation||'',manual:false}));
  if(level===6&&DATA.writing)questions.push({n:37,prompt:'缩写 · '+(state.writingTitle||'Chưa đặt tiêu đề'),answer:state.writing||'',reference:DATA.writing.at(-1)||'',correct:null,manual:true});
  const auto=questions.filter(q=>!q.manual),draft=clone(state);
  return {version:1,level,lesson,title:document.querySelector('h1')?.textContent||'Bài '+lesson,correct:auto.filter(q=>q.correct).length,total:auto.length,questions,draft,materials:{passages:DATA.passages||{},shared:DATA.shared||[],writing:DATA.writing||[]}};
 }
 function locked(){return !!context?.row&&context.row.status!=='revision_required';}
 function controls(){
  for(const id of controlsIds){const b=byId(id);if(b)b.disabled=busy||!context||locked();}
  byId('retry').disabled=busy||!context||locked();
  resend.hidden=!state.submitted||locked()||!context?.assigned;
  resend.disabled=busy||!context?.canSend;
  if(locked())note.textContent=context.row.status==='pending'?'✓ Đã nộp toàn bài — Chờ giáo viên chấm. Bài đã khóa.':'✓ Đã trả bài. Xem bản sửa bên dưới hoặc trong Bài tập của tôi.';
 }
 function send(){
  if(busy||locked()||!context?.canSend||!state.submitted)return;
  busy=true;note.textContent='Đang gửi toàn bộ bài cho giáo viên…';controls();post('ntcHsk46Submit',{payload:snapshot()});
 }
 const originalSubmit=submit;
 submit=function(auto=false){
  if(!context){note.textContent='Đang tải trạng thái nhận bài. Vui lòng chờ.';return;}
  if(busy||locked())return;
  originalSubmit(auto);
  if(state.submitted){
   if(context.assigned){if(context.canSend)send();else note.textContent=context.message+' Kết quả vẫn được giữ trên thiết bị.';}
   else {note.textContent='Đã tự chấm trên thiết bị. Giáo viên chưa giao bài này cho lớp.';if(!practiceSent){practiceSent=true;post('ntcHsk46Practice',{payload:snapshot()});}}
  }
  controls();
 };
 const originalRetry=byId('retry').onclick;
 byId('retry').onclick=()=>{if(!context||busy||locked())return;originalRetry();practiceSent=false;controls();};
 resend.onclick=send;
 const originalClock=level===4?paintClock:tick;
 if(level===4)paintClock=function(){originalClock();controls();};
 else tick=function(){originalClock();controls();};
 // Prevent edits while server state is loading, including answers restored on another device.
 byId('exercise').addEventListener('click',e=>{if(!context||busy||locked()){if(e.target.closest('input,textarea,[data-token],[data-choice],.token')){e.preventDefault();e.stopImmediatePropagation();}}},true);
 function restore(row){
  const signature=row.id+':'+row.status;
  if(restored===signature)return;
  const d=row.hsk46_payload?.draft;
  if(d&&(row.status!=='revision_required'||state.ntcSource!==signature)){
   const candidate=clone(d);
   if(level===4&&!valid(candidate))throw Error('Bản lưu HSK4 không hợp lệ.');
   if(level===6&&(!candidate.orders||!candidate.answers||!DATA.questions.every(q=>Array.isArray(candidate.orders[q.id])&&candidate.orders[q.id].length===q.options.length)))throw Error('Bản lưu HSK6 không hợp lệ.');
   state=candidate;state.ntcSource=signature;
   if(row.status==='revision_required'){
    state.submitted=false;
    if(level===4){state.deadline=null;state.remaining=DURATION;delete state.submittedAt;}
    else {state.started=null;state.finished=null;state.auto=false;}
   }
  }
  if(locked())state.submitted=true;
  restored=signature;
  if(level===4){save();build();update();paintClock();}else {persist();render();}
 }
 function showReturn(row){
  returned.replaceChildren();const t=row?.hsk46_return;if(!t||row.status==='pending')return;
  const heading=document.createElement('h3');heading.textContent='Giáo viên sửa và trả bài';returned.append(heading);
  for(const q of t.questions||[]){const title=document.createElement('b');title.textContent='Câu '+q.n;let markup;try{markup=parent.parent.NTCWritingMarkup;}catch(e){}const text=markup?markup.render(document,q.correction,q.marks):document.createElement('p');if(!markup)text.textContent=q.correction||'';text.style.whiteSpace='pre-wrap';returned.append(title,text);}
  const text=document.createElement('p');text.style.whiteSpace='pre-wrap';text.textContent=[t.correction,row.teacher_feedback].filter(Boolean).join('\n');returned.append(text);
 }
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='ntcHsk46Context'||e.data.level!==level||e.data.lesson!==lesson)return;
  context=e.data;busy=false;
  try{if(context.row)restore(context.row);}catch(err){context.canSend=false;note.textContent=err.message;controls();return;}
  showReturn(context.row);
  if(context.error)note.textContent=context.error+' Bài vẫn được giữ; có thể nhấn gửi lại khi mạng ổn định.';
  else if(context.row?.status==='revision_required')note.textContent='Giáo viên yêu cầu làm lại. '+(context.row.teacher_feedback||'')+' '+(context.canSend?'Sửa bài rồi gửi lại.':context.message);
  else if(!locked())note.textContent=context.message||'';
  controls();
 });
 note.textContent='Đang tải trạng thái nhận bài…';controls();post('ntcHsk46Ready');
})();
