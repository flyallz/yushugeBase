/* Read-only summaries, keyed by student and assignment. No scoring or submission writes. */
(function(root){'use strict';
 function summary(data,classCode='',now=Date.now()){
  const M=root.NTCHomework,norm=M.norm,profiles=data.profiles||[],byProfile=new Map(profiles.map(p=>[p.user_id,p])),byWindow=new Map((data.windows||[]).map(w=>[w.id,w]));
  const inClass=p=>!classCode||norm(p.class_code)===norm(classCode),approved=profiles.filter(p=>p.approval_status==='approved');
  const students=approved.filter(inClass),pendingProfiles=profiles.filter(p=>p.email&&(p.approval_status||'pending')==='pending'&&inClass(p));
  const rowsByUser=new Map();for(const r of data.rows||[]){if(!rowsByUser.has(r.user_id))rowsByUser.set(r.user_id,[]);rowsByUser.get(r.user_id).push(r);}
  const pending=[],redo=[],late=[];
  const groups=new Map();for(const r of data.rows||[]){const key=r.user_id+'|'+r.window_id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  for(const rs of groups.values()){
   const row=rs[0],p=byProfile.get(row.user_id),w=byWindow.get(row.window_id);if(!p||!w||w.archived_at||!inClass(p))continue;
   const latest=M.latest(rs),pendingRows=latest.filter(r=>r.status==='pending');
   if(pendingRows.length)pending.push({kind:'homework',person:p,window:w,title:w.course_code+' · '+w.lesson_name,at:pendingRows.reduce((n,r)=>Math.max(n,+new Date(r.submitted_at)||0),0),status:'Chờ chấm'});
  }
  for(const p of students){const items=M.studentItems(data.windows||[],rowsByUser.get(p.user_id)||[],data.overrides||[],p.user_id,p.class_code,now);
   for(const item of items){const w=item.window,s=item.state;if(w.archived_at)continue;const entry={kind:'homework',person:p,window:w,title:w.course_code+' · '+w.lesson_name,at:s.end,status:s.redo?'Cần làm lại':'Quá hạn'};
    if(s.redo)redo.push(entry);else if(!s.full&&s.access==='late')late.push(entry);
   }
  }
  for(const a of data.topics||[]){if(!a.is_enabled||now<=Date.parse(a.closes_at))continue;for(const receipt of a.students||[]){const p=byProfile.get(receipt.user_id);if(!p||p.approval_status!=='approved'||!inClass(p)||receipt.completed_at)continue;late.push({kind:'topic',person:p,assignment:a,title:a.title,at:Date.parse(a.closes_at),status:'Quá hạn'});}}
  for(const r of data.daily||[]){if(r.teacher_hidden||r.status==='graded')continue;const p=byProfile.get(r.user_id)||{user_id:r.user_id,full_name:r.student_name,class_code:r.class_code};if(inClass(p))pending.push({kind:'daily',person:p,title:'Bài viết · 我的一天',at:+new Date(r.created_at)||0,status:'Chờ chấm'});}
  pending.sort((a,b)=>b.at-a.at);redo.sort((a,b)=>a.at-b.at);late.sort((a,b)=>a.at-b.at);
  const approvals=pendingProfiles.map(p=>({kind:'approval',person:p,title:'Tài khoản học sinh',status:'Chờ duyệt',at:0}));
  const classes=new Map();for(const p of approved){const c=norm(p.class_code);if(c)classes.set(c,(classes.get(c)||0)+1);}
  for(const c of (data.classList||[])){const n=norm(c);if(n&&!classes.has(n))classes.set(n,0);}
  return {pending,redo,late,approvals,classes:[...classes].sort((a,b)=>a[0].localeCompare(b[0]))};
 }
 root.NTCTeacherHomeModel={summary};if(typeof module!=='undefined'&&module.exports)module.exports=root.NTCTeacherHomeModel;
})(typeof window!=='undefined'?window:globalThis);
