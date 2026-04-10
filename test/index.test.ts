import nock from 'nock';
import assert from 'assert';
import ServicetradeClient, { Paginator } from '../src/index';

/** Build a fake JWT with a specific exp claim (seconds from now) */
function makeFakeJwt(expiresInSeconds: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: 'test',
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })).toString('base64url');
    return `${header}.${payload}.fakesig`;
}

const clientCredentialsOptions = {
    baseUrl: 'https://test.host.com',
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
};

const badOptions = {
    baseUrl: 'https://test.host.com',
};

const jobItemId = 1234;

describe('ServicetradeClient - Module exports', function() {
    it('Default export should be ServicetradeClient', function() {
        assert.strictEqual(ServicetradeClient.name, 'ServicetradeClient');
    });

    it('ServicetradeClient should be a class', function() {
        assert.ok(ServicetradeClient);
    });
});

describe('ServicetradeClient - Constructor tests', function() {

    it('Creates client with client credentials', function() {
        const ST = new ServicetradeClient(clientCredentialsOptions);
        assert.ok(ST);
        assert.strictEqual(ST['creds']!.grant_type, 'client_credentials');
        assert.strictEqual(ST['creds']!.client_id, 'test_client_id');
        assert.strictEqual(ST['creds']!.client_secret, 'test_client_secret');
    });

    it('Creates client with refresh token credentials', function() {
        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            refreshToken: 'test_refresh_token',
        });
        assert.ok(ST);
        assert.strictEqual(ST['creds']!.grant_type, 'refresh_token');
        assert.strictEqual((ST['creds'] as any).refresh_token, 'test_refresh_token');
        assert.strictEqual(ST['creds']!.client_id, 'test_client_id');
        assert.strictEqual(ST['creds']!.client_secret, undefined);
    });

    it('Throws error when no credentials provided', function() {
        try {
            new ServicetradeClient(badOptions as any);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.message, 'No valid credentials provided. Required: clientId/clientSecret or clientId/refreshToken');
        }
    });

    it('Sets token if provided in options', function() {
        nock('https://test.host.com')
            .delete(`/api/job/100`)
            .matchHeader('Authorization', 'Bearer preset-token')
            .reply(200, {});

        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            token: 'preset-token'
        });
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer preset-token');
    });

    it('Creates client with token only', function() {
        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            token: 'preset-token',
        });
        assert.ok(ST);
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer preset-token');
        assert.strictEqual(ST['creds'], undefined);
    });

    it('Client has expected methods', function() {
        const client = new ServicetradeClient(clientCredentialsOptions);

        assert.strictEqual(typeof client.login, 'function');
        assert.strictEqual(typeof client.logout, 'function');
        assert.strictEqual(typeof client.get, 'function');
        assert.strictEqual(typeof client.getAll, 'function');
        assert.strictEqual(typeof client.post, 'function');
        assert.strictEqual(typeof client.put, 'function');
        assert.strictEqual(typeof client.delete, 'function');
        assert.strictEqual(typeof client.attach, 'function');
        assert.strictEqual(typeof client.setCustomHeader, 'function');
    });
});

