import { AppError, fmtMoney, fmtNumber, fmtTime } from './config.mjs';
export function decorateSnapshot(snapshot) {
  const products = snapshot.products.map((p) => {
    const daily = p.sales7 == null ? null : p.sales7 / 7;
    const days = daily > 0 && p.stock != null ? Math.floor(p.stock / daily) : null;
    const severity =
      p.stock == null
        ? 'unknown'
        : p.stock === 0
          ? 'critical'
          : p.sales7 == null
            ? 'unknown'
            : days !== null && days < 7
              ? 'critical'
              : days !== null && days < 14
                ? 'warning'
                : 'healthy';
    const status =
      severity === 'critical'
        ? '优先补货'
        : severity === 'warning'
          ? '关注库存'
          : severity === 'unknown'
            ? '待评估'
            : '库存正常';
    return {
      ...p,
      coverageDays: days,
      severity,
      status,
      stockLabel: fmtNumber(p.stock),
      salesLabel: fmtNumber(p.sales7),
      priceLabel: fmtMoney(p.price, snapshot.store.currency),
      coverageLabel: days === null ? '待补充销量' : days + ' 天',
      inboundLabel: fmtNumber(p.inbound),
    };
  });
  const risk = products.filter((p) => ['critical', 'warning'].includes(p.severity));
  return {
    ...snapshot,
    products,
    metrics: {
      revenue: fmtMoney(snapshot.revenue, snapshot.store.currency),
      orders: fmtNumber(snapshot.orders),
      inventory: products.some((p) => p.stock == null)
        ? '—'
        : fmtNumber(products.reduce((n, p) => n + p.stock, 0)),
      risk: fmtNumber(risk.length),
      sku: fmtNumber(products.length),
    },
    alerts: risk.map((p) => ({
      sku: p.sku,
      name: p.name,
      severity: p.severity,
      message:
        p.stock === 0
          ? '可售库存为 0，请核对补货计划'
          : '按近 7 日销量计算，仅可售约 ' + p.coverageDays + ' 天',
      action: '查看商品',
    })),
    collectedLabel: fmtTime(snapshot.collectedAt),
    sourceLabel: snapshot.source === 'demo' ? '演示数据' : 'Amazon SP-API',
  };
}
export const TASK_TYPES = {
  inventory_daily: {
    name: '库存运营日报',
    description: '汇总可售库存、识别缺货风险并生成行动清单',
    icon: 'report',
  },
  listing_audit: {
    name: 'Listing 基础检查',
    description: '检查现有标题、SKU 与商品信息完整性',
    icon: 'listing',
  },
  replenishment: {
    name: '补货建议',
    description: '基于近 7 日销量估算 30 天库存缺口',
    icon: 'stock',
  },
};
export function generateReport(type, snapshot) {
  const products = snapshot.products;
  const findings = [];
  if (type === 'inventory_daily')
    for (const p of products.filter((p) => ['critical', 'warning'].includes(p.severity)))
      findings.push({
        sku: p.sku,
        title: p.name,
        level: p.severity,
        detail:
          p.stock === 0
            ? '可售库存已为零。'
            : '库存 ' + p.stockLabel + ' 件；预计覆盖 ' + p.coverageLabel + '。',
        action: '核对在途 ' + p.inboundLabel + ' 件，确认到货时间。',
      });
  if (type === 'replenishment')
    for (const p of products) {
      if (p.sales7 == null || p.stock == null || p.inbound == null) continue;
      const amount = Math.max(0, Math.ceil((p.sales7 / 7) * 30 - p.stock - p.inbound));
      if (amount > 0)
        findings.push({
          sku: p.sku,
          title: p.name,
          level: p.severity,
          detail: '建议补货 ' + amount + ' 件；目标覆盖 30 天，扣除当前库存及在途。',
          action: '结合实际交期、促销计划与采购起订量复核。',
        });
    }
  if (type === 'listing_audit')
    for (const p of products) {
      const issues = [];
      if (!p.title?.trim()) issues.push('标题为空');
      if (p.title?.length > 200) issues.push('标题超过 200 字符，请按所属类目政策复核');
      if (!p.asin) issues.push('缺少 ASIN');
      if (p.title?.length < 45) issues.push('标题较短，可核对是否遗漏已有的重要属性');
      if (issues.length)
        findings.push({
          sku: p.sku,
          title: p.name,
          level: 'warning',
          detail: issues.join('；'),
          action: '仅依据商品事实编辑本地草稿，复核后再决定发布。',
        });
    }
  const missingSales = products.filter((p) => p.sales7 == null).length;
  const unavailable =
    type === 'replenishment' && missingSales === products.length && products.length > 0;
  return {
    title: TASK_TYPES[type].name,
    summary: unavailable
      ? '缺少逐 SKU 销量，暂无法生成补货数量。'
      : findings.length
        ? '已检查 ' + products.length + ' 个 SKU，发现 ' + findings.length + ' 项值得关注的事项。'
        : '已检查 ' + products.length + ' 个 SKU，本次规则检查未发现异常。',
    method: '规则分析，未调用大模型',
    sourceLabel: snapshot.sourceLabel,
    source: snapshot.source,
    collectedAt: snapshot.collectedAt,
    notes:
      snapshot.source === 'demo'
        ? '基于虚构演示数据；未访问或修改任何店铺。'
        : snapshot.products.some((p) => p.sales7 == null)
          ? '已读取真实 FBA 库存。缺少逐 SKU 销量，不计算覆盖天数与补货数量。'
          : '只读报告；未修改店铺。',
    findings,
    metrics: snapshot.metrics,
  };
}
export function csvEscape(value) {
  let text = String(value ?? '');
  // 导出可能包含外部商品标题，防止表格软件把单元格解释为公式。
  if (/^\s*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function reportCsv(task) {
  if (!task.report) throw new AppError('任务尚无可导出的报告', 409);
  const rows = [
    ['任务', task.title],
    ['数据来源', task.report.sourceLabel],
    ['分析方式', task.report.method],
    ['说明', task.report.notes],
    [],
    ['SKU', '商品', '问题', '建议'],
    ...task.report.findings.map((f) => [f.sku, f.title, f.detail, f.action]),
  ];
  return '﻿' + rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}
