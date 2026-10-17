import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { errText } from '../lib/errors';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { hudConfirm } from '../store/confirmStore';
import { LatexText } from '../components/LatexText';
import { InteractivePlotter } from '../components/InteractivePlotter';
import { FileText, MessagesSquare, Paperclip, Pencil, Send, Sparkles, Trash2, X, Mic, MicOff, Volume2, VolumeX, Check, Copy } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface ChatAttachment {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  /** Локальное превью до отправки (object URL), не из БД. */
  local?: boolean;
}

interface ChatMsg {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

const MAX_FILES = 10;

interface ParsedBlock {
  type: 'plotter' | 'ascii' | 'code' | 'h1' | 'h2' | 'h3' | 'h4' | 'hr' | 'table' | 'text';
  content?: string;
  lang?: string;
  headers?: string[];
  rows?: string[][];
}

/** Авто-определение ASCII-чертежей и координатных схем */
function isAsciiDiagramText(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 3) return false;

  let diagramScore = 0;
  for (const line of lines) {
    const hasAxis = /[\^|•]/.test(line);
    const hasPlotChars = /[-+|=><\/\\~.]{2,}/.test(line) || /^\s*[0-9.\-+]+\s*[+|]/.test(line);
    const hasDiag = /[/\\]\s*[/\\]|[/\\]\s*[|•]|[|•]\s*[/\\]/.test(line);
    if ((hasAxis && hasPlotChars) || hasDiag || /[-—─]{3,}>|\^/.test(line)) {
      diagramScore++;
    }
  }
  return diagramScore >= 2 && diagramScore / lines.length >= 0.35;
}

