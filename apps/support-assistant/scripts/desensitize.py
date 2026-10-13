#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
脱敏脚本：Learning_ob_vault 邮件安全 case → 脱敏后的 RAG 语料。

用法（在项目根运行）：
  python apps/support-assistant/scripts/desensitize.py

输入：D:/Learning_ob_vault 下全部 `#case` 开头的 markdown
输出：
  apps/support-assistant/data/corpus.jsonl               # {id,title,text}  全文脱敏
  apps/support-assistant/data/chunks.jsonl               # by-file 单 chunk
  apps/support-assistant/data/desensitization-report.md  # 脱敏审计

脱敏规则（基于 2026-10-09 全量 PII 勘察，按泄露风险从高到低）：
  1. 微软内部工单/事件/告警链接 → 标记（整段脱，含域+路径）
  2. 明文密码/凭据行 → REDACTED（多行模式，命中行尾追加）
  3. GUID / UUID / Message-ID → REDACTED-ID
  4. 邮箱：白名单域保留，其余真实客户 → user@REDACTED.local
  5. .onmicrosoft.com 租户：仅 M365x*/MSDx* 演示租户保留，其余 → REDACTED-TENANT
  6. URL host / UNC host：白名单保留，其余 → REDACTED-HOST
  7. 通用域名兜底：任意非白名单域名 token（含 percent-encoded 里的、裸域名列表、
     markdown link text 里裸写的）→ REDACTED。TLD 白名单约束避免误伤技术文本。

原则：宁可多脱，不泄露客户身份。工具/厂商/知识域保留（脱了毁检索语义）。
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

VAULT = Path("D:/Learning_ob_vault")
OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# ---------------------------------------------------------------------------
# 白名单：公开工具 / 厂商 / 知识域（保留，携带检索语义，不携带客户身份）
# ---------------------------------------------------------------------------
KEEP_HOST_SUFFIXES = [
    # 微软公共（知识/产品/门户）
    "microsoft.com", "office.com", "office365.com", "office.net",
    "outlook.com", "azure.com", "azure.net", "live.com", "msn.com",
    "hotmail.com", "sharepoint.com", "aka.ms", "msft.com",
    "learn.microsoft.com", "docs.microsoft.com", "support.microsoft.com",
    "21vianet.com",          # 微软中国 21 世纪互联（运营商，非客户）
    # 公开代码/百科/标准
    "github.com", "raw.githubusercontent.com", "gist.github.com",
    "wikipedia.org", "wikimedia.org", "w3.org",
    # 第三方安全工具/厂商（case 里作为工具引用）
    "mimecast.com", "virustotal.com", "mxtoolbox.com",
    "docusign.com", "tryhackme.com", "spamcop.net",
    "pphosted.com",           # Proofpoint 托管域
    "threatsim.com", "caniphish.com", "mail-center-alert.net", "emaildistro.com",
    # 公共邮箱
    "gmail.com", "yahoo.com", "protonmail.com", "icloud.com",
    "qq.com", "163.com", "126.com", "gmx.de", "gmx.net", "web.de",
    # 基础设施/开发工具
    "cloudflare.com", "jsdelivr.net", "excalidraw.com", "brightdata.com",
    "brdtnet.com", "smartproxy.org", "diffbot.com", "varonis.com",
    "fireeye.com", "fireeyecloud.com", "service-now.com",
    # 占位
    "contoso.com", "example.com", "example.org", "example.net", "company.com",
]

# 演示租户前缀（微软测试租户，非真实客户，保留 onmicrosoft 域）
KEEP_TENANT_PREFIXES = ("m365x", "msdx")

