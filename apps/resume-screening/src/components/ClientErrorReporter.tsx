'use client';

import { useEffect } from 'react';

/**
 * 闸口2：浏览器运行时错误回传。
 * window.onerror + unhandledrejection → POST /api/log/client。
 * 覆盖 console 报错、未捕获的 Promise 拒绝、资源加载失败等只活在浏览器里的问题。
 * hydration 类外部注入（浏览器扩展改 DOM）也会以 error 事件形式被捕获。
 */
export default function ClientErrorReporter() {
  useEffect(() => {
    const report = (payload: Record<string, unknown>) => {
      fetch('/api/log/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          url: window.location.href,
          ua: navigator.userAgent,
          ts: new Date().toISOString(),
        }),
      }).catch(() => {});
    };

    const onError = (event: ErrorEvent) => {
      report({
        source: 'window.onerror',
        message: event.message,
        stack: event.error?.stack,
        file: event.filename,
        line: event.lineno,
        col: event.colno,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report({
        source: 'unhandledrejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
