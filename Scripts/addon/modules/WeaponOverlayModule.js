(function () {
  'use strict';

  const { dot, cross, add, mul, DEG, R_EARTH } = CombatMath;

  /**
   * Full-screen 2D canvas that sits above the Cesium view (just below the GeoFS
   * UI) and is the common drawing surface of all combat modules. It was the
   * `frame()` loop of the former f16eegs.js script; the actual content is now
   * drawn by "layers" that other modules register (countermeasures, missiles,
   * gun funnel, A/A radar ...).
   *
   * Per frame it computes a shared `frame` context: aircraft body axes in the
   * camera ENU frame, velocity, angular rate, projection helpers and the
   * HUD clip mask, and hands it to every registered layer in priority order.
   */
  class WeaponOverlayModule {
    constructor(combat, config = {}) {
      this.combat = combat;
      combat.overlay = this;
      this.cfg = {
        color: '#94ffaf',
        maskBottom: 0.62,          // HUD content is clipped at this fraction of the viewport height
        lineDeg: 0.12,             // HUD line width in degrees of view
        hudOffset: { x: 0, y: 0 }, // pixel offset applied to HUD projections
        cockpitOnly: true,         // HUD graphics are only shown from a cockpit camera
        orientationSource: 'aircraft',
        zIndex: 9,                 // just below the GeoFS UI
        enabled: true,
        ...config
      };
      this.enabled = this.cfg.enabled;
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;
      this.rafId = null;
      this.layers = [];
      this.aircraftChangeListeners = new Set();
      this.lastFrameTime = 0;
      this.lastInstance = null;
      this.frameContext = null;

      // Motion estimation state (aircraft velocity and angular rate in ENU).
      this.vel = [0, 0, 0];
      this.omega = [0, 0, 0];
      this.lastPos = null;
      this.lastT = 0;
      this.prevAxes = null;

      // Body-axes sign-convention solver (scores all 8 sign combinations against the camera).
      this.combos = [];
      for (const hs of [1, -1]) for (const ps of [1, -1]) for (const rs of [1, -1]) this.combos.push([hs, ps, rs]);
      this.scores = this.combos.map(() => 0);
      this.best = 0;

      /** Shared list of short-lived impact flashes: { pos: Cartesian3, t0 }. */
      this.impacts = [];

      this.onResize = () => this.resize();
      this.frame = () => this.renderFrame();
    }

    // ---- Lifecycle ----

    start() {
      if (this.canvas) return;
      this.canvas = document.createElement('canvas');
      Object.assign(this.canvas.style, {
        position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: String(this.cfg.zIndex)
      });
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', this.onResize);
      this.rafId = requestAnimationFrame(this.frame);
    }

    stop() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      window.removeEventListener('resize', this.onResize);
      this.canvas?.remove();
      this.canvas = null;
      this.ctx = null;
      this.frameContext = null;
    }

    resize() {
      if (!this.canvas) return;
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(innerWidth * this.dpr);
      this.canvas.height = Math.round(innerHeight * this.dpr);
    }

    // ---- Layer registry ----

    /**
     * Registers a draw/update callback. Lower priority numbers run first.
     * `fn(ctx, frame)` is called every frame while the overlay runs.
     * Returns an unregister function.
     */
    registerLayer(name, priority, fn) {
      const layer = { name, priority, fn };
      this.layers.push(layer);
      this.layers.sort((a, b) => a.priority - b.priority);
      return () => { this.layers = this.layers.filter((item) => item !== layer); };
    }

    /** Calls `listener` when the player switches to another aircraft instance. */
    onAircraftChange(listener) {
      this.aircraftChangeListeners.add(listener);
      return () => this.aircraftChangeListeners.delete(listener);
    }

    /** The context of the most recently rendered frame (null before the first frame). */
    getFrame() {
      return this.frameContext;
    }

    /** Adds an impact flash at a world position. */
    addImpact(position, nowMs = performance.now()) {
      this.impacts.push({ pos: position, t0: nowMs });
    }

    toggleEnabled() {
      this.enabled = !this.enabled;
      this.combat.notify(`EEGS display: ${this.enabled ? 'ON' : 'OFF'}`, 2000);
      return this.enabled;
    }

    // ---- GeoFS state helpers ----

    static isReady() {
      return !!(window.geofs && geofs.aircraft && geofs.aircraft.instance
        && geofs.api && geofs.api.viewer && window.Cesium
        && geofs.animation && geofs.animation.values);
    }

    inCockpit() {
      if (!this.cfg.cockpitOnly) return true;
      const camera = window.geofs?.camera;
      if (!camera) return true;
      const name = String(camera.currentModeName || '').toLowerCase();
      return name ? name.includes('cockpit') : camera.currentMode === 0;
    }

    // ---- Orientation ----

    /** Camera axes [forward, right, down] expressed in the camera's own ENU frame. */
    cameraAxes() {
      const cam = geofs.api.viewer.scene.camera;
      const inv = Cesium.Matrix4.inverseTransformation(
        Cesium.Transforms.eastNorthUpToFixedFrame(cam.positionWC), new Cesium.Matrix4());
      const enu = (c) => {
        const o = Cesium.Matrix4.multiplyByPointAsVector(inv, c, new Cesium.Cartesian3());
        return [o.x, o.y, o.z];
      };
      return [enu(cam.directionWC), enu(cam.rightWC), mul(enu(cam.upWC), -1)];
    }

    /** Aircraft axes [forward, right, down] from GeoFS attitude with the given sign convention. */
    aircraftAxes(hs, ps, rs) {
      const v = geofs.animation.values;
      const h = (v.heading360 || 0) * DEG * hs;
      const p = (v.atilt || 0) * DEG * ps;
      const r = (v.aroll || 0) * DEG * rs;
      const fwd = [Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p)];
      const right0 = [Math.cos(h), -Math.sin(h), 0];
      const up0 = cross(right0, fwd);
      const c = Math.cos(r);
      const s = Math.sin(r);
      const right = add(mul(right0, c), mul(up0, -s));
      const up = add(mul(right0, s), mul(up0, c));
      return [fwd, right, mul(up, -1)];
    }

    /**
     * Body axes of the aircraft. The GeoFS attitude sign convention is not
     * reliable across aircraft, so all 8 sign combinations are scored against the
     * camera while in the cockpit and the best one wins.
     */
    bodyAxes() {
      const cam = this.cameraAxes();
      if (this.cfg.orientationSource === 'camera') return cam;
      const all = this.combos.map((c) => this.aircraftAxes(c[0], c[1], c[2]));
      if (this.inCockpit()) {
        for (let i = 0; i < all.length; i++) {
          const m = dot(all[i][0], cam[0]) + dot(all[i][1], cam[1]) + dot(all[i][2], cam[2]);
          this.scores[i] = this.scores[i] * 0.99 + m;
        }
        for (let i = 0; i < this.scores.length; i++) if (this.scores[i] > this.scores[this.best] + 3) this.best = i;
      }
      return all[this.best];
    }

    /** Estimates aircraft velocity (ENU, m/s) and angular rate (rad/s) from successive frames. */
    updateMotion(axes) {
      const lla = geofs.aircraft.instance.llaLocation;
      const now = performance.now();
      const dt = (now - this.lastT) / 1000;
      if (lla && this.lastPos && dt > 0.001 && dt < 0.5) {
        const a = Math.min(1, dt * 8);
        const n = (lla[0] - this.lastPos[0]) * DEG * R_EARTH / dt;
        const e = (lla[1] - this.lastPos[1]) * DEG * R_EARTH * Math.cos(lla[0] * DEG) / dt;
        const u = (lla[2] - this.lastPos[2]) / dt;
        if (Math.hypot(e, n, u) < 1500) {
          this.vel[0] += (e - this.vel[0]) * a;
          this.vel[1] += (n - this.vel[1]) * a;
          this.vel[2] += (u - this.vel[2]) * a;
        }
        if (this.prevAxes) {
          const prev = this.prevAxes;
          const d = (i, j) => dot(prev[i], axes[j]);
          const w = [(d(2, 1) - d(1, 2)) / (2 * dt),
            (d(0, 2) - d(2, 0)) / (2 * dt),
            (d(1, 0) - d(0, 1)) / (2 * dt)];
          if (Math.hypot(w[0], w[1], w[2]) < 4) {
            const b = Math.min(1, dt * 6);
            for (let i = 0; i < 3; i++) this.omega[i] += (w[i] - this.omega[i]) * b;
          }
        }
      }
      this.lastPos = lla ? lla.slice() : null;
      this.lastT = now;
      this.prevAxes = axes;
    }

    /** Rotates vector `v` by the aircraft angular rate over `t` seconds (body-frame drift). */
    inRotatedFrame(v, t) {
      const omega = this.omega;
      const m = Math.hypot(omega[0], omega[1], omega[2]);
      const th = m * t;
      if (th < 1e-6) return v;
      const k = [omega[0] / m, omega[1] / m, omega[2] / m];
      const c = Math.cos(th);
      const s = Math.sin(th);
      const kxv = cross(k, v);
      const kdv = dot(k, v);
      return [v[0] * c - kxv[0] * s + k[0] * kdv * (1 - c),
        v[1] * c - kxv[1] * s + k[1] * kdv * (1 - c),
        v[2] * c - kxv[2] * s + k[2] * kdv * (1 - c)];
    }

    // ---- Projection ----

    /** Projects an ENU-frame point to page pixel coordinates (null when not visible). */
    toScreen(enuMat, scene, p, raw) {
      const world = CombatMath.worldPosition(enuMat, p);
      return this.worldToScreen(scene, world, raw);
    }

    /** Projects a world position to page pixel coordinates. `raw` skips the HUD offset. */
    worldToScreen(scene, world, raw) {
      const s = CombatMath.projectWorld(scene, world);
      if (!s) return null;
      const rect = scene.canvas.getBoundingClientRect();
      const k = rect.width / scene.canvas.clientWidth || 1;
      const ox = raw ? 0 : this.cfg.hudOffset.x;
      const oy = raw ? 0 : this.cfg.hudOffset.y;
      return { x: rect.left + s.x * k + ox, y: rect.top + s.y * k + oy };
    }

    // ---- Frame loop ----

    renderFrame() {
      this.rafId = requestAnimationFrame(this.frame);
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (!WeaponOverlayModule.isReady()) return;

      const scene = geofs.api.viewer.scene;
      const axes = this.bodyAxes();
      this.updateMotion(axes);

      const nowMs = performance.now();
      const dt = Math.min(0.1, Math.max(0, (nowMs - this.lastFrameTime) / 1000));
      this.lastFrameTime = nowMs;

      if (geofs.aircraft.instance !== this.lastInstance) {
        this.lastInstance = geofs.aircraft.instance;
        for (const listener of this.aircraftChangeListeners) {
          try { listener(); } catch (error) { console.error('[Overlay] aircraft change listener failed', error); }
        }
      }

      const camPos = scene.camera.positionWC;
      const fovy = (scene.camera.frustum && scene.camera.frustum.fovy) || 1;
      const pxPerRad = (scene.canvas.clientHeight / 2) / Math.tan(fovy / 2);
      const ang = (d) => pxPerRad * Math.tan(d * DEG);
      const frame = {
        ctx, scene, nowMs, dt, axes,
        vel: this.vel,
        omega: this.omega,
        enuMat: Cesium.Transforms.eastNorthUpToFixedFrame(camPos),
        pxPerRad,
        ang,
        lw: Math.max(1, ang(this.cfg.lineDeg)),
        maskY: innerHeight * this.cfg.maskBottom,
        active: this.enabled && this.inCockpit(),
        dpr: this.dpr,
        overlay: this
      };
      this.frameContext = frame;

      for (const layer of this.layers) {
        ctx.save();
        try {
          layer.fn(ctx, frame);
        } catch (error) {
          console.error(`[Overlay] layer "${layer.name}" failed`, error);
        }
        ctx.restore();
      }
    }
  }

  window.WeaponOverlayModule = WeaponOverlayModule;
})();
