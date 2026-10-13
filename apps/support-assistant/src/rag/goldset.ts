// ============================================================
// gold set（迭代 #2：内容锚定重建）
// 原则修正（相对迭代 #1 的循环论证）：
//   ① query = 自然用户症状描述（客服邮件原话风格），不照抄 case 文件名/标题。
//   ② gold 判定锚定【正文 symptom/cause/resolution 含答案】，而非"文件名像 query"。
//   ③ 混入纯数字 title 的 case（title 索引零贡献），让 title 包庇不可能、只能靠正文检索命中。
//     —— 确保 recall 数字可辩护：它测的是"正文检索能否答对"，不是"标题命中"。
// reason 字段引用正文具体内容，证明锚定证据（非 LLM 猜 gold）。
// 覆盖真实主题分布 + 标题两类（描述性 20 / 纯数字 5）。
// ============================================================
import type { GoldQA } from './eval';

// goldSet 是【领域数据】（邮件安全案例的具体评测条目），不属于语料无关 core。
// GoldQA 契约定义在 eval.ts（core），这里只提供数据，不定义类型。

export const goldSet: GoldQA[] = [
  // ---------- 描述性 title 组（20 条），判定锚定正文 ----------
  {
    id: 'g01',
    query: 'legitimate inbound emails are quarantined even though SPF and DMARC pass; the DKIM check fails with body hash did not verify',
    goldDocIds: ['DKIM fail quarantine'],
    reason: '正文含 "dkim=fail (body hash did not verify)" + "legit inbound mail got quarantine"',
  },
  {
    id: 'g02',
    query: 'a mail service using amazonses through a cloud app shows P1 and P2 mismatch between mailfrom and headerfrom, and the recipient set sender domain pair',
    goldDocIds: ['demarc fail P1 P2 Mismatch spf dkim pass'],
    reason: '正文含 "P1 mailfrom amazonses / P2 headerfrom Cx domain" + "domain pair"',
  },
  {
    id: 'g03',
    query: 'autoforwarded mail bounces with NDR 550 5.7.509 access denied because the sending domain does not pass DMARC verification',
    goldDocIds: ['autoforward NDR DMARC FAIL'],
    reason: '正文含 "dmarc=fail action=oreject" + "550 5.7.509 Access denied ... does not pass DMARC verification"',
  },
  {
    id: 'g04',
    query: 'the protection.outlook.com SPF record 40.92.0.0/15 does not cover the 40.95.0.0 range that Microsoft is sending from',
    goldDocIds: ['spf subnet missing'],
    reason: '正文含 "40.92.0.0/15 should be a /14 to account for the IP range in the 40.95.0.0 range"',
  },
  {
    id: 'g05',
    query: 'mail routed through the mimecast cloud gateway got newly flagged, possibly after a mimecast domain change',
    goldDocIds: ['2402210036133 mimecast FP'],
    reason: '正文含 "internet-mimecast-exchange" + "maybe due to mimecast domain change"',
  },
  {
    id: 'g06',
    query: 'a user already added to the allowed-to-impersonate list still cannot receive mail sent from another sender',
    goldDocIds: ['user impersonation expected Singtel FN'],
    reason: '正文含 "Added into Policies & rules ... Impersonation Insight ... Allowed to Impersonate is Yes"',
  },
  {
    id: 'g07',
    query: 'more than 400 mails bombed a tenant inbox; engineer confirmed it is not a user compromise and 20 users are affected',
    goldDocIds: ['FN (False Negative) massive 20 user suspicious compromised'],
    reason: '正文含 "more than 400 mails to user inbox" + "20 users for now" + "not user compromised"',
  },
  {
    id: 'g08',
    query: 'a legitimate third-party activation link (ControlIQ for ANZ) is incorrectly flagged malicious by safelinks, and review submission says it should not have been blocked',
    goldDocIds: ['safelink fp 3rd party url submission succeed'],
    reason: '正文含 "controliq incorrectly being flagged as malicious by Safelinks" + "review submission ... should not have been blocked"',
  },
  {
    id: 'g09',
    query: 'an attachment is detected as the Virus:X97M/Laroux.A macro malware family and needs cleaning',
    goldDocIds: ['quarantined due to excel malware'],
    reason: '正文含 "clean the X97M/Laroux.A with ... malware-encyclopedia ... Virus:X97M/Laroux"',
  },
  {
    id: 'g11',
    query: '451 4.7.500 server busy, the sender IP was throttled by the recipient server',
    goldDocIds: ['EOP throttled Cx ip'],
    reason: '正文含 "451 4.7.500 Server busy" + "IPs were throttled by recipient server"',
  },
  {
    id: 'g12',
    query: 'mail delay because Exchange Online is throttling a newly added sender IP between on-prem and exchange online',
    goldDocIds: ['Exchange Online is throttling the sender 240221006629 mail delay'],
    reason: '正文含 "Delay is between Exchange Online and the on-prem or external sending server" + "too many recipients"',
  },
  {
    id: 'g13',
    query: 'smtp relay emails cause NDR because the O365 tenant cannot update DKIM or SPF',
    goldDocIds: ['smtp relay email NDR 2402220036306'],
    reason: '正文含 "can not updates DKIM or SPF" + "SMTP relay emails ... O365 tenant unable to accept"',
  },
  {
    id: 'g14',
    query: 'Microsoft server blacklisted by DNSBL and bl.spamcop.net keeps blacklisting microsoft IPs causing NDR',
    goldDocIds: ['microsoft DNSBL delist HRDP'],
    reason: '正文含 "Microsoft server blacklisted by DNSBL" + "bl.spamcop.net continues to blacklist microsoft ip"',
  },
  {
    id: 'g15',
    query: 'Gmail NDR shows SPF missing in auth even though SPF syntax and DKIM both check out fine',
    goldDocIds: ['Gmail NDR SPF MISSING'],
    reason: '正文含 "Checked SPF syntax ... SPF work fine" + "Checked DKIM nothing wrong" + "NDR header missing SPF record in auth"',
  },
  {
    id: 'g16',
    query: 'tenant block for internal and external mail due to URL reputation but no URL shows in the quarantine portal, 13 users and 200 blocks in two days',
    goldDocIds: ['False Positive URL reputaion release tenant block'],
    reason: '正文含 "tenant block for internal and external due to URL reputation but no URL in details" + "13 users, 200 block"',
  },
  {
    id: 'g17',
    query: '600+ emails quarantined due to an html attachment containing a redirect link back to the internal Oracle EBS application',
    goldDocIds: ['False Positive Attachment reputation detonation internal legit url before'],
    reason: '正文含 "Over 600 emails being quarantined" + "html file contains a redirect link back to our internal application Oracle EBS"',
  },
  {
    id: 'g18',
    query: 'an account receives NDR and reply emails for a message it never sent, traced to another Microsoft 365 tenant',
    goldDocIds: ['spoofed domain with another tenant '],
    reason: '正文含 "began to receive a large number of response emails and NDR about an email that has not been sent" + "came from another Microsoft365 tenant"',
  },
  {
    id: 'g19',
    query: 'a custom detection rule to automatically delete dropbox phishing share emails only deletes some of them',
    goldDocIds: ['detection rule automatically hard delete'],
    reason: '正文含 "created a custom detection rule to automatically delete these emails" + "only deleting some of the emails, not all"',
  },
  {
    id: 'g20',
    query: 'accidentally deleted 450000 emails with Defender remediation and need to recover them',
    goldDocIds: ['recover massive remediation detele'],
    reason: '正文含 "accidentally deleted 450,000 emails with Defender Remediation" + "recover those emails"',
  },

  // ---------- 纯数字 title 组（5 条）——title 索引零贡献，纯正文检索 ----------
  {
    id: 'g21',
    query: 'an internal teams meeting share email with a single PPT url got flagged as phishing',
    goldDocIds: ['2401230030003489'],
    reason: '正文含 "internal colleague teams meeting share email triggered as phishing email ... only shared one of PPT URL" + "URL Reputation"',
  },
  {
    id: 'g22',
    query: 'automated investigation actions take several days to run and status stays running with zero results',
    goldDocIds: ['2401170030006723'],
    reason: '正文含 "automated investigation actions cannot be executed within a reasonable period, it take several days" + "status was showing Running"',
  },
  {
    id: 'g23',
    query: 'dropbox system mail quarantined, was spam then hspam, need to know how SCL affects the spam allow list',
    goldDocIds: ['2401170060001416'],
    reason: '正文含 "dropbox 系統信件被隔離" + "hSPAM" + "scl 數值對 spam 白名單的影響"',
  },
  {
    id: 'g24',
    query: 'SCL=9 internal quarantine with anti-spam default safe, flagged phish due to a bad reputation URL in a pptx mail',
    goldDocIds: ['2401220030001923'],
    reason: '正文含 "SCL=9 internal quarantine anti-spam default sender list safe" + "flagged as Phish due to URLs with a bad reputation"',
  },
  {
    id: 'g25',
    query: 'need to read the .eml header to understand why a phishing email was sent to an unknown gmail address',
    goldDocIds: ['2401120030000640'],
    reason: '正文含 "find out the header of the .eml file" + "why the phishing email is sent to this unknown gmail address"',
  },
];