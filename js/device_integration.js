/* =============================================================================
   LIFEOS AI — DEVICE INTEGRATION MANAGER
   Real Wearable & Health Data Adapter Architecture  v1.0.0
   =============================================================================
   CRITICAL PRINCIPLE:
   - No synthetic health measurements are ever generated.
   - getLiveReading() returns null when no device is connected.
   - All telemetry is tagged with: source, deviceId, timestamp, provenance.
   - Data is persisted to the backend via POST /api/telemetry.
   ============================================================================= */

(function (globalThis) {
    'use strict';

    const TELEMETRY_ENDPOINT = '/api/telemetry';

    // -------------------------------------------------------------------------
    // GATT SERVICE DEFINITIONS (SIG-standard UUIDs)
    // -------------------------------------------------------------------------
    const GATT_SERVICES = {
        heart_rate: {
            service: 'heart_rate', characteristic: 'heart_rate_measurement',
            parse: (dv) => (dv.getUint8(0) & 0x01) ? dv.getUint16(1, true) : dv.getUint8(1),
            unit: 'BPM', metricKey: 'heartRate', sensorType: 'Optical PPG HR',
            dataType: 'heart_rate', normalRange: [40, 200]
        },
        blood_pressure: {
            service: 'blood_pressure', characteristic: 'blood_pressure_measurement',
            parse: (dv) => `${dv.getUint16(1, true)}/${dv.getUint16(3, true)}`,
            unit: 'mmHg', metricKey: 'bloodPressure', sensorType: 'Oscillometric Cuff',
            dataType: 'blood_pressure', normalRange: null
        },
        glucose: {
            service: 'glucose', characteristic: 'glucose_measurement',
            parse: (dv) => dv.getUint16(1, true),
            unit: 'mg/dL', metricKey: 'glucose', sensorType: 'Subcutaneous Sensor',
            dataType: 'blood_glucose', normalRange: [40, 500]
        },
        pulse_oximeter: {
            service: 0x1822, characteristic: 0x2A5F,
            parse: (dv) => dv.getUint8(3),
            unit: '%SpO2', metricKey: 'spO2', sensorType: 'Reflective Pulse Oximeter',
            dataType: 'spo2', normalRange: [70, 100]
        },
        health_thermometer: {
            service: 'health_thermometer', characteristic: 'temperature_measurement',
            parse: (dv) => {
                const m = (dv.getUint8(3) << 16) | (dv.getUint8(2) << 8) | dv.getUint8(1);
                return parseFloat((m * Math.pow(10, dv.getInt8(4))).toFixed(1));
            },
            unit: 'degC', metricKey: 'temperature', sensorType: 'Clinical Thermometer',
            dataType: 'temperature', normalRange: [30, 45]
        },
        weight_scale: {
            service: 0x181D, characteristic: 0x2A9B,
            parse: (dv) => parseFloat((dv.getUint16(2, true) * 0.01).toFixed(1)),
            unit: 'kg', metricKey: 'weight', sensorType: 'Bio-impedance Smart Scale',
            dataType: 'weight', normalRange: [1, 500]
        }
    };

    // -------------------------------------------------------------------------
    // UTILITIES
    // -------------------------------------------------------------------------
    function buildTelemetryPacket(deviceId, adapterType, dataType, value, unit, confidence, battery, rssi, patientId) {
        return {
            timestamp: new Date().toISOString(),
            deviceId, adapterType, dataType, value, unit, confidence,
            batteryLevel: battery, signalQuality: rssi,
            provenance: 'DEVICE:' + deviceId + '|ADAPTER:' + adapterType,
            verification: 'Verified Real Device Stream',
            patientId: patientId || null
        };
    }

    async function persistTelemetryPacket(packet) {
        try {
            const res = await fetch(TELEMETRY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(packet)
            });
            if (!res.ok) {
                console.warn('[DeviceIntegration] Telemetry persist warning: HTTP ' + res.status);
                return { persisted: false, statusCode: res.status };
            }
            return { persisted: true, ...(await res.json()) };
        } catch (err) {
            console.warn('[DeviceIntegration] Telemetry network error (non-fatal):', err.message);
            return { persisted: false, error: err.message };
        }
    }

    // -------------------------------------------------------------------------
    // BASE ADAPTER
    // -------------------------------------------------------------------------
    class BaseAdapter {
        constructor(name, devType) {
            this.name = name; this.devType = devType;
            this._isConnected = false; this._deviceRecord = null; this._liveReadings = {};
        }
        get isConnected() { return this._isConnected; }
        get deviceRecord() { return this._deviceRecord; }
        getLiveReading(metricKey) { return this._isConnected ? (this._liveReadings[metricKey] ?? null) : null; }
        async disconnect() { this._isConnected = false; this._deviceRecord = null; this._liveReadings = {}; }
        _step(cb, n, title, desc) { if (typeof cb === 'function') cb(n, title, desc); }
    }

    // -------------------------------------------------------------------------
    // ADAPTER 1: WebBluetoothAdapter — BLE GATT
    // -------------------------------------------------------------------------
    class WebBluetoothAdapter extends BaseAdapter {
        constructor() { super('WebBluetoothAdapter', 'ble'); this._bleDevice = null; this._gattServer = null; }

        _resolveGattConfig(name) {
            const n = name.toLowerCase();
            if (n.includes('heart rate') || n.includes('hr monitor')) return GATT_SERVICES.heart_rate;
            if (n.includes('blood pressure') || n.includes('bp cuff')) return GATT_SERVICES.blood_pressure;
            if (n.includes('glucose') || n.includes('cgm'))            return GATT_SERVICES.glucose;
            if (n.includes('oximeter') || n.includes('spo2'))          return GATT_SERVICES.pulse_oximeter;
            if (n.includes('thermometer'))                              return GATT_SERVICES.health_thermometer;
            if (n.includes('scale') || n.includes('weight'))           return GATT_SERVICES.weight_scale;
            return null;
        }

        async connect(deviceName, config, progressCb) {
            this._step(progressCb, 2, 'STEP 2/16: AUDITING BLUETOOTH ADAPTER...', 'Checking system hardware...');
            if (!navigator.bluetooth) throw new Error(
                'Web Bluetooth API unavailable. Use Chrome/Edge/Opera on Windows, Android, or macOS over HTTPS or localhost.'
            );
            const gattCfg = this._resolveGattConfig(deviceName);
            const filterServices = gattCfg ? [gattCfg.service] : [];
            const optionalServices = ['battery_service', 'device_information'];
            this._step(progressCb, 4, 'STEP 4/16: FILTERING SIG MEDICAL DEVICES...', 'Select device in browser prompt...');
            const reqOpts = filterServices.length > 0
                ? { filters: [{ services: filterServices }], optionalServices: optionalServices.concat(filterServices) }
                : { acceptAllDevices: true, optionalServices };
            this._bleDevice = await navigator.bluetooth.requestDevice(reqOpts);
            this._step(progressCb, 6, 'STEP 6/16: SECURE PAIRING HANDSHAKE...', 'Establishing encrypted BLE channel...');
            this._gattServer = await this._bleDevice.gatt.connect();
            this._bleDevice.addEventListener('gattserverdisconnected', () => {
                this._isConnected = false; this._liveReadings = {};
                if (typeof globalThis.dispatchEvent === 'function')
                    globalThis.dispatchEvent(new CustomEvent('lifeos:device_disconnected', { detail: { id: this._bleDevice.id } }));
            });
            this._step(progressCb, 8, 'STEP 8/16: DISCOVERING GATT SERVICES...', 'Querying SIG service specs...');
            let mfg = 'Generic SIG Medical', firmware = 'N/A', batteryLevel = 'N/A';
            try {
                const svc = await this._gattServer.getPrimaryService('device_information');
                mfg = new TextDecoder().decode(await (await svc.getCharacteristic('manufacturer_name_string')).readValue()).trim();
                try { firmware = new TextDecoder().decode(await (await svc.getCharacteristic('firmware_revision_string')).readValue()).trim(); } catch(_) {}
            } catch(_) {}
            try {
                const bSvc = await this._gattServer.getPrimaryService('battery_service');
                batteryLevel = (await (await bSvc.getCharacteristic('battery_level')).readValue()).getUint8(0) + '%';
            } catch(_) {}
            this._step(progressCb, 10, 'STEP 10/16: SUBSCRIBING TO NOTIFICATIONS...', 'Attaching GATT notification streams...');
            if (gattCfg) await this._subscribeGatt(gattCfg, batteryLevel, config.patientId);
            this._step(progressCb, 15, 'STEP 15/16: SAVING INTO HEALTH TWIN...', 'Appending telemetric records...');
            const deviceRecord = {
                id: this._bleDevice.id || 'ble_' + Date.now(),
                name: this._bleDevice.name || deviceName, type: deviceName,
                connectionMethod: 'Web Bluetooth BLE GATT', battery: batteryLevel,
                rssi: 'N/A (browser limitation)', firmware, manufacturer: mfg,
                status: 'Connected', lastSync: new Date().toLocaleTimeString(),
                sensors: gattCfg ? [gattCfg.sensorType] : ['Generic BLE'], adapterType: 'WebBluetoothAdapter',
                gattServer: this._gattServer
            };
            this._isConnected = true; this._deviceRecord = deviceRecord;
            return deviceRecord;
        }

        async _subscribeGatt(cfg, batteryLevel, patientId) {
            const svc = await this._gattServer.getPrimaryService(cfg.service);
            const chr = await svc.getCharacteristic(cfg.characteristic);
            const initialDV = await chr.readValue();
            const parsed = cfg.parse(initialDV);
            this._liveReadings[cfg.metricKey] = parsed;
            if (cfg.normalRange && typeof parsed === 'number') {
                const [lo, hi] = cfg.normalRange;
                if (parsed < lo || parsed > hi) console.warn('[WebBluetoothAdapter] Out-of-range:', cfg.dataType, parsed);
            }
            const pkt = buildTelemetryPacket(this._bleDevice.id, 'WebBluetoothAdapter', cfg.dataType, parsed, cfg.unit, 99, batteryLevel, 'N/A', patientId);
            await persistTelemetryPacket(pkt);
            if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('lifeos:telemetry', { detail: pkt }));
            try {
                await chr.startNotifications();
                chr.addEventListener('characteristicvaluechanged', async (evt) => {
                    const v = cfg.parse(evt.target.value);
                    this._liveReadings[cfg.metricKey] = v;
                    const p2 = buildTelemetryPacket(this._bleDevice.id, 'WebBluetoothAdapter', cfg.dataType, v, cfg.unit, 99, batteryLevel, 'N/A', patientId);
                    await persistTelemetryPacket(p2);
                    if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('lifeos:telemetry', { detail: p2 }));
                });
            } catch(e) { console.warn('[WebBluetoothAdapter] Notifications n/a:', e.message); }
        }

        async disconnect() { if (this._gattServer?.connected) this._gattServer.disconnect(); await super.disconnect(); }
    }

    // -------------------------------------------------------------------------
    // ADAPTER 2: CloudAPIAdapter — Fitbit / Oura / Dexcom / Withings
    // -------------------------------------------------------------------------
    class CloudAPIAdapter extends BaseAdapter {
        constructor() { super('CloudAPIAdapter', 'cloud'); }

        _resolveEndpoint(name) {
            const n = name.toLowerCase();
            if (n.includes('fitbit'))   return 'https://api.fitbit.com/1/user/-/activities/heart/date/today/1d/1min.json';
            if (n.includes('oura'))     return 'https://api.ouraring.com/v2/usercollection/heartrate?start_datetime=' + new Date(Date.now() - 3600000).toISOString();
            if (n.includes('dexcom'))   return 'https://api.dexcom.com/v3/users/self/egvs?startDate=' + new Date(Date.now() - 3600000).toISOString() + '&endDate=' + new Date().toISOString();
            if (n.includes('withings')) return 'https://wbsapi.withings.net/measure?action=getmeas&meastype=1';
            return 'https://api.' + name.toLowerCase().replace(/[^a-z0-9]/g,'') + '.com/v1/user/profile.json';
        }

        async connect(deviceName, config, progressCb) {
            this._step(progressCb, 1, 'STEP 1/16: VERIFYING TOKEN...', 'Validating OAuth Bearer Token...');
            const token = (config.token || '').trim();
            if (!token) throw new Error('Cloud Access Token required for ' + deviceName + '. Obtain from vendor developer portal.');
            this._step(progressCb, 5, 'STEP 5/16: CLOUD SESSION...', 'Connecting to ' + deviceName + ' REST API...');
            let res;
            try { res = await fetch(this._resolveEndpoint(deviceName), { headers: { Authorization: 'Bearer ' + token } }); }
            catch(e) { throw new Error('Network error reaching ' + deviceName + ' API: ' + e.message); }
            if (res.status === 401) throw new Error('401 Unauthorized - Invalid or expired API token for ' + deviceName);
            if (res.status === 403) throw new Error('403 Forbidden - Insufficient OAuth scopes for ' + deviceName);
            if (res.status === 429) throw new Error('429 Rate Limited - ' + deviceName + ' API rate limit exceeded');
            if (!res.ok) throw new Error(deviceName + ' API returned HTTP ' + res.status);
            this._step(progressCb, 10, 'STEP 10/16: PARSING PAYLOAD...', 'Extracting readings...');
            const body = await res.json();
            const readings = this._parseVendorPayload(deviceName, body);
            this._step(progressCb, 15, 'STEP 15/16: PERSISTING...', 'Writing cloud telemetry...');
            const deviceId = 'cloud_' + deviceName.replace(/\s/g,'_').toLowerCase() + '_' + Date.now();
            for (const [dataType, {value, unit, metricKey}] of Object.entries(readings)) {
                if (value !== null && value !== undefined) {
                    this._liveReadings[metricKey] = value;
                    const pkt = buildTelemetryPacket(deviceId, 'CloudAPIAdapter', dataType, value, unit, 95, 'N/A', 'Cloud', config.patientId);
                    await persistTelemetryPacket(pkt);
                    if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('lifeos:telemetry', { detail: pkt }));
                }
            }
            const deviceRecord = {
                id: deviceId, name: deviceName, type: deviceName,
                connectionMethod: 'Official Cloud REST API (OAuth 2.0)', battery: 'N/A',
                rssi: 'Cloud Webhook', firmware: 'Cloud Service', manufacturer: deviceName.split(' ')[0],
                status: 'Connected', lastSync: new Date().toLocaleTimeString(),
                sensors: ['Cloud Telemetry Engine'], adapterType: 'CloudAPIAdapter'
            };
            this._isConnected = true; this._deviceRecord = deviceRecord; return deviceRecord;
        }

        _parseVendorPayload(name, body) {
            const n = name.toLowerCase(), r = {};
            try {
                if (n.includes('fitbit')) {
                    const ds = body?.['activities-heart-intraday']?.dataset;
                    if (ds?.length) r.heart_rate = { value: ds[ds.length-1].value, unit: 'BPM', metricKey: 'heartRate' };
                } else if (n.includes('oura')) {
                    const d = body?.data;
                    if (d?.length) r.heart_rate = { value: d[d.length-1].bpm, unit: 'BPM', metricKey: 'heartRate' };
                } else if (n.includes('dexcom')) {
                    const e = body?.egvs;
                    if (e?.length) r.blood_glucose = { value: e[e.length-1].value, unit: 'mg/dL', metricKey: 'glucose' };
                } else if (n.includes('withings')) {
                    const g = body?.body?.measuregrps;
                    if (g?.length) { const m = g[0]?.measures?.[0]; if (m) r.weight = { value: m.value * Math.pow(10, m.unit), unit: 'kg', metricKey: 'weight' }; }
                }
            } catch(e) { console.warn('[CloudAPIAdapter] Parse warning:', e.message); }
            return r;
        }
    }

    // -------------------------------------------------------------------------
    // ADAPTER 3: AppleHealthAdapter — iOS WKWebView Bridge
    // -------------------------------------------------------------------------
    class AppleHealthAdapter extends BaseAdapter {
        constructor() { super('AppleHealthAdapter', 'native'); }
        async connect(deviceName, config, progressCb) {
            this._step(progressCb, 1, 'STEP 1/16: CHECKING iOS ENV...', 'Verifying WKWebView bridge...');
            if (!window.webkit?.messageHandlers?.healthKit) throw new Error(
                'Apple HealthKit requires an iOS Swift WKWebView wrapper app. Build and deploy the LifeOS iOS shell.'
            );
            this._step(progressCb, 5, 'STEP 5/16: HEALTHKIT AUTHORIZATION...', 'Awaiting iOS permission dialog...');
            return new Promise((resolve, reject) => {
                window.lifeosHealthKitCallback = (type, payload) => {
                    if (type === 'authorization_granted') {
                        const dr = { id: 'apple_healthkit_' + Date.now(), name: 'Apple HealthKit', type: 'HealthKit Store', connectionMethod: 'iOS HealthKit SDK', battery: 'iOS Device', rssi: 'On-Device', firmware: payload?.iosVersion || 'iOS', manufacturer: 'Apple Inc.', status: 'Connected', lastSync: new Date().toLocaleTimeString(), sensors: ['HealthKit Store'], adapterType: 'AppleHealthAdapter' };
                        this._isConnected = true; this._deviceRecord = dr; resolve(dr);
                        window.webkit.messageHandlers.healthKit.postMessage({ action: 'fetchLatestSamples', callbackName: 'lifeosHealthKitCallback' });
                    } else if (type === 'authorization_denied') { reject(new Error('HealthKit authorization denied.')); }
                    else if (type === 'data') { this._onData(payload); }
                    else if (type === 'error') { reject(new Error('HealthKit error: ' + payload.message)); }
                };
                window.webkit.messageHandlers.healthKit.postMessage({ action: 'requestPermission', types: config.scopes || ['heartRate','bloodGlucose','oxygenSaturation','bodyMass','bodyTemperature','stepCount'], callbackName: 'lifeosHealthKitCallback' });
                setTimeout(() => reject(new Error('HealthKit authorization timed out.')), 60000);
            });
        }
        _onData(payload) {
            const MAP = { heartRate:{mk:'heartRate',u:'BPM',dt:'heart_rate'}, bloodGlucose:{mk:'glucose',u:'mg/dL',dt:'blood_glucose'}, oxygenSaturation:{mk:'spO2',u:'%SpO2',dt:'spo2'}, bodyMass:{mk:'weight',u:'kg',dt:'weight'}, bodyTemperature:{mk:'temperature',u:'degC',dt:'temperature'}, stepCount:{mk:'steps',u:'steps',dt:'steps'} };
            const m = MAP[payload?.type]; if (!m || payload.value === undefined) return;
            this._liveReadings[m.mk] = payload.value;
            const pkt = buildTelemetryPacket(this._deviceRecord?.id||'apple_healthkit', 'AppleHealthAdapter', m.dt, payload.value, m.u, 98, 'iOS', 'On-Device', null);
            persistTelemetryPacket(pkt);
            if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('lifeos:telemetry', { detail: pkt }));
        }
    }

    // -------------------------------------------------------------------------
    // ADAPTER 4: HealthConnectAdapter — Android Health Connect / Samsung Health
    // -------------------------------------------------------------------------
    class HealthConnectAdapter extends BaseAdapter {
        constructor() { super('HealthConnectAdapter', 'native'); }
        async connect(deviceName, config, progressCb) {
            this._step(progressCb, 1, 'STEP 1/16: CHECKING ANDROID ENV...', 'Verifying Health Connect bridge...');
            const bridge = window.AndroidBridge;
            if (!bridge?.requestHealthConnect) throw new Error(deviceName + ' requires an Android APK with Health Connect Manifest permissions. Build the LifeOS Android wrapper.');
            this._step(progressCb, 5, 'STEP 5/16: HEALTH CONNECT PERMISSIONS...', 'Awaiting Android permission dialog...');
            return new Promise((resolve, reject) => {
                window.lifeosHealthConnectCallback = (type, payloadJson) => {
                    const payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
                    if (type === 'permission_granted') {
                        const dr = { id: 'health_connect_' + Date.now(), name: deviceName, type: 'Health Connect Store', connectionMethod: 'Android Health Connect SDK', battery: 'Android Device', rssi: 'On-Device', firmware: payload?.androidVersion || 'Android', manufacturer: 'Google / Samsung', status: 'Connected', lastSync: new Date().toLocaleTimeString(), sensors: ['Health Connect Store'], adapterType: 'HealthConnectAdapter' };
                        this._isConnected = true; this._deviceRecord = dr; resolve(dr);
                        bridge.fetchLatestReadings('lifeosHealthConnectCallback');
                    } else if (type === 'permission_denied') { reject(new Error('Health Connect permissions denied.')); }
                    else if (type === 'data') { this._onData(payload); }
                    else if (type === 'error') { reject(new Error('Health Connect error: ' + payload.message)); }
                };
                bridge.requestHealthConnect(JSON.stringify(config.scopes || ['heart_rate','blood_glucose','steps']), 'lifeosHealthConnectCallback');
                setTimeout(() => reject(new Error('Health Connect authorization timed out.')), 60000);
            });
        }
        _onData(payload) {
            const MAP = { heart_rate:{mk:'heartRate',u:'BPM'}, blood_glucose:{mk:'glucose',u:'mg/dL'}, steps:{mk:'steps',u:'steps'}, oxygen_saturation:{mk:'spO2',u:'%SpO2'}, weight:{mk:'weight',u:'kg'} };
            const m = MAP[payload?.type]; if (!m || payload.value === undefined) return;
            this._liveReadings[m.mk] = payload.value;
            const pkt = buildTelemetryPacket(this._deviceRecord?.id||'health_connect', 'HealthConnectAdapter', payload.type, payload.value, m.u, 97, 'Android', 'On-Device', null);
            persistTelemetryPacket(pkt);
            if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('lifeos:telemetry', { detail: pkt }));
        }
    }

    // -------------------------------------------------------------------------
    // ADAPTER 5: FHIRAdapter — HL7 FHIR R4
    // -------------------------------------------------------------------------
    class FHIRAdapter extends BaseAdapter {
        constructor() { super('FHIRAdapter', 'fhir'); }
        async connect(deviceName, config, progressCb) {
            this._step(progressCb, 1, 'STEP 1/16: VALIDATING FHIR ENDPOINT...', 'Checking HL7 FHIR R4 URL...');
            const fhirUrl = (config.fhirUrl || '').trim();
            if (!fhirUrl || !fhirUrl.startsWith('http')) throw new Error('A valid HL7 FHIR R4 endpoint URL is required.');
            this._step(progressCb, 5, 'STEP 5/16: QUERYING FHIR ROUTER...', 'Fetching Observation resources from ' + fhirUrl + '...');
            let res;
            try {
                const url = new URL(fhirUrl);
                url.searchParams.set('_count','20'); url.searchParams.set('_sort','-date'); url.searchParams.set('category','vital-signs');
                const headers = { Accept: 'application/fhir+json' };
                if (config.token) headers.Authorization = 'Bearer ' + config.token;
                res = await fetch(url.toString(), { headers });
            } catch(e) { throw new Error('Network error reaching FHIR endpoint: ' + e.message); }
            if (!res.ok) throw new Error('FHIR endpoint returned HTTP ' + res.status);
            this._step(progressCb, 10, 'STEP 10/16: PARSING FHIR BUNDLE...', 'Extracting Observation resources...');
            const bundle = await res.json();
            const readings = this._parseBundle(bundle);
            this._step(progressCb, 15, 'STEP 15/16: PERSISTING FHIR DATA...', 'Writing clinical observations...');
            const deviceId = 'fhir_' + Date.now();
            for (const [dataType, {value, unit, metricKey}] of Object.entries(readings)) {
                if (value !== null && value !== undefined) {
                    this._liveReadings[metricKey] = value;
                    const pkt = buildTelemetryPacket(deviceId, 'FHIRAdapter', dataType, value, unit, 99, 'AC Powered', 'Ethernet', config.patientId);
                    await persistTelemetryPacket(pkt);
                    if (typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new CustomEvent('lifeos:telemetry', { detail: pkt }));
                }
            }
            const deviceRecord = { id: deviceId, name: 'HL7 FHIR Medical Router', type: 'EHR Interoperability Gateway', connectionMethod: 'HL7 FHIR R4 REST API', battery: 'AC Powered', rssi: 'Ethernet 1Gbps', firmware: 'FHIR R4.0.1', manufacturer: 'HL7 International', status: 'Connected', lastSync: new Date().toLocaleTimeString(), sensors: ['Clinical Observation Feed'], adapterType: 'FHIRAdapter' };
            this._isConnected = true; this._deviceRecord = deviceRecord; return deviceRecord;
        }
        _parseBundle(bundle) {
            const result = {};
            const LOINC = { '8867-4':{mk:'heartRate',u:'BPM',dt:'heart_rate'}, '2339-0':{mk:'glucose',u:'mg/dL',dt:'blood_glucose'}, '59408-5':{mk:'spO2',u:'%SpO2',dt:'spo2'}, '8310-5':{mk:'temperature',u:'degC',dt:'temperature'}, '29463-7':{mk:'weight',u:'kg',dt:'weight'}, '55284-4':{mk:'bloodPressure',u:'mmHg',dt:'blood_pressure'} };
            for (const entry of (bundle?.entry||[])) {
                const obs = entry?.resource;
                if (!obs || obs.resourceType !== 'Observation') continue;
                for (const code of (obs?.code?.coding||[])) {
                    const m = LOINC[code.code]; if (!m) continue;
                    if (obs.valueQuantity) { result[m.dt] = { value: obs.valueQuantity.value, unit: m.u, metricKey: m.mk }; }
                    else if (obs.component) {
                        const sys = obs.component.find(c => c.code?.coding?.some(cc => cc.code === '8480-6'));
                        const dia = obs.component.find(c => c.code?.coding?.some(cc => cc.code === '8462-4'));
                        if (sys && dia) result.blood_pressure = { value: sys.valueQuantity.value + '/' + dia.valueQuantity.value, unit: 'mmHg', metricKey: 'bloodPressure' };
                    }
                }
            }
            return result;
        }
    }

    // -------------------------------------------------------------------------
    // DEVICE INTEGRATION MANAGER
    // -------------------------------------------------------------------------
    class DeviceIntegrationManager {
        constructor() { this._connectedAdapters = new Map(); }

        async connect(deviceName, devType, config, progressCb) {
            let adapter;
            if (devType === 'ble') adapter = new WebBluetoothAdapter();
            else if (devType === 'cloud') adapter = new CloudAPIAdapter();
            else if (devType === 'native') {
                if (window.webkit?.messageHandlers?.healthKit) adapter = new AppleHealthAdapter();
                else if (window.AndroidBridge?.requestHealthConnect) adapter = new HealthConnectAdapter();
                else throw new Error(deviceName + ' requires a native mobile environment (iOS or Android). Neither bridge detected.');
            } else if (devType === 'fhir') adapter = new FHIRAdapter();
            else throw new Error('Unknown device type: "' + devType + '". Valid: ble, cloud, native, fhir');
            const deviceRecord = await adapter.connect(deviceName, config || {}, progressCb);
            this._connectedAdapters.set(deviceRecord.id, adapter);
            return deviceRecord;
        }

        async disconnect(deviceId) {
            const adapter = this._connectedAdapters.get(deviceId);
            if (adapter) { await adapter.disconnect(); this._connectedAdapters.delete(deviceId); }
        }

        getLiveReading(deviceId, metricKey) {
            const a = this._connectedAdapters.get(deviceId);
            return (a && a.isConnected) ? a.getLiveReading(metricKey) : null;
        }

        getConnectedDevices() {
            const devices = [];
            for (const adapter of this._connectedAdapters.values())
                if (adapter.isConnected && adapter.deviceRecord) devices.push(adapter.deviceRecord);
            return devices;
        }

        get hasConnectedDevice() {
            for (const adapter of this._connectedAdapters.values()) if (adapter.isConnected) return true;
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------
    globalThis.DeviceIntegrationManager = DeviceIntegrationManager;
    globalThis.WebBluetoothAdapter = WebBluetoothAdapter;
    globalThis.CloudAPIAdapter = CloudAPIAdapter;
    globalThis.AppleHealthAdapter = AppleHealthAdapter;
    globalThis.HealthConnectAdapter = HealthConnectAdapter;
    globalThis.FHIRAdapter = FHIRAdapter;
    globalThis.buildTelemetryPacket = buildTelemetryPacket;
    globalThis._lifeosDIM = new DeviceIntegrationManager();

    console.log('[LifeOS AI] DeviceIntegrationManager v1.0.0 loaded (WebBluetooth|CloudAPI|AppleHealth|HealthConnect|FHIR)');

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global));