describe('ServicetradeClient - Login tests', function() {

    it('Successful login with client credentials returns token', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'xyz9876abcd',
                token_type: 'Bearer'
            });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer xyz9876abcd');
    });

    it('Successful login with refresh token returns new token', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'test_refresh_token',
            })
            .reply(200, {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token'
            });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret',
            refreshToken: 'test_refresh_token',
        });
        await ST.login();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer new-access-token');
        assert.strictEqual(ST['creds']!.refresh_token, 'new-refresh-token');
    });

    it('Always passes client_id for refresh_token grant requests, including rotated refresh tokens', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'initial-refresh',
            })
            .reply(200, { access_token: 'token1', refresh_token: 'rotated-refresh' })
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'rotated-refresh',
            })
            .reply(200, { access_token: 'token2', refresh_token: 'rotated-again' });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            refreshToken: 'initial-refresh',
        });
        await ST.login();
        await ST.login();
        assert.strictEqual(ST['creds']!.refresh_token, 'rotated-again');
        assert.strictEqual(ST['creds']!.client_id, 'test_client_id');
    });

    it('Uses updated refresh token for subsequent logins', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'initial-refresh'
            })
            .reply(200, { access_token: 'token1', refresh_token: 'rotated-refresh' })
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'rotated-refresh'
            })
            .reply(200, { access_token: 'token2', refresh_token: 'rotated-again' });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            refreshToken: 'initial-refresh',
        });
        await ST.login();
        await ST.login();
        assert.strictEqual(ST['creds']!.refresh_token, 'rotated-again');
    });

    it('Switches from client_credentials to refresh_token grant when server returns a refresh token', async function() {
        nock('https://test.host.com')
            // First login uses client_credentials
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'initial-token',
                refresh_token: 'server-issued-refresh'
            })
            // Second login should use refresh_token grant with client_id but NOT client_secret
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'server-issued-refresh',
            })
            .reply(200, {
                access_token: 'refreshed-token',
                refresh_token: 'rotated-refresh'
            });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret',
        });

        // Verify initial state is client_credentials
        assert.strictEqual(ST['creds']!.grant_type, 'client_credentials');

        await ST.login();

        // After first login, should have switched to refresh_token grant
        assert.strictEqual(ST['creds']!.grant_type, 'refresh_token');
        assert.strictEqual(ST['creds']!.refresh_token, 'server-issued-refresh');
        assert.strictEqual(ST['creds']!.client_id, 'test_client_id');
        assert.strictEqual(ST['creds']!.client_secret, undefined);

        await ST.login();

        // Verify refresh token was rotated
        assert.strictEqual(ST['creds']!.refresh_token, 'rotated-refresh');
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer refreshed-token');
    });

    it('Failed login throws error', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(401, {
                error: 'invalid_grant',
                error_description: 'Invalid credentials'
            });

        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            autoRefreshAuth: false
        });
        try {
            await ST.login();
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.name, 'AxiosError');
            assert.ok(e.message.includes('401'));
        }
    });

    it('Token-only client cannot login without credentials', async function() {
        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            token: 'preset-token',
        });
        try {
            await ST.login();
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(
                e.message,
                'No credentials available to authenticate. Provide clientId/clientSecret or clientId/refreshToken.'
            );
        }
    });

    it('Token-only client receives original AxiosError on 401, not an internal auth error', async function() {
        nock('https://test.host.com')
            .get('/api/job/100')
            .reply(401, {});

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            token: 'preset-token',
        });

        try {
            await ST.get('/job/100');
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.name, 'AxiosError', 'Expected the original AxiosError, not an internal auth error');
            assert.ok(e.message.includes('401'));
        }
    });

    it('Calls onSetAuth callback on successful login', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'callback-token'
            });

        let capturedToken: string | undefined;
        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            onSetAuth: (token) => {
                capturedToken = token;
            }
        });
        await ST.login();
        assert.strictEqual(capturedToken, 'callback-token');
    });

    it('Re-authenticates when call returns 401 error', async function() {
        nock('https://test.host.com')
            // First login from refreshIfStale (no token)
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'initial-token'
            })

            // First GET returns 401
            .get(`/api/job/100`)
            .reply(401)

            // Re-auth after 401
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'refreshed-token'
            })

            // Retry GET succeeds
            .get(`/api/job/100`)
            .reply(200, {
                data: {
                    id: 100
                }
            });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        const jobResponse = await ST.get('/job/100');
        assert.strictEqual(typeof jobResponse, 'object');
        assert.strictEqual(jobResponse!.id, 100);
    });

    it('Retries with refreshed token after auth interceptor updates auth state', async function() {
        nock('https://test.host.com')
            // Initial token acquisition from refreshIfStale
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'initial-token'
            })

            // First attempt must use initial token and fail with 401
            .get('/api/job/101')
            .matchHeader('Authorization', 'Bearer initial-token')
            .reply(401)

            // Interceptor refreshes auth
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'refreshed-token'
            })

            // Retry attempt must use refreshed token
            .get('/api/job/101')
            .matchHeader('Authorization', 'Bearer refreshed-token')
            .reply(200, {
                data: {
                    id: 101
                }
            });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        const jobResponse = await ST.get('/job/101');
        assert.strictEqual(jobResponse!.id, 101);
    });

    it('Does not auto-authenticate when autoRefreshAuth is false', async function() {
        nock('https://test.host.com')
            .get('/api/job/100')
            .reply(401, {});

        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            autoRefreshAuth: false,
        });
        let loginCalled = false;
        ST['login'] = async () => {
            loginCalled = true;
            throw new Error('login should not be called');
        };

        try {
            await ST.get('/job/100');
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.name, 'AxiosError');
            assert.ok(e.message.includes('401'));
            assert.strictEqual(loginCalled, false, 'Did not expect login to be called');
        }
    });
});

