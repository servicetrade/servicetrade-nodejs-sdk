# ServiceTrade Node.js SDK

Official Node.js/TypeScript SDK for the [ServiceTrade API](https://api.servicetrade.com/api/docs).

## Requirements

- Node.js 14 or later
- TypeScript 4.9+ (if using TypeScript)

## Installation

```bash
npm install @servicetrade/sdk
```

## Quick Start

### TypeScript / ESM

```typescript
import ServicetradeClient from '@servicetrade/sdk';

const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
});

// List jobs
const data = await client.get('/job');
const jobs = data?.jobs;

// Create a job
const job = await client.post('/job', {
    type: 'inspection',
    description: 'Quarterly HVAC Inspection',
    locationId: 123,
    vendorId: 456,
});

// Update a job
await client.put(`/job/${job.id}`, { description: 'Updated Description' });

// Delete a location
await client.delete('/location/456');
```

### CommonJS (vanilla Node.js)

```javascript
const ServicetradeClient = require('@servicetrade/sdk').default;

const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
});

async function main() {
    const data = await client.get('/job');
    console.log(data.jobs);
}

main();
```

Authentication happens automatically on the first API call. The SDK obtains an OAuth2 token, attaches it as a `Bearer` header, and refreshes it before it expires.

## Authentication

The SDK supports three authentication modes. You must provide at least one set of credentials.

### Client Credentials

Use `clientId` and `clientSecret` for server-to-server integrations. This is the recommended approach for most use cases.

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
});
```

The SDK exchanges these for a bearer token via `POST /api/oauth2/token` with `grant_type=client_credentials`.

### Refresh Token

Use a refresh token for long-lived sessions where you already have a token from a previous authentication flow.

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    refreshToken: 'your-refresh-token',
});
```

The SDK exchanges the refresh token for a bearer token via `POST /api/oauth2/token` with `grant_type=refresh_token`. If the server returns a new refresh token (token rotation), the SDK stores it automatically for subsequent refreshes.

### Pre-existing Bearer Token

If you already have a valid bearer token (e.g., obtained from another service), you can pass it directly.

```typescript
const client = new ServicetradeClient({
    token: 'your-bearer-token',
});
```

In this mode, no token endpoint calls are made. The token is used as-is. If it expires, the SDK cannot refresh it -- API calls will throw an `AxiosError` with status 401.

### Lazy Authentication

The SDK does not authenticate during construction. When `autoRefreshAuth` is `true` (the default), the first API call triggers authentication automatically. If `autoRefreshAuth` is `false`, you must call `login()` yourself before making API calls.

If you need to authenticate eagerly (e.g., to fail fast on bad credentials), call `login()`:

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
});

await client.login(); // Authenticates immediately; throws on failure
```

### Credential Precedence

When multiple credential types are provided, the SDK uses the first match in this order:

1. `clientId` + `refreshToken`
2. `clientId` + `clientSecret`
3. `token` (pre-existing bearer token, no refresh capability)

## API Methods

All methods take API paths relative to the API prefix (default: `/api`). Responses return the `data` field from the JSON response body, or `null` if absent.

### GET

```typescript
// Get a single job
const job = await client.get('/job/123');

// List jobs (pass query params as part of the path)
const data = await client.get('/job?status=scheduled&locationId=456');
const jobs = data?.jobs;
```

**Signature:** `get(path: string): Promise<Record<string, any> | null>`

### POST

```typescript
const job = await client.post('/job', {
    type: 'inspection',
    description: 'Annual Fire Alarm Inspection',
    locationId: 456,
});
```

**Signature:** `post(path: string, postData: any): Promise<Record<string, any> | null>`

The `postData` object is JSON-encoded and sent with `Content-Type: application/json`.

### PUT

```typescript
const updated = await client.put('/job/123', { description: 'Updated Description' });
```

**Signature:** `put(path: string, postData: any): Promise<Record<string, any> | null>`

### DELETE

```typescript
await client.delete('/location/456');
```

**Signature:** `delete(path: string): Promise<Record<string, any> | null>`

### File Upload

```typescript
import fs from 'fs';

const fileBuffer = fs.readFileSync('/path/to/photo.jpg');

const attachment = await client.attach(
    {
        entityType: 3,
        entityId: 123,
        purposeId: 7,
        description: 'Inspection photo',
    },
    {
        value: fileBuffer,
        options: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
        },
    }
);
```

**Signature:** `attach(params: Record<string, any>, file: FileAttachment): Promise<Record<string, any> | null>`

The file is sent as a multipart form upload to `/attachment`. The `params` object is included as additional form fields. The `file` object should contain:

- `value` -- The file content (Buffer, Stream, or string)
- `options` -- An object with `filename` and `contentType`

## Configuration

All options are passed to the `ServicetradeClient` constructor:

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    baseUrl: 'https://api.servicetrade.com',
});
```

### Credentials

| Option         | Type      | Default     | Description                                                           |
| :------------- | :-------- | :---------- | :-------------------------------------------------------------------- |
| `clientId`     | `string?` | `undefined` | OAuth2 client ID. Used with `clientSecret` for `client_credentials`.  |
| `clientSecret` | `string?` | `undefined` | OAuth2 client secret. Used with `clientId` for `client_credentials`.  |
| `refreshToken` | `string?` | `undefined` | OAuth2 refresh token for `refresh_token` grant.                       |
| `token`        | `string?` | `undefined` | Pre-existing bearer token. No refresh capability.                     |

