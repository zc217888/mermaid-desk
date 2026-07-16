// Mermaid 渲染器 —— 封装最新版本 Mermaid 的初始化、渲染与错误处理
import mermaid, { type MermaidConfig } from 'mermaid';

export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral' | 'base';

let initialized = false;
let currentTheme: MermaidTheme = 'default';

const baseConfig: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
  themeVariables: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
  },
};

export function getMermaidVersion(): string {
  // mermaid@11 提供 VERSION
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mermaid as any).VERSION ?? (mermaid as any).version ?? 'unknown';
}

export function setMermaidTheme(theme: MermaidTheme) {
  currentTheme = theme;
  mermaid.initialize({
    ...baseConfig,
    theme: theme === 'base' ? 'base' : theme,
  });
  initialized = true;
}

export function ensureInitialized(theme: MermaidTheme = 'default') {
  if (!initialized || currentTheme !== theme) {
    setMermaidTheme(theme);
  }
}

export interface RenderResult {
  svg: string;
  bindFunctions?: (el: HTMLElement) => void;
}

export async function renderDiagram(code: string, id: string, theme: MermaidTheme): Promise<RenderResult> {
  ensureInitialized(theme);
  const { svg, bindFunctions } = await mermaid.render(id, code.trim());
  return { svg, bindFunctions };
}
