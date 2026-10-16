import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-none border font-mono tracking-[0.15em] uppercase',
  {
    variants: {
      variant: {
        default: 'bg-white/[0.03] border-white/10 text-zinc-400',
        primary: 'bg-[#d4ff00]/10 border-[#d4ff00]/30 text-[#d4ff00]',
        success: 'bg-[#d4ff00]/10 border-[#d4ff00]/30 text-[#d4ff00]',
        warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        danger: 'bg-red-500/20 border-red-500/30 text-red-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={badgeVariants({ variant, className })} {...props} />;
}
