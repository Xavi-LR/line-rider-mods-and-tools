// ==UserScript==
// @name         gradient folder mod
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  sets selected lines to active folder's layers in order by xy position or line id + recolors those layers to gradient thing
// @version      0.3.0
// @icon         https://www.linerider.com/favicon.ico
// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*
// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/gradient-folder-mod.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/gradient-folder-mod.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

const SELECT_TOOL = "SELECT_TOOL";

const setToolState = (toolId, state) => ({
    type: "SET_TOOL_STATE",
    payload: state,
    meta: { id: toolId }
});

const renameLayer = (id, name) => ({
    type: "RENAME_LAYER",
    payload: { id, name }
});

const commitTrackChanges = () => ({ type: "COMMIT_TRACK_CHANGES" });

const setSelectToolState = toolState => setToolState(SELECT_TOOL, toolState);

const getActiveTool = state => state.selectedTool;
const getToolState = (state, toolId) => state.toolState[toolId];
const getSelectToolState = state => getToolState(state, SELECT_TOOL);
const getSimulatorCommittedTrack = state => state.simulator.committedEngine;
const getLayers = state => state.simulator.engine.engine.state.layers.toArray();

class GradientMod {
    constructor(store, initState) {
        this.store = store;
        this.changed = false;
        this.state = initState;
        this.isRunningGradient = false;
        this.prevSelectedPoints = new Set();
        this.prevAngle = this.state.angle;
        this.prevDirectional = this.state.directional;
        this.prevSlice = this.state.slice;
        this.track = getSimulatorCommittedTrack(this.store.getState());

        store.subscribeImmediate(() => {
            if (this.state.active) {
                const selectToolState = getSelectToolState(this.store.getState());
                if (selectToolState && selectToolState.status.pressed) {
                    this.store.dispatch(setSelectToolState({ status: { inactive: true } }));
                }
            }
            this.onUpdate();
        });
    }

    onUpdate(nextState = this.state) {
        if (nextState !== this.state) this.state = nextState;
        if (!this.state.active) {
            this.prevSelectedPoints = new Set();
            this.prevAngle = this.state.angle;
            this.prevDirectional = this.state.directional;
            this.prevSlice = this.state.slice;
            return;
        }

        const selectToolState = getSelectToolState(this.store.getState());
        const selectedPoints = selectToolState && selectToolState.selectedPoints ? selectToolState.selectedPoints : new Set();

        const selectedChanged = !setsEqual(this.prevSelectedPoints, selectedPoints);
        const angleChanged = this.prevAngle !== this.state.angle;
        const directionalChanged = this.prevDirectional !== this.state.directional;
        const sliceChanged = this.prevSlice !== this.state.slice;

        const anyChange = selectedChanged || angleChanged || directionalChanged || sliceChanged;

        if (selectedPoints.size > 0 && anyChange && !this.isRunningGradient) {
            this.isRunningGradient = true;
            window.runGradient(sliceChanged);
            this.isRunningGradient = false;

            this.prevSelectedPoints = new Set(selectedPoints);
            this.prevAngle = this.state.angle;
            this.prevDirectional = this.state.directional;
            this.prevSlice = this.state.slice;

            this.changed = false;
        }
    }
}

