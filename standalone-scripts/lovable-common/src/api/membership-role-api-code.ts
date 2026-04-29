/**
 * MembershipRoleApiCode — wire-format role values accepted by Lovable's
 * membership endpoints. Keep lowercase to match the JSON contract observed
 * in the captured fetch examples (see spec 99-verbatim).
 */

export enum MembershipRoleApiCode {
    Owner = "owner",
    Admin = "admin",
    Member = "member",
}
