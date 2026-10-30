---
name: risk-scanning
description: >-
  有界合同风险扫描：从 O2 条款事实中检查固定缺失条款、少量词库触发和市场比较事实，
  在单个成员回合内产出带证据的风险观察回执；不做法域效力或最终评分。
version: 1.2.0
type: procedural
risk_level: low
status: enabled
tags: [contract-review, risk-identification, bounded-loop, receipt-audit]
requires:
  tools: [Read, Ls, Glob, Grep, Write, Edit, GenerateUUID]
metadata:
  author: DesireCore
  updated_at: '2026-10-30'
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

只接受 Lead 转交的有效 O1 回执、O2 工件和冻结来源。R1 只读 O1 回执与 O2 工件；词库、缺失条款清单和市场标尺留到下文对应步骤按需检索，不在骨架前整份 Read。若 verdict 非 `passed|conditional`，本支 blocked：骨架照写，`checks`、`benchmarks` 各行与 `redlines`、`coverage_debt` 直接写 `blocked` 并说明原因，`lexicon_entries`、`candidates`、`comparables` 写 `[]`，跳过第 2–6 步直接交回执。对象摘要不一致或单一路径不可读时记录对应 `blocked/capability_debt`，但不得把一个局部失败扩成全案所有检查均失败。

### 落盘次序（先于 R2–R4）

按下列次序推进，不要先在思考里把九项检查、全部词条和标尺规划完再动手。「一次回复只处理一项」指：同一次回复里先用 `Edit` 写下上一项的结论，再发起下一项的检索。下文取行用的 `Grep` 一律传 `context_lines: 0`。

1. R1 结束（含 blocked）后的下一次回复只做两步：`GenerateUUID` 取本次 `risk_scan_id`（续跑沿用会话里已有的 id，新委派一律用新 id，不读、不改其他 id 的产物），随后 `Write` 骨架到 `<canonical_artifact_root>/risk-scan/<risk_scan_id>.yaml`。骨架只含对象身份与 R1 结论，以及下列各段：
   - `checks` 九行，每行 `- {id: "<id>", status: deferred}`，id 依次为 `liability-cap`、`breach-remedy`、`grace-period`、`termination-convenience`、`subcontracting`、`audit-right`、`dispute-resolution`、`force-majeure`、`data-export`（即 `base/missing-clauses.yaml` 的九项）；
   - `benchmarks` 四行，id 依次为 `liability-cap-months`、`renewal-notice-days`、`non-compete-years`、`data-export-window-days`（即 `base/market-benchmarks.yaml` 的四条），同样写 `status: deferred`；
   - `lexicon_entries`、`candidates`、`comparables` 段下各留一行锚点注释 `# <<追加 lexicon>>`、`# <<追加 candidates>>`、`# <<追加 comparables>>`；
   - `redlines: {status: deferred}` 与 `coverage_debt: {status: deferred}` 各占一行（单行写法，`Edit` 时 `old_string` 带键名，避免两段同形互相改错）。

   骨架不含任何判读：写骨架之前不规划检查结论、不预扫词库、不预选候选。
2. 词库命中交给工具，不在思考里逐条默读原文或词库找命中：
   - 按正文语言选词库：中文用 `risk-lexicon/triggers-zh.yaml`，英文用 `triggers-en.yaml`，中英混排两份都查。不整份 Read 词库，先用一次 `Grep`（`pattern: "^  - id: |^    severity: |^    keywords: "`，`is_regex: true`，`path` 为词库文件）取出各词条的 id、严重度和关键词。
   - 中文词库的 keywords 用 `Grep` 的 `literals` 分批检索：`path` 写已送达部件的单文件绝对路径，多部件逐个文件查；每批按完整词条装，不超过 64 项。英文词库的 keywords 区分大小写不可靠，改为把关键词转义后用 `|` 合成正则，以 `is_regex: true`、`ignore_case: true` 检索，再按命中行归属词条。
   - keywords 全部未命中的词条，用一次 `Grep`（`pattern: "^  - id: |^      - '"`，`is_regex: true`）从词库取出 patterns，把这些词条的 patterns 用 `|` 合成一个正则（从 Grep 行取 pattern 时去掉外层单引号，`''` 还原为 `'`），以 `is_regex: true`、`ignore_case: true` 对同一文件补查一次。
   - `literals` 某项返回 `incomplete`：原因是 `location_limit` 的按命中算；其他原因（`total_location_limit`、`deadline`、`scan_budget`）把这些项另起一小批重查。部件不是 UTF-8 文本（如 PDF、DOCX）时 Grep 不可用，该部件的词库检索记 `blank` 并写原因，不改为通读全文；此时在其他部件里也没命中的词条记 `blank` 而不是 `not_triggered`。多部件时 `lines` 带部件标识。
   - 检索完成后用一次 `Edit` 把 `# <<追加 lexicon>>` 换成全部词条各一行：`- {id: "<词条 id>", severity: <严重度>, status: hit|not_triggered|blank, matched: [命中的关键词或正则], lines: [行号]}`。这是照抄工具结果，不算判读，可以一次写完全部词条。
