/**
 * F18HudMath
 * ============================================================================
 * Zuivere, van canvas/DOM losgekoppelde 3D-wiskunde voor een fysiek correcte,
 * gecollimeerde F/A-18 HUD.
 *
 * HET PROBLEEM (parallax op een schuin stuk HUD-glas)
 * ----------------------------------------------------------------------------
 * De HUD-symbologie (FPV, artificial horizon, pitch ladder) wordt in dit
 * project getekend op een <canvas>-textuur die vervolgens door de 3D-engine
 * op een fysiek vlak (het HUD-glas) in de cockpit wordt geplakt. Dat glas
 * staat NIET haaks op de piloot: de bovenkant staat dichter bij de piloot dan
 * de onderkant (een schuin, "gekanteld" vlak, net als een echte HUD-combiner).
 *
 * Een echte HUD is optisch gecollimeerd: het beeld op het glas lijkt op
 * oneindige afstand te staan. Dat betekent dat de KIJKRICHTING van de piloot
 * (rondkijken, omhoog/omlaag/links/rechts) de positie van de symbolen op het
 * glas niet mag veranderen. Wat WEL van invloed is, is een verplaatsing van
 * het oogpunt zelf (het hoofd naar links/rechts/omhoog/omlaag/naar-voren
 * bewegen): omdat het glas dichtbij is en het "doel" (de richting naar de FPV)
 * oneindig ver weg is, verschuift de plek op het glas waar je door moet kijken
 * om diezelfde richting te zien - dat is klassieke parallax.
 *
 * DE OPLOSSING
 * ----------------------------------------------------------------------------
 * 1. Elke symboolrichting (FPV, horizon, pitch-ladder-sport) wordt berekend
 *    als een richting in de ware wereld (East-North-Up), volledig onafhankelijk
 *    van de camera: de FPV-richting volgt puur uit de vlieggegevens (track,
 *    climbAngle), en elke pitch-ladder-sport is per definitie een "aarde-
 *    horizontale" richting (elevatie = vaste waarde, bijv. 5,10,15 graden),
 *    ongeacht de houding van het vliegtuig. Dat garandeert dat de horizon en
 *    de ladder ALTIJD synchroon lopen met de echte, ware horizon.
 * 2. Die wereldrichting wordt omgezet naar het vliegtuig-lichaamsassenstelsel
 *    (rechts/voor/boven, vastgezet aan de romp) via de actuele koers, pitch en
 *    slaghoek (roll/bank) van het vliegtuig. Dit is de enige stap waar de
 *    houding van het toestel in de berekening komt, en dit is precies wat de
 *    pitch ladder en de FPV mee laat "rollen" met een bankende bocht, terwijl
 *    ze onderling relatief gepositioneerd blijven (de ladder blijft om de FPV
 *    heen roteren, zoals gevraagd).
 * 3. Vanuit het (eventueel door hoofdbeweging verschoven) oogpunt wordt een
 *    lichtstraal in die lichaamsrichting getekend en met het fysieke,
 *    gekantelde HUD-glasvlak gesneden (rechte-vlak-snijding). Dat
 *    snijpunt - uitgedrukt in glaslokale meters - is de plek waar het symbool
 *    op de HUD-textuur moet komen. Omdat dit een centrale (perspectivische)
 *    projectie is van rechte 3D-lijnen door één vast oogpunt, blijven rechte
 *    lijnen in de wereld (zoals een pitch-ladder-sport) altijd rechte lijnen
 *    op het glas - een kernstelling uit de projectieve meetkunde.
 *
 * Omdat kijkrichting (rondkijken) hier bewust NERGENS in de berekening
 * voorkomt, en alleen de oogpositie (hoofdverplaatsing) meetelt, is exact
 * voldaan aan de eis: rondkijken verandert de positie van FPV/horizon op de
 * HUD niet; alleen het echte oogpunt verplaatsen (parallax) doet dat.
 *
 * Definitie-check: als climbAngle = 0 (de FPV staat op de 0°-elevatielijn,
 * d.w.z. de artificial horizon), dan is de verticale snelheid per definitie 0.
 * Dat volgt direct uit stap 1 hierboven: de artificial horizon IS de sport bij
 * elevatie 0, en de FPV staat per definitie bij elevatie = climbAngle.
 */
