'use strict';
(()=>{
 const params=new URLSearchParams(location.search),lesson=Number(params.get('bai'));
 if(params.get('lms')!=='1'||window.parent===window||lesson<1||lesson>18)return;
 const byId=id=>document.getElementById(id),owner=params.get('student')||'';
 const key='ntc-hsk3-pending:'+owner+':'+lesson;
 let context=null,busy=false,restoring=false,restored='',packet=null;
 const panel=document.createElement('section');panel.style.cssText='margin:12px 0;padding:10px 14px;border:1px solid #e8d3ce;border-radius:12px;background:#fff8f7';
 const status=document.createElement('p'),retry=document.createElement('button'),returned=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
 status.setAttribute('role','status');status.style.margin='0';retry.type='button';retry.textContent='Gửi lại toàn bài';retry.hidden=true;summary.textContent='Giáo viên sửa và trả bài';returned.append(summary,body);returned.hidden=true;panel.append(status,retry,returned);byId('quiz').before(panel);
 const post=(type,more={})=>parent.postMessage({type,level:3,lesson,...more},location.origin);
 const locked=()=>!!context?.row&&context.row.status!=='revision_required';
 function controls(){
  byId('submitBtn').disabled=busy||!context||locked()||submitted;
  retry.hidden=!submitted||locked()||!context?.assigned;
  retry.disabled=busy||!context?.canSend;
 }
 function snapshot(result){
  const values={};for(let n=1;n<=30;n++)values[n]=String(answers[n]??answerFor(n));
  const questions=Array.from({length:30},(_,i)=>{const n=i+1,box=quiz.querySelector('[data-q="'+n+'"]');return {n,prompt:(box?.textContent||'').replace(/\s+/g,' ').trim().slice(0,2000),answer:values[n],reference:String(current.key[n]??''),explanation:String(current.ex[n]||''),manual:n>=28,correct:n>=28?null:norm(values[n])===norm(current.key[n]),...(n>=28&&box?.querySelector('img')?{image:box.querySelector('img').getAttribute('src')}:{} )};});
  return {version:1,level:3,lesson,title:current.title,correct:result.correct,total:27,questions,draft:{answers:values,fills:{...fills},timeLeft,submitted:true},hsk3Review:result.hsk3Review};
 }
 function send(){
  if(!packet||busy||locked()||!context?.canSend)return;
  busy=true;status.textContent='Đang gửi toàn bài · Câu 28–30 chờ giáo viên chấm…';controls();post('ntcHsk46Submit',{payload:packet});
 }
 window.NTCHSK3Capture=function(result){
  if(restoring)return;
  packet=snapshot(result);try{localStorage.setItem(key,JSON.stringify(packet));}catch{}
  if(context?.assigned){if(context.canSend)send();else status.textContent=context.message+' Bài làm đang được giữ trên thiết bị.';}
  else {status.textContent='Đã tự chấm 27 câu. Giáo viên chưa giao bài này cho lớp.';post('ntcHsk46Practice',{payload:packet});}
  const note=byId('resultBox').lastElementChild;if(note&&context?.assigned)note.textContent='Câu 28–30 gửi giáo viên chấm, không tự tính sai.';controls();
 };
 const oldSubmit=submitQuiz;
 submitQuiz=function(auto){if(!context||busy||locked()){controls();return;}oldSubmit(auto);controls();};
 const oldOpen=openLesson;
 openLesson=function(n){if(Number(n)!==lesson){if(!busy)post('ntcHsk46Navigate',{lesson:Number(n)});return;}return oldOpen(n);};
 quiz.addEventListener('click',event=>{if((!context||busy||locked())&&event.target.closest('input,textarea,select,[data-word],[data-blank]')){event.preventDefault();event.stopImmediatePropagation();}},true);
 quiz.addEventListener('beforeinput',event=>{if(!context||busy||locked())event.preventDefault();},true);
 function fillDraft(d){
  fills={...(d.fills||{})};
  for(let n=1;n<=30;n++)for(const input of quiz.querySelectorAll('[name="q'+n+'"]')){if(input.type==='radio')input.checked=input.value===String(d.answers?.[n]??'');else input.value=String(d.answers?.[n]??'');}
  for(const blank of quiz.querySelectorAll('[data-blank]')){const n=blank.dataset.blank,v=fills[n];const word=[...quiz.querySelectorAll('[data-word]')].find(x=>x.dataset.word===v);blank.textContent=word?.dataset.text||'Nhấp để chọn';blank.classList.toggle('filled',!!word);}
  updateProgress();
 }
 function showReturn(row){
  body.replaceChildren();returned.hidden=!row?.hsk46_return||row.status==='pending';if(returned.hidden)return;
  const t=row.hsk46_return;let markup;try{markup=parent.NTCWritingMarkup;}catch{}
  for(const q of t.questions||[]){const title=document.createElement('h4');title.textContent='Câu '+q.n;const text=markup?markup.render(document,q.correction,q.marks):document.createElement('p');if(!markup)text.textContent=q.correction||'';body.append(title,text);}
  const note=document.createElement('p');note.style.whiteSpace='pre-wrap';note.textContent=[t.correction,row.teacher_feedback].filter(Boolean).join('\n');body.append(note);
 }
 function apply(){
  if(!context||current?.n!==lesson)return;
  const row=context.row,signature=row?row.id+':'+row.status:'practice';
  if(restored!==signature){
   let saved=row?.hsk46_payload;
   if(!saved&&!row){try{const candidate=JSON.parse(localStorage.getItem(key)||'null');if(candidate?.level===3&&candidate.lesson===lesson&&candidate.questions?.length===30)saved=candidate;}catch{}}
   if(saved?.draft){
    quiz.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);fillDraft(saved.draft);restoring=true;
    try{if(row?.status==='revision_required'){submitted=false;quiz.classList.remove('locked');quiz.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);startTimer();byId('resultBox').classList.remove('show');byId('reviewBtn').classList.add('hidden');packet=null;}
     else {submitted=false;oldSubmit(true);packet=saved;}}
    finally{restoring=false;}
   }
   restored=signature;
  }
  if(row){try{localStorage.removeItem(key);}catch{};status.textContent=row.status==='pending'?'✓ Đã nộp toàn bài · Câu 28–30 chờ giáo viên chấm.':row.status==='revision_required'?'Giáo viên yêu cầu làm lại. Chỉnh bài rồi nộp lại toàn bài.':'✓ Giáo viên đã trả bài. Xem bản sửa bên dưới.';}
  else if(!busy)status.textContent=context.message||'Có thể bắt đầu làm bài.';
  showReturn(row);controls();
 }
 window.addEventListener('message',event=>{
  const m=event.data;if(event.origin!==location.origin||event.source!==parent||m?.type!=='ntcHsk46Context'||m.level!==3||Number(m.lesson)!==lesson)return;
  context=m;busy=false;if(m.error)status.textContent=m.error;apply();if(m.error)status.textContent=m.error;
 });
 retry.onclick=send;
 const observer=new MutationObserver(()=>{if(current?.n===lesson&&restored==='')apply();controls();});observer.observe(quiz,{childList:true,subtree:true});
 const timer=setInterval(()=>{if(!context)post('ntcHsk46Ready');else if(current?.n===lesson&&restored==='')apply();},1000);
 window.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();},{once:true});post('ntcHsk46Ready');controls();
})();
