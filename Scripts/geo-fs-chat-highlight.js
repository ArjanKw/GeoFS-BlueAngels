// ==UserScript==
// @name         GeoFS Chat Optimizer
// @namespace    http://tampermonkey.net/
// @version      2026-05-13
// @description  Optimize chat visibility
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Add custom styles.
    document.head.insertAdjacentHTML(
        "beforeend",
        `<style>.geofs-chat-messages { background: rgba(255, 255, 255, 0.5); color: #000; width: 355px; padding-right: 5px; }
.geofs-canvas-mouse-overlay { opacity: 1 !important; }
.geofs-chat-message { color: #000; margin: 1px; text-shadow: none !important; opacity: 1 !important; padding-bottom: 5px; }</style>
        `
    );


    function main() {
        document.getElementsByClassName('geofs-user-dialog')[0].insertAdjacentHTML(
            "beforeend",
            `<button class="geofs-chat-highlight mdl-button mdl-button--raised">
              <span class="material-icons" id="0.27841813763741396" tabindex="0">
                <span class="material-symbols-outlined">add_circle</span>
              </span>
              <div class="mdl-tooltip" for="0.27841813763741396" data-upgraded=",MaterialTooltip">Add chat highlight</div>
               Add chat highlight
             </button>`);
    }

    function waitForEntities() {
        try {
            if (geofs.api) {
                main();
                return;
            }
        } catch (error) {
            // Handle any errors (e.g., log them)
            console.log('Error in waitForEntities:', error);
        }
        // Retry after 1000 milliseconds
        setTimeout(waitForEntities, 1000);
    }

    window.onload = setTimeout(waitForEntities, 5000);
})();