// ==UserScript==
// @name         GeoFS F-16 Addon
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      2.1.0
// @description  Improves the cockpit with custom MFDs, adjustable seat height and more.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

// Combined required files:
(function () {
  'use strict';

  const CORE_VERSION = '1.0.0';

  class HelperModule {
    // Parses a semantic version string (major.minor.patch).
    static parseSemver(version) {
      const [major, minor, patch] = version.split('.').map(Number);
      return { major, minor, patch };
    }

    // Returns true when version >= minimumVersion.
    static isSemverAtLeast(version, minimumVersion) {
      const a = HelperModule.parseSemver(version);
      const b = HelperModule.parseSemver(minimumVersion);
      if (a.major !== b.major) return a.major > b.major;
      if (a.minor !== b.minor) return a.minor > b.minor;
      return a.patch >= b.patch;
    }
  }

  class AddonRegistryModule {
    constructor() {
      this.plugins = Object.create(null);
    }

    // Registers one aircraft plugin descriptor.
    register(plugin) {
      this.plugins[plugin.id] = plugin;
      return plugin;
    }

    // Returns one registered aircraft plugin descriptor.
    get(id) {
      return this.plugins[id] ?? null;
    }

    // Returns all registered aircraft plugin descriptors.
    list() {
      return Object.values(this.plugins);
    }
  }

  if (window.GeoFSAddonCore) {
    return;
  }

  window.GeoFSAddonCore = {
    version: CORE_VERSION,
    HelperModule,
    registry: new AddonRegistryModule()
  };

  if (!window.addonRuntime) {
    window.addonRuntime = {
      checklistModule: null,
      mapModule: null,
      navModule: null,
      communicationModule: null,
      mfdUiStates: Object.create(null),
      mfdPagesCatalog: null,
      mfdRuntimeRefs: Object.create(null),
      navRdrRuntime: { bootStartMs: 0 },
      mainPlugin: null
    };
  }
})();

var addonRuntime = window.addonRuntime;


  class HelperModule {
    static parseSemver(version) {
      const [major, minor, patch] = version.split('.').map(Number);
      return { major, minor, patch };
    }

    static isSemverAtLeast(version, minimumVersion) {
      const a = HelperModule.parseSemver(version);
      const b = HelperModule.parseSemver(minimumVersion);
      if (a.major !== b.major) return a.major > b.major;
      if (a.minor !== b.minor) return a.minor > b.minor;
      return a.patch >= b.patch;
    }

    static deepCloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    static angleDiffDeg(a, b) {
      let d = a - b;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return d;
    }

    static clampValue(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    static isAircraftParkedAndCold() {
      return window.controls?.gear?.position === 0
        && !window.geofs?.animation?.values?.enginesOn
        && window.geofs?.aircraft?.instance?.groundContact;
    }

    // Creates helper state for runtime UI controls.
    constructor() {
      this.padControls = new Map();
    }

    // Returns normalized screen click coordinates from the GeoFS mouse state.
    static getClickScreenCoords() {
      const mouse = window.controls?.mouse;
      if (!mouse) return null;

      const rawX = mouse.lastX ?? mouse.originalX;
      const rawY = mouse.lastY ?? mouse.originalY;
      const oX = mouse.oX ?? 0;
      const oY = mouse.oY ?? 0;
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;

      return {
        x: rawX - oX,
        y: rawY - oY
      };
    }

    // Returns normalized screen click coordinates from the current frame.
    getClickScreenCoords() {
      return HelperModule.getClickScreenCoords();
    }

    // Gets the main GeoFS pad container element.
    getPadsContainer() {
      return document.querySelector('.geofs-pads-container');
    }

    // Builds a styled control-pad button element.
    createPadButton(options) {
      const cfg = options ?? {};
      const label = String(cfg.label ?? 'BTN');
      const id = String(cfg.id ?? '');
      const onClick = typeof cfg.onClick === 'function' ? cfg.onClick : () => {};

      const outer = document.createElement('div');
      if (id) outer.id = id;
      outer.className = 'geofs-inline-overlay geofs-textOverlay control-pad geofs-visible geofs-manipulator';
      outer.style.backgroundSize = '50px 25px';
      outer.style.marginLeft = '0px';
      outer.style.marginBottom = '0px';
      outer.style.zIndex = '60';
      outer.style.backgroundPosition = '0px 0px';
      outer.style.width = '50px';
      outer.style.height = '25px';
      outer.style.transformOrigin = '0px 25px';
      outer.style.opacity = '1';
      outer.style.transform = 'rotate(0deg)';
      outer.style.position = 'relative';
      outer.style.cursor = 'pointer';

      const inner = document.createElement('div');
      inner.className = 'geofs-overlay geofs-textOverlay control-pad-dyn-label geofs-visible';
      inner.style.backgroundSize = '50px 25px';
      inner.style.marginLeft = '0px';
      inner.style.marginBottom = '0px';
      inner.style.left = '0px';
      inner.style.bottom = '0px';
      inner.style.zIndex = '61';
      inner.style.backgroundPosition = '0px 0px';
      inner.style.width = '50px';
      inner.style.height = '25px';
      inner.style.transformOrigin = '0px 25px';
      inner.style.opacity = '1';
      inner.style.transform = 'rotate(0deg)';
      inner.textContent = label;

      if (cfg?.outerStyle && typeof cfg.outerStyle === 'object') {
        Object.assign(outer.style, cfg.outerStyle);
      }
      if (cfg?.innerStyle && typeof cfg.innerStyle === 'object') {
        Object.assign(inner.style, cfg.innerStyle);
      }

      outer.appendChild(inner);
      outer.addEventListener('click', onClick);
      return outer;
    }

    // Inserts or replaces a pad control element in the GeoFS UI.
    installPadControl(options) {
      const cfg = options ?? {};
      const id = String(cfg.id ?? '').trim();
      const element = cfg.element;
      const prepend = cfg.prepend !== false;

      if (!id || !element) return false;

      const padsContainer = this.getPadsContainer();
      if (!padsContainer) return false;

      this.removePadControl(id);

      if (prepend) {
        padsContainer.prepend(element);
      } else {
        padsContainer.appendChild(element);
      }

      this.padControls.set(id, element);
      return true;
    }

    // Removes a previously installed pad control by id.
    removePadControl(id) {
      const key = String(id ?? '').trim();
      if (!key) return;

      const element = this.padControls.get(key) ?? document.getElementById(key);
      if (element) {
        element.remove();
      }
      this.padControls.delete(key);
    }
  }




  class OptionModule {
    static STORAGE_KEY = 'F18Options';
    static storageKeysByAircraft = Object.create(null);
    static optionKeyCache = Object.create(null);
    static optionStoreCache = null;

    static initializeStorageKey(aircraftId, storageKey) {
      OptionModule.storageKeysByAircraft[aircraftId] = storageKey;
      return true;
    }

    static useStorageKeyForAircraft(aircraftId) {
      const nextStorageKey = OptionModule.storageKeysByAircraft[aircraftId];
      if (!nextStorageKey || nextStorageKey === OptionModule.STORAGE_KEY) return false;
      OptionModule.STORAGE_KEY = nextStorageKey;
      OptionModule.optionStoreCache = null;
      return true;
    }

    static normalizeOptionToken(value) {
      return String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    static getCachedOptionKey(pageTitle, buttonKey) {
      const pageToken = OptionModule.normalizeOptionToken(pageTitle);
      const buttonToken = OptionModule.normalizeOptionToken(buttonKey);
      const cacheId = `${pageToken}\u0000${buttonToken}`;
      let optionKey = OptionModule.optionKeyCache[cacheId];
      if (optionKey) return optionKey;

      optionKey = `${pageToken}.${buttonToken}`;
      OptionModule.optionKeyCache[cacheId] = optionKey;
      return optionKey;
    }

    static buildOptionKey(pageTitle, buttonKey) {
      return OptionModule.getCachedOptionKey(pageTitle, buttonKey);
    }

    static readOptions() {
      if (OptionModule.optionStoreCache) return OptionModule.optionStoreCache;

      const raw = window.localStorage.getItem(OptionModule.STORAGE_KEY);
      if (!raw) {
        OptionModule.optionStoreCache = {};
        return OptionModule.optionStoreCache;
      }

      OptionModule.optionStoreCache = JSON.parse(raw);
      return OptionModule.optionStoreCache;
    }

    static getOption(pageTitle, buttonKey, fallback = null) {
      const options = OptionModule.readOptions();
      const optionKey = OptionModule.buildOptionKey(pageTitle, buttonKey);
      return options[optionKey] ?? fallback;
    }

    static writeOptions(options) {
      const payload = options ?? {};
      OptionModule.optionStoreCache = payload;
      window.localStorage.setItem(OptionModule.STORAGE_KEY, JSON.stringify(payload));
      return true;
    }

    static setOption(pageTitle, buttonKey, value) {
      const options = OptionModule.readOptions();
      const optionKey = OptionModule.getCachedOptionKey(pageTitle, buttonKey);
      options[optionKey] = value;
      OptionModule.writeOptions(options);
    }

    static getOptionValue(pageTitle, buttonKey, fallback = null) {
      const selectedState = OptionModule.getOption(pageTitle, buttonKey, null);
      const pages = window.BasePlugin.getActiveMfdPages();
      if (!pages.length) return selectedState ?? fallback;

      const page = pages.find((p) => p?.title === pageTitle);
      if (!page) return selectedState ?? fallback;

      const allButtons = [
        ...(Array.isArray(page.leftButtons) ? page.leftButtons : []),
        ...(Array.isArray(page.rightButtons) ? page.rightButtons : [])
      ];
      const button = allButtons.find((b) => b?.key === buttonKey || b?.label === buttonKey);
      if (!button || !Array.isArray(button.values) || !button.values.length) {
        return selectedState ?? fallback;
      }

      let stateIndex = -1;
      if (selectedState != null && Array.isArray(button.states)) {
        stateIndex = button.states.findIndex((s) => s === selectedState);
      }

      if (stateIndex < 0 && Number.isInteger(button.stateIndex)) {
        stateIndex = button.stateIndex;
      }

      if (stateIndex >= 0 && stateIndex < button.values.length) {
        return button.values[stateIndex];
      }

      return selectedState ?? fallback;
    }
  }


class WeaponModule {
    constructor(config = {}) {
        this.STORAGE_KEY = config.storageKey ?? 'DefaultWpnState';
        this.LOADOUT_BY_CONFIG = config.loadouts ?? {};
        
        this.STATION_RENDER_ORDER = [
            { side: 'center', station: 'gun' },
            { side: 'left', station: 'wingtip' },
            { side: 'left', station: 'hardpoint1' },
            { side: 'left', station: 'hardpoint2' },
            { side: 'right', station: 'hardpoint2' },
            { side: 'right', station: 'hardpoint1' },
            { side: 'right', station: 'wingtip' }
        ];

        this.FIRE_BLINK_INTERVAL_MS = 500;
        this.FIRE_BLINK_PHASES = 4;
        this.GUN_FIRE_RATE_RPS = 100;
        this.GUN_ROUNDS_PER_BURST = 100;
        this.GUN_FIRE_TICK_MS = 16;
        this.REARM_DURATION_MS = 60_000;

        this.selectedWeaponByMode = {};
        this.loadoutTemplates = JSON.parse(JSON.stringify(this.LOADOUT_BY_CONFIG));
        this.currentLoadout = JSON.parse(JSON.stringify(
            this.loadoutTemplates['A/A']
            ?? Object.values(this.loadoutTemplates)[0]
            ?? {}
        ));
        this.rearmState = {
            active: false,
            startTime: 0,
            progress: 0,
            durationMs: this.REARM_DURATION_MS,
            config: 'A/A',
            status: 'IDLE',
            lastSavedPercent: -1
        };
        this.gunFireState = {
            timerId: null,
            mode: null,
            roundsRemainingInBurst: 0,
            triggerHeld: false,
            firing: false,
            lastTickAt: 0,
            accumulator: 0
        };
        this.fireFlash = {
            startTime: 0,
            label: 'FIRE'
        };
        this.listeners = new Map();

        this.loadStateFromStorage();
    }

    static effectivenessByType = 
    [
        {
            "name": "AIM-9X",
            "engagement_window": { "min": 0.2, "max": 18.9 },
            "effective_range": { "min": 0.5, "max": 8.1 }
        },
        {
            "name": "AIM-120C",
            "engagement_window": { "min": 1.1, "max": 48.6 },
            "effective_range": { "min": 10.8, "max": 27.0 }
        },
        {
            "name": "AIM-120D",
            "engagement_window": { "min": 1.1, "max": 86.4 },
            "effective_range": { "min": 16.2, "max": 43.2 }
        },
        {
            "name": "AIM-7M",
            "engagement_window": { "min": 1.1, "max": 37.8 },
            "effective_range": { "min": 8.1, "max": 21.6 }
        },
        {
            "name": "R-73",
            "engagement_window": { "min": 0.2, "max": 21.6 },
            "effective_range": { "min": 0.5, "max": 8.1 }
        },
        {
            "name": "R-27R",
            "engagement_window": { "min": 1.1, "max": 40.5 },
            "effective_range": { "min": 10.8, "max": 24.3 }
        },
        {
            "name": "R-27ER",
            "engagement_window": { "min": 1.1, "max": 70.2 },
            "effective_range": { "min": 16.2, "max": 37.8 }
        },
        {
            "name": "R-27T",
            "engagement_window": { "min": 0.5, "max": 21.6 },
            "effective_range": { "min": 5.4, "max": 16.2 }
        },
        {
            "name": "R-27ET",
            "engagement_window": { "min": 0.5, "max": 64.8 },
            "effective_range": { "min": 10.8, "max": 32.4 }
        },
        {
            "name": "R-77",
            "engagement_window": { "min": 1.1, "max": 43.2 },
            "effective_range": { "min": 10.8, "max": 27.0 }
        },
        {
            "name": "R-77-1",
            "engagement_window": { "min": 1.1, "max": 59.4 },
            "effective_range": { "min": 16.2, "max": 37.8 }
        },
        {
            "name": "R-77M",
            "engagement_window": { "min": 1.6, "max": 102.6 },
            "effective_range": { "min": 21.6, "max": 54.0 }
        }
    ];

    // Shared projectile characteristics taken from the former EEGS script.
    // Aircraft loadouts select a weapon name; they do not redefine its physics.
    static projectileMetadataByType = {
        'AIM-9X': { speed: 850, turnRate: 1.2, maxFlightTime: 30 },
        'AIM-120C': { speed: 900, turnRate: 1.2, maxFlightTime: 45 },
        'AIM-120D': { speed: 900, turnRate: 1.2, maxFlightTime: 60 },
        'AIM-7M': { speed: 850, turnRate: 1.0, maxFlightTime: 45 },
        'R-73': { speed: 850, turnRate: 1.2, maxFlightTime: 30 },
        'R-27R': { speed: 900, turnRate: 1.1, maxFlightTime: 45 },
        'R-27ER': { speed: 950, turnRate: 1.1, maxFlightTime: 55 },
        'R-27T': { speed: 850, turnRate: 1.1, maxFlightTime: 35 },
        'R-27ET': { speed: 900, turnRate: 1.1, maxFlightTime: 50 },
        'R-77': { speed: 900, turnRate: 1.2, maxFlightTime: 45 },
        'R-77-1': { speed: 950, turnRate: 1.2, maxFlightTime: 50 },
        'R-77M': { speed: 1000, turnRate: 1.3, maxFlightTime: 60 }
    };

    // Gun and missile launch constants taken from the former EEGS script.
    static gunMetadata = {
        muzzleVelocity: 1050,
        drag: 0.4,
        gravity: 9.81,
        tracerEvery: 5,
        tracerMinDist: 25,
        tracerColor: '#eb9800',
        impactColor: '#707070'
    };

    static defaultMissileMetadata = { speed: 900, turnRate: 1.2, maxFlightTime: 45, launchSpeed: 850 };

    registerMfdPages(mfdModule) {
        mfdModule.registerPage({
        title: 'WPN',
        leftButtons: [
            { key: 'MASTER', label: 'MSTR', states: ['OFF', 'ON', 'SIM'], stateIndex: 0 },
            {
            key: 'SELECT',
            label: 'SEL',
            states: ['NEXT'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
                const modeLoadout = this.getModeLoadout(mode);
                this.selectNextWeapon(mode, modeLoadout, 0);
            },
            show: () => window.controls?.gear?.position === 1 && window.geofs?.animation?.values?.haglFeet > 50
            },
            {
            key: 'CONFIG',
            label: 'CFG',
            states: ['A/A', 'L/R A/A', 'A/G', 'L/R A/G', 'L/R', 'MIN', 'CLEAN'],
            stateIndex: 0,
            show: () => HelperModule.isAircraftParkedAndCold()
            }

        ],
        rightButtons: [
            { key: 'MODE', label: 'MODE', states: ['NAV', 'A/A', 'A/G', 'JETTISON'], stateIndex: 0 },
            {
            key: 'FIRE',
            label: 'FIRE',
            states: ['N/A'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
                const modeLoadout = this.getModeLoadout(mode);
                this.fireSelectedWeapon(mode, modeLoadout);
            },
            show: () => window.controls?.gear?.position === 1 && window.geofs?.animation?.values?.haglFeet > 50 && OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF' && OptionModule.getOption('WPN', 'MODE', 'NAV') !== 'JETTISON'
            },
            {
            key: 'JETTISON',
            label: 'JETT',
            states: ['N/A'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
                const modeLoadout = this.getModeLoadout(mode);
                this.jettisonSelectedWeapon(mode, modeLoadout);
            },
            show: () => window.controls?.gear?.position === 1 && window.geofs?.animation?.values?.haglFeet > 50 && OptionModule.getOption('WPN', 'MODE', 'NAV') === 'JETTISON'
            },
            {
            key: 'REARM',
            label: 'ARM',
            states: ['START'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const config = OptionModule.getOption('WPN', 'CONFIG', 'A/A');
                this.startRearm(config);
            },
            show: () => HelperModule.isAircraftParkedAndCold() && OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF'
            }
        ],
        lines: [],
        render: (renderer, renderContext) => {
            const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
            const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
            const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
            if (!ctx) return;

            this.updateRearmState();

            const selectedMode = OptionModule.getOption('WPN', 'MODE', 'NAV');
            const modeLoadout = this.getModeLoadout(selectedMode);
            if (!modeLoadout) return;
            const selectedWeapon = this.ensureSelectedWeapon(selectedMode, modeLoadout);

            const fireButton = renderContext?.page?.rightButtons?.find((b) => b?.key === 'FIRE');
            if (fireButton) {
            fireButton.states = [this.getSelectedLoadDisplay(selectedMode, modeLoadout)];
            fireButton.stateIndex = 0;
            }
            const jettisonButton = renderContext?.page?.rightButtons?.find((b) => b?.key === 'JETTISON');
            if (jettisonButton) {
            jettisonButton.states = [this.getSelectedLoadDisplay(selectedMode, modeLoadout)];
            jettisonButton.stateIndex = 0;
            }

            const color = renderContext?.color ?? '#00ff66';
            const left = modeLoadout?.left ?? {};
            const right = modeLoadout?.right ?? {};
            const gunRounds = Number.isFinite(modeLoadout?.gun) ? modeLoadout.gun : '--';

            const drawDiamond = (x, y, size) => {
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x - size, y);
            ctx.closePath();
            ctx.stroke();
            };

            const drawStation = (x, y, station, options = {}) => {
            const quantity = Number.isFinite(station?.quantity) ? String(station.quantity) : '--';
            const display = station?.display ?? '--';
            const showDiamond = options.showDiamond !== false;
            const boxedQuantity = options.boxedQuantity === true;

            if (showDiamond) {
                drawDiamond(x, y - h * 0.036, w * 0.012);
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.042)}px monospace`;

            if (boxedQuantity) {
                const boxW = w * 0.078;
                const boxH = h * 0.044;
                const by = y - boxH * 0.5 + h * 0.003;
                ctx.strokeRect(x - boxW * 0.5, by + 1, boxW, boxH);
            }

            ctx.fillText(quantity, x, y + 4);
            ctx.fillText(display, x, y + h * 0.045 + 4);
            };

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = Math.max(1.4, w * 0.003);

            const yOffset = h * 0.11;
            const cx = w * 0.5;

            const leftRootX = w * 0.44;
            const rightRootX = w * 0.56;
            const topY = h * 0.20 + yOffset;
            const midY = h * 0.31 + yOffset;
            const breakY = h * 0.40 + yOffset;
            const tipY = h * 0.54 + yOffset;
            const leftBreakX = w * 0.31;
            const rightBreakX = w * 0.69;
            const leftTipX = w * 0.09;
            const rightTipX = w * 0.91;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.048)}px monospace`;

            if (selectedWeapon?.station === 'gun') {
            const boxW = w * 0.12;
            const boxH = h * 0.06;
            ctx.strokeRect(cx - boxW * 0.5, topY - boxH * 0.5, boxW, boxH);
            }

            ctx.fillText(String(gunRounds), cx, topY);
            ctx.beginPath();
            ctx.moveTo(leftRootX, topY);
            ctx.lineTo(leftRootX, midY);
            ctx.lineTo(leftBreakX, breakY);
            ctx.lineTo(leftTipX, tipY);
            ctx.moveTo(rightRootX, topY);
            ctx.lineTo(rightRootX, midY);
            ctx.lineTo(rightBreakX, breakY);
            ctx.lineTo(rightTipX, tipY);
            ctx.stroke();

            ctx.font = `bold ${Math.round(h * 0.055)}px monospace`;
            ctx.fillText('FUEL', cx, h * 0.35 + yOffset);

            if (OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF') {
            ctx.fillText('ARM', cx, h * 0.47 + yOffset);
            }

            ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
            drawStation(w * 0.06, h * 0.50 + yOffset, left?.wingtip, {
            showDiamond: false,
            boxedQuantity: selectedWeapon?.side === 'left' && selectedWeapon?.station === 'wingtip'
            });
            drawStation(w * 0.18, h * 0.54 + yOffset, left?.hardpoint1, {
            boxedQuantity: selectedWeapon?.side === 'left' && selectedWeapon?.station === 'hardpoint1'
            });
            drawStation(w * 0.29, h * 0.47 + yOffset, left?.hardpoint2, {
            boxedQuantity: selectedWeapon?.side === 'left' && selectedWeapon?.station === 'hardpoint2'
            });

            drawStation(w * 0.71, h * 0.47 + yOffset, right?.hardpoint2, {
            boxedQuantity: selectedWeapon?.side === 'right' && selectedWeapon?.station === 'hardpoint2'
            });
            drawStation(w * 0.82, h * 0.54 + yOffset, right?.hardpoint1, {
            boxedQuantity: selectedWeapon?.side === 'right' && selectedWeapon?.station === 'hardpoint1'
            });
            drawStation(w * 0.94, h * 0.50 + yOffset, right?.wingtip, {
            showDiamond: false,
            boxedQuantity: selectedWeapon?.side === 'right' && selectedWeapon?.station === 'wingtip'
            });

            if (this.isFireFlashVisible()) {
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.12)}px monospace`;
            ctx.fillStyle = '#ff0000';
            ctx.fillText(this.getActionFlashLabel(), cx, h * 0.72);
            ctx.fillStyle = color;
            }

            const rearmTextY = h * 0.84;
            ctx.textBaseline = 'middle';

            const wpnRearmState = this.rearmState;
            if (wpnRearmState.active) {
                const progress = Math.max(0, Math.min(1, wpnRearmState.progress ?? 0));
                const pct = Math.round(progress * 100);
                const barW = w * 0.50;
                const barH = h * 0.03;
                const barX = cx - barW * 0.5;
                const barY = h * 0.875;

                ctx.font = `bold ${Math.round(h * 0.034)}px monospace`;
                ctx.fillText(`REARMING ${wpnRearmState.config} ${pct}%`, cx, rearmTextY);

                ctx.strokeRect(barX, barY, barW, barH);
                ctx.fillRect(barX, barY, barW * progress, barH);
            } else {
                ctx.font = `bold ${Math.round(h * 0.03)}px monospace`;
                ctx.fillText('Rearm with Engine OFF, Master OFF on ground.', cx, rearmTextY);
            }

            ctx.restore();
        }
        });
        return true;
    }

    isModeCompatibleStation(mode, stationName, stationData) {
        if (mode === 'JETTISON') return stationName !== 'gun';
        if (stationName === 'gun') return mode !== 'NAV';
        if (mode === 'NAV') return false;
        const stationType = stationData.type;
        if (!stationType) return true;
        return stationType === mode;
    }

    saveStateToStorage() {
        const payload = {
            config: OptionModule.getOption('WPN', 'CONFIG', 'A/A'),
            loadout: this.currentLoadout,
            selected: this.selectedWeaponByMode
        };
        window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    }

    loadStateFromStorage() {
        const raw = window.localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const storedLoadout = parsed.loadout;
        const baseTemplate = HelperModule.deepCloneJson(this.loadoutTemplates['A/A']);

        baseTemplate.gun = storedLoadout.gun;
        for (const sideKey of ['left', 'right']) {
            for (const stationKey of Object.keys(baseTemplate[sideKey])) {
                const stationTemplate = baseTemplate[sideKey][stationKey];
                const stationStored = storedLoadout[sideKey][stationKey];
                stationTemplate.quantity = stationStored.quantity;
                stationTemplate.load = stationStored.load;
                stationTemplate.display = stationStored.display;
                stationTemplate.type = stationStored.type;
            }
        }

        this.currentLoadout = baseTemplate;

        for (const key of Object.keys(this.selectedWeaponByMode)) {
            delete this.selectedWeaponByMode[key];
        }

        const storedSelected = parsed.selected;
        for (const modeKey of Object.keys(storedSelected)) {
            const selected = storedSelected[modeKey];
            this.selectedWeaponByMode[modeKey] = {
                side: selected.side,
                station: selected.station
            };
        }

        this.rearmState.config = parsed.config;
    }

    resolveTemplateConfig(config) {
        if (this.loadoutTemplates[config]) return config;
        if (this.loadoutTemplates['A/A']) return 'A/A';
        return Object.keys(this.loadoutTemplates)[0];
    }

    getRearmTemplateByMode(config) {
        const resolvedConfig = this.resolveTemplateConfig(config);
        const sourceTemplate = this.loadoutTemplates[resolvedConfig];
        if (!sourceTemplate) return null;
        return HelperModule.deepCloneJson(sourceTemplate);
    }

    zeroCurrentLoadout() {
        if (!this.currentLoadout) return;
        this.currentLoadout.gun = 0;
        for (const sideKey of ['left', 'right']) {
            const sideStations = this.currentLoadout[sideKey];
            for (const stationKey of Object.keys(sideStations)) {
                if (!Number.isFinite(sideStations[stationKey].quantity)) continue;
                sideStations[stationKey].quantity = 0;
            }
        }
    }

    applyRearmProgress(targetByMode, progress) {
        const p = Math.max(0, Math.min(1, progress));
        if (!this.currentLoadout || !targetByMode) return;

        this.currentLoadout.gun = Math.floor(targetByMode.gun * p);

        for (const sideKey of ['left', 'right']) {
            this.currentLoadout[sideKey] = this.currentLoadout[sideKey] ?? {};
            const targetSide = targetByMode[sideKey] ?? {};
            for (const stationKey of Object.keys(targetSide)) {
                const targetStation = targetSide[stationKey] ?? {};
                this.currentLoadout[sideKey][stationKey] = this.currentLoadout[sideKey][stationKey] ?? {};
                this.currentLoadout[sideKey][stationKey].load = targetStation.load;
                this.currentLoadout[sideKey][stationKey].display = targetStation.display;
                this.currentLoadout[sideKey][stationKey].type = targetStation.type;

                const targetQuantity = Number.isFinite(targetStation.quantity) ? targetStation.quantity : 0;
                this.currentLoadout[sideKey][stationKey].quantity = Math.floor(targetQuantity * p);
            }
        }
    }

    startRearm(config) {
        if (this.rearmState.active) return false;
        if (!HelperModule.isAircraftParkedAndCold()
            || OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF') {
            return false;
        }

        const resolvedConfig = this.resolveTemplateConfig(config);
        const targetByMode = this.getRearmTemplateByMode(resolvedConfig);
        if (!resolvedConfig || !targetByMode) return false;

        this.zeroCurrentLoadout();
        for (const modeKey of Object.keys(this.selectedWeaponByMode)) {
            delete this.selectedWeaponByMode[modeKey];
        }

        this.rearmState.active = true;
        this.rearmState.startTime = Date.now();
        this.rearmState.progress = 0;
        this.rearmState.config = resolvedConfig;
        this.rearmState.status = 'REARMING';
        this.rearmState.lastSavedPercent = -1;
        this.rearmState.targetByMode = targetByMode;
        this.saveStateToStorage();
        return true;
    }

    updateRearmState() {
        if (!this.rearmState.active) return;
        if (window.geofs?.animation?.values?.enginesOn) {
            this.rearmState.active = false;
            this.rearmState.status = 'ABORTED';
            this.rearmState.targetByMode = null;
            this.saveStateToStorage();
            return;
        }

        const elapsed = Date.now() - this.rearmState.startTime;
        const duration = Math.max(1, Number.isFinite(this.rearmState.durationMs) ? this.rearmState.durationMs : this.REARM_DURATION_MS);
        const progress = Math.max(0, Math.min(1, elapsed / duration));

        this.rearmState.progress = progress;
        this.applyRearmProgress(this.rearmState.targetByMode, progress);

        const percent = Math.round(progress * 100);
        if (percent !== this.rearmState.lastSavedPercent) {
            this.rearmState.lastSavedPercent = percent;
            this.saveStateToStorage();
        }

        if (progress >= 1) {
            this.rearmState.active = false;
            this.rearmState.status = 'READY';
            this.rearmState.targetByMode = null;
            this.saveStateToStorage();
        }
    }

    stopGunFireTimer() {
        const wasFiring = this.gunFireState.firing;
        this.gunFireState.firing = false;
        if (this.gunFireState.timerId) {
            clearTimeout(this.gunFireState.timerId);
            this.gunFireState.timerId = null;
        }
        this.gunFireState.mode = null;
        this.gunFireState.roundsRemainingInBurst = 0;
        this.gunFireState.triggerHeld = false;
        this.gunFireState.accumulator = 0;
        if (wasFiring) this.emit('gunstate', { firing: false });
    }

    processGunFireTick() {
        const state = this.gunFireState;
        const now = performance.now();
        const elapsedSeconds = Math.min(0.2, Math.max(0, (now - state.lastTickAt) / 1000));
        state.lastTickAt = now;
        state.accumulator += elapsedSeconds * this.GUN_FIRE_RATE_RPS;
        let roundsDue = Math.floor(state.accumulator);
        state.accumulator -= roundsDue;

        const mode = state.mode;
        const modeLoadout = this.getModeLoadout(mode);

        // Emit one event per round so projectile and multiplayer modules can
        // reproduce the real gun cadence instead of only seeing the burst.
        while (roundsDue > 0 && (state.triggerHeld || state.roundsRemainingInBurst > 0)) {
            if (!(modeLoadout.gun > 0)) break;
            modeLoadout.gun -= 1;
            if (!state.triggerHeld) state.roundsRemainingInBurst -= 1;
            roundsDue -= 1;
            this.emitFireEvent(mode, { side: 'center', station: 'gun' }, { load: 'GUN' });
        }

        if (!(modeLoadout.gun > 0)) {
            this.stopGunFireTimer();
            this.selectNextWeapon(mode, modeLoadout, 0);
            this.saveStateToStorage();
            return;
        }

        if (!state.triggerHeld && state.roundsRemainingInBurst <= 0) {
            this.stopGunFireTimer();
            this.saveStateToStorage();
            return;
        }

        state.timerId = setTimeout(() => this.processGunFireTick(), this.GUN_FIRE_TICK_MS);
    }

    /** Starts the gun timer if idle; the first round is due immediately. */
    beginGunFireTimer(mode) {
        const state = this.gunFireState;
        state.mode = mode;
        if (state.firing) return;
        state.lastTickAt = performance.now();
        state.accumulator = 1;
        this.emit('gunstate', { firing: true });
        this.triggerFireFlash();
        state.firing = true;
        this.processGunFireTick();
    }

    /** Fires a fixed-size burst (used by the MFD FIRE button). */
    startGunFire(mode, modeLoadout) {
        if (!modeLoadout || !Number.isFinite(modeLoadout.gun) || modeLoadout.gun <= 0) {
            this.emit('dryfire', { weapon: 'GUN' });
            return false;
        }
        this.gunFireState.roundsRemainingInBurst += this.GUN_ROUNDS_PER_BURST;
        this.beginGunFireTimer(mode);
        return true;
    }

    /** Fires continuously until `releaseTrigger()` (used by the keyboard trigger). */
    startGunTrigger(mode, modeLoadout) {
        if (!modeLoadout || !Number.isFinite(modeLoadout.gun) || modeLoadout.gun <= 0) {
            this.emit('dryfire', { weapon: 'GUN' });
            return false;
        }
        this.gunFireState.triggerHeld = true;
        this.beginGunFireTimer(mode);
        return true;
    }

    /**
     * Pulls the trigger for the selected weapon: guns fire while held, missiles
     * launch once. Returns false when nothing was fired (master off, no lock ...).
     */
    pressTrigger() {
        const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
        if (mode === 'NAV' || mode === 'JETTISON') {
            this.emit('blocked', { reason: 'mode', mode });
            return false;
        }
        if (OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF') {
            this.emit('blocked', { reason: 'master' });
            return false;
        }
        const modeLoadout = this.getModeLoadout(mode);
        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected && this.selectNextWeapon(mode, modeLoadout, 0)) {
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
        }
        if (selected?.station === 'gun') return this.startGunTrigger(mode, modeLoadout);
        return this.fireSelectedWeapon(mode, modeLoadout);
    }

    releaseTrigger() {
        if (!this.gunFireState.triggerHeld) return;
        this.gunFireState.triggerHeld = false;
        if (this.gunFireState.roundsRemainingInBurst <= 0) {
            this.stopGunFireTimer();
            this.saveStateToStorage();
        }
    }
    triggerActionFlash(label = 'FIRE') {
        this.fireFlash.startTime = Date.now();
        this.fireFlash.label = label;
    }

    triggerFireFlash() {
        this.triggerActionFlash('FIRE');
    }

    getActionFlashLabel() {
        return this.fireFlash.label || 'FIRE';
    }

    isFireFlashVisible() {
        if (!this.fireFlash.startTime) return false;
        const elapsed = Date.now() - this.fireFlash.startTime;
        const totalDuration = this.FIRE_BLINK_INTERVAL_MS * this.FIRE_BLINK_PHASES;
        if (elapsed >= totalDuration) {
            this.fireFlash.startTime = 0;
            this.fireFlash.label = 'FIRE';
            return false;
        }
        return Math.floor(elapsed / this.FIRE_BLINK_INTERVAL_MS) % 2 === 0;
    }

    getModeLoadout() {
        return this.currentLoadout ?? null;
    }

    getStationQuantity(modeLoadout, side, station) {
        if (station === 'gun') {
            const gun = modeLoadout?.gun;
            return Number.isFinite(gun) ? gun : 0;
        }
        const q = modeLoadout?.[side]?.[station]?.quantity;
        return Number.isFinite(q) ? q : 0;
    }

    canUseStationForMode(mode, modeLoadout, side, station, minimumQuantity = 0) {
        if (!modeLoadout || !station) return false;
        if (station === 'gun') {
            if (!this.isModeCompatibleStation(mode, station, null)) return false;
            return this.getStationQuantity(modeLoadout, side, station) > minimumQuantity;
        }
        const stationData = modeLoadout?.[side]?.[station];
        if (!stationData) return false;
        if (!this.isModeCompatibleStation(mode, station, stationData)) return false;
        return this.getStationQuantity(modeLoadout, side, station) > minimumQuantity;
    }

    ensureSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return null;

        const current = this.selectedWeaponByMode[mode];
        if (current?.station === 'gun' && Number.isFinite(modeLoadout?.gun)) {
            if (!this.isModeCompatibleStation(mode, 'gun', null)) return null;
            return current;
        }
        if (current?.side && current?.station && modeLoadout?.[current.side]?.[current.station]) {
            const stationData = modeLoadout[current.side][current.station];
            if (!this.isModeCompatibleStation(mode, current.station, stationData)) return null;
            return current;
        }
        return null;
    }

    getSelectedLoadDisplay(mode, modeLoadout) {
        const selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) return 'N/A';
        if (selected.station === 'gun') return 'GUN';
        const station = modeLoadout?.[selected.side]?.[selected.station];
        return station?.load ?? 'N/A';
    }

    getSelectedQuantityLine(mode, modeLoadout) {
        const selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) return 'N/A';
        if (selected.station === 'gun') {
            const quantity = Number.isFinite(modeLoadout?.gun) ? modeLoadout.gun : 0;
            return `${quantity}x GUN`;
        }
        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station) return 'N/A';
        const quantity = Number.isFinite(station.quantity) ? station.quantity : 0;
        const load = station.load ?? station.display ?? 'N/A';
        return `${quantity}x ${load}`;
    }

    getSelectedWeaponEffectiveness(mode, modeLoadout) {
        const selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected || selected.station === 'gun') return null;
        const station = modeLoadout[selected.side][selected.station];
        const profile = WeaponModule.effectivenessByType.find((item) => item.name === station.load);
        if (!profile) return null;
        return profile;
    }

    getEffectivenessMarkerFractions(profile) {
        const minEngagement = profile.engagement_window.min;
        const maxEngagement = profile.engagement_window.max;
        const span = maxEngagement - minEngagement;

        return {
            engagementMax: 0,
            effectiveMax: (maxEngagement - profile.effective_range.max) / span,
            effectiveMin: (maxEngagement - profile.effective_range.min) / span,
            engagementMin: 1
        };
    }

    getEffectivenessDistanceFraction(profile, distanceNm) {
        const minEngagement = profile.engagement_window.min;
        const maxEngagement = profile.engagement_window.max;
        const span = maxEngagement - minEngagement;
        const fraction = (maxEngagement - distanceNm) / span;
        return HelperModule.clampValue(fraction, 0, 1);
    }

    hasRadarHardLock() {
        const addon = window.BasePlugin?.getActiveAddon?.();
        if (addon?.combat?.targets) return addon.combat.targets.hasLock();
        return !!addon?.radar?.hardLockedUid;
    }

    selectNextWeapon(mode, modeLoadout, minimumQuantity = 0) {
        if (!modeLoadout) return false;
        const current = this.ensureSelectedWeapon(mode, modeLoadout);
        const currentIndex = current
            ? Math.max(0, this.STATION_RENDER_ORDER.findIndex((s) => s.side === current.side && s.station === current.station))
            : -1;

        for (let step = 1; step <= this.STATION_RENDER_ORDER.length; step++) {
            const index = (currentIndex + step) % this.STATION_RENDER_ORDER.length;
            const candidate = this.STATION_RENDER_ORDER[index];
            if (!this.canUseStationForMode(mode, modeLoadout, candidate.side, candidate.station, minimumQuantity)) continue;
            this.selectedWeaponByMode[mode] = { side: candidate.side, station: candidate.station };
            this.saveStateToStorage();
            return true;
        }
        return false;
    }

    selectPreviousWeapon(mode, modeLoadout, minimumQuantity = 0) {
        if (!modeLoadout) return false;
        const current = this.ensureSelectedWeapon(mode, modeLoadout);
        const currentIndex = current
            ? this.STATION_RENDER_ORDER.findIndex((s) => s.side === current.side && s.station === current.station)
            : 0;
        for (let step = 1; step <= this.STATION_RENDER_ORDER.length; step += 1) {
            const index = (currentIndex - step + this.STATION_RENDER_ORDER.length)
                % this.STATION_RENDER_ORDER.length;
            const candidate = this.STATION_RENDER_ORDER[index];
            if (!this.canUseStationForMode(mode, modeLoadout, candidate.side, candidate.station, minimumQuantity)) continue;
            this.selectedWeaponByMode[mode] = { side: candidate.side, station: candidate.station };
            this.saveStateToStorage();
            return true;
        }
        return false;
    }

    selectSameWeaponHardpoint(mode, modeLoadout, selected) {
        if (!modeLoadout || !selected) return false;
        if (selected.station === 'gun') return false;
        if (!String(selected.station).startsWith('hardpoint')) return false;

        const currentStation = modeLoadout?.[selected.side]?.[selected.station];
        const currentLoadType = currentStation?.load;
        if (!currentLoadType) return false;
        if (!this.isModeCompatibleStation(mode, selected.station, currentStation)) return false;

        const selectedIndex = this.STATION_RENDER_ORDER.findIndex((s) => s.side === selected.side && s.station === selected.station);
        if (selectedIndex < 0) return false;

        for (let step = 1; step <= this.STATION_RENDER_ORDER.length; step++) {
            const index = (selectedIndex + step) % this.STATION_RENDER_ORDER.length;
            const candidate = this.STATION_RENDER_ORDER[index];
            if (!candidate?.station || !String(candidate.station).startsWith('hardpoint')) continue;
            const candidateStation = modeLoadout?.[candidate.side]?.[candidate.station];
            if (!candidateStation) continue;
            if (candidateStation.load !== currentLoadType) continue;
            if (!this.isModeCompatibleStation(mode, candidate.station, candidateStation)) continue;
            if (!Number.isFinite(candidateStation.quantity) || candidateStation.quantity <= 0) continue;

            this.selectedWeaponByMode[mode] = { side: candidate.side, station: candidate.station };
            this.saveStateToStorage();
            return true;
        }
        return false;
    }

    /** Subscribe to weapon lifecycle events. Returns an unsubscribe function. */
    on(eventName, listener) {
        if (typeof listener !== 'function') return () => {};
        if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
        this.listeners.get(eventName).add(listener);
        return () => this.off(eventName, listener);
    }

    off(eventName, listener) {
        this.listeners.get(eventName)?.delete(listener);
    }

    emit(eventName, payload) {
        for (const listener of this.listeners.get(eventName) ?? []) {
            try { listener(payload); } catch (error) { console.error(`[WeaponModule] ${eventName} listener failed`, error); }
        }
    }

    emitFireEvent(mode, selected, station) {
        const load = station?.load ?? (selected?.station === 'gun' ? 'GUN' : null);
        const profile = load
            ? WeaponModule.effectivenessByType.find((item) => item.name === load)
            : null;
        const projectile = load === 'GUN'
            ? { ...WeaponModule.gunMetadata }
            : { ...WeaponModule.defaultMissileMetadata, ...(WeaponModule.projectileMetadataByType[load] ?? {}) };
        this.emit('fire', {
            mode,
            selected: selected ? { ...selected } : null,
            weapon: load,
            metadata: {
                engagement_window: profile ? { ...profile.engagement_window } : null,
                effective_range: profile ? { ...profile.effective_range } : null,
                projectile
            }
        });
    }
    fireSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return false;
        if (mode === 'NAV' || mode === 'JETTISON') return false;
        if (OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF') return false;

        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) {
            if (!this.selectNextWeapon(mode, modeLoadout, 0)) return false;
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
            if (!selected) return false;
        }

        if (selected.station === 'gun') return this.startGunFire(mode, modeLoadout);
        if (!this.hasRadarHardLock()) {
            this.emit('blocked', { reason: 'lock' });
            return false;
        }

        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station || !Number.isFinite(station.quantity)) return false;

        if (station.quantity <= 0) {
            this.emit('dryfire', { weapon: station.load });
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
            return false;
        }

        station.quantity -= 1;
        this.triggerFireFlash();
        this.emitFireEvent(mode, selected, station);
        this.saveStateToStorage();

        if (station.quantity <= 0) {
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
        }
        return true;
    }

    jettisonSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return false;
        if (mode !== 'JETTISON') return false;

        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) {
            if (!this.selectNextWeapon(mode, modeLoadout, 0)) return false;
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
            if (!selected) return false;
        }

        if (selected.station === 'gun') return false;

        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station || !Number.isFinite(station.quantity)) return false;

        if (station.quantity <= 0) {
            this.emit('dryfire', { weapon: station.load });
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
            return false;
        }

        station.quantity = 0;
        this.triggerActionFlash('JETT');
        this.saveStateToStorage();

        if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
            this.selectNextWeapon(mode, modeLoadout, 0);
        }
        return true;
    }
}

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

(function () {
  'use strict';

  /**
   * Procedural weapon sounds (Web Audio): looping gun fire, dry-fire click,
   * missile launch and countermeasure release. Reacts to WeaponModule events
   * (`fire`, `dryfire`, `gunstate`), so it needs no knowledge of the keybinds.
   */
  class WeaponAudioModule {
    constructor(combat, weaponModule, config = {}) {
      this.combat = combat;
      this.weapons = weaponModule;
      combat.audio = this;
      this.cfg = { sound: true, gunVolume: 0.7, ...config };
      this.actx = null;
      this.gunBuf = null;
      this.gunFilter = null;
      this.gunGain = null;
      this.gunSrc = null;
      this.soundOn = false;
      this.unsubscribers = [];
    }

    start() {
      if (!this.weapons?.on) return;
      this.unsubscribers.push(
        this.weapons.on('fire', (event) => { if (event.weapon && event.weapon !== 'GUN') this.missileSound(); }),
        this.weapons.on('dryfire', () => this.dryClick()),
        this.weapons.on('gunstate', ({ firing }) => this.gunSound(!!firing))
      );
    }

    stop() {
      this.gunSound(false);
      for (const unsubscribe of this.unsubscribers) unsubscribe();
      this.unsubscribers = [];
    }

    /** Creates the AudioContext lazily (it must follow a user gesture). */
    initAudio() {
      if (this.actx || !this.cfg.sound) return;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      const actx = new AudioCtor();
      this.actx = actx;
      const sr = actx.sampleRate;
      const rate = this.weapons?.GUN_FIRE_RATE_RPS ?? 100;
      const period = Math.round(sr / rate);
      const rounds = 60;
      const len = period * rounds;
      this.gunBuf = actx.createBuffer(1, len, sr);
      const d = this.gunBuf.getChannelData(0);
      for (let r = 0; r < rounds; r++) {
        const amp = 0.8 + 0.2 * Math.random();
        const start = r * period;
        for (let n = 0; n < period * 2; n++) {
          const t = n / sr;
          const crack = (Math.random() * 2 - 1) * Math.exp(-t / 0.0012);
          const thump = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.0055);
          d[(start + n) % len] += amp * (0.55 * crack + 0.9 * thump);
        }
      }
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
      for (let i = 0; i < len; i++) d[i] /= (peak || 1);

      this.gunFilter = actx.createBiquadFilter();
      this.gunFilter.type = 'lowpass';
      this.gunFilter.frequency.value = 3200;
      this.gunGain = actx.createGain();
      this.gunGain.gain.value = 0.0001;
      const compressor = actx.createDynamicsCompressor();
      this.gunFilter.connect(this.gunGain);
      this.gunGain.connect(compressor);
      compressor.connect(actx.destination);
    }

    gunSound(on) {
      if (on) this.initAudio();
      const actx = this.actx;
      if (!actx || !this.gunBuf) return;
      const t = actx.currentTime;
      if (on && !this.soundOn) {
        this.soundOn = true;
        if (actx.state === 'suspended') actx.resume();
        this.gunSrc = actx.createBufferSource();
        this.gunSrc.buffer = this.gunBuf;
        this.gunSrc.loop = true;
        this.gunSrc.playbackRate.setValueAtTime(0.55, t);
        this.gunSrc.playbackRate.linearRampToValueAtTime(1, t + 0.25);
        this.gunSrc.connect(this.gunFilter);
        this.gunGain.gain.cancelScheduledValues(t);
        this.gunGain.gain.setValueAtTime(0.0001, t);
        this.gunGain.gain.linearRampToValueAtTime(this.cfg.gunVolume, t + 0.04);
        this.gunSrc.start(t);
      } else if (!on && this.soundOn) {
        this.soundOn = false;
        const src = this.gunSrc;
        this.gunGain.gain.cancelScheduledValues(t);
        this.gunGain.gain.setValueAtTime(Math.max(0.0001, this.gunGain.gain.value), t);
        this.gunGain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
        src.playbackRate.cancelScheduledValues(t);
        src.playbackRate.setValueAtTime(src.playbackRate.value, t);
        src.playbackRate.linearRampToValueAtTime(0.45, t + 0.2);
        src.stop(t + 0.22);
      }
    }

    dryClick() {
      if (!this.cfg.sound) return;
      this.initAudio();
      const actx = this.actx;
      if (!actx) return;
      const sr = actx.sampleRate;
      const n = Math.round(sr * 0.03);
      const buffer = actx.createBuffer(1, n, sr);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
      const src = actx.createBufferSource();
      const gain = actx.createGain();
      const filter = actx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      gain.gain.value = this.cfg.gunVolume * 0.6;
      src.buffer = buffer;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);
      src.start();
    }

    countermeasureSound() {
      if (!this.cfg.sound) return;
      this.initAudio();
      const actx = this.actx;
      if (!actx) return;
      if (actx.state === 'suspended') actx.resume();

      const now = actx.currentTime;
      const length = Math.round(actx.sampleRate * 0.18);
      const buffer = actx.createBuffer(1, length, actx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * 0.055));
      }
      const noise = actx.createBufferSource();
      const filter = actx.createBiquadFilter();
      const noiseGain = actx.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.7;
      noiseGain.gain.setValueAtTime(this.cfg.gunVolume * 0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      noise.buffer = buffer;
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(actx.destination);
      noise.start(now);

      const pop = actx.createOscillator();
      const popGain = actx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(125, now);
      pop.frequency.exponentialRampToValueAtTime(55, now + 0.11);
      popGain.gain.setValueAtTime(this.cfg.gunVolume * 0.3, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      pop.connect(popGain);
      popGain.connect(actx.destination);
      pop.start(now);
      pop.stop(now + 0.13);
    }

    missileSound() {
      if (!this.cfg.sound) return;
      this.initAudio();
      const actx = this.actx;
      if (!actx) return;
      if (actx.state === 'suspended') actx.resume();

      const now = actx.currentTime;
      const oscillator = actx.createOscillator();
      const gain = actx.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(95, now);
      oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.35);
      gain.gain.setValueAtTime(this.cfg.gunVolume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      oscillator.connect(gain);
      gain.connect(actx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.42);
    }
  }

  window.WeaponAudioModule = WeaponAudioModule;
})();

(function () {
  'use strict';

  const DEFAULT_BINDINGS = {
    fire: 'Backslash',
    selectWeaponNext: 'Equal',
    selectWeaponPrevious: 'Minus',
    targetMode: 'KeyT',
    selectPrevious: 'Comma',
    selectNext: 'Slash',
    lock: 'Enter',
    countermeasures: 'Backspace',
    display: 'KeyU',
    reload: 'Shift+KeyU'
  };

  const OPTION_KEYS = {
    fire: 'FIRE',
    selectWeaponNext: 'WPN_NEXT',
    selectWeaponPrevious: 'WPN_PREV',
    targetMode: 'TGT_MODE',
    selectPrevious: 'TGT_PREV',
    selectNext: 'TGT_NEXT',
    lock: 'LOCK',
    countermeasures: 'CM',
    display: 'DISPLAY',
    reload: 'RELOAD'
  };

  const LABELS = {
    fire: 'Fire (hold for gun)',
    selectWeaponNext: 'Next weapon',
    selectWeaponPrevious: 'Previous weapon',
    targetMode: 'Target mode',
    selectPrevious: 'Previous target',
    selectNext: 'Next target',
    lock: 'Lock target',
    countermeasures: 'Countermeasures',
    display: 'HUD display on/off',
    reload: 'Rearm (parked, master off)'
  };

  /**
   * Keyboard controls for the weapon system. Bindings are `event.code` values,
   * optionally prefixed with `Shift+`, and are stored per aircraft through
   * OptionModule. The module only translates keys into calls on WeaponModule,
   * TargetModule, ProjectileModule and the overlay; it holds no weapon state.
   * Target keys (select/lock) are only captured while target mode is on, so
   * Enter/Comma/Slash keep their normal GeoFS meaning otherwise.
   */
  class KeybindModule {
    constructor(combat, weaponModule, config = {}) {
      this.combat = combat;
      this.weaponModule = weaponModule;
      combat.keybinds = this;
      this.bindings = {};
      for (const [action, fallback] of Object.entries(DEFAULT_BINDINGS)) {
        this.bindings[action] = config[`${action}Code`]
          ?? OptionModule.getOption('KEY', OPTION_KEYS[action], fallback);
      }
      this.running = false;
      this.optionsTimer = null;
      this.onKeyDown = (event) => this.handleKeyDown(event);
      this.onKeyUp = (event) => this.handleKeyUp(event);
      this.onBlur = () => this.weaponModule?.releaseTrigger?.();
    }

    start() {
      if (this.running) return;
      window.addEventListener('keydown', this.onKeyDown, true);
      window.addEventListener('keyup', this.onKeyUp, true);
      window.addEventListener('blur', this.onBlur);
      this.running = true;
      this.installOptionsControls();
      this.optionsTimer = setInterval(() => this.installOptionsControls(), 1000);
    }

    stop() {
      if (!this.running) return;
      window.removeEventListener('keydown', this.onKeyDown, true);
      window.removeEventListener('keyup', this.onKeyUp, true);
      window.removeEventListener('blur', this.onBlur);
      this.weaponModule?.releaseTrigger?.();
      this.running = false;
      clearInterval(this.optionsTimer);
      this.optionsTimer = null;
      document.querySelector('.geofs-addon-keybinds')?.remove();
    }

    installOptionsControls() {
      const mounted = CombatMath.ensureGeneralFieldset('geofs-addon-keybinds', 'Weapon Keybinds');
      if (!mounted || mounted.controls.dataset.built) return;
      mounted.controls.dataset.built = '1';
      for (const [action, label] of Object.entries(LABELS)) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.bindings[action];
        input.title = 'Keyboard event.code, optionally prefixed with Shift+';
        input.addEventListener('change', () => {
          this.bindings[action] = input.value.trim() || DEFAULT_BINDINGS[action];
          input.value = this.bindings[action];
          OptionModule.setOption('KEY', OPTION_KEYS[action], this.bindings[action]);
        });
        const row = document.createElement('label');
        row.style.display = 'block';
        row.textContent = `${label}: `;
        row.appendChild(input);
        mounted.controls.appendChild(row);
      }
    }

    static isTyping(event) {
      const target = event.target;
      return !!(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')));
    }

    /** Finds the action bound to the key, preferring the binding whose Shift requirement matches. */
    findAction(event) {
      let fallback = null;
      for (const [action, binding] of Object.entries(this.bindings)) {
        const requiresShift = /^shift\+/i.test(binding);
        const code = binding.replace(/^shift\+/i, '');
        if (code !== event.code) continue;
        if (requiresShift === event.shiftKey) return action;
        if (!requiresShift) fallback = fallback ?? action;
      }
      return fallback;
    }

    handleKeyDown(event) {
      if (KeybindModule.isTyping(event) || event.ctrlKey || event.altKey || event.metaKey) return;
      const action = this.findAction(event);
      if (!action) return;

      const targets = this.combat.targets;
      const targetKey = action === 'selectNext' || action === 'selectPrevious' || action === 'lock';
      if (targetKey && !targets?.targetMode) return;

      // Gun fire is a held key; every other action fires once per key press.
      if (action === 'fire') {
        if (!event.repeat) this.weaponModule?.pressTrigger?.();
        return;
      }
      event.preventDefault();
      if (event.repeat) return;
      this.invoke(action);
    }

    handleKeyUp(event) {
      const binding = this.bindings.fire.replace(/^shift\+/i, '');
      if (event.code === binding) this.weaponModule?.releaseTrigger?.();
    }

    invoke(action) {
      const combat = this.combat;
      const weapons = this.weaponModule;
      const mode = OptionModule.getOption('WPN', 'MODE', 'A/A');
      switch (action) {
        case 'selectWeaponNext':
          return weapons?.selectNextWeapon?.(mode, weapons.getModeLoadout(mode), 0);
        case 'selectWeaponPrevious':
          return weapons?.selectPreviousWeapon?.(mode, weapons.getModeLoadout(mode), 0);
        case 'targetMode':
          return combat.targets?.toggleTargetMode();
        case 'selectNext':
          return combat.targets?.selectTarget(1);
        case 'selectPrevious':
          return combat.targets?.selectTarget(-1);
        case 'lock':
          return combat.targets?.toggleLock();
        case 'countermeasures':
          return combat.projectile?.releaseCountermeasures();
        case 'display':
          return combat.overlay?.toggleEnabled();
        case 'reload': {
          if (OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF') {
            combat.notify('SET MASTER OFF TO REARM', 2000);
            return undefined;
          }
          return weapons?.startRearm?.(OptionModule.getOption('WPN', 'CONFIG', 'A/A'));
        }
        default:
          return undefined;
      }
    }
  }

  window.KeybindModule = KeybindModule;
})();

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

(function () {
  'use strict';

  const { turnVelocity, mul } = CombatMath;

  const STORAGE_KEY = 'geofs-addon-combat-mp';
  const CHAT_PREFIX = 'F7|';
  const CHAT_LIMIT = 70;
  const GROUP_LENGTH = 16;
  const EVENT_FRESH_MS = 15000;
  const MAX_NETWORK_MISSILES = 32;
  const NETWORK_HIT_RADIUS_M = 35;

  /**
   * Transport that carries combat events as plain text in the public GeoFS chat.
   * Everything transport specific lives here, so another channel can replace it
   * later by providing the same `send` / `start` / `stop` surface.
   */
  class GeoFsChatTransport {
    constructor(onChatMessage) {
      this.onChatMessage = onChatMessage;
      this.originalUpdate = null;
      this.wrappedUpdate = null;
    }

    isAvailable() {
      return typeof window.multiplayer?.setChatMessage === 'function';
    }

    /** Sends a text message; returns true on success. Throws a readable error otherwise. */
    send(message) {
      if (!this.isAvailable()) throw new Error('GEOFS CHAT SYNC API UNAVAILABLE');
      if (message.length > CHAT_LIMIT) throw new Error('SYNC EVENT EXCEEDS GEOFS CHAT LIMIT');
      window.multiplayer.setChatMessage(message);
      return true;
    }

    getSelfId(payload) {
      return String(window.multiplayer?.myId ?? window.multiplayer?.lastResponse?.myId ?? payload?.myId ?? '');
    }

    /**
     * Wraps the multiplayer update callback once per multiplayer object. Other
     * addon modules (CommunicationModule) wrap the same callback, so this never
     * re-wraps just because someone else wrapped on top of it: two modules that
     * each re-wrap when the other's wrapper is outermost would grow the call
     * chain forever and break the original GeoFS update (no visible users).
     */
    ensureHook() {
      const multiplayer = window.multiplayer;
      if (!multiplayer || typeof multiplayer.updateCallback !== 'function') return false;
      if (this.hookedMultiplayer === multiplayer) return true;
      const transport = this;
      const original = multiplayer.updateCallback;
      this.hookedMultiplayer = multiplayer;
      this.originalUpdate = original;
      this.active = true;
      this.wrappedUpdate = function (payload) {
        if (transport.active) {
          try {
            const messages = Array.isArray(payload?.chatMessages) ? payload.chatMessages : [];
            for (const message of messages) transport.onChatMessage(message, payload);
          } catch (error) {
            console.error('[MultiplayerModule] chat processing failed', error);
          }
        }
        return original.apply(this, arguments);
      };
      multiplayer.updateCallback = this.wrappedUpdate;
      return true;
    }

    stop() {
      this.active = false;
      const multiplayer = this.hookedMultiplayer;
      if (multiplayer && multiplayer.updateCallback === this.wrappedUpdate && this.originalUpdate) {
        multiplayer.updateCallback = this.originalUpdate;
      }
      this.hookedMultiplayer = null;
    }
  }
  /**
   * Multiplayer combat sync: compact `F7|<group>|<type>|...` chat events for
   * missile launch (L), hit (H), evade (D), miss/expiry (X) and a test ping (T).
   * Incoming missiles that target the local player are simulated and drawn here.
   */
  class MultiplayerModule {
    constructor(combat, config = {}) {
      this.combat = combat;
      combat.multiplayer = this;
      this.cfg = { ...config };
      const saved = CombatMath.readStorage(STORAGE_KEY, {}) || {};
      this.enabled = !!saved.enabled;
      this.group = typeof saved.group === 'string' ? saved.group.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, GROUP_LENGTH) : '';
      this.sharedHits = 0;
      this.networkMissiles = [];
      this.receivedNetworkEvents = new Set();
      this.seenChatMessages = new Set();
      this.transport = new GeoFsChatTransport((message, payload) => this.processChat(message, payload));
      this.lastHookCheck = 0;
      this.unsubscribers = [];
    }

    start() {
      this.transport.ensureHook();
      const overlay = this.combat.overlay;
      if (!overlay) return;
      this.unsubscribers.push(
        overlay.registerLayer('multiplayer', 40, (ctx, f) => this.updateAndDrawNetworkMissiles(ctx, f)),
        overlay.onAircraftChange(() => { this.networkMissiles = []; })
      );
    }

    stop() {
      this.transport.stop();
      for (const unsubscribe of this.unsubscribers) unsubscribe();
      this.unsubscribers = [];
      this.networkMissiles = [];
    }

    saveSettings() {
      CombatMath.writeStorage(STORAGE_KEY, { enabled: this.enabled, group: this.group });
    }

    rememberEvent(key) {
      this.receivedNetworkEvents.add(key);
      if (this.receivedNetworkEvents.size > 500) {
        this.receivedNetworkEvents.delete(this.receivedNetworkEvents.values().next().value);
      }
    }

    // ---- Protocol ----

    groupFingerprint() {
      let hash = 2166136261;
      for (let i = 0; i < this.group.length; i++) {
        hash ^= this.group.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    }

    encodeEvent(eventData) {
      if (!Array.isArray(eventData)) return '';
      const prefix = `${CHAT_PREFIX}${this.groupFingerprint()}|`;
      if (eventData[1] === 'T') return `${prefix}T|${Date.now().toString(36)}`;
      if (eventData[1] === 'L' && eventData[0] === 3) {
        const [, , missileId, targetId, sentAt] = eventData;
        if (typeof missileId !== 'string' || typeof targetId !== 'string') return '';
        const sentAtToken = typeof sentAt === 'string' ? sentAt : Number(sentAt).toString(36);
        if (!/^[0-9a-z]+$/i.test(sentAtToken)) return '';
        return prefix + ['L', encodeURIComponent(missileId), encodeURIComponent(targetId), sentAtToken].join('|');
      }
      if ((eventData[1] === 'H' || eventData[1] === 'X' || eventData[1] === 'D') && eventData.length === 5) {
        const [, type, missileId, targetId, sentAt] = eventData;
        if (typeof missileId !== 'string' || typeof targetId !== 'string' || !Number.isFinite(sentAt)) return '';
        return prefix + [type, encodeURIComponent(missileId), encodeURIComponent(targetId), sentAt.toString(36)].join('|');
      }
      return '';
    }

    parseEvent(value) {
      const fields = value.split('|');
      const type = fields[0];
      if (type === 'T' && fields.length === 2) {
        const sentAt = Number.parseInt(fields[1], 36);
        return Number.isFinite(sentAt) ? [1, 'T', sentAt] : null;
      }
      if (type === 'L' && fields.length === 4) {
        const sentAt = Number.parseInt(fields[3], 36);
        if (!Number.isFinite(sentAt)) return null;
        return [3, 'L', decodeURIComponent(fields[1]), decodeURIComponent(fields[2]), sentAt];
      }
      if ((type === 'H' || type === 'X' || type === 'D') && fields.length === 4) {
        const sentAt = Number.parseInt(fields[3], 36);
        if (!Number.isFinite(sentAt)) return null;
        return [1, type, decodeURIComponent(fields[1]), decodeURIComponent(fields[2]), sentAt];
      }
      return null;
    }

    /** GeoFS may URL-encode chat text once or twice; decode up to two times. */
    normalizeChatText(value) {
      let text = String(value ?? '');
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const decoded = decodeURIComponent(text.replace(/\+/g, '%20'));
          if (decoded === text) break;
          text = decoded;
        } catch (error) {
          break;
        }
      }
      return text;
    }

    /** Sends a sync event; resolves to false when sync is disabled or sending failed. */
    async sendEvent(eventData) {
      if (!this.enabled || this.group.length < GROUP_LENGTH) return false;
      try {
        const message = this.encodeEvent(eventData);
        if (!message) return false;
        return this.transport.send(message);
      } catch (error) {
        this.combat.notify(error.message || 'MULTIPLAYER EVENT COULD NOT BE SENT', 3000);
        return false;
      }
    }

    getUser(userId) {
      const users = window.multiplayer?.visibleUsers;
      if (!users || typeof users !== 'object') return null;
      const id = String(userId);
      for (const [key, user] of Object.entries(users)) {
        if ([key, user?.id, user?.uid].some((value) => value != null && String(value) === id)) return user;
      }
      return null;
    }

    getUserLabel(userId) {
      const user = this.getUser(userId);
      const label = user?.callsign ?? user?.cs ?? user?.aircraftName ?? user?.username;
      return label ? String(label).slice(0, 20) : `PLAYER ${String(userId).slice(0, 12)}`;
    }

    processChat(message, payload) {
      if (!this.enabled || this.group.length < GROUP_LENGTH) return;
      const senderId = String(message?.uid ?? '');
      const selfId = this.transport.getSelfId(payload);
      if (!senderId || (selfId && senderId === selfId)) return;

      const chatText = this.normalizeChatText(message?.msg);
      if (!chatText.startsWith(CHAT_PREFIX)) return;
      const groupSeparator = chatText.indexOf('|', CHAT_PREFIX.length);
      if (groupSeparator < 0) return;
      if (chatText.slice(CHAT_PREFIX.length, groupSeparator) !== this.groupFingerprint()) return;
      const messageKey = `${senderId}:${chatText}`;
      if (this.seenChatMessages.has(messageKey)) return;
      this.seenChatMessages.add(messageKey);
      if (this.seenChatMessages.size > 500) {
        this.seenChatMessages.delete(this.seenChatMessages.values().next().value);
      }

      try {
        const data = this.parseEvent(chatText.slice(groupSeparator + 1));
        if (!data) throw new Error('Malformed sync event');
        this.processEvent(data, senderId, selfId);
      } catch (error) {
        this.combat.notify(`INVALID SYNC CHAT MESSAGE (${chatText.length} CHARS)`, 3000);
      }
    }

    isFresh(sentAt) {
      return Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) <= EVENT_FRESH_MS;
    }

    processEvent(data, senderId, selfId) {
      if (!this.enabled || !Array.isArray(data)) return;
      const type = data[1];

      if (type === 'T') {
        this.combat.notify('MULTIPLAYER SYNC TEST RECEIVED', 3000);
        return;
      }

      const [, , missileId, targetId, sentAt] = data;
      if (typeof missileId !== 'string' || !this.isFresh(sentAt)) return;
      const key = `${senderId}:${missileId}`;

      if (type === 'L') {
        // A launch aimed at the local player: spawn a visible incoming missile.
        if (data[0] !== 3 || !selfId || String(targetId) !== selfId) return;
        if (this.receivedNetworkEvents.has(`L:${key}`)) return;
        const coordinates = this.getUser(senderId)?.lastUpdate?.co;
        const own = geofs.aircraft.instance?.llaLocation;
        if (!Array.isArray(coordinates) || coordinates.length < 3 || !Array.isArray(own) || own.length < 3) return;
        const [lat, lon, altitude] = coordinates.map(Number);
        if (![lat, lon, altitude].every(Number.isFinite)) return;
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, altitude);
        const targetPosition = Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]);
        const direction = Cesium.Cartesian3.subtract(targetPosition, position, new Cesium.Cartesian3());
        const distance = Cesium.Cartesian3.magnitude(direction);
        if (!Number.isFinite(distance) || distance <= 0) return;
        Cesium.Cartesian3.normalize(direction, direction);
        Cesium.Cartesian3.multiplyByScalar(direction, 900, direction);
        this.rememberEvent(`L:${key}`);
        this.networkMissiles.push({
          key, senderId, missileId, position,
          velocity: [direction.x, direction.y, direction.z],
          speed: 900,
          turnRate: 1.2,
          maxFlightTime: Math.min(240, Math.max(8, distance / 700 + 10)),
          t0: performance.now(),
          updatedAt: performance.now(),
          trail: []
        });
        if (this.networkMissiles.length > MAX_NETWORK_MISSILES) this.networkMissiles.shift();
        this.combat.notify(`MISSILE LAUNCHED BY ${this.getUserLabel(senderId)}`, 2500);
        return;
      }

      if (type === 'H') {
        if (String(targetId) !== selfId) return;
        if (this.receivedNetworkEvents.has(`D:${key}`) || this.receivedNetworkEvents.has(`H:${key}`)) return;
        this.rememberEvent(`H:${key}`);
        this.networkMissiles = this.networkMissiles.filter((missile) => missile.key !== key);
        this.sharedHits++;
        const own = geofs.aircraft.instance?.llaLocation;
        if (Array.isArray(own) && own.length >= 3) {
          this.combat.overlay?.addImpact(Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]));
        }
        this.combat.notify(`MISSILE HIT FROM ${this.getUserLabel(senderId)}`, 3500);
        return;
      }

      if (type === 'D') {
        // The evading player reports its own id as the target of the original launch.
        if (String(targetId) !== senderId) return;
        const evadeKey = `D:${key}`;
        if (this.receivedNetworkEvents.has(evadeKey)) return;
        const projectile = this.combat.projectile;
        const missile = projectile?.missiles.find((item) =>
          item.networkId === missileId && String(item.targetId) === senderId);
        if (!missile) return;
        this.rememberEvent(evadeKey);
        projectile.missiles = projectile.missiles.filter((item) => item !== missile);
        this.combat.overlay?.addImpact(CombatMath.worldPosition(missile.enuMat, missile.position));
        this.combat.notify(`${this.getUserLabel(senderId)} EVADED MISSILE WITH FLARES`, 3000);
        return;
      }

      if (type === 'X') {
        if (String(targetId) !== selfId) return;
        this.networkMissiles = this.networkMissiles.filter((missile) => missile.key !== key);
      }
    }

    /**
     * Removes the incoming network missiles (flares worked) and reports them as
     * evaded. Returns { count, promise } where the promise resolves to the number
     * of evade messages that were sent.
     */
    evadeIncomingMissiles() {
      const now = performance.now();
      const incoming = this.networkMissiles.filter((missile) => now - missile.t0 < missile.maxFlightTime * 1000);
      if (!incoming.length) return null;
      const selfId = this.transport.getSelfId();
      const sends = incoming.map((missile) => {
        this.rememberEvent(`D:${missile.key}`);
        if (!this.enabled || !selfId) return Promise.resolve(false);
        return this.sendEvent([1, 'D', missile.missileId, selfId, Date.now()]);
      });
      this.networkMissiles = this.networkMissiles.filter((missile) => !incoming.includes(missile));
      return {
        count: incoming.length,
        promise: Promise.all(sends).then((results) => results.filter(Boolean).length)
      };
    }

    // ---- Incoming missile simulation ----

    updateAndDrawNetworkMissiles(ctx, f) {
      if (f.nowMs - this.lastHookCheck > 1000) {
        this.lastHookCheck = f.nowMs;
        this.transport.ensureHook();
        this.mountOptions();
      }
      if (!this.enabled || !this.networkMissiles.length) return;
      const own = geofs.aircraft.instance.llaLocation;
      if (!Array.isArray(own) || own.length < 3) return;
      const now = f.nowMs;
      const ownWorld = Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]);
      const live = [];

      for (const missile of this.networkMissiles) {
        const age = (now - missile.t0) / 1000;
        if (age > missile.maxFlightTime + 5) continue;
        const dt = Math.min(0.25, Math.max(0, (now - missile.updatedAt) / 1000));
        const previousPosition = missile.position;
        const delta = Cesium.Cartesian3.subtract(ownWorld, previousPosition, new Cesium.Cartesian3());
        const distance = Cesium.Cartesian3.magnitude(delta);
        let nextPosition = previousPosition;
        if (distance > 0 && dt > 0) {
          missile.velocity = turnVelocity(missile.velocity, [delta.x, delta.y, delta.z], missile.turnRate * dt);
          const speed = Math.hypot(...missile.velocity) || 1;
          missile.velocity = mul(missile.velocity, missile.speed / speed);
          nextPosition = Cesium.Cartesian3.add(previousPosition,
            Cesium.Cartesian3.multiplyByScalar(new Cesium.Cartesian3(...missile.velocity), dt, new Cesium.Cartesian3()),
            new Cesium.Cartesian3());
        }
        if (age > 0.15 && dt > 0) {
          const segment = Cesium.Cartesian3.subtract(nextPosition, previousPosition, new Cesium.Cartesian3());
          const segmentSquared = Cesium.Cartesian3.dot(segment, segment);
          const toTarget = Cesium.Cartesian3.subtract(ownWorld, previousPosition, new Cesium.Cartesian3());
          const closestFraction = segmentSquared > 0
            ? Math.max(0, Math.min(1, Cesium.Cartesian3.dot(toTarget, segment) / segmentSquared))
            : 0;
          const closestPoint = Cesium.Cartesian3.add(previousPosition,
            Cesium.Cartesian3.multiplyByScalar(segment, closestFraction, new Cesium.Cartesian3()),
            new Cesium.Cartesian3());
          if (Cesium.Cartesian3.distance(closestPoint, ownWorld) <= NETWORK_HIT_RADIUS_M) {
            const hitKey = `H:${missile.key}`;
            if (!this.receivedNetworkEvents.has(hitKey)) {
              this.rememberEvent(hitKey);
              this.sharedHits++;
              f.overlay.addImpact(Cesium.Cartesian3.clone(ownWorld), now);
              this.combat.notify(`MISSILE HIT FROM ${this.getUserLabel(missile.senderId)}`, 3500);
            }
            continue;
          }
        }
        missile.position = nextPosition;
        missile.updatedAt = now;
        missile.trail.push(Cesium.Cartesian3.clone(nextPosition));
        if (missile.trail.length > 18) missile.trail.shift();
        live.push(missile);

        ctx.save();
        ctx.strokeStyle = '#ff4545';
        ctx.fillStyle = '#ff4545';
        ctx.shadowColor = '#ff2020';
        ctx.shadowBlur = 9;
        ctx.lineWidth = 2.5;
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
        const point = f.overlay.worldToScreen(f.scene, missile.position, true);
        if (point) {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      this.networkMissiles = live;
    }

    // ---- Options -> General UI ----

    mountOptions() {
      const mounted = CombatMath.ensureGeneralFieldset('addon-combat-mp', 'Combat Multiplayer');
      if (!mounted || mounted.controls.dataset.built) return;
      mounted.controls.dataset.built = '1';
      this.buildOptions(mounted.controls);
    }

    buildOptions(container) {
      const label = document.createElement('label');
      Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 6px' });
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = this.enabled;
      enabledInput.setAttribute('aria-label', 'Enable multiplayer missile sync');
      enabledInput.addEventListener('change', () => {
        this.enabled = enabledInput.checked;
        this.saveSettings();
        if (!this.enabled) this.networkMissiles = [];
        this.combat.notify(`MULTIPLAYER MISSILE SYNC ${this.enabled ? 'ON' : 'OFF'}`, 2000);
      });
      label.append(enabledInput, document.createTextNode('Enable multiplayer missile sync'));

      const groupLabel = document.createElement('label');
      Object.assign(groupLabel.style, { display: 'flex', alignItems: 'center', gap: '8px' });
      groupLabel.appendChild(document.createTextNode('Sync group code'));
      const groupInput = document.createElement('input');
      groupInput.type = 'text';
      groupInput.value = this.group;
      groupInput.maxLength = GROUP_LENGTH;
      groupInput.autocomplete = 'off';
      groupInput.spellcheck = false;
      groupInput.placeholder = 'share the same 16-character code';
      groupInput.setAttribute('aria-label', 'Multiplayer missile sync group code');
      groupInput.addEventListener('change', () => {
        const value = groupInput.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, GROUP_LENGTH);
        if (groupInput.value !== value) groupInput.value = value;
        this.group = value;
        this.saveSettings();
      });
      groupLabel.appendChild(groupInput);

      const generateButton = CombatMath.makeButton('Generate Group Code', 'Generate a random sync group code', () => {
        this.group = crypto.randomUUID().replace(/-/g, '').slice(0, GROUP_LENGTH);
        groupInput.value = this.group;
        this.saveSettings();
      });
      const testButton = CombatMath.makeButton('Send Sync Test', 'Send a multiplayer sync test message', async () => {
        if (!this.enabled) {
          this.combat.notify('ENABLE MULTIPLAYER SYNC FIRST', 2500);
          return;
        }
        if (this.group.length < GROUP_LENGTH) {
          this.combat.notify('SET A 16-CHARACTER SYNC GROUP CODE', 2500);
          return;
        }
        if (await this.sendEvent([1, 'T', Date.now()])) {
          this.combat.notify('SYNC TEST SENT IN PUBLIC GEOFS CHAT', 3000);
        }
      });
      const buttons = document.createElement('div');
      Object.assign(buttons.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0' });
      buttons.append(generateButton, testButton);

      const note = document.createElement('p');
      note.style.margin = '6px 0';
      note.textContent = 'Both players need the same 16-character group code and updated addon. Lock a radar contact with Enter before launching a missile; Backspace releases flares and reports an evade for synced incoming missiles. Sync messages are plain text in public GeoFS chat; anyone can read them. The group fingerprint only filters messages.';
      container.append(label, groupLabel, buttons, note);
    }
  }

  window.GeoFsChatTransport = GeoFsChatTransport;
  window.MultiplayerModule = MultiplayerModule;
})();


  class ChecklistModule {
    static loadDefaults(presetName = 'fighter') {
      const defaultsApi = window.ChecklistModuleDefaults;
      const createFromDefaults = defaultsApi?.createModule;
      if (typeof createFromDefaults !== 'function') {
        return null;
      }
      const module = createFromDefaults(presetName);
      return module instanceof ChecklistModule ? module : null;
    }

    constructor(dependencies = {}) {
      this.dependencies = dependencies ?? {};
      this.types = ['PROC', 'EMER', 'OPS', 'FLP'];
      this.checklistsByType = Object.create(null);
      this.currentIndexByType = Object.create(null);

      for (const type of this.types) {
        this.checklistsByType[type] = [];
        this.currentIndexByType[type] = 0;
      }
    }

    registerMfdPages(mfdModule) {
      mfdModule.registerPage({
        title: 'CHK',
        leftButtons: [
          {
            key: 'PREV',
            label: 'PREV',
            states: [''],
            stateIndex: 0,
            managedExternally: true,
            onClick: () => {
              const type = OptionModule.getOption('CHK', 'TYPE', 'PROC');
              this.prevChecklist(type);
            }
          },
          { key: 'N/A1', label: '', states: [''], stateIndex: 0 },
          { key: 'ALL', label: 'SHOW', states: ['ONE', 'ALL'], stateIndex: 0 },
          { key: 'N/A2', label: '', states: [''], stateIndex: 0 },
          {
            key: 'TYPE',
            label: 'TYPE',
            states: ['PROC', 'EMER', 'OPS', 'FLP'],
            stateIndex: 0,
            onClick: ({ nextState }) => {
              OptionModule.setOption('CHK', 'ALL', 'ALL');
              this.setCurrentIndex(nextState, 0);
            }
          },
        ],
        rightButtons: [
          {
            key: 'NEXT',
            label: 'NEXT',
            states: [''],
            stateIndex: 0,
            managedExternally: true,
            onClick: () => {
              const type = OptionModule.getOption('CHK', 'TYPE', 'PROC');
              this.nextChecklist(type);
            }
          },
          { key: 'N/A3', label: '', states: [''], stateIndex: 0 },
          { key: 'N/A31', label: '', states: [''], show: () => { return OptionModule.getOption('CHK', 'ALL', 'ONE') !== 'ONE'; }, stateIndex: 0 },
          {
            key: 'CHECK_ITEM',
            label: 'CHK',
            states: [''],
            stateIndex: 0,
            managedExternally: true,
            show: () => { return OptionModule.getOption('CHK', 'ALL', 'ONE') === 'ONE'; },
            onClick: () => {
              const type = OptionModule.getOption('CHK', 'TYPE', 'PROC');
              this.markNextCurrentItem(type);
            }
          },
          {
            key: 'RESET',
            label: 'RST',
            states: [''],
            stateIndex: 0,
            managedExternally: true,
            onClick: () => {
              const isAllMode = OptionModule.getOption('CHK', 'ALL', 'ONE') === 'ALL';
              const type = OptionModule.getOption('CHK', 'TYPE', 'PROC');

              if (isAllMode) {
                this.resetType(type);
                return;
              }

              this.resetCurrent(type);
            }
          },
          {
            key: 'COMPLETE',
            label: 'DONE',
            states: [''],
            stateIndex: 0,
            managedExternally: true,
            onClick: () => {
              const isAllMode = OptionModule.getOption('CHK', 'ALL', 'ONE') === 'ALL';
              const type = OptionModule.getOption('CHK', 'TYPE', 'PROC');

              if (isAllMode) {
                this.toggleCurrentCompleted(type);
                this.nextChecklistNoWrap(type);
                return;
              }

              this.setCurrentCompleted(type, true);
              this.nextChecklistNoWrap(type);
            }
          },
        ],
        lines: [],
        render: (renderer, renderContext) => {
          const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
          const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
          const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
          const color = renderContext?.color ?? '#00ff66';
          if (!ctx) return;

          const selectedType = OptionModule.getOption('CHK', 'TYPE', 'PROC');
          const showAll = OptionModule.getOption('CHK', 'ALL', 'ONE') === 'ALL';
          const checklists = this.getChecklists(selectedType);

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.textBaseline = 'middle';
          const contentX = w * 0.22;
          const textPx = Math.round(h * 0.045);

          ctx.textAlign = 'left';
          ctx.font = `bold ${textPx}px monospace`;
          ctx.fillText(`TYPE ${selectedType}  MODE ${showAll ? 'ALL' : 'ONE'}`, contentX, h * 0.16);

          if (!checklists.length) {
            ctx.font = `bold ${textPx}px monospace`;
            ctx.fillText('NO CHECKLISTS', contentX, h * 0.24);
            ctx.restore();
            return;
          }

          if (showAll) {
            const startX = contentX;
            const startY = h * 0.22;
            const rowStep = h * 0.062;
            const boxSize = h * 0.032;

            ctx.textAlign = 'left';
            ctx.font = `bold ${textPx}px monospace`;

            for (let i = 0; i < checklists.length; i++) {
              const rowY = startY + i * rowStep;
              if (rowY > h * 0.88) break;

              const checklist = checklists[i];
              ctx.strokeRect(startX, rowY - boxSize * 0.5, boxSize, boxSize);
              if (checklist?.completed) {
                ctx.fillRect(startX + 2, rowY - boxSize * 0.5 + 2, Math.max(0, boxSize - 4), Math.max(0, boxSize - 4));
              }

              const currentMark = i === this.getCurrentIndex(selectedType) ? '>' : ' ';
              ctx.fillText(`${currentMark} ${checklist?.title ?? `Checklist ${i + 1}`}`, startX + boxSize + w * 0.02, rowY);
            }
          } else {
            const current = this.getCurrentChecklist(selectedType);
            const completedTag = current?.completed ? '[X]' : '[ ]';

            ctx.textAlign = 'left';
            ctx.font = `bold ${textPx}px monospace`;
            ctx.fillText(`${completedTag} ${current?.title ?? 'Checklist'}`, contentX, h * 0.24);

            ctx.textAlign = 'left';
            ctx.font = `bold ${textPx}px monospace`;
            const items = Array.isArray(current?.items) ? current.items : [];
            const itemCompleted = this.getCurrentItemCompleted(selectedType);
            let y = h * 0.295;
            for (let i = 0; i < items.length; i++) {
              if (y > h * 0.88) break;
              const marker = itemCompleted[i] ? 'v' : '-';
              ctx.fillText(`${marker} ${items[i]}`, contentX, y);
              y += h * 0.055;
            }
          }

          ctx.restore();
        }
      });
      return true;
    }

    getTypeList(type) {
      const list = this.checklistsByType[type];
      if (!Array.isArray(list)) {
        throw new Error(`Unsupported checklist type: ${type}`);
      }
      return list;
    }

    ensureItemStates(checklist) {
      const states = checklist.itemCompleted;
      if (!Array.isArray(states) || states.length !== checklist.items.length) {
        throw new Error('Checklist itemCompleted must be an array matching items length');
      }
      return states;
    }

    addChecklist(definition) {
      const type = definition.type;
      const list = this.getTypeList(type);

      const title = String(definition?.title ?? '').trim();
      if (!title) return false;

      const items = Array.isArray(definition?.items)
        ? definition.items.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];

      const id = String(definition?.id ?? `${type}-${list.length + 1}`);
      const checklist = {
        id,
        type,
        title,
        items,
        itemCompleted: Array.isArray(definition?.itemCompleted)
          ? definition.itemCompleted.slice(0, items.length)
          : new Array(items.length).fill(false),
        completed: Boolean(definition?.completed)
      };

      this.ensureItemStates(checklist);
      if (checklist.completed && checklist.itemCompleted.length) {
        checklist.itemCompleted = checklist.itemCompleted.map(() => true);
      }

      list.push(checklist);

      const idx = this.currentIndexByType[type] ?? 0;
      this.currentIndexByType[type] = Math.max(0, Math.min(idx, list.length - 1));
      return true;
    }

    getChecklists(type) {
      return this.getTypeList(type);
    }

    getCurrentIndex(type) {
      const list = this.getChecklists(type);
      if (!list.length) return 0;
      const idx = Number(this.currentIndexByType[type]);
      if (!Number.isFinite(idx)) return 0;
      return Math.max(0, Math.min(list.length - 1, Math.floor(idx)));
    }

    setCurrentIndex(type, index) {
      const list = this.getChecklists(type);
      if (!list.length) {
        this.currentIndexByType[type] = 0;
        return 0;
      }
      const idx = Number(index);
      const clamped = Number.isFinite(idx)
        ? Math.max(0, Math.min(list.length - 1, Math.floor(idx)))
        : 0;
      this.currentIndexByType[type] = clamped;
      return clamped;
    }

    nextChecklist(type) {
      const list = this.getChecklists(type);
      if (!list.length) return null;
      const next = (this.getCurrentIndex(type) + 1) % list.length;
      this.currentIndexByType[type] = next;
      return list[next];
    }

    prevChecklist(type) {
      const list = this.getChecklists(type);
      if (!list.length) return null;
      const next = (this.getCurrentIndex(type) - 1 + list.length) % list.length;
      this.currentIndexByType[type] = next;
      return list[next];
    }

    getCurrentChecklist(type) {
      const list = this.getChecklists(type);
      if (!list.length) return null;
      return list[this.getCurrentIndex(type)] ?? null;
    }

    hasNextChecklist(type) {
      const list = this.getChecklists(type);
      if (!list.length) return false;
      return this.getCurrentIndex(type) < (list.length - 1);
    }

    nextChecklistNoWrap(type) {
      const list = this.getChecklists(type);
      if (!list.length) return null;

      const current = this.getCurrentIndex(type);
      if (current >= list.length - 1) {
        return list[current] ?? null;
      }

      const next = current + 1;
      this.currentIndexByType[type] = next;
      return list[next] ?? null;
    }

    setCurrentCompleted(type, completed) {
      const checklist = this.getCurrentChecklist(type);
      if (!checklist) return false;
      const nextCompleted = Boolean(completed);
      checklist.completed = nextCompleted;

      const states = this.ensureItemStates(checklist);
      for (let i = 0; i < states.length; i++) {
        states[i] = nextCompleted;
      }

      return true;
    }

    toggleCurrentCompleted(type) {
      const checklist = this.getCurrentChecklist(type);
      if (!checklist) return false;
      return this.setCurrentCompleted(type, !checklist.completed);
    }

    getCurrentItemCompleted(type) {
      const checklist = this.getCurrentChecklist(type);
      if (!checklist) return [];
      return this.ensureItemStates(checklist);
    }

    markNextCurrentItem(type) {
      const checklist = this.getCurrentChecklist(type);
      if (!checklist) return false;

      const states = this.ensureItemStates(checklist);
      const nextItemIndex = states.findIndex((value) => !value);
      if (nextItemIndex < 0) {
        if (states.length) {
          checklist.completed = true;
        }
        return false;
      }

      states[nextItemIndex] = true;
      checklist.completed = states.length > 0 && states.every(Boolean);
      return true;
    }

    resetCurrent(type) {
      return this.setCurrentCompleted(type, false);
    }

    resetType(type) {
      const list = this.getChecklists(type);
      for (const checklist of list) {
        checklist.completed = false;
        this.ensureItemStates(checklist).fill(false);
      }
      this.currentIndexByType[type] = 0;
      return true;
    }
  }



class DataCartridgeModule {
  static FOO_AREA_STYLE = { color: '#f44336', fillColor: '#f44336', fillOpacity: 0.16 };

  static AREA_STYLE_BY_TYPE = {
    SAM: { color: '#ff5252', fillColor: '#ff5252', fillOpacity: 0.18 },
    NOFLY: { color: '#ff9800', fillColor: '#ff9800', fillOpacity: 0.16 },
    UNRESTRICTED: { color: '#4caf50', fillColor: '#4caf50', fillOpacity: 0.12 },
    DANGER: { color: '#9c27b0', fillColor: '#9c27b0', fillOpacity: 0.16 },
    AREA: { color: '#03a9f4', fillColor: '#03a9f4', fillOpacity: 0.14 }
  };

  static MARKPOINT_COLOR_BY_TYPE = {
    TARGET: '#f44336',
    FRIENDLY: '#2196f3',
    RESQUE: '#ff9800',
    CIVILIAN: '#4caf50'
  };

  static NAVAID_COLOR_BY_MISSION_TYPE = {
    CIVILIAN: '#4caf50',
    FOO: '#f44336',
    FRIEND: '#2196f3',
    ALTERNATE: '#ff9800'
  };

  constructor() {
    this.data = this._newData();
  }

  _newData() {
    return {
      version: 1,
      source: 'empty',
      missionName: 'Untitled',
      group: '',
      flight: '',
      wingman: '',
      flightData: {
        startTimeZ: '',
        startTaxiZ: '',
        startToZ: '',
        timeOverTargetZ: '',
        endTimeZ: ''
      },
      positions: [],
      cruise: {
        altitude: '',
        speed: ''
      },
      notes: '',
      landing: {
        airportIcao: '',
        runway: '',
        nav1: '',
        pattern: '',
        formation: '',
        altEntryAgl: '',
        speedEntryKn: '',
        pitchIntervalS: '',
        speedDownwindKn: ''
      },
      loadedAt: null,
      flightPlan: [],
      navaids: [],
      markpoints: [],
      areas: [],
      checklists: [],
      iffCodes: []
    };
  }

  _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  _nextMarkpointId() {
    if (!Array.isArray(this.data?.markpoints) || !this.data.markpoints.length) return 1;
    return this.data.markpoints.reduce((maxId, item) => Math.max(maxId, Number(item?.id) || 0), 0) + 1;
  }

  _emitUpdate() {
    window.dispatchEvent(new CustomEvent('GeoFSDataCartridge:updated', {
      detail: this.getMissionData()
    }));
  }

  clear() {
    this.data = this._newData();
    this._emitUpdate();
    return true;
  }

  loadMissionData(missionData, options = {}) {
    const src = missionData;
    const loadedAt = new Date().toISOString();

    const normalized = this._newData();
    normalized.source = options.source ?? 'mission-planner';
    normalized.missionName = src.name ?? src.missionName ?? 'Untitled';
    normalized.group = src.group ?? '';
    normalized.flight = src.flight ?? '';
    normalized.wingman = src.wingman ?? '';
    normalized.flightData = this._clone(src.flightData ?? normalized.flightData);
    normalized.positions = this._clone(src.positions ?? []);
    normalized.cruise = this._clone(src.cruise ?? normalized.cruise);
    normalized.notes = src.notes ?? src.cruise?.notes ?? '';
    normalized.landing = this._clone(src.landing ?? normalized.landing);
    normalized.loadedAt = loadedAt;
    normalized.flightPlan = this._clone(src.flightPlan ?? []);
    normalized.checklists = this._clone(src.checklists ?? []);
    normalized.iffCodes = this._clone(src.iffCodes ?? []);
    normalized.navaids = this._clone(src.navaids ?? []);
    normalized.markpoints = this._clone(src.markpoints ?? []);
    normalized.areas = this._clone(src.areas ?? []).sort((a, b) => a.order - b.order);

    this.data = normalized;
    this._emitUpdate();
    return true;
  }

  addTgpMarkpoint(point, options = {}) {
    const nextId = this._nextMarkpointId();
    const markpoint = {
      id: nextId,
      name: options.name ?? `TGP Markpoint ${nextId}`,
      abbreviation: options.abbreviation ?? `TGP${nextId}`,
      type: options.type ?? 'TARGET',
      lat: point.lat,
      lon: point.lon,
      altM: point.altM ?? null,
      source: 'TGP'
    };

    this.data.markpoints.push(markpoint);
    this._emitUpdate();
    return this._clone(markpoint);
  }

  setMarkpointType(index, type) {
    const markpoint = this.data.markpoints[index];
    if (!markpoint) return false;
    markpoint.type = type;
    this._emitUpdate();
    return true;
  }

  setActiveMarkpoint(index) {
    if (!this.data.markpoints[index]) return false;
    for (let i = 0; i < this.data.markpoints.length; i++) {
      this.data.markpoints[i].active = i === index;
    }
    this._emitUpdate();
    return true;
  }

  getActiveMarkpoint() {
    const active = this.data.markpoints.find((markpoint) => markpoint?.active);
    return active ? this._clone(active) : null;
  }

  deleteMarkpoint(index) {
    if (!this.data.markpoints[index]) return false;
    this.data.markpoints.splice(index, 1);
    this._emitUpdate();
    return true;
  }

  getMissionData() {
    return this._clone(this.data);
  }

  getMissionName() {
    return this.data.missionName;
  }

  getGroup() {
    return this.data.group;
  }

  getFlight() {
    return this.data.flight;
  }

  getWingman() {
    return this.data.wingman;
  }

  getFlightData() {
    return this._clone(this.data.flightData);
  }

  getPositions() {
    return this._clone(this.data.positions);
  }

  getCruise() {
    return this._clone(this.data.cruise);
  }

  getNotes() {
    return this.data.notes ?? '';
  }

  getLanding() {
    return this._clone(this.data.landing);
  }

  getFlightPlan() {
    return this._clone(this.data.flightPlan);
  }

  getNavaids() {
    return this._clone(this.data.navaids);
  }

  getMarkpoints() {
    return this._clone(this.data.markpoints);
  }

  getAreas() {
    return this._clone(this.data.areas);
  }

  getChecklists() {
    return this._clone(this.data.checklists);
  }

  getIffCodes() {
    return this._clone(this.data.iffCodes);
  }

  getRenderableData() {
    const data = this.getMissionData();
    return {
      missionName: data.missionName,
      loadedAt: data.loadedAt,
      navaids: data.navaids,
      markpoints: data.markpoints,
      areas: data.areas
    };
  }

  getAreaStyle(type, group = '') {
    if (group === 'FOO') {
      return this._clone(DataCartridgeModule.FOO_AREA_STYLE);
    }
    return this._clone(DataCartridgeModule.AREA_STYLE_BY_TYPE[type] ?? DataCartridgeModule.AREA_STYLE_BY_TYPE.AREA);
  }

  getMarkpointColor(type) {
    return DataCartridgeModule.MARKPOINT_COLOR_BY_TYPE[type] ?? '#00bcd4';
  }

  getNavaidColor(missionType) {
    return DataCartridgeModule.NAVAID_COLOR_BY_MISSION_TYPE[missionType ?? 'FRIEND'] ?? '#2196f3';
  }
}

window.DataCartridgeModule = DataCartridgeModule;


  class NavModule {
      constructor(mapModule = null, dataCartridgeModule = null) {
        this.mapModule = mapModule;
        this.dataCartridgeModule = dataCartridgeModule;
      }

    setMapModule(mapModule) {
      this.mapModule = mapModule;
      return this;
    }

    setDataCartridgeModule(dataCartridgeModule) {
      this.dataCartridgeModule = dataCartridgeModule;
      return this;
    }

    registerMfdPages(mfdModule) {
      mfdModule.registerPage({
        title: 'NAV',
        leftButtons: [
          { key: 'DISPLAY', label: 'DISP', states: ['HSI', 'MAP'], stateIndex: 0 },
          { key: 'DECLUTTER', label: 'DCL', states: ['OFF', 'L1', 'L2'], stateIndex: 0 },
          {
            key: 'MARK',
            label: 'MRK',
            states: ['', 'FRND', 'CIV', 'UNKN', 'FOO'],
            values: ['', 'FRIEND', 'CIVILIAN', 'UNKNOWN', 'FOO'],
            stateIndex: 0,
            managedExternally: true,
            show() { return OptionModule.getOption('NAV', 'DISPLAY', 'HSI') === 'MAP'; },
            onClick: () => {
              this.mapModule.cycleSelectedTrafficMark();
            }
          },
          {
            key: 'SHOW',
            label: 'SHOW',
            states: ['', 'FRND', 'CIV', 'UNKN', 'FOO'],
            values: ['', 'FRIEND', 'CIVILIAN', 'UNKNOWN', 'FOO'],
            stateIndex: 0,
            managedExternally: true,
            show() { return OptionModule.getOption('NAV', 'DISPLAY', 'HSI') === 'MAP'; },
            onClick: () => {
              this.mapModule.cycleShowFilter();
            }
          },
          {
            key: 'VIEW',
            label: 'VW',
            states: ['A/C F/W', 'A/C CNT', 'A/C N', 'TGT', 'TGT N'],
            stateIndex: 0,
            managedExternally: true,
            show: () => OptionModule.getOption('NAV', 'DISPLAY', 'HSI') === 'MAP',
            onClick: () => {
              this.mapModule.cycleViewMode();
            }
          },
          { key: 'N/A', label: '', states: [''], stateIndex: 0 },
          {
            key: 'WPSEL',
            label: '↑',
            states: [''],
            stateIndex: 0,
            minimal: true,
            managedExternally: true,
            combinedGroupLabel: 'WP',
            show() { return OptionModule.getOption('NAV', 'DISPLAY', 'HSI') === 'HSI'; },
            onClick: () => {
              this.stepSelectedFlightPlanWaypoint(1);
            }
          },
          {
            key: 'WPSEL',
            label: '↓',
            states: [''],
            stateIndex: 0,
            minimal: true,
            managedExternally: true,
            combinedGroupLabel: 'WP',
            show() { return OptionModule.getOption('NAV', 'DISPLAY', 'HSI') === 'HSI'; },
            onClick: () => {
              this.stepSelectedFlightPlanWaypoint(-1);
            }
          },
        ],
        rightButtons: [
          {
            key: 'RANGE',
            label: '↑',
            states: ['1', '2.5', '5', '10', '20', '40', '80', '160'],
            values: [1, 2.5, 5, 10, 20, 40, 80, 160],
            stateIndex: 5,
            managedExternally: true,
            minimal: true,
            combinedGroupLabel: 'RNG',
            onClick: () => {
              this.mapModule.stepRange(1);
            }
          },
          {
            key: 'RANGE',
            label: '↓',
            states: ['1', '2.5', '5', '10', '20', '40', '80', '160'],
            values: [1, 2.5, 5, 10, 20, 40, 80, 160],
            stateIndex: 5,
            managedExternally: true,
            minimal: true,
            combinedGroupLabel: 'RNG',
            onClick: () => {
              this.mapModule.stepRange(-1);
            }
          },
          {
            key: 'ACSEL',
            label: '→',
            states: ['A/C'],
            values: ['A/C'],
            stateIndex: 0,
            managedExternally: true,
            minimal: true,
            combinedGroupLabel: 'AC',
            onClick: () => {
              this.mapModule.stepSelectedTraffic(1);
            }
          },
          {
            key: 'ACSEL',
            label: '←',
            states: ['A/C'],
            values: ['A/C'],
            stateIndex: 0,
            managedExternally: true,
            minimal: true,
            combinedGroupLabel: 'AC',
            onClick: () => {
              this.mapModule.stepSelectedTraffic(-1);
            }
          },
          {
            key: 'CLEAR',
            label: 'CLR',
            states: [''],
            stateIndex: 0,
            managedExternally: true,
            onClick: () => {
              this.mapModule.clearSelectedTraffic();
            }
          }
        ],
        lines: [],
        render: (renderer, renderContext) => {
          const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
          const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
          const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
          const color = renderContext?.color ?? '#00ff66';
          if (!ctx) return;

          window.addonRuntime.navRdrRuntime = window.addonRuntime.navRdrRuntime || { bootStartMs: 0 };

          const engOn = Boolean(window.geofs?.animation?.values?.enginesOn);
          if (!engOn) {
            window.addonRuntime.navRdrRuntime.bootStartMs = 0;
          } else if (!window.addonRuntime.navRdrRuntime.bootStartMs) {
            window.addonRuntime.navRdrRuntime.bootStartMs = Date.now();
          }

          const elapsedMs = engOn ? (Date.now() - window.addonRuntime.navRdrRuntime.bootStartMs) : 0;
          const bootReady = engOn && elapsedMs >= 4000;

          const contentX = w * 0.19;
          const contentY = h * 0.13;
          const contentW = w * 0.62;
          const contentH = h * 0.74;

          const mode = OptionModule.getOptionValue('NAV', 'DISPLAY', 'HSI');
          const declutterLevel = OptionModule.getOptionValue('NAV', 'DECLUTTER', 'OFF');
          const radarEnabled = OptionModule.getOptionValue('RDR', 'RADAR', 'OFF') === 'ON';
          const radarScanMode = OptionModule.getOptionValue('RDR', 'SCAN', '6B');
          const radarConeHalfAngleDeg = radarScanMode === '3B' ? 15 : 30;

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (mode !== 'MAP') {
            ctx.fillStyle = '#000000';
            ctx.fillRect(contentX, contentY, contentW, contentH);
          }

          if (!engOn) {
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
            ctx.fillText('NAV OFF', contentX + contentW * 0.5, contentY + contentH * 0.5);
            ctx.restore();
            return;
          }

          if (!bootReady) {
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
            ctx.fillText('ALIGNING NAV...', contentX + contentW * 0.5, contentY + contentH * 0.5);
            ctx.restore();
            return;
          }

          const scene = this.mapModule.getSceneData();
          const rangeNm = Math.max(1, Number(scene?.rangeNm) || 40);
          const shouldShowTraffic = radarEnabled && declutterLevel !== 'L2';
          if (!shouldShowTraffic) {
            this.mapModule.clearSelectedTraffic();
          }
          const visibleTraffic = shouldShowTraffic ? this.mapModule.getFilteredTraffic(scene?.traffic ?? []) : [];
          const selectedTrafficUid = shouldShowTraffic ? this.mapModule.getSelectedTrafficUid(visibleTraffic) : null;
          const selectedTraffic = visibleTraffic.find((c) => String(c?.uid ?? '') === String(selectedTrafficUid ?? '')) ?? null;
          const dataCartridgeScene = this.getDataCartridgeScene();
          const waypointColor = '#3da2ff';
          const navObjectTextPx = Math.round(h * 0.032);

          const drawOwnshipSymbol = (x, y, size = 1, headingRelDeg = 0) => {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const fuselageHalf = h * 0.032 * size;
            const wingY = -h * 0.010 * size;
            const wingHalf = h * 0.028 * size;
            const tailY = h * 0.024 * size;
            const tailHalf = h * 0.014 * size;
            const angleRad = (Number(headingRelDeg) || 0) * Math.PI / 180;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angleRad);
            ctx.beginPath();
            ctx.moveTo(0, -fuselageHalf);
            ctx.lineTo(0, fuselageHalf);
            ctx.moveTo(-wingHalf, wingY);
            ctx.lineTo(wingHalf, wingY);
            ctx.moveTo(-tailHalf, tailY);
            ctx.lineTo(tailHalf, tailY);
            ctx.stroke();
            ctx.restore();
          };

          const drawRadarConeGuides = (x, y, headingRelDeg = 0, topLimitY = 0, maxLen = Infinity) => {
            if (!radarEnabled) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            for (const side of [-1, 1]) {
              const guideRad = (headingRelDeg + (side * radarConeHalfAngleDeg)) * Math.PI / 180;
              const gx = Math.sin(guideRad);
              const gy = -Math.cos(guideRad);
              const guideLen = Math.min(maxLen, (y - topLimitY) / Math.max(0.0001, -gy));
              ctx.moveTo(x, y);
              ctx.lineTo(x + gx * guideLen, y + gy * guideLen);
            }
            ctx.stroke();
          };

          const drawWaypointDiamond = (x, y, selected = false) => {
            const size = selected ? Math.max(5, h * 0.012) : Math.max(4, h * 0.010);
            if (selected) {
              ctx.fillStyle = waypointColor;
              ctx.beginPath();
              ctx.moveTo(x, y - size);
              ctx.lineTo(x + size, y);
              ctx.lineTo(x, y + size);
              ctx.lineTo(x - size, y);
              ctx.closePath();
              ctx.fill();
            }
            ctx.strokeStyle = waypointColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x - size, y);
            ctx.closePath();
            ctx.stroke();
          };

          const drawCartridgePoint = (x, y, pointColor, label = '', isMarkpoint = false) => {
            const radius = Math.max(3.5, h * 0.008);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.fillStyle = pointColor;

            if (isMarkpoint) {
              ctx.beginPath();
              ctx.moveTo(x, y - radius - 1);
              ctx.lineTo(x + radius, y + radius);
              ctx.lineTo(x - radius, y + radius);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }

            if (declutterLevel !== 'L2' && label) {
              ctx.fillStyle = pointColor;
              ctx.font = `bold ${Math.round(h * 0.026)}px monospace`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.slice(0, 10), x + w * 0.010, y - h * 0.012);
            }
          };

          const drawCartridgeAreaPath = (points, style) => {
            if (!Array.isArray(points) || points.length < 3) return;

            ctx.strokeStyle = style.color;
            ctx.lineWidth = 1.4;
            ctx.fillStyle = style.fillColor;
            ctx.globalAlpha = Number.isFinite(style.fillOpacity) ? style.fillOpacity : 0.12;
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
              const p = points[i];
              if (!p) continue;
              if (i === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
          };

          const drawTrafficContact = (x, y, contact, upHeadingDeg = Number(scene?.ownship?.heading) || 0) => {
            const isSelected = String(contact?.uid ?? '') === String(selectedTrafficUid ?? '');
            const trafficColor = this.mapModule.getTrafficColor(contact);

            if (declutterLevel === 'L1') {
              ctx.fillStyle = trafficColor;
              const boxSize = Math.max(8, Math.round(h * 0.018));
              ctx.fillRect(x - boxSize * 0.5, y - boxSize * 0.5, boxSize, boxSize);

              if (isSelected) {
                const pad = 2;
                const left = x - boxSize * 0.5 - pad;
                const right = x + boxSize * 0.5 + pad;
                const top = y - boxSize * 0.5 - pad;
                const bottom = y + boxSize * 0.5 + pad;
                const arm = Math.max(5, h * 0.012);
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(left, top + arm); ctx.lineTo(left, top); ctx.lineTo(left + arm, top);
                ctx.moveTo(right - arm, top); ctx.lineTo(right, top); ctx.lineTo(right, top + arm);
                ctx.moveTo(left, bottom - arm); ctx.lineTo(left, bottom); ctx.lineTo(left + arm, bottom);
                ctx.moveTo(right - arm, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - arm);
                ctx.stroke();
              }
              return;
            }

            const number = this.mapModule.getContactNumber(contact);
            const glyph = String(number);

            ctx.fillStyle = trafficColor;
            ctx.font = `bold ${navObjectTextPx}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, x, y);

            const numberHalfH = Math.max(h * 0.016, 8);
            const roofHalfW = Math.max(w * 0.022, 10);
            const roofY = y - numberHalfH - h * 0.007;
            const legLen = Math.max(h * 0.022, 10);

            ctx.strokeStyle = trafficColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - roofHalfW, roofY);
            ctx.lineTo(x + roofHalfW, roofY);
            ctx.moveTo(x - roofHalfW, roofY);
            ctx.lineTo(x - roofHalfW, roofY + legLen);
            ctx.moveTo(x + roofHalfW, roofY);
            ctx.lineTo(x + roofHalfW, roofY + legLen);
            ctx.stroke();

            const track = Number(contact?.trackDeg);
            const relTrackRad = Number.isFinite(track)
              ? ((track - upHeadingDeg) * Math.PI / 180)
              : 0;
            const dirX = Math.sin(relTrackRad);
            const dirY = -Math.cos(relTrackRad);
            const numberRadius = Math.max(h * 0.021, 11);
            const lineStart = numberRadius + 2;
            const lineLen = Math.max(h * 0.034, 16);

            ctx.beginPath();
            ctx.moveTo(x + dirX * lineStart, y + dirY * lineStart);
            ctx.lineTo(x + dirX * (lineStart + lineLen), y + dirY * (lineStart + lineLen));
            ctx.stroke();

            if (isSelected) {
              const pad = 2;
              const left = x - roofHalfW - pad;
              const right = x + roofHalfW + pad;
              const top = roofY - pad;
              const bottom = y + numberHalfH + pad;
              const arm = Math.max(5, h * 0.012);
              ctx.strokeStyle = '#ff3333';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(left, top + arm); ctx.lineTo(left, top); ctx.lineTo(left + arm, top);
              ctx.moveTo(right - arm, top); ctx.lineTo(right, top); ctx.lineTo(right, top + arm);
              ctx.moveTo(left, bottom - arm); ctx.lineTo(left, bottom); ctx.lineTo(left + arm, bottom);
              ctx.moveTo(right - arm, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - arm);
              ctx.stroke();
            }
          };

          const drawSelectedTrafficInfo = (anchorX, anchorY) => {
            if (!selectedTraffic) return;
            const infoColor = '#ff3333';
            const lineStep = h * 0.040;
            let y = anchorY;

            const name = String(selectedTraffic?.aircraftName ?? '').trim() || 'UNKNOWN';
            const callsign = String(selectedTraffic?.callsign ?? '').trim() || 'N/A';
            const speed = Number.isFinite(selectedTraffic?.speedKts) ? selectedTraffic.speedKts : '--';
            const altitude = Number.isFinite(selectedTraffic?.altFeet) ? selectedTraffic.altFeet : '--';
            const headingSel = Number.isFinite(selectedTraffic?.headingDeg) ? selectedTraffic.headingDeg : '--';
            const selectedNumber = this.mapModule.getContactNumber(selectedTraffic);

            ctx.fillStyle = infoColor;
            ctx.font = `bold ${Math.round(h * 0.040)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`TGT ${selectedNumber}`, anchorX, y);
            y += lineStep;
            ctx.fillText(`${name} / ${callsign}`.slice(0, 34), anchorX, y);
            y += lineStep;
            ctx.fillText(`SPD ${speed}`, anchorX, y);
            y += lineStep;
            ctx.fillText(`ALT ${altitude}`, anchorX, y);
            y += lineStep;
            ctx.fillText(`HDG ${headingSel}`, anchorX, y);
          };

          const drawRadarOffInfo = (anchorX, anchorY) => {
            if (radarEnabled || String(declutterLevel).toUpperCase() !== 'OFF') return;
            ctx.fillStyle = '#ffff33';
            ctx.font = `bold ${Math.round(h * 0.040)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Radar OFF', anchorX, anchorY);
          };

          if (mode === 'HSI') {
            const heading = Number(scene?.ownship?.heading) || Number(window.geofs?.animation?.values?.heading) || 0;
            const cx = contentX + contentW * 0.5;
            const compassShiftPx = h * 0.016;
            const cy = contentY + contentH * 0.525 + compassShiftPx;
            const radius = Math.min(contentW * 0.44, h * 0.305) + compassShiftPx;
            const navTextPx = Math.round(h * 0.040);
            const headingTextPx = Math.round(h * 0.046);
            const headingBoxW = w * 0.13;
            const headingBoxH = h * 0.060;
            const headingBoxY = Math.max(contentY + h * 0.002, cy - radius - h * 0.129);
            const navReadouts = this.getReadouts();
            const hasNavCourse = Number.isFinite(navReadouts.course);
            const courseDisplay = hasNavCourse ? ((navReadouts.course % 360) + 360) % 360 : null;
            const hasAutopilotHeading = Number.isFinite(navReadouts.autopilotHeading);
            const autopilotHeadingDisplay = hasAutopilotHeading ? ((navReadouts.autopilotHeading % 360) + 360) % 360 : null;

            const projectHsi = (point) => {
              const right = Number(point?.rightNm);
              const forward = Number(point?.forwardNm);
              if (!Number.isFinite(right) || !Number.isFinite(forward)) return null;
              return {
                x: cx + (right / rangeNm) * radius,
                y: cy - (forward / rangeNm) * radius
              };
            };

            for (let deg = 0; deg < 360; deg += 10) {
              const relRad = (deg - heading) * Math.PI / 180;
              const dotX = cx + Math.sin(relRad) * radius;
              const dotY = cy - Math.cos(relRad) * radius;
              const dotR = deg % 30 === 0 ? Math.max(1.8, h * 0.0038) : Math.max(1.2, h * 0.0026);

              const isCardinal = deg % 90 === 0;
              const hasLabel = deg % 30 === 0 && !(declutterLevel === 'L2' && !isCardinal);

              if (!hasLabel) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
                ctx.fill();
              }

              if (hasLabel) {
                const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(Math.round(deg / 10));
                ctx.fillStyle = color;
                ctx.font = `bold ${navTextPx}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, dotX, dotY);
              }
            }

            if (declutterLevel === 'OFF') {
              ctx.fillStyle = color;
              ctx.font = `bold ${navTextPx}px monospace`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              const kias = Number(window.geofs?.animation?.values?.kias) || 0;
              const topReadoutY = headingBoxY;
              const rowStepY = h * 0.052;
              const leftReadoutX = contentX + contentW * 0.025;
              const rightReadoutX = contentX + contentW * 0.725;

              ctx.fillText(`GND ${Math.round(kias * 1.05)}`, leftReadoutX, topReadoutY);
              ctx.fillText(`TAS ${Math.round(kias * 1.15)}`, leftReadoutX, topReadoutY + rowStepY);

              const dmeText = Number.isFinite(navReadouts.dme) ? String(navReadouts.dme) : '--';
              const navaidText = navReadouts.navaidLabel || '';
              ctx.fillText(`DME ${dmeText}`, rightReadoutX, topReadoutY);
              if (navaidText) {
                ctx.fillText(navaidText, rightReadoutX, topReadoutY + rowStepY);
              }
              ctx.textBaseline = 'middle';
            }

            const normalizeDeg = (value) => {
              const deg = Number(value);
              if (!Number.isFinite(deg)) return 0;
              return ((Math.round(deg) % 360) + 360) % 360;
            };
            const headingDisplay = normalizeDeg(window.geofs?.animation?.values?.heading360 ?? 0);

            if (hasNavCourse) {
              const getValue = window.geofs?.animation?.getValue?.bind(window.geofs?.animation);
              const navCourseDeviation = getValue
                ? (getValue('NAVCourseDeviation') ?? 0)
                : (window.geofs?.animation?.values?.NAVCourseDeviation ?? 0);
              const courseOffsetPx = HelperModule.clampValue(5 * navCourseDeviation, -100, 100) * (w / 512);

              const courseRelRad = (courseDisplay - heading) * Math.PI / 180;
              const dirX = Math.sin(courseRelRad);
              const dirY = -Math.cos(courseRelRad);
              const leftX = dirY;
              const leftY = -dirX;
              const signedOffset = -courseOffsetPx;
              const lineCenterX = cx + leftX * signedOffset;
              const lineCenterY = cy + leftY * signedOffset;
              const offsetAbs = Math.abs(signedOffset);
              const lineInset = Math.max(h * 0.016, 6);
              const lineRadius = Math.max(8, radius - lineInset);
              const clampedOffsetAbs = Math.min(offsetAbs, Math.max(0, lineRadius - 2));
              const halfLen = Math.sqrt(Math.max(0, (lineRadius * lineRadius) - (clampedOffsetAbs * clampedOffsetAbs)));

              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(lineCenterX - dirX * halfLen, lineCenterY - dirY * halfLen);
              ctx.lineTo(lineCenterX + dirX * halfLen, lineCenterY + dirY * halfLen);
              ctx.stroke();

              const arrowTipX = lineCenterX + dirX * halfLen;
              const arrowTipY = lineCenterY + dirY * halfLen;
              const arrowLen = Math.max(h * 0.028, 10);
              const arrowHalfW = Math.max(h * 0.013, 5);
              const arrowBaseX = arrowTipX - dirX * arrowLen;
              const arrowBaseY = arrowTipY - dirY * arrowLen;
              ctx.beginPath();
              ctx.moveTo(arrowTipX, arrowTipY);
              ctx.lineTo(arrowBaseX + leftX * arrowHalfW, arrowBaseY + leftY * arrowHalfW);
              ctx.lineTo(arrowBaseX - leftX * arrowHalfW, arrowBaseY - leftY * arrowHalfW);
              ctx.closePath();
              ctx.fillStyle = color;
              ctx.fill();
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.clip();

            const waypointPoints = [];
            for (const wp of (scene?.waypoints ?? [])) {
              const p = projectHsi(wp);
              if (!p) continue;
              waypointPoints.push({ ...p, wp });
            }

            const projectGeoToHsi = (lat, lon) => {
              const ownship = scene?.ownship;
              if (!ownship || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
              const relNm = this.mapModule.toRelativeNm(ownship, Number(lat), Number(lon));
              const framePoint = this.mapModule.toHeadingFrame(relNm, ownship.heading);
              return projectHsi(framePoint);
            };

            const sortedAreas = [...(dataCartridgeScene?.areas ?? [])]
              .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
            for (const area of sortedAreas) {
              const style = this.getAreaStyle(area);
              if (String(area?.variant).toUpperCase() === 'CIRCLE') {
                const center = Array.isArray(area?.center) ? area.center : null;
                const centerPt = center ? projectGeoToHsi(center[0], center[1]) : null;
                const radiusMeters = Number(area?.radius);
                if (!centerPt || !Number.isFinite(radiusMeters) || radiusMeters <= 0) continue;
                const radiusPx = (radiusMeters / 1852) / rangeNm * radius;
                ctx.fillStyle = style.fillColor;
                ctx.globalAlpha = Number.isFinite(style.fillOpacity) ? style.fillOpacity : 0.12;
                ctx.beginPath();
                ctx.arc(centerPt.x, centerPt.y, radiusPx, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = style.color;
                ctx.lineWidth = 1.4;
                ctx.stroke();
                continue;
              }

              const points = Array.isArray(area?.points) ? area.points : [];
              const projected = points.map((pt) => projectGeoToHsi(pt?.[0], pt?.[1])).filter(Boolean);
              drawCartridgeAreaPath(projected, style);
            }

            if (waypointPoints.length >= 2) {
              ctx.strokeStyle = waypointColor;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              for (let i = 0; i < waypointPoints.length; i++) {
                const p = waypointPoints[i];
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
              }
              ctx.stroke();
            }

            for (const p of waypointPoints) {
              drawWaypointDiamond(p.x, p.y, p.wp?.selected);
              if (declutterLevel !== 'L2') {
                ctx.fillStyle = waypointColor;
                ctx.font = `bold ${navObjectTextPx}px monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const wpName = String(p.wp?.ident ?? '').slice(0, 10);
                const wpIndex = Number(p.wp?.index) + 1;
                ctx.fillText(`WP${wpIndex}`, p.x + w * 0.010, p.y - h * 0.018);
                if (wpName) {
                  ctx.fillText(wpName, p.x + w * 0.010, p.y + h * 0.016);
                }
              }
            }

            for (const navaid of (dataCartridgeScene?.navaids ?? [])) {
              const p = projectGeoToHsi(navaid?.lat, navaid?.lon);
              if (!p) continue;
              const label = String(navaid?.ident ?? navaid?.icao ?? navaid?.name ?? '').trim();
              drawCartridgePoint(p.x, p.y, this.getNavaidColor(navaid?.missionType), label, false);
            }

            for (const markpoint of (dataCartridgeScene?.markpoints ?? [])) {
              const p = projectGeoToHsi(markpoint?.lat, markpoint?.lon);
              if (!p) continue;
              const label = String(markpoint?.abbreviation ?? markpoint?.name ?? '').trim();
              drawCartridgePoint(p.x, p.y, this.getMarkpointColor(markpoint?.type), label, true);
            }

            if (shouldShowTraffic) {
              for (const ac of visibleTraffic) {
                const p = projectHsi(ac);
                if (!p) continue;
                drawTrafficContact(p.x, p.y, ac);
              }
            }

            ctx.restore();

            const bottomReadoutY = cy + radius + h * 0.045;

            if (hasAutopilotHeading) {
              const hdgBugRelRad = (autopilotHeadingDisplay - heading) * Math.PI / 180;
              const radialOutX = Math.sin(hdgBugRelRad);
              const radialOutY = -Math.cos(hdgBugRelRad);
              const radialInX = -radialOutX;
              const radialInY = -radialOutY;
              const tangentX = Math.cos(hdgBugRelRad);
              const tangentY = Math.sin(hdgBugRelRad);

              const bugHalfW = Math.max(w * 0.024, 9);
              const bugHalfH = Math.max(h * 0.010, 4);
              const bugMargin = Math.max(h * 0.020, 7);
              const bugCenterRadius = radius + bugHalfH + bugMargin;
              const bugCx = cx + radialOutX * bugCenterRadius;
              const bugCy = cy + radialOutY * bugCenterRadius;
              const vHalf = Math.max(w * 0.0135, bugHalfW * 0.48);
              const vDepth = Math.max(h * 0.013, 4);

              const outerCx = bugCx + radialOutX * bugHalfH;
              const outerCy = bugCy + radialOutY * bugHalfH;
              const innerCx = bugCx + radialInX * bugHalfH;
              const innerCy = bugCy + radialInY * bugHalfH;

              const outerLeftX = outerCx - tangentX * bugHalfW;
              const outerLeftY = outerCy - tangentY * bugHalfW;
              const outerRightX = outerCx + tangentX * bugHalfW;
              const outerRightY = outerCy + tangentY * bugHalfW;
              const innerLeftX = innerCx - tangentX * bugHalfW;
              const innerLeftY = innerCy - tangentY * bugHalfW;
              const innerRightX = innerCx + tangentX * bugHalfW;
              const innerRightY = innerCy + tangentY * bugHalfW;

              const notchLeftX = outerCx - tangentX * vHalf;
              const notchLeftY = outerCy - tangentY * vHalf;
              const notchRightX = outerCx + tangentX * vHalf;
              const notchRightY = outerCy + tangentY * vHalf;
              const notchTipX = outerCx + radialInX * vDepth;
              const notchTipY = outerCy + radialInY * vDepth;

              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(outerLeftX, outerLeftY);
              ctx.lineTo(notchLeftX, notchLeftY);
              ctx.moveTo(notchRightX, notchRightY);
              ctx.lineTo(outerRightX, outerRightY);
              ctx.moveTo(outerLeftX, outerLeftY);
              ctx.lineTo(innerLeftX, innerLeftY);
              ctx.moveTo(outerRightX, outerRightY);
              ctx.lineTo(innerRightX, innerRightY);
              ctx.moveTo(innerLeftX, innerLeftY);
              ctx.lineTo(innerRightX, innerRightY);
              ctx.moveTo(notchLeftX, notchLeftY);
              ctx.lineTo(notchTipX, notchTipY);
              ctx.lineTo(notchRightX, notchRightY);
              ctx.stroke();
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;

            const markerHalf = headingBoxW * 0.11;
            const markerTipY = headingBoxY + headingBoxH + h * 0.020;
            const boxLeft = cx - headingBoxW * 0.5;
            const boxRight = cx + headingBoxW * 0.5;
            const boxTop = headingBoxY;
            const boxBottom = headingBoxY + headingBoxH;
            ctx.beginPath();
            ctx.moveTo(boxLeft, boxTop);
            ctx.lineTo(boxRight, boxTop);
            ctx.moveTo(boxLeft, boxTop);
            ctx.lineTo(boxLeft, boxBottom);
            ctx.moveTo(boxRight, boxTop);
            ctx.lineTo(boxRight, boxBottom);
            ctx.moveTo(boxLeft, boxBottom);
            ctx.lineTo(cx - markerHalf, boxBottom);
            ctx.moveTo(cx + markerHalf, boxBottom);
            ctx.lineTo(boxRight, boxBottom);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx - markerHalf, boxBottom);
            ctx.lineTo(cx, markerTipY);
            ctx.lineTo(cx + markerHalf, boxBottom);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = `bold ${headingTextPx}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(headingDisplay).padStart(3, '0'), cx, headingBoxY + headingBoxH * 0.5);

            ctx.fillStyle = color;
            ctx.font = `bold ${navTextPx}px monospace`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            if (declutterLevel === 'OFF' && hasAutopilotHeading) {
              ctx.fillText(`HDG ${String(autopilotHeadingDisplay).padStart(3, '0')}`, contentX + contentW * 0.025, bottomReadoutY);
            }
            ctx.textAlign = 'right';
            if (declutterLevel === 'OFF' && hasNavCourse) {
              ctx.fillText(`CRS ${courseDisplay}`, contentX + contentW * 0.975, bottomReadoutY);
            }

            drawRadarConeGuides(cx, cy, 0, contentY, radius);
            drawOwnshipSymbol(cx, cy, 1);
            if (!radarEnabled) {
              drawRadarOffInfo(cx, cy + h * 0.080);
            } else if (shouldShowTraffic) {
              drawSelectedTrafficInfo(cx, cy + h * 0.080);
            }
          } else {
            const layout = renderContext?.layout;
            const topTabs = Array.isArray(layout?.topTabs) ? layout.topTabs : [];
            const bottomTabs = Array.isArray(layout?.bottomTabs) ? layout.bottomTabs : [];
            const topStripBottom = topTabs.length
              ? Math.max(...topTabs.map((tab) => (tab?.y ?? 0) + (tab?.h ?? 0)))
              : (h * 0.11);
            const bottomStripTop = bottomTabs.length
              ? Math.min(...bottomTabs.map((tab) => tab?.y ?? h))
              : (h * 0.89);

            const mapLeft = 0;
            const mapRight = w;
            const mapTop = topStripBottom + h * 0.004;
            const mapBottom = bottomStripTop - h * 0.004;
            const mapW = mapRight - mapLeft;
            const mapH = mapBottom - mapTop;
            const mapViewFrame = this.mapModule.getMapViewFrame(scene, selectedTraffic);
            const anchorRatio = mapViewFrame?.anchor === 'center' ? 0.5 : (2 / 3);
            const anchorX = mapLeft + mapW * 0.5;
            const anchorY = mapTop + mapH * anchorRatio;
            const pxPerNm = Math.max(0.0001, (anchorY - mapTop) / rangeNm);
            const mapUpHeadingDeg = Number(mapViewFrame?.upHeadingDeg) || 0;

            const drawNorthArrow = () => {
              const arrowMargin = w * 0.185;
              const pivotX = mapRight - arrowMargin;
              const pivotY = arrowMargin;
              const shaftHalfLen = Math.max(h * 0.080, 32);
              const headLen = Math.max(h * 0.028, 12);
              const headHalfW = Math.max(w * 0.020, 8);
              const northRelRad = (0 - mapUpHeadingDeg) * Math.PI / 180;
              const dirX = Math.sin(northRelRad);
              const dirY = -Math.cos(northRelRad);
              const leftX = -dirY;
              const leftY = dirX;
              const textBgR = Math.max(h * 0.018, 9);
              const shaftGap = textBgR + 2;

              const tipX = pivotX + dirX * shaftHalfLen;
              const tipY = pivotY + dirY * shaftHalfLen;
              const tailX = pivotX - dirX * shaftHalfLen;
              const tailY = pivotY - dirY * shaftHalfLen;
              const baseX = tipX - dirX * headLen;
              const baseY = tipY - dirY * headLen;
              const nearTipGapX = pivotX + dirX * shaftGap;
              const nearTipGapY = pivotY + dirY * shaftGap;
              const nearTailGapX = pivotX - dirX * shaftGap;
              const nearTailGapY = pivotY - dirY * shaftGap;

              ctx.strokeStyle = color;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(nearTipGapX, nearTipGapY);
              ctx.lineTo(tipX, tipY);
              ctx.moveTo(tailX, tailY);
              ctx.lineTo(nearTailGapX, nearTailGapY);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(baseX + leftX * headHalfW, baseY + leftY * headHalfW);
              ctx.lineTo(baseX - leftX * headHalfW, baseY - leftY * headHalfW);
              ctx.closePath();
              ctx.fillStyle = color;
              ctx.fill();

              const textX = pivotX;
              const textY = pivotY;

              ctx.fillStyle = '#000000';
              ctx.beginPath();
              ctx.arc(textX, textY, textBgR, 0, Math.PI * 2);
              ctx.fill();

              ctx.strokeStyle = color;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(textX, textY, textBgR, 0, Math.PI * 2);
              ctx.stroke();

              ctx.fillStyle = color;
              ctx.font = `bold ${Math.round(h * 0.032)}px monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('N', textX, textY);
            };

            const projectMap = (point, latKey = 'lat', lonKey = 'lon') => {
              const projected = this.mapModule.projectToMapViewFrame(mapViewFrame, point?.[latKey], point?.[lonKey]);
              const right = Number(projected?.rightNm);
              const forward = Number(projected?.forwardNm);
              if (!Number.isFinite(right) || !Number.isFinite(forward)) return null;
              return {
                x: anchorX + right * pxPerNm,
                y: anchorY - forward * pxPerNm
              };
            };

            ctx.save();
            ctx.beginPath();
            ctx.rect(mapLeft, mapTop, mapW, mapH);
            ctx.clip();

            const waypointPoints = [];
            for (const wp of (scene?.waypoints ?? [])) {
              const p = projectMap(wp, 'lat', 'lon');
              if (!p) continue;
              waypointPoints.push({ ...p, wp });
            }

            const sortedAreas = [...(dataCartridgeScene?.areas ?? [])]
              .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));
            for (const area of sortedAreas) {
              const style = this.getAreaStyle(area);
              if (String(area?.variant).toUpperCase() === 'CIRCLE') {
                const center = Array.isArray(area?.center) ? area.center : null;
                const centerPt = center ? projectMap({ lat: center[0], lon: center[1] }, 'lat', 'lon') : null;
                const radiusMeters = Number(area?.radius);
                if (!centerPt || !Number.isFinite(radiusMeters) || radiusMeters <= 0) continue;
                const radiusPx = (radiusMeters / 1852) * pxPerNm;
                ctx.fillStyle = style.fillColor;
                ctx.globalAlpha = Number.isFinite(style.fillOpacity) ? style.fillOpacity : 0.12;
                ctx.beginPath();
                ctx.arc(centerPt.x, centerPt.y, radiusPx, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = style.color;
                ctx.lineWidth = 1.4;
                ctx.stroke();
                continue;
              }

              const points = Array.isArray(area?.points) ? area.points : [];
              const projected = points
                .map((pt) => projectMap({ lat: pt?.[0], lon: pt?.[1] }, 'lat', 'lon'))
                .filter(Boolean);
              drawCartridgeAreaPath(projected, style);
            }

            if (waypointPoints.length >= 2) {
              ctx.strokeStyle = waypointColor;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              for (let i = 0; i < waypointPoints.length; i++) {
                const p = waypointPoints[i];
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
              }
              ctx.stroke();
            }

            for (const p of waypointPoints) {
              drawWaypointDiamond(p.x, p.y, p.wp?.selected);
              if (declutterLevel !== 'L2') {
                ctx.fillStyle = waypointColor;
                ctx.font = `bold ${navObjectTextPx}px monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const wpName = String(p.wp?.ident ?? '').slice(0, 10);
                const wpIndex = Number(p.wp?.index) + 1;
                ctx.fillText(`WP${wpIndex}`, p.x + w * 0.010, p.y - h * 0.018);
                if (wpName) {
                  ctx.fillText(wpName, p.x + w * 0.010, p.y + h * 0.016);
                }
              }
            }

            for (const navaid of (dataCartridgeScene?.navaids ?? [])) {
              const p = projectMap(navaid, 'lat', 'lon');
              if (!p) continue;
              const label = String(navaid?.ident ?? navaid?.icao ?? navaid?.name ?? '').trim();
              drawCartridgePoint(p.x, p.y, this.getNavaidColor(navaid?.missionType), label, false);
            }

            for (const markpoint of (dataCartridgeScene?.markpoints ?? [])) {
              const p = projectMap(markpoint, 'lat', 'lon');
              if (!p) continue;
              const label = String(markpoint?.abbreviation ?? markpoint?.name ?? '').trim();
              drawCartridgePoint(p.x, p.y, this.getMarkpointColor(markpoint?.type), label, true);
            }

            if (shouldShowTraffic) {
              for (const ac of visibleTraffic) {
                const p = projectMap(ac, 'lat', 'lon');
                if (!p) continue;
                drawTrafficContact(p.x, p.y, ac, mapUpHeadingDeg);
              }
            }

            const ownshipPoint = projectMap(scene?.ownship, 'lat', 'lon');
            if (ownshipPoint) {
              const ownshipHeading = Number(scene?.ownship?.heading) || 0;
              const ownshipRelHeading = ownshipHeading - mapUpHeadingDeg;
              drawRadarConeGuides(ownshipPoint.x, ownshipPoint.y, ownshipRelHeading, mapTop);
              drawOwnshipSymbol(ownshipPoint.x, ownshipPoint.y, 1, ownshipRelHeading);
            }
            if (!radarEnabled) {
              drawRadarOffInfo(anchorX, anchorY + h * 0.080);
            } else if (shouldShowTraffic) {
              drawSelectedTrafficInfo(anchorX, anchorY + h * 0.080);
            }

            drawNorthArrow();
            ctx.restore();
          }

          ctx.restore();
        }
      });
      return true;
    }

    getDataCartridgeModule() {
      if (this.dataCartridgeModule) return this.dataCartridgeModule;
      return window.BasePlugin?.getActiveAddon?.()?.dataCartridge ?? null;
    }

    getDataCartridgeScene() {
      const cartridge = this.getDataCartridgeModule();
      const data = cartridge?.getRenderableData?.() ?? cartridge?.getMissionData?.() ?? {};

      return {
        navaids: Array.isArray(data?.navaids) ? data.navaids : [],
        markpoints: Array.isArray(data?.markpoints) ? data.markpoints : [],
        areas: Array.isArray(data?.areas) ? data.areas : []
      };
    }

    getAreaStyle(areaOrType, maybeGroup = '') {
      const type = typeof areaOrType === 'object' && areaOrType
        ? areaOrType.type
        : areaOrType;
      const group = typeof areaOrType === 'object' && areaOrType
        ? areaOrType.group
        : maybeGroup;

      const cartridge = this.getDataCartridgeModule();
      if (cartridge?.getAreaStyle) {
        return cartridge.getAreaStyle(type, group);
      }

      if (String(group ?? '').toUpperCase() === 'FOO') {
        return { color: '#f44336', fillColor: '#f44336', fillOpacity: 0.16 };
      }

      const fallback = {
        SAM: { color: '#ff5252', fillColor: '#ff5252', fillOpacity: 0.18 },
        NOFLY: { color: '#ff9800', fillColor: '#ff9800', fillOpacity: 0.16 },
        UNRESTRICTED: { color: '#4caf50', fillColor: '#4caf50', fillOpacity: 0.12 },
        DANGER: { color: '#9c27b0', fillColor: '#9c27b0', fillOpacity: 0.16 },
        AREA: { color: '#03a9f4', fillColor: '#03a9f4', fillOpacity: 0.14 }
      };
      return fallback[type] ?? fallback.AREA;
    }

    getMarkpointColor(type) {
      const cartridge = this.getDataCartridgeModule();
      if (cartridge?.getMarkpointColor) {
        return cartridge.getMarkpointColor(type);
      }

      const fallback = {
        TARGET: '#f44336',
        FRIENDLY: '#2196f3',
        RESQUE: '#ff9800',
        CIVILIAN: '#4caf50'
      };
      return fallback[type] ?? '#00bcd4';
    }

    getNavaidColor(missionType) {
      const cartridge = this.getDataCartridgeModule();
      if (cartridge?.getNavaidColor) {
        return cartridge.getNavaidColor(missionType);
      }

      const fallback = {
        CIVILIAN: '#4caf50',
        FOO: '#f44336',
        FRIEND: '#2196f3',
        ALTERNATE: '#ff9800'
      };
      return fallback[missionType ?? 'FRIEND'] ?? '#2196f3';
    }

    // Returns the currently selected GeoFS NAV unit.
    getCurrentNavUnit() {
      return window.geofs?.nav?.currentNAVUnit ?? null;
    }

    // Returns rounded DME distance in NM when available.
    getDmeValue(navUnit = this.getCurrentNavUnit()) {
      const raw = Number(navUnit?.DME);
      if (!Number.isFinite(raw)) return null;
      return Math.round(raw * 10) / 10;
    }

    // Returns rounded bearing in degrees when available.
    getBearingDeg(navUnit = this.getCurrentNavUnit()) {
      const raw = Number(navUnit?.bearing);
      return Number.isFinite(raw) ? Math.round(raw) : null;
    }

    // Returns rounded NAV course in degrees when available.
    getCourseDeg(navUnit = this.getCurrentNavUnit()) {
      const raw = Number(navUnit?.course);
      return Number.isFinite(raw) ? Math.round(raw) : null;
    }

    // Returns time-to-signal in minutes when available.
    getTimeToSignal(navUnit = this.getCurrentNavUnit()) {
      const raw = Number(navUnit?.timeToSignal);
      return Number.isFinite(raw) ? Math.round(raw) : null;
    }

    // Returns autopilot heading/course selector in degrees when available.
    getAutopilotHeadingDeg() {
      const raw = Number(window.geofs?.autopilot?.values?.course);
      return Number.isFinite(raw) ? Math.round(raw) : null;
    }

    // Returns FOO visibility setting from the RDR page.
    getFooVisibilityMode() {
      return OptionModule.getOptionValue('RDR', 'FOO', 'SH');
    }

    // Returns true when contacts with callsign FOO should be hidden.
    shouldHideFooContacts() {
      return this.getFooVisibilityMode() === 'HD';
    }

    // Returns true when a callsign equals Foo.
    isFooCallsign(callsign) {
      return callsign === 'Foo';
    }

    // Returns true when one traffic contact is allowed by current FOO filter.
    isTrafficContactVisible(callsign) {
      if (!this.shouldHideFooContacts()) return true;
      return !this.isFooCallsign(callsign);
    }

    // Filters a multiplayer user list using the FOO visibility setting.
    filterMultiplayerContacts(users) {
      const list = Array.isArray(users) ? users : [];
      return list.filter((user) => this.isTrafficContactVisible(user?.callsign ?? user?.cs));
    }

    // Formats navaid type + identifier for HUD/MFD display.
    getNavaidTypeLabel(navUnit = this.getCurrentNavUnit()) {
      if (navUnit?.navaid?.type === 'ILS') {
        const icao = navUnit?.navaid?.icao ?? '';
        return `ILS ${icao}`.trim();
      }
      if (navUnit?.navaid?.type === 'VORTAC') {
        const ident = navUnit?.navaid?.ident ?? navUnit?.navaid?.icao ?? '';
        return `VOR ${ident}`.trim();
      }

      const type = String(navUnit?.navaid?.type ?? '').trim();
      let ident = navUnit?.navaid?.ident;
      if (!ident) {
        ident = navUnit?.navaid?.icao ?? '';
      }
      const identText = String(ident ?? '').trim();
      return `${type} ${identText}`.trim();
    }

    // Returns all commonly rendered NAV readouts as a single object.
    getReadouts(navUnit = this.getCurrentNavUnit()) {
      return {
        navUnit,
        dme: this.getDmeValue(navUnit),
        bearing: this.getBearingDeg(navUnit),
        course: this.getCourseDeg(navUnit),
        timeToSignal: this.getTimeToSignal(navUnit),
        navaidLabel: this.getNavaidTypeLabel(navUnit),
        autopilotHeading: this.getAutopilotHeadingDeg()
      };
    }

    // Selects next/previous flightplan waypoint relative to current selection.
    stepSelectedFlightPlanWaypoint(step = 1) {
      const direction = Number(step) >= 0 ? 1 : -1;
      const flightPlan = window.geofs?.flightPlan;
      const waypointArray = flightPlan?.waypointArray;

      if (!Array.isArray(waypointArray) || waypointArray.length === 0) return false;
      if (typeof flightPlan?.selectWaypoint !== 'function') return false;

      const currentIndex = waypointArray.findIndex((waypoint) => waypoint?.selected === true);
      const baseIndex = currentIndex >= 0
        ? currentIndex
        : (direction > 0 ? -1 : 0);
      const nextIndex = (baseIndex + direction + waypointArray.length) % waypointArray.length;

      flightPlan.selectWaypoint(nextIndex);
      return true;
    }
  }

  class MapModule {
    static RANGE_OPTIONS_NM = [1, 2.5, 5, 10, 20, 40, 80, 160];
    static MARK_STATES = ['', 'FRIEND', 'CIVILIAN', 'UNKNOWN', 'FOO'];
    static SHOW_STATES = ['ALL', 'UNM', 'FRIEND', 'CIVILIAN', 'UNKNOWN', 'FOO'];
    static VIEW_MODES = ['A/C F/W', 'A/C CNT', 'A/C N', 'TGT', 'TGT N'];
    static TRAFFIC_STALE_TIMEOUT_MS = 10000;

    constructor(navModule = null) {
      this.navModule = navModule;
      this.selectedTrafficUid = null;
      this.trafficSelectionCleared = false;
      this.trafficMarksByUid = Object.create(null);
      this.showFilter = 'ALL';
      this.trafficContactsByUid = Object.create(null);
    }

    setNavModule(navModule) {
      this.navModule = navModule;
      return this;
    }

    // Returns the configured NAV range in NM.
    getRangeNm() {
      const raw = Number(OptionModule.getOptionValue('NAV', 'RANGE', 40));
      return this.normalizeRangeNm(raw);
    }

    // Clamps a raw range to the nearest configured NAV range value.
    normalizeRangeNm(rawRange) {
      return Number(rawRange);
    }

    // Stores a normalized NAV range value.
    setRangeNm(range) {
      OptionModule.setOption('NAV', 'RANGE', String(range));
      return range;
    }

    // Steps NAV range up (+1) or down (-1) through configured range options.
    stepRange(step = 0) {
      const direction = Number(step) >= 0 ? 1 : -1;
      const current = this.getRangeNm();
      const options = MapModule.RANGE_OPTIONS_NM;
      const idx = Math.max(0, options.indexOf(current));
      const nextIndex = HelperModule.clampValue(idx + direction, 0, options.length - 1);
      return this.setRangeNm(options[nextIndex]);
    }

    // Returns true when radar-driven traffic should be active.
    isRadarEnabled() {
      return OptionModule.getOptionValue('RDR', 'RADAR', 'OFF') === 'ON';
    }

    // Gets currently active NAV MAP view mode.
    getViewMode() {
      return OptionModule.getOptionValue('NAV', 'VIEW', 'A/C F/W');
    }

    // Sets NAV MAP view mode.
    setViewMode(mode) {
      OptionModule.setOption('NAV', 'VIEW', mode);
      return mode;
    }

    // Cycles NAV MAP view mode.
    cycleViewMode() {
      const modes = MapModule.VIEW_MODES;
      const current = this.getViewMode();
      const idx = Math.max(0, modes.indexOf(current));
      const next = modes[(idx + 1) % modes.length];
      return this.setViewMode(next);
    }

    // Returns frame configuration for NAV MAP projection.
    getMapViewFrame(scene, selectedTraffic = null) {
      const mode = this.getViewMode();
      const ownship = scene?.ownship;
      const ownHeading = Number(ownship?.heading) || 0;

      const selectedLat = Number(selectedTraffic?.lat);
      const selectedLon = Number(selectedTraffic?.lon);
      const hasSelectedPosition = Number.isFinite(selectedLat) && Number.isFinite(selectedLon);

      let centerLat = Number(ownship?.lat);
      let centerLon = Number(ownship?.lon);
      let anchor = 'forward';
      let upHeadingDeg = ownHeading;

      if (mode === 'A/C CNT') {
        anchor = 'center';
      } else if (mode === 'A/C N') {
        anchor = 'center';
        upHeadingDeg = 0;
      } else if (mode === 'TGT') {
        anchor = 'center';
        if (hasSelectedPosition) {
          centerLat = selectedLat;
          centerLon = selectedLon;
        }
      } else if (mode === 'TGT N') {
        anchor = 'center';
        upHeadingDeg = 0;
        if (hasSelectedPosition) {
          centerLat = selectedLat;
          centerLon = selectedLon;
        }
      }

      if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
        return null;
      }

      return {
        mode,
        anchor,
        centerLat,
        centerLon,
        upHeadingDeg
      };
    }

    // Projects one lat/lon point to the active NAV MAP frame.
    projectToMapViewFrame(frame, lat, lon) {
      if (!frame) return null;
      const targetLat = Number(lat);
      const targetLon = Number(lon);
      if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return null;

      const relativeNm = this.toRelativeNm({ lat: frame.centerLat, lon: frame.centerLon }, targetLat, targetLon);
      if (!relativeNm) return null;
      return this.toHeadingFrame(relativeNm, frame.upHeadingDeg);
    }

    // Returns ownship geodetic position and heading.
    getOwnshipState() {
      const lla = window.geofs?.aircraft?.instance?.llaLocation;
      if (!Array.isArray(lla) || !Number.isFinite(lla[0]) || !Number.isFinite(lla[1])) {
        return null;
      }

      const heading = Number(window.geofs?.animation?.values?.heading);
      return {
        lat: Number(lla[0]) || 0,
        lon: Number(lla[1]) || 0,
        alt: Number(lla[2]) || 0,
        heading: Number.isFinite(heading) ? heading : 0
      };
    }

    // Normalizes heading to [0..359].
    normalizeHeadingDeg(value) {
      const deg = Number(value);
      if (!Number.isFinite(deg)) return null;
      return ((Math.round(deg) % 360) + 360) % 360;
    }

    // Converts target lat/lon to north/east offsets (NM) from ownship.
    toRelativeNm(ownship, targetLat, targetLon) {
      if (!ownship || !Number.isFinite(targetLat) || !Number.isFinite(targetLon)) {
        return null;
      }

      const latAvgRad = ((ownship.lat + targetLat) * 0.5) * (Math.PI / 180);
      const northMeters = (targetLat - ownship.lat) * 110540;
      const eastMeters = (targetLon - ownship.lon) * 111320 * Math.cos(latAvgRad);

      return {
        northNm: northMeters / 1852,
        eastNm: eastMeters / 1852
      };
    }

    // Converts north/east offsets to heading-relative forward/right offsets (NM).
    toHeadingFrame(relativeNm, headingDeg) {
      if (!relativeNm) return null;
      const hdgRad = (Number(headingDeg) || 0) * (Math.PI / 180);
      const sinH = Math.sin(hdgRad);
      const cosH = Math.cos(hdgRad);

      return {
        forwardNm: relativeNm.northNm * cosH + relativeNm.eastNm * sinH,
        rightNm: -relativeNm.northNm * sinH + relativeNm.eastNm * cosH
      };
    }

    // Returns the contacts of the A/A combat simulation (bandits), if it is running.
    getCombatContacts() {
      try {
        const addon = typeof BasePlugin !== 'undefined' ? BasePlugin.getActiveAddon() : null;
        return addon?.combat?.aaCombat?.getNpcContacts?.() ?? [];
      } catch (error) {
        return [];
      }
    }

    // Returns visible multiplayer aircraft in heading-relative coordinates.
    getTrafficContacts(ownship) {
      if (!ownship) return [];
      const users = Object.values(window.multiplayer?.visibleUsers ?? {});
      const nowMs = Date.now();

      for (const user of users) {
        if (this.navModule && !this.navModule.isTrafficContactVisible(user?.callsign ?? user?.cs)) continue;

        const co = user?.lastUpdate?.co;
        if (!Array.isArray(co) || !Number.isFinite(co[0]) || !Number.isFinite(co[1])) continue;

        const uid = String(user?.id ?? user?.uid ?? '').trim();
        if (!uid) continue;

        this.trafficContactsByUid[uid] = {
          uid,
          aircraftName: String(user?.aircraftName ?? '').trim(),
          callsign: String(user?.callsign ?? user?.cs ?? '').trim(),
          lat: Number(co[0]) || 0,
          lon: Number(co[1]) || 0,
          alt: Number(co[2]) || 0,
          speedKts: Number.isFinite(Number(user?.lastUpdate?.st?.as)) ? Math.round(Number(user.lastUpdate.st.as)) : null,
          headingDeg: this.normalizeHeadingDeg(co[3]),
          trackDeg: this.normalizeHeadingDeg(co[3]),
          lastSeenMs: nowMs
        };
      }

      // Simulated A/A bandits are tracked like multiplayer aircraft so NAV/RDR can show and lock them.
      const npcContacts = this.getCombatContacts();
      const npcUids = new Set();
      for (const npc of npcContacts) {
        const uid = String(npc.id);
        npcUids.add(uid);
        if (this.navModule && !this.navModule.isTrafficContactVisible(npc.callsign)) continue;
        this.trafficContactsByUid[uid] = {
          uid,
          isNpc: true,
          aircraftName: 'BANDIT',
          callsign: String(npc.callsign ?? 'BANDIT'),
          lat: npc.lat,
          lon: npc.lon,
          alt: npc.alt,
          speedKts: Number.isFinite(npc.speedKts) ? npc.speedKts : null,
          headingDeg: this.normalizeHeadingDeg(npc.headingDeg),
          trackDeg: this.normalizeHeadingDeg(npc.headingDeg),
          lastSeenMs: nowMs
        };
      }
      for (const uid of Object.keys(this.trafficContactsByUid)) {
        if (this.trafficContactsByUid[uid]?.isNpc && !npcUids.has(uid)) delete this.trafficContactsByUid[uid];
      }

      const result = [];

      for (const uid of Object.keys(this.trafficContactsByUid)) {
        const cached = this.trafficContactsByUid[uid];
        if (!cached) continue;

        const ageMs = nowMs - Number(cached.lastSeenMs || 0);
        if (!Number.isFinite(ageMs) || ageMs > MapModule.TRAFFIC_STALE_TIMEOUT_MS) {
          delete this.trafficContactsByUid[uid];
          if (String(this.selectedTrafficUid ?? '') === String(uid)) {
            this.selectedTrafficUid = null;
            this.trafficSelectionCleared = true;
          }
          continue;
        }

        const relNm = this.toRelativeNm(ownship, Number(cached.lat), Number(cached.lon));
        const frameNm = this.toHeadingFrame(relNm, ownship.heading);
        if (!frameNm) continue;

        result.push({
          uid: cached.uid,
          aircraftName: cached.aircraftName,
          callsign: cached.callsign,
          lat: cached.lat,
          lon: cached.lon,
          alt: cached.alt,
          altFeet: Number.isFinite(Number(cached.alt)) ? Math.round(Number(cached.alt) * 3.28084) : null,
          speedKts: cached.speedKts,
          isNpc: !!cached.isNpc,
          headingDeg: cached.headingDeg,
          trackDeg: cached.trackDeg,
          ...frameNm
        });
      }

      result.sort((a, b) => {
        const ta = this.getTrafficSortToken(a);
        const tb = this.getTrafficSortToken(b);
        return ta.localeCompare(tb);
      });

      return result;
    }

    // Builds a deterministic traffic key.
    getTrafficKey(contact) {
      return String(contact?.uid || contact?.callsign || `${contact?.lat ?? ''}:${contact?.lon ?? ''}`);
    }

    // Returns a deterministic contact number for one aircraft.
    // Uses last 2 digits of the aircraft ID.
    getContactNumber(contact) {
      const aircraftId = String(contact?.id ?? contact?.uid ?? '').trim();
      if (!aircraftId) return 0;

      // Extract last 2 digits from aircraft id
      const numericPart = aircraftId.replace(/\D/g, ''); // Remove non-digits
      if (!numericPart) return 0;
      
      const lastTwo = numericPart.slice(-2);
      return Number(lastTwo) || 0;
    }

    // Token used to keep traffic ordering stable.
    getTrafficSortToken(contact) {
      const number = this.getContactNumber(contact);
      return `${String(number).padStart(3, '0')}:${this.getTrafficKey(contact)}`;
    }

    // Returns selected traffic uid (falls back to first visible contact).
    getSelectedTrafficUid(contacts = []) {
      const list = Array.isArray(contacts) ? contacts : [];
      if (!list.length) {
        this.selectedTrafficUid = null;
        return null;
      }

      const hasCurrent = this.selectedTrafficUid && list.some((c) => String(c?.uid) === String(this.selectedTrafficUid));
      if (hasCurrent) return this.selectedTrafficUid;

      if (this.trafficSelectionCleared) {
        return null;
      }

      this.selectedTrafficUid = list[0]?.uid ? String(list[0].uid) : null;
      return this.selectedTrafficUid;
    }

    // Returns mark state for a contact uid.
    getTrafficMark(uid) {
      const key = String(uid ?? '');
      if (!key) return '';
      return this.trafficMarksByUid[key] || '';
    }

    // Sets mark state for one contact uid.
    setTrafficMark(uid, markState) {
      const key = String(uid ?? '');
      if (!key) return '';
      const normalized = markState || '';
      if (!normalized) {
        delete this.trafficMarksByUid[key];
        return '';
      }
      this.trafficMarksByUid[key] = normalized;
      return normalized;
    }

    // Cycles mark state for currently selected traffic target.
    cycleSelectedTrafficMark() {
      const scene = this.getSceneData();
      const contacts = this.getTrafficInRange(this.getFilteredTraffic(scene?.traffic ?? []), scene?.rangeNm);
      const uid = this.getSelectedTrafficUid(contacts);
      if (!uid) return '';

      const current = this.getTrafficMark(uid);
      const states = MapModule.MARK_STATES;
      const idx = Math.max(0, states.indexOf(current));
      const next = states[(idx + 1) % states.length] ?? '';
      return this.setTrafficMark(uid, next);
    }

    // Returns selected traffic mark state.
    getSelectedTrafficMark() {
      const scene = this.getSceneData();
      const contacts = this.getTrafficInRange(this.getFilteredTraffic(scene?.traffic ?? []), scene?.rangeNm);
      const uid = this.getSelectedTrafficUid(contacts);
      if (!uid) return '';
      return this.getTrafficMark(uid);
    }

    // Gets color for one traffic contact based on mark state.
    getTrafficColor(contact) {
      const mark = this.getTrafficMark(contact?.uid);
      if (mark === 'FRIEND') return '#3da2ff';
      if (mark === 'CIVILIAN') return '#33ff66';
      if (mark === 'UNKNOWN') return '#ffff33';
      if (mark === 'FOO') return '#ff3333';
      return '#ffffff';
    }

    // Gets currently active traffic show filter.
    getShowFilter() {
      return this.showFilter || 'ALL';
    }

    // Sets traffic show filter.
    setShowFilter(value) {
      this.showFilter = value || 'ALL';
      return this.showFilter;
    }

    // Cycles traffic show filter.
    cycleShowFilter() {
      const states = MapModule.SHOW_STATES;
      const current = this.getShowFilter();
      const idx = Math.max(0, states.indexOf(current));
      const next = states[(idx + 1) % states.length] ?? 'ALL';
      return this.setShowFilter(next);
    }

    // Returns true when one traffic contact matches current show filter.
    // Optionally keeps currently selected traffic visible independent of filter.
    matchesShowFilter(contact, includeSelected = true) {
      const uid = String(contact?.uid ?? '');
      if (includeSelected && uid && uid === String(this.selectedTrafficUid ?? '')) {
        return true;
      }

      const filter = this.getShowFilter();
      if (filter === 'ALL') return true;
      if (filter === 'UNM') return this.getTrafficMark(uid) === '';
      return this.getTrafficMark(uid) === filter;
    }

    // Returns traffic contacts filtered by show mode.
    // By default the current selection remains visible while selected.
    getFilteredTraffic(contacts = [], includeSelected = true) {
      const list = Array.isArray(contacts) ? contacts : [];
      return list.filter((contact) => this.matchesShowFilter(contact, includeSelected));
    }

    // Returns only traffic contacts inside the active NAV range.
    getTrafficInRange(contacts = [], rangeNm = this.getRangeNm()) {
      const list = Array.isArray(contacts) ? contacts : [];
      const maxRange = Math.max(0.1, Number(rangeNm) || 0);
      return list.filter((contact) => {
        const forward = Number(contact?.forwardNm);
        const right = Number(contact?.rightNm);
        if (!Number.isFinite(forward) || !Number.isFinite(right)) return false;
        return Math.hypot(forward, right) <= maxRange;
      });
    }

    // Steps selected traffic target by direction (+1 next, -1 previous).
    stepSelectedTraffic(step = 1) {
      const direction = Number(step) >= 0 ? 1 : -1;
      const scene = this.getSceneData();
      const contacts = this.getTrafficInRange(this.getFilteredTraffic(scene?.traffic ?? []), scene?.rangeNm);
      if (!contacts.length) {
        this.selectedTrafficUid = null;
        this.trafficSelectionCleared = false;
        return null;
      }

      this.trafficSelectionCleared = false;

      const currentUid = this.getSelectedTrafficUid(contacts);
      const currentIndex = Math.max(0, contacts.findIndex((c) => String(c?.uid) === String(currentUid)));
      const nextIndex = (currentIndex + direction + contacts.length) % contacts.length;
      this.selectedTrafficUid = String(contacts[nextIndex]?.uid ?? '');
      return this.selectedTrafficUid || null;
    }

    // Clears selected traffic target.
    clearSelectedTraffic() {
      this.selectedTrafficUid = null;
      this.trafficSelectionCleared = true;
      return null;
    }

    // Returns flightplan waypoints in heading-relative coordinates.
    getFlightPlanWaypoints(ownship) {
      if (!ownship) return [];
      const waypoints = window.geofs?.flightPlan?.waypointArray;
      if (!Array.isArray(waypoints)) return [];

      const result = [];
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const lat = Number(wp?.lat ?? wp?.navaid?.lat);
        const lon = Number(wp?.lon ?? wp?.navaid?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const relNm = this.toRelativeNm(ownship, lat, lon);
        const frameNm = this.toHeadingFrame(relNm, ownship.heading);
        if (!frameNm) continue;

        const ident = String(wp?.navaid?.ident ?? wp?.navaid?.icao ?? wp?.ident ?? wp?.navaid?.name ?? `WP${i + 1}`).trim();
        result.push({
          index: i,
          ident,
          selected: Boolean(wp?.selected),
          type: String(wp?.navaid?.type ?? wp?.type ?? '').trim(),
          lat,
          lon,
          ...frameNm
        });
      }

      return result;
    }

    // Returns aggregated MAP/HSI scene data for rendering.
    // Traffic collection can be disabled to avoid multiplayer checks.
    getSceneData(options = {}) {
      const includeTraffic = options?.includeTraffic != null
        ? Boolean(options.includeTraffic)
        : this.isRadarEnabled();
      const ownship = this.getOwnshipState();
      if (!ownship) {
        return {
          ownship: null,
          rangeNm: this.getRangeNm(),
          traffic: [],
          waypoints: []
        };
      }

      return {
        ownship,
        rangeNm: this.getRangeNm(),
        traffic: includeTraffic ? this.getTrafficContacts(ownship) : [],
        waypoints: this.getFlightPlanWaypoints(ownship)
      };
    }
  }



class RadarModule {
  constructor(dependencies = {}) {
    this.navModule = dependencies.navModule ?? null;
    this.weaponModule = dependencies.weaponModule ?? null;
    this.hardLockedUid = null;
    this.sweepAngle = 0; // Current sweep position (0-100)
    this.sweepDirection = 1; // 1 = left to right, -1 = right to left
    this.lastSweepUpdateTime = 0;
    this.verticalScanPos = 0; // Current vertical scan position (0-100)
    this.verticalScanDirection = 1; // 1 = down, -1 = up
    this.lastVerticalScanUpdateTime = 0;
    this.visibleAircraftInCone = []; // Store currently visible aircraft in cone
    this.lastContactUpdateTime = 0; // Timestamp of last contact update
    this.cachedAircraftInCone = []; // Cached aircraft positions
  }

  setNavModule(navModule) {
    this.navModule = navModule;
    return this;
  }

  setWeaponModule(weaponModule) {
    this.weaponModule = weaponModule;
    return this;
  }

  stepSelectedTrafficInCone(direction) {
    const mapModule = this.navModule?.mapModule;
    if (!mapModule || !this.visibleAircraftInCone.length) return;

    const currentUid = String(mapModule.selectedTrafficUid ?? '');
    const uids = [...new Set(this.visibleAircraftInCone
      .map((a) => String(a?.uid ?? '').trim())
      .filter(Boolean))];
    if (!uids.length) return;

    if (!currentUid || !uids.includes(currentUid)) {
      // Select first aircraft
      mapModule.selectedTrafficUid = uids[0];
      return;
    }

    const currentIndex = uids.indexOf(currentUid);
    const newIndex = (currentIndex + direction + uids.length) % uids.length;
    mapModule.selectedTrafficUid = uids[newIndex];
  }

  registerMfdPages(mfdModule) {
    const radarModule = this;

    mfdModule.registerPage({
      title: 'RDR',
      leftButtons: [
        {
          key: 'RADAR',
          label: 'RDR',
          states: ['OFF', 'ON'],
          stateIndex: 0,
          onClick: ({ nextState }) => {
            if (String(nextState ?? '').toUpperCase() !== 'ON') return;
            window.addonRuntime = window.addonRuntime || {};
            window.addonRuntime.navRdrRuntime = window.addonRuntime.navRdrRuntime || { bootStartMs: 0 };
            window.addonRuntime.navRdrRuntime.bootStartMs = Date.now();
          }
        },
        {
          key: 'FOO',
          label: 'FOO',
          states: ['SH', 'HD'],
          stateIndex: 0,
          managedExternally: true,
          onClick: () => {
            const current = OptionModule.getOptionValue('RDR', 'FOO', 'SH');
            OptionModule.setOption('RDR', 'FOO', current === 'SH' ? 'HD' : 'SH');
          }
        },
        {
          key: 'LOCK',
          label: 'LOCK',
          states: [''],
          stateIndex: 0,
          onClick: () => {
            const mapModule = radarModule.navModule?.mapModule;
            if (!mapModule) return;
            const selectedUid = String(mapModule.selectedTrafficUid ?? '').trim();
            if (!selectedUid) return;

            // Toggle lock when pressing LOCK on the already locked target.
            if (String(radarModule.hardLockedUid ?? '') === selectedUid) {
              radarModule.hardLockedUid = null;
              return;
            }

            radarModule.hardLockedUid = selectedUid;
          }
        },
        {
          key: 'SCAN',
          label: 'SCN',
          states: ['6B', '3B'],
          stateIndex: 0,
          managedExternally: true,
          onClick: () => {
            const current = OptionModule.getOptionValue('RDR', 'SCAN', '6B');
            OptionModule.setOption('RDR', 'SCAN', current === '6B' ? '3B' : '6B');
          }
        },
        {
          key: 'FIRE',
          label: 'FIRE',
          states: [''],
          stateIndex: 0,
          onClick: () => {
            const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
            const modeLoadout = radarModule.weaponModule?.getModeLoadout(mode);
            if (radarModule.weaponModule && modeLoadout) {
              radarModule.weaponModule.fireSelectedWeapon(mode, modeLoadout);
            }
          },
          show: () => {
            return window.controls?.gear?.position === 1 && 
                   window.geofs?.animation?.values?.haglFeet > 50 && 
                   OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF' &&
                   OptionModule.getOption('WPN', 'MODE', 'NAV') === 'A/A';
          }
        }
      ],
      rightButtons: [
        {
          key: 'RANGE',
          label: '↑',
          states: ['5', '10', '20', '40', '80', '160'],
          values: [5, 10, 20, 40, 80, 160],
          stateIndex: 2,
          managedExternally: true,
          minimal: true,
          combinedGroupLabel: 'RNG',
          onClick: () => {
            const currentValues = [5, 10, 20, 40, 80, 160];
            const currentVal = Number(OptionModule.getOptionValue('RDR', 'RANGE', 20));
            const currentIndex = currentValues.indexOf(currentVal);
            const newIndex = Math.min(currentValues.length - 1, currentIndex + 1);
            OptionModule.setOption('RDR', 'RANGE', String(currentValues[newIndex]));
          }
        },
        {
          key: 'RANGE',
          label: '↓',
          states: ['5', '10', '20', '40', '80', '160'],
          values: [5, 10, 20, 40, 80, 160],
          stateIndex: 2,
          managedExternally: true,
          minimal: true,
          combinedGroupLabel: 'RNG',
          onClick: () => {
            const currentValues = [5, 10, 20, 40, 80, 160];
            const currentVal = Number(OptionModule.getOptionValue('RDR', 'RANGE', 20));
            const currentIndex = currentValues.indexOf(currentVal);
            const newIndex = Math.max(0, currentIndex - 1);
            OptionModule.setOption('RDR', 'RANGE', String(currentValues[newIndex]));
          }
        },
        {
          key: 'ACSEL',
          label: '→',
          states: ['A/C'],
          values: ['A/C'],
          stateIndex: 0,
          managedExternally: true,
          minimal: true,
          combinedGroupLabel: 'AC',
          onClick: () => {
            // Cycle through aircraft visible in cone only
            radarModule.stepSelectedTrafficInCone(1);
          }
        },
        {
          key: 'ACSEL',
          label: '←',
          states: ['A/C'],
          values: ['A/C'],
          stateIndex: 0,
          managedExternally: true,
          minimal: true,
          combinedGroupLabel: 'AC',
          onClick: () => {
            // Cycle through aircraft visible in cone only  
            radarModule.stepSelectedTrafficInCone(-1);
          }
        },
        {
          key: 'CLEAR',
          label: 'CLR',
          states: [''],
          stateIndex: 0,
          managedExternally: true,
          onClick: () => {
            radarModule.navModule?.mapModule?.clearSelectedTraffic();
            radarModule.hardLockedUid = null;
          }
        }
      ],
      lines: [],
      render: (renderer, renderContext) => {
        const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
        const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
        const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
        const color = renderContext?.color ?? '#00ff66';
        if (!ctx) return;

        window.addonRuntime = window.addonRuntime || {};
        window.addonRuntime.navRdrRuntime = window.addonRuntime.navRdrRuntime || { bootStartMs: 0 };

        const engOn = Boolean(window.geofs?.animation?.values?.enginesOn);
        if (!engOn) {
          window.addonRuntime.navRdrRuntime.bootStartMs = 0;
        } else if (!window.addonRuntime.navRdrRuntime.bootStartMs) {
          window.addonRuntime.navRdrRuntime.bootStartMs = Date.now();
        }

        const elapsedMs = engOn ? (Date.now() - window.addonRuntime.navRdrRuntime.bootStartMs) : 0;
        const bootReady = engOn && elapsedMs >= 5000;

        const contentX = w * 0.14;
        const contentY = h * 0.10;
        const contentW = w * 0.74;
        const contentH = h * 0.80;

        const rangeNmRaw = Number(OptionModule.getOptionValue('RDR', 'RANGE', 20));
        const rangeNm = Number.isFinite(rangeNmRaw) && rangeNmRaw > 0 ? rangeNmRaw : 20;
        const radarEnabled = OptionModule.getOptionValue('RDR', 'RADAR', 'OFF') === 'ON';
        const fooMode = OptionModule.getOptionValue('RDR', 'FOO', 'SH');
        const scanMode = OptionModule.getOptionValue('RDR', 'SCAN', '6B');
        const weaponMasterState = String(OptionModule.getOptionValue('WPN', 'MASTER', 'OFF')).toUpperCase();
        const weaponMode = String(OptionModule.getOptionValue('WPN', 'MODE', 'NAV')).toUpperCase();
        const modeLoadout = radarModule.weaponModule?.getModeLoadout(weaponMode);
        const selectedWeaponLabel = modeLoadout
          ? radarModule.weaponModule.getSelectedLoadDisplay(weaponMode, modeLoadout)
          : 'N/A';
        const selectedWeaponEffectiveness = modeLoadout
          ? radarModule.weaponModule.getSelectedWeaponEffectiveness(weaponMode, modeLoadout)
          : null;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000000';
        ctx.fillRect(contentX, contentY, contentW, contentH);

        if (!engOn) {
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
          ctx.fillText('RDR OFF', contentX + contentW * 0.5, contentY + contentH * 0.5);
          ctx.restore();
          return;
        }

        if (!bootReady) {
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
          ctx.fillText('RADAR BIT TEST...', contentX + contentW * 0.5, contentY + contentH * 0.5);
          ctx.restore();
          return;
        }

        if (!radarEnabled) {
          ctx.fillStyle = '#ffff33';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.075)}px monospace`;
          ctx.fillText('Radar OFF', contentX + contentW * 0.5, contentY + contentH * 0.5);
          ctx.restore();
          return;
        }

        const navModule = radarModule.navModule;
        const mapModule = navModule?.mapModule;
        const scene = mapModule?.getSceneData?.();
        const ownship = scene?.ownship ?? null;
        const trafficContactsAll = Array.isArray(scene?.traffic) ? scene.traffic : [];
        const trafficContacts = fooMode === 'HD'
          ? trafficContactsAll.filter((contact) => contact.callsign !== 'Foo')
          : trafficContactsAll;
        const myHeading = Number(ownship?.heading ?? window.geofs?.animation?.values?.heading) || 0;
        const myPitch = -Number(window.geofs?.animation?.values?.atilt);
        const myAltMeters = Number(ownship?.alt ?? window.geofs?.aircraft?.instance?.llaLocation?.[2]) || 0;

        // Define display area - wider, extending further left and right
        const margin = contentW * 0.02;
        const displayLeft = contentX + margin;
        const displayRight = contentX + contentW - margin;
        const displayTop = contentY + contentH * 0.06;
        const displayBottom = contentY + contentH * 0.95;
        const displayWidth = displayRight - displayLeft;
        const displayHeight = displayBottom - displayTop;

        // Update sweep angle
        const sweepMs = scanMode === '3B' ? 500 : 1000;
        const sweepNow = Date.now();
        if (!radarModule.lastSweepUpdateTime) {
          radarModule.lastSweepUpdateTime = sweepNow;
        }
        const deltaMs = sweepNow - radarModule.lastSweepUpdateTime;
        radarModule.lastSweepUpdateTime = sweepNow;
        radarModule.sweepAngle += radarModule.sweepDirection * (deltaMs * (100 / sweepMs));
        if (radarModule.sweepAngle >= 100) {
          radarModule.sweepAngle = 100;
          radarModule.sweepDirection = -1;
        } else if (radarModule.sweepAngle <= 0) {
          radarModule.sweepAngle = 0;
          radarModule.sweepDirection = 1;
        }
        const sweepX = displayLeft + (radarModule.sweepAngle / 100) * displayWidth;

        const verticalNow = Date.now();
        if (!radarModule.lastVerticalScanUpdateTime) {
          radarModule.lastVerticalScanUpdateTime = verticalNow;
        }
        const verticalDeltaMs = verticalNow - radarModule.lastVerticalScanUpdateTime;
        radarModule.lastVerticalScanUpdateTime = verticalNow;
        radarModule.verticalScanPos += radarModule.verticalScanDirection * (verticalDeltaMs * (100 / sweepMs));
        if (radarModule.verticalScanPos >= 100) {
          radarModule.verticalScanPos = 100;
          radarModule.verticalScanDirection = -1;
        } else if (radarModule.verticalScanPos <= 0) {
          radarModule.verticalScanPos = 0;
          radarModule.verticalScanDirection = 1;
        }

        const selectedTrafficUid = mapModule?.selectedTrafficUid ?? null;

        // Cone parameters by scan mode
        const CONE_HALF_ANGLE_H = scanMode === '3B' ? 15 : 30;
        const CONE_HALF_ANGLE_V = scanMode === '3B' ? 15 : 30;

        // Update contacts by scan mode
        const currentTime = Date.now();
        const contactUpdateMs = scanMode === '3B' ? 500 : 1000;
        const shouldUpdate = (currentTime - radarModule.lastContactUpdateTime) >= contactUpdateMs;
        
        let aircraftInCone = radarModule.cachedAircraftInCone;
        if (shouldUpdate && ownship) {
          radarModule.lastContactUpdateTime = currentTime;
          aircraftInCone = [];
          for (const contact of trafficContacts) {
            const uid = contact?.uid;
            if (!uid) continue;

            if (typeof mapModule?.isContactAllowedByShowFilter === 'function' && !mapModule.isContactAllowedByShowFilter(contact)) {
              continue;
            }

            const forwardNm = Number(contact?.forwardNm);
            const rightNm = Number(contact?.rightNm);
            if (!Number.isFinite(forwardNm) || !Number.isFinite(rightNm)) continue;

            const distanceNm = Math.sqrt((forwardNm * forwardNm) + (rightNm * rightNm));
            if (!Number.isFinite(distanceNm) || distanceNm <= 0 || distanceNm >= rangeNm) continue;

            // Calculate relative bearing using heading-frame coordinates.
            // In this frame: +forward is nose direction, +right is right wing.
            const relativeBearing = (Math.atan2(rightNm, forwardNm) * 180 / Math.PI);

            // Check if within horizontal cone
            if (Math.abs(relativeBearing) > CONE_HALF_ANGLE_H) continue;

            // Calculate elevation angle
            const horizontalDistM = Math.max(1, distanceNm * 1852);
            const targetAltMeters = Number(contact?.alt);
            const altDiff = (Number.isFinite(targetAltMeters) ? targetAltMeters : myAltMeters) - myAltMeters;
            const elevationAngle = Math.atan2(altDiff, horizontalDistM) * 180 / Math.PI;
            const relativeElevation = elevationAngle - myPitch;

            // Check if within vertical cone
            if (Math.abs(relativeElevation) > CONE_HALF_ANGLE_V) continue;

            const xRatio = (relativeBearing + CONE_HALF_ANGLE_H) / (2 * CONE_HALF_ANGLE_H);
            const x = displayLeft + xRatio * displayWidth;
            const yRatio = distanceNm / rangeNm;
            const y = displayBottom - yRatio * displayHeight;

            // Get track direction
            const track = Number(contact?.trackDeg ?? contact?.headingDeg ?? 0);

            // Add aircraft to list (always show all aircraft in cone)
            aircraftInCone.push({
              x, y, uid, distanceNm, relativeBearing, relativeElevation, track,
              altKft: Number.isFinite(Number(contact?.altFeet))
                ? Math.round(Number(contact.altFeet) / 1000)
                : Math.round(((Number(contact?.alt) || 0) * 3.28084) / 1000),
              contact
            });
          }
          
          // Store updated aircraft in cache
          radarModule.cachedAircraftInCone = aircraftInCone;
        }

        // Store visible aircraft for A/C selection
        radarModule.visibleAircraftInCone = aircraftInCone;

        // Break lock automatically when locked aircraft is no longer visible on RDR.
        if (radarModule.hardLockedUid) {
          const lockStillVisible = aircraftInCone.some((aircraft) => String(aircraft?.uid ?? '') === String(radarModule.hardLockedUid));
          if (!lockStillVisible) {
            radarModule.hardLockedUid = null;
          }
        }

        const lockedAircraft = radarModule.hardLockedUid
          ? aircraftInCone.find((aircraft) => String(aircraft.uid) === String(radarModule.hardLockedUid))
          : null;

        // Draw border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(displayLeft, displayTop, displayWidth, displayHeight);

        // Draw weapon status labels above radar rectangle
        const statusY = displayTop - h * 0.030;
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(h * 0.032)}px monospace`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(`WPN ${weaponMode}`, displayLeft, statusY);
        ctx.textAlign = 'center';
        ctx.fillText(selectedWeaponLabel, displayLeft + displayWidth * 0.5, statusY);
        ctx.textAlign = 'right';
        ctx.fillText(`MASTER ${weaponMasterState}`, displayRight, statusY);

        if (selectedWeaponEffectiveness) {
          const markerFractions = radarModule.weaponModule.getEffectivenessMarkerFractions(selectedWeaponEffectiveness);
          const bracketHeight = displayHeight * (2 / 3);
          const bracketTop = displayTop + (displayHeight - bracketHeight) * 0.5;
          const bracketBottom = bracketTop + bracketHeight;
          const bracketX = displayRight - w * 0.02;
          const tickLen = w * 0.018;

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bracketX, bracketTop);
          ctx.lineTo(bracketX, bracketBottom);
          ctx.stroke();

          const markerYs = [
            bracketTop + markerFractions.engagementMax * bracketHeight,
            bracketTop + markerFractions.effectiveMax * bracketHeight,
            bracketTop + markerFractions.effectiveMin * bracketHeight,
            bracketTop + markerFractions.engagementMin * bracketHeight
          ];

          for (const y of markerYs) {
            ctx.beginPath();
            ctx.moveTo(bracketX, y);
            ctx.lineTo(bracketX - tickLen, y);
            ctx.stroke();
          }

          if (lockedAircraft) {
            const lockedFraction = radarModule.weaponModule.getEffectivenessDistanceFraction(selectedWeaponEffectiveness, lockedAircraft.distanceNm);
            const lockedY = bracketTop + lockedFraction * bracketHeight;
            ctx.fillStyle = color;
            ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText('>', bracketX, lockedY);
            ctx.fillStyle = color;
          }
        }

        if (weaponMasterState === 'OFF') {
          ctx.fillStyle = '#ffff33';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.032)}px monospace`;
          ctx.fillText('MASTER OFF', displayLeft + displayWidth * 0.5, displayTop + displayHeight * 0.5);
          ctx.fillStyle = color;
        } else if (weaponMode !== 'A/A') {
          ctx.fillStyle = '#ffff33';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.032)}px monospace`;
          ctx.fillText('SELECT A/A MODE', displayLeft + displayWidth * 0.5, displayTop + displayHeight * 0.5);
          ctx.fillStyle = color;
        }

        // Draw horizontal grid lines (range rings)
        ctx.strokeStyle = '#004422';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          const ratio = i / 4;
          const y = displayBottom - (displayHeight * ratio);
          ctx.beginPath();
          ctx.moveTo(displayLeft, y);
          ctx.lineTo(displayRight, y);
          ctx.stroke();
        }

        // Draw tick marks on sides
        const tickLength = 20;
        
        // Left and right side ticks (3 each, horizontal)
        for (let i = 1; i <= 3; i++) {
          const y = displayTop + (displayHeight * i / 4);
          // Left side
          ctx.beginPath();
          ctx.moveTo(displayLeft, y);
          ctx.lineTo(displayLeft + tickLength, y);
          ctx.stroke();
          // Right side
          ctx.beginPath();
          ctx.moveTo(displayRight, y);
          ctx.lineTo(displayRight - tickLength, y);
          ctx.stroke();
        }

        // Top and bottom ticks (vertical)
        const topBottomTickCount = scanMode === '3B' ? 2 : 5;
        for (let i = 1; i <= topBottomTickCount; i++) {
          const x = displayLeft + (displayWidth * i / (topBottomTickCount + 1));
          // Top side
          ctx.beginPath();
          ctx.moveTo(x, displayTop);
          ctx.lineTo(x, displayTop + tickLength);
          ctx.stroke();
          // Bottom side
          ctx.beginPath();
          ctx.moveTo(x, displayBottom);
          ctx.lineTo(x, displayBottom - tickLength);
          ctx.stroke();
        }

        // Draw sweep line (vertical, moving left to right)
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sweepX, displayTop);
        ctx.lineTo(sweepX, displayBottom);
        ctx.stroke();

        const firstBarY = displayBottom - (displayHeight * (1 / 4));
        const thirdBarY = displayBottom - (displayHeight * (3 / 4));
        const scanTopY = Math.min(firstBarY, thirdBarY);
        const scanBottomY = Math.max(firstBarY, thirdBarY);
        const fullScanSpan = scanBottomY - scanTopY;
        const verticalScanSpan = scanMode === '3B' ? fullScanSpan * 0.5 : fullScanSpan;
        const verticalScanTop = scanTopY + (fullScanSpan - verticalScanSpan) * 0.5;
        const verticalScanY = verticalScanTop + (radarModule.verticalScanPos / 100) * verticalScanSpan;

        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(h * 0.035)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('<', displayLeft + 10, verticalScanY);

        if (radarModule.weaponModule?.isFireFlashVisible()) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.12)}px monospace`;
          ctx.fillStyle = '#ff0000';
          ctx.fillText(radarModule.weaponModule.getActionFlashLabel(), contentX + contentW * 0.5, h * 0.72);
          ctx.fillStyle = color;
        }

        // Draw aircraft symbols
        const drawTrafficContact = (x, y, aircraft) => {
          const isSelected = String(aircraft.uid) === String(selectedTrafficUid);
          const isHardLocked = String(aircraft.uid) === String(radarModule.hardLockedUid);
          
          // If hard locked, make entire icon red
          const baseColor = isHardLocked ? '#ff0000' : (mapModule?.getTrafficColor(aircraft.contact) ?? '#ffffff');
          const number = mapModule?.getContactNumber(aircraft.contact) ?? '?';
          const glyph = String(number);

          ctx.fillStyle = baseColor;
          ctx.font = `bold ${Math.round(h * 0.032)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(glyph, x, y);

          const numberHalfH = Math.max(h * 0.016, 8);
          const roofHalfW = Math.max(w * 0.022, 10);
          const roofY = y - numberHalfH - h * 0.007;
          const legLen = Math.max(h * 0.022, 10);

          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - roofHalfW, roofY);
          ctx.lineTo(x + roofHalfW, roofY);
          ctx.moveTo(x - roofHalfW, roofY);
          ctx.lineTo(x - roofHalfW, roofY + legLen);
          ctx.moveTo(x + roofHalfW, roofY);
          ctx.lineTo(x + roofHalfW, roofY + legLen);
          ctx.stroke();

          // Direction indicator - shows track direction
          const track = Number(aircraft.track ?? 0);
          const relTrackRad = ((track - myHeading) * Math.PI / 180);
          const dirX = Math.sin(relTrackRad);
          const dirY = -Math.cos(relTrackRad);
          const numberRadius = Math.max(h * 0.021, 11);
          const lineStart = numberRadius + 2;
          const lineLen = Math.max(h * 0.034, 16);

          ctx.beginPath();
          ctx.moveTo(x + dirX * lineStart, y + dirY * lineStart);
          ctx.lineTo(x + dirX * (lineStart + lineLen), y + dirY * (lineStart + lineLen));
          ctx.stroke();

          // Selection brackets (square corners like NAV page)
          if (isSelected && !isHardLocked) {
            const pad = 2;
            const left = x - roofHalfW - pad;
            const right = x + roofHalfW + pad;
            const top = roofY - pad;
            const bottom = y + numberHalfH + pad;
            const arm = Math.max(5, h * 0.012);
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(left, top + arm); ctx.lineTo(left, top); ctx.lineTo(left + arm, top);
            ctx.moveTo(right - arm, top); ctx.lineTo(right, top); ctx.lineTo(right, top + arm);
            ctx.moveTo(left, bottom - arm); ctx.lineTo(left, bottom); ctx.lineTo(left + arm, bottom);
            ctx.moveTo(right - arm, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - arm);
            ctx.stroke();
          }

          // Diamond for hard lock
          if (isHardLocked) {
            const boundLeft = x - roofHalfW - 6;
            const boundRight = x + roofHalfW + 6;
            const boundTop = roofY - 6;
            const boundBottom = y + numberHalfH + 6;
            const halfW = (boundRight - boundLeft) * 0.5;
            const halfH = (boundBottom - boundTop) * 0.5;
            const diamondSize = Math.max(halfW, halfH) + 3;
            const diamondCenterY = y - 2;
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x, diamondCenterY - diamondSize);
            ctx.lineTo(x + diamondSize, diamondCenterY);
            ctx.lineTo(x, diamondCenterY + diamondSize);
            ctx.lineTo(x - diamondSize, diamondCenterY);
            ctx.closePath();
            ctx.stroke();
          }
        };

        // Plot aircraft
        for (const aircraft of aircraftInCone) {
          drawTrafficContact(aircraft.x, aircraft.y, aircraft);
        }

        // Draw range indicator
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(h * 0.032)}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`${rangeNm} NM`, displayRight - w * 0.01, displayTop + h * 0.01);

        // Draw LOCK indicator if hard locked
        if (radarModule.hardLockedUid) {
          const lockedType = String(lockedAircraft?.contact?.aircraftName ?? '').trim() || 'UNKNOWN';
          const lockedCallsign = String(lockedAircraft?.contact?.callsign ?? '').trim() || 'N/A';

          ctx.fillStyle = '#ff0000';
          ctx.font = `bold ${Math.round(h * 0.034)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const lockLineStep = h * 0.036;
          const lockTextX = displayLeft + displayWidth * 0.5;
          const lockTextY = displayTop + tickLength + h * 0.01;
          ctx.fillText(`LOCK ${lockedCallsign}`.slice(0, 42), lockTextX, lockTextY);
          ctx.fillText(lockedType.slice(0, 42), lockTextX, lockTextY + lockLineStep);
        }

        ctx.restore();
      }
    });

    return true;
  }
}


  class CommunicationModule {
    static HISTORY_LIMIT = 120;
    static HUD_MESSAGE_VISIBLE_MS = 10000;
    static VOICE_RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

    // Initializes communication state and hook references.
    constructor(dependencies = {}) {
      this.dependencies = dependencies ?? {};
      this.installed = false;
      this.multiplayerRef = null;
      this.originalUpdateCallback = null;
      this.wrappedUpdateCallback = null;
      this.messages = [];
      this.hudMessage = null;
      this.lastVoiceMode = 'NONE';
      this.voiceEnabledAtServerTime = null;
      this.voiceEnabledAtLocalMs = 0;
    }

    // Installs the multiplayer update hook used for incoming chat messages.
    ensureLoaded() {
      if (this.installed) return true;
      return this.installMultiplayerHook();
    }

    // Registers the COMM MFD page.
    registerMfdPages(mfdModule) {
      const communicationModule = this;
      mfdModule.registerPage({
        title: 'COMM',
        leftButtons: [
          { key: 'SHOW', label: 'SHOW', states: ['MSG', 'CFG'], stateIndex: 0 },
          { key: 'N/A1', label: '', states: [''], stateIndex: 0 },
          {
            key: 'DISPLAY',
            label: 'DISP',
            states: ['NO', 'ALL', 'GRP', 'FLT', 'W/M'],
            values: ['NONE', 'ALL', 'GROUP', 'FLIGHT', 'WINGMAN'],
            stateIndex: 0,
            show: () => OptionModule.getOption('COMM', 'SHOW', 'MSG') === 'MSG'
          },
          { key: 'N/A2', label: '', states: [''], stateIndex: 0 },
          {
            key: 'HUD',
            label: 'HUD',
            states: ['NO', 'ALL', 'GRP', 'FLT', 'W/M'],
            values: ['NONE', 'ALL', 'GROUP', 'FLIGHT', 'WINGMAN'],
            stateIndex: 0,
            show: () => OptionModule.getOption('COMM', 'SHOW', 'MSG') === 'MSG'
          }
        ],
        rightButtons: [
          {
            key: 'VOICE',
            label: 'VOICE',
            states: ['NONE', 'ALL', 'GROUP', 'FLIGHT', 'WINGMAN'],
            stateIndex: 0,
            show: () => OptionModule.getOption('COMM', 'SHOW', 'MSG') === 'CFG'
          },
          { key: 'N/A3', label: '', states: [''], stateIndex: 0 },
          {
            key: 'RATE',
            label: 'RATE',
            states: ['0.75', '1', '1.25', '1.5', '2', '2.5', '3'],
            values: [0.75, 1, 1.25, 1.5, 2, 2.5, 3],
            stateIndex: 3,
            show: () => OptionModule.getOption('COMM', 'SHOW', 'MSG') === 'CFG'
          }
        ],
        lines: [],
        render: (renderer, renderContext) => {
          const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
          const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
          const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
          const color = renderContext?.color ?? '#00ff66';
          if (!ctx) return;

          const profile = communicationModule.getProfile();
          const voiceLanguage = communicationModule.getVoiceLanguage();
          const voiceRate = communicationModule.getVoiceRate();
          const voiceMode = OptionModule.getOptionValue('COMM', 'VOICE', 'NONE');
          const displayMode = OptionModule.getOptionValue('COMM', 'DISPLAY', 'NONE');
          const hudMode = OptionModule.getOptionValue('COMM', 'HUD', 'NONE');
          const showMode = OptionModule.getOption('COMM', 'SHOW', 'MSG');
          const mfdMessageMode = displayMode === 'ALL' ? 'ANY' : displayMode;

          const recentMessages = communicationModule.getMessagesByMode(mfdMessageMode, 5);

          const fmt = (value, withBrackets = false) => {
            const token = String(value ?? '').trim();
            if (!token) return '-';
            return withBrackets ? `[${token}]` : token;
          };
          const trimMessageLine = (text, maxChars = 64) => communicationModule.trimLine(text, maxChars);
          const wrapFixed = (text, lineLen = 32, maxLines = 2) => {
            const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
            if (!cleaned) return [''];
            const lines = [];
            let cursor = 0;
            while (cursor < cleaned.length && lines.length < maxLines) {
              const remaining = cleaned.slice(cursor);
              if (remaining.length <= lineLen) {
                lines.push(remaining);
                cursor = cleaned.length;
                break;
              }

              let cut = lineLen;
              const lastSpace = remaining.slice(0, lineLen + 1).lastIndexOf(' ');
              if (lastSpace > Math.floor(lineLen * 0.6)) {
                cut = lastSpace;
              }

              lines.push(remaining.slice(0, cut).trim());
              cursor += cut;
              while (cleaned[cursor] === ' ') cursor += 1;
            }

            if (cursor < cleaned.length && lines.length) {
              const last = lines.length - 1;
              lines[last] = trimMessageLine(lines[last], lineLen);
            }

            return lines.slice(0, maxLines);
          };

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1.2, w * 0.0022);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';

          if (showMode === 'CFG') {
            const cfgX = w * 0.33;
            let y = h * 0.16;
            const cfgTextPx = Math.round(h * 0.045);
            const colorGroup = communicationModule.getMfdCallsignColor({ category: 'GROUP' });
            const colorFlight = communicationModule.getMfdCallsignColor({ category: 'FLIGHT' });
            const colorWingman = communicationModule.getMfdCallsignColor({ category: 'WINGMAN' });

            ctx.font = `bold ${cfgTextPx}px monospace`;
            ctx.fillStyle = color;
            ctx.fillText(`VOICE ${voiceMode}`, cfgX, y);
            y += h * 0.046;
            ctx.fillText(`DISP ${displayMode}`, cfgX, y);
            y += h * 0.046;
            ctx.fillText(`HUD ${hudMode}`, cfgX, y);

            y += h * 0.056;
            ctx.fillStyle = colorGroup;
            ctx.fillText(`GROUP ${fmt(profile.group, true)}`, cfgX, y);

            y += h * 0.046;
            ctx.fillStyle = colorFlight;
            ctx.fillText(`FLIGHT ${fmt(profile.flight, true)}`, cfgX, y);

            y += h * 0.046;
            ctx.fillStyle = colorWingman;
            ctx.fillText(`WINGMAN ${fmt(profile.wingman, false)}`, cfgX, y);

            y += h * 0.046;
            ctx.fillStyle = color;
            ctx.fillText(`LANG ${fmt(voiceLanguage, false)}`, cfgX, y);

            y += h * 0.046;
            ctx.fillText(`RATE ${fmt(String(voiceRate), false)}`, cfgX, y);
          } else {
            const panelX = w * 0.19;
            const panelW = w * 0.78;
            const rowH = h * 0.145;
            const rowTopMargin = h * 0.11;
            const rowBottomMargin = h * 0.11;
            const firstRowCenterY = rowTopMargin + rowH * 0.5;
            const lastRowCenterY = h - rowBottomMargin - rowH * 0.5;
            const rowStep = (lastRowCenterY - firstRowCenterY) / 4;
            const rowStartY = firstRowCenterY;

            const callsignFontPx = Math.round(h * 0.038);
            const messageFontPx = Math.round(h * 0.044);
            const msgLineStep = h * 0.040;

            for (let i = 0; i < 5; i++) {
              const rowY = rowStartY + i * rowStep;
              const rowTop = rowY - rowH * 0.48;

              const item = recentMessages[recentMessages.length - 1 - i] ?? null;
              const rowColor = item
                ? (communicationModule?.getMfdCallsignColor?.(item) ?? '#ffffff')
                : color;
              ctx.strokeStyle = rowColor;
              ctx.strokeRect(panelX, rowTop, panelW, rowH);

              if (!item) {
                ctx.fillStyle = color;
                ctx.font = `bold ${messageFontPx}px monospace`;
                ctx.fillText('--', panelX + w * 0.012, rowY);
                continue;
              }

              const callsignLine = trimMessageLine(`[${item.category}] ${item.callsign}`, 56);
              const wrappedMessageLines = wrapFixed(item.message, 35, 2);

              ctx.fillStyle = rowColor;
              ctx.font = `bold ${callsignFontPx}px monospace`;
              ctx.fillText(callsignLine, panelX + w * 0.012, rowY - h * 0.036);

              ctx.fillStyle = rowColor;
              ctx.font = `bold ${messageFontPx}px monospace`;
              ctx.fillText(wrappedMessageLines[0] ?? '', panelX + w * 0.012, rowY - h * 0.001);
              ctx.fillText(wrappedMessageLines[1] ?? '', panelX + w * 0.012, rowY - h * 0.001 + msgLineStep);
            }
          }

          ctx.restore();
        }
      });

      return true;
    }

    // Restores multiplayer callbacks and clears volatile communication state.
    restore() {
      this.uninstallMultiplayerHook();
      this.hudMessage = null;
      this.lastVoiceMode = 'NONE';
      this.voiceEnabledAtServerTime = null;
      this.voiceEnabledAtLocalMs = 0;
      this.installed = false;
    }

    // Installs a safe wrapper around multiplayer.updateCallback.
    installMultiplayerHook() {
      const multiplayerRef = window.multiplayer;
      if (!multiplayerRef || typeof multiplayerRef.updateCallback !== 'function') return false;

      if (this.wrappedUpdateCallback && multiplayerRef.updateCallback === this.wrappedUpdateCallback) {
        this.installed = true;
        return true;
      }

      const original = multiplayerRef.updateCallback;
      const self = this;
      this.originalUpdateCallback = original;
      this.multiplayerRef = multiplayerRef;
      this.wrappedUpdateCallback = function (payload) {
        self.onMultiplayerUpdatePayload(payload);
        return original.apply(this, arguments);
      };

      multiplayerRef.updateCallback = this.wrappedUpdateCallback;
      this.installed = true;
      return true;
    }

    // Restores the original multiplayer.updateCallback.
    uninstallMultiplayerHook() {
      if (!this.multiplayerRef) {
        this.originalUpdateCallback = null;
        this.wrappedUpdateCallback = null;
        return;
      }

      if (this.wrappedUpdateCallback && this.multiplayerRef.updateCallback === this.wrappedUpdateCallback) {
        this.multiplayerRef.updateCallback = this.originalUpdateCallback;
      }

      this.originalUpdateCallback = null;
      this.wrappedUpdateCallback = null;
      this.multiplayerRef = null;
    }

    // Returns the configured communication profile.
    getProfile() {
      return {
        group: String(OptionModule.getOption('COMM', 'GROUP', '') ?? ''),
        flight: String(OptionModule.getOption('COMM', 'FLIGHT', '') ?? ''),
        wingman: String(OptionModule.getOption('COMM', 'WINGMAN', '') ?? '')
      };
    }

    // Stores the configured communication group token.
    setGroup(value) {
      OptionModule.setOption('COMM', 'GROUP', value);
      return value;
    }

    // Stores the configured communication flight token.
    setFlight(value) {
      OptionModule.setOption('COMM', 'FLIGHT', value);
      return value;
    }

    // Stores the configured wingman token.
    setWingman(value) {
      OptionModule.setOption('COMM', 'WINGMAN', value);
      return value;
    }

    // Stores multiple communication profile filters in one call.
    setProfile(profile = {}) {
      return {
        group: this.setGroup(profile.group),
        flight: this.setFlight(profile.flight),
        wingman: this.setWingman(profile.wingman)
      };
    }

    // Reads the configured voice synthesis language.
    getVoiceLanguage() {
      return String(OptionModule.getOption('COMM', 'VOICE_LANG', 'en-US') ?? 'en-US') || 'en-US';
    }

    // Stores the voice synthesis language.
    setVoiceLanguage(language) {
      OptionModule.setOption('COMM', 'VOICE_LANG', language);
      return language;
    }

    // Reads the configured speech rate.
    getVoiceRate() {
      return Number(OptionModule.getOptionValue('COMM', 'RATE', 1.5));
    }

    // Stores the configured speech rate.
    setVoiceRate(rate) {
      OptionModule.setOption('COMM', 'RATE', String(rate));
      return rate;
    }

    // Decodes URL-encoded multiplayer chat text.
    decodeChatText(value) {
      return decodeURIComponent(value.replace(/\+/g, '%20'));
    }

    // Extracts the spoken callsign by removing all bracketed tags.
    getSpokenCallsign(callsign) {
      const withoutTags = callsign.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      return withoutTags || 'UNKNOWN';
    }

    // Resolves profile match flags for one callsign.
    resolveMatches(callsign) {
      const profile = this.getProfile();

      const groupMatch = Boolean(profile.group && callsign.includes(`[${profile.group}]`));
      const flightMatch = Boolean(profile.flight && callsign.includes(`[${profile.flight}]`));
      const wingmanMatch = Boolean(profile.wingman && callsign.includes(profile.wingman));
      const allMatch = !groupMatch && !flightMatch && !wingmanMatch;

      return {
        groupMatch,
        flightMatch,
        wingmanMatch,
        allMatch
      };
    }

    // Checks if a message matches a selected communication mode.
    matchesMode(mode, entry) {
      if (mode === 'NONE') return false;
      if (mode === 'ALL') return !!entry?.allMatch;
      if (mode === 'GROUP') return !!entry?.groupMatch;
      if (mode === 'FLIGHT') return !!entry?.flightMatch;
      if (mode === 'WINGMAN') return !!entry?.wingmanMatch;
      return false;
    }


    // Returns a short category tag for a classified chat message.
    getCategoryTag(entry) {
      if (entry?.wingmanMatch) return 'WINGMAN';
      if (entry?.flightMatch) return 'FLIGHT';
      if (entry?.groupMatch) return 'GROUP';
      return 'ALL';
    }

    // Returns the callsign color used on the COMM MFD message list.
    getMfdCallsignColor(entry) {
      if (entry?.category === 'GROUP') return '#ff4444';
      if (entry?.category === 'FLIGHT') return '#3da2ff';
      if (entry?.category === 'WINGMAN') return '#33ff66';
      return '#ffffff';
    }

    // Trims a line to a fixed character budget.
    trimLine(text, maxChars = 72) {
      const value = String(text ?? '').replace(/\s+/g, ' ').trim();
      if (!value) return '';
      if (value.length <= maxChars) return value;
      return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
    }

    // Handles raw payloads from GeoFS multiplayer updates.
    onMultiplayerUpdatePayload(payload) {
      const messages = Array.isArray(payload?.chatMessages) ? payload.chatMessages : [];
      if (!messages.length) return;

      for (const message of messages) {
        this.processIncomingMessage(message, payload);
      }
    }

    // Updates the voice activation anchor used to suppress old messages.
    refreshVoiceActivationWindow(voiceMode, payloadServerTime) {
      const mode = String(voiceMode ?? 'NONE');
      const previousMode = this.lastVoiceMode;

      if (mode !== 'NONE' && previousMode === 'NONE') {
        const serverTime = Number(payloadServerTime);
        this.voiceEnabledAtServerTime = Number.isFinite(serverTime) ? serverTime : null;
        this.voiceEnabledAtLocalMs = Date.now();
      }

      if (mode === 'NONE') {
        this.voiceEnabledAtServerTime = null;
        this.voiceEnabledAtLocalMs = 0;
      }

      this.lastVoiceMode = mode;
    }

    // Returns true when a message arrived after voice mode was enabled.
    isMessageNewForVoice(entry) {
      if (Number.isFinite(this.voiceEnabledAtServerTime) && Number.isFinite(entry?.serverTime)) {
        return entry.serverTime > this.voiceEnabledAtServerTime;
      }
      if (Number.isFinite(this.voiceEnabledAtLocalMs) && this.voiceEnabledAtLocalMs > 0) {
        return Number(entry?.timestampMs) > this.voiceEnabledAtLocalMs;
      }
      return false;
    }

    // Processes one incoming chat message and dispatches side effects.
    processIncomingMessage(message, payload) {
      const callsign = message?.cs || 'UNKNOWN';
      const text = this.decodeChatText(message?.msg ?? '').trim();
      if (!text) return;

      const matches = this.resolveMatches(callsign);
      const entry = {
        uid: String(message?.uid ?? ''),
        acid: Number(message?.acid),
        callsign,
        message: text,
        serverTime: Number(payload?.serverTime) || null,
        timestampMs: Date.now(),
        category: this.getCategoryTag(matches),
        ...matches
      };

      this.messages.push(entry);
      if (this.messages.length > CommunicationModule.HISTORY_LIMIT) {
        this.messages.splice(0, this.messages.length - CommunicationModule.HISTORY_LIMIT);
      }

      const voiceMode = OptionModule.getOptionValue('COMM', 'VOICE', 'NONE');
      this.refreshVoiceActivationWindow(voiceMode, payload?.serverTime);
      if (this.matchesMode(voiceMode, entry) && this.isMessageNewForVoice(entry)) {
        this.speakMessage(entry);
      }

      const hudMode = OptionModule.getOptionValue('COMM', 'HUD', 'NONE');
      if (this.matchesMode(hudMode, entry)) {
        const formatted = [
          `[${entry.category}]`,
          this.trimLine(entry.callsign, 44),
          this.trimLine(entry.message, 88)
        ].join('\n');
        this.hudMessage = {
          text: formatted,
          expiresAtMs: Date.now() + CommunicationModule.HUD_MESSAGE_VISIBLE_MS
        };
      }
    }

    // Speaks one chat message using the browser speech synthesis API.
    speakMessage(entry) {
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false;

      const spokenCallsign = this.getSpokenCallsign(entry.callsign);
      const utterance = new window.SpeechSynthesisUtterance(`${spokenCallsign}. ${entry.message}`);
      utterance.lang = this.getVoiceLanguage();
      utterance.rate = this.getVoiceRate();
      synth.speak(utterance);
      return true;
    }

    // Returns the latest messages for the selected communication mode.
    getMessagesByMode(mode = 'ALL', limit = 5) {
      const modeToken = String(mode ?? 'ALL').toUpperCase();
      const max = Math.max(1, Math.min(50, Number(limit) || 5));
      const filtered = modeToken === 'ANY'
        ? this.messages.slice()
        : this.messages.filter((entry) => this.matchesMode(modeToken, entry));
      return filtered.slice(Math.max(0, filtered.length - max));
    }

    // Returns the active HUD overlay text while its visibility timer is valid.
    getHudOverlayText() {
      if (!this.hudMessage?.text) return null;
      if (!Number.isFinite(this.hudMessage.expiresAtMs) || Date.now() > this.hudMessage.expiresAtMs) {
        this.hudMessage = null;
        return null;
      }
      return this.hudMessage.text;
    }
  }




  class RecorderModule {
    FLIGHT_RECORDER_MIN_VERSION = '1.2.0';

    constructor(dependencies = {}) {
      this.dependencies = dependencies ?? {};
    }

    registerMfdPages(mfdModule) {
      mfdModule.registerPage({
        title: 'REC',
        leftButtons: [
          {
            key: 'STATE',
            label: 'REC',
            states: ['OFF'],
            stateIndex: 0,
            managedExternally: true,
            onClick: () => {
              this.toggleRecordingFromMfd();
            }
          },
        ],
        rightButtons: [
          {
            key: 'PLAYBACK',
            label: 'START',
            states: ['START'],
            stateIndex: 0,
            managedExternally: true,
            combinedAction: true,
            combinedGroupLabel: 'PLAYBACK',
            onClick: () => {
              this.controlPlaybackFromMfd('START');
            }
          },
          {
            key: 'PLAYBACK',
            label: 'PAUSE',
            states: ['PAUSE'],
            stateIndex: 0,
            managedExternally: true,
            combinedAction: true,
            combinedGroupLabel: 'PLAYBACK',
            onClick: () => {
              this.controlPlaybackFromMfd('PAUSE');
            }
          },
          {
            key: 'PLAYBACK',
            label: 'STOP',
            states: ['STOP'],
            stateIndex: 0,
            managedExternally: true,
            combinedAction: true,
            combinedGroupLabel: 'PLAYBACK',
            onClick: () => {
              this.controlPlaybackFromMfd('STOP');
            }
          },
        ],
        lines: [],
        render: (renderer, renderContext) => {
          const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
          const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
          const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
          const color = renderContext?.color ?? '#00ff66';
          if (!ctx) return;

          const status = window.BasePlugin?.getActiveAddon?.()?.recorder?.getFlightRecorderMfdStatus?.() ?? { installed: false, compatible: false, recordingState: 'OFF', playbackState: 'STOPPED' };
          const cx = w * 0.5;

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (!status.compatible) {
            ctx.font = `bold ${Math.round(h * 0.042)}px monospace`;
            ctx.fillText('Install Flight Recorder', cx, h * 0.58);
            ctx.fillText('v1.2.0 or higher', cx, h * 0.66);
            ctx.restore();
            return;
          }

          ctx.font = `bold ${Math.round(h * 0.042)}px monospace`;
          ctx.fillText(`FR v${status.version ?? 'unknown'}`, cx, h * 0.56);
          ctx.fillText(`REC ${status.recordingState}`, cx, h * 0.64);
          ctx.fillText(`PLAY ${status.playbackState}`, cx, h * 0.72);
          ctx.restore();
        }
      });
      return true;
    }

    isFlightRecorderCompatible() {
      return HelperModule.isSemverAtLeast(window.FlightRecorder?.api.getVersion() ?? '0.0.0', this.FLIGHT_RECORDER_MIN_VERSION);
    }

    getFlightRecorderMfdStatus() {
      const installed = Boolean(window.FlightRecorder?.api);
      const version = window.FlightRecorder?.api.getVersion();
      const compatible = this.isFlightRecorderCompatible();

      if (!installed || !compatible) {
        return {
          installed,
          compatible: false,
          version,
          recordingState: 'OFF',
          playbackState: 'STOPPED',
          message: 'Install Flight Recorder v1.2.0 or higher'
        };
      }

      return {
        installed,
        compatible: true,
        version,
        recordingState: window.FlightRecorder?.api.recording.getState().state,
        playbackState: window.FlightRecorder?.api.playback.getState().state,
        message: ''
      };
    }

    toggleRecordingFromMfd() {
      if (!this.isFlightRecorderCompatible()) return false;

      const currentState = window.FlightRecorder?.api.recording.getState().state;
      if (currentState === 'RECORDING') {
        window.FlightRecorder?.api.recording.stop();
      } else {
        window.FlightRecorder?.api.recording.start();
      }
      return true;
    }

    controlPlaybackFromMfd(action) {
      if (!this.isFlightRecorderCompatible()) return false;

      if (action === 'START') {
        window.FlightRecorder?.api.playback.start();
        return true;
      }
      if (action === 'PAUSE') {
        window.FlightRecorder?.api.playback.pause();
        return true;
      }
      if (action === 'STOP') {
        window.FlightRecorder?.api.playback.stop();
        return true;
      }
      return false;
    }
  }


  class F18MfdUiState {
    constructor(dependencies = {}, pageRegistry = []) {
      this.mapModule = dependencies.mapModule;
      this.weaponsModule = dependencies.weaponsModule;
      this.recorderModule = dependencies.recorderModule;
      this.pageIndex = 0;
      this.pendingMfdExport = null;
      this.pages = pageRegistry;
      this.ensureDefaultsInStorage();
    }

    queueMfdExport(pageTitle = 'MFD') {
      this.pendingMfdExport = pageTitle;
    }

    exportMfdCanvasToPng(canvas, pageTitle = 'MFD') {
      const pad2 = (value) => `${value}`.padStart(2, '0');
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
      const safeTitle = pageTitle.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'MFD';
      const filename = `${safeTitle}-MFD-${stamp}.png`;

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
    }

    getCurrentPage() {
      return this.pages[this.pageIndex] ?? this.pages[0];
    }

    nextPage() {
      this.pageIndex = (this.pageIndex + 1) % this.pages.length;
    }

    prevPage() {
      this.pageIndex = (this.pageIndex - 1 + this.pages.length) % this.pages.length;
    }

    setPage(index) {
      if (index >= 0 && index < this.pages.length) {
        this.pageIndex = index;
      }
    }

    getButtonStorageKey(page, button, index, side) {
      const preferred = button?.key || button?.label || `${side}${index + 1}`;
      return OptionModule.buildOptionKey(page?.title ?? 'PAGE', preferred);
    }

    ensureDefaultsInStorage() {
      const stored = OptionModule.readOptions();
      let changed = false;

      for (let pageIndex = 0; pageIndex < this.pages.length; pageIndex++) {
        const page = this.pages[pageIndex];
        if (!page) continue;

        for (let i = 0; i < (page.leftButtons?.length ?? 0); i++) {
          const btn = page.leftButtons[i];
          if (!btn || !btn.states?.length) continue;
          const optionKey = this.getButtonStorageKey(page, btn, i, 'L');
          if (stored[optionKey] == null) {
            stored[optionKey] = btn.states[btn.stateIndex] ?? btn.states[0];
            changed = true;
          }
        }

        for (let i = 0; i < (page.rightButtons?.length ?? 0); i++) {
          const btn = page.rightButtons[i];
          if (!btn || !btn.states?.length) continue;
          const optionKey = this.getButtonStorageKey(page, btn, i, 'R');
          if (stored[optionKey] == null) {
            stored[optionKey] = btn.states[btn.stateIndex] ?? btn.states[0];
            changed = true;
          }
        }
      }

      if (changed) {
        OptionModule.writeOptions(stored);
      }
    }

    getStoredStateIndex(page, button, index, side) {
      if (!button?.states?.length) return -1;

      const optionKey = this.getButtonStorageKey(page, button, index, side);
      const storedState = OptionModule.readOptions()?.[optionKey];

      if (storedState != null) {
        const exactIndex = button.states.findIndex((s) => s === storedState);
        if (exactIndex >= 0) return exactIndex;
      }

      if (Number.isInteger(button.stateIndex) && button.stateIndex >= 0 && button.stateIndex < button.states.length) {
        return button.stateIndex;
      }

      return 0;
    }

    toggleButton(side, index) {
      const page = this.getCurrentPage();
      const list = side === 'left' ? page.leftButtons : page.rightButtons;
      const btn = list?.[index];
      if (!btn || !btn.states?.length) return;

      const currentIndex = this.getStoredStateIndex(page, btn, index, side === 'left' ? 'L' : 'R');
      const nextIndex = (currentIndex + 1) % btn.states.length;
      const nextState = btn.states[nextIndex] ?? btn.states[0];

      if (typeof btn.onClick === 'function') {
        btn.onClick({
          page,
          side,
          index,
          button: btn,
          uiState: this,
          currentIndex,
          nextIndex,
          nextState
        });
      }

      if (btn.managedExternally) {
        return;
      }

      btn.stateIndex = nextIndex;
      OptionModule.setOption(page?.title ?? 'PAGE', btn?.key || btn?.label || `${side}${index + 1}`, nextState);
    }

    isButtonVisible(button, page) {
      if (!button) return false;
      if (typeof button.show !== 'function') return true;
      return Boolean(button.show({ page, button, uiState: this }));
    }

    getVisibleButtonEntries(side, page = this.getCurrentPage()) {
      const list = side === 'left' ? page?.leftButtons : page?.rightButtons;
      if (!Array.isArray(list)) return [];

      const entries = [];
      for (let i = 0; i < list.length; i++) {
        const button = list[i];
        if (this.isButtonVisible(button, page)) {
          entries.push({ button, actualIndex: i });
        }
      }
      return entries;
    }

    getCombinedButtonGroups(side, page = this.getCurrentPage()) {
      const visibleEntries = this.getVisibleButtonEntries(side, page);
      if (!visibleEntries.length) return [];

      const groups = [];
      let i = 0;
      while (i < visibleEntries.length) {
        const start = i;
        const key = visibleEntries[i]?.button?.key;
        i += 1;

        while (i < visibleEntries.length && visibleEntries[i]?.button?.key === key) {
          i += 1;
        }

        if (key && (i - start) >= 2) {
          groups.push({
            key,
            startSlot: start,
            endSlot: i - 1,
            entries: visibleEntries.slice(start, i)
          });
        }
      }

      return groups;
    }

    getCombinedGroupForSlot(side, slotIndex, page = this.getCurrentPage()) {
      const groups = this.getCombinedButtonGroups(side, page);
      return groups.find((group) => slotIndex >= group.startSlot && slotIndex <= group.endSlot) ?? null;
    }

    toggleButtonBySlot(side, slotIndex) {
      const page = this.getCurrentPage();
      const visibleEntries = this.getVisibleButtonEntries(side, page);
      const entry = visibleEntries?.[slotIndex];
      if (!entry) return;
      this.toggleButton(side, entry.actualIndex);
    }

    getStateLabel(button, page, actualIndex, side) {
      if (page?.title === 'REC') {
        const status = this.recorderModule?.getFlightRecorderMfdStatus?.() ?? {
          installed: false,
          compatible: false,
          recordingState: 'OFF',
          playbackState: 'STOPPED'
        };
        if (!status.compatible) {
          return 'UNAVAIL';
        }
        if (button?.key === 'STATE') {
          return status.recordingState;
        }
        if (button?.key === 'PLAYBACK') {
          if (button?.combinedAction) {
            return button?.states?.[0] ?? button?.label ?? 'N/A';
          }
          return status.playbackState;
        }
      }

      if (page?.title === 'WPN' && (button?.key === 'FIRE' || button?.key === 'JETTISON')) {
        const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
        const modeLoadout = this.weaponsModule?.getModeLoadout?.(mode);
        return this.weaponsModule?.getSelectedLoadDisplay?.(mode, modeLoadout) ?? 'N/A';
      }

      if (page?.title === 'NAV') {
        const abbreviateNavTrafficState = (value) => {
          const token = String(value ?? '').trim().toUpperCase();
          if (token === 'FRIEND') return 'FRND';
          if (token === 'CIVILIAN') return 'CIV';
          if (token === 'UNKNOWN') return 'UNKN';
          return token;
        };

        if (button?.key === 'MARK') {
          return abbreviateNavTrafficState(this.mapModule?.getSelectedTrafficMark?.() || '');
        }
        if (button?.key === 'SHOW') {
          return abbreviateNavTrafficState(this.mapModule?.getShowFilter?.());
        }
        if (button?.key === 'VIEW') {
          return this.mapModule?.getViewMode?.() ?? '';
        }
      }

      const sideToken = side === 'right' ? 'R' : 'L';
      const resolvedIndex = this.getStoredStateIndex(page, button, actualIndex, sideToken);
      return button?.states?.[resolvedIndex] ?? '';
    }

    getLayout(w, h) {
      const frame = {
        left: 0,
        top: 0,
        width: w,
        height: h
      };

      const maxTabButtons = 5;
      const tabY = frame.top + h * 0.022;
      const bottomTabY = frame.top + h * 0.92;
      const tabW = w * 0.14;
      const tabH = h * 0.06;
      const tabGap = w * 0.03;
      const topPages = this.pages.slice(0, maxTabButtons);
      const bottomPages = this.pages.slice(maxTabButtons, maxTabButtons * 2);
      const topTabCount = topPages.length;
      const bottomTabCount = bottomPages.length;
      const tabsTotalW = topTabCount * tabW + Math.max(0, topTabCount - 1) * tabGap;
      const tabStartX = frame.left + (frame.width - tabsTotalW) * 0.5;
      const bottomTabsTotalW = bottomTabCount * tabW + Math.max(0, bottomTabCount - 1) * tabGap;
      const bottomTabStartX = frame.left + (frame.width - bottomTabsTotalW) * 0.5;

      const topTabs = topPages.map((p, i) => ({
        index: i,
        title: p.title,
        x: tabStartX + i * (tabW + tabGap) - w * 0.012,
        y: tabY - h * 0.01,
        w: tabW + w * 0.024,
        h: tabH + h * 0.02
      }));

      const bottomTabs = bottomPages.map((p, i) => ({
        index: i + maxTabButtons,
        title: p.title,
        x: bottomTabStartX + i * (tabW + tabGap) - w * 0.012,
        y: bottomTabY - h * 0.01,
        w: tabW + w * 0.024,
        h: tabH + h * 0.02
      }));

      const leftButtons = [];
      const rightButtons = [];
      const rowStartY = frame.top + h * 0.14;
      const rowStep = h * 0.155 + 3;
      const rowH = h * 0.08;

      for (let i = 0; i < 5; i++) {
        const y = rowStartY + i * rowStep;
        leftButtons.push({ index: i, x: frame.left + w * 0.028, y, w: w * 0.40, h: rowH });
        rightButtons.push({ index: i, x: frame.left + frame.width - w * 0.428, y, w: w * 0.40, h: rowH });
      }

      return { frame, topTabs, bottomTabs, leftButtons, rightButtons };
    }

    handleLocalClick(nx, ny) {
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return false;

      const w = 512;
      const h = 512;
      const x = nx * w;
      const y = ny * h;
      const page = this.getCurrentPage();
      const layout = this.getLayout(w, h);

      for (const tab of layout.topTabs) {
        if (x >= tab.x && x <= tab.x + tab.w && y >= tab.y && y <= tab.y + tab.h) {
          this.setPage(tab.index);
          return true;
        }
      }

      for (const tab of layout.bottomTabs) {
        if (x >= tab.x && x <= tab.x + tab.w && y >= tab.y && y <= tab.y + tab.h) {
          this.setPage(tab.index);
          return true;
        }
      }

      for (const slot of layout.leftButtons) {
        if (slot.index < this.getVisibleButtonEntries('left', page).length
          && x >= slot.x && x <= slot.x + slot.w
          && y >= slot.y && y <= slot.y + slot.h) {
          this.toggleButtonBySlot('left', slot.index);
          return true;
        }
      }

      for (const slot of layout.rightButtons) {
        if (slot.index < this.getVisibleButtonEntries('right', page).length
          && x >= slot.x && x <= slot.x + slot.w
          && y >= slot.y && y <= slot.y + slot.h) {
          this.toggleButtonBySlot('right', slot.index);
          return true;
        }
      }

      return false;
    }

    render(renderer) {
      const ctx = renderer.canvasAPI.context;
      const w = renderer.canvasAPI.canvas.width;
      const h = renderer.canvasAPI.canvas.height;
      const page = this.getCurrentPage();
      const layout = this.getLayout(w, h);
      const baseColor = OptionModule.getOptionValue('HUD', 'COLOR', '#00ff66');
      const color = MfdModule.applyBrightnessToHexColor(baseColor, MfdModule.getMfdBrightnessFactor());
      renderer.canvasAPI.clear();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.frame.left, layout.frame.top, layout.frame.width, layout.frame.height);

      // renderer.canvasAPI.clear();

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;

      if (typeof page.render === 'function') {
        ctx.save();
        page.render(renderer, {
          ctx,
          w,
          h,
          page,
          layout,
          uiState: this,
          color
        });
        ctx.restore();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;

      for (const tab of layout.topTabs) {
        ctx.fillText(tab.title, tab.x + tab.w / 2, tab.y + tab.h / 2);
        if (tab.index === this.pageIndex) {
          ctx.strokeRect(tab.x - 4, tab.y - 2, tab.w + 8, tab.h + 4);
        }
      }

      for (const tab of layout.bottomTabs) {
        ctx.fillText(tab.title, tab.x + tab.w / 2, tab.y + tab.h / 2);
        if (tab.index === this.pageIndex) {
          ctx.strokeRect(tab.x - 4, tab.y - 2, tab.w + 8, tab.h + 4);
        }
      }

      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;

      const visibleLeftButtons = this.getVisibleButtonEntries('left', page);
      const visibleRightButtons = this.getVisibleButtonEntries('right', page);

      const drawStackedLabel = (text, centerX, centerY, stepPx) => {
        const chars = String(text ?? '').split('');
        const totalHeight = Math.max(0, (chars.length - 1) * stepPx);
        const startY = centerY - totalHeight * 0.5;
        for (let c = 0; c < chars.length; c++) {
          ctx.fillText(chars[c], centerX, startY + c * stepPx);
        }
      };

      for (let i = 0; i < visibleLeftButtons.length && i < layout.leftButtons.length; i++) {
        const slot = layout.leftButtons[i];
        const combinedGroup = this.getCombinedGroupForSlot('left', i, page);
        if (combinedGroup) {
          const btn = visibleLeftButtons[i].button;
          const isMinimalGroup = Boolean(combinedGroup.entries?.[0]?.button?.minimal);
          if (isMinimalGroup) {
            const rowCenterY = slot.y + slot.h * 0.55;
            const labelX = slot.x + w * 0.016;
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(btn?.label ?? ''), labelX, rowCenterY);
            ctx.restore();
            continue;
          }

          const actionText = btn?.states?.[0] ?? btn?.label ?? '';
          const rowCenterY = slot.y + slot.h * 0.55;
          const actionX = slot.x + w * 0.016;

          ctx.save();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${actionText}`, actionX, rowCenterY);
          ctx.restore();
          continue;
        }

        const btn = visibleLeftButtons[i].button;
        const label = btn.label;
        const state = this.getStateLabel(btn, page, visibleLeftButtons[i].actualIndex, 'left');
        const rowCenterY = slot.y + slot.h * 0.55;
        const labelX = slot.x + w * 0.016;
        const stateX = slot.x + w * 0.060;
        const labelStep = h * 0.038;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawStackedLabel(label, labelX, rowCenterY, labelStep);
        ctx.restore();

        ctx.fillText(`${state}`, stateX, rowCenterY);
      }

      for (let i = 0; i < visibleRightButtons.length && i < layout.rightButtons.length; i++) {
        const slot = layout.rightButtons[i];
        const combinedGroup = this.getCombinedGroupForSlot('right', i, page);
        if (combinedGroup) {
          const btn = visibleRightButtons[i].button;
          const isMinimalGroup = Boolean(combinedGroup.entries?.[0]?.button?.minimal);
          if (isMinimalGroup) {
            const rowCenterY = slot.y + slot.h * 0.55;
            const labelX = slot.x + slot.w - w * 0.016;
            ctx.save();
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(btn?.label ?? ''), labelX, rowCenterY);
            ctx.restore();
            continue;
          }

          const actionText = btn?.states?.[0] ?? btn?.label ?? '';
          const bracketX = slot.x + slot.w * 0.56;
          const actionX = bracketX + w * 0.026;
          ctx.fillText(`${actionText}`, actionX, slot.y + slot.h * 0.55);
          continue;
        }

        const btn = visibleRightButtons[i].button;
        const label = btn.label;
        const state = this.getStateLabel(btn, page, visibleRightButtons[i].actualIndex, 'right');
        const rowCenterY = slot.y + slot.h * 0.55;
        const labelX = slot.x + slot.w - w * 0.016;
        const labelStateGap = w * (0.060 - 0.016);
        const stateRightX = labelX - labelStateGap;
        const labelStep = h * 0.033;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawStackedLabel(label, labelX, rowCenterY, labelStep);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${state}`, stateRightX, rowCenterY);
        ctx.restore();
      }

      const drawCombinedBracket = (side) => {
        const groups = this.getCombinedButtonGroups(side, page);
        const slots = side === 'left' ? layout.leftButtons : layout.rightButtons;
        if (!groups?.length || !slots?.length) return;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1.5, w * 0.0028);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(h * 0.038)}px monospace`;

        for (const group of groups) {
          const startSlot = slots[group.startSlot];
          const endSlot = slots[group.endSlot];
          if (!startSlot || !endSlot) continue;

          const isMinimalGroup = Boolean(group.entries?.[0]?.button?.minimal);
          if (isMinimalGroup) {
            const button = group.entries[0].button;
            const rawDisplayValue = (Array.isArray(button?.values) && button.values.length)
              ? OptionModule.getOptionValue(page?.title ?? 'PAGE', button?.key || button?.label || '', '')
              : this.getStateLabel(button, page, group.entries[0]?.actualIndex ?? 0, side);
            const hasDisplayValue = String(rawDisplayValue ?? '').trim().length > 0;
            const displayValue = hasDisplayValue
              ? rawDisplayValue
              : (button?.combinedGroupLabel ?? button?.key ?? '');

            const yTop = startSlot.y + startSlot.h * 0.22;
            const yBottom = endSlot.y + endSlot.h * 0.78;
            const yMid = (yTop + yBottom) * 0.5;
            const valueX = side === 'left'
              ? (startSlot.x + w * 0.016)
              : (startSlot.x + startSlot.w - w * 0.016);

            ctx.save();
            ctx.textAlign = side === 'left' ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(displayValue ?? ''), valueX, yMid);
            ctx.restore();
            continue;
          }

          const groupLabel = group.entries?.[0]?.button?.combinedGroupLabel
            ?? group.entries?.[0]?.button?.key
            ?? '';

          const yTop = startSlot.y + startSlot.h * 0.22;
          const yBottom = endSlot.y + endSlot.h * 0.78;
          const yMid = (yTop + yBottom) * 0.5;

          const bracketX = side === 'left'
            ? (startSlot.x + startSlot.w * 0.38)
            : (startSlot.x + startSlot.w * 0.56);
          const bracketArm = w * 0.012;
          const labelOffset = w * 0.048;

          ctx.beginPath();
          if (side === 'left') {
            // Left side should point left: ']'
            ctx.moveTo(bracketX - bracketArm, yTop);
            ctx.lineTo(bracketX, yTop);
            ctx.lineTo(bracketX, yBottom);
            ctx.lineTo(bracketX - bracketArm, yBottom);
          } else {
            // Right side keeps mirrored style.
            ctx.moveTo(bracketX + bracketArm, yTop);
            ctx.lineTo(bracketX, yTop);
            ctx.lineTo(bracketX, yBottom);
            ctx.lineTo(bracketX + bracketArm, yBottom);
          }
          ctx.stroke();

          const labelX = side === 'left'
            ? (bracketX + labelOffset)
            : (bracketX - labelOffset);
          const labelChars = String(groupLabel ?? '').split('');
          const lineStep = h * 0.038;
          const totalHeight = Math.max(0, (labelChars.length - 1) * lineStep);
          const startY = yMid - totalHeight * 0.5;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let c = 0; c < labelChars.length; c++) {
            ctx.fillText(labelChars[c], labelX, startY + c * lineStep);
          }
          ctx.restore();
        }

        ctx.restore();
      };

      drawCombinedBracket('left');
      drawCombinedBracket('right');

      if (Array.isArray(page.lines) && page.lines.length) {
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(h * 0.05)}px monospace`;
        page.lines.forEach((line, i) => {
          ctx.fillText(line, w * 0.5, h * (0.72 + i * 0.07));
        });
      }

      if (this.pendingMfdExport !== null) {
        const request = this.pendingMfdExport;
        this.pendingMfdExport = null;
        this.exportMfdCanvasToPng(renderer.canvasAPI.canvas, request || page.title);
      }
    }
  }

  class SystemModule {
    registerMfdPages(mfdModule) {
      mfdModule.registerPage({
        title: 'SYS',
        leftButtons: [
          { key: 'FLAPS', label: 'FLAP', states: ['MAN', 'AUTO'], stateIndex: 0 },
          { key: 'NA', label: '', states: [''], stateIndex: 0 },
          { key: 'SPEEDBRAKE', label: 'SPLR', states: ['MAX', '25%', '50%', '75%'], stateIndex: 0 },
        ],
        rightButtons: [
          { key: 'REFUELING', label: 'FUEL', states: ['CLOSED', 'OPEN'], stateIndex: 0 },
          { key: 'NA2', label: '', states: [''], stateIndex: 0 },
          { key: 'CANOPY', label: 'CANOPY', states: ['CLOSED', 'OPEN'], stateIndex: 0 },
        ],
        lines: [],
        render: (renderer, renderContext) => {
          const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
          const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
          const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
          const color = renderContext?.color ?? '#00ff66';
          if (!ctx) return;

          F18HudModule.drawGearAndFlapIndicators(ctx, w, h, color, { target: 'mfd' });

                    ctx.save();
                    ctx.fillStyle = color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'alphabetic';
                    ctx.font = `${Math.max(8, Math.round(h * 0.028))}px monospace`;
                    ctx.fillText('Created by NatriumFS', w / 2, h - Math.round(h * 0.07));
                    ctx.fillText('Credits to yicha.25 (壹茶) for targeting pod, combat module, missiles and ADI view.', w / 2, h - Math.round(h * 0.03), w * 0.96);
                    ctx.restore();        }
      });
      return true;
    }
  }

class FlightModule {
  static DISPLAY_MODES = ['ADI', 'FLP', 'MRK', 'MSS', 'IFF'];
  static MARKPOINT_TYPES = ['TARGET', 'FRIENDLY', 'RESQUE', 'CIVILIAN'];
  static MISSION_PAGE_STATES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

  constructor(getAddon = () => null) {
    this.getAddon = getAddon;
    this.selectedFlpIndex = 0;
    this.selectedMarkpointIndex = 0;
    this.missionPageIndex = 0;
  }

  getDisplayMode() {
    return OptionModule.getOption('FLT', 'DISPLAY', OptionModule.getOption('ADI', 'DISPLAY', 'ADI'));
  }

  getDataCartridge() {
    return this.getAddon()?.dataCartridge ?? null;
  }

  getFlightPlanItems() {
    return window.geofs?.flightPlan?.waypointArray ?? [];
  }

  getMarkpointItems() {
    const cartridge = this.getDataCartridge();
    return cartridge?.getMarkpoints?.() ?? [];
  }

  getSelectedFlpIndex(items) {
    if (!items.length) {
      this.selectedFlpIndex = 0;
      return 0;
    }
    this.selectedFlpIndex = Math.max(0, Math.min(this.selectedFlpIndex, items.length - 1));
    return this.selectedFlpIndex;
  }

  getSelectedMarkpointIndex(items) {
    if (!items.length) {
      this.selectedMarkpointIndex = 0;
      return 0;
    }
    this.selectedMarkpointIndex = Math.max(0, Math.min(this.selectedMarkpointIndex, items.length - 1));
    return this.selectedMarkpointIndex;
  }

  stepSelectedFlightPlan(step) {
    const items = this.getFlightPlanItems();
    if (!items.length) return false;

    const current = this.getSelectedFlpIndex(items);
    const next = (current + step + items.length) % items.length;
    this.selectedFlpIndex = next;
    return true;
  }

  stepSelectedMarkpoint(step) {
    const items = this.getMarkpointItems();
    if (!items.length) return false;

    const current = this.getSelectedMarkpointIndex(items);
    const next = (current + step + items.length) % items.length;
    this.selectedMarkpointIndex = next;
    return true;
  }

  activateSelectedFlightPlan() {
    const items = this.getFlightPlanItems();
    if (!items.length) return false;

    const index = this.getSelectedFlpIndex(items);
    window.geofs.flightPlan.selectWaypoint(index);
    return true;
  }

  activateSelectedMarkpoint() {
    const items = this.getMarkpointItems();
    if (!items.length) return false;

    const index = this.getSelectedMarkpointIndex(items);
    const markpoint = items[index];
    const cartridge = this.getDataCartridge();
    cartridge?.setActiveMarkpoint?.(index);
    const targetingPod = this.getAddon()?.targetingPod;
    if (targetingPod?.trackMarkpoint) {
      targetingPod.trackMarkpoint(markpoint);
    }
    return true;
  }

  deleteSelectedFlightPlan() {
    const items = this.getFlightPlanItems();
    if (!items.length) return false;

    const index = this.getSelectedFlpIndex(items);
    window.geofs.flightPlan.deleteWaypoint(index);
    const nextItems = this.getFlightPlanItems();
    this.selectedFlpIndex = Math.max(0, Math.min(index, Math.max(0, nextItems.length - 1)));
    return true;
  }

  deleteSelectedMarkpoint() {
    const items = this.getMarkpointItems();
    if (!items.length) return false;

    const index = this.getSelectedMarkpointIndex(items);
    const cartridge = this.getDataCartridge();
    cartridge.deleteMarkpoint(index);
    const nextItems = this.getMarkpointItems();
    this.selectedMarkpointIndex = Math.max(0, Math.min(index, Math.max(0, nextItems.length - 1)));
    return true;
  }

  setSelectedMarkpointType(type) {
    const items = this.getMarkpointItems();
    if (!items.length) return false;

    const index = this.getSelectedMarkpointIndex(items);
    const cartridge = this.getDataCartridge();
    return cartridge.setMarkpointType(index, type);
  }

  cycleSelectedMarkpointType() {
    const items = this.getMarkpointItems();
    if (!items.length) return false;

    const index = this.getSelectedMarkpointIndex(items);
    const current = items[index]?.type;
    const states = FlightModule.MARKPOINT_TYPES;
    const currentIndex = states.findIndex((type) => type === current);
    const nextIndex = (currentIndex + 1 + states.length) % states.length;
    return this.setSelectedMarkpointType(states[nextIndex]);
  }

  getMissionSections() {
    const data = this.getDataCartridge()?.getMissionData?.() ?? {};
    const rawNotes = String(data.notes ?? data.cruise?.notes ?? '').replace(/\r?\n/g, ' ');
    const noteLines = rawNotes.match(/.{1,38}/g) ?? [''];
    const positions = Array.isArray(data.positions) ? data.positions : [];
    const positionRows = positions.length
      ? positions.map((position, index) => [
        `#${index + 1}`,
        position?.callsign ?? position?.name ?? position?.pilot ?? ''
      ])
      : [['#1', '']];

    return {
      mission: {
        title: 'MISSION',
        rows: [
          ['Name', data.missionName ?? data.name ?? 'Untitled'],
          ['Group', data.group ?? ''],
          ['Flight', data.flight ?? ''],
          ['Wingman', data.wingman ?? '']
        ]
      },
      times: {
        title: 'TIMES',
        rows: [
          ['Start', data.flightData?.startTimeZ ?? ''],
          ['Taxi', data.flightData?.startTaxiZ ?? ''],
          ['T/O', data.flightData?.startToZ ?? ''],
          ['TOT', data.flightData?.timeOverTargetZ ?? ''],
          ['End', data.flightData?.endTimeZ ?? '']
        ]
      },
      cruise: {
        title: 'CRUISE',
        rows: [
          ['Altitude', data.cruise?.altitude ?? ''],
          ['Speed', data.cruise?.speed ?? '']
        ]
      },
      notes: {
        title: 'NOTES',
        rows: noteLines.map((line) => ['', line])
      },
      positions: {
        title: 'POSITIONS',
        rows: positionRows
      },
      landing: {
        title: 'LANDING',
        rows: [
          ['Airport', data.landing?.airportIcao ?? ''],
          ['Runway', data.landing?.runway ?? ''],
          ['NAV1', data.landing?.nav1 ?? ''],
          ['Pattern', data.landing?.pattern ?? ''],
          ['Form', data.landing?.formation ?? '']
        ]
      },
      landingPerf: {
        title: 'LANDING PERF',
        rows: [
          ['Entry AGL', data.landing?.altEntryAgl ?? ''],
          ['Entry SPD', data.landing?.speedEntryKn ?? ''],
          ['Pitch Int', data.landing?.pitchIntervalS ?? ''],
          ['Downwind', data.landing?.speedDownwindKn ?? '']
        ]
      }
    };
  }

  getMissionPages() {
    const sections = this.getMissionSections();
    return [
      {
        rowHeights: [0.38, 0.16, 0.46],
        blocks: [
          { section: sections.mission, col: 0, row: 0, colSpan: 1 },
          { section: sections.times, col: 1, row: 0, colSpan: 1 },
          { section: sections.cruise, col: 0, row: 1, colSpan: 2 },
          { section: sections.notes, col: 0, row: 2, colSpan: 2 }
        ]
      },
      {
        rowHeights: [0.333, 0.333, 0.334],
        blocks: [
          { section: sections.landing, col: 0, row: 0, colSpan: 2 },
          { section: sections.landingPerf, col: 0, row: 1, colSpan: 2 },
          { section: sections.positions, col: 0, row: 2, colSpan: 2 }
        ]
      }
    ];
  }

  getMissionPageCount() {
    return this.getMissionPages().length;
  }

  renderAdi(ctx, w, h, color, layout) {
    const pitch = Number(window.geofs?.animation?.values?.atilt) || 0;
    const roll = Number(window.geofs?.animation?.values?.aroll) || 0;
    const kias = Math.round(Number(window.geofs?.animation?.values?.kias) || 0);
    const alt = Math.round(Number(window.geofs?.animation?.values?.altitude) || 0);
    const vsi = Math.round(Number(window.geofs?.animation?.values?.climbrate) || 0);

    const frame = layout?.frame ?? { left: 0, top: 0, width: w, height: h };

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const cx = frame.left + frame.width * 0.5;
    const cy = frame.top + frame.height * 0.54;
    const radius = frame.width * 0.31;
    const pScale = 8;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate((roll * Math.PI) / 180);
    ctx.translate(0, -pitch * pScale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 4; i < radius * 4; i += 8) {
      ctx.moveTo(-radius * 3, i);
      ctx.lineTo(radius * 3, i);
    }
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-radius * 3, 0);
    ctx.lineTo(radius * 3, 0);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 5);
    ctx.lineTo(0, radius * 5);
    ctx.stroke();

    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let p = -90; p <= 90; p += 10) {
      if (p === 0) continue;
      const py = -p * pScale;
      const lineW = (p % 20 === 0) ? 50 : 25;
      ctx.beginPath();
      ctx.moveTo(-lineW, py);
      ctx.lineTo(lineW, py);
      ctx.stroke();
      ctx.fillStyle = '#000000';
      ctx.fillRect(-18, py - 9, 36, 18);
      ctx.fillStyle = color;
      ctx.fillText(Math.abs(p), 0, py + 1);
    }
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const wx = cx;
    const wy = cy;
    const ww = w * 0.027;
    const wh = h * 0.016;
    const stub = w * 0.010;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx - ww, wy);
    ctx.lineTo(wx - ww * 0.55, wy + wh);
    ctx.lineTo(wx, wy - wh * 0.15);
    ctx.lineTo(wx + ww * 0.55, wy + wh);
    ctx.lineTo(wx + ww, wy);
    ctx.moveTo(wx - ww - stub, wy);
    ctx.lineTo(wx - ww, wy);
    ctx.moveTo(wx + ww, wy);
    ctx.lineTo(wx + ww + stub, wy);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const boxY = cy - radius - h * 0.012;
    const spdX = w * 0.25;
    const altX = w * 0.82;

    ctx.lineWidth = 2;
    ctx.strokeRect(spdX - 42, boxY - 20, 84, 40);
    ctx.font = 'bold 26px monospace';
    ctx.fillText(kias, spdX, boxY + 2);

    ctx.strokeRect(altX - 52, boxY - 22, 104, 44);
    const altRounded = Math.max(0, Math.round(alt));
    const thousands = Math.floor(altRounded / 1000);
    const hundredsText = String(altRounded % 1000).padStart(3, '0');
    const rightX = altX + 52 - w * 0.014;
    const altCenterY = boxY + 1;

    ctx.textAlign = 'right';
    ctx.font = 'bold 22px monospace';
    const hundredsWidth = ctx.measureText(hundredsText).width;
    ctx.fillText(hundredsText, rightX, altCenterY);
    ctx.font = 'bold 30px monospace';
    ctx.fillText(String(thousands), rightX - hundredsWidth - w * 0.006, altCenterY);

    const vsiText = `${vsi >= 0 ? ' ' : ''}${vsi}`;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(vsiText, altX - w * 0.07, boxY - h * 0.08);

    ctx.restore();
  }

  renderSelectableList(ctx, w, h, items, selectedIndex, title, rowBuilder, color, options = {}) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;
    ctx.fillText(title, w * 0.22, h * 0.16);

    if (!items.length) {
      ctx.fillText('NO ITEMS', w * 0.22, h * 0.26);
      ctx.restore();
      return;
    }

    const keyX = w * (options.keyXRatio ?? 0.24);
    const valueX = w * (options.valueXRatio ?? 0.62);
    const prefixOffset = w * (options.prefixOffsetRatio ?? 0.018);
    let y = h * 0.25;
    for (let i = 0; i < items.length; i++) {
      if (y > h * 0.88) break;
      const item = items[i];
      const prefix = i === selectedIndex ? '>' : ' ';
      const row = rowBuilder(item, i) ?? {};
      const rowColor = options.rowColorBuilder ? options.rowColorBuilder(item, i) : color;
      ctx.fillStyle = rowColor;
      ctx.fillText(prefix, keyX - prefixOffset, y);
      ctx.fillText(String(row.key ?? ''), keyX, y);
      ctx.fillText(String(row.value ?? ''), valueX, y);
      y += h * 0.055;
    }

    ctx.restore();
  }

  renderMissionGroup(ctx, group, x, y, width, height, color) {
    const rows = group?.rows ?? [];
    const keyValueOffsetRatio = 0.52;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(String(group?.title ?? ''), x + 10, y + 16);

    if (group?.title === 'NOTES') {
      let lineY = y + 40;
      ctx.font = 'bold 16px monospace';
      for (const [, value] of rows) {
        if (lineY > y + height - 12) break;
        ctx.fillText(String(value ?? ''), x + 10, lineY);
        lineY += 20;
      }
      return;
    }

    if (group?.title === 'CRUISE') {
      const left = rows[0] ?? ['Altitude', ''];
      const right = rows[1] ?? ['Speed', ''];
      const colWidth = width * 0.5;
      const leftX = x + 10;
      const rightX = x + colWidth + 10;
      const leftValueX = leftX + colWidth * keyValueOffsetRatio;
      const rightValueX = rightX + colWidth * keyValueOffsetRatio;
      const rowY = y + 44;

      ctx.font = 'bold 16px monospace';
      ctx.fillText(String(left[0] ?? ''), leftX, rowY);
      ctx.fillText(String(left[1] ?? ''), leftValueX, rowY);
      ctx.fillText(String(right[0] ?? ''), rightX, rowY);
      ctx.fillText(String(right[1] ?? ''), rightValueX, rowY);
      return;
    }

    if (group?.title === 'POSITIONS') {
      const shown = rows.slice(0, 8);
      const twoColumns = shown.length > 4;
      const colWidth = twoColumns ? width * 0.5 : width;
      const leftPad = 10;
      const valueOffset = twoColumns ? colWidth * keyValueOffsetRatio : width * keyValueOffsetRatio;
      ctx.font = 'bold 16px monospace';

      for (let i = 0; i < shown.length; i++) {
        const column = twoColumns ? Math.floor(i / 4) : 0;
        const rowIndex = twoColumns ? (i % 4) : i;
        const rowY = y + 40 + rowIndex * 20;
        if (rowY > y + height - 12) break;
        const colX = x + column * colWidth;
        const keyX = colX + leftPad;
        const valueX = colX + leftPad + valueOffset;
        ctx.fillText(String(shown[i][0] ?? ''), keyX, rowY);
        ctx.fillText(String(shown[i][1] ?? ''), valueX, rowY);
      }
      return;
    }

    const keyX = x + 10;
    const valueX = x + width * keyValueOffsetRatio;
    let rowY = y + 40;
    ctx.font = 'bold 16px monospace';
    for (const [key, value] of rows) {
      if (rowY > y + height - 12) break;
      ctx.fillText(String(key ?? ''), keyX, rowY);
      ctx.fillText(String(value ?? ''), valueX, rowY);
      rowY += 20;
    }
  }

  renderMissionData(ctx, w, h, color, renderContext) {
    const pages = this.getMissionPages();
    const pageCount = Math.max(1, pages.length);
    const pageButton = renderContext?.page?.leftButtons?.find((button) => button?.key === 'PAGE');

    this.missionPageIndex = Math.max(0, Math.min(this.missionPageIndex, pageCount - 1));
    if (pageButton) {
      pageButton.stateIndex = this.missionPageIndex;
    }

    const activePage = pages[this.missionPageIndex] ?? { rowHeights: [0.333, 0.333, 0.334], blocks: [] };
    const pageBlocks = activePage.blocks ?? [];

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.043)}px monospace`;
    ctx.fillText(`MISSION DATA ${this.missionPageIndex + 1}/${pageCount}`, w * 0.22, h * 0.12);

    const gridLeft = w * 0.22;
    const gridTop = h * 0.17;
    const gapX = w * 0.02;
    const gapY = h * 0.03;
    const gridW = w * 0.70;
    const gridH = h * 0.74;
    const boxW = (gridW - gapX) / 2;
    const availableH = gridH - gapY * 2;
    const rowHeights = activePage.rowHeights ?? [0.333, 0.333, 0.334];
    const rowSizes = [
      availableH * (rowHeights[0] ?? 0.333),
      availableH * (rowHeights[1] ?? 0.333),
      availableH * (rowHeights[2] ?? 0.334)
    ];
    const rowOffsets = [
      0,
      rowSizes[0] + gapY,
      rowSizes[0] + gapY + rowSizes[1] + gapY
    ];

    for (const block of pageBlocks) {
      const column = block.col ?? 0;
      const row = block.row ?? 0;
      const colSpan = block.colSpan ?? 1;
      const x = gridLeft + column * (boxW + gapX);
      const y = gridTop + (rowOffsets[row] ?? rowOffsets[0]);
      const width = colSpan === 2 ? (boxW * 2 + gapX) : boxW;
      const height = rowSizes[row] ?? rowSizes[0];
      this.renderMissionGroup(ctx, block.section, x, y, width, height, color);
    }

    ctx.restore();
  }

  renderIff(ctx, w, h, color) {
    const codes = this.getDataCartridge()?.getIffCodes?.() ?? [];

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;
    ctx.fillText('IFF CODEBOOK', w * 0.22, h * 0.16);

    ctx.font = `bold ${Math.round(h * 0.024)}px monospace`;
    ctx.fillText('Interrogate: Say "IFF [CS] - Code [NO.]"', w * 0.22, h * 0.20);
    ctx.fillText('Response: "IFF [Code]"', w * 0.22, h * 0.235);

    if (!codes.length) {
      ctx.fillText('NO IFF CODES', w * 0.22, h * 0.26);
      ctx.restore();
      return;
    }

    const firstColumnLimit = 7;
    const shown = codes.slice(0, firstColumnLimit * 2);
    const baseX = w * 0.22;
    const columnGap = w * 0.31;
    const responseOffset = w * 0.12;
    const lineHeight = h * 0.053;
    ctx.font = `bold ${Math.round(h * 0.043)}px monospace`;

    for (let i = 0; i < shown.length; i++) {
      const column = i >= firstColumnLimit ? 1 : 0;
      const row = i % firstColumnLimit;
      const y = h * 0.29 + row * lineHeight;
      if (y > h * 0.88) break;
      const code = shown[i];
      const keyX = baseX + column * columnGap;
      const valueX = keyX + responseOffset;
      ctx.fillText(String(code.key ?? ''), keyX, y);
      ctx.fillText(String(code.response ?? ''), valueX, y);
    }

    ctx.restore();
  }

  registerMfdPages(mfdModule) {
    mfdModule.registerPage({
      title: 'FLT',
      leftButtons: [
        {
          key: 'DISPLAY',
          label: 'DISP',
          states: FlightModule.DISPLAY_MODES,
          stateIndex: 0
        },
        {
          key: 'N/A20',
          label: '',
          states: [''],
          stateIndex: 0,
          show: () => this.getDisplayMode() === 'MSS' && this.getMissionPageCount() > 1
        },
        {
          key: 'PAGE',
          label: 'PAGE',
          states: FlightModule.MISSION_PAGE_STATES,
          stateIndex: 0,
          managedExternally: true,
          show: () => this.getDisplayMode() === 'MSS' && this.getMissionPageCount() > 1,
          onClick: ({ button }) => {
            const pageCount = this.getMissionPageCount();
            if (pageCount <= 1) {
              this.missionPageIndex = 0;
              if (button) button.stateIndex = 0;
              return;
            }
            this.missionPageIndex = (this.missionPageIndex + 1) % pageCount;
            if (button) button.stateIndex = this.missionPageIndex;
          }
        },
        {
          key: 'PREV',
          label: '↑',
          states: [''],
          stateIndex: 0,
          managedExternally: true,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          },
          onClick: () => {
            if (this.getDisplayMode() === 'FLP') {
              this.stepSelectedFlightPlan(-1);
              return;
            }
            this.stepSelectedMarkpoint(-1);
          }
        },
        {
          key: 'NEXT',
          label: '↓',
          states: [''],
          stateIndex: 0,
          managedExternally: true,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          },
          onClick: () => {
            if (this.getDisplayMode() === 'FLP') {
              this.stepSelectedFlightPlan(1);
              return;
            }
            this.stepSelectedMarkpoint(1);
          }
        },
        {
          key: 'TYPE',
          label: 'TYPE',
          states: [''],
          stateIndex: 0,
          managedExternally: true,
          show: () => this.getDisplayMode() === 'MRK',
          onClick: () => {
            this.cycleSelectedMarkpointType();
          }
        }
      ],
      rightButtons: [
        {
          key: 'N/A30',
          label: '',
          states: [''],
          stateIndex: 0,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          }
        },
        {
          key: 'ACTIVATE',
          label: 'ACTIVATE',
          states: [''],
          stateIndex: 0,
          managedExternally: true,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          },
          onClick: () => {
            if (this.getDisplayMode() === 'FLP') {
              this.activateSelectedFlightPlan();
              return;
            }
            this.activateSelectedMarkpoint();
          }
        },
        {
          key: 'N/A31',
          label: '',
          states: [''],
          stateIndex: 0,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          }
        },
        {
          key: 'N/A32',
          label: '',
          states: [''],
          stateIndex: 0,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          }
        },
        {
          key: 'DELETE',
          label: 'DEL',
          states: [''],
          stateIndex: 0,
          managedExternally: true,
          show: () => {
            const mode = this.getDisplayMode();
            return mode === 'FLP' || mode === 'MRK';
          },
          onClick: () => {
            if (this.getDisplayMode() === 'FLP') {
              this.deleteSelectedFlightPlan();
              return;
            }
            this.deleteSelectedMarkpoint();
          }
        }
      ],
      lines: [],
      render: (renderer, renderContext) => {
        const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
        const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
        const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
        const color = renderContext?.color ?? '#00ff66';
        const layout = renderContext?.layout;
        if (!ctx) return;

        const displayMode = this.getDisplayMode();

        if (displayMode === 'ADI') {
          this.renderAdi(ctx, w, h, color, layout);
          return;
        }

        if (displayMode === 'FLP') {
          const items = this.getFlightPlanItems();
          const selectedIndex = this.getSelectedFlpIndex(items);
          this.renderSelectableList(
            ctx,
            w,
            h,
            items,
            selectedIndex,
            'FLIGHTPLAN',
            (item, index) => ({
              key: `WP${index + 1} ${item.ident ?? ''}`.trim(),
              value: `${item.type ?? ''}${item?.selected ? ' (ACTIVE)' : ''}`
            }),
            color,
            {
              keyXRatio: 0.23,
              valueXRatio: 0.60,
              prefixOffsetRatio: 0.028
            }
          );
          return;
        }

        if (displayMode === 'MRK') {
          const items = this.getMarkpointItems();
          const selectedIndex = this.getSelectedMarkpointIndex(items);
          this.renderSelectableList(
            ctx,
            w,
            h,
            items,
            selectedIndex,
            'MARKPOINTS',
            (item, index) => ({
              key: `MRK${index + 1} ${item.abbreviation ?? item.name ?? ''}`.trim(),
              value: `${item.type ?? ''}${item?.active ? ' (ACTIVE)' : ''}`
            }),
            color,
            {
              keyXRatio: 0.23,
              valueXRatio: 0.56,
              prefixOffsetRatio: 0.028,
              rowColorBuilder: (item) => this.getDataCartridge()?.getMarkpointColor(item?.type) ?? color
            }
          );
          return;
        }

        if (displayMode === 'MSS') {
          this.renderMissionData(ctx, w, h, color, renderContext);
          return;
        }

        this.renderIff(ctx, w, h, color);
      }
    });

    return true;
  }
}

window.FlightModule = FlightModule;

class TargetingPodModule {
  // TGP module implementation.
  constructor(getAddon = () => null) {
    this.getAddon = getAddon;
    this.activePage = null;
    this.pendingMarkpoint = null;
  }

  _resolveMarkpointTarget(markpoint) {
    const lat = Number(markpoint?.lat);
    const lon = Number(markpoint?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    let altM = Number(markpoint?.altM);
    if (!Number.isFinite(altM) && typeof Cesium !== 'undefined') {
      const viewer = window.geofs?.api?.viewer;
      const globe = viewer?.scene?.globe;
      const cartographic = Cesium.Cartographic.fromDegrees(lon, lat);
      altM = Number(globe?.getHeight(cartographic));
    }

    if (!Number.isFinite(altM)) {
      altM = 0;
    }

    return {
      lat,
      lon,
      altM,
      createdAt: Date.now()
    };
  }

  trackMarkpoint(markpoint) {
    const page = this.activePage;
    const target = this._resolveMarkpointTarget(markpoint);

    if (!target) {
      return false;
    }

    if (page?._applyLockedPoint && page?._setLockState) {
      page._markPoint = target;
      page._applyLockedPoint(target, 'MRK', 'MRK');
      page._setLockState('MRK');
      return true;
    }

    this.pendingMarkpoint = target;
    return true;
  }

  registerMfdPages(mfdModule) {
    const owner = this;
    const getMapModule = () => this.getAddon()?.map ?? null;
    const getOption = (page, key, fallback) => OptionModule.getOption(page, key, fallback);
    const getMode = () => OptionModule.getOption('TGP', 'MODE', 'CAPTURE');
    const isCaptureMode = () => getMode() === 'CAPTURE';
    const isMarkMode = () => getMode() === 'MARK';
    const isCaptureOrMarkMode = () => {
      const mode = getMode();
      return mode === 'CAPTURE' || mode === 'MARK';
    };
    const isSettingsMode = () => getMode() === 'SETTINGS';

    mfdModule.registerPage({
      title: 'TGP',
      leftButtons: [
        {
          key: 'MODE',
          label: 'MODE',
          states: ['CAPTURE', 'MARK', 'SETTINGS'],
          stateIndex: 0,
          onClick: ({ page, nextState }) => {
            if (!page) return;

            if (nextState === 'MARK') {
              page._setLockState('FREE');
              page._resetLockData();
              page._lockedCallsign = 'N/A';
              page._relYaw = 0;
              page._relPitch = 0;
            } else if (nextState === 'CAPTURE') {
              const lockState = OptionModule.getOption('TGP', 'LOCK', 'FREE');
              if (lockState === 'FIX' || lockState === 'MARK' || lockState === 'MRK') {
                page._setLockState('FREE');
              }
            }
          }
        },
        {
          key: 'RANGE',
          label: '↑',
          states: ['0.1', '0.5', '1', '2', '5', '10', '15', '20', '30', '45', '60', '90', '120'],
          stateIndex: 4,
          minimal: true,
          managedExternally: true,
          combinedGroupLabel: 'RNG',
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => page && page._stepRange(1)
        },
        {
          key: 'RANGE',
          label: '↓',
          states: ['0.1', '0.5', '1', '2', '5', '10', '15', '20', '30', '45', '60', '90', '120'],
          stateIndex: 4,
          minimal: true,
          managedExternally: true,
          combinedGroupLabel: 'RNG',
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => page && page._stepRange(-1)
        },
        {
          key: 'LOCK',
          label: 'LOCK',
          states: ['FREE', 'TRK', 'WPT', 'MRK', 'FIX', 'MARK'],
          stateIndex: 0,
          managedExternally: true,
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => {
            if (!page) return;

            if (isMarkMode()) {
              const lockState = OptionModule.getOption('TGP', 'LOCK', 'FREE');
              if (lockState === 'FIX' || lockState === 'MARK' || lockState === 'MRK') {
                page._setLockState('FREE');
                page._resetLockData();
                page._lockedCallsign = 'N/A';
                page._relYaw = 0;
                page._relPitch = 0;
                return;
              }

              const lookPoint = page._resolveCurrentAimGroundPoint();
              if (!lookPoint) return;

              page._applyLockedPoint(lookPoint, 'FIX', 'FIX');
              return;
            }

            const cycle = ['FREE', 'TRK', 'WPT', 'MRK'];
            const current = OptionModule.getOption('TGP', 'LOCK', 'FREE');
            const currentIndex = Math.max(0, cycle.findIndex((state) => state === current));
            const next = cycle[(currentIndex + 1) % cycle.length];

            if (next === 'MRK') {
              if (!page._lockActiveMarkpointFromCartridge()) {
                page._setLockState('FREE');
                page._resetLockData();
                page._lockedCallsign = 'N/A';
              }
              return;
            }

            page._setLockState(next);

            if (next === 'FREE') {
              page._resetLockData();
              page._lockedCallsign = 'N/A';
            }
          }
        },
        {
          key: 'CAPTURE',
          label: 'CPT',
          states: [''],
          show() { return isCaptureMode(); },
          onClick: ({ page, uiState }) => {
            uiState.queueMfdExport(page.title);
          },
          stateIndex: 0
        },
        {
          key: 'MARKPOINT',
          label: 'MRK',
          states: [''],
          show() { return isMarkMode(); },
          onClick: ({ page }) => {
            if (!page) return;
            owner.activePage = page;
            const lookPoint = page._resolveCurrentAimGroundPoint();
            if (!lookPoint) return;

            page._markPoint = {
              lat: lookPoint.lat,
              lon: lookPoint.lon,
              altM: lookPoint.altM,
              createdAt: Date.now()
            };

            page._applyLockedPoint(page._markPoint, 'MARK', 'MRK');

            const addon = this.getAddon?.();
            const dataCartridge = addon?.dataCartridge;
            if (dataCartridge?.addTgpMarkpoint) {
              dataCartridge.addTgpMarkpoint(page._markPoint);
            }
          },
          stateIndex: 0
        },
        {
          key: 'NA10',
          label: '',
          states: [''],
          stateIndex: 0,
          show() { return isSettingsMode(); }
        },
        {
          key: 'FREQUENCY',
          label: 'FREQ',
          states: ['2', '3', '5', '10', '15', '30', '45', '60'],
          stateIndex: 3,
          show() { return isSettingsMode(); }
        },
        {
          key: 'NA12',
          label: '',
          states: [''],
          stateIndex: 0,
          show() { return isSettingsMode(); }
        },
        {
          key: 'POWER',
          label: 'PWR',
          states: ['ON', 'OFF'],
          stateIndex: 1,
          show() { return isSettingsMode(); }
        },
      ],
      rightButtons: [
        {
          key: 'SLEW_UP',
          label: '↑',
          states: [''],
          stateIndex: 0,
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => page && page._updateSlew(0, 1)
        },
        {
          key: 'SLEW_DOWN',
          label: '↓',
          states: [''],
          stateIndex: 0,
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => page && page._updateSlew(0, -1)
        },
        {
          key: 'SLEW_LEFT',
          label: '←',
          states: [''],
          stateIndex: 0,
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => page && page._updateSlew(-1, 0)
        },
        {
          key: 'SLEW_RIGHT',
          label: '→',
          states: [''],
          stateIndex: 0,
          show() { return isCaptureOrMarkMode(); },
          onClick: ({ page }) => page && page._updateSlew(1, 0)
        },
        {
          key: 'SLEW_STEP',
          label: 'STEP',
          states: ['0.01', '0.05', '0.1', '0.25', '0.5', '1', '2.5', '5', '10'],
          stateIndex: 2,
          show() { return isCaptureOrMarkMode(); }
        },
        {
          key: 'STYLE',
          label: 'STL',
          states: ['DAY', 'NIGHT', 'WHITE'],
          stateIndex: 0,
          show() { return isSettingsMode(); }
        },
        {
          key: 'NA3',
          label: '',
          states: [''],
          stateIndex: 0,
          show() { return isSettingsMode(); }
        },
        {
          key: 'TRACK',
          label: 'TRK',
          states: ['SIMPLE', 'ADVANCED'],
          stateIndex: 0,
          show() { return isSettingsMode(); }
        },
        {
          key: 'NA4',
          label: '',
          states: [''],
          stateIndex: 0,
          show() { return isSettingsMode(); }
        },
        {
          key: 'SLEW_RESET',
          label: 'SLEW',
          states: ['RESET'],
          stateIndex: 0,
          onClick: ({ page }) => page && page._resetSlew(),
          show() { return isSettingsMode(); }
        },
      ],

      _snap: null,
      _snapCtx: null,
      _snapCoverCrop: null,
      _styleCanvas: null,
      _styleCtx: null,
      _captureQueued: false,
      _captureFovRad: 0,
      _captureIsLocked: false,
      _tick: 0,
      _camYaw: 0,
      _camPitch: -15,
      _relYaw: 0,
      _relPitch: 0,
      _lockMode: 'FREE',
      _activeMode: 'A/G',
      _targetWorldH: 0,
      _targetWorldP: 0,
      _targetLat: null,
      _targetLon: null,
      _targetAltM: null,
      _targetNorthM: 0,
      _targetEastM: 0,
      _targetUpM: 0,
      _lockTargetKey: null,
      _lockedCallsign: 'N/A',
      _lockedDist: null,
      _targetAltFt: 0,
      _targetHdg: 0,
      _closureKts: 0,
      _trackUpdateByUid: {},
      _markPoint: null,

      _WGS84_A: 6378137.0,
      _WGS84_E2: 0.00669437999014,

      _llaToEcef: function(latDeg, lonDeg, altM) {
        const lat = latDeg * Math.PI / 180;
        const lon = lonDeg * Math.PI / 180;
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const sinLon = Math.sin(lon);
        const cosLon = Math.cos(lon);
        const N = this._WGS84_A / Math.sqrt(1 - this._WGS84_E2 * sinLat * sinLat);
        return [
          (N + altM) * cosLat * cosLon,
          (N + altM) * cosLat * sinLon,
          (N * (1 - this._WGS84_E2) + altM) * sinLat
        ];
      },

      _ecefDeltaToNeu: function(refLatDeg, refLonDeg, dX, dY, dZ) {
        const lat = refLatDeg * Math.PI / 180;
        const lon = refLonDeg * Math.PI / 180;
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const sinLon = Math.sin(lon);
        const cosLon = Math.cos(lon);
        const dN = -sinLat * cosLon * dX - sinLat * sinLon * dY + cosLat * dZ;
        const dE = -sinLon * dX + cosLon * dY;
        const dU = cosLat * cosLon * dX + cosLat * sinLon * dY + sinLat * dZ;
        return [dN, dE, dU];
      },

      // Compute closure rate from relative velocity projected on LOS.
      _computeClosureRateKts: function(dN, dE, dU, targetHeadingDeg, targetSpeedKts) {
        const losLen = Math.hypot(dN, dE, dU);
        if (!losLen) return 0;

        const losN = dN / losLen;
        const losE = dE / losLen;
        const losU = dU / losLen;

        const ownHeadingDeg = Number(window.geofs?.animation?.values?.heading ?? 0);
        const ownSpeedMps = Number(window.geofs?.animation?.values?.airspeedms ?? 0);
        const ownHeadingRad = ownHeadingDeg * Math.PI / 180;
        const ownVelN = ownSpeedMps * Math.cos(ownHeadingRad);
        const ownVelE = ownSpeedMps * Math.sin(ownHeadingRad);
        const ownVelU = 0;

        const tgtHeadingRad = targetHeadingDeg * Math.PI / 180;
        const tgtSpeedMps = targetSpeedKts / 1.94384;
        const tgtVelN = tgtSpeedMps * Math.cos(tgtHeadingRad);
        const tgtVelE = tgtSpeedMps * Math.sin(tgtHeadingRad);
        const tgtVelU = 0;

        const relVelN = tgtVelN - ownVelN;
        const relVelE = tgtVelE - ownVelE;
        const relVelU = tgtVelU - ownVelU;
        const distanceRateMps = relVelN * losN + relVelE * losE + relVelU * losU;
        const closureMps = -distanceRateMps;
        return Math.round(closureMps * 1.94384);
      },

      // Compute relative local offsets and range using map-style approximation.
      _computeRelativePositionMeters: function(ownLat, ownLon, ownAltM, targetLat, targetLon, targetAltM) {
        const latAvgRad = ((ownLat + targetLat) / 2) * Math.PI / 180;
        const dE = (targetLon - ownLon) * 111320 * Math.cos(latAvgRad);
        const dN = (targetLat - ownLat) * 110540;
        const dU = targetAltM - ownAltM;
        const distM = Math.hypot(dN, dE, dU);
        const distNm = distM * 0.000539957;
        return { dN, dE, dU, distM, distNm };
      },

      // Read GeoFS multiplayer distance and convert feet to NM.
      _getTrackDistanceNmFromMultiplayer: function(trackUid) {
        if (!trackUid) return null;
        const users = Object.values(window.multiplayer?.visibleUsers ?? {});
        for (const user of users) {
          const uid = String(user?.id ?? user?.uid ?? '');
          if (uid !== String(trackUid)) continue;
          const distanceFeet = Number(user?.distance);
          if (!Number.isFinite(distanceFeet)) return null;
          return distanceFeet / 6076.11549;
        }
        return null;
      },

      // Track when a multiplayer contact position actually changed.
      _getTrackUpdateAgeMs: function(trackUid, lat, lon, altM) {
        const uid = String(trackUid ?? '');
        if (!uid) return 0;

        const now = Date.now();
        const cache = this._trackUpdateByUid[uid];
        if (!cache) {
          this._trackUpdateByUid[uid] = { lat, lon, altM, changedMs: now };
          return 0;
        }

        if (cache.lat !== lat || cache.lon !== lon || cache.altM !== altM) {
          cache.lat = lat;
          cache.lon = lon;
          cache.altM = altM;
          cache.changedMs = now;
          return 0;
        }

        return now - cache.changedMs;
      },

      // Predict tracked position from heading/speed and elapsed update age.
      _predictTrackedPosition: function(lat, lon, altM, headingDeg, speedKts, lastSeenMs) {
        const dtSec = Math.max(0, (Date.now() - lastSeenMs) / 1000);
        if (!dtSec) return { lat, lon, altM };

        const speedMps = speedKts / 1.94384;
        const travelM = speedMps * dtSec;
        const hdgRad = headingDeg * Math.PI / 180;
        const dN = travelM * Math.cos(hdgRad);
        const dE = travelM * Math.sin(hdgRad);
        const nextLat = lat + (dN / 110540);
        const nextLon = lon + (dE / (111320 * Math.cos(lat * Math.PI / 180)));
        return { lat: nextLat, lon: nextLon, altM };
      },

      _setLockState: function(nextState) {
        const state = String(nextState ?? 'FREE').toUpperCase();
        OptionModule.setOption('TGP', 'LOCK', state);
        this._lockMode = state;

        const lockButtons = this.leftButtons?.filter((button) => button?.key === 'LOCK') ?? [];
        for (const button of lockButtons) {
          const index = button.states.findIndex((entry) => entry === state);
          button.stateIndex = index >= 0 ? index : 0;
        }
      },

      _getCaptureOrientation: function(isLocked) {
        const animVals = window.geofs?.animation?.values ?? {};
        const acHeading = Number(animVals.heading360 ?? animVals.heading ?? 0);
        const acPitch = -Number(animVals.atilt ?? 0);
        const acRoll = Number(animVals.aroll ?? 0);
        const normDeg = (a) => ((a % 360) + 540) % 360 - 180;

        let finalH;
        let finalP;
        let finalR;

        if (isLocked && this._lockTargetKey) {
          const viewer = window.geofs?.api?.viewer;
          let refLat = Number(window.geofs?.camera?.lla?.[0]);
          let refLon = Number(window.geofs?.camera?.lla?.[1]);
          let refAlt = Number(window.geofs?.camera?.lla?.[2]);

          const sceneCamera = viewer?.scene?.camera;
          if (typeof Cesium !== 'undefined' && sceneCamera?.positionWC) {
            const carto = Cesium.Cartographic.fromCartesian(sceneCamera.positionWC);
            refLat = Cesium.Math.toDegrees(carto.latitude);
            refLon = Cesium.Math.toDegrees(carto.longitude);
            refAlt = Number(carto.height);
          }

          const tgtLat = Number(this._targetLat);
          const tgtLon = Number(this._targetLon);
          const tgtAlt = Number(this._targetAltM);

          if (Number.isFinite(refLat) && Number.isFinite(refLon) && Number.isFinite(refAlt)
            && Number.isFinite(tgtLat) && Number.isFinite(tgtLon) && Number.isFinite(tgtAlt)) {
            const refEcef = this._llaToEcef(refLat, refLon, refAlt);
            const tgtEcef = this._llaToEcef(tgtLat, tgtLon, tgtAlt);
            const dX = tgtEcef[0] - refEcef[0];
            const dY = tgtEcef[1] - refEcef[1];
            const dZ = tgtEcef[2] - refEcef[2];
            const [dN, dE, dU] = this._ecefDeltaToNeu(refLat, refLon, dX, dY, dZ);

            const hdgRad = acHeading * Math.PI / 180;
            const pitchRad = acPitch * Math.PI / 180;
            const rollRad = -acRoll * Math.PI / 180;

            const xH = dN * Math.cos(hdgRad) + dE * Math.sin(hdgRad);
            const yH = -dN * Math.sin(hdgRad) + dE * Math.cos(hdgRad);
            const zH = dU;

            const xP = xH * Math.cos(pitchRad) + zH * Math.sin(pitchRad);
            const yP = yH;
            const zP = -xH * Math.sin(pitchRad) + zH * Math.cos(pitchRad);

            const xB = xP;
            const yB = yP * Math.cos(rollRad) - zP * Math.sin(rollRad);
            const zB = yP * Math.sin(rollRad) + zP * Math.cos(rollRad);

            finalH = normDeg(Math.atan2(yB, xB) * 180 / Math.PI + this._relYaw);
            finalP = Math.max(-85, Math.min(85, Math.atan2(zB, Math.hypot(xB, yB)) * 180 / Math.PI + this._relPitch));
            finalR = 0;
          } else {
            finalH = normDeg(this._targetWorldH - acHeading + this._relYaw);
            finalP = Math.max(-85, Math.min(85, this._targetWorldP - acPitch + this._relPitch));
            finalR = 0;
          }
        } else {
          finalH = this._camYaw;
          finalP = this._camPitch;
          finalR = 0;
        }

        return { finalH, finalP, finalR };
      },

      _resolveCurrentAimGroundPoint: function() {
        const viewer = window.geofs?.api?.viewer;
        const mode1 = window.geofs?.camera?.modes?.[1];
        if (!viewer?.scene || !mode1 || typeof Cesium === 'undefined') return null;

        const fovDeg = Number(getOption('TGP', 'RANGE', 30));
        const fovRad = fovDeg * Math.PI / 180;
        const currentLock = OptionModule.getOption('TGP', 'LOCK', 'FREE');
        const isLocked = currentLock !== 'FREE';
        const { finalH, finalP, finalR } = this._getCaptureOrientation(isLocked);

        const oPos = [...mode1.position];
        const oOri = [...mode1.orientation];
        const oFov = mode1.FOV;
        const oCurr = mode1.orientations ? [...mode1.orientations.current] : [...oOri];
        const oLast = mode1.orientations ? [...mode1.orientations.last] : [...oOri];
        const frustum = viewer.scene.camera.frustum;
        const origFrustumFov = frustum.fov;

        try {
          mode1.position = [oPos[0], oPos[1], -1.2];
          mode1.orientation = [finalH, finalP, finalR];
          mode1.FOV = fovRad;

          if (mode1.orientations) {
            mode1.orientations.current = [finalH, finalP, finalR];
            mode1.orientations.last = [finalH, finalP, finalR];
          }

          frustum.fov = fovRad;
          viewer.scene.render(viewer.clock.currentTime);

          const vc = viewer.canvas;
          const ray = viewer.scene.camera.getPickRay(new Cesium.Cartesian2(vc.width / 2, vc.height / 2));
          const hit = ray ? viewer.scene.globe.pick(ray, viewer.scene) : null;
          if (!hit) return null;

          const carto = Cesium.Cartographic.fromCartesian(hit);
          if (!carto) return null;

          return {
            lat: Cesium.Math.toDegrees(carto.latitude),
            lon: Cesium.Math.toDegrees(carto.longitude),
            altM: Number(carto.height) || 0
          };
        } finally {
          mode1.position = oPos;
          mode1.orientation = oOri;
          mode1.FOV = oFov;
          frustum.fov = origFrustumFov;

          if (mode1.orientations) {
            mode1.orientations.current = oCurr;
            mode1.orientations.last = oLast;
          }
        }
      },

      _applyLockedPoint: function(point, lockState = 'FIX', callsign = 'FIX') {
        if (!point) return false;

        const lat = Number(point.lat);
        const lon = Number(point.lon);
        const altM = Number(point.altM) || 0;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

        this._targetLat = lat;
        this._targetLon = lon;
        this._targetAltM = altM;
        this._targetAltFt = Math.round(altM * 3.28084);
        this._lockTargetKey = `${lockState}:${Date.now()}`;
        this._lockedCallsign = callsign;
        this._relYaw = 0;
        this._relPitch = 0;
        this._setLockState(lockState);
        return true;
      },

      _lockActiveMarkpointFromCartridge: function() {
        const cartridge = owner.getAddon?.()?.dataCartridge;
        let markpoint = cartridge?.getActiveMarkpoint?.();
        if (!markpoint) {
          const markpoints = cartridge?.getMarkpoints?.() ?? [];
          if (markpoints.length) {
            markpoint = markpoints[0];
            cartridge?.setActiveMarkpoint?.(0);
          }
        }
        if (!markpoint) return false;
        const target = owner._resolveMarkpointTarget(markpoint);
        if (!target) return false;
        return this._applyLockedPoint(target, 'MRK', 'MRK');
      },

      _updateSlew: function(x, y) {
        const stepBtn = this.rightButtons.find((b) => b.key === 'SLEW_STEP');
        const step = Number(stepBtn.states[stepBtn.stateIndex]);
        if (this._lockMode === 'FREE') {
          this._camYaw = ((this._camYaw + (x * step)) + 360) % 360;
          if (this._camYaw > 180) this._camYaw -= 360;
          this._camPitch = Math.max(-85, Math.min(30, this._camPitch + (y * step)));
        } else {
          this._relYaw = ((this._relYaw + (x * step)) + 360) % 360;
          if (this._relYaw > 180) this._relYaw -= 360;
          this._relPitch = Math.max(-85, Math.min(85, this._relPitch + (y * step)));
        }
      },

      // Reset all slew offsets to neutral.
      _resetSlew: function() {
        this._camYaw = 0;
        this._camPitch = 0;
        this._relYaw = 0;
        this._relPitch = 0;
      },

      // Step FOV range up/down and keep both shared buttons in sync.
      _stepRange: function(direction) {
        const rangeButtons = this.leftButtons.filter((b) => b.key === 'RANGE');
        if (!rangeButtons.length) return;

        const states = rangeButtons[0].states;
        const selected = OptionModule.getOption('TGP', 'RANGE', states[rangeButtons[0].stateIndex]);
        const currentIndex = Math.max(0, states.findIndex((s) => s === selected));
        const nextIndex = Math.max(0, Math.min(states.length - 1, currentIndex + direction));
        const nextState = states[nextIndex];

        OptionModule.setOption('TGP', 'RANGE', nextState);
        for (const button of rangeButtons) {
          button.stateIndex = nextIndex;
        }
      },

      _updateLock: function() {
        if (this._lockMode === 'FREE') {
          this._resetLockData();
          return;
        }

        let tLat = null;
        let tLon = null;
        let tAltM = 0;
        let cs = 'UNKNOWN';
        let targetKey = null;
        let trackUid = null;
        let targetHeadingDeg = 0;
        let targetSpeedKts = 0;

        if (this._lockMode === 'TRK') {
          const map = getMapModule();
          const nav = map?.getSceneData?.() ?? null;
          const traffic = map?.getFilteredTraffic?.(nav?.traffic ?? [], true) ?? [];
          const uid = map?.getSelectedTrafficUid?.(traffic) ?? null;
          const target = traffic.find((c) => String(c?.uid ?? '') === String(uid ?? '')) ?? null;

          if (target) {
            tLat = Number(target.lat);
            tLon = Number(target.lon);
            tAltM = Number(target.alt) || 0;
            cs = target.callsign ?? target.cs ?? 'TRACK';
            trackUid = String(target.uid ?? uid ?? '');
            targetKey = `TRK:${String(target.uid ?? uid ?? cs)}`;
            this._targetAltFt = Math.round(tAltM * 3.28084);
            targetHeadingDeg = Number(target.headingDeg ?? target.trackDeg ?? target.heading ?? target.hdg ?? 0);
            targetSpeedKts = Number(target.speedKts ?? 0);
            this._targetHdg = targetHeadingDeg;

            const trackMode = getOption('TGP', 'TRACK', 'SIMPLE');
            if (trackMode === 'ADVANCED') {
              const ageMs = this._getTrackUpdateAgeMs(trackUid, tLat, tLon, tAltM);
              const predicted = this._predictTrackedPosition(tLat, tLon, tAltM, targetHeadingDeg, targetSpeedKts, Date.now() - ageMs);
              tLat = predicted.lat;
              tLon = predicted.lon;
              tAltM = predicted.altM;
            }
          }
        } else if (this._lockMode === 'WPT') {
          const waypointArray = window.geofs?.flightPlan?.waypointArray;
          const wp = Array.isArray(waypointArray) ? waypointArray.find((w) => w?.selected) : null;
          if (wp) {
            tLat = Number(wp.lat);
            tLon = Number(wp.lon);
            tAltM = (Number(wp.alt) || 0) * 0.3048;
            cs = String(wp.ident ?? wp.name ?? wp.id ?? 'WPT');
            targetKey = `WPT:${cs}`;
            this._targetAltFt = Math.round(tAltM * 3.28084);
          }
        } else if (this._lockMode === 'FIX' || this._lockMode === 'MARK' || this._lockMode === 'MRK') {
          tLat = Number(this._targetLat);
          tLon = Number(this._targetLon);
          tAltM = Number(this._targetAltM) || 0;
          cs = this._lockMode === 'FIX' ? 'FIX' : 'MRK';
          targetKey = String(this._lockTargetKey ?? `${this._lockMode}:POINT`);
          this._targetAltFt = Math.round(tAltM * 3.28084);
        }

        const own = window.geofs?.aircraft?.instance?.llaLocation;

        if (tLat === null || tLon === null || !Number.isFinite(tLat) || !Number.isFinite(tLon) || !own) {
          this._resetLockData();
          return;
        }

        if (targetKey && targetKey !== this._lockTargetKey) {
          this._lockTargetKey = targetKey;
          this._relYaw = 0;
          this._relPitch = 0;
          this._closureKts = 0;
        }

        const ownEcef = this._llaToEcef(own[0], own[1], own[2]);
        const tgtEcef = this._llaToEcef(tLat, tLon, tAltM);
        const dX = tgtEcef[0] - ownEcef[0];
        const dY = tgtEcef[1] - ownEcef[1];
        const dZ = tgtEcef[2] - ownEcef[2];
        const [dN, dE, dU] = this._ecefDeltaToNeu(own[0], own[1], dX, dY, dZ);
        const rel = this._computeRelativePositionMeters(own[0], own[1], own[2], tLat, tLon, tAltM);

        const distH = Math.hypot(dN, dE);
        const trkDistNm = this._lockMode === 'TRK' ? this._getTrackDistanceNmFromMultiplayer(trackUid) : null;
        const distNm = this._lockMode === 'TRK'
          ? (trkDistNm !== null ? Math.round(trkDistNm * 10) / 10 : null)
          : Math.round(rel.distNm * 10) / 10;
        this._closureKts = this._computeClosureRateKts(rel.dN, rel.dE, rel.dU, targetHeadingDeg, targetSpeedKts);

        this._targetWorldH = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
        this._targetWorldP = Math.atan2(dU, distH) * 180 / Math.PI;
        this._targetLat = tLat;
        this._targetLon = tLon;
        this._targetAltM = tAltM;
        this._targetNorthM = dN;
        this._targetEastM = dE;
        this._targetUpM = dU;
        this._lockedCallsign = cs;
        this._lockedDist = distNm;
      },

      // Reset target and lock values.
      _resetLockData: function() {
        this._lockTargetKey = null;
        this._targetLat = null;
        this._targetLon = null;
        this._targetAltM = null;
        this._targetNorthM = 0;
        this._targetEastM = 0;
        this._targetUpM = 0;
        this._lockedDist = null;
        this._closureKts = 0;
      },

      // Capture one TGP camera frame.
      _captureFrame: function(fovRad, isLocked) {
        const viewer = window.geofs?.api?.viewer;
        const mode1 = window.geofs?.camera?.modes?.[1];
        if (!viewer?.scene || !mode1) return;

        const oPos = [...mode1.position];
        const oOri = [...mode1.orientation];
        const oFov = mode1.FOV;
        const oCurr = mode1.orientations ? [...mode1.orientations.current] : [...oOri];
        const oLast = mode1.orientations ? [...mode1.orientations.last] : [...oOri];

        const { finalH, finalP, finalR } = this._getCaptureOrientation(isLocked);

        mode1.position = [oPos[0], oPos[1], -1.2];
        mode1.orientation = [finalH, finalP, finalR];
        mode1.FOV = fovRad;

        if (mode1.orientations) {
          mode1.orientations.current = [finalH, finalP, finalR];
          mode1.orientations.last = [finalH, finalP, finalR];
        }

        // if (window.geofs.camera.currentModeName === 'cockpit') window.geofs.camera.update(0);

        const frustum = viewer.scene.camera.frustum;
        const origFrustumFov = frustum.fov;
        frustum.fov = fovRad;
        viewer.scene.render(viewer.clock.currentTime);
        frustum.fov = origFrustumFov;

        const vc = viewer.canvas;
        if (this._snap.width !== vc.width || this._snap.height !== vc.height) {
          this._snap.width = vc.width;
          this._snap.height = vc.height;
          this._snapCoverCrop = null;
          this._snapCtx = null;
        }
        if (!this._snapCtx) {
          this._snapCtx = this._snap.getContext('2d', { alpha: false });
        }
        this._snapCtx.drawImage(vc, 0, 0);

        mode1.position = oPos;
        mode1.orientation = oOri;
        mode1.FOV = oFov;

        if (mode1.orientations) {
          mode1.orientations.current = oCurr;
          mode1.orientations.last = oLast;
        }
        // if (window.geofs.camera.currentModeName === 'cockpit') window.geofs.camera.update(0);
      },

      // Queue capture for the next browser frame.
      _queueCaptureFrame: function(fovRad, isLocked) {
        this._captureFovRad = fovRad;
        this._captureIsLocked = isLocked;
        if (this._captureQueued) return;

        this._captureQueued = true;
        requestAnimationFrame(() => {
          this._captureQueued = false;
          this._captureFrame(this._captureFovRad, this._captureIsLocked);
        });
      },

      // Draw snapshot with cover-style crop.
      _drawSnapshot: function(ctx, w, h) {
        const srcW = this._snap.width;
        const srcH = this._snap.height;
        const dstW = w;
        const dstH = h;

        let crop = this._snapCoverCrop;
        if (!crop || crop.srcW !== srcW || crop.srcH !== srcH || crop.dstW !== dstW || crop.dstH !== dstH) {
          const scale = Math.max(dstW / srcW, dstH / srcH);
          const sw = dstW / scale;
          const sh = dstH / scale;
          crop = {
            srcW,
            srcH,
            dstW,
            dstH,
            sx: (srcW - sw) / 2,
            sy: (srcH - sh) / 2,
            sw,
            sh
          };
          this._snapCoverCrop = crop;
        }

        ctx.drawImage(this._snap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dstW, dstH);
      },

      // Apply DAY/NIGHT/WHT image mode.
      _applyImageMode: function(ctx, imgMode) {
        if (imgMode === 'DAY') return;

        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const id = ctx.getImageData(0, 0, w, h);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
          if (imgMode === 'NIGHT') {
            d[i] = l * 0.1;
            d[i + 1] = l;
            d[i + 2] = l * 0.1;
          } else {
            d[i] = l;
            d[i + 1] = l;
            d[i + 2] = l;
          }
        }
        ctx.putImageData(id, 0, 0);
      },

      // Draw snapshot and apply selected style.
      _drawStyledSnapshot: function(ctx, w, h, imgMode) {
        if (imgMode === 'DAY') {
          this._drawSnapshot(ctx, w, h);
          return;
        }

        if (!this._styleCanvas) {
          this._styleCanvas = document.createElement('canvas');
        }
        if (this._styleCanvas.width !== w || this._styleCanvas.height !== h) {
          this._styleCanvas.width = w;
          this._styleCanvas.height = h;
          this._styleCtx = null;
        }
        if (!this._styleCtx) {
          this._styleCtx = this._styleCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        }

        this._drawSnapshot(this._styleCtx, w, h);
        this._applyImageMode(this._styleCtx, imgMode);
        ctx.drawImage(this._styleCanvas, 0, 0, w, h);
      },

      // Draw A/G overlay.
      _drawAgHud: function(ctx, w, h, fovDeg, isLocked) {
        const cx = w / 2;
        const cy = h / 2;
        const bs = 22;
        const cl = 52;
        const gap = bs + 6;

        ctx.strokeRect(cx - bs, cy - bs, bs * 2, bs * 2);

        ctx.beginPath();
        ctx.moveTo(cx, cy - cl);
        ctx.lineTo(cx, cy - gap);
        ctx.moveTo(cx, cy + gap);
        ctx.lineTo(cx, cy + cl);
        ctx.moveTo(cx - cl, cy);
        ctx.lineTo(cx - gap, cy);
        ctx.moveTo(cx + gap, cy);
        ctx.lineTo(cx + cl, cy);
        ctx.stroke();

        for (let i = 1; i <= 3; i += 1) {
          const ty = cy - gap - i * 8;
          ctx.beginPath();
          ctx.moveTo(cx - 5, ty);
          ctx.lineTo(cx + 5, ty);
          ctx.stroke();
        }

        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('A/G', 70, 60);

        ctx.textAlign = 'right';
        ctx.fillText(`FOV ${fovDeg}°`, w - 50, 60);

        ctx.textAlign = 'center';
        ctx.fillText(isLocked ? `${this._lockMode} ◆ ${this._lockedCallsign}` : 'SLEW', cx, 60);

        if (isLocked && this._targetLat !== null) {
          ctx.font = 'bold 17px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`LAT  ${this._targetLat.toFixed(4)}`, 70, h - 124);
          ctx.fillText(`LON  ${this._targetLon.toFixed(4)}`, 70, h - 97);
          ctx.fillText(`ELEV ${this._targetAltFt} ft`, 70, h - 70);

          ctx.textAlign = 'right';
          if (this._lockedDist !== null) {
            ctx.fillText(`RNG  ${this._lockedDist} NM`, w - 120, h - 97);
          }
          ctx.fillText(`BRG  ${Math.round(this._targetWorldH)}°`, w - 120, h - 70);
        } else {
          ctx.textAlign = 'center';
          ctx.font = 'bold 16px monospace';
          ctx.fillText('NO TGT', cx, h - 70);
        }
      },

      // Draw A/A overlay.
      _drawAaHud: function(ctx, w, h, fovDeg, isLocked, hud) {
        const cx = w / 2;
        const cy = h / 2;
        const R = 44;
        const dotR = 3;
        const tickLen = 12;

        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < 4; i += 1) {
          const a = i * Math.PI / 2;
          const ix = cx + Math.cos(a) * (R - tickLen / 2);
          const iy = cy + Math.sin(a) * (R - tickLen / 2);
          const ox = cx + Math.cos(a) * (R + tickLen / 2);
          const oy = cy + Math.sin(a) * (R + tickLen / 2);
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ox, oy);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        if (isLocked && this._lockTargetKey) {
          ctx.fill();
        } else {
          ctx.stroke();
        }

        const barX = cx - R - 18;
        const barH = 44;
        const barY = cy - barH / 2;
        const frac = Math.max(0, Math.min(1, Math.abs(this._closureKts) / 600));
        ctx.strokeRect(barX - 4, barY, 4, barH);
        if (frac > 0) {
          ctx.fillRect(barX - 4, barY + barH * (1 - frac), 4, barH * frac);
        }
        for (let i = 0; i <= 4; i += 1) {
          const ty = barY + i * (barH / 4);
          const len = i === 2 ? 8 : 4;
          ctx.beginPath();
          ctx.moveTo(barX, ty);
          ctx.lineTo(barX + len, ty);
          ctx.stroke();
        }

        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('A/A', 70, 60);

        ctx.textAlign = 'right';
        ctx.fillText(`FOV ${fovDeg}°`, w - 50, 60);

        ctx.textAlign = 'center';
        if (isLocked && this._lockTargetKey) {
          ctx.fillText(`TRK ◆ ${this._lockedCallsign}`, cx, 60);
        } else {
          ctx.fillText('ACQ', cx, 60);
        }

        if (isLocked && this._lockTargetKey) {
          ctx.font = 'bold 17px monospace';
          ctx.textAlign = 'left';

          ctx.fillText(`ALT  ${this._targetAltFt} ft`, 70, h - 151);
          if (this._lockedDist !== null) {
            ctx.fillText(`RNG  ${this._lockedDist} NM`, 70, h - 124);
          }

          if (Math.abs(this._closureKts) > 200) ctx.fillStyle = '#ffcc00';
          const vcSign = this._closureKts >= 0 ? '+' : '';
          ctx.fillText(`CLR  ${vcSign}${this._closureKts} kts`, 70, h - 97);
          ctx.fillStyle = hud;

          ctx.fillText(`BRG  ${Math.round(this._targetWorldH)}°`, 70, h - 70);
        } else {
          ctx.textAlign = 'center';
          ctx.font = 'bold 16px monospace';
          ctx.fillText('NO TARGET SELECTED', cx, h - 70);
        }
      },

      render: function(renderer, renderContext) {
        const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
        const w = renderContext?.w ?? 512;
        const h = renderContext?.h ?? 512;
        const color = renderContext?.color ?? '#00ff66';
        if (!ctx) return;

        if (!this._snap) this._snap = document.createElement('canvas');

        const page = renderContext?.page;
        if (!page) return;
        owner.activePage = this;

        if (owner.pendingMarkpoint) {
          this._markPoint = owner.pendingMarkpoint;
          this._applyLockedPoint(owner.pendingMarkpoint, 'MRK', 'MRK');
          this._setLockState('MRK');
          owner.pendingMarkpoint = null;
        }

        const imgMode = getOption('TGP', 'STYLE', 'DAY');
        const fovDeg = Number(getOption('TGP', 'RANGE', 30));
        const fovRad = fovDeg * Math.PI / 180;
        const frequency = Number(getOption('TGP', 'FREQUENCY', 4));
        const powerState = String(getOption('TGP', 'POWER', 'OFF')).toUpperCase();
        const isPoweredOn = powerState === 'ON';
        this._activeMode = getOption('WPN', 'MODE', 'A/G');
        this._lockMode = getOption('TGP', 'LOCK', 'FREE');

        if (!isPoweredOn) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, w, h);

          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${Math.round(h * 0.075)}px monospace`;
          ctx.fillText('TGP OFF', w * 0.5, h * 0.5);
          ctx.restore();
          return;
        }

        const mode = getMode();
        if (mode === 'MARK' && !['FREE', 'FIX', 'MARK'].includes(this._lockMode)) {
          this._setLockState('FREE');
          this._lockMode = 'FREE';
          this._resetLockData();
        }
        if (mode !== 'MARK' && ['FIX', 'MARK'].includes(this._lockMode)) {
          this._setLockState('FREE');
          this._lockMode = 'FREE';
          this._resetLockData();
        }

        const isLocked = this._lockMode !== 'FREE';
        const isAA = this._activeMode === 'A/A';

        this._updateLock();

        this._tick += 1;
        if (this._tick % frequency === 0) {
          this._queueCaptureFrame(fovRad, isLocked);
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (this._snap?.width > 0) {
          this._drawStyledSnapshot(ctx, w, h, imgMode);
        }

        const hud = isLocked ? '#ff0000' : color;
        ctx.strokeStyle = hud;
        ctx.fillStyle = hud;
        ctx.lineWidth = 2;

        if (isAA) {
          this._drawAaHud(ctx, w, h, fovDeg, isLocked, hud);
        } else {
          this._drawAgHud(ctx, w, h, fovDeg, isLocked);
        }

        ctx.restore();
      }
    });

    return true;
  }
}

window.TargetingPodModule = TargetingPodModule;

class F18HudModule {
  static HUD_PHYSICAL_HEIGHT_M = 0.30;
  static HUD_PARALLAX_GAIN = 1.65;
  static CAMERA_TO_HUD_DISTANCE_M = 0.92;
  static DEFAULT_COLOR = '#00ff00';
  static RAD_TO_DEG = 180 / Math.PI;
  static DEG_TO_RAD = Math.PI / 180;
  static LADDER_TICK_RANGE_DEG = 85;
  static REFERENCE_MOVEMENT_MIN_METERS = 0.01;
  static FLIGHT_PATH_REFERENCE_REPLACEMENT_DEG = 3;

  // Prepares HUD module state and renderer references.
  constructor(dependencies = {}) {
    this.dependencies = {
      optionModule: dependencies.optionModule ?? OptionModule,
      helperModule: dependencies.helperModule ?? HelperModule,
      cameraModule: dependencies.cameraModule ?? CameraModule,
      mfdModule: dependencies.mfdModule ?? MfdModule,
      hudCombinerConfig: dependencies.hudCombinerConfig ?? null,
      getAddon: dependencies.getAddon ?? (() => window.BasePlugin?.getActiveAddon?.() ?? null)
    };
    this.originalRenderer = null;
    this.installed = false;
    this.isPitchLadderCaged = false;
    this.isHudProjectionDebug = false;
    this.lastHudProjectionDebugAt = 0;
    this.hasReportedProjectionFailure = false;
    this.fpvState = {
      lastLat: null,
      lastLon: null,
      lastAlt: null,
      relAzDeg: 0,
      relElDeg: 0,
      valid: false
    };
    this.referenceFlightPathState = {
      previousAircraftPosition: null
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
    return this.getOption('WPN', 'MODE', 'NAV');
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

  static isFiniteVector(vector, length = 3) {
    return Array.isArray(vector)
      && vector.length === length
      && vector.every((value) => Number.isFinite(value));
  }

  static addVectors(left, right) {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
  }

  static subtractVectors(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
  }

  static scaleVector(vector, scalar) {
    return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
  }

  static dotProduct(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  }

  static crossProduct(left, right) {
    return [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0]
    ];
  }

  static normalizeVector(vector) {
    if (!this.isFiniteVector(vector)) return null;
    const length = Math.hypot(vector[0], vector[1], vector[2]);
    if (!Number.isFinite(length) || length < 1e-8) return null;
    return this.scaleVector(vector, 1 / length);
  }

  static angleBetweenDegrees(left, right) {
    if (!left || !right) return null;
    const cosine = Math.max(-1, Math.min(1, this.dotProduct(left, right)));
    return Math.acos(cosine) * this.RAD_TO_DEG;
  }

  static rotateVector(vector, axis, angleRad) {
    const normalizedAxis = this.normalizeVector(axis);
    if (!normalizedAxis) return null;
    const cosine = Math.cos(angleRad);
    const sine = Math.sin(angleRad);
    return this.addVectors(
      this.addVectors(
        this.scaleVector(vector, cosine),
        this.scaleVector(this.crossProduct(normalizedAxis, vector), sine)
      ),
      this.scaleVector(normalizedAxis, this.dotProduct(normalizedAxis, vector) * (1 - cosine))
    );
  }

  static isValidCombinerConfig(config) {
    if (!config || !this.isFiniteVector(config.origin) || !this.isFiniteVector(config.normal)
      || !this.isFiniteVector(config.right) || !this.isFiniteVector(config.up)
      || !Array.isArray(config.outline) || config.outline.length < 3) {
      return false;
    }

    const normal = this.normalizeVector(config.normal);
    const right = this.normalizeVector(config.right);
    const up = this.normalizeVector(config.up);
    return Boolean(normal && right && up
      && Math.abs(this.dotProduct(normal, right)) < 1e-4
      && Math.abs(this.dotProduct(normal, up)) < 1e-4
      && Math.abs(this.dotProduct(right, up)) < 1e-4
      && config.outline.every((point) => Array.isArray(point) && point.length === 2
        && point.every((value) => Number.isFinite(value))));
  }

  reportProjectionFailure(reason) {
    if (this.hasReportedProjectionFailure) return;
    this.hasReportedProjectionFailure = true;
    console.warn(`[F18HudModule] Attitude HUD projection unavailable: ${reason}`);
  }

  getCameraCombinerDistance(frame) {
    return Math.hypot(
      frame.cameraPosition[0] - frame.combiner.origin[0],
      frame.cameraPosition[1] - frame.combiner.origin[1],
      frame.cameraPosition[2] - frame.combiner.origin[2]
    );
  }

  projectCombinerPoint(frame, point) {
    // GeoFS maps the HUD canvas onto the 3D glass after this texture-space projection.
    const relative = F18HudModule.subtractVectors(point, frame.combiner.origin);
    const right = F18HudModule.dotProduct(relative, frame.combiner.right);
    const up = F18HudModule.dotProduct(relative, frame.combiner.up);
    const { minRight, maxRight, minUp, maxUp } = frame.combiner.bounds;
    const width = maxRight - minRight;
    const height = maxUp - minUp;
    if (width <= 0 || height <= 0) return null;
    return {
      x: ((right - minRight) / width) * frame.viewport.width,
      y: ((maxUp - up) / height) * frame.viewport.height,
      worldPoint: point
    };
  }

  projectWorldDirection(frame, direction) {
    const normalizedDirection = F18HudModule.normalizeVector(direction);
    if (!normalizedDirection) return null;

    const denominator = F18HudModule.dotProduct(normalizedDirection, frame.combiner.normal);
    if (Math.abs(denominator) < 1e-8) return null;

    const distance = F18HudModule.dotProduct(
      F18HudModule.subtractVectors(frame.combiner.origin, frame.cameraPosition),
      frame.combiner.normal
    ) / denominator;
    if (!Number.isFinite(distance) || distance <= 0) return null;

    const point = F18HudModule.addVectors(
      frame.cameraPosition,
      F18HudModule.scaleVector(normalizedDirection, distance)
    );
    return this.projectCombinerPoint(frame, point);
  }

  collectHudProjectionInputs(renderer, ac) {
    const config = this.dependencies.hudCombinerConfig;
    const viewer = window.geofs?.api?.viewer;
    const sceneCamera = viewer?.scene?.camera ?? viewer?.camera;
    const CesiumApi = window.Cesium;
    const canvas = renderer?.canvasAPI?.canvas ?? renderer?.canvasAPI?.context?.canvas;
    const lla = ac?.llaLocation;

    if (!F18HudModule.isValidCombinerConfig(config)) {
      this.reportProjectionFailure('HUD combiner configuration is invalid');
      return null;
    }
    if (!canvas || !viewer?.canvas || !sceneCamera?.positionWC || !CesiumApi || !Array.isArray(lla)
      || !F18HudModule.isFiniteVector(lla) || !ac?.object3d?.setVectorWorldPosition) {
      this.reportProjectionFailure('required GeoFS camera, aircraft, or Cesium data is missing');
      return null;
    }

    const ellipsoid = viewer.scene?.globe?.ellipsoid ?? CesiumApi.Ellipsoid.WGS84;
    const aircraftPosition = CesiumApi.Cartesian3.fromDegrees(lla[1], lla[0], lla[2]);
    const currentAircraftPosition = [aircraftPosition.x, aircraftPosition.y, aircraftPosition.z];
    const enuToWorld = CesiumApi.Transforms.eastNorthUpToFixedFrame(aircraftPosition, ellipsoid);
    const transformSamples = new Map();
    const isTrackedTransformPoint = (localPoint) => this.isHudProjectionDebug && (
      localPoint.every((value, index) => value === config.origin[index])
      || localPoint.every((value) => value === 0)
    );

    const localPointToWorld = (localPoint) => {
      const localEnu = ac.object3d.setVectorWorldPosition([...localPoint]);
      if (!F18HudModule.isFiniteVector(localEnu)) return null;
      const world = CesiumApi.Matrix4.multiplyByPoint(
        enuToWorld,
        new CesiumApi.Cartesian3(localEnu[0], localEnu[1], localEnu[2]),
        new CesiumApi.Cartesian3()
      );
      const worldPoint = [world.x, world.y, world.z];
      if (isTrackedTransformPoint(localPoint)) {
        transformSamples.set(localPoint.join(','), {
          localPoint: [...localPoint],
          setVectorWorldPositionResult: [...localEnu],
          versionAWorld: worldPoint
        });
      }
      return worldPoint;
    };

    const combinerOrigin = localPointToWorld(config.origin);
    const normalPoint = localPointToWorld(F18HudModule.addVectors(config.origin, config.normal));
    const rightPoint = localPointToWorld(F18HudModule.addVectors(config.origin, config.right));
    const upPoint = localPointToWorld(F18HudModule.addVectors(config.origin, config.up));
    if (!combinerOrigin || !normalPoint || !rightPoint || !upPoint) {
      this.reportProjectionFailure('aircraft-local combiner transform failed');
      return null;
    }

    const combiner = {
      origin: combinerOrigin,
      normal: F18HudModule.normalizeVector(F18HudModule.subtractVectors(normalPoint, combinerOrigin)),
      right: F18HudModule.normalizeVector(F18HudModule.subtractVectors(rightPoint, combinerOrigin)),
      up: F18HudModule.normalizeVector(F18HudModule.subtractVectors(upPoint, combinerOrigin))
    };
    if (!combiner.normal || !combiner.right || !combiner.up) {
      this.reportProjectionFailure('combiner axes are degenerate after transformation');
      return null;
    }

    combiner.outline = config.outline.map(([rightOffset, upOffset]) => localPointToWorld(
      F18HudModule.addVectors(
        config.origin,
        F18HudModule.addVectors(
          F18HudModule.scaleVector(config.right, rightOffset),
          F18HudModule.scaleVector(config.up, upOffset)
        )
      )
    ));
    if (combiner.outline.some((point) => !point)) {
      this.reportProjectionFailure('aircraft-local combiner outline transform failed');
      return null;
    }
    combiner.bounds = {
      minRight: Math.min(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.right
      ))),
      maxRight: Math.max(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.right
      ))),
      minUp: Math.min(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.up
      ))),
      maxUp: Math.max(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.up
      )))
    };

    const cameraPosition = sceneCamera.positionWC;
    const cameraWorld = [cameraPosition.x, cameraPosition.y, cameraPosition.z];
    const inverseEnuToWorld = CesiumApi.Matrix4.inverseTransformation(
      enuToWorld,
      new CesiumApi.Matrix4()
    );
    const cameraEnuCartesian = CesiumApi.Matrix4.multiplyByPoint(
      inverseEnuToWorld,
      cameraPosition,
      new CesiumApi.Cartesian3()
    );
    const cameraEnu = [cameraEnuCartesian.x, cameraEnuCartesian.y, cameraEnuCartesian.z];
    const earthUpCartesian = ellipsoid.geodeticSurfaceNormal(aircraftPosition, new CesiumApi.Cartesian3());
    const earthUp = F18HudModule.normalizeVector([earthUpCartesian.x, earthUpCartesian.y, earthUpCartesian.z]);
    const aircraftOrigin = localPointToWorld([0, 0, 0]);
    const aircraftForwardPoint = localPointToWorld([0, 1, 0]);
    const boresightDirection = aircraftOrigin && aircraftForwardPoint
      ? F18HudModule.normalizeVector(F18HudModule.subtractVectors(aircraftForwardPoint, aircraftOrigin))
      : null;

    const airVelocity = F18HudModule.isFiniteVector(ac.airVelocity) ? [...ac.airVelocity] : null;
    const velocity = F18HudModule.isFiniteVector(ac.velocity) ? [...ac.velocity] : null;
    const localVelocity = airVelocity ?? velocity;
    const velocitySource = airVelocity ? 'airVelocity' : (velocity ? 'velocity' : null);
    let flightPathDirection = null;
    let velocityWorld = null;
    if (localVelocity) {
      const transformedVelocity = CesiumApi.Matrix4.multiplyByPointAsVector(
        enuToWorld,
        new CesiumApi.Cartesian3(localVelocity[0], localVelocity[1], localVelocity[2]),
        new CesiumApi.Cartesian3()
      );
      velocityWorld = [transformedVelocity.x, transformedVelocity.y, transformedVelocity.z];
      flightPathDirection = F18HudModule.normalizeVector([
        transformedVelocity.x,
        transformedVelocity.y,
        transformedVelocity.z
      ]);
    }

    const previousAircraftPosition = this.referenceFlightPathState.previousAircraftPosition;
    const movementVector = previousAircraftPosition
      ? F18HudModule.subtractVectors(currentAircraftPosition, previousAircraftPosition)
      : null;
    const movementDistance = movementVector ? Math.hypot(...movementVector) : 0;
    const referenceFlightPathDirection = movementDistance > F18HudModule.REFERENCE_MOVEMENT_MIN_METERS
      ? F18HudModule.normalizeVector(movementVector)
      : null;
    this.referenceFlightPathState.previousAircraftPosition = currentAircraftPosition;

    const flightPathReferenceDifferenceDeg = F18HudModule.angleBetweenDegrees(
      flightPathDirection,
      referenceFlightPathDirection
    );
    const shouldUseReferenceFlightPath = referenceFlightPathDirection
      && (!flightPathDirection
        || (flightPathReferenceDifferenceDeg != null
          && flightPathReferenceDifferenceDeg > F18HudModule.FLIGHT_PATH_REFERENCE_REPLACEMENT_DEG));
    const fpvFlightPathDirection = shouldUseReferenceFlightPath
      ? referenceFlightPathDirection
      : flightPathDirection;
    const fpvFlightPathSource = shouldUseReferenceFlightPath
      ? 'referenceMovement'
      : velocitySource;

    const frame = {
      Cesium: CesiumApi,
      ellipsoid,
      viewport: { width: canvas.width, height: canvas.height },
      cameraPosition: cameraWorld,
      earthUp,
      combiner,
      boresightDirection,
      flightPathDirection,
      referenceFlightPathDirection,
      flightPathReferenceDifferenceDeg,
      fpvFlightPathDirection,
      fpvFlightPathSource,
      movementDistance,
      airVelocity,
      velocity,
      velocityWorld,
      velocitySource,
      combinerConfigOrigin: [...config.origin]
    };
    const originTransform = transformSamples.get(config.origin.join(','));
    const rootTransform = transformSamples.get('0,0,0');
    if (originTransform) {
      const distanceBetween = (left, right) => Math.hypot(
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2]
      );
      frame.transformDiagnostics = {
        origin: originTransform,
        root: rootTransform ?? null,
        cameraEnu,
        distanceA: distanceBetween(cameraWorld, originTransform.versionAWorld),
        distanceBWithEcefCamera: distanceBetween(
          cameraWorld,
          originTransform.setVectorWorldPositionResult
        ),
        distanceBInEnu: distanceBetween(
          cameraEnu,
          originTransform.setVectorWorldPositionResult
        )
      };
    }
    frame.outline = combiner.outline.map((point) => this.projectCombinerPoint(frame, point));
    if (!earthUp || !boresightDirection || frame.outline.some((point) => !point)) {
      this.reportProjectionFailure('Earth frame, boresight, or combiner outline could not be projected');
      return null;
    }
    return frame;
  }

  collectHudGeometryDebugData(frame, attitudeGeometry, flightPathSymbol, anim, ac) {
    const pointDistance = (left, right) => (left && right
      ? Math.hypot(right.x - left.x, right.y - left.y)
      : null);
    return {
      aircraftPitchDeg: -Number(anim.atilt ?? ac.htr?.[1] ?? 0),
      aircraftRollDeg: Number(anim.aroll ?? ac.htr?.[2] ?? 0),
      aircraftHeadingDeg: Number(anim.heading360 ?? anim.heading ?? ac.htr?.[0] ?? 0),
      verticalSpeed: Number(anim.climbrate ?? 0),
      boresightDirection: frame.boresightDirection,
      flightPathDirection: frame.flightPathDirection,
      referenceFlightPathDirection: frame.referenceFlightPathDirection,
      angleBetweenFlightPathDirectionsDeg: frame.flightPathReferenceDifferenceDeg,
      fpvFlightPathSource: frame.fpvFlightPathSource,
      movementDistance: frame.movementDistance,
      velocitySource: frame.velocitySource,
      airVelocity: frame.airVelocity,
      velocity: frame.velocity,
      velocityWorld: frame.velocityWorld,
      angleBetweenBoresightAndFlightPathDeg: F18HudModule.angleBetweenDegrees(
        frame.boresightDirection,
        frame.fpvFlightPathDirection
      ),
      camera: frame.cameraPosition,
      configOrigin: frame.combinerConfigOrigin,
      combiner: frame.combiner.origin,
      cameraToCombinerDistance: this.getCameraCombinerDistance(frame),
      transformDiagnostics: frame.transformDiagnostics ?? null,
      boresightPosition: frame.projectDirection(frame.boresightDirection),
      horizonCenter: attitudeGeometry.horizonCenter,
      ladderZeroCenter: attitudeGeometry.pitch0,
      fpvPosition: flightPathSymbol?.position ?? null,
      flightPathAngleDeg: flightPathSymbol?.flightPathAngleDeg ?? null,
      trackOffsetDeg: flightPathSymbol?.trackOffsetDeg ?? null,
      attitudePixelsPerDeg: attitudeGeometry.pixelsPerDeg,
      pitch0: attitudeGeometry.pitch0,
      pitch5: attitudeGeometry.pitch5,
      pitch10: attitudeGeometry.pitch10,
      pitchMinus5: attitudeGeometry.pitchMinus5,
      pitchMinus10: attitudeGeometry.pitchMinus10,
      delta0to5: pointDistance(
        attitudeGeometry.pitch0,
        attitudeGeometry.pitch5
      ),
      delta5to10: pointDistance(
        attitudeGeometry.pitch5,
        attitudeGeometry.pitch10
      ),
      horizonToLadderZeroPx: pointDistance(
        attitudeGeometry.horizonCenter,
        attitudeGeometry.pitch0
      ),
      horizonToFpvPx: pointDistance(
        attitudeGeometry.horizonCenter,
        flightPathSymbol?.position ?? null
      ),
      ladderZeroToFpvPx: pointDistance(
        attitudeGeometry.pitch0,
        flightPathSymbol?.position ?? null
      )
    };
  }

  reportHudGeometryDiagnostics(debugData) {
    if (!this.isHudProjectionDebug) return;
    const now = Date.now();
    if (now - this.lastHudProjectionDebugAt < 1000) return;
    this.lastHudProjectionDebugAt = now;
    console.log('[F18HudModule] HUD geometry', debugData);
    if (debugData.cameraToCombinerDistance > 2 || debugData.cameraToCombinerDistance < 0.2) {
      console.warn('[F18HudModule] Implausible camera-to-combiner distance', {
        distance: debugData.cameraToCombinerDistance,
        transformDiagnostics: debugData.transformDiagnostics
      });
    }
  }

  static getLegacyPixelsPerDegree(height) {
    const hudVerticalFovDeg = 2 * Math.atan(
      (F18HudModule.HUD_PHYSICAL_HEIGHT_M / 2) / F18HudModule.CAMERA_TO_HUD_DISTANCE_M
    ) * F18HudModule.RAD_TO_DEG;
    return height / hudVerticalFovDeg;
  }

  getLegacyHudGeometry(w, h) {
    const pixelsPerDeg = F18HudModule.getLegacyPixelsPerDegree(h);
    const hudPhysicalWidthM = F18HudModule.HUD_PHYSICAL_HEIGHT_M * (w / h);
    const hudHorizontalFovDeg = 2 * Math.atan(
      (hudPhysicalWidthM / 2) / F18HudModule.CAMERA_TO_HUD_DISTANCE_M
    ) * F18HudModule.RAD_TO_DEG;
    const pixelsPerDegX = w / hudHorizontalFovDeg;
    const mode = window.geofs?.camera?.modes?.[1];
    const baseZ = mode?.position?.[2] ?? this.dependencies.cameraModule?.DEFAULT_HUD_CAMERA_Z;
    const offsetZ = mode?.offsets?.current?.[2] ?? 0;
    const cameraOffsetDeg = Math.atan2(
      baseZ + offsetZ - this.dependencies.cameraModule?.DEFAULT_HUD_CAMERA_Z,
      F18HudModule.CAMERA_TO_HUD_DISTANCE_M
    ) * F18HudModule.RAD_TO_DEG;
    return {
      pixelsPerDeg,
      pixelsPerDegX,
      cameraOffsetPx: cameraOffsetDeg * pixelsPerDeg * F18HudModule.HUD_PARALLAX_GAIN
    };
  }

  updateLegacyFpvState(lla, ac) {
    if (!Array.isArray(lla) || !F18HudModule.isFiniteVector(lla)) return;
    const fpvState = this.fpvState;
    const [lat, lon, alt] = lla;
    if (fpvState.lastLat != null && fpvState.lastLon != null && fpvState.lastAlt != null) {
      const latRad = lat * Math.PI / 180;
      const dNorth = (lat - fpvState.lastLat) * 111320;
      const dEast = (lon - fpvState.lastLon) * (111320 * Math.cos(latRad));
      const dUp = alt - fpvState.lastAlt;
      const horizontal = Math.hypot(dNorth, dEast);
      if (horizontal > 0.01 || Math.abs(dUp) > 0.01) {
        let trackDeg = Math.atan2(dEast, dNorth) * F18HudModule.RAD_TO_DEG;
        if (trackDeg < 0) trackDeg += 360;
        const fpaDeg = Math.atan2(dUp, Math.max(horizontal, 1e-6)) * F18HudModule.RAD_TO_DEG;
        const heading = window.geofs?.animation?.values?.heading360
          ?? window.geofs?.animation?.values?.heading
          ?? ac.htr?.[0]
          ?? 0;
        fpvState.relAzDeg = this.dependencies.helperModule?.angleDiffDeg?.(heading, trackDeg) ?? 0;
        fpvState.relElDeg = fpaDeg - (-(ac.htr?.[1] || 0));
        fpvState.valid = true;
      }
    }
    fpvState.lastLat = lat;
    fpvState.lastLon = lon;
    fpvState.lastAlt = alt;
  }

  computeLegacyFpvScreenPosition(camera, cx, symbolCy, pixelsPerDeg, pixelsPerDegX) {
    if (!this.fpvState.valid) return null;
    const dxBody = -(this.fpvState.relAzDeg * pixelsPerDegX);
    const dyBody = -(this.fpvState.relElDeg * pixelsPerDeg);
    const cosine = Math.cos(-camera.roll);
    const sine = Math.sin(-camera.roll);
    return {
      x: cx + (dxBody * cosine - dyBody * sine),
      y: symbolCy + (dxBody * sine + dyBody * cosine)
    };
  }

  renderLegacyAttitude(ctx, camera, ac, hudLevel, helperModule, w, h, aoa) {
    const cx = w / 2;
    const clipCy = h / 2;
    const { pixelsPerDeg, pixelsPerDegX, cameraOffsetPx } = this.getLegacyHudGeometry(w, h);
    const symbolCy = clipCy - cameraOffsetPx;
    this.updateLegacyFpvState(ac.llaLocation, ac);
    if (hudLevel === 'FULL') {
      F18HudModule.drawLegacyBoresight(ctx, cx, symbolCy, pixelsPerDeg, w, h);
    }
    F18HudModule.drawLegacyPitchLadder(ctx, camera, ac, cx, clipCy, symbolCy, pixelsPerDeg, w, h);
    const fpvPos = this.computeLegacyFpvScreenPosition(camera, cx, symbolCy, pixelsPerDeg, pixelsPerDegX);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, clipCy, w * 0.28, h * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();
    const fpvDrawn = F18HudModule.drawFpv(ctx, fpvPos, w, h);
    if (hudLevel !== 'MIN') {
      F18HudModule.drawIlsDeviationCues(ctx, fpvDrawn, helperModule, w, h);
    }
    ctx.restore();

    const isGearDown = window.controls?.gear?.position < 0.5;
    F18HudModule.drawLegacyAoaBracket(
      ctx,
      fpvDrawn,
      cx,
      clipCy,
      pixelsPerDeg,
      w,
      h,
      aoa,
      isGearDown
    );
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

  static drawBoresight(ctx, boresightPoint, w, h) {
    if (!boresightPoint) return;
    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);

    const wx = boresightPoint.x;
    const wy = boresightPoint.y;
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

  static getFpvAttitudeGeometry(anim, ac, width, height) {
    const aircraftPitchDeg = -Number(anim.atilt ?? ac.htr?.[1] ?? 0);
    const aircraftRollDeg = Number(anim.aroll ?? ac.htr?.[2] ?? 0);
    const pixelsPerDeg = this.getLegacyPixelsPerDegree(height);
    const hudPhysicalWidthM = this.HUD_PHYSICAL_HEIGHT_M * (width / height);
    const hudHorizontalFovDeg = 2 * Math.atan(
      (hudPhysicalWidthM / 2) / this.CAMERA_TO_HUD_DISTANCE_M
    ) * this.RAD_TO_DEG;
    const pixelsPerDegX = width / hudHorizontalFovDeg;
    const centerX = width / 2;
    const centerY = height / 2;
    const rollRad = aircraftRollDeg * this.DEG_TO_RAD;
    const horizonOffsetY = aircraftPitchDeg * pixelsPerDeg;
    const projectAngularOffset = (trackOffsetDeg, flightPathAngleDeg) => {
      const localX = trackOffsetDeg * pixelsPerDegX;
      const localY = horizonOffsetY - flightPathAngleDeg * pixelsPerDeg;
      return {
        x: centerX + Math.cos(rollRad) * localX - Math.sin(rollRad) * localY,
        y: centerY + Math.sin(rollRad) * localX + Math.cos(rollRad) * localY
      };
    };

    return {
      centerX,
      centerY,
      rollRad,
      horizonOffsetY,
      pixelsPerDeg,
      pixelsPerDegX,
      projectAngularOffset,
      horizonCenter: projectAngularOffset(0, 0),
      pitch0: projectAngularOffset(0, 0),
      pitch5: projectAngularOffset(0, 5),
      pitch10: projectAngularOffset(0, 10),
      pitchMinus5: projectAngularOffset(0, -5),
      pitchMinus10: projectAngularOffset(0, -10)
    };
  }

  static createWorldAttitudeBasis(frame) {
    const horizontalForward = this.normalizeVector(this.subtractVectors(
      frame.boresightDirection,
      this.scaleVector(frame.earthUp, this.dotProduct(frame.boresightDirection, frame.earthUp))
    ));
    const lateral = horizontalForward
      ? this.normalizeVector(this.crossProduct(horizontalForward, frame.earthUp))
      : null;
    return horizontalForward && lateral
      ? { forward: horizontalForward, lateral }
      : null;
  }

  static getFlightPathAttitudePosition(frame, attitudeGeometry) {
    if (!frame.fpvFlightPathDirection || !frame.boresightDirection || !frame.earthUp) return null;

    const attitudeBasis = this.createWorldAttitudeBasis(frame);
    if (!attitudeBasis) return null;

    const upComponent = Math.max(
      -1,
      Math.min(1, this.dotProduct(frame.fpvFlightPathDirection, frame.earthUp))
    );
    const flightPathAngleDeg = Math.asin(upComponent) * this.RAD_TO_DEG;
    const trackOffsetDeg = Math.atan2(
      this.dotProduct(frame.fpvFlightPathDirection, attitudeBasis.lateral),
      this.dotProduct(frame.fpvFlightPathDirection, attitudeBasis.forward)
    ) * this.RAD_TO_DEG;

    return {
      flightPathAngleDeg,
      trackOffsetDeg,
      position: attitudeGeometry.projectAngularOffset(trackOffsetDeg, flightPathAngleDeg)
    };
  }

  static applyCombinerClip(ctx, frame) {
    const [first, ...rest] = frame.outline;
    if (!first) return false;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const point of rest) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.clip();
    return true;
  }

  static drawDebugMarker(ctx, point, color, label) {
    if (!point) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x - 6, point.y);
    ctx.lineTo(point.x + 6, point.y);
    ctx.moveTo(point.x, point.y - 6);
    ctx.lineTo(point.x, point.y + 6);
    ctx.stroke();
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, point.x + 7, point.y - 7);
    ctx.restore();
  }

  static drawHudDebugMarkers(ctx, debugData) {
    this.drawDebugMarker(ctx, debugData.boresightPosition, '#ff3333', 'B');
    this.drawDebugMarker(ctx, debugData.fpvPosition, '#00ff00', 'F');
    this.drawDebugMarker(ctx, debugData.horizonCenter, '#3399ff', 'H');
    this.drawDebugMarker(ctx, debugData.ladderZeroCenter, '#ffff00', '0');
  }

  static drawAttitudePitchLadder(ctx, geometry, w, h) {
    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.font = `${Math.round(h * 0.038)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    ctx.translate(geometry.centerX, geometry.centerY);
    ctx.rotate(geometry.rollRad);
    ctx.translate(0, geometry.horizonOffsetY);

    ctx.beginPath();
    ctx.moveTo(-w * 0.56, 0);
    ctx.lineTo(w * 0.56, 0);
    ctx.stroke();

    for (let degree = 5; degree <= this.LADDER_TICK_RANGE_DEG; degree += 5) {
      for (const tickY of [-degree * geometry.pixelsPerDeg, degree * geometry.pixelsPerDeg]) {
        const isBelowHorizon = tickY > 0;
        const tickDirection = isBelowHorizon ? -1 : 1;
        ctx.setLineDash(isBelowHorizon ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(-w * 0.14, tickY);
        ctx.lineTo(-w * 0.025, tickY);
        ctx.moveTo(w * 0.025, tickY);
        ctx.lineTo(w * 0.14, tickY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-w * 0.14, tickY);
        ctx.lineTo(-w * 0.14, tickY + tickDirection * h * 0.03);
        ctx.moveTo(w * 0.14, tickY);
        ctx.lineTo(w * 0.14, tickY + tickDirection * h * 0.03);
        ctx.stroke();
        ctx.fillText(String(degree), -w * 0.165 - 3, isBelowHorizon ? tickY - 7 : tickY + 7);
        ctx.fillText(String(degree), w * 0.165 + 3, isBelowHorizon ? tickY - 7 : tickY + 7);
      }
    }
    ctx.restore();
  }

  static drawFpv(ctx, fpvPos, w, h) {
    if (!fpvPos) return null;
    const fpvX = fpvPos.x;
    const fpvY = fpvPos.y;

    ctx.save();
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

  static drawAoaBracket(ctx, fpvDrawn, w, h, aoa, isGearDown) {
    if (!isGearDown || !fpvDrawn || !Number.isFinite(aoa)) return;

    const AOA_TOP = 6.9;
    const AOA_STEP = 1.2;
    const tickSpacing = h * 0.03;
    const index = (aoa - AOA_TOP) / AOA_STEP;
    const topY = fpvDrawn.y - index * tickSpacing;
    const midY = topY + tickSpacing;
    const bottomY = topY + 2 * tickSpacing;
    const bracketX = fpvDrawn.x - fpvDrawn.r - fpvDrawn.wing - w * 0.022;
    const tickLen = w * 0.018;

    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX, bottomY);
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX + tickLen, topY);
    ctx.moveTo(bracketX, midY);
    ctx.lineTo(bracketX + tickLen, midY);
    ctx.moveTo(bracketX, bottomY);
    ctx.lineTo(bracketX + tickLen, bottomY);
    ctx.stroke();
    ctx.restore();
  }

  static drawLegacyBoresight(ctx, cx, symbolCy, pixelsPerDeg, w, h) {
    const point = { x: cx, y: symbolCy - 1.5 * pixelsPerDeg };
    this.drawBoresight(ctx, point, w, h);
  }

  static drawLegacyPitchLadder(ctx, camera, ac, cx, clipCy, symbolCy, pixelsPerDeg, w, h) {
    const pitchDeg = -ac.htr[1] || 0;
    const geometry = {
      centerX: cx,
      centerY: clipCy,
      rollRad: -camera.roll,
      horizonOffsetY: pitchDeg * pixelsPerDeg + (symbolCy - clipCy),
      pixelsPerDeg
    };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.06);
    ctx.lineTo(w * 0.66, h * 0.06);
    ctx.lineTo(w * 0.92, h * 0.27);
    ctx.lineTo(w * 0.82, h * 0.92);
    ctx.lineTo(w * 0.18, h * 0.92);
    ctx.lineTo(w * 0.08, h * 0.27);
    ctx.closePath();
    ctx.clip();
    this.drawAttitudePitchLadder(ctx, geometry, w, h);
    ctx.restore();
  }

  static drawLegacyAoaBracket(ctx, fpvDrawn, cx, clipCy, pixelsPerDeg, w, h, aoa, isGearDown) {
    if (!isGearDown || !fpvDrawn || !Number.isFinite(aoa)) return;
    const aoaTop = 6.9;
    const aoaStep = 1.2;
    const tickSpacing = aoaStep * pixelsPerDeg;
    const topY = fpvDrawn.y - ((aoa - aoaTop) / aoaStep) * tickSpacing;
    const midY = topY + tickSpacing;
    const bottomY = topY + 2 * tickSpacing;
    const bracketX = fpvDrawn.x - fpvDrawn.r - fpvDrawn.wing - w * 0.022;
    const tickLength = w * 0.018;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, clipCy, w * 0.28, h * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX, bottomY);
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX + tickLength, topY);
    ctx.moveTo(bracketX, midY);
    ctx.lineTo(bracketX + tickLength, midY);
    ctx.moveTo(bracketX, bottomY);
    ctx.lineTo(bracketX + tickLength, bottomY);
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

  // Weapon effectiveness bracket; drawn like the one on the RDR page.
  static drawWeaponEffectivenessBracket(ctx, weaponModule, profile, lockedDistanceNm, w, h) {
  const markerFractions = weaponModule.getEffectivenessMarkerFractions(profile);
  const bracketTop = h * 0.260;
  const bracketHeight = h * 0.320;
  const bracketBottom = bracketTop + bracketHeight;
  const bracketX = w * 0.715;
  const tickLen = w * 0.018;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = this.DEFAULT_COLOR;
  ctx.fillStyle = this.DEFAULT_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bracketX, bracketTop);
  ctx.lineTo(bracketX, bracketBottom);
  ctx.stroke();

  const markerYs = [
    bracketTop + markerFractions.engagementMax * bracketHeight,
    bracketTop + markerFractions.effectiveMax * bracketHeight,
    bracketTop + markerFractions.effectiveMin * bracketHeight,
    bracketTop + markerFractions.engagementMin * bracketHeight
  ];
  for (const y of markerYs) {
    ctx.beginPath();
    ctx.moveTo(bracketX, y);
    ctx.lineTo(bracketX - tickLen, y);
    ctx.stroke();
  }

  if (Number.isFinite(lockedDistanceNm)) {
    const lockedFraction = weaponModule.getEffectivenessDistanceFraction(profile, lockedDistanceNm);
    ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('>', bracketX, bracketTop + lockedFraction * bracketHeight);
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
  const camera = window.geofs?.api?.viewer?.camera;
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
    const weapons = this.getAddon()?.weapons;
    const effectiveness = wpnModeLoadout ? weapons?.getSelectedWeaponEffectiveness?.(wpnMode, wpnModeLoadout) : null;
    if (wpnMode === 'A/A' && effectiveness) {
      const locked = this.getAddon()?.combat?.targets?.getLockedTarget?.();
      F18HudModule.drawWeaponEffectivenessBracket(o, weapons, effectiveness, locked?.rangeNm, w, h);
    }
  }

  // --- Attitude symbology shares one camera/combiner projection snapshot. ---
  if (ac && this.dependencies.hudCombinerConfig) {
    const hudFrame = this.collectHudProjectionInputs(renderer, ac);
    if (hudFrame) {
      hudFrame.projectDirection = (direction) => this.projectWorldDirection(hudFrame, direction);
      const boresightPoint = hudFrame.projectDirection(hudFrame.boresightDirection);
      const attitudeGeometry = F18HudModule.getFpvAttitudeGeometry(anim, ac, w, h);
      const flightPathSymbol = F18HudModule.getFlightPathAttitudePosition(
        hudFrame,
        attitudeGeometry
      );
      const fpvPoint = flightPathSymbol?.position ?? null;
      const debugData = this.isHudProjectionDebug
        ? this.collectHudGeometryDebugData(
          hudFrame,
          attitudeGeometry,
          flightPathSymbol,
          anim,
          ac
        )
        : null;
      if (debugData) this.reportHudGeometryDiagnostics(debugData);

      o.save();
      o.setTransform(1, 0, 0, 1, 0, 0);
      if (F18HudModule.applyCombinerClip(o, hudFrame)) {
        if (hudLevel === 'FULL') {
          F18HudModule.drawBoresight(o, boresightPoint, w, h);
        }
        F18HudModule.drawAttitudePitchLadder(o, attitudeGeometry, w, h);

        const fpvDrawn = F18HudModule.drawFpv(o, fpvPoint, w, h);
        if (hudLevel !== 'MIN') {
          F18HudModule.drawIlsDeviationCues(o, fpvDrawn, helperModule, w, h);
        }
        const isGearDown = window.controls?.gear?.position < 0.5;
        F18HudModule.drawAoaBracket(o, fpvDrawn, w, h, aoa, isGearDown);
        if (debugData) {
          F18HudModule.drawHudDebugMarkers(o, debugData);
        }
      }
      o.restore();
    }
  } else if (camera && ac?.htr) {
    this.renderLegacyAttitude(o, camera, ac, hudLevel, helperModule, w, h, aoa);
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

  class CameraModule {
    static DEFAULT_HUD_CAMERA_Z = 0.95;
    static CAMERA_STEP_Z = 0.005;
    static CAMERA_UP_BUTTON_ID = 'f18-hud-camera-up';
    static CAMERA_DOWN_BUTTON_ID = 'f18-hud-camera-down';
    static CAMERA_VIEW_BUTTON_ID = 'f18-cockpit-view-cycle';

    constructor(helperModule, config = {}) {
      this.helperModule = helperModule;
      this.config = (config && typeof config === 'object') ? config : {};
      this.installed = false;
      this.originalModesByIndex = new Map();
      this.boundModesRef = null;
      this.cockpitViewIndex = 0;
      this.cockpitViewControlsWrapperId = 'f18-cockpit-view-controls';
      this.cockpitViewApplied = false;
    }

    getCockpitViewPresets() {
      const presets = this.config?.cockpitViewPresets;
      return Array.isArray(presets) ? presets : [];
    }

    getCameraModeDefinitions() {
      const defs = this.config?.cameraModeDefinitions;
      return (defs && typeof defs === 'object') ? defs : {};
    }

    createCameraPadButton(label, id, onClick) {
      const outerStyle = {};
      if (label === 'UP') {
        outerStyle.borderBottom = '1px solid #333';
        outerStyle.borderRadius = '15px 15px 0 0';
      } else if (label === 'DOWN') {
        outerStyle.marginTop = '-9px';
        outerStyle.borderRadius = '0 0 15px 15px';
        outerStyle.borderTop = '0';
      }

      return this.helperModule?.createPadButton({
        label,
        id,
        onClick,
        outerStyle
      }) ?? null;
    }

    adjustHudCameraZ(delta) {
      const mode = window.geofs?.camera?.modes?.[1];
      if (!mode?.position) return false;
      
      const currentZ = mode.position[2] ?? CameraModule.DEFAULT_HUD_CAMERA_Z;
      const newZ = currentZ + delta;
      mode.position[2] = newZ;
      
      if (mode.offsets?.current) {
        mode.offsets.current[2] = 0;
      }
      
      return true;
    }

    installCameraControls() {
      if (document.getElementById('f18-hud-camera-controls')) return true;
      if (!this.helperModule) return false;

      const wrapper = document.createElement('div');
      wrapper.id = 'f18-hud-camera-controls';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '4px';
      wrapper.style.alignItems = 'flex-start';

      const self = this;
      const upButton = this.createCameraPadButton('UP', CameraModule.CAMERA_UP_BUTTON_ID, () => {
        self.adjustHudCameraZ(CameraModule.CAMERA_STEP_Z);
      });
      const seatLabelButton = this.helperModule?.createPadButton({
        label: 'SEAT',
        id: 'f18-seat-label',
        onClick: () => {},
        outerStyle: {
          marginTop: '-9px',
          borderRadius: '0',
          borderTop: '0',
          cursor: 'default',
          pointerEvents: 'none'
        },
        innerStyle: {
          fontWeight: '700'
        }
      });
      const downButton = this.createCameraPadButton('DOWN', CameraModule.CAMERA_DOWN_BUTTON_ID, () => {
        self.adjustHudCameraZ(-CameraModule.CAMERA_STEP_Z);
      });

      if (!upButton || !seatLabelButton || !downButton) return false;

      wrapper.appendChild(upButton);
      wrapper.appendChild(seatLabelButton);
      wrapper.appendChild(downButton);
      return this.helperModule.installPadControl({
        id: wrapper.id,
        element: wrapper,
        prepend: true
      });
    }

    installCockpitViewControls() {
      if (document.getElementById(this.cockpitViewControlsWrapperId)) return true;
      if (!this.helperModule) return false;

      const wrapper = document.createElement('div');
      wrapper.id = this.cockpitViewControlsWrapperId;
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '0px';
      wrapper.style.alignItems = 'flex-start';

      const viewButton = this.helperModule?.createPadButton({
        label: 'VIEW',
        id: CameraModule.CAMERA_VIEW_BUTTON_ID,
        onClick: () => {
          this.nextCockpitView();
        },
        outerStyle: {
          borderRadius: '15px'
        },
        innerStyle: {
          fontWeight: '700'
        }
      });

      if (!viewButton) return false;
      wrapper.appendChild(viewButton);

      return this.helperModule.installPadControl({
        id: wrapper.id,
        element: wrapper,
        prepend: true
      });
    }

    removeCameraControls() {
      this.helperModule?.removePadControl('f18-hud-camera-controls');
    }

    removeCockpitViewControls() {
      this.helperModule?.removePadControl(this.cockpitViewControlsWrapperId);
    }

    applyCockpitViewByIndex(index = 0) {
      const mode = window.geofs?.camera?.modes?.[1];
      if (!mode) return false;

      const views = this.getCockpitViewPresets();
      if (!views.length) return false;
      const safeIndex = HelperModule.clampValue(Math.floor(Number(index) || 0), 0, views.length - 1);
      const preset = views[safeIndex];
      if (!preset) return false;

      mode.position = Array.isArray(preset.position) ? [...preset.position] : [0, 5.5, CameraModule.DEFAULT_HUD_CAMERA_Z];
      mode.offsets = mode.offsets && typeof mode.offsets === 'object' ? mode.offsets : {};
      mode.offsets.current = [0, 0, 0];
      mode.orientations = mode.orientations && typeof mode.orientations === 'object' ? mode.orientations : {};
      mode.orientations.current = Array.isArray(preset.orientation) ? [...preset.orientation] : [0, -15, 0];
      mode.orientation = Array.isArray(preset.orientation) ? [...preset.orientation] : [0, -15, 0];
      mode.FOV = Number.isFinite(Number(preset.FOV)) ? Number(preset.FOV) : 1.7;

      this.cockpitViewIndex = safeIndex;
      return true;
    }

    nextCockpitView() {
      const views = this.getCockpitViewPresets();
      if (!views.length) return false;
      const next = (this.cockpitViewIndex + 1) % views.length;
      const ok = this.applyCockpitViewByIndex(next);
      if (ok) this.cockpitViewApplied = true;
      return ok;
    }

    isAircraftCameraReady() {
      const aircraft = window.geofs?.aircraft?.instance;
      const parts = aircraft?.parts;
      const mode1 = window.geofs?.camera?.modes?.[1];
      return Boolean(parts && Object.keys(parts).length > 0 && mode1?.position);
    }

    hasCustomModes(modes) {
      if (!modes) return false;
      const definitions = this.getCameraModeDefinitions();
      return Object.entries(definitions).every(([indexKey, definition]) => {
        const index = Number(indexKey);
        const current = modes[index];
        return Boolean(current && current.name === definition.name && current.view === definition.view);
      });
    }

    ensureLoaded() {
      if (!window.BasePlugin?.getActivePlugin?.()?.isAircraftActive?.()) {
        this.removeCameraControls();
        this.removeCockpitViewControls();
        return false;
      }

      const modes = window.geofs?.camera?.modes;
      if (!modes) return false;
      if (!this.isAircraftCameraReady()) {
        return false;
      }

      const cockpitViewPresets = this.getCockpitViewPresets();
      const cameraModeDefinitions = this.getCameraModeDefinitions();

      const isCockpitView = window.geofs?.camera?.currentModeName === 'cockpit';
      if (cockpitViewPresets.length > 0) {
        if (!this.installCockpitViewControls()) return false;
      } else {
        this.removeCockpitViewControls();
      }
      if (isCockpitView) {
        if (!this.installCameraControls()) return false;
      } else {
        this.removeCameraControls();
        this.removeCockpitViewControls();
        this.cockpitViewApplied = false;
      }

      const modesRefChanged = this.boundModesRef && this.boundModesRef !== modes;
      const customModesPresent = this.hasCustomModes(modes);

      if (this.installed && !modesRefChanged && customModesPresent) {
        return true;
      }

      if (!this.installed || modesRefChanged) {
        this.originalModesByIndex.clear();
      }

      for (const [indexKey, definition] of Object.entries(cameraModeDefinitions)) {
        const index = Number(indexKey);
        if (!Number.isInteger(index)) continue;

        if (!this.originalModesByIndex.has(index)) {
          const hasOriginalMode = Object.prototype.hasOwnProperty.call(modes, index);
          this.originalModesByIndex.set(index, {
            exists: hasOriginalMode,
            value: hasOriginalMode ? HelperModule.deepCloneJson(modes[index]) : null
          });
        }

        modes[index] = HelperModule.deepCloneJson(definition);
      }

      this.installed = true;
      this.boundModesRef = modes;

      if (isCockpitView && cockpitViewPresets.length > 0 && (!this.cockpitViewApplied || modesRefChanged || !customModesPresent)) {
        this.applyCockpitViewByIndex(this.cockpitViewIndex);
        this.cockpitViewApplied = true;
      }
      return true;
    }

    restore() {
      this.removeCameraControls();
      this.removeCockpitViewControls();

      if (!this.installed && this.originalModesByIndex.size === 0) return;

      const modes = window.geofs?.camera?.modes;
      if (modes && (!this.boundModesRef || modes === this.boundModesRef)) {
        for (const [index, originalState] of this.originalModesByIndex.entries()) {
          if (originalState?.exists) {
            modes[index] = HelperModule.deepCloneJson(originalState.value);
          } else {
            delete modes[index];
          }
        }
      }

      this.originalModesByIndex.clear();
      this.installed = false;
      this.boundModesRef = null;
      this.cockpitViewApplied = false;
    }
  }

  class FMCModule {
    constructor() {
      this.installed = false;
      this.timer = null;
      this.lastFlapsMode = null;
      this.lastAutoTarget = null;
      this.originalSetPartAnimationDelta = null;
      this.airbrakeDeltaHookInstalled = false;
    }

    ensureLoaded() {
      if (this.installed) return true;
      this.installed = true;
      this.startLoop();
      return true;
    }

    startLoop() {
      if (this.timer) return;
      this.timer = setInterval(() => this.tick(), 120);
    }

    stopLoop() {
      if (!this.timer) return;
      clearInterval(this.timer);
      this.timer = null;
    }

    getSpeedbrakeCapNormalized() {
      const raw = String(OptionModule.getOption('SYS', 'SPEEDBRAKE', 'MAX') ?? 'MAX').trim().toUpperCase();
      if (raw === 'MAX') return 1;

      const percentMatch = raw.match(/^(\d+(?:\.\d+)?)%$/);
      if (percentMatch) {
        const pct = Number(percentMatch[1]);
        if (Number.isFinite(pct)) {
          return HelperModule.clampValue(pct / 100, 0, 1);
        }
      }

      // Safe fallback: no limitation when option is unknown.
      return 1;
    }

    installAirbrakeDeltaHook(controlsApi) {
      if (!controlsApi || typeof controlsApi.setPartAnimationDelta !== 'function') return false;
      if (this.airbrakeDeltaHookInstalled) return true;

      this.originalSetPartAnimationDelta = controlsApi.setPartAnimationDelta;
      const self = this;

      controlsApi.setPartAnimationDelta = function (part) {
        const airbrakes = controlsApi.airbrakes;
        if (part && airbrakes && part === airbrakes) {
          const cap = self.getSpeedbrakeCapNormalized();

          const target = Number(airbrakes.target);
          if (Number.isFinite(target) && target > cap) {
            airbrakes.target = cap;
          }

          const positionTarget = Number(airbrakes.positionTarget);
          if (Number.isFinite(positionTarget) && positionTarget > cap) {
            airbrakes.positionTarget = cap;
          }
        }

        return self.originalSetPartAnimationDelta.call(this, part);
      };

      this.airbrakeDeltaHookInstalled = true;
      return true;
    }

    enforceAirbrakeTargetCap(controlsApi) {
      const airbrakes = controlsApi?.airbrakes;
      if (!airbrakes) return;

      const cap = this.getSpeedbrakeCapNormalized();
      let changed = false;

      const target = Number(airbrakes.target);
      if (Number.isFinite(target) && target > cap) {
        airbrakes.target = cap;
        changed = true;
      }

      const positionTarget = Number(airbrakes.positionTarget);
      if (Number.isFinite(positionTarget) && positionTarget > cap) {
        airbrakes.positionTarget = cap;
        changed = true;
      }

      if (changed && typeof controlsApi.setPartAnimationDelta === 'function') {
        controlsApi.setPartAnimationDelta(airbrakes);
      }
    }

    uninstallAirbrakeDeltaHook() {
      const controlsApi = window.controls;
      if (this.airbrakeDeltaHookInstalled && controlsApi && this.originalSetPartAnimationDelta) {
        controlsApi.setPartAnimationDelta = this.originalSetPartAnimationDelta;
      }
      this.originalSetPartAnimationDelta = null;
      this.airbrakeDeltaHookInstalled = false;
    }

    computeAutoFlapsTarget() {
      const controlsApi = window.controls;
      const maxPositionRaw = Number(controlsApi?.flaps?.maxPosition);
      const maxPosition = Number.isFinite(maxPositionRaw) && maxPositionRaw > 0 ? maxPositionRaw : 1;

      const anim = window.geofs?.animation?.values ?? {};
      const kias = Number(anim.kias);
      const aoa = Number(anim.aoa);
      const gLoad = Number(anim.loadFactor);
      const mach = Number(anim.mach);

      // Hard speed-gate from spec: above 250 KIAS flaps should stay up.
      if (Number.isFinite(kias) && kias >= 250) {
        return 0;
      }

      // Under 130 KIAS always command full flaps.
      if (Number.isFinite(kias) && kias <= 130) {
        return maxPosition;
      }

      // Gradual speed schedule (250 -> ~0, 200 -> very small, 130 -> 1).
      const speedFactor = Number.isFinite(kias)
        ? Math.pow(HelperModule.clampValue((250 - kias) / 120, 0, 1), 2.6)
        : 0;
      const aoaFactor = Number.isFinite(aoa)
        ? HelperModule.clampValue((aoa - 6) / 10, 0, 1)
        : 0;
      const gFactor = Number.isFinite(gLoad)
        ? HelperModule.clampValue((gLoad - 1.15) / 3.0, 0, 1)
        : 0;

      // Mach contributes only at very low Mach, so it won't dominate around ~200 KIAS.
      const machFactor = Number.isFinite(mach)
        ? Math.pow(HelperModule.clampValue((0.28 - mach) / 0.12, 0, 1), 2)
        : 0;

      // Use the maximum demand of the four factors (no weighted combination).
      const normalized = Math.max(speedFactor, aoaFactor, gFactor, machFactor);
      return normalized * maxPosition;
    }

    applyFlapsTarget(target) {
      const controlsApi = window.controls;
      const flaps = controlsApi?.flaps;
      if (!flaps || typeof controlsApi?.setPartAnimationDelta !== 'function') return;

      const maxPositionRaw = Number(flaps?.maxPosition);
      const maxPosition = Number.isFinite(maxPositionRaw) && maxPositionRaw > 0 ? maxPositionRaw : 1;
      const clampedTarget = HelperModule.clampValue(Number(target) || 0, 0, maxPosition);

      if (this.lastAutoTarget != null && Math.abs(this.lastAutoTarget - clampedTarget) < 0.015) {
        return;
      }

      flaps.positionTarget = clampedTarget;
      controlsApi.setPartAnimationDelta(flaps);
      this.lastAutoTarget = clampedTarget;
    }

    tick() {
      if (!window.BasePlugin?.getActivePlugin?.()?.isAircraftActive?.()) {
        this.lastFlapsMode = null;
        this.lastAutoTarget = null;
        return;
      }

      const controlsApi = window.controls;
      if (!controlsApi) return;

      this.installAirbrakeDeltaHook(controlsApi);

      if (controlsApi.flaps) {
        const flapsMode = OptionModule.getOption('SYS', 'FLAPS', 'MAN');
        if (flapsMode === 'AUTO') {
          const target = this.computeAutoFlapsTarget();
          this.applyFlapsTarget(target);
        } else if (this.lastFlapsMode === 'AUTO') {
          // Critical handback behavior: reset to 0 when leaving AUTO,
          // otherwise manual mode can stay latched.
          this.lastAutoTarget = null;
          this.applyFlapsTarget(0);
        }

        this.lastFlapsMode = flapsMode;
      } else {
        this.lastFlapsMode = null;
      }

      // Override max speedbrake effectiveness based on SYS.SPEEDBRAKE option.
      // Cap targets (not live position) to avoid visible oscillation/jitter.
      this.enforceAirbrakeTargetCap(controlsApi);
    }

    restore() {
      this.stopLoop();
      this.uninstallAirbrakeDeltaHook();

      if (window.BasePlugin?.getActivePlugin?.()?.isAircraftActive?.()) {
        this.lastAutoTarget = null;
        this.applyFlapsTarget(0);
      }

      this.lastFlapsMode = null;
      this.installed = false;
    }
  }




  class ControlModule {
    static UPDATE_INTERVAL_MS = 50;
    
    constructor(helperModule = null) {
      this.helperModule = helperModule;
      this.installed = false;
      this.timer = null;
      this.controls = new Map();
      this.lastAircraftId = null;
    }

    registerControl(definition) {
      const key = String(definition?.key || '');
      if (!key) return false;

      const control = {
        key,
        padLabel: String(definition?.padLabel || ''),
        defaultState: String(definition?.defaultState || 'CLOSED'),
        durationMs: Math.max(0, Number(definition?.durationMs) || 0),
        parts: Array.isArray(definition?.parts) ? definition.parts : [],
        runtime: {
          initialized: false,
          currentState: null,
          targetState: null,
          transitionStartMs: 0,
          timingByValueKey: Object.create(null),
          fromValues: Object.create(null),
          toValues: Object.create(null),
          currentValues: Object.create(null)
        }
      };

      this.controls.set(key, control);
      if (this.timer) {
        this.installPadControlFor(control);
      }
      return true;
    }

    ensureLoaded() {
      if (this.installed) return true;
      this.installed = true;
      return true;
    }

    start() {
      if (!this.installed) this.ensureLoaded();
      this.installPadControls();
      this.startLoop();
      return true;
    }

    stop() {
      this.stopLoop();
      this.removePadControls();
      this.lastAircraftId = null;
      for (const control of this.controls.values()) {
        control.runtime.initialized = false;
      }
      return true;
    }

    setControlState(control, state) {
      const tokens = this.parseConfigKey(control.key);
      if (!tokens.page || !tokens.key) return false;
      OptionModule.setOption(tokens.page, tokens.key, state);
      return true;
    }

    createPadButton(label, id, onClick, outerStyle = {}, innerStyle = {}) {
      return this.helperModule?.createPadButton({
        label,
        id,
        onClick,
        outerStyle,
        innerStyle
      }) ?? null;
    }

    getPadControlWrapperId(control) {
      return `control-pad-${control.key}`;
    }

    installPadControlFor(control) {
      if (!this.helperModule) return false;
      if (!control.padLabel) return false;

      const wrapperId = this.getPadControlWrapperId(control);
      if (document.getElementById(wrapperId)) return true;

      const wrapper = document.createElement('div');
      wrapper.id = wrapperId;
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '0px';
      wrapper.style.alignItems = 'flex-start';

      const openButton = this.createPadButton('OPEN', `${wrapperId}-open`, () => {
        this.setControlState(control, 'OPEN');
      }, {
        borderBottom: '1px solid #333',
        borderRadius: '15px 15px 0 0'
      });

      const centerLabel = this.createPadButton(control.padLabel, `${wrapperId}-label`, () => {}, {
        marginTop: '-9px',
        borderRadius: '0',
        borderTop: '0',
        cursor: 'default',
        pointerEvents: 'none'
      }, {
        fontWeight: '700'
      });

      const closeButton = this.createPadButton('CLOSE', `${wrapperId}-close`, () => {
        this.setControlState(control, 'CLOSED');
      }, {
        marginTop: '-9px',
        borderRadius: '0 0 15px 15px',
        borderTop: '0'
      });

      if (!openButton || !centerLabel || !closeButton) return false;

      wrapper.appendChild(openButton);
      wrapper.appendChild(centerLabel);
      wrapper.appendChild(closeButton);

      return this.helperModule.installPadControl({
        id: wrapper.id,
        element: wrapper,
        prepend: true
      });
    }

    installPadControls() {
      for (const control of this.controls.values()) {
        this.installPadControlFor(control);
      }
      return true;
    }

    removePadControls() {
      for (const control of this.controls.values()) {
        this.helperModule?.removePadControl(this.getPadControlWrapperId(control));
      }
    }

    startLoop() {
      if (this.timer) return;
      this.timer = setInterval(() => this.tick(), ControlModule.UPDATE_INTERVAL_MS);
    }

    stopLoop() {
      if (!this.timer) return;
      clearInterval(this.timer);
      this.timer = null;
    }

    parseConfigKey(configKey) {
      const raw = String(configKey || '');
      const [page, key] = raw.split('.');
      return {
        page: String(page || ''),
        key: String(key || '')
      };
    }

    getRequestedState(control) {
      const tokens = this.parseConfigKey(control?.key);
      if (!tokens.page || !tokens.key) return control.defaultState;

      const runtime = control?.runtime || {};
      const raw = OptionModule.getOption(tokens.page, tokens.key, null);
      if (raw == null || raw === '') {
        return String(runtime.targetState || runtime.currentState || control.defaultState);
      }

      return String(raw);
    }

    getAnimationValue(valueKey, fallback = 0) {
      const raw = Number(window.geofs?.animation?.values?.[valueKey]);
      return Number.isFinite(raw) ? raw : Number(fallback) || 0;
    }


    getControlByKey(key) {
      if (!key) return null;
      return this.controls.get(key) || null;
    }

    getControlSnapshot(controlKey) {
      const control = this.getControlByKey(controlKey);
      if (!control) return null;
      return {
        key: control.key,
        defaultState: control.defaultState,
        durationMs: control.durationMs,
        parts: JSON.parse(JSON.stringify(control.parts || [])),
        runtime: {
          initialized: !!control.runtime?.initialized,
          currentState: control.runtime?.currentState ?? null,
          targetState: control.runtime?.targetState ?? null,
          currentValues: { ...(control.runtime?.currentValues || {}) }
        }
      };
    }

    setControlDuration(controlKey, durationMs) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;
      const next = Math.max(0, Number(durationMs) || 0);
      control.durationMs = next;
      return true;
    }

    setChannelValue(controlKey, partName, valueKey, state, value) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;

      const numericValue = Number(value);
      if (!partName || !valueKey || !state || !Number.isFinite(numericValue)) return false;

      const partDef = control.parts.find((p) => p.partName === partName);
      if (!partDef) return false;

      partDef.channels = partDef.channels || {};
      partDef.channels[valueKey] = partDef.channels[valueKey] || {};
      partDef.channels[valueKey][state] = numericValue;
      return true;
    }

    setChannelValueByValueKey(controlKey, valueKey, state, value) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;

      const valueKeyNorm = String(valueKey || '').trim();
      const stateNorm = String(state || '').trim();
      const numericValue = Number(value);
      if (!valueKeyNorm || !stateNorm || !Number.isFinite(numericValue)) return false;

      const matches = control.parts.filter((p) => Object.prototype.hasOwnProperty.call(p?.channels || {}, valueKeyNorm));
      if (matches.length !== 1) {
        return false;
      }

      const partDef = matches[0];
      partDef.channels = partDef.channels || {};
      partDef.channels[valueKeyNorm] = partDef.channels[valueKeyNorm] || {};
      partDef.channels[valueKeyNorm][stateNorm] = numericValue;
      return true;
    }

    setPartTiming(controlKey, partName, state, delayMs, durationMs) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;

      const partNameNorm = String(partName || '').trim();
      const stateNorm = String(state || '').trim();
      const delay = Number(delayMs);
      const duration = Number(durationMs);
      if (!partNameNorm || !stateNorm) return false;

      const partDef = control.parts.find((p) => String(p?.partName || '').trim() === partNameNorm);
      if (!partDef) return false;

      partDef.motion = partDef.motion || {};
      partDef.motion[stateNorm] = {
        delayMs: Number.isFinite(delay) ? Math.max(0, delay) : 0,
        durationMs: Number.isFinite(duration) ? Math.max(1, duration) : Math.max(1, Number(control.durationMs) || 1)
      };
      return true;
    }

    reanimateControlToOption(controlKey) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;
      control.runtime.initialized = false;
      return true;
    }

    reanimateAllControlsToOption() {
      for (const control of this.controls.values()) {
        control.runtime.initialized = false;
      }
      return true;
    }

    findNodeNameLoose(model, wanted) {
      const target = String(wanted || '').trim();
      if (!target || !model) return null;

      const nodesByName = model._nodesByName || model._runtime?.nodesByName;
      if (nodesByName) {
        const exact = nodesByName[target] || nodesByName[target.toLowerCase()] || nodesByName[target.toUpperCase()];
        if (exact) return String(exact.name || exact._name || exact.id || target);
      }

      const wantedLow = target.toLowerCase();
      const arr = Array.isArray(model._runtime?.nodes)
        ? model._runtime.nodes
        : Array.isArray(model._nodes)
          ? model._nodes
          : [];
      for (const node of arr) {
        const nodeName = String(node?.name || node?._name || node?.id || '').trim();
        if (nodeName && nodeName.toLowerCase() === wantedLow) return nodeName;
      }

      return null;
    }

    ensurePartExists(partName) {
      const aircraft = window.geofs?.aircraft?.instance;
      const model = aircraft?.object3d?.model?._model;
      if (!aircraft || !model) return null;

      let part = aircraft.parts?.[partName] || null;
      if (part?.object3d) return part;

      const nodeName = this.findNodeNameLoose(model, partName);
      if (!nodeName) return null;

      const partDef = {
        name: partName,
        node: nodeName,
        parent: 'root',
        animations: []
      };

      aircraft.definition.parts = Array.isArray(aircraft.definition?.parts) ? aircraft.definition.parts : [];
      if (!aircraft.definition.parts.some((p) => String(p?.name || '') === partName)) {
        aircraft.definition.parts.push(partDef);
      }

      aircraft.addParts([partDef], aircraft.aircraftRecord?.fullPath, aircraft.definition?.scale || 1, aircraft.definition?.orientation);

      part = aircraft.parts?.[partName] || null;
      return part?.object3d ? part : null;
    }

    inferAxisFromValueKey(valueKey) {
      const m = String(valueKey || '').match(/Rot([XYZ])Deg$/i);
      return m ? m[1].toUpperCase() : null;
    }

    ensurePartAnimations(partName, channels) {
      const part = this.ensurePartExists(partName);
      if (!part?.object3d) return null;

      part.animations = Array.isArray(part.animations) ? part.animations : [];

      for (const valueKey of Object.keys(channels || {})) {
        const axis = this.inferAxisFromValueKey(valueKey);
        if (!axis) continue;

        const existing = part.animations.some((a) => String(a?.value || '') === valueKey);
        if (existing) continue;

        const rotationMethod = part.object3d[`rotate${axis}`];
        if (typeof rotationMethod !== 'function') continue;

        part.animations.push({
          name: valueKey,
          type: 'rotate',
          axis,
          value: valueKey,
          rotationMethod
        });
      }

      return part;
    }

    ensureControlBindings(control) {
      let allBound = true;

      for (const partDef of control.parts || []) {
        const channels = partDef?.channels || {};
        const part = this.ensurePartAnimations(partDef?.partName, channels);
        if (!part?.object3d) {
          allBound = false;
          continue;
        }

        for (const valueKey of Object.keys(channels)) {
          const exists = (part.animations || []).some((a) => String(a?.value || '') === String(valueKey));
          if (!exists) {
            allBound = false;
          }
        }
      }

      return allBound;
    }

    buildTargetValues(control, state) {
      const targetState = String(state || control.defaultState).toUpperCase();
      const values = Object.create(null);

      for (const partDef of control.parts) {
        this.ensurePartAnimations(partDef?.partName, partDef?.channels);
        const channels = partDef?.channels || {};
        for (const [valueKey, byState] of Object.entries(channels)) {
          const fallback = Number(byState?.[control.defaultState]);
          const raw = byState?.[targetState];
          const target = Number(raw);
          values[valueKey] = Number.isFinite(target)
            ? target
            : (Number.isFinite(fallback) ? fallback : 0);
        }
      }

      return values;
    }

    resolvePartMotion(partDef, targetState, control) {
      const state = String(targetState || control?.defaultState || 'CLOSED').toUpperCase();
      const cfg = partDef?.motion?.[state] || {};
      const delayRaw = Number(cfg?.delayMs);
      const durationRaw = Number(cfg?.durationMs);
      const fallbackDuration = Math.max(1, Number(control?.durationMs) || 1);

      return {
        delayMs: Number.isFinite(delayRaw) ? Math.max(0, delayRaw) : 0,
        durationMs: Number.isFinite(durationRaw) ? Math.max(1, durationRaw) : fallbackDuration
      };
    }

    buildTimingByValueKey(control, targetState) {
      const map = Object.create(null);

      for (const partDef of control.parts || []) {
        const channels = partDef?.channels || {};
        const timing = this.resolvePartMotion(partDef, targetState, control);
        for (const valueKey of Object.keys(channels)) {
          map[valueKey] = {
            delayMs: timing.delayMs,
            durationMs: timing.durationMs
          };
        }
      }

      return map;
    }

    applyCurrentValues(runtime) {
      for (const [valueKey, value] of Object.entries(runtime.currentValues || {})) {
        window.geofs?.animation?.setValue?.(valueKey, Number(value) || 0);
      }
    }

    updateControl(control, nowMs) {
      const runtime = control.runtime;

      const hasBindings = this.ensureControlBindings(control);
      if (!hasBindings) {
        runtime.initialized = false;
        return;
      }

      const requestedState = this.getRequestedState(control);

      if (!runtime.initialized) {
        const initialTargetValues = this.buildTargetValues(control, requestedState);
        const initialFromValues = Object.create(null);
        for (const key of Object.keys(initialTargetValues || {})) {
          initialFromValues[key] = this.getAnimationValue(key, initialTargetValues[key]);
        }

        runtime.initialized = true;
        runtime.currentState = null;
        runtime.targetState = requestedState;
        runtime.timingByValueKey = this.buildTimingByValueKey(control, requestedState);
        runtime.fromValues = { ...initialFromValues };
        runtime.toValues = { ...initialTargetValues };
        runtime.currentValues = { ...initialFromValues };
        runtime.transitionStartMs = nowMs;

        if (Math.max(0, Number(control.durationMs) || 0) === 0) {
          runtime.currentState = requestedState;
          runtime.currentValues = { ...runtime.toValues };
          this.applyCurrentValues(runtime);
        }
        return;
      }

      if (requestedState !== runtime.targetState) {
        runtime.fromValues = { ...runtime.currentValues };
        runtime.toValues = this.buildTargetValues(control, requestedState);
        runtime.timingByValueKey = this.buildTimingByValueKey(control, requestedState);
        runtime.transitionStartMs = nowMs;
        runtime.targetState = requestedState;
      }

      if (runtime.targetState !== runtime.currentState) {
        const elapsedMs = Math.max(0, nowMs - runtime.transitionStartMs);
        const keys = new Set([...Object.keys(runtime.fromValues || {}), ...Object.keys(runtime.toValues || {})]);
        let allDone = true;

        for (const key of keys) {
          const from = Number(runtime.fromValues?.[key]);
          const to = Number(runtime.toValues?.[key]);
          const a = Number.isFinite(from) ? from : 0;
          const b = Number.isFinite(to) ? to : 0;

          const timing = runtime.timingByValueKey?.[key] || { delayMs: 0, durationMs: Math.max(1, Number(control.durationMs) || 1) };
          const delayMs = Math.max(0, Number(timing?.delayMs) || 0);
          const durationMs = Math.max(1, Number(timing?.durationMs) || 1);
          const localT = Math.max(0, Math.min(1, (elapsedMs - delayMs) / durationMs));

          runtime.currentValues[key] = a + (b - a) * localT;
          if (localT < 1) allDone = false;
        }

        if (allDone) {
          runtime.currentState = runtime.targetState;
          runtime.currentValues = { ...runtime.toValues };
        }
      }

      this.applyCurrentValues(runtime);
    }

    tick() {
      const aircraftId = String(window.geofs?.aircraft?.instance?.id ?? '');
      if (aircraftId !== this.lastAircraftId) {
        this.lastAircraftId = aircraftId;
        for (const control of this.controls.values()) {
          control.runtime.initialized = false;
        }
      }

      const nowMs = Date.now();
      for (const control of this.controls.values()) {
        this.updateControl(control, nowMs);
      }
    }

    restore() {
      this.stop();
      this.installed = false;
    }
  }



// MfdDisplay - Individual MFD screen instance (LEFT, RIGHT, CENTER, etc.)
class MfdDisplay {
  static DEFAULTS = {
    MFD_BASE_SCALE: [0.29, 0.29, 0.285],
    MFD_BUTTON_BASE_SCALE: [0.047, 0.047, 0.047],
    MFD_BUTTON_COUNT: 5,
    MFD_BUTTON_START_X: -0.048,
    MFD_BUTTON_STEP_X: 0.023,
    MFD_BUTTON_Y: -0.01,
    MFD_BUTTON_Z_OFFSET: 0.083,
    MFD_LEFT_BUTTON_X: -0.085,
    MFD_RIGHT_BUTTON_X: 0.0835,
    MFD_SIDE_BUTTON_Y: -0.01,
    MFD_SIDE_BUTTON_START_Z: 0.05,
    MFD_SIDE_BUTTON_STEP_Z: 0.023,
    MFD_TOP_BUTTON_VISUAL_SCALE: 2 / 3,
    MFD_CLICK_HALF_WIDTH: 0.36,
    MFD_CLICK_HALF_HEIGHT: 0.36,
    MFD_PART_MODEL_URL: 'https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/models/glassPanel.gltf'
  };

  constructor(mfdModule, config = {}) {
    this.mfdModule = mfdModule;
    this.cfg = {
      ...MfdDisplay.DEFAULTS,
      name: 'RIGHT',
      position: [0.2167, 6.158, 0.584],
      rotation: [8, 0, 0],
      scale: [0.29, 0.29, 0.285],
      parentPartName: null,
      defaultPageTitle: null,
      ...config
    };

    this.slotName = this.cfg.name;
    this.slotNameLower = this.slotName.toLowerCase();
    this.names = {
      MFD_RENDERER_NAME: `mfdRenderer${this.slotName}`,
      MFD_INCLUDE_KEY: `mfd-include-${this.slotNameLower}`,
      MFD_PART_NAME: `mfdPart${this.slotName}`,
      MFD_TOP_BUTTON_RENDERER_NAME: `mfdTopButtonRenderer${this.slotName}`,
      MFD_TOP_BUTTON_INCLUDE_KEY_BASE: `mfd-top-button-include-${this.slotNameLower}`,
      MFD_TOP_BUTTON_PART_NAME_BASE: `mfdTopButtonPart${this.slotName}_`,
      MFD_BOTTOM_BUTTON_PART_NAME_BASE: `mfdBottomButtonPart${this.slotName}_`,
      MFD_LEFT_BUTTON_PART_NAME_BASE: `mfdLeftButtonPart${this.slotName}_`,
      MFD_RIGHT_BUTTON_PART_NAME_BASE: `mfdRightButtonPart${this.slotName}_`
    };

    this.uiState = new F18MfdUiState({
      mapModule: this.mfdModule.mapModule,
      weaponsModule: this.mfdModule.weaponsModule,
      recorderModule: this.mfdModule.recorderModule
    }, this.mfdModule.pageRegistry);

    this.nodeClickHandlerInstalled = false;
    this.onNodeClickBound = this.onNodeClick.bind(this);
    this.defaultPageApplied = false;
    this.installed = false;
  }

  get partName() {
    return this.names.MFD_PART_NAME;
  }

  getTopButtonPartName(index) {
    return `${this.names.MFD_TOP_BUTTON_PART_NAME_BASE}${index}`;
  }

  getLeftButtonPartName(index) {
    return `${this.names.MFD_LEFT_BUTTON_PART_NAME_BASE}${index}`;
  }

  getBottomButtonPartName(index) {
    return `${this.names.MFD_BOTTOM_BUTTON_PART_NAME_BASE}${index}`;
  }

  getRightButtonPartName(index) {
    return `${this.names.MFD_RIGHT_BUTTON_PART_NAME_BASE}${index}`;
  }

  getButtonPartName(side, index) {
    if (side === 'top') return this.getTopButtonPartName(index);
    if (side === 'bottom') return this.getBottomButtonPartName(index);
    if (side === 'left') return this.getLeftButtonPartName(index);
    return this.getRightButtonPartName(index);
  }

  getButtonBasePosition(side, index) {
    if (side === 'top') {
      return [
        this.cfg.MFD_BUTTON_START_X + index * this.cfg.MFD_BUTTON_STEP_X,
        this.cfg.MFD_BUTTON_Y,
        Math.abs(this.cfg.MFD_BUTTON_Z_OFFSET)
      ];
    }

    if (side === 'bottom') {
      return [
        this.cfg.MFD_BUTTON_START_X + index * this.cfg.MFD_BUTTON_STEP_X,
        this.cfg.MFD_BUTTON_Y,
        -Math.abs(this.cfg.MFD_BUTTON_Z_OFFSET)
      ];
    }

    if (side === 'left') {
      return [
        this.cfg.MFD_LEFT_BUTTON_X,
        this.cfg.MFD_SIDE_BUTTON_Y,
        this.cfg.MFD_SIDE_BUTTON_START_Z - index * this.cfg.MFD_SIDE_BUTTON_STEP_Z
      ];
    }

    return [
      this.cfg.MFD_RIGHT_BUTTON_X,
      this.cfg.MFD_SIDE_BUTTON_Y,
      this.cfg.MFD_SIDE_BUTTON_START_Z - index * this.cfg.MFD_SIDE_BUTTON_STEP_Z
    ];
  }

  getMfdScaleRatios() {
    const scale = this.cfg.scale;
    const base = this.cfg.MFD_BASE_SCALE;
    return [
      scale[0] / base[0],
      scale[1] / base[1],
      scale[2] / base[2]
    ];
  }

  scaleButtonLocalPosition(basePosition) {
    const [sx, sy, sz] = this.getMfdScaleRatios();
    return [
      basePosition[0] * sx,
      basePosition[1] * sy,
      basePosition[2] * sz
    ];
  }

  getScaledButtonPartScale() {
    const [sx, sy, sz] = this.getMfdScaleRatios();
    const base = this.cfg.MFD_BUTTON_BASE_SCALE;
    return [base[0] * sx, base[1] * sy, base[2] * sz];
  }

  applyDefaultPage() {
    if (this.defaultPageApplied) return;
    const desiredTitle = this.cfg.defaultPageTitle;
    if (!desiredTitle) return;

    const idx = this.uiState.pages.findIndex((p) => p.title === desiredTitle);
    if (idx >= 0) {
      this.uiState.setPage(idx);
    }
    this.defaultPageApplied = true;
  }

  renderMfdButton(renderer) {
    const ctx = renderer.canvasAPI.context;
    const w = renderer.canvasAPI.canvas.width;
    const h = renderer.canvasAPI.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outerSize = Math.min(w, h) * this.cfg.MFD_TOP_BUTTON_VISUAL_SCALE;
    const outerRadius = outerSize * 0.20;
    const innerInset = outerSize * 0.24;
    const innerSize = outerSize - innerInset * 2;
    const innerRadius = innerSize * 0.36;

    renderer.canvasAPI.clear('#000000');

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const outerX = cx - outerSize / 2;
    const outerY = cy - outerSize / 2;

    ctx.beginPath();
    ctx.roundRect(outerX, outerY, outerSize, outerSize, outerRadius);
    ctx.fillStyle = '#222120';
    ctx.fill();

    ctx.lineWidth = Math.max(2, outerSize * 0.045);
    ctx.strokeStyle = '#0f0f0e';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(outerX + innerInset, outerY + innerInset, innerSize, innerSize, innerRadius);
    ctx.fillStyle = '#3a3835';
    ctx.fill();

    ctx.lineWidth = Math.max(1.2, outerSize * 0.018);
    ctx.strokeStyle = '#2f2d2a';
    ctx.stroke();
    ctx.restore();
  }

  ensureMainRendererFunction() {
    const self = this;
    window.instruments.renderers[this.names.MFD_RENDERER_NAME] = (renderer) => {
      if (self.uiState.render) {
        self.uiState.render(renderer);
        return;
      }

      const ctx = renderer.canvasAPI.context;
      const w = renderer.canvasAPI.canvas.width;
      const h = renderer.canvasAPI.canvas.height;
      renderer.canvasAPI.clear('#000000');
      const fallbackBaseColor = OptionModule.getOptionValue('HUD', 'COLOR', '#00ff00');
      ctx.fillStyle = MfdModule.applyBrightnessToHexColor(fallbackBaseColor, MfdModule.getMfdBrightnessFactor());
      ctx.font = `bold ${Math.round(h * 0.18)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText('MFD INIT', w / 2, h / 2);
    };

    return true;
  }

  ensureButtonRendererFunction() {
    const self = this;
    window.instruments.renderers[this.names.MFD_TOP_BUTTON_RENDERER_NAME] = (renderer) => {
      self.renderMfdButton(renderer);
    };

    return true;
  }

  ensureIncludeDefinition(includeKey, rendererName, modelUrl) {
    window.geofs.includes = window.geofs.includes || {};
    if (window.geofs.includes[includeKey]) return true;

    window.geofs.includes[includeKey] = [{
      model: {
        url: modelUrl,
        shader: {
          name: 'generic',
          textures: { diffuse: '' }
        },
        translucent: false,
        opaque: true
      },
      safeTransparency: false,
      renderer: {
        name: rendererName,
        width: 512,
        height: 512,
        enableTransparency: false,
        images: { }
      },
      animations: [{
        type: 'render',
        value: 'geofsTime'
      }],
      shadows: 'SHADOWS_NONE'
    }];

    return true;
  }

  ensureMainIncludeDefinition() {
    return this.ensureIncludeDefinition(
      this.names.MFD_INCLUDE_KEY,
      this.names.MFD_RENDERER_NAME,
      `${this.cfg.MFD_PART_MODEL_URL}?v=${encodeURIComponent(this.names.MFD_RENDERER_NAME)}`
    );
  }

  getButtonIncludeKey(partName) {
    return `${this.names.MFD_TOP_BUTTON_INCLUDE_KEY_BASE}-${partName}`;
  }

  ensureButtonIncludeDefinition(partName) {
    return this.ensureIncludeDefinition(
      this.getButtonIncludeKey(partName),
      this.names.MFD_TOP_BUTTON_RENDERER_NAME,
      `${this.cfg.MFD_PART_MODEL_URL}?v=mfd-button-${encodeURIComponent(partName)}`
    );
  }

  registerButtonPickNode(partName, nodeName) {
    const part = window.geofs.aircraft.instance.parts[partName];
    if (!part) return false;

    const nodesByName = part.object3d?.model?._model?._nodesByName;
    if (!nodesByName) return false;

    // Flexibele fallback: pak 'glassPanel' of de eerste beschikbare node
    let targetNode = nodesByName.glassPanel;
    if (!targetNode) {
      const keys = Object.keys(nodesByName);
      if (keys.length > 0) targetNode = nodesByName[keys[0]];
    }
    if (!targetNode) return false;

    targetNode.name = nodeName;
    nodesByName[nodeName] = targetNode;
    return true;
  }

  installButtonGroup(side) {
    const aircraft = window.geofs.aircraft.instance;
    if (!aircraft.parts[this.names.MFD_PART_NAME]) return false;

    const count = this.cfg.MFD_BUTTON_COUNT;
    const partsToAdd = [];

    for (let i = 0; i < count; i++) {
      const partName = this.getButtonPartName(side, i);
      if (aircraft.parts[partName]) continue;
      if (!this.ensureButtonIncludeDefinition(partName)) return false;

      const position = this.scaleButtonLocalPosition(this.getButtonBasePosition(side, i));

      partsToAdd.push({
        name: partName,
        include: this.getButtonIncludeKey(partName),
        parent: this.names.MFD_PART_NAME,
        position,
        scale: this.getScaledButtonPartScale(),
        shadows: 'SHADOWS_NONE'
      });
    }

    if (partsToAdd.length) {
      aircraft.addParts(partsToAdd);
    }

    for (let i = 0; i < count; i++) {
      const partName = this.getButtonPartName(side, i);
      if (!aircraft.parts[partName]) return false;
      if (!this.registerButtonPickNode(partName, partName)) {
        aircraft.parts[partName]['3dmodel'].readyPromise.then(() => {
          this.registerButtonPickNode(partName, partName);
        });
      }
    }

    return true;
  }

  ensureMfdParts() {
    const aircraft = window.geofs.aircraft.instance;
    const parentPartName = this.cfg.parentPartName || this.mfdModule.getDefaultParentPartName();

    if (this.installed) {
      const existingPart = aircraft.parts[this.names.MFD_PART_NAME];
      if (existingPart) {
        if (!this.cfg.parentPartName && existingPart.parent === 'root' && parentPartName !== 'root') {
          this.removeParts();
          this.installed = false;
        } else {
          return true;
        }
      }
      this.installed = false;
    }

    if (!this.ensureMainRendererFunction()) return false;
    if (!this.ensureMainIncludeDefinition()) return false;
    if (!this.ensureButtonRendererFunction()) return false;

    if (!aircraft.parts[this.names.MFD_PART_NAME]) {
      aircraft.addParts([{
        name: this.names.MFD_PART_NAME,
        include: this.names.MFD_INCLUDE_KEY,
        parent: parentPartName,
        position: this.cfg.position,
        rotation: this.cfg.rotation,
        scale: this.cfg.scale,
        points: {
          topLeft: [-this.cfg.MFD_CLICK_HALF_WIDTH, 0, this.cfg.MFD_CLICK_HALF_HEIGHT],
          topRight: [this.cfg.MFD_CLICK_HALF_WIDTH, 0, this.cfg.MFD_CLICK_HALF_HEIGHT],
          bottomLeft: [-this.cfg.MFD_CLICK_HALF_WIDTH, 0, -this.cfg.MFD_CLICK_HALF_HEIGHT],
          bottomRight: [this.cfg.MFD_CLICK_HALF_WIDTH, 0, -this.cfg.MFD_CLICK_HALF_HEIGHT]
        }
      }]);
    }

    const mfdPart = aircraft.parts[this.names.MFD_PART_NAME];
    if (!mfdPart) return false;

    const registerMainPickNode = () => {
      const nodesByName = mfdPart.object3d?.model?._model?._nodesByName;
      if (!nodesByName) return false;

      let glassNode = nodesByName.glassPanel;
      if (!glassNode) {
        const keys = Object.keys(nodesByName);
        if (keys.length > 0) glassNode = nodesByName[keys[0]];
      }
      if (!glassNode) return false;

      glassNode.name = this.names.MFD_PART_NAME;
      nodesByName[this.names.MFD_PART_NAME] = glassNode;
      return true;
    };

    if (!registerMainPickNode()) {
      mfdPart['3dmodel'].readyPromise.then(() => registerMainPickNode());
    }

    if (!this.installButtonGroup('top')) return false;
    if (!this.installButtonGroup('bottom')) return false;
    if (!this.installButtonGroup('left')) return false;
    if (!this.installButtonGroup('right')) return false;

    this.installed = true;
    return true;
  }

  removePartByName(partName) {
    const ac = window.geofs.aircraft.instance;
    const part = ac.parts[partName];
    if (!part) return;

    const parent = part.object3d.getParent();
    if (parent._children) {
      const idx = parent._children.indexOf(part.object3d);
      if (idx >= 0) parent._children.splice(idx, 1);
    }
    part.object3d.destroy();
    part.rendererInstance?.destroy();
    part['3dmodel']?.destroy();
    delete ac.parts[partName];
  }

  removeParts() {
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getTopButtonPartName(i));
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getBottomButtonPartName(i));
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getLeftButtonPartName(i));
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getRightButtonPartName(i));
    }
    this.removePartByName(this.names.MFD_PART_NAME);
    this.installed = false;
  }

  hasRequiredNodeClickHandlers() {
    const handlers = window.controls.nodeClickHandlers;
    if (handlers[this.names.MFD_PART_NAME] !== this.onNodeClickBound) return false;
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getTopButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getBottomButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getLeftButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getRightButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    return true;
  }

  ensureLoaded() {
    this.applyDefaultPage();
    if (!this.ensureMfdParts()) return false;

    if (this.nodeClickHandlerInstalled && !this.hasRequiredNodeClickHandlers()) {
      this.nodeClickHandlerInstalled = false;
    }
    this.installNodeClickHandler();
    return this.hasRequiredNodeClickHandlers();
  }

  applyTransformToLiveParts(changes = {}) {
    const aircraft = window.geofs?.aircraft?.instance;
    if (!aircraft?.parts) return false;

    const mfdPart = aircraft.parts[this.names.MFD_PART_NAME];
    const mfdObj = mfdPart?.object3d;
    if (!mfdPart || !mfdObj) return false;

    if (changes.position) {
      mfdPart.position = [...this.cfg.position];
      mfdObj.setInitialPosition(mfdPart.position);
    }
    if (changes.rotation) {
      mfdPart.rotation = V3.toRadians([...this.cfg.rotation]);
      mfdObj.setInitialRotation(mfdPart.rotation);
    }
    if (changes.scale) {
      mfdPart.scale = [...this.cfg.scale];
      mfdPart.originalScale = [...mfdPart.scale];
      mfdObj.setInitialScale(mfdPart.scale);
      mfdObj.setScale(mfdPart.scale);

      const buttonScale = this.getScaledButtonPartScale();
      const sides = ['top', 'bottom', 'left', 'right'];
      for (const side of sides) {
        for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
          const partName = this.getButtonPartName(side, i);
          const buttonPart = aircraft.parts[partName];
          const buttonObj = buttonPart?.object3d;
          if (!buttonPart || !buttonObj) continue;

          buttonPart.position = this.scaleButtonLocalPosition(this.getButtonBasePosition(side, i));
          buttonPart.scale = [...buttonScale];
          buttonPart.originalScale = [...buttonPart.scale];
          buttonObj.setInitialPosition(buttonPart.position);
          buttonObj.setInitialScale(buttonPart.scale);
          buttonObj.setScale(buttonPart.scale);

          if (typeof aircraft.placePart === 'function') {
            aircraft.placePart(buttonPart);
          }
        }
      }
    }

    if ((changes.position || changes.rotation || changes.scale) && typeof aircraft.placePart === 'function') {
      aircraft.placePart(mfdPart);
    }

    return true;
  }

  installNodeClickHandler() {
    if (this.nodeClickHandlerInstalled) return false;

    window.controls.addNodeClickHandler(this.names.MFD_PART_NAME, this.onNodeClickBound);
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getTopButtonPartName(i), this.onNodeClickBound);
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getBottomButtonPartName(i), this.onNodeClickBound);
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getLeftButtonPartName(i), this.onNodeClickBound);
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getRightButtonPartName(i), this.onNodeClickBound);
    }
    this.nodeClickHandlerInstalled = true;
    return true;
  }

  removeNodeClickHandler() {
    if (!this.nodeClickHandlerInstalled) return;

    delete window.controls.nodeClickHandlers[this.names.MFD_PART_NAME];
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getTopButtonPartName(i)];
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getBottomButtonPartName(i)];
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getLeftButtonPartName(i)];
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getRightButtonPartName(i)];
    }
    this.nodeClickHandlerInstalled = false;
  }

  projectMfdCorner(cornerLocal, partObj, aircraftLla) {
    const partPos = partObj.worldPosition;
    const partRot = partObj.worldRotation;
    const sx = partObj._scale[0];
    const sy = partObj._scale[1];
    const sz = partObj._scale[2];

    const scaled = [cornerLocal[0] * sx, cornerLocal[1] * sy, cornerLocal[2] * sz];
    const rotated = M33.transform(partRot, scaled);
    const cornerWorld = [partPos[0] + rotated[0], partPos[1] + rotated[1], partPos[2] + rotated[2]];

    const delta = window.geofs.api.xyz2lla(cornerWorld, aircraftLla);
    const absLla = [aircraftLla[0] + delta[0], aircraftLla[1] + delta[1], aircraftLla[2] + delta[2]];

    return window.geofs.api.getScreenCoordFromLla(absLla);
  }

  getProjectedMfdBounds() {
    const aircraft = window.geofs.aircraft.instance;
    const partObj = aircraft.parts[this.names.MFD_PART_NAME]?.object3d;
    const aircraftLla = aircraft.llaLocation;
    if (!partObj || !aircraftLla) return null;

    const halfW = this.cfg.MFD_CLICK_HALF_WIDTH;
    const halfH = this.cfg.MFD_CLICK_HALF_HEIGHT;
    const localCorners = [
      [-halfW, 0,  halfH],
      [ halfW, 0,  halfH],
      [-halfW, 0, -halfH],
      [ halfW, 0, -halfH],
    ];

    const projected = localCorners.map(c => this.projectMfdCorner(c, partObj, aircraftLla));
    if (projected.some(p => !p)) return null;

    const [topLeft, topRight, bottomLeft, bottomRight] = projected;
    const xs = projected.map(p => p.x);
    const ys = projected.map(p => p.y);

    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      corners: { topLeft, topRight, bottomLeft, bottomRight }
    };
  }

  pointInTriangle(p, a, b, c) {
    const area = (u, v, w) => (u.x - w.x) * (v.y - w.y) - (v.x - w.x) * (u.y - w.y);
    const s1 = area(p, a, b);
    const s2 = area(p, b, c);
    const s3 = area(p, c, a);
    const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
    const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
    return !(hasNeg && hasPos);
  }

  pointInProjectedQuad(x, y, corners) {
    const p = { x, y };
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;
    return this.pointInTriangle(p, topLeft, topRight, bottomRight)
      || this.pointInTriangle(p, topLeft, bottomRight, bottomLeft);
  }

  getPickScore(x, y) {
    const bounds = this.getProjectedMfdBounds();
    if (!bounds || !this.pointInProjectedQuad(x, y, bounds.corners)) {
      return Infinity;
    }

    const { topLeft, topRight, bottomLeft, bottomRight } = bounds.corners;
    const centerX = (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4;
    const centerY = (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4;
    const dx = x - centerX;
    const dy = y - centerY;
    return dx * dx + dy * dy;
  }

  getButtonIndexFromScreenCoords(side, x, y) {
    const aircraft = window.geofs.aircraft.instance;
    const aircraftLla = aircraft.llaLocation;
    const halfW = this.cfg.MFD_CLICK_HALF_WIDTH * this.cfg.MFD_TOP_BUTTON_VISUAL_SCALE;
    const halfH = this.cfg.MFD_CLICK_HALF_HEIGHT * this.cfg.MFD_TOP_BUTTON_VISUAL_SCALE;
    const localCorners = [
      [-halfW, 0, halfH],
      [halfW, 0, halfH],
      [-halfW, 0, -halfH],
      [halfW, 0, -halfH]
    ];

    const count = this.cfg.MFD_BUTTON_COUNT;

    for (let i = 0; i < count; i++) {
      const partName = this.getButtonPartName(side, i);
      const partObj = aircraft.parts[partName]?.object3d;
      if (!partObj) continue;

      const projected = localCorners.map((corner) => this.projectMfdCorner(corner, partObj, aircraftLla));
      if (projected.some((p) => !p)) continue;

      const [topLeft, topRight, bottomLeft, bottomRight] = projected;
      const inside = this.pointInProjectedQuad(x, y, { topLeft, topRight, bottomLeft, bottomRight });
      if (inside) {
        return i;
      }
    }

    return -1;
  }

  isOwnedNode(nodeName) {
    if (nodeName === this.names.MFD_PART_NAME) return true;
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getTopButtonPartName(i)) return true;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getBottomButtonPartName(i)) return true;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getLeftButtonPartName(i)) return true;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getRightButtonPartName(i)) return true;
    }
    return false;
  }

  onNodeClick(nodeName) {
    if (window.geofs.camera.currentModeName !== 'cockpit') {
      return false;
    }

    if (!this.isOwnedNode(nodeName)) {
      return false;
    }

    const topButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getTopButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (topButtonIndex >= 0) {
      this.uiState.setPage(topButtonIndex);
      return true;
    }

    const bottomButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getBottomButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (bottomButtonIndex >= 0) {
      this.uiState.setPage(this.cfg.MFD_BUTTON_COUNT + bottomButtonIndex);
      return true;
    }

    const leftButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getLeftButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (leftButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('left', leftButtonIndex);
      return true;
    }

    const rightButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getRightButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (rightButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('right', rightButtonIndex);
      return true;
    }

    if (nodeName === this.names.MFD_PART_NAME) {
      return this.handlePickClick();
    }

    return false;
  }

  handlePickClick(clickOverride = null) {
    const click = clickOverride ?? HelperModule.getClickScreenCoords();
    if (!click) return false;

    const bounds = this.getProjectedMfdBounds();
    if (!bounds || !this.pointInProjectedQuad(click.x, click.y, bounds.corners)) {
      return false;
    }

    const pickedTopButtonIndex = this.getButtonIndexFromScreenCoords('top', click.x, click.y);
    if (pickedTopButtonIndex >= 0) {
      this.uiState.setPage(pickedTopButtonIndex);
      return true;
    }

    const pickedBottomButtonIndex = this.getButtonIndexFromScreenCoords('bottom', click.x, click.y);
    if (pickedBottomButtonIndex >= 0) {
      this.uiState.setPage(this.cfg.MFD_BUTTON_COUNT + pickedBottomButtonIndex);
      return true;
    }

    const pickedLeftButtonIndex = this.getButtonIndexFromScreenCoords('left', click.x, click.y);
    if (pickedLeftButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('left', pickedLeftButtonIndex);
      return true;
    }

    const pickedRightButtonIndex = this.getButtonIndexFromScreenCoords('right', click.x, click.y);
    if (pickedRightButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('right', pickedRightButtonIndex);
      return true;
    }

    this.uiState.nextPage();
    return true;
  }

  restore() {
    this.removeNodeClickHandler();
    this.removeParts();
    this.defaultPageApplied = false;
  }
}

// MfdModule - Per-aircraft MFD module (page registry + display management)
class MfdModule {
  constructor(helperModule, mapModule, cameraModule, weaponsModule, recorderModule) {
    this.helperModule = helperModule;
    this.mapModule = mapModule;
    this.cameraModule = cameraModule;
    this.weaponsModule = weaponsModule;
    this.recorderModule = recorderModule;
    this.mfds = [];
    this.pageRegistry = [];
    this.mfdPickNodeHandlerInstalled = false;
    this.onMfdPickNodeClickBound = this.onMfdPickNodeClick.bind(this);
    this.runNodeBridgeInstalled = false;
    this.cameraWatchTimer = null;
    this.cameraWatchTicks = 0;
    this.lastMfdRecoveryTick = -999;
  }

  static getMfdBrightnessFactor() {
    const brightMode = OptionModule.getOption('HUD', 'BRIGHT', 'NORM');
    if (brightMode === 'DAY') return 1.0;
    if (brightMode === 'NIGHT') return 0.3;
    return 0.6;
  }

  static applyBrightnessToHexColor(color, factor) {
    const hex = color.startsWith('#') ? color.slice(1) : color;
    const clampChannel = (channel) => Math.max(0, Math.min(255, Math.round(channel * factor)));
    const r = clampChannel(parseInt(hex.slice(0, 2), 16));
    const g = clampChannel(parseInt(hex.slice(2, 4), 16));
    const b = clampChannel(parseInt(hex.slice(4, 6), 16));
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  getDefaultParentPartName() {
    const parts = window.geofs?.aircraft?.instance?.parts;
    if (parts?.cockpit) return 'cockpit';

    const hudPart = Object.values(parts || {})
      .find((part) => part.renderer?.name === 'genericHUD' || part.rendererInstance?.definition?.name === 'genericHUD');
    return hudPart?.parent || 'root';
  }

  registerPage(pageDefinition) {
    if (!pageDefinition.title) return false;
    
    const existingIndex = this.pageRegistry.findIndex(p => p.title === pageDefinition.title);
    if (existingIndex >= 0) {
      this.pageRegistry[existingIndex] = pageDefinition;
    } else {
      this.pageRegistry.push(pageDefinition);
    }
    return true;
  }

  addMfd(config = {}) {
    const display = new MfdDisplay(this, config);
    this.mfds.push(display);
    return display;
  }

  getMfdAtScreenPoint(x, y) {
    let targetDisplay = null;
    let bestScore = Infinity;

    for (const display of this.mfds) {
      const score = display.getPickScore(x, y);
      if (score < bestScore) {
        bestScore = score;
        targetDisplay = display;
      }
    }

    return Number.isFinite(bestScore) ? targetDisplay : null;
  }

  onMfdPickNodeClick(nodeName) {
    if (nodeName !== 'glassPanel') {
      for (const display of this.mfds) {
        if (display.onNodeClick(nodeName)) return;
      }
      return;
    }

    const click = this.helperModule.getClickScreenCoords();
    if (!click) return;

    const targetDisplay = this.getMfdAtScreenPoint(click.x, click.y);
    targetDisplay?.handlePickClick(click);
  }

  ensureGlobalMfdPickNodeHandler() {
    if (!window.controls?.addNodeClickHandler) return false;
    window.controls.addNodeClickHandler('glassPanel', this.onMfdPickNodeClickBound);
    this.mfdPickNodeHandlerInstalled = true;
    return true;
  }

  ensureRunNodeClickBridge() {
    if (this.runNodeBridgeInstalled) return true;

    let handler = window.controls.runNodeClickHandlers;
    if (!handler.__mfdBridge) {
      const original = handler.bind(window.controls);
      const bridgedHandler = (nodeName) => {
        bridgedHandler.__mfdBridgeOriginal(nodeName);
        if (window.controls.nodeClickHandlers[nodeName]) return;
        for (const callback of bridgedHandler.__mfdBridgeCallbacks) {
          callback(nodeName);
        }
      };

      bridgedHandler.__mfdBridge = true;
      bridgedHandler.__mfdBridgeOriginal = original;
      bridgedHandler.__mfdBridgeCallbacks = [];
      window.controls.runNodeClickHandlers = bridgedHandler;
      handler = bridgedHandler;
    }

    if (!handler.__mfdBridgeCallbacks.includes(this.onMfdPickNodeClickBound)) {
      handler.__mfdBridgeCallbacks.push(this.onMfdPickNodeClickBound);
    }

    this.runNodeBridgeInstalled = true;
    return true;
  }

  removeGlobalMfdPickNodeHandler() {
    if (!this.mfdPickNodeHandlerInstalled) return;
    delete window.controls.nodeClickHandlers.glassPanel;
    this.mfdPickNodeHandlerInstalled = false;
  }

  removeRunNodeClickBridge() {
    if (!this.runNodeBridgeInstalled) return;

    const handler = window.controls.runNodeClickHandlers;
    if (handler.__mfdBridge) {
      handler.__mfdBridgeCallbacks = handler.__mfdBridgeCallbacks.filter((callback) => callback !== this.onMfdPickNodeClickBound);
      if (!handler.__mfdBridgeCallbacks.length) {
        window.controls.runNodeClickHandlers = handler.__mfdBridgeOriginal;
      }
    }

    this.runNodeBridgeInstalled = false;
  }

  startCameraWatch() {
    if (this.cameraWatchTimer) return;

    this.cameraWatchTimer = setInterval(() => {
      this.cameraWatchTicks += 1;
      const mode = window.geofs.camera.currentModeName;
      const aircraft = window.geofs.aircraft.instance;
      if (!aircraft || !aircraft.parts) return;

      if (mode !== 'cockpit') return;
      if ((this.cameraWatchTicks % 4) !== 0) return;

      for (const display of this.mfds) {
        display.ensureLoaded();
      }
    }, 250);
  }

  stopCameraWatch() {
    if (!this.cameraWatchTimer) return;
    clearInterval(this.cameraWatchTimer);
    this.cameraWatchTimer = null;
  }

  initializeDefaultMfds(defaultLayout) {
    const existingSlots = new Set(this.mfds.map((display) => display.slotName));
    for (const config of defaultLayout) {
      if (existingSlots.has(config.name)) continue;
      this.addMfd(config);
      existingSlots.add(config.name);
    }
  }

  getSlots() {
    return this.mfds.map((display) => display.slotName);
  }

  getDisplay(slotName = 'RIGHT') {
    return this.mfds.find((display) => display.slotName === slotName) || null;
  }

  getDisplayTransform(slotName = 'RIGHT') {
    const display = this.getDisplay(slotName);
    if (!display) return null;

    return {
      slotName: display.slotName,
      position: [...display.cfg.position],
      rotation: [...display.cfg.rotation],
      scale: [...display.cfg.scale]
    };
  }

  static vec3Equals(a, b) {
    return Array.isArray(a)
      && Array.isArray(b)
      && a.length >= 3
      && b.length >= 3
      && a[0] === b[0]
      && a[1] === b[1]
      && a[2] === b[2];
  }

  updateDisplayTransform(slotName = 'RIGHT', transform = {}, options = {}) {
    const display = this.getDisplay(slotName);
    if (!display) return false;

    const applyScale = options.applyScale === true;
    const changes = {
      position: false,
      rotation: false,
      scale: false
    };

    if (transform.position) {
      const nextPosition = [...transform.position];
      changes.position = !MfdModule.vec3Equals(display.cfg.position, nextPosition);
      if (changes.position) {
        display.cfg.position = nextPosition;
      }
    }
    if (transform.rotation) {
      const nextRotation = [...transform.rotation];
      changes.rotation = !MfdModule.vec3Equals(display.cfg.rotation, nextRotation);
      if (changes.rotation) {
        display.cfg.rotation = nextRotation;
      }
    }
    if (transform.scale && applyScale) {
      const nextScale = [...transform.scale];
      changes.scale = !MfdModule.vec3Equals(display.cfg.scale, nextScale);
      if (changes.scale) {
        display.cfg.scale = nextScale;
      }
    }

    if (!changes.position && !changes.rotation && !changes.scale) return true;

    if (!display.applyTransformToLiveParts(changes)) {
      display.restore();
      display.ensureLoaded();
    }
    return true;
  }

  ensureLoaded() {
    const pickNodeReady = this.ensureGlobalMfdPickNodeHandler();
    const nodeBridgeReady = this.ensureRunNodeClickBridge();
    
    this.mfds.forEach((display) => {
      display.ensureLoaded();
    });
    
    return pickNodeReady && nodeBridgeReady;
  }

  restore() {
    this.stopCameraWatch();
    this.removeGlobalMfdPickNodeHandler();
    this.removeRunNodeClickBridge();
    this.mfds.forEach((display) => display.restore());
  }
}

(function () {
  'use strict';

  window.WeaponModuleDefaults = {
    fighter: {
      defaultConfig: 'A/A',
      loadouts: {
        'A/A': {
          gun: 412,
          left: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AIM-120D', display: '12M', quantity: 2, type: 'A/A' },
            hardpoint2: { load: 'AIM-120D', display: '12M', quantity: 2, type: 'A/A' }
          },
          right: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AIM-120D', display: '12M', quantity: 2, type: 'A/A' },
            hardpoint2: { load: 'AIM-120D', display: '12M', quantity: 2, type: 'A/A' }
          }
        },
        'L/R A/A': {
          gun: 412,
          left: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AIM-120D', display: '12M', quantity: 2, type: 'A/A' },
            hardpoint2: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' }
          },
          right: {
            wingtip: { load: 'AIM-9X  ', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AIM-120D', display: '12M', quantity: 2, type: 'A/A' },
            hardpoint2: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' }
          }
        },
        'A/G': {
          gun: 412,
          left: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AGM-88', display: 'HARM', quantity: 1, type: 'A/G' },
            hardpoint2: { load: 'AGM-84K', display: 'SLAM-ER', quantity: 1, type: 'A/G' }
          },
          right: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AGM-88', display: 'HARM', quantity: 1, type: 'A/G' },
            hardpoint2: { load: 'JDAM', display: 'JDAM', quantity: 1, type: 'A/G' }
          }
        },
        'L/R A/G': {
          gun: 412,
          left: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AGM-88', display: 'HARM', quantity: 1, type: 'A/G' },
            hardpoint2: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' }
          },
          right: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 2, type: 'A/A' },
            hardpoint1: { load: 'AGM-88', display: 'HARM', quantity: 1, type: 'A/G' },
            hardpoint2: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' }
          }
        },
        'L/R': {
          gun: 412,
          left: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 1, type: 'A/A' },
            hardpoint1: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' },
            hardpoint2: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' }
          },
          right: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 1, type: 'A/A' },
            hardpoint1: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' },
            hardpoint2: { load: 'Fuel', display: 'FUEL', quantity: 1, type: 'FUEL' }
          }
        },
        'MIN': {
          gun: 300,
          left: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 1, type: 'A/A' },
            hardpoint1: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' },
            hardpoint2: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' }
          },
          right: {
            wingtip: { load: 'AIM-9X', display: '9M', quantity: 1, type: 'A/A' },
            hardpoint1: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' },
            hardpoint2: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' }
          }
        },
        'CLEAN': {
          gun: 0,
          left: {
            wingtip: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' },
            hardpoint1: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' },
            hardpoint2: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' }
          },
          right: {
            wingtip: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' },
            hardpoint1: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' },
            hardpoint2: { load: 'N/A', display: 'N/A', quantity: 0, type: 'N/A' }
          }
        }
      }
    }
  };
})();

(function () {
  'use strict';

  const fighterChecklistDefaults = [
    {
      type: 'PROC',
      title: 'Engine Start',
      items: ['Parking Brake ON', 'Data Cartridge LOADED', 'Briefing/Mission CHECKED', 'Master Arm OFF', 'Radar OFF', 'Weapon Config SELECTED', 'Rearming FINISHED', 'Area CLEAR', 'Engine ON', 'Instruments CHECK'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Before Taxi',
      items: ['Ladder UP', 'Tailhook UP', 'Fuel Probe CLOSED', 'TGP Power OFF', 'Wings LOCKED', 'Flaps MAN', 'Canopy AS DESIRED', 'Recording AS DESIRED', 'Taxi REQUESTED'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Taxi / Before Takeoff',
      items: ['Taxi Clearance GRANTED', 'Parking Brake OFF', 'Flaps ONE', 'HUD Bright/LVL AS DESIRED', 'Trim SET T/O', 'Canopy CLOSED', 'Spoiler UP', 'Brakes CHECK', 'Flight Controls CHECK', 'Instruments CHECK', 'Takeoff Clearance REQUESTED'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Takeoff',
      items: ['Takeoff Clearance GRANTED', 'Runway CLEAR', 'Runway ALIGNED', 'Flaps ONE CHECK', 'Brakes ON', 'Engine 30%', 'Brakes RELEASED', 'Engine 100%', 'Speed 175 KN', 'Climb POSITIVE', 'Gear UP'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Climb',
      items: ['Flaps AUTO', 'Attitude SET', 'Trim SET', 'Radar AS DESIRED'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Cruise',
      items: ['Altitude AS BRIEFED', 'Speed AS BRIEFED', 'Trim SET', 'HUD Brightness AS DESIRED', 'HUD Level AS DESIRED'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Descent',
      items: ['Trim SET', 'Approach BRIEFED', 'ATIS CHECKED', 'Approach Clearance REQUESTED'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Before landing',
      items: ['Master Arm OFF', 'Radar OFF', 'Targeting Pod OFF', 'Landing Gear 3 GREEN', 'Flaps FULL'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'After Landing',
      items: ['Taxi CLEAR OF RUNWAY', 'Taxi Clearance REQUESTED', 'Flaps UP'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Taxi',
      items: ['Taxi TO PARKING', 'Canopy AS DESIRED'],
      completed: false
    },
    {
      type: 'PROC',
      title: 'Shutdown',
      items: ['Parking Brake ON', 'Engine OFF'],
      completed: false
    },
    {
      type: 'EMER',
      title: 'Engine Fire',
      items: ['Throttle IDLE', 'Engine OFF', 'Divert NEAREST', 'Descent GLIDE', 'Airspeed SET OPTIMAL', 'Radio MAYDAY', 'Land ASAP'],
      completed: false
    },
    {
      type: 'OPS',
      title: 'Targeting Pod - A/G',
      items: ['Flightplan OPEN', 'Target MARK AS WAYPOINT', 'Entry INGRESS FROM SOUTH', 'Heading 0°', 'Flightplan SELECT TARGET WP', 'MFD SWITCH TO TGP', 'MODE/FREQ AS DESIRED', 'FOV WIDE', 'View ADJUST', 'FOV NARROW'],
      completed: false
    },
    {
      type: 'OPS',
      title: 'Targeting Pod - A/A',
      items: ['MFD SWITCH TO RDR', 'Radar ON', 'Foo AS DESIRED', 'MFD SWITCH TO NAV', 'A/C SELECT', 'MFD SWITCH TO TGP', 'Entry INGRESS FROM SOUTH', 'Heading 0°', 'Lock SET TO TRK', 'MODE / FOV AS DESIRED'],
      completed: false
    },
    {
      type: 'OPS',
      title: 'Formation (Re)join',
      items: ['Target LOCK', 'Closure > 1 nm - +60knots', 'Closure 6000 ft - 60 knots', 'Closure 2000 ft - 40 knots', 'Closure 500 ft - 20 knots', 'Visual Contact', 'Take position'],
      completed: false
    },
    {
      type: 'OPS',
      title: 'Overhead Break (Landing)',
      items: ['Runway DETERMINED', 'RW + break to L/R ANNOUNCED', 'Runway ALIGN', 'Alt/Speed AS BRIEFED', '#1 Break ANNOUNCE', '#1 BREAK', '#2 and up REPEAT', 'Downwind Speed AS BRIEFED', 'Land'],
      completed: false
    }
  ];

  const presets = {
    fighter: fighterChecklistDefaults
  };

  function createModule(presetName = 'fighter') {
    if (typeof ChecklistModule !== 'function') {
      return null;
    }

    const preset = presets[presetName] ?? [];
    const module = new ChecklistModule();
    for (const definition of preset) {
      module.addChecklist(HelperModule.deepCloneJson(definition));
    }
    return module;
  }

  window.ChecklistModuleDefaults = {
    presets,
    createModule
  };
})();

(function () {
  'use strict';

  class BasePlugin {
    static LIFECYCLE_INTERVAL_MS = 500;

    static getRuntime() {
      if (!window.GeoFsAddonPluginRuntime) {
        window.GeoFsAddonPluginRuntime = {
          activePlugin: null,
          plugins: [],
          lifecycleTimer: null
        };
      }
      return window.GeoFsAddonPluginRuntime;
    }

    constructor(config = {}) {
      this.id = config.id;
      this.version = config.version;
      this.api = null;
      this.running = false;
      this.managedModules = [];
      this.installAttempts = 0;
      this.installComplete = false;
      this.installMaxAttempts = 50;
      this.once = Object.create(null);
    }

    static registerPlugin(plugin) {
      const runtime = BasePlugin.getRuntime();
      if (!runtime.plugins.includes(plugin)) {
        runtime.plugins.push(plugin);
      }
      BasePlugin.ensureLifecycleLoop();
      BasePlugin.syncPlugins();
      return plugin;
    }

    static ensureLifecycleLoop() {
      const runtime = BasePlugin.getRuntime();
      if (runtime.lifecycleTimer) return;
      runtime.lifecycleTimer = setInterval(() => {
        BasePlugin.syncPlugins();
      }, BasePlugin.LIFECYCLE_INTERVAL_MS);
    }

    static syncPlugins() {
      const runtime = BasePlugin.getRuntime();
      for (const plugin of runtime.plugins) {
        const shouldRun = plugin.isAircraftActive();
        const isRunning = plugin.isRunning();

        if (shouldRun && !isRunning) {
          plugin.start();
        } else if (!shouldRun && isRunning) {
          plugin.stop();
        }

        if (shouldRun && plugin.isRunning()) {
          plugin.tickActive();
        }
      }
    }

    static setActivePlugin(plugin) {
      const runtime = BasePlugin.getRuntime();
      runtime.activePlugin = plugin;
      return runtime.activePlugin;
    }

    static getActivePlugin() {
      return BasePlugin.getRuntime().activePlugin;
    }

    static getActiveAddon() {
      return BasePlugin.getActivePlugin()?.addon ?? null;
    }

    static isAircraftActive() {
      const activePlugin = BasePlugin.getActivePlugin();
      if (!activePlugin) return false;
      return activePlugin.isAircraftActive();
    }

    static getActiveMfdPages() {
      const activePlugin = BasePlugin.getActivePlugin();
      if (!activePlugin) return [];
      return activePlugin.getMfdPages();
    }

    setManagedModules(modules) {
      this.managedModules = modules;
      return this;
    }

    /**
     * Attach optional cross-aircraft capabilities without changing core modules.
     * Modules are enabled only when explicitly requested by a plugin constructor.
     */
    initializeOptionalModules(addon, options = {}) {
      const weapons = addon?.weapons;
      const cfg = (value) => (value === true ? {} : value);
      const wantsCombat = !!(options.weaponHud || options.projectile || options.aaCombat || options.multiplayer);
      if (!weapons || !window.CombatContext || !(wantsCombat || options.keybind)) {
        addon.optionalModules = [];
        return [];
      }

      // Shared context: every optional module plugs into it, none draws on its own.
      const combat = new window.CombatContext();
      combat.weapons = weapons;
      const modules = [];
      const add = (name, Module, ...args) => {
        if (!Module) return null;
        const instance = new Module(...args);
        modules.push(instance);
        addon[name] = instance;
        return instance;
      };

      add('weaponOverlay', window.WeaponOverlayModule, combat, cfg(options.overlay) ?? {});
      add('combatTargets', window.TargetModule, combat, addon);
      add('weaponAudio', window.WeaponAudioModule, combat, weapons, cfg(options.audio) ?? {});
      if (options.keybind) add('keybinds', window.KeybindModule, combat, weapons, cfg(options.keybind));
      if (options.weaponHud) add('weaponHud', window.WeaponHudModule, combat, weapons, cfg(options.weaponHud));
      if (options.projectile) add('projectile', window.ProjectileModule, combat, weapons, cfg(options.projectile));
      if (options.aaCombat) add('aaCombat', window.AACombatModule, combat, cfg(options.aaCombat));
      if (options.multiplayer) add('multiplayer', window.MultiplayerModule, combat, cfg(options.multiplayer));

      addon.combat = combat;
      addon.optionalModules = modules;
      return modules;
    }
    startManagedModules() {
      for (const module of this.managedModules) {
        if (typeof module.start === 'function') {
          module.start();
        }
      }
    }

    stopManagedModules() {
      for (let index = this.managedModules.length - 1; index >= 0; index -= 1) {
        const module = this.managedModules[index];
        if (typeof module.stop === 'function') {
          module.stop();
        }
      }
    }

    resetInstallState() {
      this.installAttempts = 0;
      this.installComplete = false;
    }

    startLifecycle() {
      if (this.running) return false;
      if (!this.isAircraftActive()) return false;

      OptionModule.useStorageKeyForAircraft(this.id);
      BasePlugin.setActivePlugin(this);
      addonRuntime.mainPlugin = this;
      this.running = true;
      this.resetInstallState();
      this.startManagedModules();
      return true;
    }

    stopLifecycle() {
      if (!this.running) return false;

      this.running = false;
      this.stopManagedModules();

      if (BasePlugin.getActivePlugin() === this) {
        BasePlugin.setActivePlugin(null);
      }
      if (addonRuntime.mainPlugin === this) {
        addonRuntime.mainPlugin = null;
      }

      return true;
    }

    runInstallTick(label, installer) {
      if (!this.running || this.installComplete) return this.installComplete;

      this.installAttempts += 1;
      this.installComplete = installer();

      if (!this.installComplete && this.installAttempts > this.installMaxAttempts) {
        this.installComplete = true;
        console.warn(`[${label}] Install timeout after ${this.installMaxAttempts} attempts, continuing anyway`);
      }

      return this.installComplete;
    }

    runOnce(key, action) {
      if (this.once[key]) return false;
      action();
      this.once[key] = true;
      return true;
    }

    static createAddonApi({ version, helper = {}, options = {}, sections = {} } = {}) {
      return {
        version,
        helper,
        options,
        ...sections
      };
    }

    start() {
      throw new Error('start() must be implemented by subclass');
    }

    stop() {
      throw new Error('stop() must be implemented by subclass');
    }

    restart() {
      this.stop();
      return this.start();
    }

    tickActive() {}

    getMfdPages() {
      return [];
    }

    isRunning() {
      return false;
    }

    isAircraftActive() {
      throw new Error('isAircraftActive() must be implemented by subclass');
    }
  }

  window.BasePlugin = BasePlugin;
})();

(function () {
  'use strict';

  class F16MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '7';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'LEFT',
    position: [0.18, 5.277, 0.714],
    rotation: [5.5, 0, 0],
    scale: [0.27, 0.22, 0.26],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'RIGHT',
    position: [-0.189, 5.277, 0.711],
    rotation: [5.5, 0, 0],
    scale: [0.25, 0.22, 0.27],
    defaultPageTitle: 'NAV'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'f16', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'F16AddonOptions');

      window.F16Addon = {
        version: this.version,
        options: {
          buildKey: OptionModule.buildOptionKey,
          read: OptionModule.readOptions,
          write: OptionModule.writeOptions,
          get: OptionModule.getOption,
          set: OptionModule.setOption,
          getValue: OptionModule.getOptionValue
        },
        weapons: new WeaponModule({
          ...window.WeaponModuleDefaults?.fighter,
          storageKey: 'F16AddonWpnState'
        }),
        checklists: ChecklistModule.loadDefaults('fighter') ?? new ChecklistModule(),
        helper: new HelperModule(),
        map: null,
        nav: null,
        communication: new CommunicationModule(),
        system: new SystemModule(),
        hud: new F18HudModule(),
        camera: null,
        fmc: new FMCModule(),
        controls: null,
        dataCartridge: null,
        radar: null,
        targetingPod: null,
        flight: null,
        recorder: new RecorderModule(),
        mfd: MfdModule,
        lifecycle: {
          start: () => this.start(),
          stop: () => this.stop(),
          restart: () => this.restart(),
          isRunning: () => this.isRunning()
        }
      };

      window.F16Addon.camera = new CameraModule(window.F16Addon.helper, F16MainPlugin.CAMERA_CONFIG);
      window.F16Addon.controls = new ControlModule(window.F16Addon.helper);
      window.F16Addon.nav = new NavModule();
      window.F16Addon.map = new MapModule();
      window.F16Addon.nav.setMapModule(window.F16Addon.map);
      window.F16Addon.map.setNavModule(window.F16Addon.nav);

      window.F16Addon.dataCartridge = new DataCartridgeModule();
      window.F16Addon.radar = new RadarModule({
        navModule: window.F16Addon.nav,
        weaponModule: window.F16Addon.weapons
      });
      window.F16Addon.targetingPod = new TargetingPodModule(() => window.F16Addon);
      window.F16Addon.flight = new FlightModule(() => window.F16Addon);
      window.F16Addon.nav.setDataCartridgeModule(window.F16Addon.dataCartridge);

      window.F16Addon.mfd = new MfdModule(
        window.F16Addon.helper,
        window.F16Addon.map,
        window.F16Addon.camera,
        window.F16Addon.weapons,
        window.F16Addon.recorder
      );

      window.F16Addon.checklists.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.nav.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.weapons.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.hud.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.recorder.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.communication.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.system.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.radar.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.flight.registerMfdPages(window.F16Addon.mfd);
      window.F16Addon.targetingPod.registerMfdPages(window.F16Addon.mfd);

      this.setManagedModules([
        window.F16Addon.controls,
        ...this.initializeOptionalModules(window.F16Addon, config.optionalModules ?? {
          keybind: true,
          weaponHud: { enabled: true },
          projectile: true,
          aaCombat: { enabled: true },
          multiplayer: { enabled: true }
        })
      ]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === F16MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.F16Addon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.F16Addon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.F16Addon.mfd.initializeDefaultMfds(F16MainPlugin.DEFAULT_MFD_LAYOUT);
      window.F16Addon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('F16MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.F16Addon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.F16MainPlugin = F16MainPlugin;
})();


// Entry point:
(function () {
  'use strict';

  const VERSION = '2.1.0';

  const PluginCtor = window.F16MainPlugin;
  if (typeof PluginCtor !== 'function') {
    console.error('[GeoFS F-16 Addon] F16MainPlugin is not available on window.');
    return;
  }

  const plugin = new PluginCtor({ version: VERSION });
  window.F16Plugin = plugin;
  window.BasePlugin.registerPlugin(plugin);
})();