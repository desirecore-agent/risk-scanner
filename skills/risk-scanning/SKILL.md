---
name: risk-scanning
description: >-
  合同审查流水线第 5 步的风险判读。按固定顺序执行 8 步（上游校验、判据加载、9 项关键缺失条款检查、
  4 条市场标尺对标、触发词库匹配与限定、判定路径分流、企业红线检查、合并与覆盖矩阵），
  产出带完整结论四元组的争议点清单。核心机制是反误报：词库命中只是候选，必须经 qualifiers 与
  counter_examples 排除、再按 resolution 分流后才能升格为结论；被排除的候选留痕到 suppressed。
  用户提到风险识别、风险判读、风险扫描、争议点清单、关键条款缺失、市场标尺对标、责任上限、
  续约通知期、竞业期限、数据导出、企业红线时使用。
  Use when scanning an extracted contract for risk: lexicon triggers with false-positive
  suppression, nine missing-clause checks, four market benchmarks and enabled custom redlines.
version: 1.0.0
type: procedural
risk_level: low
status: enabled
tags:
  - contract-review
  - risk-identification
  - risk-lexicon
  - market-benchmark
  - false-positive-suppression
requires:
  tools:
    - Read
    - Ls
    - Glob
    - Grep
    - Write
    - MathCalc
    - GenerateUUID
metadata:
  author: DesireCore
  version: 1.0.0
  updated_at: '2026-08-31'
---

# 合同风险判读

## 何时使用

收到 `clause-extractor` 的结构化交接块后执行本技能。你与 `jurisdiction-auditor` **并行**——
你们同时收到同一份交接，各判各的，**互不引用对方的中间结论**。

## 不可协商的前提

1. **R1→R8 顺序固定**，不得打乱、不得跳步、不得因为「合同看起来很干净」提前结束。
2. **命中关键词不是结论。**每条候选必须走完 M1→M5 五步（见「五步判定协议」）才能进入风险清单。
3. **误报与漏检同等严重。**判不准时按 `unknown` 处理，不按风险处理；但「没把握」指的是没有基准、
   要素判不了、对等性判不了，不是指检索不充分——检索不充分写 `blank` 并给出检索范围。
4. **没检查到就显式留白。**覆盖矩阵里每一项都必须有状态；`blank` 与 `blocked` 单列，禁止计入通过率。
5. **不越界。**法律效力属 `jurisdiction-auditor`；版本方向、评分与最终动作属 `review-reporter`。

---

## 判据文件（三份 + 一份可选）

全部路径相对于团队 `shared/resources/`。**不要在产物或提示词里写死任何用户主目录字面量**，
实际绝对路径用 `Ls` 确认后使用。

| 文件 | 回答的问题 | 条目数 |
|---|---|---|
| `risk-lexicon/triggers-zh.yaml` / `triggers-en.yaml` | 写在里面的那句话是不是争议点 | 29（中英各一份，同 id） |
| `jurisdiction-packs/base/missing-clauses.yaml` | 该有的条款有没有、要素齐不齐 | 9 |
| `jurisdiction-packs/base/market-benchmarks.yaml` | 有的那条数值落在哪个区间 | 4 |
| `jurisdiction-packs/custom/redlines.yaml` | 企业自定义标准（**默认全部未启用**） | 0 启用 / 8 模板 |

`risk-lexicon/pack.yaml` 提供类目、判定路径、五步协议与 7 条 `forbidden_findings`，先读它再读条目。

### 阈值只有一套

`market-benchmarks.yaml` 是**唯一**的数值判据来源。词库条目的 `benchmark_link` 非空时，
**结论以标尺比对结果为准**，词库不另出一条——它在这里的作用是把标尺该看的那句话定位出来。

自定义阈值、就地放宽或收紧档位，会让团队输出两个互相矛盾的结论。

---

## 术语：三类记录

| 类别 | 编码前缀 | 语义 | 进不进风险清单 |
|---|---|---|---|
| **候选** | `CAND-` | 关键词或正则命中的条款，仅表示「值得看一眼」 | 否 |
| **发现** | `RISK-` | 候选通过限定与排除，并按 `resolution` 完成判定 | 是 |
| **抑制** | `SUPP-` | 候选被某条 `counter_example` 或 `exclude_if` 排除 | 否，但**必须留痕** |

另有两类**转出记录**，它们不是你的结论，但必须由你抽全事实：

| 类别 | 编码前缀 | 转给谁 | 你负责的部分 |
|---|---|---|---|
| **法域待判** | `DEFER-JUR-` | `jurisdiction-auditor` | 抽全事实与证据，`must_escalate: true` |
| **版本可比项** | `CMP-` | `review-reporter` | 抽全可比数值，**不判方向** |

---

## 五步判定协议 M1→M5

每一步都可能把候选打回。跳过 M2 就是样本 `TC-008` 的复现路径：命中即报，
一份条款质量良好的协议被输出 11 条高风险、其中 3 条是误报。

```
M1 匹配    keywords / patterns 命中 → 建立 CAND-*，记录命中的具体词与位置
M2 限定    逐条过 qualifiers（require_all / require_any / exclude_if）与 counter_examples
           → 被排除的建 SUPP-*，写明被哪一条排除；不留痕的抑制不成立
M3 分流    按 resolution 决定这条能否单独下结论：
           element_check / symmetry_check → 可以
           benchmark_compare → 必须先比标尺
           defer_to_jurisdiction / defer_to_version_comparison → 只登记，不下结论
M4 结论    组装结论四元组：条款编号 + 证据位置（页码）+ 结论等级 + 对应动作
M5 合并    按 dedup_group 合并同组同条款；全部检查项写进覆盖矩阵，含 pass 与 not_triggered
```

