import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT, configFromEnv } from '../server/config.mjs';
import { apply } from '../plugins/amazon-workbench/index.mjs';
const config = configFromEnv();
const client = new Client({ name: 'aw-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, 'connectors', 'mcp-server.mjs')],
  cwd: ROOT,
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 4);
  const result = await client.callTool({
    name: 'amazon_inventory',
    arguments: { storeId: 'demo-us' },
  });
  assert.ok(!result.isError);
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.source, 'demo');
  assert.equal(data.products.length, 8);
  process.env.AW_BRIDGE_TOKEN = (
    await readFile(join(config.dataDir, 'bridge.token'), 'utf8')
  ).trim();
  const tools = [];
  let dispose;
  apply(
    {
      tools: {
        register: (tool) => {
          tools.push(tool);
          return () => {};
        },
      },
      effect: (effect) => {
        dispose = effect();
      },
    },
    { apiBaseUrl: 'http://127.0.0.1:' + config.port },
  );
  const nativeResult = await tools
    .find((t) => t.name === 'aw_inventory')
    .execute({ storeId: 'demo-us' }, { signal: AbortSignal.timeout(10000) });
  const native = JSON.parse(nativeResult);
  assert.equal(native.products.length, 8);
  assert.equal(native.source, 'demo');
  dispose();
  await writeFile(
    join(ROOT, 'codex-artifacts', 'mcp-results.json'),
    JSON.stringify(
      {
        passed: true,
        mcpTools: listed.tools.map((t) => t.name),
        nativeTools: tools.map((t) => t.name),
        demoProducts: data.products.length,
      },
      null,
      2,
    ),
  );
  console.log('PASS MCP stdio: 4 tools discovered, inventory read through real local service');
  console.log('PASS DSH native tool: inventory read through authenticated workbench API');
} finally {
  await client.close();
  await transport.close();
}
