export const STICKY_COLORS = [
  '#ffe0e3',
  '#c7f0ff',
  '#ffd8a8',
  '#d9f2d9',
  '#e5d7ff',
  '#f9f7d9',
  '#d2f0f8',
  '#ffd4f5',
];

export function getRandomColor(): string {
  return STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
}
