// ==UserScript==
// @name         Swatch Number Picker
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  width picker and a multiplier picker that works with my smooth pencil mod
// @version      0.2.12
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/swatch-number-picker.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/swatch-number-picker.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

/* jshint asi: true */
/* jshint esversion: 6 */

const getWindowFocused = s => s.views.Main
const getPlayerRunning = s => s.player.running
const getSceneryWidth = s => s.selectedSceneryWidth
const getMultiplier = s => s.selectedMultiplier
const getTrackLinesLocked = s => s.trackLinesLocked
const getSelectedLineType = s => getTrackLinesLocked(s) ? 2 : s.selectedLineType

function main() {
  const { React, ReactDOM, store } = window
  const e = React.createElement

  const container = document.createElement("div")
  Object.assign(container.style, {
    position: "fixed",
    opacity: 0,
    pointerEvents: "none",
    transition: "opacity 225ms cubic-bezier(0.4,0,0.2,1) 0ms",
    top: "25px",
    left: "59vw"
  })
  ;(document.getElementById("content") || document.body).appendChild(container)

  const initState = store.getState()
  window.selectedSceneryWidth = getSceneryWidth(initState) || 1
  window.selectedMultiplier = getMultiplier(initState) || 1
  window.dispatchEvent(new CustomEvent("selected-scenery-width-changed", { detail: window.selectedSceneryWidth }))
  window.dispatchEvent(new CustomEvent("selected-multiplier-changed", { detail: window.selectedMultiplier }))
  window.addEventListener("request-selected-multiplier", () =>
    window.dispatchEvent(new CustomEvent("selected-multiplier-changed", { detail: window.selectedMultiplier }))
  )
  window.addEventListener("request-selected-scenery-width", () =>
    window.dispatchEvent(new CustomEvent("selected-scenery-width-changed", { detail: window.selectedSceneryWidth }))
  )

  function clampTotal(t) {
    if (typeof t !== "number" || Number.isNaN(t)) return 0.1
    if (t < 0.1) return 0.1
    if (t > 100.0) return 100.0
    return Math.round(t * 10) / 10
  }

  function splitWholeDecimal(total) {
    total = clampTotal(total)
    const rounded = Math.round(total * 10) / 10
    const intPart = Math.round(rounded)
    if (Math.abs(rounded - intPart) < 1e-9) {
      const whole = Math.max(0, intPart - 1)
      return { whole, decimal: 1.0 }
    } else {
      const whole = Math.floor(rounded)
      let decimal = Math.round((rounded - whole) * 10) / 10
      if (decimal <= 0) decimal = 0.1
      return { whole, decimal }
    }
  }

  class ModComponent extends React.Component {
    constructor() {
      super()
      const s = store.getState()
      const initW = getSceneryWidth(s)
      const initM = getMultiplier(s)
      const sw = splitWholeDecimal(initW)
      const sm = splitWholeDecimal(initM)
      this.state = {
        lineType: getSelectedLineType(s),
        sceneryWidth: initW,
        widthWhole: sw.whole,
        widthDecimal: sw.decimal,
        multiplier: initM,
        accelWhole: sm.whole,
        accelDecimal: sm.decimal
      }
      store.subscribe(() => {
        const s = store.getState()
        const newW = getSceneryWidth(s)
        const newM = getMultiplier(s)
        if (typeof newW === "number") window.selectedSceneryWidth = newW
        if (typeof newM === "number") window.selectedMultiplier = newM
        this.setState({
          lineType: getSelectedLineType(s),
          sceneryWidth: newW,
          multiplier: newM
        })
      })
      this._onKeyDown = this._onKeyDown.bind(this)
      document.addEventListener("keydown", this._onKeyDown, true)
    }

    componentWillUnmount() {
      document.removeEventListener("keydown", this._onKeyDown, true)
    }

    _setSceneryWidth(val) {
      val = clampTotal(val)
      store.dispatch({ type: "SELECT_SCENERY_WIDTH", payload: val })
      window.selectedSceneryWidth = val
      window.dispatchEvent(new CustomEvent("selected-scenery-width-changed", { detail: val }))
      const sd = splitWholeDecimal(val)
      this.setState({ sceneryWidth: val, widthWhole: sd.whole, widthDecimal: sd.decimal })
    }

    _setMultiplier(val) {
      val = clampTotal(val)
      store.dispatch({ type: "SELECT_MULTIPLIER", payload: val })
      window.selectedMultiplier = val
      window.dispatchEvent(new CustomEvent("selected-multiplier-changed", { detail: val }))
      const sd = splitWholeDecimal(val)
      this.setState({ multiplier: val, accelWhole: sd.whole, accelDecimal: sd.decimal })
    }

    onChooseWidth = val => this._setSceneryWidth(val)
    onChooseMultiplier = val => this._setMultiplier(val)

    _onKeyDown(ev) {
      if (ev.key !== "=" && ev.key !== "-") return
      if (!(!getPlayerRunning(store.getState()) && getWindowFocused(store.getState()))) return
      const el = document.activeElement
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
      ev.preventDefault()
      const delta = ev.key === "=" ? 1 : -1
      const lt = getSelectedLineType(store.getState())
      if (lt === 2) this._stepWholeForScenery(delta)
      else if (lt === 1) this._stepWholeForMultiplier(delta)
    }

    _stepWholeForScenery(deltaWhole) {
      const current = typeof this.state.sceneryWidth === "number" ? this.state.sceneryWidth : window.selectedSceneryWidth
      let newTotal = clampTotal(current + deltaWhole)
      // if stepping would drop below 1.0, keep it at 1.0 (allow <1 only via decimal slider)
      if (newTotal < 1.0) newTotal = 1.0
      const sd = splitWholeDecimal(newTotal)
      this._setSceneryWidth(newTotal)
      this.setState({ widthWhole: sd.whole, widthDecimal: sd.decimal })
    }

    _stepWholeForMultiplier(deltaWhole) {
      const current = typeof this.state.multiplier === "number" ? this.state.multiplier : window.selectedMultiplier
      let newTotal = clampTotal(current + deltaWhole)
      // if stepping would drop below 1.0, keep it at 1.0 (allow <1 only via decimal slider)
      if (newTotal < 1.0) newTotal = 1.0
      const sd = splitWholeDecimal(newTotal)
      this._setMultiplier(newTotal)
      this.setState({ accelWhole: sd.whole, accelDecimal: sd.decimal })
    }

    renderSceneryControls() {
      const { widthWhole, widthDecimal, sceneryWidth } = this.state
      const showVal = typeof sceneryWidth === "number" ? sceneryWidth : window.selectedSceneryWidth
      return e("div", null,
        "🟩 ",
        e("input", { style: { width: "4em" }, type: "number", min: 0.1, max: 100, step: 0.1, value: showVal,
          onChange: ev => this.onChooseWidth(parseFloat(ev.target.value) || 0.1) }),
        e("input", { style: { width: "6em" }, type: "range", min: 0, max: 99, step: 1, value: widthWhole,
          onChange: ev => { const whole = parseInt(ev.target.value) || 0; this.setState({ widthWhole: whole }); this.onChooseWidth(whole + widthDecimal) } }),
        e("input", { style: { width: "6em" }, type: "range", min: 0.1, max: 1.0, step: 0.1, value: widthDecimal,
          onChange: ev => { const dec = parseFloat(ev.target.value) || 0.1; this.setState({ widthDecimal: dec }); this.onChooseWidth(widthWhole + dec) } })
      )
    }

    renderAccelerationControls() {
      const { accelWhole, accelDecimal, multiplier } = this.state
      const showVal = typeof multiplier === "number" ? multiplier : window.selectedMultiplier
      return e("div", null,
        "🟥 ",
        e("input", { style: { width: "4em" }, type: "number", min: 0.1, max: 100, step: 0.1, value: showVal,
          onChange: ev => this.onChooseMultiplier(parseFloat(ev.target.value) || 0.1) }),
        e("input", { style: { width: "6em" }, type: "range", min: 0, max: 99, step: 1, value: accelWhole,
          onChange: ev => { const whole = parseInt(ev.target.value) || 0; this.setState({ accelWhole: whole }); this.onChooseMultiplier(whole + accelDecimal) } }),
        e("input", { style: { width: "6em" }, type: "range", min: 0.1, max: 1.0, step: 0.1, value: accelDecimal,
          onChange: ev => { const dec = parseFloat(ev.target.value) || 0.1; this.setState({ accelDecimal: dec }); this.onChooseMultiplier(accelWhole + dec) } })
      )
    }

    render() {
      const { lineType } = this.state
      return e("div", null,
        lineType === 2 && this.renderSceneryControls(),
        lineType === 1 && this.renderAccelerationControls()
      )
    }
  }

  ReactDOM.render(e(ModComponent), container)

  store.subscribe(() => {
    const s = store.getState()
    const active = !getPlayerRunning(s) && getWindowFocused(s)
    container.style.opacity = active ? 1 : 0
    container.style.pointerEvents = active ? null : "none"
  })
}

if (window.registerCustomSetting) main()
else {
  const prev = window.onCustomToolsApiReady
  window.onCustomToolsApiReady = () => { if (prev) prev(); main() }
}
