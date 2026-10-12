import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
// Bundle the same lockfile-verified official SDK, with no credentials/configuration.
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},
  outfile:'supabase/functions/account-admin/sdk.bundle.mjs',bundle:true,platform:'browser',
  format:'esm',target:'es2022',minify:true});
console.log('Built official SDK bundle for Edge Runtime; no secrets embedded.');
