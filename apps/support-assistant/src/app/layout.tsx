import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ClientErrorReporter from '@/components/ClientErrorReporter';
import './globals.css';

export const metadata: Metadata = {
  title: '邮件安全售后助理',
  description: 'AI 邮件安全排障问答：输入症状 → 检索案例 → 生成建议（含引用与置信度）',
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