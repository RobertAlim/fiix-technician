import type { APIKeyResource, APIKeysNamespace, ClerkPaginatedResponse, CreateAPIKeyParams, GetAPIKeysParams, RevokeAPIKeyParams } from '@clerk/shared/types';
export declare class APIKeys implements APIKeysNamespace {
    #private;
    /**
     * Gets a paginated list of API keys.
     *
     * The subject (owner) is resolved in the following order:
     * 1. Explicit `subject` param (user or organization ID)
     * 2. Active organization ID
     * 3. Current user ID
     */
    getAll(params?: GetAPIKeysParams): Promise<ClerkPaginatedResponse<APIKeyResource>>;
    create(params: CreateAPIKeyParams): Promise<APIKeyResource>;
    revoke(params: RevokeAPIKeyParams): Promise<APIKeyResource>;
}
