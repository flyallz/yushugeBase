(function(){
 'use strict';
 const $=id=>document.getElementById(id),isHsk=c=>/^hsk5-sbt\d+$/.test(c?.id||'');
 let busy=false,navVersion=0;
 const originalOpen=openCourse,originalHome=goHome;
 openCourse=async function(...args){if(busy){alert('Đang gửi bài, hãy chờ xác nhận trước khi chuyển trang.');return;}return originalOpen(...args);};
 goHome=async function(...args){if(busy){alert('Đang gửi bài, hãy chờ xác nhận trước khi chuyển trang.');return;}return originalHome(...args);};
 function current(){return COURSES.find(c=>($('contentFrame').getAttribute('src')||'').split('&student=')[0]===c.file);}
 function sync(error=''){
  const c=current();if(!isHsk(c))return;
  const matched=activeHomeworkCourse?.id===c.id;
  if(!matched&&!isTeacher)return;
  const row=matched?latestWorkbookSubmission():null,assigned=matched&&!!activeHomeworkWindow;
  const access=assigned?homeworkWindowState(activeHomeworkWindow,activeHomeworkOverride):null;
  $('contentFrame').contentWindow.postMessage({type:'ntcHsk5Context',assigned:!!assigned,row:row||null,canSend:!isTeacher&&assigned&&access?.key==='open'&&(!row||row.status==='revision_required'),message:isTeacher?'Chế độ xem của giáo viên.':!assigned?'Chưa có lịch giao bài này cho lớp. Bạn có thể tự luyện.':access?.key!=='open'?'Chưa đến giờ mở, hết hạn hoặc giáo viên đã đóng bài.':'Câu 1–31 tự chấm; câu 32 gửi giáo viên. Sau khi gửi thành công bài được khóa.',error},location.origin);
 }
 window.NTCHSK5={sync};
 const oldLoad=loadLessonHomework;
 loadLessonHomework=async function(c){const v=++navVersion;await oldLoad(c);if(v===navVersion&&isHsk(c))sync();};
 // Group the vertical menu by HSK level while preserving existing workbook locks.
 const oldNav=renderCourseNav;
 renderCourseNav=function(){oldNav();const nav=$('courseNav'),levels=new Map();for(const toggle of [...nav.querySelectorAll(':scope > .sidebar-group-toggle')]){
  const m=toggle.textContent.match(/HSK([1-5])/);if(!m)continue;const level=m[1],children=toggle.nextElementSibling;
  let host=levels.get(level);if(!host){const head=document.createElement('button');head.className='sidebar-group-toggle';head.innerHTML='<div class="icon">📚</div> HSK'+level+' <span class="arrow">▶</span>';head.onclick=()=>toggleGroup(head);host=document.createElement('div');host.className='sidebar-group-children';nav.insertBefore(head,toggle);nav.insertBefore(host,toggle);levels.set(level,host);}
  toggle.style.paddingLeft='25px';toggle.childNodes.forEach(n=>{if(n.nodeType===3)n.textContent=n.textContent.replace(/HSK[1-5]/,'');});host.append(toggle,children);
 }};
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==$('contentFrame')?.contentWindow)return;
  const c=current();if(!isHsk(c))return;
  if(e.data?.type==='ntcHsk5Navigate'){
   if(busy){alert('Đang gửi bài. Hãy chờ kết quả trước khi chuyển bài.');return;}
   const n=Number(e.data.lesson);if(Number.isInteger(n)&&n>=1&&n<=36)await openCourse('hsk5-sbt'+n);return;
  }
  if(e.data?.type==='ntcHsk5Ready'){sync();return;}
  if(e.data?.type!=='ntcHsk5Submit'||busy||isTeacher||!currentUser)return;
  if(Number(e.data.lesson)!==Number(c.id.slice(8)))return;
  const p=e.data.payload;
  if(!p||p.lesson!==Number(e.data.lesson)||!Array.isArray(p.questions)||p.questions.length!==32||typeof p.essay!=='string'||p.essay.length>20000){sync('Nội dung bài gửi không hợp lệ.');return;}
  const win=activeHomeworkWindow;
  if(activeHomeworkCourse?.id!==c.id||!win){sync('Chưa tải được lịch giao bài. Hãy mở lại bài.');return;}
  if(latestWorkbookSubmission()?.status!=='revision_required'&&latestWorkbookSubmission()){sync();return;}
  busy=true;let uploaded='';
  try{
   if(homeworkWindowState(win,activeHomeworkOverride).key!=='open')throw Error('Bài không còn trong thời gian nhận.');
   // Recover an uncertain previous response before uploading another attempt.
   const check=await sb.from('homework_submissions').select('*').eq('window_id',win.id).eq('user_id',currentUser.authId).eq('part_key','full').order('attempt_number',{ascending:false});
   if(check.error)throw check.error;
   if(check.data?.length&&check.data[0].status!=='revision_required'){activeHomeworkSubmissions=check.data;sync();return;}
   const attempt=Math.max(0,...(check.data||[]).map(r=>Number(r.attempt_number)||0))+1;
   const file=await createWorkbookResultFile(c,p,p.correct,31,p.correct/31*100);
   uploaded=`${currentUser.authId}/${win.id}/${crypto.randomUUID()}-${file.name}`;
   const up=await sb.storage.from('student-homework').upload(uploaded,file,{upsert:false,contentType:'image/png'});if(up.error)throw up.error;
   const res=await sb.from('homework_submissions').insert({window_id:win.id,user_id:currentUser.authId,submission_kind:'writing',part_key:'full',attempt_number:attempt,status:'pending',storage_path:uploaded,original_file_name:file.name,mime_type:'image/png',file_size_bytes:file.size,workbook_payload:p}).select('*').single();
   if(res.error){
    // Do not delete an uploaded object if the insert committed but its reply was lost.
    const recover=await sb.from('homework_submissions').select('*').eq('window_id',win.id).eq('user_id',currentUser.authId).eq('storage_path',uploaded).maybeSingle();
    if(recover.error)throw Error('Chưa xác minh được lần gửi. Hãy thử lại khi có mạng; hệ thống sẽ kiểm tra trước khi gửi.');
    if(!recover.data){await sb.storage.from('student-homework').remove([uploaded]);uploaded='';throw res.error;}
    res.data=recover.data;
   }
   activeHomeworkSubmissions=[res.data,...activeHomeworkSubmissions];sync();renderLessonHomeworkPanel();
   window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:$('contentFrame').contentWindow,data:{type:'learningResult',payload:{correct:p.correct,total:31,score:p.correct/31*100,exerciseName:'Sách BT HSK5 · '+c.title}}}));
   try{await recordHomeworkAchievement(win,'writing','full');await loadHomeworkPendingBadge();}catch(err){console.warn('HSK5 badge sync:',err.message);}
  }catch(err){sync('Không gửi được bài: '+(err.message||String(err)));}
  finally{busy=false;}
 });
 function essayPanel(row){
  const p=row.workbook_payload,box=document.createElement('section');box.className='ntc-section';box.innerHTML='<h3>HSK5 · Câu 32</h3><details><summary>Bản gốc và đề bài</summary><div class="ntc-feedback" style="white-space:pre-wrap"></div></details><label>Điểm (0–10)<input type="number" min="0" max="10" step="0.5" id="hsk5Score-'+row.id+'"></label><label>Bản giáo viên sửa<textarea id="hsk5Correction-'+row.id+'" rows="5"></textarea></label>';
  box.querySelector('.ntc-feedback').textContent=(p.questions[31]?.prompt||'')+'\nTừ yêu cầu: '+(p.questions[31]?.words||[]).join('、')+'\n\n'+(p.essay||'(Chưa viết)');box.querySelector('input').value=row.teacher_return?.essay_score??'';box.querySelector('textarea').value=row.teacher_return?.correction??p.essay??'';
  window.NTCWritingMarkup?.mount(box.querySelector('textarea'),p.essay||'',row.teacher_return?.marks);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Xem đủ 31 câu tự chấm';details.append(summary);
  for(const q of p.questions.filter(q=>q.n<=31)){const item=document.createElement('p');item.textContent=q.n+'. '+q.prompt+'\nBài làm: '+(q.answer||'(Trống)')+'\nĐáp án: '+q.reference;item.style.whiteSpace='pre-wrap';details.append(item);}box.append(details);return box;
 }
 const oldGradeRender=renderHomeworkGrading;
 renderHomeworkGrading=async function(...args){await oldGradeRender(...args);for(const [id,row] of homeworkGradingRows){if(!row.workbook_payload)continue;const card=$('gradeCard-'+id);if(card&&!card.querySelector('[id^=hsk5Score]'))card.querySelector('.homework-grid')?.before(essayPanel(row));}};
 const oldGrade=gradeHomeworkSubmission;
 gradeHomeworkSubmission=async function(id,revision){
  const row=homeworkGradingRows.get(id);if(!row?.workbook_payload)return oldGrade(id,revision);
  const card=$('gradeCard-'+id),buttons=[...card.querySelectorAll('button')];if(card.dataset.saving==='1')return;
  try{
   const reviewed=window.NTCWritingMarkup?.read($('hsk5Correction-'+id)),score=$('hsk5Score-'+id).value,correction=reviewed?.text??$('hsk5Correction-'+id).value.trim(),feedback=$('homeworkFeedback-'+id).value.trim();
   if(!revision&&(score===''||!Number.isFinite(+score)||+score<0||+score>10||!correction))throw Error('Hãy nhập điểm câu 32 (0–10) và bản sửa/bài tham khảo trước khi trả bài.');
   if(!feedback&&!correction)throw Error('Hãy nhập nhận xét hoặc bản sửa.');
   card.dataset.saving='1';buttons.forEach(b=>b.disabled=true);
   let audio={},uploaded='';const blob=teacherFeedbackBlobs.get(id);
   if(blob){uploaded=`teacher-feedback/${row.user_id}/${id}/${crypto.randomUUID()}-nhan-xet.${blob.type.includes('mp4')?'m4a':'webm'}`;const up=await sb.storage.from('student-homework').upload(uploaded,blob,{upsert:false,contentType:blob.type});if(up.error)throw up.error;audio={teacher_audio_path:uploaded,teacher_audio_mime_type:blob.type,teacher_audio_size_bytes:blob.size};}
   const out=await sb.from('homework_submissions').update({status:revision?'revision_required':'graded',teacher_rating:revision?'Cần làm lại':$('homeworkRating-'+id).value,teacher_feedback:feedback,teacher_return:{version:1,essay_score:score===''?null:+score,correction,...(reviewed?.marks?{marks:reviewed.marks}:{})},graded_at:new Date().toISOString(),graded_by:currentUser.authId,student_viewed_at:null,purge_after:null,...audio}).eq('id',id).select('id').single();
   if(out.error)throw out.error;
   teacherFeedbackBlobs.delete(id);await loadHomeworkPendingBadge();await renderHomeworkGrading(homeworkProfilesCache);
  }catch(err){alert('Không trả được bài: '+err.message);}finally{card.dataset.saving='0';buttons.forEach(b=>b.disabled=false);}
 };
 function download(row){
  const p=row.workbook_payload,t=row.teacher_return||{},esc=escapeHtml;
  const html='<!doctype html><html lang="vi"><meta charset="utf-8"><title>HSK5 · Phiếu trả bài</title><style>body{max-width:900px;margin:32px auto;padding:20px;font:18px/1.7 system-ui;color:#332b2d}h1,h2{color:#a95369}article{padding:12px;border-bottom:1px solid #ddd}pre{font:inherit;white-space:pre-wrap}.ok{color:#207342}.bad{color:#b52b40}</style><h1>NGỌC THƯ CÁC · HSK5 — Bài '+esc(p.lesson)+'</h1><p>Câu 1–31: '+esc(p.correct)+'/31 · Câu 32: '+esc(t.essay_score??'Chưa cho điểm')+'/10</p>'+p.questions.filter(q=>q.n<=31).map(q=>'<article><b>'+esc(q.n)+'. '+esc(q.prompt)+'</b><p class="'+(q.correct?'ok':'bad')+'">Bài làm: '+esc(q.answer||'(Chưa làm)')+'</p><p>Đáp án: '+esc(q.reference)+'</p><p>'+esc(q.explanation||'')+'</p></article>').join('')+'<h2>Câu 32 — Bài viết gốc</h2><p>'+esc((p.questions[31]?.words||[]).join('、'))+'</p><pre>'+esc(p.essay)+'</pre><h2>Giáo viên sửa / Bài tham khảo</h2><pre>'+(window.NTCWritingMarkup?window.NTCWritingMarkup.html(t.correction,t.marks):esc(t.correction||''))+'</pre><h2>Nhận xét</h2><pre>'+esc(row.teacher_feedback||'')+'</pre></html>';
  const url=URL.createObjectURL(new Blob(['\ufeff'+html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='HSK5_Bai_'+p.lesson+'_Dap_An_Va_Nhan_Xet.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 // The student view creates details lazily; decorate after those DOM updates.
 const observer=new MutationObserver(()=>{for(const row of activeRows()){if(!row.workbook_payload||!row.teacher_return||row.status==='pending')continue;
  for(const anchor of [...document.querySelectorAll('[data-hsk5-return="'+row.id+'"]')]){if(anchor.querySelector('[data-hsk5-download]'))continue;const heading=document.createElement('b');heading.textContent='Giáo viên sửa';anchor.append(heading,window.NTCWritingMarkup?window.NTCWritingMarkup.render(document,row.teacher_return.correction,row.teacher_return.marks):document.createTextNode(row.teacher_return.correction||''));const b=document.createElement('button');b.type='button';b.className='homework-btn secondary';b.dataset.hsk5Download='1';b.textContent='↓ Tải đáp án và bài sửa câu 32';b.onclick=()=>download(row);anchor.append(b);}
 }});observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 function activeRows(){return [...(window.NTCHomeworkUI?.state?.rows||[]),...activeHomeworkSubmissions];}
 window.NTCHSK5.download=download;
})();
