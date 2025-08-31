// ==UserScript==

// @name         Layer Automation Animation Helper
// @namespace    https://www.linerider.com/
// @author       Malizma and now Xavi
// @description  x: the everything animate mod
// @version      2.0.1
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-xanimation-mod.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-xanimation-mod.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none

// ==/UserScript==

// jshint asi: true
// jshint esversion: 6

/* globals Millions, V2 */

/* constants */
const SELECT_TOOL = "SELECT_TOOL";
const EMPTY_SET = new Set();

/* actions */
const setLayerActive = (id) => ({
  type: "SET_LAYER_ACTIVE",
  payload: { id }
});

const setLayerEditable = (id, editable) => ({
  type: "SET_LAYER_EDITABLE",
  payload: { id, editable }
});

const setLayerVisible = (id, visible) => ({
  type: "SET_LAYER_VISIBLE",
  payload: { id, visible }
});

const renameLayer = (id, name) => ({
  type: "RENAME_LAYER",
  payload: { id, name }
});

const renameFolder = (id, name) => ({
  type: "RENAME_FOLDER",
  payload: { id, name }
});

const addLayer = (name, type) => ({
  type: "ADD_LAYER",
  payload: { name, type }
});

const moveLayer = (id, index) => ({
  type: "MOVE_LAYER",
  payload: { id, index }
});

const setTool = (tool) => ({
    type: "SET_TOOL",
    payload: tool
});

const updateLines = (linesToRemove, linesToAdd) => ({
    type: "UPDATE_LINES",
    payload: { linesToRemove, linesToAdd }
});

const addLines = (line) => updateLines(null, line, "ADD_LINES");

const commitTrackChanges = () => ({
    type: "COMMIT_TRACK_CHANGES"
});

const revertTrackChanges = () => ({
    type: "REVERT_TRACK_CHANGES"
});

const setEditScene = (scene) => ({
    type: "SET_RENDERER_SCENE",
    payload: { key: "edit", scene }
});

/* selectors */
const getActiveTool = state => state.selectedTool;
const getToolState = (state, toolId) => state.toolState[toolId];
const getSelectToolState = state => getToolState(state, SELECT_TOOL);
const getSimulatorCommittedTrack = state => state.simulator.committedEngine;
const getSimulatorLayers = state => state.simulator.engine.engine.state.layers.toArray();
const getEditorCamPos = state => state.camera.editorPosition;
const getPlayerIndex = state => state.player.index;
// const getSixtyEnabled = state => state.player.settings.interpolate === 60;

class AnimateMod {
    constructor (store, initState) {
        this.store = store;

        this.componentUpdateResolved = true;
        this.changed = false;
        this.state = initState;
        this.genCount = 1;

        this.layers = getSimulatorLayers(this.store.getState());
        this.track = getSimulatorCommittedTrack(this.store.getState());
//        this.sixty = getSixtyEnabled(this.store.getState());
        this.playerIndex = 0;
        this.selectedPoints = EMPTY_SET;

        store.subscribeImmediate(() => {
            if (this.componentUpdateResolved) {
                this.onUpdate();
            }
        });
    }

    commit () {
        if (this.changed) {
            this.store.dispatch(commitTrackChanges());
            this.store.dispatch(revertTrackChanges());
            this.store.dispatch(setEditScene(new Millions.Scene()));
            this.changed = false;
            this.genCount += 1;
            return true;
        }
    }

    onUpdate (nextState = this.state) {
        this.componentUpdateResolved = false;

        let shouldUpdate = false;

        if (this.state !== nextState) {
            this.state = nextState;
            shouldUpdate = true;
        }

        if (this.state.active) {

            const track = getSimulatorCommittedTrack(this.store.getState());

            if (this.track !== track) {
                this.track = track;
                shouldUpdate = true;
            }

            const layers = getSimulatorLayers(this.store.getState());

            if (layers && this.layers !== layers) {
                this.layers = layers;
                shouldUpdate = true;
            }

            const selectToolState = getSelectToolState(this.store.getState());
let selectedPoints = EMPTY_SET;
if (selectToolState) {
            selectedPoints = selectToolState.selectedPoints;
            if (!selectToolState.multi) {
                selectedPoints = EMPTY_SET;
            }
}

            if (!setsEqual(this.selectedPoints, selectedPoints)) {
                this.selectedPoints = selectedPoints;
                shouldUpdate = true;
            }
        }

        if (!shouldUpdate) {
            this.componentUpdateResolved = true;
            return;
        }

        if (this.changed) {
            this.store.dispatch(revertTrackChanges());
            this.store.dispatch(setEditScene(new Millions.Scene()));
            this.changed = false;
        }

        if (!this.active() || !(this.state.groupBegin <= this.state.layerOrigin && this.state.layerOrigin <= this.state.groupEnd)) {
            this.componentUpdateResolved = true;
            return;
        }
// Re-entrancy guard to avoid synchronous dispatch -> subscriber -> re-run recursion
if (this._transformInProgress) {
  console.warn("Transform already in progress — aborting to avoid re-entry.");
  return;
}
this._transformInProgress = true;
if (!this.state.manualSetBounds) {
this.setBoundsAndStartLayer();
}
try {
  let pretransformedLines = [...getLinesFromPoints(this.selectedPoints)]
    .map(id => this.track.getLine(id))
    .filter(l => l);

  const initCamera = getCameraPosAtFrame(this.playerIndex, this.track);

  const posttransformedLines = [];
  const startTime = performance.now();
  const allLines = [];
  const layersArray = getSimulatorLayers(this.store.getState());
  let layerIndex = this.state.layerOrigin;
  const inverse = this.state.inverse ? -1 : 1

  for (let i = 0; i < this.state.aLength - 1; i++) {
    layerIndex += 1 * this.state.aLayers * inverse;

    if (layerIndex > this.state.groupEnd) {
      layerIndex = this.state.groupBegin;
    }

    if (layerIndex < this.state.groupBegin) {
      layerIndex = this.state.groupEnd;
    }

    const preBB = getBoundingBox(pretransformedLines);
    const preCenter = new V2({
      x: preBB.x + 0.5 * preBB.width,
      y: preBB.y + 0.5 * preBB.height
    });

    const alongRot = this.state.alongRot * Math.PI / 180;
    const preTransform = buildRotTransform(-alongRot);
    const selectedLines = [];

    for (let line of pretransformedLines) {
      const p1 = preparePointAlong(
        new V2(line.p1),
        preCenter, this.state.alongPerspX, this.state.alongPerspY, preTransform
      );
      const p2 = preparePointAlong(
        new V2(line.p2),
        preCenter, this.state.alongPerspX, this.state.alongPerspY, preTransform
      );
      selectedLines.push({ original: line, p1, p2 });
    }

    const bb = getBoundingBox(selectedLines);

    const anchor = new V2({
      x: bb.x + (0.5 + this.state.anchorX) * bb.width,
      y: bb.y + (0.5 - this.state.anchorY) * bb.height
    });
    const nudge = new V2({
      x: this.state.nudgeXSmall + this.state.nudgeXBig,
      y: -1 * (this.state.nudgeYSmall + this.state.nudgeYBig)
    });

    const transform = this.getTransform();
    const transformedLines = [];

    const alongPerspX = this.state.alongPerspX * 0.01;
    const alongPerspY = this.state.alongPerspY * 0.01;
    const postTransform = buildRotTransform(alongRot);

    let perspX = this.state.perspX;
    let perspY = this.state.perspY;

    const perspSafety = Math.pow(10, this.state.perspClamping);

    if (this.state.relativePersp) {
      let perspXDenominator = bb.width * this.state.scale * this.state.scaleX;
      if (Math.abs(bb.width) < perspSafety) {
        perspXDenominator = perspSafety;
      }
      perspX = perspX / perspXDenominator;
      let perspYDenominator = bb.height * this.state.scale * this.state.scaleY;
      if (Math.abs(perspYDenominator) < perspSafety) {
        perspYDenominator = perspSafety;
      }
      perspY = perspY / perspYDenominator;
    } else {
      perspX = 0.01 * perspX;
      perspY = 0.01 * perspY;
    }

    // map layer.id -> index (computed once per outer iteration)
    const idToIndex = new Map(layersArray.map((l, i) => [l.id, i]));

    // iterate with index so randomness uses per-line index
    for (let lineIdx = 0; lineIdx < selectedLines.length; lineIdx++) {
      const line = selectedLines[lineIdx];

      // compute per-line random seeds and flags
      const baseId = Number(line.original.id) || 0;
      const shakeOffset = this.state.shake ? i * 1000 : 0;
      const seedBase = baseId + this.state.rSeed + shakeOffset;
      const accel = (Math.pow((i + 1), this.state.rAccel))

      // per-line random translation
      let extraNudgeX = 0;
      let extraNudgeY = 0;
      if (this.state.rMoveX !== 0) {
        extraNudgeX = accel * seedRandom(seedBase, this.state.rMoveX);
      }
      if (this.state.rMoveY !== 0) {
        extraNudgeY = accel * seedRandom(seedBase + 100, this.state.rMoveY);
      }

      let scaleRandomX = 1;
      let scaleRandomY = 1;
if (this.state.rScaleX !== 1) {
  if (this.state.rScaleX > 1) {
    // random between 1 and rScaleX
    const rand01 = (seedRandom(seedBase + 200, 1) + 1) / 2;
    scaleRandomX = (1 + rand01 * (this.state.rScaleX - 1));
  } else {
    // random between rScaleX and 1
    const rand01 = (seedRandom(seedBase + 200, 1) + 1) / 2;
    scaleRandomX = (this.state.rScaleX + rand01 * (1 - this.state.rScaleX));
  }
}

if (this.state.rScaleY !== 1) {
  if (this.state.rScaleY > 1) {
    // random between 1 and rScaleY
    const rand01 = (seedRandom(seedBase + 300, 1) + 1) / 2;
    scaleRandomY = (1 + rand01 * (this.state.rScaleY - 1));
  } else {
    // random between rScaleY and 1
    const rand01 = (seedRandom(seedBase + 300, 1) + 1) / 2;
    scaleRandomY = (this.state.rScaleY + rand01 * (1 - this.state.rScaleY));
  }
}

      // per-line random rotation (degrees -> radians)
      let rotRandomRad = 0;
      if (this.state.rRotate !== 0) {
        const rotDeg = accel * seedRandom(seedBase + 400, this.state.rRotate);
        rotRandomRad = rotDeg * Math.PI / 180;
      }

      // compute translation per-line
      const p1 = restorePoint(
        transformPersp(
          new V2(line.p1).sub(anchor).transform(transform),
          perspX, perspY, perspSafety
        ),
        anchor, postTransform, alongPerspX, alongPerspY, preCenter
      ).add(nudge).add(new V2({ x: extraNudgeX, y: extraNudgeY }));

      const p2 = restorePoint(
        transformPersp(
          new V2(line.p2).sub(anchor).transform(transform),
          perspX, perspY, perspSafety
        ),
        anchor, postTransform, alongPerspX, alongPerspY, preCenter
      ).add(nudge).add(new V2({ x: extraNudgeX, y: extraNudgeY }));

      // compute midpoint of this line (used as the center for per-line scale/rotate)
      const mid = new V2({
        x: 0.5 * (p1.x + p2.x),
        y: 0.5 * (p1.y + p2.y)
      });

      // apply per-line scale/rotate if enabled
      if (scaleRandomX !== 1 || scaleRandomY !== 1 || rotRandomRad !== 0) {
        const applyScaleRotate = (pt) => {
          // move into midpoint-local space
          const local = pt.sub(mid);
          // scale
          let x = local.x * scaleRandomX;
          let y = local.y * scaleRandomY;
          // rotate around line midpoint
          if (rotRandomRad !== 0) {
            const cos = Math.cos(rotRandomRad);
            const sin = Math.sin(rotRandomRad);
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            x = rx; y = ry;
          }
          return new V2({ x: x + mid.x, y: y + mid.y });
        };

        // replace p1/p2 with transformed versions
        const p1t = applyScaleRotate(p1);
        const p2t = applyScaleRotate(p2);
        // Assign back
        p1.x = p1t.x; p1.y = p1t.y;
        p2.x = p2t.x; p2.y = p2t.y;
      }

      // prepare jsonLine and determine target layer
      const jsonLine = line.original.toJSON();

      const originalLayerId = line.original.layer;
      const baseIndex = idToIndex.get(originalLayerId);
      let targetLayerId = originalLayerId;

      if (typeof baseIndex === "undefined") {
        console.warn("Could not find base index for layer id:", originalLayerId);
      } else {
        const step = (layerIndex - this.state.layerOrigin);
        const targetIndex = baseIndex + step;

        if (targetIndex < 0 || targetIndex >= layersArray.length) {
          console.warn("Computed targetIndex out of bounds:", targetIndex);
        } else {
          targetLayerId = layersArray[targetIndex].id;
        }
      }

      const offset = { x: 0, y: 0 };
      if (this.state.camLock) {
        const camera = getCameraPosAtFrame(this.playerIndex + i, this.track); // i * (this.sixty ? 2 / 3 : 1)
        offset.x = camera.x - initCamera.x;
        offset.y = camera.y - initCamera.y;
      }

      // compute width with potential random scale contribution (average of X/Y)
      const baseWidth = this.state.scaleWidth ? (jsonLine.width || 1) * Math.pow(this.state.scale, i + 1) : jsonLine.width;
      let widthWithRandom = baseWidth;
      if (scaleRandomX !== 1 || scaleRandomY !== 1) {
        const scaleAvg = (scaleRandomX + scaleRandomY) / 2;
        widthWithRandom = baseWidth * Math.pow(scaleAvg, i + 1);
      }

      transformedLines.push({
        ...jsonLine,
        layer: targetLayerId,
        id: null,
        x1: p1.x + offset.x,
        y1: p1.y + offset.y,
        x2: p2.x + offset.x,
        y2: p2.y + offset.y,
        width: this.state.rScaleWidth ? widthWithRandom : baseWidth
      });

      const newLine = Object.assign(Object.create(Object.getPrototypeOf(line.original)), line.original);
      newLine.p1 = p1;
      newLine.p2 = p2;
      posttransformedLines.push(newLine);
    } // end per-line loop

    // prepare for next iteration
    pretransformedLines = posttransformedLines.slice();
    posttransformedLines.length = 0;

    let endTime = performance.now();

    if (endTime - startTime > 5000) {
      console.error("Time exception: Operation took longer than 5000ms to complete");
      this.componentUpdateResolved = true;
      this.store.dispatch(revertTrackChanges());
      this.store.dispatch(setEditScene(new Millions.Scene()));
      return "Time";
    }

    // avoid push(...largeArray) — push items in a loop
    for (let k = 0; k < transformedLines.length; k++) {
      allLines.push(transformedLines[k]);
    }
  } // end outer for

  if (allLines.length > 0) {
    this.store.dispatch(addLines(allLines));
    this.changed = true;
  }
} finally {
  // clear re-entrancy guard no matter what
  this._transformInProgress = false;
}

        this.componentUpdateResolved = true;
    }

