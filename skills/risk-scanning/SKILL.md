name: risk-scanning
description: >-
  有界合同风险扫描：从 O2 条款事实中检查固定缺失条款、少量词库触发和市场比较事实，
  在单个成员回合内产出带证据的风险观察回执；不做法域效力或最终评分。
version: 1.1.0
type: procedural
risk_level: low
status: enabled
tags: [contract-review, risk-identification, bounded-loop, receipt-audit]
requires:
  tools: [Read, Ls, Glob, Grep, Write, GenerateUUID]
metadata:
  author: DesireCore
  updated_at: '2026-09-15'
  pipeline_stage: 5
  upstream: clause-extractor
  downstream: [contract-review-lead, review-reporter]
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

只读取一次 O2 抽取产物和合同正文中与固定检查相关的片段。若上游 `verdict` 不是 `passed` 或 `conditional`、对象摘要不一致、路径不可读，立即写 `blocked` 回执并停止。

### R2 固定检查

对以下九类逐项给出 `covered`、`not_applicable`、`unknown` 或 `blocked`：付款/交付、验收、知识产权、保密、数据处理、责任上限、违约/赔偿、终止/续约、争议解决。每项只允许一个状态、一个原因和一个证据引用；缺少条款必须明确记录，不得按通过处理。

### R3 触发与抑制

只检查已在 O2 事实或正文中看到的明确触发词，最多 8 个候选。每个候选必须有 `candidate_id`、命中词、`clause_ref`、`evidence_quote`、`status`（`important`/`advisory`/`pass`/`unknown`/`suppressed`）和 `reason`。关键词本身不是结论；不确定就 `unknown`，被反例排除就 `suppressed`。

### R4 可比事实

最多记录 4 个实际出现的数值或期限，字段为 `comparison_id`、`metric`、`value`、`unit`、`evidence_quote`、`status: comparable`。不做市场方向判断。

### R5 交付

在 `canonical_artifact_root/<case_id>/risk-scan/` 写入一个 YAML 产物和一个 `RISK-RECEIPT.yaml`，写入后完整 Read 回读。回执必须包含：

- `case_id`、`object`、`input_digest`、`status`；
- `checks_total: 9`、`checks_covered`、`checks_unknown`、`candidates_count`、`comparables_count`；
- `artifact_path`、`evidence_refs`、`read_back: passed`。

完成标准是产物和回执都真实存在、能回读、对象身份一致、每个 `covered`/风险候选都有证据。不要把回执正文只发在消息里；必须给 Lead 绝对路径和统计摘要。收到一个回合内无法完成时，立即写 `blocked`/`capability_debt`，不要等待、循环遍历资源或自行补写最终结论。
