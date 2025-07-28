// ==UserScript==
// @name         Mod Renamer but like manual and no cool ui
// @namespace    https://www.linerider.com/
// @author       Xavi
// @version      0.1.0
// @description  Rename mods
// @icon         https://www.linerider.com/favicon.ico
// @match        https://www.linerider.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const customNames = {

// "Actual Mod name": "BETTER Mod name",

    "🪣 Fill Tool": "Fill Tool 🪣",
    "Bezier Tool": "Bezier Tool 🖋️",
    "Chain Select Mod": "Chain Select ⛓️",
    "Metadata Mod": "Metadata 🟥",
    "More Controls Mod": "More Controls 🎛️",
    "Slice Mod": "Slice ✂️",
    "SVG Export Mod": "SVG Export 🖼️⏏️",
    "SVG Mod": "SVG 🖼️⬇️",
    "TenPC Mod": "10PC 🗣️",
    "Transform Mod": "Trans 🏳️‍⚧️🔄",
    "Zig Zag Mod": "Zig Zag ♒",
  };

  function renameButtons() {
    const buttons = document.querySelectorAll('button');

    buttons.forEach(button => {
      const originalName = button.textContent.trim();
      if (customNames[originalName]) {
        button.textContent = customNames[originalName];
      }
    });
  }

  let attempts = 0;
  const interval = setInterval(() => {
    renameButtons();
    attempts++;
    if (attempts > 20) clearInterval(interval);
  }, 500);
})();
