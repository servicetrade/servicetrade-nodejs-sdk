/**
 * ST-7420 Bug Demonstration
 *
 * Run against the current SDK code (without fixes) to see three bugs:
 *
 *   npx ts-node demo-bugs.ts
 *
 * Requires: ST_BASE_URL, ST_CLIENT_ID, ST_CLIENT_SECRET env vars
 * (create credentials via POST api/oauth2/credentials first)
 */
import ServicetradeClient from './src/index';

const BASE_URL = 'https://partsmanager-testing.qa.servicetrade.io/';
const CLIENT_ID = process.env.ST_CLIENT_ID!;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET!;

if (!BASE_URL || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Set ST_BASE_URL, ST_CLIENT_ID, and ST_CLIENT_SECRET');
    process.exit(1);
}

/** Rewrite a JWT's exp claim to expire in N seconds */
function makeExpiringToken(token: string, seconds: number): string {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.exp = Math.floor(Date.now() / 1000) + seconds;
    return `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;
}

async function main() {

    // ─── Bug 1: client_id missing from refresh_token grant ───────────
    //
    // After initial login, the server returns a refresh_token. The SDK switches
    // to grant_type=refresh_token for subsequent refreshes, but drops client_id.
    // The server requires client_id, so the refresh fails with 400.

    console.log('BUG 1: client_id missing from refresh_token grant');
    console.log('');

    const client = new ServicetradeClient({
        baseUrl: BASE_URL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        onSetAuth: () => console.log('  onSetAuth fired (got new token)'),
    });

    await client.login();
    console.log('  Initial login OK (client_credentials grant)');
    console.log(`  SDK switched creds to: ${JSON.stringify(client['creds'])}`);
    console.log('  Note: client_id is missing ^^^');
    console.log('');

    // The SDK now has grant_type=refresh_token but no client_id.
    // Any proactive or reactive refresh will fail.

    // Force a proactive refresh by faking a near-expiry token:
    const realToken = client['token']!;
    client['token'] = makeExpiringToken(realToken, 120); // 2 min TTL
    client['request'].defaults.headers.Authorization = `Bearer ${client['token']}`;

    console.log('  Injected near-expiry token (2 min TTL) to trigger proactive refresh...');
    try {
        await client.get('/company');
        console.log('  GET /company succeeded (unexpected)');
    } catch (e: any) {
        console.log(`  GET /company FAILED: ${e.response?.status} ${e.response?.data?.error_description || e.message}`);
        console.log('  ^^^ This is the bug — refresh_token grant rejected because client_id is missing');
    }

    // ─── Bug 2: reactive 401 retry sends the OLD token ──────────────
    //
    // When a request gets a 401, axios-auth-refresh re-authenticates successfully,
    // but the retried request still sends the old (invalid) Authorization header.

    console.log('');
    console.log('BUG 2: Reactive 401 retry sends old token');
    console.log('');

    const client3 = new ServicetradeClient({
        baseUrl: BASE_URL,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        onSetAuth: () => console.log('  onSetAuth fired (re-authenticated successfully)'),
    });
    await client3.login();

    // Bug 1 causes login() to switch creds to grant_type=refresh_token without
    // client_id, which would make the re-auth fail with 400 before we can even
    // demonstrate Bug 2. So we manually reset creds to client_credentials here
    // to isolate Bug 2 from Bug 1.
    client3['creds'] = {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
    };

    // Inject a garbage token to trigger a 401
    client3['token'] = 'invalid.garbage.token';
    client3['request'].defaults.headers.Authorization = 'Bearer invalid.garbage.token';

    console.log('  Injected invalid token to trigger 401...');
    try {
        await client3.get('/company');
        console.log('  GET /company succeeded (unexpected with current code)');
    } catch (e: any) {
        console.log(`  GET /company FAILED: ${e.response?.status} ${e.message}`);
        console.log('  ^^^ Re-auth succeeded (onSetAuth fired above) but retry still used the old token');
    }

    console.log('');
    console.log('Done. Both bugs demonstrated.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });