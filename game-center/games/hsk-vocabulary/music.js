'use strict';
// Two original instrumental loops, bundled locally. No camera/audio uploads.
window.HSKMusic=(()=>{
 let enabled=true;try{enabled=localStorage.getItem('ngocthucac-music')!=='off'}catch{}
 let audio=null,mode='',timer=0,playing=false,blocked=false;
 const button=()=>document.getElementById('musicToggle');
 function sync(){const b=button();if(b){b.textContent=enabled?'♫ Nhạc nhỏ':'♫ Tắt nhạc';b.setAttribute('aria-pressed',String(enabled));}}
 function status(text){const el=document.getElementById('musicStatus');if(el){el.textContent=text;el.hidden=!text;}}
 function start(next){playing=true;if(mode!==next||!audio){audio?.pause();mode=next;audio=new Audio('audio/'+(next==='head'?'gentle':'race')+'.mp3');audio.loop=true;audio.preload='auto';audio.volume=.12;}if(enabled)audio.play().then(()=>{blocked=false;status('');sync();}).catch(e=>{blocked=true;status(e.name==='NotAllowedError'?'Nhấn ♫ để bật nhạc.':'Nhạc chưa tải được. Nhấn ♫ để thử lại.');const b=button();if(b)b.textContent='♫ Bật nhạc';});sync();}
 function pause(){status('');playing=false;audio?.pause();clearTimeout(timer);if(audio)audio.volume=.12;}
 function restore(){clearTimeout(timer);if(audio)audio.volume=.12;}
 function duck(ms){clearTimeout(timer);if(audio)audio.volume=.025;timer=setTimeout(restore,ms);}
 function toggle(next,active){if(blocked&&active&&enabled){start(next);return;}enabled=!enabled;status('');try{localStorage.setItem('ngocthucac-music',enabled?'on':'off')}catch{}if(enabled&&active)start(next);else audio?.pause();sync();}
 sync();return{start,pause,duck,restore,toggle};
})();
