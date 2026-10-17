import type { ExamVariant } from './types';

export interface OfflineExamSession {
  id: string; // 'active_exam'
  variant: ExamVariant;
  part1Answers: Record<string, string>;
  part2Solutions: Record<string, { text: string; scanUrls: Array<{ name: string; url: string; size: number }> }>;
  secondsLeft: number;
  timestamp: number;
  selectedSubjectKey: string;
  examMode: 'full' | 'mini' | 'diagnostic';
  phase: 'EXAM';
  taskTimes?: Record<number, number>;
  activePart2Tab?: number;
}

const DB_NAME = 'ege_system_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'exam_state';
const ACTIVE_KEY = 'active_exam';

let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Сохраняет активное состояние экзамена в IndexedDB.
 * Вызывается при каждом изменении ответов, сканов и регулярно по тику таймера.
 */
export async function saveOfflineExamState(
  session: Omit<OfflineExamSession, 'id'>
): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const data: OfflineExamSession = {
        ...session,
        id: ACTIVE_KEY,
        timestamp: Date.now(),
      };
      const req = store.put(data);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineStorage] Error saving state to IndexedDB:', err);
    // Fallback в localStorage на случай сбоя квот IndexedDB
    try {
      localStorage.setItem(`ege_offline_${ACTIVE_KEY}`, JSON.stringify({
        ...session,
        timestamp: Date.now(),
      }));
    } catch {
      // Quota exceeded or private browsing
    }
  }
}

/**
 * Загружает сохраненное состояние экзамена из IndexedDB.
 * Возвращает null, если активная сессия отсутствует.
 */
export async function loadOfflineExamState(): Promise<OfflineExamSession | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_KEY);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result as OfflineExamSession);
        } else {
          // Проверяем fallback в localStorage
          try {
            const raw = localStorage.getItem(`ege_offline_${ACTIVE_KEY}`);
            if (raw) {
              resolve(JSON.parse(raw) as OfflineExamSession);
              return;
            }
          } catch {
            /* noop */
          }
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineStorage] Error loading state from IndexedDB:', err);
    try {
      const raw = localStorage.getItem(`ege_offline_${ACTIVE_KEY}`);
      if (raw) return JSON.parse(raw) as OfflineExamSession;
    } catch {
      /* noop */
    }
    return null;
  }
}

/**
 * Очищает состояние активного экзамена после успешной сдачи или подтвержденного прерывания.
 */
export async function clearOfflineExamState(): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(ACTIVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineStorage] Error clearing IndexedDB:', err);
  }

  try {
    localStorage.removeItem(`ege_offline_${ACTIVE_KEY}`);
  } catch {
    /* noop */
  }
}
