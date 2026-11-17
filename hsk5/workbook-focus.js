/* Presentation only. Existing lesson, grading, audio and LMS handlers remain intact. */
(function () {
  'use strict';
  const VERSION = '20261019-3';
  const path = location.pathname;
  const BOOKS = [
    { folder: 'HSK4_20_Bai', kind: 'hsk4', label: 'HSK4' },
    { folder: 'HSK5_36_Bai', kind: 'hsk5', label: 'HSK5' },
    { folder: 'HSK6_Thuong_Bai_01_20', kind: 'hsk6', label: 'HSK6上' },
    { folder: 'HSK6_Ha_Bai_21_40', kind: 'hsk6', label: 'HSK6下' }
  ];
  const book = BOOKS.find(b => path.endsWith('/' + b.folder + '/index.html'));
  function style(doc, id, css) {
    if (doc.getElementById(id)) return;
    const el = doc.createElement('style');
    el.id = id;
    el.textContent = css;
    (doc.head || doc.documentElement).append(el);
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  const ROOT_CSS = `
html.ntc-book-focus #topbar,html.ntc-book-focus #sidebar,
html.ntc-book-focus #sidebarOverlay{display:none!important}
html.ntc-book-focus .main{margin-left:0!important;padding-top:0!important;height:100vh;height:100dvh;min-height:0}
html.ntc-book-focus #iframeView{min-height:0;overflow:hidden}
html.ntc-book-focus #contentFrame{min-height:0}
html.ntc-book-focus #iframeView>.iframe-toolbar{min-height:48px;flex:0 0 auto;gap:10px;padding:5px 12px;flex-wrap:nowrap;background:#fffaf9}
html.ntc-book-focus #contentBack,html.ntc-book-focus #ntcBookListToggle,
html.ntc-book-focus #lessonHomeworkToggle{min-height:36px;padding:6px 12px;font:600 13px/1.3 system-ui;white-space:nowrap;border-radius:9px}
html.ntc-book-focus #iframeTitle{font-size:14px;line-height:1.3;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#ntcBookListToggle{border:1px solid #e4cdd4;background:#fff;color:#8b4058;cursor:pointer;display:none}
html.ntc-book-focus #ntcBookListToggle{display:inline-flex;align-items:center;gap:5px}
#ntcBookListToggle[hidden]{display:none!important}
#ntcBookListToggle:focus-visible{outline:3px solid #b26b82;outline-offset:2px}
html.ntc-book-focus #lessonHomeworkPanel{top:48px}
@media(max-width:680px){
html.ntc-book-focus #iframeView>.iframe-toolbar{gap:6px;padding:5px 7px}
html.ntc-book-focus #contentBack,html.ntc-book-focus #ntcBookListToggle{font-size:12px;padding:6px 8px;min-height:36px}
html.ntc-book-focus #iframeTitle{font-size:12px}
html.ntc-book-focus #lessonHomeworkToggle{font-size:11px;padding:6px;max-width:100px;white-space:normal}
html.ntc-book-focus #iframeView.drawer-open #lessonHomeworkPanel{top:auto}
}`;
  const MENU_CSS = `
html.ntc-book-embedded,html.ntc-book-embedded body{height:100%;margin:0;overflow:hidden}
html.ntc-book-embedded body>.header,html.ntc-book-embedded body>.topbar{display:none!important}
html.ntc-book-embedded .lessonbar{display:none!important}
html.ntc-book-embedded body>.layout,html.ntc-book-embedded body>#shell{
height:100vh!important;height:100dvh!important;display:block!important;transition:none!important}
html.ntc-book-embedded .main,html.ntc-book-embedded #main{height:100%;min-height:0;min-width:0;overflow:hidden}
html.ntc-book-embedded #stage{height:100%;min-height:0}
html.ntc-book-embedded #lessonFrame{width:100%;height:100%;min-height:0;border:0;display:block}
html.ntc-book-embedded #lessonFrame[hidden],html.ntc-book-embedded #stage[hidden]{display:none!important}
html.ntc-book-embedded #sidebar{
position:fixed!important;top:0!important;bottom:0!important;left:0!important;width:min(350px,88vw)!important;
height:100%!important;z-index:60!important;box-sizing:border-box;box-shadow:8px 0 30px #493a3633;
background:#fffaf9;overflow-y:auto;overscroll-behavior:contain;transition:none!important}
html.ntc-book-embedded.ntc-book-list-open #sidebar{visibility:visible!important;transform:none!important;pointer-events:auto!important}
html.ntc-book-embedded:not(.ntc-book-list-open) #sidebar{display:none!important}
html.ntc-book-embedded.ntc-book-list-open #scrim,html.ntc-book-embedded.ntc-book-list-open #veil{
display:block!important;position:fixed!important;inset:0!important;z-index:59!important;background:#38272b55;
border:0!important;border-radius:0!important;padding:0;width:100%;height:100%}
html.ntc-book-embedded:not(.ntc-book-list-open) #scrim,
html.ntc-book-embedded:not(.ntc-book-list-open) #veil{display:none!important}
html.ntc-book-embedded .sidehead{position:relative;padding-right:55px}
html.ntc-book-embedded .ntc-book-step-nav{display:flex;gap:8px;margin-top:12px}
html.ntc-book-embedded .ntc-book-step-nav .btn{padding:6px 9px;min-height:36px;font-size:13px}
#ntcBookCloseList{position:absolute;right:12px;top:12px;min-width:36px;min-height:36px;padding:4px 10px;
font:600 20px/1 system-ui;border:1px solid #e4cdd4;border-radius:9px;background:#fff;color:#8b4058;cursor:pointer}
`;
  const LESSON_CSS = `
html.ntc-lesson-focus{scroll-padding-top:80px}
html.ntc-lesson-focus body>header .lesson-hero{display:none!important}
html.ntc-lesson-focus body>header:not(.top){margin:10px auto 12px!important}
html.ntc-lesson-focus .section-links{margin:6px 0!important;gap:14px;flex-wrap:wrap}
html.ntc-lesson-focus #timerHint{font-size:13px;line-height:1.5;margin:6px 0!important}
html.ntc-lesson-focus .toolbar .tools{max-width:1200px;padding:6px 14px!important;gap:8px!important;
display:grid!important;grid-template-columns:44px minmax(110px,145px) minmax(120px,1fr) 70px 78px auto;align-items:center}
html.ntc-lesson-focus .toolbar audio{height:36px!important;width:100%!important;min-width:0!important;margin:0!important;order:0!important}
html.ntc-lesson-focus .toolbar button,html.ntc-lesson-focus .toolbar select{font-size:14px!important;padding:6px!important;min-height:36px;min-width:0;max-width:100%;border-radius:9px}
html.ntc-lesson-focus #clock{font-size:21px!important;padding:0 4px!important;min-width:0;font-variant-numeric:tabular-nums}
html.ntc-lesson-focus .progress-panel{top:58px;max-height:calc(100dvh - 80px)}
html.ntc-lesson-focus body>header.top .bar>div:first-child{display:none!important}
html.ntc-lesson-focus body>header.top .bar{max-width:1100px;padding:5px 16px!important;min-height:46px}
html.ntc-lesson-focus body>header.top .actions{margin-left:auto;gap:8px}
html.ntc-lesson-focus body>header.top button{min-height:36px;padding:6px 12px;font-size:14px;border-radius:9px}
html.ntc-lesson-focus body>main>h1,html.ntc-lesson-focus body>main>.badge{display:none!important}
html.ntc-lesson-focus body>main:not(.wrap){padding-top:12px}
html.ntc-lesson-focus body>main>.intro{font-size:14px;line-height:1.6;margin:0 0 14px}
@media(max-width:680px){
html.ntc-lesson-focus .toolbar .tools{padding:5px 6px!important;gap:4px!important;
grid-template-columns:34px minmax(60px,1fr) 52px 55px 78px}
html.ntc-lesson-focus .toolbar audio{grid-column:1/-1;grid-row:1}
html.ntc-lesson-focus .toolbar button,html.ntc-lesson-focus .toolbar select{font-size:12px!important;padding:4px!important;min-height:32px}
html.ntc-lesson-focus #clock{font-size:18px!important;text-align:center;margin:0!important}
html.ntc-lesson-focus .toolbar #progressToggle{font-size:11px!important}
html.ntc-lesson-focus .progress-panel{top:90px;max-height:calc(100dvh - 110px)}
html.ntc-lesson-focus body>header.top .bar{padding:5px 10px!important}
html.ntc-lesson-focus body>header.top button{font-size:13px;padding:6px 9px}
html.ntc-lesson-focus .section-links{gap:10px}
html.ntc-lesson-focus .section-links a{font-size:14px}
}
@media print{html.ntc-lesson-focus .toolbar,html.ntc-lesson-focus body>header.top{display:none!important}}
`;
  function rootInit() {
    const frame = document.getElementById('contentFrame');
    const view = document.getElementById('iframeView');
    const title = document.getElementById('iframeTitle');
    const bar = view?.querySelector('.iframe-toolbar');
    if (!frame || !view || !title || !bar || window.NTCWorkbookLayout) return;
    style(document, 'ntc-workbook-root-style', ROOT_CSS);
    const button = document.createElement('button');
    button.id = 'ntcBookListToggle';
    button.type = 'button';
    button.textContent = '☰ Danh sách bài';
    button.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    bar.append(button);
    let child = null;
    function info() {
      try {
        const url = new URL(frame.getAttribute('src') || '', location.href);
        if (url.origin !== location.origin || url.searchParams.get('lms') !== '1') return null;
        return BOOKS.find(b => url.pathname.endsWith('/' + b.folder + '/index.html')) || null;
      } catch (_) { return null; }
    }
    function update() {
      if (!window.document?.documentElement) return;
      const active = !!info() && document.body.classList.contains('lesson-focus-mode') && view.style.display !== 'none';
      document.documentElement.classList.toggle('ntc-book-focus', active);
      let current = null;
      try {
        if (child && frame.contentWindow === child && child.location.href === frame.src) current = child.NTCWorkbookBookUI;
      } catch (_) { /* An unrelated or cross-origin frame never receives styles. */ }
      button.hidden = !active || !current;
      button.setAttribute('aria-expanded', String(!!current?.isOpen()));
      if (active && current) {
        const label = current.title();
        if (label && title.textContent !== label) title.textContent = label;
        title.title = label;
      }
    }
    window.NTCWorkbookLayout = {
      version: VERSION,
      attach(w) {
        if (frame.contentWindow !== w || !info()) return;
        child = w;
        update();
      },
      update,
      focusListButton() { if (!button.hidden) button.focus(); }
    };
    button.addEventListener('click', () => {
      try { child?.NTCWorkbookBookUI?.toggle(); } catch (_) { /* Navigation is still loading. */ }
      update();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.documentElement.classList.contains('ntc-book-focus')) {
        try { child?.NTCWorkbookBookUI?.close(); } catch (_) { /* Unloaded child. */ }
      }
    });
    frame.addEventListener('load', () => {
      try { child = frame.contentWindow.NTCWorkbookBookUI ? frame.contentWindow : null; } catch (_) { child = null; }
      update();
    });
    const observer = new MutationObserver(update);
    observer.observe(frame, { attributes: true, attributeFilter: ['src'] });
    observer.observe(view, { attributes: true, attributeFilter: ['style', 'class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    update();
  }
  function bookInit() {
    const frame = document.getElementById('lessonFrame');
    const sidebar = document.getElementById('sidebar');
    if (!frame || !sidebar || window.NTCWorkbookBookUI) return;
    const menuButton = document.getElementById(book.kind === 'hsk4' ? 'menuToggle' : book.kind === 'hsk5' ? 'menu' : 'menuBtn');
    const main = document.getElementById(book.kind === 'hsk5' ? 'main' : 'stage') || document.querySelector('.main');
    function isOpen() { return menuButton?.getAttribute('aria-expanded') === 'true'; }
    function notify() {
      if (!window.document?.documentElement) return;
      const open = isOpen();
      document.documentElement.classList.toggle('ntc-book-list-open', open);
      if (main) main.inert = open;
      try { parent.NTCWorkbookLayout?.update(); } catch (_) { /* Parent navigated. */ }
    }
    function setOpen(open) {
      if (typeof window.setMenu === 'function' && book.kind === 'hsk4') window.setMenu(open);
      else if (typeof window.setSidebar === 'function' && book.kind === 'hsk5') window.setSidebar(open);
      else if (typeof window.setDrawer === 'function' && book.kind === 'hsk6') window.setDrawer(open);
      notify();
      if (open) {
        (sidebar.querySelector('#ntcBookCloseList,#closeMenu,#close,input,button,a') || sidebar).focus();
        sidebar.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
      }
    }
    function title() {
      const current = document.getElementById(book.kind === 'hsk5' ? 'current' : 'currentTitle');
      return book.label + ' · ' + (current?.textContent.trim() || 'Sách bài tập');
    }
    function close() {
      if (!isOpen()) return;
      setOpen(false);
      try { parent.NTCWorkbookLayout?.focusListButton(); } catch (_) { /* Parent navigated. */ }
    }
    window.NTCWorkbookBookUI = { title, isOpen, toggle() { setOpen(!isOpen()); }, close };
    if (book.kind === 'hsk6') {
      // Keep both original previous/next buttons, inside the on-demand list.
      const nav = document.querySelector('.lessonbar .nav');
      if (nav) {
        nav.classList.add('ntc-book-step-nav');
        (sidebar.querySelector('.sidehead') || sidebar).append(nav);
      }
      const button = document.createElement('button');
      button.id = 'ntcBookCloseList'; button.type = 'button'; button.textContent = '×';
      button.setAttribute('aria-label', 'Đóng danh sách bài');
      button.addEventListener('click', close);
      (sidebar.querySelector('.sidehead') || sidebar).append(button);
    }
    function lessonReady() {
      try {
        const doc = frame.contentDocument;
        const url = new URL(frame.src, location.href);
        if (!doc?.body || url.origin !== location.origin || url.searchParams.get('lms') !== '1' ||
            !url.pathname.includes('/' + book.folder + '/') || !doc.getElementById('exercise')) return;
        style(doc, 'ntc-workbook-lesson-style', LESSON_CSS);
        doc.documentElement.classList.add('ntc-lesson-focus');
      } catch (_) { /* Do not touch cross-origin or unrelated lesson content. */ }
      notify();
    }
    frame.addEventListener('load', lessonReady);
    const observer = new MutationObserver(notify);
    observer.observe(menuButton, { attributes: true, attributeFilter: ['aria-expanded'] });
    const current = document.getElementById(book.kind === 'hsk5' ? 'current' : 'currentTitle');
    if (current) observer.observe(current, { childList: true, subtree: true, characterData: true });
    document.addEventListener('keydown', e => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      if (e.key === 'Tab') {
        const controls = Array.from(sidebar.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')).filter(el => !el.disabled && !el.hidden);
        const first = controls[0], last = controls.at(-1);
        if (first && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (last && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }, true);
    // Existing handlers retain list navigation and close-after-selection behavior.
    sidebar.addEventListener('click', () => {
      queueMicrotask(() => {
        if (!window.document?.documentElement) return;
        notify();
        if (!isOpen()) {
          try { parent.NTCWorkbookLayout?.focusListButton(); } catch (_) { /* Parent navigated. */ }
        }
      });
    });
    notify();
    try { parent.NTCWorkbookLayout.attach(window); } catch (_) { /* Parent navigated. */ }
    lessonReady();
  }
  if (book) {
    let embedded = false;
    try { embedded = parent !== window && parent.location.origin === location.origin && !!parent.NTCWorkbookLayout && new URLSearchParams(location.search).get('lms') === '1'; } catch (_) { /* Standalone. */ }
    if (!embedded) return;
    document.documentElement.classList.add('ntc-book-embedded');
    style(document, 'ntc-workbook-menu-style', MENU_CSS);
    ready(bookInit);
  } else ready(rootInit);
})();
