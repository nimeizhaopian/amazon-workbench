import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MARKETPLACES = {
  US: {
    id: 'ATVPDKIKX0DER',
    country: '美国',
    currency: 'USD',
    region: 'na',
    domain: 'amazon.com',
    timezone: 'America/Los_Angeles',
  },
  DE: {
    id: 'A1PA6795UKMFR9',
    country: '德国',
    currency: 'EUR',
    region: 'eu',
    domain: 'amazon.de',
    timezone: 'Europe/Berlin',
  },
  UK: {
    id: 'A1F83G8C2ARO7P',
    country: '英国',
    currency: 'GBP',
    region: 'eu',
    domain: 'amazon.co.uk',
    timezone: 'Europe/London',
  },
};
export const amazonEnvKeys = [
  'AMAZON_LWA_CLIENT_ID',
  'AMAZON_LWA_CLIENT_SECRET',
  'AMAZON_REFRESH_TOKEN',
  'AMAZON_SELLER_ID',
];
export const isAmazonConfigured = (env = process.env) =>
  amazonEnvKeys.every((key) => !!env[key]?.trim());
export function configFromEnv(env = process.env) {
  const port = Number(env.AW_PORT || 4810);
  const dshPort = Number(env.DSH_PORT || 3088);
  if (
    ![port, dshPort].every((v) => Number.isInteger(v) && v > 1024 && v < 65536) ||
    port === dshPort
  )
    throw new Error('工作台与 DSH 需要两个不同的有效端口');
  return {
    port,
    dshPort,
    dataDir: resolve(ROOT, env.AW_DATA_DIR || '.data'),
    dshEnabled: env.DSH_ENABLED !== 'false',
  };
}
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
// API 错误只输出运营可理解的信息，不把认证响应或请求头带回浏览器。
export function publicError(error) {
  return error instanceof AppError ? error.message : '处理失败，请查看本地服务日志或稍后重试';
}
export const fmtNumber = (n) => (n == null ? '—' : new Intl.NumberFormat('zh-CN').format(n));
export const fmtMoney = (n, currency = 'USD') =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(n);
export const fmtTime = (value) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
