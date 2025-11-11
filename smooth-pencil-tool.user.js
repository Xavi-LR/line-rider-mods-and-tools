// ==UserScript==
// @name         Smooth Pencil Tool
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  pencil tool with smoothing options
// @version      0.1.12
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/smooth-pencil-tool.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/smooth-pencil-tool.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

/* jshint asi: true */
/* jshint esversion: 6 */

const TOOL_ID = "Smooth Pencil"
const TOOL_LAYER = 0

const setToolState = (toolId, state) => ({ type: "SET_TOOL_STATE", payload: state, meta: { id: toolId } })
const revertTrackChanges = () => ({ type: "REVERT_TRACK_CHANGES", meta: { ignorable: true } })
const updateLines = (name, linesToRemove, linesToAdd, initialLoad = false) => ({ type: "UPDATE_LINES", payload: { linesToRemove, linesToAdd, initialLoad }, meta: { name } })
const addLines = lines => updateLines("ADD_LINES", null, lines)
const commitTrackChanges = () => ({ type: "COMMIT_TRACK_CHANGES" })

const getSelectedLineType = state => (state.trackLinesLocked ? 2 : state.selectedLineType)
const getSimulatorTrack = state => state.simulator.engine
const getSimulatorCommittedTrack = state => state.simulator.committedEngine
const getPlayerRunning = state => state.player.running

function parseFloatOrDefault(s, d = 0) { const x = parseFloat(s); return isNaN(x) ? d : x }
function genLineObj(x1, y1, x2, y2, width, multiplier, type, flipped = false) { return { flipped, x1, y1, x2, y2, width, multiplier, type } }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }

