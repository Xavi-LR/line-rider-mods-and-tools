// ==UserScript==

// @name         Bezier Tool
// @namespace    https://www.linerider.com/
// @author       David Lu & Tobias Bessler & XAVILR
// @description  Adds tool to create bezier curves WITH INFINITE NODES OF POSSIBILITY
// @version      0.6.7
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/bezier-tool.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/bezier-tool.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @supportURL   https://amongusplay.online/privacy.php
// @grant        none

// @require      https://raw.githubusercontent.com/EmergentStudios/linerider-userscript-mods/master/lib/adaptive-bezier-curve.js

// ==/UserScript==

// jshint asi: true
// jshint esversion: 6

function parseFloatOrDefault(string, defaultValue = 0) {
  const x = parseFloat(string);
  return isNaN(x) ? defaultValue : x;
}

const bezier = window.adaptiveBezierCurve;
const TOOL_ID = "Bezier Tool";

const TOOL_LAYER = 0;

const setToolState = (toolId, state) => ({
  type: "SET_TOOL_STATE",
  payload: state,
  meta: { id: toolId },
});
const revertTrackChanges = () => ({
  type: "REVERT_TRACK_CHANGES",
  meta: { ignorable: true },
});
const updateLines = (name, linesToRemove, linesToAdd, initialLoad = false) => ({
  type: "UPDATE_LINES",
  payload: { linesToRemove, linesToAdd, initialLoad },
  meta: { name },
});
const addLines = lines => updateLines("ADD_LINES", null, lines);
const commitTrackChanges = () => ({
  type: "COMMIT_TRACK_CHANGES",
});

const getToolState = (state, toolId) => state.toolState[toolId];
const getEditorZoom = state => state.camera.editorZoom;
const getModifier = (state, modifier) => state.command.activeModifiers.has(modifier);
const getPlayerRunning = state => state.player.running;
const getSimulatorTrack = state => state.simulator.engine;
const getSimulatorCommittedTrack = state => state.simulator.committedEngine;
const getTrackLinesLocked = state => state.trackLinesLocked;
const getSelectedLineType = state => (getTrackLinesLocked(state) ? 2 : state.selectedLineType);

class State {}
class InitState extends State {}
class ControlOneState extends State {
  /**
   * @param {ControlOneState} c
   * @param {V2} pos
   */
  static withControlPoint(c, pos) {
    return new ControlOneState(c.p1, pos);
  }
  /**
   * @param {V2} p1
   * @param {V2} c1
   */
  constructor(p1, c1) {
    super();
    this.p1 = p1;
    this.c1 = c1;
  }
}
class ControlTwoState extends State {
  /**
   * @param {ControlTwoState} c
   * @param {V2} pos
   */
  static withControlPoint(c, pos) {
    return new ControlTwoState(c.p1, c.c1, c.p2, pos);
  }
  /**
   * @param {ControlOneState} c
   * @param {V2} pos
   */
  static fromControlOne(c, pos) {
    return new ControlTwoState(c.p1, c.c1, pos, pos);
  }
  /**
   * @param {V2} p1
   * @param {V2} c1
   * @param {V2} p2
   * @param {V2} c2
   */
  constructor(p1, c1, p2, c2) {
    super();
    this.p1 = p1;
    this.c1 = c1;
    this.p2 = p2;
    this.c2 = c2;
  }
}
function inBounds(p1, p2, r) {
  return Math.abs(p1.x - p2.x) < r && Math.abs(p1.y - p2.y) < r;
}
// REPLACE the old EditState with this new MultiEditState

class MultiEditState extends State {
  /**
   * @param {{p:V2,c:V2}[]} points
   */
  constructor(points) {
    super();
    // points: array of { p: V2, c: V2 }
    this.points = points.map(pt => ({ p: new V2(pt.p), c: new V2(pt.c) }));
    // active: { type: 'none'|'p'|'c', index: number }
    this.active = { type: "none", index: -1 };
    this.startOffset = null; // V2 offset between mouse and point for drag
  }

