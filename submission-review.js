/* Read-only review of server-saved submissions. No writes or grading changes. */
(()=>{'use strict';
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
 let dialog=null,dialogOwner=null;
 function stillOwner(owner){return !isTeacher&&currentUser?.authId===owner;}
 function close(){dialog?.close();dialog?.remove();dialog=null;dialogOwner=null;}
 function appendText(host,label,text){if(text===undefined||text===null||text==='')return;const p=el('p');p.append(el('b',label+' '),document.createTextNode(String(text)));host.append(p);}
 function render(row,host){
  const p=row.hsk46_payload||row.workbook_payload;
  if(!p||!Array.isArray(p.questions)||!p.questions.length)return false;
  const hsk5=!!row.workbook_payload,returned=row.status==='graded'||row.status==='revision_required';
  const t=returned?(hsk5?row.teacher_return:row.hsk46_return)||{}:{};
  const total=hsk5?31:p.total;
  if(Number.isFinite(p.correct)&&Number.isFinite(total))host.append(el('p','Tự chấm: '+p.correct+'/'+total+' câu'));
  if(p.materials){
   const d=el('details'),s=el('summary','Bài đọc / Tư liệu');d.append(s);
   for(const text of [...Object.values(p.materials.passages||{}).flat(),...(p.materials.shared||[]),...(p.materials.writing||[])])if(typeof text==='string')d.append(el('p',text));
   host.append(d);
  }
  for(const q of p.questions){
   const manual=q.manual===true||(hsk5&&Number(q.n)===32),a=el('article');
   a.className='ntc-review-question '+(manual?'manual':q.correct===true?'ok':q.correct===false?'bad':'');
   const state=manual?(returned?'Phần giáo viên chấm':'Chờ giáo viên chấm'):q.correct===true?'Đúng':q.correct===false?'Sai':'Chưa có kết quả tự chấm';
   a.append(el('h3','Câu '+q.n+' · '+state));
   appendText(a,'',q.prompt);
   if(/^data:image\/(?:png|jpeg|webp);base64,/i.test(q.image||'')&&q.image.length<220000){const img=el('img');img.src=q.image;img.alt='Đề câu '+q.n;a.append(img);}
   if(Array.isArray(q.words))appendText(a,'Từ cho sẵn:',q.words.join('、'));
   appendText(a,'Bài làm:',hsk5&&Number(q.n)===32?p.essay||q.answer||'(Chưa viết)':q.answer||'(Chưa trả lời)');
   appendText(a,manual?'Gợi ý:':'Đáp án:',q.reference);
   appendText(a,'Giải thích:',q.explanation);
   const reviewed=t.questions?.find(x=>x.n===q.n);
   if(reviewed)appendText(a,'Giáo viên sửa:',reviewed.correction);
   host.append(a);
  }
  if(returned){
   if(hsk5&&t.essay_score!==undefined)appendText(host,'Điểm câu 32:',t.essay_score+'/10');
   appendText(host,'Giáo viên sửa:',t.correction);
   appendText(host,'Nhận xét:',row.teacher_feedback);
  }
  return true;
 }
 async function open(id){
  if(isTeacher||!currentUser?.authId)return;
  const owner=currentUser.authId;close();
  const d=el('dialog'),head=el('div'),title=el('h2','Bài đã nộp'),back=el('button','Đóng'),body=el('div'),status=el('p','Đang tải bài đã nộp…');
  dialog=d;dialogOwner=owner;d.className='ntc-review-dialog';head.className='ntc-review-head';back.type='button';back.className='homework-btn secondary';back.onclick=close;title.id='ntc-review-title';d.setAttribute('aria-labelledby',title.id);head.append(title,back);body.append(status);d.append(head,body);document.body.append(d);d.showModal();
  try{
   const result=await sb.from('homework_submissions').select('*').eq('id',id).eq('user_id',owner).maybeSingle();
   if(dialog!==d||!stillOwner(owner)){if(dialog===d)close();return;}
   if(result.error)throw result.error;
   const row=result.data;if(!row||row.user_id!==owner)throw Error('Không tìm thấy bài nộp của tài khoản này.');
   status.textContent='Nộp '+homeworkDate(row.submitted_at)+' · '+(row.status==='pending'?'Chờ chấm':row.status==='graded'?'Đã chấm':'Cần làm lại');
   if(render(row,body))return;
   if(row.files_purged_at||!row.storage_path)throw Error('Tệp bài nộp cũ không còn được lưu.');
   const signed=await sb.storage.from('student-homework').createSignedUrl(row.storage_path,600);
   if(dialog!==d||!stillOwner(owner)){if(dialog===d)close();return;}
   if(signed.error||!signed.data?.signedUrl)throw signed.error||Error('Không mở được tệp bài nộp.');
   const mime=String(row.mime_type||'');
   if(mime.startsWith('image/')){const img=el('img');img.src=signed.data.signedUrl;img.alt='Bài đã nộp';body.append(img);}
   else if(mime.startsWith('audio/')){const audio=el('audio');audio.controls=true;audio.src=signed.data.signedUrl;body.append(audio);}
   else{const a=el('a','Mở tệp bài đã nộp');a.href=signed.data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
   body.append(el('p','Bài cũ chỉ hiển thị nội dung đã lưu; nếu chỉ lưu ảnh kết quả, chưa có đầy đủ từng câu và đáp án để xem lại.'));
  }catch(e){if(dialog===d&&stillOwner(owner))status.textContent='Không xem được bài: '+e.message;}
 }
 function mount(host,rows){
  if(isTeacher||!currentUser?.authId)return;
  for(const row of rows||[]){
   if(row.user_id!==currentUser.authId||!row.id)continue;
   if([...host.querySelectorAll('[data-ntc-review]')].some(b=>b.dataset.ntcReview===row.id))continue;
   const b=el('button','Xem bài đã nộp'+(rows.length>1?' · '+homeworkPartLabel(row.submission_kind,row.part_key):''));
   b.type='button';b.className='homework-btn secondary';b.dataset.ntcReview=row.id;b.onclick=()=>open(row.id);host.append(b);
  }
 }
 const oldPanel=renderLessonHomeworkPanel;
 renderLessonHomeworkPanel=function(...args){const result=oldPanel(...args),host=document.getElementById('lessonHomeworkContent');if(host)mount(host,activeHomeworkSubmissions);return result;};
 const style=el('style');style.textContent='.ntc-review-dialog{box-sizing:border-box;width:min(960px,calc(100vw - 24px));max-height:90dvh;overflow:auto;border:1px solid #f4bdd3;border-radius:20px;padding:24px;background:#fff;color:#283047;font:18px/1.7 system-ui}.ntc-review-dialog::backdrop{background:#18203270}.ntc-review-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ntc-review-dialog h2{font-size:26px;color:#d92273}.ntc-review-dialog h3{font-size:20px;margin:0 0 12px}.ntc-review-dialog p{white-space:pre-wrap;overflow-wrap:anywhere}.ntc-review-dialog img{max-width:100%;height:auto}.ntc-review-dialog audio{max-width:100%}.ntc-review-question{border:1px solid #e6e8ee;border-left:5px solid #9aa4b4;border-radius:12px;padding:18px;margin:16px 0;background:#fafbfc}.ntc-review-question.ok{border-left-color:#219364;background:#f0fbf5}.ntc-review-question.bad{border-left-color:#e3486c;background:#fff3f6}.ntc-review-question.manual{border-left-color:#dfa630;background:#fffbef}@media(max-width:600px){.ntc-review-dialog{padding:16px;font-size:17px}.ntc-review-question{padding:14px}}';document.head.append(style);
 window.NTCSubmissionReview={open,mount,render,close};
 const ownerWatch=setInterval(()=>{if(dialog&&!stillOwner(dialogOwner))close();},1000);
 window.addEventListener('pagehide',()=>{clearInterval(ownerWatch);close();},{once:true});
})();
