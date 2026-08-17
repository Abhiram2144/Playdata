import { useEffect, useRef, useState } from 'react';
import { Accessibility, Contrast, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type FontScale = 'sm' | 'md' | 'lg' | 'xl';

interface A11yPrefs {
  fontScale: FontScale;
  highContrast: boolean;
}

const STORAGE_KEY = 'playdata-a11y';
const DEFAULT_PREFS: A11yPrefs = { fontScale: 'md', highContrast: false };

const FONT_OPTIONS: { value: FontScale; label: string; sample: string }[] = [
  { value: 'sm', label: 'Small', sample: 'text-xs' },
  { value: 'md', label: 'Default', sample: 'text-sm' },
  { value: 'lg', label: 'Large', sample: 'text-base' },
  { value: 'xl', label: 'X-Large', sample: 'text-lg' },
];

function loadPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>;
    return {
      fontScale: ['sm', 'md', 'lg', 'xl'].includes(parsed.fontScale as string)
        ? (parsed.fontScale as FontScale)
        : 'md',
      highContrast: parsed.highContrast === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyPrefs(prefs: A11yPrefs) {
  const root = document.documentElement;
  if (prefs.fontScale === 'md') root.removeAttribute('data-font-scale');
  else root.setAttribute('data-font-scale', prefs.fontScale);
  if (prefs.highContrast) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_PREFS);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const update = (patch: Partial<A11yPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      applyPrefs(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private browsing) — prefs still apply for this page
      }
      return next;
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Accessibility settings"
          className="absolute bottom-14 right-0 w-72 rounded-2xl border border-gray-300 bg-white p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Accessibility</h2>
            <button
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
              aria-label="Close accessibility settings"
            >
              <X className="size-4" />
            </button>
          </div>

          <fieldset className="mb-4">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Text size
            </legend>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Text size">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={prefs.fontScale === opt.value}
                  onClick={() => update({ fontScale: opt.value })}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition',
                    prefs.fontScale === opt.value
                      ? 'border-violet-600 bg-violet-50 text-violet-700 ring-1 ring-violet-600'
                      : 'border-gray-300 text-gray-600 hover:border-violet-400 hover:bg-gray-50'
                  )}
                >
                  <span aria-hidden="true" className={cn('font-bold leading-none', opt.sample)}>
                    A
                  </span>
                  <span className="text-[10px] leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between">
            <label
              htmlFor="a11y-high-contrast"
              className="flex items-center gap-2 text-sm font-medium text-gray-800"
            >
              <Contrast className="size-4 text-gray-600" aria-hidden="true" />
              High contrast
            </label>
            <button
              id="a11y-high-contrast"
              role="switch"
              aria-checked={prefs.highContrast}
              onClick={() => update({ highContrast: !prefs.highContrast })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                prefs.highContrast ? 'bg-violet-600' : 'bg-gray-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  prefs.highContrast ? 'left-[22px]' : 'left-0.5'
                )}
              />
            </button>
          </div>
        </div>
      )}

      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Accessibility settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg ring-2 ring-white/40 transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        <Accessibility className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
