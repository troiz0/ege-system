const cyrillicToLatinMap: Record<string, string> = {
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H',
  'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X'
};

export function sanitizeMathText(input: string): string {
  if (!input) return '';
  let s = input;

  // 1. Нормализация невидимых спецсимволов и мягких переносов
  s = s.replace(/[\u00AD\u200B]/g, '').replace(/[\u202F\u00A0]/g, ' ');

  // 1.1. Нормализация избыточных долларов ($$$ -> $$)
  s = s.replace(/\${3,}/g, () => '$$');

  // 1.2. Удаление артефактов распознавания речи ("новая строка" внутри формул и систем)
  s = s.replace(/(?:новая\s*строка|новаястрока)\s*/gi, '');

  // 1.3. Исправление опечаток команд с долларом: \$theta_0$ -> \theta_0, \$alpha -> \alpha
  s = s.replace(/\\\$([a-zA-Z]+(?:_\{?[0-9a-zA-Z]+\}?)?)\$/g, '\\$1');
  s = s.replace(/\\\$([a-zA-Z]+)/g, '\\$1');

  // 2. Исправление разорванных подстрочных индексов с $ и _:
  // $ABCDA_$1B_$1C$_1D$_1$ -> $ABCDA_1B_1C_1D_1$
  // $ABCA_$1B_1C$_1$ -> $ABCA_1B_1C_1$
  // $ABCA_1{$B_1C$_1$ -> $ABCA_1B_1C_1$
  // $B_$1C$_1$ -> $B_1C_1$
  let prevS = '';
  while (prevS !== s) {
    prevS = s;
    s = s.replace(/_\$+(\d+)/g, '_$1');
    s = s.replace(/\$_(\d+)/g, '_$1');
    s = s.replace(/(\d+)\{\$([A-ZА-Яa-z])/g, '$1$2');
    s = s.replace(/(\d+)\{\$([0-9])/g, '$1$2');
    s = s.replace(/([A-ZА-Я0-9_]+)\$([0-9]+[A-ZА-Я0-9_]+)\$/g, '$1$2');
    s = s.replace(/([A-ZА-Я])_\$?(\d+)\$?([A-ZА-Я])/g, '$1_$2$3');
    s = s.replace(/([A-ZА-Я])_\$+(\d+)\$+/g, '$1_$2');
    s = s.replace(/\$\$([A-ZА-Яa-z0-9_]+)\$=/g, '$$$1 =');
    // Очистка вложенных долларов внутри фигурных скобок: {$d_1$} -> {d_1}, {f - $f_0$} -> {f - f_0}
    s = s.replace(/\{([^{}]*?)\$([a-zA-Z0-9_+\-^.,\s\\]+)\$([^{}]*?)\}/g, '{$1$2$3}');
  }

  // 2.1. Коррекция кириллических единиц измерения сразу за числом перед закрывающим $ ($f = 20см$ -> $f = 20\text{ см}$)
  s = s.replace(/(\d+)\s*(см|мм|км|кг|г|мин|В|Вт|Дж|Па|Н|Ом|А|Гц|МГц|кГц)(?=\s*\$)/g, '$1\\text{ $2}');

  // 2.2. Исправление пропущенной закрывающей скобки знаменателя \frac:
  // \frac{A}{\sqrt{B} = -> \frac{A}{\sqrt{B}} =
  s = s.replace(/(\\frac\{[^{}]+\}\{\\sqrt(?:\[[^\]]+\])?\{[^{}]+\})(?!\})\s*([=+\-<>]|\\le|\\ge|\\ne|\$)/g, '$1} $2');

  // 2.3. Замена словесных обозначений неравенств внутри математических блоков на знаки:
  // "меньше или равно" -> \le, "больше или равно" -> \ge, "меньше" -> <, "больше" -> >
  s = s.replace(/(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g, (mathBlock) => {
    return mathBlock
      .replace(/\s*(?:меньше\s*или\s*равно|не\s*больше)\s*/gi, ' \\le ')
      .replace(/\s*(?:больше\s*или\s*равно|не\s*меньше)\s*/gi, ' \\ge ')
      .replace(/\s*(?:строго\s*меньше|меньше)\s*/gi, ' < ')
      .replace(/\s*(?:строго\s*больше|больше)\s*/gi, ' > ')
      .replace(/\s*не\s*равно\s*/gi, ' \\ne ')
      .replace(/\s*равно\s*/gi, ' = ');
  });

  // Также для словесных знаков между формулой и числом вне знака доллара ($expr$ меньше 40 -> $expr < 40$)
  s = s.replace(/(\$[^$\n]+?\$)\s*(?:меньше\s*или\s*равно|не\s*больше)\s*(\$?[0-9a-zA-Z\\^_{}]+(?:\s*,\s*[0-9]+)?\$?)/gi, (_m, f1, f2) => {
    const c1 = f1.replace(/\$/g, '').trim();
    const c2 = f2.replace(/\$/g, '').trim();
    return `$${c1} \\le ${c2}$`;
  });
  s = s.replace(/(\$[^$\n]+?\$)\s*(?:больше\s*или\s*равно|не\s*меньше)\s*(\$?[0-9a-zA-Z\\^_{}]+(?:\s*,\s*[0-9]+)?\$?)/gi, (_m, f1, f2) => {
    const c1 = f1.replace(/\$/g, '').trim();
    const c2 = f2.replace(/\$/g, '').trim();
    return `$${c1} \\ge ${c2}$`;
  });
  s = s.replace(/(\$[^$\n]+?\$)\s*(?:строго\s*меньше|меньше)\s*(\$?[0-9a-zA-Z\\^_{}]+(?:\s*,\s*[0-9]+)?\$?)/gi, (_m, f1, f2) => {
    const c1 = f1.replace(/\$/g, '').trim();
    const c2 = f2.replace(/\$/g, '').trim();
    return `$${c1} < ${c2}$`;
  });
  s = s.replace(/(\$[^$\n]+?\$)\s*(?:строго\s*больше|больше)\s*(\$?[0-9a-zA-Z\\^_{}]+(?:\s*,\s*[0-9]+)?\$?)/gi, (_m, f1, f2) => {
    const c1 = f1.replace(/\$/g, '').trim();
    const c2 = f2.replace(/\$/g, '').trim();
    return `$${c1} > ${c2}$`;
  });

  // 3. Векторы:
  // Исправление случайно созданных \overrightarrow{AB_} -> \overrightarrow{AB}
  s = s.replace(/\\overrightarrow\{([A-Za-zА-Яа-я]+)_\}/g, '\\overrightarrow{$1}');
  // Двухиндексные векторы: \overrightarrow{B}_$1C$_1$ -> \overrightarrow{B_1C_1}
  s = s.replace(/\\overrightarrow\{([A-Za-zА-Яа-я]+)\}_?\$*(\d+)([A-Za-zА-Яа-я]+)\$*_?\$*(\d*)\$*/g, (_m, p1, i1, p2, i2) => {
    const idx2 = i2 ? `_${i2}` : '';
    return `\\overrightarrow{${p1}_${i1}${p2}${idx2}}`;
  });
  // Одноиндексные векторы: \overrightarrow{A}_1 -> \overrightarrow{A_1}
  s = s.replace(/\\overrightarrow\{([A-Za-zА-Яа-я]+)\}_?\$*(\d+)\$*/g, '\\overrightarrow{$1_$2}');
  s = s.replace(/\\vec\{n\}\$_(\d+)\$*/g, '\\vec{n}_$1');

  // Закрытие незакрытых формул векторов перед знаком препинания: $\overrightarrow{AB} - \overrightarrow{AC}. -> $\overrightarrow{AB} - \overrightarrow{AC}$.
  s = s.replace(/(\$(?:\\overrightarrow|\vec)[^\$\n]*?)([.,;:!?])(?=\s|$)/g, '$1$$$2');

  // 4. Восстановление непарных / сломанных \left и \right
  // Убираем \left перед \sqrt, \frac или русскими словами (когда нет валидного делимитера)
  s = s.replace(/\\left(?!\s*(?:[()\[\]|/.]|\\\{|\\\}|\\vert|\\Vert|\\lfloor|\\rfloor|\\lceil|\\rceil|\\langle|\\rangle))/g, '');

  // Исправляем \left| ... \right - или \left| ... \right= -> \left| ... \right| - или \left| ... \right|=
  s = s.replace(/(\\left\|(?:[^|]|\\\|)+?)\s*\\right(?![|()\[\]\.])\s*([=+\-])/g, '$1\\right| $2');

  // Исправляем \left| ... | -> \left| ... \right| (любое выражение без внутренних |, где | не идет после \right)
  s = s.replace(/(\\left\|(?:[^|]|\\\|)+?)(?<!\\right)\|(?![a-zA-Z])/g, '$1\\right|');

  // 5. Восстановление экономических таблиц кредитов из слипшегося текста (ФИПИ #525414 и аналоги)
  s = s.replace(
    /Месяц\s*и\s*год\s*([\s\S]*?)\n+\s*Долг\s*(?:\(в\s*млн\s*рублей\))?\s*([\s\S]*?)(?=\n\s*\n|Найдите|$)/gi,
    (_match, monthsStr, debtStr) => {
      const monthMatches = monthsStr.match(
        /(?:Июль|Январь|Февраль|Март|Апрель|Май|Июнь|Август|Сентябрь|Октябрь|Ноябрь|Декабрь)\s*\d{4}/gi
      );
      if (!monthMatches || monthMatches.length === 0) return _match;

      let cleaned = debtStr
        .replace(/\$/g, '')
        .replace(/\{,\}/g, ',')
        .replace(/_0,(\d)/g, ' 0,$1')
        .replace(/_0$/g, ' 0')
        .trim();

      const debtTokens = cleaned
        .split(/\s+/)
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0 && t !== ',');
      if (!debtTokens || debtTokens.length === 0) return _match;

      const colCount = Math.max(monthMatches.length, debtTokens.length);
      const align = '|' + Array(colCount + 1).fill('c').join('|') + '|';

      const headerMonths = monthMatches.map((m: string) => `\\text{${m.trim()}}`).join(' & ');
      const debtCells = debtTokens.map((d: string) => {
        let val = d.trim().replace(',', '{,}');
        return val;
      }).join(' & ');

      return `\n\n$$\\begin{array}{${align}}\n\\hline\n\\text{Месяц и год} & ${headerMonths} \\\\\n\\hline\n\\begin{gathered} \\text{Долг} \\\\ \\text{(в млн рублей)} \\end{gathered} & ${debtCells} \\\\\n\\hline\n\\end{array}$$\n\n`;
    }
  );

  // Коррекция дефектов в ячейках экономических таблиц (0{,} $8S$ -> 0{,}8S, 0{,} \\ -> 0 \\)
  // Безопасное исправление: требовать открывающий $ перед числом (0{,} $8S$), не трогать формулы вида 0{,}5$$ или 0{,}5$
  s = s.replace(/(?<![\$\d])0\{,\}\s*\$([0-9]+S?)\$(?![\$\d])/g, '0{,}$1');
  s = s.replace(/(?<![\$\d])0\{,\}\s+([0-9]+S)\b/g, '0{,}$1');
  s = s.replace(/0\{,\}\s*\\\\/g, '0 \\\\');
  s = s.replace(/\$\$\s*\\begin\{array\}\{c\}([\s\S]*?)\\end\{array\}\s*\$\$\s*&/g, '\\begin{gathered}$1\\end{gathered} &');

  // 6. Восстановление таблиц кредитов с процентами (ФИПИ #513106)
  s = s.replace(
    /Дата\s*([\d\.\s]+)\s*\n+\s*Долг\s*\(в\s*процентах\s*от\s*кредита\)\s*([\d%\s]+)/gi,
    (_m, datesStr, debtsStr) => {
      const dates = datesStr.trim().match(/\d{2}\.\d{2}/g) || [];
      const debts = debtsStr.trim().match(/\d+%/g) || [];
      if (dates.length === 0 && debts.length === 0) return _m;

      const count = Math.max(dates.length, debts.length);
      const align = '|' + Array(count + 1).fill('c').join('|') + '|';
      while (dates.length < count) dates.push('');
      while (debts.length < count) debts.push('');

      const headerDates = dates.map((d: string) => d.trim()).join(' & ');
      const debtCells = debts.map((d: string) => d.trim().replace('%', '\\%')).join(' & ');

      return `\n\n$$\\begin{array}{${align}}\n\\hline\n\\text{Дата} & ${headerDates} \\\\\n\\hline\n\\text{Долг (в процентах от кредита)} & ${debtCells} \\\\\n\\hline\n\\end{array}$$\n\n`;
    }
  );

  // 7. Экранирование % внутри KaTeX \begin{array} ... \end{array}
  s = s.replace(/\\begin\{array\}[\s\S]*?\\end\{array\}/g, (table) => {
    return table.replace(/(?<!\\)%/g, '\\%');
  });

  // Оборачиваем \begin{array} в $$, если не обернуто
  s = s.replace(/(?<!\$)\s*(\\begin\{array\}[\s\S]*?\\end\{array\})\s*(?!\$)/g, (_m, arr) => `\n\n$$\n${arr}\n$$\n\n`);

  // 8. Восстановление таблиц распределения вероятностей (ФИПИ #704660)
  s = s.replace(
    /Значения\s*([XYx-z])\s*([0-9\s]+)\s*\n+\s*Вероятность\s*([0-9,\s]+)/gi,
    (_match, varName, valsStr, probsStr) => {
      const trimmedVals = valsStr.trim();
      let vals: string[] = [];
      if (trimmedVals.includes(' ')) {
        vals = trimmedVals.split(/\s+/);
      } else {
        vals = trimmedVals.split('');
      }

      let probs: string[] = [];
      if (probsStr.includes(' ')) {
        probs = probsStr.trim().split(/\s+/);
      } else {
        probs = probsStr.trim().split(/(?=0,)/);
      }

      const count = Math.max(vals.length, probs.length);
      const align = '|' + Array(count + 1).fill('c').join('|') + '|';
      while (vals.length < count) vals.push('');
      while (probs.length < count) probs.push('');

      const valCells = vals.join(' & ');
      const probCells = probs.map((p) => p.replace(',', '{,}')).join(' & ');

      return `\n\n$$\\begin{array}{${align}}\n\\hline\n\\text{Значения } ${varName} & ${valCells} \\\\\n\\hline\n\\text{Вероятность} & ${probCells} \\\\\n\\hline\n\\end{array}$$\n\n`;
    }
  );

  // 9. Системы выражений / уравнений
  s = s.replace(
    /(?:\$*)\s*(?:система\s*выражений|системавыражений)\s*([\s\S]*?)\s*(?:конец\s*системы|конецсистемы)\s*(?:\$*)/gi,
    (_, body) => {
      const cleanBody = body.replace(/\$/g, '').trim();
      const parts = cleanBody
        .split(/(?<!\d),(?!\d)|,\s+|;|\n/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);
      return `$$\\begin{cases} ${parts.join(' \\\\ ')} \\end{cases}$$`;
    }
  );

  // 10. Дроби и смешанные числа из речевого синтезатора (ФИПИ #500253, #501185)
  // Исправление "д робь" -> "дробь"
  s = s.replace(/д\s*робь\s*:\s*чис\s*ли\s*тель\s*:/gi, 'дробь: числитель:');
  s = s.replace(/д\s*робь\s*:\s*числитель\s*:/gi, 'дробь: числитель:');
  s = s.replace(/зна\s*ме\s*на\s*тель\s*:/gi, 'знаменатель:');
  s = s.replace(/конец\s*д\s*роби/gi, 'конец дроби');

  let prevFrac = '';
  while (prevFrac !== s && /дробь:\s*числитель:/i.test(s)) {
    prevFrac = s;
    s = s.replace(
      /дробь:\s*числитель:\s*((?:(?!дробь:)[^,])*?)\s*,\s*знаменатель:\s*((?:(?!дробь:|конец дроби)[\s\S])*?)\s*конец дроби/gi,
      '\\frac{$1}{$2}'
    );
  }

  s = s.replace(
    /\$?\s*целая\s*часть\s*:\s*([0-9a-zA-Z]+)\s*,\s*дробная\s*часть\s*:\s*числитель\s*:\s*([0-9a-zA-Z]+)\s*,\s*знаменатель\s*:\s*([0-9a-zA-Z]+)\s*\$?(\s*раза)?/gi,
    '$$$1\\frac{$2}{$3}$$ $4'
  );
  s = s.replace(
    /\$?\s*целаячасть\s*:\s*([0-9a-zA-Z]+)\s*,\s*дробнаячасть\s*:\s*числитель\s*:\s*([0-9a-zA-Z]+)\s*,\s*знаменатель\s*:\s*([0-9a-zA-Z]+)\s*\$?(\s*раза)?/gi,
    '$$$1\\frac{$2}{$3}$$ $4'
  );
  s = s.replace(
    /\$?\s*дробная\s*часть\s*:\s*числитель\s*:\s*([0-9a-zA-Z]+)\s*,\s*знаменатель\s*:\s*([0-9a-zA-Z]+)\s*\$?(\s*раза)?/gi,
    '$$\\frac{$1}{$2}$$ $3'
  );
  s = s.replace(
    /\$?\s*дробнаячасть\s*:\s*числитель\s*:\s*([0-9a-zA-Z]+)\s*,\s*знаменатель\s*:\s*([0-9a-zA-Z]+)\s*\$?(\s*раза)?/gi,
    '$$\\frac{$1}{$2}$$ $3'
  );

  // Опечатки в единицах скорости
  s = s.replace(/км\s*;\s*\/\s*ч/gi, 'км/ч');
  s = s.replace(/км\s*\/\s*;\s*ч/gi, 'км/ч');

  // Однобуквенные и слипшиеся дроби: \dfrackx, \dfrac k x, \frackx -> \frac{k}{x} (ФИПИ #509195)
  s = s.replace(/\\d?frac\s*([a-zA-Z0-9])\s*([a-zA-Z0-9])(?![a-zA-Z0-9])/g, '\\frac{$1}{$2}');
  s = s.replace(/\\d?frac\s*\{([^}]+)\}\s*([a-zA-Z0-9])(?![a-zA-Z0-9])/g, '\\frac{$1}{$2}');
  s = s.replace(/\\d?frac\s*([a-zA-Z0-9])\s*\{([^}]+)\}/g, '\\frac{$1}{$2}');
  s = s.replace(/\\dfrac\b/g, '\\frac');

  // 11. Корни произвольной степени: "корень N степени из: начало аргумента: X конец аргумента" (ФИПИ #68039)
  let prevDeg = '';
  while (prevDeg !== s && /корень\s*(?:\d+)?\s*степени\s*из/i.test(s)) {
    prevDeg = s;
    s = s.replace(
      /корень\s*(\d+)\s*степени\s*из\s*:\s*(?:начало\s*аргумента\s*:\s*)?((?:(?!корень|конец\s*аргумента)[\s\S])*?)\s*конец\s*аргумента/gi,
      '\\sqrt[$1]{$2}'
    );
    s = s.replace(
      /корень(\d+)степенииз:\s*(?:началоаргумента:\s*)?((?:(?!корень|конецаргумента)[\s\S])*?)\s*конецаргумента/gi,
      '\\sqrt[$1]{$2}'
    );
  }

  // 12. Вложенные корни из синтезатора (ФИПИ #700451, #501185)
  s = s.replace(
    /\\sqrt\{([^{}]+?)\s*\+\s*(?:\\text\{)?корень\s*из\s*:\s*начало\s*аргумента\s*:\s*([^}]+?)(?:\})?\}\s*(?:\\text\{)?конец\s*аргумента(?:\})?/gi,
    '\\sqrt{$1 + \\sqrt{$2}}'
  );
  let prevRoot = '';
  while (prevRoot !== s && /корень\s*из/i.test(s)) {
    prevRoot = s;
    s = s.replace(
      /(?:\\text\{)?корень\s*из\s*:\s*начало\s*аргумента\s*:\s*((?:(?!корень\s*из\s*:\s*начало\s*аргумента)[\s\S])*?)\s*конец\s*аргумента(?:\})?/gi,
      '\\sqrt{$1}'
    );
    s = s.replace(/корень\s*из\s+(\\frac\{[^{}]+\}\{[^{}]+\})/gi, '\\sqrt{$1}');
    s = s.replace(/корень\s*из\s+([0-9a-zA-Z\\]+)/gi, '\\sqrt{$1}');
  }

  // Убираем оставшиеся "конец аргумента"
  s = s.replace(/\}\s*(?:\\text\{)?конец\s*аргумента(?:\})?/gi, '}');

  // Устраняем сломанные корни вида \sqrt{4 \sqrt[6]{m}} конец аргумента
  s = s.replace(/\\sqrt\{(\d+)\s*(\\sqrt\[\d+\]\{[^}]+\})\}\s*конец\s*аргумента/gi, '\\sqrt{$1 $2}');

  // 13. Логарифмы (ФИПИ #555265)
  s = s.replace(
    /(?:\\text\{)?логарифм\s*(?:по\s*основанию|пооснованию)(?:\})?\s*\(\s*([^()]+(?:\([^()]*\)[^()]*)*)\s*\)\s*(\(\s*.*?\s*\))/gi,
    '\\log_{$1}$2'
  );
  s = s.replace(
    /(?:\\text\{)?логарифм\s*(?:по\s*основанию|пооснованию)(?:\})?\s*\(\s*([^()]+(?:\([^()]*\)[^()]*)*)\s*\)/gi,
    '\\log_{$1}'
  );
  s = s.replace(
    /логарифм\s*по\s*основанию:\s*(.*?)\s*аргумента:\s*(.*?)\s*конец\s*логарифма/gi,
    '\\log_{$1}($2)'
  );
  s = s.replace(
    /(?:\\text\{)?логарифм\s*(?:по\s*основанию|пооснованию)(?:\})?\s*([0-9a-zA-Z]+)\s*(?:выражения|от)?\s*(\(.*?\)|[0-9a-zA-Z]+)/gi,
    '\\log_{$1}$2'
  );
  s = s.replace(
    /(?:\\text\{)?логарифм\s*(?:по\s*основанию|пооснованию)(?:\})?\s*([0-9a-zA-Z]+)/gi,
    '\\log_{$1} '
  );
  s = s.replace(
    /(?:\\text\{)?логарифм\s*(?:по\s*основанию|пооснованию)(?:\})?\s*\{([^}]+)\}/gi,
    '\\log_{$1} '
  );

  // 14. Интегралы и степени
  s = s
    .replace(/интеграл\s*(?:\\limits)?_([0-9a-zA-Z\\]+)\s*(?:в\s*степени|\^)\s*([0-9a-zA-Z\\]+)/gi, '\\int_{$1}^{$2} ')
    .replace(/интеграл\s*(?:\\limits)?_\{([^}]+)\}\s*(?:в\s*степени|\^)\s*\{?([^}\s]+)\}?/gi, '\\int_{$1}^{$2} ')
    .replace(/интеграл\s+от\s+([0-9a-zA-Z\\]+)\s+до\s+([0-9a-zA-Z\\]+)/gi, '\\int_{$1}^{$2} ')
    .replace(/интеграл\s*\\limits/gi, '\\int ')
    .replace(/интеграл\s*_/gi, '\\int_')
    .replace(/в\s*степени\s*\(\s*([^)]+?)\s*\)/gi, '^{$1}')
    .replace(/в\s*степени\s*\{([^}]+?)\}/gi, '^{$1}')
    .replace(/в\s*степени\s+([0-9a-zA-Z]+)/gi, '^{$1}')
    .replace(/больше\s*или\s*равно/gi, ' \\ge ')
    .replace(/меньше\s*или\s*равно/gi, ' \\le ')
    .replace(/не\s*равно/gi, ' \\ne ')
    .replace(/([0-9a-zA-Z]+)\s*меньше\s*([0-9a-zA-Z]+)/gi, '$1 < $2')
    .replace(/([0-9a-zA-Z]+)\s*больше\s*([0-9a-zA-Z]+)/gi, '$1 > $2');

  // Греческие буквы
  s = s
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)альфа(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\alpha ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)бета(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\beta ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)гамма(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\gamma ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)дельта(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\delta ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)лямбда(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\lambda ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)омега(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\omega ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)тета(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\theta ')
    .replace(/(?<=[-+\/*=<(){}\[\],\s0-9\$]|^)фи(?=[-+\/*=<>(){}\[\],\s.,;:\$]|$)/gi, '\\phi ');

  // Русские индексы: S_пр -> S_{\text{пр}}
  s = s.replace(/_([а-яА-ЯёЁ]{1,5})(?![a-zA-Zа-яА-ЯёЁ])/g, '_{\\text{$1}}');

  // 15. Устранение разорванных формул вида: $... $2M$ ...$ -> $... 2M ...$
  // (ФИПИ #28167, где в формулу $I = \frac{(m + $2M$) R^2}{2}...$ попали внутренние доллары, строго внутри одной строки)
  s = s.replace(/(\$[^\$\n\r]*?)\$(\d+[A-ZА-Яa-z])\$([^\$\n\r]*?\$)/g, '$1$2$3');

  // 16. Контекстно-зависимая обработка: разделяем на формулы ($...$) и обычный текст!
  const parts = s.split(/(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('$') && part.endsWith('$')) {
      // Это математическая формула: внутри нее НЕ должно быть знаков доллара $
      const isDouble = part.startsWith('$$') && part.endsWith('$$');
      const delim = isDouble ? '$$' : '$';
      let inner = part.slice(delim.length, -delim.length);
      // Убираем все внутренние доллары
      inner = inner.replace(/\$/g, '');
      // Экранируем unescaped %
      inner = inner.replace(/(?<!\\)%/g, '\\%');
      parts[i] = `${delim}${inner}${delim}`;
    } else {
      // Это ОБЫЧНЫЙ ТЕКСТ: здесь можно оборачивать вершины и многогранники в $...$!
      let textChunk = part;

      // 16a. Геометрические многогранники и вершины (СТРОГО начинающиеся с прописной буквы!):
      // ABCDA1B1C1D1, A1B1C1D1, A1C1, BD1, CC1, ABCDEFA1B1C1D1E1F1, ABCA1B1C1
      // ВАЖНО: никогда не матчить числа в начале (2M, 8S, 2016)!
      textChunk = textChunk.replace(/(?<![\$a-zA-Zа-яА-Я0-9])([A-ZА-Я][A-Za-zА-Яа-я0-9_]*[0-9][A-Za-zА-Яа-я0-9_]*)(?![\$a-zA-Zа-яА-Я0-9])/gu, (match) => {
        // Должно содержать хотя бы одну прописную букву и цифру
        if (!/[A-ZА-Я]/.test(match) || !/[0-9]/.test(match)) return match;
        // Не матчить даты и числа (2016, 15.01)
        if (/^\d/.test(match)) return match;
        // Конвертируем кириллицу в латиницу (А1 -> A_1)
        let converted = match.replace(/[А-Яа-я]/g, (ch) => cyrillicToLatinMap[ch.toUpperCase()] || ch);
        // Добавляем подчеркивание к цифрам без подчеркивания (A1 -> A_1, но не A_1 -> A__1)
        converted = converted.replace(/([A-Za-zА-Яа-я])(?<!_)([0-9]+)/g, '$1_$2');
        return `$${converted}$`;
      });

      // 16b. Отдельные вершины с подчеркиванием вне $...$: A_1, B_1, А_1С, ВС_1, A_1B_1, ABCA_1B_1C_1
      textChunk = textChunk.replace(/(?<![\$a-zA-Zа-яА-Я0-9])([A-Za-zА-Яа-я]+(?:_[0-9]+)[A-Za-zА-Яа-я0-9_]*)(?![\$a-zA-Zа-яА-Я0-9])/gu, (match) => {
        let converted = match.replace(/[А-Яа-я]/g, (ch) => cyrillicToLatinMap[ch.toUpperCase()] || ch);
        return `$${converted}$`;
      });

      parts[i] = textChunk;
    }
  }

  s = parts.join('');

  // 17. Очистка дублирующихся знаков доллара
  s = s.replace(/(?<!\$)\$\$([A-Za-z0-9_{}]+)\$\$(?!\$)/g, '$$$1$$');

  // 18. Очистка пробелов
  s = s.replace(/[ \t]+/g, ' ');

  return s;
}
