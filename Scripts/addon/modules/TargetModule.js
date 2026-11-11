(function () {
  'use strict';

  const { DEG, NM, normalizeHeading, angleDifference, bearingAndDistance } = CombatMath;

  const RADAR_RANGE_NM = 70;

  /**
   * Contact list, target selection and combat lock shared by the HUD,
   * projectile, A/A simulation and multiplayer modules.
   *
   * Contacts come from GeoFS multiplayer users plus any registered provider
   * (the A/A simulation registers its NPC bandits). The "combat lock" is set
   * with the lock key; if none is set, a hard lock made on the RDR MFD page
   * (`addon.radar.hardLockedUid`) is used so both lock mechanisms arm missiles.
   */
  class TargetModule {
    constructor(combat, addon = null) {
      this.combat = combat;
      this.addon = addon;
      combat.targets = this;
      this.targetMode = false;
      this.selectedTargetId = null;
      this.lockedTargetId = null;
      this.currentTargets = [];
      this.providers = new Set();
      this.lastRefreshAt = 0;
      this.unregisterLayer = null;
    }

    start() {
      const overlay = this.combat.overlay;
      if (overlay) {
        this.unregisterLayer = overlay.registerLayer('targets', 4, (ctx, frame) => this.update(frame));
        overlay.onAircraftChange(() => this.reset());
      }
    }

    stop() {
      this.unregisterLayer?.();
      this.unregisterLayer = null;
      this.reset();
    }

    reset() {
      this.targetMode = false;
      this.selectedTargetId = null;
      this.lockedTargetId = null;
      this.currentTargets = [];
    }

    /** Registers a function returning extra contacts: { id, callsign, lat, lon, alt, ...extra }. */
    registerProvider(provider) {
      this.providers.add(provider);
      return () => this.providers.delete(provider);
    }

    /** True while something needs a continuously updated target list. */
    isTrackingNeeded() {
      return this.targetMode
        || !!this.combat.aaCombat?.active
        || !!this.combat.projectile?.hasTrackedMissiles?.();
    }

    update(frame) {
      if (this.isTrackingNeeded()) {
        this.refresh(true);
      } else {
        this.currentTargets = [];
      }
      if (this.selectedTargetId && !this.currentTargets.some((t) => t.id === this.selectedTargetId)) {
        this.selectedTargetId = null;
      }
      if (this.lockedTargetId && !this.currentTargets.some((t) => t.id === this.lockedTargetId)) {
        this.lockedTargetId = null;
        this.combat.notify('RADAR: TARGET LOST', 1500);
      }
      if (this.targetMode && !this.selectedTargetId && this.currentTargets.length) {
        this.selectedTargetId = this.currentTargets[0].id;
      }
    }

    /** Recomputes the contact list (rate limited unless `force`). */
    refresh(force = false) {
      const now = performance.now();
      if (!force && now - this.lastRefreshAt < 100) return this.currentTargets;
      this.lastRefreshAt = now;
      this.currentTargets = this.computeTargets();
      return this.currentTargets;
    }

    computeTargets() {
      if (!window.geofs?.aircraft?.instance) return [];
      const own = geofs.aircraft.instance.llaLocation;
      if (!own) return [];
      const ownHeading = Number(geofs.animation?.values?.heading360 || geofs.animation?.values?.heading) || 0;
      const rangeLimit = RADAR_RANGE_NM * NM;
      const targets = [];

      const consider = (contact) => {
        const { bearing, distance } = bearingAndDistance(own, contact.lat, contact.lon, contact.alt);
        if (!Number.isFinite(distance) || distance < 50 || distance > rangeLimit) return;
        targets.push({
          ...contact,
          bearing,
          rangeNm: distance / NM,
          relativeBearing: angleDifference(ownHeading, bearing)
        });
      };

      for (const user of Object.values(window.multiplayer?.visibleUsers ?? {})) {
        const co = user && user.lastUpdate && user.lastUpdate.co;
        if (!Array.isArray(co) || co.length < 3) continue;
        const lat = Number(co[0]);
        const lon = Number(co[1]);
        const alt = Number(co[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) continue;
        const id = String(user.id ?? user.uid ?? user.callsign ?? user.cs ?? '');
        if (!id) continue;
        consider({
          id,
          callsign: String(user.callsign ?? user.cs ?? user.aircraftName ?? 'CONTACT'),
          lat, lon, alt
        });
      }

      for (const provider of this.providers) {
        let contacts = [];
        try { contacts = provider() || []; } catch (error) { console.error('[Targets] provider failed', error); }
        for (const contact of contacts) consider(contact);
      }

      targets.sort((a, b) => a.rangeNm - b.rangeNm);
      return targets;
    }

    toggleTargetMode() {
      this.targetMode = !this.targetMode;
      if (!this.targetMode) {
        this.selectedTargetId = null;
        this.lockedTargetId = null;
      } else {
        this.refresh(true);
        if (!this.selectedTargetId && this.currentTargets.length) {
          this.selectedTargetId = this.currentTargets[0].id;
        }
      }
      this.combat.notify(`TARGET MODE: ${this.targetMode ? 'ON' : 'OFF'}`, 1500);
    }

    /** Selects the next (+1) or previous (-1) contact and drops any lock. */
    selectTarget(step) {
      this.refresh(true);
      const targets = this.currentTargets;
      if (!targets.length) {
        this.selectedTargetId = null;
        this.lockedTargetId = null;
        this.combat.notify('RADAR: NO CONTACTS', 1500);
        return;
      }
      const index = targets.findIndex((t) => t.id === this.selectedTargetId);
      const next = index < 0
        ? (step > 0 ? 0 : targets.length - 1)
        : (index + step + targets.length) % targets.length;
      this.selectedTargetId = targets[next].id;
      this.lockedTargetId = null;
      this.combat.notify(`TARGET: ${targets[next].callsign}`, 1500);
    }

    toggleLock() {
      this.refresh(true);
      const target = this.currentTargets.find((t) => t.id === this.selectedTargetId);
      if (!target) {
        this.lockedTargetId = null;
        this.combat.notify('RADAR: SELECT A TARGET FIRST', 1500);
        return;
      }
      if (this.lockedTargetId === target.id) {
        this.lockedTargetId = null;
        this.combat.notify('RADAR: LOCK RELEASED', 1500);
      } else {
        this.lockedTargetId = target.id;
        this.combat.notify(`RADAR: LOCKED ${target.callsign}`, 1500);
      }
    }

    getSelectedTarget() {
      return this.currentTargets.find((t) => t.id === this.selectedTargetId) ?? null;
    }

    /** The target a missile would be launched at: combat lock, else the RDR hard lock. */
    getLockedTarget() {
      this.refresh(true);
      if (this.lockedTargetId) {
        const locked = this.currentTargets.find((t) => t.id === this.lockedTargetId);
        if (locked) return locked;
      }
      const radarUid = this.addon?.radar?.hardLockedUid ?? window.BasePlugin?.getActiveAddon?.()?.radar?.hardLockedUid;
      if (radarUid) {
        return this.currentTargets.find((t) => t.id === String(radarUid)) ?? null;
      }
      return null;
    }

    hasLock() {
      return !!this.getLockedTarget();
    }

    findTarget(id) {
      return this.currentTargets.find((t) => t.id === id) ?? null;
    }
  }

  window.TargetModule = TargetModule;
})();
