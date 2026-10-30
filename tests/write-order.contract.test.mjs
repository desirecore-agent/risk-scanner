import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillPath = path.join(root, 'skills/risk-scanning/SKILL.md')

test('落盘次序排在 R2 之前：先取 id 写骨架，词库命中交给 Grep，再一次处理一项', async () => {
  const text = await readFile(skillPath, 'utf8')
  const order = text.indexOf('### 落盘次序')
  const r1 = text.indexOf('### R1 输入闸门')
  const r2 = text.indexOf('### R2 固定检查')
  assert.ok(r1 > 0 && order > r1 && r2 > order, '落盘次序必须位于 R1 与 R2 之间')
  const section = text.slice(order, r2)
  assert.match(section, /下一次回复只做两步：`GenerateUUID`.*随后 `Write` 骨架/)
  assert.match(section, /写骨架之前不规划九类结论、不预扫词库、不预选候选/)
  assert.match(section, /`Grep` 的 `literals`/)
  assert.match(section, /每批不超过 64 项/)
  assert.match(section, /多部件逐个文件查/)
  assert.match(section, /`patterns` 用 `\|` 合成一个正则/)
  assert.match(section, /R2 一次回复只处理一类/)
  assert.match(section, /R3、R4 一次回复只处理一条/)
  assert.match(section, /被续跑时先回读本次产物/)
})

test('R5 不再重复骨架细则，只引用落盘次序', async () => {
  const text = await readFile(skillPath, 'utf8')
  const r5 = text.slice(text.indexOf('### R5 交付'))
  assert.match(r5, /按上文「落盘次序」逐步写入/)
  assert.doesNotMatch(r5, /立即生成本次唯一的 `risk_scan_id`/)
  assert.doesNotMatch(r5, /先向 `<canonical_artifact_root>\/risk-scan\/<risk_scan_id>\.yaml` 写骨架/)
})

// 平台 Edit 只替换第一处精确匹配：按技能写法模拟骨架 → 改写一类 → 在锚点前追加，每步都必须仍是合法 YAML
const replaceFirst = (doc, oldStr, newStr) => {
  const i = doc.indexOf(oldStr)
  assert.ok(i >= 0, `old_string 未命中：${oldStr}`)
  return doc.slice(0, i) + newStr + doc.slice(i + oldStr.length)
}

test('骨架与逐项 Edit 的每个中间态都可解析', () => {
  const classes = ['payment-delivery', 'acceptance', 'ip', 'confidentiality', 'data-handling', 'liability-cap', 'breach-indemnity', 'termination-renewal', 'dispute-resolution']
  let doc = [
    'risk_scan:',
    '  risk_scan_id: "RISKSCAN-test"',
    '  case_id: "C00"',
    '  r1: {verdict: passed}',
    '  checks:',
    ...classes.map((id) => `    - {id: "${id}", status: deferred}`),
    '  candidates:',
    '    # <<追加 candidates>>',
    '  comparables:',
    '    # <<追加 comparables>>',
    '  coverage_debt:',
    '    status: deferred',
    '',
  ].join('\n')
  const states = [doc]

  doc = replaceFirst(doc, '    - {id: "liability-cap", status: deferred}', '    - {id: "liability-cap", status: covered, evidence: "10.1"}')
  states.push(doc)
  doc = replaceFirst(doc, '    # <<追加 candidates>>', '    - {candidate_id: "CAND-01", status: advisory, clause_ref: "3.3"}\n    # <<追加 candidates>>')
  states.push(doc)
  doc = replaceFirst(doc, '    # <<追加 candidates>>', '    - {candidate_id: "CAND-02", status: pass, clause_ref: "3.2"}\n    # <<追加 candidates>>')
  states.push(doc)
  doc = replaceFirst(doc, '    # <<追加 comparables>>', '    - {comparison_id: "CMP-01", metric: renewal-notice-days, value: 90}\n    # <<追加 comparables>>')
  states.push(doc)

  for (const [i, s] of states.entries()) assert.doesNotThrow(() => parse(s), `第 ${i} 个中间态不是合法 YAML`)
  const final = parse(doc).risk_scan
  assert.equal(final.checks.length, 9)
  assert.equal(final.checks.find((c) => c.id === 'liability-cap').status, 'covered')
  assert.equal(final.checks.filter((c) => c.status === 'deferred').length, 8)
  assert.deepEqual(final.candidates.map((c) => c.candidate_id), ['CAND-01', 'CAND-02'])
  assert.equal(final.comparables.length, 1)
})
