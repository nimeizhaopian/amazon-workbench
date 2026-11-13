import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { Snapshot } from './types';

export function ProductArt({ kind, color }: { kind: string; color: string }) {
  return (
    <div className={'product-art ' + color} aria-hidden="true">
      {kind === 'bottle' ? (
        <svg viewBox="0 0 64 64">
          <rect x="24" y="6" width="16" height="7" rx="3" />
          <rect x="20" y="13" width="24" height="43" rx="8" />
          <path d="M25 23v23" fill="none" stroke="white" strokeOpacity=".45" strokeWidth="3" />
        </svg>
      ) : kind === 'lamp' ? (
        <svg viewBox="0 0 64 64">
          <path d="M19 10h26l8 21H11z" />
          <path d="M31 31h3v19h-3zM18 51h29v5H18z" />
        </svg>
      ) : kind === 'bag' ? (
        <svg viewBox="0 0 64 64">
          <rect x="10" y="16" width="44" height="34" rx="6" />
          <path d="M25 17v-6h14v6M13 25h38" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M15 29h34" stroke="white" strokeOpacity=".4" />
        </svg>
      ) : kind === 'pot' ? (
        <svg viewBox="0 0 64 64">
          <path d="m12 26 5 28h17l4-28zM36 32l3 21h15l3-21z" />
          <path
            d="M24 25V8m0 12L12 10m12 6 11-8M46 30V17"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </svg>
      ) : kind === 'mat' ? (
        <svg viewBox="0 0 64 64">
          <path d="m6 26 37-12 15 23-39 15z" />
          <path d="m12 29 30-10 9 15-32 11z" fill="none" stroke="white" strokeOpacity=".35" />
        </svg>
      ) : (
        <svg viewBox="0 0 64 64">
          <rect x="10" y="25" width="22" height="27" rx="4" />
          <rect x="35" y="17" width="20" height="35" rx="4" />
          <path
            d="M9 24h24M34 16h22M15 34h12M40 27h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </svg>
      )}
    </div>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FileText size={24} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function SalesChart({ data }: { data: Snapshot['chart'] }) {
  if (!data.length)
    return (
      <Empty title="销量数据待接入" text="当前真实连接提供 FBA 库存；销售额不会用演示数据替代。" />
    );
  const max = Math.max(...data.flatMap((p) => [p.value, p.previous])) * 1.18;
  const width = 600,
    height = 180;
  const points = data.map((p, i) => [28 + i * 88, 170 - (p.value / max) * 145]);
  const old = data.map((p, i) => [28 + i * 88, 170 - (p.previous / max) * 145]);
  const line = (values: number[][]) => values.map((p) => p.join(',')).join(' ');
  return (
    <div className="chart">
      <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="演示近七日销售额走势">
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#36a58b" stopOpacity=".2" />
            <stop offset="100%" stopColor="#36a58b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 85, 130, 175].map((y) => (
          <line key={y} x1="8" x2="590" y1={y} y2={y} stroke="#edf0ee" strokeDasharray="4 5" />
        ))}
        <polygon points={'28,178 ' + line(points) + ' 556,178'} fill="url(#chart-fill)" />
        <polyline
          points={line(old)}
          fill="none"
          stroke="#bac5c0"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <polyline
          points={line(points)}
          fill="none"
          stroke="#18836b"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="white" stroke="#18836b" strokeWidth="2" />
        ))}
      </svg>
      <div className="chart-labels">
        {data.map((p) => (
          <span key={p.label}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}
