import { FileAttachment } from './FileAttachement';
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
    /** GET request */
    get: (path: string) => Promise<any>;
    /** PUT request */
    put: (path: string, postData?: any) => Promise<any>;
    /** POST request */
    post: (path: string, postData?: any) => Promise<any>;
    /** DELETE request */
    delete: (path: string) => Promise<any>;
    /** Upload file attachment */
    attach: (params: Record<string, any>, file: FileAttachment) => Promise<any>;
}
