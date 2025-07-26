// ==UserScript==
// @name         Fill Tool
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  this is the version that malizma gave back to me to fix radius and make it actually reduce lag
// @version      0.2.1
// @icon         https://www.linerider.com/favicon.ico
// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*
// @grant        none
// @require      https://raw.githubusercontent.com/EmergentStudios/linerider-userscript-mods/master/lib/sortedindex.js
// @require      https://raw.githubusercontent.com/EmergentStudios/linerider-userscript-mods/master/lib/sortedindexby.js
// ==/UserScript==

(function () {
  const TOOL_ID = "🪣 Fill Tool";
  const LINE_WIDTH = 2;
  const SELECT_TOOL = "SELECT_TOOL";

  let V2, store;
  let previewLines = [];
  const sortedIndex = window.lodash.sortedindex;
  const sortedIndexBy = window.lodash.sortedindexby;
  const getSimulatorLayers = state => state.simulator.engine.engine.state.layers.toArray();
  const getSelLayer = state => state.simulator.engine.engine.state.activeLayerId;
  const getActiveTool = state => state.selectedTool;
  const getToolState = (state, toolId) => state.toolState[toolId];
  const e = React.createElement;

  let currentTool = getActiveTool(window.store.getState());

  window.store.subscribe(() => {
    const newTool = getActiveTool(window.store.getState());
    if (newTool !== currentTool) {
      const prevTool = currentTool;
      currentTool = newTool;

      if (newTool === TOOL_ID) {
        // Fill Tool activated
        const selectToolState = getToolState(window.store.getState(), SELECT_TOOL);
        if (!window.fillToolState) window.fillToolState = {};
        window.fillToolState.selectedLines ??= [];

        if (selectToolState && selectToolState.selectedPoints) {
          const allLines = window.Selectors.getSimulatorLines(store.getState());
          function getLineIdsFromPoints(points) {
            return new Set([...points].map(point => point >> 1));
          }
          let lineIds = [];
          lineIds = [...getLineIdsFromPoints(selectToolState.selectedPoints)];
          const matchingLines = allLines.filter(line => lineIds.includes(line.id));
          window.fillToolState.selectedLines = matchingLines;

          renderSelected();
        }
      }

      if (prevTool === TOOL_ID && newTool !== TOOL_ID) {
        // Fill Tool deactivated
        window.fillToolState.selectedLines ??= [];
        const selectedPoints = new Set();
        const addLinePoints = (line) => {
          if (line.id !== undefined) {
            selectedPoints.add(line.id * 2);
            selectedPoints.add(line.id * 2 + 1);
          }
        };

        store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities([]) } }); // removes fill select render
        for (const line of window.fillToolState.selectedLines) {
          addLinePoints(line);
        }
        store.dispatch({
          type: "SET_TOOL_STATE",
          payload: { selectedPoints },
          meta: { id: "SELECT_TOOL" },
        });
      }
    }
  });

  // defaults
  const fillToolDefaults = {
    // Mode
    fillMode: true,
    outlineMode: false,
    selectMode: false,

    // Layers
    layers: false,
    fillLayer: -1,
    outlineLayer: -2, // if fill mode on, -2, if outline mode on, -1

    // Style
    style: true,
    spacing: 0,
    angle: 0,
    offset: 0,
    thickness: 1,
    keepBridges: false,

    // Selection
    selection: true,
    tolerance: 1,
    intersections: false,
    shapes: 1,

    // Advanced
    advanced: false,
    prioritizeConnected: false,
    bridgeToler: true,
    bridgeInter: true,
    minLines: 0,
    maxLines: 100,
    radius: 200,
    funMode: false,

    // Extra stuff
    loadedSettings: true
  };

  // key presses
  let isAltDown = false;
  let isCtrlDown = false;

  document.addEventListener('keydown', (e) => {
    if (e.key === "Alt") isAltDown = true;
    if (e.key === "Control") isCtrlDown = true;
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === "Alt") isAltDown = false;
    if (e.key === "Control") isCtrlDown = false;
  });


  // conjunction junction what's your
  function log(...args) {
    console.log('[FillMod]', ...args);
  }

  function resetToDefaults() {
    const savedSelectedLines = window.fillToolState?.selectedLines || [];

    window.fillToolState = {
      ...fillToolDefaults,
      selectedLines: savedSelectedLines
    };
  }

  function distance(v1, v2) {
    return Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
  }

  function areEndpointsClose(p1, p2, tolerance) {
    return distance(p1, p2) <= tolerance;
  }

  function midpoint(p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
  }

  function crossZ(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  function directionRelativeToLine(line, point) {
    const vec = { x: line.p2.x - line.p1.x, y: line.p2.y - line.p1.y };
    const toClick = { x: point.x - line.p1.x, y: point.y - line.p1.y };
    return -crossZ(vec, toClick);
  }

  function angleFromLine(baseLine, candidateLine) {
    const baseVec = { x: baseLine.p2.x - baseLine.p1.x, y: baseLine.p2.y - baseLine.p1.y };
    const nextVec = { x: candidateLine.p2.x - candidateLine.p1.x, y: candidateLine.p2.y - candidateLine.p1.y };
    const cross = crossZ(baseVec, nextVec);
    const dot = baseVec.x * nextVec.x + baseVec.y * nextVec.y;
    return Math.atan2(cross, dot);
  }

  // intersections
  function linesIntersect(p1, p2, q1, q2) {
    const det = (a, b, c, d) => a * d - b * c;

    const r = { x: p2.x - p1.x, y: p2.y - p1.y };
    const s = { x: q2.x - q1.x, y: q2.y - q1.y };
    const rxs = det(r.x, r.y, s.x, s.y);
    const q_p = { x: q1.x - p1.x, y: q1.y - p1.y };
    const qpxr = det(q_p.x, q_p.y, r.x, r.y);

    if (rxs === 0 && qpxr === 0) return false; // colinear
    if (rxs === 0 && qpxr !== 0) return false; // parallel

    const t = det(q_p.x, q_p.y, s.x, s.y) / rxs;
    const u = det(q_p.x, q_p.y, r.x, r.y) / rxs;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function getIntersectionPoint(p1, p2, p3, p4) {
    const a1 = p2.y - p1.y;
    const b1 = p1.x - p2.x;
    const c1 = a1 * p1.x + b1 * p1.y;

    const a2 = p4.y - p3.y;
    const b2 = p3.x - p4.x;
    const c2 = a2 * p3.x + b2 * p3.y;

    const det = a1 * b2 - a2 * b1;
    if (det === 0) return null; // parallel lines

    const x = (b2 * c1 - b1 * c2) / det;
    const y = (a1 * c2 - a2 * c1) / det;
    return { x, y };
  }

  function findIntersections(currentLine, allLines) {
    const results = [];
    for (const line of allLines) {
      if (line.id === currentLine.id) continue;
      if (linesIntersect(currentLine.p1, currentLine.p2, line.p1, line.p2)) {
        const point = getIntersectionPoint(currentLine.p1, currentLine.p2, line.p1, line.p2);
        if (point) {
          results.push({ line, point });
        }
      }
    }
    return results;
  }

  // intersections are duping bridgelines so im just gonna delete the dupes
  function removeDuplicateLines(lines) {
    const seen = new Set();
    const unique = [];

    const round = (n) => Math.round(n * 1e6) / 1e6;

    for (const line of lines) {
      const x1 = round(line.p1.x);
      const y1 = round(line.p1.y);
      const x2 = round(line.p2.x);
      const y2 = round(line.p2.y);

      const key = [[x1, y1], [x2, y2]]
        .sort(([ax, ay], [bx, by]) => ax - bx || ay - by)
        .map(([x, y]) => `${x},${y}`)
        .join('|');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(line);
      }
    }
    return unique;
  }



  // select mode
  // this can be used to prevent duplicates but it's not needed, so it's never used
  // function addToFillToolSelection(line) {
  //   if (!window.fillToolState.selectedLines.some(l => l.id === line.id)) {
  //     window.fillToolState.selectedLines.push(line);
  //   }
  // }

  async function renderSelected() {
    // okay i am going to render PURPLE SELECTION now!!! NEW LINE RIDER . COM SELECTION COLOR LORE
    let color = new Millions.Color(0, 230, 255, 255);
    // nevermind it was ugly i chose boring line rider selection blue instead

    let thickness = 0.5;
    let scene = [];
    for (const [index, line] of window.fillToolState.selectedLines.entries()) {

      // i shall compromise via this fun mode
      if (window.fillToolState.funMode) {
        color = new Millions.Color((line.p1.x % 255), (line.p1.y % 255), (index % 255), 200); // other fun values: (Date.now() % 255)
        thickness = 2
      }
      let p1 = {
        x: line.p1.x,
        y: line.p1.y,
        colorA: color,
        colorB: color,
        thickness
      };
      let p2 = {
        x: line.p2.x,
        y: line.p2.y,
        colorA: color,
        colorB: color,
        thickness
      };
      const lineEntity = new Millions.Line(p1, p2, 1, index);
      scene.push(lineEntity);
    }

    store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities(scene) } });
  }

  function genAll(lines, startLine, isSelectFill) {
    if (isSelectFill) {
      if (!window.fillToolState.fillMode && !window.fillToolState.outlineMode) {
        window.fillToolState.fillMode = true;
      }
    }

    let outlineLayer;
    const selLayer = getSelLayer(window.store.getState());
    if (window.fillToolState.outlineLayer === -2) {
      let matchLine = startLine ?? selLayer;
      const matchLayer = matchLine.layer ?? 0;
      outlineLayer = matchLayer;
    } else if (window.fillToolState.outlineLayer === -1) {
      outlineLayer = selLayer;
    } else {
      outlineLayer = window.fillToolState.outlineLayer;
    }
    for (const fillLine of genFill(lines, window.fillToolState)) {
      previewLines.push(fillLine);
    }

    const bridgeLines = window.fillToolState.keepBridges
      ? lines.flat().filter(l => l.isBridge).map(l => ({
        x1: l.p1.x,
        y1: l.p1.y,
        x2: l.p2.x,
        y2: l.p2.y,
        type: 2,
        layer: outlineLayer
      }))
      : [];

    const outlineLines = window.fillToolState.outlineMode
      ? lines.flat().filter(l => !l.isBridge).map(l => ({
        x1: l.p1.x,
        y1: l.p1.y,
        x2: l.p2.x,
        y2: l.p2.y,
        type: 2,
        id: l.id,
        layer: outlineLayer
      }))
      : [];

    if (window.fillToolState.selectMode) {
      window.fillToolState.fillMode = false;
    }

    store.dispatch({
      type: 'UPDATE_LINES',
      payload: {
        linesToRemove: null, // oldOutlineLines,
        linesToAdd: [...bridgeLines, ...outlineLines, ...previewLines]
      },
      meta: { name: 'Click Fill' }
    });


    store.dispatch({ type: 'COMMIT_TRACK_CHANGES' });
    previewLines = [];
  }

  function findConnectedLoop(startLine, allLines, tolerance, allowIntersection = false, selectedIds = [], clickPos = null) {
    const used = new Set();
    let windingDirection = clickPos ? directionRelativeToLine(startLine, clickPos) : 0;
    const bridgeLinesThisLoop = [];

    function dfs(currentLine, path, remainingLines, expectedReturnPoint) {

      used.add(currentLine.id);
      path.push(currentLine);
      const end = currentLine.p2;

      const connected = [];
      const nearby = [];

      for (const l of remainingLines) {
        if (l.id === currentLine.id) continue;
        if (window.fillToolState.maxLines < path.length) break; // idk if this is the best spot for this but it seems to work pretty well

        let matched = false;
        let candidate = { ...l };

        // Check for intersections first if enabled
        if (window.fillToolState.intersections) {
          const intersections = findIntersections(currentLine, remainingLines);
          let isClosed = false

          if (intersections.length > 0) {
            for (const i of intersections) {
              if (i.line === startLine) {
                log("closing intersection found")
                isClosed = true;
                continue; // this might be wrong idk
              }
            }
          }
          if (!isClosed && intersections.length > 0) {
            intersections.sort((a, b) => distance(a.point, end) - distance(b.point, end));
            const closest = intersections[0];
            const intersectingLine = closest.line;
            const intersectionPoint = getIntersectionPoint(currentLine.p1, currentLine.p2, intersectingLine.p1, intersectingLine.p2);

            const isLeft = directionRelativeToLine(currentLine, intersectingLine.p1);
            const nextLine = {
              p1: intersectionPoint,
              p2: (isLeft * windingDirection > 0) ? intersectingLine.p1 : intersectingLine.p2,
              id: intersectingLine.id,
              isInter: true
            };
            currentLine.isInter = true;

            log("intersecting line:", intersectingLine, "point:", intersectionPoint, "is left:", (isLeft * windingDirection > 0), "next line:", nextLine);

            if (window.fillToolState.bridgeInter) {

              const bridge1 = { p1: currentLine.p1, p2: intersectionPoint, type: 2, isBridge: intersectingLine.id };
              const bridge2 = { p1: intersectionPoint, p2: nextLine.p2, type: 2, isBridge: intersectingLine.id };

              bridgeLinesThisLoop.push(bridge1, bridge2);
            }

            const result = dfs(nextLine, path, remainingLines.filter(l2 => l2.id !== intersectingLine.id), expectedReturnPoint);

            if (result) {
              return result;
            }

            log("backtracking from intersection")
          }
        }

        // If no intersection, fallback to tolerance check
        if (!matched) {
          const d1 = distance(currentLine.p2, l.p1);
          const d2 = distance(currentLine.p2, l.p2);
          if (window.fillToolState.prioritizeConnected) {
            if (d1 < 0.001) {
            } else if (d2 < 0.001) {
              [candidate.p1, candidate.p2] = [candidate.p2, candidate.p1];
            } else {
              continue;
            }
            connected.push(candidate);
          }
          if (d1 <= tolerance) {
            if (d1 > 0.01 && window.fillToolState.bridgeToler) {
              const bridge = {
                p1: { ...currentLine.p2 },
                p2: { ...l.p1 },
                type: 2, // i probably don't need this but that's okay
                isBridge: l.id
              };
              bridgeLinesThisLoop.push(bridge);
            }
          } else if (d2 <= tolerance) {
            [candidate.p1, candidate.p2] = [candidate.p2, candidate.p1];
            if (d2 > 0.01 && window.fillToolState.bridgeToler) {
              const bridge = {
                p1: { ...currentLine.p2 },
                p2: { ...l.p2 },
                type: 2,
                isBridge: l.id
              };
              bridgeLinesThisLoop.push(bridge);
            }
          } else {
            continue;
          }
          nearby.push(candidate);
        }

      }


      nearby.sort((a, b) => {
        const angleA = angleFromLine(currentLine, a);
        const angleB = angleFromLine(currentLine, b);
        return windingDirection > 0 ? angleA - angleB : angleB - angleA;
      });
      if (window.fillToolState.prioritizeConnected) {
        connected.sort((a, b) => {
          const angleA = angleFromLine(currentLine, a);
          const angleB = angleFromLine(currentLine, b);
          return windingDirection > 0 ? angleA - angleB : angleB - angleA;
        });
        nearby.unshift(...connected);
      }
      for (const next of nearby) {
        let isClosed = areEndpointsClose(next.p2, expectedReturnPoint, tolerance);

        const loopSize = path.length + 1;

        if (isClosed) {
          if (window.fillToolState.maxLines < loopSize) continue;
          if (window.fillToolState.minLines > loopSize) continue;


          // remove duplicate bridge lines (im looking at YOU, intersections!!!)
          bridgeLinesThisLoop.splice(0, bridgeLinesThisLoop.length, ...removeDuplicateLines(bridgeLinesThisLoop));

          let fullLoop = [...path];
          const d3 = distance(next.p2, expectedReturnPoint);
          fullLoop.push(next);

          // add final bridge tolerance line
          if (d3 <= tolerance) {
            if (d3 > 0.01 && window.fillToolState.bridgeToler) {
              const bridge = {
                p1: { ...next.p2 },
                p2: { ...expectedReturnPoint },
                type: 2,
                isBridge: next.id
              };
              bridgeLinesThisLoop.push(bridge);
            }
          }

          // only add bridge lines that were actually correct
          for (const bridgeLine of bridgeLinesThisLoop) {
            if (bridgeLine.isBridge == null) continue;
            const match = fullLoop.some(line => line.id === bridgeLine.isBridge);
            if (match) {
              fullLoop.push(bridgeLine);
            }
          }

          // remove intersecting lines replaced with bridge intersections
          if (window.fillToolState.bridgeInter) {
            fullLoop = fullLoop.filter(line => !line.isInter);
          }

          if (fullLoop[0] === undefined) { // this is because sometimes the first line epic fails
            fullLoop.shift();
            log("removed first line:", fullLoop)
          }

          return fullLoop;
          break;
        }
        if (!used.has(next.id)) {
          const result = dfs(next, [...path], remainingLines.filter(l => l.id !== next.id), expectedReturnPoint);
          if (result) return result;
        }
      }

      return null;
    } // end of dfs function

    if (window.fillToolState.shapes === 1) {
      return dfs({ ...startLine }, [], allLines.filter(l => l.id !== startLine.id), startLine.p1);
    } else {
      const foundLoops = [];
      const visited = new Set();

      const sortedByDist = [...allLines].map(l => {
        const mp = midpoint(l.p1, l.p2);
        return { dist: distance(clickPos, mp), line: l };
      }).filter(d => d.dist <= window.fillToolState.radius).sort((a, b) => a.dist - b.dist);

      for (const { line } of sortedByDist) {
        if (visited.has(line.id)) continue;
        if (foundLoops.length === window.fillToolState.shapes) continue;
        used.clear();
        bridgeLinesThisLoop.length = 0;
        windingDirection = clickPos ? directionRelativeToLine(line, clickPos) : 0;
        const result = dfs({ ...line }, [], allLines.filter(l => l.id !== line.id), line.p1);
        if (result) {
          result.forEach(l => { if (!l.isBridge) visited.add(l.id); });
          foundLoops.push(result);
        }
      }

      return foundLoops.length ? foundLoops : null;
    }
  }

  function* genFill(lines, { angle = 0, spacing = 0, offset = 0, tolerance = 2 } = {}) {
    spacing = LINE_WIDTH * (0.9 + spacing);
    offset = spacing * offset;
    const rads = angle / 180 * Math.PI;
    const toAngle = rotateTransform(rads);
    const fromAngle = rotateTransform(-rads);
    const points = [];
    const insertSorted = (p) => points.splice(sortedIndexBy(points, p, x => x.x), 0, p);

    for (let line of lines) {
      const id = line.id
      const p1 = new V2(line.p1).transform(toAngle);
      const p2 = new V2(line.p2).transform(toAngle);
      line = p1.x < p2.x ? { id, p1, p2 } : { id, p1: p2, p2: p1 };
      insertSorted({ id, x: line.p1.x, y: line.p1.y, line });
      insertSorted({ id, x: line.p2.x, y: line.p2.y, line });
      log('line selected');
    }

    if (!points.length) return;
    let currentX = points[0].x + offset;
    const currentLines = new Set();
    const ys = [];

    for (const point of points) {
      for (; currentX < point.x; currentX += spacing) {
        for (const { p1, p2 } of currentLines.values()) {
          const t = (currentX - p1.x) / (p2.x - p1.x);
          const y = t * (p2.y - p1.y) + p1.y;
          ys.splice(sortedIndex(ys, y), 0, y);
        }
        let currentY = null;
        if (window.fillToolState.fillMode) {
          const selLayer = getSelLayer(window.store.getState());
          const fillLayer = window.fillToolState.fillLayer === -1
            ? selLayer
            : window.fillToolState.fillLayer;
          for (const y of ys) {
            if (currentY == null) currentY = y;
            else if (currentY !== y) {
              yield {
                x1: V2.from(currentX, currentY).transform(fromAngle).x,
                y1: V2.from(currentX, currentY).transform(fromAngle).y,
                x2: V2.from(currentX, y).transform(fromAngle).x,
                y2: V2.from(currentX, y).transform(fromAngle).y,
                width: window.fillToolState.thickness,
                type: 2,
                layer: fillLayer
              }; log('line filled');
              currentY = null;
            }
          }
          ys.length = 0;
        }
      }
      currentLines.has(point.line)
        ? currentLines.delete(point.line)
        : currentLines.add(point.line);
    }
  }

  function rotateTransform(rads) {
    const u = V2.from(1, 0).rot(rads);
    const v = V2.from(0, 1).rot(rads);
    return [u.x, v.x, u.y, v.y, 0, 0];
  }

  function main() {
    const { DefaultTool, React, store: _store, V2: _V2 } = window;
    store = _store;
    V2 = _V2;

    class FillTool extends DefaultTool {

      // on click
      onPointerUp(e) {
        if (!e || !e.pos) return;
        const pos = this.toTrackPos(e.pos);
        const radius = window.fillToolState.radius;
        const allLines = store.getState().simulator.engine.selectLinesInRadius(pos, radius)
        const tolerance = window.fillToolState.tolerance * 2;
        const t = performance.now();
        const getTrackLinesLocked = state => state.trackLinesLocked; // locked track swatches setting
        const getSelectedLineType = state =>
          getTrackLinesLocked(state) ? 2 : state.selectedLineType; // in case someone ever wants to add filling with non green lines back, but i dont! L + Crossio
        const lockedLayers = [];
        const layers = getSimulatorLayers(window.store.getState());

        const sortedByDist = [...allLines].map(l => {
          const mp = midpoint(l.p1, l.p2);
          return { dist: distance(pos, mp), line: l };
        }).filter(d => d.dist <= radius).sort((a, b) => a.dist - b.dist);

        if (isAltDown && window.fillToolState.selectMode) {
          const closestLine = sortedByDist[0].line;
          if (isCtrlDown) {
            window.fillToolState.selectedLines = window.fillToolState.selectedLines.filter(
              l => l.id !== closestLine.id
            );
          } else {
            window.fillToolState.selectedLines.push(closestLine);
          }
          renderSelected();
        } else {

          for (const { line } of sortedByDist) {
            const loop = findConnectedLoop(
              line,
              allLines,
              tolerance,
              window.fillToolState.intersections,
              [],
              pos
            );
            if (loop) {
              log('Loop found, dispatching fill. loop:', loop);

              let combinedLoop = [];

              if (Array.isArray(loop[0])) {
                // shapes > 1 → multiple loops
                for (const singleLoop of loop) {
                  combinedLoop.push(...singleLoop);
                }
              } else {
                // shapes = 1 → single loop
                combinedLoop = loop;
              }

              // select mode
              if (window.fillToolState.selectMode) {
                window.fillToolState.selectedLines ??= [];
                if (isCtrlDown) {
                  const combinedIds = new Set(combinedLoop.map(line => line.id));

                  window.fillToolState.selectedLines = window.fillToolState.selectedLines.filter(
                    line => !combinedIds.has(line.id)
                  );
                } else {
                  window.fillToolState.selectedLines.push(...combinedLoop);
                }
                renderSelected();
                log("sel lines:", window.fillToolState.selectedLines);
              }
              genAll(combinedLoop, line, false) // now if we were to gen "it" all, that would be gross!!!
              break;
            } else {
              log('No loop found for this line.');
            }
          } log("wowza! that took a whole", Math.round(performance.now() - t), "ms!")
        }
      }
    }

    class FillComponent extends React.Component {
      constructor(props) {
        super(props);

        // numLayers: getSimulatorLayers(store.getState()).length,
        if (!window.fillToolState || !window.fillToolState.loadedSettings) {
          resetToDefaults();
        }

        this.state = { ...window.fillToolState };
      }

      updateSetting = (key, value) => {
        this.setState({ [key]: value });
        window.fillToolState[key] = value;
      };

      renderHeader(title) {
        return e('h3', {
          style: {
            textAlign: 'center',
            fontSize: '1.2em',
            fontWeight: 'bold',
            margin: '0.5em 0',
            paddingBottom: '0.25em',
            borderBottom: '2px solid gray',
            paddingTop: '0.25em',
            borderTop: '2px solid gray',
          }
        }, title);
      }

      // headers with stolen trans mod collapse button thing
      renderSection(key, title) {
        return e('div', {
          style: {
            textAlign: 'center',
            margin: '0.5em 0',
            padding: '0.25em 0',
            borderTop: '2px solid gray',
            borderBottom: '2px solid gray',
          }
        }, [
          e('div', {
            style: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5em',
              fontWeight: 'bold',
              fontSize: '1.2em',
            }
          }, [
            e('span', null, title),
            e('button', {
              id: key,
              style: {
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1em',
                padding: 0,
              },
              onClick: () => this.setState({ [key]: !this.state[key] })
            }, this.state[key] ? '▲' : '▼')
          ])
        ]);
      }


      renderSlider(key, label, { min, max, step }) {
        const value = this.state[key];

        const displayValue =
          value === -2 ? "Match" :
            value === -1 ? "Active" :
              value;

        const isSpecial = key === 'fillLayer' || key === 'outlineLayer';
        const inputType = isSpecial ? 'text' : 'number';

        return e('div', {
          style: { marginBottom: '1em', display: 'flex', flexDirection: 'column' }
        }, [

          e('div', {
            style: { display: 'flex', alignItems: 'center', gap: '0.5em' }
          }, [
            e('label', {
              style: { minWidth: '6em', fontWeight: 'bold' }
            }, `${label}:`),

            e('input', {
              type: inputType,
              style: { width: '4em' },
              value: displayValue,
              onChange: e => {
                const val = e.target.value;
                let parsed;
                if (val === "Active") parsed = -1;
                else if (val === "Match") parsed = -2;
                else parsed = parseFloat(val);
                if (!isNaN(parsed) || val === "Active" || val === "Match") {
                  this.updateSetting(key, parsed);
                }
              }
            }),

            e('input', {
              type: 'range',
              value: value,
              min, max, step,
              onChange: e => this.updateSetting(key, parseFloat(e.target.value)),
              onFocus: e => e.target.blur(),
              style: { flex: 1 }
            })
          ]),

          isSpecial && e('button', {
            onClick: () => {
              const activeLayer = getSelLayer(window.store.getState());
              this.updateSetting(key, activeLayer);
            },
            style: { marginTop: '0.5em', width: 'fit-content' }
          }, 'Copy Active')
        ]);
      }

      renderToggle(key, label) {
        return e('div', null,
          e('label', null,
            e('input', {
              type: 'checkbox',
              checked: this.state[key],
              onChange: e => this.updateSetting(key, e.target.checked)
            }),
            ' ', label
          )
        );
      }

      // mode options
      renderEnumChoices() {
        // Compute current mode
        const { fillMode, outlineMode } = this.state;

        let selectedMode = 'select';
        if (fillMode && outlineMode) selectedMode = 'both';
        else if (fillMode) selectedMode = 'fill';
        else if (outlineMode) selectedMode = 'outline';

        const setMode = (mode) => {
          if (mode === 'fill') {
            this.updateSetting('fillMode', true);
            this.updateSetting('outlineMode', false);
            this.updateSetting('selectMode', false);
            this.updateSetting('fillLayer', -1); // it doesn't need to switch back to active when changing modes, but since outlineLayer does, it just feels like fill should too
            this.updateSetting('outlineLayer', -2);
          } else if (mode === 'outline') {
            this.updateSetting('fillMode', false);
            this.updateSetting('outlineMode', true);
            this.updateSetting('selectMode', false);
            this.updateSetting('fillLayer', -1);
            this.updateSetting('outlineLayer', -1);
          } else if (mode === 'both') {
            this.updateSetting('fillMode', true);
            this.updateSetting('outlineMode', true);
            this.updateSetting('selectMode', false);
            this.updateSetting('fillLayer', -1);
            this.updateSetting('outlineLayer', -1);
          } else if (mode === 'select') {
            this.updateSetting('fillMode', false);
            this.updateSetting('outlineMode', false);
            this.updateSetting('selectMode', true);
            this.updateSetting('fillLayer', -1);
            this.updateSetting('outlineLayer', -2);
          }
        };

        const options = [
          ['fill', 'Fill'],
          ['outline', 'Outline'],
          ['both', 'Outline & Fill'],
          ['select', 'Select']
        ];

        return e('div', { style: { marginBottom: '1em' } }, [
          this.renderHeader('Mode'),
          ...options.map(([value, label]) =>
            e('label', {
              key: value,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '0.5em',
                marginBottom: '0.25em',
                cursor: 'pointer'
              }
            }, [
              e('input', {
                type: 'radio',
                name: 'mode',
                value,
                checked: selectedMode === value,
                onChange: () => setMode(value),
                style: { cursor: 'pointer' }
              }),
              label
            ])
          )
        ]);
      }

      render() {
        return e("div", null, [

          this.renderEnumChoices(), // modes

          e("button", {
            onClick: () => {
              genAll(window.fillToolState.selectedLines, null, true);
              this.setState({ ...window.fillToolState });
            },
            style: { marginTop: '0.5em', width: 'fit-content' }
          }, "Fill Selected"),

          this.renderSection('layers', 'Layers'),
          this.state.layers &&
          e(
            'div',
            null,
            this.renderSlider('fillLayer', 'Fill Layer', { min: -1, max: 50, step: 1 }), // replace 50 with (this.state.numLayers - 1)
            this.renderSlider('outlineLayer', 'Outline Layer', { min: -2, max: 50, step: 1 }),
          ),
          null,

          this.renderSection('style', 'Style'),
          this.state.style &&
          e(
            'div',
            null,
            this.renderSlider('spacing', 'Spacing', { min: -0.05, max: 10, step: 0.01 }),
            this.renderSlider('angle', 'Rotation', { min: 0, max: 360, step: 1 }),
            this.renderSlider('offset', 'Offset', { min: 0, max: 1, step: 0.01 }),
            this.renderSlider('thickness', 'Line Thickness', { min: 0.1, max: 10, step: 0.1 }),
            this.renderToggle('keepBridges', 'Keep Bridges'),
          ),

          this.renderSection('selection', 'Selection'),
          this.state.selection &&
          e(
            'div',
            null,
            this.renderSlider('tolerance', 'Tolerance', { min: 0, max: 10, step: 0.1 }),
            this.renderToggle('intersections', '🐞Intersections'),
            this.renderSlider('shapes', 'Shapes', { min: 1, max: 20, step: 1 }),
          ),

          this.renderSection('advanced', 'Advanced'),
          this.state.advanced &&
          e(
            'div',
            null,
            this.renderToggle('prioritizeConnected', '🐞Prioritize Connected'),
            this.renderToggle('bridgeToler', 'Bridge Tolerance'),
            this.renderToggle('bridgeInter', '🐞Bridge Intersections'),
            this.renderSlider('minLines', 'Min Lines', { min: 0, max: 50, step: 1 }),
            this.renderSlider('maxLines', 'Max Lines', { min: 3, max: 1000, step: 1 }),
            this.renderSlider('radius', 'Click Radius', { min: 0, max: 1000, step: 1 }),
            this.renderToggle('funMode', 'Fun Mode'),
          ),
          e("button", {
            onClick: () => {
              resetToDefaults();
              this.setState({ ...window.fillToolState });
            },
            style: { marginTop: '0.5em', width: 'fit-content' }
          }, "Reset"),
        ]);
      }
    }

    window.registerCustomTool(TOOL_ID, FillTool, FillComponent);
  }

  if (window.registerCustomTool) {
    main();
  } else {
    const prev = window.onCustomToolsApiReady;
    window.onCustomToolsApiReady = () => {
      if (prev) prev();
      main();
    };
  }
})();
