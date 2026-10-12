import { spawnSync } from 'node:child_process';

const bypass = ['localhost','127.0.0.1','supabase_db_Canopy','supabase_auth_Canopy','supabase_rest_Canopy','supabase_inbucket_Canopy'];
const noProxy = [...new Set([...(process.env.NO_PROXY || process.env.no_proxy || '').split(',').filter(Boolean), ...bypass])].join(',');
const args = ['--no-install','supabase','start','-x',
  'realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'];
// BusyBox wget in some proxied sandboxes ignores NO_PROXY for container probes.
// Only opt into this diagnosed workaround; actual HTTP health is still required below.
if (process.env.CANOPY_LOCAL_PROXY_HEALTH_WORKAROUND === '1') args.push('--ignore-health-check');
const result = spawnSync('npx', args, {
  stdio: 'inherit', env: { ...process.env, NO_PROXY: noProxy, no_proxy: noProxy },
});
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
  try {
    const response = await fetch('http://127.0.0.1:54321/auth/v1/health', { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok || data.name !== 'GoTrue') throw new Error('Unexpected Auth health response.');
    console.log('Local Auth HTTP readiness verified. Run npm run test:integration for end-to-end readiness.');
  } catch { console.error('Local Auth HTTP readiness failed.'); process.exitCode = 1; }
}
