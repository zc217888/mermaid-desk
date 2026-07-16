import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Hash, Loader2, Type, FolderOpen, Sparkles } from 'lucide-react';

interface StatusBarProps {
  charCount: number;
  lineCount: number;
  lastSavedAt: number | null;
  error: string | null;
  rendering: boolean;
  imageDir: string;
  mmdDir: string;
  isElectron: boolean;
  pythonReady?: boolean | null;
  pythonError?: string | null;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getDirName(fullPath: string): string {
  if (!fullPath) return '';
  const trimmed = fullPath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return '…' + s.slice(-(max - 1));
}

export function StatusBar({ charCount, lineCount, lastSavedAt, error, rendering, imageDir, mmdDir, isElectron, pythonReady, pythonError }: StatusBarProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="statusbar">
      <span className="statusbar-item">
        <span style={{ width: 6, height: 6, borderRadius: 3, background: rendering ? '#f59e0b' : isElectron ? 'var(--accent-2)' : 'var(--success)' }} />
        {rendering ? (
          <>
            <Loader2 size={11} className="spin" />
            <span>渲染中…</span>
          </>
        ) : error ? (
          <span className="statusbar-item error">
            <AlertCircle size={11} />
            <span>解析失败</span>
          </span>
        ) : (
          <span className="statusbar-item success">
            <CheckCircle2 size={11} />
            <span>{isElectron ? '桌面版' : 'Web'}</span>
          </span>
        )}
      </span>

      <span className="statusbar-item">
        <Type size={11} />
        <strong>{charCount.toLocaleString()}</strong> 字符
      </span>

      <span className="statusbar-item">
        <Hash size={11} />
        <strong>{lineCount.toLocaleString()}</strong> 行
      </span>

      {imageDir && (
        <span className="statusbar-item statusbar-item-subdir" title={`图片：${imageDir}`}>
          <FolderOpen size={10} />
          {truncate(getDirName(imageDir), 16)}
        </span>
      )}

      {mmdDir && (
        <span className="statusbar-item statusbar-item-subdir" title={`代码：${mmdDir}`}>
          <FolderOpen size={10} />
          {truncate(getDirName(mmdDir), 16)}
        </span>
      )}

      {lastSavedAt && (
        <span className="statusbar-item">
          <Clock size={11} />
          上次保存 {formatTime(lastSavedAt)}
        </span>
      )}

      {isElectron && (
        <span
          className="statusbar-item"
          title={
            pythonReady
              ? 'Python + Playwright 已就绪，使用 8x 超高清渲染'
              : pythonError
                ? `Python 不可用：${pythonError}（已自动回退到 6x 渲染）`
                : '正在检测 Python 环境…'
          }
        >
          <Sparkles size={11} />
          {pythonReady ? (
            <span style={{ color: 'var(--accent-2)' }}>Python 8x</span>
          ) : pythonError ? (
            <span style={{ color: '#f59e0b' }}>Canvas 6x</span>
          ) : (
            <span style={{ opacity: 0.6 }}>检测中…</span>
          )}
        </span>
      )}

      <div className="statusbar-spacer" />

      {error && (
        <span className="statusbar-item error" title={error}>
          <AlertCircle size={11} />
          {error.length > 80 ? error.slice(0, 80) + '…' : error}
        </span>
      )}

      <span className="statusbar-item">Mermaid 11 · 实时渲染</span>
    </footer>
  );
}
