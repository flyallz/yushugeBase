'use strict';
// Rendering only: original video remains the input to the head-selection worker.
window.HSKCameraEffects=(()=>{
 const scene=document.getElementById('cameraScene'),video=document.getElementById('video'),shell=document.getElementById('videoShell');
 const frame=document.createElement('canvas'),tiny=document.createElement('canvas');tiny.width=tiny.height=12;
 const faceOutline=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 let target=null,smooth=null,seen=0,raf=0,background='pink';
 try{background=['pink','blur','original'].includes(localStorage.getItem('ngocthucac-camera-bg'))?localStorage.getItem('ngocthucac-camera-bg'):'pink'}catch{}
 function resize(){const w=shell.clientWidth,h=shell.clientHeight,r=Math.min(devicePixelRatio||1,2);if(!w||!h)return null;const pw=Math.round(w*r),ph=Math.round(h*r);if(scene.width!==pw||scene.height!==ph){scene.width=frame.width=pw;scene.height=frame.height=ph;}return{w:pw,h:ph};}
 function draw(){
  const size=resize();if(!size)return;const {w,h}=size,ctx=scene.getContext('2d');if(!ctx)return;
  ctx.fillStyle='#f3dce5';ctx.fillRect(0,0,w,h);
  if(video.readyState<2||!video.videoWidth)return;
  const f=frame.getContext('2d'),scale=Math.max(w/video.videoWidth,h/video.videoHeight),ox=(video.videoWidth*scale-w)/2,oy=(video.videoHeight*scale-h)/2;
  f.save();f.setTransform(-1,0,0,1,w,0);f.drawImage(video,-ox,-oy,video.videoWidth*scale,video.videoHeight*scale);f.restore();
  if(background==='original')ctx.drawImage(frame,0,0);
  else if(background==='blur'){
   const t=tiny.getContext('2d');t.drawImage(frame,0,0,12,12);ctx.save();ctx.filter='blur(18px)';ctx.drawImage(tiny,-w*.15,-h*.15,w*1.3,h*1.3);ctx.restore();
  }
  if(!target||performance.now()-seen>500){smooth=null;if(typeof clearCameraFilter==='function')clearCameraFilter();return;}
  smooth=smooth?smooth.map((p,i)=>({x:p.x+(target[i].x-p.x)*.5,y:p.y+(target[i].y-p.y)*.5,z:target[i].z})):target.map(p=>({...p}));
  const pt=p=>({x:w-(p.x*video.videoWidth*scale-ox),y:p.y*video.videoHeight*scale-oy});
  if(background!=='original'){
   ctx.save();ctx.beginPath();faceOutline.forEach((i,k)=>{const p=pt(smooth[i]);k?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath();ctx.clip();ctx.drawImage(frame,0,0);ctx.restore();
  }
  if(window.cameraFilter==='dream'||(typeof cameraFilter!=='undefined'&&cameraFilter==='dream')){
   for(const ids of [[33,133],[362,263]]){
    const a=pt(smooth[ids[0]]),b=pt(smooth[ids[1]]),ew=Math.hypot(a.x-b.x,a.y-b.y)*1.3,eh=ew*.68,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
    if(ew<3)continue;ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x));ctx.beginPath();ctx.ellipse(0,0,ew*.74,eh*.8,0,0,Math.PI*2);ctx.clip();ctx.drawImage(frame,cx-ew/2,cy-eh/2,ew,eh,-ew*.78,-eh*.84,ew*1.56,eh*1.68);ctx.restore();
   }
  }
  // Filter overlay follows the same smoothed landmarks and mirrored crop.
  if(typeof drawCameraFilter==='function')drawCameraFilter(smooth);
 }
 function loop(){draw();raf=requestAnimationFrame(loop);}
 function start(){if(!raf)loop();}
 function stop(){cancelAnimationFrame(raf);raf=0;target=smooth=null;seen=0;const ctx=scene.getContext('2d');if(ctx){ctx.fillStyle='#f3dce5';ctx.fillRect(0,0,scene.width,scene.height);}}
 function update(p){target=p;seen=performance.now();if(!p)smooth=null;}
 function sync(){document.querySelectorAll('[data-background]').forEach(b=>{b.classList.toggle('selected',b.dataset.background===background);b.setAttribute('aria-pressed',String(b.dataset.background===background));});}
 document.querySelectorAll('[data-background]').forEach(b=>b.onclick=()=>{background=b.dataset.background;try{localStorage.setItem('ngocthucac-camera-bg',background)}catch{}sync();draw();});sync();
 return{start,stop,update,draw};
})();
