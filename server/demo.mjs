import { MARKETPLACES, isAmazonConfigured } from './config.mjs';
// 数据为固定的虚构样本；所有响应携带 source，避免与真实店铺混合。
const catalog = [
  [
    'NL-BTL-750',
    'DEMO000001',
    '真空保温随行杯 · 750ml',
    'Northline Insulated Water Bottle, 750ml, Leakproof Lid',
    '家居与厨房',
    'bottle',
    29.99,
    42,
    84,
    'sage',
  ],
  [
    'NL-ORG-04',
    'DEMO000002',
    '桌面收纳四件套',
    'Northline Desk Organizer Set, 4 Pieces',
    '办公用品',
    'organizer',
    24.9,
    286,
    45,
    'sand',
  ],
  [
    'NL-LMP-02',
    'DEMO000003',
    '可调光阅读台灯',
    'Northline Adjustable Reading Lamp',
    '家居与厨房',
    'lamp',
    39.99,
    18,
    56,
    'cream',
  ],
  [
    'NL-BAG-15',
    'DEMO000004',
    '轻量通勤电脑包 · 15寸',
    'Northline Laptop Sleeve, 15 Inch, Recycled Fabric',
    '电脑配件',
    'bag',
    32.0,
    134,
    38,
    'slate',
  ],
  [
    'NL-POT-03',
    'DEMO000005',
    '陶瓷花盆三件套',
    'Northline Ceramic Planters, Set of 3',
    '庭院与园艺',
    'pot',
    26.99,
    210,
    33,
    'terracotta',
  ],
  [
    'NL-MAT-90',
    'DEMO000006',
    '软木桌垫 · 90cm',
    'Northline Cork Desk Mat, 90 x 40 cm',
    '办公用品',
    'mat',
    22.99,
    15,
    42,
    'sand',
  ],
  [
    'NL-BOX-06',
    'DEMO000007',
    '厨房密封储物罐',
    'Northline Airtight Kitchen Containers, Set of 6',
    '家居与厨房',
    'box',
    35.99,
    174,
    39,
    'sage',
  ],
  [
    'NL-CAB-03',
    'DEMO000008',
    '编织充电线三件套',
    'Northline Braided USB-C Cable, 3 Pack',
    '电子配件',
    'cable',
    18.99,
    97,
    28,
    'slate',
  ],
];
export function stores(env = process.env) {
  const result = Object.entries(MARKETPLACES).map(([code, m]) => ({
    id: 'demo-' + code.toLowerCase(),
    name: 'Northline · ' + m.country,
    code,
    marketplaceId: m.id,
    currency: m.currency,
    source: 'demo',
    sourceLabel: '演示店铺',
    domain: m.domain,
  }));
  if (isAmazonConfigured(env)) {
    const code = env.AMAZON_MARKETPLACE || 'US';
    const m = MARKETPLACES[code];
    if (m)
      result.unshift({
        id: 'amazon-' + code.toLowerCase(),
        name: '我的亚马逊店铺 · ' + m.country,
        code,
        marketplaceId: m.id,
        currency: m.currency,
        source: 'amazon',
        sourceLabel: '真实店铺',
        domain: m.domain,
      });
  }
  return result;
}
export function demoSnapshot(store) {
  const factor = store.code === 'US' ? 1 : store.code === 'DE' ? 0.74 : 0.57;
  const products = catalog.map(
    ([sku, asin, name, title, category, kind, price, stock, sales7, color], i) => ({
      sku,
      asin,
      name,
      title,
      category,
      kind,
      price,
      stock: Math.round(stock * factor),
      sales7: Math.round(sales7 * factor),
      color,
      inbound: i === 0 ? 120 : i === 2 ? 80 : 0,
      listingStatus: 'ACTIVE',
    }),
  );
  const revenue = products.reduce((n, p) => n + p.price * p.sales7, 0);
  const values = [0.76, 0.88, 0.82, 1.05, 0.97, 1.12, 1.2];
  const totalWeight = values.reduce((a, b) => a + b, 0);
  const chart = values.map((v, i) => ({
    label: '周' + ['五', '六', '日', '一', '二', '三', '四'][i],
    value: Math.round((revenue * v) / totalWeight),
    previous: Math.round(((revenue * v) / totalWeight) * 0.84),
  }));
  return {
    store,
    products,
    revenue,
    orders: Math.round(products.reduce((n, p) => n + p.sales7, 0) * 0.92),
    chart,
    collectedAt: new Date().toISOString(),
    source: 'demo',
    salesPeriod: '演示近 7 日',
  };
}