class F18HudMath {
    static DEG_TO_RAD = Math.PI / 180;

    static degToRad(deg) {
        return deg * F18HudMath.DEG_TO_RAD;
    }

    // Wereld (East-North-Up) eenheidsvector voor een gegeven kompaskoers (azimuth)
    // en elevatiehoek (graden boven de ware horizon).
    static enuFromAzEl(azDeg, elDeg) {
        const az = F18HudMath.degToRad(azDeg);
        const el = F18HudMath.degToRad(elDeg);
        const cosEl = Math.cos(el);
        return {
            e: Math.sin(az) * cosEl,
            n: Math.cos(az) * cosEl,
            u: Math.sin(el)
        };
    }

    // Horizontale eenheidsvector die 90° rechtsom (naar rechts) van azDeg ligt.
    static horizontalRight(azDeg) {
        const az = F18HudMath.degToRad(azDeg);
        return { e: Math.cos(az), n: -Math.sin(az), u: 0 };
    }

    static normalizeEnu(v) {
        const len = Math.hypot(v.e, v.n, v.u) || 1;
        return { e: v.e / len, n: v.n / len, u: v.u / len };
    }

    /**
     * Richting van een punt op een "aarde-horizontale" pitch-ladder-sport: vaste
     * ware elevatie (elDeg), gecentreerd op azDeg (de FPV-koers), met een
     * laterale zwaai (lateralDeg) via een tangens (gnomonische projectie).
     *
     * Omdat dit de centrale projectie is van een echte rechte 3D-lijn (voor elke
     * lateralDeg ligt het punt center + tan(lateralDeg) * right op één rechte
     * lijn), blijft de sport na projectie op het HUD-glas altijd een rechte
     * lijn - ook als het glas schuin staat en ook als het toestel bankt.
     */
    static rungDirection(azDeg, elDeg, lateralDeg) {
        const center = F18HudMath.enuFromAzEl(azDeg, elDeg);
        if (!lateralDeg) {
            return center;
        }
        const right = F18HudMath.horizontalRight(azDeg);
        const t = Math.tan(F18HudMath.degToRad(lateralDeg));
        return F18HudMath.normalizeEnu({
            e: center.e + right.e * t,
            n: center.n + right.n * t,
            u: center.u + right.u * t
        });
    }

