// ==UserScript==
// @name         GeoFS F-15 Addon BETA
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      2.0.0
// @description  Improves the cockpit with custom MFDs, adjustable seat height and more.
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @match        https://*.geo-fs.com/*
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
        this.GUN_FIRE_RATE_RPS = 66;
        this.GUN_ROUNDS_PER_BURST = 100;
        this.GUN_FIRE_TICK_MS = Math.max(1, Math.round(1000 / this.GUN_FIRE_RATE_RPS));
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
            roundsRemainingInBurst: 0
        };
        this.fireFlash = {
            startTime: 0,
            label: 'FIRE'
        };

        this.loadStateFromStorage();
    }

    static effectivenessByType = 
    [
        {
            "name": "AIM-9X",
            "engagement_window": { "min": 0.2, "max": 18.9 },
            "effective_range": { "min": 0.5, "max": 8.1 },
            "max_speed": 2.5
        },
        {
            "name": "AIM-120C",
            "engagement_window": { "min": 1.1, "max": 48.6 },
            "effective_range": { "min": 10.8, "max": 27.0 },
            "max_speed": 4.0
        },
        {
            "name": "AIM-120D",
            "engagement_window": { "min": 1.1, "max": 86.4 },
            "effective_range": { "min": 16.2, "max": 43.2 },
            "max_speed": 4.0
        },
        {
            "name": "AIM-7M",
            "engagement_window": { "min": 1.1, "max": 37.8 },
            "effective_range": { "min": 8.1, "max": 21.6 },
            "max_speed": 4.0
        },
        {
            "name": "R-73",
            "engagement_window": { "min": 0.2, "max": 21.6 },
            "effective_range": { "min": 0.5, "max": 8.1 },
            "max_speed": 2.5
        },
        {
            "name": "R-27R",
            "engagement_window": { "min": 1.1, "max": 40.5 },
            "effective_range": { "min": 10.8, "max": 24.3 },
            "max_speed": 4.5
        },
        {
            "name": "R-27ER",
            "engagement_window": { "min": 1.1, "max": 70.2 },
            "effective_range": { "min": 16.2, "max": 37.8 },
            "max_speed": 5.0
        },
        {
            "name": "R-27T",
            "engagement_window": { "min": 0.5, "max": 21.6 },
            "effective_range": { "min": 5.4, "max": 16.2 },
            "max_speed": 4.0
        },
        {
            "name": "R-27ET",
            "engagement_window": { "min": 0.5, "max": 64.8 },
            "effective_range": { "min": 10.8, "max": 32.4 },
            "max_speed": 4.0
        },
        {
            "name": "R-77",
            "engagement_window": { "min": 1.1, "max": 43.2 },
            "effective_range": { "min": 10.8, "max": 27.0 },
            "max_speed": 4.0
        },
        {
            "name": "R-77-1",
            "engagement_window": { "min": 1.1, "max": 59.4 },
            "effective_range": { "min": 16.2, "max": 37.8 },
            "max_speed": 4.5
        },
        {
            "name": "R-77M",
            "engagement_window": { "min": 1.6, "max": 102.6 },
            "effective_range": { "min": 21.6, "max": 54.0 },
            "max_speed": 5.0
        }
    ];

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
        if (this.gunFireState.timerId) {
            clearTimeout(this.gunFireState.timerId);
            this.gunFireState.timerId = null;
        }
        this.gunFireState.mode = null;
        this.gunFireState.roundsRemainingInBurst = 0;
    }

    processGunFireTick() {
        if (this.gunFireState.roundsRemainingInBurst <= 0) {
            this.stopGunFireTimer();
            return;
        }

        const mode = this.gunFireState.mode;
        const modeLoadout = this.getModeLoadout(mode);
        const currentGun = modeLoadout.gun;

        if (currentGun <= 0) {
            this.stopGunFireTimer();
            this.selectNextWeapon(mode, modeLoadout, 0);
            this.saveStateToStorage();
            return;
        }

        modeLoadout.gun = currentGun - 1;
        this.gunFireState.roundsRemainingInBurst -= 1;

        if (modeLoadout.gun <= 0) {
            this.stopGunFireTimer();
            this.selectNextWeapon(mode, modeLoadout, 0);
            this.saveStateToStorage();
            return;
        }

        if (this.gunFireState.roundsRemainingInBurst <= 0) {
            this.stopGunFireTimer();
            this.saveStateToStorage();
            return;
        }

        this.gunFireState.timerId = setTimeout(() => this.processGunFireTick(), this.GUN_FIRE_TICK_MS);
    }

    ensureGunFireTimerRunning() {
        if (this.gunFireState.timerId) return;
        this.gunFireState.timerId = setTimeout(() => this.processGunFireTick(), this.GUN_FIRE_TICK_MS);
    }

    startGunFire(mode, modeLoadout) {
        if (!modeLoadout || !Number.isFinite(modeLoadout.gun) || modeLoadout.gun <= 0) return false;
        const wasIdle = !this.gunFireState.timerId;
        this.gunFireState.mode = mode;
        this.gunFireState.roundsRemainingInBurst += this.GUN_ROUNDS_PER_BURST;
        if (wasIdle) this.processGunFireTick();
        else this.ensureGunFireTimerRunning();
        this.triggerFireFlash();
        return true;
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
        return !!window.BasePlugin?.getActiveAddon?.()?.radar?.hardLockedUid;
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

    fireSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return false;
        if (mode === 'NAV' || mode === 'JETTISON') return false;

        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) {
            if (!this.selectNextWeapon(mode, modeLoadout, 0)) return false;
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
            if (!selected) return false;
        }

        if (selected.station === 'gun') return this.startGunFire(mode, modeLoadout);
        if (!this.hasRadarHardLock()) return false;

        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station || !Number.isFinite(station.quantity)) return false;

        if (station.quantity <= 0) {
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
            return false;
        }

        station.quantity -= 1;
        this.triggerFireFlash();
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
        }
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

