/* Student home presentation only. Assignment, grading, Auth and lesson adapters remain authoritative. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),host=$('ntcStudentHome'),view=$('homeView');
 let generation=0,owner=null,loading=null,refreshTimer=null;
 const book='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 5C8 3 5 3 2 4v16c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Zm0 0v16"/></svg>';
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 function button(label,fn,primary=false){const b=el('button',label,'sh-btn'+(primary?' sh-primary':''));b.type='button';b.onclick=fn;return b;}
 function empty(target,msg,retry){target.replaceChildren(el('p',msg,'sh-empty'));if(retry)target.append(button('Thử lại',()=>refresh()));}
 function current(id){return !isTeacher&&currentUser?.authId===id&&owner===id;}
 function showRoot(){return !isTeacher&&currentUser?.authId&&host&&!host.hidden;}
 function syncTheme(){document.body.classList.toggle('ntc-student-home',!!showRoot()&&view.style.display!=='none');}
 const originalPicker=renderHomePicker;
 renderHomePicker=function(category=null,group=null){const result=originalPicker.apply(this,arguments);const student=!isTeacher&&!!currentUser?.authId;host.hidden=!student||!!category;view.classList.toggle('sh-root',student&&!category);syncTheme();if(student&&!category){build();refresh();}return result;};
 function heading(title,action){const top=el('div',undefined,'sh-section-top');top.append(el('h2',title));if(action){const b=button('Xem tất cả →',action);b.className='sh-link';top.append(b);}return top;}
 function build(){
  if(owner===currentUser.authId&&host.children.length)return;
  if(owner!==currentUser.authId){owner=currentUser.authId;generation++;loading=null;}
  host.replaceChildren();const head=el('div',undefined,'sh-heading');head.append(el('h1','Chào '+(currentUser.name||'bạn')));host.append(head);
  const taskSection=el('section');taskSection.append(heading('Bài tập của tôi',()=>goHomeworkCenter()));const tasks=el('div',undefined,'sh-task-grid');tasks.id='shTasks';tasks.setAttribute('aria-live','polite');tasks.append(el('p','Đang tải bài tập…','sh-empty'));taskSection.append(tasks);host.append(taskSection);
  const resume=el('section');resume.id='shResume';resume.hidden=true;host.append(resume);
  const courses=el('section');courses.append(heading('Các khóa học'));const grid=el('div',undefined,'sh-course-grid');
  const colors=[['#f23883','#ffeaf3','#ffc0d7'],['#198bc9','#eaf6ff','#a9dcff'],['#a97609','#fff7dd','#ffe188'],['#f23883','#fff0f6','#ffc0d7'],['#138f73','#e7faf2','#9de7cf'],['#875bd0','#f4edff','#d7c2ff']];
  for(let n=1;n<=6;n++){const cat='HSK'+n,list=homeCategoryCourses(cat);if(!list.length)continue;const c=el('article',undefined,'sh-course');const [color,wash,tint]=colors[n-1];c.style.setProperty('--sh-color',color);c.style.setProperty('--sh-wash',wash);c.style.setProperty('--sh-tint',tint);const icon=el('span',undefined,'sh-book');icon.innerHTML=book;const body=el('div');body.append(el('h3',cat));const actions=el('div',undefined,'sh-course-actions');for(const [kind,label]of[['review','Ôn tập'],['book','Sách bài tập']])if(list.some(x=>isBook(x)===(kind==='book')))actions.append(button(label,()=>choose(cat,kind)));body.append(actions);c.append(icon,body);grid.append(c);}
  courses.append(grid);const extras=el('div',undefined,'sh-extras');for(const [cat,label]of[['Shadowing','Shadowing'],['Chủ đề','Ôn tập chủ đề'],['Game Center','Game']]){const m=window.NTC_STUDY_MODULES?.find(x=>x.category===cat);if(cat!=='Game Center'&&!homeCategoryCourses(cat).length)continue;const b=button(label+' →',()=>openStudyModule(cat));b.className='sh-extra';if(m)b.dataset.module=m.id;extras.append(b);}courses.append(extras);host.append(courses);
 }
 function isBook(c){return /sách|sbt|sach|bài tập|bai tap/i.test((c.group||'')+' '+(c.desc||'')+' '+c.id);}
 function choose(cat,kind){renderHomePicker(cat,kind);view.scrollIntoView({block:'start'});}
 function taskCard(title,status,due,action,label,primary){const c=el('article',undefined,'sh-task');const tone=/lại|hạn/.test(status)?' sh-amber':/ôn|Đang/.test(status)?' sh-blue':'';c.append(el('span',status,'sh-status'+tone),el('h3',title));if(due)c.append(el('p','Hạn: '+homeworkDate(due),'sh-due'));const foot=el('div',undefined,'sh-task-foot');foot.append(button(label,action,primary));c.append(foot);return c;}
 async function refresh(){
  const id=currentUser?.authId;if(!id||isTeacher||!showRoot())return;
  if(loading?.id===id)return loading.promise;
  const token=++generation,job={id,promise:null};loading=job;
  job.promise=(async()=>{
   const results=await Promise.allSettled([window.NTCHomeworkUI.refreshAttention(),window.NTCTopicReviews.refresh(),loadResume(id)]);
   if(!current(id)||generation!==token||!showRoot())return;
   const target=$('shTasks');if(!target)return;target.replaceChildren();const cards=[];
   if(results[0].status==='fulfilled'){
    const data=window.NTCHomeworkUI.homeSnapshot();if(data?.owner===id){
     for(const item of data.items){const w=item.window,s=item.state;if(s.access==='archived'||s.full)continue;const priority=s.redo?0:s.access==='open'?1:s.access==='late'?2:3;const label=s.redo?'Cần làm lại':s.access==='late'?'Quá hạn':s.access==='future'?'Sắp mở':s.access==='closed'?'Đã đóng':s.submitted?'Đang làm':'Cần làm';cards.push({priority,end:s.end,node:taskCard(w.course_code+' · '+w.lesson_name,label,s.end,()=>s.redo||s.access!=='open'?goHomeworkCenter():openCourse(w.lesson_code,w.id),s.redo?'Xem nhận xét':s.access==='open'?'Làm bài':'Xem chi tiết',s.access==='open'&&!s.redo)});}
     for(const a of data.games||[]){if(a.archived||a.archived_at||Number(a.completed_runs||0)>=Number(a.required_runs||1))continue;const now=Date.now(),open=now>=Date.parse(a.opens_at)&&now<=Date.parse(a.closes_at);cards.push({priority:open?1:3,end:Date.parse(a.closes_at),node:taskCard(a.label||'Game được giao',open?'Cần làm':now<Date.parse(a.opens_at)?'Sắp mở':'Quá hạn',a.closes_at,()=>goHomeworkCenter(),'Xem game',false)});}
     if(data.gameError)target.append(el('p','Chưa tải được game được giao. Mở “Bài tập của tôi” để kiểm tra.','sh-empty'));
    }
   }else target.append(el('p','Chưa tải được bài tập.','sh-empty'));
   if(results[1].status==='fulfilled')for(const item of window.NTCTopicReviews.homeSnapshot()||[]){const a=item.assignment,s=item.receipt;if(!s||s.completed_at)continue;const open=a.is_enabled&&item.now>=Date.parse(a.opens_at)&&item.now<=Date.parse(a.closes_at);cards.push({priority:open?1:3,end:Date.parse(a.closes_at),node:taskCard(a.title,item.status,a.closes_at,()=>open?window.NTCTopicReviews.openAssigned(a):goHomeworkCenter(),open?'Ôn tập':'Xem chi tiết',false)});}else target.append(el('p','Chưa tải được chủ đề được giao.','sh-empty'));
   cards.sort((a,b)=>a.priority-b.priority||a.end-b.end).slice(0,3).forEach(c=>target.append(c.node));
   if(!cards.length&&!target.children.length)empty(target,'Hiện không có bài tập cần làm.');
   if(results.slice(0,2).some(r=>r.status==='rejected'))target.append(button('Thử tải lại',()=>refresh()));
  })().catch(()=>{if(current(id)&&$('shTasks'))empty($('shTasks'),'Không tải được bài tập. Vui lòng thử lại.',true);}).finally(()=>{if(loading===job)loading=null;});return job.promise;
 }
 async function loadResume(id){const box=$('shResume');if(box)box.hidden=true;const r=await sb.from('learning_sessions').select('lesson_file,section_name,last_active_at,started_at').eq('user_id',id).order('started_at',{ascending:false}).limit(20);if(!current(id)||!showRoot())return;if(r.error){if(box){box.hidden=false;empty(box,'Chưa tải được bài học gần nhất.');}return;}
  const visible=getVisibleCourses(),session=(r.data||[]).find(s=>visible.some(c=>c.file===s.lesson_file)),course=session&&visible.find(c=>c.file===session.lesson_file);if(!course||!box)return;
  box.replaceChildren(heading('Tiếp tục học'));const card=el('div',undefined,'sh-resume'),icon=el('span',undefined,'sh-book');icon.innerHTML=book;const text=el('div');text.append(el('h3',(course.group||course.desc||'')+' · '+course.title));if(session.section_name)text.append(el('p',session.section_name));card.append(icon,text,button('Tiếp tục học →',()=>openCourse(course.id),true));box.append(card);box.hidden=false;
 }
 const enter=enterApp;enterApp=function(...args){const result=enter.apply(this,args);syncTheme();return result;};
 const logout=doLogout;doLogout=async function(...args){generation++;owner=null;loading=null;host.replaceChildren();host.hidden=true;view.classList.remove('sh-root');syncTheme();return await logout.apply(this,args);};
 new MutationObserver(syncTheme).observe(view,{attributes:true,attributeFilter:['style']});
 window.addEventListener('focus',()=>{clearTimeout(refreshTimer);if(showRoot())refreshTimer=setTimeout(()=>refresh(),250);});
 window.NTCStudentHome={refresh};
 if(currentUser?.authId&&!isTeacher&&view.style.display!=='none')renderHomePicker();
})();
