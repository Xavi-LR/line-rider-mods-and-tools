// ==UserScript==

// @name         Layer Multi-select
// @author       Xavi
// @description  toggle editable/visible, edit color, move, delete, and group into new folder
// @version      0.2.0

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*
// @namespace    https://www.linerider.com/
// @icon         https://www.linerider.com/favicon.ico

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-layer-multiselect.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-layer-multiselect.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    // ---- actions ----
    const commitTrackChanges = () => ({ type: 'COMMIT_TRACK_CHANGES' });
    const revertTrackChanges = () => ({ type: 'REVERT_TRACK_CHANGES' });

    const setLayerEditable = (id, editable) => ({ type: 'SET_LAYER_EDITABLE', payload: { id, editable } });
    const setLayerVisible = (id, visible) => ({ type: 'SET_LAYER_VISIBLE', payload: { id, visible } });
    const renameLayer = (id, name) => ({ type: 'RENAME_LAYER', payload: { id, name } });
    const addFolder = (name) => ({ type: 'ADD_FOLDER', payload: { name } });
    const moveLayer = (id, index) => ({ type: 'MOVE_LAYER', payload: { id, index } });
    const moveFolder = (id, index) => ({ type: 'MOVE_FOLDER', payload: { id, index } });
    const removeLayer = (id) => ({ type: 'REMOVE_LAYER', payload: { id } });

    // ---- state ----
    const state = {
        selectedLayers: new Set(),
        prevActiveId: null,
        prevActiveIndex: null,
        prevActiveSnapshot: null,
        shiftDown: false,
        ctrlDown: false,
        _lastSeenActiveId: null,
        _lastLayersLen: null,
        _lastActiveProps: null,
    };

    // keyboard flags
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') state.shiftDown = true;
        if (e.key === 'Control' || e.key === 'Meta') state.ctrlDown = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') state.shiftDown = false;
        if (e.key === 'Control' || e.key === 'Meta') state.ctrlDown = false;
    });

    // ---- store helpers ----
    const getLayersFromState = (s) => {
        if (!s) return [];
        const path = s.simulator && s.simulator.engine && s.simulator.engine.engine && s.simulator.engine.engine.state;
        if (path && path.layers) {
            const layers = path.layers;
            return layers.toArray();
        }
        return [];
    };

    const getLayersFromStore = (store) => (store && typeof store.getState === 'function') ? getLayersFromState(store.getState()) : [];

    const getActiveInfo = () => {
        const store = window.store;
        if (!store) return { layers: [], activeId: null, activeIndex: -1, activeLayer: null };
        const layers = getLayersFromStore(store);
        const s = store.getState();
        const activeId = s && s.simulator && s.simulator.engine && s.simulator.engine.engine && s.simulator.engine.engine.state && s.simulator.engine.engine.state.activeLayerId || null;
        const activeIndex = layers.findIndex(l => l && l.id === activeId);
        return { layers, activeId, activeIndex, activeLayer: layers[activeIndex] };
    };

    // ---- UI overlay toolbar ----
    let toolbarEl = null;
    const ensureToolbar = () => {
        if (toolbarEl) return toolbarEl;
        const container = document.querySelector('.simulator') || document.querySelector('#simulator') || document.body;
        toolbarEl = document.createElement('div');
        toolbarEl.style.cssText = `
      position:absolute; top:16px; right:192px; z-index:10000; display:none;
      gap:6px; padding:4px; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.12);
      background: rgba(255,255,255,0.95); backdrop-filter: blur(4px);
    `;
        container.appendChild(toolbarEl);
        return toolbarEl;
    };
    const showToolbar = () => { ensureToolbar().style.display = 'flex'; };
    const hideToolbar = () => { if (toolbarEl) toolbarEl.style.display = 'none'; };

    const makeButton = (title, emoji, onClick) => {
        const btn = document.createElement('button');
        btn.title = title;
        btn.textContent = emoji;
        btn.style.cssText = 'padding:4px 8px;border:none;background:transparent;cursor:pointer;border-radius:6px;line-height:1;font-size:1em';
        btn.addEventListener('mouseenter', () => btn.style.background = '#f0f0f0');
        btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
        btn.addEventListener('mousedown', () => btn.style.background = '#e0e0e0');
        btn.addEventListener('mouseup', () => btn.style.background = '#f0f0f0');
        btn.addEventListener('click', onClick);
        return btn;
    };

    // inject CSS for selected hover state
    (() => {
        const css = `
      .ms-selected { background: rgba(100,150,255,0.08) !important; }
      .ms-selected:hover { background: rgba(100,150,255,0.18) !important; }
      .ms-checkbox { margin-right:6px; }
    `;
        const s = document.createElement('style');
        s.appendChild(document.createTextNode(css));
        document.head.appendChild(s);
    })();

    // ---- selection helpers ----
    const setRowSelectedClass = (id, selected) => {
        const map = window.__multiSelect && window.__multiSelect.rowMap;
        if (!map) return;
        const r = map.get(id);
        if (!r) return;
        if (selected) r.classList.add('ms-selected'); else r.classList.remove('ms-selected');
    };

    const addSelected = (id) => {
        if ((!state.selectedLayers.has(id))) {
            state.selectedLayers.add(id);
            // console.log('selectedLayers:', Array.from(state.selectedLayers));
            setRowSelectedClass(id, true);
            scheduleRender();
        }
    };

    const removeSelected = (id) => {
        if (state.selectedLayers.has(id)) {
            state.selectedLayers.delete(id);
            // console.log('selectedLayers:', Array.from(state.selectedLayers));
            setRowSelectedClass(id, false);
            scheduleRender();
        }
    };

    const clearSelected = () => {
        if (state.selectedLayers.size === 0) return;
        const map = window.__multiSelect && window.__multiSelect.rowMap;
        if (map) for (const [id, el] of map.entries()) { try { el.classList.remove('ms-selected'); } catch (e) {} }
        state.selectedLayers.clear();
        // console.log('selectedLayers:', Array.from(state.selectedLayers));
        if (window.__multiSelect && window.__multiSelect.rowMap) window.__multiSelect.rowMap.clear();
        scheduleRender();
    };

    // ---- rendering scheduling ----
    let renderRequested = false;
    const scheduleRender = () => {
        if (renderRequested) return;
        renderRequested = true;
        requestAnimationFrame(() => { renderRequested = false; renderControls(); });
    };

    // ---- layer panel helpers ----
    let panelEl = null;
    const findPanel = () => {
        if (panelEl) return panelEl;
        panelEl = document.querySelector('#content') || document.querySelector('div[role="navigation"]') || document.querySelector('div');
        return panelEl;
    };

    // ---- main render function (checkboxes & toolbar) ----
    const renderControls = () => {
        if (!findPanel()) return;
        const { layers, activeId, activeIndex } = getActiveInfo();
        if (!layers || layers.length === 0) { hideToolbar(); removeAllCheckboxes(); return; }
        if (state.selectedLayers.size === 0) { hideToolbar(); removeAllCheckboxes(); return; }

        // toolbar
        const t = ensureToolbar();
        t.innerHTML = '';
        const moveUp = makeButton('Move selection up (index +1)', '⬆️', () => shiftSelection(1));
        const moveDown = makeButton('Move selection down (index -1)', '⬇️', () => shiftSelection(-1));
        const folderBtn = makeButton('Create folder from selection', '📁', onFolderClick);
        const delBtn = makeButton('Delete selected layers', '➖', onDeleteClick);
        t.appendChild(moveUp); t.appendChild(moveDown); t.appendChild(folderBtn); t.appendChild(delBtn);
        showToolbar();

        // build candidate text nodes
        let candidatePs = [];
        const userRoot = document.querySelector('#content > div.jss162 > div:nth-child(4) > div > div.jss191.jss192 > div > div > div');
        if (userRoot) candidatePs = Array.from(userRoot.querySelectorAll('p'));
        if (candidatePs.length === 0) candidatePs = Array.from(document.querySelectorAll('p.jss13')).filter(n => !n.closest('.hover-control'));
        candidatePs = candidatePs.filter(p => (p.textContent || '').trim().length > 0);

        // detect folder existence to decide orientation
        const reversed = layers.some(l => l && l.type === 1);

        const mappingRows = candidatePs.slice().reverse()

        // map by index if possible
        const rowMap = new Map();
        if (mappingRows.length >= layers.length) {
            for (let i = 0; i < layers.length; i++) {
                const layer = layers[i];
                const pick = mappingRows[i];
                if (!layer || !pick) continue;
                rowMap.set(layer.id, pick.closest('div') || pick.parentElement || pick);
            }
        } else {
            for (let i = 0; i < layers.length; i++) {
                const layer = layers[i];
                if (!layer) continue;
                const display = (layer.name || '').slice(7);
                if (!display) continue;
                const found = candidatePs.find(p => (p.textContent || '').trim().includes(display));
                if (found) rowMap.set(layer.id, found.closest('div') || found);
            }
        }

        // authoritative mapping
        window.__multiSelect = window.__multiSelect || {};
        window.__multiSelect.rowMap = rowMap;

        // insert checkboxes: do not reuse DOM rows, skip folder items
        const usedRows = new Set();
        const candidatesForText = mappingRows.length ? mappingRows.slice() : Array.from(document.querySelectorAll('p')).filter(n => !n.closest('.hover-control'));
        const filteredCandidates = candidatesForText.filter(p => (p.textContent || '').trim().length > 0);
        const orientedCandidates = reversed ? filteredCandidates.slice().reverse() : filteredCandidates;

        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (!layer) continue;
            if (layer.type === 1) continue; // skip folders
            let row = rowMap.get(layer.id);
            const display = (layer.name || '').slice(7);
            let chosen = null;
            if (row && (row.textContent || '').trim().includes(display) && !usedRows.has(row)) chosen = row;
            else {
                for (const cand of orientedCandidates) {
                    const parent = cand.closest('div') || cand.parentElement || cand;
                    if (!parent || usedRows.has(parent)) continue;
                    const txt = (cand.textContent || '').trim();
                    if (txt && display && txt.includes(display)) { chosen = parent; break; }
                }
            }
            if (!chosen) continue;
            usedRows.add(chosen);
            rowMap.set(layer.id, chosen);
            if (layer.id === activeId) continue;
            chosen.dataset.layerId = layer.id;

            if (!chosen._hoverBound) {
                chosen._hoverBound = true;
                chosen.addEventListener('mouseenter', function () {
                    const id = this.dataset && this.dataset.layerId;
                    if (id && state.selectedLayers.has(id)) this.classList.add('ms-selected');
                });
                chosen.addEventListener('mouseleave', function () {
                    const id = this.dataset && this.dataset.layerId;
                    if (id && state.selectedLayers.has(id)) this.classList.add('ms-selected');
                });
            }

            if (chosen.querySelector && chosen.querySelector('.ms-checkbox')) continue;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'ms-checkbox';
            checkbox.checked = state.selectedLayers.has(layer.id);
            checkbox.addEventListener('pointerdown', (e) => e.stopPropagation());
            checkbox.addEventListener('mousedown', (e) => e.stopPropagation());
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation(); e.preventDefault();
                const willSelect = !state.selectedLayers.has(layer.id);
                if (willSelect) addSelected(layer.id); else removeSelected(layer.id);
                checkbox.checked = willSelect;
            });

            chosen.style.display = 'flex';
            chosen.style.alignItems = 'center';
            chosen.insertBefore(checkbox, chosen.firstChild);
        }

        // sync checkbox states
        for (const [layerId, row] of rowMap.entries()) {
            try {
                const cb = row && row.querySelector && row.querySelector('.ms-checkbox');
                if (cb) cb.checked = state.selectedLayers.has(layerId);
            } catch {}
        }

        // remove stale checkboxes (a little broken)
        const allCbs = Array.from(document.querySelectorAll('.ms-checkbox'));
        for (const cb of allCbs) {
            const row = cb.closest ? cb.closest('div') : null;
            const txt = row ? (row.textContent || '').trim() : '';
            const matched = layers.find(l => txt && txt.includes((l.name || '').slice(7)));
            if (!matched || matched.id === activeId) { cb.remove(); }
        }

        // apply selected class
        for (const [id, row] of rowMap.entries()) {
            try {
                if (state.selectedLayers.has(id) && id !== activeId) row.classList.add('ms-selected'); else row.classList.remove('ms-selected');
            } catch {}
        }
    };

    const removeAllCheckboxes = () => {
        const els = Array.from(document.querySelectorAll('.ms-checkbox'));
        for (const e of els) try { e.remove(); } catch {}
    };

    // ---- shift selection up/down ----
    const shiftSelection = (delta) => {
        const store = window.store; if (!store) return;
        const { layers, activeId } = getActiveInfo();
        if (!layers || layers.length === 0) return;
        const ids = Array.from(state.selectedLayers);
        if (!ids.includes(activeId)) ids.push(activeId);
        if (ids.length === 0) return;

        const latest = getLayersFromStore(store);
        const idToIdx = new Map(latest.map((l, i) => [l.id, i]));
        if (delta > 0) ids.sort((a,b) => (idToIdx.get(b)||0) - (idToIdx.get(a)||0));
        else ids.sort((a,b) => (idToIdx.get(a)||0) - (idToIdx.get(b)||0));

        for (const id of ids) {
            const cur = idToIdx.get(id);
            if (typeof cur === 'undefined') continue;
            const target = Math.max(0, Math.min(latest.length - 1, cur + delta));
            store.dispatch(moveLayer(id, target));
            const removedIndex = latest.findIndex(x => x.id === id);
            if (removedIndex >= 0) latest.splice(removedIndex, 1);
            latest.splice(Math.min(target, latest.length), 0, { id });
            idToIdx.clear(); latest.forEach((x,i) => idToIdx.set(x.id, i));
        }
        store.dispatch(commitTrackChanges());
        store.dispatch(revertTrackChanges());
        scheduleRender();
    };

    // ---- store change handling ----
    const handleStoreChange = () => {
        const store = window.store;
        if (!store) return;
        const { layers, activeId, activeIndex, activeLayer } = getActiveInfo();

        if (state.prevActiveId === null) {
            state.prevActiveId = activeId;
            state.prevActiveIndex = activeIndex;
            state.prevActiveSnapshot = activeLayer ? { ...activeLayer } : null;
            scheduleRender();
            return;
        }

        if (activeId !== state.prevActiveId) {
            if (!state.shiftDown && !state.ctrlDown) clearSelected();
            else if (state.shiftDown && typeof state.prevActiveIndex === 'number' && state.prevActiveIndex >= 0 && typeof activeIndex === 'number' && activeIndex >= 0) {
                const start = Math.min(state.prevActiveIndex, activeIndex), end = Math.max(state.prevActiveIndex, activeIndex);
                for (let i = start; i <= end; i++) {
                    if (i === activeIndex) continue;
                    const id = layers[i] && layers[i].id;
                    if (id && (layers[i].type !== 1)) addSelected(id);
                }
                removeSelected(activeId);
            } else if (state.ctrlDown && typeof state.prevActiveIndex === 'number' && state.prevActiveIndex >= 0) {
                const idp = layers[state.prevActiveIndex] && layers[state.prevActiveIndex].id;
                if (idp) addSelected(idp);
                removeSelected(activeId);
            }

            state.prevActiveId = activeId;
            state.prevActiveIndex = activeIndex;
            state.prevActiveSnapshot = activeLayer ? { ...activeLayer } : null;
            scheduleRender();
            return;
        }

        if (activeId === state.prevActiveId) {
            const latestLayers = getLayersFromStore(store);
            const curActive = latestLayers.find(l => l && l.id === activeId) || activeLayer || {};
            const prev = state.prevActiveSnapshot || {};

            if (typeof prev.editable !== 'undefined' && prev.editable !== curActive.editable) {
                for (const id of state.selectedLayers) store.dispatch(setLayerEditable(id, !!curActive.editable));
                store.dispatch(commitTrackChanges());
                store.dispatch(revertTrackChanges());
            }
            if (typeof prev.visible !== 'undefined' && prev.visible !== curActive.visible) {
                for (const id of state.selectedLayers) store.dispatch(setLayerVisible(id, !!curActive.visible));
                store.dispatch(commitTrackChanges());
                store.dispatch(revertTrackChanges());
            }
            const prevPrefix = (prev.name || '').slice(0,7), curPrefix = (curActive.name || '').slice(0,7);
            if (prevPrefix !== curPrefix) {
                for (const id of state.selectedLayers) {
                    const layer = latestLayers.find(l => l && l.id === id);
                    if (!layer) continue;
                    const remainder = (layer.name || '').slice(7);
                    store.dispatch(renameLayer(id, curPrefix + remainder));
                }
                store.dispatch(commitTrackChanges());
                store.dispatch(revertTrackChanges());
            }

            state.prevActiveSnapshot = curActive ? { ...curActive } : null;
            return;
        }
    };

    // ---- delete button handler ----
    const onDeleteClick = () => {
        const store = window.store;
        if (!store) return;
        const { activeId } = getActiveInfo();
        const ids = new Set(Array.from(state.selectedLayers));
        if (activeId) ids.add(activeId);
        if (ids.size === 0) return;
        for (const id of ids) store.dispatch(removeLayer(id));
        store.dispatch(commitTrackChanges());
        store.dispatch(revertTrackChanges());
        clearSelected();
        scheduleRender();
    };

    // ---- folder button handler ----
    // add folder, move folder to activeIndex, then immediately move selected/active into folder in ascending pre-move index order
    const onFolderClick = () => {
        const store = window.store;
        if (!store) return;
        const { layers, activeId, activeIndex, activeLayer } = getActiveInfo();
        if (!activeLayer) return;
        const folderName = (activeLayer.name || '').slice(7) || 'Folder';

        // snapshot pre-move indices
        const before = getLayersFromStore(store);
        const preIndex = new Map(before.map((l,i) => [l.id, i]));

        // add folder
        store.dispatch(addFolder(folderName));

        // locate folder and perform moves
        const nowLayers = getLayersFromStore(store);
        let folder = nowLayers.find(l => (l && (l.name || '').slice(7) === folderName) && (l.type === 1 || (l.kind && /folder/i.test(l.kind || ''))));
        const folderId = (folder && folder.id) || (nowLayers.length ? nowLayers[nowLayers.length - 1].id : undefined);
        if (!folderId) { console.warn('Could not find created folder id'); return; }

        // suppress store reactions to our moves
        window.__multiSelect = window.__multiSelect || {};
        window.__multiSelect.suppress = true;

        // move folder to activeIndex
        store.dispatch(moveFolder(folderId, Math.max(0, activeIndex)));

        // gather ids to move
        const ids = Array.from(state.selectedLayers);
        if (!ids.includes(activeId)) ids.push(activeId);

        // sort ascending by pre-move index
        ids.sort((a,b) => (preIndex.get(a)||0) - (preIndex.get(b)||0));

        // move each: compute current folder index before each move
        for (const id of ids) {
            const now = getLayersFromStore(store);
            const currentFolderIdx = now.findIndex(l => l && l.id === folderId);
            const targetBase = currentFolderIdx >= 0 ? currentFolderIdx : Math.max(0, activeIndex);
            const pre = preIndex.get(id), preActive = preIndex.get(activeId);
            const target = (typeof pre !== 'undefined' && typeof preActive !== 'undefined' && pre < preActive) ? Math.max(0, targetBase - 1) : targetBase;
            store.dispatch(moveLayer(id, target));
        }
        store.dispatch(commitTrackChanges());
        store.dispatch(revertTrackChanges());

        // restore suppression immediately
        window.__multiSelect.suppress = false;
        clearSelected();
        scheduleRender();
    };

    // ---- attach store subscription ----
    const attachListener = () => {
        const store = window.store;
        if (!store || typeof store.subscribe !== 'function') return false;
        store.subscribe(() => {
            const s = store.getState();
            const activeId = s && s.simulator && s.simulator.engine && s.simulator.engine.engine && s.simulator.engine.engine.state && s.simulator.engine.engine.state.activeLayerId || null;
            const layers = getLayersFromState(s) || [];
            const activeLayer = layers.find(l => l && l.id === activeId);
            const activeProps = activeLayer ? [activeId, !!activeLayer.editable, !!activeLayer.visible, (activeLayer.name||'').slice(0,7)].join('|') : (activeId + '|null');
            if (state._lastSeenActiveId === activeId && state._lastLayersLen === layers.length && state._lastActiveProps === activeProps) return;
            state._lastSeenActiveId = activeId;
            state._lastLayersLen = layers.length;
            state._lastActiveProps = activeProps;
            handleStoreChange();
        });
        handleStoreChange();
        return true;
    };

    if (!attachListener()) {
        const poll = setInterval(() => { if (attachListener()) clearInterval(poll); }, 600);
    }

    // DOM observer to re-render when panel changes
    const observer = new MutationObserver(() => scheduleRender());
    const startObserver = () => {
        if (!findPanel()) return;
        if (observer) observer.disconnect();
        observer.observe(panelEl || document.body, { childList: true, subtree: true, characterData: true });
        scheduleRender();
    };
    const panelPoll = setInterval(() => { if (findPanel()) { startObserver(); clearInterval(panelPoll); } }, 700);

    // expose debug helpers
    window.__multiSelect = window.__multiSelect || {};
    window.__multiSelect.state = state;
    window.__multiSelect.renderControls = renderControls;
    window.__multiSelect.getActiveInfo = getActiveInfo;
})();