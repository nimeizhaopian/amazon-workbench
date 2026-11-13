import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'workbench.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, payload TEXT NOT NULL);',
  );
  // 表名只由本模块固定选择；店铺、任务和草稿等外部输入全部使用绑定参数。
  const read = (table, id) => {
    const row = db.prepare('SELECT payload FROM ' + table + ' WHERE id=?').get(id);
    return row ? JSON.parse(row.payload) : null;
  };
  const list = (table, storeId) =>
    db
      .prepare(
        'SELECT payload FROM ' +
          table +
          (storeId ? ' WHERE store_id=?' : '') +
          ' ORDER BY rowid DESC',
      )
      .all(...(storeId ? [storeId] : []))
      .map((r) => JSON.parse(r.payload));
  const put = (table, item) => {
    db.prepare(
      'INSERT INTO ' +
        table +
        ' (id,store_id,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
    ).run(item.id, item.storeId, JSON.stringify(item));
    return item;
  };
  // 启动时标记中断任务，避免上次进程退出后界面永远显示运行中。
  for (const task of list('tasks'))
    if (task.status === 'running')
      put('tasks', {
        ...task,
        status: 'failed',
        error: '上次运行被中断，请重新执行',
        finishedAt: new Date().toISOString(),
      });
  return {
    tasks: (storeId) => list('tasks', storeId),
    task: (id) => read('tasks', id),
    saveTask: (item) => put('tasks', item),
    drafts: (storeId) => list('drafts', storeId),
    draft: (id) => read('drafts', id),
    saveDraft: (item) => put('drafts', item),
    id: () => randomUUID(),
    close: () => db.close(),
  };
}
