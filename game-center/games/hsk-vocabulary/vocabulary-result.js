'use strict';
(()=>{
 let receipt=null,timer=0;
 const send=message=>window.parent.postMessage(message,location.origin);
 function status(text,retry=false){
  const box=document.getElementById('vocabularySaveStatus');if(box)box.textContent=text;
  const button=document.getElementById('vocabularySaveRetry');if(button)button.hidden=!retry;
 }
 window.resetVocabularyReceipt=function(){
  clearTimeout(timer);receipt=null;
  for(const id of ['vocabularySaveStatus','vocabularySaveRetry','vocabularyLeaderboard'])document.getElementById(id)?.remove();
 };
 async function retry(){
  if(!receipt||receipt.saved||assignedGameConfig)return;
  status('Đang lưu điểm…');
  try{const revision=await window.NTCGameProgress?.flush();if(Number.isInteger(revision))receipt.payload.vocabularyRecord.progress_revision=revision;send({type:'game-progress-complete',payload:receipt.payload});}catch(e){status('Đã giữ điểm trên thiết bị · Chưa đồng bộ: '+e.message,true);return;}
  clearTimeout(timer);timer=setTimeout(()=>{if(receipt&&!receipt.saved)status('Chưa xác nhận lưu điểm. Nhấn Thử lưu điểm lại.',true);},10000);
 }
 window.ntcMarkVocabularySaved=function(revision){
  if(!receipt)return;receipt.saved=true;clearTimeout(timer);window.NTCGameProgress?.markSaved(Number.isInteger(revision)?revision:(window.NTCGameProgress?.active?.revision??0)+1);
  if(!assignedGameConfig)status('Đã lưu điểm · Xếp hạng lấy điểm tốt nhất của bài này.');
  const button=document.getElementById('vocabularyLeaderboard');if(button)button.disabled=false;
 };
 const originalFinish=finish;
 finish=function(){
  originalFinish();
  if(window.parent===window||!integratedUser?.studentId)return;
  const record={mode,level,unit_key:String(lesson.review?.key??lesson.number),difficulty,correct:firstCorrect,total:firstTotal,score};
  const recordId=window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const scope=(mode==='race'?'Đua xe':'Nghiêng đầu')+' HSK'+level;
  const payload={scopeId:'game:hsk-vocabulary:'+mode+':'+level,scopeLabel:scope,
   unitId:(lesson.review?'review:':'lesson:')+record.unit_key,unitLabel:unitLabel(),
   totalUnits:HSK_VOCAB[level].length+HSKReviews.groups(HSK_VOCAB[level],level).length,
   kind:'game',accuracy:Math.round(firstCorrect/firstTotal*100),score,
   vocabularyRecord:{...record,record_id:recordId,student_id:integratedUser.studentId}};
  receipt={record,saved:false,payload,recordId,owner:integratedUser.studentId};
  const actions=document.querySelector('#results .actions'),board=document.createElement('button');
  board.id='vocabularyLeaderboard';board.type='button';board.className='secondary';
  board.textContent='🏆 Bảng xếp hạng';board.disabled=true;
  board.onclick=()=>{if(receipt?.saved)send({type:'vocabulary-leaderboard-open',record:receipt.record});};
  actions.append(board);
  if(integratedUser.isTeacher){receipt.saved=true;board.disabled=false;return;}
  if(assignedGameConfig)return;
  const box=document.createElement('p');box.id='vocabularySaveStatus';box.setAttribute('role','status');
  const button=document.createElement('button');button.id='vocabularySaveRetry';button.type='button';button.className='secondary';button.textContent='Thử lưu điểm lại';button.hidden=true;button.onclick=retry;
  document.getElementById('results').append(box,button);retry();
 };
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==location.origin||!receipt||assignedGameConfig)return;
  const m=event.data||{};
  if(m.record_id!==receipt.recordId||m.student_id!==receipt.owner||integratedUser?.studentId!==receipt.owner)return;
  if(m.type==='vocabulary-record-saved')window.ntcMarkVocabularySaved(m.revision);
  if(m.type==='vocabulary-record-error'){clearTimeout(timer);status('Chưa lưu điểm: '+String(m.message||'Hãy thử lại.'),true);}
 });
})();
