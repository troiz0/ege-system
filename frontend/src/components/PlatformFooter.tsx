import { Link } from 'react-router-dom';

export function PlatformFooter() {
  return (
    <footer className="w-full border-t border-white/10 bg-[#09090b] py-8 px-4 md:px-8 mt-auto font-sans text-xs text-zinc-500">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <span className="flex h-6 w-6 items-center justify-center bg-[#d4ff00] font-display text-xs font-extrabold text-black transition-transform group-hover:scale-105">
                E
              </span>
              <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-zinc-100 group-hover:text-white transition-colors">
                EGE.SYSTEM
              </span>
            </Link>
            <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-500 uppercase">
              // 2027
            </span>
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
              [ 152-ФЗ COMPLIANT // SECURE EDTECH ]
            </span>
            <span className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-wider border border-[#d4ff00]/30 bg-[#d4ff00]/[0.06] px-2 py-0.5">
              [ MIT LICENSE // OPEN SOURCE ]
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-4 md:gap-6 font-mono text-[11px] uppercase tracking-wider">
            <Link
              to="/privacy"
              className="text-zinc-400 hover:text-[#d4ff00] transition-colors"
            >
              [ ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ ]
            </Link>
            <Link
              to="/terms"
              className="text-zinc-400 hover:text-[#d4ff00] transition-colors"
            >
              [ ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ ]
            </Link>
            <a
              href="https://github.com/troiz0/ege-system/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-[#d4ff00] transition-colors"
            >
              [ ЛИЦЕНЗИЯ MIT ]
            </a>
            <Link
              to="/"
              className="text-zinc-400 hover:text-[#d4ff00] transition-colors"
            >
              [ О ПЛАТФОРМЕ ]
            </Link>
          </nav>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-zinc-500 text-[11px] leading-relaxed">
          <p className="max-w-3xl">
            <strong className="text-zinc-400">Дисклеймер:</strong> EGE.SYSTEM — независимая EdTech-платформа с открытым исходным кодом под лицензией MIT. 
            Наименования ЕГЭ, ОГЭ, МЭШ и ФИПИ используются исключительно в информационных целях для описания 
            структуры образовательных программ и спецификаций открытого банка заданий. Платформа не является 
            подразделением ФГБНУ «ФИПИ» или Рособрнадзора.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">
            © 2026 EGE.SYSTEM. Лицензия MIT.
          </p>
        </div>
      </div>
    </footer>
  );
}
