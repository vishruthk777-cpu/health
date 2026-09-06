/* ==================================================
   LIFEOS AI - CORE INTERACTIVE SITE LOGIC
   ================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. NAVBAR SCROLL PROTOCOL ---
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile Navigation Toggle
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (mobileToggle && navbar) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navbar.classList.toggle('mobile-menu-active');
        });

        // Close menu when clicking a link
        if (navLinks) {
            navLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    navbar.classList.remove('mobile-menu-active');
                });
            });
        }

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navbar.contains(e.target)) {
                navbar.classList.remove('mobile-menu-active');
            }
        });
    }

    // --- 2. HERO CANVAS: NEURAL NETWORK PARTICLES ---
    let heroAnimId = null;
    let helixAnimId = null;
    let telemetryIntervalId = null;
    let landingAnimationsRunning = true;

    // Expose a global stop function for dashboard.js to call
    window.__stopLandingAnimations = function() {
        landingAnimationsRunning = false;
        if (heroAnimId) { cancelAnimationFrame(heroAnimId); heroAnimId = null; }
        if (helixAnimId) { cancelAnimationFrame(helixAnimId); helixAnimId = null; }
        if (telemetryIntervalId) { clearInterval(telemetryIntervalId); telemetryIntervalId = null; }
    };

    window.__resumeLandingAnimations = function() {
        // Reload the page to cleanly reinitialize all canvas animations
        window.location.reload();
    };

    const heroCanvas = document.getElementById('hero-canvas');
    if (heroCanvas) {
        const ctx = heroCanvas.getContext('2d');
        let particles = [];
        let width = (heroCanvas.width = window.innerWidth);
        let height = (heroCanvas.height = window.innerHeight);

        window.addEventListener('resize', () => {
            width = (heroCanvas.width = window.innerWidth);
            height = (heroCanvas.height = window.innerHeight);
        });

        const mouse = { x: null, y: null, radius: 150 };
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });
        window.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.radius = Math.random() * 2 + 1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > width) this.vx = -this.vx;
                if (this.y < 0 || this.y > height) this.vy = -this.vy;

                if (mouse.x !== null && mouse.y !== null) {
                    const dx = this.x - mouse.x;
                    const dy = this.y - mouse.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < mouse.radius) {
                        const force = (mouse.radius - dist) / mouse.radius;
                        this.x += (dx / dist) * force * 1.5;
                        this.y += (dy / dist) * force * 1.5;
                    }
                }
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
                ctx.fill();
            }
        }

        const numParticles = Math.min(60, Math.floor((width * height) / 20000));
        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle());
        }

        function animateHero() {
            ctx.clearRect(0, 0, width, height);
            
            particles.forEach((p) => {
                p.update();
                p.draw();
            });

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(144, 97, 249, ${0.12 * (1 - dist / 120)})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }
            if (landingAnimationsRunning) {
                heroAnimId = requestAnimationFrame(animateHero);
            }
        }
        animateHero();
    }

    // --- 3. TIMELINES INTERSECTION OBSERVER ---
    const timelineSteps = document.querySelectorAll('.timeline-step');
    if (timelineSteps.length > 0) {
        const observerOptions = { root: null, rootMargin: '0px', threshold: 0.5 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, observerOptions);
        timelineSteps.forEach(step => observer.observe(step));
    }

    // --- 4. DIGITAL HEALTH TWIN INTERACTIVE PANEL ---
    const twinNodes = document.querySelectorAll('.twin-node-group');
    const twinTitle = document.getElementById('twin-panel-title');
    const twinStats = document.getElementById('twin-panel-stats');

    const organTelemetry = {
        brain: {
            title: "SYSTEM: NEURAL CORE",
            metrics: [
                { label: "Cognitive Integrity", val: "98.4%", alert: "green" },
                { label: "Deep Sleep Ratio", val: "24.5%", alert: "green" },
                { label: "Cortisol Level", val: "8.2 mcg/dL", alert: "white" },
                { label: "Neuro-Risk Factor", val: "Low (0.12)", alert: "green" }
            ]
        },
        heart: {
            title: "SYSTEM: CARDIOVASCULAR",
            metrics: [
                { label: "Resting Heart Rate", val: "58 BPM", alert: "green" },
                { label: "Heart Rate Variability", val: "72 ms", alert: "green" },
                { label: "Arterial Stiffness (PWV)", val: "6.1 m/s", alert: "green" },
                { label: "Atherogenic Index (ApoB/A1)", val: "0.82", alert: "yellow" }
            ]
        },
        vascular: {
            title: "SYSTEM: VASCULAR CIRCULATION",
            metrics: [
                { label: "Mean Arterial Pressure", val: "84 mmHg", alert: "green" },
                { label: "Endothelial Performance", val: "94%", alert: "green" },
                { label: "Microvascular Reserve", val: "Optimal", alert: "green" },
                { label: "Systemic Inflamm. (hs-CRP)", val: "2.1 mg/L", alert: "yellow" }
            ]
        },
        digestive: {
            title: "SYSTEM: METABOLIC / DIGESTIVE",
            metrics: [
                { label: "Microbiome Diversity Index", val: "82/100", alert: "green" },
                { label: "Gut Wall Integrity (Zonulin)", val: "Normal", alert: "green" },
                { label: "Insulin Sensitivity (HOMA-IR)", val: "1.1", alert: "green" },
                { label: "SCFA Acid Production Profile", val: "High", alert: "green" }
            ]
        },
        cellular: {
            title: "SYSTEM: GENOMIC / CHROMOSOME",
            metrics: [
                { label: "Telomere Conservation Rate", val: "94.2%", alert: "green" },
                { label: "Epigenetic Age Acceleration", val: "-4.2 Years", alert: "green" },
                { label: "DNA Methylation Accuracy", val: "99.8%", alert: "green" },
                { label: "MTHFR Methylation Sensitivity", val: "Heterozygous", alert: "yellow" }
            ]
        }
    };

    if (twinNodes.length > 0) {
        twinNodes.forEach(node => {
            node.addEventListener('click', () => {
                twinNodes.forEach(n => n.classList.remove('active'));
                node.classList.add('active');

                const organ = node.getAttribute('data-organ');
                const data = organTelemetry[organ];
                if (data && twinTitle && twinStats) {
                    twinTitle.textContent = data.title;
                    twinStats.innerHTML = `
                        <div class="stat-row" style="grid-column: span 2; text-align: center; color: var(--text-slate); font-size: 0.75rem; padding: 10px 0;">
                            No verified data available. Upload or connect your information to continue.
                        </div>
                    `;
                }
            });
        });
    }

    // --- 5. AUTONOMOUS AI AGENT ECOSYSTEM CONSOLE LOGS ---
    const agentCards = document.querySelectorAll('.agent-card');
    const consoleLog = document.getElementById('agent-console-log');

    const agentLogsMock = {
        cmo: [
            "[CMO Agent] Initializing secure diagnostic alignment loop...",
            "[CMO Agent] Cross-referencing inputs from Diagnostic & Genome agents.",
            "[CMO Agent] Compiling final health trajectory report: Stable.",
            "[CMO Agent] Dispatched recommendation: Supplement active methylfolate."
        ],
        diagnostic: [
            "[Diagnostic Agent] Analyzing systemic blood chemistry data...",
            "[Diagnostic Agent] Flagged Hemoglobin A1c elevation at 5.8%.",
            "[Diagnostic Agent] hs-CRP recorded at 2.1 mg/L (Moderate Risk).",
            "[Diagnostic Agent] Dispatching vector profile to CMO Agent."
        ],
        genome: [
            "[Genome Agent] Mapping 3.2B base pairs for hereditary risk markers...",
            "[Genome Agent] Flagged heterozygous variant in MTHFR (C677T).",
            "[Genome Agent] ApoE status: E3/E4 carrier (elevated cardiovascular risk).",
            "[Genome Agent] Pushing pharmacogenomics profile to Drug Intel."
        ],
        research: [
            "[Research Agent] Scanned PubMed and ClinicalTrials database...",
            "[Research Agent] Found 3 matching trials for ApoE4 lipid clearance.",
            "[Research Agent] Pulling reference: NCT0491822 study at Cleveland Clinic.",
            "[Research Agent] Compiled abstract translated to patient-friendly digest."
        ],
        drug: [
            "[Drug Intelligence Agent] Evaluating drug-clearance pathways...",
            "[Drug Intelligence Agent] CYP2C19 variant mapping: Intermediate metabolizer.",
            "[Drug Intelligence Agent] Flagging Metformin and aspirin clearance index.",
            "[Drug Intelligence Agent] Zero interactions detected with present schedule."
        ],
        nutrition: [
            "[Nutrition Agent] Loading genomic carb sensitivity profiles...",
            "[Nutrition Agent] Computed optimal macronutrient threshold: 35/35/30.",
            "[Nutrition Agent] Restricting saturated lipid ratios due to ApoE4 profile.",
            "[Nutrition Agent] Meal timeline dispatched to secure bio-vault."
        ],
        longevity: [
            "[Longevity Agent] Computing Horvath DNA methylation metrics...",
            "[Longevity Agent] Cellular age acceleration delta: -4.2 Years.",
            "[Longevity Agent] Optimizing NAD+ precursor loading intervals.",
            "[Longevity Agent] Longevity operating timeline updated successfully."
        ],
        mental: [
            "[Mental Health Agent] Fetching nocturnal HRV parameters...",
            "[Mental Health Agent] Average HRV: 74ms (High parasympathetic recovery).",
            "[Mental Health Agent] Sleep stages: REM ratio 22%, Deep sleep 20% (Optimal).",
            "[Mental Health Agent] Burnout indicators: Minimal stress burden."
        ],
        emergency: [
            "[Emergency Agent] Monitoring real-time 1Hz heart rate telemetry...",
            "[Emergency Agent] Pulse: 62 BPM. Oxygen saturation: 98% (Stable).",
            "[Emergency Agent] Background stroke and anomaly filters: Zero flags.",
            "[Emergency Agent] Connection TLS 1.3 encrypted."
        ],
        coordination: [
            "[Care Coordination Agent] Checking clinician calendar schedules...",
            "[Care Coordination Agent] Scheduling baseline lipid panel follow-up for 2026.",
            "[Care Coordination Agent] Pushing encrypted files to board-certified provider.",
            "[Care Coordination Agent] Workflow coordination complete."
        ]
    };

    if (agentCards.length > 0 && consoleLog) {
        agentCards.forEach(card => {
            card.addEventListener('click', () => {
                agentCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                const agentKey = card.getAttribute('data-agent');
                const logs = agentLogsMock[agentKey] || [];
                
                consoleLog.innerHTML = '';
                let index = 0;

                function writeLogLine() {
                    if (index < logs.length) {
                        const line = document.createElement('p');
                        line.className = 'log-line text-cyan';
                        line.textContent = logs[index];
                        consoleLog.appendChild(line);
                        consoleLog.scrollTop = consoleLog.scrollHeight;
                        index++;
                        setTimeout(writeLogLine, 400);
                    }
                }
                writeLogLine();
            });
        });
    }

    // --- 6. WORKFLOW STEPPER INTERACTIVITY ---
    const stepCards = document.querySelectorAll('.step-card');
    if (stepCards.length > 0) {
        stepCards.forEach(card => {
            card.addEventListener('click', () => {
                stepCards.forEach(s => s.classList.remove('active'));
                card.classList.add('active');
            });
        });
    }

    // --- 7. MEDICAL REPORT DECODER ---
    const fileBtns = document.querySelectorAll('.analyzer-file-btn');
    const laser = document.getElementById('scanner-laser');
    const documentPreview = document.getElementById('document-preview-text');
    const resultsContent = document.getElementById('analyzer-results-content');

    const documentMockData = {
        blood: {
            preview: `
LifeOS Laboratory Services v2.1
PATIENT ID: L-OS_99182
DATE: 2026-06-15

METABOLIC BIOMARKERS:
------------------------------------------
Glucose (Fasting)   | 98 mg/dL    | NORMAL
Hemoglobin A1c      | 5.8 %       | ELEVATED (H)
LDL Cholesterol     | 138 mg/dL   | HIGH (H)
HDL Cholesterol     | 48 mg/dL    | NORMAL
Triglycerides       | 162 mg/dL   | BORDERLINE HIGH (H)
hs-CRP              | 2.1 mg/L    | MODERATE RISK (H)
ApoB                | 112 mg/dL   | ELEVATED (H)
            `,
            results: `
                <p class="text-xs"><strong>A1c Elevation (5.8%):</strong> Indication of pre-diabetic metabolic drift. LifeOS recommends macronutrient adjustments to mitigate path development.</p>
                <p class="text-xs mt-xxs"><strong>ApoB Warning (112 mg/dL):</strong> High atherogenic lipid count. Cardiovascular risk factors are elevated; lipid clearance interventions recommended.</p>
            `
        },
        ecg: {
            preview: `
LifeOS Cardio Scan Protocol v9.12
PATIENT ID: L-OS_99182
DATE: 2026-06-20

CARDIAC PERFORMANCE SUMMARY:
------------------------------------------
Resting Heart Rate  | 60 BPM
PR Interval         | 152 ms      | NORMAL
QRS Duration        | 94 ms       | NORMAL
QTc Interval        | 418 ms      | NORMAL
ST Segment          | Elevated    | ANOMALY DETECTED (H)
Arrhythmia Flag     | Positive    | AFIB TRIGGER BLOCK
            `,
            results: `
                <p class="text-xs"><strong>ST Segment Elevation:</strong> Minor segment elevation logged during high-intensity stress frames. High-resolution stress check suggested.</p>
                <p class="text-xs mt-xxs"><strong>Nocturnal AFib Watch:</strong> Intermittent nocturnal ectopics noted. Polling emergency watcher for baseline confirmations.</p>
            `
        },
        genomics: {
            preview: `
LifeOS Helix Mapping Registry v3.0
PATIENT ID: L-OS_99182
DATE: 2026-06-01

GENOMIC LOCI SEQUENCING REPORT:
------------------------------------------
MTHFR (C677T)       | Heterozygous| MODIFIED METHYLATION
APOE (rs429358)     | E3/E4       | INCREASED ALZHEIMER'S RISK
TCF7L2 (rs7903146)  | Genotype CT | ELEVATED TYPE 2 DIABETES RISK
ACTN3 (rs1815739)   | Genotype RR | POWER ATHLETE VARIANT
            `,
            results: `
                <p class="text-xs"><strong>APOE E3/E4 Status:</strong> Conveys a 2-3x relative hazard risk for late-onset neurological degradation. Prioritize saturated lipid limits and sleep health.</p>
                <p class="text-xs mt-xxs"><strong>MTHFR Methylation Sensitivity:</strong> Heterozygous carrier, causing 30% folate absorption deficit. Supplementing methylfolate bypasses this pathway.</p>
            `
        }
    };

    if (fileBtns.length > 0 && laser) {
        fileBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                fileBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                laser.style.animation = 'none';
                laser.offsetHeight; // reflow
                laser.style.animation = 'scannerSweep 1.5s ease-in-out';

                if (documentPreview) documentPreview.innerHTML = `<pre class="text-xs text-mono text-slate">Decrypting database blocks...</pre>`;
                if (resultsContent) resultsContent.innerHTML = `<p class="text-xs text-slate">Analyzing digital file signatures...</p>`;

                setTimeout(() => {
                    if (documentPreview) documentPreview.innerHTML = `<pre class="text-xs text-mono text-slate">No verified data available.</pre>`;
                    if (resultsContent) resultsContent.innerHTML = `<p class="text-xs text-yellow">No verified data available. Upload or connect your information to continue.</p>`;
                }, 1200);
            });
        });
    }

    // --- 8. AI HEALTH SEARCH ENGINE ---
    const searchInput = document.getElementById('health-search-input');
    const searchBtn = document.getElementById('btn-health-search');
    const searchPresetBtns = document.querySelectorAll('.btn-search-preset');
    const searchResultsPanel = document.getElementById('search-results-panel');
    const searchResultsContent = document.getElementById('search-results-content');

    const searchResponses = {
        tired: "Analysis: Fatigue reports map to multiple systems. Genomics show heterozygous MTHFR (reduced methylation recovery). Telemetry logs indicate a reactive glucose crash to 64mg/dL postprandial yesterday. Action: Limit carbohydrate density, load methyl-B12, and check sleep deep-stages ratio.",
        sugar: "Analysis: Fasting A1c is elevated at 5.8% (pre-diabetic range). Wearable CGM telemetry shows insulin spikes above 148mg/dL after simple glucose inputs. Pushing low-glycemic meal schedule to Nutrition Agent.",
        sleep: "Analysis: Sleep stages log average 6.2 hours (REM/Deep ratio 34%). Disruptions correlate directly with late-phase food consumption and elevated ambient HR. Action: Keep eating window under 8 hours and stop inputs 3 hours before sleep."
    };

    function executeHealthSearch(query) {
        if (!searchResultsPanel || !searchResultsContent) return;
        searchResultsPanel.classList.remove('hide');
        searchResultsContent.innerHTML = `<i class="animate-spin inline-block mr-xs" data-lucide="loader-2"></i> Scanning bio-vault data and medical literature...`;
        lucide.createIcons();

        setTimeout(() => {
            searchResultsContent.innerHTML = `<p class="text-xs text-yellow">No verified data available. Upload or connect your information to continue.</p>`;
        }, 1200);
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const q = searchInput.value.trim();
            if (q !== '') executeHealthSearch(q);
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const q = searchInput.value.trim();
                if (q !== '') executeHealthSearch(q);
            }
        });
    }

    if (searchPresetBtns.length > 0) {
        searchPresetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const queryKey = btn.getAttribute('data-query');
                const fullText = btn.textContent.replace(/"/g, '');
                if (searchInput) searchInput.value = fullText;
                executeHealthSearch(queryKey);
            });
        });
    }

    // --- 9. PREDICTIVE DISEASE SIMULATION ---
    const fatSlider = document.getElementById('sim-bodyfat');
    const sleepSlider = document.getElementById('sim-sleep');
    const activitySlider = document.getElementById('sim-activity');
    const methylSlider = document.getElementById('sim-methyl');

    const fatDisplay = document.getElementById('val-bodyfat');
    const sleepDisplay = document.getElementById('val-sleep');
    const activityDisplay = document.getElementById('val-activity');
    const methylDisplay = document.getElementById('val-methyl');

    const riskScore = document.getElementById('risk-score');
    const riskStatus = document.getElementById('risk-status');
    const riskBar = document.getElementById('risk-bar');

    function calculateRisk() {
        if (!fatSlider || !sleepSlider || !activitySlider || !methylSlider) return;

        const fat = parseFloat(fatSlider.value);
        const sleep = parseFloat(sleepSlider.value);
        const activity = parseFloat(activitySlider.value);
        const methyl = parseFloat(methylSlider.value);

        // Update display text values
        if (fatDisplay) fatDisplay.textContent = `${fat}%`;
        if (sleepDisplay) sleepDisplay.textContent = `${sleep} hrs`;
        if (activityDisplay) activityDisplay.textContent = activity.toLocaleString();
        if (methylDisplay) methylDisplay.textContent = methyl === 1 ? "Active Optimized" : "None";

        // Formula: Base 72%. 
        // Decreases as body fat drops (30 down to 10)
        // Decreases as sleep rises (6 up to 9)
        // Decreases as activity rises (4k up to 15k)
        // Decreases as methylation optimizes
        let base = 72;
        base -= (30 - fat) * 1.2;
        base -= (sleep - 6) * 6;
        base -= ((activity - 4000) / 1000) * 1.5;
        if (methyl === 1) base -= 10;

        const finalRisk = Math.max(12, Math.min(95, Math.round(base)));
        
        if (riskScore) riskScore.textContent = `${finalRisk}%`;
        if (riskBar) {
            riskBar.setAttribute('width', finalRisk);
            if (finalRisk > 50) {
                riskBar.setAttribute('fill', '#EF4444');
                if (riskStatus) {
                    riskStatus.textContent = "HIGH RISK PROFILE";
                    riskStatus.className = "risk-label text-mono text-xxs text-red";
                }
            } else if (finalRisk > 25) {
                riskBar.setAttribute('fill', '#F59E0B');
                if (riskStatus) {
                    riskStatus.textContent = "MODERATE TRAJECTORY";
                    riskStatus.className = "risk-label text-mono text-xxs text-yellow";
                }
            } else {
                riskBar.setAttribute('fill', '#10B981');
                if (riskStatus) {
                    riskStatus.textContent = "OPTIMIZED BASELINE";
                    riskStatus.className = "risk-label text-mono text-xxs text-green";
                }
            }
        }
    }

    [fatSlider, sleepSlider, activitySlider, methylSlider].forEach(slider => {
        if (slider) {
            slider.addEventListener('input', calculateRisk);
        }
    });

    // --- 10. WEARABLE STREAM REAL-TIME GRAPHS ---
    const hrVal = document.getElementById('hr-value');
    const glucoseVal = document.getElementById('glucose-value');
    const hrvVal = document.getElementById('hrv-value');

    const hrSparkline = document.getElementById('hr-sparkline');
    const glucoseSparkline = document.getElementById('glucose-sparkline');
    const hrvSparkline = document.getElementById('hrv-sparkline');

    const maxDataPoints = 15;
    const hrHistory = Array(maxDataPoints).fill(62);
    const glucoseHistory = Array(maxDataPoints).fill(94);
    const hrvHistory = Array(maxDataPoints).fill(74);

    function updateSparkline(svgEl, history, minVal, maxVal) {
        if (!svgEl) return;
        const pathEl = svgEl.querySelector('.sparkline-path');
        const fillEl = svgEl.querySelector('.sparkline-fill');
        if (!pathEl || !fillEl) return;

        const width = 100;
        const height = 30;
        const paddingBottom = 2;
        const paddingTop = 2;
        const graphHeight = height - paddingTop - paddingBottom;
        const dx = width / (history.length - 1);

        const points = history.map((val, i) => {
            const x = i * dx;
            const ratio = (val - minVal) / (maxVal - minVal || 1);
            const clampedRatio = Math.max(0, Math.min(1, ratio));
            const y = height - paddingBottom - (clampedRatio * graphHeight);
            return { x, y };
        });

        let dPath = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            dPath += ` L ${points[i].x},${points[i].y}`;
        }
        pathEl.setAttribute('d', dPath);

        const dFill = `${dPath} L ${width},${height} L 0,${height} Z`;
        fillEl.setAttribute('d', dFill);
    }

    // Telemetry loop
    function startLandingTelemetry() {
        if (telemetryIntervalId) clearInterval(telemetryIntervalId);
        telemetryIntervalId = setInterval(() => {
            if (!landingAnimationsRunning) return;
            if (hrVal) {
                const hr = 58 + Math.floor(Math.random() * 8);
                hrVal.textContent = hr;
                hrHistory.push(hr);
                hrHistory.shift();
                updateSparkline(hrSparkline, hrHistory, 50, 75);
            }
            if (glucoseVal) {
                const gluc = 91 + Math.floor(Math.random() * 6);
                glucoseVal.textContent = gluc;
                glucoseHistory.push(gluc);
                glucoseHistory.shift();
                updateSparkline(glucoseSparkline, glucoseHistory, 85, 105);
            }
            if (hrvVal) {
                const hrv = 70 + Math.floor(Math.random() * 8);
                hrvVal.textContent = hrv;
                hrvHistory.push(hrv);
                hrvHistory.shift();
                updateSparkline(hrvSparkline, hrvHistory, 65, 85);
            }
        }, 1000);
    }
    startLandingTelemetry();

    // --- 11. GENOMIC DNA DOUBLE-HELIX CANVAS ROTATION ---
    const dnaCanvas = document.getElementById('dna-canvas');
    const inspectPanel = document.getElementById('genome-inspect-panel');
    const inspectContent = document.getElementById('inspect-data-content');

    const genomeLociList = [
        { name: "MTHFR (Methylation)", text: "C677T Heterozygous variant found. Folate synthesis efficiency is lower by 30%. Supplement L-methylfolate." },
        { name: "APOE4 (Neurological)", text: "E3/E4 status confirmed. 2-3x relative hazard increase. Crucial to limit processed saturated lipids, optimize brain health, and sleep." },
        { name: "TCF7L2 (Diabetes)", text: "CT variant detected. Increased beta-cell exhaustion risk. Suggests low carb buffering, weight control, and active exercise loop." },
        { name: "CYP2D6 (Drug Clearing)", text: "*4 Null variant found. Ultra-slow metabolizer. Heightened adverse profile with beta-blockers and specific analgesics." },
        { name: "FTO (Adiposity)", text: "AA Genotype profile. Heightened hunger hormone response. Satiety optimization using prebiotic fiber and high-protein density diet." }
    ];

    if (dnaCanvas) {
        const ctx = dnaCanvas.getContext('2d');
        let width = (dnaCanvas.width = dnaCanvas.parentElement.clientWidth);
        let height = (dnaCanvas.height = dnaCanvas.parentElement.clientHeight);

        window.addEventListener('resize', () => {
            if (dnaCanvas.parentElement) {
                width = (dnaCanvas.width = dnaCanvas.parentElement.clientWidth);
                height = (dnaCanvas.height = dnaCanvas.parentElement.clientHeight);
            }
        });

        let rotationAngle = 0;
        const numNodes = 15;
        const amplitude = 40;
        const spacing = width / numNodes;

        let currentStrand1Nodes = [];
        let selectedNodeIndex = 0; // Default MTHFR

        function animateHelix() {
            ctx.clearRect(0, 0, width, height);
            rotationAngle += 0.015;

            // Generate coordinates for both strands
            let strand1 = [];
            let strand2 = [];

            for (let i = 0; i < numNodes; i++) {
                const x = i * spacing + spacing / 2;
                const angleOffset = i * 0.4 + rotationAngle;
                
                // Z coordinate simulating depth
                const z1 = Math.cos(angleOffset);
                const z2 = Math.cos(angleOffset + Math.PI);

                // Y offset based on sine wave
                const y1 = height / 2 + Math.sin(angleOffset) * amplitude;
                const y2 = height / 2 + Math.sin(angleOffset + Math.PI) * amplitude;

                strand1.push({ x, y: y1, z: z1, index: i });
                strand2.push({ x, y: y2, z: z2, index: i });
            }

            currentStrand1Nodes = strand1;

            // Draw rungs
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

                ctx.beginPath();
                ctx.arc((s1.x + s2.x) / 2, (s1.y + s2.y) / 2, 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 255, 209, ${alpha})`;
                ctx.fill();
            }

            // Draw strand 1 nodes
            strand1.forEach((p) => {
                const size = (p.z + 1) / 2 * 6 + 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fillStyle = p.z > 0 ? '#00E5FF' : '#9061F9';
                ctx.fill();
                
                if (selectedNodeIndex !== null && selectedNodeIndex === p.index && p.index % 3 === 0) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size + 8, 0, Math.PI * 2);
                    ctx.strokeStyle = '#00FFD1';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else if (p.index % 3 === 0) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(0, 255, 209, 0.4)';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            });

            // Draw strand 2 nodes
            strand2.forEach((p) => {
                const size = (p.z + 1) / 2 * 6 + 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fillStyle = p.z > 0 ? '#9061F9' : '#00FFD1';
                ctx.fill();
            });

            if (landingAnimationsRunning) {
                helixAnimId = requestAnimationFrame(animateHelix);
            }
        }
        animateHelix();

        // Canvas Interaction
        dnaCanvas.addEventListener('mousemove', (e) => {
            const rect = dnaCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            let hoveringNode = false;
            currentStrand1Nodes.forEach((p) => {
                if (p.index % 3 === 0) {
                    const dx = mouseX - p.x;
                    const dy = mouseY - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const size = (p.z + 1) / 2 * 6 + 3;
                    if (dist < size + 10) {
                        hoveringNode = true;
                    }
                }
            });

            dnaCanvas.style.cursor = hoveringNode ? 'pointer' : 'default';
        });

        dnaCanvas.addEventListener('click', (e) => {
            const rect = dnaCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            let closestNode = null;
            let minDist = 99999;

            currentStrand1Nodes.forEach((p) => {
                if (p.index % 3 === 0) {
                    const dx = clickX - p.x;
                    const dy = clickY - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const size = (p.z + 1) / 2 * 6 + 3;
                    if (dist < size + 15 && dist < minDist) {
                        minDist = dist;
                        closestNode = p;
                    }
                }
            });

            if (closestNode) {
                selectedNodeIndex = closestNode.index;
                const relativeLocus = genomeLociList[closestNode.index % genomeLociList.length];

                if (relativeLocus) {
                    const defaultPrompt = inspectPanel.querySelector('.text-cyan');
                    if (defaultPrompt) {
                        defaultPrompt.style.display = 'none';
                    }
                    if (inspectContent) {
                        inspectContent.innerHTML = `
                            <h4 class="inspect-gene text-mono text-purple">GENE: ${relativeLocus.name}</h4>
                            <p class="text-xxs text-slate mt-xxs">${relativeLocus.text}</p>
                        `;
                        inspectContent.classList.remove('hide');
                    }
                }
            }
        });
    }

    // --- 12. EARLY ACCESS FORM SUBMIT ---
    const ctaForm = document.getElementById('early-access-form');
    const formFeedback = document.getElementById('form-feedback');
    const submitBtn = document.getElementById('submit-early-access');

    if (ctaForm && formFeedback) {
        ctaForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (submitBtn && submitBtn.disabled) return;

            const fullName = document.getElementById('form-name')?.value?.trim() || "";
            const email = document.getElementById('form-email')?.value?.trim() || "";
            const phone = document.getElementById('form-phone')?.value?.trim() || "";
            const countryCode = document.getElementById('form-country-code')?.value || "+1";
            const country = document.getElementById('form-country')?.value || "United States";
            const role = document.getElementById('form-role')?.value || "Personnel";
            const organization = document.getElementById('form-organization')?.value?.trim() || "";
            const message = document.getElementById('form-message')?.value?.trim() || "";
            const privacyConsent = document.getElementById('form-consent-privacy')?.checked || false;
            const emailOptIn = document.getElementById('form-consent-email')?.checked || false;
            const whatsAppOptIn = document.getElementById('form-consent-whatsapp')?.checked || false;

            // Client-side quick checks
            if (!fullName || fullName.length < 2) {
                formFeedback.className = 'form-feedback-message error';
                formFeedback.style.display = 'block';
                formFeedback.innerHTML = `<div class="glass-card mt-sm p-sm text-red text-xs">Please provide your full name (at least 2 characters).</div>`;
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
                formFeedback.className = 'form-feedback-message error';
                formFeedback.style.display = 'block';
                formFeedback.innerHTML = `<div class="glass-card mt-sm p-sm text-red text-xs">Please enter a valid email address.</div>`;
                return;
            }

            if (!phone || phone.replace(/[^0-9]/g, '').length < 6) {
                formFeedback.className = 'form-feedback-message error';
                formFeedback.style.display = 'block';
                formFeedback.innerHTML = `<div class="glass-card mt-sm p-sm text-red text-xs">Please provide a valid mobile number with at least 6 digits.</div>`;
                return;
            }

            if (!privacyConsent) {
                formFeedback.className = 'form-feedback-message error';
                formFeedback.style.display = 'block';
                formFeedback.innerHTML = `<div class="glass-card mt-sm p-sm text-red text-xs">You must agree to the Privacy Policy & Protocol Terms to register.</div>`;
                return;
            }

            const formData = {
                honeypot: document.getElementById('form-honeypot')?.value || "",
                fullName,
                email,
                countryCode,
                phone,
                country,
                role,
                organization,
                message,
                privacyConsent,
                emailOptIn,
                whatsAppOptIn
            };

            // Loading state
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.originalText = submitBtn.textContent;
                submitBtn.textContent = "Creating Secure Profile...";
            }

            formFeedback.className = 'form-feedback-message';
            formFeedback.style.display = 'block';
            formFeedback.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; justify-content:center;" class="text-cyan text-xxs font-mono">
                    <span class="pulse-dot green"></span> Creating authenticated personnel identity & establishing secure vault...
                </div>
            `;

            try {
                let result = null;

                // Try backend REST API first
                try {
                    const apiRes = await fetch('/api/registration', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });

                    const data = await apiRes.json();
                    if (!apiRes.ok || !data.success) {
                        const errMsg = data?.error?.message || "Registration could not be completed. Please try again.";
                        throw new Error(errMsg);
                    }
                    result = data;
                } catch (netErr) {
                    // If network error occurred and client-side fallback exists
                    if (netErr.message && !netErr.message.includes('Failed to fetch') && !netErr.message.includes('NetworkError')) {
                        throw netErr;
                    }
                    if (typeof window.registerUserProtocol === 'function') {
                        result = await window.registerUserProtocol(formData);
                    } else {
                        throw new Error("Unable to reach LifeOS registration service. Please check your connection.");
                    }
                }

                // Store session token and user info
                if (result.token) {
                    sessionStorage.setItem('lifeos_session_token', result.token);
                }
                if (result.user) {
                    sessionStorage.setItem('lifeos_user', JSON.stringify(result.user));
                }

                // Update UI Feedback
                formFeedback.className = 'form-feedback-message success';
                formFeedback.innerHTML = `
                    <div class="glass-card mt-sm" style="padding:16px; background:rgba(0,255,209,0.06); border:1px solid rgba(0,255,209,0.3); text-align:left;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <h4 class="text-mono text-xs text-teal font-bold" style="margin:0;"><i data-lucide="check-circle"></i> REGISTRATION COMPLETE</h4>
                            <span class="badge" style="background:rgba(0,255,209,0.15); color:var(--accent-teal); font-size:0.7rem;">ID: ${result.user?.id || 'SECURE'}</span>
                        </div>
                        <p class="text-xs text-white" style="margin-bottom:6px;">
                            Welcome, <strong class="text-teal">${result.user?.fullName || formData.fullName}</strong>. Your Personnel Wellness Profile is ready.
                        </p>
                        <p class="text-xxs text-cyan font-mono" style="margin:0;">
                            <span class="pulse-dot green"></span> Transitioning directly to your Personnel Wellness Profile...
                        </p>
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();

                if (submitBtn) {
                    submitBtn.textContent = "Registration Complete ✓";
                }

                // Redirect directly to Personnel Wellness Profile after 800ms
                setTimeout(() => {
                    if (window.LifeOS && typeof window.LifeOS.transitionToPersonnelWellness === 'function') {
                        window.LifeOS.transitionToPersonnelWellness(result.user, result.profile, result.token);
                    } else if (typeof window.launchPersonnelWellnessFromRegistration === 'function') {
                        window.launchPersonnelWellnessFromRegistration(result.user, result.profile, result.token);
                    } else {
                        // Fallback: click the personnel wellness button
                        const btn = document.getElementById('hero-btn-personnel-wellness') || document.getElementById('nav-btn-personnel-wellness');
                        if (btn) btn.click();
                    }
                }, 800);

            } catch (err) {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = submitBtn.dataset.originalText || "Submit Registration Protocol";
                }
                formFeedback.className = 'form-feedback-message error';
                formFeedback.innerHTML = `
                    <div class="glass-card mt-sm" style="padding:12px; background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.3); text-align:left; color:#ff6b6b; font-size:0.75rem;">
                        <strong><i data-lucide="alert-triangle"></i> Registration Notice:</strong> ${err.message}
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }

    // Initial risk calculation call
    calculateRisk();
});
