'use client';

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'accent-x' | 'accent-y';

const styles: Record<Variant, string> = {
  primary: 'bg-ink text-paper active:scale-[0.98] disabled:opacity-30',
  ghost: 'bg-transparent text-ink border border-line-strong active:bg-paper-dim disabled:opacity-30',
  'accent-x': 'bg-ax text-white active:scale-[0.98] disabled:opacity-30',
  'accent-y': 'bg-ay text-white active:scale-[0.98] disabled:opacity-30',
};

export default function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`display w-full rounded-full px-6 py-4 text-xl transition-transform duration-100 ${styles[variant]} ${className}`}
    />
  );
}