  clone() {
    const next = new MultiEditState(this.points.map(pt => ({ p: new V2(pt.p), c: new V2(pt.c) })));
    next.active = { ...this.active };
    next.startOffset = this.startOffset ? new V2(this.startOffset) : null;
    return next;
  }

  /**
   * Try to activate a point on mouse down. Returns a cloned state if something was activated.
   * @param {V2} pos
   * @param {number} r
   */
  handleDown(pos, r) {
    const next = this.clone();

    // check main points and control points
    for (let i = 0; i < next.points.length; i++) {
      const pt = next.points[i];
      if (inBounds(pos, pt.p, r)) {
        next.startOffset = new V2(pt.p).sub(pos);
        next.active = { type: "p", index: i };
        return next;
      }
      if (inBounds(pos, pt.c, r)) {
        next.startOffset = new V2(pt.c).sub(pos);
        next.active = { type: "c", index: i };
        return next;
      }
    }
    // nothing activated
    return;
  }

  /**
   * Drag handler for active point.
   * - dragging 'p' moves both p and its associated c by same delta
   * - dragging 'c' moves only the control point
   *
   * @param {V2} pos
   * @param {any} editorState - store state (for snapping/angle lock functions)
   * @param {Set} pendingLines
   * @param {boolean} pointSnap
   * @param {boolean} angleLock
   */
  handleDrag(pos, editorState, pendingLines, pointSnap, angleLock) {
    if (this.active.type === "none") return;
    const next = this.clone();

    let nextPos = new V2(this.startOffset).add(pos);

    const idx = this.active.index;
    const target = next.points[idx];

    if (this.active.type === "p") {
      if (pointSnap) {
        nextPos = getPointSnapPos(nextPos, editorState, pendingLines, null, true);
      }
      const delta = new V2(nextPos).sub(target.p);
      target.p = nextPos;
      target.c = new V2(target.c).add(delta); // move control point along with main point
    } else if (this.active.type === "c") {
      if (angleLock && target.p.vec) {
        nextPos = getAngleLockPos(nextPos, target.p, target.p.vec);
      }
      target.c = nextPos;
    }
    return next;
  }

  // create a MultiEditState from two control points
  static fromTwo(p1, c1, p2, c2) {
    return new MultiEditState([{ p: p1, c: c1 }, { p: p2, c: c2 }]);
  }
}

const THICKNESS = 1;
const POINT_RADIUS = 10;

/** @param {State} toolState */
const setBezierToolState = toolState => setToolState(TOOL_ID, { state: toolState });
/** @return {State} */
const getBezierToolState = state => getToolState(state, TOOL_ID).state;

function genLine(x1, y1, x2, y2, thickness, color, zIndex) {
  let p1 = {
    x: x1,
    y: y1,
    colorA: color,
    colorB: color,
    thickness,
  };
  let p2 = {
    x: x2,
    y: y2,
    colorA: color,
    colorB: color,
    thickness,
  };
  return new Millions.Line(p1, p2, TOOL_LAYER, zIndex);
}

function genBoxOutline(x1, y1, x2, y2, thickness, color, zIndex) {
  return [
    genLine(x1, y1, x1, y2, thickness, color, zIndex),
    genLine(x1, y2, x2, y2, thickness, color, zIndex + 0.1),
    genLine(x2, y2, x2, y1, thickness, color, zIndex + 0.2),
    genLine(x2, y1, x1, y1, thickness, color, zIndex + 0.3),
  ];
}

function genPoint(x, y, r, borderThickness, fillColor, borderColor, zIndex) {
  return genBoxOutline(
    x - r,
    y - r,
    x + r,
    y + r,
    borderThickness,
    borderColor,
    zIndex + 0.5,
  );
}

