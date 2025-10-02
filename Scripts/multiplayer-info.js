// ==UserScript==
// @name         Multiplayer label info
// @namespace    http://tampermonkey.net/
// @version      2025-09-30
// @description  Shows the distance of the other player in the label.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let multiplayerDistanceUpdateFrequency = 500; // The X amount of ms in between updates.
    let showAircraftType = true; // Whether to cycle between the callsign and the aircraft type.
    let showAircraftTypeEvery = 10; // Every X times that the distance is updated, show the aircraft type.
    let displayAircraftTypeDuration = 2; // The number of updates that the aircraft type is shown.
    let minimumNmDistance = 0.5; // Below this distance in nm, the distance is displayed in feet.
    let displayLabel = true; // Whether to display the label.
    let toggleDisplayKey = "l"; // The key to press to see/hide labels.
    let counter = 0;
    let feetInNm = 6076.11549;

    function updateMultiplayer() {
        counter++;

        Object.values(multiplayer.visibleUsers).forEach(function (e) {
            if (e.label && e.callsign) {
                if (!displayLabel) {
                    e.label.text = "";
                    return;
                }
                let distance = e.distance;
                let speed = e.lastUpdate?.st?.as;
                let unit = "feet";
                let speedLabel = "";

                if ((distance / feetInNm) > minimumNmDistance) {
                    // Convert to nm and round with two decimals.
                    distance = (Math.round(distance / feetInNm * 100) / 100);
                    unit = "nm";
                } else {
                    // Round in whole feet.
                    distance = Math.round(distance);
                }

                if (speed) {
                    speedLabel = Math.round(speed) + " knots, ";
                }

                if (showAircraftType && (counter % showAircraftTypeEvery <= displayAircraftTypeDuration)) {
                    e.label.text = e.aircraftName + " (" + speedLabel + distance + " " + unit + ")";
                } else {
                    e.label.text = e.callsign + " (" + speedLabel + distance + " " + unit + ")";
                }
            }
        });
    }

    window.addEventListener("keyup", function (e) {
        if (e.key == toggleDisplayKey) {
            displayLabel = !displayLabel;
        }
    });

    setInterval(function () {
        updateMultiplayer();
    }, multiplayerDistanceUpdateFrequency);
})();