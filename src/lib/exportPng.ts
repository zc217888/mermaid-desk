// 用 SVG 原生 getBBox() 获取实际内容边界，再按内容尺寸生成独立画布。

/** 获取整个 SVG 的内容包围盒，而不是只取第一个 <g>。 */
function getContentBounds(svgClone: SVGSVGElement): { x: number; y: number; w: number; h: number } | null {
  try {
    const bbox = svgClone.getBBox();
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
  let vx = 0;
  let vy = 0;
  let vw = 0;
  let vh = 0;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      [vx, vy, vw, vh] = parts;
    }
  }
  if (!vw || !vh) {
    vw = parseFloat(cloned.getAttribute('width') || '0');
    vh = parseFloat(cloned.getAttribute('height') || '0');
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

  // 2. 按实际内容确定新的 SVG viewBox。不同图表会得到不同输出尺寸。
  const pad = 8;
  let cx: number, cy: number, cw: number, ch: number;
  if (contentBounds && contentBounds.w > 0 && contentBounds.h > 0) {
    cx = contentBounds.x - pad;
    cy = contentBounds.y - pad;
    cw = contentBounds.w + pad * 2;
    ch = contentBounds.h + pad * 2;
  } else {
    cx = vx; cy = vy; cw = vw; ch = vh;
  }

  cw = Math.max(1, cw);
  ch = Math.max(1, ch);
  cloned.setAttribute('viewBox', `${cx} ${cy} ${cw} ${ch}`);
  cloned.setAttribute('width', String(cw));
  cloned.setAttribute('height', String(ch));

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

    // Chromium Canvas 有尺寸和内存上限。超长图自动降低倍率，但保留内容比例。
    const maxDimension = 16_384;
    const maxArea = 64_000_000;
    const dimensionScale = Math.min(maxDimension / cw, maxDimension / ch);
    const areaScale = Math.sqrt(maxArea / (cw * ch));
    const outputScale = Math.max(0.1, Math.min(scale, dimensionScale, areaScale));

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.ceil(cw * outputScale));
    out.height = Math.max(1, Math.ceil(ch * outputScale));
    const o = out.getContext('2d')!;
    o.fillStyle = '#ffffff';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(img, 0, 0, out.width, out.height);
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

/** 缩略采样检查 Canvas 是否包含非白色内容，防止把纯白图当作成功结果。 */
export function canvasHasVisibleContent(canvas: HTMLCanvasElement): boolean {
  const sample = document.createElement('canvas');
  sample.width = 64;
  sample.height = 64;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let visiblePixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 20 && (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245)) {
      visiblePixels += 1;
      if (visiblePixels >= 4) return true;
    }
  }
  return false;
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
