// 生成多份有正确 CJK 文本层的真实风格简历 PDF，用于测试现有 pipeline（不依赖视觉模型）
// 用法: npx tsx scripts/gen-realistic-fixtures.ts
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'test-fixtures', 'realistic');
fs.mkdirSync(outDir, { recursive: true });

// 黑体（独立 ttf；pdfkit 不支持 .ttc 集合字体如 msyh.ttc，会报 createSubset is not a function）
const CJK_FONT = 'C:/Windows/Fonts/simhei.ttf';
const CJK_BOLD = 'C:/Windows/Fonts/simhei.ttf';
interface Resume { file: string; title: string; body: string[]; }

const resumes: Resume[] = [
  {
    file: 'senior_frontend_8y.pdf',
    title: '陈志远 — 高级前端工程师',
    body: [
      '电话：13911112222  邮箱：chenzy@example.com  城市：深圳',
      '求职意向：高级前端工程师 / 前端架构师',
      '',
      '【核心技能】',
      '精通 React / TypeScript / Next.js，8 年前端开发经验，5 年大型电商项目经验。',
      '熟悉微前端架构、性能优化、构建工具链（Webpack / Vite / esbuild）。',
      '主导过日均 PV 过亿的电商首页性能优化，首屏渲染从 3.2s 降至 0.9s。',
      '',
      '【工作经历】',
      '2019.03 - 至今   某头部电商公司   高级前端工程师 / 前端组长',
      '· 负责交易链路前端架构升级，带领 6 人团队完成微前端改造，发布效率提升 3 倍',
      '· 设计并落地前端监控体系，核心页面错误率下降 72%，挽回年化损失超千万',
      '· 推动 TypeScript 全量覆盖，代码缺陷率下降 40%',
      '2016.07 - 2019.02   某互联网金融公司   前端工程师',
      '· 独立负责理财 App H5 端开发，支撑百万级用户',
      '',
      '【教育背景】',
      '2012.09 - 2016.06   华南理工大学   计算机科学与技术   本科',
    ],
  },
  {
    file: 'mid_backend_java_5y.pdf',
    title: '刘建国 — Java 后端工程师',
    body: [
      '电话：13733334444  邮箱：liujg@example.com  城市：杭州',
      '求职意向：Java 后端开发工程师',
      '',
      '【核心技能】',
      '5 年 Java 后端经验，精通 Spring Boot / Spring Cloud / MySQL / Redis / Kafka。',
      '熟悉高并发系统设计，有分布式事务、消息队列、缓存架构实战经验。',
      '',
      '【工作经历】',
      '2021.04 - 至今   某物流公司   Java 高级工程师',
      '· 负责订单中台核心服务，日处理订单量 800 万，系统可用性 99.95%',
      '· 设计基于 Kafka 的异步削峰方案，大促期间系统平稳支撑 5 倍流量',
      '2019.07 - 2021.03   某外包公司   Java 开发工程师',
      '· 参与银行核心系统改造，负责账户模块开发',
      '',
      '【教育背景】',
      '2015.09 - 2019.06   浙江工业大学   软件工程   本科',
    ],
  },
  {
    file: 'junior_product_1y.pdf',
    title: '孙晓萌 — 产品经理助理',
    body: [
      '电话：13655556666  邮箱：sunxm@example.com  城市：北京',
      '求职意向：产品经理 / 产品助理',
      '',
      '【核心技能】',
      '1 年互联网产品实习+正式经验，熟悉 Axure / Figma / SQL / 数据分析。',
      '具备用户调研、需求文档撰写、原型设计、项目跟进全流程经验。',
      '',
      '【工作经历】',
      '2024.07 - 至今   某教育科技公司   产品助理',
      '· 协助完成在线题库产品迭代，独立负责 2 个功能模块的需求分析与落地',
      '· 通过用户访谈收集 200+ 条反馈，推动 3 项体验优化上线，NPS 提升 8 分',
      '',
      '【项目经历】',
      '2023.09 - 2024.06   校园二手书交易平台（创业项目）  产品负责人',
      '· 从 0 到 1 设计产品，上线 3 个月注册用户 5000+，撮合交易 800+ 笔',
      '',
      '【教育背景】',
      '2020.09 - 2024.06   北京工商大学   市场营销   本科',
    ],
  },
  {
    file: 'fresh_graduate.pdf',
    title: '林可欣 — 应届毕业生',
    body: [
      '电话：13577778888  邮箱：linkx@example.com  城市：广州',
      '求职意向：前端开发工程师（实习/校招）',
      '',
      '【技能】',
      '熟悉 HTML / CSS / JavaScript，了解 React 和 Vue，做过 3 个课程项目。',
      '英语六级 560 分，阅读技术文档无障碍。',
      '',
      '【项目经历】',
      '2024.03 - 2024.06   在线笔记应用（个人项目）',
      '· 使用 React + Tailwind 实现前端，LocalStorage 持久化，支持 Markdown',
      '2023.10 - 2023.12   校园失物招领平台（团队课程设计）',
      '· 负责前端页面开发，使用 Vue3 + Element Plus',
      '',
      '【教育背景】',
      '2021.09 - 2025.06（预计）  广东外语外贸大学   网络工程   本科在读',
    ],
  },
  {
    file: 'devops_6y.pdf',
    title: '赵天宇 — DevOps / SRE 工程师',
    body: [
      '电话：13899990000  邮箱：zhaoty@example.com  城市：上海',
      '求职意向：DevOps 工程师 / SRE',
      '',
      '【核心技能】',
      '6 年运维与 DevOps 经验，精通 Kubernetes / Docker / Terraform / Ansible。',
      '熟悉 CI/CD 体系建设、云原生架构、监控告警（Prometheus / Grafana / ELK）。',
      '',
      '【工作经历】',
      '2020.05 - 至今   某 SaaS 公司   DevOps 工程师',
      '· 主导容器化改造，将 50+ 服务迁移至 K8s，资源利用率提升 45%',
      '· 搭建 GitOps 流水线，部署频率从每周 1 次提升至每日 20+ 次',
      '2018.07 - 2020.04   某游戏公司   运维工程师',
      '· 负责游戏服务器日常运维与故障处理，保障 99.9% 可用性',
      '',
      '【教育背景】',
      '2014.09 - 2018.06   上海理工大学   网络工程   本科',
    ],
  },
];

async function gen(r: Resume) {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(path.join(outDir, r.file));
    doc.pipe(stream);
    doc.font(CJK_BOLD).fontSize(16).text(r.title, { align: 'center' });
    doc.moveDown(0.5);
    doc.font(CJK_FONT).fontSize(10);
    for (const line of r.body) {
      doc.text(line, { lineGap: 2 });
    }
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
