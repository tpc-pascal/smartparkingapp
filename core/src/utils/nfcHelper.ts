import { NativeModules, DeviceEventEmitter } from 'react-native';

const { NfcModule } = NativeModules;

export async function isNfcSupported(): Promise<boolean> {
  if (!NfcModule) return false;
  return NfcModule.isNfcSupported();
}

export async function isNfcEnabled(): Promise<boolean> {
  if (!NfcModule) return false;
  return NfcModule.isNfcEnabled();
}

export async function openNfcSettings(): Promise<void> {
  if (!NfcModule) throw new Error('NfcModule not available');
  await NfcModule.openNfcSettings();
}

export async function writeNdef(text: string): Promise<void> {
  if (!NfcModule) throw new Error('NfcModule not available');
  await withTimeout(NfcModule.writeNdef(text), NFC_TIMEOUT, 'Hết thời gian ghi thẻ NFC');
}

const NFC_TIMEOUT = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms)
    ),
  ]);
}

export async function readNdef(): Promise<string> {
  if (!NfcModule) throw new Error('NfcModule not available');
  return withTimeout(NfcModule.readNdef(), NFC_TIMEOUT, 'Hết thời gian chờ thẻ NFC');
}

export async function cancelWrite(): Promise<void> {
  if (!NfcModule) return;
  await NfcModule.cancelWrite();
}

export function addNfcListener(event: string, handler: (data: unknown) => void) {
  const sub = DeviceEventEmitter.addListener(event, handler);
  return () => sub.remove();
}
