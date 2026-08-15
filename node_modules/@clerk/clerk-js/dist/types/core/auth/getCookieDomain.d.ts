import { type CookieAttributes } from '@clerk/shared/cookie';
/**
 * @param hostname - The hostname to determine the eTLD+1 for.
 * @param cookieHandler - The cookie handler to use for the eTLD+1 probe.
 * @param cookieAttributes - Optional cookie attributes (sameSite, secure) to use
 *   during the eTLD+1 probe. These should match the attributes that will be used
 *   when setting the actual cookie, so the probe accurately reflects whether a
 *   domain-scoped cookie can be set in the current context.
 */
export declare function getCookieDomain(hostname?: string, cookieHandler?: {
    get(): string | undefined;
    set(newValue: string, options?: CookieAttributes): void;
    remove(cookieAttributes?: CookieAttributes): void;
}, cookieAttributes?: Pick<CookieAttributes, 'sameSite' | 'secure'>): string;
