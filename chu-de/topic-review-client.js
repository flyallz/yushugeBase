(()=>{
 'use strict';
 const topic=window.NTC_TOPIC_REVIEW_ID,assignment=new URL(location.href).searchParams.get('topicAssignment');
 let trusted=false;try{trusted=parent!==window&&parent.location.origin===location.origin;}catch(e){}
 if(!topic||!assignment||!trusted){window.NTCTopicReview={mark(){},collect(){},capture(){return false}};return;}
 const nonce=crypto.randomUUID(),pending=new Map(),buckets=new Map(),done=new Set(),wanted=new Set();
 let config=null,busy=false,error='',storageKey='',chain=Promise.resolve();
 const panel=document.createElement('section');panel.className='ntc-topic-review';panel.setAttribute('aria-label','Tiến độ ôn tập được giao');
 const head=document.createElement('strong');head.textContent='Ôn tập được giao';
 const info=document.createElement('p');info.setAttribute('role','status');
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Các bước cần hoàn thành';details.append(summary);
 const list=document.createElement('ul');details.append(list);
 const confirm=document.createElement('button');confirm.type='button';confirm.textContent='✅ Xác nhận đã ôn tập';confirm.disabled=true;
 const retry=document.createElement('button');retry.type='button';retry.textContent='Thử lưu lại';retry.hidden=true;
 panel.append(head,info,details,confirm,retry);document.body.prepend(panel);
 const style=document.createElement('style');style.textContent='.ntc-topic-review{box-sizing:border-box;max-width:1000px;margin:12px auto;padding:16px 20px;background:#fff8fa;border:1px solid #d9adbb;border-radius:16px;font:17px/1.5 system-ui,sans-serif;color:#553b46}.ntc-topic-review strong{font-size:20px}.ntc-topic-review p{margin:8px 0}.ntc-topic-review button{font:inherit;padding:11px 15px;border-radius:10px;border:1px solid #aa596f;background:#aa596f;color:white;margin:8px 8px 0 0;cursor:pointer}.ntc-topic-review button:disabled{opacity:.55;cursor:default}.ntc-topic-review ul{padding-left:24px}.ntc-topic-review li{margin:6px 0}@media(max-width:650px){.ntc-topic-review{margin:8px;font-size:16px}.ntc-topic-review button{width:100%;margin-right:0}}';document.head.append(style);
 function paint(){
  list.replaceChildren();if(config)for(const step of config.steps){const li=document.createElement('li');li.textContent=(done.has(step.id)?'✓ ':'○ ')+step.label;list.append(li);}
  const total=config?.steps.length||0;
  info.textContent=error||(!config?'Đang tải bài được giao…':config.completedAt?'✅ Đã ghi nhận hoàn thành · '+new Date(config.completedAt).toLocaleString('vi-VN'):!config.canSave?'Bài chưa mở, đã đóng hoặc hết hạn.':`${done.size}/${total} bước đã lưu${busy?' · Đang lưu…':''}. Hoàn thành từng phần bên dưới để mở nút xác nhận.`);
  confirm.disabled=!config||!config.canSave||!!config.completedAt||busy||done.size!==total||!!error;
  retry.hidden=!error&&(!wanted.size||busy);
 }
 function send(type,extra={}){parent.postMessage({type,topic,assignment,nonce,...extra},location.origin);}
 function ask(step=null,confirm=false){
  const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Chưa nhận được xác nhận lưu. Hãy thử lại; hệ thống sẽ kiểm tra để tránh ghi trùng.'));},15000);
   pending.set(requestId,{resolve,reject,timer});send('ntcTopicSave',{step,confirm,requestId});
  });
 }
 function saveBuckets(){if(!storageKey)return;try{localStorage.setItem(storageKey,JSON.stringify([...buckets].map(([k,v])=>[k,[...v]])));}catch(e){}}
 function mark(step){
  if(!config||!config.canSave||config.completedAt||done.has(step)||wanted.has(step)||!config.steps.some(s=>s.id===step))return;
  wanted.add(step);chain=chain.then(async()=>{busy=true;paint();try{const r=await ask(step);apply(r);wanted.delete(step);error='';}catch(e){error=e.message;}finally{busy=false;paint();}});
 }
 function collect(bucket,key,total,step=bucket){
  if(!config||config.completedAt||!config.canSave||!Number.isInteger(total)||total<1)return;
  if(!buckets.has(bucket))buckets.set(bucket,new Set());buckets.get(bucket).add(String(key));saveBuckets();
  if(buckets.get(bucket).size>=total)mark(step);
 }
 function apply(r){for(const id of r.completed||[])if(config.steps.some(s=>s.id===id))done.add(id);if(r.completedAt)config.completedAt=r.completedAt;}
 window.NTCTopicReview={mark,collect,capture:()=>!!config&&config.canSave&&!config.completedAt};
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;const m=event.data||{};
  if(m.assignment!==assignment||m.topic!==topic||m.nonce!==nonce)return;
  if(m.type==='ntcTopicConfig'){
   if(!Array.isArray(m.steps)||!m.steps.length||typeof m.userId!=='string')return;
   config=m;storageKey='ntc-topic-review:v1:'+m.userId+':'+assignment;
   buckets.clear();try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');for(const [k,v] of saved)if(typeof k==='string'&&Array.isArray(v))buckets.set(k,new Set(v.map(String)));}catch(e){}
   apply(m);error='';paint();return;
  }
  if(m.type==='ntcTopicError'&&!m.requestId){error=m.message||'Không tải được quyền ôn tập.';paint();return;}
  const job=pending.get(m.requestId);if(!job)return;
  if(!['ntcTopicSaved','ntcTopicError'].includes(m.type))return;
  clearTimeout(job.timer);pending.delete(m.requestId);
  if(m.type==='ntcTopicError')job.reject(Error(m.message||'Chưa lưu được.'));else job.resolve(m);
 });
 confirm.onclick=()=>{if(confirm.disabled)return;busy=true;error='';paint();chain=chain.then(async()=>{try{const r=await ask(null,true);apply(r);error='';}catch(e){error=e.message;}finally{busy=false;paint();}});};
 retry.onclick=()=>{error='';if(!config){send('ntcTopicReady');paint();return;}const ids=[...wanted];wanted.clear();for(const id of ids)mark(id);paint();};
 paint();send('ntcTopicReady');setTimeout(()=>{if(!config&&!error){error='Chưa tải được bài giao. Hãy thử lại hoặc mở lại từ Bài tập của tôi.';paint();}},16000);
})();
