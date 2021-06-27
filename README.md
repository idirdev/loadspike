# loadspike

> **[EN]** Fire HTTP/HTTPS load tests against any URL — configurable concurrency, request count, and method — get P50/P95/P99 latency stats instantly.
> **[FR]** Lancez des tests de charge HTTP/HTTPS sur n'importe quelle URL — concurrence, nombre de requêtes et méthode configurables — obtenez des stats de latence P50/P95/P99 instantanément.

---

## Features / Fonctionnalités

**[EN]**
- Concurrent HTTP/HTTPS load testing with configurable worker pool
- Tracks success/failure counts, total duration, and requests per second
- Full latency percentiles: avg, P50, P95, P99, min, max
- Supports any HTTP method (GET, POST, PUT, DELETE, etc.)
- Works with self-signed TLS certificates (no rejection)
- Configurable per-request timeout
- Zero external dependencies — uses Node.js `http` / `https` core modules

**[FR]**
- Tests de charge HTTP/HTTPS concurrent avec pool de workers configurable
- Suivi du nombre de succès/échecs, de la durée totale et des requêtes par seconde
- Percentiles de latence complets : avg, P50, P95, P99, min, max
- Supporte toutes les méthodes HTTP (GET, POST, PUT, DELETE, etc.)
- Fonctionne avec les certificats TLS auto-signés (pas de rejet)
- Timeout par requête configurable
- Aucune dépendance externe — utilise les modules core Node.js `http` / `https`

---

## Installation

```bash
npm install -g @idirdev/loadspike
```

---

## CLI Usage / Utilisation CLI

```bash
# Default: 100 requests, 10 concurrent
# Par défaut : 100 requêtes, 10 concurrentes
loadspike https://example.com

# 500 requests with 50 concurrent workers
# 500 requêtes avec 50 workers concurrents
loadspike https://api.example.com/health -n 500 -c 50

# POST requests
# Requêtes POST
loadspike https://api.example.com/submit -n 200 -c 20 -m POST

# Quick smoke test — 10 requests, 5 concurrent
# Test rapide — 10 requêtes, 5 concurrentes
loadspike https://myapp.com -n 10 -c 5

# Test HTTP (non-TLS) endpoint
# Tester un endpoint HTTP (sans TLS)
loadspike http://localhost:3000/api/users -n 50 -c 10
```

### Example Output / Exemple de sortie

```
Loading https://api.example.com/health (500 reqs, 50 concurrent)...

Results:
  Total:    500 (498 ok, 2 failed)
  Duration: 4821ms
  RPS:      103.71
  Avg:      241ms
  P50:      218ms
  P95:      487ms
  P99:      612ms
```

---

## API (Programmatic) / API (Programmation)

```js
const { loadTest, request } = require('@idirdev/loadspike');

// Run a full load test
// Lancer un test de charge complet
const results = await loadTest('https://api.example.com/health', {
  requests:    500,   // total number of requests / nombre total de requêtes
  concurrency: 50,    // parallel workers / workers parallèles
  method:      'GET', // HTTP method / méthode HTTP
  timeout:     10000  // ms per request / ms par requête
});
// => {
//   total: 500, success: 498, failed: 2,
//   duration: 4821, rps: 103.71,
//   avg: 241, p50: 218, p95: 487, p99: 612,
//   min: 134, max: 891
// }

// Single request with timing
// Requête unique avec timing
const resp = await request('https://api.example.com/users', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ name: 'test' }),
  timeout: 5000
});
// => { ok: true, status: 201, ms: 143, bytes: 87 }

// Failed request
// Requête échouée
const bad = await request('https://down.example.com');
// => { ok: false, error: 'timeout', ms: 10000 }
```

---

## License

MIT © idirdev