    /**
     * Bouwt de lichaamsassen (rechts/voor/boven), uitgedrukt in wereld-ENU
     * coördinaten, voor de huidige vliegtuighouding. Dit gebruikt dezelfde
     * assen-conventie als geofs.camera.modes[*].position: X=rechts, Y=voor,
     * Z=boven.
     *
     * headingDeg: kompaskoers van de neus (0=N, 90=O)
     * pitchDeg:   neus-omhoog-hoek (positief = klimmende houding)
     * rollDeg:    slaghoek/bank (positief = rechtervleugel omlaag)
     */
    static bodyBasis(headingDeg, pitchDeg, rollDeg) {
        const h = F18HudMath.degToRad(headingDeg);
        const p = F18HudMath.degToRad(pitchDeg);
        const r = F18HudMath.degToRad(rollDeg);

        // 1. Gieren (yaw) om de ware "boven"-as.
        const forward0 = { e: Math.sin(h), n: Math.cos(h), u: 0 };
        const right0 = { e: Math.cos(h), n: -Math.sin(h), u: 0 };
        const up0 = { e: 0, n: 0, u: 1 };

        // 2. Stampen (pitch) om de (inmiddels gegierde) rechts-as.
        const forward1 = {
            e: Math.cos(p) * forward0.e + Math.sin(p) * up0.e,
            n: Math.cos(p) * forward0.n + Math.sin(p) * up0.n,
            u: Math.cos(p) * forward0.u + Math.sin(p) * up0.u
        };
        const up1 = {
            e: -Math.sin(p) * forward0.e + Math.cos(p) * up0.e,
            n: -Math.sin(p) * forward0.n + Math.cos(p) * up0.n,
            u: -Math.sin(p) * forward0.u + Math.cos(p) * up0.u
        };

        // 3. Slaan/rollen (roll) om de (inmiddels gestampte) voor-as. Positieve
        // roll = rechtervleugel omlaag: de rechts-as roteert naar "beneden".
        const right2 = {
            e: Math.cos(r) * right0.e - Math.sin(r) * up1.e,
            n: Math.cos(r) * right0.n - Math.sin(r) * up1.n,
            u: Math.cos(r) * right0.u - Math.sin(r) * up1.u
        };
        const up2 = {
            e: Math.sin(r) * right0.e + Math.cos(r) * up1.e,
            n: Math.sin(r) * right0.n + Math.cos(r) * up1.n,
            u: Math.sin(r) * right0.u + Math.cos(r) * up1.u
        };

        return { right: right2, forward: forward1, up: up2 };
    }

    static dotEnu(a, b) {
        return a.e * b.e + a.n * b.n + a.u * b.u;
    }

    // Drukt een wereld-ENU eenheidsvector uit in het lichaamsassenstelsel
    // (x=rechts, y=voor, z=boven) via projectie op de lichaamsassen.
    static worldToBody(vecEnu, basis) {
        return {
            x: F18HudMath.dotEnu(vecEnu, basis.right),
            y: F18HudMath.dotEnu(vecEnu, basis.forward),
            z: F18HudMath.dotEnu(vecEnu, basis.up)
        };
    }

