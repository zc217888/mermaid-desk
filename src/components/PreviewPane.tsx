import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle, ClipboardCopy, Download, Maximize2, Minus,
  Plus, RotateCcw, ScanSearch, Expand, Minimize2, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface PreviewPaneProps {
  svg: string;
  error: string | null;
  rendering: boolean;
  previewRef: RefObject<HTMLDivElement>;
  onCopyPng: () => void;
  onDownloadPng: () => void;
  /** 在图上直接修改节点的回调 */
  onNodeEdit?: (nodeId: string | null, oldLabel: string, newLabel: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface InlineEditState {
  nodeId: string | null;
  originalLabel: string;
  label: string;
  caretIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  multiline: boolean;
}

export function PreviewPane({
  svg,
  error,
  rendering,
  previewRef,
  onCopyPng,
  onDownloadPng,
  onNodeEdit,
  collapsed,
  onToggleCollapse,
}: PreviewPaneProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hoveringNode, setHoveringNode] = useState(false);
  const [editingNode, setEditingNode] = useState<InlineEditState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fitDoneRef = useRef(false);
  const editingNodeElRef = useRef<Element | null>(null);

  // 用 ref 持有实时状态，避免 setState 触发监听器重绑
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const editingRef = useRef(false);

  useEffect(() => {
    editingRef.current = !!editingNode;
  }, [editingNode]);

  // 计算合适的缩放比例
  const computeFit = useCallback((): number => {
    if (!contentRef.current) return 1;
    const svgEl = contentRef.current.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) return 1;
    const stage = previewRef.current;
    if (!stage) return 1;
    const rect = stage.getBoundingClientRect();
    const padding = 48;
    const naturalW =
      parseFloat(svgEl.getAttribute('width') || '0') || svgEl.getBoundingClientRect().width;
    const naturalH =
      parseFloat(svgEl.getAttribute('height') || '0') || svgEl.getBoundingClientRect().height;
    if (!naturalW || !naturalH) return 1;
    const fitW = (rect.width - padding) / naturalW;
    const fitH = (rect.height - padding) / naturalH;
    const fit = Math.min(1, fitW, fitH);
    return fit > 0 ? Number(fit.toFixed(3)) : 1;
  }, [previewRef]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === previewRef.current;
      setIsFullscreen(active);
      requestAnimationFrame(() => {
        const fit = computeFit();
        zoomRef.current = fit;
        setZoom(fit);
        panRef.current = { x: 0, y: 0 };
        setPan({ x: 0, y: 0 });
      });
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [computeFit, previewRef]);

  // 初始自动适配
  useEffect(() => {
    if (!svg || !contentRef.current) return;
    if (fitDoneRef.current) return;
    const fit = computeFit();
    zoomRef.current = fit;
    setZoom(fit);
    fitDoneRef.current = true;
  }, [svg, computeFit]);

  // 滚轮缩放 + 右键平移 —— document 级监听，依赖 ref 避免状态循环
  useLayoutEffect(() => {
    if (collapsed) return;
    const stage = previewRef.current;
    if (!stage) return;

    // 滚轮：在 document 上捕获，再过滤目标
    const onWheel = (e: WheelEvent) => {
      if (editingRef.current) return;
      const target = e.target as Node | null;
      if (!target || !stage.contains(target)) return;
      // 排除 FAB 区域
      if ((target as HTMLElement).closest?.('.preview-fab, .preview-hint, .inline-editor')) return;

      e.preventDefault();
      e.stopPropagation();
      // 兼容 deltaY（标准）和 detail（老式 mousewheel）
      const raw =
        e.deltaY !== 0
          ? e.deltaY
          : -((e as WheelEvent & { detail?: number }).detail ?? 0) * 10;
      const delta = -raw * 0.0025;
      const next = Math.max(0.1, Math.min(8, zoomRef.current + delta * zoomRef.current));
      zoomRef.current = Number(next.toFixed(3));
      setZoom(zoomRef.current);
    };

    // 阻止预览区内的右键菜单
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || !stage.contains(target)) return;
      if (editingRef.current) return;
      e.preventDefault();
    };

    // 右键按下：开始平移
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || !stage.contains(target)) return;
      if (editingRef.current) return;
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        isPanningRef.current = true;
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        setIsPanning(true);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current || !panStartRef.current) return;
      e.preventDefault();
      panRef.current = {
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
      };
      setPan({ ...panRef.current });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        setIsPanning(false);
      }
    };

    const onMouseLeave = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        setIsPanning(false);
      }
    };

    const onWindowBlur = () => {
      isPanningRef.current = false;
      panStartRef.current = null;
      setIsPanning(false);
    };

    // document 级监听，最稳
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('contextmenu', onContextMenu);
    stage.addEventListener('mousedown', onMouseDown);
    stage.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('contextmenu', onContextMenu);
      stage.removeEventListener('mousedown', onMouseDown);
      stage.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [collapsed, previewRef]);

  // 自动聚焦 inline editor
  useEffect(() => {
    if (editingNode && editTextareaRef.current) {
      const t = setTimeout(() => {
        const textarea = editTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(editingNode.caretIndex, editingNode.caretIndex);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editingNode?.nodeId]);

  // 点击编辑器外部 = 提交
  useEffect(() => {
    if (!editingNode) return;
    let active = true;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!active) return;
      const target = e.target as HTMLElement;
      if (target.closest('.inline-editor')) return;
      // 触发双击的是同一次事件，避免立即关闭：延迟处理
      setTimeout(() => commitEdit(), 0);
    };
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDocMouseDown);
    }, 50);
    return () => {
      active = false;
      clearTimeout(id);
      document.removeEventListener('mousedown', onDocMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNode]);

  const handleZoomIn = () => {
    const next = Math.min(zoom * 1.15, 8);
    zoomRef.current = next;
    setZoom(next);
  };
  const handleZoomOut = () => {
    const next = Math.max(zoom * 0.85, 0.1);
    zoomRef.current = next;
    setZoom(next);
  };
  const handleReset = () => {
    const fit = computeFit();
    zoomRef.current = fit;
    setZoom(fit);
    panRef.current = { x: 0, y: 0 };
    setPan({ x: 0, y: 0 });
    fitDoneRef.current = true;
  };

  const handleToggleFullscreen = async () => {
    const stage = previewRef.current;
    if (!stage) return;
    if (document.fullscreenElement === stage) await document.exitFullscreen();
    else await stage.requestFullscreen();
  };

  // 单击节点文字 → 像普通文本一样在点击位置进入编辑
  const handleNodeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as Element;
    const semanticEl = target.closest(
      [
        'g.node',
        'g.cluster',
        'g.note',
        '.edgeLabel',
        '.messageText',
        '.noteText',
        '.actor',
        '.labelText',
        '.loopText',
        '.titleText',
        '.sectionTitle',
      ].join(', '),
    );
    // 时序图的大部分可编辑内容是独立的 SVG <text>，没有 .node 容器。
    const nodeEl = semanticEl ?? target.closest('text, foreignObject');
    if (!nodeEl) return;

    const stage = previewRef.current;
    if (!stage) return;

    const labelEl = (target.closest(
      '.nodeLabel, .edgeLabel, .messageText, .noteText, .actor, .labelText, .loopText, text, p, foreignObject',
    ) ?? nodeEl.querySelector(
      '.nodeLabel, .messageText, .noteText, .actor, .labelText, .loopText, .label, foreignObject, text, p',
    )) as HTMLElement | null;
    let rawText = '';
    if (labelEl) rawText = (labelEl.textContent || '').trim();
    if (!rawText) rawText = (nodeEl.textContent || '').trim().split('\n')[0].trim();
    if (!rawText) return;

    const dataIdEl = target.closest('[data-id]') ?? nodeEl.closest('[data-id]');
    let nodeId = dataIdEl?.getAttribute('data-id')?.trim() || null;
    if (!nodeId) {
      const domId = nodeEl.getAttribute('id') || '';
      const flowchartId = domId.match(/^flowchart-(.+?)-\d+$/);
      nodeId = flowchartId?.[1] ?? null;
    }

    let label = rawText.trim();
    const hasBr = /<br\s*\/?>/i.test(label);
    const normalized = label.replace(/<br\s*\/?>/gi, '\n');

    const nodeRect = (labelEl ?? nodeEl).getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const lines = normalized.split('\n');
    const lineIndex = Math.max(
      0,
      Math.min(lines.length - 1, Math.floor(((e.clientY - nodeRect.top) / Math.max(nodeRect.height, 1)) * lines.length)),
    );
    const column = Math.max(
      0,
      Math.min(
        lines[lineIndex].length,
        Math.round(((e.clientX - nodeRect.left) / Math.max(nodeRect.width, 1)) * lines[lineIndex].length),
      ),
    );
    const caretIndex = lines.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0) + column;

    // 把正在编辑的 SVG 节点变淡，避免与 textarea 文字重叠
    editingNodeElRef.current?.classList.remove('inline-editing');
    const editedTextEl = labelEl ?? nodeEl;
    editedTextEl.classList.add('inline-editing');
    editingNodeElRef.current = editedTextEl;

    // 估算字体大小（编辑器不会被 transform 缩放，所以直接用视觉大小）
    let fontSize = 14;
    let fontFamily = 'Inter, system-ui, sans-serif';
    let fontWeight = '400';
    let color = 'var(--fg-primary)';
    if (labelEl) {
      const cs = getComputedStyle(labelEl);
      fontSize = parseFloat(cs.fontSize) || 14;
      fontFamily = cs.fontFamily || fontFamily;
      fontWeight = cs.fontWeight || fontWeight;
      color = cs.color || color;
    }
    const visualLineHeight = nodeRect.height / Math.max(lines.length, 1);
    fontSize = Math.max(9, Math.min(fontSize * zoom, visualLineHeight * 0.78));

    setEditingNode({
      nodeId,
      originalLabel: normalized,
      label: normalized,
      caretIndex,
      rect: {
        x: nodeRect.left - stageRect.left,
        y: nodeRect.top - stageRect.top,
        width: Math.max(nodeRect.width, 24),
        height: Math.max(nodeRect.height, 18),
      },
      fontSize,
      fontFamily,
      fontWeight,
      color,
      multiline: hasBr || normalized.includes('\n'),
    });
  };

  const commitEdit = useCallback(() => {
    setEditingNode((cur) => {
      if (!cur) return cur;
      const newLabel = cur.label;
      const oldLabel = cur.originalLabel;
      editingNodeElRef.current?.classList.remove('inline-editing');
      editingNodeElRef.current = null;
      if (newLabel.trim() && newLabel !== oldLabel) {
        onNodeEdit?.(cur.nodeId, oldLabel, newLabel);
      }
      return null;
    });
  }, [onNodeEdit]);

  const cancelEdit = useCallback(() => {
    editingNodeElRef.current?.classList.remove('inline-editing');
    editingNodeElRef.current = null;
    setEditingNode(null);
  }, []);

  // hover 检测（用于改变光标）
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) return;
    const target = e.target as Element;
    const isNode = target.closest(
      'g.node, g.cluster, g.note, .edgeLabel, .messageText, .noteText, .actor, .labelText, .loopText, .titleText, text, foreignObject',
    );
    setHoveringNode(!!isNode);
  };

  if (collapsed) {
    return (
      <aside className="panel panel-collapsed">
        <button className="panel-collapsed-button" onClick={onToggleCollapse} title="展开实时预览">
          <ChevronLeft size={14} />
        </button>
        <ScanSearch size={16} />
      </aside>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className={`panel-dot ${error ? 'red' : 'green'}`} />
        <span>实时预览</span>
        <div className="panel-actions">
          <button className="panel-action" onClick={onCopyPng} disabled={!svg}>
            <ClipboardCopy size={12} />
            复制图片
          </button>
          <button className="panel-action" onClick={onDownloadPng} disabled={!svg}>
            <Download size={12} />
            下载 PNG
          </button>
          <button className="panel-collapse-action" onClick={onToggleCollapse} title="折叠实时预览">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className={`preview-stage ${isPanning ? 'panning' : ''}`} ref={previewRef}>
        {!svg && !error && !rendering && (
          <div className="preview-empty">
            <div className="preview-empty-icon">
              <ScanSearch size={28} />
            </div>
            <div>在左侧输入 Mermaid 代码以开始</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>或点击右上角「示例」加载一个</div>
          </div>
        )}

        {error && !svg && (
          <div className="preview-error">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 600 }}>
              <AlertTriangle size={16} />
              <span>Mermaid 解析失败</span>
            </div>
            <div>{error}</div>
          </div>
        )}

        {svg && (
          <div
            className="preview-content"
            ref={contentRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              cursor: isPanning ? 'grabbing' : hoveringNode ? 'text' : 'default',
              pointerEvents: editingNode ? 'none' : 'auto',
            }}
            onClick={handleNodeClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveringNode(false)}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}

        {/* In-place 编辑器 */}
        {editingNode && (
          <div
            className="inline-editor"
            style={{
              left: editingNode.rect.x,
              top: editingNode.rect.y,
              width: editingNode.rect.width,
              height: editingNode.rect.height,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={editTextareaRef}
              className="inline-editor-textarea"
              value={editingNode.label}
              onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onWheel={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              style={{
                fontSize: `${editingNode.fontSize}px`,
                fontFamily: editingNode.fontFamily,
                fontWeight: editingNode.fontWeight,
                color: editingNode.color,
              }}
              rows={editingNode.multiline ? 3 : 1}
            />
          </div>
        )}

        {rendering && (
          <div className="preview-loading">
            <div className="preview-loading-bar" />
          </div>
        )}

        <div className="preview-fab">
          <div className="preview-zoom">
            <button onClick={handleZoomIn} title="放大 (滚轮上)">
              <Plus size={15} />
            </button>
            <button onClick={handleZoomOut} title="缩小 (滚轮下)">
              <Minus size={15} />
            </button>
            <button onClick={handleReset} title="适应窗口">
              <Maximize2 size={13} />
            </button>
            <div className="preview-zoom-label">{Math.round(zoom * 100)}%</div>
          </div>
          {svg && (
            <button
              className="btn btn-ghost preview-fullscreen-btn"
              onClick={() => void handleToggleFullscreen()}
              title={isFullscreen ? '退出全屏' : '实时预览全屏'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Expand size={15} />}
            </button>
          )}
          {svg && (
            <button
              className="btn"
              onClick={onDownloadPng}
              style={{ height: 40, padding: '0 14px', borderRadius: 12 }}
            >
              <Download size={15} />
              下载 PNG
            </button>
          )}
          {svg && (
            <button
              className="btn btn-ghost"
              onClick={handleReset}
              style={{ height: 40, padding: '0 12px', borderRadius: 12 }}
              title="重置视图"
            >
              <RotateCcw size={15} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