    getTransform () {
        let scaleX = this.state.scale * this.state.scaleX;
        if (this.state.flipX) {
            scaleX *= -1;
        }
        let scaleY = this.state.scale * this.state.scaleY;
        if (this.state.flipY) {
            scaleY *= -1;
        }
        const transform = buildAffineTransform(
            this.state.skewX, this.state.skewY,
            scaleX, scaleY,
            this.state.rotate * Math.PI / 180
        );
        return transform;
    }

    active () {
        return this.state.active && this.selectedPoints.size > 0 && (
            this.state.alongPerspX !== 0 || this.state.alongPerspY !== 0 ||
            this.state.alongRot !== 0 ||
            this.state.anchorX !== 0 || this.state.anchorY !== 0 ||
            this.state.skewX !== 0 || this.state.skewY !== 0 ||
            this.state.scaleX !== 1 || this.state.scaleY !== 1 || this.state.scale !== 1 ||
            this.state.flipX || this.state.flipY ||
            this.state.rotate !== 0 ||
            this.state.perspX || this.state.perspY ||
            this.state.nudgeXSmall !== 0 || this.state.nudgeXBig !== 0 ||
            this.state.nudgeYSmall !== 0 || this.state.nudgeYBig !== 0 ||
            this.state.aLength !== 1
        );
    }

setBoundsAndStartLayer () {

    const stateBefore = this.store.getState();
    const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
    const layerIdsBefore = new Set(getSimulatorLayers.map(layer => layer.id));

    const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
    const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
    const activeLayer = getSimulatorLayers[activeLayerIndex];

    this.state.layerOrigin = activeLayerIndex + 1;




    let minInd = Infinity;
    let maxInd = -Infinity;
  for (const layer of getSimulatorLayers) {
    let layerIndex = getSimulatorLayers.findIndex(layers => layers.id === layer.id);
    if (layer.folderId === activeLayer.folderId) {
        minInd = Math.min(layerIndex, minInd);
        maxInd = Math.max(layerIndex, maxInd);
    }
  }
if (!(minInd === Infinity)) {
    this.state.groupBegin = minInd + 1;
    this.state.groupEnd = maxInd + 1;
}

}

}