    static crossBody(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    /**
     * Bouwt het fysieke HUD-glasvlak-model, uitgedrukt in meters t.o.v. het
     * NEUTRALE oogpunt (d.w.z. het oogpunt bij offsets.current = [0,0,0]).
     *
     * distanceM:       afstand van het neutrale oog tot het midden van het glas
     * verticalOffsetM: fijnafstemming van de hoogte van het glasmidden
     * tiltDeg:         kanteling van het glas: de bovenkant staat dichter bij de
     *                   piloot dan de onderkant (zoals gevraagd)
     * halfWidthM/halfHeightM: halve fysieke afmetingen van het combiner-glas
     */
    static buildGlass({ distanceM, verticalOffsetM, tiltDeg, halfWidthM, halfHeightM }) {
        const tilt = F18HudMath.degToRad(tiltDeg);
        const center = { x: 0, y: distanceM, z: verticalOffsetM };
        const right = { x: 1, y: 0, z: 0 };
        // Naar "boven" op het glas bewegen brengt je dichter bij de piloot
        // (kleinere y) terwijl je hoger komt (grotere z) - exact de gevraagde
        // kanteling (boven dichterbij dan onder).
        const up = { x: 0, y: -Math.sin(tilt), z: Math.cos(tilt) };
        const normal = F18HudMath.crossBody(right, up);
        const len = Math.hypot(normal.x, normal.y, normal.z) || 1;
        normal.x /= len; normal.y /= len; normal.z /= len;
        return { center, right, up, normal, halfWidth: halfWidthM, halfHeight: halfHeightM };
    }

    /**
     * De kernberekening: snijdt een lichtstraal vanuit het (verplaatste) oog,
     * in lichaamsrichting dirBody, met het fysieke HUD-glasvlak. Retourneert
     * de glaslokale coördinaten in METERS langs glass.right/glass.up, of null
     * als de straal het glas niet kan bereiken (evenwijdig eraan, of het doel
     * ligt achter het oog).
     *
     * eye:     {x,y,z} oogpositie in meters, in dezelfde ruimte als `glass`
     *          (dus als offset t.o.v. het neutrale oogpunt)
     * dirBody: {x,y,z} eenheidsrichting, al uitgedrukt in het lichaamsassenstelsel
     */
    static projectBodyDirToGlass(eye, dirBody, glass) {
        const denom = dirBody.x * glass.normal.x + dirBody.y * glass.normal.y + dirBody.z * glass.normal.z;
        if (Math.abs(denom) < 1e-6) {
            return null; // Richting loopt evenwijdig aan het glas.
        }

        const toCenterX = glass.center.x - eye.x;
        const toCenterY = glass.center.y - eye.y;
        const toCenterZ = glass.center.z - eye.z;
        const numer = toCenterX * glass.normal.x + toCenterY * glass.normal.y + toCenterZ * glass.normal.z;
        const t = numer / denom;
        if (t <= 0) {
            return null; // Doelrichting ligt achter het oogpunt.
        }

        const px = eye.x + t * dirBody.x - glass.center.x;
        const py = eye.y + t * dirBody.y - glass.center.y;
        const pz = eye.z + t * dirBody.z - glass.center.z;

        return {
            x: px * glass.right.x + py * glass.right.y + pz * glass.right.z,
            y: px * glass.up.x + py * glass.up.y + pz * glass.up.z
        };
    }

    // Combineert de wereld-richtingsberekening (azimuth/elevatie, evt. langs een
    // ladder-sport) met de lichaamstransformatie en de glas-projectie.
    static projectWorldAzElToGlass(basis, eye, glass, azDeg, elDeg, lateralDeg = 0) {
        const dirWorld = F18HudMath.rungDirection(azDeg, elDeg, lateralDeg);
        const dirBody = F18HudMath.worldToBody(dirWorld, basis);
        return F18HudMath.projectBodyDirToGlass(eye, dirBody, glass);
    }
}

class F18HudModule {
    // --- Fysiek HUD-glasmodel (kalibratie-constanten) ---------------------
    // Afstand (meter) van het neutrale oogpunt tot het midden van het HUD-glas.
    static HUD_GLASS_DISTANCE_M = 0.92;
    // Fijnafstemming (meter) van de hoogte van het glasmidden t.o.v. het oog.
    // Positiever => hele symbologie zakt op het glas; negatiever => stijgt.
    static HUD_GLASS_VERTICAL_OFFSET_M = 0;
    // Kanteling van het glas: de bovenkant staat dichter bij de piloot dan de
    // onderkant (zoals bij een echte HUD-combiner).
    static HUD_GLASS_TILT_DEG = 10;
    // Halve fysieke afmetingen van het combiner-glas, in meter.
    static HUD_GLASS_HALF_WIDTH_M = 0.15;
    static HUD_GLASS_HALF_HEIGHT_M = 0.17;
    // Welk deel van de halve canvashoogte de halve glashoogte mag innemen.
    static HUD_CANVAS_FILL = 0.85;
    // Zet op -1 als een rechterbank de ladder de verkeerde kant op laat draaien.
    static ROLL_SIGN = 1;

    static DEFAULT_COLOR = '#00ff00';

