'use strict';
const $=id=>document.getElementById(id),C=HSKCore;
const STORE='ngocthucac-hsk-games-v1';
let saved;try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')}catch{saved={}}
let level=1,difficulty='easy',mode=new URLSearchParams(location.search).get('mode')==='head'?'head':'race',lesson=null,profile='',state='menu',queue=[],firstTotal=0,index=0,score=0,wrong=new Map(),firstCorrect=0,round=0,lane=1,q=null,remaining=0,lastTick=0,paused=false,feedbackUntil=0,raf=0;
let steerTimer=0,reviewRun=null;
let assignedGameConfig=null;
function assignedUnit(n){const a=assignedGameConfig;return !!a&&String(n)===a.unit_key&&level===a.level&&mode===a.mode&&difficulty===a.difficulty;}
function unitLabel(){return lesson.review?lesson.review.label:'Bài '+lesson.number}
function reviewRecordKey(g){return 'HSK'+level+':'+g.key}
function addReviewButton(g){const b=document.createElement('button');b.className='review-lesson';b.dataset.review=g.key;b.disabled=unlocked()<=g.to&&!assignedUnit(g.key);const title=document.createElement('strong');title.textContent=(b.disabled?'🔒 ':'')+'↻ '+g.label;const info=document.createElement('small');const p=HSKReviews.pool(HSK_VOCAB[level],g);info.textContent=p.count+' từ/lượt · '+p.words.length+' từ xoay vòng';b.append(title,info);b.onclick=()=>startLesson(g.key);$('lessons').append(b);}
let combo=0,bestCombo=0,soundEnabled=true,wordAudio=null,effectTimer=0,voiceList=[];
let cameraFilter=['none','rabbit','cat','bear','scarf','cool','dream','doodle'].includes(saved.cameraFilter)?saved.cameraFilter:'none',lastFilterFace=null;
const filterImages={};for(const type of ['rabbit','cat','bear','scarf','cool','dream','doodle']){const img=new Image();img.src='filters/'+type+'.svg';img.onload=()=>drawCameraFilter(lastFilterFace);filterImages[type]=img;}
let integratedUser=null;
let cameraInitTimer=0;
let cameraStream=null,worker=null,workerReady=false,inFlight=false,camTimer=0,rawAngle=null,rawPitch=null,centerPitch=0,upRange=0,center=0,selector=new C.HeadSelector(),calibrated=false,camGeneration=0;
const diffNames={easy:'Dễ',medium:'Vừa',hard:'Khó'},durations={easy:18000,medium:12000,hard:8000},raceDurations={easy:4000,medium:3000,hard:2000};
function questionDuration(){return (mode==='race'?raceDurations:durations)[difficulty]}
function enterRaceFullscreen(){document.body.classList.add('race-fullscreen');const fn=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;try{const promise=fn?.call(document.documentElement);promise?.catch?.(()=>{});}catch{}}
function exitRaceFullscreen(){document.body.classList.remove('race-fullscreen');const fn=document.exitFullscreen||document.webkitExitFullscreen;try{if(document.fullscreenElement||document.webkitFullscreenElement){const promise=fn?.call(document);promise?.catch?.(()=>{});}}catch{}}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(saved));return true}catch{$('profileNote').textContent='Trình duyệt không lưu được tiến trình. Hãy bật quyền lưu dữ liệu trước khi chơi.';return false}}
function normalize(s){return s.trim().normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,' ')}
function useProfile(){
 const name=$('name').value.trim(),cls=$('className').value.trim();if(!name||!cls){$('profileNote').textContent='Nhập đủ tên và lớp để giữ đúng tiến trình của bạn.';return false}
 profile=integratedUser?.studentId?'account:'+integratedUser.studentId:JSON.stringify([normalize(name),normalize(cls)]);saved.users||={};saved.users[profile]||={};saved.last={name,cls};if(!persist())return false;
 $('profileNote').textContent='Đang chơi: '+name+' · '+cls;return true;
}
function unlocked(){return saved.users?.[profile]?.['HSK'+level]?.unlocked||1}
function show(id){if(window.parent!==window)window.parent.postMessage({type:'game-focus',active:id==='play'||id==='calibration'},location.origin);document.body.classList.toggle('head-mode',mode==='head'&&id==='play');['menu','calibration','play','results'].forEach(x=>$(x).hidden=x!==id);$('exit').hidden=id==='menu'}
function renderMenu(){
 show('menu');state='menu';$('levels').querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.level)===level));
 document.body.classList.toggle('hsk5-level',level===5);document.body.classList.toggle('hsk6-level',level===6);document.body.classList.toggle('hsk4-level',level===4);
 const ds=[3,4,5,6].includes(level)?['medium','hard']:['easy','medium','hard'];if(!ds.includes(difficulty))difficulty=ds[0];$('difficulties').replaceChildren();
 ds.forEach(d=>{const b=document.createElement('button');b.textContent=diffNames[d];b.classList.toggle('active',difficulty===d);b.onclick=()=>{difficulty=d;renderMenu()};$('difficulties').append(b)});
 $('studiedGate').hidden=mode!=='race';$('difficultyNote').textContent=(mode==='race'?'Chỉ chữ Hán · Không Pinyin':difficulty==='easy'?'Pinyin đi kèm':'Ẩn Pinyin')+' · '+questionDuration()/1000+' giây mỗi câu';
 $('progressNote').textContent='Bài đang mở: '+Math.min(unlocked(),HSK_VOCAB[level].length)+' / '+HSK_VOCAB[level].length+'. Hoàn thành và sửa hết từ sai để mở bài tiếp.';
 const reviewGroups=HSKReviews.groups(HSK_VOCAB[level],level);$('lessons').replaceChildren();HSK_VOCAB[level].forEach(l=>{const b=document.createElement('button');b.disabled=l.number>unlocked()&&!assignedUnit(l.number);const title=document.createElement('strong');title.textContent=(b.disabled?'🔒 ':'')+'Bài '+l.number;if([5,6].includes(level))b.title='Tập '+l.volume+' · '+l.title;const detail=document.createElement('small');detail.textContent=l.words.length+' từ'+(l.number<unlocked()?' · Đã qua':'');b.append(title,detail);b.onclick=()=>startLesson(l.number);$('lessons').append(b);reviewGroups.filter(g=>g.after===l.number).forEach(addReviewButton)});
 document.querySelectorAll('[data-game]').forEach(b=>b.classList.toggle('active',b.dataset.game===mode));
}
function startLesson(n){
 unlockSound();
 if(!useProfile()){renderMenu();$('name').focus();return}
 if(!C.available(level,difficulty))return;const review=typeof n==='string'?HSKReviews.groups(HSK_VOCAB[level],level).find(g=>g.key===n):null;if(typeof n==='string'&&!review)return;if(!assignedUnit(n)&&(review?unlocked()<=review.to:n>unlocked()))return;
 if(mode==='race'&&!$('studied').checked){$('profileNote').textContent='Hãy học xong bài rồi đánh dấu xác nhận trước khi chơi.';$('studied').focus();return;}
 reviewRun=null;if(review){const user=saved.users[profile];const plan=HSKReviews.plan(HSK_VOCAB[level],review,user.reviewRotations?.[reviewRecordKey(review)],C.shuffle);reviewRun=plan;lesson={number:review.to,review,words:plan.words};}else lesson=HSK_VOCAB[level].find(l=>l.number===n);if(!lesson)return;
 resetVocabularyReceipt();historyWrong.clear();queue=C.shuffle(lesson.words.map((w,i)=>({...w,id:i})));firstTotal=queue.length;index=0;score=0;wrong.clear();firstCorrect=0;round=0;combo=0;bestCombo=0;lane=1;paused=false;cancelAnimationFrame(raf);
 if(mode==='head'){openCamera()}else{beginPlay()}
}
function beginPlay(){if(soundEnabled)HSKSpeech.unlock();HSKMusic.start(mode);$('fullscreenToggle').hidden=mode!=='race';if(mode==='head'){$('cameraCenter').append($('videoShell'));loadVoices();}if(mode==='race'){enterRaceFullscreen();loadVoices();} $('soundToggle').hidden=false;$('raceProgress').hidden=mode!=='race';$('raceExit').hidden=false;show('play');state='playing';$('raceStage').hidden=mode!=='race';$('headStage').hidden=mode!=='head';$('controls').textContent=mode==='race'?'← / →: dịch xe từng làn · ↓: làn giữa · Chuột hoặc chạm: chọn làn':'Giữ hướng chọn 1 giây. Trở về giữa để sang câu tiếp.';nextQuestion();lastTick=performance.now();raf=requestAnimationFrame(tick)}
function updateHud(){ $('lessonLabel').textContent='HSK'+level+' · '+unitLabel()+' · '+diffNames[difficulty];$('score').textContent=score+' điểm';$('counter').textContent=(round?'Sửa từ sai · ':'')+(index+1)+'/'+queue.length; if(mode==='race'){$('combo').hidden=combo<2;$('combo').textContent='🔥 COMBO ×'+combo;$('raceProgressFill').style.width=(index/queue.length*100)+'%';$('raceProgressText').textContent=(round?'Sửa từ sai':index+' / '+firstTotal);}}
function nextQuestion(){
 if(index>=queue.length){
  if(wrong.size){queue=C.shuffle([...wrong.values()]);index=0;round++;wrong.clear()}else{finish();return}
 }
 q=[4,5,6].includes(level)?HSKDistractors.question(queue[index],mode==='race'?3:2,{level,difficulty,maxLesson:lesson.number,data:HSK_VOCAB}):C.question(queue[index],mode==='race'?3:2);state='playing';selector.reset();if(mode!=='race')lane=1;remaining=questionDuration();$('feedback').hidden=true;$('next').hidden=true;$('timeTrack').hidden=false;$('promptLabel').textContent=mode==='head'?'NGHĨA NÀY LÀ TỪ NÀO?':'NGHĨA NÀY LÀ CHỮ NÀO?';$('prompt').textContent=q.word.meaning;$('pinyin').textContent='';
 const host=$(mode==='race'?'raceOptions':'headOptions');if(mode==='race'){host.replaceChildren()}else{host.querySelectorAll('.head-option').forEach(el=>el.remove());host.classList.remove('three-options');}q.options.forEach((o,i)=>{const el=document.createElement(mode==='race'?'button':'div');el.className=mode==='race'?'':'head-option';if(mode==='head'){el.dataset.side=i;const direction=document.createElement('span');direction.className='head-direction';direction.textContent=['← Nghiêng trái','Nghiêng phải →'][i];const text=document.createElement('b');text.textContent=o.hanzi;el.append(direction,text)}else{el.textContent=o.hanzi;}if([4,5,6].includes(level)&&o.hanzi.length>4)el.classList.add('long-word');if(mode==='head'&&difficulty==='easy'){const py=document.createElement('small');py.textContent=o.pinyin;el.append(py)}if(mode==='race'){el.type='button';el.onclick=()=>setLane(i)}host.append(el)});
 $('raceOptions').style.transform='translateY(0) scale(.72)';$('raceStage').style.setProperty('--road-speed',({easy:'.24s',medium:'.18s',hard:'.12s'})[difficulty]);$('holdFill').style.width='0';$('headHint').textContent='Đưa đầu về giữa để sẵn sàng.';updateHud();setLane(lane);layoutRaceTimer();
}
function setLane(n){if(mode!=='race'||state!=='playing'||paused)return;const previousLane=lane;lane=Math.max(0,Math.min(2,n));if(lane!==previousLane){clearTimeout(steerTimer);$('car').style.setProperty('--steer',lane>previousLane?'9deg':'-9deg');steerTimer=setTimeout(()=>$('car').style.setProperty('--steer','0deg'),180)}$('car').style.left=((lane+.5)/3*100)+'%';$('raceOptions').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('selected',i===lane))}
function answer(n){
 if(state!=='playing'||paused)return;
 if(q.answered)return;q.answered=true;state='feedback';const ok=n!==null&&q.options[n].correct;
 if(ok){if(!round){score+=10;firstCorrect++}}else{wrong.set(q.word.id,q.word)}
 if(mode==='race'){
  if(!ok&&!round)historyWrong.set(q.word.id,q.word);
  if(ok){combo++;bestCombo=Math.max(bestCombo,combo);speakWord(q.word.hanzi);}else{combo=0;wrongSound();}
  raceEffect(ok,q.word);index++;nextQuestion();return;
 }
 $('headOptions').querySelectorAll('.head-option').forEach((el,i)=>{el.classList.toggle('head-correct',q.options[i].correct);el.classList.toggle('head-incorrect',i===n&&!ok)});if(ok)speakWord(q.word.hanzi);else wrongSound();
 const f=$('feedback');f.replaceChildren();f.className=ok?'correct':'incorrect';const title=document.createElement('strong');title.textContent=ok?'✓ Chính xác':n===null?'Hết thời gian':'Chưa đúng';const info=document.createElement('p');info.textContent=(n!==null?'Bạn chọn: '+q.options[n].hanzi+' · ':'')+'Đáp án đúng: '+q.word.hanzi+' · '+q.word.pinyin+' — '+q.word.meaning;f.append(title,info);f.hidden=false;
 if(!ok&&!round){historyWrong.set(q.word.id,q.word)}
 feedbackUntil=performance.now()+1700;
 if(mode==='race'){$('next').hidden=true}else{$('headHint').textContent='Đọc kết quả, rồi đưa đầu về giữa để chuyển câu.';selector.latched=true}
}
const historyWrong=new Map();
function loadVoices(){voiceList=window.speechSynthesis?.getVoices()||[]}
if(window.speechSynthesis)window.speechSynthesis.addEventListener('voiceschanged',loadVoices);
let soundContext=null,errorOscillators=[];
function unlockSound(){try{soundContext||=new (window.AudioContext||window.webkitAudioContext)();soundContext.resume().catch(()=>{})}catch{}}
function wrongSound(){stopWordAudio();if(!soundEnabled)return;HSKMusic.duck(650);unlockSound();if(!soundContext)return;const t=soundContext.currentTime;[0,.18].forEach(delay=>{const o=soundContext.createOscillator(),gain=soundContext.createGain();o.type='sawtooth';o.frequency.setValueAtTime(145,t+delay);o.frequency.exponentialRampToValueAtTime(95,t+delay+.13);gain.gain.setValueAtTime(0,t+delay);gain.gain.linearRampToValueAtTime(.07,t+delay+.01);gain.gain.exponentialRampToValueAtTime(.001,t+delay+.13);o.connect(gain);gain.connect(soundContext.destination);o.start(t+delay);o.stop(t+delay+.14);errorOscillators.push(o);o.onended=()=>{o.disconnect();gain.disconnect();errorOscillators=errorOscillators.filter(x=>x!==o)}});}
function stopWordAudio(){errorOscillators.forEach(o=>{try{o.stop()}catch{}});errorOscillators=[];wordAudio?.pause();wordAudio=null;HSKSpeech.stop()}
function speakWord(text){
 stopWordAudio();if(!soundEnabled)return;
 const path=window.HSK_AUDIO?.[text];
 if(path){wordAudio=new Audio(path);HSKMusic.duck(5000);wordAudio.onended=()=>HSKMusic.restore();wordAudio.onerror=()=>HSKMusic.restore();wordAudio.play().catch(()=>speakFallback(text));return;}
 speakFallback(text);
}
function speakFallback(text){if(soundEnabled)HSKSpeech.speak(text);}
function voiceScore(v){return (/xiaoxiao|xiaoyi|tingting|huihui|female|女/i.test(v.name)?10:0)+(/neural|natural|premium|enhanced/i.test(v.name)?20:0)}
function raceEffect(ok,word){
 const trail=$('raceOptions').cloneNode(true);trail.removeAttribute('id');trail.classList.add('gate-trail');trail.setAttribute('aria-hidden','true');trail.querySelectorAll('button').forEach(b=>{b.tabIndex=-1;b.disabled=true});$('raceStage').append(trail);setTimeout(()=>trail.remove(),280);
 clearTimeout(effectTimer);const road=$('raceStage'),car=$('car'),toast=$('raceToast');
 road.classList.remove('hit-correct','hit-wrong');car.classList.remove('boost','crash');void car.offsetWidth;
 road.classList.add(ok?'hit-correct':'hit-wrong');car.classList.add(ok?'boost':'crash');
 toast.textContent=ok?(round?'✓ Đã sửa đúng':'✓ +10')+(combo>1?' · COMBO ×'+combo:''):'✗ '+word.hanzi+' — '+word.meaning;
 toast.className=ok?'success':'error';toast.hidden=false;
 effectTimer=setTimeout(()=>{road.classList.remove('hit-correct','hit-wrong');car.classList.remove('boost','crash');toast.hidden=true},550);
}
$('soundToggle').onclick=()=>{if(soundEnabled&&HSKSpeech.needsGesture()){unlockSound();HSKSpeech.recover();return;}soundEnabled=!soundEnabled;$('soundToggle').setAttribute('aria-pressed',String(soundEnabled));$('soundToggle').textContent=soundEnabled?'🔊 Âm thanh':'🔇 Tắt âm';if(!soundEnabled)stopWordAudio();else{unlockSound();HSKSpeech.recover();}};