function main () {
    const {
        React,
        store
    } = window;

    const e = React.createElement;

    class XaviAnimateModComponent extends React.Component {
        constructor (props) {
            super(props);

this.defaults = {
  // === Animation Tools (animTools) ===
  animTools: true,

  manualSetBounds: false,
  groupBegin: 0,
  groupEnd: 0,
  layerOrigin: 0,

  oInvisFrames: false,
  updateALot: true,
  oEndFrame: false,
  oPrevFrames: false,
  oFramesLength: 1,
  oInverse: false,
  opacity: 0.5,

  autoLayerSync: false,
  autoLock: true,

  // === Animation Folder (folderSettings) ===
  folderSettings: false,

  // === Animation Layers (aLayersSection) ===
  aLayersSection: true,
  aFrames: 1,
  aFramesTemp: 1,
  aLayers: 1,
  editLayers: false,

  // === Transform Tools (transTools) ===
  aLength: 1,
  inverse: false,
  camLock: false,
  transTools: false,
  nudgeXSmall: 0,
  nudgeXBig: 0,
  nudgeYSmall: 0,
  nudgeYBig: 0,
  scaleX: 1,
  scaleY: 1,
  scale: 1,
  scaleWidth: false,
  rotate: 0,
  flipX: false,
  flipY: false,

  // === Adjust Origin (relativeTools) ===
  relativeTools: false,
  alongPerspX: 0,
  alongPerspY: 0,
  alongRot: 0,
  anchorX: 0,
  anchorY: 0,

  // === Warp Tools (warpTools) ===
  warpTools: false,
  relativePersp: true,
  perspClamping: -5,
  perspX: 0,
  perspY: 0,
  skewX: 0,
  skewY: 0,

  // === Translate Tools (translateTools) ===
  randomness: false,
  rAccel: 0,
  shake: false,
  rSeed: 0,
  rMoveX: 0,
  rMoveY: 0,
  rScaleX: 1,
  rScaleY: 1,
  rScaleWidth: false,
  rRotate: 0,
};

            this.state = {
                ...this.defaults,
                active: false,
                numLayers: getSimulatorLayers(store.getState()).length,
            };

            this.mod = new AnimateMod(store, this.state);

            store.subscribe(() => {
                const selectToolActive = getActiveTool(store.getState()) === SELECT_TOOL;

                const nextLayerCount = getSimulatorLayers(store.getState()).length;
                if(this.state.numLayers !== nextLayerCount) {
                    this.setState({ numLayers: nextLayerCount })
                    this.setState({ groupBegin: Math.min(this.state.groupBegin, nextLayerCount) });
                    this.setState({ groupEnd: Math.min(this.state.groupEnd, nextLayerCount) });
                    this.setState({ layerOrigin: Math.min(this.state.layerOrigin, nextLayerCount) });
                }
            });
        }

        componentWillUpdate (nextProps, nextState) {
            let error = this.mod.onUpdate(nextState);
            if (error) {
                this.setState({ active: false });
            }
        }

        onReset (key) {
            let changedState = {};
            if (key == "rSeed") {
            changedState[key] = Math.round(Math.random()*10000)
            } else {
            changedState[key] = this.defaults[key];
            }
            this.setState(changedState);
        }

        onResetAll () {
            this.setState({ ...this.defaults });
        }

        onCommit () {
            this.mod.commit();
            this.setState({
                // ...this.defaults,
                active: false
            });
        }

// find simulator layers + active layer info
getSimulatorLayers() {
  const stateBefore = store.getState();
  return stateBefore.simulator.engine.engine.state.layers.toArray();
}

getActiveLayer() {
  const layers = this.getSimulatorLayers();
  const stateBefore = store.getState();
  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeIndex = layers.findIndex(l => l.id === activeLayerId);
  return { layers, activeLayerId, activeIndex, activeLayer: layers[activeIndex] };
}

getFolderLayers() {
  const { layers, activeLayer } = this.getActiveLayer();
  if (!activeLayer) return [];
  return layers
    .map((layer, idx) => ({ layer, idx }))
    .filter(({ layer }) => layer.folderId === activeLayer.folderId);
}

parseLayerName(layer) {
  const raw = layer.name || "";
  const color = raw.substring(0, 7) || "#000000";
  let rest = raw.substring(7) || "";
  const m = rest.match(/^(.*?)(?:\.(\d+))?$/);
  const display = m ? m[1] : rest;
  const num = m && m[2] ? m[2] : null;
  return { color, displayName: (display || "(untitled)").trim(), number: num };
}

// returns array of { layer, idx } for a sequence starting at folderStartIndex (0-based) stepping by step
getSequenceForFolderIndex(folderStartIndex, step) {
  const folderLayers = this.getFolderLayers();
  if (!folderLayers.length) return [];
  const seq = [];
  for (let i = folderStartIndex; i < folderLayers.length; i += step) seq.push(folderLayers[i]);
  return seq;
}

toggleVisibleForSequence(folderStartIndex, step) {
  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  if (seq.length === 0) return;

  // Take the first layer's current state
  const firstLayer = seq[0].layer;
  const newVisible = !firstLayer.visible;

  // Apply the same state to all layers
  seq.forEach(({ layer }) => {
    store.dispatch(setLayerVisible(layer.id, newVisible));
  });
}

toggleEditableForSequence(folderStartIndex, step) {
  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  if (seq.length === 0) return;

  // Take the first layer's current state
  const firstLayer = seq[0].layer;
  const newEditable = !firstLayer.editable;

  // Apply the same state to all layers
  seq.forEach(({ layer }) => {
    store.dispatch(setLayerEditable(layer.id, newEditable));
  });
}

// rename sequence: prompt user for base name (without numeric suffix).
// newName will be applied as: color + baseName + "." + (1..n)
renameSequence(folderStartIndex, step) {
  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  if (!seq.length) return;
  // parse the color/prefix from first layer
  const first = seq[0].layer;
  const colorPrefix = (first.name || "").substring(0, 7) || "#000000";

  const currentParsed = this.parseLayerName(first);
  const defaultBase = currentParsed.displayName || "newName";
  const base = prompt("Rename animation frames (enter base name, numbers will be appended):", defaultBase);
  if (base === null) return; // cancelled

  // strip trailing dot+number if user typed it
  const baseClean = (base + "").replace(/\.(\d+)$/, "");

  // apply names sequentially starting at 1
  seq.forEach((item, i) => {
    const newName = `${colorPrefix}${baseClean}.${i + 1}`;
    store.dispatch(renameLayer(item.layer.id, newName));
  });
}

// After dispatching ADD_LAYER, call this to locate the new layer created with that name.
// It tries to pick the candidate within the same folder and closest to origIdx, excluding known IDs.
_findNewLayerCandidate(newName, folderId, origIdx, excludeIds = new Set()) {
  const layers = this.getSimulatorLayers();
  const candidates = layers
    .map((l, i) => ({ layer: l, idx: i }))
    .filter(({ layer }) => layer.name === newName && layer.folderId === folderId && !excludeIds.has(layer.id));
  if (!candidates.length) return null;
  // choose candidate with index closest to origIdx (this helps if there are many similarly-named layers)
  candidates.sort((a, b) => Math.abs(a.idx - origIdx) - Math.abs(b.idx - origIdx));
  return candidates[0].layer;
}

async copyAnimatedLayer(folderStartIndex, step) {
  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  if (!seq.length) return;

  // process descending global idx so moves don't disturb earlier insertion points
  const seqDesc = seq.slice().sort((a, b) => b.idx - a.idx);

  const createdIds = new Set();

  for (const item of seqDesc) {
    const orig = item.layer;
    const origName = orig.name || "";
    const colorPrefix = origName.substring(0, 7) || "#000000";
    const rest = origName.substring(7) || "";
    // parse base and numeric suffix
    const m = rest.match(/^(.*?)(?:\.(\d+))?$/);
    const base = (m && m[1]) ? m[1] : rest;
    const num = (m && m[2]) ? m[2] : null;

    // build copy name: insert " (Copy)" before .N if there is a suffix, else append
    const copyBase = `${base}${base ? " (Copy)" : "(Copy)"}`;
    const newName = num ? `${colorPrefix}${copyBase}.${num}` : `${colorPrefix}${copyBase}`;

    // dispatch addLayer
    store.dispatch(addLayer(newName, orig.type));

    // find created layer id (best effort)
    // prefer candidate within same folder and closest to orig.idx
    let candidate = this._findNewLayerCandidate(newName, orig.folderId, item.idx, createdIds);
    // fallback: find by name anywhere but not original id
    if (!candidate) {
      const layers = this.getSimulatorLayers();
      candidate = layers.find(l => l.name === newName && l.id !== orig.id && !createdIds.has(l.id));
    }
    if (!candidate) {
      console.warn("Could not find newly created layer for name", newName);
      continue;
    }

    // move it to immediately after the original layer (index + 1)
    // note: moveLayer expects new index position in global layers array
    const targetIndex = item.idx + 1;
    store.dispatch(moveLayer(candidate.id, targetIndex));

    createdIds.add(candidate.id);
  }
  this.setState((prev) => {
    const prevVal = parseInt(prev.aLayers, 10) || 1;
    return { aLayers: prevVal + 1 };
  });
}

setColorForSequence(folderStartIndex, step, color) {
  // color must be like "#RRGGBB"
  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  seq.forEach(({ layer }) => {
    const old = layer.name || "";
    const rest = old.substring(7) || "";
    const newName = `${color}${rest}`;
    store.dispatch(renameLayer(layer.id, newName));
  });
}

// Set aLayers by counting layers in active folder ending with ".1" (after color prefix)
copyLayerCount() {
  const folder = this.getFolderLayers();
  if (!folder || folder.length === 0) return;
  const count = folder.reduce((acc, { layer }) => {
    const raw = layer.name || "";
    const rest = raw.substring(7) || "";
    return acc + (/\.\s*1$|\.1$/u.test(rest) ? 1 : 0);
  }, 0);
  if (count > 0) {
    this.setState({ aLayers: count });
  }
}

// Try to get current frame number from known places in the store; fallback to 1
getCurrentFrameNumber() {
  const stateBefore = store.getState();
  const st = stateBefore?.simulator?.engine?.engine?.state || {};
  // check a few likely property names
  const candidates = [st.frame, st.currentFrame, st.frameIndex, st.currentFrameIndex, st.frameNumber];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 1) return Math.floor(c);
  }
  // if zero-based frame index found, try that (e.g., 0..n-1)
  const idxCandidates = [st.frameIndex0, st.frame0, st.index];
  for (const c of idxCandidates) {
    if (typeof c === "number" && Number.isFinite(c)) return Math.floor(c) + 1;
  }
  // fallback
  return 1;
}

moveLayerSequenceUp(folderStartIndex, step) {
  const folderLayers = this.getFolderLayers();
  if (!folderLayers.length) return;

  const neighborFolderIndex = folderStartIndex + 1; // visually above in the UI
  // boundary: if there's no neighbor above, do nothing
  if (neighborFolderIndex >= folderLayers.length) return;

  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  const neighborSeq = this.getSequenceForFolderIndex(neighborFolderIndex, step);
  if (!seq.length || !neighborSeq.length) return;

  const layers = this.getSimulatorLayers();
  const currentIds = layers.map(l => l.id);
  const newIds = currentIds.slice();

  const len = Math.min(seq.length, neighborSeq.length);
  for (let k = 0; k < len; ++k) {
    const aId = seq[k].layer.id; // current group element
    const bId = neighborSeq[k].layer.id; // neighbor-above group element
    const ai = newIds.indexOf(aId); // bro really named the constant after itself
    const bi = newIds.indexOf(bId);
    if (ai >= 0 && bi >= 0) {
      // swap positions in the desired array
      const tmp = newIds[ai];
      newIds[ai] = newIds[bi];
      newIds[bi] = tmp;
    }
  }

  // apply moves safely to transform currentIds -> newIds
  let working = currentIds.slice();
  for (let i = 0; i < newIds.length; ++i) {
    const desiredId = newIds[i];
    const curIdx = working.indexOf(desiredId);
    if (curIdx === -1) continue;
    if (curIdx === i) continue;
    store.dispatch(moveLayer(desiredId, i));
    // update working array to reflect the move
    working.splice(curIdx, 1);
    working.splice(i, 0, desiredId);
  }
}

