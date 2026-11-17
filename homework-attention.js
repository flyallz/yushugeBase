(function (root) {
  'use strict';
  function counts(items, games) {
    const tasks = new Set(), returned = new Set(), gameTasks = new Set();
    for (const item of items || []) {
      const id = String(item.window.id), state = item.state;
      if (!state.full && ['open', 'late', 'future'].includes(state.access)) tasks.add(id);
      const rows = root.NTCHomework.latest([...(state.rows || []), ...(item.history || []).flatMap(h => h.rows || [])]);
      if (rows.some(r => ['graded', 'revision_required'].includes(r.status) && !r.student_viewed_at)) returned.add(id);
    }
    for (const game of games || []) {
      if (!game.archived && !game.archived_at && Number(game.completed_runs || 0) < Number(game.required_runs || 1)) gameTasks.add(String(game.id));
    }
    return { assigned: tasks.size, games: gameTasks.size, returned: returned.size,
      total: new Set([...tasks, ...returned]).size + gameTasks.size,
      taskIds: tasks, returnedIds: returned, gameIds: gameTasks };
  }
  root.NTCHomeworkAttention = { counts };
  if(root.document){const style=root.document.createElement('style');style.textContent='.ntc-tabs .ntc-tab{display:inline-flex;align-items:center;gap:6px}.ntc-attention-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#c5415c;color:#fff;font:800 11px/1 system-ui}.ntc-attention-count[hidden]{display:none!important}';root.document.head.append(style);}
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NTCHomeworkAttention;
})(typeof window !== 'undefined' ? window : globalThis);
