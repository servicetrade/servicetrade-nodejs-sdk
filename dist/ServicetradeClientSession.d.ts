import ServicetradeClient, { ServicetradeClientOptions, ServicetradeClientResponse } from './ServicetradeClient';
import { AxiosResponse } from 'axios';
export type PHPSessionAuth = string;
export interface ServicetradePHPSessionAuthOptions extends ServicetradeClientOptions<PHPSessionAuth> {
    username?: string;
    password?: string;
    cookie?: string;
    onSetCookie?: (auth: PHPSessionAuth) => void;
    onResetCookie?: () => void;
    token?: PHPSessionAuth;
}
export default class ServicetradePHPSessionAuth extends ServicetradeClient<PHPSessionAuth> {
    private creds;
    constructor(options: ServicetradePHPSessionAuthOptions);
    unpackResponse(response: AxiosResponse<ServicetradeClientResponse>): Promise<any>;
    doLogin(): Promise<any>;
    doLogout(): Promise<void>;
    setAuth(token: PHPSessionAuth): void;
    clearAuth(): void;
}
