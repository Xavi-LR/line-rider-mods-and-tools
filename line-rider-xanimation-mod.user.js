// ==UserScript==

// @name         Layer Automation Animation Helper
// @namespace    https://www.linerider.com/
// @author       Malizma and now Xavi
// @description  x: the everything animate mod
// @version      3.5.2
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-xanimation-mod.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-xanimation-mod.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        GM.getValue
// @grant        GM.setValue


// ==/UserScript==

// jshint asi: true
// jshint esversion: 6

/* globals Millions, V2 */

/* constants */
const SELECT_TOOL = "SELECT_TOOL";
const EMPTY_SET = new Set();

// customize
const POINT_RADIUS = 60; // click detection radius
const POINT_SIZE = 10;
const SCALE_POINT_OFFSET = 30;

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

const addLayer = (name) => ({
    type: "ADD_LAYER",
    payload: { name }
});

const addFolder = (name) => ({
    type: "ADD_FOLDER",
    payload: { name }
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
const getEditorZoom = state => state.camera.editorZoom;
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
        this._transformInProgress = false;

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
            if (this.state.selectFinalFrameOnCommit) {

                const setToolState = (toolId, state) => ({
                    type: "SET_TOOL_STATE",
                    payload: state,
                    meta: { id: toolId },
                });

                const setSelectToolState = toolState => setToolState(SELECT_TOOL, toolState);

                const stateBefore = this.store.getState();
                const layers = stateBefore.simulator.engine.engine.state.layers.toArray();
                const activeLayerId = stateBefore.simulator.engine.engine.state.activeLayerId;
                const activeIndex = layers.findIndex(l => l.id === activeLayerId);
                // determine new active layer
                const inverse = this.state.inverse ? -1 : 1;
                let newActiveLayer = activeIndex + ((sumOf(this.state.multiALength) - this.state.multiALength.length) * this.state.aLayers * inverse);
                const aBoundsLength = this.state.groupEnd - this.state.groupBegin + 1;
                while (newActiveLayer < (this.state.groupBegin - 1)) {
                    newActiveLayer = newActiveLayer + aBoundsLength
                }

                while (newActiveLayer > (this.state.groupEnd - 1)) {
                    newActiveLayer = newActiveLayer - aBoundsLength
                }

                // get final frame lines (in a really goofy way)
                const selectToolState = getToolState(unsafeWindow.store.getState(), SELECT_TOOL);
                if (selectToolState && selectToolState.selectedPoints) {
                    const selectedPoints = new Set();
                    const allLines = unsafeWindow.Selectors.getSimulatorLines(this.store.getState());
                    const keyFor = l => `${l.p1.x}|${l.p1.y}|${l.p2.x}|${l.p2.y}`;
                    const coordsSet = new Set(this.state.finalFrameLines.map(keyFor));
                    const matchingLines = allLines.filter(line => coordsSet.has(keyFor(line)));
                    for (let line of matchingLines) {
                        selectedPoints.add(line.id * 2);
                        selectedPoints.add(line.id * 2 + 1);
                    }
                    const newActiveLayerId = layers[newActiveLayer].id
                    this.state.setActive = newActiveLayerId;
                    this.store.dispatch(commitTrackChanges());
                    this.store.dispatch(revertTrackChanges());
                    this.store.dispatch(setSelectToolState({ selectedPoints }));

                }
            } else {
                this.store.dispatch(commitTrackChanges());
                this.store.dispatch(revertTrackChanges());
            }
            this.changed = false;
            this.genCount += 1;
            return true;
        }
    }

