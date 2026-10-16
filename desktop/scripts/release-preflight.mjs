import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateBetaRelease(input) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/.test(input.tag)
    || input.tag.includes('\n')) throw new Error('Only vX.Y.Z-beta.N draft releases are enabled.');
  const version = input.tag.slice(1);
  for (const key of ['packageVersion', 'tauriVersion', 'cargoVersion', 'lockVersion']) {
    if (input[key] !== version) throw new Error(`Release version mismatch: ${key}`);
  }
  if (!input.notesExist) throw new Error('Release notes are missing.');
  return { version, prerelease: true, draft: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tag = process.argv[2];
  // Validate the tag before using it to form a path.
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+-beta\.\d+$/.test(tag) || tag.includes('\n')) {
    throw new Error('Usage: node scripts/release-preflight.mjs vX.Y.Z-beta.N');
  }
  const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
  const lock = readFileSync(resolve(root, 'src-tauri/Cargo.lock'), 'utf8');
  const result = validateBetaRelease({
    tag,
    packageVersion: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version,
    tauriVersion: JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')).version,
    cargoVersion: cargo.match(/\[package\][\s\S]*?^version = "([^"]+)"/m)?.[1],
    lockVersion: lock.match(/\[\[package\]\]\nname = "desktop"\nversion = "([^"]+)"/)?.[1],
    notesExist: existsSync(resolve(root, 'releases', `${tag}.md`)),
  });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${result.version}\n`);
  console.log(`Validated ${tag}: draft prerelease, manual download only.`);
}
