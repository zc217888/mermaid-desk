import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warn' | 'error';

export interface ToastItem {
  id: number;
  type: ToastType;
  text: string;
}

let counter = 0;

export function useToast() {
  const [toast, setToast] = useState<ToastItem | null>(null);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++counter;
    setToast({ ...t, id });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast((cur) => (cur?.id === toast.id ? null : cur));
    }, 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, push };
}

const iconMap = {
  success: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
};

export function Toast({ toast }: { toast: ToastItem | null }) {
  if (!toast) return null;
  const Icon = iconMap[toast.type];
  return (
    <div className={`toast ${toast.type}`} role="status">
      <span className="toast-icon">
        <Icon size={14} />
      </span>
      <span>{toast.text}</span>
    </div>
  );
}