onUpdate(nextState = this.state) {
  this.componentUpdateResolved = false;

  let shouldUpdate = false;
  if (this.state !== nextState) {
    this.state = nextState;
    shouldUpdate = true;
  }

  if (this.state.active) {
    const track = getSimulatorCommittedTrack(this.store.getState());
    if (this.track !== track) { this.track = track; shouldUpdate = true; }

    const layers = getSimulatorLayers(this.store.getState());
    if (layers && this.layers !== layers) { this.layers = layers; shouldUpdate = true; }

    const selectToolState = getSelectToolState(this.store.getState());
    let selectedPoints = EMPTY_SET;
    if (selectToolState) {
      selectedPoints = selectToolState.selectedPoints;
      if (!selectToolState.multi) selectedPoints = EMPTY_SET;
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

  if (this.changed && (this.state.transUpdated)) {
    this.store.dispatch(revertTrackChanges());
    this.changed = false;
  }

  if (!this.active() || !(this.state.groupBegin <= this.state.layerOrigin && this.state.layerOrigin <= this.state.groupEnd)) {
    this.componentUpdateResolved = true;
    return;
  }

  // === RE-ENTRY LOGIC ===
  if (this._transformInProgress) {
    this.componentUpdateResolved = true;
    return;
  }

  // don't run transform
    if (!this.state.transUpdated) {
      this.componentUpdateResolved = true;
      return;
    }
    // run transform
    this.state.transUpdated = false;
    this._runTransform();
    this.componentUpdateResolved = true;
    return;
}

_runTransform() {
  if (this._transformInProgress) return;
  this._transformInProgress = true;
  try {
    if (this.state.setActive) {
      this.store.dispatch(setLayerActive(this.state.setActive));
      this.state.setActive = null;
    }

    if (!this.state.manualSetBounds) {
      this.setBoundsAndStartLayer();
    }

    const state = this.state;
    const store = this.store;
    const track = this.track;
    const playerIndex = this.playerIndex;
    const initCamera = getCameraPosAtFrame(playerIndex, track);

    let pretransformedLines = [...getLinesFromPoints(this.selectedPoints)]
      .map(id => this.track.getLine(id))
      .filter(l => l);

    state.finalFrameLines = [];
    const posttransformedLines = [];
    const startTime = performance.now();
    const allLines = [];

    const prevRememberedLines = state.rememberedLines;
    state.rememberedLines = [];

    const layersArray = getSimulatorLayers(store.getState());
    let layerIndex = state.layerOrigin;
    const inverse = state.inverse ? -1 : 1;
    const multiALength = sumOf(state.multiALength) - state.multiALength.length;

    const animLines = pretransformedLines.slice();
    const lineLayers = new Map();
    for (const line of animLines) {
      const L = line.layer;
      if (!lineLayers.has(L)) lineLayers.set(L, []);
      lineLayers.get(L).push(line);
    }

    // id -> index map is constant across frames, compute once
    const idToIndex = new Map(layersArray.map((l, i) => [l.id, i]));

    // ---------- Index prevRememberedLines by idx for O(1) lookups ----------
    const prevRememberedMap = new Map();
    if (prevRememberedLines && prevRememberedLines.length) {
      for (let pl of prevRememberedLines) {
        const arr = prevRememberedMap.get(pl.idx) || [];
        arr.push(pl);
        prevRememberedMap.set(pl.idx, arr);
      }
    }

    // --- Build a compact signature for the *active* keyframe only ---
    const activeId = state.activeMultiId;
    const keysToCapture = [
      'nudgeXSmall','nudgeYSmall','alongPerspX','alongPerspY',
      'rotate','scale','scaleX','scaleY','skewX','skewY',
      'anchorX','anchorY','perspX','perspY','alongRot',
      'animatedAnchors','buildOffPrevFrame','relativePersp',
      'perspClamping','perspRotate','perspFocal','parallax','camLock',
      'randomness','rSeed','rMoveX','rMoveY','rRotate','rScaleX','rScaleY','rScaleWidth',
      'shake','shakeInterval','shakeFreeze','scaleWidth',
      'animationOffset','aLayers','groupBegin','groupEnd',
      'smoothMulti','smoothMultiEnds','impactFutureKeyframes',
      'updateWholeAnimation','toggleUpdateWholeAnimation',
      'selectFinalFrameOnCommit','editAnimation'
    ];

    // cheap checksum of the selected lines (so changing selection forces recompute)
    let selSum = 0;
    if (pretransformedLines && pretransformedLines.length) {
      for (let l of pretransformedLines) selSum += Number(l.id) || 0;
    }

    const sigParts = [];
    sigParts.push('act:' + activeId);
    sigParts.push('alen:' + (state.multiALength[activeId] ?? 0));
    sigParts.push('sel:' + (pretransformedLines ? pretransformedLines.length : 0) + ':' + selSum);

    for (const k of keysToCapture) {
      const v = state[k];
      if (v == null) {
        sigParts.push(k + ':n');
      } else if (Array.isArray(v)) {
        sigParts.push(k + ':' + String(v[activeId] ?? ''));
      } else if (typeof v === 'object') {
        if (Object.prototype.hasOwnProperty.call(v || {}, activeId)) {
          sigParts.push(k + ':' + String(v[activeId]));
        } else {
          try { sigParts.push(k + ':' + JSON.stringify(v)); } catch (e) { sigParts.push(k + ':' + String(v)); }
        }
      } else {
        sigParts.push(k + ':' + String(v));
      }
    }

    const activeSignature = sigParts.join('|');

    // If signature matches previous run, and we have a remembered frame for every idx, reuse them
    const prevActiveSignature = this._activeTransformSignature;
    let canReuseAll = false;
    if (prevActiveSignature === activeSignature && prevRememberedLines && prevRememberedLines.length) {
      // ensure we have remembered results for every frame idx (0..multiALength-1)
      canReuseAll = true;
      for (let idx = 0; idx < multiALength; idx++) {
        if (!prevRememberedMap.has(idx)) {
          canReuseAll = false;
          break;
        }
      }
    }

    if (canReuseAll) {
      // Fast reuse: dispatch all frames from prevRememberedMap and set state.rememberedLines
      for (let idx = 0; idx < multiALength; idx++) {
        const arr = prevRememberedMap.get(idx) || [];
        const cloned = arr.map(line => ({ ...line }));
        if (cloned.length) {
          store.dispatch(addLines(cloned));
          state.rememberedLines.push(...cloned);
        }
      }
      // nothing else required (we reused previous transforms for every frame)
      state.updateWholeAnimation = false;
      this.changed = true;
      return;
    }

    // Else: do full computation and at the end store the activeSignature for future reuse
    let multiKeyId = 0;
    let multiI = 0;

    for (let i = 0; i < multiALength; i++) {
      let aLength = state.multiALength[multiKeyId] - 1;
      if (multiI == aLength) {
        multiKeyId = multiKeyId + 1;
        multiI = 0;
        aLength = state.multiALength[multiKeyId] - 1;
      }
      multiI++;

      layerIndex += 1 * state.aLayers * inverse;

      if (layerIndex > state.groupEnd) {
        layerIndex = state.groupBegin;
      }
      if (layerIndex < state.groupBegin) {
        layerIndex = state.groupEnd - state.aLayers + 1;
      }

      // fast-path reuse for certain unchanged segments (keeps original coarse guards)
      if (!(
        state.updateWholeAnimation || state.toggleUpdateWholeAnimation ||
        multiKeyId == state.activeMultiId || multiKeyId == state.activeMultiId + 1 ||
        (state.smoothMulti && (multiKeyId == state.activeMultiId - 1 || multiKeyId == state.activeMultiId + 2)) ||
        (state.impactFutureKeyframes && (multiKeyId > state.activeMultiId))
      )) {
        // If prevRememberedMap had this idx (even if activeSignature changed), reuse that single frame
        const arr = prevRememberedMap.get(i);
        if (arr && arr.length) {
          const cloned = arr.map(line => ({ ...line }));
          store.dispatch(addLines(cloned));
          state.rememberedLines.push(...cloned);
          continue;
        }
      }

      // If we get here we must do the full per-frame computation (same as before)

      if (state.editAnimation) {
        const minLayer = layerIndex;
        let maxLayer = layerIndex + state.aLayers - 1;
        const groupLength = state.groupEnd - state.groupBegin + 1;
        while (maxLayer > state.groupEnd) {
          maxLayer = maxLayer - groupLength;
        }
        while (maxLayer < state.groupBegin) {
          maxLayer = maxLayer + groupLength;
        }
        maxLayer = maxLayer * multiALength;

        const groupLines = [];
        for (let L = minLayer; L <= maxLayer; L++) {
          const arr = lineLayers.get(L);
          if (arr && arr.length) groupLines.push(...arr);
        }

        if (groupLines.length === 0) {
          pretransformedLines.length = 0;
          continue;
        }

        const idSet = new Set(groupLines.map(l => l.id));

        // filter pretransformedLines in-place (iterate backwards)
        for (let j = pretransformedLines.length - 1; j >= 0; j--) {
          const line = pretransformedLines[j];
          if (!line || !idSet.has(line.id)) {
            pretransformedLines.splice(j, 1);
          }
        }
      }

      const progress = state.buildOffPrevFrame ? (1 / aLength) : (multiI / aLength);

      const multi = (transform, scale = false) => {
        const startVal = (typeof sumOf(transform, multiKeyId - 1) !== 'undefined')
          ? sumOf(transform, multiKeyId - 1)
          : 0;
        const delta = transform[multiKeyId] ?? 0;
        const endVal = startVal + delta;

        if (!state.smoothMulti) {
          return progress * delta + startVal;
        }

        if (!aLength || aLength <= 0) {
          return progress * delta + startVal;
        }

        const prevExists = state.smoothMultiEnds ? true : (typeof transform[multiKeyId - 1] !== 'undefined');
        const nextExists = state.smoothMultiEnds ? true : (typeof transform[multiKeyId + 1] !== 'undefined');

        let p0 = prevExists ? sumOf(transform, multiKeyId - 2) : undefined;
        let p3 = nextExists ? sumOf(transform, multiKeyId + 1) : undefined;

        if (!prevExists && !nextExists && !state.smoothMultiEnds) {
          return progress * delta + startVal;
        }

        if (typeof p0 === 'undefined') p0 = startVal;
        if (typeof p3 === 'undefined') p3 = endVal;

        const framesPrev = (multiKeyId - 1 >= 0)
          ? Math.max(1, (state.multiALength[multiKeyId - 1] - 1))
          : aLength;
        const framesNext = (multiKeyId + 1 < state.multiALength.length)
          ? Math.max(1, (state.multiALength[multiKeyId + 1] - 1))
          : aLength;

        const t0 = -framesPrev;
        const t1 = 0;
        const t2 = aLength;
        const t3 = aLength + framesNext;

        const T = state.buildOffPrevFrame ? 1 : multiI;

        const safeDiv = (num, den, fallback = 0) => (den === 0 ? fallback : (num / den));

        const slope = safeDiv(endVal - startVal, (t2 - t1), 0);

        let m1;
        const denom1 = (t2 - t0);
        if (denom1 !== 0) {
          m1 = (
            safeDiv((endVal - startVal), (t2 - t1), 0) * (t1 - t0) +
            safeDiv((startVal - p0), (t1 - t0), 0) * (t2 - t1)
          ) / denom1;
        } else {
          m1 = slope;
        }

        let m2;
        const denom2 = (t3 - t1);
        if (denom2 !== 0) {
          m2 = (
            safeDiv((p3 - endVal), (t3 - t2), 0) * (t2 - t1) +
            safeDiv((endVal - startVal), (t2 - t1), 0) * (t3 - t2)
          ) / denom2;
        } else {
          m2 = slope;
        }

        if (!prevExists && !state.smoothMultiEnds) m1 = slope;
        if (!nextExists && !state.smoothMultiEnds) m2 = slope;

        const denomSegment = (t2 - t1);
        const s = denomSegment !== 0 ? Math.max(0, Math.min(1, (T - t1) / denomSegment)) : 1.0;

        const s2 = s * s;
        const s3 = s2 * s;
        const h00 = 2 * s3 - 3 * s2 + 1;
        const h10 = s3 - 2 * s2 + s;
        const h01 = -2 * s3 + 3 * s2;
        const h11 = s3 - s2;

        const value = h00 * startVal + h10 * m1 * (t2 - t1) + h01 * endVal + h11 * m2 * (t2 - t1);

        return value;
      };

      // --- Precompute multi(...) results used multiple times this frame ---
      const multiCache = Object.create(null);
      const getMulti = (key) => {
        if (Object.prototype.hasOwnProperty.call(multiCache, key)) return multiCache[key];
        const val = multi(state[key] ?? [], false);
        multiCache[key] = val;
        return val;
      };

      const nudgeX = getMulti('nudgeXSmall');
      const nudgeY = getMulti('nudgeYSmall') * -1;
      const alongPerspX = getMulti('alongPerspX') * 0.01;
      const alongPerspY = getMulti('alongPerspY') * 0.01;
      const rotateVal = getMulti('rotate');
      const scaleVal = getMulti('scale') + 1;
      const scaleXVal = getMulti('scaleX') + 1;
      const scaleYVal = getMulti('scaleY') + 1;
      const skewXVal = getMulti('skewX');
      const skewYVal = getMulti('skewY');

      // camera offset per-frame (compute once, reused per-line)
      let frameCameraOffset = { x: 0, y: 0 };
      if (state.camLock) {
        const camera = getCameraPosAtFrame(playerIndex + i, track);
        frameCameraOffset.x = camera.x - initCamera.x;
        frameCameraOffset.y = camera.y - initCamera.y;
      } else if (state.parallax !== 0) {
        const camera = getCameraPosAtFrame(playerIndex + i, track);
        frameCameraOffset.x = (camera.x - initCamera.x) * state.parallax;
        frameCameraOffset.y = (camera.y - initCamera.y) * state.parallax;
      }

      const nudge = new V2({ x: nudgeX, y: nudgeY });

      const preBB = getBoundingBox(pretransformedLines);
      const preCenter = new V2({
        x: preBB.x + 0.5 * preBB.width,
        y: preBB.y + 0.5 * preBB.height
      });

      const alongRot = state.alongRot * Math.PI / 180;
      const preTransform = buildRotTransform(-alongRot);

      // build selectedLines once this frame
      const selectedLines = [];
      for (let line of pretransformedLines) {
        const p1 = preparePointAlong(
          new V2(line.p1),
          preCenter, alongPerspX, alongPerspY, preTransform, state.perspRotate, state.perspFocal
        );
        const p2 = preparePointAlong(
          new V2(line.p2),
          preCenter, alongPerspX, alongPerspY, preTransform, state.perspRotate, state.perspFocal
        );
        selectedLines.push({ original: line, p1, p2 });
      }

      const bb = getBoundingBox(selectedLines);
      bb.x = bb.x + nudge.x;
      bb.y = bb.y + nudge.y;

      const anchorX = state.animatedAnchors ? getMulti('anchorX') : (state.anchorX[multiKeyId] ?? 0);
      const anchorY = state.animatedAnchors ? getMulti('anchorY') : (state.anchorY[multiKeyId] ?? 0);

      const anchor = new V2({
        x: bb.x + (0.5 + anchorX) * bb.width,
        y: bb.y + (0.5 - anchorY) * bb.height
      });

      const postTransform = buildRotTransform(alongRot);

      // compute perspX/Y once, and scale-related values
      let perspX = getMulti('perspX');
      let perspY = getMulti('perspY');
      const transform = this.getTransform(rotateVal, scaleVal, scaleXVal, scaleYVal, skewXVal, skewYVal);
      const transformedLines = [];

      const perspSafety = Math.pow(10, state.perspClamping);

      if (state.relativePersp) {
        let perspXDenominator = bb.width * scaleVal * scaleXVal;
        if (Math.abs(bb.width) < perspSafety) {
          perspXDenominator = perspSafety;
        }
        perspX = perspX / perspXDenominator;
        let perspYDenominator = bb.height * scaleVal * scaleYVal;
        if (Math.abs(perspYDenominator) < perspSafety) {
          perspYDenominator = perspSafety;
        }
        perspY = perspY / perspYDenominator;
      } else {
        perspX = 0.01 * perspX;
        perspY = 0.01 * perspY;
      }

      if (i == sumOf(state.multiALength, state.activeMultiId) - state.activeMultiId - 2) { // final frame of active keyframe
        this.drawBoundingBoxes(
          bb,
          anchor,
          transform,
          postTransform,
          alongPerspX,
          alongPerspY,
          preCenter,
        );
      }

      // iterate with index so randomness uses per-line index
      for (let lineIdx = 0; lineIdx < selectedLines.length; lineIdx++) {
        const line = selectedLines[lineIdx];

        // compute per-line random seeds and flags
        let baseId = Number(line.original.id) || 0;
        if (state.editAnimation) {
          baseId = baseId % state.aLayers;
        }

        let rotRandomRad = 0;
        let extraNudgeX = 0;
        let extraNudgeY = 0;
        let scaleRandomX = 1;
        let scaleRandomY = 1;

        if (state.randomness) {
          let shakeOffset = 0;
          let notFreeze = true;

          if (state.shake) {
            const interval = Math.max(1, Math.floor(state.shakeInterval || 1));
            const bucket = Math.ceil(i / interval);
            const prevFrameNum = Math.max(0, i - 1);
            const prevBucket = prevFrameNum === 0 ? 0 : Math.ceil(prevFrameNum / interval);
            shakeOffset = bucket * 1000;
            notFreeze = !state.shakeFreeze || (bucket !== prevBucket);
          } else {
            shakeOffset = 0;
            notFreeze = !state.shakeFreeze;
          }
          const seedBase = baseId + state.rSeed + shakeOffset;

          // Use cached multi values for the random parameters
          const rMoveX = getMulti('rMoveX');
          const rMoveY = getMulti('rMoveY');
          const rRotate = getMulti('rRotate');
          const rScaleX = getMulti('rScaleX') + 1;
          const rScaleY = getMulti('rScaleY') + 1;

          if (rMoveX !== 0 && notFreeze) {
            extraNudgeX = seedRandom(seedBase, rMoveX);
          }
          if (rMoveY !== 0 && notFreeze) {
            extraNudgeY = seedRandom(seedBase + 100, rMoveY);
          }

          if (rScaleX !== 1 && notFreeze) {
            const rand01 = (seedRandom(seedBase + 200, 1) + 1) / 2;
            scaleRandomX = rScaleX > 1 ? (1 + rand01 * (rScaleX - 1)) : (rScaleX + rand01 * (1 - rScaleX));
          }

          if (rScaleY !== 1 && notFreeze) {
            const rand01 = (seedRandom(seedBase + 300, 1) + 1) / 2;
            scaleRandomY = rScaleY > 1 ? (1 + rand01 * (rScaleY - 1)) : (rScaleY + rand01 * (1 - rScaleY));
          }

        if (rRotate !== 0 && notFreeze) {
            const rotDeg = seedRandom(seedBase + 400, rRotate);
            rotRandomRad = rotDeg * Math.PI / 180;
          }
        }

        const rNudge = new V2({ x: extraNudgeX, y: extraNudgeY });

        // translation (use the precomputed transform, perspX/Y, and offsets)
        const p1 = restorePoint(
          transformPersp(
            new V2(line.p1.add(nudge).add(rNudge)).sub(anchor).transform(transform),
            perspX, perspY, perspSafety, state.perspRotate, state.perspFocal
          ),
          anchor, postTransform, alongPerspX, alongPerspY, preCenter, state.perspRotate, state.perspFocal
        );

        const p2 = restorePoint(
          transformPersp(
            new V2(line.p2.add(nudge).add(rNudge)).sub(anchor).transform(transform),
            perspX, perspY, perspSafety, state.perspRotate, state.perspFocal
          ),
          anchor, postTransform, alongPerspX, alongPerspY, preCenter, state.perspRotate, state.perspFocal
        );

        // compute midpoint of this line (for per-line random scale/rotate)
        const mid = new V2({
          x: 0.5 * (p1.x + p2.x),
          y: 0.5 * (p1.y + p2.y)
        });

        // apply random scale/rotate if enabled
        if (scaleRandomX !== 1 || scaleRandomY !== 1 || rotRandomRad !== 0) {
          const cos = Math.cos(rotRandomRad);
          const sin = Math.sin(rotRandomRad);

          // applyScaleRotate inlined to avoid function creation per-line
          const localApply = (pt) => {
            const local = pt.sub(mid);
            let x = local.x * scaleRandomX;
            let y = local.y * scaleRandomY;
            if (rotRandomRad !== 0) {
              const rx = x * cos - y * sin;
              const ry = x * sin + y * cos;
              x = rx; y = ry;
            }
            return new V2({ x: x + mid.x, y: y + mid.y });
          };

          const p1t = localApply(p1);
          const p2t = localApply(p2);
          p1.x = p1t.x; p1.y = p1t.y;
          p2.x = p2t.x; p2.y = p2t.y;
        }

        // prepare jsonLine and determine target layer
        const jsonLine = line.original.toJSON();

        const originalLayerId = line.original.layer;
        const baseIndex = idToIndex.get(originalLayerId);
        let targetLayerId = originalLayerId;

        if (typeof baseIndex !== "undefined") {
          const step = (layerIndex - state.layerOrigin);
          const targetIndex = baseIndex + step;

          if (targetIndex < 0 || targetIndex >= layersArray.length) {
            console.warn("Computed targetIndex out of bounds:", targetIndex);
          } else {
            targetLayerId = layersArray[targetIndex].id;
          }
        }

        // compute width with potential random scale contribution (average of X/Y)
        const baseWidth = state.scaleWidth ? (jsonLine.width || 1) * Math.pow(scaleVal, i + 1) : jsonLine.width;
        let widthWithRandom = baseWidth;
        if (scaleRandomX !== 1 || scaleRandomY !== 1) {
          const scaleAvg = (scaleRandomX + scaleRandomY) / 2;
          widthWithRandom = baseWidth * Math.pow(scaleAvg, i + 1);
        }

        let layerOffset = (baseIndex + (state.animationOffset * state.aLayers));

        // shift to be within animation group bounds
        const aBoundsLength = state.groupEnd - state.groupBegin + 1;
        while (layerOffset < (state.groupBegin - 1)) {
          layerOffset = layerOffset + aBoundsLength;
        }

        while (layerOffset > (state.groupEnd - 1)) {
          layerOffset = layerOffset - aBoundsLength;
        }

        transformedLines.push({
          ...jsonLine,
          layer: state.editAnimation ? layersArray[layerOffset].id : targetLayerId,
          id: state.editAnimation ? jsonLine.id : null,
          x1: p1.x + frameCameraOffset.x,
          y1: p1.y + frameCameraOffset.y,
          x2: p2.x + frameCameraOffset.x,
          y2: p2.y + frameCameraOffset.y,
          width: state.rScaleWidth ? widthWithRandom : baseWidth,
          type: 2,
          idx: i
        });

        const newLine = Object.assign(Object.create(Object.getPrototypeOf(line.original)), line.original);
        newLine.p1 = p1;
        newLine.p2 = p2;
        posttransformedLines.push(newLine);
        if (state.selectFinalFrameOnCommit && i == multiALength - 1) {
          state.finalFrameLines.push(newLine);
        }
      } // end per-line loop

      // prepare for next iteration
      if (state.buildOffPrevFrame) {
        pretransformedLines = posttransformedLines.slice();
      }
      posttransformedLines.length = 0;

      let endTime = performance.now();

      if (endTime - startTime > (state.maxUpdateTime * 1000)) {
        console.error(`Time exception: Operation took longer than ${(state.maxUpdateTime * 1000)}ms to complete`);
        this.componentUpdateResolved = true;
        store.dispatch(revertTrackChanges());
        store.dispatch(setEditScene(new Millions.Scene()));
        return "Time";
      }

      // dispatch and save results (same as original)
      store.dispatch(addLines(transformedLines));
      state.rememberedLines.push(...transformedLines);
      state.allLines = allLines;
    } // end of animation frame loop

    // Save signature for active keyframe for next run reuse
    this._activeTransformSignature = activeSignature;

    state.updateWholeAnimation = false;
    this.changed = true;
  } finally {
    this._transformInProgress = false;
  }
}

    drawBoundingBoxes(bb, anchor, transform, postTransform, alongPerspX, alongPerspY, preCenter) {
        const zoom = getEditorZoom(this.store.getState());
        const preBox = genBoundingBox(
            bb.x,
            bb.y,
            bb.x + bb.width,
            bb.y + bb.height,
            anchor.x,
            anchor.y,
            20 / zoom,
            1 / zoom,
            new Millions.Color(0, 0, 0, 64),
            0,
        );
        for (const line of preBox) {
            const p1 = restorePoint(
                new V2(line.p1).sub(anchor),
                anchor,
                postTransform,
                alongPerspX,
                alongPerspY,
                preCenter,
                this.state.perspRotate,
                this.state.perspFocal
            );
            const p2 = restorePoint(
                new V2(line.p2).sub(anchor),
                anchor,
                postTransform,
                alongPerspX,
                alongPerspY,
                preCenter,
                this.state.perspRotate,
                this.state.perspFocal
            );
            line.p1.x = p1.x;
            line.p1.y = p1.y;
            line.p2.x = p2.x;
            line.p2.y = p2.y;
        }
        const postBox = genBoundingBox(
            bb.x,
            bb.y,
            bb.x + bb.width,
            bb.y + bb.height,
            anchor.x,
            anchor.y,
            20 / zoom,
            1 / zoom,
            new Millions.Color(0, 0, 0, 255),
            1,
        );
        let perspX = sumOf(this.state.perspX, this.state.activeMultiId);
        let perspY = sumOf(this.state.perspY, this.state.activeMultiId);
        if (this.state.relativePersp) {
            const offset = this.state.activeMultiId + 1;
            const scale = sumOf(this.state.scale, this.state.activeMultiId) + offset;
            const scaleX = sumOf(this.state.scaleX, this.state.activeMultiId) + offset;
            const scaleY = sumOf(this.state.scaleY, this.state.activeMultiId) + offset;
            perspX = perspX / (bb.width * scale * scaleX);
            perspY = perspY / (bb.height * scale * scaleY);
        } else {
            perspX = 0.01 * perspX;
            perspY = 0.01 * perspY;
        }
        const perspSafety = Math.pow(10, this.state.perspClamping);
        for (const line of postBox) {
            const p1 = restorePoint(
                transformPersp(
                    new V2(line.p1).sub(anchor).transform(transform),
                    perspX,
                    perspY,
                    perspSafety,
                    this.state.perspRotate,
                    this.state.perspFocal
                ),
                anchor,
                postTransform,
                alongPerspX,
                alongPerspY,
                preCenter,
                this.state.perspRotate,
                this.state.perspFocal
            );
            const p2 = restorePoint(
                transformPersp(
                    new V2(line.p2).sub(anchor).transform(transform),
                    perspX,
                    perspY,
                    perspSafety,
                    this.state.perspRotate,
                    this.state.perspFocal
                ),
                anchor,
                postTransform,
                alongPerspX,
                alongPerspY,
                preCenter,
                this.state.perspRotate,
                this.state.perspFocal
            );
            line.p1.x = p1.x;
            line.p1.y = p1.y;
            line.p2.x = p2.x;
            line.p2.y = p2.y;
        }

        // get transform point locations
        const p = this.state.activePoint;
        const o = SCALE_POINT_OFFSET / (zoom);

        // corner coords without offsets
        const tlX0 = postBox[0].p1.x;
        const tlY0 = postBox[0].p1.y;
        const trX0 = postBox[3].p2.x;
        const trY0 = postBox[3].p2.y;
        const brX0 = postBox[1].p2.x;
        const brY0 = postBox[1].p2.y;
        const blX0 = postBox[0].p2.x;
        const blY0 = postBox[0].p2.y;

        // middle coords
        const midX = (tlX0 + brX0) / 2;
        const midY = (tlY0 + brY0) / 2;
        const tmX = (tlX0 + trX0) / 2;
        const tmY = (tlY0 + trY0) / 2;
        const mrX = (brX0 + trX0) / 2;
        const mrY = (brY0 + trY0) / 2;
        const bmX = (brX0 + blX0) / 2;
        const bmY = (brY0 + blY0) / 2;
        const mlX = (tlX0 + blX0) / 2;
        const mlY = (tlY0 + blY0) / 2;

        // apply offset if no point is selected or if that point is selected
        const apply = (id) => (!p || p.id === id);

        // compute offsets based on angle between opposite points
        // pairs: 0<->4 (TL<->BR), 1<->5 (TM<->BM), 2<->6 (TR<->BL), 3<->7 (MR<->ML)
        const computedOffsets = {}; // map id -> { xo, yo }

        function computePairOffsets(aX, aY, aId, bX, bY, bId) {
            // angle from A to B
            const angle = Math.atan2(bY - aY, bX - aX);
            const dx = Math.cos(angle) * o;
            const dy = Math.sin(angle) * o;
            // choose sign so A is moved away from B (A gets -dx,-dy), B moved away from A (B gets +dx,+dy)
            computedOffsets[aId] = { xo: -dx, yo: -dy };
            computedOffsets[bId] = { xo: dx, yo: dy };
        }

        // compute for all four opposite pairs
        computePairOffsets(tlX0, tlY0, 0, brX0, brY0, 4);
        computePairOffsets(tmX, tmY, 1, bmX, bmY, 5);
        computePairOffsets(trX0, trY0, 2, blX0, blY0, 6);
        computePairOffsets(mrX, mrY, 3, mlX, mlY, 7);

        // helper to get offset (0 if not applied)
        const getOffset = (id) => {
            const off = computedOffsets[id] ?? { xo: 0, yo: 0 };
            return {
                xo: apply(id) ? off.xo : 0,
                yo: apply(id) ? off.yo : 0,
            };
        };

        // build points using computed offsets
        const off0 = getOffset(0);
        const off1 = getOffset(1);
        const off2 = getOffset(2);
        const off3 = getOffset(3);
        const off4 = getOffset(4);
        const off5 = getOffset(5);
        const off6 = getOffset(6);
        const off7 = getOffset(7);

        this.state.points = [
            { id: 0, x: tlX0 + off0.xo, y: tlY0 + off0.yo, xo: off0.xo, yo: off0.yo }, // TL
            { id: 1, x: tmX + off1.xo, y: tmY + off1.yo, xo: off1.xo, yo: off1.yo }, // TM
            { id: 2, x: trX0 + off2.xo, y: trY0 + off2.yo, xo: off2.xo, yo: off2.yo }, // TR
            { id: 3, x: mrX + off3.xo, y: mrY + off3.yo, xo: off3.xo, yo: off3.yo }, // MR
            { id: 4, x: brX0 + off4.xo, y: brY0 + off4.yo, xo: off4.xo, yo: off4.yo }, // BR
            { id: 5, x: bmX + off5.xo, y: bmY + off5.yo, xo: off5.xo, yo: off5.yo }, // BM
            { id: 6, x: blX0 + off6.xo, y: blY0 + off6.yo, xo: off6.xo, yo: off6.yo }, // BL
            { id: 7, x: mlX + off7.xo, y: mlY + off7.yo, xo: off7.xo, yo: off7.yo }, // ML
        ];

        if (this.state.activePoint?.id !== 8) {
            this.state.points.push({ id: 8, x: midX, y: Math.min(tmY, bmY) - 100 / zoom }); // Rotate default location
        } else {
            this.state.points.push(this.state.activePoint); // Rotate active
        }

        if (this.state.warpWidget) {
            if (this.state.activePoint?.id !== 9) {
                this.state.points.push({ id: 9, x: midX, y: midY }); // Perspective
            } else {
                this.state.points.push(this.state.activePoint); // Perspective active
            }
            if (this.state.activePoint?.id !== 10) {
                this.state.points.push({ id: 10, x: tlX0 - 80 / zoom, y: tlY0 - 80 / zoom }); // Skew
            } else {
                this.state.points.push(this.state.activePoint); // Skew active
            }
        } else {
            this.state.points.push({ id: 11, x: (midX), y: (midY) }); // Translate
        }

        this.state.midpoint = { x: midX, y: midY };
        const pointBoxes = genBoundingBoxPoints(this.state.points, POINT_SIZE / zoom, 1 / zoom, 1);
        const boxes = this.state.advancedTools ? [...preBox, ...postBox, ...pointBoxes] : [...postBox, ...pointBoxes];
        this.state.renderBB = boxes;
        if (this.state.renderOverlay.length == 0) {
        this.store.dispatch(setEditScene(Millions.Scene.fromEntities(boxes)));
        }
    }

    getTransform (rotate, scale, multiScaleX, multiScaleY, skewX, skewY) {

        let scaleX = scale * multiScaleX;
        if (this.state.flipX) {
            scaleX *= -1;
        }
        let scaleY = scale * multiScaleY;
        if (this.state.flipY) {
            scaleY *= -1;
        }
        const transform = buildAffineTransform(
            skewX, skewY,
            scaleX, scaleY,
            rotate * Math.PI / 180
        );
        return transform;
    }

    active () {
        if (typeof this.state.multiALength[this.state.activeMultiId] === "undefined") {
            this.state.multiALength[this.state.activeMultiId] = 1;
        }
        return this.state.active && this.selectedPoints.size > 0 && (
            this.state.multiALength[0] !== 1
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
        store,
        DefaultTool,
    } = unsafeWindow;

    const e = React.createElement;

    class TransformTool extends DefaultTool {
        dispatch(a) {
            super.dispatch(a);
        }
        getState() {
            return super.getState();
        }
        toTrackPos(p) {
            return super.toTrackPos(p);
        }
    }
    class XaviAnimateModComponent extends React.Component {
        constructor (props) {
            super(props);

            this._toolCtx = {
                getState: () => store.getState(),
                dispatch: (a) => store.dispatch(a),
            };

let _updateTransRaf = null;

function _updateTransLoop() {
  try {
    if (this.state && !this.state.manualUpdateMode) {
      this.state.transUpdated = true;
        this.mod.onUpdate();
            if (this.state.oInvisFrames && this.state.updateALot) {
                this._onInvisStoreChange({ force: true })
            }
    }
  } catch (err) {
    console.error('_updateTransLoop error', err);
  }

  _updateTransRaf = requestAnimationFrame(_updateTransLoop.bind(this));
}
if (!_updateTransRaf) _updateTransLoop.call(this);

document.addEventListener('keydown', (event) => {
  if (this.state.editingHotkey) return;
  const keyStr = this.keyEventToString(event);

if (this.state.active && (Object.keys(this.defaultMainHotkeys).some(k => (this.state[k] ?? this.defaultMainHotkeys[k]) === keyStr))) {
    event.preventDefault(); // prevents default actions (if any)
    event.stopImmediatePropagation(); // prevents other handlers on the same target
    event.stopPropagation(); // extra safety for bubbling handlers
  }


  if (keyStr === this.state.keyCommit) {
    console.log("committing");
    if (!this.state.manualUpdateMode) {
      this.onCommit();
      return;
    }
  }
    if (keyStr === this.state.keyManualUpdate) {
    console.log("updating");
    if (this.state.manualUpdateMode) {
      this.state.transUpdated = true;
      this.mod.onUpdate();
            if (this.state.oInvisFrames && this.state.updateALot) {
                this._onInvisStoreChange({ force: true })
            }
    }
  } else if (keyStr.includes(this.state.keySetALength)) {
    if (this.state.active) {
        let backwards = false;
        let move = false;
    if (keyStr.includes(this.state.keySetALengthBackwards)) {
        backwards = true;
    }
    if (keyStr.includes(this.state.keyMoveALength)) {
        move = true;
    }
      this.setALength(backwards, move);
    }
  } else if (keyStr === this.state.keyToggleOverlay) {
    console.log("toggling overlay");
    if (this.state.oInvisFrames) {
      this.disableOInvisFrames();
    } else {
      this.enableOInvisFrames();
    }
  } else if (keyStr === this.state.keyResetTransform) {
    console.log("resetting transform");
      this.onResetTransform();
  } else if (keyStr === this.state.keyPrevMultiTrans) {
    console.log("prev transform");
      if (this.state.activeMultiId !== 0) {
          this.setState({activeMultiId: (this.state.activeMultiId - 1)});
      }
  } else if (keyStr === this.state.keyNextMultiTrans) {
    console.log("next transform");
      if ((this.state.multiALength[this.state.activeMultiId]) !== 1) {
          this.setState({activeMultiId: (this.state.activeMultiId + 1)});
      }
  } else if (keyStr === this.state.keyToggleManualUpdate) {
    console.log("toggled manual");
    if (this.state.manualUpdateMode) {
          this.setState({manualUpdateMode: false});
      } else {
          this.setState({manualUpdateMode: true});
      }
  }
}, true);
            this.defaultKeyframe = {
                nudgeXSmall: 0,
                nudgeYSmall: 0,
                scaleX: 0, // shows as 1
                scaleY: 0, // shows as 1
                scale: 0, // shows as 1
                rotate: 0,
                anchorX: 0,
                anchorY: 0,
                perspX: 0,
                perspY: 0,
                skewX: 0,
                skewY: 0,

                rMoveX: 0,
                rMoveY: 0,
                rScaleX: 0, // shows as 1
                rScaleY: 0, // shows as 1
                rRotate: 0,
            };
            this.defaults = {
                // === Animation Tools (animTools) ===
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
                oSelected: true,

                autoLayerSync: false,
                autoLock: true,
                autoLockActive: false,

                // === Animation Folder (folderSettings) ===
                copyLines: false,

                // === Animation Layers (aLayersSection) ===
                aFrames: 1,
                aFramesTemp: 1,
                customLayerCount: false,
                aLayers: 1,
                editLayers: false,

                // === Transform Tools (transTools) ===
                activeMultiId: 0,
                multiALength: {},
                smoothMulti: true,
                smoothMultiEnds: false,
                impactFutureKeyframes: false,

                ...this.defaultKeyframe,
                inverse: false,
                warpWidget: false,
                buildOffPrevFrame: false,
                editAnimation: false,
                animationOffset: 0,
                animatedAnchors: true,
                camLock: false,
                parallax: 0,

                scaleWidth: false,
                flipX: false,
                flipY: false,

                // === Adjust Origin (relativeTools) ===
                alongPerspX: 0,
                alongPerspY: 0,
                alongRot: 0,

                // === Warp Tools (warpTools) ===
                relativePersp: false,
                perspClamping: -5,
                perspRotate: true,
                perspFocal: 100,

                // === Randomness (randomness) ===
                shake: false,
                shakeInterval: 1,
                shakeFreeze: false,
                rSeed: 0,
                rScaleWidth: false,

                // === Performance & Commit (performance) ===
                toggleUpdateWholeAnimation: false,
                manualUpdateMode: false,
                maxUpdateTime: 5,

                scaleMax: 10,

                selectFinalFrameOnCommit: true,
                resetAnimationOnCommit: false,
            };
            this.defaultMainHotkeys = {
                // these keys' custom values prevent other event with those key combos when the mod is active
                keyCommit: "Enter",
                keyManualUpdate: "Enter",
                keySetALength: "I",
                keyToggleOverlay: "V",
                keyResetTransform: "Shift+T",
                keyPrevMultiTrans: "ArrowDown",
                keyNextMultiTrans: "ArrowUp",
                keyToggleManualUpdate: "Ctrl+M"
            };
            this.defaultHotkeys = {
                // === Hotkeys (hotkeys) ===
                ...this.defaultMainHotkeys,
                keySetALengthBackwards: "Shift",
                keyMoveALength: "Ctrl",
            };
            this.state = {
                ...this.defaults,
                ...this.defaultHotkeys,
                active: false,
                numLayers: getSimulatorLayers(store.getState()).length,

                animTools: true,
                folderSettings: false,
                aLayersSection: false,
                transTools: false,
                transformations: false,
                relativeTools: false,
                warpTools: false,
                randomness: false,
                performance: false,
                hotkeys: false,

                points: [],
                midpoint: {x: 0, y: 0 },
                activePoint: false,
                selectedPoints: null,
                renderOverlay: [],
                renderBB: [],
                allLines: [],
                rememberedLines: [],
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

            this.loadSavedHotkeys();

            if (!this._docListenersInstalled) {
                const _computeButton = (ev) => {
                    if (ev.buttons & 2) return 2;
                    if (ev.buttons & 1) return 0;
                    if (ev.buttons & 4) return 1;
                    return typeof ev.button === "number" ? ev.button : -1;
                };
                this._eventToPos = (ev) => {
                    const canvas = document.querySelector("canvas");
                    if (canvas) {
                        const r = canvas.getBoundingClientRect();
                        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
                    }
                    return { x: ev.clientX, y: ev.clientY };
                };
                this._onDocPointerDown = (ev) => {
                    const fakeDown = { button: _computeButton(ev), pos: this._eventToPos(ev), _originalEvent: ev, alt: isAltDown, ctrl: isCtrlDown, shift: isShiftDown};
                    this.onPointerDown(fakeDown);
                    this._draggingPointerId = ev.pointerId;
                    if (!this._onDocPointerMove) {
                        this._onDocPointerMove = (mev) => {
                            if (this._draggingPointerId != null && mev.pointerId !== this._draggingPointerId) return;

                            const fakeMove = { button: _computeButton(mev), pos: this._eventToPos(mev), _originalEvent: mev, alt: isAltDown, ctrl: isCtrlDown, shift: isShiftDown};
                            this.onPointerDrag(fakeMove);
                        };

                        this._onDocPointerUp = (uev) => {
                            if (this._draggingPointerId != null && uev.pointerId !== this._draggingPointerId) return;

                            const fakeUp = { button: _computeButton(uev), pos: this._eventToPos(uev), _originalEvent: uev };
                            this.onPointerUp(fakeUp);
                            this._draggingPointerId = null;
                        };

                        document.addEventListener("pointermove", this._onDocPointerMove, true);
                        document.addEventListener("pointerup", this._onDocPointerUp, true);
                    }
                };

                document.addEventListener("pointerdown", this._onDocPointerDown, true);

                this._docListenersInstalled = true;

                // key presses
                let isAltDown = false;
                let isShiftDown = false;
                let isCtrlDown = false;

                document.addEventListener('keydown', (e) => {
                    if (e.key === "Alt") isAltDown = true;
                    if (e.key === "Control") isCtrlDown = true;
                    if (e.key === "Shift") isShiftDown = true;
                });

                document.addEventListener('keyup', (e) => {
                    if (e.key === "Alt") isAltDown = false;
                    if (e.key === "Control") isCtrlDown = false;
                    if (e.key === "Shift") isShiftDown = false;
                });
            }
        }
        onPointerDown(e) {
            const pos = DefaultTool.prototype.toTrackPos.call(this._toolCtx, e.pos);
            const multiId = this.state.activeMultiId;
            const radius = POINT_RADIUS / getEditorZoom(store.getState()) / 2;

            // find the index of the closest point that is also in bounds
            let bestIndex = -1;
            let bestDistSq = Infinity;
            for (let i = 0; i < this.state.points.length; i++) {
                const p = this.state.points[i];
                if (inBounds(pos, p, radius)) {
                    const dx = pos.x - p.x;
                    const dy = pos.y - p.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < bestDistSq) {
                        bestDistSq = distSq;
                        bestIndex = i;
                    }
                }
            }
            if (bestIndex === -1) return;

            const i = bestIndex;
            if (e.button === 2) {
                if (e.ctrl) {
                    console.log("reseting keyframe to animation origin");
                    this.onResetTransform(true);
                    return;
                }
                if (e.shift) {
                    console.log("reseting keyframe");
                    this.onResetTransform();
                    return;
                }
                console.log("deleting keyframe");
                this.onDeleteKeyframe();
                return;
            }

            const id = this.state.points[i].id;
            if (id == 9) {
                this.state.activePoint = { id: id, x: (this.state.midpoint.x), y: (this.state.midpoint.y) };
            } else if (id == 10) {
                const zoom = getEditorZoom(store.getState());
                const tl = this.state.points[0];
                const skewPX = (tl.x - tl.xo) - 80 / zoom;
                const skewPY = (tl.y - tl.yo) - 80 / zoom;
                this.state.activePoint = { id: id, x: skewPX, y: skewPY};
            } else if (id == 11) {
                this.state.activePoint = { id: id, x: (this.state.midpoint.x - (this.state.nudgeXSmall[multiId] ?? 0)), y: (this.state.midpoint.y + (this.state.nudgeYSmall[multiId] ?? 0)) };
            } else {
                this.state.activePoint = this.state.points[i];
            }

            const selectedPoints = getSelectToolState(store.getState()).selectedPoints;
            this.setState({ selectedPoints: selectedPoints });
            return;
        }
        onPointerDrag(e) {
            if (this.state.activePoint) {
                const pos = DefaultTool.prototype.toTrackPos.call(this._toolCtx, e.pos);
                const p = this.state.activePoint;
                const mp = this.state.midpoint;
                const pts = this.state.points;
                const zoom = getEditorZoom(store.getState());
                const multiId = this.state.activeMultiId;
                if (e.button === 0) {
                    if (p.id == 8) {
                        // rotation
                        const vec = { x: pos.x - mp.x, y: pos.y - mp.y };
                        // raw angle from position; (-270, 90]
                        let rawAngle = (Math.atan2(vec.y, vec.x)) * -180 / Math.PI - 90;

                        const prev = this.state.rotate[multiId];

                        // shift rawAngle by +/-360 until it's within [-180, 180] of prev
                        let continuousAngle = rawAngle;
                        while (continuousAngle - prev > 180) continuousAngle -= 360;
                        while (continuousAngle - prev < -180) continuousAngle += 360;

                        let rotate = continuousAngle;
                        // angle lock
                        if (e.ctrl) {
                            rotate = Math.round(rotate / 15) * 15;
                        }

                        this.state.activePoint = { id: 8, x: pos.x, y: pos.y };
                        this.setIndexStates([
                            { key: 'rotate', index: multiId, value: rotate },
                        ]);
                        return;

                    } else if (p.id == 9) {
                        // perspective
                        const invert = e.alt ? -1 : 1
                        const perspX = (pos.x - p.x) * invert * zoom / 50;
                        const perspY = (pos.y - p.y) * invert * zoom / 50;
                        if (!(e.alt || e.ctrl)) {
                        this.setIndexStates([
                            { key: 'anchorX', index: multiId, value: 0 },
                            { key: 'anchorY', index: multiId, value: 0 },
                        ]);
                        } else if (e.shift) {
                            const anchorX = (Math.abs(perspX) > Math.abs(perspY)) ? 0.5 * Math.sign(pos.x - p.x) : 0;
                            const anchorY = (Math.abs(perspX) < Math.abs(perspY)) ? -0.5 * Math.sign(pos.y - p.y) : 0;
                        this.setIndexStates([
                            { key: 'anchorX', index: multiId, value: anchorX },
                            { key: 'anchorY', index: multiId, value: anchorY },
                        ]);
                        } else {
                            const anchorX = (Math.abs(perspX) < Math.abs(perspY)) ? Math.min(0.5, Math.abs(pos.x - p.x) * 2 / zoom) * Math.sign(pos.x - p.x) : 0.5 * Math.sign(pos.x - p.x);
                            const anchorY = (Math.abs(perspX) > Math.abs(perspY)) ? Math.min(0.5, Math.abs(pos.y - p.y) * 2 / zoom) * Math.sign(pos.y - p.y) * -1 : -0.5 * Math.sign(pos.y - p.y);
                        this.setIndexStates([
                            { key: 'anchorX', index: multiId, value: anchorX },
                            { key: 'anchorY', index: multiId, value: anchorY },
                        ]);
                        }
                        if(!e.shift) {
                        this.setIndexStates([
                            { key: 'perspX', index: multiId, value: perspX },
                            { key: 'perspY', index: multiId, value: perspY },
                        ]);
                        } else if (Math.abs(perspX) > Math.abs(perspY)) {
                        this.setIndexStates([
                            { key: 'perspX', index: multiId, value: perspX },
                            { key: 'perspY', index: multiId, value: 0 },
                        ]);
                        } else {
                        this.setIndexStates([
                            { key: 'perspX', index: multiId, value: perspX },
                            { key: 'perspY', index: multiId, value: 0 },
                        ]);
                        }
                        return;
                    } else if (p.id == 10) {
                        // skew
                        const skewX = (pos.x - p.x) * zoom / -50; // negative so it stretches toward the cursor
                        const skewY = (pos.y - p.y) * zoom / -50;
                        if(!e.shift) {
                        this.setIndexStates([
                            { key: 'skewX', index: multiId, value: skewX },
                            { key: 'skewY', index: multiId, value: skewY },
                        ]);
                        } else if (Math.abs(skewX) > Math.abs(skewY)) {
                        this.setIndexStates([
                            { key: 'skewX', index: multiId, value: skewX },
                            { key: 'skewY', index: multiId, value: 0 },
                        ]);
                        } else {
                        this.setIndexStates([
                            { key: 'skewX', index: multiId, value: 0 },
                            { key: 'skewY', index: multiId, value: skewY },
                        ]);
                        }
                        return;
                    } else if (p.id == 11) {
                        // translate
                        const nudgeX = (pos.x - p.x);
                        const nudgeY = (pos.y - p.y) * -1;
                        this.setIndexStates([
                            { key: 'nudgeXSmall', index: multiId, value: nudgeX },
                            { key: 'nudgeYSmall', index: multiId, value: nudgeY }
                        ]);
                        return;
                    }
                    // scale
                    let scaleX, scaleY;
                    const px = p.x - p.xo;
                    const py = p.y - p.yo;
                    const posX = pos.x - p.xo;
                    const posY = pos.y - p.yo;
                    const scaleMax = this.state.scaleMax;

                    if (!e.ctrl) { // default matches LRA
                        scaleX = ((posX - mp.x) / (px - mp.x)) - 1;
                        scaleY = ((posY - mp.y) / (py - mp.y)) - 1;
                        this.setIndexStates([
                            { key: 'anchorX', index: multiId, value: 0 },
                            { key: 'anchorY', index: multiId, value: 0 }
                        ]);
                    } else {
                        const q = (p.id > 3) ? pts[p.id - 4] : pts[p.id + 4]; // q is opposite side scale point from active

                        scaleX = ((posX - q.x) / (px - q.x)) - 1;
                        scaleY = ((posY - q.y) / (py - q.y)) - 1;
                        const anchorX = !(p.id === 1 || p.id === 5) ? Math.sign(px - q.x) * -0.5 : 0;
                        const anchorY = !(p.id === 3 || p.id === 7) ? Math.sign(py - q.y) * 0.5 : 0; // makes sure sides have middle anchor
                        this.setIndexStates([
                            { key: 'anchorX', index: multiId, value: anchorX },
                            { key: 'anchorY', index: multiId, value: anchorY }
                        ]);
                    }
                    if (e.alt) {
                        console.log("alt");
                    }
                    if (e.shift) {
                        // scale both ways equally
                        if (Number.isFinite(scaleX) && Number.isFinite(scaleY) && scaleX < scaleMax && -scaleMax < scaleX) {
                            if (scaleX !== -1) { // if scale isn't 0
                        this.setIndexStates([
                            { key: 'scale', index: multiId, value: scaleX },
                            { key: 'scaleX', index: multiId, value: 0 },
                            { key: 'scaleY', index: multiId, value: 0 }
                        ]);
                            }
                        } else if (!Number.isFinite(scaleY) && scaleX !== 0 && scaleX < scaleMax && -scaleMax < scaleX) {
                        this.setIndexStates([
                            { key: 'scale', index: multiId, value: scaleX },
                            { key: 'scaleX', index: multiId, value: 0 },
                            { key: 'scaleY', index: multiId, value: 0 }
                        ]);
                        } else if ((!Number.isFinite(scaleX) || Math.abs(scaleX) > 1000 ) && scaleY !== 0 && scaleY < scaleMax && -scaleMax < scaleY) {
                        this.setIndexStates([
                            { key: 'scale', index: multiId, value: scaleY },
                            { key: 'scaleX', index: multiId, value: 0 },
                            { key: 'scaleY', index: multiId, value: 0 }
                        ]);
                        }
                    } else {
                        // scale both ways independently
                        if (Number.isFinite(scaleX) && scaleX !== -1 && scaleX < scaleMax && -scaleMax < scaleX) {
                        this.setIndexStates([
                            { key: 'scaleX', index: multiId, value: scaleX },
                        ]);
                        }
                        if (Number.isFinite(scaleY) && scaleY !== -1 && scaleY < scaleMax && -scaleMax < scaleY) {
                        this.setIndexStates([
                            { key: 'scaleY', index: multiId, value: scaleY },
                        ]);
                        }
                        this.setIndexStates([
                            { key: 'scale', index: multiId, value: 0 },
                        ]);
                    }
                }
            }
        }
        onPointerUp(e) {
            if (this.state.activePoint) {
                this.state.activePoint = false;

                if (!(this.state.selectedPoints.size === 0)) {
                    const setToolState = (toolId, state) => ({
                        type: "SET_TOOL_STATE",
                        payload: state,
                        meta: { id: toolId },
                    });
                    const setSelectToolState = toolState => setToolState(SELECT_TOOL, toolState);
                    const selectedPoints = new Set(this.state.selectedPoints);

                    setTimeout(() => {
                        console.log("reselecting")
                        store.dispatch(setSelectToolState({ selectedPoints }));
                        this.setState({ selectedPoints: null });
                        // "if you scale without selecting a line in the process, it won't give you the line rider select box (which means it won't show the transform points)
                        // because if you do setSelectToolState when nothing is box selected, it selects it like selecting a single line and idk how to make it not do that"
                        // - XaviLR 2025
                    }, 0);
                }
            }
        }

        componentWillUpdate (nextProps, nextState) {
            let error = this.mod.onUpdate(nextState);
            if (error) {
                this.state.renderBB = [];
                this.setState({ active: false });
            }
        }

onReset (key, multi = false) {
    if (key === "rSeed") {
        this.setState({ [key]: Math.round(Math.random() * 10000) });
        return;
    }

    if (!multi) {
        this.setState({ [key]: this.defaults[key] });
        return;
    }
    this.setState(prev => {
        const prevVal = prev[key];
        let arr;

        if (Array.isArray(prevVal)) {
            arr = prevVal.slice();
        } else if (prevVal && typeof prevVal === 'object') {
            arr = [];
            Object.keys(prevVal).forEach(k => {
                const idx = Number(k);
                if (!Number.isNaN(idx)) arr[idx] = prevVal[k];
            });
        } else if (typeof prevVal !== 'undefined') {
            arr = [prevVal];
        } else {
            arr = [];
        }

        const idx = Number.isInteger(prev.activeMultiId) ? prev.activeMultiId : 0;
        arr[idx] = this.defaults[key];

        return { [key]: arr };
    });
}


        onResetAll () {
            this.setState({ ...this.defaults });
        }

        onResetTransform (toOrigin = false) {
            const index = this.state.activeMultiId;
            const defaults = this.defaultKeyframe || {};

            const updates = Object.keys(defaults).map(key => ({
                key,
                index,
                value: toOrigin ? defaults[key] - sumOf(this.state[key], index - 1) : defaults[key] // fix the "key" part of sumOf
            }));

            this.setIndexStates(updates);
        }

        onCommit () {
            if (this.state.resetAnimationOnCommit) {
                this.setState({
                    ...this.defaultKeyframe,
                    multiALength : [1],
                    activeMultiId: 0
                });
            }
            this.mod.commit();
            if (!this.state.selectFinalFrameOnCommit) {
                this.state.renderBB = [];
                this.setState({ active: false });
            }
        }

onDeleteKeyframe () {
  this.state.updateWholeAnimation = true;

  const index = this.state.activeMultiId;
  if (typeof index !== 'number' || index < 0) return; // guard

  // Build keys from defaultKeyframe + multiALength (dedupe)
  const defaults = Object.keys(this.defaultKeyframe || {});
  const keys = Array.from(new Set(defaults.concat(['multiALength'])));

  if (!keys.length) return;

  this.setState(prev => {
    const patch = {};

    // Remove the item at `index` from each array state that exists
    keys.forEach(key => {
      const arr = prev[key];
      if (!Array.isArray(arr)) return; // skip non-arrays
      if (index >= arr.length) return; // nothing to remove

      // create a new array without the element at `index`
      patch[key] = arr.slice(0, index).concat(arr.slice(index + 1));
    });

    // If nothing to change, abort
    if (Object.keys(patch).length === 0) return null;

    // Determine a reference length to clamp activeMultiId (choose first changed array)
    const refKey = Object.keys(patch)[0];
    const newLen = patch[refKey].length;

    // Clamp activeMultiId
    patch.activeMultiId = newLen > 0
      ? Math.min(index, newLen - 1)
      : 0;

    return patch;
  });
}

setIndexStates(updates = [], shift = true) {
  this.setState(prev => {
    if (!Array.isArray(updates) || updates.length === 0) return null;

    // Helper: convert prevVal into a shallow-copied array
    const makeArrayFromPrev = prevVal => {
      if (Array.isArray(prevVal)) return prevVal.slice();
      if (prevVal && typeof prevVal === 'object') {
        // detect numeric keys -> build an array
        const hasNumericKey = Object.keys(prevVal).some(k => String(Number(k)) === k);
        if (hasNumericKey) {
          const arr = [];
          Object.keys(prevVal).forEach(k => {
            const idx = Number(k);
            if (!Number.isNaN(idx)) arr[idx] = prevVal[k];
          });
          return arr;
        }
        // non-numeric object -> not array-like
        return null;
      }
      // single value -> place at index 0
      if (typeof prevVal !== 'undefined') return [prevVal];
      return [];
    };

    const arrMap = {}; // key -> resulting array (will be shallow-copies)
    const explicitSet = {}; // key -> Set of indices explicitly updated in this call
    const resultPatch = {}; // what we'll return at the end

    // 1) Apply all explicit updates first, building arrMap
    updates.forEach(({ key, index, value }) => {
      if (typeof key === 'undefined' || typeof index === 'undefined') return;
      index = Number(index);
      if (!Number.isFinite(index) || index < 0) return;

      if (!arrMap.hasOwnProperty(key)) {
        arrMap[key] = makeArrayFromPrev(prev[key]) || [];
      }

      arrMap[key][index] = value;

      if (!explicitSet[key]) explicitSet[key] = new Set();
      explicitSet[key].add(index);
    });

    // 2) Possibly apply shifting behavior
    // Determine which keys are eligible to shift: those present in defaultKeyframe, excluding 'multiALength'
    const defaultKeys = new Set(Object.keys(this.defaultKeyframe || {}));
    defaultKeys.delete('multiALength');

    const shouldAttemptShift = Boolean(shift) && prev.impactFutureKeyframes === false;

    if (shouldAttemptShift) {
      // normalize multiALength lookup (allow array or object)
      const makeLookup = prevVal => {
        if (Array.isArray(prevVal)) return i => prevVal[i];
        if (prevVal && typeof prevVal === 'object') {
          return i => prevVal[String(i)];
        }
        return () => undefined;
      };
      const multiALookup = makeLookup(prev.multiALength);

      // For each key we changed that is in defaultKeyframe, check next index
      Object.keys(arrMap).forEach(key => {
        if (!defaultKeys.has(key)) return; // only default transform keys shift
        const indices = explicitSet[key];
        if (!indices) return;

        indices.forEach(idx => {
          const nextIdx = idx + 1;

          // if caller explicitly provided a value for nextIdx, skip shifting (explicit wins)
          if (explicitSet[key] && explicitSet[key].has(nextIdx)) return;

          // if there is no next keyframe (multiALength not defined for next), skip
          const nextMultiLen = multiALookup(nextIdx);
          if (typeof nextMultiLen === 'undefined' || Number(nextMultiLen) === 1) return;

          // gather numeric old/current/future values from prev (fallback to 0)
          // oldCurrent: prev[key][idx] (or object map) OR 0
          let oldCurrent = 0;
          if (prev[key] !== undefined) {
            if (Array.isArray(prev[key])) oldCurrent = Number(prev[key][idx] ?? 0);
            else if (prev[key] && typeof prev[key] === 'object') oldCurrent = Number(prev[key][String(idx)] ?? 0);
            else oldCurrent = Number(prev[key] ?? 0);
          }

          const newCurrent = Number(arrMap[key][idx] ?? 0);

          let prevFuture = 0;
          if (prev[key] !== undefined) {
            if (Array.isArray(prev[key])) prevFuture = Number(prev[key][nextIdx] ?? 0);
            else if (prev[key] && typeof prev[key] === 'object') prevFuture = Number(prev[key][String(nextIdx)] ?? 0);
            else prevFuture = 0;
          }

          const change = newCurrent - oldCurrent;
          const newFuture = prevFuture - change;

          // write into arrMap (overrides previous value only if there wasn't an explicit one)
          arrMap[key][nextIdx] = newFuture;
        });
      });
    }

    // 3) Build patch from arrMap (convert arrays back to normal JS arrays)
    Object.keys(arrMap).forEach(key => {
      resultPatch[key] = arrMap[key];
    });

    // If nothing changed, abort
    if (Object.keys(resultPatch).length === 0) return null;
    return resultPatch;
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
            return { color, displayName: (display || "New Layer").trim(), number: num };
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

            const baseClean = (base + "").replace(/\.(\d+)$/, "");

            // apply names sequentially starting at 1
            seq.forEach((item, i) => {
                const newName = `${colorPrefix}${baseClean}.${i + 1}`;
                store.dispatch(renameLayer(item.layer.id, newName));
            });
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
        }

        findNewLayer(newName) {
            const layers = this.getSimulatorLayers();
            return layers[layers.length - 1];
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

                const copyBase = this._incrementName(base);
                const newName = num ? `${colorPrefix}${copyBase}.${num}` : `${colorPrefix}${copyBase}`;

                // dispatch addLayer
                store.dispatch(addLayer(newName, orig.type));

                let newLayer = this.findNewLayer(newName);

                const targetIndex = item.idx + 1;
                store.dispatch(moveLayer(newLayer.id, targetIndex));

                createdIds.add(newLayer.id);
            }
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
            this.setState((prev) => {
                const prevVal = parseInt(prev.aLayers, 10) || 1;
                return { aLayers: prevVal + 1 };
            });
        }

        setColorForSequence(folderStartIndex, step, color) {
            const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
            seq.forEach(({ layer }) => {
                const old = layer.name || "";
                const rest = old.substring(7) || "";
                const newName = `${color}${rest}`;
                store.dispatch(renameLayer(layer.id, newName));
            });
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
        }

        // Set aLayers by counting layers in active folder ending with ".1"
        computeLayerCountFromFolder(folder) {
            if (!folder || folder.length === 0) return 0;

            // helper to test for a suffix like ".1" or ". 1"
            const makeTester = (n) => new RegExp(`\\.\\s*${n}$|\\.${n}$`, "u");

            // first pass: .1
            let count = folder.reduce((acc, { layer }) => {
                const raw = layer.name || "";
                const rest = raw.substring(7) || "";
                return acc + (makeTester(1).test(rest) ? 1 : 0);
            }, 0);

            // second pass: .2
            if (count <= 0) {
                count = folder.reduce((acc, { layer }) => {
                    const raw = layer.name || "";
                    const rest = raw.substring(7) || "";
                    return acc + (makeTester(2).test(rest) ? 1 : 0);
                }, 0);
            }

            // fallback: folder length
            if (count <= 0) {
                count = folder.length;
            }

            return count;
        }

        copyLayerCount() {
            const folder = this.getFolderLayers();
            const count = this.computeLayerCountFromFolder(folder);
            if (count !== this.state.aLayers) {
                this.setState({ aLayers: count });
            }
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
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
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
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
        }

        // Delete all frames of the animation layer
        deleteSequence(folderStartIndex, step) {
            const seq = this.getSequenceForFolderIndex(folderStartIndex, step);
            if (!seq.length) return;
            // Ask for confirmation (safer)
            if (!confirm(`Delete ${seq.length} frame(s) for this animation layer?`)) return;
            for (const item of seq) {
                store.dispatch({ type: "REMOVE_LAYER", payload: { id: item.layer.id } });
            }
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
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
            // subscribe to store changes AND xavilr
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

                // get current player/frame index
                const frameIndex = (getPlayerIndex(stateBefore) || 0);

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
                    // call getLayerVisibleAtTime on the phone and see if they pick up
                    let visible = false;
                    if (typeof getLayerVisibleAtTime === "function") {
                        // getLayerVisibleAtTime expects (id, index)
                        visible = !!getLayerVisibleAtTime(id, frameIndex);
                    } else {
                        return;
                    }
                    if (visible) { firstVisibleFolderIndex = i; break; }
                }

                if (firstVisibleFolderIndex === -1) {
                    // nothing visible at this frame in this folder
                    return;
                }

                // compute animation frame
                const aLayers = this.state.aLayers || 1;
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
                            if (this.state.autoLockActive) {
                                store.dispatch(setLayerEditable(activeLayerId, false));
                            } else {
                                for (let k = 0; k < aLayers; ++k) {
                                    store.dispatch(setLayerEditable(activeLayerId + k - prevPositionWithinFrame, false));
                                }
                            }
                        }
                        // unlock chosen layer
                        if (this.state.autoLockActive) {
                            store.dispatch(setLayerEditable(chosen.id, true));
                        } else {
                            for (let k = 0; k < aLayers; ++k) {
                                store.dispatch(setLayerEditable(chosen.id + k - prevPositionWithinFrame, true));
                            }
                        }
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
            const force = !!(opts && opts.force);

            const schedule = () => {
                // if not forced and feature disabled, do nothing
                if (!force && !this.state.oInvisFrames) return;

                const stateBefore = store.getState();
                const frameIndex = (getPlayerIndex(stateBefore) || 0);

                // throttle by frame unless forced
                if (!force && this._lastInvisFrame === frameIndex) return;
                this._lastInvisFrame = frameIndex;

                // grab single copy of simulator lines (avoid repeated calls)
                const allLines = unsafeWindow.Selectors.getSimulatorLines(stateBefore) || [];

                // fast proximity test (manual loop avoids creating many closures)
                const radius = 300;
                const radiusSq = radius * radius;
                const editorPos = getEditorCamPos(stateBefore);
                const nearLines = [];
                for (let i = 0; i < allLines.length; ++i) {
                    const line = allLines[i];
                    if (!line || !line.p1 || !line.p2) continue;
                    const dx1 = line.p1.x - editorPos.x, dy1 = line.p1.y - editorPos.y;
                    const dx2 = line.p2.x - editorPos.x, dy2 = line.p2.y - editorPos.y;
                    if (dx1*dx1 + dy1*dy1 <= radiusSq || dx2*dx2 + dy2*dy2 <= radiusSq) {
                        nearLines.push(line);
                    }
                }

                // if nothing nearby, skip renderer update
                if (nearLines.length === 0 && !this.state.renderBB) {
                    // clear overlay if it isn't already empty
                    if (this.state.renderOverlay && this.state.renderOverlay.length) {
                        this.state.renderOverlay = [];
                        try {
                            store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities([]) } });
                        } catch (err) { /* ignore */ }
                    }
                    return;
                }

                // layers, maps, helpers
                const layersArr = this.getSimulatorLayers();
                const idToIndex = new Map(layersArr.map((l, idx) => [l.id, idx]));
                if (typeof getLayerVisibleAtTime !== "function") {
                    console.warn("Layer Automation has not yet been run");
                    return;
                }

                // cache visibility now per layer (cheap, layersArr usually small)
                const visibleNow = new Map();
                for (let i = 0; i < layersArr.length; ++i) {
                    const l = layersArr[i];
                    try {
                        visibleNow.set(l.id, !!getLayerVisibleAtTime(l.id, frameIndex));
                    } catch (e) {
                        visibleNow.set(l.id, true);
                    }
                }

                const oPrev = this.state.oPrevFrames;
                const framesLen = Math.max(1, parseInt(this.state.oFramesLength, 10) || 1);

                // parse opacity state as 0..1 and clamp
                let p = parseFloat(this.state.opacity);
                if (!Number.isFinite(p)) p = 1;
                p = Math.max(0, Math.min(1, p));
                const oInverse = !!this.state.oInverse;

                // --- Precompute weight + blended color per layer to avoid repeating per-line ---
                const layerWeightCache = new Map(); // layerId -> weight (0..1)
                const layerColorCache = new Map();  // layerId -> Millions.Color
                const layerById = new Map(layersArr.map((l) => [l.id, l]));

                for (let i = 0; i < layersArr.length; ++i) {
                    const l = layersArr[i];
                    const lid = l.id;

                    // compute original weight (same logic as your computeOriginalWeight)
                    let weight;
                    if (visibleNow.get(lid)) {
                        weight = 1;
                    } else if (!oPrev) {
                        weight = p;
                    } else {
                        weight = 0;
                        for (let d = 1; d <= framesLen; ++d) {
                            const t = oInverse ? frameIndex + d : frameIndex - d;
                            if (t < 0) continue;
                            try {
                                if (getLayerVisibleAtTime(lid, t)) {
                                    const scale = 1 - (d - 1) / framesLen; // 1 .. 1/framesLen
                                    weight = p * scale;
                                    break;
                                }
                            } catch (e) {
                                weight = p;
                                break;
                            }
                        }
                    }
                    layerWeightCache.set(lid, weight);

                    // compute blended color for layer (cache the blended Millions.Color)
                    // use same hex logic you had; if name missing fallback to white
                    const hex = l && (l.name || "").substring(0, 7);
                    const rgb = this._hexToRgb(hex) || { r: 255, g: 255, b: 255 };
                    const whiten = Math.max(0, Math.min(1, 1 - weight));
                    const blendToWhite = (component) => Math.round(component * (1 - whiten) + 255 * whiten);
                    const blendedR = blendToWhite(rgb.r);
                    const blendedG = blendToWhite(rgb.g);
                    const blendedB = blendToWhite(rgb.b);
                    // store the color object once
                    layerColorCache.set(lid, new Millions.Color(blendedR, blendedG, blendedB, 255));
                }

                // --- Build entries (only for nearLines and only if layer weight > 0) ---
                const lineEntries = [];
                let encounteredCounter = 0;

                for (let i = 0; i < nearLines.length; ++i) {
                    const line = nearLines[i];
                    const lid = line.layer;
                    if (typeof lid === "undefined" || lid === null) continue;

                    const origWeight = layerWeightCache.get(lid) || 0;
                    if (!origWeight) continue;

                    const color = layerColorCache.get(lid) || new Millions.Color(255, 255, 255, 255);

                    let thickness = ((line.width && line.width > 0) ? line.width : 1) * 2;

                    const p1 = { x: line.p1.x, y: line.p1.y, colorA: color, colorB: color, thickness };
                    const p2 = { x: line.p2.x, y: line.p2.y, colorA: color, colorB: color, thickness };

                    const layerIdx = (typeof idToIndex.get(lid) === "number") ? idToIndex.get(lid) : 0;

                    // stable tie key: reuse numeric if possible to allow numeric comparison
                    let tieKey = null;
                    let tieNum = NaN;
                    if (typeof line.id === "number") {
                        tieKey = String(line.id);
                        tieNum = Number(line.id);
                    } else if (typeof line.id === "string") {
                        const maybeNum = Number(line.id);
                        if (!Number.isNaN(maybeNum) && String(maybeNum) === line.id) tieNum = maybeNum;
                        tieKey = line.id;
                    } else {
                        tieKey = `__enc${encounteredCounter++}`;
                        // tieNum remains NaN
                    }

                    // store whiten for sorting
                    const whiten = Math.max(0, Math.min(1, 1 - origWeight));

                    lineEntries.push({ p1, p2, layerIdx, whiten, tieKey, tieNum });
                }

                // add selected-tool highlights if needed (compute once)
                if (this.state.oSelected) {
                    const selectToolState = getToolState(unsafeWindow.store.getState(), SELECT_TOOL);
                    if (selectToolState && selectToolState.selectedPoints) {
                        // build set of line ids from points
                        const getLineIdsFromPoints = (points) => {
                            const set = new Set();
                            for (const pt of points) set.add(pt >> 1);
                            return set;
                        };
                        const lineIdsSet = getLineIdsFromPoints(selectToolState.selectedPoints);

                        // find matching lines from allLines (not only nearLines) - but only add those actually present
                        for (let i = 0; i < allLines.length; ++i) {
                            const ln = allLines[i];
                            if (!ln || typeof ln.id === "undefined") continue;
                            if (!lineIdsSet.has(ln.id)) continue;
                            // add highlight line
                            const colorSel = new Millions.Color(0, 230, 255, 255);
                            const thickness = 0.5;
                            const p1 = { x: ln.p1.x, y: ln.p1.y, colorA: colorSel, colorB: colorSel, thickness };
                            const p2 = { x: ln.p2.x, y: ln.p2.y, colorA: colorSel, colorB: colorSel, thickness };
                            lineEntries.push({ p1, p2, layerIdx: 1e6, whiten: -1, tieKey: `sel${ln.id}`, tieNum: Number(ln.id) });
                        }
                    }
                }

                // If nothing to draw after filtering, possibly clear and exit
                if (lineEntries.length === 0 && !(this.state.renderBB && this.state.renderBB.length)) {
                    if (this.state.renderOverlay && this.state.renderOverlay.length) {
                        this.state.renderOverlay = [];
                        try {
                            store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities([]) } });
                        } catch (err) { /* ignore */ }
                    }
                    return;
                }

                // sort entries - comparator simplified but equivalent to your logic
                const EPS = 1e-12;
                lineEntries.sort((a, b) => {
                    if (Math.abs(a.whiten - b.whiten) > EPS) return b.whiten - a.whiten; // more white first
                    if (a.layerIdx !== b.layerIdx) return a.layerIdx - b.layerIdx; // lower layer first
                    const anIsNum = Number.isFinite(a.tieNum);
                    const bnIsNum = Number.isFinite(b.tieNum);
                    if (anIsNum && bnIsNum) return a.tieNum - b.tieNum;
                    if (a.tieKey < b.tieKey) return -1;
                    if (a.tieKey > b.tieKey) return 1;
                    return 0;
                });

                // create Millions.Line entities and set z index
                const sceneEntities = new Array(lineEntries.length + (this.state.renderBB ? this.state.renderBB.length : 0));
                for (let i = 0; i < lineEntries.length; ++i) {
                    const e = lineEntries[i];
                    const zIndex = i;
                    const lineEntity = new Millions.Line(e.p1, e.p2, 1, zIndex);
                    lineEntity.z = zIndex;
                    sceneEntities[i] = lineEntity;
                }

                // append any renderBB entries at the end (as before)
                if (this.state.renderBB && this.state.renderBB.length) {
                    let offset = lineEntries.length;
                    for (let i = 0; i < this.state.renderBB.length; ++i) {
                        sceneEntities[offset + i] = this.state.renderBB[i];
                    }
                }

                // store and dispatch once
                this.state.renderOverlay = sceneEntities;
                try {
                    store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities(sceneEntities) } });
                } catch (err) {
                    console.warn("error setting renderer scene:", err);
                }
            }; // end schedule()

            if (typeof unsafeWindow !== "undefined" && typeof unsafeWindow.requestAnimationFrame === "function") {
                unsafeWindow.requestAnimationFrame(schedule);
            } else {
                setTimeout(schedule, 0);
            }
        }

        async commitAFrames() {
            const aLayers = this.state.aLayers;
            const aFramesVal = this.state.aFramesTemp;

            const desiredTotal = aLayers * aFramesVal;
            const folderLayers = this.getFolderLayers(); // returns [{layer, idx}, ...]
            const currentTotal = folderLayers.length;

            // fast lookup for folder global positions
            const layersGlobal = this.getSimulatorLayers();

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

                    const colorPrefix = (base.name || "").substring(0, 7) || "#000000";
                    const parsedBase = this.parseLayerName(base);
                    const baseName = parsedBase.displayName || "layer";

                    // build new layer name: color + baseName + '.' + frameNum
                    const newName = `${colorPrefix}${baseName}.${frameNum}`;

                    // dispatch add
                    store.dispatch(addLayer(newName));
                    // rename the first layer if they're setting aFrames for the first time
                    if (((currentTotal / aLayers) == 1) && (frameNum == 2)) {
                    store.dispatch(renameLayer(base.id, `${colorPrefix}${baseName}.1`));
                    }
                    let newLayer = this.findNewLayer(newName);
                    store.dispatch(moveLayer(newLayer.id, insertGlobalIndex));

                    // bump insert index so next insert goes after it
                    insertGlobalIndex += 1;

                    // also append to folderLayers to keep subsequent iterations consistent
                    folderLayers.push({ layer: newLayer, idx: insertGlobalIndex - 1 });
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

            // commit success: commit layers & update state.aFrames to chosen value
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
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
            baseName = (baseName || "").trim() || "New Folder";
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
            // dispatch rename
            store.dispatch(renameFolder(folder.id, newName));
            store.dispatch(commitTrackChanges());
            store.dispatch(revertTrackChanges());
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
            unsafeWindow.getLayerVisibleAtTime = (id, frame) => {
                for (const folderObj of animatedFolders) {
                    const { opts = {}, childLayerIds = [] } = folderObj;
                    const indexInGroup = childLayerIds.indexOf(id);
                    if (indexInGroup === -1) continue;

                    const groupLength = childLayerIds.length;
                    if (groupLength <= 0) break;

                    const adjFrame = frame - opts.offset;
                    let step = Math.floor(adjFrame / opts.time);

                    // number of steps in one cycle
                    const cycleSteps = Math.max(1, groupLength / gcd(groupLength, opts.jump));

                    const isFiniteLoops = !!opts.loops && opts.loops > 0;
                    if (isFiniteLoops) {
                        const maxSteps = opts.loops * cycleSteps;
                        if (step < 0) return false;
                        if ((step >= maxSteps) && opts.grow) return true;
                        if ((step >= maxSteps) && !opts.grow) return false;
                    }

                    // Map step into [0..cycleSteps-1] for indexing (works for negative too)
                    let wrappedStepForIndexing = ((step % cycleSteps) + cycleSteps) % cycleSteps;

                    const startIndex = (wrappedStepForIndexing * opts.jump) % groupLength;

                    if (!opts.grow) {
                        // non-grow: show 'opts.length' consecutive items starting at startIndex
                        for (let i = 0; i < opts.length; i++) {
                            const visibleIndex = (startIndex + i) % groupLength;
                            if (visibleIndex === indexInGroup) return true;
                        }
                        return false;
                    }

                    // grow mode: progressively reveal groups up to wrappedStepForIndexing * opts.jump
                    const maxI = wrappedStepForIndexing * opts.jump;
                    for (let i = 0; i <= maxI; i++) {
                        for (let j = 0; j < opts.length; j++) {
                            const visibleIndex = (i + j) % groupLength;
                            if (visibleIndex === indexInGroup) return true;
                        }
                    }
                    return false;
                }

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
            this.setState({ oInvisFrames: false, renderOverlay: [] });
            if (this._oInvisUnsub) {
                try { this._oInvisUnsub(); } catch (e) { /* ignore */ }
                this._oInvisUnsub = null;
                this._lastInvisFrame = null;
            }

            // immediate clear (keeps original behavior)
            store.dispatch(setEditScene(new Millions.Scene()));

            // run a fresh scene a couple frames later
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    try {
                        this.setState({renderOverlay: [] });
                        store.dispatch(setEditScene(new Millions.Scene()));
                    } catch (e) {
                        console.warn('delayed setEditScene failed', e);
                    }
                });
            });
        }



      setALength(inverse, move) {
            try {
                const stateBefore = store.getState();

                // get current player/frame index
                const frameIndex = (getPlayerIndex(stateBefore) || 0);

                const folderLayers = this.getFolderLayers();
                if (!folderLayers || folderLayers.length === 0) return;

                // find the first (lowest index) visible layer in the folder for this frame
                let firstVisibleFolderIndex = -1;
                for (let i = 0; i < folderLayers.length; i++) {
                    const id = folderLayers[i].layer.id;
                    // call getLayerVisibleAtTime on the phone and see if they pick up
                    let visible = false;
                    if (typeof getLayerVisibleAtTime === "function") {
                        // getLayerVisibleAtTime expects (id, index)
                        visible = !!getLayerVisibleAtTime(id, frameIndex);
                    } else {
                        return;
                    }
                    if (visible) { firstVisibleFolderIndex = i; break; }
                }

                if (firstVisibleFolderIndex === -1) {
                    // nothing visible at this frame in this folder
                    return;
                }

                // compute new animation length value
                const aLayers = this.state.aLayers;
                let newALength = ((firstVisibleFolderIndex - this.state.layerOrigin + this.state.groupBegin) / aLayers) + 1
                if (inverse) {
                    newALength = (newALength * -1) + 2;
                }
                let keyframe = this.state.activeMultiId;
                if (!move
                    && !(this.state.multiALength[keyframe] == 1) // active keyframe is set
                    && !(this.state.multiALength[keyframe + 1] > 1)) { // active keyframe is the final keyframe
                    keyframe = keyframe + 1;
                    this.setState({activeMultiId: keyframe});
                }
                newALength = newALength - sumOf(this.state.multiALength, keyframe - 1) + keyframe;
                while (newALength < 1) {
                    newALength = newALength + this.state.groupEnd - this.state.groupBegin + 1;
                }
                        this.setIndexStates([
                            { key: 'multiALength', index: keyframe, value: newALength }
                        ]);
                    this.setState({inverse: inverse});
            } catch (err) {
                console.warn("setALength error", err);
            }
        }

        _incrementName(name) {
            const loopMatch = name.match(/(\.loop.*)$/i);
            const loopPart = loopMatch ? loopMatch[1] : '';
            const base = loopPart ? name.slice(0, name.length - loopPart.length) : name;

            const digitMatch = base.match(/^(.*?)(\d+)$/);
            if (digitMatch) {
                const prefix = digitMatch[1];
                const num = parseInt(digitMatch[2], 10);
                return prefix + (num + 1) + loopPart;
            } else {
                return base + '2' + loopPart;
            }
        }

        async copyFolderForActiveLayer(opts = {}) {
            if (typeof opts === "boolean") opts = { copyLines: opts };
            const { copyLines = true } = opts;

            const getLayersArray = () => {
                const s = store.getState();
                return s?.simulator?.engine?.engine?.state?.layers?.toArray?.() || [];
            };

            try {
                const activeInfo = this.getActiveLayer();
                const { layers: simLayers, activeLayer, activeIndex } = activeInfo;

                const folderLayerEntries = this.getFolderLayers();
                const oldLayerIds = folderLayerEntries.map(e => e.layer.id);

                const folderId = activeLayer.folderId;
                const globalBefore = getLayersArray();
                const folderLayerObj = globalBefore.find(l => String(l.id) === String(folderId));
                const oldFolderName = (folderLayerObj && (folderLayerObj.name || folderLayerObj.title)) || (`folder_${folderId}`);
                const newFolderName = this._incrementName(oldFolderName);

                const prevFolderIdx = globalBefore.findIndex(l => String(l.id) === String(folderId));
                const beforeIds = new Set(globalBefore.map(l => String(l.id)));

                // create folder
                store.dispatch(addFolder(newFolderName));

                // read fresh layers synchronously
                let workingLayers = getLayersArray();
                let createdFolder = workingLayers.find(l => !beforeIds.has(String(l.id)) && l.name === newFolderName) || workingLayers.find(l => l.name === newFolderName);

                // if still not found, pick last created folder-like layer (best-effort)
                if (!createdFolder) createdFolder = workingLayers[workingLayers.length - 1];

                // prepare to create child layers (detect new items by comparing ids)
                workingLayers = getLayersArray();
                let seenIds = new Set(workingLayers.map(l => String(l.id)));

                const idMap = {};
                const newLayers = [];

                for (let i = 0; i < oldLayerIds.length; ++i) {
                    const oldId = oldLayerIds[i];
                    const oldLayer = (simLayers || []).find(L => String(L.id) === String(oldId)) || workingLayers.find(L => String(L.id) === String(oldId));
                    const childName = oldLayer.name || "layer";

                    // create child
                    store.dispatch(addLayer(childName));

                    // read fresh layers immediately and pick the first new id we can find
                    workingLayers = getLayersArray();
                    const newIds = workingLayers.filter(l => !seenIds.has(String(l.id)));
                    let createdChild = newIds.find(l => l.name === childName) || newIds[0] || workingLayers[workingLayers.length - 1];

                    // update seenIds and mapping
                    seenIds = new Set(workingLayers.map(l => String(l.id)));
                    idMap[String(oldId)] = createdChild.id;
                    newLayers.push(createdChild);
                }

                // move children under the created folder (descending order)
                workingLayers = getLayersArray();
                const folderIdx = workingLayers.findIndex(l => String(l.id) === String(createdFolder.id));
                const targetIndex = (folderIdx === -1) ? workingLayers.length : folderIdx;

                for (let k = newLayers.length - 1; k >= 0; --k) {
                    store.dispatch(moveLayer(newLayers[k].id, targetIndex));
                }

                // refresh newLayers to latest engine objects
                workingLayers = getLayersArray();
                for (let idx = 0; idx < newLayers.length; ++idx) {
                    const nid = String(newLayers[idx].id);
                    const fresh = workingLayers.find(l => String(l.id) === nid);
                    if (fresh) newLayers[idx] = fresh;
                }

                // recompute createdFolderIdx and derive new active layer index
                workingLayers = getLayersArray();
                const createdFolderIdx = workingLayers.findIndex(l => String(l.id) === String(createdFolder.id));

                let newActiveIndex;
                if (typeof activeIndex === "number" && typeof prevFolderIdx === "number") {
                    newActiveIndex = (activeIndex - prevFolderIdx + createdFolderIdx);
                } else {
                    newActiveIndex = workingLayers.findIndex(l => String(l.id) === String(newLayers[0]?.id));
                }
                if (newActiveIndex < 0) newActiveIndex = 0;
                if (newActiveIndex >= workingLayers.length) newActiveIndex = workingLayers.length - 1;

                const newActive = workingLayers[newActiveIndex];
                if (newActive) store.dispatch(setLayerActive(newActive.id));

                // copy lines (build minimal shape engine expects), then commit & revert afterward
                if (copyLines) {
                    let allLines = store.getState().simulator.engine.engine.state.lines;
                    if (allLines && typeof allLines.toArray === "function") allLines = allLines.toArray();
                    allLines = allLines || [];

                    const clonedLines = [];
                    for (let oi = 0; oi < oldLayerIds.length; ++oi) {
                        const oldLayerId = oldLayerIds[oi];
                        const newLayerId = idMap[String(oldLayerId)];
                        if (!newLayerId) continue;

                        const linesForOld = allLines.filter(L => String(L.layer || L.layerId) === String(oldLayerId));
                        for (let j = 0; j < linesForOld.length; ++j) {
                            const orig = linesForOld[j];
                            const x1 = ('x1' in orig && orig.x1 != null) ? orig.x1 : (orig.p1 ? orig.p1.x : 0);
                            const y1 = ('y1' in orig && orig.y1 != null) ? orig.y1 : (orig.p1 ? orig.p1.y : 0);
                            const x2 = ('x2' in orig && orig.x2 != null) ? orig.x2 : (orig.p2 ? orig.p2.x : 0);
                            const y2 = ('y2' in orig && orig.y2 != null) ? orig.y2 : (orig.p2 ? orig.p2.y : 0);
                            const type = (typeof orig.type !== 'undefined' && orig.type !== null) ? orig.type : 2;
                            const width = (typeof orig.width !== 'undefined' && orig.width !== null) ? orig.width : 1;

                            const newLine = {
                                id: null,
                                layer: newLayerId,
                                type,
                                width,
                                x1,
                                y1,
                                x2,
                                y2
                            };

                            clonedLines.push(newLine);
                        }
                    }

                    if (clonedLines.length > 0) {
                        store.dispatch(addLines(clonedLines));
                    }
                }
                store.dispatch(commitTrackChanges());
                store.dispatch(revertTrackChanges());

                return { newFolderId: createdFolder.id, newFolderName: createdFolder.name, idMap, newLayers };
            } catch (err) {
                throw err;
            }
        }

