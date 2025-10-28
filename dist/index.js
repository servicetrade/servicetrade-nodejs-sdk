"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicetradeClient = exports.ServicetradeClientSession = exports.ServicetradeClientBearerToken = exports.default = void 0;
// Default export: ServicetradeClientBearerToken (OAuth2 Bearer Token authentication)
var ServicetradeClientBearerToken_1 = require("./ServicetradeClientBearerToken");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(ServicetradeClientBearerToken_1).default; } });
// Named exports for all client types
var ServicetradeClientBearerToken_2 = require("./ServicetradeClientBearerToken");
Object.defineProperty(exports, "ServicetradeClientBearerToken", { enumerable: true, get: function () { return __importDefault(ServicetradeClientBearerToken_2).default; } });
var ServicetradeClientSession_1 = require("./ServicetradeClientSession");
Object.defineProperty(exports, "ServicetradeClientSession", { enumerable: true, get: function () { return __importDefault(ServicetradeClientSession_1).default; } });
var ServicetradeClient_1 = require("./ServicetradeClient");
Object.defineProperty(exports, "ServicetradeClient", { enumerable: true, get: function () { return __importDefault(ServicetradeClient_1).default; } });
