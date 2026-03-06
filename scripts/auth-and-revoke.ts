import ServicetradeClient from '../src/index';

/**
 * Test script to authenticate against the ServiceTrade API, verify auto-refresh
 * when a token becomes invalid, revoke a refresh token, and verify that the
 * revoked token can no longer be used.
 *
 * Usage:
 *   npx ts-node scripts/auth-and-revoke.ts
 *
 * Environment variables (set at least one auth method):
 *
 *   Option 1 - Client credentials:
 *     ST_CLIENT_ID=your-client-id
 *     ST_CLIENT_SECRET=your-client-secret
 *
 *   Option 2 - Refresh token:
 *     ST_CLIENT_ID=your-client-id
 *     ST_REFRESH_TOKEN=your-refresh-token
 *
 *   Optional:
 *     ST_BASE_URL=https://api.servicetrade.com (default)
 */

async function main() {
    const baseUrl = process.env.ST_BASE_URL || 'https://api.servicetrade.com';
    const clientId = process.env.ST_CLIENT_ID;
    const clientSecret = process.env.ST_CLIENT_SECRET;
    const refreshToken = process.env.ST_REFRESH_TOKEN;

    console.log('=== ServiceTrade Auth & Revoke Test ===\n');
    console.log(`Base URL: ${baseUrl}`);

    const client = new ServicetradeClient({
        baseUrl,
        clientId,
        clientSecret,
        refreshToken,
        onSetAuth: (token) => {
            console.log(`\n[onSetAuth] Token set (first 20 chars): ${token.substring(0, 20)}...`);
        },
        onUnsetAuth: () => {
            console.log('\n[onUnsetAuth] Auth cleared');
        },
    });

    try {
        console.log('\n--- Step 1: Logging in ---');
        await client.login();
        console.log('Login successful!');

        // Make a simple API call to verify auth works
        console.log('\n--- Step 2: Verifying auth with API call ---');
        const jobs = await client.get('/job');

        console.log(`Jobs: ${jobs?.jobs.length}`);

        // Inject an invalid token to test auto-refresh
        console.log('\n--- Step 3: Injecting bad token to test auto-refresh ---');
        const originalToken = (client as any).token;
        (client as any).token = 'invalid-token';
        (client as any).request.defaults.headers.Authorization = 'Bearer invalid-token';
        console.log('Injected invalid bearer token');

        console.log('Making API call with bad token (should auto-refresh)...');
        const jobsAfterBadToken = await client.get('/job');
        console.log(`Auto-refresh successful! Jobs: ${jobsAfterBadToken?.jobs.length}`);

        // Capture the refresh token before logout for verification
        const revokedRefreshToken = client.getRefreshToken();
        if (!revokedRefreshToken) {
            throw new Error('No refresh token available to test revocation');
        }
        console.log(`\nCaptured refresh token for revocation test (first 20 chars): ${revokedRefreshToken.substring(0, 20)}...`);

        console.log('\n--- Step 4: Logging out (revokes refresh token) ---');
        await client.logout();
        console.log('Logout successful! Refresh token revoked.');

        // Step 5: Verify the revoked refresh token can no longer be used
        console.log('\n--- Step 5: Verifying revoked token cannot be used ---');
        const verifyClient = new ServicetradeClient({
            baseUrl,
            clientId,
            refreshToken: revokedRefreshToken,
        });

        try {
            await verifyClient.login();
            console.error('ERROR: Login with revoked token should have failed!');
            process.exit(1);
        } catch (verifyError: any) {
            console.log('Confirmed: Revoked refresh token was rejected.');
            console.log(`  Error message: ${verifyError.message}`);
        }

    } catch (error: any) {
        console.error('\nError:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    }

    console.log('\n=== Test Complete ===');
}

main();
