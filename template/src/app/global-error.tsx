'use client';

// ============================================================
// React 渲染崩溃的兜底（闸口2 的另一半）
// 从 resume-screening 原样泛化——无业务耦合。
// Next.js App Router 约定文件：根布局本身崩掉时用它渲染。
// 把错误回传服务端，不让它只留在浏览器 console。
// ============================================================
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 渲染崩溃时尽力回传（不 await，避免阻塞）
  if (typeof window !== 'undefined') {
    fetch('/api/log/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'global-error',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
        ua: navigator.userAgent,
      }),
    }).catch(() => {});
  }

  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'sans-serif', padding: 40 }}>
        <h2>页面出错了</h2>
        <p style={{ color: '#666' }}>{error.message}</p>
        <button
          onClick={reset}
          style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