/** Специализированный компонент отображения ASCII-схем и чертежей в стиле кибер-HUD */
function AsciiDiagramView({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(content).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 overflow-hidden rounded border border-[#d4ff00]/30 bg-[#07080a] shadow-lg shadow-black/40">
      {/* HUD-шапка схемы */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#d4ff00] animate-pulse" />
          <span className="font-bold tracking-wider text-zinc-200">
            [ ASCII_SCHEMATIC // ЧЕРТЕЖ_ГРАФИКА ]
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-zinc-400 hover:text-[#d4ff00] transition-colors"
          title="Скопировать чертеж"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-[#d4ff00]" />
              <span className="text-[#d4ff00]">СКОПИРОВАНО</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>КОПИРОВАТЬ</span>
            </>
          )}
        </button>
      </div>

      {/* Моноширинный чертеж с фиксированным шагом символов */}
      <pre
        className="overflow-x-auto p-3.5 font-mono text-xs leading-[1.18] text-[#d4ff00] select-all whitespace-pre"
        style={{
          fontFamily: "ui-monospace, 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Courier New', monospace",
          letterSpacing: '0px',
        }}
      >
        <code>{content}</code>
      </pre>
    </div>
  );
}

function parseMarkdownBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  // 1. Отделяем блоки кода ``` ... ```
  const codeRegex = /```(plotter|[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = text.slice(lastIndex, match.index);
      blocks.push(...parseTextChunks(textChunk));
    }
    const tag = (match[1] || '').trim().toLowerCase();
    const body = match[2].trim();
    if (tag === 'plotter') {
      blocks.push({ type: 'plotter', content: body });
    } else if (
      tag === 'ascii' ||
      tag === 'art' ||
      tag === 'diagram' ||
      tag === 'scheme' ||
      isAsciiDiagramText(body)
    ) {
      blocks.push({ type: 'ascii', content: body });
    } else {
      blocks.push({ type: 'code', lang: tag, content: body });
    }
    lastIndex = codeRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    blocks.push(...parseTextChunks(text.slice(lastIndex)));
  }
  return blocks;
}

function parseTextChunks(chunk: string): ParsedBlock[] {
  const lines = chunk.split('\n');
  const result: ParsedBlock[] = [];
  let tableBuffer: string[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      const text = textBuffer.join('\n').trim();
      if (text) {
        if (isAsciiDiagramText(text)) {
          result.push({ type: 'ascii', content: text });
        } else {
          result.push({ type: 'text', content: text });
        }
      }
      textBuffer = [];
    }
  };

  const flushTable = () => {
    if (tableBuffer.length >= 2) {
      const parseRow = (line: string) =>
        line
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(tableBuffer[0]);
      const rows: string[][] = [];
      for (let i = 2; i < tableBuffer.length; i++) {
        if (tableBuffer[i].includes('|')) {
          rows.push(parseRow(tableBuffer[i]));
        }
      }
      result.push({ type: 'table', headers, rows });
    } else if (tableBuffer.length > 0) {
      textBuffer.push(...tableBuffer);
    }
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Таблицы Markdown (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushText();
      tableBuffer.push(trimmed);
      continue;
    } else if (tableBuffer.length > 0) {
      flushTable();
    }

    // Горизонтальный разделитель (--- или ***)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushText();
      result.push({ type: 'hr' });
      continue;
    }

    // Заголовки Markdown (# , ## , ### , #### )
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushText();
      const level = hMatch[1].length;
      const title = hMatch[2].trim();
      result.push({ type: `h${level}` as 'h1' | 'h2' | 'h3' | 'h4', content: title });
      continue;
    }

    textBuffer.push(line);
  }

  flushTable();
  flushText();
  return result;
}

/** Парсит сообщение и рендерит интерактивные графики, ASCII-схемы, блоки кода, таблицы и заголовки Markdown */
function ChatMessageContent({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <div className="space-y-2.5">
      {blocks.map((b, idx) => {
        if (b.type === 'plotter') {
          return <InteractivePlotter key={idx} config={b.content || ''} />;
        }
        if (b.type === 'ascii') {
          return <AsciiDiagramView key={idx} content={b.content || ''} />;
        }
        if (b.type === 'code') {
          return (
            <pre
              key={idx}
              className="my-2.5 overflow-x-auto rounded border border-white/10 bg-black/60 p-3 font-mono text-xs leading-relaxed text-zinc-300"
            >
              <code>{b.content}</code>
            </pre>
          );
        }
        if (b.type === 'h1') {
          return (
            <h1 key={idx} className="mt-4 mb-2 border-b border-white/10 pb-1 text-base font-bold text-zinc-100">
              <LatexText content={b.content} />
            </h1>
          );
        }
        if (b.type === 'h2') {
          return (
            <h2 key={idx} className="mt-3.5 mb-1.5 text-sm font-bold text-zinc-100">
              <LatexText content={b.content} />
            </h2>
          );
        }
        if (b.type === 'h3') {
          return (
            <h3 key={idx} className="mt-3 mb-1 text-xs font-bold text-[#d4ff00]">
              <LatexText content={b.content} />
            </h3>
          );
        }
        if (b.type === 'h4') {
          return (
            <h4 key={idx} className="mt-2.5 mb-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              <LatexText content={b.content} />
            </h4>
          );
        }
        if (b.type === 'hr') {
          return <hr key={idx} className="my-2.5 border-white/10" />;
        }
        if (b.type === 'table' && b.headers) {
          return (
            <div key={idx} className="my-3 overflow-x-auto">
              <table className="w-full border-collapse border border-white/15 text-xs text-zinc-300">
                <thead>
                  <tr className="bg-white/[0.06]">
                    {b.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="border border-white/15 px-3 py-1.5 text-left font-mono font-medium text-zinc-100"
                      >
                        <LatexText content={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows?.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-white/[0.02]">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="border border-white/10 px-3 py-1.5">
                          <LatexText content={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <div key={idx} className="whitespace-pre-wrap leading-relaxed">
            <LatexText content={b.content} />
          </div>
        );
      })}
    </div>
  );
}

function parseAttachments(raw?: string | null): ChatAttachment[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is ChatAttachment =>
        !!a && typeof a === 'object' && typeof (a as { url?: unknown }).url === 'string'
    );
  } catch {
    return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Миниатюры/файлы внутри пузыря сообщения пользователя (клик — полный размер). */
function MessageAttachments({ items }: { items: ChatAttachment[] }) {
  if (items.length === 0) return null;
  const images = items.filter((a) => a.mimeType.startsWith('image/'));
  const files = items.filter((a) => !a.mimeType.startsWith('image/'));
  const srcOf = (a: ChatAttachment) => (a.local ? a.url : api.fileUrl(a.url));
  return (
    <div className="mb-2 space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((a, i) => (
            <button
              key={i}
              type="button"
              title={`${a.name} — открыть в полном размере`}
              onClick={() => window.open(srcOf(a), '_blank', 'noopener')}
              className="overflow-hidden border border-white/10 transition-colors hover:border-[#d4ff00]/50"
            >
              <img src={srcOf(a)} alt={a.name} loading="lazy" className="h-20 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {files.map((f, i) => (
        <a
          key={i}
          href={srcOf(f)}
          target="_blank"
          rel="noreferrer"
          title={f.name}
          className="flex items-center gap-2 border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-300 transition-colors hover:border-[#d4ff00]/50"
        >
          <FileText className="h-4 w-4 shrink-0 text-[#d4ff00]" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-zinc-500">{formatSize(f.size)}</span>
        </a>
      ))}
    </div>
  );
}

const getDaysToExam = (): number => {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  const examDate = new Date(year, 4, 25);
  const diff = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
};

const QUICK_PROMPTS = [
  'Что мне сегодня учить по КИМ?',
  'В каких номерах КИМ у меня пробелы?',
  'Как решить задание №14 (уравнения)?',
  'Покажи параметрический график (№18): f(x) = x^2 - 4*x + a и прямая x - 2',
];

const GREETING: ChatMsg = {
  role: 'assistant',
  content: `Привет! До экзамена ${getDaysToExam()} дн. Над какими номерами КИМ или сложными темами работаем сегодня?`,
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function AIChat() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const processedKeyRef = useRef<string | null>(null);

  const { addToast } = useToastStore();
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isMobileListOpen, setIsMobileListOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Файлы к следующему сообщению (макс. 10): превью с object URL
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; preview: string | null }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  }, [input]);

  useEffect(() => {
    const locState = (location.state || {}) as {
      topic?: string;
      topicName?: string;
      subject?: string;
      prompt?: string;
      autoPrompt?: string;
      autoSend?: boolean;
    };
    const rawTopic =
      searchParams.get('topic') ||
      locState.topic ||
      locState.topicName ||
      (locState.autoPrompt ? 'Разбор темы' : null);

    const incomingTopic = rawTopic
      ? (rawTopic.startsWith('Разбор:') ? rawTopic : `Разбор: ${rawTopic}`)
      : null;

    const incomingPrompt =
      searchParams.get('prompt') ||
      locState.autoPrompt ||
      locState.prompt ||
      (incomingTopic ? `Объясни тему ${incomingTopic}` : null);

    const shouldAutoSend = locState.autoSend ?? !!incomingPrompt;

    if (incomingTopic && processedKeyRef.current !== location.key) {
      processedKeyRef.current = location.key;
      void handleIncomingTopic(incomingTopic, incomingPrompt, shouldAutoSend);
    } else if (!processedKeyRef.current) {
      processedKeyRef.current = location.key;
      void loadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any)?.stop();
    };
  }, []);

  const handleIncomingTopic = async (topic: string, promptText: string | null, autoSendPrompt: boolean) => {
    setLoadingSessions(true);
    try {
      const listRes = await api.getChatSessions().catch(() => ({ sessions: [] }));
      const res = await api.createChatSession(topic);
      const newSession = res.session;

      setSessions([newSession, ...listRes.sessions.filter((s) => s.id !== newSession.id)]);
      setActiveId(newSession.id);
      setMessages([GREETING]);
      setLoadingSessions(false);

      if (searchParams.has('topic') || searchParams.has('prompt')) {
        setSearchParams({}, { replace: true });
      }
      window.history.replaceState({}, document.title);

      if (autoSendPrompt && promptText) {
        await send(promptText, newSession.id);
      }
    } catch (error) {
      console.error('Failed to init topic session:', error);
      addToast('error', errText(error) || 'Не удалось открыть диалог по теме');
      setLoadingSessions(false);
      await loadSessions();
    }
  };

  // Web Speech API: Голосовой ввод
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const toggleListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      addToast('error', 'Голосовой ввод не поддерживается браузером (рекомендуется Chrome / Edge / Safari)');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ru-RU';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        addToast('info', 'Микрофон включен. Произнесите ваш вопрос...');
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
        setIsListening(false);
        if (e.error !== 'no-speech') {
          addToast('error', `Ошибка микрофона: ${e.error || 'недоступен'}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
      addToast('error', 'Не удалось активировать микрофон');
    }
  };

  // Web Speech API: Озвучка ответа AI
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);

  const toggleSpeak = (index: number, text: string) => {
    if (!('speechSynthesis' in window)) {
      addToast('error', 'Озвучивание текста не поддерживается браузером');
      return;
    }

    if (speakingMsgIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingMsgIndex(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Очищаем математические формулы KaTeX и спецсимволы разметки для естественной русской речи
    const cleanText = text
      .replace(/\$\$[\s\S]*?\$\$/g, ' математическая формула ')
      .replace(/\$[^$]+?\$/g, ' формула ')
      .replace(/[#*`_~[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find((v) => v.lang.startsWith('ru') || v.lang.startsWith('RU'));
    if (ruVoice) utterance.voice = ruVoice;

    utterance.onend = () => {
      setSpeakingMsgIndex(null);
    };
    utterance.onerror = () => {
      setSpeakingMsgIndex(null);
    };

    setSpeakingMsgIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const loadSessions = async (selectId?: string) => {
    setLoadingSessions(true);
    try {
      const res = await api.getChatSessions();
      setSessions(res.sessions);
      const target = selectId ?? res.sessions[0]?.id ?? null;
      if (target) {
        setActiveId(target);
        await loadMessages(target);
      } else {
        // Чатов нет — создаём первый автоматически
        await createSession(true);
      }
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось загрузить диалоги');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadMessages = async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const res = await api.getChatMessages(sessionId);
      setMessages(
        res.messages.length > 0
          ? res.messages.map((m) => ({
              id: m.id,
              role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
              content: m.content,
              attachments: parseAttachments(m.attachments),
            }))
          : [GREETING]
      );
      setSessions((prev) =>
        prev.map((s) => (s.id === res.session.id ? { ...s, ...res.session } : s))
      );
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось загрузить сообщения');
    } finally {
      setLoadingMessages(false);
    }
  };

  const createSession = async (silent = false) => {
    try {
      const res = await api.createChatSession();
      setSessions((prev) => [res.session, ...prev]);
      setActiveId(res.session.id);
      setMessages([GREETING]);
      setIsMobileListOpen(false);
      if (!silent) addToast('success', 'Новый диалог создан');
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось создать диалог');
    }
  };

  const selectSession = (id: string) => {
    if (id === activeId || sending) return;
    setActiveId(id);
    setIsMobileListOpen(false);
    void loadMessages(id);
  };

  const startRename = (id: string, title: string) => {
    setRenamingId(id);
    setRenameValue(title);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const title = renameValue.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    const currentSession = sessions.find((s) => s.id === renamingId);
    if (currentSession && currentSession.title === title) {
      setRenamingId(null);
      return;
    }
    try {
      const res = await api.renameChatSession(renamingId, title);
      setSessions((prev) => prev.map((s) => (s.id === res.session.id ? { ...s, ...res.session } : s)));
      addToast('success', 'Диалог переименован');
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось переименовать');
    } finally {
      setRenamingId(null);
      setRenameValue('');
    }
  };

  const deleteSession = async (id: string) => {
    const ok = await hudConfirm({
      title: 'УДАЛЕНИЕ ДИАЛОГА',
      message: 'Удалить диалог и всю историю сообщений без возможности восстановления?',
      confirmText: '[ УДАЛИТЬ ]',
      cancelText: '[ ОТМЕНА ]',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteChatSession(id);
      const rest = sessions.filter((s) => s.id !== id);
      setSessions(rest);
      if (id === activeId) {
        if (rest.length > 0) {
          setActiveId(rest[0].id);
          await loadMessages(rest[0].id);
        } else {
          setActiveId(null);
          setMessages([GREETING]);
          await createSession(true);
        }
      }
      addToast('success', 'Диалог удалён');
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось удалить диалог');
    }
  };

  const pickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    if (pendingFiles.length + incoming.length > MAX_FILES) {
      addToast('error', `Максимум ${MAX_FILES} файлов на одно сообщение`);
      return;
    }
    setPendingFiles((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearPendingFiles = () => {
    setPendingFiles((prev) => {
      for (const p of prev) if (p.preview) URL.revokeObjectURL(p.preview);
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const send = async (text?: string, targetSessionId?: string) => {
    const raw = (text ?? input).trim();
    const files = pendingFiles;
    if ((!raw && files.length === 0) || sending) return;
    // Текст обязателен для API: к одним файлам подставляем подпись
    const content = raw || 'Проанализируй прикреплённые файлы';
    let sessionId = targetSessionId || activeId;
    if (!sessionId) {
      try {
        const res = await api.createChatSession();
        sessionId = res.session.id;
        setSessions((prev) => [res.session, ...prev]);
        setActiveId(sessionId);
      } catch (error) {
        addToast('error', errText(error) || 'Не удалось создать диалог');
        return;
      }
    }
    // Оптимистичное сообщение с локальными превью
    const tempId = `temp-${Date.now()}`;
    const localAttachments: ChatAttachment[] = files.map((p) => ({
      name: p.file.name,
      url: p.preview ?? '',
      mimeType: p.file.type,
      size: p.file.size,
      local: true,
    }));
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content, attachments: localAttachments }]);
    setInput('');
    setSending(true);
    try {
      // 1) Загрузка файлов 2) отправка сообщения с метаданными
      let attachments: ChatAttachment[] = [];
      if (files.length > 0) {
        setUploading(true);
        try {
          const up = await api.uploadChatAttachments(sessionId, files.map((p) => p.file));
          attachments = up.attachments;
        } finally {
          setUploading(false);
        }
      }
      const res = await api.sendChatSessionMessage(sessionId, content, attachments);
      const serverAttachments = parseAttachments(res.userMessage.attachments);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: res.userMessage.id, attachments: serverAttachments }
            : m
        )
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setSessions((prev) =>
        [res.session, ...prev.filter((s) => s.id !== res.session.id)].sort(
          (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
        )
      );
      clearPendingFiles();
      if (res.demoMode && res.notice) addToast('info', res.notice);
    } catch (error) {
      addToast('error', errText(error) || 'Не удалось получить ответ AI');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Не получилось ответить. Попробуй ещё раз через минуту.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] w-full max-w-full overflow-hidden gap-4 lg:max-w-6xl">
      {isMobileListOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 md:hidden"
          onClick={() => setIsMobileListOpen(false)}
        />
      )}

      {/* Левая колонка — список диалогов: на мобильных шторка-оверлей */}
      <aside
        className={`fixed left-0 top-14 z-50 flex h-[calc(100dvh-3.5rem)] w-72 shrink-0 flex-col border-r border-white/10 bg-[#09090b] p-4 shadow-none transition-transform md:static md:z-auto md:h-full md:w-64 lg:w-72 md:translate-x-0 overflow-hidden ${
          isMobileListOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-3 flex items-center justify-between md:hidden">
          <span className="font-mono text-xs text-zinc-400">[ ДИАЛОГИ ]</span>
          <button
            onClick={() => setIsMobileListOpen(false)}
            className="text-zinc-400 hover:text-white p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => void createSession()}
          className="btn-lime mb-3 w-full shrink-0 text-sm"
        >
          [ + НОВЫЙ ДИАЛОГ ]
        </button>
        {loadingSessions ? (
          <div className="animate-pulse px-2 py-6 text-center font-mono text-xs tracking-[0.2em] text-zinc-500">
            ЗАГРУЗКА…
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm font-light text-zinc-500">
            Диалогов пока нет
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              const isRenaming = renamingId === s.id;
              return (
                <li key={s.id}>
                  <div
                    onClick={() => selectSession(s.id)}
                    onDoubleClick={() => startRename(s.id, s.title)}
                    title="Двойной клик — переименовать"
                    className={`group cursor-pointer border px-3 py-2.5 transition-all ${
                      isActive
                        ? 'border-[#d4ff00]/50 bg-[#d4ff00]/[0.07]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          maxLength={100}
                          className="field !px-2 !py-1 text-xs flex-1 rounded-none border-white/20 bg-black"
                        />
                        <button
                          type="button"
                          onClick={() => void commitRename()}
                          title="Сохранить"
                          className="p-1 border border-[#d4ff00]/40 bg-[#d4ff00]/10 text-[#d4ff00] hover:bg-[#d4ff00]/25 hover:border-[#d4ff00] transition-colors rounded-none"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          title="Отмена"
                          className="p-1 border border-white/10 text-zinc-500 hover:text-white transition-colors rounded-none"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`min-w-0 flex-1 truncate text-sm font-medium ${
                              isActive ? 'text-zinc-100' : 'text-zinc-300'
                            }`}
                          >
                            {s.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startRename(s.id, s.title);
                              }}
                              title="Переименовать"
                              className="p-1 text-zinc-500 hover:text-[#d4ff00]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteSession(s.id);
                              }}
                              title="Удалить диалог"
                              className="p-1 text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] tracking-[0.15em] text-zinc-600">
                          {formatDateTime(s.updatedAt)}
                          {typeof s._count?.messages === 'number' &&
                            ` • ${s._count.messages} msgs`}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* Правая колонка чата (область диалога) */}
      <div className="card-shelf flex flex-col h-full flex-1 min-w-0 overflow-hidden !p-0">
        {/* Шапка диалога */}
        <div className="flex-shrink-0 border-b border-white/10 bg-zinc-950/40 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {active && renamingId === active.id ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  maxLength={100}
                  className="field text-sm font-display font-bold text-white max-w-md rounded-none border-white/20 bg-black"
                />
                <button
                  type="button"
                  onClick={() => void commitRename()}
                  title="Сохранить"
                  className="p-1.5 border border-[#d4ff00]/50 bg-[#d4ff00]/10 text-[#d4ff00] hover:bg-[#d4ff00]/25 hover:border-[#d4ff00] transition-colors rounded-none"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  title="Отмена"
                  className="p-1.5 border border-white/10 text-zinc-500 hover:text-white transition-colors rounded-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => active && startRename(active.id, active.title)}
                title="Нажми, чтобы переименовать"
                className="block max-w-full truncate text-left font-display text-base md:text-lg font-bold tracking-tight text-white hover:text-[#d4ff00]"
              >
                {active?.title ?? 'Новый диалог'}
              </button>
            )}
            <div className="mt-0.5 font-mono text-[10px] tracking-[0.2em] text-zinc-500">
              {active ? `UPDATED // ${formatDateTime(active.updatedAt)}` : 'NO ACTIVE CHAT'}
            </div>
          </div>
          <button
            onClick={() => setIsMobileListOpen((v) => !v)}
            className="btn-ghost text-xs md:hidden shrink-0"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
            <span>Чаты</span>
          </button>
        </div>

        {/* СПИСОК СООБЩЕНИЙ — ЕДИНСТВЕННЫЙ СКРОЛЛЯЩИЙСЯ БЛОК */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {loadingMessages ? (
            <div className="animate-pulse py-10 text-center font-mono text-xs tracking-[0.2em] text-zinc-500">
              ЗАГРУЗКА ИСТОРИИ…
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={m.id ?? i} className="flex justify-end gap-2 items-start">
                  <div className="max-w-[85%] border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-light leading-relaxed text-zinc-100">
                    <MessageAttachments items={m.attachments ?? []} />
                    <ChatMessageContent content={m.content} />
                  </div>
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user?.name || 'User'}
                      className="mt-0.5 h-7 w-7 shrink-0 object-cover border border-[#d4ff00]/60 rounded-none bg-zinc-950"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-zinc-800 text-zinc-200 font-display font-bold text-xs border border-white/10 rounded-none">
                      {((user?.name || 'U')[0] || 'U').toUpperCase()}
                    </span>
                  )}
                </div>
              ) : (
                <div key={m.id ?? i} className="flex justify-start gap-2">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center bg-[#d4ff00] text-black">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="max-w-[85%] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-light leading-relaxed text-zinc-200">
                    <ChatMessageContent content={m.content} />
                    <div className="mt-2.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>РЕПЕТИТОР // AI_VOICE</span>
                      <button
                        type="button"
                        onClick={() => toggleSpeak(i, m.content)}
                        className={`flex items-center gap-1.5 px-2 py-0.5 border font-mono text-[10px] uppercase transition-all ${
                          speakingMsgIndex === i
                            ? 'border-[#d4ff00] bg-[#d4ff00]/15 text-[#d4ff00] font-bold'
                            : 'border-white/10 bg-transparent text-zinc-400 hover:text-white hover:border-white/20'
                        }`}
                        title={speakingMsgIndex === i ? 'Остановить воспроизведение' : 'Озвучить ответ синтезом речи'}
                      >
                        {speakingMsgIndex === i ? (
                          <>
                            <VolumeX className="w-3 h-3 text-[#d4ff00] animate-pulse" />
                            <span>СТОП</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>ОЗВУЧИТЬ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            )
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="animate-pulse border border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-xs tracking-[0.2em] text-zinc-500">
                AI ПЕЧАТАЕТ…
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Нижний блок (Подсказки + Поле ввода) — зафиксирован снизу */}
        <div className="flex-shrink-0 space-y-3 border-t border-white/10 bg-zinc-950/95 p-3 sm:p-4">
          {/* Подсказки */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                onClick={() => void send(q)}
                disabled={sending || loadingMessages}
                className="mono-chip text-[11px] transition-all hover:border-[#d4ff00]/50 hover:text-zinc-100 shadow-none disabled:opacity-50"
              >
                [ {q} ]
              </button>
            ))}
          </div>

          {/* Превью выбранных файлов до отправки */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {pendingFiles.map((p, i) => (
                <div
                  key={i}
                  className="flex shrink-0 items-center gap-2 rounded-none border border-white/10 bg-zinc-900/90 px-2.5 py-1.5 text-xs text-zinc-200 transition-all hover:border-[#d4ff00]/40"
                >
                  {p.preview ? (
                    <img src={p.preview} alt={p.file.name} className="h-7 w-7 rounded-none object-cover" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-[#d4ff00]" />
                  )}
                  <div className="max-w-[120px] sm:max-w-[180px]">
                    <span className="block truncate font-medium">{p.file.name}</span>
                    <span className="block font-mono text-[10px] text-zinc-500">
                      {formatSize(p.file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    title="Убрать файл"
                    className="rounded-none p-1 text-zinc-400 transition-all hover:bg-white/[0.05] hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            className="flex items-end gap-2 rounded-none border border-white/10 bg-zinc-900/80 p-2 transition-all focus-within:border-[#d4ff00]/50"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                pickFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || loadingMessages || uploading}
              title={`Прикрепить до ${MAX_FILES} файлов (фото, PDF, документы)`}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-none border border-transparent p-2.5 text-zinc-400 transition-all hover:border-[#d4ff00]/40 hover:bg-white/[0.05] hover:text-[#d4ff00] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={toggleListening}
              disabled={sending || loadingMessages}
              title={isListening ? 'Идет распознавание речи... Нажмите для остановки' : 'Голосовой ввод вопроса (Web Speech API)'}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-none border p-2.5 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isListening
                  ? 'animate-pulse border-red-500 bg-red-950/50 text-red-400'
                  : 'border-transparent text-zinc-400 hover:border-[#d4ff00]/40 hover:bg-white/[0.05] hover:text-[#d4ff00]'
              }`}
            >
              {isListening ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5" />}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Спроси про учёбу, ДЗ или ЕГЭ… (Enter — отправить, Shift+Enter — новая строка)"
              rows={1}
              className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-zinc-100 placeholder:text-zinc-500 py-2 px-1 resize-none max-h-32 text-sm md:text-base"
              disabled={sending || loadingMessages}
            />
            <button
              type="submit"
              disabled={sending || loadingMessages || uploading || (!input.trim() && pendingFiles.length === 0)}
              className="btn-lime h-10 px-4 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 flex-shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {uploading ? 'ЗАГРУЗКА…' : 'ОТПРАВИТЬ'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
