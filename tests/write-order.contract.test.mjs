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
  assert.match(r1, /跳过步骤 B–F 直接交回执/)
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
  assert.match(order, /检索完成后把全部词条各写一行/)
  assert.match(order, /`severe` → `important` → `advisory`，同档按词库文件顺序，取前 8 条/)
  assert.match(order, /`# <<追加 lexicon>>` 已不在，就以已写词条为准，不重跑检索；锚点还在时只补写尚未写入的词条/)
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
  assert.match(r3, /劣于基准时取 `market-benchmarks\.yaml` 该标尺 `deviation_signals` 命中档的 `conclusion`（不用词条默认 `severity`）/)
  const r5 = text.slice(text.indexOf('### R5 交付'))
  assert.match(r5, /`checks_covered`（`present_complete`、`present_incomplete`、`absent`、`not_applicable` 之和/)
  assert.match(r5, /`checks_unknown`（`not_checked`、`deferred`、`capability_debt`、`blocked` 之和）/)
  assert.doesNotMatch(r5, /每个 `covered`/)
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
    '    - {id: "rt-example-entry", severity: important, status: hit, matched: ["示例关键词"], lines: [12]}',
    '    - {id: "rt-mfn-clause", severity: advisory, status: not_triggered, matched: [], lines: []}',
  ].join('\n'))
  step('    - {id: "liability-cap", status: deferred}', '    - {id: "liability-cap", status: present_complete, evidence: "10.1"}')
  step('    # <<追加 candidates>>', '    - {candidate_id: "CAND-01", status: pass, clause_ref: "3.2"}\n    # <<追加 candidates>>')
  step('    - {id: "rt-example-entry", severity: important, status: hit, matched: ["示例关键词"], lines: [12]}',
    '    - {id: "rt-example-entry", severity: important, status: pass, candidate_id: "CAND-01", matched: ["示例关键词"], lines: [12]}')
  step('    - {id: "renewal-notice-days", status: deferred}', '    - {id: "renewal-notice-days", status: found, value: 30, unit: day, benchmark: 30, gap: 0}')
  step('  redlines: {status: deferred}', '  redlines: {status: none_enabled}')
  step('  coverage_debt: {status: deferred}', '  coverage_debt: {status: none}')
  step('    # <<追加 comparables>>', '    - {comparison_id: "CMP-01", metric: renewal-notice-days, value: 30, unit: day}\n    # <<追加 comparables>>')

  for (const [i, s] of states.entries()) assert.doesNotThrow(() => parse(s), `第 ${i} 个中间态不是合法 YAML`)
  const final = parse(doc).risk_scan
  assert.equal(final.checks.length, 9)
  assert.equal(final.benchmarks.length, 4)
  assert.equal(final.checks.filter((c) => c.status === 'deferred').length, 8)
  assert.equal(final.lexicon_entries.find((e) => e.id === 'rt-example-entry').candidate_id, 'CAND-01')
  assert.deepEqual(final.candidates.map((c) => c.candidate_id), ['CAND-01'])
  assert.equal(final.comparables.length, 1)
  assert.deepEqual(final.redlines, { status: 'none_enabled' })
  assert.deepEqual(final.coverage_debt, { status: 'none' })
})

