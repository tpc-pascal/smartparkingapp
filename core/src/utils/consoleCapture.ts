type LogEntry = { level: 'log' | 'warn' | 'error'; message: string; timestamp: string };

const logs: LogEntry[] = [];
const MAX_LOGS = 500;

type ConsoleFn = (...args: unknown[]) => void;

export function captureConsole() {
  const originalLog: ConsoleFn = console.log || (() => {});
  const originalWarn: ConsoleFn = console.warn || (() => {});
  const originalError: ConsoleFn = console.error || (() => {});

  console.log = (...args: unknown[]) => {
    originalLog.call(console, ...args);
    try { pushLog('log', args); } catch {}
  };
  console.warn = (...args: unknown[]) => {
    originalWarn.call(console, ...args);
    try { pushLog('warn', args); } catch {}
  };
  console.error = (...args: unknown[]) => {
    originalError.call(console, ...args);
    try { pushLog('error', args); } catch {}
  };
}

function pushLog(level: LogEntry['level'], args: unknown[]) {
  const message = args
    .map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
    .join(' ');
  logs.push({ level, message, timestamp: new Date().toISOString() });
  if (logs.length > MAX_LOGS) logs.shift();
}

export function getCapturedLogs(): LogEntry[] {
  return [...logs];
}