moveLayerSequenceDown(folderStartIndex, step) {
  const folderLayers = this.getFolderLayers();
  if (!folderLayers.length) return;

  const neighborFolderIndex = folderStartIndex - 1; // visually below in the UI
  // boundary: if there's no neighbor below, do nothing
  if (neighborFolderIndex < 0) return;

  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  const neighborSeq = this.getSequenceForFolderIndex(neighborFolderIndex, step);
  if (!seq.length || !neighborSeq.length) return;

  const layers = this.getSimulatorLayers();
  const currentIds = layers.map(l => l.id);
  const newIds = currentIds.slice();

  const len = Math.min(seq.length, neighborSeq.length);
  for (let k = 0; k < len; ++k) {
    const aId = seq[k].layer.id; // current group element
    const bId = neighborSeq[k].layer.id; // neighbor-below group element
    const ai = newIds.indexOf(aId);
    const bi = newIds.indexOf(bId);
    if (ai >= 0 && bi >= 0) {
      // swap positions in the desired array
      const tmp = newIds[ai];
      newIds[ai] = newIds[bi];
      newIds[bi] = tmp;
    }
  }

  // apply moves safely to transform currentIds -> newIds
  let working = currentIds.slice();
  for (let i = 0; i < newIds.length; ++i) {
    const desiredId = newIds[i];
    const curIdx = working.indexOf(desiredId);
    if (curIdx === -1) continue;
    if (curIdx === i) continue;
    store.dispatch(moveLayer(desiredId, i));
    working.splice(curIdx, 1);
    working.splice(i, 0, desiredId);
  }
}

// Delete all frames of the animation layer
deleteSequence(folderStartIndex, step) {
  const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
  if (!seq.length) return;
  // Ask for confirmation (safer)
  if (!confirm(`Delete ${seq.length} frame(s) for this animation layer? This cannot be undone.`)) return;
  for (const item of seq) {
    store.dispatch({ type: "REMOVE_LAYER", payload: { id: item.layer.id } });
  }
  this.setState((prev) => {
    const prevVal = parseInt(prev.aLayers, 10) || 2;
    return { aLayers: prevVal - 1 };
  });
}

// automatic set active layer to animation frame
enableAutoLayerSync() {
this.setState({ autoLayerSync: true })
  if (this._autoLayerUnsub) return; // already enabled
  // remember last frame so we don't run on attach unnecessarily
  this._lastSyncedFrame = null;
  // subscribe to store changes
  this._autoLayerUnsub = store.subscribe(() => this._onStoreFrameChange());
  // run once on enable
  this._onStoreFrameChange();
}

// Call this to stop auto-syncing
disableAutoLayerSync() {
this.setState({ autoLayerSync: false })
  if (this._autoLayerUnsub) {
    try { this._autoLayerUnsub(); } catch (e) { /* ignore */ }
    this._autoLayerUnsub = null;
    this._lastSyncedFrame = null;
  }
}

_onStoreFrameChange() {
  try {
    const stateBefore = store.getState();

    // get current player/frame index (robust: prefer getPlayerIndex if available)
    const frameIndex = (typeof getPlayerIndex === "function")
      ? (getPlayerIndex(stateBefore) || 0)
      : (stateBefore && stateBefore.player && (stateBefore.player.index || 0)) || 0;

    // avoid repeat work
    if (this._lastSyncedFrame === frameIndex) return;
    this._lastSyncedFrame = frameIndex;

    // folder layers in render order (0..n-1)
    const folderLayers = this.getFolderLayers();
    if (!folderLayers || folderLayers.length === 0) return;

    // find the first (lowest index) visible layer in the folder for this frame
    let firstVisibleFolderIndex = -1;
    for (let i = 0; i < folderLayers.length; i++) {
      const id = folderLayers[i].layer.id;
      // call getLayerVisibleAtTime if available
      let visible = false;
      if (typeof getLayerVisibleAtTime === "function") {
        // getLayerVisibleAtTime expects (id, index)
        visible = !!getLayerVisibleAtTime(id, frameIndex);
      } else {
        // If function missing, bail out silently
        return;
      }
      if (visible) { firstVisibleFolderIndex = i; break; }
    }

    if (firstVisibleFolderIndex === -1) {
      // nothing visible at this frame in this folder
      return;
    }

    // compute animation frame (1-based)
    const aLayers = Math.max(1, parseInt(this.state.aLayers, 10) || 1);
    const animationFrame = Math.floor(firstVisibleFolderIndex / aLayers) + 1;

    // determine previous active layer's index within the folder (to preserve position within a frame)
    const activeLayerId = stateBefore?.simulator?.engine?.engine?.state?.activeLayerId;
    const prevFolderIndex = folderLayers.findIndex(f => f.layer.id === activeLayerId);
    const prevPositionWithinFrame = prevFolderIndex >= 0 ? (prevFolderIndex % aLayers) : 0;

    // compute target index within folder for same position but new animationFrame
    const targetIndexWithinFolder = (animationFrame - 1) * aLayers + prevPositionWithinFrame;

    // clamp / fallback: if target out-of-range, fall back to first index of that animation frame
    let chosen = null;
    if (targetIndexWithinFolder >= 0 && targetIndexWithinFolder < folderLayers.length) {
      chosen = folderLayers[targetIndexWithinFolder].layer;
    } else {
      const fallbackIndex = (animationFrame - 1) * aLayers;
      if (fallbackIndex >= 0 && fallbackIndex < folderLayers.length) {
        chosen = folderLayers[fallbackIndex].layer;
      }
    }

    if (!chosen) return;

    // If autoLock is enabled, lock previous active layer and unlock the new one.
    if (this.state.autoLock) {
      try {
        // lock previous active layer if it exists and is different from chosen
        if (activeLayerId && activeLayerId !== chosen.id) {
          store.dispatch(setLayerEditable(activeLayerId, false));
        }
        // ensure chosen layer is unlocked
        store.dispatch(setLayerEditable(chosen.id, true));
      } catch (err) {
        console.warn("autoLock: setLayerEditable error", err);
      }
    }

    // Only dispatch if different from currently active layer
    if (activeLayerId !== chosen.id) {
      store.dispatch(setLayerActive(chosen.id));
    }
  } catch (err) {
    console.warn("autoLayerSync error", err);
  }
}

_onInvisStoreChange(opts = {}) {
  try {
    const force = !!(opts && opts.force);

    // if not forced and feature disabled, do nothing
    if (!force && !this.state.oInvisFrames) return;

    const stateBefore = store.getState();

    // current frame
    const frameIndex = (typeof getPlayerIndex === "function")
      ? (getPlayerIndex(stateBefore) || 0)
      : (stateBefore && stateBefore.player && (stateBefore.player.index || 0)) || 0;

    // throttle by frame unless forced
    if (!force && this._lastInvisFrame === frameIndex) return;
    this._lastInvisFrame = frameIndex;

    const editorPos = getEditorCamPos(stateBefore);
    const allLines = window.Selectors.getSimulatorLines(store.getState()) || [];

    // filter nearby lines (keeps performance reasonable)
    const radius = 300;
    const radiusSq = radius * radius;
    const nearLines = allLines.filter(line => {
      if (!line || !line.p1 || !line.p2) return false;
      const dx1 = line.p1.x - editorPos.x, dy1 = line.p1.y - editorPos.y;
      const dx2 = line.p2.x - editorPos.x, dy2 = line.p2.y - editorPos.y;
      return (dx1*dx1 + dy1*dy1) <= radiusSq || (dx2*dx2 + dy2*dy2) <= radiusSq;
    });

    // layers, maps and helpers
    const layersArr = this.getSimulatorLayers();
    const idToIndex = new Map(layersArr.map((l, idx) => [l.id, idx]));
    if (typeof getLayerVisibleAtTime !== "function") {
      console.warn("Layer Automation has not yet been run");
      return;
    }

    // cache visibility now per layer
    const visibleNow = new Map();
    for (const l of layersArr) {
      try {
        visibleNow.set(l.id, !!getLayerVisibleAtTime(l.id, frameIndex));
      } catch (e) {
        visibleNow.set(l.id, true);
      }
    }

    const oPrev = !!this.state.oPrevFrames;
    const framesLen = Math.max(1, parseInt(this.state.oFramesLength, 10) || 1);

    // parse opacity state as 0..1 and clamp
    let p = parseFloat(this.state.opacity);
    if (!Number.isFinite(p)) p = 1;
    p = Math.max(0, Math.min(1, p));

    // compute original weight for a layer (1 = original color, 0 = white/skip)
    const computeOriginalWeight = (layerId) => {
      if (visibleNow.get(layerId)) return 1;
      if (!oPrev) return p;

      for (let d = 1; d <= framesLen; ++d) {
        const t = frameIndex - d;
        if (t < 0) continue;
        try {
          if (getLayerVisibleAtTime(layerId, t)) {
            const scale = 1 - (d - 1) / framesLen; // 1 .. 1/framesLen
            return p * scale;
          }
        } catch (e) {
          return p;
        }
      }
      return 0;
    };

    const sceneEntities = [];
    let entityIndex = 0;
    const maxLayerIdx = layersArr.length || 0;
    const VISIBLE_Z_OFFSET = (maxLayerIdx + 5) * 10000;

    for (const line of nearLines) {
      const lid = line.layer;
      if (typeof lid === "undefined" || lid === null) continue;

      const origWeight = computeOriginalWeight(lid);
      if (!origWeight) continue;

      // layer color
      const layerObj = layersArr.find(l => l.id === lid) || null;
      const hex = layerObj && (layerObj.name || "").substring(0,7);
      const rgb = this._hexToRgb(hex) || { r: 255, g: 255, b: 255 };

      // whiten factor = 1 - origWeight
      const whiten = Math.max(0, Math.min(1, 1 - origWeight));
      const blendToWhite = (component) => Math.round(component * (1 - whiten) + 255 * whiten);
      const blendedR = blendToWhite(rgb.r);
      const blendedG = blendToWhite(rgb.g);
      const blendedB = blendToWhite(rgb.b);

      // use full opaque alpha (255)
      const color = new Millions.Color(blendedR, blendedG, blendedB, 255);

      // thickness doubled
      const thickness = ((line.width && line.width > 0) ? line.width : 1) * 2;

      const p1 = { x: line.p1.x, y: line.p1.y, colorA: color, colorB: color, thickness };
      const p2 = { x: line.p2.x, y: line.p2.y, colorA: color, colorB: color, thickness };

      const layerIdx = (typeof idToIndex.get(lid) === "number") ? idToIndex.get(lid) : 0;
      const baseZ = layerIdx * 10000;
      const zIndex = (visibleNow.get(lid) ? (VISIBLE_Z_OFFSET + baseZ) : baseZ) + ((typeof line.id !== "undefined" && line.id !== null) ? (line.id % 10000) : (entityIndex % 10000));

      const lineEntity = new Millions.Line(p1, p2, 1, zIndex);
      lineEntity.z = zIndex;
      sceneEntities.push(lineEntity);
      entityIndex += 1;
    }

    // sort and dispatch
    sceneEntities.sort((a, b) => (a.z || 0) - (b.z || 0));
    try {
      store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities(sceneEntities) } });
    } catch (err) {
      console.warn("error setting renderer scene:", err);
    }

  } catch (err) {
    console.warn("_onInvisStoreChange error", err);
  }
}