function main() {
    const { React, store } = window;
    const e = React.createElement;

    class GradientSelectModComponent extends React.Component {
        constructor(props) {
            super(props);

            this.defaults = {
                skipUnchecked: false,
                gammaCorrect: true,
                gamma: 2.2,
                directional: true,
                angle: 0,
                slice: false
            };

            this.state = {
                ...this.defaults,
                dontUndo: false,
                active: false,
                stops: [
                    { id: 0, pos: 0, color: "#000000" },
                    { id: 1, pos: 1, color: "#000000" }
                ],
                numLayers: getLayers(window.store.getState()).length
            };

            this.nextStopId = 2;

            this.mod = new GradientMod(store, this.state);
            window.runGradient = this.onGradient.bind(this);

            this.sliderRef = React.createRef();
            this.colorInputRef = React.createRef();
            this.draggingId = null;
            this.handleWindowMouseMove = this.handleWindowMouseMove.bind(this);
            this.handleWindowMouseUp = this.handleWindowMouseUp.bind(this);
        }

        componentDidUpdate(prevProps, prevState) {
            if (prevState !== this.state) {
                this.mod.state = this.state;
                this.mod.onUpdate(this.state);
            }
        }

        onGradient(sliceChanged) {
            const selectToolActive = getActiveTool(store.getState()) === SELECT_TOOL;
            if (!selectToolActive) return;

            const selectedPointsState = getSelectToolState(store.getState());
            const selectedPoints = selectedPointsState ? selectedPointsState.selectedPoints : new Set();
            if (!selectedPoints || selectedPoints.size === 0) return;

            store.dispatch({ type: 'REVERT_TRACK_CHANGES' });

            const stateBefore = store.getState();
            const committedTrack = getSimulatorCommittedTrack(stateBefore);
            const layers = stateBefore.simulator.engine.engine.state.layers.toArray();

            const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
            const activeLayerIndex = layers.findIndex(layer => layer.id === activeLayerId);
            const activeLayer = layers[activeLayerIndex];

            this.track = committedTrack;

            let selectedLines = [...selectedPoints].map(point => point >> 1).map(id => this.track.getLine(id)).filter(l => l);

            const layerById = new Map(layers.map(l => [String(l.id), l]));

            let folderLayers = layers.filter(l => l.folderId === activeLayer.folderId);
            if (folderLayers.length === 0) return;

            if (this.state.skipUnchecked) {
                folderLayers = folderLayers.filter(l => !!l.visible);
                if (folderLayers.length === 0) return;

                selectedLines = selectedLines.filter(line => {
                    const layerObj = layerById.get(String(line.layer));
                    return !!layerObj && !!layerObj.visible;
                });
                if (selectedLines.length === 0) return;
            }

            const folderLength = folderLayers.length;
            const updatedLines = [];
            const newLines = [];

            if (!this.state.directional) {
                const sorted = [...selectedLines].sort((a, b) => a.id - b.id);
                sorted.forEach((L, idx) => {
                    const folderOffset = Math.round(idx / (sorted.length - 1 || 1) * (folderLength - 1));
                    const targetLayer = folderLayers[Math.max(0, Math.min(folderOffset, folderLength - 1))];

                    const clone = {
                        id: L.id,
                        x1: L.x1 ?? L.p1?.x ?? 0,
                        y1: L.y1 ?? L.p1?.y ?? 0,
                        x2: L.x2 ?? L.p2?.x ?? 0,
                        y2: L.y2 ?? L.p2?.y ?? 0,
                        layer: targetLayer.id
                    };
                    if (typeof L.type !== 'undefined') clone.type = L.type;
                    if (typeof L.width !== 'undefined') clone.width = L.width;
                    if (typeof L.collidable !== 'undefined') clone.collidable = L.collidable;
                    updatedLines.push(clone);
                });

                store.dispatch({ type: 'UPDATE_LINES', payload: { linesToRemove: null, linesToAdd: updatedLines }, meta: { name: 'SET_LINES' } });
                store.dispatch({ type: 'COMMIT_TRACK_CHANGES' });
                return;
            }

            const radians = (this.state.angle || 0) * Math.PI / 180;
            const dirX = Math.cos(radians);
            const dirY = Math.sin(radians);

            const readXY = L => {
                const x1 = Number(L.x1 ?? (L.p1 && L.p1.x) ?? 0);
                const y1 = Number(L.y1 ?? (L.p1 && L.p1.y) ?? 0);
                const x2 = Number(L.x2 ?? (L.p2 && L.p2.x) ?? 0);
                const y2 = Number(L.y2 ?? (L.p2 && L.p2.y) ?? 0);
                return { x1, y1, x2, y2 };
            };

            let minProj = Infinity;
            let maxProj = -Infinity;
            if (this.state.slice) {
                for (const L of selectedLines) {
                    const c = readXY(L);
                    const p1 = c.x1 * dirX + c.y1 * dirY;
                    const p2 = c.x2 * dirX + c.y2 * dirY;
                    minProj = Math.min(minProj, p1, p2);
                    maxProj = Math.max(maxProj, p1, p2);
                }
            } else {
                for (const L of selectedLines) {
                    const c = readXY(L);
                    const mx = (c.x1 + c.x2) / 2;
                    const my = (c.y1 + c.y2) / 2;
                    const proj = mx * dirX + my * dirY;
                    minProj = Math.min(minProj, proj);
                    maxProj = Math.max(maxProj, proj);
                }
            }
            const gradientLength = maxProj - minProj;

            const projToFolderOffset = proj => {
                if (gradientLength === 0 || folderLength <= 1) return 0;
                let normalized = (proj - minProj) / gradientLength;
                if (normalized < 0) normalized = 0;
                if (normalized > 1) normalized = 1;
                const s = normalized * (folderLength - 1);
                return Math.round(s);
            };

            const EPS = 1e-10;

            for (const L of selectedLines) {
                const coords = readXY(L);
                const x1 = coords.x1, y1 = coords.y1, x2 = coords.x2, y2 = coords.y2;

                if (gradientLength === 0 || folderLength <= 1 || !this.state.slice) {
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const proj = mx * dirX + my * dirY;
                    const folderOffset = projToFolderOffset(proj);
                    const targetLayer = folderLayers[Math.max(0, Math.min(folderOffset, folderLength - 1))];
                    const clone = { id: L.id, x1, y1, x2, y2, layer: targetLayer.id };
                    if (typeof L.type !== 'undefined') clone.type = L.type;
                    if (typeof L.width !== 'undefined') clone.width = L.width;
                    if (typeof L.collidable !== 'undefined') clone.collidable = L.collidable;
                    updatedLines.push(clone);
                    continue;
                }

                const p1 = x1 * dirX + y1 * dirY;
                const p2 = x2 * dirX + y2 * dirY;
                const s1 = (p1 - minProj) / gradientLength * (folderLength - 1);
                const s2 = (p2 - minProj) / gradientLength * (folderLength - 1);
                const off1 = Math.round(s1);
                const off2 = Math.round(s2);

                if (off1 === off2) {
                    const targetLayer = folderLayers[Math.max(0, Math.min(off1, folderLength - 1))];
                    const clone = { id: L.id, x1, y1, x2, y2, layer: targetLayer.id };
                    if (typeof L.type !== 'undefined') clone.type = L.type;
                    if (typeof L.width !== 'undefined') clone.width = L.width;
                    if (typeof L.collidable !== 'undefined') clone.collidable = L.collidable;
                    updatedLines.push(clone);
                    continue;
                }

                const dx = x2 - x1;
                const dy = y2 - y1;
                const denom = dx * dirX + dy * dirY;
                if (Math.abs(denom) < 1e-12) {
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const proj = mx * dirX + my * dirY;
                    const folderOffset = projToFolderOffset(proj);
                    const targetLayer = folderLayers[Math.max(0, Math.min(folderOffset, folderLength - 1))];
                    const clone = { id: L.id, x1, y1, x2, y2, layer: targetLayer.id };
                    if (typeof L.type !== 'undefined') clone.type = L.type;
                    if (typeof L.width !== 'undefined') clone.width = L.width;
                    if (typeof L.collidable !== 'undefined') clone.collidable = L.collidable;
                    updatedLines.push(clone);
                    continue;
                }

                const low = Math.min(off1, off2);
                const high = Math.max(off1, off2);
                const cuts = [];
                for (let m = low; m < high; m++) {
                    const sBoundary = m + 0.5;
                    const normalizedBoundary = sBoundary / (folderLength - 1);
                    const projBoundary = minProj + normalizedBoundary * gradientLength;
                    const t = (projBoundary - p1) / denom;
                    if (t > 0 + EPS && t < 1 - EPS) {
                        const ix = x1 + t * dx;
                        const iy = y1 + t * dy;
                        cuts.push({ t, x: ix, y: iy, proj: projBoundary });
                    }
                }
                cuts.sort((a, b) => a.t - b.t);

                const pts = [];
                pts.push({ x: x1, y: y1, proj: p1 });
                for (const c of cuts) pts.push({ x: c.x, y: c.y, proj: c.proj });
                pts.push({ x: x2, y: y2, proj: p2 });

                if (pts.length <= 2) {
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const proj = mx * dirX + my * dirY;
                    const folderOffset = projToFolderOffset(proj);
                    const targetLayer = folderLayers[Math.max(0, Math.min(folderOffset, folderLength - 1))];
                    const clone = { id: L.id, x1, y1, x2, y2, layer: targetLayer.id };
                    if (typeof L.type !== 'undefined') clone.type = L.type;
                    if (typeof L.width !== 'undefined') clone.width = L.width;
                    if (typeof L.collidable !== 'undefined') clone.collidable = L.collidable;
                    updatedLines.push(clone);
                    continue;
                }

                const a0 = pts[0], b0 = pts[1];
                const midProj0 = (a0.proj + b0.proj) / 2;
                const folderOffset0 = projToFolderOffset(midProj0);
                const targetLayer0 = folderLayers[Math.max(0, Math.min(folderOffset0, folderLength - 1))];
                const firstClone = { id: L.id, x1: a0.x, y1: a0.y, x2: b0.x, y2: b0.y, layer: targetLayer0.id };
                if (typeof L.type !== 'undefined') firstClone.type = L.type;
                if (typeof L.width !== 'undefined') firstClone.width = L.width;
                if (typeof L.collidable !== 'undefined') firstClone.collidable = L.collidable;
                updatedLines.push(firstClone);

                for (let i = 1; i < pts.length - 1; i++) {
                    const a = pts[i], b = pts[i + 1];
                    const segDx = b.x - a.x, segDy = b.y - a.y;
                    const segLen2 = segDx * segDx + segDy * segDy;
                    if (segLen2 < 1e-10) continue;

                    const midProj = (a.proj + b.proj) / 2;
                    const folderOffset = projToFolderOffset(midProj);
                    const targetLayer = folderLayers[Math.max(0, Math.min(folderOffset, folderLength - 1))];
                    const seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer: targetLayer.id };
                    if (typeof L.type !== 'undefined') seg.type = L.type;
                    if (typeof L.width !== 'undefined') seg.width = L.width;
                    if (typeof L.collidable !== 'undefined') seg.collidable = L.collidable;
                    newLines.push(seg);
                }
            }

            const linesToAdd = [...updatedLines, ...newLines];
            store.dispatch({ type: 'UPDATE_LINES', payload: { linesToRemove: null, linesToAdd }, meta: { name: 'SET_LINES' } });
        }

        getColorAt(t) {
            const stopsSorted = [...this.state.stops].slice().sort((a, b) => a.pos - b.pos);
            if (stopsSorted.length === 0) return "#000000";
            const leftmost = stopsSorted[0];
            const rightmost = stopsSorted[stopsSorted.length - 1];

            if (t <= 0) return leftmost.color;
            if (t >= 1) return rightmost.color;

            for (const s of stopsSorted) if (Math.abs(s.pos - t) < 1e-12) return s.color;

            let left = leftmost;
            let right = rightmost;
            for (let i = 0; i < stopsSorted.length - 1; i++) {
                if (stopsSorted[i].pos <= t && t <= stopsSorted[i + 1].pos) {
                    left = stopsSorted[i];
                    right = stopsSorted[i + 1];
                    break;
                }
            }
            const denom = right.pos - left.pos;
            const local = denom === 0 ? 0 : (t - left.pos) / denom;

            const c1 = hexToRgb(left.color);
            const c2 = hexToRgb(right.color);

            if (this.state.gammaCorrect) {
                const gamma = this.state.gamma;
                const invGamma = 1 / gamma;
                const mixed = [0, 1, 2].map(i => {
                    const linear1 = Math.pow((c1[i] / 255), gamma);
                    const linear2 = Math.pow((c2[i] / 255), gamma);
                    const avgLinear = linear1 * (1 - local) + linear2 * local;
                    const val = Math.round(Math.pow(avgLinear, invGamma) * 255);
                    return Math.min(255, Math.max(0, val));
                });
                return rgbToHex(...mixed);
            } else {
                const mixed = [
                    Math.round(c1[0] * (1 - local) + c2[0] * local),
                    Math.round(c1[1] * (1 - local) + c2[1] * local),
                    Math.round(c1[2] * (1 - local) + c2[2] * local)
                ];
                return rgbToHex(...mixed);
            }
        }

        applyGradientToLayers() {
            const stateBefore = store.getState();
            const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
            const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
            const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
            const activeLayer = getSimulatorLayers[activeLayerIndex];

            let layers = [];
            for (const layer of getSimulatorLayers) {
                if ((layer.folderId === activeLayer.folderId) && (!this.state.skipUnchecked || layer.visible)) {
                    layers.push(layer);
                }
            }
            const totalColors = layers.length;
            if (totalColors === 0) return;

            let colorIndex = 1;
            let index = 0;
            for (const layer of layers) {
                if ((layer.folderId === activeLayer.folderId)) {
                    const denom = Math.max(1, totalColors - 1);
                    const w = (colorIndex - 1) / denom;
                    const layerColor = this.getColorAt(w);
                    store.dispatch(renameLayer(layer.id, layerColor + layer.name.substring(7)));
                    colorIndex++;
                }
                index++;
            }

            store.dispatch(commitTrackChanges());
        }

        onGetColor() {
            const stateBefore = store.getState();
            const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();

            const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
            const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
            const activeLayer = getSimulatorLayers[activeLayerIndex];

            const folderLayers = getSimulatorLayers.filter(l => l.folderId === activeLayer.folderId);
            if (folderLayers.length === 0) return;

            let firstPick = folderLayers[0];
            if (this.state.skipUnchecked) {
                const firstVisible = folderLayers.find(l => !!l.visible);
                if (firstVisible) firstPick = firstVisible;
            }

            let lastPick = folderLayers[folderLayers.length - 1];
            if (this.state.skipUnchecked) {
                const lastVisible = [...folderLayers].reverse().find(l => !!l.visible);
                if (lastVisible) lastPick = lastVisible;
            }

            const leftColor = (firstPick.name || '').substring(0, 7) || "#000000";
            const rightColor = (lastPick.name || '').substring(0, 7) || "#000000";

            const stops = [...this.state.stops];

            if (stops.length === 0) {
                stops.push({ id: this.nextStopId++, pos: 0, color: leftColor }, { id: this.nextStopId++, pos: 1, color: rightColor });
            } else if (stops.length === 1) {
                stops[0] = { ...stops[0], pos: 0, color: leftColor };
                stops.push({ id: this.nextStopId++, pos: 1, color: rightColor });
            } else {
                let minIdx = 0;
                let maxIdx = 0;
                for (let i = 1; i < stops.length; i++) {
                    if (stops[i].pos < stops[minIdx].pos) minIdx = i;
                    if (stops[i].pos > stops[maxIdx].pos) maxIdx = i;
                }
                stops[minIdx] = { ...stops[minIdx], pos: 0, color: leftColor };
                stops[maxIdx] = { ...stops[maxIdx], pos: 1, color: rightColor };
            }

            this.setState({ stops });
        }

        sliderClientToPos(clientX) {
            const rect = this.sliderRef.current && this.sliderRef.current.getBoundingClientRect();
            if (!rect) return 0;
            const x = clientX - rect.left;
            let p = x / rect.width;
            if (p < 0) p = 0;
            if (p > 1) p = 1;
            return p;
        }

        handleSliderDoubleClick(e) {
            const pos = this.sliderClientToPos(e.clientX);
            const color = this.getColorAt(pos);
            const stops = [...this.state.stops, { id: this.nextStopId++, pos, color }];
            this.setState({ stops });
        }

        startDragging(dragId, e) {
            e.preventDefault();
            this.draggingId = dragId;
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            if (this.sliderRef.current) this.sliderRef.current.style.cursor = 'grabbing';
            window.addEventListener('mousemove', this.handleWindowMouseMove);
            window.addEventListener('mouseup', this.handleWindowMouseUp);
        }

        handleWindowMouseMove(e) {
            if (this.draggingId == null) return;
            const pos = this.sliderClientToPos(e.clientX);
            const stops = [...this.state.stops];
            const idx = stops.findIndex(s => s.id === this.draggingId);
            if (idx === -1) return;
            stops[idx] = { ...stops[idx], pos };
            this.setState({ stops });
        }

        handleWindowMouseUp() {
            if (this.draggingId != null) {
                this.draggingId = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (this.sliderRef.current) this.sliderRef.current.style.cursor = '';
                window.removeEventListener('mousemove', this.handleWindowMouseMove);
                window.removeEventListener('mouseup', this.handleWindowMouseUp);
            }
        }

        handleStopLeftClick(id, e) {
            e.preventDefault();
            e.stopPropagation();
            const stops = this.state.stops;
            const stopIdx = stops.findIndex(s => s.id === id);
            if (stopIdx === -1) return;
            const stop = stops[stopIdx];
            const input = this.colorInputRef.current;
            if (!input) return;

            input.value = stop.color;
            input._editId = id;

            input.style.display = 'block';
            input.style.position = 'fixed';
            input.style.width = '28px';
            input.style.height = '28px';
            input.style.opacity = '0';
            input.style.border = '0';
            input.style.padding = '0';
            input.style.zIndex = '9999';
            input.focus();
            input.click();
        }

        handleColorInputChange(e) {
            const newColor = e.target.value;
            const editId = e.target._editId;
            if (typeof editId === 'number') {
                const stops = [...this.state.stops];
                const idx = stops.findIndex(s => s.id === editId);
                if (idx !== -1) {
                    stops[idx] = { ...stops[idx], color: newColor };
                    this.setState({ stops });
                }
            }
        }

        handleColorInputBlur() {
            const input = this.colorInputRef.current;
            if (input) {
                input.style.display = 'none';
                input.style.position = '';
                input.style.left = '';
                input.style.top = '';
                input.style.width = '';
                input.style.height = '';
                input.style.opacity = '';
                input.style.border = '';
                input.style.padding = '';
                input.style.zIndex = '';
                input._editId = undefined;
            }
        }

        handleStopRightClick(id, e) {
            e.preventDefault();
            e.stopPropagation();
            if (this.state.stops.length <= 2) return;
            const stops = this.state.stops.filter(s => s.id !== id);
            this.setState({ stops });
        }

        resetStopsToEndpoints() {
            this.setState({ stops: [{ id: this.nextStopId++, pos: 0, color: "#000000" }, { id: this.nextStopId++, pos: 1, color: "#000000" }] });
        }

        renderCheckbox(key, title = null) {
            if (!title) title = key;
            const props = { id: key, checked: this.state[key], onChange: e => this.setState({ [key]: e.target.checked }) };
            return e("div", null, e("label", { style: { width: "14em" }, htmlFor: key }, title), e("input", { style: { marginLeft: ".5em" }, type: "checkbox", ...props }));
        }

        renderSpacer(height = 8) {
            return e("div", { style: { height: `${height}px`, flex: "0 0 auto" } });
        }
        renderDivider(text, height = 1, color = "#ccc", margin = 8) {
            return e("div", {
                style: {
                    display: "flex",
                    alignItems: "center",
                    margin: `${margin}px 0`,
                    flex: "0 0 auto",
                    gap: "10px"
                }
            },
                     e("div", {
                style: {
                    height: `${height}px`,
                    backgroundColor: color,
                    flexGrow: 1
                }
            }),
                     e("span", {
                style: {
                    color: "#000",
                    whiteSpace: "nowrap",
                    fontWeight: "bold",
                }
            }, text),
                     e("div", {
                style: {
                    height: `${height}px`,
                    backgroundColor: color,
                    flexGrow: 1
                }
            })
                    );
        }

        renderSliderControl() {
            const displayStops = [...this.state.stops].slice().sort((a, b) => a.pos - b.pos);

            let gradientCss;
            if (this.state.gammaCorrect) {
                const N = 30;
                const parts = [];
                for (let i = 0; i < N; i++) {
                    const t = i / (N - 1);
                    parts.push(`${this.getColorAt(t)} ${Math.round(t * 100)}%`);
                }
                gradientCss = parts.join(', ');
            } else {
                const leftmost = displayStops[0];
                const rightmost = displayStops[displayStops.length - 1];
                const middle = displayStops.map(s => `${s.color} ${Math.round(s.pos * 100)}%`);
                const parts = [];
                if (leftmost) parts.push(`${leftmost.color} 0%`);
                for (let i = 0; i < middle.length; i++) {
                    const entry = middle[i];
                    const percent = parseInt(entry.replace(/.* (\d+)%/, "$1"), 10);
                    if (percent === 0 || percent === 100) continue;
                    parts.push(entry);
                }
                if (rightmost) parts.push(`${rightmost.color} 100%`);
                gradientCss = parts.join(', ');
            }

            const barStyle = {
                position: "relative",
                width: "100%",
                height: "28px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                background: `linear-gradient(90deg, ${gradientCss})`,
                userSelect: "none",
                margin: "6px 0"
            };

            const handleContainerStyle = { position: "absolute", left: 0, top: 0, height: "100%", width: "100%", pointerEvents: "none" };

            const handleStyleBase = {
                position: "absolute",
                top: "50%",
                transform: "translate(-50%,-50%)",
                pointerEvents: "auto",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.2)",
                cursor: "grab"
            };

            return e("div", null,
                     e("div", {
                ref: this.sliderRef,
                style: barStyle,
                onDoubleClick: e => this.handleSliderDoubleClick(e)
            },
                       e("div", { style: handleContainerStyle },
                         displayStops.map((s) => {
                const leftPercent = `${s.pos * 100}%`;
                const style = { ...handleStyleBase, left: leftPercent, background: s.color };
                return e("div", {
                    key: s.id,
                    title: `pos: ${Math.round(s.pos * 100)}%`,
                    style,
                    onMouseDown: (ev) => this.startDragging(s.id, ev),
                    onClick: (ev) => {
                        ev.stopPropagation();
                        if (ev.button === 0) this.handleStopLeftClick(s.id, ev);
                    },
                    onDoubleClick: (ev) => ev.stopPropagation(),
                    onContextMenu: (ev) => this.handleStopRightClick(s.id, ev)
                });
            })
                        )
                      ),
                     e("input", {
                ref: this.colorInputRef,
                type: "color",
                style: { display: "none" },
                onChange: (ev) => this.handleColorInputChange(ev),
                onInput: (ev) => this.handleColorInputChange(ev),
                onBlur: () => this.handleColorInputBlur()
            })
                    );
        }

        renderSlider(key, props, title = null) {
            if (!title) title = key;
            props = { ...props, value: this.state[key], onChange: e => props.min <= e.target.value && e.target.value <= props.max && this.setState({ [key]: parseFloatOrDefault(e.target.value) }) };
            const rangeProps = { ...props };
            const numberProps = { ...props };
            return e("div", null, title,
              e("input", { style: { width: "4em", marginLeft: "8px" }, type: "number", ...numberProps }),
              e("input", { type: "range", ...rangeProps, onFocus: e => e.target.blur()}),
              e("button", { onClick: () => this.onReset(key), style: { marginLeft: "8px" } }, "⟳"));
        }

        onReset(key) {
            let changedState = {};
            changedState[key] = this.defaults[key];
            this.setState(changedState);
        }

        onActivate() {
            if (this.state.active) this.setState({ active: false }); else { this.setState({ dontUndo: true }); this.setState({ active: true }); }
        }

        render() {
            this.sectionBox = { border: "1px solid #ddd", padding: "8px", margin: "6px 0 12px 0", borderRadius: "6px", background: "#fafafa" };

            return e("div", null,
              this.state.active &&
              e("div", { style: this.sectionBox },
                this.renderDivider("Layer Gradient"),
                this.renderCheckbox('skipUnchecked', 'Skip Invisible Layers'),
                this.renderSpacer(),
                this.renderCheckbox('gammaCorrect', 'Gamma-corrected Gradient'),
                this.state.gammaCorrect && this.renderSlider("gamma", { min: 2.0, max: 2.6, step: 0.2 }, "Absolute Cinema Level (γ)"),
                this.renderSliderControl(),
                e("div", { style: { display: "flex", justifyContent: "space-between" } },
                  e("button", { onClick: () => this.onGetColor() }, "Get Edge Colors"),
                  e("button", { onClick: () => this.applyGradientToLayers() }, "Set Gradient"),
                  e("button", { onClick: () => this.resetStopsToEndpoints() }, "Reset Stops"),
                 ),
                this.renderDivider("Line Selection"),
                this.renderCheckbox('directional', 'Directional'),
                this.state.directional &&
                e("div", null, this.renderSlider("angle", { min: -180, max: 180, step: 1 }, "Gradient Angle"),
                  this.renderSpacer(),
                  this.renderCheckbox('slice', 'Slice lines')),
                this.renderSpacer(),
                e("button", { onClick: () => { store.dispatch(commitTrackChanges()); store.dispatch({ type: 'REVERT_TRACK_CHANGES' }); } }, "Commit")
               ),
              e("button", { style: { backgroundColor: this.state.active ? "lightblue" : null }, onClick: this.onActivate.bind(this) }, "Folder Gradient Select Mod")
             );
        }
    }

    window.registerCustomSetting(GradientSelectModComponent);
}

if (window.registerCustomSetting) main(); else {
    const prevCb = window.onCustomToolsApiReady;
    window.onCustomToolsApiReady = () => { if (prevCb) prevCb(); main(); };
}

function setsEqual(a, b) {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

function parseFloatOrDefault(string, defaultValue = 0) {
    const x = parseFloat(string);
    return isNaN(x) ? defaultValue : x;
}

function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }).join("");
}
