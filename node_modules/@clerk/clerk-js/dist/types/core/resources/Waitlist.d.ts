import type { ClerkError } from '@clerk/shared/error';
import type { JoinWaitlistParams, WaitlistJSON, WaitlistResource } from '@clerk/shared/types';
import { BaseResource } from './internal';
export declare class Waitlist extends BaseResource implements WaitlistResource {
    pathRoot: string;
    id: string;
    updatedAt: Date | null;
    createdAt: Date | null;
    constructor(data?: WaitlistJSON | null);
    protected fromJSON(data: WaitlistJSON | null): this;
    join(params: JoinWaitlistParams): Promise<{
        error: ClerkError | null;
    }>;
    static join(params: JoinWaitlistParams): Promise<WaitlistResource>;
}