### 结论等级只有五个取值

`severe` / `important` / `advisory` / `pass` / `unknown`（另有覆盖状态 `blank` / `blocked`）。

**禁止使用「较高」「偏大」「值得注意」「建议关注」这类无档位措辞。**
没有档位的结论无法映射到动作，也就无法被复核（`rules.md#R-012`）。

---

## R1　上游校验与作用域锁定

**不校验就开工，等于在一个不成立的对象上做风险评分。**

1. 读上游 `clause-extractor` 的 `handoff` 块与 `artifact_path` 指向的抽取产物。
2. 校验 `upstream.verdict ∈ {pass, conditional_pass}`。为 `reject` 时**立即停止**，
   不读材料、不出清单、不交接，回报组长「上游已阻断，风险判读不启动」。
3. **原样承接**以下字段，逐字复制到自己的产物，**不重新校验、不改写、不推翻**：
   - `frozen_baseline`（`master_version` / `attachment_manifest_digest` / `page_range` / `execution_status`）
   - `consistency_conclusion_allowed`（原样透传，不得置 `true`）
   - `object` 三元组（`contract_object_id` / `object_title` / `version_label` / `content_digest`）
4. **锁定扫描范围**：只在 `frozen_baseline.page_range` 列出的部件上匹配。
   `scope.blank_fields` 与未送达部件对应的检查项一律写 `not_covered`，**不得凭正文引用推测附件内容**。
5. **确认己方角色**（客户方 / 供应方 / 雇主方 / 劳动者方 / 未确认）。
   角色来自上游交接或用户输入，**不得推测**。未确认时记录 `party_role: unknown`，
   后续所有方向敏感的条目一律输出 `unknown` 并写明原因。

> ⚠️ **附件不降低扫描密度。**只要某部件在 `page_range` 里，它就在扫描范围内。
> 责任上限写在附件第 5.1 条时，与写在主合同第 10.1 款走完全相同的判定与结论等级。

### R1 输出

```yaml
scope_lock:
  parts_in_scope: [body, 'attachment:附件二']
  parts_not_delivered: ['attachment:附件一', 'attachment:附件三']
  party_role: client            # client | supplier | employer | employee | unknown
  party_role_source: upstream_handoff   # upstream_handoff | user_input | unknown
  upstream_verdict: conditional_pass
  consistency_conclusion_allowed: false
```

---

## R2　判据加载与版本登记

1. 用 `Ls` 确认 `shared/resources/` 的实际绝对路径，再读四份判据文件。
2. **过滤 `custom/redlines.yaml`**：只保留 `enabled: true` 的条目。
   一条都没有时记录 `custom_redlines_enabled: 0`，并在报告中写明「custom 层当前无已启用红线」。
   **不得替用户启用任何条目**，也不得把未启用红线的标准拿来当判据。
3. 校验 `custom` 条目未试图放宽 `jurisdiction` 层 `mandatory: true` 的规则；
   命中时忽略该条、按 `jurisdiction` 层执行，并输出冲突提示（不阻断流程，但必须在报告中显示）。
4. **登记版本矩阵五个维度**，写进产物与回执。任一维度缺失时记 `unknown`，不得省略。

### R2 输出

```yaml
criteria_loaded:
  lexicon:
    pack_version: lexicon-v1
    entries_enabled: 29
    language_files: [triggers-zh.yaml, triggers-en.yaml]
    matched_language: zh          # 按合同主要语言选主文件；双语合同两份都跑
  base:
    pack_version: base-v1
    missing_clauses: 9
    benchmarks: 4
  custom:
    pack_version: custom-v1
    redlines_total: 8
    redlines_enabled: 0
    mandatory_floor_conflicts: []

version_matrix:
  skill_version: risk-scanning@1.0.0
  server_version: <运行时读取>
  knowledge_base_version: '2026-08-31'
  jurisdiction_pack_version: <承自上游；本 Agent 不加载法域包，仅登记>
  parser_revision: 0.8.4          # 承自上游抽取产物
```

> **语言选择**：合同主要语言决定跑哪一份触发文件。中英混排或双语对照的合同**两份都跑**，
> 同 id 的命中按 `dedup_group` 合并为一条，`trigger_ids` 同时列出两个语言来源。

---

## R3　关键缺失条款检查（9 项）

依据 `base/missing-clauses.yaml`。**判定标准是「存在且要素齐备」，不是「是否出现该类条款」。**

对 9 项逐项判定，产出三态之一（另加 `not_checked`）：

| 判定 | 条件 | 结论等级 |
|---|---|---|
| `present_complete` | 条款存在且 `required_elements` 齐备 | `pass` |
| `present_incomplete` | 条款存在但要素不齐 | 取该项 `severity`（不是 `pass`） |
| `absent` | 未检索到该类条款 | 取该项 `severity`，**且必须给出检索范围** |
| `not_checked` | 因失败标记未能执行 | `blank`，`status = blocked`，禁止计入通过率 |

### 三条硬规则

1. **`present_incomplete` 必须逐项列出缺失的 `required_elements`**，不得笼统写「要素不全」。
2. **`absent` 必须给出已检索的页码区间 + 使用的检索关键词**，否则该判定不成立。
   「没找到」与「没找」在报告里长得一模一样，只能靠检索证据区分。