# 已知顶级域名（约束通用域名匹配，避免误伤技术文本如版本号/文件扩展名）
# 多标签排序优先，保证 `streem.com.au` 按 `com.au` 整体匹配而非停在 `com`
_TLDS = sorted([
    # 通用
    "com", "net", "org", "info", "biz", "io", "co", "me", "tv", "cc",
    "xyz", "top", "dev", "app", "cloud", "ai", "tech", "online", "site",
    "store", "shop", "pro", "ltd", "edu", "gov",
    # 国家代码 + 常见二级
    "us", "uk", "au", "sg", "jp", "de", "fr", "cn", "ca", "mx", "nz",
    "in", "br", "hk", "tw", "kr", "es", "it", "nl", "se", "ch", "at",
    "be", "dk", "fi", "no", "pl", "ru", "pt", "za", "ae", "sa", "th",
    "my", "id", "vn", "ph", "tr", "il", "cl", "ar", "pe", "ie", "gr",
    "ro", "hu", "cz", "sk", "bg", "hr", "rs", "ua", "is", "lu", "mt",
    # 二级国家域（须比单层更早匹配）
    "co.uk", "co.jp", "co.kr", "co.in", "co.nz", "co.za", "co.id",
    "com.au", "com.sg", "com.hk", "com.mx", "com.br", "com.ar", "com.co",
    "com.tr", "com.tw", "com.cn", "com.my", "com.ph", "com.vn", "com.pk",
    "com.eg", "com.sa", "org.au", "org.uk", "org.nz", "net.au", "net.uk",
    "gov.uk", "gov.au", "gov.sg", "edu.au", "edu.sg", "ac.uk", "ac.jp",
    "ac.nz", "ac.za", "com.tw", "net.hk", "org.hk", "net.sg",
], key=len, reverse=True)

_TLD_ALT = "|".join(_TLDS)
# 完整域名 token：多标签 host + TLD（支持三级及以上域名）
DOMAIN_RE = re.compile(
    r"(?<![\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+" + f"(?:{_TLD_ALT})" + r"\b",
    re.I,
)


def keep_host(host: str) -> bool:
    """host 是否在白名单（含子域匹配）。"""
    h = host.lower().rstrip(".")
    return any(h == s or h.endswith("." + s) for s in KEEP_HOST_SUFFIXES)


# ---------------------------------------------------------------------------
# 内部工单/事件/告警链接（整段脱，优先级最高）
# ---------------------------------------------------------------------------
INTERNAL_URL_PATTERNS = [
    (re.compile(r"https?://(?:[a-z0-9.-]+\.)?(?:visualstudio\.com|dev\.azure\.com)\S*", re.I),
     "[internal-ticket]"),
    (re.compile(r"https?://portal\.microsofticm\.com\S*", re.I),
     "[internal-incident]"),
    (re.compile(r"https?://security\.microsoft\.com\S*", re.I),
     "[internal-alert]"),
    (re.compile(r"https?://(?:[a-z0-9.-]+\.)?kusto\.windows\.net\S*", re.I),
     "[internal-query]"),
    (re.compile(r"https?://dataexplorer\.azure\.com\S*", re.I),
     "[internal-query]"),
]

# markdown 链接 [text](url)：text 保留、url 脱敏。分组 1=text 部 2=右括号
INTERNAL_MD_PATTERNS = [
    (re.compile(r"(\[[^\]]*\]\()https?://(?:[a-z0-9.-]+\.)?(?:visualstudio\.com|dev\.azure\.com)\S*(\))", re.I),
     r"\1[internal-ticket]\2"),
    (re.compile(r"(\[[^\]]*\]\()https?://portal\.microsofticm\.com\S*(\))", re.I),
     r"\1[internal-incident]\2"),
    (re.compile(r"(\[[^\]]*\]\()https?://security\.microsoft\.com\S*(\))", re.I),
     r"\1[internal-alert]\2"),
    (re.compile(r"(\[[^\]]*\]\()https?://(?:[a-z0-9.-]+\.)?kusto\.windows\.net\S*(\))", re.I),
     r"\1[internal-query]\2"),
]

GUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
SHORT_ID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
MESSAGE_ID_RE = re.compile(r"<[A-Za-z0-9._%+-]{10,}@[A-Za-z0-9.\-]+>")

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

