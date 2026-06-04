type LogEntry = { level: 'log' | 'warn' | 'error'; message: string; timestamp: string };

const logs: LogEntry[] = [];
const MAX_LOGS = 500;

export function captureConsole() {
  const originalLog = console.log || (() => {});
  const originalWarn = console.warn || (() => {});
  const originalError = console.error || (() => {});

  console.log = (...args: any[]) => {
    originalLog(...args);
    pushLog('log', args);
  };
  console.warn = (...args: any[]) => {
    originalWarn(...args);
    pushLog('warn', args);
  };
  console.error = (...args: any[]) => {
    originalError(...args);
    pushLog('error', args);
  };
}

function pushLog(level: LogEntry['level'], args: any[]) {
  const message = args
    .map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
    .join(' ');
  logs.push({ level, message, timestamp: new Date().toISOString() });
  if (logs.length > MAX_LOGS) logs.shift();
}

export function getCapturedLogs(): LogEntry[] {
  return [...logs];
}
