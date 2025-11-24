// ==UserScript==
// @name         Custom Smooth Pencil Tool
// @namespace    https://www.linerider.com/
// @author       Xavi & Tobias Bessler
// @description  Smooth Pencil but better
// @version      0.4.3
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

    const PRESET_STORAGE_KEY = "smoothP_presets_v1"

    const DEFAULTS = {
        paintBrush: false,
        bristles: 6,
        brushSpread: 1,
        brushThicknessJitter: 0.05,
        bristleThickness: 0.2,
        time: 0,
        length: 0.02,
        stabilizer: 0.8,
        width: 1,
        multiplier: 1,
        snapEnabled: true,
        snapRadius: 0.6,
        randomMode: false,
        random: 1,
        xy: false,
        crayon: false,
        advancedOpen: false,
        presetsOpen: false,
        dots: 12,
        lineWidth: 1.0,
        dotThickness: 0.18,
        dotLength: 1.0,
        thicknessVar: 0.05,
        multicolored: false,
        multicolorMode: "loop",
        overrideWidth: 1,
        overrideMultiplier: 1,
        penPressure: false,
        penIntensity: 1.0,
        dottedLine: false,
        dottedLength: 0,
        multidraw: false,
        multidrawCount: 2,
        multidrawOffsets: [-3, 3],
        multidrawLayers: [],
        multidrawPenPressure: false
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

    function dispatchSetLines(lines) {
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
            this._lastTrueEndpoint = null
            this._currentPos = null
            this._tickHandle = null
            this._detached = false
            this._flipThisStroke = false
            this._shiftDown = false
            this._currentPressure = 0.5
            this._pressureAtLastPoint = 0.5
            this._colorIndex = 0
            this._colorDir = 1
            this._firstSegment = false
            this._multidrawLastEndpoints = []

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

        _pickLayerIdForSequence(folderLayerIds, randomColor, boomerang, multicolorMode, pressureVal) {
            if (!folderLayerIds || folderLayerIds.length === 0) return null
            if (multicolorMode === "random") {
                const idx = Math.floor(Math.random() * folderLayerIds.length)
                return folderLayerIds[idx]
            } else if (multicolorMode === "penPressure") {
                const p = (typeof pressureVal === 'number') ? Math.max(0, Math.min(1, pressureVal)) : 0
                const idx = Math.round(p * (folderLayerIds.length - 1))
                return folderLayerIds[Math.max(0, Math.min(folderLayerIds.length - 1, idx))]
            } else if (multicolorMode === "boomerang") {
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

        _generateCrayonDots(x1, y1, x2, y2, dotsCount, dotWBase, spread, thicknessVariation, mult, type, flipped, multicolored, folderLayerIds, multicolorMode, randomColor, boomerang, pressureVal, dotLengthMul) {
            const out = []
            const dxL = x2 - x1
            const dyL = y2 - y1
            let perCallLayer = null
            if (multicolored && multicolorMode !== "random" && multicolorMode !== "penPressure") {
                perCallLayer = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang, multicolorMode, pressureVal)
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
                const segLen = (Math.random() * 0.28 * Math.max(0.08, dotWBase)) * (typeof dotLengthMul === 'number' ? dotLengthMul : 1)
                let dotW = dotWBase + (Math.random()*2 - 1) * thicknessVariation
                if (dotW < 0.01) dotW = 0.01
                const sx = px + perpX - Math.cos(segAngle) * segLen * 0.5
                const sy = py + perpY - Math.sin(segAngle) * segLen * 0.5
                const ex = px + perpX + Math.cos(segAngle) * segLen * 0.5
                const ey = py + perpY + Math.sin(segAngle) * segLen * 0.5

                if (multicolored) {
                    if (multicolorMode === "random") {
                        const lid = folderLayerIds.length ? folderLayerIds[Math.floor(Math.random() * folderLayerIds.length)] : null
                        if (lid != null) {
                            out.push({
                                id: null,
                                x1: sx, y1: sy, x2: ex, y2: ey,
                                width: dotW,
                                multiplier: mult,
                                type,
                                flipped: !!flipped,
                                layer: lid,
                                _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
                            })
                            continue
                        }
                    } else if (multicolorMode === "penPressure") {
                        const lid = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang, multicolorMode, pressureVal)
                        if (lid != null) {
                            out.push({
                                id: null,
                                x1: sx, y1: sy, x2: ex, y2: ey,
                                width: dotW,
                                multiplier: mult,
                                type,
                                flipped: !!flipped,
                                layer: lid,
                                _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
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
                            layer: perCallLayer,
                            _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
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
                    layer: getActiveLayer().activeLayerId,
                    _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
                })
            }
            return out
        }

        _makeLineObjLiteral(x1, y1, x2, y2, w, m, t, flipped, layerId, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureVal) {
            let assignedLayer
            if (typeof layerId !== 'undefined' && layerId !== null) {
                assignedLayer = layerId
            } else if (multicolored) {
                if (multicolorMode === "random") {
                    assignedLayer = folderLayerIds.length ? folderLayerIds[Math.floor(Math.random() * folderLayerIds.length)] : getActiveLayer().activeLayerId
                } else if (multicolorMode === "penPressure") {
                    const p = (typeof pressureVal === 'number') ? Math.max(0, Math.min(1, pressureVal)) : 0
                    const idx = Math.round(p * Math.max(0, folderLayerIds.length - 1))
                    assignedLayer = folderLayerIds.length ? folderLayerIds[Math.max(0, Math.min(folderLayerIds.length - 1, idx))] : getActiveLayer().activeLayerId
                } else {
                    assignedLayer = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang, multicolorMode, pressureVal)
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
                layer: assignedLayer,
                _trueStartX: x1, _trueStartY: y1, _trueEndX: x2, _trueEndY: y2
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
            this._lastTrueEndpoint = null
            this._currentPos = null
            this._multidrawLastEndpoints = []
            this._flipThisStroke = false
            this._shiftDown = false
        }

        _safeCommitIfNeeded() {
            const state = this.getState()
            if (getSimulatorTrack(state) !== getSimulatorCommittedTrack(state)) this.dispatch(commitTrackChanges())
        }

        _dispatchLines(lines, pressureStart, pressureEnd) {
            const multidrawEnabled = !!getSetting('multidraw')
            if (!multidrawEnabled) {
                for (let L of lines) {
                    if (typeof L._trueStartX === 'undefined') { L._trueStartX = L.x1; L._trueStartY = L.y1 }
                    if (typeof L._trueEndX === 'undefined') { L._trueEndX = L.x2; L._trueEndY = L.y2 }
                }
                dispatchSetLines(lines)
                return
            }
            const count = Math.max(1, parseInt(getSetting('multidrawCount') || 1, 10))
            const offsets = Array.isArray(getSetting('multidrawOffsets')) ? getSetting('multidrawOffsets').slice(0) : []
            while (offsets.length < count) offsets.push(0)
            const mLayers = Array.isArray(getSetting('multidrawLayers')) ? getSetting('multidrawLayers').slice(0) : []
            const usePenPressure = !!getSetting('multidrawPenPressure')
            const folderLayerIdsGlobal = getFolderLayerIds()
            const multicoloredGlobal = !!getSetting('multicolored')
            const multicolorModeGlobal = String(getSetting('multicolorMode') || "loop")
            const randomColorGlobal = (multicolorModeGlobal === "random")
            const boomerangGlobal = (multicolorModeGlobal === "boomerang")
            const crayonModeGlobal = !!getSetting('crayon')
            const paintBrushModeGlobal = !!getSetting('paintBrush')
            const dottedOnGlobal = !!getSetting('dottedLine')
            const dottedLenGlobal = Number(getSetting('dottedLength') ?? DEFAULTS.dottedLength)
            const baseDots = Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10))
            const baseDotThickness = Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness))
            const lineWidth = Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth))
            const thicknessVar = Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar))

            const out = []
            for (const L of lines) {
                const baseSX = (typeof L._trueStartX === 'number') ? L._trueStartX : L.x1
                const baseSY = (typeof L._trueStartY === 'number') ? L._trueStartY : L.y1
                const baseFX = (typeof L._trueEndX === 'number') ? L._trueEndX : L.x2
                const baseFY = (typeof L._trueEndY === 'number') ? L._trueEndY : L.y2

                const dx = baseFX - baseSX
                const dy = baseFY - baseSY
                const len = Math.hypot(dx, dy) || 1
                const px = (dy / len)
                const py = (-dx / len)

                for (let i = 0; i < count; i++) {
                    const offBase = Number(offsets[i] || 0)
                    const sOff = offBase * (usePenPressure ? (typeof pressureStart === 'number' ? pressureStart : 1) : 1)
                    const eOff = offBase * (usePenPressure ? (typeof pressureEnd === 'number' ? pressureEnd : 1) : 1)
                    let startX, startY
                    if (this._multidrawLastEndpoints && typeof this._multidrawLastEndpoints[i] === 'object' && this._multidrawLastEndpoints[i] !== null) {
                        startX = this._multidrawLastEndpoints[i].x
                        startY = this._multidrawLastEndpoints[i].y
                    } else {
                        startX = baseSX + px * sOff
                        startY = baseSY + py * sOff
                    }
                    const endX = baseFX + px * eOff
                    const endY = baseFY + py * eOff
                    const layerFor = (typeof mLayers[i] !== 'undefined' && mLayers[i] !== null) ? mLayers[i] : L.layer
                    if (L._canonical) {
                        if (getSetting('xy')) {
                            const midX = endX
                            const midY = startY
                            const segs = [
                                { sx: startX, sy: startY, fx: midX, fy: midY, pStart: pressureStart, pEnd: (pressureStart+pressureEnd)/2 },
                                { sx: midX, sy: midY, fx: endX, fy: endY, pStart: (pressureStart+pressureEnd)/2, pEnd: pressureEnd }
                            ]
                            for (const seg of segs) {
                                const segLen = Math.hypot(seg.fx - seg.sx, seg.fy - seg.sy)
                                if (segLen <= 0.000001) continue
                                if (crayonModeGlobal) {
                                    const dots = Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10))
                                    const pieces = this._generateCrayonDots(
                                        seg.sx, seg.sy, seg.fx, seg.fy,
                                        dots,
                                        Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness)),
                                        Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth)),
                                        Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar)),
                                        L.multiplier, L.type, L.flipped,
                                        multicoloredGlobal, folderLayerIdsGlobal,
                                        multicolorModeGlobal, randomColorGlobal, boomerangGlobal,
                                        seg.pEnd,
                                        Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                                    )
                                    if (layerFor != null) for (const p of pieces) p.layer = layerFor
                                    out.push(...pieces)
                                    this._multidrawLastEndpoints[i] = { x: seg.fx, y: seg.fy }
                                } else if (paintBrushModeGlobal) {
                                    const pieces = this._generateBrushStrokes(
                                        seg.sx, seg.sy, seg.fx, seg.fy,
                                        Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10)),
                                        Number(getSetting("brushSpread") ?? DEFAULTS.brushSpread),
                                        Number(getSetting("brushThicknessJitter") ?? DEFAULTS.brushThicknessJitter),
                                        Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * L.width,
                                        L.multiplier, L.type, L.flipped,
                                        folderLayerIdsGlobal, multicoloredGlobal, multicolorModeGlobal, randomColorGlobal, boomerangGlobal,
                                        seg.pEnd
                                    )
                                    if (layerFor != null) for (const p of pieces) p.layer = layerFor
                                    out.push(...pieces)
                                    this._multidrawLastEndpoints[i] = { x: seg.fx, y: seg.fy }
                                } else {
                                    const dottedOn = dottedOnGlobal
                                    const dottedLen = dottedLenGlobal
                                    const ax = seg.sx + (seg.fx - seg.sx) * (dottedOn ? dottedLen : 1)
                                    const ay = seg.sy + (seg.fy - seg.sy) * (dottedOn ? dottedLen : 1)
                                    const obj = this._makeLineObjLiteral(seg.sx, seg.sy, ax, ay, L.width, L.multiplier, L.type, L.flipped, layerFor, folderLayerIdsGlobal, multicoloredGlobal, multicolorModeGlobal, randomColorGlobal, boomerangGlobal, seg.pEnd)
                                    obj._trueStartX = seg.sx; obj._trueStartY = seg.sy; obj._trueEndX = seg.fx; obj._trueEndY = seg.fy
                                    out.push(obj)
                                    this._multidrawLastEndpoints[i] = { x: seg.fx, y: seg.fy }
                                }
                            }
                            // continue to next multidraw line
                        } else {
                            if (crayonModeGlobal) {
                                const dots = Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10))
                                const pieces = this._generateCrayonDots(
                                    startX, startY, endX, endY,
                                    dots,
                                    Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness)),
                                    Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth)),
                                    Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar)),
                                    L.multiplier, L.type, L.flipped,
                                    multicoloredGlobal, folderLayerIdsGlobal,
                                    multicolorModeGlobal, randomColorGlobal, boomerangGlobal,
                                    pressureEnd,
                                    Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                                )
                                if (layerFor != null) for (const p of pieces) p.layer = layerFor
                                out.push(...pieces)
                                this._multidrawLastEndpoints[i] = { x: endX, y: endY }
                            } else if (paintBrushModeGlobal) {
                                const pieces = this._generateBrushStrokes(
                                    startX, startY, endX, endY,
                                    Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10)),
                                    Number(getSetting("brushSpread") ?? DEFAULTS.brushSpread),
                                    Number(getSetting("brushThicknessJitter") ?? DEFAULTS.brushThicknessJitter),
                                    Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * L.width,
                                    L.multiplier, L.type, L.flipped,
                                    folderLayerIdsGlobal, multicoloredGlobal, multicolorModeGlobal, randomColorGlobal, boomerangGlobal,
                                    pressureEnd
                                )
                                if (layerFor != null) for (const p of pieces) p.layer = layerFor
                                out.push(...pieces)
                                this._multidrawLastEndpoints[i] = { x: endX, y: endY }
                            } else {
                                const dottedOn = dottedOnGlobal
                                const dottedLen = dottedLenGlobal
                                const ax = startX + (endX - startX) * (dottedOn ? dottedLen : 1)
                                const ay = startY + (endY - startY) * (dottedOn ? dottedLen : 1)
                                const obj = this._makeLineObjLiteral(startX, startY, ax, ay, L.width, L.multiplier, L.type, L.flipped, layerFor, folderLayerIdsGlobal, multicoloredGlobal, multicolorModeGlobal, randomColorGlobal, boomerangGlobal, pressureEnd)
                                obj._trueStartX = startX; obj._trueStartY = startY; obj._trueEndX = endX; obj._trueEndY = endY
                                out.push(obj)
                                this._multidrawLastEndpoints[i] = { x: endX, y: endY }
                            }
                        }
                    } else {
                        const obj = { ...L }
                        obj.x1 = startX; obj.y1 = startY; obj.x2 = endX; obj.y2 = endY
                        obj.layer = layerFor
                        if (typeof obj._trueStartX === 'undefined') obj._trueStartX = startX
                        if (typeof obj._trueEndX === 'undefined') obj._trueEndX = endX
                        out.push(obj)
                        this._multidrawLastEndpoints[i] = { x: endX, y: endY }
                    }
                }
            }
            if (out.length) dispatchSetLines(out)
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
            this._pressureAtLastPoint = this._currentPressure
            this._lastTrueEndpoint = new V2(this._lastPoint)
            this._multidrawLastEndpoints = []

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
                        this._lastTrueEndpoint = new V2(this._lastPoint)
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
                            const multicolorMode = String(getSetting('multicolorMode') || "loop")
                            const randomColor = (multicolorMode === "random")
                            const boomerang = (multicolorMode === "boomerang")
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
                            const pressureForWidth = penPressure ? Math.max(0, Math.min(1, lastPressure || 0.5)) : widthVal ? 0.5 : 0.5
                            const pressureForLayer = Math.max(0, Math.min(1, lastPressure || 0.5))
                            const effectiveWidthVal = penPressure ? widthVal * scaleFromPressure(pressureForWidth, intensity) : widthVal

                            const folderLayerIds = getFolderLayerIds()
                            const multidrawEnabled = !!getSetting('multidraw')
                            if (multidrawEnabled) {
                                const sx = this._lastPoint.x
                                const sy = this._lastPoint.y
                                const fx = found.point.x
                                const fy = found.point.y
                                const L = this._makeLineObjLiteral(sx, sy, fx, fy, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureForLayer)
                                L._canonical = true
                                L._trueStartX = sx; L._trueStartY = sy; L._trueEndX = fx; L._trueEndY = fy
                                if (this._dispatchLines) {
                                    this._dispatchLines([L], this._pressureAtLastPoint, lastPressure)
                                } else {
                                    dispatchSetLines([L])
                                }
                                this._pressureAtLastPoint = lastPressure
                                this._lastPoint = new V2({ x: fx, y: fy })
                                this._lastTrueEndpoint = new V2({ x: fx, y: fy })
                            } else if (crayonMode) {
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
                                    multicolorMode,
                                    randomColor,
                                    boomerang,
                                    pressureForLayer,
                                    Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                                )
                                if (out.length) this._dispatchLines(out, this._pressureAtLastPoint, lastPressure)
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
                                const dottedOn = !!getSetting('dottedLine')
                                const dottedLen = Number(getSetting('dottedLength') ?? DEFAULTS.dottedLength)
                                if (use_l1) {
                                    if (getSetting("paintBrush")) {
                                        out.push(...this._generateBrushStrokes(
                                            this._lastPoint.x, this._lastPoint.y, midX, midY,
                                            Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10)),
                                            Number(getSetting("brushSpread") ?? DEFAULTS.brushSpread),
                                            Number(getSetting("brushThicknessJitter") ?? DEFAULTS.brushThicknessJitter),
                                            Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * effectiveWidthVal,
                                            multVal,
                                            getSelectedLineType(this.getState()),
                                            !!this._flipThisStroke,
                                            folderLayerIds,
                                            multicolored,
                                            multicolorMode,
                                            randomColor,
                                            boomerang,
                                            pressureForLayer
                                        ))
                                    } else if (crayonMode) {
                                        out.push(...this._generateCrayonDots(
                                            this._lastPoint.x, this._lastPoint.y, midX, midY,
                                            Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10)),
                                            Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness)),
                                            Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth)),
                                            Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar)),
                                            multVal,
                                            getSelectedLineType(this.getState()),
                                            !!this._flipThisStroke,
                                            multicolored,
                                            folderLayerIds,
                                            multicolorMode,
                                            randomColor,
                                            boomerang,
                                            pressureForLayer,
                                            Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                                        ))
                                    } else {
                                        const sx = this._lastPoint.x
                                        const sy = this._lastPoint.y
                                        const fx = midX
                                        const fy = midY
                                        const ax = sx + (fx - sx) * (dottedOn ? dottedLen : 1)
                                        const ay = sy + (fy - sy) * (dottedOn ? dottedLen : 1)
                                        const l = this._makeLineObjLiteral(sx, sy, ax, ay, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureForLayer)
                                        l._trueStartX = sx; l._trueStartY = sy; l._trueEndX = fx; l._trueEndY = fy
                                        out.push(l)
                                    }
                                }
                                if (use_l2) {
                                    if (getSetting("paintBrush")) {
                                        out.push(...this._generateBrushStrokes(
                                            midX, midY, found.point.x, found.point.y,
                                            Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10)),
                                            Number(getSetting("brushSpread") ?? DEFAULTS.brushSpread),
                                            Number(getSetting("brushThicknessJitter") ?? DEFAULTS.brushThicknessJitter),
                                            Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * effectiveWidthVal,
                                            multVal,
                                            getSelectedLineType(this.getState()),
                                            !!this._flipThisStroke,
                                            folderLayerIds,
                                            multicolored,
                                            multicolorMode,
                                            randomColor,
                                            boomerang,
                                            pressureForLayer
                                        ))
                                    } else if (crayonMode) {
                                        out.push(...this._generateCrayonDots(
                                            midX, midY, found.point.x, found.point.y,
                                            Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10)),
                                            Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness)),
                                            Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth)),
                                            Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar)),
                                            multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke,
                                            multicolored, folderLayerIds,
                                            multicolorMode, randomColor, boomerang, pressureForLayer,
                                            Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                                        ))
                                    } else {
                                        const sx = midX
                                        const sy = this._lastPoint.y
                                        const fx = found.point.x
                                        const fy = found.point.y
                                        const ax = sx + (fx - sx) * (dottedOn ? dottedLen : 1)
                                        const ay = sy + (fy - sy) * (dottedOn ? dottedLen : 1)
                                        const l = this._makeLineObjLiteral(sx, sy, ax, ay, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureForLayer)
                                        l._trueStartX = sx; l._trueStartY = sy; l._trueEndX = fx; l._trueEndY = fy
                                        out.push(l)
                                    }
                                }
                                if (out.length) this._dispatchLines(out, this._pressureAtLastPoint, lastPressure)
                            } else {
                                const dottedOn = !!getSetting('dottedLine')
                                const dottedLen = Number(getSetting('dottedLength') ?? DEFAULTS.dottedLength)
                                const sx = this._lastPoint.x
                                const sy = this._lastPoint.y
                                const fx = found.point.x
                                const fy = found.point.y
                                const ax = sx + (fx - sx) * (dottedOn ? dottedLen : 1)
                                const ay = sy + (fy - sy) * (dottedOn ? dottedLen : 1)
                                const l = this._makeLineObjLiteral(sx, sy, ax, ay, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, getFolderLayerIds(), multicolored, multicolorMode, randomColor, boomerang, pressureForLayer)
                                l._trueStartX = sx; l._trueStartY = sy; l._trueEndX = fx; l._trueEndY = fy
                                this._dispatchLines([l], this._pressureAtLastPoint, lastPressure)
                            }
                            this._pressureAtLastPoint = lastPressure
                            this._lastPoint.x = found.point.x
                            this._lastPoint.y = found.point.y
                            this._lastTrueEndpoint = new V2({ x: found.point.x, y: found.point.y })
                        }
                    }
                }
            }


            if (!e || typeof e.button === "undefined") {
                this._drawing = false
                if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
                this._safeCommitIfNeeded()
                this._lastPoint = null
                this._lastTrueEndpoint = null
                this._currentPos = null
                this._multidrawLastEndpoints = []
                this._clearPreviewScene()
                this._flipThisStroke = false
                return
            }
            if (e.button !== 0) return
            this._drawing = false
            if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null }
            this._safeCommitIfNeeded()
            this._lastPoint = null
            this._lastTrueEndpoint = null
            this._currentPos = null
            this._multidrawLastEndpoints = []
            this._clearPreviewScene()
            this._flipThisStroke = false
        }

        _generateBrushStrokes(x1, y1, x2, y2, count, spread, thicknessJitter, bristleThickness, mult, type, flipped, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureVal) {
            const out = []
            const dx = x2 - x1
            const dy = y2 - y1
            let perCallLayer = null
            if (multicolored && multicolorMode !== "random" && multicolorMode !== "penPressure") {
                perCallLayer = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang, multicolorMode, pressureVal)
            }
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2
                const r = Math.sqrt(Math.random()) * spread
                const ox = Math.cos(angle) * r
                const oy = Math.sin(angle) * r
                const sx = x1 + ox
                const sy = y1 + oy
                const ex = x2 + ox
                const ey = y2 + oy
                let w = Math.max(0.01, bristleThickness * (1 + (Math.random()*2 - 1) * thicknessJitter))
                if (multicolored) {
                    if (multicolorMode === "random") {
                        const lid = folderLayerIds.length ? folderLayerIds[Math.floor(Math.random() * folderLayerIds.length)] : null
                        if (lid != null) {
                            out.push({
                                id: null, x1: sx, y1: sy, x2: ex, y2: ey,
                                width: w, multiplier: mult, type, flipped: !!flipped, layer: lid,
                                _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
                            })
                            continue
                        }
                    } else if (multicolorMode === "penPressure") {
                        const lid = this._pickLayerIdForSequence(folderLayerIds, randomColor, boomerang, multicolorMode, pressureVal)
                        if (lid != null) {
                            out.push({
                                id: null, x1: sx, y1: sy, x2: ex, y2: ey,
                                width: w, multiplier: mult, type, flipped: !!flipped, layer: lid,
                                _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
                            })
                            continue
                        }
                    } else if (perCallLayer != null) {
                        out.push({
                            id: null, x1: sx, y1: sy, x2: ex, y2: ey,
                            width: w, multiplier: mult, type, flipped: !!flipped, layer: perCallLayer,
                            _trueStartX: sx, _trueStartY: sy, _trueEndX: ex, _trueEndY: ey
                        })
                        continue
                    }
                }
                out.push(this._makeLineObjLiteral(sx, sy, ex, ey, w, mult, type, flipped, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureVal))
            }
            return out
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
            const multicolorMode = String(getSetting('multicolorMode') || "loop")
            const randomColor = (multicolorMode === "random")
            const boomerang = (multicolorMode === "boomerang")
            const penPressure = !!getSetting('penPressure')
            const intensity = Math.max(0, Number(getSetting('penIntensity') ?? DEFAULTS.penIntensity))
            const pressureStart = (typeof this._pressureAtLastPoint === 'number') ? this._pressureAtLastPoint : 0.5
            const pressureEnd = (typeof this._currentPressure === 'number') ? this._currentPressure : 0.5
            const pressureForWidth = penPressure ? pressureEnd : 0.5

            let finalX = nx
            let finalY = ny
            if (randomRadius > 0 && !!getSetting('randomMode')) {
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

            const effectiveWidthVal = penPressure ? widthVal * scaleFromPressure(pressureForWidth, intensity) : widthVal
            let effectiveDots = baseDots
            if (crayonMode) effectiveDots = penPressure ? Math.max(1, Math.round(baseDots * scaleFromPressure(pressureEnd, intensity))) : baseDots

            const multidrawEnabled = !!getSetting('multidraw')

            const safeDispatchAddNoCommit = (linesArr) => {
                for (let L of linesArr) {
                    if (typeof L.id === 'undefined') L.id = null
                    if (typeof L.width === 'undefined') L.width = effectiveWidthVal
                    if (typeof L.multiplier === 'undefined') L.multiplier = multVal
                    if (typeof L.type === 'undefined') L.type = type
                    if (typeof L._trueStartX === 'undefined') { L._trueStartX = L.x1; L._trueStartY = L.y1 }
                    if (typeof L._trueEndX === 'undefined') { L._trueEndX = L.x2; L._trueEndY = L.y2 }
                }
                this._dispatchLines(linesArr, pressureStart, pressureEnd)
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

                if (multidrawEnabled) {
                    const canonical = []
                    if (use_l1) {
                        canonical.push(this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, midX, midY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd))
                        canonical[canonical.length-1]._canonical = true
                        canonical[canonical.length-1]._trueStartX = this._lastPoint.x
                        canonical[canonical.length-1]._trueStartY = this._lastPoint.y
                        canonical[canonical.length-1]._trueEndX = midX
                        canonical[canonical.length-1]._trueEndY = midY
                    }
                    if (use_l2) {
                        canonical.push(this._makeLineObjLiteral(midX, midY, finalX, finalY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd))
                        canonical[canonical.length-1]._canonical = true
                        canonical[canonical.length-1]._trueStartX = midX
                        canonical[canonical.length-1]._trueStartY = midY
                        canonical[canonical.length-1]._trueEndX = finalX
                        canonical[canonical.length-1]._trueEndY = finalY
                    }
                    if (safeDispatchAddNoCommit(canonical)) {
                        this._pressureAtLastPoint = this._currentPressure
                        const lastSeg = canonical[canonical.length - 1]
                        const endX = (typeof lastSeg._trueEndX === 'number') ? lastSeg._trueEndX : lastSeg.x2
                        const endY = (typeof lastSeg._trueEndY === 'number') ? lastSeg._trueEndY : lastSeg.y2
                        this._lastPoint = new V2({ x: endX, y: endY })
                        this._lastTrueEndpoint = new V2({ x: endX, y: endY })
                        if (this._firstSegment) this._firstSegment = false
                    }
                    return
                }

                if (crayonMode || getSetting("paintBrush")) {
                    const out = []
                    if (use_l1 && getSetting("paintBrush")) {
                        out.push(...this._generateBrushStrokes(
                            this._lastPoint.x, this._lastPoint.y, midX, midY,
                            Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10)),
                            Number(getSetting("brushSpread") ?? DEFAULTS.brushSpread),
                            Number(getSetting("brushThicknessJitter") ?? DEFAULTS.brushThicknessJitter),
                            Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * effectiveWidthVal,
                            multVal,
                            getSelectedLineType(this.getState()),
                            !!this._flipThisStroke,
                            folderLayerIds,
                            multicolored,
                            multicolorMode,
                            randomColor,
                            boomerang,
                            pressureEnd
                        ))
                    } else if (use_l1 && crayonMode) {
                        out.push(...this._generateCrayonDots(
                            this._lastPoint.x, this._lastPoint.y, midX, midY,
                            effectiveDots, baseDotThickness, lineWidth, thicknessVar,
                            multVal, type, !!this._flipThisStroke,
                            multicolored, folderLayerIds,
                            multicolorMode, randomColor, boomerang, pressureEnd,
                            Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                        ))
                    } else if (use_l1) {
                        const dottedOn = !!getSetting('dottedLine')
                        const dottedLen = Number(getSetting('dottedLength') ?? DEFAULTS.dottedLength)
                        const sx = this._lastPoint.x
                        const sy = this._lastPoint.y
                        const fx = midX
                        const fy = midY
                        const ax = sx + (fx - sx) * (dottedOn ? dottedLen : 1)
                        const ay = sy + (fy - sy) * (dottedOn ? dottedLen : 1)
                        const l = this._makeLineObjLiteral(sx, sy, ax, ay, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd)
                        l._trueStartX = sx; l._trueStartY = sy; l._trueEndX = fx; l._trueEndY = fy
                        out.push(l)
                    }
                    if (use_l2 && getSetting("paintBrush")) {
                        out.push(...this._generateBrushStrokes(
                            midX, midY, finalX, finalY,
                            Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10)),
                            Number(getSetting("brushSpread") ?? DEFAULTS.brushSpread),
                            Number(getSetting("brushThicknessJitter") ?? DEFAULTS.brushThicknessJitter),
                            Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * effectiveWidthVal,
                            multVal,
                            getSelectedLineType(this.getState()),
                            !!this._flipThisStroke,
                            folderLayerIds,
                            multicolored,
                            multicolorMode,
                            randomColor,
                            boomerang,
                            pressureEnd
                        ))
                    } else if (use_l2 && crayonMode) {
                        out.push(...this._generateCrayonDots(
                            midX, midY, finalX, finalY,
                            Math.max(1, parseInt(getSetting('dots') ?? DEFAULTS.dots, 10)),
                            Math.max(0.01, Number(getSetting('dotThickness') ?? DEFAULTS.dotThickness)),
                            Math.max(0, Number(getSetting('lineWidth') ?? DEFAULTS.lineWidth)),
                            Math.max(0, Number(getSetting('thicknessVar') ?? DEFAULTS.thicknessVar)),
                            multVal, type, !!this._flipThisStroke,
                            multicolored, folderLayerIds,
                            multicolorMode, randomColor, boomerang, pressureEnd,
                            Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                        ))
                    } else if (use_l2) {
                        const dottedOn = !!getSetting('dottedLine')
                        const dottedLen = Number(getSetting('dottedLength') ?? DEFAULTS.dottedLength)
                        const sx = midX
                        const sy = this._lastPoint.y
                        const fx = finalX
                        const fy = finalY
                        const ax = sx + (fx - sx) * (dottedOn ? dottedLen : 1)
                        const ay = sy + (fy - sy) * (dottedOn ? dottedLen : 1)
                        const l = this._makeLineObjLiteral(sx, sy, ax, ay, effectiveWidthVal, multVal, getSelectedLineType(this.getState()), !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd)
                        l._trueStartX = sx; l._trueStartY = sy; l._trueEndX = fx; l._trueEndY = fy
                        out.push(l)
                    }
                    if (out.length === 0) return
                    if (!safeDispatchAddNoCommit(out)) return
                } else {
                    const out = []
                    if (use_l1) out.push(this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, midX, midY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd))
                    if (use_l2) out.push(this._makeLineObjLiteral(midX, midY, finalX, finalY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd))
                    if (out.length === 0) return
                    if (!safeDispatchAddNoCommit(out)) return
                }
            } else {
                const segLen = Math.hypot(finalX - this._lastPoint.x, finalY - this._lastPoint.y)
                if (segLen <= minLength) return

                const paintBrushMode = !!getSetting("paintBrush");

                if (multidrawEnabled) {
                    const L = this._makeLineObjLiteral(this._lastPoint.x, this._lastPoint.y, finalX, finalY, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd)
                    L._canonical = true
                    L._trueStartX = this._lastPoint.x; L._trueStartY = this._lastPoint.y; L._trueEndX = finalX; L._trueEndY = finalY
                    if (safeDispatchAddNoCommit([L])) {
                        this._pressureAtLastPoint = this._currentPressure
                        this._lastPoint = new V2({ x: finalX, y: finalY })
                        this._lastTrueEndpoint = new V2({ x: finalX, y: finalY })
                        if (this._firstSegment) this._firstSegment = false
                    }
                    return
                }

                if (paintBrushMode) {
                    const bristles = Math.max(1, parseInt(getSetting("bristles") || DEFAULTS.bristles, 10));
                    const spread = Number(getSetting("brushSpread") || DEFAULTS.brushSpread);
                    const jitter = Number(getSetting("brushThicknessJitter") || DEFAULTS.brushThicknessJitter);
                    const bt = Number(getSetting("bristleThickness") ?? DEFAULTS.bristleThickness) * effectiveWidthVal;

                    const out = this._generateBrushStrokes(
                        this._lastPoint.x, this._lastPoint.y,
                        finalX, finalY,
                        bristles,
                        spread,
                        jitter,
                        bt,
                        multVal,
                        type,
                        !!this._flipThisStroke,
                        folderLayerIds,
                        multicolored,
                        multicolorMode,
                        randomColor,
                        boomerang,
                        pressureEnd
                    );

                    if (!safeDispatchAddNoCommit(out)) return;
                } else if (crayonMode) {
                    const out = this._generateCrayonDots(
                        this._lastPoint.x, this._lastPoint.y, finalX, finalY,
                        effectiveDots, baseDotThickness, lineWidth, thicknessVar,
                        multVal, type, !!this._flipThisStroke,
                        multicolored, folderLayerIds,
                        multicolorMode, randomColor, boomerang, pressureEnd,
                        Number(getSetting('dotLength') ?? DEFAULTS.dotLength)
                    )
                    if (!safeDispatchAddNoCommit(out)) return
                } else {
                    const dottedOn = !!getSetting('dottedLine')
                    const dottedLen = Number(getSetting('dottedLength') ?? DEFAULTS.dottedLength)
                    const sx = this._lastPoint.x
                    const sy = this._lastPoint.y
                    const fx = finalX
                    const fy = finalY
                    const ax = sx + (fx - sx) * (dottedOn ? dottedLen : 1)
                    const ay = sy + (fy - sy) * (dottedOn ? dottedLen : 1)
                    const l = this._makeLineObjLiteral(sx, sy, ax, ay, effectiveWidthVal, multVal, type, !!this._flipThisStroke, null, folderLayerIds, multicolored, multicolorMode, randomColor, boomerang, pressureEnd)
                    l._trueStartX = sx; l._trueStartY = sy; l._trueEndX = fx; l._trueEndY = fy
                    if (!safeDispatchAddNoCommit([l])) return
                }
            }

            if (this._firstSegment) this._firstSegment = false

            this._pressureAtLastPoint = this._currentPressure
            this._lastPoint = new V2({ x: finalX, y: finalY })
            this._lastTrueEndpoint = new V2({ x: finalX, y: finalY })
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

            const presets = this._loadPresetsFromStorage()
            this.state = { ...initial, presets, presetName: "" }
            window.smoothPState = { ...this.state }
            delete window.smoothPState.presets
            delete window.smoothPState.presetName

            this._onKeyDown = () => {}
            this._mounted = false
        }

        _loadPresetsFromStorage() {
            try {
                const raw = localStorage.getItem(PRESET_STORAGE_KEY)
                if (!raw) return {}
                const parsed = JSON.parse(raw)
                if (parsed && typeof parsed === 'object') return parsed
                return {}
            } catch (e) {
                return {}
            }
        }

        _savePresetsToStorage(presets) {
            try {
                localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets || {}))
            } catch (e) {}
        }

        _normalizePresetValues(obj) {
            const out = {}
            for (const k of Object.keys(this.defaults)) {
                if (typeof obj[k] === 'undefined') continue
                out[k] = obj[k]
            }
            return out
        }

        componentDidMount() { this._mounted = true; document.addEventListener("keydown", this._onKeyDown) }
        componentWillUnmount() { this._mounted = false; document.removeEventListener("keydown", this._onKeyDown) }

        setStateAndSync(nstate, cb) {
            this.setState(nstate, () => {
                const newStateForGlobal = {}
                for (const k of Object.keys(this.defaults)) {
                    if (typeof this.state[k] !== 'undefined') newStateForGlobal[k] = this.state[k]
                }
                window.smoothPState = { ...window.smoothPState, ...newStateForGlobal }
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

        onSavePreset() {
            const name = (this.state.presetName || "").trim()
            if (!name) return
            const presets = { ...(this.state.presets || {}) }
            const presetObj = {}
            for (const k of Object.keys(this.defaults)) presetObj[k] = this.state[k]
            presets[name] = presetObj
            this.setState({ presets, presetName: "" }, () => this._savePresetsToStorage(presets))
        }

        onLoadPreset(name) {
            if (!name) return
            const presets = this.state.presets || {}
            const p = presets[name]
            if (!p) return
            const normalized = this._normalizePresetValues(p)
            this.setStateAndSync(normalized)
        }

        onRemovePreset(name) {
            if (!name) return
            const presets = { ...(this.state.presets || {}) }
            if (typeof presets[name] === 'undefined') return
            delete presets[name]
            this.setState({ presets }, () => this._savePresetsToStorage(presets))
        }

        _valueToString(v) {
            if (typeof v === 'boolean') return v ? "true" : "false"
            if (typeof v === 'number') return String(v)
            if (typeof v === 'string') return v
            if (Array.isArray(v)) return JSON.stringify(v)
            return String(v)
        }

        _parseStringValue(s) {
            const t = (s || "").trim()
            if (t === "true") return true
            if (t === "false") return false
            if (t === "") return ""
            try {
                const parsed = JSON.parse(t)
                if (Array.isArray(parsed)) return parsed
            } catch (e) {}
            const n = Number(t)
            if (!Number.isNaN(n)) return n
            return t
        }

        onDownloadPreset(name) {
            if (!name) return
            const presets = this.state.presets || {}
            const p = presets[name]
            if (!p) return
            const lines = []
            for (const k of Object.keys(this.defaults)) {
                if (typeof p[k] !== 'undefined') lines.push(`${k}: ${this._valueToString(p[k])}`)
            }
            const txt = lines.join("\n")
            const blob = new Blob([txt], { type: "text/plain" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${name}.txt`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        }

        onUploadPresetFile(ev) {
            const files = ev.target.files
            if (!files || !files.length) return
            const f = files[0]
            const reader = new FileReader()
            reader.onload = e => {
                const text = e.target.result || ""
                const lines = text.split(/\r?\n/)
                const obj = {}
                for (const ln of lines) {
                    const idx = ln.indexOf(":")
                    if (idx === -1) continue
                    const key = ln.slice(0, idx).trim()
                    const val = ln.slice(idx + 1).trim()
                    if (key) obj[key] = this._parseStringValue(val)
                }
                const nameFromFile = (f.name || "preset").replace(/\.[^/.]+$/, "")
                const normalized = {}
                for (const k of Object.keys(this.defaults)) {
                    if (typeof obj[k] !== 'undefined') normalized[k] = obj[k]
                }
                if (Object.keys(normalized).length === 0) return
                const presets = { ...(this.state.presets || {}) }
                presets[nameFromFile] = normalized
                this.setState({ presets }, () => this._savePresetsToStorage(presets))
            }
            reader.readAsText(f)
            ev.target.value = ""
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

        renderRadio(key, option, title = null) {
            const e = React.createElement;
            if (!title) title = option;
            const props = {
                id: `${key}-${option}`,
                name: key,
                value: option,
                checked: this.state[key] === option,
                onChange: () => this.setStateAndSync({ [key]: option }),
                type: "radio"
            };
            return e("div", {
                key: `${key}-${option}-radio`,
                style: {
                    marginTop: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    width: "100%"
                }
            },
                     title,
                     e("input", { style: { marginLeft: ".5em" }, ...props })
                    );
        }

        _setMultidrawLayer(i) {
            const active = getActiveLayer().activeLayer
            const id = active ? active.id : null
            const name = active && active.name ? (active.name.slice(7) || active.name) : "(layer)"
            const mLayers = Array.isArray(this.state.multidrawLayers) ? this.state.multidrawLayers.slice(0) : []
            const mNames = Array.isArray(this.state._multidrawLayerNames) ? this.state._multidrawLayerNames.slice(0) : []
            while (mLayers.length < this.state.multidrawCount) mLayers.push(null)
            while (mNames.length < this.state.multidrawCount) mNames.push("")
            mLayers[i] = id
            mNames[i] = name
            this.setStateAndSync({ multidrawLayers: mLayers, _multidrawLayerNames: mNames })
        }

        _resetMultidrawLayer(i) {
            const mLayers = Array.isArray(this.state.multidrawLayers) ? this.state.multidrawLayers.slice(0) : []
            const mNames = Array.isArray(this.state._multidrawLayerNames) ? this.state._multidrawLayerNames.slice(0) : []
            while (mLayers.length < this.state.multidrawCount) mLayers.push(null)
            while (mNames.length < this.state.multidrawCount) mNames.push("")
            mLayers[i] = null
            mNames[i] = ""
            this.setStateAndSync({ multidrawLayers: mLayers, _multidrawLayerNames: mNames })
        }

        render() {
            const e = React.createElement
            const presets = this.state.presets || {}
            const presetNames = Object.keys(presets)
            const mdCount = Math.max(1, parseInt(this.state.multidrawCount || 1, 10))
            const mdOffsets = Array.isArray(this.state.multidrawOffsets) ? this.state.multidrawOffsets.slice(0) : []
            while (mdOffsets.length < mdCount) mdOffsets.push(0)
            const mdLayers = Array.isArray(this.state.multidrawLayers) ? this.state.multidrawLayers.slice(0) : []
            const mdNames = Array.isArray(this.state._multidrawLayerNames) ? this.state._multidrawLayerNames.slice(0) : []
            while (mdNames.length < mdCount) mdNames.push(mdLayers[mdNames.length] ? "(layer)" : "")
            return e("div", { key: "smooth-pencil-root" }, [
                ...SLIDERS.map(s => this.renderSlider(s.key, { min: s.min, max: s.max, step: s.step }, s.label)),
                this.renderCheckbox("snapEnabled", "Line Snap"),
                this.state.snapEnabled ? this.renderSlider("snapRadius", { min: 0, max: 10, step: 0.1 }, "Snap Radius") : null,
                this.renderSlider("overrideWidth", { min: 0.01, max: 20, step: 0.01 }, "Width 🟩"),
                this.renderSlider("overrideMultiplier", { min: 0.01, max: 20, step: 0.01 }, "Multiplier 🟥"),
                this.renderSection("advancedOpen", "Advanced"),
                this.state.advancedOpen && e("div", { style: this.sectionBox }, [
                    this.renderCheckbox("crayon", "Crayon"),
                    this.state.crayon ? e("div", { style: this.sectionBox }, [
                        this.renderSlider("dots", { min: 1, max: 200, step: 1 }, "Dots"),
                        this.renderSlider("lineWidth", { min: 0, max: 12, step: 0.1 }, "Crayon Width"),
                        this.renderSlider("dotThickness", { min: 0.01, max: 4, step: 0.01 }, "Dot Thickness"),
                        this.renderSlider("thicknessVar", { min: 0, max: 1, step: 0.01 }, "Thickness Jitter"),
                        this.renderSlider("dotLength", { min: 0, max: 50, step: 0.01 }, "Fuzziness"),
                    ]) : null,
                    this.renderCheckbox("paintBrush", "Brush"),
                    this.state.paintBrush ? e("div", { style: this.sectionBox }, [
                        this.renderSlider("bristles", { min: 1, max: 20, step: 1 }, "Brush Bristles"),
                        this.renderSlider("brushSpread", { min: 0, max: 3, step: 0.05 }, "Brush Spread"),
                        this.renderSlider("bristleThickness", { min: 0.01, max: 5, step: 0.01 }, "Bristle Thickness"),
                        this.renderSlider("brushThicknessJitter", { min: 0, max: 1, step: 0.01 }, "Thickness Jitter"),
                    ]) : null,
                    // multicolor
                    this.renderCheckbox("multicolored", "Multicolor"),
                    this.state.multicolored ? e("div", { style: this.sectionBox }, [
                        this.renderRadio("multicolorMode", "loop", "Loop"),
                        this.renderRadio("multicolorMode", "boomerang", "Boomerang"),
                        this.renderRadio("multicolorMode", "random", "Random Color"),
                        this.renderRadio("multicolorMode", "penPressure", "Pen Pressure")
                    ]) : null,
                    // multidraw
                    this.renderCheckbox("multidraw", "Multidraw"),
                    this.state.multidraw ? e("div", { style: this.sectionBox }, [
                        this.renderSlider("multidrawCount", { min: 1, max: 8, step: 1 }, "Lines to draw"),
                        e("div", { style: { marginTop: "6px" } },
                          Array.from({ length: mdCount }).map((_, i) => e("div", { key: "md-"+i, style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" } }, [
                            e("div", null, `#${i+1}`),
                            e("input", { type: "range", min: -50, max: 50, step: 0.1, value: mdOffsets[i] || 0, onChange: ev => {
                                const arr = Array.isArray(this.state.multidrawOffsets) ? this.state.multidrawOffsets.slice(0) : []
                                while (arr.length < mdCount) arr.push(0)
                                arr[i] = parseFloatOrDefault(ev.target.value, 0)
                                this.setStateAndSync({ multidrawOffsets: arr })
                            }, style: { flex: "1 1 auto" } }),
                            e("input", { type: "number", value: mdOffsets[i] || 0, onChange: ev => {
                                const arr = Array.isArray(this.state.multidrawOffsets) ? this.state.multidrawOffsets.slice(0) : []
                                while (arr.length < mdCount) arr.push(0)
                                arr[i] = parseFloatOrDefault(ev.target.value, 0)
                                this.setStateAndSync({ multidrawOffsets: arr })
                            }, style: { width: "5.5em" } }),
                            e("button", { onClick: () => this._setMultidrawLayer(i) }, "Set Layer"),
                            e("button", { onClick: () => this._resetMultidrawLayer(i) }, "⟳"),
                            e("div", { style: { minWidth: "7em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, mdNames[i] || (mdLayers[i] ? String(mdLayers[i]) : "(none)"))
                        ]))
                         ),
                        this.renderCheckbox("multidrawPenPressure", "Pen Pressure (multidraw)")
                    ]) : null,
                    // pen pressure
                    this.renderCheckbox("penPressure", "Pen Pressure"),
                    this.state.penPressure ? this.renderSlider("penIntensity", { min: 0, max: 2, step: 0.01 }, "Pen Intensity") : null,
                    // dotted line
                    this.renderCheckbox("dottedLine", "Dotted Line"),
                    this.state.dottedLine ? this.renderSlider("dottedLength", { min: 0, max: 1, step: 0.01 }, "Dotted Length") : null,
                    // random
                    this.renderCheckbox("randomMode", "Random"),
                    this.state.randomMode ? this.renderSlider("random", { min: 0, max: 10, step: 1 }, "Random (px)") : null,
                    // xy
                    this.renderCheckbox("xy", "XY"),
                ]),
                e("div", { key: "reset", style: { marginTop: "8px" } }, e("button", { onClick: () => this.onResetAll() }, "Reset All")),
                this.renderSection("presetsOpen", "Presets"),
                this.state.presetsOpen && e("div", { style: this.sectionBox }, [
                    e("div", { key: "presets", style: { marginTop: "10px", borderTop: "1px solid #eee", paddingTop: "8px" } }, [
                        e("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" } }, [
                            e("input", { type: "text", placeholder: "preset name", value: this.state.presetName || "", onChange: ev => this.setState({ presetName: ev.target.value }) , style: { flex: "1 1 auto" } }),
                            e("button", { onClick: () => this.onSavePreset() }, "Save")
                        ]),
                        e("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [
                            e("select", { value: this.state._selectedPreset || (presetNames[0] || ""), onChange: ev => this.setState({ _selectedPreset: ev.target.value }), style: { minWidth: "8em" } },
                              presetNames.length ? presetNames.map(n => e("option", { key: n, value: n }, n)) : [ e("option", { key: "__none", value: "" }, "(no presets)") ]
                             ),
                            e("button", {
                                onClick: () => {
                                    const sel = this.state._selectedPreset || (presetNames[0] || "")
                                    if (sel) this.onLoadPreset(sel)
                                }
                            }, "Load"),
                            e("button", {
                                onClick: () => {
                                    const sel = this.state._selectedPreset || (presetNames[0] || "")
                                    if (sel) this.onRemovePreset(sel)
                                }
                            }, "Delete"),
                            e("button", {
                                onClick: () => {
                                    const sel = this.state._selectedPreset || (presetNames[0] || "")
                                    if (sel) this.onDownloadPreset(sel)
                                }
                            }, "Download"),
                            e("label", { style: { display: "inline-block", padding: "6px 8px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" } }, "Upload",
                              e("input", { type: "file", accept: ".txt", style: { display: "none" }, onChange: ev => this.onUploadPresetFile(ev) })
                             )
                        ])
                    ])
                ]),
            ])
        }
    }

    window.registerCustomTool(TOOL_ID, SmoothPencilTool, SmoothPencilComponent)
}

if (window.registerCustomTool) main(); else {
    const prevCb = window.onCustomToolsApiReady
    window.onCustomToolsApiReady = () => { if (prevCb) prevCb(); main() }
}
