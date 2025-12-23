import createAuthRefreshInterceptor from 'axios-auth-refresh';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';

const NOOP = () => {};

export type BearerToken = string;

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

    protected request: AxiosInstance;
    private baseUrl: string;
    private apiPrefix: string;
    private userAgent: string;
    private onSetAuth: ((auth: BearerToken) => void);
    private onUnsetAuth: (() => void);
    private autoRefreshAuth: boolean;
    private creds: Credentials;

    constructor(options: ServicetradeClientOptions) {

        this.baseUrl         = options.baseUrl         ?? 'https://api.servicetrade.com';
        this.apiPrefix       = options.apiPrefix       ?? '/api';
        this.userAgent       = options.userAgent       ?? 'Servicetrade Node.js SDK';
        this.onSetAuth       = options.onSetAuth       ?? NOOP;
        this.onUnsetAuth     = options.onUnsetAuth     ?? NOOP;
        this.autoRefreshAuth = options.autoRefreshAuth ?? true;
        this.creds           = this.getCredentials(options);

        this.request = axios.create({
            baseURL: this.baseUrl + this.apiPrefix,
            maxBodyLength: Infinity,
            headers: { 'User-Agent': this.userAgent },
        });

        this.request.interceptors.response.use(this.unpackResponse.bind(this));

        if (this.autoRefreshAuth) {
            createAuthRefreshInterceptor(this.request, this.refreshAuth.bind(this));
        }

        if (options.token) {
            this.request.defaults.headers.Authorization = `Bearer ${options.token}`;
        }
    }

    setCustomHeader(key: string, value: string) {
        this.request.defaults.headers[key] = value;
    }


    unpackResponse(response: AxiosResponse<ServicetradeClientResponse>) {
        return response?.data?.data ?? null;
    }

    async get(path: string): Promise<ServicetradeClientResponse> {
        return this.request.get(path) as unknown as ServicetradeClientResponse;
    }

    async put(path: string, postData: any): Promise<ServicetradeClientResponse> {
        return this.request.put(path, postData) as unknown as ServicetradeClientResponse;
    }

    async post(path: string, postData: any): Promise<ServicetradeClientResponse> {
        return this.request.post(path, postData) as unknown as ServicetradeClientResponse;
    }

    async delete(path: string): Promise<ServicetradeClientResponse> {
        return this.request.delete(path) as unknown as ServicetradeClientResponse;
    }

    async attach(params: Record<string, any>, file: FileAttachment): Promise<ServicetradeClientResponse> {
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

    getCredentials({username, password, clientId, clientSecret}: ServicetradeClientOptions) {
        if (clientId && clientSecret)
            return { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret };

        if (username && password)
            return { grant_type: 'password', username, password };

        throw new Error('Username and password or clientId and clientSecret are required');
    }

    async login() {
        const token = await this.doLogin();
        this.request.defaults.headers.Authorization = `Bearer ${token}`;
        this.onSetAuth(token);
    }

    async logout() {
        this.request.defaults.headers.Authorization = null;
        this.onUnsetAuth();
    }

    async refreshAuth() {
        this.request.defaults.headers.Authorization = null;
        this.onUnsetAuth();
        return this.login();
    }

    async doLogin() {
        const result = await this.request.post('/oauth2/token', this.creds) as any;
        return result.access_token;
    }

}
