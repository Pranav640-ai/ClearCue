import { isDisabledControl, isHidden } from "../scanner/dom";

/**
 * Reconstruct a small, passive inline SVG icon from geometry. No DOM clone,
 * image URL, style sheet, screenshot, or browser resource is loaded.
 */
const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 96;

function number(element: Element, attribute: string, fallback = 0): number {
  const value = element.getAttribute(attribute);
  if (value === null) return fallback;
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()) && Math.abs(Number(value)) <= 4096
    ? Number(value) : NaN;
}

function asPath(element: Element): Path2D | null {
  const path = new Path2D();
  const coordinates = (...keys: string[]) => keys.map((key) => number(element, key));
  switch (element.localName) {
    case "path": {
      const data = element.getAttribute("d") ?? "";
      if (data.length === 0 || data.length > 1600 || !/^[MmZzLlHhVvCcSsQqTtAaEe\d.,+\s-]+$/.test(data)) return null;
      return new Path2D(data);
    }
    case "circle": {
      const [cx = NaN, cy = NaN, r = NaN] = coordinates("cx", "cy", "r");
      if (![cx, cy, r].every(Number.isFinite) || r <= 0) return null;
      path.arc(cx, cy, r, 0, Math.PI * 2);
      return path;
    }
    case "line": {
      const [x1 = NaN, y1 = NaN, x2 = NaN, y2 = NaN] = coordinates("x1", "y1", "x2", "y2");
      if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
      return path;
    }
    case "polyline":
    case "polygon": {
      const value = element.getAttribute("points")?.trim() ?? "";
      if (!value || value.length > 400) return null;
      const points = value.split(/[\s,]+/).map(Number);
      if (points.length < 4 || points.length % 2 || points.some((p) => !Number.isFinite(p) || Math.abs(p) > 4096)) return null;
      path.moveTo(points[0] ?? 0, points[1] ?? 0);
      for (let index = 2; index < points.length; index += 2) path.lineTo(points[index] ?? 0, points[index + 1] ?? 0);
      if (element.localName === "polygon") path.closePath();
      return path;
    }
    case "rect": {
      const [x = NaN, y = NaN, width = NaN, height = NaN, rx = NaN, ry = NaN] = coordinates("x", "y", "width", "height", "rx", "ry");
      if (![x, y, width, height, rx, ry].every(Number.isFinite) || width <= 0 || height <= 0 || rx || ry) return null;
      path.rect(x, y, width, height);
      return path;
    }
    default:
      return null;
  }
}

function hasUnsupportedStyling(style: CSSStyleDeclaration): boolean {
  return style.transform !== "none" || style.filter !== "none" || style.clipPath !== "none" ||
    style.maskImage !== "none" || style.opacity !== "1" || style.visibility !== "visible";
}

function isSolid(paint: string): boolean {
  return /^rgba?\([\d.,% /]+\)$/.test(paint);
}

export function renderLocalIconPng(control: Element): string | null {
  if (!control.isConnected || isHidden(control) || isDisabledControl(control) || control.closest("form, [contenteditable]")) return null;
  const candidates = control.querySelectorAll("svg, img, canvas, picture");
  const svg = candidates[0];
  if (!svg || candidates.length !== 1 || svg.namespaceURI !== SVG_NS || svg.localName !== "svg" ||
    svg.children.length === 0 || svg.children.length > 16 || svg.textContent?.trim()) return null;

  const bounds = svg.getBoundingClientRect();
  if (bounds.width < 8 || bounds.height < 8 || bounds.width > 96 || bounds.height > 96) return null;
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n) || Math.abs(n) > 4096)) return null;
  const [x = 0, y = 0, width = 0, height = 0] = viewBox;
  if (width < 1 || height < 1 || width / height > 3 || height / width > 3) return null;

  const doc = control.ownerDocument;
  const view = doc.defaultView;
  if (!view || hasUnsupportedStyling(view.getComputedStyle(svg))) return null;
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const scale = 76 / Math.max(width, height);
  context.setTransform(scale, 0, 0, scale, (SIZE - width * scale) / 2 - x * scale, (SIZE - height * scale) / 2 - y * scale);

  for (const child of Array.from(svg.children)) {
    if (child.namespaceURI !== SVG_NS || child.childNodes.length || child.hasAttribute("transform")) return null;
    const style = view.getComputedStyle(child);
    if (style.display === "none" || hasUnsupportedStyling(style) || style.strokeDasharray !== "none" ||
      style.fillOpacity !== "1" || style.strokeOpacity !== "1") return null;
    const path = asPath(child);
    if (!path || (style.fill !== "none" && !isSolid(style.fill)) ||
      (style.stroke !== "none" && !isSolid(style.stroke))) return null;
    // High-contrast reconstruction keeps geometry legible regardless of theme.
    context.fillStyle = context.strokeStyle = "#111";
    if (style.fill !== "none") context.fill(path, style.fillRule === "evenodd" ? "evenodd" : "nonzero");
    if (style.stroke !== "none") {
      const lineWidth = Number.parseFloat(style.strokeWidth);
      if (!Number.isFinite(lineWidth) || lineWidth <= 0 || lineWidth > Math.max(width, height) / 3) return null;
      context.lineWidth = lineWidth;
      context.lineCap = style.strokeLinecap === "round" || style.strokeLinecap === "square" ? style.strokeLinecap : "butt";
      context.lineJoin = style.strokeLinejoin === "round" || style.strokeLinejoin === "bevel" ? style.strokeLinejoin : "miter";
      context.stroke(path);
    }
  }
  if (!context.getImageData(0, 0, SIZE, SIZE).data.some((channel, index) => index % 4 === 3 && channel > 0)) return null;
  context.resetTransform();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#fff";
  context.fillRect(0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/png").slice("data:image/png;base64,".length);
}
