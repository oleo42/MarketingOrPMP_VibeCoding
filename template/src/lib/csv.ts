// ============================================================
// 通用 CSV 导出（四段式 · 第 4 段）
// 从 apps/resume-screening/src/lib/csv.ts 原样泛化，无任何业务耦合。
// ============================================================

/** 序列化行为 CSV，正确处理引号/逗号/换行转义。空数组返回空串。 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * 中文 CSV 实用细节（resume-screening 踩过的点）：
 * - 导出入口加 BOM：'\uFEFF' + toCsv(rows)，否则 Excel 打开中文乱码。
 * - 响应头：'Content-Type': 'text/csv; charset=utf-8' +
 *   'Content-Disposition': `attachment; filename=batch_${id}.csv`
 * - 列头直接用中文（"姓名"/"分数"），业务用户零学习成本。
 */
