(() => {
  'use strict';
  const gameScreen = document.getElementById('screen-game');
  const levelMap = document.getElementById('levelMap');

  function relayFocus(active){
    document.body.classList.toggle('focus-mode', !!active);
    try { window.parent.postMessage({type:'game-focus', active:!!active}, '*'); } catch (_) {}
  }
  function syncFocus(){ relayFocus(!!gameScreen && gameScreen.classList.contains('active')); }

  if(gameScreen){
    new MutationObserver(syncFocus).observe(gameScreen,{attributes:true,attributeFilter:['class']});
  }
  syncFocus();

  function ensureLevelPresentation(){
    if(!levelMap) return;
    levelMap.querySelectorAll('.level-card.coming').forEach(card => card.style.display='none');
    if(!levelMap.querySelector('.coming-note')){
      const note=document.createElement('div');
      note.className='coming-note';
      note.textContent='Level 7–9 sẽ được cập nhật sau.';
      levelMap.appendChild(note);
    }
  }
  if(levelMap){
    ensureLevelPresentation();
    let queued=false;
    new MutationObserver(()=>{
      if(queued) return; queued=true;
      requestAnimationFrame(()=>{queued=false;ensureLevelPresentation();});
    }).observe(levelMap,{childList:true});
  }


  // Progress adapter: chỉ báo hoàn thành khi màn KẾT QUẢ xuất hiện sau đủ 10 câu.
  const resultScreen = document.getElementById('screen-result');
  let resultWasActive = !!resultScreen?.classList.contains('active');
  function reportCompletedStage(){
    if(!resultScreen?.classList.contains('active')) return;
    const label=(document.getElementById('resultLevel')?.textContent||'').trim();
    const accuracyText=(document.getElementById('resultAccuracy')?.textContent||'').trim();
    const m=label.match(/LEVEL\s+(\d+)\s*·\s*BẬC\s+(\d+)\s*·\s*(.+)$/i);
    if(!m) return;
    const level=Number(m[1]), stage=Number(m[2]);
    const mode=/FLASH/i.test(m[3])?'flash':'meaning';
    const modeLabel=mode==='flash'?'Flash nhận diện':'Nhìn nghĩa tìm chữ';
    const accuracy=Number((accuracyText.match(/\d+/)||[])[0]||0);
    const score=Number((document.getElementById('resultScore')?.textContent||'').match(/\d+/)?.[0]||0);
    const combo=Number((document.getElementById('resultCombo')?.textContent||'').match(/\d+/)?.[0]||0);
    try{
      window.parent.postMessage({type:'game-progress-complete',payload:{
        scopeId:'game:mat-than', scopeLabel:'Mắt Thần Hán Tự',
        unitId:`L${level}:${mode}:S${stage}`,
        unitLabel:`Level ${level} · ${modeLabel} · Bậc ${stage}`,
        totalUnits:60, kind:'game', accuracy, score,
        record:{gameId:'mat-than',mode,level,completedStage:stage,score,accuracy,combo}
      }},'*');
    }catch(_){}
  }
  if(resultScreen){
    new MutationObserver(()=>{
      const active=resultScreen.classList.contains('active');
      if(active && !resultWasActive) setTimeout(reportCompletedStage,0);
      resultWasActive=active;
    }).observe(resultScreen,{attributes:true,attributeFilter:['class']});
  }

  window.addEventListener('beforeunload',()=>relayFocus(false));
})();
