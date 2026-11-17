/* NGOCTHUCAC LMS — generic result bridge for HSK1–HSK3.
   Runs inside lesson iframe and sends only completed exercise results to index.html.
   No Supabase key or student identity is stored here. */
(function () {
  'use strict';
  if (window.__NGOCTHUCAC_RESULT_BRIDGE__) return;
  window.__NGOCTHUCAC_RESULT_BRIDGE__ = true;

  let lastSignature = '';
  let scanTimer = null;

  function text(el) {
    return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function postResult(correct, total, exerciseName) {
    correct = Number(correct);
    total = Number(total);
    if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return;
    correct = Math.max(0, Math.min(total, correct));
    const score = Math.round((correct / total) * 10000) / 100;
    const signature = [exerciseName || 'Bài tập', correct, total, score].join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    try {
      window.parent.postMessage({
        type: 'learningResult',
        payload: {
          exerciseName: exerciseName || 'Bài tập ôn tập',
          score: score,
          correct: correct,
          total: total
        }
      }, '*');
    } catch (e) {}
  }

  function parseRatio(value) {
    const m = String(value || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    const correct = Number(m[1]);
    const total = Number(m[2]);
    if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
    return { correct, total };
  }

  function scanExplicitScores() {
    const candidates = [
      ['dgScore', 'Bài tập tổng hợp'],
      ['dragScore', 'Bài tập tổng hợp'],
      ['quizScore', 'Bài tập ôn tập'],
      ['oldQuizScore', 'Bài tập ôn tập']
    ];
    for (const [id, label] of candidates) {
      const el = document.getElementById(id);
      if (!el) continue;
      const value = text(el);
      if (!value || /toàn bộ đáp án|đáp án đúng/i.test(value)) continue;
      const ratio = parseRatio(value);
      if (ratio) {
        postResult(ratio.correct, ratio.total, label);
        return true;
      }
    }
    return false;
  }

  function scanOldQuiz() {
    const scope = document.getElementById('tab-oldquiz');
    if (!scope) return false;
    const answers = Array.from(scope.querySelectorAll('.question .ans'));
    if (answers.length < 2) return false;
    const answered = answers.filter(el => el.classList.contains('correct') || el.classList.contains('wrong'));
    if (answered.length !== answers.length) return false;
    const correct = answered.filter(el => el.classList.contains('correct')).length;
    postResult(correct, answers.length, 'Bài tập ôn tập');
    return true;
  }

  function scan() {
    scanTimer = null;
    const completed = scanExplicitScores() || scanOldQuiz();
    if (!completed) lastSignature = '';
  }

  function queueScan(delay) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, delay || 180);
  }

  function start() {
    queueScan(50);
    const observer = new MutationObserver(function () { queueScan(180); });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['class', 'style']
    });
    document.addEventListener('click', function () { queueScan(250); }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
