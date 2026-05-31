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

export async function recognizePlate(imagePath: string): Promise<PlateResult> {
  if (!LicensePlateModule) {
    console.warn('[LPR] LicensePlateModule not available');
    return { plate: 'unknown', bbox: null };
  }

  console.log('[LPR] recognizePlate:', imagePath);
  try {
    const result: any = await LicensePlateModule.recognizePlate(imagePath);
    console.log('[LPR] result:', result);
    const plate: string = (result && result.plate) || 'unknown';
    const bbox: BBox | null = (result && result.bbox) || null;
    return { plate, bbox };
  } catch (error) {
    console.warn('[LPR] error:', error);
    return { plate: 'unknown', bbox: null };
  }
}
