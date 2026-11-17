(() => {
  'use strict';
  const DATA = window.GIAIMA_DATA || {};
  const LEVEL_INFO = {
    1:{name:'HSK 1',desc:'Nền tảng'},
    2:{name:'HSK 2',desc:'Sơ trung cấp'},
    3:{name:'HSK 3',desc:'Trung cấp'},
    4:{name:'HSK 4',desc:'Nâng cao'},
    5:{name:'HSK 5',desc:'Cao cấp'},
    6:{name:'HSK 6',desc:'Chuyên sâu'}
  };
  const ROUND_SIZE = 10;
  const TIMER_SECONDS = 60;
  const $ = id => document.getElementById(id);
  let level = 1, master = [], masterIndex = 0, round = 1;
  let queue = [], currentQueue = [], qIndex = 0, score = 0, totalScore = 0;
  let wrong = [], attempts = 0, timerId = null, timerEnd = 0, answerLocked = false;

  function shuffle(a){
    a=[...a];
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  function totalQuestions(){ return (DATA[level] || []).length; }
  function totalRounds(){ return Math.ceil(totalQuestions()/ROUND_SIZE); }
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
    const el=$(id); if(el) el.classList.add('active');
    window.scrollTo(0,0);
  }
  function speak(text){
    try{
      if(window.GameCenterTTS && typeof window.GameCenterTTS.speak==='function'){
        window.GameCenterTTS.speak(text,{rate:.82}); return;
      }
      if(!('speechSynthesis' in window)) return;
      const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=.82;u.pitch=1.03;
      speechSynthesis.cancel();speechSynthesis.speak(u);
    }catch(_){}
  }
  function stopVoice(){ try{ if(window.GameCenterTTS) window.GameCenterTTS.stop(); else if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(_){} }

  function buildLevels(){
    const grid=$('level-grid'); grid.innerHTML='';
    Object.keys(LEVEL_INFO).forEach(k=>{
      const n=Number(k),info=LEVEL_INFO[n],count=(DATA[n]||[]).length,rounds=Math.ceil(count/ROUND_SIZE);
      const b=document.createElement('button');
      b.className='level-card'+(n===level?' active':'');
      b.innerHTML=`<div class="level-top"><div><div class="level-code">TRÌNH ĐỘ</div><div class="level-name">${info.name}</div></div><span class="level-status">${count} câu</span></div><div class="level-meta"><span>${info.desc}</span><span>${rounds} bộ × 10 câu</span></div>`;
      b.addEventListener('click',()=>{ level=n; buildLevels(); $('selected-copy').textContent='Đang chọn '+info.name; });
      grid.appendChild(b);
    });
  }

  function startLevel(){
    if(!DATA[level] || !DATA[level].length) return;
    master=shuffle(DATA[level]);masterIndex=0;round=1;totalScore=0;startNextRound();
  }
  function startNextRound(){
    stopVoice();
    if(masterIndex>=master.length){ master=shuffle(DATA[level]);masterIndex=0;round=1;totalScore=0; }
    currentQueue=master.slice(masterIndex,masterIndex+ROUND_SIZE);
    masterIndex+=currentQueue.length;
    queue=shuffle(currentQueue);qIndex=0;score=0;wrong=[];answerLocked=false;
    showScreen('screen-game');showQuestion();
  }
  function replayRound(){
    stopVoice();queue=shuffle(currentQueue);qIndex=0;score=0;wrong=[];answerLocked=false;showScreen('screen-game');showQuestion();
  }

  function showQuestion(){
    if(qIndex>=queue.length){ endRound(); return; }
    stopVoice();attempts=0;answerLocked=false;
    const q=queue[qIndex], total=totalQuestions();
    $('game-breadcrumb').textContent=`${LEVEL_INFO[level].name} · Bộ ${round}/${totalRounds()}`;
    $('q-count').textContent=`${qIndex+1} / ${queue.length}`;
    $('score').textContent=score;
    $('seen-count').textContent=`${Math.min(masterIndex,total)} / ${total}`;
    $('progress').style.width=`${(qIndex/queue.length)*100}%`;
    $('part-show').textContent=q.show;
    $('part-missing').textContent='?';$('part-result').textContent='?';
    $('part-missing').classList.add('missing');$('part-result').classList.add('missing');
    $('hint-pin').textContent=q.pin;$('hint-meaning').textContent=q.nghia;$('hint-card').style.display='block';
    $('meta-result').classList.remove('visible');$('feedback').textContent='';$('feedback').className='feedback';$('next-btn').classList.remove('visible');
    const opts=shuffle([q.ans,...q.dist.slice(0,5)]);
    const box=$('options');box.innerHTML='';
    opts.forEach(x=>{ const b=document.createElement('button');b.className='option';b.type='button';b.textContent=x;b.addEventListener('click',()=>answer(x,q,b));box.appendChild(b); });
    startTimer();
  }

  function answer(chosen,q,btn){
    if(answerLocked || btn.disabled) return;
    if(chosen===q.ans){
      answerLocked=true;stopTimer();document.querySelectorAll('.option').forEach(b=>b.disabled=true);btn.classList.add('correct');
      const pts=attempts===0?3:1;score+=pts;$('score').textContent=score;
      $('part-missing').textContent=q.ans;$('part-result').textContent=q.char;$('part-missing').classList.remove('missing');$('part-result').classList.remove('missing');
      $('hint-card').style.display='none';$('meta-char').textContent=q.char;$('meta-pin').textContent=q.pin;$('meta-meaning').textContent=q.nghia;$('meta-result').classList.add('visible');
      $('feedback').textContent=attempts===0?`Chính xác · +${pts} điểm`:`Đúng rồi · +${pts} điểm`;$('feedback').className='feedback ok';
      speak(q.char);$('next-btn').classList.add('visible');
    }else{
      attempts++;btn.disabled=true;btn.classList.add('wrong');setTimeout(()=>btn.classList.remove('wrong'),350);
      if(!wrong.some(w=>w.char===q.char)) wrong.push(q);
      $('feedback').textContent='Chưa đúng. Quan sát cấu trúc và thử lại.';$('feedback').className='feedback bad';
    }
  }
  function reveal(q,label){
    if(answerLocked) return;answerLocked=true;stopTimer();document.querySelectorAll('.option').forEach(b=>b.disabled=true);
    if(!wrong.some(w=>w.char===q.char)) wrong.push(q);
    $('part-missing').textContent=q.ans;$('part-result').textContent=q.char;$('part-missing').classList.remove('missing');$('part-result').classList.remove('missing');
    $('hint-card').style.display='none';$('meta-char').textContent=q.char;$('meta-pin').textContent=q.pin;$('meta-meaning').textContent=q.nghia;$('meta-result').classList.add('visible');
    $('feedback').textContent=label+` · ${q.show} + ${q.ans} = ${q.char}`;$('feedback').className='feedback bad';$('next-btn').classList.add('visible');
  }
  function skip(){ if(queue[qIndex]) reveal(queue[qIndex],'Đã bỏ qua'); }
  function next(){ if(!answerLocked) return; qIndex++;showQuestion(); }

  function startTimer(){
    stopTimer();timerEnd=Date.now()+TIMER_SECONDS*1000;$('timer-text').textContent=TIMER_SECONDS;
    timerId=setInterval(()=>{ const r=Math.max(0,timerEnd-Date.now()),s=Math.ceil(r/1000);$('timer-text').textContent=s;if(r<=0){ stopTimer();if(queue[qIndex]) reveal(queue[qIndex],'Hết giờ'); } },250);
  }
  function stopTimer(){ if(timerId){clearInterval(timerId);timerId=null;} }

  function endRound(){
    stopTimer();stopVoice();
    const correct=queue.length-wrong.length,pct=queue.length?Math.round(correct/queue.length*100):0,total=totalQuestions();
    totalScore+=score;const remain=Math.max(0,total-masterIndex);
    $('result-title').textContent=`${LEVEL_INFO[level].name} · Bộ ${round}`;$('result-pct').textContent=pct+'%';$('result-caption').textContent=`${correct}/${queue.length} câu chính xác`;
    $('stats').innerHTML=`<div class="stat"><strong>${score}</strong><span>Điểm lượt</span></div><div class="stat"><strong>${totalScore}</strong><span>Điểm tích lũy</span></div><div class="stat"><strong>${Math.min(masterIndex,total)}/${total}</strong><span>Câu đã gặp</span></div>`;
    $('review').innerHTML=wrong.length
      ? '<h3>Cần xem lại</h3><div class="review-list">'+wrong.map(w=>`<div class="review-item"><div class="review-char">${w.char}</div><div class="review-main"><strong>${w.pin}</strong> · ${w.nghia}<div class="review-sub">${w.show} + ${w.ans} = ${w.char}</div></div></div>`).join('')+'</div>'
      : '<h3>Không có chữ cần ôn lại trong lượt này.</h3>';
    const a=$('result-actions');a.innerHTML='';
    if(remain>0){ const n=document.createElement('button');n.className='primary-btn';n.textContent=`Tiếp tục 10 câu tiếp theo · còn ${remain}`;n.onclick=()=>{round++;startNextRound();};a.appendChild(n); }
    else{ const n=document.createElement('button');n.className='primary-btn';n.textContent=`Hoàn thành ${total} câu · Chơi vòng mới`;n.onclick=startLevel;a.appendChild(n); }
    const r=document.createElement('button');r.className='secondary-btn';r.textContent='Chơi lại bộ này';r.onclick=replayRound;a.appendChild(r);
    const h=document.createElement('button');h.className='ghost-btn';h.textContent='Về chọn trình độ';h.onclick=()=>showScreen('screen-start');a.appendChild(h);
    showScreen('screen-result');
  }

  $('start-btn').addEventListener('click',startLevel);
  $('home-btn').addEventListener('click',()=>{stopTimer();stopVoice();showScreen('screen-start');});
  $('skip-btn').addEventListener('click',skip);
  $('next-btn').addEventListener('click',next);
  buildLevels();
})();
