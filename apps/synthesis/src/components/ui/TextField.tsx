'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function TextField({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-line-strong bg-dusk-raised px-5 py-4 text-base text-mist placeholder:text-mist-faint focus:border-own focus:outline-none ${className}`}
    />
  );
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl border border-line-strong bg-dusk-raised px-5 py-4 text-base text-mist placeholder:text-mist-faint focus:border-own focus:outline-none resize-none ${className}`}
    />
  );
}

export default TextField;
