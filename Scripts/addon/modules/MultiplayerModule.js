(function () {
  'use strict';

  const { turnVelocity, mul } = CombatMath;

  const STORAGE_KEY = 'geofs-addon-combat-mp';
  const CHAT_PREFIX = 'F7|';
  const CHAT_LIMIT = 70;
  const GROUP_LENGTH = 16;
  const EVENT_FRESH_MS = 15000;
  const MAX_NETWORK_MISSILES = 32;
  const NETWORK_HIT_RADIUS_M = 35;

  /**
   * Transport that carries combat events as plain text in the public GeoFS chat.
   * Everything transport specific lives here, so another channel can replace it
   * later by providing the same `send` / `start` / `stop` surface.
   */
  class GeoFsChatTransport {
    constructor(onChatMessage) {
      this.onChatMessage = onChatMessage;
      this.originalUpdate = null;
      this.wrappedUpdate = null;
    }

    isAvailable() {
      return typeof window.multiplayer?.setChatMessage === 'function';
    }

    /** Sends a text message; returns true on success. Throws a readable error otherwise. */
    send(message) {
      if (!this.isAvailable()) throw new Error('GEOFS CHAT SYNC API UNAVAILABLE');
      if (message.length > CHAT_LIMIT) throw new Error('SYNC EVENT EXCEEDS GEOFS CHAT LIMIT');
      window.multiplayer.setChatMessage(message);
      return true;
    }

    getSelfId(payload) {
      return String(window.multiplayer?.myId ?? window.multiplayer?.lastResponse?.myId ?? payload?.myId ?? '');
    }

    /**
     * Wraps the multiplayer update callback once per multiplayer object. Other
     * addon modules (CommunicationModule) wrap the same callback, so this never
     * re-wraps just because someone else wrapped on top of it: two modules that
     * each re-wrap when the other's wrapper is outermost would grow the call
     * chain forever and break the original GeoFS update (no visible users).
     */
    ensureHook() {
      const multiplayer = window.multiplayer;
      if (!multiplayer || typeof multiplayer.updateCallback !== 'function') return false;
      if (this.hookedMultiplayer === multiplayer) return true;
      const transport = this;
      const original = multiplayer.updateCallback;
      this.hookedMultiplayer = multiplayer;
      this.originalUpdate = original;
      this.active = true;
      this.wrappedUpdate = function (payload) {
        if (transport.active) {
          try {
            const messages = Array.isArray(payload?.chatMessages) ? payload.chatMessages : [];
            for (const message of messages) transport.onChatMessage(message, payload);
          } catch (error) {
            console.error('[MultiplayerModule] chat processing failed', error);
          }
        }
        return original.apply(this, arguments);
      };
      multiplayer.updateCallback = this.wrappedUpdate;
      return true;
    }

    stop() {
      this.active = false;
      const multiplayer = this.hookedMultiplayer;
      if (multiplayer && multiplayer.updateCallback === this.wrappedUpdate && this.originalUpdate) {
        multiplayer.updateCallback = this.originalUpdate;
      }
      this.hookedMultiplayer = null;
    }
  }
  /**
   * Multiplayer combat sync: compact `F7|<group>|<type>|...` chat events for
   * missile launch (L), hit (H), evade (D), miss/expiry (X) and a test ping (T).
   * Incoming missiles that target the local player are simulated and drawn here.
   */
  class MultiplayerModule {
    constructor(combat, config = {}) {
      this.combat = combat;
      combat.multiplayer = this;
      this.cfg = { ...config };
      const saved = CombatMath.readStorage(STORAGE_KEY, {}) || {};
      this.enabled = !!saved.enabled;
      this.group = typeof saved.group === 'string' ? saved.group.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, GROUP_LENGTH) : '';
      this.sharedHits = 0;
      this.networkMissiles = [];
      this.receivedNetworkEvents = new Set();
      this.seenChatMessages = new Set();
      this.transport = new GeoFsChatTransport((message, payload) => this.processChat(message, payload));
      this.lastHookCheck = 0;
      this.unsubscribers = [];
    }

    start() {
      this.transport.ensureHook();
      const overlay = this.combat.overlay;
      if (!overlay) return;
      this.unsubscribers.push(
        overlay.registerLayer('multiplayer', 40, (ctx, f) => this.updateAndDrawNetworkMissiles(ctx, f)),
        overlay.onAircraftChange(() => { this.networkMissiles = []; })
      );
    }

    stop() {
      this.transport.stop();
      for (const unsubscribe of this.unsubscribers) unsubscribe();
      this.unsubscribers = [];
      this.networkMissiles = [];
    }

    saveSettings() {
      CombatMath.writeStorage(STORAGE_KEY, { enabled: this.enabled, group: this.group });
    }

    rememberEvent(key) {
      this.receivedNetworkEvents.add(key);
      if (this.receivedNetworkEvents.size > 500) {
        this.receivedNetworkEvents.delete(this.receivedNetworkEvents.values().next().value);
      }
    }

    // ---- Protocol ----

    groupFingerprint() {
      let hash = 2166136261;
      for (let i = 0; i < this.group.length; i++) {
        hash ^= this.group.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    }

    encodeEvent(eventData) {
      if (!Array.isArray(eventData)) return '';
      const prefix = `${CHAT_PREFIX}${this.groupFingerprint()}|`;
      if (eventData[1] === 'T') return `${prefix}T|${Date.now().toString(36)}`;
      if (eventData[1] === 'L' && eventData[0] === 3) {
        const [, , missileId, targetId, sentAt] = eventData;
        if (typeof missileId !== 'string' || typeof targetId !== 'string') return '';
        const sentAtToken = typeof sentAt === 'string' ? sentAt : Number(sentAt).toString(36);
        if (!/^[0-9a-z]+$/i.test(sentAtToken)) return '';
        return prefix + ['L', encodeURIComponent(missileId), encodeURIComponent(targetId), sentAtToken].join('|');
      }
      if ((eventData[1] === 'H' || eventData[1] === 'X' || eventData[1] === 'D') && eventData.length === 5) {
        const [, type, missileId, targetId, sentAt] = eventData;
        if (typeof missileId !== 'string' || typeof targetId !== 'string' || !Number.isFinite(sentAt)) return '';
        return prefix + [type, encodeURIComponent(missileId), encodeURIComponent(targetId), sentAt.toString(36)].join('|');
      }
      return '';
    }

    parseEvent(value) {
      const fields = value.split('|');
      const type = fields[0];
      if (type === 'T' && fields.length === 2) {
        const sentAt = Number.parseInt(fields[1], 36);
        return Number.isFinite(sentAt) ? [1, 'T', sentAt] : null;
      }
      if (type === 'L' && fields.length === 4) {
        const sentAt = Number.parseInt(fields[3], 36);
        if (!Number.isFinite(sentAt)) return null;
        return [3, 'L', decodeURIComponent(fields[1]), decodeURIComponent(fields[2]), sentAt];
      }
      if ((type === 'H' || type === 'X' || type === 'D') && fields.length === 4) {
        const sentAt = Number.parseInt(fields[3], 36);
        if (!Number.isFinite(sentAt)) return null;
        return [1, type, decodeURIComponent(fields[1]), decodeURIComponent(fields[2]), sentAt];
      }
      return null;
    }

    /** GeoFS may URL-encode chat text once or twice; decode up to two times. */
    normalizeChatText(value) {
      let text = String(value ?? '');
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const decoded = decodeURIComponent(text.replace(/\+/g, '%20'));
          if (decoded === text) break;
          text = decoded;
        } catch (error) {
          break;
        }
      }
      return text;
    }

    /** Sends a sync event; resolves to false when sync is disabled or sending failed. */
    async sendEvent(eventData) {
      if (!this.enabled || this.group.length < GROUP_LENGTH) return false;
      try {
        const message = this.encodeEvent(eventData);
        if (!message) return false;
        return this.transport.send(message);
      } catch (error) {
        this.combat.notify(error.message || 'MULTIPLAYER EVENT COULD NOT BE SENT', 3000);
        return false;
      }
    }

    getUser(userId) {
      const users = window.multiplayer?.visibleUsers;
      if (!users || typeof users !== 'object') return null;
      const id = String(userId);
      for (const [key, user] of Object.entries(users)) {
        if ([key, user?.id, user?.uid].some((value) => value != null && String(value) === id)) return user;
      }
      return null;
    }

    getUserLabel(userId) {
      const user = this.getUser(userId);
      const label = user?.callsign ?? user?.cs ?? user?.aircraftName ?? user?.username;
      return label ? String(label).slice(0, 20) : `PLAYER ${String(userId).slice(0, 12)}`;
    }

    processChat(message, payload) {
      if (!this.enabled || this.group.length < GROUP_LENGTH) return;
      const senderId = String(message?.uid ?? '');
      const selfId = this.transport.getSelfId(payload);
      if (!senderId || (selfId && senderId === selfId)) return;

      const chatText = this.normalizeChatText(message?.msg);
      if (!chatText.startsWith(CHAT_PREFIX)) return;
      const groupSeparator = chatText.indexOf('|', CHAT_PREFIX.length);
      if (groupSeparator < 0) return;
      if (chatText.slice(CHAT_PREFIX.length, groupSeparator) !== this.groupFingerprint()) return;
      const messageKey = `${senderId}:${chatText}`;
      if (this.seenChatMessages.has(messageKey)) return;
      this.seenChatMessages.add(messageKey);
      if (this.seenChatMessages.size > 500) {
        this.seenChatMessages.delete(this.seenChatMessages.values().next().value);
      }

      try {
        const data = this.parseEvent(chatText.slice(groupSeparator + 1));
        if (!data) throw new Error('Malformed sync event');
        this.processEvent(data, senderId, selfId);
      } catch (error) {
        this.combat.notify(`INVALID SYNC CHAT MESSAGE (${chatText.length} CHARS)`, 3000);
      }
    }

    isFresh(sentAt) {
      return Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) <= EVENT_FRESH_MS;
    }

    processEvent(data, senderId, selfId) {
      if (!this.enabled || !Array.isArray(data)) return;
      const type = data[1];

      if (type === 'T') {
        this.combat.notify('MULTIPLAYER SYNC TEST RECEIVED', 3000);
        return;
      }

      const [, , missileId, targetId, sentAt] = data;
      if (typeof missileId !== 'string' || !this.isFresh(sentAt)) return;
      const key = `${senderId}:${missileId}`;

      if (type === 'L') {
        // A launch aimed at the local player: spawn a visible incoming missile.
        if (data[0] !== 3 || !selfId || String(targetId) !== selfId) return;
        if (this.receivedNetworkEvents.has(`L:${key}`)) return;
        const coordinates = this.getUser(senderId)?.lastUpdate?.co;
        const own = geofs.aircraft.instance?.llaLocation;
        if (!Array.isArray(coordinates) || coordinates.length < 3 || !Array.isArray(own) || own.length < 3) return;
        const [lat, lon, altitude] = coordinates.map(Number);
        if (![lat, lon, altitude].every(Number.isFinite)) return;
        const position = Cesium.Cartesian3.fromDegrees(lon, lat, altitude);
        const targetPosition = Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]);
        const direction = Cesium.Cartesian3.subtract(targetPosition, position, new Cesium.Cartesian3());
        const distance = Cesium.Cartesian3.magnitude(direction);
        if (!Number.isFinite(distance) || distance <= 0) return;
        Cesium.Cartesian3.normalize(direction, direction);
        Cesium.Cartesian3.multiplyByScalar(direction, 900, direction);
        this.rememberEvent(`L:${key}`);
        this.networkMissiles.push({
          key, senderId, missileId, position,
          velocity: [direction.x, direction.y, direction.z],
          speed: 900,
          turnRate: 1.2,
          maxFlightTime: Math.min(240, Math.max(8, distance / 700 + 10)),
          t0: performance.now(),
          updatedAt: performance.now(),
          trail: []
        });
        if (this.networkMissiles.length > MAX_NETWORK_MISSILES) this.networkMissiles.shift();
        this.combat.notify(`MISSILE LAUNCHED BY ${this.getUserLabel(senderId)}`, 2500);
        return;
      }

      if (type === 'H') {
        if (String(targetId) !== selfId) return;
        if (this.receivedNetworkEvents.has(`D:${key}`) || this.receivedNetworkEvents.has(`H:${key}`)) return;
        this.rememberEvent(`H:${key}`);
        this.networkMissiles = this.networkMissiles.filter((missile) => missile.key !== key);
        this.sharedHits++;
        const own = geofs.aircraft.instance?.llaLocation;
        if (Array.isArray(own) && own.length >= 3) {
          this.combat.overlay?.addImpact(Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]));
        }
        this.combat.notify(`MISSILE HIT FROM ${this.getUserLabel(senderId)}`, 3500);
        return;
      }

      if (type === 'D') {
        // The evading player reports its own id as the target of the original launch.
        if (String(targetId) !== senderId) return;
        const evadeKey = `D:${key}`;
        if (this.receivedNetworkEvents.has(evadeKey)) return;
        const projectile = this.combat.projectile;
        const missile = projectile?.missiles.find((item) =>
          item.networkId === missileId && String(item.targetId) === senderId);
        if (!missile) return;
        this.rememberEvent(evadeKey);
        projectile.missiles = projectile.missiles.filter((item) => item !== missile);
        this.combat.overlay?.addImpact(CombatMath.worldPosition(missile.enuMat, missile.position));
        this.combat.notify(`${this.getUserLabel(senderId)} EVADED MISSILE WITH FLARES`, 3000);
        return;
      }

      if (type === 'X') {
        if (String(targetId) !== selfId) return;
        this.networkMissiles = this.networkMissiles.filter((missile) => missile.key !== key);
      }
    }

    /**
     * Removes the incoming network missiles (flares worked) and reports them as
     * evaded. Returns { count, promise } where the promise resolves to the number
     * of evade messages that were sent.
     */
    evadeIncomingMissiles() {
      const now = performance.now();
      const incoming = this.networkMissiles.filter((missile) => now - missile.t0 < missile.maxFlightTime * 1000);
      if (!incoming.length) return null;
      const selfId = this.transport.getSelfId();
      const sends = incoming.map((missile) => {
        this.rememberEvent(`D:${missile.key}`);
        if (!this.enabled || !selfId) return Promise.resolve(false);
        return this.sendEvent([1, 'D', missile.missileId, selfId, Date.now()]);
      });
      this.networkMissiles = this.networkMissiles.filter((missile) => !incoming.includes(missile));
      return {
        count: incoming.length,
        promise: Promise.all(sends).then((results) => results.filter(Boolean).length)
      };
    }

    // ---- Incoming missile simulation ----

    updateAndDrawNetworkMissiles(ctx, f) {
      if (f.nowMs - this.lastHookCheck > 1000) {
        this.lastHookCheck = f.nowMs;
        this.transport.ensureHook();
        this.mountOptions();
      }
      if (!this.enabled || !this.networkMissiles.length) return;
      const own = geofs.aircraft.instance.llaLocation;
      if (!Array.isArray(own) || own.length < 3) return;
      const now = f.nowMs;
      const ownWorld = Cesium.Cartesian3.fromDegrees(own[1], own[0], own[2]);
      const live = [];

      for (const missile of this.networkMissiles) {
        const age = (now - missile.t0) / 1000;
        if (age > missile.maxFlightTime + 5) continue;
        const dt = Math.min(0.25, Math.max(0, (now - missile.updatedAt) / 1000));
        const previousPosition = missile.position;
        const delta = Cesium.Cartesian3.subtract(ownWorld, previousPosition, new Cesium.Cartesian3());
        const distance = Cesium.Cartesian3.magnitude(delta);
        let nextPosition = previousPosition;
        if (distance > 0 && dt > 0) {
          missile.velocity = turnVelocity(missile.velocity, [delta.x, delta.y, delta.z], missile.turnRate * dt);
          const speed = Math.hypot(...missile.velocity) || 1;
          missile.velocity = mul(missile.velocity, missile.speed / speed);
          nextPosition = Cesium.Cartesian3.add(previousPosition,
            Cesium.Cartesian3.multiplyByScalar(new Cesium.Cartesian3(...missile.velocity), dt, new Cesium.Cartesian3()),
            new Cesium.Cartesian3());
        }
        if (age > 0.15 && dt > 0) {
          const segment = Cesium.Cartesian3.subtract(nextPosition, previousPosition, new Cesium.Cartesian3());
          const segmentSquared = Cesium.Cartesian3.dot(segment, segment);
          const toTarget = Cesium.Cartesian3.subtract(ownWorld, previousPosition, new Cesium.Cartesian3());
          const closestFraction = segmentSquared > 0
            ? Math.max(0, Math.min(1, Cesium.Cartesian3.dot(toTarget, segment) / segmentSquared))
            : 0;
          const closestPoint = Cesium.Cartesian3.add(previousPosition,
            Cesium.Cartesian3.multiplyByScalar(segment, closestFraction, new Cesium.Cartesian3()),
            new Cesium.Cartesian3());
          if (Cesium.Cartesian3.distance(closestPoint, ownWorld) <= NETWORK_HIT_RADIUS_M) {
            const hitKey = `H:${missile.key}`;
            if (!this.receivedNetworkEvents.has(hitKey)) {
              this.rememberEvent(hitKey);
              this.sharedHits++;
              f.overlay.addImpact(Cesium.Cartesian3.clone(ownWorld), now);
              this.combat.notify(`MISSILE HIT FROM ${this.getUserLabel(missile.senderId)}`, 3500);
            }
            continue;
          }
        }
        missile.position = nextPosition;
        missile.updatedAt = now;
        missile.trail.push(Cesium.Cartesian3.clone(nextPosition));
        if (missile.trail.length > 18) missile.trail.shift();
        live.push(missile);

        ctx.save();
        ctx.strokeStyle = '#ff4545';
        ctx.fillStyle = '#ff4545';
        ctx.shadowColor = '#ff2020';
        ctx.shadowBlur = 9;
        ctx.lineWidth = 2.5;
        for (let i = 1; i < missile.trail.length; i++) {
          const from = f.overlay.worldToScreen(f.scene, missile.trail[i - 1], true);
          const to = f.overlay.worldToScreen(f.scene, missile.trail[i], true);
          if (!from || !to) continue;
          ctx.globalAlpha = i / missile.trail.length;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
        const point = f.overlay.worldToScreen(f.scene, missile.position, true);
        if (point) {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      this.networkMissiles = live;
    }

    // ---- Options -> General UI ----

    mountOptions() {
      const mounted = CombatMath.ensureGeneralFieldset('addon-combat-mp', 'Combat Multiplayer');
      if (!mounted || mounted.controls.dataset.built) return;
      mounted.controls.dataset.built = '1';
      this.buildOptions(mounted.controls);
    }

    buildOptions(container) {
      const label = document.createElement('label');
      Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 6px' });
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = this.enabled;
      enabledInput.setAttribute('aria-label', 'Enable multiplayer missile sync');
      enabledInput.addEventListener('change', () => {
        this.enabled = enabledInput.checked;
        this.saveSettings();
        if (!this.enabled) this.networkMissiles = [];
        this.combat.notify(`MULTIPLAYER MISSILE SYNC ${this.enabled ? 'ON' : 'OFF'}`, 2000);
      });
      label.append(enabledInput, document.createTextNode('Enable multiplayer missile sync'));

      const groupLabel = document.createElement('label');
      Object.assign(groupLabel.style, { display: 'flex', alignItems: 'center', gap: '8px' });
      groupLabel.appendChild(document.createTextNode('Sync group code'));
      const groupInput = document.createElement('input');
      groupInput.type = 'text';
      groupInput.value = this.group;
      groupInput.maxLength = GROUP_LENGTH;
      groupInput.autocomplete = 'off';
      groupInput.spellcheck = false;
      groupInput.placeholder = 'share the same 16-character code';
      groupInput.setAttribute('aria-label', 'Multiplayer missile sync group code');
      groupInput.addEventListener('change', () => {
        const value = groupInput.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, GROUP_LENGTH);
        if (groupInput.value !== value) groupInput.value = value;
        this.group = value;
        this.saveSettings();
      });
      groupLabel.appendChild(groupInput);

      const generateButton = CombatMath.makeButton('Generate Group Code', 'Generate a random sync group code', () => {
        this.group = crypto.randomUUID().replace(/-/g, '').slice(0, GROUP_LENGTH);
        groupInput.value = this.group;
        this.saveSettings();
      });
      const testButton = CombatMath.makeButton('Send Sync Test', 'Send a multiplayer sync test message', async () => {
        if (!this.enabled) {
          this.combat.notify('ENABLE MULTIPLAYER SYNC FIRST', 2500);
          return;
        }
        if (this.group.length < GROUP_LENGTH) {
          this.combat.notify('SET A 16-CHARACTER SYNC GROUP CODE', 2500);
          return;
        }
        if (await this.sendEvent([1, 'T', Date.now()])) {
          this.combat.notify('SYNC TEST SENT IN PUBLIC GEOFS CHAT', 3000);
        }
      });
      const buttons = document.createElement('div');
      Object.assign(buttons.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0' });
      buttons.append(generateButton, testButton);

      const note = document.createElement('p');
      note.style.margin = '6px 0';
      note.textContent = 'Both players need the same 16-character group code and updated addon. Lock a radar contact with Enter before launching a missile; Backspace releases flares and reports an evade for synced incoming missiles. Sync messages are plain text in public GeoFS chat; anyone can read them. The group fingerprint only filters messages.';
      container.append(label, groupLabel, buttons, note);
    }
  }

  window.GeoFsChatTransport = GeoFsChatTransport;
  window.MultiplayerModule = MultiplayerModule;
})();
