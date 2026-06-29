// ==UserScript==
// @name         GeoFS Ground Stability Fix
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      1.0.0
// @description  Fixes slope drift + braking instability
// @match        https://*.geo-fs.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function mag(v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    function normalize(v) {
        let m = mag(v);
        if (m === 0) return [0,0,0];
        return [v[0]/m, v[1]/m, v[2]/m];
    }

    function dot(a,b) {
        return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    }

    function updateGroundFix() {
        try {
            const aircraft = geofs?.aircraft?.instance;
            if (!aircraft) return;

            const rb = aircraft.rigidBody;
            if (!rb) return;

            const controls = geofs.controls;
            if (!controls) return;

            if (!aircraft.groundContact) return;

            const vel = rb.velocity || [0,0,0];
            const speed = mag(vel);
            const brakes = controls.brakes || 0;

            // -----------------------------
            // ✅ 1. HEADING VECTOR
            // -----------------------------
            const headingRad = aircraft.htr?.[0] || 0;

            const forward = [
                Math.sin(headingRad),
                0,
                Math.cos(headingRad)
            ];

            const lateral = [
                forward[2],
                0,
                -forward[0]
            ];

            const forwardSpeed = dot(vel, forward);
            const lateralSpeed = dot(vel, lateral);

            const slip = Math.abs(lateralSpeed) / (speed + 0.01);

            // -----------------------------
            // ✅ 2. STABLE PARK LOCK
            // -----------------------------
            if (brakes > 0.9 && speed < 0.5) {
                rb.velocity = [0,0,0];
                rb.angularVelocity = [0,0,0];
                return;
            }

            // -----------------------------
            // ✅ 3. BRAKE STABILITY (KEY FIX)
            // -----------------------------
            if (brakes > 0.1 && speed < 30) {

                // 👉 reduce braking effect when slipping
                let stability = 1 - Math.min(slip * 2.0, 1);

                // scale braking indirectly via velocity damping
                rb.velocity[0] *= stability;
                rb.velocity[2] *= stability;

                // -------------------------
                // ✅ YAW DAMPING DURING BRAKE
                // -------------------------
                rb.angularVelocity[1] *= (0.2 + 0.8 * stability);
            }

            // -----------------------------
            // ✅ 4. LOW SPEED LATERAL STABILITY
            // -----------------------------
            if (speed < 10) {

                let lateralDamping = 0.9 + (1 - speed/10) * 0.1;

                // remove sideways drift
                let newVel = [...vel];
                let latComponent = lateralSpeed;

                newVel[0] -= lateral[0] * latComponent * lateralDamping;
                newVel[2] -= lateral[2] * latComponent * lateralDamping;

                rb.velocity = newVel;
            }

            // -----------------------------
            // ✅ 5. ANTI-YAW DRIFT (GENERAL)
            // -----------------------------
            if (speed < 2) {
                rb.angularVelocity[1] *= 0.2;
            }

        } catch (e) {
            // safe fail
        }
    }

    function loop() {
        updateGroundFix();
        requestAnimationFrame(loop);
    }

    function waitForGeoFS() {
        if (typeof geofs !== "undefined" && geofs.aircraft) {
            console.log("[GroundFix] Active");
            loop();
        } else {
            setTimeout(waitForGeoFS, 500);
        }
    }

    waitForGeoFS();
})();
