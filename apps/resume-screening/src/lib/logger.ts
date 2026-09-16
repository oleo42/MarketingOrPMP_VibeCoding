// 进程日志（闸口1核心）：pino 结构化 JSON，输出到控制台 + logs/app.log
// 哲学：不为每类问题埋点，只为"问题可能被吞掉的边界"设闸。这里是后端 catch 的收口。
import pino from 'pino';
import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
fs.mkdirSync(logDir, { recursive: true });

const isDev = process.env.NODE_ENV !== 'production';

// 多路输出：控制台(stdout) + 文件(JSON 行)。
// 注意：dev 下不要用 pino.transport({target:'pino-pretty'})——它跑在 worker 线程，
// 与 Next dev 热重载冲突会抛 "the worker has exited"，日志系统反而自产噪音。
// 直接写 stdout（pino 默认 JSON），需要美化就 grep + jq。
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    base: {
      env: isDev ? 'development' : 'production',
      provider: process.env.LLM_PROVIDER || 'ark',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([process.stdout, pino.destination(path.join(logDir, 'app.log'))])
);

// 进程级兜底：未捕获异常 / Promise 拒绝，绝不静默退出
export function installProcessHandlers(): void {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: { message: err.message, stack: err.stack } }, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal(
      { err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason: String(reason) } },
      'unhandledRejection'
    );
  });
}

// 统一错误序列化：把 unknown 异常压成可记的结构
export function errInfo(e: unknown): { message: string; stack?: string } {
  return e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) };
}
