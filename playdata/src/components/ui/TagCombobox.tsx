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
          className="w-full rounded-xl border border-[#35354a] bg-[#0d0d18] px-3 py-2 pr-8 text-sm text-white placeholder-[#4a4a60] focus:border-violet-500/60 focus:outline-none"
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
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4a4a60] hover:text-[#8d8da0] transition"
        >
          <ChevronDown className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[#35354a] bg-[#11111f] py-1 shadow-2xl shadow-black/50">
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
                    isActive ? 'bg-violet-500/15 text-white' : 'text-[#c9c9d4]'
                  }`}
                >
                  {isNew ? (
                    <>
                      <Plus className="size-3 shrink-0 text-violet-400" />
                      <span>
                        Create tag:{' '}
                        <span className="font-medium text-violet-300">{label}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className={`size-3 shrink-0 ${isSelected ? 'text-violet-400' : 'invisible'}`} />
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
