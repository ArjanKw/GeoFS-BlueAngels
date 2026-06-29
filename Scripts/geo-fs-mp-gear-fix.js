// ==UserScript==
// @name         GeoFS Multiplayer Gear Fix
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      1.0.0
// @description  Fix that prevents the gear of other players appear to be out when you get into range.
// @match        https://www.geo-fs.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let originalUpdate;
    const fixed = new Set();

    function patchMultiplayer() {

        if (!multiplayer || !multiplayer.update || multiplayer.update.__patched) return;

        originalUpdate = multiplayer.update;

        multiplayer.update = function () {

            // Run GeoFS update function before running ours.
            originalUpdate.apply(this, arguments);

            // Now run our fix.
            const users = multiplayer.visibleUsers;

            if (!users) return;

            Object.values(users).forEach(user => {
                if (fixed.has(user.id)) return;

                const st = user.lastUpdate?.st;
                if (!st || st.gr === undefined) return;

                // Force mismatch only if needed.
                if (user.visibleGear === st.gr) {

                    user.visibleGear = st.gr == 0 ? 1 : 0;

                    console.log("🔧 Gear reset for", {
                        callsign: user.callsign,
                        gear: st.gr == 0 ? "up" : "down",
                        forced: user.visibleGear
                    });

                    fixed.add(user.id);
                }
            });

            cleanup(users);
        };

        multiplayer.update.__patched = true;

        console.log("✅ GeoFS Multiplayer Gear Fix enabled");
    }

    function cleanup(users) {
        const visibleIds = new Set(Object.keys(users));

        fixed.forEach(id => {
            if (!visibleIds.has(String(id))) {
                console.log("🧹 Removing from fixed (out of range):", id);
                fixed.delete(id);
            }
        });
    }


    function wait() {
        if (window.multiplayer?.update) {
            patchMultiplayer();
        } else {
            setTimeout(wait, 500);
        }
    }

    wait();
})();
