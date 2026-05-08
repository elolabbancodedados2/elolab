/**
 * Logger Estruturado
 * Suporta contexto persistente e integração com Sentry
 */

export interface LogContext {
  userId?: string;
  email?: string;
  clinicaId?: string;
  action?: string;
  resource?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  context: LogContext;
  data?: any;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class StructuredLogger {
  private context: LogContext = {};
  private isDev = import.meta.env.DEV;

  setContext(ctx: Partial<LogContext>) {
    this.context = { ...this.context, ...ctx };
  }

  clearContext() {
    this.context = {};
  }

  info(message: string, data?: any) {
    const entry = this.buildEntry('info', message, data);
    this.log(entry);
  }

  warn(message: string, data?: any) {
    const entry = this.buildEntry('warn', message, data);
    this.log(entry);
  }

  debug(message: string, data?: any) {
    if (this.isDev) {
      const entry = this.buildEntry('debug', message, data);
      this.log(entry);
    }
  }

  error(message: string, error?: Error | unknown, data?: any) {
    const entry = this.buildEntry('error', message, data);

    if (error instanceof Error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    } else if (typeof error === 'object') {
      entry.data = { ...entry.data, error };
    }

    this.log(entry);
    
    // Enviar para Sentry em produção
    if (!this.isDev) {
      this.sendToSentry(entry);
    }
  }

  private buildEntry(
    level: string,
    message: string,
    data?: any
  ): LogEntry {
    return {
      level: level as any,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context },
      data,
    };
  }

  private log(entry: LogEntry) {
    const prefix = `[${entry.level.toUpperCase()}]`;
    const timestamp = entry.timestamp;
    const ctx = Object.keys(entry.context).length > 0
      ? JSON.stringify(entry.context)
      : '';

    if (entry.level === 'error') {
      console.error(
        `${prefix} ${timestamp} ${entry.message}`,
        ctx,
        entry.error,
        entry.data
      );
    } else if (entry.level === 'warn') {
      console.warn(`${prefix} ${timestamp} ${entry.message}`, ctx, entry.data);
    } else if (entry.level === 'debug') {
      console.debug(`${prefix} ${timestamp} ${entry.message}`, ctx, entry.data);
    } else {
      console.log(`${prefix} ${timestamp} ${entry.message}`, ctx, entry.data);
    }
  }

  private sendToSentry(entry: LogEntry) {
    // Integrado com Sentry na próxima fase
    // try {
    //   Sentry.captureMessage(entry.message, entry.level);
    // } catch (err) {
    //   // Falha silenciosa para não quebrar app
    // }
  }
}

export const logger = new StructuredLogger();