// 2026-10-30 真机：法域支把落盘次序「第 5 步」当成 J5，冲突判定后虚报交付完成；风险支同构，一并改字母编号
test('落盘步骤用字母编号、不与 R1–R5 混淆，人设与原则也不用数字步骤号', async () => {
  const text = await readSkill()
  const order = section(text, '### 落盘次序', '### R2 固定检查')
  assert.match(order, /步骤用字母编号，与 R1–R5 不是一回事：R5 是最后的交付，只在做完步骤 A–F 之后进行（步骤 G 是写法约定）/)
  const labels = [...order.matchAll(/^- \*\*步骤 ([A-G]) /gm)].map((m) => m[1])
  assert.deepEqual(labels, ['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  const [principles, persona] = await Promise.all(['principles.md', 'persona.md'].map((p) => readFile(path.join(root, p), 'utf8')))
  for (const [name, body] of [['SKILL', text], ['principles', principles], ['persona', persona]]) {
    assert.doesNotMatch(body, /第 ?\d+(–\d+)? ?步/, `${name} 不应再用数字步骤号`)
  }
  assert.match(order, /按约 3000 字分批用 `Edit` 写入：每批把 `# <<追加 lexicon>>` 换成「该批词条 \+ 原锚点」，最后一批不再留锚点；锚点还在就表示词条没写完/)
  assert.match(order, /步骤 B 只记录命中：不读词条的限定与反例、不判定 `hit` 词条是否成立、不想九项检查的结论，这些分别留到步骤 D、C 一项一项做/)
})

// R5 自检正则取自技能；产物带包裹键或直接顶层、flow map 花括号内带不带空格，都必须抓到未完成态
const layout = (indent, { lexiconAnchor = false, redlines = 'none_enabled', hitRow = false } = {}) => [
  ...(indent ? ['risk_scan:'] : []),
  `${indent}risk_scan_id: "RISKSCAN-test"`,
  `${indent}lexicon_entries:`,
  `${indent}  - {id: "rt-a", severity: important, status: ${hitRow ? 'hit' : 'pass'}, matched: ["示例"], lines: [12]}`,
  `${indent}  - {id: "rt-b", severity: advisory, status: not_triggered, matched: [], lines: []}`,
  ...(lexiconAnchor ? [`${indent}  # <<追加 lexicon>>`] : []),
  `${indent}redlines: ${redlines}`,
  `${indent}coverage_debt: {status: none}`,
  '',
].join('\n')

test('R5 自检对包裹与顶层两种布局都能抓到未完成态，已完成态不误判，正则不带反斜杠', async () => {
  const r5 = (await readSkill()).split('### R5 交付')[1]
  assert.match(r5, /删锚点之前先自检：用一次 `Grep`/)
  assert.match(r5, /自检通过后再写 `coverage_debt`/)
  const pattern = r5.match(/`pattern: "([^"]+)"`/)[1]
  assert.ok(!pattern.includes('\\'), '自检正则不带反斜杠，避免写进 JSON 参数时被转义吞掉')
  const re = new RegExp(pattern, 'm')
  for (const indent of ['', '  ']) {
    assert.ok(!re.test(layout(indent)), `已完成态不应命中（缩进 "${indent}"）`)
    assert.ok(re.test(layout(indent, { lexiconAnchor: true })), '词库锚点还在必须命中')
    assert.ok(re.test(layout(indent, { redlines: '{status: deferred}' })), 'redlines 仍为 deferred 必须命中')
    assert.ok(re.test(layout(indent, { redlines: '{ status: deferred }' })), '花括号内带空格也必须命中')
    assert.ok(re.test(layout(indent, { hitRow: true })), '词条仍为 hit 必须命中')
  }
  assert.ok(!re.test('    redlines: {status: deferred}'), '四格缩进的嵌套键不是骨架字段')
  assert.ok(!re.test('  - {id: "rt-c", status: hitlist}'), 'hit 前缀的其他词不误判')
  assert.ok(re.test('  - id: rt-d\r\n    status: hit\r\n'), '块式写法加 CRLF 行尾也必须命中')
  assert.match(r5, /回读时确认 `coverage_debt` 已不是 `deferred`/)
  assert.match(r5, /有未处理项时写 `\{status: open, items: \[\.\.\.\]\}`.*全部处理完写 `\{status: none\}`；都不用 `deferred`/)
  assert.ok(!re.test('  redlines: {status: deferred_x}'), 'deferred 前缀的其他词不误判')
  assert.match(await readSkill(), /续跑（含 Lead 点名续写本产物 id 的重新委派）时跳过本步：不再 `GenerateUUID`、不再 `Write` 骨架/)
  const text = await readSkill()
  assert.match(text, /其余 `hit` 词条改为 `deferred`，由 R5 统一写进 `coverage_debt`/)
  assert.match(text, /被续跑时（含 Lead 因原运行已正常结束无法 resume、改用重新委派并在任务里点名续写本产物 id 的情形）先回读本次产物/)
  assert.match(r5, /回复中声称已写出的产物与回执，都必须是本会话里实际 `Write` 过并 `Read` 回读过的/)
})

test('两段同形骨架会让只替换第一处的 Edit 改错段（反例）', () => {
  const twoLine = '  redlines:\n    status: deferred\n  coverage_debt:\n    status: deferred\n'
  const edited = replaceFirst(twoLine, '    status: deferred', '    status: none')
  assert.equal(parse(edited).redlines.status, 'none', '整行同形时改到的是 redlines')
  assert.equal(parse(edited).coverage_debt.status, 'deferred')
})