# .onmicrosoft.com 租户（单独处理，先于通用域，保证租户规则优先）
ONMS_RE = re.compile(r"[a-z0-9.-]+\.onmicrosoft\.com", re.I)

# 密码/凭据行（re.M 多行模式，命中行尾追加 REDACTED）
PASSWORD_LINE_RE = re.compile(r"^(.*\bpassword\b.*)$", re.I | re.M)

# 已知明文凭据（精确字面替换，避免窄启发式误伤 email header 里的 `^` 技术 token）。
# 来源：david lao 2401240062286.md 里的测试租户 admin 密码，唯一一处高置信明文。
KNOWN_SECRETS = [
    "H+C8;^S5a9hR;w1k",
]

# 已知客户实体（穷举自 107 个 case 的高置信实体，精确替换，非启发式不误伤）。
# 组内按长→短排序，保证子串先替换。
KNOWN_ORG_NAMES = [
    "Nuvoton Technology Corporation",
    "Thomson Reuters Canada",
    "Thomson Reuters",
    "Te Whatu Ora",
    "Te Aka Whai Ora",
    "Capital & Coast",
    "Hutt Valley",
    "Wairarapa",
    "Silverado Resort",
    "IQAX",
]

KNOWN_PERSON_NAMES = [
    "Matt Markiewicz",
    "Bryan Johnson",
    "Qui Tran",
    "Rasika Ambepitiyage",
]

# 公共/白名单邮箱里的人名 local part（域名被白名单保留时，local part 泄露真实人名）
KNOWN_PERSON_LOCAL = [
    "markiewiczm36",
    "rasikaambepitiyage",
    "cilaleo00",
    "officeoline3001",
]

# M365 B2B guest UPN：<source>#EXT#@<tenant>，source 形如 henry.kwok_iqax.com
#（含客户域 + 人名，不管域是否白名单都脱，guest source 恒有身份语义）
GUEST_UPN_RE = re.compile(r"[a-zA-Z0-9._%+-]+(?=#[Ee][Xx][Tt]#)")

# 已知人名标题清洗（case 文件名里唯一高置信的客户侧人名）
KNOWN_PERSON_NAME = "david lao"


