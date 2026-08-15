import type { ClerkError } from '@clerk/shared/error';
import type { State as StateInterface } from '@clerk/shared/types';
import { computed, effect } from 'alien-signals';
import { SignIn } from './resources/SignIn';
import { SignUp } from './resources/SignUp';
import { Waitlist } from './resources/Waitlist';
export declare class State implements StateInterface {
    signInResourceSignal: {
        (): {
            resource: SignIn | null;
        };
        (value: {
            resource: SignIn | null;
        }): void;
    };
    signInErrorSignal: {
        (): {
            error: ClerkError | null;
        };
        (value: {
            error: ClerkError | null;
        }): void;
    };
    signInFetchSignal: {
        (): {
            status: "idle" | "fetching";
        };
        (value: {
            status: "idle" | "fetching";
        }): void;
    };
    signInSignal: import("@clerk/shared/types").SignInSignal;
    signUpResourceSignal: {
        (): {
            resource: SignUp | null;
        };
        (value: {
            resource: SignUp | null;
        }): void;
    };
    signUpErrorSignal: {
        (): {
            error: ClerkError | null;
        };
        (value: {
            error: ClerkError | null;
        }): void;
    };
    signUpFetchSignal: {
        (): {
            status: "idle" | "fetching";
        };
        (value: {
            status: "idle" | "fetching";
        }): void;
    };
    signUpSignal: import("@clerk/shared/types").SignUpSignal;
    waitlistResourceSignal: {
        (): {
            resource: Waitlist | null;
        };
        (value: {
            resource: Waitlist | null;
        }): void;
    };
    waitlistErrorSignal: {
        (): {
            error: ClerkError | null;
        };
        (value: {
            error: ClerkError | null;
        }): void;
    };
    waitlistFetchSignal: {
        (): {
            status: "idle" | "fetching";
        };
        (value: {
            status: "idle" | "fetching";
        }): void;
    };
    waitlistSignal: import("@clerk/shared/types").WaitlistSignal;
    private _waitlistInstance;
    __internal_effect: typeof effect;
    __internal_computed: typeof computed;
    constructor();
    get __internal_waitlist(): Waitlist;
    private onResourceError;
    private onResourceUpdated;
    private onResourceFetch;
}
