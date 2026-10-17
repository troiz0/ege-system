import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useToastStore } from '../store/toastStore';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { errText } from '../lib/errors';
import type { AuthUser } from '../lib/types';

interface RegisterFormProps {
  onSuccess: (user: AuthUser) => void;
  onSwitchToLogin?: () => void;
  initialEmail?: string;
  initialPassword?: string;
  initialName?: string;
  initialGrade?: number;
}

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
  initialEmail = '',
  initialPassword = '',
  initialName = '',
  initialGrade = 11,
}: RegisterFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(initialName);
  const [grade, setGrade] = useState<number>(initialGrade);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  
  // 6 отдельных ячеек для одноразового кода
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devNotice, setDevNotice] = useState<string | null>(null);

  const { addToast } = useToastStore();

  const code = digits.join('');

  // Заполнение ячеек строкой цифр
  const populateDigits = (val: string) => {
    const chars = val.replace(/\D/g, '').slice(0, 6).split('');
    const newDigits = ['', '', '', '', '', ''];
    chars.forEach((c, i) => {
      newDigits[i] = c;
    });
    setDigits(newDigits);
  };

  // Автофокус при переходе на Шаг 2
  useEffect(() => {
    if (step === 2) {
      const firstEmpty = digits.findIndex((d) => !d);
      const targetIdx = firstEmpty !== -1 ? firstEmpty : 0;
      const timer = setTimeout(() => {
        inputRefs.current[targetIdx]?.focus();
        inputRefs.current[targetIdx]?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Отсчет таймера cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Обработка ввода одной цифры в ячейку
  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');

    if (!clean) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    // Если вставили несколько цифр
    if (clean.length > 1) {
      handlePasteString(clean, index);
      return;
    }

    const char = clean.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Перевод фокуса на следующую ячейку
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  // Обработка управляющих клавиш
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else if (digits[index]) {
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
      inputRefs.current[index - 1]?.select();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  // Обработка вставки строки
  const handlePasteString = (text: string, startIndex = 0) => {
    const chars = text.replace(/\D/g, '').slice(0, 6).split('');
    if (chars.length === 0) return;

    const newDigits = [...digits];
    chars.forEach((c, offset) => {
      const targetIdx = startIndex + offset;
      if (targetIdx < 6) {
        newDigits[targetIdx] = c;
      }
    });
    setDigits(newDigits);

    const nextFocusIndex = Math.min(startIndex + chars.length, 5);
    inputRefs.current[nextFocusIndex]?.focus();
    inputRefs.current[nextFocusIndex]?.select();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    handlePasteString(pasted, 0);
  };

  // ШАГ 1: Запрос кода подтверждения
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('error', 'Введите ваше имя');
      return;
    }
    if (!email.trim()) {
      addToast('error', 'Введите email');
      return;
    }
    if (password.length < 6) {
      addToast('error', 'Пароль должен содержать минимум 6 символов');
      return;
    }

    setLoading(true);
    try {
      const res = await api.requestRegisterCode(email.trim(), password, name.trim(), grade);
      addToast('success', res.message || 'Код подтверждения отправлен на почту');
      setStep(2);
      setCooldown(60);
      if (res.devCode) {
        populateDigits(res.devCode);
        setDevNotice(res.devCode);
      } else {
        setDigits(['', '', '', '', '', '']);
        setDevNotice(null);
      }
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка при отправке кода');
    } finally {
      setLoading(false);
    }
  };

  // ШАГ 2: Подтверждение кода и регистрация
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      addToast('error', 'Введите все 6 цифр кода подтверждения');
      return;
    }

    setLoading(true);
    try {
      const res = await api.verifyRegisterCode(email.trim(), code.trim());
      addToast('success', 'Регистрация успешна!');
      onSuccess(res.user);
    } catch (error) {
      addToast('error', errText(error) || 'Неверный или устаревший код подтверждения');
    } finally {
      setLoading(false);
    }
  };

  // Повторная отправка кода
  const handleResend = async () => {
    if (cooldown > 0 || resendLoading) return;
    setResendLoading(true);
    try {
      const res = await api.resendRegisterCode(email.trim());
      addToast('success', res.message || 'Новый код отправлен на указанную почту');
      setCooldown(60);
      if (res.devCode) {
        populateDigits(res.devCode);
        setDevNotice(res.devCode);
      } else {
        setDigits(['', '', '', '', '', '']);
        setDevNotice(null);
      }
    } catch (error) {
      addToast('error', errText(error) || 'Ошибка повторной отправки кода');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="w-full transition-all duration-300 ease-out">
      {step === 1 ? (
        <form onSubmit={handleRequestCode} className="space-y-3">
          <div>
            <label className="hud-tag mb-1 block">ИМЯ // CALLSIGN</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-none border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
              placeholder="Иван"
              required
            />
          </div>

          <div>
            <label className="hud-tag mb-1 block">КЛАСС // GRADE</label>
            <div className="grid grid-cols-3 gap-2">
              {[9, 10, 11].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`py-2 text-xs font-mono uppercase tracking-wider border rounded-none transition-colors ${
                    grade === g
                      ? 'border-[#d4ff00] bg-[#d4ff00]/10 text-[#d4ff00] font-bold'
                      : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/20'
                  }`}
                >
                  {g} класс
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="hud-tag mb-1 block">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-none border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
              placeholder="student@ege.system"
              required
            />
          </div>

          <div>
            <label className="hud-tag mb-1 block">ПАРОЛЬ</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-none border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#d4ff00] focus:outline-none"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-none bg-[#d4ff00] py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-all hover:brightness-110 disabled:opacity-50"
          >
            {loading && <LoadingSpinner size="sm" />}
            [ ПОЛУЧИТЬ КОД ПОДТВЕРЖДЕНИЯ ]
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h3 className="hud-tag text-[#d4ff00] font-bold text-xs uppercase tracking-[0.15em] mb-1">
              [ ПОДТВЕРЖДЕНИЕ ПОЧТЫ // ВВЕДИТЕ КОД ]
            </h3>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Код отправлен на <span className="text-white font-mono font-medium">{email}</span>. Проверьте папку «Входящие» и «Спам».
            </p>
          </div>

          {devNotice && (
            <div className="border border-[#d4ff00]/40 bg-[#d4ff00]/[0.08] p-2.5 text-xs font-mono text-[#d4ff00]">
              <div className="font-bold">[ DEV // КОД АВТОЗАПОЛНЕН ]</div>
              <div className="text-[11px] text-zinc-300 mt-0.5">
                Код: <span className="text-white font-bold tracking-widest">{devNotice}</span> (SMTP вернул ошибку, код сохранен)
              </div>
            </div>
          )}

          {/* 6 отдельных текстовых полей для каждой цифры */}
          <div>
            <label className="hud-tag mb-2 block">6-ЗНАЧНЫЙ ОДНОРАЗОВЫЙ КОД</label>

            <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  onFocus={(e) => e.target.select()}
                  className={`h-13 sm:h-14 w-full text-center font-mono text-2xl font-bold rounded-none border transition-all duration-150 outline-none select-none ${
                    digit
                      ? 'border-[#d4ff00] bg-[#d4ff00]/[0.08] text-[#d4ff00] shadow-[0_0_12px_rgba(212,255,0,0.15)]'
                      : 'border-white/10 bg-zinc-950/80 text-white placeholder-zinc-700 hover:border-white/20 focus:border-[#d4ff00] focus:bg-[#d4ff00]/[0.03]'
                  }`}
                  placeholder="·"
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-none bg-[#d4ff00] py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-all hover:brightness-110 disabled:opacity-50"
          >
            {loading && <LoadingSpinner size="sm" />}
            [ ПОДТВЕРДИТЬ И ВОЙТИ ]
          </button>

          {/* Таймер повторной отправки */}
          <div className="pt-1">
            {cooldown > 0 ? (
              <p className="text-center font-mono text-xs text-zinc-500">
                Запросить код повторно можно через {cooldown}с...
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="w-full rounded-none border border-[#d4ff00]/40 bg-[#d4ff00]/[0.06] py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4ff00] transition-colors hover:bg-[#d4ff00]/[0.12] disabled:opacity-50"
              >
                {resendLoading ? '[ ОТПРАВКА... ]' : '[ ОТПРАВИТЬ КОД ПОВТОРНО ]'}
              </button>
            )}
          </div>

          {/* Возврат на шаг 1 с сохранением данных */}
          <div className="border-t border-white/10 pt-3 text-center">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="font-mono text-xs text-zinc-500 hover:text-zinc-200 transition-colors uppercase tracking-wider inline-flex items-center gap-1.5"
            >
              <span>← Изменить email</span>
            </button>
          </div>
        </form>
      )}

      {onSwitchToLogin && step === 1 && (
        <div className="mt-4 flex items-center justify-between font-mono text-xs text-zinc-500 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="hover:text-zinc-200 uppercase tracking-wider transition-colors"
          >
            Уже есть аккаунт? Войти
          </button>
        </div>
      )}
    </div>
  );
}
