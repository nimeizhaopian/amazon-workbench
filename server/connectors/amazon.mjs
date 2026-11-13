import { MARKETPLACES, AppError, isAmazonConfigured } from '../config.mjs';
// 仅提供读取；每次请求固定到已配置站点，模型不能指定任意 URL 或账户。
export class AmazonConnector {
  constructor(env = process.env, fetcher = fetch) {
    this.env = env;
    this.fetch = fetcher;
    this.access = null;
    this.expires = 0;
  }
  async token(signal) {
    if (!isAmazonConfigured(this.env)) throw new AppError('尚未配置 Amazon SP-API 授权', 409);
    if (this.access && this.expires > Date.now()) return this.access;
    const response = await this.fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.env.AMAZON_REFRESH_TOKEN,
        client_id: this.env.AMAZON_LWA_CLIENT_ID,
        client_secret: this.env.AMAZON_LWA_CLIENT_SECRET,
      }),
      signal,
    });
    if (!response.ok)
      throw new AppError(
        'Amazon LWA 授权失败（HTTP ' + response.status + '），请检查应用凭据',
        502,
      );
    const data = await response.json();
    if (typeof data.access_token !== 'string') throw new AppError('Amazon 未返回有效授权令牌', 502);
    this.access = data.access_token;
    this.expires = Date.now() + Math.max(0, (Number(data.expires_in) || 3600) - 60) * 1000;
    return this.access;
  }
  async request(path, params, signal) {
    const m = MARKETPLACES[this.env.AMAZON_MARKETPLACE || 'US'];
    if (!m) throw new AppError('不支持的 Amazon 站点');
    const token = await this.token(signal);
    const url = new URL(path, 'https://sellingpartnerapi-' + m.region + '.amazon.com');
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await this.fetch(url, {
      headers: { 'x-amz-access-token': token, 'user-agent': 'AmazonWorkbench/0.1.0' },
      signal,
    });
    if (!response.ok)
      throw new AppError(
        'Amazon SP-API 请求失败（HTTP ' + response.status + '），请检查授权角色或调用频率',
        502,
      );
    return response.json();
  }
  async inventory(signal) {
    const m = MARKETPLACES[this.env.AMAZON_MARKETPLACE || 'US'];
    let nextToken;
    const items = [];
    const seen = new Set();
    // 分页失败直接报告错误，不展示部分数据为完整库存，也不退回演示数据。
    for (let page = 0; page < 100; page++) {
      const data = await this.request(
        '/fba/inventory/v1/summaries',
        {
          granularityType: 'Marketplace',
          granularityId: m.id,
          marketplaceIds: m.id,
          details: true,
          nextToken,
        },
        signal,
      );
      const batch = data?.payload?.inventorySummaries;
      if (!Array.isArray(batch)) throw new AppError('Amazon 库存响应格式不符合预期', 502);
      items.push(...batch);
      nextToken = data?.pagination?.nextToken;
      if (!nextToken) return items;
      if (seen.has(nextToken)) throw new AppError('Amazon 库存分页令牌重复，已停止读取', 502);
      seen.add(nextToken);
    }
    throw new AppError('库存超过本版本分页上限，未生成不完整报表', 502);
  }
  async snapshot(store, signal) {
    if (store.code !== (this.env.AMAZON_MARKETPLACE || 'US'))
      throw new AppError('店铺站点与当前授权配置不匹配', 409);
    const inventory = await this.inventory(signal);
    const products = inventory.map((p) => ({
      sku: p.sellerSku,
      asin: p.asin,
      name: p.productName || p.sellerSku,
      title: p.productName || p.sellerSku,
      category: 'FBA 商品',
      kind: 'box',
      color: 'sage',
      price: null,
      stock: p.inventoryDetails?.fulfillableQuantity ?? null,
      inbound: p.inventoryDetails
        ? (p.inventoryDetails.inboundWorkingQuantity ?? 0) +
          (p.inventoryDetails.inboundShippedQuantity ?? 0) +
          (p.inventoryDetails.inboundReceivingQuantity ?? 0)
        : null,
      sales7: null,
      listingStatus: null,
    }));
    // 库存接口没有逐 SKU 销量与价格；未知字段保留 null，不能据此估算销售额或覆盖天数。
    return {
      store,
      products,
      revenue: null,
      orders: null,
      chart: [],
      collectedAt: new Date().toISOString(),
      source: 'amazon',
      salesPeriod: '已接入 FBA 库存；销量数据待接入',
    };
  }
}
