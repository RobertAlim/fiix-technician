import type { BillingMoneyAmount, BillingPaymentChargeType, BillingPaymentJSON, BillingPaymentMethodResource, BillingPaymentResource, BillingPaymentStatus, BillingPaymentTotals, BillingSubscriptionItemResource } from '@clerk/shared/types';
import { BaseResource } from './internal';
export declare class BillingPayment extends BaseResource implements BillingPaymentResource {
    id: string;
    amount: BillingMoneyAmount;
    failedAt: Date | null;
    paidAt: Date | null;
    updatedAt: Date;
    paymentMethod: BillingPaymentMethodResource | null;
    subscriptionItem: BillingSubscriptionItemResource;
    chargeType: BillingPaymentChargeType;
    status: BillingPaymentStatus;
    totals: BillingPaymentTotals | null;
    constructor(data: BillingPaymentJSON);
    protected fromJSON(data: BillingPaymentJSON | null): this;
}
