// ==UserScript==
// @name         Line Rider Custom Toolbar
// @namespace    https://www.linerider.com/
// @author       Xavi
// @version      1.0.0
// @description  customize the line rider toolbar
// @icon         https://www.linerider.com/favicon.ico
// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

/*                                                                         ✂️

                                                                                                               ✏️
                            🪣                                                                                                                                        🖐️
                                                            𝘼𝙙𝙙 𝙤𝙧 𝙧𝙚𝙢𝙤𝙫𝙚 𝙖𝙣𝙮 𝙘𝙪𝙨𝙩𝙤𝙢 𝙤𝙧 𝙗𝙪𝙞𝙡𝙩-𝙞𝙣 𝙩𝙤𝙤𝙡𝙨 𝙪𝙨𝙞𝙣𝙜 "const TOOLBAR" 𝙗𝙚𝙡𝙤𝙬!          🖼️
                                  💾                                                                                                                    📷
                                                     🖋️                                  🔍

================🔨==============📷==============✂️==============✏️==============🖐️==============🖼️==============🪣==============🖋️==============🔍==============💾==============⚙️==============*/


  const TOOLBAR = [
    { tool: 'PENCIL_TOOL', icon: null},
    { tool: 'LINE_TOOL', icon: null, toggle:
      {
          tool: 'Bezier Tool',
       icon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Ctitle%3Evector-bezier%3C%2Ftitle%3E%3Cpath%20d%3D%22M7.5%2C4A1.5%2C1.5%200%200%2C0%206%2C5.5A1.5%2C1.5%200%200%2C0%207.5%2C7C8.13%2C7%208.7%2C6.6%208.91%2C6H13C13.67%2C5.33%2014.33%2C5%2015%2C5H8.91C8.7%2C4.4%208.13%2C4%207.5%2C4M19%2C5C8%2C5%2014%2C17%205%2C17V19C16%2C19%2010%2C7%2019%2C7V5M16.5%2C17C15.87%2C17%2015.3%2C17.4%2015.09%2C18H11C10.33%2C18.67%209.67%2C19%209%2C19H15.09C15.3%2C19.6%2015.87%2C20%2016.5%2C20A1.5%2C1.5%200%200%2C0%2018%2C18.5A1.5%2C1.5%200%200%2C0%2016.5%2C17Z%22%20%2F%3E%3C%2Fsvg%3E'
      }, hotkey: null
    },
    { tool: 'ERASER_TOOL', icon: null},
    { tool: 'SELECT_TOOL', icon: null},
    { tool: 'PAN_TOOL', icon: null},
    { tool: 'ZOOM_TOOL', icon: null},
  ];

