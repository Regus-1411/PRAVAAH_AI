/* =========================================
   GLOBAL VARIABLES
========================================= */
let selectedHazard = "flood";
let map = null;
let gpsMarker = null;
let accuracyCircle = null;
let gpsWatchId = null;


/* =========================================
   HAZARD SELECTION
========================================= */
function selectHazard(button, hazard) {
    document.querySelectorAll(".hazard-btn").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    selectedHazard = hazard;
    TS.switchToHazard(hazard);
}

function value(id) {
    const el = document.getElementById(id);
    return el ? Number(el.value) : 0;
}


/* =========================================
   INITIALIZE LEAFLET MAP
========================================= */
function initializeMap() {
    map = L.map("liveMap").setView([20.5937, 78.9629], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
}


/* =========================================
   GPS TRACKING
========================================= */
function startGPS() {
    if (!navigator.geolocation) { alert("Geolocation not supported."); return; }
    document.getElementById("gpsStatus").innerText = "CONNECTING...";
    gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;
            document.getElementById("latitude").innerText  = latitude.toFixed(6);
            document.getElementById("longitude").innerText = longitude.toFixed(6);
            document.getElementById("accuracy").innerText  = accuracy.toFixed(1);
            document.getElementById("gpsStatus").innerText = "LIVE";
            if (!gpsMarker) {
                gpsMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("PRAVAAH-AI Live GPS");
            } else { gpsMarker.setLatLng([latitude, longitude]); }
            if (!accuracyCircle) {
                accuracyCircle = L.circle([latitude, longitude], { radius: accuracy }).addTo(map);
            } else { accuracyCircle.setLatLng([latitude, longitude]); accuracyCircle.setRadius(accuracy); }
            map.setView([latitude, longitude], 16);
            sendGPS(latitude, longitude, accuracy);
        },
        err => {
            document.getElementById("gpsStatus").innerText = "ERROR";
            const msgs = { 1: "Permission denied.", 2: "Position unavailable.", 3: "Timeout." };
            alert("GPS Error: " + (msgs[err.code] || "Unknown error."));
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
}

function stopGPS() {
    if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    document.getElementById("gpsStatus").innerText = "OFFLINE";
}

async function sendGPS(lat, lon, acc) {
    try {
        await fetch("/api/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: lat, longitude: lon, accuracy: acc })
        });
    } catch (e) { console.error("GPS send error:", e); }
}





/* =========================================
   AI HAZARD ANALYSIS
========================================= */
async function predictHazard(opts = {}) {
    const btn = document.querySelector(".predict");
    if (btn) {
        btn.disabled = true;
        btn.innerText = "ANALYZING...";
    }
    const payload = {
        hazard: selectedHazard,
        temperature: value("temperature"),
        humidity: value("humidity"),
        rainfall: value("rainfall"),
        wind: value("wind"),
        water: value("water"),
        pm25: value("pm25"),
        pm10: value("pm10"),
        gas: value("gas"),
        slope: value("slope"),
        soil: value("soil"),
        pressure: value("pressure") || 1013,
        co: value("co") || 1.0,
        no2: value("no2") || 20.0
    };
    try {
        const resp = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || "Analysis failed");

        document.getElementById("result").style.display = "block";
        document.getElementById("hazardResult").innerText = result.hazard_name || result.hazard;
        const riskEl = document.getElementById("risk");
        riskEl.innerText = result.risk;
        riskEl.className = "risk " + result.risk.toLowerCase();
        document.getElementById("score").innerText = Number(result.score).toFixed(1);
        document.getElementById("area").innerText  = Number(result.area).toFixed(2);

        const ul = document.getElementById("actions");
        ul.innerHTML = "";
        (result.actions || []).forEach(a => {
            const li = document.createElement("li"); li.innerText = a; ul.appendChild(li);
        });

        // Update In-Page Dynamic Early Warning Banner
        const alertBanner = document.getElementById("predictionAlertBanner");
        const alertBadge = document.getElementById("alertBadge");
        const alertHeadline = document.getElementById("alertHeadline");
        const alertMessage = document.getElementById("alertMessage");
        const alertAreaKm = document.getElementById("alertAreaKm");
        const alertScorePct = document.getElementById("alertScorePct");
        const alertTime = document.getElementById("alertTime");
        const evacStatus = document.getElementById("evacStatus");

        const riskClass = result.risk === "HIGH" ? "critical" : (result.risk === "MEDIUM" ? "warning" : "advisory");
        const icon = result.risk === "HIGH" ? "🚨" : (result.risk === "MEDIUM" ? "⚠️" : "✅");
        const badgeLabel = result.risk === "HIGH" ? "CRITICAL HAZARD ALERT" : (result.risk === "MEDIUM" ? "ELEVATED RISK ADVISORY" : "NORMAL CONDITIONS");

        if (alertBanner) {
            alertBanner.className = "alert-banner " + riskClass;
            alertBanner.style.display = "block";
        }
        if (alertBadge) {
            alertBadge.className = "alert-badge " + riskClass;
            alertBadge.innerHTML = `${icon} ${badgeLabel}`;
        }
        if (alertHeadline) alertHeadline.innerText = result.headline || `${result.hazard_name} Risk: ${result.risk}`;
        if (alertMessage) alertMessage.innerText = result.message || "Hazard assessment completed.";
        if (alertAreaKm) alertAreaKm.innerText = Number(result.area).toFixed(2);
        if (alertScorePct) alertScorePct.innerText = Number(result.score).toFixed(1);
        if (alertTime) alertTime.innerText = new Date().toLocaleTimeString();
        if (evacStatus) evacStatus.style.display = result.evacuation ? "inline-flex" : "none";

        // Dispatch alert through AlertManager directly into full-height right sidebar
        AM.fireHazardAlert({
            hazard: result.hazard_name || result.hazard,
            risk: result.risk,
            severity: riskClass,
            score: result.score,
            msg: result.message,
            headline: result.headline,
            evacuation: result.evacuation,
            time: new Date()
        });

        // Note: No page jumping or involuntary scrolling down on alerts!
    } catch (e) {
        console.error(e);
        if (!opts.isAuto) alert("Backend error: " + e.message + "\n\nStart backend: python -m uvicorn main:app --reload");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "⚡ ANALYZE LIVE SENSORS NOW";
        }
    }
}


