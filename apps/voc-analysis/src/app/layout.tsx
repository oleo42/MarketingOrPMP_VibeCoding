import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ClientErrorReporter from '@/components/ClientErrorReporter';
import './globals.css';

export const metadata: Metadata = {
  title: 'VoC 用户之声 · 卖点共鸣榜',
  description: '消费电子用户评价 → 情感分类 → 卖点共鸣榜：GTM 看用户真实认可哪些卖点',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
