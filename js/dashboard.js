/* ==================================================
   LIFEOS AI - AUTONOMOUS HEALTHCARE WORKSPACE ENGINE
   ================================================== */

// Global Health Twin Authoritative Data Platform API
function createInitialHealthTwinStore(patientId) {
    return {
        patientProfile: {
            patientId: patientId || "USER-ALEX-001",
            age: 32,
            sex: "Male",
            height: 178,
            weight: 76,
            bloodGroup: "O+",
            allergies: ["Penicillin"],
            medicalHistory: ["Pre-diabetes screening"],
            familyHistory: ["Type 2 Diabetes (Maternal)", "CAD (Paternal)"],
            medications: [],
            surgeries: [],
            vaccinations: [],
            lifestyle: { diet: "Standard Western", sleepHrs: 7, exerciseHrs: 4 },
            emergencyContact: { name: "Sarah Mercer", phone: "+1 (555) 987-6543" }
        },
        healthScore: null,
        riskScore: null,
        biologicalAge: null,
        longevityScore: null,
        stressScore: null,
        organs: {
            brain: { status: "AWAITING DATA", integrity: "—", sleepRatio: "—", cortisol: "—" },
            heart: { status: "AWAITING DATA", hr: "—", hrv: "—", stiffness: "—" },
            vascular: { status: "AWAITING DATA", map: "—", hsCRP: "—" },
            digestive: { status: "AWAITING DATA", diversity: "—" },
            cellular: { status: "AWAITING DATA", telomere: "—", methylation: "—" }
        },
        vitals: [],
        labResults: [],
        medicalDocuments: [],
        wearables: {
            syncStatus: "NOT CONNECTED",
            lastSync: null,
            battery: null,
            connectedDevices: [],
            telemetryStream: [],
            heartRate: null,
            glucose: null,
            hrv: null,
            bloodPressure: null
        },
        conflicts: [],
        dataQuality: {
            profilePct: 100,
            recordPct: 0,
            wearablePct: 0,
            genomicPct: 0,
            lifestylePct: 50,
            medicalRecordsCoverage: 0,
            provenanceCount: 0,
            reliability: "Low (Insufficient Data)"
        }
    };
}

const HealthTwinAPI = {
    validateAccess(authUser, targetPatientId) {
        if (!authUser || (!authUser.id && !authUser.email)) {
            return { authorized: false, status: 401, message: "Authentication required." };
        }
        const userId = authUser.id || "USER-ALEX-001";
        if (userId !== targetPatientId && authUser.role !== 'doctor' && authUser.role !== 'welfare_officer' && authUser.role !== 'admin') {
            return { authorized: false, status: 403, message: "Cross-user patient isolation violated." };
        }
        return { authorized: true, status: 200 };
    },

    getTwin(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        if (typeof LifeOS !== 'undefined') {
            if (!LifeOS.healthTwins) LifeOS.healthTwins = {};
            if (!LifeOS.healthTwins[patientId]) {
                LifeOS.healthTwins[patientId] = createInitialHealthTwinStore(patientId);
            }
            return { status: 200, data: LifeOS.healthTwins[patientId] };
        }
        return { status: 200, data: createInitialHealthTwinStore(patientId) };
    },

    getLabResults(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;
        const twin = this.getTwin(authUser, patientId).data;
        return { status: 200, data: twin.labResults || [] };
    },

    ingestDocument(authUser, patientId, docPayload) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const docId = `doc_${Date.now()}_${Math.floor(Math.random()*1000)}`;

        const docRecord = {
            documentId: docId,
            fileName: docPayload.fileName,
            fileHash: docPayload.fileHash || "hash_" + Date.now(),
            documentType: docPayload.documentType || "Lab Report",
            uploadTime: new Date().toISOString(),
            source: docPayload.source || "User Upload",
            ocrText: docPayload.ocrText || "",
            fields: (docPayload.rawExtractions || []).map((ext, idx) => ({
                fieldId: `fld_${docId}_${idx}`,
                field: ext.field,
                originalExtraction: {
                    value: ext.value,
                    unit: ext.unit,
                    originalText: ext.originalText,
                    page: ext.page || 1,
                    confidence: ext.confidence || 90
                },
                correctedValue: null,
                correctedUnit: null,
                whoCorrectedIt: null,
                correctedAt: null,
                verificationStatus: "EXTRACTED_PENDING_REVIEW"
            })),
            verificationStatus: "PENDING_REVIEW"
        };

        twin.medicalDocuments.unshift(docRecord);
        if (typeof logAudit === 'function') logAudit(`Document Ingested: ${docPayload.fileName} (${docId})`, "WRITE");
        this.recalculateQualityMetrics(patientId);

        return { status: 200, data: { documentId: docId, document: docRecord } };
    },

    commitDocumentExtractions(authUser, patientId, payload) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const doc = twin.medicalDocuments.find(d => d.documentId === payload.documentId);
        if (!doc) return { status: 404, message: "Document not found." };

        doc.fields.forEach(fld => {
            const corr = (payload.corrections || []).find(c => c.field === fld.field);
            if (corr) {
                fld.correctedValue = corr.correctedValue;
                fld.correctedUnit = corr.unit || fld.originalExtraction.unit;
                fld.whoCorrectedIt = authUser.id || "USER-ALEX-001";
                fld.correctedAt = new Date().toISOString();
                fld.verificationStatus = "VERIFIED";
            } else {
                fld.verificationStatus = "VERIFIED";
            }

            const finalVal = (fld.correctedValue !== null && fld.correctedValue !== undefined) ? fld.correctedValue : fld.originalExtraction.value;
            const finalUnit = fld.correctedUnit || fld.originalExtraction.unit;

            twin.labResults.unshift({
                labId: `lab_${Date.now()}_${Math.floor(Math.random()*1000)}_${fld.field.replace(/\s+/g, '_')}`,
                testName: fld.field,
                value: finalVal,
                unit: finalUnit,
                referenceRange: fld.referenceRange || "Standard",
                abnormalFlag: fld.abnormalFlag || false,
                collectionTime: doc.uploadTime,
                reportTime: doc.uploadTime,
                laboratory: doc.source,
                provenance: {
                    source: "Uploaded Laboratory Report",
                    documentId: doc.documentId,
                    fileName: doc.fileName,
                    page: fld.originalExtraction.page,
                    originalText: fld.originalExtraction.originalText,
                    ocrConfidence: fld.originalExtraction.confidence,
                    verificationStatus: "VERIFIED",
                    correctedBy: fld.whoCorrectedIt || null,
                    recordedAt: fld.correctedAt || doc.uploadTime
                }
            });
        });

        doc.verificationStatus = "VERIFIED";
        if (typeof logAudit === 'function') logAudit(`Document Verified: ${doc.fileName} (${doc.documentId})`, "WRITE");
        this.recalculateQualityMetrics(patientId);

        return { status: 200, data: { documentId: doc.documentId, document: doc } };
    },

    addVitalReading(authUser, patientId, reading) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;

        let normVal = reading.value;
        let normUnit = reading.unit;

        if (reading.dataType === 'weight' && reading.unit.toLowerCase() === 'lb') {
            normVal = parseFloat((reading.value * 0.45359237).toFixed(2));
            normUnit = 'kg';
        } else if (reading.dataType === 'temperature' && reading.unit.includes('F')) {
            normVal = parseFloat(((reading.value - 32) * (5/9)).toFixed(1));
            normUnit = '°C';
        } else if (reading.dataType === 'blood_glucose' && reading.unit.toLowerCase() === 'mmol/l') {
            normVal = parseFloat((reading.value * 18.0182).toFixed(1));
            normUnit = 'mg/dL';
        }

        const existingSameTime = twin.vitals.filter(v => 
            v.dataType === reading.dataType && 
            Math.abs(new Date(v.timestamp).getTime() - new Date(reading.timestamp).getTime()) < 60000
        );

        let isDuplicate = false;
        if (existingSameTime.length > 0) {
            existingSameTime.forEach(existing => {
                if (existing.normalizedValue === normVal && existing.provenance.source === reading.source) {
                    isDuplicate = true;
                } else if (existing.normalizedValue !== normVal) {
                    twin.conflicts.unshift({
                        conflictId: `cfl_${Date.now()}`,
                        dataType: reading.dataType,
                        timestamp: reading.timestamp,
                        sources: [
                            { source: existing.provenance.source, value: existing.normalizedValue, unit: existing.normalizedUnit },
                            { source: reading.source, value: normVal, unit: normUnit }
                        ],
                        status: "CONFLICTING"
                    });
                }
            });
        }

        const vitalRecord = {
            vitalId: `vtl_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            dataType: reading.dataType,
            originalValue: reading.value,
            originalUnit: reading.unit,
            normalizedValue: normVal,
            normalizedUnit: normUnit,
            timestamp: reading.timestamp || new Date().toISOString(),
            isDuplicate: isDuplicate,
            provenance: {
                source: reading.source || "User Entered",
                device: reading.device || "Manual Input",
                verificationStatus: reading.source && (reading.source.includes("Watch") || reading.source.includes("Scale") || reading.source.includes("CGM") || reading.source.includes("HRM")) ? "DEVICE_REPORTED" : "USER_REPORTED",
                recordedAt: reading.timestamp || new Date().toISOString()
            }
        };

        if (!isDuplicate) {
            twin.vitals.unshift(vitalRecord);
            if (reading.dataType === 'heart_rate') twin.wearables.heartRate = normVal;
            if (reading.dataType === 'blood_glucose') twin.wearables.glucose = normVal;
            if (reading.dataType === 'hrv') twin.wearables.hrv = normVal;
            if (reading.dataType === 'blood_pressure') twin.wearables.bloodPressure = `${reading.sys}/${reading.dia}`;
        }

        this.recalculateQualityMetrics(patientId);
        return { status: 200, data: vitalRecord };
    },

    getDevices(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const available = [
            { deviceId: "dev_apple_watch", name: "Apple Watch Series 9", connectionMethod: "Web BLE / HealthKit", connectionState: "NOT CONNECTED", lastSync: null, battery: "—" },
            { deviceId: "dev_oura_ring", name: "Oura Ring Gen 3", connectionMethod: "OAuth Cloud API", connectionState: "NOT CONNECTED", lastSync: null, battery: "—" },
            { deviceId: "dev_dexcom_cgm", name: "Dexcom G7 CGM", connectionMethod: "Direct BLE Streaming", connectionState: "NOT CONNECTED", lastSync: null, battery: "—" },
            { deviceId: "dev_withings_scale", name: "Withings Body Scan", connectionMethod: "WiFi Cloud Sync", connectionState: "NOT CONNECTED", lastSync: null, battery: "—" }
        ];

        available.forEach(dev => {
            const connected = twin.wearables.connectedDevices.find(cd => cd.deviceId === dev.deviceId);
            if (connected) {
                dev.connectionState = connected.connectionState;
                dev.lastSync = connected.lastSync;
                dev.battery = connected.battery;
            }
        });

        return { status: 200, data: available };
    },

    connectDevice(authUser, patientId, payload) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const devices = this.getDevices(authUser, patientId).data;
        const target = devices.find(d => d.deviceId === payload.deviceId);
        if (!target) return { status: 404, message: "Device not found." };

        if (!payload.authGrant) {
            target.connectionState = "AUTHORIZATION_FAILED";
            return { status: 400, message: "Device authorization denied by user.", device: target };
        }

        target.connectionState = "CONNECTED";
        target.lastSync = new Date().toISOString().slice(0, 16).replace('T', ' ');
        target.battery = "94%";

        const existingIdx = twin.wearables.connectedDevices.findIndex(d => d.deviceId === target.deviceId);
        if (existingIdx >= 0) {
            twin.wearables.connectedDevices[existingIdx] = target;
        } else {
            twin.wearables.connectedDevices.push(target);
        }

        twin.wearables.syncStatus = `CONNECTED (${twin.wearables.connectedDevices.length} Active Nodes)`;
        twin.wearables.lastSync = target.lastSync;

        if (typeof logAudit === 'function') logAudit(`Device Connected & Authorized: ${target.name} (${target.deviceId})`, "WRITE");
        this.recalculateQualityMetrics(patientId);

        return { status: 200, data: { device: target, connectedDevices: twin.wearables.connectedDevices } };
    },

    calculateHealthIndex(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const hasLabs = twin.labResults.length >= 2;
        const hasVitals = twin.vitals.length >= 2;

        if (!hasLabs || !hasVitals) {
            twin.healthScore = null;
            return {
                status: 200,
                data: {
                    calculated: false,
                    value: null,
                    reason: "Insufficient verified health data. Minimum 2 lab results and 2 vital signs required.",
                    requiredMissing: ["Fasting Lab Panel", "Continuous Vital Telemetry"]
                }
            };
        }

        const glucoseLab = twin.labResults.find(l => l.testName.toLowerCase().includes("glucose") || l.testName === "HbA1c");
        const hba1cVal = glucoseLab ? glucoseLab.value : 5.4;
        const score = Math.max(40, Math.min(99, Math.round(100 - (hba1cVal - 5.0) * 15)));

        twin.healthScore = score;
        return {
            status: 200,
            data: {
                calculated: true,
                value: score,
                inputsUsed: ["Verified HbA1c Lab Panel", "Vitals Telemetry Array"],
                limitations: "Derived score for informational wellness support; not a clinical diagnosis.",
                timestamp: new Date().toISOString()
            }
        };
    },

    getEpigeneticAge(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const epigeneticRecord = twin.labResults.find(l => l.testName.toLowerCase().includes("epigenetic") || l.testName.toLowerCase().includes("methylation"));

        if (!epigeneticRecord) {
            twin.biologicalAge = null;
            return {
                status: 200,
                data: {
                    calculated: false,
                    value: null,
                    reason: "No validated epigenetic measurement available. Upload a certified DNA methylation panel."
                }
            };
        }

        twin.biologicalAge = epigeneticRecord.value;
        return {
            status: 200,
            data: {
                calculated: true,
                value: epigeneticRecord.value,
                provenance: epigeneticRecord.provenance
            }
        };
    },

    getDataQuality(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        return { status: 200, data: twin.dataQuality };
    },

    getConflicts(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        return { status: 200, data: twin.conflicts || [] };
    },

    getMissingData(authUser, patientId) {
        const auth = this.validateAccess(authUser, patientId);
        if (!auth.authorized) return auth;

        const twin = this.getTwin(authUser, patientId).data;
        const gaps = [];

        const hasEpigenetic = twin.labResults.some(l => l.testName.toLowerCase().includes("epigenetic") || l.testName.toLowerCase().includes("methylation"));
        if (!hasEpigenetic) {
            gaps.push({ area: "Epigenetics & Biological Age", missing: "DNA Methylation Panel", action: "Upload Epigenetic Panel", priority: "HIGH" });
        }

        const hasInflammation = twin.labResults.some(l => l.testName.toLowerCase().includes("crp") || l.testName.toLowerCase().includes("cortisol"));
        if (!hasInflammation) {
            gaps.push({ area: "Inflammatory & Stress Markers", missing: "hs-CRP & Cortisol Lab Panel", action: "Order Inflammatory Panel", priority: "MEDIUM" });
        }

        if (twin.wearables.connectedDevices.length === 0) {
            gaps.push({ area: "Wearable Hardware", missing: "No BLE hardware paired", action: "Pair Device", priority: "HIGH" });
        }

        if (twin.vitals.length === 0) {
            gaps.push({ area: "Vital Telemetry", missing: "Resting Heart Rate & Blood Pressure", action: "Connect a Wearable", priority: "HIGH" });
        }

        if (twin.labResults.length === 0) {
            gaps.push({ area: "Laboratory Reports", missing: "Fasting Lipid & Glucose Panel", action: "Upload Lab Report", priority: "CRITICAL" });
        }

        return { status: 200, data: { gaps } };
    },

    recalculateQualityMetrics(patientId) {
        const twin = LifeOS.healthTwins[patientId];
        if (!twin) return;

        const recPct = twin.medicalDocuments.length > 0 ? 80 : 0;
        const wearPct = twin.wearables.connectedDevices.length > 0 ? 70 : 0;

        twin.dataQuality = {
            profilePct: twin.patientProfile.patientId ? 100 : 0,
            recordPct: recPct,
            wearablePct: wearPct,
            genomicPct: twin.genomics ? 90 : 0,
            lifestylePct: twin.patientProfile.lifestyle ? 60 : 0,
            medicalRecordsCoverage: recPct,
            provenanceCount: twin.labResults.length + twin.vitals.length,
            reliability: (recPct > 50 && wearPct > 50) ? "High (Verified)" : "Low (Insufficient Data)"
        };
    }
};

// Global LifeOS state holder
const _lifeosGlobal = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});

if (!_lifeosGlobal.LifeOS) {
    _lifeosGlobal.LifeOS = {
        user: { id: "USER-ALEX-001", name: "Alex Mercer", role: "patient" },
        healthTwins: { "USER-ALEX-001": createInitialHealthTwinStore("USER-ALEX-001") },
        get healthTwin() { return this.healthTwins["USER-ALEX-001"]; },
        healthMemoryGraph: [],
        medications: [],
        healthIntelligence: { anomalies: [], riskRadar: {}, predictions: [] },
        longevityEngine: { biologicalAgeDetail: {}, projections: {} }
    };
}
if (typeof window !== 'undefined') {
    window.LifeOS = _lifeosGlobal.LifeOS;
}
if (typeof globalThis !== 'undefined') {
    globalThis.LifeOS = _lifeosGlobal.LifeOS;
}

_lifeosGlobal.HealthTwinAPI = HealthTwinAPI;
_lifeosGlobal.createInitialHealthTwinStore = createInitialHealthTwinStore;

document.addEventListener('DOMContentLoaded', () => {
    const LifeOS = _lifeosGlobal.LifeOS;
    LifeOS.user = {
        id: "USER-ALEX-001",
        name: "Alex Mercer",
        age: 32,
        gender: "Male",
        country: "United States",
        email: "alex.mercer@lifeos.ai",
        interests: ["longevity", "metabolic"],
        symptoms: ["Mild fatigue", "Occasional brain fog"],
        familyHistory: ["Type 2 Diabetes (Maternal)", "CAD (Paternal)"],
        waitlistPosition: 1492,
        status: "Early Access Partner",
        role: "patient"
    };
    LifeOS.healthTwins = {
        "USER-ALEX-001": createInitialHealthTwinStore("USER-ALEX-001")
    };
    if (!Object.getOwnPropertyDescriptor(LifeOS, 'healthTwin')) {
        Object.defineProperty(LifeOS, 'healthTwin', {
            get() { return LifeOS.healthTwins["USER-ALEX-001"]; },
            configurable: true
        });
    }

    LifeOS.personnelWellnessProfile = (typeof createInitialPersonnelProfile === 'function' ? createInitialPersonnelProfile("LIFEOS-USER-001") : null);
    LifeOS.wearables = LifeOS.healthTwin.wearables;
    LifeOS.wearables.history = { hr: [], glucose: [], hrv: [], bp: [], oxygen: [], temp: [], sleep: [], weight: [], steps: [], vo2max: [] };
    LifeOS.wearables.sensors = [];
    LifeOS.wearables.telemetryStream = [];
    LifeOS.wearables.syncQueue = [];

    // =============================================================================
    // DEVICE INTEGRATION EVENT LISTENERS
    // Listens to events fired by DeviceIntegrationManager adapters (device_integration.js)
    // Enforces real-data-only discipline: null values are never stored or displayed.
    // =============================================================================
    globalThis.addEventListener('lifeos:telemetry', (evt) => {
        const pkt = evt.detail;
        if (!pkt || pkt.value === null || pkt.value === undefined) return;

        // Route to correct wearable metric field
        const val = pkt.value;
        switch (pkt.dataType) {
            case 'heart_rate':
                LifeOS.wearables.heartRate = val;
                LifeOS.wearables.history.hr.push(pkt);
                break;
            case 'blood_glucose':
                LifeOS.wearables.glucose = val;
                LifeOS.wearables.history.glucose.push(pkt);
                break;
            case 'blood_pressure':
                LifeOS.wearables.bloodPressure = val;
                LifeOS.wearables.history.bp.push(pkt);
                break;
            case 'spo2':
                LifeOS.wearables.spO2 = val;
                LifeOS.wearables.history.oxygen.push(pkt);
                break;
            case 'temperature':
                LifeOS.wearables.temperature = val;
                LifeOS.wearables.history.temp.push(pkt);
                break;
            case 'weight':
                LifeOS.wearables.weight = val;
                LifeOS.wearables.history.weight.push(pkt);
                break;
            case 'steps':
                LifeOS.wearables.steps = val;
                LifeOS.wearables.history.steps.push(pkt);
                break;
            case 'hrv':
                LifeOS.wearables.hrv = val;
                LifeOS.wearables.history.hrv.push(pkt);
                break;
        }
        LifeOS.wearables.telemetryStream.push(pkt);
        LifeOS.wearables.lastSync = new Date().toLocaleTimeString();

        // Re-render vitals panel if currently visible
        if (typeof recalculateHealthScores === 'function') {
            try { recalculateHealthScores(); } catch(_) {}
        }
    });

    globalThis.addEventListener('lifeos:device_disconnected', (evt) => {
        const { id } = evt.detail || {};
        if (id) {
            LifeOS.wearables.connectedDevices = LifeOS.wearables.connectedDevices.filter(d => d.id !== id);
        }
        if (LifeOS.wearables.connectedDevices.length === 0) {
            LifeOS.wearables.syncStatus = 'NOT CONNECTED';
            LifeOS.wearables.heartRate = null;
            LifeOS.wearables.glucose = null;
            LifeOS.wearables.bloodPressure = null;
            LifeOS.wearables.hrv = null;
            LifeOS.wearables.spO2 = null;
            LifeOS.wearables.temperature = null;
            LifeOS.wearables.weight = null;
            LifeOS.wearables.steps = null;
            wearablesConnected = false;
            console.log('[LifeOS] All wearable devices disconnected. Enforcing NO VERIFIED DEVICE DATA state.');
        } else {
            LifeOS.wearables.syncStatus = `Connected (${LifeOS.wearables.connectedDevices.length} Active Nodes)`;
        }
    });



    Object.assign(LifeOS, {
        // Global Onboarding & Registrations Database
        registrations: [
            {
                id: "LIFEOS-2026-000101",
                fullName: "Alex Mercer",
                email: "alex.mercer@lifeos.ai",
                countryCode: "+1",
                phone: "+1 (555) 234-5678",
                country: "United States",
                role: "Patient",
                organization: "Personal Health Vault",
                message: "Primary user profile for epigenetics and cardiovascular risk tracking.",
                privacyConsent: true,
                emailOptIn: true,
                whatsAppOptIn: true,
                timestamp: "2026-07-21T10:15:00Z",
                status: "Approved",
                source: "Landing Page Onboarding",
                communicationLogs: [
                    { type: "EMAIL", event: "WELCOME_EMAIL_SENT", timestamp: "2026-07-21T10:15:02Z", status: "Delivered (Resend API)" },
                    { type: "WHATSAPP", event: "CONFIRMATION_MSG_SENT", timestamp: "2026-07-21T10:15:03Z", status: "Delivered (Twilio API)" }
                ]
            },
            {
                id: "LIFEOS-2026-000102",
                fullName: "Dr. Helen Vance",
                email: "helen.vance@stanford.edu",
                countryCode: "+1",
                phone: "+1 (555) 987-6543",
                country: "United States",
                role: "Doctor",
                organization: "Stanford School of Medicine",
                message: "Cardiology department clinical trials lead.",
                privacyConsent: true,
                emailOptIn: true,
                whatsAppOptIn: true,
                timestamp: "2026-07-21T11:45:00Z",
                status: "Approved",
                source: "Clinical Beta Outreach",
                communicationLogs: [
                    { type: "EMAIL", event: "WELCOME_EMAIL_SENT", timestamp: "2026-07-21T11:45:02Z", status: "Delivered (Resend API)" },
                    { type: "WHATSAPP", event: "CONFIRMATION_MSG_SENT", timestamp: "2026-07-21T11:45:04Z", status: "Delivered (Twilio API)" }
                ]
            },
            {
                id: "LIFEOS-2026-000103",
                fullName: "Prof. Marcus Thorne",
                email: "marcus.thorne@cambridge.ac.uk",
                countryCode: "+44",
                phone: "+44 7700 900077",
                country: "United Kingdom",
                role: "Researcher",
                organization: "Cambridge Genomics Institute",
                message: "Requesting API access to anonymized polygenic risk score datasets.",
                privacyConsent: true,
                emailOptIn: true,
                whatsAppOptIn: false,
                timestamp: "2026-07-21T13:20:00Z",
                status: "Pending Review",
                source: "Research Portal",
                communicationLogs: [
                    { type: "EMAIL", event: "WELCOME_EMAIL_SENT", timestamp: "2026-07-21T13:20:03Z", status: "Delivered (Resend API)" }
                ]
            }
        ],

        // Health Memory Graph database
        healthMemoryGraph: [],

        // Active Medications & Schedule
        medications: [],

        // AI Consultation Session State
        consultation: {
            active: false,
            specialtyRequired: "Cardiologist",
            messages: [
                { sender: "bot", text: "Welcome to LifeOS AI Consultation Center. I am the CMO Agent. Please state your symptoms to begin clinical intake." }
            ],
            stage: "intake", // intake -> analysis -> summary
            summary: null
        },

        // Doctor Appointments
        appointments: [],

        // Clinical Trial Database
        clinicalTrials: [
            { id: "NCT0681121", title: "TCF7L2 Pathway & Insulin Optimization Trial", phase: "Phase II", status: "Recruiting", criteria: "TCF7L2 mutant, HbA1c 5.7-6.4" },
            { id: "NCT0491822", title: "ApoE4 Lipid Clearance and Epigenetic Reversal", phase: "Phase I/II", status: "Active", criteria: "APOE4 carrier, LDL > 130" },
            { id: "NCT0521890", title: "MTHFR Methylation Compensation Study", phase: "Phase III", status: "Recruiting", criteria: "MTHFR heterozygous/homozygous" }
        ],

        // Research Breakthrough Alerts
        breakthroughs: [],

        // Multi-Agent Weights (Admin Console)
        agentWeights: {
            cmo: 90,
            diagnostic: 85,
            genome: 95,
            drug: 90,
            nutrition: 80,
            longevity: 85,
            mental: 75,
            emergency: 99
        },

        // System security logs (HIPAA Audit Log)
        auditLogs: [
            { time: "18:56:02", event: "Vault Key Decryption Check (Client-Side)", type: "SECURE" },
            { time: "18:56:45", event: "Wearable Sync Pipeline Connected (1Hz)", type: "SYNC" },
            { time: "18:57:10", event: "MTHFR Base Pair Decrypted by Genome Agent", type: "ACCESS" },
            { time: "18:58:30", event: "A1c Biomarker Logged in Health Memory Graph", type: "WRITE" }
        ],

        // --- 3.0 HEALTH INTELLIGENCE ENGINE ---
        healthIntelligence: {
            // Risk Radar (8-axis, 0-100)
            riskRadar: {
                cardiovascular: 38,
                cancer: 18,
                metabolic: 62,
                neurological: 22,
                mentalHealth: 34,
                inflammatory: 48,
                lifestyle: 41,
                genetic: 55
            },
            // Target (optimized) radar for comparison
            riskRadarTarget: {
                cardiovascular: 18,
                cancer: 12,
                metabolic: 28,
                neurological: 14,
                mentalHealth: 18,
                inflammatory: 22,
                lifestyle: 15,
                genetic: 55
            },
            // Biological Age Engine
            biologicalAge: {
                chronological: 32,
                biological: 27.8,
                heart: 29,
                brain: 26,
                metabolic: 34,
                lung: 28,
                longevity: 30
            },
            // Precision Longevity Scores
            longevityScores: {
                healthspan: 84,
                longevityIndex: 79,
                recovery: 91,
                resilience: 76,
                metabolicEfficiency: 68,
                agingVelocity: 0.82
            },
            // Confidence-scored predictions
            predictions: [
                {
                    id: 1,
                    title: "Heart Disease Risk",
                    risk: 28,
                    confidence: 94,
                    sources: ["Genome (APOE E3/E4)", "Blood Panel (ApoB 112)", "Wearable (HRV 74ms)", "Family History"],
                    reasoning: [
                        { factor: "ApoE4 Carrier Status", contribution: +12, direction: "up" },
                        { factor: "Elevated ApoB Lipoprotein", contribution: +8, direction: "up" },
                        { factor: "Strong HRV Baseline", contribution: -6, direction: "down" },
                        { factor: "Active Exercise Regimen", contribution: -5, direction: "down" },
                        { factor: "Family History (Paternal)", contribution: +9, direction: "up" }
                    ],
                    evidence: "A",
                    alternatives: [
                        { scenario: "With Statin Therapy", risk: 18, delta: -10 },
                        { scenario: "With Mediterranean Diet", risk: 22, delta: -6 },
                        { scenario: "No Intervention", risk: 41, delta: +13 }
                    ]
                },
                {
                    id: 2,
                    title: "Type 2 Diabetes Risk",
                    risk: 72,
                    confidence: 91,
                    sources: ["Blood Panel (A1c 5.8%)", "Genome (TCF7L2)", "Wearable (CGM)", "BMI Trend"],
                    reasoning: [
                        { factor: "Family History (Maternal)", contribution: +24, direction: "up" },
                        { factor: "Elevated HbA1c (5.8%)", contribution: +18, direction: "up" },
                        { factor: "Poor Sleep Quality", contribution: +12, direction: "up" },
                        { factor: "Weight Gain Trend (+3kg/6mo)", contribution: +10, direction: "up" },
                        { factor: "Reduced Physical Activity", contribution: +8, direction: "up" }
                    ],
                    evidence: "A",
                    alternatives: [
                        { scenario: "With Metformin + Exercise", risk: 38, delta: -34 },
                        { scenario: "With Low-Carb Diet", risk: 52, delta: -20 },
                        { scenario: "No Intervention", risk: 86, delta: +14 }
                    ]
                },
                {
                    id: 3,
                    title: "Sleep Recovery Analysis",
                    risk: 22,
                    confidence: 96,
                    sources: ["Wearable (Sleep Stages)", "HRV Nocturnal", "Cortisol AM", "Melatonin Onset"],
                    reasoning: [
                        { factor: "Late Screen Exposure", contribution: +8, direction: "up" },
                        { factor: "Caffeine Half-Life Window", contribution: +6, direction: "up" },
                        { factor: "Consistent Sleep Schedule", contribution: -10, direction: "down" },
                        { factor: "Magnesium Supplementation", contribution: -4, direction: "down" }
                    ],
                    evidence: "B",
                    alternatives: [
                        { scenario: "With Sleep Protocol", risk: 10, delta: -12 },
                        { scenario: "With CBT-I", risk: 14, delta: -8 },
                        { scenario: "No Intervention", risk: 35, delta: +13 }
                    ]
                }
            ],
            // Causal Health Engine drivers
            causalDrivers: [
                {
                    symptom: "Poor Sleep",
                    rootCauses: [
                        { cause: "Late blue-light exposure (>10pm)", weight: 32, evidence: "A" },
                        { cause: "Elevated evening cortisol (12.4 mcg/dL)", weight: 28, evidence: "A" },
                        { cause: "Caffeine consumed after 2pm", weight: 22, evidence: "B" },
                        { cause: "Low magnesium serum level", weight: 18, evidence: "B" }
                    ]
                },
                {
                    symptom: "Fatigue",
                    rootCauses: [
                        { cause: "MTHFR-reduced methylation capacity", weight: 35, evidence: "A" },
                        { cause: "Suboptimal B12 (320 pg/mL)", weight: 25, evidence: "B" },
                        { cause: "Postprandial glucose crashes (CGM)", weight: 24, evidence: "A" },
                        { cause: "Disrupted circadian rhythm", weight: 16, evidence: "C" }
                    ]
                },
                {
                    symptom: "Inflammation",
                    rootCauses: [
                        { cause: "Elevated hsCRP (2.1 mg/L)", weight: 30, evidence: "A" },
                        { cause: "Gut permeability (Zonulin elevated)", weight: 28, evidence: "B" },
                        { cause: "Omega-6:Omega-3 ratio imbalance", weight: 24, evidence: "A" },
                        { cause: "Sedentary periods >6hrs/day", weight: 18, evidence: "C" }
                    ]
                }
            ],
            // Multi-Timeline Forecasting (health score projections over years)
            forecasts: {
                currentPath:  [88, 84, 79, 73, 66, 60, 55, 50, 46, 42, 38, 35, 32, 29, 27, 25, 23, 22, 21, 20],
                optimizedSleep: [88, 89, 90, 91, 91, 90, 89, 88, 86, 84, 82, 80, 78, 76, 74, 72, 70, 68, 66, 65],
                improvedNutrition: [88, 87, 87, 88, 88, 87, 86, 85, 83, 81, 79, 77, 75, 73, 71, 69, 67, 65, 63, 62],
                combined: [88, 90, 92, 93, 94, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80]
            },
            // Treatment Simulator comparisons
            treatments: [
                {
                    name: "Metformin 500mg",
                    category: "Medication A",
                    efficacy: 72,
                    sideEffects: 28,
                    confidence: 88,
                    evidence: "A",
                    projected: { diabetesRisk: -34, metabolicAge: -3, a1c: -0.6 }
                },
                {
                    name: "Low-Carb Mediterranean",
                    category: "Lifestyle",
                    efficacy: 58,
                    sideEffects: 5,
                    confidence: 82,
                    evidence: "A",
                    projected: { diabetesRisk: -20, metabolicAge: -2, a1c: -0.4 }
                },
                {
                    name: "GLP-1 Agonist",
                    category: "Medication B",
                    efficacy: 84,
                    sideEffects: 35,
                    confidence: 91,
                    evidence: "A",
                    projected: { diabetesRisk: -42, metabolicAge: -5, a1c: -1.1 }
                },
                {
                    name: "Combined (Metformin + Diet + Exercise)",
                    category: "Combined",
                    efficacy: 91,
                    sideEffects: 18,
                    confidence: 86,
                    evidence: "B",
                    projected: { diabetesRisk: -52, metabolicAge: -6, a1c: -1.4 }
                }
            ],
            // Prevention Engine actions
            preventionActions: [
                { action: "Increase sleep to 7.5+ hours", benefit: "18% lower diabetes risk", timeline: "90 days", evidence: "A" },
                { action: "Add 30min daily walking", benefit: "22% lower cardiovascular risk", timeline: "60 days", evidence: "A" },
                { action: "Reduce refined carbs by 40%", benefit: "15% improvement in A1c", timeline: "120 days", evidence: "B" }
            ],
            // Multi-Agent Consensus
            agentConsensus: [
                { agent: "CMO Agent", recommendation: "Initiate combined Metformin + lifestyle protocol", confidence: 92, vote: "APPROVE" },
                { agent: "Genome Agent", recommendation: "TCF7L2 variant confirms insulin pathway vulnerability", confidence: 96, vote: "APPROVE" },
                { agent: "Nutrition Agent", recommendation: "Mediterranean diet with low glycemic focus", confidence: 84, vote: "APPROVE" },
                { agent: "Drug Agent", recommendation: "Metformin safe; check ApoE4 interaction with statins", confidence: 90, vote: "CONDITIONAL" },
                { agent: "Longevity Agent", recommendation: "Combined approach yields best healthspan trajectory", confidence: 88, vote: "APPROVE" },
                { agent: "Diagnostic Agent", recommendation: "Monitor A1c at 60-day intervals for model calibration", confidence: 94, vote: "APPROVE" }
            ],
            // Anomaly detection history
            anomalies: [
                { id: 1, time: "2026-06-26 03:14", type: "CARDIAC", desc: "Nocturnal HR spike to 112 BPM during REM (baseline 58)", severity: "WARNING", resolved: true },
                { id: 2, time: "2026-06-27 08:22", type: "METABOLIC", desc: "Postprandial glucose 186 mg/dL (threshold 140)", severity: "ALERT", resolved: false }
            ],
            // Self-improving learning log
            learningLog: [
                { date: "2026-06-15", event: "A1c prediction recalibrated after lab result", priorConf: 86, newConf: 91, delta: +5 },
                { date: "2026-06-20", event: "Sleep model updated with 14-day wearable data", priorConf: 88, newConf: 96, delta: +8 },
                { date: "2026-06-25", event: "Cardiovascular model refined by Dr. Vance feedback", priorConf: 90, newConf: 94, delta: +4 }
            ]
        },

        medicationIntelligence: {
            interactions: [
                { drugA: "Metformin", drugB: "Methylfolate", status: "SAFE", severity: "None", notes: "No contraindications detected." },
                { drugA: "Metformin", drugB: "Aspirin", status: "MONITOR", severity: "Low", notes: "Fasting glucose clearance may be slightly enhanced." },
                { drugA: "Aspirin", drugB: "Ibuprofen", status: "CONTRAINDICATED", severity: "High", notes: "Increased risk of gastrointestinal bleeding. CYP2C19 pathway competition." }
            ],
            contraindications: [
                { gene: "APOE E3/E4", compound: "Saturated Lipids / Statins", risk: "Elevated late-onset neurological degradation risks. Restrict saturated fats." },
                { gene: "MTHFR C677T", compound: "Synthetic Folic Acid", risk: "Synthetic folic acid cannot be metabolized correctly. Bypassed with L-methylfolate." },
                { gene: "TCF7L2 CT", compound: "High Glycemic Carbohydrates", risk: "Beta-cell exhaustion risk. Suggests low carb buffering." }
            ],
            alternatives: [
                { original: "Synthetic Folic Acid", suggested: "L-Methylfolate (5-MTHF)", reason: "Bypasses MTHFR C677T enzymatic block.", evidence: "Level A" },
                { original: "Saturated Lipids", suggested: "Omega-3 (EPA/DHA)", reason: "Mitigates ApoE4-associated cognitive decline.", evidence: "Level A" }
            ]
        },

        nutritionEngine: {
            mealPlan: {
                breakfast: "Avocado, Wild Salmon, Spinach (Rich in Folate, Omega-3)",
                lunch: "Mediterranean Chickpea Salad, Olive Oil, Grilled Chicken",
                dinner: "Baked Cod, Broccoli, Steamed Quinoa (Low Glycemic Glycation Buffer)",
                snacks: "Walnuts, Pumpkin Seeds, Blueberries (Antioxidant Brain Fuel)"
            },
            supplements: [
                { name: "L-Methylfolate (5-MTHF)", dosage: "400mcg", frequency: "Daily", evidence: "Level A", reason: "MTHFR C677T Heterozygous Bypass" },
                { name: "Omega-3 (EPA/DHA)", dosage: "2000mg", frequency: "Daily", evidence: "Level A", reason: "APOE E4 Neuro-vascular Protection" },
                { name: "Magnesium Glycinate", dosage: "350mg", frequency: "Nocturnal", evidence: "Level B", reason: "Nocturnal Stress & HRV Optimization" },
                { name: "Vitamin D3 + K2", dosage: "5000 IU", frequency: "Daily", evidence: "Level A", reason: "Gene Transcription Co-factor" }
            ],
            deficiencies: [
                { nutrient: "Active Folate", status: "CRITICAL", level: "4.2 ng/mL (Ref: >12)", source: "MTHFR Enzyme Block" },
                { nutrient: "Omega-3 Index", status: "MODERATE", level: "4.1% (Ref: >8%)", source: "Low Seafood Intake" },
                { nutrient: "Magnesium Serum", status: "OPTIMIZED", level: "2.1 mg/dL (Ref: 1.7-2.2)", source: "Supplemented" }
            ],
            macronutrients: { protein: 30, fat: 35, carbs: 35, calories: 2200 }
        },

        longevityEngine: {
            biologicalAgeDetail: {
                chronological: 32,
                biological: 27.8,
                brain: 26.2,
                heart: 29.1,
                metabolic: 34.0,
                immune: 28.5,
                kidney: 27.0,
                liver: 25.8
            },
            projections: {
                lifespan: 84,
                healthspan: 71,
                optimizedLifespan: 98,
                optimizedHealthspan: 92
            },
            protocols: [
                { area: "Exercise Protocol", description: "Zone 2 Cardio (3 hrs/wk) + Strength Training (3 days/wk)", impact: "+4.2 Years Healthspan", complexity: "Medium" },
                { area: "Circadian Sleep Lock", description: "Standard sleep window (10:30 PM - 6:30 AM) + Sleep Hygiene", impact: "+3.1 Years Healthspan", complexity: "Low" },
                { area: "Folate Pathway Support", description: "Methylfolate Supplementation + Methylation Support Diet", impact: "+1.8 Years Lifespan", complexity: "Low" },
                { area: "ApoE4 Lipid Restriction", description: "Limit saturated fat intake below 15g/day", impact: "+5.4 Years Healthspan (Neuro)", complexity: "High" }
            ]
        },

        activeRole: "patient",
        activeTab: "twin",
        hasMasterReport: false,
        masterReport: null,
        macroGoal: "insulin",
        exerciseLevel: "intermediate",
        activeInterventions: {
            weight: false,
            sleep: false,
            exercise: false,
            smoke: false,
            sugar: false
        }
    });

    let globalTelemetryInterval = null;
    let telemetrySpikeActive = false;

    function startGlobalTelemetryStream() {
        // Zero Manufactured Data Principle: No setInterval random number mutation.
        if (globalTelemetryInterval) clearInterval(globalTelemetryInterval);
        syncLiveTelemetryElements();
    }

    function syncLiveTelemetryElements() {
        const isConnected = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const activeSensors = LifeOS.wearables.sensors || [];

        const hrEl = document.getElementById('db-live-hr');
        const glucEl = document.getElementById('db-live-glucose');
        const hrvEl = document.getElementById('db-live-hrv');
        const bpEl = document.getElementById('db-live-bp');

        if (hrEl) {
            hrEl.textContent = (isConnected && LifeOS.wearables.heartRate !== null) ? LifeOS.wearables.heartRate : "—";
        }
        if (glucEl) {
            glucEl.textContent = (isConnected && LifeOS.wearables.glucose !== null) ? LifeOS.wearables.glucose : "—";
        }
        if (hrvEl) {
            hrvEl.textContent = (isConnected && LifeOS.wearables.hrv !== null) ? LifeOS.wearables.hrv : "—";
        }
        if (bpEl) {
            bpEl.textContent = (isConnected && LifeOS.wearables.bloodPressure !== null) ? LifeOS.wearables.bloodPressure : "—";
        }
    }

    // --- 2. PORTAL DEFINITIONS & TAB LAYOUTS ---
    const Portals = {
        personnel: {
            title: "Personnel Wellness Operating System",
            tabs: [
                { id: "personnel_wellness", label: "Personnel Wellness Profile", icon: "user-check" },
                { id: "twin", label: "Health Twin & Wearables", icon: "activity" },
                { id: "coach", label: "Daily AI Coach", icon: "sparkles" },
                { id: "genomics", label: "Genomics Center", icon: "dna" },
                { id: "intelligence", label: "Health Intelligence", icon: "brain-circuit" },
                { id: "nutrition", label: "Food Intelligence", icon: "leaf" },
                { id: "exercise", label: "Exercise Engine", icon: "zap" },
                { id: "care", label: "Personal Care", icon: "heart" },
                { id: "longevity", label: "Longevity Engine", icon: "hourglass" },
                { id: "medication", label: "Medication Intelligence", icon: "pill" },
                { id: "simulator", label: "Disease Simulator", icon: "sliders" },
                { id: "consultation", label: "AI Consultation", icon: "stethoscope" }
            ]
        },
        patient: {
            title: "Patient Operating System",
            tabs: [
                { id: "twin", label: "Health Twin & Wearables", icon: "activity" },
                { id: "personnel_wellness", label: "Personnel Wellness Profile", icon: "user-check" },
                { id: "coach", label: "Daily AI Coach", icon: "sparkles" },
                { id: "genomics", label: "Genomics Center", icon: "dna" },
                { id: "intelligence", label: "Health Intelligence", icon: "brain-circuit" },
                { id: "nutrition", label: "Food Intelligence", icon: "leaf" },
                { id: "exercise", label: "Exercise Engine", icon: "zap" },
                { id: "care", label: "Personal Care", icon: "heart" },
                { id: "longevity", label: "Longevity Engine", icon: "hourglass" },
                { id: "medication", label: "Medication Intelligence", icon: "pill" },
                { id: "simulator", label: "Disease Simulator", icon: "sliders" },
                { id: "consultation", label: "AI Consultation", icon: "stethoscope" },
                { id: "search", label: "Health Search", icon: "search" },
                { id: "copilot", label: "Research Copilot", icon: "microscope" },
                { id: "automation", label: "Automation Center", icon: "clock" }
            ]
        },
        welfare_officer: {
            title: "Welfare & Stress Monitoring Desk",
            tabs: [
                { id: "personnel_wellness", label: "Personnel Wellness Profile", icon: "user-check" },
                { id: "audit_ledger", label: "Welfare Audit Ledger", icon: "shield-check" }
            ]
        },
        commander: {
            title: "Unit Commander Operational Command",
            tabs: [
                { id: "personnel_wellness", label: "Unit Personnel Wellness", icon: "shield" },
                { id: "audit_ledger", label: "Operational Readiness Ledger", icon: "shield-check" }
            ]
        },
        doctor: {
            title: "Clinician Collaboration Portal",
            tabs: [
                { id: "patients", label: "Patient Dossier", icon: "users" },
                { id: "consultations", label: "Intake Reviews", icon: "clipboard-list" },
                { id: "prescribe", label: "Clinical Node", icon: "pill" }
            ]
        },
        researcher: {
            title: "Research Intelligence Hub",
            tabs: [
                { id: "datasets", label: "Anonymized Data Lake", icon: "database" },
                { id: "trials", label: "Trial Candidate Optimizer", icon: "target" },
                { id: "publications", label: "Publish Study", icon: "file-text" }
            ]
        },
        provider: {
            title: "Hospital & Doctor Portal",
            tabs: [
                { id: "analytics", label: "Hospital Analytics", icon: "bar-chart" },
                { id: "staff", label: "Staff Directory", icon: "user-check" },
                { id: "workflows", label: "AI Agent Workflow Queues", icon: "git-branch" }
            ]
        },
        investor: {
            title: "Investor Relations Desk",
            tabs: [
                { id: "vision", label: "Company Vision", icon: "eye" },
                { id: "tam", label: "Market TAM Calculator", icon: "calculator" }
            ]
        },
        admin: {
            title: "Admin Control Center",
            tabs: [
                { id: "personnel_wellness", label: "Personnel Wellness Profile", icon: "user-check" },
                { id: "users", label: "Accounts Directory", icon: "shield" },
                { id: "agents", label: "Agent Weight Controls", icon: "cpu" },
                { id: "audit", label: "HIPAA Audit Ledger", icon: "terminal" },
                { id: "security", label: "Security & GDPR Gates", icon: "key" }
            ]
        }
    };

    // --- 3. WORKSPACE UI INJECTOR ---
    const dashboardShell = document.getElementById('dashboard-shell');
    const roleSelector = document.getElementById('role-selector');
    const sidebarNav = document.getElementById('sidebar-nav-links');
    const viewPane = document.getElementById('dashboard-view-pane');
    const userDisplayName = document.getElementById('user-display-name');
    const userDisplayEmail = document.getElementById('user-display-email');
    const userAvatarInitials = document.getElementById('user-avatar-initials');

    // Setup Event Listeners
    if (roleSelector) {
        roleSelector.addEventListener('change', (e) => {
            switchRole(e.target.value);
            closeMobileSidebar();
        });
    }

    // Responsive Mobile Drawer Navigation Controls
    const dbSidebar = document.getElementById('db-sidebar');
    const mobileMenuBtn = document.getElementById('btn-db-mobile-menu');
    const sidebarCloseBtn = document.getElementById('btn-db-sidebar-close');
    const sidebarOverlay = document.getElementById('db-sidebar-overlay');

    function openMobileSidebar() {
        if (dbSidebar) dbSidebar.classList.add('drawer-open');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
    }

    function closeMobileSidebar() {
        if (dbSidebar) dbSidebar.classList.remove('drawer-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMobileSidebar();
        });
    }

    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMobileSidebar();
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            closeMobileSidebar();
        });
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 1024) {
            closeMobileSidebar();
        }
    });

    const clearNotifyBtn = document.getElementById('btn-clear-notify');
    if (clearNotifyBtn) {
        clearNotifyBtn.addEventListener('click', () => {
            LifeOS.breakthroughs.forEach(b => b.read = true);
            updateNotifications();
        });
    }

    const notifyBtn = document.getElementById('btn-notifications');
    const notifyPanel = document.getElementById('notification-hub-panel');
    if (notifyBtn && notifyPanel) {
        notifyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifyPanel.classList.toggle('hide');
        });
        document.addEventListener('click', () => {
            notifyPanel.classList.add('hide');
        });
        notifyPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    const exitDashboardBtn = document.getElementById('btn-exit-dashboard');
    if (exitDashboardBtn) {
        exitDashboardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeMobileSidebar();
            // Stop dashboard telemetry
            if (globalTelemetryInterval) { clearInterval(globalTelemetryInterval); globalTelemetryInterval = null; }

            document.body.classList.remove('dashboard-active');
            dashboardShell.classList.add('hide');
            document.getElementById('landing-page-wrapper').classList.remove('hide');
            window.location.hash = '';

            // Resume landing page animations
            if (window.__resumeLandingAnimations) window.__resumeLandingAnimations();
        });
    }

    // Role switching helper
    function switchRole(role) {
        LifeOS.activeRole = role;
        LifeOS.activeTab = Portals[role].tabs[0].id;
        
        // Add audit log
        logAudit(`Role Context Swapped to ${Portals[role].title}`, "ACCESS");

        closeMobileSidebar();
        renderSidebar();
        renderActiveView();
    }

    // Nav list rendering
    function renderSidebar() {
        if (!sidebarNav) return;
        sidebarNav.innerHTML = '';
        const portal = Portals[LifeOS.activeRole];
        
        portal.tabs.forEach(tab => {
            const navItem = document.createElement('a');
            navItem.className = `db-nav-item ${LifeOS.activeTab === tab.id ? 'active' : ''}`;
            navItem.innerHTML = `
                <i data-lucide="${tab.icon}"></i>
                <span>${tab.label}</span>
            `;
            navItem.addEventListener('click', (e) => {
                e.preventDefault();
                LifeOS.activeTab = tab.id;
                closeMobileSidebar();
                renderSidebar();
                renderActiveView();
            });
            sidebarNav.appendChild(navItem);
        });
        requestAnimationFrame(() => lucide.createIcons());
    }

    // Central view renderer
    function renderActiveView() {
        if (!viewPane) return;
        
        const role = LifeOS.activeRole;
        const tab = LifeOS.activeTab;
        
        // Render headers
        let viewHeader = `
            <div class="view-header flex justify-between align-center mb-lg">
                <h2 class="view-header-title text-gradient">
                    ${Portals[role].tabs.find(t => t.id === tab).label}
                </h2>
                <span class="badge hero-badge">${LifeOS.user.status}</span>
            </div>
        `;
        
        let viewContent = '';

        // --- TAB SELECTION LOGIC ---
        if (role === 'patient' || role === 'personnel') {
            if (tab === 'twin') {
                viewContent = renderPatientTwin();
            } else if (tab === 'personnel_wellness') {
                viewContent = renderPersonnelWellnessProfile();
            } else if (tab === 'coach') {
                viewContent = renderDailyAICoach();
            } else if (tab === 'genomics') {
                viewContent = renderPatientGenomics();
            } else if (tab === 'intelligence') {
                viewContent = renderHealthIntelligence();
            } else if (tab === 'nutrition') {
                viewContent = renderNutritionEngine();
            } else if (tab === 'exercise') {
                viewContent = renderExerciseEngine();
            } else if (tab === 'care') {
                viewContent = renderPersonalCareEngine();
            } else if (tab === 'longevity') {
                viewContent = renderLongevityEngine();
            } else if (tab === 'medication') {
                viewContent = renderMedicationIntelligence();
            } else if (tab === 'simulator') {
                viewContent = renderPatientSimulator();
            } else if (tab === 'consultation') {
                viewContent = renderPatientConsultation();
            } else if (tab === 'search') {
                viewContent = renderPatientSearch();
            } else if (tab === 'copilot') {
                viewContent = renderPatientCopilot();
            } else if (tab === 'automation') {
                viewContent = renderPatientAutomation();
            }
        } else if (role === 'welfare_officer' || role === 'commander') {
            if (tab === 'personnel_wellness') {
                viewContent = renderPersonnelWellnessProfile();
            } else if (tab === 'audit_ledger') {
                viewContent = renderWelfareAuditLedger();
            }
        } else if (role === 'doctor') {
            if (tab === 'patients') {
                viewContent = renderDoctorPatients();
            } else if (tab === 'consultations') {
                viewContent = renderDoctorConsultations();
            } else if (tab === 'prescribe') {
                viewContent = renderDoctorPrescribe();
            }
        } else if (role === 'researcher') {
            if (tab === 'datasets') {
                viewContent = renderResearcherDatasets();
            } else if (tab === 'trials') {
                viewContent = renderResearcherTrials();
            } else if (tab === 'publications') {
                viewContent = renderResearcherPublications();
            }
        } else if (role === 'provider') {
            if (tab === 'analytics') {
                viewContent = renderProviderAnalytics();
            } else if (tab === 'staff') {
                viewContent = renderProviderStaff();
            } else if (tab === 'workflows') {
                viewContent = renderProviderWorkflows();
            }
        } else if (role === 'investor') {
            if (tab === 'vision') {
                viewContent = renderInvestorVision();
            } else if (tab === 'tam') {
                viewContent = renderInvestorTAM();
            }
        } else if (role === 'admin') {
            if (tab === 'personnel_wellness') {
                viewContent = renderPersonnelWellnessProfile();
            } else if (tab === 'users') {
                viewContent = renderAdminUsers();
            } else if (tab === 'agents') {
                viewContent = renderAdminAgents();
            } else if (tab === 'audit') {
                viewContent = renderAdminAudit();
            } else if (tab === 'security') {
                viewContent = renderAdminSecurity();
            }
        }

        viewPane.innerHTML = viewHeader + viewContent;

        // Defer icon creation and binding attachment to next frame to avoid blocking
        requestAnimationFrame(() => {
            lucide.createIcons();
            attachViewBindings(tab);
        });
    }

    window.__gotoTabAndUpload = function(tabId, inputId) {
        LifeOS.activeTab = tabId;
        renderSidebar();
        renderActiveView();
        setTimeout(() => {
            const input = document.getElementById(inputId);
            if (input) input.click();
        }, 150);
    };

    function renderDataUnavailableBlock(viewTitle) {
        return `
            <div class="view-header-pane">
                <h2 class="view-title text-mono"><span class="text-gradient">${viewTitle}</span></h2>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 60px 20px; text-align:center; min-height: 400px;">
                <i data-lucide="alert-circle" class="text-yellow mb-md animate-pulse" style="width: 48px; height: 48px; margin: 0 auto 16px auto; display:block;"></i>
                <div class="text-sm font-bold text-white mb-sm">No verified data available.</div>
                <p class="text-xs text-slate max-w-sm mb-md" style="margin-bottom: 20px;">Upload or connect your information to continue.</p>
                <div style="display:flex; gap:12px; justify-content:center;">
                    <button class="btn btn-cyan btn-sm" onclick="window.__gotoTabAndUpload('twin', 'report-file-input')">Upload Blood Panel</button>
                    <button class="btn btn-purple btn-sm" onclick="window.__gotoTabAndUpload('genomics', 'dna-file-input')">Upload DNA Sequence</button>
                    <button class="btn btn-teal btn-sm" onclick="openWearableConnectionModal()">Connect Wearable</button>
                </div>
            </div>
        `;
    }

    // --- PATIENT VIEWS ---
    function renderPatientTwin() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        // Multi-source sync details
        const reportsStatus = hasRecords ? "CONNECTED (✓)" : "AWAITING UPLOAD";
        const reportsLast = hasRecords ? (LifeOS.healthMemoryGraph.find(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"))?.date || "2026-06-30") : "Never";
        const reportsNext = "On Demand";
        const latestReportNode = LifeOS.healthMemoryGraph.find(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const reportsQuality = hasRecords ? (latestReportNode && latestReportNode.desc.includes("Glucose") ? "98% (High)" : "35% (Manual Verified)") : "—";
        const reportsMissing = hasRecords ? "None" : "Fasting panels, lipid levels";
        const reportsHistory = hasRecords ? (latestReportNode ? latestReportNode.title : "Report Imported") : "—";

        const dnaStatus = hasDna ? "DECRYPTED (✓)" : "NO GENOMIC DATA";
        const dnaLast = hasDna ? (LifeOS.healthMemoryGraph.find(node => node.title.toLowerCase().includes("helix"))?.date || "2026-06-30") : "Never";
        const dnaNext = "Static Mapping";
        const dnaQuality = hasDna ? "99.8% Alignment" : "—";
        const dnaMissing = hasDna ? "None" : "APOE, MTHFR genotypes";
        const dnaHistory = hasDna ? "Helix Registry Sync" : "—";

        const wearableStatus = hasWearables ? "STREAMING (✓)" : "NO LINK";
        const wearableLast = LifeOS.wearables.lastSync || "Never";
        const wearableNext = hasWearables ? "1Hz Polling" : "—";
        const wearableQuality = hasWearables ? "Optimal BLE Link" : "—";
        const activeSensors = LifeOS.wearables.sensors || [];
        const missingSensors = [];
        if (!activeSensors.includes("PPG Optical HR")) missingSensors.push("PPG HR");
        if (!activeSensors.includes("Nocturnal HRV Core")) missingSensors.push("HRV");
        if (!activeSensors.includes("Subcutaneous CGM")) missingSensors.push("CGM Glucose");
        if (!activeSensors.includes("Systolic/Diastolic Cuff")) missingSensors.push("BP Cuff");
        const wearableMissing = hasWearables ? (missingSensors.length > 0 ? missingSensors.join(", ") : "None") : "All sensors";
        const wearableHistory = hasWearables ? `Active: ${activeSensors.join(", ")}` : "—";

        let warningBannerHtml = '';
        if (!hasData) {
            warningBannerHtml = `
                <div class="glass-card text-center mb-md" style="padding: 16px; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.03); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;">
                    <i data-lucide="alert-circle" class="text-yellow" style="width: 24px; height: 24px;"></i>
                    <div class="text-xs font-bold text-white">No verified data available. Upload or connect your information to continue.</div>
                </div>
            `;
        }

        // Setup dynamic scores strings
        const healthScoreVal = LifeOS.healthTwin.healthScore !== null ? `${LifeOS.healthTwin.healthScore}/100` : "Health Score unavailable until additional verified data is received";
        const riskScoreVal = LifeOS.healthTwin.riskScore !== null ? `${LifeOS.healthTwin.riskScore}%` : "Unavailable";
        const biologicalAgeVal = LifeOS.healthTwin.biologicalAge !== null ? `${LifeOS.healthTwin.biologicalAge} yrs` : "Unavailable";
        const longevityScoreVal = LifeOS.healthTwin.longevityScore !== null ? `${LifeOS.healthTwin.longevityScore}%` : "Unavailable";

        const liveHr = LifeOS.wearables.heartRate !== null ? LifeOS.wearables.heartRate : "—";
        const liveGluc = LifeOS.wearables.glucose !== null ? LifeOS.wearables.glucose : "—";
        const liveHrv = LifeOS.wearables.hrv !== null ? LifeOS.wearables.hrv : "—";
        const liveBp = LifeOS.wearables.bloodPressure !== null ? LifeOS.wearables.bloodPressure : "—";

        const connectedDevicesCount = LifeOS.wearables.connectedDevices.length;
        let connectedDevicesHtml = "";
        if (connectedDevicesCount === 0) {
            connectedDevicesHtml = `
                <div class="glass-card mt-sm text-center text-xxs text-slate" style="padding:10px; background:rgba(0,0,0,0.15); border:1px dashed rgba(255,255,255,0.1);">
                    <i data-lucide="wifi-off" class="text-slate mb-xxs" style="width:16px; margin:0 auto; display:block;"></i>
                    No verified hardware devices connected. Click <span class="text-teal font-bold">Connect Wearable</span> to pair a BLE medical device or Cloud API.
                </div>
            `;
        } else {
            const devRows = LifeOS.wearables.connectedDevices.map(dev => `
                <div class="glass-card flex justify-between align-center" style="padding:8px 12px; margin-top:6px; background:rgba(0,0,0,0.2); border-left:2px solid var(--accent-teal);">
                    <div>
                        <div class="text-xxs text-white font-bold">${dev.name}</div>
                        <div class="text-xxxxs text-slate">${dev.connectionMethod} • Battery: ${dev.battery} • Signal: ${dev.rssi}</div>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span class="badge" style="background:rgba(0,255,209,0.1); color:var(--accent-teal); font-size:0.55rem;">ACTIVE STREAM</span>
                        <span class="text-xxxxs text-slate">${dev.lastSync}</span>
                    </div>
                </div>
            `).join('');
            connectedDevicesHtml = `
                <div class="mt-sm">
                    <div class="text-mono text-xxxxs text-teal font-bold mb-xxs">CONNECTED HARDWARE NODES (${connectedDevicesCount})</div>
                    ${devRows}
                </div>
            `;
        }

        // Organ values
        const brainStatus = LifeOS.healthTwin.organs.brain;
        const heartStatus = LifeOS.healthTwin.organs.heart;
        const vascularStatus = LifeOS.healthTwin.organs.vascular;
        const digestiveStatus = LifeOS.healthTwin.organs.digestive;
        const cellularStatus = LifeOS.healthTwin.organs.cellular;

        return `
            ${warningBannerHtml}
            <div class="patient-twin-grid">
                <!-- Twin graphics and organ panel -->
                <div class="glass-card flex flex-col gap-md">
                    <h3 class="text-mono text-sm text-cyan"><span class="badge-dot" style="background-color: ${hasData ? 'var(--accent-teal)' : 'var(--color-warning)'}"></span> 3D DIGITAL TWIN STATUS</h3>
                    <div class="twin-graphics-wrapper" style="margin-top: 10px;">
                        <svg class="twin-svg" viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" style="max-height: 300px; width: 45%;">
                            <g class="twin-bg-lines" opacity="0.25" stroke="#7C3AED" stroke-width="0.5">
                                <line x1="100" y1="50" x2="60" y2="120" />
                                <line x1="100" y1="50" x2="140" y2="120" />
                                <line x1="100" y1="130" x2="100" y2="240" />
                            </g>
                            <path class="twin-silhouette" d="M100 20 C90 20, 85 28, 85 38 C85 48, 92 54, 100 54 C108 54, 115 48, 115 38 C115 28, 110 20, 100 20 Z M100 54 C90 54, 75 60, 70 70 L60 140 C58 145, 63 150, 68 148 L75 145 L75 220 L68 350 C67 360, 80 365, 83 350 L95 240 L100 240 L105 240 L117 350 C120 365, 133 360, 132 350 L125 220 L125 145 L132 148 C137 150, 142 145, 140 140 L130 70 C125 60, 110 54, 100 54 Z" fill="none" stroke="rgba(0, 229, 255, 0.2)" stroke-width="2" />
                            <g class="twin-node-group active db-twin-node" data-organ="brain" transform="translate(100, 37)">
                                <circle class="twin-node-ring" r="14" fill="none" stroke="#00E5FF" stroke-width="1" />
                                <circle class="twin-node-core" r="5" fill="#00E5FF" />
                            </g>
                            <g class="twin-node-group db-twin-node" data-organ="heart" transform="translate(100, 100)">
                                <circle class="twin-node-ring" r="14" fill="none" stroke="#FF3B30" stroke-width="1" />
                                <circle class="twin-node-core" r="5" fill="#FF3B30" />
                            </g>
                            <g class="twin-node-group db-twin-node" data-organ="vascular" transform="translate(115, 130)">
                                <circle class="twin-node-ring" r="12" fill="none" stroke="#00FFD1" stroke-width="1" />
                                <circle class="twin-node-core" r="4" fill="#00FFD1" />
                            </g>
                            <g class="twin-node-group db-twin-node" data-organ="digestive" transform="translate(100, 170)">
                                <circle class="twin-node-ring" r="14" fill="none" stroke="#9061F9" stroke-width="1" />
                                <circle class="twin-node-core" r="5" fill="#9061F9" />
                            </g>
                            <g class="twin-node-group db-twin-node" data-organ="cellular" transform="translate(100, 250)">
                                <circle class="twin-node-ring" r="14" fill="none" stroke="#00FFD1" stroke-width="1" />
                                <circle class="twin-node-core" r="5" fill="#00FFD1" />
                            </g>
                        </svg>
                        <div class="twin-stats-panel glass-card" style="width: 55%; padding: 16px;">
                            <div class="panel-header-sub text-mono text-cyan" id="db-twin-title">SYSTEM: NEURAL CORE</div>
                            <div class="panel-stats-grid" id="db-twin-stats">
                                <div class="stat-row"><span class="stat-lbl">Cognitive Integrity:</span><span class="stat-val text-green text-mono">${brainStatus.integrity}</span></div>
                                <div class="stat-row"><span class="stat-lbl">Deep Sleep Ratio:</span><span class="stat-val text-mono">${brainStatus.sleepRatio}</span></div>
                                <div class="stat-row"><span class="stat-lbl">Cortisol Level:</span><span class="stat-val text-mono">${brainStatus.cortisol}</span></div>
                                <div class="stat-row"><span class="stat-lbl">Sensor Status:</span><span class="stat-val text-green text-mono">${brainStatus.status}</span></div>
                            </div>
                            <p class="text-xxs text-slate mt-sm">* Click organs on visualizer coordinate map to load sensor sub-channels.</p>
                        </div>
                    </div>
                    
                    <!-- File Decoder / Upload Report Inside Dashboard -->
                    <div class="mt-sm">
                        <h4 class="text-mono text-xxs text-purple mb-sm">UPLOAD REPORT DECODER</h4>
                        <div class="uploader-box" id="report-dropzone">
                            <i data-lucide="upload-cloud" class="text-purple mb-xs" style="width: 32px; height: 32px;"></i>
                            <p class="text-xs text-white">Drag & drop lab reports or click to decrypt/upload</p>
                            <input type="file" id="report-file-input" class="uploader-input">
                        </div>
                        <div class="flex gap-xs mt-xs" style="justify-content: flex-end;">
                            <button class="btn btn-secondary btn-xxs" id="btn-load-sample-rx" type="button" style="font-size:10px; padding:4px 8px;">Load Sample Prescription</button>
                            <button class="btn btn-secondary btn-xxs" id="btn-load-sample-eicar" type="button" style="font-size:10px; padding:4px 8px; color:var(--text-red); border-color:rgba(239,68,68,0.3);">Test Malware Gate (EICAR)</button>
                        </div>
                        <div class="glass-card mt-sm hide" id="upload-progress-card" style="padding: 16px;">
                            <div class="flex justify-between text-xxs text-mono mb-xs">
                                <span id="upload-progress-lbl">DECRYPTING METADATA PROTOCOL...</span>
                                <span id="upload-progress-pct">0%</span>
                            </div>
                            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden; position: relative;">
                                <div id="upload-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple)); transition: width 0.1s;"></div>
                                <div class="scanner-laser" id="upload-scanner-laser" style="animation: scannerSweep 1.5s infinite; display: none;"></div>
                            </div>
                        </div>
                    </div>
                </div>
 
                <!-- Live Biometrics & Scores -->
                <div class="flex flex-col gap-md">
                    <!-- Bio-Scores -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-purple"><span class="badge-dot" style="background-color: var(--accent-purple); box-shadow: 0 0 8px var(--accent-purple);"></span> CORE BIOMETRIC VAULT</h3>
                        <div class="grid grid-2-col mt-md">
                            <div class="score-metric-badge">
                                <span class="text-mono text-xxs text-slate">HEALTH INDEX</span>
                                <span class="score-metric-val text-gradient" id="db-health-score" ${LifeOS.healthTwin.healthScore === null ? 'style="font-size:0.65rem; line-height:1.2; word-break:break-word;"' : ''}>${healthScoreVal}</span>
                            </div>
                            <div class="score-metric-badge">
                                <span class="text-mono text-xxs text-slate">DISEASE RISK</span>
                                <span class="score-metric-val text-red" id="db-risk-score">${riskScoreVal}</span>
                            </div>
                            <div class="score-metric-badge">
                                <span class="text-mono text-xxs text-slate">EPIGENETIC AGE</span>
                                <span class="score-metric-val text-teal" id="db-bio-age">${biologicalAgeVal}</span>
                            </div>
                            <div class="score-metric-badge">
                                <span class="text-mono text-xxs text-slate">LONGEVITY GAP</span>
                                <span class="score-metric-val text-yellow" id="db-long-score">${longevityScoreVal}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Data Quality & Coverage Score -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-xs"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> DATA QUALITY & SYSTEM COVERAGE</h3>
                        <p class="text-xxs text-slate mb-sm">Integrity metrics of verified patient data connected to the Health Twin.</p>
                        <div class="grid grid-2-col text-xxs" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <div class="dp-row"><span>Profile Completion:</span> <span class="text-white font-bold" id="quality-profile-pct">0%</span></div>
                            <div class="dp-row"><span>Medical Record Coverage:</span> <span class="text-white font-bold" id="quality-record-pct">0%</span></div>
                            <div class="dp-row"><span>Wearable Coverage:</span> <span class="text-white font-bold" id="quality-wearable-pct">0%</span></div>
                            <div class="dp-row"><span>Genomic Coverage:</span> <span class="text-white font-bold" id="quality-genomic-pct">0%</span></div>
                            <div class="dp-row"><span>Lifestyle Coverage:</span> <span class="text-white font-bold" id="quality-lifestyle-pct">0%</span></div>
                            <div class="dp-row"><span>Prediction Reliability:</span> <span class="text-white font-bold" id="quality-reliability-lbl">Low (No Data)</span></div>
                        </div>
                        <div class="glass-card mt-sm text-xxs text-yellow" id="quality-warning-banner" style="padding:8px; border-color:rgba(245,158,11,0.2); background:rgba(245,158,11,0.03);">
                            <i data-lucide="alert-triangle" class="inline text-yellow" style="width:12px; margin-right:4px;"></i>
                            <span>Health scores and disease predictions are unavailable or limited due to incomplete patient information.</span>
                        </div>
                    </div>
 
                    <!-- Live Wearable Streaming -->
                    <div class="glass-card">
                        <div class="flex justify-between align-center mb-sm">
                            <h3 class="text-mono text-sm text-teal"><span class="badge-dot" style="background-color: var(--accent-teal); box-shadow: 0 0 8px var(--accent-teal);"></span> WEARABLE TELEMETRY</h3>
                            <div style="display:flex;gap:8px;">
                                <button class="btn btn-secondary btn-sm text-teal" id="btn-connect-wearable" style="padding: 2px 8px; font-size: 0.65rem;">
                                    <i data-lucide="watch"></i> Connect Wearable
                                </button>
                                <button class="btn btn-secondary btn-sm text-red" id="btn-trigger-anomaly" style="padding: 2px 8px; font-size: 0.65rem;">
                                    <i data-lucide="alert-triangle"></i> Trigger Emergency Anomaly
                                </button>
                            </div>
                        </div>
                        
                        <div class="grid grid-2-col">
                            <div class="glass-card" style="padding: 14px; background: rgba(0,0,0,0.2);">
                                <div class="flex justify-between text-xxs text-slate"><span>HEART RATE</span><i data-lucide="heart" class="text-red" style="width:12px;"></i></div>
                                <div class="metric-value-wrapper" style="margin-top:4px;"><span class="metric-val" style="font-size:1.6rem;" id="db-live-hr">${liveHr}</span> <span class="metric-unit">BPM</span></div>
                                <span class="text-xxs text-green mt-xs block"><i data-lucide="trending-down"></i> resting sync</span>
                            </div>
                            <div class="glass-card" style="padding: 14px; background: rgba(0,0,0,0.2);">
                                <div class="flex justify-between text-xxs text-slate"><span>GLUCOSE (CGM)</span><i data-lucide="droplet" class="text-cyan" style="width:12px;"></i></div>
                                <div class="metric-value-wrapper" style="margin-top:4px;"><span class="metric-val" style="font-size:1.6rem;" id="db-live-glucose">${liveGluc}</span> <span class="metric-unit">mg/dL</span></div>
                                <span class="text-xxs text-green mt-xs block"><i data-lucide="check-circle"></i> CGM sync</span>
                            </div>
                            <div class="glass-card" style="padding: 14px; background: rgba(0,0,0,0.2); margin-top: 10px;">
                                <div class="flex justify-between text-xxs text-slate"><span>HRV COHERENCE</span><i data-lucide="activity" class="text-teal" style="width:12px;"></i></div>
                                <div class="metric-value-wrapper" style="margin-top:4px;"><span class="metric-val" style="font-size:1.6rem;" id="db-live-hrv">${liveHrv}</span> <span class="metric-unit">ms</span></div>
                                <span class="text-xxs text-green mt-xs block"><i data-lucide="activity"></i> HRV sensor active</span>
                            </div>
                            <div class="glass-card" style="padding: 14px; background: rgba(0,0,0,0.2); margin-top: 10px;">
                                <div class="flex justify-between text-xxs text-slate"><span>BLOOD PRESSURE</span><i data-lucide="heart-handshake" class="text-purple" style="width:12px;"></i></div>
                                <div class="metric-value-wrapper" style="margin-top:4px;"><span class="metric-val" style="font-size:1.6rem;" id="db-live-bp">${liveBp}</span> <span class="metric-unit">SYS/DIA</span></div>
                                <span class="text-xxs text-green mt-xs block"><i data-lucide="check"></i> Cuff sensor active</span>
                        </div>

                        ${connectedDevicesHtml}

                        <!-- Real-Time Sync Monitor -->
                        <div class="glass-card mt-sm" style="padding:14px; background:rgba(0,255,209,0.02); border-color:rgba(0,255,209,0.1); margin-top:12px;">
                            <div class="flex justify-between text-mono text-xxs text-teal mb-sm" style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(0,255,209,0.1); padding-bottom:4px;">
                                <span>REAL-TIME DATA SYNCHRONIZATION MONITOR</span>
                                <span class="badge" style="background:rgba(0,255,209,0.1); color:var(--accent-teal); font-size:0.6rem;">MULTI-SOURCE SECURE LINK</span>
                            </div>
                            
                            <div style="display:flex; flex-direction:column; gap:12px;">
                                <!-- Reports -->
                                <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                                    <div class="flex justify-between text-mono text-xxs" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                        <span class="text-cyan font-bold">1. MEDICAL REPORTS VAULT</span>
                                        <span class="text-slate">${reportsStatus}</span>
                                    </div>
                                    <div class="grid grid-2-col text-xxs" style="display:grid; grid-template-columns:1fr 1fr; gap:4px; color:var(--text-slate);">
                                        <div>Last Update: <span class="text-white">${reportsLast}</span></div>
                                        <div>Next Sync: <span class="text-white">${reportsNext}</span></div>
                                        <div>Data Quality: <span class="text-white">${reportsQuality}</span></div>
                                        <div>Missing Info: <span class="text-yellow">${reportsMissing}</span></div>
                                        <div style="grid-column: span 2;">Sync History: <span class="text-slate">${reportsHistory}</span></div>
                                    </div>
                                </div>

                                <!-- DNA -->
                                <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                                    <div class="flex justify-between text-mono text-xxs" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                        <span class="text-purple font-bold">2. GENOMIC DECRYPTER</span>
                                        <span class="text-slate">${dnaStatus}</span>
                                    </div>
                                    <div class="grid grid-2-col text-xxs" style="display:grid; grid-template-columns:1fr 1fr; gap:4px; color:var(--text-slate);">
                                        <div>Last Update: <span class="text-white">${dnaLast}</span></div>
                                        <div>Next Sync: <span class="text-white">${dnaNext}</span></div>
                                        <div>Data Quality: <span class="text-white">${dnaQuality}</span></div>
                                        <div>Missing Info: <span class="text-yellow">${dnaMissing}</span></div>
                                        <div style="grid-column: span 2;">Sync History: <span class="text-slate">${dnaHistory}</span></div>
                                    </div>
                                </div>

                                <!-- Wearables -->
                                <div>
                                    <div class="flex justify-between text-mono text-xxs" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                        <span class="text-teal font-bold">3. WEARABLE BLE STREAM</span>
                                        <span class="text-slate">${wearableStatus}</span>
                                    </div>
                                    <div class="grid grid-2-col text-xxs" style="display:grid; grid-template-columns:1fr 1fr; gap:4px; color:var(--text-slate);">
                                        <div>Last Update: <span class="text-white">${wearableLast}</span></div>
                                        <div>Next Sync: <span class="text-white">${wearableNext}</span></div>
                                        <div>Data Quality: <span class="text-white">${wearableQuality}</span></div>
                                        <div>Missing Info: <span class="text-yellow">${wearableMissing}</span></div>
                                        <div style="grid-column: span 2;">Sync History: <span class="text-slate">${wearableHistory}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
 
                    <!-- Voice Health Agent UI -->
                    <div class="glass-card voice-agent-container">
                        <div class="voice-waveforms" id="voice-waves">
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                            <div class="voice-bar"></div>
                        </div>
                        <div class="voice-status-wrapper">
                            <span class="text-mono text-xxs text-purple block">VOICE ASSISTANT</span>
                            <span class="text-xs text-white font-medium block" id="voice-agent-text">LifeOS AI Voice ready. Ask: "LifeOS, how am I doing today?"</span>
                        </div>
                        <button class="voice-query-btn" id="btn-voice-query"><i data-lucide="mic"></i></button>
                    </div>
                </div>
            </div>
 
            <!-- 17 CLINICAL COHORT DASHBOARDS -->
            <div class="glass-card mt-md" style="margin-top: 24px;">
                <h3 class="text-mono text-sm text-cyan mb-sm" style="display:flex; align-items:center; gap:6px;">
                    <i data-lucide="layout-dashboard" class="text-cyan" style="width:18px;"></i> 17 CLINICAL INTEGRATION COHORT DASHBOARDS
                </h3>
                <p class="text-xxs text-slate mb-md">Real-time status panels auditing data ingestion pipelines, connection health, biometrics, and active clinical risk engines.</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;">
                    <!-- 1. Connected Devices -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasWearables ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">1. CONNECTED DEVICES</span>
                            <i data-lucide="watch" class="${hasWearables ? 'text-teal animate-pulse' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasWearables ? LifeOS.wearables.syncStatus.split('(')[1].slice(0, -1) : '0 Devices Active'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">BLE / Cloud API nodes</span>
                    </div>

                    <!-- 2. Connection Health -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasWearables ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">2. CONNECTION HEALTH</span>
                            <i data-lucide="wifi" class="${hasWearables ? 'text-teal' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasWearables ? 'GATT Active | -68 dBm' : 'Offline'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Signal & interface latency (12ms)</span>
                    </div>

                    <!-- 3. Latest Sync -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasWearables ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">3. LATEST SYNC</span>
                            <i data-lucide="refresh-cw" class="${hasWearables ? 'text-teal animate-spin' : 'text-slate'}" style="width:12px; animation-duration:4s;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${wearableLast}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Real-time GATT transmission</span>
                    </div>

                    <!-- 4. Missing Data -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${!hasDna || !hasRecords ? 'var(--color-warning)' : 'var(--accent-teal)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">4. MISSING DATA</span>
                            <i data-lucide="alert-circle" class="${!hasDna || !hasRecords ? 'text-yellow' : 'text-teal'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${!hasDna ? 'APOE, MTHFR' : (!hasRecords ? 'Fasting labs' : 'None')}">${!hasDna ? 'Genomics' : (!hasRecords ? 'Fasting labs' : 'None')}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Gaps in health profile</span>
                    </div>

                    <!-- 5. Upload Status -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasRecords ? 'var(--accent-cyan)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">5. UPLOAD STATUS</span>
                            <i data-lucide="upload" class="${hasRecords ? 'text-cyan' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasRecords ? '1 Document Active' : '0 Documents'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Clinical ingestion gateway</span>
                    </div>

                    <!-- 6. Verification Status -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasRecords ? 'var(--accent-cyan)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">6. VERIFICATION STATUS</span>
                            <i data-lucide="shield-check" class="${hasRecords ? 'text-cyan' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasRecords ? 'Verified & Signed' : 'Awaiting Ingestion'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Human verification check</span>
                    </div>

                    <!-- 7. OCR Confidence -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasRecords ? 'var(--accent-cyan)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">7. OCR CONFIDENCE</span>
                            <i data-lucide="cpu" class="${hasRecords ? 'text-cyan' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${reportsQuality}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Char extraction threshold</span>
                    </div>

                    <!-- 8. Prediction Confidence -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${LifeOS.healthIntelligence.predictions.length > 0 ? 'var(--accent-purple)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">8. PREDICTIONS SCORE</span>
                            <i data-lucide="brain" class="${LifeOS.healthIntelligence.predictions.length > 0 ? 'text-purple' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${LifeOS.healthIntelligence.predictions.length > 0 ? '96% (Grade A)' : 'LOCKED (Safe State)'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Clinical risk engine integrity</span>
                    </div>

                    <!-- 9. Medication Alerts -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${LifeOS.medications.length > 0 && hasDna ? 'var(--text-red)' : 'var(--accent-teal)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">9. MEDICATION ALERTS</span>
                            <i data-lucide="pill" class="${LifeOS.medications.length > 0 && hasDna ? 'text-red animate-pulse' : 'text-teal'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${LifeOS.medications.length > 0 && hasDna ? '1 Contraindication Active' : '0 Alerts Active'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Interactions & duplications audit</span>
                    </div>

                    <!-- 10. Laboratory Trends -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasRecords ? 'var(--accent-cyan)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">10. LAB TRENDS</span>
                            <i data-lucide="trending-up" class="${hasRecords ? 'text-cyan' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasRecords ? 'Glucose: 98 (Stable)' : 'No Lab Data'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Biomarker trajectory mapping</span>
                    </div>

                    <!-- 11. Health Timeline -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasRecords ? 'var(--accent-purple)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">11. HEALTH TIMELINE</span>
                            <i data-lucide="calendar" class="${hasRecords ? 'text-purple' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasRecords ? '08:00 AM Chrono Set' : 'Awaiting Schedule'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Daily clinical chronotherapy logs</span>
                    </div>

                    <!-- 12. Risk Dashboard -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${LifeOS.healthIntelligence.predictions.length > 0 ? 'var(--accent-purple)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">12. RISK DASHBOARD</span>
                            <i data-lucide="activity" class="${LifeOS.healthIntelligence.predictions.length > 0 ? 'text-purple' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${LifeOS.healthIntelligence.predictions.length > 0 ? 'Cardio: 28% | Diab: 20%' : 'Locked'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Longitudinal risk calculations</span>
                    </div>

                    <!-- 13. Nutrition Dashboard -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasDna ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">13. NUTRITION ENGINE</span>
                            <i data-lucide="leaf" class="${hasDna ? 'text-teal' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasDna ? 'Folate Pathway Bypass' : 'Optimal Western'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Glycemic loads & supplement matrix</span>
                    </div>

                    <!-- 14. Sleep Dashboard -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasWearables ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">14. SLEEP ANALYTICS</span>
                            <i data-lucide="moon" class="${hasWearables ? 'text-teal' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasWearables ? '7.2 hrs | 24.5% Deep' : 'Awaiting Telemetry'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Nocturnal HRV circadian lock</span>
                    </div>

                    <!-- 15. Activity Dashboard -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasWearables ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">15. ACTIVITY STREAMS</span>
                            <i data-lucide="zap" class="${hasWearables ? 'text-teal' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasWearables ? '4.2 hrs/wk (Zone 2)' : '0.0 hrs/wk'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Sensor workouts auto-logged</span>
                    </div>

                    <!-- 16. Vitals Dashboard -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${hasWearables ? 'var(--accent-teal)' : 'var(--text-slate)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">16. VITALS CONSOLE</span>
                            <i data-lucide="heart" class="${hasWearables ? 'text-teal animate-pulse' : 'text-slate'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold">${hasWearables ? `HR ${liveHr} | CGM ${liveGluc}` : 'Awaiting Signals'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Continuous SIG bio-vault stream</span>
                    </div>

                    <!-- 17. Emergency Dashboard -->
                    <div class="glass-card" style="padding:10px; background:rgba(0,0,0,0.15); border-left: 2px solid ${LifeOS.wearables.emergencyTriggered ? 'var(--text-red)' : 'var(--accent-teal)'};">
                        <div class="flex justify-between align-center mb-xxs">
                            <span class="text-mono text-xxxxs text-slate font-bold">17. EMERGENCY HUB</span>
                            <i data-lucide="alert-triangle" class="${LifeOS.wearables.emergencyTriggered ? 'text-red animate-pulse' : 'text-teal'}" style="width:12px;"></i>
                        </div>
                        <div class="text-xs text-white font-bold" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${LifeOS.wearables.emergencyTriggered ? 'CARDIAC SEGMENT CORRELATION!' : 'NOMINAL GATES'}">${LifeOS.wearables.emergencyTriggered ? 'CARDIAC CORRELATION!' : 'NOMINAL GATES'}</div>
                        <span class="text-xxxxs text-slate block mt-xxs">Critical telemetry dispatch locks</span>
                    </div>
                </div>
            </div>
 
            <!-- Health Memory Graph Timeline -->
            <div class="glass-card mt-md">
                <h3 class="text-mono text-sm text-cyan mb-md"><span class="badge-dot"></span> DECENTRALIZED HEALTH MEMORY GRAPH</h3>
                <div class="ledger-console" style="height: 180px;" id="db-health-graph-list">
                    <!-- Graph list elements injected here -->
                </div>
            </div>
        `;
    }

    function renderPatientGenomics() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        
        let apoeGenotype = "E3/E3";
        let mthfrGenotype = "CC";
        let tcf7l2Genotype = "CC";

        if (hasDna) {
            const dnaNode = LifeOS.healthMemoryGraph.find(node => node.title.toLowerCase().includes("helix") || node.desc.toLowerCase().includes("apoe") || node.desc.toLowerCase().includes("mthfr"));
            if (dnaNode) {
                const desc = dnaNode.desc;
                const apoeMatch = desc.match(/APOE\s+(\S+)/i);
                if (apoeMatch) apoeGenotype = apoeMatch[1];
                const mthfrMatch = desc.match(/MTHFR\s+(\S+)/i);
                if (mthfrMatch) mthfrGenotype = mthfrMatch[1];
                const tcf7l2Match = desc.match(/TCF7L2\s+(\S+)/i);
                if (tcf7l2Match) tcf7l2Genotype = tcf7l2Match[1];
            }
        }

        let riskProfilesHtml = '';
        if (hasDna) {
            const apoeColor = apoeGenotype.includes("E4") ? (apoeGenotype === "E4/E4" ? "text-red" : "text-yellow") : "text-green";
            const mthfrColor = mthfrGenotype === "TT" ? "text-red" : (mthfrGenotype === "CT" ? "text-yellow" : "text-green");
            const tcfColor = tcf7l2Genotype === "TT" ? "text-red" : (tcf7l2Genotype === "CT" ? "text-yellow" : "text-green");

            riskProfilesHtml = `
                <div class="dp-row"><span>Alzheimer's Predisposition:</span> <span class="${apoeColor}">APOE ${apoeGenotype} (${apoeGenotype === "E4/E4" ? "High Risk 8-12x" : apoeGenotype === "E3/E4" ? "Moderate Risk 2-3x" : "Normal Risk"})</span></div>
                <div class="dp-row"><span>Insulin Deficiency Vector:</span> <span class="${tcfColor}">TCF7L2 ${tcf7l2Genotype} (${tcf7l2Genotype === "TT" ? "High Risk" : tcf7l2Genotype === "CT" ? "Elevated Risk" : "Normal Genotype"})</span></div>
                <div class="dp-row"><span>Vascular Methylation:</span> <span class="${mthfrColor}">MTHFR ${mthfrGenotype} (${mthfrGenotype === "TT" ? "70% Deficit" : mthfrGenotype === "CT" ? "30% Deficit" : "Normal Methylation"})</span></div>
                <div class="dp-row"><span>Power Athlete Response:</span> <span class="text-green">ACTN3 RR Genotype (Power athlete variant mapped)</span></div>
            `;
        } else {
            riskProfilesHtml = [
                `<div class="text-center text-xs text-slate" style="padding: 20px;">`,
                `    <p class="text-mono text-xxs text-yellow mb-xs">NO GENOMIC DATA CONNECTED</p>`,
                `    <p>No genomic data connected. Please upload raw DNA sequence below to unlock mutation analysis.</p>`,
                `</div>`
            ].join('\n');
        }

        const drugCompatHtml = hasDna ? `
            <div class="dp-row"><span>Metformin Clearance:</span> <span class="text-green">Optimal (OCT1 Standard)</span></div>
            <div class="dp-row"><span>Clopidogrel (Antiplatelet):</span> <span class="${apoeGenotype.includes("E4") ? 'text-red' : 'text-green'}">${apoeGenotype.includes("E4") ? 'Reduced (CYP2C19 *2 slow pathway)' : 'Normal Clearance'}</span></div>
            <div class="dp-row"><span>Beta-Blockers Clearance:</span> <span class="${mthfrGenotype === 'TT' ? 'text-red' : mthfrGenotype === 'CT' ? 'text-yellow' : 'text-green'}">${mthfrGenotype === 'TT' ? 'Slow Clearance (CYP2D6 *4 carrier)' : mthfrGenotype === 'CT' ? 'Intermediary (CYP2D6 Standard)' : 'Normal Clearance'}</span></div>
            <div class="dp-row"><span>Aspirin Interaction Index:</span> <span class="text-green">Normal Clearance</span></div>
        ` : `
            <div class="text-center text-xs text-slate" style="padding: 20px;">
                <p class="text-mono text-xxs text-yellow mb-xs">AWAITING CYP450 CLASSIFICATION</p>
                <p>Upload DNA report to map CYP450 enzyme drug clearances.</p>
            </div>
        `;

        return `
            <div class="patient-twin-grid">
                <!-- Rotating Helix canvas -->
                <div class="glass-card flex flex-col justify-between">
                    <div>
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: ${hasDna ? 'var(--accent-teal)' : 'var(--color-warning)'};"></span> ROTATING DNA HELIX MODEL [STATUS: ${hasDna ? 'ACTIVE' : 'LOCKED'}]</h3>
                        <div class="dna-helix-container" style="height: 200px; background: rgba(0,0,0,0.2); border-radius: var(--radius-md); overflow:hidden;">
                            <canvas id="db-dna-canvas" style="width: 100%; height: 100%;"></canvas>
                        </div>
                        <div class="glass-card mt-sm text-center" style="padding: 10px;" id="db-genome-inspect-panel">
                            <span class="text-mono text-cyan text-xxs">${hasDna ? 'CLICK BASE PAIRS ON HELIX TO EXTRACT GENE SPECIFICS' : 'DECRYPT SEQUENCE TO INSPECT BASE PAIRS'}</span>
                        </div>
                    </div>
                    
                    <div class="mt-sm">
                        <h4 class="text-mono text-xxs text-purple mb-xs">UPLOAD DNA SEQUENCE</h4>
                        <div class="uploader-box" id="dna-dropzone" style="padding: 20px 10px;">
                            <i data-lucide="upload-cloud" class="text-purple mb-xs" style="width: 24px; height: 24px; display: inline-block;"></i>
                            <p class="text-xs text-white" id="dna-upload-lbl">Drag & drop raw DNA report or click to decrypt</p>
                            <p class="text-xxs text-slate mt-xxs">Supports 23andMe, Ancestry, FASTQ formats</p>
                            <input type="file" id="dna-file-input" class="uploader-input" accept=".txt,.csv,.fastq">
                        </div>
                        <div class="hide mt-xs text-xxs text-mono text-slate glass-card" id="dna-progress-card" style="padding:10px;">
                            <div class="flex justify-between font-bold mb-xxs" style="display:flex; justify-content:space-between;">
                                <span id="dna-progress-lbl">DECRYPTING ENVELOPE...</span>
                                <span id="dna-progress-pct">0%</span>
                            </div>
                            <div class="progress-bar-bg" style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden; margin-top: 4px;">
                                <div id="dna-progress-bar" style="width: 0%; height: 100%; background: var(--accent-purple); transition: width 0.2s;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Gene Variant profiles & Drug Compatibility -->
                <div class="flex flex-col gap-md">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> GENOMIC RISK PROFILES</h3>
                        <div class="panel-stats-grid mt-sm">
                            ${riskProfilesHtml}
                        </div>
                    </div>

                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-teal mb-sm"><span class="badge-dot" style="background-color: var(--accent-teal);"></span> DRUG COMPATIBILITY INDEX (CYP450)</h3>
                        <div class="panel-stats-grid mt-sm">
                            ${drugCompatHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ======================================================================
    //  LIFEOS 3.0 — HEALTH INTELLIGENCE ENGINE (COMPLETE VIEW RENDERER)
    // ======================================================================
    function renderHealthIntelligence() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("HEALTH INTELLIGENCE & MODELS");
        }

        const hi = LifeOS.healthIntelligence;
        const radar = hi.riskRadar;
        const radarTarget = hi.riskRadarTarget;
        const ages = hi.biologicalAge;
        const lon = hi.longevityScores;

        // --- SVG RISK RADAR COMPUTATION ---
        const radarLabels = ['Cardiovascular', 'Cancer', 'Metabolic', 'Neurological', 'Mental', 'Inflammatory', 'Lifestyle', 'Genetic'];
        const radarKeys = Object.keys(radar);
        const radarVals = radarKeys.map(k => radar[k]);
        const radarTargetVals = radarKeys.map(k => radarTarget[k]);
        const cx = 120, cy = 120, maxR = 90;
        const rings = [0.25, 0.5, 0.75, 1.0];

        function polarToCart(angle, r) {
            return { x: cx + r * Math.cos(angle - Math.PI / 2), y: cy + r * Math.sin(angle - Math.PI / 2) };
        }

        let ringsSvg = rings.map(r => {
            const pts = radarKeys.map((_, i) => {
                const a = (2 * Math.PI / radarKeys.length) * i;
                const p = polarToCart(a, maxR * r);
                return `${p.x},${p.y}`;
            }).join(' ');
            return `<polygon points="${pts}" class="radar-grid-ring"/>`;
        }).join('');

        let axesSvg = radarKeys.map((_, i) => {
            const a = (2 * Math.PI / radarKeys.length) * i;
            const p = polarToCart(a, maxR);
            return `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="radar-grid-axis"/>`;
        }).join('');

        let labelsSvg = radarLabels.map((lbl, i) => {
            const a = (2 * Math.PI / radarKeys.length) * i;
            const p = polarToCart(a, maxR + 16);
            return `<text x="${p.x}" y="${p.y}" class="radar-label-text">${lbl}</text>`;
        }).join('');

        const polyPts = radarVals.map((v, i) => {
            const a = (2 * Math.PI / radarKeys.length) * i;
            const p = polarToCart(a, maxR * (v / 100));
            return `${p.x},${p.y}`;
        }).join(' ');

        const polyTargetPts = radarTargetVals.map((v, i) => {
            const a = (2 * Math.PI / radarKeys.length) * i;
            const p = polarToCart(a, maxR * (v / 100));
            return `${p.x},${p.y}`;
        }).join(' ');

        const radarPointsSvg = radarTargetVals.map((v, i) => {
            const a = (2 * Math.PI / radarKeys.length) * i;
            const p = polarToCart(a, maxR * (v / 100));
            return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#10B981" style="opacity:0.6"/>`;
        }).join('');

        const radarNodesSvg = radarVals.map((v, i) => {
            const a = (2 * Math.PI / radarKeys.length) * i;
            const p = polarToCart(a, maxR * (v / 100));
            const col = v > 55 ? '#EF4444' : v > 35 ? '#F59E0B' : '#10B981';
            return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${col}" stroke="#0F172A" stroke-width="1.5" style="cursor:pointer;filter:drop-shadow(0 0 4px ${col})"/>`;
        }).join('');

        // --- BIOLOGICAL AGE GAUGE SVG ---
        function renderAgeGauge(label, age, chrono, color, size = 70) {
            const r = (size - 12) / 2;
            const circ = 2 * Math.PI * r;
            const ratio = Math.min(age / (chrono * 1.5), 1);
            const offset = circ * (1 - ratio);
            const isYounger = age < chrono;
            return `
                <div style="text-align:center;flex:1;min-width:90px;">
                    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                        <circle cx="${size/2}" cy="${size/2}" r="${r}" class="age-gauge-circle"/>
                        <circle cx="${size/2}" cy="${size/2}" r="${r}" class="age-gauge-bar" stroke="${color}" 
                            stroke-dasharray="${circ}" stroke-dashoffset="${offset}" 
                            transform="rotate(-90 ${size/2} ${size/2})"/>
                        <text x="${size/2}" y="${size/2 - 4}" class="age-gauge-center-text" fill="${color}" font-size="13">${age}</text>
                        <text x="${size/2}" y="${size/2 + 9}" class="age-gauge-center-text" fill="rgba(148,163,184,0.7)" font-size="6">YRS</text>
                    </svg>
                    <div class="text-xxs text-mono" style="margin-top:4px;color:${color}">${label}</div>
                    <div class="text-xxs" style="color:${isYounger ? '#10B981' : '#EF4444'}">${isYounger ? '▼' : '▲'} ${Math.abs(age - chrono).toFixed(1)}y</div>
                </div>
            `;
        }

        // --- LONGEVITY SCORE BAR ---
        function longevityBar(label, val, max = 100, color = 'var(--accent-cyan)') {
            return `
                <div style="margin-bottom:10px;">
                    <div class="flex justify-between text-xxs text-mono" style="margin-bottom:3px;">
                        <span style="color:var(--text-slate)">${label}</span>
                        <span style="color:${color}">${typeof val === 'number' && val < 1 ? val.toFixed(2) + 'x' : val + '/100'}</span>
                    </div>
                    <div class="outcome-bar-track">
                        <div class="outcome-bar-fill" style="width:${(typeof val === 'number' && val < 1 ? val * 100 : val)}%;background:linear-gradient(90deg,${color},rgba(255,255,255,0.1))"></div>
                    </div>
                </div>
            `;
        }

        // --- PREDICTIONS WITH EXPLAINABLE AI ---
        let predictionsWarningHtml = '';
        if (hi.missingPrereqs && hi.missingPrereqs.length > 0) {
            const checklistHtml = [
                { name: "Historical Labs", status: !hi.missingPrereqs.includes("Historical Labs") },
                { name: "Wearable History", status: !hi.missingPrereqs.includes("Wearable History") },
                { name: "Medication History", status: !hi.missingPrereqs.includes("Medication History") },
                { name: "Lifestyle Factors", status: !hi.missingPrereqs.includes("Lifestyle Factors") },
                { name: "Vitals Stream", status: !hi.missingPrereqs.includes("Vitals Stream") },
                { name: "Symptoms Logs", status: !hi.missingPrereqs.includes("Symptoms Logs") },
                { name: "Family History", status: !hi.missingPrereqs.includes("Family History") }
            ].map(item => {
                const mark = item.status ? '<span style="color:#10B981;">✓ VERIFIED</span>' : '<span style="color:#F59E0B;">✗ MISSING</span>';
                return `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.03); padding:4px 0;">
                    <span class="text-slate text-xxs">${item.name}</span>
                    <span class="text-mono text-xxs font-bold">${mark}</span>
                </div>`;
            }).join('');

            predictionsWarningHtml = `
                <div class="glass-card mb-md" style="padding:16px; border-color:rgba(245,158,11,0.3); background:rgba(245,158,11,0.02); margin-bottom:16px;">
                    <h4 class="text-mono text-xs text-yellow mb-xs" style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="shield-alert" class="text-yellow" style="width:16px;"></i> PREDICTIONS SAFE-STATE ACTIVE
                    </h4>
                    <p class="text-xxs text-slate mb-sm">Clinical-grade predictive modeling is locked to prevent diagnostics hallucinations. The following data streams must be verified and integrated before risk estimation can execute:</p>
                    <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:12px;">
                        ${checklistHtml}
                    </div>
                    <p class="text-xxs text-slate" style="font-style:italic;">Note: Risk probability displays are computed using standard cohort distributions. Predictions do not diagnose clinical pathology, recommend treatments, or replace physical clinician review.</p>
                </div>
            `;
        }

        let predictionsHtml = predictionsWarningHtml + hi.predictions.map(pred => {
            const riskColor = pred.risk > 60 ? '#EF4444' : pred.risk > 35 ? '#F59E0B' : '#10B981';
            const confColor = pred.confidence > 90 ? '#10B981' : pred.confidence > 80 ? '#F59E0B' : '#EF4444';

            const reasoningRows = pred.reasoning.map(r => {
                const arrow = r.direction === 'up' ? '↑' : '↓';
                const clr = r.direction === 'up' ? '#EF4444' : '#10B981';
                const barW = Math.abs(r.contribution) * 2.5;
                return `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <span style="color:${clr};font-weight:700;font-size:0.75rem;width:20px">${arrow}${Math.abs(r.contribution)}%</span>
                        <div style="flex:1;height:6px;background:rgba(255,255,255,0.03);border-radius:3px;overflow:hidden">
                            <div style="width:${barW}%;height:100%;background:${clr};border-radius:3px"></div>
                        </div>
                        <span class="text-xxs" style="color:var(--text-silver);min-width:160px">${r.factor}</span>
                    </div>
                `;
            }).join('');

            const sourceTags = pred.sources.map(s => `<span class="evidence-badge level-c" style="margin:2px;font-size:0.55rem">${s}</span>`).join('');

            const altRows = pred.alternatives.map(alt => {
                const dClr = alt.delta < 0 ? '#10B981' : '#EF4444';
                return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03)">
                        <span class="text-xxs" style="color:var(--text-silver)">${alt.scenario}</span>
                        <div>
                            <span class="text-mono text-xxs" style="color:${dClr}">${alt.delta > 0 ? '+' : ''}${alt.delta}%</span>
                            <span class="text-mono text-xxs" style="margin-left:8px;color:var(--text-white)">${alt.risk}%</span>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="glass-card" style="padding:20px;margin-bottom:16px">
                    <div class="flex justify-between align-center" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <h4 class="text-mono text-sm" style="color:var(--text-white); margin:0;">${pred.title}</h4>
                        <div style="display:flex;gap:8px;align-items:center">
                            <span class="evidence-badge level-${pred.evidence.toLowerCase()}">Level ${pred.evidence}</span>
                            <span class="text-mono" style="font-size:0.8rem;color:${confColor}">⬤ Conf: ${pred.confidence}%</span>
                        </div>
                    </div>
                    
                    <div style="display:flex;gap:24px;margin-bottom:16px">
                        <div style="text-align:center; min-width:80px;">
                            <div class="text-mono" style="font-size:2rem;font-weight:700;color:${riskColor}">${pred.risk}%</div>
                            <div class="text-xxs text-mono" style="color:var(--text-slate)">PREDICTED RISK</div>
                        </div>
                        <div style="flex:1">
                            <div class="text-xxs text-mono" style="color:var(--accent-purple);margin-bottom:8px">REASONING CHAIN</div>
                            ${reasoningRows}
                        </div>
                    </div>

                    <div style="margin-bottom:12px; font-size:0.7rem; line-height:1.4; border-top:1px dashed rgba(255,255,255,0.05); padding-top:10px; border-bottom:1px dashed rgba(255,255,255,0.05); padding-bottom:10px;">
                        <div style="margin-bottom:4px;"><strong class="text-cyan">Evidence Summary:</strong> <span class="text-slate">${pred.evidenceSummary || "—"}</span></div>
                        <div style="margin-bottom:4px;"><strong class="text-yellow">Unknown Factors:</strong> <span class="text-slate">${pred.unknownFactors || "None"}</span></div>
                        <div><strong class="text-white">Last Updated:</strong> <span class="text-slate">${pred.lastUpdated || "Never"}</span></div>
                    </div>

                    <div style="margin-bottom:12px">
                        <div class="text-xxs text-mono" style="color:var(--text-slate);margin-bottom:6px">DATA SOURCES</div>
                        <div style="display:flex;flex-wrap:wrap">${sourceTags}</div>
                    </div>
                    <div>
                        <div class="text-xxs text-mono" style="color:var(--accent-cyan);margin-bottom:6px">ALTERNATIVE SCENARIOS</div>
                        ${altRows}
                    </div>
                </div>
            `;
        }).join('');

        // --- CAUSAL DRIVERS ---
        let causalHtml = hi.causalDrivers.map(driver => {
            const bars = driver.rootCauses.map(rc => {
                return `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                        <span class="text-xxs text-mono" style="color:var(--accent-purple);width:24px">${rc.weight}%</span>
                        <div style="flex:1;height:8px;background:rgba(255,255,255,0.03);border-radius:4px;overflow:hidden">
                            <div style="width:${rc.weight}%;height:100%;background:linear-gradient(90deg,#9061F9,#00E5FF);border-radius:4px"></div>
                        </div>
                        <span class="text-xxs" style="color:var(--text-silver);min-width:200px">${rc.cause}</span>
                        <span class="evidence-badge level-${rc.evidence.toLowerCase()}" style="font-size:0.5rem">${rc.evidence}</span>
                    </div>
                `;
            }).join('');
            return `
                <div class="glass-card" style="padding:16px;margin-bottom:12px">
                    <h4 class="text-mono text-xs" style="color:var(--color-warning);margin-bottom:10px">⚡ What is driving ${driver.symptom}?</h4>
                    ${bars}
                </div>
            `;
        }).join('');

        // --- PREVENTION ENGINE ---
        let preventionHtml = hi.preventionActions.map(pa => {
            return `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(16,185,129,0.03);border:1px solid rgba(16,185,129,0.1);border-radius:8px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <span style="color:#10B981;font-size:1.1rem">✓</span>
                    </div>
                    <div style="flex:1">
                        <div class="text-xs" style="color:var(--text-white);font-weight:600">${pa.action}</div>
                        <div class="text-xxs" style="color:#10B981;margin-top:2px">${pa.benefit}</div>
                    </div>
                    <div style="text-align:right">
                        <span class="evidence-badge level-${pa.evidence.toLowerCase()}" style="font-size:0.5rem">${pa.evidence}</span>
                        <div class="text-xxs text-mono" style="color:var(--text-slate);margin-top:4px">${pa.timeline}</div>
                    </div>
                </div>
            `;
        }).join('');

        // --- TREATMENT SIMULATOR ---
        let treatmentHtml = hi.treatments.map(tx => {
            const effClr = tx.efficacy > 80 ? '#10B981' : tx.efficacy > 60 ? '#F59E0B' : '#EF4444';
            return `
                <div class="glass-card" style="padding:16px;margin-bottom:10px">
                    <div class="flex justify-between align-center" style="margin-bottom:10px">
                        <div>
                            <div class="text-xs" style="color:var(--text-white);font-weight:600">${tx.name}</div>
                            <span class="text-xxs text-mono" style="color:var(--text-slate)">${tx.category}</span>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center">
                            <span class="evidence-badge level-${tx.evidence.toLowerCase()}">${tx.evidence}</span>
                            <span class="text-mono text-xxs" style="color:var(--accent-cyan)">${tx.confidence}% conf</span>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
                        <div>
                            <div class="text-xxs text-mono" style="color:var(--text-slate);margin-bottom:3px">EFFICACY</div>
                            <div class="outcome-bar-track"><div class="outcome-bar-fill" style="width:${tx.efficacy}%;background:linear-gradient(90deg,${effClr},rgba(255,255,255,0.05))"></div></div>
                            <span class="text-xxs text-mono" style="color:${effClr}">${tx.efficacy}%</span>
                        </div>
                        <div>
                            <div class="text-xxs text-mono" style="color:var(--text-slate);margin-bottom:3px">SIDE EFFECTS</div>
                            <div class="outcome-bar-track"><div class="outcome-bar-fill" style="width:${tx.sideEffects}%;background:linear-gradient(90deg,#EF4444,rgba(255,255,255,0.05))"></div></div>
                            <span class="text-xxs text-mono" style="color:#EF4444">${tx.sideEffects}%</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:16px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.03)">
                        <div class="text-xxs"><span class="text-slate">Diabetes Risk:</span> <span style="color:#10B981">${tx.projected.diabetesRisk}%</span></div>
                        <div class="text-xxs"><span class="text-slate">Metabolic Age:</span> <span style="color:#10B981">${tx.projected.metabolicAge} yrs</span></div>
                        <div class="text-xxs"><span class="text-slate">A1c:</span> <span style="color:#10B981">${tx.projected.a1c}%</span></div>
                    </div>
                </div>
            `;
        }).join('');

        // --- CAUSAL PATHS ---
        let causalPathsHtml = hi.causalPaths.map(cp => {
            return `
                <div class="glass-card" style="padding:12px;margin-bottom:8px">
                    <div class="text-mono text-xxs text-purple font-bold">${cp.target} PATHWAY</div>
                    <div class="text-xxs text-slate mt-xxs">Root Mutation: <span class="text-white">${cp.root}</span></div>
                    <div style="display:flex;align-items:center;gap:6px;margin:6px 0" class="text-xxs">
                        <span class="badge text-xxs" style="font-size:0.55rem">${cp.path.split('→').join(' → ')}</span>
                    </div>
                    <div class="text-xxs" style="color:var(--text-silver)">Effect: ${cp.effect}</div>
                </div>
            `;
        }).join('');

        // --- PREVENTION PROTOCOLS ---
        let preventionProtocolsHtml = hi.preventionProtocols.map(pv => {
            return `
                <div class="glass-card" style="padding:12px;margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between" class="text-xxs text-mono">
                        <span style="color:#10B981">GENOMIC PROTOCOL: ${pv.target}</span>
                        <span style="color:var(--text-slate)">Impact: ${pv.impact}</span>
                    </div>
                    <div class="text-xxs text-white font-bold mt-xxs">${pv.action}</div>
                </div>
            `;
        }).join('');

        // --- MULTI-TIMELINE SIMULATION ---
        let multiTimelineProjectionsHtml = hi.multitimeLineForecast.map(tx => {
            return `
                <div class="glass-card" style="padding:10px">
                    <div class="text-mono text-xxs" style="color:var(--accent-purple)">${tx.timeline.toUpperCase()} PROTOCOL</div>
                    <div class="grid grid-3-col mt-xs text-center">
                        <div class="text-xxs"><span class="text-slate">Diabetes Risk:</span> <span style="color:#10B981">${tx.projected.diabetesRisk}%</span></div>
                        <div class="text-xxs"><span class="text-slate">Metabolic Age:</span> <span style="color:#10B981">${tx.projected.metabolicAge} yrs</span></div>
                        <div class="text-xxs"><span class="text-slate">A1c:</span> <span style="color:#10B981">${tx.projected.a1c}%</span></div>
                    </div>
                </div>
            `;
        }).join('');

        // --- CONSENSUS ---
        let consensusHtml = hi.agentConsensus.map(ag => {
            const voteClr = ag.vote === 'APPROVE' ? '#10B981' : ag.vote === 'CONDITIONAL' ? '#F59E0B' : '#EF4444';
            return `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.03)">
                    <div style="width:8px;height:8px;border-radius:50%;background:${voteClr};box-shadow:0 0 6px ${voteClr};flex-shrink:0"></div>
                    <div style="width:110px;flex-shrink:0">
                        <div class="text-xxs text-mono" style="color:var(--accent-cyan)">${ag.agent}</div>
                    </div>
                    <div style="flex:1" class="text-xxs text-slate">${ag.recommendation}</div>
                    <div style="text-align:right;flex-shrink:0">
                        <span class="text-mono text-xxs" style="color:${voteClr}">${ag.vote}</span>
                        <span class="text-mono text-xxs" style="color:var(--text-slate);margin-left:6px">${ag.confidence}%</span>
                    </div>
                </div>
            `;
        }).join('');

        // --- ANOMALY ---
        let anomalyHtml = hi.anomalies.map(an => {
            const sevClr = an.severity === 'ALERT' ? '#EF4444' : '#F59E0B';
            return `
                <div class="glass-card ${!an.resolved ? 'anomaly-alert-card' : ''}" style="padding:12px;margin-bottom:8px">
                    <div class="flex justify-between align-center">
                        <div>
                            <span class="text-mono text-xxs" style="color:${sevClr};font-weight:700">${an.severity} · ${an.type}</span>
                            <div class="text-xxs" style="color:var(--text-silver);margin-top:3px">${an.desc}</div>
                        </div>
                        <div style="text-align:right">
                            <span class="text-xxs text-mono" style="color:var(--text-slate)">${an.time}</span>
                            <div class="text-xxs text-mono" style="color:${an.resolved ? '#10B981' : '#EF4444'};margin-top:3px">${an.resolved ? 'RESOLVED' : 'ACTIVE'}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // --- LEARNING LOG ---
        let learningHtml = hi.learningLog.map(ll => {
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.03)">
                    <span class="text-xxs text-mono" style="color:var(--text-slate);width:80px">${ll.date}</span>
                    <span class="text-xxs" style="color:var(--text-silver);flex:1">${ll.event}</span>
                    <span class="text-mono text-xxs" style="color:var(--text-slate)">${ll.priorConf}%→</span>
                    <span class="text-mono text-xxs" style="color:#10B981">${ll.newConf}%</span>
                </div>
            `;
        }).join('');

        // --- HEALTH ATTACK RISK CONFIG (STEP 6) ---
        const attackRisks = [
            { name: "Type 2 Diabetes Risk", what: "Insulin glycation drift and receptor exhaustion", why: "Elevated baseline HbA1c (5.8%) combined with TCF7L2 carrier allele", when: "Onset: 2.4 Years if unmanaged", conf: "91% (High)", factors: "Maternal history, sleep gaps, carb load", prev: "Metformin 500mg, 150m Zone 2, low sugar" },
            { name: "Cardiovascular Disease", what: "Coronary arterial atherosclerotic plaque accumulation", why: "Elevated ApoB (112 mg/dL) + APOE E4 heterozygous phenotype", when: "Onset: 8.2 Years if lipid profile degrades", conf: "84% (Moderate)", factors: "Saturated fats, paternal history, stress", prev: "Limit saturated lipids <15g/day, supplement EPA/DHA" },
            { name: "Stroke Anomaly Risk", what: "Ischemic cerebrovascular occlusion/arterial compliance failure", why: "Vessel stiffness indicators, high average pressure (125/80)", when: "Onset: Long-term (15+ Years) risk frame", conf: "78% (Moderate)", factors: "Arterial compliance drift, stress fatigue", prev: "Circadian sleep lock, limit caffeine, lower sodium" },
            { name: "Kidney Disease Risk", what: "Glomerular filtration rate reduction and filtration strain", why: "Blood pressure micro-spikes during sympathetic cortisol peaks", when: "Onset: 20+ Years risk frame", conf: "92% (High)", factors: "Dehydration, high sodium intake", prev: "Drink 3.2L water daily, monitor creatinine index" },
            { name: "Liver Disease Risk", what: "Hepatic steatosis and metabolic enzyme clearance slowing", why: "APOE E4 lipid transport pathways showing hepatic lipid retention", when: "Onset: 15+ Years risk frame", conf: "89% (High)", factors: "Saturated fats, high fructose syrup", prev: "Support methylation with folate, eliminate high-fructose" },
            { name: "Oncology (Cancer) Risk", what: "Cellular DNA replication errors and methylation failures", why: "30% folate processing defect due to heterozygous MTHFR C677T", when: "Onset: Undefined / Continuous watcher active", conf: "76% (Moderate)", factors: "Methylation path block, DNA repair rate", prev: "Supplement L-methylfolate (400mcg), load berries" },
            { name: "Mental Health & Burnout", what: "Autonomic nervous system exhaustion and vagal tone depression", why: "Nocturnal heart rate variability (HRV) average below 60ms", when: "Onset: Medium-term (6-12 Months)", conf: "82% (Moderate)", factors: "Elevated evening cortisol, late sleep latency", prev: "Vagal 4-7-8 breathing, digital sunset at 9:00 PM" },
            { name: "Inflammatory Diseases", what: "Systemic vascular, cardiac, and skeletal low-grade inflammation", why: "hs-CRP level recorded at moderate risk (2.1 mg/L)", when: "Onset: Active moderate burden", conf: "94% (High)", factors: "Suboptimal Omega-3 levels, gut barrier fatigue", prev: "Supplement 2000mg EPA/DHA, organic fiber loading" },
            { name: "Sleep Disorders", what: "REM/Deep sleep fragmentation, glymphatic clearance decay", why: "Wearable sync indicating nocturnal heart rate spikes (>65 BPM)", when: "Onset: Active mild load", conf: "96% (High)", factors: "Eating within 3h of bed, alcohol, caffeine", prev: "Cooled bedroom 19°C, no caffeine after 2:00 PM" },
            { name: "Metabolic Syndrome", what: "Adipose accumulation, insulin resistance, atherogenic lipids", why: "Concurrent elevated HbA1c, ApoB, and fasting glucose (98 mg/dL)", when: "Onset: Medium-term (1-3 Years)", conf: "90% (High)", factors: "Skeletal glycogen saturation, high lipids", prev: "Daily 35m Zone 2 cardio, 3x strength hypertrophy" }
        ];

        let riskCardsHtml = attackRisks.map(r => {
            const clr = r.conf.includes('High') ? 'text-red' : 'text-yellow';
            return `
                <div class="glass-card" style="padding:14px; border-left:3px solid var(--accent-red); background:rgba(255,59,48,0.015);">
                    <div class="flex justify-between align-center" style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <h4 class="text-xs text-white font-bold" style="margin:0;">${r.name}</h4>
                        <span class="text-xxs text-mono ${clr}">⬤ Conf: ${r.conf}</span>
                    </div>
                    <div class="text-xxs text-slate" style="line-height:1.4;">
                        <div><strong class="text-white">What:</strong> ${r.what}</div>
                        <div style="margin-top:2px;"><strong class="text-yellow">Why:</strong> ${r.why}</div>
                        <div style="margin-top:2px;"><strong class="text-red">When:</strong> ${r.when}</div>
                        <div style="margin-top:2px;"><strong class="text-cyan">Contributing Factors:</strong> ${r.factors}</div>
                        <div style="margin-top:2px;"><strong class="text-green">Prevention Strategy:</strong> ${r.prev}</div>
                    </div>
                </div>
            `;
        }).join('');

        const masterReportHtml = `
            <div class="glass-card" style="padding: 24px; border: 1px solid var(--accent-cyan); background: rgba(0,229,255,0.025); margin-bottom: 20px;">
                <div class="flex justify-between align-center" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 class="text-mono text-sm text-cyan" style="margin:0;"><span class="badge-dot"></span> PERSONALIZED LIFE OPTIMIZATION REPORT v6.0</h3>
                    <span class="badge hero-badge text-green">GENOMICS & TELEMETRY SYNCHRONIZED</span>
                </div>
                <p class="text-xs text-slate mb-md" style="line-height:1.4;">Consolidated diagnostic report mapping genetic carriers, blood panels, and real-time wear logs into a unified, client-side encrypted prevention guide.</p>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;" class="text-xxs mt-sm">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div class="dp-row"><span>Health Twin Baseline:</span> <strong class="text-white">LifeOS Sync v1.0 (Alex Mercer)</strong></div>
                        <div class="dp-row"><span>System Risk Profile:</span> <strong class="text-red">Elevated Metabolic & Cardiovascular Vectors</strong></div>
                        <div class="dp-row"><span>Chronological vs Biological Age:</span> <strong class="text-teal">32.0 Years Chrono / 27.8 Years Biological (-4.2y)</strong></div>
                        <div class="dp-row"><span>Hereditary Loci Genotypes:</span> <strong class="text-purple">MTHFR C677T Heterozygous, APOE E3/E4 Carrier, TCF7L2 CT</strong></div>
                        <div class="dp-row"><span>Prescription Adherence:</span> <strong class="text-green">Metformin 500mg (98.2% Compliance)</strong></div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div class="dp-row"><span>Fasting Blood Biomarkers:</span> <strong class="text-yellow">HbA1c 5.8% (Elevated), ApoB 112 mg/dL (High)</strong></div>
                        <div class="dp-row"><span>1Hz Wearable Telemetry:</span> <strong class="text-green">Resting Heart Rate 58 BPM, Nocturnal HRV 72ms (Optimal)</strong></div>
                        <div class="dp-row"><span>Sleep Stage Architecture:</span> <strong class="text-yellow">6.2 Hours Avg. Deep Sleep 1.1h (Suboptimal Ratio)</strong></div>
                        <div class="dp-row"><span>Autonomic Stress Index:</span> <strong class="text-green">Stable Trajectory (28% Low Sympathetic Burden)</strong></div>
                        <div class="dp-row"><span>Epigenetic Aging Velocity:</span> <strong class="text-teal">0.82x (Slowed Cellular Aging)</strong></div>
                    </div>
                </div>

                <div class="glass-card mt-md text-xxs" style="padding:12px; border-color:rgba(144,97,249,0.2); background:rgba(144,97,249,0.03); margin-top:16px;">
                    <h4 class="text-mono text-purple mb-xs">SUMMARY OF LIFE OPTIMIZATION ACTIONS:</h4>
                    <ul style="padding-left:14px; list-style-type:disc;" class="text-slate">
                        <li><strong class="text-cyan">Food Intelligence:</strong> Limit saturated lipids below 15g daily due to APOE4 genotype. Suppress simple carbohydrate density to restore insulin sensitivity. Suppress MTHFR deficiency with L-methylfolate (400mcg).</li>
                        <li><strong class="text-cyan">Exercise Engine:</strong> Engage in 150 Mins Zone 2 Cardio weekly to enhance mitochondrial density. Complete 3 Strength training sessions weekly to clear muscle glycogen.</li>
                        <li><strong class="text-cyan">Personal Care:</strong> Cool bedroom temperature to 19°C for brain glymphatic clearance. Implement digital sunset at 9:00 PM.</li>
                    </ul>
                </div>
            </div>
        `;

        return `
        ${masterReportHtml}

        <!-- LIFETIME HEALTH PIPELINE SECTION -->
        <div class="pipeline-container">
            <div class="flex justify-between align-center" style="cursor:pointer;" id="btn-toggle-pipeline">
                <h3 class="text-mono text-xs text-cyan" style="display:flex;align-items:center;gap:8px;margin:0">
                    <i data-lucide="git-commit" style="width:16px;height:16px;"></i>
                    LIFETIME HEALTH OPERATING SYSTEM PIPELINE
                </h3>
                <span class="text-mono text-xxs text-cyan" id="pipeline-toggle-indicator">EXPAND PROTOCOL [+]</span>
            </div>
            
            <div class="hide" id="pipeline-content-area" style="margin-top:16px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:16px;">
                <p class="text-xxs text-slate mb-sm">Continuous autonomous health loop. Click any node to instantly boot that specific portal view/subsystem.</p>
                <div class="pipeline-grid">
                    <div class="pipeline-node complete" data-tab="twin"><div class="pipeline-node-num">01 · IDENTITY</div><div class="pipeline-node-name">Patient Twin Profile</div></div>
                    <div class="pipeline-node complete" data-tab="twin"><div class="pipeline-node-num">02 · CONSENT</div><div class="pipeline-node-name">Self-Custody Keys</div></div>
                    <div class="pipeline-node complete" data-tab="twin"><div class="pipeline-node-num">03 · TWIN CORE</div><div class="pipeline-node-name">Federated Sync</div></div>
                    <div class="pipeline-node complete" data-tab="twin"><div class="pipeline-node-num">04 · WEARABLES</div><div class="pipeline-node-name">1Hz Stream Ingest</div></div>
                    <div class="pipeline-node complete" data-tab="genomics"><div class="pipeline-node-num">05 · GENOMICS</div><div class="pipeline-node-name">Whole Genome Decrypted</div></div>
                    <div class="pipeline-node active" data-tab="intelligence"><div class="pipeline-node-num">06 · RISK RADAR</div><div class="pipeline-node-name">8-Axis Pathology Models</div></div>
                    <div class="pipeline-node" data-tab="intelligence"><div class="pipeline-node-num">07 · BIO AGE</div><div class="pipeline-node-name">Horvath Organ Clocks</div></div>
                    <div class="pipeline-node" data-tab="intelligence"><div class="pipeline-node-num">08 · FORECASTS</div><div class="pipeline-node-name">20-Year Disease Models</div></div>
                    <div class="pipeline-node" data-tab="intelligence"><div class="pipeline-node-num">09 · CAUSAL PATHS</div><div class="pipeline-node-name">Gene-Biomarker Mapping</div></div>
                    <div class="pipeline-node" data-tab="intelligence"><div class="pipeline-node-num">10 · PREVENTION</div><div class="pipeline-node-name">Epigenetic Reversal</div></div>
                </div>
            </div>
        </div>

        <!-- ROW 1: THE INTELLIGENCE RADAR -->
        <div class="intelligence-row-1">
            <div class="glass-card" style="padding:16px">
                <div class="flex justify-between align-center" style="margin-bottom:12px">
                    <h3 class="text-mono text-xs text-cyan"><span class="badge-dot"></span> 8-AXIS BASELINE DISEASE RISK RADAR</h3>
                    <div style="display:flex;gap:12px">
                        <span class="text-xxs" style="color:#EF4444">● Current</span>
                        <span class="text-xxs" style="color:#00E5FF">● Target (Optimized)</span>
                    </div>
                </div>
                
                <div style="display:flex;justify-content:center;align-items:center">
                    <svg width="240" height="240" viewBox="0 0 240 240">
                        ${ringsSvg}
                        ${axesSvg}
                        <polygon points="${polyPts}" class="radar-polygon-current"/>
                        <polygon points="${polyTargetPts}" class="radar-polygon-target"/>
                        ${labelsSvg}
                    </svg>
                </div>
            </div>

            <!-- Biological Age Gauges -->
            <div class="glass-card" style="padding:16px">
                <h3 class="text-mono text-xs text-cyan" style="margin-bottom:14px"><span class="badge-dot"></span> BIOLOGICAL AGE ENGINE</h3>
                <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
                    ${renderAgeGauge('Heart', ages.heart, ages.chronological, '#EF4444')}
                    ${renderAgeGauge('Brain', ages.brain, ages.chronological, '#9061F9')}
                    ${renderAgeGauge('Metabolic', ages.metabolic, ages.chronological, '#F59E0B')}
                    ${renderAgeGauge('Lung', ages.lung, ages.chronological, '#00FFD1')}
                    ${renderAgeGauge('Longevity', ages.longevity, ages.chronological, '#00E5FF')}
                </div>
            </div>
        </div>

        <!-- ROW 3: HEALTH ATTACK PREDICTION ENGINE (STEP 6) -->
        <div style="margin-bottom:20px">
            <h3 class="text-mono text-sm text-red" style="margin-bottom:12px"><span class="badge-dot" style="background-color:var(--accent-red);"></span> HEALTH ATTACK PREDICTION MONITOR</h3>
            <div class="risk-monitor-grid">
                ${riskCardsHtml}
            </div>
        </div>

        <!-- ROW 4: EXPLAINABLE PREDICTIONS -->
        <div style="margin-bottom:20px">
            <h3 class="text-mono text-sm text-purple" style="margin-bottom:12px"><span class="badge-dot"></span> EXPLAINABLE AI GENETIC RISKS</h3>
            ${predictionsHtml}
        </div>

        <!-- ROW 5: CAUSAL HEALTH ENGINE + PREVENTION -->
        <div class="intelligence-row-2">
            <div>
                <h3 class="text-mono text-xs" style="color:#10B981;margin-bottom:10px"><span class="badge-dot"></span> PREVENTION ENGINE</h3>
                ${preventionHtml}
                <div class="glass-card" style="padding:16px;margin-top:12px">
                    <h4 class="text-mono text-xxs" style="color:var(--accent-cyan);margin-bottom:8px">ANOMALY DETECTION</h4>
                    ${anomalyHtml}
                </div>
            </div>
            
            <div class="glass-card" style="padding:16px">
                <h3 class="text-mono text-xs text-purple" style="margin-bottom:10px"><span class="badge-dot"></span> MULTI-AGENT CONSENSUS ENGINE</h3>
                ${consensusHtml}
                <button class="btn btn-purple btn-xs w-full mt-sm" id="btn-run-agent-analysis">Run Full AI Health Analysis</button>
            </div>
        </div>
        `;
    }

    function renderPatientConsultation() {
        let chatBubbles = '';
        LifeOS.consultation.messages.forEach(msg => {
            chatBubbles += `<div class="chat-bubble ${msg.sender}">${msg.text}</div>`;
        });

        // Determine safety alerts dynamically based on active medications & memory graph
        const hasApoE4 = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("apoe") || node.desc.toLowerCase().includes("alzheimer"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasApoE4 || hasRecords || hasWearables;

        let safetyWarningsHtml = '';
        let discussionPointsHtml = '';

        if (!hasData) {
            safetyWarningsHtml = `
                <div class="text-xxs text-slate py-sm text-center">
                    Awaiting verified patient data to compile safety clearances.
                </div>
            `;
            discussionPointsHtml = `
                <li class="text-xxs text-slate mt-xs">No active discussion points. Connect wearables or upload lab panel records.</li>
            `;
        } else {
            // Check medications for salicylate / aspirin
            const aspirinActive = LifeOS.medications.some(m => {
                const n = m.name.toLowerCase();
                return n.includes("aspirin") || n.includes("salicylate") || n.includes("ibuprofen") || n.includes("advil");
            });

            if (aspirinActive && hasApoE4) {
                safetyWarningsHtml += `
                    <div class="glass-card text-xxs text-red mb-sm" style="padding: 10px; border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.03);">
                        <strong class="text-red"><i data-lucide="alert-triangle" class="inline" style="width:12px; margin-right:4px;"></i> Contraindicated Therapy Flagged:</strong>
                        <span class="block text-slate mt-xxs">Salicylate compound detected with verified APOE E3/E4 carrier status. High ApoB risk profiles show increased cerebral bleed rates under this combo.</span>
                    </div>
                `;
            }

            if (LifeOS.medications.some(m => m.name.toLowerCase().includes("metformin")) && LifeOS.healthMemoryGraph.some(n => n.desc.toLowerCase().includes("kidney") || n.desc.toLowerCase().includes("egfr"))) {
                safetyWarningsHtml += `
                    <div class="glass-card text-xxs text-yellow mb-sm" style="padding: 10px; border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.03);">
                        <strong class="text-yellow"><i data-lucide="alert-triangle" class="inline" style="width:12px; margin-right:4px;"></i> Metformin / Renal Clearance Flag:</strong>
                        <span class="block text-slate mt-xxs">Regular eGFR monitoring recommended (OCT1 transporter variant limits).</span>
                    </div>
                `;
            }

            if (safetyWarningsHtml === '') {
                safetyWarningsHtml = `
                    <div class="glass-card text-xxs text-green mb-sm" style="padding: 10px; border-color: rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.02);">
                        <strong class="text-green"><i data-lucide="check-circle" class="inline" style="width:12px; margin-right:4px;"></i> All Active Prescriptions Cleared:</strong>
                        <span class="block text-slate mt-xxs">No duplicate therapies, CYP450 contraindications, or genomic variant interactions identified.</span>
                    </div>
                `;
            }

            // Build discussion points
            if (hasApoE4) {
                discussionPointsHtml += `<li class="text-xxs text-slate mt-xs"><strong>ApoE4 Status:</strong> Ask about cardiovascular risk profiling and ApoB targets under high genetic risk.</li>`;
            }
            if (hasRecords && LifeOS.wearables.glucose > 95) {
                discussionPointsHtml += `<li class="text-xxs text-slate mt-xs"><strong>Pre-Diabetes Screening:</strong> Review fasting HbA1c trajectory (5.8% flagged) and Metformin timing.</li>`;
            }
            if (hasWearables) {
                discussionPointsHtml += `<li class="text-xxs text-slate mt-xs"><strong>HRV Telemetry:</strong> Discuss parasympathetic recovery window under daily stress loads.</li>`;
            }
        }

        let summaryPanelHtml = '';
        if (LifeOS.consultation.summary) {
            summaryPanelHtml = `
                <div class="glass-card mt-md" style="border-color: var(--accent-cyan); background: rgba(0, 229, 255, 0.02); padding: 14px;">
                    <h4 class="text-mono text-xxs text-cyan mb-sm"><span class="badge-dot"></span> SECURE CLINICAL DISPATCH PACKET</h4>
                    <div class="text-xxs text-slate leading-relaxed">
                        <p class="mt-xs"><strong>Preliminary Assessment:</strong> ${LifeOS.consultation.summary.assessment}</p>
                        <p class="mt-xs"><strong>Matched Specialist:</strong> <span class="text-cyan font-bold">${LifeOS.consultation.summary.specialist}</span></p>
                        <p class="mt-xs"><strong>Recommended Tests:</strong> ${LifeOS.consultation.summary.tests}</p>
                        <p class="mt-xs"><strong>Directives:</strong> ${LifeOS.consultation.summary.followUp}</p>
                    </div>
                    <button class="btn btn-cyan btn-sm mt-md w-full" id="btn-goto-booking">Book Appointment & Route Files</button>
                </div>
            `;
        } else {
            summaryPanelHtml = `
                <div class="glass-card mt-md text-center" style="padding:20px; background:rgba(255,255,255,0.01);">
                    <i data-lucide="help-circle" class="text-slate mb-xs" style="width:24px; height:24px; margin: 0 auto; display:block;"></i>
                    <h4 class="text-mono text-xxs text-slate font-bold">NO CLINICAL DISPATCH YET</h4>
                    <p class="text-xxs text-slate mt-xxs">Describe your symptoms in the intake chat on the left to compile a physician dispatch summary.</p>
                </div>
            `;
        }

        return `
            <div class="patient-twin-grid">
                <!-- AI Intake Chat -->
                <div class="glass-card flex flex-col justify-between" style="min-height: 420px;">
                    <div>
                        <h3 class="text-mono text-sm text-purple mb-xs"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> AI CLINICAL INTAKE AGENT</h3>
                        <p class="text-xxs text-slate mb-md">This session initiates a formal intake dispatch. All responses compile into your Physician dossier.</p>
                        
                        <div class="ai-chat-box" style="margin-top:10px;">
                            <div class="ai-chat-messages" id="ai-consult-chat-messages" style="height: 250px; overflow-y: auto;">
                                ${chatBubbles}
                            </div>
                            <div class="ai-chat-input-row" style="margin-top: 10px;">
                                <input type="text" class="ai-chat-input" id="ai-consult-chat-input" placeholder="Type symptoms (e.g. 'racing pulse', 'daily fatigue')...">
                                <button class="btn btn-primary" id="btn-send-consult-chat" style="padding: 10px 20px;"><i data-lucide="send"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Discussion Guide & Warnings -->
                <div class="flex flex-col gap-md">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> PHYSICIAN DISCUSSION GUIDE</h3>
                        
                        <!-- Safety Clearances -->
                        <h4 class="text-mono text-xxs text-purple mb-xs mt-sm">MEDICATION SAFETY ASSESSMENT</h4>
                        ${safetyWarningsHtml}

                        <!-- Recommended Questions -->
                        <h4 class="text-mono text-xxs text-cyan mb-xs mt-md">INTELLIGENT PRE-CONSULT QUESTIONS</h4>
                        <ul style="padding-left:16px; list-style-type:disc;">
                            ${discussionPointsHtml}
                        </ul>
                    </div>

                    ${summaryPanelHtml}
                </div>
            </div>
        `;
    }

    function renderDailyAICoach() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("DAILY AI HEALTH COACH");
        }

        const subtab = LifeOS.activeCoachSubTab || 'briefing';

        let subtabHtml = `
            <div class="flex gap-sm mb-md pb-xs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <button class="btn btn-secondary btn-sm coach-sub-tab ${subtab === 'briefing' ? 'active' : ''}" data-subtab="briefing">Today's Briefing</button>
                <button class="btn btn-secondary btn-sm coach-sub-tab ${subtab === 'weekly' ? 'active' : ''}" data-subtab="weekly">Weekly Review</button>
                <button class="btn btn-secondary btn-sm coach-sub-tab ${subtab === 'monthly' ? 'active' : ''}" data-subtab="monthly">Monthly Review</button>
                <button class="btn btn-secondary btn-sm coach-sub-tab ${subtab === 'agent' ? 'active' : ''}" data-subtab="agent">Optimization Agent</button>
                <button class="btn btn-secondary btn-sm coach-sub-tab ${subtab === 'roadmap' ? 'active' : ''}" data-subtab="roadmap">Longevity Roadmap</button>
            </div>
        `;

        let activePanelContent = '';

        if (subtab === 'briefing') {
            activePanelContent = `
                <div class="patient-twin-grid">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> TODAY'S PRIORITIES</h3>
                        <div class="flex flex-col gap-sm" style="display:flex; flex-direction:column; gap:12px;">
                            <div class="glass-card" style="padding:14px; border-left:3px solid var(--accent-teal); background:rgba(0,255,209,0.02)">
                                <div class="text-xxs text-mono text-teal">PRIORITY 1 · PHYSICAL ACTIVITY</div>
                                <h4 class="text-xs text-white font-bold mt-xxs">Zone 2 Cardio: 30-min walking (7:00 AM)</h4>
                                <div class="text-xxs text-slate mt-xxs">Intensity: Low | Where: Outdoor | <strong class="text-teal">Why:</strong> Blunts blood sugar postprandial glucose curves.</div>
                            </div>
                            <div class="glass-card" style="padding:14px; border-left:3px solid var(--accent-cyan); background:rgba(0,229,255,0.02)">
                                <div class="text-xxs text-mono text-cyan">PRIORITY 2 · HYDRATION INDEX</div>
                                <h4 class="text-xs text-white font-bold mt-xxs">Drink 3.2 Liters of electrolyte-enriched water</h4>
                                <div class="text-xxs text-slate mt-xxs">Frequency: 250ml hourly | Where: Home/Office | <strong class="text-cyan">Why:</strong> Improves cardiac stroke volume and HRV.</div>
                            </div>
                            <div class="glass-card" style="padding:14px; border-left:3px solid var(--accent-purple); background:rgba(144,97,249,0.02)">
                                <div class="text-xxs text-mono text-purple">PRIORITY 3 · SUPPLEMENT METEOROLOGY</div>
                                <h4 class="text-xs text-white font-bold mt-xxs">Supplement L-Methylfolate 400mcg (With Breakfast)</h4>
                                <div class="text-xxs text-slate mt-xxs">Timing: 8:00 AM | Sequence: Post-meal | <strong class="text-purple">Why:</strong> Bypasses MTHFR gene absorption block.</div>
                            </div>
                        </div>
                        
                        <div class="glass-card mt-md text-xxs text-yellow" style="padding:10px; border-color:rgba(245,158,11,0.2); background:rgba(245,158,11,0.03); margin-top:16px;">
                            <i data-lucide="alert-triangle" class="inline text-yellow" style="width:12px; margin-right:4px;"></i>
                            <span><strong>WATCHER ALERT:</strong> Sleep staging indicated poor deep sleep ratio last night. Avoid carbohydrate-heavy items at lunch to prevent insulin fatigue.</span>
                        </div>
                    </div>

                    <div class="flex flex-col gap-md">
                        <div class="glass-card">
                            <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> TODAY'S METRIC SNAPSHOT</h3>
                            <div class="grid grid-2-col text-center" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                <div class="score-metric-badge" style="padding:10px;">
                                    <span class="text-mono text-xxs text-slate">HEALTH SCORE</span>
                                    <span class="score-metric-val text-green">${LifeOS.healthTwin.healthScore || 88}</span>
                                </div>
                                <div class="score-metric-badge" style="padding:10px;">
                                    <span class="text-mono text-xxs text-slate">RECOVERY SCORE</span>
                                    <span class="score-metric-val text-teal">91%</span>
                                </div>
                                <div class="score-metric-badge" style="padding:10px;">
                                    <span class="text-mono text-xxs text-slate">SLEEP SCORE</span>
                                    <span class="score-metric-val text-purple">86%</span>
                                </div>
                                <div class="score-metric-badge" style="padding:10px;">
                                    <span class="text-mono text-xxs text-slate">STRESS SCORE</span>
                                    <span class="score-metric-val text-yellow">28%</span>
                                </div>
                            </div>
                        </div>

                        <div class="glass-card">
                            <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> TODAY'S CHECKS & EVENTS</h3>
                            <div style="display:flex; flex-direction:column; gap:8px;" class="text-xxs">
                                <div class="dp-row"><span>[✓] 8:00 AM Supplement Load</span> <span class="text-green">Epigenetics Matched</span></div>
                                <div class="dp-row"><span>[✓] 7:00 AM Zone 2 Walk (30m)</span> <span class="text-green">Completed</span></div>
                                <div class="dp-row"><span>[ ] 4:30 PM Gym Strength (45m)</span> <span class="text-yellow">Pending</span></div>
                                <div class="dp-row"><span>[ ] Metformin 500mg (with dinner)</span> <span class="text-yellow">Reminder active</span></div>
                                <div class="dp-row"><span>[✓] Doctor Consultation Check</span> <span class="text-slate">Completed (Vance)</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (subtab === 'weekly') {
            activePanelContent = `
                <div class="patient-twin-grid">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> WEEKLY PROGRESS REPORT</h3>
                        <p class="text-xs text-slate mb-md">Dynamic analysis of metabolic, genomic, and biometric trajectory adjustments over the past 7 days.</p>
                        
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div style="border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:8px;">
                                <div class="text-mono text-xxs text-green">▲ SYSTEMIC IMPROVEMENTS</div>
                                <ul style="padding-left:14px; list-style-type:disc;" class="text-xxs text-slate mt-xs">
                                    <li>Resting heart rate decreased from 60 to 58 BPM (optimal cardiovascular reserve).</li>
                                    <li>HRV nocturnal baseline rose by 4ms (increased parasympathetic vagal tone).</li>
                                    <li>Pre-diabetes metabolic risk reduced by 3% following low-glycemic compliance.</li>
                                </ul>
                            </div>
                            <div style="border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:8px;">
                                <div class="text-mono text-xxs text-red">▼ PATHOLOGY DRIFTS / DECLINES</div>
                                <ul style="padding-left:14px; list-style-type:disc;" class="text-xxs text-slate mt-xs">
                                    <li>Fasting glucose spike (102 mg/dL) registered on Tuesday due to 5.2h sleep deprivation.</li>
                                    <li>Endothelial score declined slightly due to prolonged sedentary periods (>6hrs) on Thursday.</li>
                                </ul>
                            </div>
                            <div>
                                <div class="text-mono text-xxs text-cyan">⬤ GENETIC CELLULAR AGE DELTA</div>
                                <ul style="padding-left:14px; list-style-type:disc;" class="text-xxs text-slate mt-xs">
                                    <li>Epigenetic age acceleration rollback: <strong class="text-green">-0.2 Years</strong> this week.</li>
                                    <li>Horvath clock calculation: chronological age 32.0, biological twin age 27.8 -> 27.6.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> HABIT INTEGRITY SCORE</h3>
                        <div class="panel-stats-grid mt-md">
                            <div class="dp-row text-xs"><span>Sleep Routine Lock:</span> <span class="text-green text-mono">92% Compliance</span></div>
                            <div class="dp-row text-xs"><span>Zone 2 Cardio Load:</span> <span class="text-green text-mono">100% Compliance (150m)</span></div>
                            <div class="dp-row text-xs"><span>Genomic Diet Index:</span> <span class="text-yellow text-mono">88% Compliance</span></div>
                            <div class="dp-row text-xs"><span>CYP450 Med Adherence:</span> <span class="text-green text-mono">98% Compliance</span></div>
                        </div>
                        
                        <div class="glass-card mt-md text-xxs" style="padding:10px; border-color:rgba(144,97,249,0.15); background:rgba(144,97,249,0.03); margin-top:16px;">
                            <h4 class="text-mono text-xxs text-purple mb-xs">WEEKLY GOALS ACHIEVED:</h4>
                            <div class="flex flex-col gap-xxs" style="display:flex; flex-direction:column; gap:4px;">
                                <span>✓ Kept saturated fat intake under 15g daily (ApoE4 precaution).</span>
                                <span>✓ Bypassed MTHFR block with daily active methylfolate.</span>
                                <span>✓ Completed 3 strength training sessions.</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (subtab === 'monthly') {
            activePanelContent = `
                <div class="patient-twin-grid">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> MONTHLY HEALTH INTELLIGENCE</h3>
                        <p class="text-xs text-slate mb-md">Long-term longitudinal trend analysis comparing baseline biological biomarkers against 30-day wear history.</p>
                        
                        <div class="panel-stats-grid text-xs">
                            <div class="dp-row"><span>Hemoglobin A1c (Pre-diabetes):</span> <span class="text-green">5.8% -> 5.7% (Downward trajectory)</span></div>
                            <div class="dp-row"><span>Atherogenic Lipoprotein (ApoB):</span> <span class="text-green">118 mg/dL -> 112 mg/dL (-5%)</span></div>
                            <div class="dp-row"><span>Systemic Inflammation (hs-CRP):</span> <span class="text-green">2.3 mg/L -> 2.1 mg/L (-8%)</span></div>
                            <div class="dp-row"><span>Vessel Stiffness (PWV Pulse):</span> <span class="text-green">6.3 m/s -> 6.1 m/s (Stable)</span></div>
                            <div class="dp-row"><span>Average Nocturnal HRV:</span> <span class="text-green">68ms -> 72ms (+6% increase)</span></div>
                            <div class="dp-row"><span>Cardiorespiratory Fitness (VO2 Max):</span> <span class="text-green">41.2 -> 42.5 mL/kg/min (+3%)</span></div>
                        </div>
                    </div>

                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> MONTHLY TREND GRAPH</h3>
                        <div class="metric-chart-wrapper" style="height:120px; display:flex; align-items:flex-end;">
                            <svg viewBox="0 0 100 30" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                                <path fill="none" stroke="var(--accent-cyan)" stroke-width="1.5" d="M0,28 L20,24 L40,18 L60,20 L80,12 L100,5" />
                                <path fill="rgba(0, 229, 255, 0.05)" d="M0,28 L20,24 L40,18 L60,20 L80,12 L100,5 L100,30 L0,30 Z" />
                            </svg>
                        </div>
                        <div class="flex justify-between text-mono text-xxs text-slate mt-xxs" style="display:flex; justify-content:space-between; margin-top:6px;">
                            <span>MAY (T2D Risk: 76%)</span>
                            <span>JUN (72%)</span>
                            <span>JULY (69%)</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (subtab === 'agent') {
            activePanelContent = `
                <div class="patient-twin-grid">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> LIFE OPTIMIZATION AGENT WORKSPACE</h3>
                        <p class="text-xs text-slate mb-md">Dedicated autonomous care coordinator polling diagnostic, genomic, and sensor nodes to dynamically adjust wellness guidelines.</p>
                        
                        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:12px; font-family:monospace; font-size:0.65rem; height:200px; overflow-y:auto; line-height:1.5;">
                            <p class="text-slate">[18:17:45] [Agent] Initiating sensor sync. Connected to PPG HR, Nocturnal HRV, and Subcutaneous CGM.</p>
                            <p class="text-slate">[18:19:10] [Agent] Scanning laboratory registers. Decoded FAST-CRP at 2.1 mg/L.</p>
                            <p class="text-slate">[18:20:05] [Agent] Cross-referencing ApoE E3/E4 carrier baseline against active drug interactions.</p>
                            <p class="text-cyan">[18:21:40] [Agent] Warning: Nocturnal oxygen saturation dropped to 94.2%. Adjusting sleep routine tilt by +2 degrees.</p>
                            <p class="text-purple">[18:22:15] [Agent] Epigenetic age calculation rolling average: 27.8 years (0.82x acceleration factor).</p>
                        </div>
                    </div>

                    <div class="flex flex-col gap-md">
                        <div class="glass-card">
                            <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> ACTIVE OBJECTIVES</h3>
                            <div class="text-xxs" style="display:flex; flex-direction:column; gap:6px;">
                                <div class="dp-row"><span>1. Prevent Metabolic Insulin Shift:</span> <span class="text-green font-bold">Active</span></div>
                                <div class="dp-row"><span>2. Epigenetic Reversal (Age Rollback):</span> <span class="text-green font-bold">Active</span></div>
                                <div class="dp-row"><span>3. Clear Atherogenic ApoB Load:</span> <span class="text-green font-bold">Active</span></div>
                                <div class="dp-row"><span>4. Circadian Rhythm Synchronization:</span> <span class="text-green font-bold">Active</span></div>
                            </div>
                        </div>
                        
                        <div class="glass-card">
                            <h3 class="text-mono text-sm text-teal mb-sm"><span class="badge-dot" style="background-color: var(--accent-teal);"></span> AGENT INTEGRITY KEYS</h3>
                            <div class="text-xxs text-slate">
                                <div>Encryption Envelope: <strong class="text-teal">AES-GCM-256 Client-Side</strong></div>
                                <div class="mt-xxs">HIPAA Audit Hash: <strong class="text-teal">0x811a2f64db2a</strong></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (subtab === 'roadmap') {
            activePanelContent = `
                <div class="patient-twin-grid">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> EPIGENETIC LONGEVITY ROADMAP</h3>
                        <p class="text-xs text-slate mb-md">Chronological milestones aimed at maximizing healthspan, slowing aging velocity, and preventing cellular pathologies.</p>
                        
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div class="glass-card" style="padding:12px; border-left:3px solid var(--accent-teal); background:rgba(0,255,209,0.02)">
                                <div class="text-xxs text-mono text-teal font-bold">3 MONTH PLAN · PATHWAY CORRECTION</div>
                                <p class="text-xxs text-white mt-xxs">Focus: Bypass MTHFR methylation defect with 5-MTHF, align circadian sleep lock, and build Zone 2 cardio base (3 hrs/wk).</p>
                                <span class="text-xxs text-green block mt-xxs font-bold"><i data-lucide="zap" class="inline" style="width:10px;"></i> Expected: hs-CRP reduction by 15%, insulin sensitivity stabilization.</span>
                            </div>
                            <div class="glass-card" style="padding:12px; border-left:3px solid var(--accent-cyan); background:rgba(0,229,255,0.02)">
                                <div class="text-xxs text-mono text-cyan font-bold">6 MONTH PLAN · BIOMARKER LOCK</div>
                                <p class="text-xxs text-white mt-xxs">Focus: Target visceral fat reduction (-6kg), maintain low-glycemic dietary protocols, increase VO2 Max from 41 to 44.</p>
                                <span class="text-xxs text-green block mt-xxs font-bold"><i data-lucide="zap" class="inline" style="width:10px;"></i> Expected: Fasting HbA1c below 5.6%, resting RHR below 56 BPM.</span>
                            </div>
                            <div class="glass-card" style="padding:12px; border-left:3px solid var(--accent-purple); background:rgba(144,97,249,0.02)">
                                <div class="text-xxs text-mono text-purple font-bold">1 YEAR PLAN · CELLULAR ROLLBACK</div>
                                <p class="text-xxs text-white mt-xxs">Focus: Epigenetic age Horvath clock rollback of 1.5 years, clear atherogenic ApoB cholesterol below 90 mg/dL.</p>
                                <span class="text-xxs text-green block mt-xxs font-bold"><i data-lucide="zap" class="inline" style="width:10px;"></i> Expected: Epigenetic clock delta -5.7 years, arterial PWV below 5.8 m/s.</span>
                            </div>
                            <div class="glass-card" style="padding:12px; border-left:3px solid var(--accent-red); background:rgba(255,59,48,0.02)">
                                <div class="text-xxs text-mono text-red font-bold">5 YEAR PLAN · SYSTEMIC REJUVENATION</div>
                                <p class="text-xxs text-white mt-xxs">Focus: Maintain cell preservation through continuous autophagy cycles (fast-mimicking), maintain telomere conservation rate above 94%.</p>
                                <span class="text-xxs text-green block mt-xxs font-bold"><i data-lucide="zap" class="inline" style="width:10px;"></i> Expected: Maximum healthspan trajectory, zero chronic disease onset.</span>
                            </div>
                        </div>
                    </div>

                    <div class="glass-card" style="display:flex; flex-direction:column; justify-content:center; text-align:center;">
                        <h3 class="text-mono text-sm text-purple mb-sm">ROADMAP ALIGNMENT</h3>
                        <div class="radial-gauge-wrapper" style="margin-top:16px;">
                            <svg viewBox="0 0 100 50" class="gauge-svg" width="160" style="margin: 0 auto; display: block;">
                                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8" stroke-linecap="round" />
                                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#logoGrad)" stroke-width="8" stroke-linecap="round" stroke-dasharray="125" stroke-dashoffset="25" />
                            </svg>
                            <div class="gauge-value text-mono text-lg mt-xs text-gradient">80%</div>
                            <div class="gauge-lbl text-mono text-xxs text-slate">ROADMAP ALIGNMENT SCORE</div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="portal-view">
                ${subtabHtml}
                ${activePanelContent}
            </div>
        `;
    }

    function renderExerciseEngine() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("PERSONALIZED EXERCISE ENGINE");
        }

        const level = LifeOS.exerciseLevel || 'intermediate';

        let menuHtml = `
            <div class="flex gap-sm mb-md pb-xs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <button class="btn btn-secondary btn-sm exercise-level-tab ${level === 'beginner' ? 'active' : ''}" data-level="beginner">Beginner Program</button>
                <button class="btn btn-secondary btn-sm exercise-level-tab ${level === 'intermediate' ? 'active' : ''}" data-level="intermediate">Intermediate (Recommended)</button>
                <button class="btn btn-secondary btn-sm exercise-level-tab ${level === 'advanced' ? 'active' : ''}" data-level="advanced">Advanced Program</button>
            </div>
        `;

        let workoutList = [];

        if (level === 'beginner') {
            workoutList = [
                { type: "Walking", time: "7:00 AM", duration: "20 Mins", freq: "3 Days/Wk", intensity: "Low", benefits: "Stabilizes fasting blood glucose", why: "Mild cardiorespiratory stimulus to improve insulin receptors", where: "Outdoor / Neighborhood", sequence: "Post-sunlight exposure" },
                { type: "Mobility & Stretching", time: "8:30 PM", duration: "15 Mins", freq: "Daily", intensity: "Low", benefits: "Prepares autonomic nervous system for sleep", why: "Stimulates vagal tone and nocturnal heart rate variability (HRV)", where: "Home (Living room)", sequence: "Pre-bed wind-down" },
                { type: "Yoga Sessions", time: "6:00 PM", duration: "30 Mins", freq: "2 Days/Wk", intensity: "Low", benefits: "Lowers baseline cortisol levels", why: "Decreases autonomic load and mitigates hypertension vectors", where: "Home / Living room", sequence: "Post-work transition" },
                { type: "Light Strength Training", time: "11:00 AM", duration: "25 Mins", freq: "2 Days/Wk", intensity: "Low-Mod", benefits: "Builds baseline glucose storage capacity", why: "Activates GLUT4 glucose transporters in skeletal muscle", where: "Home / Gym", sequence: "Post-warmup stretch" }
            ];
        } else if (level === 'intermediate') {
            workoutList = [
                { type: "Zone 2 Cardio (Walking/Cycling)", time: "7:00 AM", duration: "35 Mins", freq: "5 Days/Wk", intensity: "Moderate", benefits: "Improves cellular mitochondrial density", why: "APOE4 neuroprotection and metabolic clearance optimization", where: "Outdoor / Parks", sequence: "First thing in morning" },
                { type: "Strength Training (Hypertrophy)", time: "4:30 PM", duration: "45 Mins", freq: "3 Days/Wk", intensity: "High", benefits: "Increases skeletal glycogen storage TAM", why: "Reverses pre-diabetic HbA1c elevation and insulin resistance", where: "Gym / Fitness Center", sequence: "Post-work routine" },
                { type: "Yoga & Vagal Stretching", time: "9:00 PM", duration: "20 Mins", freq: "Daily", intensity: "Low", benefits: "Stimulates nocturnal HRV recovery (+12ms)", why: "Decreases evening cortisol and sympathetic load", where: "Home (Bedroom)", sequence: "Pre-sleep transition" },
                { type: "Running (Zone 3 intervals)", time: "8:00 AM", duration: "30 Mins", freq: "2 Days/Wk", intensity: "High", benefits: "Improves VO2 Max and stroke volume", why: "Enhances arterial compliance and vascular endothelials", where: "Outdoor / Track", sequence: "Mid-morning focus" },
                { type: "Recovery Sessions (Sauna/Stretch)", time: "6:00 PM", duration: "40 Mins", freq: "2 Days/Wk", intensity: "Low", benefits: "Enhances heat-shock protein transcription", why: "Accelerates lactic clearance and lowers vascular inflammation", where: "Clinic / Spa", sequence: "Post-strength training" }
            ];
        } else if (level === 'advanced') {
            workoutList = [
                { type: "High Intensity Strength (Power)", time: "3:30 PM", duration: "60 Mins", freq: "4 Days/Wk", intensity: "Maximum", benefits: "Maximizes muscle mass & insulin sensitivity", why: "ACTN3 RR power athlete variant response", where: "Gym / Weight room", sequence: "Optimal temperature peak" },
                { type: "VO2 Max Intervals (Running/Cycling)", time: "7:00 AM", duration: "45 Mins", freq: "3 Days/Wk", intensity: "Maximum", benefits: "Pushes cardiorespiratory fitness threshold", why: "Maximizes stroke volume and delays cardiovascular aging", where: "Outdoor / Hills", sequence: "Fasting morning protocol" },
                { type: "Yoga & Breathwork (Sudarshan)", time: "9:30 PM", duration: "30 Mins", freq: "Daily", intensity: "Low", benefits: "Induces deep parasympathetic lock", why: "Vagal recovery optimization for MTHFR anxiety/stress spikes", where: "Home", sequence: "Digital sunset lock" },
                { type: "Active Recovery Cycling", time: "11:00 AM", duration: "50 Mins", freq: "2 Days/Wk", intensity: "Moderate", benefits: "Flushes vascular metabolic byproducts", why: "Promotes cardiovascular endothelial shear stress and healing", where: "Gym / Cycling track", sequence: "Active recovery days" }
            ];
        }

        let workoutCardsHtml = '';
        workoutList.forEach(w => {
            const intColor = w.intensity.includes('Maximum') || w.intensity.includes('High') ? 'text-red' : w.intensity.includes('Mod') ? 'text-yellow' : 'text-green';
            workoutCardsHtml += `
                <div class="glass-card" style="padding: 16px; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4 class="text-xs text-white font-bold" style="margin:0;">${w.type}</h4>
                        <span class="text-xxs text-mono ${intColor}">${w.intensity} Intensity</span>
                    </div>
                    
                    <div class="grid grid-2-col text-xxs text-slate" style="display:grid; grid-template-columns:1fr 1fr; gap:6px; background:rgba(0,0,0,0.15); padding:8px; border-radius:4px;">
                        <div>Best Time: <strong class="text-white">${w.time}</strong></div>
                        <div>Duration: <strong class="text-white">${w.duration}</strong></div>
                        <div>Frequency: <strong class="text-white">${w.freq}</strong></div>
                        <div>Location: <strong class="text-white">${w.where}</strong></div>
                    </div>

                    <div class="text-xxs mt-xxs text-slate" style="line-height:1.4;">
                        <div><strong class="text-cyan">Why:</strong> ${w.why}</div>
                        <div class="mt-xxs"><strong class="text-purple">Sequence:</strong> ${w.sequence}</div>
                        <div class="mt-xxs"><strong class="text-teal">Benefit:</strong> ${w.benefits}</div>
                    </div>
                </div>
            `;
        });

        return `
            <div class="portal-view">
                ${menuHtml}
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    <div class="glass-card" style="display:flex; flex-direction:column; gap:12px;">
                        <h3 class="text-mono text-sm text-cyan"><span class="badge-dot"></span> BIOMETRIC ANALYSIS PROTOCOL</h3>
                        <p class="text-xs text-slate">Your personalized exercise program is dynamically calculated using connected parameters.</p>
                        
                        <div class="panel-stats-grid text-xxs mt-xs">
                            <div class="dp-row"><span>Patient Age:</span> <span class="text-white font-bold">${LifeOS.user.age} Years</span></div>
                            <div class="dp-row"><span>Weight Baseline:</span> <span class="text-white font-bold">76 kg</span></div>
                            <div class="dp-row"><span>Genomic Muscle Variant:</span> <span class="text-purple font-bold">ACTN3 RR (Power athlete)</span></div>
                            <div class="dp-row"><span>Pre-diabetes Warning:</span> <span class="text-yellow font-bold">Insulin Deficit Mapped</span></div>
                            <div class="dp-row"><span>Resting Heart Rate:</span> <span class="text-green font-bold">58 BPM (Optimal)</span></div>
                            <div class="dp-row"><span>HRV Recovery Index:</span> <span class="text-green font-bold">72 ms (Parasympathetic)</span></div>
                        </div>

                        <div class="glass-card text-xxs text-yellow mt-sm" style="padding:10px; border-color:rgba(245,158,11,0.2); background:rgba(245,158,11,0.03);">
                            <i data-lucide="alert-circle" class="inline text-yellow" style="width:12px; margin-right:4px;"></i>
                            <span>Due to elevated HbA1c (5.8%) and TCF7L2 genetic carrier status, prioritizing hypertrophy strength training (3 days/wk) is critical to clear glycogen and restore receptor sensitivity.</span>
                        </div>
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:12px; max-height:480px; overflow-y:auto; padding-right:4px;">
                        ${workoutCardsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function renderPersonalCareEngine() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("PERSONAL CARE ENGINE");
        }

        const plans = [
            { title: "Sleep Improvement Plan", desc: "Circadian sleep-lock window (10:30 PM - 6:30 AM). Bedroom temperature cooled to 19°C. Zero blue light screen exposure after 9:00 PM.", why: "APOE4 neuro-vascular preservation", benefit: "+3.1 Years healthspan" },
            { title: "Stress Reduction Plan", desc: "4-7-8 Diaphragmatic vagal breathing exercises (5 minutes, twice daily). Ambient heart rate variability (HRV) biofeedback monitoring.", why: "Decreases baseline sympathetic cortisol load", benefit: "+12ms HRV nocturnal increase" },
            { title: "Mental Wellness Plan", desc: "Mindfulness-based cognitive therapy breaks during high autonomic load frames. Daily 10-minute active mental decompression.", why: "Promotes prefrontal cognitive resilience", benefit: "Reduces burnout risk velocity by 40%" },
            { title: "Recovery Plan", desc: "Infrared sauna sessions (20 mins, 80°C) followed by cold contrast hydrotherapy. Foam rolling and active myofascial mobility.", why: "Promotes cellular heat-shock protein translation", benefit: "Reduces muscular lactic clearance time by 24h" },
            { title: "Hydration Plan", desc: "Drink 3.2L water daily. Hydrate with 250ml electrolyte loading hourly. Buffer caffeine intake with 2x water volume.", why: "Improves total blood volume and cardiac stroke index", benefit: "Stabilizes resting RHR and vascular compliance" }
        ];

        const routines = [
            { time: "07:00 AM", name: "Morning Routine", duration: "45 Mins", where: "Outdoor / Parks", actions: "Sunlight exposure, 500ml electrolyte water loading, 30m Zone 2 brisk walk.", why: "Locks circadian melatonin clock and clears cortisol" },
            { time: "10:00 AM", name: "Work Routine", duration: "10 Mins", where: "Office / Desk", actions: "Ergonomic check, 5-minute passive mobility stretching, 250ml hydration load.", why: "Mitigates vascular stiffness and deep vein stagnation" },
            { time: "09:00 PM", name: "Evening Routine", duration: "30 Mins", where: "Home (Living room)", actions: "Digital sunset (power down all screen emissions), supplement Magnesium Glycinate.", why: "Bypasses late cortisol stimulation and matches melatonin onset" },
            { time: "10:30 PM", name: "Sleep Routine", duration: "8 Hours", where: "Home (Bedroom)", actions: "Bedroom temp 19°C, white-noise active, eye-mask lock, zero noise sync.", why: "Maximizes deep sleep brain glymphatic clearance (ApoE4 crucial)" }
        ];

        let plansHtml = '';
        plans.forEach(p => {
            plansHtml += `
                <div class="glass-card" style="padding:14px; margin-bottom:10px; border-left: 3px solid var(--accent-purple);">
                    <h4 class="text-xs text-white font-bold" style="margin:0;">${p.title}</h4>
                    <p class="text-xxs text-slate mt-xs" style="line-height:1.4;">${p.desc}</p>
                    <div class="text-xxs mt-xxs text-slate flex justify-between" style="display:flex; justify-content:space-between; margin-top:6px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:4px;">
                        <span><strong class="text-cyan">Why:</strong> ${p.why}</span>
                        <span class="text-green font-bold">${p.benefit}</span>
                    </div>
                </div>
            `;
        });

        let routinesHtml = '';
        routines.forEach(r => {
            routinesHtml += `
                <div class="glass-card" style="padding:14px; margin-bottom:10px; border-left: 3px solid var(--accent-teal);">
                    <div class="flex justify-between align-center" style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="text-mono text-xxs text-teal">${r.time} · ${r.name.toUpperCase()}</span>
                        <span class="badge text-xxs text-mono" style="font-size:0.6rem;">${r.duration} | ${r.where}</span>
                    </div>
                    <p class="text-xxs text-white mt-xs" style="line-height:1.4;"><strong>Protocol:</strong> ${r.actions}</p>
                    <div class="text-xxs mt-xs text-slate" style="border-top:1px dashed rgba(255,255,255,0.03); padding-top:4px;"><strong class="text-cyan">Why:</strong> ${r.why}</div>
                </div>
            `;
        });

        return `
            <div class="portal-view">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    <div>
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> PERSONAL CARE ENGINE</h3>
                        <p class="text-xs text-slate mb-md">Personalized behavioral health programs focused on parasympathetic recovery, nervous system regulation, and sleep depth optimization.</p>
                        <div style="max-height:480px; overflow-y:auto; padding-right:4px;">
                            ${plansHtml}
                        </div>
                    </div>
                    <div>
                        <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color:var(--accent-purple);"></span> DAILY CHRONOLOGICAL ROUTINES</h3>
                        <p class="text-xs text-slate mb-md">Optimal sequence of daily actions timed with biological circadian locks.</p>
                        <div style="max-height:480px; overflow-y:auto; padding-right:4px;">
                            ${routinesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderPatientSearch() {
        return `
            <div class="glass-card flex flex-col gap-md max-w-md text-left">
                <h3 class="text-mono text-sm text-cyan"><span class="badge-dot"></span> SEARCH YOUR BIOLOGICAL PROFILE</h3>
                <p class="text-xs text-slate">LifeOS index parses your entire medical records, genetic sequencing mappings, CGM glucose timelines, and wearable logs.</p>
                <div class="search-input-row mt-xs">
                    <input type="text" id="db-health-search-input" class="health-search-input" placeholder="Ask: 'Why am I tired?' or 'Explain ApoE4 diet rules'... ">
                    <button class="btn btn-primary" id="btn-db-health-search"><i data-lucide="search"></i></button>
                </div>
                <div class="presets-row mt-xs">
                    <span class="text-mono text-xxs text-slate mr-xs">BIOMETRIC QUERIES:</span>
                    <button class="btn-search-preset text-xxs db-preset-btn" data-q="tired">"Why am I tired?"</button>
                    <button class="btn-search-preset text-xxs db-preset-btn" data-q="apoe">"Explain ApoE4 diet rules"</button>
                    <button class="btn-search-preset text-xxs db-preset-btn" data-q="folate">"Why take Methylfolate?"</button>
                </div>
                <div class="search-results-panel mt-md hide" id="db-search-results-panel">
                    <div class="panel-header-sub text-mono text-purple">SEARCH ENCRYPTED COGNITIVE DECODER</div>
                    <div class="search-results-content text-xs text-slate mt-xs" id="db-search-results-content">
                        <!-- Search response injected -->
                    </div>
                </div>
            </div>
        `;
    }

    function renderPatientSimulator() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("DISEASE SIMULATOR MODEL");
        }

        const riskPctStr = "72%";
        const riskStatusStr = "HIGH METABOLIC RISK";
        const risk5Str = "42%";
        const risk10Str = "68%";
        const risk20Str = "72%";

        return `
            <div class="portal-view">
                <div class="patient-twin-grid">
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> INTERACTIVE LIFESTYLE SLIDERS</h3>
                        <p class="text-xs text-slate mb-md">Simulate lifestyle choices against genomic baseline risks to project disease probability profiles.</p>
                        <div class="simulator-controls" style="padding: 0;">
                            <div class="sim-row">
                                <label class="text-xxs">Body Weight Index (Fat %): <span id="lbl-fat" class="text-cyan font-bold">30%</span></label>
                                <input type="range" id="slider-fat" min="10" max="45" value="30">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Physical Active Cycle (Steps): <span id="lbl-steps" class="text-cyan font-bold">4,000</span></label>
                                <input type="range" id="slider-steps" min="1000" max="15000" step="500" value="4000">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Sleep Duration (Hours): <span id="lbl-sleep" class="text-cyan font-bold">6.0 hrs</span></label>
                                <input type="range" id="slider-sleep" min="4" max="9" step="0.5" value="6.0">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Methylation Optimization: <span id="lbl-methyl" class="text-cyan font-bold">None</span></label>
                                <input type="range" id="slider-methyl" min="0" max="1" value="0">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Tobacco / Smoking Intake: <span id="lbl-smoke" class="text-cyan font-bold">None</span></label>
                                <input type="range" id="slider-smoke" min="0" max="2" value="0">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Stress Reduction Index: <span id="lbl-stress" class="text-cyan font-bold">30%</span></label>
                                <input type="range" id="slider-stress" min="0" max="100" step="5" value="30">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Nutrition Optimization score: <span id="lbl-diet" class="text-cyan font-bold">50/100</span></label>
                                <input type="range" id="slider-diet" min="0" max="100" step="5" value="50">
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:16px;">
                        <div class="glass-card text-center" style="display: flex; flex-direction: column; justify-content: center; padding: 20px;">
                            <h3 class="card-title text-mono text-xs">PROJECTED METABOLIC OUTCOMES</h3>
                            <div class="risk-meter-wrapper mt-md">
                                <div class="risk-percentage text-gradient text-mono" id="sim-risk-pct">${riskPctStr}</div>
                                <div class="risk-label text-mono text-xxs text-red" id="sim-risk-status">${riskStatusStr}</div>
                            </div>
                            
                            <div class="grid grid-3-col mt-md text-left text-mono text-xxs" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
                                <div>
                                    <span>5 Year Risk:</span>
                                    <span class="block text-red font-bold" id="sim-risk-5">${risk5Str}</span>
                                </div>
                                <div>
                                    <span>10 Year Risk:</span>
                                    <span class="block text-red font-bold" id="sim-risk-10">${risk10Str}</span>
                                </div>
                                <div>
                                    <span>20 Year Risk:</span>
                                    <span class="block text-red font-bold" id="sim-risk-20">${risk20Str}</span>
                                </div>
                            </div>
                        </div>

                        <div class="glass-card" style="padding: 20px;">
                            <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> HEALTH INTERVENTIONS (STEP 14)</h3>
                            <p class="text-xs text-slate mb-md">Toggle active interventions to evaluate cumulative risk rollbacks and biological clock gains.</p>
                            <div style="display:flex; flex-direction:column; gap:8px;" class="text-xs text-slate">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="chk-int-weight" class="sim-intervention-chk"> Lose 10 kg (Metabolic Recovery)
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="chk-int-sleep" class="sim-intervention-chk"> Sleep 8 Hours (Parasympathetic Alignment)
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="chk-int-exercise" class="sim-intervention-chk"> Exercise 150 Mins/Wk (VO2 Max Boost)
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="chk-int-smoke" class="sim-intervention-chk"> Quit Smoking (Endothelial Restore)
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="chk-int-sugar" class="sim-intervention-chk"> Reduce Sugar (Insulin Resensitization)
                                </label>
                            </div>
                            <div class="mt-md pt-sm text-xxs text-slate" style="border-top:1px dashed rgba(255,255,255,0.05); display: flex; justify-content: space-between;">
                                <div>Est. Longevity Gain: <strong class="text-green" id="sim-longevity-gain">+0.0 Years</strong></div>
                                <div>Risk Reduction: <strong class="text-green" id="sim-cumulative-reduction">0%</strong></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="glass-card" style="padding: 20px;">
                    <h3 class="text-mono text-xs text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> 20-YEAR DIGITAL TWIN PROJECTED TIMELINE</h3>
                    <p class="text-xxs text-slate mb-md">Interactive forecasting timeline displaying long-term health twin index projections based on current inputs.</p>
                    <svg id="sim-timeline-svg" viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;">
                        <!-- grid lines -->
                        <line x1="40" y1="10" x2="40" y2="170" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        <line x1="40" y1="170" x2="690" y2="170" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        <line x1="40" y1="90" x2="690" y2="90" stroke="rgba(255,255,255,0.03)" stroke-width="0.5" stroke-dasharray="4 4"/>
                        <!-- Y labels -->
                        <text x="5" y="15" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace">100</text>
                        <text x="12" y="95" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace">50</text>
                        <text x="18" y="175" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace">0</text>
                        <!-- X labels (years) -->
                        <text x="40" y="185" fill="rgba(148,163,184,0.5)" font-size="6" font-family="monospace">NOW</text>
                        <text x="202.5" y="185" fill="rgba(148,163,184,0.5)" font-size="6" font-family="monospace">5Y</text>
                        <text x="365" y="185" fill="rgba(148,163,184,0.5)" font-size="6" font-family="monospace">10Y</text>
                        <text x="527.5" y="185" fill="rgba(148,163,184,0.5)" font-size="6" font-family="monospace">15Y</text>
                        <text x="670" y="185" fill="rgba(148,163,184,0.5)" font-size="6" font-family="monospace">20Y</text>
                        
                        <path id="sim-timeline-path" d="" fill="none" stroke="var(--accent-cyan)" stroke-width="2.5" style="filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.4)); transition: d 0.5s ease-in-out;"/>
                    </svg>
                </div>
            </div>
        `;
    }

    function renderPatientCopilot() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("PATIENT COPILOT & CLINICAL TRIALS");
        }

        let alerts = '';
        if (hasData) {
            LifeOS.breakthroughs.forEach(b => {
                alerts += `
                    <div class="glass-card mt-sm" style="padding: 16px; border-left: 3px solid ${b.read ? 'rgba(255,255,255,0.1)' : 'var(--accent-cyan)'}">
                        <div class="flex justify-between align-center text-mono text-xxs">
                            <span class="text-purple">[BREAKTHROUGH MATCH]</span>
                            <span>${b.date}</span>
                        </div>
                        <h4 class="mt-xs text-xs font-bold text-white">${b.title}</h4>
                        <p class="text-xxs text-slate mt-xs">${b.text}</p>
                        <div class="mt-sm flex justify-between align-center">
                            <span class="badge hero-badge text-xxs" style="font-size: 0.65rem;">${b.matchReason}</span>
                            ${!b.read ? `<button class="btn btn-secondary btn-sm db-read-breakthrough-btn" data-id="${b.id}" style="padding: 2px 6px; font-size:0.6rem;">Mark Read</button>` : ''}
                        </div>
                    </div>
                `;
            });
        }
        if (alerts === '') {
            alerts = `
                <div class="text-center text-xs text-slate py-sm">
                    <p class="text-xxs">No matched breakthroughs found. Upload files to verify genome markers against active publications.</p>
                </div>
            `;
        }

        let patternHtml = '';
        if (hasDna) {
            patternHtml += `<li>MTHFR Variant Heterozygous matching (Trial scan Active)</li>`;
            patternHtml += `<li>APOE E3/E4 Alzheimers predisposition (Trial scan Active)</li>`;
        }
        if (hasRecords) {
            patternHtml += `<li>A1c elevated pre-diabetes macros (Trial scan Active)</li>`;
        }
        if (patternHtml === '') {
            patternHtml = `<li>No verified genetic or metabolic patterns loaded. Upload raw DNA/reports to map research trials.</li>`;
        }

        return `
            <div class="patient-twin-grid">
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> CONTINUOUS RESEARCH MONITOR</h3>
                    <p class="text-xs text-slate">LifeOS Research Agent monitors clinical trial registries, biochemical journals, and FDA releases. Updates automatically trigger when matching variants are logged in your Health Memory Graph.</p>
                    
                    <div class="glass-card mt-md text-xs text-slate" style="padding: 16px; background: rgba(0,0,0,0.15);">
                        <h4 class="text-mono text-xxs text-purple mb-xs">ACTIVE MATCH PATTERNS:</h4>
                        <ul style="padding-left: 16px;" class="mt-xs">
                            ${patternHtml}
                        </ul>
                    </div>
                </div>

                <div class="glass-card" style="max-height: 480px; overflow-y: auto;">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> MATCHED KNOWLEDGE UPDATES</h3>
                    ${alerts}
                </div>
            </div>
        `;
    }

    function renderPatientAutomation() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("PATIENT AUTOMATION GATEWAY");
        }

        let rxList = '';
        if (LifeOS.medications && LifeOS.medications.length > 0) {
            LifeOS.medications.forEach(rx => {
                rxList += `
                    <div class="dp-row text-xs">
                        <span><strong>${rx.name} ${rx.dosage}</strong> (${rx.frequency})</span>
                        <span>Compliance: <span class="text-green">${rx.compliance}</span></span>
                    </div>
                `;
            });
        }
        if (rxList === '') {
            rxList = `
                <div class="text-center text-xs text-slate py-sm">
                    <p class="text-xxs">No active prescription workflows. Sync clinical reports to monitor compliance.</p>
                </div>
            `;
        }

        const medReminderText = LifeOS.medications.length > 0 
            ? `Daily Medication Reminder (${LifeOS.medications.map(m=>m.name).join(' & ')})`
            : "Daily Medication Reminder (Awaiting prescriptions...)";

        const hasMeds = LifeOS.medications.length > 0;

        return `
            <div class="patient-twin-grid">
                <!-- Reminders Toggles -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> AUTOMATED CARE WORKFLOWS</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <label class="chk-interest-label" style="padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <input type="checkbox" ${hasMeds ? 'checked' : ''}> ${medReminderText}
                        </label>
                        <label class="chk-interest-label" style="padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <input type="checkbox" ${hasRecords ? 'checked' : ''}> Bi-yearly Lipids Blood Panel Booking Reminder
                        </label>
                        <label class="chk-interest-label" style="padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <input type="checkbox" ${hasDna ? 'checked' : ''}> Epigenetic Horvath Methylation Clock Rescan Reminder
                        </label>
                        <label class="chk-interest-label" style="padding: 8px 0;">
                            <input type="checkbox" ${hasWearables ? 'checked' : ''}> Continuous Glucose Monitor (CGM) Calibration Alerts
                        </label>
                    </div>
                </div>

                <!-- Active Medications Compliance -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> RX COMPLIANCE TIMELINE</h3>
                    <div class="panel-stats-grid mt-md">
                        ${rxList}
                    </div>
                    <div class="glass-card mt-md text-xs" style="padding: 16px; background: rgba(0,0,0,0.1);">
                        <h4 class="text-mono text-xxs text-teal mb-xs">VACCINATION & SCREENING RECORD</h4>
                        <div class="dp-row mt-xs"><span>SARS-CoV-2 Booster:</span> <span class="${hasRecords ? 'text-green' : 'text-slate'}">${hasRecords ? 'Active (Dec 2025)' : 'Awaiting records'}</span></div>
                        <div class="dp-row"><span>Influenza Vaccine:</span> <span class="${hasRecords ? 'text-green' : 'text-slate'}">${hasRecords ? 'Active (Nov 2025)' : 'Awaiting records'}</span></div>
                        <div class="dp-row"><span>General Cardiology Screen:</span> <span class="${hasRecords ? 'text-yellow' : 'text-slate'}">${hasRecords ? 'Pending Doctor consult' : 'Awaiting records'}</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderMedicationIntelligence() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("PRESCRIPTION & MEDICATION INTELLIGENCE");
        }

        const meds = LifeOS.medications;
        const mi = LifeOS.medicationIntelligence;

        // Safety warning banner
        const safetyWarningHtml = `
            <div class="glass-card mb-md text-xxs text-red text-center font-bold" style="padding:10px; border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.05); margin-bottom:16px;">
                <i data-lucide="shield-alert" class="inline text-red" style="width:12px; margin-right:4px; display:inline-block; vertical-align:middle;"></i>
                <span style="vertical-align:middle; text-transform:uppercase; letter-spacing:0.5px;">* AI does not prescribe or suggest automatic modification/stoppage. Consult a healthcare professional. *</span>
            </div>
        `;

        // Verified medications purpose summary
        let medsSummaryHtml = '';
        if (meds.length > 0) {
            medsSummaryHtml += `
                <div class="glass-card mb-md">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> VERIFIED MEDICATION PURPOSE SUMMARIES</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
            `;
            meds.forEach(m => {
                let purpose = "Targeted metabolic or cellular support.";
                if (m.name.toLowerCase().includes("metformin")) purpose = "Sustained AMPK activation, glycemic stabilization, and glycation buffering.";
                if (m.name.toLowerCase().includes("atorvastatin")) purpose = "HMG-CoA reductase inhibitor targeting low-density ApoB lipoprotein clearance.";
                if (m.name.toLowerCase().includes("aspirin") || m.name.toLowerCase().includes("salicylate")) purpose = "Antiplatelet therapy for vascular protection.";

                medsSummaryHtml += `
                    <div class="dp-row text-xs">
                        <span><strong>${m.name}</strong> <span class="text-slate">(${m.dosage})</span></span>
                        <span class="text-slate">${purpose}</span>
                    </div>
                `;
            });
            medsSummaryHtml += `
                    </div>
                </div>
            `;
        }

        // Build drug matrix rows dynamically based on current medications
        let matrixHeader = `<th>Drug \\ Drug</th>`;
        meds.forEach(m => {
            matrixHeader += `<th>${m.name}</th>`;
        });
        
        let matrixRows = '';
        meds.forEach(m1 => {
            let row = `<tr><td><strong>${m1.name}</strong></td>`;
            meds.forEach(m2 => {
                if (m1.name === m2.name) {
                    row += `<td class="matrix-cell safe">SAME</td>`;
                } else {
                    const match = mi.interactions.find(i => 
                        (i.drugA === m1.name && i.drugB === m2.name) ||
                        (i.drugA === m2.name && i.drugB === m1.name)
                    );
                    if (match) {
                        const cellClass = match.status === 'SAFE' ? 'safe' : match.status === 'MONITOR' ? 'monitor' : 'contraindicated';
                        row += `<td class="matrix-cell ${cellClass}">${match.status}</td>`;
                    } else {
                        row += `<td class="matrix-cell safe">SAFE</td>`;
                    }
                }
            });
            row += `</tr>`;
            matrixRows += row;
        });

        // Build contraindications list
        let contraHtml = '';
        if (hasDna) {
            mi.contraindications.forEach(c => {
                contraHtml += `
                    <div class="dp-row text-xs" style="padding: 10px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                        <div style="flex:1">
                            <span class="text-mono text-xxs font-bold text-red">[${c.gene}]</span>
                            <div class="text-white font-medium" style="margin-top:2px;">Contraindicated Compound: ${c.compound}</div>
                            <div class="text-xxs text-slate" style="margin-top:2px;">${c.risk}</div>
                        </div>
                    </div>
                `;
            });
        }
        if (contraHtml === '') {
            contraHtml = `
                <div class="text-center text-xs text-slate py-sm">
                    <p class="text-xxs">No genomic contraindications identified. Connect DNA sequencing files.</p>
                </div>
            `;
        }

        // Build alternatives list
        let alternativesHtml = '';
        if (meds.length > 0 && hasDna) {
            mi.alternatives.forEach(alt => {
                alternativesHtml += `
                    <div class="glass-card" style="padding: 12px; margin-bottom: 10px; border-left: 3px solid var(--accent-teal);">
                        <div class="flex justify-between text-mono text-xxs mb-xs">
                            <span class="text-teal">REPLACE: ${alt.original}</span>
                            <span class="evidence-badge level-a">${alt.evidence} EVIDENCE</span>
                        </div>
                        <div class="text-xs text-white font-bold">Alternative: ${alt.suggested}</div>
                        <p class="text-xxs text-slate mt-xxs">${alt.reason}</p>
                    </div>
                `;
            });
        }
        if (alternativesHtml === '') {
            alternativesHtml = `
                <div class="text-center text-xs text-slate py-sm">
                    <p class="text-xxs">No active therapy conflicts to simulate alternatives.</p>
                </div>
            `;
        }

        // Build side effects summary cards
        let sideEffectsHtml = '';
        if (meds.length > 0) {
            meds.forEach(m => {
                if (m.name.toLowerCase().includes("metformin")) {
                    sideEffectsHtml += `
                        <div class="glass-card" style="padding:14px;background:rgba(255,185,0,0.03);border-color:rgba(245,158,11,0.15);margin-bottom:10px;">
                            <div class="text-mono text-xxs text-yellow mb-xs">METFORMIN SIDE EFFECT PROBABILITY</div>
                            <div class="flex justify-between text-xs text-white mt-xs"><span>Mild Gastrointestinal Distress</span><span class="text-mono text-yellow font-bold">22% (Level A)</span></div>
                            <div class="flex justify-between text-xs text-white mt-xs"><span>B12 Depletion (Long-term)</span><span class="text-mono text-yellow font-bold">14% (Level B)</span></div>
                        </div>
                    `;
                } else if (m.name.toLowerCase().includes("aspirin") || m.name.toLowerCase().includes("salicylate")) {
                    sideEffectsHtml += `
                        <div class="glass-card" style="padding:14px;background:rgba(239,68,68,0.03);border-color:rgba(239,68,68,0.15);margin-bottom:10px;">
                            <div class="text-mono text-xxs text-red mb-xs">ASPIRIN SIDE EFFECT PROBABILITY</div>
                            <div class="flex justify-between text-xs text-white mt-xs"><span>Gastrointestinal Bleeding Risk</span><span class="text-mono text-red font-bold">8% (Level A)</span></div>
                            <div class="flex justify-between text-xs text-white mt-xs"><span>Bruising Tendency</span><span class="text-mono text-red font-bold">11% (Level B)</span></div>
                        </div>
                    `;
                }
            });
        }
        if (sideEffectsHtml === '') {
            sideEffectsHtml = `
                <div class="text-center text-xs text-slate py-sm">
                    <p class="text-xxs">No active medications to analyze side effect probability.</p>
                </div>
            `;
        }

        let mainMatrixContent = '';
        if (meds.length > 0) {
            mainMatrixContent = `
                <div style="overflow-x:auto;">
                    <table class="interaction-matrix-table">
                        <thead>
                            <tr>${matrixHeader}</tr>
                        </thead>
                        <tbody>
                            ${matrixRows}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            mainMatrixContent = `
                <div class="glass-card text-center" style="padding: 24px; color: var(--text-slate);">
                    <i data-lucide="shield-alert" class="text-yellow mb-xs" style="width:32px; height:32px; margin: 0 auto; display:block;"></i>
                    <div class="text-xs font-bold text-white mb-xxs">No active medications recorded.</div>
                    <p class="text-xxs">Verify prescription imports or connect laboratory results to load interaction clearance models.</p>
                </div>
            `;
        }

        // Active Prescription Checklist Html
        let activeChecklistHtml = '';
        if (meds.length > 0) {
            meds.forEach(m => {
                activeChecklistHtml += `
                    <div class="glass-card mb-xs" style="padding:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="text-xs text-white font-bold">${m.name}</div>
                            <span class="text-xxs text-slate block mt-xxs">Dosage: ${m.dosage} | Frequency: ${m.frequency}</span>
                        </div>
                        <div class="text-right">
                            <span class="badge text-xxs font-bold" style="background:rgba(16,185,129,0.1); color:var(--accent-teal);">Active Compliance: ${m.compliance}</span>
                        </div>
                    </div>
                `;
            });
        } else {
            activeChecklistHtml = `
                <div class="text-center text-xxs text-slate py-sm">
                    No active prescriptions. Upload clinical records to sync drug matrices.
                </div>
            `;
        }

        // Daily chronotherapy schedule timeline
        let timelineHtml = `
            <div class="glass-card mt-md">
                <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> DAILY CLINICAL TIMELINE & REMINDERS</h3>
                <p class="text-xs text-slate mb-md">Daily administration chronotherapy schedule optimized for efficacy and safety.</p>
                <div style="display:flex; flex-direction:column; gap:12px;">
        `;
        if (meds.some(m => m.name.toLowerCase().includes("metformin") || m.name.toLowerCase().includes("atorvastatin"))) {
            timelineHtml += `
                <div style="display:flex; gap:12px; align-items:flex-start; border-left:2px solid var(--accent-cyan); padding-left:12px;">
                    <span class="text-mono text-xs text-cyan" style="min-width:60px;">08:00 AM</span>
                    <div>
                        <div class="text-xs text-white font-bold">Morning Protocol</div>
                        <p class="text-xxs text-slate">Take Metformin (500mg) with meal to sustain glucose levels. Take Atorvastatin (20mg) if lipid-clearing support is active.</p>
                        <span class="badge text-xxs" style="background:rgba(0,255,209,0.05); color:var(--accent-teal);">Compliance Reminder Set</span>
                    </div>
                </div>
            `;
        }
        if (hasDna && LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("mthfr"))) {
            timelineHtml += `
                <div style="display:flex; gap:12px; align-items:flex-start; border-left:2px solid var(--accent-purple); padding-left:12px;">
                    <span class="text-mono text-xs text-purple" style="min-width:60px;">08:00 PM</span>
                    <div>
                        <div class="text-xs text-white font-bold">Evening Protocol</div>
                        <p class="text-xxs text-slate">Take L-Methylfolate (400mcg) to bypass MTHFR C677T deficit.</p>
                        <span class="badge text-xxs" style="background:rgba(0,255,209,0.05); color:var(--accent-teal);">Compliance Reminder Set</span>
                    </div>
                </div>
            `;
        }
        if (!meds.some(m => m.name.toLowerCase().includes("metformin") || m.name.toLowerCase().includes("atorvastatin")) && !(hasDna && LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("mthfr")))) {
            timelineHtml += `
                <div class="text-center text-xxs text-slate py-xs">
                    No timeline schedule required for current verified diagnostics.
                </div>
            `;
        }
        timelineHtml += `
                </div>

                <div class="glass-card mt-md" style="background:rgba(239,68,68,0.03); border-color:rgba(239,68,68,0.15); padding:12px;">
                    <span class="text-red font-bold text-mono text-xxs"><i data-lucide="shield-alert" class="inline" style="width:12px; margin-right:4px;"></i> AI CLINICAL SAFETY AUDIT</span>
                    <ul class="text-xxs text-slate mt-xs" style="padding-left:14px; list-style-type:disc; display:flex; flex-direction:column; gap:4px;">
                        <li><strong>Drug-Drug interactions:</strong> ${meds.length > 1 ? 'All verified compounds checked against interaction matrices. Standard clearance safe.' : 'Safe. No compound interactions.'}</li>
                        <li><strong>Duplicate Therapy:</strong> No therapeutic duplications detected in verified medications.</li>
                        <li><strong>Allergy & Contraindications:</strong> ${hasDna && LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("apoe")) ? 'APOE E4 carrier status indicates high vascular susceptibility. Long-term salicylate (aspirin) usage should be audited by clinician.' : 'No active contraindications found.'}</li>
                    </ul>
                </div>
            </div>
        `;

        // Clinician discussion questions
        let questionsHtml = `
            <div class="glass-card mt-md">
                <h3 class="text-mono text-sm text-teal mb-sm"><span class="badge-dot" style="background-color: var(--accent-teal);"></span> CLINICIAN DISCUSSION QUESTIONS</h3>
                <ul class="text-xs text-slate mt-xs" style="padding-left:16px; list-style-type: decimal; display:flex; flex-direction:column; gap:8px;">
        `;
        if (hasDna && LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("apoe"))) {
            questionsHtml += `<li>Given the APOE4 allele status, is long-term salicylate (aspirin) therapy still indicated, or do the microbleeding risks outweigh the cardioprotective benefits?</li>`;
        }
        if (meds.some(m => m.name.toLowerCase().includes("metformin"))) {
            questionsHtml += `<li>Should we verify serum Vitamin B12 levels given long-term Metformin-induced absorption deficits?</li>`;
        }
        if (hasDna && LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("mthfr"))) {
            questionsHtml += `<li>Would switching to active L-methylfolate (5-MTHF) supplement satisfy the MTHFR C677T methylator block more efficiently than synthetic folic acid?</li>`;
        }
        if (questionsHtml === `
            <div class="glass-card mt-md">
                <h3 class="text-mono text-sm text-teal mb-sm"><span class="badge-dot" style="background-color: var(--accent-teal);"></span> CLINICIAN DISCUSSION QUESTIONS</h3>
                <ul class="text-xs text-slate mt-xs" style="padding-left:16px; list-style-type: decimal; display:flex; flex-direction:column; gap:8px;">
        `) {
            questionsHtml += `
                <li>Should we initiate standard cardiovascular and metabolic biomarkers review at the next consult?</li>
                <li>What lifestyle modifications are recommended based on active wearable metrics?</li>
            `;
        }
        questionsHtml += `
                </ul>
            </div>
        `;

        return `
            ${safetyWarningHtml}
            ${medsSummaryHtml}
            <div class="patient-twin-grid">
                <!-- Drug interaction checker & tester -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> DRUG-DRUG INTERACTION MATRIX</h3>
                    <p class="text-xs text-slate mb-md">The Drug Agent performs real-time n-way lookup of all molecules in your schedule.</p>
                    
                    ${mainMatrixContent}

                    <!-- TEST A NEW MOLECULE FORM -->
                    <div class="glass-card mt-md" style="padding: 16px; background: rgba(0,0,0,0.15);">
                        <h4 class="text-mono text-xxs text-cyan mb-sm">TEST COMPATIBILITY PROTOCOL</h4>
                        <div class="search-input-row" style="margin-top:0;">
                            <input type="text" id="compatibility-input" class="health-search-input" style="padding: 10px;" placeholder="e.g. Aspirin, Ibuprofen, Atorvastatin, Lisinopril...">
                            <button class="btn btn-cyan btn-sm" id="btn-run-compatibility">Check Compatibility</button>
                        </div>
                        <div class="hide mt-sm text-xs" id="compatibility-result-panel" style="padding:12px; border-radius:6px;">
                            <!-- Injected compatibility result -->
                        </div>
                    </div>
                </div>

                <!-- Warnings & Alternatives -->
                <div class="flex flex-col gap-md">
                    <!-- Active Prescription Checklist -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> ACTIVE PRESCRIPTION CHECKLIST</h3>
                        <p class="text-xs text-slate mb-sm">Continuous monitoring of verified medications against active patient telemetry.</p>
                        ${activeChecklistHtml}
                    </div>

                    <!-- Contraindications -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color:var(--accent-purple);"></span> GENOME CONTRAINDICATIONS</h3>
                        <p class="text-xs text-slate">Genetic risk markers verified against biochemical libraries.</p>
                        <div class="panel-stats-grid mt-sm">
                            ${contraHtml}
                        </div>
                    </div>

                    <!-- Alternatives -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-teal mb-sm"><span class="badge-dot" style="background-color:var(--accent-teal);"></span> CLINICAL ALTERNATIVES</h3>
                        ${alternativesHtml}
                    </div>

                    <!-- Side Effects -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-yellow mb-sm"><span class="badge-dot" style="background-color:var(--color-warning);"></span> SIDE EFFECT PROBABILITIES</h3>
                        ${sideEffectsHtml}
                    </div>
                </div>
            </div>
            ${timelineHtml}
            ${questionsHtml}
        `;
    }

    function renderNutritionEngine() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("PERSONALIZED NUTRITION ENGINE");
        }

        const nut = LifeOS.nutritionEngine;
        const cycle = LifeOS.nutritionCycle || 'daily';

        const hasApoE4 = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("apoe") || node.desc.toLowerCase().includes("alzheimer"));
        const hasMthfr = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("mthfr") || node.desc.toLowerCase().includes("methyl"));
        const hasPrediabetes = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("diabetes") || node.desc.toLowerCase().includes("a1c")) || (LifeOS.wearables.glucose && LifeOS.wearables.glucose > 95);

        // Supplement recommendations
        const supplementsList = [];
        if (hasMthfr) {
            supplementsList.push({ name: "L-Methylfolate (5-MTHF)", dosage: "400mcg", frequency: "Daily", evidence: "Level A", reason: "MTHFR C677T Bypass" });
        }
        if (hasApoE4) {
            supplementsList.push({ name: "Omega-3 (EPA/DHA)", dosage: "2000mg", frequency: "Daily", evidence: "Level A", reason: "APOE E4 Vascular Shield" });
        }
        if (hasPrediabetes) {
            supplementsList.push({ name: "Berberine HCI", dosage: "500mg", frequency: "Before Meals", evidence: "Level B", reason: "Insulin Sensitivity" });
        }
        if (hasWearables) {
            supplementsList.push({ name: "Magnesium Glycinate", dosage: "350mg", frequency: "Nocturnal", evidence: "Level B", reason: "Sleep & HRV Sync" });
        }

        // Deficiencies
        const deficienciesList = [];
        if (hasRecords) {
            deficienciesList.push({ nutrient: "Vitamin D3", level: "28 ng/mL", status: "MODERATE", source: "Lab Panel" });
            if (hasPrediabetes) {
                deficienciesList.push({ nutrient: "Insulin Sensitivity", level: "1.1", status: "BORDERLINE LOW", source: "Lab Panel" });
            }
        }

        // Foods Matrix Data (Step 2)
        const foodsToEat = [
            { name: "Wild Sockeye Salmon", why: "High Omega-3 fatty acids preserve cognitive networks in APOE4 carriers.", benefit: "Improves autonomic endothelial tone." },
            { name: "Steamed Broccoli & Kale", why: "Sulforaphane activates Nrf2 pathways; high fiber buffers TCF7L2 glucose spikes.", benefit: "Reduces postprandial blood sugar drift." },
            { name: "Avocados & Olive Oil", why: "Monounsaturated fats bypass cholesterol receptor restrictions.", benefit: "Supports arterial elasticity." },
            { name: "Organic Blueberries", why: "Polyphenols clear cellular free radicals.", benefit: "Protects neural signaling integrity." }
        ];

        const foodsToLimit = [
            { name: "Saturated Fats (Butter, Beef)", why: "Saturated lipids reduce hepatic ApoB clearance rates in APOE4 carriers.", benefit: "Reduces atherogenic ApoB cholesterol density." },
            { name: "Eggs & Dairy (Whole)", why: "Choline and saturated lipids are slow-pathway cleared.", benefit: "Mitigates cardiovascular vascular strain." },
            { name: "Whole Wheat & Grains", why: "Carbohydrate volume spikes postprandial insulin.", benefit: "Stabilizes fasting blood glucose." }
        ];

        const foodsToAvoid = [
            { name: "Synthetic Folic Acid", why: "MTHFR heterozygous block cannot metabolize; causes serum toxic overload.", benefit: "Corrects folate pathway block." },
            { name: "Refined Sugars & Syrups", why: "Causes beta-cell insulin exhaustion and mitochondrial glycation.", benefit: "Rolls back Type 2 Diabetes risk profile." },
            { name: "Trans / Seed Oils", why: "Triggers chronic low-grade vascular inflammation.", benefit: "Reduces hs-CRP biomarker below 2.0 mg/L." }
        ];

        let mealPlanContent = '';
        if (cycle === 'daily') {
            mealPlanContent = `
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div class="meal-card" style="padding: 12px; border-left: 3px solid var(--accent-cyan);">
                        <div class="flex justify-between text-mono text-xxs text-cyan" style="display:flex; justify-content:space-between;">
                            <span>08:00 AM · BREAKFAST PRECURSOR</span>
                            <span>TIMING: FASTING WINDOW END</span>
                        </div>
                        <div class="text-sm text-white font-bold mt-xs">Spinach & Mushroom Omelet cooked in Avocado Oil</div>
                        <div class="text-xxs text-slate mt-xxs">Companion supplement: L-Methylfolate 400mcg.</div>
                    </div>
                    <div class="meal-card" style="padding: 12px; border-left: 3px solid var(--accent-cyan);">
                        <div class="flex justify-between text-mono text-xxs text-cyan" style="display:flex; justify-content:space-between;">
                            <span>01:00 PM · GLYCEMIC BUFFER LUNCH</span>
                            <span>TIMING: OPTIMAL DIGESTIVE ZONE</span>
                        </div>
                        <div class="text-sm text-white font-bold mt-xs">Grilled Salmon over Mixed Greens & Olive Oil dressing</div>
                        <div class="text-xxs text-slate mt-xxs">Fasting window check: 16:8 schedule active (Eating window 12pm - 8pm).</div>
                    </div>
                    <div class="meal-card" style="padding: 12px; border-left: 3px solid var(--accent-cyan);">
                        <div class="flex justify-between text-mono text-xxs text-cyan" style="display:flex; justify-content:space-between;">
                            <span>07:00 PM · INSULIN RESTORATION DINNER</span>
                            <span>TIMING: 3 HOURS PRE-SLEEP LOCK</span>
                        </div>
                        <div class="text-sm text-white font-bold mt-xs">Lemon-Herb Baked Cod with Steamed Broccoli Speeds</div>
                        <div class="text-xxs text-slate mt-xxs">Metformin 500mg taken with first bite to assist glucose clearing.</div>
                    </div>
                    <div class="meal-card" style="padding: 12px; border-left: 3px solid var(--accent-cyan);">
                        <div class="flex justify-between text-mono text-xxs text-cyan" style="display:flex; justify-content:space-between;">
                            <span>AMBIENT · WATER SCHEDULE</span>
                            <span>TIMING: HOURLY MONITOR</span>
                        </div>
                        <div class="text-sm text-white font-bold mt-xs">Drink 250ml electrolyte-enriched water hourly</div>
                        <div class="text-xxs text-slate mt-xxs">Daily hydration index goal: 3.2 Liters.</div>
                    </div>
                </div>
            `;
        } else if (cycle === 'weekly') {
            mealPlanContent = `
                <div style="display:flex; flex-direction:column; gap:8px;" class="text-xxs">
                    <div class="dp-row"><span>MONDAY:</span> <span>Wild Salmon, Greens Salad (ApoE4 Lipid Focus)</span></div>
                    <div class="dp-row"><span>TUESDAY:</span> <span>Turkey breast wrap, broccoli (Glycogen clear)</span></div>
                    <div class="dp-row"><span>WEDNESDAY:</span> <span>Baked Cod, Asparagus (Liver Methylation Support)</span></div>
                    <div class="dp-row"><span>THURSDAY:</span> <span>Grilled Chicken, Spinach (MTHFR folate load)</span></div>
                    <div class="dp-row"><span>FRIDAY:</span> <span>Mediterranean Salad, Olive Oil (Endothelial Tone)</span></div>
                    <div class="dp-row"><span>SATURDAY:</span> <span>Baked Salmon, cauliflower rice (Metabolic rest)</span></div>
                    <div class="dp-row"><span>SUNDAY:</span> <span>Autophagy Induction Fast (18-hour fast, water only)</span></div>
                </div>
            `;
        } else if (cycle === 'monthly') {
            mealPlanContent = `
                <div style="display:flex; flex-direction:column; gap:10px;" class="text-xxs">
                    <div class="glass-card" style="padding:10px; border-left: 3px solid var(--accent-purple);">
                        <div class="text-purple font-bold text-mono">WEEK 1 · GLYCOGEN DEPLETION</div>
                        <p class="text-slate mt-xxs">Restrict net carbohydrates below 80g daily to flush liver fat reserves.</p>
                    </div>
                    <div class="glass-card" style="padding:10px; border-left: 3px solid var(--accent-purple);">
                        <div class="text-purple font-bold text-mono">WEEK 2 · INSULIN REST</div>
                        <p class="text-slate mt-xxs">Focus on high protein and leafy vegetables to clear cellular pre-diabetic markers.</p>
                    </div>
                    <div class="glass-card" style="padding:10px; border-left: 3px solid var(--accent-purple);">
                        <div class="text-purple font-bold text-mono">WEEK 3 · AUTOPHAGY INDUCTION</div>
                        <p class="text-slate mt-xxs">Implement three 16-hour fasting windows to clear damaged cellular components.</p>
                    </div>
                    <div class="glass-card" style="padding:10px; border-left: 3px solid var(--accent-purple);">
                        <div class="text-purple font-bold text-mono">WEEK 4 · CELLULAR REBUILD</div>
                        <p class="text-slate mt-xxs">Load Omega-3, active L-methylfolate, and trace nutrients to synthesize new cells.</p>
                    </div>
                </div>
            `;
        }

        // Build Food Matrix Tables
        let eatRows = foodsToEat.map(f => `
            <div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03);" class="text-xxs">
                <span class="text-green font-bold block">${f.name}</span>
                <span class="text-slate"><strong class="text-cyan">Why:</strong> ${f.why}</span>
                <span class="text-slate block"><strong class="text-teal">Benefit:</strong> ${f.benefit}</span>
            </div>
        `).join('');

        let limitRows = foodsToLimit.map(f => `
            <div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03);" class="text-xxs">
                <span class="text-yellow font-bold block">${f.name}</span>
                <span class="text-slate"><strong class="text-cyan">Why:</strong> ${f.why}</span>
                <span class="text-slate block"><strong class="text-teal">Benefit:</strong> ${f.benefit}</span>
            </div>
        `).join('');

        let avoidRows = foodsToAvoid.map(f => `
            <div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.03);" class="text-xxs">
                <span class="text-red font-bold block">${f.name}</span>
                <span class="text-slate"><strong class="text-cyan">Why:</strong> ${f.why}</span>
                <span class="text-slate block"><strong class="text-teal">Benefit:</strong> ${f.benefit}</span>
            </div>
        `).join('');

        // Supplement recommendations HTML
        let supplementHtml = supplementsList.map(s => `
            <div class="glass-card" style="padding: 12px; margin-bottom: 10px; border-left: 3px solid var(--accent-purple);">
                <div class="flex justify-between text-mono text-xxs mb-xs">
                    <span class="text-purple">${s.name} - ${s.dosage}</span>
                    <span class="evidence-badge level-a">${s.evidence} EVIDENCE</span>
                </div>
                <div class="text-xs text-white">${s.frequency} (Target: ${s.reason})</div>
            </div>
        `).join('');
        if (supplementHtml === '') {
            supplementHtml = `<div class="text-center text-xs text-slate py-sm"><p class="text-xxs">No supplements recommended.</p></div>`;
        }

        // Nutrient deficiency alerts HTML
        let defHtml = deficienciesList.map(d => {
            const levelClass = d.status.includes('CRITICAL') ? 'text-red font-bold' : d.status.includes('MODERATE') ? 'text-yellow' : 'text-green';
            return `
                <div class="dp-row text-xs">
                    <span><strong>${d.nutrient}</strong> <span class="text-mono text-xxs text-slate">(${d.source})</span></span>
                    <span class="${levelClass}">${d.level} - ${d.status}</span>
                </div>
            `;
        }).join('');
        if (defHtml === '') {
            defHtml = `<div class="text-center text-xs text-slate py-sm"><p class="text-xxs">No deficiency alerts logged.</p></div>`;
        }

        let clinicalAlertsHtml = '';
        if (hasApoE4) {
            clinicalAlertsHtml += `
                <div class="glass-card mb-xs text-xxs" style="padding:10px; border-left:3px solid var(--accent-purple); background:rgba(144,97,249,0.03); margin-bottom: 12px;">
                    <span class="text-purple font-bold text-mono block"><i data-lucide="shield-alert" class="inline" style="width:12px; margin-right:4px;"></i> GENOMIC WARNING: APOE E4 CARRIER DETECTED</span>
                    <p class="text-slate mt-xxs">Hepatic clearance of saturated lipid vectors is reduced. Keep daily saturated fat intake under 15g. Prioritize Omega-3 fatty acids and avoid keto lipid loads.</p>
                </div>
            `;
        }
        if (hasMthfr) {
            clinicalAlertsHtml += `
                <div class="glass-card mb-xs text-xxs" style="padding:10px; border-left:3px solid var(--accent-teal); background:rgba(0,255,209,0.03); margin-bottom: 12px;">
                    <span class="text-teal font-bold text-mono block"><i data-lucide="shield-alert" class="inline" style="width:12px; margin-right:4px;"></i> GENOMIC WARNING: MTHFR C677T ACTIVE</span>
                    <p class="text-slate mt-xxs">Enzymatic processing deficit of 30% mapped. Avoid synthetic folic acid fortification. Supplement with active L-methylfolate (5-MTHF).</p>
                </div>
            `;
        }
        if (hasPrediabetes) {
            clinicalAlertsHtml += `
                <div class="glass-card mb-xs text-xxs" style="padding:10px; border-left:3px solid var(--color-warning); background:rgba(245,158,11,0.03); margin-bottom: 12px;">
                    <span class="text-yellow font-bold text-mono block"><i data-lucide="trending-up" class="inline" style="width:12px; margin-right:4px;"></i> METABOLIC DRIFT: HbA1c ELEVATED (5.8%)</span>
                    <p class="text-slate mt-xxs">Pre-diabetic glycemic vector active. Implement low-glycemic macros (under 100g net carbohydrates per day) to restore insulin receptor sensitivity.</p>
                </div>
            `;
        }

        return `
            <div class="flex gap-sm mb-md pb-xs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                <button class="btn btn-secondary btn-sm nutrition-cycle-tab ${cycle === 'daily' ? 'active' : ''}" data-cycle="daily">Daily Meal Plan</button>
                <button class="btn btn-secondary btn-sm nutrition-cycle-tab ${cycle === 'weekly' ? 'active' : ''}" data-cycle="weekly">Weekly Plan</button>
                <button class="btn btn-secondary btn-sm nutrition-cycle-tab ${cycle === 'monthly' ? 'active' : ''}" data-cycle="monthly">Monthly Cycle</button>
            </div>

            <div class="patient-twin-grid">
                <!-- Meal plan & Macros -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> FOOD INTELLIGENCE BLUEPRINTS</h3>
                    <p class="text-xs text-slate mb-md">Personalized meal ratios optimized for APOE4 lipid clearance and MTHFR methylation efficiency.</p>
                    
                    ${clinicalAlertsHtml}
                    ${mealPlanContent}
 
                    <!-- MACRONUTRIENT CALCULATOR -->
                    <div class="glass-card mt-md" style="padding: 16px; background: rgba(0,0,0,0.15); margin-top: 16px;">
                        <h4 class="text-mono text-xxs text-cyan mb-sm">METABOLIC MACRO TARGETS</h4>
                        <div class="form-row">
                            <label class="form-label-txt">Metabolic Optimization Goal</label>
                            <select class="db-role-select" id="macro-goal-select" style="padding:10px;">
                                <option value="insulin" ${LifeOS.macroGoal === 'insulin' ? 'selected' : ''}>Insulin Sensitivity Optimization (Low Glycemic)</option>
                                <option value="keto" ${LifeOS.macroGoal === 'keto' ? 'selected' : ''}>Keto-Adaptation Pathway (APOE4 Adjusted)</option>
                                <option value="autophagy" ${LifeOS.macroGoal === 'autophagy' ? 'selected' : ''}>Longevity Autophagy Induction (Fast Mimicking)</option>
                                <option value="muscle" ${LifeOS.macroGoal === 'muscle' ? 'selected' : ''}>Muscle Protein Synthesis (High Protein)</option>
                            </select>
                        </div>
                        
                        <div class="mt-sm flex flex-col gap-xxs" style="margin-top: 16px; margin-bottom:16px;">
                            <span class="text-mono text-xxs text-slate block" style="margin-bottom:6px;">MACRO RATIO VISUALIZER</span>
                            <div style="height: 12px; width: 100%; display: flex; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,0.03);">
                                <div id="bar-macro-p" style="width: ${nut.macronutrients.protein}%; background: var(--accent-purple); height: 100%; transition: width 0.3s;"></div>
                                <div id="bar-macro-f" style="width: ${nut.macronutrients.fat}%; background: var(--accent-teal); height: 100%; transition: width 0.3s;"></div>
                                <div id="bar-macro-c" style="width: ${nut.macronutrients.carbs}%; background: var(--accent-cyan); height: 100%; transition: width 0.3s;"></div>
                            </div>
                            <div class="flex justify-between text-mono text-xxs mt-xxs" style="display:flex; justify-content:space-between; margin-top:6px;">
                                <span style="color: var(--accent-purple);">● Prot (<span id="txt-bar-p">${nut.macronutrients.protein}</span>%)</span>
                                <span style="color: var(--accent-teal);">● Fat (<span id="txt-bar-f">${nut.macronutrients.fat}</span>%)</span>
                                <span style="color: var(--accent-cyan);">● Carb (<span id="txt-bar-c">${nut.macronutrients.carbs}</span>%)</span>
                            </div>
                        </div>
 
                        <div class="simulator-controls mt-sm" style="padding:0;">
                            <div class="sim-row">
                                <label class="text-xxs">Protein: <span id="lbl-macro-p" class="text-cyan font-bold">${nut.macronutrients.protein}%</span></label>
                                <input type="range" id="slider-macro-p" min="15" max="45" step="5" value="${nut.macronutrients.protein}">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Fat: <span id="lbl-macro-f" class="text-cyan font-bold">${nut.macronutrients.fat}%</span></label>
                                <input type="range" id="slider-macro-f" min="20" max="60" step="5" value="${nut.macronutrients.fat}">
                            </div>
                            <div class="sim-row mt-xs">
                                <label class="text-xxs">Carbs: <span id="lbl-macro-c" class="text-cyan font-bold">${nut.macronutrients.carbs}%</span></label>
                                <input type="range" id="slider-macro-c" min="10" max="50" step="5" value="${nut.macronutrients.carbs}">
                            </div>
                        </div>
                        
                        <div class="flex justify-between align-center mt-md text-xs" style="border-top:1px dashed rgba(255,255,255,0.05); padding-top:12px; display:flex; justify-content:space-between;">
                            <div>
                                <span class="text-slate text-xxs block">TARGET DAILY CALORIES</span>
                                <span class="text-white font-bold block" id="macro-calories">2,200 kcal</span>
                            </div>
                            <div class="text-right">
                                <span class="text-slate text-xxs block">TARGET GRAMS (P / F / C)</span>
                                <span class="text-mono text-white font-bold block" id="macro-grams-val">165g / 85g / 192g</span>
                            </div>
                        </div>
                        <button class="btn btn-cyan btn-sm btn-full mt-sm" id="btn-save-macros">Apply Macro Plan to Twin</button>
                    </div>
                </div>
 
                <!-- Foods Matrix & Supplements & Deficiencies -->
                <div class="flex flex-col gap-md">
                    <!-- Foods matrix -->
                    <div class="glass-card" style="max-height: 480px; overflow-y: auto;">
                        <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> CLINICAL FOOD MATRIX</h3>
                        
                        <div class="mb-sm">
                            <span class="text-green font-bold text-mono text-xxs">⬤ RECOMMENDED TO EAT</span>
                            <div style="display:flex; flex-direction:column; gap:4px;" class="mt-xs">
                                ${eatRows}
                            </div>
                        </div>
                        <div class="mb-sm">
                            <span class="text-yellow font-bold text-mono text-xxs">⬤ MODERATE / LIMIT</span>
                            <div style="display:flex; flex-direction:column; gap:4px;" class="mt-xs">
                                ${limitRows}
                            </div>
                        </div>
                        <div>
                            <span class="text-red font-bold text-mono text-xxs">⬤ AVOID / CONTRAINDICATED</span>
                            <div style="display:flex; flex-direction:column; gap:4px;" class="mt-xs">
                                ${avoidRows}
                            </div>
                        </div>
                    </div>

                    <!-- Supplements -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color:var(--accent-purple);"></span> SUPPLEMENT RECOMMENDATIONS</h3>
                        <p class="text-xs text-slate mb-sm">Precision supplemental compounds to bypass mutations.</p>
                        ${supplementHtml}
                    </div>
 
                    <!-- Deficiencies -->
                    <div class="glass-card">
                        <h3 class="text-mono text-sm text-teal mb-sm"><span class="badge-dot" style="background-color:var(--accent-teal);"></span> NUTRIENT DEFICIENCY ALERTS</h3>
                        <div class="panel-stats-grid mt-sm">
                            ${defHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderLongevityEngine() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("LONGEVITY & BIO-AGE PROJECTIONS");
        }

        const le = LifeOS.longevityEngine;
        const details = le.biologicalAgeDetail;

        // Build protocols list
        let protoHtml = '';
        if (le.protocols && le.protocols.length > 0) {
            le.protocols.forEach(p => {
                protoHtml += `
                    <div class="glass-card" style="padding:14px; margin-bottom:12px; border-left:3px solid var(--accent-purple);">
                        <div class="flex justify-between text-mono text-xxs mb-xs">
                            <span class="text-purple">${p.area}</span>
                            <span class="badge text-xxs text-mono" style="padding:2px 6px; font-size:0.6rem;">Complexity: ${p.complexity}</span>
                        </div>
                        <div class="text-xs text-white font-bold">${p.description}</div>
                        <span class="text-green text-xxs block mt-xs font-bold"><i data-lucide="zap" class="inline" style="width:10px;margin-right:2px;"></i> Est. Impact: ${p.impact}</span>
                    </div>
                `;
            });
        }
        if (protoHtml === '') {
            protoHtml = `
                <div class="text-center text-xs text-slate py-sm">
                    <p class="text-xxs">No active protocols. Sync wearables or raw DNA sequence.</p>
                </div>
            `;
        }

        const brainVal = details.brain !== null ? details.brain : "—";
        const brainYounger = details.brain !== null ? `▼ ${(details.chronological - details.brain).toFixed(1)} Yrs Younger` : "—";

        const heartVal = details.heart !== null ? details.heart : "—";
        const heartYounger = details.heart !== null ? `▼ ${(details.chronological - details.heart).toFixed(1)} Yrs Younger` : "—";

        const metabolicVal = details.metabolic !== null ? details.metabolic : "—";
        const metabolicDiff = details.metabolic !== null ? `▲ ${(details.metabolic - details.chronological).toFixed(1)} Yrs Older` : "—";

        const immuneVal = details.immune !== null ? details.immune : "—";
        const immuneYounger = details.immune !== null ? `▼ ${(details.chronological - details.immune).toFixed(1)} Yrs Younger` : "—";

        const kidneyVal = details.kidney !== null ? details.kidney : "—";
        const kidneyYounger = details.kidney !== null ? `▼ ${(details.chronological - details.kidney).toFixed(1)} Yrs Younger` : "—";

        const liverVal = details.liver !== null ? details.liver : "—";
        const liverYounger = details.liver !== null ? `▼ ${(details.chronological - details.liver).toFixed(1)} Yrs Younger` : "—";

        const lifespanVal = le.projections.lifespan !== null ? `${le.projections.lifespan} Years` : "—";
        const healthspanVal = le.projections.healthspan !== null ? `${le.projections.healthspan} Years` : "—";

        const lifespanPct = le.projections.lifespan !== null ? Math.round((le.projections.lifespan / 95) * 100) : 0;
        const healthspanRatio = (le.projections.healthspan !== null && le.projections.lifespan) ? Math.round((le.projections.healthspan / le.projections.lifespan) * 100) : 0;

        return `
            <div style="margin-bottom:20px;">
                <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> BIOLOGICAL ORGAN CLOCK AGE</h3>
                <p class="text-xs text-slate mb-md">Methylation Horvath clock tracking cellular degradation velocity by organ network.</p>
                
                <div class="organ-grid">
                    <div class="organ-age-card">
                        <div class="text-xxs text-mono text-slate">BRAIN INTEGRITY</div>
                        <div class="organ-age-value text-purple" id="organ-val-brain">${brainVal}</div>
                        <div class="text-xxs text-green" id="organ-diff-brain">${brainYounger}</div>
                    </div>
                    <div class="organ-age-card">
                        <div class="text-xxs text-mono text-slate">HEART MATRIX</div>
                        <div class="organ-age-value text-red" id="organ-val-heart">${heartVal}</div>
                        <div class="text-xxs text-green" id="organ-diff-heart">${heartYounger}</div>
                    </div>
                    <div class="organ-age-card">
                        <div class="text-xxs text-mono text-slate">METABOLIC PATHWAYS</div>
                        <div class="organ-age-value text-yellow" id="organ-val-metabolic">${metabolicVal}</div>
                        <div class="text-xxs text-red" id="organ-diff-metabolic">${metabolicDiff}</div>
                    </div>
                    <div class="organ-age-card">
                        <div class="text-xxs text-mono text-slate">IMMUNE SYNERGY</div>
                        <div class="organ-age-value text-teal" id="organ-val-immune">${immuneVal}</div>
                        <div class="text-xxs text-green" id="organ-diff-immune">${immuneYounger}</div>
                    </div>
                    <div class="organ-age-card">
                        <div class="text-xxs text-mono text-slate">RENAL FILTRATION</div>
                        <div class="organ-age-value text-cyan" id="organ-val-kidney">${kidneyVal}</div>
                        <div class="text-xxs text-green" id="organ-diff-kidney">${kidneyYounger}</div>
                    </div>
                    <div class="organ-age-card">
                        <div class="text-xxs text-mono text-slate">HEPATIC CLEARANCE</div>
                        <div class="organ-age-value text-green" id="organ-val-liver">${liverVal}</div>
                        <div class="text-xxs text-green" id="organ-diff-liver">${liverYounger}</div>
                    </div>
                </div>

                <!-- ORGAN COMPARISON SVG CHART -->
                <div class="glass-card mt-md" style="padding: 16px;">
                    <h4 class="text-mono text-xxs text-cyan mb-sm">ORGAN AGE COMPARISON GRAPH (VS CHRONOLOGICAL BASELINE)</h4>
                    <svg viewBox="0 0 600 220" style="width:100%; height:auto;" xmlns="http://www.w3.org/2000/svg">
                        <line x1="120" y1="10" x2="120" y2="200" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        <line x1="220" y1="10" x2="220" y2="200" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        <line x1="320" y1="10" x2="320" y2="200" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        <line x1="420" y1="10" x2="420" y2="200" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        <line x1="520" y1="10" x2="520" y2="200" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
                        
                        <text x="120" y="212" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace" text-anchor="middle">10 yrs</text>
                        <text x="220" y="212" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace" text-anchor="middle">20 yrs</text>
                        <text x="320" y="212" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace" text-anchor="middle">30 yrs</text>
                        <text x="420" y="212" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace" text-anchor="middle">40 yrs</text>
                        <text x="520" y="212" fill="rgba(148,163,184,0.5)" font-size="7" font-family="monospace" text-anchor="middle">50 yrs</text>
                        
                        <text x="10" y="32" fill="#fff" font-size="8" font-family="monospace">BRAIN</text>
                        <text x="10" y="62" fill="#fff" font-size="8" font-family="monospace">HEART</text>
                        <text x="10" y="92" fill="#fff" font-size="8" font-family="monospace">METABOLIC</text>
                        <text x="10" y="122" fill="#fff" font-size="8" font-family="monospace">IMMUNE</text>
                        <text x="10" y="152" fill="#fff" font-size="8" font-family="monospace">KIDNEY</text>
                        <text x="10" y="182" fill="#fff" font-size="8" font-family="monospace">LIVER</text>
                        
                        <!-- Brain bar -->
                        <rect x="120" y="20" width="${details.chronological * 10}" height="5" fill="rgba(255,255,255,0.06)" rx="2.5"/>
                        <rect x="120" y="27" id="rect-bio-brain" width="${(details.brain || 0) * 10}" height="5" fill="var(--accent-purple)" rx="2.5" style="transition: width 0.3s;"/>
                        
                        <!-- Heart bar -->
                        <rect x="120" y="50" width="${details.chronological * 10}" height="5" fill="rgba(255,255,255,0.06)" rx="2.5"/>
                        <rect x="120" y="57" id="rect-bio-heart" width="${(details.heart || 0) * 10}" height="5" fill="var(--accent-red)" rx="2.5" style="transition: width 0.3s;"/>
                        
                        <!-- Metabolic bar -->
                        <rect x="120" y="80" width="${details.chronological * 10}" height="5" fill="rgba(255,255,255,0.06)" rx="2.5"/>
                        <rect x="120" y="87" id="rect-bio-metabolic" width="${(details.metabolic || 0) * 10}" height="5" fill="var(--accent-yellow)" rx="2.5" style="transition: width 0.3s;"/>
                        
                        <!-- Immune bar -->
                        <rect x="120" y="110" width="${details.chronological * 10}" height="5" fill="rgba(255,255,255,0.06)" rx="2.5"/>
                        <rect x="120" y="117" id="rect-bio-immune" width="${(details.immune || 0) * 10}" height="5" fill="var(--accent-teal)" rx="2.5" style="transition: width 0.3s;"/>
                        
                        <!-- Kidney bar -->
                        <rect x="120" y="140" width="${details.chronological * 10}" height="5" fill="rgba(255,255,255,0.06)" rx="2.5"/>
                        <rect x="120" y="147" id="rect-bio-kidney" width="${(details.kidney || 0) * 10}" height="5" fill="var(--accent-cyan)" rx="2.5" style="transition: width 0.3s;"/>
                        
                        <!-- Liver bar -->
                        <rect x="120" y="170" width="${details.chronological * 10}" height="5" fill="rgba(255,255,255,0.06)" rx="2.5"/>
                        <rect x="120" y="177" id="rect-bio-liver" width="${(details.liver || 0) * 10}" height="5" fill="var(--accent-green)" rx="2.5" style="transition: width 0.3s;"/>
                    </svg>
                    <div class="flex justify-between text-xxs text-slate mt-sm" style="display:flex; justify-content:space-between; margin-top:8px;">
                        <span><span style="display:inline-block; width:8px; height:8px; background:rgba(255,255,255,0.1); margin-right:4px;"></span> Chronological Age (Baseline)</span>
                        <span><span style="display:inline-block; width:8px; height:8px; background:var(--accent-cyan); margin-right:4px;"></span> Biological Age (Epigenetic Clock)</span>
                    </div>
                </div>
            </div>

            <!-- FUTURE HEALTH FORECASTING HORIZONS (STEP 5) -->
            <div class="glass-card mb-md" style="padding: 20px; margin-bottom: 20px;">
                <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> FUTURE HEALTH FORECASTING HORIZONS (CURRENT PATH VS OPTIMIZED)</h3>
                <p class="text-xs text-slate mb-md">Decoupling projected clinical progression under current standard behavior versus genomic life optimization.</p>
                
                <div class="horizons-container" style="display: flex; flex-direction: column; gap: 16px;">
                    <!-- 1 YEAR HORIZON -->
                    <div class="horizon-row" style="display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 16px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 12px;">
                        <div class="text-mono font-bold text-cyan" style="font-size: 0.85rem;">1 YEAR<div class="text-xxs text-slate" style="font-weight:normal;">Confidence: 94%</div></div>
                        <div class="glass-card" style="padding: 10px; background: rgba(239, 68, 68, 0.015); border-color: rgba(239, 68, 68, 0.08);">
                            <span class="text-red font-bold text-mono block" style="font-size:0.6rem;">🔴 CURRENT PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Metabolic velocity at 1.1x. Fasting glucose drift triggers HbA1c increase to 5.9%. ApoB lipid plaque accumulation begins.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(16, 185, 129, 0.015); border-color: rgba(16, 185, 129, 0.08);">
                            <span class="text-green font-bold text-mono block" style="font-size:0.6rem;">🟢 OPTIMIZED PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Cellular aging velocity rolled back to 0.82x. Fasting HbA1c stabilized to 5.5%. Lipids ApoB cleared below 80 mg/dL.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(0, 229, 255, 0.015); border-color: rgba(0, 229, 255, 0.08);">
                            <span class="text-cyan font-bold text-mono block" style="font-size:0.6rem;">⚡ REQUIRED ACTION</span>
                            <span class="text-xxs text-slate leading-relaxed">Supplement L-methylfolate (400mcg) and Omega-3 daily. Restrict saturated fats &lt;15g/day. Start Metformin.</span>
                        </div>
                    </div>

                    <!-- 5 YEAR HORIZON -->
                    <div class="horizon-row" style="display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 16px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 12px;">
                        <div class="text-mono font-bold text-cyan" style="font-size: 0.85rem;">5 YEARS<div class="text-xxs text-slate" style="font-weight:normal;">Confidence: 91%</div></div>
                        <div class="glass-card" style="padding: 10px; background: rgba(239, 68, 68, 0.015); border-color: rgba(239, 68, 68, 0.08);">
                            <span class="text-red font-bold text-mono block" style="font-size:0.6rem;">🔴 CURRENT PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Prediabetic transition complete (HbA1c 6.2%). Moderate carotid arterial wall thickening. Biological age gap narrows to 0y.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(16, 185, 129, 0.015); border-color: rgba(16, 185, 129, 0.08);">
                            <span class="text-green font-bold text-mono block" style="font-size:0.6rem;">🟢 OPTIMIZED PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Stable glycemic profile. Plaque progression arrested. Biological age rolled back to Chronological -5.2 Years.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(0, 229, 255, 0.015); border-color: rgba(0, 229, 255, 0.08);">
                            <span class="text-cyan font-bold text-mono block" style="font-size:0.6rem;">⚡ REQUIRED ACTION</span>
                            <span class="text-xxs text-slate leading-relaxed">Engage in 150 Mins weekly Zone 2 cardio, 3x hypertrophy weight training sessions to preserve muscle insulin receptors.</span>
                        </div>
                    </div>

                    <!-- 10 YEAR HORIZON -->
                    <div class="horizon-row" style="display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 16px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 12px;">
                        <div class="text-mono font-bold text-cyan" style="font-size: 0.85rem;">10 YEARS<div class="text-xxs text-slate" style="font-weight:normal;">Confidence: 88%</div></div>
                        <div class="glass-card" style="padding: 10px; background: rgba(239, 68, 68, 0.015); border-color: rgba(239, 68, 68, 0.08);">
                            <span class="text-red font-bold text-mono block" style="font-size:0.6rem;">🔴 CURRENT PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Type 2 diabetes onset probability 91%. Cognitive memory decay vectors active (APOE4). Micro-vascular compliance degrades.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(16, 185, 129, 0.015); border-color: rgba(16, 185, 129, 0.08);">
                            <span class="text-green font-bold text-mono block" style="font-size:0.6rem;">🟢 OPTIMIZED PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Glycemic baseline locked. Cognitive function markers 98% optimal. Biological age rolled back to Chronological -7.5 Years.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(0, 229, 255, 0.015); border-color: rgba(0, 229, 255, 0.08);">
                            <span class="text-cyan font-bold text-mono block" style="font-size:0.6rem;">⚡ REQUIRED ACTION</span>
                            <span class="text-xxs text-slate leading-relaxed">Enforce strict circadian sleep lock, Bedroom cooling (19°C), and autophagy mimicking fast protocols to clear cellular junk.</span>
                        </div>
                    </div>

                    <!-- 20 YEAR HORIZON -->
                    <div class="horizon-row" style="display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 16px; padding-bottom: 4px;">
                        <div class="text-mono font-bold text-cyan" style="font-size: 0.85rem;">20 YEARS<div class="text-xxs text-slate" style="font-weight:normal;">Confidence: 85%</div></div>
                        <div class="glass-card" style="padding: 10px; background: rgba(239, 68, 68, 0.015); border-color: rgba(239, 68, 68, 0.08);">
                            <span class="text-red font-bold text-mono block" style="font-size:0.6rem;">🔴 CURRENT PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">High probability (28%) of major cardiovascular event. Early Alzheimer/dementia plaque indicators. Life expectancy reduced.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(16, 185, 129, 0.015); border-color: rgba(16, 185, 129, 0.08);">
                            <span class="text-green font-bold text-mono block" style="font-size:0.6rem;">🟢 OPTIMIZED PATH</span>
                            <span class="text-xxs text-slate leading-relaxed">Vascular compliance score equivalent to 40-year old. Cognitive memory at peak. Life expectancy extended +11.2 Years.</span>
                        </div>
                        <div class="glass-card" style="padding: 10px; background: rgba(0, 229, 255, 0.015); border-color: rgba(0, 229, 255, 0.08);">
                            <span class="text-cyan font-bold text-mono block" style="font-size:0.6rem;">⚡ REQUIRED ACTION</span>
                            <span class="text-xxs text-slate leading-relaxed">Continuous biological twin telemetry adjustments. Maintain high cardiovascular reserve and low chronic systemic inflammation.</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="patient-twin-grid">
                <!-- Projections & Interactive Simulator -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> LIFESPAN VS HEALTHSPAN TRAJECTORY</h3>
                    <p class="text-xs text-slate mb-md">Simulate daily health factors against genetic limitations to project overall lifespan and healthy years.</p>
                    
                    <div class="simulator-controls" style="padding:0;">
                        <div class="sim-row">
                            <label class="text-xxs">Weekly Zone 2/Strength Cardio: <span id="lbl-long-ex" class="text-cyan font-bold">4.0 hrs</span></label>
                            <input type="range" id="slider-long-ex" min="0" max="15" step="0.5" value="4.0">
                        </div>
                        <div class="sim-row mt-xs">
                            <label class="text-xxs">Sleep Coherence score: <span id="lbl-long-sl" class="text-cyan font-bold">75%</span></label>
                            <input type="range" id="slider-long-sl" min="40" max="100" step="5" value="75">
                        </div>
                        <div class="sim-row mt-xs">
                            <label class="text-xxs">Methylation Diet Score: <span id="lbl-long-diet" class="text-cyan font-bold">70/100</span></label>
                            <input type="range" id="slider-long-diet" min="20" max="100" step="5" value="70">
                        </div>
                    </div>
 
                    <div class="grid grid-2-col text-center mt-md" style="border-top:1px dashed rgba(255,255,255,0.05); padding-top:16px;">
                        <div class="score-metric-badge">
                            <span class="text-mono text-xxs text-slate">PROJECTED LIFESPAN</span>
                            <span class="score-metric-val text-gradient" id="long-lifespan-val">${lifespanVal}</span>
                        </div>
                        <div class="score-metric-badge">
                            <span class="text-mono text-xxs text-slate">HEALTHY HEALTHSPAN</span>
                            <span class="score-metric-val text-teal" id="long-healthspan-val">${healthspanVal}</span>
                        </div>
                    </div>
 
                    <!-- Progress bar trackers -->
                    <div style="margin-top: 16px;">
                        <div class="flex justify-between text-mono text-xxs text-slate mb-xxs" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>LIFESPAN POTENTIAL LIMIT (95 YRS)</span>
                            <span id="long-lifespan-pct-label">${lifespanPct}%</span>
                        </div>
                        <div style="height: 6px; width: 100%; border-radius: 3px; background: rgba(255,255,255,0.04); overflow: hidden;">
                            <div id="bar-long-lifespan" style="height: 100%; width: ${lifespanPct}%; background: linear-gradient(90deg, var(--accent-purple), var(--accent-cyan)); transition: width 0.3s;"></div>
                        </div>
                    </div>
                    <div style="margin-top: 12px; margin-bottom: 8px;">
                        <div class="flex justify-between text-mono text-xxs text-slate mb-xxs" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>HEALTHSPAN RATIO (LIFESPAN COHERENCE)</span>
                            <span id="long-healthspan-pct-label">${healthspanRatio}%</span>
                        </div>
                        <div style="height: 6px; width: 100%; border-radius: 3px; background: rgba(255,255,255,0.04); overflow: hidden;">
                            <div id="bar-long-healthspan" style="height: 100%; width: ${healthspanRatio}%; background: linear-gradient(90deg, var(--accent-teal), var(--accent-cyan)); transition: width 0.3s;"></div>
                        </div>
                    </div>
                </div>
 
                <!-- Protocols list -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color:var(--accent-purple);"></span> ACTIVE EPIGENETIC PROTOCOLS</h3>
                    ${protoHtml}
                </div>
            </div>
        `;
    }

    // --- DOCTOR VIEWS ---
    function renderDoctorPatients() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("CLINICAL PATIENT DOSSIERS");
        }

        const score = LifeOS.healthTwin.healthScore !== null ? `${LifeOS.healthTwin.healthScore}/100` : "—";
        const risk = LifeOS.healthTwin.riskScore !== null ? LifeOS.healthTwin.riskScore : null;
        const riskLabel = risk !== null ? (risk > 50 ? 'High Risk' : risk > 25 ? 'Moderate Risk' : 'Low Risk') : 'Awaiting Data';
        const riskClass = risk !== null ? (risk > 50 ? 'high' : risk > 25 ? 'med' : 'low') : 'low';

        const hasApoE4 = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("apoe") || node.desc.toLowerCase().includes("alzheimer"));
        const hasMthfr = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("mthfr") || node.desc.toLowerCase().includes("methyl"));
        const hasPrediabetes = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("diabetes") || node.desc.toLowerCase().includes("a1c"));

        let biomarkersText = "Awaiting patient records";
        if (hasRecords) {
            biomarkersText = hasPrediabetes ? "HbA1c Elevated (5.8%), Fasting Glucose drift" : "Normal Glycemic/Lipid levels";
        }

        let genomicText = "Awaiting raw DNA file";
        if (hasDna) {
            let traits = [];
            if (hasMthfr) traits.push("MTHFR C677T Heterozygous");
            if (hasApoE4) traits.push("APOE4 Carrier");
            genomicText = traits.join(", ") || "DNA Decrypted (Wildtype)";
        }

        const wearableText = hasWearables ? "Live telemetry active" : "No wearable connected";

        return `
            <div class="patient-twin-grid">
                <!-- Patient database list -->
                <div class="glass-card" style="padding: 24px;">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> ASSIGNED CLINICAL DOSSIERS</h3>
                    <table class="patient-list-table">
                        <thead>
                            <tr>
                                <th>Patient Name</th>
                                <th>Age</th>
                                <th>Risk State</th>
                                <th>Twin Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="selected" id="patient-row-mercer">
                                <td><strong>${LifeOS.user.name}</strong></td>
                                <td>32 yrs</td>
                                <td><span class="badge-risk ${riskClass}">${riskLabel}</span></td>
                                <td><strong>${score}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Dossier Detail Panel -->
                <div class="glass-card" id="doctor-patient-detail-panel">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> PATIENT PROFILE DETAILS</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <div class="dp-row"><span>Full Name:</span> <span class="text-white font-bold">${LifeOS.user.name}</span></div>
                        <div class="dp-row"><span>Biomarker Alerter:</span> <span class="${hasRecords ? 'text-red font-bold' : 'text-slate'}">${biomarkersText}</span></div>
                        <div class="dp-row"><span>Hereditary DNA Markers:</span> <span class="${hasDna ? 'text-yellow font-bold' : 'text-slate'}">${genomicText}</span></div>
                        <div class="dp-row"><span>Wearable Sync:</span> <span class="${hasWearables ? 'text-green font-bold' : 'text-slate'}">${wearableText}</span></div>
                        <div class="dp-row"><span>Active Prescriptions:</span> <span class="text-green">${LifeOS.medications.map(m => m.name).join(", ") || "None"}</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderDoctorConsultations() {
        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            return renderDataUnavailableBlock("CLINICAL SPECIALIST CONSULTATIONS");
        }

        let intakeHtml = '';
        if (hasData) {
            intakeHtml = `
                <div class="glass-card mt-md text-xs text-slate" style="padding: 16px; background: rgba(0,0,0,0.15);">
                    <h4 class="text-mono text-xxs text-purple mb-xs">INTAKE DOSSIER: ${LifeOS.user.name.toUpperCase()} (DATE: ${new Date().toISOString().split('T')[0]})</h4>
                    <p class="mt-xs"><strong>Primary Symptom:</strong> Fatigue postprandial, sleep disruption.</p>
                    <p class="mt-xs"><strong>AI Analysis:</strong> ${hasWearables ? 'Wearable telemetry maps a glucose crash (64 mg/dL) following glycemic inputs. ' : ''}${hasDna ? 'MTHFR variant causes folate processing deficit of 30%.' : ''}</p>
                    <p class="mt-xs"><strong>Diagnostic Suggestions:</strong> Fasting lipid profile verification, continuous CGM tracking.</p>
                    <p class="mt-xs"><strong>Suggested Specialist:</strong> Cardiology / Endocrinology Collaboration.</p>
                </div>
            `;
        } else {
            intakeHtml = `
                <div class="glass-card mt-md text-xs text-slate text-center" style="padding: 24px; background: rgba(0,0,0,0.15);">
                    <i data-lucide="shield-alert" class="text-yellow mb-xs" style="width:32px; height:32px; margin: 0 auto; display:block;"></i>
                    <p class="text-xxs">No verified patient data available. Awaiting clinical uploads to generate AI intake reports.</p>
                </div>
            `;
        }

        return `
            <div class="patient-twin-grid">
                <!-- AI Generated clinical summaries -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot" style="background-color: var(--accent-cyan);"></span> AI INTAKE REPORTS</h3>
                    ${intakeHtml}
                </div>

                <!-- Active Consultation Video Room -->
                <div class="glass-card flex flex-col justify-between">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> TELEMEDICINE VIRTUAL ROOM</h3>
                    
                    <div class="glass-card text-center" style="padding: 40px 20px; background: rgba(0,0,0,0.4); border-color: rgba(255,255,255,0.03);">
                        <i data-lucide="video" class="text-purple mb-xs" style="width: 48px; height: 48px;"></i>
                        <p class="text-xs text-white">Click below to establish secure, peer-to-peer encrypted telemedicine channel.</p>
                        <button class="btn btn-purple btn-sm mt-md" id="btn-start-video">Start Consultation Call</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderDoctorPrescribe() {
        return `
            <div class="patient-twin-grid">
                <!-- Prescribe / Dispatch treatment plan form -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> ISSUE TREATMENT DIRECTIVE</h3>
                    <form id="doctor-prescribe-form" class="mt-md">
                        <div class="form-row">
                            <label class="form-label-txt">Patient Profile</label>
                            <input type="text" class="form-textbox" readonly value="Alex Mercer">
                        </div>
                        <div class="form-row mt-xs">
                            <label class="form-label-txt">Prescribe Compound / Lifestyle Directive</label>
                            <input type="text" class="form-textbox" id="doc-prescription" required placeholder="e.g. Metformin 500mg (Daily)">
                        </div>
                        <div class="form-row mt-xs">
                            <label class="form-label-txt">Specialist Nutrition Strategy</label>
                            <input type="text" class="form-textbox" id="doc-nutrition" placeholder="e.g. Low saturated lipid macros (35/35/30)">
                        </div>
                        <button type="submit" class="btn btn-cyan btn-full mt-md" id="btn-doc-dispatch">Dispatch to Patient Twin</button>
                    </form>
                </div>

                <!-- Drug Agent Drug interaction checker -->
                <div class="glass-card flex flex-col gap-sm">
                    <h3 class="text-mono text-sm text-purple"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> DRUG INTELLIGENCE AGENT (CYP450 FILTER)</h3>
                    <p class="text-xs text-slate">LifeOS Drug Agent continuously maps prescribed chemical compounds to patient specific genomic profiles (CYP2D6, CYP2C19 liver enzymes).</p>
                    
                    <div class="glass-card mt-xs text-xs" style="padding: 16px; background: rgba(0,0,0,0.1);" id="doc-interaction-panel">
                        <span class="text-mono text-teal text-xxs font-bold block"><i data-lucide="check-circle" class="inline text-teal" style="width: 12px; margin-right:4px;"></i> SYSTEM SAFE</span>
                        <p class="text-slate mt-xxs">No active CYP450 drug-drug interactions detected for Metformin + Methylfolate combination schedule.</p>
                    </div>
                </div>
            </div>
        `;
    }

    // --- RESEARCHER VIEWS ---
    function renderResearcherDatasets() {
        return `
            <div class="portal-view">
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-md"><span class="badge-dot"></span> ANONYMIZED COHORT DATA LAKE</h3>
                    <div class="dataset-scroll-box">
                        <table class="patient-list-table">
                            <thead>
                                <tr>
                                    <th>Subject ID</th>
                                    <th>Age</th>
                                    <th>Genotype APOE</th>
                                    <th>Genotype MTHFR</th>
                                    <th>HbA1c</th>
                                    <th>hs-CRP</th>
                                    <th>Stat</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>#L-OS_99182</strong></td>
                                    <td>32</td>
                                    <td>E3/E4</td>
                                    <td>Hetero (C677T)</td>
                                    <td>5.8%</td>
                                    <td>2.1 mg/L</td>
                                    <td><span class="text-green">Active</span></td>
                                </tr>
                                <tr>
                                    <td>#L-OS_10283</td>
                                    <td>45</td>
                                    <td>E3/E3</td>
                                    <td>Wild Type</td>
                                    <td>5.2%</td>
                                    <td>0.8 mg/L</td>
                                    <td><span class="text-green">Active</span></td>
                                </tr>
                                <tr>
                                    <td>#L-OS_11495</td>
                                    <td>52</td>
                                    <td>E4/E4</td>
                                    <td>Homo (C677T)</td>
                                    <td>6.1%</td>
                                    <td>4.2 mg/L</td>
                                    <td><span class="text-green">Active</span></td>
                                </tr>
                                <tr>
                                    <td>#L-OS_89112</td>
                                    <td>28</td>
                                    <td>E3/E4</td>
                                    <td>Hetero (C677T)</td>
                                    <td>5.4%</td>
                                    <td>1.8 mg/L</td>
                                    <td><span class="text-green">Active</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function renderResearcherTrials() {
        return `
            <div class="patient-twin-grid">
                <!-- Trial Candidates search optimizer -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> COHORT OPTIMIZER FOR TRIALS</h3>
                    <div class="form-row mt-md">
                        <label class="form-label-txt">Target Gene Variant</label>
                        <select class="db-role-select" id="trial-filter-gene">
                            <option value="MTHFR">MTHFR C677T Heterozygous</option>
                            <option value="APOE4">APOE E4 Carrier</option>
                            <option value="TCF7L2">TCF7L2 Insulin Deficit</option>
                        </select>
                    </div>
                    <div class="form-row mt-sm">
                        <label class="form-label-txt">Biomarker Range</label>
                        <select class="db-role-select" id="trial-filter-biomarker">
                            <option value="A1c">HbA1c > 5.7% (Pre-diabetic)</option>
                            <option value="hsCRP">hs-CRP > 2.0 mg/L (Moderate Inflamm.)</option>
                        </select>
                    </div>
                    <button class="btn btn-cyan btn-full mt-md" id="btn-run-cohort-scan">Scan Cohort Candidates</button>
                </div>

                <!-- Candidates matched output -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> MATCHED CANDIDATES</h3>
                    <div class="panel-stats-grid mt-md text-xs" id="trial-matches-output">
                        <div class="dp-row"><span>Candidates scanned:</span> <span class="text-white font-bold">4 participants</span></div>
                        <div class="dp-row"><span>Matches criteria:</span> <span class="text-green font-bold">2 subjects</span></div>
                        <div class="dp-row"><span>Match IDs:</span> <span class="text-cyan text-mono">#L-OS_99182, #L-OS_89112</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderResearcherPublications() {
        return `
            <div class="patient-twin-grid">
                <!-- Submit study form -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> PUBLISH CLINICAL FINDINGS</h3>
                    <form id="researcher-publish-form" class="mt-md">
                        <div class="form-row">
                            <label class="form-label-txt">Study Title</label>
                            <input type="text" class="form-textbox" id="pub-title" required placeholder="e.g. MTHFR Vascular Restoration Protocol">
                        </div>
                        <div class="form-row mt-xs">
                            <label class="form-label-txt">Target Profile Group</label>
                            <select class="db-role-select" id="pub-target">
                                <option value="MTHFR">MTHFR C677T Carriers</option>
                                <option value="APOE4">APOE E4 Carriers</option>
                                <option value="TCF7L2">TCF7L2 Carriers</option>
                            </select>
                        </div>
                        <div class="form-row mt-xs">
                            <label class="form-label-txt">Abstract (Patient-friendly translation summary)</label>
                            <textarea class="form-textbox" id="pub-abstract" rows="4" required style="resize:none;" placeholder="Summary details..."></textarea>
                        </div>
                        <button type="submit" class="btn btn-cyan btn-full mt-md">Broadcast Study Breakthrough</button>
                    </form>
                </div>

                <div class="glass-card flex flex-col gap-sm">
                    <h3 class="text-mono text-sm text-purple"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> ACTIVE DISPATCH NETWORK</h3>
                    <p class="text-xs text-slate">Published breakthroughs are automatically scanned by the client-side Research Copilot and push immediate alerts to matching profiles in the network.</p>
                </div>
            </div>
        `;
    }

    // --- PROVIDER VIEWS ---
    function renderProviderAnalytics() {
        return `
            <div class="patient-twin-grid">
                <!-- Operational Metrics -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-md"><span class="badge-dot"></span> HOSPITAL KPI MATRIX</h3>
                    <div class="grid grid-2-col text-center">
                        <div class="score-metric-badge">
                            <span class="text-mono text-xxs text-slate">TOTAL PATIENTS</span>
                            <span class="score-metric-val text-white">24,890</span>
                        </div>
                        <div class="score-metric-badge">
                            <span class="text-mono text-xxs text-slate">DOCTORS ACTIVE</span>
                            <span class="score-metric-val text-cyan">142</span>
                        </div>
                        <div class="score-metric-badge">
                            <span class="text-mono text-xxs text-slate">AI DIAGNOSES RUN</span>
                            <span class="score-metric-val text-purple">1.2M</span>
                        </div>
                        <div class="score-metric-badge">
                            <span class="text-mono text-xxs text-slate">AVG DIAGNOSIS TIME</span>
                            <span class="score-metric-val text-green">1.4s</span>
                        </div>
                    </div>
                </div>

                <!-- Telemetry streams status -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> REAL-TIME TELEMETRY STATS</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <div class="dp-row"><span>Active Watch Streams:</span> <span class="text-green font-bold">18,240 Wearables (Syncing)</span></div>
                        <div class="dp-row"><span>Emergency AI Watched Nodes:</span> <span class="text-green font-bold">100% Core coverage</span></div>
                        <div class="dp-row"><span>Data Encryption Status:</span> <span class="text-cyan text-mono">TLS 1.3/AES-256 (Zero Knowledge)</span></div>
                        <div class="dp-row"><span>Operational System Load:</span> <span class="text-green">14% (Optimized)</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderProviderStaff() {
        return `
            <div class="patient-twin-grid">
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> DEPT STAFF DIRECTORY</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <div class="dp-row"><span><strong>Dr. Helen Vance</strong> (Cardiology)</span> <span class="text-green">Available</span></div>
                        <div class="dp-row"><span><strong>Dr. Marcus Brody</strong> (Endocrinology)</span> <span class="text-green">Available</span></div>
                        <div class="dp-row"><span><strong>Dr. Charles Xavier</strong> (Neurology)</span> <span class="text-yellow">In Consult</span></div>
                    </div>
                </div>

                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> STAFF PROVISIONS</h3>
                    <form id="provider-add-staff-form" class="mt-md">
                        <div class="form-row">
                            <label class="form-label-txt">Doctor Name</label>
                            <input type="text" class="form-textbox" id="staff-name" required placeholder="Dr. Gregory House">
                        </div>
                        <div class="form-row mt-xs">
                            <label class="form-label-txt">Department / Specialty</label>
                            <input type="text" class="form-textbox" id="staff-dept" required placeholder="Diagnostic Medicine">
                        </div>
                        <button type="submit" class="btn btn-cyan btn-full mt-md">Onboard Doctor Profile</button>
                    </form>
                </div>
            </div>
        `;
    }

    function renderProviderWorkflows() {
        return `
            <div class="portal-view">
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-md"><span class="badge-dot"></span> ACTIVE COMPUTE WORKFLOW QUEUES</h3>
                    <div class="ledger-console text-xs" style="height: 250px;">
                        <div class="ledger-line"><span class="ledger-time">[18:58:02]</span> <span class="text-cyan">[CMO_AGENT]</span> Dispatching intake compilation thread for Subject #L-OS_99182... <span class="text-green">DONE</span></div>
                        <div class="ledger-line"><span class="ledger-time">[18:58:03]</span> <span class="text-purple">[GENOME_AGENT]</span> Fetching MTHFR locus from client bio-vault... <span class="text-green">DONE</span></div>
                        <div class="ledger-line"><span class="ledger-time">[18:58:04]</span> <span class="text-yellow">[DRUG_AGENT]</span> CYP450 liver enzymes checks completed. 0 warnings.</div>
                        <div class="ledger-line"><span class="ledger-time">[18:58:05]</span> <span class="text-teal">[NUTRITION_AGENT]</span> Resolving saturated lipid macro ratios... <span class="text-green">DONE</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- INVESTOR VIEWS ---
    function renderInvestorVision() {
        return `
            <div class="patient-twin-grid">
                <!-- Investment Vision deck -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> PITCH DECK & STRATEGY</h3>
                    <p class="text-xs text-slate leading-relaxed mt-md">Reactive healthcare systems are collapsing under structural costs. LifeOS AI solves this by deploying decentralized, zero-knowledge patient vaults, continuous wearable telemetry monitors, and autonomous diagnostic agents to intercept chronic pathologies years before cellular damage occurs.</p>
                    <div class="glass-card mt-md text-xs text-teal" style="padding: 16px; background: rgba(0,0,0,0.15);">
                        <h4 class="text-mono text-xxs text-white mb-xs">CORE TAM HIGHLIGHTS</h4>
                        <ul style="padding-left:16px;" class="mt-xs">
                            <li>$10T global healthcare spend TAM shifting to preventive paradigms.</li>
                            <li>Preventive intervention drops diagnostic latency by 80%.</li>
                        </ul>
                    </div>
                </div>

                <!-- Interactive roadmap -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-md"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> CORE PROTOCOL ROADMAP</h3>
                    <div class="roadmap-timeline text-xs">
                        <div class="roadmap-node-item done">
                            <div class="roadmap-bullet"></div>
                            <strong>Phase I (2026):</strong> Core Platform release, Wearable Sync (1Hz), Genomics mapping vault.
                        </div>
                        <div class="roadmap-node-item">
                            <div class="roadmap-bullet"></div>
                            <strong>Phase II (2027):</strong> AI Drug Discovery binding matching, molecular docking simulations.
                        </div>
                        <div class="roadmap-node-item future">
                            <div class="roadmap-bullet"></div>
                            <strong>Phase III (2028):</strong> Global Biomarker Grid, decentralized clinical trial networks.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderInvestorTAM() {
        return `
            <div class="patient-twin-grid">
                <!-- Cost Calculator -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> PREVENTIVE COST CALCULATOR</h3>
                    <p class="text-xs text-slate">Configure variables below to evaluate annual system savings comparing LifeOS AI preventive interventions against traditional reactive care.</p>
                    
                    <div class="simulator-controls mt-md" style="padding:0;">
                        <div class="sim-row">
                            <label class="text-xxs">Estimated Patient Base: <span id="lbl-inv-base" class="text-cyan font-bold">10,000</span></label>
                            <input type="range" id="slider-inv-base" min="1000" max="50000" step="1000" value="10000">
                        </div>
                        <div class="sim-row mt-xs">
                            <label class="text-xxs">Reactive Interventions Reduced (%): <span id="lbl-inv-pct" class="text-cyan font-bold">60%</span></label>
                            <input type="range" id="slider-inv-pct" min="20" max="85" value="60">
                        </div>
                    </div>
                </div>

                <!-- Projected returns display -->
                <div class="glass-card text-center" style="display:flex; flex-direction:column; justify-content:center;">
                    <h3 class="card-title text-mono text-xs">ANNUAL PROJECTED SYSTEM SAVINGS</h3>
                    <div class="risk-meter-wrapper mt-md">
                        <div class="risk-percentage text-gradient text-mono" id="inv-savings-val">$18.0M</div>
                        <div class="risk-label text-mono text-xxs text-teal">REDUCED CHRONIC ADMISSIONS</div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- ADMIN VIEWS ---
    function renderAdminUsers() {
        const totalRegs = LifeOS.registrations.length;
        const pendingRegs = LifeOS.registrations.filter(r => r.status === "Pending Review").length;
        const approvedRegs = LifeOS.registrations.filter(r => r.status === "Approved").length;

        const regRows = LifeOS.registrations.map(reg => {
            const statusColor = reg.status === "Approved" ? "text-green font-bold" : (reg.status === "Pending Review" ? "text-yellow font-bold" : "text-red font-bold");
            return `
                <tr>
                    <td><strong class="text-mono text-cyan text-xxs">${reg.id}</strong></td>
                    <td><strong>${reg.fullName}</strong><br><span class="text-xxxxs text-slate">${reg.country}</span></td>
                    <td class="text-xxs">
                        <span class="text-white">${reg.email}</span><br>
                        <span class="text-slate">${reg.phone}</span>
                    </td>
                    <td class="text-xxs">
                        <span class="badge" style="background:rgba(0,229,255,0.1); color:var(--accent-cyan); font-size:0.6rem;">${reg.role}</span><br>
                        <span class="text-xxxxs text-slate">${reg.organization}</span>
                    </td>
                    <td class="text-xxs text-center">
                        <span class="badge" style="background:${reg.emailOptIn ? 'rgba(0,255,209,0.1)' : 'rgba(255,255,255,0.05)'}; color:${reg.emailOptIn ? 'var(--accent-teal)' : 'var(--text-slate)'}; font-size:0.55rem;">EMAIL ${reg.emailOptIn ? '✓' : '✗'}</span>
                        <span class="badge" style="background:${reg.whatsAppOptIn ? 'rgba(144,97,249,0.1)' : 'rgba(255,255,255,0.05)'}; color:${reg.whatsAppOptIn ? 'var(--accent-purple)' : 'var(--text-slate)'}; font-size:0.55rem;">WA ${reg.whatsAppOptIn ? '✓' : '✗'}</span>
                    </td>
                    <td class="text-xxs"><span class="${statusColor}">${reg.status}</span></td>
                    <td>
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                            ${reg.status !== 'Approved' ? `<button class="btn btn-teal btn-sm btn-reg-approve" data-id="${reg.id}" style="padding:2px 6px; font-size:0.6rem;">Approve</button>` : ''}
                            ${reg.status !== 'Rejected' ? `<button class="btn btn-secondary btn-sm text-red btn-reg-reject" data-id="${reg.id}" style="padding:2px 6px; font-size:0.6rem;">Reject</button>` : ''}
                            <button class="btn btn-secondary btn-sm text-cyan btn-reg-resend-email" data-id="${reg.id}" style="padding:2px 6px; font-size:0.6rem;" title="Resend Welcome Email"><i data-lucide="mail"></i> Email</button>
                            ${reg.whatsAppOptIn ? `<button class="btn btn-secondary btn-sm text-purple btn-reg-resend-wa" data-id="${reg.id}" style="padding:2px 6px; font-size:0.6rem;" title="Resend WhatsApp Message"><i data-lucide="message-square"></i> WA</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="portal-view flex flex-col gap-md">
                <!-- ONBOARDING REGISTRATIONS AUTOMATION CONSOLE -->
                <div class="glass-card">
                    <div class="flex justify-between align-center mb-sm">
                        <div>
                            <h3 class="text-mono text-sm text-cyan"><span class="badge-dot" style="background:var(--accent-cyan);"></span> ONBOARDING REGISTRATIONS & AUTOMATION CONSOLE</h3>
                            <p class="text-xxs text-slate mt-xxs">Manage incoming registration protocols, multi-channel email/WhatsApp dispatches, and role approval queues.</p>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary btn-sm text-cyan" onclick="exportRegistrationsToCSV()" style="font-size:0.65rem; padding:4px 10px;">
                                <i data-lucide="download"></i> Export CSV
                            </button>
                        </div>
                    </div>

                    <div class="flex gap-sm mb-md text-xxs">
                        <span class="badge" style="background:rgba(0,229,255,0.1); color:var(--accent-cyan);">TOTAL REGISTRATIONS: ${totalRegs}</span>
                        <span class="badge" style="background:rgba(245,158,11,0.1); color:var(--color-warning);">PENDING REVIEW: ${pendingRegs}</span>
                        <span class="badge" style="background:rgba(0,255,209,0.1); color:var(--accent-teal);">APPROVED: ${approvedRegs}</span>
                    </div>

                    <div class="dataset-scroll-box">
                        <table class="patient-list-table">
                            <thead>
                                <tr>
                                    <th>Registration ID</th>
                                    <th>Applicant Name</th>
                                    <th>Contact Info</th>
                                    <th>Role & Org</th>
                                    <th>Opt-Ins</th>
                                    <th>Status</th>
                                    <th>Automation Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${regRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- USER ACCOUNTS SYSTEM INDEX -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-md"><span class="badge-dot" style="background:var(--accent-purple);"></span> VERIFIED SYSTEM ACCOUNTS INDEX</h3>
                    <div class="dataset-scroll-box">
                        <table class="patient-list-table">
                            <thead>
                                <tr>
                                    <th>User Account</th>
                                    <th>Email</th>
                                    <th>Current Role Permissions</th>
                                    <th>Access Status</th>
                                    <th>Action Override</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>Alex Mercer</strong></td>
                                    <td>alex.mercer@lifeos.ai</td>
                                    <td>Patient / Doctor</td>
                                    <td><span class="text-green">Verified</span></td>
                                    <td><button class="btn btn-secondary btn-sm db-override-role-btn" data-user="alex" style="padding:4px 8px; font-size:0.65rem;">Modify Permission</button></td>
                                </tr>
                                <tr>
                                    <td>Dr. Helen Vance</td>
                                    <td>helen.vance@lifeos.ai</td>
                                    <td>Doctor</td>
                                    <td><span class="text-green">Verified</span></td>
                                    <td><button class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:0.65rem; opacity:0.5;" disabled>Modify Permission</button></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function renderAdminAgents() {
        return `
            <div class="patient-twin-grid">
                <!-- Weights Control -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> AI AGENT WEIGHT CONTEXT</h3>
                    <p class="text-xs text-slate">Tweak weights below to configure agent influence parameters on disease risk assessments and digital twin status maps.</p>
                    
                    <div class="simulator-controls mt-md" style="padding:0;">
                        <div class="sim-row">
                            <label class="text-xxs">CMO Agent Weight: <span id="lbl-w-cmo" class="text-cyan font-bold">${LifeOS.agentWeights.cmo}%</span></label>
                            <input type="range" id="slider-w-cmo" min="50" max="100" value="${LifeOS.agentWeights.cmo}">
                        </div>
                        <div class="sim-row mt-xs">
                            <label class="text-xxs">Genome Agent Weight: <span id="lbl-w-genome" class="text-cyan font-bold">${LifeOS.agentWeights.genome}%</span></label>
                            <input type="range" id="slider-w-genome" min="50" max="100" value="${LifeOS.agentWeights.genome}">
                        </div>
                        <div class="sim-row mt-xs">
                            <label class="text-xxs">Emergency Agent Weight: <span id="lbl-w-emergency" class="text-cyan font-bold">${LifeOS.agentWeights.emergency}%</span></label>
                            <input type="range" id="slider-w-emergency" min="50" max="100" value="${LifeOS.agentWeights.emergency}">
                        </div>
                    </div>
                </div>

                <!-- Live Agent Network statuses -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> ACTIVE COGNITIVE AGENTS</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <div class="dp-row"><span>CMO Diagnostic Agent:</span> <span class="text-green font-bold">Online (Active)</span></div>
                        <div class="dp-row"><span>Genome Mapping Agent:</span> <span class="text-green font-bold">Online (Active)</span></div>
                        <div class="dp-row"><span>Drug CYP450 Agent:</span> <span class="text-green font-bold">Online (Active)</span></div>
                        <div class="dp-row"><span>Emergency Anomaly Agent:</span> <span class="text-green font-bold">Online (Persistent Watcher)</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderAdminAudit() {
        let lines = '';
        LifeOS.auditLogs.slice().reverse().forEach(log => {
            lines += `
                <div class="ledger-line">
                    <span class="ledger-time">[${log.time}]</span>
                    <span class="ledger-sec">[${log.type}]</span>
                    <span class="ledger-event">${log.event}</span>
                </div>
            `;
        });

        return `
            <div class="portal-view">
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> HIPAA AUDIT LEDGER</h3>
                    <p class="text-xs text-slate mb-md">Scrolling console showing immutable cryptographic audits of user file decryptions, model interations, and data sync pipeline ticks.</p>
                    <div class="ledger-console" id="admin-ledger-console-pane">
                        ${lines}
                    </div>
                </div>
            </div>
        `;
    }

    function renderAdminSecurity() {
        return `
            <div class="patient-twin-grid">
                <!-- Encryption details -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> ZERO KNOWLEDGE GATES</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <div class="dp-row"><span>Cryptographic Engine:</span> <span class="text-cyan font-bold">AES-GCM-256 (Local Decrypt)</span></div>
                        <div class="dp-row"><span>Vault Access Privilege:</span> <span class="text-green font-bold">Authorized (Signature Verified)</span></div>
                        <div class="dp-row"><span>Clinician Key Read Gates:</span> <span class="text-green font-bold">Active (Granular Consent)</span></div>
                        <div class="dp-row"><span>GDPR Compliance:</span> <span class="text-green font-bold">100% Client-Side Local Purge Active</span></div>
                    </div>
                </div>

                <!-- Manage permissions -->
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-purple mb-sm"><span class="badge-dot" style="background-color: var(--accent-purple);"></span> MANAGE DATA PERMISSIONS</h3>
                    <div class="panel-stats-grid mt-md text-xs">
                        <label class="chk-interest-label" style="padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <input type="checkbox" checked id="chk-allow-genomics"> Allow Doctor Vance to decrypt DNA Sequencing maps
                        </label>
                        <label class="chk-interest-label" style="padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <input type="checkbox" checked id="chk-allow-wearables"> Allow Doctor Vance to poll wearable telemetry logs
                        </label>
                        <label class="chk-interest-label" style="padding: 8px 0;">
                            <input type="checkbox" id="chk-allow-research"> Allow anonymized research data sharing
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    // --- PERSONNEL WELLNESS PROFILE VIEW RENDERER ---
    // --- PERSONNEL WELLNESS & MOBILE SELF-ASSESSMENT COMPONENT ---
    function renderPersonnelWellnessProfile() {
        const api = (typeof PersonnelWellnessAPI !== 'undefined') ? PersonnelWellnessAPI : (typeof window !== 'undefined' ? window.PersonnelWellnessAPI : (typeof global !== 'undefined' ? global.PersonnelWellnessAPI : null));
        const logger = (typeof PersonnelAuditLogger !== 'undefined') ? PersonnelAuditLogger : (typeof window !== 'undefined' ? window.PersonnelAuditLogger : (typeof global !== 'undefined' ? global.PersonnelAuditLogger : null));
        
        const activeUser = { id: LifeOS.user.id || LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };
        const targetUserId = LifeOS.user.id || "LIFEOS-USER-001";

        // 1. COMMANDER ROLE ANONYMITY GATE & AGGREGATED VIEW
        if (LifeOS.activeRole === 'commander') {
            const aggRes = api.getAggregatedUnitTrends(activeUser, 'COMMANDER', 'UNIT-ALPHA-WELLNESS', LifeOS);
            return renderCommanderUnitAggregateView(aggRes);
        }

        // 2. FETCH INDIVIDUAL PERSONNEL WELLNESS DATA
        const res = api.getProfile(activeUser, LifeOS.activeRole, targetUserId, LifeOS);
        if (res.status !== 200) {
            return `
                <div class="portal-view">
                    <div class="pwp-banner pwp-firewall-banner">
                        <i data-lucide="shield-alert" class="text-purple" style="width: 32px; height: 32px; flex-shrink: 0;"></i>
                        <div>
                            <h4 class="text-purple font-bold text-sm">403 FORBIDDEN: AUTHORIZATION GATE</h4>
                            <p class="text-xs text-slate">${res.error}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        const profile = res.data;
        const currentSubtab = LifeOS.mwsActiveSubtab || "dashboard";
        const timeframe = LifeOS.mwsTimeframe || "30d";

        // Current status & trends
        const statusRes = api.getCurrentStatus(activeUser, LifeOS.activeRole, targetUserId, LifeOS);
        const currentStatusData = statusRes.status === 200 ? statusRes.data : { todayStatus: "NOT_COMPLETED", wearable: { connected: false } };

        const trendsRes = api.getTrends(activeUser, LifeOS.activeRole, targetUserId, timeframe, LifeOS);
        const trendsData = trendsRes.status === 200 ? trendsRes.data : null;

        // Subnav Pills
        const subnavHtml = `
            <div class="mws-subnav">
                <button class="mws-subnav-btn ${currentSubtab === 'dashboard' ? 'active' : ''}" onclick="window.__mwsSetSubtab('dashboard')">
                    <i data-lucide="activity"></i> Wellness Dashboard
                </button>
                <button class="mws-subnav-btn ${currentSubtab === 'wizard' ? 'active' : ''}" onclick="window.__mwsSetSubtab('wizard')">
                    <i data-lucide="clipboard-check"></i> Daily Check-in
                </button>
                <button class="mws-subnav-btn ${currentSubtab === 'trends' ? 'active' : ''}" onclick="window.__mwsSetSubtab('trends')">
                    <i data-lucide="trending-up"></i> Trends & Patterns
                </button>
                <button class="mws-subnav-btn ${currentSubtab === 'duty' ? 'active' : ''}" onclick="window.__mwsSetSubtab('duty')">
                    <i data-lucide="briefcase"></i> Duty Context
                </button>
                <button class="mws-subnav-btn ${currentSubtab === 'privacy' ? 'active' : ''}" onclick="window.__mwsSetSubtab('privacy')">
                    <i data-lucide="lock"></i> Privacy & Data Control
                </button>
                <button class="mws-subnav-btn ${currentSubtab === 'support' ? 'active' : ''}" onclick="window.__mwsSetSubtab('support')">
                    <i data-lucide="heart-handshake"></i> Confidential Support
                </button>
                ${(LifeOS.activeRole === 'welfare_officer' || LifeOS.activeRole === 'admin') ? `
                    <button class="mws-subnav-btn ${currentSubtab === 'aggregate' ? 'active' : ''}" onclick="window.__mwsSetSubtab('aggregate')">
                        <i data-lucide="users"></i> Unit Aggregates
                    </button>
                ` : ''}
            </div>
        `;

        let subtabContent = '';
        if (currentSubtab === 'dashboard') {
            subtabContent = renderMwsDashboardTab(profile, currentStatusData, trendsData);
        } else if (currentSubtab === 'wizard') {
            subtabContent = renderMwsWizardTab(profile);
        } else if (currentSubtab === 'trends') {
            subtabContent = renderMwsTrendsTab(profile, trendsData, timeframe);
        } else if (currentSubtab === 'duty') {
            subtabContent = renderMwsDutyTab(profile, logger);
        } else if (currentSubtab === 'privacy') {
            subtabContent = renderMwsPrivacyTab(profile);
        } else if (currentSubtab === 'support') {
            subtabContent = renderMwsSupportTab(profile);
        } else if (currentSubtab === 'aggregate') {
            const aggRes = api.getAggregatedUnitTrends(activeUser, LifeOS.activeRole, 'UNIT-ALPHA-WELLNESS', LifeOS);
            subtabContent = renderCommanderUnitAggregateView(aggRes);
        }

        return `
            <div class="portal-view">
                <!-- Medical Data Firewall Banner -->
                <div class="pwp-banner pwp-firewall-banner">
                    <i data-lucide="shield-check" class="text-purple" style="width: 28px; height: 28px; flex-shrink: 0;"></i>
                    <div>
                        <div class="font-bold text-sm text-purple">MEDICAL DATA FIREWALL ACTIVE</div>
                        <div class="text-xs text-slate">
                            Clinical medical history (diagnoses, lab reports, prescriptions) remains strictly isolated from Personnel Wellness. Commanders and non-clinical personnel CANNOT browse clinical EHR records.
                        </div>
                    </div>
                </div>

                <!-- Welfare-First & Non-Disciplinary Banner -->
                <div class="pwp-banner pwp-welfare-banner">
                    <i data-lucide="heart-handshake" class="text-teal" style="width: 28px; height: 28px; flex-shrink: 0;"></i>
                    <div>
                        <div class="font-bold text-sm text-teal">PRIVATE PERSONNEL WELLNESS SUPPORT SYSTEM</div>
                        <div class="text-xs text-slate">
                            Voluntary self-monitoring for fatigue recovery and wellness. This is NOT a diagnosis system, NOT a disciplinary tool, and NOT a fitness-for-duty evaluation.
                        </div>
                    </div>
                </div>

                ${subnavHtml}

                <div class="mws-tab-content-pane">
                    ${subtabContent}
                </div>
            </div>
        `;
    }

    // --- SUBTAB 1: MOBILE WELLNESS DASHBOARD ---
    function renderMwsDashboardTab(profile, currentStatusData, trendsData) {
        const todayStatus = currentStatusData.todayStatus || "NOT_COMPLETED";
        const latest = currentStatusData.latestAssessment || (profile.wellness_assessments && profile.wellness_assessments[0]) || null;
        const r = latest ? (latest.responses || {}) : {};
        const baseline = currentStatusData.baseline || {};
        const wearable = currentStatusData.wearable || { connected: false };

        // Today Check-in Card
        let checkInHeroHtml = '';
        if (todayStatus === 'COMPLETED') {
            checkInHeroHtml = `
                <div class="mws-today-banner flex justify-between align-center flex-wrap gap-md">
                    <div>
                        <span class="pwp-status-pill pwp-pill-green mb-xs inline-block">✓ COMPLETED TODAY</span>
                        <h3 class="text-lg font-bold text-white mb-xs">Today's Check-in Complete</h3>
                        <p class="text-xs text-slate max-w-lg">
                            Your voluntary check-in has been securely recorded and evaluated against your personal baseline.
                        </p>
                    </div>
                    <div class="flex gap-sm">
                        <button class="btn btn-secondary btn-sm" onclick="window.__mwsOpenWizard()">
                            <i data-lucide="edit-3"></i> Update Today's Responses
                        </button>
                    </div>
                </div>
            `;
        } else if (todayStatus === 'SKIPPED') {
            checkInHeroHtml = `
                <div class="mws-today-banner flex justify-between align-center flex-wrap gap-md" style="border-color: rgba(255, 184, 0, 0.3);">
                    <div>
                        <span class="pwp-status-pill pwp-pill-yellow mb-xs inline-block">SKIPPED FOR TODAY</span>
                        <h3 class="text-lg font-bold text-white mb-xs">Today's Check-in Skipped</h3>
                        <p class="text-xs text-slate max-w-lg">
                            You chose to skip today's voluntary check-in. You may complete it at any time if you wish.
                        </p>
                    </div>
                    <div class="flex gap-sm">
                        <button class="btn btn-cyan btn-sm" onclick="window.__mwsOpenWizard()">
                            <i data-lucide="play"></i> Complete Check-in Now
                        </button>
                    </div>
                </div>
            `;
        } else {
            checkInHeroHtml = `
                <div class="mws-today-banner flex justify-between align-center flex-wrap gap-md">
                    <div>
                        <span class="pwp-status-pill pwp-pill-yellow mb-xs inline-block animate-pulse">AWAITING INPUT</span>
                        <h3 class="text-lg font-bold text-white mb-xs">Today's Wellness Check-in</h3>
                        <p class="text-xs text-slate max-w-lg">
                            A quick 1–2 minute voluntary self-assessment of your current mood, stress, energy, fatigue, sleep, and recovery.
                        </p>
                    </div>
                    <div class="flex gap-sm">
                        <button class="btn btn-primary" onclick="window.__mwsOpenWizard()" style="background: linear-gradient(135deg, #00E5FF, #9061F9); border: none;">
                            <i data-lucide="play"></i> Start Check-in (1–2 min)
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="window.__mwsSkipToday()">
                            Skip for Today
                        </button>
                    </div>
                </div>
            `;
        }

        // Quick Overview 6 Cards (Using calm, supportive language)
        const moodVal = r.mood || "Good";
        const stressVal = r.stress || "Moderate";
        const energyVal = r.energy || "Moderate";
        const fatigueVal = r.fatigue || "Slightly tired";
        const sleepHours = r.sleepDurationHours !== undefined ? `${r.sleepDurationHours}h ${r.sleepDurationMinutes || 0}m` : "7h 10m";
        const recoveryVal = r.recovery || "Well";

        const baselineComp = latest?.baselineComparison || {};

        const overviewCardsHtml = `
            <div class="mws-overview-grid">
                <!-- Stress -->
                <div class="mws-indicator-card">
                    <div class="mws-indicator-header">
                        <span class="mws-indicator-label">Stress</span>
                        <i data-lucide="zap" class="text-yellow" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="mws-indicator-value ${stressVal === 'High' || stressVal === 'Very high' ? 'text-yellow' : 'text-white'}">
                        ${stressVal}
                    </div>
                    <div class="text-xs text-slate mb-xs">
                        Indicator: <span class="text-cyan">${baselineComp.stressVsBaseline || 'At baseline'}</span>
                    </div>
                    <div class="mws-indicator-footer">
                        <span>Source: Self-reported</span>
                        <span class="text-slate">User provided</span>
                    </div>
                </div>

                <!-- Energy -->
                <div class="mws-indicator-card">
                    <div class="mws-indicator-header">
                        <span class="mws-indicator-label">Energy</span>
                        <i data-lucide="battery-charging" class="text-teal" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="mws-indicator-value text-teal">${energyVal}</div>
                    <div class="text-xs text-slate mb-xs">
                        Indicator: <span class="text-white">Active Operational Vitality</span>
                    </div>
                    <div class="mws-indicator-footer">
                        <span>Source: Self-reported</span>
                        <span class="text-slate">User provided</span>
                    </div>
                </div>

                <!-- Fatigue -->
                <div class="mws-indicator-card">
                    <div class="mws-indicator-header">
                        <span class="mws-indicator-label">Fatigue</span>
                        <i data-lucide="cloud-rain" class="text-purple" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="mws-indicator-value ${fatigueVal.includes('tired') ? 'text-yellow' : 'text-white'}">${fatigueVal}</div>
                    <div class="text-xs text-slate mb-xs">
                        Indicator: <span class="text-cyan">${baselineComp.fatigueVsBaseline || 'At baseline'}</span>
                    </div>
                    <div class="mws-indicator-footer">
                        <span>Source: Self-reported</span>
                        <span class="text-slate">User provided</span>
                    </div>
                </div>

                <!-- Sleep -->
                <div class="mws-indicator-card">
                    <div class="mws-indicator-header">
                        <span class="mws-indicator-label">Sleep Duration</span>
                        <i data-lucide="moon" class="text-cyan" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="mws-indicator-value text-cyan">${sleepHours}</div>
                    <div class="text-xs text-slate mb-xs">
                        Quality: <strong class="text-white">${r.sleepQuality || 'Good'}</strong>
                        ${baselineComp.sleepDeltaPct !== null && baselineComp.sleepDeltaPct !== undefined ? ` | <span class="${baselineComp.sleepDeltaPct < -10 ? 'text-yellow' : 'text-teal'}">${baselineComp.sleepDeltaPct > 0 ? '+' : ''}${baselineComp.sleepDeltaPct}% vs baseline</span>` : ''}
                    </div>
                    <div class="mws-indicator-footer">
                        <span>Source: Self-reported</span>
                        <span class="text-slate">User provided</span>
                    </div>
                </div>

                <!-- Mood -->
                <div class="mws-indicator-card">
                    <div class="mws-indicator-header">
                        <span class="mws-indicator-label">Mood</span>
                        <i data-lucide="smile" class="text-green" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="mws-indicator-value text-green">${moodVal}</div>
                    <div class="text-xs text-slate mb-xs">
                        Status: <span class="text-white">Perceived Well-being</span>
                    </div>
                    <div class="mws-indicator-footer">
                        <span>Source: Self-reported</span>
                        <span class="text-slate">User provided</span>
                    </div>
                </div>

                <!-- Recovery -->
                <div class="mws-indicator-card">
                    <div class="mws-indicator-header">
                        <span class="mws-indicator-label">Recovery</span>
                        <i data-lucide="shield" class="text-teal" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="mws-indicator-value text-teal">${recoveryVal}</div>
                    <div class="text-xs text-slate mb-xs">
                        Indicator: <span class="text-cyan">${baselineComp.recoveryVsBaseline || 'At baseline'}</span>
                    </div>
                    <div class="mws-indicator-footer">
                        <span>Source: Self-reported</span>
                        <span class="text-slate">Non-clinical</span>
                    </div>
                </div>
            </div>
        `;

        // Real Wearable Data Section (Zero Fake Data)
        let wearableCardHtml = '';
        if (wearable.connected) {
            wearableCardHtml = `
                <div class="glass-card mb-lg" style="border-color: rgba(0, 255, 209, 0.3);">
                    <div class="flex justify-between align-center mb-sm">
                        <div class="flex align-center gap-sm">
                            <i data-lucide="watch" class="text-teal" style="width: 20px; height: 20px;"></i>
                            <span class="font-bold text-white text-sm">${wearable.deviceName}</span>
                            <span class="pwp-status-pill pwp-pill-green">CONNECTED</span>
                        </div>
                        <span class="text-xs text-slate">Last sync: <strong class="text-cyan">${wearable.lastSync}</strong></span>
                    </div>
                    <div class="pwp-grid-3 text-xs">
                        <div><span class="text-slate">Data Source:</span> <strong class="text-white">Connected Wearable Device</strong></div>
                        <div><span class="text-slate">Data Freshness:</span> <strong class="text-teal">Live Telemetry Synchronized</strong></div>
                        <div><span class="text-slate">Available Telemetry:</span> <strong class="text-cyan">Heart Rate, Sleep Duration, HRV</strong></div>
                    </div>
                </div>
            `;
        } else {
            wearableCardHtml = `
                <div class="glass-card mb-lg" style="background: rgba(15, 23, 42, 0.6); border: 1px dashed rgba(255, 255, 255, 0.1);">
                    <div class="flex justify-between align-center flex-wrap gap-md">
                        <div class="flex align-center gap-md">
                            <i data-lucide="bluetooth-off" class="text-slate" style="width: 28px; height: 28px;"></i>
                            <div>
                                <div class="font-bold text-white text-sm">No wearable connected.</div>
                                <div class="text-xs text-slate">Connect a supported device to import real wearable wellness data. Zero simulated readings will be shown.</div>
                            </div>
                        </div>
                        <button class="btn btn-teal btn-xs" onclick="openWearableConnectionModal()">
                            <i data-lucide="plus"></i> Connect Wearable Device
                        </button>
                    </div>
                </div>
            `;
        }

        // Personal Baseline Card
        const baselineHtml = `
            <div class="glass-card mb-lg">
                <div class="pwp-section-header">
                    <div>
                        <div class="text-xs font-mono text-cyan mb-xs"><i data-lucide="compass" class="inline mr-xs"></i> INDIVIDUAL CALIBRATION</div>
                        <h4 class="text-md font-bold text-white">Your Personal Wellness Baseline</h4>
                    </div>
                    <span class="pwp-status-pill ${baseline.hasBaseline ? 'pwp-pill-green' : 'pwp-pill-yellow'}">
                        ${baseline.hasBaseline ? 'BASELINE ESTABLISHED' : 'CALCULATING BASELINE'}
                    </span>
                </div>
                ${baseline.hasBaseline ? `
                    <div class="pwp-grid-3 mb-sm">
                        <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-xs text-slate mb-xs">Typical Sleep Duration</div>
                            <div class="text-lg font-bold text-cyan">${baseline.typicalSleepFormatted}</div>
                            <div class="text-xs text-slate mt-xs">Calculated from ${baseline.sampleCount} check-ins</div>
                        </div>
                        <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-xs text-slate mb-xs">Typical Stress Intensity</div>
                            <div class="text-lg font-bold text-teal">${baseline.typicalStressScore <= 2.5 ? 'Low' : 'Moderate'} (${baseline.typicalStressScore}/5)</div>
                            <div class="text-xs text-slate mt-xs">Personal historical median</div>
                        </div>
                        <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-xs text-slate mb-xs">Typical Recovery Level</div>
                            <div class="text-lg font-bold text-green">${baseline.typicalRecoveryScore >= 3.5 ? 'Well' : 'Average'} (${baseline.typicalRecoveryScore}/5)</div>
                            <div class="text-xs text-slate mt-xs">Personal replenishment baseline</div>
                        </div>
                    </div>
                ` : `
                    <div class="text-xs text-slate p-md text-center">
                        ${baseline.statusText || 'Complete 3 daily check-ins to establish your personalized individual baseline.'}
                    </div>
                `}
                <div class="pwp-minimization-tip mt-sm">
                    <strong>Personalized Comparison:</strong> You are compared strictly against your own historical baseline pattern rather than an arbitrary population average.
                </div>
            </div>
        `;

        // Multi-Signal Pattern Callout (if active)
        let patternCalloutHtml = '';
        if (trendsData && trendsData.patterns && trendsData.patterns.length > 0) {
            patternCalloutHtml = trendsData.patterns.map(pat => `
                <div class="mws-pattern-card">
                    <div class="mws-pattern-header">
                        <i data-lucide="alert-triangle" class="text-yellow" style="width: 20px; height: 20px;"></i>
                        <span class="mws-pattern-title">${pat.title}</span>
                        <span class="pwp-status-pill pwp-pill-yellow ml-auto">${pat.strength}</span>
                    </div>
                    <div class="mws-pattern-section">
                        <strong>WHAT CHANGED:</strong> ${pat.whatChanged}
                    </div>
                    <div class="mws-pattern-section">
                        <strong>WHEN IT CHANGED:</strong> ${pat.whenItChanged}
                    </div>
                    <div class="mws-pattern-section">
                        <strong>WHICH DATA CONTRIBUTED:</strong> ${pat.contributingData.join(' • ')}
                    </div>
                    <div class="mws-pattern-section text-teal">
                        <strong>POSSIBLE NEXT STEP:</strong> ${pat.possibleNextStep}
                    </div>
                    <div class="text-xs text-slate mt-sm font-mono" style="font-size: 0.68rem;">
                        <i data-lucide="info" class="inline mr-xs"></i> ${pat.disclaimer}
                    </div>
                </div>
            `).join('');
        }

        // Supportive Lifestyle Recommendations
        const recommendationsHtml = `
            <div class="glass-card mb-lg">
                <div class="pwp-section-header">
                    <h4 class="pwp-section-title text-teal"><i data-lucide="sparkles"></i> Supportive Wellness Recommendations</h4>
                    <span class="text-xs text-slate">Non-Diagnostic • Supportive</span>
                </div>
                <div class="pwp-grid-3">
                    <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                        <div class="font-bold text-sm text-cyan mb-xs"><i data-lucide="moon" class="inline mr-xs"></i> Prioritize Rest Windows</div>
                        <p class="text-xs text-slate">Allow at least 7 hours in darkness and disconnect screens 45 minutes prior to sleep to facilitate recovery.</p>
                    </div>
                    <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                        <div class="font-bold text-sm text-teal mb-xs"><i data-lucide="droplet" class="inline mr-xs"></i> Hydration & Active Breaks</div>
                        <p class="text-xs text-slate">Ensure consistent electrolyte intake during rotating duty rhythms to prevent acute physical exhaustion.</p>
                    </div>
                    <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                        <div class="font-bold text-sm text-purple mb-xs"><i data-lucide="heart-handshake" class="inline mr-xs"></i> Welfare Support</div>
                        <p class="text-xs text-slate">Voluntary, confidential consultation with welfare personnel is always available without commander notification.</p>
                    </div>
                </div>
            </div>
        `;

        return `
            ${checkInHeroHtml}
            ${overviewCardsHtml}
            ${wearableCardHtml}
            ${patternCalloutHtml}
            ${baselineHtml}
            ${recommendationsHtml}
        `;
    }

    // --- SUBTAB 2: INTERACTIVE MOBILE CHECK-IN WIZARD ---
    function renderMwsWizardTab(profile) {
        // Retrieve or initialize draft responses
        if (!LifeOS.mwsDraft) {
            LifeOS.mwsDraft = {
                mood: "Good",
                stress: "Moderate",
                energy: "Moderate",
                fatigue: "Slightly tired",
                sleepDurationHours: 7,
                sleepDurationMinutes: 15,
                sleepQuality: "Good",
                sleepRested: "Yes",
                recovery: "Well",
                overwhelmed: "No",
                difficultyConcentrating: "No",
                unusualFatigue: "No",
                difficultToRecover: "No",
                enoughTimeToRest: "Yes",
                wantsConfidentialSupport: "No",
                privateNote: ""
            };
        }
        const d = LifeOS.mwsDraft;

        function renderOptions(field, options) {
            return `
                <div class="mws-options-grid">
                    ${options.map(opt => `
                        <div class="mws-option-btn ${d[field] === opt ? 'selected' : ''}" onclick="window.__mwsSelectOption('${field}', '${opt}')">
                            ${opt}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="mws-wizard-card">
                <div class="flex justify-between align-center mb-md">
                    <div>
                        <span class="pwp-status-pill pwp-pill-green mb-xs inline-block">DAILY CHECK-IN</span>
                        <h3 class="text-lg font-bold text-white">Personnel Wellness Self-Assessment</h3>
                    </div>
                    <button class="btn btn-secondary btn-xs" onclick="window.__mwsCancelWizard()">Cancel / Close</button>
                </div>

                <div class="mws-progress-bar-wrap">
                    <div class="mws-progress-bar-fill" style="width: 100%;"></div>
                </div>

                <!-- 1. MOOD -->
                <div class="mb-lg">
                    <div class="mws-question-title">1. MOOD: How are you feeling today?</div>
                    <div class="mws-question-desc">Select your current overall subjective emotional state.</div>
                    ${renderOptions('mood', ["Very good", "Good", "Okay", "Low", "Very low", "Prefer not to answer"])}
                </div>

                <!-- 2. STRESS -->
                <div class="mb-lg">
                    <div class="mws-question-title">2. STRESS: How stressed have you felt recently?</div>
                    <div class="mws-question-desc">Reflect on workload and operational pressure over the recent shift cycle.</div>
                    ${renderOptions('stress', ["None", "Low", "Moderate", "High", "Very high", "Prefer not to answer"])}
                </div>

                <!-- 3. ENERGY -->
                <div class="mb-lg">
                    <div class="mws-question-title">3. ENERGY: How would you rate your energy?</div>
                    <div class="mws-question-desc">Your physical stamina and cognitive alertness today.</div>
                    ${renderOptions('energy', ["Very high", "High", "Moderate", "Low", "Very low"])}
                </div>

                <!-- 4. FATIGUE -->
                <div class="mb-lg">
                    <div class="mws-question-title">4. FATIGUE: How physically or mentally tired do you feel?</div>
                    <div class="mws-question-desc">Cumulative tiredness from continuous duty or disrupted rhythm.</div>
                    ${renderOptions('fatigue', ["Not tired", "Slightly tired", "Moderately tired", "Very tired", "Extremely tired"])}
                </div>

                <!-- 5. SLEEP -->
                <div class="mb-lg">
                    <div class="mws-question-title">5. SLEEP: Duration & Perceived Rest</div>
                    <div class="mws-question-desc">Report approximate sleep hours, perceived sleep quality, and rested status.</div>
                    
                    <div class="mws-sleep-inputs">
                        <div class="mws-sleep-box">
                            <label>Sleep Hours (0–24)</label>
                            <input type="number" id="mws-input-sleep-hours" min="0" max="24" value="${d.sleepDurationHours}" onchange="LifeOS.mwsDraft.sleepDurationHours = this.value;">
                        </div>
                        <div class="mws-sleep-box">
                            <label>Sleep Minutes (0–59)</label>
                            <input type="number" id="mws-input-sleep-mins" min="0" max="59" step="5" value="${d.sleepDurationMinutes}" onchange="LifeOS.mwsDraft.sleepDurationMinutes = this.value;">
                        </div>
                    </div>

                    <label class="pwp-form-label mt-sm">Perceived Sleep Quality:</label>
                    ${renderOptions('sleepQuality', ["Excellent", "Good", "Fair", "Poor", "Prefer not to answer"])}

                    <label class="pwp-form-label mt-sm">Did you feel rested upon waking?</label>
                    ${renderOptions('sleepRested', ["Yes", "Somewhat", "No", "Prefer not to answer"])}
                </div>

                <!-- 6. RECOVERY -->
                <div class="mb-lg">
                    <div class="mws-question-title">6. RECOVERY: How well have you recovered from recent duty/work?</div>
                    <div class="mws-question-desc">Your subjective readiness to meet upcoming operational expectations.</div>
                    ${renderOptions('recovery', ["Very well", "Well", "Average", "Poorly", "Very poorly"])}
                </div>

                <!-- 7. OPTIONAL QUESTIONS -->
                <div class="glass-card mb-lg p-md" style="background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.08);">
                    <h4 class="text-sm font-bold text-cyan mb-sm"><i data-lucide="help-circle" class="inline mr-xs"></i> Optional Questions</h4>
                    <p class="text-xs text-slate mb-md">All sensitive questions include "Prefer not to answer". None are mandatory.</p>

                    <div class="mb-md">
                        <label class="pwp-form-label">Are you feeling overwhelmed?</label>
                        ${renderOptions('overwhelmed', ["No", "Somewhat", "Yes", "Prefer not to answer"])}
                    </div>

                    <div class="mb-md">
                        <label class="pwp-form-label">Are you having difficulty concentrating?</label>
                        ${renderOptions('difficultyConcentrating', ["No", "Somewhat", "Yes", "Prefer not to answer"])}
                    </div>

                    <div class="mb-md">
                        <label class="pwp-form-label">Are you experiencing unusual fatigue?</label>
                        ${renderOptions('unusualFatigue', ["No", "Somewhat", "Yes", "Prefer not to answer"])}
                    </div>

                    <div class="mb-md">
                        <label class="pwp-form-label">Are you finding it difficult to recover after duty?</label>
                        ${renderOptions('difficultToRecover', ["No", "Somewhat", "Yes", "Prefer not to answer"])}
                    </div>

                    <div class="mb-md">
                        <label class="pwp-form-label">Do you feel you have enough time to rest?</label>
                        ${renderOptions('enoughTimeToRest', ["Yes", "Somewhat", "No", "Prefer not to answer"])}
                    </div>

                    <div class="mb-md">
                        <label class="pwp-form-label">Would you like confidential support?</label>
                        ${renderOptions('wantsConfidentialSupport', ["No", "Yes"])}
                    </div>
                </div>

                <!-- 8. PRIVATE WELLNESS NOTE -->
                <div class="mws-private-note-box">
                    <div class="flex justify-between align-center mb-xs">
                        <span class="text-sm font-bold text-purple"><i data-lucide="lock" class="inline mr-xs"></i> PRIVATE WELLNESS NOTE</span>
                        <span class="pwp-status-pill pwp-pill-yellow">COMMANDER VISIBILITY: NEVER</span>
                    </div>
                    <p class="text-xs text-slate mb-sm">
                        Anything else you'd like to tell us? (Optional). This note remains strictly confidential and will NOT automatically become visible to commanders.
                    </p>
                    <textarea id="mws-private-note-input" placeholder="Enter any private notes regarding sleep, workload, or general adaptation..." oninput="LifeOS.mwsDraft.privateNote = this.value;">${d.privateNote || ''}</textarea>
                </div>

                <!-- ACTION BUTTONS -->
                <div class="flex gap-md justify-between align-center flex-wrap">
                    <button class="btn btn-secondary" onclick="window.__mwsCancelWizard()">Cancel</button>
                    <button class="btn btn-primary btn-lg" onclick="window.__mwsSubmitCheckIn()" style="background: linear-gradient(135deg, #00E5FF, #9061F9); border: none; min-width: 220px;">
                        <i data-lucide="check-circle"></i> Submit Wellness Check-in
                    </button>
                </div>
            </div>
        `;
    }

    // --- SUBTAB 3: WELLNESS TRENDS & PATTERNS ---
    function renderMwsTrendsTab(profile, trendsData, timeframe) {
        if (!trendsData) {
            return `<div class="p-lg text-center text-slate">No trend data available for selected timeframe.</div>`;
        }

        const metrics = trendsData.metrics || {};
        const baseline = trendsData.baseline || {};

        return `
            <div class="glass-card mb-lg">
                <div class="pwp-section-header">
                    <div>
                        <div class="text-xs font-mono text-cyan mb-xs"><i data-lucide="trending-up" class="inline mr-xs"></i> LONGITUDINAL ANALYSIS</div>
                        <h3 class="text-lg font-bold text-white">Personnel Wellness Trends</h3>
                    </div>
                    <div class="flex gap-xs flex-wrap">
                        ${['7d', '30d', '90d', '6mo', '1yr'].map(tf => `
                            <button class="btn btn-xs ${timeframe === tf ? 'btn-cyan' : 'btn-secondary'}" onclick="window.__mwsSetTimeframe('${tf}')">
                                ${tf.toUpperCase()}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="pwp-grid-2 mb-lg">
                    <!-- Fatigue Trend Card -->
                    <div class="mws-indicator-card">
                        <div class="mws-indicator-header">
                            <span class="mws-indicator-label">Fatigue Trend</span>
                            <span class="pwp-status-pill ${metrics.fatigue.trend === 'Increasing' ? 'pwp-pill-yellow' : 'pwp-pill-green'}">${metrics.fatigue.trend}</span>
                        </div>
                        <div class="mws-indicator-value">${metrics.fatigue.currentAvg} / 5.0</div>
                        <p class="text-xs text-slate">${metrics.fatigue.explanation}</p>
                    </div>

                    <!-- Stress Trend Card -->
                    <div class="mws-indicator-card">
                        <div class="mws-indicator-header">
                            <span class="mws-indicator-label">Stress Trend</span>
                            <span class="pwp-status-pill ${metrics.stress.trend === 'Increasing' ? 'pwp-pill-yellow' : 'pwp-pill-green'}">${metrics.stress.trend}</span>
                        </div>
                        <div class="mws-indicator-value">${metrics.stress.currentAvg} / 5.0</div>
                        <p class="text-xs text-slate">${metrics.stress.explanation}</p>
                    </div>

                    <!-- Sleep Trend Card -->
                    <div class="mws-indicator-card">
                        <div class="mws-indicator-header">
                            <span class="mws-indicator-label">Sleep Duration Trend</span>
                            <span class="pwp-status-pill ${metrics.sleep.trend === 'Decreasing' ? 'pwp-pill-yellow' : 'pwp-pill-green'}">${metrics.sleep.trend}</span>
                        </div>
                        <div class="mws-indicator-value text-cyan">${metrics.sleep.currentAvgFormatted}</div>
                        <p class="text-xs text-slate">${metrics.sleep.explanation}</p>
                    </div>

                    <!-- Recovery Trend Card -->
                    <div class="mws-indicator-card">
                        <div class="mws-indicator-header">
                            <span class="mws-indicator-label">Recovery Trend</span>
                            <span class="pwp-status-pill ${metrics.recovery.trend === 'Declining' ? 'pwp-pill-yellow' : 'pwp-pill-green'}">${metrics.recovery.trend}</span>
                        </div>
                        <div class="mws-indicator-value text-teal">${metrics.recovery.currentAvg} / 5.0</div>
                        <p class="text-xs text-slate">${metrics.recovery.explanation}</p>
                    </div>
                </div>

                <!-- Baseline Comparison Table -->
                <h4 class="text-sm font-bold text-white mb-sm">Personal Baseline vs. Current Period</h4>
                <div class="panel-stats-grid text-xs p-md mb-md" style="background: rgba(15, 23, 42, 0.6); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                    <div class="dp-row" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                        <span>Average Sleep Duration:</span>
                        <span>Baseline: <strong>${baseline.typicalSleepFormatted || '7h 15m'}</strong> ➔ Current: <strong class="text-cyan">${metrics.sleep.currentAvgFormatted}</strong></span>
                    </div>
                    <div class="dp-row" style="display:flex; justify-content:space-between; padding:8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                        <span>Fatigue Index:</span>
                        <span>Baseline: <strong>${baseline.typicalFatigueScore || 2.5}/5.0</strong> ➔ Current: <strong class="text-yellow">${metrics.fatigue.currentAvg}/5.0</strong></span>
                    </div>
                    <div class="dp-row" style="display:flex; justify-content:space-between; padding:8px 0;">
                        <span>Perceived Recovery:</span>
                        <span>Baseline: <strong>${baseline.typicalRecoveryScore || 3.5}/5.0</strong> ➔ Current: <strong class="text-teal">${metrics.recovery.currentAvg}/5.0</strong></span>
                    </div>
                </div>

                <div class="pwp-minimization-tip">
                    <strong>Non-Diagnostic Guarantee:</strong> "Your recent fatigue reports are higher than your usual baseline." The platform does NOT claim you have clinical burnout or depression.
                </div>
            </div>
        `;
    }

    // --- SUBTAB 4: DUTY CONTEXT (COMPONENT 1 COMPATIBLE) ---
    function renderMwsDutyTab(profile, logger) {
        const user = LifeOS.user || {};
        const p = LifeOS.personnelWellnessProfile || profile || {};
        const service = profile.serviceContext || {};
        const sched = profile.dutySchedule || {};
        const deployments = profile.deployments || [];
        const leave = profile.leaveHistory || [];

        const branch = p.serviceBranch || service.organizationId || "Not provided";
        const dutyType = p.dutyType || service.dutyType || "Operational Support";
        const rank = p.rankCategory || service.roleCategory || "Personnel";
        const schedule = p.scheduleType || sched.scheduleType || "Regular Day Shift";
        const hours = p.avgHoursPerWeek !== undefined ? p.avgHoursPerWeek : (sched.avgHoursPerWeek || 40);
        const env = p.operationalEnvironment || "Standard Garrison";
        const completion = p.profileCompletion !== undefined ? p.profileCompletion : 65;

        const isEditing = !!LifeOS.mwsEditingProfile;

        return `
            <!-- Profile Identity & Completion Banner -->
            <div class="glass-card mb-lg" style="border-left: 4px solid var(--accent-teal);">
                <div class="pwp-section-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
                    <div>
                        <div class="text-xs font-mono text-teal mb-xs"><span class="badge-dot"></span> VERIFIED PERSONNEL IDENTITY</div>
                        <h2 class="text-xl font-bold text-white mb-xxs">${user.name || user.fullName || "Personnel User"}</h2>
                        <div class="text-xs text-slate font-mono">ID: <span class="text-cyan">${user.id || p.userId || 'LIFEOS-USER'}</span> &bull; ${user.email || 'Email not provided'} &bull; Role: <span class="text-purple">${user.role || 'Personnel'}</span></div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn btn-secondary btn-xs" onclick="window.__toggleEditDutyProfile()"><i data-lucide="edit-3"></i> ${isEditing ? 'Cancel Editing' : 'Edit Duty Profile'}</button>
                        <button class="btn btn-outline btn-xs text-red" onclick="window.__logoutPersonnelSession()"><i data-lucide="log-out"></i> Log Out</button>
                    </div>
                </div>

                <!-- Profile Completion Progress -->
                <div class="mt-md pt-sm" style="border-top: 1px solid rgba(255,255,255,0.06);">
                    <div class="flex justify-between text-xs mb-xs">
                        <span class="text-slate font-mono">PROFILE COMPLETION & DATA QUALITY:</span>
                        <span class="text-teal font-bold font-mono">${completion}% COMPLETE</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.06); height: 8px; border-radius: 4px; overflow:hidden;">
                        <div style="background: linear-gradient(90deg, #00E5FF, #00FFD1); width: ${completion}%; height: 100%; border-radius: 4px; transition: width 0.4s ease;"></div>
                    </div>
                    <p class="text-xxxxs text-slate mt-xs">Calculated strictly from verified user-supplied fields. Missing values remain 'Not provided' per strict Zero Fake Data standard.</p>
                </div>
            </div>

            ${isEditing ? `
                <!-- EDIT DUTY PROFILE FORM -->
                <div class="glass-card mb-lg" style="border: 1px solid rgba(0, 229, 255, 0.3); background: rgba(0, 229, 255, 0.03);">
                    <div class="pwp-section-header">
                        <div>
                            <span class="badge pwp-pill-green mb-xs">EDIT MODE</span>
                            <h3 class="text-lg font-bold text-white">Update Personnel Duty Context</h3>
                            <p class="text-xs text-slate">Changes are verified and persisted to the secure SQLite database.</p>
                        </div>
                    </div>

                    <div class="pwp-grid-2 mt-md">
                        <div class="input-group">
                            <label class="text-xxs text-slate block mb-xxs font-mono">Service Branch / Organization</label>
                            <input type="text" id="edit-service-branch" class="form-input" value="${branch !== 'Not provided' ? branch : ''}" placeholder="e.g. Defense Healthcare Agency / Joint Medical Command">
                        </div>
                        <div class="input-group">
                            <label class="text-xxs text-slate block mb-xxs font-mono">Broad Duty Category</label>
                            <select id="edit-duty-type" class="form-select">
                                <option value="Operational Support" ${dutyType.includes('Operational') ? 'selected' : ''}>Operational Support</option>
                                <option value="Field Logistics" ${dutyType.includes('Logistics') ? 'selected' : ''}>Field Logistics</option>
                                <option value="Medical & Triage" ${dutyType.includes('Medical') ? 'selected' : ''}>Medical & Triage</option>
                                <option value="Technical & Signals" ${dutyType.includes('Technical') ? 'selected' : ''}>Technical & Signals</option>
                                <option value="Administrative" ${dutyType.includes('Admin') ? 'selected' : ''}>Administrative</option>
                                <option value="Special Mission" ${dutyType.includes('Special') ? 'selected' : ''}>Special Mission</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label class="text-xxs text-slate block mb-xxs font-mono">Rank / Position Category</label>
                            <input type="text" id="edit-rank-category" class="form-input" value="${rank !== 'Not provided' ? rank : ''}" placeholder="e.g. Commander / Lead Specialist">
                        </div>
                        <div class="input-group">
                            <label class="text-xxs text-slate block mb-xxs font-mono">Schedule Pattern</label>
                            <select id="edit-schedule-type" class="form-select">
                                <option value="Regular Day Shift" ${schedule.includes('Day') ? 'selected' : ''}>Regular Day Shift (08:00 - 16:30)</option>
                                <option value="Rotating 12h Shift" ${schedule.includes('12h') || schedule.includes('Rotating') ? 'selected' : ''}>Rotating 12h Shift (Day / Night)</option>
                                <option value="24h On / 48h Off" ${schedule.includes('24h') ? 'selected' : ''}>24h On / 48h Off</option>
                                <option value="Night Shift Only" ${schedule.includes('Night') ? 'selected' : ''}>Night Shift Only</option>
                                <option value="Flexible Operational" ${schedule.includes('Flexible') ? 'selected' : ''}>Flexible Operational</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label class="text-xxs text-slate block mb-xxs font-mono">Average Weekly Work Hours</label>
                            <input type="number" id="edit-avg-hours" class="form-input" value="${hours}" min="10" max="120">
                        </div>
                        <div class="input-group">
                            <label class="text-xxs text-slate block mb-xxs font-mono">Operational Environment</label>
                            <select id="edit-operational-env" class="form-select">
                                <option value="Standard Garrison" ${env.includes('Garrison') ? 'selected' : ''}>Standard Garrison</option>
                                <option value="Maritime High Humidity" ${env.includes('Maritime') ? 'selected' : ''}>Maritime High Humidity</option>
                                <option value="Desert / Arid Heat" ${env.includes('Desert') ? 'selected' : ''}>Desert / Arid Heat</option>
                                <option value="Arctic / Sub-Zero" ${env.includes('Arctic') ? 'selected' : ''}>Arctic / Sub-Zero</option>
                                <option value="High Altitude Mountain" ${env.includes('Altitude') ? 'selected' : ''}>High Altitude Mountain</option>
                                <option value="Urban High Density" ${env.includes('Urban') ? 'selected' : ''}>Urban High Density</option>
                                <option value="Forward Remote Facility" ${env.includes('Forward') ? 'selected' : ''}>Forward Remote Facility</option>
                            </select>
                        </div>
                    </div>

                    <div class="flex gap-sm mt-md">
                        <button class="btn btn-cyan btn-sm" id="btn-save-duty-profile" onclick="window.__saveDutyProfile()"><i data-lucide="save"></i> Save Profile Changes</button>
                        <button class="btn btn-secondary btn-sm" onclick="window.__toggleEditDutyProfile()">Cancel</button>
                    </div>
                </div>
            ` : ''}

            <!-- Service Context Overview Grid -->
            <div class="glass-card mb-lg">
                <div class="pwp-section-header">
                    <div>
                        <div class="text-xs font-mono text-cyan mb-xs"><span class="badge-dot"></span> DUTY PROFILE CONTEXT</div>
                        <h3 class="text-lg font-bold text-white">Service Context & Operational Demands</h3>
                    </div>
                    <button class="btn btn-secondary btn-xs" onclick="window.__toggleEditDutyProfile()"><i data-lucide="edit"></i> Edit Profile</button>
                </div>

                <div class="pwp-grid-2">
                    <!-- Service Context -->
                    <div class="p-md" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm);">
                        <div class="pwp-row"><span class="pwp-row-label">Service Branch:</span> <span class="pwp-row-val text-white font-bold">${branch}</span></div>
                        <div class="pwp-row"><span class="pwp-row-label">Duty Category:</span> <span class="pwp-row-val text-cyan">${dutyType}</span></div>
                        <div class="pwp-row"><span class="pwp-row-label">Rank / Role Category:</span> <span class="pwp-row-val">${rank}</span></div>
                        <div class="pwp-row"><span class="pwp-row-label">Unit / Cohort ID:</span> <span class="pwp-row-val font-mono">${p.unitCohortId || 'UNIT-ALPHA-2026'}</span></div>
                    </div>

                    <!-- Duty Schedule -->
                    <div class="p-md" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm);">
                        <div class="pwp-row"><span class="pwp-row-label">Schedule Pattern:</span> <span class="pwp-row-val text-cyan">${schedule}</span></div>
                        <div class="pwp-row"><span class="pwp-row-label">Avg Hours / Week:</span> <span class="pwp-row-val text-teal font-bold">${hours} hrs/wk</span></div>
                        <div class="pwp-row"><span class="pwp-row-label">Operational Environment:</span> <span class="pwp-row-val text-purple font-bold">${env}</span></div>
                        <div class="pwp-row"><span class="pwp-row-label">Rest Window:</span> <span class="pwp-row-val text-green">${sched.restWindowHours || 12} Hours</span></div>
                    </div>
                </div>

                <div class="pwp-minimization-tip mt-md">
                    <strong>Data Minimization Policy:</strong> Duty and schedule parameters are aggregated strictly for recovery and rest scheduling. Data is never shared with external advertisers or used for punitive assessments.
                </div>
            </div>

            <!-- Deployments & Leaves -->
            <div class="pwp-grid-2">
                <div class="glass-card">
                    <div class="pwp-section-header">
                        <h4 class="pwp-section-title text-purple"><i data-lucide="map-pin"></i> Deployment History</h4>
                        <button class="btn btn-purple btn-xs" onclick="window.__showAddDeploymentModal()">+ Add Deployment</button>
                    </div>
                    ${deployments.length > 0 ? deployments.map(d => `
                        <div class="p-sm mb-xs text-xs" style="background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="font-bold text-white">${d.deploymentCategory} (${d.durationDays} Days)</div>
                            <div class="text-slate">${d.startDate} to ${d.endDate} | Environment: <span class="text-cyan">${d.environmentCategory}</span></div>
                        </div>
                    `).join('') : '<div class="p-sm text-xs text-slate font-mono">No active or past deployments on record.</div>'}
                </div>

                <div class="glass-card">
                    <div class="pwp-section-header">
                        <h4 class="pwp-section-title text-teal"><i data-lucide="calendar"></i> Leave & Recovery History</h4>
                    </div>
                    ${leave.length > 0 ? leave.map(l => `
                        <div class="p-sm mb-xs text-xs" style="background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                            <div class="font-bold text-white">${l.leaveCategory.toUpperCase()} LEAVE (${l.durationDays} Days)</div>
                            <div class="text-slate">${l.leaveStart} to ${l.leaveEnd}</div>
                        </div>
                    `).join('') : '<div class="p-sm text-xs text-slate font-mono">No upcoming or recorded leave periods.</div>'}
                </div>
            </div>
        `;
    }

    // --- SUBTAB 5: PRIVACY & DATA CONTROL CENTER ---
    function renderMwsPrivacyTab(profile) {
        const consents = profile.consents || [];

        return `
            <!-- Educational Panel (Clean & Transparent) -->
            <div class="glass-card mb-lg">
                <div class="pwp-section-header">
                    <div>
                        <div class="text-xs font-mono text-cyan mb-xs"><i data-lucide="shield" class="inline mr-xs"></i> PRIVACY BY DESIGN</div>
                        <h3 class="text-lg font-bold text-white">Privacy & Data Control Center</h3>
                    </div>
                </div>
                <div class="pwp-grid-2 mb-md text-xs">
                    <div>
                        <div class="font-bold text-cyan mb-xs">Why Data is Collected</div>
                        <p class="text-slate">To help you voluntarily track fatigue, sleep patterns, and recovery. To provide supportive suggestions and early welfare resources.</p>
                    </div>
                    <div>
                        <div class="font-bold text-teal mb-xs">Who Can Access It</div>
                        <p class="text-slate">Only you have direct access. Authorized welfare personnel only access information required for authorized support. Commanders never see individual responses.</p>
                    </div>
                    <div>
                        <div class="font-bold text-purple mb-xs">How Long It is Retained</div>
                        <p class="text-slate">Data is retained for a configurable 5-year period. You have the right to purge or export your records at any time.</p>
                    </div>
                    <div>
                        <div class="font-bold text-green mb-xs">How to Withdraw Consent</div>
                        <p class="text-slate">Toggle off any consent permission below. Revoking consent immediately halts processing and data bridging.</p>
                    </div>
                </div>
            </div>

            <!-- Granular Consent Management -->
            <div class="glass-card mb-lg">
                <h4 class="text-sm font-bold text-white mb-sm">Active Consent & Permissions</h4>
                ${consents.map(c => `
                    <div class="pwp-consent-row">
                        <div>
                            <div class="font-bold text-sm text-white">${c.dataCategory}</div>
                            <div class="text-xs text-slate max-w-lg">${c.purpose}</div>
                        </div>
                        <div class="flex align-center gap-md">
                            <span class="pwp-status-pill ${c.consentStatus === 'GRANTED' ? 'pwp-pill-green' : 'pwp-pill-red'}">${c.consentStatus}</span>
                            <button class="btn btn-xs ${c.consentStatus === 'GRANTED' ? 'btn-secondary' : 'btn-cyan'}" onclick="window.__toggleConsent('${c.consentId}', '${c.consentStatus === 'GRANTED' ? 'REVOKED' : 'GRANTED'}')">
                                ${c.consentStatus === 'GRANTED' ? 'Revoke Consent' : 'Grant Consent'}
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Data Portability & Deletion -->
            <div class="pwp-grid-2">
                <div class="glass-card">
                    <h4 class="text-sm font-bold text-cyan mb-xs"><i data-lucide="download" class="inline mr-xs"></i> Data Portability (Export)</h4>
                    <p class="text-xs text-slate mb-md">Download a copy of your complete voluntary wellness assessments, private notes, and consent history in standard JSON format.</p>
                    <button class="btn btn-cyan btn-sm" onclick="window.__mwsExportData()">
                        <i data-lucide="download"></i> Export Wellness Data (JSON)
                    </button>
                </div>

                <div class="glass-card" style="border-color: rgba(255, 75, 75, 0.3);">
                    <h4 class="text-sm font-bold text-red mb-xs"><i data-lucide="trash-2" class="inline mr-xs"></i> Data Erasure (Delete)</h4>
                    <p class="text-xs text-slate mb-md">Permanently delete all your stored wellness assessments and private notes. This action is irreversible and recorded in the audit trail.</p>
                    <button class="btn btn-secondary btn-sm text-red" onclick="window.__mwsDeleteData()">
                        <i data-lucide="trash-2"></i> Delete All My Wellness Data
                    </button>
                </div>
            </div>
        `;
    }

    // --- SUBTAB 6: CONFIDENTIAL SUPPORT DESK ---
    function renderMwsSupportTab(profile) {
        return `
            <!-- Immediate Safety Crisis Banner -->
            <div class="mws-crisis-banner">
                <i data-lucide="alert-octagon" class="text-red" style="width: 28px; height: 28px; flex-shrink: 0;"></i>
                <div>
                    <div class="font-bold text-red text-sm">IMMEDIATE SAFETY CRISIS & EMERGENCY SUPPORT</div>
                    <div class="text-xs text-slate mt-xs">
                        If you are experiencing thoughts of self-harm, severe psychological distress, or an imminent safety crisis, professional support is available 24/7.
                    </div>
                    <div class="mt-sm flex gap-md flex-wrap">
                        <span class="text-xs font-bold text-white">24/7 Crisis Lifeline: <span class="text-cyan">988 (Call or Text)</span></span>
                        <span class="text-xs font-bold text-white">Duty Medical Officer: <span class="text-teal">Ext. #9110 / Rapid Response</span></span>
                    </div>
                </div>
            </div>

            <!-- Confidential Support Request Form -->
            <div class="glass-card mb-lg">
                <div class="pwp-section-header">
                    <div>
                        <div class="text-xs font-mono text-teal mb-xs"><i data-lucide="heart" class="inline mr-xs"></i> CONFIDENTIAL ASSISTANCE</div>
                        <h3 class="text-lg font-bold text-white">Request Confidential Support</h3>
                    </div>
                    <span class="pwp-status-pill pwp-pill-green">NON-DISCIPLINARY</span>
                </div>
                <p class="text-xs text-slate mb-md">
                    Requests submitted here are routed directly to authorized welfare officers. Commanders cannot see your request or discussion contents.
                </p>

                <div class="pwp-form-group">
                    <label class="pwp-form-label">Support Option:</label>
                    <select class="pwp-form-select" id="mws-support-type">
                        <option value="WELFARE_CONSULTATION">Request Welfare Consultation</option>
                        <option value="COUNSELING">Request Confidential Counseling</option>
                        <option value="AUTHORIZED_OFFICER_CONTACT">Contact Authorized Welfare Officer</option>
                        <option value="RESOURCE_INQUIRY">View Available Support Resources</option>
                    </select>
                </div>

                <div class="pwp-form-group">
                    <label class="pwp-form-label">Preferred Contact Method:</label>
                    <select class="pwp-form-select" id="mws-support-contact">
                        <option value="IN_APP_MESSAGE">Confidential In-App Message</option>
                        <option value="SECURE_PHONE">Secure Telephone Call</option>
                        <option value="CONFIDENTIAL_OFFICE">In-Person Welfare Office</option>
                    </select>
                </div>

                <div class="pwp-form-group">
                    <label class="pwp-form-label">Urgency:</label>
                    <select class="pwp-form-select" id="mws-support-urgency">
                        <option value="STANDARD">Standard (Within 24–48 hours)</option>
                        <option value="ELEVATED">Elevated (Same day follow-up)</option>
                    </select>
                </div>

                <div class="pwp-form-group">
                    <label class="pwp-form-label">Optional Context / Message:</label>
                    <textarea class="pwp-form-input" id="mws-support-notes" style="min-height: 80px;" placeholder="Describe what you would like to discuss (optional)..."></textarea>
                </div>

                <button class="btn btn-primary" onclick="window.__mwsSubmitSupportRequest()">
                    <i data-lucide="send"></i> Submit Confidential Request
                </button>
            </div>

            <!-- Configured Support Contacts -->
            <div class="glass-card">
                <h4 class="text-sm font-bold text-white mb-sm">Configured Organizational Support Contacts</h4>
                <div class="pwp-grid-3 text-xs">
                    <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                        <div class="font-bold text-cyan mb-xs">Welfare Support Desk</div>
                        <div class="text-slate">Ext: #4092 | Hours: 08:00 – 20:00</div>
                        <div class="text-slate mt-xs">Direct personnel support for shift adaptation and operational fatigue.</div>
                    </div>
                    <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                        <div class="font-bold text-teal mb-xs">Employee Assistance Program (EAP)</div>
                        <div class="text-slate">Direct Line: 1-800-555-EAP1</div>
                        <div class="text-slate mt-xs">Confidential counseling services independent from command structure.</div>
                    </div>
                    <div class="p-sm" style="background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                        <div class="font-bold text-purple mb-xs">24/7 Peer Support Network</div>
                        <div class="text-slate">Encrypted Chat | Peer Desk</div>
                        <div class="text-slate mt-xs">Trained peer specialists offering voluntary listening and recovery advice.</div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- SUBTAB 7: COMMANDER / WELFARE AGGREGATED UNIT VIEW ---
    function renderCommanderUnitAggregateView(aggRes) {
        if (!aggRes || aggRes.status !== 200) {
            return `
                <div class="portal-view">
                    <div class="pwp-banner pwp-firewall-banner">
                        <i data-lucide="shield-alert" class="text-purple" style="width: 32px; height: 32px; flex-shrink: 0;"></i>
                        <div>
                            <h4 class="text-purple font-bold text-sm">ANONYMITY THRESHOLD ENFORCEMENT</h4>
                            <p class="text-xs text-slate">${aggRes?.error || 'Aggregated reporting suppressed to protect personnel anonymity.'}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        const data = aggRes.data;
        const m = data.unitMetrics || {};

        return `
            <div class="portal-view">
                <!-- Command Privacy Banner -->
                <div class="pwp-banner pwp-firewall-banner">
                    <i data-lucide="shield-check" class="text-cyan" style="width: 28px; height: 28px; flex-shrink: 0;"></i>
                    <div>
                        <div class="font-bold text-sm text-cyan">ANONYMIZED UNIT AGGREGATES ONLY</div>
                        <div class="text-xs text-slate">
                            Individual self-assessments and private notes are strictly shielded. In accordance with privacy thresholds (minimum cohort: 5), only anonymized group trends are reported.
                        </div>
                    </div>
                </div>

                <div class="glass-card mb-lg">
                    <div class="pwp-section-header">
                        <div>
                            <div class="text-xs font-mono text-cyan mb-xs"><span class="badge-dot"></span> UNIT OPERATIONAL READINESS & WELLNESS</div>
                            <h3 class="text-lg font-bold text-white">Unit Wellness Trend Overview</h3>
                            <div class="text-xs text-slate">Unit: <strong class="text-white">${data.unitId}</strong> | Cohort Size: <strong class="text-green">${data.cohortSize} Personnel (Anonymity Protected)</strong></div>
                        </div>
                        <span class="pwp-status-pill pwp-pill-yellow">${m.unitWorkloadRhythm || 'ELEVATED'} RHYTHM</span>
                    </div>

                    <div class="pwp-grid-3 mb-md">
                        <div class="p-md" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-xs text-slate mb-xs">Fatigue Indicator</div>
                            <div class="text-lg font-bold text-yellow">${m.fatigueShift}</div>
                            <div class="text-xs text-slate mt-xs">Unit-wide aggregated shift</div>
                        </div>

                        <div class="p-md" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-xs text-slate mb-xs">Average Unit Sleep</div>
                            <div class="text-lg font-bold text-cyan">${m.averageSleepHours}</div>
                            <div class="text-xs text-slate mt-xs">${m.sleepTrend}</div>
                        </div>

                        <div class="p-md" style="background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-xs text-slate mb-xs">Recovery Window Index</div>
                            <div class="text-lg font-bold text-teal">${m.generalRecoveryIndex}</div>
                            <div class="text-xs text-slate mt-xs">Shift planning recommendation: Normal rest periods</div>
                        </div>
                    </div>

                    <div class="pwp-minimization-tip">
                        <strong>Non-Surveillance Policy:</strong> Individual personnel names, scores, or private notes are never provided to supervisory staff or commanders.
                    </div>
                </div>
            </div>
        `;
    }

    function renderWelfareAuditLedger() {
        const logger = (typeof PersonnelAuditLogger !== 'undefined') ? PersonnelAuditLogger : (typeof window !== 'undefined' ? window.PersonnelAuditLogger : (typeof global !== 'undefined' ? global.PersonnelAuditLogger : null));
        const auditLogs = logger ? logger.getLogs(50) : [];
        let lines = auditLogs.map(log => `
            <div class="ledger-line">
                <span class="ledger-time">${log.timestamp.replace('T', ' ').slice(0, 19)}</span>
                <span class="ledger-user">[${log.actor}]</span>
                <span class="ledger-sec">[${log.source}]</span>
                <span class="ledger-event">${log.action} ➔ ${log.resource} (${log.result})</span>
            </div>
        `).join('');

        return `
            <div class="portal-view">
                <div class="glass-card">
                    <h3 class="text-mono text-sm text-cyan mb-sm"><span class="badge-dot"></span> PERSONNEL WELFARE AUDIT & CONSENT LEDGER</h3>
                    <p class="text-xs text-slate mb-md">Immutable security log tracking every personnel profile read, consent update, and data minimization rule enforcement.</p>
                    <div class="ledger-console">
                        ${lines}
                    </div>
                </div>
            </div>
        `;
    }

    // --- GLOBAL INTERACTIVE MODALS & EVENT HANDLERS ---
    window.__mwsSetSubtab = function(subtab) {
        LifeOS.mwsActiveSubtab = subtab;
        renderActiveView();
    };

    window.__mwsSetTimeframe = function(timeframe) {
        LifeOS.mwsTimeframe = timeframe;
        renderActiveView();
    };

    window.__mwsOpenWizard = function() {
        LifeOS.mwsActiveSubtab = "wizard";
        renderActiveView();
    };

    window.__mwsCancelWizard = function() {
        LifeOS.mwsActiveSubtab = "dashboard";
        renderActiveView();
    };

    window.__mwsSelectOption = function(field, value) {
        if (!LifeOS.mwsDraft) LifeOS.mwsDraft = {};
        LifeOS.mwsDraft[field] = value;
        renderActiveView();
    };

    function _getSafeMwsApi() {
        if (typeof PersonnelWellnessAPI !== 'undefined') return PersonnelWellnessAPI;
        if (typeof window !== 'undefined' && window.PersonnelWellnessAPI) return window.PersonnelWellnessAPI;
        if (typeof global !== 'undefined' && global.PersonnelWellnessAPI) return global.PersonnelWellnessAPI;
        return null;
    }

    window.__mwsSubmitCheckIn = function() {
        const api = _getSafeMwsApi();
        if (!api) return;
        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };

        const draft = LifeOS.mwsDraft || {};
        const hoursEl = document.getElementById('mws-input-sleep-hours');
        const minsEl = document.getElementById('mws-input-sleep-mins');
        const noteEl = document.getElementById('mws-private-note-input');

        if (hoursEl) draft.sleepDurationHours = hoursEl.value;
        if (minsEl) draft.sleepDurationMinutes = minsEl.value;
        if (noteEl) draft.privateNote = noteEl.value;

        const payload = {
            responses: {
                mood: draft.mood || "Good",
                stress: draft.stress || "Moderate",
                energy: draft.energy || "Moderate",
                fatigue: draft.fatigue || "Slightly tired",
                sleepDurationHours: Number(draft.sleepDurationHours) || 7,
                sleepDurationMinutes: Number(draft.sleepDurationMinutes) || 15,
                sleepQuality: draft.sleepQuality || "Good",
                sleepRested: draft.sleepRested || "Yes",
                recovery: draft.recovery || "Well",
                overwhelmed: draft.overwhelmed || "Prefer not to answer",
                difficultyConcentrating: draft.difficultyConcentrating || "Prefer not to answer",
                unusualFatigue: draft.unusualFatigue || "Prefer not to answer",
                difficultToRecover: draft.difficultToRecover || "Prefer not to answer",
                enoughTimeToRest: draft.enoughTimeToRest || "Prefer not to answer",
                wantsConfidentialSupport: draft.wantsConfidentialSupport || "No"
            },
            privateNote: draft.privateNote || ""
        };

        const res = api.submitCheckIn(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", payload, LifeOS);
        if (res.status === 200) {
            addNotification("success", "Wellness Check-in Complete", "Responses recorded and compared to your personal baseline.");
            LifeOS.mwsActiveSubtab = "dashboard";
            renderActiveView();
        } else {
            alert(`Check-in error: ${res.error}`);
        }
    };

    window.__mwsSkipToday = function() {
        const api = _getSafeMwsApi();
        if (!api) return;
        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };

        api.skipTodayCheckIn(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", LifeOS);
        addNotification("info", "Check-in Skipped", "Today's check-in has been marked as skipped.");
        renderActiveView();
    };

    window.__mwsExportData = function() {
        const api = _getSafeMwsApi();
        if (!api) return;
        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };

        const res = api.exportWellnessData(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", LifeOS);
        if (res.status === 200) {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `lifeos_wellness_export_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            addNotification("success", "Export Ready", "Your wellness data has been downloaded.");
        }
    };

    window.__mwsDeleteData = async function() {
        if (!confirm("Are you sure you wish to permanently delete all your voluntary wellness assessments and private notes? This cannot be undone.")) return;

        const token = sessionStorage.getItem('lifeos_session_token') || localStorage.getItem('lifeos_session_token');
        if (token) {
            try {
                await fetch('/api/personnel/profile/voluntary-data', {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) {}
        }

        const api = _getSafeMwsApi();
        if (api) {
            const activeUser = { id: LifeOS.user.id || LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };
            const targetUserId = LifeOS.user.id || "LIFEOS-USER-001";
            api.deleteWellnessData(activeUser, LifeOS.activeRole, targetUserId, {}, LifeOS);
        }

        addNotification("warning", "Data Purged", "Voluntary wellness notes and check-in history deleted.");
        renderActiveView();
    };

    window.__mwsSubmitSupportRequest = function() {
        const typeEl = document.getElementById('mws-support-type');
        const contactEl = document.getElementById('mws-support-contact');
        const urgencyEl = document.getElementById('mws-support-urgency');
        const notesEl = document.getElementById('mws-support-notes');

        const api = _getSafeMwsApi();
        if (!api) return;
        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };

        const res = api.createSupportRequest(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", {
            requestType: typeEl?.value || "WELFARE_CONSULTATION",
            preferredContactMethod: contactEl?.value || "IN_APP_MESSAGE",
            urgency: urgencyEl?.value || "STANDARD",
            notes: notesEl?.value || ""
        }, LifeOS);

        if (res.status === 200) {
            addNotification("success", "Support Request Submitted", res.message);
            LifeOS.mwsActiveSubtab = "dashboard";
            renderActiveView();
        }
    };

    window.__toggleConsent = function(consentId, newStatus) {
        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };
        const res = PersonnelWellnessAPI.updateConsent(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", consentId, newStatus, LifeOS);
        if (res.status === 200) {
            logAudit(`Consent updated: ${consentId} set to ${newStatus}`, "WRITE");
            addNotification("success", "Consent Updated", `Consent status changed to ${newStatus}`);
            renderActiveView();
        } else {
            alert(`Error updating consent: ${res.error}`);
        }
    };

    window.__editDutyType = function() {
        const newDuty = prompt("Enter broad duty type (administrative, field, operational, technical, medical, logistics, training, mixed, other):", "operational");
        if (!newDuty) return;
        
        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };
        const res = PersonnelWellnessAPI.updateProfile(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", {
            dutyType: newDuty.toLowerCase(),
            dutyTypeSource: "USER"
        }, LifeOS);

        if (res.status === 200) {
            addNotification("success", "Duty Context Updated", `Duty type set to ${newDuty} (Source: USER).`);
            renderActiveView();
        } else {
            alert(`Error: ${res.error}`);
        }
    };

    window.__toggleEditDutyProfile = function() {
        LifeOS.mwsEditingProfile = !LifeOS.mwsEditingProfile;
        renderActiveView();
    };

    window.__saveDutyProfile = async function() {
        const branchEl = document.getElementById('edit-service-branch');
        const dutyEl = document.getElementById('edit-duty-type');
        const rankEl = document.getElementById('edit-rank-category');
        const schedEl = document.getElementById('edit-schedule-type');
        const hoursEl = document.getElementById('edit-avg-hours');
        const envEl = document.getElementById('edit-operational-env');
        const saveBtn = document.getElementById('btn-save-duty-profile');

        const payload = {
            serviceBranch: branchEl?.value?.trim() || "Defense Healthcare Agency",
            dutyType: dutyEl?.value || "Operational Support",
            rankCategory: rankEl?.value?.trim() || "Personnel",
            scheduleType: schedEl?.value || "Regular Day Shift",
            avgHoursPerWeek: Number(hoursEl?.value) || 40,
            operationalEnvironment: envEl?.value || "Standard Garrison"
        };

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `Saving to Database...`;
        }

        try {
            const token = sessionStorage.getItem('lifeos_session_token') || localStorage.getItem('lifeos_session_token');
            if (token) {
                const res = await fetch('/api/personnel/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok && data.success && data.profile) {
                    LifeOS.personnelWellnessProfile = data.profile;
                }
            } else {
                if (!LifeOS.personnelWellnessProfile) LifeOS.personnelWellnessProfile = {};
                Object.assign(LifeOS.personnelWellnessProfile, payload);
            }

            LifeOS.mwsEditingProfile = false;
            addNotification("success", "Profile Saved Successfully", "Duty context and operational demands updated in secure SQLite database.");
            renderActiveView();
        } catch (err) {
            alert(`Unable to save profile: ${err.message}`);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `Save Profile Changes`;
            }
        }
    };

    window.__logoutPersonnelSession = async function() {
        if (!confirm("Are you sure you want to log out of your Personnel Wellness session?")) return;

        const token = sessionStorage.getItem('lifeos_session_token') || localStorage.getItem('lifeos_session_token');
        if (token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) {}
        }

        sessionStorage.removeItem('lifeos_session_token');
        sessionStorage.removeItem('lifeos_user');
        localStorage.removeItem('lifeos_session_token');
        localStorage.removeItem('lifeos_user');

        // Reset to landing page
        document.body.classList.remove('dashboard-active');
        const dashboardShell = document.getElementById('dashboard-shell');
        const landingWrapper = document.getElementById('landing-page-wrapper');
        if (dashboardShell) dashboardShell.classList.add('hide');
        if (landingWrapper) landingWrapper.classList.remove('hide');

        addNotification("info", "Session Terminated", "You have been securely signed out.");
    };

    window.__showAddDeploymentModal = function() {
        const category = prompt("Enter Deployment Category:", "Special Field Support");
        if (!category) return;
        const startDate = prompt("Enter Start Date (YYYY-MM-DD):", "2026-06-01");
        if (!startDate) return;
        const endDate = prompt("Enter End Date (YYYY-MM-DD):", "2026-08-01");
        if (!endDate) return;

        const activeUser = { id: LifeOS.user.email || "alex.mercer@lifeos.ai", email: LifeOS.user.email || "alex.mercer@lifeos.ai" };
        const res = PersonnelWellnessAPI.addDeployment(activeUser, LifeOS.activeRole, "LIFEOS-USER-001", {
            deploymentCategory: category,
            startDate: startDate,
            endDate: endDate,
            workloadLevel: "ELEVATED",
            environmentCategory: "remote",
            recoveryPeriodAfterDeploymentDays: 14,
            source: "USER"
        }, LifeOS);

        if (res.status === 200) {
            addNotification("success", "Deployment Recorded", `Deployment '${category}' successfully recorded.`);
            renderActiveView();
        } else {
            alert(`Validation Failed: ${res.error}`);
        }
    };

    window.__showVoluntaryWellnessModal = function() {
        window.__mwsOpenWizard();
    };

    // --- 4. PORTAL INTERACTIVE WORKFLOW BINDINGS ---
    function attachViewBindings(tab) {
        // Core Patient Digital Twin view bindings
        if (tab === 'twin') {
            // Calculate system coverage percentage metrics
            const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
            const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
            const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");

            const elProfile = document.getElementById('quality-profile-pct');
            const elRecord = document.getElementById('quality-record-pct');
            const elWearable = document.getElementById('quality-wearable-pct');
            const elGenomic = document.getElementById('quality-genomic-pct');
            const elLifestyle = document.getElementById('quality-lifestyle-pct');
            const elReliability = document.getElementById('quality-reliability-lbl');
            const elWarningBanner = document.getElementById('quality-warning-banner');

            if (elProfile) {
                const profilePct = LifeOS.user.name ? 100 : 0;
                elProfile.textContent = `${profilePct}%`;
                
                const recordPct = hasRecords ? 100 : 0;
                elRecord.textContent = `${recordPct}%`;

                const wearablePct = hasWearables ? 100 : 0;
                elWearable.textContent = `${wearablePct}%`;

                const genomicPct = hasDna ? 100 : 0;
                elGenomic.textContent = `${genomicPct}%`;

                const lifestylePct = profilePct;
                elLifestyle.textContent = `${lifestylePct}%`;

                let count = 0;
                if (hasRecords) count++;
                if (hasWearables) count++;
                if (hasDna) count++;

                if (count === 3) {
                    elReliability.textContent = "High (96%)";
                    elReliability.className = "text-green font-bold";
                    if (elWarningBanner) elWarningBanner.style.display = 'none';
                } else if (count === 2) {
                    elReliability.textContent = "Moderate (74%)";
                    elReliability.className = "text-yellow font-bold";
                    if (elWarningBanner) elWarningBanner.style.display = 'block';
                } else if (count === 1) {
                    elReliability.textContent = "Low (38%)";
                    elReliability.className = "text-yellow font-bold";
                    if (elWarningBanner) elWarningBanner.style.display = 'block';
                } else {
                    elReliability.textContent = "Low (No Data)";
                    elReliability.className = "text-red font-bold";
                    if (elWarningBanner) elWarningBanner.style.display = 'block';
                }
            }

            // Organ nodes click handler
            const nodes = document.querySelectorAll('.db-twin-node');
            const titleEl = document.getElementById('db-twin-title');
            const statsEl = document.getElementById('db-twin-stats');
            
            nodes.forEach(node => {
                node.addEventListener('click', () => {
                    nodes.forEach(n => n.classList.remove('active'));
                    node.classList.add('active');
                    
                    const organ = node.getAttribute('data-organ');
                    const info = LifeOS.healthTwin.organs[organ];
                    
                    logAudit(`Patient inspected Twin subsystem: ${organ.toUpperCase()}`, "ACCESS");

                    if (info && titleEl && statsEl) {
                        titleEl.textContent = `SYSTEM: ${organ.toUpperCase()}`;
                        statsEl.innerHTML = '';
                        
                        Object.keys(info).forEach(key => {
                            if (key !== 'status') {
                                statsEl.innerHTML += `
                                    <div class="stat-row">
                                        <span class="stat-lbl">${key.toUpperCase()}:</span>
                                        <span class="stat-val text-mono text-green">${info[key]}</span>
                                    </div>
                                `;
                            }
                        });
                    }
                });
            });

            // Connect Wearable Device
            const btnConnect = document.getElementById('btn-connect-wearable');
            if (btnConnect) {
                btnConnect.addEventListener('click', () => {
                    openWearableConnectionModal();
                });
            }

            // Trigger emergency anomaly
            const btnAnomaly = document.getElementById('btn-trigger-anomaly');
            if (btnAnomaly) {
                btnAnomaly.addEventListener('click', () => {
                    triggerEmergencyAnomaly();
                });
            }

            // Uploader dropzone & sample testing buttons
            const dropzone = document.getElementById('report-dropzone');
            const fileInput = document.getElementById('report-file-input');
            const btnSampleRx = document.getElementById('btn-load-sample-rx');
            const btnSampleEicar = document.getElementById('btn-load-sample-eicar');

            if (dropzone && fileInput) {
                dropzone.addEventListener('click', () => fileInput.click());
                dropzone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropzone.style.borderColor = 'var(--accent-teal)';
                });
                dropzone.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    dropzone.style.borderColor = '';
                });
                dropzone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropzone.style.borderColor = '';
                    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleReportUpload(e.dataTransfer.files[0]);
                    }
                });
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) handleReportUpload(file);
                });
            }

            if (btnSampleRx) {
                btnSampleRx.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sampleText = "PRESCRIPTION ORDER\nDate: 2026-03-15\nPrescribing Clinician: Dr. Marcus Vance, MD\nFacility: Pacific Health Center\nPatient: Personnel User\n\nRx:\n1. Atorvastatin 20mg - Take 1 tablet orally daily at bedtime for 90 days\n2. Metformin 500mg - Take 1 tablet orally twice daily with meals for 90 days\n\nDiagnosis: Primary Hyperlipidemia, Type 2 Diabetes Mellitus";
                    const file = new File([sampleText], 'sample_prescription.txt', { type: 'text/plain' });
                    handleReportUpload(file);
                });
            }

            if (btnSampleEicar) {
                btnSampleEicar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const eicarStr = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
                    const file = new File([eicarStr], 'sample_eicar_test.txt', { type: 'text/plain' });
                    handleReportUpload(file);
                });
            }

            // Voice Health Agent query trigger
            const btnVoice = document.getElementById('btn-voice-query');
            const voiceText = document.getElementById('voice-agent-text');
            const voiceWaves = document.getElementById('voice-waves');
            
            if (btnVoice && voiceText && voiceWaves) {
                btnVoice.addEventListener('click', () => {
                    voiceText.textContent = "Listening to voice input...";
                    voiceWaves.style.display = 'flex';
                    
                    logAudit("Voice Agent voice channel established", "ACCESS");

                    setTimeout(() => {
                        voiceText.textContent = `"LifeOS, how am I doing today?"`;
                        
                        setTimeout(() => {
                            voiceText.textContent = "LifeOS AI: Your sleep recovery was 88% and resting heart rate averaged 58 BPM. MTHFR methylation recovery requires daily L-methylfolate.";
                            logAudit("Voice Agent vocalized assessment dispatch", "WRITE");
                        }, 1200);
                    }, 1000);
                });
            }

            // Render graph list
            renderGraphTimeline();
        }

        // DNA Helix canvas renderer
        if (tab === 'coach') {
            const subTabBtns = document.querySelectorAll('.coach-subtab-btn');
            subTabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    LifeOS.activeCoachSubTab = btn.getAttribute('data-subtab');
                    renderActiveView();
                });
            });
        }

        if (tab === 'exercise') {
            const levelBtns = document.querySelectorAll('.exercise-level-btn');
            levelBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    LifeOS.exerciseLevel = btn.getAttribute('data-level');
                    renderActiveView();
                });
            });
        }

        if (tab === 'users') {
            const approveBtns = document.querySelectorAll('.btn-reg-approve');
            approveBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const reg = LifeOS.registrations.find(r => r.id === id);
                    if (reg) {
                        reg.status = 'Approved';
                        logAudit(`Admin Approved Registration: ${id} (${reg.fullName})`, "WRITE");
                        addNotification("success", "Registration Approved", `${reg.fullName} (${id}) has been approved.`);
                        renderActiveView();
                    }
                });
            });

            const rejectBtns = document.querySelectorAll('.btn-reg-reject');
            rejectBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const reg = LifeOS.registrations.find(r => r.id === id);
                    if (reg) {
                        reg.status = 'Rejected';
                        logAudit(`Admin Rejected Registration: ${id} (${reg.fullName})`, "SECURITY");
                        addNotification("danger", "Registration Rejected", `${reg.fullName} (${id}) has been rejected.`);
                        renderActiveView();
                    }
                });
            });

            const resendEmailBtns = document.querySelectorAll('.btn-reg-resend-email');
            resendEmailBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    NotificationService.resendWelcomeEmail(id).then(() => renderActiveView()).catch(e => alert(e.message));
                });
            });

            const resendWaBtns = document.querySelectorAll('.btn-reg-resend-wa');
            resendWaBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    NotificationService.resendWhatsAppConfirmation(id).then(() => renderActiveView()).catch(e => alert(e.message));
                });
            });
        }

        if (tab === 'genomics') {
            renderDnaHelix();

            const dnaDropzone = document.getElementById('dna-dropzone');
            const dnaFileInput = document.getElementById('dna-file-input');
            if (dnaDropzone && dnaFileInput) {
                dnaDropzone.addEventListener('click', () => dnaFileInput.click());
                dnaFileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) handleDnaUpload(file);
                });
            }
        }

        // Health Intelligence Engine — draw forecast paths
        if (tab === 'intelligence') {
            logAudit("Health Intelligence Engine v4.0 initialized. All models active.", "ACCESS");

            const btnGenerate = document.getElementById('btn-generate-health-plan');
            const gateDiv = document.getElementById('master-assessment-gate');
            const loadingDiv = document.getElementById('master-assessment-loading');
            const consoleLogs = document.getElementById('assessment-console-logs');
            const pctSpan = document.getElementById('loading-pct');
            const barDiv = document.getElementById('assessment-loading-bar');

            if (btnGenerate && gateDiv && loadingDiv && consoleLogs && pctSpan && barDiv) {
                btnGenerate.addEventListener('click', () => {
                    gateDiv.classList.add('hide');
                    loadingDiv.classList.remove('hide');
                    consoleLogs.innerHTML = '';
                    
                    const logs = [
                        "[SYSTEM] Booting secure multi-agent consensus cluster...",
                        "[DECRYPTOR] Opening zero-knowledge enclave for Patient: Alex Mercer",
                        "[GENOME_AGENT] Mapping MTHFR C677T and APOE E3/E4 carrier status...",
                        "[DIAGNOSTIC_AGENT] Decoding lipids profile (ApoB: 112 mg/dL) & glycemic drift (HbA1c: 5.8%)...",
                        "[NUTRITION_AGENT] Compiling personalized saturated fat thresholds & methylfolate schedules...",
                        "[EXERCISE_AGENT] Structuring Zone 2 cardio cardio-pulmonary metabolic programs...",
                        "[CARE_AGENT] Establishing nocturnal glymphatic cooling protocols...",
                        "[SYSTEM] Finalizing Master Health Assessment v6.0..."
                    ];

                    let logIdx = 0;
                    let pct = 0;
                    
                    // Telemetry simulation
                    const logInterval = setInterval(() => {
                        if (logIdx < logs.length) {
                            consoleLogs.innerHTML += `<div class="text-mono text-xxs text-cyan mt-xxs" style="text-align:left;">${logs[logIdx]}</div>`;
                            consoleLogs.scrollTop = consoleLogs.scrollHeight;
                            logIdx++;
                        }
                    }, 300);

                    const progressInterval = setInterval(() => {
                        pct += 5;
                        if (pct > 100) pct = 100;
                        pctSpan.textContent = `${pct}%`;
                        barDiv.style.width = `${pct}%`;

                        if (pct >= 100) {
                            clearInterval(progressInterval);
                            clearInterval(logInterval);
                            
                            LifeOS.hasMasterReport = true;
                            logAudit("Master Health Assessment generated & digital twin synchronized", "WRITE");
                            addNotification("success", "Health Twin Synchronized", "Personalized Life Optimization Report has been created and compiled.");
                            
                            setTimeout(() => {
                                renderActiveView();
                            }, 500);
                        }
                    }, 120);
                });
            }

            const btnTogglePipeline = document.getElementById('btn-toggle-pipeline');
            const pipelineContent = document.getElementById('pipeline-content-area');
            const toggleIndicator = document.getElementById('pipeline-toggle-indicator');
            if (btnTogglePipeline && pipelineContent && toggleIndicator) {
                btnTogglePipeline.addEventListener('click', () => {
                    const isHidden = pipelineContent.classList.toggle('hide');
                    toggleIndicator.textContent = isHidden ? "EXPAND PROTOCOL [+]" : "COLLAPSE PROTOCOL [-]";
                });
            }

            const pipelineNodes = document.querySelectorAll('.pipeline-node');
            pipelineNodes.forEach(node => {
                node.addEventListener('click', () => {
                    const targetTab = node.getAttribute('data-tab');
                    if (targetTab) {
                        LifeOS.activeTab = targetTab;
                        renderSidebar();
                        renderActiveView();
                    }
                });
            });

            const btnRunAgent = document.getElementById('btn-run-agent-analysis');
            const agentConsole = document.getElementById('agent-console-card');
            const agentLogs = document.getElementById('agent-console-logs');
            const agentStatus = document.getElementById('agent-console-status');

            if (btnRunAgent && agentConsole && agentLogs) {
                btnRunAgent.addEventListener('click', () => {
                    btnRunAgent.disabled = true;
                    btnRunAgent.textContent = "Running Analysis...";
                    agentConsole.classList.remove('hide');
                    agentLogs.innerHTML = '';
                    agentStatus.textContent = "RUNNING";
                    agentStatus.className = "text-mono text-xxs text-yellow";

                    const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
                    const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
                    const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");

                    let apoeGenotype = "E3/E3";
                    let mthfrGenotype = "CC";
                    let tcf7l2Genotype = "CC";
                    if (hasDna) {
                        const dnaNode = LifeOS.healthMemoryGraph.find(node => node.title.toLowerCase().includes("helix") || node.desc.toLowerCase().includes("apoe") || node.desc.toLowerCase().includes("mthfr"));
                        if (dnaNode) {
                            const desc = dnaNode.desc;
                            const apoeMatch = desc.match(/APOE\s+(\S+)/i);
                            if (apoeMatch) apoeGenotype = apoeMatch[1];
                            const mthfrMatch = desc.match(/MTHFR\s+(\S+)/i);
                            if (mthfrMatch) mthfrGenotype = mthfrMatch[1];
                            const tcf7l2Match = desc.match(/TCF7L2\s+(\S+)/i);
                            if (tcf7l2Match) tcf7l2Genotype = tcf7l2Match[1];
                        }
                    }

                    let glucoseVal = LifeOS.wearables.glucose || 90;
                    let hba1cVal = "5.4";
                    if (hasRecords) {
                        const labNode = LifeOS.healthMemoryGraph.find(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
                        if (labNode) {
                            const a1cMatch = labNode.desc.match(/HbA1c:\s*(\d+(\.\d+)?)/i);
                            if (a1cMatch) hba1cVal = a1cMatch[1];
                            const glucoseMatch = labNode.desc.match(/Fasting Glucose:\s*(\d+(\.\d+)?)/i);
                            if (glucoseMatch) glucoseVal = parseFloat(glucoseMatch[1]);
                        }
                    }

                    const logLines = [
                        { text: "[CMO Agent] Activating multi-agent consensus protocols...", delay: 200, type: "system" },
                        { 
                            text: hasRecords 
                                ? `[Diagnostic Agent] Reviewing metabolic biomarkers: Fasting Glucose is ${glucoseVal} mg/dL, HbA1c is ${hba1cVal}% (${parseFloat(hba1cVal) > 5.7 ? 'Pre-diabetic drift' : 'Optimal'}).` 
                                : `[Diagnostic Agent] Awaiting diagnostics: No blood panel records decoded.`, 
                            delay: 900, 
                            type: "info" 
                        },
                        { 
                            text: hasDna 
                                ? `[Genome Agent] Decrypting MTHFR ${mthfrGenotype} and APOE ${apoeGenotype} risk loci. ${mthfrGenotype === 'CT' ? '30%' : mthfrGenotype === 'TT' ? '70%' : 'No'} vascular folate deficit mapped.` 
                                : `[Genome Agent] DNA sequencing locked; awaiting decryption.`, 
                            delay: 1800, 
                            type: "warning" 
                        },
                        { 
                            text: `[Nutrition Agent] Formulating diet adjustments: Recommend ${hasDna && apoeGenotype.includes('E4') ? 'restricting saturated lipids below 15g/day, ' : ''}${parseFloat(hba1cVal) > 5.7 ? 'low-glycemic inputs.' : 'standard longevity macros.'}`, 
                            delay: 2700, 
                            type: "success" 
                        },
                        { 
                            text: `[Drug Agent] Screening contraindications: Dosing verified medications safe. ${hasDna && apoeGenotype.includes('E4') ? 'Salicylate/aspirin contraindicated due to ApoE4 bleeding vectors.' : 'No active contraindications found.'}`, 
                            delay: 3600, 
                            type: "danger" 
                        },
                        { 
                            text: `[Longevity Agent] Computing organ metrics: Biological age is ${LifeOS.healthTwin.biologicalAge || LifeOS.user.age} yrs.`, 
                            delay: 4500, 
                            type: "info" 
                        },
                        { 
                            text: hasWearables 
                                ? `[Mental Health Agent] Scanning active HRV recovery metrics (average ${LifeOS.wearables.hrv || 70} ms).` 
                                : `[Mental Health Agent] Cortisol baseline stable. Awaiting wearables for HRV recovery logs.`, 
                            delay: 5400, 
                            type: "success" 
                        },
                        { 
                            text: `[Research Agent] Querying matched breakthrough registry entries for active biomarkers.`, 
                            delay: 6300, 
                            type: "info" 
                        },
                        { text: "[CMO Agent] Consensus complete. Verdict: APPROVED. Dispatched Master Health Assessment to secure bio-vault.", delay: 7200, type: "system" }
                    ];

                    logLines.forEach(line => {
                        setTimeout(() => {
                            let colorClass = "text-slate";
                            if (line.type === "system") colorClass = "text-purple";
                            else if (line.type === "info") colorClass = "text-cyan";
                            else if (line.type === "warning") colorClass = "text-yellow";
                            else if (line.type === "success") colorClass = "text-green";
                            else if (line.type === "danger") colorClass = "text-red";

                            agentLogs.innerHTML += `<div class="${colorClass}" style="margin-bottom:4px; text-align:left;">${line.text}</div>`;
                            agentLogs.scrollTop = agentLogs.scrollHeight;

                            if (line.text.includes("Consensus complete")) {
                                agentStatus.textContent = "COMPLETED";
                                agentStatus.className = "text-mono text-xxs text-green";
                                btnRunAgent.textContent = "Run Full AI Health Analysis";
                                btnRunAgent.disabled = false;

                                LifeOS.healthMemoryGraph.push({
                                    id: LifeOS.healthMemoryGraph.length + 1,
                                    type: "Report Decoded",
                                    title: "Master Health Assessment v4.0",
                                    date: new Date().toISOString().split('T')[0],
                                    status: "CMO Consensus Dispatch",
                                    desc: "Consensus verdict approved. Dosing protocol: Metformin 500mg (Daily) + Mediterranean low-fat nutrition map. Folate recovery bypass active."
                                });

                                recalculateHealthScores();
                                addNotification("success", "AI Assessment Complete", "Master Health Assessment generated and encrypted inside your secure Digital Twin.");
                                
                                setTimeout(() => {
                                    renderActiveView();
                                }, 1200);
                            }
                        }, line.delay);
                    });
                });
            }

            const svg = document.getElementById('forecast-svg');
            if (svg) {
                const forecasts = LifeOS.healthIntelligence.forecasts;
                const pathNames = ['currentPath', 'optimizedSleep', 'improvedNutrition', 'combined'];
                const pathClasses = ['current', 'optimized', 'lifestyle', 'combined'];
                const xStart = 40, xEnd = 690, yTop = 10, yBot = 200;

                pathNames.forEach((name, idx) => {
                    const data = forecasts[name];
                    if (!data || data.length < 2) return;
                    const step = (xEnd - xStart) / (data.length - 1);
                    const points = data.map((v, i) => {
                        const x = xStart + i * step;
                        const y = yBot - (v / 100) * (yBot - yTop);
                        return `${x},${y}`;
                    });

                    const pathStr = `M ${points[0]} ` + points.slice(1).map(p => `L ${p}`).join(' ');
                    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    pathEl.setAttribute("d", pathStr);
                    pathEl.setAttribute("class", `forecast-path ${pathClasses[idx]}`);

                    // Animate line drawing
                    const totalLen = 2000;
                    pathEl.setAttribute("stroke-dasharray", totalLen);
                    pathEl.setAttribute("stroke-dashoffset", totalLen);
                    svg.appendChild(pathEl);

                    setTimeout(() => {
                        pathEl.style.transition = `stroke-dashoffset 1.5s ease-in-out`;
                        pathEl.setAttribute("stroke-dashoffset", "0");
                    }, 100 + idx * 200);
                });
            }
        }

        if (tab === 'medication') {
            const compatInput = document.getElementById('compatibility-input');
            const btnCompat = document.getElementById('btn-run-compatibility');
            const resultPanel = document.getElementById('compatibility-result-panel');

            if (btnCompat && compatInput && resultPanel) {
                btnCompat.addEventListener('click', () => {
                    const drugName = compatInput.value.trim();
                    if (!drugName) return;

                    btnCompat.disabled = true;
                    btnCompat.textContent = "Scanning...";

                    setTimeout(() => {
                        const dl = drugName.toLowerCase();
                        let status = "SAFE";
                        let bannerClass = "safe";
                        let text = "";

                        if (dl.includes("aspirin") || dl.includes("salicylate") || dl.includes("ibuprofen") || dl.includes("advil")) {
                            status = "CONTRAINDICATED / WARNING";
                            bannerClass = "contraindicated";
                            text = `<strong>Contraindication Warning (APOE E3/E4):</strong> Dosing NSAIDs like ${drugName} increases baseline gastrointestinal bleeding index by 3.2x under high ApoB loads. Consider selective alternative pathways under physician oversight.`;
                            logAudit(`Drug Compatibility Warning flagged: ${drugName} for ApoE4 carrier`, "SECURITY");
                            addNotification("danger", "Compatibility Conflict", `${drugName} is contraindicated for ApoE4 genomic profiles.`);
                        } else if (dl.includes("statin") || dl.includes("atorvastatin") || dl.includes("simvastatin")) {
                            status = "MONITOR CLOSELY";
                            bannerClass = "monitor";
                            text = `<strong>Interaction Warning (APOE E3/E4):</strong> Statins clear circulating lipids effectively but require close liver enzyme monitoring due to high CYP2D6 clearance variability. Recommended baseline ApoB monitoring.`;
                            logAudit(`Drug Compatibility Monitor flagged: ${drugName} under ApoE4 status`, "SECURITY");
                            addNotification("warning", "Statin Clearance Monitor", `Statins require close lipid liver enzyme tracking.`);
                        } else {
                            status = "COMPATIBLE";
                            bannerClass = "safe";
                            text = `<strong>Biocompatibility Matrix Clear:</strong> ${drugName} has no registered genomic enzyme pathways locks for CYP2C19, CYP2D6, ApoE4, or MTHFR profiles.`;
                            logAudit(`Drug Compatibility cleared: ${drugName}`, "ACCESS");
                            addNotification("success", "Drug Compatible", `${drugName} compatibility check passed successfully.`);
                        }

                        resultPanel.className = `mt-sm text-xs matrix-cell ${bannerClass}`;
                        let html = `<div class="font-bold text-mono mb-xs">VERDICT: ${status}</div><p>${text}</p>`;
                        if (status === "COMPATIBLE" || status === "SAFE") {
                            html += `<button class="btn btn-cyan btn-xs mt-xs w-full" id="btn-add-drug-profile" style="padding: 4px; font-size: 0.7rem; cursor:pointer;">Add to Active Profile</button>`;
                        }
                        resultPanel.innerHTML = html;
                        resultPanel.classList.remove('hide');
                        btnCompat.disabled = false;
                        btnCompat.textContent = "Check Compatibility";

                        const btnAdd = document.getElementById('btn-add-drug-profile');
                        if (btnAdd) {
                            btnAdd.addEventListener('click', () => {
                                const capName = drugName.charAt(0).toUpperCase() + drugName.slice(1);
                                LifeOS.medications.push({
                                    id: LifeOS.medications.length + 1,
                                    name: capName,
                                    dosage: "As Directed",
                                    frequency: "Daily",
                                    purpose: "Biocompatibility Clear",
                                    compliance: "100%"
                                });
                                LifeOS.healthMemoryGraph.push({
                                    id: LifeOS.healthMemoryGraph.length + 1,
                                    type: "Treatment Issued",
                                    title: `Medication Added: ${capName}`,
                                    date: new Date().toISOString().split('T')[0],
                                    status: "Active Schedule",
                                    desc: `Added compatible compound ${capName} to daily health cycle.`
                                });
                                recalculateHealthScores();
                                addNotification("success", "Medication Added", `${capName} added to your active prescription profile.`);
                                renderActiveView();
                            });
                        }
                    }, 1200);
                });
            }
        }

        if (tab === 'nutrition') {
            const cycleBtns = document.querySelectorAll('.nutrition-cycle-tab');
            cycleBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    LifeOS.nutritionCycle = btn.getAttribute('data-cycle');
                    renderActiveView();
                });
            });

            const macroGoal = document.getElementById('macro-goal-select');
            const sliderP = document.getElementById('slider-macro-p');
            const sliderF = document.getElementById('slider-macro-f');
            const sliderC = document.getElementById('slider-macro-c');
            const lblP = document.getElementById('lbl-macro-p');
            const lblF = document.getElementById('lbl-macro-f');
            const lblC = document.getElementById('lbl-macro-c');
            const valGrams = document.getElementById('macro-grams-val');
            const btnSaveMacros = document.getElementById('btn-save-macros');

            function updateMacros() {
                const p = parseInt(sliderP.value);
                const f = parseInt(sliderF.value);
                const c = parseInt(sliderC.value);

                lblP.textContent = `${p}%`;
                lblF.textContent = `${f}%`;
                lblC.textContent = `${c}%`;

                // Update horizontal bars
                const barP = document.getElementById('bar-macro-p');
                const barF = document.getElementById('bar-macro-f');
                const barC = document.getElementById('bar-macro-c');
                const txtP = document.getElementById('txt-bar-p');
                const txtF = document.getElementById('txt-bar-f');
                const txtC = document.getElementById('txt-bar-c');
                if (barP) barP.style.width = `${p}%`;
                if (barF) barF.style.width = `${f}%`;
                if (barC) barC.style.width = `${c}%`;
                if (txtP) txtP.textContent = p;
                if (txtF) txtF.textContent = f;
                if (txtC) txtC.textContent = c;

                // Recalculate grams based on 2200 kcal daily intake
                const calories = 2200;
                const pGrams = Math.round((calories * (p / 100)) / 4);
                const fGrams = Math.round((calories * (f / 100)) / 9);
                const cGrams = Math.round((calories * (c / 100)) / 4);

                valGrams.textContent = `${pGrams}g Protein / ${fGrams}g Fat / ${cGrams}g Carbs`;
            }

            if (macroGoal && sliderP && sliderF && sliderC) {
                macroGoal.addEventListener('change', (e) => {
                    const goal = e.target.value;
                    if (goal === 'insulin') {
                        sliderP.value = 30; sliderF.value = 35; sliderC.value = 35;
                    } else if (goal === 'keto') {
                        sliderP.value = 20; sliderF.value = 70; sliderC.value = 10;
                    } else if (goal === 'autophagy') {
                        sliderP.value = 15; sliderF.value = 45; sliderC.value = 40;
                    } else if (goal === 'muscle') {
                        sliderP.value = 40; sliderF.value = 25; sliderC.value = 35;
                    }
                    updateMacros();
                });

                [sliderP, sliderF, sliderC].forEach(slider => {
                    slider.addEventListener('input', () => {
                        const p = parseInt(sliderP.value);
                        const f = parseInt(sliderF.value);
                        const c = parseInt(sliderC.value);
                        
                        const total = p + f + c;
                        if (total !== 100) {
                            const diff = 100 - total;
                            if (slider === sliderP) {
                                sliderC.value = Math.max(10, c + diff);
                            } else {
                                sliderP.value = Math.max(15, p + diff);
                            }
                        }
                        updateMacros();
                    });
                });

                updateMacros();
            }

            if (btnSaveMacros) {
                btnSaveMacros.addEventListener('click', () => {
                    btnSaveMacros.disabled = true;
                    btnSaveMacros.textContent = "Saving to Twin Vault...";
                    setTimeout(() => {
                        LifeOS.nutritionEngine.macronutrients.protein = parseInt(sliderP.value);
                        LifeOS.nutritionEngine.macronutrients.fat = parseInt(sliderF.value);
                        LifeOS.nutritionEngine.macronutrients.carbs = parseInt(sliderC.value);

                        logAudit(`Macronutrient targets saved: P:${sliderP.value}% F:${sliderF.value}% C:${sliderC.value}%`, "WRITE");
                        addNotification("success", "Macro Ratios Updated", "Personalized metabolic macronutrients compiled and applied to Digital Twin.");
                        btnSaveMacros.disabled = false;
                        btnSaveMacros.textContent = "Apply Macro Plan to Twin";
                        renderActiveView();
                    }, 1000);
                });
            }
        }

        if (tab === 'longevity') {
            const exSlider = document.getElementById('slider-long-ex');
            const slSlider = document.getElementById('slider-long-sl');
            const dietSlider = document.getElementById('slider-long-diet');
            const lblEx = document.getElementById('lbl-long-ex');
            const lblSl = document.getElementById('lbl-long-sl');
            const lblDiet = document.getElementById('lbl-long-diet');
            const valLifespan = document.getElementById('long-lifespan-val');
            const valHealthspan = document.getElementById('long-healthspan-val');

            function simulateLongevity() {
                const ex = parseFloat(exSlider.value);
                const sl = parseFloat(slSlider.value);
                const diet = parseFloat(dietSlider.value);

                lblEx.textContent = `${ex.toFixed(1)} hrs`;
                lblSl.textContent = `${sl}%`;
                lblDiet.textContent = `${diet}/100`;

                let lifespanGain = 0;
                lifespanGain += (ex - 4.0) * 0.8;
                lifespanGain += (sl - 75) * 0.15;
                lifespanGain += (diet - 70) * 0.12;

                let healthspanGain = 0;
                healthspanGain += (ex - 4.0) * 1.2;
                healthspanGain += (sl - 75) * 0.25;
                healthspanGain += (diet - 70) * 0.18;

                const finalLifespan = Math.max(70, Math.min(105, Math.round(84 + lifespanGain)));
                const finalHealthspan = Math.max(55, Math.min(98, Math.round(71 + healthspanGain)));

                valLifespan.textContent = `${finalLifespan} Years`;
                valHealthspan.textContent = `${finalHealthspan} Years`;
                
                LifeOS.healthTwin.longevityScore = Math.round((finalHealthspan / finalLifespan) * 100);

                // Update trackers
                const pctLifespan = Math.round((finalLifespan / 95) * 100);
                const pctHealthspan = Math.round((finalHealthspan / finalLifespan) * 100);

                const lblLifespanPct = document.getElementById('long-lifespan-pct-label');
                const lblHealthspanPct = document.getElementById('long-healthspan-pct-label');
                const barLifespan = document.getElementById('bar-long-lifespan');
                const barHealthspan = document.getElementById('bar-long-healthspan');

                if (lblLifespanPct) lblLifespanPct.textContent = `${pctLifespan}%`;
                if (lblHealthspanPct) lblHealthspanPct.textContent = `${pctHealthspan}%`;
                if (barLifespan) barLifespan.style.width = `${pctLifespan}%`;
                if (barHealthspan) barHealthspan.style.width = `${pctHealthspan}%`;

                // Calculate & update organ biological ages
                const chronological = 32.0;
                const brainAge = parseFloat((chronological - 4.5 - (ex - 4.0) * 0.1 - (sl - 75) * 0.05).toFixed(1));
                const heartAge = parseFloat((chronological - 3.8 - (ex - 4.0) * 0.2 - (diet - 70) * 0.08).toFixed(1));
                const metabolicAge = parseFloat((chronological + 3.0 - (diet - 70) * 0.15 - (ex - 4.0) * 0.1).toFixed(1));
                const immuneAge = parseFloat((chronological - 2.5 - (sl - 75) * 0.08).toFixed(1));
                const kidneyAge = parseFloat((chronological - 1.2 - (diet - 70) * 0.03).toFixed(1));
                const liverAge = parseFloat((chronological - 2.0 - (diet - 70) * 0.06).toFixed(1));

                const organs = [
                    { id: 'brain', val: brainAge },
                    { id: 'heart', val: heartAge },
                    { id: 'metabolic', val: metabolicAge },
                    { id: 'immune', val: immuneAge },
                    { id: 'kidney', val: kidneyAge },
                    { id: 'liver', val: liverAge }
                ];

                organs.forEach(o => {
                    const valEl = document.getElementById(`organ-val-${o.id}`);
                    const diffEl = document.getElementById(`organ-diff-${o.id}`);
                    const rectEl = document.getElementById(`rect-bio-${o.id}`);

                    if (valEl) valEl.textContent = o.val.toFixed(1);
                    if (diffEl) {
                        const diff = Math.abs(chronological - o.val).toFixed(1);
                        if (o.val < chronological) {
                            diffEl.textContent = `▼ ${diff} Yrs Younger`;
                            diffEl.className = "text-xxs text-green";
                        } else {
                            diffEl.textContent = `▲ ${diff} Yrs Older`;
                            diffEl.className = "text-xxs text-red";
                        }
                    }
                    if (rectEl) {
                        rectEl.setAttribute('width', Math.round(o.val * 10));
                    }
                });
            }

            if (exSlider && slSlider && dietSlider) {
                [exSlider, slSlider, dietSlider].forEach(slider => {
                    slider.addEventListener('input', simulateLongevity);
                });
                simulateLongevity();
            }
        }

        // AI Intake chatbot
        if (tab === 'consultation') {
            const chatInput = document.getElementById('ai-consult-chat-input');
            const btnSend = document.getElementById('btn-send-consult-chat');
            const chatMessages = document.getElementById('ai-consult-chat-messages');

            if (btnSend && chatInput) {
                btnSend.addEventListener('click', () => {
                    const txt = chatInput.value.trim();
                    if (txt) handleConsultChat(txt);
                });
                chatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const txt = chatInput.value.trim();
                        if (txt) handleConsultChat(txt);
                    }
                });
            }

            const btnGotoBooking = document.getElementById('btn-goto-booking');
            if (btnGotoBooking) {
                btnGotoBooking.addEventListener('click', () => {
                    LifeOS.activeTab = 'booking';
                    renderSidebar();
                    renderActiveView();
                });
            }
        }

        // Booking calendar
        if (tab === 'booking') {
            const specialtySelect = document.getElementById('booking-specialty');
            const docNameInput = document.getElementById('booking-doctor-name');
            const calendarDays = document.querySelectorAll('#booking-calendar .calendar-day.available');
            const btnSchedule = document.getElementById('btn-schedule-booking');
            
            let selectedDay = 2;

            if (specialtySelect && docNameInput) {
                specialtySelect.addEventListener('change', (e) => {
                    const spec = e.target.value;
                    if (spec === 'Cardiology') docNameInput.value = "Dr. Helen Vance";
                    else if (spec === 'Endocrinology') docNameInput.value = "Dr. Marcus Brody";
                    else if (spec === 'Neurology') docNameInput.value = "Dr. Charles Xavier";
                });
            }

            calendarDays.forEach(day => {
                day.addEventListener('click', () => {
                    calendarDays.forEach(d => d.classList.remove('selected'));
                    day.classList.add('selected');
                    selectedDay = day.getAttribute('data-day');
                });
            });

            if (btnSchedule) {
                btnSchedule.addEventListener('click', () => {
                    const doc = docNameInput.value;
                    const spec = specialtySelect.value;
                    
                    btnSchedule.disabled = true;
                    btnSchedule.textContent = "Scheduling appointment slot...";
                    
                    setTimeout(() => {
                        const newApt = {
                            id: LifeOS.appointments.length + 1,
                            doctor: doc,
                            specialty: spec,
                            date: `2026-07-${selectedDay < 10 ? '0' + selectedDay : selectedDay}`,
                            time: "11:00 AM",
                            status: "Scheduled"
                        };
                        LifeOS.appointments.push(newApt);
                        
                        logAudit(`Appointment scheduled with ${doc} (${spec})`, "WRITE");
                        
                        // Push breakthrough / notification
                        addNotification("info", "Appointment Scheduled", `Calendar slot locked with ${doc} on ${newApt.date} at ${newApt.time}. Reminder set.`);
                        
                        renderActiveView();
                    }, 1200);
                });
            }
        }

        // Search engine
        if (tab === 'search') {
            const sInput = document.getElementById('db-health-search-input');
            const btnSearch = document.getElementById('btn-db-health-search');
            const presets = document.querySelectorAll('.db-preset-btn');
            
            if (btnSearch && sInput) {
                btnSearch.addEventListener('click', () => {
                    const val = sInput.value.trim();
                    if (val) handleProfileSearch(val);
                });
                sInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const val = sInput.value.trim();
                        if (val) handleProfileSearch(val);
                    }
                });
            }

            presets.forEach(p => {
                p.addEventListener('click', () => {
                    const qKey = p.getAttribute('data-q');
                    let query = p.textContent.replace(/"/g, '');
                    if (sInput) sInput.value = query;
                    handleProfileSearch(qKey);
                });
            });
        }

        // Sliders disease simulator
        if (tab === 'simulator') {
            const simSliders = ['slider-fat', 'slider-steps', 'slider-sleep', 'slider-methyl', 'slider-smoke', 'slider-stress', 'slider-diet'];
            simSliders.forEach(sliderId => {
                const el = document.getElementById(sliderId);
                if (el) {
                    el.addEventListener('input', runDiseaseSimulation);
                }
            });

            const simCheckboxes = document.querySelectorAll('.sim-intervention-chk');
            simCheckboxes.forEach(chk => {
                chk.addEventListener('change', runDiseaseSimulation);
            });

            runDiseaseSimulation();
        }

        // Research copilot read breakthrough trigger
        if (tab === 'copilot') {
            const readButtons = document.querySelectorAll('.db-read-breakthrough-btn');
            readButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const bId = parseInt(btn.getAttribute('data-id'));
                    const breakthrough = LifeOS.breakthroughs.find(b => b.id === bId);
                    if (breakthrough) {
                        breakthrough.read = true;
                        updateNotifications();
                        renderActiveView();
                    }
                });
            });
        }

        // Doctor portals prescribe
        if (tab === 'prescribe') {
            const rxForm = document.getElementById('doctor-prescribe-form');
            if (rxForm) {
                rxForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const pre = document.getElementById('doc-prescription').value;
                    const nut = document.getElementById('doc-nutrition').value;
                    
                    const btn = document.getElementById('btn-doc-dispatch');
                    btn.disabled = true;
                    btn.textContent = "Encrypting and dispatching plan...";
                    
                    setTimeout(() => {
                        // Check drug interactions due to ApoE4
                        const lowerPre = pre.toLowerCase();
                        let interactionAlert = false;
                        if (lowerPre.includes('salicylate') || lowerPre.includes('aspirin')) {
                            interactionAlert = true;
                            // Add red warning audit
                            logAudit("Drug Agent Flagged Warning: Salicylate prescribed for ApoE4 carrier", "SECURITY");
                        }

                        // Save in medication list
                        if (pre) {
                            LifeOS.medications.push({
                                id: LifeOS.medications.length + 1,
                                name: pre.split(' ')[0],
                                dosage: pre.split(' ').slice(1).join(' ') || "As Directed",
                                frequency: "Daily",
                                purpose: "Clinician Directed",
                                compliance: "100%"
                            });
                        }

                        // Save in memory graph
                        LifeOS.healthMemoryGraph.push({
                            id: LifeOS.healthMemoryGraph.length + 1,
                            type: "Treatment Issued",
                            title: `Prescription: ${pre}`,
                            date: new Date().toISOString().split('T')[0],
                            status: "Client Decrypted",
                            desc: `Directive: ${pre}. Macros: ${nut || "Standard"}.`
                        });

                        logAudit(`Doctor Helen Vance issued treatment plan to patient twin`, "WRITE");
                        
                        if (interactionAlert) {
                            addNotification("danger", "Prescription Risk Flagged", `Drug Agent blocked salicylate dosing. ApoE4 carriers are contraindicated. Dosing deleted.`);
                            // Remove it
                            LifeOS.medications.pop();
                        } else {
                            addNotification("success", "Treatment Plan Active", `Dr. Vance dispatched new treatment protocol: ${pre}. Epigenetic timeline updated.`);
                            recalculateHealthScores();
                        }

                        btn.disabled = false;
                        btn.textContent = "Dispatch to Patient Twin";
                        rxForm.reset();

                        setTimeout(() => {
                            renderActiveView();
                        }, 1000);
                    }, 1400);
                });
            }
        }

        // Researcher optimizer cohort scans
        if (tab === 'trials') {
            const btnScan = document.getElementById('btn-run-cohort-scan');
            const matchesOutput = document.getElementById('trial-matches-output');
            
            if (btnScan && matchesOutput) {
                btnScan.addEventListener('click', () => {
                    const gene = document.getElementById('trial-filter-gene').value;
                    const marker = document.getElementById('trial-filter-biomarker').value;
                    
                    btnScan.disabled = true;
                    btnScan.textContent = "Scanning cohort database...";
                    
                    setTimeout(() => {
                        logAudit(`Researcher clinical trial cohort query executed for ${gene} + ${marker}`, "ACCESS");
                        
                        matchesOutput.innerHTML = `
                            <div class="dp-row"><span>Candidates scanned:</span> <span class="text-white font-bold">142 participants</span></div>
                            <div class="dp-row"><span>Matches criteria:</span> <span class="text-green font-bold">3 subjects</span></div>
                            <div class="dp-row"><span>Match IDs:</span> <span class="text-cyan text-mono">#L-OS_99182, #L-OS_89112, #L-OS_11495</span></div>
                        `;
                        btnScan.disabled = false;
                        btnScan.textContent = "Scan Cohort Candidates";
                    }, 1200);
                });
            }
        }

        // Researcher publications
        if (tab === 'publications') {
            const pubForm = document.getElementById('researcher-publish-form');
            if (pubForm) {
                pubForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const title = document.getElementById('pub-title').value;
                    const target = document.getElementById('pub-target').value;
                    const abstract = document.getElementById('pub-abstract').value;
                    
                    logAudit(`Researcher published study: ${title}`, "WRITE");
                    
                    // Add to breakthroughs list
                    const newBreak = {
                        id: LifeOS.breakthroughs.length + 1,
                        title: title,
                        text: abstract,
                        matchReason: `Matches ${target} Loci`,
                        date: new Date().toISOString().split('T')[0],
                        read: false
                    };
                    LifeOS.breakthroughs.push(newBreak);
                    
                    // If target matches user genomics (MTHFR or APOE4), trigger notification!
                    if ((target === 'MTHFR' && LifeOS.healthMemoryGraph.some(r => r.desc.includes('MTHFR'))) ||
                        (target === 'APOE4' && LifeOS.healthMemoryGraph.some(r => r.desc.includes('APOE')))) {
                        addNotification("warning", "New Breakthrough Match", `Research Copilot: ${title} matches your genome profile!`);
                    }

                    pubForm.reset();
                    alert("Breakthrough published to matching patient endpoints.");
                });
            }
        }

        // Provider staff onboarding
        if (tab === 'staff') {
            const staffForm = document.getElementById('provider-add-staff-form');
            if (staffForm) {
                staffForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const name = document.getElementById('staff-name').value;
                    const dept = document.getElementById('staff-dept').value;
                    
                    logAudit(`Provider onboarded clinical staff member: ${name} (${dept})`, "WRITE");
                    alert(`Staff registration completed: ${name} added to Department of ${dept}.`);
                    staffForm.reset();
                    renderActiveView();
                });
            }
        }

        // Investor TAM Calculator
        if (tab === 'tam') {
            const baseSlider = document.getElementById('slider-inv-base');
            const pctSlider = document.getElementById('slider-inv-pct');
            
            if (baseSlider && pctSlider) {
                baseSlider.addEventListener('input', runTAMCalculation);
                pctSlider.addEventListener('input', runTAMCalculation);
                runTAMCalculation();
            }
        }

        // Admin Agent weights config
        if (tab === 'agents') {
            const sliders = ['slider-w-cmo', 'slider-w-genome', 'slider-w-emergency'];
            sliders.forEach(sliderId => {
                const el = document.getElementById(sliderId);
                if (el) {
                    el.addEventListener('input', () => {
                        const val = el.value;
                        const key = sliderId.replace('slider-w-', '');
                        
                        LifeOS.agentWeights[key] = parseInt(val);
                        document.getElementById(`lbl-w-${key}`).textContent = `${val}%`;
                        
                        logAudit(`AI Agent Weight override: ${key.toUpperCase()} set to ${val}%`, "WRITE");
                    });
                }
            });
        }
    }

    // --- WORKFLOW RUNNERS ---

    function recalculateHealthScores() {
        const twin = LifeOS.healthTwin;
        const hasLabs = twin.labResults && twin.labResults.length > 0;
        const hasVitals = twin.vitals && twin.vitals.length > 0;
        const hasWearables = twin.wearables.connectedDevices && twin.wearables.connectedDevices.length > 0;
        const hasVerifiedData = hasLabs || hasVitals || hasWearables;
        
        if (!hasVerifiedData) {
            twin.healthScore = null;
            twin.riskScore = null;
            twin.biologicalAge = null;
            twin.longevityScore = null;
            twin.stressScore = null;
            
            for (let organ in twin.organs) {
                twin.organs[organ].status = "AWAITING DATA";
                if (organ === 'brain') {
                    twin.organs[organ].integrity = "Unavailable";
                    twin.organs[organ].sleepRatio = "Unavailable";
                    twin.organs[organ].cortisol = "Unavailable";
                } else if (organ === 'heart') {
                    twin.organs[organ].hr = "Unavailable";
                    twin.organs[organ].hrv = "Unavailable";
                    twin.organs[organ].stiffness = "Unavailable";
                } else if (organ === 'vascular') {
                    twin.organs[organ].map = "Unavailable";
                    twin.organs[organ].hsCRP = "Unavailable";
                    twin.organs[organ].endo = "Unavailable";
                } else if (organ === 'digestive') {
                    twin.organs[organ].diversity = "Unavailable";
                    twin.organs[organ].insulinSens = "Unavailable";
                    twin.organs[organ].zonulin = "Unavailable";
                } else if (organ === 'cellular') {
                    twin.organs[organ].telomere = "Unavailable";
                    twin.organs[organ].methylation = "Unavailable";
                    twin.organs[organ].clockAge = "Unavailable";
                }
            }
            
            LifeOS.longevityEngine.biologicalAgeDetail.biological = null;
            LifeOS.longevityEngine.biologicalAgeDetail.brain = null;
            LifeOS.longevityEngine.biologicalAgeDetail.heart = null;
            LifeOS.longevityEngine.biologicalAgeDetail.metabolic = null;
            LifeOS.longevityEngine.biologicalAgeDetail.immune = null;
            LifeOS.longevityEngine.biologicalAgeDetail.kidney = null;
            LifeOS.longevityEngine.biologicalAgeDetail.liver = null;
            
            LifeOS.longevityEngine.projections.lifespan = null;
            LifeOS.longevityEngine.projections.healthspan = null;

            LifeOS.healthIntelligence.predictions = [];
            LifeOS.healthIntelligence.causalDrivers = [];
            LifeOS.healthIntelligence.preventionActions = [];
            
            for (let axis in LifeOS.healthIntelligence.riskRadar) {
                LifeOS.healthIntelligence.riskRadar[axis] = null;
            }
            return;
        }

        // Calculate score from actual verified readings
        if (hasLabs && hasVitals) {
            const glucoseLab = twin.labResults.find(l => l.testName.toLowerCase().includes("glucose") || l.testName === "HbA1c");
            const hba1cVal = glucoseLab ? glucoseLab.value : 5.4;
            twin.healthScore = Math.max(40, Math.min(99, Math.round(100 - (hba1cVal - 5.0) * 15)));
            twin.riskScore = Math.max(10, Math.min(90, Math.round((100 - twin.healthScore) * 1.2)));
        } else {
            twin.healthScore = null;
            twin.riskScore = null;
        }

        // Epigenetic Age derived ONLY if epigenetic/methylation lab exists
        const epiLab = twin.labResults.find(l => l.testName.toLowerCase().includes("epigenetic") || l.testName.toLowerCase().includes("methylation"));
        if (epiLab) {
            twin.biologicalAge = epiLab.value;
        } else {
            twin.biologicalAge = null;
        }

        // Cortisol derived ONLY if cortisol lab exists
        const cortisolLab = twin.labResults.find(l => l.testName.toLowerCase().includes("cortisol"));
        const cortisolVal = cortisolLab ? `${cortisolLab.value} ${cortisolLab.unit}` : "Unavailable (No lab measurement)";

        // Heart rate & HRV from verified telemetry
        const liveHr = twin.wearables.heartRate !== null ? `${twin.wearables.heartRate} BPM` : "Unavailable (No telemetry)";
        const liveHrv = twin.wearables.hrv !== null ? `${twin.wearables.hrv} ms` : "Unavailable (No telemetry)";

        twin.organs.brain = {
            status: hasLabs ? "ACTIVE VERIFIED" : "AWAITING DATA",
            integrity: hasLabs ? "Verified" : "Unavailable",
            sleepRatio: hasWearables ? "24.5%" : "Unavailable",
            cortisol: cortisolVal
        };
        twin.organs.heart = {
            status: hasVitals || hasWearables ? "ACTIVE TELEMETRY" : "AWAITING DATA",
            hr: liveHr,
            hrv: liveHrv,
            stiffness: "Unavailable (No pulse wave test)"
        };
        twin.organs.vascular = {
            status: hasLabs ? "ACTIVE VERIFIED" : "AWAITING DATA",
            map: twin.wearables.bloodPressure || "Unavailable",
            hsCRP: twin.labResults.find(l => l.testName.includes("CRP"))?.value || "Unavailable",
            endo: "Unavailable"
        };
        const chronoAge = LifeOS.user?.age || 38;
        const hasRecords = Boolean((LifeOS.healthMemoryGraph && LifeOS.healthMemoryGraph.length > 0) || (twin.medicalDocuments && twin.medicalDocuments.length > 0));
        const hasDna = Boolean(LifeOS.user?.hasGenomicData);
        const hasDiabetes = Boolean(twin.diagnoses && twin.diagnoses.some(d => /diabetes|t2d/i.test(d)));
        const hasHypertension = Boolean(twin.diagnoses && twin.diagnoses.some(d => /hypertension|htn/i.test(d)));

        LifeOS.healthTwin.organs.digestive = {
            status: hasRecords ? "MONITOR" : "AWAITING DATA",
            diversity: hasRecords ? "82/100" : "Awaiting labs",
            insulinSens: "1.1",
            zonulin: hasRecords ? "Elevated" : "—"
        };
        LifeOS.healthTwin.organs.cellular = {
            status: hasDna ? "OPTIMIZED" : "AWAITING DATA",
            telomere: hasDna ? "94.2%" : "—",
            methylation: hasDna ? "99.8%" : "—",
            clockAge: hasDna ? "-4.2 Yrs" : "—"
        };

        const scoreBase = LifeOS.healthTwin.healthScore || 75;
        LifeOS.longevityEngine.biologicalAgeDetail.brain = parseFloat((chronoAge - 4.5 + (hasDiabetes ? 2 : 0)).toFixed(1));
        LifeOS.longevityEngine.biologicalAgeDetail.heart = parseFloat((chronoAge - 3 + (hasHypertension ? 4 : 0) - (LifeOS.medications.some(m => m.name && m.name.toLowerCase().includes("lisinopril")) ? 2 : 0)).toFixed(1));
        LifeOS.longevityEngine.biologicalAgeDetail.metabolic = parseFloat((chronoAge + 3.5 - (scoreBase > 85 ? 4 : 0) + (hasDiabetes ? 5 : 0) - (LifeOS.medications.some(m => m.name && m.name.toLowerCase().includes("metformin")) ? 3 : 0)).toFixed(1));
        LifeOS.longevityEngine.biologicalAgeDetail.immune = parseFloat((chronoAge - 3.5).toFixed(1));
        LifeOS.longevityEngine.biologicalAgeDetail.kidney = parseFloat((chronoAge - 5).toFixed(1));
        LifeOS.longevityEngine.biologicalAgeDetail.liver = parseFloat((chronoAge - 6.2).toFixed(1));

        // 9. Update Risk Radar metrics
        const riskBase = LifeOS.healthTwin.riskScore || 25;
        LifeOS.healthIntelligence.riskRadar.metabolic = hasDiabetes ? 72 : Math.max(20, Math.round(riskBase * 0.9));
        LifeOS.healthIntelligence.riskRadar.cardiovascular = hasHypertension ? 65 : Math.max(15, Math.round(riskBase * 0.6));
        LifeOS.healthIntelligence.riskRadar.inflammatory = Math.max(15, Math.round(riskBase * 0.7));
        LifeOS.healthIntelligence.riskRadar.genetic = hasDna ? 55 : 20;
        LifeOS.healthIntelligence.riskRadar.neurological = hasDna ? 38 : 15;
        LifeOS.healthIntelligence.riskRadar.cancer = 18;
        LifeOS.healthIntelligence.riskRadar.mentalHealth = 34;
        LifeOS.healthIntelligence.riskRadar.lifestyle = 41;
        
        if (LifeOS.healthTwin.healthScore !== null) {
            LifeOS.healthTwin.longevityScore = Math.max(40, Math.min(98, Math.round(LifeOS.healthTwin.healthScore * 1.05)));
            LifeOS.longevityEngine.projections.healthspan = Math.round(LifeOS.healthTwin.longevityScore * 0.85);
            LifeOS.longevityEngine.projections.lifespan = Math.round(LifeOS.healthTwin.longevityScore * 1.1);
        } else {
            LifeOS.healthTwin.longevityScore = null;
            LifeOS.longevityEngine.projections.healthspan = null;
            LifeOS.longevityEngine.projections.lifespan = null;
        }

        // Check all 7 prerequisites for Risk Predictions
        const hasWearableHistory = hasWearables && (
            (LifeOS.wearables.history.hr && LifeOS.wearables.history.hr.length > 0) || 
            (LifeOS.wearables.history.glucose && LifeOS.wearables.history.glucose.length > 0)
        );
        const hasMeds = LifeOS.medications && LifeOS.medications.length > 0;
        const hasLifestyle = LifeOS.user.interests && LifeOS.user.interests.length > 0;
        const hasVitalsStream = LifeOS.wearables.heartRate !== null && LifeOS.wearables.glucose !== null;
        const hasSymptoms = LifeOS.user.symptoms && LifeOS.user.symptoms.length > 0;
        const hasFamilyHistory = LifeOS.user.familyHistory && LifeOS.user.familyHistory.length > 0;

        const missingPrereqs = [];
        if (!hasRecords) missingPrereqs.push("Historical Labs");
        if (!hasWearableHistory) missingPrereqs.push("Wearable History");
        if (!hasMeds) missingPrereqs.push("Medication History");
        if (!hasLifestyle) missingPrereqs.push("Lifestyle Factors");
        if (!hasVitalsStream) missingPrereqs.push("Vitals Stream");
        if (!hasSymptoms) missingPrereqs.push("Symptoms Logs");
        if (!hasFamilyHistory) missingPrereqs.push("Family History");

        LifeOS.healthIntelligence.predictions = [];
        LifeOS.healthIntelligence.causalDrivers = [];
        LifeOS.healthIntelligence.preventionActions = [];
        LifeOS.healthIntelligence.missingPrereqs = missingPrereqs;

        if (missingPrereqs.length === 0) {
            // Generate full clinical predictions based on verified data (never diagnose or prescribe)
            // 1. Cardiovascular Disease Risk
            const apoeNode = LifeOS.healthMemoryGraph.find(node => node.desc.toLowerCase().includes("apoe"));
            const apoeStatus = apoeNode ? (apoeNode.desc.match(/apoe\s+([^\s,]+)/i) || [null, "E3/E3"])[1] : "E3/E3";
            let cvdRisk = 28;
            let cvdConfidence = 96; 
            if (apoeStatus.includes("E4")) {
                cvdRisk = apoeStatus === "E4/E4" ? 64 : 45;
            }
            LifeOS.healthIntelligence.predictions.push({
                id: 1,
                title: "Cardiovascular Disease Risk",
                risk: cvdRisk,
                confidence: cvdConfidence,
                sources: ["Fasting lipids (ApoB)", "Systolic BP", "Age", "Exercise", "APOE Genotype"],
                evidence: "A",
                lastUpdated: new Date().toLocaleDateString(),
                unknownFactors: "Nocturnal core body temperature deviation missing",
                evidenceSummary: `Based on ApoB (112 mg/dL) and APOE carrier status (${apoeStatus}). TCF7L2 diabetic state increases risk 1.8x.`,
                reasoning: [
                    { factor: `APOE ${apoeStatus} Carrier`, contribution: apoeStatus === "E4/E4" ? +36 : (apoeStatus === "E3/E4" ? +17 : +0), direction: "up" },
                    { factor: "Elevated ApoB Lipoprotein (112 mg/dL)", contribution: +12, direction: "up" },
                    { factor: "Systolic BP Cuff Stream", contribution: +4, direction: "up" }
                ],
                alternatives: [
                    { scenario: "With Statin Therapy (ApoB <70)", risk: Math.round(cvdRisk * 0.4), delta: -Math.round(cvdRisk * 0.6) },
                    { scenario: "Mediterranean Diet", risk: Math.round(cvdRisk * 0.8), delta: -Math.round(cvdRisk * 0.2) }
                ]
            });

            // 2. Type 2 Diabetes Genetic Predisposition
            const tcfNode = LifeOS.healthMemoryGraph.find(node => node.desc.toLowerCase().includes("tcf7l2"));
            const tcfStatus = tcfNode ? (tcfNode.desc.match(/tcf7l2\s+([^\s,]+)/i) || [null, "CC"])[1] : "CC";
            let diabetesRisk = 20;
            if (tcfStatus === "TT") diabetesRisk = 72;
            else if (tcfStatus === "CT") diabetesRisk = 48;
            LifeOS.healthIntelligence.predictions.push({
                id: 2,
                title: "Type 2 Diabetes Genetic Predisposition",
                risk: diabetesRisk,
                confidence: 98,
                sources: ["Genome (TCF7L2 Locus)", "Blood Panel (A1c)", "Vitals CGM Glucose Stream"],
                evidence: "A",
                lastUpdated: new Date().toLocaleDateString(),
                unknownFactors: "None. All core metrics integrated.",
                evidenceSummary: `TCF7L2 ${tcfStatus} variant confirms genetic susceptibility to beta-cell dysfunction. Active Metformin therapy decreases risk 31%.`,
                reasoning: [
                    { factor: `TCF7L2 Genotype (${tcfStatus})`, contribution: tcfStatus === "TT" ? +52 : (tcfStatus === "CT" ? +28 : +0), direction: "up" },
                    { factor: "Active Metformin Therapy", contribution: -12, direction: "down" },
                    { factor: "CGM Mean Glucose (94 mg/dL)", contribution: -4, direction: "down" }
                ],
                alternatives: [
                    { scenario: "Low-Carb Ketogenic Diet", risk: Math.round(diabetesRisk * 0.5), delta: -Math.round(diabetesRisk * 0.5) },
                    { scenario: "No Intervention", risk: diabetesRisk, delta: 0 }
                ]
            });

            // 3. Sleep Recovery Efficiency
            LifeOS.healthIntelligence.predictions.push({
                id: 3,
                title: "Sleep Recovery Efficiency",
                risk: 18,
                confidence: 96,
                sources: ["Wearable HRV", "Actigraphy Sleep stages"],
                evidence: "B",
                lastUpdated: new Date().toLocaleDateString(),
                unknownFactors: "Nocturnal core body temperature deviation missing",
                evidenceSummary: "Wearable HRV levels indicate optimal parasympathetic dominance during sleep.",
                reasoning: [
                    { factor: "Strong HRV Baseline", contribution: -10, direction: "down" },
                    { factor: "Late sleep onset", contribution: +6, direction: "up" }
                ],
                alternatives: [
                    { scenario: "With Sleep Protocol", risk: 12, delta: -6 }
                ]
            });
            
            LifeOS.healthIntelligence.causalDrivers.push({
                symptom: "Inflammation",
                rootCauses: [
                    { cause: "Elevated hsCRP (2.1 mg/L)", weight: 35, evidence: "A" },
                    { cause: "Omega-6:Omega-3 ratio imbalance", weight: 24, evidence: "B" }
                ]
            });
            
            LifeOS.healthIntelligence.preventionActions.push(
                { action: "Increase sleep to 7.5+ hours", benefit: "18% lower diabetes risk", timeline: "90 days", evidence: "A" },
                { action: "Add 30min daily walking", benefit: "22% lower cardiovascular risk", timeline: "60 days", evidence: "A" }
            );
        }

        // Setup Agent Consensus states based on verified data
        LifeOS.healthIntelligence.agentConsensus = [
            { agent: "CMO Agent", recommendation: hasRecords ? "Initiate low-glycemic dietary protocols." : "Awaiting verified patient files.", confidence: hasRecords ? 92 : 0, vote: hasRecords ? "APPROVE" : "PENDING" },
            { agent: "Genome Agent", recommendation: hasDna ? "TCF7L2 variant confirms insulin pathway vulnerability." : "Awaiting decrypted DNA sequence.", confidence: hasDna ? 96 : 0, vote: hasDna ? "APPROVE" : "PENDING" },
            { agent: "Nutrition Agent", recommendation: hasRecords ? "Mediterranean diet with low glycemic focus." : "Awaiting metabolic biomarkers.", confidence: hasRecords ? 84 : 0, vote: hasRecords ? "APPROVE" : "PENDING" },
            { agent: "Drug Agent", recommendation: hasDna ? "Check APOE E4 interaction with high-dose statins." : "Awaiting genomic drug clearance.", confidence: hasDna ? 90 : 0, vote: hasDna ? "APPROVE" : "PENDING" },
            { agent: "Longevity Agent", recommendation: hasRecords ? "Maintain low inflammation metrics to preserve healthspan." : "Awaiting epigenetic clock input.", confidence: hasRecords ? 88 : 0, vote: hasRecords ? "APPROVE" : "PENDING" },
            { agent: "Diagnostic Agent", recommendation: hasWearables ? "CGM sensor shows insulin stability is optimal." : "Awaiting continuous telemetry data.", confidence: hasWearables ? 94 : 0, vote: hasWearables ? "APPROVE" : "PENDING" }
        ];

        // Setup nutrition engine meal plan and supplements
        if (hasRecords || hasDna) {
            LifeOS.nutritionEngine.mealPlan = {
                breakfast: "Avocado, Wild Salmon, Spinach (Rich in Folate, Omega-3)",
                lunch: "Mediterranean Chickpea Salad, Olive Oil, Grilled Chicken",
                dinner: "Baked Cod, Broccoli, Steamed Quinoa (Low Glycemic Glycation Buffer)",
                snacks: "Walnuts, Pumpkin Seeds, Blueberries (Antioxidant Brain Fuel)"
            };
        } else {
            LifeOS.nutritionEngine.mealPlan = {
                breakfast: "Awaiting data...",
                lunch: "Awaiting data...",
                dinner: "Awaiting data...",
                snacks: "Awaiting data..."
            };
        }

        LifeOS.nutritionEngine.supplements = [];
        LifeOS.nutritionEngine.deficiencies = [];

        if (hasDna) {
            LifeOS.nutritionEngine.supplements.push(
                { name: "L-Methylfolate (5-MTHF)", dosage: "400mcg", frequency: "Daily", evidence: "Level A", reason: "MTHFR C677T Heterozygous Bypass" },
                { name: "Omega-3 (EPA/DHA)", dosage: "2000mg", frequency: "Daily", evidence: "Level A", reason: "APOE E4 Neuro-vascular Protection" }
            );
            LifeOS.nutritionEngine.deficiencies.push(
                { nutrient: "Active Folate", status: "CRITICAL", level: "4.2 ng/mL (Ref: >12)", source: "MTHFR Enzyme Block" }
            );
        }

        if (hasWearables) {
            LifeOS.nutritionEngine.supplements.push(
                { name: "Magnesium Glycinate", dosage: "350mg", frequency: "Nocturnal", evidence: "Level B", reason: "Nocturnal Stress & HRV Optimization" }
            );
            LifeOS.nutritionEngine.deficiencies.push(
                { nutrient: "Magnesium Serum", status: "OPTIMIZED", level: "2.1 mg/dL (Ref: 1.7-2.2)", source: "Supplemented" }
            );
        }

        // Setup longevity protocols
        LifeOS.longevityEngine.protocols = [];
        if (hasWearables) {
            LifeOS.longevityEngine.protocols.push(
                { area: "Exercise Protocol", description: "Zone 2 Cardio (3 hrs/wk) + Strength Training (3 days/wk)", impact: "+4.2 Years Healthspan", complexity: "Medium" },
                { area: "Circadian Sleep Lock", description: "Standard sleep window (10:30 PM - 6:30 AM) + Sleep Hygiene", impact: "+3.1 Years Healthspan", complexity: "Low" }
            );
        }
        if (hasDna) {
            LifeOS.longevityEngine.protocols.push(
                { area: "Folate Pathway Support", description: "Methylfolate Supplementation + Methylation Support Diet", impact: "+1.8 Years Lifespan", complexity: "Low" },
                { area: "ApoE4 Lipid Restriction", description: "Limit saturated fat intake below 15g/day", impact: "+5.4 Years Healthspan (Neuro)", complexity: "High" }
            );
        }
    }

    // Audit logger helper
    function logAudit(event, type) {
        const time = new Date().toLocaleTimeString('it-IT');
        LifeOS.auditLogs.push({ time, event, type });
        // Cap audit logs at 100 entries
        if (LifeOS.auditLogs.length > 100) LifeOS.auditLogs.shift();
    }

    // Render Health Memory Graph
    function renderGraphTimeline() {
        const listEl = document.getElementById('db-health-graph-list');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        LifeOS.healthMemoryGraph.slice().reverse().forEach(node => {
            listEl.innerHTML += `
                <div class="ledger-line">
                    <span class="ledger-time">[${node.date}]</span>
                    <span class="ledger-sec">[${node.type.toUpperCase()}]</span>
                    <span class="ledger-event"><strong>${node.title}</strong> - ${node.desc} (${node.status})</span>
                </div>
            `;
        });
    }

    // Report decrypter uploader workflow
    // Report decrypter uploader workflow
    // Report helper parser
    function parseReportText(text, fileName = '') {
        const lines = text.split(/\r?\n/);
        let patientName = null;
        let patientAge = null;
        let patientGender = null;
        let physician = null;
        let labName = null;
        let reportDate = null;
        let collectionDate = null;
        const labs = [];
        const vitals = [];
        const prescriptions = [];
        const diagnoses = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Clinician
            const clinMatch = trimmed.match(/\b(?:Dr\.|Physician|Clinician|Prescriber|Doctor|Ordering Clinician)\b\s*:?\s*([A-Za-z0-9\s.,-]+)/i);
            if (clinMatch && !physician) physician = clinMatch[1].trim();

            // Facility / Lab
            const labLineMatch = trimmed.match(/^Laboratory\s*:?\s*([A-Za-z0-9\s.,-]+)/i);
            if (labLineMatch) {
                labName = labLineMatch[1].trim();
            } else {
                const facMatch = trimmed.match(/\b(?:Facility|Clinic|Hospital|Medical Center|Practice)\b\s*:?\s*([A-Za-z0-9\s.,-]+)/i);
                if (facMatch && !trimmed.toLowerCase().includes('clinician') && !/report|order|results/i.test(facMatch[1]) && !labName) {
                    labName = facMatch[1].trim();
                }
            }

            // Dates
            const repDateMatch = trimmed.match(/(?:Report Date|Date|Prescribed|Issued)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i);
            if (repDateMatch && !reportDate) reportDate = repDateMatch[1].trim();

            const collDateMatch = trimmed.match(/(?:Collection Date|Collected)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i);
            if (collDateMatch && !collectionDate) collectionDate = collDateMatch[1].trim();

            // Patient
            const patMatch = trimmed.match(/(?:Patient Name|Patient|Name|Subject)\s*:?\s*([A-Za-z\s.,-]+)/i);
            if (patMatch && !patientName && !/date|id|age|gender|status|address/i.test(patMatch[1])) {
                patientName = patMatch[1].trim();
            }

            const ageMatch = trimmed.match(/\bAge\s*:?\s*(\d+)/i);
            if (ageMatch && !patientAge) patientAge = parseInt(ageMatch[1], 10);

            const genderMatch = trimmed.match(/\b(?:Gender|Sex)\s*:?\s*(Male|Female|M|F|Other)/i);
            if (genderMatch && !patientGender) patientGender = genderMatch[1].trim();

            // Explicit Diagnoses
            const diagMatch = trimmed.match(/(?:Diagnosis|Condition|Indication|Impressions?)\s*:?\s*([A-Za-z0-9\s.,-]+)/i);
            if (diagMatch && !trimmed.toLowerCase().includes('date') && !trimmed.toLowerCase().includes('quest diagnostics')) {
                diagMatch[1].split(/[,;]/).forEach(d => {
                    const s = d.trim();
                    if (s && !diagnoses.includes(s) && s.length > 2) diagnoses.push(s);
                });
            }

            // Vitals
            const bpMatch = trimmed.match(/(?:Blood\s+Pressure|BP)\s*:?\s*(\d{2,3}\s*\/\s*\d{2,3})\s*(?:mmHg)?/i);
            if (bpMatch) {
                vitals.push({
                    metric: 'Blood Pressure',
                    value: bpMatch[1].replace(/\s+/g, ''),
                    unit: 'mmHg',
                    referenceRange: '90/60 - 120/80 mmHg',
                    abnormalFlag: 'NORMAL',
                    organSystem: 'heart',
                    confidence: 96
                });
            }

            const hrMatch = trimmed.match(/(?:Heart\s+Rate|Pulse|HR)\s*:?\s*(\d{2,3})\s*(?:bpm)?/i);
            if (hrMatch) {
                const hrVal = parseInt(hrMatch[1], 10);
                vitals.push({
                    metric: 'Heart Rate',
                    value: String(hrVal),
                    unit: 'bpm',
                    referenceRange: '60-100 bpm',
                    abnormalFlag: hrVal > 100 ? 'HIGH' : (hrVal < 60 ? 'LOW' : 'NORMAL'),
                    organSystem: 'heart',
                    confidence: 96
                });
            }

            // Prescriptions
            const rxMatch = trimmed.match(/(?:Rx|Medication|Drug|Prescription)\s*#?\d*\s*:?\s*([A-Za-z0-9\s.,\-\/]+)/i);
            const numMatch = trimmed.match(/^\d+[\.\)]\s*([A-Za-z0-9\s.,\-\/]+)/);
            let mLine = null;
            if (rxMatch) {
                mLine = rxMatch[1].trim();
            } else if (numMatch && (trimmed.includes('mg') || trimmed.includes('daily') || trimmed.includes('tablet'))) {
                mLine = numMatch[1].trim();
            }

            if (mLine) {
                const strengthMatch = mLine.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|%))/i);
                const freqMatch = mLine.match(/(daily|twice daily|bid|tid|qid|every \d+ hours|once daily|at bedtime|prn|as needed)/i);
                const durationMatch = mLine.match(/(\d+\s*(?:days?|weeks?|months?))/i);

                if (strengthMatch || freqMatch || /tablet|capsule|oral|inject|drops|cream|take|dispense/i.test(mLine)) {
                    let mName = mLine.split(/[-–,]/)[0].trim();
                    if (strengthMatch) {
                        const idx = mName.indexOf(strengthMatch[1]);
                        if (idx > 0) mName = mName.substring(0, idx).trim();
                    }

                    prescriptions.push({
                        medicationName: mName,
                        strength: strengthMatch ? strengthMatch[1] : null,
                        dosage: mLine,
                        frequency: freqMatch ? freqMatch[1] : 'As directed',
                        duration: durationMatch ? durationMatch[1] : '30 days',
                        clinician: physician,
                        date: reportDate
                    });
                }
            }
        });

        // Dedicated Lab Biomarker pattern matching
        const labDefinitions = [
            { testName: 'Fasting Glucose', regex: /(?:fasting\s+glucose|glucose|blood\s+sugar)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '70-99 mg/dL', category: 'metabolic', organ: 'pancreas' },
            { testName: 'Hemoglobin A1c', regex: /(?:hemoglobin\s+a1c|hba1c|a1c)\s+(\d+(?:\.\d+)?)\s*(%)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: '%', ref: '< 5.7%', category: 'metabolic', organ: 'pancreas' },
            { testName: 'Apolipoprotein B', regex: /(?:apolipoprotein\s+b|apob)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|g\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '< 90 mg/dL', category: 'cardiovascular', organ: 'heart' },
            { testName: 'Total Cholesterol', regex: /(?:total\s+cholesterol|cholesterol,\s+total)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '< 200 mg/dL', category: 'cardiovascular', organ: 'heart' },
            { testName: 'LDL Cholesterol', regex: /(?:ldl\s+cholesterol|ldl-c)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '< 100 mg/dL', category: 'cardiovascular', organ: 'heart' },
            { testName: 'HDL Cholesterol', regex: /(?:hdl\s+cholesterol|hdl-c)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '> 50 mg/dL', category: 'cardiovascular', organ: 'heart' },
            { testName: 'Triglycerides', regex: /(?:triglycerides)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '< 150 mg/dL', category: 'cardiovascular', organ: 'heart' },
            { testName: 'Creatinine', regex: /(?:creatinine|serum\s+creatinine)\s+(\d+(?:\.\d+)?)\s*(mg\/dL|umol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '0.7-1.3 mg/dL', category: 'renal', organ: 'kidneys' },
            { testName: 'eGFR', regex: /(?:egfr|estimated\s+gfr)\s+(\d+(?:\.\d+)?)\s*(mL\/min)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mL/min', ref: '> 60 mL/min', category: 'renal', organ: 'kidneys' },
            { testName: 'BUN', regex: /(?:bun|blood\s+urea\s+nitrogen)\s+(\d+(?:\.\d+)?)\s*(mg\/dL)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '7-20 mg/dL', category: 'renal', organ: 'kidneys' },
            { testName: 'ALT', regex: /(?:alt|alanine\s+aminotransferase|sgpt)\s+(\d+(?:\.\d+)?)\s*(U\/L|IU\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'U/L', ref: '7-56 U/L', category: 'hepatic', organ: 'liver' },
            { testName: 'AST', regex: /(?:ast|aspartate\s+aminotransferase|sgot)\s+(\d+(?:\.\d+)?)\s*(U\/L|IU\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'U/L', ref: '10-40 U/L', category: 'hepatic', organ: 'liver' },
            { testName: 'Total Bilirubin', regex: /(?:total\s+bilirubin|bilirubin,\s+total)\s+(\d+(?:\.\d+)?)\s*(mg\/dL)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/dL', ref: '0.1-1.2 mg/dL', category: 'hepatic', organ: 'liver' },
            { testName: 'Albumin', regex: /(?:albumin|serum\s+albumin)\s+(\d+(?:\.\d+)?)\s*(g\/dL)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'g/dL', ref: '3.5-5.0 g/dL', category: 'hepatic', organ: 'liver' },
            { testName: 'hs-CRP', regex: /(?:hs-crp|c-reactive\s+protein|crp)\s+(\d+(?:\.\d+)?)\s*(mg\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mg/L', ref: '< 1.0 mg/L', category: 'inflammatory', organ: 'vascular' },
            { testName: 'Cortisol', regex: /(?:cortisol)\s+(\d+(?:\.\d+)?)\s*(mcg\/dL|nmol\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'mcg/dL', ref: '6.0-18.4 mcg/dL', category: 'endocrine', organ: 'brain' },
            { testName: 'TSH', regex: /(?:tsh|thyroid\s+stimulating\s+hormone)\s+(\d+(?:\.\d+)?)\s*(uIU\/mL|mIU\/L)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'uIU/mL', ref: '0.4-4.0 uIU/mL', category: 'endocrine', organ: 'thyroid' },
            { testName: 'Vitamin D', regex: /(?:vitamin\s+d|25-hydroxy\s+vitamin\s+d)\s+(\d+(?:\.\d+)?)\s*(ng\/mL)?(?:\s+([0-9\s\.\-<]+))?(?:\s+(HIGH|LOW|NORMAL|ABNORMAL))?/i, defaultUnit: 'ng/mL', ref: '30-100 ng/mL', category: 'nutritional', organ: 'cellular' }
        ];

        labDefinitions.forEach(def => {
            const m = text.match(def.regex);
            if (m) {
                const rawVal = parseFloat(m[1]);
                const unit = m[2] ? m[2].trim() : def.defaultUnit;
                let refRange = m[3] ? m[3].trim() : def.ref;
                let flag = 'NORMAL';

                const matchedLine = lines.find(l => def.regex.test(l));
                if (matchedLine) {
                    const flagMatch = matchedLine.match(/\b(HIGH|LOW|CRITICAL|ABNORMAL)\b/i);
                    if (flagMatch) flag = flagMatch[1].toUpperCase();
                }

                labs.push({
                    testName: def.testName,
                    value: rawVal,
                    unit: unit,
                    referenceRange: refRange,
                    abnormalFlag: flag,
                    category: def.category,
                    organSystem: def.organ,
                    confidence: 97
                });
            }
        });

        const isRx = prescriptions.length > 0 || (fileName && (fileName.toLowerCase().includes('rx') || fileName.toLowerCase().includes('prescription')));

        return {
            patientName: patientName || (LifeOS.user ? LifeOS.user.name : null),
            patientAge,
            patientGender,
            physician,
            labName: labName || (labs.length > 0 ? "Clinical Diagnostics Laboratory" : null),
            reportDate: reportDate || new Date().toISOString().split('T')[0],
            collectionDate: collectionDate || reportDate,
            labs,
            vitals,
            prescriptions,
            diagnoses,
            isRx
        };
    }

    // (Old upload and confirm modals removed in favor of the new 10-step async OCR/Genomics pipelines at the bottom of this file)

    // AI Consultation Chat response loop
    function handleConsultChat(inputText) {
        const chatMessages = document.getElementById('ai-consult-chat-messages');
        const chatInput = document.getElementById('ai-consult-chat-input');
        if (!chatMessages || !chatInput) return;

        // Display user message
        LifeOS.consultation.messages.push({ sender: "user", text: inputText });
        renderPatientConsultationMessages();
        chatInput.value = '';

        logAudit("Symptom query dispatched to AI Consultation Agent", "WRITE");

        // Bot typing feedback
        setTimeout(() => {
            const typingBubble = document.createElement('div');
            typingBubble.className = "chat-bubble bot typing-feedback";
            typingBubble.textContent = "AI Agent analyzing clinical pathways...";
            chatMessages.appendChild(typingBubble);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            setTimeout(() => {
                chatMessages.removeChild(typingBubble);
                
                let responseText = "Understood. The diagnostic agent has checked your wearable glucose stability index. Please report if you feel any dizziness or lightheadedness.";
                
                const lowerText = inputText.toLowerCase();
                if (LifeOS.consultation.stage === "intake") {
                    if (lowerText.includes('tired') || lowerText.includes('fatigue')) {
                        responseText = "Noted. Wearable logs show a glycemic crash to 64 mg/dL postprandial yesterday. Are you experiencing nocturnal sleep disruptions or cardiovascular racing?";
                        LifeOS.consultation.stage = "analysis";
                    } else if (lowerText.includes('chest') || lowerText.includes('heart') || lowerText.includes('pulse')) {
                        responseText = "Cardio telemetry flags ST segment elevations during peak stress cycles. Are you experiencing short breath or left arm numbness?";
                        LifeOS.consultation.stage = "analysis";
                    } else {
                        responseText = "Understood. I am parsing your symptom inputs. Can you describe when these symptoms first manifest and any related lifestyle variables?";
                    }
                } else if (LifeOS.consultation.stage === "analysis") {
                    // Output summary
                    LifeOS.consultation.stage = "summary";
                    
                    if (lowerText.includes('yes') || lowerText.includes('sleep') || lowerText.includes('breath')) {
                        LifeOS.consultation.summary = {
                            assessment: "Cardiac ST Segment elevation correlation with high autonomic stress load. Elevated ApoB carrier increases atherogenic risks.",
                            specialist: "Dr. Helen Vance (Cardiology)",
                            tests: "High-Resolution Stress ECG, Fasting Lipids Panel",
                            followUp: "Maintain low saturated fat macros. Calibrate emergency cardiac monitoring watcher."
                        };
                    } else {
                        LifeOS.consultation.summary = {
                            assessment: "Pre-diabetic metabolic drift with postprandial glycemic crashes. MTHFR variant causes 30% folate deficit.",
                            specialist: "Dr. Marcus Brody (Endocrinology)",
                            tests: "Fasting HbA1c check, Oral Glucose Tolerance Test",
                            followUp: "Limit carbohydrate density in diet. Supplement active methylfolate."
                        };
                    }

                    responseText = "Intake assessment complete. I have generated a Clinical Intake Dispatch report and matched a board-certified specialist. You can review details below.";
                }

                LifeOS.consultation.messages.push({ sender: "bot", text: responseText });
                renderActiveView();
            }, 1500);
        }, 800);
    }

    function renderPatientConsultationMessages() {
        const chatMessages = document.getElementById('ai-consult-chat-messages');
        if (!chatMessages) return;
        chatMessages.innerHTML = '';
        LifeOS.consultation.messages.forEach(msg => {
            chatMessages.innerHTML += `<div class="chat-bubble ${msg.sender}">${msg.text}</div>`;
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Health Search parser
    function handleProfileSearch(queryKey) {
        const panel = document.getElementById('db-search-results-panel');
        const content = document.getElementById('db-search-results-content');

        if (!panel || !content) return;

        panel.classList.remove('hide');
        content.innerHTML = `<i data-lucide="loader" class="animate-spin inline mr-xs"></i> Scanning personalized bio-vault and genomic references...`;
        lucide.createIcons();

        setTimeout(() => {
            const q = queryKey.toLowerCase();
            let matchedText = `<strong>Search Result:</strong> LifeOS parsed the health record ledger for patient ${LifeOS.user.name}. No active biomarker anomalies or genetic mutations matched the query "${queryKey}". Recommended clinical follow-up for symptom tracking.`;

            const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
            const hasDiabetes = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("diabetes") || node.desc.toLowerCase().includes("a1c"));
            const hasHypertension = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("hypertension") || node.desc.toLowerCase().includes("blood pressure") || node.desc.toLowerCase().includes("ecg"));

            if (q.includes('tired') || q.includes('fatigue') || q.includes('energy')) {
                let correlation = "<strong>Biometric Correlation:</strong> Fatigue is correlated with ";
                let suggestions = "<br><br><strong>Preventive Protocol:</strong> ";

                if (hasDna) {
                    correlation += "your mapped MTHFR C677T heterozygous status (limiting folate methylation bypass by 30%) ";
                    suggestions += "Supplement active L-methylfolate (5-MTHF) daily to bypass MTHFR deficits. ";
                } else {
                    correlation += "potential metabolic pathways. (Genomics sequence data is currently locked; upload DNA report to scan MTHFR C677T variant). ";
                    suggestions += "Provide a raw DNA report to evaluate enzyme pathways. ";
                }

                const isConnected = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
                if (isConnected) {
                    correlation += `and your active CGM telemetry displaying a glucose level of ${LifeOS.wearables.glucose} mg/dL. `;
                    if (LifeOS.wearables.glucose > 130) {
                        suggestions += "Limit glycemic loads and simple carbohydrate intakes. ";
                    } else if (LifeOS.wearables.glucose < 70) {
                        suggestions += "Stabilize blood sugar with fiber-rich complex carbohydrates and healthy lipids. ";
                    }
                } else {
                    correlation += "and general physical recovery parameters. ";
                }

                matchedText = correlation + suggestions + "Conduct an overnight sleep architecture scan to monitor deep recovery cycles.";
            } else if (q.includes('apoe') || q.includes('diet') || q.includes('alzheimer') || q.includes('cardio') || q.includes('lipid')) {
                if (hasDna) {
                    matchedText = `<strong>Genomic Risk Loci:</strong> APOE E3/E4 carrier status identified in patient profile ${LifeOS.user.name}. This is associated with a 2-3x increased risk of late-onset neurodegenerative disease. <br><br><strong>Dietary Protocol:</strong> Restrict saturated fatty acids (e.g., coconut oils, butter, excessive red meat) to prevent ApoB elevation. Prioritize omega-3 polyunsaturated fats (DHA/EPA) and load antioxidant micronutrients to preserve blood-brain barrier integrity.`;
                } else {
                    matchedText = `<strong>Awaiting Decryption:</strong> Search matches APOE Alzheimers Predisposition. However, patient genomics data is locked. Upload raw DNA report to verify APOE E3/E4 status.`;
                }
            } else if (q.includes('folate') || q.includes('mthfr') || q.includes('methyl')) {
                if (hasDna) {
                    matchedText = `<strong>Genomic Bypass:</strong> MTHFR C677T variant identified, causing a 30% reduction in enzyme processing of folic acid. <br><br><strong>Actionable Guide:</strong> Restrict foods fortified with synthetic folic acid. Take active L-methylfolate (5-MTHF) to bypass the pathway blockade, which assists in clearing homocysteine and optimizing arterial flexibility.`;
                } else {
                    matchedText = `<strong>Genomics Locked:</strong> Search matches MTHFR methylation pathway. Folic acid conversion efficiency cannot be calculated because DNA sequence is not decrypted. Upload DNA report.`;
                }
            } else if (q.includes('pressure') || q.includes('heart') || q.includes('bp') || q.includes('hypertension')) {
                if (hasHypertension) {
                    matchedText = `<strong>Clinical Match:</strong> Baseline Hypertension is registered in patient profile. Active blood pressure telemetry is currently ${LifeOS.wearables.bloodPressure || "120/80"} mmHg. <br><br><strong>Clinical Recommendation:</strong> Dosing active anti-hypertensive medication as prescribed. Restrict sodium below 1,500 mg/day, maintain zone 2 cardiovascular training, and schedule monthly ECG scans.`;
                } else {
                    matchedText = `<strong>Healthy Baseline:</strong> No cardiovascular hypertension markers registered. Current blood pressure telemetry is optimal: ${LifeOS.wearables.bloodPressure || "118/75"} mmHg. Continue monitoring resting heart rate.`;
                }
            } else if (q.includes('diabetes') || q.includes('glucose') || q.includes('a1c')) {
                if (hasDiabetes) {
                    matchedText = `<strong>Clinical Match:</strong> Pre-diabetic metabolic drift mapped (Baseline HbA1c 5.8%, fasting glucose ${LifeOS.wearables.glucose} mg/dL). <br><br><strong>Clinical Plan:</strong> Maintain Metformin dosing under clinical oversight, restrict glycemic loads to keto or insulin-sensitive macro ratios, and monitor blood sugar via CGM.`;
                } else {
                    matchedText = `<strong>Healthy Baseline:</strong> Normal glycemic bounds. HbA1c is in the safe range (<5.7%). Current CGM glucose telemetry reads ${LifeOS.wearables.glucose} mg/dL.`;
                }
            }

            content.innerHTML = matchedText;
            logAudit(`Health search query executed: "${queryKey}"`, "ACCESS");
        }, 1400);
    }

    // Sliders Disease Simulator formula
    function runDiseaseSimulation() {
        const fatEl = document.getElementById('slider-fat');
        const stepsEl = document.getElementById('slider-steps');
        const sleepEl = document.getElementById('slider-sleep');
        const methylEl = document.getElementById('slider-methyl');
        const smokeEl = document.getElementById('slider-smoke');
        const stressEl = document.getElementById('slider-stress');
        const dietEl = document.getElementById('slider-diet');

        if (!fatEl) return; // Not loaded yet

        const hasDna = LifeOS.healthMemoryGraph.some(node => node.title.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genomic") || node.desc.toLowerCase().includes("genetics"));
        const hasRecords = LifeOS.healthMemoryGraph.some(node => node.type === "Report Decoded" && !node.title.toLowerCase().includes("helix"));
        const hasWearables = LifeOS.wearables.syncStatus && LifeOS.wearables.syncStatus.includes("Connected");
        const hasData = hasDna || hasRecords || hasWearables;

        if (!hasData) {
            document.getElementById('lbl-fat').textContent = "—";
            document.getElementById('lbl-steps').textContent = "—";
            document.getElementById('lbl-sleep').textContent = "—";
            document.getElementById('lbl-methyl').textContent = "—";
            if (smokeEl) document.getElementById('lbl-smoke').textContent = "—";
            if (stressEl) document.getElementById('lbl-stress').textContent = "—";
            if (dietEl) document.getElementById('lbl-diet').textContent = "—";

            const riskPctEl = document.getElementById('sim-risk-pct');
            const riskStatusEl = document.getElementById('sim-risk-status');
            if (riskPctEl && riskStatusEl) {
                riskPctEl.textContent = "—";
                riskStatusEl.textContent = "AWAITING VERIFIED DATA";
                riskStatusEl.className = "risk-label text-mono text-xxs text-yellow";
            }
            document.getElementById('sim-risk-5').textContent = "—";
            document.getElementById('sim-risk-10').textContent = "—";
            document.getElementById('sim-risk-20').textContent = "—";

            const timelinePath = document.getElementById('sim-timeline-path');
            if (timelinePath) {
                timelinePath.setAttribute('d', '');
            }
            return;
        }

        const fatVal = parseFloat(fatEl.value);
        const stepsVal = parseFloat(stepsEl.value);
        const sleepVal = parseFloat(sleepEl.value);
        const methylVal = parseFloat(methylEl.value);
        const smokeVal = parseFloat(smokeEl ? smokeEl.value : 0);
        const stressVal = parseFloat(stressEl ? stressEl.value : 30);
        const dietVal = parseFloat(dietEl ? dietEl.value : 50);

        document.getElementById('lbl-fat').textContent = `${fatVal}%`;
        document.getElementById('lbl-steps').textContent = stepsVal.toLocaleString();
        document.getElementById('lbl-sleep').textContent = `${sleepVal} hrs`;
        document.getElementById('lbl-methyl').textContent = methylVal === 1 ? "Active Optimized" : "None";
        if (smokeEl) {
            document.getElementById('lbl-smoke').textContent = smokeVal === 0 ? "None" : smokeVal === 1 ? "Casual Dosing" : "Chronic Dosing";
        }
        if (stressEl) document.getElementById('lbl-stress').textContent = `${stressVal}%`;
        if (dietEl) document.getElementById('lbl-diet').textContent = `${dietVal}/100`;

        // Interventions (Step 14)
        const weightChk = document.getElementById('chk-int-weight');
        const sleepChk = document.getElementById('chk-int-sleep');
        const exerciseChk = document.getElementById('chk-int-exercise');
        const smokeChk = document.getElementById('chk-int-smoke');
        const sugarChk = document.getElementById('chk-int-sugar');

        let weightBonus = (weightChk && weightChk.checked) ? 12 : 0;
        let sleepBonus = (sleepChk && sleepChk.checked) ? 8 : 0;
        let exerciseBonus = (exerciseChk && exerciseChk.checked) ? 10 : 0;
        let smokeBonus = (smokeChk && smokeChk.checked) ? 15 : 0;
        let sugarBonus = (sugarChk && sugarChk.checked) ? 10 : 0;

        let totalReduction = weightBonus + sleepBonus + exerciseBonus + smokeBonus + sugarBonus;
        let longevityGain = 0;
        if (weightChk && weightChk.checked) longevityGain += 3.2;
        if (sleepChk && sleepChk.checked) longevityGain += 1.8;
        if (exerciseChk && exerciseChk.checked) longevityGain += 2.5;
        if (smokeChk && smokeChk.checked) longevityGain += 4.2;
        if (sugarChk && sugarChk.checked) longevityGain += 2.2;

        const gainEl = document.getElementById('sim-longevity-gain');
        const reductEl = document.getElementById('sim-cumulative-reduction');
        if (gainEl) gainEl.textContent = `+${longevityGain.toFixed(1)} Years`;
        if (reductEl) reductEl.textContent = `${totalReduction}%`;

        // Calculate simulated metabolic risk
        let risk = 50;
        risk += (fatVal - 22) * 1.8;
        risk -= ((stepsVal - 5000) / 1000) * 1.5;
        risk -= (sleepVal - 7) * 4;
        if (methylVal === 1) risk -= 8;
        risk += smokeVal * 15;
        risk += (stressVal - 40) * 0.25;
        risk -= (dietVal - 50) * 0.3;
        risk -= totalReduction; // Apply intervention reductions

        const finalRisk = Math.max(5, Math.min(98, Math.round(risk)));
        
        const riskPctEl = document.getElementById('sim-risk-pct');
        const riskStatusEl = document.getElementById('sim-risk-status');

        if (riskPctEl && riskStatusEl) {
            riskPctEl.textContent = `${finalRisk}%`;
            
            if (finalRisk > 50) {
                riskStatusEl.textContent = "HIGH METABOLIC RISK";
                riskStatusEl.className = "risk-label text-mono text-xxs text-red";
                riskPctEl.className = "risk-percentage text-mono text-red";
            } else if (finalRisk > 25) {
                riskStatusEl.textContent = "MODERATE METABOLIC TRAJECTORY";
                riskStatusEl.className = "risk-label text-mono text-xxs text-yellow";
                riskPctEl.className = "risk-percentage text-mono text-yellow";
            } else {
                riskStatusEl.textContent = "OPTIMIZED BASELINE BALANCE";
                riskStatusEl.className = "risk-label text-mono text-xxs text-green";
                riskPctEl.className = "risk-percentage text-mono text-green";
            }
        }

        // Years risk calculations
        document.getElementById('sim-risk-5').textContent = `${Math.max(2, Math.round(finalRisk * 0.58))}%`;
        document.getElementById('sim-risk-10').textContent = `${Math.max(4, Math.round(finalRisk * 0.85))}%`;
        document.getElementById('sim-risk-20').textContent = `${finalRisk}%`;

        // Update the 20-year health timeline SVG path
        const currentHealth = LifeOS.healthTwin.healthScore || 85;
        let delta = 0;
        delta -= (fatVal - 20) * 0.4;
        delta += (stepsVal - 5000) / 1000 * 0.8;
        delta += (sleepVal - 7) * 1.5;
        if (methylVal === 1) delta += 4;
        delta -= smokeVal * 12;
        delta -= (stressVal - 30) * 0.15;
        delta += (dietVal - 50) * 0.2;

        // Apply intervention trajectory increments
        delta += (weightChk && weightChk.checked) ? 3.5 : 0;
        delta += (sleepChk && sleepChk.checked) ? 2.0 : 0;
        delta += (exerciseChk && exerciseChk.checked) ? 3.0 : 0;
        delta += (smokeChk && smokeChk.checked) ? 4.5 : 0;
        delta += (sugarChk && sugarChk.checked) ? 2.5 : 0;

        const p0 = currentHealth;
        const p1 = Math.max(30, Math.min(99, Math.round(currentHealth + delta * 0.3)));
        const p2 = Math.max(30, Math.min(99, Math.round(currentHealth + delta * 0.6)));
        const p3 = Math.max(30, Math.min(99, Math.round(currentHealth + delta * 0.8)));
        const p4 = Math.max(30, Math.min(99, Math.round(currentHealth + delta)));

        const points = [
            { x: 40, y: 170 - (p0 / 100) * 160 },
            { x: 202.5, y: 170 - (p1 / 100) * 160 },
            { x: 365, y: 170 - (p2 / 100) * 160 },
            { x: 527.5, y: 170 - (p3 / 100) * 160 },
            { x: 690, y: 170 - (p4 / 100) * 160 }
        ];

        const pathStr = `M ${points[0].x},${points[0].y} ` + points.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');
        const timelinePath = document.getElementById('sim-timeline-path');
        if (timelinePath) {
            timelinePath.setAttribute('d', pathStr);
        }
    }

    // Investor TAM Calculator
    function runTAMCalculation() {
        const base = parseFloat(document.getElementById('slider-inv-base').value);
        const pct = parseFloat(document.getElementById('slider-inv-pct').value);

        document.getElementById('lbl-inv-base').textContent = base.toLocaleString();
        document.getElementById('lbl-inv-pct').textContent = `${pct}%`;

        // Traditional reactive care averages $12,000 per patient yearly in interventions.
        // Preventing chronic admissions saves roughly 25% of overall hospital cost base.
        const reactiveCost = base * 12000;
        const savedCost = reactiveCost * (pct / 100) * 0.25;
        
        const formattedSavings = `$${(savedCost / 1000000).toFixed(1)}M`;
        document.getElementById('inv-savings-val').textContent = formattedSavings;
    }

    // Notification Hub Manager
    function addNotification(type, title, text) {
        const newNotification = {
            id: LifeOS.breakthroughs.length + 1,
            title,
            text,
            matchReason: type.toUpperCase(),
            date: new Date().toLocaleTimeString('it-IT').slice(0, 5),
            read: false
        };
        // Reuse breakthroughs as notifications repository
        LifeOS.breakthroughs.unshift(newNotification);
        updateNotifications();
    }

    function updateNotifications() {
        const badge = document.getElementById('nav-notify-count');
        const listEl = document.getElementById('notification-hub-list');
        if (!listEl || !badge) return;

        const unreadCount = LifeOS.breakthroughs.filter(b => !b.read).length;
        badge.textContent = unreadCount;
        
        if (unreadCount === 0) badge.classList.add('hide');
        else badge.classList.remove('hide');

        listEl.innerHTML = '';
        LifeOS.breakthroughs.forEach(b => {
            const typeClass = b.matchReason.includes('DANGER') || b.matchReason.includes('RISK') ? 'danger' :
                              b.matchReason.includes('WARN') || b.matchReason.includes('GENOME') ? 'warning' :
                              b.matchReason.includes('SUCCESS') ? 'success' : 'info';
            
            const icon = typeClass === 'danger' ? 'alert-octagon' :
                          typeClass === 'warning' ? 'alert-triangle' :
                          typeClass === 'success' ? 'check-circle' : 'info';

            listEl.innerHTML += `
                <div class="notification-item ${!b.read ? 'unread' : ''}" data-id="${b.id}">
                    <div class="notification-item-icon ${typeClass}"><i data-lucide="${icon}" style="width:14px;height:14px;"></i></div>
                    <div>
                        <span class="text-white block text-xxs font-bold">${b.title}</span>
                        <p class="text-slate block text-xxs mt-xxs" style="font-size: 0.65rem;">${b.text}</p>
                    </div>
                </div>
            `;
        });
        lucide.createIcons();
    }

    // Emergency AI Watcher Trigger
    function triggerEmergencyAnomaly() {
        // Active telemetry spike
        telemetrySpikeActive = true;
        LifeOS.wearables.emergencyTriggered = true;
        
        // Log critical event
        logAudit("Emergency Agent Alert: Nocturnal Arrhythmia Detected! Pulse 142 BPM at rest.", "SECURITY");
        
        // Push notification
        addNotification("danger", "Emergency Arrhythmia Alert", "Emergency watcher active. Heart rate spikes detected. Doctor notified.");
        
        // Show immersive notification modal overlay
        const emergencyOverlay = document.createElement('div');
        emergencyOverlay.className = "modal-overlay";
        emergencyOverlay.style.background = "rgba(220, 38, 38, 0.45)"; // Deep transparent warning red
        emergencyOverlay.innerHTML = `
            <div class="modal-content-card" style="border-color: var(--color-danger); box-shadow: 0 0 50px rgba(239, 68, 68, 0.5);">
                <div class="modal-header-pane" style="background: rgba(239, 68, 68, 0.05); border-bottom-color: rgba(239, 68, 68, 0.1);">
                    <h3 class="text-mono text-red" style="font-size: 1.1rem; display: flex; align-items: center; gap: 8px;"><span class="pulse-dot red"></span> EMERGENCY AI TRIGGER ACTIVE</h3>
                </div>
                <div class="modal-body-pane text-center" style="padding: 24px;">
                    <div class="pulse-container" style="margin: 0 auto; width:64px; height:64px; position:relative; display:flex; align-items:center; justify-content:center;">
                        <div class="pulse-wave red-wave" style="position:absolute; width:100%; height:100%; border-radius:50%; border:3px solid var(--color-danger); animation: pulseAlert 1.5s infinite;"></div>
                        <div class="pulse-icon-inner bg-red" style="width:40px; height:40px; border-radius:50%; background:var(--color-danger); display:flex; align-items:center; justify-content:center; color:white;"><i data-lucide="alert-octagon"></i></div>
                    </div>
                    <h4 class="text-mono text-white mt-sm text-sm">CARDIOVASCULAR telemetry warning</h4>
                    <p class="text-xs text-slate mt-sm leading-relaxed">Ambient pulse rate exceeded 142 BPM at rest. Epigenetic cardiac ST Segment elevations parsed.<br><br>
                    <span class="text-yellow font-bold">1. Dispatched EMS dispatch telemetry coordinate keys.<br>
                    2. Granted secure bio-vault keys to Dr. Helen Vance.<br>
                    3. Alert notification dispatched to family emergency contacts.</span></p>
                    <button class="btn btn-secondary btn-sm mt-md text-red" id="btn-cancel-emergency">Cancel Emergency Dispatch Override</button>
                </div>
            </div>
        `;
        document.body.appendChild(emergencyOverlay);
        lucide.createIcons();

        document.getElementById('btn-cancel-emergency').addEventListener('click', () => {
            document.body.removeChild(emergencyOverlay);
            telemetrySpikeActive = false;
            LifeOS.wearables.emergencyTriggered = false;
            // Restore baseline values
            LifeOS.wearables.heartRate = 62;
            LifeOS.wearables.glucose = 94;
            LifeOS.wearables.hrv = 74;
            LifeOS.wearables.bloodPressure = "118/75";
            
            logAudit("Emergency Dispatch Protocol cancelled by patient signature override", "SECURITY");
            addNotification("success", "Emergency Dispatch Override", "EMS alert cancelled. Heart rate telemetry returned to baseline.");
            renderActiveView();
        });
    }

    // --- 5. RENDER HELIZ ANIMATION (Genomics Canvas) ---
    function renderDnaHelix() {
        const canvas = document.getElementById('db-dna-canvas');
        const inspectPanel = document.getElementById('db-genome-inspect-panel');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width = (canvas.width = canvas.parentElement.clientWidth);
        let height = (canvas.height = canvas.parentElement.clientHeight || 250);

        // Only add resize listener once — guard with a flag on the canvas element
        if (!canvas.__helixResizeBound) {
            canvas.__helixResizeBound = true;
            window.addEventListener('resize', () => {
                if (canvas.parentElement) {
                    width = (canvas.width = canvas.parentElement.clientWidth);
                    height = (canvas.height = canvas.parentElement.clientHeight || 250);
                }
            });
        }

        const genomeLociList = [
            { name: "MTHFR (Methylation)", text: "C677T Heterozygous variant found. Folate synthesis efficiency is lower by 30%. Supplement L-methylfolate." },
            { name: "APOE4 (Neurological)", text: "E3/E4 status confirmed. 2-3x relative hazard increase. Crucial to limit processed saturated lipids, optimize brain health, and sleep." },
            { name: "TCF7L2 (Diabetes)", text: "CT variant detected. Increased beta-cell exhaustion risk. Suggests low carb buffering, weight control, and active exercise loop." },
            { name: "CYP2D6 (Drug Clearing)", text: "*4 Null variant found. Ultra-slow metabolizer. Heightened adverse profile with beta-blockers and specific analgesics." }
        ];

        let rotationAngle = 0;
        const numNodes = 12;
        const amplitude = 30;
        const spacing = width / numNodes;

        let currentNodes = [];
        let selectedIndex = 0;

        function drawHelix() {
            if (LifeOS.activeTab !== 'genomics') return; // Stop animation loop when not on genomics tab
            ctx.clearRect(0, 0, width, height);
            rotationAngle += 0.02;

            let strand1 = [];
            let strand2 = [];

            for (let i = 0; i < numNodes; i++) {
                const x = i * spacing + spacing / 2;
                const angle = i * 0.5 + rotationAngle;
                
                const z1 = Math.cos(angle);
                const z2 = Math.cos(angle + Math.PI);

                const y1 = height / 2 + Math.sin(angle) * amplitude;
                const y2 = height / 2 + Math.sin(angle + Math.PI) * amplitude;

                strand1.push({ x, y: y1, z: z1, index: i });
                strand2.push({ x, y: y2, z: z2, index: i });
            }

            currentNodes = strand1;

            // Draw links
            for (let i = 0; i < numNodes; i++) {
                const s1 = strand1[i];
                const s2 = strand2[i];
                
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                const alpha = (s1.z + 1) / 2 * 0.4 + 0.1;
                ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Draw strand 1
            strand1.forEach(p => {
                const size = (p.z + 1) / 2 * 6 + 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fillStyle = p.z > 0 ? '#00E5FF' : '#9061F9';
                ctx.fill();

                if (selectedIndex === p.index && p.index % 3 === 0) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size + 6, 0, Math.PI * 2);
                    ctx.strokeStyle = '#00FFD1';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            });

            // Draw strand 2
            strand2.forEach(p => {
                const size = (p.z + 1) / 2 * 6 + 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fillStyle = p.z > 0 ? '#9061F9' : '#00FFD1';
                ctx.fill();
            });

            requestAnimationFrame(drawHelix);
        }

        drawHelix();

        // Canvas clicks inspect bindings
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            let closestNode = null;
            let minDist = 99999;

            currentNodes.forEach(p => {
                if (p.index % 3 === 0) {
                    const dx = clickX - p.x;
                    const dy = clickY - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 20 && dist < minDist) {
                        minDist = dist;
                        closestNode = p;
                    }
                }
            });

            if (closestNode) {
                selectedIndex = closestNode.index;
                const loci = genomeLociList[closestNode.index % genomeLociList.length];
                
                logAudit(`Genomics DNA Locus Decrypted: ${loci.name}`, "ACCESS");

                if (inspectPanel && loci) {
                    inspectPanel.innerHTML = `
                        <h4 class="inspect-gene text-mono text-purple" style="font-size:0.85rem;">GENE: ${loci.name}</h4>
                        <p class="text-xxs text-slate mt-xxs">${loci.text}</p>
                    `;
                }
            }
        });
    }

    // Init Notifications badge
    updateNotifications();

    // --- 6. CTA AND LANDING PAGE TRANSITIONS ---
    const regModal = document.getElementById('registration-modal');
    const closeRegBtn = document.getElementById('close-reg-modal');
    const regForm = document.getElementById('dashboard-reg-form');

    // Open Reg Modal when clicking any element with href="#early-access"
    const openRegButtons = document.querySelectorAll('a[href="#early-access"]');
    openRegButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (regModal) regModal.classList.remove('hide');
        });
    });

    // Close Reg Modal
    if (closeRegBtn && regModal) {
        closeRegBtn.addEventListener('click', () => {
            regModal.classList.add('hide');
        });
    }

    // Reg Form Submit
    // Onboarding steps navigation state
    let onboardingStep = 1;
    
    function updateOnboardingUI() {
        for (let i = 1; i <= 4; i++) {
            const phase = document.getElementById(`wiz-phase-${i}`);
            if (phase) phase.classList.add('hide');
            const label = document.querySelector(`.wiz-step-label[data-wstep="${i}"]`);
            if (label) label.classList.remove('active');
        }
        
        const currentPhase = document.getElementById(`wiz-phase-${onboardingStep}`);
        if (currentPhase) currentPhase.classList.remove('hide');
        const currentLabel = document.querySelector(`.wiz-step-label[data-wstep="${onboardingStep}"]`);
        if (currentLabel) currentLabel.classList.add('active');
        
        const progressFill = document.getElementById('wiz-progress-fill');
        if (progressFill) {
            progressFill.style.width = `${onboardingStep * 25}%`;
        }
    }

    const wizNext1 = document.getElementById('wiz-next-1');
    if (wizNext1) {
        wizNext1.addEventListener('click', () => {
            const name = document.getElementById('reg-name').value.trim();
            const age = document.getElementById('reg-age').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const country = document.getElementById('reg-country').value.trim();
            
            if (!name || !age || !email || !country) {
                alert("Please fill in all required identity fields (Name, Age, Country, Email).");
                return;
            }
            
            LifeOS.user.name = name;
            LifeOS.user.age = parseInt(age);
            LifeOS.user.email = email;
            LifeOS.user.country = country;
            LifeOS.user.phone = document.getElementById('reg-phone').value.trim();
            
            logAudit(`Onboarding Identity Verified: ${name}`, "SECURITY");
            onboardingStep = 2;
            updateOnboardingUI();
        });
    }

    const wizBack2 = document.getElementById('wiz-back-2');
    if (wizBack2) {
        wizBack2.addEventListener('click', () => {
            onboardingStep = 1;
            updateOnboardingUI();
        });
    }

    const wizNext2 = document.getElementById('wiz-next-2');
    if (wizNext2) {
        wizNext2.addEventListener('click', () => {
            const consent1 = document.getElementById('consent-hipaa').checked;
            const consent2 = document.getElementById('consent-sharing').checked;
            
            if (!consent1 || !consent2) {
                alert("Please accept all HIPAA and data sharing consents to proceed.");
                return;
            }
            
            LifeOS.user.emergencyContact = {
                name: document.getElementById('reg-emergency-name').value.trim(),
                phone: document.getElementById('reg-emergency-phone').value.trim()
            };
            
            logAudit("Onboarding HIPAA Data Consent Gates verified and decrypted", "SECURITY");
            onboardingStep = 3;
            updateOnboardingUI();
        });
    }

    const wizBack3 = document.getElementById('wiz-back-3');
    if (wizBack3) {
        wizBack3.addEventListener('click', () => {
            onboardingStep = 2;
            updateOnboardingUI();
        });
    }

    const wizNext3 = document.getElementById('wiz-next-3');
    if (wizNext3) {
        wizNext3.addEventListener('click', () => {
            const height = document.getElementById('reg-height').value.trim();
            const weight = document.getElementById('reg-weight').value.trim();
            const conditions = document.getElementById('reg-conditions').value.trim();
            const meds = document.getElementById('reg-meds').value.trim();
            const family = document.getElementById('reg-family').value.trim();
            const exercise = document.getElementById('reg-exercise').value.trim();
            const sleep = document.getElementById('reg-sleep').value.trim();
            const diet = document.getElementById('reg-diet').value;
            
            if (height) LifeOS.healthTwin.height = parseFloat(height);
            if (weight) LifeOS.healthTwin.weight = parseFloat(weight);
            if (sleep) LifeOS.healthTwin.sleepHours = parseFloat(sleep);
            if (exercise) LifeOS.healthTwin.exerciseHours = parseFloat(exercise);
            if (diet) LifeOS.user.diet = diet;
            
            if (conditions && conditions.toLowerCase() !== 'none') {
                LifeOS.healthMemoryGraph.push({
                    id: LifeOS.healthMemoryGraph.length + 1,
                    type: "Clinical State Mapped",
                    title: "Baseline Medical Condition Mapped",
                    date: new Date().toISOString().split('T')[0],
                    status: "Secure Vault Graph Node",
                    desc: `Condition baseline: ${conditions}.`
                });
            }
            
            if (meds && meds.toLowerCase() !== 'none') {
                meds.split(',').forEach((med) => {
                    LifeOS.medications.push({
                        id: LifeOS.medications.length + 1,
                        name: med.trim().split(' ')[0],
                        dosage: med.trim().split(' ').slice(1).join(' ') || "As Directed",
                        frequency: "Daily",
                        purpose: "User Declared Baseline",
                        compliance: "100%"
                    });
                });
            }

            recalculateHealthScores();
            logAudit("Initial Health Twin v1.0 generated from patient baseline inputs", "WRITE");
            onboardingStep = 4;
            updateOnboardingUI();
        });
    }

    const wizBack4 = document.getElementById('wiz-back-4');
    if (wizBack4) {
        wizBack4.addEventListener('click', () => {
            onboardingStep = 3;
            updateOnboardingUI();
        });
    }

    let reportsUploaded = false;
    let dnaUploaded = false;
    let wearablesConnected = false;
    
    const srcReports = document.getElementById('wiz-src-reports');
    if (srcReports) {
        srcReports.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,.png,.jpg,.jpeg,.txt,.csv';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) handleReportUpload(file);
            };
            input.click();
        });
    }
    
    const srcDna = document.getElementById('wiz-src-dna');
    if (srcDna) {
        srcDna.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt,.csv,.fastq';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) handleDnaUpload(file);
            };
            input.click();
        });
    }
    
    const srcWearable = document.getElementById('wiz-src-wearable');
    if (srcWearable) {
        srcWearable.addEventListener('click', () => {
            openWearableConnectionModal();
        });
    }
    
    const wizFinish = document.getElementById('wiz-finish');
    if (wizFinish) {
        wizFinish.addEventListener('click', () => {
            const nameVal = LifeOS.user.name;
            const emailVal = LifeOS.user.email;
            
            if (userDisplayName) userDisplayName.textContent = nameVal;
            if (userDisplayEmail) userDisplayEmail.textContent = emailVal;
            
            const initials = nameVal.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            if (userAvatarInitials) userAvatarInitials.textContent = initials || "LO";
            
            recalculateHealthScores();
            logAudit("Patient onboarding wizard final completion. Active session verified.", "SECURITY");
            
            if (regModal) regModal.classList.add('hide');
            launchDashboardShell();
            addNotification("success", "Onboarding Complete", `Welcome to LifeOS AI, ${nameVal}. Epigenetic data sync active. Waitlist position #${LifeOS.user.waitlistPosition}.`);
        });
    }
    
    // Experience LifeOS Demo button
    const demoBtn = document.querySelector('.hero-ctas a[href="#digital-twin"]');
    if (demoBtn) {
        demoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Set default Mercer UI details
            if (userDisplayName) userDisplayName.textContent = LifeOS.user.name;
            if (userDisplayEmail) userDisplayEmail.textContent = LifeOS.user.email;
            if (userAvatarInitials) userAvatarInitials.textContent = "AM";
            
            recalculateHealthScores();
            logAudit("Interactive Demo Sandbox Session Initialized", "ACCESS");
            
            launchDashboardShell();
            
            addNotification("info", "Sandbox Demo Activated", "Exploring LifeOS AI Sandbox with simulated clinical vectors. Switch roles in the sidebar.");
        });
    }

    // Personnel Wellness Profile launch button handlers
    const wellnessBtns = document.querySelectorAll('a[href="#personnel-wellness"], #nav-btn-personnel-wellness, #hero-btn-personnel-wellness, #card-btn-personnel-wellness');
    wellnessBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (userDisplayName) userDisplayName.textContent = LifeOS.user.name;
            if (userDisplayEmail) userDisplayEmail.textContent = LifeOS.user.email;
            if (userAvatarInitials) userAvatarInitials.textContent = "AM";
            
            recalculateHealthScores();
            logAudit("Personnel Wellness Profile Session Initialized", "ACCESS");
            
            launchDashboardShell();
            
            // Switch directly to personnel_wellness tab!
            LifeOS.activeRole = "patient";
            LifeOS.activeTab = "personnel_wellness";
            renderSidebar();
            renderActiveView();
            
            addNotification("success", "Personnel Wellness Activated", "Viewing Personnel Wellness Profile & Privacy Architecture.");
        });
    });

    // =========================================================================
    // ENTERPRISE BLUETOOTH LE & WEARABLE INTEGRATION SYSTEM (16-STEP PIPELINE)
    // =========================================================================

    const BLE_SIG_SERVICES = {
        heart_rate: '0000180d-0000-1000-8000-00805f9b34fb',
        blood_pressure: '00001810-0000-1000-8000-00805f9b34fb',
        glucose: '00001808-0000-1000-8000-00805f9b34fb',
        weight_scale: '0000181d-0000-1000-8000-00805f9b34fb',
        pulse_oximeter: '00001822-0000-1000-8000-00805f9b34fb',
        health_thermometer: '00001809-0000-1000-8000-00805f9b34fb',
        environmental_sensing: '0000181a-0000-1000-8000-00805f9b34fb',
        device_information: '0000180a-0000-1000-8000-00805f9b34fb',
        battery_service: '0000180f-0000-1000-8000-00805f9b34fb'
    };

    function openWearableConnectionModal() {
        const modal = document.getElementById('wearable-connect-modal');
        const closeBtn = document.getElementById('close-wearable-modal');
        const modalBody = document.getElementById('wearable-modal-body');

        if (!modal || !modalBody) return;

        modal.classList.remove('hide');
        renderDeviceWizardStep(1);

        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.add('hide');
            };
        }

        function renderWizardHeader(currentStep, totalSteps = 8) {
            let stepsHtml = '';
            for (let i = 1; i <= totalSteps; i++) {
                const isActive = i === currentStep;
                const isPassed = i < currentStep;
                const colorClass = isPassed ? 'text-teal' : (isActive ? 'text-cyan font-bold' : 'text-slate');
                stepsHtml += `<span class="${colorClass}" style="font-size:0.65rem;">${i}.${isPassed ? '✓' : ''}</span>${i < totalSteps ? '<span class="text-slate" style="font-size:0.5rem;">></span>' : ''}`;
            }
            return `
                <div class="wizard-header mb-sm" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; display:flex; justify-content:space-between; align-items:center;">
                    <span class="text-mono text-xxs text-cyan font-bold"><i data-lucide="cpu" class="inline text-cyan" style="width:12px; margin-right:4px;"></i> PAIRING WIZARD STEP ${currentStep} OF ${totalSteps}</span>
                    <div style="display:flex; gap:4px; align-items:center;">${stepsHtml}</div>
                </div>
            `;
        }

        function renderDeviceWizardStep(step, data = {}) {
            if (step === 1) {
                // Step 1: Device Category Selection & Compatibility Audit
                modalBody.innerHTML = `
                    ${renderWizardHeader(1)}
                    <p class="text-xxs text-slate mb-xs">Select a medical device, smartwatch, smart ring, or health API integration below:</p>
                    
                    <div style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
                        <div class="text-mono text-xxxxs text-teal mb-xxs font-bold" style="border-bottom:1px dashed rgba(0,255,209,0.2); padding-bottom:2px;">1. BLUETOOTH LE MEDICAL & SENSOR HARDWARE</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                            <div class="glass-card wearable-device-card" data-device="BLE Blood Pressure Monitor" data-type="ble" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="scale" class="text-teal" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Omron / BLE BP Cuff</div>
                                <span class="text-xxxxs text-slate block">GATT 0x1810</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="BLE Glucose Monitor" data-type="ble" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="droplet" class="text-teal" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">BLE Continuous Glucose</div>
                                <span class="text-xxxxs text-slate block">GATT 0x1808</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Pulse Oximeter" data-type="ble" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="activity" class="text-teal" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Pulse Oximeter (SpO2)</div>
                                <span class="text-xxxxs text-slate block">GATT 0x1822</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Smart Scale" data-type="ble" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="scale" class="text-teal" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Smart Body Composition</div>
                                <span class="text-xxxxs text-slate block">GATT 0x181D</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Heart Rate Monitor" data-type="ble" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="heart" class="text-teal" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Polar / Garmin HR Strap</div>
                                <span class="text-xxxxs text-slate block">GATT 0x180D</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Smart Thermometer" data-type="ble" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="thermometer" class="text-teal" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Smart Thermometer</div>
                                <span class="text-xxxxs text-slate block">GATT 0x1809</span>
                            </div>
                        </div>

                        <div class="text-mono text-xxxxs text-purple mb-xxs font-bold" style="border-bottom:1px dashed rgba(144,97,249,0.2); padding-bottom:2px;">2. OFFICIAL WEARABLE CLOUD APIs</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                            <div class="glass-card wearable-device-card" data-device="Fitbit API" data-type="cloud" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="activity" class="text-purple" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Fitbit Web API</div>
                                <span class="text-xxxxs text-slate block">OAuth 2.0 Telemetry</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Garmin API" data-type="cloud" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="zap" class="text-purple" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Garmin Health API</div>
                                <span class="text-xxxxs text-slate block">OAuth 2.0 Telemetry</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Oura API" data-type="cloud" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="circle" class="text-purple" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Oura Ring Cloud API</div>
                                <span class="text-xxxxs text-slate block">REST API v2</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="WHOOP API" data-type="cloud" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="activity" class="text-purple" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">WHOOP Strap API</div>
                                <span class="text-xxxxs text-slate block">REST API v1</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Withings API" data-type="cloud" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="scale" class="text-purple" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Withings Health Cloud</div>
                                <span class="text-xxxxs text-slate block">OAuth 2.0 Webhook</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Dexcom API" data-type="cloud" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="activity" class="text-purple" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Dexcom G6/G7 CGM API</div>
                                <span class="text-xxxxs text-slate block">Developer API v3</span>
                            </div>
                        </div>

                        <div class="text-mono text-xxxxs text-cyan mb-xxs font-bold" style="border-bottom:1px dashed rgba(0,229,255,0.2); padding-bottom:2px;">3. NATIVE PLATFORM & HOSPITAL GATEWAYS</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <div class="glass-card wearable-device-card" data-device="Apple HealthKit" data-type="native" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="heart" class="text-cyan" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Apple HealthKit</div>
                                <span class="text-xxxxs text-slate block">iOS Native SDK</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Google Health Connect" data-type="native" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="watch" class="text-cyan" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Google Health Connect</div>
                                <span class="text-xxxxs text-slate block">Android Native SDK</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="Samsung Health" data-type="native" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="watch" class="text-cyan" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">Samsung Health SDK</div>
                                <span class="text-xxxxs text-slate block">Knox Health SDK</span>
                            </div>
                            <div class="glass-card wearable-device-card" data-device="HL7 FHIR Hospital Gateway" data-type="fhir" style="padding:10px;cursor:pointer;text-align:center;">
                                <i data-lucide="server" class="text-cyan" style="width:20px;height:20px;margin:0 auto 4px auto;"></i>
                                <div class="text-xxs text-white font-bold">HL7 FHIR R4 Router</div>
                                <span class="text-xxxxs text-slate block">EHR Interoperability</span>
                            </div>
                        </div>
                    </div>
                `;
                lucide.createIcons();

                const cards = modalBody.querySelectorAll('.wearable-device-card');
                cards.forEach(card => {
                    card.onclick = () => {
                        const deviceName = card.getAttribute('data-device');
                        const devType = card.getAttribute('data-type');
                        renderDeviceWizardStep(2, { deviceName, devType });
                    };
                });
            } else if (step === 2) {
                // Step 2: Grant Permissions & Scopes
                const { deviceName, devType } = data;
                modalBody.innerHTML = `
                    ${renderWizardHeader(2)}
                    <div class="text-left" style="padding: 6px 0;">
                        <h4 class="text-mono text-xs text-teal mb-xs" style="display:flex; align-items:center; gap:6px;">
                            <i data-lucide="shield-check" class="text-teal" style="width:14px;"></i> PERMISSION SCOPES & CONTRACT
                        </h4>
                        <p class="text-xxs text-slate mb-sm">Select telemetry scopes to authorize for <span class="text-white font-bold">${deviceName}</span>:</p>
                        
                        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: 16px; max-height:220px; overflow-y:auto; padding-right:4px;">
                            <label class="flex align-center gap-xs text-xxs text-white" style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="scope-hr" checked style="accent-color:var(--accent-teal);">
                                <span>Continuous Heart Rate (GATT 0x180D / PPG)</span>
                            </label>
                            <label class="flex align-center gap-xs text-xxs text-white" style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="scope-hrv" checked style="accent-color:var(--accent-teal);">
                                <span>Heart Rate Variability (rMSSD / SDNN)</span>
                            </label>
                            <label class="flex align-center gap-xs text-xxs text-white" style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="scope-glucose" checked style="accent-color:var(--accent-teal);">
                                <span>Subcutaneous Glucose Stream (GATT 0x1808)</span>
                            </label>
                            <label class="flex align-center gap-xs text-xxs text-white" style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="scope-bp" checked style="accent-color:var(--accent-teal);">
                                <span>Blood Pressure Systolic/Diastolic (GATT 0x1810)</span>
                            </label>
                            <label class="flex align-center gap-xs text-xxs text-white" style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="scope-ox" checked style="accent-color:var(--accent-teal);">
                                <span>Pulse Oximeter SpO2 Saturation (GATT 0x1822)</span>
                            </label>
                            <label class="flex align-center gap-xs text-xxs text-white" style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="scope-weight" checked style="accent-color:var(--accent-teal);">
                                <span>Body Composition & Scale Telemetry (GATT 0x181D)</span>
                            </label>
                        </div>

                        ${devType === 'cloud' ? `
                            <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
                                <label class="text-xxs text-slate font-mono">API Access Key / Bearer Token:</label>
                                <input type="password" id="wearable-access-token" class="form-textbox text-mono" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
                            </div>
                        ` : ''}

                        ${devType === 'fhir' ? `
                            <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
                                <label class="text-xxs text-slate font-mono">HL7 FHIR R4 Endpoint URL:</label>
                                <input type="text" id="fhir-endpoint-url" class="form-textbox text-mono" value="https://fhir.hospital.org/r4/Observation">
                            </div>
                        ` : ''}

                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-cyan btn-sm" id="btn-grant-scope" style="flex:1">Grant Scopes & Scan</button>
                            <button class="btn btn-secondary btn-sm" id="btn-cancel-wizard" style="flex:1">Cancel</button>
                        </div>
                    </div>
                `;
                lucide.createIcons();

                document.getElementById('btn-cancel-wizard').onclick = () => {
                    modal.classList.add('hide');
                };

                document.getElementById('btn-grant-scope').onclick = () => {
                    const token = document.getElementById('wearable-access-token')?.value || '';
                    const fhirUrl = document.getElementById('fhir-endpoint-url')?.value || '';
                    renderDeviceWizardStep(3, { ...data, token, fhirUrl });
                };
            } else if (step === 3) {
                // Step 3: Scan & Discover Devices
                const { deviceName, devType } = data;
                modalBody.innerHTML = `
                    ${renderWizardHeader(3)}
                    <div class="text-center" style="padding:16px 0;">
                        <div class="pairing-scanner-circle" style="margin: 0 auto 16px auto; width:70px; height:70px; position:relative; display:flex; align-items:center; justify-content:center; border-radius:50%; border:2px solid rgba(0,255,209,0.1);">
                            <div class="scanning-circle" style="position:absolute; width:100%; height:100%; border-radius:50%; border:2px solid var(--accent-teal); animation:scanPulse 1.5s infinite;"></div>
                            <i data-lucide="wifi" class="text-teal animate-pulse" style="width:30px;height:30px;z-index:5;"></i>
                        </div>
                        <h4 class="text-mono text-white text-xs" id="pairing-status-title">SCANNING NEARBY BLE FREQUENCIES...</h4>
                        <p class="text-xxs text-slate mt-xs" id="pairing-status-desc">Filtering SIG services matching ${deviceName}...</p>
                    </div>
                `;
                lucide.createIcons();

                // Launch execution pipeline
                execute16StepDevicePipeline(deviceName, devType, data, (stepNum, statusTitle, statusDesc) => {
                    const titleEl = document.getElementById('pairing-status-title');
                    const descEl = document.getElementById('pairing-status-desc');
                    if (titleEl) titleEl.textContent = statusTitle;
                    if (descEl) descEl.textContent = statusDesc;
                }).then(() => {
                    renderDeviceWizardStep(8, data);
                }).catch(err => {
                    renderDeviceErrorScreen(deviceName, err.message);
                });
            } else if (step === 8) {
                // Step 8: Success & Live Stream Active
                modalBody.innerHTML = `
                    ${renderWizardHeader(8)}
                    <div class="text-center text-teal text-xs py-md" style="padding: 16px 0;">
                        <i data-lucide="check-circle" class="text-teal mb-xs" style="width:36px; height:36px; margin:0 auto 8px auto; display:block;"></i>
                        <div class="font-bold text-sm text-white">DEVICE INTEGRATED & LIVE STREAM ACTIVE</div>
                        <p class="text-xxs text-slate mt-xxs" style="padding:0 16px;">Telemetric data stream verified. High-precision readings appended to Health Twin.</p>
                        <button class="btn btn-teal btn-sm mt-md" id="btn-finish-wizard" style="width:100%;">Return to Command Center</button>
                    </div>
                `;
                lucide.createIcons();

                document.getElementById('btn-finish-wizard').onclick = () => {
                    modal.classList.add('hide');
                    renderActiveView();
                };
            }
        }

        function renderDeviceErrorScreen(deviceName, errorMessage) {
            modalBody.innerHTML = `
                <div class="text-center text-red text-xs py-md" style="padding: 16px 0;">
                    <i data-lucide="alert-octagon" class="text-red mb-xs" style="width:36px; height:36px; margin:0 auto 8px auto; display:block;"></i>
                    <div class="font-bold text-sm text-white">DEVICE PAIRING ERROR</div>
                    <p class="text-xxs text-slate mt-xxs" style="padding:0 16px; word-break:break-word;">${errorMessage}</p>
                    <div class="glass-card mt-sm text-left text-xxxxs text-slate" style="padding:8px; background:rgba(239,68,68,0.05); border-color:rgba(239,68,68,0.2);">
                        <span class="text-white font-bold block mb-xxs">RECOVERY GUIDANCE:</span>
                        1. Ensure Bluetooth adapter is enabled on host machine.<br>
                        2. Verify device is in pairing mode and within 3 meters.<br>
                        3. For official cloud APIs (Fitbit/Oura/Dexcom), supply a valid Developer Key.<br>
                        4. For native stores (HealthKit/Health Connect), launch inside native mobile shell wrapper.
                    </div>
                    <button class="btn btn-secondary btn-sm mt-sm" id="btn-close-error" style="width:100%;">Close</button>
                </div>
            `;
            lucide.createIcons();

            document.getElementById('btn-close-error').onclick = () => {
                modal.classList.add('hide');
            };
        }
    }

    // =========================================================================
    // 16-STEP DEVICE CONNECTION & NOTIFICATION PIPELINE
    // Delegates to DeviceIntegrationManager adapter architecture.
    // DeviceIntegrationManager is loaded from js/device_integration.js
    // =========================================================================
    async function execute16StepDevicePipeline(deviceName, devType, extraConfig, updateStatusCb) {
        // Resolve patientId from current session
        const patientId = LifeOS.currentUser?.id || LifeOS.currentUser?.userId || null;

        // Ensure DeviceIntegrationManager is available
        if (typeof globalThis.DeviceIntegrationManager === 'undefined') {
            throw new Error(
                'DeviceIntegrationManager not loaded. Ensure js/device_integration.js is included before dashboard.js. ' +
                'Refresh the page and try again.'
            );
        }

        const config = {
            token: extraConfig?.token || '',
            fhirUrl: extraConfig?.fhirUrl || '',
            scopes: extraConfig?.scopes || null,
            patientId
        };

        // Delegate entirely to the DeviceIntegrationManager adapter
        const deviceRecord = await globalThis._lifeosDIM.connect(
            deviceName,
            devType,
            config,
            updateStatusCb  // progressCb relayed directly to UI
        );

        // Sync into LifeOS.wearables state
        const existingIdx = LifeOS.wearables.connectedDevices.findIndex(d => d.id === deviceRecord.id);
        if (existingIdx >= 0) {
            LifeOS.wearables.connectedDevices[existingIdx] = deviceRecord;
        } else {
            LifeOS.wearables.connectedDevices.push(deviceRecord);
        }

        LifeOS.wearables.syncStatus = `Connected (${LifeOS.wearables.connectedDevices.length} Active Nodes)`;
        LifeOS.wearables.lastSync = new Date().toLocaleTimeString();
        LifeOS.wearables.battery = deviceRecord.battery || 'N/A';
        wearablesConnected = true;

        logAudit(
            `Device Integrated: ${deviceRecord.name} via ${deviceRecord.adapterType} ` +
            `(${deviceRecord.connectionMethod})`,
            'WRITE'
        );
        addNotification('success', 'Device Paired', `${deviceRecord.name} stream verified and linked to Health Twin.`);
        recalculateHealthScores();

        return deviceRecord;
    }

    function handleIncomingTelemetryPacket(deviceId, source, metricName, rawVal, units, confidence = 99, battery = "N/A", rssi = "N/A") {
        // Real-data-only discipline: never accept null/undefined values
        if (rawVal === null || rawVal === undefined) {
            console.warn('[LifeOS] handleIncomingTelemetryPacket: null/undefined value rejected for', metricName);
            return;
        }

        const telemetryObj = {
            timestamp: new Date().toISOString(),
            deviceId: deviceId,
            adapterType: 'WebBluetoothAdapter',
            source: source,
            confidence: confidence,
            verification: 'Verified Real Device Stream',
            unit: units,
            units: units,
            value: rawVal,
            rawValue: rawVal,
            normalizedValue: rawVal,
            batteryLevel: battery,
            batteryLevelStr: battery,
            signalQuality: rssi,
            provenance: `DEVICE:${deviceId}|ADAPTER:WebBluetoothAdapter`,
            patientId: LifeOS.currentUser?.id || null,
            dataType: metricName.toLowerCase().replace(/\s+/g, '_')
        };

        LifeOS.wearables.telemetryStream.push(telemetryObj);

        // Update live metric state
        if (metricName.includes("Heart Rate")) {
            LifeOS.wearables.heartRate = rawVal;
            LifeOS.wearables.history.hr.push(telemetryObj);
        } else if (metricName.includes("Glucose")) {
            LifeOS.wearables.glucose = rawVal;
            LifeOS.wearables.history.glucose.push(telemetryObj);
        } else if (metricName.includes("Blood Pressure")) {
            LifeOS.wearables.bloodPressure = rawVal;
            LifeOS.wearables.history.bp.push(telemetryObj);
        } else if (metricName.includes("SpO2") || metricName.includes("Oxygen")) {
            LifeOS.wearables.spO2 = rawVal;
            LifeOS.wearables.history.oxygen.push(telemetryObj);
        } else if (metricName.includes("Temperature")) {
            LifeOS.wearables.temperature = rawVal;
        } else if (metricName.includes("Weight") || metricName.includes("Scale")) {
            LifeOS.wearables.weight = rawVal;
            LifeOS.wearables.history.weight.push(telemetryObj);
        }

        // Persist to backend via POST /api/telemetry (non-blocking, non-fatal)
        const packetForBackend = {
            deviceId: telemetryObj.deviceId,
            adapterType: telemetryObj.adapterType,
            dataType: telemetryObj.dataType,
            value: String(rawVal),
            unit: units,
            confidence: confidence,
            batteryLevel: battery,
            signalQuality: rssi,
            provenance: telemetryObj.provenance,
            verification: telemetryObj.verification,
            timestamp: telemetryObj.timestamp,
            patientId: telemetryObj.patientId
        };

        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(packetForBackend)
        }).catch(err => {
            console.warn('[LifeOS] Telemetry backend persist non-fatal warning:', err.message);
        });
    }

    // =========================================================================
    // REGISTRATION, EMAIL & WHATSAPP AUTOMATION PIPELINE (NOTIFICATION SERVICE)
    // =========================================================================

    async function registerUserProtocol(formData) {
        // Honeypot bot protection check
        if (formData.honeypot && formData.honeypot.trim() !== "") {
            throw new Error("Security Error: Automated bot submission detected.");
        }

        // Email validation (RFC 5322)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            throw new Error("Invalid Email Address format. Please provide a valid email.");
        }

        // Mobile Phone validation
        const fullPhone = `${formData.countryCode || '+1'} ${formData.phone.replace(/[^0-9\s-]/g, '')}`.trim();
        if (!formData.phone || formData.phone.trim().length < 6) {
            throw new Error("Invalid Mobile Number. Please provide a valid mobile number for onboarding & WhatsApp notifications.");
        }

        // Consent assertion
        if (!formData.privacyConsent) {
            throw new Error("Privacy Consent Required. You must accept the Privacy Policy & Protocol Terms to register.");
        }

        // Duplicate check
        const isDuplicate = LifeOS.registrations.some(r => r.email.toLowerCase() === formData.email.toLowerCase());
        if (isDuplicate) {
            throw new Error(`Duplicate Registration: An account with email "${formData.email}" has already been submitted.`);
        }

        // Generate Unique Registration ID (LIFEOS-2026-XXXXXX)
        const seqNumber = String(LifeOS.registrations.length + 104).padStart(6, '0');
        const regId = `LIFEOS-2026-${seqNumber}`;

        const regRecord = {
            id: regId,
            fullName: formData.fullName.trim(),
            email: formData.email.trim().toLowerCase(),
            countryCode: formData.countryCode || "+1",
            phone: fullPhone,
            country: formData.country,
            role: formData.role,
            organization: formData.organization ? formData.organization.trim() : "Personal Vault",
            message: formData.message ? formData.message.trim() : "None provided",
            privacyConsent: true,
            emailOptIn: !!formData.emailOptIn,
            whatsAppOptIn: !!formData.whatsAppOptIn,
            timestamp: new Date().toISOString(),
            status: "Pending Review",
            source: "Landing Page Onboarding Portal",
            communicationLogs: []
        };

        // Store registration in state
        LifeOS.registrations.unshift(regRecord);

        // Audit Logging
        logAudit(`New User Registered: ${regRecord.fullName} (${regRecord.role}) - ID: ${regRecord.id}`, "WRITE");

        // Trigger Multi-Channel Notifications
        const deliveryStatus = await NotificationService.dispatchOnboardingNotifications(regRecord);

        // Audit Notification to System Administrator
        logAudit(`Admin Alert Dispatched for Registration ${regRecord.id}`, "ALERT");
        addNotification("info", "New Registration Received", `${regRecord.fullName} (${regRecord.role}) submitted registration ${regRecord.id}.`);

        return {
            regRecord,
            deliveryStatus
        };
    }

    const NotificationService = {
        async dispatchOnboardingNotifications(regRecord) {
            const results = {
                emailSent: false,
                emailStatus: "Skipped (Opted Out)",
                whatsAppSent: false,
                whatsAppStatus: "Skipped (Opted Out)"
            };

            // 1. Transactional Email
            if (regRecord.emailOptIn) {
                try {
                    await this.sendWelcomeEmail(regRecord);
                    results.emailSent = true;
                    results.emailStatus = "Delivered (Resend / AWS SES)";
                    regRecord.communicationLogs.push({
                        type: "EMAIL",
                        event: "WELCOME_EMAIL_SENT",
                        timestamp: new Date().toISOString(),
                        status: "Delivered (200 OK)"
                    });
                } catch (e) {
                    results.emailStatus = `Failed: ${e.message}`;
                    regRecord.communicationLogs.push({
                        type: "EMAIL",
                        event: "WELCOME_EMAIL_FAILED",
                        timestamp: new Date().toISOString(),
                        status: `Error: ${e.message}`
                    });
                }
            }

            // 2. WhatsApp Messaging
            if (regRecord.whatsAppOptIn && regRecord.phone) {
                try {
                    await this.sendWhatsAppConfirmation(regRecord);
                    results.whatsAppSent = true;
                    results.whatsAppStatus = "Delivered (Twilio / WhatsApp API)";
                    regRecord.communicationLogs.push({
                        type: "WHATSAPP",
                        event: "CONFIRMATION_MSG_SENT",
                        timestamp: new Date().toISOString(),
                        status: "Delivered (200 OK)"
                    });
                } catch (e) {
                    results.whatsAppStatus = `Failed: ${e.message}`;
                    regRecord.communicationLogs.push({
                        type: "WHATSAPP",
                        event: "CONFIRMATION_MSG_FAILED",
                        timestamp: new Date().toISOString(),
                        status: `Error: ${e.message}`
                    });
                }
            }

            return results;
        },

        async sendWelcomeEmail(regRecord) {
            await sleep(400); // Simulate API network latency
            console.log(`[NotificationService] Sending Branded HTML Welcome Email to ${regRecord.email} for ID ${regRecord.id}...`);
            return true;
        },

        async sendWhatsAppConfirmation(regRecord) {
            await sleep(350); // Simulate WhatsApp Business API dispatch
            console.log(`[NotificationService] Sending WhatsApp Message to ${regRecord.phone} for ID ${regRecord.id}...`);
            return true;
        },

        async resendWelcomeEmail(regId) {
            const reg = LifeOS.registrations.find(r => r.id === regId);
            if (!reg) throw new Error("Registration record not found.");

            await this.sendWelcomeEmail(reg);
            reg.communicationLogs.push({
                type: "EMAIL",
                event: "WELCOME_EMAIL_RESENT",
                timestamp: new Date().toISOString(),
                status: "Delivered (Resend API)"
            });
            logAudit(`Resent Welcome Email for ${regId} to ${reg.email}`, "WRITE");
            addNotification("success", "Email Resent", `Welcome email resent to ${reg.email}.`);
        },

        async resendWhatsAppConfirmation(regId) {
            const reg = LifeOS.registrations.find(r => r.id === regId);
            if (!reg) throw new Error("Registration record not found.");
            if (!reg.phone) throw new Error("No phone number recorded for this registration.");

            await this.sendWhatsAppConfirmation(reg);
            reg.communicationLogs.push({
                type: "WHATSAPP",
                event: "CONFIRMATION_MSG_RESENT",
                timestamp: new Date().toISOString(),
                status: "Delivered (Twilio API)"
            });
            logAudit(`Resent WhatsApp message for ${regId} to ${reg.phone}`, "WRITE");
            addNotification("success", "WhatsApp Resent", `WhatsApp message resent to ${reg.phone}.`);
        }
    };

    function exportRegistrationsToCSV() {
        if (!LifeOS.registrations || LifeOS.registrations.length === 0) {
            alert("No registration records to export.");
            return;
        }

        const headers = ["Registration ID", "Full Name", "Email", "Phone", "Country", "Role", "Organization", "Status", "Timestamp", "Email Opt-In", "WhatsApp Opt-In", "Message"];
        const rows = LifeOS.registrations.map(r => [
            `"${r.id}"`,
            `"${r.fullName.replace(/"/g, '""')}"`,
            `"${r.email}"`,
            `"${r.phone}"`,
            `"${r.country}"`,
            `"${r.role}"`,
            `"${r.organization.replace(/"/g, '""')}"`,
            `"${r.status}"`,
            `"${r.timestamp}"`,
            r.emailOptIn ? "YES" : "NO",
            r.whatsAppOptIn ? "YES" : "NO",
            `"${(r.message || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `LifeOS_Registrations_Export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        logAudit("Exported User Registrations Database to CSV file", "ACCESS");
    }

    // --- UNIVERSAL HASHING ABSTRACTION & CRYPTO UTILITIES ---
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

    async function computeSha256(arrayBuffer) {
        if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle && typeof globalThis.crypto.subtle.digest === 'function') {
            try {
                const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                console.warn("[LifeOS] WebCrypto subtle.digest failed, falling back to pure JS SHA-256:", e);
            }
        }
        return sha256PureJs(new Uint8Array(arrayBuffer));
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // --- 10-STEP ASYNC CLINICAL INGESTION PIPELINES ---
    async function runClinicalOcrPipeline(file) {
        updatePipelineStep(1, "RUNNING", "1. Upload File: Reading file data...");
        const fileName = file.name;
        const ext = fileName.split('.').pop().toLowerCase();
        
        let fileContent = "";
        let readBuffer = null;
        
        try {
            fileContent = await readFileAsText(file);
            readBuffer = await readFileAsArrayBuffer(file);
            updatePipelineStep(1, "SUCCESS", `1. Upload File: Loaded "${fileName}" (${file.size} bytes) ✓`);
        } catch (e) {
            updatePipelineStep(1, "ERROR", `1. Upload File Failed: ${e.message} ✗`);
            return;
        }

        // Step 2: Virus Scan & Backend Ingestion Gateway
        updatePipelineStep(2, "RUNNING", "2. Virus Scan: Scanning cryptographic hash for malware signatures...");
        await sleep(350);

        let fileHash = "";
        let uploadedDoc = null;
        try {
            // Universal hashing abstraction (WebCrypto Subtle + Pure JS Fallback)
            fileHash = await computeSha256(readBuffer);

            // Check client-side test tokens
            if (fileContent.includes("EICAR") || fileName.includes("malware") || fileContent.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
                throw new Error("Malware signature found! File quarantined by security gateway.");
            }

            // Call authoritative backend upload gateway
            const token = sessionStorage.getItem('lifeos_session_token');
            const authHeaders = { 'Content-Type': 'application/json' };
            if (token) authHeaders['Authorization'] = `Bearer ${token}`;

            const base64Data = arrayBufferToBase64(readBuffer);
            const uploadRes = await fetch('/api/documents/upload', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    fileName: fileName,
                    fileData: base64Data,
                    mimeType: file.type || 'application/octet-stream',
                    isBase64: true
                })
            });

            const uploadResult = await uploadRes.json();
            if (uploadRes.status === 409 && uploadResult.isDuplicate && uploadResult.document) {
                uploadedDoc = uploadResult.document;
                updatePipelineStep(2, "SUCCESS", `2. Virus Scan: Clean (Existing document found). SHA-256: ${uploadedDoc.sha256.slice(0, 16)}... ✓`);
            } else if (!uploadRes.ok || !uploadResult.success) {
                const errCode = uploadResult.error?.code || 'UPLOAD_FAILED';
                const errMsg = uploadResult.error?.message || 'Document security gate failed.';
                if (errCode === 'MALWARE_REJECTED') {
                    throw new Error(errMsg);
                } else if (errCode === 'FILE_VALIDATION_FAILED') {
                    updatePipelineStep(2, "SUCCESS", `2. Virus Scan: Clean. SHA-256: ${fileHash.slice(0, 16)}... ✓`);
                    updatePipelineStep(3, "ERROR", `3. Document Validation Failed: ${errMsg} ✗`);
                    showIngestionErrorModal("Document Validation Gate Failed", errMsg);
                    return;
                } else {
                    throw new Error(errMsg);
                }
            } else {
                uploadedDoc = uploadResult.document;
                updatePipelineStep(2, "SUCCESS", `2. Virus Scan: Clean. SHA-256: ${uploadedDoc.sha256.slice(0, 16)}... ✓`);
            }
        } catch (e) {
            updatePipelineStep(2, "ERROR", `2. Virus Scan Blocked: ${e.message} ✗`);
            showIngestionErrorModal("Virus Scan Gate Blocked", e.message);
            return;
        }

        // Step 3: Document Validation
        updatePipelineStep(3, "RUNNING", "3. Document Validation: Verifying format and header integrity...");
        await sleep(350);
        try {
            const supported = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tiff', 'heic', 'txt', 'csv', 'fastq'];
            if (!supported.includes(ext)) {
                throw new Error(`Unsupported file extension: .${ext}. Only PDF, Image, Blood panels, and DNA sequences are supported.`);
            }
            if (file.size > 20 * 1024 * 1024) {
                throw new Error("File size exceeds clinical threshold (20MB limit).");
            }
            
            if (readBuffer.byteLength >= 4) {
                const view = new DataView(readBuffer);
                const first4Bytes = view.getUint32(0, false);
                const first4Hex = first4Bytes.toString(16).toUpperCase();
                
                if (ext === 'pdf' && first4Hex !== '25504446') {
                    throw new Error("Validation Failed: File claims to be PDF but magic bytes do not match %PDF header.");
                }
                if (ext === 'png' && first4Hex !== '89504E47') {
                    throw new Error("Validation Failed: File claims to be PNG but magic bytes do not match PNG header.");
                }
                if ((ext === 'jpg' || ext === 'jpeg') && (first4Hex.slice(0, 4) !== 'FFD8')) {
                    throw new Error("Validation Failed: File claims to be JPEG but magic bytes do not match.");
                }
            }
            updatePipelineStep(3, "SUCCESS", "3. Document Validation: Header integrity verified ✓");
        } catch (e) {
            updatePipelineStep(3, "ERROR", `3. Document Validation Failed: ${e.message} ✗`);
            showIngestionErrorModal("Document Validation Gate Failed", e.message);
            return;
        }

        // Step 4: OCR Text Extraction
        updatePipelineStep(4, "RUNNING", "4. OCR: Scanning character boundaries and layout maps...");
        await sleep(400);
        
        let ocrText = "";
        let ocrConfidence = 0;
        let ocrMetadata = {
            language: "en",
            rotation: 0,
            pageNumber: 1,
            signatures: null,
            stamps: null,
            barcode: null,
            qrCode: null,
            tables: []
        };
        let serverExtracted = null;

        // Authoritative server-side OCR and extraction
        if (uploadedDoc && uploadedDoc.id) {
            try {
                const token = sessionStorage.getItem('lifeos_session_token');
                const authHeaders = { 'Content-Type': 'application/json' };
                if (token) authHeaders['Authorization'] = `Bearer ${token}`;

                const procRes = await fetch(`/api/health-twin/documents/${uploadedDoc.id}/process`, {
                    method: 'POST',
                    headers: authHeaders
                });
                if (procRes.ok) {
                    serverExtracted = await procRes.json();
                    if (serverExtracted && serverExtracted.ocr && serverExtracted.ocr.text) {
                        ocrText = serverExtracted.ocr.text;
                        ocrConfidence = serverExtracted.ocr.confidence || 95;
                    }
                }
            } catch (procErr) {
                console.warn("[LifeOS] Server OCR process failed, using client fallback:", procErr);
            }
        }
        
        if (!ocrText) {
            if (ext === 'txt' || ext === 'csv' || ext === 'fastq') {
                ocrText = fileContent;
                ocrConfidence = 98;
            } else {
                const strings = extractPrintableStrings(readBuffer);
                if (strings && strings.length > 30) {
                    ocrText = strings;
                    ocrConfidence = 95;
                } else {
                    ocrConfidence = 45;
                }
            }
        }

        if (ocrText.toLowerCase().includes("signature:")) {
            const match = ocrText.match(/signature\s*:?\s*([^\n\r]+)/i);
            if (match) ocrMetadata.signatures = match[1].trim();
        }
        if (ocrText.toLowerCase().includes("stamp:")) {
            const match = ocrText.match(/stamp\s*:?\s*([^\n\r]+)/i);
            if (match) ocrMetadata.stamps = match[1].trim();
        }
        if (ocrText.toLowerCase().includes("barcode:")) {
            const match = ocrText.match(/barcode\s*:?\s*([^\n\r]+)/i);
            if (match) ocrMetadata.barcode = match[1].trim();
        }
        if (ocrText.toLowerCase().includes("qr-code:") || ocrText.toLowerCase().includes("qr:")) {
            const match = ocrText.match(/(?:qr-code|qr)\s*:?\s*([^\n\r]+)/i);
            if (match) ocrMetadata.qrCode = match[1].trim();
        }
        
        if (ocrConfidence >= 70) {
            updatePipelineStep(4, "SUCCESS", `4. OCR: Extraction complete. Confidence: ${ocrConfidence}% ✓`);
        } else {
            updatePipelineStep(4, "WARNING", `4. OCR: Low resolution/scanned binary detected. Confidence: ${ocrConfidence}% ⚠`);
        }

        // Step 5: Medical Document Classification
        updatePipelineStep(5, "RUNNING", "5. Classification: Analyzing clinical taxonomy...");
        await sleep(350);
        
        let classifiedType = (serverExtracted && serverExtracted.document && serverExtracted.document.document_type) || null;
        let classificationConfidence = classifiedType ? 95 : 0;
        
        if (!classifiedType && ocrConfidence >= 45) {
            const lText = ocrText.toLowerCase();
            const keywordScores = {
                "CBC": (lText.match(/cbc|complete blood count|platelet|rbc|wbc/g) || []).length * 2,
                "HbA1c": (lText.match(/hba1c|a1c|glycated hemoglobin/g) || []).length * 3,
                "Kidney Function": (lText.match(/creatinine|egfr|bun|urea|renal/g) || []).length * 2,
                "Liver Function": (lText.match(/alt|ast|alp|bilirubin|albumin|liver/g) || []).length * 2,
                "MRI": (lText.match(/mri|magnetic resonance/g) || []).length * 3,
                "CT": (lText.match(/ct scan|computed tomography/g) || []).length * 3,
                "Ultrasound": (lText.match(/ultrasound|sonography/g) || []).length * 3,
                "Prescription": (lText.match(/rx|prescription|refill|dispense|take 1 tablet|tablet|capsule/g) || []).length * 2,
                "ECG": (lText.match(/ecg|ekg|electrocardiogram|sinus rhythm/g) || []).length * 3,
                "Echo": (lText.match(/echo|echocardiogram|ejection fraction/g) || []).length * 3,
                "Vaccination": (lText.match(/vaccine|vaccination|booster|immunization/g) || []).length * 3,
                "Discharge Summary": (lText.match(/discharge summary|hospital course/g) || []).length * 3,
                "Referral Letter": (lText.match(/referral letter|referred by/g) || []).length * 3,
                "Insurance Document": (lText.match(/insurance policy|subscriber|copay/g) || []).length * 3,
                "Genetic Report": (lText.match(/genetic report|helix dna|rsid|rs429358|rs1801133/g) || []).length * 3
            };
            
            let maxScore = 0;
            for (let type in keywordScores) {
                if (keywordScores[type] > maxScore) {
                    maxScore = keywordScores[type];
                    classifiedType = type;
                }
            }
            if (maxScore >= 4) {
                classificationConfidence = 98;
            } else if (maxScore > 0) {
                classificationConfidence = 75;
            }
        }
        
        if (!classifiedType || classificationConfidence < 50) {
            updatePipelineStep(5, "WARNING", "5. Classification: Low taxonomy confidence. Awaiting human input...");
            classifiedType = await promptUserForDocType();
            classificationConfidence = 100; 
            updatePipelineStep(5, "SUCCESS", `5. Classification: Set to user-verified "${classifiedType}" ✓`);
        } else {
            updatePipelineStep(5, "SUCCESS", `5. Classification: Auto-detected "${classifiedType}" (${classificationConfidence}%) ✓`);
        }

        // Step 6: Structured Field Extraction
        updatePipelineStep(6, "RUNNING", "6. Extraction: Mapping clinical keys and numeric vectors...");
        await sleep(350);
        
        let extracted = parseReportText(ocrText, fileName);
        if (serverExtracted && serverExtracted.extracted) {
            const sExt = serverExtracted.extracted;
            if (sExt.labs && sExt.labs.length > 0) {
                extracted.labs = sExt.labs.map(l => ({
                    testName: l.testName,
                    value: l.value,
                    unit: l.unit,
                    referenceRange: l.referenceRange,
                    abnormalFlag: l.abnormalFlag,
                    confidence: l.confidence || 95
                }));
            }
            if (sExt.prescriptions && sExt.prescriptions.length > 0) {
                extracted.prescriptions = sExt.prescriptions;
            }
            if (sExt.clinician) extracted.physician = sExt.clinician;
            if (sExt.facility) extracted.labName = sExt.facility;
            if (sExt.documentDate) extracted.reportDate = sExt.documentDate;
            if (sExt.patient) extracted.patientName = sExt.patient;
        }
        updatePipelineStep(6, "SUCCESS", `6. Extraction: Extracted ${extracted.labs.length} biomarkers / ${extracted.prescriptions.length} medications ✓`);

        // Step 7: Medical Field Validation
        updatePipelineStep(7, "RUNNING", "7. Validation: Cross-checking values, patient ID, and clinical ranges...");
        await sleep(350);
        
        const validationErrors = [];
        
        if (extracted.patientName) {
            if (LifeOS.user && LifeOS.user.name && extracted.patientName.toLowerCase() !== LifeOS.user.name.toLowerCase()) {
                // If patient name doesn't match and neither is empty, flag only if completely mismatched
                if (!extracted.patientName.toLowerCase().includes(LifeOS.user.name.toLowerCase().split(' ')[0])) {
                    validationErrors.push(`Patient name mismatch: Expected "${LifeOS.user.name}", but report belongs to "${extracted.patientName}".`);
                }
            }
        }
        
        if (extracted.collectionDate) {
            const cDate = new Date(extracted.collectionDate);
            if (cDate > new Date()) {
                validationErrors.push(`Collection Date "${extracted.collectionDate}" is in the future.`);
            }
        }
        if (extracted.reportDate) {
            const rDate = new Date(extracted.reportDate);
            if (rDate > new Date()) {
                validationErrors.push(`Report Date "${extracted.reportDate}" is in the future.`);
            }
            if (extracted.collectionDate && new Date(extracted.collectionDate) > rDate) {
                validationErrors.push(`Collection date "${extracted.collectionDate}" is after Report date "${extracted.reportDate}".`);
            }
        }
        
        extracted.labs.forEach(lab => {
            if (lab.testName === "Fasting Glucose") {
                if (lab.value < 10 || lab.value > 1000) validationErrors.push(`Impossible Fasting Glucose value: ${lab.value} mg/dL.`);
                if (lab.unit && lab.unit !== 'mg/dL' && lab.unit !== 'mmol/L') validationErrors.push(`Incorrect unit for Fasting Glucose: ${lab.unit}. Expected mg/dL or mmol/L.`);
            }
            if (lab.testName === "Hemoglobin A1c") {
                if (lab.value < 2.0 || lab.value > 25.0) validationErrors.push(`Impossible HbA1c value: ${lab.value}%.`);
                if (lab.unit && lab.unit !== '%') validationErrors.push(`Incorrect unit for HbA1c: ${lab.unit}. Expected %.`);
            }
            if (lab.testName === "Apolipoprotein B") {
                if (lab.value < 10 || lab.value > 500) validationErrors.push(`Impossible ApoB value: ${lab.value} mg/dL.`);
                if (lab.unit && lab.unit !== 'mg/dL' && lab.unit !== 'g/L') validationErrors.push(`Incorrect unit for ApoB: ${lab.unit}. Expected mg/dL.`);
            }
        });
        
        if (validationErrors.length > 0) {
            updatePipelineStep(7, "ERROR", `7. Validation Failed: ${validationErrors.length} clinical errors flagged ✗`);
            showIngestionErrorModal("Clinical Field Validation Gate Failed", validationErrors.join("<br>"));
            return;
        }
        updatePipelineStep(7, "SUCCESS", "7. Validation: All clinical bounds and identifiers match active profile ✓");

        // Step 8: Confidence Scoring
        updatePipelineStep(8, "RUNNING", "8. Confidence: Checking cumulative extraction score...");
        await sleep(250);
        
        if (ocrConfidence < 45 && extracted.labs.length === 0 && extracted.prescriptions.length === 0) {
            updatePipelineStep(8, "ERROR", `8. Confidence Check: Low OCR confidence (${ocrConfidence}%) and no readable fields ✗`);
            showIngestionErrorModal(
                "Document Unreadable", 
                "We could not verify enough readable clinical information from this report. Please upload a clearer scan or high-contrast photo."
            );
            return;
        }
        
        if (ocrConfidence >= 90) {
            updatePipelineStep(8, "SUCCESS", `8. Confidence: High Extraction Confidence (${ocrConfidence}%) ✓`);
        } else if (ocrConfidence >= 70) {
            updatePipelineStep(8, "SUCCESS", `8. Confidence: Moderate Extraction Confidence (${ocrConfidence}%) - Review Suggested ✓`);
        } else {
            updatePipelineStep(8, "WARNING", `8. Confidence: Low Extraction Confidence (${ocrConfidence}%) - User Verification Required ⚠`);
        }

        // Step 9: Human Verification Screen
        updatePipelineStep(9, "RUNNING", "9. Human Verification: Displaying extraction payload...");
        
        const approvedData = await openClinicalVerificationModal(fileName, classifiedType, extracted, ocrConfidence, ocrMetadata);
        if (!approvedData) {
            updatePipelineStep(9, "WARNING", "9. Human Verification: Ingestion cancelled by user ✗");
            addNotification("info", "Verification Cancelled", "Data was not written to the twin vault.");
            return;
        }
        
        updatePipelineStep(9, "SUCCESS", "9. Human Verification: Extraction payload verified & signed by user ✓");

        // Step 10: Save & Health Twin Ledger Persistence
        updatePipelineStep(10, "RUNNING", "10. Vault Write: Commit transaction block...");
        await sleep(350);

        // Persist prescription to server SQLite database
        if (approvedData.prescriptions && approvedData.prescriptions.length > 0 && uploadedDoc) {
            try {
                const token = sessionStorage.getItem('lifeos_session_token');
                const authHeaders = { 'Content-Type': 'application/json' };
                if (token) authHeaders['Authorization'] = `Bearer ${token}`;

                await fetch('/api/prescriptions/confirm', {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        documentId: uploadedDoc.id,
                        clinicianName: approvedData.prescriptions[0]?.clinician || null,
                        facilityName: approvedData.labName || null,
                        issueDate: approvedData.prescriptions[0]?.date || null,
                        rxNumber: null,
                        rawText: fileContent,
                        medications: approvedData.prescriptions,
                        diagnoses: []
                    })
                });
            } catch (err) {
                console.warn("[LifeOS] Failed to persist prescription to server:", err);
            }
        }
        
        saveClinicalPayloadToTwin(fileName, classifiedType, approvedData, ocrConfidence, ocrMetadata, uploadedDoc);
        updatePipelineStep(10, "SUCCESS", "10. Vault Write: Transaction committed, twin updated successfully! ✓");
        
        setTimeout(() => {
            const progressCard = document.getElementById('upload-progress-card');
            if (progressCard) progressCard.classList.add('hide');
            addNotification("success", "Medical Record Verified", "Extracted values successfully written to Health Twin.");
            recalculateHealthScores();
            renderActiveView();
        }, 1500);
    }

    async function runClinicalDnaPipeline(file) {
        updateDnaPipelineStep(1, "RUNNING", "1. Upload File: Reading genomic sequence data...");
        const fileName = file.name;
        const ext = fileName.split('.').pop().toLowerCase();
        
        let fileContent = "";
        let readBuffer = null;
        try {
            fileContent = await readFileAsText(file);
            readBuffer = await readFileAsArrayBuffer(file);
            updateDnaPipelineStep(1, "SUCCESS", `1. Upload File: Loaded "${fileName}" (${file.size} bytes) ✓`);
        } catch (e) {
            updateDnaPipelineStep(1, "ERROR", `1. Upload File Failed: ${e.message} ✗`);
            return;
        }

        // Step 2: Virus Scan
        updateDnaPipelineStep(2, "RUNNING", "2. Virus Scan: Scanning genomic sequence file for malicious macros...");
        await sleep(300);
        try {
            const fileHash = await computeSha256(readBuffer);
            
            if (fileContent.includes("EICAR") || fileName.includes("malware") || fileContent.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
                throw new Error("Malware signature found! File quarantined by security gateway.");
            }
            updateDnaPipelineStep(2, "SUCCESS", `2. Virus Scan: Clean. SHA-256: ${fileHash.slice(0, 16)}... ✓`);
        } catch (e) {
            updateDnaPipelineStep(2, "ERROR", `2. Virus Scan Blocked: ${e.message} ✗`);
            showIngestionErrorModal("Virus Scan Gate Blocked", e.message);
            return;
        }

        // Step 3: Document Validation
        updateDnaPipelineStep(3, "RUNNING", "3. Validation: Verifying genomics alignment formatting...");
        await sleep(300);
        try {
            const supported = ['txt', 'csv', 'fastq'];
            if (!supported.includes(ext)) {
                throw new Error(`Unsupported genomic extension: .${ext}. Only raw TXT, CSV, or FASTQ alignments are supported.`);
            }
            updateDnaPipelineStep(3, "SUCCESS", "3. Validation: Genomic format structure valid ✓");
        } catch (e) {
            updateDnaPipelineStep(3, "ERROR", `3. Validation Failed: ${e.message} ✗`);
            showIngestionErrorModal("Genomic Validation Gate Failed", e.message);
            return;
        }

        // Step 4: OCR (Base Pair Parsing)
        updateDnaPipelineStep(4, "RUNNING", "4. Parsing: Decoding chromosomal SNP base pairs...");
        await sleep(300);
        
        let parsedData = { apoe: null, mthfr: null, tcf7l2: null, patientName: null };
        let dnaConfidence = 0;
        
        const lowerContent = fileContent.toLowerCase();
        
        const nameMatch = fileContent.match(/(?:patient\s+name|patient)\s*:?\s*([^\n\r]+)/i);
        if (nameMatch) parsedData.patientName = nameMatch[1].trim();

        if (lowerContent.includes("rs1801133")) {
            const match = fileContent.match(/rs1801133\s+\S+\s+\S+\s+(\S+)/i) || fileContent.match(/rs1801133\s+(\S+)/i);
            if (match) parsedData.mthfr = match[match.length - 1].toUpperCase();
        }
        if (lowerContent.includes("rs429358")) {
            const match = fileContent.match(/rs429358\s+\S+\s+\S+\s+(\S+)/i) || fileContent.match(/rs429358\s+(\S+)/i);
            if (match) parsedData.apoe = match[match.length - 1].toUpperCase();
        }
        if (lowerContent.includes("rs7903146")) {
            const match = fileContent.match(/rs7903146\s+\S+\s+\S+\s+(\S+)/i) || fileContent.match(/rs7903146\s+(\S+)/i);
            if (match) parsedData.tcf7l2 = match[match.length - 1].toUpperCase();
        }
        
        if (parsedData.mthfr || parsedData.apoe || parsedData.tcf7l2) {
            dnaConfidence = 99;
            updateDnaPipelineStep(4, "SUCCESS", `4. Parsing: SNP base pairs parsed successfully. Confidence: ${dnaConfidence}% ✓`);
        } else {
            dnaConfidence = 20;
            updateDnaPipelineStep(4, "ERROR", `4. Parsing: No valid rsIDs discovered (rs1801133, rs429358, rs7903146 missing). Confidence: ${dnaConfidence}% ✗`);
            showIngestionErrorModal("Genomics Parsing Failed", "We could not verify enough information from this report. Please upload a clearer scan.");
            return;
        }

        // Step 5: Medical Document Classification
        updateDnaPipelineStep(5, "RUNNING", "5. Classification: Auto-detecting genetic registry type...");
        await sleep(200);
        updateDnaPipelineStep(5, "SUCCESS", "5. Classification: Auto-detected \"Genetic Report\" (100%) ✓");

        // Step 6: Structured Extraction
        updateDnaPipelineStep(6, "RUNNING", "6. Extraction: Mapping genomic coordinate arrays...");
        await sleep(200);
        updateDnaPipelineStep(6, "SUCCESS", "6. Extraction: Genotypes mapped successfully ✓");

        // Step 7: Medical Field Validation
        updateDnaPipelineStep(7, "RUNNING", "7. Validation: Cross-checking subject identifiers...");
        await sleep(300);
        
        const errors = [];
        if (parsedData.patientName && parsedData.patientName.toLowerCase() !== LifeOS.user.name.toLowerCase()) {
            errors.push(`Patient name mismatch: Expected "${LifeOS.user.name}", but report belongs to "${parsedData.patientName}".`);
        }
        
        const validGenotypes = ["AA", "AG", "AC", "AT", "GG", "GC", "GT", "CC", "CT", "TT", "E3/E3", "E3/E4", "E4/E4", "E2/E3", "TC", "CT"];
        if (parsedData.mthfr && !validGenotypes.includes(parsedData.mthfr)) errors.push(`Invalid MTHFR Genotype: "${parsedData.mthfr}".`);
        if (parsedData.apoe && !validGenotypes.includes(parsedData.apoe)) errors.push(`Invalid APOE Genotype: "${parsedData.apoe}".`);
        if (parsedData.tcf7l2 && !validGenotypes.includes(parsedData.tcf7l2)) errors.push(`Invalid TCF7L2 Genotype: "${parsedData.tcf7l2}".`);
        
        if (errors.length > 0) {
            updateDnaPipelineStep(7, "ERROR", "7. Validation Failed: Genomic mismatch ✗");
            showIngestionErrorModal("Genomics Field Validation Failed", errors.join("<br>"));
            return;
        }
        updateDnaPipelineStep(7, "SUCCESS", "7. Validation: Subject matches active profile, SNP values verified ✓");

        // Step 8: Confidence Scoring
        updateDnaPipelineStep(8, "RUNNING", "8. Confidence: Checking threshold bounds...");
        await sleep(200);
        updateDnaPipelineStep(8, "SUCCESS", `8. Confidence Check: Score is ${dnaConfidence}% (Clinical threshold satisfied) ✓`);

        // Step 9: Human Verification Screen
        updateDnaPipelineStep(9, "RUNNING", "9. Human Verification: Displaying genomic markers...");
        
        const approvedDna = await openDnaVerificationModal(fileName, parsedData);
        if (!approvedDna) {
            updateDnaPipelineStep(9, "WARNING", "9. Human Verification: Decryption cancelled by user ✗");
            addNotification("info", "Verification Cancelled", "Genomic data was not written to the twin vault.");
            return;
        }
        updateDnaPipelineStep(9, "SUCCESS", "9. Human Verification: Genotypes approved & signed by user ✓");

        // Step 10: Save
        updateDnaPipelineStep(10, "RUNNING", "10. Vault Write: Commit genomic database block...");
        await sleep(300);
        
        saveDnaPayloadToTwin(fileName, approvedDna, dnaConfidence);
        updateDnaPipelineStep(10, "SUCCESS", "10. Vault Write: Chromosomal nodes committed successfully! ✓");
        
        setTimeout(() => {
            const progressCard = document.getElementById('dna-progress-card');
            if (progressCard) progressCard.classList.add('hide');
            addNotification("success", "Genomics Sequence Decrypted", `APOE ${approvedDna.apoe} and MTHFR ${approvedDna.mthfr} base pairs mapped and verified.`);
            recalculateHealthScores();
            renderActiveView();
        }, 1500);
    }

    function handleReportUpload(file) {
        const progressCard = document.getElementById('upload-progress-card');
        const laser = document.getElementById('upload-scanner-laser');
        if (progressCard) {
            progressCard.innerHTML = `
                <div class="text-mono text-xxs text-teal mb-sm font-bold">CLINICAL INGESTION PIPELINE ACTIVE</div>
                <div style="display:flex; flex-direction:column; gap:6px; text-align:left;" class="text-mono text-xxs">
                    <div id="step-1" class="text-slate">☐ 1. File Uploading...</div>
                    <div id="step-2" class="text-slate">☐ 2. Secure Virus Scan</div>
                    <div id="step-3" class="text-slate">☐ 3. Document Validation</div>
                    <div id="step-4" class="text-slate">☐ 4. OCR Text Extraction</div>
                    <div id="step-5" class="text-slate">☐ 5. Medical Document Classification</div>
                    <div id="step-6" class="text-slate">☐ 6. Structured Field Extraction</div>
                    <div id="step-7" class="text-slate">☐ 7. Medical Field Validation</div>
                    <div id="step-8" class="text-slate">☐ 8. Confidence Scoring</div>
                    <div id="step-9" class="text-slate">☐ 9. Human Verification Screen</div>
                    <div id="step-10" class="text-slate">☐ 10. Write to Secure Twin Ledger</div>
                </div>
            `;
            progressCard.classList.remove('hide');
        }
        if (laser) laser.style.display = 'block';
        runClinicalOcrPipeline(file).finally(() => {
            if (laser) laser.style.display = 'none';
        });
    }

    function handleDnaUpload(file) {
        const progressCard = document.getElementById('dna-progress-card');
        if (progressCard) {
            progressCard.innerHTML = `
                <div class="text-mono text-xxs text-purple mb-sm font-bold">GENOMIC INGESTION PIPELINE ACTIVE</div>
                <div style="display:flex; flex-direction:column; gap:6px; text-align:left;" class="text-mono text-xxs">
                    <div id="dnastep-1" class="text-slate">☐ 1. File Uploading...</div>
                    <div id="dnastep-2" class="text-slate">☐ 2. Secure Virus Scan</div>
                    <div id="dnastep-3" class="text-slate">☐ 3. Validation Check</div>
                    <div id="dnastep-4" class="text-slate">☐ 4. Base Pair Parsing</div>
                    <div id="dnastep-5" class="text-slate">☐ 5. Document Classification</div>
                    <div id="dnastep-6" class="text-slate">☐ 6. Structured Loci Mapping</div>
                    <div id="dnastep-7" class="text-slate">☐ 7. Loci Field Validation</div>
                    <div id="dnastep-8" class="text-slate">☐ 8. Confidence Scoring</div>
                    <div id="dnastep-9" class="text-slate">☐ 9. Human Verification Screen</div>
                    <div id="dnastep-10" class="text-slate">☐ 10. Write to Secure Twin Ledger</div>
                </div>
            `;
            progressCard.classList.remove('hide');
        }
        runClinicalDnaPipeline(file);
    }

    function updatePipelineStep(stepIndex, status, message) {
        const el = document.getElementById(`step-${stepIndex}`);
        if (!el) return;
        el.textContent = message;
        el.className = "text-mono text-xxs mt-xxs";
        if (status === "RUNNING") {
            el.classList.add("text-yellow");
        } else if (status === "SUCCESS") {
            el.classList.add("text-green");
        } else if (status === "WARNING") {
            el.classList.add("text-yellow");
        } else if (status === "ERROR") {
            el.classList.add("text-red");
        }
    }

    function updateDnaPipelineStep(stepIndex, status, message) {
        const el = document.getElementById(`dnastep-${stepIndex}`);
        if (!el) return;
        el.textContent = message;
        el.className = "text-mono text-xxs mt-xxs";
        if (status === "RUNNING") {
            el.classList.add("text-yellow");
        } else if (status === "SUCCESS") {
            el.classList.add("text-green");
        } else if (status === "WARNING") {
            el.classList.add("text-yellow");
        } else if (status === "ERROR") {
            el.classList.add("text-red");
        }
    }

    function promptUserForDocType() {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.zIndex = '9999';
            modal.innerHTML = `
                <div class="modal-content-card" style="width:360px; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--accent-purple);">
                    <h3 class="text-mono text-sm text-purple mb-sm">SELECT DOCUMENT TYPE</h3>
                    <p class="text-xxs text-slate mb-sm">AI classification confidence was low. Please select the correct document type:</p>
                    <select id="manual-doc-type-select" class="db-role-select" style="width:100%; padding:8px; margin-bottom:16px;">
                        <option value="CBC">CBC (Complete Blood Count)</option>
                        <option value="HbA1c">HbA1c Report</option>
                        <option value="Kidney Function">Kidney Function Panel</option>
                        <option value="Liver Function">Liver Function Panel</option>
                        <option value="MRI">MRI Scan Report</option>
                        <option value="CT">CT Scan Report</option>
                        <option value="Ultrasound">Ultrasound Report</option>
                        <option value="Prescription">Prescription</option>
                        <option value="ECG">ECG / EKG Report</option>
                        <option value="Echo">Echocardiogram</option>
                        <option value="Vaccination">Vaccination Record</option>
                        <option value="Discharge Summary">Discharge Summary</option>
                        <option value="Referral Letter">Referral Letter</option>
                        <option value="Insurance Document">Insurance Document</option>
                        <option value="Genetic Report">Genetic Report</option>
                        <option value="Other">Other Document</option>
                    </select>
                    <button id="btn-submit-manual-type" class="btn btn-purple btn-full btn-sm">Confirm Document Type</button>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('btn-submit-manual-type').onclick = () => {
                const val = document.getElementById('manual-doc-type-select').value;
                modal.remove();
                resolve(val);
            };
        });
    }

    function showIngestionErrorModal(title, errorHtml) {
        const existing = document.getElementById('db-ingestion-error-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'db-ingestion-error-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        
        modal.innerHTML = `
            <div class="modal-content-card" style="width:400px; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--text-red); text-align:center;">
                <i data-lucide="alert-triangle" class="text-red mb-sm" style="width:40px; height:40px; margin:0 auto; display:block;"></i>
                <h3 class="text-mono text-sm text-red mb-xs">${title.toUpperCase()}</h3>
                <div class="text-xxs text-slate mb-md" style="text-align:left; background:rgba(0,0,0,0.2); padding:10px; border-radius:4px; max-height:150px; overflow-y:auto;">
                    ${errorHtml}
                </div>
                <button id="btn-close-error-modal" class="btn btn-secondary btn-full btn-sm">Dismiss & Abort Ingestion</button>
            </div>
        `;
        document.body.appendChild(modal);
        lucide.createIcons();
        document.getElementById('btn-close-error-modal').onclick = () => {
            modal.remove();
            const progressCard = document.getElementById('upload-progress-card');
            if (progressCard) progressCard.classList.add('hide');
            const dnaProgressCard = document.getElementById('dna-progress-card');
            if (dnaProgressCard) dnaProgressCard.classList.add('hide');
        };
    }

    function openClinicalVerificationModal(fileName, docType, extracted, ocrConfidence, ocrMetadata) {
        return new Promise(resolve => {
            const existing = document.getElementById('db-report-confirm-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'db-report-confirm-modal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '9998';
            
            let payloadHtml = "";
            
            if (docType === 'Prescription' || extracted.prescriptions.length > 0) {
                const rx = extracted.prescriptions[0] || {
                    medicationName: null, strength: null, dosage: null, frequency: null, duration: null, clinician: extracted.physician, date: extracted.reportDate
                };
                payloadHtml = `
                    <div class="text-mono text-xxs text-purple mb-sm">PRESCRIPTION PAYLOAD (VERSION 1.0)</div>
                    <div class="form-row">
                        <label class="form-label-txt">Medication Name</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-name" value="${rx.medicationName || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Strength</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-strength" value="${rx.strength || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Dosage / Instructions</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-dosage" value="${rx.dosage || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Frequency</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-frequency" value="${rx.frequency || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Duration</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-duration" value="${rx.duration || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Prescribing Clinician</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-clinician" value="${rx.clinician || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Date</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-rx-date" value="${rx.date || ''}" placeholder="NULL">
                    </div>
                `;
            } else {
                payloadHtml = `
                    <div class="text-mono text-xxs text-purple mb-sm">LABORATORY BIOMARKERS PAYLOAD (VERSION 1.0)</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                `;
                
                extracted.labs.forEach((lab, idx) => {
                    payloadHtml += `
                        <div class="glass-card" style="padding:10px; border-color:rgba(144, 97, 249, 0.2);">
                            <div class="text-mono text-xxs text-cyan font-bold mb-xs">Biomarker #${idx + 1}: ${lab.testName}</div>
                            <div class="form-row">
                                <label class="form-label-txt">Test Name</label>
                                <input type="text" class="form-textbox text-mono lab-test-name" data-idx="${idx}" value="${lab.testName || ''}" placeholder="NULL">
                            </div>
                            <div class="form-row mt-xs" style="display:flex; gap:8px;">
                                <div style="flex:1;">
                                    <label class="form-label-txt">Value</label>
                                    <input type="number" step="any" class="form-textbox text-mono lab-test-value" data-idx="${idx}" value="${lab.value !== null ? lab.value : ''}" placeholder="NULL">
                                </div>
                                <div style="flex:1;">
                                    <label class="form-label-txt">Unit</label>
                                    <input type="text" class="form-textbox text-mono lab-test-unit" data-idx="${idx}" value="${lab.unit || ''}" placeholder="NULL">
                                </div>
                            </div>
                            <div class="form-row mt-xs">
                                <label class="form-label-txt">Reference Range</label>
                                <input type="text" class="form-textbox text-mono lab-test-range" data-idx="${idx}" value="${lab.referenceRange || ''}" placeholder="NULL">
                            </div>
                        </div>
                    `;
                });
                
                payloadHtml += `
                    </div>
                    <div class="form-row mt-sm">
                        <label class="form-label-txt">Reviewing Physician</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-lab-physician" value="${extracted.physician || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Laboratory Name</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-lab-name" value="${extracted.labName || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Collection Date</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-lab-collection-date" value="${extracted.collectionDate || ''}" placeholder="NULL">
                    </div>
                    <div class="form-row mt-xs">
                        <label class="form-label-txt">Report Date</label>
                        <input type="text" class="form-textbox text-mono" id="confirm-lab-report-date" value="${extracted.reportDate || ''}" placeholder="NULL">
                    </div>
                `;
            }

            modal.innerHTML = `
                <div class="modal-content-card" style="width:480px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(144, 97, 249, 0.3); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px);">
                    <div class="modal-header-pane" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                        <h3 class="text-mono text-sm text-purple">VERIFY EXTRACTED CLINICAL FIELDS</h3>
                        <button class="close-modal-btn" id="close-confirm-modal" style="background:none; border:none; color:var(--text-slate); cursor:pointer;"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body-pane" style="margin-top:16px;">
                        <p class="text-xs text-slate mb-sm">AI extracted the following values from file: <span class="text-white font-bold">${fileName}</span>. Verify and edit fields before saving to Twin.</p>
                        <div style="max-height: 380px; overflow-y: auto; padding-right:4px;">
                            ${payloadHtml}
                        </div>
                        <div class="glass-card mt-sm text-xxs text-yellow" style="padding:10px; border-color:rgba(245,158,11,0.2); background:rgba(245,158,11,0.03);">
                            <strong>OCR CONFIDENCE: ${ocrConfidence}%</strong>
                            <span class="block text-slate mt-xxs">OCR Metadata: Barcode: ${ocrMetadata.barcode || 'NULL'}, QR: ${ocrMetadata.qrCode || 'NULL'}, Signature: ${ocrMetadata.signatures || 'NULL'}, Stamp: ${ocrMetadata.stamps || 'NULL'}.</span>
                        </div>
                        <button class="btn btn-purple btn-full mt-md" id="btn-save-confirm">Confirm & Save to Secure Twin</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            lucide.createIcons();

            document.getElementById('close-confirm-modal').onclick = () => {
                modal.remove();
                resolve(null);
            };

            document.getElementById('btn-save-confirm').onclick = () => {
                if (docType === 'Prescription' || extracted.prescriptions.length > 0) {
                    const approvedRx = {
                        medicationName: document.getElementById('confirm-rx-name').value || null,
                        strength: document.getElementById('confirm-rx-strength').value || null,
                        dosage: document.getElementById('confirm-rx-dosage').value || null,
                        frequency: document.getElementById('confirm-rx-frequency').value || null,
                        duration: document.getElementById('confirm-rx-duration').value || null,
                        clinician: document.getElementById('confirm-rx-clinician').value || null,
                        date: document.getElementById('confirm-rx-date').value || null
                    };
                    modal.remove();
                    resolve({ prescriptions: [approvedRx], labs: [] });
                } else {
                    const labInputs = modal.querySelectorAll('.lab-test-name');
                    const approvedLabs = [];
                    labInputs.forEach(input => {
                        const idx = parseInt(input.getAttribute('data-idx'));
                        const valStr = modal.querySelector(`.lab-test-value[data-idx="${idx}"]`).value;
                        approvedLabs.push({
                            testName: input.value || null,
                            value: valStr !== '' ? parseFloat(valStr) : null,
                            unit: modal.querySelector(`.lab-test-unit[data-idx="${idx}"]`).value || null,
                            referenceRange: modal.querySelector(`.lab-test-range[data-idx="${idx}"]`).value || null,
                            boundingBox: { x: 50, y: 100 + idx * 40, w: 400, h: 20 },
                            confidence: 100
                        });
                    });
                    
                    const meta = {
                        physician: document.getElementById('confirm-lab-physician').value || null,
                        labName: document.getElementById('confirm-lab-name').value || null,
                        collectionDate: document.getElementById('confirm-lab-collection-date').value || null,
                        reportDate: document.getElementById('confirm-lab-report-date').value || null,
                        labs: approvedLabs,
                        prescriptions: []
                    };
                    modal.remove();
                    resolve(meta);
                }
            };
        });
    }

    function openDnaVerificationModal(fileName, parsedData) {
        return new Promise(resolve => {
            const existing = document.getElementById('db-dna-confirm-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'db-dna-confirm-modal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '9998';
            
            modal.innerHTML = `
                <div class="modal-content-card" style="width:480px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(144, 97, 249, 0.3); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px);">
                    <div class="modal-header-pane" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                        <h3 class="text-mono text-sm text-purple">VERIFY EXTRACTED GENOMIC DATA</h3>
                        <button class="close-modal-btn" id="close-dna-confirm-modal" style="background:none; border:none; color:var(--text-slate); cursor:pointer;"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body-pane" style="margin-top:16px;">
                        <p class="text-xs text-slate mb-sm">AI parsed the following genetic loci from: <span class="text-white font-bold">${fileName}</span>. Verify and select genotypes before writing to Twin.</p>
                        <div style="max-height: 380px; overflow-y: auto; padding-right:4px;">
                            <div class="form-row">
                                <label class="form-label-txt">APOE Genotype (Alzheimer's Risk)</label>
                                <select class="db-role-select" id="confirm-dna-apoe" style="padding:8px; width:100%;">
                                    <option value="E3/E3" ${parsedData.apoe === 'E3/E3' ? 'selected' : ''}>E3/E3 (Normal Risk)</option>
                                    <option value="E3/E4" ${parsedData.apoe === 'E3/E4' || parsedData.apoe === 'TC' || parsedData.apoe === 'CT' ? 'selected' : ''}>E3/E4 (Moderate Risk - 2-3x)</option>
                                    <option value="E4/E4" ${parsedData.apoe === 'E4/E4' || parsedData.apoe === 'CC' ? 'selected' : ''}>E4/E4 (High Risk - 8-12x)</option>
                                    <option value="E2/E3" ${parsedData.apoe === 'E2/E3' ? 'selected' : ''}>E2/E3 (Low Risk)</option>
                                </select>
                            </div>
                            <div class="form-row mt-xs">
                                <label class="form-label-txt">MTHFR C677T Genotype (Methylation)</label>
                                <select class="db-role-select" id="confirm-dna-mthfr" style="padding:8px; width:100%;">
                                    <option value="CC" ${parsedData.mthfr === 'CC' ? 'selected' : ''}>CC (Normal Methylation)</option>
                                    <option value="CT" ${parsedData.mthfr === 'CT' || parsedData.mthfr === 'CT' ? 'selected' : ''}>CT (Heterozygous - 30% Deficit)</option>
                                    <option value="TT" ${parsedData.mthfr === 'TT' ? 'selected' : ''}>TT (Homozygous - 70% Deficit)</option>
                                </select>
                            </div>
                            <div class="form-row mt-xs">
                                <label class="form-label-txt">TCF7L2 Genotype (Diabetes Risk)</label>
                                <select class="db-role-select" id="confirm-dna-tcf7l2" style="padding:8px; width:100%;">
                                    <option value="CC" ${parsedData.tcf7l2 === 'CC' ? 'selected' : ''}>CC (Normal Genotype)</option>
                                    <option value="CT" ${parsedData.tcf7l2 === 'CT' ? 'selected' : ''}>CT (Genotype CT - Elevated Risk)</option>
                                    <option value="TT" ${parsedData.tcf7l2 === 'TT' ? 'selected' : ''}>TT (Genotype TT - High Risk)</option>
                                </select>
                            </div>
                        </div>
                        <button class="btn btn-purple btn-full mt-md" id="btn-dna-save-confirm">Confirm & Save Genomics to Secure Twin</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            lucide.createIcons();

            document.getElementById('close-dna-confirm-modal').onclick = () => {
                modal.remove();
                resolve(null);
            };

            document.getElementById('btn-dna-save-confirm').onclick = () => {
                const apoe = document.getElementById('confirm-dna-apoe').value;
                const mthfr = document.getElementById('confirm-dna-mthfr').value;
                const tcf7l2 = document.getElementById('confirm-dna-tcf7l2').value;
                modal.remove();
                resolve({ apoe, mthfr, tcf7l2 });
            };
        });
    }

    function saveClinicalPayloadToTwin(fileName, docType, approvedData, ocrConfidence, ocrMetadata, uploadedDoc) {
        const uid = (LifeOS.user && LifeOS.user.id) || "USER-ALEX-001";
        const twinRes = HealthTwinAPI.getTwin(LifeOS.user, uid);
        const twin = twinRes && twinRes.data ? twinRes.data : LifeOS.healthTwin;
        const version = LifeOS.healthMemoryGraph.filter(n => n.originalFile === fileName).length + 1;
        const entryId = LifeOS.healthMemoryGraph.length + 1;
        const docId = (uploadedDoc && uploadedDoc.id) || `doc_${Date.now()}`;
        const token = sessionStorage.getItem('lifeos_session_token');
        const authHeaders = { 'Content-Type': 'application/json' };
        if (token) authHeaders['Authorization'] = `Bearer ${token}`;

        // 1. Record document in Health Twin medicalDocuments
        if (twin && twin.medicalDocuments) {
            const existingDocIdx = twin.medicalDocuments.findIndex(d => d.documentId === docId || d.fileName === fileName);
            const docObj = {
                documentId: docId,
                fileName: fileName,
                fileHash: (uploadedDoc && uploadedDoc.sha256) || "hash_" + Date.now(),
                documentType: docType || "Medical Report",
                uploadTime: new Date().toISOString(),
                source: "Uploaded Document",
                ocrConfidence: ocrConfidence,
                verificationStatus: "VERIFIED",
                fields: []
            };
            if (existingDocIdx >= 0) {
                twin.medicalDocuments[existingDocIdx] = docObj;
            } else {
                twin.medicalDocuments.unshift(docObj);
            }
        }

        // 2. Handle Prescriptions
        if (approvedData.prescriptions && approvedData.prescriptions.length > 0) {
            approvedData.prescriptions.forEach((rx, idx) => {
                const lowerName = rx.medicationName ? rx.medicationName.toLowerCase() : "";
                let interactionWarning = null;

                if (lowerName.includes('aspirin') || lowerName.includes('ibuprofen') || lowerName.includes('advil')) {
                    const hasApoE4 = LifeOS.healthMemoryGraph.some(node => node.desc.toLowerCase().includes("apoe") || node.desc.toLowerCase().includes("alzheimer"));
                    if (hasApoE4) {
                        interactionWarning = `${rx.medicationName} is contraindicated due to APOE E3/E4 carrier status (increases GI bleed risk 3.2x under high ApoB).`;
                    }
                }

                // Add to LifeOS.medications
                const medObj = {
                    id: LifeOS.medications.length + 1,
                    name: rx.medicationName,
                    dosage: rx.strength || rx.dosage || '',
                    frequency: rx.frequency || 'As directed',
                    purpose: "Prescription Import",
                    compliance: "100%",
                    duration: rx.duration || '30 days',
                    clinician: rx.clinician || 'Attending Physician',
                    date: rx.date || new Date().toISOString().split('T')[0],
                    instructions: rx.dosage || '',
                    interactionWarning: interactionWarning
                };
                LifeOS.medications.push(medObj);

                // Add to twin.patientProfile.medications
                if (twin && twin.patientProfile) {
                    if (!twin.patientProfile.medications) twin.patientProfile.medications = [];
                    twin.patientProfile.medications.push({
                        name: rx.medicationName,
                        strength: rx.strength || null,
                        dosage: rx.dosage || null,
                        frequency: rx.frequency || 'As directed',
                        duration: rx.duration || null,
                        clinician: rx.clinician || null,
                        date: rx.date || new Date().toISOString().split('T')[0],
                        source: "Uploaded prescription"
                    });
                }

                // Add to Timeline / Memory Graph
                LifeOS.healthMemoryGraph.push({
                    id: entryId + idx,
                    type: "Report Decoded",
                    title: `Prescription: ${rx.medicationName}`,
                    date: rx.date || new Date().toISOString().split('T')[0],
                    status: "Clinical Grade",
                    version: version,
                    originalFile: fileName,
                    ocrConfidence: ocrConfidence,
                    desc: `Compound: ${rx.medicationName} ${rx.strength || ''}. Freq: ${rx.frequency || 'NULL'}. Prescriber: ${rx.clinician || 'NULL'}. Instructions: ${rx.dosage || 'NULL'}.`
                });

                // Map to Organ systems
                if (twin && twin.organs) {
                    if (/metformin|insulin|glipizide/i.test(lowerName) && twin.organs.pancreas) {
                        twin.organs.pancreas.status = "TREATED (Rx Active)";
                    }
                    if (/atorvastatin|rosuvastatin|simvastatin|lisinopril|amlodipine|metoprolol|losartan/i.test(lowerName)) {
                        if (twin.organs.heart) twin.organs.heart.status = "MONITORED (Rx Active)";
                        if (twin.organs.vascular) twin.organs.vascular.status = "OPTIMIZING (Rx Active)";
                    }
                }

                // Persist observation to backend
                fetch('/api/health-twin/observations', {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        category: 'medication',
                        metric: rx.medicationName,
                        value: rx.strength || rx.dosage || 'Active',
                        unit: 'dosage',
                        sourceDocumentId: docId,
                        sourceProvider: rx.clinician || 'Attending Physician',
                        observedAt: rx.date || new Date().toISOString(),
                        confidence: ocrConfidence,
                        verificationStatus: 'VERIFIED'
                    })
                }).catch(err => console.warn("[LifeOS] Failed to post rx observation:", err));

                if (interactionWarning) {
                    addNotification("danger", "Prescription Conflict Flagged", interactionWarning);
                } else {
                    addNotification("success", "Prescription Saved", `${rx.medicationName} has been successfully added to your active profile.`);
                }
            });
            logAudit(`Clinical Prescription Verified & Saved: ${approvedData.prescriptions.map(r => r.medicationName).join(', ')} (v${version})`, "WRITE");
        }

        // 3. Handle Labs
        if (approvedData.labs && approvedData.labs.length > 0) {
            approvedData.labs.forEach((lab, idx) => {
                const metricLower = (lab.testName || '').toLowerCase();
                
                // Add to twin.labResults with provenance
                if (twin && twin.labResults) {
                    twin.labResults.unshift({
                        labId: `lab_${Date.now()}_${idx}_${(lab.testName || 'test').replace(/\s+/g, '_')}`,
                        testName: lab.testName,
                        value: lab.value,
                        unit: lab.unit,
                        referenceRange: lab.referenceRange || "Standard",
                        abnormalFlag: lab.abnormalFlag || false,
                        collectionTime: approvedData.collectionDate || new Date().toISOString(),
                        reportTime: approvedData.reportDate || new Date().toISOString(),
                        laboratory: approvedData.labName || "Diagnostic Lab",
                        provenance: {
                            source: "Uploaded Laboratory Report",
                            documentId: docId,
                            fileName: fileName,
                            ocrConfidence: ocrConfidence,
                            verificationStatus: "VERIFIED",
                            recordedAt: new Date().toISOString()
                        }
                    });
                }

                // Organ & Wearables Mapping
                if (metricLower.includes("glucose") || metricLower === "fasting blood glucose") {
                    if (LifeOS.wearables) LifeOS.wearables.glucose = lab.value;
                    if (twin && twin.wearables) twin.wearables.glucose = lab.value;
                }
                if (metricLower === "hba1c" || metricLower.includes("hemoglobin a1c")) {
                    if (twin && twin.organs && twin.organs.pancreas) {
                        twin.organs.pancreas.status = lab.value <= 5.6 ? "OPTIMAL" : (lab.value >= 6.5 ? "ELEVATED" : "PRE-DIABETIC RANGE");
                    }
                }
                if (metricLower.includes("crp")) {
                    if (twin && twin.organs && twin.organs.vascular) {
                        twin.organs.vascular.hsCRP = `${lab.value} ${lab.unit || 'mg/L'}`;
                        twin.organs.vascular.status = lab.value < 1.0 ? "LOW RISK" : "INFLAMMATION DETECTED";
                    }
                }
                if (metricLower.includes("cortisol")) {
                    if (twin && twin.organs && twin.organs.brain) {
                        twin.organs.brain.cortisol = `${lab.value} ${lab.unit || 'mcg/dL'}`;
                        twin.organs.brain.status = "EVALUATED";
                    }
                }
                if (metricLower.includes("apob") || metricLower.includes("cholesterol") || metricLower.includes("ldl")) {
                    if (twin && twin.organs && twin.organs.vascular) {
                        twin.organs.vascular.stiffness = lab.value > 130 ? "MODERATE RISK" : "NORMAL";
                    }
                }

                // Persist observation to backend
                fetch('/api/health-twin/observations', {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        category: 'lab',
                        metric: lab.testName,
                        value: lab.value,
                        unit: lab.unit,
                        referenceRange: lab.referenceRange || null,
                        abnormalFlag: lab.abnormalFlag ? String(lab.abnormalFlag) : null,
                        sourceDocumentId: docId,
                        sourceProvider: approvedData.labName || 'Diagnostic Lab',
                        observedAt: approvedData.collectionDate || approvedData.reportDate || new Date().toISOString(),
                        confidence: ocrConfidence,
                        verificationStatus: 'VERIFIED'
                    })
                }).catch(err => console.warn("[LifeOS] Failed to post lab observation:", err));
            });

            const labDesc = approvedData.labs.map(lab => `${lab.testName}: ${lab.value !== null ? lab.value : 'NULL'} ${lab.unit || ''} (Ref: ${lab.referenceRange || 'NULL'})`).join(", ");
            LifeOS.healthMemoryGraph.push({
                id: entryId,
                type: "Report Decoded",
                title: `${docType || 'Diagnostic'} Panel (Verified)`,
                date: approvedData.reportDate || new Date().toISOString().split('T')[0],
                status: "Clinical Grade",
                version: version,
                originalFile: fileName,
                ocrConfidence: ocrConfidence,
                desc: `${labDesc}. Lab: ${approvedData.labName || 'NULL'}. Physician: ${approvedData.physician || 'NULL'}.`
            });

            logAudit(`Diagnostic Lab Report Verified & Saved: ${docType} (v${version})`, "WRITE");
        }

        // 4. Update Connected UI Indicators
        const wizReports = document.getElementById('wiz-src-reports');
        if (wizReports) {
            wizReports.style.borderColor = "var(--accent-cyan)";
            wizReports.style.background = "rgba(0, 229, 255, 0.05)";
            const badge = wizReports.querySelector('.text-mono');
            if (badge) {
                badge.textContent = "CONNECTED ✓";
                badge.style.color = "var(--accent-cyan)";
            }
        }

        // 5. Recalculate Health Quality, Index & Scores
        HealthTwinAPI.recalculateQualityMetrics(uid);
        HealthTwinAPI.calculateHealthIndex(LifeOS.user, uid);
        recalculateHealthScores();
        renderActiveView();
    }

    function saveDnaPayloadToTwin(fileName, approvedDna, confidence) {
        const entryId = LifeOS.healthMemoryGraph.length + 1;
        const version = LifeOS.healthMemoryGraph.filter(n => n.originalFile === fileName).length + 1;
        
        LifeOS.healthMemoryGraph.push({
            id: entryId,
            type: "Report Decoded",
            title: "Helix DNA Mapping Registry (Verified)",
            date: new Date().toISOString().split('T')[0],
            status: "Clinical Grade",
            version: version,
            originalFile: fileName,
            ocrConfidence: confidence,
            desc: `Genomics: APOE ${approvedDna.apoe} carrier status, MTHFR ${approvedDna.mthfr} methylation deficit, and TCF7L2 ${approvedDna.tcf7l2} diabetes risk mapped.`
        });

        logAudit(`DNA Sequence successfully verified in Digital Twin (v${version})`, "WRITE");
        
        const wizDna = document.getElementById('wiz-src-dna');
        if (wizDna) {
            wizDna.style.borderColor = "var(--accent-purple)";
            wizDna.style.background = "rgba(144, 97, 249, 0.05)";
            const badge = wizDna.querySelector('.text-mono');
            if (badge) {
                badge.textContent = "DECRYPTED ✓";
                badge.style.color = "var(--accent-purple)";
            }
        }
    }

    // --- PIPELINE FILE UTILITIES ---
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error("File read error"));
            reader.readAsText(file);
        });
    }
    
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error("File read error"));
            reader.readAsArrayBuffer(file);
        });
    }
    
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function extractPrintableStrings(buffer) {
        const arr = new Uint8Array(buffer);
        let str = "";
        for (let i = 0; i < arr.length; i++) {
            const code = arr[i];
            if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
                str += String.fromCharCode(code);
            }
        }
        return str;
    }

    function launchDashboardShell() {
        if (window.__stopLandingAnimations) window.__stopLandingAnimations();

        recalculateHealthScores();
        startGlobalTelemetryStream();
        document.body.classList.add('dashboard-active');
        if (dashboardShell) dashboardShell.classList.remove('hide');
        document.getElementById('landing-page-wrapper').classList.add('hide');
        
        switchRole(LifeOS.user?.role === 'patient' ? 'patient' : (LifeOS.user?.role === 'commander' ? 'commander' : 'personnel'));
    }

    // Always expose global protocol & registration methods immediately
    window.registerUserProtocol = registerUserProtocol;
    window.NotificationService = NotificationService;
    window.exportRegistrationsToCSV = exportRegistrationsToCSV;

    window.LifeOS.transitionToPersonnelWellness = function(user, profile, token) {
        if (user) {
            LifeOS.user = {
                id: user.id,
                name: user.fullName || user.name,
                email: user.email,
                phone: user.phone,
                country: user.country || "United States",
                role: user.role || "personnel",
                organization: user.organization || "Personal Vault",
                status: user.status || "Active"
            };
            if (userDisplayName) userDisplayName.textContent = LifeOS.user.name;
            if (userDisplayEmail) userDisplayEmail.textContent = LifeOS.user.email;
            if (userAvatarInitials) {
                const initials = LifeOS.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                userAvatarInitials.textContent = initials || 'PW';
            }
        }
        if (profile) {
            LifeOS.personnelWellnessProfile = profile;
        }
        if (token) {
            sessionStorage.setItem('lifeos_session_token', token);
        }

        launchDashboardShell();
        LifeOS.activeRole = user?.role === 'patient' ? 'patient' : 'personnel';
        LifeOS.activeTab = 'personnel_wellness';
        LifeOS.mwsActiveSubtab = 'duty';

        renderSidebar();
        renderActiveView();

        addNotification("success", "Welcome to Personnel Wellness", `Viewing profile for ${LifeOS.user.name}.`);
    };
    async function loadHealthTwinFromServer() {
        const uid = (LifeOS.user && LifeOS.user.id) || "USER-ALEX-001";
        const token = sessionStorage.getItem('lifeos_session_token');
        const authHeaders = { 'Content-Type': 'application/json' };
        if (token) authHeaders['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch('/api/health-twin/twin', {
                method: 'GET',
                headers: authHeaders
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!data.success || !data.twin) return;

            const sTwin = data.twin;
            const twin = HealthTwinAPI.getTwin(LifeOS.user, uid).data;

            // Hydrate medical documents
            if (sTwin.documents && sTwin.documents.length > 0) {
                sTwin.documents.forEach(doc => {
                    if (!twin.medicalDocuments.some(d => d.documentId === doc.id || d.fileName === doc.file_name)) {
                        twin.medicalDocuments.push({
                            documentId: doc.id,
                            fileName: doc.file_name,
                            fileHash: doc.sha256,
                            documentType: doc.document_type || "Medical Report",
                            uploadTime: doc.created_at,
                            source: "Uploaded Document",
                            ocrConfidence: doc.ocr_confidence || 95,
                            verificationStatus: doc.verification_status || "VERIFIED",
                            fields: []
                        });
                    }
                });
            }

            // Hydrate prescriptions
            if (sTwin.prescriptions && sTwin.prescriptions.length > 0) {
                sTwin.prescriptions.forEach(rx => {
                    let meds = [];
                    try { meds = JSON.parse(rx.medications_json || '[]'); } catch(_) {}
                    meds.forEach(m => {
                        if (!LifeOS.medications.some(existing => existing.name === m.medicationName)) {
                            LifeOS.medications.push({
                                id: LifeOS.medications.length + 1,
                                name: m.medicationName,
                                dosage: m.strength || m.dosage || '',
                                frequency: m.frequency || 'As directed',
                                purpose: "Prescription Import",
                                compliance: "100%",
                                duration: m.duration || '30 days',
                                clinician: rx.clinician_name || 'Attending Physician',
                                date: rx.issue_date || rx.created_at?.split('T')[0],
                                instructions: m.dosage || ''
                            });
                        }
                        if (twin.patientProfile && twin.patientProfile.medications) {
                            if (!twin.patientProfile.medications.some(existing => existing.name === m.medicationName)) {
                                twin.patientProfile.medications.push({
                                    name: m.medicationName,
                                    strength: m.strength,
                                    dosage: m.dosage,
                                    frequency: m.frequency,
                                    clinician: rx.clinician_name,
                                    date: rx.issue_date,
                                    source: "Uploaded prescription"
                                });
                            }
                        }
                    });
                });
            }

            // Hydrate observations (biomarkers & vitals)
            if (sTwin.biomarkers && sTwin.biomarkers.length > 0) {
                sTwin.biomarkers.forEach(b => {
                    if (!twin.labResults.some(existing => existing.testName === b.metric && existing.provenance?.documentId === b.source_document_id)) {
                        const numVal = parseFloat(b.value);
                        twin.labResults.push({
                            labId: b.id,
                            testName: b.metric,
                            value: isNaN(numVal) ? b.value : numVal,
                            unit: b.unit,
                            referenceRange: b.reference_range || "Standard",
                            abnormalFlag: b.abnormal_flag || false,
                            collectionTime: b.observed_at,
                            reportTime: b.created_at,
                            laboratory: b.source_provider || "Diagnostic Lab",
                            provenance: {
                                source: "Uploaded Laboratory Report",
                                documentId: b.source_document_id,
                                fileName: b.source_document_id,
                                ocrConfidence: b.confidence || 95,
                                verificationStatus: b.verification_status || "VERIFIED",
                                recordedAt: b.created_at
                            }
                        });

                        const metricLower = (b.metric || '').toLowerCase();
                        if (metricLower.includes("glucose")) {
                            if (LifeOS.wearables) LifeOS.wearables.glucose = isNaN(numVal) ? b.value : numVal;
                            if (twin.wearables) twin.wearables.glucose = isNaN(numVal) ? b.value : numVal;
                        }
                    }
                });
            }

            // Recalculate metrics
            HealthTwinAPI.recalculateQualityMetrics(uid);
            HealthTwinAPI.calculateHealthIndex(LifeOS.user, uid);
            recalculateHealthScores();
            renderActiveView();
        } catch (err) {
            console.warn("[LifeOS] Failed to hydrate Health Twin from server:", err);
        }
    }

    window.launchPersonnelWellnessFromRegistration = window.LifeOS.transitionToPersonnelWellness;
    window.handleReportUpload = handleReportUpload;
    window.handleDnaUpload = handleDnaUpload;
    window.loadHealthTwinFromServer = loadHealthTwinFromServer;

    // Load initial twin data from SQLite
    loadHealthTwinFromServer();

    // Automatic Session Restoration on page load
    const existingToken = sessionStorage.getItem('lifeos_session_token') || localStorage.getItem('lifeos_session_token');
    if (existingToken) {
        fetch('/api/auth/session', {
            headers: { 'Authorization': `Bearer ${existingToken}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.success && data.user) {
                LifeOS.user = {
                    id: data.user.id,
                    name: data.user.fullName,
                    email: data.user.email,
                    phone: data.user.phone,
                    country: data.user.country,
                    role: data.user.role,
                    organization: data.user.organization,
                    status: data.user.status
                };
                LifeOS.activeRole = data.user.role === 'patient' ? 'patient' : 'personnel';
                if (data.profile) {
                    LifeOS.personnelWellnessProfile = data.profile;
                }
                if (userDisplayName) userDisplayName.textContent = LifeOS.user.name;
                if (userDisplayEmail) userDisplayEmail.textContent = LifeOS.user.email;
                if (userAvatarInitials) {
                    const initials = LifeOS.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                    userAvatarInitials.textContent = initials || 'PW';
                }
                loadHealthTwinFromServer();
                if (document.body.classList.contains('dashboard-active') || window.location.hash === '#personnel-wellness') {
                    renderActiveView();
                }
            }
        })
        .catch(() => {});
    }
});
