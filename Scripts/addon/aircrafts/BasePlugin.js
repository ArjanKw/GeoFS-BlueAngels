(function () {
  'use strict';

  class BasePlugin {
    static LIFECYCLE_INTERVAL_MS = 500;

    static getRuntime() {
      if (!window.GeoFsAddonPluginRuntime) {
        window.GeoFsAddonPluginRuntime = {
          activePlugin: null,
          plugins: [],
          lifecycleTimer: null
        };
      }
      return window.GeoFsAddonPluginRuntime;
    }

    constructor(config = {}) {
      this.id = config.id;
      this.version = config.version;
      this.api = null;
      this.running = false;
      this.managedModules = [];
      this.installAttempts = 0;
      this.installComplete = false;
      this.installMaxAttempts = 50;
      this.once = Object.create(null);
    }

    static registerPlugin(plugin) {
      const runtime = BasePlugin.getRuntime();
      if (!runtime.plugins.includes(plugin)) {
        runtime.plugins.push(plugin);
      }
      BasePlugin.ensureLifecycleLoop();
      BasePlugin.syncPlugins();
      return plugin;
    }

    static ensureLifecycleLoop() {
      const runtime = BasePlugin.getRuntime();
      if (runtime.lifecycleTimer) return;
      runtime.lifecycleTimer = setInterval(() => {
        BasePlugin.syncPlugins();
      }, BasePlugin.LIFECYCLE_INTERVAL_MS);
    }

    static syncPlugins() {
      const runtime = BasePlugin.getRuntime();
      for (const plugin of runtime.plugins) {
        const shouldRun = plugin.isAircraftActive();
        const isRunning = plugin.isRunning();

        if (shouldRun && !isRunning) {
          plugin.start();
        } else if (!shouldRun && isRunning) {
          plugin.stop();
        }

        if (shouldRun && plugin.isRunning()) {
          plugin.tickActive();
        }
      }
    }

    static setActivePlugin(plugin) {
      const runtime = BasePlugin.getRuntime();
      runtime.activePlugin = plugin;
      return runtime.activePlugin;
    }

    static getActivePlugin() {
      return BasePlugin.getRuntime().activePlugin;
    }

    static getActiveAddon() {
      return BasePlugin.getActivePlugin()?.addon ?? null;
    }

    static isAircraftActive() {
      const activePlugin = BasePlugin.getActivePlugin();
      if (!activePlugin) return false;
      return activePlugin.isAircraftActive();
    }

    static getActiveMfdPages() {
      const activePlugin = BasePlugin.getActivePlugin();
      if (!activePlugin) return [];
      return activePlugin.getMfdPages();
    }

    setManagedModules(modules) {
      this.managedModules = modules;
      return this;
    }

    /**
     * Attach optional cross-aircraft capabilities without changing core modules.
     * Modules are enabled only when explicitly requested by a plugin constructor.
     */
    initializeOptionalModules(addon, options = {}) {
      const weapons = addon?.weapons;
      const cfg = (value) => (value === true ? {} : value);
      const wantsCombat = !!(options.weaponHud || options.projectile || options.aaCombat || options.multiplayer);
      if (!weapons || !window.CombatContext || !(wantsCombat || options.keybind)) {
        addon.optionalModules = [];
        return [];
      }

      // Shared context: every optional module plugs into it, none draws on its own.
      const combat = new window.CombatContext();
      combat.weapons = weapons;
      const modules = [];
      const add = (name, Module, ...args) => {
        if (!Module) return null;
        const instance = new Module(...args);
        modules.push(instance);
        addon[name] = instance;
        return instance;
      };

      add('weaponOverlay', window.WeaponOverlayModule, combat, cfg(options.overlay) ?? {});
      add('combatTargets', window.TargetModule, combat, addon);
      add('weaponAudio', window.WeaponAudioModule, combat, weapons, cfg(options.audio) ?? {});
      if (options.keybind) add('keybinds', window.KeybindModule, combat, weapons, cfg(options.keybind));
      if (options.weaponHud) add('weaponHud', window.WeaponHudModule, combat, weapons, cfg(options.weaponHud));
      if (options.projectile) add('projectile', window.ProjectileModule, combat, weapons, cfg(options.projectile));
      if (options.aaCombat) add('aaCombat', window.AACombatModule, combat, cfg(options.aaCombat));
      if (options.multiplayer) add('multiplayer', window.MultiplayerModule, combat, cfg(options.multiplayer));

      addon.combat = combat;
      addon.optionalModules = modules;
      return modules;
    }
    startManagedModules() {
      for (const module of this.managedModules) {
        if (typeof module.start === 'function') {
          module.start();
        }
      }
    }

    stopManagedModules() {
      for (let index = this.managedModules.length - 1; index >= 0; index -= 1) {
        const module = this.managedModules[index];
        if (typeof module.stop === 'function') {
          module.stop();
        }
      }
    }

    resetInstallState() {
      this.installAttempts = 0;
      this.installComplete = false;
    }

    startLifecycle() {
      if (this.running) return false;
      if (!this.isAircraftActive()) return false;

      OptionModule.useStorageKeyForAircraft(this.id);
      BasePlugin.setActivePlugin(this);
      addonRuntime.mainPlugin = this;
      this.running = true;
      this.resetInstallState();
      this.startManagedModules();
      return true;
    }

    stopLifecycle() {
      if (!this.running) return false;

      this.running = false;
      this.stopManagedModules();

      if (BasePlugin.getActivePlugin() === this) {
        BasePlugin.setActivePlugin(null);
      }
      if (addonRuntime.mainPlugin === this) {
        addonRuntime.mainPlugin = null;
      }

      return true;
    }

    runInstallTick(label, installer) {
      if (!this.running || this.installComplete) return this.installComplete;

      this.installAttempts += 1;
      this.installComplete = installer();

      if (!this.installComplete && this.installAttempts > this.installMaxAttempts) {
        this.installComplete = true;
        console.warn(`[${label}] Install timeout after ${this.installMaxAttempts} attempts, continuing anyway`);
      }

      return this.installComplete;
    }

    runOnce(key, action) {
      if (this.once[key]) return false;
      action();
      this.once[key] = true;
      return true;
    }

    static createAddonApi({ version, helper = {}, options = {}, sections = {} } = {}) {
      return {
        version,
        helper,
        options,
        ...sections
      };
    }

    start() {
      throw new Error('start() must be implemented by subclass');
    }

    stop() {
      throw new Error('stop() must be implemented by subclass');
    }

    restart() {
      this.stop();
      return this.start();
    }

    tickActive() {}

    getMfdPages() {
      return [];
    }

    isRunning() {
      return false;
    }

    isAircraftActive() {
      throw new Error('isAircraftActive() must be implemented by subclass');
    }
  }

  window.BasePlugin = BasePlugin;
})();
