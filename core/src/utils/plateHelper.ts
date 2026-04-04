import { NativeModules, DeviceEventEmitter } from 'react-native';

const { LicensePlateModule } = NativeModules;

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlateResult {
  plate: string;
  bbox: BBox | null;
  charBboxes: any[];
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

export async function recognizePlate(imagePath: string): Promise<PlateResult> {
  if (!LicensePlateModule) {
    console.warn('[LPR] LicensePlateModule not available');
    return { plate: 'unknown', bbox: null, charBboxes: [], imageWidth: 0, imageHeight: 0 };
  }

  console.log('[LPR] recognizePlate:', imagePath);
  try {
    const result: any = await LicensePlateModule.recognizePlate(imagePath);
    console.log('[LPR] result:', result);
    const plate: string = (result && result.plate) || 'unknown';
    const bbox: BBox | null = (result && result.bbox) || null;
    const imageWidth: number = (result && result.imageWidth) || 0;
    const imageHeight: number = (result && result.imageHeight) || 0;
    return { plate, bbox, charBboxes: [], imageWidth, imageHeight };
  } catch (error) {
    console.warn('[LPR] error:', error);
    return { plate: 'unknown', bbox: null, charBboxes: [], imageWidth: 0, imageHeight: 0 };
  }
}