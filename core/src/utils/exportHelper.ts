import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';
import { SessionInfo, ParkingLogResult } from './databaseHelper';

function calculateFee(timeIn: string, timeOut: string | undefined, ratePerHour: number): number {
  if (!timeOut) return 0;
  const inTime = new Date(timeIn).getTime();
  const outTime = new Date(timeOut).getTime();
  if (isNaN(inTime) || isNaN(outTime)) return 0;
  const diffMs = outTime - inTime;
  if (diffMs <= 0) return ratePerHour;
  const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
  return hours * ratePerHour;
}

function getParkedHours(timeIn: string, timeOut: string): number {
  const inTime = new Date(timeIn).getTime();
  const outTime = new Date(timeOut).getTime();
  if (isNaN(inTime) || isNaN(outTime)) return 0;
  const diffMs = outTime - inTime;
  if (diffMs <= 0) return 1;
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN');
}

export async function exportSessionToXlsx(
  session: SessionInfo,
  logs: ParkingLogResult[],
  feePerHour: number,
): Promise<void> {
  try {
    const exited = logs.filter(l => !!l.timeOut);
    const parked = logs.filter(l => !l.timeOut);
    const totalFee = exited.reduce((sum, l) => sum + calculateFee(l.timeIn, l.timeOut, feePerHour), 0);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Thống kê
    const statsData = [
      ['THỐNG KÊ PHIÊN', ''],
      ['', ''],
      ['Tên phiên', session.name],
      ['Ngày tạo', formatDate(session.createdAt)],
      ['Ngày kết thúc', session.endedAt ? formatDate(session.endedAt) : 'Đang hoạt động'],
      ['Trạng thái', session.status === 'active' ? 'Đang hoạt động' : 'Đã kết thúc'],
      ['', ''],
      ['Tổng số xe', logs.length],
      ['Xe đã ra', exited.length],
      ['Xe trong bãi', parked.length],
      ['Tổng phí thu', totalFee.toLocaleString('vi-VN') + '₫'],
    ];
    const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
    statsSheet['!cols'] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, statsSheet, 'Thống kê');

    // Sheet 2: Chi tiết
    const headers = ['STT', 'Biển số', 'Thời gian vào', 'Thời gian ra', 'Số giờ', 'Phí'];
    const detailRows = logs.map((l, i) => {
      const hours = l.timeOut ? getParkedHours(l.timeIn, l.timeOut) : 0;
      const feeStr = l.timeOut ? calculateFee(l.timeIn, l.timeOut, feePerHour).toLocaleString('vi-VN') + '₫' : 'Chưa ra';
      return [
        i + 1,
        l.licensePlate,
        formatDate(l.timeIn),
        l.timeOut ? formatDate(l.timeOut) : '---',
        l.timeOut ? hours : '---',
        feeStr,
      ];
    });
    const detailData = [headers, ...detailRows];
    const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
    detailSheet['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Chi tiết');

    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const safeName = session.name.replace(/[^\w\d\s_]/g, '_');
    const filename = `thongke_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const cachePath = `${RNFS.CachesDirectoryPath}/${filename}`;

    await RNFS.writeFile(cachePath, wbout, 'base64');

    await NativeModules.DatabaseModule.saveFile(
      cachePath,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    );
  } catch (error: any) {
    console.error('Export XLSX error:', error?.message || error);
  }
}
