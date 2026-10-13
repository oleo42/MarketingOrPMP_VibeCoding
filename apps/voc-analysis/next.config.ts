import type { NextConfig } from 'next';

// 根因修复(2026-10-14,第二次复发)：next dev 和 next build 默认共用 .next/ 目录。
// dev server 长驻内存持有编译好的 chunk 引用,build 会清空重写 .next/,
// dev 再响应请求时按旧引用找已被删除的 chunk(如 897.js) → "Cannot find module './NNN.js'"。
// 修复:build 用独立 distDir(.next-build),dev 用默认 .next,物理隔离永不冲突。
// 用法:build 命令带环境变量 NEXT_BUILD_DIR(见 package.json scripts.build)。
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
};

export default nextConfig;
