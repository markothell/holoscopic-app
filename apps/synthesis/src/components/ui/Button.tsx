'use client';

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'own' | 'join' | 'live';

const styles: Record<Variant, string> = {
  primary: 'bg-mist text-dusk active:scale-[0.98] disabled:opacity-30',
  ghost: 'bg-transparent text-mist border border-line-strong active:bg-dusk-soft disabled:opacity-30',
  own: 'bg-own text-dusk-deep active:scale-[0.98] disabled:opacity-30',
  join: 'bg-join text-dusk-deep active:scale-[0.98] disabled:opacity-30',
  live: 'bg-live text-dusk-deep active:scale-[0.98] disabled:opacity-30',
};

export default function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`font-[family-name:var(--font-ui)] font-semibold w-full rounded-full px-6 py-4 text-base transition-transform duration-100 ${styles[variant]} ${className}`}
    />
  );
}
