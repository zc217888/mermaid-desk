// 解析 Mermaid 节点 / 簇等元素的文本，并提供源码替换能力。

export interface ParsedNodeText {
  /** 节点/元素的原始文本（包含前缀 ID 与括号，例如 A[用户访问]） */
  raw: string;
  /** 节点 ID（如 A、B1） */
  id: string;
  /** 节点标签（去除括号） */
  label: string;
  /** 整行内容（用于定位行号） */
  line: string;
  /** 行号索引（0-based） */
  lineIndex: number;
  /** 在源码中开始 / 结束的字符位置 */
  start: number;
  end: number;
}

/**
 * 在 Mermaid 源码中查找第一次出现的「简单节点定义」，并返回该节点对应的
 * raw / id / label / line / start / end。支持的形状：
 *   A[label]  A(label)  A((label))  A{literal}  A>asym]  A[/trap/\] 等等
 * 仅匹配行的开头（允许前导空格），避免匹配边上的标签。
 */
export function findNodeAtPosition(
  code: string,
  rawText: string,
  label: string,
): ParsedNodeText | null {
  const trimmedRaw = rawText.trim();
  if (!trimmedRaw) return null;
  const lines = code.split('\n');
  let charIndex = 0;
  const targetLabel = label.trim();
  const targetRaw = trimmedRaw;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = charIndex;
    const lineEnd = charIndex + line.length;
    // 匹配行首（允许前导空格）:  ID(shapeLabel) 或  ID([shapeLabel])
    const re = /^\s*([A-Za-z_][\w-]*)\s*([\(\[\{][^()\[\]\{\}]*[\)\]\}]|\([\s\S]*?\)|\/[^\/]+\/\\|\\[.*?\\])/;
    const m = line.match(re);
    if (m) {
      const matched = m[0];
      const innerLabel = extractLabel(m[2]);
      // 优先按 label 匹配；其次按 raw 匹配
      const matchedLabel = innerLabel?.trim() ?? '';
      const matchedRaw = matched.trim();
      const isMatch =
        (targetLabel && matchedLabel === targetLabel) ||
        (targetRaw && (matchedRaw === targetRaw || matched.includes(targetLabel)));
      if (isMatch) {
        return {
          raw: matchedRaw,
          id: m[1],
          label: matchedLabel,
          line,
          lineIndex: i,
          start: lineStart + line.indexOf(matched),
          end: lineStart + line.indexOf(matched) + matched.length,
        };
      }
    }
    charIndex = lineEnd + 1; // +1 for \n
  }
  return null;
}

function extractLabel(bracketPart: string): string {
  // bracketPart 形如 [label]  (label)  {label}  /label/  \label\
  const trimmed = bracketPart.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  // 简单截断首尾字符
  if (
    (first === '[' && last === ']') ||
    (first === '(' && last === ')') ||
    (first === '{' && last === '}') ||
    (first === '/' && last === '/') ||
    (first === '\\' && last === '\\')
  ) {
    return trimmed.slice(1, -1);
  }
  // 形如 (([label])) 包裹
  return trimmed;
}

/**
 * 在指定位置处替换节点标签。保持节点 ID、括号风格不变。
 */
export function replaceNodeLabelAt(
  code: string,
  position: ParsedNodeText,
  newLabel: string,
): string {
  const lines = code.split('\n');
  const line = lines[position.lineIndex];
  // 在该行内找到节点的 ID + 括号部分
  const re = /^(\s*[A-Za-z_][\w-]*\s*)([\(\[\{][^()\[\]\{\}]*[\)\]\}]|\([\s\S]*?\)|\/[^\/]+\/\\|\\[.*?\\])(.*)$/;
  const m = line.match(re);
  if (!m) {
    // 简单字符串替换兜底
    return code.replace(position.raw, position.raw.replace(position.label, newLabel));
  }
  const [, idPart, bracketPart, rest] = m;
  const trimmedBracket = bracketPart.trim();
  const first = trimmedBracket[0];
  const last = trimmedBracket[trimmedBracket.length - 1];
  const quoteLabel = needsQuoting(newLabel);
  const wrapped = quoteLabel ? `${first}"${newLabel}"${last}` : `${first}${newLabel}${last}`;
  lines[position.lineIndex] = `${idPart}${wrapped}${rest}`;
  return lines.join('\n');
}

function needsQuoting(label: string): boolean {
  if (/[()\[\]{}#]/.test(label)) return true;
  if (label.includes('"')) return true;
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 按 Mermaid 渲染节点携带的 ID 精确修改标签。节点可以出现在行首，
 * 也可以出现在 `A[甲] --> B[乙]` 这类连线的任意位置。
 */
export function replaceNodeLabelById(
  code: string,
  nodeId: string,
  newLabel: string,
): string | null {
  if (!nodeId) return null;
  const id = escapeRegExp(nodeId);
  const shapes = [
    { re: `(\\[\\[)([\\s\\S]*?)(\\]\\])`, open: '[[', close: ']]' },
    { re: `(\\(\\()([\\s\\S]*?)(\\)\\))`, open: '((', close: '))' },
    { re: `(\\[\\()([\\s\\S]*?)(\\)\\])`, open: '[(', close: ')]' },
    { re: `(\\{\\{)([\\s\\S]*?)(\\}\\})`, open: '{{', close: '}}' },
    { re: `(\\[)([\\s\\S]*?)(\\])`, open: '[', close: ']' },
    { re: `(\\()([\\s\\S]*?)(\\))`, open: '(', close: ')' },
    { re: `(\\{)([\\s\\S]*?)(\\})`, open: '{', close: '}' },
    { re: `(>)([\\s\\S]*?)(\\])`, open: '>', close: ']' },
  ];

  for (const shape of shapes) {
    const re = new RegExp(`(^|[^\\w-])(${id})(\\s*)${shape.re}`, 'm');
    const match = re.exec(code);
    if (!match) continue;
    const prefix = match[1];
    const matchedId = match[2];
    const spacing = match[3];
    const label = needsQuoting(newLabel) ? `"${newLabel.replace(/"/g, '\\"')}"` : newLabel;
    const replacement = `${prefix}${matchedId}${spacing}${shape.open}${label}${shape.close}`;
    return code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length);
  }
  return null;
}

/**
 * 在源码中按字面替换第一个出现的 target 文本。
 * 用于普通文本（非结构化节点）的快速替换。
 */
export function replaceFirstOccurrence(code: string, target: string, replacement: string): string {
  const idx = code.indexOf(target);
  if (idx === -1) return code;
  return code.slice(0, idx) + replacement + code.slice(idx + target.length);
}