function advance(){if(state!=='feedback')return;index++;nextQuestion();lastTick=performance.now()}
function tick(now){
 const dt=mode==='race'?Math.max(0,now-lastTick):Math.min(now-lastTick,100);lastTick=now;
 if(state==='menu'||state==='results'||state==='calibration')return;
 if(!paused&&(mode==='race'||(selector.ready&&Number.isFinite(rawAngle)))&&state==='playing'){
  remaining=Math.max(0,remaining-dt);const fraction=1-remaining/questionDuration();$('timeFill').style.width=(fraction*100)+'%';const distance=Math.max(0,$('raceStage').querySelector('.finish-line').offsetTop-$('raceOptions').offsetTop-$('raceOptions').offsetHeight);$('raceOptions').style.transform=`translateY(${Math.pow(fraction,1.35)*distance}px) scale(${.72+.28*fraction})`;
  if(remaining===0)answer(mode==='race'?lane:null);
 }
 raf=requestAnimationFrame(tick);
}
function finish(){HSKMusic.pause();
 exitRaceFullscreen();state='results';stopCamera();cancelAnimationFrame(raf);
 const user=saved.users[profile];if(lesson.review){user.reviewRotations||={};user.reviewRotations[reviewRecordKey(lesson.review)]=reviewRun.record;user.reviewResults||={};user.reviewResults[reviewRecordKey(lesson.review)]={score,correct:firstCorrect,total:firstTotal,mode,difficulty,date:new Date().toISOString()};persist();}else{const user=saved.users[profile];user['HSK'+level]||={};const progress=user['HSK'+level];if(!assignedGameConfig)progress.unlocked=Math.max(progress.unlocked||1,lesson.number+1);progress.results||={};progress.results[lesson.number]={score,correct:firstCorrect,total:firstTotal,mode,difficulty,date:new Date().toISOString()};persist();}

 show('results');$('resultTitle').textContent=(mode==='race'?'🏁 Về đích! ':'')+unitLabel()+' đã hoàn thành!';$('resultInfo').textContent=`${firstCorrect}/${firstTotal} đúng ở lượt đầu · ${score} điểm.${mode==='race'?' Combo tốt nhất: '+bestCombo+'.':''} ${round?'Bạn đã sửa hết các từ sai. ':''}${assignedGameConfig?'Bài giáo viên giao · '+score+' điểm.':lesson.review?'Các lượt ôn tiếp tục xoay vòng toàn bộ phạm vi. Ôn tập không thay đổi bài đang mở.':lesson.number<HSK_VOCAB[level].length?'Đã mở Bài '+(lesson.number+1)+'.':'Bạn đã hoàn thành cấp này.'}`;
 const host=$('wrongList');host.replaceChildren();if(historyWrong.size){const heading=document.createElement('h2');heading.textContent='Các từ đã sửa trong lượt chơi';host.append(heading);historyWrong.forEach(w=>{const a=document.createElement('article'),b=document.createElement('b'),p=document.createElement('p');b.textContent=w.hanzi+' · '+w.pinyin;p.textContent=w.meaning;a.append(b,p);host.append(a)})}
}
function leave(){window.NTCGameProgress?.capture();window.NTCGameProgress?.flush().catch(()=>{});HSKMusic.pause();stopWordAudio();clearTimeout(effectTimer);exitRaceFullscreen();cancelAnimationFrame(raf);stopCamera();paused=false;$('paused').hidden=true;renderMenu()}
function pause(){if(!['playing','feedback'].includes(state))return;HSKMusic.pause();stopWordAudio();paused=true;selector.reset();$('paused').hidden=false}
function resume(){HSKMusic.start(mode);paused=false;selector.reset();lastTick=performance.now();$('paused').hidden=true}
function stopCamera(){HSKCameraEffects.stop();lastFilterFace=null;drawCameraFilter(null);clearTimeout(cameraInitTimer);camGeneration++;clearInterval(camTimer);camTimer=0;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;worker?.terminate();worker=null;workerReady=false;inFlight=false;rawAngle=null;rawPitch=null;$('video').srcObject=null}
async function openCamera(){
 stopCamera();const generation=camGeneration;show('calibration');$('calibration').insertBefore($('videoShell'),$('camStatus'));state='calibration';calibrated=false;upRange=0;$('calibrate').disabled=true;$('headStart').disabled=true;$('camStatus').textContent='Đang mở camera và tải bộ nhận diện…';
 try{
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera cần mở trang bằng HTTPS hoặc localhost.');
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
  if(generation!==camGeneration){stream.getTracks().forEach(t=>t.stop());return}
  cameraStream=stream;$('video').srcObject=stream;await $('video').play();HSKCameraEffects.start();if(generation!==camGeneration)return;
  worker=new Worker('./camera-worker.js');
  worker.onmessage=e=>{
   if(e.data.type==='error'){cameraError(e.data.message);return}
   if(e.data.type==='ready'){clearTimeout(cameraInitTimer);workerReady=true;$('camStatus').textContent='Nhìn thẳng vào camera. Chờ nhận diện khuôn mặt.';return}
   if(e.data.type==='face'){
    inFlight=false;const p=e.data.points;lastFilterFace=p;HSKCameraEffects.update(p);if(!p)clearCameraFilter();rawAngle=p?-C.roll(p,e.data.width,e.data.height):null;rawPitch=p&&Number.isFinite(e.data.pitch)?e.data.pitch:null;
    if(state==='calibration'){$('calibrate').disabled=!Number.isFinite(rawAngle);$('camStatus').textContent=p?(calibrated?'Đã căn chỉnh. Trở về giữa rồi bắt đầu.':'Đã thấy khuôn mặt. Ngồi thẳng và nhấn căn chỉnh.'):'Chưa thấy khuôn mặt. Đặt mặt trong khung.';return}
    if(paused)return;
    const angle=rawAngle===null?null:rawAngle-center;const up=0;
    if(state==='feedback'){
     if(Number.isFinite(angle)&&Math.abs(angle)<7&&Number.isFinite(up)&&Math.abs(up)<.25&&performance.now()>feedbackUntil)advance();return;
    }
    if(state!=='playing')return;
    const r=selector.update(angle===null?NaN:angle,performance.now(),0,false);$('holdFill').style.width=(r.progress*100)+'%';$('headOptions').querySelectorAll('.head-option').forEach((el,i)=>{el.classList.toggle('active',r.side===i);el.style.setProperty('--hold',r.side===i?(r.progress*360)+'deg':'0deg');});
    $('headHint').textContent=r.state==='missing'?'Không thấy khuôn mặt. Việc giữ lựa chọn đã được đặt lại.':r.state==='ambiguous'?'Đưa đầu về giữa, rồi chọn một hướng rõ ràng.':r.state==='center'?'Đưa đầu về giữa để sẵn sàng.':r.state==='holding'?`Giữ ${r.side===0?'trái':r.side===1?'phải':'ngước nhẹ'}: ${r.progress.toFixed(1)} / 1 giây`:'Nghiêng trái hoặc phải để chọn.';
    if(r.state==='chosen')answer(r.side);
   }
  };
  worker.onerror=()=>cameraError('Không tải được bộ nhận diện camera. Hãy mở qua HTTPS hoặc localhost.');worker.postMessage({type:'init'});cameraInitTimer=setTimeout(()=>cameraError('Bộ nhận diện chưa khởi động được. Hãy thử tải lại trang.'),30000);
  camTimer=setInterval(async()=>{
   if(!workerReady||inFlight||paused||$('video').readyState<2)return;inFlight=true;
   try{const bitmap=await createImageBitmap($('video'));if(generation!==camGeneration){bitmap.close();return}worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap])}catch{inFlight=false}
  },100);
 }catch(e){if(generation===camGeneration)cameraError(e.message)}
}
function cameraError(message){stopCamera();$('camStatus').textContent='Không dùng được camera: '+message+' Bạn có thể chọn game đua xe.';$('calibrate').disabled=true;$('headStart').disabled=true;if(state==='playing'||state==='feedback'){pause();$('paused').querySelector('p').textContent='Camera bị gián đoạn. Thoát lượt chơi và chọn game đua xe.'}}
$('calibrate').onclick=()=>{if(!Number.isFinite(rawAngle))return;center=rawAngle;calibrated=true;$('headStart').disabled=false;$('camStatus').textContent='Đã căn chỉnh vị trí giữa. Nhấn bắt đầu chơi.'};
$('headStart').onclick=()=>{if(calibrated&&cameraStream)beginPlay()};
$('cameraCancel').onclick=()=>{mode='race';leave()};$('exit').onclick=leave;$('raceExit').onclick=leave;$('homeLink').onclick=e=>{e.preventDefault();leave()};$('pause').onclick=pause;$('resume').onclick=resume;$('quit').onclick=leave;$('returnMenu').onclick=leave;$('replay').onclick=()=>{historyWrong.clear();startLesson(lesson.review?lesson.review.key:lesson.number)};$('next').onclick=advance;
$('profile').onclick=()=>{if(useProfile())renderMenu()};
$('name').addEventListener('input',()=>{profile='';renderMenu()});$('className').addEventListener('input',()=>{profile='';renderMenu()});
$('levels').querySelectorAll('button').forEach(b=>b.onclick=()=>{const nextLevel=Number(b.dataset.level);if(b.disabled||!HSK_VOCAB[nextLevel]?.length)return;level=nextLevel;renderMenu()});
 document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{mode=b.dataset.game;renderMenu()});
