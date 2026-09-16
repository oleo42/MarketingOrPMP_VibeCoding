// 真实 LLM 端到端验证：用 Ark 跑 3 份测试简历
// 用法: npm run verify:real  (需要 VOLCENGINE_API_KEYwinomp)
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'ark';
import { getDb, migrate } from '../src/db/index';
import { processCandidate } from '../src/lib/process';
import fs from 'fs';

const DB = process.env.DB_PATH || './data-verify.db';
process.env.DB_PATH = DB;
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(DB + suffix)) fs.rmSync(DB + suffix);
}

async function main() {
  migrate();
  const db = getDb();
  const jd =
    '高级前端工程师：5年以上React/TypeScript经验，有大型电商或中台经验优先，熟悉性能优化，本科及以上。';
  const run = db.prepare('INSERT INTO runs(jd_text,total,status) VALUES(?,?,?)').run(jd, 3, 'running');
  const runId = Number(run.lastInsertRowid);
  const files = ['zhangsan_frontend.pdf', 'lisi_pm.pdf', 'wangwu_junior.pdf'];
  for (const f of files) {
    db.prepare('INSERT INTO candidates(run_id,filename,file_path) VALUES(?,?,?)').run(
      runId,
      f,
      'test-fixtures/' + f
    );
  }
  const cands = db.prepare('SELECT id FROM candidates WHERE run_id=?').all(runId) as { id: number }[];
  for (const c of cands) {
    await processCandidate(c.id);
    console.log('processed candidate', c.id);
  }
  const rows = db
    .prepare(
      `SELECT c.filename, c.parse_status, c.ai_verdict, c.ai_score,
              json_extract(c.score_json,'$.reason') as reason
       FROM candidates c WHERE c.run_id=? ORDER BY c.ai_score DESC`
    )
    .all(runId);
  console.log(JSON.stringify(rows, null, 2));
  const r = db
    .prepare('SELECT done,input_tokens,output_tokens,status FROM runs WHERE id=?')
    .get(runId);
  console.log('run:', JSON.stringify(r));
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(DB + suffix)) fs.rmSync(DB + suffix);
  }
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e);
  process.exit(1);
});