3. **「条款存在但内容不利」记为 `present_complete` + 由词库产出风险，不得记为 `absent`。**
   这是本步最高频的分类错误：一份 DPA 有完整的「数据导出限制」条款、内容是禁止导出，
   它是「条款存在但方向不利」，不是「条款缺失」。

### 不适用的判定

合同类型决定某些检查项不适用（劳动合同不适用责任上限、审计权、分包、数据导出、便利终止、不可抗力；
纯货物采购不适用数据导出）。此时写 `not_applicable` 并说明理由，
**既不计入缺失，也不计入通过**。能识别出不适用是加分项，报成「缺失」不是失败但也不得分。

### R3 输出（每项一行）

```yaml
missing_clause_findings:
  - check_id: liability-cap
    verdict: present_complete
    conclusion: pass
    clause_no: '10.1'
    evidence: {part: body, page: 8, quote: "不超过索赔事件发生前 12 个月内甲方实际支付的服务费用总额"}
    elements_present: [上限金额或计算方式, 计算基数与期间, 双方对等, 例外事项清单]
    elements_missing: []
    action: null
    benchmark_handoff: liability-cap-months     # 转 R4 做数值判定
  - check_id: dispute-resolution
    verdict: absent
    conclusion: severe
    clause_no: not_present
    search_performed:
      scope: {body: "1-9"}
      patterns: [争议解决, 仲裁, 管辖, 诉讼, 仲裁委员会, arbitration, jurisdiction]
    evidence: {part: body, page: null, quote: null, locator: "/abs/path/C03.md 第十四条仅约定适用法律"}
    action: 先谈判
    human_gate: HG-02
    note: 「有适用法律」不等于「有争议解决机制」——准据法与争议解决须分别判断存在性
```

---

## R4　市场标尺对标（4 条）

依据 `base/market-benchmarks.yaml`。四条标尺：责任上限、续约通知期、竞业期限、数据导出窗口。

### 判定协议（逐条执行，不得跳步）

```
step_0 定位     用 risk-lexicon/pack.yaml#benchmark_locators 的 headings 与 patterns 找到该看的那句话
step_1 抽数值   从条款抽出可归一化的数值；抽不到时不得估算
step_2 归一化   统一单位（月 / 天 / 年）；跨单位换算须在结论中注明换算方式
step_3 对等性   先判条款是否双方对等；单方适用的限制，风险等级比双方对等的同一数值高一档
step_4 比档位   与该标尺的 deviation_signals 比对，落入哪一档就取哪一档的 risk_level 与 conclusion
```

> ⚠️ **step_0 不能省。**`missing-clauses.yaml` 的 keywords 面向「这类条款在不在」，
> 覆盖不到条款内部的实际表述——真实语料里责任上限的落点是
> 「累计赔偿责任总额，不超过……费用总额」，而 `missing-clauses.yaml#liability-cap`
> 的 `keywords_zh` 中没有任何一项是它的连续子串。只按缺失检查的关键词找，会整条漏掉。
>
> **且责任上限常写在附件而非主合同。**主合同只作指向时（「以附件二的约定为准」）
> 必须追进附件；只扫主合同会得出「责任上限已约定，未见数值」的空结论。
>
> 定位命中零次时该标尺判 `unknown` 并写明已检索的部件与页码区间，
> **禁止直接判「未约定」**——「没找到」与「没约定」是两件事。

### 四条不可违反的约定

1. **落在基准值或更优侧时判 `aligned` / `pass`，禁止输出任何等级的风险。**
   12 个月责任上限 = 基准值，90 天续约通知期 = 基准值，1-2 年竞业期限 = 基准区间，
   90 天 + 标准格式数据导出 = 基准值——这四种情况报风险即为误报（`TC-008` ①）。
2. **偏差信号必须写出实际值、基准值与差距三者**，禁止只写「偏低」「偏高」。
3. **数值抽不到或无基准可比时输出 `conclusion = unknown` 并说明原因**，
   既不按风险计，也不按通过计。词库命中只是候选，未经比对不得升格为结论。
4. **`aligned` 的项也要出现在覆盖矩阵中并写明实际值**，让「已核对且符合」可被验证。
   涉及 HG-03 的项即使判 `aligned`，仍须列入 Human Gate 的确认清单（确认对象是事实，不是结论）。

### R4 输出（每条一行）

```yaml
benchmark_findings:
  - benchmark_id: liability-cap-months
    actual: {value: 3, unit: 月, basis: 受影响 SOW 前 3 个月已付费用}
    reference: {value: 12, unit: 月}
    gap: 低于基准 9 个月
    symmetry: mutual                 # mutual | one_sided | unknown
    risk_level: high
    conclusion: severe
    clause_no: '9.1'
    evidence: {part: body, page: 6, quote: "shall not exceed the total charges actually paid by Client under the affected SOW during the three (3) months immediately preceding the event giving rise to the claim"}
    action: 先谈判
    human_gate: HG-03
    normalization_note: 英文拼写数字 three (3) 取括号内阿拉伯数字；计算基数为单个 SOW 而非全合同，已在 basis 中注明
  - benchmark_id: renewal-notice-days
    actual: {value: 90, unit: 天}
    reference: {value: 90, unit: 天}
    gap: 等于基准值
    symmetry: mutual
    risk_level: aligned
    conclusion: pass
    clause_no: '3.2'
    evidence: {part: body, page: 3, quote: "任何一方在订阅期届满前 90 日以书面形式通知对方不再续约的除外"}
    action: null
  - benchmark_id: non-compete-years
    actual: null
    reference: {range: [1, 2], unit: 年}
    gap: null
    conclusion: unknown
    unknown_reason: 本合同为 B2B 服务协议，无离职后竞业限制条款，本标尺不适用
    status: not_applicable
```

