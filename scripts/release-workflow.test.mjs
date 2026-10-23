import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const workflowPath = fileURLToPath(new URL('../.github/workflows/release.yml', import.meta.url));
const workflow = yaml.parse(fs.readFileSync(workflowPath, 'utf8'));

test('manifests combine after partial build failures while publication stays strict', () => {
  assert.equal(
    workflow.jobs['combine-electron-manifests'].if,
    "${{ !cancelled() && needs.create-release.result == 'success' }}",
  );
  // This fork keeps the mobile job out of the release needs, so a skipped
  // mobile build cannot cascade-skip finalization. With every needed job
  // required, the default (all needs succeeded) is the correct gate.
  assert.equal(workflow.jobs['finalize-release'].if, undefined);
  assert.ok(!workflow.jobs['finalize-release'].needs.includes('mobile-release'));
});
