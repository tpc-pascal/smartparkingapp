import { NativeModules, DeviceEventEmitter } from 'react-native';

const { LicensePlateModule } = NativeModules;

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface CharBBox extends BBox {
  char?: string;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface NativePlateResult {
  plate?: string;
  bbox?: BBox;
  charBboxes?: CharBBox[];
  imageWidth?: number;
  imageHeight?: number;
}

export interface PlateResult {
  plate: string;
  bbox: BBox | null;
  charBboxes: BBox[];
  imageWidth: number;
  imageHeight: number;
}

let listenerAttached = false;
function attachLogListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  DeviceEventEmitter.addListener('LPR_LOG', (message: string) => {
    console.log('[LPR]', message);
  });
}

attachLogListener();

export function isValidVietnamPlate(plate: string): boolean {
  const p = plate.toUpperCase().trim();
  const len = p.length;
  if (len < 7 || len > 10) return false;
  if (!/^\d{2}/.test(p)) return false;
  if (!/\d{4}$/.test(p)) return false;
  return true;
}

export function plateToBoxes(
  result: PlateResult,
  showCharBboxes: boolean,
): Array<{ x: number; y: number; w: number; h: number; label?: string }> {
  if (!showCharBboxes) return [];
  const boxes: Array<{ x: number; y: number; w: number; h: number; label?: string }> = [];
  if (result.bbox && result.plate) {
    boxes.push({
      x: result.bbox.x1 / result.imageWidth,
      y: result.bbox.y1 / result.imageHeight,
      w: (result.bbox.x2 - result.bbox.x1) / result.imageWidth,
      h: (result.bbox.y2 - result.bbox.y1) / result.imageHeight,
      label: result.plate,
    });
  }
  for (const cb of result.charBboxes) {
    boxes.push({
      x: cb.x1 / result.imageWidth,
      y: cb.y1 / result.imageHeight,
      w: (cb.x2 - cb.x1) / result.imageWidth,
      h: (cb.y2 - cb.y1) / result.imageHeight,
    });
  }
  return boxes;
}

export function mapBBoxToView(
  bbox: BBox,
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
): ViewBox {
  if (imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
  const offsetX = (viewWidth - imageWidth * scale) / 2;
  const offsetY = (viewHeight - imageHeight * scale) / 2;
  return {
    x: bbox.x1 * scale + offsetX,
    y: bbox.y1 * scale + offsetY,
    width: (bbox.x2 - bbox.x1) * scale,
    height: (bbox.y2 - bbox.y1) * scale,
  };
}

export async function recognizePlate(imagePath: string): Promise<PlateResult> {
  if (!LicensePlateModule) {
    console.warn('[LPR] LicensePlateModule not available');
    return { plate: 'unknown', bbox: null, charBboxes: [], imageWidth: 0, imageHeight: 0 };
  }

  console.log('[LPR] recognizePlate start:', imagePath);
  const t0 = Date.now();
  try {
    const result = await LicensePlateModule.recognizePlate(imagePath) as NativePlateResult | undefined;
    const elapsed = Date.now() - t0;
    console.log('[LPR] recognizePlate done (' + elapsed + 'ms):', result);
    const plate = result?.plate ?? 'unknown';
    const bbox = result?.bbox ?? null;
    const imageWidth = result?.imageWidth ?? 0;
    const imageHeight = result?.imageHeight ?? 0;
    const charBboxes = result?.charBboxes?.map(cb => {
      const { char: _char, ...b } = cb;
      return b as BBox;
    }) ?? [];
    return { plate, bbox, charBboxes, imageWidth, imageHeight };
  } catch (error) {
    console.warn('[LPR] error:', error);
    return { plate: 'unknown', bbox: null, charBboxes: [], imageWidth: 0, imageHeight: 0 };
  }
}