import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'aw-amazon-workbench';
export const inject = ['tools'];
export function apply(ctx, config = {}) {
  const base = config.apiBaseUrl || 'http://127.0.0.1:4810';
  async function call(path, body, signal) {
    const response = await fetch(base + '/api/agent/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.AW_BRIDGE_TOKEN,
      },
      body: JSON.stringify(body),
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '工作台请求失败');
    return JSON.stringify(result);
  }
  const definitions = [
    [
      'aw_list_stores',
      '读取工作台已配置店铺；demo 表示虚构演示数据。',
      {},
      () => ({ path: 'stores', body: {} }),
    ],
    [
      'aw_inventory',
      '读取指定店铺商品与库存。真实库存没有销量时返回 null，不得编造。',
      { storeId: { type: 'string', required: true } },
      (a) => ({ path: 'inventory', body: a }),
    ],
    [
      'aw_create_report',
      '运行库存日报、补货规则或 Listing 检查，并保存到工作台任务中心。',
      {
        storeId: { type: 'string', required: true },
        type: {
          type: 'string',
          required: true,
          enum: ['inventory_daily', 'listing_audit', 'replenishment'],
        },
      },
      (a) => ({ path: 'reports', body: a }),
    ],
    [
      'aw_get_report',
      '读取该店铺的任务状态及已保存报告。',
      { storeId: { type: 'string', required: true }, taskId: { type: 'string', required: true } },
      (a) => ({ path: 'report', body: a }),
    ],
    [
      'aw_save_listing_draft',
      '保存本地标题草稿。此工具不会向 Amazon 提交修改。',
      {
        storeId: { type: 'string', required: true },
        sku: { type: 'string', required: true },
        title: { type: 'string', required: true },
      },
      (a) => ({ path: 'drafts', body: a }),
    ],
  ];
  ctx.effect(() => {
    const disposers = definitions.map(([toolName, description, parameters, build]) =>
      ctx.tools.register(
        defineTool({
          name: toolName,
          description,
          parameters,
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
          },
          async execute(args, exec) {
            const request = build(args);
            return call(request.path, request.body, exec.signal);
          },
        }),
      ),
    );
    return () => disposers.forEach((dispose) => dispose());
  }, 'aw: amazon tools');
  console.log('[aw] 亚马逊工作台插件已注册：5 个业务工具');
}
