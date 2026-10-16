import { useEffect, useState } from 'react';
import { useToastStore } from '../store/toastStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle } from './ui/alert';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-full max-w-md flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}

interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  onClose: (id: string) => void;
}

function Toast({ id, type, message, onClose }: ToastProps) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setClosing(true), 5000);
    return () => clearTimeout(timer);
  }, [id]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => onClose(id), 280);
    return () => clearTimeout(timer);
  }, [closing, id, onClose]);

  const icons = {
    success: <CheckCircle className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />,
  };

  const accents = {
    success: 'border-green-500/50 text-green-400',
    error: 'border-red-500/50 text-red-400',
    info: 'border-cyan-400/50 text-cyan-300',
    warning: 'border-yellow-500/50 text-yellow-400',
  };

  return (
    <Alert
      className={`pointer-events-auto bg-card/95 shadow-card backdrop-blur-sm transition-[border-color] ${accents[type]} ${
        closing ? 'animate-alert-out' : 'animate-alert-in'
      }`}
    >
      {icons[type]}
      <AlertTitle className="flex items-start gap-3 pr-1 tracking-normal">
        <span className="flex-1 leading-snug text-card-foreground">{message}</span>
        <button
          onClick={() => setClosing(true)}
          aria-label="Закрыть"
          className="mt-0.5 flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </AlertTitle>
    </Alert>
  );
}
