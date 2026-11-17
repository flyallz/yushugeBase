/* Keep the book menu; coordinate its lesson selection with the LMS. */
(function(){
 'use strict';
 const params=new URLSearchParams(location.search);
 if(params.get('lms')!=='1')return;
 const first=Number(document.currentScript.dataset.first),last=Number(document.currentScript.dataset.last),level=Number(document.currentScript.dataset.level),frame=document.getElementById('lessonFrame');
 let selected=0;
 window.NTCHsk46Menu={
  navigate(n){
   if(!Number.isInteger(n)||n<first||n>last)return false;
   if(selected&&selected!==n){parent.postMessage({type:'ntcHsk46Navigate',level,lesson:n},location.origin);return true;}
   selected=n;return false;
  },
  url(file){return file+'?lms=1&student='+encodeURIComponent(params.get('student')||'teacher');}
 };
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin)return;
  if(e.source===frame.contentWindow&&['ntcHsk46Ready','ntcHsk46Submit','ntcHsk46Practice'].includes(e.data?.type)){
   if(e.data.level!==level||e.data.lesson!==selected)return;
   parent.postMessage(e.data,location.origin);
  }
  if(e.source===parent&&e.data?.type==='ntcHsk46Context')frame.contentWindow.postMessage(e.data,location.origin);
 });
 const n=Number(params.get('lesson'));if(Number.isInteger(n)&&n>=first&&n<=last)openLesson(n);
})();
