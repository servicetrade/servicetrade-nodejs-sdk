import createAuthRefreshInterceptor from 'axios-auth-refresh';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { URL } from 'url';

const NOOP = () => {};

export type BearerToken = string;
export type RefreshToken = string;

const TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface ServicetradeClientOptions {
    baseUrl?: string;   /** The API base URL (without /api) */
    apiPrefix?: string; /** API prefix */
    userAgent?: string; /** Custom User-Agent header */
    onSetAuth?: (auth: BearerToken) => void; /** Callback when authentication is set */
    onUnsetAuth?: () => void; /** Callback when authentication is unset */
    autoRefreshAuth?: boolean; /** should authentication automatically refresh. Default to true*/
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    token?: BearerToken;
}

interface Credentials {
    grant_type: string;
    refresh_token?: string;
    client_id?: string;
    client_secret?: string;
}

export interface TokenSet {
    bearerToken: BearerToken;
    refreshToken?: RefreshToken;
}

export type ServicetradeClientResponse = Record<string, any>;

export interface FileAttachment {
    value: any;
    options: any;
}

function _stripLeadingSlash(s: string) {
    return s.replace(/^\/+/, '');
}

function _stripTrailingSlash(s: string) {
    return s.replace(/\/+$/, '');
}

function _sanitizeUrl(baseUrl: string, apiPrefix: string) {
    const base = _stripTrailingSlash(baseUrl);
    const path = _stripTrailingSlash(_stripLeadingSlash(apiPrefix));
    return !path ? `${base}/` : `${base}/${path}/`;
}

/** ServiceTrade query lists are comma-separated (e.g. `officeIds=1,2,3`). */
function _wrangleParamValue(
    value: string | number | boolean | readonly (string | number)[] | null | undefined,
): string | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return null;
        }
        return value.map(String).join(',');
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    return null;
}

export default class ServicetradeClient {

    private request: AxiosInstance;
    private authRequest: AxiosInstance;
    private baseUrl: string;
    private apiPrefix: string;
    private sanitizedBaseUrl: string;
    private userAgent: string;
    private onSetAuth: ((auth: BearerToken) => void);
    private onUnsetAuth: (() => void);
    private autoRefreshAuth: boolean;
    private token?: BearerToken;
    private creds?: Credentials;
    private readonly clientSecret?: string;

    constructor(options: ServicetradeClientOptions) {

        this.baseUrl         = options.baseUrl         ?? 'https://api.servicetrade.com';
        this.apiPrefix       = options.apiPrefix       ?? '/api';
        this.userAgent       = options.userAgent       ?? 'ServiceTrade Node.js SDK';
        this.onSetAuth       = options.onSetAuth       ?? NOOP;
        this.onUnsetAuth     = options.onUnsetAuth     ?? NOOP;
        this.autoRefreshAuth = options.autoRefreshAuth ?? true;
        this.token           = options.token;
        this.clientSecret    = options.clientSecret;
        this.creds           = this.getCredentials(options);

        // Base must end with '/' when it has a path
        this.sanitizedBaseUrl = _sanitizeUrl(this.baseUrl, this.apiPrefix);

        const axiosConfig = {
            baseURL: this.sanitizedBaseUrl,
            maxBodyLength: 110 * 1024 * 1024, // ~110MB, slightly above server's 101MB post_max_size
            maxContentLength: 110 * 1024 * 1024,
            headers: { 'User-Agent': this.userAgent },
        };

        this.request = axios.create(axiosConfig);

        // This is a separate request object for authentication requests.
        // This instances does not have interceptors applied to it which are problematic.
        this.authRequest = axios.create(axiosConfig);

        this.request.interceptors.response.use(this.unpackResponse.bind(this) as any);

        if (this.autoRefreshAuth && this.creds) {
            createAuthRefreshInterceptor(this.request, async (failedRequest: any) => {
                await this.login();
                failedRequest.response.config.headers['Authorization'] = `Bearer ${this.token}`;
            });
        }

        if (this.token) {
            this.request.defaults.headers.Authorization = `Bearer ${this.token}`;
        }
    }

    setCustomHeader(key: string, value: string) {
        this.request.defaults.headers[key] = value;
    }

    unpackResponse(response: AxiosResponse<ServicetradeClientResponse>): ServicetradeClientResponse | null {
        return response?.data?.data ?? null;
    }

