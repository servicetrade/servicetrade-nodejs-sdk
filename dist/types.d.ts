/**
 * Options for initializing Servicetrade client
 */
export interface ServicetradeOptions {
    /** The API base URL (without /api) */
    baseUrl?: string;
    /** The API username */
    username?: string;
    /** The API password */
    password?: string;
    /** Optional cookie for authentication */
    cookie?: string;
    /** Optional user agent header */
    userAgent?: string;
    /** Disable automatic auth refresh on 401 */
    disableRefreshAuth?: boolean;
    /** Callback when cookie is reset */
    onResetCookie?: () => Promise<void>;
    /** Callback when cookie is set */
    onSetCookie?: (result: any) => Promise<void>;
}
/**
 * File attachment options
 */
export interface FileAttachment {
    /** The file buffer or stream */
    value: any;
    /** File options (e.g., filename, contentType) */
    options: any;
}
/**
 * Servicetrade client interface
 */
export interface ServicetradeClient {
    /** Set authentication cookie */
    setCookie: (cookie: string) => void;
    /** Set bearer token for authentication */
    setBearerToken: (bearerToken: string) => void;
    /** Set a custom header */
    setCustomHeader: (key: string, value: string) => void;
    /** Login to Servicetrade API */
    login: (username?: string, password?: string) => Promise<any>;
    /** Logout from Servicetrade API */
    logout: () => Promise<any>;
    /** Perform GET request */
    get: (path: string) => Promise<any>;
    /** Perform PUT request */
    put: (path: string, postData?: any) => Promise<any>;
    /** Perform POST request */
    post: (path: string, postData?: any) => Promise<any>;
    /** Perform DELETE request */
    delete: (path: string) => Promise<any>;
    /** Attach file to API */
    attach: (params: any, file: FileAttachment) => Promise<any>;
}