    // Prepares HUD module state and renderer references.
    constructor(dependencies = {}) {
      this.dependencies = {
        optionModule: dependencies.optionModule ?? OptionModule,
        helperModule: dependencies.helperModule ?? HelperModule,
        cameraModule: dependencies.cameraModule ?? CameraModule,
        mfdModule: dependencies.mfdModule ?? MfdModule,
        getAddon: dependencies.getAddon ?? (() => window.BasePlugin?.getActiveAddon?.() ?? null)
      };
      // Optionele overrides voor de HUD_GLASS_* kalibratieconstanten hierboven.
      this.config = (dependencies.config && typeof dependencies.config === 'object') ? dependencies.config : {};
      this.originalRenderer = null;
      this.installed = false;
      // Wereld-azimuth/elevatie van de flight path vector (waar het toestel
      // daadwerkelijk naartoe vliegt), volledig camera-onafhankelijk.
      this.fpvAngles = { azDeg: 0, elDeg: 0, valid: false };
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

    /**
     * Actuele houding van het vliegtuig (koers/pitch/roll, in graden), gebruikt
     * om wereld-referentierichtingen (FPV, ladder) om te zetten naar het
     * lichaamsassenstelsel waarin het HUD-glas vastzit. ac.htr wordt per frame
     * bijgewerkt en is minder gevoelig voor smoothing-vertraging dan de
     * animatiewaarden, en wordt daarom als primaire bron gebruikt (net als
     * voorheen al gebeurde voor de pitch-uitlezing).
     */
    getAircraftAttitude() {
      const ac = window.geofs?.aircraft?.instance;
      const anim = window.geofs?.animation?.values;
      const htr = ac?.htr;

      const headingDeg = htr?.[0] ?? anim?.heading360 ?? anim?.heading ?? 0;
      const pitchDeg = Number.isFinite(htr?.[1]) ? -htr[1] : (anim?.pitch ?? 0);
      const rollDeg = F18HudModule.ROLL_SIGN * (anim?.roll ?? htr?.[2] ?? 0);

      return { headingDeg, pitchDeg, rollDeg };
    }

    /**
     * Oogpositie (in meter) t.o.v. het neutrale, ontwerp-oogpunt van de cockpit.
     * Dit is precies de hoofdverplaatsing (leunen/kijkstoel omhoog-omlaag) die
     * échte parallax veroorzaakt op een dichtbij glas. Kijkrichting (rondkijken)
     * zit hier bewust NIET in: die verandert alleen waar de al-berekende
     * glaspositie op het scherm terechtkomt (normale 3D-rendering), niet de
     * inhoud van de HUD-textuur zelf.
     */
    getEyeOffsetMeters() {
      const offset = window.geofs?.camera?.modes?.[1]?.offsets?.current;
      if (Array.isArray(offset) && offset.length >= 3) {
        return { x: offset[0] || 0, y: offset[1] || 0, z: offset[2] || 0 };
      }
      return { x: 0, y: 0, z: 0 };
    }

    // Bouwt het fysieke HUD-glasmodel (zie F18HudMath.buildGlass), met optionele
    // overrides via this.config voor kalibratie in-game.
    getGlassModel() {
      return F18HudMath.buildGlass({
        distanceM: this.config.hudGlassDistanceM ?? F18HudModule.HUD_GLASS_DISTANCE_M,
        verticalOffsetM: this.config.hudGlassVerticalOffsetM ?? F18HudModule.HUD_GLASS_VERTICAL_OFFSET_M,
        tiltDeg: this.config.hudGlassTiltDeg ?? F18HudModule.HUD_GLASS_TILT_DEG,
        halfWidthM: this.config.hudGlassHalfWidthM ?? F18HudModule.HUD_GLASS_HALF_WIDTH_M,
        halfHeightM: this.config.hudGlassHalfHeightM ?? F18HudModule.HUD_GLASS_HALF_HEIGHT_M
      });
    }

    // Aantal canvaspixels per glas-meter. Eén schaalfactor voor x én y houdt
    // cirkelvormige symbolen (zoals de FPV-bol) rond in plaats van vervormd.
    getPixelsPerMeter(h) {
      const halfHeightM = this.config.hudGlassHalfHeightM ?? F18HudModule.HUD_GLASS_HALF_HEIGHT_M;
      const fill = this.config.hudCanvasFill ?? F18HudModule.HUD_CANVAS_FILL;
      return ((h / 2) * fill) / halfHeightM;
    }

    /**
     * Werkt de FPV-richting bij: de ware wereldkoers (track) en klimhoek
     * (climbAngle) van de snelheidsvector - exact waar het toestel naartoe
     * vliegt. Deze twee getallen liggen al in de "aarde-horizontale"
     * referentie die de pitch ladder ook gebruikt, dus FPV en ladder blijven
     * per definitie synchroon (zie F18HudMath doc-comment hierboven).
     */
    updateFpvAngles() {
      const anim = window.geofs?.animation?.values;
      if (!anim) {
        this.fpvAngles = { valid: false, azDeg: 0, elDeg: 0 };
        return;
      }

      // Minimale snelheid: onder ~10 kts is de track te onbetrouwbaar.
      const kias = anim.kias ?? anim.ias ?? 0;
      if (kias < 10) {
        this.fpvAngles = { valid: false, azDeg: 0, elDeg: 0 };
        return;
      }

      const azDeg = anim.track ?? anim.heading360 ?? anim.heading ?? 0;
      const elDeg = anim.climbAngle ?? 0;
      this.fpvAngles = { valid: true, azDeg, elDeg };
    }

    // Projecteert een reeds-berekend glaspunt (in meter, of null) naar canvaspixels.
    static projectToCanvas(glassPoint, pixelsPerMeter, cx, cy) {
      if (!glassPoint) {
        return null;
      }
      return { x: cx + glassPoint.x * pixelsPerMeter, y: cy - glassPoint.y * pixelsPerMeter };
    }

    // Numerieke schatting van "pixels per graad" rond een gegeven wereldrichting,
    // gebruikt voor schaalafhankelijke symbolen (zoals het AoA-haakje) die naast
    // de FPV staan. Bemonstert de echte, niet-lineaire glasprojectie, dus blijft
    // correct ook als het HUD-glas schuin staat.
    static estimatePixelsPerDegree(basis, eye, glass, pixelsPerMeter, azDeg, elDeg) {
      const a = F18HudMath.projectWorldAzElToGlass(basis, eye, glass, azDeg, elDeg - 0.5, 0);
      const b = F18HudMath.projectWorldAzElToGlass(basis, eye, glass, azDeg, elDeg + 0.5, 0);
      if (!a || !b) {
        return pixelsPerMeter * F18HudMath.DEG_TO_RAD * F18HudModule.HUD_GLASS_DISTANCE_M;
      }
      return Math.hypot((b.x - a.x) * pixelsPerMeter, (b.y - a.y) * pixelsPerMeter);
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

    static drawBoresight(ctx, pos, w, h) {
    if (!pos) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);

    const wx = pos.x;
    const wy = pos.y;
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

  /**
   * Tekent de artificial horizon en de pitch ladder door voor elk punt de
   * echte 3D-richting (F18HudMath.projectWorldAzElToGlass) te projecteren op
   * het fysieke, gekantelde HUD-glas. Er wordt hier bewust NIET meer met een
   * losse 2D ctx.rotate(-camera.roll) gewerkt: de rolhoek van het vliegtuig
   * zit al verwerkt in `basis` (zie F18HudMath.bodyBasis), dus zowel de FPV
   * als elke ladder-sport roteren consistent en correct met een bank, terwijl
   * ze onderling om elkaar heen (om de FPV) blijven staan.
   *
   * azDeg/elDeg van elk punt worden uitgedrukt in de WARE (aarde-horizontale)
   * referentie: elevatie 0 = echte horizon/artificial horizon, en de FPV zelf
   * staat (per definitie) op elevatie = climbAngle. Staat climbAngle op 0, dan
   * valt de FPV exact op de artificial horizon - conform de eis dat dat precies
   * overeenkomt met een verticale snelheid van 0.
   */
  static drawPitchLadder(ctx, basis, eye, glass, pixelsPerMeter, fpvAngles, fpvPos, cx, cy, w, h) {
    if (!fpvAngles?.valid || !fpvPos) return; // Zonder geldige FPV-koers is er geen betrouwbare as om de ladder op te centreren.

    const azDeg = fpvAngles.azDeg;
    const project = (elDeg, lateralDeg) => F18HudModule.projectToCanvas(
      F18HudMath.projectWorldAzElToGlass(basis, eye, glass, azDeg, elDeg, lateralDeg),
      pixelsPerMeter, cx, cy
    );

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

    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.5;

    // Artificial horizon: de ware 0°-elevatielijn. Loopt breder door dan de
    // gewone ladder-sporten en is nooit gestippeld.
    const HORIZON_HALF_SPAN_DEG = 16;
    const horizonL = project(0, -HORIZON_HALF_SPAN_DEG);
    const horizonR = project(0, HORIZON_HALF_SPAN_DEG);
    ctx.setLineDash([]);
    if (horizonL && horizonR) {
      ctx.beginPath();
      ctx.moveTo(horizonL.x, horizonL.y);
      ctx.lineTo(horizonR.x, horizonR.y);
      ctx.stroke();
    }

    const TICK_STEP_DEG = 5;
    const TICK_RANGE_DEG = 85;
    const VISIBLE_RANGE_DEG = 45; // Sporten verder dan dit van de FPV worden overgeslagen.
    const SEGMENT_OUTER_DEG = 8;    // Halve laterale lengte van een sport, in graden.
    const SEGMENT_INNER_DEG = 2;    // Laterale opening rondom de FPV-kolom, in graden.
    const END_TICK_DEG = 1.4;       // Lengte van het kleine "naar de horizon toe" streepje aan het uiteinde.
    const LABEL_GAP_DEG = 1.6;      // Extra laterale afstand voor het getal t.o.v. het uiteinde.

    const savedFont = ctx.font;
    const savedAlign = ctx.textAlign;
    const savedBaseline = ctx.textBaseline;
    ctx.font = `${Math.round(h * 0.038)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let deg = TICK_STEP_DEG; deg <= TICK_RANGE_DEG; deg += TICK_STEP_DEG) {
      for (const sign of [-1, 1]) {
        const elDeg = sign * deg;
        if (Math.abs(elDeg - fpvAngles.elDeg) > VISIBLE_RANGE_DEG) continue;

        const isBelow = elDeg < 0;
        const tickDir = isBelow ? -1 : 1; // Uiteinde-streepjes wijzen altijd richting de horizon.

        const outerL = project(elDeg, -SEGMENT_OUTER_DEG);
        const innerL = project(elDeg, -SEGMENT_INNER_DEG);
        const innerR = project(elDeg, SEGMENT_INNER_DEG);
        const outerR = project(elDeg, SEGMENT_OUTER_DEG);
        if (!outerL || !innerL || !innerR || !outerR) continue;

        ctx.setLineDash(isBelow ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(outerL.x, outerL.y);
        ctx.lineTo(innerL.x, innerL.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(innerR.x, innerR.y);
        ctx.lineTo(outerR.x, outerR.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Uiteinde-streepjes: eigen 3D-projectie i.p.v. een platte pixel-nudge,
        // zodat ze correct mee blijven roteren bij een bankende bocht.
        const tickL = project(elDeg + tickDir * END_TICK_DEG, -SEGMENT_OUTER_DEG);
        const tickR = project(elDeg + tickDir * END_TICK_DEG, SEGMENT_OUTER_DEG);
        if (tickL) {
          ctx.beginPath();
          ctx.moveTo(outerL.x, outerL.y);
          ctx.lineTo(tickL.x, tickL.y);
          ctx.stroke();
        }
        if (tickR) {
          ctx.beginPath();
          ctx.moveTo(outerR.x, outerR.y);
          ctx.lineTo(tickR.x, tickR.y);
          ctx.stroke();
        }

        const labelL = project(elDeg, -(SEGMENT_OUTER_DEG + LABEL_GAP_DEG));
        const labelR = project(elDeg, SEGMENT_OUTER_DEG + LABEL_GAP_DEG);
        if (labelL) ctx.fillText(String(deg), labelL.x, labelL.y);
        if (labelR) ctx.fillText(String(deg), labelR.x, labelR.y);
      }
    }

    ctx.font = savedFont;
    ctx.textAlign = savedAlign;
    ctx.textBaseline = savedBaseline;
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Berekent de schermpositie van de FPV door de ware FPV-richting (track,
   * climbAngle - zie updateFpvAngles) via het lichaamsassenstelsel op het
   * fysieke HUD-glas te projecteren. Bij ontbrekende/onbetrouwbare vluchtdata
   * (bijv. te lage snelheid) valt de FPV terug op de boresight, net als een
   * echte HUD die de FPV verbergt/laat samenvallen met de golfstip als er geen
   * bruikbare snelheidsvector is.
   */
  computeFpvScreenPosition(basis, eye, glass, pixelsPerMeter, cx, cy, boresightPos) {
    if (!this.fpvAngles?.valid) {
      return boresightPos ?? { x: cx, y: cy };
    }

    const glassPoint = F18HudMath.projectWorldAzElToGlass(
      basis, eye, glass, this.fpvAngles.azDeg, this.fpvAngles.elDeg, 0
    );
    const projected = F18HudModule.projectToCanvas(glassPoint, pixelsPerMeter, cx, cy);
    return projected ?? boresightPos ?? { x: cx, y: cy };
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
      if (ac?.htr) {
        const cx = w / 2;
        const cy = h / 2;

        // 1. Vliegtuighouding -> lichaamsassenstelsel; oogpositie en fysiek
        // glasmodel; schaal (px/m). Zie F18HudMath voor de volledige afleiding.
        const attitude = this.getAircraftAttitude();
        const basis = F18HudMath.bodyBasis(attitude.headingDeg, attitude.pitchDeg, attitude.rollDeg);
        const eye = this.getEyeOffsetMeters();
        const glass = this.getGlassModel();
        const pixelsPerMeter = this.getPixelsPerMeter(h);

        this.updateFpvAngles();

        // 2. Boresight: vaste lichaamsrichting (recht vooruit), dus geen
        // wereld->lichaam-conversie nodig - direct in lichaamscoördinaten.
        const boresightPos = F18HudModule.projectToCanvas(
          F18HudMath.projectBodyDirToGlass(eye, { x: 0, y: 1, z: 0 }, glass),
          pixelsPerMeter, cx, cy
        );

        // 3. FPV: ware track/climbAngle-richting, via lichaamsassenstelsel.
        const fpvPos = this.computeFpvScreenPosition(basis, eye, glass, pixelsPerMeter, cx, cy, boresightPos);

        if (hudLevel == 'FULL') {
          F18HudModule.drawBoresight(o, boresightPos, w, h);
        }

        // 4. Artificial horizon + pitch ladder: elk punt wordt onafhankelijk
        // via dezelfde 3D-projectie geplaatst, dus horizon/ladder/FPV blijven
        // altijd onderling consistent, ook tijdens rollen/bankende bochten.
        F18HudModule.drawPitchLadder(o, basis, eye, glass, pixelsPerMeter, this.fpvAngles, fpvPos, cx, cy, w, h);

        // 5. Teken de FPV zelf en de daaraan gekoppelde symbolen
        const fpvDrawn = F18HudModule.drawFpv(o, fpvPos, cx, cy, w, h);
        if (hudLevel !== 'MIN') {
          F18HudModule.drawIlsDeviationCues(o, fpvDrawn, helperModule, w, h);
        }
        const isGearDown = window.controls?.gear?.position < 0.5;
        const pixelsPerDeg = this.fpvAngles.valid
          ? F18HudModule.estimatePixelsPerDegree(basis, eye, glass, pixelsPerMeter, this.fpvAngles.azDeg, this.fpvAngles.elDeg)
          : F18HudModule.estimatePixelsPerDegree(basis, eye, glass, pixelsPerMeter, attitude.headingDeg, attitude.pitchDeg);
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