describe('ServicetradeClient - Logout tests', function() {
    it('Logout clears auth token', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer test-token');

        await ST.logout();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, undefined);
    });

    it('Logout revokes refresh token when client_secret is present', async function() {
        const scope = nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'test-token',
                refresh_token: 'server-issued-refresh-token'
            })
            .post('/api/oauth2/revoke', {
                refresh_token: 'server-issued-refresh-token',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret'
            })
            .reply(200, {});

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret',
        });
        await ST.login();
        await ST.logout();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, undefined);
        assert.strictEqual(ST['creds']!.refresh_token, undefined, 'Expected refresh_token to be cleared');
        assert.ok(scope.isDone(), 'Expected revoke endpoint to be called');
    });

    it('Logout skips revoke when client_secret is not present (refresh token only auth)', async function() {
        const scope = nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'initial-refresh-token',
            })
            .reply(200, {
                access_token: 'test-token',
                refresh_token: 'rotated-refresh-token'
            });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            refreshToken: 'initial-refresh-token',
        });
        await ST.login();
        await ST.logout();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, undefined);
        assert.strictEqual(ST['creds']!.refresh_token, 'rotated-refresh-token', 'Expected refresh_token to remain (no secret to revoke)');
        assert.ok(scope.isDone(), 'Expected only login call, no revoke');
    });

    it('Revokes refresh token with client_id and client_secret after switching from client_credentials grant', async function() {
        const scope = nock('https://test.host.com')
            // Initial login with client_credentials returns a refresh token
            .post('/api/oauth2/token', {
                grant_type: 'client_credentials',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {
                access_token: 'test-token',
                refresh_token: 'server-issued-refresh',
            })
            // Revoke should send refresh_token, client_id, and client_secret
            .post('/api/oauth2/revoke', {
                refresh_token: 'server-issued-refresh',
                client_id: 'test_client_id',
                client_secret: 'test_client_secret',
            })
            .reply(200, {});

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            clientSecret: 'test_client_secret',
        });

        await ST.login();
        assert.strictEqual(ST['creds']!.grant_type, 'refresh_token');
        assert.strictEqual(ST['creds']!.client_secret, undefined);

        await ST.logout();
        assert.strictEqual(ST['token'], undefined);
        assert.ok(scope.isDone(), 'Expected revoke endpoint to be called');
    });

    it('Logout calls onUnsetAuth callback', async function() {
        let unsetCalled = false;
        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            onUnsetAuth: () => {
                unsetCalled = true;
            }
        });

        await ST.logout();
        assert.strictEqual(unsetCalled, true);
    });
});

