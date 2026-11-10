import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { haptic } from './haptics';
import { IconMinus, IconPlus } from './icons';
import './components.css';

// ------------------------------------------------------------------ Button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'sea';
  size?: 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', block, icon, className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`} {...rest}>
      {icon}
      {children != null && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={`icon-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Capsule (A, B1...)

export function Capsule({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'signal' | 'sea' | 'brass' | 'ok' | 'danger' }) {
  return <span className={`capsule capsule-${tone}`}>{children}</span>;
}

// ------------------------------------------------------------------ Card

export function Card({ children, className = '', onClick, as = 'div' }: { children: ReactNode; className?: string; onClick?: () => void; as?: 'div' | 'button' | 'section' }) {
  const Tag = as;
  return (
    <Tag className={`card ${onClick ? 'card-tap' : ''} ${className}`} onClick={onClick}>
      {children}
    </Tag>
  );
}

// ------------------------------------------------------------------ Sheet

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  // Lifecycle: present (mounted) → closing (slide-out animation) → unmounted.
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);
  // While closing, keep showing the last content so it doesn't vanish mid-animation.
  const [held, setHeld] = useState<{ title?: ReactNode; children: ReactNode; footer?: ReactNode }>({ title, children, footer });
  if (open && !present) setPresent(true);
  if (open && closing) setClosing(false);
  if (!open && present && !closing) setClosing(true);
  if (open && (held.children !== children || held.title !== title || held.footer !== footer)) setHeld({ title, children, footer });
  const content = open ? { title, children, footer } : held;

  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => {
      setPresent(false);
      setClosing(false);
    }, 260);
    return () => clearTimeout(t);
  }, [closing]);

  // Focus moves into the sheet when it opens and returns to where it was when it closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!present) return null;
  return (
    <div className={`sheet-root ${closing ? 'is-closing' : ''}`} role="dialog" aria-modal="true">
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="sheet" style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}>
        <div
          className="sheet-grab"
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => dragStart.current != null && setDragY(Math.max(0, e.clientY - dragStart.current))}
          onPointerUp={() => {
            if (dragY > 90) onClose();
            dragStart.current = null;
            setDragY(0);
          }}
        >
          <span />
        </div>
        {content.title && <div className="sheet-title">{content.title}</div>}
        <div className="sheet-body">{content.children}</div>
        {content.footer && <div className="sheet-footer">{content.footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ RIR chips

const RIR_VALUES = [0, 1, 2, 3, 4] as const;

export function RirChips({ value, target, onChange, compact }: { value: number | null; target?: number; onChange: (v: number) => void; compact?: boolean }) {
  return (
    <div className={`rir-chips ${compact ? 'rir-compact' : ''}`} role="radiogroup" aria-label="Reps in reserve">
      {RIR_VALUES.map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          className={`rir-chip rir-${v} ${value === v ? 'is-on' : ''} ${target === v ? 'is-target' : ''}`}
          onClick={() => {
            haptic();
            onChange(v);
          }}
        >
          {v === 4 ? '4+' : v}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Stepper

export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max = 999,
  unit,
  label,
  format = (v) => String(Number(v.toFixed(2))),
  decimal = true,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  label: string;
  format?: (v: number) => string;
  decimal?: boolean;
}) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const set = (v: number) => {
    const c = Math.min(max, Math.max(min, Math.round(v * 100) / 100));
    haptic();
    onChange(c);
  };
  return (
    <div className="stepper">
      <div className="eyebrow">{label}</div>
      <div className="stepper-row">
        <button className="stepper-btn" aria-label={`Decrease ${label}`} onClick={() => set(value - step)}>
          <IconMinus />
        </button>
        <label className="stepper-value">
          <input
            className="display"
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={editing ? text : format(value)}
            aria-label={label}
            onFocus={(e) => {
              setText(format(value));
              setEditing(true);
              const el = e.target;
              requestAnimationFrame(() => el.select());
            }}
            onChange={(e) => setText(e.target.value.replace(',', '.'))}
            onBlur={() => {
              setEditing(false);
              const v = Number(text);
              if (text.trim() !== '' && Number.isFinite(v)) set(v);
            }}
          />
          {unit && <span className="stepper-unit">{unit}</span>}
        </label>
        <button className="stepper-btn" aria-label={`Increase ${label}`} onClick={() => set(value + step)}>
          <IconPlus />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Segmented

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          onClick={() => {
            haptic();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ List row

export function Row({ label, detail, children, onClick }: { label: ReactNode; detail?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`row ${onClick ? 'row-tap' : ''}`} onClick={onClick}>
      <span className="row-main">
        <span className="row-label">{label}</span>
        {detail && <span className="row-detail">{detail}</span>}
      </span>
      {children}
    </Tag>
  );
}

// ------------------------------------------------------------------ Toast

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className={`toast ${message ? 'is-shown' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

// ------------------------------------------------------------------ Waterline progress

export function Waterline({ value }: { value: number }) {
  return (
    <div className="waterline" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
    </div>
  );
}
