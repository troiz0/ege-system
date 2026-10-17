import React from 'react';
import { Link } from 'react-router-dom';

/** Приборный микротег: [ SYS.LOC // 2027 ] */
export function HudTag({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`hud-tag inline-flex items-center gap-2 ${className}`}>
      <span className="inline-block h-1 w-1 rounded-none bg-[#d4ff00] animate-pulse-dot" />
      {children}
    </span>
  );
}

/** Техническая кнопка-триггер: [ НАЧАТЬ ПОДГОТОВКУ ] */
export function TechButton({
  to,
  children,
  variant = 'primary',
  className = '',
  onClick,
}: {
  to?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
  onClick?: () => void;
}) {
  const base =
    'group inline-flex items-center gap-3 px-7 py-4 font-mono text-[11px] tracking-[0.25em] uppercase transition-all duration-300';
  const styles =
    variant === 'primary'
      ? 'bg-[#d4ff00] text-black shadow-none hover:brightness-110'
      : 'border border-white/15 text-zinc-200 hover:border-[#d4ff00]/60 hover:text-white bg-white/[0.02] backdrop-blur-xl';
  const inner = (
    <>
      <span className="opacity-60">[</span>
      <span>{children}</span>
      <span className="opacity-60">]</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={`${base} ${styles} ${className}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${base} ${styles} ${className}`}>
      {inner}
    </button>
  );
}

/** Заголовок секции: индекс + гигант + описание */
export function SectionHead({
  index,
  label,
  title,
  accent,
  description,
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  accent?: React.ReactNode;
  description?: string;
}) {
  return (
    <div data-reveal className="mb-14 md:mb-20">
      <div className="flex items-center gap-4 mb-6">
        <span className="font-mono text-[10px] tracking-[0.3em] text-[#d4ff00]/80 uppercase">
          INDEX // {index}
        </span>
        <span className="h-px flex-1 bg-white/10" />
        <span className="hud-tag">{label}</span>
      </div>
      <h2 className="display-giant text-5xl md:text-7xl text-zinc-100">
        {title}
        {accent ? <span className="block text-white/[0.10] transition-colors duration-300 hover:text-white/30">{accent}</span> : null}
      </h2>
      {description ? (
        <p className="mt-6 max-w-md text-sm md:text-[15px] font-light leading-relaxed text-zinc-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}
