(function () {
  'use strict';

  /**
   * Procedural weapon sounds (Web Audio): looping gun fire, dry-fire click,
   * missile launch and countermeasure release. Reacts to WeaponModule events
   * (`fire`, `dryfire`, `gunstate`), so it needs no knowledge of the keybinds.
   */
  class WeaponAudioModule {
    constructor(combat, weaponModule, config = {}) {
      this.combat = combat;
      this.weapons = weaponModule;
      combat.audio = this;
      this.cfg = { sound: true, gunVolume: 0.7, ...config };
      this.actx = null;
      this.gunBuf = null;
      this.gunFilter = null;
      this.gunGain = null;
      this.gunSrc = null;
      this.soundOn = false;
      this.unsubscribers = [];
    }

    start() {
      if (!this.weapons?.on) return;
      this.unsubscribers.push(
        this.weapons.on('fire', (event) => { if (event.weapon && event.weapon !== 'GUN') this.missileSound(); }),
        this.weapons.on('dryfire', () => this.dryClick()),
        this.weapons.on('gunstate', ({ firing }) => this.gunSound(!!firing))
      );
    }

    stop() {
      this.gunSound(false);
      for (const unsubscribe of this.unsubscribers) unsubscribe();
      this.unsubscribers = [];
    }

    /** Creates the AudioContext lazily (it must follow a user gesture). */
    initAudio() {
      if (this.actx || !this.cfg.sound) return;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      const actx = new AudioCtor();
      this.actx = actx;
      const sr = actx.sampleRate;
      const rate = this.weapons?.GUN_FIRE_RATE_RPS ?? 100;
      const period = Math.round(sr / rate);
      const rounds = 60;
      const len = period * rounds;
      this.gunBuf = actx.createBuffer(1, len, sr);
      const d = this.gunBuf.getChannelData(0);
      for (let r = 0; r < rounds; r++) {
        const amp = 0.8 + 0.2 * Math.random();
        const start = r * period;
        for (let n = 0; n < period * 2; n++) {
          const t = n / sr;
          const crack = (Math.random() * 2 - 1) * Math.exp(-t / 0.0012);
          const thump = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.0055);
          d[(start + n) % len] += amp * (0.55 * crack + 0.9 * thump);
        }
      }
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
      for (let i = 0; i < len; i++) d[i] /= (peak || 1);

      this.gunFilter = actx.createBiquadFilter();
      this.gunFilter.type = 'lowpass';
      this.gunFilter.frequency.value = 3200;
      this.gunGain = actx.createGain();
      this.gunGain.gain.value = 0.0001;
      const compressor = actx.createDynamicsCompressor();
      this.gunFilter.connect(this.gunGain);
      this.gunGain.connect(compressor);
      compressor.connect(actx.destination);
    }

    gunSound(on) {
      if (on) this.initAudio();
      const actx = this.actx;
      if (!actx || !this.gunBuf) return;
      const t = actx.currentTime;
      if (on && !this.soundOn) {
        this.soundOn = true;
        if (actx.state === 'suspended') actx.resume();
        this.gunSrc = actx.createBufferSource();
        this.gunSrc.buffer = this.gunBuf;
        this.gunSrc.loop = true;
        this.gunSrc.playbackRate.setValueAtTime(0.55, t);
        this.gunSrc.playbackRate.linearRampToValueAtTime(1, t + 0.25);
        this.gunSrc.connect(this.gunFilter);
        this.gunGain.gain.cancelScheduledValues(t);
        this.gunGain.gain.setValueAtTime(0.0001, t);
        this.gunGain.gain.linearRampToValueAtTime(this.cfg.gunVolume, t + 0.04);
        this.gunSrc.start(t);
      } else if (!on && this.soundOn) {
        this.soundOn = false;
        const src = this.gunSrc;
        this.gunGain.gain.cancelScheduledValues(t);
        this.gunGain.gain.setValueAtTime(Math.max(0.0001, this.gunGain.gain.value), t);
        this.gunGain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
        src.playbackRate.cancelScheduledValues(t);
        src.playbackRate.setValueAtTime(src.playbackRate.value, t);
        src.playbackRate.linearRampToValueAtTime(0.45, t + 0.2);
        src.stop(t + 0.22);
      }
    }

    dryClick() {
      if (!this.cfg.sound) return;
      this.initAudio();
      const actx = this.actx;
      if (!actx) return;
      const sr = actx.sampleRate;
      const n = Math.round(sr * 0.03);
      const buffer = actx.createBuffer(1, n, sr);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
      const src = actx.createBufferSource();
      const gain = actx.createGain();
      const filter = actx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      gain.gain.value = this.cfg.gunVolume * 0.6;
      src.buffer = buffer;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);
      src.start();
    }

    countermeasureSound() {
      if (!this.cfg.sound) return;
      this.initAudio();
      const actx = this.actx;
      if (!actx) return;
      if (actx.state === 'suspended') actx.resume();

      const now = actx.currentTime;
      const length = Math.round(actx.sampleRate * 0.18);
      const buffer = actx.createBuffer(1, length, actx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * 0.055));
      }
      const noise = actx.createBufferSource();
      const filter = actx.createBiquadFilter();
      const noiseGain = actx.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.7;
      noiseGain.gain.setValueAtTime(this.cfg.gunVolume * 0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      noise.buffer = buffer;
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(actx.destination);
      noise.start(now);

      const pop = actx.createOscillator();
      const popGain = actx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(125, now);
      pop.frequency.exponentialRampToValueAtTime(55, now + 0.11);
      popGain.gain.setValueAtTime(this.cfg.gunVolume * 0.3, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      pop.connect(popGain);
      popGain.connect(actx.destination);
      pop.start(now);
      pop.stop(now + 0.13);
    }

    missileSound() {
      if (!this.cfg.sound) return;
      this.initAudio();
      const actx = this.actx;
      if (!actx) return;
      if (actx.state === 'suspended') actx.resume();

      const now = actx.currentTime;
      const oscillator = actx.createOscillator();
      const gain = actx.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(95, now);
      oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.35);
      gain.gain.setValueAtTime(this.cfg.gunVolume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      oscillator.connect(gain);
      gain.connect(actx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.42);
    }
  }

  window.WeaponAudioModule = WeaponAudioModule;
})();
