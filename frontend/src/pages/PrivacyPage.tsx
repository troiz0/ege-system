import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Lock, EyeOff } from 'lucide-react';
import { PlatformFooter } from '../components/PlatformFooter';

export function PrivacyPage() {
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
            152-ФЗ COMPLIANCE // PROTOCOL
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
                [ ЮРИДИЧЕСКИЙ КОНТУР // 152-ФЗ «О ПЕРСОНАЛЬНЫХ ДАННЫХ» ]
              </span>
              <span className="font-mono text-xs text-zinc-500">
                РЕДАКЦИЯ: 15.10.2026
              </span>
            </div>

            <h1 className="font-display text-2xl md:text-4xl font-extrabold uppercase tracking-tight text-white">
              Политика конфиденциальности и обработки персональных данных
            </h1>

            <p className="font-sans text-xs md:text-sm text-zinc-400 leading-relaxed font-light">
              Настоящий документ регламентирует порядок обработки, хранения и защиты персональных данных пользователей
              образовательной платформы <strong className="text-zinc-200 font-normal">EGE.SYSTEM</strong> в строгом соответствии с
              требованиями Федерального закона Российской Федерации от 27 июля 2006 г. № 152-ФЗ «О персональных данных».
            </p>
          </div>

          {/* Быстрые акценты безопасности */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <Lock className="h-4 w-4" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider">Шифрование AES-256</span>
              </div>
              <p className="font-sans text-xs text-zinc-400 font-light">
                Токены МЭШ защищены аппаратным шифрованием AES-256-GCM. Хранение в localStorage исключено.
              </p>
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <EyeOff className="h-4 w-4" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider">Обезличивание ИИ</span>
              </div>
              <p className="font-sans text-xs text-zinc-400 font-light">
                В нейросетевые модели направляются исключительно формулы и решения без ФИО и контактов.
              </p>
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[#d4ff00]">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider">Право на забвение</span>
              </div>
              <p className="font-sans text-xs text-zinc-400 font-light">
                Мгновенное и безвозвратное удаление профиля, статистики попыток и ключей по запросу.
              </p>
            </div>
          </div>

          {/* Разделы политики */}
          <div className="space-y-6 text-xs md:text-sm text-zinc-300 leading-relaxed">
            {/* 1. Общие положения */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">1.</span> Общие положения
              </h2>
              <p>
                1.1. Настоящая Политика определяет порядок обработки и защиты персональных данных, собираемых администрацией
                образовательного веб-сервиса EGE.SYSTEM (далее — «Оператор») у физических лиц (далее — «Пользователи»),
                использующих сайт и программные модули подготовки к государственной итоговой аттестации.
              </p>
              <p>
                1.2. Целью обработки персональных данных является предоставление доступа к интерактивным тренажерам КИМ,
                персонализированной образовательной аналитике, предиктивному расчету баллов и формированию адаптивной
                траектории повторения материала.
              </p>
              <p>
                1.3. Оператор осуществляет обработку персональных данных на законной и справедливой основе, руководствуясь
                принципом минимизации собираемых сведений: запрашиваются только те данные, которые объективно необходимы
                для функционирования образовательных сервисов.
              </p>
            </section>

            {/* 2. Состав обрабатываемых данных */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">2.</span> Состав и категории обрабатываемых данных
              </h2>
              <p>В рамках использования платформы Оператором могут обрабатываться следующие категории данных:</p>
              <ul className="list-disc pl-5 space-y-2 text-zinc-400">
                <li>
                  <strong className="text-zinc-200">Данные учетной записи:</strong> адрес электронной почты (email),
                  пользовательское имя (callsign), криптографический хэш пароля (сформированный с использованием bcrypt с солью,
                  исходный пароль в базе данных не хранится).
                </li>
                <li>
                  <strong className="text-zinc-200">Образовательный профиль:</strong> класс обучения (10–11 классы),
                  выбранные предметы сдачи ЕГЭ (профильная математика, русский язык, физика, информатика, обществознание),
                  желаемый целевой балл и целевой профиль подготовки.
                </li>
                <li>
                  <strong className="text-zinc-200">Учебная телеметрия:</strong> протоколы решений тренировочных вариантов,
                  время решения заданий КИМ, введенные краткие ответы, загруженные чистовики и черновики развернутой части,
                  тепловая карта выявленных пробелов по кодификатору ФИПИ.
                </li>
                <li>
                  <strong className="text-zinc-200">Технические метрики:</strong> обезличенные сессионные маркеры (JWT в защищенных
                  httpOnly cookies), IP-адрес для целей защиты от перегрузок и DoS-атак через rate-limiting.
                </li>
              </ul>
            </section>

            {/* 3. Интеграция с МЭШ */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">3.</span> Особенности интеграции с электронным дневником МЭШ
              </h2>
              <p>
                3.1. Подключение профиля Московской электронной школы (МЭШ) является строго добровольным действием Пользователя
                и служит исключительно для автоматического учета школьного расписания уроков и отметок в целях гармонизации
                подготовки к экзаменам.
              </p>
              <p>
                3.2. <strong className="text-[#d4ff00]">Защита токенов по 152-ФЗ:</strong> пользовательский токен авторизации
                МЭШ никогда не сохраняется в незашифрованном виде на клиентском устройстве (в локальном хранилище браузера
                localStorage или sessionStorage). Токен немедленно передается по защищенному протоколу HTTPS/TLS на сервер.
              </p>
              <p>
                3.3. На стороне сервера токен шифруется с использованием промышленного алгоритма симметричного блочного
                шифрования <strong className="text-white">AES-256-GCM</strong> с генерацией уникального вектора инициализации
                (IV) для каждой записи и контролем аутентичности шифротекста (Auth Tag).
              </p>
              <p>
                3.4. Зашифрованный токен не передается третьим лицам и используется строго для взаимодействия с официальным
                API дневника (school.mos.ru). Пользователь вправе в любой момент удалить токен в панели настроек, что инициирует
                его физическое удаление из базы данных.
              </p>
            </section>

            {/* 4. Взаимодействие с ИИ */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">4.</span> Взаимодействие с нейросетевыми моделями (ИИ / LLM)
              </h2>
              <p>
                4.1. Для экспертной проверки развернутых решений части 2 КИМ и ведения сократического диалога наставника
                платформа привлекает большие языковые модели через защищенный API-шлюз.
              </p>
              <p>
                4.2. <strong className="text-white">Полное обезличивание данных:</strong> в контекст нейросетевой модели
                передаются исключительно математические и текстовые формулировки задач, предоставленные решения и критерии
                оценивания ФИПИ. Никакие персональные идентификаторы (ФИО, email, город, номер школы) в промпты не включаются.
              </p>
              <p>
                4.3. <strong className="text-white">Защита от внедрения инструкций (Indirect Prompt Injection):</strong> текст
                загружаемых пользовательских файлов и сканов чистовиков предварительно валидируется и экранируется
                в тегах <code className="font-mono text-[#d4ff00]">&lt;untrusted_attachment&gt;</code> с директивой запрета
                модели на исполнение посторонних управляющих инструкций.
              </p>
            </section>

            {/* 5. Права пользователя */}
            <section className="border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-3 backdrop-blur-xl">
              <h2 className="font-display text-lg font-bold uppercase text-white flex items-center gap-2">
                <span className="font-mono text-[#d4ff00]">5.</span> Права пользователя и порядок отзыва согласия
              </h2>
              <p>
                5.1. Пользователь имеет право на получение полной информации, касающейся обработки его персональных данных,
                а также право требовать исправления неточных сведений или блокирования данных.
              </p>
              <p>
                5.2. <strong className="text-white">Право на удаление («Право на забвение»):</strong> пользователь может
                в любой момент инициировать полное удаление учетной записи. При удалении аккаунта все персональные данные,
                журналы попыток, загруженные решения и ключи доступа безвозвратно удаляются из активных баз данных.
              </p>
              <p>
                5.3. Запрос на реализацию прав или отзыв согласия на обработку персональных данных направляется по адресу
                электронной почты: <a href="mailto:privacy@ege.system" className="text-[#d4ff00] underline">privacy@ege.system</a>.
              </p>
              <p className="font-mono text-xs text-zinc-500 pt-2">
                Ответственное лицо по защите персональных данных (DPO): dpo@ege.system
              </p>
            </section>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  );
}
