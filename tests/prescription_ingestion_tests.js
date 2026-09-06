/**
 * LIFEOS AI - PRESCRIPTION & DOCUMENT UPLOAD PIPELINE TEST SUITE
 * Validates:
 * 1. Universal hashing abstraction (pure JS SHA-256 vs Node crypto)
 * 2. Magic bytes and file format validation (%PDF, PNG, JPEG, TXT)
 * 3. Virus and Malware gate (EICAR quarantine vs clean files)
 * 4. Clinical candidate entity extraction without fabrication
 * 5. User confirmation and SQLite Health Twin ledger persistence
 */

const { server, db } = require('../server.js');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

let port = 8097;
let baseUrl = `http://localhost:${port}`;
let testServer = null;

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });

        req.on('error', err => reject(err));
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

function assert(condition, message) {
    if (!condition) {
        console.error(`  ✗ FAIL: ${message}`);
        throw new Error(message);
    }
    console.log(`  ✓ PASS: ${message}`);
}

// Pure JS SHA-256 implementation under test (identical to dashboard.js)
function sha256PureJs(bytes) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = bytes.length * 8;
    const hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    for (let i = 0; i < bytes.length; i++) {
        words[i >> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
    }
    words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
    const totalWords = (((bytes.length + 8) >> 6) + 1) * 16;
    while (words.length < totalWords) {
        words.push(0);
    }
    words[totalWords - 2] = Math.floor(asciiBitLength / maxWord);
    words[totalWords - 1] = asciiBitLength & 0xffffffff;

    const w = new Array(64);
    for (let i = 0; i < words.length; i += 16) {
        let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
        let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

        for (let j = 0; j < 64; j++) {
            if (j < 16) {
                w[j] = words[i + j] | 0;
            } else {
                const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
                const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
                w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
            }
            const ch = (e & f) ^ (~e & g);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp1 = (h + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ch + k[j] + w[j]) | 0;
            const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + maj) | 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) | 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) | 0;
        }

        hash[0] = (hash[0] + a) | 0;
        hash[1] = (hash[1] + b) | 0;
        hash[2] = (hash[2] + c) | 0;
        hash[3] = (hash[3] + d) | 0;
        hash[4] = (hash[4] + e) | 0;
        hash[5] = (hash[5] + f) | 0;
        hash[6] = (hash[6] + g) | 0;
        hash[7] = (hash[7] + h) | 0;
    }

    for (let i = 0; i < 8; i++) {
        for (let j = 3; j >= 0; j--) {
            const b = (hash[i] >> (j * 8)) & 255;
            result += (b < 16 ? '0' : '') + b.toString(16);
        }
    }
    return result;
}

