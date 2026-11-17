/* Language switch for the outer navigation only; lesson content is unchanged. */
(()=>{'use strict';
 const key='ntc-outer-ui-language',originals=new WeakMap();let language='vi',queued=false;
 try{language=localStorage.getItem(key)==='zh'?'zh':'vi';}catch{}
 const dictionary={
  'HSK6上 và HSK6下':'HSK6上、HSK6下','Trang chính':'主菜单','Trang chủ':'首页','Khoá học':'课程','Khóa học':'课程','Giám sát học sinh':'学生学习管理','Thông báo':'通知','Bài tập của tôi':'我的作业','Giao bài tập':'布置作业','Giao bài / Chấm bài':'布置与批改作业','Giao bài & Chấm bài':'布置与批改作业','Bài chờ chấm':'待批改作业','Kỷ lục học tập':'学习记录','Đăng xuất':'退出登录','Quay lại':'返回','Chọn game':'选择游戏','Game Center':'游戏中心','Chủ đề':'主题','Shadowing':'跟读练习','Ôn tập':'复习','Sách bài tập':'练习册','Ôn tập và sách bài tập':'复习与练习册','Luyện tập theo chủ đề':'主题练习','Luyện nghe và phát âm':'听力与发音练习','Luyện nhớ chữ Hán':'汉字记忆练习','Mắt Thần Hán Tự':'汉字识别','Giải Mã Hán Tự':'汉字解码','Đua xe từ vựng':'词汇赛车','Nghiêng đầu chọn từ':'歪头选词','Luyện nhận diện chữ Hán':'汉字识别练习','Luyện ghi nhớ chữ Hán':'汉字记忆练习','HSK1–6 · Chọn chữ Hán':'HSK1–6 · 选择汉字','HSK1–6 · Camera và filter':'HSK1–6 · 摄像头与滤镜','Trạng thái gửi bài':'作业提交状态'
 };
 function chinese(value){
  if(dictionary[value])return dictionary[value];
  if(/^Ôn tập HSK[1-6][上下]?$/.test(value))return value.replace('Ôn tập ','')+' 复习';
  if(/^Sách (?:BT|bài tập) HSK[1-6][上下]?$/.test(value))return value.replace(/^Sách (?:BT|bài tập) /,'')+' 练习册';
  if(/^Bài \d+(?:–\d+)?$/.test(value))return '第 '+value.slice(4)+' 课';
  if(/^\d+ bài$/.test(value))return value.replace(' bài',' 课');
  if(value.includes(' · '))return value.split(' · ').map(chinese).join(' · ');
  if(value.includes(' › '))return value.split(' › ').map(chinese).join(' › ');
  if(/^(?:←|⬅|↩|🏆|📥|📤|📢)\s+/.test(value)){const prefix=value.match(/^(?:←|⬅|↩|🏆|📥|📤|📢)\s+/)[0];return prefix+chinese(value.slice(prefix.length));}
  return value;
 }
 const scopes='#sidebar .sidebar-item,#sidebar .sidebar-group-toggle,#sidebar .sidebar-section-title,#homePicker .home-choice h4,#homePicker .home-choice p,#homePickerPath,#homePickerBack,#contentBack,#lessonHomeworkToggle,#topbar .btn-logout';
 function apply(){
  queued=false;
  for(const el of document.querySelectorAll(scopes)){
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
   while((node=walker.nextNode())){
    const old=originals.get(node),source=old&&node.nodeValue===old.last?old.source:node.nodeValue;
    const value=source.trim(),translated=language==='zh'?chinese(value):value;
    const next=source.replace(value,translated);originals.set(node,{source,last:next});if(node.nodeValue!==next)node.nodeValue=next;
   }
  }
  const button=document.getElementById('ntcOuterLanguage');
  if(button){if(button.textContent!=='Việt / 中文')button.textContent='Việt / 中文';button.setAttribute('aria-label',language==='vi'?'Chuyển menu sang tiếng Trung':'将菜单切换为越南语');button.setAttribute('aria-pressed',String(language==='zh'));button.title=language==='vi'?'Tiếng Việt · Bấm để đổi sang 中文':'中文 · 点击切换为 Tiếng Việt';}
  document.documentElement.lang=language==='zh'?'zh-CN':'vi';
 }
 function schedule(){if(!queued){queued=true;queueMicrotask(apply);}}
 document.getElementById('ntcOuterLanguage')?.addEventListener('click',()=>{language=language==='vi'?'zh':'vi';try{localStorage.setItem(key,language);}catch{}apply();});
 const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 addEventListener('storage',event=>{if(event.key===key){language=event.newValue==='zh'?'zh':'vi';apply();}});
 addEventListener('pagehide',()=>observer.disconnect(),{once:true});apply();
})();