> **`unknown` 与 `not_applicable` 不是一回事**：前者是「该判但判不了」，后者是「不该判」。
> 两者都不计入通过率，但前者要写明为什么判不了，后者要写明为什么不适用。

---

## R5　词库匹配与限定（M1 → M2）

**这是本技能的核心，也是唯一能决定报告可信度的一步。**

### M1 匹配

对 29 个 `status: enabled` 的触发条目，在 `scope_lock.parts_in_scope` 的条款正文中
按 `keywords` 与 `patterns` 匹配。命中即建 `CAND-*`，记录：

```yaml
- id: CAND-07
  trigger_id: rt-auto-renewal-silent
  clause_no: '3.2'
  matched_by: {kind: pattern, expr: '自动(续约|续期|展期|延长|顺延)', hit: '自动续约'}
  evidence: {part: body, page: 3, quote: "订阅期届满前，本协议自动续约 12 个月，但任何一方在订阅期届满前 90 日以书面形式通知对方不再续约的除外"}
```

**匹配范围收敛**：条目的 `clause_categories` 与条款的 `category` 不相交时可跳过该条款，
但**跳过必须是可解释的**——`category` 为 `unknown` 或 `misc` 的条款一律全量匹配，不得跳过。

### M2 限定（把候选打回去）

逐条过三道门，**任何一道不通过即建 `SUPP-*`，不进入 M3**：

| 门 | 判据 | 不通过时 |
|---|---|---|
| ① `qualifiers.require_all` | 列出的条件必须**全部**成立 | 建 `SUPP-*`，`reason_kind: require_all_unmet` |
| ② `qualifiers.require_any` | 列出的条件至少成立一条 | 建 `SUPP-*`，`reason_kind: require_any_unmet` |
| ③ `qualifiers.exclude_if` + `counter_examples` | 命中任一即排除 | 建 `SUPP-*`，`reason_kind: counter_example` |

### 抑制必须留痕

```yaml
suppressed:
  - id: SUPP-03
    trigger_id: rt-joint-several-liability
    clause_no: '13.2'
    evidence: {part: body, page: 9, quote: "经甲方同意的分包不免除乙方责任，乙方对分包方的行为向甲方承担连带责任"}
    reason_kind: counter_example
    reason_ref: rt-joint-several-liability.counter_examples[0]   # 分包责任不免除
    reason: 该表述是 missing-clauses.yaml#subcontracting 要求的「分包方行为的责任归属」要素，
      属条款齐备的标志，方向对采购方有利；承担方是乙方而非己方
```

**不留痕的抑制不成立。**报告里「没报某条风险」有两种可能——判断后排除了、或者根本没扫到。
这两件事质量上天差地别，在报告上长得一模一样，只能靠 `suppressed` 区分。

### 四类最高频的误报形态（逐条对照，命中即抑制）

| 形态 | 例子 | 为什么不是风险 |
|---|---|---|
| **子串陷阱** | 「签署书面变更**单方**为有效」的「单」属「变更单」；`exclusive jurisdiction` / `non-exclusive` / `exclusive of tax`；`assign personnel` | 词义不同，按词边界与语义判断，不得按子串命中 |
| **方向相反** | 分包责任不免除、供方给需方的侵权兜底、便利终止权在己方手上、永久**许可**（不是永久义务） | 条款对己方有利，或本就是要素齐备的标志 |
| **对等即通过** | 双方对等的反转让条款、对等的终止权、对等的违约金标准、等于基准值的责任上限 | `TC-008` ①③ 明确记录为误报 |
| **无客观基准** | 不可抗力范围过宽、条款「看起来不利」 | `forbidden_findings#FB-02 / FB-05`：没有基准就不下结论 |

### 明令禁止的发现（`pack.yaml#forbidden_findings`）

7 条，**不是「谨慎输出」，是不得输出**：

`FB-01` 把「存在责任上限」本身报为风险 ｜ `FB-02` 报「不可抗力范围过宽」 ｜
`FB-03` 把双方对等的标准反转让条款报为风险 ｜ `FB-04` 数值抽不到时按风险计 ｜
`FB-05` 无基准无要素无对等性依据时凭「看起来不利」报风险 ｜
`FB-06` 把行业样板条款（通知、可分割性、完整协议、副本签署）报为风险 ｜
`FB-07` 给出法律效力判断（有效 / 无效 / 不受保护 / 超出法定上限）。

---

## R6　判定路径分流与结论（M3 → M4）

通过 M2 的候选按 `resolution` 分流。**只有前三类可以单独下结论。**

### `element_check` —— 按要素齐备性判定

逐项判该条目列出的要素，**缺哪一项写哪一项**。要素无法判定时该要素写 `unknown`，
不得推定为缺失。

### `symmetry_check` —— 先判对等性

`mutual`（双方对等）/ `one_sided`（单方适用）/ `unknown`（判不了）。

- `mutual` → 多数情况判 `pass` 并注明对等
- `one_sided` → 按条目 `severity` 输出；标尺类条目再升一档
- `unknown` → 输出 `unknown`，**不得默认按单方处理**

