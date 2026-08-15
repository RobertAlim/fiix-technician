import type { BillingMoneyAmount, BillingPayerResourceType, BillingPlanJSON, BillingPlanPrice, BillingPlanResource, BillingPlanUnitPrice } from '@clerk/shared/types';
import { BaseResource, Feature } from './internal';
export declare class BillingPlan extends BaseResource implements BillingPlanResource {
    id: string;
    name: string;
    fee: BillingMoneyAmount | null;
    annualFee: BillingMoneyAmount | null;
    annualMonthlyFee: BillingMoneyAmount | null;
    description: string | null;
    isDefault: boolean;
    isRecurring: boolean;
    hasBaseFee: boolean;
    forPayerType: BillingPayerResourceType;
    publiclyVisible: boolean;
    slug: string;
    avatarUrl: string | null;
    features: Feature[];
    unitPrices?: BillingPlanUnitPrice[];
    availablePrices?: BillingPlanPrice[];
    freeTrialDays: number | null;
    freeTrialEnabled: boolean;
    constructor(data: BillingPlanJSON);
    protected fromJSON(data: BillingPlanJSON | null): this;
}
