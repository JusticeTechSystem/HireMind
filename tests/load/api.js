// k6 load test. PROPOSED targets (not measured): health p95 < 200 ms, authenticated reads p95 < 500 ms, < 1% errors at 50 req/s.
// Run against staging, never production: k6 run -e BASE_URL=https://staging.example.com -e TOKEN=<supabase access token> tests/load/api.js
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000'; const TOKEN = __ENV.TOKEN;
export const options = {
  scenarios: { steady: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s', duration: '2m', preAllocatedVUs: 50, maxVUs: 200 } },
  thresholds: { http_req_failed: ['rate<0.01'], 'http_req_duration{endpoint:health}': ['p(95)<200'], 'http_req_duration{endpoint:dashboard}': ['p(95)<500'], 'http_req_duration{endpoint:history}': ['p(95)<500'] },
};
export default function () {
  check(http.get(`${BASE}/api/v1/health`, { tags: { endpoint: 'health' } }), { 'health 200': (r) => r.status === 200 });
  if (!TOKEN) return;
  const h = { headers: { Authorization: `Bearer ${TOKEN}` } };
  check(http.get(`${BASE}/api/v1/dashboard`, { ...h, tags: { endpoint: 'dashboard' } }), { 'dashboard 200': (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/interviews?page=1`, { ...h, tags: { endpoint: 'history' } }), { 'history 200': (r) => r.status === 200 });
}