describe('ServicetradeClient - GET query params (parseUrl)', function() {
    /** Token-only client avoids login; parseUrl is exercised the same as via get(). */
    function makeParseUrlClient() {
        return new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            token: 'preset-token',
        });
    }

    function queryOf(fullUrl: string): URLSearchParams {
        return new URL(fullUrl).searchParams;
    }

    it('casts array values to comma-separated lists', function() {
        const ST = makeParseUrlClient();
        const fullUrl = ST['parseUrl']('/job', {
            officeIds: [1, 2, 3],
            empty: [],
        });
        const q = queryOf(fullUrl);
        assert.strictEqual(q.get('officeIds'), '1,2,3');
        assert.strictEqual(q.has('empty'), false);
    });

    it('ignores param values that are not string, number, or array', function() {
        const ST = makeParseUrlClient();
        const params: Record<string, any> = {
            kept: 'x',
            asBool: true,
            asObject: { nested: 1 },
            asFn: () => {},
            asDate: new Date(0),
        };
        const fullUrl = ST['parseUrl']('/job', params);
        const q = queryOf(fullUrl);
        assert.strictEqual(q.get('kept'), 'x');
        assert.strictEqual(q.has('asBool'), false);
        assert.strictEqual(q.has('asObject'), false);
        assert.strictEqual(q.has('asFn'), false);
        assert.strictEqual(q.has('asDate'), false);
    });

    it('accepts query params only on the path string', function() {
        const ST = makeParseUrlClient();
        const fullUrl = ST['parseUrl']('/job?status=scheduled&locationId=456');
        const q = queryOf(fullUrl);
        assert.strictEqual(q.get('status'), 'scheduled');
        assert.strictEqual(q.get('locationId'), '456');
    });

    it('accepts query params only in the params object', function() {
        const ST = makeParseUrlClient();
        const fullUrl = ST['parseUrl']('/job', { status: 'scheduled', locationId: 456 });
        const q = queryOf(fullUrl);
        assert.strictEqual(q.get('status'), 'scheduled');
        assert.strictEqual(q.get('locationId'), '456');
    });

    it('merges path query string with params object when keys do not overlap', function() {
        const ST = makeParseUrlClient();
        const fullUrl = ST['parseUrl']('/job?fromUrl=1', { fromParams: '2' });
        const q = queryOf(fullUrl);
        assert.strictEqual(q.get('fromUrl'), '1');
        assert.strictEqual(q.get('fromParams'), '2');
    });

    it('when the same key appears in the URL and params, the URL value wins', function() {
        const ST = makeParseUrlClient();
        const fullUrl = ST['parseUrl']('/job?foo=from-url', { foo: 'from-params', bar: 'only-params' });
        const q = queryOf(fullUrl);
        assert.strictEqual(q.get('foo'), 'from-url');
        assert.strictEqual(q.get('bar'), 'only-params');
    });

    it('get() sends the merged query string to the server', async function() {
        nock('https://test.host.com')
            .get('/api/job')
            .query({ officeIds: '10,20', page: '1' })
            .reply(200, { data: { ok: true } });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            token: 'preset-token',
        });
        const res = await ST.get('/job?page=1', { officeIds: [10, 20] });
        assert.strictEqual((res as any).ok, true);
    });

    it('get() keeps URL query when it conflicts with params', async function() {
        nock('https://test.host.com')
            .get('/api/job')
            .query({ filter: 'url-value', other: 'y' })
            .reply(200, { data: { ok: true } });

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            token: 'preset-token',
        });
        const res = await ST.get('/job?filter=url-value', { filter: 'param-value', other: 'y' });
        assert.strictEqual((res as any).ok, true);
    });
});

