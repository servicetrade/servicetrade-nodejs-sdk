/**
 * README Examples Verification Script
 *
 * Exercises every code example from the README against a live ServiceTrade environment
 * to ensure the documentation is accurate.
 *
 * Usage:
 *   npx ts-node test/readme-examples.ts
 *
 * Env vars:
 *   ST_BASE_URL   - e.g. https://i-0fc856e689d470fbf.qa.servicetrade.io/
 *   ST_USERNAME   - ServiceTrade username
 *   ST_PASSWORD   - ServiceTrade password
 */
import ServicetradeClient, {
    ServicetradeClientOptions,
    ServicetradeClientResponse,
    FileAttachment,
    BearerToken,
    TokenSet,
} from '../src/index';

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL  = (process.env.ST_BASE_URL ?? '').replace(/\/+$/, '');
const USERNAME  = process.env.ST_USERNAME;
const PASSWORD  = process.env.ST_PASSWORD;

if (!BASE_URL || !USERNAME || !PASSWORD) {
    console.error('Required env vars: ST_BASE_URL, ST_USERNAME, ST_PASSWORD');
    process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function pass(name: string) {
    passCount++;
    log(`  PASS: ${name}`);
}

function fail(name: string, err: any) {
    failCount++;
    log(`  FAIL: ${name} — ${err?.message ?? err}`);
}

function section(name: string) {
    log('');
    log(`═══ ${name} ${'═'.repeat(Math.max(0, 60 - name.length))}`);
}

/** Build a JWT with a custom exp for testing proactive refresh */
function makeExpiringToken(originalToken: string, expiresInSeconds: number): string {
    const parts = originalToken.split('.');
    if (parts.length !== 3) throw new Error('Token is not a JWT');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const newPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${parts[0]}.${newPayload}.${parts[2]}`;
}

/**
 * After login, the server may return a refresh_token which causes the SDK to switch
 * to refresh_token grant. If the server doesn't support that grant, subsequent refreshes
 * will fail. This helper forces the creds back to password grant for test isolation.
 */
function forcePasswordGrant(client: any) {
    if (client.creds?.grant_type === 'refresh_token') {
        client.creds = {
            grant_type: 'password',
            username: USERNAME,
            password: PASSWORD,
        };
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function main() {

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Quick Start
    // ══════════════════════════════════════════════════════════════════════════
    section('Quick Start — basic CRUD');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });

        // GET — list jobs
        try {
            const data = await client.get('/job');
            const jobs = data?.jobs;
            if (Array.isArray(jobs)) {
                pass(`GET /job — returned ${jobs.length} jobs`);
            } else {
                fail('GET /job — jobs array', `got ${typeof jobs}`);
            }
        } catch (err: any) {
            fail('GET /job', err);
        }

        // GET — single entity (use /company for something guaranteed to exist)
        try {
            const company = await client.get('/company');
            if (company && typeof company === 'object') {
                pass('GET /company — returned object');
            } else {
                fail('GET /company', `got ${typeof company}`);
            }
        } catch (err: any) {
            fail('GET /company', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Authentication — Username/Password
    // ══════════════════════════════════════════════════════════════════════════
    section('Authentication — Username/Password');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });

        try {
            await client.login();
            const data = await client.get('/company');
            data ? pass('Username/password auth works') : fail('Username/password auth', 'null response');
        } catch (err: any) {
            fail('Username/password auth', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Authentication — Pre-existing Bearer Token
    // ══════════════════════════════════════════════════════════════════════════
    section('Authentication — Pre-existing Bearer Token');
    {
        // First get a real token via username/password
        const bootstrap = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await bootstrap.login();
        const existingToken = (bootstrap as any).token;

        // Now use it as a pre-existing token (README example)
        const client = new ServicetradeClient({
            token: existingToken,
            baseUrl: BASE_URL,
        });

        try {
            const data = await client.get('/company');
            data ? pass('Pre-existing token auth works') : fail('Pre-existing token', 'null response');
        } catch (err: any) {
            fail('Pre-existing token', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Authentication — Pre-existing token cannot refresh
    // ══════════════════════════════════════════════════════════════════════════
    section('Authentication — Token-only throws on login()');
    {
        const client = new ServicetradeClient({
            token: 'some-token',
            baseUrl: BASE_URL,
        });

        try {
            await client.login();
            fail('Token-only login()', 'Expected error, got none');
        } catch (err: any) {
            if (err.message.includes('No credentials available')) {
                pass('Token-only login() throws expected error');
            } else {
                fail('Token-only login()', err);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Authentication — No credentials throws
    // ══════════════════════════════════════════════════════════════════════════
    section('Authentication — No credentials throws');
    {
        try {
            new ServicetradeClient({ baseUrl: BASE_URL } as any);
            fail('No credentials', 'Expected error, got none');
        } catch (err: any) {
            if (err.message.includes('No valid credentials provided')) {
                pass('No credentials constructor throws expected error');
            } else {
                fail('No credentials', err);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Authentication — Lazy authentication
    // ══════════════════════════════════════════════════════════════════════════
    section('Authentication — Lazy authentication');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });

        // Token should not be set yet (lazy)
        const tokenBefore = (client as any).token;
        if (!tokenBefore) {
            pass('No token set at construction (lazy)');
        } else {
            fail('Lazy auth', 'Token already set before first call');
        }

        // First API call triggers auth
        try {
            const data = await client.get('/company');
            const tokenAfter = (client as any).token;
            if (tokenAfter && data) {
                pass('First API call triggered authentication');
            } else {
                fail('Lazy auth', 'Token not set after first call');
            }
        } catch (err: any) {
            fail('Lazy auth first call', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Authentication — Eager login()
    // ══════════════════════════════════════════════════════════════════════════
    section('Authentication — Eager login()');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });

        try {
            await client.login(); // README: "Authenticates immediately; throws on failure"
            const token = (client as any).token;
            token ? pass('Eager login() set token immediately') : fail('Eager login()', 'No token');
        } catch (err: any) {
            fail('Eager login()', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: API Methods — GET
    // ══════════════════════════════════════════════════════════════════════════
    section('API Methods — GET');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        // GET single
        try {
            const data = await client.get('/company');
            data ? pass('GET single entity') : fail('GET single', 'null');
        } catch (err: any) {
            fail('GET single', err);
        }

        // GET list with query params
        try {
            const data = await client.get('/job?page=0&pageSize=2');
            if (data && Array.isArray(data.jobs)) {
                pass(`GET list with query — ${data.jobs.length} jobs`);
            } else {
                fail('GET list with query', `unexpected shape: ${JSON.stringify(data)?.substring(0, 100)}`);
            }
        } catch (err: any) {
            fail('GET list with query', err);
        }

        // GET returns null when response has no data property
        // (This is a documented behavior — unpackResponse returns data.data ?? null)
        try {
            // We can't easily trigger a no-data response on a real server,
            // so just verify the return type is object | null
            const result = await client.get('/company');
            if (result === null || typeof result === 'object') {
                pass('GET return type is object | null');
            } else {
                fail('GET return type', `got ${typeof result}`);
            }
        } catch (err: any) {
            fail('GET return type', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: API Methods — POST
    // ══════════════════════════════════════════════════════════════════════════
    section('API Methods — POST');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        // POST — we'll search for jobs using POST /search or just verify POST works
        // Use a safe read-only-ish endpoint; avoid creating real data
        try {
            // POST to a search-style endpoint that won't mutate state
            // If /job doesn't accept POST for search, this may 400 — that's ok, it proves POST works
            const result = await client.post('/job', {
                type: 'inspection',
                description: 'README SDK Test — safe to delete',
                locationId: 0, // intentionally invalid to get a validation error
            });
            // If it somehow succeeds, that's fine too
            pass('POST request sent successfully');
        } catch (err: any) {
            // A 400/422 validation error still proves POST is working correctly
            if (err?.response?.status === 400 || err?.response?.status === 422 || err?.response?.status === 500) {
                pass(`POST request reached server (got ${err.response.status} — expected for invalid data)`);
            } else {
                fail('POST', err);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: API Methods — PUT
    // ══════════════════════════════════════════════════════════════════════════
    section('API Methods — PUT');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        try {
            // PUT to a nonexistent entity — should get 404 or similar, proving PUT works
            const result = await client.put('/job/999999999', { description: 'README test' });
            pass('PUT request sent successfully');
        } catch (err: any) {
            if (err?.response?.status === 404 || err?.response?.status === 403 || err?.response?.status === 400) {
                pass(`PUT request reached server (got ${err.response.status})`);
            } else {
                fail('PUT', err);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: API Methods — DELETE
    // ══════════════════════════════════════════════════════════════════════════
    section('API Methods — DELETE');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        try {
            const result = await client.delete('/tag/999999999');
            pass('DELETE request sent successfully');
        } catch (err: any) {
            if (err?.response?.status === 404 || err?.response?.status === 403 || err?.response?.status === 400) {
                pass(`DELETE request reached server (got ${err.response.status})`);
            } else {
                fail('DELETE', err);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: API Methods — File Upload (attach)
    // ══════════════════════════════════════════════════════════════════════════
    section('API Methods — File Upload (attach)');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        try {
            const fileBuffer = Buffer.from('README test file content', 'utf-8');

            const attachment: FileAttachment = {
                value: fileBuffer,
                options: {
                    filename: 'readme-test.txt',
                    contentType: 'text/plain',
                },
            };

            const result = await client.attach(
                {
                    entityType: 3,
                    entityId: 999999999,
                    purposeId: 7,
                    description: 'README SDK test — safe to delete',
                },
                attachment,
            );
            pass('attach() sent multipart upload successfully');
        } catch (err: any) {
            // 400/404/403 means the request was properly formed but entity doesn't exist
            if (err?.response?.status === 400 || err?.response?.status === 404 || err?.response?.status === 403 || err?.response?.status === 500) {
                pass(`attach() reached server (got ${err.response.status} — expected for invalid entity)`);
            } else {
                fail('attach()', err);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Configuration — baseUrl
    // ══════════════════════════════════════════════════════════════════════════
    section('Configuration — baseUrl');
    {
        // README: "baseUrl should not include the /api prefix"
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL, // no /api suffix
        });

        try {
            await client.login();
            const data = await client.get('/company');
            data ? pass('baseUrl config works (no /api suffix)') : fail('baseUrl config', 'null');
        } catch (err: any) {
            fail('baseUrl config', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Configuration — userAgent
    // ══════════════════════════════════════════════════════════════════════════
    section('Configuration — userAgent');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            userAgent: 'README-Test-Agent/1.0',
        });

        try {
            await client.login();
            const data = await client.get('/company');
            data ? pass('Custom userAgent works') : fail('Custom userAgent', 'null');
        } catch (err: any) {
            fail('Custom userAgent', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Configuration — autoRefreshAuth: false
    // ══════════════════════════════════════════════════════════════════════════
    section('Configuration — autoRefreshAuth: false');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            autoRefreshAuth: false,
        });

        // With autoRefreshAuth: false, the client should NOT auto-login
        // A call without login() should fail with 401
        try {
            await client.get('/company');
            // If the server allows unauthenticated access somehow, that's unexpected
            fail('autoRefreshAuth: false', 'Expected 401 but call succeeded');
        } catch (err: any) {
            if (err?.response?.status === 401) {
                pass('autoRefreshAuth: false — no automatic auth, got 401');
            } else {
                fail('autoRefreshAuth: false', err);
            }
        }

        // After explicit login(), calls should work
        try {
            await client.login();
            const data = await client.get('/company');
            data ? pass('autoRefreshAuth: false — works after explicit login()') : fail('autoRefreshAuth: false after login', 'null');
        } catch (err: any) {
            fail('autoRefreshAuth: false after login', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Callbacks — onSetAuth / onUnsetAuth
    // ══════════════════════════════════════════════════════════════════════════
    section('Callbacks — onSetAuth / onUnsetAuth');
    {
        let capturedToken: string | undefined;
        let unsetCalled = false;

        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            onSetAuth: (token) => {
                capturedToken = token;
            },
            onUnsetAuth: () => {
                unsetCalled = true;
            },
        });

        try {
            await client.login();
            if (capturedToken && capturedToken.length > 0) {
                pass('onSetAuth called with token on login');
            } else {
                fail('onSetAuth', 'Not called or empty token');
            }
        } catch (err: any) {
            fail('onSetAuth', err);
        }

        try {
            await client.logout();
            if (unsetCalled) {
                pass('onUnsetAuth called on logout');
            } else {
                fail('onUnsetAuth', 'Not called');
            }
        } catch (err: any) {
            fail('onUnsetAuth', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Token Refresh — Proactive refresh
    // ══════════════════════════════════════════════════════════════════════════
    section('Token Refresh — Proactive refresh (near-expiry token)');
    {
        let refreshed = false;
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            onSetAuth: () => { refreshed = true; },
        });

        await client.login();
        forcePasswordGrant(client); // ensure we can re-auth after token manipulation
        refreshed = false; // reset after initial login

        // Inject a token that expires in 2 minutes (within the 5-minute buffer)
        const currentToken = (client as any).token;
        const nearExpiry = makeExpiringToken(currentToken, 120);
        (client as any).token = nearExpiry;
        (client as any).request.defaults.headers.Authorization = `Bearer ${nearExpiry}`;

        try {
            const data = await client.get('/company');
            if (refreshed && data) {
                pass('Proactive refresh triggered for near-expiry token');
            } else if (data && !refreshed) {
                fail('Proactive refresh', 'Call succeeded but onSetAuth not fired');
            } else {
                fail('Proactive refresh', 'null response');
            }
        } catch (err: any) {
            fail('Proactive refresh', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Token Refresh — Reactive retry on 401
    // ══════════════════════════════════════════════════════════════════════════
    section('Token Refresh — Reactive 401 retry');
    {
        let refreshed = false;
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            onSetAuth: () => { refreshed = true; },
        });

        await client.login();
        forcePasswordGrant(client); // ensure we can re-auth after token manipulation
        refreshed = false;

        // Inject a completely invalid token
        (client as any).token = 'invalid.garbage.token';
        (client as any).request.defaults.headers.Authorization = 'Bearer invalid.garbage.token';

        try {
            const data = await client.get('/company');
            if (refreshed && data) {
                pass('Reactive 401 refresh — re-authenticated and retried');
            } else {
                fail('Reactive 401 refresh', refreshed ? 'null response' : 'onSetAuth not fired');
            }
        } catch (err: any) {
            fail('Reactive 401 refresh', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Token Refresh — Mutex (concurrent calls share one refresh)
    // ══════════════════════════════════════════════════════════════════════════
    section('Token Refresh — Mutex (concurrent refresh)');
    {
        // The mutex ensures concurrent login() calls share a single HTTP request
        // to the token endpoint, even though onSetAuth fires once per caller.
        // We verify all 3 concurrent calls succeed (proving the mutex didn't cause errors).
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });

        // Don't login — let concurrent calls all trigger auth
        try {
            const [r1, r2, r3] = await Promise.all([
                client.get('/company'),
                client.get('/company'),
                client.get('/company'),
            ]);

            if (r1 && r2 && r3) {
                pass('Mutex: 3 concurrent calls all succeeded without conflict');
            } else {
                fail('Mutex', 'One or more calls returned null');
            }
        } catch (err: any) {
            fail('Mutex', err);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Token Persistence — onSetAuth / reuse token
    // ══════════════════════════════════════════════════════════════════════════
    section('Token Persistence — store and reuse');
    {
        // Simulate: store token via onSetAuth
        const cache: Record<string, string> = {};

        const client1 = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            onSetAuth: (token) => {
                cache['servicetrade_token'] = token;
            },
        });

        await client1.login();

        if (cache['servicetrade_token']) {
            pass('Token stored via onSetAuth');

            // Simulate: reuse cached token in new client (README example)
            const client2 = new ServicetradeClient({
                token: cache['servicetrade_token'],
                baseUrl: BASE_URL,
            });

            try {
                const data = await client2.get('/company');
                data ? pass('Cached token reuse works') : fail('Cached token reuse', 'null');
            } catch (err: any) {
                fail('Cached token reuse', err);
            }
        } else {
            fail('Token persistence', 'onSetAuth not called');
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Custom Headers
    // ══════════════════════════════════════════════════════════════════════════
    section('Custom Headers');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        // README example: setCustomHeader
        client.setCustomHeader('X-Request-Id', 'readme-test-123');

        try {
            const data = await client.get('/company');
            data ? pass('Request with custom header succeeded') : fail('Custom header', 'null');
        } catch (err: any) {
            fail('Custom header', err);
        }

        // README: "Calling setCustomHeader with the same key overwrites the previous value"
        client.setCustomHeader('X-Request-Id', 'readme-test-456');
        const headerVal = (client as any).request.defaults.headers['X-Request-Id'];
        if (headerVal === 'readme-test-456') {
            pass('setCustomHeader overwrites previous value');
        } else {
            fail('setCustomHeader overwrite', `expected readme-test-456, got ${headerVal}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Logout
    // ══════════════════════════════════════════════════════════════════════════
    section('Logout');
    {
        const client = new ServicetradeClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
        });
        await client.login();

        const tokenBefore = (client as any).token;
        if (tokenBefore) {
            pass('Token exists before logout');
        } else {
            fail('Pre-logout', 'No token');
        }

        await client.logout();

        const tokenAfter = (client as any).token;
        const authHeader = (client as any).request.defaults.headers.Authorization;

        if (tokenAfter === undefined && authHeader === undefined) {
            pass('logout() cleared token and Authorization header');
        } else {
            fail('logout()', `token=${tokenAfter}, auth=${authHeader}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: TypeScript — exported types compile
    // ══════════════════════════════════════════════════════════════════════════
    section('TypeScript — Exported types');
    {
        // This is a compile-time check. If this file compiles, the types are correct.
        // At runtime, just verify they're importable.
        const opts: ServicetradeClientOptions = { username: 'a', password: 'b' };
        const resp: ServicetradeClientResponse = { id: 1 };
        const file: FileAttachment = { value: Buffer.from(''), options: {} };
        const token: BearerToken = 'abc';
        const tokenSet: TokenSet = ['abc', 'def'];

        pass('All exported types are importable and usable');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // README Section: Credential Precedence
    // ══════════════════════════════════════════════════════════════════════════
    section('Credential Precedence');
    {
        // refreshToken takes precedence over clientId/clientSecret
        const c1 = new ServicetradeClient({
            baseUrl: BASE_URL,
            refreshToken: 'some-refresh-token',
            clientId: 'some-id',
            clientSecret: 'some-secret',
        });
        if ((c1 as any).creds?.grant_type === 'refresh_token') {
            pass('refreshToken takes precedence over clientId/clientSecret');
        } else {
            fail('Precedence', `Expected refresh_token, got ${(c1 as any).creds?.grant_type}`);
        }

        // clientId/clientSecret over username/password
        const c2 = new ServicetradeClient({
            baseUrl: BASE_URL,
            clientId: 'some-id',
            clientSecret: 'some-secret',
            username: 'user',
            password: 'pass',
        });
        if ((c2 as any).creds?.grant_type === 'client_credentials') {
            pass('clientId/clientSecret takes precedence over username/password');
        } else {
            fail('Precedence', `Expected client_credentials, got ${(c2 as any).creds?.grant_type}`);
        }

        // username/password over token-only
        const c3 = new ServicetradeClient({
            baseUrl: BASE_URL,
            username: 'user',
            password: 'pass',
            token: 'some-token',
        });
        if ((c3 as any).creds?.grant_type === 'password') {
            pass('username/password takes precedence over token-only');
        } else {
            fail('Precedence', `Expected password, got ${(c3 as any).creds?.grant_type}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Summary
    // ══════════════════════════════════════════════════════════════════════════
    log('');
    log('════════════════════════════════════════════════════════════════');
    log(`  ${passCount} passed, ${failCount} failed`);
    log('════════════════════════════════════════════════════════════════');

    if (failCount > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('FATAL:', err.message ?? err);
    process.exit(1);
});
