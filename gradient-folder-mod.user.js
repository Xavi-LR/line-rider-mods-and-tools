// ==UserScript==
// @name         gradient folder mod
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  sets selected lines to active folder's layers in order by xy position or line id + recolors those layers to gradient thing
// @version      0.1.1
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
})

const commitTrackChanges = () => ({
    type: "COMMIT_TRACK_CHANGES"
});

const revertTrackChanges = () => ({
  type: 'REVERT_TRACK_CHANGES'
})

const setSelectToolState = toolState => setToolState(SELECT_TOOL, toolState);

const getActiveTool = state => state.selectedTool;
const getToolState = (state, toolId) => state.toolState[toolId];
const getSelectToolState = state => getToolState(state, SELECT_TOOL);
const getSimulatorCommittedTrack = state => state.simulator.committedEngine;
const getLayers = state => state.simulator.engine.engine.state.layers.toArray();



class GradientMod {
  constructor (store, initState) {
    this.store = store;
    this.changed = false;
    this.state = initState;
    this.isRunningGradient = false; // guard flag

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
    if (nextState !== this.state) {
      this.state = nextState;
    }

    if (!this.state.active) {
      this.prevSelectedPoints = new Set();
      this.prevAngle = this.state.angle;
      this.prevDirectional = this.state.directional;
      this.prevSlice = this.state.slice;
      return;
    }

    const selectToolState = getSelectToolState(this.store.getState());
    const selectedPoints = selectToolState && selectToolState.selectedPoints ? selectToolState.selectedPoints : new Set();

    // detect changes
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





function main () {
  const {
    React,
    store
  } = window;

  const e = React.createElement;

  class GradientSelectModComponent extends React.Component {
    constructor (props) {
      super(props);


            this.defaults = {
                gradient: true,
                useFolders: true,
                topLayer: 0,
                bottomLayer: 0,
                skipUnchecked: false,
                directional: true,
                angle: 0,
                slice: false,
            };
            this.state = {
                ...this.defaults,
                dontUndo: false,
                active: false,
                animColor: "#000000",
                animColor2: "#000000",
                numLayers: getLayers(window.store.getState()).length,
            };

            this.mod = new GradientMod(store, this.state);
            window.runGradient = this.onGradient.bind(this);
    }

    componentDidUpdate(prevProps, prevState) {
      if (prevState !== this.state) {
        this.mod.state = this.state;
        this.mod.onUpdate(this.state);
      }
    }

onGradient (sliceChanged) {
  const selectToolActive = getActiveTool(store.getState()) === SELECT_TOOL;
  if (!selectToolActive) return;

  const selectedPointsState = getSelectToolState(store.getState());
  const selectedPoints = selectedPointsState ? selectedPointsState.selectedPoints : new Set();
  if (!selectedPoints || selectedPoints.size === 0) return;

  const stateBefore = store.getState();
  const layers = stateBefore.simulator.engine.engine.state.layers.toArray();

  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = layers.findIndex(layer => layer.id === activeLayerId);
  const activeLayer = layers[activeLayerIndex];

if ((!sliceChanged && this.state.slice) || (sliceChanged && !this.state.slice)) {
if (!this.state.dontUndo) {
// need to undo last slice
  store.dispatch({ type: 'UNDO' });
}
}
  this.setState({ dontUndo: false });
  this.track = getSimulatorCommittedTrack(store.getState());
let selectedLines = [...selectedPoints]
  .map(point => point >> 1)
  .map(id => this.track.getLine(id))
  .filter(l => l);

const layerById = new Map(layers.map(l => [String(l.id), l]));

// folder layers (based on current layers / active layer)
let folderLayers = layers.filter(l => l.folderId === activeLayer.folderId);
if (folderLayers.length === 0) return;

if (this.state.skipUnchecked) {
  // keep only visible layers in the folder
  folderLayers = folderLayers.filter(l => !!l.visible);
  if (folderLayers.length === 0) return;

  // filter selected lines to those whose current layer is visible
  selectedLines = selectedLines.filter(line => {
    const layerObj = layerById.get(String(line.layer));
    return !!layerObj && !!layerObj.visible;
  });

  if (selectedLines.length === 0) return;
}

  const folderLength = folderLayers.length;

  const updatedLines = [];
  const newLines = [];

  // -------- NON-DIRECTIONAL MODE --------
  if (!this.state.directional) {
    const sorted = [...selectedLines].sort((a, b) => a.id - b.id);
    sorted.forEach((L, idx) => {
      // map idx to a layer index across folderLayers
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

    store.dispatch({
      type: 'UPDATE_LINES',
      payload: { linesToRemove: null, linesToAdd: updatedLines },
      meta: { name: 'SET_LINES' }
    });
    store.dispatch({ type: 'COMMIT_TRACK_CHANGES' });
    return;
  }

  // -------- DIRECTIONAL MODE --------

  // axis
  const radians = (this.state.angle || 0) * Math.PI / 180;
  const dirX = Math.cos(radians);
  const dirY = Math.sin(radians);

  // helpers to read coords (force x1,y1,x2,y2 shape)
  const readXY = L => {
    const x1 = Number(L.x1 ?? (L.p1 && L.p1.x) ?? 0);
    const y1 = Number(L.y1 ?? (L.p1 && L.p1.y) ?? 0);
    const x2 = Number(L.x2 ?? (L.p2 && L.p2.x) ?? 0);
    const y2 = Number(L.y2 ?? (L.p2 && L.p2.y) ?? 0);
    return { x1, y1, x2, y2 };
  };

  // compute min/max projection
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

    // non-slice
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
    const firstClone = {
      id: L.id,
      x1: a0.x, y1: a0.y, x2: b0.x, y2: b0.y,
      layer: targetLayer0.id
    };
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
  store.dispatch({
    type: 'UPDATE_LINES',
    payload: { linesToRemove: null, linesToAdd },
    meta: { name: 'SET_LINES' }
  });
  store.dispatch({ type: 'COMMIT_TRACK_CHANGES' });
}


onGetColor() {

  const stateBefore = store.getState();
  const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
  const layerIdsBefore = new Set(getSimulatorLayers.map(layer => layer.id));

  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
  const activeLayer = getSimulatorLayers[activeLayerIndex];

if (this.state.useFolders) {
  // collect folder layers in their original order
  const folderLayers = getSimulatorLayers.filter(l => l.folderId === activeLayer.folderId);
  if (folderLayers.length === 0) return;

  // pick first layer (or the first visible one if skipUnchecked)
  let firstPick = folderLayers[0];
  if (this.state.skipUnchecked) {
    const firstVisible = folderLayers.find(l => !!l.visible);
    if (firstVisible) firstPick = firstVisible;
    // if none visible, firstPick stays as the real first layer
  }

  // pick last layer (or the last visible one if skipUnchecked)
  let lastPick = folderLayers[folderLayers.length - 1];
  if (this.state.skipUnchecked) {
    const lastVisible = [...folderLayers].reverse().find(l => !!l.visible);
    if (lastVisible) lastPick = lastVisible;
    // if none visible, lastPick stays as the real last layer
  }

  this.setState({ animColor: (firstPick.name || '').substring(0, 7) });
  this.setState({ animColor2: (lastPick.name || '').substring(0, 7) });
} else {
this.setState({ animColor: getSimulatorLayers[this.state.bottomLayer].name.substring(0, 7) });
this.setState({ animColor2: getSimulatorLayers[this.state.topLayer].name.substring(0, 7) });
}
}


onChangeColor(color) {
  const stateBefore = store.getState();
  const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
  const layerIdsBefore = new Set(getSimulatorLayers.map(layer => layer.id));

  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
  const activeLayer = getSimulatorLayers[activeLayerIndex];

  let layerColor = color;
  let layers = [];

  // count how many layers are in the same folder as activeLayer
  let totalColors = 0;
    if (this.state.useFolders) {
  for (const layer of getSimulatorLayers) {
    if ((layer.folderId === activeLayer.folderId) && (!this.state.skipUnchecked || layer.visible)) {
      totalColors++;
      layers.push(layer);
    }
  }
    } else {
  let layerIdx = 0;
  for (const layer of getSimulatorLayers) {
    layerIdx++;
    if ((layerIdx >= this.state.bottomLayer && layerIdx <= this.state.topLayer) && (!this.state.skipUnchecked || layer.visible)) {
      totalColors++;
      layers.push(layer);
        }
  }
    }

  // assign gradient colors
  let colorIndex = 1;
  let index = 0;
  for (const layer of layers) {

    if (((layer.folderId === activeLayer.folderId) && this.state.useFolders) || (this.state.topLayer >= index && index >= this.state.bottomLayer && !this.state.useFolders)) {
      if (this.state.gradient) {

        // compute weight and mix
        const w = (colorIndex - 1) / (totalColors - 1);
        const c1 = hexToRgb(this.state.animColor);
        const c2 = hexToRgb(this.state.animColor2);

        const mixed = [
          Math.round(c1[0] * (1 - w) + c2[0] * w),
          Math.round(c1[1] * (1 - w) + c2[1] * w),
          Math.round(c1[2] * (1 - w) + c2[2] * w)
        ];

        layerColor = rgbToHex(...mixed);

        colorIndex++;
      }

      store.dispatch(renameLayer(layer.id, layerColor + layer.name.substring(7)));
    }
        index++;
  }

  store.dispatch(commitTrackChanges());
}


useLayerIndex(setTop, setBottom) {
  const stateBefore = store.getState();
  const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
  const layerIdsBefore = new Set(getSimulatorLayers.map(layer => layer.id));

  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
  const activeLayer = getSimulatorLayers[activeLayerIndex];

  let index = 0;
  let firstIndex = true;
  let finalIndex = 0;
  for (const layer of getSimulatorLayers) {
    if (layer.folderId === activeLayer.folderId) {
    if (firstIndex) {
    if (setBottom) {
this.setState({ bottomLayer: index });
      firstIndex = false;
    }
    }
      finalIndex = index;
    }
        index++;
  }
    if (setTop) {
this.setState({ topLayer: finalIndex});
    }

this.setState({ useFolders: false });
}
useFolders() {
this.setState({ useFolders: true });
}

onCopyActiveTop() {
  const stateBefore = store.getState();
  const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);

this.setState({ topLayer: activeLayerIndex });
}
onCopyActiveBottom() {
  const stateBefore = store.getState();
  const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);

this.setState({ bottomLayer: activeLayerIndex });
}

        onReset (key) {
            let changedState = {};
            changedState[key] = this.defaults[key];
            this.setState(changedState);
        }

        onActivate () {
            if (this.state.active) {
                this.setState({ active: false });
            } else {
                this.setState({ dontUndo: true });
                this.setState({ active: true });
            }
        }

    renderCheckbox(key, title = null) {
      if (!title) title = key;

      const props = {
        id: key,
        checked: this.state[key],
        onChange: e => this.setState({ [key]: e.target.checked }),
      };
      return e(
        "div",
        null,
        e("label", { style: { width: "4em" }, for: key }, title),
        e("input", { style: { marginLeft: ".5em" }, type: "checkbox", ...props }),
      );
    }

        renderSlider (key, props, title = null) {
            if (!title) title = key;
            props = {
                ...props,
                value: this.state[key],
                onChange: e => props.min <= e.target.value && e.target.value <= props.max && this.setState({ [key]: parseFloatOrDefault(e.target.value) })
            };

            const rangeProps = {
                ...props
            };
            const numberProps = {
                ...props
            };
            return e("div", null,
                     title,
                     e("input", { style: { width: "4em" }, type: "number", ...numberProps }),
                     e("input", { type: "range", ...rangeProps, onFocus: e => e.target.blur() }),
                     e("button", { onClick: () => this.onReset(key) }, "⟳")
                    );
        }

        render () {
    this.sectionBox = {
        border: "1px solid #ddd",
        padding: "8px",
        margin: "6px 0 12px 0",
        borderRadius: "6px",
        background: "#fafafa"
    };

    return e(
        "div",
        null,
        this.state.active && e(
            "div",
            { style: this.sectionBox },
            // Color Gradient checkbox
            this.renderCheckbox('gradient', 'Color Gradient'),

            // If using folders
            this.state.useFolders && e(
                "button",
                { onClick: () => this.useLayerIndex(true, true) },
                "🔲 Use Custom Top & Bottom ▲"
            ),

            // If not using folders: top/bottom controls
            !this.state.useFolders && e(
                "div",
                null,
                e("button", { onClick: () => this.useFolders() }, "☑️ Use Custom Top & Bottom ▼"),

                e(
                    "div",
                    null,
                    "Top Layer ",
                    e("input", {
                        style: { width: "4em" },
                        type: "number",
                        min: 0,
                        max: this.state.numLayers,
                        step: 1,
                        value: this.state.topLayer,
                        onChange: e => {
                            const v = parseFloatOrDefault(e.target.value);
                            if (0 <= v && v <= this.state.numLayers) {
                                this.setState({ topLayer: v });
                            }
                        }
                    }),
                    e("button", { onClick: () => this.onCopyActiveTop() }, "Set ⬆️ from Active"),
                    e("button", { onClick: () => this.useLayerIndex(true, false) }, "⟳")
                ),

                e(
                    "div",
                    null,
                    "Bottom Layer ",
                    e("input", {
                        style: { width: "4em" },
                        type: "number",
                        min: 0,
                        max: this.state.numLayers,
                        step: 1,
                        value: this.state.bottomLayer,
                        onChange: e => {
                            const v = parseFloatOrDefault(e.target.value);
                            if (0 <= v && v <= this.state.numLayers) {
                                this.setState({ bottomLayer: v });
                            }
                        }
                    }),
                    e("button", { onClick: () => this.onCopyActiveBottom() }, "Set ⬇️ from Active"),
                    e("button", { onClick: () => this.useLayerIndex(false, true) }, "⟳")
                )
            ),

            // Get Edge Colors, Skip Invisible Layers
            e(
                "div",
                null,
                e("button", { onClick: () => this.onGetColor() }, "Get Edge Colors")
            ),
            this.renderCheckbox('skipUnchecked', 'Skip Invisible Layers'),

            // If gradient mode: secondary color picker
            this.state.gradient && e(
                "input",
                {
                    type: "color",
                    style: { width: "2em", marginRight: ".5em" },
                    value: this.state.animColor2,
                    onChange: e => this.setState({ animColor2: e.target.value })
                }
            ),

            // primary color picker, set gradient, directional checkbox
            e("input", {
                type: "color",
                style: { width: "2em", marginRight: ".5em" },
                value: this.state.animColor,
                onChange: e => this.setState({ animColor: e.target.value })
            }),
            e("button", { onClick: () => this.onChangeColor(this.state.animColor) }, "Set Gradient"),
            this.renderCheckbox('directional', 'Directional'),

            // directional extras
            this.state.directional && e(
                "div",
                null,
                this.renderSlider("angle", { min: -180, max: 180, step: 1 }, "Gradient Angle"),
                this.renderCheckbox('slice', 'Slice lines')
            ),

            // Commit Slice button
            e("button", { onClick: () => this.setState({ dontUndo: true }) }, "Commit Slice")
        ),

        // Activation button
        e(
            "button",
            {
                style: {
                    backgroundColor: this.state.active ? "lightblue" : null
                },
                onClick: this.onActivate.bind(this)
            },
            "Folder Gradient Select Mod"
        )
    );
}
  }

  window.registerCustomSetting(GradientSelectModComponent);
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


/* utils */
function setsEqual (a, b) {
  if (a === b) {
    return true
  }
  if (a.size !== b.size) {
    return false
  }
  for (const x of a) {
    if (!b.has(x)) {
      return false
    }
  }
  return true
}

function parseFloatOrDefault (string, defaultValue = 0) {
    const x = parseFloat(string);
    return isNaN(x) ? defaultValue : x;
}

// turn hex into [r, g, b]
function hexToRgb(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  const bigint = parseInt(hex, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

// turn [r, g, b] back into hex
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}
