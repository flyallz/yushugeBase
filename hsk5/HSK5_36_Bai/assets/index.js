'use strict';
// Đổi tên thương hiệu tại đây; bảng màu chung ở theme.css.
const BRAND_NAME='NGỌC THƯ CÁC · 玉书阁';
const $=id=>document.getElementById(id);
const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected=null;
$('brand').textContent=BRAND_NAME;
function setSidebar(open){$('shell').classList.toggle('collapsed',!open);$('menu').setAttribute('aria-expanded',String(open));$('sidebar').inert=!open;}
function renderList(){const term=$('search').value.trim().toLowerCase();let list=LESSONS.filter(l=>!term||String(l.n)===term||('bài '+l.n+' '+l.title).toLowerCase().includes(term));let html='';let volume=null;for(const l of list){const v=l.n<=18?1:2;if(v!==volume){volume=v;html+='<p class="volume">QUYỂN '+v+' · '+(v===1?'上册':'下册')+'</p>';}html+=`<a class="lesson-link ${selected===l.n?'active':''}" ${selected===l.n?'aria-current="page"':''} href="${l.file}" data-lesson="${l.n}"><span class="number">${String(l.n).padStart(2,'0')}</span><span class="name">${escapeText(l.title)}</span><span class="arrow">›</span></a>`;}$('lessonList').innerHTML=html;$('empty').hidden=list.length>0;$('lessonList').querySelectorAll('[data-lesson]').forEach(a=>a.onclick=e=>{e.preventDefault();openLesson(Number(a.dataset.lesson));});}
function pauseLesson(){try{$('lessonFrame').contentDocument.querySelectorAll('audio').forEach(a=>a.pause());}catch{}}
function openLesson(n){if(new URLSearchParams(location.search).get('lms')==='1'&&selected!==null&&selected!==n){window.parent.postMessage({type:'ntcHsk5Navigate',lesson:n},location.origin);return;}const l=LESSONS.find(l=>l.n===n);if(!l)return;if(selected!==n){pauseLesson();$('lessonFrame').src=l.file+'?student='+encodeURIComponent(new URLSearchParams(location.search).get('student')||'standalone')+(new URLSearchParams(location.search).get('lms')==='1'?'&lms=1':'');}selected=n;$('welcome').hidden=true;$('lessonFrame').hidden=false;$('back').hidden=false;$('current').textContent='Bài '+n+' · '+l.title;document.body.classList.add('reading');renderList();setSidebar(false);$('lessonFrame').focus();}
function goHome(){pauseLesson();$('lessonFrame').hidden=true;$('welcome').hidden=false;$('back').hidden=true;$('current').textContent='HSK 5 · Sách bài tập';document.body.classList.remove('reading');setSidebar(true);$('search').value='';renderList();$('search').focus();}
$('search').oninput=renderList;$('menu').onclick=()=>setSidebar($('shell').classList.contains('collapsed'));$('back').onclick=goHome;$('choose').onclick=()=>{setSidebar(true);$('search').focus();};$('close').onclick=()=>{setSidebar(false);$('menu').focus();};$('scrim').onclick=()=>setSidebar(false);document.addEventListener('keydown',e=>{if(e.key==='Escape'){setSidebar(false);$('menu').focus();}});renderList();

const initialLesson=Number(new URLSearchParams(location.search).get('lesson'));if(initialLesson>=1&&initialLesson<=36)openLesson(initialLesson);
window.addEventListener('message',e=>{
 if(e.origin!==location.origin)return;
 if(e.source===$('lessonFrame').contentWindow&&['ntcHsk5Ready','ntcHsk5Submit'].includes(e.data?.type))window.parent.postMessage({...e.data,lesson:selected},location.origin);
 if(e.source===window.parent&&e.data?.type==='ntcHsk5Context')$('lessonFrame').contentWindow.postMessage(e.data,location.origin);
});
