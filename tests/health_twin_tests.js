/* =========================================================================
   LIFEOS AI - HEALTH TWIN & WEARABLES DATA PLATFORM TEST SUITE
   =========================================================================
   This test suite runs under Node.js to verify:
   1. Authenticated patient data isolation & RBAC.
   2. Zero-fake-data enforcement (no random numbers, no hardcoded scores).
   3. Document upload, OCR extraction, and wrong OCR manual correction audit trail.
   4. Data provenance tracking & Data Quality engine.
   5. Conflict detection & deduplication engine.
   6. Unit normalization engine (lb -> kg, °F -> °C, mmol/L -> mg/dL).
   7. Device Sync Hub & real connection states.
   8. Scientific derivation engine (Health Index, Risk, Epigenetic Age, Longevity Gap).
   9. Missing Data engine & organ map query resolution.
   ========================================================================= */

const fs = require('fs');
const path = require('path');

// Setup minimal browser DOM environment for Node.js test execution
global.window = global;
global.document = {
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        setAttribute: () => {},
        appendChild: () => {},
        addEventListener: () => {}
    }),
    body: {
        appendChild: () => {},
        removeChild: () => {}
    }
};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};
global.crypto = {
    subtle: {
        digest: async (algo, buffer) => {
            const cryptoModule = require('crypto');
            return cryptoModule.createHash('sha256').update(Buffer.from(buffer)).digest();
        }
    }
};
global.lucide = { createIcons: () => {} };

// Load modules into Node Environment
const apiPath = path.join(__dirname, '..', 'js', 'personnel_wellness_api.js');
const apiCode = fs.readFileSync(apiPath, 'utf8');
eval(apiCode);

const dbPath = path.join(__dirname, '..', 'js', 'dashboard.js');
const dbCode = fs.readFileSync(dbPath, 'utf8');
eval(dbCode);

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
console.log("RUNNING HEALTH TWIN & WEARABLES PRODUCTION PLATFORM TEST SUITE");
console.log("============================================================\n");

