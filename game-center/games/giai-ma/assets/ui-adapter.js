(() => {
  'use strict';
  const gameScreen=document.getElementById('screen-game');
  function relayFocus(active){
    document.body.classList.toggle('focus-mode',!!active);
    try{window.parent.postMessage({type:'game-focus',active:!!active},'*');}catch(_){}
  }
  function syncFocus(){relayFocus(!!gameScreen&&gameScreen.classList.contains('active'));}
  if(gameScreen){new MutationObserver(syncFocus).observe(gameScreen,{attributes:true,attributeFilter:['class']});}
  syncFocus();


  // Progress adapter: chỉ báo hoàn thành khi học sinh đã đi hết 10 câu và vào màn kết quả.
  const resultScreen=document.getElementById('screen-result');
  let resultWasActive=!!resultScreen?.classList.contains('active');
  function reportCompletedRound(){
    if(!resultScreen?.classList.contains('active')) return;
    const title=(document.getElementById('result-title')?.textContent||'').trim();
    const pctText=(document.getElementById('result-pct')?.textContent||'').trim();
    const m=title.match(/HSK\s*(\d+)\s*·\s*Bộ\s*(\d+)/i);
    if(!m) return;
    const hsk=Number(m[1]), round=Number(m[2]);
    const accuracy=Number((pctText.match(/\d+/)||[])[0]||0);
    const score=Number((document.querySelector('#stats .stat strong')?.textContent||'').match(/\d+/)?.[0]||0);
    try{
      window.parent.postMessage({type:'game-progress-complete',payload:{
        scopeId:'game:giai-ma', scopeLabel:'Giải Mã Hán Tự',
        unitId:`HSK${hsk}:R${round}`,
        unitLabel:`HSK ${hsk} · Bộ ${round}`,
        totalUnits:50, kind:'game', accuracy, score,
        record:{gameId:'giai-ma',mode:'default',level:hsk,completedStage:round,score,accuracy,combo:0}
      }},'*');
    }catch(_){}
  }
  if(resultScreen){
    new MutationObserver(()=>{
      const active=resultScreen.classList.contains('active');
      if(active && !resultWasActive) setTimeout(reportCompletedRound,0);
      resultWasActive=active;
    }).observe(resultScreen,{attributes:true,attributeFilter:['class']});
  }

  window.addEventListener('beforeunload',()=>relayFocus(false));
})();
