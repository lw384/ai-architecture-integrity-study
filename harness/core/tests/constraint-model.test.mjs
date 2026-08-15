import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runConstraints } from '../layers/constraints_runner.mjs';

// Build a minimal rulepack around a deterministic in-memory adapter.
function createRulepack() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-constraint-'));
  const rulesDir = path.join(root, 'rules', 'test');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, 'manifest.yaml'),
    [
      'adapters:',
      '  synthetic:',
      '    source: ignored',
      '    config: ignored.json',
      '    emits: [constraints]',
      'rules:',
      '  constraints:',
      '    - rules/test/TEST-C-001-binary-rule.yaml',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(rulesDir, 'TEST-C-001-binary-rule.yaml'),
    [
      'rule_id: TEST-C-001-binary-rule',
      'version: 1.0.0',
      'layer: constraints',
      'severity: warning',
      'evidence_sources:',
      '  - adapter: synthetic',
      '    tool_rule_ids: [synthetic/rule]',
      '    match_condition:',
      '      event_type: violation',
      'agent_facing_message: "Violation at {name}."',
      '',
    ].join('\n'),
  );
  return root;
}

test('constraint findings are binary and omit legacy severity metadata', async (t) => {
  const rulepackDir = createRulepack();
  t.after(() => fs.rmSync(rulepackDir, { recursive: true, force: true }));

  const adapterRegistry = new Map([
    [
      'synthetic',
      {
        configPath: path.join(rulepackDir, 'ignored.json'),
        run: async () => ({
          execution_meta: { status: 'ok' },
          normalized_events: [
            {
              source_tool: 'synthetic',
              source_rule_id: 'synthetic/rule',
              event_type: 'violation',
              location: { path: 'src/example.js', line: 1 },
              payload: { name: 'example' },
            },
          ],
        }),
      },
    ],
  ]);

  const result = await runConstraints({
    targetDir: rulepackDir,
    rulepackDir,
    taskConfig: { enabled: { constraints: ['TEST-C-001-binary-rule'] } },
    adapterRegistry,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].message, 'Violation at example.');
  assert.equal(Object.hasOwn(result.findings[0], 'severity'), false);
});
