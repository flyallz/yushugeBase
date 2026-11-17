/* Track teacher edits as plain text runs; never store or execute editable HTML. */
(function () {
  'use strict';
  const editors = new WeakMap();
  let sequence = 0;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function diff(original, corrected) {
    const a = Array.from(String(original ?? '')), b = Array.from(String(corrected ?? ''));
    let first = 0, last = 0;
    while (first < a.length && first < b.length && a[first] === b[first]) first++;
    while (last < a.length - first && last < b.length - first && a[a.length - 1 - last] === b[b.length - 1 - last]) last++;
    const x = a.slice(first, a.length - last), y = b.slice(first, b.length - last), runs = [];
    const push = (kind, text) => { if (!text) return; const prev = runs.at(-1); if (prev?.kind === kind) prev.text += text; else runs.push({ kind, text }); };
    push('keep', a.slice(0, first).join(''));
    if (x.length * y.length <= 250000) {
      const width = y.length + 1, cells = new Uint32Array((x.length + 1) * width);
      for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--)
        cells[i * width + j] = x[i] === y[j] ? 1 + cells[(i + 1) * width + j + 1] : Math.max(cells[(i + 1) * width + j], cells[i * width + j + 1]);
      let i = 0, j = 0;
      while (i < x.length || j < y.length) {
        if (i < x.length && j < y.length && x[i] === y[j]) { push('keep', x[i++]); j++; }
        else if (i < x.length && (j === y.length || cells[(i + 1) * width + j] >= cells[i * width + j + 1])) push('del', x[i++]);
        else push('add', y[j++]);
      }
    } else { push('del', x.join('')); push('add', y.join('')); }
    push('keep', last ? a.slice(a.length - last).join('') : '');
    return { version: 1, runs };
  }
  function validated(marks, text, original) {
    if (marks?.version !== 1 || !Array.isArray(marks.runs) || marks.runs.length > 6000) return null;
    let size = 0;
    for (const r of marks.runs) {
      if (!r || !['keep', 'del', 'add'].includes(r.kind) || typeof r.text !== 'string') return null;
      size += r.text.length;
    }
    if (size > 100000 || marks.runs.filter(r => r.kind !== 'del').map(r => r.text).join('') !== text) return null;
    if (original !== undefined && marks.runs.filter(r => r.kind !== 'add').map(r => r.text).join('') !== original) return null;
    return marks;
  }
  function markElement(doc, r) {
    const el = doc.createElement(r.kind === 'del' ? 'del' : r.kind === 'add' ? 'ins' : 'span');
    el.textContent = r.text;
    if (r.kind === 'del') { el.style.cssText = 'color:#b22d42;text-decoration:line-through'; el.contentEditable = 'false'; }
    if (r.kind === 'add') el.style.cssText = 'color:#175eaa;text-decoration:underline;text-underline-offset:3px';
    return el;
  }
  function applyEdit(marks, start, end, inserted) {
    const runs=[];let offset=0,added=false;
    const push=(kind,text)=>{if(!text)return;const last=runs.at(-1);if(last?.kind===kind)last.text+=text;else runs.push({kind,text});};
    const add=()=>{if(!added){push('add',inserted);added=true;}};
    for(const run of marks.runs){
      if(run.kind==='del'){push('del',run.text);continue;}
      const length=run.text.length,finish=offset+length;
      if(finish<=start)push(run.kind,run.text);
      else if(offset>=end){add();push(run.kind,run.text);}
      else{
        const left=Math.max(0,start-offset),right=Math.min(length,end-offset);
        push(run.kind,run.text.slice(0,left));
        if(run.kind==='keep')push('del',run.text.slice(left,right));
        if(right<length){add();push(run.kind,run.text.slice(right));}
      }
      offset=finish;
    }
    add();return {version:1,runs};
  }
  function changedMarks(marks,before,after){
    const a=Array.from(before),b=Array.from(after);let first=0,last=0;
    while(first<a.length&&first<b.length&&a[first]===b[first])first++;
    while(last<a.length-first&&last<b.length-first&&a[a.length-1-last]===b[b.length-1-last])last++;
    const start=a.slice(0,first).join('').length,end=before.length-(last?a.slice(a.length-last).join('').length:0);
    return applyEdit(marks,start,end,b.slice(first,b.length-last).join(''));
  }
  function render(doc, text, marks) {
    text = String(text ?? '');
    const box = doc.createElement('div');
    box.className = 'ntc-marked-text'; box.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8';
    const valid = validated(marks, text);
    if (valid) for (const r of valid.runs) box.append(markElement(doc, r));
    else box.textContent = text;
    return box;
  }
  function html(text, marks) {
    text = String(text ?? '');
    const valid = validated(marks, text);
    if (!valid) return esc(text);
    return valid.runs.map(r => r.kind === 'del' ? '<del style="color:#b22d42;text-decoration:line-through">' + esc(r.text) + '</del>' : r.kind === 'add' ? '<ins style="color:#175eaa;text-decoration:underline">' + esc(r.text) + '</ins>' : esc(r.text)).join('');
  }
  function textOf(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType === 1 && node.tagName === 'DEL') return '';
    if (node.nodeType === 1 && node.tagName === 'BR') return '\n';
    let value = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && /^(DIV|P)$/.test(child.tagName) && value && !value.endsWith('\n')) value += '\n';
      value += textOf(child);
    }
    return value;
  }
  function mount(textarea, original, saved) {
    if (editors.has(textarea)) return;
    original = String(original ?? '');
    const doc = textarea.ownerDocument;
    if (textarea.parentElement.tagName === 'LABEL') {
      const old = textarea.parentElement, replacement = doc.createElement('div');
      replacement.className = old.className;
      old.replaceWith(replacement); replacement.append(...old.childNodes);
    }
    const shell = doc.createElement('div'), tools = doc.createElement('div'), area = doc.createElement('div');
    shell.className = 'ntc-mark-editor';
    shell.style.cssText = 'border:1px solid #e5d2d8;border-radius:10px;overflow:hidden;margin:6px 0 12px;background:#fff';
    tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'Sửa bài viết');
    tools.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:5px 7px;border-bottom:1px solid #eddee3;background:#fff8fa';
    area.id = 'ntcMarkedEditor-' + (++sequence); area.contentEditable = 'true';
    area.tabIndex = 0;
    area.setAttribute('role', 'textbox'); area.setAttribute('aria-multiline', 'true'); area.setAttribute('aria-label', 'Bản giáo viên sửa');
    area.style.cssText = 'min-height:140px;max-height:420px;overflow:auto;padding:12px;font:18px/1.8 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;outline-offset:-3px';
    area.spellcheck = false;
    const controls = ['Gạch bỏ', 'Thêm chữ', 'Hoàn tác'].map(label => {
      const b = doc.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'font:600 12px/1.4 system-ui;min-height:32px;padding:4px 9px;border:1px solid #e5d2d8;border-radius:7px;background:#fff;color:#784653;cursor:pointer';
      b.addEventListener('mousedown', e => e.preventDefault()); tools.append(b); return b;
    });
    shell.append(tools, area); textarea.after(shell); textarea.hidden = true;
    textarea.style.setProperty('display','none','important');
    let text = String(textarea.value ?? original), composing = false, selection = { start: 0, end: 0 };
    let marks=validated(saved,text,original)||diff(original,text);
    const history = [];
    function positions() {
      const sel = doc.getSelection();
      if (!sel?.rangeCount) return selection;
      const range = sel.getRangeAt(0);
      if (!area.contains(range.startContainer) || !area.contains(range.endContainer)) return selection;
      const prefix = doc.createRange(); prefix.selectNodeContents(area); prefix.setEnd(range.startContainer, range.startOffset);
      const start = textOf(prefix.cloneContents()).length;
      selection = { start, end: start + textOf(range.cloneContents()).length };
      return selection;
    }
    function restore(pos) {
      const sel = doc.getSelection(), nodes = [];
      const walk = node => { if (node.nodeType === 1 && node.tagName === 'DEL') return; if (node.nodeType === 3) nodes.push(node); else for (const c of node.childNodes) walk(c); };
      walk(area);
      const point = offset => { for (const n of nodes) { if (offset <= n.length) return [n, Math.max(0, offset)]; offset -= n.length; } return nodes.length ? [nodes.at(-1), nodes.at(-1).length] : [area, 0]; };
      const a = point(pos.start), b = point(pos.end), range = doc.createRange();
      range.setStart(...a); range.setEnd(...b); sel.removeAllRanges(); sel.addRange(range); selection = pos;
    }
    function paint(pos) {
      const focused = doc.activeElement === area;
      area.replaceChildren(...marks.runs.map(r => markElement(doc, r)));
      if (focused) restore(pos || selection);
      controls[2].disabled = history.length === 0;
    }
    function commit(next, pos, record = true, restoredMarks) {
      if (record && next !== text) { history.push({ text, marks:JSON.parse(JSON.stringify(marks)), selection: { ...selection } }); if (history.length > 50) history.shift(); }
      if(restoredMarks)marks=restoredMarks;else if(next!==text)marks=changedMarks(marks,text,next);
      text = next; textarea.value = next; selection = pos || positions(); paint(selection);
    }
    function sync() { if (!composing) { const pos = positions(); commit(textOf(area), pos); } }
    function insert(value) {
      const pos = positions(), next = text.slice(0, pos.start) + value + text.slice(pos.end);
      const end = pos.start + value.length; area.focus(); commit(next, { start: end, end });
    }
    function undo() {
      const last = history.pop(); if (!last) return;
      composing = false; area.focus(); commit(last.text, last.selection, false,last.marks);
    }
    controls[0].onclick = () => { const pos = positions(); if (pos.start !== pos.end) insert(''); else area.focus(); };
    controls[1].onclick = () => { const pos = positions(); area.focus(); restore({ start: pos.end, end: pos.end }); };
    controls[2].onclick = undo;
    area.addEventListener('compositionstart', () => { composing = true; });
    area.addEventListener('compositionend', () => { composing = false; sync(); });
    area.addEventListener('input', e => { if (!composing && !e.isComposing) sync(); });
    area.addEventListener('beforeinput', e => {
      if (composing || e.isComposing) return;
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); }
      else if (['insertParagraph', 'insertLineBreak'].includes(e.inputType)) { e.preventDefault(); insert('\n'); }
      else if (['deleteContentBackward', 'deleteContentForward'].includes(e.inputType)) {
        e.preventDefault(); const pos = positions();
        if (pos.start === pos.end) {
          if (e.inputType === 'deleteContentBackward') pos.start -= Array.from(text.slice(0, pos.start)).at(-1)?.length || 0;
          else pos.end += Array.from(text.slice(pos.end))[0]?.length || 0;
          selection = pos; restore(pos);
        }
        insert('');
      }
    });
    area.addEventListener('paste', e => { e.preventDefault(); insert((e.clipboardData || window.clipboardData)?.getData('text/plain') || ''); });
    area.addEventListener('drop', e => e.preventDefault());
    area.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } });
    for (const name of ['keyup', 'mouseup', 'touchend', 'select']) area.addEventListener(name, positions);
    area.addEventListener('focus',()=>{area.style.outline='2px solid #bb778d';});
    area.addEventListener('blur', () => { area.style.outline=''; if (composing) composing = false; sync(); });
    editors.set(textarea, { read() { if (composing) composing = false; sync(); const cleaned = text.trim(); return { text: cleaned, marks:cleaned===text?marks:changedMarks(marks,text,cleaned) }; } });
    textarea.value = text; paint(selection);
  }
  function read(textarea) { return editors.get(textarea)?.read() || { text: textarea.value.trim(), marks: undefined }; }
  window.NTCWritingMarkup = { diff, validated, render, html, mount, read };
})();
