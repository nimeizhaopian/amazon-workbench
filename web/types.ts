export interface Store {
  id: string;
  name: string;
  code: string;
  marketplaceId: string;
  currency: string;
  source: 'demo' | 'amazon';
  sourceLabel: string;
  domain: string;
}
export interface Product {
  sku: string;
  asin: string;
  name: string;
  title: string;
  category: string;
  kind: string;
  color: string;
  price: number | null;
  stock: number | null;
  sales7: number | null;
  inbound: number | null;
  coverageDays: number | null;
  severity: 'critical' | 'warning' | 'healthy' | 'unknown';
  status: string;
  stockLabel: string;
  salesLabel: string;
  priceLabel: string;
  coverageLabel: string;
  inboundLabel: string;
}
export interface Snapshot {
  store: Store;
  source: 'demo' | 'amazon';
  sourceLabel: string;
  products: Product[];
  metrics: { revenue: string; orders: string; inventory: string; risk: string; sku: string };
  alerts: { sku: string; name: string; severity: string; message: string; action: string }[];
  chart: { label: string; value: number; previous: number }[];
  collectedLabel: string;
  salesPeriod: string;
}
export interface Report {
  title: string;
  summary: string;
  method: string;
  sourceLabel: string;
  source: string;
  notes: string;
  findings: { sku: string; title: string; level: string; detail: string; action: string }[];
  metrics: Snapshot['metrics'];
}
export interface Task {
  id: string;
  storeId: string;
  type: string;
  title: string;
  status: 'running' | 'completed' | 'failed';
  statusLabel: string;
  createdLabel: string;
  source: string;
  report?: Report;
  error?: string;
  steps: { name: string; status: string }[];
}
export interface Draft {
  id: string;
  storeId: string;
  sku: string;
  title: string;
  originalTitle: string;
  status: string;
  note: string;
}
export interface Connector {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  status: string;
  statusLabel: string;
  description: string;
  fields: { key: string; configured: boolean }[];
  kind: string;
  action: string;
}
export type Page = 'overview' | 'products' | 'tasks' | 'assistant' | 'connectors';
