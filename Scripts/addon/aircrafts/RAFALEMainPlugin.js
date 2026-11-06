(function () {
  'use strict';

  class RAFALEMainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '29';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'CENTER',
    position: [0, 4.918, 0.854],
    rotation: [15.5, 0, 0],
    scale: [0.2, 0.2, 0.185],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'LEFT',
    position: [-0.13, 5.088, 0.778],
    rotation: [15.5, 0, 0],
    scale: [0.18, 0.18, 0.165],
    defaultPageTitle: 'FLT'
  },
  {
    name: 'RIGHT',
    position: [0.127, 5.088, 0.778],
    rotation: [15.5, 0, 0],
    scale: [0.18, 0.17, 0.165],
    defaultPageTitle: 'RDR'
  },
  {
    name: 'AUX1',
    position: [-0.256, 5.017, 0.695],
    rotation: [16, 0, 0],
    scale: [0.14, 0.14, 0.119],
    defaultPageTitle: 'WPN'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'rafale', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'RAFALEAddonOptions');

      window.RAFALEAddon = {
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
          storageKey: 'RAFALEAddonWpnState'
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
        dataCartridge: new DataCartridgeModule(),
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

      window.RAFALEAddon.camera = new CameraModule(window.RAFALEAddon.helper, RAFALEMainPlugin.CAMERA_CONFIG);
      window.RAFALEAddon.controls = new ControlModule(window.RAFALEAddon.helper);
      window.RAFALEAddon.nav = new NavModule();
      window.RAFALEAddon.map = new MapModule();
      window.RAFALEAddon.nav.setMapModule(window.RAFALEAddon.map);
      window.RAFALEAddon.map.setNavModule(window.RAFALEAddon.nav);

      window.RAFALEAddon.dataCartridge = new DataCartridgeModule();
      window.RAFALEAddon.radar = new RadarModule({
        navModule: window.RAFALEAddon.nav,
        weaponModule: window.RAFALEAddon.weapons
      });
      window.RAFALEAddon.targetingPod = new TargetingPodModule(() => window.RAFALEAddon);
      window.RAFALEAddon.flight = new FlightModule(() => window.RAFALEAddon);
      window.RAFALEAddon.nav.setDataCartridgeModule(window.RAFALEAddon.dataCartridge);

      window.RAFALEAddon.mfd = new MfdModule(
        window.RAFALEAddon.helper,
        window.RAFALEAddon.map,
        window.RAFALEAddon.camera,
        window.RAFALEAddon.weapons,
        window.RAFALEAddon.recorder
      );

      window.RAFALEAddon.checklists.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.nav.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.weapons.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.hud.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.recorder.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.communication.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.system.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.radar.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.flight.registerMfdPages(window.RAFALEAddon.mfd);
      window.RAFALEAddon.targetingPod.registerMfdPages(window.RAFALEAddon.mfd);

      this.setManagedModules([window.RAFALEAddon.controls]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === RAFALEMainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.RAFALEAddon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.RAFALEAddon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.RAFALEAddon.mfd.initializeDefaultMfds(RAFALEMainPlugin.DEFAULT_MFD_LAYOUT);
      window.RAFALEAddon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('RAFALEMainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.RAFALEAddon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.RAFALEMainPlugin = RAFALEMainPlugin;
})();
