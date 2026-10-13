// ============================================================
// judge 校准集：人工标签的 ground truth，用于标定 judge 的 faithfulness 区分度。
// 每条 = { query, context(s), answer, faithful(人工标签) }
// answer 分两类：
//   - faithful=true  ：严格引用 context，不编造
//   - faithful=false ：编造不在 context 里的 PowerShell 命令 / Microsoft 文档 / 步骤
// judge 的 faithfulness 分数应能区分两组（真实跑 judge 后算 AUC / 均值差）。
// 主题基于真实语料（同上 gold set 的主题分布），answer 由人工代拟以保证标签可靠。
// 校准验收阈值：faithful 组均值 - fabricated 组均值 ≥ 0.5，且无交叉判反。
// ============================================================

export interface JudgeCalibrationItem {
  id: string;
  query: string;
  contexts: string[];       // 检索上下文（精简的真实 case 大意）
  answer: string;           // 被评判的答案
  faithful: boolean;        // 人工标签：答案是否忠于上下文（true=未编造）
}

export const judgeCalibrationSet: JudgeCalibrationItem[] = [
  {
    id: 'jc01',
    query: 'why is my domain quarantined as phish',
    contexts: ['Mimecast domain falsely flagged, resolved by submitting false-positive to tenant allow list'],
    answer: 'Your domain was flagged by Mimecast as a false positive. Submit a false-positive report and add the domain to the tenant allow list.',
    faithful: true,
  },
  {
    id: 'jc02',
    query: 'why is my domain quarantined as phish',
    contexts: ['Mimecast domain falsely flagged, resolved by submitting false-positive to tenant allow list'],
    answer: 'Run Set-DomainPhishOverride -Enabled $true in Exchange Online PowerShell, then restart the transport service.',
    faithful: false,
  },
  {
    id: 'jc03',
    query: 'DKIM failure causing quarantine',
    contexts: ['DKIM alignment failed because selector not published in DNS; fix by publishing correct DKIM selector'],
    answer: 'The DKIM selector is not published in DNS, so alignment fails and mail is quarantined. Publish the correct selector to fix.',
    faithful: true,
  },
  {
    id: 'jc04',
    query: 'DKIM failure causing quarantine',
    contexts: ['DKIM alignment failed because selector not published in DNS; fix by publishing correct DKIM selector'],
    answer: 'This is a known tenant-wide outage; Microsoft will resolve it within 24 hours automatically.',
    faithful: false,
  },
  {
    id: 'jc05',
    query: 'DMARC P1 P2 mismatch',
    contexts: ['P1 and P2 alignment mismatch even though SPF and DKIM pass; caused by relaxed DMARC policy gap'],
    answer: 'SPF and DKIM both pass but P1/P2 mismatch indicates a DMARC alignment gap. The relaxed policy allowed the mismatch.',
    faithful: true,
  },
  {
    id: 'jc06',
    query: 'DMARC P1 P2 mismatch',
    contexts: ['P1 and P2 alignment mismatch even though SPF and DKIM pass; caused by relaxed DMARC policy gap'],
    answer: 'Use the New-ComplianceSearch cmdlet to find the mismatch in the audit log, then purge the offending messages.',
    faithful: false,
  },
  {
    id: 'jc07',
    query: 'autoforward NDR due to DMARC',
    contexts: ['Autoforward failing with NDR because DMARC fails on forwarded mail'],
    answer: 'Autoforwarded mail fails DMARC so the NDR is generated. The forward breaks DMARC alignment.',
    faithful: true,
  },
  {
    id: 'jc08',
    query: 'autoforward NDR due to DMARC',
    contexts: ['Autoforward failing with NDR because DMARC fails on forwarded mail'],
    answer: 'Enable EOP auto-forwarding exemption for all domains via Set-TransportConfig -ForwardingProhibited $false.',
    faithful: false,
  },
  {
    id: 'jc09',
    query: 'safelink URL flagged as phish',
    contexts: ['3rd-party URL submitted through safelink, then flagged; fix by safelink false-positive report'],
    answer: 'A 3rd-party URL submitted through Safelink was flagged. Report it as a Safelink false positive to release.',
    faithful: true,
  },
  {
    id: 'jc10',
    query: 'safelink URL flagged as phish',
    contexts: ['3rd-party URL submitted through safelink, then flagged; fix by safelink false-positive report'],
    answer: 'The URL was flagged because your tenant has no Microsoft Defender P2 license; upgrade to unblock.',
    faithful: false,
  },
  {
    id: 'jc11',
    query: 'excel malware attachment quarantined',
    contexts: ['Excel attachment with embedded macro quarantined by malware filter'],
    answer: 'The Excel attachment contained a macro and was quarantined by the malware filter. This is expected behavior.',
    faithful: true,
  },
  {
    id: 'jc12',
    query: 'excel malware attachment quarantined',
    contexts: ['Excel attachment with embedded macro quarantined by malware filter'],
    answer: 'Disable the entire malware filter in your tenant via the security center to stop future false positives.',
    faithful: false,
  },
  {
    id: 'jc13',
    query: 'EOP throttling sender causing delay',
    contexts: ['Sender IP throttled by EOP rate limiting, causing mail delay'],
    answer: 'The sender IP is being rate-limited by EOP throttling, causing the delay.',
    faithful: true,
  },
  {
    id: 'jc14',
    query: 'EOP throttling sender causing delay',
    contexts: ['Sender IP throttled by EOP rate limiting, causing mail delay'],
    answer: 'Whitelist the IP permanently by adding it to the global safe senders list in the M365 admin portal.',
    faithful: false,
  },
  {
    id: 'jc15',
    query: 'spoofed domain from another tenant',
    contexts: ['Mail spoofed from a domain in a different tenant; detected via DMARC/DKIM but user reported FK'],
    answer: 'The spoof used a domain from another tenant, detected by DKIM/DMARC checks but reported as false negative.',
    faithful: true,
  },
  {
    id: 'jc16',
    query: 'spoofed domain from another tenant',
    contexts: ['Mail spoofed from a domain in a different tenant; detected via DMARC/DKIM but user reported FK'],
    answer: 'Delete the spoofed domain from your account settings and change your password immediately.',
    faithful: false,
  },
  {
    id: 'jc17',
    query: 'user impersonation expected Singtel',
    contexts: ['User impersonation false negative where a Singtel sender was not flagged'],
    answer: 'The Singtel sender impersonation was not flagged (false negative). This is an impersonation detection gap.',
    faithful: true,
  },
  {
    id: 'jc18',
    query: 'user impersonation expected Singtel',
    contexts: ['User impersonation false negative where a Singtel sender was not flagged'],
    answer: 'All Singtel mail is always safe; add the entire Singtel domain to the safe sender allow list.',
    faithful: false,
  },
  {
    id: 'jc19',
    query: 'compromised user detected but false negative',
    contexts: ['Compromised user activity detected late (false negative) because sign-in anomaly missed'],
    answer: 'The compromise was missed by sign-in anomaly detection, causing a false negative.',
    faithful: true,
  },
  {
    id: 'jc20',
    query: 'compromised user detected but false negative',
    contexts: ['Compromised user activity detected late (false negative) because sign-in anomaly missed'],
    answer: 'Reset the user password, then run Get-ExoMailboxStatistics to confirm no mail was exfiltrated.',
    faithful: false,
  },
];