describe('ServicetradeClient - Get tests', function() {
    const testJobId = 100;

    it('get job success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .get(`/api/job/${testJobId}`)
            .matchHeader('Authorization', 'Bearer test-token')
            .reply(200, {
                data: {
                    id: testJobId
                }
            });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const jobResponse = await ST.get(`job/${testJobId}`);
        assert.strictEqual(typeof jobResponse, 'object');
        assert.strictEqual(jobResponse!.id, testJobId);
    });

    it('return empty response cause no data property', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .get(`/api/job/${testJobId}`)
            .reply(200, {
                id: testJobId
            });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const jobResponse = await ST.get(`job/${testJobId}`);
        assert.strictEqual(jobResponse, null);
    });
});

describe('ServicetradeClient - Put tests', function() {

    it('put job item success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .put(`/api/jobitem/${jobItemId}`, { libitemId: 9876 })
            .matchHeader('Authorization', 'Bearer test-token')
            .reply(200, { data: { id: 1234 } });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const jobItemResponse = await ST.put(`/jobitem/${jobItemId}`, { libitemId: 9876 });
        assert.strictEqual(jobItemResponse!.id, 1234);
    });

    it('return empty response cause no data property', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .put(`/api/jobitem/${jobItemId}`, { libitemId: 9876 })
            .reply(200, { id: 1234 });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const jobItemResponse = await ST.put(`/jobitem/${jobItemId}`, { libitemId: 9876 });
        assert.strictEqual(jobItemResponse, null);
    });
});

describe('ServicetradeClient - Post tests', function() {
    const postData = {
        quantity: 5,
        cost: 6,
        serviceLineId: 33,
        name: 'fancy foo',
        jobId: 33445566,
        source: { type: 'refnumber', value: 'PO CC-654' }
    };

    it('post job item success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .post('/api/jobitem', postData)
            .matchHeader('Authorization', 'Bearer test-token')
            .reply(200, { data: { id: 444 } });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const jobItemResponse = await ST.post(`/jobitem`, postData);
        assert.strictEqual(jobItemResponse!.id, 444);
    });

    it('return empty response cause no data property', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .post(`/api/jobitem/${jobItemId}`, { libitemId: 9876 })
            .reply(200, { id: 1234 });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const jobItemResponse = await ST.post(`/jobitem/${jobItemId}`, { libitemId: 9876 });
        assert.strictEqual(jobItemResponse, null);
    });
});

describe('ServicetradeClient - Delete tests', function() {
    const testJobId = 100;
    it('delete job success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .delete(`/api/job/${testJobId}`)
            .matchHeader('Authorization', 'Bearer test-token')
            .reply(200, {});

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const response = await ST.delete(`/job/${testJobId}`);
        assert.strictEqual(response, null);
    });
});

describe('ServicetradeClient - Attach tests', function() {
    it('attach success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .post('/api/attachment')
            .matchHeader('Authorization', 'Bearer test-token')
            .reply(200, {
                data: {
                    id: 1,
                    uri: 'testUrl',
                    fileName: 'testFileName'
                }
            });

        const imgBuffer = Buffer.from('test', 'base64');

        const imgAttachment = {
            value: imgBuffer,
            options: {
                filename: 'deficiency.jpg',
                contentType: 'image/jpeg'
            }
        };

        const ST = new ServicetradeClient(clientCredentialsOptions);
        await ST.login();
        const attachResponse = await ST.attach(
            {
                purposeId: 1,
                entityId: 1,
                entityType: 1,
                description: 'description'
            },
            imgAttachment
        );
        assert.strictEqual(attachResponse!.id, 1);
        assert.strictEqual(attachResponse!.uri, 'testUrl');
        assert.strictEqual(attachResponse!.fileName, 'testFileName');
    })
});

describe('ServicetradeClient - check userAgent header', function() {
    it('test userAgent success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .matchHeader('User-Agent', 'Test UserAgent')
            .reply(200, {
                access_token: 'test-token'
            })

            .delete(`/api/job/100`)
            .matchHeader('User-Agent', 'Test UserAgent')
            .reply(200, {});

        const ST = new ServicetradeClient({...clientCredentialsOptions, userAgent: 'Test UserAgent'});
        await ST.delete(`/job/100`);
    });
});

