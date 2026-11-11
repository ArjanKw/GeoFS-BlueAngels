
  class MapModule {
    static RANGE_OPTIONS_NM = [1, 2.5, 5, 10, 20, 40, 80, 160];
    static MARK_STATES = ['', 'FRIEND', 'CIVILIAN', 'UNKNOWN', 'FOO'];
    static SHOW_STATES = ['ALL', 'UNM', 'FRIEND', 'CIVILIAN', 'UNKNOWN', 'FOO'];
    static VIEW_MODES = ['A/C F/W', 'A/C CNT', 'A/C N', 'TGT', 'TGT N'];
    static TRAFFIC_STALE_TIMEOUT_MS = 10000;

    constructor(navModule = null) {
      this.navModule = navModule;
      this.selectedTrafficUid = null;
      this.trafficSelectionCleared = false;
      this.trafficMarksByUid = Object.create(null);
      this.showFilter = 'ALL';
      this.trafficContactsByUid = Object.create(null);
    }

    setNavModule(navModule) {
      this.navModule = navModule;
      return this;
    }

    // Returns the configured NAV range in NM.
    getRangeNm() {
      const raw = Number(OptionModule.getOptionValue('NAV', 'RANGE', 40));
      return this.normalizeRangeNm(raw);
    }

    // Clamps a raw range to the nearest configured NAV range value.
    normalizeRangeNm(rawRange) {
      return Number(rawRange);
    }

    // Stores a normalized NAV range value.
    setRangeNm(range) {
      OptionModule.setOption('NAV', 'RANGE', String(range));
      return range;
    }

    // Steps NAV range up (+1) or down (-1) through configured range options.
    stepRange(step = 0) {
      const direction = Number(step) >= 0 ? 1 : -1;
      const current = this.getRangeNm();
      const options = MapModule.RANGE_OPTIONS_NM;
      const idx = Math.max(0, options.indexOf(current));
      const nextIndex = HelperModule.clampValue(idx + direction, 0, options.length - 1);
      return this.setRangeNm(options[nextIndex]);
    }

    // Returns true when radar-driven traffic should be active.
    isRadarEnabled() {
      return OptionModule.getOptionValue('RDR', 'RADAR', 'OFF') === 'ON';
    }

    // Gets currently active NAV MAP view mode.
    getViewMode() {
      return OptionModule.getOptionValue('NAV', 'VIEW', 'A/C F/W');
    }

    // Sets NAV MAP view mode.
    setViewMode(mode) {
      OptionModule.setOption('NAV', 'VIEW', mode);
      return mode;
    }

    // Cycles NAV MAP view mode.
    cycleViewMode() {
      const modes = MapModule.VIEW_MODES;
      const current = this.getViewMode();
      const idx = Math.max(0, modes.indexOf(current));
      const next = modes[(idx + 1) % modes.length];
      return this.setViewMode(next);
    }

    // Returns frame configuration for NAV MAP projection.
    getMapViewFrame(scene, selectedTraffic = null) {
      const mode = this.getViewMode();
      const ownship = scene?.ownship;
      const ownHeading = Number(ownship?.heading) || 0;

      const selectedLat = Number(selectedTraffic?.lat);
      const selectedLon = Number(selectedTraffic?.lon);
      const hasSelectedPosition = Number.isFinite(selectedLat) && Number.isFinite(selectedLon);

      let centerLat = Number(ownship?.lat);
      let centerLon = Number(ownship?.lon);
      let anchor = 'forward';
      let upHeadingDeg = ownHeading;

      if (mode === 'A/C CNT') {
        anchor = 'center';
      } else if (mode === 'A/C N') {
        anchor = 'center';
        upHeadingDeg = 0;
      } else if (mode === 'TGT') {
        anchor = 'center';
        if (hasSelectedPosition) {
          centerLat = selectedLat;
          centerLon = selectedLon;
        }
      } else if (mode === 'TGT N') {
        anchor = 'center';
        upHeadingDeg = 0;
        if (hasSelectedPosition) {
          centerLat = selectedLat;
          centerLon = selectedLon;
        }
      }

      if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
        return null;
      }

      return {
        mode,
        anchor,
        centerLat,
        centerLon,
        upHeadingDeg
      };
    }

    // Projects one lat/lon point to the active NAV MAP frame.
    projectToMapViewFrame(frame, lat, lon) {
      if (!frame) return null;
      const targetLat = Number(lat);
      const targetLon = Number(lon);
      if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return null;

      const relativeNm = this.toRelativeNm({ lat: frame.centerLat, lon: frame.centerLon }, targetLat, targetLon);
      if (!relativeNm) return null;
      return this.toHeadingFrame(relativeNm, frame.upHeadingDeg);
    }

    // Returns ownship geodetic position and heading.
    getOwnshipState() {
      const lla = window.geofs?.aircraft?.instance?.llaLocation;
      if (!Array.isArray(lla) || !Number.isFinite(lla[0]) || !Number.isFinite(lla[1])) {
        return null;
      }

      const heading = Number(window.geofs?.animation?.values?.heading);
      return {
        lat: Number(lla[0]) || 0,
        lon: Number(lla[1]) || 0,
        alt: Number(lla[2]) || 0,
        heading: Number.isFinite(heading) ? heading : 0
      };
    }

    // Normalizes heading to [0..359].
    normalizeHeadingDeg(value) {
      const deg = Number(value);
      if (!Number.isFinite(deg)) return null;
      return ((Math.round(deg) % 360) + 360) % 360;
    }

    // Converts target lat/lon to north/east offsets (NM) from ownship.
    toRelativeNm(ownship, targetLat, targetLon) {
      if (!ownship || !Number.isFinite(targetLat) || !Number.isFinite(targetLon)) {
        return null;
      }

      const latAvgRad = ((ownship.lat + targetLat) * 0.5) * (Math.PI / 180);
      const northMeters = (targetLat - ownship.lat) * 110540;
      const eastMeters = (targetLon - ownship.lon) * 111320 * Math.cos(latAvgRad);

      return {
        northNm: northMeters / 1852,
        eastNm: eastMeters / 1852
      };
    }

    // Converts north/east offsets to heading-relative forward/right offsets (NM).
    toHeadingFrame(relativeNm, headingDeg) {
      if (!relativeNm) return null;
      const hdgRad = (Number(headingDeg) || 0) * (Math.PI / 180);
      const sinH = Math.sin(hdgRad);
      const cosH = Math.cos(hdgRad);

      return {
        forwardNm: relativeNm.northNm * cosH + relativeNm.eastNm * sinH,
        rightNm: -relativeNm.northNm * sinH + relativeNm.eastNm * cosH
      };
    }

    // Returns the contacts of the A/A combat simulation (bandits), if it is running.
    getCombatContacts() {
      try {
        const addon = typeof BasePlugin !== 'undefined' ? BasePlugin.getActiveAddon() : null;
        return addon?.combat?.aaCombat?.getNpcContacts?.() ?? [];
      } catch (error) {
        return [];
      }
    }

    // Returns visible multiplayer aircraft in heading-relative coordinates.
    getTrafficContacts(ownship) {
      if (!ownship) return [];
      const users = Object.values(window.multiplayer?.visibleUsers ?? {});
      const nowMs = Date.now();

      for (const user of users) {
        if (this.navModule && !this.navModule.isTrafficContactVisible(user?.callsign ?? user?.cs)) continue;

        const co = user?.lastUpdate?.co;
        if (!Array.isArray(co) || !Number.isFinite(co[0]) || !Number.isFinite(co[1])) continue;

        const uid = String(user?.id ?? user?.uid ?? '').trim();
        if (!uid) continue;

        this.trafficContactsByUid[uid] = {
          uid,
          aircraftName: String(user?.aircraftName ?? '').trim(),
          callsign: String(user?.callsign ?? user?.cs ?? '').trim(),
          lat: Number(co[0]) || 0,
          lon: Number(co[1]) || 0,
          alt: Number(co[2]) || 0,
          speedKts: Number.isFinite(Number(user?.lastUpdate?.st?.as)) ? Math.round(Number(user.lastUpdate.st.as)) : null,
          headingDeg: this.normalizeHeadingDeg(co[3]),
          trackDeg: this.normalizeHeadingDeg(co[3]),
          lastSeenMs: nowMs
        };
      }

      // Simulated A/A bandits are tracked like multiplayer aircraft so NAV/RDR can show and lock them.
      const npcContacts = this.getCombatContacts();
      const npcUids = new Set();
      for (const npc of npcContacts) {
        const uid = String(npc.id);
        npcUids.add(uid);
        if (this.navModule && !this.navModule.isTrafficContactVisible(npc.callsign)) continue;
        this.trafficContactsByUid[uid] = {
          uid,
          isNpc: true,
          aircraftName: 'BANDIT',
          callsign: String(npc.callsign ?? 'BANDIT'),
          lat: npc.lat,
          lon: npc.lon,
          alt: npc.alt,
          speedKts: Number.isFinite(npc.speedKts) ? npc.speedKts : null,
          headingDeg: this.normalizeHeadingDeg(npc.headingDeg),
          trackDeg: this.normalizeHeadingDeg(npc.headingDeg),
          lastSeenMs: nowMs
        };
      }
      for (const uid of Object.keys(this.trafficContactsByUid)) {
        if (this.trafficContactsByUid[uid]?.isNpc && !npcUids.has(uid)) delete this.trafficContactsByUid[uid];
      }

      const result = [];

      for (const uid of Object.keys(this.trafficContactsByUid)) {
        const cached = this.trafficContactsByUid[uid];
        if (!cached) continue;

        const ageMs = nowMs - Number(cached.lastSeenMs || 0);
        if (!Number.isFinite(ageMs) || ageMs > MapModule.TRAFFIC_STALE_TIMEOUT_MS) {
          delete this.trafficContactsByUid[uid];
          if (String(this.selectedTrafficUid ?? '') === String(uid)) {
            this.selectedTrafficUid = null;
            this.trafficSelectionCleared = true;
          }
          continue;
        }

        const relNm = this.toRelativeNm(ownship, Number(cached.lat), Number(cached.lon));
        const frameNm = this.toHeadingFrame(relNm, ownship.heading);
        if (!frameNm) continue;

        result.push({
          uid: cached.uid,
          aircraftName: cached.aircraftName,
          callsign: cached.callsign,
          lat: cached.lat,
          lon: cached.lon,
          alt: cached.alt,
          altFeet: Number.isFinite(Number(cached.alt)) ? Math.round(Number(cached.alt) * 3.28084) : null,
          speedKts: cached.speedKts,
          isNpc: !!cached.isNpc,
          headingDeg: cached.headingDeg,
          trackDeg: cached.trackDeg,
          ...frameNm
        });
      }

      result.sort((a, b) => {
        const ta = this.getTrafficSortToken(a);
        const tb = this.getTrafficSortToken(b);
        return ta.localeCompare(tb);
      });

      return result;
    }

    // Builds a deterministic traffic key.
    getTrafficKey(contact) {
      return String(contact?.uid || contact?.callsign || `${contact?.lat ?? ''}:${contact?.lon ?? ''}`);
    }

    // Returns a deterministic contact number for one aircraft.
    // Uses last 2 digits of the aircraft ID.
    getContactNumber(contact) {
      const aircraftId = String(contact?.id ?? contact?.uid ?? '').trim();
      if (!aircraftId) return 0;

      // Extract last 2 digits from aircraft id
      const numericPart = aircraftId.replace(/\D/g, ''); // Remove non-digits
      if (!numericPart) return 0;
      
      const lastTwo = numericPart.slice(-2);
      return Number(lastTwo) || 0;
    }

    // Token used to keep traffic ordering stable.
    getTrafficSortToken(contact) {
      const number = this.getContactNumber(contact);
      return `${String(number).padStart(3, '0')}:${this.getTrafficKey(contact)}`;
    }

    // Returns selected traffic uid (falls back to first visible contact).
    getSelectedTrafficUid(contacts = []) {
      const list = Array.isArray(contacts) ? contacts : [];
      if (!list.length) {
        this.selectedTrafficUid = null;
        return null;
      }

      const hasCurrent = this.selectedTrafficUid && list.some((c) => String(c?.uid) === String(this.selectedTrafficUid));
      if (hasCurrent) return this.selectedTrafficUid;

      if (this.trafficSelectionCleared) {
        return null;
      }

      this.selectedTrafficUid = list[0]?.uid ? String(list[0].uid) : null;
      return this.selectedTrafficUid;
    }

    // Returns mark state for a contact uid.
    getTrafficMark(uid) {
      const key = String(uid ?? '');
      if (!key) return '';
      return this.trafficMarksByUid[key] || '';
    }

    // Sets mark state for one contact uid.
    setTrafficMark(uid, markState) {
      const key = String(uid ?? '');
      if (!key) return '';
      const normalized = markState || '';
      if (!normalized) {
        delete this.trafficMarksByUid[key];
        return '';
      }
      this.trafficMarksByUid[key] = normalized;
      return normalized;
    }

    // Cycles mark state for currently selected traffic target.
    cycleSelectedTrafficMark() {
      const scene = this.getSceneData();
      const contacts = this.getTrafficInRange(this.getFilteredTraffic(scene?.traffic ?? []), scene?.rangeNm);
      const uid = this.getSelectedTrafficUid(contacts);
      if (!uid) return '';

      const current = this.getTrafficMark(uid);
      const states = MapModule.MARK_STATES;
      const idx = Math.max(0, states.indexOf(current));
      const next = states[(idx + 1) % states.length] ?? '';
      return this.setTrafficMark(uid, next);
    }

    // Returns selected traffic mark state.
    getSelectedTrafficMark() {
      const scene = this.getSceneData();
      const contacts = this.getTrafficInRange(this.getFilteredTraffic(scene?.traffic ?? []), scene?.rangeNm);
      const uid = this.getSelectedTrafficUid(contacts);
      if (!uid) return '';
      return this.getTrafficMark(uid);
    }

    // Gets color for one traffic contact based on mark state.
    getTrafficColor(contact) {
      const mark = this.getTrafficMark(contact?.uid);
      if (mark === 'FRIEND') return '#3da2ff';
      if (mark === 'CIVILIAN') return '#33ff66';
      if (mark === 'UNKNOWN') return '#ffff33';
      if (mark === 'FOO') return '#ff3333';
      return '#ffffff';
    }

    // Gets currently active traffic show filter.
    getShowFilter() {
      return this.showFilter || 'ALL';
    }

    // Sets traffic show filter.
    setShowFilter(value) {
      this.showFilter = value || 'ALL';
      return this.showFilter;
    }

    // Cycles traffic show filter.
    cycleShowFilter() {
      const states = MapModule.SHOW_STATES;
      const current = this.getShowFilter();
      const idx = Math.max(0, states.indexOf(current));
      const next = states[(idx + 1) % states.length] ?? 'ALL';
      return this.setShowFilter(next);
    }

    // Returns true when one traffic contact matches current show filter.
    // Optionally keeps currently selected traffic visible independent of filter.
    matchesShowFilter(contact, includeSelected = true) {
      const uid = String(contact?.uid ?? '');
      if (includeSelected && uid && uid === String(this.selectedTrafficUid ?? '')) {
        return true;
      }

      const filter = this.getShowFilter();
      if (filter === 'ALL') return true;
      if (filter === 'UNM') return this.getTrafficMark(uid) === '';
      return this.getTrafficMark(uid) === filter;
    }

    // Returns traffic contacts filtered by show mode.
    // By default the current selection remains visible while selected.
    getFilteredTraffic(contacts = [], includeSelected = true) {
      const list = Array.isArray(contacts) ? contacts : [];
      return list.filter((contact) => this.matchesShowFilter(contact, includeSelected));
    }

    // Returns only traffic contacts inside the active NAV range.
    getTrafficInRange(contacts = [], rangeNm = this.getRangeNm()) {
      const list = Array.isArray(contacts) ? contacts : [];
      const maxRange = Math.max(0.1, Number(rangeNm) || 0);
      return list.filter((contact) => {
        const forward = Number(contact?.forwardNm);
        const right = Number(contact?.rightNm);
        if (!Number.isFinite(forward) || !Number.isFinite(right)) return false;
        return Math.hypot(forward, right) <= maxRange;
      });
    }

    // Steps selected traffic target by direction (+1 next, -1 previous).
    stepSelectedTraffic(step = 1) {
      const direction = Number(step) >= 0 ? 1 : -1;
      const scene = this.getSceneData();
      const contacts = this.getTrafficInRange(this.getFilteredTraffic(scene?.traffic ?? []), scene?.rangeNm);
      if (!contacts.length) {
        this.selectedTrafficUid = null;
        this.trafficSelectionCleared = false;
        return null;
      }

      this.trafficSelectionCleared = false;

      const currentUid = this.getSelectedTrafficUid(contacts);
      const currentIndex = Math.max(0, contacts.findIndex((c) => String(c?.uid) === String(currentUid)));
      const nextIndex = (currentIndex + direction + contacts.length) % contacts.length;
      this.selectedTrafficUid = String(contacts[nextIndex]?.uid ?? '');
      return this.selectedTrafficUid || null;
    }

    // Clears selected traffic target.
    clearSelectedTraffic() {
      this.selectedTrafficUid = null;
      this.trafficSelectionCleared = true;
      return null;
    }

    // Returns flightplan waypoints in heading-relative coordinates.
    getFlightPlanWaypoints(ownship) {
      if (!ownship) return [];
      const waypoints = window.geofs?.flightPlan?.waypointArray;
      if (!Array.isArray(waypoints)) return [];

      const result = [];
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const lat = Number(wp?.lat ?? wp?.navaid?.lat);
        const lon = Number(wp?.lon ?? wp?.navaid?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const relNm = this.toRelativeNm(ownship, lat, lon);
        const frameNm = this.toHeadingFrame(relNm, ownship.heading);
        if (!frameNm) continue;

        const ident = String(wp?.navaid?.ident ?? wp?.navaid?.icao ?? wp?.ident ?? wp?.navaid?.name ?? `WP${i + 1}`).trim();
        result.push({
          index: i,
          ident,
          selected: Boolean(wp?.selected),
          type: String(wp?.navaid?.type ?? wp?.type ?? '').trim(),
          lat,
          lon,
          ...frameNm
        });
      }

      return result;
    }

    // Returns aggregated MAP/HSI scene data for rendering.
    // Traffic collection can be disabled to avoid multiplayer checks.
    getSceneData(options = {}) {
      const includeTraffic = options?.includeTraffic != null
        ? Boolean(options.includeTraffic)
        : this.isRadarEnabled();
      const ownship = this.getOwnshipState();
      if (!ownship) {
        return {
          ownship: null,
          rangeNm: this.getRangeNm(),
          traffic: [],
          waypoints: []
        };
      }

      return {
        ownship,
        rangeNm: this.getRangeNm(),
        traffic: includeTraffic ? this.getTrafficContacts(ownship) : [],
        waypoints: this.getFlightPlanWaypoints(ownship)
      };
    }
  }


