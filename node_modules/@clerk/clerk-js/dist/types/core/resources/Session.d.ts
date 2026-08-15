import type { ActClaim, AgentActClaim, CheckAuthorization, ClientResource, GetToken, SessionJSON, SessionJSONSnapshot, SessionResource, SessionStatus, SessionTask, SessionTouchParams, SessionVerificationResource, SessionVerifyAttemptFirstFactorParams, SessionVerifyAttemptSecondFactorParams, SessionVerifyCreateParams, SessionVerifyPrepareFirstFactorParams, SessionVerifyPrepareSecondFactorParams, TokenResource, UserResource } from '@clerk/shared/types';
import { BaseResource, PublicUserData } from './internal';
export declare class Session extends BaseResource implements SessionResource {
    #private;
    pathRoot: string;
    id: string;
    status: SessionStatus;
    lastActiveAt: Date;
    lastActiveToken: TokenResource | null;
    lastActiveOrganizationId: string | null;
    actor: ActClaim | null;
    agent: AgentActClaim | null;
    user: UserResource | null;
    publicUserData: PublicUserData;
    factorVerificationAge: [number, number] | null;
    tasks: Array<SessionTask> | null;
    expireAt: Date;
    abandonAt: Date;
    createdAt: Date;
    updatedAt: Date;
    static isSessionResource(resource: unknown): resource is Session;
    constructor(data: SessionJSON | SessionJSONSnapshot);
    end: () => Promise<SessionResource>;
    remove: () => Promise<SessionResource>;
    private _touchPost;
    touch: ({ intent }?: SessionTouchParams) => Promise<SessionResource>;
    /**
     * Internal method to touch the session without updating the client or explicitly emitting the TokenUpdate event.
     *
     * Returns the piggybacked client resource if it exists, otherwise undefined.
     *
     * The caller is responsible for calling updateClient(result), which internally also emits TokenUpdate.
     * If updateClient() is not called, the server state and client state will be out of sync.
     *
     * @internal
     */
    __internal_touch: ({ intent }?: SessionTouchParams) => Promise<ClientResource | undefined>;
    clearCache: () => void;
    getToken: GetToken;
    checkAuthorization: CheckAuthorization;
    startVerification: ({ level }: SessionVerifyCreateParams) => Promise<SessionVerificationResource>;
    prepareFirstFactorVerification: (factor: SessionVerifyPrepareFirstFactorParams) => Promise<SessionVerificationResource>;
    attemptFirstFactorVerification: (attemptFactor: SessionVerifyAttemptFirstFactorParams) => Promise<SessionVerificationResource>;
    verifyWithPasskey: () => Promise<SessionVerificationResource>;
    prepareSecondFactorVerification: (params: SessionVerifyPrepareSecondFactorParams) => Promise<SessionVerificationResource>;
    attemptSecondFactorVerification: (attemptFactor: SessionVerifyAttemptSecondFactorParams) => Promise<SessionVerificationResource>;
    protected fromJSON(data: SessionJSON | SessionJSONSnapshot | null): this;
    __internal_toSnapshot(): SessionJSONSnapshot;
    private _getToken;
    get currentTask(): SessionTask;
}
