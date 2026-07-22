// ==UserScript==
// @name         GeoFS Ground Stability Fix
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      2.0.0
// @description  Prevents your aircraft from yawing left/right while standing still, even when braking. Also prevents drifting left/right when braking and getting to a stop.
// @match        https://www.geo-fs.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    class GroundStabilityModule {
        constructor() {
            this.animFrameId = null;
            this.lastLogTime = 0;
        }

        start() {
            this.loop();
        }

        loop() {
            this.updateStability();
            this.animFrameId = requestAnimationFrame(() => this.loop());
        }

        // Dampens all rotational speeds to a complete standstill (Remains 100% unengaged!)
        zeroAllAngularVelocity(rb) {
            if (Array.isArray(rb.angularVelocity)) {
                rb.angularVelocity[0] = 0;
                rb.angularVelocity[1] = 0;
                rb.angularVelocity[2] = 0;
            }
            if (Array.isArray(rb.v_angularVelocity)) {
                rb.v_angularVelocity[0] = 0;
                rb.v_angularVelocity[1] = 0;
                rb.v_angularVelocity[2] = 0;
            }
        }

        // Actively cleared all accumulated rotational forces (torque and acceleration) in the engine
        suppressRotationalForces(rb) {
            const forceProps = ['v_rotationalAcceleration', 'rotationalAcceleration', 'v_torque', 'torque'];
            for (const prop of forceProps) {
                if (Array.isArray(rb[prop])) {
                    rb[prop][0] = 0;
                    rb[prop][1] = 0;
                    rb[prop][2] = 0;
                }
            }
        }

        updateStability() {
            const aircraft = geofs.aircraft?.instance;

            if (!aircraft?.groundContact || !aircraft.rigidBody) {
                return;
            }

            const rb = aircraft.rigidBody;
            const brakes = aircraft.brakesOn ? 1 : 0;
            const yawInput = aircraft.animationValue.rawYaw;

            const vel = aircraft.velocity;
            if (!vel) return;

            const vx = vel[0] || 0;
            const vy = vel[1] || 0;
            const vz = vel[2] || 0;
            const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

            // ==========================================
            // 1. STANDSTILL LOCK.
            // ==========================================
            if (brakes > 0.5 && speed < 0.3) {
                vel[0] = 0;
                vel[2] = 0;
                if (rb.velocity) {
                    rb.velocity[0] = 0;
                    rb.velocity[2] = 0;
                }
                this.zeroAllAngularVelocity(rb);
                return;
            }

            // ==========================================
            // 2. LOW-SPEED BRAKING STEERING FIX (< 15 m/s)
            // ==========================================
            if (brakes > 0.1 && speed < 15) {
                // Eliminate the reverse frictional force (Torque/Acceleration) from GeoFS
                this.suppressRotationalForces(rb);

                const isSteering = Math.abs(yawInput) > 0.05;

                if (!isSteering) {
                    // Braking whilst travelling straight ahead: Freeze Yaw (Index 2) and Roll (Index 0). Pitch (Index 1) remains free.
                    if (Array.isArray(rb.angularVelocity)) {
                        rb.angularVelocity[0] = 0;
                        rb.angularVelocity[2] = 0;
                    }
                    if (Array.isArray(rb.v_angularVelocity)) {
                        rb.v_angularVelocity[0] = 0;
                        rb.v_angularVelocity[2] = 0;
                    }
                } else {
                    // Steering whilst braking: Set the correct rotation speed on Index 2 (Yaw)
                    const turnFactor = 0.35;
                    const speedScaling = Math.min(speed / 5, 1.0);
                    let targetYaw = yawInput * turnFactor * speedScaling;

                    if (Array.isArray(rb.angularVelocity)) rb.angularVelocity[2] = targetYaw;
                    if (Array.isArray(rb.v_angularVelocity)) rb.v_angularVelocity[2] = targetYaw;
                }
            }
        }
    }

    function init() {
        if (typeof geofs !== 'undefined' && geofs.aircraft?.instance) {
            console.log('[GroundStabilityModule] Initialized v2.7.0 (Deep Override + Telemetry)');
            const stabilityModule = new GroundStabilityModule();
            stabilityModule.start();
        } else {
            setTimeout(init, 500);
        }
    }

    init();
})();