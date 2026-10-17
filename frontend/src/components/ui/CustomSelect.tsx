import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
}

/**
 * Кастомный dropdown в HUD-стилистике. Нативный <select> запрещён —
 * системный список Windows/Android ломает дизайн.
 *
 * Меню рендерится порталом в document.body: карточки с backdrop-blur
 * создают собственные stacking-контексты, поэтому меню внутри карточки
 * перекрывалось бы следующим блоком. Портал выводит меню поверх всего.
 */
export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Пересчёт позиции при скролле/ресайзе — меню следует за полем
    const onScrollReposition = () => updatePos();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollReposition, true);
    window.addEventListener('resize', onScrollReposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollReposition, true);
      window.removeEventListener('resize', onScrollReposition);
    };
  }, [open, updatePos]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-50' : 'z-10'} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between rounded-none border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-zinc-600'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && pos && !disabled &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed left-0 right-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto rounded-none border border-zinc-800 bg-[#0d0d12] shadow-none"
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex cursor-pointer items-center justify-between px-4 py-2 font-sans text-sm transition-colors ${
                    active
                      ? 'bg-[#d4ff00]/10 text-[#d4ff00] font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
