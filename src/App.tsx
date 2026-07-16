import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { examples } from './data/examples';
import { renderDiagram, type MermaidTheme } from './lib/mermaid';
import { copySvgAsPng, downloadPng } from './lib/exportPng';
import { downloadTextFile } from './lib/fileIO';
import { replaceFirstOccurrence, replaceNodeLabelById } from './lib/sourceEdit';
import { useSaveSettings } from './hooks/useSaveSettings';
import { TopBar } from './components/TopBar';
import { EditorPane } from './components/EditorPane';
import { PreviewPane } from './components/PreviewPane';
import { StatusBar } from './components/StatusBar';
import { ExamplesModal } from './components/ExamplesModal';
import { ImportJsonModal } from './components/ImportJsonModal';
import { FileSidebar } from './components/FileDrawer';
import { Toast, useToast } from './components/Toast';
import './styles/app.css';

const DEFAULT_CODE = examples[0].code;
const STORAGE_KEYS = {
  code: 'mwf:code',
  theme: 'mwf:theme',
  lastSaved: 'mwf:lastSavedAt',
};

function loadInitial(): { code: string; theme: MermaidTheme } {
  let code = DEFAULT_CODE;
  let theme: MermaidTheme = 'default';
  try {
    const savedCode = localStorage.getItem(STORAGE_KEYS.code);
    if (savedCode && savedCode.trim().length > 0) code = savedCode;
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) as MermaidTheme | null;
    if (savedTheme && ['default', 'dark', 'forest', 'neutral', 'base'].includes(savedTheme)) {
      theme = savedTheme;
    }
  } catch {
    /* localStorage 不可用 */
  }
  return { code, theme };
}

