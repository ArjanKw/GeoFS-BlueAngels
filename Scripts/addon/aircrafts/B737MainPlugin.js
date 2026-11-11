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

      this.setManagedModules([window.B737Addon.controls, ...this.initializeOptionalModules(window.B737Addon, config.optionalModules)]);
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
