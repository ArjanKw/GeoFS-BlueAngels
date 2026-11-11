(function () {
  'use strict';

  const { add, mul, DEG, R_EARTH, NM, normalizeHeading, angleDifference, moveGeoPoint, turnVelocity, worldPosition } = CombatMath;

  const NPC_ID_PREFIX = 'addon-bandit-';
  const NPC_HIT_RADIUS_M = 28;
  const NPC_FLARE_RANGE_M = 1800;
  const POI_STORAGE_KEY = 'geofs-addon-combat-aa-poi';
  const DIFFICULTY_NAMES = ['Easy', 'Basic', 'Standard', 'Advanced', 'Expert', 'Hard'];

  const DIFFICULTY_SETTINGS = [
    { speed: 160, turnRate: 12, attackRangeNm: 8, attackDelay: 14000, missileSpeed: 700, missileTurnRate: 1.1, flareChance: 0.25 },
    { speed: 185, turnRate: 16, attackRangeNm: 10, attackDelay: 13000, missileSpeed: 750, missileTurnRate: 1.25, flareChance: 0.35 },
    { speed: 210, turnRate: 20, attackRangeNm: 12, attackDelay: 12000, missileSpeed: 800, missileTurnRate: 1.4, flareChance: 0.45 },
    { speed: 235, turnRate: 24, attackRangeNm: 14, attackDelay: 11000, missileSpeed: 850, missileTurnRate: 1.55, flareChance: 0.58 },
    { speed: 265, turnRate: 30, attackRangeNm: 16, attackDelay: 10000, missileSpeed: 950, missileTurnRate: 1.75, flareChance: 0.72 },
    { speed: 300, turnRate: 36, attackRangeNm: 20, attackDelay: 9000, missileSpeed: 1050, missileTurnRate: 2, flareChance: 0.84 }
  ];

  /**
   * A/A combat simulation: AI bandits that fly towards the player, launch
   * missiles and pop flares, plus the 30 NM mini-radar and bandit HUD markers.
   * Bandits are exposed to TargetModule as a contact provider, and they take
   * damage from ProjectileModule via `damageNpcAtWorldPosition`.
   * The loadout and ammo remain owned by WeaponModule.
   */
  class AACombatModule {
    constructor(combat, config = {}) {
      this.combat = combat;
      combat.aaCombat = this;
      this.cfg = { ...config };
      this.active = false;
      this.npcs = [];
      this.kills = 0;
      this.hits = 0;
      this.hitsTaken = 0;
      this.npcMissiles = [];
      this.npcFlares = [];
      this.flareSequence = 0;
      this.npcSequence = 0;
      this.selectedDifficulty = 3;
      this.selectedBanditCount = 1;
      this.showBanditHudPoi = CombatMath.readStorage(POI_STORAGE_KEY, true) !== false;
      this.lastUiUpdate = 0;
      this.statusElement = null;
      this.startButton = null;
      this.stopButton = null;
      this.unsubscribers = [];
    }

    start() {
      const overlay = this.combat.overlay;
      if (!overlay) return;
      this.unsubscribers.push(
        this.combat.targets?.registerProvider(() => this.getNpcContacts()) ?? (() => {}),
        overlay.registerLayer('aa-sim', 3, (ctx, f) => this.updateSimulation(f)),
        overlay.registerLayer('aa-npc-flares', 20, (ctx, f) => this.drawNpcFlares(ctx, f)),
        overlay.registerLayer('aa-npc-missiles', 30, (ctx, f) => this.updateAndDrawNpcMissiles(ctx, f)),
        overlay.registerLayer('aa-hud-poi', 70, (ctx, f) => this.drawHudTargets(ctx, f)),
        overlay.registerLayer('aa-mini-radar', 80, (ctx, f) => this.drawMiniRadar(ctx, f)),
        overlay.onAircraftChange(() => { if (this.active) this.stopSimulation('A/A SIM STOPPED'); })
      );
      this.mountOptions();
    }

    stop() {
      if (this.active) this.stopSimulation();
      for (const unsubscribe of this.unsubscribers) unsubscribe();
      this.unsubscribers = [];
    }

    getDifficulty(level) {
      const index = Math.max(1, Math.min(DIFFICULTY_SETTINGS.length, Number(level) || 1)) - 1;
      return DIFFICULTY_SETTINGS[index];
    }

    getNpcFlares() {
      return this.npcFlares;
    }

    getNpcContacts() {
      if (!this.active) return [];
      return this.npcs.map((npc) => ({
        id: npc.id, callsign: npc.callsign, lat: npc.lat, lon: npc.lon, alt: npc.alt,
        isNpc: true, health: npc.health, difficulty: npc.difficulty
      }));
    }

    // ---- Simulation control ----

    startSimulation() {
      if (!WeaponOverlayModule.isReady()) {
        this.combat.notify('A/A SIM REQUIRES THE AIRCRAFT TO BE READY', 2500);
        return;
      }
      const own = geofs.aircraft.instance.llaLocation;
      if (!Array.isArray(own) || !Number.isFinite(own[0]) || !Number.isFinite(own[1]) || !Number.isFinite(own[2])) {
        this.combat.notify('A/A SIM: AIRCRAFT POSITION UNAVAILABLE', 2500);
        return;
      }

      const now = performance.now();
      this.removePlayerMissilesAtNpcs(new Set(this.npcs.map((npc) => npc.id)));
      this.npcMissiles = [];
      if (this.combat.projectile) this.combat.projectile.tracers = [];
      const difficulty = this.selectedDifficulty;
      const settings = this.getDifficulty(difficulty);

      this.active = true;
      this.npcs = Array.from({ length: this.selectedBanditCount }, (_, index) => {
        const side = index % 2 === 0 ? 1 : -1;
        const distanceNm = Math.sqrt(5 ** 2 + Math.random() * (30 ** 2 - 5 ** 2));
        const bearing = Math.random() * Math.PI * 2;
        const distanceMeters = distanceNm * NM;
        const position = moveGeoPoint(own[0], own[1],
          Math.cos(bearing) * distanceMeters, Math.sin(bearing) * distanceMeters);
        const sequence = ++this.npcSequence;
        return {
          id: NPC_ID_PREFIX + sequence,
          callsign: `BANDIT ${index + 1}`,
          lat: position.lat,
          lon: position.lon,
          alt: Math.max(0, Number(own[2]) + 150 + (index % 3) * 80),
          heading: Math.random() * 360,
          lastUpdate: now,
          elapsed: 0,
          health: 3,
          side,
          difficulty,
          nextAttackAt: now + settings.attackDelay * 0.5 + index * 1700,
          nextFlareAt: now + 3000 + index * 900
        };
      });
      this.npcFlares = [];

      const targets = this.combat.targets;
      if (targets) {
        targets.targetMode = true;
        targets.selectedTargetId = this.npcs[0]?.id ?? null;
        targets.lockedTargetId = null;
        targets.refresh(true);
      }
      this.combat.notify(`A/A SIM STARTED - ${this.selectedBanditCount} BANDIT(S), DIFFICULTY ${difficulty}/6`, 2500);
      this.updateOptions();
    }

    stopSimulation(message = 'A/A SIM STOPPED') {
      const npcIds = new Set(this.npcs.map((npc) => npc.id));
      this.active = false;
      this.npcs = [];
      this.removePlayerMissilesAtNpcs(npcIds);
      this.npcMissiles = [];
      this.npcFlares = [];
      if (this.combat.projectile) this.combat.projectile.tracers = [];
      const targets = this.combat.targets;
      if (targets) {
        if (npcIds.has(targets.selectedTargetId)) targets.selectedTargetId = null;
        if (npcIds.has(targets.lockedTargetId)) targets.lockedTargetId = null;
        targets.refresh(true);
      }
      this.combat.notify(message, 2000);
      this.updateOptions();
    }

    removePlayerMissilesAtNpcs(npcIds) {
      const projectile = this.combat.projectile;
      if (projectile) projectile.missiles = projectile.missiles.filter((m) => !npcIds.has(m.targetId));
    }

    updateSimulation(f) {
      if (f.nowMs - this.lastUiUpdate > 1000) {
        this.lastUiUpdate = f.nowMs;
        this.mountOptions();
        this.updateOptions();
      }
      if (!this.active || !this.npcs.length) return;
      const own = geofs.aircraft.instance.llaLocation;
      if (!Array.isArray(own) || !Number.isFinite(own[0]) || !Number.isFinite(own[1])) return;
      for (const npc of this.npcs) this.updateNpc(npc, own, f.nowMs, f.dt);
    }

    updateNpc(npc, own, now, dt) {
      const settings = this.getDifficulty(npc.difficulty);
      const dLon = (own[1] - npc.lon) * DEG;
      const lat1 = npc.lat * DEG;
      const lat2 = own[0] * DEG;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      const bearingToPlayer = normalizeHeading(Math.atan2(y, x) / DEG);
      npc.elapsed += dt;

      const maneuver = Math.sin(npc.elapsed * 0.32) * (12 + npc.difficulty * 2);
      const desiredHeading = normalizeHeading(bearingToPlayer + npc.side * (8 + maneuver));
      const maxTurn = settings.turnRate * dt;
      npc.heading = normalizeHeading(
        npc.heading + Math.max(-maxTurn, Math.min(maxTurn, angleDifference(npc.heading, desiredHeading))));

      const headingRad = npc.heading * DEG;
      const travel = settings.speed * dt;
      const position = moveGeoPoint(npc.lat, npc.lon, Math.cos(headingRad) * travel, Math.sin(headingRad) * travel);
      npc.lat = position.lat;
      npc.lon = position.lon;
      npc.alt = Math.max(30, npc.alt + Math.sin(npc.elapsed * 0.7) * 8 * dt);
      npc.lastUpdate = now;

      const ownWorld = Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]);
      const npcWorld = Cesium.Cartesian3.fromDegrees(npc.lon, npc.lat, npc.alt);
      const range = Cesium.Cartesian3.distance(ownWorld, npcWorld);
      const playerMissiles = this.combat.projectile?.missiles ?? [];
      const incomingMissile = playerMissiles.some((missile) => {
        if (missile.targetId !== npc.id) return false;
        const missileWorld = worldPosition(missile.enuMat, missile.position);
        return Cesium.Cartesian3.distance(missileWorld, npcWorld) <= NPC_FLARE_RANGE_M;
      });
      if (incomingMissile && now >= npc.nextFlareAt) {
        this.releaseNpcFlares(npc, now);
        npc.nextFlareAt = now + Math.max(3500, 11000 - npc.difficulty * 1000) + Math.random() * 2500;
        this.combat.notify(`${npc.callsign} FLARES - MISSILE SEEKER MAY BE DECOYED`, 2200);
      }
      const alreadyLaunched = this.npcMissiles.some((missile) => missile.sourceId === npc.id);
      if (now >= npc.nextAttackAt && range <= settings.attackRangeNm * NM && !alreadyLaunched) {
        const direction = Cesium.Cartesian3.subtract(ownWorld, npcWorld, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(direction, direction);
        const velocity = Cesium.Cartesian3.multiplyByScalar(direction, settings.missileSpeed, new Cesium.Cartesian3());
        this.npcMissiles.push({
          sourceId: npc.id,
          callsign: npc.callsign,
          position: npcWorld,
          lastTargetWorld: Cesium.Cartesian3.clone(ownWorld),
          velocity,
          t0: now,
          updatedAt: now,
          maxFlightTime: 60,
          speed: settings.missileSpeed,
          turnRate: settings.missileTurnRate,
          trail: [],
          countermeasureSequence: this.combat.projectile?.countermeasureSequence ?? 0
        });
        npc.nextAttackAt = now + settings.attackDelay + Math.random() * settings.attackDelay * 0.35;
        this.combat.notify(`${npc.callsign} MISSILE LAUNCH - BREAK / BACKSPACE`, 2500);
      }
    }

    releaseNpcFlares(npc, now) {
      const origin = Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(npc.lon, npc.lat, npc.alt));
      const heading = npc.heading * DEG;
      const forward = [Math.sin(heading), Math.cos(heading), 0];
      const right = [Math.cos(heading), -Math.sin(heading), 0];
      const sequence = ++this.flareSequence;
      for (let i = 0; i < 4; i++) {
        this.npcFlares.push({
          type: 'flare',
          ownerId: npc.id,
          sequence,
          t0: now,
          life: 1800, // milliseconds
          origin,
          offset: add(mul(forward, -8), mul(right, (Math.random() - 0.5) * 7)),
          velocity: add(mul(forward, -18 - Math.random() * 8),
            add(mul(right, (Math.random() - 0.5) * 9), [0, 0, 3 + Math.random() * 3]))
        });
      }
    }

    flareWorldPosition(flare, now) {
      const age = Math.max(0, (now - flare.t0) / 1000);
      const local = add(flare.offset, add(mul(flare.velocity, age), [0, 0, -4.905 * age * age]));
      return Cesium.Matrix4.multiplyByPoint(flare.origin,
        new Cesium.Cartesian3(local[0], local[1], local[2]), new Cesium.Cartesian3());
    }

    drawNpcFlares(ctx, f) {
      if (!this.npcFlares.length) return;
      this.npcFlares = this.npcFlares.filter((flare) => f.nowMs - flare.t0 < flare.life);
      ctx.fillStyle = '#ffd26a';
      ctx.shadowColor = '#ff5a18';
      ctx.shadowBlur = 18;
      for (const flare of this.npcFlares) {
        const screen = f.overlay.worldToScreen(f.scene, this.flareWorldPosition(flare, f.nowMs), true);
        if (!screen) continue;
        ctx.globalAlpha = Math.max(0, 1 - (f.nowMs - flare.t0) / flare.life);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- Bandit missiles ----

    updateAndDrawNpcMissiles(ctx, f) {
      if (!this.npcMissiles.length) return;
      const own = geofs.aircraft.instance.llaLocation;
      if (!Array.isArray(own) || own.length < 3) return;
      const now = f.nowMs;
      const ownWorld = Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]);
      const projectile = this.combat.projectile;
      const live = [];

      for (const missile of this.npcMissiles) {
        const age = (now - missile.t0) / 1000;
        if (age > missile.maxFlightTime) {
          this.combat.notify('BANDIT MISSILE EXPIRED', 1500);
          continue;
        }
        if (missile.decoy && now - missile.decoy.t0 >= missile.decoy.life * 1000) {
          missile.decoy = null;
          missile.lastTargetWorld = Cesium.Cartesian3.clone(ownWorld);
        }

        const newCountermeasures = (projectile?.getCountermeasures() ?? []).filter((item) =>
          item.sequence > missile.countermeasureSequence && now - item.t0 < item.life * 1000);
        if (newCountermeasures.length) {
          missile.countermeasureSequence = Math.max(...newCountermeasures.map((item) => item.sequence));
          const flares = newCountermeasures.filter((item) => item.type === 'flare');
          const chaff = newCountermeasures.filter((item) => item.type === 'chaff');
          const decoy = flares[0] || chaff[0];
          const decoyChance = flares.length ? 0.78 : 0.3;
          if (decoy && Math.random() < decoyChance) {
            missile.decoy = decoy;
            missile.lastTargetWorld = projectile.decoyWorldPosition(decoy, now);
            this.combat.notify(`${decoy.type.toUpperCase()} DECOYING BANDIT MISSILE`, 1800);
          }
        }

        const target = missile.decoy ? projectile.decoyWorldPosition(missile.decoy, now) : ownWorld;
        const delta = Cesium.Cartesian3.subtract(target, missile.position, new Cesium.Cartesian3());
        const distance = Cesium.Cartesian3.magnitude(delta);
        const dt = Math.min(0.25, Math.max(0, (now - missile.updatedAt) / 1000));
        const previousPosition = missile.position;
        let nextPosition = previousPosition;
        if (distance > 0 && dt > 0) {
          missile.velocity = turnVelocity(
            [missile.velocity.x, missile.velocity.y, missile.velocity.z],
            [delta.x, delta.y, delta.z],
            missile.turnRate * dt);
          const speed = Math.hypot(...missile.velocity) || 1;
          missile.velocity = mul(missile.velocity, missile.speed / speed);
          nextPosition = Cesium.Cartesian3.add(previousPosition,
            Cesium.Cartesian3.multiplyByScalar(new Cesium.Cartesian3(...missile.velocity), dt, new Cesium.Cartesian3()),
            new Cesium.Cartesian3());
        }

        // Closest approach in the target's frame, so fast passes cannot tunnel through.
        const previousTarget = missile.lastTargetWorld || target;
        const relativeStart = Cesium.Cartesian3.subtract(previousPosition, previousTarget, new Cesium.Cartesian3());
        const relativeEnd = Cesium.Cartesian3.subtract(nextPosition, target, new Cesium.Cartesian3());
        const relativeTravel = Cesium.Cartesian3.subtract(relativeEnd, relativeStart, new Cesium.Cartesian3());
        const travelSquared = Cesium.Cartesian3.dot(relativeTravel, relativeTravel);
        const closestFraction = travelSquared > 0
          ? Math.max(0, Math.min(1, -Cesium.Cartesian3.dot(relativeStart, relativeTravel) / travelSquared))
          : 0;
        const closestPoint = Cesium.Cartesian3.add(relativeStart,
          Cesium.Cartesian3.multiplyByScalar(relativeTravel, closestFraction, new Cesium.Cartesian3()),
          new Cesium.Cartesian3());
        const hitRadius = missile.decoy ? 10 : 55;
        if (Cesium.Cartesian3.magnitude(closestPoint) <= hitRadius) {
          if (missile.decoy) {
            this.combat.notify(`BANDIT MISSILE DEFEATED BY ${missile.decoy.type.toUpperCase()}`, 2000);
          } else {
            this.hitsTaken++;
            this.combat.notify('SIMULATED MISSILE HIT - EVADE WITH BACKSPACE', 2500);
            this.updateOptions();
          }
          continue;
        }

        missile.position = nextPosition;
        missile.lastTargetWorld = Cesium.Cartesian3.clone(target);
        missile.updatedAt = now;
        missile.trail.push(Cesium.Cartesian3.clone(missile.position));
        if (missile.trail.length > 12) missile.trail.shift();
        live.push(missile);

        ctx.save();
        ctx.strokeStyle = '#ff5555';
        ctx.fillStyle = '#ff5555';
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2;
        for (let i = 1; i < missile.trail.length; i++) {
          const from = f.overlay.worldToScreen(f.scene, missile.trail[i - 1], true);
          const to = f.overlay.worldToScreen(f.scene, missile.trail[i], true);
          if (!from || !to) continue;
          ctx.globalAlpha = i / missile.trail.length;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
        const screen = f.overlay.worldToScreen(f.scene, missile.position, true);
        if (screen) {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      this.npcMissiles = live;
    }

    // ---- Damage ----

    /** Applies damage to the bandit closest to a world position; returns true when one was hit. */
    damageNpcAtWorldPosition(world, damage = 1, source = 'GUN') {
      if (!this.active || !this.npcs.length || !world) return false;
      let hitNpc = null;
      let nearest = NPC_HIT_RADIUS_M;
      for (const npc of this.npcs) {
        const distance = Cesium.Cartesian3.distance(world, Cesium.Cartesian3.fromDegrees(npc.lon, npc.lat, npc.alt));
        if (distance <= nearest) {
          nearest = distance;
          hitNpc = npc;
        }
      }
      if (!hitNpc) return false;

      hitNpc.health -= damage;
      this.hits++;
      if (hitNpc.health <= 0) {
        this.kills++;
        const npcId = hitNpc.id;
        this.npcs = this.npcs.filter((npc) => npc.id !== npcId);
        this.removePlayerMissilesAtNpcs(new Set([npcId]));
        this.npcMissiles = this.npcMissiles.filter((missile) => missile.sourceId !== npcId);
        this.npcFlares = this.npcFlares.filter((flare) => flare.ownerId !== npcId);
        const targets = this.combat.targets;
        if (targets) {
          if (targets.selectedTargetId === npcId) targets.selectedTargetId = this.npcs[0]?.id ?? null;
          if (targets.lockedTargetId === npcId) targets.lockedTargetId = null;
        }
        if (!this.npcs.length) {
          this.stopSimulation(`ALL BANDITS DESTROYED - KILL ${this.kills}`);
        } else {
          this.combat.notify(`${hitNpc.callsign} DESTROYED - ${this.npcs.length} LEFT`, 2000);
          this.updateOptions();
        }
      } else {
        this.combat.notify(`${hitNpc.callsign} HIT (${source}) - ${hitNpc.health} HIT(S) LEFT`, 1800);
        this.updateOptions();
      }
      return true;
    }

    // ---- HUD markers and mini-radar ----

    drawHudTargets(ctx, f) {
      if (!f.active || !this.active || !this.showBanditHudPoi) return;
      const targets = (this.combat.targets?.currentTargets ?? []).filter((t) => t.isNpc);
      if (!targets.length) return;

      const { scene, overlay } = f;
      const camera = scene.camera;
      const margin = 28;
      const centerX = innerWidth / 2;
      const centerY = innerHeight / 2;
      const selectedId = this.combat.targets.selectedTargetId;

      ctx.font = 'bold 12px monospace';
      ctx.textBaseline = 'middle';
      for (const target of targets) {
        const world = Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.alt);
        const point = overlay.worldToScreen(scene, world);
        const toTarget = Cesium.Cartesian3.subtract(world, camera.positionWC, new Cesium.Cartesian3());
        const inFront = Cesium.Cartesian3.dot(toTarget, camera.directionWC) > 0;
        let x;
        let y;
        let onScreen = false;
        if (point && inFront) {
          x = point.x;
          y = point.y;
          onScreen = x >= margin && x <= innerWidth - margin && y >= margin && y <= innerHeight - margin;
        }
        if (!onScreen) {
          let directionX;
          let directionY;
          if (point && inFront) {
            directionX = x - centerX;
            directionY = y - centerY;
          } else {
            const bearing = target.relativeBearing * DEG;
            directionX = Math.sin(bearing);
            directionY = -Math.cos(bearing);
          }
          const length = Math.hypot(directionX, directionY) || 1;
          directionX /= length;
          directionY /= length;
          const edgeScale = Math.min(
            (innerWidth / 2 - margin) / Math.max(Math.abs(directionX), 0.001),
            (innerHeight / 2 - margin) / Math.max(Math.abs(directionY), 0.001));
          x = centerX + directionX * edgeScale;
          y = centerY + directionY * edgeScale;
        }

        const selected = target.id === selectedId;
        const color = selected ? '#ffffff' : '#ffab55';
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 7;
        ctx.lineWidth = selected ? 2.5 : 1.5;
        if (onScreen) {
          const size = selected ? 24 : 18;
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        } else {
          ctx.translate(x, y);
          ctx.rotate(Math.atan2(y - centerY, x - centerX) + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, -9);
          ctx.lineTo(7, 7);
          ctx.lineTo(-7, 7);
          ctx.closePath();
          ctx.fill();
          ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
        }
        const labelX = Math.min(x + 14, innerWidth - 140);
        const labelY = Math.max(margin + 5, Math.min(y, innerHeight - margin - 5));
        ctx.textAlign = labelX > innerWidth - 150 ? 'right' : 'left';
        ctx.fillText(`${target.callsign} ${target.rangeNm.toFixed(1)}NM`,
          ctx.textAlign === 'right' ? Math.max(margin + 5, x - 14) : labelX, labelY);
        ctx.restore();
      }
    }

    drawMiniRadar(ctx, f) {
      if (!f.active || !this.active) return;
      const radius = 66;
      const centerX = innerWidth - radius - 24;
      const centerY = innerHeight - radius - 42;
      const rangeNm = 30;
      const pixelsPerNm = radius / rangeNm;
      const ownHeading = Number(geofs.animation.values.heading360 || geofs.animation.values.heading) || 0;
      const own = geofs.aircraft.instance.llaLocation;

      ctx.fillStyle = 'rgba(0, 18, 12, 0.78)';
      ctx.strokeStyle = '#94ffaf';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      for (const ring of [10, 20, 30]) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, ring * pixelsPerNm, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#94ffaf';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
      ctx.fill();
      for (const target of this.combat.targets?.currentTargets ?? []) {
        if (target.rangeNm > rangeNm) continue;
        const angle = angleDifference(ownHeading, target.bearing) * DEG;
        ctx.fillStyle = target.isNpc ? '#ffab55' : '#61d9ff';
        ctx.beginPath();
        ctx.arc(centerX + Math.sin(angle) * target.rangeNm * pixelsPerNm,
          centerY - Math.cos(angle) * target.rangeNm * pixelsPerNm, target.isNpc ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const missile of this.npcMissiles) {
        const position = Cesium.Cartographic.fromCartesian(missile.position);
        if (!position || !own) continue;
        const north = (position.latitude / DEG - own[0]) * DEG * R_EARTH;
        const east = (position.longitude / DEG - own[1]) * DEG * R_EARTH * Math.cos(own[0] * DEG);
        const bearing = normalizeHeading(Math.atan2(east, north) / DEG);
        const range = Math.hypot(north, east) / NM;
        if (range > rangeNm) continue;
        const angle = angleDifference(ownHeading, bearing) * DEG;
        ctx.fillStyle = '#ff4040';
        ctx.fillRect(centerX + Math.sin(angle) * range * pixelsPerNm - 2,
          centerY - Math.cos(angle) * range * pixelsPerNm - 2, 4, 4);
      }
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94ffaf';
      ctx.fillText('A/A RADAR 30 NM', centerX, centerY - radius - 8);
      ctx.font = '9px monospace';
      ctx.fillText('N', centerX, centerY - radius + 11);
      ctx.fillStyle = '#ffab55';
      ctx.fillText('BANDIT', centerX - 25, centerY + radius + 18);
      ctx.fillStyle = '#ff4040';
      ctx.fillText('MISSILE', centerX + 27, centerY + radius + 18);
    }

    // ---- Options -> General UI ----

    mountOptions() {
      const mounted = CombatMath.ensureGeneralFieldset('addon-combat-aa', 'A/A Combat Simulation',
        'Choose difficulty (1 easy to 6 hardest) and 1-10 bandits. Each bandit spawns at a random spot 5-30 NM away, facing a random heading. Settings apply when you start/restart. Bandits fire training missiles and use flares; evade incoming missiles with Backspace. The 30 NM mini-radar appears during the simulation.');
      if (!mounted) return;
      if (!mounted.controls.dataset.built || !this.statusElement?.isConnected) {
        mounted.controls.dataset.built = '1';
        this.buildOptions(mounted.controls);
      }
    }

    buildOptions(container) {
      container.replaceChildren();
      this.statusElement = document.createElement('p');
      container.appendChild(this.statusElement);

      const settings = document.createElement('div');
      Object.assign(settings.style, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', margin: '8px 0' });
      settings.append(
        CombatMath.makeSelect('Difficulty (1 easy - 6 hard)', this.selectedDifficulty, [1, 2, 3, 4, 5, 6],
          (value) => { this.selectedDifficulty = value; }, 'A/A simulation difficulty',
          (value) => `${value} - ${DIFFICULTY_NAMES[value - 1]}`),
        CombatMath.makeSelect('Bandits', this.selectedBanditCount, Array.from({ length: 10 }, (_, i) => i + 1),
          (value) => { this.selectedBanditCount = value; }, 'Number of A/A simulation bandits')
      );
      const poiLabel = document.createElement('label');
      Object.assign(poiLabel.style, { display: 'flex', alignItems: 'center', gap: '6px' });
      const poiCheckbox = document.createElement('input');
      poiCheckbox.type = 'checkbox';
      poiCheckbox.checked = this.showBanditHudPoi;
      poiCheckbox.setAttribute('aria-label', 'Show bandit HUD points of interest');
      poiCheckbox.addEventListener('change', (event) => {
        event.stopPropagation();
        this.showBanditHudPoi = poiCheckbox.checked;
        CombatMath.writeStorage(POI_STORAGE_KEY, this.showBanditHudPoi);
      });
      poiCheckbox.addEventListener('click', (event) => event.stopPropagation());
      poiLabel.append(poiCheckbox, document.createTextNode('Show bandit HUD POI'));
      settings.appendChild(poiLabel);
      container.appendChild(settings);

      const actions = document.createElement('div');
      Object.assign(actions.style, { display: 'flex', flexWrap: 'wrap', gap: '8px' });
      this.startButton = CombatMath.makeButton('Start / Restart A/A',
        'Start or restart A/A training with the selected difficulty and bandit count', () => this.startSimulation());
      this.stopButton = CombatMath.makeButton('Stop Simulation', 'Stop A/A training', () => this.stopSimulation());
      actions.append(this.startButton, this.stopButton);
      container.appendChild(actions);
      this.updateOptions();
    }

    /** Refreshes status text and button states without rebuilding the controls. */
    updateOptions() {
      if (!this.statusElement?.isConnected) return;
      let text = this.active
        ? `${this.npcs.length} BANDIT(S) ACTIVE | DIFFICULTY ${this.npcs[0]?.difficulty ?? this.selectedDifficulty}/6 | ${this.kills} KILL(S)`
        : `INACTIVE | ${this.kills} KILL(S) | ${this.hits} HIT(S)`;
      if (this.active) text += ` | INCOMING: ${this.npcMissiles.length} | HITS TAKEN: ${this.hitsTaken}`;
      const mp = this.combat.multiplayer;
      if (mp?.enabled && mp.group) text += ` | MP SYNC ${mp.sharedHits} HIT(S)`;
      this.statusElement.textContent = text;
      if (this.startButton) this.startButton.disabled = !WeaponOverlayModule.isReady();
      if (this.stopButton) this.stopButton.disabled = !this.active;
    }
  }

  window.AACombatModule = AACombatModule;
})();
