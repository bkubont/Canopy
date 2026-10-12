const { test } = require('node:test');
const assert = require('node:assert/strict');

test('cloud builds reject absent configuration and privileged keys', async () => {
  const { publicConfig } = await import('../scripts/build-cloud.mjs');
  const url = 'https://sample.supabase.co';
  for (const key of ['', 'sb_secret_test', 'YOUR-PUBLIC-PUBLISHABLE-KEY']) {
    assert.throws(() => publicConfig({ CANOPY_SUPABASE_URL: url, CANOPY_SUPABASE_PUBLISHABLE_KEY: key }));
  }
  const jwt = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.throws(() => publicConfig({ CANOPY_SUPABASE_URL: url, CANOPY_SUPABASE_PUBLISHABLE_KEY: jwt }));
  assert.throws(() => publicConfig({ CANOPY_SUPABASE_URL: 'http://sample.supabase.co', CANOPY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }));
  assert.throws(() => publicConfig({ CANOPY_SUPABASE_URL: "https://sample.supabase.co/path", CANOPY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }));
  assert.equal(publicConfig({ CANOPY_SUPABASE_URL: url, CANOPY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).url, url);
  assert.equal(publicConfig({ CANOPY_SUPABASE_URL: 'http://127.0.0.1:54321', CANOPY_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).url, 'http://127.0.0.1:54321');
});
