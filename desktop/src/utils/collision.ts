import { PADDING_RIGHT } from "./gridLayout";

/**
 * 卡片碰撞检测与分离算法
 * 当卡片重叠时，沿最短轴将它们推开
 */

export interface CardRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 220;
const CARD_HEIGHT_ESTIMATE = 160; // 估算高度，便签一般内容不多
const GAP = 12; // 卡片间最小间距
const MAX_ITERATIONS = 20; // 最大迭代次数，防止死循环

/**
 * 根据卡片内容估算实际高度
 * header(48px) + body(16px padding*2 + content lines)
 */
export function estimateCardHeight(content: string): number {
  const charPerLine = 10; // 220px宽、16px字号大约每行10个中文字
  const lineHeight = 22;
  const bodyPadding = 32;
  const headerHeight = 48;
  const lines = Math.max(1, Math.ceil(content.length / charPerLine));
  return Math.max(CARD_HEIGHT_ESTIMATE, headerHeight + bodyPadding + lines * lineHeight);
}

/**
 * 检测两个矩形是否重叠（含间距）
 */
function isOverlapping(a: CardRect, b: CardRect): boolean {
  return !(
    a.x + a.width + GAP <= b.x ||
    b.x + b.width + GAP <= a.x ||
    a.y + a.height + GAP <= b.y ||
    b.y + b.height + GAP <= a.y
  );
}

/**
 * 计算两个重叠矩形的最小分离向量
 * 返回 { dx, dy } 表示 A 应该移动的方向（B 取反）
 */
function getSeparationVector(a: CardRect, b: CardRect): { dx: number; dy: number } {
  // A 右边缘 vs B 左边缘
  const overlapX1 = a.x + a.width + GAP - b.x;
  // B 右边缘 vs A 左边缘
  const overlapX2 = b.x + b.width + GAP - a.x;
  // A 下边缘 vs B 上边缘
  const overlapY1 = a.y + a.height + GAP - b.y;
  // B 下边缘 vs A 上边缘
  const overlapY2 = b.y + b.height + GAP - a.y;

  const minOverlapX = Math.min(overlapX1, overlapX2);
  const minOverlapY = Math.min(overlapY1, overlapY2);

  if (minOverlapX < minOverlapY) {
    // 沿 X 轴推开
    return { dx: overlapX1 < overlapX2 ? -overlapX1 : overlapX2, dy: 0 };
  } else {
    // 沿 Y 轴推开
    return { dx: 0, dy: overlapY1 < overlapY2 ? -overlapY1 : overlapY2 };
  }
}

/**
 * 解决卡片间的碰撞，返回修正后的位置数组
 * @param cards 当前可见卡片列表
 * @param draggedId 正在拖动/刚创建的卡片 ID（它不会被推开，其他卡片绕开它）
 */
export function resolveCollisions(
  cards: { id: string; x: number; y: number; content: string }[],
  draggedId?: string
): { id: string; x: number; y: number }[] {
  const rects: CardRect[] = cards.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    width: CARD_WIDTH,
    height: estimateCardHeight(c.content),
  }));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let hasOverlap = false;

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (!isOverlapping(rects[i], rects[j])) continue;
        hasOverlap = true;

        const sep = getSeparationVector(rects[i], rects[j]);
        const iIsDragged = rects[i].id === draggedId;
        const jIsDragged = rects[j].id === draggedId;

        if (iIsDragged) {
          // 只移动 j
          rects[j].x -= sep.dx;
          rects[j].y -= sep.dy;
        } else if (jIsDragged) {
          // 只移动 i
          rects[i].x += sep.dx;
          rects[i].y += sep.dy;
        } else {
          // 两个都各推一半
          rects[i].x += sep.dx * 0.5;
          rects[i].y += sep.dy * 0.5;
          rects[j].x -= sep.dx * 0.5;
          rects[j].y -= sep.dy * 0.5;
        }
      }
    }

    if (!hasOverlap) break;
  }

  // 确保不超出屏幕边界（右侧预留空间给浮动按钮）
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const rightLimit = screenW - PADDING_RIGHT;
  for (const rect of rects) {
    rect.x = Math.max(0, Math.min(rect.x, rightLimit - rect.width));
    rect.y = Math.max(0, Math.min(rect.y, screenH - rect.height));
  }

  return rects.map((r) => ({ id: r.id, x: r.x, y: r.y }));
}