$('lessons').addEventListener('click',()=>{});
$('raceStage').addEventListener('pointerdown',e=>{const r=$('raceStage').getBoundingClientRect();setLane(Math.floor((e.clientX-r.left)/r.width*3))});
$('raceStage').addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.buttons){const r=$('raceStage').getBoundingClientRect();setLane(Math.floor((e.clientX-r.left)/r.width*3))}});
window.addEventListener('keydown',e=>{if(state!=='playing'||mode!=='race'||paused)return;if(['ArrowLeft','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();setLane(e.key==='ArrowDown'?1:lane+(e.key==='ArrowLeft'?-1:1))}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('pagehide',stopCamera);
if(saved.last){$('name').value=saved.last.name;$('className').value=saved.last.cls;useProfile()}

renderMenu();

// Lớp filter chỉ dùng để hiển thị; bộ nhận diện vẫn đọc video gốc.
function clearCameraFilter(){const canvas=$('filterCanvas');const ctx=canvas.getContext('2d');ctx?.clearRect(0,0,canvas.width,canvas.height)}
function drawCameraFilter(points){
 const canvas=$('filterCanvas'),video=$('video'),shell=$('videoShell');
 if(!points||cameraFilter==='none'||mode!=='head'){clearCameraFilter();return}
 const image=filterImages[cameraFilter];if(!image?.complete||!image.naturalWidth||!video.videoWidth||!video.videoHeight){clearCameraFilter();return}
 const width=shell.clientWidth,height=shell.clientHeight;if(!width||!height)return;
 const ratio=Math.min(window.devicePixelRatio||1,2);const pw=Math.round(width*ratio),ph=Math.round(height*ratio);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph}
 const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
 const scale=Math.max(width/video.videoWidth,height/video.videoHeight),offsetX=(video.videoWidth*scale-width)/2,offsetY=(video.videoHeight*scale-height)/2;
 const point=p=>({x:width-(p.x*video.videoWidth*scale-offsetX),y:p.y*video.videoHeight*scale-offsetY});
 const top=point(points[10]),chin=point(points[152]),left=point(points[234]),right=point(points[454]);
 const faceWidth=Math.hypot(left.x-right.x,left.y-right.y),faceHeight=Math.hypot(top.x-chin.x,top.y-chin.y);
 const accessory=['scarf','cool','dream','doodle'].includes(cameraFilter);const filterWidth=accessory?faceWidth*400/240:faceWidth*1.6*300/278,filterHeight=accessory?faceHeight*500/280:faceHeight*1.55*360/238;
 const angle=-C.roll(points,video.videoWidth,video.videoHeight)*Math.PI/180;
 ctx.save();ctx.translate((top.x+chin.x)/2,(top.y+chin.y)/2);ctx.rotate(angle);ctx.drawImage(image,-filterWidth/2,-filterHeight*(accessory?300/500:235/360),filterWidth,filterHeight);ctx.restore();
}
function syncCameraFilterButtons(){document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===cameraFilter;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))})}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{cameraFilter=b.dataset.filter;saved.cameraFilter=cameraFilter;persist();syncCameraFilterButtons();drawCameraFilter(lastFilterFace)});
window.addEventListener('resize',()=>drawCameraFilter(lastFilterFace));syncCameraFilterButtons();

window.addEventListener('message',event=>{if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='userInfo')return;const u=event.data;if(!u.name||!u.maLop)return;integratedUser=u;$('name').value=u.name;$('className').value=u.maLop;useProfile();document.querySelector('.identity').hidden=true;if(state==='menu')renderMenu();});
if(window.parent!==window)window.parent.postMessage({type:'game-user-request'},location.origin);

$('musicToggle').onclick=()=>HSKMusic.toggle(mode,['playing','feedback'].includes(state)&&!paused);$('fullscreenToggle').onclick=()=>{const fn=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;try{fn?.call(document.documentElement)?.catch?.(()=>{})}catch{}};

function layoutRaceTimer(){if(mode==='race'&&state==='playing'){$('timeTrack').style.top=(document.querySelector('#play .question').offsetTop+document.querySelector('#play .question').offsetHeight+7)+'px';}else $('timeTrack').style.removeProperty('top');}
window.addEventListener('resize',layoutRaceTimer);

$('speechTest').onclick=()=>{unlockSound();HSKSpeech.unlock('你好');};