// ---------- hotkeys ----------
// Normalize a KeyboardEvent into canonical string like "Ctrl+Shift+K" or "Enter" or "Space"
keyEventToString(e) {
const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  let k = e.key;

  if (k === ' ') k = 'Space';
  if (modifierKeys.has(k)) {
    return parts.join('+') || k;
  }

  if (k.length === 1) k = k.toUpperCase();

  parts.push(k);
  return parts.join('+');
}

normalizeHotkeyString(s) {
  return s || '';
}

async loadSavedHotkeys() {
  try {
    // finds keyExampleName
    const flatKeys = Object.keys(this.state).filter(k => /^key[A-Z]/.test(k));
    if (flatKeys.length === 0) return;

    const names = flatKeys.map(k => k.replace(/^key/, ''));
    const promises = names.map((name, i) =>
      GM.getValue(`hotkey.${name}`, this.state[flatKeys[i]])
    );
    const values = await Promise.all(promises);

    const newState = {};
    flatKeys.forEach((fk, i) => newState[fk] = this.normalizeHotkeyString(values[i]));
    this.setState(newState);
  } catch (err) {
    console.warn('Failed loading hotkeys', err);
  }
}

async setHotkeyValue(flatKey, value) {
  try {
    if (!/^key[A-Z]/.test(flatKey)) {
      console.warn('setHotkeyValue broken');
      return;
    }
    const name = flatKey.replace(/^key/, '');
    await GM.setValue(`hotkey.${name}`, value);
    // update state and clear editing flag
    const st = {};
    st[flatKey] = value;
    st.editingHotkey = null;
    this.setState(st);
  } catch (err) {
    console.warn('Failed saving hotkey', err);
  }
}

