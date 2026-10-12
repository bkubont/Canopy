import { createClient } from './sdk.bundle.mjs';
import { createAccountHandler } from './handler.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(15000) }) },
});
Deno.serve(createAccountHandler({ admin, appOrigin: Deno.env.get('CANOPY_APP_ORIGIN')!,
  redirectUrl: Deno.env.get('CANOPY_AUTH_REDIRECT_URL')! }));
