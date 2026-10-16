import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="field-label">
          {label}
        </label>
      )}
      <input
        className={`field ${error ? '!border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 font-mono text-xs text-red-400">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-zinc-500">{helperText}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="field-label">
          {label}
        </label>
      )}
      <textarea
        className={`field resize-none ${error ? '!border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 font-mono text-xs text-red-400">{error}</p>}
    </div>
  );
}
