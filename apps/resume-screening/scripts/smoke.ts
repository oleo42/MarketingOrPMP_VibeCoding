/**
 * 端到端冒烟：用 test-fixtures/ 的合成简历跑通 建 run → processCandidate → 断言 DB。
 * LLM 通过依赖注入 mock（不真调 Anthropic API，不需要 ANTHROPIC_API_KEY）。
 * PDF 解析走真实 pdf-parse。
 *
 * 用法: npm run smoke
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { migrate, getDb, _resetDbForTest } from '../src/db';
import { processCandidate, setLlm } from '../src/lib/process';
import type { ExtractResult, ScoreResult } from '../src/llm/schemas';

const FIXTURES = ['zhangsan_frontend.pdf', 'lisi_pm.pdf', 'wangwu_junior.pdf', 'scanned_empty.pdf'];

const JD = `招聘：前端工程师（3 年以上经验）
要求：精通 React / TypeScript，有大型项目架构经验，熟悉 Next.js。`;

const mockExtracts: Record<string, ExtractResult> = {
  'zhangsan_frontend.pdf': {
    name: '张三',
    years_experience: 5,
    skills: ['React', 'TypeScript', 'Next.js', 'Node.js', 'Tailwind CSS', 'GraphQL'],
    highlights: ['电商中台前端架构，首屏加载降低 40%', '带领 3 人小组完成微前端迁移'],
    raw_summary: '5 年前端，React/TS 技术栈，有架构和带团队经验。',
  },
  'lisi_pm.pdf': {
    name: '李四',
    years_experience: 3,
    skills: ['需求分析', 'Axure', 'SQL', '数据分析', '用户调研', '敏捷管理'],
    highlights: ['主导 3 个大版本迭代，付费转化率提升 15%', '搭建数据看板体系'],
    raw_summary: '3 年 SaaS 产品经理，偏 CRM 和数据方向。',
  },
  'wangwu_junior.pdf': {
    name: '王五',
    years_experience: 0,
    skills: ['HTML', 'CSS', 'JavaScript', 'React'],
    highlights: ['校园二手交易平台课程项目'],
    raw_summary: '应届本科生，基础前端技能，无工作经验。',
  },
};

const mockScores: Record<string, ScoreResult> = {
  'zhangsan_frontend.pdf': {
    verdict: 'recommend',
    score: 92,
    reason: '技术栈完全匹配，5 年经验且有架构成果。',
    risks: ['无'],
  },
  'lisi_pm.pdf': {
    verdict: 'reject',
    score: 30,
    reason: '产品经理背景，与前端工程师岗位不匹配。',
    risks: ['岗位方向不符'],
  },
  'wangwu_junior.pdf': {
    verdict: 'hold',
    score: 55,
    reason: '基础尚可但无工作经验，可考虑实习岗。',
    risks: ['应届无经验', 'React 仅了解'],
  },
};

const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures.push(message);
    console.error(`  ✗ ${message}`);
  }
}

async function main(): Promise<void> {
  // 1. 隔离 DB：临时文件，不碰本地 data.db
  const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-')), 'smoke.db');
  process.env.DB_PATH = tmpDb;
  _resetDbForTest();
  migrate();

  // 2. Mock LLM（注入替代 Anthropic 调用）。
  // 注意：fixture PDF 用 pdfkit 内置 Helvetica 生成，无 CJK 字形，
  // 中文抽取出来是乱码，所以用 ASCII 邮箱定位候选人。
  const emailToFile: Record<string, string> = {
    'zhangsan@example.com': 'zhangsan_frontend.pdf',
    'lisi@example.com': 'lisi_pm.pdf',
    'wangwu@example.com': 'wangwu_junior.pdf',
  };
  setLlm({
    extractResume: async (text) => {
      const email = Object.keys(emailToFile).find((e) => text.includes(e));
      if (!email) throw new Error('mock extractResume: 未匹配的简历文本');
      return {
        data: mockExtracts[emailToFile[email]],
        usage: { input_tokens: 100, output_tokens: 50 },
      };
    },
    scoreCandidate: async (_jd, extract) => {
      const key = Object.keys(mockExtracts).find((k) => mockExtracts[k].name === extract.name);
      if (!key) throw new Error(`mock scoreCandidate: 未匹配的候选人 ${extract.name}`);
      return { data: mockScores[key], usage: { input_tokens: 200, output_tokens: 80 } };
    },
  });

  // 3. 建 run + candidates（直接走 DB，等价于 POST /api/runs 的效果）
  const db = getDb();
  const runId = db
    .prepare(`INSERT INTO runs (jd_text, total, status) VALUES (?, ?, 'processing')`)
    .run(JD, FIXTURES.length).lastInsertRowid as number;

  const insert = db.prepare(
    `INSERT INTO candidates (run_id, filename, file_path, parse_status) VALUES (?, ?, ?, 'pending')`
  );
  const candidateIds: Record<string, number> = {};
  for (const f of FIXTURES) {
    const filePath = path.join(process.cwd(), 'test-fixtures', f);
    if (!fs.existsSync(filePath)) {
      throw new Error(`缺少 fixture: ${filePath}（先运行 npx tsx scripts/gen-fixtures.ts）`);
    }
    candidateIds[f] = insert.run(runId, f, filePath).lastInsertRowid as number;
  }
  console.log(`run #${runId} created with ${FIXTURES.length} candidates`);

  // 4. 顺序跑 pipeline（等价于 POST /api/runs/[id]/process 的逐条处理）
  for (const f of FIXTURES) {
    await processCandidate(candidateIds[f]);
  }
  db.prepare(`UPDATE runs SET status = 'done', finished_at = datetime('now') WHERE id = ?`).run(
    runId
  );

  // 5. 断言
  console.log('\nassertions:');
  interface Row {
    filename: string;
    parse_status: string;
    ai_verdict: string | null;
    ai_score: number | null;
    extract_json: string | null;
    score_json: string | null;
  }
  const rows = db.prepare(`SELECT * FROM candidates WHERE run_id = ?`).all(runId) as Row[];
  const byFile: Record<string, Row | undefined> = Object.fromEntries(
    rows.map((r) => [r.filename, r])
  );

  for (const f of ['zhangsan_frontend.pdf', 'lisi_pm.pdf', 'wangwu_junior.pdf']) {
    const r = byFile[f];
    assert(!!r, `${f} 存在于 DB`);
    assert(r?.parse_status === 'scored', `${f} parse_status = scored (got ${r?.parse_status})`);
    assert(typeof r?.ai_score === 'number' && r.ai_score > 0, `${f} 有 AI 分数 (got ${r?.ai_score})`);
    assert(!!r?.ai_verdict, `${f} 有 AI 档位 (got ${r?.ai_verdict})`);
    assert(!!r?.extract_json && !!r?.score_json, `${f} extract/score JSON 已写入`);
  }

  const scanned = byFile['scanned_empty.pdf'];
  assert(
    scanned?.parse_status === 'needs_manual',
    `scanned_empty.pdf parse_status = needs_manual (got ${scanned?.parse_status})`
  );
  assert(scanned?.ai_score == null, 'scanned_empty.pdf 无 AI 分数');

  const run = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as {
    done: number;
    output_tokens: number;
    status: string;
  };
  assert(run.done === FIXTURES.length, `run.done = ${FIXTURES.length} (got ${run.done})`);
  assert(run.status === 'done', `run.status = done (got ${run.status})`);
  assert(run.input_tokens > 0 && run.output_tokens > 0, 'token 用量已累加');

  // 6. 清理
  fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`\nSMOKE FAILED: ${failures.length} 个断言失败`);
    process.exit(1);
  }
  console.log('\nSMOKE OK: 全流程通过（建 run → 解析 → 抽取 → 打分 → 断言 DB）');
}

main().catch((e: unknown) => {
  console.error('SMOKE ERROR:', e);
  process.exit(1);
});
