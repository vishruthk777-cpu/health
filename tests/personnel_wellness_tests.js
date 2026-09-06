/* =========================================================================
   LIFEOS AI - PERSONNEL WELLNESS PROFILE AUTOMATED TEST SUITE
   =========================================================================
   This test suite runs under Node.js to verify data architecture, RBAC,
   Medical Data Firewall, Validation, Provenance, Versioning, Consent
   Revocation, Conflict Handling, and Audit Logging.
   ========================================================================= */

const fs = require('fs');
const path = require('path');

// Load API Module into Node Environment
const apiPath = path.join(__dirname, '..', 'js', 'personnel_wellness_api.js');
const apiCode = fs.readFileSync(apiPath, 'utf8');
eval(apiCode);

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ PASS: ${message}`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failCount++;
    }
}

console.log("\n============================================================");
console.log("RUNNING PERSONNEL WELLNESS PROFILE SYSTEM TEST SUITE");
console.log("============================================================\n");

// Test 1: Data Initialization
console.log("TEST 1: Initial Data Architecture Schema & Minimization");
const mockState = {};
const initialProfile = global.createInitialPersonnelProfile("USER-ALEX-001");
assert(initialProfile.userId === "USER-ALEX-001", "Profile created with correct User ID.");
assert(initialProfile.serviceContext.dutyCategory === "field_operations", "Generalized duty category stored instead of exact location.");
assert(initialProfile.operationalEnvironment.gpsSurveillanceActive === false, "Continuous GPS surveillance is disabled by default (Privacy by Design).");
assert(initialProfile.workloadContext.disciplinaryEvaluationAllowed === false, "Welfare-First Policy: Disciplinary evaluation is strictly forbidden.");

// Test 2: Authentication & RBAC Checks
console.log("\nTEST 2: Authentication & Role-Based Access Control (RBAC)");
const unauthRes = global.PersonnelWellnessAPI.getProfile(null, "PERSONNEL", "USER-ALEX-001", mockState);
assert(unauthRes.status === 401, "Unauthenticated access attempt returns HTTP 401.");

const crossUserUser = { id: "USER-BOB-002", email: "bob@lifeos.ai" };
const crossUserRes = global.PersonnelWellnessAPI.getProfile(crossUserUser, "PERSONNEL", "USER-ALEX-001", mockState);
assert(crossUserRes.status === 403, "PERSONNEL user accessing another user's profile returns HTTP 403 (Cross-User Isolation).");

const ownerUser = { id: "USER-ALEX-001", email: "alex@lifeos.ai" };
const ownerRes = global.PersonnelWellnessAPI.getProfile(ownerUser, "PERSONNEL", "USER-ALEX-001", mockState);
assert(ownerRes.status === 200, "Owner user accessing own profile returns HTTP 200.");

// Test 3: Medical Data Firewall Separation
console.log("\nTEST 3: Medical Data Firewall Separation");
const firewallCheck = global.PersonnelRBAC.validateAccess(ownerUser, "USER-ALEX-001", "CLINICAL_MEDICAL_DATA", "WELFARE_OFFICER");
assert(firewallCheck.authorized === false && firewallCheck.status === 403, "Welfare Officer attempting to access Clinical Medical Data is blocked by Medical Firewall (HTTP 403).");

const leaveCheck = mockState.personnelWellnessProfile.leaveHistory.find(l => l.leaveCategory === 'medical');
assert(leaveCheck && !leaveCheck.medicalDiagnosis && !leaveCheck.doctorNotes, "Medical leave record isolates category without exposing clinical diagnoses or doctor notes.");

// Test 4: Data Validation & Conflict Detection
console.log("\nTEST 4: Data Validation Engine");
const invalidDep = {
    startDate: "2026-08-01",
    endDate: "2026-05-01", // Invalid: end before start!
    deploymentCategory: "Test Field Duty",
    recoveryPeriodAfterDeploymentDays: 7
};
const valRes = global.PersonnelWellnessAPI.addDeployment(ownerUser, "PERSONNEL", "USER-ALEX-001", invalidDep, mockState);
assert(valRes.status === 400, "Adding deployment with endDate before startDate fails validation (HTTP 400).");

const validDep = {
    startDate: "2026-09-10",
    endDate: "2026-10-10",
    deploymentCategory: "Coastal Security Duty",
    workloadLevel: "ELEVATED",
    environmentCategory: "remote",
    recoveryPeriodAfterDeploymentDays: 14,
    source: "USER"
};
const addDepRes = global.PersonnelWellnessAPI.addDeployment(ownerUser, "PERSONNEL", "USER-ALEX-001", validDep, mockState);
assert(addDepRes.status === 200, "Valid deployment successfully added.");
assert(addDepRes.data.durationDays === 30, "Deployment duration correctly calculated (30 days).");

// Test 5: Versioning & Provenance
console.log("\nTEST 5: Data Provenance & Versioning Incrementing");
const updateRes = global.PersonnelWellnessAPI.updateProfile(ownerUser, "PERSONNEL", "USER-ALEX-001", {
    dutyType: "technical",
    dutyTypeSource: "USER"
}, mockState);
assert(updateRes.status === 200, "Duty profile context updated successfully.");
assert(updateRes.data.dutyType === "technical", "Duty type set to technical.");
assert(updateRes.data.dutyTypeSource === "USER", "Source correctly labeled as USER.");
assert(updateRes.data.version === 2, "Profile serviceContext version incremented to 2.");
assert(updateRes.data.previousVersionId === "v1", "Previous version ID tracked.");

// Test 6: Consent Architecture & Revocation
console.log("\nTEST 6: Consent Management & Revocation");
const consents = mockState.personnelWellnessProfile.consents;
const voluntaryConsent = consents.find(c => c.consentId === "cnst_01_voluntary");
assert(voluntaryConsent.consentStatus === "GRANTED", "Default voluntary consent is GRANTED.");

const revokeRes = global.PersonnelWellnessAPI.updateConsent(ownerUser, "PERSONNEL", "USER-ALEX-001", "cnst_03_health_twin_bridge", "REVOKED", mockState);
assert(revokeRes.status === 200, "Health Twin bridge consent revoked.");
assert(revokeRes.data.consentStatus === "REVOKED", "Consent status updated to REVOKED.");
assert(!!revokeRes.data.revokedAt, "Revocation timestamp populated.");

// Health Twin bridge test with revoked consent
const bridgeRes = global.PersonnelHealthTwinBridge.getAuthorizedWellnessSignals({}, mockState.personnelWellnessProfile.consents);
assert(bridgeRes.authorized === false, "Health Twin Bridge denies signal extraction when explicit consent is REVOKED.");

// Test 7: Future-Compatible Event Architecture
console.log("\nTEST 7: Timeline-Compatible Event Architecture");
const events = mockState.personnelWellnessProfile.events;
assert(events.length >= 4, "Events generated for deployments, check-ins, and consent updates.");
assert(events[0].eventType === "CONSENT_CHANGED", "Latest event correctly recorded CONSENT_CHANGED.");

// Test 8: Audit Logging
console.log("\nTEST 8: Security Audit Logging");
const logs = global.PersonnelAuditLogger.getLogs(50);
assert(logs.length > 0, "Audit logs recorded for API calls.");
assert(logs.some(l => l.action === "CONSENT_REVOKED"), "Audit logger contains CONSENT_REVOKED entry.");
assert(logs.some(l => l.action === "PROFILE_UPDATED"), "Audit logger contains PROFILE_UPDATED entry.");

console.log("\n============================================================");
console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("============================================================\n");

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
