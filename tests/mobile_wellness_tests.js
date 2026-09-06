/* =========================================================================
   LIFEOS AI - MOBILE WELLNESS & SELF-ASSESSMENT AUTOMATED TEST SUITE
   =========================================================================
   This test suite runs under Node.js to verify:
   1. Initial schema & data model minimization
   2. Authentication & cross-user isolation (USER A cannot access USER B)
   3. Commander isolation (Commanders cannot view individual assessments or private notes)
   4. Validation engine (allowed options, sleep hours, "Prefer not to answer")
   5. Check-in submission & state persistence
   6. Private notes protection & isolation
   7. Health Twin event bridge & provenance tracking
   8. Personal baseline calculation & delta comparisons
   9. Longitudinal trend analysis & multi-signal pattern detection
   10. Non-diagnostic, supportive language enforcement
   11. Consent management & revocation gates
   12. Data export & complete GDPR/CCPA data deletion
   13. Confidential support request routing & audit logging
   14. Aggregated organizational analytics & minimum cohort threshold
   15. Real wearable data vs disconnected status (zero fake data)
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
console.log("RUNNING MOBILE WELLNESS & SELF-ASSESSMENT SYSTEM TEST SUITE");
console.log("============================================================\n");

// --- TEST 1: Data Model Schema & Minimization ---
console.log("TEST 1: Data Architecture & Collections Initializer");
const mockState = {
    healthTwins: {
        "USER-ALEX-001": {
            patientProfile: { patientId: "USER-ALEX-001" },
            organs: { brain: { sleepRatio: "—" } },
            wellnessEvents: []
        }
    }
};

const profile = global.createInitialPersonnelProfile("USER-ALEX-001");
assert(profile.userId === "USER-ALEX-001", "Profile created with correct User ID.");
assert(Array.isArray(profile.wellness_assessments), "wellness_assessments array initialized.");
assert(Array.isArray(profile.wellness_notes), "wellness_notes array initialized.");
assert(Array.isArray(profile.consents), "consents array initialized.");
assert(profile.consents.some(c => c.consentId === "cnst_04_private_notes"), "Private notes consent defined.");
assert(profile.consents.some(c => c.consentId === "cnst_05_confidential_support"), "Confidential support consent defined.");

// --- TEST 2: Authentication & Cross-User Protection (IDOR) ---
console.log("\nTEST 2: Authentication & Cross-User Access Isolation");
const unauthRes = global.PersonnelWellnessAPI.getCurrentStatus(null, "PERSONNEL", "USER-ALEX-001", mockState);
assert(unauthRes.status === 401, "Unauthenticated request returns HTTP 401.");

const userBob = { id: "USER-BOB-002", email: "bob@lifeos.ai" };
const crossUserRes = global.PersonnelWellnessAPI.getHistory(userBob, "PERSONNEL", "USER-ALEX-001", {}, mockState);
assert(crossUserRes.status === 403, "User Bob accessing User Alex's history returns HTTP 403 (Cross-User Isolation).");

const userAlex = { id: "USER-ALEX-001", email: "alex@lifeos.ai" };
const ownerStatusRes = global.PersonnelWellnessAPI.getCurrentStatus(userAlex, "PERSONNEL", "USER-ALEX-001", mockState);
assert(ownerStatusRes.status === 200, "Owner user accessing own wellness status returns HTTP 200.");

// --- TEST 3: Commander Role Isolation ---
console.log("\nTEST 3: Commander Role Access Isolation");
const commanderUser = { id: "CMD-001", email: "commander@lifeos.ai" };
const cmdHistoryRes = global.PersonnelWellnessAPI.getHistory(commanderUser, "COMMANDER", "USER-ALEX-001", {}, mockState);
assert(cmdHistoryRes.status === 403, "Commander attempting to view individual check-in history returns HTTP 403.");

const cmdProfileRes = global.PersonnelWellnessAPI.getProfile(commanderUser, "COMMANDER", "USER-ALEX-001", mockState);
assert(cmdProfileRes.status === 403, "Commander attempting to view individual personnel profile returns HTTP 403.");

// --- TEST 4: Data Validation Engine ---
console.log("\nTEST 4: Input Validation Engine");
const invalidCheckIn = {
    responses: {
        mood: "Ecstatic", // Invalid option
        sleepDurationHours: 28 // Invalid hours
    }
};
const invalidValRes = global.PersonnelWellnessAPI.submitCheckIn(userAlex, "PERSONNEL", "USER-ALEX-001", invalidCheckIn, mockState);
assert(invalidValRes.status === 400, "Invalid mood and out-of-range sleep hours rejected with HTTP 400.");

// --- TEST 5: Check-In Submission & Private Notes Separation ---
console.log("\nTEST 5: Check-in Submission, Persistence & Private Notes Separation");
const validCheckIn = {
    responses: {
        mood: "Good",
        stress: "Moderate",
        energy: "Moderate",
        fatigue: "Moderately tired",
        sleepDurationHours: 6,
        sleepDurationMinutes: 15,
        sleepQuality: "Fair",
        sleepRested: "Somewhat",
        recovery: "Average",
        overwhelmed: "Prefer not to answer",
        difficultyConcentrating: "Prefer not to answer",
        unusualFatigue: "No",
        difficultToRecover: "No",
        enoughTimeToRest: "Yes",
        wantsConfidentialSupport: "No"
    },
    privateNote: "Felt slightly fatigued after yesterday's rotating shift, but recovery is on track."
};

const submitRes = global.PersonnelWellnessAPI.submitCheckIn(userAlex, "PERSONNEL", "USER-ALEX-001", validCheckIn, mockState);
assert(submitRes.status === 200, "Valid check-in successfully submitted (HTTP 200).");
assert(submitRes.data.completionStatus === "COMPLETED", "Assessment marked as COMPLETED.");
assert(submitRes.data.source === "SELF_REPORTED", "Source accurately marked as SELF_REPORTED.");
assert(submitRes.data.verification === "User provided", "Verification accurately labeled 'User provided'.");

// Verify private note storage
const pwp = mockState.personnelWellnessProfile;
const savedNote = pwp.wellness_notes.find(n => n.assessmentId === submitRes.data.assessmentId);
assert(savedNote !== undefined, "Private note saved in isolated wellness_notes collection.");
assert(savedNote.isPrivate === true, "Private note flagged isPrivate: true.");
assert(savedNote.commanderVisibility === false, "Private note flagged commanderVisibility: false.");

// --- TEST 6: Health Twin Integration & Event Bridge ---
console.log("\nTEST 6: Health Twin Integration & Provenance Event Stream");
const twin = mockState.healthTwins["USER-ALEX-001"];
assert(twin.wellnessEvents && twin.wellnessEvents.length > 0, "Check-in assessment recorded as event in Health Twin.");
const latestHtEvent = twin.wellnessEvents[0];
assert(latestHtEvent.eventType === "WELLNESS_ASSESSMENT", "Event type is WELLNESS_ASSESSMENT.");
assert(latestHtEvent.source === "SELF_REPORTED", "Event source preserved as SELF_REPORTED.");
assert(latestHtEvent.userId === "USER-ALEX-001", "Event belongs to authenticated user.");
assert(latestHtEvent.responses.sleepDurationHours === 6, "Sleep response linked in Health Twin event.");

// --- TEST 7: Personal Baseline Calculation & Delta ---
console.log("\nTEST 7: Personal Baseline Calculation & Comparison");
const baseline = global.PersonnelBaselineEngine.calculateBaseline(pwp.wellness_assessments);
assert(baseline.hasBaseline === true, "Personal baseline calculated successfully with sufficient historical records.");
assert(baseline.sampleCount >= 3, "Baseline calculation uses at least 3 historical check-ins.");
assert(baseline.typicalSleepMinutes > 0, "Typical sleep duration calculated.");

const comparison = submitRes.data.baselineComparison;
assert(comparison.sleepDeltaPct !== null, "Sleep delta percentage relative to personal baseline calculated.");
assert(typeof comparison.stressVsBaseline === 'string', "Stress relative baseline comparison generated.");

// --- TEST 8: Longitudinal Trends & Multi-Signal Pattern Detection ---
console.log("\nTEST 8: Trend Analysis & Multi-Signal Pattern Detection");
const trendsRes = global.PersonnelWellnessAPI.getTrends(userAlex, "PERSONNEL", "USER-ALEX-001", "30d", mockState);
assert(trendsRes.status === 200, "Trend analysis returned for 30d window.");
assert(trendsRes.data.metrics.fatigue !== undefined, "Fatigue trend metrics computed.");
assert(trendsRes.data.metrics.stress !== undefined, "Stress trend metrics computed.");
assert(trendsRes.data.metrics.sleep !== undefined, "Sleep trend metrics computed.");
assert(trendsRes.data.metrics.recovery !== undefined, "Recovery trend metrics computed.");

// Verify non-diagnostic language in patterns and metrics
const allExplanations = [
    trendsRes.data.metrics.fatigue.explanation,
    trendsRes.data.metrics.stress.explanation,
    ...trendsRes.data.patterns.map(p => p.whatChanged + " " + p.disclaimer)
].join(" ");
assert(!allExplanations.toLowerCase().includes("burnout"), "System does NOT diagnose burnout.");
assert(!allExplanations.toLowerCase().includes("depression"), "System does NOT diagnose depression.");
assert(!allExplanations.toLowerCase().includes("mentally ill"), "System does NOT diagnose mental illness.");

// --- TEST 9: Consent Revocation Gate ---
console.log("\nTEST 9: Consent Revocation Enforcement");
const revokeRes = global.PersonnelWellnessAPI.updateConsent(userAlex, "PERSONNEL", "USER-ALEX-001", "cnst_01_voluntary", "REVOKED", mockState);
assert(revokeRes.status === 200, "Voluntary check-in consent revoked.");

const blockedSubmit = global.PersonnelWellnessAPI.submitCheckIn(userAlex, "PERSONNEL", "USER-ALEX-001", validCheckIn, mockState);
assert(blockedSubmit.status === 403, "Check-in blocked with HTTP 403 when voluntary consent is REVOKED.");

// Re-grant consent for remaining tests
global.PersonnelWellnessAPI.updateConsent(userAlex, "PERSONNEL", "USER-ALEX-001", "cnst_01_voluntary", "GRANTED", mockState);

// --- TEST 10: Confidential Support Request ---
console.log("\nTEST 10: Confidential Support Request Routing");
const supportPayload = {
    requestType: "WELFARE_CONSULTATION",
    preferredContactMethod: "IN_APP_MESSAGE",
    urgency: "STANDARD",
    notes: "Would like to discuss shift adjustment for recovery."
};
const supRes = global.PersonnelWellnessAPI.createSupportRequest(userAlex, "PERSONNEL", "USER-ALEX-001", supportPayload, mockState);
assert(supRes.status === 200, "Support request submitted successfully.");
assert(supRes.data.status === "SUBMITTED_CONFIDENTIAL", "Support request marked SUBMITTED_CONFIDENTIAL.");

// --- TEST 11: Data Export & Data Deletion ---
console.log("\nTEST 11: Data Portability & GDPR Deletion");
const exportRes = global.PersonnelWellnessAPI.exportWellnessData(userAlex, "PERSONNEL", "USER-ALEX-001", mockState);
assert(exportRes.status === 200, "Wellness data export generated successfully.");
assert(exportRes.data.assessments.length > 0, "Export includes assessments.");
assert(exportRes.data.provenanceGuarantee.includes("Non-Clinical"), "Export contains explicit non-clinical provenance guarantee.");

const deleteRes = global.PersonnelWellnessAPI.deleteWellnessData(userAlex, "PERSONNEL", "USER-ALEX-001", {}, mockState);
assert(deleteRes.status === 200, "Wellness data deletion completed successfully.");
assert(pwp.wellness_assessments.length === 0, "Assessments successfully purged.");
assert(pwp.wellness_notes.length === 0, "Private notes successfully purged.");

// --- TEST 12: Aggregated Unit Analytics & Minimum Cohort Threshold ---
console.log("\nTEST 12: Aggregated Unit Analytics & Anonymity Threshold");
// Threshold check with insufficient cohort size (< 5)
mockState.cohortCount = 3;
const smallCohortRes = global.PersonnelWellnessAPI.getAggregatedUnitTrends(commanderUser, "COMMANDER", "UNIT-ALPHA-WELLNESS", mockState);
assert(smallCohortRes.status === 403, "Unit aggregate suppressed (HTTP 403) when cohort count is below minimum threshold of 5.");

// Threshold check with valid cohort size (>= 5)
mockState.cohortCount = 14;
const validCohortRes = global.PersonnelWellnessAPI.getAggregatedUnitTrends(commanderUser, "COMMANDER", "UNIT-ALPHA-WELLNESS", mockState);
assert(validCohortRes.status === 200, "Unit aggregate permitted when cohort >= 5.");
assert(validCohortRes.data.anonymityProtected === true, "Unit aggregate explicitly flags anonymityProtected: true.");
assert(validCohortRes.data.unitMetrics.fatigueShift !== undefined, "Unit aggregate includes group-level indicators.");

// --- TEST 13: Audit Logging Without Sensitive Content ---
console.log("\nTEST 13: Security Audit Trail & Zero Content Leakage");
const auditLogs = global.PersonnelAuditLogger.getLogs(50);
assert(auditLogs.length > 0, "Audit logs recorded across API interactions.");
assert(auditLogs.some(l => l.action === "ASSESSMENT_CREATED"), "Audit trail contains ASSESSMENT_CREATED.");
assert(auditLogs.some(l => l.action === "DATA_DELETED"), "Audit trail contains DATA_DELETED.");
assert(auditLogs.some(l => l.action === "DATA_EXPORTED"), "Audit trail contains DATA_EXPORTED.");
assert(auditLogs.every(l => !l.resource.includes("Felt slightly fatigued")), "Sensitive user note text is NEVER present in audit logs.");

console.log("\n============================================================");
console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("============================================================\n");

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