function main() {
  const { DefaultTool, React, store, Millions, V2 } = window

  const SceneLayer = window.Tools.SELECT_TOOL.getSceneLayer({
    ...store.getState(),
    toolState: { SELECT_TOOL: { status: {}, selectedPoints: [] } },
  }).constructor

  const DEFAULTS = {
    time: 0.01,
    distance: 0.02,
    length: 0.2,
    width: 1,
    multiplier: 1,
  }

  const SLIDERS = [
    { key: "time", label: "Time (s)", min: 0, max: 1, step: 0.01 },
    { key: "distance", label: "Distance", min: 0, max: 50, step: 0.01 },
    { key: "length", label: "Length", min: 0, max: 1, step: 0.01 },
  ]

  window.smoothPencilTime = window.smoothPencilTime ?? DEFAULTS.time
  window.smoothPencilDistance = window.smoothPencilDistance ?? DEFAULTS.distance
  window.smoothPencilLength = window.smoothPencilLength ?? DEFAULTS.length
  window.smoothPencilWidth = window.smoothPencilWidth ?? DEFAULTS.width
  window.smoothPencilMultiplier = window.smoothPencilMultiplier ?? DEFAULTS.multiplier

  class SmoothPencilTool extends DefaultTool {
    constructor(store) {
      super(store)
      this._drawing = false
      this._lastPoint = null
      this._currentPos = null
      this._tickHandle = null
      this._detached = false
      this._onDocPointerDown = null

      this._flipThisStroke = false
      this._shiftDown = false

      this._onShiftDown = e => { if (e.key === "Shift") this._shiftDown = true }
      this._onShiftUp = e => { if (e.key === "Shift") this._shiftDown = false }

      document.addEventListener("keydown", this._onShiftDown, true)
      document.addEventListener("keyup", this._onShiftUp, true)

      this._externalMultiplier = (typeof window.selectedMultiplier === "number") ? window.selectedMultiplier : undefined
      this._externalWidth = (typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : undefined

      this._onExternalMultiplierChanged = e => { this._externalMultiplier = (typeof e.detail === "number") ? e.detail : undefined }
      this._onExternalWidthChanged = e => { this._externalWidth = (typeof e.detail === "number") ? e.detail : undefined }

      try {
        window.addEventListener("selected-multiplier-changed", this._onExternalMultiplierChanged)
        window.addEventListener("selected-scenery-width-changed", this._onExternalWidthChanged)
      } catch (e) {}

      try { this.dispatch(setToolState(TOOL_ID, { state: {} })) } catch (e) {}
    }

    static get usesSwatches() { return true }
    static getCursor(state) { return getPlayerRunning(state) ? "inherit" : "crosshair" }
    static getSceneLayer(state) { try { return new SceneLayer(TOOL_LAYER) } catch (e) { try { return new (window.SceneLayer || SceneLayer)(TOOL_LAYER) } catch (e2) { return null } } }
    toTrackPos(p) { return super.toTrackPos(p) }

    _clearPreviewScene() {
      try {
        store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities([]) } })
      } catch (err) {}
    }

    _renderPreview() {
      try {
        if (!this._lastPoint || !this._currentPos) { this._clearPreviewScene(); return }
        const scene = []
        const color = new Millions.Color(255, 127, 255, 255)
        const thickness = 0.2
        scene.push(new Millions.Line(
          { x: this._lastPoint.x, y: this._lastPoint.y, colorA: color, colorB: color, thickness },
          { x: this._currentPos.x, y: this._currentPos.y, colorA: color, colorB: color, thickness },
          1, 9999
        ))
        store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities(scene) } })
      } catch (err) { this._clearPreviewScene() }
    }

    detach() {
      this._detached = true
      try { if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null } } catch (e) {}
      try { this.dispatch(revertTrackChanges()) } catch (e) {}
      try { if (this._onDocPointerDown) { document.removeEventListener("pointerdown", this._onDocPointerDown, true); this._onDocPointerDown = null } } catch (e) {}
      try {
        window.removeEventListener("selected-multiplier-changed", this._onExternalMultiplierChanged)
        window.removeEventListener("selected-scenery-width-changed", this._onExternalWidthChanged)
      } catch (e) {}
      document.removeEventListener("keydown", this._onShiftDown, true)
      document.removeEventListener("keyup", this._onShiftUp, true)
      this._drawing = false
      this._lastPoint = null
      this._currentPos = null
      this._clearPreviewScene()
      this._flipThisStroke = false
      this._shiftDown = false
    }

    _safeCommitIfNeeded() {
      try {
        const state = this.getState()
        if (getSimulatorTrack(state) !== getSimulatorCommittedTrack(state)) this.dispatch(commitTrackChanges())
      } catch (e) {}
    }

    onPointerDown(e) {
      try {
        window.dispatchEvent(new CustomEvent("request-selected-multiplier"))
        window.dispatchEvent(new CustomEvent("request-selected-scenery-width"))
      } catch (err) {}

      if (this._detached) return
      if (!e || typeof e.button === "undefined") return
      if (e.button !== 0) return

      this._flipThisStroke = this._shiftDown

      this._drawing = true

      try {
        const start = this.toTrackPos(e.pos)
        this._lastPoint = new V2(start)
        this._currentPos = new V2(start)
      } catch (err) { this._drawing = false; this._flipThisStroke = false; return }

      this._maybeAddSegment()
      this._renderPreview()

      try {
        if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
        const timeS = Math.max(0.0, parseFloat(window.smoothPencilTime ?? DEFAULTS.time))
        const intervalMs = Math.max(8, Math.floor((timeS <= 0 ? 0.008 : timeS) * 1000))
        this._tickHandle = setInterval(() => {
          if (this._detached) { if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null } return }
          this._maybeAddSegment(); this._renderPreview()
        }, intervalMs)
      } catch (err) {}
    }

    onPointerDrag(e) {
      if (this._detached) return
      if (!this._drawing) return
      if (!e || typeof e.pos === "undefined") return
      try { const p = this.toTrackPos(e.pos); this._currentPos = new V2(p) } catch (err) {}
      this._renderPreview()
    }

    onPointerUp(e) {
      if (this._detached) return
      if (!e || typeof e.button === "undefined") {
        this._drawing = false
        if (this._tickHandle) { try { clearInterval(this._tickHandle) } catch (e2) {} this._tickHandle = null }
        this._safeCommitIfNeeded()
        this._lastPoint = null
        this._currentPos = null
        this._clearPreviewScene()
        this._flipThisStroke = false
        return
      }
      if (e.button !== 0) return
      this._drawing = false
      if (this._tickHandle) { try { clearInterval(this._tickHandle) } catch (err) {} this._tickHandle = null }
      this._safeCommitIfNeeded()
      this._lastPoint = null
      this._currentPos = null
      this._clearPreviewScene()
      this._flipThisStroke = false
    }

    _maybeAddSegment() {
      if (this._detached) return
      if (!this._drawing || !this._currentPos || !this._lastPoint) return

      const dx = this._currentPos.x - this._lastPoint.x
      const dy = this._currentPos.y - this._lastPoint.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = parseFloat(window.smoothPencilDistance ?? DEFAULTS.distance)
      if (!(dist > minDist)) return

      const lenFrac = Math.max(0, Math.min(1, parseFloat(window.smoothPencilLength ?? DEFAULTS.length)))
      const nx = this._lastPoint.x + dx * lenFrac
      const ny = this._lastPoint.y + dy * lenFrac
      if (![nx, ny, this._lastPoint.x, this._lastPoint.y].every(Number.isFinite)) { this._drawing = false; this._flipThisStroke = false; return }

      const type = getSelectedLineType(this.getState())
      const s = store.getState()
      const widthFromStore = (typeof s.selectedSceneryWidth === "number") ? s.selectedSceneryWidth : undefined
      const multFromStore = (typeof s.selectedMultiplier === "number") ? s.selectedMultiplier : undefined

      const widthVal = (widthFromStore !== undefined) ? widthFromStore : ((typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : parseFloat(window.smoothPencilWidth ?? DEFAULTS.width))
      const multVal = (multFromStore !== undefined) ? multFromStore : ( (typeof this._externalMultiplier === "number") ? this._externalMultiplier : (typeof window.smoothPencilMultiplier === "number" ? window.smoothPencilMultiplier : DEFAULTS.multiplier) )

      const lineObj = genLineObj(this._lastPoint.x, this._lastPoint.y, nx, ny, widthVal, multVal, type, !!this._flipThisStroke)

      try { this.dispatch(addLines([lineObj])) } catch (err) {
        this._drawing = false
        this._flipThisStroke = false
        if (this._tickHandle) { try { clearInterval(this._tickHandle) } catch (e) {} this._tickHandle = null }
        return
      }
      try { this._lastPoint = new V2({ x: nx, y: ny }) } catch (err) {
        this._drawing = false
        this._flipThisStroke = false
        if (this._tickHandle) { try { clearInterval(this._tickHandle) } catch (e) {} this._tickHandle = null }
      }
    }
  }

  class SmoothPencilComponent extends React.Component {
    constructor(props) {
      super(props)

      this.defaults = {
        time: DEFAULTS.time,
        distance: DEFAULTS.distance,
        length: DEFAULTS.length,
        width: DEFAULTS.width,
        multiplier: DEFAULTS.multiplier
      }

      const initial = {}
      for (const k of Object.keys(this.defaults)) initial[k] = window[`smoothPencil${capitalize(k)}`] ?? this.defaults[k]
      this.state = initial
      this._onKeyDown = () => {}
      this._mounted = false
    }

    componentDidMount() { this._mounted = true; document.addEventListener("keydown", this._onKeyDown) }
    componentWillUnmount() { this._mounted = false; try { document.removeEventListener("keydown", this._onKeyDown) } catch (e) {} }

    onResetAll() {
      for (const k of Object.keys(this.defaults)) {
        const val = this.defaults[k]
        this.setState({ [k]: val })
        window[`smoothPencil${capitalize(k)}`] = val
      }
    }

    onReset(key) {
      const val = this.defaults[key]
      if (typeof val === "undefined") return
      this.setState({ [key]: val })
      window[`smoothPencil${capitalize(key)}`] = val
    }

    renderSlider(key, props, title) {
      const e = React.createElement
      const value = this.state[key]
      const setter = ev => {
        const v = parseFloatOrDefault(ev.target.value, this.defaults[key])
        if (v < props.min || v > props.max) return
        this.setState({ [key]: v })
        window[`smoothPencil${capitalize(key)}`] = v
      }
      return e("div", { key }, [
        e("label", { htmlFor: key }, title || key),
        e("input", { style: { width: "4em" }, type: "number", id: key, min: props.min, max: props.max, step: props.step, value, onChange: setter }),
        e("input", { style: { width: "8em" }, type: "range", min: props.min, max: props.max, step: props.step, value, onChange: setter, onFocus: ev => ev.target.blur() }),
        e("button", { style: { marginRight: ".4em" }, onClick: () => this.onReset(key) }, "⟳")
      ])
    }

    render() {
      const e = React.createElement
      return e("div", null, [
        "Smooth Pencil",
        ...SLIDERS.map(s => this.renderSlider(s.key, { min: s.min, max: s.max, step: s.step }, s.label)),
        e("div", { key: "global" }, e("button", { onClick: () => this.onResetAll() }, "Reset All"))
      ])
    }
  }

  window.registerCustomTool(TOOL_ID, SmoothPencilTool, SmoothPencilComponent)
}

if (window.registerCustomTool) main(); else {
  const prevCb = window.onCustomToolsApiReady
  window.onCustomToolsApiReady = () => { if (prevCb) prevCb(); main() }
}
