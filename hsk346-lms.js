/* HSK4/HSK6 additions; HSK5 keeps its own original submission and grading adapter. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=escapeHtml;
 const isBook=c=>/^(?:hsk3-sbt|hsk4-bt|hsk6-sbt)\d+$/.test(c?.id||'');
 const identity=c=>({level:c.id.startsWith('hsk3-')?3:c.id.startsWith('hsk4-')?4:6,lesson:Number(c.id.match(/\d+$/)[0])});
 let busy=false,navVersion=0;
 const current=()=>COURSES.find(c=>($('contentFrame').getAttribute('src')||'').split('&student=')[0]===c.file);
 const oldOpen=openCourse,oldHome=goHome;
 openCourse=async function(...args){if(busy){alert('Đang gửi bài, hãy chờ xác nhận trước khi chuyển trang.');return;}return oldOpen(...args);};
 goHome=async function(...args){if(busy){alert('Đang gửi bài, hãy chờ xác nhận trước khi chuyển trang.');return;}return oldHome(...args);};
 if(typeof openGameCenter==='function'){const oldGame=openGameCenter;openGameCenter=async function(...args){if(busy){alert('Đang gửi bài, hãy chờ xác nhận trước khi chuyển trang.');return;}return oldGame(...args);};}
 function sync(error=''){
  const c=current();if(!isBook(c))return;
  const matched=activeHomeworkCourse?.id===c.id;if(!matched&&!isTeacher)return;
  const row=matched?latestWorkbookSubmission():null,assigned=matched&&!!activeHomeworkWindow;
  const access=assigned?homeworkWindowState(activeHomeworkWindow,activeHomeworkOverride):null;
  $('contentFrame').contentWindow.postMessage({type:'ntcHsk46Context',...identity(c),assigned:!!assigned,row:row||null,
   canSend:!isTeacher&&assigned&&activeHomeworkWindow.allow_writing&&access?.key==='open'&&(!row||row.status==='revision_required'),
   message:isTeacher?'Chế độ xem của giáo viên.':!assigned?'Chưa có lịch giao bài này cho lớp. Bạn có thể tự luyện.':access?.key!=='open'?'Bài chưa mở, đã hết hạn hoặc bị đóng. Cần giáo viên mở/gia hạn để gửi.':!activeHomeworkWindow.allow_writing?'Giáo viên chưa mở phần nộp toàn bài.':'Nộp toàn bài; các câu viết gửi giáo viên chấm. Chỉ được nộp lại khi giáo viên trả làm lại.',error},location.origin);
 }
 const oldLoad=loadLessonHomework;
 loadLessonHomework=async function(c){const v=++navVersion;await oldLoad(c);if(v===navVersion&&isBook(c))sync();};
 const oldNav=renderCourseNav;
 renderCourseNav=function(){
  oldNav();const nav=$('courseNav');let host=null;
  for(const toggle of [...nav.querySelectorAll(':scope > .sidebar-group-toggle')]){
   if(!/Sách BT HSK6[上下]/.test(toggle.textContent))continue;
   const children=toggle.nextElementSibling;
   if(!host){const head=document.createElement('button');head.className='sidebar-group-toggle';head.innerHTML='<div class="icon">📔</div> HSK6 <span class="arrow">▶</span>';head.onclick=()=>toggleGroup(head);host=document.createElement('div');host.className='sidebar-group-children';nav.insertBefore(head,toggle);nav.insertBefore(host,toggle);}
   toggle.style.paddingLeft='25px';host.append(toggle,children);
  }
 };
 function result(c,p){window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:$('contentFrame').contentWindow,data:{type:'learningResult',payload:{correct:p.correct,total:p.total,score:p.correct/p.total*100,exerciseName:c.group+' · '+c.title,...(p.level===3&&p.hsk3Review?{hsk3Review:p.hsk3Review}:{})}}}));}
 function validPayload(c,p){
  const id=identity(c),count=id.level===3?30:id.level===4?50:id.lesson%4===0?37:36;
  return p?.version===1&&p.level===id.level&&p.lesson===id.lesson&&p.draft&&typeof p.draft==='object'&&Array.isArray(p.questions)&&p.questions.length===count&&p.questions.every((q,i)=>q.n===i+1&&typeof q.answer==='string')&&p.total===(id.level===3?27:id.level===4?48:36)&&Number.isInteger(p.correct)&&p.correct>=0&&p.correct<=p.total&&new TextEncoder().encode(JSON.stringify(p)).length<490000;
 }
 async function submitPayload(c,p){
  if(busy||isTeacher||!currentUser)return;
  if(!validPayload(c,p)){sync('Thiếu câu trả lời hoặc nội dung bài gửi không hợp lệ.');return;}
  const win=activeHomeworkWindow,userId=currentUser.authId;
  if(activeHomeworkCourse?.id!==c.id||!win){sync('Chưa tải được lịch giao bài. Hãy mở lại bài.');return;}
  busy=true;
  try{
   if(homeworkWindowState(win,activeHomeworkOverride).key!=='open'||!win.allow_writing)throw Error('Bài không còn trong thời gian nhận.');
   const check=await sb.from('homework_submissions').select('*').eq('window_id',win.id).eq('user_id',userId).eq('submission_kind','writing').eq('part_key','full').order('attempt_number',{ascending:false});
   if(check.error)throw check.error;
   if(check.data?.[0]&&check.data[0].status!=='revision_required'){
    const saved=check.data[0],known=activeHomeworkSubmissions.some(r=>r.id===saved.id);activeHomeworkSubmissions=check.data;sync();renderLessonHomeworkPanel();
    if(!known&&saved.hsk46_payload){result(c,saved.hsk46_payload);try{await recordHomeworkAchievement(win,'writing','full');await loadHomeworkPendingBadge();}catch(err){console.warn('HSK4/6 khôi phục thành tích:',err.message);}}
    return;
   }
   const attempt=Math.max(0,...(check.data||[]).map(r=>Number(r.attempt_number)||0))+1;
   const wrong=p.questions.filter(q=>q.correct===false).map(q=>({question_number:q.n}));
   const file=await createWorkbookResultFile(c,{...p,attemptReview:{wrong_answers:wrong}},p.correct,p.total,p.correct/p.total*100);
   const path=`${userId}/${win.id}/${crypto.randomUUID()}-${file.name}`;
   const upload=await sb.storage.from('student-homework').upload(path,file,{upsert:false,contentType:'image/png'});if(upload.error)throw upload.error;
   const inserted=await sb.from('homework_submissions').insert({window_id:win.id,user_id:userId,submission_kind:'writing',part_key:'full',attempt_number:attempt,status:'pending',storage_path:path,original_file_name:file.name,mime_type:'image/png',file_size_bytes:file.size,hsk46_payload:p}).select('*').single();
   if(inserted.error){
    const recover=await sb.from('homework_submissions').select('*').eq('window_id',win.id).eq('user_id',userId).eq('storage_path',path).maybeSingle();
    if(recover.error)throw Error('Chưa xác minh được lần gửi. Nhấn gửi lại khi mạng ổn định; hệ thống sẽ kiểm tra trước khi tạo lần mới.');
    if(!recover.data){await sb.storage.from('student-homework').remove([path]);throw inserted.error;}
    inserted.data=recover.data;
   }
   activeHomeworkSubmissions=[inserted.data,...activeHomeworkSubmissions];sync();renderLessonHomeworkPanel();result(c,p);
   try{await recordHomeworkAchievement(win,'writing','full');await loadHomeworkPendingBadge();}catch(err){console.warn('HSK4/6 đồng bộ thành tích:',err.message);}
  }catch(err){sync('Không gửi được bài: '+(err.message||String(err)));}
  finally{busy=false;}
 }
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==$('contentFrame')?.contentWindow)return;
  const c=current();if(!isBook(c))return;const id=identity(c),d=e.data;
  if(d?.level!==id.level||Number(d.lesson)!==id.lesson)return;
  if(d.type==='ntcHsk46Ready'){sync();return;}
  if(d.type==='ntcHsk46Navigate')return; // Navigation has a different lesson id; handled below.
  if(d.type==='ntcHsk46Submit')await submitPayload(c,d.payload);
  if(d.type==='ntcHsk46Practice'&&!isTeacher&&currentUser&&!activeHomeworkWindow&&validPayload(c,d.payload))result(c,d.payload);
 });
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==$('contentFrame')?.contentWindow||e.data?.type!=='ntcHsk46Navigate')return;
  const c=current();if(!isBook(c)||e.data.level!==identity(c).level)return;
  const n=Number(e.data.lesson);if(Number.isInteger(n)&&n>=1&&n<=(e.data.level===3?18:e.data.level===6?40:20))await openCourse((e.data.level===3?'hsk3-sbt':e.data.level===4?'hsk4-bt':'hsk6-sbt')+n);
 });
 function questionText(q){return q.n+'. '+(q.prompt||'')+'\nBài làm: '+(q.answer||'(Chưa làm)')+'\nĐáp án / Gợi ý: '+(q.reference||'')+(q.explanation?'\n'+q.explanation:'');}
 function gradingPanel(row){
  const p=row.hsk46_payload,t=row.hsk46_return||{},box=document.createElement('section');box.className='ntc-section';box.dataset.hsk46Grade='1';
  const title=document.createElement('h3');title.textContent='HSK'+p.level+' · Toàn bộ bài làm và phần giáo viên sửa';
  const score=document.createElement('p');score.textContent='Tự chấm: '+p.correct+'/'+p.total+' câu. Câu viết chấm riêng.';box.append(title,score);
  for(const q of p.questions.filter(q=>q.manual)){
   const h=document.createElement('h4'),original=document.createElement('p'),label=document.createElement('label'),textarea=document.createElement('textarea');
   h.textContent='Câu '+q.n+' · '+q.prompt;original.textContent=q.answer||'(Chưa viết)';original.style.whiteSpace='pre-wrap';
   const source=document.createElement('details'),sourceTitle=document.createElement('summary');sourceTitle.textContent='Bản gốc';source.append(sourceTitle,original);
   let picture=null;if(p.level===3&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(q.image||'')&&(q.image||'').length<220000){picture=document.createElement('img');picture.src=q.image;picture.alt='Đề câu '+q.n;picture.style.cssText='display:block;max-width:100%;max-height:220px;object-fit:contain;margin:8px 0';}
   label.textContent='Bản giáo viên sửa';textarea.rows=7;textarea.style.cssText='width:100%;font:18px/1.7 system-ui';textarea.dataset.hsk46Question=q.n;
   const saved=t.questions?.find(x=>x.n===q.n);textarea.value=saved?.correction??q.answer??'';label.append(textarea);box.append(h);if(picture)box.append(picture);box.append(source,label);
   window.NTCWritingMarkup?.mount(textarea,q.answer||'',saved?.marks);
  }
  const label=document.createElement('label'),textarea=document.createElement('textarea');label.textContent='Bản sửa / Hướng dẫn chung';textarea.rows=4;textarea.id='hsk46Correction-'+row.id;textarea.value=t.correction||'';textarea.style.width='100%';label.append(textarea);box.append(label);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Xem đủ '+p.questions.length+' câu và đáp án';details.append(summary);
  if(p.materials){const material=document.createElement('details'),s=document.createElement('summary'),text=document.createElement('pre');s.textContent='Bài đọc / Tư liệu gốc';text.style.cssText='white-space:pre-wrap;font:inherit';text.textContent=Object.values(p.materials.passages||{}).flat().join('\n')+'\n'+(p.materials.shared||[]).join('\n')+'\n'+(p.materials.writing||[]).join('\n');material.append(s,text);details.append(material);}
  for(const q of p.questions){const text=document.createElement('p');text.textContent=questionText(q);text.style.cssText='white-space:pre-wrap;border-bottom:1px solid #ead9de;padding:10px 0';details.append(text);}box.append(details);return box;
 }
 const oldGradeRender=renderHomeworkGrading;
 renderHomeworkGrading=async function(...args){await oldGradeRender(...args);for(const [id,row] of homeworkGradingRows){if(!row.hsk46_payload)continue;const card=$('gradeCard-'+id);if(card&&!card.querySelector('[data-hsk46-grade]'))card.querySelector('.homework-grid')?.before(gradingPanel(row));}};
 const oldGrade=gradeHomeworkSubmission;
 gradeHomeworkSubmission=async function(id,revision){
  const row=homeworkGradingRows.get(id);if(!row?.hsk46_payload)return oldGrade(id,revision);
  const card=$('gradeCard-'+id);if(!card||card.dataset.saving==='1')return;
  const buttons=[...card.querySelectorAll('button')];let audioPath='';
  try{
   const feedback=$('homeworkFeedback-'+id).value.trim(),correction=$('hsk46Correction-'+id).value.trim()||feedback;
   const questions=[...card.querySelectorAll('[data-hsk46-question]')].map(el=>{const reviewed=window.NTCWritingMarkup?.read(el);return {n:Number(el.dataset.hsk46Question),correction:reviewed?.text??el.value.trim(),...(reviewed?.marks?{marks:reviewed.marks}:{})};});
   if(!correction)throw Error('Nhập nhận xét hoặc hướng dẫn chung trước khi trả bài.');
   if(!revision&&questions.some(q=>!q.correction))throw Error('Nhập bản sửa hoặc hướng dẫn cho từng câu viết trước khi trả bài.');
   card.dataset.saving='1';buttons.forEach(b=>b.disabled=true);
   const returned={version:1,correction,questions};if(new TextEncoder().encode(JSON.stringify(returned)).length>240000)throw Error('Bản sửa quá dài. Hãy rút gọn nhận xét trước khi trả bài.');
   const payload={status:revision?'revision_required':'graded',teacher_rating:revision?'Cần làm lại':$('homeworkRating-'+id).value,teacher_feedback:feedback,hsk46_return:returned,graded_at:new Date().toISOString(),graded_by:currentUser.authId,student_viewed_at:null,purge_after:null};
   const blob=teacherFeedbackBlobs.get(id);
   if(blob){audioPath=`teacher-feedback/${row.user_id}/${id}/${crypto.randomUUID()}-nhan-xet.${blob.type.includes('mp4')?'m4a':'webm'}`;const upload=await sb.storage.from('student-homework').upload(audioPath,blob,{upsert:false,contentType:blob.type});if(upload.error)throw upload.error;Object.assign(payload,{teacher_audio_path:audioPath,teacher_audio_mime_type:blob.type,teacher_audio_size_bytes:blob.size});}
   const out=await sb.from('homework_submissions').update(payload).eq('id',id).select('*').single();
   if(out.error){
    const check=await sb.from('homework_submissions').select('*').eq('id',id).maybeSingle();
    if(check.error)throw Error('Chưa xác minh được thao tác trả bài. Hãy tải lại danh sách trước khi thử tiếp.');
    if(!check.data||new Date(check.data.graded_at).getTime()!==new Date(payload.graded_at).getTime()||check.data.status!==payload.status){if(audioPath)await sb.storage.from('student-homework').remove([audioPath]);throw out.error;}
   }
   teacherFeedbackBlobs.delete(id);await loadHomeworkPendingBadge();await renderHomeworkGrading(homeworkProfilesCache);
  }catch(err){alert('Không trả được bài: '+err.message);}
  finally{card.dataset.saving='0';buttons.forEach(b=>b.disabled=false);}
 };
 function sheet(row){
  const p=row.hsk46_payload,t=row.hsk46_return||{};
  return '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Phiếu bài HSK'+p.level+'</title><style>body{max-width:900px;margin:30px auto;padding:20px;font:18px/1.7 system-ui;color:#493a36}h1,h2{color:#a34d66}article{padding:12px;border-bottom:1px solid #ead9de}pre{font:inherit;white-space:pre-wrap}.ok{color:#207342}.bad{color:#b52b40}</style><h1>NGỌC THƯ CÁC · HSK'+p.level+' · Bài '+p.lesson+'</h1><p>Tự chấm: '+p.correct+'/'+p.total+' · '+esc(row.teacher_rating||'Chờ chấm')+'</p>'+p.questions.map(q=>'<article><pre class="'+(q.correct===true?'ok':q.correct===false?'bad':'')+'">'+esc(questionText(q))+'</pre>'+((t.questions||[]).find(x=>x.n===q.n)?'<b>Giáo viên sửa:</b><pre>'+(window.NTCWritingMarkup?window.NTCWritingMarkup.html(t.questions.find(x=>x.n===q.n).correction,t.questions.find(x=>x.n===q.n).marks):esc(t.questions.find(x=>x.n===q.n).correction))+'</pre>':'')+'</article>').join('')+'<h2>Nhận xét / Hướng dẫn</h2><pre>'+esc([t.correction,row.teacher_feedback].filter(Boolean).join('\n'))+'</pre></html>';
 }
 function download(row){const url=URL.createObjectURL(new Blob(['\ufeff'+sheet(row)],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='HSK'+row.hsk46_payload.level+'_Bai_'+row.hsk46_payload.lesson+'_Bai_Lam_Va_Nhan_Xet.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function decorateHsk6Picker(){
  for(const group of document.querySelectorAll('#ntcCourseGroups .ntc-group')){
   const summary=group.querySelector('summary');if(!summary||!summary.textContent.includes('HSK6'))continue;
   const n=Number(group.querySelector('.ntc-unit')?.textContent.match(/\d+/)?.[0]);
   if(!n)continue;const label='HSK6 · Sách BT HSK6'+(n<=20?'上':'下')+' · 20 bài';
   if(summary.textContent!==label)summary.textContent=label;
  }
  const selected=COURSES.find(c=>c.id===$('homeworkCourseSelect')?.value);
  if(!selected?.id.startsWith('hsk6-sbt'))return;
  const summary=$('ntcCourseSummary'),label=selected.group+' · '+selected.title;
  if(summary&&summary.textContent!==label)summary.textContent=label;
  const info=$('ntcAssignmentSummary');
  if(info){const text=info.textContent.replace(/^HSK6 · Sách bài tập/,selected.group);if(text!==info.textContent)info.textContent=text;}
 }
 const observer=new MutationObserver(()=>{
  decorateHsk6Picker();
  const rows=[...(window.NTCHomeworkUI?.state?.rows||[]),...activeHomeworkSubmissions];
  for(const row of rows){if(!row.hsk46_payload)continue;
   for(const anchor of document.querySelectorAll('[data-hsk46-return="'+row.id+'"]')){
    if(anchor.querySelector('[data-hsk46-download]'))continue;
    if(row.hsk46_return&&row.status!=='pending'){
     for(const q of row.hsk46_return.questions||[]){const heading=document.createElement('b');heading.textContent='Câu '+q.n+' · Giáo viên sửa';anchor.append(heading,window.NTCWritingMarkup?window.NTCWritingMarkup.render(document,q.correction,q.marks):document.createTextNode(q.correction||''));}
     const text=document.createElement('p');text.style.whiteSpace='pre-wrap';text.textContent=row.hsk46_return.correction||'';anchor.append(text);
    }
    const b=document.createElement('button');b.type='button';b.className='homework-btn secondary';b.dataset.hsk46Download='1';b.textContent=row.status==='pending'?'↓ Tải toàn bộ bài đã nộp':'↓ Tải bài làm, đáp án và nhận xét';b.onclick=()=>download(row);anchor.append(b);
   }
  }
 });observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 window.NTCHSK46={sync,validPayload,submitPayload,gradingPanel,sheet};
})();
