import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createService } from '../server/service.mjs';
import { createApp } from '../server/app.mjs';
import { ROOT, AppError } from '../server/config.mjs';
import { AmazonConnector } from '../server/connectors/amazon.mjs';
import { decorateSnapshot, generateReport, reportCsv, csvEscape } from '../server/domain.mjs';
import { demoSnapshot, stores } from '../server/demo.mjs';
import { apply } from '../plugins/amazon-workbench/index.mjs';
import { connectorCatalog, probeZiniao } from '../server/connectors/index.mjs';
async function fixture(t, options = {}) {
  await mkdir(join(ROOT, 'codex-artifacts'), { recursive: true });
  const directory = await mkdtemp(join(ROOT, 'codex-artifacts', 'test-'));
  const db = openStore(directory);
  const service = createService(db, { env: {}, ...options });
  t.after(async () => {
    await service.settle();
    db.close();
  });
  return { db, service, directory };
}
const authEnv = {
  AMAZON_LWA_CLIENT_ID: 'client-test',
  AMAZON_LWA_CLIENT_SECRET: 'never-expose-secret',
  AMAZON_REFRESH_TOKEN: 'never-expose-refresh',
  AMAZON_SELLER_ID: 'seller-test',
  AMAZON_MARKETPLACE: 'US',
};

test('演示数据与真实授权严格分离；缺失销量不估算收入与覆盖天数', () => {
  assert.equal(stores({}).length, 3);
  assert.ok(stores({}).every((s) => s.source === 'demo'));
  const live = stores(authEnv)[0];
  assert.equal(live.id, 'amazon-us');
  const data = decorateSnapshot({
    store: live,
    source: 'amazon',
    products: [{ sku: 'a', name: '真实商品', stock: 12, sales7: null, price: null, inbound: 0 }],
    revenue: null,
    orders: null,
    chart: [],
    collectedAt: new Date().toISOString(),
  });
  assert.equal(data.metrics.revenue, '—');
  assert.equal(data.products[0].coverageDays, null);
  assert.equal(data.products[0].salesLabel, '—');
  assert.equal(data.sourceLabel, 'Amazon SP-API');
});

test('日报按店铺持久化、导出带来源；跨店铺无法读取任务', async (t) => {
  const { service, db, directory } = await fixture(t);
  const task = await service.startTask('demo-us', 'inventory_daily');
  await service.settle();
  const result = service.task(task.id, 'demo-us');
  assert.equal(result.status, 'completed');
  assert.ok(result.report.findings.length > 0);
  assert.ok(result.steps.every((s) => s.status === 'completed'));
  assert.equal(result.report.source, 'demo');
  assert.match(reportCsv(result), /演示数据/);
  assert.throws(() => service.task(task.id, 'demo-de'), /未找到/);
  assert.equal(service.tasks('demo-de').length, 0);
  const second = openStore(directory);
  assert.equal(second.task(task.id).report.source, 'demo');
  second.close();
  assert.ok(db.task(task.id));
});

test('真实连接失败保留失败状态，绝不回退演示数据', async (t) => {
  const { service } = await fixture(t, {
    env: authEnv,
    amazon: {
      snapshot: async () => {
        throw new AppError('Amazon 授权失败', 502);
      },
    },
  });
  const task = await service.startTask('amazon-us', 'inventory_daily');
  await service.settle();
  const result = service.task(task.id, 'amazon-us');
  assert.equal(result.status, 'failed');
  assert.equal(result.report, undefined);
  assert.equal(result.source, 'amazon');
  assert.match(result.error, /授权失败/);
  assert.equal(result.steps[0].status, 'failed');
});

test('草稿按 SKU 与店铺保存，重复编辑更新原草稿且不修改商品源数据', async (t) => {
  const { service } = await fixture(t);
  const product = (await service.snapshot('demo-us')).products[0];
  const first = await service.saveDraft('demo-us', product.sku, '测试标题一');
  const second = await service.saveDraft('demo-us', product.sku, '测试标题二');
  assert.equal(first.id, second.id);
  assert.equal(service.drafts('demo-us').length, 1);
  assert.equal(service.drafts('demo-de').length, 0);
  assert.equal((await service.snapshot('demo-us')).products[0].title, product.title);
  assert.equal(second.status, 'local_draft');
  await assert.rejects(service.saveDraft('demo-us', 'unknown', 'test'), /未找到/);
  await assert.rejects(service.saveDraft('demo-us', product.sku, ' '), /不能为空/);
});

test('补货规则扣除在途；零销量不产生除零或无穷大', async (t) => {
  const { service } = await fixture(t);
  const task = await service.startTask('demo-us', 'replenishment');
  await service.settle();
  const report = service.task(task.id, 'demo-us').report;
  const bottle = report.findings.find((f) => f.sku === 'NL-BTL-750');
  assert.match(bottle.detail, /198 件/);
  const raw = demoSnapshot(stores({})[0]);
  raw.products[0].sales7 = 0;
  const decorated = decorateSnapshot(raw);
  assert.equal(decorated.products[0].coverageDays, null);
});

