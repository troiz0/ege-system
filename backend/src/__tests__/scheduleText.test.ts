import { describe, it, expect } from 'vitest';
import { parseScheduleText } from '../services/ai/meshScheduleParser';

const SAMPLE = [
  'Сохранено 30.09.2026 в 23:42',
  'Турдубаев Тимур Тыныбекович',
  'Расписание на 28 сентября — 3 октября',
  'Понедельник, 28 сентября',
  '08:30-09:10 26/27_11_РОВ 10у',
  '09:30-10:10 Физика',
  '12:20-13:00 Алгебра и начала',
  'математического анализа',
  '13:20-14:00 Иностранный (английский)',
  'язык',
  'Вторник, 29 сентября',
  '08:30-09:10 Обществознание',
  '15:10-15:50 26/27_Информационные',
  'технологии_10у',
  'Суббота, 3 октября',
  'Расписание Турдубаев Тимур Тыныбекович стр. 1 из 1',
  '',
  '-- 1 of 1 --',
].join('\n');

describe('parseScheduleText (детерминированный парсер PDF-расписания МЭШ)', () => {
  it('разбирает дни недели, уроки и переносы строк', () => {
    const items = parseScheduleText(SAMPLE);
    expect(items).not.toBeNull();
    expect(items!).toHaveLength(6);
  });

  it('назначает дни недели (Пн=1, Вт=2)', () => {
    const items = parseScheduleText(SAMPLE)!;
    expect(items.map((i) => i.dayOfWeek)).toEqual([1, 1, 1, 1, 2, 2]);
  });

  it('склеивает перенесённые названия предметов', () => {
    const items = parseScheduleText(SAMPLE)!;
    expect(items[2].originalMeshName).toBe('Алгебра и начала математического анализа');
    expect(items[3].originalMeshName).toBe('Иностранный (английский) язык');
    expect(items[5].originalMeshName).toBe('26/27_Информационные технологии_10у');
  });

  it('не тянет служебные строки (колонтитулы, ноль уроков в субботу)', () => {
    const items = parseScheduleText(SAMPLE)!;
    for (const item of items) {
      expect(item.originalMeshName).not.toMatch(/стр\.|Сохранено|of 1/i);
    }
  });

  it('нормализует предметы и сложность', () => {
    const items = parseScheduleText(SAMPLE)!;
    expect(items[0].subject).toBe('Разговоры о важном');
    expect(items[0].difficulty).toBe('low');
    expect(items[1].subject).toBe('Физика');
    expect(items[1].difficulty).toBe('high');
    expect(items[2].subject).toBe('Математика');
    expect(items[3].subject).toBe('Английский язык');
    expect(items[4].subject).toBe('Обществознание');
    expect(items[5].subject).toBe('Информационные технологии');
  });

  it('формат HH:MM всегда с ведущим нулём', () => {
    const text = 'Понедельник, 1 сентября\n8:05-9:05 Физика';
    const items = parseScheduleText(text)!;
    expect(items[0].startTime).toBe('08:05');
    expect(items[0].endTime).toBe('09:05');
  });

  it('возвращает null для нераспознанного формата (AI-фолбэк)', () => {
    expect(parseScheduleText('Просто произвольный текст без расписания')).toBeNull();
    expect(parseScheduleText('')).toBeNull();
    expect(parseScheduleText('Понедельник, 28 сентября\nкакой-то мусор')).toBeNull();
  });
});
