"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_auth_refresh_1 = __importDefault(require("axios-auth-refresh"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const NOOP = () => { };
class ServicetradeClient {
    constructor(options) {
        var _a, _b, _c, _d, _e, _f;
        this.baseUrl = (_a = options.baseUrl) !== null && _a !== void 0 ? _a : 'https://api.servicetrade.com';
        this.apiPrefix = (_b = options.apiPrefix) !== null && _b !== void 0 ? _b : '/api';
        this.userAgent = (_c = options.userAgent) !== null && _c !== void 0 ? _c : 'Servicetrade Node.js SDK';
        this.onSetAuth = (_d = options.onSetAuth) !== null && _d !== void 0 ? _d : NOOP;
        this.onUnsetAuth = (_e = options.onUnsetAuth) !== null && _e !== void 0 ? _e : NOOP;
        this.autoRefreshAuth = (_f = options.autoRefreshAuth) !== null && _f !== void 0 ? _f : true;
        this.request = axios_1.default.create({
            baseURL: this.baseUrl + this.apiPrefix,
            maxBodyLength: Infinity,
            headers: { 'User-Agent': this.userAgent },
        });
        this.request.interceptors.response.use(this.unpackResponse.bind(this));
        if (this.autoRefreshAuth) {
            (0, axios_auth_refresh_1.default)(this.request, this.refreshAuth.bind(this));
        }
    }
    setCustomHeaders(key, value) {
        this.request.defaults.headers[key] = value;
    }
    unpackResponse(response) {
        return response && response.data && response.data.data || null;
    }
    async get(path) {
        return this.request.get(path);
    }
    async put(path, postData) {
        return this.request.put(path, postData);
    }
    async post(path, postData) {
        return this.request.post(path, postData);
    }
    async delete(path) {
        return this.request.delete(path);
    }
    async attach(params, file) {
        let data = params || {};
        const formData = new form_data_1.default();
        for (let key of Object.keys(data)) {
            formData.append(key, data[key]);
        }
        formData.append('uploadedFile', file.value, file.options);
        const formDataConfig = {
            headers: {
                'Content-Type': 'multipart/form-data',
                ...formData.getHeaders()
            }
        };
        return this.request.post('/attachment', formData, formDataConfig);
    }
    async login() {
        const token = await this.doLogin();
        this.setAuth(token);
        this.onSetAuth(token);
    }
    async logout() {
        await this.doLogout();
        this.clearAuth();
        this.onUnsetAuth();
    }
    async refreshAuth() {
        this.clearAuth();
        this.onUnsetAuth();
        return this.login();
    }
}
exports.default = ServicetradeClient;