### `benchmark_compare` —— 必须先比标尺

结论**以 R4 的比对结果为准**，本条目不另出一条发现，只在覆盖矩阵中交叉引用
（`resolved_by: benchmark_findings[<benchmark_id>]`）。数值抽不到时判 `unknown`。

### `defer_to_jurisdiction` —— 只登记，不下结论

抽全事实与证据，写进 `deferred_to_jurisdiction`，置 `must_escalate: true`。
**禁止输出**：有效 / 无效 / 不受保护 / 超出法定上限 / 违反强制性规定。

```yaml
deferred_to_jurisdiction:
  - id: DEFER-JUR-01
    trigger_id: rt-probation-period
    must_escalate: true
    statement: 试用期 12 个月（2026-05-06 至 2027-05-05），合同期限 3 年，
      另约定考核不合格可再延长 3 个月
    facts:
      - {name: 合同期限, value: 3 年, evidence: {part: body, page: 1, quote: "本合同为固定期限劳动合同，期限 3 年"}}
      - {name: 试用期, value: 12 个月, evidence: {part: body, page: 1, quote: "1.2 试用期为 12 个月，自 2026 年 5 月 6 日起至 2027 年 5 月 5 日止。"}}
      - {name: 可延长, value: 3 个月, evidence: {part: body, page: 1, quote: "考核不合格的，甲方可延长试用期 3 个月或解除本合同"}}
    required_downstream_action: 由 jurisdiction-auditor 按对应法域的试用期规则判定
    forbidden_here: 本 Agent 不写「超出法定上限」「超限一倍」——那是法域合规的结论
```

> **不能因为「这属于法域问题」就把事实也一起省掉。**你抽不出这四个数值，
> 法域合规 Agent 就无从判断，这条风险会在两个 Agent 之间的缝里掉下去。

### `defer_to_version_comparison` —— 只抽可比数值，不判方向

```yaml
comparables:
  - id: CMP-01
    trigger_id: rt-service-level-commitment
    name: 月度可用性承诺
    value: '99.0%'
    clause_no: '2.1'
    evidence: {part: 'attachment:附件二', page: 1, quote: "2.1 乙方承诺服务的月度可用性不低于 **99.0%**。"}
    direction_judged: false     # 恒为 false——方向属 review-reporter 的 compare_versions
```

### M4 结论四元组（缺任一项该条不合格）

```yaml
findings:
  - id: RISK-04
    trigger_ids: [rt-data-export-restricted]
    category: ip_data_rights
    clause_no: '8.2'                      # ① 条款编号
    evidence:                             # ② 证据位置
      part: body
      page: 5
      quote: "8.2 乙方不得以任何形式向甲方、甲方关联方或任何第三方导出、下载或交付个人数据的批量副本"
      locator: "/abs/path/C05-data-processing-agreement.md"
    additional_evidence:
      - {part: body, page: 5, quote: "单次查询结果不得超过 200 条记录，且不提供导出功能"}
      - {part: body, page: 5, quote: "乙方不提供任何形式的数据返还或导出。"}
    conclusion: severe                    # ③ 结论等级
    action: 先谈判                         # ④ 对应动作
    resolution_used: benchmark_compare
    resolved_by: benchmark_findings[data-export-window-days]
    benchmark_detail: {actual: 完全禁止导出, reference: 终止后 90 天 + 标准格式, gap: 最严重短板}
    symmetry: one_sided
    human_gate: null
    classification_note: 条款存在且内容为禁止性——记为「条款存在但方向不利」，
      missing-clauses.yaml#data-export 判 present_complete，不得报为条款缺失
```

条款命中但页码不可得时：`page: null` + `failure_mark: clause_hit_without_page`，
并在 `locator` 给出可定位的行/段引用；**不得以 `page: null` 混入正常发现**。

---

## R7　企业红线检查（仅已启用条目）

依据 `custom/redlines.yaml`。**8 条示例红线默认全部 `enabled: false`。**

1. 只判 `enabled: true` 的条目。一条都没有时，覆盖矩阵中不出现红线行，
   并在报告写明「custom 层当前无已启用红线」。
2. **不得替用户启用**任何条目，也不得把未启用红线的标准拿来当判据。
   启用一条红线 = 用户为这条判定负责，这个责任不能由你代为承担。
3. 已启用条目命中时，**严重度不低于 `important`**。
4. 判断该条目是**新增**还是**覆盖**：
   - 写了 `overrides` → 替换低层标准，按 custom 的 `threshold` 判
   - 未写 `overrides` → 与低层规则并存，**两条都判，取更保守者**
5. `custom` 试图放宽 `jurisdiction` 层 `mandatory: true` 的规则时，
   **忽略该条、按 `jurisdiction` 层执行**，并输出冲突提示（不阻断流程，但必须在报告中显示）。
6. 过期未复核的红线（`review_by` 早于今天）在报告中标注「标准可能已过时」。

```yaml
redline_findings:
  - redline_id: rl-liability-cap-floor
    enabled: true
    relation_to_base: overrides            # overrides | coexists
    overrides: [base/market-benchmarks.yaml#liability-cap-months]
    threshold: {min_months: 12}
    actual: {value: 3, unit: 月}
    conclusion: severe
    clause_no: '9.1'
    evidence: {part: body, page: 6, quote: "..."}
    action: 先谈判
    human_gate: HG-03
    owner: <红线责任人>
    staleness_note: null
```

---

## R8　合并、覆盖矩阵与 Human Gate 触发点

