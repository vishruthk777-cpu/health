/**
 * LIFEOS AI - REGISTRATION, PERSISTENCE & PERSONNEL WELLNESS PROFILE TEST SUITE
 * Validates SQLite persistence, REST endpoints, session authentication, and RBAC
 */

const { server, db } = require('../server.js');
const http = require('node:http');

let port = 8099;
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

async function runTests() {
    console.log("\n============================================================");
    console.log("RUNNING REGISTRATION, PERSISTENCE & PROFILE TEST SUITE");
    console.log("============================================================\n");

    let passed = 0;
    let failed = 0;

    function recordPass(desc) {
        passed++;
    }

    try {
        await new Promise(resolve => {
            testServer = server.listen(port, () => resolve());
        });

        // Clean test records from DB for fresh test run
        db.exec(`
            DELETE FROM audit_logs;
            DELETE FROM wellness_notes;
            DELETE FROM wellness_assessments;
            DELETE FROM personnel_profiles;
            DELETE FROM sessions;
            DELETE FROM consents;
            DELETE FROM users;
        `);

        // TEST 1: Registration Validation Failures
        console.log("TEST 1: Server-Side Registration Validation & Error Handling");

        // 1.1 Missing full name
        let res = await request('POST', '/api/registration', {
            email: 'test@lifeos.ai',
            phone: '5551234567',
            privacyConsent: true
        });
        assert(res.status === 400, "Missing full name returns HTTP 400");
        assert(res.data.error.code === 'VALIDATION_ERROR', "Error code is VALIDATION_ERROR");
        recordPass();

        // 1.2 Invalid email format
        res = await request('POST', '/api/registration', {
            fullName: 'Sarah Connor',
            email: 'invalid-email-format',
            phone: '5551234567',
            privacyConsent: true
        });
        assert(res.status === 400, "Invalid email format returns HTTP 400");
        recordPass();

        // 1.3 Missing privacy consent
        res = await request('POST', '/api/registration', {
            fullName: 'Sarah Connor',
            email: 'sarah.connor@defense.gov',
            phone: '5551234567',
            privacyConsent: false
        });
        assert(res.status === 400, "Unconsented privacy returns HTTP 400");
        assert(res.data.error.code === 'CONSENT_REQUIRED', "Error code is CONSENT_REQUIRED");
        recordPass();

        // 1.4 Honeypot bot protection
        res = await request('POST', '/api/registration', {
            fullName: 'Bot User',
            email: 'bot@spam.com',
            phone: '5551234567',
            privacyConsent: true,
            honeypot: 'i am a spam bot'
        });
        assert(res.status === 400, "Honeypot payload rejected with HTTP 400");
        assert(res.data.error.code === 'SECURITY_ERROR', "Honeypot returns SECURITY_ERROR");
        recordPass();

        // TEST 2: Valid Registration & SQLite Database Persistence
        console.log("\nTEST 2: Valid Registration & Full SQLite Persistence");

        const regPayload = {
            fullName: 'Commander Sarah Connor',
            email: 'sarah.connor@defense.gov',
            countryCode: '+1',
            phone: '(555) 432-1098',
            country: 'United States',
            role: 'Personnel',
            organization: 'Joint Medical Command',
            message: 'Strategic readiness onboarding',
            privacyConsent: true,
            emailOptIn: true,
            whatsAppOptIn: true,
            serviceBranch: 'Defense Healthcare Agency',
            dutyType: 'Operational Support',
            rankCategory: 'Commander'
        };

        res = await request('POST', '/api/registration', regPayload);
        assert(res.status === 201, "Registration succeeds with HTTP 201 Created");
        assert(res.data.success === true, "Response reports success: true");
        assert(res.data.token && res.data.token.length === 64, "Issued 64-char cryptographic session token");
        assert(res.data.user.fullName === 'Commander Sarah Connor', "User record preserves full name");
        assert(res.data.user.email === 'sarah.connor@defense.gov', "User record stores lowercase email");
        assert(res.data.user.role === 'personnel', "Role assigned as personnel");
        assert(res.data.profile.dutyType === 'Operational Support', "Profile dutyType saved accurately");
        assert(res.data.message === "Registration complete. Your Personnel Wellness Profile is ready.", "User-friendly success message returned");
        recordPass();

        const sarahToken = res.data.token;
        const sarahUserId = res.data.user.id;

        // Verify SQLite row was actually persisted
        const userRow = db.prepare(`SELECT * FROM users WHERE email = ?`).get('sarah.connor@defense.gov');
        assert(userRow !== undefined, "User row physically exists in SQLite database");
        assert(userRow.id === sarahUserId, "User row ID matches returned ID");
        assert(userRow.organization === 'Joint Medical Command', "Organization persisted to SQLite");
        recordPass();

        // Verify consents were persisted
        const consentRows = db.prepare(`SELECT * FROM consents WHERE user_id = ?`).all(sarahUserId);
        assert(consentRows.length === 3, "All 3 consents (privacy, email, whatsapp) recorded in SQLite");
        recordPass();

        // Verify personnel profile was persisted
        const profileRow = db.prepare(`SELECT * FROM personnel_profiles WHERE user_id = ?`).get(sarahUserId);
        assert(profileRow !== undefined, "Personnel profile physically exists in SQLite");
        assert(profileRow.service_branch === 'Defense Healthcare Agency', "Service branch persisted to SQLite");
        assert(profileRow.rank_category === 'Commander', "Rank category persisted to SQLite");
        recordPass();

        // TEST 3: Duplicate Registration Prevention
        console.log("\nTEST 3: Duplicate Account Prevention");

        res = await request('POST', '/api/registration', regPayload);
        assert(res.status === 409, "Duplicate registration rejected with HTTP 409 Conflict");
        assert(res.data.error.code === 'DUPLICATE_ACCOUNT', "Error code is DUPLICATE_ACCOUNT");
        assert(res.data.error.message.includes("already exists"), "Friendly message guides user to sign in");
        recordPass();

        // TEST 4: Role Privilege Escalation Prevention
        console.log("\nTEST 4: Role Privilege Escalation Prevention");

        // Attacker attempts to register with role 'admin' or 'doctor'
        res = await request('POST', '/api/registration', {
            fullName: 'Hacker Joe',
            email: 'hacker@malicious.org',
            phone: '5559998888',
            role: 'Admin', // Exploit attempt
            privacyConsent: true
        });
        assert(res.status === 201, "Registration succeeds without crashing");
        assert(res.data.user.role === 'personnel', "Privilege escalation blocked: 'Admin' mapped to 'personnel'");
        recordPass();

        // TEST 5: Authenticated Session Verification & Route Protection
        console.log("\nTEST 5: Authenticated Session & Route Protection");

        // 5.1 Request without session token
        res = await request('GET', '/api/auth/session');
        assert(res.status === 401, "Unauthenticated session request returns HTTP 401");
        recordPass();

        // 5.2 Request with invalid token
        res = await request('GET', '/api/auth/session', null, {
            'Authorization': 'Bearer deadbeefcafebabe1234567890'
        });
        assert(res.status === 401, "Forged token rejected with HTTP 401");
        recordPass();

        // 5.3 Request with valid token
        res = await request('GET', '/api/auth/session', null, {
            'Authorization': `Bearer ${sarahToken}`
        });
        assert(res.status === 200, "Valid session token returns HTTP 200 OK");
        assert(res.data.user.email === 'sarah.connor@defense.gov', "Session maps to Sarah Connor");
        assert(res.data.profile.serviceBranch === 'Defense Healthcare Agency', "Profile retrieved accurately");
        recordPass();

        // TEST 6: Personnel Wellness Profile Fetching & Editing
        console.log("\nTEST 6: Personnel Wellness Profile Fetching & Editing (Persistence)");

        // 6.1 Get Profile
        res = await request('GET', '/api/personnel/profile', null, {
            'Authorization': `Bearer ${sarahToken}`
        });
        assert(res.status === 200, "GET /api/personnel/profile returns HTTP 200");
        assert(res.data.profile.userId === sarahUserId, "Profile user ID matches session");
        assert(res.data.profile.profileCompletion > 0, "Calculated real profile completion percentage");
        recordPass();

        // 6.2 Edit Profile (PUT)
        const updatePayload = {
            serviceBranch: 'Joint Special Operations Command',
            dutyType: 'Forward Deployed Logistics',
            scheduleType: 'Rotating 12h Shift',
            avgHoursPerWeek: 48.0,
            shiftPattern: '4 Days On / 3 Days Off',
            workloadIndex: 1.35,
            operationalEnvironment: 'Maritime High Humidity'
        };

        res = await request('PUT', '/api/personnel/profile', updatePayload, {
            'Authorization': `Bearer ${sarahToken}`
        });
        assert(res.status === 200, "PUT /api/personnel/profile returns HTTP 200");
        assert(res.data.profile.serviceBranch === 'Joint Special Operations Command', "Updated branch returned");
        assert(res.data.profile.avgHoursPerWeek === 48, "Updated weekly hours returned");
        assert(res.data.profile.operationalEnvironment === 'Maritime High Humidity', "Updated environment returned");
        recordPass();

        // 6.3 Verify persistence in SQLite after re-querying
        const checkRow = db.prepare(`SELECT * FROM personnel_profiles WHERE user_id = ?`).get(sarahUserId);
        assert(checkRow.service_branch === 'Joint Special Operations Command', "SQLite reflects updated service branch");
        assert(checkRow.avg_hours_per_week === 48.0, "SQLite reflects updated hours per week");
        recordPass();

        // TEST 7: Cross-User Isolation
        console.log("\nTEST 7: Cross-User Authorization Isolation");

        // Register second user: John Connor
        const johnRes = await request('POST', '/api/registration', {
            fullName: 'Lieutenant John Connor',
            email: 'john.connor@defense.gov',
            phone: '5552345678',
            role: 'Personnel',
            privacyConsent: true
        });
        assert(johnRes.status === 201, "Second user registered");
        const johnToken = johnRes.data.token;
        const johnUserId = johnRes.data.user.id;

        // Verify John's profile fetch returns John's data, NOT Sarah's
        res = await request('GET', '/api/personnel/profile', null, {
            'Authorization': `Bearer ${johnToken}`
        });
        assert(res.status === 200, "John retrieves own profile");
        assert(res.data.profile.userId === johnUserId, "Profile is strictly John's");
        assert(res.data.profile.userId !== sarahUserId, "Cross-user leakage prevented");
        recordPass();

        // TEST 8: Unit Commander Aggregated Anonymity Threshold (>= 5)
        console.log("\nTEST 8: Unit Commander Aggregation & Anonymity Threshold (>= 5)");

        // Currently we have 3 personnel users in DB: Sarah, Hacker Joe, John (< 5)
        res = await request('GET', '/api/commander/unit-trends', null, {
            'Authorization': `Bearer ${sarahToken}`
        });
        assert(res.status === 403, "Unit aggregation BLOCKED (HTTP 403) when cohort < 5 personnel");
        assert(res.data.error.code === 'ANONYMITY_THRESHOLD_NOT_MET', "Anonymity threshold code returned");
        recordPass();

        // Add 2 more personnel to meet threshold of 5
        await request('POST', '/api/registration', { fullName: 'Personnel 4', email: 'p4@unit.org', phone: '5550000004', privacyConsent: true });
        await request('POST', '/api/registration', { fullName: 'Personnel 5', email: 'p5@unit.org', phone: '5550000005', privacyConsent: true });

        // Now cohort >= 5, aggregation is permitted
        res = await request('GET', '/api/commander/unit-trends', null, {
            'Authorization': `Bearer ${sarahToken}`
        });
        assert(res.status === 200, "Unit aggregation ALLOWED when cohort >= 5");
        assert(res.data.anonymityProtected === true, "anonymityProtected is true");
        assert(res.data.disclaimer.includes("suppressed"), "Disclaimer explicitly confirms individual names/notes suppressed");
        recordPass();

        // TEST 9: Audit Trail Integrity
        console.log("\nTEST 9: Security Audit Logging in SQLite");

        const auditRows = db.prepare(`SELECT * FROM audit_logs`).all();
        assert(auditRows.length >= 6, "Audit trail captured registration, login, and profile update events");
        const actions = auditRows.map(r => r.action);
        assert(actions.includes('USER_REGISTERED'), "Audit trail contains USER_REGISTERED");
        assert(actions.includes('PROFILE_UPDATED'), "Audit trail contains PROFILE_UPDATED");
        recordPass();

        console.log("\n============================================================");
        console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
        console.log("============================================================\n");

    } catch (err) {
        console.error("Test execution halted with error:", err);
        failed++;
    } finally {
        if (testServer) {
            testServer.close();
        }
    }

    if (failed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
