import { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { ChevronLeft, ChevronRight, Code2, Sparkles, Wand2 } from 'lucide-react';

interface EditorPaneProps {
  value: string;
  onChange: (v: string) => void;
  onMountExamples: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const editorTheme = EditorView.theme(
  {
    '&': { color: '#e6e9f5' },
    '.cm-content': { caretColor: '#7df9ff' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#7df9ff' },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(125, 249, 255, 0.18)',
    },
  },
  { dark: true },
);

export function EditorPane({
  value,
  onChange,
  onMountExamples,
  collapsed,
  onToggleCollapse,
}: EditorPaneProps) {
  const handleFormat = useCallback(() => {
    const formatted = value
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n')
      .replace(/\t/g, '  ');
    onChange(formatted);
  }, [value, onChange]);

  if (collapsed) {
    return (
      <aside className="panel panel-collapsed">
        <button className="panel-collapsed-button" onClick={onToggleCollapse} title="展开源码编辑区">
          <ChevronRight size={14} />
        </button>
        <Code2 size={16} />
      </aside>
    );
  }

  return (
    <section className="panel editor-panel">
      <div className="panel-header">
        <span className="panel-dot green" />
        <span>Mermaid 源码</span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>
          · 支持 flowchart / sequence / class / state / er / gantt / pie / journey / git / mindmap
        </span>
        <div className="panel-actions">
          <button className="panel-action" onClick={onMountExamples} title="加载示例">
            <Sparkles size={12} />
            示例
          </button>
          <button className="panel-collapse-action" onClick={onToggleCollapse} title="折叠源码编辑区">
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      <CodeMirror
        value={value}
        height="100%"
        theme={editorTheme}
        extensions={[javascript(), EditorView.lineWrapping]}
        onChange={(v) => onChange(v)}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          autocompletion: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
        placeholder="在此输入或粘贴 Mermaid 代码…"
        style={{ flex: 1, overflow: 'auto' }}
      />

      <div className="editor-toolbar">
        <Code2 size={13} />
        <span>支持 Mermaid 11 全量语法</span>
        <div className="editor-toolbar-spacer" />
        <button onClick={handleFormat}>
          <Wand2 size={12} />
          一键格式化
        </button>
      </div>
    </section>
  );
}
