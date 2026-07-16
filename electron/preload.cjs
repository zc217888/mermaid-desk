// Preload 脚本：通过 contextBridge 把受限的 fs API 暴露给渲染进程
// 渲染进程只能调用这里暴露的方法，不能直接访问 Node API

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  /** 是否在 Electron 环境中运行 */
  isElectron: true,

  /** 递归创建目录 */
  ensureDir: (dirPath) => ipcRenderer.invoke('ensure-dir', dirPath),

  /** 写入文本文件 */
  writeText: (filePath, content) => ipcRenderer.invoke('write-text', { filePath, content }),

  /** 写入二进制文件（PNG 等），dataUrl 形如 "data:image/png;base64,xxx" */
  writeBinary: (filePath, dataUrl) => ipcRenderer.invoke('write-binary', { filePath, base64: dataUrl }),

  /** 读取文本文件 */
  readText: (filePath) => ipcRenderer.invoke('read-text', filePath),

  /** 复制文本到系统剪贴板 */
  copyTextClipboard: (content) => ipcRenderer.invoke('copy-text-clipboard', content),

  /** 弹出文件选择对话框 */
  pickTextFile: () => ipcRenderer.invoke('pick-text-file'),

  /** 弹出目录选择对话框 */
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),

  /** 列出指定目录下的 .mmd 文件（按修改时间倒序） */
  listMmdDir: (dirPath) => ipcRenderer.invoke('list-mmd-dir', dirPath),

  /** 重命名文件 */
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', oldPath, newName),

  /** 新建空 .mmd 文件 */
  createMmdFile: (dirPath, fileName) => ipcRenderer.invoke('create-mmd-file', dirPath, fileName),

  /** 删除文件 */
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),

  /** 列出指定目录下的所有条目（文件 + 子目录） */
  listDir: (dirPath) => ipcRenderer.invoke('list-dir', dirPath),

  /** 创建目录 */
  createDir: (parentPath, dirName) => ipcRenderer.invoke('create-dir', parentPath, dirName),

  /** 重命名目录 */
  renameDir: (oldPath, newName) => ipcRenderer.invoke('rename-dir', oldPath, newName),

  /** 递归删除目录 */
  deleteDir: (dirPath) => ipcRenderer.invoke('delete-dir', dirPath),

  /** 在资源管理器中显示文件 */
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath),

  /** 打开外部链接 */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /** 把 PNG dataURL 写入磁盘文件（base64 → Buffer） */
  writePng: (filePath, dataUrl) => ipcRenderer.invoke('write-png', { filePath, dataUrl }),
  /** PNG dataURL → 系统剪贴板 */
  copyPngClipboard: (dataUrl) => ipcRenderer.invoke('copy-png-clipboard', dataUrl),

  /**
   * 调用 Python + Playwright 把 SVG 字符串转成 PNG
   * @param svgString  完整的 SVG 文本
   * @param outputPath PNG 绝对路径
   * @param scale      缩放倍数（默认 8）
   */
  convertSvgToPng: (svgString, outputPath, scale) =>
    ipcRenderer.invoke('convert-svg-to-png', { svgString, outputPath, scale }),

  /**
   * 调用 Python 生成 PNG 并直接写入系统剪贴板（一次性）
   * @param svgString 完整的 SVG 文本
   * @param scale     缩放倍数（默认 8）
   */
  copySvgAsPngToClipboard: (svgString, scale) =>
    ipcRenderer.invoke('copy-svg-as-png-to-clipboard', { svgString, scale }),

  /** 检测 Python + Playwright 是否就绪 */
  checkPythonReady: () => ipcRenderer.invoke('check-python-ready'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
