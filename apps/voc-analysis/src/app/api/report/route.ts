// 报告导出：先重跑 export_report.py 确保报告反映最新数据，再返回 Markdown 供下载。
// 市场及格线#4（可导出报告，GTM 标准交付物）。前端"导出报告"按钮触发。
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = process.cwd(); // apps/voc-analysis
const PY = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
const REPORT = path.join(ROOT, 'pipeline', 'data', 'report_latest.md');
const run = promisify(execFile);

export async function GET() {
  try {
    // 重跑报告生成（快，<1s），确保导出的是当前数据；失败则用磁盘上已有的
    try {
      await run(PY, ['pipeline/export_report.py'], { cwd: ROOT, timeout: 30000 });
    } catch { /* 生成失败则读旧报告 */ }
    const md = await readFile(REPORT, 'utf-8');
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="voc_report_${date}.md"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
