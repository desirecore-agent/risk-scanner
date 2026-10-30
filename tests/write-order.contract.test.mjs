import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillPath = path.join(root, 'skills/risk-scanning/SKILL.md')
const readSkill = () => readFile(skillPath, 'utf8')
const section = (text, from, to) => {
  const a = text.indexOf(from)
  const b = text.indexOf(to)
  assert.ok(a > 0 && b > a, `${from} 必须位于 ${to} 之前`)
  return text.slice(a, b)
}
// 从技能文本「id 依次为 `a`、`b`…（即 …）」取出骨架必须预填的 id，测试与技能共用同一事实源
const listedIds = (text, marker) => {
  const at = text.indexOf(marker)
  assert.ok(at > 0, `技能里找不到「${marker}」`)
  const tail = text.slice(at + marker.length)
  return [...tail.slice(0, tail.indexOf('（即')).matchAll(/`([a-z-]+)`/g)].map((m) => m[1])
}

test('落盘次序排在 R1 与 R2 之间，R1 不在骨架前整份读知识包', async () => {
  const text = await readSkill()
  const r1 = section(text, '### R1 输入闸门', '### 落盘次序')
  assert.match(r1, /R1 只读 O1 回执与 O2 工件/)
  assert.match(r1, /不在骨架前整份 Read/)
  assert.match(r1, /跳过第 2–6 步直接交回执/)
  assert.match(r1, /`lexicon_entries`、`candidates`、`comparables` 写 `\[\]`/)
  const order = section(text, '### 落盘次序', '### R2 固定检查')
  assert.match(order, /下一次回复只做两步：`GenerateUUID`.*随后 `Write` 骨架/)
  assert.match(order, /写骨架之前不规划检查结论、不预扫词库、不预选候选/)
  assert.match(order, /同一次回复里先用 `Edit` 写下上一项的结论，再发起下一项的检索/)
})

test('九项检查与四条标尺使用知识包里的真实 id', async () => {
  const text = await readSkill()
  const checks = listedIds(text, '`checks` 九行，每行 `- {id: "<id>", status: deferred}`，id 依次为')
  assert.deepEqual(checks, ['liability-cap', 'breach-remedy', 'grace-period', 'termination-convenience', 'subcontracting', 'audit-right', 'dispute-resolution', 'force-majeure', 'data-export'])
  const benchmarks = listedIds(text, '`benchmarks` 四行，id 依次为')
  assert.deepEqual(benchmarks, ['liability-cap-months', 'renewal-notice-days', 'non-compete-years', 'data-export-window-days'])
  const r2 = section(text, '### R2 固定检查', '### R3 触发与抑制')
  assert.match(r2, /对 `base\/missing-clauses\.yaml` 的九项逐项给出/)
  assert.doesNotMatch(r2, /付款\/交付、验收、知识产权/)
})

test('词库检索按语言选词库、大小写与正则参数写明，结果有固定落点', async () => {
  const order = section(await readSkill(), '### 落盘次序', '### R2 固定检查')
  assert.match(order, /中文用 `risk-lexicon\/triggers-zh\.yaml`，英文用 `triggers-en\.yaml`，中英混排两份都查/)
  assert.match(order, /不整份 Read 词库/)
  assert.match(order, /每批按完整词条装，不超过 64 项/)
  assert.match(order, /英文词库的 keywords 区分大小写不可靠.*`is_regex: true`、`ignore_case: true`/)
  assert.match(order, /patterns 用 `\|` 合成一个正则.*以 `is_regex: true`、`ignore_case: true` 对同一文件补查一次/)
  assert.match(order, /原因是 `location_limit` 的按命中算/)
  assert.match(order, /部件不是 UTF-8 文本.*记 `blank` 并写原因，不改为通读全文/)
  assert.match(order, /`# <<追加 lexicon>>` 换成全部词条各一行/)
  assert.match(order, /`severe` → `important` → `advisory`，同档按词库文件顺序，取前 8 条/)
  assert.match(order, /`lexicon_entries` 已有词条行就以它为准，不重跑检索；仍是锚点时重做第 2 步/)
  assert.match(order, /`context_lines: 0`/)
  assert.match(order, /`''` 还原为 `'`/)
  assert.match(order, /一个词条只出一个候选，多处命中位置并入它的证据/)
  assert.match(order, /在其他部件里也没命中的词条记 `blank` 而不是 `not_triggered`/)
  assert.match(order, /`redlines: \{status: deferred\}` 与 `coverage_debt: \{status: deferred\}` 各占一行/)
  assert.match(order, /`pattern: "\^    enabled: true"`/)
  assert.match(order, /0 命中时把 `redlines: \{status: deferred\}` 改为 `redlines: \{status: none_enabled\}`/)
})

test('状态取值与知识文件一致：R2 用 verdicts 判定词，R3 含 severe，标尺只陈述差距', async () => {
  const text = await readSkill()
  const r2 = section(text, '### R2 固定检查', '### R3 触发与抑制')
  for (const v of ['present_complete', 'present_incomplete', 'absent', 'not_checked']) assert.match(r2, new RegExp('`' + v + '`'))
  assert.match(r2, /必须写检索范围与关键词/)
  const r3 = section(text, '### R3 触发与抑制', '### R4 可比事实')
  assert.match(r3, /`status` 取词条的 `severity`（`severe`\/`important`\/`advisory`），或 `pass`\/`unknown`\/`suppressed`/)
  assert.match(r3, /`resolution: benchmark_compare` 的词条按 `benchmarks` 对应行比较/)
  const r4 = section(text, '### R4 可比事实', '### R5 交付')
  assert.match(r4, /`status` 取 `found`（附实际值、单位、条款位置、基准值与差距）、`not_present`/)
  assert.match(r4, /不定风险等级，等级由 O5 的 D2 按评分规则计算/)
})

