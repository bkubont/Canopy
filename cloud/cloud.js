import { createClient } from '@supabase/supabase-js';

const config = __CANOPY_CONFIG__;
const supabase = createClient(config.url, config.key, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(15000) }) },
});
const root = document.getElementById('app');
let session = null, memberships = [], organization = null, generation = 0;
let busy = false, passwordSetup = false;
const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function notice(message, error = false) {
  const el = document.getElementById(error ? 'error' : 'status');
  if (el) el.textContent = message;
}
function frame(body) {
  root.innerHTML = `<h1>Canopy</h1>${body}<p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>`;
  root.setAttribute('aria-busy', 'false');
}
function setBusy(value) {
  busy = value;
  root.setAttribute('aria-busy', String(value));
  root.querySelectorAll('button, input, select').forEach(el => { el.disabled = value; });
}
function login() {
  frame(`<h2>Sign in to your workspace</h2>
    <p>Accounts are provisioned by your administrator. Your local V1 records stay in this browser and are not uploaded.</p>
    <form id="login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254">
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button></form>`);
}
function workspace() {
  const member = memberships.find(m => m.organization_id === organization);
  const admin = member && ['owner', 'admin'].includes(member.role);
  frame(`<div class="toolbar"><h2>Shared workspace</h2><button id="logout">Sign out</button></div>
    <p class="muted">Authentication and shared records preview. The full planner remains in V1.</p>
    ${memberships.length ? `<label for="organization">Organization</label><select id="organization">${memberships.map(m =>
      `<option value="${text(m.organization_id)}" ${m.organization_id === organization ? 'selected' : ''}>${text(m.organizations.name)} · ${text(m.role)}</option>`).join('')}</select>` :
      '<p>No organization access. Ask your administrator to provision an active membership.</p>'}
    <button id="change-password">Set or change password</button>
    ${passwordSetup ? `<form id="password-form"><label for="new-password">New password (at least 12 characters)</label>
      <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" required>
      <button type="submit">Save password</button></form>` : ''}
    ${member ? `<button id="refresh">Refresh records</button>
      <section><h3>Clients</h3><div id="clients">Loading…</div></section>
      <section><h3>Projects</h3><div id="projects">Loading…</div></section>
      ${admin ? `<form id="client-form"><h3>Add client</h3><label for="client-name">Client name</label>
        <input id="client-name" name="name" required maxlength="160">
        <label for="client-phone">Phone</label><input id="client-phone" name="phone" type="tel" maxlength="80">
        <label for="client-email">Client email</label><input id="client-email" name="email" type="email" maxlength="254">
        <label for="client-address">Address</label><input id="client-address" name="address" maxlength="1000">
        <button type="submit">Save client</button></form>` : '<p>Employee access is read-only and limited to assigned projects and their clients.</p>'}` : ''}`);
}

async function refresh() {
  const ticket = generation, org = organization;
  if (!org || !session) return;
  notice('Loading records…');
  const [clients, projects] = await Promise.all([
    supabase.from('clients').select('id,name,phone,email,address').eq('organization_id', org).order('name').limit(100),
    supabase.from('projects').select('id,title,stage,version').eq('organization_id', org).order('created_at', { ascending: false }).limit(100),
  ]);
  if (ticket !== generation || org !== organization || !session) return;
  if (clients.error || projects.error) {
    document.getElementById('clients').textContent = 'Records unavailable.';
    document.getElementById('projects').textContent = 'Records unavailable.';
    throw clients.error || projects.error;
  }
  document.getElementById('clients').innerHTML = clients.data.map(c =>
    `<div class="record"><strong>${text(c.name)}</strong><p>${text([c.phone, c.email, c.address].filter(Boolean).join(' · '))}</p></div>`).join('') || '<p>No permitted clients.</p>';
  document.getElementById('projects').innerHTML = projects.data.map(p =>
    `<div class="record"><strong>${text(p.title)}</strong><p>${text(p.stage)}</p></div>`).join('') || '<p>No permitted projects.</p>';
  notice('Records refreshed. Showing up to 100 clients and 100 projects.');
}

async function applySession(next, event) {
  // Token refresh changes no account or membership. Recheck membership on manual refresh.
  if (session?.user.id === next?.user.id && event === 'TOKEN_REFRESHED') { session = next; return; }
  const ticket = ++generation;
  session = next;
  memberships = []; organization = null; busy = false;
  if (!next) { passwordSetup = false; login(); return; }
  if (event === 'PASSWORD_RECOVERY') passwordSetup = true;
  frame('<h2>Checking organization access…</h2><button id="logout">Sign out</button>');
  try {
    const { data, error } = await supabase.from('memberships')
      .select('organization_id,role,organizations(name)').eq('user_id', next.user.id).eq('active', true);
    if (ticket !== generation) return;
    if (error) throw error;
    memberships = data;
    organization = memberships[0]?.organization_id || null;
    workspace();
  } catch {
    if (ticket !== generation) return;
    workspace();
    notice('Could not load organization access. Try signing out and signing in again.', true);
    return;
  }
  try { await refresh(); }
  catch { if (ticket === generation) notice('Could not load shared records. Use Refresh records to retry.', true); }
}

async function action(operation, success = '') {
  if (busy) return;
  const ticket = generation;
  notice('', true); setBusy(true);
  try { await operation(); if (ticket === generation && success) notice(success); }
  catch (error) {
    if (ticket === generation) notice(error.message || 'Request failed. Please retry.', true);
  } finally { if (ticket === generation) setBusy(false); }
}

root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, values = Object.fromEntries(new FormData(form));
  if (form.id === 'login') action(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) throw new Error('Sign-in failed. Check your credentials or contact your administrator.');
  });
  if (form.id === 'password-form') action(async () => {
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) throw error;
    form.reset(); passwordSetup = false;
  }, 'Password updated.');
  if (form.id === 'client-form') action(async () => {
    const { error } = await supabase.from('clients').insert({ organization_id: organization, ...values });
    if (error) throw error;
    form.reset(); await refresh();
  }, 'Client saved to the shared database.');
});
root.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || busy) return;
  if (button.id === 'logout') action(async () => {
    // Revoke the server refresh session before clearing this UI. An error is shown on failure.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await applySession(null, 'SIGNED_OUT');
  });
  if (button.id === 'refresh') action(async () => {
    const previous = organization;
    await applySession(session, 'MANUAL_REFRESH');
    if (memberships.some(m => m.organization_id === previous) && previous !== organization) {
      organization = previous; generation++; workspace(); await refresh();
    }
  });
  if (button.id === 'change-password') { passwordSetup = true; workspace(); action(refresh); }
});
root.addEventListener('change', event => {
  if (event.target.id !== 'organization') return;
  const value = event.target.value;
  if (!memberships.some(m => m.organization_id === value)) return;
  organization = value; generation++; workspace(); action(refresh);
});

supabase.auth.onAuthStateChange((event, next) => {
  // Do not await SDK operations inside the Auth callback (it holds an internal lock).
  setTimeout(() => { void applySession(next, event); }, 0);
});
