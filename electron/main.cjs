// Electron 主进程：创建窗口、IPC、文件读写
// PNG 转换由外部 Python + Playwright 完成（接收 SVG 字符串，输出高质量 PNG）
// 主进程负责：写入文件 / 写入系统剪贴板（nativeImage） / 调用 Python 子进程

const { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');

const isDev = !app.isPackaged;
let mainWindow = null;

// ============== Python 脚本路径解析 ==============
// convert_svg_to_png.py 在项目根目录（main.cjs 的上一级）
const PYTHON_SCRIPT = path.join(__dirname, '..', 'convert_svg_to_png.py');

/** 尝试找到可用的 Python 可执行文件（按优先级） */
function findPython() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push('py', 'python', 'python3');
  } else {
    candidates.push('python3', 'python');
  }
  for (const cmd of candidates) {
    try {
      // 用 -c 快速检测是否可用
      const r = require('node:child_process').spawnSync(cmd, ['--version'], {
        stdio: 'ignore',
        timeout: 3000,
        windowsHide: true,
      });
      if (r.status === 0) return cmd;
    } catch {
      /* ignore */
    }
  }
  return null;
}

let _pythonCmd = null; // 懒加载：第一次调用时确定
function getPythonCmd() {
  if (_pythonCmd !== null) return _pythonCmd; // null = 已检测且没找到
  _pythonCmd = findPython();
  return _pythonCmd;
}

/** 对 nativeImage 做缩略像素采样，拒绝纯白或全透明图片。 */
function imageHasVisibleContent(image) {
  if (!image || image.isEmpty()) return false;
  const size = image.getSize();
  if (size.width <= 1 || size.height <= 1) return false;
  const sample = image.resize({ width: Math.min(64, size.width), quality: 'good' });
  const bitmap = sample.toBitmap();
  let visiblePixels = 0;
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    const alpha = bitmap[i + 3];
    if (alpha > 20 && (bitmap[i] < 245 || bitmap[i + 1] < 245 || bitmap[i + 2] < 245)) {
      visiblePixels += 1;
      if (visiblePixels >= 4) return true;
    }
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Mermaid Desk',
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 隐藏默认菜单栏（保留 Alt 键唤出）
  Menu.setApplicationMenu(null);

  // 调试模式下自动打开 DevTools
  if (isDev) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// =================== IPC Handlers ===================

/** 递归创建目录 */
ipcMain.handle('ensure-dir', async (_evt, dirPath) => {
  if (typeof dirPath !== 'string' || !dirPath) {
    throw new Error('路径无效');
  }
  await fsp.mkdir(dirPath, { recursive: true });
  return { ok: true };
});

/** 写入文本文件（用于 .mmd 源码） */
ipcMain.handle('write-text', async (_evt, { filePath, content }) => {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('路径无效');
  }
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf-8');
  return { ok: true, filePath };
});

/** 写入二进制文件（用于 PNG） */
ipcMain.handle('write-binary', async (_evt, { filePath, base64 }) => {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('路径无效');
  }
  // 兼容 "data:image/png;base64,xxx" 格式
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, buffer);
  return { ok: true, filePath };
});

/** 读取文本文件（用于加载 .mmd） */
ipcMain.handle('read-text', async (_evt, filePath) => {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('路径无效');
  }
  const content = await fsp.readFile(filePath, 'utf-8');
  return { content, filePath, name: path.basename(filePath) };
});

/** 复制文本到系统剪贴板 */
ipcMain.handle('copy-text-clipboard', async (_evt, content) => {
  if (typeof content !== 'string') throw new Error('复制内容无效');
  clipboard.writeText(content);
  return { ok: true };
});

