import type { AttemptAffiliationVerificationParams, CreateOrganizationDomainParams, OrganizationDomainJSON, OrganizationDomainOwnershipVerification, OrganizationDomainResource, OrganizationDomainVerification, OrganizationEnrollmentMode, PrepareAffiliationVerificationParams, UpdateEnrollmentModeParams } from '@clerk/shared/types';
import { BaseResource } from './Base';
export declare class OrganizationDomain extends BaseResource implements OrganizationDomainResource {
    id: string;
    name: string;
    organizationId: string;
    enrollmentMode: OrganizationEnrollmentMode;
    verification: OrganizationDomainVerification | null;
    affiliationVerification: OrganizationDomainVerification | null;
    ownershipVerification: OrganizationDomainOwnershipVerification | null;
    affiliationEmailAddress: string | null;
    createdAt: Date;
    updatedAt: Date;
    totalPendingInvitations: number;
    totalPendingSuggestions: number;
    constructor(data: OrganizationDomainJSON);
    static create(organizationId: string, { name, enrollmentMode }: CreateOrganizationDomainParams): Promise<OrganizationDomainResource>;
    prepareAffiliationVerification: (params: PrepareAffiliationVerificationParams) => Promise<OrganizationDomainResource>;
    attemptAffiliationVerification: (params: AttemptAffiliationVerificationParams) => Promise<OrganizationDomainResource>;
    updateEnrollmentMode: (params: UpdateEnrollmentModeParams) => Promise<OrganizationDomainResource>;
    delete: () => Promise<void>;
    protected fromJSON(data: OrganizationDomainJSON | null): this;
}
