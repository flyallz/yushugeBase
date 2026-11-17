(() => {
  'use strict';

  const LEVELS = window.HANZI_LEVELS || {};
  const STORAGE_KEY = 'hanzi_eye_v12';
  const QUESTIONS_PER_STAGE = 10;
  const STAGES_PER_LEVEL = 5;
  const UNLOCK_ACCURACY = 70;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const screens = $$('.screen');

  const defaults = () => ({
    unlockedLevel: 1,
    stageUnlocked: {},
    records: {},
    mistakes: {},
    allBestCombo: 0,
    allBestScore: 0,
    allBestAccuracy: 0
  });

  let state = loadState();
  let selectedLevel = 1;
  let selectedMode = 'meaning';
  let selectedStage = 1;
  let run = null;
  let flashTimer = null;
  let answerLocked = false;

  // Voice is optional and isolated from game flow.
  // Shared TTS prioritizes a female Mainland Mandarin voice when the device exposes one.
  function speakCorrectHanzi(char) {
    try {
      if (window.GameCenterTTS && typeof window.GameCenterTTS.speak === 'function') {
        window.GameCenterTTS.speak(char, { rate: 0.82 });
        return;
      }
      if (!char || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new window.SpeechSynthesisUtterance(char);
      u.lang = 'zh-CN'; u.rate = 0.82; u.pitch = 1.03;
      synth.speak(u);
    } catch (_) {}
  }

  function loadState() {
    try {
      return { ...defaults(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
    } catch {
      return defaults();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderHomeStats();
  }

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function showScreen(name) {
    screens.forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  function stageKey(level, mode) {
    return `${level}:${mode}`;
  }

  function recordKey(level, mode, stage) {
    return `${level}:${mode}:${stage}`;
  }

  function getStageUnlocked(level, mode) {
    return Math.min(STAGES_PER_LEVEL, Math.max(1, Number(state.stageUnlocked[stageKey(level, mode)] || 1)));
  }

  function setStageUnlocked(level, mode, stage) {
    state.stageUnlocked[stageKey(level, mode)] = Math.min(STAGES_PER_LEVEL, Math.max(getStageUnlocked(level, mode), stage));
  }

  function getRecord(level, mode, stage) {
    return state.records[recordKey(level, mode, stage)] || {};
  }

  function bestForMode(level, mode) {
    let bestScore = 0;
    let bestAccuracy = 0;
    let bestCombo = 0;
    let plays = 0;
    for (let stage = 1; stage <= STAGES_PER_LEVEL; stage++) {
      const r = getRecord(level, mode, stage);
      bestScore = Math.max(bestScore, r.bestScore || 0);
      bestAccuracy = Math.max(bestAccuracy, r.bestAccuracy || 0);
      bestCombo = Math.max(bestCombo, r.bestCombo || 0);
      plays += r.plays || 0;
    }
    return { bestScore, bestAccuracy, bestCombo, plays };
  }

  function renderHomeStats() {
    $('#homeBestCombo').textContent = state.allBestCombo || 0;
    $('#homeBestScore').textContent = state.allBestScore || 0;
    $('#homeAccuracy').textContent = `${state.allBestAccuracy || 0}%`;
    $('#homeMistakes').textContent = Object.keys(state.mistakes || {}).length;
  }

  function renderLevels() {
    const map = $('#levelMap');
    map.innerHTML = '';

    for (let lv = 1; lv <= 9; lv++) {
      const data = LEVELS[lv];
      const coming = lv >= 7;
      const unlocked = !coming && lv <= state.unlockedLevel;
      const meaningStage = !coming ? getStageUnlocked(lv, 'meaning') : 0;
      const flashStage = !coming ? getStageUnlocked(lv, 'flash') : 0;

      const card = document.createElement('article');
      card.className = `level-card ${unlocked ? '' : 'locked'} ${coming ? 'coming' : ''}`;
      card.innerHTML = `
        <div class="level-head">
          <div class="level-num">${coming ? '—' : String(lv).padStart(2, '0')}</div>
          <div class="level-tier">${coming ? 'CAO CẤP' : escapeHtml(data.tier.toUpperCase())}</div>
        </div>
        <h3>Level ${lv}</h3>
        <p>${coming ? 'Nội dung dành cho giai đoạn nâng cao sẽ được cập nhật sau.' : '50 câu cố định · 5 bậc · 10 nhóm chữ gần giống'}</p>
        ${coming ? '' : `
          <div class="level-progress-lines">
            <span>Nhìn nghĩa <b>Bậc ${meaningStage}/5</b></span>
            <span>Flash <b>Bậc ${flashStage}/5</b></span>
          </div>`}
        <button ${unlocked ? '' : 'disabled'} data-open-level="${lv}">${coming ? 'Sắp cập nhật' : unlocked ? 'Vào Level' : 'Chưa mở khóa'}</button>`;
      map.appendChild(card);
    }

    $$('[data-open-level]').forEach(btn => {
      btn.addEventListener('click', () => openLevel(Number(btn.dataset.openLevel)));
    });
  }

  function openLevel(level) {
    if (level > 6 || level > state.unlockedLevel) return;
    selectedLevel = level;
    selectedMode = 'meaning';
    selectedStage = Math.min(selectedStage, getStageUnlocked(level, selectedMode));
    renderModeScreen();
    showScreen('mode');
  }

  function renderModeScreen() {
    const data = LEVELS[selectedLevel];
    $('#modeLevelTag').textContent = data.tier.toUpperCase();
    $('#modeTitle').textContent = `Level ${selectedLevel}`;
    $('#modeDesc').textContent = `50 câu · 5 bậc × 10 câu · Flash ${formatSeconds(data.flashMs)} giây`;
    $('#levelEmblem').textContent = String(selectedLevel).padStart(2, '0');

    $$('.mode-card').forEach(card => {
      const mode = card.dataset.mode;
      card.classList.toggle('selected', mode === selectedMode);
      const progress = $('.mode-progress', card);
      if (progress) progress.textContent = `Đã mở tới Bậc ${getStageUnlocked(selectedLevel, mode)}/5`;
    });

    $('#stageModeName').textContent = selectedMode === 'meaning' ? 'Nhìn nghĩa tìm chữ' : 'Flash nhận diện';
    renderStages();
  }

  function renderStages() {
    const grid = $('#stageGrid');
    grid.innerHTML = '';
    const unlocked = getStageUnlocked(selectedLevel, selectedMode);

    for (let stage = 1; stage <= STAGES_PER_LEVEL; stage++) {
      const isUnlocked = stage <= unlocked;
      const r = getRecord(selectedLevel, selectedMode, stage);
      const btn = document.createElement('button');
      btn.className = `stage-btn ${isUnlocked ? '' : 'locked'} ${selectedStage === stage && isUnlocked ? 'current' : ''}`;
      btn.disabled = !isUnlocked;
      btn.innerHTML = `
        <span class="stage-index">Bậc ${stage}</span>
        <strong>10 câu</strong>
        <small>${r.bestAccuracy ? `Tốt nhất ${r.bestAccuracy}%` : isUnlocked ? 'Sẵn sàng luyện' : 'Chưa mở khóa'}</small>`;
      if (isUnlocked) {
        btn.addEventListener('click', () => {
          selectedStage = stage;
          startGame(stage);
        });
      }
      grid.appendChild(btn);
    }

    $('#stageHelp').textContent = unlocked < STAGES_PER_LEVEL
      ? `Đạt từ ${UNLOCK_ACCURACY}% ở Bậc ${unlocked} để mở Bậc ${unlocked + 1}.`
      : `Bạn đã mở đủ 5 bậc của chế độ này.`;
  }

  function buildStageQuestions(level, stage, mode) {
    const data = LEVELS[level];
    const targetIndex = stage - 1;
    const questions = data.families.map((family, fi) => {
      const [char, pinyin, meaning] = family.chars[targetIndex];
      return {
        id: `L${level}-S${stage}-F${fi}-${mode}`,
        level,
        stage,
        mode,
        target: char,
        pinyin,
        meaning,
        options: shuffle(family.chars.map(item => item[0])),
        family,
        fi
      };
    });
    return shuffle(questions);
  }

  function startGame(stage = selectedStage) {
    selectedStage = stage;
    const unlocked = getStageUnlocked(selectedLevel, selectedMode);
    if (selectedStage > unlocked) {
      toast('Bậc này chưa được mở khóa.');
      return;
    }

    const questions = buildStageQuestions(selectedLevel, selectedStage, selectedMode);
    run = {
      level: selectedLevel,
      stage: selectedStage,
      mode: selectedMode,
      questions,
      index: 0,
      score: 0,
      correct: 0,
      combo: 0,
      bestCombo: 0,
      answered: 0
    };
    showScreen('game');
    renderQuestion();
  }

  function renderQuestion() {
    clearTimeout(flashTimer);
    answerLocked = false;
    const q = run.questions[run.index];

    $('#questionCounter').textContent = `${run.index + 1}/${QUESTIONS_PER_STAGE}`;
    $('#progressBar').style.width = `${((run.index + 1) / QUESTIONS_PER_STAGE) * 100}%`;
    $('#scoreDisplay').textContent = `${run.score} điểm`;
    $('#gameStageLabel').textContent = `Level ${run.level} · Bậc ${run.stage}`;
    $('#comboBanner').classList.remove('show');

    const feedback = $('#feedbackBox');
    feedback.className = 'feedback-box';
    feedback.innerHTML = '';

    const grid = $('#answersGrid');
    grid.innerHTML = '';

    if (run.mode === 'meaning') {
      $('#questionType').textContent = 'NHÌN NGHĨA TÌM CHỮ';
      $('#promptArea').innerHTML = `
        <div class="meaning-prompt">
          <div class="label">Chọn chữ Hán phù hợp với nghĩa</div>
          <div class="meaning">${escapeHtml(q.meaning)}</div>
          <div class="hint">5 chữ cùng nhóm hình dạng — quan sát bộ phận khác nhau</div>
        </div>`;
      renderAnswers(q);
    } else {
      $('#questionType').textContent = `FLASH ${formatSeconds(LEVELS[run.level].flashMs)} GIÂY`;
      $('#promptArea').innerHTML = `<div class="flash-char">${q.target}</div>`;
      flashTimer = setTimeout(() => {
        $('#promptArea').innerHTML = `
          <div class="flash-mask">
            <span>?</span>
            <small>Chữ vừa xuất hiện là chữ nào?</small>
          </div>`;
        renderAnswers(q);
      }, LEVELS[run.level].flashMs);
    }
  }

  function renderAnswers(q) {
    const grid = $('#answersGrid');
    grid.innerHTML = '';
    q.options.forEach(char => {
      const b = document.createElement('button');
      b.className = 'answer-btn';
      b.textContent = char;
      b.dataset.char = char;
      b.addEventListener('click', () => answerQuestion(char, b));
      grid.appendChild(b);
    });
  }

  function pointsForCombo(combo) {
    if (combo >= 8) return 30;
    if (combo >= 5) return 20;
    if (combo >= 3) return 15;
    return 10;
  }

  function answerQuestion(choice, btn) {
    if (answerLocked) return;
    answerLocked = true;

    const q = run.questions[run.index];
    const correct = choice === q.target;
    run.answered++;

    $$('.answer-btn').forEach(b => {
      b.disabled = true;
      if (b.dataset.char === q.target) b.classList.add('correct');
      else if (b === btn && !correct) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    const feedback = $('#feedbackBox');

    if (correct) {
      run.correct++;
      run.combo++;
      run.bestCombo = Math.max(run.bestCombo, run.combo);
      const pts = pointsForCombo(run.combo);
      run.score += pts;
      speakCorrectHanzi(q.target);

      feedback.className = 'feedback-box show ok';
      feedback.innerHTML = `
        <strong>Chính xác.</strong>
        <span class="chars">${q.target}</span>
        <strong>${escapeHtml(q.pinyin)}</strong> — ${escapeHtml(q.meaning)}
        <span class="point-add">+${pts} điểm</span>`;

      if (run.combo >= 3) {
        const cb = $('#comboBanner');
        cb.textContent = `COMBO × ${run.combo}`;
        cb.classList.add('show');
      }
    } else {
      run.combo = 0;
      addMistake(q);
      const selectedInfo = q.family.chars.find(item => item[0] === choice);
      feedback.className = 'feedback-box show bad';
      feedback.innerHTML = `
        <strong>Chưa chính xác.</strong>
        Bạn chọn <span class="chars">${choice}</span>
        ${selectedInfo ? `<strong>${escapeHtml(selectedInfo[1])}</strong> — ${escapeHtml(selectedInfo[2])}.` : ''}
        Đáp án đúng: <span class="chars">${q.target}</span>
        <strong>${escapeHtml(q.pinyin)}</strong> — ${escapeHtml(q.meaning)}.<br>
        <strong>Nhận diện:</strong> ${escapeHtml(q.family.tip)}`;
    }

    $('#scoreDisplay').textContent = `${run.score} điểm`;

    setTimeout(() => {
      if (run.index < QUESTIONS_PER_STAGE - 1) {
        run.index++;
        renderQuestion();
      } else {
        finishGame();
      }
    }, correct ? 1450 : 1900);
  }

  function addMistake(q) {
    const key = `L${q.level}-F${q.fi}`;
    if (!state.mistakes[key]) {
      state.mistakes[key] = {
        level: q.level,
        familyName: q.family.name,
        chars: q.family.chars,
        count: 0,
        tip: q.family.tip
      };
    }
    state.mistakes[key].count++;
    saveState();
  }

  function finishGame() {
    const accuracy = Math.round((run.correct / QUESTIONS_PER_STAGE) * 100);
    const key = recordKey(run.level, run.mode, run.stage);
    const prev = state.records[key] || { bestScore: 0, bestAccuracy: 0, bestCombo: 0, plays: 0 };

    state.records[key] = {
      bestScore: Math.max(prev.bestScore, run.score),
      bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
      bestCombo: Math.max(prev.bestCombo, run.bestCombo),
      plays: (prev.plays || 0) + 1
    };

    state.allBestCombo = Math.max(state.allBestCombo || 0, run.bestCombo);
    state.allBestScore = Math.max(state.allBestScore || 0, run.score);
    state.allBestAccuracy = Math.max(state.allBestAccuracy || 0, accuracy);

    let noticeText = '';
    if (accuracy >= UNLOCK_ACCURACY) {
      if (run.stage < STAGES_PER_LEVEL && getStageUnlocked(run.level, run.mode) === run.stage) {
        setStageUnlocked(run.level, run.mode, run.stage + 1);
        noticeText = `Đã mở Bậc ${run.stage + 1} của chế độ này.`;
      } else if (run.stage === STAGES_PER_LEVEL && run.level < 6 && state.unlockedLevel === run.level) {
        state.unlockedLevel = run.level + 1;
        noticeText = `Đã hoàn thành Bậc 5 và mở Level ${run.level + 1}.`;
      }
    }

    if (!noticeText && accuracy < UNLOCK_ACCURACY) {
      noticeText = `Cần đạt từ ${UNLOCK_ACCURACY}% để mở bậc tiếp theo.`;
    }

    saveState();
    renderLevels();
    renderRecords();
    renderMistakes();

    $('#resultLevel').textContent = `LEVEL ${run.level} · BẬC ${run.stage} · ${run.mode === 'meaning' ? 'NHÌN NGHĨA' : 'FLASH'}`;
    $('#resultTitle').textContent = accuracy >= 90 ? 'Kết quả xuất sắc' : accuracy >= 70 ? 'Hoàn thành tốt' : 'Cần củng cố thêm';
    $('#resultScore').textContent = run.score;
    $('#resultCorrect').textContent = `${run.correct}/${QUESTIONS_PER_STAGE}`;
    $('#resultCombo').textContent = `×${run.bestCombo}`;
    $('#resultAccuracy').textContent = `${accuracy}%`;

    const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 50 ? 1 : 0;
    $('#resultStars').textContent = '●'.repeat(stars) + '○'.repeat(3 - stars);

    const notice = $('#unlockNotice');
    if (noticeText) {
      notice.textContent = noticeText;
      notice.classList.add('show');
    } else {
      notice.classList.remove('show');
    }

    const nextStep = $('#nextStep');
    nextStep.hidden = true;
    nextStep.onclick = null;
    if (accuracy >= UNLOCK_ACCURACY && run.stage < STAGES_PER_LEVEL) {
      nextStep.textContent = `Tiếp tục Bậc ${run.stage + 1}`;
      nextStep.hidden = false;
      nextStep.onclick = () => {
        selectedStage = run.stage + 1;
        startGame(selectedStage);
      };
    } else if (accuracy >= UNLOCK_ACCURACY && run.stage === STAGES_PER_LEVEL && run.level < 6) {
      nextStep.textContent = `Vào Level ${run.level + 1}`;
      nextStep.hidden = false;
      nextStep.onclick = () => openLevel(run.level + 1);
    }

    showScreen('result');
  }

  function renderMistakes() {
    const wrap = $('#mistakeList');
    const entries = Object.values(state.mistakes || {}).sort((a, b) => b.count - a.count);

    if (!entries.length) {
      wrap.innerHTML = '<div class="empty-state">Chưa có nhóm chữ nào được ghi nhận. Sau khi chơi, các nhóm bạn thường nhầm sẽ xuất hiện tại đây.</div>';
      return;
    }

    wrap.innerHTML = entries.map(m => `
      <article class="mistake-card">
        <div class="mistake-meta">Level ${m.level} · ${escapeHtml(m.familyName || 'Nhóm chữ')}</div>
        <div class="mistake-chars">${m.chars.map(c => c[0]).join(' · ')}</div>
        <div class="mistake-meanings">${m.chars.map(c => `<span><strong>${c[0]}</strong> ${escapeHtml(c[1])} — ${escapeHtml(c[2])}</span>`).join('')}</div>
        <p><strong>Điểm phân biệt:</strong> ${escapeHtml(m.tip)}</p>
        <span class="mistake-count">Đã nhầm ${m.count} lần</span>
      </article>`).join('');
  }

  function renderRecords() {
    let rows = '';
    for (let lv = 1; lv <= 6; lv++) {
      for (const mode of ['meaning', 'flash']) {
        const r = bestForMode(lv, mode);
        rows += `
          <tr>
            <td>Level ${lv}</td>
            <td>${mode === 'meaning' ? 'Nhìn nghĩa' : 'Flash'}</td>
            <td>Bậc ${getStageUnlocked(lv, mode)}/5</td>
            <td>${r.bestScore}</td>
            <td>${r.bestAccuracy}%</td>
            <td>×${r.bestCombo}</td>
            <td>${r.plays}</td>
          </tr>`;
      }
    }

    $('#recordsTable').innerHTML = `
      <table class="records-table">
        <thead>
          <tr><th>Cấp độ</th><th>Chế độ</th><th>Tiến độ</th><th>Điểm tốt nhất</th><th>Độ chính xác</th><th>Combo</th><th>Lượt đã chơi</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function modal(title, text, onConfirm) {
    const m = $('#modal');
    $('#modalTitle').textContent = title;
    $('#modalText').textContent = text;
    const confirm = $('#modalConfirm');
    const cancel = $('#modalCancel');

    confirm.style.display = onConfirm ? 'inline-flex' : 'none';
    confirm.onclick = () => {
      m.hidden = true;
      if (onConfirm) onConfirm();
    };
    cancel.onclick = () => { m.hidden = true; };
    m.onclick = event => { if (event.target === m) m.hidden = true; };
    m.hidden = false;
    cancel.focus();
  }

  function formatSeconds(ms) {
    return (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1);
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>'"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
  }

  document.addEventListener('keydown', event => {
    const m = $('#modal');
    if (event.key === 'Escape' && !m.hidden) m.hidden = true;
  });

  $$('.nav-btn').forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.screen;
    if (s === 'levels') renderLevels();
    if (s === 'mistakes') renderMistakes();
    if (s === 'records') renderRecords();
    showScreen(s);
  }));

  $$('[data-go]').forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.go;
    if (s === 'levels') renderLevels();
    showScreen(s);
  }));

  $$('[data-quick-play]').forEach(b => b.addEventListener('click', () => openLevel(Number(b.dataset.quickPlay))));

  $$('.mode-card').forEach(card => card.addEventListener('click', () => {
    selectedMode = card.dataset.mode;
    selectedStage = Math.min(selectedStage, getStageUnlocked(selectedLevel, selectedMode));
    renderModeScreen();
  }));

  $('#quitGame').addEventListener('click', () => {
    clearTimeout(flashTimer);
    try { if (window.GameCenterTTS) window.GameCenterTTS.stop(); else if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
    renderModeScreen();
    showScreen('mode');
  });

  $('#playAgain').addEventListener('click', () => startGame(selectedStage));

  $('#resetTestData').addEventListener('click', () => modal(
    'Xóa dữ liệu thử nghiệm?',
    'Điểm số, Level/Bậc đã mở, Combo và sổ chữ hay nhầm trên thiết bị này sẽ được đặt lại.',
    () => {
      state = defaults();
      selectedLevel = 1;
      selectedMode = 'meaning';
      selectedStage = 1;
      saveState();
      renderLevels();
      renderMistakes();
      renderRecords();
      showScreen('home');
      toast('Đã xóa dữ liệu thử nghiệm.');
    }
  ));

  renderHomeStats();
  renderLevels();
  renderMistakes();
  renderRecords();
})();
