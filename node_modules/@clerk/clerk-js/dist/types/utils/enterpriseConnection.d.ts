import type { CreateOrganizationEnterpriseConnectionParams, UpdateOrganizationEnterpriseConnectionParams } from '@clerk/shared/types';
type EnterpriseConnectionParams = CreateOrganizationEnterpriseConnectionParams | UpdateOrganizationEnterpriseConnectionParams;
export type ToEnterpriseConnectionBodyOptions = {
    /**
     * When `true`, omit `organization_id` from the body even if it was provided
     * in `params`. Use this for org-scoped endpoints
     * (`/v1/organizations/{org_id}/enterprise_connections/*`) where the URL
     * path is authoritative.
     */
    omitOrganizationId?: boolean;
};
/**
 * Serializes `CreateOrganizationEnterpriseConnectionParams` /
 * `UpdateOrganizationEnterpriseConnectionParams` for the enterprise
 * connection FAPI endpoints.
 *
 * The handlers expect a flat form body where SAML and OIDC fields are
 * prefixed (e.g. `saml_idp_metadata_url`, `oidc_client_id`) rather than
 * nested under `saml`/`oidc` objects. `attribute_mapping` and
 * `custom_attributes` stay as object values and are JSON-stringified by
 * the form serializer downstream — their inner keys are user-supplied
 * data and must not be camel→snake transformed.
 */
export declare function toEnterpriseConnectionBody(params: EnterpriseConnectionParams, options?: ToEnterpriseConnectionBodyOptions): Record<string, unknown>;
export {};