test('词库行提取正则与两份词库的真实行格式一致', async (t) => {
  const lexiconDir = path.resolve(root, '../contract-review-team/shared/resources/risk-lexicon')
  let files
  try {
    files = await Promise.all(['triggers-zh.yaml', 'triggers-en.yaml'].map((f) => readFile(path.join(lexiconDir, f), 'utf8')))
  } catch {
    t.skip('单独检出成员仓库，缺少团队仓库词库')
    return
  }
  for (const text of files) {
    const doc = parse(text)
    const lines = text.split('\n')
    assert.equal(lines.filter((l) => /^ {2}- id: /.test(l)).length, doc.triggers.length)
    assert.equal(lines.filter((l) => /^ {4}severity: /.test(l)).length, doc.triggers.length)
    assert.equal(lines.filter((l) => /^ {4}keywords: \[.*\]$/.test(l)).length, doc.triggers.length)
    assert.equal(lines.filter((l) => /^ {6}- '/.test(l)).length, doc.triggers.flatMap((t) => t.patterns ?? []).length)
  }
})

// 平台 Edit 只替换第一处精确匹配：按技能列出的 id 生成骨架，逐步改写，每步都必须仍是合法 YAML
const replaceFirst = (doc, oldStr, newStr) => {
  const i = doc.indexOf(oldStr)
  assert.ok(i >= 0, `old_string 未命中：${oldStr}`)
  return doc.slice(0, i) + newStr + doc.slice(i + oldStr.length)
}

test('骨架与逐项 Edit 的每个中间态都可解析', async () => {
  const text = await readSkill()
  const checks = listedIds(text, '`checks` 九行，每行 `- {id: "<id>", status: deferred}`，id 依次为')
  const benchmarks = listedIds(text, '`benchmarks` 四行，id 依次为')
  let doc = [
    'risk_scan:',
    '  risk_scan_id: "RISKSCAN-test"',
    '  case_id: "C00"',
    '  r1: {verdict: passed}',
    '  checks:',
    ...checks.map((id) => `    - {id: "${id}", status: deferred}`),
    '  benchmarks:',
    ...benchmarks.map((id) => `    - {id: "${id}", status: deferred}`),
    '  lexicon_entries:',
    '    # <<追加 lexicon>>',
    '  candidates:',
    '    # <<追加 candidates>>',
    '  comparables:',
    '    # <<追加 comparables>>',
    '  redlines: {status: deferred}',
    '  coverage_debt: {status: deferred}',
    '',
  ].join('\n')
  const states = [doc]
  const step = (oldStr, newStr) => { doc = replaceFirst(doc, oldStr, newStr); states.push(doc) }

  step('    # <<追加 lexicon>>', [
    '    - {id: "rt-auto-renewal-silent", severity: important, status: hit, matched: ["自动续约"], lines: [47]}',
    '    - {id: "rt-mfn-clause", severity: advisory, status: not_triggered, matched: [], lines: []}',
  ].join('\n'))
  step('    - {id: "liability-cap", status: deferred}', '    - {id: "liability-cap", status: present_complete, evidence: "10.1"}')
  step('    # <<追加 candidates>>', '    - {candidate_id: "CAND-01", status: pass, clause_ref: "3.2"}\n    # <<追加 candidates>>')
  step('    - {id: "rt-auto-renewal-silent", severity: important, status: hit, matched: ["自动续约"], lines: [47]}',
    '    - {id: "rt-auto-renewal-silent", severity: important, status: pass, candidate_id: "CAND-01", matched: ["自动续约"], lines: [47]}')
  step('    - {id: "renewal-notice-days", status: deferred}', '    - {id: "renewal-notice-days", status: found, value: 90, unit: day, benchmark: 90, gap: 0}')
  step('  redlines: {status: deferred}', '  redlines: {status: none_enabled}')
  step('  coverage_debt: {status: deferred}', '  coverage_debt: {status: none}')
  step('    # <<追加 comparables>>', '    - {comparison_id: "CMP-01", metric: renewal-notice-days, value: 90, unit: day}\n    # <<追加 comparables>>')

  for (const [i, s] of states.entries()) assert.doesNotThrow(() => parse(s), `第 ${i} 个中间态不是合法 YAML`)
  const final = parse(doc).risk_scan
  assert.equal(final.checks.length, 9)
  assert.equal(final.benchmarks.length, 4)
  assert.equal(final.checks.filter((c) => c.status === 'deferred').length, 8)
  assert.equal(final.lexicon_entries.find((e) => e.id === 'rt-auto-renewal-silent').candidate_id, 'CAND-01')
  assert.deepEqual(final.candidates.map((c) => c.candidate_id), ['CAND-01'])
  assert.equal(final.comparables.length, 1)
  assert.deepEqual(final.redlines, { status: 'none_enabled' })
  assert.deepEqual(final.coverage_debt, { status: 'none' })
})

test('两段同形骨架会让只替换第一处的 Edit 改错段（反例）', () => {
  const twoLine = '  redlines:\n    status: deferred\n  coverage_debt:\n    status: deferred\n'
  const edited = replaceFirst(twoLine, '    status: deferred', '    status: none')
  assert.equal(parse(edited).redlines.status, 'none', '整行同形时改到的是 redlines')
  assert.equal(parse(edited).coverage_debt.status, 'deferred')
})
