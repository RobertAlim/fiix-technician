import { type ClerkError } from '@clerk/shared/error';
import { createValidatePassword } from '@clerk/shared/internal/clerk-js/passwords/password';
import type { AttemptEmailAddressVerificationParams, AttemptPhoneNumberVerificationParams, AttemptVerificationParams, AttemptWeb3WalletVerificationParams, AuthenticateWithPopupParams, AuthenticateWithRedirectParams, AuthenticateWithWeb3Params, CreateEmailLinkFlowReturn, PrepareEmailAddressVerificationParams, PreparePhoneNumberVerificationParams, PrepareVerificationParams, PrepareWeb3WalletVerificationParams, ProtectCheckResource, SignUpAuthenticateWithSolanaParams, SignUpAuthenticateWithWeb3Params, SignUpCreateParams, SignUpEnterpriseConnectionResource, SignUpField, SignUpFutureCreateParams, SignUpFutureEmailCodeVerifyParams, SignUpFutureEmailLinkSendParams, SignUpFutureFinalizeParams, SignUpFuturePasswordParams, SignUpFuturePhoneCodeSendParams, SignUpFuturePhoneCodeVerifyParams, SignUpFutureResource, SignUpFutureSSOParams, SignUpFutureSubmitProtectCheckParams, SignUpFutureTicketParams, SignUpFutureUpdateParams, SignUpFutureVerifications as SignUpFutureVerificationsType, SignUpFutureWeb3Params, SignUpIdentificationField, SignUpJSON, SignUpJSONSnapshot, SignUpResource, SignUpStatus, SignUpUpdateParams, StartEmailLinkFlowParams } from '@clerk/shared/types';
import { BaseResource, SignUpVerifications } from './internal';
declare global {
    interface Window {
        ethereum: any;
    }
}
export declare class SignUp extends BaseResource implements SignUpResource {
    pathRoot: string;
    id: string | undefined;
    private _status;
    requiredFields: SignUpField[];
    missingFields: SignUpField[];
    optionalFields: SignUpField[];
    unverifiedFields: SignUpIdentificationField[];
    verifications: SignUpVerifications;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    emailAddress: string | null;
    phoneNumber: string | null;
    web3wallet: string | null;
    externalAccount: any;
    hasPassword: boolean;
    unsafeMetadata: SignUpUnsafeMetadata;
    protectCheck: ProtectCheckResource | null;
    createdSessionId: string | null;
    createdUserId: string | null;
    abandonAt: number | null;
    legalAcceptedAt: number | null;
    locale: string | null;
    /**
     * The current status of the sign-up process.
     *
     * @returns The current sign-up status, or null if no status has been set
     */
    get status(): SignUpStatus | null;
    /**
     * Sets the sign-up status and logs the transition at debug level.
     *
     * @param value - The new status to set. Can be null to clear the status.
     * @remarks When setting a new status that differs from the previous one,
     * a debug log entry is created showing the transition from the old to new status.
     */
    set status(value: SignUpStatus | null);
    /**
     * @experimental This experimental API is subject to change.
     *
     * An instance of `SignUpFuture`, which has a different API than `SignUp`, intended to be used in custom flows.
     */
    __internal_future: SignUpFuture;
    /**
     * @internal Only used for internal purposes, and is not intended to be used directly.
     *
     * This property is used to provide access to underlying Client methods to `SignUpFuture`, which wraps an instance
     * of `SignUp`.
     */
    __internal_basePost: <J extends import("@clerk/shared/types").ClerkResourceJSON | null>(params?: import("./Base").BaseMutateParams) => Promise<this>;
    /**
     * @internal Only used for internal purposes, and is not intended to be used directly.
     *
     * This property is used to provide access to underlying Client methods to `SignUpFuture`, which wraps an instance
     * of `SignUp`.
     */
    __internal_basePatch: <J extends import("@clerk/shared/types").ClerkResourceJSON>(params?: import("./Base").BaseMutateParams) => Promise<this>;
    constructor(data?: SignUpJSON | SignUpJSONSnapshot | null);
    create: (params: SignUpCreateParams) => Promise<SignUpResource>;
    prepareVerification: (params: PrepareVerificationParams) => Promise<this>;
    attemptVerification: (params: AttemptVerificationParams) => Promise<SignUpResource>;
    /**
     * Submits a proof token to resolve a Clerk Protect challenge (`protect_check`) during sign-up.
     *
     * @param params - The proof token parameters.
     * @param params.proofToken - The proof token produced by the Protect challenge SDK.
     * @returns A promise resolving to the updated `SignUp` resource (gate cleared, a chained
     * challenge, or the completed flow).
     */
    submitProtectCheck: (params: {
        proofToken: string;
    }) => Promise<SignUpResource>;
    prepareEmailAddressVerification: (params?: PrepareEmailAddressVerificationParams) => Promise<SignUpResource>;
    attemptEmailAddressVerification: (params: AttemptEmailAddressVerificationParams) => Promise<SignUpResource>;
    createEmailLinkFlow: () => CreateEmailLinkFlowReturn<StartEmailLinkFlowParams, SignUpResource>;
    preparePhoneNumberVerification: (params?: PreparePhoneNumberVerificationParams) => Promise<SignUpResource>;
    attemptPhoneNumberVerification: (params: AttemptPhoneNumberVerificationParams) => Promise<SignUpResource>;
    prepareWeb3WalletVerification: (params?: PrepareWeb3WalletVerificationParams) => Promise<SignUpResource>;
    attemptWeb3WalletVerification: (params: AttemptWeb3WalletVerificationParams) => Promise<SignUpResource>;
    authenticateWithWeb3: (params: AuthenticateWithWeb3Params & {
        unsafeMetadata?: SignUpUnsafeMetadata;
        legalAccepted?: boolean;
    }) => Promise<SignUpResource>;
    authenticateWithMetamask: (params?: SignUpAuthenticateWithWeb3Params & {
        legalAccepted?: boolean;
    }) => Promise<SignUpResource>;
    authenticateWithCoinbaseWallet: (params?: SignUpAuthenticateWithWeb3Params) => Promise<SignUpResource>;
    authenticateWithBase: (params?: SignUpAuthenticateWithWeb3Params) => Promise<SignUpResource>;
    authenticateWithOKXWallet: (params?: SignUpAuthenticateWithWeb3Params) => Promise<SignUpResource>;
    /**
     * Authenticates a user using a Solana Web3 wallet during sign-up.
     *
     * @param params - Configuration for Solana authentication
     * @param params.walletName - The name of the Solana wallet to use (e.g., 'phantom')
     * @param params.unsafeMetadata - Optional unsafe metadata to attach to the user
     * @param params.legalAccepted - Optional flag indicating legal terms acceptance
     * @returns A promise that resolves to the updated SignUp resource
     * @throws {ClerkRuntimeError} If wallet connection fails
     *
     * @example
     * ```typescript
     * await signUp.authenticateWithSolana({
     *   walletName: 'phantom',
     *   legalAccepted: true
     * });
     * ```
     */
    authenticateWithSolana: ({ walletName, unsafeMetadata, legalAccepted, }: SignUpAuthenticateWithSolanaParams) => Promise<SignUpResource>;
    private authenticateWithRedirectOrPopup;
    authenticateWithRedirect: (params: AuthenticateWithRedirectParams & {
        unsafeMetadata?: SignUpUnsafeMetadata;
    }) => Promise<void>;
    authenticateWithPopup: (params: AuthenticateWithPopupParams & {
        unsafeMetadata?: SignUpUnsafeMetadata;
    }) => Promise<void>;
    update: (params: SignUpUpdateParams) => Promise<SignUpResource>;
    upsert: (params: SignUpCreateParams | SignUpUpdateParams) => Promise<SignUpResource>;
    validatePassword: ReturnType<typeof createValidatePassword>;
    protected fromJSON(data: SignUpJSON | SignUpJSONSnapshot | null): this;
    __internal_updateFromJSON(data: SignUpJSON | SignUpJSONSnapshot | null): this;
    __internal_toSnapshot(): SignUpJSONSnapshot;
    private clientBypass;
    /**
     * We delegate bot detection to the following providers, instead of relying on turnstile exclusively
     */
    protected shouldBypassCaptchaForAttempt(params: SignUpCreateParams): boolean;
    __experimental_getEnterpriseConnections: () => Promise<SignUpEnterpriseConnectionResource[]>;
}
export declare function isSignUpIfMissingCaptchaBypassStrategy(strategy: string | null): boolean;
type SignUpFutureVerificationsMethods = Pick<SignUpFutureVerifications, 'sendEmailCode' | 'verifyEmailCode' | 'sendEmailLink' | 'waitForEmailLinkVerification' | 'sendPhoneCode' | 'verifyPhoneCode'>;
declare class SignUpFutureVerifications implements SignUpFutureVerificationsType {
    #private;
    sendEmailCode: SignUpFutureVerificationsType['sendEmailCode'];
    verifyEmailCode: SignUpFutureVerificationsType['verifyEmailCode'];
    sendEmailLink: SignUpFutureVerificationsType['sendEmailLink'];
    waitForEmailLinkVerification: SignUpFutureVerificationsType['waitForEmailLinkVerification'];
    sendPhoneCode: SignUpFutureVerificationsType['sendPhoneCode'];
    verifyPhoneCode: SignUpFutureVerificationsType['verifyPhoneCode'];
    constructor(resource: SignUp, methods: SignUpFutureVerificationsMethods);
    get emailAddress(): import("@clerk/shared/types").SignUpVerificationResource;
    get phoneNumber(): import("@clerk/shared/types").SignUpVerificationResource;
    get web3Wallet(): import("@clerk/shared/types").SignUpVerificationResource;
    get externalAccount(): import("@clerk/shared/types").VerificationResource;
    get emailLinkVerification(): {
        status: "failed" | "expired" | "verified" | "client_mismatch";
        createdSessionId: string;
        verifiedFromTheSameClient: boolean;
    } | null;
}
declare class SignUpFuture implements SignUpFutureResource {
    #private;
    verifications: SignUpFutureVerifications;
    constructor(resource: SignUp);
    get id(): string | undefined;
    get requiredFields(): SignUpField[];
    get optionalFields(): SignUpField[];
    get missingFields(): SignUpField[];
    get status(): SignUpStatus;
    get username(): string | null;
    get firstName(): string | null;
    get lastName(): string | null;
    get emailAddress(): string | null;
    get phoneNumber(): string | null;
    get web3Wallet(): string | null;
    get hasPassword(): boolean;
    get unsafeMetadata(): SignUpUnsafeMetadata;
    get createdSessionId(): string | null;
    get createdUserId(): string | null;
    get abandonAt(): number | null;
    get legalAcceptedAt(): number | null;
    get locale(): string | null;
    get unverifiedFields(): SignUpIdentificationField[];
    get protectCheck(): ProtectCheckResource | null;
    get isTransferable(): boolean;
    get existingSession(): {
        sessionId: string;
    } | undefined;
    get canBeDiscarded(): boolean;
    private shouldBypassCaptchaForAttempt;
    private getCaptchaToken;
    private _create;
    create(params: SignUpFutureCreateParams): Promise<{
        error: ClerkError | null;
    }>;
    update(params: SignUpFutureUpdateParams): Promise<{
        error: ClerkError | null;
    }>;
    password(params: SignUpFuturePasswordParams): Promise<{
        error: ClerkError | null;
    }>;
    sendEmailCode(): Promise<{
        error: ClerkError | null;
    }>;
    verifyEmailCode(params: SignUpFutureEmailCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    sendPhoneCode(params?: SignUpFuturePhoneCodeSendParams): Promise<{
        error: ClerkError | null;
    }>;
    verifyPhoneCode(params: SignUpFuturePhoneCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    sendEmailLink(params: SignUpFutureEmailLinkSendParams): Promise<{
        error: ClerkError | null;
    }>;
    waitForEmailLinkVerification(): Promise<{
        error: ClerkError | null;
    }>;
    sso(params: SignUpFutureSSOParams): Promise<{
        error: ClerkError | null;
    }>;
    web3(params: SignUpFutureWeb3Params): Promise<{
        error: ClerkError | null;
    }>;
    /**
     * Submits a proof token to resolve a Clerk Protect challenge (`protect_check`) during sign-up.
     *
     * @param params - The proof token parameters.
     * @param params.proofToken - The proof token produced by the Protect challenge SDK.
     * @returns A promise resolving to `{ error }` — `null` on success, otherwise the encountered error.
     */
    submitProtectCheck(params: SignUpFutureSubmitProtectCheckParams): Promise<{
        error: ClerkError | null;
    }>;
    ticket(params?: SignUpFutureTicketParams): Promise<{
        error: ClerkError | null;
    }>;
    finalize(params?: SignUpFutureFinalizeParams): Promise<{
        error: ClerkError | null;
    }>;
    /**
     * Resets the current sign-up attempt by clearing all local state back to null.
     * Unlike other methods, this does NOT emit resource:fetch with 'fetching' status,
     * allowing for smooth UI transitions without loading states.
     */
    reset(): Promise<{
        error: ClerkError | null;
    }>;
}
export {};
