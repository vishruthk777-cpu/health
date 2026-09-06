// =============================================================================
// PRODUCTION END-TO-END HEALTH TWIN INGESTION TEST SUITE
// Tests all 31 acceptance criteria from the LifeOS AI specification
// =============================================================================

const http = require('http');
const crypto = require('crypto');
const assert = require('assert');

function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

let passed = 0;
let failed = 0;

function it(desc, fn) {
    return fn()
        .then(() => {
            console.log(`  ✓ ${desc}`);
            passed++;
        })
        .catch((err) => {
            console.error(`  ✗ ${desc}`);
            console.error(`    ${err.message}`);
            failed++;
        });
}

async function runSuite() {
    console.log('\n===============================================================');
    console.log('  STARTING PRODUCTION HEALTH TWIN DOCUMENT INGESTION TEST SUITE');
    console.log('===============================================================\n');

    // 1. Setup two test users for isolation testing
    const emailA = `patient_alpha_${Date.now()}@lifeos.test`;
    const emailB = `patient_beta_${Date.now()}@lifeos.test`;
    let tokenA = '';
    let userAId = '';
    let tokenB = '';
    let userBId = '';

    await it('Registers User Alpha', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/registration',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            fullName: 'Alpha Patient',
            email: emailA,
            phone: '+1 555-0101',
            country: 'United States',
            role: 'patient',
            organization: 'Personal Health Vault',
            privacyConsent: true,
            emailOptIn: true
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        tokenA = res.body.token;
        userAId = res.body.user.id;
        assert(tokenA && userAId);
    });

    await it('Registers User Beta', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/registration',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            fullName: 'Beta Patient',
            email: emailB,
            phone: '+1 555-0102',
            country: 'United States',
            role: 'patient',
            organization: 'Personal Health Vault',
            privacyConsent: true,
            emailOptIn: true
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        tokenB = res.body.token;
        userBId = res.body.user.id;
        assert(tokenB && userBId);
    });

    // 2. Initial state verification: twin should have zero fake data and unavailable metrics
    await it('Initial Health Twin shows zero fake data and insufficient data state', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/twin',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        const twin = res.body.twin;
        assert.strictEqual(twin.documents.length, 0);
        assert.strictEqual(twin.prescriptions.length, 0);
        assert.strictEqual(twin.biomarkers.length, 0);
        assert.strictEqual(twin.vitals.length, 0);
        assert.strictEqual(twin.diagnoses.length, 0);
        assert.strictEqual(twin.summary.overallQualityScore, 0);
        assert.strictEqual(twin.summary.biomarkerCount, 0);
    });

    // 3. Upload a clean clinical prescription document
    const prescriptionText = `
PRESCRIPTION ORDER
Patient Name: Alpha Patient
Doctor: Dr. Elizabeth Vance, MD
Clinic: St. Jude Heart Institute
Date: 2026-08-10

Rx:
1. Metformin 500 mg - Take 1 tablet twice daily with meals for 90 days.
2. Atorvastatin 20 mg - Take 1 tablet daily at bedtime for 90 days.

Vitals:
Blood Pressure: 122/78 mmHg
Pulse: 72 bpm

Instructions: Monitor blood glucose regularly.
    `.trim();

    let docAId = '';
    await it('Uploads prescription document for User Alpha', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/documents',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            }
        }, {
            fileName: 'prescription_vance_2026.txt',
            fileData: Buffer.from(prescriptionText, 'utf8').toString('base64'),
            mimeType: 'text/plain',
            isBase64: true
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.document.scanStatus, 'CLEAN');
        docAId = res.body.document.id;
        assert(docAId);
    });

    // 4. Duplicate document detection
    await it('Detects duplicate document upload via SHA-256 and returns 409', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/documents',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            }
        }, {
            fileName: 'prescription_vance_duplicate.txt',
            fileData: Buffer.from(prescriptionText, 'utf8').toString('base64'),
            mimeType: 'text/plain',
            isBase64: true
        });
        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.isDuplicate, true);
        assert.strictEqual(res.body.document.id, docAId);
    });

    // 5. User Isolation: User B cannot access User A document
    await it('Enforces user isolation: User Beta cannot access User Alpha document', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: `/api/health-twin/documents/${docAId}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenB}` }
        });
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.body.success, false);
    });

    // 6. Process document OCR & clinical extraction
    let extractionResult = null;
    await it('Processes document and extracts clinical data with provenance', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: `/api/health-twin/documents/${docAId}/process`,
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        extractionResult = res.body;

        // Verify extraction without fabrication
        assert(extractionResult.extracted.clinician.includes('Dr. Elizabeth Vance, MD'));
        assert.strictEqual(extractionResult.extracted.facility, 'St. Jude Heart Institute');
        assert.strictEqual(extractionResult.extracted.reportDate, '2026-08-10');
        assert.strictEqual(extractionResult.extracted.prescriptions.length, 2);
        assert.strictEqual(extractionResult.extracted.prescriptions[0].medicationName, 'Metformin');
        assert.strictEqual(extractionResult.extracted.prescriptions[0].strength, '500 mg');
        assert.strictEqual(extractionResult.extracted.prescriptions[1].medicationName, 'Atorvastatin');
        assert.strictEqual(extractionResult.extracted.prescriptions[1].strength, '20 mg');
        assert.strictEqual(extractionResult.extracted.vitals.length, 2);

        // Verify AI Safety rule: Metformin did NOT fabricate diabetes diagnosis
        assert.strictEqual(extractionResult.extracted.diagnoses.length, 0);
    });

    // 7. Store extracted observations into Health Twin with provenance
    let obsBpId = '';
    await it('Stores extracted clinical observations with confidence and provenance', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/observations',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            }
        }, {
            category: 'vital',
            metric: 'Blood Pressure',
            value: '122/78',
            unit: 'mmHg',
            referenceRange: '< 120/80 mmHg',
            abnormalFlag: 'NORMAL',
            sourceDocumentId: docAId,
            sourceProvider: 'St. Jude Heart Institute',
            observedAt: '2026-08-10',
            confidence: 96,
            verificationStatus: 'VERIFIED'
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        const obs = res.body.observation || res.body.observations?.[0];
        assert(obs && obs.id);
        obsBpId = obs.id;
    });

    // 8. Human Verification (Accept / Edit / Reject)
    await it('Allows human verification and correction of extracted observation', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: `/api/health-twin/observations/${obsBpId}/verify`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            }
        }, {
            action: 'EDIT',
            correctedValue: '120/80',
            notes: 'Patient verified against manual cuff reading'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.observation.value, '120/80');
        assert.strictEqual(res.body.observation.status, 'USER_CORRECTED');
    });

    // 9. Confirm prescription into active patient profile
    await it('Confirms prescription into patient medication list with provenance', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/prescriptions/confirm',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            }
        }, {
            documentId: docAId,
            clinicianName: 'Dr. Elizabeth Vance, MD',
            facilityName: 'St. Jude Heart Institute',
            issueDate: '2026-08-10',
            medications: extractionResult.extracted.prescriptions,
            diagnoses: []
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert(res.body.prescription.medications.some(m => m.medicationName === 'Metformin'));
        assert(res.body.prescription.medications.some(m => m.medicationName === 'Atorvastatin'));
    });

    // 10. Upload a diagnostic laboratory report
    const labReportText = `
METABOLIC & LIPID DIAGNOSTIC PANEL
Patient: Alpha Patient
Ordering Physician: Dr. Elizabeth Vance
Laboratory: Quest Diagnostics Regional
Collection Date: 2026-08-11
Report Date: 2026-08-12

TEST RESULTS:
Fasting Glucose: 94 mg/dL (Ref: 70 - 99 mg/dL)
Hemoglobin A1c: 5.4 % (Ref: 4.0 - 5.6 %)
Total Cholesterol: 185 mg/dL (Ref: < 200 mg/dL)
Apolipoprotein B: 78 mg/dL (Ref: 60 - 90 mg/dL)
High-Sensitivity CRP: 0.8 mg/L (Ref: < 1.0 mg/L)
Serum Creatinine: 0.92 mg/dL (Ref: 0.70 - 1.30 mg/dL)
ALT: 24 U/L (Ref: 7 - 56 U/L)
    `.trim();

    let labDocId = '';
    await it('Uploads diagnostic laboratory panel', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/documents',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            }
        }, {
            fileName: 'quest_metabolic_panel_2026.txt',
            fileData: Buffer.from(labReportText, 'utf8').toString('base64'),
            mimeType: 'text/plain',
            isBase64: true
        });
        assert.strictEqual(res.status, 201);
        labDocId = res.body.document.id;
        assert(labDocId);
    });

    let labExtraction = null;
    await it('Extracts biomarkers with clinical flags and reference ranges', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: `/api/health-twin/documents/${labDocId}/process`,
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assert.strictEqual(res.status, 200);
        labExtraction = res.body.extracted;
        assert(labExtraction.labs.length >= 5);

        const hba1c = labExtraction.labs.find(l => l.testName === 'Hemoglobin A1c');
        assert(hba1c);
        assert.strictEqual(hba1c.value, 5.4);
        assert.strictEqual(hba1c.unit, '%');

        const glucose = labExtraction.labs.find(l => l.testName === 'Fasting Glucose');
        assert(glucose);
        assert.strictEqual(glucose.value, 94);
    });

    await it('Persists extracted laboratory biomarkers to SQLite health_observations', async () => {
        for (const lab of labExtraction.labs) {
            const res = await makeRequest({
                hostname: 'localhost',
                port: 8000,
                path: '/api/health-twin/observations',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenA}`,
                    'Content-Type': 'application/json'
                }
            }, {
                category: 'lab',
                metric: lab.testName,
                value: lab.value,
                unit: lab.unit,
                referenceRange: lab.referenceRange,
                abnormalFlag: lab.abnormalFlag,
                sourceDocumentId: labDocId,
                sourceProvider: 'Quest Diagnostics Regional',
                observedAt: '2026-08-11',
                confidence: 96,
                verificationStatus: 'VERIFIED'
            });
            assert.strictEqual(res.status, 201);
        }
    });

    // 11. Timeline event generation
    await it('Generates chronological health timeline from documents and clinical events', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/timeline',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert(res.body.events.length >= 2);
        assert(res.body.events.some(e => e.type === 'PRESCRIPTION_CONFIRMED' || e.eventType === 'PRESCRIPTION'));
        assert(res.body.events.some(e => e.type === 'DOCUMENT_UPLOAD' || e.eventType === 'DOCUMENT_INGESTED'));
    });

    // 12. Full Hydrated Twin State & Organ Mapping
    await it('Hydrates updated Health Twin with organ mapping and real data coverage', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/twin',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assert.strictEqual(res.status, 200);
        const twin = res.body.twin;

        // Verified documents & prescriptions
        assert(twin.documents.length >= 2);
        assert(twin.prescriptions.length >= 1);
        assert(twin.biomarkers.length >= 5);
        assert(twin.vitals.length >= 1);

        // Organ system mapping
        assert(twin.organs.heart.biomarkers.some(b => /cholesterol|apob/i.test(b.metric)));
        assert(twin.organs.heart.vitals.some(v => /blood pressure/i.test(v.metric)));
        assert(twin.organs.pancreas.biomarkers.some(b => /glucose|hba1c/i.test(b.metric)));
        assert(twin.organs.kidneys.biomarkers.some(b => /creatinine/i.test(b.metric)));
        assert(twin.organs.liver.biomarkers.some(b => /alt/i.test(b.metric)));
        assert(twin.organs.vascular.biomarkers.some(b => /crp/i.test(b.metric)));

        // Data quality score
        assert(twin.summary.overallQualityScore > 0);
        assert(twin.summary.overallQualityScore >= 50);
        assert.strictEqual(twin.summary.medicationCount, 2);
    });

    // 13. Re-verify User Beta isolation
    await it('Ensures User Beta Health Twin remains completely unpolluted', async () => {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 8000,
            path: '/api/health-twin/twin',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${tokenB}` }
        });
        assert.strictEqual(res.status, 200);
        const twin = res.body.twin;
        assert.strictEqual(twin.documents.length, 0);
        assert.strictEqual(twin.prescriptions.length, 0);
        assert.strictEqual(twin.biomarkers.length, 0);
        assert.strictEqual(twin.vitals.length, 0);
        assert.strictEqual(twin.summary.overallQualityScore, 0);
    });

    console.log('\n===============================================================');
    console.log(`  PRODUCTION INGESTION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
