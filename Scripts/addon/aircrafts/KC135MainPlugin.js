(function () {
  'use strict';

  class KC135MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '2003';
    static DEFAULT_MFD_LAYOUT = [
  {
    name: 'CENTER',
    position: [-0.027, 17.66, -0.236],
    rotation: [0, 0, 0],
    scale: [0.314, 0.05, 0.217],
    defaultPageTitle: 'CHK'
  },
  {
    name: 'LEFT',
    position: [-0.328, 17.658, -0.275],
    rotation: [1, 0, 0],
    scale: [0.113, 0.05, 0.11],
    defaultPageTitle: 'NAV'
  },
  {
    name: 'RIGHT',
    position: [0.326, 17.658, -0.275],
    rotation: [0, 0, 0],
    scale: [0.116, 0.01, 0.11],
    defaultPageTitle: 'FLT'
  }
];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [],
      cameraModeDefinitions: {}
    };

    constructor(config = {}) {
      super({ id: 'kc135', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'KC135AddonOptions');

      window.KC135Addon = {
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
          storageKey: 'KC135AddonWpnState'
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

      window.KC135Addon.camera = new CameraModule(window.KC135Addon.helper, KC135MainPlugin.CAMERA_CONFIG);
      window.KC135Addon.controls = new ControlModule(window.KC135Addon.helper);
      window.KC135Addon.nav = new NavModule();
      window.KC135Addon.map = new MapModule();
      window.KC135Addon.nav.setMapModule(window.KC135Addon.map);
      window.KC135Addon.map.setNavModule(window.KC135Addon.nav);

      window.KC135Addon.dataCartridge = new DataCartridgeModule();
      window.KC135Addon.radar = new RadarModule({
        navModule: window.KC135Addon.nav,
        weaponModule: window.KC135Addon.weapons
      });
      window.KC135Addon.targetingPod = new TargetingPodModule(() => window.KC135Addon);
      window.KC135Addon.flight = new FlightModule(() => window.KC135Addon);
      window.KC135Addon.nav.setDataCartridgeModule(window.KC135Addon.dataCartridge);

      window.KC135Addon.mfd = new MfdModule(
        window.KC135Addon.helper,
        window.KC135Addon.map,
        window.KC135Addon.camera,
        window.KC135Addon.weapons,
        window.KC135Addon.recorder
      );

      window.KC135Addon.checklists.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.nav.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.weapons.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.hud.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.recorder.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.communication.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.system.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.radar.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.flight.registerMfdPages(window.KC135Addon.mfd);
      window.KC135Addon.targetingPod.registerMfdPages(window.KC135Addon.mfd);

      this.setManagedModules([window.KC135Addon.controls]);
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === KC135MainPlugin.AIRCRAFT_ID;
    }

    getMfdPages() {
      return window.KC135Addon.mfd.pageRegistry;
    }

    tryInstall() {
      return window.KC135Addon.mfd.ensureLoaded();
    }

    start() {
      if (!this.startLifecycle()) return;
      window.KC135Addon.mfd.initializeDefaultMfds(KC135MainPlugin.DEFAULT_MFD_LAYOUT);
      window.KC135Addon.mfd.startCameraWatch();
      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('KC135MainPlugin', () => this.tryInstall());
    }

    stop() {
      if (!this.stopLifecycle()) return;
      window.KC135Addon.mfd.restore();
    }

    restart() {
      this.stop();
      this.start();
    }

    isRunning() {
      return this.running;
    }
  }

  window.KC135MainPlugin = KC135MainPlugin;
})();