const Zoom = {
  STRENGTH: Math.pow(2, 1 / 64),
  MIN: 1 / 16,
  MAX: 32,
};
const MAX_SNAP_DISTANCE = 6;
function getPointSnapPos(pos, state, ignoreLineIds, ignorePoint, withLineVec) {
  let zoom = getEditorZoom(state);

  let track = getSimulatorCommittedTrack(state); // only snap to committed lines so we don't self-snap

  // adjust snap radius to current zoom level
  let closestDistance = MAX_SNAP_DISTANCE / Math.min(zoom, Zoom.MAX / 10);
  let snapPos = pos;
  let otherPointOfSnappedLine = null;
  let lines = track.selectLinesInRadius(pos, closestDistance);

  function getCloserPoint(point, otherPoint) {
    if (ignorePoint && point.x === ignorePoint.x && point.y === ignorePoint.y) {
      return;
    }

    let distance = pos.dist(point);
    if (distance < closestDistance) {
      closestDistance = distance;
      snapPos = point;
      otherPointOfSnappedLine = otherPoint;
    }
  }

  for (let line of lines) {
    if (ignoreLineIds && ignoreLineIds.has(line.id)) continue;
    getCloserPoint(line.p1, line.p2);
    getCloserPoint(line.p2, line.p1);
  }

  if (otherPointOfSnappedLine && withLineVec) {
    snapPos = {
      x: snapPos.x,
      y: snapPos.y,
      vec: new V2(snapPos).sub(otherPointOfSnappedLine).norm(),
    };
  }

  return snapPos;
}
function getAngleLockPos(pos, startPos, vec) {
  let delta = new V2(pos).sub(startPos);

  return new V2(vec).mul(delta.dot(vec)).add(startPos);
}