3. R2 一次回复只处理一项检查：按行号 Read 该项那一段，用该项 `keywords_zh`（英文正文用 `keywords_en`，走正则加 `ignore_case`）检索一次作为证据，判定后用 `Edit` 按 id 原地改写那一行。
4. R3 一次回复只处理一个 `hit` 词条：看限定与反例、判定，再用两个 `Edit` 追加候选（锚点替换成该条加原锚点），并把该词条行的 `status: hit` 改为候选结论与 `candidate_id`。一个词条只出一个候选，多处命中位置并入它的证据。候选按词条 `severity` 排序：`severe` → `important` → `advisory`，同档按词库文件顺序，取前 8 条；其余 `hit` 词条交付前改为 `deferred` 并写进 `coverage_debt` 的未处理清单。
5. R4 一次回复只处理一条标尺：按该标尺的指标在原文定位一次数值，改写 `benchmarks` 对应行；找到实际数值时同时追加一条 `comparables`。
6. 红线用一次 `Grep`（`pattern: "^    enabled: true"`，`is_regex: true`，`path` 为 `custom/redlines.yaml`）检查：0 命中时把 `redlines: {status: deferred}` 改为 `redlines: {status: none_enabled}`；有命中时按行号 Read 这些条目，逐条按 R2 的方式处理。
7. `Edit` 的 `old_string` 取锚点或目标行的整行（含行首缩进），`new_string` 每行写完整缩进，写完核对 diff 落在目标段。不攒到最后一次写整份产物，也不在思考里重审已写入的条目。
8. 被续跑时先回读本次产物：`lexicon_entries` 已有词条行就以它为准，不重跑检索；仍是锚点时重做第 2 步；其余从仍为 `deferred` 或 `hit` 的下一项接着做。

### R2 固定检查

对 `base/missing-clauses.yaml` 的九项逐项给出状态，判定词用该文件 `verdicts` 的 `present_complete`（条款在且要素齐）、`present_incomplete`（条款在但要素不齐）、`absent`（检索后没有，必须写检索范围与关键词）、`not_checked`（因失败未执行），另可写 `not_applicable`（附依据）、`deferred`、`capability_debt` 或 `blocked`。九项是固定分母；一次调用只处理可靠完成的有界批次（候选建议不超过 8 条），上限只限制本批产出，不改变固定清单总数，未处理项显式留债。每项可保留多个实际来源和冲突证据；缺少条款必须明确记录，不得按通过处理。

### R3 触发与抑制

只判定第 2 步检索命中（`hit`）的词条，最多 8 个候选；判定某条时只按行号 Read 该词条那一段的限定与反例。每个候选必须有 `candidate_id`、命中词、`clause_ref`、`evidence_quote`、`status` 和 `reason`。`status` 取词条的 `severity`（`severe`/`important`/`advisory`），或 `pass`/`unknown`/`suppressed`。关键词本身不是结论；不确定就 `unknown`，被反例排除就 `suppressed`。`resolution: benchmark_compare` 的词条按 `benchmarks` 对应行比较：实际值不劣于基准写 `pass`，劣于基准取词条 `severity`，`reason` 指向该行。

### R4 可比事实

四条市场标尺各写一行，`status` 取 `found`（附实际值、单位、条款位置、基准值与差距）、`not_present`（附检索关键词）、`unknown`、`blank` 或 `blocked`；只陈述实际值、基准值与差距，不定风险等级，等级由 O5 的 D2 按评分规则计算。最多记录 4 个实际出现的数值或期限，字段为 `comparison_id`、`metric`、`value`、`unit`、`evidence_quote`、`status: comparable`。

### R5 交付

`canonical_artifact_root` 是 Lead 已核验的本次 case/object/version/run 绝对根，不再拼接 case_id 或对象身份；缺根或未授权时返回路径欠账。产物按上文「落盘次序」逐步写入 `<canonical_artifact_root>/risk-scan/<risk_scan_id>.yaml`；`coverage_debt` 交付时写明本次未逐条处理的词库条目与市场标尺及原因（全部处理完才改为 `none`）。交付前可用一次 `Grep` 的 `literals` 批量回查全部引文。全部完成后删去锚点、把空段改成 `[]`，再写 `<canonical_artifact_root>/risk-scan/<risk_scan_id>.receipt.yaml`，两份文件都完整 Read 回读。回执必须包含：

- `case_id`、`object`、`input_digest`、`status`；
- `checks_total: 9`、`checks_covered`、`checks_unknown`、`candidates_count`、`comparables_count`；
- `artifact_path`、`evidence_refs`、`read_back: passed`。

完成标准是产物和回执都真实存在、能回读、对象身份一致、每个 `covered`/风险候选都有证据。只向 Lead 返回绝对路径、固定分母统计与欠账；不向 reporter 直送，也不读法域支路。一次委派内无法完成的行分别写 `deferred`、`blocked` 或 `capability_debt`，不等待、不自行补写最终结论，也不要求所有业务动作成功。

---