async commitAFrames() {
  const aLayers = Math.max(1, parseInt(this.state.aLayers, 10) || 1);
  const aFramesVal = Math.max(1, parseInt(this.state.aFramesTemp, 10) || 1);

  const desiredTotal = aLayers * aFramesVal;
  const folderLayers = this.getFolderLayers(); // returns [{layer, idx}, ...]
  const currentTotal = folderLayers.length;

  // fast lookup for folder global positions
  const layersGlobal = this.getSimulatorLayers();

  // helper to find candidate new layer after add (uses existing helper if present)
  const createdIds = new Set();

  // If no change, still set state and return
  if (desiredTotal === currentTotal) {
    this.setState({ aFrames: aFramesVal });
    return;
  }

  // --- ADD layers if needed ---
  if (desiredTotal > currentTotal) {
    let insertGlobalIndex;
    if (folderLayers.length === 0) {
      // no folder layers: append to end of global layers
      insertGlobalIndex = layersGlobal.length;
    } else {
      // insert after the last folder layer
      insertGlobalIndex = folderLayers[folderLayers.length - 1].idx + 1;
    }

    for (let pos = currentTotal; pos < desiredTotal; ++pos) {
      const seqIndex = pos % aLayers; // which sequence index (0..aLayers-1)
      const frameNum = Math.floor(pos / aLayers) + 1; // 1-based frame number

      let base = folderLayers[seqIndex] && folderLayers[seqIndex].layer;
      // fallback if folder shorter than aLayers (very edge-case)
      if (!base && folderLayers.length > 0) base = folderLayers[0].layer;

      // fallback defaults when folder empty entirely
      const colorPrefix = base ? (base.name || "").substring(0, 7) || "#000000" : "#000000";
      const parsedBase = base ? this.parseLayerName(base) : { displayName: "layer", number: null };
      const baseName = parsedBase.displayName || "layer";
      const type = base ? base.type : "Layer"; // fallback type

      // build new layer name: color + baseName + '.' + frameNum
      const newName = `${colorPrefix}${baseName}.${frameNum}`;

      // dispatch add
      store.dispatch(addLayer(newName, type));

      // locate created layer (best-effort)
      let candidate = this._findNewLayerCandidate(newName, (base && base.folderId) || (folderLayers[0] && folderLayers[0].layer.folderId) || null, insertGlobalIndex, createdIds);
      if (!candidate) {
        // fallback: search by name in whole list excluding known ids
        const after = this.getSimulatorLayers();
        candidate = after.find(l => l.name === newName && !createdIds.has(l.id));
      }
      if (!candidate) {
        console.warn("commitAFrames: could not find created layer for", newName);
        continue;
      }

      // move created layer to insertGlobalIndex (so it appears in folder order)
      store.dispatch(moveLayer(candidate.id, insertGlobalIndex));

      // update createdIds and bump insert index so next insert goes after it
      createdIds.add(candidate.id);
      insertGlobalIndex += 1;

      // also append to folderLayers to keep subsequent iterations consistent
      folderLayers.push({ layer: candidate, idx: insertGlobalIndex - 1 });
    }
  } else {
    // --- REMOVE layers if needed (confirm because destructive) ---
    const toRemove = folderLayers.slice(desiredTotal).map(f => f.layer.id);
    if (toRemove.length === 0) {
      this.setState({ aFrames: aFramesVal });
      return;
    }

    const ok = confirm(`This will delete ${toRemove.length} layer(s) from this folder (frames beyond ${aFramesVal}). Are you sure?`);
    if (!ok) return;

    // remove from last -> first to avoid reindex problems
    for (let i = toRemove.length - 1; i >= 0; --i) {
      const id = toRemove[i];
      store.dispatch({ type: "REMOVE_LAYER", payload: { id } });
    }
  }

  // commit success: update state.aFrames to chosen value
  this.setState({ aFrames: aFramesVal });
}

// parse folder name into base + loop/modifiers
parseFolderLoopSettings(folderName) {
  const defaults = {
    baseName: folderName || "",
    loopEnabled: false,
    time: 1, //         T#
    length: 1, //       L#
    frameOffset: 0, //  F#
    jump: 1, //         J#
    loops: 0, //        X#
    grow: false //      G
  };

  if (!folderName) return defaults;

  const idx = folderName.indexOf(".loop");
  if (idx === -1) {
    // no .loop -> return base only
    return { ...defaults, baseName: folderName };
  }

  const baseName = folderName.substring(0, idx);
  const suffix = folderName.substring(idx + 5); // after ".loop"

  // find modifiers T(-?\d+), L(-?\d+), F(-?\d+), J(-?\d+), and presence of G
  const getNum = (ch) => {
    const m = suffix.match(new RegExp(`${ch}(-?\\d+)`));
    return m ? parseInt(m[1], 10) : undefined;
  };

  const time = getNum("T");
  const length = getNum("L");
  const frameOffset = getNum("F");
  const jump = getNum("J");
  const loops = getNum("X");
  const grow = /G\b/.test(suffix);

  return {
    baseName: baseName,
    loopEnabled: true,
    time: typeof time === "number" ? time : 1,
    length: typeof length === "number" ? length : 1,
    frameOffset: typeof frameOffset === "number" ? frameOffset : 0,
    jump: typeof jump === "number" ? jump : 1,
    loops: typeof loops === "number" ? loops : 0,
    grow: !!grow
  };
}

// compose a folder name from base + settings
buildFolderLoopName(baseName, settings) {
  baseName = (baseName || "").trim() || "folder";
  const s = settings || {};
  if (!s.loopEnabled) return baseName;

  // only include modifiers that differ from defaults
  let suffix = ".loop";
  if (typeof s.time === "number" && s.time !== 1) suffix += `T${s.time}`;
  if (typeof s.length === "number" && s.length !== 1) suffix += `L${s.length}`;
  if (typeof s.frameOffset === "number" && s.frameOffset !== 0) suffix += `F${s.frameOffset}`;
  if (typeof s.jump === "number" && s.jump !== 1) suffix += `J${s.jump}`;
  if (typeof s.loops === "number" && s.loops !== 0) suffix += `X${s.loops}`;
  if (s.grow) suffix += `G`;
  return baseName + suffix;
}

// convenience: find the active folder object (returns {layer, idx} or null)
getActiveFolder() {
  const stateBefore = store.getState();
  const getSimulatorLayers = stateBefore.simulator.engine.engine.state.layers.toArray();
  const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
  const activeLayerIndex = getSimulatorLayers.findIndex(layer => layer.id === activeLayerId);
  const activeLayer = getSimulatorLayers[activeLayerIndex];
  if (!activeLayer) return null;
  const folderId = activeLayer.folderId;
  if (!folderId) return null;
  const folderIdx = getSimulatorLayers.findIndex(l => l.id === folderId);
  if (folderIdx === -1) return null;
  return { folder: getSimulatorLayers[folderIdx], idx: folderIdx };
}

updateFolderLoopName(newBaseOrSettings) {
  const active = this.getActiveFolder();
  if (!active || !active.folder) return;
  const folder = active.folder;
  // allow passing either (baseName, settings) or settings object that includes baseName
  let baseName, settings;
  if (typeof newBaseOrSettings === "string") {
    // just baseName passed
    settings = this.parseFolderLoopSettings(folder.name);
    baseName = newBaseOrSettings;
    settings.baseName = baseName;
  } else {
    settings = newBaseOrSettings;
    baseName = settings.baseName !== undefined ? settings.baseName : this.parseFolderLoopSettings(folder.name).baseName;
  }

  const newName = this.buildFolderLoopName(baseName, settings);
  // dispatch rename (use your existing rename action)
  store.dispatch(renameFolder(folder.id, newName));
}

