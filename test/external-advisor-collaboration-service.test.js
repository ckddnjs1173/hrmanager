import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_ADVISOR_MANAGEMENT_ROLES,
  createExternalAdvisorCollaborationService,
  isExternalAdvisorManagementRole,
} from "../lib/external-advisor-collaboration-service.js";

function harness({ roleKey = "OWNER", caseStatus = "OPEN", caseOrganizationId = "org-a" } = {}) {
  const calls = [];
  const cases = new Map([
    ["case-a", { id: "case-a", organizationId: caseOrganizationId, status: caseStatus, title: "A case" }],
  ]);
  const grants = new Map([
    ["grant-a", { id: "grant-a", organizationId: "org-a", advisorUserId: "advisor-a", status: "PENDING" }],
  ]);
  const businessCaseRepository = {
    async create(input) { calls.push(["case.create", input]); return { id: "case-new", status: "DRAFT", ...input }; },
    async get(caseId) { calls.push(["case.get", caseId]); return cases.get(caseId) || null; },
    async listForOrganization(input) { calls.push(["case.list", input]); return [...cases.values()]; },
    async transition(input) { calls.push(["case.transition", input]); return { ...cases.get(input.caseId), status: input.toStatus }; },
  };
  const shareGrantRepository = {
    async create(input) { calls.push(["grant.create", input]); return { id: "grant-new", status: "PENDING", ...input }; },
    async get(grantId) { calls.push(["grant.get", grantId]); return grants.get(grantId) || null; },
    async revoke(input) { calls.push(["grant.revoke", input]); return { ...grants.get(input.grantId), status: "REVOKED" }; },
    async accept(input) { calls.push(["grant.accept", input]); return { ...grants.get(input.grantId), status: "ACTIVE" }; },
    async listForOrganization(input) { calls.push(["grant.list.org", input]); return [...grants.values()]; },
    async listForAdvisor(input) { calls.push(["grant.list.advisor", input]); return [...grants.values()].filter((g) => g.advisorUserId === input.advisorUserId); },
  };
  const getMembership = async (organizationId, userId) => {
    calls.push(["membership.get", { organizationId, userId }]);
    if (userId === "missing") return null;
    return { organizationId, userId, roleKey, status: "ACTIVE" };
  };
  const service = createExternalAdvisorCollaborationService({ businessCaseRepository, shareGrantRepository, getMembership });
  return { service, calls, cases, grants };
}

test("External Advisor management roles are OWNER and HR_ADMIN only", () => {
  assert.deepEqual(EXTERNAL_ADVISOR_MANAGEMENT_ROLES, ["OWNER", "HR_ADMIN"]);
  assert.equal(isExternalAdvisorManagementRole("OWNER"), true);
  assert.equal(isExternalAdvisorManagementRole("HR_ADMIN"), true);
  for (const role of ["MANAGER", "EMPLOYEE", "BILLING_ADMIN", "EXTERNAL_ADVISOR", "UNKNOWN"]) {
    assert.equal(isExternalAdvisorManagementRole(role), false);
  }
});

test("OWNER and HR_ADMIN may create Business Cases while other roles are denied", async () => {
  for (const roleKey of ["OWNER", "HR_ADMIN"]) {
    const { service } = harness({ roleKey });
    const created = await service.createBusinessCase({ organizationId: "org-a", actorUserId: "manager-a", title: "노무 이슈" });
    assert.equal(created.status, "DRAFT");
  }
  for (const roleKey of ["MANAGER", "EMPLOYEE", "BILLING_ADMIN"]) {
    const { service, calls } = harness({ roleKey });
    await assert.rejects(
      () => service.createBusinessCase({ organizationId: "org-a", actorUserId: "user-a", title: "금지" }),
      /external_advisor_management_role_required/,
    );
    assert.equal(calls.some(([name]) => name === "case.create"), false, `${roleKey} must not reach repository create`);
  }
  const { service } = harness();
  await assert.rejects(
    () => service.createBusinessCase({ organizationId: "org-a", actorUserId: "missing", title: "금지" }),
    /external_advisor_management_membership_required/,
  );
});

test("Business Case transition re-checks management role on the Case organization", async () => {
  const { service, calls } = harness({ roleKey: "HR_ADMIN" });
  const result = await service.transitionBusinessCase({ caseId: "case-a", actorUserId: "hr-a", toStatus: "RESOLVED", resolutionNote: "처리 완료" });
  assert.equal(result.status, "RESOLVED");
  const membershipCall = calls.find(([name]) => name === "membership.get");
  assert.deepEqual(membershipCall[1], { organizationId: "org-a", userId: "hr-a" });

  const denied = harness({ roleKey: "MANAGER" });
  await assert.rejects(
    () => denied.service.transitionBusinessCase({ caseId: "case-a", actorUserId: "mgr-a", toStatus: "RESOLVED" }),
    /external_advisor_management_role_required/,
  );
  assert.equal(denied.calls.some(([name]) => name === "case.transition"), false);
});

