import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { LatexText } from './LatexText';
import { useToastStore } from '../store/toastStore';
import { errText } from '../lib/errors';
import { X, Flame, ShieldAlert, ListOrdered, RefreshCw, Copy, Check } from 'lucide-react';
import type { SosSummary } from '../lib/types';

interface SosCheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  topic: string;
  onSaved?: () => void;
}

export const SosCheatSheetModal: React.FC<SosCheatSheetModalProps> = ({
  isOpen,
  onClose,
  subject,
  topic,
  onSaved,
}) => {
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SosSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && topic) {
      loadSos();
    } else {
      setData(null);
      setCopied(false);
    }
  }, [isOpen, topic]);

  const loadSos = async () => {
    setLoading(true);
    try {
      const res = await api.getStudySos(subject, topic);
      setData(res);
      if (onSaved) {
        onSaved();
      }
    } catch (e) {
      addToast('error', errText(e) || 'Ошибка загрузки SOS-шпаргалки');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = () => {
    if (!data) return;
    const text = `[ SOS: 15 МИНУТ ДО КОНТРОЛЬНОЙ // ${data.subject} // ${data.topic} ]\n\n` +
      `КЛЮЧЕВЫЕ ФОРМУЛЫ:\n` +
      data.formulas.map((f, i) => `${i + 1}. ${f.title}: ${f.latex} (${f.note})`).join('\n') +
      `\n\nТИПИЧНЫЕ ЛОВУШКИ:\n` +
      data.pitfalls.map((p) => `! ${p.title}: ${p.explanation}`).join('\n') +
      `\n\nАЛГОРИТМ РЕШЕНИЯ:\n` +
      data.algorithm.map((a) => `${a.step}. ${a.instruction}`).join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('success', 'SOS-конспект скопирован в буфер обмена');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-none border border-zinc-800 bg-zinc-900 p-5 md:p-7 text-zinc-100 flex flex-col max-h-[92vh] overflow-y-auto shadow-none">
        {/* HUD угол-бейдж */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-[#d4ff00] font-extrabold">
              [ SOS // ШПАРГАЛКА ]
            </span>
            {data && (
              <span className="hidden sm:inline-block font-mono text-[10px] px-2 py-0.5 border border-white/10 bg-white/[0.03] text-zinc-400 font-semibold">
                [ СОХРАНЕНО ]
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={handleCopyAll}
                className="px-2.5 py-1 border border-white/[0.1] hover:border-[#d4ff00] text-zinc-300 hover:text-[#d4ff00] font-mono text-[11px] flex items-center gap-1.5 transition-colors"
                title="Скопировать всё"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#d4ff00]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'СКОПИРОВАНО' : 'СКОПИРОВАТЬ'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Тема */}
        <div className="mb-5">
          <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider block">
            {subject}
          </span>
          <h2 className="text-xl md:text-2xl font-display font-black tracking-tight text-white mt-0.5">
            {topic}
          </h2>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-rose-400 animate-spin" />
            <p className="font-mono text-xs text-rose-300 tracking-wider">
              ВЫЖИМКА САМОГО ГЛАВНОГО БЕЗ ВОДЫ...
            </p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-zinc-400 text-sm">
            Не удалось сформировать SOS-шпаргалку
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. ФОРМУЛЫ (с маркерной подсветкой) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Flame className="w-4 h-4 text-[#d4ff00]" />
                <h3 className="font-mono text-xs font-bold text-[#d4ff00] uppercase tracking-wider">
                  1. КЛЮЧЕВЫЕ ФОРМУЛЫ (ВЫУЧИТЬ НАИЗУСТЬ)
                </h3>
              </div>
              <div className="space-y-2.5">
                {data.formulas.map((form, i) => (
                  <div
                    key={i}
                    className="p-3.5 bg-zinc-900 border border-white/[0.08] hover:border-[#d4ff00]/40 transition-colors"
                  >
                    <div className="text-xs font-mono text-zinc-400 mb-1">{form.title}</div>
                    {/* Маркерная подсветка KaTeX */}
                    <div className="py-1.5 px-3 bg-[#d4ff00]/10 border-l border-[#d4ff00] text-lg text-white font-serif overflow-x-auto">
                      <LatexText content={`$${form.latex}$`} />
                    </div>
                    {form.note && (
                      <p className="mt-1 text-[11px] text-zinc-400 font-sans">{form.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 2. ЛОВУШКИ СОСТАВИТЕЛЕЙ */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <h3 className="font-mono text-xs font-bold text-red-400 uppercase tracking-wider">
                  2. ТИПИЧНЫЕ ЛОВУШКИ СОСТАВИТЕЛЕЙ КИМ
                </h3>
              </div>
              <div className="space-y-2.5">
                {data.pitfalls.map((pit, i) => (
                  <div
                    key={i}
                    className="p-3.5 bg-red-500/5 border border-red-500/20 text-xs space-y-1"
                  >
                    <div className="font-mono text-red-300 font-bold uppercase flex items-center gap-1.5">
                      <span className="text-red-500">[{i + 1}]</span> {pit.title}
                    </div>
                    <p className="text-zinc-300 font-sans leading-relaxed">
                      <LatexText content={pit.explanation} />
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. АЛГОРИТМ РЕШЕНИЯ */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ListOrdered className="w-4 h-4 text-amber-400" />
                <h3 className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">
                  3. ПОШАГОВЫЙ АЛГОРИТМ РЕШЕНИЯ
                </h3>
              </div>
              <div className="p-4 bg-zinc-900/60 border border-white/[0.08] divide-y divide-white/[0.05]">
                {data.algorithm.map((step) => (
                  <div key={step.step} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 shrink-0">
                      ШАГ {step.step}
                    </span>
                    <p className="text-xs text-zinc-200 font-sans leading-relaxed pt-0.5">
                      <LatexText content={step.instruction} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
