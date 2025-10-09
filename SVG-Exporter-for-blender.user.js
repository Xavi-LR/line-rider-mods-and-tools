// ==UserScript==
// @name         SVG Exporter for blender
// @namespace    https://www.linerider.com/
// @author       Tobias Bessler, updated for blender by Xavi
// @description  Export selected lines into an SVG, or JSON w/ proper origin point and optional layer automation
// @version      1.3.0
// @icon         https://www.linerider.com/favicon.ico
// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/SVG-Exporter-for-blender.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/SVG-Exporter-for-blender.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools

// @grant        none
// ==/UserScript==

const SELECT_TOOL = "SELECT_TOOL";
const EMPTY_SET = new Set();

const setTool = (tool) => ({ type: "SET_TOOL", payload: tool });
const setToolState = (toolId, state) => ({ type: "SET_TOOL_STATE", payload: state, meta: { id: toolId } });
const setSelectToolState = toolState => setToolState(SELECT_TOOL, toolState);

const getActiveTool = state => state.selectedTool;
const getToolState = (state, toolId) => state.toolState[toolId];
const getSelectToolState = state => getToolState(state, SELECT_TOOL);
const getSimulatorCommittedTrack = state => state.simulator.committedEngine;
const getCommittedTrackLayers = state => {
  const layersObj = getSimulatorCommittedTrack(state).engine.state.layers;
  if (layersObj) {
    return layersObj.toArray();
  }
  if (Array.isArray(layersObj)) return layersObj;
  return [];
};

const getPlayerMaxIndex = state => state.player.maxIndex;

