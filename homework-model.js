(function(root){
 'use strict';
 const norm=s=>String(s||'').trim().toUpperCase();
 const key=w=>[norm(w.course_code),w.lesson_code||w.id].join('|');
 function latest(rows){
  const groups=new Map();for(const r of rows){const k=[r.window_id||'',r.submission_kind,r.part_key].join('|');let g=groups.get(k);const attempt=Number(r.attempt_number)||1;if(!g||attempt>g.attempt){g={attempt,rows:[]};groups.set(k,g);}if(attempt===g.attempt)g.rows.push(r);}
  const parts=new Map();for(const g of groups.values()){const r=g.rows[0],k=r.submission_kind+'|'+r.part_key,at=Math.max(...g.rows.map(x=>+new Date(x.submitted_at)||0)),old=parts.get(k);if(!old||at>old.at)parts.set(k,{at,rows:g.rows});}return [...parts.values()].flatMap(g=>g.rows);
 }
 function assess(w,rows,override,now=Date.now()){
  const start=new Date(override?.opens_at||w.opens_at).getTime(),end=new Date(override?.closes_at||w.closes_at).getTime();
  const privateAccess=override?.is_allowed===true&&override?.allow_closed_window===true;
  const access=w.archived_at&&!privateAccess?'archived':(!w.is_enabled&&!privateAccess)||override?.is_allowed===false?'closed':now<start?'future':now>end?'late':'open';
  const current=latest(rows),effective=[];let expected=0,done=0;
  for(const [kind,allowed,parts] of [['writing','allow_writing','writing_parts'],['vocabulary_audio','allow_vocabulary_audio','vocabulary_parts'],['text_audio','allow_text_audio','text_parts']]){
   if(!w[allowed])continue;const count=Math.max(1,Number(w[parts])||1);expected+=count;
   const found=current.filter(r=>r.submission_kind===kind),full=found.filter(r=>r.part_key==='full');
   if(full.length){effective.push(...full);done+=count;}else{const pattern=kind==='text_audio'?/^text-\d+$/:/^part-\d+$/;const valid=found.filter(r=>pattern.test(r.part_key)&&Number(r.part_key.split('-')[1])>=1&&Number(r.part_key.split('-')[1])<=count);effective.push(...valid);done+=new Set(valid.map(r=>r.part_key)).size;}
  }
  if(!expected&&current.length){effective.push(...current);expected=1;done=1;}
  const redo=effective.some(r=>r.status==='revision_required'),pending=effective.some(r=>r.status==='pending');
  const submitted=rows.length>0,full=expected>0&&done>=expected&&!redo;
  const status=redo?'redo':full?(pending?'pending':'graded'):submitted?'partial':'missing';
  const lastAt=effective.reduce((n,r)=>Math.max(n,new Date(r.submitted_at).getTime()||0),0);
  return {access,status,submitted,full,redo,pending,done,expected,start,end,rows:effective,lastAt,onTime:lastAt?lastAt<=end:null};
 }
 function stats(items){return {assigned:items.length,submitted:items.filter(x=>x.state.submitted||x.history?.some(h=>h.rows.length)).length,full:items.filter(x=>x.state.full).length,partial:items.filter(x=>x.state.status==='partial').length,open:items.filter(x=>!x.state.full&&!x.state.redo&&x.state.access==='open').length,late:items.filter(x=>!x.state.full&&x.state.access==='late').length,redo:items.filter(x=>x.state.redo).length,pending:items.filter(x=>x.state.pending).length};}
 function dedupe(windows){const m=new Map();for(const w of windows){const k=key(w),old=m.get(k);if(!old||(!w.archived_at&&old.archived_at)||(!!w.archived_at===!!old.archived_at&&new Date(w.opens_at)>new Date(old.opens_at)))m.set(k,w);}return [...m.values()];}
 function selectStudentWindows(windows,overrides,now=Date.now()){
  const ov=new Map(overrides.map(o=>[o.window_id,o])),groups=new Map();
  for(const w of windows){const k=key(w);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(w);}
  return [...groups.values()].map(group=>{
   const privateWindows=group.filter(w=>{const o=ov.get(w.id),s=assess(w,[],o,now);return o?.is_allowed===true&&o.allow_closed_window===true&&['open','future'].includes(s.access);});
   return dedupe(privateWindows.length?privateWindows:group)[0];
  });
 }
 function studentItems(windows,rows,overrides,userId,classCode,now){const byWindow=new Map(),ov=new Map(overrides.filter(o=>o.user_id===userId).map(o=>[o.window_id,o]));for(const r of rows.filter(r=>r.user_id===userId)){if(!byWindow.has(r.window_id))byWindow.set(r.window_id,[]);byWindow.get(r.window_id).push(r);}
  const relevant=windows.filter(w=>norm(w.class_code)===norm(classCode)||byWindow.has(w.id)||ov.has(w.id));
  return selectStudentWindows(relevant,overrides.filter(o=>o.user_id===userId&&relevant.some(w=>w.id===o.window_id&&norm(w.class_code)===norm(classCode))),now).map(w=>{const history=relevant.filter(old=>key(old)===key(w)&&old.id!==w.id&&byWindow.has(old.id)).map(old=>({window:old,rows:byWindow.get(old.id)}));return {window:w,state:assess(w,byWindow.get(w.id)||[],ov.get(w.id),now),override:ov.get(w.id),history};});
 }
 const api={norm,key,latest,assess,stats,dedupe,selectStudentWindows,studentItems};root.NTCHomework=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
