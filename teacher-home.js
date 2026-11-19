(()=>{'use strict';
 const $=id=>document.getElementById(id),view=$('teacherDashboardView'),wrap=view.querySelector('.teacher-dashboard-wrap');
 let host=null,details=null,owner=null,data=null,loading=null,sequence=0,selected='pending',classCode='',expanded=false;
 const labels={pending:'Chờ chấm',redo:'Cần làm lại',late:'Quá hạn',approvals:'Chờ duyệt'};
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 function button(label,fn,cls=''){const b=el('button',label,'th-btn '+cls);b.type='button';b.onclick=fn;return b;}
 function teacher(id=currentUser?.authId){return !!id&&isTeacher&&currentUser?.authId===id;}
 function sync(){document.body.classList.toggle('ntc-teacher-ui',teacher());}
 async function center(tab='grading',filter='all',search=''){
  if(!teacher())return;const S=window.NTCHomeworkUI.state;S.search=search;S.filter=filter;S.course='all';homeworkTeacherTab=tab;
  document.querySelectorAll('[data-homework-tab]').forEach(b=>b.classList.toggle('active',b.dataset.homeworkTab===tab));
  await goHomeworkCenter();
 }
 async function openEntry(e){if(!teacher())return;
  if(e.kind==='approval'){await goStudentAccounts();return;}
  if(e.kind==='daily'){await monitor();$('dailyWritingGradingCard').scrollIntoView({block:'start',behavior:'smooth'});return;}
  if(e.kind==='topic'){await center('topics');return;}
  if(e.status==='Chờ chấm'&&e.kind==='homework'){await center('grading');await window.NTCHomeworkUI.openGrading(e.person.user_id,e.window.id);return;}
  await center('windows',e.status==='Cần làm lại'?'redo':e.status==='Quá hạn'?'late':'all',e.person.full_name||'');
 }
 async function monitor(){if(!teacher())return;await goTeacherDashboard();details.open=true;details.scrollIntoView({block:'start',behavior:'smooth'});}
 function ensure(){
  if(host)return;
  host=el('section',undefined,'th-home');host.id='ntcTeacherHome';
  details=el('details',undefined,'th-monitor');details.id='ntcTeacherMonitor';details.append(el('summary','Giám sát học tập & công cụ hiện có'));
  const content=el('div',undefined,'th-monitor-body');for(const child of [...wrap.children])content.append(child);details.append(content);wrap.append(host,details);
 }
 async function pages(table,columns,configure=q=>q){const rows=[];for(let from=0;;from+=500){const r=await configure(sb.from(table).select(columns)).range(from,from+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}}
 async function refresh(){
  const id=currentUser?.authId;if(!teacher(id))return;ensure();sync();if(loading?.id===id)return loading.promise;
  if(owner!==id){owner=id;data=null;selected='pending';classCode='';expanded=false;host.replaceChildren();}
  const token=++sequence,job={id,promise:null};loading=job;
  if(!data)host.replaceChildren(el('p','Đang tải tổng quan…','th-muted'));
  job.promise=(async()=>{
   const results=await Promise.allSettled([
    pages('profiles','user_id,full_name,class_code,email,approval_status',q=>q.eq('account_type','student').order('user_id')),
    pages('homework_windows','*',q=>q.order('id')),
    pages('homework_submissions','id,window_id,user_id,status,submitted_at,submission_kind,part_key,attempt_number',q=>q.order('id')),
    pages('homework_student_overrides','*',q=>q.order('window_id').order('user_id')),
    pages('daily_activity_writings','id,user_id,student_name,class_code,status,teacher_hidden,created_at',q=>q.eq('teacher_hidden',false).order('id')),
    window.NTCTopicReviews.refresh(),
    (async()=>{const {data:t}=await sb.from('teachers').select('slug').eq('auth_user_id',id).maybeSingle();if(!t?.slug)return[];const {data:c}=await sb.rpc('ntc_get_teacher_classes',{p_slug:t.slug});return (c||[]).map(x=>x.code);})()
   ]);
   if(!teacher(id)||owner!==id||token!==sequence)return;
   const critical=results.slice(0,4).find(r=>r.status==='rejected');if(critical)throw critical.reason;
   data={profiles:results[0].value,windows:results[1].value,rows:results[2].value,overrides:results[3].value,daily:results[4].status==='fulfilled'?results[4].value:[],topics:results[5].status==='fulfilled'?results[5].value:[],classList:results[6].status==='fulfilled'?results[6].value:[],warnings:[]};
   if(results[4].status==='rejected')data.warnings.push('Chưa tải được bài viết theo chủ đề. Số chờ chấm chưa bao gồm phần này.');
   if(results[5].status==='rejected')data.warnings.push('Chưa tải được ôn tập chủ đề. Số quá hạn chưa bao gồm phần này.');
   paint();
  })().catch(error=>{if(!teacher(id)||token!==sequence)return;data=null;host.replaceChildren(el('h1','Tổng quan'),el('p','Không tải được tổng quan: '+(error.message||'Vui lòng thử lại.'),'th-error'),button('Thử lại',refresh));}).finally(()=>{if(loading===job)loading=null;});return job.promise;
 }
 function panel(title){const p=el('section',undefined,'th-panel');p.append(el('h2',title));return p;}
 function paint(){if(!teacher()||!data)return;ensure();host.replaceChildren();const model=window.NTCTeacherHomeModel.summary(data,classCode);
  const top=el('div',undefined,'th-heading');top.append(el('h1','Tổng quan'),button('Làm mới',refresh));host.append(top);
  const stats=el('div',undefined,'th-stats');for(const key of ['pending','redo','late','approvals']){const b=button('',()=>{selected=key;expanded=false;paint();},'th-stat '+key+(selected===key?' selected':''));b.append(el('span',labels[key]),el('strong',String(model[key].length)));b.setAttribute('aria-pressed',String(selected===key));if(key==='late')b.title='Bài tập và ôn tập chủ đề quá hạn; game xem tại mục Giao game.';stats.append(b);}host.append(stats);
  const actions=el('div',undefined,'th-actions');actions.append(button('Giao bài',()=>center('setup'),'primary'),button('Quản lý lớp',()=>center('windows')),button('Học sinh',()=>goStudentAccounts()),button('Giám sát học tập',monitor));host.append(actions);
  for(const msg of data.warnings)host.append(el('p',msg,'th-error'));
  const tablePanel=panel(selected==='pending'?'Bài chờ chấm':labels[selected]),tools=el('div',undefined,'th-table-tools'),filter=el('select');filter.setAttribute('aria-label','Lọc lớp');const all=el('option','Tất cả lớp');all.value='';filter.append(all);for(const [code]of model.classes){const o=el('option',code);o.value=code;filter.append(o);}filter.value=classCode;filter.onchange=()=>{classCode=filter.value;expanded=false;paint();};tools.append(filter,button(expanded?'Thu gọn':'Xem tất cả',()=>{expanded=!expanded;paint();},'link'));tablePanel.append(tools);
  const scroll=el('div',undefined,'th-table-scroll'),table=el('table'),thead=el('thead'),hr=el('tr');for(const label of ['Học sinh','Lớp','Bài tập',selected==='pending'?'Đã nộp':'Hạn','Trạng thái',''])hr.append(el('th',label));thead.append(hr);const tbody=el('tbody'),rows=model[selected];
  for(const entry of (expanded?rows:rows.slice(0,5))){const tr=el('tr');tr.append(el('td',entry.person.full_name||'Học sinh'),el('td',entry.person.class_code||'—'),el('td',entry.title),el('td',entry.at?homeworkDate(entry.at):'—'));const st=el('td');st.append(el('span',entry.status,'th-badge '+selected));const act=el('td');act.append(button(entry.kind==='approval'?'Xem tài khoản':selected==='pending'?'Chấm bài':'Xem bài',()=>openEntry(entry),'small'));tr.append(st,act);tbody.append(tr);}table.append(thead,tbody);scroll.append(table);tablePanel.append(scroll);if(!rows.length)tablePanel.append(el('p','Không có mục trong nhóm này.','th-muted'));host.append(tablePanel);
  const bottom=el('div',undefined,'th-bottom'),attention=panel('Cần chú ý');
  for(const entry of [...model.redo,...model.late,...model.approvals].slice(0,4)){const b=button('',()=>openEntry(entry),'th-row');b.append(el('span',entry.person.full_name||'Học sinh'),el('span',entry.status,'th-badge '+(entry.kind==='approval'?'approvals':entry.status==='Quá hạn'?'late':'redo')));attention.append(b);}if(attention.children.length===1)attention.append(el('p','Chưa có mục cần chú ý.','th-muted'));
  const classes=panel('Lớp học');for(const [code,count]of model.classes.slice(0,6)){const b=button('',()=>center('windows','all',code),'th-row');b.append(el('strong',code),el('span',count+' học sinh →','th-muted'));classes.append(b);}if(!model.classes.length)classes.append(el('p','Chưa có lớp được duyệt.','th-muted'));bottom.append(attention,classes);host.append(bottom);
 }
 const originalLoad=loadTeacherDashboard;loadTeacherDashboard=async function(...args){const result=await originalLoad.apply(this,args);if(teacher()){ensure();refresh();}return result;};
 const enter=enterApp;enterApp=function(...args){const r=enter.apply(this,args);sync();return r;};
 const logout=doLogout;doLogout=async function(...args){sequence++;owner=null;data=null;loading=null;if(host)host.replaceChildren();const r=await logout.apply(this,args);sync();return r;};
 window.NTCTeacherHome={refresh};sync();if(teacher()&&view.style.display!=='none')refresh();
})();