describe('ServicetradeClient - setCustomHeader tests', function() {
    it('test setCustomHeader success', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .delete(`/api/job/100`)
            .matchHeader('X-Custom-Header', 'customValue')
            .reply(200, {});

        const ST = new ServicetradeClient(clientCredentialsOptions);
        ST.setCustomHeader('X-Custom-Header', 'customValue');
        await ST.delete(`/job/100`);
    });

    it('test setCustomHeader with multiple headers', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .delete(`/api/job/100`)
            .matchHeader('X-API-Key', 'apiKey123')
            .matchHeader('X-Client-Version', '1.0.0')
            .reply(200, {});

        const ST = new ServicetradeClient(clientCredentialsOptions);
        ST.setCustomHeader('X-API-Key', 'apiKey123');
        ST.setCustomHeader('X-Client-Version', '1.0.0');
        await ST.delete(`/job/100`);
    });

    it('test setCustomHeader overwrites existing header', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .delete(`/api/job/100`)
            .matchHeader('X-Custom-Header', 'newValue')
            .reply(200, {});

        const ST = new ServicetradeClient(clientCredentialsOptions);
        ST.setCustomHeader('X-Custom-Header', 'originalValue');
        ST.setCustomHeader('X-Custom-Header', 'newValue');
        await ST.delete(`/job/100`);
    });

    it('test setCustomHeader with empty value', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, {
                access_token: 'test-token'
            })

            .delete(`/api/job/100`)
            .matchHeader('X-Empty-Header', '')
            .reply(200, {});

        const ST = new ServicetradeClient(clientCredentialsOptions);
        ST.setCustomHeader('X-Empty-Header', '');
        await ST.delete(`/job/100`);
    });
});

describe('ServicetradeClient - Lazy authentication', function() {
    it('Does not have a token before the first API call', function() {
        const ST = new ServicetradeClient(clientCredentialsOptions);
        assert.strictEqual(ST['token'], undefined);
    });

    it('First API call triggers login automatically', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'lazy-token' })
            .get('/api/company')
            .matchHeader('Authorization', 'Bearer lazy-token')
            .reply(200, { data: { id: 1 } });

        const ST = new ServicetradeClient(clientCredentialsOptions);
        assert.strictEqual(ST['token'], undefined, 'No token before first call');

        const result = await ST.get('/company');
        assert.strictEqual(ST['token'], 'lazy-token', 'Token set after first call');
        assert.strictEqual(result!.id, 1);
    });
});

describe('ServicetradeClient - Proactive token refresh', function() {
    it('Refreshes token proactively when it expires within 5 minutes', async function() {
        const nearExpiryToken = makeFakeJwt(120); // expires in 2 minutes

        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'refreshed-token' })
            .get('/api/company')
            .matchHeader('Authorization', 'Bearer refreshed-token')
            .reply(200, { data: { id: 1 } });

        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            token: nearExpiryToken,
        });

        const result = await ST.get('/company');
        assert.strictEqual(ST['token'], 'refreshed-token');
        assert.strictEqual(result!.id, 1);
    });

    it('Does not refresh token when it has more than 5 minutes remaining', async function() {
        const freshToken = makeFakeJwt(600); // expires in 10 minutes

        nock('https://test.host.com')
            .get('/api/company')
            .matchHeader('Authorization', `Bearer ${freshToken}`)
            .reply(200, { data: { id: 1 } });

        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            token: freshToken,
        });

        const result = await ST.get('/company');
        assert.strictEqual(ST['token'], freshToken, 'Token was not replaced');
        assert.strictEqual(result!.id, 1);
    });

    it('Does not refresh when token is not a JWT (non-parseable)', async function() {
        nock('https://test.host.com')
            .get('/api/company')
            .matchHeader('Authorization', 'Bearer opaque-token')
            .reply(200, { data: { id: 1 } });

        const ST = new ServicetradeClient({
            ...clientCredentialsOptions,
            token: 'opaque-token',
        });

        const result = await ST.get('/company');
        assert.strictEqual(ST['token'], 'opaque-token', 'Opaque token left unchanged');
        assert.strictEqual(result!.id, 1);
    });
});

