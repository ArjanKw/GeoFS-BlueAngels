(function () {
  'use strict';

  /**
   * Shared math, geodesy and GeoFS options-panel helpers used by the combat
   * modules (overlay, projectiles, A/A simulation, multiplayer ...).
   * Everything here is stateless; it is a straight extraction of the helper
   * functions of the former f16eegs.js script.
   */
  class CombatMath {
    static DEG = Math.PI / 180;
    static R_EARTH = 6378137;
    static NM = 1852;

    // ---- 3-vector helpers (plain arrays) ----
    static dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    static cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    static add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    static mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

    // ---- Heading / geodesy helpers ----
    static normalizeHeading(heading) {
      return ((heading % 360) + 360) % 360;
    }

    /** Signed shortest angular difference (degrees) from `from` to `to`. */
    static angleDifference(from, to) {
      return ((to - from + 540) % 360) - 180;
    }

    /** Moves a lat/lon point by a north/east offset in meters. */
    static moveGeoPoint(lat, lon, northMeters, eastMeters) {
      const latitudeRad = lat * CombatMath.DEG;
      const nextLat = lat + northMeters / CombatMath.R_EARTH / CombatMath.DEG;
      const longitudeScale = Math.max(0.01, Math.cos(latitudeRad));
      const nextLon = lon + eastMeters / (CombatMath.R_EARTH * longitudeScale) / CombatMath.DEG;
      return { lat: nextLat, lon: nextLon };
    }

    /** Great-circle bearing (deg) and 3D distance (m) from `own` [lat, lon, alt] to a point. */
    static bearingAndDistance(own, lat, lon, alt) {
      const deg = CombatMath.DEG;
      const dLat = (lat - own[0]) * deg;
      const dLon = (lon - own[1]) * deg;
      const lat1 = own[0] * deg;
      const lat2 = lat * deg;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const groundDistance = 2 * CombatMath.R_EARTH * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = Math.hypot(groundDistance, alt - own[2]);
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      const bearing = CombatMath.normalizeHeading(Math.atan2(y, x) / deg);
      return { bearing, distance };
    }

    // ---- Cesium helpers ----
    /** Transforms an ENU-frame point into world (ECEF) coordinates. */
    static worldPosition(enuMat, p) {
      return Cesium.Matrix4.multiplyByPoint(
        enuMat, new Cesium.Cartesian3(p[0], p[1], p[2]), new Cesium.Cartesian3());
    }

    /** Projects a world position to Cesium window coordinates (version independent). */
    static projectWorld(scene, world) {
      const fn = Cesium.SceneTransforms.worldToWindowCoordinates
        || Cesium.SceneTransforms.wgs84ToWindowCoordinates;
      return fn.call(Cesium.SceneTransforms, scene, world);
    }

    /** Rotates `velocity` towards `desired` by at most `maxAngle` radians, keeping its speed. */
    static turnVelocity(velocity, desired, maxAngle) {
      const { dot, cross, add, mul } = CombatMath;
      const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
      const desiredSpeed = Math.hypot(desired[0], desired[1], desired[2]);
      if (speed < 1e-6 || desiredSpeed < 1e-6) return velocity;

      const current = mul(velocity, 1 / speed);
      const target = mul(desired, 1 / desiredSpeed);
      const cosine = Math.max(-1, Math.min(1, dot(current, target)));
      const angle = Math.acos(cosine);
      if (angle < 1e-6) return mul(target, speed);

      const axisVector = cross(current, target);
      const axisLength = Math.hypot(axisVector[0], axisVector[1], axisVector[2]);
      let axis;
      if (axisLength < 1e-6) {
        axis = cross(current, Math.abs(current[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
        const length = Math.hypot(axis[0], axis[1], axis[2]);
        axis = mul(axis, 1 / length);
      } else {
        axis = mul(axisVector, 1 / axisLength);
      }

      const turn = Math.min(angle, maxAngle);
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const rotated = add(add(mul(current, c), mul(cross(axis, current), s)),
        mul(axis, dot(axis, current) * (1 - c)));
      return mul(rotated, speed);
    }

    // ---- GeoFS Options -> General helpers ----

    /**
     * Finds the "General" section of the GeoFS preferences and returns the
     * fieldset with the given class, creating it (with legend and optional
     * instructions) when missing. Returns null while the panel is not in the DOM.
     */
    static ensureGeneralFieldset(className, legendText, instructionsText) {
      const preferences = document.querySelector('.geofs-preferences');
      const general = preferences?.querySelector(':scope > li:first-of-type > .geofs-collapsible');
      if (!general) return null;

      let fieldset = general.querySelector(`.${className}`);
      let created = false;
      if (!fieldset) {
        created = true;
        fieldset = document.createElement('fieldset');
        fieldset.className = className;
        const legend = document.createElement('legend');
        legend.textContent = legendText;
        fieldset.appendChild(legend);
        if (instructionsText) {
          const instructions = document.createElement('p');
          instructions.textContent = instructionsText;
          instructions.style.margin = '8px 0';
          fieldset.appendChild(instructions);
        }
        const controls = document.createElement('div');
        controls.className = `${className}-controls`;
        fieldset.appendChild(controls);
        general.appendChild(fieldset);
      }
      return { fieldset, controls: fieldset.querySelector(`.${className}-controls`), created };
    }

    /** Creates a GeoFS (Material Design Lite) styled button that does not leak clicks. */
    static makeButton(text, ariaLabel, onClick, disabled = false) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mdl-button mdl-js-button mdl-button--raised mdl-button--colored';
      button.textContent = text;
      button.setAttribute('aria-label', ariaLabel);
      button.disabled = disabled;
      button.addEventListener('click', (event) => event.stopPropagation());
      button.addEventListener('click', onClick);
      return button;
    }

    /** Creates a labelled <select> returning a numeric value through `onChange`. */
    static makeSelect(labelText, value, values, onChange, ariaLabel, formatOption = String) {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '6px';
      label.textContent = labelText;
      const select = document.createElement('select');
      select.setAttribute('aria-label', ariaLabel);
      for (const optionValue of values) {
        const option = document.createElement('option');
        option.value = String(optionValue);
        option.textContent = formatOption(optionValue);
        select.appendChild(option);
      }
      select.value = String(value);
      select.addEventListener('change', (event) => {
        event.stopPropagation();
        onChange(Number(select.value));
      });
      select.addEventListener('click', (event) => event.stopPropagation());
      label.appendChild(select);
      return label;
    }

    /** Reads a JSON value from localStorage, returning `fallback` on any failure. */
    static readStorage(key, fallback = null) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    }

    /** Writes a JSON value to localStorage; returns false on failure. */
    static writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    }
  }

  /**
   * Registry that lets the optional combat modules find each other without
   * hard dependencies. Every module registers itself (`combat.projectile = this`)
   * and looks up its collaborators lazily, so any subset can be enabled.
   */
  class CombatContext {
    constructor() {
      this.weapons = null;
      this.overlay = null;
      this.targets = null;
      this.audio = null;
      this.projectile = null;
      this.aaCombat = null;
      this.multiplayer = null;
      this.notifyListeners = new Set();
    }

    /** Subscribes to short status messages (e.g. "TARGET LOCKED"). Returns an unsubscribe function. */
    onNotify(listener) {
      this.notifyListeners.add(listener);
      return () => this.notifyListeners.delete(listener);
    }

    /**
     * Publishes a status message. Nothing is drawn by default: the HUD/MFD of the
     * plugin decides how (and whether) to present it.
     */
    notify(text, durationMs = 2000) {
      for (const listener of this.notifyListeners) {
        try { listener(text, durationMs); } catch (error) { console.error('[Combat] notify listener failed', error); }
      }
    }
  }

  window.CombatMath = CombatMath;
  window.CombatContext = CombatContext;
})();