/* =========================================
   PAGE LOAD & SERVICE WORKER (PWA)
========================================= */
window.addEventListener("load", async () => {
    initializeMap();

    // Register Service Worker for PWA & Background Mobile Push Notifications
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js")
            .then((reg) => console.log("PRAVAAH-AI ServiceWorker registered:", reg.scope))
            .catch((err) => console.log("ServiceWorker registration skipped:", err));
    }

    await TS.init();          // fetch config from /api/channels, start all pollers
    AM.requestPermission();   // ask for browser notification permission
});


/* =========================================================================
   ALERT MANAGER (AM)
   - Monitors ALL channels every 15s (ThingSpeak real-time synchronization)
   - Sudden Surge / Rate-of-Change (ΔV/Δt) Anomaly Engine:
     Detects flash floods, thermal spikes, toxic gas surges before thresholds
   - Shoots mobile push notifications with haptic vibration patterns
   - Streams alerts directly into full-height right sidebar
   - Maintains alert history log (last 50 entries)
========================================================================= */
const AM = (() => {
    let _cfg          = { deduplicationMinutes: 5, maxAlertHistory: 50 };
    let _history      = [];               // [{id, type, time, chKey, chName, label, value, unit, risk, headline, evacuation, severity, isSurge, msg}]
    let _lastFired    = {};               // "chKey:fieldKey" → Date
    let _surgeBuffers = {};               // "chKey:fieldKey" → [{val, time}]
    let _unread       = 0;
    let _soundCtx     = null;

    /* Severity levels */
    const SEV = { CRITICAL: "critical", WARNING: "warning", INFO: "info", ADVISORY: "advisory" };

    /* ── Request browser/mobile notification permission ── */
    function requestPermission() {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
                const banner = document.getElementById("mobilePushBanner");
                if (banner && permission === "granted") {
                    banner.style.display = "none";
                }
            });
        }
    }

    /* ── Sudden Surge / Rapid Rate-of-Change (ΔV/Δt) Anomaly Detector ── */
    function checkSuddenSurge(chKey, fieldKey, fieldCfg, currentValue) {
        const key = chKey + ":" + fieldKey;
        const now = Date.now();
        if (!_surgeBuffers[key]) _surgeBuffers[key] = [];

        // Add current reading to sliding window
        _surgeBuffers[key].push({ val: currentValue, time: now });
        // Keep readings from the last 120 seconds
        _surgeBuffers[key] = _surgeBuffers[key].filter(pt => (now - pt.time) <= 120 * 1000);

        if (_surgeBuffers[key].length < 2) return;

        const oldest = _surgeBuffers[key][0];
        const deltaV = currentValue - oldest.val;
        const deltaTSeconds = Math.max(1, (now - oldest.time) / 1000);
        const ratePerMinute = (deltaV / deltaTSeconds) * 60;

        let surgeTriggered = false;
        let surgeMsg = "";
        let surgeType = "";

        const labelLower = (fieldCfg.label || "").toLowerCase();
        const unitLower = (fieldCfg.unit || "").toLowerCase();

        // 1. Water Level Surge (Flash Flood Precursor)
        if (labelLower.includes("water") || unitLower === "m") {
            if (deltaV >= 0.25 && deltaTSeconds <= 90) {
                surgeTriggered = true;
                surgeType = "⚡ FLASH FLOOD SURGE";
                surgeMsg = `URGENT: Water level spiked +${deltaV.toFixed(2)}m in ${Math.round(deltaTSeconds)}s (Rate: +${ratePerMinute.toFixed(2)}m/min). Rapid flash flood wave incoming!`;
            }
        }
        // 2. Temperature Spike (Thermal Flash / Wildfire Ignition)
        else if (labelLower.includes("temp") || unitLower.includes("°c")) {
            if (deltaV >= 3.0 && deltaTSeconds <= 90) {
                surgeTriggered = true;
                surgeType = "🔥 RAPID THERMAL SPIKE";
                surgeMsg = `URGENT: Temperature surged +${deltaV.toFixed(1)}°C in ${Math.round(deltaTSeconds)}s. Rapid wildfire ignition precursor!`;
            }
        }
        // 3. Humidity Sudden Plunge (Sudden extreme aridity)
        else if (labelLower.includes("humid") || unitLower === "%") {
            if (deltaV <= -18.0 && deltaTSeconds <= 90) {
                surgeTriggered = true;
                surgeType = "⚠️ SUDDEN ARIDITY DROP";
                surgeMsg = `WARNING: Humidity plunged ${deltaV.toFixed(1)}% in ${Math.round(deltaTSeconds)}s. Extreme dry fire weather conditions!`;
            }
        }
        // 4. Toxic Gas Concentration Surge
        else if (labelLower.includes("gas") || unitLower.includes("ppm")) {
            if (deltaV >= 25.0 && deltaTSeconds <= 90) {
                surgeTriggered = true;
                surgeType = "☣️ RAPID GAS SURGE";
                surgeMsg = `CRITICAL: Gas concentration surged +${deltaV.toFixed(1)} ppm in ${Math.round(deltaTSeconds)}s. Possible industrial pipeline leak or toxic accumulation!`;
            }
        }
        // 5. Particulate (PM2.5 / PM10) Smog Surge
        else if (labelLower.includes("pm") || unitLower.includes("µg")) {
            if (deltaV >= 40.0 && deltaTSeconds <= 90) {
                surgeTriggered = true;
                surgeType = "🌫️ TOXIC SMOG SURGE";
                surgeMsg = `WARNING: ${fieldCfg.label} surged +${deltaV.toFixed(1)} ${fieldCfg.unit} in ${Math.round(deltaTSeconds)}s. Sudden atmospheric smog surge!`;
            }
        }

        if (surgeTriggered) {
            const dedupeKey = "surge:" + key;
            const last = _lastFired[dedupeKey];
            if (!last || (now - last) > 2 * 60 * 1000) { // 2-min surge deduplication
                _lastFired[dedupeKey] = now;
                _fire({
                    type: surgeType,
                    chKey,
                    chName: TS.getChannelName(chKey),
                    fieldKey,
                    label: fieldCfg.label,
                    value: currentValue,
                    unit: fieldCfg.unit,
                    severity: "critical",
                    isSurge: true,
                    msg: surgeMsg,
                    time: new Date()
                });
                // Shoot immediate high-priority mobile emergency push notification
                shootMobilePush(`🚨 ${surgeType}`, surgeMsg, "surge-alert");
            }
        }
    }

    /* ── Check a single field reading against thresholds & sudden surge ── */
    function checkThreshold(chKey, fieldKey, fieldCfg, value) {
        // Run Sudden Surge / Rapid Change Detection first!
        checkSuddenSurge(chKey, fieldKey, fieldCfg, value);

        if (fieldCfg.warning === null && fieldCfg.critical === null) return;
        const dir  = fieldCfg.thresholdDir || "above";
        const warn = fieldCfg.warning;
        const crit = fieldCfg.critical;

        let severity = null;
        if (crit !== null) {
            if (dir === "above" && value >= crit) severity = SEV.CRITICAL;
            if (dir === "below" && value <= crit) severity = SEV.CRITICAL;
        }
        if (!severity && warn !== null) {
            if (dir === "above" && value >= warn) severity = SEV.WARNING;
            if (dir === "below" && value <= warn) severity = SEV.WARNING;
        }
        if (!severity) return;

        /* Deduplication */
        const dedupeKey = chKey + ":" + fieldKey;
        const now = Date.now();
        const last = _lastFired[dedupeKey];
        if (last && (now - last) < _cfg.deduplicationMinutes * 60 * 1000) return;
        _lastFired[dedupeKey] = now;

        const chName = TS.getChannelName(chKey);
        const alertType = `${fieldCfg.label.toUpperCase()} THRESHOLD`;
        const msg = severity === SEV.CRITICAL
            ? `CRITICAL: ${fieldCfg.label} is ${value.toFixed(2)} ${fieldCfg.unit} — exceeds critical threshold (${crit} ${fieldCfg.unit})`
            : `WARNING: ${fieldCfg.label} is ${value.toFixed(2)} ${fieldCfg.unit} — exceeds warning threshold (${warn} ${fieldCfg.unit})`;

        _fire({
            type: alertType,
            chKey,
            chName,
            fieldKey,
            label: fieldCfg.label,
            value,
            unit: fieldCfg.unit,
            severity,
            msg,
            time: new Date()
        });

        if (severity === SEV.CRITICAL) {
            shootMobilePush(`🚨 CRITICAL THRESHOLD: ${fieldCfg.label}`, msg, "threshold-crit");
        }
    }

    /* ── Fire an alert ── */
    function _fire(alert) {
        /* Add to history */
        _history.unshift(alert);
        if (_history.length > _cfg.maxAlertHistory) _history.pop();
        _unread++;
        _updateBell();
        _renderHistory();
        _renderSidebarAlerts();

        /* Sound */
        if (alert.severity === "critical" || alert.isSurge) {
            _playEmergencySiren();
        } else {
            _playBeep(alert.severity);
        }
    }

    /* ── Shoot High-Priority Mobile Push Notification ── */
    function shootMobilePush(title, body, tag = "emergency") {
        // 1. Mobile Haptic Vibration Pattern
        if ("vibrate" in navigator) {
            try {
                navigator.vibrate([400, 150, 400, 150, 600, 200, 600]);
            } catch (e) {}
        }

        // 2. Play Emergency Siren Warble
        _playEmergencySiren();

        // 3. Service Worker Push Notification for Mobile Trays
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(title, {
                    body: body,
                    icon: "/icon.svg",
                    badge: "/icon.svg",
                    vibrate: [400, 150, 400, 150, 600, 200, 600],
                    tag: tag + "-" + Date.now(),
                    requireInteraction: true,
                    renotify: true,
                    data: window.location.href,
                    actions: [
                        { action: "open", title: "🚨 View Evacuation Plan" },
                        { action: "dismiss", title: "✕ Acknowledge" }
                    ]
                });
            }).catch(() => _fallbackNotification(title, body));
        } else {
            _fallbackNotification(title, body);
        }
    }

    function _fallbackNotification(title, body) {
        if ("Notification" in window && Notification.permission === "granted") {
            try {
                new Notification(title, {
                    body: body,
                    icon: "/icon.svg",
                    requireInteraction: true
                });
            } catch (e) {}
        }
    }

    /* ── Bell badge ── */
    function _updateBell() {
        const badge = document.getElementById("alertBellBadge");
        if (!badge) return;
        badge.textContent = _unread > 99 ? "99+" : _unread;
        badge.style.display = _unread > 0 ? "flex" : "none";
    }

    /* ── Render Dedicated Full-Height Right Sidebar Alerts Stream ── */
    function _renderSidebarAlerts() {
        const sidebarList = document.getElementById("sidebarAlertList");
        const countBadge = document.getElementById("sidebarAlertCount");
        if (!sidebarList) return;

        if (countBadge) {
            countBadge.textContent = _history.length;
            countBadge.style.display = _history.length > 0 ? "inline-block" : "none";
        }

        if (_history.length === 0) {
            sidebarList.innerHTML = `
                <div class="as-empty">
                    <div style="font-size:28px;margin-bottom:8px;">📡</div>
                    <div style="font-weight:600;color:#94a3b8;">No alerts triggered yet.</div>
                    <div style="font-size:11px;color:#475569;margin-top:4px;">Live threshold, sudden surge, and AI early-warning alerts will stream here automatically.</div>
                </div>`;
            return;
        }

        sidebarList.innerHTML = _history.map((a) => {
            const sev = a.severity || "info";
            const sevIcon = a.isSurge ? "⚡" : (sev === "critical" ? "🚨" : (sev === "warning" ? "⚠️" : (sev === "advisory" ? "🌊" : "ℹ️")));
            const timeObj = a.time instanceof Date ? a.time : new Date(a.time);
            const timeStr = timeObj.toLocaleTimeString();
            const dateStr = timeObj.toLocaleString();

            const chips = [];
            if (a.isSurge) chips.push(`<span class="as-evac-chip" style="background:rgba(234,179,8,0.25);color:#fde047;border-color:rgba(234,179,8,0.5);">⚡ RAPID SURGE DETECTED</span>`);
            if (a.risk) chips.push(`<span class="as-chip">Risk: <strong>${a.risk}</strong></span>`);
            if (a.value !== undefined && a.value !== null) {
                const valStr = typeof a.value === "number" ? a.value.toFixed(1) : a.value;
                chips.push(`<span class="as-chip">${a.label || 'Value'}: <strong>${valStr}${a.unit || ''}</strong></span>`);
            }
            if (a.evacuation) {
                chips.push(`<span class="as-evac-chip">⚠️ EVACUATION REQUIRED</span>`);
            }

            return `
                <div class="as-alert-card ${sev} ${a.isSurge ? 'surge-highlight' : ''}">
                    <div class="as-card-top">
                        <span class="as-type-tag ${sev}">${sevIcon} ${a.type || 'SYSTEM ALERT'}</span>
                        <span class="as-time" title="${dateStr}">⏱️ ${timeStr}</span>
                    </div>
                    <div class="as-source">${a.chName || 'PRAVAAH-AI Monitoring'}</div>
                    <div class="as-message">${a.msg}</div>
                    ${chips.length > 0 ? `<div class="as-meta-row">${chips.join("")}</div>` : ""}
                </div>
            `;
        }).join("");
    }

    /* ── Render alert history panel ── */
    function _renderHistory() {
        const list = document.getElementById("alertHistoryList");
        if (!list) return;
        if (_history.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#475569;padding:30px;">No alerts yet. All systems normal.</div>';
            return;
        }
        const sevColors = { critical:"#ef4444", warning:"#f59e0b", advisory:"#16a34a", info:"#3b82f6" };
        list.innerHTML = _history.map((a, i) => `
            <div style="padding:12px 16px;border-bottom:1px solid #1e293b;display:flex;gap:12px;align-items:flex-start;">
                <div style="width:8px;height:8px;border-radius:50%;background:${sevColors[a.severity]||"#64748b"};margin-top:5px;flex-shrink:0;"></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:11px;text-transform:uppercase;color:${sevColors[a.severity]||"#64748b"};margin-bottom:2px;">${a.type || 'ALERT'}</div>
                    <div style="font-weight:600;font-size:13px;color:#e2e8f0;">${a.chName}</div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${a.msg}</div>
                    <div style="font-size:11px;color:#475569;margin-top:4px;">${(a.time instanceof Date ? a.time : new Date(a.time)).toLocaleString()}</div>
                </div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${sevColors[a.severity]||"#64748b"};flex-shrink:0;">${a.severity}</div>
            </div>`).join("");
    }

    /* ── Standard Beep Sound ── */
    function _playBeep(severity) {
        try {
            if (!_soundCtx) _soundCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = _soundCtx.createOscillator();
            const gain = _soundCtx.createGain();
            osc.connect(gain); gain.connect(_soundCtx.destination);
            osc.frequency.value = severity === "critical" ? 880 : (severity === "warning" ? 660 : 440);
            osc.type = "sine";
            gain.gain.setValueAtTime(0.15, _soundCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, _soundCtx.currentTime + 0.5);
            osc.start(); osc.stop(_soundCtx.currentTime + 0.5);
        } catch (e) { /* audio not available */ }
    }

    /* ── Emergency Dual-Tone Warble Siren ── */
    function _playEmergencySiren() {
        try {
            if (!_soundCtx) _soundCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = _soundCtx.createOscillator();
            const gain = _soundCtx.createGain();
            osc.connect(gain);
            gain.connect(_soundCtx.destination);

            const now = _soundCtx.currentTime;
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(960, now);
            osc.frequency.linearRampToValueAtTime(640, now + 0.25);
            osc.frequency.linearRampToValueAtTime(960, now + 0.5);
            osc.frequency.linearRampToValueAtTime(640, now + 0.75);
            osc.frequency.linearRampToValueAtTime(960, now + 1.0);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

            osc.start(now);
            osc.stop(now + 1.2);
        } catch (e) { /* audio not available */ }
    }

    return {
        init(cfg)       { _cfg = { ..._cfg, ...cfg }; _renderSidebarAlerts(); },
        check:          checkThreshold,
        requestPermission,
        shootMobilePush,
        fireHazardAlert(data) {
            const sev = data.severity; // 'critical', 'warning', 'advisory'
            const toastSev = sev === "critical" ? "critical" : (sev === "warning" ? "warning" : "advisory");
            const hazardName = (data.hazard || "Hazard").toUpperCase();
            const alertType = `${hazardName} RISK [${data.risk || 'ALERT'}]`;
            const alertObj = {
                type: alertType,
                chKey: "ai:" + (data.hazard || "hazard").toLowerCase().replace(/\s+/g, "_"),
                chName: "🤖 PRAVAAH-AI • " + data.hazard,
                fieldKey: "prediction",
                label: "Risk Score",
                value: Number(data.score) || 0,
                unit: "%",
                risk: data.risk,
                headline: data.headline,
                evacuation: data.evacuation,
                severity: toastSev,
                msg: data.msg || data.headline || `Hazard assessment calculated risk at ${data.risk}.`,
                time: data.time || new Date()
            };
            _fire(alertObj);

            // If severe risk or evacuation, shoot immediate mobile push notification!
            if (data.risk === "HIGH" || data.evacuation) {
                shootMobilePush(`🚨 EMERGENCY: ${data.hazard || 'Disaster'} Risk is HIGH!`, alertObj.msg, "hazard-high");
            }
        },
        openLog() {
            _unread = 0; _updateBell();
            document.getElementById("alertLogOverlay").style.display = "block";
            document.getElementById("alertLogPanel").classList.add("open");
            document.body.style.overflow = "hidden";
            _renderHistory();
        },
        closeLog() {
            document.getElementById("alertLogOverlay").style.display = "none";
            document.getElementById("alertLogPanel").classList.remove("open");
            document.body.style.overflow = "";
        },
        clearHistory() {
            _history = [];
            _unread = 0;
            _updateBell();
            _renderHistory();
            _renderSidebarAlerts();
        },
        triggerTestSurge() {
            // Simulate sudden flash flood surge
            const chKey = "water_level_flood";
            const fieldCfg = { label: "Water Level", unit: "m", warning: 2.0, critical: 3.5 };
            _surgeBuffers[chKey + ":field4"] = [
                { val: 0.8, time: Date.now() - 40000 }
            ];
            checkSuddenSurge(chKey, "field4", fieldCfg, 1.45);
        },
        triggerTestEmergency() {
            shootMobilePush(
                "🚨 CRITICAL DISASTER ALERT",
                "Severe hazard conditions detected. Immediate mobile notification and siren verification active.",
                "test-emergency"
            );
            _fire({
                type: "🚨 EMERGENCY ALERT TEST",
                chKey: "system_test",
                chName: "PRAVAAH-AI Mobile Engine",
                fieldKey: "test",
                label: "Push Status",
                value: 99,
                unit: "%",
                risk: "HIGH",
                evacuation: true,
                severity: "critical",
                isSurge: true,
                msg: "Emergency mobile notification pipeline verified! Haptic pattern and siren active.",
                time: new Date()
            });
        },
        getHistory()   { return _history; }
    };
})();


