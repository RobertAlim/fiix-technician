import type { GetOAuthConsentInfoParams, OAuthApplicationNamespace, OAuthConsentInfo } from '@clerk/shared/types';
export declare class OAuthApplication implements OAuthApplicationNamespace {
    getConsentInfo(params: GetOAuthConsentInfoParams): Promise<OAuthConsentInfo>;
    buildConsentActionUrl({ clientId }: {
        clientId: string;
    }): string;
}
