// ==UserScript==
// @name         GeoFS Engine Power
// @namespace    http://tampermonkey.net/
// @version      2025-10-05
// @description  Give your engines a boost. Press Y to change. Use the Flight Info Display script to see the mode you're in.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let changeModeKey = "y"; // The key to press to see/hide the info.
    let engineMode = parseInt(localStorage.getItem("engineMode") ?? 0, 10);
    let engineModes =
        [
            { "name": "Normal", "maxRpm": 10000 },
            { "name": "Boost", "maxRpm": 15000 },
            { "name": "Overdrive", "maxRpm": 25000 },
            { "name": "Warp", "maxRpm": 50000 },
        ];

    function changeEngineMode(mode) {
        engineMode = mode;
        localStorage.setItem("engineMode", engineMode);
        localStorage.setItem("engineModeName", engineModes[mode].name);

        geofs.aircraft.instance.definition.maxRPM = engineModes[mode].maxRpm;
    }

    window.addEventListener("keyup", function (e) {
        if (e.key == changeModeKey) {
            engineMode++;
            engineMode = engineMode % engineModes.length;

            changeEngineMode(engineMode);
        }
    });

    changeEngineMode(engineMode);
})();