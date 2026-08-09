'use client';
import { useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  availableTags: string[];
  placeholder?: string;
}

export function TagCombobox({ value, onChange, availableTags, placeholder = 'e.g. Statistics' }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? availableTags.filter((t) => t.toLowerCase().includes(value.toLowerCase()))
    : availableTags;

  const hasExactMatch = availableTags.some(
    (t) => t.toLowerCase() === value.trim().toLowerCase()
  );
  const showCreate = value.trim() !== '' && !hasExactMatch;

  const options: string[] = [
    ...filtered,
    ...(showCreate ? [`__new__:${value.trim()}`] : []),
  ];

  function select(opt: string) {
    const v = opt.startsWith('__new__:') ? opt.slice(8) : opt;
    onChange(v);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleFocus() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function handleBlur() {
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setActiveIdx(-1);
    }, 150);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown') {
        setOpen(true);
        setActiveIdx(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActiveIdx((i) => Math.max(i - 1, -1));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && options[activeIdx]) select(options[activeIdx]);
      setOpen(false);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
      e.preventDefault();
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 pr-8 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            if (open) {
              setOpen(false);
            } else {
              inputRef.current?.focus();
              setOpen(true);
            }
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600"
        >
          <ChevronDown className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {options.map((opt, i) => {
            const isNew = opt.startsWith('__new__:');
            const label = isNew ? opt.slice(8) : opt;
            const isActive = i === activeIdx;
            const isSelected = !isNew && opt.toLowerCase() === value.trim().toLowerCase();
            return (
              <li key={opt}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                    isActive ? 'bg-violet-50 text-violet-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {isNew ? (
                    <>
                      <Plus className="size-3 shrink-0 text-violet-600" />
                      <span>
                        Create tag:{' '}
                        <span className="font-medium text-violet-700">{label}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className={`size-3 shrink-0 ${isSelected ? 'text-violet-600' : 'invisible'}`} />
                      <span>{label}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
