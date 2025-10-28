"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ServicetradeClient_1 = __importDefault(require("./ServicetradeClient"));
class ServicetradeClientBearerToken extends ServicetradeClient_1.default {
    constructor(options) {
        super(options);
        this.creds = this.getCredentials(options);
        if (options.token) {
            this.setAuth(options.token);
        }
    }
    getCredentials({ username, password, clientId, clientSecret }) {
        if (clientId && clientSecret)
            return { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret };
        if (username && password)
            return { grant_type: 'password', username, password };
        throw new Error('Username and password or clientId and clientSecret are required');
    }
    async doLogin() {
        const result = await this.request.post('/oauth2/token', this.creds);
        return result.access_token;
    }
    async doLogout() {
        // NOOP
    }
    setAuth(token) {
        this.request.defaults.headers.Authorization = `Bearer ${token}`;
    }
    clearAuth() {
        this.request.defaults.headers.Authorization = null;
    }
}
exports.default = ServicetradeClientBearerToken;
