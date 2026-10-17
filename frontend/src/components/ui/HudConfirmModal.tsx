import { useEffect, useRef } from 'react';
import { useConfirmStore } from '../../store/confirmStore';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export function HudConfirmModal() {
  const { isOpen, options, close } = useConfirmStore();
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  // Блокировка скролла и обработка клавиатуры (Escape / Enter)
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Фокус на кнопку действия по умолчанию
    const timer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Если фокус на элементе модалки, Enter подтверждает
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'textarea') {
          e.preventDefault();
          close(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const {
    title,
    message,
    description,
    confirmText = '[ ПОДТВЕРДИТЬ ]',
    cancelText = '[ ОТМЕНА ]',
    variant = 'danger',
    isAlert = false,
  } = options;

  const variantStyles = {
    danger: {
      tagColor: 'text-red-400',
      icon: <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />,
      cornerBorder: 'border-red-500',
      confirmButton:
        'border border-red-500 bg-red-600 hover:bg-red-500 text-white shadow-none',
      defaultTitle: 'ТРЕБУЕТСЯ ПОДТВЕРЖДЕНИЕ',
    },
    warning: {
      tagColor: 'text-yellow-400',
      icon: <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />,
      cornerBorder: 'border-yellow-400',
      confirmButton:
        'border border-yellow-500 bg-yellow-500 hover:bg-yellow-400 text-black shadow-none',
      defaultTitle: 'ВНИМАНИЕ // ПОДТВЕРЖДЕНИЕ',
    },
    lime: {
      tagColor: 'text-[#d4ff00]',
      icon: <CheckCircle2 className="h-5 w-5 text-[#d4ff00] shrink-0" />,
      cornerBorder: 'border-[#d4ff00]',
      confirmButton:
        'border border-[#d4ff00] bg-[#d4ff00] hover:bg-white text-black shadow-none',
      defaultTitle: 'ПОДТВЕРЖДЕНИЕ ОПЕРАЦИИ',
    },
    info: {
      tagColor: 'text-cyan-400',
      icon: <Info className="h-5 w-5 text-cyan-400 shrink-0" />,
      cornerBorder: 'border-cyan-400',
      confirmButton:
        'border border-[#d4ff00] bg-[#d4ff00] hover:bg-white text-black shadow-none',
      defaultTitle: 'СИСТЕМНОЕ СООБЩЕНИЕ',
    },
  }[variant];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => close(false)}
    >
      <div
        className="relative w-full max-w-md border border-white/15 bg-[#09090b] p-6 text-zinc-100 shadow-2xl rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Фирменные угловые метки HUD */}
        <div className={`pointer-events-none absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 ${variantStyles.cornerBorder}`} />
        <div className={`pointer-events-none absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 ${variantStyles.cornerBorder}`} />
        <div className={`pointer-events-none absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 ${variantStyles.cornerBorder}`} />
        <div className={`pointer-events-none absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 ${variantStyles.cornerBorder}`} />

        {/* Кнопка закрытия */}
        <button
          onClick={() => close(false)}
          className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>

        {/* HUD протокол тег */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`hud-tag ${variantStyles.tagColor}`}>
            [ EGE.SYSTEM // {isAlert ? 'SYSTEM ALERT' : 'CONFIRMATION PROTOCOL'} ]
          </span>
        </div>

        {/* Заголовок с иконкой */}
        <div className="flex items-start gap-3 mb-3">
          {variantStyles.icon}
          <h2 className="font-display text-lg font-bold uppercase tracking-tight text-white leading-snug">
            {title || variantStyles.defaultTitle}
          </h2>
        </div>

        {/* Текст сообщения */}
        <div className="space-y-2 mb-6">
          <p className="text-zinc-200 text-sm font-sans leading-relaxed">
            {message}
          </p>
          {description && (
            <p className="text-zinc-400 text-xs font-mono leading-relaxed bg-zinc-950/60 border border-white/5 p-2.5">
              {description}
            </p>
          )}
        </div>

        {/* Кнопки действий */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          {!isAlert && (
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-none border border-white/20 bg-zinc-900 px-4 py-2 font-mono text-xs uppercase text-zinc-300 hover:text-white hover:border-white/40 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => close(true)}
            className={`rounded-none px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${variantStyles.confirmButton}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
