/* Presentation and batch orchestration. Existing models, submission gates and RPC adapters remain authoritative. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),UI=window.NTCHomeworkUI;
 let studentTab='todo',kind='all',sort='due',studentId=null,topicError='',selected=new Set(),group='',search='',assignmentKind='lesson',busy=false;
 const book='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 5C8 3 5 3 2 4v16c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Zm0 0v16"/></svg>';
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 function btn(text,fn,cls='ar-btn'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
 function select(label,options,value,change){const n=el('select');n.setAttribute('aria-label',label);for(const [v,t] of options){const o=el('option',t);o.value=v;n.append(o);}n.value=value;n.onchange=()=>change(n.value);return n;}
 function bookIcon(type){const n=el('span',undefined,'ar-icon ar-'+type);n.innerHTML=book;return n;}
 function classify(c){return (window.NTC_TOPIC_REVIEW_CATALOG||[]).some(t=>t.id===c.id)?'topic':isWorkbookCourse(c)?'book':'review';}
 function label(c){return (c.group||c.desc||'Bài học')+' · '+c.title;}
 function freshStudent(){return !isTeacher&&currentUser?.authId&&UI.homeSnapshot()?.owner===currentUser.authId;}
 function entries(){
  const data=UI.homeSnapshot();if(!data)return [];
  const rows=data.items.map(item=>{const s=item.state,w=item.window,c=COURSES.find(x=>x.id===w.lesson_code);return {type:c?classify(c):'review',title:w.course_code+' · '+w.lesson_name,end:s.end,status:s.redo?'redo':s.full?(s.pending?'pending':'done'):'todo',access:s.access,returned:(s.rows||[]).some(r=>r.status!=='pending'&&!r.student_viewed_at),item};});
  for(const a of data.games||[]){const done=Number(a.completed_runs||0)>=Number(a.required_runs||1),now=Date.now();rows.push({type:'game',title:a.label||'Game được giao',end:Date.parse(a.closes_at),status:done?'done':'todo',access:a.archived||a.archived_at?'archived':now<Date.parse(a.opens_at)?'future':now>Date.parse(a.closes_at)?'late':'open',game:a});}
  for(const t of window.NTCTopicReviews?.homeSnapshot()||[]){const a=t.assignment;rows.push({type:'topic',title:a.title,end:Date.parse(a.closes_at),status:t.receipt?.completed_at?'done':'todo',access:!a.is_enabled?'closed':t.now<Date.parse(a.opens_at)?'future':t.now>Date.parse(a.closes_at)?'late':'open',topic:a,receipt:t.receipt});}
  return rows;
 }
 function card(row){
  if(row.item){const d=UI.studentCard(row.item),head=d.querySelector('.ntc-student-head');d.classList.add('ar-task');head.prepend(bookIcon(row.type));const subtitle=head.querySelector('p');if(subtitle)subtitle.textContent=(row.type==='book'?'Sách bài tập':'Ôn tập')+(row.item.override?' · Hạn riêng':'');const s=row.item.state,b=head.querySelector('button');
   if(!s.submitted&&s.access==='open'){b.textContent='Làm bài';b.classList.add('ar-primary');b.removeAttribute('aria-expanded');b.onclick=()=>openCourse(row.item.window.lesson_code,row.item.window.id);}
   return d;
  }
  const d=el('article',undefined,'ar-task ar-simple'),text=el('div',undefined,'ar-task-copy');text.append(el('h3',row.title));const status=row.status==='done'?'Đã hoàn thành':{open:'Cần làm',future:'Sắp mở',late:'Quá hạn',closed:'Đã đóng',archived:'Lưu trữ'}[row.access];
  text.append(el('p',(row.type==='game'?'Game':'Ôn tập chủ đề')+' · Hạn '+homeworkDate(row.end)));const side=el('div',undefined,'ar-task-side');side.append(el('span',status,'ar-status '+(row.access==='late'?'ar-warn':'')));
  let action;
  if(row.game){const a=row.game;action=btn(row.status==='done'?'Đã hoàn thành':'Chơi ngay',()=>window.ntcOpenAssignedGame?.(a));action.disabled=row.status==='done'||row.access!=='open';text.append(el('p',Number(a.completed_runs||0)+'/'+a.required_runs+' lượt','ar-muted'));}
  else{action=btn(row.status==='done'?'Xem bài đã ôn':'Ôn tập',()=>window.NTCTopicReviews.openAssigned(row.topic));action.disabled=row.status!=='done'&&row.access!=='open';text.append(el('p',(row.receipt?.completed_steps?.length||0)+'/'+row.topic.steps.length+' bước','ar-muted'));}
  d.append(bookIcon(row.type),text,side,action);return d;
 }
 function renderStudent(){
  if(!freshStudent())return;const box=$('homeworkCenterContent');if(studentId!==currentUser.authId){studentId=currentUser.authId;studentTab='todo';kind='all';sort='due';topicError='';}
  box.classList.add('ntc-ui','ntc-assignments');box.classList.remove('ar-setup');const title=$('homeworkPageTitle');if(title)title.textContent='Bài tập của tôi';
  const all=entries();box.replaceChildren();const tabs=el('div',undefined,'ar-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Trạng thái bài tập');
  for(const [key,name] of [['todo','Cần làm'],['pending','Chờ chấm'],['redo','Cần làm lại'],['done','Đã hoàn thành']]){const b=btn(name,()=>{studentTab=key;renderStudent();},'ar-tab');b.id='ar-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(studentTab===key));b.setAttribute('aria-controls','ar-student-panel');b.append(el('span',String(all.filter(x=>x.status===key).length),'ar-count'));tabs.append(b);}
  box.append(tabs);const toolbar=el('div',undefined,'ar-toolbar');toolbar.append(select('Loại bài',[['all','Tất cả loại bài'],['review','Ôn tập'],['book','Sách bài tập'],['game','Game'],['topic','Chủ đề']],kind,v=>{kind=v;renderStudent();}),select('Sắp xếp',[['due','Hạn gần nhất'],['title','Tên bài']],sort,v=>{sort=v;renderStudent();}));
  const unseen=all.filter(x=>x.returned).length;if(unseen){const b=btn('Bài trả chưa xem · '+unseen,()=>{studentTab='returned';renderStudent();});b.setAttribute('aria-pressed',String(studentTab==='returned'));toolbar.append(b);}box.append(toolbar);
  const panel=el('div',undefined,'ar-student-panel');panel.id='ar-student-panel';panel.setAttribute('role','tabpanel');if(studentTab!=='returned')panel.setAttribute('aria-labelledby','ar-tab-'+studentTab);else panel.setAttribute('aria-label','Bài trả chưa xem');box.append(panel);
  const visible=all.filter(x=>(studentTab==='returned'?x.returned:x.status===studentTab)&&(kind==='all'||kind===x.type)).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'vi',{numeric:true}):a.end-b.end);
  for(const row of visible)panel.append(card(row));if(!visible.length)panel.append(el('p','Không có bài trong mục này.','ar-empty'));
  if(UI.homeSnapshot()?.gameError)box.append(el('p','Chưa tải được game. Hãy nhấn Làm mới để thử lại.','ar-error'));
  if(topicError)box.append(el('p','Chưa tải được ôn tập chủ đề. Hãy nhấn Làm mới để thử lại.','ar-error'));
  if(studentTab==='todo'){const redos=all.filter(x=>x.status==='redo').length;if(redos){const banner=el('div',undefined,'ar-redo-banner');banner.append(el('strong',redos+' bài cần làm lại'),btn('Xem bài →',()=>{studentTab='redo';renderStudent();}));box.append(banner);}}
 }
 window.NTCAssignmentRefresh={renderStudent};
 const oldStudent=renderStudentHomeworkCenter;renderStudentHomeworkCenter=async function(...args){const id=currentUser?.authId;await oldStudent(...args);if(isTeacher||currentUser?.authId!==id)return;try{await window.NTCTopicReviews.refresh();topicError='';}catch(e){topicError=e.message;}if(currentUser?.authId===id&&!isTeacher)renderStudent();};
 const originalSetup=renderHomeworkSetup;
 renderHomeworkSetup=function(){originalSetup();enhanceSetup();};
 function enhanceSetup(){
  if(!isTeacher)return;selected=new Set();search='';group='';assignmentKind='lesson';const box=$('homeworkCenterContent');box.classList.remove('ntc-assignments');box.classList.add('ar-setup');const sections=[...box.querySelectorAll('.ntc-form > .ntc-section')];if(sections.length!==3)return;
  const title=$('homeworkPageTitle');if(title)title.textContent='Giao bài';
  const layout=el('div',undefined,'ar-assign-layout'),left=el('div',undefined,'ar-assign-left'),right=el('aside',undefined,'ar-assign-right');const summary=el('section',undefined,'ar-confirm');summary.append(el('h3','Xác nhận giao bài'));const selectedBox=el('div');selectedBox.id='ar-selected';summary.append(selectedBox);right.append(summary);
  sections[0].querySelector('h3').textContent='1. Chọn lớp';sections[1].querySelector('h3').textContent='2. Chọn bài';sections[2].querySelector('h3').textContent='3. Đặt thời gian';left.append(sections[0],sections[1]);right.append(sections[2]);const footer=box.querySelector('.ntc-bottom'),msg=$('homeworkSetupMessage');right.append(footer,msg);layout.append(left,right);box.querySelector('.ntc-form').replaceWith(layout);
  const oldPicker=$('ntcCoursePicker');oldPicker.hidden=true;const picker=el('div',undefined,'ar-picker');oldPicker.before(picker);const tabs=el('div',undefined,'ar-kind-tabs');
  for(const [key,name]of[['lesson','Bài học'],['game','Game'],['topic','Chủ đề']]){const b=btn(name,()=>{if(busy)return;if(key==='game'){setHomeworkTeacherTab('games');return;}assignmentKind=key;group='';search='';selected.clear();renderPicker();syncSummary();},'ar-kind');b.dataset.kind=key;tabs.append(b);}picker.append(tabs);
  const groupSelect=el('select');groupSelect.id='ar-group';groupSelect.setAttribute('aria-label','Nhóm bài');groupSelect.onchange=()=>{group=groupSelect.value;renderLessonList();};const q=el('input');q.type='search';q.placeholder='Tìm bài…';q.setAttribute('aria-label','Tìm bài');q.oninput=()=>{search=q.value;renderLessonList();};q.id='ar-search';const list=el('div',undefined,'ar-lesson-list');list.id='ar-lessons';const line=el('div',undefined,'ar-picker-foot');line.append(el('strong','', 'ar-selected-count'),btn('Bỏ chọn',()=>{selected.clear();renderLessonList();syncSummary();},'ar-text'));picker.append(groupSelect,q,list,line);
  box.querySelectorAll('[name=homeworkClass],#homeworkOpenAt,#homeworkCloseAt').forEach(n=>n.addEventListener('change',syncSummary));const save=$('ntcSaveHomework');save.onclick=saveBatch;renderPicker();syncSummary();
  const recent=el('section',undefined,'ar-confirm ar-recent');recent.append(el('h3','Đã giao gần đây'));const windows=UI.state.all.filter(w=>!w.archived_at).slice().sort((a,b)=>Date.parse(b.created_at||b.opens_at)-Date.parse(a.created_at||a.opens_at)).slice(0,4);for(const w of windows){const row=el('div',undefined,'ar-recent-row');row.append(el('strong',w.class_code+' · '+w.lesson_name),el('span','Hạn '+homeworkDate(w.closes_at),'ar-muted'),btn('Xem',()=>setHomeworkTeacherTab('windows')));recent.append(row);}if(!windows.length)recent.append(el('p','Chưa có bài đã giao.','ar-muted'));box.append(recent);
 }
 function courseList(){return COURSES.filter(c=>c.id!=='shadowing'&&(classify(c)==='topic')===(assignmentKind==='topic'));}
 function renderPicker(){const box=$('homeworkCenterContent');box.querySelectorAll('.ar-kind').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===assignmentKind)));const groups=[...new Set(courseList().map(c=>c.group||c.desc||'Chủ đề'))];if(!groups.includes(group))group=groups[0]||'';const s=$('ar-group');s.replaceChildren();for(const g of groups){const o=el('option',g);o.value=g;s.append(o);}s.value=group;$('ar-search').value=search;renderLessonList();}
 function renderLessonList(){const host=$('ar-lessons');host.replaceChildren();const list=courseList().filter(c=>(c.group||c.desc||'Chủ đề')===group&&label(c).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));for(const c of list){const l=el('label',undefined,'ar-lesson-check'),n=el('input');n.type='checkbox';n.value=c.id;n.checked=selected.has(c.id);n.onchange=()=>{if(n.checked)selected.add(c.id);else selected.delete(c.id);if(n.checked){$('homeworkCourseSelect').value=c.id;syncHomeworkSetupMode();}syncSummary();};l.append(n,el('span',c.title));host.append(l);}if(!list.length)host.append(el('p','Không có bài phù hợp.','ar-empty'));}
 function syncSummary(){const host=$('ar-selected');if(!host)return;const classes=[...document.querySelectorAll('[name=homeworkClass]:checked')].map(n=>n.value);host.replaceChildren(el('strong',classes.join(', ')||'Chưa chọn lớp'),el('p',(UI.state.profiles||[]).filter(p=>p.approval_status==='approved'&&classes.includes(NTCHomework.norm(p.class_code))).length+' học sinh','ar-muted'));
  for(const id of selected){const c=COURSES.find(c=>c.id===id);if(!c)continue;const chip=el('div',undefined,'ar-chip');chip.append(el('span',label(c)),btn('×',()=>{if(busy)return;selected.delete(id);renderLessonList();syncSummary();},'ar-remove'));chip.lastChild.setAttribute('aria-label','Bỏ '+c.title);host.append(chip);}
  const count=$('homeworkCenterContent').querySelector('.ar-selected-count');if(count)count.textContent='Đã chọn '+selected.size+' bài';if(!busy)$('ntcSaveHomework').textContent='Giao '+selected.size+' bài';
  if(!busy&&selected.size){const types=[...selected].map(id=>classify(COURSES.find(c=>c.id===id)));$('homeworkPartSetupGrid').style.display=types.includes('review')?'':'none';const note=$('homeworkWorkbookSetupNote');note.style.display=types.some(t=>t!=='review')?'block':'none';note.textContent=types.includes('topic')?'Ôn đủ các bước rồi xác nhận hoàn thành.':types.includes('book')?'Sách bài tập: nộp kết quả toàn bài, không chia phần.':'';}
 }
 const originalSave=saveHomeworkSetup;
 async function saveBatch(){
  if(busy||!isTeacher)return;const msg=$('homeworkSetupMessage'),b=$('ntcSaveHomework'),ids=[...selected],user=currentUser?.authId,box=$('homeworkCenterContent');if(!ids.length){msg.textContent='Hãy chọn ít nhất một bài.';return;}
  busy=true;const lock=[...box.querySelectorAll('input,select,button,summary')].filter(n=>n!==b),states=lock.map(n=>[n,n.disabled]);lock.forEach(n=>{n.disabled=true;});let count=0,error='';
  try{for(const id of ids){if(currentUser?.authId!==user||!isTeacher||!b.isConnected||homeworkTeacherTab!=='setup'){error='Đã dừng do chuyển trang hoặc tài khoản.';break;}$('homeworkCourseSelect').value=id;syncHomeworkSetupMode();b.disabled=false;await originalSave();b.disabled=true;
    if(currentUser?.authId!==user||!isTeacher)break;if(!msg.textContent.trim().startsWith('✓')){error=msg.textContent;break;}selected.delete(id);count++;
   }
   if(b.isConnected&&currentUser?.authId===user){syncSummary();msg.replaceChildren(el('strong','Đã giao thành công '+count+'/'+ids.length+' bài.'));if(error)msg.append(el('p',error,'ar-error'),el('p','Đã dừng. Các bài chưa xác nhận vẫn được giữ trong danh sách.'));else msg.append(btn('Xem tiến độ lớp',()=>setHomeworkTeacherTab(assignmentKind==='topic'?'topics':'windows')));}
  }catch(e){if(msg.isConnected&&currentUser?.authId===user)msg.textContent='Đã giao '+count+'/'+ids.length+' bài. '+e.message;}
  finally{busy=false;for(const [n,disabled]of states)if(n.isConnected)n.disabled=disabled;if(b.isConnected){b.disabled=false;syncSummary();}}
 }
 const originalLoad=loadHomeworkCenter;loadHomeworkCenter=async function(...args){const box=$('homeworkCenterContent');box.classList.remove('ar-setup','ntc-assignments');document.body.classList.add('ntc-assignment-ui');try{return await originalLoad(...args);}finally{syncPageTheme();}};
 function syncPageTheme(){document.body.classList.toggle('ntc-assignment-ui',$('homeworkView')?.style.display==='block');}
 if($('homeworkView'))new MutationObserver(syncPageTheme).observe($('homeworkView'),{attributes:true,attributeFilter:['style']});
 const originalLogout=doLogout;doLogout=async function(...args){studentId=null;topicError='';selected.clear();return originalLogout(...args);};
})();