### 8.1 按 `dedup_group` 合并

| 情形 | 处理 |
|---|---|
| 同 `dedup_group` + 同条款 | 合并为一条发现，`severity` 取最高，`evidence` 取并集，`trigger_ids` 列全 |
| 词库条目 vs 缺失检查命中同一条款 | **不合并**（问的不是同一个问题），但必须交叉引用 |
| 词库条目 `benchmark_link` 非空 | 结论以标尺为准，词库不另出一条，只写 `resolved_by` |
| 版本对比模式下两版都命中且内容未变 | 只出一条，标注「两版均存在」 |

### 8.2 覆盖矩阵（欠账表，一项都不能省）

**必须包含全部检查项**：29 条触发条目 + 9 项缺失检查 + 4 条标尺 + 已启用红线。
包括判定为 `pass`、`not_triggered`、`unknown`、`not_applicable` 的。

```yaml
coverage_matrix:
  - check_id: rt-joint-several-liability
    check_title: 连带责任
    source: risk-lexicon
    source_location: {part: body, page: 9}
    conclusion: pass
    action: null
    owner_agent: risk-scanner
    status: covered
    note: 命中后被 counter_example 排除，见 SUPP-03
  - check_id: audit-right
    check_title: 审计权与数据操作流程
    source: missing-clauses
    source_location: null
    conclusion: severe
    action: 先谈判
    owner_agent: risk-scanner
    status: covered
    search_performed: {scope: {body: "1-11"}, patterns: [audit, inspection, right to examine, 审计, 稽核]}
  - check_id: definitions@attachment:附件一
    check_title: 附件一定义术语
    source: upstream-blank
    conclusion: blank
    action: null
    owner_agent: risk-scanner
    status: blank
    note: 附件一正文未随本次材料送达，显式欠账，禁止按通过计
```

`status` 五态：`covered` / `blank` / `blocked` / `deferred` / `not_applicable`。
**`blank` 与 `blocked` 必须在报告正文单列，禁止计入通过率、禁止在摘要中省略**（`rules.md#R-014`）。

### 8.3 Human Gate 触发点（只标不确认）

按发现所属类别标出触发点。**你不得代为确认，也不得预填确认结果。**

| Gate | 由哪些发现触发 |
|---|---|
| `HG-01` | 付款相关：`rt-mfn-clause`、`rt-unilateral-price-adjustment`、`rt-deemed-acceptance` |
| `HG-02` | 争议解决：`dispute-resolution` 缺失或要素不齐 |
| `HG-03` | 责任与违约：`rt-uncapped-indemnity`、`rt-joint-several-liability`、`rt-unlimited-guarantee`、`rt-liquidated-damages-asymmetry`、`liability-cap` 相关标尺 |
| `HG-04` | 生效要件：本 Agent 一般不触发（属输入治理与报告环节） |

**涉及 HG-03 的标尺项即使判 `aligned` / `pass`，仍须列入确认清单**——确认对象是事实，不是结论。

### 8.4 统计（客观计数，不含判断）

```yaml
stats:
  candidates: 24
  suppressed: 11
  findings_severe: 2
  findings_important: 5
  findings_advisory: 3
  findings_unknown: 1
  missing_clause_absent: 1
  missing_clause_incomplete: 0
  benchmark_aligned: 2
  benchmark_deviated: 2
  deferred_to_jurisdiction: 1
  comparables: 3
  coverage_covered: 40
  coverage_blank: 2
  coverage_blocked: 0
  coverage_not_applicable: 6
```

---

## 落盘

```
<有效工作目录>/contract-review/<contract_object_id>/risk/<scan_id>.risk.yaml
```

`<有效工作目录>` 用 `Ls` 实际确认后使用绝对路径，**不要在提示词或产物里写死任何用户主目录字面量**。
旧产物**保留不覆盖**——词库或标尺更新后要靠它们做历史回放与差异对比。
`lexicon_pack_version` 或 `base pack_version` 变化后，旧产物一律作废重扫，不做增量修补。

---

## 产物完整结构

顶层键 `risk_scan`。

```yaml
risk_scan:
  # ── 身份与版本 ──
  scan_id: RISKSCAN-20260331-9c4e17b2
  scanned_at: 2026-03-31T11:20:04+08:00
  executed_by: risk-scanner
  skill: risk-scanning@1.0.0
  lexicon_pack_version: lexicon-v1
  base_pack_version: base-v1
  custom_pack_version: custom-v1
  ontology_version: onto-v1

  # ── 上游绑定（原样携带，不改写）──
  upstream:
    from: clause-extractor
    extraction_id: EXTRACT-20260331-4b81ce07
    artifact_path: /abs/path/.../EXTRACT-20260331-4b81ce07.extraction.yaml
    intake_receipt_path: /abs/path/.../INTAKE-20260331-7f3a2c9b.receipt.yaml
    verdict: conditional_pass
    frozen_baseline: {...}                # 逐字复制
    consistency_conclusion_allowed: false # 原样透传

  object: {...}                           # 三元组，原样承自上游

  scope_lock:   {...}                     # R1
  criteria_loaded: {...}                  # R2
  version_matrix: {...}                   # R2

  missing_clause_findings: [...]          # R3（9 项，一项不落）
  benchmark_findings:      [...]          # R4（4 条，一条不落）
  candidates:              [...]          # R5 M1
  suppressed:              [...]          # R5 M2（必须留痕）
  findings:                [...]          # R6 M4（结论四元组齐备）
  deferred_to_jurisdiction:[...]          # R6
  comparables:             [...]          # R6
  redline_findings:        [...]          # R7（仅已启用）

  coverage_matrix: [...]                  # R8.2（全部检查项）
  human_gate_triggers: [...]              # R8.3（只标不确认）
  failure_marks:   [...]
  stats: {...}                            # R8.4

  handoff: {...}                          # 见下节
```

