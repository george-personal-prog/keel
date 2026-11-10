/**
 * Hand-built SVG charts in Keel's language. Rules (docs/DESIGN.md, dataviz method):
 * one y-axis, 2px lines, ≥ 8px markers with a surface ring, recessive grid, text in text
 * tokens (never series colour), and a touch/hover readout on every plot.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './charts.css';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(120, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function shortDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// ==================================================================== line

export interface LinePoint {
  date: string;
  y: number;
  highlight?: boolean;
  detail?: string;
}

export function LineChart({
  points,
  format = (v) => String(Math.round(v)),
  tone = 'ink',
  height = 180,
  invert = false,
  target,
  label,
  highlightLabel = 'PR',
}: {
  points: LinePoint[];
  format?: (v: number) => string;
  tone?: 'ink' | 'sea' | 'signal';
  height?: number;
  /** Lower is better (e.g. pace): flip the axis so "up" still means "better". */
  invert?: boolean;
  target?: number;
  label: string;
  highlightLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const geo = useMemo(() => {
    if (!points.length) return null;
    const ys = points.map((p) => p.y).concat(target != null ? [target] : []);
    const spread = Math.max(...ys) - Math.min(...ys);
    const ticks = niceTicks(Math.min(...ys) - spread * 0.08, Math.max(...ys) + spread * 0.08, 3);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const x0 = dayNum(points[0].date);
    const x1 = Math.max(x0 + 1, dayNum(points[points.length - 1].date));
    const sx = (d: string) => pad.l + (points.length === 1 ? innerW / 2 : ((dayNum(d) - x0) / (x1 - x0)) * innerW);
    const sy = (v: number) => {
      const t = (v - y0) / (y1 - y0 || 1);
      return pad.t + (invert ? t : 1 - t) * innerH;
    };
    return { ticks, sx, sy };
  }, [points, target, innerW, innerH, invert, pad.l, pad.t]);

  if (!geo) return <div className="chart-empty">No data yet</div>;
  const { ticks, sx, sy } = geo;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.date).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const xLabels = points.length > 1 ? [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]] : [points[0]];

  const pick = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(sx(p.date) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  const h = hover != null ? points[hover] : null;
  const last = points[points.length - 1];

  return (
    <div className={`chart chart-${tone}`} ref={ref} style={{ minHeight: height }}>
      {width > 0 && <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: ${points.length} points, latest ${format(last.y)}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} />
            <text className="chart-tick" x={pad.l - 6} y={sy(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {target != null && (
          <g>
            <line className="chart-target" x1={pad.l} x2={width - pad.r} y1={sy(target)} y2={sy(target)} />
            <text className="chart-tick" x={pad.l + 4} y={sy(target) - 5} textAnchor="start">
              target
            </text>
          </g>
        )}
        {xLabels.map((p, i) => (
          <text key={i} className="chart-tick" x={sx(p.date)} y={height - 6} textAnchor={i === 0 && xLabels.length > 1 ? 'start' : i === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle'}>
            {shortDay(p.date)}
          </text>
        ))}
        <path className="chart-line" d={path} />
        {points.map((p, i) =>
          p.highlight ? <circle key={i} className="chart-pr" cx={sx(p.date)} cy={sy(p.y)} r={5} /> : null,
        )}
        <circle className="chart-last" cx={sx(last.date)} cy={sy(last.y)} r={5} />
        {h && (
          <g>
            <line className="chart-cross" x1={sx(h.date)} x2={sx(h.date)} y1={pad.t} y2={height - pad.b} />
            <circle className="chart-hover" cx={sx(h.date)} cy={sy(h.y)} r={6} />
          </g>
        )}
      </svg>}
      {h && width > 0 && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(sx(h.date), 70), width - 70), top: Math.max(0, sy(h.y) - (h.detail ? 74 : 56)) }}>
          <strong>{format(h.y)}</strong>
          <span>
            {shortDay(h.date)}
            {h.highlight ? ` · ${highlightLabel}` : ''}
          </span>
          {h.detail && <span>{h.detail}</span>}
        </div>
      )}
    </div>
  );
}

// ==================================================================== bars

export interface Bar {
  key: string;
  label: string;
  value: number;
  detail?: string;
  emphasis?: boolean;
}

export function BarChart({
  bars,
  height = 140,
  tone = 'ink',
  band,
  format = (v) => String(Math.round(v)),
  label,
  compact,
}: {
  bars: Bar[];
  height?: number;
  tone?: 'ink' | 'sea' | 'signal';
  /** Shaded reference range, e.g. a weekly set target. */
  band?: [number, number];
  format?: (v: number) => string;
  label: string;
  compact?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = compact ? { l: 0, r: 0, t: 6, b: 16 } : { l: 32, r: 4, t: 10, b: 22 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxV = Math.max(1, ...bars.map((b) => b.value), band?.[1] ?? 0);
  const ticks = compact ? [] : niceTicks(0, maxV, 3);
  const top = compact ? maxV * 1.1 : ticks[ticks.length - 1];
  const sy = (v: number) => pad.t + innerH - (v / top) * innerH;
  const slot = innerW / Math.max(1, bars.length);
  const bw = Math.max(4, Math.min(28, slot - 2));

  return (
    <div className={`chart chart-${tone} ${compact ? 'chart-compact' : ''}`} ref={ref} style={{ minHeight: height }}>
      {width > 0 && <svg width={width} height={height} role="img" aria-label={`${label}: ${bars.map((b) => `${b.label} ${format(b.value)}`).join(', ')}`} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} />
            <text className="chart-tick" x={pad.l - 6} y={sy(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {band && <rect className="chart-band" x={pad.l} width={innerW} y={sy(band[1])} height={Math.max(0, sy(band[0]) - sy(band[1]))} />}
        {bars.map((b, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const y = sy(b.value);
          const h = Math.max(0, pad.t + innerH - y);
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  className={`chart-bar ${b.emphasis ? 'is-emph' : ''} ${hover === i ? 'is-hover' : ''}`}
                  d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`}
                />
              )}
            </g>
          );
        })}
        <line className="chart-axis" x1={pad.l} x2={width - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} />
        {bars.map((b, i) =>
          i === 0 || i === bars.length - 1 || (!compact && bars.length <= 8) ? (
            <text key={b.key} className="chart-tick" x={pad.l + i * slot + slot / 2} y={height - 5} textAnchor="middle">
              {b.label}
            </text>
          ) : null,
        )}
      </svg>}
      {hover != null && bars[hover] && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(pad.l + hover * slot + slot / 2, 60), width - 60), top: Math.max(0, sy(bars[hover].value) - 52) }}>
          <strong>{format(bars[hover].value)}</strong>
          <span>{bars[hover].detail ?? bars[hover].label}</span>
        </div>
      )}
    </div>
  );
}

// ==================================================================== stat

export function Stat({ value, unit, label, delta, tone }: { value: ReactNode; unit?: string; label: string; delta?: { text: string; good: boolean | null }; tone?: 'brass' | 'sea' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-value">
        <span className="display">{value}</span>
        {unit && <small>{unit}</small>}
      </div>
      <div className="stat-label">{label}</div>
      {delta && <div className={`stat-delta ${delta.good === true ? 'is-good' : delta.good === false ? 'is-bad' : ''}`}>{delta.text}</div>}
    </div>
  );
}
