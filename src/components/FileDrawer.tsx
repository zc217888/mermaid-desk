// 左侧文件侧边栏（VSCode 风格 + 树形）
// 列出源码保存目录下的所有 .mmd 文件和子目录
// 文件夹可展开/收起；文件和文件夹都可重命名/删除/新建

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Files,
  Folder,
  FolderOpen,
  FileText,
  Plus,
  FolderPlus,
  RefreshCw,
  Clock,
  Inbox,
  Trash2,
  Edit3,
  Check,
  X,
  CornerDownRight,
  ClipboardCopy,
  ListChecks,
} from 'lucide-react';
import type { DirEntry } from '../hooks/useSaveSettings';

interface FileSidebarProps {
  mmdDir: string;
  isElectron: boolean;
  activeFileName?: string | null;
  activeFilePath?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLoad: (file: { name: string; path: string; content: string }) => void;
  onReveal?: (filePath: string) => void;
  onCopyContent?: (filePaths: string[]) => Promise<void>;
  onRename?: (oldPath: string, newName: string) => Promise<void>;
  onDelete?: (filePath: string) => Promise<void>;
  onCreate?: (fileName: string, dirPath?: string) => Promise<{ name: string; path: string } | null>;
  onCreateDir?: (parentPath: string, dirName: string) => Promise<{ name: string; path: string } | null>;
  onRenameDir?: (oldPath: string, newName: string) => Promise<{ name: string; path: string } | null>;
  onDeleteDir?: (dirPath: string) => Promise<void>;
  /** 每次保存后递增的信号，用于触发自动刷新 */
  refreshSignal?: number;
}

