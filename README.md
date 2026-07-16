# Mermaid Desk

Mermaid Desk 是一个本地优先的 Mermaid 桌面编辑器。它将源码编辑、实时预览、文件管理和高清导出放在同一个工作区中，适合持续维护流程图、时序图和其他 Mermaid 图表。

## 功能

- Mermaid 11 实时渲染与语法错误提示
- CodeMirror 源码编辑器和常用图表示例
- 本地 `.mmd` 文件树，支持子目录、新建、重命名和删除
- 文件修改后自动保存，未打开文件时保存为本地草稿
- 多文件勾选并以 JSON 格式复制 Mermaid 源码，便于提交给 AI
- 在实时预览中直接点击文字进行修改
- 实时预览缩放、平移、适应窗口和全屏显示
- 文件栏、源码区和预览区支持折叠与拖拽调整宽度
- 导出 SVG、PNG，以及复制 PNG 到系统剪贴板
- Electron 桌面能力不可用时自动使用浏览器下载方案

## 技术栈

- React 18 + TypeScript
- Vite 5
- Electron 32
- Mermaid 11
- CodeMirror 6
- Lucide React

## 开发运行

需要 Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动 Vite 开发服务器和 Electron 桌面窗口。

只启动 Web 开发页面：

```bash
npm run dev:vite
```

## 构建

生成生产环境文件：

```bash
npm run build
```

构建 Windows 安装版和便携版：

```bash
npm run package:win
```

输出目录为 `release/`。

## 高清 PNG

桌面版会优先调用 `convert_svg_to_png.py`，通过 Playwright 和 Chromium 生成高分辨率 PNG；环境不可用时会自动回退到浏览器 Canvas。

可选 Python 环境：

```bash
pip install playwright pillow pywin32
playwright install chromium
```

`pillow` 和 `pywin32` 仅用于 Python 脚本的 Windows 剪贴板功能。

## 多文件复制格式

在文件栏勾选一个或多个 `.mmd` 文件后，点击顶部复制按钮会生成：

```json
{
  "files": [
    {
      "name": "example.mmd",
      "mermaid": "sequenceDiagram\n    A->>B: Hello"
    }
  ]
}
```

JSON 不包含本机绝对路径，可以直接粘贴给 AI。

## 项目结构

```text
electron/                Electron 主进程与预加载脚本
src/components/          编辑器、预览、文件树和工具栏
src/hooks/               保存设置与桌面 API 封装
src/lib/                 Mermaid 渲染、导出和源码修改
src/data/                内置 Mermaid 示例
convert_svg_to_png.py    Playwright 高清 PNG 转换工具
```

## 数据与文件

- 编辑草稿、主题和保存目录配置保存在 `localStorage`。
- 桌面版可以在顶部保存位置设置中修改图片与 `.mmd` 文件目录。
- `node_modules/`、`dist/`、`release/` 和本地缓存不会提交到 Git。