scanForAnimatedFolders() {
  const state = store.getState();
  const layers = state.simulator.engine.engine.state.layers.toArray();

  let animatedFolders = [];

  // small gcd helper for computing cycle length
  const gcd = (a, b) => {
    a = Math.abs(a); b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  };

  for (const folder of layers) {
    // parseFolderLoopSettings returns { baseName, loopEnabled, time, length, frameOffset, jump, loops, grow }
    const parsed = this.parseFolderLoopSettings(folder.name || "");
    if (!parsed || !parsed.loopEnabled) continue; // skip non-loop folders

    // gather direct children of this folder (in render order)
    const children = layers.filter(l => l.folderId === folder.id);
    if (!children || children.length === 0) continue;

    // normalize opts object to the older structure used by visible function
    const opts = {
      time: parsed.time,
      length: parsed.length,
      offset: parsed.frameOffset,
      jump: parsed.jump,
      loops: parsed.loops,
      grow: parsed.grow,
    };

    animatedFolders.push({
      folderId: folder.id,
      opts,
      childLayerIds: children.map(l => l.id),
    });
  }

  console.log("Found animated folders:", animatedFolders);

  // Define visibility override for Line Rider
  window.getLayerVisibleAtTime = (id, frame) => {
    for (const folderObj of animatedFolders) {
      const { opts, childLayerIds } = folderObj;
      const indexInGroup = childLayerIds.indexOf(id);
      if (indexInGroup === -1) continue;

      const groupLength = childLayerIds.length;
      // safety: avoid divide by zero etc
      if (groupLength <= 0) break;

      // apply offset directly (can be negative)
      const adjFrame = frame - (opts.offset || 0);

      // compute step number (can be negative if adjFrame < 0)
      let step = Math.floor(adjFrame / opts.time);

      // If loops is finite (>0) we need to limit the maximum allowed step
      // compute number of steps that constitute one full cycle:
      // when startIndex increments by jump each step, the number of steps
      // until return to original is groupLength / gcd(groupLength, jump)
      const cycleSteps = groupLength / gcd(groupLength, opts.jump);

      if (opts.loops && opts.loops > 0) {
        const maxSteps = opts.loops * cycleSteps;
        // If step is negative, it is outside the forward looping window.
        // For simplicity, treat negative step as "not visible" when loops>0.
        if (step < 0) return false;
        if (step >= maxSteps) return false;
      }

      // For negative step but infinite loops, map step into a positive domain for indexing
      // so negative frames can wrap correctly for visibility decisions
      let wrappedStepForIndexing = step;
      if (wrappedStepForIndexing < 0) {
        wrappedStepForIndexing = ((wrappedStepForIndexing % cycleSteps) + cycleSteps) % cycleSteps;
      }

      // compute starting index for this step (wrap modulo groupLength)
      const startIndex = (wrappedStepForIndexing * opts.jump) % groupLength;

      if (!opts.grow) {
        // non-grow: show 'length' consecutive items starting at startIndex
        for (let i = 0; i < opts.length; i++) {
          const visibleIndex = (startIndex + i) % groupLength;
          if (visibleIndex === indexInGroup) return true;
        }
        return false;
      }

      // grow mode: progressively reveal groups up to step*jump
      // for finite loops we've already handled step >= maxSteps above
      const maxI = wrappedStepForIndexing * opts.jump;
      for (let i = 0; i <= maxI; i++) {
        for (let j = 0; j < opts.length; j++) {
          const visibleIndex = (i + j) % groupLength;
          if (visibleIndex === indexInGroup) return true;
        }
      }
      return false;
    }

    // not part of any animated folder: signal fallback so the renderer can handle default visibility
    throw '__fallback_layer_render__';
  };
}

