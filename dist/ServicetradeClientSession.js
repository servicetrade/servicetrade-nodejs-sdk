"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ServicetradeClient_1 = __importDefault(require("./ServicetradeClient"));
class ServicetradePHPSessionAuth extends ServicetradeClient_1.default {
    constructor(options) {
        var _a, _b;
        options.onSetAuth = (_a = options.onSetCookie) !== null && _a !== void 0 ? _a : options.onSetAuth;
        options.onUnsetAuth = (_b = options.onResetCookie) !== null && _b !== void 0 ? _b : options.onUnsetAuth;
        super(options);
        this.creds = { username: options.username, password: options.password };
        if (options.cookie) {
            this.setAuth(options.cookie);
        }
    }
    // Extend the unpackResponse method to capture set-cookies from responses. Update authentication if needed.
    async unpackResponse(response) {
        const newCookie = response && response.headers && response.headers['set-cookie'];
        const curCookie = this.request.defaults.headers.Cookie;
        if (newCookie !== undefined && newCookie !== curCookie) {
            this.request.defaults.headers.Cookie = newCookie;
        }
        return super.unpackResponse(response);
    }
    async doLogin() {
        const response = await this.request.post('/auth', this.creds);
        return response.token;
    }
    async doLogout() {
        await this.request.delete('/auth');
    }
    setAuth(token) {
        this.request.defaults.headers.Cookie = token;
    }
    clearAuth() {
        this.request.defaults.headers.Cookie = null;
    }
}
exports.default = ServicetradePHPSessionAuth;
