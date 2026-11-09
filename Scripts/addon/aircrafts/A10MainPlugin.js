(function () {
  'use strict';

  console.log('[AircraftBuilder][generated-main] script started');
  console.log('[AircraftBuilder][generated-main] dependency state', {
    BasePlugin: typeof window.BasePlugin,
    MfdModule: typeof window.MfdModule,
    OptionModule: typeof window.OptionModule,
    aircraftClass: 'A10MainPlugin'
  });

  class A10MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '2310';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'LEFT',
    position: [-0.259, 4.627, 0.72],
    rotation: [15, 0, 0],
    scale: [0.27, 0.18, 0.275],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'RIGHT',
    position: [0.259, 4.627, 0.72],
    rotation: [15, 0, 0],
    scale: [0.27, 0.18, 0.275],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'CENTER',
    position: [0.364, 4.37, 0.334],
    rotation: [66, 0, 0],
    scale: [0.25, 0.1, 0.235],
    defaultPageTitle: 'NAV'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'a10', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'A10AddonOptions');

      window.A10Addon = {
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
          storageKey: 'A10AddonWpnState'
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

      window.A10Addon.camera = new CameraModule(window.A10Addon.helper, A10MainPlugin.CAMERA_CONFIG);
      window.A10Addon.controls = new ControlModule(window.A10Addon.helper);
      window.A10Addon.nav = new NavModule();
      window.A10Addon.map = new MapModule();
      window.A10Addon.nav.setMapModule(window.A10Addon.map);
      window.A10Addon.map.setNavModule(window.A10Addon.nav);

      window.A10Addon.dataCartridge = new DataCartridgeModule();
      window.A10Addon.radar = new RadarModule({
        navModule: window.A10Addon.nav,
        weaponModule: window.A10Addon.weapons
      });
      window.A10Addon.targetingPod = new TargetingPodModule(() => window.A10Addon);
      window.A10Addon.flight = new FlightModule(() => window.A10Addon);
      window.A10Addon.nav.setDataCartridgeModule(window.A10Addon.dataCartridge);

      window.A10Addon.mfd = new MfdModule(
        window.A10Addon.helper,
        window.A10Addon.map,
        window.A10Addon.camera,
        window.A10Addon.weapons,
        window.A10Addon.recorder
      );

      window.A10Addon.checklists.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.nav.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.weapons.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.hud.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.recorder.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.communication.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.system.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.radar.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.flight.registerMfdPages(window.A10Addon.mfd);
      window.A10Addon.targetingPod.registerMfdPages(window.A10Addon.mfd);

      this.setManagedModules([window.A10Addon.controls]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === A10MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.A10Addon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.A10Addon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.A10Addon.mfd.initializeDefaultMfds(A10MainPlugin.DEFAULT_MFD_LAYOUT);
      window.A10Addon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('A10MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.A10Addon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.A10MainPlugin = A10MainPlugin;
})();
