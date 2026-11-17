/* Topic review receipts. Existing workbook/media submission adapters are untouched. */
(()=>{
 'use strict';
 const catalog=window.NTC_TOPIC_REVIEW_CATALOG||[],$=id=>document.getElementById(id);
 let baseCount=0;
 let owner=null,assignments=[],serverOffset=0,loading=null,context=null,loadError='',request=null;
 const spec=id=>catalog.find(x=>x.id===id),uuid=()=>crypto.randomUUID();
 async function rpc(name,args={}){
  if(!sb||!currentUser)throw Error('Cần đăng nhập.');
  const r=await sb.rpc(name,args);
  if(r.error)throw Error(/PGRST202|42883/.test(r.error.code||'')?'Chưa cài phần xác nhận ôn chủ đề trong Supabase.':r.error.message);
  return r.data;
 }
 const now=()=>Date.now()+serverOffset;
 function receipt(a){return (a.students||[]).find(s=>s.user_id===currentUser?.authId);}
 function status(a,s){return s?.completed_at?'Đã hoàn thành':!a.is_enabled?'Đã đóng':now()<Date.parse(a.opens_at)?'Chưa mở':now()>Date.parse(a.closes_at)?'Quá hạn':s?.completed_steps?.length?'Đang ôn':'Chưa hoàn thành';}
 function needed(){if(owner!==currentUser?.authId||isTeacher)return 0;return assignments.filter(a=>a.is_enabled&&!receipt(a)?.completed_at).length;}
 const oldBadge=renderHomeworkPendingBadge;
 renderHomeworkPendingBadge=function(count){baseCount=Number(count||0);return oldBadge(baseCount+needed());};
 async function refresh(){
  const id=currentUser?.authId;if(!id)return [];
  if(owner!==id){owner=id;assignments=[];if(context?.user!==id)context=null;loading=null;loadError='';}
  if(loading?.owner===id)return loading.promise;
  const job={owner:id,promise:null};loading=job;
  job.promise=(async()=>{
   try{const r=await rpc('ntc_list_topic_reviews');
    if(currentUser?.authId!==id||loading!==job)return [];
    assignments=r.assignments||[];serverOffset=Date.parse(r.server_time)-Date.now();loadError='';if(!isTeacher)oldBadge(baseCount+needed());return assignments;
   }catch(e){if(currentUser?.authId===id){loadError=e.message;assignments=[];}throw e;}
   finally{if(loading===job)loading=null;}
  })();return job.promise;
 }
 const oldAttention=window.NTCHomeworkUI?.refreshAttention;
 if(oldAttention)window.NTCHomeworkUI.refreshAttention=async function(...args){
  await refresh().catch(()=>{});return oldAttention(...args);
 };
 function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
 function button(label,action){const b=text('button',label,'homework-btn secondary');b.type='button';b.onclick=action;return b;}
 function progress(a,s){return (s?.completed_steps?.length||0)+'/'+a.steps.length+' bước';}
 const tab=button('Ôn chủ đề',()=>setHomeworkTeacherTab('topics'));tab.className='homework-tab';tab.dataset.homeworkTab='topics';$('homeworkTeacherTabs').append(tab);
 const oldTab=setHomeworkTeacherTab;
 setHomeworkTeacherTab=function(value){
  if(value!=='topics')return oldTab(value);
  homeworkTeacherTab=value;document.querySelectorAll('[data-homework-tab]').forEach(b=>b.classList.toggle('active',b.dataset.homeworkTab===value));loadHomeworkCenter(true);
 };
 const oldLoad=loadHomeworkCenter;
 loadHomeworkCenter=async function(...args){if(isTeacher&&homeworkTeacherTab==='topics'){await teacherView();return;}return oldLoad(...args);};
 const oldSync=syncHomeworkSetupMode;
 syncHomeworkSetupMode=function(){oldSync();const n=$('homeworkWorkbookSetupNote');if(n){if(!n.dataset.legacyText)n.dataset.legacyText=n.textContent;else n.textContent=n.dataset.legacyText;}const topic=spec($('homeworkCourseSelect')?.value);if(topic){$('homeworkPartSetupGrid').style.display='none';const n=$('homeworkWorkbookSetupNote');n.style.display='block';n.textContent='Ôn đủ '+topic.steps.length+' bước → xác nhận đã ôn. Không nộp tệp, không chấm điểm.';}};
 const oldSave=saveHomeworkSetup;
 saveHomeworkSetup=async function(){
  const topic=spec($('homeworkCourseSelect')?.value);if(!topic)return oldSave();
  const b=$('ntcSaveHomework'),msg=$('homeworkSetupMessage');if(b.disabled)return;
  try{
   const classes=[...document.querySelectorAll('[name=homeworkClass]:checked')].map(n=>n.value);
   const opens=new Date($('homeworkOpenAt').value),closes=new Date($('homeworkCloseAt').value);
   if(!classes.length||!Number.isFinite(+opens)||!Number.isFinite(+closes)||closes<=opens)throw Error('Chọn lớp và thời gian hợp lệ.');
   const args={p_topic:topic.id,p_classes:classes.sort(),p_opens:opens.toISOString(),p_closes:closes.toISOString()};
   const signature=JSON.stringify(args);if(request?.signature!==signature)request={signature,id:uuid()};
   b.disabled=true;msg.textContent='Đang giao ôn tập…';const user=currentUser.authId;
   const result=await rpc('ntc_assign_topic_review',{...args,p_request:request.id});
   if(currentUser?.authId!==user)return;
   if(result.assignment_ids?.length!==new Set(classes).size)throw Error('Chưa nhận đủ biên nhận. Hãy thử lại để kiểm tra.');
   msg.replaceChildren(text('span','✓ Đã giao '+topic.title+' cho '+classes.join(', ')+'.'),document.createElement('br'),button('Xem tiến độ ôn tập',()=>setHomeworkTeacherTab('topics')));
   request=null;
  }catch(e){msg.textContent=e.message;}finally{b.disabled=false;}
 };
 async function teacherView(){
  const box=$('homeworkCenterContent');box.replaceChildren(text('p','Đang tải ôn tập được giao…'));
  const user=currentUser?.authId;
  try{await refresh();if(currentUser?.authId!==user||!isTeacher||homeworkTeacherTab!=='topics')return;
   box.replaceChildren(text('h3','Ôn tập chủ đề'),text('p','Giao bài tại “Giao bài tập” → “Ôn tập theo chủ đề”. Xác nhận hoàn thành không cần chấm điểm.','homework-muted'));
   for(const a of assignments){const d=document.createElement('details');d.className='homework-card';
    const students=a.students||[],done=students.filter(s=>s.completed_at).length;
    d.append(text('summary',a.class_code+' · '+a.title+' — '+done+'/'+students.length+' đã hoàn thành'),text('p',homeworkDate(a.opens_at)+' → '+homeworkDate(a.closes_at)));
    for(const s of students)d.append(text('p',s.full_name+' · '+status(a,s)+' · '+progress(a,s)+(s.completed_at?' · '+homeworkDate(s.completed_at):'')));
    d.append(button('Sửa hạn',()=>edit(a)),button(a.is_enabled?'Đóng nhận xác nhận':'Mở lại',async()=>{try{await rpc('ntc_update_topic_review',{p_assignment:a.id,p_closes:a.closes_at,p_enabled:!a.is_enabled});await teacherView();}catch(e){alert(e.message);}}));box.append(d);
   }if(!assignments.length)box.append(text('p','Chưa có chủ đề được giao.'));
  }catch(e){if(currentUser?.authId===user)box.replaceChildren(text('p',e.message));}
 }
 function edit(a){const d=document.createElement('dialog');d.className='ntc-dialog';const input=document.createElement('input');input.type='datetime-local';input.value=homeworkLocalInput(new Date(a.closes_at));const msg=text('p','');msg.setAttribute('role','status');
  d.append(text('h3','Hạn ôn tập · '+a.title),input,msg,button('Lưu',async()=>{try{const closes=new Date(input.value);if(!Number.isFinite(+closes)||closes<=new Date(a.opens_at))throw Error('Hạn phải sau giờ mở.');await rpc('ntc_update_topic_review',{p_assignment:a.id,p_closes:closes.toISOString(),p_enabled:a.is_enabled});d.close();await teacherView();}catch(e){msg.textContent=e.message;}}),button('Hủy',()=>d.close()));d.onclose=()=>d.remove();document.body.append(d);d.showModal();
 }
 async function studentSection(){
  const box=$('homeworkCenterContent');if(!currentUser||isTeacher||$('ntcStudentTopics')||box?.classList.contains('ntc-assignments'))return;
  const section=document.createElement('section');section.id='ntcStudentTopics';section.className='homework-card';section.append(text('h3','Ôn tập chủ đề được giao'));box.prepend(section);const user=currentUser.authId;
  try{await refresh();if(currentUser?.authId!==user||!section.isConnected)return;
   for(const a of assignments){const s=receipt(a),card=document.createElement('article');card.className='homework-window';card.append(text('b',a.title),text('p',status(a,s)+' · '+progress(a,s)),text('small','Hạn: '+homeworkDate(a.closes_at)));
    const b=button(s?.completed_at?'Xem bài đã ôn':'Mở bài ôn tập',()=>openAssigned(a));b.disabled=!s?.completed_at&&(!a.is_enabled||now()<Date.parse(a.opens_at)||now()>Date.parse(a.closes_at));card.append(b);section.append(card);
   }if(!assignments.length)section.append(text('p','Chưa có chủ đề được giao.'));
  }catch(e){if(currentUser?.authId===user&&section.isConnected)section.append(text('p',e.message));}
 }
 const oldStudent=renderStudentHomeworkCenter;
 renderStudentHomeworkCenter=async function(...args){await oldStudent(...args);await studentSection();};
 new MutationObserver(()=>{if(!isTeacher&&currentUser&&$('homeworkCenterContent')?.querySelector('.ntc-tabs')&&!$('ntcStudentTopics'))studentSection();}).observe($('homeworkCenterContent'),{childList:true});
 async function openAssigned(a){
  const user=currentUser?.authId,topic=spec(a.topic_id);if(!user||!topic||isTeacher)return;
  await openCourse(topic.id);if(currentUser?.authId!==user)return;
  context={assignment:a.id,topic:topic.id,user,nonce:null};
  $('lessonHomeworkToggle').style.display='none';$('lessonHomeworkPanel').classList.remove('open');$('iframeView').classList.remove('drawer-open');
  const url=new URL(topic.file,location.href);url.searchParams.set('topicAssignment',a.id);
  $('contentFrame').src=url.pathname+url.search;$('contentBack').textContent='← Bài tập của tôi';
 }
 function validFrame(event){
  const f=$('contentFrame'),c=context;if(!f||!c||c.user!==currentUser?.authId||isTeacher||event.source!==f.contentWindow||event.origin!==location.origin)return false;
  const u=new URL(f.getAttribute('src')||'',location.href),t=spec(c.topic);
  return t&&u.pathname===t.file&&u.searchParams.get('topicAssignment')===c.assignment;
 }
 window.addEventListener('message',async event=>{
  const m=event.data||{};if(!['ntcTopicReady','ntcTopicSave'].includes(m.type)||!validFrame(event))return;
  const ctx=context;if(m.assignment!==ctx.assignment||m.topic!==ctx.topic||typeof m.nonce!=='string'||!m.nonce)return;
  const reply=data=>{if(context===ctx&&validFrame(event))event.source.postMessage({...data,assignment:ctx.assignment,topic:ctx.topic,nonce:ctx.nonce},location.origin);};
  try{
   if(m.type==='ntcTopicReady'){
    ctx.nonce=m.nonce;await refresh();if(context!==ctx||ctx.user!==currentUser?.authId)return;
    const a=assignments.find(x=>x.id===ctx.assignment&&x.topic_id===ctx.topic),s=a&&receipt(a);
    if(!a||!s)throw Error('Không tìm thấy bài ôn được giao cho tài khoản này.');
    reply({type:'ntcTopicConfig',userId:ctx.user,steps:a.steps,completed:s.completed_steps,completedAt:s.completed_at,canSave:a.is_enabled&&now()>=Date.parse(a.opens_at)&&now()<=Date.parse(a.closes_at)});return;
   }
   if(m.nonce!==ctx.nonce||typeof m.requestId!=='string')return;
   const r=await rpc('ntc_save_topic_review_step',{p_assignment:ctx.assignment,p_step:typeof m.step==='string'?m.step:null,p_confirm:m.confirm===true});
   reply({type:'ntcTopicSaved',requestId:m.requestId,completed:r.completed_steps,completedAt:r.completed_at});
   if(r.completed_at&&ctx.user===currentUser?.authId)loadHomeworkPendingBadge().catch(()=>{});
  }catch(e){reply({type:'ntcTopicError',requestId:m.requestId,message:e.message});}
 });
 const oldBack=returnFromContent;
 returnFromContent=async function(){if(context&&validFrame({source:$('contentFrame').contentWindow,origin:location.origin})){context=null;await goHomeworkCenter();return;}return oldBack();};
 const oldLogout=doLogout;doLogout=async function(...args){context=null;owner=null;assignments=[];loading=null;request=null;baseCount=0;return oldLogout(...args);};
 window.NTCTopicReviews={refresh,openAssigned,homeSnapshot:()=>{if(isTeacher||!currentUser||owner!==currentUser.authId)return null;return assignments.map(a=>({assignment:a,receipt:receipt(a),status:status(a,receipt(a)),now:now()}));}};
})();
