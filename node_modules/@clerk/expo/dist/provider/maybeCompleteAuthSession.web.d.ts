/**
 * Web-only implementation. Resolved by Metro / the bundler in place of
 * `maybeCompleteAuthSession.ts` when targeting `web`.
 *
 * Must stay synchronous during render so the OAuth/SSO redirect URL is caught
 * before children mount.
 */
export declare function maybeCompleteAuthSession(): void;
//# sourceMappingURL=maybeCompleteAuthSession.web.d.ts.map