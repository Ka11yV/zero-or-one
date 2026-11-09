import type { Pt, Rect } from './geometry';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** 화면 좌표 = (월드 좌표 - (x, y)) × zoom */
export class Camera {
  x = -100;
  y = -100;
  zoom = 1;

  toWorld(sx: number, sy: number): Pt {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  toScreen(wx: number, wy: number): Pt {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  panBy(dsx: number, dsy: number): void {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
  }

  /** 화면의 한 점을 고정한 채 확대/축소 */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.x = before.x - sx / this.zoom;
    this.y = before.y - sy / this.zoom;
  }

  fit(bounds: Rect, viewW: number, viewH: number, margin = 60): void {
    const z = Math.min((viewW - 2 * margin) / Math.max(bounds.w, 1), (viewH - 2 * margin) / Math.max(bounds.h, 1));
    this.zoom = Math.min(1.25, Math.max(MIN_ZOOM, z));
    this.x = bounds.x + bounds.w / 2 - viewW / 2 / this.zoom;
    this.y = bounds.y + bounds.h / 2 - viewH / 2 / this.zoom;
  }
}