### Connection

| Option      | Type     | Default                        | Description                                                   |
| :---------- | :------- | :----------------------------- | :------------------------------------------------------------ |
| `baseUrl`   | `string` | `https://api.servicetrade.com` | Base URL of the API server. Do not include the `/api` prefix. |
| `apiPrefix` | `string` | `/api`                         | Path prefix appended to `baseUrl` for all requests.           |
| `userAgent` | `string` | `ServiceTrade Node.js SDK`     | Value of the `User-Agent` header.                             |

### Behavior

| Option            | Type      | Default | Description                                                                                                                                              |
| :---------------- | :-------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoRefreshAuth` | `boolean` | `true`  | When enabled, the SDK proactively refreshes tokens before they expire and retries once on 401 responses. Set to `false` to manage token lifecycle yourself. |

### Callbacks

| Option        | Type                          | Default | Description                                                       |
| :------------ | :---------------------------- | :------ | :---------------------------------------------------------------- |
| `onSetAuth`   | `(token: string) => void`    | no-op   | Called with the bearer token string whenever a token is obtained.  |
| `onUnsetAuth` | `() => void`                 | no-op   | Called with no arguments when auth is cleared (on `logout()`).    |

## Token Refresh

When `autoRefreshAuth` is enabled (the default), the SDK handles token lifecycle automatically:

1. **Proactive refresh** -- Before each API call, the SDK parses the JWT `exp` claim. If the token expires within 5 minutes, it refreshes before sending the request.

2. **Reactive retry** -- If an API call returns HTTP 401, the SDK refreshes the token and retries the request once.

3. **Token rotation** -- If the token endpoint returns a new `refresh_token` in its response, the SDK stores it and uses it for subsequent refreshes. This happens transparently regardless of which grant type was used initially.

4. **Mutex** -- Concurrent API calls that trigger a refresh share a single refresh request, preventing token endpoint floods.

When `autoRefreshAuth` is `false`, none of the above happens. You are responsible for detecting expired tokens and calling `login()` to re-authenticate.

## Token Persistence

By default, tokens live only in memory for the duration of the process. To persist tokens across requests (e.g., in a web application), use the `onSetAuth` callback:

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    onSetAuth: (token) => {
        // Store the token in your cache, session, or database
        cache.set('servicetrade_token', token);
    },
    onUnsetAuth: () => {
        cache.delete('servicetrade_token');
    },
});
```

When the server issues a refresh token (e.g., in response to a `client_credentials` grant), the SDK stores it internally. Use `getRefreshToken()` to retrieve it for persistence:

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    onSetAuth: (token) => {
        cache.set('servicetrade_token', token);
        cache.set('servicetrade_refresh_token', client.getRefreshToken());
    },
    onUnsetAuth: () => {
        cache.delete('servicetrade_token');
        cache.delete('servicetrade_refresh_token');
    },
});
```

To reuse previously stored tokens, pass them along with credentials:

```typescript
const cachedToken = cache.get('servicetrade_token');
const cachedRefreshToken = cache.get('servicetrade_refresh_token');

const client = new ServicetradeClient({
    clientId: 'your-client-id',
    // If a refresh token is available, use it; otherwise fall back to clientSecret
    ...(cachedRefreshToken
        ? { refreshToken: cachedRefreshToken }
        : { clientSecret: 'your-client-secret' }),
    token: cachedToken, // Used immediately; refreshed when it expires
});
```

## Custom Headers

```typescript
client.setCustomHeader('X-Request-Id', 'abc-123');
```

Custom headers are included in all subsequent API requests. Calling `setCustomHeader` with the same key overwrites the previous value.

## Logout

Call `logout()` to clear the current token. If a refresh token is present, the SDK attempts to revoke it via `POST /api/oauth2/revoke`. Revocation errors are silently ignored.

```typescript
await client.logout();
```

## Error Handling

API errors throw [AxiosError](https://axios-http.com/docs/handling_errors) instances. You can inspect the HTTP status code and response body:

```typescript
try {
    await client.post('/job', { description: 'Missing required fields' });
} catch (err) {
    if (err.response) {
        console.log(err.response.status);  // 400
        console.log(err.response.data);    // { messages: ['Location is required'], ... }
    } else {
        console.log(err.message);          // Network error, timeout, etc.
    }
}
```

Authentication failures (invalid credentials, expired tokens that cannot be refreshed) also throw `AxiosError` with status 401.

## Pointing to a Different Environment

```typescript
const client = new ServicetradeClient({
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    baseUrl: 'https://some-other-environment.servicetrade.com',
});
```

The `baseUrl` should not include the `/api` prefix -- that is handled by `apiPrefix`.

## TypeScript

The SDK is written in TypeScript and ships type declarations. Key exported types:

```typescript
import ServicetradeClient, {
    ServicetradeClientOptions,
    ServicetradeClientResponse,
    FileAttachment,
    BearerToken,
    RefreshToken,
    TokenSet,
} from '@servicetrade/sdk';
```

## License

MIT -- see [LICENSE](LICENSE).
