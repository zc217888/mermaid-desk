import { useEffect, useRef, useState } from 'react';
import { Braces, Upload, X } from 'lucide-react';

interface ImportJsonModalProps {
  onClose: () => void;
  onImport: (text: string) => Promise<void>;
}

const PLACEHOLDER = `{
  "files": [
    {
      "name": "示例.mmd",
      "mermaid": "sequenceDiagram\\n    A->>B: Hello"
    }
  ]
}`;

export function ImportJsonModal({ onClose, onImport }: ImportJsonModalProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importing, onClose]);

  const submit = async () => {
    if (!text.trim() || importing) return;
    setImporting(true);
    setError(null);
    try {
      await onImport(text);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !importing && onClose()}>
      <div className="modal import-json-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="brand-logo" style={{ width: 36, height: 36 }}>
            <Braces size={18} />
          </div>
          <div>
            <div className="modal-title">导入 Mermaid JSON</div>
            <div className="modal-subtitle">同名文件覆盖，新文件自动创建</div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={importing} title="关闭 (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="import-json-body">
          <textarea
            ref={textareaRef}
            className="import-json-textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
          />
          {error && <div className="import-json-error">{error}</div>}
        </div>
        <div className="import-json-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={importing}>取消</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={!text.trim() || importing}>
            <Upload size={15} />
            {importing ? '导入中' : '导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
