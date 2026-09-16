// 生成测试用合成简历 PDF 到 test-fixtures/
// 用法: npx tsx scripts/gen-fixtures.ts
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'test-fixtures');
fs.mkdirSync(outDir, { recursive: true });

const resumes: { file: string; text: string }[] = [
  {
    file: 'zhangsan_frontend.pdf',
    text: `张三
前端工程师 | 5年经验
电话: 13800000001 | 邮箱: zhangsan@example.com

技能: React, TypeScript, Next.js, Node.js, Tailwind CSS, GraphQL

工作经历:
2021-至今 某互联网公司 高级前端工程师
- 负责电商中台前端架构，QPS 10w+ 页面性能优化，首屏加载降低 40%
- 带领 3 人小组完成微前端迁移

2019-2021 某创业公司 前端工程师
- 从 0 搭建 C 端 App H5 页面，日活 50w

教育: 2015-2019 某大学 计算机科学与技术 本科`,
  },
  {
    file: 'lisi_pm.pdf',
    text: `李四
产品经理 | 3年经验
电话: 13800000002 | 邮箱: lisi@example.com

技能: 需求分析, Axure, SQL, 数据分析, 用户调研, 敏捷管理

工作经历:
2022-至今 某 SaaS 公司 产品经理
- 负责 CRM 产品线，主导 3 个大版本迭代，付费转化率提升 15%
- 搭建数据看板体系，接入 10+ 业务指标

2021-2022 某外包公司 产品助理

教育: 2017-2021 某大学 工商管理 本科`,
  },
  {
    file: 'wangwu_junior.pdf',
    text: `王五
前端开发实习生 | 应届
电话: 13800000003 | 邮箱: wangwu@example.com

技能: HTML, CSS, JavaScript, 了解 React

项目经历:
2024 校园二手交易平台（课程项目）
- 使用 Vue2 + Express 实现基础发布/浏览功能

教育: 2021-2025 某学院 软件工程 本科（在读）`,
  },
];

async function gen(r: { file: string; text: string }) {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(path.join(outDir, r.file));
    doc.pipe(stream);
    doc.fontSize(11).text(r.text, { lineGap: 3 });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
  console.log('wrote', r.file);
}

(async () => {
  for (const r of resumes) await gen(r);
  console.log('done ->', outDir);
})();
