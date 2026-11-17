/* NGOCTHUCAC LMS — HSK4 wrong-answer review collector.
   IMPORTANT:
   - This file does NOT contain an HSK4 answer key.
   - It reads the answer/state objects that the currently loaded HSK4 page already used to grade itself.
   - If the extracted wrong-question count does not exactly match the page's graded score, no detailed review is stored.
*/
(function(){
  'use strict';
  if (window.HSK4ReviewTracker) return;

  function clean(v){
    return String(v == null ? '' : v).replace(/\s+/g,' ').trim();
  }
  function safeJson(win, expr){
    try {
      const raw = win.eval(`(function(){try{return JSON.stringify(${expr});}catch(e){return null;}})()`);
      return raw ? JSON.parse(raw) : null;
    } catch(_) { return null; }
  }
  function numFromId(id){
    const m = String(id||'').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }
  function normalizeSentence(s){
    return clean(s).replace(/[。！？，、,.!?\s]/g,'');
  }
  function answerLabel(doc, qid, value){
    if (value == null || value === '') return 'Chưa trả lời';
    const raw = String(value);
    const qnum = numFromId(qid);
    const selectors = [
      `#${qid}-opts .opt`, `#qi-${qid} .mcq-opt`, `#mcq-${qid} .mcq-opt`,
      `#qi-${qid} .opt`, `#qi-${qnum} .opt`, `#mc-${qnum}-${raw}`,
      `[name="${qid}"][value="${raw}"]`
    ];
    for (const sel of selectors){
      try {
        const nodes = [...doc.querySelectorAll(sel)];
        for (const n of nodes){
          const el = n.matches && n.matches('input') ? n.parentElement : n;
          const key = el?.querySelector?.('.opt-key,.opt-lbl,.letter')?.textContent || n.value || '';
          if (String(key).trim() === raw || n.value === raw || el?.id?.endsWith('-'+raw)) {
            const t = clean(el?.innerText || el?.textContent);
            if (t) return t;
          }
        }
      } catch(_) {}
    }
    return raw;
  }
  function questionTextFromDom(doc, qid, qnum){
    const candidates = [
      `#${qid}-card`, `#qi-${qid}`, `#qi-q${qnum}`, `#qi-wr${qnum}`,
      `#mcq-q${qnum}`, `#q${qnum}-card`, `#q-${qnum}`, `#question-${qnum}`
    ];
    let root = null;
    for (const sel of candidates){ root = doc.querySelector(sel); if(root) break; }
    if (!root) {
      const numEls = [...doc.querySelectorAll('.q-num,.qnum,.q-number')];
      const hit = numEls.find(el => clean(el.textContent).replace(/\D/g,'') === String(qnum));
      root = hit?.closest('.qi,.q-card,.tf-item,.mcq-item,.question,.wr-item,.fill-item,.ro-item') || null;
    }
    if (!root) return `Câu ${qnum}`;
    const preferred = root.querySelector('.q-text,.q-txt,.mcq-q,.tf-stmt,.tf-text,.q-row,.fill-q,.mcq-qtext,.question-text');
    let t = clean(preferred?.innerText || preferred?.textContent || root.innerText || root.textContent);
    t = t.replace(/(?:✓|✗|⚠).*$/,'').trim();
    return t || `Câu ${qnum}`;
  }
  function makeEntry(doc, qid, student, correct, questionText, explanation){
    const qnum = numFromId(qid);
    return {
      question_number: qnum,
      question_text: clean(questionText || questionTextFromDom(doc,qid,qnum)),
      student_answer: clean(student == null || student === '' ? 'Chưa trả lời' : student),
      correct_answer: clean(correct),
      explanation: clean(explanation || `Đối chiếu: học sinh chọn “${student == null || student === '' ? 'Chưa trả lời' : student}”, đáp án đúng là “${correct}”.`)
    };
  }

  function extractSecs(win, doc){
    const SECS = safeJson(win, `typeof SECS!=='undefined'?SECS:null`);
    if (!SECS) return null;
    const ANS = safeJson(win, `typeof ANS!=='undefined'?ANS:null`) || {};
    const ANS_LABEL = safeJson(win, `typeof ANS_LABEL!=='undefined'?ANS_LABEL:null`) || {};
    const BLANK_ANS = safeJson(win, `typeof BLANK_ANS!=='undefined'?BLANK_ANS:null`) || {};
    const BLANK_TEXT = safeJson(win, `typeof BLANK_TEXT!=='undefined'?BLANK_TEXT:null`) || {};
    const RO_ANS = safeJson(win, `typeof RO_ANS!=='undefined'?RO_ANS:null`) || {};
    const RO_TEXT = safeJson(win, `typeof RO_TEXT!=='undefined'?RO_TEXT:null`) || {};
    const WR_ANS = safeJson(win, `typeof WR_ANS!=='undefined'?WR_ANS:null`) || {};
    const S = safeJson(win, `typeof S!=='undefined'?S:null`) || {};
    const RO = safeJson(win, `typeof RO!=='undefined'?RO:null`) || {};
    const WR = safeJson(win, `typeof WR!=='undefined'?WR:null`) || {};
    const out=[];
    Object.values(SECS).forEach(sec => {
      if (!sec || sec.type === 'free') return;
      (sec.qs||[]).forEach(qid => {
        let student='', correct='', ok=false;
        if (sec.type==='tf' || sec.type==='mcq') {
          student = S[qid]; correct = ANS[qid]; ok = student === correct;
          student = answerLabel(doc,qid,student); correct = answerLabel(doc,qid,correct);
        } else if (sec.type==='fill') {
          const val = S[qid] ?? doc.getElementById(qid)?.dataset?.val ?? '';
          const ans = BLANK_ANS[qid] ?? ANS[qid];
          ok = val === ans;
          student = val ? (BLANK_TEXT[qid] && String(BLANK_TEXT[qid]).startsWith(String(val)) ? BLANK_TEXT[qid] : val) : '';
          correct = ANS_LABEL[qid] || BLANK_TEXT[qid] || ans;
        } else if (sec.type==='reorder') {
          const got = Array.isArray(RO[qid]) ? RO[qid] : [];
          const gotKey = got.join('');
          const ansKey = RO_ANS[qid] ?? ANS[qid] ?? '';
          ok = gotKey === ansKey;
          const map = RO_TEXT[qid] || {};
          student = got.length ? got.map(x=>map[x]||x).join(' / ') : '';
          correct = String(ansKey).split('').map(x=>map[x]||x).join(' / ') || ANS_LABEL[qid] || ansKey;
        } else if (sec.type==='write') {
          const got = Array.isArray(WR[qid]) ? WR[qid] : [];
          const ans = WR_ANS[qid] ?? ANS[qid];
          if (Array.isArray(ans)) {
            ok = got.length===ans.length && got.every((v,i)=>v===ans[i]);
            const textFor = idx => clean(doc.getElementById(`wt-${qid}-${idx}`)?.textContent || idx);
            student = got.length ? got.map(textFor).join('') : '';
            correct = ans.map(textFor).join('');
          } else {
            student = got.join(''); correct = ans || '';
            ok = normalizeSentence(student) === normalizeSentence(correct);
          }
        }
        if (!ok) out.push(makeEntry(doc,qid,student,correct));
      });
    });
    return out.sort((a,b)=>(a.question_number||0)-(b.question_number||0));
  }

  function extractMid(win, doc){
    const TF_ANS = safeJson(win, `typeof TF_ANS!=='undefined'?TF_ANS:null`);
    const MCQ_ANS = safeJson(win, `typeof MCQ_ANS!=='undefined'?MCQ_ANS:null`);
    if (!TF_ANS || !MCQ_ANS) return null;
    const BLANK_ANS = safeJson(win, `typeof BLANK_ANS!=='undefined'?BLANK_ANS:null`) || {};
    const RO_ANS = safeJson(win, `typeof RO_ANS!=='undefined'?RO_ANS:null`) || {};
    const RO_TEXT = safeJson(win, `typeof RO_TEXT!=='undefined'?RO_TEXT:null`) || {};
    const WR_ANS = safeJson(win, `typeof WR_ANS!=='undefined'?WR_ANS:null`) || {};
    const WR_TILES = safeJson(win, `typeof WR_TILES!=='undefined'?WR_TILES:null`) || {};
    const S = safeJson(win, `typeof S!=='undefined'?S:null`) || {};
    const RO = safeJson(win, `typeof RO!=='undefined'?RO:null`) || {};
    const WR = safeJson(win, `typeof WR!=='undefined'?WR:null`) || {};
    const out=[];
    Object.entries(TF_ANS).forEach(([qid,ans])=>{ const got=S[qid]; if(got!==ans) out.push(makeEntry(doc,qid,got,ans)); });
    Object.entries(MCQ_ANS).forEach(([qid,ans])=>{ const got=S[qid]; if(got!==ans) out.push(makeEntry(doc,qid,answerLabel(doc,qid,got),answerLabel(doc,qid,ans))); });
    Object.entries(BLANK_ANS).forEach(([bid,ans])=>{
      const got=doc.getElementById(bid)?.dataset?.val || '';
      // Các mẫu Bài 6–10 dùng id b23...b30 cho ô trống.
      // Khi lưu review phải quy về đúng số câu 23...30, không phải numFromId('b23') theo DOM ngẫu nhiên.
      if(got!==ans) out.push(makeEntry(doc,bid,got,ans,questionTextFromDom(doc,bid,numFromId(bid))));
    });
    Object.entries(RO_ANS).forEach(([qid,ans])=>{
      const got=(RO[qid]||[]).join(''); if(got===ans) return;
      const map=RO_TEXT[qid]||{};
      out.push(makeEntry(doc,qid,(RO[qid]||[]).map(x=>map[x]||x).join(' / '),String(ans).split('').map(x=>map[x]||x).join(' / ')));
    });
    Object.entries(WR_ANS).forEach(([wrid,ans])=>{
      const got=WR[wrid]||[]; const ok=got.length===ans.length && got.every((v,i)=>v===ans[i]); if(ok) return;
      const tiles=WR_TILES[wrid]||[];
      out.push(makeEntry(doc,wrid,got.map(i=>tiles[i]??i).join(''),ans.map(i=>tiles[i]??i).join('')));
    });
    return out.sort((a,b)=>(a.question_number||0)-(b.question_number||0));
  }

  function extractStructured(win, doc, is20){
    const names = is20
      ? {TF:'TF_DATA',M1:'MC1_DATA',M2:'MC2_DATA',W1:'WB1_DATA',W2:'WB2_DATA',W1WORDS:'WB1_WORDS',W2WORDS:'WB2_WORDS',SORT:'SORT_DATA',M3:'MC3_DATA',ARR:'ARR_DATA'}
      : {TF:'TF',M1:'MC1',M2:'MC2',W1:'WB1',W2:'WB2',SORT:'SORT',M3:'MC3_PASSAGES',ARR:'ARR'};
    const TF=safeJson(win,`typeof ${names.TF}!=='undefined'?${names.TF}:null`); if(!TF) return null;
    const M1=safeJson(win,`typeof ${names.M1}!=='undefined'?${names.M1}:[]`)||[];
    const M2=safeJson(win,`typeof ${names.M2}!=='undefined'?${names.M2}:[]`)||[];
    const SORT=safeJson(win,`typeof ${names.SORT}!=='undefined'?${names.SORT}:[]`)||[];
    const M3=safeJson(win,`typeof ${names.M3}!=='undefined'?${names.M3}:[]`)||[];
    const ARR=safeJson(win,`typeof ${names.ARR}!=='undefined'?${names.ARR}:[]`)||[];
    const state=safeJson(win,`typeof state!=='undefined'?state:null`)||{};
    let W1=safeJson(win,`typeof ${names.W1}!=='undefined'?${names.W1}:null`)||{};
    let W2=safeJson(win,`typeof ${names.W2}!=='undefined'?${names.W2}:null`)||{};
    if(is20){
      W1={words:safeJson(win,`typeof ${names.W1WORDS}!=='undefined'?${names.W1WORDS}:null`)||{},questions:W1};
      W2={words:safeJson(win,`typeof ${names.W2WORDS}!=='undefined'?${names.W2WORDS}:null`)||{},questions:W2};
    }
    const out=[];
    TF.forEach(q=>{ const got=state.tf?.[q.id]; if(got!==q.ans) out.push(makeEntry(doc,String(q.id),got===true?'√ Đúng':got===false?'× Sai':'',q.ans?'√ Đúng':'× Sai',q.text)); });
    const mc=[...M1,...M2];
    M3.forEach(p=>{
      if(Array.isArray(p.questions)) mc.push(...p.questions);
      else if(p && p.id!=null && p.ans!=null) mc.push(p);
    });
    mc.forEach(q=>{ const got=state.mc?.[q.id]; if(got!==q.ans) out.push(makeEntry(doc,String(q.id),got?`${got} ${q.opts?.[got]||''}`:'',`${q.ans} ${q.opts?.[q.ans]||''}`,q.stem||'')); });
    [[W1,'g1'],[W2,'g2']].forEach(([wb,key])=>{
      (wb.questions||[]).forEach(q=>{ const got=state.wb?.[key]?.filled?.[q.id]; if(got!==q.ans) out.push(makeEntry(doc,String(q.id),got?`${got} ${wb.words?.[got]||''}`:'',`${q.ans} ${wb.words?.[q.ans]||''}`,`${q.before||q.bef||''}（　）${q.after||q.aft||''}`)); });
    });
    SORT.forEach(q=>{ const got=state.sort?.[q.id]||[]; const ans=Array.isArray(q.ans)?q.ans:String(q.ans||'').split(''); const ok=got.length===ans.length&&got.every((v,i)=>v===ans[i]); if(!ok){ const map=q.items||{}; out.push(makeEntry(doc,String(q.id),got.map(x=>map[x]||x).join(' / '),ans.map(x=>map[x]||x).join(' / '),Object.values(map).join(' / '))); }});
    ARR.forEach(q=>{
      const raw=state.arr?.[q.id]||[];
      // Bài 14–20 lưu mỗi từ đã chọn dưới dạng {word, idx}; bộ chấm chính so sánh mảng word.
      const got=raw.map(v => (v && typeof v==='object') ? v.word : v);
      const ans=q.ans||[];
      const ok=got.length===ans.length&&got.every((v,i)=>v===ans[i]);
      if(!ok) out.push(makeEntry(doc,String(q.id),got.join(' '),ans.join(' '),(q.pool||[]).join(' / ')));
    });
    return out.sort((a,b)=>(a.question_number||0)-(b.question_number||0));
  }

  function readGrade(frame){
    try {
      const doc=frame?.contentDocument;
      if(!doc) return null;
      const ids=['result-score','scoreBig','modal-total','sc-total'];
      for(const id of ids){
        const t=clean(doc.getElementById(id)?.textContent);
        const m=t.match(/(\d+)\s*\/\s*(\d+)/);
        if(m){ const c=Number(m[1]), total=Number(m[2]); if(total>0) return {correct:c,total,percent:Math.round(c/total*10000)/100}; }
      }
      const modal=clean(doc.getElementById('modal-score')?.textContent);
      const n=modal.match(/(\d+)/);
      if(n){ const c=Number(n[1]),total=48; return {correct:c,total,percent:Math.round(c/total*10000)/100}; }
      return null;
    } catch(_){ return null; }
  }

  function collect(frame, expectedWrong){
    try {
      const win=frame?.contentWindow, doc=frame?.contentDocument;
      if(!win||!doc) return {ok:false,reason:'Không truy cập được iframe HSK4.',wrong_answers:[]};
      const file=(frame.getAttribute('src')||'').split('?')[0].split('/').pop();
      if(!/^hsk4-bt\d{2}\.html$/i.test(file)) return {ok:false,reason:'Không phải bài HSK4 SBT.',wrong_answers:[]};
      let rows=extractSecs(win,doc);
      if(rows===null) rows=extractMid(win,doc);
      if(rows===null) rows=extractStructured(win,doc,/hsk4-bt20\.html$/i.test(file));
      if(!Array.isArray(rows)) return {ok:false,reason:'Không nhận diện được cấu trúc bài.',wrong_answers:[]};
      const grade=readGrade(frame);
      const officialWrong = grade ? Math.max(0, grade.total-grade.correct) : (Number.isFinite(expectedWrong)?expectedWrong:null);
      // Exact-count guard: never store a detailed review if it disagrees with the page's own final score.
      if(Number.isFinite(officialWrong) && rows.length!==officialWrong){
        return {ok:false,reason:`Bộ đối chiếu phát hiện ${rows.length} câu sai nhưng bộ chấm chính báo ${officialWrong}; đã chặn lưu để tránh lệch đáp án.`,wrong_answers:rows,grade};
      }
      return {ok:true,reason:'',wrong_answers:rows,grade};
    } catch(err){
      return {ok:false,reason:err?.message||String(err),wrong_answers:[]};
    }
  }

  window.HSK4ReviewTracker={collect,readGrade};
})();