/*==============🔨==============📷==============✂️==============✏️==============🖐️==============🖼️==============🪣==============🖋️==============🔍==============💾==============⚙️================

                                                                          ⚙️  𝗺𝗼𝗿𝗲 𝗶𝗻𝗳𝗼  📝

▪️ useful links:

- https://pictogrammers.com/library/mdi/
- https://www.svgviewer.dev/svg-to-data-uri

 (find an icon on pictogrammers, press the </> "Copy SVG" icon, and paste it into svgviewer.dev to get the data URI version)


▪️ if you try to switch to a tool with an id that isn't a real tool id, line rider will crash (because that's just how line rider works)


▪️ default toolbar:

  const TOOLBAR = [
    { tool: 'PENCIL_TOOL', icon: null},
    { tool: 'LINE_TOOL', icon: null},
    { tool: 'ERASER_TOOL', icon: null},
    { tool: 'SELECT_TOOL', icon: null},
    { tool: 'PAN_TOOL', icon: null},
    { tool: 'ZOOM_TOOL', icon: null},
  ];


▪️ example custom toolbar:

  const TOOLBAR = [
    {
        tool: 'Smooth Pencil',
        icon: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M20.71%2C7.04C21.1%2C6.65%2021.1%2C6%2020.71%2C5.63L18.37%2C3.29C18%2C2.9%2017.35%2C2.9%2016.96%2C3.29L15.12%2C5.12L18.87%2C8.87M3%2C17.25V21H6.75L17.81%2C9.93L14.06%2C6.18L3%2C17.25Z%22/%3E%3C/svg%3E',
        hotkey: 'Q' // you have to unbind Q for the normal pencil tool
    },
    { tool: 'LINE_TOOL', icon: null, toggle:
      {
          tool: 'Bezier Tool',
       icon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Ctitle%3Evector-bezier%3C%2Ftitle%3E%3Cpath%20d%3D%22M7.5%2C4A1.5%2C1.5%200%200%2C0%206%2C5.5A1.5%2C1.5%200%200%2C0%207.5%2C7C8.13%2C7%208.7%2C6.6%208.91%2C6H13C13.67%2C5.33%2014.33%2C5%2015%2C5H8.91C8.7%2C4.4%208.13%2C4%207.5%2C4M19%2C5C8%2C5%2014%2C17%205%2C17V19C16%2C19%2010%2C7%2019%2C7V5M16.5%2C17C15.87%2C17%2015.3%2C17.4%2015.09%2C18H11C10.33%2C18.67%209.67%2C19%209%2C19H15.09C15.3%2C19.6%2015.87%2C20%2016.5%2C20A1.5%2C1.5%200%200%2C0%2018%2C18.5A1.5%2C1.5%200%200%2C0%2016.5%2C17Z%22%20%2F%3E%3C%2Fsvg%3E'
      }, hotkey: 'D'
    },
    { tool: 'ERASER_TOOL', icon: null},
    { tool: 'SELECT_TOOL', icon: null},
    { tool: 'PAN_TOOL', icon: null},
    {
        tool: '🪣 Fill Tool',
        icon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Ctitle%3Eformat-color-fill%3C%2Ftitle%3E%3Cpath%20d%3D%22M19%2C11.5C19%2C11.5%2017%2C13.67%2017%2C15A2%2C2%200%200%2C0%2019%2C17A2%2C2%200%200%2C0%2021%2C15C21%2C13.67%2019%2C11.5%2019%2C11.5M5.21%2C10L10%2C5.21L14.79%2C10M16.56%2C8.94L7.62%2C0L6.21%2C1.41L8.59%2C3.79L3.44%2C8.94C2.85%2C9.5%202.85%2C10.47%203.44%2C11.06L8.94%2C16.56C9.23%2C16.85%209.62%2C17%2010%2C17C10.38%2C17%2010.77%2C16.85%2011.06%2C16.56L16.56%2C11.06C17.15%2C10.47%2017.15%2C9.5%2016.56%2C8.94Z%22%20%2F%3E%3C%2Fsvg%3E'
    },
  ];


▪️ custom tool ids:

- 'Smooth Pencil'
- 'Bezier Tool'
- '🪣 Fill Tool'


▪️ example tool:

    {
    tool: 'LINE_TOOL',
    icon: null,
    toggle: {
            tool:
            'Bezier Tool',
            icon: 'https://example.com/icon.svg',
            },
    hotkey: 'J'
    },

==============🔨==============📷==============✂️==============✏️==============🖐️==============🖼️==============🪣==============🖋️==============🔍==============💾==============⚙️================*/

  const TOOL_TRIGGER_MAP = {
    'PENCIL_TOOL': 'pencilTool',
    'LINE_TOOL': 'lineTool',
    'ERASER_TOOL': 'eraserTool',
    'SELECT_TOOL': 'selectTool',
    'PAN_TOOL': 'panTool',
    'ZOOM_TOOL': 'zoomTool',
  };

  const TRACK_SELECTOR = '#content > div.jss70 > div:nth-child(5)';
  const CUSTOM_CONTAINER_ID = 'tm-custom-toolbar-container';
  const CUSTOM_WRAPPER_CLASS = 'tm-custom-wrapper';
  const CUSTOM_BUTTON_CLASS = 'tm-custom-btn';
  const CUSTOM_SVG_CLASS = 'tm-custom-svg';
  const SELECTED_CLASS = 'tm-custom-selected';
  const DATA_TOOL_ATTR = 'data-tm-tool';
  const DATA_PLACEHOLDER_FOR = 'data-tm-placeholder-for';
  const DATA_ORIG_HIDDEN = 'data-tm-orig-hidden';
  const DATA_ICON_HIDDEN = 'data-tm-icon-hidden';

  let trackedToolbarRootEl = null;
  const setTool = (tool) => ({ type: 'SET_TOOL', payload: tool });

  /* --- styles --- */
  function injectStyles() {
    if (document.getElementById('tm-custom-toolbar-styles')) return;
    const s = document.createElement('style');
    s.id = 'tm-custom-toolbar-styles';
    s.textContent = `
      #${CUSTOM_CONTAINER_ID}{display:inline-flex;align-items:center;gap:6px;z-index:9999;background:rgba(255,255,255,0.10);border-radius:8px;padding:6px;opacity:1;visibility:visible;pointer-events:auto;transition:opacity 225ms cubic-bezier(0.4,0,0.2,1);}
      .${CUSTOM_WRAPPER_CLASS}{display:inline-flex;align-items:center;justify-content:center;}
      .${CUSTOM_BUTTON_CLASS}{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:6px;border:none;background:transparent;cursor:pointer;color:rgba(0,0,0,0.87);transition:color .12s ease,background-color .12s ease;border-radius:999px;position:relative;overflow:visible;}
      .${CUSTOM_BUTTON_CLASS}:focus{outline:none;box-shadow:none;}
      .${CUSTOM_SVG_CLASS}{width:24px;height:24px;display:inline-block;vertical-align:middle;}
      .${CUSTOM_BUTTON_CLASS}.${SELECTED_CLASS}{color:#3995fd!important;background:rgba(57,149,253,0.12);}
      .${CUSTOM_BUTTON_CLASS} .${CUSTOM_SVG_CLASS} svg{width:100%;height:100%;fill:currentColor;display:block;}
      .${CUSTOM_BUTTON_CLASS} .${CUSTOM_SVG_CLASS} img{width:100%;height:100%;object-fit:contain;display:block;}
      .tm-ripple{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(0);width:20px;height:20px;border-radius:50%;background:rgba(57,149,253,0.5);pointer-events:none;opacity:1;animation:tm-ripple-anim 420ms ease-out forwards;}
      @keyframes tm-ripple-anim{from{transform:translate(-50%,-50%) scale(0);opacity:0.6;}to{transform:translate(-50%,-50%) scale(2.4);opacity:0;}}
    `;
    document.head.appendChild(s);
  }

  /* --- helpers --- */
  function waitFor(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
      if (timeout > 0) setTimeout(() => { obs.disconnect(); reject(new Error('timeout waiting for ' + selector)); }, timeout);
    });
  }

  async function fetchSVGInline(url) {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('failed to fetch ' + res.status);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) throw new Error('no svg');
    svg.setAttribute('preserveAspectRatio', svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.setAttribute('focusable', 'false');
    try { svg.querySelectorAll('[fill]').forEach(n => n.setAttribute('fill', 'currentColor')); } catch (e) {}
    return svg;
  }

  function addRippleToButton(el) {
    if (!el) return;
    const cs = getComputedStyle(el);
    if (!['relative','absolute','fixed','sticky'].includes(cs.position)) el.style.position = 'relative';
    const r = document.createElement('span');
    r.className = 'tm-ripple';
    el.appendChild(r);
    r.addEventListener('animationend', () => r.remove(), { once: true });
  }

  function makeButtonWithSVG(toolName, svgNode) {
    const wrapper = document.createElement('div');
    wrapper.className = CUSTOM_WRAPPER_CLASS;
    wrapper.setAttribute(DATA_TOOL_ATTR, toolName);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${CUSTOM_BUTTON_CLASS} jss52 jss92`;
    btn.setAttribute(DATA_TOOL_ATTR, toolName);
    const span = document.createElement('span');
    span.className = CUSTOM_SVG_CLASS;
    if (svgNode) {
      const cloneSvg = svgNode.cloneNode(true);
      try { cloneSvg.removeAttribute('width'); cloneSvg.removeAttribute('height'); } catch (e) {}
      span.appendChild(cloneSvg);
    } else {
      const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      placeholder.setAttribute('viewBox', '0 0 24 24');
      placeholder.innerHTML = '<circle cx="12" cy="12" r="8" fill="currentColor"></circle>';
      span.appendChild(placeholder);
    }
    btn.appendChild(span);
    wrapper.appendChild(btn);
    return { wrapper, buttonEl: btn, svgSpan: span };
  }

  function createPlaceholderForTopChild(topChild, toolName) {
    const placeholder = document.createElement('div');
    try { placeholder.className = topChild.className || ''; } catch (e) { placeholder.className = ''; }
    placeholder.setAttribute(DATA_PLACEHOLDER_FOR, toolName);
    placeholder.style.pointerEvents = 'none';
    placeholder.style.visibility = 'hidden';
    placeholder.style.position = 'absolute';
    placeholder.style.zIndex = '-9999';
    try {
      const rect = topChild.getBoundingClientRect();
      const left = rect.left + window.scrollX;
      const top = rect.top + window.scrollY;
      placeholder.style.left = `${Math.round(left)}px`;
      placeholder.style.top = `${Math.round(top)}px`;
      placeholder.style.width = `${Math.round(rect.width || 40)}px`;
      placeholder.style.height = `${Math.round(rect.height || 40)}px`;
    } catch (e) {}
    try { document.body.appendChild(placeholder); } catch (e) {}
    return placeholder;
  }

  function hideOriginalTopChild(topChild) {
    if (!topChild || topChild.hasAttribute(DATA_ORIG_HIDDEN)) return;
    const prev = topChild.getAttribute('style') || '';
    topChild.setAttribute('data-tm-orig-style', prev);
    topChild.style.visibility = 'hidden';
    topChild.style.pointerEvents = 'none';
    topChild.setAttribute(DATA_ORIG_HIDDEN, '1');
  }

  function hideOriginalIconInButton(originalButton) {
    if (!originalButton) return;
    const svg = originalButton.querySelector('svg');
    if (!svg) return;
    if (svg.hasAttribute(DATA_ICON_HIDDEN)) return;
    svg.setAttribute('data-tm-prev-vis', svg.style.visibility || '');
    svg.style.visibility = 'hidden';
    svg.setAttribute(DATA_ICON_HIDDEN, '1');
  }

  function revealSwatchesAndBrush(toolbarRoot) {
    try {
      const root = toolbarRoot || resolveToolbarRoot();
      if (!root) return;
      const children = Array.from(root.children || []);
      const nonButtonChildren = children.filter(c => !(c.tagName && c.tagName.toLowerCase() === 'button'));
      const lastTwo = nonButtonChildren.slice(-2);
      lastTwo.forEach(el => {
        try {
          el.style.visibility = 'visible';
          el.style.pointerEvents = 'auto';
          if (el.style.display === 'none') el.style.display = '';
          Array.from(el.querySelectorAll('*')).forEach(ch => {
            try { ch.style.visibility = 'visible'; } catch (e) {}
            try { if (ch.style.display === 'none') ch.style.display = ''; } catch (e) {}
            try { ch.style.pointerEvents = 'auto'; } catch (e) {}
          });
        } catch (e) {}
      });
    } catch (e) {}
  }

  const SLOT_STATE = new Map();

  function ensureCustomContainer(toolbarRoot, representativeChild) {
    let container = document.getElementById(CUSTOM_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CUSTOM_CONTAINER_ID;
      try { document.body.appendChild(container); } catch (e) { try { toolbarRoot.appendChild(container); } catch (e2) {} }
      container.style.opacity = '1';
      container.style.visibility = 'visible';
      container.style.pointerEvents = 'auto';
      container.style.transition = 'opacity 225ms cubic-bezier(0.4,0,0.2,1)';
      container.style.position = 'fixed';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.top = '8px';
    }
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.gap = '6px';
    container.style.padding = '6px';
    try {
      if (toolbarRoot) {
        const cs = getComputedStyle(toolbarRoot);
        container.style.background = cs.backgroundColor || 'rgba(255,255,255,0.93)';
        container.style.borderRadius = cs.borderRadius || '2px';
        container.style.fontFamily = cs.fontFamily || 'sans-serif';
        if (representativeChild) {
          const repInline = representativeChild.getAttribute('style') || '';
          const mTop = /top\s*:\s*([^;]+);?/.exec(repInline);
          if (mTop) container.style.top = mTop[1].trim();
          else {
            const rect = representativeChild.getBoundingClientRect();
            container.style.top = (Math.round(rect.top)) + 'px';
            container.style.position = 'fixed';
          }
        } else container.style.top = '8px';
      } else {
        container.style.background = 'rgba(255,255,255,0.93)';
        container.style.borderRadius = '2px';
        container.style.fontFamily = 'sans-serif';
      }
    } catch (e) {
      container.style.background = 'rgba(255,255,255,0.93)';
      container.style.borderRadius = '2px';
      container.style.fontFamily = 'sans-serif';
    }
    const count = Math.max(1, TOOLBAR.length);
    const approxPer = 46;
    container.style.minWidth = (count * approxPer) + 'px';
    return container;
  }

  function animateHideCustom() {
    const c = document.getElementById(CUSTOM_CONTAINER_ID);
    if (!c) return;
    if (c.dataset.tmHidden === '1') return;
    c.dataset.tmHidden = '1';
    try { c.style.transition = 'opacity 225ms cubic-bezier(0.4,0,0.2,1)'; } catch (e) {}
    requestAnimationFrame(() => { c.style.opacity = '0'; c.style.pointerEvents = 'none'; });
    const onEnd = () => { try { c.style.visibility = 'hidden'; } catch (e) {}; c.removeEventListener('transitionend', onEnd); };
    c.addEventListener('transitionend', onEnd);
  }

  function animateShowCustom() {
    const c = document.getElementById(CUSTOM_CONTAINER_ID);
    if (!c) return;
    if (!c.dataset.tmHidden || c.dataset.tmHidden === '0') { c.style.visibility = 'visible'; c.style.pointerEvents = 'auto'; c.style.opacity = '1'; return; }
    c.dataset.tmHidden = '0';
    try { c.style.visibility = 'visible'; c.style.pointerEvents = 'auto'; c.style.transition = 'opacity 225ms cubic-bezier(0.4,0,0.2,1)'; requestAnimationFrame(() => { c.style.opacity = '1'; }); } catch (e) {}
  }

  function setSlotToTool(slotIndex, toolName, doDispatch = true) {
    const slot = SLOT_STATE.get(slotIndex);
    if (!slot) return;
    slot.current = toolName;

    try {
      if (slot.wrapper) slot.wrapper.setAttribute(DATA_TOOL_ATTR, toolName);
      if (slot.buttonEl) slot.buttonEl.setAttribute(DATA_TOOL_ATTR, toolName);
      if (slot.buttonEl && slot.svgSpan) {
        slot.svgSpan.innerHTML = '';
        let nodeToUse = null;
        if (slot.primary === toolName && slot.svgPrimary) nodeToUse = slot.svgPrimary.cloneNode(true);
        else if (slot.toggle && slot.toggle.tool === toolName && slot.svgToggle) nodeToUse = slot.svgToggle.cloneNode(true);

        if (nodeToUse) {
          try { nodeToUse.removeAttribute && nodeToUse.removeAttribute('width'); } catch (e) {}
          try { nodeToUse.removeAttribute && nodeToUse.removeAttribute('height'); } catch (e) {}
          slot.svgSpan.appendChild(nodeToUse);
        } else {
          const iconUrl = (slot.primary === toolName && slot.primaryIcon) ? slot.primaryIcon : (slot.toggle && slot.toggle.tool === toolName ? slot.toggle.icon : null);
          if (iconUrl) {
            const img = document.createElement('img');
            img.src = iconUrl;
            img.alt = toolName;
            img.style.width = '100%';
            img.style.height = '100%';
            slot.svgSpan.appendChild(img);
          } else {
            const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            placeholder.setAttribute('viewBox', '0 0 24 24');
            placeholder.innerHTML = '<circle cx="12" cy="12" r="8" fill="currentColor"></circle>';
            slot.svgSpan.appendChild(placeholder);
          }
        }
      }
    } catch (e) {}

    if (doDispatch) {
      try {
        if (window.store && typeof window.store.dispatch === 'function') {
          window.store.dispatch(setTool(toolName));
        } else {
          const root = resolveToolbarRoot();
          const trigger = TOOL_TRIGGER_MAP[toolName];
          if (trigger && root) {
            const fresh = root.querySelector(`button[trigger="triggers.${trigger}"]`);
            if (fresh) {
              try { fresh.click(); } catch (err) {}
            }
          }
        }
      } catch (e) {}
    }

    try {
      const cont = document.getElementById(CUSTOM_CONTAINER_ID);
      syncSelectedVisuals(cont, resolveToolbarRoot());
    } catch (e) {}
  }

  async function buildCustomToolbar(toolbarRoot) {
    if (!toolbarRoot) return;
    SLOT_STATE.clear();
    trackedToolbarRootEl = toolbarRoot;

    let representative = null;
    for (const k of Object.keys(TOOL_TRIGGER_MAP)) {
      const b = findBuiltInButtonByTool(k, toolbarRoot);
      if (b) { representative = b.closest('div') || b.parentElement || b; break; }
    }

    const container = ensureCustomContainer(toolbarRoot, representative);

    try { toolbarRoot.style.background = 'transparent'; toolbarRoot.style.backgroundColor = 'transparent'; toolbarRoot.style.boxShadow = 'none'; toolbarRoot.style.border = 'none'; } catch (e) {}

    const existingPlaceholders = new Map();
    try { document.querySelectorAll(`[${DATA_PLACEHOLDER_FOR}]`).forEach(p => existingPlaceholders.set(p.getAttribute(DATA_PLACEHOLDER_FOR), p)); } catch (e) {}

    container.innerHTML = '';

    const builtIns = new Map();
    for (const name of Object.keys(TOOL_TRIGGER_MAP)) {
      const btn = findBuiltInButtonByTool(name, toolbarRoot);
      if (btn) {
        const topChild = (btn.closest('div') || btn.parentElement || btn);
        builtIns.set(name, { buttonEl: btn, topChild });
      }
    }

    for (let idx = 0; idx < TOOLBAR.length; idx++) {
      const entry = TOOLBAR[idx];
      const toolName = entry.tool;
      const iconUrl = entry.icon || null;
      const hotkey = entry.hotkey || null;
      const toggleInfo = entry.toggle ? { tool: entry.toggle.tool, icon: entry.toggle.icon || null } : null;
      const builtIn = builtIns.get(toolName);

      const slot = {
        index: idx,
        primary: toolName,
        primaryIcon: iconUrl,
        toggle: toggleInfo ? { tool: toggleInfo.tool, icon: toggleInfo.icon } : null,
        svgPrimary: null,
        svgToggle: null,
        current: toolName,
        wrapper: null,
        buttonEl: null,
        svgSpan: null
      };

      if (builtIn) {
        const origBtn = builtIn.buttonEl;
        const topChild = builtIn.topChild;
        if (!existingPlaceholders.has(toolName)) {
          try { createPlaceholderForTopChild(topChild, toolName); } catch (e) {}
        }
        hideOriginalTopChild(topChild);
        const origSvg = origBtn.querySelector('svg');
        if (origSvg) slot.svgPrimary = origSvg.cloneNode(true);
      }

      if (slot.toggle) {
        try {
          const tb = builtIns.get(slot.toggle.tool);
          if (tb && tb.buttonEl) {
            const tsvg = tb.buttonEl.querySelector('svg');
            if (tsvg) slot.svgToggle = tsvg.cloneNode(true);
          }
        } catch (e) {}
      }

      if (!slot.svgPrimary && slot.primaryIcon) {
        try { slot.svgPrimary = await (async () => { try { return await fetchSVGInline(slot.primaryIcon); } catch (e) { return null; } })(); } catch (e) {}
      }

      if (slot.toggle && !slot.svgToggle && slot.toggle.icon) {
        try { slot.svgToggle = await (async () => { try { return await fetchSVGInline(slot.toggle.icon); } catch (e) { return null; } })(); } catch (e) {}
      }

      try {
        const sel = (window.store && window.store.getState) ? window.store.getState().selectedTool : null;
        if (sel && slot.toggle && sel === slot.toggle.tool) slot.current = slot.toggle.tool;
        else slot.current = slot.primary;
      } catch (e) { slot.current = slot.primary; }

      const { wrapper, buttonEl, svgSpan } = makeButtonWithSVG(slot.current, slot.current === slot.primary ? slot.svgPrimary : slot.svgToggle);
      slot.wrapper = wrapper; slot.buttonEl = buttonEl; slot.svgSpan = svgSpan;

      wrapper.setAttribute('data-slot-index', String(idx));
      wrapper.setAttribute(DATA_TOOL_ATTR, slot.current);
      buttonEl.setAttribute(DATA_TOOL_ATTR, slot.current);
      if (hotkey) wrapper.setAttribute('data-hotkey', hotkey.toLowerCase());

      SLOT_STATE.set(idx, slot);

      (function (slotIndexLocal) {
        buttonEl.addEventListener('click', () => {
          const s = SLOT_STATE.get(slotIndexLocal);
          if (!s) return;
          addRippleToButton(buttonEl);
          const sel = (window.store && window.store.getState) ? window.store.getState().selectedTool : null;
          const displayed = s.current;

          if (s.toggle && sel && sel === displayed) {
            const other = (displayed === s.primary) ? s.toggle.tool : s.primary;
            setSlotToTool(slotIndexLocal, other, true);
            try { revealSwatchesAndBrush(resolveToolbarRoot()); } catch (e) {}
            return;
          }

          setSlotToTool(slotIndexLocal, displayed, true);
          try { revealSwatchesAndBrush(resolveToolbarRoot()); } catch (e) {}
        });
      })(idx);

      container.appendChild(wrapper);
    }

    syncSelectedVisuals(container, toolbarRoot);
    try { revealSwatchesAndBrush(toolbarRoot); } catch (e) {}
  }

  function resolveToolbarRoot() {
    try {
      const init = document.querySelector(TRACK_SELECTOR);
      if (init) return init;
    } catch (e) {}
    try {
      const base = document.querySelector('#content > div.jss70') || document.querySelector('#content > div');
      if (!base) return null;
      for (const child of Array.from(base.children || [])) {
        try {
          if (child.querySelector && child.querySelector('button[trigger^="triggers."]')) return child;
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }

  function findBuiltInButtonByTool(toolName, root) {
    const triggerName = TOOL_TRIGGER_MAP[toolName];
    if (!triggerName || !root) return null;
    try { return root.querySelector(`button[trigger="triggers.${triggerName}"]`); } catch (e) { return null; }
  }

  function syncSelectedVisuals(customContainer, toolbarRoot) {
    const sel = (window.store && window.store.getState) ? window.store.getState().selectedTool : null;
    if (!customContainer) customContainer = document.getElementById(CUSTOM_CONTAINER_ID);
    if (!customContainer) return;

    customContainer.querySelectorAll(`.${CUSTOM_BUTTON_CLASS}`).forEach(btn => {
      const t = btn.getAttribute(DATA_TOOL_ATTR);
      if (t && sel && t === sel) btn.classList.add(SELECTED_CLASS); else btn.classList.remove(SELECTED_CLASS);
    });

    customContainer.querySelectorAll(`[${DATA_TOOL_ATTR}]`).forEach(w => {
      const t = w.getAttribute(DATA_TOOL_ATTR);
      const inner = w.querySelector('button') || w;
      if (t && sel && t === sel) inner.classList.add(SELECTED_CLASS); else inner.classList.remove(SELECTED_CLASS);
    });

    try {
      const root = toolbarRoot || resolveToolbarRoot();
      if (root) {
        for (const entry of TOOLBAR) {
          const origBtn = findBuiltInButtonByTool(entry.tool, root);
          if (origBtn) {
            hideOriginalIconInButton(origBtn);
            const topChild = origBtn.closest('div') || origBtn.parentElement || origBtn;
            if (topChild && !topChild.hasAttribute(DATA_ORIG_HIDDEN)) hideOriginalTopChild(topChild);
          }
        }
      }
    } catch (e) {}

    try {
      const currentSel = sel;
      if (currentSel) {
        for (const [idx, slot] of SLOT_STATE.entries()) {
          if (!slot) continue;
          if (currentSel === slot.primary || (slot.toggle && currentSel === slot.toggle.tool)) {
            if (slot.current !== currentSel) setSlotToTool(idx, currentSel, false);
          }
        }
      }
    } catch (e) {}
  }

  function observeStore() {
    if (!window.store || typeof window.store.subscribe !== 'function') return;
    if (observeStore._subscribed) return;
    try {
      window.store.subscribe(() => {
        setTimeout(() => {
          const cont = document.getElementById(CUSTOM_CONTAINER_ID);
          const root = resolveToolbarRoot();
          syncSelectedVisuals(cont, root);
          try { revealSwatchesAndBrush(root); } catch (e) {}
        }, 8);
      });
      observeStore._subscribed = true;
    } catch (e) { console.warn('Could not subscribe to store', e); }
  }

  function setupHotkeys() {
    const hotmap = new Map();
    for (const item of TOOLBAR) if (item.hotkey && typeof item.hotkey === 'string' && item.hotkey.length) hotmap.set(item.hotkey.toLowerCase(), item.tool);

    function onKeyDown(e) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      const key = (e.key || '').toLowerCase();
      if (!key) return;
      const cont = document.getElementById(CUSTOM_CONTAINER_ID);
      if (cont) {
        const node = cont.querySelector(`[data-hotkey="${key}"]`);
        if (node) {
          e.preventDefault();
          const inner = node.querySelector('button') || node;
          try { inner.click(); } catch (err) {}
          return;
        }
      }
      const tool = hotmap.get(key);
      if (!tool) return;
      e.preventDefault();
      if (cont) {
        const node = cont.querySelector(`[${DATA_TOOL_ATTR}="${tool}"]`);
        if (node) {
          const inner = node.querySelector('button') || node;
          try { inner.click(); } catch (err) {}
          return;
        }
      }
      if (window.store && typeof window.store.dispatch === 'function') window.store.dispatch(setTool(tool));
    }

    if (!setupHotkeys._installed) { window.addEventListener('keydown', onKeyDown, true); setupHotkeys._installed = true; }
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function getTopLevelChildContaining(node, root) {
    if (!node || !root) return null;
    let cur = node;
    while (cur && cur.parentElement && cur.parentElement !== root) cur = cur.parentElement;
    if (cur && cur.parentElement === root) return cur;
    if (node.parentElement === root) return node;
    return null;
  }

  function hideIncludedBuiltInsImmediately(toolbarRoot) {
    const rootToUse = trackedToolbarRootEl || toolbarRoot || document.querySelector(TRACK_SELECTOR);
    if (!rootToUse) return;
    for (const entry of TOOLBAR) {
      const origBtn = findBuiltInButtonByTool(entry.tool, rootToUse);
      if (!origBtn) continue;
      try {
        const topChild = getTopLevelChildContaining(origBtn, rootToUse) || (origBtn.closest('div') || origBtn.parentElement || origBtn);
        const existing = document.querySelector(`[${DATA_PLACEHOLDER_FOR}="${entry.tool}"]`);
        if (!existing && topChild) try { createPlaceholderForTopChild(topChild, entry.tool); } catch (e) {}
        if (topChild) hideOriginalTopChild(topChild);
        hideOriginalIconInButton(origBtn);
      } catch (e) {}
    }
    try { rootToUse.style.background = 'transparent'; rootToUse.style.backgroundColor = 'transparent'; rootToUse.style.boxShadow = 'none'; rootToUse.style.border = 'none'; } catch (e) {}
    try { revealSwatchesAndBrush(rootToUse); } catch (e) {}
  }

  const reapplyDebounced = debounce(() => {
    const root = trackedToolbarRootEl || resolveToolbarRoot();
    if (!root) return;
    const custom = document.getElementById(CUSTOM_CONTAINER_ID);
    if (!custom) { buildCustomToolbar(root).catch(e => console.error('buildCustomToolbar failed', e)); return; }
    for (const entry of TOOLBAR) {
      const orig = findBuiltInButtonByTool(entry.tool, root);
      if (orig) {
        try {
          const topChild = orig.closest('div') || orig.parentElement || orig;
          if (topChild && !topChild.hasAttribute(DATA_ORIG_HIDDEN)) {
            const existing = document.querySelector(`[${DATA_PLACEHOLDER_FOR}="${entry.tool}"]`);
            if (!existing) try { createPlaceholderForTopChild(topChild, entry.tool); } catch (e) {}
            hideOriginalTopChild(topChild);
          }
          hideOriginalIconInButton(orig);
        } catch (e) {}
      }
    }
    syncSelectedVisuals(custom, root);
    try { root.style.background = 'transparent'; root.style.backgroundColor = 'transparent'; root.style.boxShadow = 'none'; root.style.border = 'none'; } catch (e) {}
  }, 120);

  function startWatching() {
    if (startWatching._observer) return;
    const rootNode = document.documentElement || document.body;
    let previousExists = !!document.querySelector(TRACK_SELECTOR);

    const obs = new MutationObserver(() => {
      try {
        const existsNow = !!document.querySelector(TRACK_SELECTOR);
        if (previousExists && !existsNow) animateHideCustom();
        else if (!previousExists && existsNow) {
          const el = document.querySelector(TRACK_SELECTOR);
          if (el) { trackedToolbarRootEl = el; animateShowCustom(); reapplyDebounced(); }
        }
        previousExists = existsNow;
      } catch (e) {}
    });

    obs.observe(rootNode, { childList: true, subtree: true, attributes: false });
    startWatching._observer = obs;

    if (!startWatching._interval) {
      startWatching._interval = setInterval(() => {
        const root = document.querySelector(TRACK_SELECTOR);
        const custom = document.getElementById(CUSTOM_CONTAINER_ID);
        if (!root) { animateHideCustom(); return; }
        else if (custom && (custom.dataset.tmHidden === '1' || getComputedStyle(custom).visibility === 'hidden')) animateShowCustom();

        if (root) {
          hideIncludedBuiltInsImmediately(root);
          if (!custom) buildCustomToolbar(root).catch(e => console.error('buildCustomToolbar failed (interval)', e));
          else syncSelectedVisuals(custom, root);
        }
      }, 700);
    }
  }

  /* Entrypoint */
  async function main() {
    injectStyles();
    let toolbarRoot;
    try { toolbarRoot = await waitFor(TRACK_SELECTOR, 15000); } catch (err) {
      console.error('Toolbar root not found:', err);
      observeStore(); setupHotkeys(); startWatching();
      return;
    }

    try { await buildCustomToolbar(toolbarRoot); } catch (e) { console.error('Initial build failed', e); }

    try {
      const root = document.querySelector(TRACK_SELECTOR);
      if (root) { root.style.background = 'transparent'; root.style.backgroundColor = 'transparent'; root.style.boxShadow = 'none'; root.style.border = 'none'; }
      else animateHideCustom();
    } catch (e) {}

    try { revealSwatchesAndBrush(resolveToolbarRoot()); } catch (e) {}
    observeStore(); setupHotkeys(); startWatching();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', main);
  else main();

})();