﻿  class F18HudModule {
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

    computeHudGeometry(w, h) {
    const hudVerticalFovDeg = 2 * Math.atan((F18HudModule.HUD_PHYSICAL_HEIGHT_M / 2) / F18HudModule.CAMERA_TO_HUD_DISTANCE_M) * F18HudModule.RAD_TO_DEG;
    const pixelsPerDeg = h / hudVerticalFovDeg;
    const hudPhysicalWidthM = F18HudModule.HUD_PHYSICAL_HEIGHT_M * (w / h);
    const hudHorizontalFovDeg = 2 * Math.atan((hudPhysicalWidthM / 2) / F18HudModule.CAMERA_TO_HUD_DISTANCE_M) * F18HudModule.RAD_TO_DEG;
    const pixelsPerDegX = w / hudHorizontalFovDeg;
    const cameraDeltaZ = this.getCurrentCameraZ() - this.dependencies.cameraModule?.DEFAULT_HUD_CAMERA_Z;
    const cameraOffsetDeg = Math.atan2(cameraDeltaZ, F18HudModule.CAMERA_TO_HUD_DISTANCE_M) * F18HudModule.RAD_TO_DEG;
    const cameraOffsetPx = cameraOffsetDeg * pixelsPerDeg * F18HudModule.HUD_PARALLAX_GAIN;
    return { pixelsPerDeg, pixelsPerDegX, cameraOffsetPx };
  
    }

    updateFpvState(lla, ac) {
    if (!Array.isArray(lla) || !Number.isFinite(lla[0]) || !Number.isFinite(lla[1]) || !Number.isFinite(lla[2])) {
      return;
    }

    const fpvState = this.fpvState;

    const lat = lla[0];
    const lon = lla[1];
    const alt = lla[2];

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

        const hdgDeg = (window.geofs?.animation?.values?.heading360 ?? window.geofs?.animation?.values?.heading ?? ac.htr?.[0] ?? 0);
        const pitchDegNow = -(ac.htr[1] || 0);

        fpvState.relAzDeg = this.dependencies.helperModule?.angleDiffDeg?.(hdgDeg, trackDeg) ?? 0;
        fpvState.relElDeg = fpaDeg - pitchDegNow;
        fpvState.valid = true;
      }
    }

    fpvState.lastLat = lat;
    fpvState.lastLon = lon;
    fpvState.lastAlt = alt;
  
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

  static drawPitchLadder(ctx, camera, pitchDeg, cx, clipCy, symbolCy, pixelsPerDeg, w, h) {
    const cameraCompY = symbolCy - clipCy;
    const horizonOffsetY = pitchDeg * pixelsPerDeg + cameraCompY;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Clip to an approximate physical HUD combiner shape (wide, angular),
    // instead of a small circular clip.
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.06);
    ctx.lineTo(w * 0.66, h * 0.06);
    ctx.lineTo(w * 0.92, h * 0.27);
    ctx.lineTo(w * 0.82, h * 0.92);
    ctx.lineTo(w * 0.18, h * 0.92);
    ctx.lineTo(w * 0.08, h * 0.27);
    ctx.closePath();
    ctx.clip();

    // Keep the horizon vertically tied to the real horizon (pitch + camera offset).
    // Roll only rotates the ladder around that horizon anchor point.
    ctx.translate(cx, clipCy + horizonOffsetY);
    ctx.rotate(-camera.roll);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.5;

    // Horizon line
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-w * 0.56, 0);
    ctx.lineTo(w * 0.56, 0);
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
        const tickY = sign * deg * pixelsPerDeg;
        const isBelow = sign > 0;
        const tickDir = isBelow ? -1 : 1;

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
    const fpvState = this.fpvState;
    if (!fpvState.valid) return null;

    const boresightY = cy - cameraOffsetPx;
    const dxBody = -(fpvState.relAzDeg * pixelsPerDegX);
    const dyBody = -(fpvState.relElDeg * pixelsPerDeg);
    const cr = Math.cos(-camera.roll);
    const sr = Math.sin(-camera.roll);
    const fpvX = cx + (dxBody * cr - dyBody * sr);
    const fpvY = boresightY + (dxBody * sr + dyBody * cr);

    return { x: fpvX, y: fpvY };
  
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

        const { pixelsPerDeg, pixelsPerDegX, cameraOffsetPx } = this.computeHudGeometry(w, h);

        this.updateFpvState(ac.llaLocation, ac);
        if (hudLevel == 'FULL') {
          F18HudModule.drawBoresight(o, cx, cy, cameraOffsetPx, w, h);
        }
        F18HudModule.drawPitchLadder(o, camera, pitchDeg, cx, cy, cy - cameraOffsetPx, pixelsPerDeg, w, h);

        const fpvPos = this.computeFpvScreenPosition(camera, cx, cy, pixelsPerDeg, pixelsPerDegX, cameraOffsetPx);
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
      if (!this.isAircraftCameraReady()) return false;

      const cockpitViewPresets = this.getCockpitViewPresets();
      const cameraModeDefinitions = this.getCameraModeDefinitions();

      const isCockpitView = window.geofs?.camera?.currentModeName === 'cockpit';
      if (isCockpitView) {
        if (!this.installCameraControls()) return false;
        if (cockpitViewPresets.length > 0) {
          if (!this.installCockpitViewControls()) return false;
        } else {
          this.removeCockpitViewControls();
        }
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
    MFD_PART_MODEL_URL: 'models/gauges/glassPanel/glassPanel.gltf'
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
          name: 'glassPanel',
          textures: { diffuse: '' }
        }
      },
      renderer: {
        name: rendererName,
        width: 512,
        height: 512,
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

    const glassNode = nodesByName.glassPanel;
    if (!glassNode) return false;

    glassNode.name = nodeName;
    nodesByName[nodeName] = glassNode;
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

      const glassNode = nodesByName.glassPanel;
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
    const partObj = aircraft.parts[this.names.MFD_PART_NAME].object3d;
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
      [-halfW, 0, halfW],
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
    const hudPart = Object.values(window.geofs.aircraft.instance.parts)
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

  class F15MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '3591';
    static DEFAULT_MFD_LAYOUT = [
      {
        name: 'LEFT',
        position: [-0.2, 7.12, 0.795],
        rotation: [9, 0, 0],
        scale: [0.25, 0.25, 0.25],
        defaultPageTitle: 'NAV'
      },
      {
        name: 'RIGHT',
        position: [0.201, 7.107, 0.808],
        rotation: [9, 0, 0],
        scale: [0.23, 0.23, 0.23],
        defaultPageTitle: 'SYS'
      },
      {
        name: 'CENTER',
        position: [-0.308, 7.096, 0.608],
        rotation: [9, 0, 0],
        scale: [0.27, 0.27, 0.27],
        defaultPageTitle: 'CHK'
      }
    ];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'F15', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'F15Options');
      this.addonGlobalKey = `${this.id}Addon`;

      console.log(`[F15MainPlugin] Initializing plugin version ${this.version}...`);

      this.addon = {
        version: this.version,
        options: {
          buildKey: OptionModule.buildOptionKey,
          read: OptionModule.readOptions,
          write: OptionModule.writeOptions,
          get: OptionModule.getOption,
          set: OptionModule.setOption,
          getValue: OptionModule.getOptionValue
        },
        // Instantiate all modules under this plugin addon instance
        weapons: new WeaponModule({
          ...window.WeaponModuleDefaults?.fighter,
          storageKey: 'F15WpnState'
        }),
        checklists: ChecklistModule.loadDefaults('fighter') ?? new ChecklistModule(),
        helper: new HelperModule(),
        dataCartridge: null,
        map: null,
        nav: null,
        communication: new CommunicationModule(),
        system: new SystemModule(),
        flight: null,
        radar: null,
        targetingPod: null,
        hud: new F18HudModule(),
        camera: null, // Will be initialized with helper reference
        fmc: new FMCModule(),
        controls: null, // Will be initialized with helper reference
        recorder: new RecorderModule(),
        mfd: MfdModule,
        lifecycle: {
          start: () => this.start(),
          stop: () => this.stop(),
          restart: () => this.restart(),
          isRunning: () => this.isRunning()
        }
      };
      window[this.addonGlobalKey] = this.addon;

      const addon = this.addon;

      // Initialize modules that need helper reference
      addon.camera = new CameraModule(addon.helper, F15MainPlugin.CAMERA_CONFIG);
      addon.controls = new ControlModule(addon.helper);
      addon.dataCartridge = new DataCartridgeModule();
      addon.nav = new NavModule();
      addon.map = new MapModule();
      addon.radar = new RadarModule({ navModule: addon.nav });
      addon.targetingPod = new TargetingPodModule(() => this.addon);
      addon.flight = new FlightModule(() => this.addon);
      addon.nav.setMapModule(addon.map);
      addon.nav.setDataCartridgeModule(addon.dataCartridge);
      addon.map.setNavModule(addon.nav);

      // Create MFD module BEFORE page registration
      addon.mfd = new MfdModule(
        addon.helper,
        addon.map,
        addon.camera,
        addon.weapons,
        addon.recorder
      );

      // Register MFD pages from each module
      addon.recorder.registerMfdPages(addon.mfd);
      addon.hud.registerMfdPages(addon.mfd);
      addon.system.registerMfdPages(addon.mfd);
      addon.checklists.registerMfdPages(addon.mfd);
      addon.weapons.registerMfdPages(addon.mfd);
      addon.nav.registerMfdPages(addon.mfd);
      addon.radar.registerMfdPages(addon.mfd);
      addon.communication.registerMfdPages(addon.mfd);
      addon.flight.registerMfdPages(addon.mfd);
      addon.targetingPod.registerMfdPages(addon.mfd);

      this.setManagedModules([
        addon.controls
      ]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === F15MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return this.addon.mfd.pageRegistry;
    }

    tryInstall() {
      // Core modules
      const hudReady = this.addon?.hud?.ensureLoaded();
      const cameraReady = this.addon?.camera?.ensureLoaded();
      const fmcReady = this.addon?.fmc?.ensureLoaded();
      const controlsReady = this.addon?.controls?.ensureLoaded();
      const communicationReady = this.addon?.communication?.ensureLoaded();
      
      // MFD module handles its own loading
      const mfdReady = this.addon?.mfd?.ensureLoaded();
      
      // Return true if core systems are ready
      return hudReady
        && cameraReady
        && fmcReady
        && controlsReady
        && communicationReady
        && mfdReady;
    }

    start() {
      if (!this.startLifecycle()) return;

      // Initialize MFDs first before starting install loop
      this.addon.mfd.initializeDefaultMfds(F15MainPlugin.DEFAULT_MFD_LAYOUT);
      this.addon.mfd.startCameraWatch();

      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('F15MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;

      this.addon?.weapons?.stopGunFireTimer();
      this.addon?.mfd?.restore();
      
      this.addon?.communication?.restore();
      this.addon?.fmc?.restore();
      this.addon?.camera?.restore();
      this.addon?.hud?.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.F15MainPlugin = F15MainPlugin;
})();


// Entry point:
(function () {
  'use strict';

  const VERSION = '2.0.0';

  const PluginCtor = window.F15MainPlugin;
  if (typeof PluginCtor !== 'function') {
    console.error('[GeoFS F-15 Addon] F15MainPlugin is not available on window.');
    return;
  }

  const plugin = new PluginCtor({ version: VERSION });
  window.F15Plugin = plugin;
  window.BasePlugin.registerPlugin(plugin);
})();