export default function App() {
  const initial = useMemo(loadInitial, []);
  const [code, setCode] = useState<string>(initial.code);
  const [theme, setTheme] = useState<MermaidTheme>(initial.theme);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    Number(localStorage.getItem(STORAGE_KEYS.lastSaved) || 0) || null,
  );
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [importJsonOpen, setImportJsonOpen] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileRefreshSignal, setFileRefreshSignal] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [editorWidth, setEditorWidth] = useState(() => Math.max(360, Math.floor((window.innerWidth - 330) / 2)));
  const renderIdRef = useRef(0);
  const autoSaveRevisionRef = useRef(0);
  const { toast, push } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);

  const save = useSaveSettings();

  const beginPanelResize = useCallback(
    (target: 'sidebar' | 'editor', event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const startX = event.clientX;
      const startSidebar = sidebarWidth;
      const startEditor = editorWidth;
      const totalWidth = workspace.getBoundingClientRect().width;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        if (target === 'sidebar') {
          const max = Math.max(180, totalWidth - startEditor - 340);
          setSidebarWidth(Math.max(180, Math.min(max, startSidebar + delta)));
        } else {
          const max = Math.max(280, totalWidth - startSidebar - 340);
          setEditorWidth(Math.max(280, Math.min(max, startEditor + delta)));
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [editorWidth, sidebarWidth],
  );

  // 当前文件有内容修改时自动覆盖保存；没有活动文件时由草稿自动保存兜底。
  useEffect(() => {
    if (!save.isElectron || !activeFilePath) return;
    const revision = ++autoSaveRevisionRef.current;
    const timer = setTimeout(async () => {
      try {
        if (revision !== autoSaveRevisionRef.current) return;
        await save.saveMmdToPath(activeFilePath, code);
        if (revision !== autoSaveRevisionRef.current) return;
        const now = Date.now();
        setLastSavedAt(now);
        try {
          localStorage.setItem(STORAGE_KEYS.lastSaved, String(now));
        } catch {
          /* ignore */
        }
        setFileRefreshSignal((value) => value + 1);
      } catch (e) {
        if (revision === autoSaveRevisionRef.current) {
          push({ type: 'error', text: `自动保存失败：${(e as Error).message}` });
        }
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [activeFilePath, code, push, save.isElectron, save.saveMmdToPath]);

  // 主题持久化
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // 自动保存草稿
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.code, code);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [code]);

  // 实时渲染
  useEffect(() => {
    if (!code.trim()) {
      setSvg('');
      setError('请输入 Mermaid 代码');
      return;
    }
    const timer = setTimeout(async () => {
      const myId = ++renderIdRef.current;
      setRendering(true);
      try {
        const { svg: rendered } = await renderDiagram(code, `mermaid-svg-${myId}`, theme);
        if (myId === renderIdRef.current) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (myId === renderIdRef.current) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setSvg('');
        }
      } finally {
        if (myId === renderIdRef.current) setRendering(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [code, theme]);

  const handleCopyPng = useCallback(async () => {
    const svgEl = previewRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) {
      push({ type: 'warn', text: '暂无可复制的图表' });
      return;
    }
    // 桌面版：优先 Python + Playwright（更高清），失败回退 canvas
    if (save.isElectron) {
      try {
        await save.copyPng(svgEl);
        const tag = save.pythonReady ? '（Python 8x 高清）' : '（6x 高清）';
        push({ type: 'success', text: `PNG ${tag}已复制到剪贴板` });
        return;
      } catch (e) {
        push({ type: 'error', text: `复制失败：${(e as Error).message}` });
        return;
      }
    }
    // 网页版：浏览器 Clipboard API
    const ok = await copySvgAsPng(svgEl);
    if (ok) {
      push({ type: 'success', text: 'PNG 已复制到剪贴板' });
    } else {
      push({ type: 'warn', text: '剪贴板权限被拒，已改为下载 PNG' });
      downloadPng(svgEl, `mermaid-${Date.now()}`);
    }
  }, [save, push]);

  // 保存 PNG：走 Electron IPC 直接写入固定目录（优先 Python 高清，失败回退 canvas）
  const handleDownloadPng = useCallback(async () => {
    const svgEl = previewRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) {
      push({ type: 'warn', text: '暂无可下载的图表' });
      return;
    }
    const filename = `mermaid-${Date.now()}.png`;
    if (save.isElectron) {
      try {
        const filePath = await save.savePng(svgEl, filename);
        const now = Date.now();
        setLastSavedAt(now);
        try {
          localStorage.setItem(STORAGE_KEYS.lastSaved, String(now));
        } catch {
          /* ignore */
        }
        const tag = save.pythonReady ? '（Python 8x）' : '（6x）';
        push({ type: 'success', text: `已保存 ${tag}：${filePath}` });
        // 自动在资源管理器中显示新文件
        save.revealInFolder(filePath).catch(() => {});
        return;
      } catch (e) {
        push({ type: 'error', text: `保存失败：${(e as Error).message}` });
        return;
      }
    }
    // 浏览器兜底
    downloadPng(svgEl, filename);
    push({ type: 'info', text: '已下载到浏览器默认位置' });
  }, [save, push]);

  // 保存 SVG 矢量图：真正的无损（任何缩放都不失真）
  const handleDownloadSvg = useCallback(async () => {
    const svgEl = previewRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) {
      push({ type: 'warn', text: '暂无可下载的图表' });
      return;
    }
    const filename = `mermaid-${Date.now()}.svg`;
    const svgString = new XMLSerializer().serializeToString(svgEl);
    if (save.isElectron) {
      try {
        const filePath = await save.saveSvg(filename, svgString);
        const now = Date.now();
        setLastSavedAt(now);
        try {
          localStorage.setItem(STORAGE_KEYS.lastSaved, String(now));
        } catch {
          /* ignore */
        }
        push({ type: 'success', text: `SVG 已保存到 ${filePath}` });
        save.revealInFolder(filePath).catch(() => {});
        return;
      } catch (e) {
        push({ type: 'error', text: `保存失败：${(e as Error).message}` });
        return;
      }
    }
    // 浏览器兜底
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    push({ type: 'info', text: 'SVG 已下载' });
  }, [save, push]);

  // 保存代码：优先覆盖到当前文件；没有当前文件才新建
  const handleSaveCode = useCallback(async () => {
    if (save.isElectron) {
      try {
        let filePath: string;
        let filename: string;
        if (activeFilePath) {
          // 有当前文件 → 覆盖到原路径
          filePath = await save.saveMmdToPath(activeFilePath, code);
          filename = activeFileName ?? activeFilePath.split(/[\\/]/).pop() ?? 'untitled.mmd';
        } else {
          // 没有当前文件 → 在源码目录创建新文件
          filename = `mermaid-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mmd`;
          filePath = await save.saveMmd(filename, code);
          setActiveFileName(filename);
          setActiveFilePath(filePath);
        }
        const now = Date.now();
        setLastSavedAt(now);
        try {
          localStorage.setItem(STORAGE_KEYS.lastSaved, String(now));
        } catch {
          /* ignore */
        }
        setFileRefreshSignal((s) => s + 1);
        push({ type: 'success', text: `已保存到 ${filename}` });
        return;
      } catch (e) {
        push({ type: 'error', text: `保存失败：${(e as Error).message}` });
        return;
      }
    }
    // 浏览器兜底
    const filename = `mermaid-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mmd`;
    downloadTextFile(code, filename);
    const now = Date.now();
    setLastSavedAt(now);
    try {
      localStorage.setItem(STORAGE_KEYS.lastSaved, String(now));
    } catch {
      /* ignore */
    }
    push({ type: 'info', text: '已下载到浏览器默认位置' });
  }, [code, save, push, activeFilePath, activeFileName]);

  // 从文件抽屉加载
  const handleLoadFromDrawer = useCallback(
    (file: { name: string; path: string; content: string }) => {
      setCode(file.content);
      setActiveFileName(file.name);
      setActiveFilePath(file.path);
      try {
        localStorage.setItem(STORAGE_KEYS.code, file.content);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // 重命名文件
  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      const result = await save.renameFile(oldPath, newName);
      setFileRefreshSignal((s) => s + 1);
      // 如果重命名的是当前活动文件，更新活动文件名
      if (activeFilePath === oldPath) {
        setActiveFileName(result.name);
        setActiveFilePath(result.filePath);
      }
    },
    [save, activeFilePath],
  );

  // 删除文件
  const handleDelete = useCallback(
    async (filePath: string) => {
      await save.deleteFile(filePath);
      setFileRefreshSignal((s) => s + 1);
      // 如果删除的是当前活动文件，清空活动状态
      if (activeFilePath === filePath) {
        setActiveFileName(null);
        setActiveFilePath(null);
      }
    },
    [save, activeFilePath],
  );

  // 新建文件（默认在源码根目录，可指定父目录）
  const handleCreate = useCallback(
    async (fileName: string, dirPath?: string) => {
      const result = await save.createMmdFile(fileName, dirPath);
      setFileRefreshSignal((s) => s + 1);
      return { name: result.name, path: result.filePath };
    },
    [save],
  );

  const handleCopyFileContent = useCallback(
    async (filePaths: string[]) => {
      try {
        if (filePaths.length === 0) return;
        const files = await Promise.all(filePaths.map(async (filePath) => ({
          name: filePath.split(/[\\/]/).pop() ?? '未命名.mmd',
          mermaid: activeFilePath === filePath
            ? code
            : (await window.electronAPI!.readText(filePath)).content,
        })));
        const content = JSON.stringify({ files }, null, 2);
        if (window.electronAPI?.copyTextClipboard) {
          await window.electronAPI.copyTextClipboard(content);
        } else {
          await navigator.clipboard.writeText(content);
        }
        push({ type: 'success', text: `已复制 ${files.length} 个 MMD 文件的 JSON，可直接粘贴给 AI` });
      } catch (e) {
        push({ type: 'error', text: `复制失败：${(e as Error).message}` });
      }
    },
    [activeFilePath, code, push],
  );

  const handleImportJson = useCallback(
    async (text: string) => {
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('JSON 格式无效');
      }
      if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { files?: unknown }).files)) {
        throw new Error('JSON 必须包含 files 数组');
      }
      const rawFiles = (payload as { files: unknown[] }).files;
      if (rawFiles.length === 0) throw new Error('files 数组不能为空');
      const files = rawFiles.map((file, index) => {
        if (!file || typeof file !== 'object') throw new Error(`第 ${index + 1} 项格式无效`);
        const { name, mermaid } = file as { name?: unknown; mermaid?: unknown };
        if (typeof name !== 'string' || !name.trim()) throw new Error(`第 ${index + 1} 项缺少文件名`);
        if (typeof mermaid !== 'string') throw new Error(`${name} 缺少 mermaid 字符串`);
        return { name: name.trim(), mermaid };
      });
      const api = window.electronAPI;
      if (!api?.importMmdFiles) throw new Error('当前桌面版本不支持 JSON 导入');

      // 取消尚未执行的旧内容自动保存，避免它覆盖刚导入的文件。
      autoSaveRevisionRef.current += 1;
      const result = await api.importMmdFiles(save.mmdDir, files);
      const activeItem = result.items.find((item) => item.filePath === activeFilePath);
      if (activeItem) setCode(activeItem.content);
      setFileRefreshSignal((value) => value + 1);
      push({
        type: 'success',
        text: `导入完成：新建 ${result.created} 个，覆盖 ${result.replaced} 个`,
      });
    },
    [activeFilePath, push, save.mmdDir],
  );

  // 新建文件夹
  const handleCreateDir = useCallback(
    async (parentPath: string, dirName: string) => {
      const result = await save.createDir(parentPath, dirName);
      setFileRefreshSignal((s) => s + 1);
      return { name: result.name, path: result.filePath };
    },
    [save],
  );

  // 重命名文件夹
  const handleRenameDir = useCallback(
    async (oldPath: string, newName: string) => {
      const result = await save.renameDir(oldPath, newName);
      setFileRefreshSignal((s) => s + 1);
      // 如果重命名的是当前活动文件所在目录，活动文件路径要更新
      if (activeFilePath && activeFilePath.startsWith(oldPath)) {
        const tail = activeFilePath.slice(oldPath.length);
        setActiveFilePath(result.filePath + tail);
      }
      return { name: result.name, path: result.filePath };
    },
    [save, activeFilePath],
  );

  // 删除文件夹
  const handleDeleteDir = useCallback(
    async (dirPath: string) => {
      await save.deleteDir(dirPath);
      setFileRefreshSignal((s) => s + 1);
      // 如果删除的是当前活动文件所在目录，清空活动状态
      if (activeFilePath && activeFilePath.startsWith(dirPath)) {
        setActiveFileName(null);
        setActiveFilePath(null);
      }
    },
    [save, activeFilePath],
  );

  // 加载代码：优先用 Electron 原生对话框
  const handleLoadCode = useCallback(async () => {
    if (save.isElectron && window.electronAPI) {
      const file = await window.electronAPI.pickTextFile();
      if (!file) return;
      setCode(file.content);
      setActiveFileName(file.name);
      setActiveFilePath(file.filePath);
      push({ type: 'success', text: `已加载 ${file.name}` });
      return;
    }
    // 浏览器兜底
    const { pickTextFile } = await import('./lib/fileIO');
    const file = await pickTextFile();
    if (!file) return;
    setCode(file.content);
    push({ type: 'success', text: `已加载 ${file.name}` });
  }, [push]);

  const handleClear = useCallback(() => {
    if (code.trim().length === 0) return;
    if (confirm('确认清空当前编辑内容？此操作不可撤销。')) {
      setCode('');
      push({ type: 'info', text: '已清空' });
    }
  }, [code, push]);

  const handlePickExample = useCallback(
    (ex: (typeof examples)[number]) => {
      setCode(ex.code);
      setExamplesOpen(false);
      push({ type: 'info', text: `已加载示例：${ex.name}` });
    },
    [push],
  );

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      push({ type: 'success', text: '代码已复制' });
    } catch {
      push({ type: 'warn', text: '剪贴板权限被拒' });
    }
  }, [code, push]);

  const handleFormat = useCallback(() => {
    const formatted = code
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n')
      .replace(/\t/g, '  ');
    setCode(formatted);
    push({ type: 'info', text: '已格式化' });
  }, [code, push]);

  // 双击节点 → 直接修改
  const handleNodeEdit = useCallback(
    (nodeId: string | null, oldLabel: string, newLabel: string) => {
      const byId = nodeId ? replaceNodeLabelById(code, nodeId, newLabel) : null;
      const next = byId ?? replaceFirstOccurrence(code, oldLabel, newLabel);
      setCode(next);
    },
    [code],
  );

  return (
    <div className="app-shell">
      <TopBar
        theme={theme}
        onThemeChange={setTheme}
        onOpenExamples={() => setExamplesOpen(true)}
        onSave={handleSaveCode}
        onLoad={handleLoadCode}
        onCopyPng={handleCopyPng}
        onDownloadPng={handleDownloadPng}
        onDownloadSvg={handleDownloadSvg}
        onCopyCode={handleCopyCode}
        onFormat={handleFormat}
        onClear={handleClear}
        imageDir={save.imageDir}
        mmdDir={save.mmdDir}
        defaultImageDir={save.defaultImageDir}
        defaultMmdDir={save.defaultMmdDir}
        isElectron={save.isElectron}
        onImageDirChange={save.updateImageDir}
        onMmdDirChange={save.updateMmdDir}
        onPickImageDir={() => save.pickDirectory('image')}
        onPickMmdDir={() => save.pickDirectory('mmd')}
        onResetDefaults={save.resetToDefault}
      />
      <main
        className="workspace"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        data-editor-collapsed={editorCollapsed ? 'true' : 'false'}
        data-preview-collapsed={previewCollapsed ? 'true' : 'false'}
        ref={workspaceRef}
        style={{
          '--sidebar-width': `${sidebarWidth}px`,
          '--editor-width': `${editorWidth}px`,
          gridTemplateColumns: [
            `${sidebarCollapsed ? 44 : sidebarWidth}px`,
            sidebarCollapsed ? '0' : '6px',
            previewCollapsed && !editorCollapsed
              ? 'minmax(280px, 1fr)'
              : `${editorCollapsed ? 44 : editorWidth}px`,
            editorCollapsed || previewCollapsed ? '0' : '6px',
            previewCollapsed ? '44px' : 'minmax(280px, 1fr)',
          ].join(' '),
        } as CSSProperties}
      >
        <FileSidebar
          mmdDir={save.mmdDir}
          isElectron={save.isElectron}
          activeFileName={activeFileName}
          activeFilePath={activeFilePath}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onLoad={handleLoadFromDrawer}
          onReveal={save.revealInFolder}
          onCopyContent={handleCopyFileContent}
          onOpenImport={() => setImportJsonOpen(true)}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onCreateDir={handleCreateDir}
          onRenameDir={handleRenameDir}
          onDeleteDir={handleDeleteDir}
          refreshSignal={fileRefreshSignal}
        />
        <div
          className="panel-resizer sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={(event) => beginPanelResize('sidebar', event)}
        />
        <section className="editor-section">
          <EditorPane
            value={code}
            onChange={setCode}
            onMountExamples={() => setExamplesOpen(true)}
            collapsed={editorCollapsed}
            onToggleCollapse={() => setEditorCollapsed((value) => !value)}
          />
        </section>
        <div
          className="panel-resizer editor-resizer"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={(event) => beginPanelResize('editor', event)}
        />
        <PreviewPane
          svg={svg}
          error={error}
          rendering={rendering}
          previewRef={previewRef}
          onCopyPng={handleCopyPng}
          onDownloadPng={handleDownloadPng}
          onNodeEdit={handleNodeEdit}
          collapsed={previewCollapsed}
          onToggleCollapse={() => setPreviewCollapsed((value) => !value)}
        />
      </main>
      <StatusBar
        charCount={code.length}
        lineCount={code.split('\n').length}
        lastSavedAt={lastSavedAt}
        error={error}
        rendering={rendering}
        imageDir={save.imageDir}
        mmdDir={save.mmdDir}
        isElectron={save.isElectron}
        pythonReady={save.pythonReady}
        pythonError={save.pythonError}
      />
      {examplesOpen && <ExamplesModal onClose={() => setExamplesOpen(false)} onPick={handlePickExample} />}
      {importJsonOpen && (
        <ImportJsonModal onClose={() => setImportJsonOpen(false)} onImport={handleImportJson} />
      )}
      <Toast toast={toast} />
    </div>
  );
}