/* =========================================
   SCENARIO PRESETS & SIMULATOR
========================================= */
const SCENARIO_PRESETS = {
    flood_high: {
        hazard: "flood",
        values: { rainfall: 125, water: 3.8, humidity: 92, temperature: 26, wind: 20 }
    },
    flood_med: {
        hazard: "flood",
        values: { rainfall: 55, water: 1.8, humidity: 75, temperature: 28, wind: 12 }
    },
    fire_high: {
        hazard: "fire",
        values: { temperature: 44, humidity: 12, wind: 42, rainfall: 0 }
    },
    pollution_high: {
        hazard: "pollution",
        values: { pm25: 180, pm10: 290, co: 8.5, no2: 85, temperature: 34, humidity: 45 }
    },
    weather_high: {
        hazard: "weather",
        values: { rainfall: 95, wind: 65, pressure: 970, temperature: 24, humidity: 95 }
    },
    landslide_high: {
        hazard: "landslide",
        values: { slope: 45, soil: 85, rainfall: 90, temperature: 25, humidity: 80 }
    },
    gas_high: {
        hazard: "gas",
        values: { gas: 420, wind: 28, temperature: 32, humidity: 50 }
    },
    safe_baseline: {
        hazard: "flood",
        values: { temperature: 27, humidity: 55, rainfall: 0, water: 0.6, pm25: 15, pm10: 28, gas: 0, slope: 5, soil: 20, pressure: 1013, co: 0.5, no2: 12, wind: 8 }
    }
};

