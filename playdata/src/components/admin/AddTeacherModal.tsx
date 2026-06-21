'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, Mail, Loader2, Trash2, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AddTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvited: () => void;
}

interface Row {
  email: string;
  full_name: string;
}

interface ResultItem {
  email: string;
  status: 'invited' | 'skipped' | 'error';
  message?: string;
}

function parseManualText(text: string): Row[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, ...rest] = line.split(',');
      return { email: email.trim(), full_name: rest.join(',').trim() };
    });
}

function parseCsvText(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const splitLine = (line: string) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));

  const firstCells = splitLine(lines[0]);
  const emailColGuess = firstCells.findIndex((c) => /email/i.test(c));
  const hasHeader = emailColGuess !== -1;

  const emailCol = hasHeader ? emailColGuess : 0;
  const nameCol = hasHeader
    ? firstCells.findIndex((c) => /name/i.test(c))
    : 1;

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => splitLine(line))
    .filter((cells) => cells[emailCol])
    .map((cells) => ({
      email: cells[emailCol] ?? '',
      full_name: nameCol >= 0 ? cells[nameCol] ?? '' : '',
    }));
}

export function AddTeacherModal({ isOpen, onClose, onInvited }: AddTeacherModalProps) {
  const [tab, setTab] = useState<'manual' | 'csv'>('manual');
  const [manualText, setManualText] = useState('');
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setTab('manual');
    setManualText('');
    setCsvFileName(null);
    setRows([]);
    setResults(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleManualChange = (value: string) => {
    setManualText(value);
    setRows(parseManualText(value));
  };

  const handleFile = (file: File) => {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setRows(parseCsvText(text));
    };
    reader.readAsText(file);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teachers: rows }),
      });
      const json = await res.json() as { results?: ResultItem[]; error?: string };

      if (json.error) {
        toast.error(json.error);
        return;
      }

      const list = json.results ?? [];
      setResults(list);

      const invited = list.filter((r) => r.status === 'invited').length;
      const skipped = list.filter((r) => r.status === 'skipped').length;
      const errored = list.filter((r) => r.status === 'error').length;

      if (invited > 0) {
        toast.success(
          `Invited ${invited} teacher${invited !== 1 ? 's' : ''}`,
          { description: skipped || errored ? `${skipped} skipped, ${errored} failed` : undefined }
        );
        onInvited();
      } else {
        toast.error('No invites sent', { description: `${skipped} skipped, ${errored} failed` });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-lg shadow-xl z-50"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Add Teachers</h2>
              <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded transition-all">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {results ? (
                <div className="space-y-2">
                  {results.map((r) => (
                    <div
                      key={r.email}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {r.status === 'invited' && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />}
                        {r.status === 'skipped' && <MinusCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                        {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        <span className="text-slate-800">{r.email}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {r.status === 'invited' ? 'Invited' : r.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
                    {(['manual', 'csv'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
                          tab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t === 'manual' ? 'Enter manually' : 'Upload CSV'}
                      </button>
                    ))}
                  </div>

                  {tab === 'manual' ? (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        One teacher per line
                      </label>
                      <textarea
                        value={manualText}
                        onChange={(e) => handleManualChange(e.target.value)}
                        placeholder={'jane.doe@university.ac.uk, Jane Doe\nj.smith@university.ac.uk'}
                        rows={5}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-xs text-slate-500">Format: email, full name (name is optional)</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">CSV file</label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        <UploadCloud className="w-5 h-5" />
                        {csvFileName ?? 'Choose a .csv file'}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFile(file);
                        }}
                      />
                      <p className="text-xs text-slate-500">
                        Needs an &ldquo;email&rdquo; column (and optionally a &ldquo;name&rdquo; column), or just email in the first column.
                      </p>
                    </div>
                  )}

                  {/* Preview */}
                  {rows.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-slate-700">{rows.length} to invite</p>
                      <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-slate-200 p-2">
                        {rows.map((row, i) => (
                          <div key={`${row.email}-${i}`} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-800 truncate">{row.email}</span>
                              {row.full_name && <span className="text-slate-400 truncate">— {row.full_name}</span>}
                            </div>
                            <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500 shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200">
              {results ? (
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={handleClose}
                    disabled={submitting}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || rows.length === 0}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {submitting ? 'Sending invites…' : `Invite ${rows.length || ''}`.trim()}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
