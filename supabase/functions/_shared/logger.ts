export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  fn: string;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

export function createLogger(fnName: string) {
  function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      fn: fnName,
      msg,
      ts: new Date().toISOString(),
      ...ctx,
    };
    // Supabase Edge Function logs are captured from stdout
    const out = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(out);
    } else {
      console.log(out);
    }
  }

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
    info:  (msg: string, ctx?: Record<string, unknown>) => log('info',  msg, ctx),
    warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn',  msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
  };
}

export type Logger = ReturnType<typeof createLogger>;
