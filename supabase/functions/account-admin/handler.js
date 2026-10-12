// Web-standard handler; the Deno adapter supplies the real server-only Supabase client.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = ['owner', 'admin', 'crew_lead', 'worker'];
export function createAccountHandler({ admin, appOrigin, redirectUrl }) {
  const redirect = new URL(redirectUrl);
  const local = ['127.0.0.1', 'localhost'].includes(redirect.hostname);
  if (redirect.origin !== appOrigin || redirect.username || redirect.password || redirect.hash || redirect.search ||
      (!local && redirect.protocol !== 'https:') || !['https:', 'http:'].includes(redirect.protocol)) {
    throw new Error('Configure an exact HTTPS application origin and recovery/invitation redirect.');
  }
  return async request => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': appOrigin, 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (request.headers.get('Origin') && request.headers.get('Origin') !== appOrigin) return reply(403, { error: 'Origin denied.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'POST required.' });
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401, { error: 'Authentication required.' });
    try {
      // Validate with Auth; never decode/trust JWT claims or accept a caller-supplied actor.
      const { data: identity, error: identityError } = await admin.auth.getUser(token);
      if (identityError || !identity?.user) {
        if(identityError && !identityError.status) return reply(503,{error:'Authentication service unavailable.'});
        return reply(401, { error: 'Authentication required.' });
      }
      if (Number(request.headers.get('content-length') || 0) > 4096) return reply(413, { error: 'Request too large.' });
      const reader=request.body?.getReader();
      const chunks=[];let size=0;
      if(reader) while(true){
        const part=await reader.read();if(part.done)break;
        size+=part.value.byteLength;
        if(size>4096){await reader.cancel();return reply(413,{error:'Request too large.'});}
        chunks.push(part.value);
      }
      const bytes=new Uint8Array(size);let offset=0;
      for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
      const raw=new TextDecoder().decode(bytes);
      let body; try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid JSON.' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Invalid request.' });
      const actor = identity.user.id;
      const run = async (name, args) => {
        const { data, error } = await admin.rpc(name, args);
        if (error) throw { code: error.code };
        return data;
      };
      if (body.action === 'invite') {
        if (!uuid.test(body.organization_id || '') || !uuid.test(body.request_id || '') ||
            typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
            !['admin', 'crew_lead', 'worker'].includes(body.role)) return reply(400, { error: 'Invalid invitation.' });
        const invitation = await run('prepare_organization_invitation', { actor, org: body.organization_id,
          invite_email: body.email, invite_role: body.role, request_id: body.request_id });
        if (invitation.status === 'sent' || invitation.status === 'accepted') return reply(200, { invitation_id: invitation.id, status: invitation.status });
        if (invitation.status !== 'pending') return reply(409, { error: 'Invitation is inactive. Create a new request.' });
        if(!await run('claim_invitation_delivery',{actor,invite:invitation.id}))
          return reply(409,{error:'Invitation delivery is already in progress. Check its status before retrying.'});
        let userId = await run('resolve_invitation_user', { actor, invite: invitation.id });
        let delivery;
        if (userId) {
          delivery = await admin.auth.signInWithOtp({ email: invitation.email,
            options: { shouldCreateUser: false, emailRedirectTo: redirectUrl } });
        } else {
          delivery = await admin.auth.admin.inviteUserByEmail(invitation.email, { redirectTo: redirectUrl });
          userId = delivery.data?.user?.id;
        }
        await run('finish_organization_invitation', { actor, invite: invitation.id,
          invited_user: userId || null, delivered: !delivery.error && !!userId });
        if (delivery.error || !userId) return reply(502, { error: 'Invitation delivery failed. Check provider email configuration before retrying.' });
        return reply(200, { invitation_id: invitation.id, status: 'sent' });
      }
      if (body.action === 'membership') {
        if (!uuid.test(body.organization_id || '') || !uuid.test(body.user_id || '') || !roles.includes(body.role) ||
            typeof body.active !== 'boolean') return reply(400, { error: 'Invalid membership request.' });
        await run('admin_change_membership', { actor, org: body.organization_id, target_user: body.user_id,
          new_role: body.role, is_active: body.active });
        return reply(200, { status: 'updated' });
      }
      if (body.action === 'revoke_invitation') {
        if (!uuid.test(body.invitation_id || '')) return reply(400, { error: 'Invalid invitation identifier.' });
        await run('revoke_organization_invitation', { actor, invite: body.invitation_id });
        return reply(200, { status: 'revoked' });
      }
      return reply(400, { error: 'Unknown operation.' });
    } catch (error) {
      // No token, email, SQL detail or provider response is logged/reflected.
      const code = error?.code;
      if (code === '42501') return reply(403, { error: 'Not authorized.' });
      if (['23514', '23505', '22023'].includes(code)) return reply(409, { error: 'Request conflicts with account protections or existing invitation.' });
      if (code === '54000') return reply(429, { error: 'Invitation rate limit reached.' });
      return reply(503, { error: 'Account operation unavailable. Retry after checking service configuration.' });
    }
  };
}
