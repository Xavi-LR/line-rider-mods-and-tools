// ==UserScript==
// @name         Quick Metadata Mod
// @namespace    https://www.linerider.com/
// @description  Right-click on a line to edit metadata
// @author       original mod by Ethan Li & Malizma
// @version      1.2.1
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/quick-metadata.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/quick-metadata.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

(function () {
  'use strict'

  /* settings */

  // whether or not you have to be using the select tool to open the metadata menu by right clicking on a line:
  const REQUIRE_SELECT_TOOL = true;

  /* constants */
  const SELECT_TOOL = 'SELECT_TOOL'
  const EMPTY_SET = new Set()

  const FIELD_DEFS = [
    { key: 'x1', label: 'X1', type: 'number' },
    { key: 'y1', label: 'Y1', type: 'number' },
    { key: 'x2', label: 'X2', type: 'number' },
    { key: 'y2', label: 'Y2', type: 'number' },
    { key: 'flipped', label: 'Flipped', type: 'checkbox' },
    { key: 'negativeMultiplier', label: 'Negative Multiplier', type: 'checkbox' },
    { key: 'multiplierSmall', label: 'Multiplier Small', type: 'number' },
    { key: 'multiplierLarge', label: 'Multiplier Large', type: 'number' },
    { key: 'sceneryWidth', label: 'Scenery Width', type: 'number' },
  ]

  /* actions */
  const setTool = (tool) => ({
    type: 'SET_TOOL',
    payload: tool
  })

  const updateLines = (linesToRemove, linesToAdd) => ({
    type: 'UPDATE_LINES',
    payload: { linesToRemove, linesToAdd }
  })

  const commitTrackChanges = () => ({
    type: 'COMMIT_TRACK_CHANGES'
  })

  const revertTrackChanges = () => ({
    type: 'REVERT_TRACK_CHANGES'
  })

  const setEditScene = (scene) => ({
    type: 'SET_RENDERER_SCENE',
    payload: { key: 'edit', scene }
  })

  /* selectors */
  const getActiveTool = state => state.selectedTool
  const getToolState = (state, toolId) => state.toolState[toolId]
  const getSelectToolState = state => getToolState(state, SELECT_TOOL)

  function waitForReady() {
    return !!(
      window.store &&
      typeof window.store.getState === 'function' &&
      typeof window.store.dispatch === 'function' &&
      window.React &&
      window.ReactDOM
    )
  }

  function getCanvas() {
    return document.querySelector('canvas')
  }

  function getCamera() {
    const state = window.store.getState()
    return state && state.camera ? state.camera : null
  }

  function getWorldPointFromMouseEvent(ev) {
    const canvas = getCanvas()
    const camera = getCamera()
    if (!canvas || !camera) return null

    const rect = canvas.getBoundingClientRect()
    const zoom = Number(camera.editorZoom) || 1
    const pos = camera.editorPosition || { x: 0, y: 0 }

    const sx = ev.clientX - rect.left
    const sy = ev.clientY - rect.top

    const x = pos.x + (sx - rect.width / 2) / zoom
    const y = pos.y + (sy - rect.height / 2) / zoom

    return { x, y, zoom }
  }

  function getLinesFromPoints(points) {
    return new Set([...points].map(point => point >> 1))
  }

  function parseFloatOrDefault(value, defaultValue = 0) {
    const x = parseFloat(value)
    return Number.isNaN(x) ? defaultValue : x
  }

  function splitMultiplier(multiplier) {
    let value = parseFloatOrDefault(multiplier, 1)
    const negative = value < 0
    if (negative) value *= -1

    const large = parseFloat(value).toFixed(0)
    const small = parseFloat(value - large).toFixed(2)
    return { negative, small, large }
  }

  function combineMultiplier(negative, small, large) {
    const total = parseFloatOrDefault(small, 0) + parseFloatOrDefault(large, 0)
    return (negative ? -1 : 1) * total
  }

  function lineToFormState(line) {
    const multiplier = splitMultiplier(line.multiplier)
    return {
      x1: String(line.x1),
      y1: String(line.y1),
      x2: String(line.x2),
      y2: String(line.y2),
      flipped: !!line.flipped,
      negativeMultiplier: multiplier.negative,
      multiplierSmall: multiplier.small,
      multiplierLarge: multiplier.large,
      sceneryWidth: String(line.width ?? 1),
    }
  }

  function cloneLine(line) {
    if (!line) return null
    if (typeof line.toJSON === 'function') return line.toJSON()
    return JSON.parse(JSON.stringify(line))
  }

  function highestIdLine(lines) {
    return lines.reduce((best, line) => {
      if (!best) return line
      return Number(line.id) > Number(best.id) ? line : best
    }, null)
  }

  class MetadataPopup extends window.React.Component {
    constructor(props) {
      super(props)

      this.state = {
        visible: false,
        mode: null,
        lineCount: 0,

        left: 160,
        top: 120,
        dragging: false,
        dragOffsetX: 0,
        dragOffsetY: 0,

        x1: '',
        y1: '',
        x2: '',
        y2: '',
        flipped: false,
        negativeMultiplier: false,
        multiplierSmall: '',
        multiplierLarge: '',
        sceneryWidth: '',

        x1Override: false,
        y1Override: false,
        x2Override: false,
        y2Override: false,
        flippedOverride: false,
        negativeMultiplierOverride: false,
        multiplierSmallOverride: false,
        multiplierLargeOverride: false,
        sceneryWidthOverride: false,
      }

      this.originalLines = []
      this.changed = false

      this.onDocumentMouseMove = this.onDocumentMouseMove.bind(this)
      this.onDocumentMouseUp = this.onDocumentMouseUp.bind(this)
      this.onKeyDown = this.onKeyDown.bind(this)
    }

    componentDidMount() {
      document.addEventListener('mousemove', this.onDocumentMouseMove)
      document.addEventListener('mouseup', this.onDocumentMouseUp)
      document.addEventListener('keydown', this.onKeyDown)
    }

    componentWillUnmount() {
      document.removeEventListener('mousemove', this.onDocumentMouseMove)
      document.removeEventListener('mouseup', this.onDocumentMouseUp)
      document.removeEventListener('keydown', this.onKeyDown)
    }

    onKeyDown(ev) {
      if (ev.key === 'Escape' && this.state.visible) {
        this.close(true)
      }
      if (ev.key === 'Enter' && this.state.visible) {
        this.close(false)
      }
    }

    onDocumentMouseMove(ev) {
      if (!this.state.dragging) return

      this.setState({
        left: ev.clientX - this.state.dragOffsetX,
        top: ev.clientY - this.state.dragOffsetY,
      })
    }

    onDocumentMouseUp() {
      if (!this.state.dragging) return
      this.setState({ dragging: false })
    }

    startDrag(ev) {
      ev.preventDefault()
      ev.stopPropagation()

      this.setState({
        dragging: true,
        dragOffsetX: ev.clientX - this.state.left,
        dragOffsetY: ev.clientY - this.state.top,
      })
    }

    ensureSelectTool() {
      const state = window.store.getState()
      if (getActiveTool(state) !== SELECT_TOOL) {
        window.store.dispatch(setTool(SELECT_TOOL))
      }
    }

    cancelEdits() {
      if (!this.changed) return

      window.store.dispatch(revertTrackChanges())
      if (window.Millions && window.Millions.Scene) {
        window.store.dispatch(setEditScene(new window.Millions.Scene()))
      }
      this.changed = false
    }

    commitEdits() {
      if (!this.changed) return

      window.store.dispatch(commitTrackChanges())
      window.store.dispatch(revertTrackChanges())
      if (window.Millions && window.Millions.Scene) {
        window.store.dispatch(setEditScene(new window.Millions.Scene()))
      }
      this.changed = false
    }

    open(mode, lines) {
      if (!lines || !lines.length) return

      this.cancelEdits()

      // this.ensureSelectTool()

      this.originalLines = lines.map(cloneLine).filter(Boolean)

      const nextState = {
        visible: true,
        mode,
        lineCount: this.originalLines.length,

        x1: '',
        y1: '',
        x2: '',
        y2: '',
        flipped: false,
        negativeMultiplier: false,
        multiplierSmall: '',
        multiplierLarge: '',
        sceneryWidth: '',

        x1Override: false,
        y1Override: false,
        x2Override: false,
        y2Override: false,
        flippedOverride: false,
        negativeMultiplierOverride: false,
        multiplierSmallOverride: false,
        multiplierLargeOverride: false,
        sceneryWidthOverride: false,
      }

      if (mode === 'selected' || mode === 'closest') {
        const line = this.originalLines[0]
        Object.assign(nextState, lineToFormState(line))
      }

      this.setState(nextState, () => {
        this.applyChanges()
      })
    }

    close(cancel = true) {
      if (!this.state.visible) return

      if (cancel) {
        this.cancelEdits()
      } else {
        this.commitEdits()
      }

      this.originalLines = []
      this.setState({
        visible: false,
        mode: null,
        lineCount: 0,

        x1: '',
        y1: '',
        x2: '',
        y2: '',
        flipped: false,
        negativeMultiplier: false,
        multiplierSmall: '',
        multiplierLarge: '',
        sceneryWidth: '',

        x1Override: false,
        y1Override: false,
        x2Override: false,
        y2Override: false,
        flippedOverride: false,
        negativeMultiplierOverride: false,
        multiplierSmallOverride: false,
        multiplierLargeOverride: false,
        sceneryWidthOverride: false,

        dragging: false,
      })
    }

    applyChanges() {
      if (!this.state.visible || !this.originalLines.length) return

      if (this.changed) {
        this.cancelEdits()
      }

      const editedLines = this.originalLines.map(original => this.transformLine(original))
      window.store.dispatch(updateLines(null, editedLines))
      this.changed = true
    }

    transformLine(original) {
      const line = cloneLine(original)

      const mode = this.state.mode
      const offsetMode = mode === 'offset'

      const originalSplit = splitMultiplier(original.multiplier)
      const originalSmall = parseFloatOrDefault(originalSplit.small, 0)
      const originalLarge = parseFloatOrDefault(originalSplit.large, 0)
      const originalNegative = originalSplit.negative

      const nextNumber = (key) => parseFloatOrDefault(this.state[key], 0)
      const nextBool = (key) => !!this.state[key]
      const override = (key) => !!this.state[`${key}Override`]

      if (!offsetMode) {
        line.x1 = nextNumber('x1')
        line.y1 = nextNumber('y1')
        line.x2 = nextNumber('x2')
        line.y2 = nextNumber('y2')
        line.flipped = nextBool('flipped')
        line.width = nextNumber('sceneryWidth')
        line.multiplier = combineMultiplier(
          nextBool('negativeMultiplier'),
          this.state.multiplierSmall,
          this.state.multiplierLarge
        )
        return line
      }

      if (override('x1')) line.x1 = nextNumber('x1')
      else line.x1 = parseFloatOrDefault(line.x1, 0) + nextNumber('x1')

      if (override('y1')) line.y1 = nextNumber('y1')
      else line.y1 = parseFloatOrDefault(line.y1, 0) + nextNumber('y1')

      if (override('x2')) line.x2 = nextNumber('x2')
      else line.x2 = parseFloatOrDefault(line.x2, 0) + nextNumber('x2')

      if (override('y2')) line.y2 = nextNumber('y2')
      else line.y2 = parseFloatOrDefault(line.y2, 0) + nextNumber('y2')

      if (override('flipped')) {
        line.flipped = nextBool('flipped')
      } else if (this.state.flipped) {
        line.flipped = !line.flipped
      }

      if (override('sceneryWidth')) {
        line.width = nextNumber('sceneryWidth')
      } else {
        line.width = parseFloatOrDefault(line.width, 1) + nextNumber('sceneryWidth')
      }

      const nextNegative = override('negativeMultiplier')
        ? nextBool('negativeMultiplier')
        : (this.state.negativeMultiplier ? !originalNegative : originalNegative)

      const nextSmall = override('multiplierSmall')
        ? nextNumber('multiplierSmall')
        : originalSmall + nextNumber('multiplierSmall')

      const nextLarge = override('multiplierLarge')
        ? nextNumber('multiplierLarge')
        : originalLarge + nextNumber('multiplierLarge')

      line.multiplier = (nextNegative ? -1 : 1) * (nextSmall + nextLarge)

      return line
    }

    setField(key, value) {
      this.setState({ [key]: value }, () => {
        this.applyChanges()
      })
    }

    renderField(def) {
      const isOffset = this.state.mode === 'offset'
      const overrideKey = `${def.key}Override`

      if (def.type === 'checkbox') {
        if (isOffset) {
          return window.React.createElement(
            'div',
            { key: def.key, style: { display: 'grid', gridTemplateColumns: '18px 1fr 18px', gap: '6px', alignItems: 'center', marginBottom: '4px' } },
            window.React.createElement('input', {
              type: 'checkbox',
              checked: this.state[overrideKey],
              onChange: ev => this.setField(overrideKey, ev.target.checked)
            }),
            window.React.createElement('div', null, def.label),
            window.React.createElement('input', {
              type: 'checkbox',
              checked: this.state[def.key],
              onChange: ev => this.setField(def.key, ev.target.checked)
            })
          )
        }

        return window.React.createElement(
          'div',
          { key: def.key, style: { display: 'grid', gridTemplateColumns: '1fr 18px', gap: '6px', alignItems: 'center', marginBottom: '4px' } },
          window.React.createElement('div', null, def.label),
          window.React.createElement('input', {
            type: 'checkbox',
            checked: this.state[def.key],
            onChange: ev => this.setField(def.key, ev.target.checked)
          })
        )
      }

      if (isOffset) {
        return window.React.createElement(
          'div',
          { key: def.key, style: { display: 'grid', gridTemplateColumns: '18px 1fr 1fr', gap: '6px', alignItems: 'center', marginBottom: '4px' } },
          window.React.createElement('input', {
            type: 'checkbox',
            checked: this.state[overrideKey],
            onChange: ev => this.setField(overrideKey, ev.target.checked)
          }),
          window.React.createElement('div', null, def.label),
          window.React.createElement('input', {
            type: 'number',
            step: (def.key === 'multiplierSmall') ? 0.01 : 1,
            value: this.state[def.key],
            onChange: ev => this.setField(def.key, ev.target.value),
            style: { width: '100%' }
          })
        )
      }

      return window.React.createElement(
        'div',
        { key: def.key, style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', alignItems: 'center', marginBottom: '4px' } },
        window.React.createElement('div', null, def.label),
        window.React.createElement('input', {
          type: 'number',
          step: (def.key === 'multiplierSmall') ? 0.01 : 1,
          value: this.state[def.key],
          onChange: ev => this.setField(def.key, ev.target.value),
          style: { width: '100%' }
        })
      )
    }

    render() {
      if (!this.state.visible) return null

      const title =
        this.state.mode === 'offset'
          ? 'Line Properties (offset)'
          : 'Line Properties'

      return window.React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            left: `${this.state.left}px`,
            top: `${this.state.top}px`,
            zIndex: 999999,
            background: '#ffffffcc',
            color: '#000',
            border: '1px solid #000',
            padding: '0',
            minWidth: '280px',
            fontSize: '12px',
            fontFamily: 'sans-serif',
            boxShadow: 'none',
          }
        },
        window.React.createElement(
          'div',
          {
            onMouseDown: ev => this.startDrag(ev),
            style: {
              cursor: 'move',
              padding: '6px',
              borderBottom: '1px solid #000',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
            }
          },
          window.React.createElement('div', null, `${title}`),
          window.React.createElement(
            'button',
            {
              type: 'button',
              onClick: () => this.close(true),
              style: {
                font: 'inherit',
                lineHeight: '1',
              }
            },
            '×'
          )
        ),
        window.React.createElement(
          'div',
          { style: { padding: '6px' } },
          FIELD_DEFS.map(def => this.renderField(def)),
          window.React.createElement(
            'div',
            { style: { display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' } },
            window.React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => this.close(false),
              },
              'Okay'
            ),
            window.React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => this.close(true),
              },
              'Cancel'
            )
          )
        )
      )
    }
  }

  function mountPopup() {
    if (window.__lineRiderQuickHotkeysPopupRoot) return window.__lineRiderQuickHotkeysPopupRoot

    const root = document.createElement('div')
    root.id = 'linerider-quick-hotkeys-popup-root'
    document.body.appendChild(root)
    window.__lineRiderQuickHotkeysPopupRoot = root

    const reactRoot = window.ReactDOM.createRoot
      ? window.ReactDOM.createRoot(root)
      : null

    const popup = window.React.createRef()
    window.__lineRiderQuickHotkeysPopupRef = popup

    const element = window.React.createElement(MetadataPopup, { ref: popup })

    if (reactRoot) {
      reactRoot.render(element)
    } else {
      window.ReactDOM.render(element, root)
    }

    return root
  }

  function openMetadataPopup(mode, lines) {
    mountPopup()
    const ref = window.__lineRiderQuickHotkeysPopupRef
    if (ref && ref.current) {
      ref.current.open(mode, lines)
    }
  }

  function onRightClick(ev) {
    if (!waitForReady()) return

    const store = window.store
    const state = store.getState()

    if (REQUIRE_SELECT_TOOL && (getActiveTool(state) !== SELECT_TOOL)) return;

    const pt = getWorldPointFromMouseEvent(ev)
    if (!pt) return

// from lines selected
      const selectToolState = getSelectToolState(window.store.getState())

      let selectedPoints = selectToolState?.selectedPoints || []

    const selectedLines = [...getLinesFromPoints(selectedPoints)]
      .map(id => state.simulator.committedEngine && state.simulator.committedEngine.getLine(id))
      .filter(Boolean)

// from right click on line
    const track = window.store.getState().simulator.engine;
    const clickedLines = track.selectLinesInRadius({x: pt.x, y: pt.y}, 2);

    if ((clickedLines.length > 0) && (selectedLines.length > 0)) {
      ev.preventDefault()
      ev.stopPropagation()

      if (selectedLines.length > 1) {
        openMetadataPopup('offset', selectedLines)
      } else {
        openMetadataPopup('selected', selectedLines)
      }
      return
    }

    if (clickedLines.length > 0) {
      ev.preventDefault()
      ev.stopPropagation()

      const closest = highestIdLine(clickedLines)
      if (closest) {
        openMetadataPopup('closest', [closest])
      }
    }
  }

  function install() {
    mountPopup()
    document.addEventListener('contextmenu', onRightClick, true)
  }

  function boot() {
    if (waitForReady()) {
      install()
      return
    }

    const timer = setInterval(() => {
      if (waitForReady()) {
        clearInterval(timer)
        install()
      }
    }, 250)
  }

  boot()
})()