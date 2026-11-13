import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError, publicError } from './config.mjs';
import { reportCsv } from './domain.mjs';
import { connectorCatalog, probeZiniao } from './connectors/index.mjs';
import { AmazonConnector } from './connectors/amazon.mjs';
export function createApp({
  service,
  config,
  token,
  runtimeState = { url: '/harness/' },
  env = process.env,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.json({ limit: '256kb' }));
  // 浏览器写入要求同源及请求标识；模型工具改走单独的 Bearer 认证入口。
  app.use('/api', (req, res, next) => {
    const host = (req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost'].includes(host))
      return res.status(403).json({ error: '只允许本机访问' });
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && !req.path.startsWith('/agent/')) {
      if (req.headers['x-aw-client'] !== 'workbench')
        return res.status(403).json({ error: '缺少工作台请求标识' });
      if (
        req.headers.origin &&
        !['http://127.0.0.1:' + config.port, 'http://localhost:' + config.port].includes(
          req.headers.origin,
        )
      )
        return res.status(403).json({ error: '跨来源请求已拒绝' });
    }
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, name: 'amazon-workbench', dshPort: config.dshPort }),
  );
  app.get('/api/stores', (_req, res) => res.json(service.stores()));
  app.get('/api/snapshot', async (req, res) =>
    res.json(await service.snapshot(String(req.query.storeId || ''))),
  );
  app.get('/api/task-types', (_req, res) => res.json(service.taskTypes));
  app.get('/api/tasks', (req, res) => res.json(service.tasks(String(req.query.storeId || ''))));
  app.post('/api/tasks', async (req, res) =>
    res.status(202).json(await service.startTask(req.body.storeId, req.body.type)),
  );
  app.get('/api/tasks/:id', (req, res) =>
    res.json(service.task(req.params.id, String(req.query.storeId || ''))),
  );
  app.get('/api/tasks/:id/export', (req, res) => {
    const task = service.task(req.params.id, String(req.query.storeId || ''));
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="amazon-report-' + task.id + '.csv"',
    );
    res.type('text/csv; charset=utf-8').send(reportCsv(task));
  });
  app.get('/api/drafts', (req, res) => res.json(service.drafts(String(req.query.storeId || ''))));
  app.post('/api/drafts', async (req, res) =>
    res.status(201).json(await service.saveDraft(req.body.storeId, req.body.sku, req.body.title)),
  );
  app.get('/api/connectors', (_req, res) => res.json(connectorCatalog(config, env)));
  app.get('/api/runtime', async (_req, res) => {
    let ready = false;
    try {
      const r = await fetch('http://127.0.0.1:' + config.dshPort + '/', {
        signal: AbortSignal.timeout(1500),
      });
      ready = (r.ok || r.status === 401) && runtimeState.url.includes('token=');
    } catch {}
    res.json({ ready, enabled: config.dshEnabled, url: runtimeState.url, port: config.dshPort });
  });
  app.post('/api/connectors/:id/test', async (req, res) => {
    if (req.params.id === 'amazon') {
      const items = await new AmazonConnector(env).inventory(AbortSignal.timeout(30000));
      return res.json({
        ok: true,
        message: 'Amazon 授权及库存读取成功，返回 ' + items.length + ' 个 SKU',
      });
    }
    if (req.params.id === 'ziniao') return res.json(await probeZiniao(env));
    if (req.params.id === 'deepseek') {
      const r = await fetch('http://127.0.0.1:' + config.dshPort + '/', {
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      if (!r || (!r.ok && r.status !== 401))
        throw new AppError('DSH 尚未就绪，请查看运行日志', 503);
      return res.json({ ok: true, message: 'DSH Web 已就绪；模型授权请在智能助手设置中检查' });
    }
    throw new AppError('未知连接器', 404);
  });
  app.use('/api/agent', (req, res, next) => {
    const provided = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from('Bearer ' + token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      return res.status(401).json({ error: '工作台工具认证失败' });
    next();
  });
  app.post('/api/agent/stores', (_req, res) => res.json(service.stores()));
  app.post('/api/agent/inventory', async (req, res) =>
    res.json(await service.snapshot(req.body.storeId)),
  );
  app.post('/api/agent/reports', async (req, res) =>
    res.json(await service.startTask(req.body.storeId, req.body.type)),
  );
  app.post('/api/agent/report', (req, res) =>
    res.json(service.task(req.body.taskId, req.body.storeId)),
  );
  app.post('/api/agent/drafts', async (req, res) =>
    res.json(await service.saveDraft(req.body.storeId, req.body.sku, req.body.title)),
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: '未找到接口' }));
  app.use((error, _req, res, _next) => {
    if (!(error instanceof AppError)) console.error('[aw]', error.name || 'Error', '请求处理失败');
    res
      .status(
        error instanceof AppError ? error.status : error.type === 'entity.parse.failed' ? 400 : 500,
      )
      .json({ error: publicError(error) });
  });
  return app;
}
