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
      super({ id: 'F15', version: config.version ?? '3.0.0' });
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
        addon.controls,
        ...this.initializeOptionalModules(addon, config.optionalModules ?? {
          keybind: true, weaponHud: { enabled: true }, projectile: true,
          aaCombat: { enabled: true }, multiplayer: { enabled: true }
        })
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