describe('ServicetradeClient - Refresh mutex', function() {
    it('Concurrent API calls share a single token refresh', async function() {
        let tokenRequestCount = 0;

        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(() => {
                tokenRequestCount++;
                return [200, { access_token: 'shared-token' }];
            })
            .get('/api/company')
            .reply(200, { data: { id: 1 } })
            .get('/api/company')
            .reply(200, { data: { id: 2 } })
            .get('/api/company')
            .reply(200, { data: { id: 3 } });

        const ST = new ServicetradeClient(clientCredentialsOptions);

        const [r1, r2, r3] = await Promise.all([
            ST.get('/company'),
            ST.get('/company'),
            ST.get('/company'),
        ]);

        assert.strictEqual(tokenRequestCount, 1, 'Only one token request was made');
        assert.ok(r1, 'First call returned data');
        assert.ok(r2, 'Second call returned data');
        assert.ok(r3, 'Third call returned data');
    });
});

describe('Paginator', function() {

    it('Iterates over a single page of results', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ page: '1' })
            .reply(200, {
                data: {
                    jobs: [{ id: 1 }, { id: 2 }],
                    totalPages: 1,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const paginator = new Paginator(client, '/job', 'jobs');
        const items: any[] = [];
        for await (const item of paginator) {
            items.push(item);
        }

        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].id, 1);
        assert.strictEqual(items[1].id, 2);
    });

    it('Iterates over multiple pages of results', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ page: '1' })
            .reply(200, {
                data: {
                    jobs: [{ id: 1 }, { id: 2 }],
                    totalPages: 3,
                }
            })
            .get('/api/job')
            .query({ page: '2' })
            .reply(200, {
                data: {
                    jobs: [{ id: 3 }, { id: 4 }],
                    totalPages: 3,
                }
            })
            .get('/api/job')
            .query({ page: '3' })
            .reply(200, {
                data: {
                    jobs: [{ id: 5 }],
                    totalPages: 3,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const paginator = new Paginator(client, '/job', 'jobs');
        const items: any[] = [];
        for await (const item of paginator) {
            items.push(item);
        }

        assert.strictEqual(items.length, 5);
        assert.deepStrictEqual(
            items.map(i => i.id),
            [1, 2, 3, 4, 5]
        );
    });

    it('Handles empty results', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ page: '1' })
            .reply(200, {
                data: {
                    jobs: [],
                    totalPages: 1,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const paginator = new Paginator(client, '/job', 'jobs');
        const items: any[] = [];
        for await (const item of paginator) {
            items.push(item);
        }

        assert.strictEqual(items.length, 0);
    });

    it('Handles missing items key', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ page: '1' })
            .reply(200, {
                data: {
                    totalPages: 1,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const paginator = new Paginator(client, '/job', 'jobs');
        const items: any[] = [];
        for await (const item of paginator) {
            items.push(item);
        }

        assert.strictEqual(items.length, 0);
    });

    it('Passes custom params along with page parameter', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ status: 'scheduled', page: '1' })
            .reply(200, {
                data: {
                    jobs: [{ id: 1 }],
                    totalPages: 1,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const paginator = new Paginator(client, '/job', 'jobs', {
            params: { status: 'scheduled' },
        });
        const items: any[] = [];
        for await (const item of paginator) {
            items.push(item);
        }

        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].id, 1);
    });

    it('toArray() returns all items across pages', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ page: '1' })
            .reply(200, {
                data: {
                    jobs: [{ id: 1 }, { id: 2 }],
                    totalPages: 2,
                }
            })
            .get('/api/job')
            .query({ page: '2' })
            .reply(200, {
                data: {
                    jobs: [{ id: 3 }],
                    totalPages: 2,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const items = await new Paginator(client, '/job', 'jobs').toArray();

        assert.strictEqual(items.length, 3);
        assert.deepStrictEqual(
            items.map(i => i.id),
            [1, 2, 3]
        );
    });

    it('toArray() returns empty array when no results', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(200, { access_token: 'test-token' })
            .get('/api/job')
            .query({ page: '1' })
            .reply(200, {
                data: {
                    jobs: [],
                    totalPages: 1,
                }
            });

        const client = new ServicetradeClient(clientCredentialsOptions);
        await client.login();

        const items = await new Paginator(client, '/job', 'jobs').toArray();

        assert.strictEqual(items.length, 0);
    });

    describe('client.getAll()', function() {
        it('returns a Paginator instance', function() {
            const client = new ServicetradeClient(clientCredentialsOptions);
            const paginator = client.getAll('/job', 'jobs');
            assert.ok(paginator instanceof Paginator);
        });

        it('matches new Paginator(client, path, itemsKey, { params })', async function() {
            const pageReply = {
                data: {
                    jobs: [{ id: 99 }],
                    totalPages: 1,
                },
            };
            nock('https://test.host.com')
                .post('/api/oauth2/token')
                .reply(200, { access_token: 'test-token' })
                .get('/api/job')
                .query({ status: 'scheduled', page: '1' })
                .reply(200, pageReply)
                .get('/api/job')
                .query({ status: 'scheduled', page: '1' })
                .reply(200, pageReply);

            const client = new ServicetradeClient(clientCredentialsOptions);
            await client.login();

            const fromGetAll = await client
                .getAll('/job', 'jobs', { status: 'scheduled' })
                .toArray();
            const fromCtor = await new Paginator(client, '/job', 'jobs', {
                params: { status: 'scheduled' },
            }).toArray();

            assert.deepStrictEqual(fromGetAll, fromCtor);
        });

        it('iterates using the given path and items key', async function() {
            nock('https://test.host.com')
                .post('/api/oauth2/token')
                .reply(200, { access_token: 'test-token' })
                .get('/api/job')
                .query({ page: '1' })
                .reply(200, {
                    data: {
                        jobs: [{ id: 7 }, { id: 8 }],
                        totalPages: 1,
                    },
                });

            const client = new ServicetradeClient(clientCredentialsOptions);
            await client.login();

            const items: any[] = [];
            for await (const item of client.getAll('/job', 'jobs')) {
                items.push(item);
            }

            assert.strictEqual(items.length, 2);
            assert.deepStrictEqual(
                items.map((i) => i.id),
                [7, 8],
            );
        });

        it('passes the params argument through to the paginator', async function() {
            nock('https://test.host.com')
                .post('/api/oauth2/token')
                .reply(200, { access_token: 'test-token' })
                .get('/api/job')
                .query({ status: 'scheduled', page: '1' })
                .reply(200, {
                    data: {
                        jobs: [{ id: 42 }],
                        totalPages: 1,
                    },
                });

            const client = new ServicetradeClient(clientCredentialsOptions);
            await client.login();

            const items: any[] = [];
            for await (const item of client.getAll('/job', 'jobs', { status: 'scheduled' })) {
                items.push(item);
            }

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].id, 42);
        });

        it('toArray() works on the paginator returned by getAll', async function() {
            nock('https://test.host.com')
                .post('/api/oauth2/token')
                .reply(200, { access_token: 'test-token' })
                .get('/api/job')
                .query({ page: '1' })
                .reply(200, {
                    data: {
                        jobs: [{ id: 1 }],
                        totalPages: 1,
                    },
                });

            const client = new ServicetradeClient(clientCredentialsOptions);
            await client.login();

            const items = await client.getAll('/job', 'jobs').toArray();

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].id, 1);
        });
    });
});
