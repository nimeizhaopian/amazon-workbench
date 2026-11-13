import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configFromEnv } from '../server/config.mjs';
const config = configFromEnv();
const server = new McpServer({ name: 'aw-amazon', version: '0.1.0' });
async function request(path, body) {
  const token = (await readFile(join(config.dataDir, 'bridge.token'), 'utf8')).trim();
  const response = await fetch('http://127.0.0.1:' + config.port + '/api/agent/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  return { isError: !response.ok, content: [{ type: 'text', text: JSON.stringify(result) }] };
}
server.registerTool(
  'amazon_list_stores',
  { description: '列出工作台店铺，返回数据来源标记', inputSchema: {} },
  () => request('stores', {}),
);
server.registerTool(
  'amazon_inventory',
  { description: '读取该店铺的库存，缺失销量不做估算', inputSchema: { storeId: z.string() } },
  (args) => request('inventory', args),
);
server.registerTool(
  'amazon_create_report',
  {
    description: '创建规则分析报告并保存到任务中心',
    inputSchema: {
      storeId: z.string(),
      type: z.enum(['inventory_daily', 'listing_audit', 'replenishment']),
    },
  },
  (args) => request('reports', args),
);
server.registerTool(
  'amazon_get_report',
  { description: '读取报告状态与结果', inputSchema: { storeId: z.string(), taskId: z.string() } },
  (args) => request('report', args),
);
// stdio 保持纯 MCP 帧；启动日志与错误只能写 stderr。
await server.connect(new StdioServerTransport());
