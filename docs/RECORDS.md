# 记录台账

所有关键阶段产出的登记表。规则：每次落盘后在会话内回执（状态/位置/用处），并在此追加一行。

| 日期 | 记录 | 位置 | 状态 | 用处 |
|---|---|---|---|---|
| 2026-09-16 | vibecoding 系统清单（17 项）与工程加速方案 | docs/analysis/2026-09-16-vibecoding-catalog-and-acceleration.md | 已记录 | 选型决策依据；首个系统设计的需求池 |
| 2026-09-16 | 项目约定（业务背景；记录纪律改为引用全局） | .omp/AGENTS.md | 已更新 | 项目特有信息载体；记录规则唯一定义在全局文件 |
| 2026-09-16 | 全局"关键阶段自动记录"约定（含技术哲学原则） | D:/omp/platform/agent/AGENTS.md §关键阶段自动记录（已 deploy 至 ~/.omp/agent/AGENTS.md） | 已记录 | 所有项目每会话自动注入；记录节点/台账/回执三条的唯一权威定义 |
| 2026-09-16 | 项目发布：oleo42/MarketingOrPMP_VibeCoding（公开仓，SSH 别名推送） | https://github.com/oleo42/MarketingOrPMP_VibeCoding（remote: oleo42 = git@github-oleo42） | 已记录 | 方案库与后续实现的公开主页 |
| 2026-09-16 | 凭据地图新增"多账号身份一致性"规则（建仓即设 repo-local noreply 身份） | D:/omp/platform/agent/AGENTS.md §凭据地图（已 deploy） | 已记录 | 防止再次出现发布账号与贡献者不一致 |
| 2026-09-16 | 仓库重建：删旧仓（含悬空 Leon commit）→ oleo42 名下重建公开仓 → 推送干净历史（2 commit 全 oleo42） | https://github.com/oleo42/MarketingOrPMP_VibeCoding | 已记录 | contributors/commits API 实查均仅 oleo42，归属一致闭环 |
| 2026-09-16 | Wave 1 简历初筛 Agent 交付（真实 Ark LLM 端到端验证通过：上传→打分→审核队列→改判→导出 CSV 全链路） | apps/resume-screening/（spec: docs/specs/2026-09-16-resume-screening-agent.md，plan: docs/plans/2026-09-16-resume-screening-agent.md） | 已记录 | 首个可演示系统；母模板的事实来源 |
| 2026-09-16 | 母模板 + 《Agent 工程化手册》（四段式架构 + 5 步新系统流程 + 17 系统定制索引 + 三条红线） | template/（手册: template/README.md，模式: template/docs/patterns.md） | 已记录 | 后续 14 个系统复用基础；业务专家自助开发指南（JD 核心交付物） |
| 2026-09-16 | 初次运行问题修复：设计版/扫描版 PDF(无文本层) needs_manual 人话解释+drawer 琥珀横幅；修复 DB 测试隔离缺陷；5 份真实风格中文简历验证 5/5 scored | apps/resume-screening/（commit d572cf9） | 已记录 | 确认现有 pipeline 对有文本层简历 100% 有效，视觉模型非必需；无文本层简历需人工或重传 |
| 2026-09-16 | 四闸口日志体系（用户"不漏掉任何问题"哲学的工程落地）：闸口1进程边界(pino+进程兜底+消静默catch)/闸口2浏览器边界(global-error+onerror回传，覆盖hydration)/闸口3 LLM边界(llm_raw原始响应)/闸口4数据边界(candidate_events状态迁移)；4闸口各触发一次验证通过；顺带修复pino-pretty与Next dev冲突 | apps/resume-screening/（commit 07a549a） | 已记录 | 任何错误必在一个闸口现形，排障不再靠猜 |
| 2026-09-16 | 四闸口泛化进 template/ + 手册新增第7章可观测性方法论（核心哲学/四闸口表/为什么4不是8/环境只抓分叉点/裁掉的冗余/踩坑） | template/（commit ac89f7e，手册 template/README.md §7） | 已记录 | 14个系统统一的可观测性基础；方法论可复用于任何"文件→LLM→审核"系统 |
| 2026-09-16 | 鲁棒性强化（用户反馈"每次都有各种问题"）：对抗性测试发现 5 缺陷全部修复——P0并发触发done>total卡死/P1非PDF魔数校验/P1 stuck processing恢复机制/P2 JD与文件上限/P2中间态留痕；R1-R7回归+真实UI走查零JS错误 | apps/resume-screening/（commit 4d7578f） | 已记录 | 系统达到"可直接使用的可用产品"标准；从"演示通"升级为"对抗场景通" |
