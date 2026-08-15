import type { ClientJSON, ClientJSONSnapshot, ClientResource, LastAuthenticationStrategy, SignedInSessionResource, SignInResource, SignUpResource } from '@clerk/shared/types';
import type { FapiResponseJSON } from '../fapiClient';
import { BaseResource, Session } from './internal';
export declare function getClientResourceFromPayload<J>(responseJSON: FapiResponseJSON<J> | null): ClientResource | undefined;
export declare class Client extends BaseResource implements ClientResource {
    private static instance;
    pathRoot: string;
    sessions: Session[];
    signUp: SignUpResource;
    signIn: SignInResource;
    lastActiveSessionId: string | null;
    captchaBypass: boolean;
    cookieExpiresAt: Date | null;
    lastAuthenticationStrategy: LastAuthenticationStrategy | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    static getOrCreateInstance(data?: ClientJSON | ClientJSONSnapshot | null): Client;
    static clearInstance(): void;
    static isClientResource(resource: unknown): resource is Client;
    private constructor();
    get signUpAttempt(): SignUpResource;
    get signInAttempt(): SignInResource;
    get signedInSessions(): SignedInSessionResource[];
    create(): Promise<this>;
    fetch({ fetchMaxTries, abortSignal }?: {
        fetchMaxTries?: number;
        abortSignal?: AbortSignal;
    }): Promise<this>;
    destroy(): Promise<void>;
    removeSessions(): Promise<ClientResource>;
    resetSignIn(): void;
    resetSignUp(): void;
    clearCache(): void;
    isEligibleForTouch(): boolean;
    buildTouchUrl({ redirectUrl }: {
        redirectUrl: URL;
    }): string;
    __internal_sendCaptchaToken(params: unknown): Promise<ClientResource>;
    fromJSON(data: ClientJSON | ClientJSONSnapshot | null): this;
    __internal_toSnapshot(): ClientJSONSnapshot;
    protected path(): string;
}
