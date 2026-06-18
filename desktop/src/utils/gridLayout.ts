/**
 * 网格布局算法 — 将卡片整齐排列成网格
 */

const CARD_WIDTH = 280;
const CARD_HEIGHT_ESTIMATE = 180;
const GAP_X = 20;
const GAP_Y = 20;
export const PADDING_LEFT = 40;
export const PADDING_TOP = 40;
export const PADDING_RIGHT = 180; // 右侧预留：浮动按钮(52px) + 边距 + 缓冲空间

// QuotaCard 固定在右上角，需预留其占用区域
const QUOTA_CARD_RIGHT = 24;   // right-6
const QUOTA_CARD_TOP = 16;     // top-4
const QUOTA_CARD_WIDTH = 380;  // 360px + 边距
const QUOTA_CARD_HEIGHT = 260; // 估算展开高度

/**
 * 计算网格列数（基于视口宽度）
 * 预留右侧浮动按钮区域，避免卡片挤到右边
 */
function calcColumns(): number {
  const screenW = window.innerWidth;
  const available = screenW - PADDING_LEFT - PADDING_RIGHT;
  return Math.max(1, Math.floor((available + GAP_X) / (CARD_WIDTH + GAP_X)));
}

/**
 * 获取被 QuotaCard 占用的网格槽位
 */
function getReservedSlots(): Set<string> {
  const reserved = new Set<string>();
  const screenW = window.innerWidth;
  const cols = calcColumns();

  // QuotaCard 的左边界和底部边界
  const quotaLeft = screenW - QUOTA_CARD_RIGHT - QUOTA_CARD_WIDTH;
  const quotaBottom = QUOTA_CARD_TOP + QUOTA_CARD_HEIGHT;

  for (let row = 0; row < 3; row++) { // 只需检查前几行
    for (let col = 0; col < cols; col++) {
      const slotX = PADDING_LEFT + col * (CARD_WIDTH + GAP_X);
      const slotY = PADDING_TOP + row * (CARD_HEIGHT_ESTIMATE + GAP_Y);
      const slotRight = slotX + CARD_WIDTH;
      const slotBottom = slotY + CARD_HEIGHT_ESTIMATE;

      // 检测是否与 QuotaCard 区域重叠
      if (slotRight > quotaLeft && slotX < screenW - QUOTA_CARD_RIGHT &&
          slotBottom > QUOTA_CARD_TOP && slotY < quotaBottom) {
        reserved.add(`${row},${col}`);
      }
    }
  }

  return reserved;
}

/**
 * 计算下一个可用的网格位置（按 左→右、上→下 顺序）
 * 自动避开 QuotaCard 等固定元素
 * @param existingPositions 已有的卡片位置集合
 */
export function getNextGridPosition(existingPositions: { x: number; y: number }[]): { x: number; y: number } {
  const cols = calcColumns();
  const usedSlots = new Set<string>();
  const reservedSlots = getReservedSlots();

  // 合并已占用 + 预留槽位
  for (const slot of reservedSlots) {
    usedSlots.add(slot);
  }

  for (const pos of existingPositions) {
    const col = Math.round((pos.x - PADDING_LEFT) / (CARD_WIDTH + GAP_X));
    const row = Math.round((pos.y - PADDING_TOP) / (CARD_HEIGHT_ESTIMATE + GAP_Y));
    usedSlots.add(`${row},${col}`);
  }

  // 找第一个未占用的格子
  for (let row = 0; ; row++) {
    for (let col = 0; col < cols; col++) {
      if (!usedSlots.has(`${row},${col}`)) {
        return {
          x: PADDING_LEFT + col * (CARD_WIDTH + GAP_X),
          y: PADDING_TOP + row * (CARD_HEIGHT_ESTIMATE + GAP_Y),
        };
      }
    }
  }
}

/**
 * 将一组卡片整齐排列到网格位置
 * 自动避开 QuotaCard 等固定元素
 * @param cardIds 需要排列的卡片 ID 列表（按显示顺序）
 */
export function calculateGridPositions(cardIds: string[]): { id: string; x: number; y: number }[] {
  const cols = calcColumns();
  const reservedSlots = getReservedSlots();

  // 构建可用槽位序列（跳过被预留的）
  const availableSlots: { row: number; col: number }[] = [];
  for (let row = 0; availableSlots.length < cardIds.length; row++) {
    for (let col = 0; col < cols; col++) {
      if (!reservedSlots.has(`${row},${col}`)) {
        availableSlots.push({ row, col });
      }
      if (availableSlots.length >= cardIds.length) break;
    }
  }

  return cardIds.map((id, index) => {
    const slot = availableSlots[index] ?? { row: Math.floor(index / cols), col: index % cols };
    return {
      id,
      x: PADDING_LEFT + slot.col * (CARD_WIDTH + GAP_X),
      y: PADDING_TOP + slot.row * (CARD_HEIGHT_ESTIMATE + GAP_Y),
    };
  });
}