test("ShareGrant issuance requires real tenant-owned OPEN or RESOLVED Business Case", async () => {
  for (const caseStatus of ["OPEN", "RESOLVED"]) {
    const { service, calls } = harness({ roleKey: "OWNER", caseStatus });
    const grant = await service.issueExternalAdvisorShareGrant({
      organizationId: "org-a",
      caseId: "case-a",
      advisorUserId: "advisor-a",
      permissions: ["case.read", "comment.create"],
      actorUserId: "owner-a",
      expiresAt: "2026-09-01T00:00:00Z",
    });
    assert.equal(grant.status, "PENDING");
    const createCall = calls.find(([name]) => name === "grant.create");
    assert.equal(createCall[1].resourceType, "BUSINESS_CASE");
    assert.equal(createCall[1].resourceId, "case-a");
    assert.equal(createCall[1].organizationId, "org-a");
    assert.equal(createCall[1].createdByUserId, "owner-a");
  }

  for (const caseStatus of ["DRAFT", "ARCHIVED"]) {
    const { service, calls } = harness({ roleKey: "OWNER", caseStatus });
    await assert.rejects(
      () => service.issueExternalAdvisorShareGrant({
        organizationId: "org-a",
        caseId: "case-a",
        advisorUserId: "advisor-a",
        permissions: ["case.read"],
        actorUserId: "owner-a",
        expiresAt: "2026-09-01T00:00:00Z",
      }),
      /external_advisor_business_case_not_shareable/,
    );
    assert.equal(calls.some(([name]) => name === "grant.create"), false);
  }
});

test("ShareGrant issuance rejects a Business Case owned by another tenant before repository create", async () => {
  const { service, calls } = harness({ roleKey: "OWNER", caseOrganizationId: "org-b" });
  await assert.rejects(
    () => service.issueExternalAdvisorShareGrant({
      organizationId: "org-a",
      caseId: "case-a",
      advisorUserId: "advisor-a",
      permissions: ["case.read"],
      actorUserId: "owner-a",
      expiresAt: "2026-09-01T00:00:00Z",
    }),
    /external_advisor_cross_tenant_case_forbidden/,
  );
  assert.equal(calls.some(([name]) => name === "grant.create"), false);
});

test("organization grant listing and revocation require OWNER or HR_ADMIN", async () => {
  const allowed = harness({ roleKey: "HR_ADMIN" });
  assert.equal((await allowed.service.listOrganizationShareGrants({ organizationId: "org-a", actorUserId: "hr-a" })).length, 1);
  const revoked = await allowed.service.revokeExternalAdvisorShareGrant({ grantId: "grant-a", actorUserId: "hr-a" });
  assert.equal(revoked.status, "REVOKED");
  const membershipCalls = allowed.calls.filter(([name]) => name === "membership.get");
  assert.equal(membershipCalls.some(([, value]) => value.organizationId === "org-a" && value.userId === "hr-a"), true);

  const denied = harness({ roleKey: "MANAGER" });
  await assert.rejects(
    () => denied.service.listOrganizationShareGrants({ organizationId: "org-a", actorUserId: "mgr-a" }),
    /external_advisor_management_role_required/,
  );
  await assert.rejects(
    () => denied.service.revokeExternalAdvisorShareGrant({ grantId: "grant-a", actorUserId: "mgr-a" }),
    /external_advisor_management_role_required/,
  );
  assert.equal(denied.calls.some(([name]) => name === "grant.revoke"), false);
});

test("advisor acceptance and listing require exact global User identity", async () => {
  const { service, calls } = harness();
  const accepted = await service.acceptExternalAdvisorShareGrant({ grantId: "grant-a", actorUserId: "advisor-a" });
  assert.equal(accepted.status, "ACTIVE");
  await assert.rejects(
    () => service.acceptExternalAdvisorShareGrant({ grantId: "grant-a", actorUserId: "other-user" }),
    /external_advisor_accept_identity_mismatch/,
  );

  const list = await service.listAdvisorShareGrants({ advisorUserId: "advisor-a", actorUserId: "advisor-a" });
  assert.equal(list.length, 1);
  await assert.rejects(
    () => service.listAdvisorShareGrants({ advisorUserId: "advisor-a", actorUserId: "other-user" }),
    /external_advisor_list_identity_mismatch/,
  );
  assert.equal(calls.filter(([name]) => name === "grant.list.advisor").length, 1);
});
