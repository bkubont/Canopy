import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function publicConfig(env) {
  const url = new URL(env.CANOPY_SUPABASE_URL || 'https://invalid.example');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !/^[a-z0-9.-]+$/i.test(url.hostname)) {
    throw new Error('Use an HTTPS Supabase project origin (HTTP is allowed only on loopback).');
  }
  const key = env.CANOPY_SUPABASE_PUBLISHABLE_KEY || '';
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey) {
    try {
      const parts = key.split('.');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      publicKey = parts.length === 3 && claims.role === 'anon';
    } catch { /* Fail closed for missing or secret keys. */ }
  }
  if (!env.CANOPY_SUPABASE_URL || !publicKey) {
    throw new Error('Set a Supabase URL and PUBLIC publishable/legacy anon key. Secret/service-role keys are forbidden.');
  }
  return { url: url.origin, key };
}

async function main() {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = publicConfig(process.env);
  await mkdir('dist', { recursive: true });
  await build({
    entryPoints: ['cloud/cloud.js'], outfile: 'dist/cloud.js', bundle: true,
    format: 'esm', minify: true, target: ['es2022'],
    define: { __CANOPY_CONFIG__: JSON.stringify(config) },
  });
  const csp = `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ${config.url}; img-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'`;
  const template = await readFile('cloud/cloud.html', 'utf8');
  await writeFile('dist/cloud.html', template.replace('__CANOPY_CSP__', csp));
  await copyFile('cloud/cloud.css', 'dist/cloud.css');
  // Preserve the local pilot as a separate entry point. No data is copied or migrated.
  for (const file of ['index.html', 'app.js', 'styles.css']) await copyFile(file, `dist/${file}`);
  console.log('Built dist/: V1 pilot and opt-in cloud foundation. No deployment performed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
