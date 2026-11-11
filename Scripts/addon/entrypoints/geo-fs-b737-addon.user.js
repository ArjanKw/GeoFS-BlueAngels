// ==UserScript==
// @name         GeoFS Boeing 737 Addon
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      2.1.0
// @description  Improves the cockpit with a new HUD and custom MFDs, adjustable seat height and more.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/core/runtime.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/HelperModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/OptionModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/CombatMathModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponOverlayModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/TargetModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponAudioModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/KeybindModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponHudModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/ProjectileModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/AACombatModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/MultiplayerModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/ChecklistModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/DataCartridgeModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/NavModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/MapModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/RadarModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/CommunicationModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/RecorderModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/F18MfdUiState.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/SystemModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/FlightModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/TargetingPodModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/F18HudModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/CameraModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/FMCModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/ControlModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/MfdModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/defaults/WeaponModuleDefaults.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/defaults/ChecklistModuleDefaults.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/aircrafts/BasePlugin.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/aircrafts/B737MainPlugin.js
// ==/UserScript==

(function () {
  'use strict';

  class B737MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '4';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'LEFT',
    position: [-0.294, 0.347, -0.133],
    rotation: [14.5, 0, 0],
    scale: [0.325, 0.05, 0.296],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'RIGHT',
    position: [0.287, 0.347, -0.133],
    rotation: [14.5, 0, 0],
    scale: [0.325, 0.05, 0.296],
    defaultPageTitle: 'COMM'
  },
  {
    name: 'CENTER',
    position: [-0.001, 0.202, -0.317],
    rotation: [55.3, 0, 0],
    scale: [0.338, 0.21, 0.385],
    defaultPageTitle: 'CHK'
  },
  {
    name: 'AUX1',
    position: [0, 0.347, -0.131],
    rotation: [14.5, 0, 0],
    scale: [0.315, 0.29, 0.295],
    defaultPageTitle: 'SYS'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'b737', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'B737AddonOptions');

      window.B737Addon = {
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
          storageKey: 'B737AddonWpnState'
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

      window.B737Addon.camera = new CameraModule(window.B737Addon.helper, B737MainPlugin.CAMERA_CONFIG);
      window.B737Addon.controls = new ControlModule(window.B737Addon.helper);
      window.B737Addon.nav = new NavModule();
      window.B737Addon.map = new MapModule();
      window.B737Addon.nav.setMapModule(window.B737Addon.map);
      window.B737Addon.map.setNavModule(window.B737Addon.nav);

      window.B737Addon.dataCartridge = new DataCartridgeModule();
      window.B737Addon.radar = new RadarModule({
        navModule: window.B737Addon.nav,
        weaponModule: window.B737Addon.weapons
      });
      window.B737Addon.targetingPod = new TargetingPodModule(() => window.B737Addon);
      window.B737Addon.flight = new FlightModule(() => window.B737Addon);
      window.B737Addon.nav.setDataCartridgeModule(window.B737Addon.dataCartridge);

      window.B737Addon.mfd = new MfdModule(
        window.B737Addon.helper,
        window.B737Addon.map,
        window.B737Addon.camera,
        window.B737Addon.weapons,
        window.B737Addon.recorder
      );

      window.B737Addon.checklists.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.nav.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.weapons.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.hud.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.recorder.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.communication.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.system.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.radar.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.flight.registerMfdPages(window.B737Addon.mfd);
      window.B737Addon.targetingPod.registerMfdPages(window.B737Addon.mfd);

      this.setManagedModules([window.B737Addon.controls]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === B737MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.B737Addon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.B737Addon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.B737Addon.mfd.initializeDefaultMfds(B737MainPlugin.DEFAULT_MFD_LAYOUT);
      window.B737Addon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('B737MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.B737Addon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.B737MainPlugin = B737MainPlugin;
})();


(function () {
  'use strict';

  const VERSION = '2.1.0';

  const PluginCtor = window.B737MainPlugin;
  if (typeof PluginCtor !== 'function') {
    console.error('[GeoFS Boeing 737 Addon] B737MainPlugin is not available on window.');
    return;
  }

  const plugin = new PluginCtor({ version: VERSION });
  window.B737Plugin = plugin;
  window.BasePlugin.registerPlugin(plugin);
})();
