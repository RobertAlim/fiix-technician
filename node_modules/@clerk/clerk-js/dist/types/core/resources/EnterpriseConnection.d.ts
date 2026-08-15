import type { EnterpriseConnectionJSON, EnterpriseConnectionJSONSnapshot, EnterpriseConnectionResource, EnterpriseOAuthConfigResource, EnterpriseSamlConnectionNestedResource } from '@clerk/shared/types';
import { BaseResource } from './Base';
export declare class EnterpriseConnection extends BaseResource implements EnterpriseConnectionResource {
    id: string;
    name: string;
    active: boolean;
    provider: string;
    logoPublicUrl: string | null;
    domains: string[];
    organizationId: string | null;
    syncUserAttributes: boolean;
    disableAdditionalIdentifications: boolean;
    allowOrganizationAccountLinking: boolean;
    customAttributes: unknown[];
    oauthConfig: EnterpriseOAuthConfigResource | null;
    samlConnection: EnterpriseSamlConnectionNestedResource | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    constructor(data: EnterpriseConnectionJSON | EnterpriseConnectionJSONSnapshot | null);
    protected fromJSON(data: EnterpriseConnectionJSON | EnterpriseConnectionJSONSnapshot | null): this;
    __internal_toSnapshot(): EnterpriseConnectionJSONSnapshot;
}
