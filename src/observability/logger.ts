type LogLevel = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';

function log(level: LogLevel, component: string, message: string, context?: any): void {
  if (level === 'DEBUG') return;
  const toStderr0 = level === 'ERROR' || level === 'WARN' || process.env.MARKETING_LOG_STDERR === '1';
  // Production: one JSON object per line (docker json-file / Railway capture and rotate stdout).
  if (process.env.LOG_FORMAT === 'json' || (process.env.NODE_ENV === 'production' && process.env.LOG_FORMAT !== 'text')) {
    const entry = JSON.stringify({ ts: new Date().toISOString(), level, component, message, ...(context === undefined ? {} : { context }) });
    (toStderr0 ? console.error : console.log)(entry);
    return;
  }
  const line = [`[${new Date().toISOString()}] [${level.padEnd(7)}] [${component}] ${message}`, context ? JSON.stringify(context) : ''];
  const toStderr = level === 'ERROR' || level === 'WARN' || process.env.MARKETING_LOG_STDERR === '1';
  (level === 'WARN' ? console.warn : toStderr ? console.error : console.log)(...line);
}

export const logger = {
  debug: (component: string, message: string, context?: any) => log('DEBUG', component, message, context),
  info: (component: string, message: string, context?: any) => log('INFO', component, message, context),
  success: (component: string, message: string, context?: any) => log('SUCCESS', component, message, context),
  warn: (component: string, message: string, context?: any) => log('WARN', component, message, context),
  error: (component: string, message: string, context?: any) => log('ERROR', component, message, context)
};
