'use client';
import { useState } from 'react';
import { Info } from 'lucide-react';

export interface InfoTipEntry {
  term: string;
  desc: string;
}

export function InfoTip({ ariaLabel = 'More information', entries }: { ariaLabel?: string; entries: InfoTipEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className="text-gray-400 transition hover:text-violet-600 focus:text-violet-600 focus:outline-none"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-gray-200 bg-white p-3 text-left normal-case tracking-normal shadow-lg"
        >
          <dl className="space-y-2">
            {entries.map(({ term, desc }) => (
              <div key={term}>
                <dt className="text-xs font-semibold text-gray-800">{term}</dt>
                <dd className="text-xs font-normal leading-relaxed text-gray-600">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </span>
  );
}
