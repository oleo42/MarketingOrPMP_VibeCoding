import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * 闸口2 接收端：前端错误回传落进程日志。
 * 与后端错误汇合到同一 logs/app.log，排障时一处可查。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      source?: string;
      message?: string;
      stack?: string;
      url?: string;
      ua?: string;
      [k: string]: unknown;
    };
    logger.error(
      {
        channel: 'client',
        source: body.source ?? 'unknown',
        message: body.message,
        stack: body.stack,
        url: body.url,
        ua: body.ua,
        extra: body,
      },
      `client error: ${body.message ?? 'unknown'}`
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ channel: 'client', err: String(e) }, 'failed to record client error');
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