// small hex -> rgb helper. accepts "#RRGGBB" or "RRGGBB"
_hexToRgb(hex) {
  if (!hex) return null;
  hex = (hex + "").replace(/^#/, "");
  if (hex.length !== 6) return null;
  const r = parseInt(hex.substring(0,2), 16);
  const g = parseInt(hex.substring(2,4), 16);
  const b = parseInt(hex.substring(4,6), 16);
  if ([r,g,b].some(v => Number.isNaN(v))) return null;
  return { r, g, b };
}

// enable rendering of lines on hidden layers
enableOInvisFrames() {
  this.setState({ oInvisFrames: true });
  if (this._oInvisUnsub) return;
  this._lastInvisFrame = null;
  this._oInvisUnsub = store.subscribe(() => this._onInvisStoreChange());
  // run immediately
  this._onInvisStoreChange();
}

// disable the feature and clear scene
disableOInvisFrames() {
  this.setState({ oInvisFrames: false });
  if (this._oInvisUnsub) {
    try { this._oInvisUnsub(); } catch (e) { /* ignore */ }
    this._oInvisUnsub = null;
    this._lastInvisFrame = null;
  }
  // clear the edit scene so those overlay lines disappear
  try {
    store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities([]) } });
  } catch (e) {
    // ignore if Millions/renderer not present
  }
}

        onActivate () {
            if (this.state.active) {
                this.setState({ active: false });
            } else {
                this.setState({ active: true });
            }
        }

    renderSection(key, title) {
      return e(
        "div",
        null,
        e("button", {
          id: key,
          style: { background: "none", border: "none" },
          onClick: () => this.setState({ [key]: !this.state[key] }),
        }, this.state[key] ? "▲" : "▼"),
        e("label", { for: key }, title),
      );
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

renderFolderSlider(title, value, min, max, step, defaultValue, onChange) {
  // title: string label
  // value: number current value
  // onChange: function(newNumber)
  const isForever = title === "Loops" && Number(value) === 0;
  return e("div", null,
    title,
    // boxed number input or "Forever" box for Loops === 0
    isForever
      ? e("input", {
          style: { width: "4em" },
          type: "text",
          value: "Forever",
          readOnly: true
        })
      : e("input", {
          style: { width: "4em" },
          type: "number",
          value: value,
          onChange: ev => {
            const v = parseInt(ev.target.value, 10);
            if (!Number.isFinite(v)) return;
            if (v < min || v > max) return;
            onChange(v);
          }
        }),

    // range
    e("input", {
      type: "range",
      min, max, step,
      value: value,
      onChange: ev => {
        const v = parseInt(ev.target.value, 10);
        if (!Number.isFinite(v)) return;
        onChange(v);
      },
      onFocus: ev => ev.target.blur()
    }),

    // reset button (sets to supplied default)
    e("button", { onClick: () => onChange(defaultValue) }, "⟳")
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

renderSpacer(height = 8) {
  return e("div", { style: { height: `${height}px`, flex: "0 0 auto" } });
}


        render () {
if (this.state.oInvisFrames && this.state.updateALot) {
this._onInvisStoreChange({ force: true })
}
this.sectionBox = {
  border: "1px solid #ddd",
  padding: "8px",
  margin: "6px 0 12px 0",
  borderRadius: "6px",
  background: "#fafafa"
};
const emojiButtonProps = (title, onClick) => ({
  title,
  onClick,
  style: {
    padding: "2px 2px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: "4px",
    lineHeight: 1,
    fontSize: "1em",
  },
  onMouseEnter: (ev) => { ev.target.style.background = "#f0f0f0"; },
  onMouseLeave: (ev) => { ev.target.style.background = "transparent"; },
  onMouseDown: (ev) => { ev.target.style.background = "#d0d0d0"; },
  onMouseUp: (ev) => { ev.target.style.background = "#f0f0f0"; }
});

      return e(
        "div",
        null,
        this.state.active
          && e(
            "div",
            null,
            this.renderSection("animTools", "Animation Tools"),
            this.state.animTools
              && e(
                "div",
                { style: this.sectionBox },
                    this.renderCheckbox("manualSetBounds", "Set Bounds Manually"),
                    this.state.manualSetBounds
              && e(
                "div",
                { style: this.sectionBox },
                    this.renderSlider("groupBegin", { min: 0, max: this.state.numLayers - 1, step: 1 }, "Group Begin (Inclusive)"),
                    this.renderSlider("groupEnd", { min: 0, max: this.state.numLayers - 1, step: 1 }, "Group End (Inclusive)"),
                    this.renderSlider("layerOrigin", { min: 0, max: this.state.numLayers - 1, step: 1 }, "Start Layer"),
                    e("button", { onClick: () => this.setBoundsAndStartLayer() }, "Set from Active Layer"),
),
this.renderSpacer(),
            !this.state.autoLayerSync
              && e(
                "div",
                null,
                           e("button", { onClick: () => this.enableAutoLayerSync() }, "🔴 Auto Switch Layers 🔲"),
),
            this.state.autoLayerSync
              && e(
                "div",
                null,
                           e("button", { onClick: () => this.disableAutoLayerSync() }, "🟢 Auto Switch Layers ☑️"),
                this.renderCheckbox("autoLock", "Auto Lock Layers"),
),
this.renderSpacer(),
            !this.state.oInvisFrames
              && e(
                "div",
                null,
                           e("button", { onClick: () => this.enableOInvisFrames() }, "🔴 Invisible Layers Overlay 🔲"),
),
            this.state.oInvisFrames
              && e(
                "div",
                null,
                           e("button", { onClick: () => this.disableOInvisFrames() }, "🟢 Invisible Layers Overlay ☑️"),
                // this.renderCheckbox("oEndFrame", "End Frame Overlay"),
                this.renderCheckbox("updateALot", "Update render a lot (laggy)"),
                this.renderCheckbox("oPrevFrames", "Previous Frames Overlay"),
                this.renderSlider("oFramesLength", { min: 1, max: 10, step: 1 }, "Previous Frames"),
                this.renderSlider("opacity", { min: 0, max: 1, step: 0.01 }, "Opacity"),
),
this.renderSpacer(),
                  e("button", { onClick: () => { this.scanForAnimatedFolders();} }, "Update Layer Automation"),
this.renderSpacer(),
                    this.state.aLayers, e("button", { title: "Get animation-layer count by searching for layers ending with '.1' in this folder",
                    onClick: () => this.copyLayerCount()}, "Get Layer Count"),
              ),
this.renderSection("folderSettings", "Layer Automation"),
this.state.folderSettings
  && e("div", { style: this.sectionBox },
    (() => {
      const activeFolderObj = this.getActiveFolder();
      if (!activeFolderObj) return e("div", null, "No active folder");

      const folder = activeFolderObj.folder;
      const parsed = this.parseFolderLoopSettings(folder.name);

      return e("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },

// Base name button + suffix text
e("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
"Active Folder:",
  e("button", {
    title: "Click to rename the folder base name",
    style: { background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer", fontWeight: 500 },
    onClick: () => {
      const newBase = prompt("Rename folder base name:", parsed.baseName || "New Folder");
      if (newBase !== null) this.updateFolderLoopName({ ...parsed, baseName: newBase });
    }
  }, parsed.baseName && parsed.baseName.length ? parsed.baseName : "New Folder"),

  // show only the ".loop..." suffix as plain text
  (() => {
    const fullName = (folder.name || "");
    const loopIdx = fullName.indexOf(".loop");
    const suffix = loopIdx !== -1 ? fullName.substring(loopIdx) : "";
    return e("span", { style: { color: "#444", fontSize: "0.95em", userSelect: "none" } }, suffix);
  })()
),


 // Loop toggle and Grow toggle row
               e("div", { style: { display: "flex", alignItems: "center", gap: "12px" } }, // Loop checkbox
               e("label", { style: { display: "flex", alignItems: "center", gap: "6px" } }, e("input", { type: "checkbox", checked: !!parsed.loopEnabled, onChange: (ev) => { const s = { ...parsed, loopEnabled: !!ev.target.checked }; this.updateFolderLoopName(s); } }), e("span", null, "Loop") ),

 // Grow checkbox
                 e("label", { style: { display: "flex", alignItems: "center", gap: "6px" } }, e("input", { type: "checkbox", checked: !!parsed.grow, onChange: (ev) => { const s = { ...parsed, grow: !!ev.target.checked, loopEnabled: true }; this.updateFolderLoopName(s); } }), e("span", null, "Grow") ) ),

// numeric controls row: Time, Length, Frame Offset, Jump
e("button", {
  onClick: () => {
this.copyLayerCount();
    const s = {
      ...parsed,
      jump: Math.max(1, this.state.aLayers),
      length: Math.max(1, this.state.aLayers),
      loopEnabled: true
    };
    this.updateFolderLoopName(s);
  }
}, "Copy # of Animated Layers"),

e("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
  // Time (T) -> defaults to 1
  this.renderFolderSlider("Time", parsed.time, -20, 20, 1, 1, (newVal) => {
    const s = { ...parsed, time: newVal, loopEnabled: true };
    this.updateFolderLoopName(s);
  }),

  // Length (L) -> defaults to 1, min 1
  this.renderFolderSlider("Length", parsed.length, 1, 200, 1, 1, (newVal) => {
    const s = { ...parsed, length: Math.max(1, newVal), loopEnabled: true };
    this.updateFolderLoopName(s);
  }),

  // Frame Offset (F) -> defaults to 0
  this.renderFolderSlider("Frame Offset", parsed.frameOffset, -200, 200, 1, 0, (newVal) => {
    const s = { ...parsed, frameOffset: newVal, loopEnabled: true };
    this.updateFolderLoopName(s);
  }),

  // Jump (J) -> defaults to 1, min 1
  this.renderFolderSlider("Jump", parsed.jump, 1, 50, 1, 1, (newVal) => {
    const s = { ...parsed, jump: Math.max(1, newVal), loopEnabled: true };
    this.updateFolderLoopName(s);
  }),

  // Loops (X) -> defaults to 0 (infinite), min 0
  this.renderFolderSlider("Loops", parsed.loops, 0, 50, 1, 0, (newVal) => {
    const s = { ...parsed, loops: Math.max(0, newVal), loopEnabled: true };
    this.updateFolderLoopName(s);
  })
),
 e("div", null, e("button", { onClick: () => { this.scanForAnimatedFolders();} }, "Update Layer Automation") ), ); })()
),
            this.renderSection("aLayersSection", "Animation Layers"),
this.state.aLayersSection
  && e(
    "div",
    { style: this.sectionBox },
                    this.renderSlider("aLayers", { min: 1, max: 20, step: 1 }, "Animated Layers"),
                    e("button", { title: "Get animation-layer count by searching for layers ending with '.1' in this folder",
                    onClick: () => this.copyLayerCount()}, "Get Layer Count"),

            this.renderCheckbox("editLayers", "Edit Layers"),
    (() => {
      const num = Math.max(1, parseInt(this.state.aLayers, 10) || 1);
      const folderLayers = this.getFolderLayers();
      if (!folderLayers || folderLayers.length === 0) {
        return e("div", null, "No layers in active folder");
      }

      // figure out which animation-layer index (0-based) is currently selected (based on active layer)
      const stateBefore = store.getState();
      const activeLayerId = stateBefore?.simulator?.engine?.engine?.state?.activeLayerId;
      const activeFolderIndex = folderLayers.findIndex(f => f.layer.id === activeLayerId);
      const activeAnimIndex = activeFolderIndex >= 0 ? (activeFolderIndex % num) : -1;

      // Render highest layer index first (num..1)
      const rows = [];
      for (let i = num - 1; i >= 0; --i) {
        const folderIndex = i;
        if (folderIndex >= folderLayers.length) {
          rows.push(e("div", { key: `out-${i}`, style: { color: "#a00" } },
            `Animation layer ${i + 1} out of range (folder has ${folderLayers.length})`
          ));
          continue;
        }

        const base = folderLayers[folderIndex];
        const parsed = this.parseLayerName(base.layer);

        // determine selection highlight (when editLayers is false only)
        const isSelected = (!this.state.editLayers) && (activeAnimIndex === folderIndex);

        // left group: swatch + name. right group: action buttons
const left = e("div", {
  style: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: "1 1 auto",
    minWidth: 0,
    justifyContent: "flex-start"
  }
},
            // color picker
  e("input", {
    type: "color",
    value: parsed.color || "#000000",
    onChange: (ev) => this.setColorForSequence(folderIndex, num, ev.target.value),
    title: `Set color for animation layer ${i + 1}`
  }),
  // animation layer name
  e("div", {
    style: {
      cursor: "pointer",
      minWidth: "6em",
      flex: "1 1 auto",
      textAlign: "left",
      textDecoration: this.state.editLayers ? "underline" : "none",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
onClick: () => {
  if (this.state.editLayers) {
    // rename sequence
    this.renameSequence(folderIndex, num);
    return;
  }
  const stateBefore = store.getState();
  const activeLayerId = stateBefore?.simulator?.engine?.engine?.state?.activeLayerId;
  const activeFolderIndex = folderLayers.findIndex(f => f.layer.id === activeLayerId);

  let frameIndex; // 0-based
  if (activeFolderIndex >= 0) {
    frameIndex = Math.floor(activeFolderIndex / num);
  } else {
    // fallback: try simulator current frame number if active layer not in folder
    const frameNum = this.getCurrentFrameNumber();
    frameIndex = Math.max(0, frameNum - 1);
  }

  const targetIndexWithinFolder = frameIndex * num + folderIndex;
  if (targetIndexWithinFolder >= 0 && targetIndexWithinFolder < folderLayers.length) {
    const targetLayer = folderLayers[targetIndexWithinFolder].layer;
    store.dispatch(setLayerActive(targetLayer.id));
  } else {
    // fallback to first frame in sequence if out of range
    const fallback = this.getSequenceForFolderIndex(folderIndex, num)[0];
    if (fallback) store.dispatch(setLayerActive(fallback.layer.id));
  }
}

          }, parsed.displayName)
        );

        // right group: different content depending on edit mode
        let right;
        if (this.state.editLayers) {
right = e("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
  e("button", emojiButtonProps("Move animation-layer Up", () => this.moveLayerSequenceUp(folderIndex, num)), "⬆️"),
  e("button", emojiButtonProps("Move animation-layer Down", () => this.moveLayerSequenceDown(folderIndex, num)), "⬇️"),
  e("button", emojiButtonProps("Delete all frames of this animation-layer", () => this.deleteSequence(folderIndex, num)), "➖")
);

        } else {
          // non-edit mode: copy, visibility toggle, editable toggle
          const sequence = this.getSequenceForFolderIndex(folderIndex, num);
          // use base.layer for visible/editable state display
right = e("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
  e("button", emojiButtonProps(`Copy animation-layer ${folderIndex+1}`, () => this.copyAnimatedLayer(folderIndex, num)), "📋"),
  e("button", emojiButtonProps(`Toggle visibility`, () => this.toggleVisibleForSequence(folderIndex, num)), base.layer.visible ? "☑️" : "🔲"),
  e("button", emojiButtonProps(`Toggle editable`, () => this.toggleEditableForSequence(folderIndex, num)), base.layer.editable ? "🔓" : "🔒")
);

        }

        rows.push(
          e("div", {
            key: `al-${i}`,
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 6px",
              background: isSelected ? "#e6e6e6" : "transparent",
              borderRadius: "4px"
            }
          },
            left,
            // right aligned
            e("div", { style: { marginLeft: "auto" } }, right)
          )
        );
      }

      return e("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, rows);
    })(),
e("div", null,
  this.renderSlider("aFramesTemp", { min: 1, max: 200, step: 1 }, "Layer Frames"),
  e("button", {
    onClick: () => this.commitAFrames(),
    title: "Adds/Removes layers)"
  }, "Commit Frame Layers")
),
  ),

            this.renderSection("transTools", "Transform Tools"),
            this.state.transTools
              && e(
                "div",
                { style: this.sectionBox },
            this.renderSlider("aLength", { min: 0, max: 500, step: 1 }, "Animation Length"),
            this.renderCheckbox("inverse", "Animate Backwards"),
this.renderSpacer(),
            this.renderCheckbox("camLock", "Lock Animation to Camera"),
            this.renderSlider("nudgeXSmall", { min: -10, max: 10, step: 0.1 }, "Small Move X"),
            this.renderSlider("nudgeXBig", { min: -10000, max: 10000, step: 10 }, "Large Move X"),
            this.renderSlider("nudgeYSmall", { min: -10, max: 10, step: 0.1 }, "Small Move Y"),
            this.renderSlider("nudgeYBig", { min: -10000, max: 10000, step: 10 }, "Large Move Y"),
this.renderSpacer(),
            this.renderSlider("scaleX", { min: 0, max: 10, step: 0.01 }, "Scale X"),
            this.renderSlider("scaleY", { min: 0, max: 10, step: 0.01 }, "Scale Y"),
            this.renderSlider("scale", { min: 0, max: 10, step: 0.01 }, "Scale"),
            this.renderCheckbox("scaleWidth", "Scale Width"),
this.renderSpacer(),
            this.renderSlider("rotate", { min: -180, max: 180, step: 1 }, "Rotation"),
this.renderSpacer(),
            this.renderCheckbox("flipX", "Flip X"),
            this.renderCheckbox("flipY", "Flip Y"),
            this.renderSection("relativeTools", "Adjust Origin"),
            this.state.relativeTools
              && e(
                "div",
                { style: this.sectionBox },
                this.renderSlider("alongPerspX", { min: -0.5, max: 0.5, step: 0.001 }, "Along Perspective X"),
                this.renderSlider("alongPerspY", { min: -0.5, max: 0.5, step: 0.001 }, "Along Perspective Y"),
                this.renderSlider("alongRot", { min: -180, max: 180, step: 1 }, "Along Rotation"),
this.renderSpacer(),
                this.renderSlider("anchorX", { min: -0.5, max: 0.5, step: 0.01 }, "Anchor X"),
                this.renderSlider("anchorY", { min: -0.5, max: 0.5, step: 0.01 }, "Anchor Y"),
              ),
            this.renderSection("warpTools", "Warp Tools"),
            this.state.warpTools
              && e(
                "div",
                { style: this.sectionBox },
                this.renderCheckbox("relativePersp", "Relative Perspective"),
                this.renderSlider("perspClamping", { min: -5, max: 0, step: 0.01 }, "Perspective Clamping"),
this.renderSpacer(),
                this.renderSlider("perspX", { min: -1, max: 1, step: 0.01 }, "Perpective X"),
                this.renderSlider("perspY", { min: -1, max: 1, step: 0.01 }, "Perpective Y"),
this.renderSpacer(),
                this.renderSlider("skewX", { min: -2, max: 2, step: 0.01 }, "Skew X"),
                this.renderSlider("skewY", { min: -2, max: 2, step: 0.01 }, "Skew Y"),
              ),
            this.renderSection("randomness", "Randomness"),
            this.state.randomness
              && e(
                "div",
                { style: this.sectionBox },
                this.renderSlider("rSeed", { min: 0, max: 10000, step: 1 }, "Seed"),
                this.renderCheckbox("shake", "Shake"),
                this.renderSlider("rAccel", { min: -10, max: 10, step: 0.1 }, "Accelerate"),
this.renderSpacer(),
                this.renderSlider("rMoveX", { min: 0, max: 10, step: 0.05 }, "Max Move X"),
                this.renderSlider("rMoveY", { min: 0, max: 10, step: 0.05 }, "Max Move Y"),
this.renderSpacer(),
                this.renderSlider("rScaleX", { min: 0, max: 2, step: 0.01 }, "Max Scale X"),
                this.renderSlider("rScaleY", { min: 0, max: 2, step: 0.01 }, "Max Scale Y"),
                this.renderCheckbox("rScaleWidth", "Scale Width"),
this.renderSpacer(),
                this.renderSlider("rRotate", { min: 0, max: 45, step: 0.1 }, "Max Rotation"),
              ),
              ),
            e("button", { style: { float: "left" }, onClick: () => this.onCommit() }, "Commit"),
            e("button", { style: { float: "left" }, onClick: () => this.onResetAll() }, "Reset"),
          ),
        e(
          "button",
          { style: { backgroundColor: this.state.active ? "lightblue" : null }, onClick: this.onActivate.bind(this) },
          "XAnimator Mod",
        ),
      );
    }
    }

    // this is a setting and not a standalone tool because it extends the select tool
    window.registerCustomSetting(XaviAnimateModComponent);
}

/* init */
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
        return true;
    }
    if (a.size !== b.size) {
        return false;
    }
    for (let x of a) {
        if (!b.has(x)) {
            return false;
        }
    }
    return true;
}

