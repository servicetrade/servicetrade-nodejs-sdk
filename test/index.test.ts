import nock from 'nock';
import assert from 'assert';
import ServicetradeClient from '../src/index';

const passwordOptions = {
    baseUrl: 'https://test.host.com',
    username: 'test_user',
    password: 'test_pass',
};

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

    it('Creates client with username/password credentials', function() {
        const ST = new ServicetradeClient(passwordOptions);
        assert.ok(ST);
        assert.strictEqual(ST['creds']!.grant_type, 'password');
        assert.strictEqual(ST['creds']!.username, 'test_user');
        assert.strictEqual(ST['creds']!.password, 'test_pass');
    });

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
            assert.strictEqual(e.message, 'No valid credentials provided. Required: username/password or clientId/clientSecret or refreshToken');
        }
    });

    it('Sets token if provided in options', function() {
        nock('https://test.host.com')
            .delete(`/api/job/100`)
            .matchHeader('Authorization', 'Bearer preset-token')
            .reply(200, {});

        const ST = new ServicetradeClient({
            ...passwordOptions,
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
        const client = new ServicetradeClient(passwordOptions);

        assert.strictEqual(typeof client.login, 'function');
        assert.strictEqual(typeof client.logout, 'function');
        assert.strictEqual(typeof client.get, 'function');
        assert.strictEqual(typeof client.post, 'function');
        assert.strictEqual(typeof client.put, 'function');
        assert.strictEqual(typeof client.delete, 'function');
        assert.strictEqual(typeof client.attach, 'function');
        assert.strictEqual(typeof client.setCustomHeader, 'function');
    });
});

describe('ServicetradeClient - Login tests', function() {

    it('Successful login with password grant returns token', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'password',
                username: 'test_user',
                password: 'test_pass',
            })
            .reply(200, {
                access_token: 'abcd1234wxyz',
                token_type: 'Bearer'
            });

        const ST = new ServicetradeClient(passwordOptions);
        await ST.login();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer abcd1234wxyz');
    });

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

    it('Switches to refresh_token grant when server returns a refresh token for a password grant', async function() {
        nock('https://test.host.com')
            // First login uses password grant
            .post('/api/oauth2/token', { grant_type: 'password', username: 'test_user', password: 'test_pass' })
            .reply(200, { access_token: 'token1', refresh_token: 'server-issued-refresh' })
            // Second login should now use the refresh token
            .post('/api/oauth2/token', { grant_type: 'refresh_token', refresh_token: 'server-issued-refresh' })
            .reply(200, { access_token: 'token2', refresh_token: 'rotated-refresh' });

        const ST = new ServicetradeClient(passwordOptions);
        await ST.login();
        assert.strictEqual(ST['creds']!.grant_type, 'refresh_token');
        assert.strictEqual(ST['creds']!.refresh_token, 'server-issued-refresh');
        await ST.login();
        assert.strictEqual(ST['creds']!.refresh_token, 'rotated-refresh');
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

    it('Failed login throws error', async function() {
        nock('https://test.host.com')
            .post('/api/oauth2/token')
            .reply(401, {
                error: 'invalid_grant',
                error_description: 'Invalid credentials'
            });

        const ST = new ServicetradeClient({
            ...passwordOptions,
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
                'No credentials available to authenticate. Provide username/password, clientId/clientSecret, or refreshToken.'
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
            ...passwordOptions,
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
                grant_type: 'password',
                username: 'test_user',
                password: 'test_pass',
            })
            .reply(200, {
                access_token: 'initial-token'
            })

            // First GET returns 401
            .get(`/api/job/100`)
            .reply(401)

            // Re-auth after 401
            .post('/api/oauth2/token', {
                grant_type: 'password',
                username: 'test_user',
                password: 'test_pass',
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

        const ST = new ServicetradeClient(passwordOptions);
        const jobResponse = await ST.get('/job/100');
        assert.strictEqual(typeof jobResponse, 'object');
        assert.strictEqual(jobResponse!.id, 100);
    });

    it('Retries with refreshed token after auth interceptor updates auth state', async function() {
        nock('https://test.host.com')
            // Initial token acquisition from refreshIfStale
            .post('/api/oauth2/token', {
                grant_type: 'password',
                username: 'test_user',
                password: 'test_pass',
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
                grant_type: 'password',
                username: 'test_user',
                password: 'test_pass',
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

        const ST = new ServicetradeClient(passwordOptions);
        const jobResponse = await ST.get('/job/101');
        assert.strictEqual(jobResponse!.id, 101);
    });

    it('Does not auto-authenticate when autoRefreshAuth is false', async function() {
        nock('https://test.host.com')
            .get('/api/job/100')
            .reply(401, {});

        const ST = new ServicetradeClient({
            ...passwordOptions,
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

        const ST = new ServicetradeClient(passwordOptions);
        await ST.login();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, 'Bearer test-token');

        await ST.logout();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, undefined);
    });

    it('Logout revokes refresh token if present', async function() {
        const scope = nock('https://test.host.com')
            .post('/api/oauth2/token', {
                grant_type: 'refresh_token',
                client_id: 'test_client_id',
                refresh_token: 'initial-refresh-token',
            })
            .reply(200, {
                access_token: 'test-token',
                refresh_token: 'rotated-refresh-token'
            })
            .post('/api/oauth2/revoke', { refresh_token: 'rotated-refresh-token' })
            .reply(200, {});

        const ST = new ServicetradeClient({
            baseUrl: 'https://test.host.com',
            clientId: 'test_client_id',
            refreshToken: 'initial-refresh-token',
        });
        await ST.login();
        await ST.logout();
        assert.strictEqual(ST['request'].defaults.headers.Authorization, undefined);
        assert.ok(scope.isDone(), 'Expected revoke endpoint to be called');
    });

    it('Logout calls onUnsetAuth callback', async function() {
        let unsetCalled = false;
        const ST = new ServicetradeClient({
            ...passwordOptions,
            onUnsetAuth: () => {
                unsetCalled = true;
            }
        });

        await ST.logout();
        assert.strictEqual(unsetCalled, true);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient({...passwordOptions, userAgent: 'Test UserAgent'});
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
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

        const ST = new ServicetradeClient(passwordOptions);
        ST.setCustomHeader('X-Empty-Header', '');
        await ST.delete(`/job/100`);
    });
});
