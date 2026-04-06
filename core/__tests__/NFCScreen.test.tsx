import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import NFCScreen from '../src/screens/NFCScreen';

jest.mock('../src/utils/nfcHelper', () => ({
  writeNdef: jest.fn(),
  readNdef: jest.fn(),
  cancelWrite: jest.fn().mockResolvedValue(undefined),
  isNfcSupported: jest.fn(),
  isNfcEnabled: jest.fn(),
  openNfcSettings: jest.fn(),
  addNfcListener: jest.fn(),
}));

jest.mock('../src/utils/databaseHelper', () => ({
  recordEntryFull: jest.fn(),
  recordExitFull: jest.fn(),
  notifySuccess: jest.fn(),
  searchParkingLogs: jest.fn(),
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ attendantId: 1, attendantName: 'test@example.com' }),
}));

jest.mock('../src/context/SessionContext', () => ({
  useSession: () => ({
    session: { id: 1, name: 'Phiên 31/05/2026 #1', status: 'active', createdAt: '2026-05-31T10:00:00Z' },
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const db = require('../src/utils/databaseHelper');
const nfc = require('../src/utils/nfcHelper');

beforeEach(() => {
  jest.clearAllMocks();
  global.__mockRouteParams.plateText = '59A12345';
  global.__mockRouteParams.mode = 'write';
});

it('renders title based on mode', () => {
  const { getByText } = render(<NFCScreen />);
  expect(getByText('Ghi thẻ NFC')).toBeTruthy();
});

it('renders plate info', () => {
  const { getByText } = render(<NFCScreen />);
  expect(getByText('59A12345')).toBeTruthy();
});

it('renders NFC button in idle state', () => {
  const { getByText } = render(<NFCScreen />);
  expect(getByText('Chạm để ghi thẻ')).toBeTruthy();
});

it('calls writeNdef when NFC button pressed', async () => {
  nfc.writeNdef.mockResolvedValue(undefined);
  const { getByText } = render(<NFCScreen />);
  await act(async () => {
    fireEvent.press(getByText('Chạm để ghi thẻ'));
  });
  expect(nfc.writeNdef).toHaveBeenCalled();
});

it('shows success state after successful NFC write', async () => {
  nfc.writeNdef.mockResolvedValue(undefined);
  const { getByText, findByText } = render(<NFCScreen />);
  await act(async () => {
    fireEvent.press(getByText('Chạm để ghi thẻ'));
  });
  const successText = await findByText('Ghi thẻ thành công!');
  expect(successText).toBeTruthy();
});

it('records entry after NFC write and confirming', async () => {
  nfc.writeNdef.mockResolvedValue(undefined);
  db.recordEntryFull.mockResolvedValue({ id: 1 });
  const { getByText, findByText } = render(<NFCScreen />);
  await act(async () => {
    fireEvent.press(getByText('Chạm để ghi thẻ'));
  });
  const completeBtn = await findByText('Hoàn tất');
  await act(async () => {
    fireEvent.press(completeBtn);
  });
  expect(db.recordEntryFull).toHaveBeenCalled();
});
