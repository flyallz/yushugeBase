'use strict';
window.HSKSpeech=(()=>{
 const engine=window.speechSynthesis;
 let token=0,current=null,waiting=0,watchdog=0,blocked=false,lastWord='';
 function status(message,error=false){for(const id of ['speechStatus','speechCheckNote']){const el=document.getElementById(id);if(el){el.textContent=message;el.hidden=!message;el.classList.toggle('speech-error',error);}}const b=document.getElementById('soundToggle');if(b){b.title=message||'Bật / tắt âm thanh đáp án';b.setAttribute('aria-label',b.title);}}
 function voices(){try{return engine?.getVoices()||[]}catch{return[]}}
 function selectVoice(){const list=voices().filter(v=>{const lang=v.lang.replace(/_/g,'-').toLowerCase();return /^(zh|cmn)-(cn|hans)(-|$)/.test(lang)||/^(zh|cmn)$/.test(lang);});list.sort((a,b)=>rank(b)-rank(a));return list[0]||null;}
 function rank(v){return(/tingting|xiaoxiao|xiaoyi|huihui|female|女/i.test(v.name)?10:0)+(/natural|premium|enhanced|neural/i.test(v.name)?5:0);}
 function stop(){status('');token++;clearTimeout(waiting);clearTimeout(watchdog);waiting=watchdog=0;current=null;try{engine?.cancel()}catch{}window.HSKMusic?.restore();}
 function fail(error){blocked=true;const code=error?.error||error?.name||'';status(code==='not-allowed'||code==='NotAllowedError'?'Nhấn nút loa để bật giọng đọc tiếng Trung.':'Chưa phát được giọng đọc tiếng Trung. Nhấn nút loa để thử lại.',true);window.HSKMusic?.restore();}
 function dispatch(text,id){if(id!==token)return;if(!engine||!window.SpeechSynthesisUtterance){status('Trình duyệt này chưa hỗ trợ đọc chữ tiếng Trung.',true);blocked=true;return;}const u=new SpeechSynthesisUtterance(text),voice=selectVoice();u.lang=voice?.lang||'zh-CN';u.rate=.9;u.pitch=1;u.volume=1;if(voice)u.voice=voice;current=u; // Keep a strong reference throughout playback on mobile.
  let started=false;u.onstart=()=>{if(id!==token)return;started=true;blocked=false;clearTimeout(watchdog);status('');window.HSKMusic?.duck(10000);};
  u.onend=()=>{if(id!==token)return;clearTimeout(watchdog);current=null;window.HSKMusic?.restore();};
  u.onerror=e=>{if(id!==token)return;clearTimeout(watchdog);current=null;fail(e);};
  try{engine.resume();window.HSKMusic?.duck(10000);engine.speak(u);watchdog=setTimeout(()=>{if(id===token&&!started)fail({error:'not-allowed'});},2500);}catch(e){fail(e);}
 }
 // Must be called synchronously from a Start/Test/Speaker click, not a timer.
 function unlock(testWord='开始'){stop();blocked=false;status('Đang bật giọng đọc tiếng Trung…');dispatch(testWord,token);}
 function speak(text){lastWord=text;stop();const id=token;if(selectVoice()){waiting=setTimeout(()=>dispatch(text,id),60);return;}status('Đang chuẩn bị giọng đọc tiếng Trung…');const start=Date.now();function wait(){if(id!==token)return;if(selectVoice()||Date.now()-start>=1500){dispatch(text,id);return;}waiting=setTimeout(wait,100);}wait();}
 function recover(){unlock(lastWord||'你好');}
 if(engine)engine.addEventListener('voiceschanged',()=>{if(current&&engine.paused)try{engine.resume()}catch{}});
 return{unlock,speak,stop,recover,needsGesture:()=>blocked};
})();
