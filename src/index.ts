import createAuthRefreshInterceptor from 'axios-auth-refresh';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';

const NOOP = () => {};

export type BearerToken = string;

const TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface ServicetradeClientOptions {
    baseUrl?: string;   /** The API base URL (without /api) */
    apiPrefix?: string; /** API prefix */
    userAgent?: string; /** Custom User-Agent header */
    onSetAuth?: (auth: BearerToken) => void; /** Callback when authentication is set */
    onUnsetAuth?: () => void; /** Callback when authentication is unset */
    autoRefreshAuth?: boolean; /** should authentication automatically refresh. Default to true*/
    username?: string;
    password?: string;
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
    username?: string;
    password?: string;
}

export type TokenSet = [BearerToken, BearerToken | undefined];

export type ServicetradeClientResponse = Record<string, any>;

export interface FileAttachment {
    value: any;
    options: any;
}

export default class ServicetradeClient {

    private request: AxiosInstance;
    private authRequest: AxiosInstance;
    private baseUrl: string;
    private apiPrefix: string;
    private userAgent: string;
    private onSetAuth: ((auth: BearerToken) => void);
    private onUnsetAuth: (() => void);
    private autoRefreshAuth: boolean;
    private token?: BearerToken;
    private creds?: Credentials;

    constructor(options: ServicetradeClientOptions) {

        this.baseUrl         = options.baseUrl         ?? 'https://api.servicetrade.com';
        this.apiPrefix       = options.apiPrefix       ?? '/api';
        this.userAgent       = options.userAgent       ?? 'Servicetrade Node.js SDK';
        this.onSetAuth       = options.onSetAuth       ?? NOOP;
        this.onUnsetAuth     = options.onUnsetAuth     ?? NOOP;
        this.autoRefreshAuth = options.autoRefreshAuth ?? true;
        this.token           = options.token;
        this.creds           = this.getCredentials(options);

        this.request = axios.create({
            baseURL: this.baseUrl + this.apiPrefix,
            maxBodyLength: Infinity,
            headers: { 'User-Agent': this.userAgent },
        });

        // This is a separate request object for authentication requests.
        // This instances does not have interceptors applied to it which are problematic.
        this.authRequest = axios.create({
            baseURL: this.baseUrl + this.apiPrefix,
            maxBodyLength: Infinity,
            headers: { 'User-Agent': this.userAgent },
        });

        this.request.interceptors.response.use(this.unpackResponse.bind(this) as any);

        if (this.autoRefreshAuth && this.creds) {
            createAuthRefreshInterceptor(this.request, this.login.bind(this));
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

    async get(path: string): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.get<ServicetradeClientResponse>(path);
    }

    async put(path: string, postData: any): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.put<ServicetradeClientResponse>(path, postData);
    }

    async post(path: string, postData: any): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.post<ServicetradeClientResponse>(path, postData);
    }

    async delete(path: string): Promise<ServicetradeClientResponse | null> {
        await this.refreshIfStale();
        return this.request.delete<ServicetradeClientResponse>(path);
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

    // Intentionally only keep the minimal set of credentials required for maintaining connection.
    // If I have a refresh token -- I will not store client_id and client_secret in memory even if you decide to provide them.
    private getCredentials({username, password, clientId, clientSecret, refreshToken, token}: ServicetradeClientOptions) {
        if (clientId && refreshToken)
            return { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken };

        if (clientId && clientSecret)
            return { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret };

        if (username && password)
            return { grant_type: 'password', username, password };

        if (token)
            return undefined;

        throw new Error('No valid credentials provided. Required: username/password or clientId/clientSecret or refreshToken');
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
            throw new Error('No credentials available to authenticate. Provide username/password, clientId/clientSecret, or refreshToken.');
        }
        const response = await this.authRequest.post('/oauth2/token', this.creds);
        const result = response.data;
        if (!result.access_token) {
            throw new Error('Failed to re-authenticate');
        }
        return [result.access_token, result?.refresh_token];
    }

    private async attemptRevokeRefreshToken() {
        if (!this.creds?.refresh_token)
            return;

        try {
            await this.authRequest.post('/oauth2/revoke', { refresh_token: this.creds.refresh_token });
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

    private setToken([token, refreshToken]: [BearerToken, BearerToken | undefined]) {
        this.token = token;
        this.request.defaults.headers.Authorization = `Bearer ${token}`;

        if (refreshToken && this.creds) {
            this.creds = { grant_type: 'refresh_token', client_id: this.creds.client_id, refresh_token: refreshToken };
        }

        this.onSetAuth(this.token);
    }

    async logout() {
        this.token = undefined;
        delete this.request.defaults.headers.Authorization;
        await this.attemptRevokeRefreshToken();
        this.onUnsetAuth();
    }

    async login(failedRequest?: any) {
        const tokenSet = await this.refresh();
        this.setToken(tokenSet);

        // axios-auth-refresh retries the original failed request config, so we must also
        // update the failed request header in addition to client defaults.
        if (failedRequest?.response?.config?.headers) {
            failedRequest.response.config.headers.Authorization = `Bearer ${tokenSet[0]}`;
        }
    }
}
