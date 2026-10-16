import React, { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';
import { errText } from '../lib/errors';
import { LatexText } from './LatexText';
import {
  FileCheck,
  ShieldAlert,
  Sparkles,
  Send,
  Upload,
  X,
  FileText,
  ZoomIn,
} from 'lucide-react';
import type { FipiCheckResult } from '../lib/types';

interface FipiSolutionCheckerProps {
  defaultSubject?: string;
  defaultTaskNumber?: string;
  defaultTaskText?: string;
}

interface AttachedFile {
  id: string;
  file: File;
  previewUrl: string;
  isPdf: boolean;
}

export const FipiSolutionChecker: React.FC<FipiSolutionCheckerProps> = ({
  defaultSubject = 'Профильная математика',
  defaultTaskNumber = '14',
  defaultTaskText = 'Решите уравнение 2sin²x - √3cos(x - π/2) = 0 и укажите корни на отрезке [π; 5π/2].',
}) => {
  const { addToast } = useToastStore();
  const [subject, setSubject] = useState(defaultSubject);
  const [taskNumber, setTaskNumber] = useState(defaultTaskNumber);
  const [taskText, setTaskText] = useState(defaultTaskText);
  const [solutionText, setSolutionText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState<{ url: string; name: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<FipiCheckResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Очистка Blob URL при размонтировании
  useEffect(() => {
    return () => {
      attachedFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, [attachedFiles]);

  // Закрытие полноэкранного предпросмотра по клавише ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenPreview(null);
      }
    };
    if (fullscreenPreview) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenPreview]);

  const handleAddFiles = (fileList: FileList | File[]) => {
    const newFiles = Array.from(fileList);
    if (attachedFiles.length + newFiles.length > 5) {
      addToast('error', 'Максимум 5 листов решения');
      return;
    }

    const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    const validFiles: AttachedFile[] = [];

    for (const f of newFiles) {
      if (!acceptedTypes.includes(f.type.toLowerCase())) {
        addToast('error', `Файл "${f.name}" имеет неподдерживаемый формат. Допустимы: PNG, JPEG, WEBP, PDF`);
        continue;
      }
      validFiles.push({
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        isPdf: f.type.toLowerCase() === 'application/pdf',
      });
    }

    setAttachedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleCheck = async () => {
    if (!solutionText.trim() && attachedFiles.length === 0) {
      addToast('info', 'Введите текст решения или прикрепите хотя бы один скан/фото');
      return;
    }

    setChecking(true);
    setResult(null);
    try {
      const res = await api.checkFipiSolution({
        subject,
        taskNumber,
        taskText,
        solutionText: solutionText.trim(),
        files: attachedFiles.map((a) => a.file),
      });
      setResult(res);
      addToast(
        'success',
        `Экспертная проверка ФИПИ завершена: первичный балл ${res.primaryScore}/${res.maxScore}`
      );
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка проверки решения');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="w-full bg-zinc-950/70 border border-white/[0.08] p-6 backdrop-blur-md">
      {/* HUD Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4 mb-6">
        <div>
          <span className="font-mono text-[10px] text-[#d4ff00] tracking-widest block">
            [ FIPI_EXPERT // PART_2_CRITERIA_VERIFICATION ]
          </span>
          <h3 className="font-display text-xl font-bold tracking-tight text-white mt-1">
            AI-Эксперт проверки решений (К1 / К2)
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="hud-tag text-[10px]">CRITERIA: К1-LOGIC // К2-ARITHMETIC</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Левая колонка: форма ввода */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">
                Предмет:
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-zinc-900 border border-white/[0.1] px-3 py-2 text-zinc-100 font-sans text-xs focus:outline-none focus:border-[#d4ff00]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">
                Номер задачи КИМ:
              </label>
              <input
                type="text"
                value={taskNumber}
                onChange={(e) => setTaskNumber(e.target.value)}
                placeholder="14, 15, 16, 17..."
                className="w-full bg-zinc-900 border border-white/[0.1] px-3 py-2 text-zinc-100 font-sans text-xs focus:outline-none focus:border-[#d4ff00]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">
              Условие задачи:
            </label>
            <textarea
              rows={2}
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              className="w-full bg-zinc-900 border border-white/[0.1] p-3 text-zinc-100 font-sans text-xs focus:outline-none focus:border-[#d4ff00] resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">
              Ваше развернутое решение (текст):
            </label>
            <textarea
              rows={5}
              value={solutionText}
              onChange={(e) => setSolutionText(e.target.value)}
              placeholder="Напишите математические рассуждения или прикрепите фото чистовика ниже..."
              className="w-full bg-zinc-900 border border-white/[0.1] p-3 text-zinc-100 font-mono text-xs focus:outline-none focus:border-[#d4ff00]"
            />
          </div>

          {/* Интерактивная зона нативной загрузки сканов / фото (до 5 файлов) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-mono text-zinc-300 uppercase font-semibold">
                Сканы чистовика решения:
              </label>
              <span className="font-mono text-[10px] text-zinc-400">
                [ {attachedFiles.length} / 5 ЛИСТОВ ]
              </span>
            </div>

            {/* Зона Drag & Drop */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 border border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-2 ${
                isDragging
                  ? 'border-[#d4ff00] bg-[#d4ff00]/10'
                  : 'border-white/[0.12] bg-zinc-900/40 hover:border-white/30 hover:bg-zinc-900/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png, image/jpeg, image/jpg, image/webp, application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <Upload className="w-6 h-6 text-[#d4ff00]" />
              <div className="text-xs text-zinc-300 font-mono">
                <span className="text-white font-bold">Нажмите для выбора</span> или перетащите файлы сюда
              </div>
              <p className="text-[10px] font-mono text-zinc-500">
                PNG, JPEG, WEBP, PDF • До 5 страниц • До 15 МБ на файл
              </p>
            </div>

            {/* Сетка предпросмотра прикрепленных файлов */}
            {attachedFiles.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                {attachedFiles.map((item, idx) => (
                  <div
                    key={item.id}
                    className="group relative bg-zinc-900 border border-white/[0.1] hover:border-[#d4ff00]/50 p-2 flex flex-col transition-all"
                  >
                    {/* Хедер миниатюры */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5 pb-1 border-b border-white/[0.06]">
                      <span className="text-[#d4ff00] font-bold">[ ЛИСТ {idx + 1} ]</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(idx);
                        }}
                        className="text-zinc-500 hover:text-rose-400 transition-colors p-0.5"
                        title="Удалить"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Превью изображения или PDF */}
                    <div
                      onClick={() => {
                        if (!item.isPdf) {
                          setFullscreenPreview({ url: item.previewUrl, name: item.file.name });
                        }
                      }}
                      className={`relative h-24 w-full bg-black/50 border border-white/[0.04] overflow-hidden flex items-center justify-center ${
                        !item.isPdf ? 'cursor-zoom-in' : ''
                      }`}
                    >
                      {!item.isPdf ? (
                        <>
                          <img
                            src={item.previewUrl}
                            alt={`Лист ${idx + 1}`}
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-zinc-400">
                          <FileText className="w-8 h-8 text-[#d4ff00]" />
                          <span className="text-[10px] font-mono">PDF ДОКУМЕНТ</span>
                        </div>
                      )}
                    </div>

                    {/* Имя файла */}
                    <div
                      className="mt-1.5 text-[10px] font-mono text-zinc-400 truncate"
                      title={item.file.name}
                    >
                      {item.file.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleCheck}
            disabled={checking || (!solutionText.trim() && attachedFiles.length === 0)}
            className="w-full py-3 bg-[#d4ff00] text-black font-display font-extrabold uppercase text-xs tracking-wider transition-all hover:brightness-110 hover:shadow-glow disabled:opacity-40 disabled:hover:shadow-none flex items-center justify-center gap-2"
          >
            {checking ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin text-black" />
                ПРОВЕРКА ПО КРИТЕРИЯМ ФИПИ...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                ОЦЕНИТЬ ПО КРИТЕРИЯМ ФИПИ [ К1 + К2 ]
              </>
            )}
          </button>
        </div>

        {/* Правая колонка: экспертный вердикт */}
        <div className="flex flex-col h-full">
          {!result && !checking && (
            <div className="h-full min-h-[300px] border border-dashed border-white/[0.1] p-8 flex flex-col items-center justify-center text-center text-zinc-500">
              <FileCheck className="w-12 h-12 stroke-[1] mb-3 text-zinc-600" />
              <p className="font-mono text-xs uppercase tracking-wider mb-1">
                ОЖИДАНИЕ ТЕКСТА ИЛИ СКАНОВ РЕШЕНИЯ
              </p>
              <p className="text-xs text-zinc-600 max-w-sm">
                Эксперт проверит математическую строгость (К1), вычислительную точность (К2), выявит потерю ОДЗ и неверные логические переходы.
              </p>
            </div>
          )}

          {checking && (
            <div className="h-full min-h-[300px] border border-white/[0.08] bg-zinc-900/30 p-8 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border border-[#d4ff00] border-t-transparent animate-spin rounded-none" />
              <p className="font-mono text-xs text-[#d4ff00] tracking-wider text-center">
                РАБОТА ЭКСПЕРТНОЙ КОМИССИИ ФИПИ...
                <br />
                <span className="text-[10px] text-zinc-500">
                  АНАЛИЗ РУКОПИСНОГО ЧИСТОВИКА И ВЫЧИСЛЕНИЙ
                </span>
              </p>
            </div>
          )}

          {result && !checking && (
            <div className="space-y-4">
              {/* Бейджи баллов */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-900 border border-white/[0.1] text-center">
                  <span className="font-mono text-[10px] text-zinc-400 block uppercase">
                    ИТОГОВЫЙ БАЛЛ
                  </span>
                  <div className="font-display text-2xl font-black text-[#d4ff00] mt-1">
                    {result.primaryScore} / {result.maxScore}
                  </div>
                </div>

                <div className="p-3 bg-zinc-900 border border-white/[0.1] text-center">
                  <span className="font-mono text-[10px] text-zinc-400 block uppercase">
                    К1 (ОБОСНОВАННОСТЬ)
                  </span>
                  <div className="font-display text-2xl font-black text-white mt-1">
                    {result.k1Score} / {result.k1Max}
                  </div>
                </div>

                <div className="p-3 bg-zinc-900 border border-white/[0.1] text-center">
                  <span className="font-mono text-[10px] text-zinc-400 block uppercase">
                    К2 (ВЫЧИСЛЕНИЯ)
                  </span>
                  <div className="font-display text-2xl font-black text-white mt-1">
                    {result.k2Score} / {result.k2Max}
                  </div>
                </div>
              </div>

              {/* Комментарии по критериям */}
              <div className="space-y-2">
                <div className="p-3 bg-white/[0.02] border border-white/[0.06] text-xs">
                  <span className="font-mono text-[#d4ff00] font-bold block mb-1">
                    [ К1 — ЛОГИКА И ОБОСНОВАНИЯ ]:
                  </span>
                  <div className="text-zinc-300 font-sans leading-relaxed">
                    <LatexText content={result.k1Comment} />
                  </div>
                </div>
                <div className="p-3 bg-white/[0.02] border border-white/[0.06] text-xs">
                  <span className="font-mono text-amber-400 font-bold block mb-1">
                    [ К2 — ВЫЧИСЛЕНИЯ И ОФОРМЛЕНИЕ ]:
                  </span>
                  <div className="text-zinc-300 font-sans leading-relaxed">
                    <LatexText content={result.k2Comment} />
                  </div>
                </div>
              </div>

              {/* Список ошибок с цитатами */}
              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider block">
                    ВЫЯВЛЕННЫЕ ОШИБКИ И СОВЕТЫ ЭКСПЕРТА:
                  </span>
                  {result.errors.map((err, i) => (
                    <div
                      key={i}
                      className="p-3 bg-zinc-900/80 border border-rose-500/30 text-xs space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="font-mono text-[10px] text-rose-400 uppercase font-bold">
                          ТИП: {err.type}
                        </span>
                      </div>
                      <div className="text-zinc-200">
                        <LatexText content={err.description} />
                      </div>
                      {err.quote && (
                        <div className="p-2 bg-black/50 border border-white/[0.05] font-mono text-[11px] text-zinc-400 italic">
                          "<LatexText content={err.quote} />"
                        </div>
                      )}
                      <div className="text-[11px] text-[#d4ff00]/90 font-mono">
                        Совет: <LatexText content={err.recommendation} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Вердикт эксперта */}
              <div className="p-4 bg-[#d4ff00]/5 border border-[#d4ff00]/20 text-xs">
                <span className="font-mono text-[10px] text-[#d4ff00] font-bold block uppercase mb-1">
                  РЕЗЮМЕ ПРЕДМЕТНОЙ КОМИССИИ:
                </span>
                <p className="text-zinc-200 font-sans leading-relaxed">
                  <LatexText content={result.expertVerdict} />
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Полноэкранный просмотр чистовика (Lightbox) для проверки читаемости почерка */}
      {fullscreenPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setFullscreenPreview(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-4xl flex-col items-center rounded-none border border-white/10 bg-zinc-900 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-xs font-mono text-zinc-300 pb-2 mb-2 border-b border-white/[0.1] px-2">
              <span className="text-[#d4ff00]">[ ПРЕДПРОСМОТР ЧИСТОВИКА // {fullscreenPreview.name} ]</span>
              <button
                onClick={() => setFullscreenPreview(null)}
                className="text-zinc-400 hover:text-white p-1"
                title="Закрыть (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto max-h-[80vh] flex items-center justify-center p-2 bg-black/60">
              <img
                src={fullscreenPreview.url}
                alt="Предпросмотр чистовика"
                className="max-h-[76vh] max-w-full object-contain rounded-sm"
              />
            </div>
            <div className="w-full text-center text-[11px] font-mono text-zinc-500 pt-2">
              Убедитесь, что почерк, математические индексы и графики разборчивы перед отправкой на проверку.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FipiSolutionChecker;
