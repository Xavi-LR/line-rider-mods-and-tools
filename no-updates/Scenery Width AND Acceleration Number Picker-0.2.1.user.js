// ==UserScript==

// @name         Scenery Width AND Acceleration Number Picker
// @namespace    https://www.linerider.com/
// @author       i stole this mod from malizma and changed it a bit
// @description  selected multiplier is not a real thing currently, but this mod changes the sliders to be less weird and only show up when that line type is selected
// @version      0.2.1
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*

// @downloadURL  https://github.com/Malizma333/linerider-userscript-mods/raw/master/mods/line-rider-scenery-width-fix.user.js
// @updateURL    https://github.com/Malizma333/linerider-userscript-mods/raw/master/mods/line-rider-scenery-width-fix.user.js
// @homepageURL  https://github.com/Malizma333/linerider-userscript-mods
// @supportURL   https://github.com/Malizma333/linerider-userscript-mods/issues
// @grant        none

// ==/UserScript==

// jshint asi: true
// jshint esversion: 6

const getWindowFocused = state => state.views.Main;
const getPlayerRunning = state => state.player.running;
const getSceneryWidth = state => state.selectedSceneryWidth;
const getMultiplier = state => state.selectedMultiplier; // this does not actually exist but it probably will at some point
const getTrackLinesLocked = state => state.trackLinesLocked;
const getSelectedLineType = state => getTrackLinesLocked(state) ? 2 : state.selectedLineType;

function main() {
  const { React, ReactDOM, store } = window;
  const e = React.createElement;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.opacity = 0;
  container.style.pointerEvents = "none";
  container.style.transition = "opacity 225ms cubic-bezier(0.4, 0, 0.2, 1) 0ms";
  container.style.top = "25px";
  container.style.left = "59vw";
  document.getElementById("content").appendChild(container);

class ModComponent extends React.Component {
  constructor() {
    super();
    this.state = {
      lineType: getSelectedLineType(store.getState()),
      sceneryWidth: getSceneryWidth(store.getState()),
      widthWhole: 0,
      widthDecimal: 1.0,
      multiplier: getMultiplier(store.getState()),
      accelWhole: 0,
      accelDecimal: 1.0,
    };

    store.subscribe(() => {
      const state = store.getState();
      this.setState({
        lineType: getSelectedLineType(state),
        sceneryWidth: getSceneryWidth(state),
        multiplier: getMultiplier(state),
      });
    });
  }

  onChooseWidth = (val) => {
    if (val === 0) return;
    store.dispatch({ type: "SELECT_SCENERY_WIDTH", payload: val });
    this.setState({ sceneryWidth: val });
  }

  onChooseMultiplier = (val) => {
    if (val === 0) return;
    store.dispatch({ type: "SELECT_MULTIPLIER", payload: val });
    this.setState({ multiplier: val });
  }

  renderSceneryControls() {
    const { widthWhole, widthDecimal } = this.state;

    return e("div", null,
      "🟩 ",
      e("input", {
        style: { width: "4em" },
        type: "number",
        min: 0,
        max: 1000,
        step: 0.1,
        value: this.state.sceneryWidth,
        onChange: e => this.onChooseWidth(parseFloat(e.target.value))
      }),
      e("input", {
        style: { width: "6em" },
        type: "range",
        min: 0,
        max: 99,
        step: 1,
        value: widthWhole,
        onChange: e => {
          const whole = parseInt(e.target.value);
          this.setState({ widthWhole: whole });
          this.onChooseWidth(whole + widthDecimal);
        }
      }),
      e("input", {
        style: { width: "6em" },
        type: "range",
        min: 0.1,
        max: 1.0,
        step: 0.1,
        value: widthDecimal,
        onChange: e => {
          const decimal = parseFloat(e.target.value);
          this.setState({ widthDecimal: decimal });
          this.onChooseWidth(widthWhole + decimal);
        }
      })
    );
  }

  renderAccelerationControls() {
    const { accelWhole, accelDecimal } = this.state;

    return e("div", null,
      "🟥 ",
      e("input", {
        style: { width: "4em" },
        type: "number",
        min: 0,
        max: 1000,
        step: 0.1,
        value: this.state.multiplier,
        onChange: e => this.onChooseMultiplier(parseFloat(e.target.value))
      }),
      e("input", {
        style: { width: "6em" },
        type: "range",
        min: 0,
        max: 99,
        step: 1,
        value: accelWhole,
        onChange: e => {
          const whole = parseInt(e.target.value);
          this.setState({ accelWhole: whole });
          this.onChooseMultiplier(whole + accelDecimal);
        }
      }),
      e("input", {
        style: { width: "6em" },
        type: "range",
        min: 0.1,
        max: 1.0,
        step: 0.1,
        value: accelDecimal,
        onChange: e => {
          const decimal = parseFloat(e.target.value);
          this.setState({ accelDecimal: decimal });
          this.onChooseMultiplier(accelWhole + decimal);
        }
      })
    );
  }

  render() {
    const { lineType } = this.state;

    return e("div", null,
      lineType === 2 && this.renderSceneryControls(),
      lineType === 1 && this.renderAccelerationControls()
    );
  }
}


  ReactDOM.render(e(ModComponent), container);

  store.subscribe(() => {
    const state = store.getState();
    const active = !getPlayerRunning(state) && getWindowFocused(state);
    container.style.opacity = active ? 1 : 0;
    container.style.pointerEvents = active ? null : "none";
  });
}

if (window.registerCustomSetting) {
  main();
} else {
  const prevCb = window.onCustomToolsApiReady;
  window.onCustomToolsApiReady = () => {
    if (prevCb) prevCb();
    main();
  };
}