/** 弹出文件选择对话框（用于加载 .mmd） */
ipcMain.handle('pick-text-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Mermaid 源文件',
    properties: ['openFile'],
    filters: [
      { name: 'Mermaid', extensions: ['mmd', 'md', 'txt'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await fsp.readFile(filePath, 'utf-8');
  return { content, filePath, name: path.basename(filePath) };
});

/** 弹出目录选择对话框（可选，作为兜底方案） */
ipcMain.handle('pick-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择保存目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/** 列出指定目录下的 .mmd 文件（按修改时间倒序） */
ipcMain.handle('list-mmd-dir', async (_evt, dirPath) => {
  if (typeof dirPath !== 'string' || !dirPath) {
    throw new Error('路径无效');
  }
  // 目录不存在则视为空列表
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const stat = await fsp.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error('不是目录：' + dirPath);
  }
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.mmd')) continue;
    const filePath = path.join(dirPath, entry.name);
    try {
      const st = await fsp.stat(filePath);
      items.push({
        name: entry.name,
        path: filePath,
        size: st.size,
        mtime: st.mtimeMs,
      });
    } catch {
      /* ignore */
    }
  }
  // 按修改时间倒序
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
});

/** 校验文件名：禁止路径分隔符与 Windows 非法字符 */
function sanitizeFileName(name) {
  if (typeof name !== 'string') throw new Error('文件名无效');
  let trimmed = name.trim();
  if (!trimmed) throw new Error('文件名不能为空');
  // 禁止 \ / : * ? " < > |
  if (/[\\\/:*?"<>|]/.test(trimmed)) {
    throw new Error('文件名包含非法字符：\\ / : * ? " < > |');
  }
  if (trimmed === '.' || trimmed === '..') throw new Error('文件名无效');
  // 自动补 .mmd 后缀
  if (!trimmed.toLowerCase().endsWith('.mmd')) {
    trimmed += '.mmd';
  }
  return trimmed;
}

/** 校验可选相对文件夹路径，禁止绝对路径和目录穿越 */
function sanitizeImportFolder(name) {
  if (name == null || name === '') return { relativePath: '', display: '' };
  if (typeof name !== 'string') throw new Error('file 必须是字符串');
  const trimmed = name.trim();
  if (!trimmed) return { relativePath: '', display: '' };
  if (/^[\\/]/.test(trimmed) || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error('file 只能使用相对文件夹路径');
  }
  const segments = trimmed.replace(/\\/g, '/').split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('file 文件夹路径无效');
  }
  if (segments.some((segment) => /[:*?"<>|]/.test(segment))) {
    throw new Error('file 包含非法字符：: * ? " < > |');
  }
  return { relativePath: path.join(...segments), display: segments.join('/') };
}

/** 重命名文件 */
ipcMain.handle('rename-file', async (_evt, oldPath, newName) => {
  if (typeof oldPath !== 'string' || !oldPath) throw new Error('原路径无效');
  if (!fs.existsSync(oldPath)) throw new Error('文件不存在：' + oldPath);
  const safeName = sanitizeFileName(newName);
  const newPath = path.join(path.dirname(oldPath), safeName);
  if (newPath === oldPath) return { ok: true, filePath: oldPath, name: safeName };
  if (fs.existsSync(newPath)) throw new Error('目标文件已存在：' + safeName);
  await fsp.rename(oldPath, newPath);
  return { ok: true, filePath: newPath, name: safeName };
});

/** 新建空 .mmd 文件 */
ipcMain.handle('create-mmd-file', async (_evt, dirPath, fileName) => {
  if (typeof dirPath !== 'string' || !dirPath) throw new Error('目录路径无效');
  await fsp.mkdir(dirPath, { recursive: true });
  const safeName = sanitizeFileName(fileName);
  const filePath = path.join(dirPath, safeName);
  if (fs.existsSync(filePath)) throw new Error('文件已存在：' + safeName);
  // 写入一个空字符串文件，UTF-8
  await fsp.writeFile(filePath, '', 'utf-8');
  const st = await fsp.stat(filePath);
  return {
    ok: true,
    filePath,
    name: safeName,
    size: st.size,
    mtime: st.mtimeMs,
  };
});

/** 批量导入 Mermaid JSON：同名覆盖，不存在则创建 */
ipcMain.handle('import-mmd-files', async (_evt, dirPath, files) => {
  if (typeof dirPath !== 'string' || !dirPath) throw new Error('目录路径无效');
  if (!Array.isArray(files) || files.length === 0) throw new Error('JSON 中没有可导入的文件');
  if (files.length > 200) throw new Error('单次最多导入 200 个文件');

  const seen = new Set();
  const normalized = files.map((file, index) => {
    if (!file || typeof file !== 'object') throw new Error(`第 ${index + 1} 项格式无效`);
    const name = sanitizeFileName(file.name);
    const folder = sanitizeImportFolder(file.file);
    if (typeof file.mermaid !== 'string') throw new Error(`${name} 的 mermaid 内容必须是字符串`);
    const key = `${folder.display.toLowerCase()}/${name.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`JSON 中存在重复目标：${folder.display ? `${folder.display}/` : ''}${name}`);
    seen.add(key);
    return { name, content: file.mermaid, folder };
  });

  const items = [];
  for (const file of normalized) {
    const targetDir = file.folder.relativePath ? path.join(dirPath, file.folder.relativePath) : dirPath;
    await fsp.mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, file.name);
    const action = fs.existsSync(filePath) ? 'replaced' : 'created';
    await fsp.writeFile(filePath, file.content, 'utf-8');
    items.push({ name: file.name, filePath, content: file.content, action, folder: file.folder.display });
  }
  return {
    ok: true,
    items,
    created: items.filter((item) => item.action === 'created').length,
    replaced: items.filter((item) => item.action === 'replaced').length,
  };
});

/** 删除文件（不进入回收站，直接删） */
ipcMain.handle('delete-file', async (_evt, filePath) => {
  if (typeof filePath !== 'string' || !filePath) throw new Error('路径无效');
  if (!fs.existsSync(filePath)) throw new Error('文件不存在：' + filePath);
  await fsp.unlink(filePath);
  return { ok: true };
});

/** 列出指定目录下的所有条目（文件 + 子目录），按目录优先 + 名称排序 */
ipcMain.handle('list-dir', async (_evt, dirPath) => {
  if (typeof dirPath !== 'string' || !dirPath) {
    throw new Error('路径无效');
  }
  if (!fs.existsSync(dirPath)) return [];
  const stat = await fsp.stat(dirPath);
  if (!stat.isDirectory()) throw new Error('不是目录：' + dirPath);
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    try {
      const st = await fsp.stat(full);
      items.push({
        name: entry.name,
        path: full,
        type: entry.isDirectory() ? 'dir' : 'file',
        size: entry.isDirectory() ? 0 : st.size,
        mtime: st.mtimeMs,
      });
    } catch {
      /* ignore */
    }
  }
  // 目录优先 + 名称排序（同类型内字典序）
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  return items;
});

/** 创建目录（递归创建多级） */
ipcMain.handle('create-dir', async (_evt, parentPath, dirName) => {
  if (typeof parentPath !== 'string' || !parentPath) throw new Error('父目录路径无效');
  if (typeof dirName !== 'string' || !dirName.trim()) throw new Error('文件夹名不能为空');
  if (/[\\\/:*?"<>|]/.test(dirName)) {
    throw new Error('文件夹名包含非法字符：\\ / : * ? " < > |');
  }
  if (dirName === '.' || dirName === '..') throw new Error('文件夹名无效');
  const newPath = path.join(parentPath, dirName);
  if (fs.existsSync(newPath)) throw new Error('目录已存在：' + dirName);
  await fsp.mkdir(newPath, { recursive: true });
  const st = await fsp.stat(newPath);
  return {
    ok: true,
    path: newPath,
    name: dirName,
    type: 'dir',
    size: 0,
    mtime: st.mtimeMs,
  };
});

/** 重命名目录（只能改最末级名） */
ipcMain.handle('rename-dir', async (_evt, oldPath, newName) => {
  if (typeof oldPath !== 'string' || !oldPath) throw new Error('原路径无效');
  if (typeof newName !== 'string' || !newName.trim()) throw new Error('新名称不能为空');
  if (/[\\\/:*?"<>|]/.test(newName)) {
    throw new Error('文件夹名包含非法字符：\\ / : * ? " < > |');
  }
  if (newName === '.' || newName === '..') throw new Error('文件夹名无效');
  if (!fs.existsSync(oldPath)) throw new Error('目录不存在：' + oldPath);
  const stat = await fsp.stat(oldPath);
  if (!stat.isDirectory()) throw new Error('不是目录：' + oldPath);
  const parent = path.dirname(oldPath);
  const newPath = path.join(parent, newName);
  if (newPath === oldPath) return { ok: true, filePath: oldPath, name: newName };
  if (fs.existsSync(newPath)) throw new Error('同名目录已存在：' + newName);
  await fsp.rename(oldPath, newPath);
  return { ok: true, filePath: newPath, name: newName };
});

/** 递归删除目录（含其中文件） */
ipcMain.handle('delete-dir', async (_evt, dirPath) => {
  if (typeof dirPath !== 'string' || !dirPath) throw new Error('路径无效');
  if (!fs.existsSync(dirPath)) throw new Error('目录不存在：' + dirPath);
  const stat = await fsp.stat(dirPath);
  if (!stat.isDirectory()) throw new Error('不是目录：' + dirPath);
  await fsp.rm(dirPath, { recursive: true, force: true });
  return { ok: true };
});

/** 在资源管理器中显示文件 */
ipcMain.handle('reveal-in-folder', async (_evt, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
    return { ok: true };
  }
  return { ok: false };
});

/** 打开外部链接 */
ipcMain.handle('open-external', async (_evt, url) => {
  const { shell } = require('electron');
  await shell.openExternal(url);
  return { ok: true };
});

/** 把 PNG dataURL 写入磁盘文件（base64 → Buffer） */
ipcMain.handle('write-png', async (_evt, { filePath, dataUrl }) => {
  if (typeof filePath !== 'string' || !filePath) throw new Error('filePath 无效');
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('dataUrl 必须是 data:image/png;base64,...');
  }
  const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  const image = nativeImage.createFromBuffer(buf);
  if (!imageHasVisibleContent(image)) throw new Error('拒绝保存空白 PNG');
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, buf);
  return { ok: true, filePath, size: buf.length };
});

/** PNG dataURL → 系统剪贴板（Electron 原生 API，绕过浏览器权限） */
ipcMain.handle('copy-png-clipboard', async (_evt, dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl) throw new Error('dataUrl 无效');
  const img = nativeImage.createFromDataURL(dataUrl);
  if (!imageHasVisibleContent(img)) throw new Error('拒绝复制空白 PNG');
  clipboard.clear();
  clipboard.writeImage(img);
  const copied = clipboard.readImage();
  if (copied.isEmpty()) throw new Error('系统剪贴板未能保存 PNG');
  const size = copied.getSize();
  if (size.width <= 1 || size.height <= 1) throw new Error('剪贴板中的 PNG 尺寸无效');
  return { ok: true, width: size.width, height: size.height };
});

/**
 * 调用 Python 脚本把 SVG 字符串转成 PNG 文件
 * @param svgString   - Mermaid 渲染出的完整 SVG 字符串
 * @param outputPath  - 目标 PNG 绝对路径
 * @param scale       - 缩放倍数（device_scale_factor），默认 8
 * @returns { ok, filePath, stdout, stderr, durationMs }
 */
ipcMain.handle('convert-svg-to-png', async (_evt, { svgString, outputPath, scale }) => {
  if (typeof svgString !== 'string' || !svgString.trim()) {
    throw new Error('svgString 无效');
  }
  if (typeof outputPath !== 'string' || !outputPath) {
    throw new Error('outputPath 无效');
  }
  if (!fs.existsSync(PYTHON_SCRIPT)) {
    throw new Error('找不到 Python 脚本：' + PYTHON_SCRIPT);
  }
  const py = getPythonCmd();
  if (!py) {
    throw new Error('找不到可用的 Python（请先安装 Python 3 并加入 PATH）');
  }
  // 确保输出目录存在
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  // 删除可能存在的旧文件，避免误判"成功"
  try { await fsp.unlink(outputPath); } catch { /* ignore */ }

  const scaleN = Number.isInteger(scale) && scale > 0 ? scale : 8;
  const args = [PYTHON_SCRIPT, '--stdin', '-o', outputPath, '-s', String(scaleN), '--quiet'];
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(py, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8:replace' },
    });
    let stdout = '';
    let stderr = '';
    let killed = false;

    // 超时保护：60 秒
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error('Python 转换超时（60s）'));
    }, 60_000);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error('无法启动 Python：' + err.message));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return; // 已被超时分支处理
      if (code === 0 && fs.existsSync(outputPath)) {
        const image = nativeImage.createFromPath(outputPath);
        if (!imageHasVisibleContent(image)) {
          try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
          reject(new Error('Python 生成了空白 PNG，已拒绝保存'));
          return;
        }
        const size = fs.statSync(outputPath).size;
        resolve({
          ok: true,
          filePath: outputPath,
          size,
          stdout: stdout.trim(),
          durationMs: Date.now() - start,
        });
      } else {
        const tail = (stderr || stdout).trim().split(/\r?\n/).slice(-5).join('\n');
        reject(new Error(`Python 退出码 ${code}：${tail || '未知错误'}`));
      }
    });

    // 把 SVG 写入 stdin，然后关闭输入
    try {
      child.stdin.write(svgString, 'utf-8');
      child.stdin.end();
    } catch (e) {
      clearTimeout(timer);
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('写入 stdin 失败：' + e.message));
    }
  });
});

/** 检查 Python + Playwright 是否就绪 */
ipcMain.handle('check-python-ready', async () => {
  const py = getPythonCmd();
  if (!py) {
    return { ready: false, reason: '找不到 Python（请安装 Python 3 并加入 PATH）' };
  }
  return { ready: true, python: py, script: PYTHON_SCRIPT };
});

/**
 * 调用 Python 生成 PNG 并直接写入系统剪贴板（一次性 IPC）
 * 流程：SVG → 临时 PNG 文件 → nativeImage 读取 → 写剪贴板 → 删除临时文件
 */
ipcMain.handle('copy-svg-as-png-to-clipboard', async (_evt, { svgString, scale }) => {
  if (typeof svgString !== 'string' || !svgString.trim()) {
    throw new Error('svgString 无效');
  }
  if (!fs.existsSync(PYTHON_SCRIPT)) {
    throw new Error('找不到 Python 脚本：' + PYTHON_SCRIPT);
  }
  const py = getPythonCmd();
  if (!py) {
    throw new Error('找不到可用的 Python（请先安装 Python 3 并加入 PATH）');
  }
  const scaleN = Number.isInteger(scale) && scale > 0 ? scale : 8;

  // 临时 PNG 路径
  const tempDir = app.getPath('temp');
  await fsp.mkdir(tempDir, { recursive: true });
  const tempPng = path.join(tempDir, `mermaid-clipboard-${Date.now()}.png`);

  const args = [PYTHON_SCRIPT, '--stdin', '-o', tempPng, '-s', String(scaleN), '--quiet'];
  const start = Date.now();

  try {
    // 1) 调用 Python 生成临时 PNG
    await new Promise((resolve, reject) => {
      const child = spawn(py, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8:replace' },
      });
      let stderr = '';
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        reject(new Error('Python 转换超时（60s）'));
      }, 60_000);
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error('无法启动 Python：' + err.message));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (killed) return;
        if (code === 0 && fs.existsSync(tempPng)) resolve();
        else {
          const tail = stderr.trim().split(/\r?\n/).slice(-3).join('\n');
          reject(new Error(`Python 退出码 ${code}：${tail || '未知错误'}`));
        }
      });
      try {
        child.stdin.write(svgString, 'utf-8');
        child.stdin.end();
      } catch (e) {
        clearTimeout(timer);
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error('写入 stdin 失败：' + e.message));
      }
    });

    // 2) 读 PNG 写到剪贴板
    const img = nativeImage.createFromPath(tempPng);
    if (!imageHasVisibleContent(img)) throw new Error('Python 生成了空白 PNG，已拒绝复制');
    clipboard.clear();
    clipboard.writeImage(img);
    const copied = clipboard.readImage();
    if (copied.isEmpty()) throw new Error('系统剪贴板未能保存 PNG');
    const size = copied.getSize();
    return { ok: true, durationMs: Date.now() - start, width: size.width, height: size.height };
  } finally {
    // 3) 清理临时文件
    try { await fsp.unlink(tempPng); } catch { /* ignore */ }
  }
});
