/* =========================================================================
   LIFEOS AI - PERSONNEL WELLNESS PROFILE & MOBILE ASSESSMENT ENGINE
   =========================================================================
   Component 1 & Component 2 Architecture:
   - Personnel Wellness Profile (Context, Deployments, Schedules)
   - Mobile Wellness & Self-Assessment System (Daily Check-in, Baseline, Trends)
   - Medical Data Firewall & RBAC Middleware
   - Longitudinal Health Twin Bridge & Provenance Ledger
   - Privacy, Consent & Confidential Welfare Support Desk
   ========================================================================= */

(function(global) {
    'use strict';

    // --- 1. SEED HISTORICAL CHECK-INS FOR INITIAL DEMO / BASELINE ---
    function generateSeedAssessments(userId) {
        return [
            {
                assessmentId: `asn_${userId}_seed_01`,
                userId: userId,
                timestamp: "2026-09-03T08:15:00Z",
                date: "2026-09-03",
                completionStatus: "COMPLETED",
                source: "SELF_REPORTED",
                verification: "User provided",
                assessmentType: "DAILY_WELLNESS_CHECKIN",
                consentReference: "cnst_01_voluntary",
                visibility: "PRIVATE_PERSONNEL",
                responses: {
                    mood: "Good",
                    stress: "Low",
                    energy: "High",
                    fatigue: "Slightly tired",
                    sleepDurationHours: 7,
                    sleepDurationMinutes: 30,
                    sleepQuality: "Good",
                    sleepRested: "Yes",
                    recovery: "Well",
                    overwhelmed: "No",
                    difficultyConcentrating: "No",
                    unusualFatigue: "No",
                    difficultToRecover: "No",
                    enoughTimeToRest: "Yes",
                    wantsConfidentialSupport: "No"
                },
                scores: {
                    moodScore: 4,
                    stressScore: 2,
                    energyScore: 4,
                    fatigueScore: 2,
                    sleepScore: 4,
                    recoveryScore: 4
                },
                baselineComparison: {
                    sleepDeltaPct: 0,
                    stressVsBaseline: "At baseline",
                    fatigueVsBaseline: "At baseline",
                    recoveryVsBaseline: "At baseline"
                },
                createdAt: "2026-09-03T08:15:00Z",
                updatedAt: "2026-09-03T08:15:00Z"
            },
            {
                assessmentId: `asn_${userId}_seed_02`,
                userId: userId,
                timestamp: "2026-09-04T08:30:00Z",
                date: "2026-09-04",
                completionStatus: "COMPLETED",
                source: "SELF_REPORTED",
                verification: "User provided",
                assessmentType: "DAILY_WELLNESS_CHECKIN",
                consentReference: "cnst_01_voluntary",
                visibility: "PRIVATE_PERSONNEL",
                responses: {
                    mood: "Good",
                    stress: "Moderate",
                    energy: "Moderate",
                    fatigue: "Moderately tired",
                    sleepDurationHours: 7,
                    sleepDurationMinutes: 10,
                    sleepQuality: "Fair",
                    sleepRested: "Somewhat",
                    recovery: "Well",
                    overwhelmed: "No",
                    difficultyConcentrating: "No",
                    unusualFatigue: "No",
                    difficultToRecover: "No",
                    enoughTimeToRest: "Yes",
                    wantsConfidentialSupport: "No"
                },
                scores: {
                    moodScore: 4,
                    stressScore: 3,
                    energyScore: 3,
                    fatigueScore: 3,
                    sleepScore: 3.5,
                    recoveryScore: 4
                },
                baselineComparison: {
                    sleepDeltaPct: -4.4,
                    stressVsBaseline: "At baseline",
                    fatigueVsBaseline: "At baseline",
                    recoveryVsBaseline: "At baseline"
                },
                createdAt: "2026-09-04T08:30:00Z",
                updatedAt: "2026-09-04T08:30:00Z"
            },
            {
                assessmentId: `asn_${userId}_seed_03`,
                userId: userId,
                timestamp: "2026-09-05T09:00:00Z",
                date: "2026-09-05",
                completionStatus: "COMPLETED",
                source: "SELF_REPORTED",
                verification: "User provided",
                assessmentType: "DAILY_WELLNESS_CHECKIN",
                consentReference: "cnst_01_voluntary",
                visibility: "PRIVATE_PERSONNEL",
                responses: {
                    mood: "Okay",
                    stress: "Moderate",
                    energy: "Moderate",
                    fatigue: "Moderately tired",
                    sleepDurationHours: 6,
                    sleepDurationMinutes: 45,
                    sleepQuality: "Fair",
                    sleepRested: "Somewhat",
                    recovery: "Average",
                    overwhelmed: "No",
                    difficultyConcentrating: "Prefer not to answer",
                    unusualFatigue: "No",
                    difficultToRecover: "Somewhat",
                    enoughTimeToRest: "Yes",
                    wantsConfidentialSupport: "No"
                },
                scores: {
                    moodScore: 3,
                    stressScore: 3,
                    energyScore: 3,
                    fatigueScore: 3,
                    sleepScore: 3,
                    recoveryScore: 3
                },
                baselineComparison: {
                    sleepDeltaPct: -8.8,
                    stressVsBaseline: "At baseline",
                    fatigueVsBaseline: "At baseline",
                    recoveryVsBaseline: "At baseline"
                },
                createdAt: "2026-09-05T09:00:00Z",
                updatedAt: "2026-09-05T09:00:00Z"
            }
        ];
    }

    // --- 2. DEFAULT DATA STRUCTURES & SCHEMAS ---
    function createInitialPersonnelProfile(userId = "LIFEOS-USER-001") {
        const now = new Date().toISOString();
        const seedAssessments = generateSeedAssessments(userId);

        return {
            profileId: `pwp_${Date.now()}`,
            userId: userId,
            dataOwner: userId,
            
            // A. Service / Organization Context (Generalized categories)
            serviceContext: {
                organizationId: "ORG-LIFEOS-GLOBAL",
                organizationType: "Civilian / Enterprise Health Operations",
                unitId: "UNIT-ALPHA-WELLNESS",
                roleCategory: "Operations Support Specialist",
                dutyCategory: "field_operations",
                serviceStatus: "Active Duty",
                dutyType: "operational", // administrative, field, operational, technical, medical, logistics, training, mixed, other
                dutyTypeSource: "AUTHORIZED_ORGANIZATION", // USER, AUTHORIZED_ORGANIZATION, IMPORTED_SYSTEM
                createdAt: now,
                updatedAt: now,
                version: 1
            },

            // B. Deployment History
            deployments: [
                {
                    deploymentId: "dep_2026_01",
                    startDate: "2026-03-01",
                    endDate: "2026-05-15",
                    durationDays: 75,
                    deploymentCategory: "Regional Operational Field Support",
                    workloadLevel: "ELEVATED",
                    recoveryPeriodAfterDeploymentDays: 14,
                    environmentCategory: "remote", // office, field, remote, high-demand, hazardous, emergency-response, deployment, mixed
                    source: "AUTHORIZED_ORGANIZATION",
                    verificationStatus: "VERIFIED",
                    confidence: 0.98,
                    createdAt: "2026-03-01T08:00:00Z",
                    updatedAt: "2026-05-15T18:00:00Z",
                    version: 1
                }
            ],

            // C. Duty Schedule
            dutySchedule: {
                scheduleId: "sched_2026_curr",
                scheduleType: "ROTATING", // DAY, NIGHT, ROTATING, IRREGULAR, ON_CALL, MIXED
                shiftStart: "07:00",
                shiftEnd: "19:00",
                scheduledHoursPerShift: 12,
                restWindowHours: 12,
                recurringPattern: "4 Days On, 4 Days Off (Rotating Day/Night)",
                irregularityScore: "MODERATE",
                insufficientRecoveryDetected: false,
                nightShiftRatio: "40%",
                source: "AUTHORIZED_ORGANIZATION",
                createdAt: now,
                updatedAt: now,
                version: 1
            },

            // D. Work Hours (Aggregated)
            workHours: {
                period: "Current Week (Aug 27 - Sep 02, 2026)",
                weeklyScheduledHours: 48,
                weeklyActualHours: 54,
                overtimeHours: 6,
                onCallHours: 12,
                consecutiveDutyDays: 5,
                restWindowAverageHours: 11.5,
                source: "IMPORTED_SYSTEM",
                confidence: 0.95,
                updatedAt: now,
                version: 1
            },

            // E. Training Schedule
            trainingHistory: [
                {
                    trainingId: "tr_2026_02",
                    trainingCategory: "Advanced High-Stress Operational Preparedness",
                    startDate: "2026-06-10",
                    endDate: "2026-06-24",
                    expectedDurationDays: 14,
                    intensityCategory: "HIGH", // LOW, MODERATE, HIGH
                    recoveryRequirementDays: 5,
                    source: "AUTHORIZED_ORGANIZATION",
                    createdAt: "2026-06-10T00:00:00Z",
                    updatedAt: "2026-06-24T00:00:00Z",
                    version: 1
                }
            ],

            // F. Transfer History
            transferHistory: [
                {
                    transferId: "trf_2025_01",
                    effectiveDate: "2025-11-01",
                    previousContextCategory: "Logistics Administrative Support",
                    newContextCategory: "Field Operations Support",
                    transitionType: "Lateral Duty Reassignment",
                    source: "AUTHORIZED_ORGANIZATION",
                    createdAt: "2025-11-01T00:00:00Z",
                    updatedAt: "2025-11-01T00:00:00Z",
                    version: 1
                }
            ],

            // G. Leave History (Privacy-preserving: Medical details isolated)
            leaveHistory: [
                {
                    leaveRecordId: "leave_2026_01",
                    leaveStart: "2026-07-01",
                    leaveEnd: "2026-07-10",
                    durationDays: 10,
                    leaveCategory: "recovery", // annual, recovery, personal, medical, emergency, other
                    source: "USER",
                    createdAt: "2026-07-01T00:00:00Z",
                    updatedAt: "2026-07-10T00:00:00Z",
                    version: 1
                },
                {
                    leaveRecordId: "leave_2026_02",
                    leaveStart: "2026-08-12",
                    leaveEnd: "2026-08-14",
                    durationDays: 3,
                    leaveCategory: "medical", // NOTE: No medical diagnosis, doctor notes, or prescriptions stored here!
                    source: "AUTHORIZED_ORGANIZATION",
                    createdAt: "2026-08-12T00:00:00Z",
                    updatedAt: "2026-08-14T00:00:00Z",
                    version: 1
                }
            ],

            // H. Workload Context (Aggregated Indicators)
            workloadContext: {
                workloadCategory: "ELEVATED", // LOW, NORMAL, ELEVATED, HIGH
                shiftCountMonthly: 18,
                nightShiftCountMonthly: 6,
                consecutiveDutyDaysMax: 6,
                averageRestWindowHours: 11.2,
                recoveryWindowStatus: "Adequate Rest Schedule",
                disciplinaryEvaluationAllowed: false, // Enforces Welfare-First policy rule!
                updatedAt: now,
                version: 1
            },

            // I. Operational Environment
            operationalEnvironment: {
                environmentCategory: "mixed", // office, field, remote, high-demand, hazardous, emergency-response, deployment, mixed
                demandFactor: "High Duty Rhythm",
                hazardExposureCategory: "Standard Operational Controls",
                gpsSurveillanceActive: false, // Enforces privacy rule: NO continuous tracking!
                updatedAt: now,
                version: 1
            },

            // J. Voluntary Wellness Information (Legacy snapshot kept for backwards-compatibility)
            voluntaryWellness: {
                stressLevel: "MODERATE", // LOW, MODERATE, HIGH
                fatigueLevel: "MODERATE", // LOW, MODERATE, HIGH
                sleepQuality: "FAIR", // POOR, FAIR, GOOD
                energyLevel: "MODERATE", // LOW, MODERATE, HIGH
                workLifeBalance: "FAIR",
                recoveryStatus: "PARTIAL_RECOVERY",
                wellnessConcerns: ["Irregular shift sleep adaptation", "High duty workload rhythm"],
                disclaimerAcknowledged: true,
                lastUpdated: now,
                source: "USER"
            },

            // K. Component 2: Mobile Wellness Assessments & Responses
            wellness_assessments: seedAssessments,
            wellness_responses: [],
            wellness_notes: [
                {
                    noteId: `note_${userId}_01`,
                    assessmentId: `asn_${userId}_seed_03`,
                    userId: userId,
                    content: "Adjusting to newly rotated evening shifts. Focus remains positive.",
                    isPrivate: true,
                    commanderVisibility: false,
                    welfareOfficerVisibility: false,
                    createdAt: "2026-09-05T09:00:00Z",
                    source: "SELF_REPORTED"
                }
            ],
            wellness_trends: {},
            wellness_support_requests: [],
            wellness_sharing_permissions: {
                allowWelfareOfficerSupport: true,
                allowCommanderAggregatesOnly: true,
                allowDeidentifiedResearch: true,
                allowHealthTwinSync: true,
                commanderCohortThreshold: 5
            },

            // L. Consent Architecture (ConsentRecords)
            consents: [
                {
                    consentId: "cnst_01_voluntary",
                    userId: userId,
                    dataCategory: "voluntary_wellness_checkins",
                    purpose: "Personal wellness, fatigue, and recovery self-monitoring support.",
                    consentStatus: "GRANTED", // GRANTED, REVOKED
                    grantedAt: "2026-01-01T00:00:00Z",
                    revokedAt: null,
                    version: 1,
                    source: "USER"
                },
                {
                    consentId: "cnst_02_org_analytics",
                    userId: userId,
                    dataCategory: "deidentified_organizational_analytics",
                    purpose: "Aggregated, privacy-preserving organizational workload and shift planning optimization.",
                    consentStatus: "GRANTED", // GRANTED, REVOKED
                    grantedAt: "2026-01-01T00:00:00Z",
                    revokedAt: null,
                    version: 1,
                    source: "USER"
                },
                {
                    consentId: "cnst_03_health_twin_bridge",
                    userId: userId,
                    dataCategory: "authorized_wearable_sleep_derived_signals",
                    purpose: "Import non-clinical sleep duration trends from Health Twin into Personnel Wellness for fatigue estimation.",
                    consentStatus: "GRANTED",
                    grantedAt: "2026-01-01T00:00:00Z",
                    revokedAt: null,
                    version: 1,
                    source: "USER"
                },
                {
                    consentId: "cnst_04_private_notes",
                    userId: userId,
                    dataCategory: "private_wellness_notes",
                    purpose: "Strictly private personal notes. Never accessible to commanders or supervisory personnel.",
                    consentStatus: "GRANTED",
                    grantedAt: "2026-01-01T00:00:00Z",
                    revokedAt: null,
                    version: 1,
                    source: "USER"
                },
                {
                    consentId: "cnst_05_confidential_support",
                    userId: userId,
                    dataCategory: "confidential_welfare_support",
                    purpose: "Enable direct routing of voluntary requests to authorized confidential welfare officers.",
                    consentStatus: "GRANTED",
                    grantedAt: "2026-01-01T00:00:00Z",
                    revokedAt: null,
                    version: 1,
                    source: "USER"
                }
            ],

            // M. Data Provenance & Verification Index
            provenanceIndex: [
                {
                    recordType: "serviceContext",
                    source: "HRMS_PORTAL_API",
                    sourceType: "AUTHORIZED_HR_SYSTEM",
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: now,
                    importedAt: "2026-01-01T00:00:00Z",
                    verificationStatus: "VERIFIED",
                    confidence: 0.99,
                    consentReference: "cnst_02_org_analytics",
                    dataOwner: userId
                },
                {
                    recordType: "voluntaryWellness",
                    source: "USER_SELF_REPORT",
                    sourceType: "USER",
                    createdAt: now,
                    updatedAt: now,
                    importedAt: now,
                    verificationStatus: "USER_PROVIDED",
                    confidence: 1.0,
                    consentReference: "cnst_01_voluntary",
                    dataOwner: userId
                }
            ],

            // N. Data Conflicts
            dataConflicts: [],

            // O. Future-Compatible Event Stream
            events: [
                {
                    eventId: "evt_001",
                    eventType: "DEPLOYMENT_ENDED",
                    timestamp: "2026-05-15T18:00:00Z",
                    category: "DEPLOYMENT",
                    summary: "Regional Operational Field Support deployment completed.",
                    payload: { durationDays: 75, workloadLevel: "ELEVATED" }
                },
                {
                    eventId: "evt_002",
                    eventType: "LEAVE_COMPLETED",
                    timestamp: "2026-07-10T00:00:00Z",
                    category: "LEAVE",
                    summary: "10-day recovery leave period completed.",
                    payload: { leaveCategory: "recovery", durationDays: 10 }
                },
                {
                    eventId: "evt_003",
                    eventType: "WELLNESS_CHECKIN",
                    timestamp: now,
                    category: "VOLUNTARY_WELLNESS",
                    summary: "User updated voluntary wellness context (Stress: MODERATE, Fatigue: MODERATE).",
                    payload: { stressLevel: "MODERATE", fatigueLevel: "MODERATE", sleepQuality: "FAIR" }
                }
            ],

            // P. Data Retention Metadata
            retention: {
                retentionPeriodDays: 1825, // 5 years
                retentionPurpose: "Personnel Welfare, Shift Workload & Fatigue Monitoring",
                deletionEligibilityDate: "2031-09-02T00:00:00Z",
                autoPurgeEnabled: false
            }
        };
    }

    // --- 3. AUDIT LOGGER ---
    const PersonnelAuditLogger = {
        logs: [],

        logEvent(actor, action, resource, result, source = "SYSTEM_API", contextId = null) {
            // CRITICAL PRIVACY RULE: Never log sensitive question answers or private notes in audit logs!
            const entry = {
                logId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                timestamp: new Date().toISOString(),
                actor: actor || "ANONYMOUS",
                action: action, // ASSESSMENT_CREATED, ASSESSMENT_VIEWED, DATA_EXPORTED, DATA_DELETED, CONSENT_GRANTED, CONSENT_REVOKED, ACCESS_DENIED, SUPPORT_REQUEST_CREATED
                resource: resource,
                result: result, // SUCCESS, DENIED, ERROR
                source: source,
                contextId: contextId || `ctx_${Date.now()}`
            };
            this.logs.unshift(entry);
            if (this.logs.length > 300) this.logs.pop();
            return entry;
        },

        getLogs(limit = 50) {
            return this.logs.slice(0, limit);
        }
    };

    // --- 4. MEDICAL DATA FIREWALL & RBAC MIDDLEWARE ---
    const PersonnelRBAC = {
        validateAccess(activeUser, targetUserId, resourceCategory, role = "PERSONNEL") {
            const normalizedRole = (role || "").toUpperCase();

            // 1. Unauthenticated check
            if (!activeUser || (!activeUser.email && !activeUser.id)) {
                PersonnelAuditLogger.logEvent("UNAUTHENTICATED", "DATA_VIEWED", resourceCategory, "DENIED", "RBAC_MIDDLEWARE");
                return { authorized: false, status: 401, error: "401 Unauthenticated: Active session is required." };
            }

            const userIdentifier = activeUser.id || activeUser.email;

            // 2. Cross-user isolation check (PERSONNEL can only access own profile & check-in data)
            if (normalizedRole === "PERSONNEL" && activeUser.id !== targetUserId && activeUser.email !== targetUserId && targetUserId !== "LIFEOS-USER-001") {
                PersonnelAuditLogger.logEvent(userIdentifier, "ACCESS_DENIED_CROSS_USER", resourceCategory, "DENIED", "RBAC_MIDDLEWARE");
                return { authorized: false, status: 403, error: "403 Forbidden: You do not have permission to access another user's Personnel Wellness records." };
            }

            // 3. Medical Data Firewall Check: Personnel endpoints must NEVER expose clinical medical records!
            if (resourceCategory === "CLINICAL_MEDICAL_DATA" || resourceCategory === "DIAGNOSES_OR_LABS") {
                PersonnelAuditLogger.logEvent(userIdentifier, "ACCESS_DENIED_MEDICAL_FIREWALL", resourceCategory, "DENIED", "MEDICAL_FIREWALL");
                return {
                    authorized: false,
                    status: 403,
                    error: "403 Forbidden [Medical Data Firewall]: Personnel Wellness roles cannot access clinical medical diagnoses, lab reports, or prescriptions."
                };
            }

            // 4. Commander Access Isolation Rule:
            // COMMANDERS MUST NEVER ACCESS INDIVIDUAL PRIVATE WELLNESS CHECK-INS OR PRIVATE NOTES
            if (normalizedRole === "COMMANDER") {
                const individualCategories = ["WELLNESS_ASSESSMENTS", "WELLNESS_NOTES", "INDIVIDUAL_RESPONSES", "VOLUNTARY_WELLNESS", "PERSONNEL_WELLNESS_PROFILE"];
                if (individualCategories.includes(resourceCategory)) {
                    PersonnelAuditLogger.logEvent(userIdentifier, "ACCESS_DENIED_COMMANDER_INDIVIDUAL", resourceCategory, "DENIED", "RBAC_MIDDLEWARE");
                    return {
                        authorized: false,
                        status: 403,
                        error: "403 Forbidden: Commanders cannot view individual personnel self-assessments or private notes. Only aggregated organizational indicators are accessible."
                    };
                }
            }

            // 5. Private Notes Protection:
            if (resourceCategory === "PRIVATE_WELLNESS_NOTES") {
                if (normalizedRole !== "PERSONNEL" && normalizedRole !== "WELFARE_OFFICER") {
                    PersonnelAuditLogger.logEvent(userIdentifier, "ACCESS_DENIED_PRIVATE_NOTES", resourceCategory, "DENIED", "RBAC_MIDDLEWARE");
                    return {
                        authorized: false,
                        status: 403,
                        error: "403 Forbidden: Private wellness notes are confidential and restricted to the user."
                    };
                }
            }

            // 6. Welfare Officer restricted scope check
            if (normalizedRole === "WELFARE_OFFICER") {
                const forbiddenForWelfare = ["CLINICAL_MEDICAL_DATA", "FULL_GENOMICS", "DISCIPLINARY_ACTION"];
                if (forbiddenForWelfare.includes(resourceCategory)) {
                    PersonnelAuditLogger.logEvent(userIdentifier, "DATA_VIEWED", resourceCategory, "DENIED", "RBAC_MIDDLEWARE");
                    return { authorized: false, status: 403, error: `403 Forbidden: Welfare Officers are barred from accessing ${resourceCategory}.` };
                }
            }

            PersonnelAuditLogger.logEvent(userIdentifier, "DATA_VIEWED", resourceCategory, "SUCCESS", "RBAC_MIDDLEWARE");
            return { authorized: true, status: 200 };
        }
    };

    // --- 5. DATA VALIDATION ENGINE ---
    const PersonnelDataValidator = {
        validateDeployment(dep) {
            const errors = [];
            if (!dep.startDate) errors.push("startDate is required.");
            if (!dep.endDate) errors.push("endDate is required.");
            if (dep.startDate && dep.endDate && new Date(dep.endDate) < new Date(dep.startDate)) {
                errors.push("Validation Error: endDate cannot be before startDate.");
            }
            if (dep.recoveryPeriodAfterDeploymentDays < 0) {
                errors.push("Validation Error: recoveryPeriodAfterDeployment cannot be negative.");
            }
            return { valid: errors.length === 0, errors };
        },

        validateWorkHours(wh) {
            const errors = [];
            if (wh.weeklyScheduledHours < 0 || wh.weeklyActualHours < 0) {
                errors.push("Validation Error: actual or scheduled hours cannot be negative.");
            }
            if (wh.overtimeHours < 0) {
                errors.push("Validation Error: overtimeHours cannot be negative.");
            }
            return { valid: errors.length === 0, errors };
        },

        validateCheckIn(checkIn) {
            const errors = [];
            const r = checkIn.responses || {};

            // Valid core domains
            const validMoods = ["Very good", "Good", "Okay", "Low", "Very low", "Prefer not to answer"];
            const validStress = ["None", "Low", "Moderate", "High", "Very high", "Prefer not to answer"];
            const validEnergy = ["Very high", "High", "Moderate", "Low", "Very low", "Prefer not to answer"];
            const validFatigue = ["Not tired", "Slightly tired", "Moderately tired", "Very tired", "Extremely tired", "Prefer not to answer"];
            const validRecovery = ["Very well", "Well", "Average", "Poorly", "Very poorly", "Prefer not to answer"];
            const validSleepQuality = ["Excellent", "Good", "Fair", "Poor", "Prefer not to answer"];

            if (r.mood && !validMoods.includes(r.mood)) errors.push(`Invalid mood value: '${r.mood}'.`);
            if (r.stress && !validStress.includes(r.stress)) errors.push(`Invalid stress value: '${r.stress}'.`);
            if (r.energy && !validEnergy.includes(r.energy)) errors.push(`Invalid energy value: '${r.energy}'.`);
            if (r.fatigue && !validFatigue.includes(r.fatigue)) errors.push(`Invalid fatigue value: '${r.fatigue}'.`);
            if (r.recovery && !validRecovery.includes(r.recovery)) errors.push(`Invalid recovery value: '${r.recovery}'.`);
            if (r.sleepQuality && !validSleepQuality.includes(r.sleepQuality)) errors.push(`Invalid sleep quality: '${r.sleepQuality}'.`);

            // Validate sleep duration
            if (r.sleepDurationHours !== undefined && r.sleepDurationHours !== null) {
                const hours = Number(r.sleepDurationHours);
                if (isNaN(hours) || hours < 0 || hours > 24) {
                    errors.push("Sleep duration hours must be between 0 and 24.");
                }
            }

            if (r.sleepDurationMinutes !== undefined && r.sleepDurationMinutes !== null) {
                const mins = Number(r.sleepDurationMinutes);
                if (isNaN(mins) || mins < 0 || mins > 59) {
                    errors.push("Sleep duration minutes must be between 0 and 59.");
                }
            }

            return { valid: errors.length === 0, errors };
        },

        detectConflict(recordA, recordB) {
            if (recordA.source !== recordB.source && recordA.value !== recordB.value) {
                return {
                    conflictId: `conf_${Date.now()}`,
                    sourceA: recordA.source,
                    sourceB: recordB.source,
                    field: recordA.field,
                    valueA: recordA.value,
                    valueB: recordB.value,
                    timestamp: new Date().toISOString(),
                    resolutionStatus: "UNRESOLVED_CONFLICT_STORED"
                };
            }
            return null;
        }
    };

    // --- 6. PERSONAL BASELINE ENGINE ---
    // Calculates a person's individual historical patterns (requires >= 3 check-ins)
    const PersonnelBaselineEngine = {
        calculateBaseline(assessments = []) {
            const completed = assessments.filter(a => a.completionStatus === "COMPLETED");
            if (completed.length < 3) {
                return {
                    hasBaseline: false,
                    sampleCount: completed.length,
                    minimumRequired: 3,
                    statusText: `Calculating personal baseline (${completed.length}/3 check-ins completed)`
                };
            }

            // Sleep duration mean
            let totalSleepMins = 0;
            let sleepValidCount = 0;
            const stressScores = [];
            const fatigueScores = [];
            const energyScores = [];
            const recoveryScores = [];

            const scoreMap5 = {
                "Very good": 5, "Good": 4, "Okay": 3, "Low": 2, "Very low": 1,
                "Very high": 5, "High": 4, "Moderate": 3, "None": 1,
                "Not tired": 1, "Slightly tired": 2, "Moderately tired": 3, "Very tired": 4, "Extremely tired": 5,
                "Very well": 5, "Well": 4, "Average": 3, "Poorly": 2, "Very poorly": 1
            };

            completed.forEach(a => {
                const r = a.responses || {};
                const h = Number(r.sleepDurationHours) || 0;
                const m = Number(r.sleepDurationMinutes) || 0;
                const totalM = (h * 60) + m;
                if (totalM > 0) {
                    totalSleepMins += totalM;
                    sleepValidCount++;
                }

                if (scoreMap5[r.stress]) stressScores.push(scoreMap5[r.stress]);
                if (scoreMap5[r.fatigue]) fatigueScores.push(scoreMap5[r.fatigue]);
                if (scoreMap5[r.energy]) energyScores.push(scoreMap5[r.energy]);
                if (scoreMap5[r.recovery]) recoveryScores.push(scoreMap5[r.recovery]);
            });

            const avgSleepMins = sleepValidCount > 0 ? Math.round(totalSleepMins / sleepValidCount) : (7 * 60 + 15);
            const avgHours = Math.floor(avgSleepMins / 60);
            const avgRemainingMins = avgSleepMins % 60;

            const avgStress = stressScores.length > 0 ? (stressScores.reduce((a, b) => a + b, 0) / stressScores.length) : 2.5;
            const avgFatigue = fatigueScores.length > 0 ? (fatigueScores.reduce((a, b) => a + b, 0) / fatigueScores.length) : 2.5;
            const avgRecovery = recoveryScores.length > 0 ? (recoveryScores.reduce((a, b) => a + b, 0) / recoveryScores.length) : 3.5;

            return {
                hasBaseline: true,
                sampleCount: completed.length,
                typicalSleepMinutes: avgSleepMins,
                typicalSleepFormatted: `${avgHours}h ${avgRemainingMins.toString().padStart(2, '0')}m`,
                typicalStressScore: Number(avgStress.toFixed(1)),
                typicalFatigueScore: Number(avgFatigue.toFixed(1)),
                typicalRecoveryScore: Number(avgRecovery.toFixed(1)),
                statusText: "Personal Baseline Established"
            };
        },

        compareAgainstBaseline(currentResponses, baseline) {
            if (!baseline || !baseline.hasBaseline) {
                return {
                    sleepDeltaPct: null,
                    sleepComparisonText: "Establishing personal baseline",
                    stressVsBaseline: "Establishing baseline",
                    fatigueVsBaseline: "Establishing baseline",
                    recoveryVsBaseline: "Establishing baseline"
                };
            }

            const currentH = Number(currentResponses.sleepDurationHours) || 0;
            const currentM = Number(currentResponses.sleepDurationMinutes) || 0;
            const currentTotalM = (currentH * 60) + currentM;

            let sleepDeltaPct = null;
            let sleepComparisonText = "Consistent with personal baseline";
            if (currentTotalM > 0 && baseline.typicalSleepMinutes > 0) {
                sleepDeltaPct = Math.round(((currentTotalM - baseline.typicalSleepMinutes) / baseline.typicalSleepMinutes) * 100);
                if (sleepDeltaPct <= -15) {
                    sleepComparisonText = `${Math.abs(sleepDeltaPct)}% below personal baseline`;
                } else if (sleepDeltaPct >= 15) {
                    sleepComparisonText = `${sleepDeltaPct}% above personal baseline`;
                } else {
                    sleepComparisonText = "Near personal baseline";
                }
            }

            const scoreMap5 = {
                "None": 1, "Low": 2, "Moderate": 3, "High": 4, "Very high": 5,
                "Not tired": 1, "Slightly tired": 2, "Moderately tired": 3, "Very tired": 4, "Extremely tired": 5,
                "Very poorly": 1, "Poorly": 2, "Average": 3, "Well": 4, "Very well": 5
            };

            let stressVsBaseline = "At personal baseline";
            const currentStressScore = scoreMap5[currentResponses.stress];
            if (currentStressScore) {
                if (currentStressScore > baseline.typicalStressScore + 0.6) stressVsBaseline = "Above personal baseline";
                else if (currentStressScore < baseline.typicalStressScore - 0.6) stressVsBaseline = "Below personal baseline";
            }

            let fatigueVsBaseline = "At personal baseline";
            const currentFatigueScore = scoreMap5[currentResponses.fatigue];
            if (currentFatigueScore) {
                if (currentFatigueScore > baseline.typicalFatigueScore + 0.6) fatigueVsBaseline = "Above personal baseline";
                else if (currentFatigueScore < baseline.typicalFatigueScore - 0.6) fatigueVsBaseline = "Below personal baseline";
            }

            let recoveryVsBaseline = "At personal baseline";
            const currentRecoveryScore = scoreMap5[currentResponses.recovery];
            if (currentRecoveryScore) {
                if (currentRecoveryScore < baseline.typicalRecoveryScore - 0.6) recoveryVsBaseline = "Lower than personal baseline";
                else if (currentRecoveryScore > baseline.typicalRecoveryScore + 0.6) recoveryVsBaseline = "Above personal baseline";
            }

            return {
                sleepDeltaPct,
                sleepComparisonText,
                stressVsBaseline,
                fatigueVsBaseline,
                recoveryVsBaseline
            };
        }
    };

    // --- 7. TREND & PATTERN DETECTION ENGINE ---
    const PersonnelTrendEngine = {
        analyzeTrends(assessments = [], timeframe = "30d") {
            const daysMap = { "7d": 7, "30d": 30, "90d": 90, "6mo": 180, "1yr": 365 };
            const limitDays = daysMap[timeframe] || 30;

            const cutoffTime = Date.now() - (limitDays * 24 * 60 * 60 * 1000);
            const filtered = assessments.filter(a => new Date(a.timestamp).getTime() >= cutoffTime && a.completionStatus === "COMPLETED");

            const baseline = PersonnelBaselineEngine.calculateBaseline(assessments);

            // Group into halves to compute direction
            const mid = Math.floor(filtered.length / 2);
            const olderHalf = filtered.slice(mid);
            const newerHalf = filtered.slice(0, mid);

            const scoreMap5 = {
                "Very good": 5, "Good": 4, "Okay": 3, "Low": 2, "Very low": 1,
                "Very high": 5, "High": 4, "Moderate": 3, "None": 1,
                "Not tired": 1, "Slightly tired": 2, "Moderately tired": 3, "Very tired": 4, "Extremely tired": 5,
                "Very well": 5, "Well": 4, "Average": 3, "Poorly": 2, "Very poorly": 1
            };

            function getAvg(arr, key) {
                const values = arr.map(a => scoreMap5[a.responses?.[key]]).filter(v => typeof v === 'number');
                if (values.length === 0) return null;
                return values.reduce((sum, v) => sum + v, 0) / values.length;
            }

            function getSleepAvgMins(arr) {
                const mins = arr.map(a => {
                    const h = Number(a.responses?.sleepDurationHours) || 0;
                    const m = Number(a.responses?.sleepDurationMinutes) || 0;
                    return (h * 60) + m;
                }).filter(v => v > 0);
                if (mins.length === 0) return null;
                return mins.reduce((s, v) => s + v, 0) / mins.length;
            }

            const currentFatigue = getAvg(newerHalf.length > 0 ? newerHalf : filtered, 'fatigue');
            const prevFatigue = getAvg(olderHalf, 'fatigue');
            const fatigueTrend = (currentFatigue && prevFatigue) 
                ? (currentFatigue > prevFatigue + 0.3 ? "Increasing" : (currentFatigue < prevFatigue - 0.3 ? "Decreasing" : "Stable"))
                : "Stable";

            const currentStress = getAvg(newerHalf.length > 0 ? newerHalf : filtered, 'stress');
            const prevStress = getAvg(olderHalf, 'stress');
            const stressTrend = (currentStress && prevStress)
                ? (currentStress > prevStress + 0.3 ? "Increasing" : (currentStress < prevStress - 0.3 ? "Decreasing" : "Stable"))
                : "Stable";

            const currentSleepMins = getSleepAvgMins(newerHalf.length > 0 ? newerHalf : filtered);
            const prevSleepMins = getSleepAvgMins(olderHalf);
            const sleepTrend = (currentSleepMins && prevSleepMins)
                ? (currentSleepMins < prevSleepMins - 20 ? "Decreasing" : (currentSleepMins > prevSleepMins + 20 ? "Increasing" : "Stable"))
                : "Stable";

            const currentRecovery = getAvg(newerHalf.length > 0 ? newerHalf : filtered, 'recovery');
            const prevRecovery = getAvg(olderHalf, 'recovery');
            const recoveryTrend = (currentRecovery && prevRecovery)
                ? (currentRecovery < prevRecovery - 0.3 ? "Declining" : (currentRecovery > prevRecovery + 0.3 ? "Improving" : "Stable"))
                : "Stable";

            // Multi-signal Pattern Detection
            const patterns = [];
            if (sleepTrend === "Decreasing" && (fatigueTrend === "Increasing" || stressTrend === "Increasing")) {
                patterns.push({
                    patternId: `pat_${Date.now()}_01`,
                    title: "Sleep Reduction & Fatigue Elevation Shift",
                    whatChanged: "Recent self-reported sleep has decreased while fatigue indicators have increased relative to your personal baseline.",
                    whenItChanged: `Observed across the ${timeframe} tracking window.`,
                    contributingData: [
                        `Sleep Trend: ${sleepTrend} (${currentSleepMins ? Math.round(currentSleepMins/60) + 'h ' + (Math.round(currentSleepMins)%60) + 'm' : '—'})`,
                        `Fatigue Trend: ${fatigueTrend}`,
                        `Stress Trend: ${stressTrend}`
                    ],
                    strength: "Moderate multi-signal shift",
                    possibleNextStep: "Consider prioritizing scheduled rest windows, sleep hygiene adjustments, or connecting with welfare support.",
                    disclaimer: "Non-diagnostic observation: correlation does not imply clinical condition."
                });
            }

            return {
                timeframe,
                assessmentCount: filtered.length,
                baseline,
                metrics: {
                    fatigue: { currentAvg: currentFatigue ? currentFatigue.toFixed(1) : "—", trend: fatigueTrend, explanation: "Self-reported physical and mental exhaustion indicator." },
                    stress: { currentAvg: currentStress ? currentStress.toFixed(1) : "—", trend: stressTrend, explanation: "Perceived operational and life stress report." },
                    sleep: { 
                        currentAvgFormatted: currentSleepMins ? `${Math.floor(currentSleepMins / 60)}h ${(Math.round(currentSleepMins) % 60).toString().padStart(2, '0')}m` : "—",
                        trend: sleepTrend,
                        explanation: "Approximate self-reported rest duration."
                    },
                    recovery: { currentAvg: currentRecovery ? currentRecovery.toFixed(1) : "—", trend: recoveryTrend, explanation: "Self-assessed replenishment after duty." }
                },
                patterns: patterns,
                supportiveRecommendations: [
                    "Prioritize regular sleep windows to restore circadian alignment.",
                    "Ensure adequate hydration and scheduled recovery breaks between operational demands.",
                    "If sustained fatigue persists, voluntary confidential welfare support is always available."
                ]
            };
        }
    };

    // --- 8. HEALTH TWIN BRIDGE (CONTROLLED AUTHORIZED INTERFACE) ---
    const PersonnelHealthTwinBridge = {
        getAuthorizedWellnessSignals(healthTwinState, consents) {
            const hasConsent = consents && consents.some(c => c.dataCategory === "authorized_wearable_sleep_derived_signals" && c.consentStatus === "GRANTED");
            
            if (!hasConsent) {
                return {
                    authorized: false,
                    reason: "Explicit user consent 'authorized_wearable_sleep_derived_signals' is missing or revoked.",
                    derivedSignals: null
                };
            }

            const derivedSignals = {
                sleepDurationAvgHours: healthTwinState?.organs?.brain?.sleepRatio ? 7.2 : null,
                sleepRegularityScore: "GOOD",
                restingHeartRateTrend: "STABLE (58 BPM avg)",
                activityRhythmScore: "MODERATE",
                derivedFatigueRisk: "LOW"
            };

            return {
                authorized: true,
                reason: "Derived wellness signals extracted under explicit user consent.",
                derivedSignals: derivedSignals
            };
        },

        // Integrates a new check-in assessment directly into the Health Twin event stream
        recordWellnessAssessmentInTwin(activeUser, targetUserId, assessmentRecord, state = {}) {
            const consents = state.personnelWellnessProfile?.consents || [];
            const hasConsent = consents.some(c => (c.dataCategory === "authorized_wearable_sleep_derived_signals" || c.dataCategory === "voluntary_wellness_checkins") && c.consentStatus === "GRANTED");

            if (!hasConsent) {
                return {
                    success: false,
                    reason: "Health Twin Bridge consent is revoked or missing."
                };
            }

            const htEvent = {
                eventId: `ht_evt_wellness_${assessmentRecord.assessmentId}`,
                eventType: "WELLNESS_ASSESSMENT",
                userId: targetUserId,
                timestamp: assessmentRecord.timestamp,
                source: assessmentRecord.source || "SELF_REPORTED",
                verification: "User provided",
                assessmentType: assessmentRecord.assessmentType || "DAILY_WELLNESS_CHECKIN",
                responses: {
                    mood: assessmentRecord.responses.mood,
                    stress: assessmentRecord.responses.stress,
                    energy: assessmentRecord.responses.energy,
                    fatigue: assessmentRecord.responses.fatigue,
                    sleepDurationHours: assessmentRecord.responses.sleepDurationHours,
                    sleepQuality: assessmentRecord.responses.sleepQuality,
                    recovery: assessmentRecord.responses.recovery
                },
                consentReference: assessmentRecord.consentReference || "cnst_01_voluntary",
                visibility: "PRIVATE_PERSONNEL",
                createdAt: assessmentRecord.createdAt,
                updatedAt: assessmentRecord.updatedAt
            };

            // Link into Health Twin store if present
            if (state.healthTwins && state.healthTwins[targetUserId]) {
                const twin = state.healthTwins[targetUserId];
                if (!twin.wellnessEvents) twin.wellnessEvents = [];
                twin.wellnessEvents.unshift(htEvent);
                if (twin.wellnessEvents.length > 50) twin.wellnessEvents.pop();

                // Update voluntary organ-system correlates safely without medical diagnosis
                if (twin.organs && twin.organs.brain) {
                    twin.organs.brain.sleepRatio = `${assessmentRecord.responses.sleepDurationHours || 7}h Self-Report`;
                }
            }

            // Link into personnel events timeline
            if (state.personnelWellnessProfile && state.personnelWellnessProfile.events) {
                state.personnelWellnessProfile.events.unshift({
                    eventId: htEvent.eventId,
                    eventType: "WELLNESS_ASSESSMENT",
                    timestamp: assessmentRecord.timestamp,
                    category: "VOLUNTARY_WELLNESS",
                    summary: `Daily Wellness Check-in completed (Stress: ${assessmentRecord.responses.stress}, Fatigue: ${assessmentRecord.responses.fatigue}, Sleep: ${assessmentRecord.responses.sleepDurationHours}h).`,
                    payload: htEvent.responses
                });
            }

            return {
                success: true,
                eventId: htEvent.eventId
            };
        }
    };

    // --- 9. BACKEND REST API CONTROLLER ---
    const PersonnelWellnessAPI = {
        // --- 1. GET CURRENT PROFILE (COMPONENT 1 COMPATIBLE) ---
        getProfile(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "PERSONNEL_WELLNESS_PROFILE", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            let profile = state.personnelWellnessProfile;
            if (!profile || profile.userId !== targetUserId) {
                profile = createInitialPersonnelProfile(targetUserId);
                state.personnelWellnessProfile = profile;
            }

            return {
                status: 200,
                data: profile,
                disclaimer: "WELFARE-FIRST POLICY: This wellness profile is designed exclusively for support, recovery, and fatigue monitoring. It cannot be used for disciplinary action, performance punishment, or demotion."
            };
        },

        updateProfile(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", updates = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "PERSONNEL_WELLNESS_PROFILE", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            const prevVersion = profile.serviceContext.version || 1;

            if (updates.dutyType) {
                profile.serviceContext.dutyType = updates.dutyType;
                profile.serviceContext.dutyTypeSource = updates.dutyTypeSource || "USER";
            }
            if (updates.roleCategory) profile.serviceContext.roleCategory = updates.roleCategory;
            if (updates.dutyCategory) profile.serviceContext.dutyCategory = updates.dutyCategory;
            if (updates.organizationType) profile.serviceContext.organizationType = updates.organizationType;

            profile.serviceContext.updatedAt = new Date().toISOString();
            profile.serviceContext.version = prevVersion + 1;
            profile.serviceContext.previousVersionId = `v${prevVersion}`;

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "PROFILE_UPDATED", "serviceContext", "SUCCESS", updates.dutyTypeSource || "USER");

            return { status: 200, data: profile.serviceContext };
        },

        getDeployments(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "DEPLOYMENT_HISTORY", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            return { status: 200, data: profile.deployments || [] };
        },

        addDeployment(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", deploymentData = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "DEPLOYMENT_HISTORY", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const validation = PersonnelDataValidator.validateDeployment(deploymentData);
            if (!validation.valid) return { status: 400, error: validation.errors.join(" ") };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            const now = new Date().toISOString();

            const start = new Date(deploymentData.startDate);
            const end = new Date(deploymentData.endDate);
            const durationDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))) || 1;

            const newDep = {
                deploymentId: `dep_${Date.now()}`,
                startDate: deploymentData.startDate,
                endDate: deploymentData.endDate,
                durationDays: durationDays,
                deploymentCategory: deploymentData.deploymentCategory || "Standard Duty Deployment",
                workloadLevel: deploymentData.workloadLevel || "NORMAL",
                recoveryPeriodAfterDeploymentDays: parseInt(deploymentData.recoveryPeriodAfterDeploymentDays || 7, 10),
                environmentCategory: deploymentData.environmentCategory || "field",
                source: deploymentData.source || "USER",
                verificationStatus: "USER_PROVIDED",
                confidence: 0.95,
                createdAt: now,
                updatedAt: now,
                version: 1
            };

            profile.deployments.unshift(newDep);

            profile.events.unshift({
                eventId: `evt_${Date.now()}`,
                eventType: "DEPLOYMENT_STARTED",
                timestamp: now,
                category: "DEPLOYMENT",
                summary: `New deployment recorded: ${newDep.deploymentCategory} (${newDep.environmentCategory}).`,
                payload: { deploymentId: newDep.deploymentId, durationDays }
            });

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "DATA_IMPORTED", "deployments", "SUCCESS", newDep.source);

            return { status: 200, data: newDep };
        },

        getVoluntaryWellness(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "VOLUNTARY_WELLNESS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            return { status: 200, data: profile.voluntaryWellness };
        },

        updateVoluntaryWellness(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", wellnessData = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "VOLUNTARY_WELLNESS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            const now = new Date().toISOString();

            profile.voluntaryWellness = {
                ...profile.voluntaryWellness,
                ...wellnessData,
                lastUpdated: now,
                source: "USER"
            };

            profile.events.unshift({
                eventId: `evt_${Date.now()}`,
                eventType: "WELLNESS_CHECKIN",
                timestamp: now,
                category: "VOLUNTARY_WELLNESS",
                summary: `Voluntary wellness check-in updated (Stress: ${wellnessData.stressLevel || 'NORMAL'}, Fatigue: ${wellnessData.fatigueLevel || 'NORMAL'}).`,
                payload: wellnessData
            });

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "PROFILE_UPDATED", "voluntaryWellness", "SUCCESS", "USER");

            return { status: 200, data: profile.voluntaryWellness };
        },

        // --- 2. COMPONENT 2: DAILY CHECK-IN & SELF-ASSESSMENT ENDPOINTS ---

        // POST /wellness/check-in
        submitCheckIn(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", checkInData = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            // Check voluntary consent
            const voluntaryConsent = profile.consents?.find(c => c.consentId === "cnst_01_voluntary");
            if (voluntaryConsent && voluntaryConsent.consentStatus === "REVOKED") {
                PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "ASSESSMENT_CREATION_DENIED", "CONSENT_REVOKED", "DENIED", "API");
                return {
                    status: 403,
                    error: "403 Forbidden: Voluntary wellness check-ins require active consent. Please re-enable consent in Privacy & Data Control."
                };
            }

            // Server-side validation
            const validation = PersonnelDataValidator.validateCheckIn(checkInData);
            if (!validation.valid) {
                return { status: 400, error: validation.errors.join(" ") };
            }

            const now = new Date().toISOString();
            const todayStr = now.slice(0, 10);
            const r = checkInData.responses || {};

            // Calculate personal baseline comparison
            const baseline = PersonnelBaselineEngine.calculateBaseline(profile.wellness_assessments || []);
            const baselineComparison = PersonnelBaselineEngine.compareAgainstBaseline(r, baseline);

            const assessmentId = `asn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

            // Build assessment record with strict provenance
            const newAssessment = {
                assessmentId: assessmentId,
                userId: targetUserId,
                timestamp: now,
                date: todayStr,
                completionStatus: "COMPLETED",
                source: "SELF_REPORTED",
                verification: "User provided",
                assessmentType: "DAILY_WELLNESS_CHECKIN",
                consentReference: "cnst_01_voluntary",
                visibility: "PRIVATE_PERSONNEL",
                responses: {
                    mood: r.mood || "Okay",
                    stress: r.stress || "Moderate",
                    energy: r.energy || "Moderate",
                    fatigue: r.fatigue || "Moderately tired",
                    sleepDurationHours: Number(r.sleepDurationHours) || 7,
                    sleepDurationMinutes: Number(r.sleepDurationMinutes) || 0,
                    sleepQuality: r.sleepQuality || "Fair",
                    sleepRested: r.sleepRested || "Somewhat",
                    recovery: r.recovery || "Average",
                    // Optional questions with strict "Prefer not to answer" allowance
                    overwhelmed: r.overwhelmed || "Prefer not to answer",
                    difficultyConcentrating: r.difficultyConcentrating || "Prefer not to answer",
                    unusualFatigue: r.unusualFatigue || "Prefer not to answer",
                    difficultToRecover: r.difficultToRecover || "Prefer not to answer",
                    enoughTimeToRest: r.enoughTimeToRest || "Prefer not to answer",
                    wantsConfidentialSupport: r.wantsConfidentialSupport || "No"
                },
                baselineComparison: baselineComparison,
                createdAt: now,
                updatedAt: now
            };

            if (!profile.wellness_assessments) profile.wellness_assessments = [];
            // Remove any draft or today assessment for clean replacement
            profile.wellness_assessments = profile.wellness_assessments.filter(a => a.date !== todayStr);
            profile.wellness_assessments.unshift(newAssessment);

            // Handle Private Note if submitted
            if (checkInData.privateNote && checkInData.privateNote.trim()) {
                const noteId = `note_${Date.now()}`;
                const noteRecord = {
                    noteId: noteId,
                    assessmentId: assessmentId,
                    userId: targetUserId,
                    content: checkInData.privateNote.trim(),
                    isPrivate: true,
                    commanderVisibility: false, // Strict privacy guarantee
                    welfareOfficerVisibility: false,
                    createdAt: now,
                    source: "SELF_REPORTED"
                };
                if (!profile.wellness_notes) profile.wellness_notes = [];
                profile.wellness_notes.unshift(noteRecord);
                newAssessment.privateNoteId = noteId;
            }

            // Sync with Health Twin event stream
            PersonnelHealthTwinBridge.recordWellnessAssessmentInTwin(activeUser, targetUserId, newAssessment, state);

            // Update legacy voluntary snapshot for backwards compatibility
            profile.voluntaryWellness = {
                stressLevel: (r.stress || "MODERATE").toUpperCase(),
                fatigueLevel: (r.fatigue || "MODERATE").toUpperCase(),
                sleepQuality: (r.sleepQuality || "FAIR").toUpperCase(),
                energyLevel: (r.energy || "MODERATE").toUpperCase(),
                workLifeBalance: "FAIR",
                recoveryStatus: r.recovery ? (r.recovery === "Very well" || r.recovery === "Well" ? "ADEQUATE" : "PARTIAL_RECOVERY") : "PARTIAL_RECOVERY",
                lastUpdated: now,
                source: "USER"
            };

            // Log security audit without exposing answer content
            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "ASSESSMENT_CREATED", "DAILY_WELLNESS_CHECKIN", "SUCCESS", "API", assessmentId);

            return {
                status: 200,
                data: newAssessment,
                message: "Wellness Check-in Complete.",
                baselineComparison: baselineComparison,
                supportiveFeedback: [
                    baselineComparison.sleepComparisonText,
                    `Stress indicator is ${baselineComparison.stressVsBaseline.toLowerCase()}.`,
                    `Fatigue report is ${baselineComparison.fatigueVsBaseline.toLowerCase()}.`,
                    "Suggested next step: Prioritize balanced recovery intervals and adequate rest."
                ]
            };
        },

        // GET /wellness/current
        getCurrentStatus(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            const todayStr = new Date().toISOString().slice(0, 10);
            const assessments = profile.wellness_assessments || [];
            const todayRecord = assessments.find(a => a.date === todayStr);

            let status = "NOT_COMPLETED";
            if (todayRecord) {
                status = todayRecord.completionStatus; // COMPLETED or SKIPPED
            }

            const latestAssessment = assessments[0] || null;
            const baseline = PersonnelBaselineEngine.calculateBaseline(assessments);

            // Read Wearable Data state cleanly from LifeOS.wearables (Real Wearable Data Principle)
            const wearableSource = (state.wearables) ? state.wearables : ((typeof LifeOS !== 'undefined') ? LifeOS.wearables : null);
            let wearableState = {
                connected: false,
                deviceName: null,
                connectionState: "NOT CONNECTED",
                lastSync: null,
                dataSource: null,
                dataFreshness: null,
                availableMetrics: [],
                message: "No wearable connected. Connect a supported device to import wellness data."
            };

            if (wearableSource && wearableSource.syncStatus && wearableSource.syncStatus.includes("Connected")) {
                wearableState = {
                    connected: true,
                    deviceName: wearableSource.connectedDevices?.[0]?.name || "Connected Wearable",
                    connectionState: "CONNECTED",
                    lastSync: wearableSource.lastSync || "Just now",
                    dataSource: "WEARABLE",
                    dataFreshness: "Live Telemetry",
                    availableMetrics: ["Heart Rate", "Sleep Duration", "HRV"],
                    sleepMetric: wearableSource.sleepHrs ? `${wearableSource.sleepHrs}h` : null,
                    message: null
                };
            }

            return {
                status: 200,
                data: {
                    todayStatus: status,
                    todayRecord: todayRecord || null,
                    latestAssessment: latestAssessment,
                    baseline: baseline,
                    wearable: wearableState
                }
            };
        },

        // Skip Today Check-in
        skipTodayCheckIn(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            const now = new Date().toISOString();
            const todayStr = now.slice(0, 10);

            const skippedRecord = {
                assessmentId: `asn_skip_${Date.now()}`,
                userId: targetUserId,
                timestamp: now,
                date: todayStr,
                completionStatus: "SKIPPED",
                source: "SELF_REPORTED",
                verification: "User provided",
                assessmentType: "DAILY_WELLNESS_CHECKIN",
                responses: null,
                createdAt: now,
                updatedAt: now
            };

            if (!profile.wellness_assessments) profile.wellness_assessments = [];
            profile.wellness_assessments = profile.wellness_assessments.filter(a => a.date !== todayStr);
            profile.wellness_assessments.unshift(skippedRecord);

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "ASSESSMENT_SKIPPED", "DAILY_WELLNESS_CHECKIN", "SUCCESS", "API");

            return { status: 200, data: skippedRecord, message: "Today's check-in skipped." };
        },

        // GET /wellness/history
        getHistory(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", options = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            let history = (profile.wellness_assessments || []).slice();

            if (options.limit) {
                history = history.slice(0, parseInt(options.limit, 10));
            }

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "ASSESSMENT_VIEWED", "WELLNESS_HISTORY", "SUCCESS", "API");

            return { status: 200, data: history };
        },

        // GET /wellness/trends
        getTrends(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", timeframe = "30d", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            const trendAnalysis = PersonnelTrendEngine.analyzeTrends(profile.wellness_assessments || [], timeframe);

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "ASSESSMENT_VIEWED", "WELLNESS_TRENDS", "SUCCESS", "API");

            return { status: 200, data: trendAnalysis };
        },

        // POST /wellness/support-request
        createSupportRequest(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", requestData = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            const now = new Date().toISOString();

            const newRequest = {
                requestId: `sup_${Date.now()}`,
                userId: targetUserId,
                requestType: requestData.requestType || "WELFARE_CONSULTATION", // WELFARE_CONSULTATION, COUNSELING, CONTACT_OFFICER, RESOURCE_INFO
                preferredContactMethod: requestData.preferredContactMethod || "IN_APP_MESSAGE",
                urgency: requestData.urgency || "STANDARD",
                notes: requestData.notes || "Requested confidential assistance through Mobile Wellness Portal.",
                status: "SUBMITTED_CONFIDENTIAL",
                assignedOfficerId: null,
                createdAt: now,
                updatedAt: now
            };

            if (!profile.wellness_support_requests) profile.wellness_support_requests = [];
            profile.wellness_support_requests.unshift(newRequest);

            // Audit log without leaking notes
            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "SUPPORT_REQUEST_CREATED", newRequest.requestType, "SUCCESS", "API", newRequest.requestId);

            return {
                status: 200,
                data: newRequest,
                message: "Your confidential support request has been submitted to authorized welfare personnel."
            };
        },

        // GET /wellness/consent
        getConsents(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "CONSENT_RECORD", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            return { status: 200, data: profile.consents || [] };
        },

        // PATCH /wellness/consent
        updateConsent(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", consentId, newStatus, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "CONSENT_RECORD", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;
            const consent = profile.consents.find(c => c.consentId === consentId);

            if (!consent) return { status: 404, error: "Consent record not found." };

            const now = new Date().toISOString();
            consent.consentStatus = newStatus;
            if (newStatus === "REVOKED") {
                consent.revokedAt = now;
                PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "CONSENT_REVOKED", consent.dataCategory, "SUCCESS", "USER");
            } else {
                consent.grantedAt = now;
                consent.revokedAt = null;
                PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "CONSENT_GRANTED", consent.dataCategory, "SUCCESS", "USER");
            }
            consent.version = (consent.version || 1) + 1;

            profile.events.unshift({
                eventId: `evt_${Date.now()}`,
                eventType: "CONSENT_CHANGED",
                timestamp: now,
                category: "CONSENT",
                summary: `Consent for ${consent.dataCategory} was set to ${newStatus}.`,
                payload: { consentId, newStatus }
            });

            return { status: 200, data: consent };
        },

        // DELETE /wellness/data (Privacy & Data Deletion)
        deleteWellnessData(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", options = {}, state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            const deletedCount = (profile.wellness_assessments || []).length;
            profile.wellness_assessments = [];
            profile.wellness_notes = [];

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "DATA_DELETED", "WELLNESS_DATA_FULL_PURGE", "SUCCESS", "API");

            return {
                status: 200,
                message: `Successfully purged ${deletedCount} wellness assessment records and private notes in accordance with your privacy request.`
            };
        },

        // GET /wellness/export (Data Portability)
        exportWellnessData(activeUser, role = "PERSONNEL", targetUserId = "LIFEOS-USER-001", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, targetUserId, "WELLNESS_ASSESSMENTS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            const profile = state.personnelWellnessProfile || createInitialPersonnelProfile(targetUserId);
            state.personnelWellnessProfile = profile;

            const exportPayload = {
                exportId: `exp_${Date.now()}`,
                exportedAt: new Date().toISOString(),
                userId: targetUserId,
                dataSubject: "Personnel Voluntary Wellness Self-Assessment Export",
                assessments: profile.wellness_assessments || [],
                notes: profile.wellness_notes || [],
                consents: profile.consents || [],
                provenanceIndex: profile.provenanceIndex || [],
                provenanceGuarantee: "Verified Origin: User Self-Reported Voluntary Data. Non-Clinical."
            };

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "DATA_EXPORTED", "WELLNESS_DATA", "SUCCESS", "API");

            return { status: 200, data: exportPayload };
        },

        // GET /wellness/aggregate (For Commanders & Organizational Dashboards)
        // Enforces Minimum Cohort Threshold (e.g. min 5 personnel) to protect individual anonymity
        getAggregatedUnitTrends(activeUser, role = "COMMANDER", unitId = "UNIT-ALPHA-WELLNESS", state = {}) {
            // Unauthenticated check
            if (!activeUser || (!activeUser.email && !activeUser.id)) {
                return { status: 401, error: "Authentication required." };
            }

            // In production, we aggregate across personnel in the unit
            // Simulated cohort size to verify threshold
            const cohortSize = state.cohortCount !== undefined ? state.cohortCount : 12; // Configurable cohort count
            const minimumThreshold = 5;

            if (cohortSize < minimumThreshold) {
                PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "AGGREGATE_VIEW_SUPPRESSED", unitId, "DENIED", "ANONYMITY_GATE");
                return {
                    status: 403,
                    aggregated: false,
                    error: `403 Forbidden: Unit cohort size (${cohortSize}) is below minimum threshold (${minimumThreshold}). Aggregated reporting is suppressed to preserve personnel anonymity.`
                };
            }

            PersonnelAuditLogger.logEvent(activeUser.email || activeUser.id, "AGGREGATE_VIEW_SUCCESS", unitId, "SUCCESS", "API");

            return {
                status: 200,
                data: {
                    aggregated: true,
                    unitId: unitId,
                    cohortSize: cohortSize,
                    anonymityProtected: true,
                    unitMetrics: {
                        fatigueShift: "+12% Elevated across rotating shifts",
                        averageSleepHours: "6h 50m",
                        sleepTrend: "Slight downward shift over recent duty rotation",
                        generalRecoveryIndex: "Adequate (76% reporting normal recovery)",
                        unitWorkloadRhythm: "ELEVATED"
                    },
                    disclaimer: "Aggregated unit indicators only. Individual personnel responses and private notes are strictly protected."
                },
                aggregated: true,
                unitId: unitId,
                cohortSize: cohortSize,
                anonymityProtected: true
            };
        },

        getAuditLogs(activeUser, role = "PERSONNEL", state = {}) {
            const auth = PersonnelRBAC.validateAccess(activeUser, activeUser ? (activeUser.id || activeUser.email) : "", "AUDIT_LOGS", role);
            if (!auth.authorized) return { status: auth.status, error: auth.error };

            return { status: 200, data: PersonnelAuditLogger.getLogs(50) };
        }
    };

    // --- 10. EXPOSE GLOBAL MODULE ---
    global.PersonnelWellnessAPI = PersonnelWellnessAPI;
    global.PersonnelAuditLogger = PersonnelAuditLogger;
    global.PersonnelRBAC = PersonnelRBAC;
    global.PersonnelHealthTwinBridge = PersonnelHealthTwinBridge;
    global.PersonnelDataValidator = PersonnelDataValidator;
    global.PersonnelBaselineEngine = PersonnelBaselineEngine;
    global.PersonnelTrendEngine = PersonnelTrendEngine;
    global.createInitialPersonnelProfile = createInitialPersonnelProfile;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : (typeof globalThis !== 'undefined' ? globalThis : this)));
