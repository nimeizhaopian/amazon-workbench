import { access } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { amazonEnvKeys, isAmazonConfigured, AppError } from '../config.mjs';
export function connectorCatalog(config, env = process.env) {
  const amazonMissing = amazonEnvKeys.filter((k) => !env[k]);
  const ziniaoFields = [
    'ZINIAO_COMPANY',
    'ZINIAO_USERNAME',
    'ZINIAO_PASSWORD',
    'ZINIAO_CLIENT_PATH',
  ];
  return [
    {
      id: 'deepseek',
      name: 'DeepSeek Harness',
      subtitle: '智能助手与工具执行',
      icon: 'deepseek',
      status: config.dshEnabled ? 'enabled' : 'disabled',
      statusLabel: config.dshEnabled ? '本地运行时' : '未启用',
      description: '官方 DSH Web 与 5 个亚马逊业务工具。模型密钥在 DSH 设置中填写。',
      fields: [{ key: 'DEEPSEEK_API_KEY', configured: !!env.DEEPSEEK_API_KEY }],
      kind: 'runtime',
      action: '打开助手',
    },
    {
      id: 'amazon',
      name: 'Amazon SP-API',
      subtitle: '官方卖家数据接口',
      icon: 'amazon',
      status: isAmazonConfigured(env) ? 'configured' : 'pending',
      statusLabel: isAmazonConfigured(env) ? '已配置 · 待验证' : '待配置',
      description: '读取真实 FBA 库存；未配置时仅提供独立的演示店铺。',
      fields: amazonEnvKeys.map((key) => ({ key, configured: !!env[key] })),
      missing: amazonMissing,
      kind: 'api',
      action: '检测连接',
    },
    {
      id: 'ziniao',
      name: '紫鸟浏览器',
      subtitle: '社区 MCP · WebDriver',
      icon: 'bird',
      status: env.ZINIAO_ENABLED === 'true' ? 'configured' : 'reserved',
      statusLabel: env.ZINIAO_ENABLED === 'true' ? '已启用 · 待验证' : '接口已预留',
      description: 'ziniao-mcp 0.1.33；需紫鸟客户端及 WebDriver 权限。默认不启动客户端。',
      fields: ziniaoFields.map((key) => ({ key, configured: !!env[key] })),
      kind: 'mcp',
      action: '查看配置',
    },
  ];
}
export async function probeZiniao(env = process.env) {
  if (env.ZINIAO_ENABLED !== 'true')
    throw new AppError('紫鸟连接器尚未启用，请先配置 .env 中的 ZINIAO_* 字段', 409);
  if (!env.ZINIAO_CLIENT_PATH) throw new AppError('请填写紫鸟客户端路径 ZINIAO_CLIENT_PATH', 409);
  try {
    await access(env.ZINIAO_CLIENT_PATH);
  } catch {
    throw new AppError('紫鸟客户端路径不存在', 409);
  }
  const args = JSON.parse(env.ZINIAO_MCP_ARGS || '["ziniao-mcp==0.1.33"]');
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string'))
    throw new AppError('紫鸟 MCP 启动参数格式错误');
  const childEnv = Object.fromEntries(
    Object.entries(env).filter(
      ([k, v]) =>
        typeof v === 'string' &&
        (k.startsWith('ZINIAO_') ||
          [
            'PATH',
            'Path',
            'SYSTEMROOT',
            'SystemRoot',
            'TEMP',
            'TMP',
            'USERPROFILE',
            'APPDATA',
            'LOCALAPPDATA',
          ].includes(k)),
    ),
  );
  const transport = new StdioClientTransport({
    command: env.ZINIAO_MCP_COMMAND || 'uvx',
    args,
    env: childEnv,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'amazon-workbench-probe', version: '0.1.0' });
  const timer = setTimeout(() => {
    void client.close();
    void transport.close();
  }, 15000);
  // 探测只枚举工具，不调用会启动、关闭或操作店铺的工具。
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return {
      ok: true,
      message: '紫鸟 MCP 握手成功，发现 ' + result.tools.length + ' 个工具；尚未验证店铺登录',
      tools: result.tools.map((t) => t.name),
    };
  } catch {
    throw new AppError('紫鸟 MCP 探测失败，请检查 uvx、客户端配置及本地网络', 502);
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
