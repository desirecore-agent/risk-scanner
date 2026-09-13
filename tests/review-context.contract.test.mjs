// Source-contract test only: it parses Lead's actual template and schema but does not run an Agent.
import assert from 'node:assert/strict'
import Ajv from 'ajv'
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
const riskSchemaPath = path.join(agentRoot, 'skills', 'risk-scanning', 'references', 'risk-scan.schema.json')

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
  assert.equal(schema.definitions.packNotPrechecked.properties.status.const, 'not_prechecked')
  assert.equal(schema.definitions.outputConstraints.properties.jurisdiction_substantive_conclusion.enum.includes('not_issued_pack_preflight_pending'), true)
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
  assert.ok(skill.includes('REJECT-UNPRECHECKED-REVIEW-CONTEXT'))
  assert.ok(skill.includes('PEND-JURISDICTION-PACK-PREFLIGHT'))
  assert.ok(skill.includes('candidate_basis.pack.status'))
  assert.ok(skill.includes('candidate_bases[].pack.status'))
  assert.ok(skill.includes('不得自行 `Read` 任何规则包或 rules 文件补救'))
  assert.ok(principles.includes('不得因 review-context'))
})

test('source-only: risk artifact schema compiles under Draft-07 semantics and rejects structural bypasses', async () => {
  const fixtureDir = path.join(agentRoot, 'tests', 'fixtures', 'risk-scan')
  const [schemaText, completeText, issuedRedlineText, omittedCoreText, extraNestedText, skill, agent] = await Promise.all([
    readFile(riskSchemaPath, 'utf8'),
    readFile(path.join(fixtureDir, 'valid-complete.yaml'), 'utf8'),
    readFile(path.join(fixtureDir, 'valid-redline-issued.yaml'), 'utf8'),
    readFile(path.join(fixtureDir, 'invalid-omitted-core.yaml'), 'utf8'),
    readFile(path.join(fixtureDir, 'invalid-extra-nested.yaml'), 'utf8'),
    readFile(path.join(agentRoot, 'skills', 'risk-scanning', 'SKILL.md'), 'utf8'),
    readFile(path.join(agentRoot, 'agent.json'), 'utf8'),
  ])
  const schema = JSON.parse(schemaText)
  assert.ok(Buffer.byteLength(schemaText, 'utf8') <= 64 * 1024, 'schema must stay within StructuredFileValidate schema-byte budget')
  const validate = new Ajv({ strictSchema: true, strictTypes: false }).compile(schema)
  const valid = YAML.parse(completeText)
  const issuedRedline = YAML.parse(issuedRedlineText)
  assert.equal(validate(valid), true, JSON.stringify(validate.errors))
  assert.equal(validate(issuedRedline), true, JSON.stringify(validate.errors))
  assert.equal(issuedRedline.risk_scan.redline_findings[0].relation_to_base, 'overrides')
  assert.equal(valid.risk_scan.benchmark_findings[0].issuance, 'not_issued_missing_review_stance')
  assert.equal(valid.risk_scan.benchmark_findings[0].conclusion, undefined)
  assert.deepEqual(valid.risk_scan.benchmark_findings[0].reference.range, [1, 2])
  assert.equal(valid.risk_scan.failure_marks[0].status, 'partial')
  assert.equal(valid.risk_scan.failure_marks[1].status, 'debt')
  assert.equal(valid.risk_scan.not_issued.directional_risk_advice, 'not_issued_missing_review_stance')
  assert.equal(valid.risk_scan.upstream.frozen_baseline.attachment_manifest_digest.length, 64)
  assert.equal(valid.risk_scan.upstream.frozen_baseline.execution_status, 'executed')
  assert.deepEqual(valid.risk_scan.handoff.scope.frozen_baseline, valid.risk_scan.upstream.frozen_baseline)

  for (const text of [omittedCoreText, extraNestedText]) {
    assert.equal(validate(YAML.parse(text)), false, `expected schema rejection: ${text}`)
  }
  const extraRoot = structuredClone(valid)
  extraRoot.unexpected = true
  assert.equal(validate(extraRoot), false)
  const suppressedDirectionalLeak = structuredClone(valid)
  suppressedDirectionalLeak.risk_scan.missing_clause_findings[0].conclusion = 'important'
  assert.equal(validate(suppressedDirectionalLeak), false)
  const suppressedBenchmarkLeak = structuredClone(valid)
  suppressedBenchmarkLeak.risk_scan.benchmark_findings[0].risk_level = 'high'
  assert.equal(validate(suppressedBenchmarkLeak), false)
  const redlineExtra = structuredClone(issuedRedline)
  redlineExtra.risk_scan.redline_findings[0].unexpected = true
  assert.equal(validate(redlineExtra), false)
  const missingFrozenTupleField = structuredClone(valid)
  delete missingFrozenTupleField.risk_scan.upstream.frozen_baseline.attachment_manifest_digest
  assert.equal(validate(missingFrozenTupleField), false)
  const clauseV22Tuple = structuredClone(valid)
  delete clauseV22Tuple.risk_scan.upstream.frozen_baseline.execution_status
  delete clauseV22Tuple.risk_scan.handoff.scope.frozen_baseline.execution_status
  assert.equal(validate(clauseV22Tuple), true)
  const unavailableManifest = structuredClone(valid)
  for (const context of [unavailableManifest.risk_scan.scope_lock.review_context, unavailableManifest.risk_scan.review_context_echo]) {
    context.current_manifest = { status: 'unavailable', reason: 'digest unavailable' }
  }
  unavailableManifest.risk_scan.review_context_echo.actual_output_constraints.jurisdiction_substantive_conclusion = 'not_issued_rule_source_unavailable'
  unavailableManifest.risk_scan.scope_lock.review_context.output_constraints.jurisdiction_substantive_conclusion = 'not_issued_rule_source_unavailable'
  assert.equal(validate(unavailableManifest), true)
  const missingTeamEcho = structuredClone(valid)
  delete missingTeamEcho.risk_scan.review_context_echo
  assert.equal(validate(missingTeamEcho), false)
  const invalidEnum = structuredClone(valid)
  invalidEnum.risk_scan.coverage_matrix[0].status = 'approved'
  assert.equal(validate(invalidEnum), false)
  const emptyCoverage = structuredClone(valid)
  emptyCoverage.risk_scan.coverage_matrix = []
  assert.equal(validate(emptyCoverage), false)
  const missingStats = structuredClone(valid)
  delete missingStats.risk_scan.stats.coverage_blank
  assert.equal(validate(missingStats), false)

  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  assert.equal(schema.additionalProperties, false)
  assert.ok(schema.definitions.riskScan.required.includes('handoff'))
  assert.equal(schema.definitions.frozenBaseline.oneOf.length, 2)
  assert.ok(schema.definitions.frozenBaselineR1.properties.attachment_manifest_digest.description)
  assert.equal(schema.definitions.constraints.properties.factual_extraction.const, 'allowed')
  assert.equal(schema.definitions.contextEcho.properties.revision.minimum, 1)
  assert.ok(schema.definitions.riskScan.allOf)
  assert.ok(skill.includes('StructuredFileValidate(document_path='))
  assert.ok(skill.includes('REJECT-RISK-SCHEMA'))
  assert.ok(skill.includes('members/risk-scanner/<case-id>/<generated-scan-id>'))
  assert.ok(skill.includes('scope_lock.review_context'))
  const config = JSON.parse(agent)
  assert.ok(config.tool_permissions.allowed.includes('StructuredFileValidate'))
  assert.ok(!config.tool_permissions.allowed.includes('SendMessage'))
  assert.ok(!config.tool_permissions.allowed.includes('Delegate'))
  assert.equal(config.command_authority, undefined)
})