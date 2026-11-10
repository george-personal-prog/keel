/**
 * Light haptic tick.
 * - iOS 18+ Safari: toggling an <input type="checkbox" switch> via its label plays the system
 *   haptic. We keep one hidden switch in the DOM and click its label.
 * - Elsewhere: the Vibration API if present. Otherwise silently nothing.
 */

let label: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null;
  if (label?.isConnected) return label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.id = 'keel-haptic';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  label = document.createElement('label');
  label.htmlFor = 'keel-haptic';
  label.setAttribute('aria-hidden', 'true');
  for (const el of [input, label]) {
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  }
  document.body.append(input, label);
  return label;
}

const isIOS = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

export function haptic(kind: 'tick' | 'success' = 'tick'): void {
  try {
    if (isIOS) {
      const l = ensureSwitch();
      l?.click();
      if (kind === 'success') setTimeout(() => l?.click(), 90);
      return;
    }
    navigator.vibrate?.(kind === 'success' ? [12, 60, 18] : 10);
  } catch {
    /* haptics are a nicety */
  }
}