getHotkeyValue(flatKey) {
  if (!/^key[A-Z]/.test(flatKey)) return '';
  return this.state[flatKey] || '';
}

onResetHotkey(flatKey) {
  const def = (this.defaultHotkeys && this.defaultHotkeys[flatKey]) ? this.defaultHotkeys[flatKey] : '';
  this.setHotkeyValue(flatKey, def);
}

// ---------- listening for new hotkey ----------
startListeningForHotkey(flatKey) {
const modifierKeys = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);
  if (this._hotkeyHandler) return;
  if (!/^key[A-Z]/.test(flatKey)) return;

  this.setState({ editingHotkey: flatKey });

  const handler = (e) => {
    // allow Escape and Backspace to work immediately
    if (e.key === 'Escape') {
      e.preventDefault();
      this.stopListeningForHotkey();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.setHotkeyValue(flatKey, '');
      this.stopListeningForHotkey();
      return;
    }

    // If this keydown is *only* a modifier (Ctrl/Shift/Alt/Meta), ignore it
    // so the user can hold Ctrl and press another key.
    if (modifierKeys.has(e.key)) {
      // do NOT preventDefault so the browser/page can still respond to modifiers if needed
      return;
    }

    // Now we have a non-modifier key (possibly while modifiers are held) — commit it.
    e.preventDefault(); // prevent page side-effects for the final bind
    const newKeyStr = this.keyEventToString(e);
    this.setHotkeyValue(flatKey, newKeyStr);
    this.stopListeningForHotkey();

    event.preventDefault(); // prevents default actions
    event.stopImmediatePropagation(); // prevents other handlers on the same target
    event.stopPropagation(); // extra safety for bubbling handlers
  };

  // Use capture so we reliably see the events before page handlers
  document.addEventListener('keydown', handler, true);
  this._hotkeyHandler = handler;
}

