import type { __experimental_CheckoutOptions, CheckoutSignalValue } from '@clerk/shared/types';
import type { Clerk } from '../../clerk';
/**
 * Create a checkout instance with the given options
 */
declare function createCheckoutInstance(clerk: Clerk, options: __experimental_CheckoutOptions): CheckoutSignalValue;
export { createCheckoutInstance };
