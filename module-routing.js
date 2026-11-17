/* Route the existing LMS through the nine deployed study modules.
   Course IDs, the Supabase client, grading and submission adapters are retained. */
(function(){
 'use strict';
 const modules=window.NTC_STUDY_MODULES||[];
 const gameKeys={'game-mat-than':'mat-than','game-giai-ma':'giai-ma','game-dua-xe':'dua-xe','game-nghieng-dau':'nghieng-dau'};
 const $=id=>document.getElementById(id);
 const moduleFor=category=>modules.find(m=>m.category===category||m.id===category);
 const owns=(m,id)=>m.courseIds.includes(id);
 // One vertical picker for HSK1–6; lesson and assignment identities stay unchanged.
 let lessonPicker=null,selectionToken=0;
 const legacyHsk4Lessons=[{"number":1,"title":"第一课 · 简单的爱情","subtitle":"Bài 1 · Tình yêu đơn giản","index":0},{"number":2,"title":"第二课 · 真正的朋友","subtitle":"Bài 2 · Người bạn chân chính","index":1},{"number":3,"title":"第三课 · 经理对我印象不错","subtitle":"Bài 3 · Giám đốc có ấn tượng tốt về tôi","index":2},{"number":4,"title":"第四课 · 不要太着急赚钱","subtitle":"Bài 4 · Đừng quá nôn nóng kiếm tiền","index":3},{"number":5,"title":"第五课 · 只买对的，不买贵的","subtitle":"Bài 5 · Chỉ mua đồ đúng, không mua đồ đắt","index":4},{"number":6,"title":"第六课 · 一分钱一分货","subtitle":"Bài 6 · Tiền nào của nấy","index":5},{"number":7,"title":"第七课 · 最好的医生是自己","subtitle":"Bài 7 · Bác sĩ tốt nhất là bản thân","index":6},{"number":8,"title":"第八课 · 生活中不缺少美","subtitle":"Bài 8 · Cuộc sống không thiếu cái đẹp","index":7},{"number":9,"title":"第九课 · 阳光总在风雨后","subtitle":"Bài 9 · Sau cơn mưa trời lại sáng","index":8},{"number":10,"title":"第十课 · 幸福的标准","subtitle":"Bài 10 · Tiêu chuẩn của hạnh phúc","index":9},{"number":11,"title":"第十一课 · 阅读的好处","subtitle":"Bài 11 · Lợi ích của việc đọc sách","index":10},{"number":12,"title":"第十二课 · 用心发现世界","subtitle":"Bài 12 · Dùng tâm để khám phá thế giới","index":11},{"number":13,"title":"第十三课 · 喝着茶看京剧","subtitle":"Bài 13 · Vừa uống trà vừa xem kinh kịch","index":12},{"number":14,"title":"第十四课 · 保护环境从我做起","subtitle":"Bài 14 · Bảo vệ môi trường bắt đầu từ tôi","index":13},{"number":15,"title":"第十五课 · 教育孩子的艺术","subtitle":"Bài 15 · Nghệ thuật giáo dục con cái","index":14},{"number":16,"title":"第十六课 · 生活可以更美好","subtitle":"Bài 16 · Cuộc sống có thể tốt đẹp hơn","index":15},{"number":17,"title":"第十七课 · 人与自然","subtitle":"Bài 17 · Con người và tự nhiên","index":16},{"number":18,"title":"第十八课 · 科技与世界","subtitle":"Bài 18 · Khoa học công nghệ và thế giới","index":17},{"number":19,"title":"第十九课 · 生活的味道","subtitle":"Bài 19 · Hương vị cuộc sống","index":18},{"number":20,"title":"第二十课 · 路上的风景","subtitle":"Bài 20 · Phong cảnh trên đường","index":19}];
 const hsk430Lessons=[{"path": "thuong/bai-01.html", "title": "Bài 1 · 我们来中国学习了", "number": 1}, {"path": "thuong/bai-02.html", "title": "Bài 2 · 租到了合适的房子", "number": 2}, {"path": "thuong/bai-03.html", "title": "Bài 3 · 手机扫一下", "number": 3}, {"path": "thuong/bai-04.html", "title": "Bài 4 · 很高兴能帮到你", "number": 4}, {"path": "thuong/bai-05.html", "title": "Bài 5 · “不怕辣”和“怕不辣”", "number": 5}, {"path": "thuong/bai-06.html", "title": "Bài 6 · 我陪你去看病", "number": 6}, {"path": "thuong/bai-07.html", "title": "Bài 7 · 在工作中学习", "number": 7}, {"path": "thuong/bai-08.html", "title": "Bài 8 · 该放松时就放松", "number": 8}, {"path": "thuong/bai-09.html", "title": "Bài 9 · 遇见你，刚刚好", "number": 9}, {"path": "thuong/bai-10.html", "title": "Bài 10 · 南方不懂北方的冷", "number": 10}, {"path": "ha/bai-11.html", "title": "Bài 11 · 活到老学到老", "number": 11}, {"path": "ha/bai-12.html", "title": "Bài 12 · 幸福的家庭", "number": 12}, {"path": "ha/bai-13.html", "title": "Bài 13 · 美好的日子", "number": 13}, {"path": "ha/bai-14.html", "title": "Bài 14 · 合适才买", "number": 14}, {"path": "ha/bai-15.html", "title": "Bài 15 · 我去应聘了", "number": 15}, {"path": "ha/bai-16.html", "title": "Bài 16 · 计划赶不上变化", "number": 16}, {"path": "ha/bai-17.html", "title": "Bài 17 · 运动让我更健康", "number": 17}, {"path": "ha/bai-18.html", "title": "Bài 18 · 科技改变生活", "number": 18}, {"path": "ha/bai-19.html", "title": "Bài 19 · 他们都很棒", "number": 19}, {"path": "ha/bai-20.html", "title": "Bài 20 · 看不完也读不完", "number": 20}];
 const updatedLessonTitles={"1":{"1":"AI小语，你好！","2":"我叫李文！","3":"我是中国人","4":"我有两个孩子","5":"今天我休息","6":"你的手机号是多少？","7":"我晚上六点半下班","8":"我爸爸也在医院工作","9":"我明天上午在学校学习","10":"这儿的苹果真便宜！","11":"我读大学呢！","12":"昨天下雪了！","13":"请给我一杯茶！","14":"我看了一个电影","15":"大兴机场见"},"2":{"1":"她请我们吃了北京烤鸭","2":"还是打车去北大吧","3":"我想去西安旅游","4":"你穿红色的很好看","5":"第一次去中国朋友家","6":"小雪，生日快乐！","7":"他篮球打得很好","8":"虽然你忘了，但是我记得","9":"我去买杯奶茶","10":"就要考试了","11":"我最喜欢吃中国菜","12":"这里比北京冷多了","13":"我们爱上中文课","14":"一个人过年多没意思啊","15":"我想再去一次中国"},"3":{"1":"我们去机场接你们","2":"你们想吃什么就点什么","3":"这个小区挺好的","4":"这家宾馆跟别的都不一样","5":"这样的照片才好看","6":"高铁上还可以点外卖","7":"那条裙子比短裤更好看","8":"今天我出院了","9":"打不好没关系","10":"你明天再把书还给我","11":"看来我没办法解决这个问题","12":"这个季节天气变化很快","13":"我的新邻居来自英国","14":"这本书被别人借走了","15":"我是半个南京人","16":"我听说有的熊猫出国了","17":"我要多向认真的人学习","18":"我学会了包饺子"}};
 const originalGoHomeForHsk79=goHome;
 goHome=async function(...args){setHsk79FocusMode(false);return originalGoHomeForHsk79(...args);};
 const originalRenderHomePicker=renderHomePicker;
 const originalOpenCourse=openCourse;
 const originalReturnFromContent=returnFromContent;
 const isBook=c=>/sách|sbt|sach|bài tập|bai tap/i.test((c.group||'')+' '+(c.desc||'')+' '+c.id);
 const number=c=>c._innerLesson||Number(c.id.match(/\d+$/)?.[0]||c.title.match(/(?:bài|第)\s*(\d+)/i)?.[1]||0);
 const kindOf=c=>isBook(c)?'book':'review';

 function resetHsk79Focus(){
  setHsk79FocusMode(false);
 }
 function choices(category,kind){const courses=homeCategoryCourses(category).filter(c=>kindOf(c)===kind);if(category==='HSK4'&&kind==='review'){const legacy=courses.find(c=>c.id==='hsk4');if(legacy)return legacyHsk4Lessons.map(l=>({...legacy,_innerLesson:l.number,_navId:'hsk4:lesson:'+l.number,title:'Bài '+l.number+' · '+l.title.replace(/^[^·]*·\s*/,'' )}));}return courses.sort((a,b)=>number(a)-number(b)||a.title.localeCompare(b.title,'vi',{numeric:true}));}
 function groupKey(group){if(!group)return null;if(group==='book'||/^book-|sách|sach/i.test(group))return 'book';if(group==='review'||/^review-|ôn|on /i.test(group))return 'review';return null;}
 function fold(label,cls){const d=document.createElement('details'),summary=document.createElement('summary');d.className=cls;summary.textContent=label;d.append(summary);return d;}
 function lessonRows(parent,list,category,kind,volume){
  const rows=document.createElement('div');rows.className='ntc-course-rows';
  for(const course of list){const b=document.createElement('button');b.type='button';b.className='ntc-course-row';b.dataset.courseId=course._navId||course.id;const level=category.match(/HSK([123])$/)?.[1],n=number(course),name=updatedLessonTitles[level]?.[n];let label=name?'Bài '+n+' · '+name:course.title;if(!name&&/^Bài\s*\d+\s*$/i.test(label)){if(category==='HSK4'&&kind==='book'){const legacy=legacyHsk4Lessons.find(l=>l.number===n);if(legacy)label='Bài '+n+' · '+legacy.title.replace(/^[^·]*·\s*/,'');}else if(/^HSK[56]$/.test(category)){const review=choices(category,'review').find(c=>number(c)===n);if(review)label=review.title;}}b.textContent=label;
   b.onclick=async()=>{lessonPicker={category,group:kind,volume,selected:course._navId||course.id,innerLesson:course._innerLesson||null};parent.open=false;await openCourse(course.id,null,course._innerLesson||null);};rows.append(b);}
  parent.append(rows);
 }
 renderHomePicker=function(category=null,group=null){
  if(!/^HSK[1-6]$/.test(category||'')){lessonPicker=null;return originalRenderHomePicker(category,group);}
  const previous=lessonPicker,kind=groupKey(group),level=Number(category.slice(3));
  const volume=previous?.category===category&&previous?.group===kind?previous.volume:(group?.endsWith('-ha')?'ha':group?.endsWith('-thuong')?'thuong':null);
  lessonPicker={category,group:kind,volume,selected:previous?.category===category?previous.selected:null};
  const host=$('homePicker');host.replaceChildren();
  $('homePickerPath').textContent='Trang chủ › '+category;
  const back=$('homePickerBack');back.hidden=false;back.textContent='← Trang chủ';back.onclick=()=>goHome();
  const list=document.createElement('div');list.className='ntc-course-accordion';host.append(list);
  for(const [key,label]of[['review','Ôn tập'],['book','Sách bài tập']]){
   const courses=choices(category,key);if(!courses.length)continue;
   const d=fold(category==='HSK4'?(key==='review'?'Ôn tập HSK4(2.0)':'Sách bài tập HSK4(3.0)'):label,'ntc-course-group');d.open=kind===key;list.append(d);
   d.addEventListener('toggle',()=>{if(d.isConnected&&d.open){for(const other of list.children)if(other!==d)other.open=false;lessonPicker={...lessonPicker,category,group:key};}});
   if(level>=5){const split=level===5?18:20;
    for(const [v,title,items]of[['thuong',category+' 上',courses.filter(c=>number(c)<=split)],['ha',category+' 下',courses.filter(c=>number(c)>split)]]){
     if(!items.length)continue;const sub=fold(title,'ntc-course-volume');sub.open=kind===key&&volume===v;
     sub.addEventListener('toggle',()=>{if(sub.isConnected&&sub.open){for(const other of d.querySelectorAll('.ntc-course-volume'))if(other!==sub)other.open=false;lessonPicker={...lessonPicker,category,group:key,volume:v};}});
     lessonRows(sub,items,category,key,v);d.append(sub);
    }
   }else lessonRows(d,courses,category,key,null);
  }
  if(category==='HSK4'){
   const edition=fold('Ôn tập HSK4(3.0)','ntc-course-group');edition.open=group==='hsk4-30';list.append(edition);
   for(const [volume,label] of [['thuong','Ôn tập HSK4(3.0) 上'],['ha','Ôn tập HSK4(3.0) 下']]){
    const sub=fold(label,'ntc-course-volume');sub.open=group==='hsk4-30'&&previous?.volume===volume;
    const rows=document.createElement('div');rows.className='ntc-course-rows';
    for(const lesson of hsk430Lessons.filter(l=>l.path.startsWith(volume+'/'))){
     const b=document.createElement('button');b.type='button';b.className='ntc-course-row';b.textContent=lesson.title;b.dataset.courseId='hsk4-30:lesson:'+lesson.number;
     b.onclick=()=>openHsk430(lesson);rows.append(b);
    }
    sub.append(rows);edition.append(sub);
    sub.addEventListener('toggle',()=>{if(sub.isConnected&&sub.open){for(const other of edition.querySelectorAll('.ntc-course-volume'))if(other!==sub)other.open=false;lessonPicker={...lessonPicker,category,group:'hsk4-30',volume};}});
   }
   edition.addEventListener('toggle',()=>{if(edition.isConnected&&edition.open){for(const other of list.children)if(other!==edition)other.open=false;lessonPicker={...lessonPicker,category,group:'hsk4-30'};}});
  }
  if(!list.children.length){const p=document.createElement('p');p.textContent='Chưa có bài học dành cho lớp của bạn trong mục này.';host.append(p);}
  setActiveSidebar('module-hsk'+level);
 };
 openCourse=async function(id,windowId=null,innerLesson=null){
  const token=++selectionToken;
  const match=String(id).match(/^hsk([1-6])(?:-|$)/i),course=getVisibleCourses().find(c=>c.id===id);
  if(match&&course){const level=Number(match[1]),n=number(course);lessonPicker={category:'HSK'+level,group:kindOf(course),volume:level>=5?(n<=(level===5?18:20)?'thuong':'ha'):null,selected:innerLesson?'hsk4:lesson:'+innerLesson:id,innerLesson};}
  else lessonPicker=null;
  if(id==='hsk4'&&innerLesson){
   const item=legacyHsk4Lessons.find(l=>l.number===Number(innerLesson)),frame=$('contentFrame');
   if(item&&frame){const select=()=>{if(token!==selectionToken){frame.removeEventListener('load',select);return;}try{const url=new URL(frame.getAttribute('src')||'',location.href);if(url.origin===location.origin&&url.pathname==='/hsk4/hsk4-ontap.html'&&typeof frame.contentWindow.switchLesson==='function'){frame.contentWindow.switchLesson(item.index);frame.removeEventListener('load',select);}}catch(e){console.warn('Không chọn được bài HSK4:',e.message);}};frame.addEventListener('load',select);}
  }
  await originalOpenCourse(id,windowId);
  resetHsk79Focus();
  if(match&&course)$('contentBack').textContent='← Danh sách bài';
 };
 returnFromContent=async function(){
  const saved=lessonPicker;if(!saved){resetHsk79Focus();return originalReturnFromContent();}
  await goHome();resetHsk79Focus();lessonPicker=saved;renderHomePicker(saved.category,saved.group);
  const selected=[...$('homePicker').querySelectorAll('[data-course-id]')].find(b=>b.dataset.courseId===saved.selected);
  if(selected){selected.focus({preventScroll:true});selected.scrollIntoView({block:'nearest'});}
 };

 async function openHsk430(lesson){
  if(!hsk430Lessons.includes(lesson))return;
  ++selectionToken;lessonPicker={category:'HSK4',group:'hsk4-30',volume:lesson.path.split('/')[0],selected:'hsk4-30:lesson:'+lesson.number};
  setGameFocusMode(false);setLessonFocusMode(false);resetHsk79Focus();closeSidebar();stopTeacherDashboardRefresh();
  if(!isTeacher)await finishActiveLearningSession();
  resetHomeworkRecording();activeHomeworkCourse=null;activeHomeworkWindow=null;activeHomeworkOverride=null;activeHomeworkSubmissions=[];
  hideAllViews();$('iframeView').style.display='flex';$('iframeTitle').textContent='Ôn tập HSK4(3.0) · '+lesson.title;$('contentBack').textContent='← HSK4';
  $('lessonHomeworkToggle').style.display='none';$('lessonHomeworkPanel').classList.remove('open');$('iframeView').classList.remove('drawer-open');
  const frame=$('contentFrame');frame.onload=null;frame.src=new URL(lesson.path,'https://ngocthucac-hsk4-30.vercel.app/').href;setActiveSidebar('module-hsk4');
 }

 const originalSetActiveSidebar=setActiveSidebar;
 setActiveSidebar=function(page){
  const id=String(page||'').startsWith('course-')?String(page).slice(7):'';
  const m=modules.find(x=>owns(x,id));
  originalSetActiveSidebar(m?'module-'+m.id:String(page||'').startsWith('game-center-')?'module-game':page);
 };
 function allowedModules(){
  const visible=getVisibleCourses();
  return modules.filter(m=>m.id==='game'||m.id==='hsk79'||visible.some(c=>owns(m,c.id)));
 }
 window.openStudyModule=async function(category){
  const m=moduleFor(category);if(!m||!currentUser)return;
  if(!allowedModules().includes(m)){alert('Chưa có bài học dành cho lớp của bạn trong mục này.');return;}
  if(/^hsk[1-6]$/.test(m.id)){await goHome();renderHomePicker(m.category);return;}
  if(m.id==='shadowing'){await openCourse('shadowing');return;}
  setGameFocusMode(false);setLessonFocusMode(false);resetHsk79Focus();closeSidebar();stopTeacherDashboardRefresh();
  if(!isTeacher)await finishActiveLearningSession();
  hideAllViews();$('iframeView').style.display='flex';$('iframeTitle').textContent=m.icon+' '+m.title;
  $('contentBack').textContent=m.id==='hsk79'?'← Trang chủ NGỌC THƯ CÁC':'← Trang tổng';$('lessonHomeworkToggle').style.display='none';$('lessonHomeworkPanel').classList.remove('open');$('iframeView').classList.remove('drawer-open');
  const frame=$('contentFrame');frame.onload=function(){
   try{frame.contentDocument?.querySelectorAll('a.main-link').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();goHome();}));}catch(e){}
  };
  // HSK7–9 is hosted on its own origin; use its absolute URL rather than a rewrite path.
  // We cannot inspect or edit controls inside that cross-origin iframe from this page.
  frame.src=m.id==='hsk79'?new URL('/index.html',m.url).href:m.mount+'/index.html';
  if(m.id==='hsk79'){setLessonFocusMode(true);setHsk79FocusMode(true);}
  setActiveSidebar('module-'+m.id);
 };
 // The sidebar selects a level; each module supplies its own lesson picker.
 renderCourseNav=function(){
  if(!currentUser)return;
  const nav=$('courseNav');nav.replaceChildren();
  for(const m of allowedModules()){
   const b=document.createElement('button');b.type='button';b.className='sidebar-item';b.dataset.page='module-'+m.id;
   const icon=document.createElement('div');icon.className='icon';icon.textContent=m.icon;
   const text=document.createElement('span');text.textContent=m.title;b.append(icon,text);b.addEventListener('click',()=>openStudyModule(m.id));nav.append(b);
  }
  // Retain the existing nodes for the game adapter without a duplicate menu.
  if($('gameCenterToggle'))$('gameCenterToggle').style.display='none';
  if($('gameCenterChildren'))$('gameCenterChildren').style.display='none';
 };
 window.addEventListener('message',async event=>{
  const frame=$('contentFrame');if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||!currentUser)return;
  const data=event.data||{};if(!['ntcModuleHome','ntcModuleOpenCourse'].includes(data.type))return;
  const m=modules.find(x=>x.id===data.module);if(!m)return;
  let path;try{path=new URL(frame.getAttribute('src')||'',location.href).pathname;}catch(e){return;}
  if(path!==m.mount+'/index.html'&&path!==m.mount+'/')return;
  if(data.type==='ntcModuleHome'){resetHsk79Focus();await goHome();return;}
  const id=String(data.courseId||'');if(!owns(m,id))return;
  if(m.id==='game'&&gameKeys[id]){await openGameCenter(gameKeys[id]);return;}
  const course=getVisibleCourses().find(c=>c.id===id);if(!course)return;
  await openCourse(course.id);
 });
 if(typeof currentUser!=='undefined'&&currentUser)renderCourseNav();
})();
