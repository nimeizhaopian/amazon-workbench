import express from 'express';
import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ROOT, configFromEnv } from './config.mjs';
import { openStore } from './store.mjs';
import { createService } from './service.mjs';
import { createApp } from './app.mjs';
import { getBridgeToken, launchDsh } from '../scripts/start-dsh.mjs';
const config = configFromEnv();
// 先占用监听端口，再恢复数据库，防止重复启动把正在执行的任务误标为中断。
let requestHandler = (_req, res) => {
  res.writeHead(503);
  res.end('Workbench starting');
};
const server = createServer((req, res) => requestHandler(req, res));
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(config.port, '127.0.0.1', resolve);
});
const db = openStore(config.dataDir);
const service = createService(db);
const token = await getBridgeToken(config.dataDir);
const runtimeState = { url: '/harness/' };
const app = createApp({ service, config, token, runtimeState });
const proxy = createProxyMiddleware({
  target: 'http://127.0.0.1:' + config.dshPort,
  changeOrigin: false,
  pathFilter: (path) => path.startsWith('/harness/'),
  pathRewrite: { '^/harness': '' },
  on: {
    error: (_err, _req, res) => {
      if ('writeHead' in res) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('DeepSeek Harness 正在启动，请稍后刷新');
      }
    },
  },
});
app.use(proxy);
let vite;
if (process.argv.includes('--dev')) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(join(ROOT, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(join(ROOT, 'dist', 'index.html')));
}
requestHandler = app;
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/harness/')) proxy.upgrade(req, socket, head);
});

console.log('AW 工作台：http://127.0.0.1:' + config.port);
let child;
let log;
if (config.dshEnabled) {
  await mkdir(join(ROOT, 'codex-artifacts'), { recursive: true });
  log = createWriteStream(join(ROOT, 'codex-artifacts', 'dsh-runtime.log'), { flags: 'a' });
  child = await launchDsh(config, { stdio: ['ignore', 'pipe', 'pipe'] }); // 首次访问令牌仅保存在进程内，传给同源 iframe；落盘日志统一抹去令牌。
  let pendingOutput = '';
  child.stdout.on('data', (chunk) => {
    pendingOutput += chunk.toString();
    let boundary;
    while ((boundary = pendingOutput.indexOf('\n')) >= 0) {
      const line = pendingOutput.slice(0, boundary);
      pendingOutput = pendingOutput.slice(boundary + 1);
      const match = line.match(/dsh web: (https?:[^\s]+)/);
      if (match) {
        const url = new URL(match[1]);
        runtimeState.url = url.pathname + url.search;
      }
      log.write(line.replace(/([?&]token=)[^\s&]+/g, '$1[redacted]') + '\n');
    }
  });
  child.stderr.on('data', (chunk) =>
    log.write(chunk.toString().replace(/([?&]token=)[^\s&]+/g, '$1[redacted]')),
  );
  child.on('error', () => console.error('[aw] DSH 启动失败，请查看本地日志'));
  child.on('exit', (code) => console.log('[aw] DSH 已退出：' + code));
}
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  child?.kill();
  await service.settle();
  await vite?.close();
  db.close();
  log?.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