---

## 结构化交接

**只发这个块。不发对话历史，不发你的推理过程，不发中间草稿。**
骨架与上游 `contract-intake` / `clause-extractor` 同构（`to` / `from` / `object` / `confirmed` /
`pending` / `scope` / `do_not_pass`），便于全链路统一消费与回放。

### 收件方与投递方式

| 收件方 | 方式 | 内容 |
|---|---|---|
| `contract-review-lead` | `SendMessage` | 完成回报 + 产物绝对路径 + `stats` |
| `review-reporter` | **不投递** | —— 见下方警告 |
| `jurisdiction-auditor` | **不投递** | 并行 Agent，互不引用对方的中间结论 |

> ⚠️ **`review-reporter` 不在收件名单里，这是刻意的。**蓝本第二节要求复核 Agent
> 「基于原文与结构化事实重新判断，**不读前序推理**」。最干净的保证不是「发一份贫瘠的交接」，
> 而是**根本没有这条通道**——它由组长告知产物路径后自行从磁盘读取。
> 不得用 `Delegate` / `SendMessage` 绕过这一点，也**禁止**用 `Delegate` 的 `subtask` 模式
> （它继承完整对话历史，正好违背独立复核约束）。

> ⚠️ **不向 `jurisdiction-auditor` 投递。**你们并行执行，各自消费同一份上游交接。
> `deferred_to_jurisdiction` 写在**产物文件**里，由组长在两条并行分支都完成后统一归集，
> 不是由你直接推给它——直接推会让它读到你的判定倾向，污染独立性。

### 交接块结构

```yaml
handoff:
  to: [contract-review-lead]
  from: risk-scanner
  scan_id: RISKSCAN-20260331-9c4e17b2
  artifact_path: /abs/path/.../RISKSCAN-20260331-9c4e17b2.risk.yaml
  upstream_artifact_path: /abs/path/.../EXTRACT-20260331-4b81ce07.extraction.yaml

  object:                                 # 交接对象编号（原样承自上游）
    contract_object_id: YCIT-SAAS-2025-0206
    object_title: 软件即服务（SaaS）订阅服务协议
    version_label: C06b-saas-v2
    content_digest: 9f2c41ab7d3e0655
    submission_mode: version_comparison

  confirmed:                              # 已确认事项（下游可直接当作事实使用）
    - 9 项关键缺失条款检查全部执行：8 项 present_complete、1 项 absent（audit-right，已附检索范围）
    - 4 条市场标尺全部执行：2 条 aligned、1 条 severe（责任上限 3 个月 vs 基准 12 个月）、1 条 not_applicable
    - 29 条触发条目全部执行：命中候选 24 条，经限定与排除后成立 11 条，抑制 11 条（均已留痕）
    - custom 层无已启用红线，未产出红线结论
    - 全部发现齐备结论四元组，evidence 的 quote 均为可 grep 到的逐字原文
    - 判据版本：lexicon-v1 / base-v1 / custom-v1，知识库基准日期 2026-08-31

  pending:                                # 待确认项（下游不得自行消化）
    # ① 上游 pending 原样透传，id 与 statement 不改写
    - id: PEND-01
      origin: upstream
      from_flag: FLG-ATTACHMENT-VERSION-CHANGED
      must_escalate: true
      statement: 附件二由 SLA-v1.2 替换为 SLA-v2.0；正文逐字相同（body_diff_count=0），
        **不得据此判定两版一致**
      required_downstream_action: 对附件二正文做实质条款对比，并给出风险变化方向（上升 / 下调 / 持平）
      resolution_evidence:
        comparables_extracted: [CMP-01, CMP-02, CMP-03]
        note: 已抽出可用性承诺、补偿档位、申请窗口三类可比数值；方向未表态，仍待下游判定
    # ② 本 Agent 新增的待确认项，用 PEND-RISK-* 编号以示区分
    - id: PEND-RISK-01
      origin: risk-scanner
      from_finding: DEFER-JUR-01
      must_escalate: true
      statement: 试用期 12 个月 / 合同期 3 年 / 可再延长 3 个月，三项事实已抽全并锚定
      required_downstream_action: 由 jurisdiction-auditor 按对应法域的试用期规则判定；
        本 Agent 未给出任何法律效力结论
    - id: PEND-RISK-02
      origin: risk-scanner
      from_finding: null
      must_escalate: false
      statement: 己方角色未确认，rt-uncapped-indemnity 等 4 个方向敏感条目输出 unknown
      required_downstream_action: 由用户或组长确认己方是客户方还是供应方后重跑这 4 条

  scope:                                  # 本次任务范围
    in_scope_completed:
      - 关键缺失条款检查（9 项）
      - 市场标尺对标（4 条）
      - 触发词库匹配与触发条件分析（29 条）
      - 企业红线检查（已启用条目）
    out_of_scope:
      - 法律效力判定与法域冲突（属 jurisdiction-auditor）
      - 版本对比与风险变化方向（属 review-reporter 的 compare_versions）
      - 评分、五档阈值映射、最终动作建议与 Human Gate 确认（属 review-reporter 与人）
    frozen_baseline: {...}                # 原样承自上游，未改写
    consistency_conclusion_allowed: false # 原样透传
    coverage_summary:
      covered: 40
      blank: 2                            # 显式欠账，禁止按通过计
      blocked: 0
      not_applicable: 6
    human_gate_triggers: [HG-01, HG-03]   # 只标不确认

  do_not_pass:                            # 我没传、你也不要来取
    - 对话历史
    - 本 Agent 的推理过程与中间草稿
    - 任何评分、总分或放行建议
    - 任何法律效力判断（有效 / 无效 / 不受保护 / 超出法定上限）
    - 任何版本对比的风险变化方向结论
    - 任何未经 evidence 锚定的判断
```