async function runTests() {
    console.log("\n============================================================");
    console.log("RUNNING PRESCRIPTION & DOCUMENT UPLOAD PIPELINE TEST SUITE");
    console.log("============================================================\n");

    let passed = 0;
    let failed = 0;

    // Start isolated test server
    testServer = http.createServer(server._events.request);
    await new Promise(res => testServer.listen(port, res));

    try {
        // --- 1. PURE JS SHA-256 INTEGRITY TESTS ---
        console.log("--- TEST GROUP 1: Universal Hashing Abstraction ---");

        const testStrings = [
            "hello world",
            "LIFEOS AI SECURE CLINICAL LEDGER",
            "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
            ""
        ];

        for (const str of testStrings) {
            const buf = Buffer.from(str, 'utf8');
            const nodeHash = crypto.createHash('sha256').update(buf).digest('hex');
            const pureJsHash = sha256PureJs(new Uint8Array(buf));
            assert(nodeHash === pureJsHash, `SHA-256 match for "${str.slice(0, 20)}...": ${pureJsHash.slice(0, 12)}...`);
            passed++;
        }

        // --- 2. AUTHENTICATION & USER SETUP ---
        console.log("\n--- TEST GROUP 2: Test User & Session ---");
        const testUserEmail = `clinical_test_${Date.now()}@lifeos.mil`;
        const regRes = await request('POST', '/api/registration', {
            fullName: "Dr. Elena Rostova",
            email: testUserEmail,
            phone: "+1 555-0199",
            country: "United States",
            role: "personnel",
            organization: "Naval Medical Center",
            privacyConsent: true,
            emailOptIn: true
        });

        assert(regRes.status === 201, `Registration created (HTTP ${regRes.status})`);
        assert(regRes.data.success === true, "Registration successful");
        const sessionToken = regRes.data.token;
        const testUserId = regRes.data.user.id;
        assert(Boolean(sessionToken), `Session token generated: ${sessionToken.slice(0, 8)}...`);
        passed += 3;

        const authHeaders = { 'Authorization': `Bearer ${sessionToken}` };

        // --- 3. CLEAN DOCUMENT UPLOAD & VIRUS SCAN GATE ---
        console.log("\n--- TEST GROUP 3: Clean Prescription Ingestion ---");
        const cleanRxText = `
PRESCRIPTION ORDER
Date: 2026-03-12
Prescribing Clinician: Dr. Marcus Vance, MD
Facility: Pacific Health Center
Patient: Dr. Elena Rostova

Rx:
1. Atorvastatin 20mg - 1 tablet orally daily at bedtime for 90 days
2. Metformin 500mg - 1 tablet orally twice daily with meals for 90 days

Diagnosis: Primary Hyperlipidemia, Type 2 Diabetes Mellitus
        `.trim();

        const cleanBuffer = Buffer.from(cleanRxText, 'utf8');
        const cleanSha256 = crypto.createHash('sha256').update(cleanBuffer).digest('hex');

        const cleanUploadRes = await request('POST', '/api/documents/upload', {
            fileName: "prescriptions_march2026.txt",
            fileData: cleanBuffer.toString('base64'),
            mimeType: "text/plain",
            isBase64: true
        }, authHeaders);

        assert(cleanUploadRes.status === 201, `Clean file uploaded successfully (HTTP ${cleanUploadRes.status})`);
        assert(cleanUploadRes.data.success === true, "Upload response reports success");
        assert(cleanUploadRes.data.document.scanStatus === 'CLEAN', "Document marked CLEAN by security gateway");
        assert(cleanUploadRes.data.document.sha256 === cleanSha256, `SHA-256 hash verified: ${cleanSha256.slice(0, 16)}...`);
        
        const cleanDocId = cleanUploadRes.data.document.id;
        assert(Boolean(cleanDocId), `Clean document assigned ID: ${cleanDocId}`);

        // Verify clean document stored on disk
        const cleanOnDisk = fs.existsSync(cleanUploadRes.data.document.storagePath);
        assert(cleanOnDisk === true, `Clean document stored in private directory: ${cleanUploadRes.data.document.storagePath}`);
        passed += 6;

        // --- 4. MALWARE / EICAR SCAN GATE ---
        console.log("\n--- TEST GROUP 4: Malware Detection & Quarantine Gate ---");
        const eicarText = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
        const eicarBuffer = Buffer.from(eicarText, 'utf8');

        const malwareRes = await request('POST', '/api/documents/upload', {
            fileName: "malware_test_file.txt",
            fileData: eicarBuffer.toString('base64'),
            mimeType: "text/plain",
            isBase64: true
        }, authHeaders);

        assert(malwareRes.status === 422, `Malware upload blocked with HTTP 422 Unprocessable Entity (Got: ${malwareRes.status})`);
        assert(malwareRes.data.success === false, "Malware response reports failure");
        assert(malwareRes.data.error.code === 'MALWARE_REJECTED', `Error code is MALWARE_REJECTED (Got: ${malwareRes.data.error.code})`);

        // Check quarantine in SQLite
        const quarantinedDoc = db.prepare(`SELECT * FROM documents WHERE file_name = ? AND user_id = ? AND scan_status = 'QUARANTINED' ORDER BY created_at DESC`).get("malware_test_file.txt", testUserId);
        assert(Boolean(quarantinedDoc), "Quarantined document recorded in database with scan_status = 'QUARANTINED'");
        assert(fs.existsSync(quarantinedDoc.storage_path), "Malicious payload safely preserved in quarantine vault");

        // Attempt extraction on quarantined document -> must be blocked
        const blockedExtractRes = await request('POST', `/api/documents/${quarantinedDoc.id}/extract`, {
            documentId: quarantinedDoc.id
        }, authHeaders);
        assert(blockedExtractRes.status === 403, `Extraction on quarantined doc blocked with HTTP 403 (Got: ${blockedExtractRes.status})`);
        assert(blockedExtractRes.data.error.code === 'DOCUMENT_NOT_CLEAN', "Error code DOCUMENT_NOT_CLEAN returned");
        passed += 7;

        // --- 5. MAGIC BYTE VALIDATION ---
        console.log("\n--- TEST GROUP 5: Authoritative Magic Byte Inspection ---");
        // Spoofed PDF (claims to be PDF but lacks %PDF header)
        const fakePdfBuffer = Buffer.from("NOT_A_REAL_PDF_HEADER_THIS_IS_PLAIN_TEXT", 'utf8');
        const spoofedPdfRes = await request('POST', '/api/documents/upload', {
            fileName: "spoofed_lab_result.pdf",
            fileData: fakePdfBuffer.toString('base64'),
            mimeType: "application/pdf",
            isBase64: true
        }, authHeaders);
        assert(spoofedPdfRes.status === 400, `Spoofed PDF rejected with HTTP 400 (Got: ${spoofedPdfRes.status})`);
        assert(spoofedPdfRes.data.error.code === 'FILE_VALIDATION_FAILED', "Spoofed PDF returns FILE_VALIDATION_FAILED");

        // Legitimate PDF (starts with %PDF)
        const legitPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF", 'utf8');
        const legitPdfRes = await request('POST', '/api/documents/upload', {
            fileName: "legitimate_order.pdf",
            fileData: legitPdfBuffer.toString('base64'),
            mimeType: "application/pdf",
            isBase64: true
        }, authHeaders);
        assert(legitPdfRes.status === 201, `Legitimate PDF accepted with HTTP 201 (Got: ${legitPdfRes.status})`);
        assert(legitPdfRes.data.document.scanStatus === 'CLEAN', "Legitimate PDF marked CLEAN");

        // Spoofed PNG (claims to be PNG but lacks PNG magic bytes)
        const fakePngBuffer = Buffer.from("THIS_IS_NOT_PNG_BYTES", 'utf8');
        const spoofedPngRes = await request('POST', '/api/documents/upload', {
            fileName: "spoofed_scan.png",
            fileData: fakePngBuffer.toString('base64'),
            mimeType: "image/png",
            isBase64: true
        }, authHeaders);
        assert(spoofedPngRes.status === 400, `Spoofed PNG rejected with HTTP 400 (Got: ${spoofedPngRes.status})`);

        // Legitimate PNG header
        const legitPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
        const legitPngRes = await request('POST', '/api/documents/upload', {
            fileName: "legitimate_scan.png",
            fileData: legitPngBuffer.toString('base64'),
            mimeType: "image/png",
            isBase64: true
        }, authHeaders);
        assert(legitPngRes.status === 201, `Legitimate PNG accepted with HTTP 201 (Got: ${legitPngRes.status})`);
        passed += 6;

        // --- 6. CLINICAL FIELD EXTRACTION WITHOUT FABRICATION ---
        console.log("\n--- TEST GROUP 6: Truthful Clinical Candidate Extraction ---");
        const extractRes = await request('POST', `/api/documents/${cleanDocId}/extract`, {
            documentId: cleanDocId
        }, authHeaders);

        assert(extractRes.status === 200, `Extraction succeeded with HTTP 200 (Got: ${extractRes.status})`);
        assert(extractRes.data.success === true, "Extraction reports success");
        assert(extractRes.data.classifiedType === 'Prescription', "Document classified as Prescription");

        const ext = extractRes.data.extracted;
        assert(ext.clinician === "Dr. Marcus Vance, MD", `Clinician extracted: "${ext.clinician}"`);
        assert(ext.facility === "Pacific Health Center", `Facility extracted: "${ext.facility}"`);
        assert(ext.prescriptions.length === 2, `Extracted ${ext.prescriptions.length} medications (expected 2)`);
        
        const med1 = ext.prescriptions.find(m => m.medicationName.toLowerCase().includes('atorvastatin'));
        assert(Boolean(med1), "Atorvastatin successfully parsed");
        assert(med1.strength === "20mg", `Atorvastatin strength is 20mg (Got: ${med1.strength})`);

        const med2 = ext.prescriptions.find(m => m.medicationName.toLowerCase().includes('metformin'));
        assert(Boolean(med2), "Metformin successfully parsed");
        assert(med2.strength === "500mg", `Metformin strength is 500mg (Got: ${med2.strength})`);
        passed += 9;

        // --- 7. USER VERIFICATION & HEALTH TWIN PERSISTENCE ---
        console.log("\n--- TEST GROUP 7: User Confirmation & Health Twin Persistence ---");
        const confirmRes = await request('POST', '/api/prescriptions/confirm', {
            documentId: cleanDocId,
            clinicianName: ext.clinician,
            facilityName: ext.facility,
            issueDate: "2026-03-12",
            rxNumber: "RX-2026-NAV-0042",
            rawText: cleanRxText,
            medications: ext.prescriptions,
            diagnoses: ext.diagnoses
        }, authHeaders);

        assert(confirmRes.status === 201, `Prescription confirmation persisted with HTTP 201 (Got: ${confirmRes.status})`);
        assert(confirmRes.data.success === true, "Confirmation reports success");
        assert(confirmRes.data.prescription.status === 'CONFIRMED', "Status is CONFIRMED");
        const confirmedRxId = confirmRes.data.prescription.id;
        assert(Boolean(confirmedRxId), `Assigned Prescription ID: ${confirmedRxId}`);

        // Verify in SQLite prescriptions table
        const rowInDb = db.prepare(`SELECT * FROM prescriptions WHERE id = ?`).get(confirmedRxId);
        assert(Boolean(rowInDb), "Prescription record exists in SQLite prescriptions table");
        assert(rowInDb.document_id === cleanDocId, `Prescription linked to source document ${cleanDocId}`);
        assert(rowInDb.user_id === testUserId, `Prescription isolated to user ${testUserId}`);

        const savedMeds = JSON.parse(rowInDb.medications_json);
        assert(savedMeds.length === 2, `SQLite persisted exactly ${savedMeds.length} verified medications`);
        passed += 8;

        // --- 8. GET /api/prescriptions & GET /api/documents ---
        console.log("\n--- TEST GROUP 8: Retrieval & User Isolation ---");
        const getRxRes = await request('GET', '/api/prescriptions', null, authHeaders);
        assert(getRxRes.status === 200, `GET /api/prescriptions returned HTTP 200`);
        assert(getRxRes.data.prescriptions.length >= 1, `Retrieved ${getRxRes.data.prescriptions.length} prescriptions`);
        assert(getRxRes.data.prescriptions[0].id === confirmedRxId, "Confirmed prescription present in user records");

        const getDocsRes = await request('GET', '/api/documents', null, authHeaders);
        assert(getDocsRes.status === 200, `GET /api/documents returned HTTP 200`);
        assert(getDocsRes.data.documents.length >= 2, `Retrieved ${getDocsRes.data.documents.length} user documents`);
        passed += 5;

        console.log(`\n============================================================`);
        console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
        console.log(`============================================================\n`);

    } catch (err) {
        console.error("Test execution aborted:", err);
        failed++;
    } finally {
        if (testServer) {
            testServer.close();
        }
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