interface FlatNode {
  entry: DirEntry;
  depth: number;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  const d = new Date(ms);
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

export function FileSidebar({
  mmdDir,
  isElectron,
  activeFileName,
  activeFilePath,
  collapsed,
  onToggleCollapse,
  onLoad,
  onReveal,
  onCopyContent,
  onRename,
  onDelete,
  onCreate,
  onCreateDir,
  onRenameDir,
  onDeleteDir,
  refreshSignal = 0,
}: FileSidebarProps) {
  // 树形状态：每个目录路径 -> 子条目列表（dir 优先 + 文件）
  const [entries, setEntries] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([mmdDir]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // 编辑态：重命名
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const renamingTypeRef = useRef<'file' | 'dir' | null>(null);

  // 新建态：在某个目录下新建
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'dir' | null>(null);
  const [newName, setNewName] = useState('');

  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  /** 加载某个目录的子条目 */
  const loadDir = useCallback(
    async (dirPath: string) => {
      if (!isElectron || !window.electronAPI) return;
      setLoadingDirs((prev) => new Set(prev).add(dirPath));
      setError(null);
      try {
        const list = await window.electronAPI.listDir(dirPath);
        setEntries((prev) => ({ ...prev, [dirPath]: list }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      }
    },
    [isElectron],
  );

  /** 整树刷新：只刷新根目录 + 已展开的目录 */
  const refresh = useCallback(async () => {
    await loadDir(mmdDir);
    // 已展开的子目录也重新加载
    for (const p of expanded) {
      if (p !== mmdDir) await loadDir(p);
    }
  }, [mmdDir, expanded, loadDir]);

  // 初始化 + mmdDir 变更 → 重置 + 加载根
  useEffect(() => {
    setEntries({});
    setExpanded(new Set([mmdDir]));
    loadDir(mmdDir);
  }, [mmdDir, loadDir]);

  // refreshSignal 变化 → 刷新
  useEffect(() => {
    if (refreshSignal > 0) refresh();
  }, [refreshSignal, refresh]);

  // 自动聚焦
  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  useEffect(() => {
    if (creatingIn && createInputRef.current) {
      const input = createInputRef.current;
      input.focus();
      if (creatingType === 'file') {
        input.setSelectionRange(0, Math.max(0, input.value.length - 4));
      }
    }
  }, [creatingIn, creatingType]);

  /** 切换目录展开/收起 */
  const toggleExpand = useCallback(
    async (dirPath: string) => {
      const isOpen = expanded.has(dirPath);
      if (isOpen) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      } else {
        setExpanded((prev) => new Set(prev).add(dirPath));
        // 没加载过则加载
        if (!entries[dirPath]) {
          await loadDir(dirPath);
        }
      }
    },
    [expanded, entries, loadDir],
  );

  /** 展开整条路径（让活动文件可见） */
  useEffect(() => {
    if (!activeFilePath) return;
    const sep = activeFilePath.includes('\\') ? '\\' : '/';
    const parts = activeFilePath.split(/[\\/]/);
    if (parts.length <= 1) return;
    // 累积上级目录
    const ancestors: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      ancestors.push(parts.slice(0, i + 1).join(sep));
    }
    // mmdDir 是第一个祖先
    if (!ancestors.includes(mmdDir)) return;
    const toExpand = ancestors.filter((p) => p !== mmdDir);
    if (toExpand.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      toExpand.forEach((p) => next.add(p));
      return next;
    });
    // 加载这些目录
    toExpand.forEach((p) => {
      if (!entries[p]) loadDir(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilePath]);

  // ========== 文件操作 ==========
  const handleClickFile = useCallback(
    async (file: DirEntry) => {
      if (renamingPath === file.path) return;
      if (!isElectron || !window.electronAPI) return;
      setLoadingPath(file.path);
      try {
        const result = await window.electronAPI.readText(file.path);
        onLoad({ name: result.name, path: result.filePath, content: result.content });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingPath(null);
      }
    },
    [isElectron, onLoad, renamingPath],
  );

  const toggleSelected = useCallback((filePath: string) => {
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const collectFiles = async (dirPath: string): Promise<string[]> => {
        const children = await window.electronAPI!.listDir(dirPath);
        const nested = await Promise.all(children.map((entry) =>
          entry.type === 'file' ? [entry.path] : collectFiles(entry.path),
        ));
        return nested.flat();
      };
      const allPaths = await collectFiles(mmdDir);
      const allSelected = allPaths.length > 0 && allPaths.every((path) => selectedPaths.has(path));
      setSelectedPaths(allSelected ? new Set() : new Set(allPaths));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mmdDir, selectedPaths]);

  const startRename = useCallback(
    (entry: DirEntry) => {
      if (entry.type === 'file' && !onRename) return;
      if (entry.type === 'dir' && !onRenameDir) return;
      renamingTypeRef.current = entry.type;
      setRenamingPath(entry.path);
      // 文件默认去掉 .mmd 后缀
      const baseName = entry.type === 'file' ? entry.name.replace(/\.mmd$/i, '') : entry.name;
      setRenamingValue(baseName);
    },
    [onRename, onRenameDir],
  );

  const commitRename = useCallback(async () => {
    if (!renamingPath) return;
    const path = renamingPath;
    const val = renamingValue.trim();
    const type = renamingTypeRef.current;
    setRenamingPath(null);
    setRenamingValue('');
    renamingTypeRef.current = null;
    if (!val) return;
    try {
      if (type === 'dir' && onRenameDir) {
        await onRenameDir(path, val);
      } else if (type === 'file' && onRename) {
        const fullName = /\.mmd$/i.test(val) ? val : `${val}.mmd`;
        await onRename(path, fullName);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [renamingPath, renamingValue, onRename, onRenameDir]);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenamingValue('');
    renamingTypeRef.current = null;
  }, []);

  const handleDelete = useCallback(
    async (entry: DirEntry) => {
      const typeName = entry.type === 'dir' ? '文件夹' : '文件';
      if (entry.type === 'dir') {
        if (!onDeleteDir) return;
        if (
          !confirm(
            `确定要删除 ${typeName}「${entry.name}」吗？\n文件夹中的所有内容也会被删除，此操作不可恢复。`,
          )
        )
          return;
        try {
          await onDeleteDir(entry.path);
          setSelectedPaths((previous) => new Set(
            [...previous].filter((filePath) =>
              filePath !== entry.path &&
              !filePath.startsWith(`${entry.path}\\`) &&
              !filePath.startsWith(`${entry.path}/`),
            ),
          ));
          // 删除后收起该目录
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(entry.path);
            return next;
          });
        } catch (e) {
          setError((e as Error).message);
        }
      } else {
        if (!onDelete) return;
        if (!confirm(`确定要删除 ${typeName}「${entry.name}」吗？此操作不可恢复。`)) return;
        try {
          await onDelete(entry.path);
          setSelectedPaths((previous) => {
            const next = new Set(previous);
            next.delete(entry.path);
            return next;
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }
    },
    [onDelete, onDeleteDir],
  );

  // ========== 新建文件 / 文件夹 ==========
  const startCreate = useCallback(
    (parentDir: string, type: 'file' | 'dir') => {
      if (type === 'file' && !onCreate) return;
      if (type === 'dir' && !onCreateDir) return;
      // 确保父目录是展开的
      setExpanded((prev) => new Set(prev).add(parentDir));
      setCreatingIn(parentDir);
      setCreatingType(type);
      setNewName(type === 'file' ? '未命名.mmd' : '');
    },
    [onCreate, onCreateDir],
  );

  const commitCreate = useCallback(async () => {
    const rawName = newName.trim();
    const dir = creatingIn;
    const type = creatingType;
    setCreatingIn(null);
    setCreatingType(null);
    setNewName('');
    if (!dir || !type || !rawName) return;
    const name = type === 'file' && !rawName.toLowerCase().endsWith('.mmd')
      ? `${rawName}.mmd`
      : rawName;
    try {
      if (type === 'dir' && onCreateDir) {
        await onCreateDir(dir, name);
      } else if (type === 'file' && onCreate) {
        const result = await onCreate(name, dir);
        if (result && isElectron && window.electronAPI) {
          const loaded = await window.electronAPI.readText(result.path);
          onLoad({ name: loaded.name, path: loaded.filePath, content: loaded.content });
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [newName, creatingIn, creatingType, onCreate, onCreateDir, isElectron, onLoad]);

  const cancelCreate = useCallback(() => {
    setCreatingIn(null);
    setCreatingType(null);
    setNewName('');
  }, []);

  // ========== 渲染树 ==========
  // 把树扁平化为带 depth 的节点列表
  const flat: FlatNode[] = [];
  const walk = (dirPath: string, depth: number) => {
    const list = entries[dirPath] ?? [];
    for (const e of list) {
      flat.push({ entry: e, depth });
      if (e.type === 'dir' && expanded.has(e.path)) {
        walk(e.path, depth + 1);
      }
    }
  };
  walk(mmdDir, 0);

  const dirName = mmdDir.split(/[\\/]/).filter(Boolean).pop() ?? mmdDir;
  const rootEntry = entries[mmdDir] ?? [];
  const fileCount = (() => {
    let n = 0;
    const count = (list: DirEntry[]) => {
      for (const e of list) {
        if (e.type === 'file') n++;
        else if (entries[e.path]) count(entries[e.path]);
      }
    };
    count(rootEntry);
    return n;
  })();

  // ========== 折叠态 ==========
  if (collapsed) {
    return (
      <aside className="file-sidebar collapsed">
        <button
          className="file-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title="展开文件栏"
        >
          <ChevronRight size={14} />
        </button>
        <div className="file-sidebar-icons">
          <button
            className="file-sidebar-icon"
            onClick={onToggleCollapse}
            title="源码文件"
          >
            <Files size={16} />
            {fileCount > 0 && <span className="file-sidebar-icon-badge">{fileCount}</span>}
          </button>
          {onCreate && (
            <button
              className="file-sidebar-icon"
              onClick={() => startCreate(mmdDir, 'file')}
              title="新建文件"
            >
              <Plus size={16} />
            </button>
          )}
          {onCreateDir && (
            <button
              className="file-sidebar-icon"
              onClick={() => startCreate(mmdDir, 'dir')}
              title="新建文件夹"
            >
              <FolderPlus size={16} />
            </button>
          )}
        </div>
      </aside>
    );
  }

  if (!isElectron) {
    return (
      <aside className="file-sidebar">
        <div className="file-sidebar-header">
          <button
            className="file-sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title="折叠"
          >
            <ChevronLeft size={14} />
          </button>
          <Files size={13} />
          <span className="file-sidebar-title">源码文件</span>
        </div>
        <div className="file-sidebar-empty">
          <Inbox size={20} />
          <div>桌面版可查看保存目录</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="file-sidebar">
      <div className="file-sidebar-header">
        <Files size={13} />
        <span className="file-sidebar-title">源码</span>
        <span className="file-sidebar-count">{fileCount > 0 ? fileCount : ''}</span>
        <span className="file-sidebar-dir" title={mmdDir}>
          <FolderOpen size={10} />
          {dirName}
        </span>
        <div className="file-sidebar-header-actions">
          {onCopyContent && (
            <button
              className="file-sidebar-icon-btn"
              onClick={() => void toggleSelectAll()}
              title={selectedPaths.size > 0 ? '全选或取消全选' : '全选所有 MMD 文件'}
            >
              <ListChecks size={13} />
            </button>
          )}
          {onCopyContent && selectedPaths.size > 0 && (
            <button
              className="file-sidebar-icon-btn file-sidebar-copy-selected"
              onClick={() => void onCopyContent([...selectedPaths])}
              title={`复制已选 ${selectedPaths.size} 个文件为 JSON`}
            >
              <ClipboardCopy size={12} />
              <span>{selectedPaths.size}</span>
            </button>
          )}
          {onCreate && (
            <button
              className="file-sidebar-icon-btn"
              onClick={() => startCreate(mmdDir, 'file')}
              title="新建 .mmd 文件"
              disabled={creatingIn !== null}
            >
              <Plus size={13} />
            </button>
          )}
          {onCreateDir && (
            <button
              className="file-sidebar-icon-btn"
              onClick={() => startCreate(mmdDir, 'dir')}
              title="新建文件夹"
              disabled={creatingIn !== null}
            >
              <FolderPlus size={13} />
            </button>
          )}
          <button
            className="file-sidebar-icon-btn"
            onClick={refresh}
            title="刷新"
            disabled={loadingDirs.size > 0}
          >
            <RefreshCw
              size={12}
              className={loadingDirs.size > 0 ? 'spin' : ''}
            />
          </button>
          <button
            className="file-sidebar-icon-btn"
            onClick={onToggleCollapse}
            title="折叠侧边栏"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      <div className="file-sidebar-body">
        {error && <div className="file-sidebar-error">{error}</div>}

        {/* 根目录行（虚拟） */}
        <div
          className={`file-sidebar-item file-sidebar-item-folder root ${expanded.has(mmdDir) ? '' : 'collapsed'}`}
        >
          <button
            className="file-sidebar-chevron"
            onClick={() => toggleExpand(mmdDir)}
            title={expanded.has(mmdDir) ? '收起' : '展开'}
          >
            {loadingDirs.has(mmdDir) ? (
              <RefreshCw size={9} className="spin" />
            ) : expanded.has(mmdDir) ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
          </button>
          <span
            className="file-sidebar-item-name folder-name"
            onClick={() => toggleExpand(mmdDir)}
            title={mmdDir}
          >
            {expanded.has(mmdDir) ? (
              <FolderOpen size={12} className="file-sidebar-item-icon" />
            ) : (
              <Folder size={12} className="file-sidebar-item-icon" />
            )}
            {dirName}
          </span>
          <div className="file-sidebar-item-actions root-actions">
            {onCreate && (
              <button
                className="file-sidebar-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  startCreate(mmdDir, 'file');
                }}
                title="新建 .mmd 文件"
              >
                <Plus size={11} />
              </button>
            )}
            {onCreateDir && (
              <button
                className="file-sidebar-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  startCreate(mmdDir, 'dir');
                }}
                title="新建文件夹"
              >
                <FolderPlus size={11} />
              </button>
            )}
          </div>
        </div>

        {/* 新建输入行（根目录） */}
        {creatingIn === mmdDir && (
          <div
            className="file-sidebar-item file-sidebar-create-row"
            style={{ paddingLeft: 24 }}
          >
            {creatingType === 'dir' ? (
              <FolderPlus size={12} className="file-sidebar-create-icon" />
            ) : (
              <Plus size={12} className="file-sidebar-create-icon" />
            )}
            <input
              ref={createInputRef}
              type="text"
              className="file-sidebar-rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCreate();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
              onBlur={commitCreate}
              placeholder={creatingType === 'dir' ? '新建文件夹' : '未命名.mmd'}
              spellCheck={false}
            />
            <button
              className="file-sidebar-action-btn ok"
              onClick={commitCreate}
              title="创建"
            >
              <Check size={11} />
            </button>
            <button
              className="file-sidebar-action-btn cancel"
              onClick={cancelCreate}
              title="取消"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {rootEntry.length === 0 &&
          !loadingDirs.has(mmdDir) &&
          !error &&
          creatingIn !== mmdDir && (
            <div className="file-sidebar-empty">
              <Inbox size={20} />
              <div>还没有 .mmd 文件</div>
              <div className="file-sidebar-empty-sub">点 + 创建或点保存</div>
            </div>
          )}

        {/* 树形列表 */}
        <ul className="file-sidebar-list">
          {flat.map(({ entry, depth }) => {
            const isDir = entry.type === 'dir';
            const isOpen = isDir && expanded.has(entry.path);
            const isActive =
              !isDir &&
              (activeFilePath === entry.path ||
                (activeFileName != null && activeFileName === entry.name));
            const isLoading = loadingPath === entry.path;
            const isRenaming = renamingPath === entry.path;
            const indent = 8 + depth * 14;

            return (
              <li
                key={entry.path}
                className={[
                  'file-sidebar-item',
                  isDir ? 'file-sidebar-item-folder' : 'file-sidebar-item-file',
                  isActive ? 'active' : '',
                  selectedPaths.has(entry.path) ? 'selected' : '',
                  isLoading ? 'loading' : '',
                  isOpen ? 'expanded' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ paddingLeft: indent }}
                onClick={() => {
                  if (isRenaming || isLoading) return;
                  if (isDir) toggleExpand(entry.path);
                  else handleClickFile(entry);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  if (!isRenaming) startRename(entry);
                }}
                title={entry.path}
              >
                {isDir ? (
                  <button
                    className="file-sidebar-chevron"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(entry.path);
                    }}
                    title={isOpen ? '收起' : '展开'}
                  >
                    {loadingDirs.has(entry.path) ? (
                      <RefreshCw size={9} className="spin" />
                    ) : isOpen ? (
                      <ChevronDown size={10} />
                    ) : (
                      <ChevronRight size={10} />
                    )}
                  </button>
                ) : (
                  <span className="file-sidebar-chevron placeholder" />
                )}

                {!isDir && (
                  <input
                    type="checkbox"
                    className="file-sidebar-select"
                    checked={selectedPaths.has(entry.path)}
                    onChange={() => toggleSelected(entry.path)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`选择 ${entry.name}`}
                  />
                )}

                {isRenaming ? (
                  <>
                    <input
                      ref={renameInputRef}
                      type="text"
                      className="file-sidebar-rename-input"
                      value={renamingValue}
                      onChange={(e) => setRenamingValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={commitRename}
                      spellCheck={false}
                    />
                    <button
                      className="file-sidebar-action-btn ok"
                      onClick={(e) => {
                        e.stopPropagation();
                        commitRename();
                      }}
                      title="保存 (Enter)"
                    >
                      <Check size={11} />
                    </button>
                    <button
                      className="file-sidebar-action-btn cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelRename();
                      }}
                      title="取消 (Esc)"
                    >
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="file-sidebar-item-name">
                      {isDir ? (
                        isOpen ? (
                          <FolderOpen
                            size={12}
                            className="file-sidebar-item-icon"
                          />
                        ) : (
                          <Folder size={12} className="file-sidebar-item-icon" />
                        )
                      ) : (
                        <FileText size={12} className="file-sidebar-item-icon" />
                      )}
                      {entry.name}
                    </span>
                    {!isDir && (
                      <span className="file-sidebar-item-meta">
                        <span className="file-sidebar-item-size">
                          {formatSize(entry.size)}
                        </span>
                        <span className="file-sidebar-item-time">
                          <Clock size={9} />
                          {formatRelativeTime(entry.mtime)}
                        </span>
                      </span>
                    )}
                    <div className="file-sidebar-item-actions">
                      {!isDir && onCopyContent && (
                        <button
                          className="file-sidebar-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onCopyContent([entry.path]);
                          }}
                          title="复制内容给 AI"
                        >
                          <ClipboardCopy size={11} />
                        </button>
                      )}
                      {isDir && onCreate && (
                        <button
                          className="file-sidebar-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startCreate(entry.path, 'file');
                          }}
                          title="新建 .mmd 文件"
                        >
                          <Plus size={11} />
                        </button>
                      )}
                      {isDir && onCreateDir && (
                        <button
                          className="file-sidebar-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startCreate(entry.path, 'dir');
                          }}
                          title="新建文件夹"
                        >
                          <FolderPlus size={11} />
                        </button>
                      )}
                      <button
                        className="file-sidebar-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(entry);
                        }}
                        title="重命名"
                      >
                        <Edit3 size={11} />
                      </button>
                      {onReveal && (
                        <button
                          className="file-sidebar-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReveal(entry.path);
                          }}
                          title="在文件夹中显示"
                        >
                          <CornerDownRight size={11} />
                        </button>
                      )}
                      <button
                        className="file-sidebar-action-btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry);
                        }}
                        title={isDir ? '删除文件夹' : '删除'}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {/* 子目录中的新建输入行（非根） */}
        {creatingIn && creatingIn !== mmdDir && (
          <div
            className="file-sidebar-item file-sidebar-create-row"
            style={{ paddingLeft: 8 + (depthOf(creatingIn, entries, expanded, mmdDir) + 1) * 14 }}
          >
            {creatingType === 'dir' ? (
              <FolderPlus size={12} className="file-sidebar-create-icon" />
            ) : (
              <Plus size={12} className="file-sidebar-create-icon" />
            )}
            <input
              ref={createInputRef}
              type="text"
              className="file-sidebar-rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCreate();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
              onBlur={commitCreate}
              placeholder={creatingType === 'dir' ? '新建文件夹' : '未命名.mmd'}
              spellCheck={false}
            />
            <button
              className="file-sidebar-action-btn ok"
              onClick={commitCreate}
              title="创建"
            >
              <Check size={11} />
            </button>
            <button
              className="file-sidebar-action-btn cancel"
              onClick={cancelCreate}
              title="取消"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** 计算某目录在已展开树中的深度（0 = 根） */
function depthOf(
  target: string,
  entries: Record<string, DirEntry[]>,
  expanded: Set<string>,
  root: string,
): number {
  if (target === root) return 0;
  // 已知 entries 中子目录的 path，向上反推
  // 简单做法：迭代地从根展开直到找到 target
  const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }];
  const seen = new Set<string>([root]);
  while (queue.length) {
    const { path, depth } = queue.shift()!;
    const children = entries[path] ?? [];
    for (const c of children) {
      if (c.path === target) return depth + 1;
      if (c.type === 'dir' && expanded.has(c.path) && !seen.has(c.path)) {
        seen.add(c.path);
        queue.push({ path: c.path, depth: depth + 1 });
      }
    }
  }
  return 0;
}
