  class F18HudModule {
    static HUD_PHYSICAL_HEIGHT_M = 0.30;
    static HUD_PARALLAX_GAIN = 1.65;
    static CAMERA_TO_HUD_DISTANCE_M = 0.92;
    static DEFAULT_COLOR = '#00ff00';
    static RAD_TO_DEG = 180 / Math.PI;

    // Prepares HUD module state and renderer references.
    constructor(dependencies = {}) {
      this.dependencies = {
        optionModule: dependencies.optionModule ?? OptionModule,
        helperModule: dependencies.helperModule ?? HelperModule,
        cameraModule: dependencies.cameraModule ?? CameraModule,
        mfdModule: dependencies.mfdModule ?? MfdModule,
        getAddon: dependencies.getAddon ?? (() => window.BasePlugin?.getActiveAddon?.() ?? null)
      };
      this.originalRenderer = null;
      this.installed = false;
      this.fpvState = {
        lastLat: null,
        lastLon: null,
        lastAlt: null,
        relAzDeg: 0,
        relElDeg: 0,
        valid: false
      };
      this.maxG = 1;
    }

    getAddon() {
      return this.dependencies.getAddon?.() ?? null;
    }

    getOption(pageTitle, buttonKey, fallback = null) {
      return this.dependencies.optionModule?.getOption?.(pageTitle, buttonKey, fallback);
    }

    setOption(pageTitle, buttonKey, value) {
      return this.dependencies.optionModule?.setOption?.(pageTitle, buttonKey, value);
    }

    getOptionValue(pageTitle, buttonKey, fallback = null) {
      return this.dependencies.optionModule?.getOptionValue?.(pageTitle, buttonKey, fallback);
    }

    getMfdBrightnessFactor() {
      return this.getAddon()?.mfd?.getMfdBrightnessFactor?.() ?? 0.6;
    }

    applyBrightnessToHexColor(color, factor) {
      return this.getAddon()?.mfd?.applyBrightnessToHexColor?.(color, factor) ?? color;
    }

    getWpnModeFromOptions() {
      return this.getAddon()?.weapons?.getModeFromOptions?.() ?? 'NAV';
    }

    getWpnModeLoadout(mode) {
      return this.getAddon()?.weapons?.getModeLoadout?.(mode) ?? null;
    }

    getSelectedWpnQuantityLine(mode, modeLoadout) {
      return this.getAddon()?.weapons?.getSelectedQuantityLine?.(mode, modeLoadout) ?? 'N/A';
    }

    updateWpnRearmState() {
      return this.getAddon()?.weapons?.updateRearmState?.();
    }

    isWpnFireFlashVisible() {
      return this.getAddon()?.weapons?.isFireFlashVisible?.() ?? false;
    }

    getWpnActionFlashLabel() {
      return this.getAddon()?.weapons?.getActionFlashLabel?.() ?? 'FIRE';
    }

    getNavModule() {
      return this.getAddon()?.nav ?? null;
    }

    getCommunicationModule() {
      return this.getAddon()?.communication ?? null;
    }

    registerMfdPages(mfdModule = this.dependencies.mfdModule) {
      mfdModule.registerPage({
        title: 'HUD',
        leftButtons: [
          {
            key: 'HUD',
            label: 'HUD',
            states: ['F-18', 'DEFAULT'],
            stateIndex: 0,
            onClick: ({ nextState }) => {
              this.setMode(nextState);
            }
          },
          { key: 'BRIGHT', label: 'BRT', states: ['NORM', 'DAY', 'NIGHT'], stateIndex: 0 },
          { key: 'LEVEL', label: 'LVL', states: ['FULL', 'DECLUTTERED', 'MIN'], stateIndex: 0 },
          {
            key: 'MAX_G',
            label: 'MAXG',
            states: ['RESET'],
            stateIndex: 0,
            onClick: () => {
              const currentLoadFactor = window.geofs?.animation?.values?.loadFactor;
              this.maxG = Number.isFinite(currentLoadFactor) ? currentLoadFactor : 1;
            }
          },
        ],
        rightButtons: [
          { key: 'COLOR', label: 'COLOR', states: ['GREEN', 'WHITE', 'BLUE', 'RED'], values: ['#00FF00', '#FFFFFF', '#00fffb', '#FF0000'], stateIndex: 0 },
        ],
        lines: []
      });
      return true;
    }

    // Installs the custom HUD renderer while preserving the original one.
    static isAircraftActive() {
      return Boolean(window.BasePlugin?.getActivePlugin?.()?.isAircraftActive?.());
    }

    install() {
      if (this.installed) {
        return true;
      }

      const renderers = window.instruments?.renderers;
      if (!renderers?.genericHUD) {
        return false;
      }

      if (!window.__GeoFsOriginalGenericHudRenderer) {
        window.__GeoFsOriginalGenericHudRenderer = renderers.genericHUD;
      }

      this.originalRenderer = window.__GeoFsOriginalGenericHudRenderer;
      const self = this;
      renderers.genericHUD = function (renderer) {
        if (!F18HudModule.isAircraftActive() || self.getOption('HUD', 'HUD', 'F-18') === 'DEFAULT') {
          return window.__GeoFsOriginalGenericHudRenderer.call(this, renderer);
        }
        self.renderF18Hud(renderer);
      };

      this.installed = true;
      return true;
    }

    getMode() {
      return this.getOption('HUD', 'HUD', 'F-18');
    }

    setMode(mode) {
      this.setOption('HUD', 'HUD', mode);
      this.ensureLoaded();
      return mode;
    }

    // Ensures the HUD renderer is installed and active.
    ensureLoaded() {
      if (this.getOption('HUD', 'HUD', 'F-18') === 'DEFAULT') {
        this.restore();
        return true;
      }

      if (!this.install()) {
        return false;
      }
      return true;
    }

    // Restores the original HUD renderer and clears install state.
    restore() {
      if (window.__GeoFsOriginalGenericHudRenderer && window.instruments?.renderers) {
        window.instruments.renderers.genericHUD = window.__GeoFsOriginalGenericHudRenderer;
      }
      this.originalRenderer = null;
      this.installed = false;
    }

    getCurrentCameraZ() {
      const mode = window.geofs?.camera?.modes?.[1];
      const baseZ = mode?.position?.[2] ?? this.dependencies.cameraModule?.DEFAULT_HUD_CAMERA_Z;
      const offsetZ = mode?.offsets?.current?.[2] ?? 0;
      return baseZ + offsetZ;
    }

    computeHudGeometry(w, h, camera) {
      // 1. De sleutel voor 3D Cockpit HUDs: De verticale kijkhoek van het glas (Combiner FOV).
      // Een echte F/A-18 HUD beslaat ongeveer 16.5 graden van boven naar beneden op het glas.
      // -> Ladder te dicht op elkaar? Verlaag dit getal (bijv. naar 14 of 15).
      // -> Ladder te ver uit elkaar (buiten beeld)? Verhoog dit getal (bijv. naar 18 of 20).
      const HUD_VERTICAL_FOV_DEG = this.config?.hudFovDeg || 16.5;

      // 2. Bereken pixels per graad direct op basis van de textuurhoogte en het glazen venster
      const pixelsPerDeg = h / HUD_VERTICAL_FOV_DEG;
      const pixelsPerDegX = pixelsPerDeg; // Vierkante pixels op de HUD-textuur

      // 3. Optische parallax / Boresight offset (in graden t.o.v. het midden van de textuur).
      // Omdat de virtuele piloot net iets boven of onder de verlichte projector kan zitten,
      // kun je hiermee de hele symbologie verticaal uitlijnen met de buitenwereld.
      // -> Vlieg je vlak (0 fpm) en staat de 0-horizon van de HUD net te LAAG? Maak dit getal positiever.
      // -> Staat de 0-horizon net te HOOG? Maak dit getal negatiever (bijv. -1.5).
      const cameraOffsetYDeg = this.config?.cameraOffsetYDeg || 0; 
      const cameraOffsetPx = cameraOffsetYDeg * pixelsPerDeg;

      // Fictieve focal length behouden voor eventuele interne compatibiliteit in de rest van je script
      const focalLengthPx = (h / 2) / Math.tan((HUD_VERTICAL_FOV_DEG * (Math.PI / 180)) / 2);

      return { pixelsPerDeg, pixelsPerDegX, cameraOffsetPx, focalLengthPx };
    }

    updateFpvState() {
    // 1. Controleer of Cesium en de camera beschikbaar zijn in GeoFS
    if (!window.geofs?.api?.viewer?.camera || !window.Cesium) {
      return;
    }

    const camera = geofs.api.viewer.camera;
    // Pak de exacte 3D World Coordinates (Cartesian3) van de camera
    const currLoc = camera.positionWC;

    if (!this.lastCamLoc) {
      this.lastCamLoc = Cesium.Cartesian3.clone(currLoc);
      this.fpvState = { valid: false, relAzDeg: 0, relElDeg: 0 };
      return;
    }

    // 2. Bereken de 3D-verplaatsing (delta) in de wereldruimte (ECEF)
    const deltaLoc = Cesium.Cartesian3.subtract(currLoc, this.lastCamLoc, new Cesium.Cartesian3());
    this.lastCamLoc = Cesium.Cartesian3.clone(currLoc);

    // Als het vliegtuig stilstaat, behouden we de laatste staat
    const speedSq = Cesium.Cartesian3.magnitudeSquared(deltaLoc);
    if (speedSq < 1e-7) {
      return;
    }

    // 3. Transformeer de 3D vector van Wereldruimte naar Camera-lokale ruimte via de Cesium ViewMatrix
    // Dit compenseert automatisch voor camerapositie (stoelhoogte, head-shift, kijkhoek)
    const viewMatrix = camera.viewMatrix;
    const deltaCam = Cesium.Matrix4.multiplyByPointAsVector(viewMatrix, deltaLoc, new Cesium.Cartesian3());

    // In Cesium Camera Space:
    // deltaCam.x = rechts (+) / links (-)
    // deltaCam.y = omhoog (+) / omlaag (-)
    // deltaCam.z = naar achteren (+) / naar voren (-) -> Cesium gebruikt -Z als vooruit
    const forward = -deltaCam.z; 
    const right = deltaCam.x;
    const up = deltaCam.y;

    // Alleen geldig als we vooruit bewegen
    if (forward <= 0) {
      this.fpvState.valid = false;
      return;
    }

    // 4. Bereken de exacte hoekafwijking in graden t.o.v. de kijklijn van de camera
    const relAzRad = Math.atan2(right, forward);
    const relElRad = Math.atan2(up, forward);

    this.fpvState = {
      valid: true,
      relAzDeg: relAzRad * (180 / Math.PI),
      relElDeg: relElRad * (180 / Math.PI)
    };
  }

    static drawAoaText(ctx, w, h, aoa) {
    const previousAlign = ctx.textAlign;
    const previousBaseline = ctx.textBaseline;
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`α ${aoa.toFixed(1)}`, w * 0.716, h * 0.93);
    ctx.textAlign = previousAlign;
    ctx.textBaseline = previousBaseline;
  
    }

    static drawBoresight(ctx, cx, cy, cameraOffsetPx, w, h) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);

    const wx = cx;
    const wy = cy - cameraOffsetPx;
    const ww = w * 0.027;
    const wh = h * 0.016;
    const stub = w * 0.010;

    ctx.beginPath();
    ctx.moveTo(wx - ww, wy);
    ctx.lineTo(wx - ww * 0.55, wy + wh);
    ctx.lineTo(wx, wy - wh * 0.15);
    ctx.lineTo(wx + ww * 0.55, wy + wh);
    ctx.lineTo(wx + ww, wy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(wx - ww - stub, wy);
    ctx.lineTo(wx - ww, wy);
    ctx.moveTo(wx + ww, wy);
    ctx.lineTo(wx + ww + stub, wy);
    ctx.stroke();
    ctx.restore();
  }

  static drawPitchLadder(ctx, camera, pitchDeg, fpvState, fpvPos, cx, clipCy, symbolCy, pixelsPerDeg, w, h) {
    // Bepaal het ankerpunt voor de rotatie en centrering: de FPV (indien geldig), anders als fallback de boresight
    const anchorX = fpvPos ? fpvPos.x : cx;
    const anchorY = fpvPos ? fpvPos.y : symbolCy;
    
    // De absolute vluchthoek (Flight Path Angle / fpaDeg) van de FPV t.o.v. de horizon.
    // Dit is de neus-pitch + de relatieve elevatie van de FPV.
    const fpaDeg = (fpvPos && fpvState?.valid) ? (pitchDeg + (fpvState.relElDeg || 0)) : pitchDeg;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Clip to an approximate physical HUD combiner shape
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.06);
    ctx.lineTo(w * 0.66, h * 0.06);
    ctx.lineTo(w * 0.92, h * 0.27);
    ctx.lineTo(w * 0.82, h * 0.92);
    ctx.lineTo(w * 0.18, h * 0.92);
    ctx.lineTo(w * 0.08, h * 0.27);
    ctx.closePath();
    ctx.clip();

    // Verplaats de canvas-oorsprong EXACT naar de FPV en roteer rondom dit punt met de rolhoek
    ctx.translate(anchorX, anchorY);
    ctx.rotate(-camera.roll);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.5;

    // Artificial Horizon (0 graden lijn)
    // In ons nieuwe FPV-gerichte coördinatenstelsel is (0,0) de FPV.
    // De horizon ligt op verticale afstand fpaDeg onder/boven de FPV.
    const horizonOffsetY = fpaDeg * pixelsPerDeg;

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-w * 0.56, horizonOffsetY);
    ctx.lineTo(w * 0.56, horizonOffsetY);
    ctx.stroke();

    const TICK_RANGE_DEG = 85;
    const SEGMENT_OUTER = w * 0.14;
    const SEGMENT_INNER = w * 0.025;
    const END_TICK_LEN = h * 0.03;
    const LABEL_X = SEGMENT_OUTER + w * 0.025;

    const savedFont = ctx.font;
    const savedAlign = ctx.textAlign;
    const savedBaseline = ctx.textBaseline;
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.font = `${Math.round(h * 0.038)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;

    for (let deg = 5; deg <= TICK_RANGE_DEG; deg += 5) {
      for (const sign of [-1, 1]) {
        const ladderDeg = sign * deg;
        // De verticale afstand van deze laddertrede t.o.v. de FPV is het verschil tussen FPA en de ladderhoek
        const tickY = (fpaDeg - ladderDeg) * pixelsPerDeg;
        
        const isBelow = ladderDeg < 0; // Negatieve pitch ligt onder de horizon
        const tickDir = isBelow ? -1 : 1; // "Stubs" aan de uiteinden wijzen altijd richting de horizon

        ctx.setLineDash(isBelow ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(-SEGMENT_OUTER, tickY);
        ctx.lineTo(-SEGMENT_INNER, tickY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(SEGMENT_INNER, tickY);
        ctx.lineTo(SEGMENT_OUTER, tickY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(-SEGMENT_OUTER, tickY);
        ctx.lineTo(-SEGMENT_OUTER, tickY + tickDir * END_TICK_LEN);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(SEGMENT_OUTER, tickY);
        ctx.lineTo(SEGMENT_OUTER, tickY + tickDir * END_TICK_LEN);
        ctx.stroke();

        ctx.fillText(String(deg), -LABEL_X - 3, isBelow ? tickY - 7 : tickY + 7);
        ctx.fillText(String(deg), LABEL_X + 3, isBelow ? tickY - 7 : tickY + 7);
      }
    }

    ctx.font = savedFont;
    ctx.textAlign = savedAlign;
    ctx.textBaseline = savedBaseline;
    ctx.setLineDash([]);
    ctx.restore();
  }

  computeFpvScreenPosition(camera, cx, cy, pixelsPerDeg, pixelsPerDegX, cameraOffsetPx) {
    if (!this.fpvState || !this.fpvState.valid) {
      return { x: cx, y: cy - cameraOffsetPx, clamped: false };
    }

    // Bereken ongeklemde X en Y op de HUD canvas
    let x = cx + (this.fpvState.relAzDeg * pixelsPerDegX);
    let y = (cy - cameraOffsetPx) - (this.fpvState.relElDeg * pixelsPerDeg);

    // Marges van de fysieke HUD-combiner glasranden (in pixels vanaf het midden)
    const maxMarginX = cx * 0.75; 
    const maxMarginY = cy * 0.80; 

    let clamped = false;

    // Klem de FPV binnen de grenzen van de HUD
    if (Math.abs(x - cx) > maxMarginX) {
      x = cx + Math.sign(x - cx) * maxMarginX;
      clamped = true;
    }
    if (Math.abs(y - (cy - cameraOffsetPx)) > maxMarginY) {
      y = (cy - cameraOffsetPx) + Math.sign(y - (cy - cameraOffsetPx)) * maxMarginY;
      clamped = true;
    }

    return { x, y, clamped };
  }

  static drawFpv(ctx, fpvPos, cx, clipCy, w, h) {
    if (!fpvPos) return null;
    const fpvX = fpvPos.x;
    const fpvY = fpvPos.y;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.ellipse(cx, clipCy, w * 0.28, h * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);

    const r = w * 0.012;
    const wing = w * 0.024;
    const tail = h * 0.024;

    ctx.beginPath();
    ctx.arc(fpvX, fpvY, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(fpvX - r - wing, fpvY);
    ctx.lineTo(fpvX - r, fpvY);
    ctx.moveTo(fpvX + r, fpvY);
    ctx.lineTo(fpvX + r + wing, fpvY);
    ctx.moveTo(fpvX, fpvY - r);
    ctx.lineTo(fpvX, fpvY - r - tail);
    ctx.stroke();

    ctx.restore();

    return { x: fpvX, y: fpvY, r, wing };
    }

    static drawAoaBracket(ctx, fpvDrawn, cx, clipCy, pixelsPerDeg, w, h, aoa, isGearDown) {
    if (!isGearDown || !fpvDrawn || !Number.isFinite(aoa)) return;

    // Calibration: top aligns at 6.9, middle at 8.1, bottom at 9.3.
    const AOA_TOP = 6.9;
    const AOA_STEP = 1.2;
    const tickSpacingPx = AOA_STEP * pixelsPerDeg;
    const index = (aoa - AOA_TOP) / AOA_STEP;

    const topY = fpvDrawn.y - index * tickSpacingPx;
    const midY = topY + tickSpacingPx;
    const bottomY = topY + 2 * tickSpacingPx;

    const bracketX = fpvDrawn.x - fpvDrawn.r - fpvDrawn.wing - w * 0.022;
    const tickLen = w * 0.018;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.ellipse(cx, clipCy, w * 0.28, h * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([]);

    // Vertical spine.
    ctx.beginPath();
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX, bottomY);
    ctx.stroke();

    // Right-facing ticks: top, middle, bottom.
    ctx.beginPath();
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX + tickLen, topY);
    ctx.moveTo(bracketX, midY);
    ctx.lineTo(bracketX + tickLen, midY);
    ctx.moveTo(bracketX, bottomY);
    ctx.lineTo(bracketX + tickLen, bottomY);
    ctx.stroke();

    ctx.restore();
    }

    static drawSpeedBox(ctx, kias, w, h) {
    const boxX = w * 0.145;
    const boxY = h * 0.295;
    const boxW = w * 0.118;
    const boxH = h * 0.064;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = Math.max(1.2, w * 0.0028);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.font = `bold ${Math.round(h * 0.042)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(kias)}`, boxX + boxW / 2, boxY + boxH / 2 + 1);
    ctx.restore();
    }

    static drawAltitudeBox(ctx, alt, w, h) {
    const boxX = w * 0.730;
    const boxY = h * 0.295;
    const boxW = w * 0.138;
    const boxH = h * 0.064;

    const altRounded = Math.max(0, Math.round(alt));
    const thousands = Math.floor(altRounded / 1000);
    const hundreds = altRounded % 1000;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = Math.max(1.2, w * 0.0028);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    const rightX = boxX + boxW - w * 0.012;
    const centerY = boxY + boxH / 2 + 1;
    const smallText = String(hundreds).padStart(3, '0');

    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    ctx.font = `bold ${Math.round(h * 0.034)}px monospace`;
    const smallWidth = ctx.measureText(smallText).width;
    ctx.fillText(smallText, rightX, centerY);

    ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
    ctx.fillText(String(thousands), rightX - smallWidth - w * 0.006, centerY);
    ctx.restore();
    }

    static drawLeftReadouts(ctx, mach, gValue, aoa, maxGValue, autopilot, w, h) {
    const x = w * 0.145;
    const y1 = h * 0.405;
    const y2 = h * 0.457;
    const y3 = h * 0.509;
    const y4 = h * 0.561;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.font = `${Math.round(h * 0.036)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const gPrefix = 'G ';
    const gPrefixWidth = ctx.measureText(gPrefix).width;

    ctx.fillText(`M ${mach.toFixed(2)}`, x, y1);
    ctx.fillText(`α ${aoa.toFixed(1)}`, x, y2);
    ctx.fillText(gPrefix, x, y3);
    ctx.fillText(gValue.toFixed(1), x + gPrefixWidth, y3);
    // Max G zonder prefix, uitgelijnd op het G-getal.
    ctx.fillText(maxGValue.toFixed(1), x + gPrefixWidth, y4);

    if (autopilot?.on) {
      const sepY = h * 0.596;
      ctx.beginPath();
      ctx.moveTo(x, sepY);
      ctx.lineTo(w * 0.265, sepY);
      ctx.strokeStyle = this.DEFAULT_COLOR;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const rowStep = h * 0.046;
      let rowY = sepY + h * 0.038;
      ctx.font = `${Math.round(h * 0.032)}px monospace`;

      if (autopilot?.values?.speed != null) {
        ctx.fillText(`SPD ${Math.round(autopilot.values.speed)}`, x, rowY);
        rowY += rowStep;
      }

      if (autopilot?.values?.altitude != null) {
        const altitudeText = String(autopilot.values.altitude).split('.')[0];
        ctx.fillText(`ALT ${altitudeText}`, x, rowY);
        rowY += rowStep;
      }

      if (autopilot?.mode) {
        ctx.fillText(String(autopilot.mode), x, rowY);
      }
    }

    ctx.restore();
    }

    static drawRightReadouts(ctx, vsi, radioAlt, trimDisplay, navUnit, navModule, w, h, wpnHudStatus) {
    const x = w * 0.730;
    const yTop = h * 0.260;
    const yBottom = h * 0.405;
    const yTrim = h * 0.457;
    const yWpn1 = h * 0.509;
    const yWpn2 = h * 0.561;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.font = `${Math.round(h * 0.036)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(` ${vsi >= 0 ? ' ' : ''}${vsi}`, x, yTop);

    if (radioAlt <= 10000) {
      ctx.fillText(`R ${Math.round(radioAlt)}`, x, yBottom);
    }

    ctx.fillText(trimDisplay, x, yTrim);

    if (wpnHudStatus) {
      ctx.fillText(wpnHudStatus.line1, x, yWpn1);
      ctx.fillText(wpnHudStatus.line2, x, yWpn2);
    }

    if (navUnit != null) {
      const navReadouts = navModule?.getReadouts?.(navUnit) ?? {};
      const sepY = h * 0.596;
      ctx.beginPath();
      ctx.moveTo(x, sepY);
      ctx.lineTo(w * 0.85, sepY);
      ctx.strokeStyle = this.DEFAULT_COLOR;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const rowStep = h * 0.046;
      let rowY = sepY + h * 0.038;
      ctx.font = `${Math.round(h * 0.032)}px monospace`;

      const dme = Number.isFinite(navReadouts.dme) ? navReadouts.dme : '';
      const bearing = Number.isFinite(navReadouts.bearing) ? navReadouts.bearing : '';
      const course = Number.isFinite(navReadouts.course) ? navReadouts.course : '';
      const timeToSignal = Number.isFinite(navReadouts.timeToSignal) ? navReadouts.timeToSignal : '';

      ctx.fillText(`DME ${dme}`, x, rowY);
      rowY += rowStep;
      ctx.fillText(`B ${bearing}`, x, rowY);
      rowY += rowStep;
      ctx.fillText(`C ${course}`, x, rowY);
      rowY += rowStep;
      ctx.fillText(`T ${timeToSignal} MIN`, x, rowY);
      rowY += rowStep;

      ctx.fillText(navReadouts.navaidLabel || '', x, rowY);
    }

    ctx.restore();
    }

    static drawTopHeadingScale(ctx, renderer, hdg, navUnit, helperModule, w, h) {
    const bandX = w * 0.275;
    const bandY = h * 0.078;
    const bandW = w * 0.450;
    const bandH = h * 0.108;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bandX, bandY, bandW, bandH);
    ctx.clip();
    ctx.textAlign = 'center';
    const prevFont = ctx.font;
    ctx.font = `${Math.round(h * 0.030)}px monospace`;

    renderer.drawGrads(renderer.canvasAPI, {
      position: [bandX, bandY + h * 0.030],
      zero: [bandW / 2, 0],
      size: [bandW, bandH],
      orientation: 'x',
      direction: 1,
      value: hdg,
      interval: 5,
      pixelRatio: w * 0.0105,
      pattern: [[{
        length: h * 0.016,
        legend: true,
        legendOffset: { x: 0, y: -h * 0.004 },
        process: v => {
          const deg = ((Math.round(v / 10) * 10) % 360 + 360) % 360;
          return String(deg);
        }
      }], [{
        length: h * 0.009
      }]]
    });
    ctx.font = prevFont;
    ctx.restore();

    // Center caret / inverted V marker.
    const cx = w / 2;
    const topY = bandY + bandH - h * 0.043;
    const halfW = w * 0.012;
    const height = h * 0.016;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = Math.max(1.2, w * 0.0026);
    ctx.beginPath();
    ctx.moveTo(cx - halfW, topY);
    ctx.lineTo(cx, topY - height);
    ctx.lineTo(cx + halfW, topY);
    ctx.stroke();

    // Bearing diamond marker in heading tape.
    if (navUnit != null && Number.isFinite(navUnit?.bearing)) {
      const bearingDeltaDeg = helperModule?.angleDiffDeg?.(navUnit.bearing, hdg) ?? 0;
      const pxPerDeg = (w * 0.0105) / 5;
      const diamondX = cx + bearingDeltaDeg * pxPerDeg;
      const bandLeft = bandX;
      const bandRight = bandX + bandW;

      if (diamondX >= bandLeft && diamondX <= bandRight) {
        const diamondTopY = topY - height;
        const diamondHalfW = w * 0.007;
        const diamondHalfH = h * 0.010;

        ctx.fillStyle = this.DEFAULT_COLOR;
        ctx.beginPath();
        ctx.moveTo(diamondX, diamondTopY);
        ctx.lineTo(diamondX + diamondHalfW, diamondTopY + diamondHalfH);
        ctx.lineTo(diamondX, diamondTopY + diamondHalfH * 2);
        ctx.lineTo(diamondX - diamondHalfW, diamondTopY + diamondHalfH);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  
    }

    static drawIlsDeviationCues(ctx, fpvDrawn, helperModule, w, h) {
    const navUnit = window.geofs?.nav?.currentNAVUnit;
    if (!navUnit || !fpvDrawn) return;

    const navDirection = window.geofs?.animation?.getValue?.('NAVDirection')
      ?? window.geofs?.animation?.values?.NAVDirection
      ?? navUnit?.NAVDirection;

    const outOfRange = navUnit?.inRange === false;
    const isFrom = navUnit === 'from' || navDirection === 'from';

    if (outOfRange || isFrom) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.DEFAULT_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${Math.round(h * 0.033)}px monospace`;
      ctx.fillText(outOfRange ? 'OUT OF RANGE' : 'FROM', fpvDrawn.x, fpvDrawn.y + h * 0.032);
      ctx.restore();
      return;
    }

    const getValue = window.geofs?.animation?.getValue?.bind(window.geofs?.animation);
    const navCourseDeviation = getValue
      ? (getValue('NAVCourseDeviation') ?? 0)
      : (window.geofs?.animation?.values?.NAVCourseDeviation ?? 0);
    const navGlideDeviation = getValue
      ? (getValue('NAVGlideAngleDeviation') ?? 0)
      : (window.geofs?.animation?.values?.NAVGlideAngleDeviation ?? 0);

    // Scale originele HUD offsets naar huidige canvasafmetingen.
    const courseOffsetPx = (helperModule?.clampValue?.(10 * navCourseDeviation, -75, 75) ?? 0) * (w / 512);
    const glideOffsetPx = (helperModule?.clampValue?.(-10 * navGlideDeviation, -75, 75) ?? 0) * (h / 512);

    const fpvX = fpvDrawn.x;
    const fpvY = fpvDrawn.y;
    const hLen = w * 0.055;
    const vLen = h * 0.055;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);

    // Glide slope: horizontale streep (alleen bij VNAV-capable).
    if (navUnit?.VNAVCapable) {
      const glideY = fpvY + glideOffsetPx;
      ctx.beginPath();
      // Horizontaal gecentreerd op FPV, alleen verticale offset.
      ctx.moveTo(fpvX - hLen, glideY);
      ctx.lineTo(fpvX + hLen, glideY);
      ctx.stroke();
    }

    // Course deviation: verticale streep (alleen bij LNAV-capable).
    if (navUnit?.LNAVCapable) {
      const courseX = fpvX + courseOffsetPx;
      ctx.beginPath();
      // Verticaal gecentreerd op FPV, alleen horizontale offset.
      ctx.moveTo(courseX, fpvY - vLen);
      ctx.lineTo(courseX, fpvY + vLen);
      ctx.stroke();
    }

    ctx.restore();
  
    }

    static drawGearAndFlapIndicators(ctx, w, h, lineColor, options = {}) {
    const target = String(options?.target ?? 'hud').toLowerCase();
    const isMfd = target === 'mfd';

    const gearRaw = Number(window.controls?.gear?.position);
    const gearPos = Number.isFinite(gearRaw) ? gearRaw : 1;

    const flapsPosRaw = Number(window.controls?.flaps?.position);
    const flapsPos = Number.isFinite(flapsPosRaw) ? flapsPosRaw : 0;
    const flapsMaxRaw = Number(window.controls?.flaps?.maxPosition);
    const flapsMax = Number.isFinite(flapsMaxRaw) && flapsMaxRaw > 0 ? flapsMaxRaw : 1;
    const flapsNorm = Math.max(0, Math.min(1, flapsPos / flapsMax));

    const hookRaw = Number(window.controls?.accessories?.position);
    const hookPos = Number.isFinite(hookRaw) ? Math.max(0, Math.min(1, hookRaw)) : 0;

    const top = isMfd ? h * 0.27 : h * 0.02;

    // Keep the 3 indicators centered, but make the total footprint narrower.
    const clusterCenterX = w * 0.5;
    const clusterW = isMfd ? w * 0.58 : w * 0.50;
    const gapGearToFlap = clusterW * (isMfd ? 0.07 : 0.06);
    const gapFlapToHook = clusterW * (isMfd ? 0.045 : 0.035); // hook closer to flap
    const blockW = (clusterW - gapGearToFlap - gapFlapToHook) / 3;
    const left = clusterCenterX - (clusterW * 0.5);

    const indicatorTopY = top;
    const indicatorBottomY = top + (isMfd ? h * 0.12 : h * 0.14);
    const textY = top + (isMfd ? h * 0.17 : h * 0.19);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = Math.max(1.5, w * 0.0025);
    ctx.setLineDash([]);

    const flapsLineWidth = isMfd ? 5 : 3;
    const hookLineWidth = isMfd ? 5 : 3;
    const dotRadius = isMfd ? 2.5 : Math.max(1.5, w * 0.0028);

    // --- GEAR indicator (3 boxes) ---
    const gearX = left;
    const boxW = blockW * (isMfd ? 0.13 : 0.11);
    const boxH = h * (isMfd ? 0.042 : 0.10);
    const topBoxX = gearX + blockW * 0.445;
    const topBoxY = indicatorTopY - (isMfd ? boxH * 0.80 : 0);
    const leftBoxX = gearX + blockW * 0.20;
    const leftBoxY = indicatorBottomY - boxH;
    const rightBoxX = gearX + blockW * 0.70;
    const rightBoxY = indicatorBottomY - boxH;

    const isGearDown = gearPos <= 0;
    const isGearUp = gearPos >= 1;
    const isGearTrans = !isGearDown && !isGearUp;
    const gearFill = isGearDown ? '#00ff00' : isGearTrans ? '#ff8a24' : null;

    const drawGearBox = (x, y) => {
      ctx.strokeRect(x, y, boxW, boxH);
      if (gearFill) {
        ctx.fillStyle = gearFill;
        ctx.fillRect(x + 1, y + 1, Math.max(0, boxW - 2), Math.max(0, boxH - 2));
        ctx.fillStyle = lineColor;
      }
    };

    drawGearBox(topBoxX, topBoxY);
    drawGearBox(leftBoxX, leftBoxY);
    drawGearBox(rightBoxX, rightBoxY);

    let gearStatus = 'GEAR UP';
    if (isGearDown) gearStatus = 'GEAR DOWN';
    else if (isGearTrans) gearStatus = 'GEAR TRANS';

    // --- FLAP indicator ---
    const flapX = gearX + blockW + gapGearToFlap;
    const flapWingY = top + (isMfd ? h * 0.03 : h * 0.045);
    const wingStartX = flapX + blockW * 0.08;
    const wingEndX = flapX + blockW * 0.62;
    const flapHingeX = wingEndX;
    const slatHingeX = wingStartX;
    const segmentLen = blockW * (isMfd ? 0.40 : 0.22);

    const flapMaxDeg = 45;
    const flapDeg = flapMaxDeg * flapsNorm;
    const flapRad = flapDeg * Math.PI / 180;
    const slatNorm = Math.max(0, Math.min(1, flapsPos));
    const slatMaxDeg = 30;

    // wing baseline
    const previousLineWidth = ctx.lineWidth;
    ctx.lineWidth = flapsLineWidth;
    ctx.beginPath();
    ctx.moveTo(wingStartX, flapWingY);
    ctx.lineTo(wingEndX, flapWingY);
    ctx.stroke();

    // slat line: continuous exact angle; position 1 is max deflection
    const slatDeg = slatMaxDeg * slatNorm;
    const slatRad = slatDeg * Math.PI / 180;
    const slatEndX = slatHingeX - Math.cos(slatRad) * (segmentLen * 0.55);
    const slatEndY = flapWingY + Math.sin(slatRad) * (segmentLen * 0.55);
    ctx.beginPath();
    ctx.moveTo(slatHingeX, flapWingY);
    ctx.lineTo(slatEndX, slatEndY);
    ctx.stroke();

    // flap line (continuous exact angle)
    const flapEndX = flapHingeX + Math.cos(flapRad) * segmentLen;
    const flapEndY = flapWingY + Math.sin(flapRad) * segmentLen;
    ctx.beginPath();
    ctx.moveTo(flapHingeX, flapWingY);
    ctx.lineTo(flapEndX, flapEndY);
    ctx.stroke();
    ctx.lineWidth = previousLineWidth;

    // detent dots: 0..maxPosition
    const detentCount = Math.max(1, Math.round(flapsMax));
    for (let i = 0; i <= detentCount; i++) {
      const t = i / detentCount;
      const a = (flapMaxDeg * t) * Math.PI / 180;
      const dx = Math.cos(a) * segmentLen;
      const dy = Math.sin(a) * segmentLen;
      const dotX = flapHingeX + dx;
      const dotY = flapWingY + dy;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    let flapStatus = 'FLAPS UP';
    if (flapsPos >= flapsMax) {
      flapStatus = 'FLAPS DOWN';
    } else if (flapsPos > 0) {
      const nearest = Math.max(1, Math.min(detentCount - 1, Math.round(flapsPos)));
      flapStatus = `FLAPS ${nearest} / ${detentCount}`;
    }

    // --- HOOK indicator ---
    const hookX = flapX + blockW + gapFlapToHook;
    const hookWingY = flapWingY;
    const hookHingeX = hookX + blockW * 0.38;
    const hookLen = blockW * (isMfd ? 0.36 : 0.24);
    const hookRad = (45 * hookPos) * Math.PI / 180;

    const hookUpX = hookHingeX + hookLen;
    const hookUpY = hookWingY;
    const hookDownX = hookHingeX + Math.cos(Math.PI / 4) * hookLen;
    const hookDownY = hookWingY + Math.sin(Math.PI / 4) * hookLen;

    ctx.lineWidth = hookLineWidth;
    const hookEndX = hookHingeX + Math.cos(hookRad) * hookLen;
    const hookEndY = hookWingY + Math.sin(hookRad) * hookLen;
    ctx.beginPath();
    ctx.moveTo(hookHingeX, hookWingY);
    ctx.lineTo(hookEndX, hookEndY);
    ctx.stroke();
    ctx.lineWidth = previousLineWidth;

    ctx.beginPath();
    ctx.arc(hookUpX, hookUpY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hookDownX, hookDownY, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    let hookStatus = 'HOOK UP';
    if (hookPos >= 1) {
      hookStatus = 'HOOK DOWN';
    } else if (hookPos > 0) {
      hookStatus = 'HOOK MOV';
    }

    // status labels on equal baseline
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * (isMfd ? 0.036 : 0.048))}px monospace`;

    const gearCenterX = gearX + blockW * 0.5;
    const flapCenterX = flapX + blockW * 0.5;
    const hookCenterX = hookX + blockW * 0.5;

    ctx.fillStyle = isGearTrans ? '#ff8a24' : lineColor;
    ctx.fillText(gearStatus, gearCenterX, textY);

    ctx.fillStyle = lineColor;
    ctx.fillText(flapStatus, flapCenterX, textY);
    ctx.fillText(hookStatus, hookCenterX, textY);

    ctx.restore();
  
    }

    renderF18Hud(renderer) {
      const o = renderer.canvasAPI.context;
      const canvas = renderer.canvasAPI.canvas ?? o.canvas;
      const w = canvas?.width || 512;
      const h = canvas?.height || 512;

      const ac = window.geofs?.aircraft?.instance;
      const anim = window.geofs?.animation?.values ?? {};
      const camera = window.geofs?.api?.viewer?.camera;

      const kias = window.exponentialSmoothing
        ? window.exponentialSmoothing('smoothKias', anim.kias ?? 0, 0.1)
        : (anim.kias ?? 0);
      const alt = anim.altitude ?? 0;
      const hdg = anim.heading360 ?? anim.heading ?? 0;
      const aoa = anim.aoa ?? 0;
      const mach = Math.round(((window.geofs?.animation?.values?.mach ?? 0) * 100)) / 100;
      const vsi = Math.round((window.geofs?.animation?.values?.climbrate ?? 0) / 10) * 10;
      const radioAlt = window.geofs?.animation?.values?.haglFeet ?? 0;
      const trimScaled = Math.round((window.geofs?.animation?.values?.trim ?? 0) * 100);
      const trimDisplay = trimScaled === 0 ? 'T T/O' : `T ${trimScaled}`;
      const currentG = Number.isFinite(anim.loadFactor) ? anim.loadFactor : 1;
      const navUnit = window.geofs?.nav?.currentNAVUnit ?? null;
      const autopilot = window.geofs?.autopilot ?? null;
      const wpnMaster = this.getOption('WPN', 'MASTER', 'OFF');
      const wpnMode = this.getWpnModeFromOptions();
      const wpnModeLoadout = this.getWpnModeLoadout(wpnMode);
      const wpnHudStatus = wpnMaster !== 'OFF'
        ? {
            line1: `${wpnMaster === 'SIM' ? 'SIM' : 'ARM'} ${wpnMode}`,
            line2: this.getSelectedWpnQuantityLine(wpnMode, wpnModeLoadout)
          }
        : null;
      const hudBaseColor = this.getOptionValue('HUD', 'COLOR', F18HudModule.DEFAULT_COLOR);
      const hudColor = this.applyBrightnessToHexColor(hudBaseColor, this.getMfdBrightnessFactor());
      const hudLevel = this.getOption('HUD', 'LEVEL', 'FULL');
      F18HudModule.DEFAULT_COLOR = hudColor;

      this.updateWpnRearmState();

      if (currentG > this.maxG) {
        this.maxG = currentG;
      }

      const helperModule = this.dependencies.helperModule;
      const navModule = this.getNavModule();

      // Canvas leeg maken met echte transparantie (voorkomt volle groene plaat).
      o.save();
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, w, h);
      o.restore();

      // Achtergrond overlay (GeoFS origineel gebruikt e.images.background; hier weglaten
      // want we willen een glazen HUD zonder achtergrond-sprite).

      o.fillStyle = hudColor;
      o.strokeStyle = hudColor;
      o.lineWidth = 2;
      o.font = `20px sans-serif`;

      // --- Kompasband bovenaan ---
      if (hudLevel == 'FULL') {
        F18HudModule.drawTopHeadingScale(o, renderer, hdg, navUnit, helperModule, w, h);
      }

      // --- Speed + Altitude boxed readouts (meer naar binnen) ---
      F18HudModule.drawSpeedBox(o, kias, w, h);
      F18HudModule.drawAltitudeBox(o, alt, w, h);

      // --- Readouts links/rechts rond de boxes ---
      if (hudLevel !== 'MIN') {
          F18HudModule.drawLeftReadouts(o, mach, currentG, aoa, this.maxG, autopilot, w, h);
        F18HudModule.drawRightReadouts(o, vsi, radioAlt, trimDisplay, navUnit, navModule, w, h, wpnHudStatus);
      }

      // --- Attitude-symbologie (pitch ladder, boresight, FPV, AoA) ---
      if (camera && ac?.htr) {
        const cx = w / 2;
        const cy = h / 2;
        const pitchDeg = -(ac.htr[1] || 0);

        const { pixelsPerDeg, pixelsPerDegX, cameraOffsetPx } = this.computeHudGeometry(w, h, camera);

        this.updateFpvState(ac.llaLocation, ac);
        
        // 1. Bereken nu EERST de schermpositie van de FPV
        const fpvPos = this.computeFpvScreenPosition(camera, cx, cy, pixelsPerDeg, pixelsPerDegX, cameraOffsetPx);

        if (hudLevel == 'FULL') {
          F18HudModule.drawBoresight(o, cx, cy, cameraOffsetPx, w, h);
        }
        
        // 2. Geef de FPV-state en positie mee aan de pitch ladder
        F18HudModule.drawPitchLadder(o, camera, pitchDeg, this.fpvState, fpvPos, cx, cy, cy - cameraOffsetPx, pixelsPerDeg, w, h);

        // 3. Teken de FPV zelf en de daaraan gekoppelde symbolen
        const fpvDrawn = F18HudModule.drawFpv(o, fpvPos, cx, cy, w, h);
        if (hudLevel !== 'MIN') {
          F18HudModule.drawIlsDeviationCues(o, fpvDrawn, helperModule, w, h);
        }
        const isGearDown = window.controls?.gear?.position < 0.5;
        F18HudModule.drawAoaBracket(o, fpvDrawn, cx, cy, pixelsPerDeg, w, h, aoa, isGearDown);
      }

      if (this.isWpnFireFlashVisible()) {
        o.save();
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.fillStyle = F18HudModule.DEFAULT_COLOR;
        o.textAlign = 'center';
        o.textBaseline = 'middle';
        o.font = `${Math.round(h * 0.15)}px monospace`;
        o.fillText(this.getWpnActionFlashLabel(), w * 0.5, h * 0.52);
        o.restore();
      }

      const communicationModule = this.getCommunicationModule();
      const commHudText = communicationModule?.getHudOverlayText?.();
      if (commHudText) {
        o.save();
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.fillStyle = F18HudModule.DEFAULT_COLOR;
        o.textAlign = 'center';
        o.textBaseline = 'bottom';
        o.font = `bold ${Math.round(h * 0.038)}px monospace`;
        const lines = String(commHudText ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
        const lineHeight = h * 0.045;
        const startY = h * 0.96 - ((lines.length - 1) * lineHeight);
        for (let i = 0; i < lines.length; i++) {
          o.fillText(lines[i], w * 0.5, startY + i * lineHeight);
        }
        o.restore();
      }
    }
  }
