(function () {
  'use strict';

  const { add, mul, NM, turnVelocity, worldPosition } = CombatMath;

  const TRAIL_LIFE_MS = 1400;
  const IMPACT_LIFE_MS = 500;

  /**
   * Player projectiles: tracers, homing missiles, impacts and countermeasures.
   *
   * It consumes WeaponModule `fire` events (WeaponModule stays the single owner of
   * loadout and ammo) and simulates/draws what was fired on the shared overlay.
   * Lock acquisition is delegated to TargetModule, NPC reactions and damage to
   * AACombatModule, and network events to MultiplayerModule.
   */
  class ProjectileModule {
    constructor(combat, weaponModule, config = {}) {
      this.combat = combat;
      this.weapons = weaponModule;
      combat.projectile = this;
      this.cfg = { tracers: true, ...config };

      this.missiles = [];
      this.tracers = [];
      this.countermeasures = [];
      this.tracerAcc = 0;
      this.countermeasureSequence = 0;
      this.networkMissileSequence = 0;
      this.unsubscribers = [];
    }

    start() {
      this.unsubscribers.push(this.weapons.on('fire', (event) => this.onFire(event)));
      const overlay = this.combat.overlay;
      if (overlay) {
        this.unsubscribers.push(
          overlay.registerLayer('countermeasures', 10, (ctx, frame) => this.drawCountermeasures(ctx, frame)),
          overlay.registerLayer('projectiles', 50, (ctx, frame) => this.updateAndDraw(ctx, frame)),
          overlay.onAircraftChange(() => this.reset())
        );
      }
    }

    stop() {
      for (const unsubscribe of this.unsubscribers) unsubscribe();
      this.unsubscribers = [];
      this.reset();
    }

    reset() {
      this.missiles = [];
      this.tracers = [];
      this.countermeasures = [];
      this.tracerAcc = 0;
    }

    hasTrackedMissiles() {
      return this.missiles.some((missile) => missile.targetId);
    }

    getCountermeasures() {
      return this.countermeasures;
    }

    // ---- Firing ----

    onFire(event) {
      const frame = this.combat.overlay?.getFrame();
      if (!frame || !window.geofs?.aircraft?.instance) return;
      if (event.weapon === 'GUN') {
        this.fireGunRound(frame, event.metadata?.projectile ?? WeaponModule.gunMetadata);
      } else if (event.weapon) {
        this.launchMissile(frame, event);
      }
    }

    /** ENU frame anchored at the aircraft, used by projectiles so they stay in world space. */
    aircraftOrigin() {
      const lla = geofs.aircraft.instance.llaLocation;
      if (!lla) return null;
      return Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(lla[1], lla[0], lla[2]));
    }

    fireGunRound(frame, gun) {
      this.tracerAcc += 1;
      if (!this.cfg.tracers) return;
      while (this.tracerAcc >= gun.tracerEvery) {
        this.tracerAcc -= gun.tracerEvery;
        const origin = this.aircraftOrigin();
        if (!origin) return;
        this.tracers.push({
          enuMat: origin,
          t0: performance.now(),
          v0: add(frame.vel, mul(frame.axes[0], gun.muzzleVelocity)),
          gun
        });
      }
    }

    /**
     * Chance that a missile fired from `distanceNm` actually hits, from the
     * WeaponModule effectiveness window. Unknown profiles always hit.
     */
    computeHitChance(metadata, distanceNm) {
      const engagement = metadata?.engagement_window;
      const effective = metadata?.effective_range;
      if (!engagement || !effective) return 1;
      if (distanceNm < engagement.min || distanceNm > engagement.max) return 0.1;
      if (distanceNm >= effective.min && distanceNm <= effective.max) return 0.95;
      const edge = distanceNm < effective.min
        ? (distanceNm - engagement.min) / Math.max(0.01, effective.min - engagement.min)
        : (engagement.max - distanceNm) / Math.max(0.01, engagement.max - effective.max);
      return 0.25 + 0.7 * Math.max(0, Math.min(1, edge));
    }

    launchMissile(frame, event) {
      const target = this.combat.targets?.getLockedTarget();
      if (!target) return;
      const origin = this.aircraftOrigin();
      if (!origin) return;

      const projectile = event.metadata?.projectile ?? WeaponModule.defaultMissileMetadata;
      const now = performance.now();
      const start = mul(frame.axes[0], 7);
      const velocity = add(frame.vel, mul(frame.axes[0], projectile.launchSpeed ?? 850));
      const willHit = Math.random() < this.computeHitChance(event.metadata, target.rangeNm);
      let missOffset = [0, 0, 0];
      if (!willHit) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 120 + Math.random() * 230;
        missOffset = [Math.cos(angle) * distance, Math.sin(angle) * distance, (Math.random() - 0.5) * 120];
      }

      const missile = {
        enuMat: origin,
        invEnuMat: Cesium.Matrix4.inverseTransformation(origin, new Cesium.Matrix4()),
        t0: now,
        updatedAt: now,
        maxFlightTime: Math.min(projectile.maxFlightTime ?? 60,
          Math.max(8, target.rangeNm * NM / 700 + 10)),
        speed: projectile.speed ?? 900,
        turnRate: projectile.turnRate ?? 1.2,
        v0: velocity,
        start,
        position: start.slice(),
        velocity: velocity.slice(),
        trail: [],
        targetId: target.id,
        npcCountermeasureSequence: this.combat.aaCombat?.flareSequence ?? 0,
        weapon: event.weapon,
        willHit,
        missOffset,
        networkId: !target.isNpc
          ? Date.now().toString(36) + '-' + (++this.networkMissileSequence).toString(36)
          : null
      };
      this.missiles.push(missile);

      let status = '';
      if (missile.networkId) {
        const mp = this.combat.multiplayer;
        if (!mp || !mp.enabled) {
          status = 'MP SYNC OFF';
        } else if (!mp.group) {
          status = 'MP GROUP MISSING';
        } else {
          status = 'MP EVENT SENDING';
          void mp.sendEvent([3, 'L', missile.networkId, target.id, Date.now()]).then((sent) => {
            if (sent) this.combat.notify('MISSILE EVENT SENT IN PUBLIC CHAT', 2500);
          });
        }
      }
      this.combat.notify(`${event.weapon} LAUNCHED: ${target.callsign}${status ? ' | ' + status : ''}`, 1500);
    }

    sendTerminal(missile, kind) {
      if (!missile.networkId) return;
      if (kind === 'H' ? missile.networkHitSent : missile.networkTerminalSent) return;
      if (kind === 'H') missile.networkHitSent = true;
      missile.networkTerminalSent = true;
      void this.combat.multiplayer?.sendEvent([1, kind, missile.networkId, missile.targetId, Date.now()]);
    }

    // ---- Countermeasures ----

    releaseCountermeasures() {
      if (!WeaponOverlayModule.isReady()) return;
      const lla = geofs.aircraft.instance.llaLocation;
      if (!lla) return;
      const now = performance.now();
      const axes = this.combat.overlay?.getFrame()?.axes ?? this.combat.overlay.bodyAxes();
      const origin = Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(lla[1], lla[0], lla[2]));
      const invOrigin = Cesium.Matrix4.inverseTransformation(origin, new Cesium.Matrix4());
      const sequence = ++this.countermeasureSequence;
      for (let i = 0; i < 18; i++) {
        const lateral = (Math.random() - 0.5) * 8;
        this.countermeasures.push({
          type: 'chaff', t0: now, life: 2.2, sequence, origin, invOrigin,
          offset: add(mul(axes[0], -7), mul(axes[1], lateral)),
          velocity: add(mul(axes[0], -12 - Math.random() * 8), mul(axes[1], (Math.random() - 0.5) * 12)),
          size: 1 + Math.random() * 1.5
        });
      }
      for (let i = 0; i < 3; i++) {
        this.countermeasures.push({
          type: 'flare', t0: now, life: 1.8, sequence, origin, invOrigin,
          offset: add(mul(axes[0], -7), mul(axes[1], (Math.random() - 0.5) * 5)),
          velocity: add(mul(axes[0], -18 - Math.random() * 8), [0, 0, -3 - Math.random() * 4]),
          size: 3 + Math.random() * 2
        });
      }
      this.combat.audio?.countermeasureSound();
      const evade = this.combat.multiplayer?.evadeIncomingMissiles();
      if (!evade || !evade.count) {
        this.combat.notify('CHAFF / FLARE RELEASED', 1500);
        return;
      }
      this.combat.notify('FLARES RELEASED - REPORTING MISSILE EVADE', 2000);
      void evade.promise.then((sentCount) => {
        this.combat.notify(sentCount === evade.count
          ? 'FLARES RELEASED - MISSILE EVADE SENT'
          : 'FLARES RELEASED - EVADE MESSAGE NOT SENT', 2000);
      });
    }

    /** Static world position of a countermeasure (it no longer follows the aircraft); used as a missile decoy. */
    decoyWorldPosition(p, nowMs) {
      const age = Math.max(0, (nowMs - p.t0) / 1000);
      const local = add(p.offset, add(mul(p.velocity, age), [0, 0, -4.905 * age * age]));
      return Cesium.Matrix4.multiplyByPoint(p.origin,
        new Cesium.Cartesian3(local[0], local[1], local[2]), new Cesium.Cartesian3());
    }

    /** World position of a player countermeasure at time `nowMs`, relative to the aircraft's frame. */
    countermeasureWorld(p, nowMs, aircraftWorld) {
      const age = (nowMs - p.t0) / 1000;
      const aircraftPosition = Cesium.Matrix4.multiplyByPoint(p.invOrigin, aircraftWorld, new Cesium.Cartesian3());
      const offset = add(aircraftPosition,
        add(p.offset, add(mul(p.velocity, age), [0, 0, -4.905 * age * age])));
      return Cesium.Matrix4.multiplyByPoint(p.origin,
        new Cesium.Cartesian3(offset[0], offset[1], offset[2]), new Cesium.Cartesian3());
    }

    drawCountermeasures(ctx, frame) {
      const now = frame.nowMs;
      this.countermeasures = this.countermeasures.filter((p) => now - p.t0 < p.life * 1000);
      if (!this.countermeasures.length) return;
      const lla = geofs.aircraft.instance.llaLocation;
      if (!lla) return;
      const aircraftWorld = Cesium.Cartesian3.fromDegrees(lla[1], lla[0], lla[2]);
      for (const p of this.countermeasures) {
        const age = (now - p.t0) / 1000;
        const screen = frame.overlay.worldToScreen(frame.scene, this.countermeasureWorld(p, now, aircraftWorld), true);
        if (!screen) continue;
        ctx.globalAlpha = 1 - age / p.life;
        if (p.type === 'flare') {
          ctx.fillStyle = '#ffd26a';
          ctx.shadowColor = '#ff5a18';
          ctx.shadowBlur = 22;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, p.size * (1 - age / p.life * 0.35) + 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#e7edf2';
          ctx.shadowColor = '#d8e4ef';
          ctx.shadowBlur = 8;
          ctx.fillRect(screen.x, screen.y, p.size + 2, p.size + 1);
        }
      }
    }

    // ---- Simulation and drawing ----

    isBelowTerrain(scene, world) {
      if (!scene.globe || !scene.globe.getHeight) return false;
      const cartographic = Cesium.Cartographic.fromCartesian(world);
      if (!cartographic) return false;
      const height = scene.globe.getHeight(cartographic);
      return height !== undefined && cartographic.height <= height;
    }

    updateAndDraw(ctx, f) {
      const aaCombat = this.combat.aaCombat;
      const targets = this.combat.targets;
      const impacts = f.overlay.impacts;
      if (!f.active) this.tracers = [];

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, innerWidth, f.maskY);
      ctx.clip();
      this.updateMissiles(ctx, f, aaCombat, targets, impacts);
      this.updateTracers(ctx, f, aaCombat, impacts);
      this.drawImpacts(ctx, f, impacts);
      ctx.restore();
    }

    updateMissiles(ctx, f, aaCombat, targets, impacts) {
      const { scene, nowMs } = f;
      const ballistic = (missile, t) => {
        const k = (1 - Math.exp(-0.03 * t)) / 0.03;
        return add(missile.start, add(mul(missile.v0, k), [0, 0, -0.75 * t * t]));
      };
      const live = [];

      for (const missile of this.missiles) {
        const t = (nowMs - missile.t0) / 1000;
        if (t > missile.maxFlightTime) {
          this.sendTerminal(missile, 'X');
          continue;
        }
        const target = missile.targetId && targets?.findTarget(missile.targetId);
        let position;
        if (target) {
          if (target.isNpc && missile.npcDecoy && nowMs - missile.npcDecoy.t0 >= missile.npcDecoy.life) {
            impacts.push({ pos: aaCombat.flareWorldPosition(missile.npcDecoy, nowMs), t0: nowMs });
            this.combat.notify('PLAYER MISSILE SPOOFED BY BANDIT FLARE', 2000);
            continue;
          }
          if (target.isNpc && !missile.npcDecoy && aaCombat) {
            const newFlares = aaCombat.getNpcFlares().filter((flare) =>
              flare.ownerId === target.id
              && flare.sequence > (missile.npcCountermeasureSequence ?? 0)
              && nowMs - flare.t0 < flare.life);
            if (newFlares.length) {
              missile.npcCountermeasureSequence = Math.max(...newFlares.map((flare) => flare.sequence));
              if (Math.random() < aaCombat.getDifficulty(target.difficulty).flareChance) {
                missile.npcDecoy = newFlares[0];
              }
            }
          }
          const targetWorld = target.isNpc && missile.npcDecoy
            ? aaCombat.flareWorldPosition(missile.npcDecoy, nowMs)
            : Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.alt);
          const targetLocal = Cesium.Matrix4.multiplyByPoint(
            missile.invEnuMat, targetWorld, new Cesium.Cartesian3());
          // A missile that is going to miss homes on a point beside the target.
          const aim = [targetLocal.x + missile.missOffset[0],
            targetLocal.y + missile.missOffset[1],
            targetLocal.z + missile.missOffset[2]];
          const delta = [aim[0] - missile.position[0], aim[1] - missile.position[1], aim[2] - missile.position[2]];
          const distance = Math.hypot(delta[0], delta[1], delta[2]);
          const dt = Math.min(0.1, Math.max(0, (nowMs - missile.updatedAt) / 1000));
          if (distance <= missile.speed * dt + 15) {
            const impactPosition = worldPosition(missile.enuMat, aim);
            if (target.isNpc && missile.npcDecoy) {
              this.combat.notify('PLAYER MISSILE DECOYED BY BANDIT FLARE', 2000);
            } else if (!missile.willHit) {
              this.combat.notify(`${missile.weapon} MISSED`, 2000);
              this.sendTerminal(missile, 'X');
            } else if (target.isNpc) {
              aaCombat?.damageNpcAtWorldPosition(impactPosition, 3, 'MISSILE');
            } else {
              this.sendTerminal(missile, 'H');
            }
            impacts.push({ pos: impactPosition, t0: nowMs });
            continue;
          }
          if (distance > 0) {
            missile.velocity = turnVelocity(missile.velocity, delta, missile.turnRate * dt);
            const velocityLength = Math.hypot(...missile.velocity) || 1;
            missile.velocity = mul(missile.velocity, missile.speed / velocityLength);
            missile.position = add(missile.position, mul(missile.velocity, dt));
            missile.updatedAt = nowMs;
          }
          position = missile.position;
        } else {
          // Target lost: fly the launch trajectory ballistically.
          position = ballistic(missile, t);
        }

        const world = worldPosition(missile.enuMat, position);
        if (this.isBelowTerrain(scene, world)) {
          this.sendTerminal(missile, 'X');
          impacts.push({ pos: world, t0: nowMs });
          continue;
        }
        live.push(missile);

        const lastPoint = missile.trail[missile.trail.length - 1];
        if (!lastPoint || Math.hypot(position[0] - lastPoint.position[0],
          position[1] - lastPoint.position[1], position[2] - lastPoint.position[2]) >= 5
          || nowMs - lastPoint.t0 >= 75) {
          missile.trail.push({ position: position.slice(), t0: nowMs });
        }
        missile.trail = missile.trail.filter((point) => nowMs - point.t0 < TRAIL_LIFE_MS);

        if (f.active) this.drawMissile(ctx, f, missile, position);
      }
      this.missiles = live;
    }

    drawMissile(ctx, f, missile, position) {
      const { scene, nowMs, overlay } = f;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      for (let i = 1; i < missile.trail.length; i++) {
        const previousPoint = missile.trail[i - 1];
        const currentPoint = missile.trail[i];
        const fade = Math.max(0, 1 - (nowMs - currentPoint.t0) / TRAIL_LIFE_MS);
        const a = overlay.toScreen(missile.enuMat, scene, previousPoint.position, true);
        const b = overlay.toScreen(missile.enuMat, scene, currentPoint.position, true);
        if (!a || !b) continue;
        ctx.globalAlpha = 0.25 * fade;
        ctx.lineWidth = 1 + 2 * fade;
        ctx.shadowBlur = 4 * fade;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const current = overlay.toScreen(missile.enuMat, scene, position, true);
      const previous = missile.trail.length > 1
        ? overlay.toScreen(missile.enuMat, scene, missile.trail[missile.trail.length - 2].position, true)
        : null;
      if (current) {
        if (previous) {
          const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = '#ffb06a';
          ctx.shadowColor = '#ff7a24';
          ctx.shadowBlur = 9;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(current.x - Math.cos(angle) * 2, current.y - Math.sin(angle) * 2);
          ctx.lineTo(current.x - Math.cos(angle) * 10, current.y - Math.sin(angle) * 10);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(current.x, current.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    updateTracers(ctx, f, aaCombat, impacts) {
      if (!this.cfg.tracers) { this.tracers = []; return; }
      const { scene, nowMs, overlay } = f;
      const alive = [];
      ctx.save();
      for (const tracer of this.tracers) {
        const gun = tracer.gun;
        const offs = (t) => {
          const k = (1 - Math.exp(-gun.drag * t)) / gun.drag;
          return [tracer.v0[0] * k, tracer.v0[1] * k, tracer.v0[2] * k - 0.5 * gun.gravity * t * t];
        };
        const t = (nowMs - tracer.t0) / 1000;
        if (t > 3) continue;
        const pa = offs(t);
        const world = worldPosition(tracer.enuMat, pa);
        if (this.isBelowTerrain(scene, world)) {
          impacts.push({ pos: world, t0: nowMs });
          continue;
        }
        if (aaCombat?.damageNpcAtWorldPosition(world, 1, 'GUN')) continue;
        alive.push(tracer);
        if (!f.active || Math.hypot(pa[0], pa[1], pa[2]) < gun.tracerMinDist) continue;
        const a = overlay.toScreen(tracer.enuMat, scene, pa, true);
        const b = overlay.toScreen(tracer.enuMat, scene, offs(Math.max(0, t - 0.05)), true);
        if (!a || !b) continue;
        ctx.strokeStyle = gun.tracerColor;
        ctx.shadowColor = gun.tracerColor;
        ctx.shadowBlur = 6;
        ctx.lineWidth = Math.max(1.5, f.ang(0.15));
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
      }
      ctx.restore();
      this.tracers = alive;
    }

    drawImpacts(ctx, f, impacts) {
      const { scene, nowMs, overlay } = f;
      for (let i = impacts.length - 1; i >= 0; i--) {
        if (nowMs - impacts[i].t0 >= IMPACT_LIFE_MS) impacts.splice(i, 1);
      }
      if (!f.active) return;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = WeaponModule.gunMetadata.impactColor;
      for (const impact of impacts) {
        const s = overlay.worldToScreen(scene, impact.pos, true);
        if (!s) continue;
        const k = 1 - (nowMs - impact.t0) / IMPACT_LIFE_MS;
        ctx.globalAlpha = k;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2 + 6 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  window.ProjectileModule = ProjectileModule;
})();
