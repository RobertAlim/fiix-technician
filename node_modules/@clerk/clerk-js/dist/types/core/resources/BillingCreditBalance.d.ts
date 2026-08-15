import type { BillingCreditBalanceJSON, BillingCreditBalanceResource, BillingMoneyAmount } from '@clerk/shared/types';
export declare class BillingCreditBalance implements BillingCreditBalanceResource {
    balance: BillingMoneyAmount | null;
    constructor(data: BillingCreditBalanceJSON);
}
