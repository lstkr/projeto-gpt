// Test-only preloader for the spawned Next.js production server.
// Never use this in production; it simulates one inventory session and blocks
// outbound HTTP so the integration test cannot contact a real Supabase project.
const previousFetch = globalThis.fetch;
globalThis.fetch = async (resource, init) => {
  const raw = typeof resource === 'string' ? resource : resource?.url;
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    if (url.pathname.endsWith('/rest/v1/rpc/inventory_validate_session')) {
      return new Response(JSON.stringify({
        valid: true,
        user: { id: '11111111-1111-4111-8111-111111111111', role: 'admin' }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('External fetch blocked during PDF integration test');
  }
  return previousFetch(resource, init);
};