function main() {
  const { DefaultTool, Millions, React, store, V2 } = window;

  const Colors = {
    One: new Millions.Color(255, 0, 0, 255),
    Two: new Millions.Color(255, 0, 0, 255),
    PointBorder: new Millions.Color(0, 0, 0, 255),
  };

  // SceneLayer is not exported so here's a hack to retreive it
  const SceneLayer = window.Tools.SELECT_TOOL.getSceneLayer({
    ...store.getState(),
    toolState: { SELECT_TOOL: { status: {}, selectedPoints: [] } },
  }).constructor;

  class BezierTool extends DefaultTool {
    dispatch(a) {
      super.dispatch(a);
    }
    getState() {
      return super.getState();
    }
    /** @return {V2} */
    toTrackPos(p) {
      return super.toTrackPos(p);
    }

    shouldPointSnap() {
      const disableSnap = getModifier(
        this.getState(),
        "modifiers.disablePointSnap",
      );
      return !disableSnap;
    }

    shouldAngleLock() {
      return getModifier(this.getState(), "modifiers.angleLock");
    }

    static get usesSwatches() {
      return true;
    }

    static getCursor(state) {
      return getPlayerRunning(state) ? "inherit" : "crosshair";
    }

    static getSceneLayer(state) {
      let layer = new SceneLayer(TOOL_LAYER);

      const zoom = getEditorZoom(state);
      const s = getBezierToolState(state);

      const entities = [];

    // draw connectors / helpers for single-segment creation states:
    if (s instanceof ControlOneState || s instanceof ControlTwoState) {
      // draw p1 -> c1 connector when in ControlOne/ControlTwo
      entities.push(
        genLine(
          s.p1.x,
          s.p1.y,
          s.c1.x,
          s.c1.y,
          THICKNESS / zoom,
          Colors.One,
          1,
        ),
      );
    }

    if (s instanceof ControlTwoState) {
      // draw p2 -> c2 connector only for ControlTwo (not for MultiEditState)
      entities.push(
        genLine(
          s.p2.x,
          s.p2.y,
          s.c2.x,
          s.c2.y,
          THICKNESS / zoom,
          Colors.Two,
          2,
        ),
      );
    }

    // draw control connector lines and points for every point set (MultiEditState)
    if (s instanceof MultiEditState) {
      for (let i = 0; i < s.points.length; i++) {
        const set = s.points[i];
        entities.push(
          genLine(
            set.p.x,
            set.p.y,
            set.c.x,
            set.c.y,
            THICKNESS / zoom,
            i % 2 === 0 ? Colors.One : Colors.Two,
            1 + i,
          ),
        );
        entities.push(
          ...genPoint(
            set.p.x,
            set.p.y,
            POINT_RADIUS / zoom / 2,
            1 / zoom,
            Colors.One,
            Colors.PointBorder,
            3 + i * 4,
          ),
        );
        entities.push(
          ...genPoint(
            set.c.x,
            set.c.y,
            POINT_RADIUS / zoom / 2,
            1 / zoom,
            Colors.Two,
            Colors.PointBorder,
            4 + i * 4,
          ),
        );
      }
    }

if (s instanceof MultiEditState) {
  // draw control connector lines and points for every point set
  for (let i = 0; i < s.points.length; i++) {
    const set = s.points[i];
    entities.push(
      genLine(set.p.x, set.p.y, set.c.x, set.c.y, THICKNESS / zoom, i % 2 === 0 ? Colors.One : Colors.Two, 1 + i)
    );
    // draw main point box
    entities.push(
      ...genPoint(set.p.x, set.p.y, POINT_RADIUS / zoom / 2, 1 / zoom, Colors.One, Colors.PointBorder, 3 + i * 4)
    );
    // draw control point box
    entities.push(
      ...genPoint(set.c.x, set.c.y, POINT_RADIUS / zoom / 2, 1 / zoom, Colors.Two, Colors.PointBorder, 4 + i * 4)
    );
  }
}

      for (let e of entities) {
        layer = layer.withEntityAdded(e);
      }

      return layer;
    }

    constructor(store) {
      super(store);

      this.flipped = window.bezierToolFlipped || false;
      Object.defineProperty(window, "bezierToolFlipped", {
        configurable: true,
        get: () => this.flipped,
        set: f => {
          this.flipped = f;

          const state = getBezierToolState(this.getState());

          if (state instanceof MultiEditState) {
            this.dispatch(revertTrackChanges());
            this.addCurve(state);
          }
        },
      });

      this.radius = window.bezierToolRadius || 0;
      Object.defineProperty(window, "bezierToolRadius", {
        configurable: true,
        get: () => this.radius,
        set: r => {
          this.radius = r;

          const state = getBezierToolState(this.getState());

          if (state instanceof MultiEditState) {
            this.dispatch(revertTrackChanges());
            this.addCurve(state);
          }
        },
      });

      this.scnWidth = window.bezierToolWidth || 1;
      Object.defineProperty(window, "bezierToolWidth", {
        configurable: true,
        get: () => this.scnWidth,
        set: r => {
          this.scnWidth = r;

          const state = getBezierToolState(this.getState());

          if (state instanceof MultiEditState) {
            this.dispatch(revertTrackChanges());
            this.addCurve(state);
          }
        },
      });

      this.multiplier = window.bezierToolMultiplier || 1;
      Object.defineProperty(window, "bezierToolMultiplier", {
        configurable: true,
        get: () => this.multiplier,
        set: r => {
          this.multiplier = r;

          const state = getBezierToolState(this.getState());

          if (state instanceof MultiEditState) {
            this.dispatch(revertTrackChanges());
            this.addCurve(state);
          }
        },
      });

      this.dispatch(setBezierToolState(new InitState()));

      // detect right-clicks for removing points
      this._onDocPointerDown = (ev) => {
        if (ev.button !== 2) return;

        const fakeEvent = {
          button: ev.button,
          pos: { x: ev.clientX, y: ev.clientY },
        };
          this.onPointerDown(fakeEvent);
      };

      document.addEventListener("pointerdown", this._onDocPointerDown, true);
    }

onPointerDown(e) {
  const state = getBezierToolState(this.getState());
  let pos = this.toTrackPos(e.pos);

  // handle right-click removal in edit mode
  if (e.button === 2 && state instanceof MultiEditState) {
    //  console.log("Among Us") // this increases each time you open the mod, which is bad
    // find target index to remove
    for (let i = 0; i < state.points.length; i++) {
      if (inBounds(pos, state.points[i].p, POINT_RADIUS / getEditorZoom(this.getState()) / 2) ||
          inBounds(pos, state.points[i].c, POINT_RADIUS / getEditorZoom(this.getState()) / 2)) {
        this.dispatch(revertTrackChanges());
        const nextPoints = state.points.slice();
        nextPoints.splice(i, 1);
        if (nextPoints.length < 2) {
          // if <2 points, go back to Init or a single ControlOneState
          if (nextPoints.length === 1) {
            const only = nextPoints[0];
            this.dispatch(setBezierToolState(new ControlOneState(only.p, only.c)));
            this.dispatch(revertTrackChanges());
            return;
          } else {
            this.dispatch(setBezierToolState(new InitState()));
            this.dispatch(revertTrackChanges());
            return;
          }
        } else {
          const nextState = new MultiEditState(nextPoints);
          this.dispatch(setBezierToolState(nextState));
          this.addCurve(nextState);
          return;
        }
      }
    }
    return; // nothing to remove
  }

  // regular left-click flows:
  let nextState;
  if (state instanceof InitState) {
    if (this.shouldPointSnap()) {
      pos = getPointSnapPos(pos, this.getState(), null, null, true);
    }
    nextState = new ControlOneState(pos, pos);
} else if (state instanceof ControlOneState) {
  if (this.shouldPointSnap()) {
    pos = getPointSnapPos(pos, this.getState(), null, null, true);
  }

  // create a ControlTwoState from ControlOne using the click pos
  const controlTwo = ControlTwoState.fromControlOne(state, pos);

  this.dispatch(setBezierToolState(controlTwo));
  return;
}
    if (state instanceof MultiEditState) {
    // if pointer is near existing point -> activate drag via handleDown
    const zoom = getEditorZoom(this.getState());
    const activated = state.handleDown(pos, POINT_RADIUS / zoom / 2);
    if (activated) {
      this.dispatch(setBezierToolState(activated));
      return;
    }
    // otherwise pointerdown on empty space -> create a new point set and activate its control
    console.log("new point")
    if (this.shouldPointSnap()) {
      pos = getPointSnapPos(pos, this.getState(), null, null, true);
    }
    const nextPoints = state.points.map(pt => ({ p: new V2(pt.p), c: new V2(pt.c) }));
    // new point set p and c initially equal the click pos; drag to create control point
    nextPoints.push({ p: pos, c: pos });
    const newState = new MultiEditState(nextPoints);
    // activate the new control point for dragging
    newState.active = { type: "c", index: nextPoints.length - 1 };
    newState.startOffset = new V2(pos).sub(pos); // zero offset
    this.dispatch(setBezierToolState(newState));
    this.dispatch(revertTrackChanges());
    this.addCurve(newState);
    return;
  }

  if (nextState) {
    this.dispatch(setBezierToolState(nextState));
  }
}

onPointerDrag(e) {
  const state = getBezierToolState(this.getState());
  let pos = this.toTrackPos(e.pos);
  let nextState;

  if (state instanceof ControlOneState) {
    if (this.shouldAngleLock() && state.p1.vec) {
      pos = getAngleLockPos(pos, state.p1, state.p1.vec);
    }
    nextState = ControlOneState.withControlPoint(state, pos);

  } else if (state instanceof ControlTwoState) {

    if (this.shouldAngleLock() && state.p2.vec) {
      pos = getAngleLockPos(pos, state.p2, state.p2.vec);
    }
    nextState = ControlTwoState.withControlPoint(state, pos);

  } else if (state instanceof MultiEditState) {
    nextState = state.handleDrag(
      pos,
      this.getState(),
      new Set(),
      this.shouldPointSnap(),
      this.shouldAngleLock(),
    );
    if (nextState) {
      this.dispatch(revertTrackChanges());
      this.addCurve(nextState);
    }
  }

  if (nextState) {
    this.dispatch(setBezierToolState(nextState));
  }
}

onPointerUp(e) {
  const state = getBezierToolState(this.getState());
  let nextState;

  if (state instanceof ControlTwoState) {
    nextState = MultiEditState.fromTwo(state.p1, state.c1, state.p2, state.c2);
    this.dispatch(revertTrackChanges());
    this.addCurve(nextState);
  }

  // in MultiEditState, finalize drag by clearing active
  if (state instanceof MultiEditState && state.active.type !== "none") {
    nextState = state.clone();
    nextState.active = { type: "none", index: -1 };
    nextState.startOffset = null;
  }

  if (nextState) {
    this.dispatch(setBezierToolState(nextState));
  }
}

/** @param {ControlTwoState | MultiEditState} s */
addCurve(s) {
  // build an array of point sets: [{p:{x,y}, c:{x,y}}...]
  let sets = [];
  if (s instanceof ControlTwoState) {
    sets = [{ p: s.p1, c: s.c1 }, { p: s.p2, c: s.c2 }];
  } else if (s instanceof MultiEditState) {
    sets = s.points;
  } else {
    return;
  }

  // for each adjacent pair create a bezier segment and append its lines
  const lines = [];
  const type = getSelectedLineType(this.getState());
  for (let i = 0; i < sets.length - 1; i++) {
    const a = sets[i];
    const b = sets[i + 1];
// compute mirror of b.c across b.p: mirrored = 2*b.p - b.c
const mirrorBcx = (b.p.x * 2) - b.c.x;
const mirrorBcy = (b.p.y * 2) - b.c.y;

// then call bezier using a.c and the mirrored b.c
const points = bezier(
  [a.p.x, a.p.y],
  [a.c.x, a.c.y],
  [mirrorBcx, mirrorBcy],
  [b.p.x, b.p.y],
  2
);

    let prevPoint = points.shift();
    let prevNorm = V2.from(a.c.x - a.p.x, a.c.y - a.p.y).rotCW().norm().mul(this.radius);
    for (let p of points) {
      if (this.radius === 0) {
        lines.push({
          flipped: this.flipped,
          x1: prevPoint[0],
          y1: prevPoint[1],
          x2: p[0],
          y2: p[1],
          width: window.bezierToolWidth || 1,
          multiplier: window.bezierToolMultiplier || 1,
          type,
        });
      } else {
        const norm = V2.from(p[0] - prevPoint[0], p[1] - prevPoint[1]).rotCW().norm().mul(this.radius);

        lines.push({
          flipped: this.flipped,
          x1: prevPoint[0] - prevNorm.x,
          y1: prevPoint[1] - prevNorm.y,
          x2: p[0] - norm.x,
          y2: p[1] - norm.y,
          width: window.bezierToolWidth || 1,
          multiplier: window.bezierToolMultiplier || 1,
          type,
        }, {
          flipped: !this.flipped,
          x1: prevPoint[0] + prevNorm.x,
          y1: prevPoint[1] + prevNorm.y,
          x2: p[0] + norm.x,
          y2: p[1] + norm.y,
          width: window.bezierToolWidth || 1,
          multiplier: window.bezierToolMultiplier || 1,
          type,
        });

        prevNorm = norm;
      }
      prevPoint = p;
    }
  }

  this.dispatch(addLines(lines));
}

detach() {
// this doesnt work
    if (this._onDocPointerDown) {
      document.removeEventListener("pointerdown", this._onDocPointerDown, true);
      this._onDocPointerDown = null;
    }
    if (this._onDocContext) {
      document.removeEventListener("contextmenu", this._onDocContext, true);
      this._onDocContext = null;
    }

  this.dispatch(revertTrackChanges());
}
  }

  const e = React.createElement;

  class BezierComponent extends React.Component {
    constructor(props) {
      super(props);

      if (!this.setState) {
        this.setState = this.setState;
      }

      this.state = {
        count: 0,
        changed: false,
        status: "Not Connected",
        radius: 0,
        scnWidth: 1,
        multiplier: 1,
        flipped: false,
      };

      window.bezierToolRadius = 0;
      window.bezierToolWidth = 1;
      window.bezierToolMultiplier = 1;
      window.bezierToolFlipped = false;

      store.subscribe(() => {
        if (!this._mounted) return;
        const changed = getSimulatorTrack(store.getState())
          !== getSimulatorCommittedTrack(store.getState());
        if (changed !== this.state.changed) {
          this.setState({ changed });
        }
      });
}

    componentDidMount() {
      this._mounted = true;
    }

    componentWillUnmount() {
      this._mounted = false;
    }

    onCommit() {
      store.dispatch(commitTrackChanges());
      store.dispatch(setBezierToolState(new InitState()));
    }
    onReset() {
      if (this.state.changed) {
        store.dispatch(revertTrackChanges());
      }
      store.dispatch(setBezierToolState(new InitState()));
    }

    render() {
      const onRadiusChange = e => {
        const radius = parseFloatOrDefault(e.target.value);
        this.setState({ radius });
        window.bezierToolRadius = radius;
      };
      const onSceneryWidthChange = e => {
        const scnWidth = parseFloatOrDefault(e.target.value);
        this.setState({ scnWidth });
        window.bezierToolWidth = scnWidth;
      };
      const onMultiplierChange = e => {
        const multiplier = parseFloatOrDefault(e.target.value);
        this.setState({ multiplier });
        window.bezierToolMultiplier = multiplier;
      };
      const onFlippedChange = () => {
        const flipped = !this.state.flipped;
        this.setState({ flipped });
        window.bezierToolFlipped = flipped;
      };
      return e("div", null, [
        "Bezier Tool",
        e("div", null, [
          e(
            "label",
            null,
            "Flip",
            e("input", { type: "checkbox", checked: this.state.flipped, onClick: onFlippedChange }),
          ),
          e(
            "div",
            null,
            "Radius",
            e("input", {
              style: { width: "3em" },
              type: "number",
              onChange: onRadiusChange,
              min: 0,
              value: this.state.radius,
            }),
            e("input", {
              type: "range",
              onChange: onRadiusChange,
              onFocus: e => e.target.blur(),
              min: 0,
              max: 20,
              step: 0.1,
              value: this.state.radius,
            }),
          ),
          e(
            "div",
            null,
            "Scenery Width",
            e("input", {
              style: { width: "3em" },
              type: "number",
              onChange: onSceneryWidthChange,
              min: 0.01,
              value: this.state.scnWidth,
            }),
            e("input", {
              type: "range",
              onChange: onSceneryWidthChange,
              onFocus: e => e.target.blur(),
              min: 0.01,
              max: 20,
              step: 0.1,
              value: this.state.scnWidth,
            }),
          ),
          e(
            "div",
            null,
            "Multiplier",
            e("input", {
              style: { width: "3em" },
              type: "number",
              onChange: onMultiplierChange,
              value: this.state.multiplier,
            }),
            e("input", {
              type: "range",
              onChange: onMultiplierChange,
              onFocus: e => e.target.blur(),
              min: -20,
              max: 20,
              step: 0.1,
              value: this.state.multiplier,
            }),
          ),
          e(
            "button",
            {
              onClick: this.onCommit.bind(this),
              disabled: !this.state.changed,
            },
            "Commit",
          ),
          e("button", { onClick: this.onReset.bind(this) }, "Reset"),
        ]),
      ]);
    }
  }

  window.registerCustomTool(TOOL_ID, BezierTool, BezierComponent);
}

/* init */
if (window.registerCustomTool) {
  main();
} else {
  const prevCb = window.onCustomToolsApiReady;
  window.onCustomToolsApiReady = () => {
    if (prevCb) prevCb();
    main();
  };
}