import createAuthRefreshInterceptor from 'axios-auth-refresh';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';

const NOOP = () => {};

export type BearerToken = string;

const TOKEN_TTL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface ServicetradeClientOptions {
    baseUrl?: string;   /** The API base URL (without /api) */
    apiPrefix?: string; /** Api prefix  */
    userAgent?: string; /** Custom User-Agent header */
    onSetAuth?: (auth: BearerToken) => void; /** Callback when authentication is set */
    onUnsetAuth?: () => void; /** Callback when authentication is unset */
    autoRefreshAuth?: boolean; /** should authentication automatically refresh. Default to true*/
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    token?: BearerToken;
    refreshToken?: BearerToken;
}

interface Credentials {
    grant_type: string;
    client_id?: string;
    client_secret?: string;
    username?: string;
    password?: string;
}

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
    private refreshToken?: BearerToken;
    private creds: Credentials;

    constructor(options: ServicetradeClientOptions) {

        this.baseUrl         = options.baseUrl         ?? 'https://api.servicetrade.com';
        this.apiPrefix       = options.apiPrefix       ?? '/api';
        this.userAgent       = options.userAgent       ?? 'Servicetrade Node.js SDK';
        this.onSetAuth       = options.onSetAuth       ?? NOOP;
        this.onUnsetAuth     = options.onUnsetAuth     ?? NOOP;
        this.autoRefreshAuth = options.autoRefreshAuth ?? true;
        this.refreshToken    = options.refreshToken;
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

        this.request.interceptors.response.use(this.unpackResponse.bind(this));

        if (this.autoRefreshAuth) {
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

    async attach(params: Record<string, any>, file: FileAttachment): Promise<ServicetradeClientResponse> {
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

        return this.request.post('/attachment', formData, formDataConfig) as unknown as ServicetradeClientResponse;
    }

    // Intentially only keep the minimal set of credentials required for maintaining connection.
    // If I have a refresh token -- I will not store client_id and client_secret in memory even if you decide to provide them.
    private getCredentials({username, password, clientId, clientSecret, refreshToken}: ServicetradeClientOptions) {
        if (refreshToken)
            return { grant_type: 'refresh_token', refresh_token: refreshToken };

        if (clientId && clientSecret)
            return { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret };

        if (username && password)
            return { grant_type: 'password', username, password };

        throw new Error('Username and password or clientId and clientSecret are required');
    }

    private async refresh(): Promise<[BearerToken, BearerToken]> {
        const response = await this.authRequest.post('/oauth2/token', this.creds);
        const result = response.data;
        return [result.access_token, result?.refresh_token];
    }

    private async attemptRevokeRefreshToken() {
        if (!this.refreshToken)
            return;

        try {
            await this.authRequest.post('/oauth2/revoke', { refresh_token: this.refreshToken });
        } catch (error) {
            // If we can't revoke the refresh token, just let it expire.
        }
    }

    private async refreshIfStale() {
        const ttl = this.getTTLForToken();
        if (ttl < TOKEN_TTL_BUFFER_MS) {
            await this.login();
        }
    }

    private getTTLForToken() {
        if (!this.token) {
            return 0;
        }

        try {
            const payload = this.token.split('.')[1];
            const decoded = Buffer.from(payload, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded);
            const expiresAt = new Date(parsed.exp * 1000);
            return expiresAt.getTime() - Date.now();
        } catch (error) {
            // If we can't get the expiraration time, just let the auth layer tell us when it is bad.
            // This way we don't spam auth if we dont need to.
            return Number.MAX_SAFE_INTEGER;
        }
    }

    private setToken([token, refreshToken]: [BearerToken, BearerToken]) {
        this.token = token;
        this.request.defaults.headers.Authorization = `Bearer ${token}`;

        if (refreshToken) {
            this.refreshToken = refreshToken;
        }

        this.onSetAuth(this.token);
    }

    async logout() {
        delete this.request.defaults.headers.Authorization;

        if (this.refreshToken) {
            await this.attemptRevokeRefreshToken();
        }
        this.onUnsetAuth();
    }

    async login() {
        if (this.request.defaults.headers.Authorization) {
            delete this.request.defaults.headers.Authorization;
            this.onUnsetAuth();
        }

        this.setToken(await this.refresh());
    }
}