stopListeningForHotkey() {
  if (this._hotkeyHandler) {
    document.removeEventListener('keydown', this._hotkeyHandler, true);
    this._hotkeyHandler = null;
  }
  this.setState({ editingHotkey: null });
}

        onActivate () {
            if (this.state.active) {
                this.state.renderOverlay = [];
                this.state.renderBB = [];
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
                onChange: e => (key == "smoothMulti" || "smoothMultiEnds") ? this.setState({ [key]: e.target.checked, updateWholeAnimation: true }) : this.setState({ [key]: e.target.checked }),
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

renderSlider (k, props, title = null, multi = false, softBounds = false, onlyMaxSoft = false, scaleOffset = false) {
    if (!title) title = k;

    const parseNum = v => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    // stored value from state (what we actually keep in state)
    const rawStored = multi
        ? (this.state[k] && this.state[k][this.state.activeMultiId]) ?? 0
        : (this.state[k] ?? 0);

    // displayed value = stored + offset (1 when scaleOffset)
    const value = parseNum(rawStored) + (scaleOffset ? 1 : 0);

    // stored bounds
    const storedMin = ('min' in props) ? parseNum(props.min) : 0;
    const storedMax = ('max' in props) ? parseNum(props.max) : 100;
    const step = ('step' in props) ? parseNum(props.step) : 1;

    // displayed bounds (what the user sees on the inputs)
    const displayMin = storedMin + (scaleOffset ? 1 : 0);
    const displayMax = storedMax + (scaleOffset ? 1 : 0);

    // derive min/max fresh on each render (in displayed coordinates)
    let renderMin = displayMin;
    let renderMax = displayMax;
    if (softBounds) {
        if (!onlyMaxSoft) {
            if (value < displayMin + step * 3) {
                renderMin = value - step * 3;
            }
        }
        if (value > displayMax - step * 3) {
            renderMax = value + step * 3;
        }
    }

    const onChange = e => {
        // e.target.value is the displayed value
        const displayedNew = parseNum(e.target.value);

        // convert back to stored value for validation + state
        const storedNew = scaleOffset ? (displayedNew - 1) : displayedNew;

        // enforce stored range when softBounds is off
        if (!softBounds && !(storedMin <= storedNew && storedNew <= storedMax)) return;

if (multi) {
  this.setState(prev => {
    const prevVal = prev[k];
    let arr;

    if (Array.isArray(prevVal)) {
      arr = prevVal.slice();
    } else if (prevVal && typeof prevVal === 'object') {
      // convert object-like map into array (preserve numeric keys)
      arr = [];
      Object.keys(prevVal).forEach(key => {
        const idxNum = Number(key);
        if (!Number.isNaN(idxNum)) arr[idxNum] = prevVal[key];
      });
    } else if (typeof prevVal !== 'undefined') {
      // single value -> put at index 0
      arr = [prevVal];
    } else {
      arr = [];
    }

    const idx = Number.isInteger(prev.activeMultiId) ? prev.activeMultiId : 0;

    // ensure numeric defaults
    const oldCurrent = Number.isFinite(Number(arr[idx])) ? Number(arr[idx]) : 0;
    const newCurrent = Number.isFinite(Number(storedNew)) ? Number(storedNew) : 0;

    // set current keyframe value
    arr[idx] = newCurrent;

    const nextIdx = idx + 1;
    const multiALenArr = prev.multiALength;
    if (
      prev.impactFutureKeyframes === false && // user requested no automatic impact
      Array.isArray(multiALenArr) && // multiALength exists as array
      typeof multiALenArr[nextIdx] !== 'undefined' && // next keyframe exists
      Number(multiALenArr[nextIdx]) !== 1 // next keyframe's multiALength != 1
    ) {
      const prevFuture = Number.isFinite(Number(arr[nextIdx])) ? Number(arr[nextIdx]) : 0;
      const change = newCurrent - oldCurrent; // positive if increased
      const newFuture = prevFuture - change; // subtract the change
      arr[nextIdx] = newFuture;
    }

    return { [k]: arr };
  });
} else {
  this.setState({ [k]: storedNew });
}

    };

    const numericProps = {
        ...props,
        // show the displayed value
        value,
        onChange,
        // show displayed min/max
        min: renderMin,
        max: renderMax,
        step
    };

    return e("div", null,
        title,
        e("input", { style: { width: "4em" }, type: "number", ...numericProps }),
        e("input", { type: "range", ...numericProps, onFocus: e => e.target.blur() }),
        e("button", { onClick: () => this.onReset(k, multi) }, "⟳")
    );
}

        renderSpacer(height = 8) {
            return e("div", { style: { height: `${height}px`, flex: "0 0 auto" } });
        }
        renderDivider(height = 1, color = "#ccc", margin = 8) {
            return e("div", {
                style: {
                    height: `${height}px`,
                    backgroundColor: color,
                    margin: `${margin}px 0`,
                    flex: "0 0 auto"
                }
            });
        }

renderHotkey(flatKey, title = null) {
  if (!title) title = flatKey;
  if (!/^key[A-Z]/.test(flatKey)) return e('div', null, 'Invalid hotkey key');

  const current = this.getHotkeyValue(flatKey) || '';
  const editing = this.state.editingHotkey === flatKey;

  const boxStyle = {
    display: 'inline-block',
    border: '1px solid #888',
    padding: '0.2em 0.5em',
    marginLeft: '0.5em',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: '5em',
    textAlign: 'center',
    borderRadius: '4px',
    background: editing ? '#f3f3f3' : 'white'
  };

  return e('div', null,
    e('span', null, title),
    e('button',
      {
        onClick: () => {
          if (editing) this.stopListeningForHotkey();
          else this.startListeningForHotkey(flatKey);
        },
        title: 'Click then press a key, Escape to cancel, Backspace to clear',
        style: boxStyle
      },
      editing ? 'Press key...' : (current || '—')
    ),
    e('button',
      {
        onClick: () => this.onResetHotkey(flatKey),
        title: 'Reset to default',
        style: { marginLeft: '0.4em', cursor: 'pointer' }
      },
      '⟳'
    )
  );
}


        render () {

            const folder = this.getFolderLayers();
            const desired = this.computeLayerCountFromFolder(folder);

            if (!this.state.customLayerCount && this.state.active) {
                if (desired !== this.state.aLayers) {
                    if (!this._layerCountUpdateScheduled) {
                        this._layerCountUpdateScheduled = true;
                        setTimeout(() => {
                            this._layerCountUpdateScheduled = false;
                            if (this.state.aLayers !== desired) {
                                this.setState({ aLayers: desired });
                            }
                        }, 0);
                    }
                }
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
                            this.renderCheckbox("autoLock", "Auto-Lock Layers"),
                            this.renderCheckbox("autoLockActive", "Auto-Lock Active Animation Layer Only"),
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
                            this.state.oPrevFrames
                            && e(
                                "div",
                                null,
                                this.renderSlider("oFramesLength", { min: 1, max: 10, step: 1 }, "Previous Frames"),
                                this.renderCheckbox("oInverse", "Show Future Instead"),
                            ),
                            this.renderSlider("opacity", { min: 0, max: 1, step: 0.01 }, "Opacity"),
                            this.renderCheckbox("oSelected", "Render Selected Lines"),
                        ),
                        this.renderSpacer(),
                        e("button", { onClick: () => { this.scanForAnimatedFolders();} }, "Update Layer Automation"),
                    ),
                    this.renderSection("folderSettings", "Animation Folder"),
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
                                 e("div", null, e("button", { onClick: () => { this.copyFolderForActiveLayer(this.state.copyLines)} }, "📋 Copy Folder") ),
                                 this.renderCheckbox("copyLines", "Copy Folder with Lines"),
                                 this.renderDivider(),

                                 // Loop toggle and Grow toggle row
                                 e("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
                                   // Loop checkbox
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
                                   // Time (T) -> default 1
                                   this.renderFolderSlider("Time", parsed.time, -20, 20, 1, 1, (newVal) => {
                            const s = { ...parsed, time: newVal, loopEnabled: true };
                            this.updateFolderLoopName(s);
                        }),

                                   // Length (L) -> default 1, min 1
                                   this.renderFolderSlider("Length", parsed.length, 1, 200, 1, 1, (newVal) => {
                            const s = { ...parsed, length: Math.max(1, newVal), loopEnabled: true };
                            this.updateFolderLoopName(s);
                        }),

                                   // Frame Offset (F) -> default 0
                                   this.renderFolderSlider("Frame Offset", parsed.frameOffset, -200, 200, 1, 0, (newVal) => {
                            const s = { ...parsed, frameOffset: newVal, loopEnabled: true };
                            this.updateFolderLoopName(s);
                        }),

                                   // Jump (J) -> default 1, min 1
                                   this.renderFolderSlider("Jump", parsed.jump, 1, 50, 1, 1, (newVal) => {
                            const s = { ...parsed, jump: Math.max(1, newVal), loopEnabled: true };
                            this.updateFolderLoopName(s);
                        }),

                                   // Loops (X) -> default 0 (infinite), min 0
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
                        this.state.customLayerCount
                        && e(
                            "div",
                            null,
                            e("button", emojiButtonProps(`Toggle editable`, () => this.setState({ customLayerCount: false })), "🔓"),
                            this.renderSlider("aLayers", { min: 1, max: 20, step: 1 }, "Animated Layers "),
                        ),
                        !this.state.customLayerCount
                        && e(
                            "div",
                            null,
                            e("button", emojiButtonProps(`Toggle editable`, () => this.setState({ customLayerCount: true })), "🔒"),
                            "Animated Layers ", e("input", { style: { width: "4em" }, type: "number", value: this.state.aLayers, }),
                        ),

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
        }

        const targetIndexWithinFolder = frameIndex * num + folderIndex;
        let targetLayer = folderLayers[targetIndexWithinFolder].layer;
        if (!(targetIndexWithinFolder >= 0 && targetIndexWithinFolder < folderLayers.length)) {
            let targetLayer = this.getSequenceForFolderIndex(folderIndex, num)[0];
        }
        store.dispatch(setLayerActive(targetLayer.id));
        if (this.state.autoLockActive) {
            store.dispatch(setLayerEditable(activeLayerId, false));
            store.dispatch(setLayerEditable(targetLayer.id, true));
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
          title: "Adds/Removes layers"
      }, "Commit Layer Frames")
       ),
  ),

              this.renderSection("transTools", "Transform Tools"),
              this.state.transTools
              && e(
                  "div",
                  { style: this.sectionBox },
                        e("button", emojiButtonProps("Delete Keyframe", () => this.onDeleteKeyframe()), "➖"),
                        e("button", emojiButtonProps("Previous Keyframe", () => this.setState({activeMultiId: Math.max(this.state.activeMultiId - 1, 0)})), "◀️"),
                  `Keyframe #${this.state.activeMultiId + 1}`,
                        e("button", emojiButtonProps("Next Keyframe", () => ((this.state.multiALength[this.state.activeMultiId]) !== 1) && this.setState({activeMultiId: (this.state.activeMultiId + 1)})), "▶️"),
                  this.renderSpacer(),
                  this.renderCheckbox("smoothMulti", "Keyframe Smoothing"),
                  this.renderCheckbox("smoothMultiEnds", "Smooth Start & End"),
                  this.renderCheckbox("animatedAnchors", "Animated Anchors"),
                  this.renderSpacer(),
                  this.renderCheckbox("impactFutureKeyframes", "Impact Future Keyframes"),
                  this.renderDivider(),
                  this.renderCheckbox("warpWidget", "Warp Transform Widget"),
                  this.renderDivider(),
                  this.renderSlider("multiALength", { min: 1, max: 50, step: 1 }, "Animation Length", true, true, true),
                  this.renderCheckbox("inverse", "Animate Backwards"),
                  this.renderSpacer(),
                  this.renderCheckbox("buildOffPrevFrame", "Build Off Previous Frame"),
                  this.renderCheckbox("editAnimation", "Edit Selected Animation"),
                  this.state.editAnimation
                  && e(
                      "div",
                      null,
                      this.renderSlider("animationOffset", { min: -20, max: 20, step: 1 }, "Layer Offset"),
                  ),
                  this.renderDivider(),
                  this.renderCheckbox("selectFinalFrameOnCommit", "Select Final Frame on Commit"),
                  this.renderCheckbox("resetAnimationOnCommit", "Reset Animation on Commit"),
                  this.renderDivider(),
                  this.renderCheckbox("camLock", "Lock Animation to Camera"),
                  !this.state.camLock
                  && e(
                      "div",
                      null,
                      this.renderSlider("parallax", { min: -1.4, max: 1.4, step: 0.01 }, "Parallax", false, true),
                      ),
                  this.renderSpacer(),
                  this.renderSection("transformations", "Main Transformations"),
                  this.state.transformations
                  && e(
                      "div",
                      { style: this.sectionBox },
                      this.renderSlider("nudgeXSmall", { min: -10, max: 10, step: 0.1 }, "Small Move X", true, true),
                      this.renderSlider("nudgeYSmall", { min: -10, max: 10, step: 0.1 }, "Small Move Y", true, true),
                      this.renderSpacer(),
                      this.renderSlider("scaleX", { min: -1, max: 2, step: 0.01 }, "Scale X", true, true, true, true),
                      this.renderSlider("scaleY", { min: -1, max: 2, step: 0.01 }, "Scale Y", true, true, true, true),
                      this.renderSlider("scale", { min: -1, max: 2, step: 0.01 }, "Scale", true, true, true, true),
                      this.renderCheckbox("scaleWidth", "Scale Width"),
                      this.renderSpacer(),
                      this.renderSlider("rotate", { min: -180, max: 180, step: 1 }, "Rotation", true, true),
                      this.renderSpacer(),
                      this.renderCheckbox("flipX", "Flip X"),
                      this.renderCheckbox("flipY", "Flip Y"),
                  ),
                  this.renderSection("relativeTools", "Adjust Origin"),
                  this.state.relativeTools
                  && e(
                      "div",
                      { style: this.sectionBox },
                      this.renderSlider("alongPerspX", { min: -0.5, max: 0.5, step: 0.001 }, "Along Perspective X"),
                      this.renderSlider("alongPerspY", { min: -0.5, max: 0.5, step: 0.001 }, "Along Perspective Y"),
                      this.renderSlider("alongRot", { min: -180, max: 180, step: 1 }, "Along Rotation"),
                      this.renderSpacer(),
                      this.renderSlider("anchorX", { min: -1, max: 1, step: 0.01 }, "Anchor X", true, true),
                      this.renderSlider("anchorY", { min: -1, max: 1, step: 0.01 }, "Anchor Y", true, true),
                  ),
                  this.renderSection("warpTools", "Warp Tools"),
                  this.state.warpTools
                  && e(
                      "div",
                      { style: this.sectionBox },
                      this.renderCheckbox("relativePersp", "Relative Perspective"),
                      this.renderSlider("perspClamping", { min: -10, max: 10, step: 0.01 }, "Perspective Clamping"),
                      this.renderSpacer(),
                      this.renderSlider("perspX", { min: -5, max: 5, step: 0.01 }, "Perspective X", true, true),
                      this.renderSlider("perspY", { min: -5, max: 5, step: 0.01 }, "Perspective Y", true, true),
                      this.renderCheckbox("perspRotate", "Perspective 3D Rotate"),
                      this.renderSlider("perspFocal", { min: 0, max: 1000, step: 1 }, "Z Distance", false, true, true),
                      this.renderSpacer(),
                      this.renderSlider("skewX", { min: -2, max: 2, step: 0.01 }, "Skew X", true, true),
                      this.renderSlider("skewY", { min: -2, max: 2, step: 0.01 }, "Skew Y", true, true),
                  ),
                  this.renderSection("randomness", "Randomness"),
                  this.state.randomness
                  && e(
                      "div",
                      { style: this.sectionBox },
                      this.renderSlider("rSeed", { min: 0, max: 10000, step: 1 }, "Seed"),
                      this.renderCheckbox("shake", "Shake"),
                      this.state.shake
                      && e(
                          "div",
                          null,
                          this.renderSlider("shakeInterval", { min: 0, max: 10, step: 1 }, "Shake Interval"),
                          this.renderCheckbox("shakeFreeze", "Freeze on Unshaky Frames"),
                      ),
                      this.renderSpacer(),
                      this.renderSlider("rMoveX", { min: 0, max: 10, step: 0.01 }, "Max Move X", true, true),
                      this.renderSlider("rMoveY", { min: 0, max: 10, step: 0.01 }, "Max Move Y", true, true),
                      this.renderSpacer(),
                      this.renderSlider("rScaleX", { min: 0, max: 2, step: 0.01 }, "Max Scale X", true, true, true, true),
                      this.renderSlider("rScaleY", { min: 0, max: 2, step: 0.01 }, "Max Scale Y", true, true, true, true),
                      this.renderCheckbox("rScaleWidth", "Scale Width"),
                      this.renderSpacer(),
                      this.renderSlider("rRotate", { min: 0, max: 45, step: 0.1 }, "Max Rotation", true, true),
                  ),
                  this.renderSection("performance", "Performance"),
                  this.state.performance
                  && e(
                      "div",
                      { style: this.sectionBox },
                      this.renderCheckbox("toggleUpdateWholeAnimation", "Always Update Whole Animation"),
                      e("button", {
                          onClick: () => this.setState({updateWholeAnimation: true}),
                      }, "Update Whole Animation"),
                      this.renderDivider(),
                      this.renderCheckbox("manualUpdateMode", `Manual Update [Press ${this.state.keyCommit}]`),
                      this.renderSpacer(),
                      this.renderSlider("maxUpdateTime", { min: 0, max: 100, step: 1 }, "Max Update Time"),
                      this.renderDivider(),
                      this.renderCheckbox("scaleMax", "Max Scale"),
                  ),
                  this.renderSection("hotkeys", "Hotkeys"),
                  this.state.hotkeys
                  && e(
                      "div",
                      { style: this.sectionBox },
                      this.renderHotkey("keyCommit", "Commit"),
                      this.renderDivider(),
                      this.renderHotkey("keyManualUpdate", "Manual Update"),
                      this.renderSpacer(4),
                      this.renderHotkey("keyToggleManualUpdate", "Toggle Manual Update Mode"),
                      this.renderDivider(),
                      this.renderHotkey("keyToggleOverlay", "Toggle Overlay"),
                      this.renderDivider(),
                      this.renderHotkey("keySetALength", "New Keyframe"),
                      this.renderSpacer(4),
                      this.renderHotkey("keySetALengthBackwards", "New Keyframe Backwards (Modifier)"),
                      this.renderSpacer(4),
                      this.renderHotkey("keyMoveALength", "Move Active Keyframe (Modifier)"),
                      this.renderDivider(),
                      this.renderHotkey("keyResetTransform", "Reset Transform (or Shift+RMB on widget)"),
                      this.renderDivider(),
                      this.renderHotkey("keyPrevMultiTrans", "Previous Keyframe"),
                      this.renderSpacer(4),
                      this.renderHotkey("keyNextMultiTrans", "Next Keyframe"),
                  ),
              ),
              e("button", { style: { float: "left" }, onClick: () => this.onCommit() }, "Commit"),
              e("button", { style: { float: "left" }, onClick: () => this.onResetAll() }, "Reset"),
              e("button", { style: { float: "left" }, onClick: () => this.onResetTransform() }, "Reset Transform"),
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
    unsafeWindow.registerCustomSetting(XaviAnimateModComponent);
}

