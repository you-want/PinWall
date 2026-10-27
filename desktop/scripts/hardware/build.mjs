#!/usr/bin/env node
// No elevation: --check uses IO substitutes; signing builds never register the daemon.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('Usage: build.mjs [--check]');
const check = args[0] === '--check';
if (process.platform !== 'darwin') throw new Error('Hardware helper builds require macOS and Xcode tools');
const identity = process.env.PINWALL_HARDWARE_SIGNING_IDENTITY;
if (!check && !identity) throw new Error('Set PINWALL_HARDWARE_SIGNING_IDENTITY to a production Developer ID Application identity; --check needs none.');
const root = resolve(import.meta.dirname, '../..');
const out = await mkdtemp(join(tmpdir(), 'pinwall-hardware-build-'));
const helperId = 'com.rain9.pinwall.hardware-helper';
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${program} failed`);
  }
  return result;
}
function signature(path, architecture) {
  const args = ['-dv', '--verbose=4'];
  if (architecture) args.push('--arch', architecture);
  const output = run('/usr/bin/codesign', [...args, path]).stderr;
  return {
    team: /^TeamIdentifier=([A-Z0-9]{10})$/m.exec(output)?.[1],
    identifier: /^Identifier=(.+)$/m.exec(output)?.[1],
    hash: /^CDHash=([a-f0-9]+)$/m.exec(output)?.[1],
  };
}
function verifyDeveloperId(path, identifier, team) {
  const requirement = `identifier "${identifier}" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${team}"`;
  run('/usr/bin/codesign', ['--verify', '--strict', '-R', requirement, path]);
}
try {
  const helper = join(out, helperId);
  run('/usr/bin/clang', [
    '-arch', 'arm64', '-arch', 'x86_64', '-fobjc-arc', '-std=gnu11',
    '-mmacosx-version-min=14.0', '-Wall', '-Wextra', '-Werror',
    '-framework', 'Foundation', '-framework', 'Security', '-framework', 'SystemConfiguration',
    '-framework', 'IOKit', 'src-tauri/helper/hardware-helper.m', '-o', helper,
  ]);
  process.stdout.write(run(helper, ['--self-test']).stdout);
  if (check) {
    console.log('Universal helper compilation and synthetic checks passed; no hardware operations or service registration.');
  } else {
    run('/usr/bin/codesign', ['--force', '--timestamp', '--options', 'runtime', '--identifier', helperId, '--sign', identity, helper]);
    run('/usr/bin/codesign', ['--verify', '--strict', helper]);
    const info = signature(helper);
    if (!info.team || info.identifier !== helperId) throw new Error('Real Team ID and fixed helper identifier required; ad-hoc signing is rejected');
    verifyDeveloperId(helper, helperId, info.team);
    const plist = resolve(root, `src-tauri/helper/${helperId}.plist`);
    const config = join(out, 'bundle.json');
    await writeFile(config, JSON.stringify({ bundle: { macOS: { signingIdentity: identity, files: {
      [`Library/HelperTools/${helperId}`]: helper,
      [`Library/LaunchDaemons/${helperId}.plist`]: plist,
    } } } }));
    run('pnpm', ['tauri', 'build', '--bundles', 'app', '--config', config], { stdio: 'inherit', env: process.env });
    const app = resolve(root, 'src-tauri/target/release/bundle/macos/PinWall.app');
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const host = signature(app);
    if (host.team !== info.team || host.identifier !== 'com.rain9.pinwall') throw new Error('Host must have the fixed identifier and same production Team ID');
    verifyDeveloperId(app, 'com.rain9.pinwall', info.team);
    const bundled = join(app, `Contents/Library/HelperTools/${helperId}`);
    run('/usr/bin/codesign', ['--verify', '--strict', bundled]);
    for (const architecture of ['arm64', 'x86_64']) {
      const before = signature(helper, architecture), after = signature(bundled, architecture);
      // Re-signing may change timestamp bytes; compare the signed CodeDirectory for each slice.
      if (!before.hash || before.hash !== after.hash || after.team !== info.team || after.identifier !== helperId) {
        throw new Error('Bundled helper code or signing identity differs from verified build');
      }
    }
    console.log('Signed hardware app built and signatures verified. Helper was not registered or run with privileges.');
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
