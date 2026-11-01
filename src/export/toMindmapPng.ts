/**
 * 导出商业风思维导图 PNG：项目名当总根，左→右展开。
 * 全节点圆角浅底 + 浅蓝描边；一级分色贝塞尔曲线（XMind 经典配色）。
 */

import type { ProjectData, TreeNode } from "@/domain";

/** XMind 经典分支色 */
const BRANCH_COLORS = [
  "#e74c3c",
  "#3498db",
  "#27ae60",
  "#9b59b6",
  "#f39c12",
  "#1abc9c",
  "#e67e22",
  "#2980b9",
];

const NODE_FILL = "#f5f7fa";
const NODE_BORDER = "#93c5fd";
const ROOT_FILL = "#eef4ff";
const ROOT_BORDER = "#60a5fa";
const TEXT = "#1f2937";

const FONT =
  '14px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const FONT_ROOT =
  '600 15px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const FONT_L1 =
  '600 14px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

const PAD = 56;
const H_GAP = 72;
/** 同级垂直间距：拉开呼吸感 */
const V_GAP = 26;
const BOX_PAD_X = 16;
const BOX_PAD_Y = 10;
const LINE_H = 22;
const RADIUS = 10;
const MAX_LABEL = 28;
const MAX_SIDE = 6000;

type LayoutNode = {
  title: string;
  depth: number;
  color: string;
  w: number;
  h: number;
  x: number;
  y: number;
  subtreeH: number;
  children: LayoutNode[];
};

function truncate(text: string): string {
  const t = text.trim() || "未命名";
  if ([...t].length <= MAX_LABEL) return t;
  return `${[...t].slice(0, MAX_LABEL - 1).join("")}…`;
}

function fontFor(depth: number): string {
  if (depth <= 0) return FONT_ROOT;
  if (depth === 1) return FONT_L1;
  return FONT;
}

function measure(
  ctx: CanvasRenderingContext2D,
  title: string,
  depth: number,
): { w: number; h: number } {
  ctx.font = fontFor(depth);
  const tw = Math.ceil(ctx.measureText(title).width);
  return { w: tw + BOX_PAD_X * 2, h: LINE_H + BOX_PAD_Y * 2 };
}

function buildTree(
  ctx: CanvasRenderingContext2D,
  title: string,
  children: TreeNode[],
  depth: number,
  color: string,
): LayoutNode {
  const label = truncate(title);
  const size = measure(ctx, label, depth);
  const kids = children.map((c, i) => {
    const nextColor =
      depth === 0 ? BRANCH_COLORS[i % BRANCH_COLORS.length] : color;
    return buildTree(ctx, c.title, c.children, depth + 1, nextColor);
  });

  let subtreeH = size.h;
  if (kids.length) {
    const sum = kids.reduce((a, k) => a + k.subtreeH, 0);
    subtreeH = Math.max(size.h, sum + V_GAP * (kids.length - 1));
  }

  return {
    title: label,
    depth,
    color,
    w: size.w,
    h: size.h,
    x: 0,
    y: 0,
    subtreeH,
    children: kids,
  };
}

function place(node: LayoutNode, x: number, yTop: number) {
  node.x = x;
  node.y = yTop + (node.subtreeH - node.h) / 2;
  let cy = yTop;
  const contentH =
    node.children.reduce((a, k) => a + k.subtreeH, 0) +
    V_GAP * Math.max(0, node.children.length - 1);
  if (contentH < node.subtreeH) {
    cy += (node.subtreeH - contentH) / 2;
  }
  for (const child of node.children) {
    place(child, x + node.w + H_GAP, cy);
    cy += child.subtreeH + V_GAP;
  }
}

function bounds(node: LayoutNode, acc = { r: 0, b: 0 }) {
  acc.r = Math.max(acc.r, node.x + node.w);
  acc.b = Math.max(acc.b, node.y + node.h);
  for (const c of node.children) bounds(c, acc);
  return acc;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawLink(
  ctx: CanvasRenderingContext2D,
  from: LayoutNode,
  to: LayoutNode,
) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const cx = (x1 + x2) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(cx, y1, cx, y2, x2, y2);
  ctx.strokeStyle = to.color;
  ctx.lineWidth = to.depth <= 1 ? 3.4 : to.depth === 2 ? 2.4 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawNode(ctx: CanvasRenderingContext2D, node: LayoutNode) {
  const isRoot = node.depth <= 0;

  // 极轻阴影，贴近商业导图质感
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, node.x, node.y, node.w, node.h, RADIUS);
  ctx.fillStyle = isRoot ? ROOT_FILL : NODE_FILL;
  ctx.fill();
  ctx.restore();

  roundRect(ctx, node.x, node.y, node.w, node.h, RADIUS);
  ctx.strokeStyle = isRoot ? ROOT_BORDER : NODE_BORDER;
  ctx.lineWidth = isRoot ? 1.8 : 1.4;
  ctx.stroke();

  // 一级节点左侧色条，强化分支归属
  if (node.depth === 1) {
    ctx.fillStyle = node.color;
    ctx.fillRect(node.x + 1.5, node.y + 6, 3.5, node.h - 12);
  }

  ctx.font = fontFor(node.depth);
  ctx.fillStyle = TEXT;
  ctx.textBaseline = "middle";
  ctx.fillText(node.title, node.x + BOX_PAD_X, node.y + node.h / 2);
}

function walkDraw(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode,
  drawLinks: boolean,
) {
  if (drawLinks) {
    for (const c of node.children) drawLink(ctx, node, c);
  } else {
    drawNode(ctx, node);
  }
  for (const c of node.children) walkDraw(ctx, c, drawLinks);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG 编码失败"));
      },
      "image/png",
      1,
    );
  });
}

/** 将项目树绘成商业风思维导图 PNG */
export async function toMindmapPng(project: ProjectData): Promise<Blob> {
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("当前环境无法创建画布");

  const rootTitle =
    project.name.trim() || project.tree[0]?.title?.trim() || "未命名项目";
  const root = buildTree(
    mctx,
    rootTitle,
    project.tree,
    0,
    BRANCH_COLORS[0],
  );
  place(root, PAD, PAD);
  const box = bounds(root);
  let width = Math.ceil(box.r + PAD);
  let height = Math.ceil(box.b + PAD);
  let scale = 1;
  if (width > MAX_SIDE || height > MAX_SIDE) {
    scale = Math.min(MAX_SIDE / width, MAX_SIDE / height);
    width = Math.ceil(width * scale);
    height = Math.ceil(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境无法创建画布");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (scale !== 1) ctx.scale(scale, scale);

  walkDraw(ctx, root, true);
  walkDraw(ctx, root, false);

  return canvasToPngBlob(canvas);
}
