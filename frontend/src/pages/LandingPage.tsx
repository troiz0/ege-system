import { Suspense, lazy, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowDown,
  ArrowUpRight,
  Brain,
  CalendarRange,
  Crosshair,
  Fingerprint,
  Radar,
  School,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useLenis } from '../hooks/useLenis';
import { HudTag, SectionHead, TechButton } from '../components/hud/Hud';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { api } from '../lib/api';
import { errText } from '../lib/errors';
import { PlatformFooter } from '../components/PlatformFooter';

// Процедурное ядро hero — чистый Three.js, отдельный чанк, dispose при уходе
// (единственная 3D-сцена на лендинге)
const CyberCoreHero3D = lazy(() => import('../components/CyberCoreHero3D'));

gsap.registerPlugin(ScrollTrigger);

const MODULES = [
  {
    index: '001',
    code: 'SCHEDULE',
    title: 'Уроки и нагрузка по дням',
    body: 'Недельное расписание с нагрузкой. Импорт из PDF МЭШ и синхронизация дневника — уроки и оценки подтягиваются сами.',
    icon: CalendarRange,
    meta: 'PDF IMPORT // MESH SYNC',
  },
  {
    index: '002',
    code: 'WEAK TOPICS',
    title: 'Ошибки превращаются в план',
    body: 'Пробелы собираются из твоих ошибок. Конспекты по темам: теория, ловушки, алгоритм решения. План раскладывает их по дням до экзамена.',
    icon: Crosshair,
    meta: 'TOPICS // MATERIALS // DAY PLAN',
  },
  {
    index: '003',
    code: 'MOCK EXAMS',
    title: 'Каждый пробник — с разбором',
    body: 'Внёс результат — получил разбор: сильные стороны, что повторить, разница с прошлым разом. Видно, как растёт балл.',
    icon: Radar,
    meta: 'SCORE DYNAMICS // MISTAKE REVIEW',
  },
  {
    index: '004',
    code: 'AI ANALYSIS',
    title: 'Подсказки вместо нотаций',
    body: 'Усталость. Темп. Готовность по предметам. Конкретные рекомендации с привязкой к дням недели — что делать прямо сейчас.',
    icon: Brain,
    meta: 'READINESS // DAY RECOMMENDATIONS',
  },
];

const TELEMETRY = [
  { value: '80+', unit: 'ЦЕЛЬ', label: 'Стратегия подготовки под твой целевой вуз.' },
  { value: 'МЭШ', unit: 'АВТО', label: 'Автоматический импорт уроков и оценок.' },
  { value: 'AI', unit: 'РАЗБОР', label: 'Анализ слабых тем и генерация конспектов.' },
  { value: '0%', unit: 'ВОДЫ', label: 'Четкие шаги на каждый день без хаоса и стресса.' },
];

