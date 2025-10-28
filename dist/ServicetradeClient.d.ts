import { AxiosInstance, AxiosResponse } from 'axios';
export interface ServicetradeClientOptions<T> {
    baseUrl?: string; /** The API base URL (without /api) */
    apiPrefix?: string; /** Api prifix  */
    userAgent?: string; /** Custom User-Agent header */
    onSetAuth?: (auth: T) => void; /** Callback when authentication is set */
    onUnsetAuth?: () => void; /** Callback when authentication is unset */
    autoRefreshAuth?: boolean; /** should authentication automatically refresh. Default to true*/
}
export type ServicetradeClientResponse = Record<string, any>;
export interface FileAttachment {
    value: any;
    options: any;
}
export default abstract class ServicetradeClient<T> {
    protected request: AxiosInstance;
    private baseUrl;
    private apiPrefix;
    private userAgent;
    private onSetAuth;
    private onUnsetAuth;
    private autoRefreshAuth;
    constructor(options: ServicetradeClientOptions<T>);
    abstract clearAuth(): void;
    abstract setAuth(token: T): void;
    abstract doLogin(): Promise<T>;
    abstract doLogout(): Promise<void>;
    setCustomHeaders(key: string, value: string): void;
    unpackResponse(response: AxiosResponse<ServicetradeClientResponse>): any;
    get(path: string): Promise<ServicetradeClientResponse>;
    put(path: string, postData: any): Promise<ServicetradeClientResponse>;
    post(path: string, postData: any): Promise<ServicetradeClientResponse>;
    delete(path: string): Promise<ServicetradeClientResponse>;
    attach(params: Record<string, any>, file: FileAttachment): Promise<ServicetradeClientResponse>;
    login(): Promise<void>;
    logout(): Promise<void>;
    refreshAuth(): Promise<void>;
}
