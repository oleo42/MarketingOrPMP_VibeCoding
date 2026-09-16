// Next.js instrumentation：服务端启动时执行一次。安装进程级错误兜底（闸口1）。
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 动态 import 是 Next instrumentation 官方要求：register 在 edge runtime 也会被加载，
    // 静态引入 Node 专属模块（pino/fs）会导致 edge 打包失败。仅在 nodejs runtime 下加载。
    const { installProcessHandlers, logger } = await import('./lib/logger');
    installProcessHandlers();
    logger.info({ env: process.env.NODE_ENV }, 'process handlers installed, logger ready');
  }
}
