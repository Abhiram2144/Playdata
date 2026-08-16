'use client';
import { Check, Plus, Tag } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  availableTags: string[];
  placeholder?: string;
}

// Input + always-visible tag pills. A dropdown gets clipped by the
// overflow-hidden panels that animate open around this component, so the
// existing tags are rendered inline instead.
export function TagCombobox({ value, onChange, availableTags, placeholder = 'e.g. Statistics' }: Props) {
  const trimmed = value.trim();
  const query = trimmed.toLowerCase();

  const filtered = query
    ? availableTags.filter((t) => t.toLowerCase().includes(query))
    : availableTags;

  const hasExactMatch = availableTags.some((t) => t.toLowerCase() === query);
  const isNewTag = trimmed !== '' && !hasExactMatch;

  return (
    <div className="space-y-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
      />

      {availableTags.length > 0 && (
        <div className="max-h-24 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {filtered.map((tag) => {
              const isSelected = tag.toLowerCase() === query;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onChange(isSelected ? '' : tag)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    isSelected
                      ? 'border-violet-300 bg-violet-50 text-violet-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:bg-violet-50/50 hover:text-violet-700'
                  }`}
                >
                  {isSelected ? <Check className="size-3" /> : <Tag className="size-3 text-gray-400" />}
                  {tag}
                </button>
              );
            })}
            {filtered.length === 0 && !isNewTag && (
              <span className="py-1 text-xs text-gray-400">No matching tags</span>
            )}
          </div>
        </div>
      )}

      {isNewTag && (
        <p className="flex items-center gap-1 text-xs text-violet-600">
          <Plus className="size-3" />
          New tag <span className="font-semibold">“{trimmed}”</span> will be created
        </p>
      )}
    </div>
  );
}