function getLinesFromPoints (points) {
    return new Set([ ...points ].map(point => point >> 1));
}

function buildAffineTransform (shearX, shearY, scaleX, scaleY, rot) {
    const { V2 } = window;

    let tShear = [ 1 + shearX * shearY, shearX, shearY, 1, 0, 0 ];
    let tScale = [ scaleX, 0, 0, scaleY, 0, 0 ];
    let u = V2.from(1, 0).rot(rot).transform(tScale).transform(tShear);
    let v = V2.from(0, 1).rot(rot).transform(tScale).transform(tShear);

    return [ u.x, v.x, u.y, v.y, 0, 0 ];
}

function buildRotTransform (rot) {
    const { V2 } = window;

    let u = V2.from(1, 0).rot(rot);
    let v = V2.from(0, 1).rot(rot);

    return [ u.x, v.x, u.y, v.y, 0, 0 ];
}

function preparePointAlong (p, preCenter, alongPerspX, alongPerspY, preTransform) {
    return transformPersp(p.sub(preCenter), -alongPerspX, -alongPerspY, 0).transform(preTransform);
}

function transformPersp (p, perspX, perspY, epsilon) {
    const pt = new V2(p);
    let w = (1 + perspX * pt.x + perspY * pt.y);
    if (Math.abs(w) < epsilon) {
        w = Math.sign(w) * epsilon;
    }
    pt.x = pt.x / w;
    pt.y = pt.y / w;
    return pt;
}

function restorePoint (p, anchor, postTransform, alongPerspX, alongPerspY, preCenter) {
    return transformPersp(
        p.add(anchor).transform(postTransform),
        alongPerspX, alongPerspY, 0
    ).add(preCenter);
}

function parseFloatOrDefault (string, defaultValue = 0) {
    const x = parseFloat(string);
    return isNaN(x) ? defaultValue : x;
}

function getBoundingBox (lines) {
    if (lines.size === 0) {
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let line of lines) {
        minX = Math.min(line.p1.x, minX);
        minY = Math.min(line.p1.y, minY);
        maxX = Math.max(line.p1.x, maxX);
        maxY = Math.max(line.p1.y, maxY);

        minX = Math.min(line.p2.x, minX);
        minY = Math.min(line.p2.y, minY);
        maxX = Math.max(line.p2.x, maxX);
        maxY = Math.max(line.p2.y, maxY);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function getCameraPosAtFrame(frame, track) {
  const viewport = this.store.getState().camera.playbackDimensions || { width: 1920, height: 1080 };
  const zoom = window.getAutoZoom ? window.getAutoZoom(frame) : this.store.getState().camera.playbackZoom;
  const initCamera = this.store.getState().camera.playbackFollower.getCamera(track, {
    zoom,
    width: viewport.width,
    height: viewport.height,
  }, frame);
  return { x: initCamera.x, y: initCamera.y };
}

// random from seed
// —— Helpers ——

// Convert number / BigInt / numeric-string / string -> 64-bit BigInt seed
function toBigIntSeed(seed) {
  if (typeof seed === "bigint") return seed & ((1n << 64n) - 1n);
  if (typeof seed === "number") return BigInt(Math.floor(seed)) & ((1n << 64n) - 1n);
  // string -> FNV-1a 64-bit
  let h = 14695981039346656037n;
  for (let i = 0; i < String(seed).length; i++) {
    h ^= BigInt(String(seed).charCodeAt(i));
    h = (h * 1099511628211n) & ((1n << 64n) - 1n);
  }
  return h;
}

// SplitMix64 mixing, returns 64-bit BigInt
function splitmix64(state) {
  state = (state + 0x9E3779B97f4A7C15n) & ((1n << 64n) - 1n);
  let z = state;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & ((1n << 64n) - 1n);
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & ((1n << 64n) - 1n);
  z = z ^ (z >> 31n);
  return { state, out: z & ((1n << 64n) - 1n) };
}

// Convert 64-bit BigInt to a JS Number in [0,1)
// take the top 53 bits (safe for double precision)
function u64To01(u64) {
  const top53 = Number((u64 >> 11n) & ((1n << 53n) - 1n)); // top 53 bits
  return top53 / Math.pow(2, 53);
}

// —— API you asked for ——

// single deterministic value for a seed: returns in [-range, range]
function seedRandom(seed, range = 1) {
  const s = toBigIntSeed(seed);
  const { out } = splitmix64(s); // single mix from seed
  const r01 = u64To01(out); // [0,1)
  return (r01 * 2 - 1) * range; // map to [-range, range]
}

// make a reusable RNG that produces a repeatable sequence
function makeSeededRNG(seed) {
  let state = toBigIntSeed(seed);
  return function(range = 1) {
    const res = splitmix64(state);
    state = res.state; // update internal state
    const r01 = u64To01(res.out);
    return (r01 * 2 - 1) * range;
  };
}