export function LandingPage() {
  useLenis(true);
  const { isAuthenticated } = useAuthStore();
  const { setUser } = useAuthStore();
  const { addToast } = useToastStore();
  const navigate = useNavigate();

  const handleDemoLogin = async () => {
    try {
      const result = await api.loginDemo();
      setUser(result.user);
      navigate('/dashboard');
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось войти в демо-режим');
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      // HERO: кинетический reveal по маске
      gsap
        .timeline({ defaults: { ease: 'power4.out' } })
        .to('.reveal-line', { y: 0, duration: 1.2, stagger: 0.12, delay: 0.15 })
        .fromTo(
          '[data-hero-fade]',
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.9, stagger: 0.1 },
          '-=0.7'
        );

      // Секции: проявление при скролле
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 36 },
          {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%' },
          }
        );
      });

      // Параллакс крупных заголовков
      gsap.utils.toArray<HTMLElement>('[data-drift]').forEach((el) => {
        gsap.to(el, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1.2 },
        });
      });
    });
    return () => ctx.revert();
  }, []);

  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen bg-[#09090b] text-zinc-100 overflow-x-clip">
      {/* ═══ HUD: NAVBAR ═══ */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-white/10 bg-[#09090b]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 md:px-10 h-16">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center bg-[#d4ff00] font-display text-sm font-extrabold text-black">
              E
            </span>
            <span className="font-mono text-[11px] tracking-[0.3em] uppercase text-zinc-200">
              EGE.SYSTEM
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 font-mono text-[10px] tracking-[0.25em] uppercase text-zinc-500">
            <button onClick={() => scrollTo('#modules')} className="hover:text-[#d4ff00] transition-colors">
              Возможности
            </button>
            <button onClick={() => scrollTo('#telemetry')} className="hover:text-[#d4ff00] transition-colors">
              Как это работает
            </button>
            <button onClick={() => scrollTo('#access')} className="hover:text-[#d4ff00] transition-colors">
              Начать
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hud-tag hidden lg:inline-flex">СЕЗОН 2027</span>
            <Link
              to={isAuthenticated ? '/dashboard' : '/auth'}
              className="group inline-flex items-center gap-2 rounded-none border border-white/15 bg-white/[0.03] px-5 py-2 font-mono text-[10px] tracking-[0.25em] uppercase text-zinc-100 backdrop-blur-xl transition-all hover:border-[#d4ff00]/70 hover:text-white"
            >
              <span className="h-1.5 w-1.5 rounded-none bg-[#d4ff00] animate-pulse-dot" />
              {isAuthenticated ? 'Кабинет' : 'Войти'}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ═══ HUD: боковые рейлы ═══ */}
      <div className="pointer-events-none fixed left-5 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <span className="hud-tag" style={{ writingMode: 'vertical-rl' }}>
          ПОДГОТОВКА К ЕГЭ // 2027
        </span>
      </div>
      <div className="pointer-events-none fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <span className="hud-tag" style={{ writingMode: 'vertical-rl' }}>
          РАСПИСАНИЕ • ПРОБНИКИ • AI-АНАЛИЗ
        </span>
      </div>

      <main className="relative z-10">
        {/* ═══ HERO (многослойный: 3D-фон + текст + метрики) ═══ */}
        <section className="relative overflow-hidden min-h-[85vh] flex flex-col justify-center items-center pt-24 sm:pt-28 md:pt-36 pb-12">
          {/* Фоновый слой с 3D (Z-0) */}
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-85">
            <Suspense fallback={null}>
              <CyberCoreHero3D />
            </Suspense>
            {/* Радиальный мягкий градиент снизу, чтобы модель бесшовно уходила в черный цвет страницы */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,black_95%)] pointer-events-none" />
          </div>

          {/* Передний текстовый слой (Z-10) */}
          <div className="relative z-10 text-center flex flex-col items-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 drop-">
            <div data-hero-fade className="mb-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] sm:text-xs text-zinc-500 font-mono tracking-widest uppercase">
              <HudTag>[ ПОДГОТОВКА К ЕГЭ // СЕЗОН 2027 ]</HudTag>
              <span className="hud-tag hidden sm:inline">РАСПИСАНИЕ • ПРОБНИКИ • AI-АНАЛИЗ</span>
            </div>

            <h1 className="w-full max-w-full overflow-hidden font-display text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tight text-white mb-4">
              <span className="reveal-mask pr-[0.08em]">
                <span className="reveal-line">ENGINEERED</span>
              </span>
              <span className="reveal-mask pr-[0.08em]">
                <span className="reveal-line text-white/20">FOR SUPREMACY</span>
              </span>
            </h1>

            <p data-hero-fade className="text-xs sm:text-sm md:text-base text-zinc-400 font-normal leading-relaxed max-w-xs sm:max-w-xl mx-auto mb-8">
              Умная платформа подготовки к экзаменам. Расписание из МЭШ, домашние
              задания, разбор ошибок в пробниках и персональный план до дня сдачи.
            </p>
            <div data-hero-fade className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
              <TechButton to={isAuthenticated ? '/dashboard' : '/auth'} variant="primary">
                Начать подготовку
              </TechButton>
              <TechButton variant="ghost" onClick={() => void handleDemoLogin()}>
                Демо-вход
              </TechButton>
            </div>
          </div>

          {/* Блок с метриками снизу (Z-10) */}
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div data-hero-fade className="mt-12 grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10 backdrop-blur-xl md:grid-cols-4">
              {TELEMETRY.map((t) => (
                <div key={t.unit} className="bg-[#09090b]/85 p-5">
                  <div className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-100">
                    {t.value}
                    <span className="ml-2 font-mono text-[10px] tracking-[0.3em] text-[#d4ff00]">
                      {t.unit}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[220px] text-xs font-light leading-relaxed text-zinc-500">
                    {t.label}
                  </p>
                </div>
              ))}
            </div>

            <div data-hero-fade className="mt-8 flex items-center justify-between">
              <span className="hud-tag">[ ЛИСТАЙ ВНИЗ ]</span>
              <ArrowDown className="h-4 w-4 animate-bounce text-[#d4ff00]" />
              <span className="hud-tag hidden sm:inline">ЧТО УМЕЕТ ПЛАТФОРМА</span>
            </div>
          </div>
        </section>

        {/* ═══ MARQUEE ═══ */}
        <div className="relative overflow-hidden border-y border-white/10 bg-[#09090b]/80 py-4 backdrop-blur-xl">
          <div className="flex w-max animate-marquee gap-0 whitespace-nowrap">
            {[0, 1].map((n) => (
              <span key={n} className="font-display text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">
                {Array(6)
                  .fill('ПОДГОТОВКА БЕЗ СТРЕССА ✦ РАСПИСАНИЕ ИЗ МЭШ ✦ РАЗБОР ОШИБОК ✦ ПЛАН ДО ДНЯ СДАЧИ ✦ ')
                  .join('')}
              </span>
            ))}
          </div>
        </div>

        {/* ═══ MODULES / ОПИСАНИЕ ПРОДУКТА ═══ */}
        <section id="modules" className="mx-auto max-w-[1400px] px-5 py-28 md:px-10 md:py-40">
          <SectionHead
            index="001—004"
            label="CORE MODULES"
            title="FOUR CORES."
            accent="ZERO NOISE."
            description="Четыре раздела вместо десяти разрозненных вкладок: расписание, слабые темы, пробники и разбор ошибок. Всегда понятно, что сделать сегодня, чтобы вырасти к экзамену."
          />
          <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2">
            {MODULES.map((m) => (
              <article
                key={m.index}
                data-reveal
                className="group relative bg-[#08080a]/95 p-8 transition-colors duration-300 hover:bg-[#0c0c10] md:p-12"
              >
                <div className="mb-10 flex items-start justify-between">
                  <m.icon className="h-7 w-7 text-zinc-500 transition-colors duration-300 group-hover:text-[#d4ff00]" strokeWidth={1.25} />
                  <span className="font-mono text-[10px] tracking-[0.3em] text-zinc-600">
                    // {m.index}
                  </span>
                </div>
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#d4ff00]/80">
                  {m.code}
                </p>
                <h3 className="mt-3 font-display text-2xl md:text-4xl font-bold uppercase tracking-tight text-zinc-100">
                  {m.title}
                </h3>
                <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-zinc-400">
                  {m.body}
                </p>
                <p className="mt-8 hud-tag">{m.meta}</p>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-[#d4ff00] transition-transform duration-500 group-hover:scale-x-100" />
              </article>
            ))}
          </div>

          {/* MESH STRIP */}
          <div data-reveal className="mt-px flex flex-col gap-6 border border-white/10 border-t-0 bg-white/[0.02] p-8 backdrop-blur-xl md:flex-row md:items-center md:justify-between md:p-10">
            <div className="flex items-start gap-4">
              <School className="mt-1 h-6 w-6 shrink-0 text-[#d4ff00]" strokeWidth={1.5} />
              <div>
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-zinc-500">
                  ДНЕВНИК МЭШ // СИНХРОНИЗАЦИЯ
                </p>
                <p className="mt-2 max-w-md text-sm font-light leading-relaxed text-zinc-300">
                  Дневник МЭШ подключается за минуту. Расписание и оценки подтягиваются
                  сами. Токен шифруется и хранится только в твоём профиле.
                </p>
              </div>
            </div>
            <TechButton to="/profile" variant="ghost" className="shrink-0">
              Подключить
            </TechButton>
          </div>
        </section>

        {/* ═══ TELEMETRY MANIFESTO ═══ */}
        <section id="telemetry" className="border-y border-white/10 bg-[#08080a]/60 backdrop-blur-xl">
          <div className="mx-auto max-w-[1400px] px-5 py-28 md:px-10 md:py-40">
            <div data-drift>
              <p className="hud-tag mb-6">[ КАК ЭТО РАБОТАЕТ ]</p>
              <p className="display-giant text-4xl sm:text-5xl md:text-7xl text-zinc-100">
                MEASURE. VERDICT.
                <span className="block text-white/20">NEXT STEP.</span>
              </p>
              <p className="mt-8 max-w-md text-sm md:text-[15px] font-light leading-relaxed text-zinc-400">
                Пишешь пробник. Получаешь разбор: сильные стороны и темы, которые
                стоит повторить. Видишь разницу с прошлым результатом. План сам
                подстраивается — балл растёт.
              </p>
            </div>
            <div className="mt-14 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
              {[
                { icon: Zap, h: 'Дедлайны без паники', p: 'Важные сдачи подсвечены заранее. Нагрузка дня — в часах и уроках.' },
                { icon: ShieldCheck, h: 'Данные под защитой', p: 'Пароли хранятся в виде хеша, токены — в шифрованном виде. Твои данные видны только тебе.' },
                { icon: Fingerprint, h: 'Всё под тебя', p: 'Класс, профиль, дата экзамена и целевые баллы. План строится под твою цель.' },
              ].map((c) => (
                <div key={c.h} data-reveal className="bg-[#09090b]/90 p-8">
                  <c.icon className="h-6 w-6 text-[#d4ff00]" strokeWidth={1.5} />
                  <h3 className="mt-5 font-display text-lg font-bold uppercase tracking-tight">{c.h}</h3>
                  <p className="mt-2 max-w-[280px] text-sm font-light leading-relaxed text-zinc-500">{c.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ БЕТА-ДОСТУП ═══ */}
        <section className="mx-auto max-w-[1400px] px-5 py-28 md:px-10 md:py-40">
          <SectionHead
            index="005"
            label="ACCESS"
            title="OPEN BETA."
            accent="FREE FOR ALL."
            description="Приложение в открытом бета-тесте: все разделы, разборы, синхронизация с МЭШ и персональный план — бесплатно для всех."
          />
          <div data-reveal className="relative overflow-hidden border border-[#d4ff00]/30 bg-[#d4ff00]/[0.05] p-8 backdrop-blur-xl md:p-12">
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="hud-tag mb-4">[ БЕТА // 0 ₽ НАВСЕГДА ДЛЯ ТЕСТЕРОВ ]</p>
                <p className="max-w-xl font-display text-2xl font-bold uppercase tracking-tight text-zinc-100 md:text-4xl">
                  Регистрируйся — все функции уже включены
                </p>
                <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-zinc-400">
                  Расписание, задания, пробники с разбором, материалы и план подготовки.
                  Никаких тарифов и ограничений на время бета-теста.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-3">
                <TechButton to="/auth" variant="primary">Начать бесплатно</TechButton>
                <TechButton variant="ghost" onClick={() => void handleDemoLogin()}>
                  Демо-вход
                </TechButton>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ ACCESS / CTA ═══ */}
        <section id="access" className="relative overflow-hidden border-t border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(212,255,0,0.08),transparent_70%)]" />
          <div className="relative mx-auto max-w-[1400px] px-5 py-28 text-center md:px-10 md:py-44">
            <p data-reveal className="hud-tag">[ БЫСТРЫЙ СТАРТ ]</p>
            <h2 data-reveal className="display-giant mx-auto mt-6 max-w-5xl text-5xl sm:text-6xl md:text-8xl">
              LIQUID<br />REALITY
            </h2>
            <p data-reveal className="mx-auto mt-6 max-w-md text-sm md:text-[15px] font-light leading-relaxed text-zinc-400">
              Попробуй платформу прямо сейчас в демо-режиме: готовый профиль
              с расписанием, пробниками и аналитикой без регистрации и ввода ключей.
            </p>
            <div data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <TechButton variant="primary" onClick={() => void handleDemoLogin()}>
                Открыть демо
              </TechButton>
              <TechButton to="/auth" variant="ghost">Зарегистрироваться</TechButton>
            </div>
            <p data-reveal className="mt-10 hud-tag">EGE.SYSTEM © 2027</p>
          </div>
        </section>
      </main>

      {/* ═══ FOOTER ═══ */}
      <PlatformFooter />
    </div>
  );
}
