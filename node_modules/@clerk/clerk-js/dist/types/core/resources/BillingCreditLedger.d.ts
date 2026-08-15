import type { BillingCreditLedgerJSON, BillingCreditLedgerResource, BillingMoneyAmount } from '@clerk/shared/types';
import { BaseResource } from './internal';
export declare class BillingCreditLedger extends BaseResource implements BillingCreditLedgerResource {
    id: string;
    amount: BillingMoneyAmount;
    sourceType: string;
    sourceId: string;
    createdAt: Date;
    constructor(data: BillingCreditLedgerJSON);
    protected fromJSON(data: BillingCreditLedgerJSON | null): this;
}