/* init */
if (unsafeWindow.registerCustomSetting) {
    main();
} else {
    const prevCb = unsafeWindow.onCustomToolsApiReady;
    unsafeWindow.onCustomToolsApiReady = () => {
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
    const { V2 } = unsafeWindow;

    let tShear = [ 1 + shearX * shearY, shearX, shearY, 1, 0, 0 ];
    let tScale = [ scaleX, 0, 0, scaleY, 0, 0 ];
    let u = V2.from(1, 0).rot(rot).transform(tScale).transform(tShear);
    let v = V2.from(0, 1).rot(rot).transform(tScale).transform(tShear);

    return [ u.x, v.x, u.y, v.y, 0, 0 ];
}

function buildRotTransform (rot) {
    const { V2 } = unsafeWindow;

    let u = V2.from(1, 0).rot(rot);
    let v = V2.from(0, 1).rot(rot);

    return [ u.x, v.x, u.y, v.y, 0, 0 ];
}

function preparePointAlong (p, preCenter, alongPerspX, alongPerspY, preTransform, perspRotate, focal) {
    return transformPersp(p.sub(preCenter), -alongPerspX, -alongPerspY, 0, perspRotate, focal).transform(preTransform);
}

function transformPersp(p, perspX, perspY, epsilon, perspRotate, focal) {
  const pt = new V2(p);

  if (!perspRotate) {
    let w = (1 + perspX * pt.x + perspY * pt.y);
    if (Math.abs(w) < epsilon) w = Math.sign(w) * epsilon;
    pt.x = pt.x / w;
    pt.y = pt.y / w;
    return pt;
  }
  const angleScale = 100;

  const yaw = -1 * perspX * angleScale; // rotation about Y axis
  const pitch = perspY * angleScale; // rotation about X axis

  function rotateYX(x, y, z, yaw, pitch) {
    // rotate about Y
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const xr = cy * x + sy * z;
    const yr = y;
    const zr = -sy * x + cy * z;
    // rotate about X
    const cx = Math.cos(pitch), sx = Math.sin(pitch);
    const xr2 = xr;
    const yr2 = cx * yr - sx * zr;
    const zr2 = sx * yr + cx * zr;
    return { x: xr2, y: yr2, z: zr2 };
  }

  const r = rotateYX(pt.x, pt.y, 0, yaw, pitch);

  let worldX = r.x;
  let worldY = r.y;
  let worldZ = r.z + focal;

  if (Math.abs(worldZ) < epsilon) worldZ = Math.sign(worldZ || 1) * epsilon;

  let projX = (focal * worldX) / worldZ;
  let projY = (focal * worldY) / worldZ;

  pt.x = projX;
  pt.y = projY;
  return pt;
}

function restorePoint (p, anchor, postTransform, alongPerspX, alongPerspY, preCenter, perspRotate, focal) {
    return transformPersp(
        p.add(anchor).transform(postTransform),
        alongPerspX, alongPerspY, 0, perspRotate, focal
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

function genLine(x1, y1, x2, y2, thickness, color, zIndex) {
    const p1 = {
        x: x1,
        y: y1,
        colorA: color,
        colorB: color,
        thickness,
    };
    const p2 = {
        x: x2,
        y: y2,
        colorA: color,
        colorB: color,
        thickness,
    };
    return new Millions.Line(p1, p2, 3, zIndex);
}
function genBoundingBox(x1, y1, x2, y2, anchorX, anchorY, anchorSize, thickness, color, zIndex) {

    return [
        // Box outline
        genLine(x1, y1, x1, y2, thickness, color, zIndex + 0.1), // L
        genLine(x1, y2, x2, y2, thickness, color, zIndex + 0.2), // T
        genLine(x2, y1, x2, y2, thickness, color, zIndex + 0.3), // R
        genLine(x1, y1, x2, y1, thickness, color, zIndex + 0.4), // B
        // Transformation anchor
        genLine(anchorX, anchorY, anchorX + anchorSize, anchorY, thickness * 2, color, zIndex + 0.5),
        genLine(anchorX, anchorY, anchorX, anchorY - anchorSize, thickness * 2, color, zIndex + 0.6),
    ];
}

function genBoundingBoxPoints(points, size, thickness, zIndex) {
    let color;
    let lines = [];
    let i = 0;
    for (let point of points) {
        let x1 = (point.x - size);
        let x2 = (point.x + size);
        let y1 = (point.y - size);
        let y2 = (point.y + size);
        i++;

        if (point.id < 9 || point.id == 11) { // nine eleven reference
            color = new Millions.Color(64, 128, 255, 255) // blue
        } else {
            color = new Millions.Color(255, 64, 255, 255) // purple
        }

        lines.push(
            // Box outline
            genLine(x1, y1, x1, y2, thickness, color, zIndex + i + 0.1), // L
            genLine(x1, y2, x2, y2, thickness, color, zIndex + i + 0.2), // T
            genLine(x2, y2, x2, y1, thickness, color, zIndex + i + 0.3), // R
            genLine(x2, y1, x1, y1, thickness, color, zIndex + i + 0.4), // B
        );
    }
    return lines;
}

function getCameraPosAtFrame(frame, track) {
    const viewport = this.store.getState().camera.playbackDimensions || { width: 1920, height: 1080 };
    const zoom = unsafeWindow.getAutoZoom ? unsafeWindow.getAutoZoom(frame) : this.store.getState().camera.playbackZoom;
    const initCamera = this.store.getState().camera.playbackFollower.getCamera(track, {
        zoom,
        width: viewport.width,
        height: viewport.height,
    }, frame);
    return { x: initCamera.x, y: initCamera.y };
}

function inBounds(p1, p2, r) {
    return Math.abs(p1.x - p2.x) < r && Math.abs(p1.y - p2.y) < r;
}

function sumOf(element, index = 999) {
    return Object.entries(element ?? {})
        .filter(([key]) => Number(key) <= index)
        .reduce((acc, [, val]) => acc + (val ?? 0), 0);
}

// random from seed

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