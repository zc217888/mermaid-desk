// 用 SVG 原生 getBBox() 获取精确内容边界，瞬间完成，无需像素扫描
// scale 默认 6x。先按 viewBox 全尺寸渲染 → 裁剪到内容边界 → 高缩放倍率输出

/** 获取 SVG 内容的精确包围盒（基于 Mermaid 最外层 <g> 的 getBBox） */
function getContentBounds(svgClone: SVGSVGElement): { x: number; y: number; w: number; h: number } | null {
  try {
    const g = svgClone.querySelector('g');
    if (!g) return null;
    const bbox = g.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) return null;
    return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
  } catch {
    return null;
  }
}

/** 将 SVG 元素渲染为精确裁剪的高清 Canvas */
export async function svgToCroppedCanvas(
  svgEl: SVGSVGElement,
  scale = 6,
): Promise<HTMLCanvasElement> {
  const cloned = svgEl.cloneNode(true) as SVGSVGElement;

  const viewBox = cloned.getAttribute('viewBox');
  let vw = parseFloat(cloned.getAttribute('width') || '0');
  let vh = parseFloat(cloned.getAttribute('height') || '0');
  if ((!vw || !vh) && viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4) { vw = vw || parts[2]; vh = vh || parts[3]; }
  }
  if (!vw || !vh) {
    const rect = svgEl.getBoundingClientRect();
    vw = rect.width || 800;
    vh = rect.height || 600;
  }

  // 去掉页面上的变换，用 setAttribute 覆盖宽高让 getBBox 返回真实坐标
  cloned.setAttribute('width', String(vw));
  cloned.setAttribute('height', String(vh));
  cloned.removeAttribute('style');
  if (!cloned.getAttribute('xmlns')) cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // 1. 挂到 DOM（不可见）调用 getBBox 获取内容边界
  cloned.style.position = 'fixed';
  cloned.style.top = '-9999px';
  cloned.style.left = '-9999px';
  cloned.style.visibility = 'hidden';
  cloned.style.pointerEvents = 'none';
  document.body.appendChild(cloned);

  let contentBounds: { x: number; y: number; w: number; h: number } | null = null;
  try {
    contentBounds = getContentBounds(cloned);
  } finally {
    cloned.remove();
  }

  // 上面的样式只用于把测量副本隐藏在页面之外。序列化并交给 Image
  // 渲染前必须清除，否则生成的 SVG 自身仍带有 visibility:hidden，
  // 最终导出的 PNG 就会是一张纯白图。
  cloned.style.removeProperty('position');
  cloned.style.removeProperty('top');
  cloned.style.removeProperty('left');
  cloned.style.removeProperty('visibility');
  cloned.style.removeProperty('pointer-events');

  // 2. 确定裁剪区域（8px 内边距，但不超过 viewBox）
  const pad = 8;
  let cx: number, cy: number, cw: number, ch: number;
  if (contentBounds && contentBounds.w > 0 && contentBounds.h > 0) {
    cx = Math.max(0, contentBounds.x - pad);
    cy = Math.max(0, contentBounds.y - pad);
    cw = Math.min(vw - cx, contentBounds.w + pad * 2);
    ch = Math.min(vh - cy, contentBounds.h + pad * 2);
  } else {
    cx = 0; cy = 0; cw = vw; ch = vh;
  }

  // 3. 用 Image 渲染到 canvas
  const svgBlob = new Blob(
    [new XMLSerializer().serializeToString(cloned)],
    { type: 'image/svg+xml;charset=utf-8' },
  );
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('SVG → Image 失败'));
      img.src = url;
    });

    const out = document.createElement('canvas');
    out.width = Math.ceil(cw * scale);
    out.height = Math.ceil(ch * scale);
    const o = out.getContext('2d')!;
    o.fillStyle = '#ffffff';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(img, cx, cy, cw, ch, 0, 0, out.width, out.height);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgToPngBlob(svgEl: SVGSVGElement, scale = 6): Promise<Blob> {
  const canvas = await svgToCroppedCanvas(svgEl, scale);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

export async function copySvgAsPng(svgEl: SVGSVGElement): Promise<boolean> {
  try {
    const blob = await svgToPngBlob(svgEl, 6);
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (e) {
    console.error('复制 PNG 失败', e);
    return false;
  }
}

export function downloadPng(svgEl: SVGSVGElement, filename: string) {
  svgToPngBlob(svgEl, 6).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