def deidentify(text: str) -> tuple[str, Counter]:
    """脱敏文本。返回 (脱敏后文本, 统计 Counter)。"""
    stats = Counter()

    # 1. markdown 内部链接（先处理 [text](url) 形式，保留 text）
    for pat, repl in INTERNAL_MD_PATTERNS:
        text, n = pat.subn(repl, text)
        stats["internal_md_url"] += n
    # 裸内部链接
    for pat, repl in INTERNAL_URL_PATTERNS:
        text, n = pat.subn(repl, text)
    # 2. 明文密码行
    def _pwd(m: re.Match) -> str:
        stats["password_line"] += 1
        return m.group(1).rstrip() + " REDACTED"

    text = PASSWORD_LINE_RE.sub(_pwd, text)

    # 3. 已知明文凭据精确替换
    for secret in KNOWN_SECRETS:
        if secret in text:
            stats["known_secret"] += text.count(secret)
            text = text.replace(secret, "REDACTED-SECRET")

    # 4. 已知客户实体精确替换（组织名 → REDACTED-ORG，人名 → REDACTED-PERSON）
    for org in KNOWN_ORG_NAMES:
        # 大小写不敏感匹配（IQAX 大小写混合、全大写等变体），按匹配原样替换
        if org.lower() in text.lower():
            stats["known_org"] += text.lower().count(org.lower())
            text = re.sub(re.escape(org), "REDACTED-ORG", text, flags=re.I)
    for person in KNOWN_PERSON_NAMES:
        if person in text:
            stats["known_person"] += text.count(person)
            text = text.replace(person, "REDACTED-PERSON")
    for local in KNOWN_PERSON_LOCAL:
        if local in text:
            stats["known_person_local"] += text.count(local)
            text = text.replace(local, "redacted-user")
    # B2B guest UPN source（henry.kwok_iqax.com#ext#...）→ redacted-guest
    text, n = GUEST_UPN_RE.subn("redacted-guest", text)
    stats["guest_upn"] += n
    # 5. GUID / UUID / Message-ID
    text, n = GUID_RE.subn("REDACTED-ID", text)
    stats["guid"] += n
    text, n = SHORT_ID_RE.subn("REDACTED-ID", text)
    stats["short_id"] += n
    text, n = MESSAGE_ID_RE.subn("REDACTED-ID", text)
    stats["message_id"] += n

    # 6. .onmicrosoft.com 租户（优先于通用域名处理）
    def _onms(m: re.Match) -> str:
        tenant = m.group(0).split(".")[0]
        if tenant.lower().startswith(KEEP_TENANT_PREFIXES):
            stats["tenant_kept"] += 1
            return m.group(0)
        stats["tenant_redacted"] += 1
        return "REDACTED-TENANT.onmicrosoft.com"

    text = ONMS_RE.sub(_onms, text)

    # 7. 邮箱（白名单域名保留，其余脱）
    def _email(m: re.Match) -> str:
        addr = m.group(0)
        domain = addr[addr.rfind("@") + 1:].lower()
        if keep_host(domain):
            stats["email_kept"] += 1
            return addr
        stats["email_redacted"] += 1
        return "user@REDACTED.local"

    text = EMAIL_RE.sub(_email, text)

    # 8. 标准 URL host（http(s)://，白名单保留，其余 REDACTED-HOST）
    URL_HOST_RE = re.compile(r"(https?://)([a-zA-Z0-9.-]+)(/[^\s<]*)?")
    def _url_host(m: re.Match) -> str:
        scheme, host, rest = m.group(1), m.group(2), m.group(3) or ""
        if "REDACTED" in host:
            return m.group(0)
        if keep_host(host):
            stats["url_host_kept"] += 1
            return m.group(0)
        stats["url_host_redacted"] += 1
        return f"{scheme}REDACTED-HOST{rest}"

    text = URL_HOST_RE.sub(_url_host, text)

    # 9. UNC 路径：\\host\...（客户共享路径）
    UNC_RE = re.compile(r"\\\\{1,2}([a-zA-Z0-9.-]+)(\\[^\s<]*)?")
    def _unc_host(m: re.Match) -> str:
        host = m.group(1)
        if "REDACTED" in host or "." not in host or keep_host(host):
            return m.group(0)
        stats["unc_redacted"] += 1
        return "\\\\REDACTED-HOST" + (m.group(2) or "")

    text = UNC_RE.sub(_unc_host, text)

    # 10. 通用域名兜底：任意非白名单域名 token（percent-encoded 里的、裸域名列表、
    #     markdown link text 里裸写的、内部工单域名文字标记等）
    def _domain(m: re.Match) -> str:
        tok = m.group(0)
        if "REDACTED" in tok:
            return tok
        # 内部工单域：整段已标记过，此处的裸文字也统一标记
        if tok.lower().endswith((".visualstudio.com", "dev.azure.com", "microsofticm.com")):
            stats["internal_bare_url"] += 1
            return "[internal]"
        if keep_host(tok):
            stats["domain_kept"] += 1
            return tok
        stats["domain_redacted"] += 1
        return "REDACTED"

    text = DOMAIN_RE.sub(_domain, text)

    return text, stats


def iter_case_files() -> list[Path]:
    """收集 vault 下全部 #case 文件（排除 templates）。

    用全文件匹配 `^#case\\b`（与 corpus.ts 的 parseCaseFile 完全一致），
    而不是只看头部——有 2 个 case 的 `#case` 出现在文件中部
    （permission issue sop.md / user tag and guest UPN not match.md）。
    """
    files = []
    for p in VAULT.rglob("*.md"):
        if "templates" in p.parts:
            continue
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if re.search(r"^#case\b", txt, re.M):
            files.append(p)
    return sorted(files)


