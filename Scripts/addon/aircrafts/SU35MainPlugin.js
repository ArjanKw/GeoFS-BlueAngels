(function () {
  'use strict';

  console.log('[AircraftBuilder][generated-main] script started');
  console.log('[AircraftBuilder][generated-main] dependency state', {
    BasePlugin: typeof window.BasePlugin,
    MfdModule: typeof window.MfdModule,
    OptionModule: typeof window.OptionModule,
    aircraftClass: 'SU35MainPlugin'
  });

  class SU35MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '18';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'LEFT',
    position: [-0.175, 8.225, 0.919],
    rotation: [12.25, 0, 0],
    scale: [0.531, 0.32, 0.441],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'RIGHT',
    position: [0.175, 8.23, 0.919],
    rotation: [14.85, 0, 0],
    scale: [0.531, 0.29, 0.411],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'CENTER',
    position: [0.211, 8.249, 1.112],
    rotation: [8.2, 0, 0],
    scale: [0.141, 0.2, 0.134],
    defaultPageTitle: 'NAV'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'su35', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'SU35AddonOptions');

      window.SU35Addon = {
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
          storageKey: 'SU35AddonWpnState'
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

      window.SU35Addon.camera = new CameraModule(window.SU35Addon.helper, SU35MainPlugin.CAMERA_CONFIG);
      window.SU35Addon.controls = new ControlModule(window.SU35Addon.helper);
      window.SU35Addon.nav = new NavModule();
      window.SU35Addon.map = new MapModule();
      window.SU35Addon.nav.setMapModule(window.SU35Addon.map);
      window.SU35Addon.map.setNavModule(window.SU35Addon.nav);

      window.SU35Addon.dataCartridge = new DataCartridgeModule();
      window.SU35Addon.radar = new RadarModule({
        navModule: window.SU35Addon.nav,
        weaponModule: window.SU35Addon.weapons
      });
      window.SU35Addon.targetingPod = new TargetingPodModule(() => window.SU35Addon);
      window.SU35Addon.flight = new FlightModule(() => window.SU35Addon);
      window.SU35Addon.nav.setDataCartridgeModule(window.SU35Addon.dataCartridge);

      window.SU35Addon.mfd = new MfdModule(
        window.SU35Addon.helper,
        window.SU35Addon.map,
        window.SU35Addon.camera,
        window.SU35Addon.weapons,
        window.SU35Addon.recorder
      );

      window.SU35Addon.checklists.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.nav.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.weapons.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.hud.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.recorder.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.communication.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.system.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.radar.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.flight.registerMfdPages(window.SU35Addon.mfd);
      window.SU35Addon.targetingPod.registerMfdPages(window.SU35Addon.mfd);

      this.setManagedModules([window.SU35Addon.controls]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === SU35MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.SU35Addon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.SU35Addon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.SU35Addon.mfd.initializeDefaultMfds(SU35MainPlugin.DEFAULT_MFD_LAYOUT);
      window.SU35Addon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('SU35MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.SU35Addon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.SU35MainPlugin = SU35MainPlugin;
})();
