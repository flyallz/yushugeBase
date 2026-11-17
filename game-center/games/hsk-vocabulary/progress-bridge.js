'use strict';
(()=>{
 const requests=new Map(),contexts=new Map();let active=null,restoreNext=null,starting=false,restoring=false,syncing=null,saveTimer=0,lastCapture=0,bootedOwner='';const cloudPending=new Set();
 const clone=v=>JSON.parse(JSON.stringify(v));
 const wordKey=w=>JSON.stringify([w.hanzi,w.pinyin,w.meaning]);
 const storagePrefix='ntc-vocabulary-progress-v2:';
 const $p=id=>document.getElementById(id);
 const integrated=()=>window.parent!==window&&integratedUser?.studentId&&!integratedUser.isTeacher;
 function note(text){let box=$p('progressSaveStatus');if(!box){box=document.createElement('p');box.id='progressSaveStatus';box.className='muted';box.setAttribute('role','status');box.style.cssText='margin:6px 0;font-size:13px';$p('progressNote').after(box);}box.textContent=text;}
 function rpc(operation,params={}){
  if(!integrated())return Promise.reject(Error('Chưa nhận được tài khoản học sinh.'));
  const request_id=crypto.randomUUID(),student_id=integratedUser.studentId;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(request_id);reject(Error('Chưa kết nối được máy chủ.'));},12000);requests.set(request_id,{resolve,reject,timer,owner:student_id});parent.postMessage({type:'vocabulary-progress-request',request_id,student_id,operation,params},location.origin);});
 }
 function scope(n){return {mode,level,unit_key:String(n),difficulty,run_id:assignedGameConfig?.run_id||null};}
 const keyFor=p=>storagePrefix+integratedUser.studentId+':'+(p.run_id?'run:'+p.run_id:[p.mode,p.level,p.unit_key,p.difficulty].join(':'));
 function saveLocal(c){try{localStorage.setItem(c.key,JSON.stringify({scope:c.scope,revision:c.revision,snapshot:c.snapshot,dirty:c.dirty,completed:c.completed}));return true;}catch{note('Trình duyệt không lưu được tiến độ. Hãy giữ trang này đến khi đồng bộ xong.');return false;}}
 function mergeUnlocks(rows){
  if(!profile)return;
  const user=saved.users?.[profile];if(!user)return;
  for(const row of rows||[]){if(row.run_id||!row.completed||!/^\d+$/.test(row.unit_key))continue;const number=Number(row.unit_key),max=HSK_VOCAB[row.level]?.length;if(!max||number<1||number>max)continue;user['HSK'+row.level]||={};user['HSK'+row.level].unlocked=Math.max(user['HSK'+row.level].unlocked||1,number+1);}persist();
 }
 async function boot(){
  if(!integrated()||assignedGameConfig||bootedOwner===integratedUser.studentId)return;
  const owner=integratedUser.studentId;bootedOwner=owner;
  try{const rows=await rpc('list');if(owner!==integratedUser?.studentId)return;mergeUnlocks(rows);cloudPending.clear();for(const row of rows||[])if(!row.run_id&&row.has_checkpoint)cloudPending.add([row.mode,row.level,row.unit_key,row.difficulty].join(':'));
   const last=(rows||[]).find(r=>!r.run_id&&r.mode===mode&&r.has_checkpoint);
   if(last&&!assignedGameConfig&&state==='menu'&&!starting){level=last.level;difficulty=last.difficulty;renderMenu();note('Có lượt đang chơi · Nhấn Tiếp tục để làm tiếp.');}
  }catch{bootedOwner='';note('Tiến độ trên thiết bị vẫn được giữ. Đang chờ kết nối để đồng bộ.');}
 }
 const oldMenu=renderMenu;
 renderMenu=function(){oldMenu();if(!integrated())return;const owner=integratedUser.studentId;
  for(const b of $p('lessons').children){const unit=b.dataset.review||b.querySelector('strong')?.textContent.match(/Bài (\d+)/)?.[1];if(!unit)continue;const p=scope(unit);let local;try{local=JSON.parse(localStorage.getItem(keyFor(p))||'null');}catch{}if(local?.snapshot||cloudPending.has([p.mode,p.level,p.unit_key,p.difficulty].join(':'))){const label=b.querySelector('small');if(label)label.textContent='Tiếp tục lượt đang chơi';}}
 };
 function sourceWords(p){const lessons=HSK_VOCAB[p.level],entry=lessons?.find(l=>String(l.number)===p.unit_key),review=lessons&&HSKReviews.groups(lessons,p.level).find(g=>g.key===p.unit_key);return {entry,review,words:entry?.words||(review?HSKReviews.pool(lessons,review).words:null)};}
 function validate(snapshot,p){
  if(!snapshot||snapshot.version!==1||!['playing','corrections','ready_to_save'].includes(snapshot.phase))throw Error('Bản lưu tiến độ không hợp lệ.');
  const src=sourceWords(p),pool=new Map((src.words||[]).map(w=>[wordKey(w),w]));
  if(!Array.isArray(snapshot.lesson_words)||!snapshot.lesson_words.length||new Set(snapshot.lesson_words).size!==snapshot.lesson_words.length||snapshot.lesson_words.some(k=>!pool.has(k)))throw Error('Dữ liệu từ của bài đã thay đổi. Hãy báo giáo viên trước khi làm lại.');
  const n=snapshot.lesson_words.length,expected=src.entry?.words.length||(src.review?HSKReviews.pool(HSK_VOCAB[p.level],src.review).count:0);if(n!==expected)throw Error('Số từ trong bản lưu không khớp bài học.');const id=v=>Number.isInteger(v)&&v>=0&&v<n;
  if(snapshot.total!==n||!Number.isInteger(snapshot.first_correct)||snapshot.first_correct<0||snapshot.first_correct>n||!Array.isArray(snapshot.queue)||!snapshot.queue.length||snapshot.queue.length>n||snapshot.queue.some(v=>!id(v))||new Set(snapshot.queue).size!==snapshot.queue.length||!Number.isInteger(snapshot.index)||snapshot.index<0||snapshot.index>snapshot.queue.length||!Array.isArray(snapshot.wrong)||snapshot.wrong.some(v=>!id(v))||!Number.isInteger(snapshot.round)||snapshot.round<0||snapshot.round>1000||!Number.isFinite(snapshot.remaining_ms)||snapshot.remaining_ms<0||snapshot.remaining_ms>60000)throw Error('Vị trí hoặc điểm trong bản lưu không hợp lệ.');
  return {...src,selected:snapshot.lesson_words.map(k=>pool.get(k))};
 }
 async function load(p){
  const key=keyFor(p),owner=integratedUser.studentId;let local=null;try{local=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  let cloud=null;try{cloud=await rpc('load',p);}catch(e){if(!local){note('Chưa đồng bộ được. Lượt mới sẽ được lưu trên thiết bị.');}}
  if(owner!==integratedUser?.studentId)throw Error('Tài khoản đã thay đổi.');
  const c={key,owner,scope:p,revision:cloud?.revision??local?.revision??0,snapshot:cloud?.snapshot??null,completed:cloud?.completed??local?.completed??false,dirty:false,seq:0};
  if(local?.snapshot&&(!cloud||local.revision===cloud.revision)&&local.dirty){c.snapshot=local.snapshot;c.dirty=true;}
  else if(!cloud&&local)c.snapshot=local.snapshot;
  else if(local?.dirty&&local.snapshot&&cloud&&local.revision!==cloud.revision){
   const useCloud=confirm('Có tiến độ khác đã lưu cho bài này. Nhấn OK để dùng bản trên máy chủ; nhấn Hủy để giữ lượt đang lưu trên thiết bị này.');
   if(!useCloud){c.snapshot=local.snapshot;c.dirty=true;}
  }
  if(c.snapshot)validate(c.snapshot,p);contexts.set(key,c);saveLocal(c);return c;
 }
 function capture(phase){
  if(!active||restoring||!lesson||active.owner!==integratedUser?.studentId)return;
  const feedback=state==='feedback'&&q?.answered&&q.word.id===queue[index]?.id,position=phase==='ready_to_save'?queue.length:index+(feedback?1:0),finished=phase==='ready_to_save'||position>=queue.length&&!wrong.size;
  const snapshot={version:1,phase:finished?'ready_to_save':round?'corrections':'playing',total:firstTotal,first_correct:firstCorrect,
   lesson_words:lesson.words.map(wordKey),queue:queue.map(w=>w.id),index:position,wrong:[...wrong.keys()],history_wrong:[...historyWrong.keys()],round,
   remaining_ms:state==='calibration'&&restoreNext?restoreNext.remaining:feedback||!q?questionDuration():Math.max(0,remaining),combo,best_combo:bestCombo,review_record:reviewRun?.record||null,
   question:state==='calibration'&&restoreNext?restoreNext.question:!feedback&&position<queue.length&&q&&!q.answered?{word_id:q.word.id,options:q.options.map(o=>wordKey(o))}:null};
  active.snapshot=snapshot;active.dirty=true;active.seq++;saveLocal(active);lastCapture=Date.now();
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(()=>{}),350);
 }
 async function flush(){
  if(!active)return null;
  if(syncing){await syncing;if(active?.dirty)return flush();return active?.revision??null;}
  const c=active;
  if(!c.dirty)return c.revision;
  syncing=(async()=>{
   while(c.dirty&&c.owner===integratedUser?.studentId){
    const snapshot=clone(c.snapshot),seq=c.seq;
    try{const result=await rpc('save',{...c.scope,snapshot,revision:c.revision});
     if(result?.conflict){note('Tiến độ đã được lưu ở nơi khác. Giữ trang này và mở lại bài để chọn bản tiếp tục.');throw Error('Tiến độ đã thay đổi trên thiết bị khác.');}
     c.revision=result.revision;c.dirty=c.seq!==seq;saveLocal(c);note('✓ Đã đồng bộ tiến độ.');
    }catch(e){note('Đã giữ tiến độ trên thiết bị · Chưa đồng bộ: '+e.message);throw e;}
   }
   return c.revision;
  })();
  try{return await syncing;}finally{syncing=null;}
 }
 function restore(s,p){
  const src=validate(s,p);lesson=src.entry||{number:src.review.to,review:src.review,words:src.selected};
  if(src.entry&&s.lesson_words.some((k,i)=>k!==wordKey(src.entry.words[i])))throw Error('Bản lưu không khớp thứ tự từ gốc.');
  if(src.review){lesson.words=src.selected;const validIds=new Set(src.words.map(w=>w.reviewId));if(!s.review_record||!Array.isArray(s.review_record.remaining)||s.review_record.remaining.some(k=>!validIds.has(k)))throw Error('Bản lưu vòng ôn tập không hợp lệ.');reviewRun={record:s.review_record,words:src.selected};}
  const words=lesson.words.map((w,i)=>({...w,id:i}));queue=s.queue.map(i=>words[i]);index=s.index;firstTotal=s.total;firstCorrect=s.first_correct;score=firstCorrect*10;round=s.round;wrong=new Map(s.wrong.map(i=>[i,words[i]]));historyWrong.clear();for(const id of s.history_wrong||[])if(words[id])historyWrong.set(id,words[id]);combo=s.combo||0;bestCombo=s.best_combo||0;remaining=s.remaining_ms;paused=false;
  restoreNext={question:s.question,remaining:s.remaining_ms,words};
 }
 const oldStart=startLesson;
 startLesson=async function(n){
  if(!integrated())return oldStart(n);
  if(starting)return;starting=true;const owner=integratedUser.studentId;
  try{
   if(!useProfile())return;const p=scope(n),src=sourceWords(p);
   if(!src.words)return;
   if(!assignedUnit(n)&&(src.review?unlocked()<=src.review.to:Number(n)>unlocked()))return;
   if(mode==='race'&&!$p('studied').checked){note('Hãy đánh dấu đã học từ vựng trước khi chơi.');return;}
   active=await load(p);if(owner!==integratedUser?.studentId)return;
   const snapshot=active.snapshot,begin=beginPlay,camera=openCamera;
   beginPlay=function(){if(snapshot)restore(snapshot,p);return begin();};
   openCamera=function(){if(snapshot)restore(snapshot,p);return camera();};
   try{q=null;oldStart(n);}finally{beginPlay=begin;openCamera=camera;}
   if(state==='calibration')capture();
  }catch(e){note(e.message);}
  finally{starting=false;}
 };
 const oldNext=nextQuestion;
 nextQuestion=function(){
  const restoreData=restoreNext;restoreNext=null;
  const basic=C.question,distract=HSKDistractors.question;
  if(restoreData?.question&&index<queue.length){
   const r=restoreData.question,target=queue[index],dictionary=new Map([...Object.values(HSK_VOCAB).flatMap(list=>list.flatMap(l=>l.words)),...(C.decoys||[])].map(w=>[wordKey(w),w]));
   if(r.word_id!==target.id||!Array.isArray(r.options)||r.options.length!==(mode==='race'?3:2)||r.options.some(k=>!dictionary.has(k))||r.options.filter(k=>k===wordKey(target)).length!==1||new Set(r.options).size!==r.options.length)throw Error('Các lựa chọn trong bản lưu không hợp lệ.');
   const restored={word:target,options:r.options.map(k=>({...dictionary.get(k),correct:k===wordKey(target)})),answered:false};
   C.question=()=>restored;HSKDistractors.question=()=>restored;
  }
  restoring=true;try{oldNext();if(restoreData&&state==='playing'){remaining=restoreData.remaining;lastTick=performance.now();}}finally{C.question=basic;HSKDistractors.question=distract;restoring=false;}
  if(state==='playing')capture();
 };
 const oldAnswer=answer;answer=function(n){try{return oldAnswer(n);}finally{if(active&&['playing','feedback'].includes(state))capture();}};
 const oldFinish=finish;finish=function(){const before=restoring;restoring=false;capture('ready_to_save');restoring=before;return oldFinish();};
 window.NTCGameProgress={flush,capture,markSaved(revision){if(!active)return;active.snapshot=null;active.completed=true;active.dirty=false;if(Number.isInteger(revision))active.revision=revision;saveLocal(active);},get active(){return active;}};
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;const m=event.data||{};
  if(m.type==='vocabulary-progress-response'){const request=requests.get(m.request_id);if(!request||request.owner!==m.student_id||request.owner!==integratedUser?.studentId)return;clearTimeout(request.timer);requests.delete(m.request_id);m.error?request.reject(Error(m.error)):request.resolve(m.data);}
  if(m.type==='userInfo')queueMicrotask(boot);
 });
 window.addEventListener('online',()=>{boot();flush().catch(()=>{});});
 const periodic=setInterval(()=>{if(active&&['playing','feedback'].includes(state)&&Date.now()-lastCapture>=1500)capture();},1500);
 const pageSave=()=>{if(active&&['playing','feedback','calibration'].includes(state))capture();flush().catch(()=>{});};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pageSave();});window.addEventListener('pagehide',()=>{pageSave();clearInterval(periodic);});
})();
