import type { TokenResource } from '@clerk/shared/types';
import { type TokenCacheKeyJSON } from './keyResolver';
/**
 * Cache entry containing token metadata and resolver.
 * Extends TokenCacheKeyJSON with additional properties for expiration tracking and token retrieval.
 */
interface TokenCacheEntry extends TokenCacheKeyJSON {
    /**
     * Timestamp in seconds since UNIX epoch when the entry was created.
     * Used for expiration and cleanup scheduling.
     */
    createdAt?: Seconds;
    /**
     * Callback to refresh this token before it expires.
     * Called by the proactive refresh timer to trigger background refresh.
     * If not provided, no refresh timer will be scheduled (e.g., for broadcast-received tokens).
     */
    onRefresh?: () => void;
    /**
     * The resolved token value for synchronous reads.
     * Populated after tokenResolver resolves. Check this first to avoid microtask overhead.
     */
    resolvedToken?: TokenResource;
    /**
     * Promise that resolves to the TokenResource.
     * May be pending and should be awaited before accessing token data.
     */
    tokenResolver: Promise<TokenResource>;
}
type Seconds = number;
/**
 * Result from cache lookup containing the entry.
 */
export interface TokenCacheGetResult {
    entry: TokenCacheEntry;
}
export interface TokenCache {
    /**
     * Removes all cached entries and clears associated timeouts.
     * Side effects: Clears all scheduled expiration timers and empties the cache.
     */
    clear(): void;
    /**
     * Closes the BroadcastChannel connection and releases resources.
     * Side effects: Disconnects from multi-tab synchronization channel.
     */
    close(): void;
    /**
     * Retrieves a cached token entry if it exists and is safe to use.
     * Forces synchronous refresh if token has less than one poller interval remaining.
     * Proactive refresh is handled by timers scheduled when tokens are cached.
     *
     * @param cacheKeyJSON - Object containing tokenId and optional audience to identify the cached entry
     * @returns Result with entry, or undefined if token is missing/expired/too close to expiration
     */
    get(cacheKeyJSON: TokenCacheKeyJSON): TokenCacheGetResult | undefined;
    /**
     * Stores a token entry in the cache and broadcasts to other tabs when the token resolves.
     *
     * @param entry - TokenCacheEntry containing tokenId, tokenResolver, and optional audience
     * Side effects: Schedules automatic expiration cleanup, broadcasts to other tabs when token resolves
     */
    set(entry: TokenCacheEntry): void;
    /**
     * Returns the current number of cached entries.
     *
     * @returns The count of entries currently stored in the cache
     */
    size(): number;
}
export declare const SessionTokenCache: TokenCache;
export {};
