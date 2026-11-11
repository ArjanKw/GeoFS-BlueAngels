(function () {
  'use strict';

  class F18MainPlugin extends window.BasePlugin {
    static AIRCRAFT_ID = '27';
    static DEFAULT_MFD_LAYOUT = [
      {
        name: 'LEFT',
        position: [-0.2160, 6.158, 0.584],
        rotation: [8, 0, 0],
        scale: [0.29, 0.29, 0.285],
        defaultPageTitle: 'NAV'
      },
      {
        name: 'RIGHT',
        position: [0.2167, 6.158, 0.584],
        rotation: [8, 0, 0],
        scale: [0.29, 0.29, 0.285],
        defaultPageTitle: 'SYS'
      },
      {
        name: 'CENTER',
        position: [-0.003, 6.085, 0.335],
        rotation: [23.5, 0, 0],
        scale: [0.335, 0.335, 0.335],
        defaultPageTitle: 'CHK'
      }
    ];

    static CAMERA_CONFIG = {
      cockpitViewPresets: [
        {
          name: 'DEFAULT',
          position: [0, 5.5, 0.95],
          orientation: [0, -15, 0],
          FOV: 1.7
        },
        {
          name: 'MFD',
          position: [0, 5.7, 0.78],
          orientation: [0.7, -34.48, 0],
          FOV: 1.7
        },
        {
          name: 'THR/JOY',
          position: [-0.17, 5.4, 0.3],
          orientation: [0, -8, 0],
          FOV: 1.7
        },
        {
          name: 'SEAT-SIDE',
          position: [0.38, 5, 0.8],
          orientation: [-20, -13, 0],
          FOV: 2
        },
        {
          name: 'LOOK-BACK',
          position: [0.9, 4.86, 0.6],
          orientation: [-211, -2.3, 0],
          FOV: 2
        }
      ],
      cameraModeDefinitions: {
        6: {
          distance: 0,
          FOV: 10,
          insideView: false,
          mode: 6,
          name: 'Nose cam',
          offsetBounds: [-0.4, 0.4, 0, 0.1, -0.3, 0.3],
          offsets: {
            current: [0, 0.5, -1],
            last: [0, 0.5, 0],
            neutral: [0, 0.5, 0]
          },
          orientation: [180, 20, -1.5],
          orientations: {
            current: [180, 20, 0],
            last: [180, 20, 0],
            neutral: [180, 20, 0]
          },
          position: [0, 11.55, -1.5],
          view: 'Nose cam'
        },
        7: {
          distance: 0,
          FOV: 10,
          insideView: false,
          mode: 7,
          name: 'Cockpit Rear',
          offsetBounds: [-0.4, 0.4, 0, 0.1, -0.3, 0.3],
          offsets: {
            current: [0, 0.5, -1],
            last: [0, 0.5, 0],
            neutral: [0, 0.5, 0]
          },
          orientation: [180, -15, -1.5],
          orientations: {
            current: [180, -15, 0],
            last: [180, -15, 0],
            neutral: [180, -15, 0]
          },
          position: [0, 5, 3.4],
          view: 'Cockpit Rear'
        },
        8: {
          distance: 0,
          FOV: 10,
          insideView: false,
          mode: 8,
          name: 'Wingman',
          offsetBounds: [-0.4, 0.4, 0, 0.1, -0.3, 0.3],
          offsets: {
            current: [0, 0.5, -1],
            last: [0, 0.5, 0],
            neutral: [0, 0.5, 0]
          },
          orientation: [115, -12, 0],
          orientations: {
            current: [115, -15, 0],
            last: [115, -15, 0],
            neutral: [115, -15, 0]
          },
          position: [1, 4, -0.3],
          view: 'Wingman'
        },
        9: {
          distance: 0,
          FOV: 2,
          insideView: false,
          mode: 9,
          name: 'Down Rear',
          offsetBounds: [-0.4, 0.4, 0, 0.1, -0.3, 0.3],
          offsets: {
            current: [0, 0.5, -1],
            last: [0, 0.5, 0],
            neutral: [0, 0.5, 0]
          },
          orientation: [180, 20, -1.5],
          orientations: {
            current: [180, 20, 0],
            last: [180, 20, 0],
            neutral: [180, 20, 0]
          },
          position: [0, 4, -1],
          view: 'Down Rear'
        },
        10: {
          distance: 0,
          FOV: 2,
          insideView: false,
          mode: 10,
          name: 'Gun cam',
          offsetBounds: [-0.4, 0.4, 0, 0.1, -0.3, 0.3],
          offsets: {
            current: [0, -6, -1],
            last: [0, 0.5, 0],
            neutral: [0, 0.5, 0]
          },
          orientation: [10, 0, 0],
          orientations: {
            current: [10, 0, 0],
            last: [0, 20, 0],
            neutral: [0, 20, 0]
          },
          position: [3, 4.5, 1.85],
          view: 'Gun cam'
        },
        11: {
          distance: 0,
          FOV: 10,
          insideView: false,
          mode: 11,
          name: 'Wing cam',
          offsetBounds: [-0.4, 0.4, 0, 0.1, -0.3, 0.3],
          offsets: {
            current: [0, -5, -1],
            last: [0, 0.5, 0],
            neutral: [0, 0.5, 0]
          },
          orientation: [30, 35, 0],
          orientations: {
            current: [30, 35, 0],
            last: [0, 20, 0],
            neutral: [0, 20, 0]
          },
          position: [-6, 0, 0.1],
          view: 'Wing cam'
        }
      }
    };

    static HUD_COMBINER_CONFIG = {
      origin: [0, 6.389, 0.712],
      normal: [0, -0.966, 0.259],
      right: [1, 0, 0],
      up: [0, 0.259, 0.966],
      outline: [
        [-0.15, -0.15],
        [0.15, -0.15],
        [0.15, 0.15],
        [-0.15, 0.15]
      ]
    };

    constructor(config = {}) {
      super({ id: 'F18', version: config.version ?? '2.0.0' });
      OptionModule.initializeStorageKey(this.id, 'F18Options');
      this.addonGlobalKey = `${this.id}Addon`;

      console.log(`[F18MainPlugin] Initializing plugin version ${this.version}...`);

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
          storageKey: 'F18WpnState'
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
        hud: new F18HudModule({ hudCombinerConfig: F18MainPlugin.HUD_COMBINER_CONFIG }),
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
      addon.camera = new CameraModule(addon.helper, F18MainPlugin.CAMERA_CONFIG);
      addon.controls = new ControlModule(addon.helper);
      addon.dataCartridge = new DataCartridgeModule();
      addon.nav = new NavModule();
      addon.map = new MapModule();
      addon.radar = new RadarModule({ navModule: addon.nav, weaponModule: addon.weapons });
      addon.targetingPod = new TargetingPodModule(() => this.addon);
      addon.flight = new FlightModule(() => this.addon);
      addon.nav.setMapModule(addon.map);
      addon.nav.setDataCartridgeModule(addon.dataCartridge);
      addon.map.setNavModule(addon.nav);

      // Create MFD module
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
          keybind: true,
          weaponHud: { enabled: true },
          projectile: true,
          aaCombat: { enabled: true },
          multiplayer: { enabled: true }
        })
      ]);
    }

    registerF18Controls() {
      if (!this.isAircraftActive()) return false;

      return this.runOnce('F18ControlsRegistered', () => {
        this.addon.controls.registerControl({
          key: 'SYS.CANOPY',
          padLabel: 'CANOPY',
          defaultState: 'CLOSED',
          durationMs: 5000,
          parts: [
            {
              partName: 'CanopyFrameCockpit',
              motion: {
                OPEN: { delayMs: 0, durationMs: 5000 },
                CLOSED: { delayMs: 0, durationMs: 5000 }
              },
              channels: {
                CanopyFrameCockpitRotXDeg: { OPEN: -40, CLOSED: 0 },
                CanopyFrameCockpitRotYDeg: { OPEN: 0, CLOSED: 0 },
                CanopyFrameCockpitRotZDeg: { OPEN: 0, CLOSED: 0 }
              }
            },
            {
              partName: 'CanopyFrame',
              motion: {
                OPEN: { delayMs: 0, durationMs: 5000 },
                CLOSED: { delayMs: 0, durationMs: 5000 }
              },
              channels: {
                CanopyFrameRotXDeg: { OPEN: -40, CLOSED: 0 },
                CanopyFrameRotYDeg: { OPEN: 0, CLOSED: 0 },
                CanopyFrameRotZDeg: { OPEN: 0, CLOSED: 0 }
              }
            },
            {
              partName: 'CanopyArm',
              motion: {
                OPEN: { delayMs: 0, durationMs: 5000 },
                CLOSED: { delayMs: 0, durationMs: 5000 }
              },
              channels: {
                CanopyArmRotXDeg: { OPEN: -40, CLOSED: 0 },
                CanopyArmRotYDeg: { OPEN: 0, CLOSED: 0 },
                CanopyArmRotZDeg: { OPEN: 0, CLOSED: 0 }
              }
            }
          ]
        });

        this.addon.controls.registerControl({
        key: 'SYS.REFUELING',
        padLabel: 'PROBE',
        defaultState: 'CLOSED',
        durationMs: 1200,
        parts: [
          {
            partName: 'Probe',
            motion: {
              OPEN: { delayMs: 2600, durationMs: 2200 },
              CLOSED: { delayMs: 0, durationMs: 2200 }
            },
            channels: {
              ProbeRotXDeg: { OPEN: -40, CLOSED: 0 },
              ProbeRotYDeg: { OPEN: 10, CLOSED: 0 },
              ProbeRotZDeg: { OPEN: 20, CLOSED: 0 }
            }
          },
          {
            partName: 'RefDoor1',
            motion: {
              OPEN: { delayMs: 2600, durationMs: 2200 },
              CLOSED: { delayMs: 0, durationMs: 2200 }
            },
            channels: {
              RefDoor1RotXDeg: { OPEN: -40, CLOSED: 0 },
              RefDoor1RotYDeg: { OPEN: 10, CLOSED: 0 },
              RefDoor1RotZDeg: { OPEN: 30, CLOSED: 0 }
            }
          },
          {
            partName: 'RefDoor2',
            motion: {
              OPEN: { delayMs: 0, durationMs: 2000 },
              CLOSED: { delayMs: 2400, durationMs: 2000 }
            },
            channels: {
              RefDoor2RotXDeg: { OPEN: -10, CLOSED: 0 },
              RefDoor2RotYDeg: { OPEN: 60, CLOSED: 0 },
              RefDoor2RotZDeg: { OPEN: -20, CLOSED: 0 }
            }
          }
        ]
      });
      });
    }

    isAircraftActive() {
      return window.geofs?.aircraft?.instance?.id === F18MainPlugin.AIRCRAFT_ID;
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

      if (this.isAircraftActive()) {
        this.registerF18Controls();
      }
      
      // MFD system
      const mfdReady = this.addon.mfd.ensureLoaded();
      
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

      // Initialize MFDs
      this.addon.mfd.initializeDefaultMfds(F18MainPlugin.DEFAULT_MFD_LAYOUT);
      this.addon.mfd.startCameraWatch();

      this.tickActive();
    }

    tickActive() {
      this.runInstallTick('F18MainPlugin', () => this.tryInstall());
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

  window.F18MainPlugin = F18MainPlugin;
})();
