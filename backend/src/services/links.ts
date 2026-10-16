const HOSTS: Record<string, string> = {
  'информатика': 'inf-ege', 'профильная математика': 'math-ege', 'математика': 'math-ege', 'русский язык': 'rus-ege',
  'физика': 'phys-ege', 'химия': 'chem-ege', 'биология': 'bio-ege', 'обществознание': 'soc-ege', 'история': 'hist-ege',
  'английский язык': 'en-ege',
};
export const FIPI_URL = 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege';
export const reshuUrl = (subject: string, topic: string): string =>
  `https://${HOSTS[subject.trim().toLowerCase()] ?? 'ege'}.sdamgia.ru/search?search=${encodeURIComponent(topic)}`;
export const videoQuery = (subject: string, topic: string): string => `${subject} ЕГЭ ${topic} разбор`;
