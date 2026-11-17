
(()=>{const root=document.querySelector('#ntc-design-preview');const labels=['Từ vựng','Học từ','Thẻ nhớ','Luyện tập','Xếp câu','Kết quả'];
const map={'← 上一个':'← Từ trước','✓ 已学习 · 下一个 →':'Đã học · Từ tiếp →','笔顺演示':'Nét chữ','◖ 听词语':'◖ Nghe từ','显示拼音':'Hiện pinyin','隐藏拼音':'Ẩn pinyin','◖ 听例句':'◖ Nghe câu','常用搭配':'Cụm từ','例句':'Ví dụ','○ 未学习':'Chưa học','✓ 已学习':'Đã học','■ 停止播放':'Dừng nghe','语速':'Tốc độ'};
function decorate(){root.querySelectorAll('#ntc-tabs button').forEach((e,i)=>{const label=labels[i]+(e.textContent.includes('🔒')?' 🔒':'');if(e.textContent!==label)e.textContent=label});
root.querySelectorAll('#ntc-groups button').forEach((e,i)=>{const label='Nhóm '+(i+1);if(e.textContent!==label)e.textContent=label});
root.querySelectorAll('button,.ntc-label,.ntc-state,label,.ntc-sectionhead h2').forEach(e=>{const text=e.textContent.trim();const t=map[text]||(text.match(/^学习生词 · 组别 (\d+)$/)?text.replace('学习生词 · 组别 ','Học từ · Nhóm '):null);if(t)e.textContent=t});
root.querySelectorAll('.ntc-footnote').forEach(e=>{const d=document.createElement('details');const s=document.createElement('summary');s.textContent='Hướng dẫn & lưu tiến độ';d.append(s);e.replaceWith(d);d.append(e);e.className='demo-guidance'});
}
decorate();new MutationObserver(decorate).observe(root,{childList:true,subtree:true});})();