**交接方式硬规则**：引用的所有文件必须写**绝对路径**——下游 Agent 的工作目录与你不同。

---

## 自检清单（交接前逐条确认）

**启动与边界**

- [ ] 上游 `handoff` 存在，`verdict` ∈ {`pass`, `conditional_pass`}，未在 `reject` 下启动
- [ ] `frozen_baseline` 原样携带，未改写、未重新校验、未推翻
- [ ] 只扫了 `parts_in_scope` 列出的部件，未送达部件对应项写了 `not_covered`
- [ ] `consistency_conclusion_allowed: false` 时，全文没有出现「一致」「无差异」「差异为 0」
- [ ] 全文没有出现「有效」「无效」「不受保护」「超出法定上限」「违反强制性规定」
- [ ] 全文没有出现评分、总分、放行建议或版本风险方向结论

**顺序与覆盖**

- [ ] R1–R8 全部执行，无跳步
- [ ] 9 项缺失检查一项不落，4 条标尺一条不落，29 条触发条目一条不落
- [ ] 覆盖矩阵里每一行都有 `status`，`pass` / `not_triggered` / `unknown` / `not_applicable` 也都在
- [ ] `blank` 与 `blocked` 单列了，没有计入通过率、没有在摘要中省略
- [ ] 每个 `absent` 判定都附了检索范围（页码区间 + 关键词）

**结论四元组（缺任一项该条不合格）**

- [ ] 每条 `findings` 都有 `clause_no`、`evidence.page`、`conclusion`、`action` 四项
- [ ] 每个 `evidence` 都是 `{part, page, quote}` 三件套，`part` 与 `frozen_baseline.page_range` 的键逐字一致
- [ ] 每个 `quote` 都是逐字原文，能在源文件中按固定字符串 grep 到
- [ ] 页码不可得的条款进了 `failure_marks`，没有以 `page: null` 混入正常发现
- [ ] `conclusion` 只用了 `severe` / `important` / `advisory` / `pass` / `unknown`，
      没有出现「较高」「偏大」「值得注意」「建议关注」

**不误报（与漏检同等严重）**

- [ ] 每条 `findings` 都指得出 `trigger_ids` 或 `check_id` 或 `benchmark_id`，没有凭印象来的
- [ ] 等于或优于基准值的标尺项都判了 `pass`，没有因为「存在该条款」而报风险
- [ ] 双方对等的反转让条款、对等终止权、对等违约金都判了 `pass` 并注明对等
- [ ] 没有报「不可抗力范围过宽」这类无客观基准的结论
- [ ] 没有把行业样板条款（通知、可分割性、完整协议、副本签署、不侵权保证）报为风险
- [ ] 没有子串误命中（「变更单方」的「单」；`exclusive jurisdiction` / `non-exclusive` /
      `exclusive of tax`；`assign personnel`）
- [ ] 方向对己方有利的条款（分包责任不免除、供方侵权兜底、永久许可授予）没有被报为风险
- [ ] 数值抽不到的项判了 `unknown`，没有估算、没有按风险计

**抑制留痕**

- [ ] 每条被排除的候选都建了 `SUPP-*`，写明 `reason_kind` 与 `reason_ref`
- [ ] `candidates` 数 = `findings` 相关数 + `suppressed` 数 + 转出记录数，没有候选凭空消失

**分类正确性（最高频的两类错误）**

- [ ] 「条款存在但内容不利」记为 `present_complete` + 风险发现，**没有**记为 `absent`
- [ ] 「条款缺失」没有被记成「内容不利」
- [ ] 权利授予（永久许可、独占许可授予己方）没有被当成义务承担或商业锁定
- [ ] 合同类型不适用的检查项写了 `not_applicable` 并说明理由，没有报成缺失

**转出完整性**

- [ ] `defer_to_jurisdiction` 的条目抽全了事实并置 `must_escalate: true`，没有只写结论不写事实
- [ ] `defer_to_version_comparison` 的条目抽全了可比数值，`direction_judged` 恒为 `false`
- [ ] 上游 `pending` 中 `must_escalate: true` 的条目原样透传，`id` 与 `statement` 未改写

**角色与红线**

- [ ] 方向敏感的条目都确认了己方角色；未确认的输出了 `unknown` 并写明原因
- [ ] 只判了 `enabled: true` 的红线，没有替用户启用任何条目
- [ ] `custom` 试图放宽 `jurisdiction` 层 `mandatory` 规则时输出了冲突提示

**可回放**

- [ ] 产物落盘用的是 `Ls` 实际确认过的绝对路径，没有写死用户主目录字面量
- [ ] 旧产物未被覆盖，本次是新的 `scan_id`
- [ ] 版本矩阵五个维度都已登记，缺失的写了 `unknown` 而不是省略
