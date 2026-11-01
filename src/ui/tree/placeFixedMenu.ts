/**
 * 固定定位菜单：偏上向下、偏下向上；两侧都不够则贴边并限制高度。
 */

export interface PlaceFixedMenuInput {
  anchorX: number;
  anchorY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pad?: number;
}

export interface PlaceFixedMenuResult {
  x: number;
  y: number;
  maxHeight?: number;
}

export function placeFixedMenu(input: PlaceFixedMenuInput): PlaceFixedMenuResult {
  const pad = input.pad ?? 8;
  const {
    anchorX,
    anchorY,
    menuWidth,
    menuHeight,
    viewportWidth,
    viewportHeight,
  } = input;

  const spaceBelow = viewportHeight - anchorY - pad;
  const spaceAbove = anchorY - pad;

  let top: number;
  let maxHeight: number | undefined;

  if (spaceBelow >= menuHeight) {
    top = anchorY;
  } else if (spaceAbove >= menuHeight) {
    top = anchorY - menuHeight;
  } else if (spaceBelow >= spaceAbove) {
    top = anchorY;
    maxHeight = Math.max(80, spaceBelow);
  } else {
    maxHeight = Math.max(80, spaceAbove);
    top = anchorY - maxHeight;
  }

  let left = anchorX;
  left = Math.min(left, viewportWidth - menuWidth - pad);
  left = Math.max(pad, left);

  const usedH = maxHeight ?? menuHeight;
  top = Math.max(pad, Math.min(top, viewportHeight - usedH - pad));

  return maxHeight != null
    ? { x: left, y: top, maxHeight }
    : { x: left, y: top };
}
