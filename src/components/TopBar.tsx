import { useState } from 'react';
import {
  Layers,
  Palette,
  FileDown,
  FileUp,
  Copy,
  Download,
  ClipboardCopy,
  Wand2,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FolderInput,
  RotateCcw,
  Image as ImageIcon,
  FileCode2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import type { MermaidTheme } from '../lib/mermaid';
import { getMermaidVersion } from '../lib/mermaid';

interface TopBarProps {
  theme: MermaidTheme;
  onThemeChange: (t: MermaidTheme) => void;
  onOpenExamples: () => void;
  onSave: () => void;
  onLoad: () => void;
  onCopyPng: () => void;
  onDownloadPng: () => void;
  onDownloadSvg: () => void;
  onCopyCode: () => void;
  onFormat: () => void;
  onClear: () => void;
  // 保存路径（Electron 桌面版）
  imageDir: string;
  mmdDir: string;
  defaultImageDir: string;
  defaultMmdDir: string;
  isElectron: boolean;
  onImageDirChange: (v: string) => void;
  onMmdDirChange: (v: string) => void;
  onPickImageDir: () => void;
  onPickMmdDir: () => void;
  onResetDefaults: () => void;
}

const themes: { id: MermaidTheme; label: string }[] = [
  { id: 'default', label: '默认' },
  { id: 'dark', label: '深色' },
  { id: 'forest', label: '森林' },
  { id: 'neutral', label: '极简' },
];

export function TopBar(props: TopBarProps) {
  const version = getMermaidVersion();
  const [pathPanelOpen, setPathPanelOpen] = useState(false);

  const imageChanged = props.imageDir !== props.defaultImageDir;
  const mmdChanged = props.mmdDir !== props.defaultMmdDir;

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <div className="brand">
          <div className="brand-logo">
            <Sparkles size={18} strokeWidth={2.5} />
          </div>
          <div className="brand-text">
            <span>Mermaid 图表工坊</span>
            <span className="brand-sub">
              Codex · {props.isElectron ? 'Desktop' : 'Web'}
            </span>
          </div>
        </div>

        <span className="version-badge" title="Mermaid 渲染引擎版本">
          <span className="version-dot" />
          v{version}
        </span>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={props.onOpenExamples} title="浏览示例">
            <Layers size={15} />
            <span>示例</span>
          </button>

          <div className="theme-picker" title="主题">
            <Palette size={14} style={{ margin: 'auto 4px auto 6px', color: 'var(--fg-muted)' }} />
            {themes.map((t) => (
              <button
                key={t.id}
                className={`theme-chip ${props.theme === t.id ? 'active' : ''}`}
                onClick={() => props.onThemeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button className="btn" onClick={props.onFormat} title="格式化代码">
            <Wand2 size={15} />
            <span>格式化</span>
          </button>

          <button className="btn" onClick={props.onCopyCode} title="复制 Mermaid 源码">
            <Copy size={15} />
            <span>复制代码</span>
          </button>

          <button className="btn" onClick={props.onLoad} title="从 .mmd / .md 文件导入">
            <FileUp size={15} />
            <span>导入</span>
          </button>

          <button
            className="btn btn-configured"
            onClick={props.onSave}
            title={`保存到 ${props.mmdDir}`}
          >
            <FileDown size={15} />
            <span>保存</span>
            <span className="btn-badge" title={props.mmdDir}>
              <FolderOpen size={10} />
              {getDirName(props.mmdDir)}
            </span>
          </button>

          <button
            className="btn btn-configured"
            onClick={props.onDownloadPng}
            title={`保存到 ${props.imageDir}（4x 高清位图）`}
          >
            <Download size={15} />
            <span>下载 PNG</span>
            <span className="btn-badge" title={props.imageDir}>
              <FolderOpen size={10} />
              {getDirName(props.imageDir)}
            </span>
          </button>

          <button
            className="btn"
            onClick={props.onDownloadSvg}
            title={`保存 SVG 矢量图到 ${props.imageDir}（真正的无损）`}
          >
            <FileCode2 size={15} />
            <span>下载 SVG</span>
          </button>

          <button className="btn btn-primary" onClick={props.onCopyPng} title="复制图片到剪贴板">
            <ClipboardCopy size={15} />
            <span>复制图片</span>
          </button>

          <button className="btn btn-ghost" onClick={props.onClear} title="清空编辑器">
            <Trash2 size={15} />
          </button>

          <button
            className={`btn ${pathPanelOpen ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPathPanelOpen((v) => !v)}
            title="配置保存路径"
            aria-expanded={pathPanelOpen}
          >
            <FolderInput size={15} />
            <span>保存路径</span>
            {(imageChanged || mmdChanged) && (
              <span className="setting-dot" title="已自定义保存路径" />
            )}
            {pathPanelOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {pathPanelOpen && (
        <div className="path-panel">
          {!props.isElectron && (
            <div className="path-panel-warn">
              <AlertTriangle size={13} />
              <div>
                <strong>当前是浏览器模式</strong>
                <div className="path-panel-warn-sub">
                  要真正保存到固定路径，请用 Electron 桌面版运行（<code>npm run dev</code>）。
                  浏览器中保存的目录设置不会生效，会回退到浏览器下载。
                </div>
              </div>
            </div>
          )}

          <div className="path-panel-row">
            <div className="path-panel-label">
              <span className="path-panel-step">1</span>
              <span>图片保存目录（PNG）</span>
            </div>
            <div className="path-panel-control">
              <div className="path-subdir-input">
                <ImageIcon size={13} className="path-subdir-icon" />
                <input
                  type="text"
                  className="path-input path-input-path"
                  value={props.imageDir}
                  onChange={(e) => props.onImageDirChange(e.target.value)}
                  placeholder={props.defaultImageDir}
                  spellCheck={false}
                />
                {props.isElectron && (
                  <button
                    className="path-input-action"
                    onClick={props.onPickImageDir}
                    title="选择其他目录"
                  >
                    <FolderInput size={12} />
                  </button>
                )}
                {imageChanged && (
                  <button
                    className="path-input-action"
                    onClick={() => props.onImageDirChange(props.defaultImageDir)}
                    title="恢复默认路径"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="path-panel-row">
            <div className="path-panel-label">
              <span className="path-panel-step">2</span>
              <span>代码保存目录（.mmd）</span>
            </div>
            <div className="path-panel-control">
              <div className="path-subdir-input">
                <FileCode2 size={13} className="path-subdir-icon" />
                <input
                  type="text"
                  className="path-input path-input-path"
                  value={props.mmdDir}
                  onChange={(e) => props.onMmdDirChange(e.target.value)}
                  placeholder={props.defaultMmdDir}
                  spellCheck={false}
                />
                {props.isElectron && (
                  <button
                    className="path-input-action"
                    onClick={props.onPickMmdDir}
                    title="选择其他目录"
                  >
                    <FolderInput size={12} />
                  </button>
                )}
                {mmdChanged && (
                  <button
                    className="path-input-action"
                    onClick={() => props.onMmdDirChange(props.defaultMmdDir)}
                    title="恢复默认路径"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="path-panel-hint">
            <Check size={11} />
            <span>
              桌面版（Electron）下文件直接写入磁盘。子目录不存在会自动创建。
              路径配置保存在浏览器 localStorage，应用内随时可改。
              {(imageChanged || mmdChanged) && (
                <button className="path-link" onClick={props.onResetDefaults}>
                  <RotateCcw size={10} />
                  恢复全部默认
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </header>
  );
}

/** 从完整路径中提取最后一段目录名（用于按钮徽章） */
function getDirName(fullPath: string): string {
  if (!fullPath) return '';
  const trimmed = fullPath.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}
