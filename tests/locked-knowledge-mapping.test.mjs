import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
test('locked risk rules, counterexamples and corrections remain live and mapped',async()=>{
 const persona=await readFile(path.join(root,'persona.md'),'utf8'); const principles=await readFile(path.join(root,'principles.md'),'utf8'); const map=await readFile(path.join(root,'skills/risk-scanning/LOCKED-KNOWLEDGE-MAP.md'),'utf8')
 for(const p of [/失败方向/, /误报/, /漏检/, /M1/, /M5/, /29 条/, /9 项/, /4 条/, /suppressed/, /market-benchmarks/]) assert.match(persona+'\n'+principles,p)
 for(const row of ['M1–M5 候选流程','误报与漏检并重','29\\+9\\+4\\+启用红线覆盖','市场标尺','多证据与严重度来源','O3 隔离']) assert.match(map,new RegExp(row))
})
test('platform-equivalent frontmatter and live instructions encode O3 Lead isolation and nine classes',async()=>{
 const text=await readFile(path.join(root,'skills/risk-scanning/SKILL.md'),'utf8'); const match=text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/); assert.ok(match)
 assert.equal((text.match(/^---\s*\nname:/gm)??[]).length,1); const fm=parse(match[1]); assert.equal(fm.metadata.pipeline_stage,'O3'); assert.equal(fm.metadata.upstream,'contract-review-lead'); assert.deepEqual(fm.metadata.downstream,['contract-review-lead'])
 assert.doesNotMatch(match[2],/以下十类|每项只允许一个状态、一个原因和一个证据引用|立即写 `blocked` 回执并停止/)
 assert.match(match[2],/以下九类|上限只限制本批产出，不改变固定清单总数/)
})
