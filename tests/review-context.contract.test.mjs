// Source-contract test only: it parses Lead's actual template and schema but does not run an Agent.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const here = path.dirname(fileURLToPath(import.meta.url))
const contextDir = process.env.DESIRECORE_REVIEW_CONTEXT_DIR
  ? path.resolve(process.env.DESIRECORE_REVIEW_CONTEXT_DIR)
  : path.resolve(here, '..', '..', 'intake-gate-mapping', 'review-context')
const agentRoot = path.resolve(here, '..')

async function readContextContract() {
  const [templateText, schemaText] = await Promise.all([
    readFile(path.join(contextDir, 'review-context.template.yaml'), 'utf8'),
    readFile(path.join(contextDir, 'review-context.schema.json'), 'utf8'),
  ])
  return { template: YAML.parse(templateText), schema: JSON.parse(schemaText) }
}

test('source-only: parses Lead template and preserves missing-stance constraints', async () => {
  const { template, schema } = await readContextContract()
  assert.equal(template.review_stance.status, 'missing')
  assert.equal(template.output_constraints.factual_extraction, 'allowed')
  assert.equal(template.output_constraints.directional_risk_advice, 'not_issued_missing_review_stance')
  assert.equal(template.output_constraints.redline_or_negotiation_advice, 'not_issued_missing_review_stance')
  assert.equal(schema.definitions.outputConstraints.properties.directional_risk_advice.enum.includes('not_issued_missing_review_stance'), true)
  assert.equal(schema.definitions.outputConstraints.properties.redline_or_negotiation_advice.enum.includes('not_issued_missing_review_stance'), true)
})

test('source-only: risk consumer names every frozen handoff and echo field', async () => {
  const [skill, principles] = await Promise.all([
    readFile(path.join(agentRoot, 'skills', 'risk-scanning', 'SKILL.md'), 'utf8'),
    readFile(path.join(agentRoot, 'principles.md'), 'utf8'),
  ])
  for (const field of [
    'review_context_path',
    'review_context_case_id',
    'review_context_revision',
    'review_context_current_manifest',
    'review_context_output_constraints',
    'review_context_echo',
    'actual_output_constraints',
    'REJECT-STALE-REVIEW-CONTEXT',
  ]) assert.ok(skill.includes(field), `missing ${field}`)
  assert.ok(skill.includes('not_issued_missing_review_stance'))
  assert.ok(skill.includes('factual_extraction: allowed'))
  assert.ok(skill.includes('不得把事实换写成方向性 severity、redline、谈判或行动建议'))
  assert.ok(principles.includes('不得因 review-context'))
})
