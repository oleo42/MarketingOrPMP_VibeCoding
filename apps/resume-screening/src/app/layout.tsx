import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Resume Screening',
  description: 'Resume screening agent',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
