/**
 * Предустановленные тактические HUD-аватары платформы EGE.SYSTEM.
 * Все аватары закодированы в виде самодостаточных SVG Data URI.
 */

export interface PresetAvatar {
  id: string;
  name: string;
  badge: string;
  description: string;
  dataUrl: string;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'cyber-sentinel',
    name: 'КИБЕР-ДОЗОРНЫЙ',
    badge: 'TACTICAL_HUD',
    description: 'Боевой тактический визор с системой наведения и сканирования КИМ',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Background Grid -->
        <path d="M0 32h128M0 64h128M0 96h128M32 0v128M64 0v128M96 0v128" stroke="#1f1f23" stroke-width="1"/>
        <!-- Helmet Base -->
        <polygon points="64,16 98,34 104,74 64,112 24,74 30,34" fill="#121217" stroke="#27272a" stroke-width="2"/>
        <!-- Visor Faceplate -->
        <polygon points="64,38 92,50 86,76 64,88 42,76 36,50" fill="#000" stroke="#d4ff00" stroke-width="2.5"/>
        <line x1="40" y1="62" x2="88" y2="62" stroke="#d4ff00" stroke-width="3" stroke-linecap="round"/>
        <!-- Targeting Reticle -->
        <circle cx="64" cy="62" r="8" fill="none" stroke="#d4ff00" stroke-width="1.5" stroke-dasharray="3 3"/>
        <line x1="64" y1="48" x2="64" y2="76" stroke="#d4ff00" stroke-width="1"/>
        <!-- Corner Accents -->
        <path d="M12 20h8M12 20v8M116 20h-8M116 20v8M12 108h8M12 108v-8M116 108h-8M116 108v-8" stroke="#d4ff00" stroke-width="2"/>
      </svg>
    `),
  },
  {
    id: 'neural-operator',
    name: 'НЕЙРО-ОПЕРАТОР',
    badge: 'AI_LINKED',
    description: 'Нейроинтерфейс прямой синхронизации с базой знаний ФИПИ',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Hexagon Core -->
        <polygon points="64,18 102,40 102,88 64,110 26,88 26,40" fill="#18181b" stroke="#3f3f46" stroke-width="2"/>
        <!-- Brain Circuits -->
        <circle cx="64" cy="64" r="22" fill="#000" stroke="#06b6d4" stroke-width="2"/>
        <circle cx="64" cy="64" r="8" fill="#d4ff00"/>
        <path d="M64 42v-16M64 86v16M42 64H26M86 64h16M48 48L34 34M80 48l14-14M48 80l-14 14M80 80l14 14" stroke="#06b6d4" stroke-width="2"/>
        <!-- Circuit nodes -->
        <circle cx="34" cy="34" r="3" fill="#d4ff00"/>
        <circle cx="94" cy="34" r="3" fill="#d4ff00"/>
        <circle cx="34" cy="94" r="3" fill="#d4ff00"/>
        <circle cx="94" cy="94" r="3" fill="#d4ff00"/>
      </svg>
    `),
  },
  {
    id: 'quantum-core',
    name: 'КВАНТОВОЕ ЯДРО',
    badge: 'CORE_99',
    description: 'Реактор вычислительной мощности для задач олимпиадной математики',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Diamond Rings -->
        <rect x="34" y="34" width="60" height="60" fill="none" stroke="#d4ff00" stroke-width="2" transform="rotate(45 64 64)"/>
        <rect x="42" y="42" width="44" height="44" fill="#18181b" stroke="#e4e4e7" stroke-width="1.5" transform="rotate(45 64 64)"/>
        <!-- Glowing Center Core -->
        <circle cx="64" cy="64" r="14" fill="#d4ff00"/>
        <circle cx="64" cy="64" r="6" fill="#000"/>
        <!-- Pulse lines -->
        <line x1="64" y1="10" x2="64" y2="28" stroke="#d4ff00" stroke-width="2.5"/>
        <line x1="64" y1="100" x2="64" y2="118" stroke="#d4ff00" stroke-width="2.5"/>
        <line x1="10" y1="64" x2="28" y2="64" stroke="#d4ff00" stroke-width="2.5"/>
        <line x1="100" y1="64" x2="118" y2="64" stroke="#d4ff00" stroke-width="2.5"/>
      </svg>
    `),
  },
  {
    id: 'sigma-hacker',
    name: 'СИГМА-ХАКЕР',
    badge: 'CIPHER_BOT',
    description: 'Взлом критериев развернутой части №13–19 на максимальный балл',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Terminal Mask -->
        <polygon points="32,24 96,24 104,78 64,108 24,78" fill="#111116" stroke="#d4ff00" stroke-width="2"/>
        <!-- Glasses / Matrix display -->
        <rect x="36" y="44" width="24" height="16" fill="#000" stroke="#d4ff00" stroke-width="2"/>
        <rect x="68" y="44" width="24" height="16" fill="#000" stroke="#d4ff00" stroke-width="2"/>
        <line x1="60" y1="52" x2="68" y2="52" stroke="#d4ff00" stroke-width="2"/>
        <!-- Binary eye pupils -->
        <text x="42" y="56" fill="#d4ff00" font-family="monospace" font-size="10" font-weight="bold">01</text>
        <text x="74" y="56" fill="#d4ff00" font-family="monospace" font-size="10" font-weight="bold">10</text>
        <!-- Grille / Teeth -->
        <line x1="48" y1="84" x2="80" y2="84" stroke="#3f3f46" stroke-width="3"/>
        <line x1="56" y1="80" x2="56" y2="88" stroke="#3f3f46" stroke-width="2"/>
        <line x1="64" y1="80" x2="64" y2="88" stroke="#3f3f46" stroke-width="2"/>
        <line x1="72" y1="80" x2="72" y2="88" stroke="#3f3f46" stroke-width="2"/>
      </svg>
    `),
  },
  {
    id: 'sto-ballnik',
    name: 'СТОБАЛЛЬНИК',
    badge: 'MAX_100',
    description: 'Элитный тактический ранг абсолютного результата ЕГЭ',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Shield Silhouette -->
        <polygon points="64,14 106,32 106,76 64,116 22,76 22,32" fill="#18181b" stroke="#eab308" stroke-width="2.5"/>
        <polygon points="64,24 96,38 96,72 64,104 32,72 32,38" fill="#000" stroke="#d4ff00" stroke-width="1.5"/>
        <!-- "100" Text Inscription -->
        <text x="64" y="70" fill="#d4ff00" font-family="system-ui, sans-serif" font-weight="900" font-size="28" text-anchor="middle" letter-spacing="-1">100</text>
        <!-- Star Above -->
        <polygon points="64,30 67,36 73,37 68,41 70,47 64,44 58,47 60,41 55,37 61,36" fill="#eab308"/>
        <!-- Banner subtitle -->
        <text x="64" y="86" fill="#a1a1aa" font-family="monospace" font-size="8" text-anchor="middle" font-weight="bold" letter-spacing="2">EGE.SYSTEM</text>
      </svg>
    `),
  },
  {
    id: 'vector-striker',
    name: 'ВЕКТОРНЫЙ ШЕВРОН',
    badge: 'SPEED_PVP',
    description: 'Молниеносное решение задач первой части без ошибок вычислений',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Background Chevron -->
        <polygon points="64,16 112,48 112,74 64,42 16,74 16,48" fill="#27272a"/>
        <!-- Main Lightning Strike -->
        <polygon points="72,20 34,70 60,70 48,110 94,56 68,56" fill="#d4ff00" stroke="#000" stroke-width="2"/>
        <!-- Tech Wings -->
        <line x1="20" y1="88" x2="48" y2="106" stroke="#d4ff00" stroke-width="2"/>
        <line x1="108" y1="88" x2="80" y2="106" stroke="#d4ff00" stroke-width="2"/>
        <circle cx="64" cy="116" r="3" fill="#d4ff00"/>
      </svg>
    `),
  },
  {
    id: 'titan-scholar',
    name: 'КИБЕР-СОВА',
    badge: 'WISDOM_X',
    description: 'Символ академической мудрости, концентрации и спокойствия на экзамене',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Owl Head Outline -->
        <polygon points="30,22 48,42 80,42 98,22 104,74 64,112 24,74" fill="#141418" stroke="#3f3f46" stroke-width="2"/>
        <!-- Giant Optical Eyes -->
        <circle cx="48" cy="62" r="16" fill="#000" stroke="#d4ff00" stroke-width="2.5"/>
        <circle cx="80" cy="62" r="16" fill="#000" stroke="#d4ff00" stroke-width="2.5"/>
        <circle cx="48" cy="62" r="6" fill="#d4ff00"/>
        <circle cx="80" cy="62" r="6" fill="#d4ff00"/>
        <!-- Sharp Beak -->
        <polygon points="64,68 70,82 64,90 58,82" fill="#d4ff00"/>
        <!-- Brow Plates -->
        <line x1="32" y1="46" x2="60" y2="52" stroke="#d4ff00" stroke-width="3"/>
        <line x1="96" y1="46" x2="68" y2="52" stroke="#d4ff00" stroke-width="3"/>
      </svg>
    `),
  },
  {
    id: 'matrix-phantom',
    name: 'МАТРИЧНЫЙ РОНИН',
    badge: 'STEALTH_AI',
    description: 'Хладнокровная безупречность и тотальный контроль над КИМ',
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <rect width="128" height="128" fill="#09090b"/>
        <!-- Ronin Kasasa Hat -->
        <polygon points="64,18 116,48 64,56 12,48" fill="#1f1f23" stroke="#d4ff00" stroke-width="2"/>
        <!-- Glowing Mask Face -->
        <polygon points="40,54 88,54 82,92 64,108 46,92" fill="#000" stroke="#27272a" stroke-width="2"/>
        <!-- Cyber Katana Glare -->
        <line x1="46" y1="68" x2="82" y2="68" stroke="#d4ff00" stroke-width="3"/>
        <line x1="44" y1="78" x2="84" y2="78" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="4 2"/>
        <!-- Neon knot -->
        <circle cx="64" cy="98" r="4" fill="#d4ff00"/>
        <line x1="64" y1="102" x2="64" y2="118" stroke="#d4ff00" stroke-width="2"/>
      </svg>
    `),
  },
];
