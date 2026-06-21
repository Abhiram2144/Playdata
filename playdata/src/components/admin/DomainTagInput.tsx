'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';

interface DomainTagInputProps {
  domains: string[];
  onDomainsChange: (domains: string[]) => void;
  placeholder?: string;
}

export function DomainTagInput({
  domains,
  onDomainsChange,
  placeholder = 'Enter domain (e.g., example.ac.uk)',
}: DomainTagInputProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const validateDomain = (domain: string): boolean => {
    const domainRegex =
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    return domainRegex.test(domain);
  };

  const handleAddDomain = () => {
    const trimmed = input.trim().toLowerCase();

    if (!trimmed) {
      setError('Domain cannot be empty');
      return;
    }

    if (!validateDomain(trimmed)) {
      setError('Invalid domain format');
      return;
    }

    if (domains.includes(trimmed)) {
      setError('Domain already added');
      return;
    }

    onDomainsChange([...domains, trimmed]);
    setInput('');
    setError('');
  };

  const handleRemoveDomain = (domain: string) => {
    onDomainsChange(domains.filter((d) => d !== domain));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddDomain();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError('');
          }}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 border text-black border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleAddDomain}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add
        </motion.button>
      </div>

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      {domains.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <motion.div
              key={domain}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full"
            >
              <span className="text-sm font-medium text-indigo-700">{domain}</span>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleRemoveDomain(domain)}
                className="p-0.5 hover:bg-indigo-200 rounded transition-all"
              >
                <X className="w-3 h-3 text-indigo-600" />
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      {domains.length > 0 && (
        <p className="text-xs text-slate-600">
          {domains.length} domain{domains.length !== 1 ? 's' : ''} added
        </p>
      )}
    </div>
  );
}