    async get(path: string, params: Record<string, any> = {}): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.get<ServicetradeClientResponse>(this.parseUrl(path, params));
    }

    getAll(path: string, itemsKey: string, params: Record<string, any> = {}): Paginator {
        return new Paginator(this, path, itemsKey, { params });
    }

    async put(path: string, postData: any): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.put<ServicetradeClientResponse>(this.parseUrl(path), postData);
    }

    async post(path: string, postData: any): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.post<ServicetradeClientResponse>(this.parseUrl(path), postData);
    }

    async delete(path: string): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.delete<ServicetradeClientResponse>(this.parseUrl(path));
    }

    async attach(params: Record<string, any>, file: FileAttachment): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        const formData = new FormData();
        for (const [k, v] of Object.entries(params || {})) {
            formData.append(k, v);
        }
        formData.append('uploadedFile', file.value, file.options);

        const formDataConfig = {
            headers: {
                'Content-Type': 'multipart/form-data',
                ...formData.getHeaders()
            }
        };

        return this.request.post('/attachment', formData, formDataConfig) as Promise<ServicetradeClientResponse | null>;
    }

    // Intentionally only keep the minimal credentials required for maintaining connection.
    // For refresh-token grants, we keep refresh_token and client_id (but never client_secret).
    private getCredentials({clientId, clientSecret, refreshToken, token}: ServicetradeClientOptions) {
        if (clientId && refreshToken)
            return { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken };

        if (clientId && clientSecret)
            return { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret };

        if (token)
            return undefined;

        throw new Error('No valid credentials provided. Required: clientId/clientSecret or clientId/refreshToken');
    }

    // This is a mutex to ensure that only one re-auth method is attempted at a time.
    private refreshMutex: Promise<TokenSet> | null = null;
    private async refresh(): Promise<TokenSet> {
        if (!this.refreshMutex) {
            this.refreshMutex = this.refreshInternal().finally(() => {
                this.refreshMutex = null;
            });
        }
        return this.refreshMutex;
    }


    private async refreshInternal(): Promise<TokenSet> {
        if (!this.creds) {
            throw new Error('No credentials available to authenticate. Provide clientId/clientSecret or clientId/refreshToken.');
        }
        const response = await this.authRequest.post('/oauth2/token', this.creds);
        const result = response.data;
        if (!result.access_token) {
            throw new Error('Failed to re-authenticate');
        }
        return { bearerToken: result.access_token, refreshToken: result.refresh_token };
    }

    private async attemptRevokeRefreshToken() {
        if (!this.creds?.refresh_token || !this.clientSecret)
            return;

        try {
            await this.authRequest.post('/oauth2/revoke', {
                refresh_token: this.creds.refresh_token,
                client_id: this.creds.client_id,
                client_secret: this.clientSecret,
            });
        } catch (error) {
            // If we can't revoke the refresh token, just let it expire.
        }
        this.creds.refresh_token = undefined;
    }

    private async refreshIfStale() {
        if (!this.autoRefreshAuth) {
            return;
        }
        const ttl = this.getTTLForToken();
        if (ttl < TOKEN_TTL_BUFFER_MS) {
            await this.login()
        }
    }

    private getTTLForToken() {
        if (!this.token) {
            return 0;
        }

        try {
            const payload = this.token.split('.')[1];
            // Base64 URL to standard Base64
            const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(base64, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded);
            const expiresAt = new Date(parsed.exp * 1000);
            return expiresAt.getTime() - Date.now();
        } catch (error) {
            // If we can't get the expiration time, just let the auth layer tell us when it is bad.
            // This way we don't spam auth if we dont need to.
            return Number.MAX_SAFE_INTEGER;
        }
    }

    private parseUrl(
        urlString: string,
        params: Record<string, string | number | boolean | readonly (string | number)[] | null | undefined> = {},
    ): string {
        const url = new URL(_stripLeadingSlash(urlString), this.sanitizedBaseUrl);
        for (const [key, value] of Object.entries(params)) {
            if (url.searchParams.has(key)) {
                continue;
            }
            const s = _wrangleParamValue(value);
            if (s !== null) {
                url.searchParams.set(key, s);
            }
        }
        return url.toString();
    }

    private setToken({ bearerToken, refreshToken }: TokenSet) {
        this.token = bearerToken;
        this.request.defaults.headers.Authorization = `Bearer ${bearerToken}`;

        if (refreshToken && this.creds) {
            this.creds = {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.creds.client_id,
            };
        }

        this.onSetAuth(this.token);
    }

    getRefreshToken(): string | undefined {
        return this.creds?.refresh_token;
    }

    async logout() {
        this.token = undefined;
        delete this.request.defaults.headers.Authorization;
        await this.attemptRevokeRefreshToken();
        this.onUnsetAuth();
    }

    async login() {
        const tokenSet = await this.refresh();
        this.setToken(tokenSet);
    }
}

export interface PaginatorOptions {
    /** Optional query parameters to include on every request. */
    params?: Record<string, any>;
}

/**
 * Iterate over all pages of a paginated API endpoint.
 *
 * Usage:
 * ```ts
 * const paginator = new Paginator(client, '/job', 'jobs', { params: { status: 'scheduled' } });
 * for await (const job of paginator) {
 *     console.log(job.id);
 * }
 * ```
 */
export class Paginator {
    private client: ServicetradeClient;
    private path: string;
    private itemsKey: string;
    private params: Record<string, any>;

    constructor(
        client: ServicetradeClient,
        path: string,
        itemsKey: string,
        options?: PaginatorOptions,
    ) {
        this.client = client;
        this.path = path;
        this.itemsKey = itemsKey;
        this.params = options?.params ? { ...options.params } : {};
    }

    async toArray(): Promise<Record<string, any>[]> {
        const items: Record<string, any>[] = [];
        for await (const item of this) items.push(item);
        return items;
    }

    async *[Symbol.asyncIterator](): AsyncIterableIterator<Record<string, any>> {
        let page = 1;
        let totalPages = 1; // assume at least one page

        while (page <= totalPages) {
            const response = await this.client.get(this.path, { ...this.params, page });

            if (!response || typeof response !== 'object') {
                return;
            }

            const rawTotalPages = (response as any).totalPages;
            if (rawTotalPages !== undefined && rawTotalPages !== null) {
                const parsed = Number(rawTotalPages);
                totalPages = Number.isFinite(parsed) ? Math.max(parsed, 1) : 1;
            }

            const items = (response as any)[this.itemsKey];
            if (Array.isArray(items)) {
                yield* items;
            }

            page++;
        }
    }
}