class BlenderExporterMod {
  constructor (store, initState) {
    this.store = store;
    this.state = initState;

    this.track = getSimulatorCommittedTrack(this.store.getState());
    this.layers = getCommittedTrackLayers(this.store.getState());
    this.selectedPoints = EMPTY_SET;

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

  onExport (useColor, useLayerAutomation, useJson) {
    if (this.selectedPoints.size === 0) return 2;

    const selectedLines = [...getLinesFromPoints(this.selectedPoints)]
      .map(id => this.track.getLine(id))
      .filter(l => l);

    try {
      exportSVGAndJSON(selectedLines, this.layers, useColor, useLayerAutomation, useJson, getPlayerMaxIndex(this.store.getState()));
      console.info("[Blender Export] Success");
      return 0;
    } catch (e) {
      console.error("[Blender Export] Failed:", e);
      return 1;
    }
  }

  onUpdate (nextState = this.state) {
    if (!this.state.active && nextState.active) {
      window.previewLinesInFastSelect = true;
    }
    if (this.state.active && !nextState.active) {
      window.previewLinesInFastSelect = false;
    }

    if (this.state !== nextState) {
      this.state = nextState;
    }

    if (!this.state.active) return;

    const track = getSimulatorCommittedTrack(this.store.getState());
    if (track !== this.track) this.track = track;

    const layers = getCommittedTrackLayers(this.store.getState());
    if (layers !== this.layers) this.layers = layers;

    const selectToolState = getSelectToolState(this.store.getState());
    const selectedPoints = selectToolState.selectedPoints;
    if (!setsEqual(this.selectedPoints, selectedPoints)) this.selectedPoints = selectedPoints;
  }
}

function main () {
  const { React, store } = window;
  const e = React.createElement;

  class BlenderExportModComponent extends React.Component {
    constructor (props) {
      super(props);
      this.state = {
active: false,
useColor: true,
useLayerAutomation: false,
useJson: true,
success: 0 };
      this.mod = new BlenderExporterMod(store, this.state);

      store.subscribe(() => {
        const selectToolActive = getActiveTool(store.getState()) === SELECT_TOOL;
        if (this.state.active && !selectToolActive) this.setState({ active: false });
      });
    }

    componentWillUpdate (nextProps, nextState) {
      this.mod.onUpdate(nextState);
    }

    renderCheckbox (key, label) {
      const settings = { checked: this.state[key], onChange: e => this.setState({ [key]: e.target.checked }) };
      return React.createElement("div", null, label + " ", React.createElement("input", { type: "checkbox", ...settings }));
    }

    onActivate () {
      if (this.state.active) this.setState({ active: false });
      else { store.dispatch(setTool(SELECT_TOOL)); this.setState({ active: true }); }
    }

    onExport () {
      const exportSuccess = this.mod.onExport(this.state.useColor, this.state.useLayerAutomation, this.state.useJson);
      this.setState({ success: exportSuccess });
    }
    onExportCamera() {
    const track = store.getState().simulator.engine;
    const positions = [];
    const {width, height} = store.getState().camera.playbackDimensions || {width: 1920, height: 1080};

    for(let i = 0; i < store.getState().player.maxIndex; i++) {
        const zoom = window.getAutoZoom ? window.getAutoZoom(i) : store.getState().camera.playbackZoom;
        const camera = store.getState().camera.playbackFollower.getCamera(track, { zoom, width, height }, i);
        positions.push([camera.x, camera.y, zoom])
    }
    const link = document.createElement('a');
    link.setAttribute('download', 'linerider_camera.json');
    link.href = window.URL.createObjectURL(new Blob([JSON.stringify(positions)], {type: 'application/json'}));
    document.body.appendChild(link);
    window.requestAnimationFrame(function () {
      link.dispatchEvent(new MouseEvent('click'));
      document.body.removeChild(link);
    });
}

    render () {
      return e("div", null,
        this.state.active && e("div", null,
          this.state.success === 1 && e("div", null, "Error: See console"),
          this.state.success === 2 && e("div", null, "Error: No lines selected"),
          this.renderCheckbox("useJson", "JSON for Blender Export"),
          this.renderCheckbox("useColor", "Use Color"),
          this.renderCheckbox("useLayerAutomation", "Use Layer Automation"),
          e("button", { style: { float: "left" }, onClick: () => this.onExport() }, "Export"),
          this.state.useJson && e("button", { style: { float: "left" }, onClick: () => this.onExportCamera() }, "Export Camera"),
        ),
        e("button", { style: { backgroundColor: this.state.active ? "lightblue" : null }, onClick: this.onActivate.bind(this) }, "SVG Export Mod")
      );
    }
  }

  window.registerCustomSetting(BlenderExportModComponent);
}

if (window.registerCustomSetting) main();
else {
  const prevCb = window.onCustomToolsApiReady;
  window.onCustomToolsApiReady = () => { if (prevCb) prevCb(); main(); };
}

/* helpers */

function setsEqual (a, b) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function getLinesFromPoints (points) {
  return new Set([...points].map(point => point >> 1));
}

function exportSVGAndJSON (selectedLines, allLayers, useColor, useLayerAutomation, useJson, frameSampleCount) {
  if (!selectedLines || selectedLines.length === 0) return false;

  const usedLayerIds = new Set();
  for (const line of selectedLines) {
    if (typeof line.layer !== "undefined" && line.layer !== null) usedLayerIds.add(line.layer);
  }

  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const linesToAdd = {};
  for (const lid of usedLayerIds) linesToAdd[lid] = [];

  for (const line of selectedLines) {
    const w = line.width || 1;
    const minLX = Math.min(line.x1, line.x2) - w;
    const minLY = Math.min(line.y1, line.y2) - w;
    const maxLX = Math.max(line.x1, line.x2) + w;
    const maxLY = Math.max(line.y1, line.y2) + w;
    bounds.minX = Math.min(bounds.minX, minLX);
    bounds.minY = Math.min(bounds.minY, minLY);
    bounds.maxX = Math.max(bounds.maxX, maxLX);
    bounds.maxY = Math.max(bounds.maxY, maxLY);

    const layerID = line.layer || 0;
    if (!(layerID in linesToAdd)) linesToAdd[layerID] = [];
    linesToAdd[layerID].push({
      x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2,
      color: "#000000", width: w
    });
  }

  // pad
  bounds.minX -= 2; bounds.minY -= 2; bounds.maxX += 2; bounds.maxY += 2;
  const centerX = (bounds.minX + bounds.maxX) / 2.0;
  const centerY = (bounds.minY + bounds.maxY) / 2.0;

  const layerMetaMap = {};
  for (const layer of allLayers) {

    if (typeof layer.size !== "undefined") continue;
    if (!usedLayerIds.has(layer.id)) continue;

    let color = "#000000", name = String(layer.name || ("Layer_" + layer.id));
    const ln = String(layer.name || "");
    if (ln.length >= 7 && ln[0] === "#" && /^[#][A-Fa-f0-9]{6}/.test(ln.substring(0,7))) {
      color = ln.substring(0,7);
      name = ln.substring(7) || name;
    }
    layerMetaMap[layer.id] = { id: layer.id, color: color, name: name };
  }

  const layersTimelineCompressed = {};
  if (useLayerAutomation && typeof window.getLayerVisibleAtTime === "function") {
    usedLayerIds.forEach(id => {
      let prev = null;
      const events = [];
      for (let f = 0; f < frameSampleCount; f++) {
        let visible = true;
        try { visible = !!window.getLayerVisibleAtTime(id, f); } catch (e) { visible = true; }
        if (prev === null) {
          // initial state at frame 0
          events.push({ frame: f, visible: visible });
          prev = visible;
        } else if (visible !== prev) {
          // state changed -> emit event
          events.push({ frame: f, visible: visible });
          prev = visible;
        }
      }
      layersTimelineCompressed[id] = events;
    });
  } else {
  }

  // build export object
  const exportObj = {
    meta: { generatedBy: "linerider-svg-exporter", scale: 100, svg_import_resolution: 2, frame_sample_count: frameSampleCount, layer_automation: !!useLayerAutomation },
    center: [centerX, centerY],
    bounds: bounds,
    layers: []
  };

  for (const lid of Object.keys(linesToAdd)) {
    const layerLines = linesToAdd[lid] || [];
    if (layerLines.length === 0) continue;
    const meta = layerMetaMap[lid] || { id: Number(lid), color: "#000000", name: "Layer_" + lid };
    const strokes = layerLines.map(l => ({
      points: [[l.x1, l.y1], [l.x2, l.y2]],
      width: l.width || 1,
      color: useColor ? meta.color : "#000000",
      frame: 1
    }));
    const visibilityEvents = layersTimelineCompressed[lid] || null;
    exportObj.layers.push({ id: meta.id, name: meta.name, color: meta.color, strokes: strokes, visibility: visibilityEvents });
  }

  // build SVG
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  const svgWidth = bounds.maxX - bounds.minX;
  const svgHeight = bounds.maxY - bounds.minY;
  if (svgWidth < 0 || svgHeight < 0) return false;
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.setAttribute("data-lr-center", `${centerX},${centerY}`);
  svg.setAttribute("data-lr-scale", String(100));
  svg.setAttribute("data-lr-resolution", String(2));
  svg.setAttribute("data-lr-framecount", String(frameSampleCount));

  for (const layer of exportObj.layers) {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("data-lr-id", String(layer.id));
    g.setAttribute("id", `lr_layer_${layer.id}`);
    for (const s of layer.strokes) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", String(s.points[0][0] - bounds.minX));
      line.setAttribute("y1", String(s.points[0][1] - bounds.minY));
      line.setAttribute("x2", String(s.points[1][0] - bounds.minX));
      line.setAttribute("y2", String(s.points[1][1] - bounds.minY));
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-width", String((s.width || 1) * 2));
      line.setAttribute("stroke", s.color || "#000000");
      g.appendChild(line);
    }
    svg.appendChild(g);
  }

  if (!useJson) {
    const svgString = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const svgName = `linerider_lines.svg`;
    const a1 = document.createElement("a");
    a1.href = URL.createObjectURL(svgBlob);
    a1.download = svgName;
    document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);
  }
  if (useJson) {
    const jsonString = JSON.stringify(exportObj, null, 2);
    const jsonBlob = new Blob([jsonString], { type: "application/json" });
    const jsonName = `linerider_lines.json`;
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(jsonBlob);
    a2.download = jsonName;
    document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
  }
  return true;
}

