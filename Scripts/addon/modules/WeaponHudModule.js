(function () {
  'use strict';

  const { dot, add, mul, DEG } = CombatMath;

  /**
   * Gun/weapon HUD drawn on the shared overlay: boresight cross, ballistic gun
   * funnel (the EEGS "wingspan" funnel with range ticks), the missile arc and
   * the target box. Port of the HUD drawing of the former f16eegs.js script.
   * Only visible in A/A mode from the cockpit view.
   */
  class WeaponHudModule {
    constructor(combat, weaponModule, config = {}) {
      this.combat = combat;
      this.weapons = weaponModule;
      combat.weaponHud = this;
      this.cfg = {
        hudFov: { w: 18, h: 20 },   // HUD clip window in degrees
        crossDeg: 0.7,
        step: 0.03,                 // funnel time step in seconds
        maxTime: 4,
        minRange: 150,
        maxRange: 2400,
        wingspan: 10.7,
        tickRanges: [500, 1000, 1500, 2000],
        tickTextDeg: 0.8,
        counterTextDeg: 1.1,
        lockedColor: '#ff5959',
        showAmmoCounter: false,
        showHudFrame: false,
        ...config
      };
      this.unregisterLayer = null;
    }

    start() {
      this.unregisterLayer = this.combat.overlay?.registerLayer('weapon-hud', 60,
        (ctx, frame) => this.draw(ctx, frame)) ?? null;
    }

    stop() {
      this.unregisterLayer?.();
      this.unregisterLayer = null;
    }

    polyline(ctx, pts) {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    getSelectedStation() {
      const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
      const loadout = this.weapons.getModeLoadout(mode);
      const selected = this.weapons.ensureSelectedWeapon(mode, loadout);
      return { mode, loadout, selected };
    }

    draw(ctx, f) {
      if (!f.active) return;
      const { mode, loadout, selected } = this.getSelectedStation();
      // Missiles get no overlay drawing; their range bracket lives in the F-18 HUD.
      if (mode !== 'A/A' || selected?.station !== 'gun') return;

      const { scene, axes, vel, enuMat, pxPerRad, ang, overlay } = f;
      const color = overlay.cfg.color;
      const boresight = overlay.toScreen(enuMat, scene, mul(axes[0], 1000));
      if (!boresight) return;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = f.lw;
      ctx.shadowColor = color;
      ctx.shadowBlur = 3;

      const halfW = pxPerRad * Math.tan(this.cfg.hudFov.w / 2 * DEG);
      const halfH = pxPerRad * Math.tan(this.cfg.hudFov.h / 2 * DEG);
      const top = boresight.y - halfH;
      const bottom = Math.min(boresight.y + halfH, f.maskY);

      if (this.cfg.showHudFrame) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.strokeRect(boresight.x - halfW, top, halfW * 2, boresight.y + halfH - top);
        ctx.strokeStyle = '#ff5050';
        ctx.beginPath();
        ctx.moveTo(0, f.maskY);
        ctx.lineTo(innerWidth, f.maskY);
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.rect(boresight.x - halfW, top, halfW * 2, Math.max(0, bottom - top));
      ctx.clip();

      const targets = this.combat.targets;
      if (targets?.targetMode) {
        this.drawTarget(ctx, f, targets.getSelectedTarget(), {
          left: boresight.x - halfW, right: boresight.x + halfW, top, bottom
        });
      }

      ctx.beginPath();
      const arm = ang(this.cfg.crossDeg);
      ctx.moveTo(boresight.x - arm, boresight.y);
      ctx.lineTo(boresight.x + arm, boresight.y);
      ctx.moveTo(boresight.x, boresight.y - arm);
      ctx.lineTo(boresight.x, boresight.y + arm);
      ctx.stroke();

      this.drawFunnel(ctx, f, boresight);

      if (this.cfg.showAmmoCounter) {
        const station = selected?.station === 'gun' ? null : loadout?.[selected?.side]?.[selected?.station];
        const label = selected?.station === 'gun' ? 'GUN' : (station?.load ?? '');
        const ammo = selected?.station === 'gun' ? loadout?.gun : station?.quantity;
        if (label) {
          ctx.font = `bold ${Math.max(8, ang(this.cfg.counterTextDeg))}px monospace`;
          ctx.textAlign = 'left';
          ctx.fillStyle = ammo > 0 ? color : '#ff0000';
          ctx.fillText(ammo > 0 ? `${label} ${String(ammo).padStart(3, '0')}` : `${label} NO AMMO`,
            boresight.x - halfW + ang(0.5), bottom - ang(0.6));
        }
      }
    }

    drawFunnel(ctx, f, boresight) {
      const { scene, axes, vel, enuMat, pxPerRad, ang, overlay } = f;
      const cfg = this.cfg;
      const gun = WeaponModule.gunMetadata;
      const v0 = add(vel, mul(axes[0], gun.muzzleVelocity));
      const pts = [];
      for (let t = cfg.step; t <= cfg.maxTime; t += cfg.step) {
        const k = (1 - Math.exp(-gun.drag * t)) / gun.drag;
        const bullet = add(mul(v0, k), [0, 0, -0.5 * gun.gravity * t * t]);
        const rel = [bullet[0] - vel[0] * t, bullet[1] - vel[1] * t, bullet[2] - vel[2] * t];
        const b0 = [dot(axes[0], rel), dot(axes[1], rel), dot(axes[2], rel)];
        const b = overlay.inRotatedFrame(b0, t);
        const range = Math.hypot(b[0], b[1], b[2]);
        if (range < cfg.minRange) continue;
        if (range > cfg.maxRange) break;
        const dir = add(add(mul(axes[0], b[0] / range), mul(axes[1], b[1] / range)),
          mul(axes[2], b[2] / range));
        const screen = overlay.toScreen(enuMat, scene, mul(dir, 1000));
        if (screen) pts.push({ x: screen.x, y: screen.y, r: range });
      }
      if (pts.length < 3) return;

      const left = [];
      const right = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        let tx = next.x - prev.x;
        let ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const half = (cfg.wingspan / 2) / pts[i].r * pxPerRad;
        left.push({ x: pts[i].x - ty * half, y: pts[i].y + tx * half, r: pts[i].r });
        right.push({ x: pts[i].x + ty * half, y: pts[i].y - tx * half, r: pts[i].r });
      }
      this.polyline(ctx, left);
      this.polyline(ctx, right);
      ctx.font = `${Math.max(6, ang(cfg.tickTextDeg))}px monospace`;
      ctx.textAlign = 'left';
      for (const range of cfg.tickRanges) {
        const i = left.findIndex((p) => p.r >= range);
        if (i < 0) continue;
        ctx.beginPath();
        ctx.moveTo(left[i].x, left[i].y);
        ctx.lineTo(right[i].x, right[i].y);
        ctx.stroke();
        ctx.fillText((range / 1000).toFixed(1), right[i].x + ang(0.4), right[i].y + ang(0.3));
      }
    }

    /** Box and label around the selected target when it is inside the HUD window. */
    drawTarget(ctx, f, target, bounds) {
      if (!target) return;
      const world = Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.alt);
      const point = f.overlay.worldToScreen(f.scene, world);
      if (!point) return;
      const { x, y } = point;
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;

      const size = 22;
      const half = size / 2;
      const color = this.combat.targets.getLockedTarget()?.id === target.id
        ? this.cfg.lockedColor
        : f.overlay.cfg.color;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.strokeRect(x - half, y - half, size, size);
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(target.callsign.slice(0, 14), x + half + 4, y - 2);
      ctx.textBaseline = 'top';
      ctx.fillText(`${target.rangeNm.toFixed(1)} NM`, x + half + 4, y + 2);
      ctx.restore();
    }
  }

  window.WeaponHudModule = WeaponHudModule;
})();
