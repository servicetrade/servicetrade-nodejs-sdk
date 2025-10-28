import ServicetradeClient, { ServicetradeClientOptions } from './ServicetradeClient';
export type BearerToken = string;
export interface ServicetradeClientBearerOptions extends ServicetradeClientOptions<BearerToken> {
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    token?: BearerToken;
}
export default class ServicetradeClientBearerToken extends ServicetradeClient<BearerToken> {
    private creds;
    constructor(options: ServicetradeClientBearerOptions);
    getCredentials({ username, password, clientId, clientSecret }: ServicetradeClientBearerOptions): {
        grant_type: string;
        client_id: string;
        client_secret: string;
        username?: undefined;
        password?: undefined;
    } | {
        grant_type: string;
        username: string;
        password: string;
        client_id?: undefined;
        client_secret?: undefined;
    };
    doLogin(): Promise<any>;
    doLogout(): Promise<void>;
    setAuth(token: BearerToken): void;
    clearAuth(): void;
}
