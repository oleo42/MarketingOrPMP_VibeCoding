// 用真实风格中文简历（有文本层）验证现有 pipeline，不依赖视觉模型
// 用法: npx tsx scripts/verify-realistic.ts
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'ark';
import { getDb, migrate } from '../src/db/index';
import { processCandidate } from '../src/lib/process';
import fs from 'fs';

const DB = './data-realistic.db';
process.env.DB_PATH = DB;
for (const s of ['', '-wal', '-shm']) if (fs.existsSync(DB + s)) fs.rmSync(DB + s);

const JD = '高级前端工程师：5年以上React/TypeScript经验，有大型电商或中台经验优先，熟悉性能优化，本科及以上。';
const files = [
  'senior_frontend_8y.pdf',
  'mid_backend_java_5y.pdf',
  'junior_product_1y.pdf',
  'fresh_graduate.pdf',
  'devops_6y.pdf',
];

async function main() {
  migrate();
  const db = getDb();
  const run = db.prepare('INSERT INTO runs(jd_text,total,status) VALUES(?,?,?)').run(JD, files.length, 'running');
  const runId = Number(run.lastInsertRowid);
  for (const f of files) {
    db.prepare('INSERT INTO candidates(run_id,filename,file_path) VALUES(?,?,?)').run(
      runId, f, 'test-fixtures/realistic/' + f);
  }
  const cands = db.prepare('SELECT id FROM candidates WHERE run_id=?').all(runId) as { id: number }[];
  for (const c of cands) {
    await processCandidate(c.id);
    process.stdout.write(`done#${c.id} `);
  }
  console.log('\n--- results ---');
  const rows = db.prepare(
    `SELECT filename, parse_status, ai_verdict, ai_score,
            json_extract(extract_json,'$.name') as name,
            json_extract(extract_json,'$.years_experience') as yrs,
            substr(json_extract(score_json,'$.reason'),1,40) as reason
     FROM candidates WHERE run_id=? ORDER BY ai_score DESC`).all(runId);
  for (const r of rows) console.log(JSON.stringify(r));
  const agg = db.prepare('SELECT done,input_tokens,output_tokens FROM runs WHERE id=?').get(runId);
  console.log('run:', JSON.stringify(agg));
  const fail = (rows as {parse_status:string}[]).filter(r => r.parse_status !== 'scored');
  console.log(fail.length === 0 ? 'ALL SCORED OK' : `NON-SCORED: ${fail.length}`);
  for (const s of ['', '-wal', '-shm']) if (fs.existsSync(DB + s)) fs.rmSync(DB + s);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
