import type { FapiClient } from '../fapiClient';
import type { DevBrowserCookieOptions } from './cookies/devBrowser';
export interface DevBrowser {
    clear(): void;
    setup(): Promise<void>;
    getDevBrowser(): string | undefined;
    setDevBrowser(devBrowser: string): void;
    removeDevBrowser(): void;
    refreshCookies(): void;
}
export type CreateDevBrowserOptions = {
    frontendApi: string;
    cookieSuffix: string;
    fapiClient: FapiClient;
    cookieOptions: DevBrowserCookieOptions;
};
export declare function createDevBrowser({ cookieSuffix, frontendApi, fapiClient, cookieOptions, }: CreateDevBrowserOptions): DevBrowser;
