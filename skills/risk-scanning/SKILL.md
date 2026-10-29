---
name: risk-scanning
description: >-
  有界合同风险扫描：从 O2 条款事实中检查固定缺失条款、少量词库触发和市场比较事实，
  在单个成员回合内产出带证据的风险观察回执；不做法域效力或最终评分。
version: 1.1.1
type: procedural
risk_level: low
status: enabled
tags: [contract-review, risk-identification, bounded-loop, receipt-audit]
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, GenerateUUID]
metadata:
  author: DesireCore
  updated_at: '2026-09-15'
  pipeline_stage: O3
  upstream: contract-review-lead
  downstream: [contract-review-lead]
---

# 有界合同风险扫描

## 目标与边界

你是合同审查流水线的风险成员。输入是 Lead 传来的案件对象、正文/附件路径、O2 条款事实和 `canonical_artifact_root`。只回答：

1. 固定检查清单中的条款是否已覆盖；
2. 已见原文是否触发少量明确风险候选；
3. 哪些事实可以交给报告员做后续比较。

你不判断法条效力、法域合规、最终分数或最终动作，也不读取 jurisdiction-auditor 的结论。

## 单回合协议（R1→R5）

### R1 输入闸门

只接受 Lead 转交的有效 O1 回执、O2 工件和冻结来源。按有界批次回源；若 verdict 非 `passed|conditional`，本支 blocked。对象摘要不一致或单一路径不可读时记录对应 `blocked/capability_debt`，但不得把一个局部失败扩成全案所有检查均失败。

### R2 固定检查

对以下九类逐项给出 `covered`、`not_applicable`、`unknown`、`deferred`、`capability_debt` 或 `blocked`：付款/交付、验收、知识产权、保密、数据处理、责任上限、违约/赔偿、终止/续约、争议解决。九类是固定分母；一次调用只处理可靠完成的有界批次（候选建议不超过 8 条），上限不缩减固定分母，未处理项显式留债。每项可保留多个实际来源和冲突证据；缺少条款必须明确记录，不得按通过处理。

### R3 触发与抑制

只检查已在 O2 事实或正文中看到的明确触发词，最多 8 个候选。每个候选必须有 `candidate_id`、命中词、`clause_ref`、`evidence_quote`、`status`（`important`/`advisory`/`pass`/`unknown`/`suppressed`）和 `reason`。关键词本身不是结论；不确定就 `unknown`，被反例排除就 `suppressed`。

### R4 可比事实

最多记录 4 个实际出现的数值或期限，字段为 `comparison_id`、`metric`、`value`、`unit`、`evidence_quote`、`status: comparable`。不做市场方向判断。

### R5 交付

`canonical_artifact_root` 是 Lead 已核验的本次 case/object/version/run 绝对根，不再拼接 case_id 或对象身份；缺根或未授权时返回路径欠账。R1 结束后（含 blocked）立即生成本次唯一的 `risk_scan_id`（续跑沿用会话里已有的 id，新委派一律用新 id，不读、不改其他 id 的产物），先向 `<canonical_artifact_root>/risk-scan/<risk_scan_id>.yaml` 写骨架：对象身份与 R1 结论；`checks` 预填九类各一行，带类别 id 与 `status: deferred`；`candidates`、`comparables` 段下各留一行锚点注释 `# <<追加 candidates>>`、`# <<追加 comparables>>`；`coverage_debt` 写一行 `status: deferred`，交付时写明本次未逐条处理的词库条目与市场标尺及原因（全部处理完才改为 `none`）。R2 每完成一类，按类别 id 原地改写那一行；R3、R4 每完成一条，用 `Edit` 把对应锚点替换成该条加原锚点。`old_string` 取锚点或目标行的整行（含行首缩进），`new_string` 每行写完整缩进，写完核对 diff 落在目标段。不攒到最后一次写整份产物，也不在思考里重审已写入的条目；交付前可用一次 `Grep` 的 `literals` 批量回查全部引文。全部完成后删去锚点、把空段改成 `[]`，再写 `<canonical_artifact_root>/risk-scan/<risk_scan_id>.receipt.yaml`，两份文件都完整 Read 回读。被续跑时先回读本次产物，从 `checks` 里仍为 `deferred` 的下一类或尚未写入的下一条接着做。回执必须包含：

- `case_id`、`object`、`input_digest`、`status`；
- `checks_total: 9`、`checks_covered`、`checks_unknown`、`candidates_count`、`comparables_count`；
- `artifact_path`、`evidence_refs`、`read_back: passed`。

完成标准是产物和回执都真实存在、能回读、对象身份一致、每个 `covered`/风险候选都有证据。只向 Lead 返回绝对路径、固定分母统计与欠账；不向 reporter 直送，也不读法域支路。一次委派内无法完成的行分别写 `deferred`、`blocked` 或 `capability_debt`，不等待、不自行补写最终结论，也不要求所有业务动作成功。

---