async function runTests() {
    // TEST 1: Authenticated Patient Context & Cross-User Isolation
    console.log("TEST 1: Authenticated Patient Context & Cross-User Isolation");
    const unauthRes = global.HealthTwinAPI.getTwin(null, "USER-ALEX-001");
    assert(unauthRes.status === 401, "Unauthenticated request to get Twin returns HTTP 401.");

    const crossUserRes = global.HealthTwinAPI.getTwin({ id: "USER-BOB-002" }, "USER-ALEX-001");
    assert(crossUserRes.status === 403, "User requesting another patient's Health Twin returns HTTP 403.");

    const ownerUser = { id: "USER-ALEX-001", email: "alex@lifeos.ai" };
    const ownerRes = global.HealthTwinAPI.getTwin(ownerUser, "USER-ALEX-001");
    assert(ownerRes.status === 200, "Authenticated owner user accessing own Health Twin returns HTTP 200.");
    assert(ownerRes.data.patientProfile.patientId === "USER-ALEX-001", "Returned Twin belongs to authenticated patient.");

    // TEST 2: Zero Fake Data Default State Enforcement
    console.log("\nTEST 2: Zero Fake Data Default State Enforcement");
    const twinData = ownerRes.data;
    assert(twinData.healthScore === null, "Default Health Index is null / uncalculated.");
    assert(twinData.riskScore === null, "Default Disease Risk is null / uncalculated.");
    assert(twinData.biologicalAge === null, "Default Epigenetic Age is null / unavailable.");
    assert(twinData.longevityScore === null, "Default Longevity Gap is null / unavailable.");
    assert(twinData.organs.brain.cortisol === "—", "Default Brain Cortisol is unavailable placeholder '—'.");
    assert(twinData.wearables.syncStatus === "NOT CONNECTED", "Default Wearable status is 'NOT CONNECTED'.");
    assert(twinData.wearables.heartRate === null, "Default live Heart Rate is null.");

    // TEST 3: Document Processing, OCR Extraction, and Manual Correction Audit Trail
    console.log("\nTEST 3: Medical Document OCR Extraction & Manual Correction Audit Trail");
    const sampleDoc = {
        fileName: "lab_blood_panel_2026.txt",
        fileHash: "a1b2c3d4e5f67890",
        documentType: "Lab Report",
        ocrText: "Patient Name: Alex Mercer\nReport Date: 2026-08-20\nFasting Glucose: 98 mg/dL (70-99)\nHbA1c: 5.8 % (4.0-5.6)\nApolipoprotein B: 112 mg/dL (<90)",
        rawExtractions: [
            { field: "Fasting Glucose", value: 98, unit: "mg/dL", originalText: "Fasting Glucose: 98 mg/dL", page: 1, confidence: 97, status: "EXTRACTED_PENDING_REVIEW" },
            { field: "HbA1c", value: 5.8, unit: "%", originalText: "HbA1c: 5.8 %", page: 1, confidence: 97, status: "EXTRACTED_PENDING_REVIEW" },
            { field: "Apolipoprotein B", value: 112, unit: "mg/dL", originalText: "Apolipoprotein B: 112 mg/dL", page: 1, confidence: 95, status: "EXTRACTED_PENDING_REVIEW" }
        ]
    };

    const ingestRes = global.HealthTwinAPI.ingestDocument(ownerUser, "USER-ALEX-001", sampleDoc);
    assert(ingestRes.status === 200, "Document successfully ingested into pending state.");
    assert(ingestRes.data.documentId !== undefined, "Ingested document generated documentId.");

    // User corrects incorrect OCR value
    const correctionPayload = {
        documentId: ingestRes.data.documentId,
        corrections: [
            { field: "HbA1c", correctedValue: 5.7, unit: "%", reason: "User verified scan says 5.7%" }
        ]
    };
    const commitRes = global.HealthTwinAPI.commitDocumentExtractions(ownerUser, "USER-ALEX-001", correctionPayload);
    assert(commitRes.status === 200, "Document extractions committed successfully with corrections.");
    
    // Check audit trail & raw preservation
    const updatedDoc = commitRes.data.document;
    const hba1cField = updatedDoc.fields.find(f => f.field === "HbA1c");
    assert(hba1cField.originalExtraction.value === 5.8, "Original OCR extraction (5.8%) preserved immutably.");
    assert(hba1cField.correctedValue === 5.7, "Corrected value (5.7%) saved accurately.");
    assert(hba1cField.whoCorrectedIt === ownerUser.id, "User ID recorded in correction provenance.");
    assert(hba1cField.verificationStatus === "VERIFIED", "Status updated to VERIFIED.");

    // TEST 4: Data Provenance & Quality Engine
    console.log("\nTEST 4: Data Provenance & Quality Engine");
    const labsRes = global.HealthTwinAPI.getLabResults(ownerUser, "USER-ALEX-001");
    assert(labsRes.status === 200, "Lab results retrieved successfully.");
    assert(labsRes.data.length >= 3, "Labs populated from verified document.");
    
    const hba1cLab = labsRes.data.find(l => l.testName === "HbA1c");
    assert(hba1cLab.value === 5.7, "Retrieved HbA1c value reflects verified user correction.");
    assert(hba1cLab.provenance.source === "Uploaded Laboratory Report", "Provenance source accurately recorded.");
    assert(hba1cLab.provenance.documentId === ingestRes.data.documentId, "Provenance tracks originating documentId.");
    assert(hba1cLab.provenance.verificationStatus === "VERIFIED", "Provenance status is VERIFIED.");

    const qualityRes = global.HealthTwinAPI.getDataQuality(ownerUser, "USER-ALEX-001");
    assert(qualityRes.status === 200, "Data Quality score retrieved.");
    assert(qualityRes.data.medicalRecordsCoverage > 0, "Medical records coverage percentage updated.");
    assert(qualityRes.data.provenanceCount > 0, "Data provenance count tracked.");

    // TEST 5: Unit Normalization Engine
    console.log("\nTEST 5: Unit Normalization Engine");
    const rawWeightReading = {
        dataType: "weight",
        value: 154.32,
        unit: "lb",
        source: "Withings Smart Scale",
        timestamp: new Date().toISOString()
    };
    const normRes = global.HealthTwinAPI.addVitalReading(ownerUser, "USER-ALEX-001", rawWeightReading);
    assert(normRes.status === 200, "Vital reading added.");
    const recordedWeight = normRes.data;
    assert(recordedWeight.originalValue === 154.32, "Raw source value (154.32 lb) preserved.");
    assert(recordedWeight.originalUnit === "lb", "Original unit preserved.");
    assert(Math.abs(recordedWeight.normalizedValue - 70.0) < 0.1, "Weight normalized to 70 kg.");
    assert(recordedWeight.normalizedUnit === "kg", "Normalized unit set to kg.");

    const rawTempReading = {
        dataType: "temperature",
        value: 98.6,
        unit: "°F",
        source: "Thermometer",
        timestamp: new Date().toISOString()
    };
    const normTempRes = global.HealthTwinAPI.addVitalReading(ownerUser, "USER-ALEX-001", rawTempReading);
    assert(Math.abs(normTempRes.data.normalizedValue - 37.0) < 0.1, "Temperature 98.6°F normalized to 37.0°C.");

    // TEST 6: Conflict Detection & Deduplication Engine
    console.log("\nTEST 6: Conflict Detection & Deduplication Engine");
    const timestampStr = "2026-09-06T10:00:00Z";
    
    const reading1 = {
        dataType: "heart_rate",
        value: 72,
        unit: "bpm",
        source: "Apple Watch",
        timestamp: timestampStr
    };
    const reading2 = {
        dataType: "heart_rate",
        value: 76,
        unit: "bpm",
        source: "Garmin HRM",
        timestamp: timestampStr
    };
    
    global.HealthTwinAPI.addVitalReading(ownerUser, "USER-ALEX-001", reading1);
    global.HealthTwinAPI.addVitalReading(ownerUser, "USER-ALEX-001", reading2);

    const conflictsRes = global.HealthTwinAPI.getConflicts(ownerUser, "USER-ALEX-001");
    assert(conflictsRes.status === 200, "Conflicts retrieved.");
    assert(conflictsRes.data.length > 0, "Conflicting heart rate readings detected for identical timestamp.");
    assert(conflictsRes.data[0].sources.length === 2, "Both conflicting sources (Apple Watch & Garmin) preserved with provenance.");

    // Duplicate test
    const duplicateReading = {
        dataType: "heart_rate",
        value: 72,
        unit: "bpm",
        source: "Apple Watch",
        timestamp: timestampStr
    };
    const dupRes = global.HealthTwinAPI.addVitalReading(ownerUser, "USER-ALEX-001", duplicateReading);
    assert(dupRes.data.isDuplicate === true, "Exact duplicate reading detected and flagged without duplicating store.");

    // TEST 7: Device Sync Hub & Real Connection States
    console.log("\nTEST 7: Device Sync Hub & Real Connection States");
    const devicesRes = global.HealthTwinAPI.getDevices(ownerUser, "USER-ALEX-001");
    assert(devicesRes.status === 200, "Device list retrieved.");
    assert(devicesRes.data.every(d => d.connectionState === "NOT CONNECTED" || d.connectionState === "DISCONNECTED"), "All un-paired devices cleanly report NOT CONNECTED.");

    const connectRes = global.HealthTwinAPI.connectDevice(ownerUser, "USER-ALEX-001", { deviceId: "dev_apple_watch", authGrant: true });
    assert(connectRes.status === 200, "Device authorization attempt processed.");
    assert(connectRes.data.device.connectionState === "CONNECTED", "Explicitly paired device reports CONNECTED.");
    assert(connectRes.data.device.lastSync !== null, "Last sync timestamp populated upon pairing.");

    // TEST 8: Scientific Derivation Engine & Missing Data Engine
    console.log("\nTEST 8: Scientific Derivation Engine & Missing Data Engine");
    const scoreRes = global.HealthTwinAPI.calculateHealthIndex(ownerUser, "USER-ALEX-001");
    assert(scoreRes.data.calculated === true, "Health Index calculates when sufficient verified data (labs, vitals, profile) is ingested.");
    assert(scoreRes.data.inputsUsed.length > 0, "Inputs used in calculation are explicitly listed.");
    assert(scoreRes.data.limitations !== undefined, "Clinical limitations are explicitly included.");

    const epiAgeRes = global.HealthTwinAPI.getEpigeneticAge(ownerUser, "USER-ALEX-001");
    assert(epiAgeRes.data.calculated === false, "Epigenetic Age returns 'Unavailable' when no epigenetic methylation data has been uploaded.");
    assert(epiAgeRes.data.reason.includes("No validated epigenetic measurement"), "Explicit reason provided for unavailable Epigenetic Age.");

    const missingRes = global.HealthTwinAPI.getMissingData(ownerUser, "USER-ALEX-001");
    assert(missingRes.status === 200, "Missing data breakdown retrieved.");
    assert(missingRes.data.gaps.length > 0, "Identifies remaining data gaps with actionable prompts.");

    console.log("\n============================================================");
    console.log(`TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("============================================================\n");

    if (failCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error("Test execution exception:", err);
    process.exit(1);
});
