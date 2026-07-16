// 保存路径：通过 Electron IPC 调用主进程 fs 直接写文件
// 默认硬编码到 C:\Users\Cornex\Desktop\时序图draw，用户可在面板里修改

import { useCallback, useEffect, useState } from 'react';
import { svgToCroppedCanvas } from '../lib/exportPng';

const LS_IMAGE_DIR = 'mwf:imageDir';
const LS_MMD_DIR = 'mwf:mmdDir';
const LS_DEFAULT_ENABLED = 'mwf:defaultDirEnabled';

// === 硬编码默认路径（用户要求固定） ===
const DEFAULT_IMAGE_DIR = 'C:\\Users\\Cornex\\Desktop\\时序图draw\\图片';
const DEFAULT_MMD_DIR = 'C:\\Users\\Cornex\\Desktop\\时序图draw\\源码';

export interface ElectronAPI {
  isElectron: true;
  ensureDir: (p: string) => Promise<{ ok: true }>;
  writeText: (p: string, content: string) => Promise<{ ok: true; filePath: string }>;
  writeBinary: (p: string, dataUrl: string) => Promise<{ ok: true; filePath: string }>;
  readText: (p: string) => Promise<{ content: string; filePath: string; name: string }>;
  copyTextClipboard: (content: string) => Promise<{ ok: true }>;
  pickTextFile: () => Promise<{ content: string; filePath: string; name: string } | null>;
  pickDirectory: () => Promise<string | null>;
  listMmdDir: (p: string) => Promise<Array<{ name: string; path: string; size: number; mtime: number }>>;
  renameFile: (oldPath: string, newName: string) => Promise<{ ok: true; filePath: string; name: string }>;
  createMmdFile: (dirPath: string, fileName: string) => Promise<{ ok: true; filePath: string; name: string; size: number; mtime: number }>;
  importMmdFiles: (
    dirPath: string,
    files: Array<{ file: string; name: string; mermaid: string }>,
  ) => Promise<{
    ok: true;
    items: Array<{ name: string; filePath: string; content: string; action: 'created' | 'replaced'; folder: string }>;
    created: number;
    replaced: number;
  }>;
  deleteFile: (p: string) => Promise<{ ok: true }>;
  listDir: (p: string) => Promise<DirEntry[]>;
  createDir: (parentPath: string, dirName: string) => Promise<{ ok: true; filePath: string; name: string }>;
  renameDir: (oldPath: string, newName: string) => Promise<{ ok: true; filePath: string; name: string }>;
  deleteDir: (p: string) => Promise<{ ok: true }>;
  revealInFolder: (p: string) => Promise<{ ok: boolean }>;
  openExternal: (url: string) => Promise<{ ok: true }>;
  /** PNG dataURL → 系统剪贴板（仅支持 PNG，nativeImage 不支持 SVG） */
  copyPngClipboard: (dataUrl: string) => Promise<{ ok: true }>;
  /** 把 PNG dataURL 直接写入文件（无需 base64 ↔ dataURL 转换） */
  writePng: (filePath: string, dataUrl: string) => Promise<{ ok: true; filePath: string; size: number }>;
  /** 调用 Python + Playwright 把 SVG 字符串转成 PNG 文件（高清） */
  convertSvgToPng: (
    svgString: string,
    outputPath: string,
    scale: number,
  ) => Promise<{ ok: true; filePath: string; size: number; durationMs: number }>;
  /** 调用 Python 生成 PNG 并直接写入系统剪贴板（一次性 IPC，main 端清理临时文件） */
  copySvgAsPngToClipboard: (svgString: string, scale: number) => Promise<{ ok: true; durationMs: number }>;
  /** 检测 Python + Playwright 是否就绪 */
  checkPythonReady: () => Promise<{ ready: boolean; reason?: string; python?: string; script?: string }>;
}

export interface MmdFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

export interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  mtime: number;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
}

function joinPath(dir: string, filename: string): string {
  // 统一用 \ 拼接（Windows 路径）
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : dir.includes('/') ? '/' : '\\';
  if (dir.endsWith('\\') || dir.endsWith('/')) return dir + filename;
  return dir + sep + filename;
}

