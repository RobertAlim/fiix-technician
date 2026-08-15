import type { AuthenticateWithRedirectParams, HandleOAuthCallbackParams, OAuthTransport, SignInResource, SignUpResource } from '@clerk/shared/types';
type AuthenticateMethod = (params: AuthenticateWithRedirectParams, navigateCallback: (url: URL | string) => void) => Promise<void>;
type ClerkWithResourceCallback = {
    __internal_handleResourceCallback: (resource: SignInResource | SignUpResource, params: HandleOAuthCallbackParams) => Promise<unknown>;
};
export declare function _authenticateWithTransport(opts: {
    clerk: ClerkWithResourceCallback;
    transport: OAuthTransport;
    resource: SignInResource | SignUpResource;
    authenticateMethod: AuthenticateMethod;
    params: AuthenticateWithRedirectParams;
    callbackParams: HandleOAuthCallbackParams;
}): Promise<void>;
export {};
