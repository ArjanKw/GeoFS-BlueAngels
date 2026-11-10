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

      this.setManagedModules([window.F16Addon.controls]);
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
