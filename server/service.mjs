import { stores, demoSnapshot } from './demo.mjs';
import { AppError, fmtTime } from './config.mjs';
import { decorateSnapshot, generateReport, TASK_TYPES } from './domain.mjs';
import { AmazonConnector } from './connectors/amazon.mjs';
export function createService(db, { env = process.env, amazon = new AmazonConnector(env) } = {}) {
  const running = new Set();
  const getStore = (id) => {
    const store = stores(env).find((s) => s.id === id);
    if (!store) throw new AppError('未找到店铺，或真实店铺授权尚未配置', 404);
    return store;
  };
  const snapshot = async (id, signal) => {
    const store = getStore(id);
    return decorateSnapshot(
      store.source === 'demo'
        ? demoSnapshot(store)
        : await amazon.snapshot(store, signal || AbortSignal.timeout(90000)),
    );
  };
  const taskView = (t) => ({
    ...t,
    createdLabel: fmtTime(t.createdAt),
    statusLabel: { running: '执行中', completed: '已完成', failed: '执行失败' }[t.status],
  });
  const api = {
    stores: () => stores(env),
    getStore,
    snapshot,
    taskTypes: TASK_TYPES,
    tasks: (id) => {
      getStore(id);
      return db.tasks(id).map(taskView);
    },
    task: (id, storeId) => {
      const t = db.task(id);
      if (!t || t.storeId !== storeId) throw new AppError('未找到该店铺的任务', 404);
      return taskView(t);
    },
    drafts: (id) => {
      getStore(id);
      return db.drafts(id);
    },
    async startTask(storeId, type) {
      const store = getStore(storeId);
      if (!TASK_TYPES[type]) throw new AppError('未知任务类型');
      // 运行中的同店铺同类任务复用已有记录，避免连续点击产生重复采集。
      const existing = db.tasks(storeId).find((t) => t.type === type && t.status === 'running');
      if (existing) return taskView(existing);
      const task = {
        id: db.id(),
        storeId,
        type,
        title: TASK_TYPES[type].name,
        status: 'running',
        source: store.source,
        createdAt: new Date().toISOString(),
        steps: [
          { name: '读取店铺数据', status: 'running' },
          { name: '分析商品与库存', status: 'pending' },
          { name: '保存报告', status: 'pending' },
        ],
      };
      db.saveTask(task);
      const promise = (async () => {
        try {
          const data = await snapshot(storeId);
          task.steps[0].status = 'completed';
          task.steps[1].status = 'running';
          task.report = generateReport(type, data);
          task.steps[1].status = 'completed';
          task.steps[2].status = 'completed';
          task.status = 'completed';
        } catch (error) {
          task.status = 'failed';
          task.error =
            error instanceof AppError ? error.message : '任务执行失败，请重试或检查连接器';
          const step = task.steps.find((s) => s.status === 'running');
          if (step) step.status = 'failed';
        } finally {
          task.finishedAt = new Date().toISOString();
          db.saveTask(task);
        }
      })();
      running.add(promise);
      void promise.finally(() => running.delete(promise));
      return taskView(task);
    },
    async saveDraft(storeId, sku, title) {
      const data = await snapshot(storeId);
      const product = data.products.find((p) => p.sku === sku);
      if (!product) throw new AppError('未找到商品', 404);
      if (typeof title !== 'string' || !title.trim() || title.length > 500)
        throw new AppError('标题不能为空且不得超过 500 字符');
      const old = db.drafts(storeId).find((d) => d.sku === sku);
      return db.saveDraft({
        id: old?.id || db.id(),
        storeId,
        sku,
        originalTitle: product.title,
        title: title.trim(),
        status: 'local_draft',
        source: data.source,
        updatedAt: new Date().toISOString(),
        note: '仅保存于本地，尚未提交亚马逊',
      });
    },
    async settle() {
      await Promise.allSettled([...running]);
    },
  };
  return api;
}
