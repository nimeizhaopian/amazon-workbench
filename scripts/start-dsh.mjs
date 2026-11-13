import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, configFromEnv } from '../server/config.mjs';
export async function getBridgeToken(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const path = join(dataDir, 'bridge.token');
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const token = randomBytes(32).toString('hex');
  await writeFile(path, token, { mode: 0o600, flag: 'wx' });
  return token;
}
export async function writeOverlay(config) {
  const runtimeDir = join(ROOT, '.dsh', 'aw-runtime');
  await mkdir(runtimeDir, { recursive: true });
  const lines = [
    '# 自动生成的项目级覆盖配置；密钥只通过环境变量传给进程。',
    '- insert:',
    '    - id: aw-amazon-workbench',
    '      name: ' +
      JSON.stringify(join(ROOT, 'plugins', 'amazon-workbench', 'index.mjs').replaceAll('\\', '/')),
    '      config:',
    '        apiBaseUrl: http://127.0.0.1:' + config.port,
  ];
  if (process.env.ZINIAO_ENABLED === 'true') {
    const args = JSON.parse(process.env.ZINIAO_MCP_ARGS || '["ziniao-mcp==0.1.33"]');
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string'))
      throw new Error('ZINIAO_MCP_ARGS 必须是字符串数组');
    lines.push(
      '    - id: aw-ziniao-mcp',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: ziniao',
      '        transport: stdio',
      '        command: ' + JSON.stringify(process.env.ZINIAO_MCP_COMMAND || 'uvx'),
      '        args: ' + JSON.stringify(args),
      '        failOnStartupError: false',
      '        env:',
    );
    for (const key of [
      'ZINIAO_COMPANY',
      'ZINIAO_USERNAME',
      'ZINIAO_PASSWORD',
      'ZINIAO_CLIENT_PATH',
      'ZINIAO_VERSION',
      'ZINIAO_SOCKET_PORT',
    ])
      if (process.env[key]) lines.push('          ' + key + ': !!js process.env.' + key);
  }
  const file = join(runtimeDir, 'cordis.patch.yml');
  await writeFile(file, lines.join('\n') + '\n');
  return file;
}
export async function launchDsh(config, { stdio = 'inherit' } = {}) {
  const token = await getBridgeToken(config.dataDir);
  const overlay = await writeOverlay(config);
  // 独立 DSH_HOME 使会话、插件配置和凭据归属于本项目，避免读取其他工作台状态。
  const child = spawn(
    process.execPath,
    [
      join(ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      '--profile',
      'web',
      '--patch',
      overlay,
      '--no-open',
      '--host',
      '127.0.0.1',
      '--port',
      String(config.dshPort),
      '--public-url',
      'http://127.0.0.1:' + config.port + '/harness/',
      '--trusted-host',
      '127.0.0.1:' + config.port,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, DSH_HOME: join(ROOT, '.dsh'), AW_BRIDGE_TOKEN: token },
      windowsHide: true,
      stdio,
    },
  );
  return child;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const child = await launchDsh(configFromEnv());
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  process.on('SIGINT', () => child.kill());
  process.on('SIGTERM', () => child.kill());
}
