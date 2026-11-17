'use strict';
(()=>{
 const $=id=>document.getElementById(id),esc=escapeHtml;
 const ids=['dua-xe','nghieng-dau'];
 const filter={level:1,unit:'1',difficulty:'easy'};
 const isVocabulary=()=>learningRecordState.metric==='game'&&ids.includes(learningRecordState.gameId);
 const getMode=()=>learningRecordState.gameId==='dua-xe'?'race':'head';
 const units=level=>HSK_VOCAB[level].flatMap(l=>[{key:String(l.number),label:'Bài '+l.number},...HSKReviews.groups(HSK_VOCAB[level],level).filter(g=>g.after===l.number).map(g=>({key:g.key,label:g.label}))]);
 function validRecord(r){
  return r&&['race','head'].includes(r.mode)&&Number.isInteger(r.level)&&r.level>=1&&r.level<=6&&
   ['easy','medium','hard'].includes(r.difficulty)&&!(r.level>=3&&r.difficulty==='easy')&&
   units(r.level).some(u=>u.key===r.unit_key);
 }
 const select=$('recordsGameSelect');
 for(const [value,text] of [['dua-xe','Đua xe'],['nghieng-dau','Nghiêng đầu']]){
  const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
 }
 const fields=[];
 for(const [key,title] of [['Level','Cấp HSK'],['Unit','Bài / ôn tập'],['Difficulty','Độ khó']]){
  const label=document.createElement('label'),input=document.createElement('select');
  label.append(document.createTextNode(title));input.id='recordsVocabulary'+key;label.append(input);label.hidden=true;
  $('recordsGameFilters').append(label);fields.push(label);
 }
 function options(input,values,value){input.replaceChildren();for(const [key,label] of values){const option=document.createElement('option');option.value=key;option.textContent=label;input.append(option);}input.value=value;}
 function syncFilters(){
  const list=units(filter.level);if(!list.some(u=>u.key===filter.unit))filter.unit=list[0].key;
  const ds=filter.level>=3?[['medium','Vừa'],['hard','Khó']]:[['easy','Dễ'],['medium','Vừa'],['hard','Khó']];
  if(!ds.some(d=>d[0]===filter.difficulty))filter.difficulty=ds[0][0];
  options($('recordsVocabularyLevel'),[1,2,3,4,5,6].map(n=>[String(n),'HSK'+n]),String(filter.level));
  options($('recordsVocabularyUnit'),list.map(u=>[u.key,u.label]),filter.unit);
  options($('recordsVocabularyDifficulty'),ds,filter.difficulty);
 }
 $('recordsVocabularyLevel').onchange=e=>{filter.level=Number(e.target.value);filter.unit='1';syncFilters();loadLearningRecords(true);};
 $('recordsVocabularyUnit').onchange=e=>{filter.unit=e.target.value;loadLearningRecords(true);};
 $('recordsVocabularyDifficulty').onchange=e=>{filter.difficulty=e.target.value;loadLearningRecords(true);};
 const originalSync=syncLearningRecordControls;
 syncLearningRecordControls=function(){originalSync();$('recordsGameFilters').classList.toggle('vocabulary-filters',isVocabulary());for(const field of fields)field.hidden=!isVocabulary();if(isVocabulary()){$('recordsModeWrap').style.display='none';syncFilters();}};
 const originalGame=setLearningRecordGame;
 setLearningRecordGame=async function(id){if(!ids.includes(id))return originalGame(id);learningRecordState.gameId=id;syncLearningRecordControls();await loadLearningRecords(true);};
 function render(rows){
  const board=$('recordsBoard'),me=rows.find(r=>r.is_me),rank=$('recordsMyRank');
  rank.style.display=me?'block':'none';rank.textContent=me?'Hạng của bạn: #'+me.rank_no:'';
  if(!rows.length){board.innerHTML='<div class="records-empty">Chưa có điểm cho bài và độ khó này. Hoàn thành một lượt chơi để lên bảng.</div>';return;}
  const scope=learningRecordState.scope==='class'?'Kỷ lục lớp '+(learningRecordState.classCode||currentUser?.maLop||''):'Kỷ lục chung toàn trung tâm';
  board.innerHTML='<div class="records-summary"><strong>'+esc(scope)+'</strong><span>Điểm tốt nhất · Đúng lần đầu +10 điểm</span></div><div class="records-table-wrap"><table class="records-table vocabulary-score-table"><thead><tr><th>Hạng</th><th>Học sinh</th><th>Điểm</th><th>Đúng / tổng</th><th>Chính xác</th></tr></thead><tbody>'+rows.map(r=>'<tr class="'+(r.is_me?'me':'')+'"><td>'+rankBadge(r.rank_no)+'</td><td><div class="record-student-name">'+esc(r.full_name||'Học sinh')+(r.is_me?'<span class="record-me-badge">Bạn</span>':'')+'</div><div class="record-student-class">'+esc(r.class_code||'')+'</div></td><td><strong>'+esc(r.score)+'</strong></td><td>'+esc(r.correct)+' / '+esc(r.total)+'</td><td>'+esc(Number(r.accuracy))+'%</td></tr>').join('')+'</tbody></table></div>';
 }
 const originalLoad=loadLearningRecords;
 loadLearningRecords=async function(showLoading=false){
  if(!isVocabulary())return originalLoad(showLoading);
  if(!sb||!currentUser)return;
  const request=++learningRecordsLoadToken,owner=currentUser.authId;
  syncLearningRecordControls();
  if(showLoading)$('recordsBoard').innerHTML='<div class="records-loading">Đang tải điểm…</div>';
  try{
   await ensureLearningRecordClasses();if(request!==learningRecordsLoadToken||owner!==currentUser?.authId)return;
   const {data,error}=await sb.rpc('ntc_vocabulary_leaderboard',{p_mode:getMode(),p_level:filter.level,p_unit:filter.unit,p_difficulty:filter.difficulty,p_scope:learningRecordState.scope,p_class_code:learningRecordState.scope==='class'?(learningRecordState.classCode||currentUser.maLop||null):null,p_limit:100});
   if(request!==learningRecordsLoadToken||owner!==currentUser?.authId)return;
   if(error)throw error;render(Array.isArray(data)?data:[]);
  }catch(e){if(request===learningRecordsLoadToken&&owner===currentUser?.authId){$('recordsMyRank').style.display='none';$('recordsBoard').innerHTML='<div class="records-empty">Chưa tải được điểm: '+esc(e.message||String(e))+'</div>';}}
 };
 function progress(r,label){
  const review=!/^\d+$/.test(r.unit_key);
  return {scopeId:'game:hsk-vocabulary:'+r.mode+':'+r.level,scopeLabel:(r.mode==='race'?'Đua xe':'Nghiêng đầu')+' HSK'+r.level,unitId:(review?'review:':'lesson:')+r.unit_key,unitLabel:label||units(r.level).find(u=>u.key===r.unit_key)?.label,totalUnits:HSK_VOCAB[r.level].length+HSKReviews.groups(HSK_VOCAB[r.level],r.level).length,kind:'game',accuracy:Math.round(r.correct/r.total*100),score:r.correct*10};
 }
 const progressRequests=new Map();
 window.ntcVocabularySaved=function(r,label){
  if(!validRecord(r))return;
  const item=progress(r,label),key=currentUser?.authId+':'+item.scopeId+':'+item.unitId;
  if(!progressRequests.has(key)){
   const pending=Promise.resolve().then(()=>recordProgressCompletion(item)).catch(e=>console.warn('Game progress:',e.message)).finally(()=>progressRequests.delete(key));
   progressRequests.set(key,pending);
  }
  if(isVocabulary()&&$('learningRecordsView').style.display==='block')loadLearningRecords(true);
 };
 const requests=new Map();
 window.addEventListener('message',async event=>{
  const frame=$('contentFrame'),m=event.data||{};
  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||!currentUser)return;
  const url=new URL(frame.src,location.href);
  if(!url.pathname.endsWith('/game-center/index.html')&&!url.pathname.endsWith('/game-center/games/hsk-vocabulary/index.html'))return;
  if(m.type==='vocabulary-leaderboard-open'&&validRecord(m.record)){
   const r=m.record;filter.level=r.level;filter.unit=r.unit_key;filter.difficulty=r.difficulty;
   learningRecordState.metric='game';learningRecordState.gameId=r.mode==='race'?'dua-xe':'nghieng-dau';
   await goLearningRecords();return;
  }
  const r=m.payload?.vocabularyRecord;
  if(m.type!=='game-progress-complete'||!r||isTeacher||url.searchParams.has('assignment'))return;
  const owner=currentUser.authId,sourceUrl=frame.src;
  if(r.student_id!==owner||!validRecord(r)||typeof r.record_id!=='string'||r.record_id.length>100)return;
  const key=owner+':'+r.record_id;
  let promise=requests.get(key);
  if(!promise){
   promise=(async()=>{const {data,error}=await sb.rpc(Number.isInteger(r.progress_revision)?'ntc_finish_vocabulary_progress':'ntc_record_vocabulary_game',{p_mode:r.mode,p_level:r.level,p_unit:r.unit_key,p_difficulty:r.difficulty,p_correct:r.correct,p_total:r.total,...(Number.isInteger(r.progress_revision)?{p_expected_revision:r.progress_revision}:{})});if(error)throw error;return data;})();
   requests.set(key,promise);if(requests.size>100)requests.delete(requests.keys().next().value);
  }
  const reply={record_id:r.record_id,student_id:owner};
  try{
   const saved=await promise;if(owner!==currentUser?.authId||sourceUrl!==frame.src)return;
   window.ntcVocabularySaved(r);
   frame.contentWindow.postMessage({...reply,type:'vocabulary-record-saved',revision:saved?.revision},location.origin);
  }catch(e){
   requests.delete(key);
   if(owner===currentUser?.authId&&sourceUrl===frame.src)frame.contentWindow.postMessage({...reply,type:'vocabulary-record-error',message:e.message||'Hãy thử lại.'},location.origin);
  }
 });
 syncLearningRecordControls();
})();