def clean_title(filename: str) -> str:
    """标题清洗：去掉已知人名，保留 case 描述/id 语义。"""
    stem = filename[:-3] if filename.lower().endswith(".md") else filename
    if KNOWN_PERSON_NAME in stem.lower():
        stem = re.sub(re.escape(KNOWN_PERSON_NAME), "", stem, flags=re.I).strip()
        stem = re.sub(r"^[\s\-_]+", "", stem)
    return stem


def main() -> None:
    files = iter_case_files()
    print(f"case 文件: {len(files)} 个")

    corpus_docs, chunks = [], []
    total_stats = Counter()

    for p in files:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        text, stats = deidentify(raw)
        for k, v in stats.items():
            total_stats[k] += v

        doc_id = p.stem
        title = clean_title(p.name)
        corpus_docs.append({"id": doc_id, "title": title, "text": text})
        # by-file 单 chunk（与 chunker.ts 的 by-file 策略一致）
        if text.strip():
            chunks.append({
                "id": f"{doc_id}:0",
                "docId": doc_id,
                "title": title,
                "text": text,
                "meta": {"index": 0, "total": 1},
            })

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    def _write_jsonl(path: Path, rows: list[dict]) -> None:
        with open(path, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    corpus_path = OUT_DIR / "corpus.jsonl"
    chunks_path = OUT_DIR / "chunks.jsonl"
    _write_jsonl(corpus_path, corpus_docs)
    _write_jsonl(chunks_path, chunks)

    label_map = {
        "internal_md_url": "markdown 内部工单链接",
        "internal_url": "裸内部工单链接",
        "internal_bare_url": "裸内部工单域名文字",
        "password_line": "明文密码行",
        "known_person_local": "客户邮箱本地名（脱敏）",
        "guest_upn": "B2B guest UPN（脱敏）",
        "known_secret": "已知明文凭据（精确替换）",
        "guid": "GUID（8-4-4-4-12）",
        "message_id": "Message-ID",
        "tenant_kept": "演示租户（保留）",
        "tenant_redacted": "真实客户租户（脱敏）",
        "email_kept": "公共邮箱（保留）",
        "email_redacted": "真实客户邮箱（脱敏）",
        "url_host_kept": "工具/厂商 URL 域（保留）",
        "url_host_redacted": "真实客户 URL 域（脱敏）",
        "unc_redacted": "UNC 客户共享路径（脱敏）",
        "domain_kept": "工具/厂商域名 token（保留）",
        "domain_redacted": "客户域名 token（脱敏）",
        "known_org": "客户组织名（脱敏）",
        "known_person": "客户人名（脱敏）",
        "known_person_local": "客户邮箱本地名（脱敏）",
        "guest_upn": "B2B guest UPN（脱敏）",
    }

    # 审计报告
    report_lines = [
        "# 脱敏审计报告",
        "",
        f"- case 文件数：{len(files)}",
        f"- 输出文档数：{len(corpus_docs)}",
        f"- 输出 chunk 数：{len(chunks)}",
        "",
        "## 脱敏统计",
        "",
        "| 类别 | 数量 |",
        "|---|---|",
    ]
    for k in sorted(label_map):
        report_lines.append(f"| {label_map[k]} | {total_stats.get(k, 0)} |")

    report_lines += [
        "",
        "## 输出",
        "",
        f"- `data/corpus.jsonl` → {corpus_path}",
        f"- `data/chunks.jsonl` → {chunks_path}",
    ]
    report_path = OUT_DIR / "desensitization-report.md"
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print("\n脱敏统计:")
    for k in sorted(label_map):
        print(f"  {label_map[k]}: {total_stats.get(k, 0)}")
    print(f"\n已写出:\n  {corpus_path}\n  {chunks_path}\n  {report_path}")


if __name__ == "__main__":
    main()