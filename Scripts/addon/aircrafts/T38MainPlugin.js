(function () {
  'use strict';

  class T38MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '32';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'RIGHT',
    position: [0.307, 4.595, 0.31],
    rotation: [2.5, 0, 0],
    scale: [0.16, 0.19, 0.2],
    defaultPageTitle: 'FLT'
  },
  {
    name: 'CENTER',
    position: [0, 4.515, 0.147],
    rotation: [34, 0, 0],
    scale: [0.29, 0.29, 0.335],
    defaultPageTitle: 'NAV'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 't38', version: config.version ?? '3.0.0' });
      OptionModule.initializeStorageKey(this.id, 'T38AddonOptions');

      window.T38Addon = {
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
          storageKey: 'T38AddonWpnState'
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

      window.T38Addon.camera = new CameraModule(window.T38Addon.helper, T38MainPlugin.CAMERA_CONFIG);
      window.T38Addon.controls = new ControlModule(window.T38Addon.helper);
      window.T38Addon.nav = new NavModule();
      window.T38Addon.map = new MapModule();
      window.T38Addon.nav.setMapModule(window.T38Addon.map);
      window.T38Addon.map.setNavModule(window.T38Addon.nav);

      window.T38Addon.dataCartridge = new DataCartridgeModule();
      window.T38Addon.radar = new RadarModule({
        navModule: window.T38Addon.nav,
        weaponModule: window.T38Addon.weapons
      });
      window.T38Addon.targetingPod = new TargetingPodModule(() => window.T38Addon);
      window.T38Addon.flight = new FlightModule(() => window.T38Addon);
      window.T38Addon.nav.setDataCartridgeModule(window.T38Addon.dataCartridge);

      window.T38Addon.mfd = new MfdModule(
        window.T38Addon.helper,
        window.T38Addon.map,
        window.T38Addon.camera,
        window.T38Addon.weapons,
        window.T38Addon.recorder
      );

      window.T38Addon.checklists.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.nav.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.weapons.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.hud.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.recorder.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.communication.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.system.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.radar.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.flight.registerMfdPages(window.T38Addon.mfd);
      window.T38Addon.targetingPod.registerMfdPages(window.T38Addon.mfd);

      this.setManagedModules([window.T38Addon.controls, ...this.initializeOptionalModules(window.T38Addon, config.optionalModules)]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === T38MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.T38Addon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.T38Addon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.T38Addon.mfd.initializeDefaultMfds(T38MainPlugin.DEFAULT_MFD_LAYOUT);
      window.T38Addon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('T38MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.T38Addon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.T38MainPlugin = T38MainPlugin;
})();