function toggleSimulator() {
    const sec = document.getElementById("manualSimulatorSection");
    const btn = document.getElementById("toggleSimBtn");
    if (!sec) return;
    const isHidden = sec.style.display === "none" || !sec.style.display;
    sec.style.display = isHidden ? "block" : "none";
    if (btn) btn.innerText = isHidden ? "▲ Hide Scenario Simulator" : "▼ Open Scenario Simulator (What-If)";
    if (isHidden) sec.scrollIntoView({ behavior: "smooth" });
}

function applyPreset(presetKey) {
    const p = SCENARIO_PRESETS[presetKey];
    if (!p) return;
    if (p.hazard) {
        const hBtn = document.querySelector(`.hazard-btn[onclick*="'${p.hazard}'"]`);
        if (hBtn) selectHazard(hBtn, p.hazard);
    }
    Object.entries(p.values).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
    // Run prediction on the preset
    predictHazard();
}


/* =========================================
   SENSOR DATA CALIBRATION & SANITIZATION
   Prevents uncalibrated raw MCU/ADC integers
   (e.g., 3123°C or 956% humidity or 72.4m water)
   from showing false information.
========================================= */
function calibrateSensorValue(fieldKey, fCfg, raw) {
    let val = parseFloat(raw);
    if (isNaN(val)) return null;

    const lbl = (fCfg.label || "").toLowerCase();
    const unt = (fCfg.unit || "").toLowerCase();
    const inp = (fCfg.inputId || "").toLowerCase();

    // 1. Temperature (°C) - ESP32/Arduino DHT sensor sending temp*100 (e.g. 3123 -> 31.23°C)
    if (lbl.includes("temp") || unt.includes("deg") || inp === "temperature") {
        if (val > 1000 && val <= 7000) val = val / 100;
        else if (val > 65 && val <= 1000) val = val / 10;
        val = Math.max(-40, Math.min(65, val));
    }
    // 2. Humidity (%) - DHT/analog raw value (e.g. 911 -> 91.1%, 956 -> 95.6%)
    else if (lbl.includes("humid") || unt.includes("%") || inp === "humidity") {
        if (val > 100 && val <= 1024) val = val / 10;
        val = Math.max(0, Math.min(100, val));
    }
    // 3. Water Level (m) - ultrasonic/distance sensor in cm/raw ADC -> meters (e.g. 72.3 cm -> 0.72 m)
    else if (lbl.includes("water") || unt === "m" || inp === "water") {
        if (val > 20 && val <= 500) val = val / 100;       // cm to meters
        else if (val > 500 && val <= 5000) val = val / 1000; // mm to meters
        val = Math.max(0, Math.min(15, val));
    }
    // 4. Rainfall (mm)
    else if (lbl.includes("rain") || unt === "mm" || inp === "rainfall") {
        if (val > 500 && val <= 5000) val = val / 10;
        val = Math.max(0, Math.min(300, val));
    }
    // 5. Gas Concentration (ppm)
    else if (lbl.includes("gas") || unt.includes("ppm") || inp === "gas") {
        if (val > 5000) val = val / 10;
        val = Math.max(0, Math.min(1000, val));
    }
    // 6. PM2.5 / PM10 (µg/m³)
    else if (lbl.includes("pm") || inp.startsWith("pm")) {
        if (val > 1000) val = val / 10;
        val = Math.max(0, Math.min(500, val));
    }

    return val;
}


