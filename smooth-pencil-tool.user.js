// ==UserScript==
// @name         Custom Smooth Pencil Tool
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  Smooth Pencil but better
// @version      0.2.2
// @icon         https://www.linerider.com/favicon.ico
// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*
// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/smooth-pencil-tool.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/smooth-pencil-tool.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

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
const getEditorZoom = state => (state && state.camera && typeof state.camera.editorZoom === 'number') ? state.camera.editorZoom : 1

function parseFloatOrDefault(s, d = 0) { const x = parseFloat(s); return isNaN(x) ? d : x }

function main() {
  const { DefaultTool, React, store, Millions, V2 } = window

  const SceneLayer = window.Tools && window.Tools.SELECT_TOOL
    ? window.Tools.SELECT_TOOL.getSceneLayer({
        ...store.getState(),
        toolState: { SELECT_TOOL: { status: {}, selectedPoints: [] } },
      }).constructor
    : (window.SceneLayer || function () { return null })

  const DEFAULTS = {
    time: 0,
    length: 0.02,
    stabilizer: 0.8,
    width: 1,
    multiplier: 1,
    snapEnabled: true,
    snapRadius: 0.6,
    random: 0,
    xy: false,
    crayon: false,
    advancedOpen: false,
    dots: 12,
    lineWidth: 1.0,
    dotThickness: 0.18,
    thicknessVar: 0.05,
    multicolored: false,
    randomColor: false,
    boomerang: true,
    overrideWidth: 1,
    overrideMultiplier: 1,
    penPressure: false,
    penIntensity: 1.0
  }

  const SLIDERS = [
    { key: "time", label: "Time (s)", min: 0, max: 1, step: 0.01 },
    { key: "length", label: "Minimum Length", min: 0, max: 50, step: 0.01 },
    { key: "stabilizer", label: "Stabilizer", min: 0, max: 1, step: 0.01 }
  ]

  window.smoothPState = window.smoothPState || {}
  function getSetting(key) {
    if (window.smoothPState && typeof window.smoothPState[key] !== 'undefined') return window.smoothPState[key]
    return DEFAULTS[key]
  }

  function getSimulatorLayers() {
    const stateBefore = store.getState();
    return stateBefore.simulator.engine.engine.state.layers.toArray();
  }

  function getActiveLayer() {
    const layers = getSimulatorLayers();
    const stateBefore = store.getState();
    const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
    const activeIndex = layers.findIndex(l => l.id === activeLayerId);
    return { layers, activeLayerId, activeIndex, activeLayer: layers[activeIndex] };
  }

  function getFolderLayerIds() {
    const { layers, activeLayer } = getActiveLayer();
    if (!activeLayer) return [];
    const folderId = activeLayer.folderId ?? activeLayer.id;
    return layers.filter(l => l.folderId === folderId).map(l => l.id);
  }

  function dispatchSetLinesNoCommit(lines) {
    store.dispatch({
      type: 'UPDATE_LINES',
      payload: { linesToRemove: null, linesToAdd: lines, initialLoad: false },
      meta: { name: 'SET_LINES' }
    });
  }

  function findClosestEndpoint(pos, radius, ignoreLineIds = null) {
    const state = store.getState()
    const committed = getSimulatorCommittedTrack(state)
    if (!committed || typeof committed.selectLinesInRadius !== 'function') return null
    const lines = committed.selectLinesInRadius(pos, radius)
    let best = null
    let bestDist = Infinity
    let otherPoint = null
    for (const L of lines) {
      if (ignoreLineIds && ignoreLineIds.has(L.id)) continue
      if (L.p1) {
        const d = Math.hypot(pos.x - L.p1.x, pos.y - L.p1.y)
        if (d < bestDist) { bestDist = d; best = { x: L.p1.x, y: L.p1.y }; otherPoint = L.p2 }
      }
      if (L.p2) {
        const d = Math.hypot(pos.x - L.p2.x, pos.y - L.p2.y)
        if (d < bestDist) { bestDist = d; best = { x: L.p2.x, y: L.p2.y }; otherPoint = L.p1 }
      }
    }
    if (!best) return null
    return { point: best, other: otherPoint, distance: bestDist }
  }

  class SmoothPencilTool extends DefaultTool {
    constructor(store) {
      super(store)
      this._drawing = false
      this._lastPoint = null
      this._currentPos = null
      this._tickHandle = null
      this._detached = false
      this._flipThisStroke = false
      this._shiftDown = false
      this._currentPressure = 0.5
      this._colorIndex = 0
      this._colorDir = 1
      this._firstSegment = false

      this._nativePointerHandler = ev => {
        if (ev && ev.pointerType === 'pen') {
          if (typeof ev.pressure === 'number') this._currentPressure = Math.max(0, Math.min(1, ev.pressure))
          window.smoothP_lastPressure = this._currentPressure
        }
      }

      this._onShiftDown = e => { if (e.key === "Shift") this._shiftDown = true }
      this._onShiftUp = e => { if (e.key === "Shift") this._shiftDown = false }

      document.addEventListener("keydown", this._onShiftDown, true)
      document.addEventListener("keyup", this._onShiftUp, true)
      document.addEventListener("pointermove", this._nativePointerHandler, true)
      document.addEventListener("pointerdown", this._nativePointerHandler, true)
      document.addEventListener("pointerup", this._nativePointerHandler, true)

      this._externalMultiplier = (typeof window.selectedMultiplier === "number") ? window.selectedMultiplier : undefined
      this._externalWidth = (typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : undefined

      this._onExternalMultiplierChanged = e => { this._externalMultiplier = (typeof e.detail === "number") ? e.detail : undefined }
      this._onExternalWidthChanged = e => { this._externalWidth = (typeof e.detail === "number") ? e.detail : undefined }

      window.addEventListener("selected-multiplier-changed", this._onExternalMultiplierChanged)
      window.addEventListener("selected-scenery-width-changed", this._onExternalWidthChanged)

      this.dispatch(setToolState(TOOL_ID, { state: {} }))
    }

    _pickLayerIdForSequence(folderLayerIds, randomColor, boomerang) {
      if (!folderLayerIds || folderLayerIds.length === 0) return null
      if (randomColor) {
        const idx = Math.floor(Math.random() * folderLayerIds.length)
        return folderLayerIds[idx]
      } else {
        if (boomerang) {
          if (this._colorIndex < 0) this._colorIndex = 0
          if (this._colorIndex >= folderLayerIds.length) this._colorIndex = folderLayerIds.length - 1
          const id = folderLayerIds[this._colorIndex]
          if (folderLayerIds.length > 1) {
            const nextIndex = this._colorIndex + this._colorDir
            if (nextIndex < 0 || nextIndex >= folderLayerIds.length) {
              this._colorDir = -this._colorDir
              this._colorIndex = this._colorIndex + this._colorDir
            } else {
              this._colorIndex = nextIndex
            }
          }
          return id
        } else {
          const idx = this._colorIndex % folderLayerIds.length
          const id = folderLayerIds[idx]
          this._colorIndex = (this._colorIndex + 1) % Math.max(1, folderLayerIds.length)
          return id
        }
      }
    }

    _generateCrayonDots(x1, y1, x2, y2, dotsCount, dotWBase, spread, thicknessVariation, mult, type, flipped, multicolored, folderLayerIds, randomColor, boomerang) {
      const out = []
      const dxL = x2 - x1
      const dyL = y2 - y1
      let perCallLayer = null
      if (multicolored && !randomColor) {
        perCallLayer = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang)
      }
      for (let i = 0; i < dotsCount; i++) {
        const t = Math.random()
        const px = x1 + dxL * t
        const py = y1 + dyL * t
        const ang = Math.random() * Math.PI * 2
        const rr = Math.sqrt(Math.random()) * spread
        const perpX = Math.cos(ang) * rr
        const perpY = Math.sin(ang) * rr
        const segAngle = Math.random() * Math.PI * 2
        const segLen = Math.random() * 0.28 * Math.max(0.08, dotWBase)
        let dotW = dotWBase + (Math.random()*2 - 1) * thicknessVariation
        if (dotW < 0.01) dotW = 0.01
        const sx = px + perpX - Math.cos(segAngle) * segLen * 0.5
        const sy = py + perpY - Math.sin(segAngle) * segLen * 0.5
        const ex = px + perpX + Math.cos(segAngle) * segLen * 0.5
        const ey = py + perpY + Math.sin(segAngle) * segLen * 0.5

        if (multicolored) {
          if (randomColor) {
            const lid = folderLayerIds.length ? folderLayerIds[Math.floor(Math.random() * folderLayerIds.length)] : null
            if (lid != null) {
              out.push({
                id: null,
                x1: sx, y1: sy, x2: ex, y2: ey,
                width: dotW,
                multiplier: mult,
                type,
                flipped: !!flipped,
                layer: lid
              })
              continue
            }
          } else if (perCallLayer != null) {
            out.push({
              id: null,
              x1: sx, y1: sy, x2: ex, y2: ey,
              width: dotW,
              multiplier: mult,
              type,
              flipped: !!flipped,
              layer: perCallLayer
            })
            continue
          }
        }

        out.push({
          id: null,
          x1: sx, y1: sy, x2: ex, y2: ey,
          width: dotW,
          multiplier: mult,
          type,
          flipped: !!flipped,
          layer: getActiveLayer().activeLayerId
        })
      }
      return out
    }

    _makeLineObjLiteral(x1, y1, x2, y2, w, m, t, flipped, layerId, folderLayerIds, multicolored, randomColor, boomerang) {
      let assignedLayer
      if (typeof layerId !== 'undefined' && layerId !== null) {
        assignedLayer = layerId
      } else if (multicolored) {
        if (randomColor) {
          assignedLayer = folderLayerIds.length ? folderLayerIds[Math.floor(Math.random() * folderLayerIds.length)] : getActiveLayer().activeLayerId
        } else {
          assignedLayer = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang)
          if (assignedLayer == null) assignedLayer = getActiveLayer().activeLayerId
        }
      } else {
        assignedLayer = getActiveLayer().activeLayerId
      }
      return {
        id: null,
        x1: x1, y1: y1, x2: x2, y2: y2,
        width: w,
        multiplier: m,
        type: t,
        flipped: !!flipped,
        layer: assignedLayer
      }
    }

    static get usesSwatches() { return true }
    static getCursor(state) { return getPlayerRunning(state) ? "inherit" : "crosshair" }
    static getSceneLayer(state) { return new SceneLayer(TOOL_LAYER) }
    toTrackPos(p) { return super.toTrackPos(p) }

    _clearPreviewScene() {
      store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities([]) } })
    }

    _renderPreview() {
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
    }

    detach() {
      this._detached = true
      if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
      this.dispatch(revertTrackChanges())
      window.removeEventListener("selected-multiplier-changed", this._onExternalMultiplierChanged)
      window.removeEventListener("selected-scenery-width-changed", this._onExternalWidthChanged)
      document.removeEventListener("keydown", this._onShiftDown, true)
      document.removeEventListener("keyup", this._onShiftUp, true)
      document.removeEventListener("pointermove", this._nativePointerHandler, true)
      document.removeEventListener("pointerdown", this._nativePointerHandler, true)
      document.removeEventListener("pointerup", this._nativePointerHandler, true)
      this._drawing = false
      this._lastPoint = null
      this._currentPos = null
      this._clearPreviewScene()
      this._flipThisStroke = false
      this._shiftDown = false
    }

    _safeCommitIfNeeded() {
      const state = this.getState()
      if (getSimulatorTrack(state) !== getSimulatorCommittedTrack(state)) this.dispatch(commitTrackChanges())
    }

    onPointerDown(e) {
      window.dispatchEvent(new CustomEvent("request-selected-multiplier"))
      window.dispatchEvent(new CustomEvent("request-selected-scenery-width"))

      if (this._detached) return
      if (!e || typeof e.button === "undefined") return
      if (e.button !== 0) return

      if (e && e.pointerType === 'pen') {
        if (typeof e.pressure === 'number') this._currentPressure = Math.max(0, Math.min(1, e.pressure))
        window.smoothP_lastPressure = this._currentPressure
      }

      this._flipThisStroke = this._shiftDown
      this._drawing = true

      this._firstSegment = true

      const start = this.toTrackPos(e.pos)
      this._lastPoint = new V2(start)
      this._currentPos = new V2(start)

      if (getSetting('snapEnabled')) {
        const snapBase = Number(getSetting('snapRadius') ?? DEFAULTS.snapRadius)
        if (snapBase > 0) {
          const state = store.getState()
          const zoom = getEditorZoom(state) || 1
          const s = store.getState()
          const widthFromStore = (typeof s.selectedSceneryWidth === "number") ? s.selectedSceneryWidth : undefined
          const sentWidth = (widthFromStore !== undefined) ? widthFromStore : ((typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : DEFAULTS.width)
          const overrideWidth = Number(getSetting('overrideWidth') ?? DEFAULTS.overrideWidth)
          const effectiveWidth = (typeof overrideWidth === 'number' && overrideWidth !== 1) ? overrideWidth : sentWidth
          const radiusScaled = (20 * snapBase / zoom) + (effectiveWidth * 2)
          const found = findClosestEndpoint(this._lastPoint, radiusScaled)
          if (found && found.point) {
            this._lastPoint.x = found.point.x
            this._lastPoint.y = found.point.y
          }
        }
      }

      this._maybeAddSegment()
      this._renderPreview()

      if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
      const timeS = Math.max(0.0, parseFloat(getSetting('time') ?? DEFAULTS.time))
      const intervalMs = Math.max(8, Math.floor((timeS <= 0 ? 0.008 : timeS) * 1000))
      this._tickHandle = setInterval(() => {
        if (this._detached) { if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null } return }
        this._maybeAddSegment(); this._renderPreview()
      }, intervalMs)
    }

    onPointerDrag(e) {
      if (this._detached) return
      if (!this._drawing) return
      if (!e || typeof e.pos === "undefined") return
      const p = this.toTrackPos(e.pos); this._currentPos = new V2(p)

      if (e && e.pointerType === 'pen') {
        if (typeof e.pressure === 'number') this._currentPressure = Math.max(0, Math.min(1, e.pressure))
        window.smoothP_lastPressure = this._currentPressure
      }

      this._renderPreview()
    }

    onPointerUp(e) {
      if (this._detached) return
      const lastPressure = this._currentPressure
      this._currentPressure = 0.5
      window.smoothP_lastPressure = this._currentPressure

      if (getSetting('snapEnabled') && this._lastPoint) {
        const snapBase = Number(getSetting('snapRadius') ?? DEFAULTS.snapRadius)
        if (snapBase > 0) {
          const state = store.getState()
          const zoom = getEditorZoom(state) || 1
          const s = store.getState()
          const widthFromStore = (typeof s.selectedSceneryWidth === "number") ? s.selectedSceneryWidth : undefined
          const sentWidth = (widthFromStore !== undefined) ? widthFromStore : ((typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : DEFAULTS.width)
          const overrideWidth = Number(getSetting('overrideWidth') ?? DEFAULTS.overrideWidth)
          const effectiveWidth = (typeof overrideWidth === 'number' && overrideWidth !== 1) ? overrideWidth : sentWidth
          const radiusScaled = (20 * snapBase / zoom) + (effectiveWidth * 2)

          const found = findClosestEndpoint(this._lastPoint, radiusScaled)
          if (found && found.point) {
            const dx = this._lastPoint.x - found.point.x
            const dy = this._lastPoint.y - found.point.y
            const d = Math.hypot(dx, dy)
            if (d > 1e-6) {
              const multicolored = !!getSetting('multicolored')
              const randomColor = !!getSetting('randomColor')
              const boomerang = !!getSetting('boomerang')
              const crayonMode = !!getSetting('crayon')
              const xyMode = !!getSetting('xy')
              const penPressure = !!getSetting('penPressure')
              const intensity = Math.max(0, Number(getSetting('penIntensity') ?? DEFAULTS.penIntensity))
              const s2 = store.getState()
              const multFromStore = (typeof s2.selectedMultiplier === "number") ? s2.selectedMultiplier : undefined
              const sentMult = (multFromStore !== undefined) ? multFromStore : ( (typeof this._externalMultiplier === "number") ? this._externalMultiplier : DEFAULTS.multiplier )
              const overrideMultiplier = Number(getSetting('overrideMultiplier') ?? DEFAULTS.overrideMultiplier)
              const multVal = (typeof overrideMultiplier === 'number' && overrideMultiplier !== 1) ? overrideMultiplier : sentMult

              const widthFromStore = (typeof s2.selectedSceneryWidth === "number") ? s2.selectedSceneryWidth : undefined
              const sentWidth2 = (widthFromStore !== undefined) ? widthFromStore : ((typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : DEFAULTS.width)
              const overrideWidth2 = Number(getSetting('overrideWidth') ?? DEFAULTS.overrideWidth)
              const widthVal = (typeof overrideWidth2 === 'number' && overrideWidth2 !== 1) ? overrideWidth2 : sentWidth2

              const baseScaleFromPressure = (p) => (0.3 + p * 1.7)
              const scaleFromPressure = (p, intensityVal) => { const base = baseScaleFromPressure(p); return 1 + (base - 1) * intensityVal }
              const pressure = penPressure ? Math.max(0, Math.min(1, lastPressure || 0.5)) : 0.5
              const effectiveWidthVal = penPressure ? widthVal * scaleFromPressure(pressure, intensity) : widthVal

              const folderLayerIds = getFolderLayerIds()
              if (crayonMode) {
                const dots = Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10))
                const out = this._generateCrayonDots(
                  this._lastPoint.x, this._lastPoint.y,
                  found.point.x, found.point.y,
                  dots,
                  Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness)),
                  Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth)),
                  Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar)),
                  multVal,
                  getSelectedLineType(this.getState()),
                  !!this._flipThisStroke,
                  multicolored,
                  folderLayerIds,
                  randomColor,
                  boomerang
                )
                if (out.length) dispatchSetLinesNoCommit(out)
              } else if (xyMode) {
                const midX = found.point.x
                const midY = this._lastPoint.y
                const out = []
                const len1 = Math.hypot(midX - this._lastPoint.x, midY - this._lastPoint.y)
                const len2 = Math.hypot(found.point.x - midX, found.point.y - midY)
                const minLengthRaw = Number(getSetting('length') ?? DEFAULTS.length)
                const minLength = (minLengthRaw / (getEditorZoom(store.getState()) || 1))
                const use_l1 = len1 > minLength
                const use_l2 = len2 > minLength
                if (use_l1) out.push(this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, midX, midY, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, randomColor, boomerang))
                if (use_l2) out.push(this._makeLineObjLiteral(midX, midY, found.point.x, found.point.y, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, randomColor, boomerang))
                if (out.length) dispatchSetLinesNoCommit(out)
              } else {
                const lineObj = this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, found.point.x, found.point.y, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, getFolderLayerIds(), multicolored, randomColor, boomerang)
                dispatchSetLinesNoCommit([lineObj])
              }

              this._lastPoint.x = found.point.x
              this._lastPoint.y = found.point.y
            }
          }
        }
      }

      if (!e || typeof e.button === "undefined") {
        this._drawing = false
        if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
        this._safeCommitIfNeeded()
        this._lastPoint = null
        this._currentPos = null
        this._clearPreviewScene()
        this._flipThisStroke = false
        return
      }
      if (e.button !== 0) return
      this._drawing = false
      if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
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

      const minLengthRaw = Number(getSetting('length') ?? DEFAULTS.length)
      const stabilizer = Math.max(0, Math.min(1, Number(getSetting('stabilizer') ?? DEFAULTS.stabilizer)))
      const lenFrac = Math.max(0, Math.min(1, 1 - stabilizer))

      const nx = this._lastPoint.x + dx * lenFrac
      const ny = this._lastPoint.y + dy * lenFrac
      if (![nx, ny, this._lastPoint.x, this._lastPoint.y].every(Number.isFinite)) { this._drawing = false; this._flipThisStroke = false; return }

      const zoom = getEditorZoom(store.getState()) || 1
      const minLength = (minLengthRaw / zoom)

      const type = getSelectedLineType(this.getState())
      const s = store.getState()
      const widthFromStore = (typeof s.selectedSceneryWidth === "number") ? s.selectedSceneryWidth : undefined
      const multFromStore = (typeof s.selectedMultiplier === "number") ? s.selectedMultiplier : undefined

      const sentWidth = (widthFromStore !== undefined) ? widthFromStore : ((typeof window.selectedSceneryWidth === "number") ? window.selectedSceneryWidth : DEFAULTS.width)
      const sentMult = (multFromStore !== undefined) ? multFromStore : ( (typeof this._externalMultiplier === "number") ? this._externalMultiplier : DEFAULTS.multiplier )

      const overrideWidth = Number(getSetting('overrideWidth') ?? DEFAULTS.overrideWidth)
      const overrideMultiplier = Number(getSetting('overrideMultiplier') ?? DEFAULTS.overrideMultiplier)
      const widthVal = (typeof overrideWidth === 'number' && overrideWidth !== 1) ? overrideWidth : sentWidth
      const multVal = (typeof overrideMultiplier === 'number' && overrideMultiplier !== 1) ? overrideMultiplier : sentMult

      const randomRadius = Number(getSetting('random') ?? DEFAULTS.random)
      const xyMode = !!getSetting('xy')
      const crayonMode = !!getSetting('crayon')

      const baseDots = Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10))
      const baseDotThickness = Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness))
      const lineWidth = Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth))
      const thicknessVar = Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar))

      const multicolored = !!getSetting('multicolored')
      const randomColor = !!getSetting('randomColor')
      const boomerang = !!getSetting('boomerang')
      const penPressure = !!getSetting('penPressure')
      const intensity = Math.max(0, Number(getSetting('penIntensity') ?? DEFAULTS.penIntensity))
      const pressure = penPressure ? Math.max(0, Math.min(1, this._currentPressure || 0.5)) : 0.5

      let finalX = nx
      let finalY = ny
      if (randomRadius > 0) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * randomRadius
        finalX = nx + Math.cos(angle) * r
        finalY = ny + Math.sin(angle) * r
      }

      const folderLayerIds = multicolored ? getFolderLayerIds() : []

      const baseScaleFromPressure = (p) => (0.3 + p * 1.7)
      const scaleFromPressure = (p, intensityVal) => {
        const base = baseScaleFromPressure(p)
        return 1 + (base - 1) * intensityVal
      }

      const effectiveWidthVal = penPressure ? widthVal * scaleFromPressure(pressure, intensity) : widthVal
      let effectiveDots = baseDots
      if (crayonMode) effectiveDots = penPressure ? Math.max(1, Math.round(baseDots * scaleFromPressure(pressure, intensity))) : baseDots

      const safeDispatchAddNoCommit = (linesArr) => {
        for (let L of linesArr) {
          if (typeof L.id === 'undefined') L.id = null
          if (typeof L.width === 'undefined') L.width = effectiveWidthVal
          if (typeof L.multiplier === 'undefined') L.multiplier = multVal
          if (typeof L.type === 'undefined') L.type = type
        }
        dispatchSetLinesNoCommit(linesArr)
        return true
      }

      if (xyMode) {
        const midX = finalX
        const midY = this._lastPoint.y

        const len1 = Math.hypot(midX - this._lastPoint.x, midY - this._lastPoint.y)
        const len2 = Math.hypot(finalX - midX, finalY - midY)

        const use_l1 = len1 > minLength
        const use_l2 = len2 > minLength

        if (!use_l1 && !use_l2) return

        if (crayonMode) {
          const out = []
          if (use_l1) {
              out.push(...this._generateCrayonDots(
            this._lastPoint.x, this._lastPoint.y, midX, midY,
            effectiveDots, baseDotThickness, lineWidth, thicknessVar,
            multVal, type, !!this._flipThisStroke,
            multicolored, folderLayerIds, randomColor, boomerang
          ))
          }
          if (use_l2) {
              out.push(...this._generateCrayonDots(
            midX, midY, finalX, finalY,
            effectiveDots, baseDotThickness, lineWidth, thicknessVar,
            multVal, type, !!this._flipThisStroke,
            multicolored, folderLayerIds, randomColor, boomerang
          ))
          }
          if (out.length === 0) return
          if (!safeDispatchAddNoCommit(out)) return
        } else {
          const out = []
          if (use_l1) out.push(this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, midX, midY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, randomColor, boomerang))
          if (use_l2) out.push(this._makeLineObjLiteral(midX, midY, finalX, finalY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, randomColor, boomerang))
          if (out.length === 0) return
          if (!safeDispatchAddNoCommit(out)) return
        }
      } else {
        const segLen = Math.hypot(finalX - this._lastPoint.x, finalY - this._lastPoint.y)
        if (segLen <= minLength) return

        if (crayonMode) {
          const out = this._generateCrayonDots(
            this._lastPoint.x, this._lastPoint.y, finalX, finalY,
            effectiveDots, baseDotThickness, lineWidth, thicknessVar,
            multVal, type, !!this._flipThisStroke,
            multicolored, folderLayerIds, randomColor, boomerang
          )
          if (!safeDispatchAddNoCommit(out)) return
        } else {
          const lineObj = this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, finalX, finalY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, randomColor, boomerang)
          if (!safeDispatchAddNoCommit([lineObj])) return
        }
      }

      if (this._firstSegment) this._firstSegment = false

      this._lastPoint = new V2({ x: finalX, y: finalY })
    }
  }

  class SmoothPencilComponent extends React.Component {
    constructor(props) {
      super(props)
      this.defaults = { ...DEFAULTS }
      this.sectionBox = {
        border: "1px solid #ddd",
        padding: "8px",
        margin: "6px 0 12px 0",
        borderRadius: "6px",
        background: "#fafafa"
      }

      const initial = {}
      for (const k of Object.keys(this.defaults)) {
        initial[k] = (typeof window.smoothPState[k] !== "undefined") ? window.smoothPState[k] : this.defaults[k]
      }
      this.state = { ...initial }
      window.smoothPState = { ...this.state }

      this._onKeyDown = () => {}
      this._mounted = false
    }

    componentDidMount() { this._mounted = true; document.addEventListener("keydown", this._onKeyDown) }
    componentWillUnmount() { this._mounted = false; document.removeEventListener("keydown", this._onKeyDown) }

    setStateAndSync(nstate, cb) {
      this.setState(nstate, () => {
        window.smoothPState = { ...this.state }
        if (typeof cb === 'function') cb()
      })
    }

    onResetAll() {
      const next = {}
      for (const k of Object.keys(this.defaults)) next[k] = this.defaults[k]
      this.setStateAndSync(next)
    }

    onReset(key) {
      const val = this.defaults[key]
      if (typeof val === "undefined") return
      this.setStateAndSync({ [key]: val })
    }

    renderSpacer() {
      const e = React.createElement
      return e("div", { key: "spacer-" + Math.random(), style: { height: "8px" } })
    }

    renderSlider(key, props, title) {
      const e = React.createElement
      const value = this.state[key]
      const setter = ev => {
        const v = parseFloatOrDefault(ev.target.value, this.defaults[key])
        this.setStateAndSync({ [key]: v })
      }
      return e("div", { key: key, style: { marginTop: "6px" } }, [
        title || key, " ",
        e("input", { style: { width: "4em" }, type: "number", id: key, min: props.min, max: props.max, step: props.step, value, onChange: setter }),
        e("input", { style: { width: "8em", marginLeft: "6px" }, type: "range", min: props.min, max: props.max, step: props.step, value, onChange: setter, onFocus: ev => ev.target.blur() }),
        e("button", { style: { marginLeft: "6px" }, onClick: () => this.onReset(key) }, "⟳")
      ])
    }

    renderSection(key, title) {
      const e = React.createElement
      return e("div", { key: key + "-hdr", style: { display: "flex", alignItems: "center", marginTop: "8px" } },
        e("button", {
          id: key,
          style: { background: "none", border: "none", cursor: "pointer", padding: 0 },
          onClick: () => { const newVal = !this.state[key]; this.setStateAndSync({ [key]: newVal }) },
        }, this.state[key] ? "▲" : "▼"),
        e("label", { htmlFor: key, style: { marginLeft: "6px" } }, title)
      )
    }

    renderCheckbox(key, title = null) {
      const e = React.createElement
      if (!title) title = key
      const props = {
        id: key,
        checked: this.state[key],
        onChange: ev => { const v = !!ev.target.checked; this.setStateAndSync({ [key]: v }) },
        type: "checkbox"
      }
      return e("div", {
          key: key + "-chk",
          style: { marginTop: "6px", display: "flex", alignItems: "center", justifyContent: "flex-end" }
        },
        title,
        e("input", { style: { marginLeft: ".5em" }, ...props })
      )
    }

    render() {
      const e = React.createElement
      return e("div", { key: "smooth-pencil-root" }, [
        ...SLIDERS.map(s => this.renderSlider(s.key, { min: s.min, max: s.max, step: s.step }, s.label)),
        this.renderCheckbox("snapEnabled", "Line Snap"),
        this.state.snapEnabled ? this.renderSlider("snapRadius", { min: 0, max: 10, step: 0.1 }, "Snap Radius") : null,
        this.renderSlider("overrideWidth", { min: 0.01, max: 20, step: 0.01 }, "Width 🟩"),
        this.renderSlider("overrideMultiplier", { min: 0.01, max: 20, step: 0.01 }, "Multiplier 🟥"),
        this.renderSection("advancedOpen", "Advanced"),
        this.state.advancedOpen && e("div", { style: this.sectionBox }, [
          this.renderSlider("random", { min: 0, max: 200, step: 1 }, "Random (px)"),
          this.renderCheckbox("xy", "XY"),
          this.renderSpacer(),
          this.renderCheckbox("crayon", "Crayon"),
          this.state.crayon ? e("div", { key: "crayon-controls", style: { marginTop: "8px" } }, [
            this.renderSlider("dots", { min: 1, max: 200, step: 1 }, "Dots"),
            this.renderSlider("lineWidth", { min: 0, max: 12, step: 0.1 }, "Line Width"),
            this.renderSlider("dotThickness", { min: 0.01, max: 4, step: 0.01 }, "Dot Thickness"),
            this.renderSlider("thicknessVar", { min: 0, max: 1, step: 0.01 }, "Thickness Variation")
          ]) : null,
          this.renderSpacer(),
          this.renderCheckbox("multicolored", "Multicolored"),
          this.state.multicolored ? this.renderCheckbox("boomerang", "Boomerang") : null,
          this.state.multicolored ? this.renderCheckbox("randomColor", "Random Color") : null,
          this.renderSpacer(),
          this.renderCheckbox("penPressure", "Pen Pressure"),
          this.state.penPressure ? this.renderSlider("penIntensity", { min: 0, max: 2, step: 0.01 }, "Pen Intensity") : null
        ]),
        e("div", { key: "reset", style: { marginTop: "8px" } }, e("button", { onClick: () => this.onResetAll() }, "Reset All"))
      ])
    }
  }

  window.registerCustomTool(TOOL_ID, SmoothPencilTool, SmoothPencilComponent)
}

if (window.registerCustomTool) main(); else {
  const prevCb = window.onCustomToolsApiReady
  window.onCustomToolsApiReady = () => { if (prevCb) prevCb(); main() }
}
