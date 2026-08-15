import type { ClerkResourceReloadParams, EnterpriseConnectionTestRunJSON, EnterpriseConnectionTestRunJSONSnapshot, EnterpriseConnectionTestRunLogResource, EnterpriseConnectionTestRunOauthPayloadResource, EnterpriseConnectionTestRunParsedUserInfoResource, EnterpriseConnectionTestRunResource, EnterpriseConnectionTestRunSamlPayloadResource } from '@clerk/shared/types';
export declare class EnterpriseConnectionTestRun implements EnterpriseConnectionTestRunResource {
    pathRoot: string;
    id: string;
    status: string;
    connectionType: 'saml' | 'oauth';
    parsedUserInfo: EnterpriseConnectionTestRunParsedUserInfoResource | null;
    logs: EnterpriseConnectionTestRunLogResource[];
    saml: EnterpriseConnectionTestRunSamlPayloadResource | null;
    oauth: EnterpriseConnectionTestRunOauthPayloadResource | null;
    createdAt: Date | null;
    constructor(data: EnterpriseConnectionTestRunJSON);
    reload(_?: ClerkResourceReloadParams): Promise<this>;
    private fromJSON;
    __internal_toSnapshot(): EnterpriseConnectionTestRunJSONSnapshot;
}