test('CSV 转义逗号、引号、换行和公式注入', () => {
  assert.equal(csvEscape('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.ok(csvEscape('+1').startsWith(String.fromCharCode(34, 39)));
  assert.equal(csvEscape('普通标题'), '"普通标题"');
});

test('Amazon 认证缓存与分页完整读取，返回值不伪造逐 SKU 销量', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/auth/o2/token'))
      return Response.json({ access_token: 'private-access-token', expires_in: 3600 });
    if (String(url).includes('nextToken=next-page'))
      return Response.json({
        payload: {
          inventorySummaries: [
            {
              sellerSku: 'SKU2',
              asin: 'B000000002',
              productName: '商品二',
              inventoryDetails: { fulfillableQuantity: 20 },
            },
          ],
        },
      });
    return Response.json({
      payload: {
        inventorySummaries: [
          {
            sellerSku: 'SKU1',
            asin: 'B000000001',
            productName: '商品一',
            inventoryDetails: { fulfillableQuantity: 10, inboundShippedQuantity: 7 },
          },
        ],
      },
      pagination: { nextToken: 'next-page' },
    });
  };
  const connector = new AmazonConnector(authEnv, fetcher);
  const result = await connector.snapshot(stores(authEnv)[0], AbortSignal.timeout(5000));
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].sales7, null);
  assert.equal(result.products[0].inbound, 7);
  assert.equal(result.revenue, null);
  assert.equal(calls.filter((c) => c.url.includes('/auth/o2/token')).length, 1);
  assert.equal(calls[1].options.headers['x-amz-access-token'], 'private-access-token');
  assert.ok(calls[1].url.includes('ATVPDKIKX0DER'));
});

test('Amazon API 错误不泄漏外部认证响应', async () => {
  const connector = new AmazonConnector(
    authEnv,
    async () => new Response('secret=never-expose-secret', { status: 401 }),
  );
  await assert.rejects(
    connector.inventory(AbortSignal.timeout(5000)),
    (error) => error.message.includes('401') && !error.message.includes('never-expose'),
  );
});

test('中断任务在重启后恢复为失败，避免永久运行中', async (t) => {
  const { db, directory } = await fixture(t);
  db.saveTask({
    id: 'interrupted',
    storeId: 'demo-us',
    status: 'running',
    createdAt: new Date().toISOString(),
  });
  const second = openStore(directory);
  assert.equal(second.task('interrupted').status, 'failed');
  assert.match(second.task('interrupted').error, /中断/);
  second.close();
});

test('紫鸟默认禁用；连接器状态不包含密钥内容', async () => {
  const catalog = connectorCatalog(
    { dshEnabled: true },
    { ...authEnv, ZINIAO_PASSWORD: 'hidden-password' },
  );
  assert.equal(catalog.find((c) => c.id === 'ziniao').status, 'reserved');
  assert.ok(!JSON.stringify(catalog).includes('never-expose'));
  assert.ok(!JSON.stringify(catalog).includes('hidden-password'));
  await assert.rejects(probeZiniao({}), /尚未启用/);
});

test('工作台 API 拒绝跨来源修改、未授权 agent 和跨店铺访问', async (t) => {
  const { service } = await fixture(t);
  const config = { port: 4810, dshPort: 3088, dshEnabled: false };
  const app = createApp({ service, config, token: 'test-token', env: {} });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  config.port = server.address().port;
  const base = 'http://127.0.0.1:' + config.port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  let response = await fetch(base + '/api/agent/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 401);
  response = await fetch(base + '/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AW-Client': 'workbench',
      Origin: 'https://external.example',
    },
    body: '{}',
  });
  assert.equal(response.status, 403);
  response = await fetch(base + '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 403);
  response = await fetch(base + '/api/agent/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).length, 3);
  response = await fetch(base + '/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-AW-Client': 'workbench' },
    body: JSON.stringify({ storeId: 'demo-us', type: 'inventory_daily' }),
  });
  assert.equal(response.status, 202);
  const task = await response.json();
  await service.settle();
  response = await fetch(base + '/api/tasks/' + task.id + '?storeId=demo-de');
  assert.equal(response.status, 404);
  response = await fetch(base + '/api/tasks/' + task.id + '/export?storeId=demo-us');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /虚构演示/);
});

test('DSH 插件真实注册五个工具，卸载时清理贡献', () => {
  const tools = [];
  let dispose;
  let removed = 0;
  apply(
    {
      tools: {
        register: (tool) => {
          tools.push(tool);
          return () => removed++;
        },
      },
      effect: (effect) => {
        dispose = effect();
      },
    },
    { apiBaseUrl: 'http://127.0.0.1:4810' },
  );
  assert.equal(tools.length, 5);
  assert.ok(tools.some((t) => t.name === 'aw_inventory'));
  assert.ok(tools.some((t) => t.name === 'aw_save_listing_draft'));
  assert.ok(!tools.some((t) => /publish|delete|price/.test(t.name)));
  dispose();
  assert.equal(removed, 5);
});

test('未知库存和缺失销量明确标记无法评估，不产生正常或补货结论', () => {
  const raw = demoSnapshot(stores({})[0]);
  raw.source = 'amazon';
  for (const p of raw.products) {
    p.sales7 = null;
    p.stock = null;
    p.inbound = null;
  }
  const data = decorateSnapshot(raw);
  assert.equal(data.metrics.inventory, '—');
  assert.equal(data.products[0].severity, 'unknown');
  assert.equal(data.alerts.length, 0);
  const report = generateReport('replenishment', data);
  assert.match(report.summary, /无法生成/);
  assert.equal(report.findings.length, 0);
  assert.ok(csvEscape('  =1').startsWith(String.fromCharCode(34, 39)));
});

test('重复启动在打开数据库前失败，不干扰运行中任务', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const folder = await mkdtemp(join(ROOT, 'codex-artifacts', 'duplicate-'));
  const port = server.address().port;
  const child = spawnSync(process.execPath, [join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      AW_PORT: String(port),
      DSH_PORT: port === 3088 ? '3089' : '3088',
      AW_DATA_DIR: folder,
      DSH_ENABLED: 'false',
    },
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /EADDRINUSE/);
  await assert.rejects(
    access(join(folder, 'workbench.sqlite')),
    (error) => error.code === 'ENOENT',
  );
});
