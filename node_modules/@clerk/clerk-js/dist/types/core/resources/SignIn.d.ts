import { type ClerkError } from '@clerk/shared/error';
import { createValidatePassword } from '@clerk/shared/internal/clerk-js/passwords/password';
import type { AttemptFirstFactorParams, AttemptSecondFactorParams, AuthenticateWithPasskeyParams, AuthenticateWithPopupParams, AuthenticateWithRedirectParams, AuthenticateWithWeb3Params, ClientTrustState, CreateEmailLinkFlowReturn, PrepareFirstFactorParams, PrepareSecondFactorParams, ProtectCheckResource, ResetPasswordParams, SignInAuthenticateWithSolanaParams, SignInCreateParams, SignInFirstFactor, SignInFutureBackupCodeVerifyParams, SignInFutureCreateParams, SignInFutureEmailCodeSendParams, SignInFutureEmailCodeVerifyParams, SignInFutureEmailLinkSendParams, SignInFutureFinalizeParams, SignInFutureMFAEmailCodeVerifyParams, SignInFutureMFAPhoneCodeVerifyParams, SignInFuturePasskeyParams, SignInFuturePasswordParams, SignInFuturePhoneCodeSendParams, SignInFuturePhoneCodeVerifyParams, SignInFutureResetPasswordPhoneCodeSendParams, SignInFutureResetPasswordPhoneCodeVerifyParams, SignInFutureResetPasswordSubmitParams, SignInFutureResource, SignInFutureSSOParams, SignInFutureSubmitProtectCheckParams, SignInFutureTicketParams, SignInFutureTOTPVerifyParams, SignInFutureWeb3Params, SignInIdentifier, SignInJSON, SignInJSONSnapshot, SignInResource, SignInSecondFactor, SignInStartEmailLinkFlowParams, SignInStatus, VerificationResource } from '@clerk/shared/types';
import { BaseResource, UserData } from './internal';
export declare class SignIn extends BaseResource implements SignInResource {
    pathRoot: string;
    id?: string;
    private _status;
    supportedIdentifiers: SignInIdentifier[];
    supportedFirstFactors: SignInFirstFactor[] | null;
    supportedSecondFactors: SignInSecondFactor[] | null;
    firstFactorVerification: VerificationResource;
    secondFactorVerification: VerificationResource;
    identifier: string | null;
    createdSessionId: string | null;
    userData: UserData;
    clientTrustState?: ClientTrustState;
    protectCheck: ProtectCheckResource | null;
    /**
     * The current status of the sign-in process.
     *
     * @returns The current sign-in status, or null if no status has been set
     */
    get status(): SignInStatus | null;
    /**
     * Sets the sign-in status and logs the transition at debug level.
     *
     * @param value - The new status to set. Can be null to clear the status.
     * @remarks When setting a new status that differs from the previous one,
     * a debug log entry is created showing the transition from the old to new status.
     */
    set status(value: SignInStatus | null);
    /**
     * @experimental This experimental API is subject to change.
     *
     * An instance of `SignInFuture`, which has a different API than `SignIn`, intended to be used in custom flows.
     */
    __internal_future: SignInFuture;
    /**
     * @internal Only used for internal purposes, and is not intended to be used directly.
     *
     * This property is used to provide access to underlying Client methods to `SignInFuture`, which wraps an instance
     * of `SignIn`.
     */
    __internal_basePost: <J extends import("@clerk/shared/types").ClerkResourceJSON | null>(params?: import("./Base").BaseMutateParams) => Promise<this>;
    /**
     * @internal Only used for internal purposes, and is not intended to be used directly.
     *
     * This property is used to provide access to underlying Client methods to `SignInFuture`, which wraps an instance
     * of `SignIn`.
     */
    __internal_basePatch: <J extends import("@clerk/shared/types").ClerkResourceJSON>(params?: import("./Base").BaseMutateParams) => Promise<this>;
    /**
     * @internal Only used for internal purposes, and is not intended to be used directly.
     *
     * This property is used to provide access to underlying Client methods to `SignInFuture`, which wraps an instance
     * of `SignIn`.
     */
    __internal_baseGet: <J extends import("@clerk/shared/types").ClerkResourceJSON | null>(opts?: import("./Base").BaseFetchOptions) => Promise<this>;
    constructor(data?: SignInJSON | SignInJSONSnapshot | null);
    create: (params: SignInCreateParams) => Promise<SignInResource>;
    resetPassword: (params: ResetPasswordParams) => Promise<SignInResource>;
    prepareFirstFactor: (params: PrepareFirstFactorParams) => Promise<SignInResource>;
    /**
     * Submits a proof token to resolve a Clerk Protect challenge (`protect_check`) during sign-in.
     *
     * @param params - The proof token parameters.
     * @param params.proofToken - The proof token produced by the Protect challenge SDK.
     * @returns A promise resolving to the updated `SignIn` resource (gate cleared, a chained
     * challenge, or the completed flow).
     */
    submitProtectCheck: (params: {
        proofToken: string;
    }) => Promise<SignInResource>;
    attemptFirstFactor: (params: AttemptFirstFactorParams) => Promise<SignInResource>;
    createEmailLinkFlow: () => CreateEmailLinkFlowReturn<SignInStartEmailLinkFlowParams, SignInResource>;
    prepareSecondFactor: (params: PrepareSecondFactorParams) => Promise<SignInResource>;
    attemptSecondFactor: (params: AttemptSecondFactorParams) => Promise<SignInResource>;
    private authenticateWithRedirectOrPopup;
    authenticateWithRedirect: (params: AuthenticateWithRedirectParams) => Promise<void>;
    authenticateWithPopup: (params: AuthenticateWithPopupParams) => Promise<void>;
    authenticateWithWeb3: (params: AuthenticateWithWeb3Params) => Promise<SignInResource>;
    authenticateWithMetamask: () => Promise<SignInResource>;
    authenticateWithCoinbaseWallet: () => Promise<SignInResource>;
    authenticateWithBase: () => Promise<SignInResource>;
    authenticateWithOKXWallet: () => Promise<SignInResource>;
    /**
     * Authenticates a user using a Solana Web3 wallet during sign-in.
     *
     * @param params - Configuration for Solana authentication
     * @param params.walletName - The name of the Solana wallet to use for authentication
     * @returns A promise that resolves to the updated SignIn resource
     * @throws {ClerkRuntimeError} If walletName is not provided or wallet connection fails
     *
     * @example
     * ```typescript
     * await signIn.authenticateWithSolana({ walletName: 'phantom' });
     * ```
     */
    authenticateWithSolana: ({ walletName, }: SignInAuthenticateWithSolanaParams) => Promise<SignInResource>;
    authenticateWithPasskey: (params?: AuthenticateWithPasskeyParams) => Promise<SignInResource>;
    validatePassword: ReturnType<typeof createValidatePassword>;
    protected fromJSON(data: SignInJSON | SignInJSONSnapshot | null): this;
    private clientBypass;
    /**
     * Determines whether captcha is required for sign in based on the provided params.
     * Add new conditions here as captcha requirements evolve.
     */
    private shouldRequireCaptcha;
    /**
     * We delegate bot detection to the following providers, instead of relying on turnstile exclusively
     */
    protected shouldBypassCaptchaForAttempt(params: SignInCreateParams): boolean;
    __internal_updateFromJSON(data: SignInJSON | SignInJSONSnapshot | null): this;
    __internal_toSnapshot(): SignInJSONSnapshot;
}
declare class SignInFuture implements SignInFutureResource {
    #private;
    emailCode: {
        sendCode: (params?: SignInFutureEmailCodeSendParams) => Promise<{
            error: ClerkError | null;
        }>;
        verifyCode: (params: SignInFutureEmailCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
    };
    emailLink: {
        sendLink: (params: SignInFutureEmailLinkSendParams) => Promise<{
            error: ClerkError | null;
        }>;
        waitForVerification: () => Promise<{
            error: ClerkError | null;
        }>;
        readonly verification: {
            status: "failed" | "expired" | "verified" | "client_mismatch";
            createdSessionId: string;
            verifiedFromTheSameClient: boolean;
        } | null;
    };
    resetPasswordEmailCode: {
        sendCode: () => Promise<{
            error: ClerkError | null;
        }>;
        verifyCode: (params: SignInFutureEmailCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
        submitPassword: (params: SignInFutureResetPasswordSubmitParams) => Promise<{
            error: ClerkError | null;
        }>;
    };
    resetPasswordPhoneCode: {
        sendCode: (params?: SignInFutureResetPasswordPhoneCodeSendParams) => Promise<{
            error: ClerkError | null;
        }>;
        verifyCode: (params: SignInFutureResetPasswordPhoneCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
        submitPassword: (params: SignInFutureResetPasswordSubmitParams) => Promise<{
            error: ClerkError | null;
        }>;
    };
    phoneCode: {
        sendCode: (params?: SignInFuturePhoneCodeSendParams) => Promise<{
            error: ClerkError | null;
        }>;
        verifyCode: (params: SignInFuturePhoneCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
    };
    mfa: {
        sendPhoneCode: () => Promise<{
            error: ClerkError | null;
        }>;
        verifyPhoneCode: (params: SignInFutureMFAPhoneCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
        sendEmailCode: () => Promise<{
            error: ClerkError | null;
        }>;
        verifyEmailCode: (params: SignInFutureMFAEmailCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
        verifyTOTP: (params: SignInFutureTOTPVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
        verifyBackupCode: (params: SignInFutureBackupCodeVerifyParams) => Promise<{
            error: ClerkError | null;
        }>;
    };
    constructor(resource: SignIn);
    get id(): string | undefined;
    get identifier(): string | null;
    get createdSessionId(): string | null;
    get userData(): UserData;
    get status(): SignInStatus;
    get supportedFirstFactors(): SignInFirstFactor[];
    get supportedSecondFactors(): SignInSecondFactor[];
    get isTransferable(): boolean;
    get existingSession(): {
        sessionId: string;
    } | undefined;
    get firstFactorVerification(): VerificationResource;
    get secondFactorVerification(): VerificationResource;
    get protectCheck(): ProtectCheckResource | null;
    /**
     * Submits a proof token to resolve a Clerk Protect challenge (`protect_check`) during sign-in.
     *
     * @param params - The proof token parameters.
     * @param params.proofToken - The proof token produced by the Protect challenge SDK.
     * @returns A promise resolving to `{ error }` — `null` on success, otherwise the encountered error.
     */
    submitProtectCheck(params: SignInFutureSubmitProtectCheckParams): Promise<{
        error: ClerkError | null;
    }>;
    get canBeDiscarded(): boolean;
    sendResetPasswordEmailCode(): Promise<{
        error: ClerkError | null;
    }>;
    verifyResetPasswordEmailCode(params: SignInFutureEmailCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    sendResetPasswordPhoneCode(params?: SignInFutureResetPasswordPhoneCodeSendParams): Promise<{
        error: ClerkError | null;
    }>;
    verifyResetPasswordPhoneCode(params: SignInFutureResetPasswordPhoneCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    submitResetPassword(params: SignInFutureResetPasswordSubmitParams): Promise<{
        error: ClerkError | null;
    }>;
    /**
     * Determines whether captcha is required for sign in based on the provided params.
     * Add new conditions here as captcha requirements evolve.
     */
    private shouldRequireCaptcha;
    private shouldBypassCaptchaForAttempt;
    private getCaptchaToken;
    private _create;
    create(params: SignInFutureCreateParams): Promise<{
        error: ClerkError | null;
    }>;
    password(params: SignInFuturePasswordParams): Promise<{
        error: ClerkError | null;
    }>;
    sendEmailCode(params?: SignInFutureEmailCodeSendParams): Promise<{
        error: ClerkError | null;
    }>;
    verifyEmailCode(params: SignInFutureEmailCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    sendEmailLink(params: SignInFutureEmailLinkSendParams): Promise<{
        error: ClerkError | null;
    }>;
    waitForEmailLinkVerification(): Promise<{
        error: ClerkError | null;
    }>;
    sendPhoneCode(params?: SignInFuturePhoneCodeSendParams): Promise<{
        error: ClerkError | null;
    }>;
    verifyPhoneCode(params: SignInFuturePhoneCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    sso(params: SignInFutureSSOParams): Promise<{
        error: ClerkError | null;
    }>;
    web3(params: SignInFutureWeb3Params): Promise<{
        error: ClerkError | null;
    }>;
    passkey(params?: SignInFuturePasskeyParams): Promise<{
        error: ClerkError | null;
    }>;
    sendMFAPhoneCode(): Promise<{
        error: ClerkError | null;
    }>;
    verifyMFAPhoneCode(params: SignInFutureMFAPhoneCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    sendMFAEmailCode(): Promise<{
        error: ClerkError | null;
    }>;
    verifyMFAEmailCode(params: SignInFutureMFAEmailCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    verifyTOTP(params: SignInFutureTOTPVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    verifyBackupCode(params: SignInFutureBackupCodeVerifyParams): Promise<{
        error: ClerkError | null;
    }>;
    ticket(params?: SignInFutureTicketParams): Promise<{
        error: ClerkError | null;
    }>;
    finalize(params?: SignInFutureFinalizeParams): Promise<{
        error: ClerkError | null;
    }>;
    /**
     * Resets the current sign-in attempt by clearing all local state back to null.
     * Unlike other methods, this does NOT emit resource:fetch with 'fetching' status,
     * allowing for smooth UI transitions without loading states.
     */
    reset(): Promise<{
        error: ClerkError | null;
    }>;
    private selectFirstFactor;
}
export {};
