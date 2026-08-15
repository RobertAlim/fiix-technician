import { CaptchaChallenge } from '../../utils/captcha/CaptchaChallenge';
import type { Clerk } from '../resources/internal';
export declare class CaptchaHeartbeat {
    private clerk;
    private captchaChallenge;
    private timers;
    constructor(clerk: Clerk, captchaChallenge?: CaptchaChallenge, timers?: {
        setTimeout: import("@clerk/shared/workerTimers/workerTimers.types").WorkerSetTimeout;
        setInterval: import("@clerk/shared/workerTimers/workerTimers.types").WorkerSetTimeout;
        clearTimeout: import("@clerk/shared/workerTimers/workerTimers.types").WorkerClearTimeout;
        clearInterval: import("@clerk/shared/workerTimers/workerTimers.types").WorkerClearTimeout;
        cleanup: (..._args: any[]) => void;
    });
    start(): Promise<void>;
    private challengeAndSend;
    private isEnabled;
    private clientBypass;
    private intervalInMs;
}