/* =========================================================================
   THINGSPEAK MANAGER (TS)
   - Fetches channel config from /api/channels on init
   - Polls ALL channels simultaneously (AlertManager checks all)
   - Renders clean, calibrated gauges without duplicate labels
========================================================================= */
const TS = (() => {
    let _config    = null;      // full config from /api/channels
    let _channels  = {};        // parsed channel objects
    let _pollers   = {};        // { chKey: intervalId }
    let _history   = {};        // "chKey:fieldKey" → [last 20 values]
    let _activeKey = null;
    let _latestCalibrated = {}; // "chKey" → { fieldKey: calibratedValue }

    const HAZARD_TO_CHANNEL = {
        flood: "flood", fire: "fire", pollution: "pollution",
        weather: null, landslide: null, gas: null
    };

    /* ── Status badge ── */
    function _setStatus(state, text) {
        const b = document.getElementById("tsStatusBadge");
        const s = document.getElementById("tsStatusText");
        if (b) b.className = "ts-status-badge " + state;
        if (s) s.textContent = text;
    }

    /* ── Channel info label ── */
    function _setChannelLabel(ch) {
        const el = document.getElementById("tsChannelDisplay");
        if (el) el.textContent = ch ? "#" + ch.channelId + " — " + ch.name : "--";
    }

    /* ── SVG sparkline ── */
    function _spark(vals) {
        if (!vals || vals.length < 2) return "";
        const w=130,h=28,p=2;
        const mn=Math.min(...vals), mx=Math.max(...vals), r=mx-mn||1;
        const pts = vals.map((v,i)=>{
            const x=p+(i/(vals.length-1))*(w-p*2);
            const y=h-p-((v-mn)/r)*(h-p*2);
            return x.toFixed(1)+","+y.toFixed(1);
        }).join(" ");
        return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:28px" preserveAspectRatio="none">
            <polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="1.6" stroke-linecap="round"/>
        </svg>`;
    }

    /* ── Render clean gauges for the active channel ── */
    function _renderGauges(feed, chKey) {
        if (chKey !== _activeKey) return;
        const grid = document.getElementById("tsGaugeGrid");
        if (!grid) return;
        grid.innerHTML = "";
        const ch = _channels[chKey];
        let hasAny = false;
        if (!_latestCalibrated[chKey]) _latestCalibrated[chKey] = {};

        Object.entries(ch.fields).forEach(([fKey, fCfg]) => {
            const raw = feed[fKey];
            if (raw == null || raw === "") return;
            const num = calibrateSensorValue(fKey, fCfg, raw);
            if (num === null) return;
            hasAny = true;
            _latestCalibrated[chKey][fKey] = num;

            const hKey = chKey+":"+fKey;
            if (!_history[hKey]) _history[hKey]=[];
            _history[hKey].push(num);
            if (_history[hKey].length>20) _history[hKey].shift();

            // Determine tile alert colour based on calibrated physical thresholds
            let tileAccent = "#38bdf8"; // clean cyan/blue
            let statusPill = "NORMAL";
            let pillColor = "#0284c7";

            if (fCfg.critical !== null) {
                const hit = fCfg.thresholdDir==="above" ? num>=fCfg.critical : num<=fCfg.critical;
                if (hit) { tileAccent = "#ef4444"; statusPill = "CRITICAL"; pillColor = "#dc2626"; }
            }
            if (statusPill !== "CRITICAL" && fCfg.warning !== null) {
                const hit = fCfg.thresholdDir==="above" ? num>=fCfg.warning : num<=fCfg.warning;
                if (hit) { tileAccent = "#f59e0b"; statusPill = "WARNING"; pillColor = "#d97706"; }
            }

            const tile = document.createElement("div");
            tile.className = "ts-gauge-tile updated";
            tile.id        = "ts-tile-"+fKey;
            tile.style.borderTopColor = tileAccent;
            // Clean, professional gauge with NO duplicate repeating labels
            tile.innerHTML =
                `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <div class="ts-tile-label">${fCfg.label}</div>
                    <span style="font-size:9px;font-weight:800;padding:2px 6px;border-radius:6px;background:${pillColor};color:white;">${statusPill}</span>
                 </div>`+
                `<div class="ts-tile-value" style="color:${tileAccent}">${num.toFixed(2)}</div>`+
                `<div class="ts-tile-unit">${fCfg.unit || ""}</div>`+
                `<div class="ts-sparkline">${_spark(_history[hKey])}</div>`;
            grid.appendChild(tile);
            setTimeout(()=>tile.classList.remove("updated"),700);
        });

        if (!hasAny) _showNoData("No numeric data yet. Ensure sensor is publishing to ThingSpeak.");
    }

    /* ── Auto-fill form inputs with calibrated values ── */
    function _fillForm(feed, chKey) {
        const ch = _channels[chKey];
        Object.entries(ch.fields).forEach(([fKey, fCfg]) => {
            const raw = feed[fKey];
            if (raw == null || raw === "" || !fCfg.inputId) return;
            const num = calibrateSensorValue(fKey, fCfg, raw);
            if (num === null) return;
            const el = document.getElementById(fCfg.inputId);
            if (el) el.value = num.toFixed(2);
        });
    }

    /* ── No-data placeholder ── */
    function _showNoData(msg) {
        const grid = document.getElementById("tsGaugeGrid");
        if (!grid) return;
        grid.innerHTML = `<div class="ts-no-data"><div class="ts-no-data-icon">&#128225;</div><p>${msg}</p></div>`;
    }

    /* ── Fetch latest from ThingSpeak for one channel ── */
    async function _poll(chKey) {
        const ch = _channels[chKey];
        if (!ch) return;
        const url = `https://api.thingspeak.com/channels/${ch.channelId}/feeds/last.json?api_key=${ch.apiKey}`;
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error("HTTP "+resp.status);
            const data = await resp.json();

            if (typeof data === "number" && data < 0) {
                if (chKey === _activeKey) {
                    _setStatus("stale","NO DATA YET");
                    const lu = document.getElementById("tsLastUpdated");
                    if (lu) lu.textContent = "No readings yet";
                    _showNoData(`Channel #${ch.channelId} has no data. Ensure your ${ch.name} sensor is publishing.`);
                }
                return;
            }

            /* Update status for active channel */
            if (chKey === _activeKey) {
                const age = Date.now() - new Date(data.created_at||0).getTime();
                _setStatus(age>600000?"stale":"live", age>600000?"STALE":"● LIVE");
                const el = document.getElementById("tsLastUpdated");
                if (el) el.textContent = new Date(data.created_at||Date.now()).toLocaleTimeString();
            }

            /* Render calibrated gauges if active */
            _renderGauges(data, chKey);
            _fillForm(data, chKey);

            /* Check if this is a fresh new sensor packet */
            const isNewPacket = !data.entry_id || (data.entry_id !== _latestCalibrated[chKey]?._lastEntryId);
            if (isNewPacket && data.entry_id) {
                _latestCalibrated[chKey]._lastEntryId = data.entry_id;
            }

            /* Run AlertManager on calibrated readings */
            Object.entries(ch.fields).forEach(([fKey, fCfg]) => {
                const raw = data[fKey];
                if (raw == null || raw === "") return;
                const num = calibrateSensorValue(fKey, fCfg, raw);
                if (num !== null) AM.check(chKey, fKey, fCfg, num);
            });

            /* Auto-predict ONLY when active, toggle is ON, AND a new sensor packet arrived */
            if (chKey === _activeKey && isNewPacket) {
                const tog = document.getElementById("tsAutoPredict");
                if (tog && tog.checked) predictHazard({ isAuto: true });
            }

        } catch (err) {
            console.error(`[TS:${chKey}]`, err);
            if (chKey === _activeKey) _setStatus("error","ERROR");
        }
    }

    /* ── Start poller for one channel ── */
    function _startPoller(chKey) {
        if (_pollers[chKey]) clearInterval(_pollers[chKey]);
        _poll(chKey);   // immediate
        _pollers[chKey] = setInterval(()=>_poll(chKey),
            (_channels[chKey].pollIntervalSeconds||30)*1000);
    }

    /* ── Render channel status cards in settings drawer ── */
    function _renderChannelCards() {
        const container = document.getElementById("tsChannelCards");
        if (!container || !_channels) return;
        container.innerHTML = Object.entries(_channels).map(([key,ch])=>`
            <div class="ts-ch-card" id="ts-card-${key}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;font-size:13px;color:#e2e8f0;">${ch.name}</span>
                    <span id="ts-card-status-${key}" class="ts-ch-pill">LIVE</span>
                </div>
                <div style="font-size:11px;color:#475569;margin-top:4px;">Channel #${ch.channelId} • ${Object.keys(ch.fields).length} fields • every ${ch.pollIntervalSeconds}s</div>
                <div style="font-size:11px;color:#6366f1;margin-top:2px;">Hazard: ${ch.hazard}</div>
            </div>`).join("");
    }

    return {
        async init() {
            _setStatus("stale","CONNECTING...");
            try {
                const resp = await fetch("/api/channels");
                _config = await resp.json();
                _channels = _config.channels || {};
                AM.init(_config.alerting || {});

                Object.keys(_channels).forEach(k => _startPoller(k));
                TS.switchToHazard(selectedHazard || "flood");
                _renderChannelCards();

            } catch (e) {
                console.error("[TS] Config fetch failed:", e);
                _setStatus("error","CONFIG ERROR");
                _showNoData("Could not load channel config from /api/channels. Is the backend running?");
            }
        },

        switchToHazard(hazardKey) {
            const chKey = HAZARD_TO_CHANNEL[hazardKey] ?? null;
            _activeKey = chKey;

            if (!chKey || !_channels[chKey]) {
                _setStatus("","NO CHANNEL");
                _setChannelLabel(null);
                const el = document.getElementById("tsLastUpdated");
                if (el) el.textContent = "--";
                _showNoData(`No ThingSpeak channel configured for "${hazardKey}". Available: Flood, Forest Fire, Air Pollution.`);
                return;
            }
            _setChannelLabel(_channels[chKey]);
            _poll(chKey);
        },

        getChannelName(chKey) { return (_channels[chKey]||{}).name || chKey; },

        openSettings() {
            _renderChannelCards();
            document.getElementById("tsOverlay").style.display = "block";
            document.getElementById("tsDrawer").classList.add("open");
            document.body.style.overflow = "hidden";
        },
        closeSettings() {
            document.getElementById("tsOverlay").style.display = "none";
            document.getElementById("tsDrawer").classList.remove("open");
            document.body.style.overflow = "";
        },
        refresh() { if (_activeKey) _poll(_activeKey); }
    };
})();
