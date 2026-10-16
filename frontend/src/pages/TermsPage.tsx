import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Scale, Zap } from 'lucide-react';
import { PlatformFooter } from '../components/PlatformFooter';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans selection:bg-[#d4ff00] selection:text-black">
      {/* Верхний тактический бар */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090b]/90 backdrop-blur-md px-4 py-3.5 md:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-400 hover:text-[#d4ff00] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            [ НА ГЛАВНУЮ ]
          </Link>
          <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 uppercase tracking-widest">
            <span className="h-1.5 w-1.5 bg-[#d4ff00] animate-pulse-dot" />
            TERMS OF SERVICE // PUBLIC OFFER
          </div>
        </div>
      </header>

      {/* Основной контент документа */}
      <main className="flex-1 py-10 px-4 md:px-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Шапка документа */}
          <div className="border border-white/10 bg-white/[0.02] p-6 md:p-8 backdrop-blur-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4ff00]">
                [ ЮРИДИЧЕСКИЙ КОНТУР // ПУБЛИЧНАЯ ОФЕРТА ]
              </span>
              <span className="font-mono text-xs text-zinc-500">
                РЕДАКЦИЯ: 15.10.2026
              </span>
            </div>

            <h1 className="font-display text-2xl md:text-4xl font-extrabold uppercase tracking-tight text-white">
              Пользовательское соглашение платформы EGE.SYSTEM
            </h1>

            <p className="font-sans text-xs md:text-sm text-zinc-400 leading-relaxed font-light">
              Настоящее Соглашение определяет правила и порядок использования программного комплекса,
              образовательных тренажеров КИМ, аналитических инструментов и базы знаний <strong className="text-zinc-200 font-normal">EGE.SYSTEM</strong>.
            </p>
          </div>

          {/* Быстрые акценты */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <Scale className="h-4 w-4" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider">Независимый сервис</span>
              </div>
              <p className="font-sans text-xs text-zinc-400 font-light">
                Платформа не является органом ФИПИ или Рособрнадзора. Материалы базируются на открытых демоверсиях.
              </p>
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider">Отказ от гарантий</span>
              </div>
              <p className="font-sans text-xs text-zinc-400 font-light">
                Предиктор и ИИ-анализ носят ориентировочный характер. Итоговый балл ЕГЭ зависит от личных усилий.
              </p>
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <Zap className="h-4 w-4" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider">Квоты и AI-лимиты</span>
              </div>
              <p className="font-sans text-xs text-zinc-400 font-light">
                Техническое ограничение 30 req/min на AI-проверку для гарантии стабильности серверного кластера.
              </p>
            </div>
          </div>

          {/* Разделы соглашения */}
          <div className="space-y-6 text-xs md:text-sm text-zinc-300 leading-relaxed">
            {/* 1. Предмет соглашения */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">1.</span> Предмет соглашения
              </h2>
              <p>
                1.1. Администрация сервиса EGE.SYSTEM предоставляет Пользователю право использования веб-платформы,
                интерактивных тренажеров КИМ, базы знаний по кодификаторам ФИПИ и аналитических инструментов на условиях
                простой (неисключительной) лицензии.
              </p>
              <p>
                1.2. Регистрация учетной записи, авторизация через единую учетную запись Google или использование
                демонстрационного доступа означает полное, безоговорочное и безусловное согласие Пользователя с условиями
                настоящего Соглашения в соответствии со статьей 438 Гражданского кодекса РФ.
              </p>
              <p>
                1.3. Если Пользователь не согласен с какими-либо положениями настоящего Соглашения, он обязан прекратить
                использование сервиса.
              </p>
            </section>

            {/* 2. Статус материалов */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">2.</span> Статус материалов и независимый характер сервиса
              </h2>
              <p>
                2.1. Банк заданий, спецификации контрольных измерительных материалов, кодификаторы проверяемых требований
                и критерии оценивания части 2 составлены на основе открытых демонстрационных версий, публикуемых
                ФГБНУ «Федеральный институт педагогических измерений» (ФГБНУ «ФИПИ», сайт fipi.ru).
              </p>
              <div className="border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1 text-amber-200">
                <div className="font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Официальный правовой дисклеймер:
                </div>
                <p className="text-xs leading-relaxed">
                  Сервис EGE.SYSTEM является полностью независимой частной EdTech-платформой. Сервис не является структурным
                  подразделением, подведомственным учреждением, официальным представителем или аффилированным лицом
                  ФГБНУ «ФИПИ», Федеральной службы по надзору в сфере образования и науки (Рособрнадзор) либо Департамента
                  образования и науки города Москвы (МЭШ). Товарные знаки и наименования «ЕГЭ», «ОГЭ», «ФИПИ», «МЭШ»
                  используются исключительно в описательно-информационных целях.
                </p>
              </div>
            </section>

            {/* 3. Ограничение ответственности */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">3.</span> Ограничение ответственности и отказ от образовательных гарантий
              </h2>
              <p>
                3.1. Платформа, алгоритмы машинного обучения, предикторы баллов и автоматизированные проверки развернутых
                решений предоставляются по общепринятому принципу <strong className="text-white">«КАК ЕСТЬ» («AS IS»)</strong>.
              </p>
              <p>
                3.2. Администрация сервиса не гарантирует получение Пользователем определенного количества первичных или
                тестовых баллов на реальном Едином государственном экзамене, а также не несет ответственности за поступление
                или непоступление Пользователя на бюджетные или платные места в высшие учебные заведения.
              </p>
              <p>
                3.3. Результаты симуляции экзамена под давлением (`/exam-pressure`), прогноз вероятности поступления
                в родительской панели (`PARENT DESK`) и рекомендации нейросетевого наставника носят справочно-тренировочный
                характер и призваны содействовать самостоятельной подготовке.
              </p>
            </section>

            {/* 4. Условия тарифов */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">4.</span> Условия тарифов (FREE и PRO) и квоты вычислений
              </h2>
              <p>
                4.1. <strong className="text-white">Тариф FREE (Базовый):</strong> включает свободный доступ к банку заданий КИМ,
                симулятору экзамена с таймером 235 минут, генерации бланков ФИПИ №1 и №2, Дейли-спринту и карте навыков.
              </p>
              <p>
                4.2. <strong className="text-white">Тариф PRO (Расширенный) и AI-квоты:</strong> регулирует использование
                вычислительных мощностей больших языковых моделей (LLM) для экспертной проверки развернутых решений части 2.
                В целях защиты от злоупотреблений и DoS-атак действует ограничение частоты запросов:
                не более <span className="font-mono text-[#d4ff00]">30 запросов в минуту</span> на аккаунт.
              </p>
              <p>
                4.3. Пользователю строго запрещается использовать автоматизированные парсеры, боты или скрипты для массового
                сбора контента платформы или перегрузки серверных узлов. Нарушение данного пункта влечет немедленную
                блокировку учетной записи.
              </p>
            </section>

            {/* 5. Заключительные положения */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">5.</span> Заключительные положения
              </h2>
              <p>
                5.1. Администрация оставляет за собой право в одностороннем порядке изменять условия настоящего Соглашения.
                Актуальная версия документа всегда доступна по постоянному адресу: <code className="font-mono text-[#d4ff00]">/terms</code>.
              </p>
              <p>
                5.2. По всем правовым вопросам и предложениям: <a href="mailto:legal@ege.system" className="text-[#d4ff00] underline">legal@ege.system</a>.
              </p>
            </section>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  );
}
