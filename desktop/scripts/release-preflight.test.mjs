import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBetaRelease } from './release-preflight.mjs';

const fixture = () => ({
  tag: 'v0.1.4-beta.1',
  packageVersion: '0.1.4-beta.1',
  tauriVersion: '0.1.4-beta.1',
  cargoVersion: '0.1.4-beta.1',
  lockVersion: '0.1.4-beta.1',
  notesExist: true,
});

test('accepts matching beta versions and requires a draft prerelease', () => {
  assert.deepEqual(validateBetaRelease(fixture()), { version: '0.1.4-beta.1', prerelease: true, draft: true });
});
test('rejects stable tags, unsafe refs and malformed beta versions', () => {
  for (const tag of ['v0.1.4', 'v0.1.4-rc.1', 'v0.1.4-beta.01', 'v0.1.4-beta.1/other', 'v0.1.4-beta.1\n', 'v0.01.4-beta.1']) {
    assert.throws(() => validateBetaRelease({ ...fixture(), tag }));
  }
});
test('rejects drift in any manifest or lockfile and missing release notes', () => {
  for (const key of ['packageVersion', 'tauriVersion', 'cargoVersion', 'lockVersion']) {
    assert.throws(() => validateBetaRelease({ ...fixture(), [key]: '0.1.3' }));
  }
  assert.throws(() => validateBetaRelease({ ...fixture(), notesExist: false }));
});
