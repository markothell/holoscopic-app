'use client';

import type { InputHTMLAttributes } from 'react';

export default function TextField({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-line-strong bg-paper-raised px-5 py-4 text-lg text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none ${className}`}
    />
  );
}
