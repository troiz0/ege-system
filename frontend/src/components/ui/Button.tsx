import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-[#d4ff00] hover:brightness-110 hover:shadow-glow text-black focus:ring-[#d4ff00]',
        secondary: 'bg-white/[0.03] hover:bg-white/[0.06] text-zinc-100 border border-white/10 backdrop-blur-xl',
        outline: 'bg-transparent hover:bg-white/[0.04] text-zinc-300 border border-white/10 hover:border-[#d4ff00]/40',
        ghost: 'bg-transparent hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-100',
        danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-600',
        success: 'bg-[#d4ff00] hover:brightness-110 text-black focus:ring-[#d4ff00]',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm rounded-none',
        md: 'px-4 py-2 text-base rounded-none',
        lg: 'px-6 py-3 text-lg rounded-none',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}
