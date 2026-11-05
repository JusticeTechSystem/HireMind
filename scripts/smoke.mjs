// Post-deploy smoke test. Usage: node scripts/smoke.mjs https://api.example.com [https://app.example.com]
// Read-only: no login, no data written. Exits non-zero if any check fails.
const API = (process.argv[2] ?? '').replace(/\/$/, ''), WEB = (process.argv[3] ?? '').replace(/\/$/, '');
if (!API) { console.error('usage: node scripts/smoke.mjs <api-origin> [web-origin]'); process.exit(2); }
let fail = 0; const ok = (n, c, extra = '') => { if (!c) fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`); };
const get = (p, init) => fetch(API + p, { redirect: 'manual', ...init });
const h = await get('/api/v1/health'); const hj = await h.json().catch(() => ({}));
ok('health is ok', h.status === 200 && hj.status === 'ok'); ok('request id header present', !!h.headers.get('x-request-id'));
ok('readiness (database reachable)', (await get('/api/v1/health/ready')).status === 200);
for (const [k, v] of Object.entries(hj.integrations ?? {})) console.log(`${v ? 'INFO' : 'WARN'} integration ${k}: ${v ? 'configured' : 'NOT configured'}`);
ok('X-Content-Type-Options: nosniff', h.headers.get('x-content-type-options') === 'nosniff'); ok('X-Powered-By hidden', !h.headers.get('x-powered-by'));
if (API.startsWith('https://')) ok('HSTS header', !!h.headers.get('strict-transport-security'));
for (const p of ['/api/v1/dashboard', '/api/v1/admin/overview', '/api/v1/sessions', '/api/v1/account/export']) ok(`${p} requires login`, (await get(p)).status === 401);
ok('webhook rejects unsigned requests', (await get('/api/v1/billing/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 400);
const cors = await get('/api/v1/health', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
ok('CORS refuses a foreign origin', cors.headers.get('access-control-allow-origin') !== 'https://evil.example' && cors.headers.get('access-control-allow-origin') !== '*');
const plans = await get('/api/v1/billing/plans'); ok('public plans list', plans.status === 200 && Array.isArray(await plans.json().catch(() => null)));
const docs = await get('/api/docs'); console.log(`${docs.status === 200 ? 'WARN' : 'INFO'} Swagger UI at /api/docs is ${docs.status === 200 ? 'PUBLIC (consider disabling in production)' : 'not exposed'}`);
if (WEB) { const w = await fetch(WEB + '/'); const t = await w.text(); ok('web app serves', w.status === 200 && t.includes('id="root"')); ok('SPA fallback (/pricing)', (await fetch(WEB + '/pricing')).status === 200); ok('web sends X-Content-Type-Options', (await fetch(WEB)).headers.get('x-content-type-options') === 'nosniff', 'set in your host/CDN config if this fails'); }
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed'); process.exit(fail ? 1 : 0);
