(function () {
  'use strict';

  const DEFAULT_BINDINGS = {
    fire: 'Backslash',
    selectWeaponNext: 'Equal',
    selectWeaponPrevious: 'Minus',
    targetMode: 'KeyT',
    selectPrevious: 'Comma',
    selectNext: 'Slash',
    lock: 'Enter',
    countermeasures: 'Backspace',
    display: 'KeyU',
    reload: 'Shift+KeyU'
  };

  const OPTION_KEYS = {
    fire: 'FIRE',
    selectWeaponNext: 'WPN_NEXT',
    selectWeaponPrevious: 'WPN_PREV',
    targetMode: 'TGT_MODE',
    selectPrevious: 'TGT_PREV',
    selectNext: 'TGT_NEXT',
    lock: 'LOCK',
    countermeasures: 'CM',
    display: 'DISPLAY',
    reload: 'RELOAD'
  };

  const LABELS = {
    fire: 'Fire (hold for gun)',
    selectWeaponNext: 'Next weapon',
    selectWeaponPrevious: 'Previous weapon',
    targetMode: 'Target mode',
    selectPrevious: 'Previous target',
    selectNext: 'Next target',
    lock: 'Lock target',
    countermeasures: 'Countermeasures',
    display: 'HUD display on/off',
    reload: 'Rearm (parked, master off)'
  };

  /**
   * Keyboard controls for the weapon system. Bindings are `event.code` values,
   * optionally prefixed with `Shift+`, and are stored per aircraft through
   * OptionModule. The module only translates keys into calls on WeaponModule,
   * TargetModule, ProjectileModule and the overlay; it holds no weapon state.
   * Target keys (select/lock) are only captured while target mode is on, so
   * Enter/Comma/Slash keep their normal GeoFS meaning otherwise.
   */
  class KeybindModule {
    constructor(combat, weaponModule, config = {}) {
      this.combat = combat;
      this.weaponModule = weaponModule;
      combat.keybinds = this;
      this.bindings = {};
      for (const [action, fallback] of Object.entries(DEFAULT_BINDINGS)) {
        this.bindings[action] = config[`${action}Code`]
          ?? OptionModule.getOption('KEY', OPTION_KEYS[action], fallback);
      }
      this.running = false;
      this.optionsTimer = null;
      this.onKeyDown = (event) => this.handleKeyDown(event);
      this.onKeyUp = (event) => this.handleKeyUp(event);
      this.onBlur = () => this.weaponModule?.releaseTrigger?.();
    }

    start() {
      if (this.running) return;
      window.addEventListener('keydown', this.onKeyDown, true);
      window.addEventListener('keyup', this.onKeyUp, true);
      window.addEventListener('blur', this.onBlur);
      this.running = true;
      this.installOptionsControls();
      this.optionsTimer = setInterval(() => this.installOptionsControls(), 1000);
    }

    stop() {
      if (!this.running) return;
      window.removeEventListener('keydown', this.onKeyDown, true);
      window.removeEventListener('keyup', this.onKeyUp, true);
      window.removeEventListener('blur', this.onBlur);
      this.weaponModule?.releaseTrigger?.();
      this.running = false;
      clearInterval(this.optionsTimer);
      this.optionsTimer = null;
      document.querySelector('.geofs-addon-keybinds')?.remove();
    }

    installOptionsControls() {
      const mounted = CombatMath.ensureGeneralFieldset('geofs-addon-keybinds', 'Weapon Keybinds');
      if (!mounted || mounted.controls.dataset.built) return;
      mounted.controls.dataset.built = '1';
      for (const [action, label] of Object.entries(LABELS)) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.bindings[action];
        input.title = 'Keyboard event.code, optionally prefixed with Shift+';
        input.addEventListener('change', () => {
          this.bindings[action] = input.value.trim() || DEFAULT_BINDINGS[action];
          input.value = this.bindings[action];
          OptionModule.setOption('KEY', OPTION_KEYS[action], this.bindings[action]);
        });
        const row = document.createElement('label');
        row.style.display = 'block';
        row.textContent = `${label}: `;
        row.appendChild(input);
        mounted.controls.appendChild(row);
      }
    }

    static isTyping(event) {
      const target = event.target;
      return !!(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')));
    }

    /** Finds the action bound to the key, preferring the binding whose Shift requirement matches. */
    findAction(event) {
      let fallback = null;
      for (const [action, binding] of Object.entries(this.bindings)) {
        const requiresShift = /^shift\+/i.test(binding);
        const code = binding.replace(/^shift\+/i, '');
        if (code !== event.code) continue;
        if (requiresShift === event.shiftKey) return action;
        if (!requiresShift) fallback = fallback ?? action;
      }
      return fallback;
    }

    handleKeyDown(event) {
      if (KeybindModule.isTyping(event) || event.ctrlKey || event.altKey || event.metaKey) return;
      const action = this.findAction(event);
      if (!action) return;

      const targets = this.combat.targets;
      const targetKey = action === 'selectNext' || action === 'selectPrevious' || action === 'lock';
      if (targetKey && !targets?.targetMode) return;

      // Gun fire is a held key; every other action fires once per key press.
      if (action === 'fire') {
        if (!event.repeat) this.weaponModule?.pressTrigger?.();
        return;
      }
      event.preventDefault();
      if (event.repeat) return;
      this.invoke(action);
    }

    handleKeyUp(event) {
      const binding = this.bindings.fire.replace(/^shift\+/i, '');
      if (event.code === binding) this.weaponModule?.releaseTrigger?.();
    }

    invoke(action) {
      const combat = this.combat;
      const weapons = this.weaponModule;
      const mode = OptionModule.getOption('WPN', 'MODE', 'A/A');
      switch (action) {
        case 'selectWeaponNext':
          return weapons?.selectNextWeapon?.(mode, weapons.getModeLoadout(mode), 0);
        case 'selectWeaponPrevious':
          return weapons?.selectPreviousWeapon?.(mode, weapons.getModeLoadout(mode), 0);
        case 'targetMode':
          return combat.targets?.toggleTargetMode();
        case 'selectNext':
          return combat.targets?.selectTarget(1);
        case 'selectPrevious':
          return combat.targets?.selectTarget(-1);
        case 'lock':
          return combat.targets?.toggleLock();
        case 'countermeasures':
          return combat.projectile?.releaseCountermeasures();
        case 'display':
          return combat.overlay?.toggleEnabled();
        case 'reload': {
          if (OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF') {
            combat.notify('SET MASTER OFF TO REARM', 2000);
            return undefined;
          }
          return weapons?.startRearm?.(OptionModule.getOption('WPN', 'CONFIG', 'A/A'));
        }
        default:
          return undefined;
      }
    }
  }

  window.KeybindModule = KeybindModule;
})();