function readLS(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function useSaveSettings() {
  const [imageDir, setImageDir] = useState<string>(DEFAULT_IMAGE_DIR);
  const [mmdDir, setMmdDir] = useState<string>(DEFAULT_MMD_DIR);
  const [error, setError] = useState<string | null>(null);

  // 启动时从 localStorage 恢复用户自定义路径
  useEffect(() => {
    setImageDir(readLS(LS_IMAGE_DIR, DEFAULT_IMAGE_DIR));
    setMmdDir(readLS(LS_MMD_DIR, DEFAULT_MMD_DIR));
  }, []);

  const updateImageDir = useCallback((v: string) => {
    setImageDir(v);
    writeLS(LS_IMAGE_DIR, v);
  }, []);

  const updateMmdDir = useCallback((v: string) => {
    setMmdDir(v);
    writeLS(LS_MMD_DIR, v);
  }, []);

  const resetToDefault = useCallback(() => {
    updateImageDir(DEFAULT_IMAGE_DIR);
    updateMmdDir(DEFAULT_MMD_DIR);
    writeLS(LS_DEFAULT_ENABLED, '1');
  }, [updateImageDir, updateMmdDir]);

  /** 把 SVG 元素转换成 PNG dataURL（6x 缩放、智能裁剪白边） */
  const svgToDataUrl = useCallback(async (svgEl: SVGSVGElement, scale = 6): Promise<string> => {
    const canvas = await svgToCroppedCanvas(svgEl, scale);
    return canvas.toDataURL('image/png');
  }, []);

  /** 把 SVG 元素序列化成完整字符串（用于传给 Python） */
  const serializeSvg = useCallback((svgEl: SVGSVGElement): string => {
    return new XMLSerializer().serializeToString(svgEl);
  }, []);

  /**
   * 通过 Python + Playwright 把 SVG 转成 PNG 文件
   * @param svgString  完整的 SVG 文本
   * @param outputPath 目标 PNG 绝对路径
   * @param scale      缩放倍数，默认 8
   */
  const convertSvgToPngViaPython = useCallback(
    async (svgString: string, outputPath: string, scale = 8) => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用，请在桌面应用中运行');
      if (!api.convertSvgToPng) throw new Error('当前 Electron 版本不支持 Python 转换，请重启应用');
      return await api.convertSvgToPng(svgString, outputPath, scale);
    },
    [],
  );

  /** Python 环境就绪状态（懒检测） */
  const [pythonReady, setPythonReady] = useState<boolean | null>(null);
  const [pythonError, setPythonError] = useState<string | null>(null);

  /** 检测 Python 是否就绪 */
  const checkPython = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.checkPythonReady) {
      setPythonReady(false);
      setPythonError('当前 Electron 版本不支持 Python 检测');
      return false;
    }
    try {
      const res = await api.checkPythonReady();
      setPythonReady(res.ready);
      setPythonError(res.ready ? null : (res.reason ?? 'Python 未就绪'));
      return res.ready;
    } catch (e) {
      setPythonReady(false);
      setPythonError((e as Error).message);
      return false;
    }
  }, []);

  /** 启动时自动检测一次 Python */
  useEffect(() => {
    if (isElectron()) {
      void checkPython();
    }
  }, [checkPython]);

  /** 保存 PNG 到 imageDir：优先 Python（更高清），失败回退 canvas */
  const savePng = useCallback(
    async (svgEl: SVGSVGElement, filename: string): Promise<string> => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用，请在桌面应用中运行');
      const filePath = joinPath(imageDir, filename);
      // 优先走 Python
      if (api.convertSvgToPng && pythonReady !== false) {
        try {
          const svgString = serializeSvg(svgEl);
          const result = await api.convertSvgToPng(svgString, filePath, 8);
          return result.filePath;
        } catch (e) {
          // Python 失败：回退 canvas 方案
          console.warn('[savePng] Python 转换失败，回退 canvas:', e);
          const dataUrl = await svgToDataUrl(svgEl, 6);
          const result = await api.writePng(filePath, dataUrl);
          return result.filePath;
        }
      }
      // 直接走 canvas
      const dataUrl = await svgToDataUrl(svgEl, 6);
      const result = await api.writePng(filePath, dataUrl);
      return result.filePath;
    },
    [imageDir, svgToDataUrl, serializeSvg, pythonReady],
  );

  /** 保存 Mermaid 文本到 mmdDir（用文件名拼路径） */
  const saveMmd = useCallback(
    async (filename: string, content: string): Promise<string> => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用，请在桌面应用中运行');
      const filePath = joinPath(mmdDir, filename);
      const result = await api.writeText(filePath, content);
      return result.filePath;
    },
    [mmdDir],
  );

  /** 覆盖写入到指定绝对路径（用于"保存到当前文件"） */
  const saveMmdToPath = useCallback(async (filePath: string, content: string): Promise<string> => {
    const api = window.electronAPI;
    if (!api) throw new Error('Electron API 不可用，请在桌面应用中运行');
    const result = await api.writeText(filePath, content);
    return result.filePath;
  }, []);

  /** 保存 SVG 矢量图到图片目录（真正的无损，矢量） */
  const saveSvg = useCallback(
    async (filename: string, svgString: string): Promise<string> => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用，请在桌面应用中运行');
      const filePath = joinPath(imageDir, filename);
      const result = await api.writeText(filePath, svgString);
      return result.filePath;
    },
    [imageDir],
  );

  /** 弹出原生目录选择器（兜底） */
  const pickDirectory = useCallback(async (target: 'image' | 'mmd'): Promise<string | null> => {
    const api = window.electronAPI;
    if (!api) return null;
    const dir = await api.pickDirectory();
    if (!dir) return null;
    if (target === 'image') updateImageDir(dir);
    else updateMmdDir(dir);
    return dir;
  }, [updateImageDir, updateMmdDir]);

  /** 在资源管理器中显示文件 */
  const revealInFolder = useCallback(async (filePath: string) => {
    const api = window.electronAPI;
    if (!api) return;
    await api.revealInFolder(filePath);
  }, []);

  /** 列出 mmdDir 下的所有 .mmd 文件 */
  const listMmdDir = useCallback(async (): Promise<MmdFile[]> => {
    const api = window.electronAPI;
    if (!api) return [];
    return await api.listMmdDir(mmdDir);
  }, [mmdDir]);

  /** 重命名文件 */
  const renameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用');
      return await api.renameFile(oldPath, newName);
    },
    [],
  );

  /** 新建空 .mmd 文件（默认在 mmdDir 根，可指定目录） */
  const createMmdFile = useCallback(
    async (fileName: string, dirPath?: string) => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用');
      const targetDir = dirPath ?? mmdDir;
      return await api.createMmdFile(targetDir, fileName);
    },
    [mmdDir],
  );

  /** 删除文件 */
  const deleteFile = useCallback(async (filePath: string) => {
    const api = window.electronAPI;
    if (!api) throw new Error('Electron API 不可用');
    return await api.deleteFile(filePath);
  }, []);

  /** 列出任意目录下的文件和文件夹 */
  const listDir = useCallback(async (dirPath: string): Promise<DirEntry[]> => {
    const api = window.electronAPI;
    if (!api) return [];
    return await api.listDir(dirPath);
  }, []);

  /** 在指定目录下创建新文件夹 */
  const createDir = useCallback(async (parentPath: string, dirName: string) => {
    const api = window.electronAPI;
    if (!api) throw new Error('Electron API 不可用');
    return await api.createDir(parentPath, dirName);
  }, []);

  /** 重命名文件夹 */
  const renameDir = useCallback(async (oldPath: string, newName: string) => {
    const api = window.electronAPI;
    if (!api) throw new Error('Electron API 不可用');
    return await api.renameDir(oldPath, newName);
  }, []);

  /** 删除文件夹 */
  const deleteDir = useCallback(async (dirPath: string) => {
    const api = window.electronAPI;
    if (!api) throw new Error('Electron API 不可用');
    return await api.deleteDir(dirPath);
  }, []);

  /**
   * 复制 PNG 到系统剪贴板：优先 Python 生成（更清晰），失败回退 canvas
   * Python 流程（一次性 IPC，main 端负责临时文件/剪贴板/清理）：
   *   SVG 字符串 → Python 写临时 PNG → nativeImage 读 PNG → 写剪贴板 → 删临时文件
   */
  const copyPng = useCallback(
    async (svgEl: SVGSVGElement): Promise<void> => {
      const api = window.electronAPI;
      if (!api) throw new Error('Electron API 不可用，请在桌面应用中运行');
      // 优先走 Python
      if (api.copySvgAsPngToClipboard && pythonReady !== false) {
        try {
          const svgString = serializeSvg(svgEl);
          await api.copySvgAsPngToClipboard(svgString, 8);
          return;
        } catch (e) {
          console.warn('[copyPng] Python 复制失败，回退 canvas:', e);
          const dataUrl = await svgToDataUrl(svgEl, 6);
          await api.copyPngClipboard(dataUrl);
        }
      } else {
        const dataUrl = await svgToDataUrl(svgEl, 6);
        await api.copyPngClipboard(dataUrl);
      }
    },
    [svgToDataUrl, serializeSvg, pythonReady],
  );

  return {
    isElectron: isElectron(),
    imageDir,
    mmdDir,
    defaultImageDir: DEFAULT_IMAGE_DIR,
    defaultMmdDir: DEFAULT_MMD_DIR,
    error,
    setError,
    updateImageDir,
    updateMmdDir,
    resetToDefault,
    svgToDataUrl,
    savePng,
    saveMmd,
    saveMmdToPath,
    saveSvg,
    copyPng,
    pickDirectory,
    revealInFolder,
    listMmdDir,
    renameFile,
    createMmdFile,
    deleteFile,
    listDir,
    createDir,
    renameDir,
    deleteDir,
    // Python 高清渲染
    pythonReady,
    pythonError,
    checkPython,
  };
}
