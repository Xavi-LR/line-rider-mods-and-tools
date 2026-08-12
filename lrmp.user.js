// ==UserScript==
// @name         Line Rider Multiplayer Mod
// @namespace    https://www.linerider.com/
// @author       Xavi
// @description  P2P Multiplayer client
// @version      2.0.0
// @icon         https://www.linerider.com/favicon.ico

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/lrmp.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/lrmp.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CLIENT_VERSION = '1';

  /* ---------- Localstorage keys and helpers ---------- */
  const SAFE_GET = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const SAFE_SET = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  const CLIENT_ID_KEY = 'lrmp_clientId_v5';
  const CLIENT_ID = SAFE_GET(CLIENT_ID_KEY, null) || ('client-' + Math.random().toString(36).slice(2,10));
  SAFE_SET(CLIENT_ID_KEY, CLIENT_ID);

  const USERNAME_KEY = 'lrmp_username_v5';
  const COLOR_KEY = 'lrmp_color_v5';
  const DEFAULT_COLOR = '#0077CC';
  const DEFAULT_NAME = 'User-' + CLIENT_ID.slice(-4);

  const SAVED_USERNAME = SAFE_GET(USERNAME_KEY, DEFAULT_NAME);
  const SAVED_COLOR = SAFE_GET(COLOR_KEY, DEFAULT_COLOR);

// window.LRMP defaults
  window._LRMP_CLIENT_ID = CLIENT_ID;
  window.LRMP = window.LRMP || {};
  window.LRMP.currentTrackId = null;
  window.LRMP.active = false;
  window.LRMP.myMeta = { perms: 'edit', mode: 'edit', muted: false, isMod: false, isHost: false };

  window.LRMP._lastParticipantsList = [];
  window.LRMP.entities = [];
  window.LRMP.tp = {tp: false, targetClientId: false, tpClientId: null};
  window.LRMP.chat = {history: [], historyInd: 0}
  window.LRMP.shareLayers = false;

  window.LRMP.history = [{undo: [], redo: []}];
  window.LRMP.historyIndex = 0;
  window.LRMP.collisionMap = window.LRMP.collisionMap || new Map();

  function resolveCollisionId(id) {
    if (id == null) return id;
    if (!(window.LRMP.collisionMap instanceof Map)) window.LRMP.collisionMap = new Map();

    let current = id;
    const seen = new Set();

    while (current != null) {
      const key = String(current);
      if (seen.has(key)) break;
      seen.add(key);

      const next = window.LRMP.collisionMap.get(key);
      if (next == null) break;
      current = next;
    }

    return current;
  }

function hexToMillionsColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return new Millions.Color(r, g, b, 64); // eraser tool is 32
}

const setEditScene = (scene) => ({
    type: "SET_RENDERER_SCENE",
    payload: { key: "edit", scene },
});

/* ---------- Chat UI ---------- */
const Chat = (() => {
  const root = document.createElement('div');
  root.id = 'lrmp_chat_root';

  // default position: 15px left, 80px bottom
  const defLeft = SAFE_GET('lrmp_chat_left', '15px');
  const defTop = SAFE_GET('lrmp_chat_top', null);
  const defBottom = SAFE_GET('lrmp_chat_bottom', '80px');
  const defW = SAFE_GET('lrmp_chat_w', '360px');
  const defH = SAFE_GET('lrmp_chat_h', '360px');

  const ORIGINAL_BG = '#FFFFFFEE';

  Object.assign(root.style, {
    position: 'fixed',
    left: defLeft,
    width: defW,
    height: defH,
    zIndex: 9232006,
    display: 'none',
    flexDirection: 'column',
    borderRadius: '6px',
    fontFamily: 'Lato, Helvetica, Arial, sans-serif',
    fontSize: '0.9rem',
    background: ORIGINAL_BG,
    boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
    resize: 'both',
    overflow: 'auto',
    minWidth: '260px',
    minHeight: '160px'
  });

  if (defTop) {
    root.style.top = defTop;
    root.style.bottom = '';
  } else {
    root.style.bottom = defBottom;
    root.style.top = '';
  }

const header = document.createElement('div');
Object.assign(header.style, { padding: '8px', cursor: 'move', borderBottom: '1px solid #eee', background: '#fafafa', color: '#000000DE', fontSize: '1rem', fontWeight: 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' });

const icon = document.createElement('img');
icon.src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Ctitle%3Echat%3C%2Ftitle%3E%3Cpath%20fill%3D%22%23000000DE%22%20d%3D%22M12%2C3C17.5%2C3%2022%2C6.58%2022%2C11C22%2C15.42%2017.5%2C19%2012%2C19C10.76%2C19%209.57%2C18.82%208.47%2C18.5C5.55%2C21%202%2C21%202%2C21C4.33%2C18.67%204.7%2C17.1%204.75%2C16.5C3.05%2C15.07%202%2C13.13%202%2C11C2%2C6.58%206.5%2C3%2012%2C3Z%22%20%2F%3E%3C%2Fsvg%3E';

Object.assign(icon.style, {
  width: '26px',
  height: '26px',
  marginLeft: '12px',
  marginRight: '12px',
  transform: 'translateY(2px)',
  pointerEvents: 'none'
});

const titleContainer = document.createElement('div');
Object.assign(titleContainer.style, {
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden'
});
titleContainer.appendChild(icon);
titleContainer.append('Multiplayer Chat');

  const hideBtn = document.createElement('button'); hideBtn.textContent ='━';
  Object.assign(hideBtn.style, { padding:'4px 8px', fontSize: '18px', fontWeight: 600, borderRadius: '6px', background: '#ffffff20', border: 'none', cursor: 'pointer'});
    hideBtn.addEventListener('mouseenter', (ev) => { ev.target.style.background = "#90909020"; });
    hideBtn.addEventListener('mouseleave', (ev) => { ev.target.style.background = "#ffffff20"; });
    hideBtn.addEventListener('mousedown', (ev) => { ev.stopPropagation(); ev.target.style.background = "#00000020"; }); // no dragging the header on the hide button
    hideBtn.addEventListener('mouseup', (ev) => { ev.target.style.background = "#90909020"; });

// 4. Append the title group and the button
header.appendChild(titleContainer);
header.appendChild(hideBtn);

  const messages = document.createElement('div');
  messages.id = 'lrmp_chat_messages';
  Object.assign(messages.style, { padding:'8px', overflowY:'auto', flex:'1 1 auto', display:'flex', flexDirection:'column', gap:'8px', background: 'transparent' });

  // queued files preview area
  const queuedFilesContainer = document.createElement('div');
  queuedFilesContainer.id = 'lrmp_chat_queued_files';
Object.assign(queuedFilesContainer.style, {
  padding: '6px 8px',
  borderTop: '1px solid #eee',
  display: 'none', // hidden when no queued files
  gap: '8px',
  alignItems: 'center',
  overflowX: 'auto',
  overflowY: 'hidden',
  whiteSpace: 'nowrap',
  flexWrap: 'nowrap',
  flex: '0 0 auto',
  minHeight: '110px',
  background: 'transparent'
});

  const inputWrap = document.createElement('div');
  Object.assign(inputWrap.style, { padding:'8px', borderTop:'1px solid #eee', display:'flex', gap:'8px', alignItems:'center', position:'relative', background: 'transparent' });

  // upload (file) button: plus symbol, left side
  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.title = 'Attach files';
  uploadBtn.textContent = '╋';
  Object.assign(uploadBtn.style, { padding:'4px 6px', fontSize: '18px', borderRadius: '6px', background: '#ffffff20', border: 'none', cursor: 'pointer' });
    uploadBtn.addEventListener('mouseenter', (ev) => { ev.target.style.background = "#90909020"; });
    uploadBtn.addEventListener('mouseleave', (ev) => { ev.target.style.background = "#ffffff20"; });
    uploadBtn.addEventListener('mousedown', (ev) => { ev.target.style.background = "#00000020"; });
    uploadBtn.addEventListener('mouseup', (ev) => { ev.target.style.background = "#90909020"; });

  // text input (takes remaining space)
  const input = document.createElement('input');
  input.type='text';
  input.placeholder='chat... or /help';
  Object.assign(input.style, { flex:'1 1 auto', padding:'8px', borderRadius:'6px', border:'1px solid #ddd', minWidth: '80px', background: 'white' });

  // hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.style.display = 'none';

  // suggestion box (autocomplete)
  const sugg = document.createElement('div');
  Object.assign(sugg.style, { position:'absolute', left:'48px', right:'8px', bottom:'46px', background:'#fff', border:'1px solid #ddd', borderRadius:'6px', maxHeight:'180px', overflowY:'auto', display:'none', zIndex: 9232010, padding:'6px' });

  inputWrap.appendChild(uploadBtn);
  inputWrap.appendChild(input);
  inputWrap.appendChild(sugg);
  inputWrap.appendChild(fileInput);

  root.appendChild(header);
  root.appendChild(messages);
  root.appendChild(queuedFilesContainer); // queued previews appear here, above inputWrap
  root.appendChild(inputWrap);
  document.body.appendChild(root);

  // queued files (not sent until Enter)
  let queuedFiles = [];

  // drag-to-move
  (function enableDrag() {
    let dragging = false, startX=0, startY=0, startLeft=0, startTop=0;
    header.addEventListener('mousedown', (ev) => {
      dragging = true;
      startX = ev.clientX; startY = ev.clientY;
      const rect = root.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      root.style.left = startLeft + 'px';
      root.style.top = startTop + 'px';
      root.style.bottom = '';
      ev.preventDefault();
    });
    window.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      root.style.left = (startLeft + dx) + 'px';
      root.style.top = (startTop + dy) + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      SAFE_SET('lrmp_chat_left', root.style.left);
      SAFE_SET('lrmp_chat_top', root.style.top);
      SAFE_SET('lrmp_chat_bottom', root.style.bottom || '');
      SAFE_SET('lrmp_chat_w', root.style.width);
      SAFE_SET('lrmp_chat_h', root.style.height);
    });
    root.addEventListener('mouseup', () => {
      SAFE_SET('lrmp_chat_left', root.style.left);
      SAFE_SET('lrmp_chat_top', root.style.top);
      SAFE_SET('lrmp_chat_bottom', root.style.bottom || '');
      SAFE_SET('lrmp_chat_w', root.style.width);
      SAFE_SET('lrmp_chat_h', root.style.height);
    });
  })();

  // Render system text with pre-wrap so newlines show
function renderSystem(text, timestamp = new Date().toLocaleTimeString()) {
  const el = document.createElement('div');
  el.style.padding = '6px';
  el.style.borderRadius = '6px';
  el.style.background = '#eef6ff';
  el.style.fontStyle = 'italic';
  el.style.display = 'flex';
  el.style.justifyContent = 'space-between';
  el.style.alignItems = 'flex-start';
  el.style.gap = '10px';

  // Message Text Wrapper
  const content = document.createElement('span');
  content.style.whiteSpace = 'pre-wrap';
  content.style.flexShrink = '1';
  content.style.wordBreak = 'break-word';
  content.textContent = text;

  // Timestamp
  const time = document.createElement('span');
  time.style.fontSize = '0.75rem';
  time.style.color = '#888';
  time.style.fontWeight = '400';
  time.style.flexShrink = '0';
  time.style.whiteSpace = 'nowrap';
  time.textContent = timestamp || '';

  el.appendChild(content);
  el.appendChild(time);

  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function renderChat(author, text, color, timestamp = new Date().toLocaleTimeString(), hideAuthor = false) {
  const el = document.createElement('div');
  el.style.padding = '6px';
  el.style.borderRadius = '6px';
  el.style.background = '#fbfbfc';
  el.style.marginBottom = '8px'; // Added for spacing between messages

  // Container for Author and Timestamp
  const top = document.createElement('div');
  top.style.display = 'flex';
  top.style.justifyContent = 'space-between';
  top.style.alignItems = 'center';
  top.style.fontWeight = '700';

  // Author side
  const authorSpan = document.createElement('span');
  if (color) authorSpan.style.color = color;
  authorSpan.textContent = hideAuthor ? '' : (author ? author : '');

  // Timestamp side
  const time = document.createElement('span');
  time.style.fontSize = '0.75rem';
  time.style.color = '#888';
  time.style.fontWeight = '400';
  time.textContent = timestamp || '';

  top.appendChild(authorSpan);
  top.appendChild(time);

  const body = document.createElement('div');
  body.style.marginTop = '3px';
  body.textContent = text;
  body.style.flexShrink = '1';
  body.style.wordBreak = 'break-word';

  if (!hideAuthor || timestamp) el.appendChild(top);
  el.appendChild(body);

  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

  // Render a file message (incoming remote file) with preview and download button.
  // fileObj shape expected: { name, type, size, dataUrl, isTrackJson, trackMeta }
  // small helper to decode data:... dataUrls to text (supports base64 and percent-encoded)
  function decodeDataUrlToText(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    try {
      if (dataUrl.startsWith('data:')) {
        const comma = dataUrl.indexOf(',');
        if (comma === -1) return null;
        const meta = dataUrl.slice(5, comma);
        const payload = dataUrl.slice(comma + 1);
        if (meta.includes(';base64')) {
          try { return atob(payload); } catch (e) {
            try { return decodeURIComponent(payload); } catch (e2) { return null; }
          }
        } else {
          try { return decodeURIComponent(payload); } catch (e) { return payload; }
        }
      } else {
        // not a data url — return raw string (server might have sent plain JSON string)
        return dataUrl;
      }
    } catch (e) {
      console.error('decodeDataUrlToText error', e);
      return null;
    }
  }

function renderFileMessage(author, fileObj, color, timestamp, hideAuthor=false) {
  const el = document.createElement('div');
  el.style.padding='6px';
  el.style.borderRadius='6px';
  el.style.background = 'transparent';
  el.style.display = 'flex';
  el.style.gap = '8px';
  el.style.alignItems = 'flex-start';

  const col = document.createElement('div');
  col.style.display = 'flex';
  col.style.flexDirection = 'column';
  col.style.flex = '1';

  const header = document.createElement('div');
  header.style.fontWeight = '700';
  if (!hideAuthor) header.textContent = (author ? author + ':' : '');
  if (color) header.style.color = color;

  // body area
  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '6px';

  // create a shrink-wrapping container that holds both the label row and the preview.
  // This keeps the labelRow width exactly equal to the preview width without manual measuring.
  const fileBlock = document.createElement('div');
  fileBlock.style.display = 'inline-block';
  fileBlock.style.verticalAlign = 'top';
  fileBlock.style.boxSizing = 'border-box';
  fileBlock.style.alignSelf = 'flex-start';
  fileBlock.style.maxWidth = '100%';

  // file label row (inside fileBlock)
  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.gap = '8px';
  labelRow.style.alignItems = 'center';
  // no explicit width manipulation anymore — labelRow will take fileBlock's width
  labelRow.style.width = '100%';

  const nameNode = document.createElement('div');
  nameNode.textContent = fileObj.name || 'file';
  nameNode.style.fontWeight = 700;

  const sizeNode = document.createElement('div');
  sizeNode.textContent = fileObj.size
    ? (fileObj.size >= 1048576
        ? `${(fileObj.size / 1048576).toFixed(2)} MB`
        : (fileObj.size >= 1024
           ? `${Math.round(fileObj.size / 1024)} KB`
           : `${Math.round(fileObj.size)} bytes`)
      )


    : '';
  sizeNode.style.fontSize = '12px';
  sizeNode.style.opacity = 0.8;

  const timestampNode = document.createElement('div');
  timestampNode.textContent = timestamp
  timestampNode.style.fontSize = '12px';
  timestampNode.style.color = '#888';
  timestampNode.style.marginLeft = 'auto';

  // controls container pushed to the far right
  const controlsContainer = document.createElement('div');
  controlsContainer.style.display = 'flex';
  controlsContainer.style.gap = '8px';
  controlsContainer.style.alignItems = 'center';

  labelRow.appendChild(nameNode);
  labelRow.appendChild(sizeNode);
  labelRow.appendChild(timestampNode);
  labelRow.appendChild(controlsContainer); // space reserved for download / other controls

  // small helper to hold a play button reference if needed
  let playBtn = null;

  // preview if dataUrl present
  if (fileObj.dataUrl) {
    // previewWrap inside the fileBlock - it defines the width of fileBlock
    const previewWrap = document.createElement('div');
    previewWrap.style.position = 'relative';
    previewWrap.style.display = 'block';
    previewWrap.style.maxWidth = '100%';
    previewWrap.style.padding = '0';
    previewWrap.style.borderRadius = '6px';
    previewWrap.style.overflow = 'hidden'; // hide overflow so no scrollbars appear
    previewWrap.style.boxSizing = 'border-box';
    // prevent flex parent from shrinking the preview vertically
    previewWrap.style.flex = '0 0 auto';
    previewWrap.style.alignSelf = 'flex-start';

    let mediaEl = null;

    if (fileObj.type && fileObj.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = fileObj.dataUrl;
      img.style.display = 'block';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '320px';
      img.style.height = 'auto';
      img.style.width = 'auto';
      img.style.borderRadius = '6px';
      img.style.border = '1px solid transparent';
      img.style.objectFit = 'contain';
      mediaEl = img;
    } else if (fileObj.type && fileObj.type.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = fileObj.dataUrl;
      audio.style.display = 'block';
      audio.style.maxWidth = '100%';
      // audio controls are naturally sized; keep wrapper from forcing extra space
      mediaEl = audio;
    } else if (fileObj.type && fileObj.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.controls = true;
      vid.src = fileObj.dataUrl;
      vid.style.display = 'block';
      vid.style.maxWidth = '100%';
      vid.style.maxHeight = '320px';
      vid.style.borderRadius = '6px';
      vid.style.objectFit = 'contain';
      mediaEl = vid;
    } else if ((fileObj.name && fileObj.name.toLowerCase().endsWith('.track.json')) || fileObj.isTrackJson) {
      const meta = fileObj.trackMeta || {};
      const metaWrap = document.createElement('div');
      metaWrap.style.padding = '8px';
      metaWrap.style.border = '1px solid #ddd';
      metaWrap.style.borderRadius = '8px';
      metaWrap.style.background = '#ffffffcc';
      const title = document.createElement('div'); title.textContent = meta.label || '(no label)'; title.style.fontWeight = 700;
      const creator = document.createElement('div'); creator.textContent = meta.creator ? 'Creator: ' + meta.creator : 'idk what else to put here'; creator.style.fontSize = '12px';
      const desc = document.createElement('div'); desc.textContent = meta.description || ''; desc.style.fontSize = '12px';
      metaWrap.appendChild(title); metaWrap.appendChild(creator); metaWrap.appendChild(desc);
      mediaEl = metaWrap;

      // track.json play button
      playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.textContent = '▶︎';
      playBtn.title = 'Load track';
      Object.assign(playBtn.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        padding: '6px 8px',
        fontSize: '16px',
        borderRadius: '6px',
        background: '#fafafa',
        border: '1px solid #ddd',
        cursor: 'pointer',
        zIndex: 10
      });
      playBtn.addEventListener('mouseenter', (ev) => { ev.target.style.background = "#f0f0f0"; });
      playBtn.addEventListener('mouseleave', (ev) => { ev.target.style.background = "#fafafa"; });

      playBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        // decode text from dataUrl or use raw data if provided
        const text = (fileObj.text && typeof fileObj.text === 'string') ? fileObj.text : decodeDataUrlToText(fileObj.dataUrl);
        if (!text) {
          console.error('No track text available to load');
          return;
        }
        try {
          const parsed = JSON.parse(text);
            window.store.dispatch({
              type: 'LOAD_TRACK',
              payload: parsed
            });
        } catch (err) {
          console.error('Invalid track file JSON', err);
        }
      });
    } else {
      const fallback = document.createElement('div');
      fallback.textContent = `No preview available for ${fileObj.type || 'this file type.'}`;
      fallback.style.fontSize = '12px';
      mediaEl = fallback;
    }

    // Append labelRow + previewWrap to fileBlock (label first)
    fileBlock.appendChild(labelRow);

    previewWrap.appendChild(mediaEl);

    if (playBtn) {
      previewWrap.appendChild(playBtn);
    }

    fileBlock.appendChild(previewWrap);

    // create the download anchor and append to controlsContainer, but skip videos
    if (!(fileObj.type && fileObj.type.startsWith('video/'))) {
      const dl = document.createElement('a');
      dl.href = fileObj.dataUrl;
      dl.download = fileObj.name || 'file';
      dl.textContent = '⭳';
      dl.setAttribute('aria-label', 'Download file');

      // style it so it's aligned inside controls container
      dl.style.padding = '0px 8px';
      dl.style.border = '1px solid #ddd';
      dl.style.borderRadius = '6px';
      dl.style.textDecoration = 'none';
      dl.style.fontSize = '20px';
      dl.style.background = '#fafafa';
      dl.style.cursor = 'pointer';
      dl.style.display = 'inline-flex';
      dl.style.alignItems = 'center';
      dl.style.justifyContent = 'center';

      controlsContainer.appendChild(dl);
    }

    // Add fileBlock to the message body
    body.appendChild(fileBlock);

  } else {
    // no dataUrl -> uh oh that means the file's probably too big
    body.appendChild(labelRow);
    const waiting = document.createElement('div');
    waiting.textContent = 'broken';
    waiting.style.fontSize = '12px';
    body.appendChild(waiting);
  }

  col.appendChild(header);
  col.appendChild(body);
  el.appendChild(col);
  messages.appendChild(el); messages.scrollTop = messages.scrollHeight;
}

function renderQueuedFiles() {
queuedFilesContainer.innerHTML = '';
if (!queuedFiles || queuedFiles.length === 0) {
  queuedFilesContainer.style.display = 'none';
  return;
}
queuedFilesContainer.style.display = 'flex';
// Ensure this container won't try to wrap children or create vertical scroll
queuedFilesContainer.style.flexWrap = 'nowrap';
queuedFilesContainer.style.overflowY = 'hidden';
// Keep it from shrinking so the bar always has room to show full items
queuedFilesContainer.style.flex = '0 0 auto';
queuedFilesContainer.style.minHeight = '110px';


  for (let i = 0; i < queuedFiles.length; i++) {
    const f = queuedFiles[i];
    const item = document.createElement('div');

    // keep each item from shrinking and ensure consistent sizing
    item.style.display = 'flex';
    item.style.flexDirection = 'column';
    item.style.alignItems = 'center';
    item.style.gap = '6px';
    item.style.minWidth = '100px';
    item.style.maxWidth = '200px';
    item.style.padding = '6px';
    item.style.borderRadius = '8px';
    item.style.border = '1px solid #eee';
    item.style.background = '#ffffff55';
    item.style.boxSizing = 'border-box';
    item.style.flex = '0 0 auto';

    // preview area
    const previewWrap = document.createElement('div');
    previewWrap.style.display = 'flex';
    previewWrap.style.justifyContent = 'center';
    previewWrap.style.alignItems = 'center';
    previewWrap.style.width = '72px';
    previewWrap.style.height = '72px';
    previewWrap.style.overflow = 'hidden';
    previewWrap.style.borderRadius = '6px';
    previewWrap.style.background = 'rgba(255,255,255,0.08)';
    previewWrap.style.flex = '0 0 auto';

    // small previews depending on type / track json
    if (f.dataUrl && f.type && f.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = f.dataUrl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      previewWrap.appendChild(img);
    } else if (f.dataUrl && f.type && f.type.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.src = f.dataUrl;
      audio.controls = true;
      // keep audio controls compact so they can't increase the item height
      audio.style.width = '68px';
      audio.style.height = '32px';
      audio.style.maxHeight = '32px';
      audio.style.boxSizing = 'border-box';
      audio.style.display = 'block';
      previewWrap.appendChild(audio);
    } else if (f.dataUrl && f.type && f.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = f.dataUrl;
      vid.controls = true;
      vid.style.width = '72px';
      vid.style.height = '72px';
      vid.style.objectFit = 'cover';
      vid.style.display = 'block';
      previewWrap.appendChild(vid);
    } else if ((f.name && f.name.toLowerCase().endsWith('.track.json')) || f.isTrackJson) {
      const meta = f.trackMeta || {};
      const t = document.createElement('div');
      t.style.fontSize = '11px';
      t.style.textAlign = 'center';
      t.style.padding = '4px';
      t.style.boxSizing = 'border-box';
      t.textContent = meta.label || (f.name || 'track');
      previewWrap.appendChild(t);
    } else {
      const generic = document.createElement('div');
      generic.style.fontSize = '12px';
      generic.style.textAlign = 'center';
      generic.style.width = '100%';
      generic.textContent = (f.name || 'file').slice(0, 12);
      previewWrap.appendChild(generic);
    }

    const nameNode = document.createElement('div');
    nameNode.style.fontSize = '11px';
    nameNode.style.textAlign = 'center';
    nameNode.style.maxWidth = '120px';
    nameNode.style.overflow = 'hidden';
    nameNode.style.textOverflow = 'ellipsis';
    nameNode.style.whiteSpace = 'nowrap';
    nameNode.textContent = f.name || 'file';

    // remove button (x)
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    Object.assign(removeBtn.style, { padding: '2px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' });
    removeBtn.addEventListener('click', () => {
      queuedFiles.splice(i, 1);
      renderQueuedFiles();
    });

    item.appendChild(previewWrap);
    item.appendChild(nameNode);
    item.appendChild(removeBtn);

    queuedFilesContainer.appendChild(item);
  }
}

  // utility to convert File -> { name, type, size, dataUrl, isTrackJson, trackMeta }
  function readFileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const out = { name: file.name, type: file.type || guessMimeFromName(file.name), size: file.size, dataUrl };
        if (file.name && (file.name.toLowerCase().endsWith('.track.json') || file.name.toLowerCase().endsWith('.json'))) {
          try {
            // extract text portion of dataUrl if present
            let txt = '';
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
              const comma = dataUrl.indexOf(',');
              const b64 = dataUrl.slice(comma + 1);
              try {
                txt = atob(b64);
              } catch (e) {
                try { txt = decodeURIComponent(b64); } catch (e2) { txt = ''; }
              }
            } else {
              txt = dataUrl;
            }
            const json = JSON.parse(txt);
            out.isTrackJson = true;
            out.trackMeta = {
              label: json.label || '',
              creator: json.creator || '',
              description: json.description || ''
            };
          } catch (e) {
          }
        }
        resolve(out);
      };
      reader.readAsDataURL(file);
    });
  }

  // mime
  function guessMimeFromName(name) {
    const n = (name || '').toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.mp3')) return 'audio/mpeg';
    if (n.endsWith('.wav')) return 'audio/wav';
    if (n.endsWith('.mp4')) return 'video/mp4';
    if (n.endsWith('.mov')) return 'video/mov';
    if (n.endsWith('.track.json') || n.endsWith('.json')) return 'application/json';
    return '';
  }

  // When send is triggered (Enter), compose and dispatch chat + queued files
  function sendChatNow(textValue) {
    const filesToSend = queuedFiles.length ? queuedFiles.map(f => ({
      name: f.name,
      type: f.type,
      size: f.size,
      dataUrl: f.dataUrl,
      trackMeta: f.trackMeta || null
    })) : null;
    const timestamp = new Date().toLocaleTimeString();

    // dispatch the event
    document.dispatchEvent(new CustomEvent('lrmp_chat_send', { detail: { text: textValue, files: filesToSend } }));

    // render the sent files into the chat area for this client so sender sees them too
    if (filesToSend && filesToSend.length) {
      const myColor = SAFE_GET(COLOR_KEY, DEFAULT_COLOR);
      for (const f of filesToSend) {
        // use the same render function that remote clients use
        renderFileMessage('You', f, myColor, timestamp, false);
      }
    }

    // clear queue and update queued-files UI
    queuedFiles = [];
    renderQueuedFiles();
  }

  // input handlers: Enter sends message + queued files (if any)
  input.addEventListener('keydown', (ev) => {
    const c = window.LRMP.chat;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const val = (input.value || '').trim();
      if (val !== c.history[c.history.length - 1]) {
        if (val) c.history.push(val);
        c.historyInd = c.history.length;
      }
      sendChatNow(val);
      input.value = '';
      hideSuggestions();
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      const newNum = Math.max(c.historyInd - 1, 0)
      c.historyInd = newNum;
      input.value = c.history[newNum] || '';
  }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      const newNum = Math.min(c.historyInd + 1, c.history.length)
      c.historyInd = newNum;
      input.value = c.history[newNum] || '';
    }
  });
  input.addEventListener('input', () => {
    updateSuggestions(input.value || '');
  });

  // upload button triggers hidden file input
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // when files are selected via the file input => read and queue
  fileInput.addEventListener('change', async (ev) => {
    const files = ev.target.files;
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const readPromises = arr.map(f => readFileToDataUrl(f));
    const results = await Promise.all(readPromises);
    for (const r of results) queuedFiles.push(r);
    renderQueuedFiles();
    // Clear input so same file can be selected again later
    fileInput.value = '';
  });

  // Drag-and-drop support on entire chat root
  root.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    root.style.background = '#f0f6ff';
  });
  root.addEventListener('dragleave', (ev) => {
    // restore original background
    root.style.background = ORIGINAL_BG;
  });
  root.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    root.style.background = ORIGINAL_BG;
    const files = ev.dataTransfer.files;
    if (files && files.length) {
      const arr = Array.from(files);
      const readPromises = arr.map(f => readFileToDataUrl(f));
      const results = await Promise.all(readPromises);
      for (const r of results) queuedFiles.push(r);
      renderQueuedFiles();
    }
  });

  hideBtn.addEventListener('click', () => {
    root.style.display = 'none';
    document.dispatchEvent(new CustomEvent('lrmp_chat_hidden'));
  });

  // Autocomplete helpers
  function getCommandsForUser() {
    const cmds = ['help','?','mode','togglemode','view','edit','tell','w','whisper','m','message','tp','ping'];
    const myMeta = window.LRMP && window.LRMP.myMeta ? window.LRMP.myMeta : { isMod:false };
    if (myMeta.isMod || myMeta.isHost) {
      cmds.push('muteall','unmuteall','mute','unmute','kick','ban','perms','permsall');
    }
    if (myMeta.isHost) {
      cmds.push('op','mod','deop','unmod','resync');
    }
    return cmds;
  }

  let suggestedRenderLock = false;
  function updateSuggestions(text) {
    if (suggestedRenderLock) return;
    const trimmed = (text || '');
    if (!trimmed.trim().startsWith('/')) { hideSuggestions(); return; }
    const withoutSlash = trimmed.trim().slice(1);
    const parts = withoutSlash.split(/\s+/);
    const cmdPart = parts[0] || '';
    const rest = parts.slice(1).join(' ');
    const commands = getCommandsForUser();
    let matches = [];
    if (cmdPart.length === 0) {
      matches = commands.map(c => '/' + c);
    } else {
      for (const c of commands) {
        if (c.startsWith(cmdPart)) matches.push('/' + c);
      }
    }

    const myMeta = window.LRMP && window.LRMP.myMeta ? window.LRMP.myMeta : { isMod:false };
    const isMod = (myMeta.isMod || myMeta.isHost);
    const userArgCommands = ['op','deop','op','m','mute','unmute','kick','ban','perms','tell','message','w','whisper','m', 'tp', isMod ? 'mode' : null];
    if (userArgCommands.includes(cmdPart) || (cmdPart === '' && (withoutSlash.startsWith('op') || withoutSlash.startsWith('m')))) {
      const list = (window.LRMP && window.LRMP._lastParticipantsList) ? window.LRMP._lastParticipantsList.slice() : [];
      const uMatches = [];
      for (const p of list) {
        if (!p) continue;
        if (!cmdPart || (p.username && p.username.toLowerCase().includes(rest.toLowerCase())) || (String(p.clientId) === rest)) {
          uMatches.push(p.username || (p.clientId || ''));
        }
      }
      if (uMatches.length) {
        matches = uMatches.slice(0, 30);
      }
    }

    renderSuggestions(matches);
  }

  function renderSuggestions(list) {
    if (!list || !list.length) { hideSuggestions(); return; }
    sugg.innerHTML = '';
    for (const it of list.slice(0, 50)) {
      const r = document.createElement('div');
      r.style.padding = '4px 6px';
      r.style.cursor = 'pointer';
      r.textContent = it;
      r.addEventListener('click', () => {
        const val = input.value || '';
        const trimmed = val.trimEnd();
        // If trailing space, append selection (args case)
        if (/\s$/.test(val)) {
          input.value = val + it + ' ';
          input.focus();
          hideSuggestions();
          return;
        }

        // Distinguish command suggestion (starts with '/') vs username suggestion
        if (String(it).startsWith('/')) {
          // replace command token only
          const tokens = trimmed.split(/\s+/);
          const args = tokens.slice(1).join(' ');
          const newCmd = it;
          input.value = newCmd + (args ? ' ' + args + ' ' : ' ');
          input.focus();
          hideSuggestions();
          return;
        } else {
          // username suggestion: replace the last token (argument)
          const lastSpace = val.lastIndexOf(' ');
          if (lastSpace === -1) {
            // no spaces - keep existing command if any
            const firstToken = trimmed.split(/\s+/)[0] || '';
            if (firstToken.startsWith('/')) {
              input.value = firstToken + ' ' + it + ' ';
            } else {
              input.value = it + ' ';
            }
          } else {
            input.value = val.slice(0, lastSpace + 1) + it + ' ';
          }
          input.focus();
          hideSuggestions();
          return;
        }
      });
      sugg.appendChild(r);
    }
    sugg.style.display = 'block';
  }
  function hideSuggestions() { sugg.style.display = 'none'; sugg.innerHTML = ''; }

  return {
    show: ()=> { root.style.display='flex'; },
    select: ()=> { input.focus(); },
    hide: ()=>{ root.style.display='none'; },
    addSystem: renderSystem,
    addChat: renderChat,
    addFileMessage: renderFileMessage,
    isVisible: ()=> root.style.display !== 'none',
    inputEl: input,
    renderSuggestions,
    hideSuggestions,
    rootEl: root,
    messagesEl: messages
  };
})();



  /* ================================================================
     P2P TRANSPORT + IN-BROWSER HOST ENGINE
     ----------------------------------------------------------------
     This block is a straight port of lrmp_server.js's authoritative
     track/collision/moderation logic, adapted to run inside a
     browser tab instead of a standalone Node process. Whichever
     peer clicks "Host" runs this engine locally; the other peer(s)
     connect to it directly over a WebRTC RTCDataChannel instead of
     a WebSocket to a VPS. Message shapes, handler behavior, and the
     collision-remap protocol (allocateNextLineId / meta.collisions /
     mapPrevToNew) are unchanged from the server so undo/redo and id
     collision handling behave identically to the original server.
     ================================================================ */

  function hostUid(prefix) {
    prefix = prefix || '';
    const arr = new Uint8Array(6);
    (window.crypto || crypto).getRandomValues(arr);
    let hex = '';
    for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
    return prefix + hex;
  }

  const HostEngine = (() => {
    // clientsById: clientId => { send: fn(obj), username, color, connectedAt, currentTracks: Set }
    const clientsById = new Map();
    const tracks = new Map();

    function send(conn, obj) {
      if (!conn || typeof conn.send !== 'function') return;
      try { conn.send(obj); } catch (e) { /* ignore */ }
    }
    function sendToClientId(targetId, obj) {
      const c = clientsById.get(targetId);
      if (c) send(c, obj);
    }
    function broadcastToTrack(track, obj, exceptClientId) {
      if (!track || !track.participants) return;
      for (const cid of Array.from(track.participants)) {
        if (cid === exceptClientId) continue;
        sendToClientId(cid, obj);
      }
    }
    // Only one track can ever exist at a time (unlike the original server,
    // which juggled many tracks across many clients at once) -- a P2P
    // session has exactly one host and exactly one thing they're hosting,
    // so `tracks` never holds more than a single entry in practice.
    function getTrack() {
      for (const t of tracks.values()) return t;
      return null;
    }
    // Add an already-connected client straight into the track, if one
    // exists -- replaces the old explicit "browse tracks, pick one, join
    // it" flow, since with a single track there's nothing to pick.
    function autoJoinIfPossible(clientId) {
      const t = getTrack();
      if (!t) return;
      if (t.participants.has(clientId)) return;
      if (t.banned && t.banned.has(clientId)) return;
      const client = clientsById.get(clientId);
      t.participants.add(clientId);
      if (client) { client.currentTracks = client.currentTracks || new Set(); client.currentTracks.add(t.id); }
      ensureTrackParticipantMeta(t);
      sendToClientId(clientId, { type: 'join_ack', success: true, trackId: t.id, name: t.name });
      if (t.hostClientId && clientsById.has(t.hostClientId) && t.hostClientId !== clientId) {
        sendToClientId(t.hostClientId, { type: 'request_track', requesterClientId: clientId, trackId: t.id });
      }
      sendParticipantsUpdate(t);
    }
    function sendParticipantsUpdate(track) {
      if (!track) return;
      const participants = [];
      for (const cid of track.participants) {
        const cc = clientsById.get(cid);
        const meta = (track.participantMeta && track.participantMeta.get(cid)) || {};
        participants.push({
          clientId: cid,
          username: (cc && cc.username) || ('client-' + String(cid).slice(0, 6)),
          color: (cc && cc.color) || '#0077cc',
          isMod: !!meta.isMod,
          muted: !!meta.muted,
          perms: meta.perms || 'edit',
          mode: meta.mode || 'edit'
        });
      }
      const msg = { type: 'participants', trackId: track.id, name: track.name, hostClientId: track.hostClientId, participants, shareLayers: !!track.shareLayers, muteAll: !!track.muteAll };
      for (const cid of track.participants) sendToClientId(cid, msg);
    }
    function ensureTrackParticipantMeta(t) {
      if (!t.participantMeta) t.participantMeta = new Map();
      for (const cid of t.participants) {
        if (!t.participantMeta.has(cid)) t.participantMeta.set(cid, { isMod: false, muted: false, perms: 'edit', mode: 'edit', collisions: [] });
      }
      if (t.hostClientId) {
        const hostMeta = t.participantMeta.get(t.hostClientId) || { isMod: false, muted: false, perms: 'edit', mode: 'edit', collisions: [] };
        hostMeta.isMod = true;
        t.participantMeta.set(t.hostClientId, hostMeta);
      }
    }

    function registerClient(clientId, sendFn) {
      clientsById.set(clientId, { send: sendFn, username: `anon-${String(clientId).slice(0, 6)}`, color: '#0077cc', connectedAt: Date.now(), currentTracks: new Set() });
    }

    function unregisterClient(clientId) {
      const client = clientsById.get(clientId);
      if (!client) return;
      for (const t of Array.from(tracks.values())) {
        if (t.participants.has(clientId)) {
          t.participants.delete(clientId);
          if (t.participantMeta) t.participantMeta.delete(clientId);
          if (t.hostClientId === clientId) {
            broadcastToTrack(t, { type: 'end_ack', trackId: t.id, reason: 'host_disconnected' });
            tracks.delete(t.id);
          } else {
            sendParticipantsUpdate(t);
          }
        }
      }
      clientsById.delete(clientId);
    }

    function handleMessage(clientId, m) {
      if (!m || !m.type) return;
      const client = clientsById.get(clientId);

      switch (m.type) {
        case 'hello': {
          if (!client) return;
          if (m.version !== CLIENT_VERSION) {
            sendToClientId(clientId, { type: 'hello_ack', clientId, receivedAt: Date.now(), success: false });
            return;
          }
          client.username = m.username || client.username;
          client.color = m.color || client.color;
          sendToClientId(clientId, { type: 'hello_ack', clientId, receivedAt: Date.now(), connectedMessage: 'Connected (peer-to-peer session).', success: true });
          Chat.show();
          autoJoinIfPossible(clientId); // no-op if the host hasn't started a track yet
          break;
        }

        case 'host_track': {
          // Only one track can exist at a time -- replace anything already
          // running rather than accumulating multiple entries.
          for (const oldId of Array.from(tracks.keys())) tracks.delete(oldId);

          const p = m.payload || {};
          const s = m.settings || {};
          const trackId = hostUid('track-');
          const tobj = {
            id: trackId, name: p.name || ('Track ' + trackId.slice(0, 6)), hostClientId: clientId,
            engine: p.engine || null,
            participants: new Set(), participantMeta: new Map(), banned: new Set(),
            muteAll: false, shareLayers: !!s.shareLayers, lineIds: new Set()
          };
          if (p.engine && Array.isArray(p.engine.lines)) {
            for (const L of p.engine.lines) if (L && typeof L.id !== 'undefined' && L.id !== null) tobj.lineIds.add(String(L.id));
          }
          tobj.participants.add(clientId);
          tracks.set(trackId, tobj);
          if (client) { client.currentTracks = client.currentTracks || new Set(); client.currentTracks.add(trackId); }
          ensureTrackParticipantMeta(tobj);
          sendToClientId(clientId, { type: 'host_ack', success: true, trackId, name: tobj.name });
          sendParticipantsUpdate(tobj);
          if (p.engine) tobj.engine = p.engine;
          // Anyone who connected via invite code before the track existed
          // gets pulled in now instead of having to separately "join".
          for (const otherId of clientsById.keys()) {
            if (otherId !== clientId) autoJoinIfPossible(otherId);
          }
          break;
        }

        case 'leave_track': {
          const trackId = m.trackId;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'leave_ack', success: false, reason: 'no_track' }); return; }
          if (t.participants.has(clientId)) t.participants.delete(clientId);
          if (t.participantMeta) t.participantMeta.delete(clientId);
          if (client && client.currentTracks) client.currentTracks.delete(trackId);
          sendToClientId(clientId, { type: 'leave_ack', success: true, trackId });
          sendParticipantsUpdate(t);
          break;
        }

        case 'end_track': {
          const trackId = m.trackId;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'end_ack', success: false, reason: 'no_track' }); return; }
          if (t.hostClientId !== clientId) { sendToClientId(clientId, { type: 'end_ack', success: false, reason: 'not_host' }); return; }
          for (const cid of t.participants) {
            sendToClientId(cid, { type: 'end_ack', success: true, trackId });
            const cc = clientsById.get(cid);
            if (cc && cc.currentTracks) cc.currentTracks.delete(trackId);
          }
          tracks.delete(trackId);
          break;
        }

        case 'kick': {
          const trackId = m.trackId;
          const targetClientId = m.targetClientId;
          const t = tracks.get(trackId);
          if (!t) return;
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const isAllowed = (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!isAllowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'kick', reason: 'not_allowed' }); return; }
          if (!t.participants.has(targetClientId)) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'kick', reason: 'not_in_track' }); return; }
          if (targetClientId === t.hostClientId) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'kick', reason: 'cannot_kick_host' }); return; }
          t.participants.delete(targetClientId);
          if (t.participantMeta) t.participantMeta.delete(targetClientId);
          sendToClientId(targetClientId, { type: 'kicked', targetClientId, by: clientId, trackId, reason: 'kicked' });
          const tc = clientsById.get(targetClientId);
          if (tc && tc.currentTracks) tc.currentTracks.delete(trackId);
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'kick', targetClientId });
          break;
        }

        case 'request_engine_changes': {
          const trackId = m.trackId || null;
          const t = trackId ? tracks.get(trackId) : null;
          if (!t) return;

          if (!t.lineIds) t.lineIds = new Set();
          if (!t.participantMeta) t.participantMeta = new Map();

          if (typeof t.nextLineId !== 'number' || Number.isNaN(t.nextLineId)) {
            const numericIds = Array.from(t.lineIds).map(s => Number(s)).filter(n => Number.isFinite(n) && Number.isSafeInteger(n) && n > 0);
            t.nextLineId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
          }

          function allocateNextLineId(track) {
            if (!track.nextLineId || typeof track.nextLineId !== 'number') track.nextLineId = 1;
            let candidate = Math.max(1, Math.floor(track.nextLineId));
            while (track.lineIds.has(String(candidate))) candidate += 1;
            track.lineIds.add(String(candidate));
            track.nextLineId = candidate + 1;
            return candidate;
          }

          function clientMayEdit(track, cid) {
            if (!track) return false;
            const meta = track.participantMeta && track.participantMeta.get(cid);
            const perms = meta && meta.perms ? meta.perms : 'view';
            const mode = meta && meta.mode ? meta.mode : 'view';
            if (mode === 'view' || perms === 'view') return false;
            return true;
          }

          if (!t.participants || !t.participants.has(clientId)) return;
          if (!clientMayEdit(t, clientId)) {
            sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'request_engine_changes', reason: 'not_allowed' });
            return;
          }

          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const hasMetaCollisions = meta && Array.isArray(meta.collisions) && meta.collisions.length > 0;

          const mapPrevToNew = new Map();
          if (hasMetaCollisions) {
            for (const c of meta.collisions) if (c && c.prevId != null && c.newId != null) mapPrevToNew.set(String(c.prevId), c.newId);
          }

          const allNewCollisionsMeta = [];

          for (const fn of m.functions) {
            const removeCollisions = [];
            const addCollisions = [];
            const collisionsMeta = [];

            if (Array.isArray(fn.linesToRemove)) {
              for (const originalId of fn.linesToRemove) {
                if (originalId == null) continue;
                const resolvedId = mapPrevToNew.has(String(originalId)) ? mapPrevToNew.get(String(originalId)) : originalId;
                if (String(resolvedId) !== String(originalId)) removeCollisions.push(Number(resolvedId));
                t.lineIds.delete(String(resolvedId));
              }
              if (removeCollisions.length > 0) {
                sendToClientId(clientId, { type: 'engine_changes', functions: [{ linesToRemove: removeCollisions, linesToAdd: null }], clientId: 'server' });
              }
            }

            if (Array.isArray(fn.linesToAdd)) {
              for (const incomingLine of fn.linesToAdd) {
                if (!incomingLine || incomingLine.id == null) continue;
                const originalIncomingId = incomingLine.id;
                const lineClone = { ...incomingLine };

                if (mapPrevToNew.has(String(originalIncomingId))) {
                  const mappedId = mapPrevToNew.get(String(originalIncomingId));
                  lineClone.id = Number(mappedId);
                  addCollisions.push({ ...lineClone });
                  t.lineIds.add(String(mappedId));
                  continue;
                }

                const incomingIdStr = String(lineClone.id);
                if (lineClone.added && t.lineIds.has(incomingIdStr)) {
                  const newId = allocateNextLineId(t);
                  collisionsMeta.push({ prevId: originalIncomingId, newId });
                  mapPrevToNew.set(String(originalIncomingId), newId);
                  lineClone.id = newId;
                  addCollisions.push({ ...lineClone });
                } else {
                  t.lineIds.add(incomingIdStr);
                }
              }

              if (collisionsMeta.length > 0) {
                if (meta) {
                  meta.collisions = [...(Array.isArray(meta.collisions) ? meta.collisions : []), ...collisionsMeta];
                  t.participantMeta.set(clientId, meta);
                }
                allNewCollisionsMeta.push(...collisionsMeta);
                sendToClientId(clientId, { type: 'engine_changes', functions: [{ linesToRemove: null, linesToAdd: addCollisions }], collisions: collisionsMeta, clientId: 'server' });
              } else if (addCollisions.length > 0) {
                sendToClientId(clientId, { type: 'engine_changes', functions: [{ linesToRemove: null, linesToAdd: addCollisions }], clientId: 'server' });
              }
            }
          }

          const functionsForBroadcast = m.functions.map(fn => {
            if (fn == null || typeof fn !== 'object' || Array.isArray(fn)) return fn;
            const fnClone = { ...fn };
            if (Array.isArray(fn.linesToRemove)) {
              fnClone.linesToRemove = fn.linesToRemove.map(id => {
                if (id == null) return id;
                return mapPrevToNew.has(String(id)) ? mapPrevToNew.get(String(id)) : id;
              });
            } else if (Object.prototype.hasOwnProperty.call(fn, 'linesToRemove')) {
              fnClone.linesToRemove = null;
            } else {
              delete fnClone.linesToRemove;
            }
            if (Array.isArray(fn.linesToAdd)) {
              fnClone.linesToAdd = fn.linesToAdd.map(line => {
                if (!line || typeof line !== 'object') return line;
                const clonedLine = { ...line };
                if (clonedLine.id != null && mapPrevToNew.has(String(clonedLine.id))) clonedLine.id = mapPrevToNew.get(String(clonedLine.id));
                return clonedLine;
              });
            } else if (Object.prototype.hasOwnProperty.call(fn, 'linesToAdd')) {
              fnClone.linesToAdd = null;
            } else {
              delete fnClone.linesToAdd;
            }
            return fnClone;
          });

          broadcastToTrack(t, { type: 'engine_changes', functions: functionsForBroadcast, clientId });
          if (t.participants) sendParticipantsUpdate(t);
          return;
        }

        case 'forget_collision': {
          return;
        }

        case 'request_command_changes': {
          const trackId = m.trackId || null;
          const t = trackId ? tracks.get(trackId) : null;
          if (!t) return;
          function clientMayEdit(track, cid) {
            if (!track) return false;
            ensureTrackParticipantMeta(track);
            const meta = track.participantMeta.get(cid) || { perms: 'view', mode: 'view' };
            if (meta.mode === 'view' || meta.perms === 'view') return false;
            return true;
          }
          if (!t.participants || !t.participants.has(clientId)) return;
          if (!clientMayEdit(t, clientId)) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'request_command_changes', reason: 'not_allowed' }); return; }
          broadcastToTrack(t, { type: 'command_changes', function: m.function, args: m.args, clientId });
          if (t.participants) sendParticipantsUpdate(t);
          return;
        }

        case 'request_cursor': {
          const trackId = m.trackId || null;
          const t = trackId ? tracks.get(trackId) : null;
          if (t) {
            if (!t.participants.has(clientId)) return;
            broadcastToTrack(t, { type: 'cursor', color: m.color, line: m.line, clientId });
            return;
          }
          break;
        }

        case 'track': {
          const trackId = m.trackId || null;
          const t = trackId ? tracks.get(trackId) : null;
          if (!t) return;
          t.engine = m.trackData || null;
          t.lineIds = t.lineIds || new Set();
          t.lineIds.clear();
          try {
            if (m.trackData && Array.isArray(m.trackData.lines)) {
              for (const L of m.trackData.lines) if (L && typeof L.id !== 'undefined' && L.id !== null) t.lineIds.add(String(L.id));
            }
          } catch (e) { /* ignore */ }

          if (m.requesterClientId) {
            if (t.participants.has(m.requesterClientId) || clientsById.has(m.requesterClientId)) {
              sendToClientId(m.requesterClientId, { type: 'track', trackData: m.trackData, clientId, trackId: t.id, resync: !!m.resync });
            }
          } else {
            for (const cid of t.participants) sendToClientId(cid, { type: 'track', trackData: m.trackData, clientId, trackId: t.id, resync: !!m.resync });
          }
          break;
        }

        case 'chat': {
          const trackId = m.trackId || (client && client.currentTracks && Array.from(client.currentTracks)[0]) || null;
          const t = trackId ? tracks.get(trackId) : null;
          const files = Array.isArray(m.files) && m.files.length ? m.files.map(f => ({ name: f.name, type: f.type, size: f.size, dataUrl: f.dataUrl || null, trackMeta: f.trackMeta || null })) : null;
          const payload = { type: 'chat', clientId, username: (m.username || (client || {}).username || 'Anon'), text: m.text || '', color: m.color || ((client || {}).color || '#0077cc'), trackId, files };

          if (t) {
            if (t.muteAll) {
              const meta = t.participantMeta && t.participantMeta.get(clientId);
              const allowed = (t.hostClientId === clientId) || (meta && meta.isMod);
              if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'chat', reason: 'muted' }); return; }
            }
            broadcastToTrack(t, payload);
          } else {
            for (const c of clientsById.values()) if (c.send && ((c.currentTracks == null) || c.currentTracks.size === 0)) send(c, payload);
          }
          break;
        }

        case 'update_username': {
          if (!client) return;
          client.username = m.username || client.username;
          client.color = m.color || client.color;
          if (client.currentTracks) for (const tid of client.currentTracks) { const t = tracks.get(tid); if (t) sendParticipantsUpdate(t); }
          break;
        }

        case 'private_message': {
          const target = m.targetClientId;
          const text = m.text || '';
          if (!target) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'private_message', reason: 'no_target' }); return; }
          const payload = { type: 'private_message', clientId, username: (client || {}).username || 'Anon', text, targetClientId: target, color: (client || {}).color || '#0077cc' };
          sendToClientId(target, payload);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'private_message', targetClientId: target, text });
          break;
        }

        case 'set_mod': {
          const trackId = m.trackId, target = m.targetClientId, grant = !!m.grant;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'set_mod', reason: 'no_track' }); return; }
          if (t.hostClientId !== clientId) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'set_mod', reason: 'not_host' }); return; }
          if (!t.participants.has(target)) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'set_mod', reason: 'not_in_track' }); return; }
          ensureTrackParticipantMeta(t);
          const meta = t.participantMeta.get(target) || { isMod: false, muted: false, perms: 'edit', mode: 'edit' };
          meta.isMod = grant;
          t.participantMeta.set(target, meta);
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'set_mod', targetClientId: target, grant });
          if (target !== clientId) sendToClientId(target, { type: 'server_ack', ok: true, action: 'set_mod', targetClientId: target, grant });
          break;
        }

        case 'mute_all': {
          const trackId = m.trackId, mute = !!m.mute;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'mute_all', reason: 'no_track' }); return; }
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const allowed = (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'mute_all', reason: 'not_allowed' }); return; }
          t.muteAll = mute;
          broadcastToTrack(t, { type: 'server_ack', ok: true, action: 'mute_all', mute });
          break;
        }

        case 'mute': {
          const trackId = m.trackId, target = m.targetClientId, mute = !!m.mute;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'mute', reason: 'no_track' }); return; }
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const allowed = (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'mute', reason: 'not_allowed' }); return; }
          if (!t.participants.has(target)) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'mute', reason: 'not_in_track' }); return; }
          if (target === t.hostClientId) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'mute', reason: 'cannot_mute_host' }); return; }
          ensureTrackParticipantMeta(t);
          const tgtMeta = t.participantMeta.get(target) || { isMod: false, muted: false, perms: 'edit', mode: 'edit' };
          tgtMeta.muted = mute;
          t.participantMeta.set(target, tgtMeta);
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'mute', targetClientId: target, mute });
          if (target !== clientId) sendToClientId(target, { type: 'server_ack', ok: true, action: 'mute', targetClientId: target, mute });
          break;
        }

        case 'ban': {
          const trackId = m.trackId, target = m.targetClientId;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'ban', reason: 'no_track' }); return; }
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const allowed = (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'ban', reason: 'not_allowed' }); return; }
          if (!t.participants.has(target)) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'ban', reason: 'not_in_track' }); return; }
          if (target === t.hostClientId) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'ban', reason: 'cannot_ban_host' }); return; }
          t.banned.add(target);
          t.participants.delete(target);
          if (t.participantMeta) t.participantMeta.delete(target);
          sendToClientId(target, { type: 'kicked', targetClientId: target, by: clientId, trackId, reason: 'banned' });
          const tc = clientsById.get(target);
          if (tc && tc.currentTracks) tc.currentTracks.delete(trackId);
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'ban', targetClientId: target });
          break;
        }

        case 'permsall': {
          const trackId = m.trackId, perms = m.perms === 'view' ? 'view' : 'edit';
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'permsall', reason: 'no_track' }); return; }
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const allowed = (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'permsall', reason: 'not_allowed' }); return; }
          ensureTrackParticipantMeta(t);
          for (const cid of t.participants) {
            if (cid === t.hostClientId) continue;
            const pmeta = t.participantMeta.get(cid) || { isMod: false, muted: false, perms: 'edit', mode: 'edit' };
            pmeta.perms = perms;
            if (perms === 'view' && !pmeta.isMod && cid !== t.hostClientId) pmeta.mode = 'view';
            t.participantMeta.set(cid, pmeta);
          }
          sendParticipantsUpdate(t);
          broadcastToTrack(t, { type: 'server_ack', ok: true, action: 'permsall', perms });
          break;
        }

        case 'set_perms': {
          const trackId = m.trackId, target = m.targetClientId, perms = m.perms === 'view' ? 'view' : 'edit';
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'perms', reason: 'no_track' }); return; }
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const allowed = (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'perms', reason: 'not_allowed' }); return; }
          if (!t.participants.has(target)) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'perms', reason: 'not_in_track' }); return; }
          ensureTrackParticipantMeta(t);
          const tgtMeta = t.participantMeta.get(target) || { isMod: false, muted: false, perms: 'edit', mode: 'edit' };
          tgtMeta.perms = perms;
          if (perms === 'view' && !t.participantMeta.get(target).isMod && target !== t.hostClientId) tgtMeta.mode = 'view';
          t.participantMeta.set(target, tgtMeta);
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'perms', targetClientId: target });
          sendToClientId(target, { type: 'server_ack', ok: true, action: 'perms', targetClientId: target });
          break;
        }

        case 'set_mode': {
          const trackId = m.trackId, target = m.targetClientId || clientId, mode = (m.mode === 'view') ? 'view' : 'edit';
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'set_mode', reason: 'no_track' }); return; }
          const meta = t.participantMeta && t.participantMeta.get(clientId);
          const allowed = (target === clientId) || (t.hostClientId === clientId) || (meta && meta.isMod);
          if (!allowed) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'set_mode', reason: 'not_allowed' }); return; }
          ensureTrackParticipantMeta(t);
          const tgtMeta = t.participantMeta.get(target) || { isMod: false, muted: false, perms: 'edit', mode: 'edit' };
          tgtMeta.mode = mode;
          t.participantMeta.set(target, tgtMeta);
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'set_mode', targetClientId: target, mode });
          if (target !== clientId) sendToClientId(target, { type: 'server_ack', ok: true, action: 'set_mode', targetClientId: target, mode });
          break;
        }

        case 'update_track': {
          const trackId = m.trackId, settings = m.settings || {}, payload = m.payload || {};
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'update_track', reason: 'no_track' }); return; }
          if (t.hostClientId !== clientId) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'update_track', reason: 'not_host' }); return; }
          if (typeof payload.name !== 'undefined') t.name = payload.name;
          t.shareLayers = !!settings.shareLayers;
          sendParticipantsUpdate(t);
          sendToClientId(clientId, { type: 'server_ack', ok: true, action: 'update_track', trackId });
          break;
        }

        case 'request_location': {
          const targetClientId = m.targetClientId;
          sendToClientId(targetClientId, { type: 'request_location', requesterId: clientId, targetClientId });
          break;
        }

        case 'location': {
          const targetClientId = m.targetClientId, requesterId = m.requesterId, location = m.location;
          sendToClientId(requesterId, { type: 'location', location, targetClientId });
          break;
        }

        case 'request_tp': {
          const trackId = m.trackId;
          const t = tracks.get(trackId);
          if (!t) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'request_tp', reason: 'no_track' }); return; }
          if (t.hostClientId !== clientId) { sendToClientId(clientId, { type: 'server_ack', ok: false, action: 'request_tp', reason: 'not_host' }); return; }
          const targetClientId = m.targetClientId, location = m.location;
          sendToClientId(targetClientId, { type: 'request_tp', location, requesterId: clientId });
          break;
        }

        case 'ping': {
          sendToClientId(clientId, { type: 'pong', startTime: m.startTime });
          return;
        }

        default:
          break;
      }
    }

    function reset() {
      clientsById.clear();
      tracks.clear();
    }

    return { registerClient, unregisterClient, handleMessage, reset };
  })();

  /* ---------- WebRTC transport (manual copy/paste signaling, no server) ---------- */
  const RTC_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

  // Optional TURN relay (fixes connections STUN alone can't make: two
  // peers on the same network behind a router that doesn't support NAT
  // hairpinning or has AP/client isolation enabled, and symmetric NAT
  // across different networks). Leave blank to stay STUN-only, which still
  // works for plenty of network setups, just not all of them -- see the
  // P2P README. To enable it:
  //   1. Sign up free at https://www.expressturn.com (just email + a
  //      password -- no business info, no card for the free tier).
  //   2. Open the dashboard's "TURN Servers" panel; it shows a Username
  //      and Password (long-term credentials, static until you click
  //      "Refresh Credentials" -- don't refresh unless you want to
  //      invalidate the ones below).
  //   3. Paste them below. EXPRESSTURN_HOST is the server:port shown in
  //      that same panel -- 'free.expressturn.com:3478' is the documented
  //      default for the free tier, but double check yours matches.
  // Free tier: 1000GB/month, single region, TCP+UDP on port 3478 -- plenty
  // for this, since it's just line data and cursor positions, not video.
  const EXPRESSTURN_USERNAME = '000000002101518693';
  const EXPRESSTURN_PASSWORD = 'hFRq2KJpJAGqmMr14Z5wjpoAiKQ=';
  const EXPRESSTURN_HOST = 'free.expressturn.com:3478';

  function p2pGetIceServers() {
    if (!EXPRESSTURN_USERNAME || !EXPRESSTURN_PASSWORD) return RTC_ICE_SERVERS;
    return [
      ...RTC_ICE_SERVERS,
      {
        urls: [`turn:${EXPRESSTURN_HOST}`, `turn:${EXPRESSTURN_HOST}?transport=tcp`],
        username: EXPRESSTURN_USERNAME,
        credential: EXPRESSTURN_PASSWORD
      }
    ];
  }

  function p2pWaitForIce(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onChange);
      setTimeout(resolve, 10000); // don't hang forever if gathering stalls
    });
  }
  // Codes are gzip-compressed before base64 when the browser supports it
  // (most SDP bulk is repetitive candidate/header text that compresses
  // well) -- shortens the copy-paste blob noticeably, especially now that
  // TURN adds an extra relay candidate. Falls back to plain base64 if
  // CompressionStream isn't available, and decode understands both.
  async function p2pEncode(desc) {
    const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
    if (window.CompressionStream) {
      try {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(new TextEncoder().encode(json));
        writer.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return 'gz1:' + btoa(binary);
      } catch (e) { /* fall through to uncompressed */ }
    }
    return 'raw1:' + btoa(unescape(encodeURIComponent(json)));
  }
  async function p2pDecode(code) {
    const trimmed = code.trim().replace(/\s+/g, '');
    if (trimmed.startsWith('gz1:')) {
      const binary = atob(trimmed.slice(4));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const buf = await new Response(ds.readable).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(buf));
    }
    if (trimmed.startsWith('raw1:')) {
      return JSON.parse(decodeURIComponent(escape(atob(trimmed.slice(5)))));
    }
    return JSON.parse(decodeURIComponent(escape(atob(trimmed)))); // backward compat: codes from before this change
  }
  // Summarize what kind of ICE candidates actually got gathered, so a stuck
  // connection is diagnosable instead of a silent black box: no candidates
  // beyond "host" usually means the STUN servers weren't reachable (network
  // policy blocking outbound STUN), which makes a direct P2P connection
  // across two different networks unlikely to succeed.
  function p2pCandidateSummary(pc) {
    try {
      const sdp = (pc.localDescription && pc.localDescription.sdp) || '';
      const counts = {};
      const re = /a=candidate:\S+ \d+ \S+ \d+ \S+ \d+ typ (\w+)/g;
      let m;
      while ((m = re.exec(sdp))) counts[m[1]] = (counts[m[1]] || 0) + 1;
      const parts = Object.keys(counts).map(k => `${k}:${counts[k]}`);
      return parts.length ? parts.join(', ') : '(no candidates gathered)';
    } catch (e) { return '(unknown)'; }
  }
  // Reports live status via onStatus('checking'|'connected'|'failed', diagString)
  // as it happens -- and again, once, if still not connected after a fairly
  // generous grace period (this does NOT tear anything down or declare the
  // attempt dead; ICE checks can legitimately keep going well past this,
  // especially since a human copy-pasting the other half of the code in
  // between is part of the normal flow here, not an error condition).
  function p2pWatchConnection(pc, onStatus) {
    let cancelled = false;
    const report = () => {
      if (cancelled) return;
      const state = pc.connectionState || pc.iceConnectionState;
      const diag = `ice=${pc.iceConnectionState} conn=${pc.connectionState || 'n/a'} candidates=${p2pCandidateSummary(pc)}`;
      if (state === 'connected' || state === 'completed') onStatus('connected', diag);
      else if (state === 'failed') onStatus('failed', diag);
      else onStatus('checking', diag);
    };
    pc.addEventListener('connectionstatechange', report);
    pc.addEventListener('iceconnectionstatechange', report);
    const slowTimer = setTimeout(() => { if (!cancelled) report(); }, 15000);
    report();
    return () => { cancelled = true; clearTimeout(slowTimer); pc.removeEventListener('connectionstatechange', report); pc.removeEventListener('iceconnectionstatechange', report); };
  }

  const P2P = (() => {
    let mode = null; // 'host' | 'guest' | null
    const pendingInvites = new Map(); // inviteId (local/ephemeral, UI bookkeeping only) -> { pc, channel, watch: {cancel} }
    const activePeers = new Map();    // guest's real CLIENT_ID -> { pc, channel }, once identified
    let guestPc = null;
    let guestChannel = null;
    let outboundQueue = [];

    function ready() {
      document.dispatchEvent(new CustomEvent('lrmp_transport_ready'));
    }
    function closed() {
      document.dispatchEvent(new CustomEvent('lrmp_ws_closed', { detail: { url: '(p2p)' } }));
    }

    // The host can't know a guest's real (persistent, localStorage-backed)
    // CLIENT_ID until after the data channel is open -- SDP offer/answer
    // exchange happens before that. So instead of the host inventing an id
    // for the guest (which would desync every "is this me" check the rest
    // of the client does against its own CLIENT_ID), the guest announces
    // its real id as the very first message the instant the channel opens,
    // and the host only registers the connection with HostEngine once that
    // arrives -- mirroring how the real server keys clients off the
    // client-supplied ?client= query param.
    function wireHostChannel(pc, channel, inviteId, watchState) {
      let realClientId = null;
      channel.addEventListener('message', (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!realClientId) {
          if (m && m.type === '_p2p_hello' && m.clientId) {
            realClientId = m.clientId;
            if (watchState && watchState.cancel) watchState.cancel();
            pendingInvites.delete(inviteId);
            activePeers.set(realClientId, { pc, channel });
            HostEngine.registerClient(realClientId, (obj) => { try { channel.send(JSON.stringify(obj)); } catch (e) {} });
            document.dispatchEvent(new CustomEvent('lrmp_p2p_peer_connected', { detail: { inviteId, clientId: realClientId } }));
          }
          return; // never forward the handshake message itself into the engine
        }
        HostEngine.handleMessage(realClientId, m);
      });
      channel.addEventListener('close', () => {
        if (realClientId) { HostEngine.unregisterClient(realClientId); activePeers.delete(realClientId); }
      });
    }

    // Host side: call once to become the session authority (registers the
    // host's own client into the engine via a local loopback "connection").
    function hostBegin() {
      mode = 'host';
      HostEngine.reset();
      HostEngine.registerClient(CLIENT_ID, (obj) => { setTimeout(() => { try { processServerMessage(obj); } catch (e) {} }, 0); });
      window.LRMP._wsSend = (obj) => { setTimeout(() => { try { HostEngine.handleMessage(CLIENT_ID, obj); } catch (e) {} }, 0); };
      window.LRMP._wsOpen = true;
      ready();
    }

    // Host side: create an invite code for one additional guest.
    async function hostCreateInvite() {
      const inviteId = hostUid('invite-');
      const iceServers = p2pGetIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      const channel = pc.createDataChannel('lrmp');
      const watchState = { cancel: null };
      wireHostChannel(pc, channel, inviteId, watchState);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await p2pWaitForIce(pc);
      pendingInvites.set(inviteId, { pc, channel, watchState });
      return { guestClientId: inviteId, code: await p2pEncode(pc.localDescription) };
    }

    // Host side: consume the guest's answer code to finish that connection.
    async function hostAcceptAnswer(inviteId, answerCode) {
      const entry = pendingInvites.get(inviteId);
      if (!entry) throw new Error('No pending invite for that code (generate a new one).');
      const answer = await p2pDecode(answerCode);
      await entry.pc.setRemoteDescription(answer);
      // Only start watching for stuck/failed *now* -- this is the earliest
      // point both sides of the SDP exchange are actually done, so it's the
      // right moment to start judging connectivity rather than human speed.
      // Deliberately NOT removed from pendingInvites yet: it stays there
      // (still connecting) until it either succeeds (wireHostChannel moves
      // it to activePeers) or the person cancels it -- otherwise a stuck
      // attempt would be unreachable to actually close if cancelled.
      entry.watchState.cancel = p2pWatchConnection(entry.pc, (status, diag) => {
        document.dispatchEvent(new CustomEvent('lrmp_p2p_invite_status', { detail: { inviteId, status, diag } }));
      });
    }

    // Host side: abandon a pending invite (before or after the answer was
    // submitted) and actually close its peer connection, instead of just
    // hiding it in the UI and leaving it running in the background.
    function cancelInvite(inviteId) {
      const entry = pendingInvites.get(inviteId);
      if (!entry) return;
      if (entry.watchState && entry.watchState.cancel) entry.watchState.cancel();
      try { entry.channel.close(); } catch (e) {}
      try { entry.pc.close(); } catch (e) {}
      pendingInvites.delete(inviteId);
    }

    // Guest side: consume the host's offer code, produce an answer code.
    async function guestAcceptOffer(offerCode) {
      mode = 'guest';
      const iceServers = p2pGetIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      guestPc = pc;

      // Register this now, but don't wait on it: the data channel can't
      // actually arrive until the host has our answer code and applies it
      // (hostAcceptAnswer), which can't happen until *this* function
      // returns that code. Blocking the return on the channel here would
      // deadlock -- which is exactly what was causing "Connecting..." to
      // hang forever with no answer code ever shown.
      pc.addEventListener('datachannel', (ev) => {
        const channel = ev.channel;
        guestChannel = channel;

        channel.addEventListener('open', () => {
          if (cancelGuestWatch) cancelGuestWatch();
          // Announce our real, persistent client id before anything else so
          // the host registers this connection under the same id every other
          // part of the client already uses for "is this me" comparisons.
          try { channel.send(JSON.stringify({ type: '_p2p_hello', clientId: CLIENT_ID })); } catch (e) {}

          window.LRMP._wsOpen = true;
          window.LRMP._wsSend = (obj) => {
            try {
              const s = JSON.stringify(obj);
              if (channel.readyState !== 'open') { outboundQueue.push(s); return; }
              channel.send(s);
            } catch (e) { outboundQueue.push(JSON.stringify(obj)); }
          };
          setTimeout(() => { while (outboundQueue.length && channel.readyState === 'open') { try { channel.send(outboundQueue.shift()); } catch (e) { break; } } }, 50);
          ready();
        });
        channel.addEventListener('message', (ev2) => {
          try { processServerMessage(JSON.parse(ev2.data)); } catch (e) {}
        });
        channel.addEventListener('close', () => { window.LRMP._wsOpen = false; closed(); });
      });

      const offer = await p2pDecode(offerCode);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await p2pWaitForIce(pc);

      // Guest already has BOTH descriptions applied at this point (unlike
      // the host, who's still waiting on a human to paste the answer back),
      // so its ICE agent starts trying immediately -- one-sidedly, since the
      // host hasn't caught up yet. That's expected and not itself a failure;
      // report live status so the UI can show real progress either way.
      const cancelGuestWatch = p2pWatchConnection(pc, (status, diag) => {
        document.dispatchEvent(new CustomEvent('lrmp_p2p_guest_status', { detail: { status, diag } }));
      });

      return await p2pEncode(pc.localDescription); // channel wiring above fires later, async
    }

    function teardown() {
      for (const { pc, channel, watchState } of pendingInvites.values()) { if (watchState && watchState.cancel) watchState.cancel(); try { channel.close(); } catch (e) {} try { pc.close(); } catch (e) {} }
      pendingInvites.clear();
      for (const { pc, channel } of activePeers.values()) { try { channel.close(); } catch (e) {} try { pc.close(); } catch (e) {} }
      activePeers.clear();
      if (guestChannel) try { guestChannel.close(); } catch (e) {}
      if (guestPc) try { guestPc.close(); } catch (e) {}
      guestChannel = null; guestPc = null;
      HostEngine.reset();
      outboundQueue = [];
      mode = null;
    }

    return { hostBegin, hostCreateInvite, hostAcceptAnswer, cancelInvite, guestAcceptOffer, teardown, get mode() { return mode; } };
  })();

  window.LRMP._P2P = P2P; // exposed for debugging / the connect-mode UI below


  /* ---------- Networking helpers ---------- */
let ws = null;
let pending = [];
window.LRMP._wsOpen = false;

const url = 'wss://lr-multiplayer.duckdns.org/ws?client=' + encodeURIComponent(CLIENT_ID);

function connectWS(cb) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (cb) cb(true);
    return;
  }

  try {
    ws = new WebSocket(url);
  } catch (e) {
    if (cb) cb(false);
    return;
  }

  const timer = setTimeout(() => {
    if (!window.LRMP._wsOpen) {
      try { ws.close(); } catch(e){}
      if (cb) cb(false);
    }
  }, 3500);

  ws.addEventListener('open', () => {
    clearTimeout(timer);
    window.LRMP._wsOpen = true;
    establishWS(ws, url);
    if (cb) cb(true);
  });

  ws.addEventListener('error', () => {
    clearTimeout(timer);
    try { ws.close(); } catch(e){}
    if (cb) cb(false);
  });
}

  function establishWS(sock, urlStr) {
    if (!sock) return;
    sock.addEventListener('message', (ev) => {
      try {
        const m = JSON.parse(ev.data);
        processServerMessage(m);
      } catch (e) { console.warn('lrmp: bad ws payload', e); }
    });
    sock.addEventListener('close', () => {
      ws = null; window.LRMP._wsOpen = false;
      document.dispatchEvent(new CustomEvent('lrmp_ws_closed', { detail: { url: urlStr } }));
    });
    sock.addEventListener('open', () => {
      document.dispatchEvent(new CustomEvent('lrmp_ws_open', { detail: { url: urlStr } }));
    });
    sock.addEventListener('error', () => {});

    window.LRMP._wsSend = (obj) => {
      try {
        const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
        if (!sock || sock.readyState !== WebSocket.OPEN) { pending.push(s); return; }
        sock.send(s);
      } catch (e) { pending.push(JSON.stringify(obj)); }
    };

    // flush pending
    setTimeout(() => {
      while (pending.length && sock && sock.readyState === WebSocket.OPEN) {
        try { sock.send(pending.shift()); } catch (e) { break; }
      }
    }, 50);
  }

// ==================== send command changes ====================
  const commandFunctions = [
    "createZoomer",
    "createTimeRemapper",
    "createFocuser",
    "createBoundsPanner",
    "createLayerAutomator"
  ];

  window.LRMP = window.LRMP || {};
  window.LRMP._command_apply_count = window.LRMP._command_apply_count || 0;

  function serializeArgs(args) {
    try {
      return JSON.stringify(args);
    } catch (e) {
      return "[" + Array.from(args).map(a => String(a)).join(",") + "]";
    }
  }

  // installer
  function installCommandMirrors() {
    if (!window.LRMP) window.LRMP = {};
    if (window.LRMP._commandMirrorsInstalled) return;
    window.LRMP._commandMirrorsInstalled = true;
    window.LRMP._commandMirrorEntries = window.LRMP._commandMirrorEntries || [];

    commandFunctions.forEach(fnName => {
      try {
        if (typeof window[fnName] !== "function") {
          console.warn(`LRMP: command ${fnName} not found`);
          return;
        }

        const original = window[fnName];
        if (original && original.__isMirrored) return; // already wrapped elsewhere

        function wrapped(...args) {
          const result = original.apply(this, args);

          try {
            let argsToSend;
            if (typeof structuredClone === "function") {
              argsToSend = structuredClone(args);
            } else {
              argsToSend = JSON.parse(JSON.stringify(args));
            }

            if (!(window.LRMP._engine_apply_count > 0) && (window.LRMP?.active && window.LRMP?.currentTrackId)) {
              window.LRMP._wsSend({
                type: "request_command_changes",
                clientId: typeof CLIENT_ID !== "undefined" ? CLIENT_ID : null,
                trackId: window.LRMP.currentTrackId,
                function: fnName,
                args: argsToSend
              });
            }
          } catch (err) {
            console.error("LRMP mirror send failed:", err);
          }

          return result;
        }

        wrapped.__isMirrored = true;
        wrapped.__original = original;

        // install and record so uninstall can restore
        window[fnName] = wrapped;
        window.LRMP._commandMirrorEntries.push({ name: fnName, original });
      } catch (e) {
        console.warn("installCommandMirrors error for", fnName, e);
      }
    });
  };

  // uninstaller (restore originals)
  function uninstallCommandMirrors() {
    if (!window.LRMP?._commandMirrorEntries || !window.LRMP._commandMirrorEntries.length) {
      window.LRMP._commandMirrorsInstalled = false;
      return;
    }
    for (const entry of window.LRMP._commandMirrorEntries.slice()) {
      const { name, original } = entry;
      try {
        if (typeof window[name] === "function" && window[name].__isMirrored && window[name].__original === original) {
          window[name] = original;
        }
      } catch (e) { /* ignore */ }
    }
    window.LRMP._commandMirrorEntries = [];
    window.LRMP._commandMirrorsInstalled = false;
  };


// ==================== send lines, layers, and riders track changes ====================

  const FUNCTIONS = [
    'withFolderAdded','withFolderMoved','withFolderRemoved','withFolderRenamed',
    'withLayerAdded','withLayerCopied','withLayerMoved','withLayerRemoved','withLayerRenamed',
    'withLayers','withLinesAdded','withLinesRemoved','withRidersChanged',
    'withFolderEditableChanged','withFolderVisibilityChanged','withLayerEditableChanged','withLayerVisibilityChanged'
  ];

  window.LRMP = window.LRMP || {};
  window.LRMP._engine_apply_count = window.LRMP._engine_apply_count || 0;

  // ---------------- helpers ----------------
  function serializeArg(a) {
    if (a === undefined) return 'undefined';
    if (a === null) return 'null';
    if (typeof a === 'string') return JSON.stringify(a);
    if (typeof a === 'number' || typeof a === 'boolean') return String(a);
    try { return JSON.stringify(a); } catch { return '"[unserializable]"'; }
  }

  function snapshot(v) {
    if (Array.isArray(v)) return v.slice();
    if (v instanceof Set) return Array.from(v);
    if (v && typeof v === 'object') return Object.assign({}, v);
    return v;
  }

  function prepareFunctions(fns) {
    const fnsToSend = [];
    const eng2 = window.store.getState().simulator.engine;
    // console.log("engine changes to send:", fns);
    for (const fn of fns) {
      const name = fn.name;
      const args = fn.args;

      if (name === 'withLinesAdded') {

        const arr = Array.isArray(args[0]) ? args[0] : [args[0]];

        const mapped = arr.filter(x => x?.p1 && x?.p2).map(l => {
          const remappedId = resolveCollisionId(l.id);
          return {
            x1: l.p1.x, y1: l.p1.y,
            x2: l.p2.x, y2: l.p2.y,
            id: remappedId,
            layer: l.layer,
            type: l.type,
            leftExtended: l.leftExtended,
            rightExtended: l.rightExtended,
            flipped: l.flipped,
            multiplier: l.multiplier,
            width: l.width,
            added: (l.added || l.changed)
            ? l.added
            : eng2.getLine(remappedId) ? null : true,
          };
        });
        fnsToSend.push({ linesToRemove: null, linesToAdd: mapped });
      }
      else if (name === 'withLinesRemoved') {
        const first = args[0];
        const linesToRemove =
              first instanceof Set ? Array.from(first) :
        Array.isArray(first) ? first :
        null;

        fnsToSend.push({
          linesToRemove: Array.isArray(linesToRemove)
            ? linesToRemove.map(id => resolveCollisionId(id))
            : linesToRemove,
          linesToAdd: null
        });
      }
      else {
        const fnStr = `${name}(${args.map(serializeArg).join(',')})`;
        fnsToSend.push(fnStr);
      }
    }
    return fnsToSend;
  }

  // ---------------- add to custom undo/redo history ----------------
  function addToHistory(name, args) {
    if (!window.LRMP?.active || !window.LRMP?.currentTrackId) return;
    if (window.LRMP._engine_apply_count > 0) return;
    window.LRMP.historyUncommitted = true;
    const eng = window.store.getState().simulator.engine;

    try {
      const history = window.LRMP.history;
      const ind = window.LRMP.historyIndex;
      const hi = history[ind];

      hi.redo.push({
        name,
        args
      })
      let undoName, undoArgs;

      if (name === 'withLinesAdded') {
        const changed = [];
        const removed = [];

        for (const line of args[0]) {
          const prevLine = eng.getLine(line.id);
          if (prevLine) { // changed line
            prevLine.changed = true;
            changed.push(prevLine);
          } else { // remove line
            removed.push(line.id);
          }
        }
        if (changed.length > 0) {
          hi.undo.push({
            name: 'withLinesAdded',
            args: [changed]
          })
        }
        if (removed.length > 0) {
          hi.undo.push({
            name: 'withLinesRemoved',
            args: [removed]
          })
        }
        return;
      }
      if (name === 'withLinesRemoved') {
        const added = [];
        for (const id of args[0]) {
          const prevLine = eng.getLine(id);
          prevLine.added = true;
          added.push(prevLine)
        }
        hi.undo.push({
          name: 'withLinesAdded',
          args: [added]
        })
        return;
      } else if (name === 'withFolderAdded') {
        const id = eng.engine.state.layers.toArray().length;
        hi.undo.push({name: 'withFolderRemoved', args: [id]})

      } else if (name === 'withFolderRemoved') {
        const layers = eng.engine.state.layers.toArray();
        const folderInd = layers.findIndex(l => l.id === args[0]);

        hi.undo.push({name: 'withFolderAdded', args: [layers[folderInd].name]});
        hi.undo.push({name: 'withFolderMoved', args: [folderInd]});

      } else if (name === 'withLayerAdded') {
        const id = eng.engine.state.layers.toArray().length;
        hi.undo.push({name: 'withLayerRemoved', args: [id]})

      } else if (name === 'withLayerRemoved') {
        const layers = eng.engine.state.layers.toArray();
        const layerInd = layers.findIndex(l => l.id === args[0]);

        hi.undo.push({name: 'withLayerAdded', args: [layers[layerInd].name]});
        hi.undo.push({name: 'withLayerMoved', args: [layerInd]});

      } else if (name === 'withLayerRenamed') {
        const id = args[0];
        const layers = eng.engine.state.layers.toArray();
        const layer = layers.find(l => l.id === id);
        hi.undo.push({name, args: [id, layer.name]});

      } else if (name === 'withLayerMoved') {
        const id = args[0];
        const layers = eng.engine.state.layers.toArray();
        const layerInd = layers.findIndex(l => l.id === id);
        hi.undo.push({name, args: [id, layerInd]});

      } else if (name === 'withLayerCopied') { // i dont care

      } else if (name === 'withFolderRenamed') {
        const id = args[0];
        const layers = eng.engine.state.layers.toArray();
        const folder = layers.find(l => l.id === id);
        hi.undo.push({name, args: [id, folder.name]});

      } else if (name === 'withFolderMoved') {
        const id = args[0];
        const layers = eng.engine.state.layers.toArray();
        const folderInd = layers.findIndex(l => l.id === id);
        hi.undo.push({name, args: [id, folderInd]});

      } else if (name === 'withRidersChanged') {
        const riders = eng.engine.state.riders;
        hi.undo.push({name, args: [riders]});

      } else if (name === 'withLayers') {
        hi.undo.push({name, args});
      }
/*notes:
- missing withLayerEditableChanged, withLayerVisibilityChanged, etc.
- withRidersChanged sets all riders instead of just 1 so you can't move one, another person moves one, and then undo just your change
- layers will wrongly be added/not be added into folders
- smth with layers is broken
*/
    } catch (e) {console.warn("addToHistory error:", e)}
  }

  // ---------------- on undo/redo/commitTrackChanges/revertTrackChanges ----------------
  window.LRMP.onUndo = () => {
    if (!window.LRMP?.active || !window.LRMP?.currentTrackId) return;

    const { history, historyIndex } = window.LRMP;
    const prevEntry = history[historyIndex - 1];

    if (window.LRMP.historyUncommitted) { console.log("cannot undo bc there are uncommitted changes"); return;}
    if (historyIndex === 0) { console.log("cannot undo bc there is nothing to undo"); return;}

    // remove colliding ids from the undo array and the LRMP.collidingIds set
    const collidingIds = window.LRMP.collidingIds || new Set();
    window.LRMP.collidingIdsRemoved = window.LRMP.collidingIdsRemoved || new Set();

    if (collidingIds.size > 0 && prevEntry.undo) {
      prevEntry.undo.forEach(action => {
        if (action.name === 'withLinesRemoved' && Array.isArray(action.args[0])) {

          action.args[0] = action.args[0].filter(rid => {
            if (collidingIds.has(rid)) {
              // If the ID is a collision, remove it from the Set and the Array, and add to collidingIdsRemoved
              collidingIds.delete(rid);
              window.LRMP.collidingIdsRemoved.add(rid);
              return false; // Remove from array
            }
            return true; // Keep in array
          });
        }
      });
    }

    const fns = prepareFunctions(prevEntry.undo.slice().reverse());
    sendFunctions(fns); // undo changes in reverse order
    window.LRMP.runEngineFunctions(fns) // run locally too bc im replacing normal undo/redo

    // commit
    window.LRMP._engine_apply_count = (window.LRMP._engine_apply_count || 0) + 1;
    window.store.dispatch({ type: "COMMIT_TRACK_CHANGES" });
    window.LRMP._engine_apply_count = Math.max(0, (window.LRMP._engine_apply_count || 1) - 1);

    window.LRMP.historyIndex = window.LRMP.historyIndex - 1;
  }

  window.LRMP.onRedo = () => {
    if (!window.LRMP?.active || !window.LRMP?.currentTrackId) return;
    const history = window.LRMP.history;
    const ind = window.LRMP.historyIndex;
    if (history[ind].redo.length === 0) { console.log("cannot redo bc there is nothing to redo"); return;}

    const fns = prepareFunctions(history[ind].redo);
    sendFunctions(fns);
    window.LRMP.runEngineFunctions(fns)

    // commit
    window.LRMP._engine_apply_count = (window.LRMP._engine_apply_count || 0) + 1;
    window.store.dispatch({ type: "COMMIT_TRACK_CHANGES" });
    window.LRMP._engine_apply_count = Math.max(0, (window.LRMP._engine_apply_count || 1) - 1);

    window.LRMP.historyIndex = window.LRMP.historyIndex + 1;

    //console.log("running redo - history:", history);
  }

  window.LRMP.onCommitTrackChanges = () => {
    if (!window.LRMP?.active || !window.LRMP?.currentTrackId) return;

    // commit
    window.LRMP._engine_apply_count = (window.LRMP._engine_apply_count || 0) + 1;
    window.store.dispatch({ type: "COMMIT_TRACK_CHANGES" });
    window.LRMP._engine_apply_count = Math.max(0, (window.LRMP._engine_apply_count || 1) - 1);

    window.LRMP.historyIndex = window.LRMP.historyIndex + 1; // increase by 1

    window.LRMP.history.splice(window.LRMP.historyIndex);
    window.LRMP.history[window.LRMP.historyIndex] = {undo: [], redo: []};

    window.LRMP.historyUncommitted = false;

    //console.log("running commitTrackChanges - history:", window.LRMP.history);
  }

  window.LRMP.onRevertTrackChanges = () => {
    if (!window.LRMP?.active || !window.LRMP?.currentTrackId) return;
    const { history, historyIndex } = window.LRMP;
    const currentEntry = history[historyIndex];
    if (currentEntry.redo.length === 0) { console.log("cannot revert bc there is nothing to revert"); return;}
    window.LRMP.historyUncommitted = false;

    // remove colliding ids from the undo array and the LRMP.collidingIds set
    const collidingIds = window.LRMP.collidingIds || new Set();
    window.LRMP.collidingIdsRemoved = window.LRMP.collidingIdsRemoved || new Set();

    if (collidingIds.size > 0 && currentEntry.undo) {
      currentEntry.undo.forEach(action => {
        if (action.name === 'withLinesRemoved' && Array.isArray(action.args[0])) {

          action.args[0] = action.args[0].filter(rid => {
            if (collidingIds.has(rid)) {
              // If the ID is a collision, remove it from the Set and the Array, and add to collidingIdsRemoved
              collidingIds.delete(rid);
              window.LRMP.collidingIdsRemoved.add(rid);
              return false; // Remove from array
            }
            return true; // Keep in array
          });
        }
      });
    }

    const fns = prepareFunctions(currentEntry.undo.slice().reverse());

    window.LRMP.fnsToRevert = fns
    window.LRMP.runEngineFunctions(fns);

    currentEntry.undo = [];
    currentEntry.redo = [];

    setTimeout(() => {
      if (window.LRMP.fnsToRevert.length > 0) {
        sendFunctions(window.LRMP.fnsToRevert);
        console.warn("fail ish");
      }
    }, 0);
  }

  // ---------------- sender ----------------
  function sendEngineChanges(fns) {
    const fnsToSend = prepareFunctions(fns);
    sendFunctions(fnsToSend);
    }

  function sendFunctions(fnsToSend) {
    if (window.LRMP._engine_apply_count > 0) return;
    if (!window.LRMP?.active || !window.LRMP?.currentTrackId) return;
    if (window.LRMP.VIEW_MODE.isEnabled()) return;

    window.LRMP._wsSend({
      type: 'request_engine_changes',
      clientId: typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : null,
      trackId: window.LRMP.currentTrackId,
      functions: [...(window.LRMP?.fnsToRevert ?? []), ...fnsToSend]
    });
    window.LRMP.fnsToRevert = [];
  }

  // ---------------- prototype wrapping helpers ----------------
  function wrapEnginePrototypeAndInstancesRecord(entries) {
    return function wrapEnginePrototype(engine) {
      if (!engine) return;

      const proto = Object.getPrototypeOf(engine);
      if (!proto) return;

      // wrap direct properties on engine
      FUNCTIONS.forEach(name => {
        try {
          const original = engine[name];
          if (typeof original !== 'function') return;
          // avoid double-wrap
          if (original.__lrmp_wrapped) return;
          const wrapped = function () {
            const args = Array.from(arguments).map(snapshot);
            if (!window.LRMP.active) return original.apply(this, arguments);
            if (!window.LRMP.shareLayers && (name === 'withFolderEditableChanged' || name === 'withFolderVisibilityChanged' || name === 'withLayerEditableChanged' || name === 'withLayerVisibilityChanged')) return original.apply(this, arguments);
            addToHistory(name, args);
            sendEngineChanges([{name, args}]);
            return original.apply(this, arguments);
          };
          wrapped.__lrmp_wrapped = true;
          wrapped.__lrmp_original = original;
          engine[name] = wrapped;
          entries.push({ obj: engine, name, original });
        } catch (e) { /* ignore */ }
      });

      // wrap on prototype too
      FUNCTIONS.forEach(name => {
        try {
          const original = proto[name];
          if (typeof original !== 'function') return;
          if (original.__lrmp_wrapped) return;
          const wrapped = function () {
            const args = Array.from(arguments).map(snapshot);
            if (!window.LRMP.active) return original.apply(this, arguments);
            if (!window.LRMP.shareLayers && (name === 'withFolderEditableChanged' || name === 'withFolderVisibilityChanged' || name === 'withLayerEditableChanged' || name === 'withLayerVisibilityChanged')) return original.apply(this, arguments);
            addToHistory(name, args);
            sendEngineChanges([{name, args}]);
            return original.apply(this, arguments);
          };
          wrapped.__lrmp_wrapped = true;
          wrapped.__lrmp_original = original;
          proto[name] = wrapped;
          entries.push({ obj: proto, name, original });
        } catch (e) { /* ignore */ }
      });
    };
  }

  // ---------------- installer / uninstaller ----------------
  function installEngineMirrors() {
    if (!window.LRMP) window.LRMP = {};
    if (window.LRMP._engineMirrorsInstalled) return;
    window.LRMP._engineMirrorsInstalled = true;
    window.LRMP._engineWrappedEntries = window.LRMP._engineWrappedEntries || [];

    // tryInstall will wrap current engines and handle later ones via subscribe
    const entries = window.LRMP._engineWrappedEntries;
    const wrapFn = wrapEnginePrototypeAndInstancesRecord(entries);

    function tryInstall() {
      try {
        const state = window.store?.getState?.();
        const engine = state?.simulator?.engine;
        if (!engine) return;
        wrapFn(engine.engine);
      } catch (e) { /* ignore */ }
    }

    // subscribe to keep the cache and catch late engines
    try {
      if (window.store && typeof window.store.getState === 'function' && typeof window.store.subscribe === 'function') {
        // capture unsubscribe if returned
        try {
          const unsub = window.store.subscribe(tryInstall);
          window.LRMP._engine_store_unsub = typeof unsub === 'function' ? unsub : null;
        } catch (e) {
          window.LRMP._engine_store_unsub = null;
        }
        // initial run
        tryInstall();
      } else {
        tryInstall();
      }
    } catch (e) { console.warn("installEngineMirrors subscribe error:", e); }
  };

  function uninstallEngineMirrors() {
    // restore entries
    try {
      const entries = window.LRMP._engineWrappedEntries || [];
      for (const e of entries.slice()) {
        try {
          const { obj, name, original } = e;
          if (!obj) continue;
          if (obj[name] && obj[name].__lrmp_wrapped && obj[name].__lrmp_original === original) {
            obj[name] = original;
          }
        } catch (ex) { /* ignore */ }
      }
      window.LRMP._engineWrappedEntries = [];
      // unsubscribe store listener if available
      try {
        if (typeof window.LRMP._engine_store_unsub === 'function') {
          window.LRMP._engine_store_unsub();
        }
      } catch (e) {}
    } catch (e) { /* ignore */ }
    window.LRMP._engineMirrorsInstalled = false;
  };

/* ==================== undo, redo, commitTrackChanges, and revertTrackChanges detection ==================== */

// LRMP detector: intercept calls where function.name === "f", prevent running f, and call LRMP handlers instead
// If window.LRMP._engine_apply_count > 0, run the original f instead of intercepting.

  window.LRMP = window.LRMP || {};

  if (window.LRMP.__dispatchDetector) return;
  window.LRMP.__dispatchDetector = true;

  const TARGET = new Set(["REVERT_TRACK_CHANGES", "COMMIT_TRACK_CHANGES", "UNDO", "REDO"]);

  let installed = false;
  let origCall = null;
  let origApply = null;

  function looksLikeTargetAction(obj) {
    try { return obj && typeof obj === 'object' && typeof obj.type === 'string' && TARGET.has(obj.type); } catch (_) { return false; }
  }

  function shouldAllowEngineApply() {
    try {
      return !!(window.LRMP && Number(window.LRMP._engine_apply_count) > 0);
    } catch (_) {
      return false;
    }
  }

  function callLRMPHandlers(action) {
    try {
      if (!action || typeof action.type !== 'string') return;
      const t = action.type;
      try {
        if (t === 'UNDO' && typeof window.LRMP.onUndo === 'function') window.LRMP.onUndo(action);
        else if (t === 'REDO' && typeof window.LRMP.onRedo === 'function') window.LRMP.onRedo(action);
        else if (t === 'REVERT_TRACK_CHANGES' && typeof window.LRMP.onRevertTrackChanges === 'function') window.LRMP.onRevertTrackChanges(action);
        else if (t === 'COMMIT_TRACK_CHANGES' && typeof window.LRMP.onCommitTrackChanges === 'function') window.LRMP.onCommitTrackChanges(action);
      } catch (e) {
        console.error('[LRMP detector] handler threw', e);
      }
      try { console.info('[LRMP detector] intercepted', t); } catch (_) {}
    } catch (e) { /* ignore */ }
  }

  function installWrappers() {
    if (origCall || origApply) return;
    origCall = Function.prototype.call;
    origApply = Function.prototype.apply;

    Function.prototype.call = function (thisArg, ...args) {
      try {
        const fn = this;
        // Only consider intercepting if function.name === 'f' and first arg is a target action
        if (fn && typeof fn === 'function' && fn.name === 'f' && looksLikeTargetAction(args[0])) {
          // If engine_apply_count > 0, allow original f to run
          if (shouldAllowEngineApply()) {
            return Reflect.apply(this, thisArg, args);
          }
          // Otherwise, intercept: do not run original f; call LRMP handlers instead
          try { callLRMPHandlers(args[0]); } catch (e) { console.error('[LRMP detector] notify error', e); }
          // Return a safe predictable value (return the action object)
          return args[0];
        }
      } catch (e) {
        try { console.error('[LRMP detector] call-detect error', e); } catch (_) {}
      }
      // Default: behave like original
      return Reflect.apply(this, thisArg, args);
    };

    Function.prototype.apply = function (thisArg, argsArray) {
      try {
        const fn = this;
        const firstArg = argsArray && argsArray[0];
        if (fn && typeof fn === 'function' && fn.name === 'f' && looksLikeTargetAction(firstArg)) {
          if (shouldAllowEngineApply()) {
            return Reflect.apply(this, thisArg, argsArray || []);
          }
          try { callLRMPHandlers(firstArg); } catch (e) { console.error('[LRMP detector] notify error', e); }
          return firstArg;
        }
      } catch (e) {
        try { console.error('[LRMP detector] apply-detect error', e); } catch (_) {}
      }
      return Reflect.apply(this, thisArg, argsArray || []);
    };

    console.debug('[LRMP detector] installed call/apply wrappers (intercepting function.name === "f")');
  }

  function uninstallWrappers() {
    try {
      if (origCall) Function.prototype.call = origCall;
      if (origApply) Function.prototype.apply = origApply;
    } catch (e) {
      console.error('[LRMP detector] uninstall error', e);
    } finally {
      origCall = null;
      origApply = null;
      console.debug('[LRMP detector] restored call/apply originals');
    }
  }

  function installDispatchDetector() {
    if (installed) return;
    installed = true;
    installWrappers();
    console.info('[LRMP detector] installed');
  }

  function uninstallDispatchDetector() {
    if (!installed) return;
    installed = false;
    uninstallWrappers();
    console.info('[LRMP detector] uninstalled');
  }

  /* ==================== view mode ==================== */

(function () {
  'use strict';

  // Initialize namespace
  window.LRMP = window.LRMP || {};

  // shared global state
  window.LRMP.__view_mode__ = window.LRMP.__view_mode__ || {
    _enabled: false,
    _intervalId: null,
    _wrappedEntries: [] // { target, name, original }
  };

  function isRemoteApplying() {
    try {
      return !!(window.LRMP._engine_apply_count && window.LRMP._engine_apply_count > 0);
    } catch (e) {
      return false;
    }
  }

  function getEngineContainers() {
    try {
      const state = window.store && typeof window.store.getState === 'function' ? window.store.getState() : null;
      if (!state || !state.simulator) return [];
      const sim = state.simulator;
      const containers = [];
      if (sim.engine) containers.push({ container: sim.engine, key: 'engine' });
      if (sim.committedEngine) containers.push({ container: sim.committedEngine, key: 'engine' });
      if (Array.isArray(sim.history)) {
        for (let i = 0; i < sim.history.length; i++) {
          const h = sim.history[i];
          if (h && h.engine) containers.push({ container: h, key: 'engine' });
        }
      }
      return containers;
    } catch (e) {
      return [];
    }
  }

  function safeWrap(target, name) {
    try {
      if (!target || typeof target[name] !== 'function') return;
      if (target[name].__vm_wrapped) return; // already wrapped

      const original = target[name];

      function vm_wrapper() {
        if (window.LRMP.__view_mode__._enabled && !isRemoteApplying()) { // i need to allow changing layer stuff
          // block local invocation when view-mode enabled and it's not a remote apply
          return this;
        }
        return original.apply(this, arguments);
      }

      // mark and store original for restore
      vm_wrapper.__vm_wrapped = true;
      vm_wrapper.__vm_original = original;

      target[name] = vm_wrapper;

      window.LRMP.__view_mode__._wrappedEntries.push({ target: target, name: name, original: original });
    } catch (e) { /* ignore */ }
  }

  function tryWrapAll() {
    const containers = getEngineContainers();
    if (!containers.length) return;
    for (let i = 0; i < containers.length; i++) {
      const owner = containers[i].container;
      const key = containers[i].key;
      const engine = owner && owner[key];
      if (!engine) continue;

      // wrap direct properties
      FUNCTIONS.forEach(name => safeWrap(engine, name));

      // wrap on prototype too
      const proto = Object.getPrototypeOf(engine);
      if (proto && proto !== Object.prototype) {
        FUNCTIONS.forEach(name => safeWrap(proto, name));
      }
    }
  }

  function restoreAll() {
    const entries = window.LRMP.__view_mode__._wrappedEntries || [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        const { target, name, original } = e;
        if (!target) continue;
        const current = target[name];
        // restore only if it is our wrapper and it holds the same original
        if (current && current.__vm_wrapped && current.__vm_original === original) {
          target[name] = original;
        }
      } catch (ex) { /* ignore */ }
    }
    window.LRMP.__view_mode__._wrappedEntries = [];
  }

  window.LRMP.VIEW_MODE = {
    enable: function () {
      if (window.LRMP.__view_mode__._enabled) return;
      window.LRMP.__view_mode__._enabled = true;
      tryWrapAll();
      // poll to catch engines created later / prototypes replaced
      window.LRMP.__view_mode__._intervalId = setInterval(tryWrapAll, 400);
      console.info('VIEW_MODE: enabled');
    },
    disable: function () {
      if (!window.LRMP.__view_mode__._enabled) return;
      window.LRMP.__view_mode__._enabled = false;
      if (window.LRMP.__view_mode__._intervalId) {
        clearInterval(window.LRMP.__view_mode__._intervalId);
        window.LRMP.__view_mode__._intervalId = null;
      }
      restoreAll();
      console.info('VIEW_MODE: disabled and attempted restore');
    },
    isEnabled: function () {
      return !!window.LRMP.__view_mode__._enabled;
    }
  };
})();

// ========== runEngineFunctions ==========

  window.LRMP.runEngineFunctions = (fns) => {
    for (const fn of fns) {
    // increment remote-apply counter so sender will skip sending while we apply
    window.LRMP._engine_apply_count = (window.LRMP._engine_apply_count || 0) + 1;
      try {
        // If payload-based update (lines added/removed) — dispatch to the store
        if (fn.linesToRemove || fn.linesToAdd) {
          try {
            if (window.store && typeof window.store.dispatch === 'function') {
              window.store.dispatch({ type: 'UPDATE_LINES', payload: fn });
            } else {
              console.error('engine_changes: store.dispatch not found for payload handling');
            }
          } catch (e) {
            console.error('engine_changes: failed to dispatch update lines', e);
          }
          continue;
        }

        const functionString = fn;
        const match = /^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(functionString);
        if (!match) {
          console.error('engine_changes: cannot parse function string', functionString);
          return;
        }
        const methodName = match[1];
        const argsSource = match[2];

        let args;
        try { args = Function('return [' + argsSource + ']')(); } catch (e) { console.error('engine_changes: failed to parse args:', e); args = []; }

        function _unlockEngine(engine) {
          try { if (engine && engine._target && engine._target._locked === true) engine._target._locked = false; } catch (e) {}
        }

        function _applyToEngineContainer(containerOwner, key) {
          try {
            const engine = containerOwner && containerOwner[key];
            if (!engine) return;
            let fn = engine[methodName];
            if (typeof fn !== 'function') return;
            const wrappedOriginal = (fn && (fn.__vm_original || fn.__tm_original));
            const callable = (typeof wrappedOriginal === 'function') ? wrappedOriginal : fn;
            _unlockEngine(engine);
            const newEngine = callable.apply(engine, args);
            if (newEngine !== undefined) containerOwner[key] = newEngine;
          } catch (e) {
            console.error('engine_changes: apply failed for', key, e);
          }
        }


        const storeState = window.store && typeof window.store.getState === 'function' ? window.store.getState() : null;
        if (!storeState || !storeState.simulator) {
          console.error('engine_changes: simulator state not found');
          return;
        }
        const sim = storeState.simulator;

        if (sim.engine) _applyToEngineContainer(sim.engine, 'engine');
        continue;
      } finally {
      // always decrement counter even if an error occurs
      window.LRMP._engine_apply_count = Math.max(0, (window.LRMP._engine_apply_count || 1) - 1);
      continue;
    }
  } // among us
  }

  /* ---------- load track helpers ---------- */
  function copyOwnProps(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    const out = {};
    Object.getOwnPropertyNames(obj).forEach(p => {
      try { out[p] = obj[p]; } catch (e) { out[p] = undefined; }
    });
    return out;
  }

function buildTrackData() {
  const st = window.store.getState();
  const baseTrack = JSON.parse(JSON.stringify(st.trackData));

  const engineWrap = st.simulator.engine;
  const engineState = engineWrap.engine.state;

  // layers
  const layersArr = engineState.layers.toArray().map(ln => {
    return copyOwnProps(ln.toJSON());
  });

  // lines
  const linesArr = engineWrap.linesList.toArray().map(ln => {
    return copyOwnProps(ln.toJSON());
  });

  // riders
  const ridersArr = engineState.riders.map(r => copyOwnProps(r));

  baseTrack.lines = linesArr;
  baseTrack.layers = layersArr;
  baseTrack.riders = ridersArr;

  return baseTrack;
}


  /* ---------- Server message processing ---------- */
  function processServerMessage(m) {
    if (!m || !m.type) return;
    if (m.type !== 'cursor') console.log('lrmp: received', m);

      const wsSend = obj => window.LRMP._wsSend && window.LRMP._wsSend(obj);

    // participants list
    if (m.type === 'participants') {
      document.dispatchEvent(new CustomEvent('lrmp_participants', { detail: m }));
      return;
    }

  // request_track for host -> reply with track
  if (m.type === 'request_track') {
    try {
      const data = buildTrackData();
      if (data && window.LRMP._wsSend) {
        window.LRMP._wsSend({ type: 'track', clientId: CLIENT_ID, trackData: data, trackId: m.trackId || null, requesterClientId: m.requesterClientId || null });
      }
    } catch (e) {}
    return;
  }

// track (server -> client as reply to request)
if (m.type === 'track') {
  try {
    const payload = m.trackData || null;
    if (!payload) return;

      const c = window.store.getState().camera
      const location = { position: c.editorPosition, zoom: c.editorZoom }

      if (window.store && typeof window.store.dispatch === 'function') {
        window.LRMP._engine_apply_count = (window.LRMP._engine_apply_count || 0) + 1;
        try { window.store.dispatch({ type: 'LOAD_TRACK', payload });
          window.LRMP._engine_apply_count = Math.max(0, (window.LRMP._engine_apply_count || 1) - 1);
            if (m.resync) window.store.dispatch({ type: "SET_EDITOR_CAMERA", payload: location });} catch (e) {}
      }
  } catch (e) {}
  return;
}

// 22222222222222222

// =========== engine_changes ===========
    if (m.type === 'engine_changes') {
      try {
        window.LRMP._engine_apply_count = (window.LRMP._engine_apply_count || 0) + 1;
        try {
          if (typeof window.LRMP.onUndo !== 'function') return;
          if (m.clientId === CLIENT_ID) return;

          const eng = window.store.getState().simulator.engine;

          if (!(window.LRMP.collidingIds instanceof Set)) {
            window.LRMP.collidingIds = new Set();
          }

          // client receives line add that is a collision
          const collidingIds = m.functions.flatMap(
            fn => fn.linesToAdd?.flatMap(l => (l.added && eng.getLine(l.id)) ? [l.id] : []) || []
          );

          // add collidingIds to global collidingIds
          collidingIds.forEach(id => window.LRMP.collidingIds.add(id));

          // add received lines, layers, and riders changes
          window.LRMP.runEngineFunctions(m.functions);

          if (!window.LRMP.historyUncommitted) window.store.dispatch({ type: "COMMIT_TRACK_CHANGES" }); // if we're committed, we can commit other ppl's changes

          // if server told us how to fix collisions
          if (m.collisions?.length > 0) {
            const { history, historyIndex } = window.LRMP;
            const currentEntry = history[historyIndex];

            const collisionMap = new Map(m.collisions.map(c => [String(c.prevId), c.newId]));
            if (!(window.LRMP.collisionMap instanceof Map)) {
              window.LRMP.collisionMap = new Map();
            }
            for (const [prevId, newId] of collisionMap.entries()) {
              window.LRMP.collisionMap.set(prevId, newId);
            }

            const remapLineList = (list) => {
              if (!Array.isArray(list)) return list;
              return list.map(item => {
                if (!item || typeof item !== 'object') return item;
                if (item.id != null && collisionMap.has(String(item.id))) {
                  item.id = collisionMap.get(String(item.id));
                }
                return item;
              });
            };

            const remapHistoryEntry = (entry) => {
              if (!entry) return;
              for (const action of [...(entry.undo || []), ...(entry.redo || [])]) {
                if (!action || !Array.isArray(action.args)) continue;
                if (action.name === 'withLinesRemoved' && Array.isArray(action.args[0])) {
                  action.args[0] = action.args[0].map(rid => collisionMap.get(String(rid)) ?? rid);
                }
                if (action.name === 'withLinesAdded' && Array.isArray(action.args[0])) {
                  action.args[0] = remapLineList(action.args[0]);
                }
              }
            };

            for (const entry of history) {
              remapHistoryEntry(entry);
            }

            const idsToRevert = [];
            window.LRMP.collidingIdsRemoved.forEach(id => {
              const resolved = collisionMap.get(String(id));
              if (resolved != null) {
                idsToRevert.push(resolved);
                window.LRMP.collidingIdsRemoved.delete(id);
              }
            });
            if (idsToRevert.length > 0) {

              window.LRMP._wsSend({
                type: 'request_engine_changes',
                clientId: typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : null,
                trackId: window.LRMP.currentTrackId,
                functions: [{ linesToRemove: idsToRevert, linesToAdd: null }]
              });
              window.LRMP.runEngineFunctions([{ linesToRemove: idsToRevert, linesToAdd: null }]);
            }

            // remove fixed collisions from collidingIds
            window.LRMP.collidingIds = new Set(
              [...window.LRMP.collidingIds].filter(id => !collisionMap.has(String(id)))
            );

            // Keep the server mapping alive; it still needs to translate late undo/redo.
          }

        } finally {
          window.LRMP._engine_apply_count = Math.max(0, (window.LRMP._engine_apply_count || 1) - 1);
        }
      } catch (errMain) {
        console.error('engine_changes handler error', errMain);
      }
      return;
    }


// command_changes
if (m.type === 'command_changes') {
  try {
    if (m.clientId === CLIENT_ID) return;

    // increment remote-apply counter so sender will skip sending while we apply
    window.LRMP._command_apply_count =
      (window.LRMP._command_apply_count || 0) + 1;

    try {
      const fn = window[m.function];
      if (typeof fn !== "function") {
        console.warn("Unknown remote function:", m.function);
        return;
      }

      const args = Array.isArray(m.args) ? m.args : [];

      const result = fn.apply(window, args);

      if (m.function === "createZoomer") window.getAutoZoom = result;
      if (m.function === "createTimeRemapper") window.timeRemapper = result;
      if (m.function === "createFocuser") window.getCamFocus = result;
      if (m.function === "createBoundsPanner") window.getCamBounds = result;
      if (m.function === "createLayerAutomator") window.getLayerVisibleAtTime = result;

    } finally {
      window.LRMP._command_apply_count = Math.max(
        0,
        (window.LRMP._command_apply_count || 1) - 1
      );
    }
  } catch (errMain) {
    console.error("command_changes handler error", errMain);
  }
  return;
}

      // cursor
      if (m.type === 'cursor') { //232323232
          if (m.clientId === CLIENT_ID) return;
          const store = window.store;
          let entities = window.LRMP.entities;
          const line = m.line;
          const colorHex = m.color;
          const color = hexToMillionsColor(colorHex);
          const index = line.index;
          const zoom = store.getState().camera.editorZoom;
          const thickness = 20 / zoom;
          const newLine = new Millions.Line(
              { x: line.p.x, y: line.p.y, colorA: color, colorB: color, thickness },
              { x: line.p.x + 0.0001, y: line.p.y + 0.0001, colorA: color, colorB: color, thickness },
              5,
              index
          );
          const existingIndex = entities.findIndex(e => e.zIndex === index);
          // console.log("entities:", entities)
          if (existingIndex !== -1) {
              entities[existingIndex] = newLine;
          } else {
              entities.push(newLine);
          }
          window.LRMP.entities = entities;
          window.store.dispatch({ type: "SET_RENDERER_SCENE", payload: { key: "edit", scene: Millions.Scene.fromEntities(entities) } });
          return;
      }


      // request_location
      if (m.type === 'request_location') { //45454545
          const targetClientId = m.targetClientId;
          const requesterId = m.requesterId;
          const getEditorCamPos = window.store.getState().camera.editorPosition;
          const getEditorCamZoom = window.store.getState().camera.editorZoom;
          const location = { position: getEditorCamPos, zoom: getEditorCamZoom };

          wsSend({ type: 'location', targetClientId, location, requesterId })
          return;
      }


      // location
      if (m.type === 'location') {
          const location = m.location;
          if (window.LRMP && window.LRMP.tp.tp && (m.targetClientId == window.LRMP.tp.targetClientId)) { // if this is the person we wanted the location from
              if (window.LRMP.tp.tpClientId) {
                  // tp someone else
                  const tpClientId = window.LRMP.tp.tpClientId;

                  wsSend({ type: 'request_tp', targetClientId: tpClientId, location: location, trackId: window.LRMP.currentTrackId})
                  return;
              }
              // tp self
              const locationToText = loc =>
              `position (${loc.position.x}, ${loc.position.y}), zoom ${loc.zoom}`;

              Chat.addSystem(`Teleported to ${locationToText(location)}.`);
              window.store.dispatch({ type: "SET_EDITOR_CAMERA", payload: location });
          }
          window.LRMP.tp = {tp: false, targetClientId: false, tpClientId: null};
          return;
      }

      // request_tp
      if (m.type === 'request_tp') {
          const location = m.location;
          const requesterUser = (window.LRMP && window.LRMP._lastParticipantsList) ? (window.LRMP._lastParticipantsList.find(p=>p.clientId===m.requesterId)||{}).username : (m.requesterId||'user');

          const locationToText = loc =>
          `position (${loc.position.x}, ${loc.position.y}), zoom ${loc.zoom}`;

          Chat.addSystem(`${requesterUser} teleported you to ${locationToText(location)}.`);
          window.store.dispatch({ type: "SET_EDITOR_CAMERA", payload: location });
          return;
      }

    // private_message: format differently for sender vs receiver
    if (m.type === 'private_message') {
      // If we're the sender, server may send us an ack separately; but when server forwards private_message to recipient it uses this type.
      // m: { type:'private_message', clientId, username, text, targetClientId, color }
      const senderId = m.clientId;
      const targetId = m.targetClientId;
      const timestamp = new Date().toLocaleTimeString();
      if (targetId === CLIENT_ID && senderId !== CLIENT_ID) {
        // we are the recipient
        const name = (m.username || 'Someone');
        const color = m.color || DEFAULT_COLOR;
        Chat.addChat(`${name} tells You`, m.text || '', color, timestamp);
      } else if (senderId === CLIENT_ID) {
        // ignore our own messages
      } else {
        // fallback
        Chat.addChat(m.username || 'Unknown', m.text || '', m.color || DEFAULT_COLOR, timestamp);
      }
      return;
    }

    // chat messages
    if (m.type === 'chat') {
      if (m.clientId === CLIENT_ID) return;
      const timestamp = new Date().toLocaleTimeString();

      // if files are included, render them (and the text, if any)
      if (m.files && Array.isArray(m.files) && m.files.length) {
        // show text first if any
        if (m.text) Chat.addChat(m.username || 'Unknown', m.text || '', m.color || DEFAULT_COLOR, timestamp);

        for (const f of m.files) {
          // f expected shape: { name, type, size, dataUrl, trackMeta }
          const fileObj = {
            name: f.name,
            type: f.type,
            size: f.size,
            dataUrl: f.dataUrl || null,
            isTrackJson: !!(f.name && f.name.toLowerCase().endsWith('.track.json')) || !!(f.trackMeta),
            trackMeta: f.trackMeta || null
          };
          Chat.addFileMessage(m.username || 'Unknown', fileObj, m.color || DEFAULT_COLOR, timestamp);
        }
        return;
      }

      // otherwise plain chat
      Chat.addChat(m.username || 'Unknown', m.text || '', m.color || DEFAULT_COLOR, timestamp);
      return;
    }

    // pong
    if (m.type === 'pong') {
      const pong = (performance.now() - m.startTime).toFixed(1);
        Chat.addSystem(`pong! took ${pong}ms`);
      return;
    }

    // hello / acks / kicked / server_ack / end_ack etc -> notify UI via events so component can handle properly
    if (m.type === 'kicked') {
      // broadcast event; components handle leaving UI when it's the target
      document.dispatchEvent(new CustomEvent('lrmp_kicked', { detail: m }));
      // also present ack to UI listeners
      document.dispatchEvent(new CustomEvent('lrmp_server_ack', { detail: m }));
      return;
    }

    // generic acknowledgements / others
    if (m.type === 'hello_ack' || m.type === 'host_ack' || m.type === 'join_ack' || m.type === 'leave_ack' || m.type === 'end_ack' || m.type === 'server_ack') {
      document.dispatchEvent(new CustomEvent('lrmp_server_ack', { detail: m }));
      return;
    }

    // fallback: unknown type
    console.warn('lrmp: unknown msg type', m.type);
  }

  /* ---------- Expose helpers for debugging ---------- */
  window.LRMP.applyIncomingEngine = window.LRMP.applyIncomingEngineImpl;

  /* ---------- Chat send and command parsing (prevent double echo) ---------- */
  function findParticipantByNameOrId(nameOrId, participants) {
    if (!nameOrId) return null;
    const list = participants || (window.LRMP && window.LRMP._lastParticipantsList) || [];
    // try exact clientId
    const byId = list && list.find(p => String(p.clientId) === String(nameOrId));
    if (byId) return byId.clientId;
    // try case-insensitive username match
    const low = String(nameOrId).toLowerCase();
    const byName = list && list.find(p => (p.username || '').toLowerCase() === low);
    if (byName) return byName.clientId;
    // try substring match
    const substr = list && list.find(p => (p.username || '').toLowerCase().includes(low));
    if (substr) return substr.clientId;
    return null;
  }

  document.addEventListener('lrmp_chat_send', (ev) => {
    const d = ev.detail || {};
    const text = typeof d.text === 'string' ? d.text : '';
    // accept files sent from the Chat UI (queued files). Allow sending even if text is empty.
    const files = Array.isArray(d.files) && d.files.length ? d.files : null;

    // if there's neither text nor files, nothing to send
    if (!text && !files) return;

    const username = SAFE_GET(USERNAME_KEY, SAVED_USERNAME);
    const color = SAFE_GET(COLOR_KEY, SAVED_COLOR);

    if (window.LRMP && window.LRMP.myMeta && window.LRMP.myMeta.muted) {
      Chat.addSystem('You are muted and cannot send messages.');
      return;
    }

    if (text.startsWith('/')) {
      const parts = text.trim().split(/\s+/);
      const cmdRaw = parts[0].slice(1).toLowerCase();
      const args = parts.slice(1);

      // common context used by commands
      const list = (window.LRMP && window.LRMP._lastParticipantsList) ? window.LRMP._lastParticipantsList : [];
      const myMeta = window.LRMP && window.LRMP.myMeta ? window.LRMP.myMeta : { isMod:false, isHost:false };
      const wsSend = obj => window.LRMP._wsSend && window.LRMP._wsSend(obj);
      const isNum = v => (typeof v === 'number' && !isNaN(v));

      // helpers
      const getId = name => {
        const id = findParticipantByNameOrId(name, list);
        if (!id) Chat.addSystem('No participant match for "'+name+'"');
        return id;
      };
      const getEntry = id => (window.LRMP && window.LRMP._lastParticipantsList) ? window.LRMP._lastParticipantsList.find(p => p.clientId === id) : null;
      const nameForId = id => {
        const e = getEntry(id);
        return e ? e.username : id;
      };

      const requireHost = () => {
        if (!myMeta.isHost) { Chat.addSystem('Only the host may perform that action.'); return false; }
        return true;
      };
      const requireMod = () => {
        if (!(myMeta.isMod || myMeta.isHost)) { Chat.addSystem('Only host/mods may perform that action.'); return false; }
        return true;
      };

      switch (cmdRaw) {
        case 'help':
        case '?': {
          const base = [
            '/help | /? — show this',
            '/mode (<user>) [edit|view] — set your (or target\'s) mode',
            '/tell <user> <message> — private message',
            '/tp <location> (<user>) — teleport',
            '/ping — play ping pong w/ the server',
          ];
          if (myMeta.isMod || myMeta.isHost) {
            base.push('/mute <user> — mute user');
            base.push('/unmute <user> — unmute user');
            base.push('/kick <user> — kick user');
            base.push('/ban <user> — ban user');
            base.push('/perms <user> [edit|view] — set perms for user');
            base.push('/permsall [edit|view] — set perms for everyone');
            base.push('/muteall — mute chat for everyone');
            base.push('/unmuteall — unmute chat');
          }
          if (myMeta.isHost) {
            base.push('/op <user> — make user a moderator');
            base.push('/deop <user> — remove moderator');
            base.push('/resync — reloads the track for all participants');
          }
          Chat.addSystem('Commands:\n' + base.join('\n'));
          return;
        }

        case 'mod':
        case 'op': {
          if (!requireHost()) return;
          const target = args[0];
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'set_mod', trackId: window.LRMP.currentTrackId, targetClientId: id, grant: true });
          Chat.addSystem('Requested op: ' + (target || id));
          return;
        }

        case 'deop':
        case 'unmod': {
          if (!requireHost()) return;
          const target = args[0];
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'set_mod', trackId: window.LRMP.currentTrackId, targetClientId: id, grant: false });
          Chat.addSystem('Requested deop: ' + (target || id));
          return;
        }

        case 'muteall':
        case 'mutechat': {
          if (!requireMod()) return;
          wsSend({ type: 'mute_all', trackId: window.LRMP.currentTrackId, mute: true });
          return;
        }
        case 'unmuteall':
        case 'unmutechat': {
          if (!requireMod()) return;
          wsSend({ type: 'mute_all', trackId: window.LRMP.currentTrackId, mute: false });
          return;
        }

        case 'mute': {
          if (!requireMod()) return;
          const target = args[0];
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'mute', trackId: window.LRMP.currentTrackId, targetClientId: id, mute: true });
          return;
        }
        case 'unmute': {
          if (!requireMod()) return;
          const target = args[0];
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'mute', trackId: window.LRMP.currentTrackId, targetClientId: id, mute: false });
          return;
        }

        case 'kick': {
          if (!requireMod()) return;
          const target = args[0];
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'kick', trackId: window.LRMP.currentTrackId, targetClientId: id, clientId: CLIENT_ID });
          Chat.addSystem('Requested kick: ' + (target || id));
          return;
        }
        case 'ban': {
          if (!requireMod()) return;
          const target = args[0];
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'ban', trackId: window.LRMP.currentTrackId, targetClientId: id, clientId: CLIENT_ID });
          Chat.addSystem('Requested ban: ' + (target || id));
          return;
        }

        case 'permsall': {
          if (!requireMod()) return;
          const p = args[0] === 'view' ? 'view' : 'edit';
          wsSend({ type: 'permsall', trackId: window.LRMP.currentTrackId, perms: p });
          Chat.addSystem('Requested permsall: ' + p);
          return;
        }
        case 'perms': {
          if (!requireMod()) return;
          const target = args[0];
          const mode = args[1] === 'view' ? 'view' : 'edit';
          const id = getId(target);
          if (!id) return;
          wsSend({ type: 'set_perms', trackId: window.LRMP.currentTrackId, targetClientId: id, perms: mode });
          Chat.addSystem('Requested perms ' + mode + ' for ' + (target || id));
          return;
        }

        case 'mode': {
          // no args -> toggle self
          if (args.length === 0) {
            const newMode = (window.LRMP && window.LRMP.VIEW_MODE.isEnabled()) ? 'edit' : 'view';
            wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: CLIENT_ID, mode: newMode });
            Chat.addSystem('Requested mode: ' + newMode);
            return;
          }

          // single arg is explicit mode for self
          if (args.length === 1 && (args[0] === 'edit' || args[0] === 'view')) {
            const desired = args[0];
            wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: CLIENT_ID, mode: desired });
            Chat.addSystem('Requested mode: ' + desired);
            return;
          }

          // otherwise first arg is a user
          const maybeUser = args[0];
          const targetId = getId(maybeUser);
          if (!targetId) return;

          const second = args[1];
          let modeToSet = null;
          if (second === 'edit' || second === 'view') modeToSet = second;

          // no explicit mode provided -> toggle target's mode (requires mod)
          if (!modeToSet) {
            if (!requireMod()) return;
            const targetEntry = list.find(p => p.clientId === targetId);
            const curMode = targetEntry ? (targetEntry.mode || 'edit') : 'edit';
            const newMode = curMode === 'view' ? 'edit' : 'view';
            wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: targetId, mode: newMode });
            Chat.addSystem(`Requested set mode ${newMode} for ${maybeUser}`);
            return;
          } else { // explicit mode provided (requires mod)
            if (!requireMod()) return;
            wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: targetId, mode: modeToSet });
            Chat.addSystem(`Requested set mode ${modeToSet} for ${maybeUser}`);
            return;
          }
        }

          case 'edit': {
              if (window.LRMP && window.LRMP.VIEW_MODE.isEnabled()) {
                  wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: CLIENT_ID, mode: 'edit' });
                  Chat.addSystem('Requested edit mode')
                  return;
              }
              Chat.addSystem('You\'re already in edit mode');
              return;
          }
          case 'view': {
              if (window.LRMP && !(window.LRMP.VIEW_MODE.isEnabled())) {
                  wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: CLIENT_ID, mode: 'view' });
                  Chat.addSystem('Requested view mode')
                  return;
              }
              Chat.addSystem('You\'re already in view mode');
              return;
          }
        case 'togglemode': {
          const newMode = (window.LRMP && window.LRMP.VIEW_MODE.isEnabled()) ? 'edit' : 'view';
          wsSend({ type: 'set_mode', trackId: window.LRMP.currentTrackId, targetClientId: CLIENT_ID, mode: newMode });
          Chat.addSystem('Requested mode: ' + newMode);
          return;
        }

        // tell/whisper
        case 'tell':
        case 'w':
        case 'whisper':
        case 'm':
        case 'message': {
          const target = args[0];
          const message = args.slice(1).join(' ');
          const timestamp = new Date().toLocaleTimeString();
          if (!target || !message) { Chat.addSystem('Usage: /tell <user> <message>'); return; }
          const id = getId(target);
          if (!id) return;
          const targetEntry = getEntry(id);
          const targetName = targetEntry ? targetEntry.username : (target || id);
          Chat.addChat(`You tell ${targetName}`, message, color, timestamp);
          wsSend({ type: 'private_message', targetClientId: id, text: message });
          return;
        }

        case 'tp': { //34343434
            const isNumLocal = v => (typeof Number(v) === 'number' && !isNaN(v));
            const onlyModsMsg = () => Chat.addSystem('Only host/mods may teleport other users.');
            const buildLocationFrom = (offset) => {
                const locX = Number(args[offset]);
                const locY = Number(args[offset + 1]);
                const zoom = (isNumLocal(args[offset + 2])) ? Number(args[offset + 2]) : window.store.getState().camera.editorZoom;
                return { position: { x: locX, y: locY }, zoom: Math.max(0.001, zoom) };
            };
            const locationToText = loc =>
            `position (${loc.position.x}, ${loc.position.y}), zoom ${loc.zoom}`;


            // Case A: direct numerical location (args[0] and args[1] are numbers)
            if (isNumLocal(args[0]) && isNumLocal(args[1])) { // numerical location
                const location = buildLocationFrom(0);
                const user = args[ (isNumLocal(args[2]) ? 3 : 2) ]; // optional user after coords
                if (user && (user !== SAVED_USERNAME)) { // tp someone else to numerical location
                    if (myMeta.isMod || myMeta.isHost) {
                        const id = getId(user);
                        if (!id) return;
                        wsSend({ type: 'request_tp', targetClientId: id, location: location, trackId: window.LRMP.currentTrackId});
                    } else onlyModsMsg();
                } else { // tp self to numerical location
                        Chat.addSystem(`Teleported to ${locationToText(location)}.`);
                    window.store.dispatch({ type: "SET_EDITOR_CAMERA", payload: location });
                }
                return;
            }

            // Case B: args[0] exists
            if (args[0]) { // tp to/around target user(s)
                // if no second arg -> teleport self to target user
                if (typeof args[1] === 'undefined') {
                    const targetId = getId(args[0]);
                    if (!targetId) return;
                    wsSend({ type: 'request_location', targetClientId: targetId});
                    window.LRMP.tp = {tp: true, targetClientId: targetId, tpClientId: false};
                    return;
                }

                // args[1] exists -> treat args[0] as source user
                const source = args[0];
                const sourceId = getId(source);
                if (!sourceId) return;

                // If args[1..] look like a numerical location -> teleport source to numerical location
                if (isNumLocal(args[1]) && isNumLocal(args[2])) {
                    const location = buildLocationFrom(1);
                    if (source !== SAVED_USERNAME) {
                        if (myMeta.isMod || myMeta.isHost) {
                            wsSend({ type: 'request_tp', targetClientId: sourceId, location: location, trackId: window.LRMP.currentTrackId});
                        } else onlyModsMsg();
                    } else {
                        Chat.addSystem(`Teleported to ${locationToText(location)}.`);
                        window.store.dispatch({ type: "SET_EDITOR_CAMERA", payload: location });
                    }
                    return;
                }

                // Otherwise args[1] is a destination user -> teleport source to dest user's location
                const destId = getId(args[1]);
                if (!destId) return;

                if (source !== SAVED_USERNAME) { // teleport someone else to dest user's location
                    if (myMeta.isMod || myMeta.isHost) {
                        wsSend({ type: 'request_location', targetClientId: destId});
                    window.LRMP.tp = {tp: true, targetClientId: destId, tpClientId: sourceId};
                    } else onlyModsMsg();
                } else { // teleport self to dest user
                    wsSend({ type: 'request_location', targetClientId: destId});
                    window.LRMP.tp = {tp: true, targetClientId: destId, tpClientId: false};
                }
                return;
            }
            return;
        }

        case 'resync': {
          if (!requireMod()) return;
          const trackData = buildTrackData();
          wsSend({ type: 'track', trackId: window.LRMP.currentTrackId, trackData, resync: true});
          Chat.addSystem('Resynced all participants to your track.');
          return;
        }

        case 'ping': {
          wsSend({ type: 'ping', startTime: performance.now()});
          Chat.addSystem('pinging...');
          return;
        }

        // debug
        case 'debug': {
            try {
          Chat.addSystem(eval(args[0]));
            } catch (e) {Chat.addSystem(e)}
          return;
        }

        default:
          Chat.addSystem('Unknown command: ' + cmdRaw);
          return;
      }
    }

    // normal chat message (include files if present)
    if (window.LRMP && window.LRMP._wsSend) {
      window.LRMP._wsSend({
        type: 'chat',
        clientId: CLIENT_ID,
        username,
        text,
        color,
        trackId: window.LRMP.currentTrackId || null,
        files: files // null or array of { name, type, size, dataUrl, trackMeta }
      });

      // Local echo only if there's text
      const timestamp = new Date().toLocaleTimeString();
      if (text) Chat.addChat('You', text, SAFE_GET(COLOR_KEY, DEFAULT_COLOR), timestamp);
    }
  });

  /* ---------- Keep last participants for lookups ---------- */
  document.addEventListener('lrmp_participants', (ev) => {
    const d = ev.detail || {};
    window.LRMP._lastParticipantsList = Array.isArray(d.participants) ? d.participants.slice() : [];
  });

  /* ---------- UI: React component (registerCustomSetting) ---------- */
function main() {
  const React = window.React;
  if (!React) return;
  const e = React.createElement;

  function buildToTrackPos() {
    if (!window.__LRMP_DefaultToolHelper) {
      window.__LRMP_DefaultToolHelper = new window.DefaultTool(window.store);
    }

    const helper = window.__LRMP_DefaultToolHelper;

    return p => helper.toTrackPos(p);
  }

  class MultiplayerModComponent extends React.Component {
    constructor(props) {
      super(props);
    const k = 'MyMod::state::' + (props.instanceId || 'default');
    this.state = window[k] || {
        active: false,
        hidden: false,
        connecting: false,
        failedToConnect: false,
        settingsOpen: false,
        username: SAFE_GET(USERNAME_KEY, SAVED_USERNAME),
        color: SAFE_GET(COLOR_KEY, SAVED_COLOR),
        entities: [],
        panel: 'none',
        hostDisplayName: '',
        inTrackId: null,
        participants: [],
        isHost: false,
        chatVisible: false,
        shareLayers: false,

        // connection transport chooser / P2P manual signaling state
        transportReady: false,
        connectMode: null,        // null | 'ws' | 'p2p-host' | 'p2p-guest'
        p2pOfferCode: '',         // host: code to send to a joining guest
        p2pPendingGuestId: null,  // host: which pending invite the answer box below applies to
        p2pAnswerInput: '',       // host: guest's answer code, pasted here
        p2pOfferInput: '',        // guest: host's offer code, pasted here
        p2pAnswerCode: '',        // guest: code to send back to the host
        p2pError: null,
        p2pDiag: '',              // live ICE/connection status text, for troubleshooting stuck connections
      };
      this.prevParticipantsMap = {};
      this.onParticipants = this.onParticipants.bind(this);
      this.onServerAck = this.onServerAck.bind(this);
      this.onWsOpen = this.onWsOpen.bind(this);
      this.onWsClose = this.onWsClose.bind(this);
      this.onTransportReady = this.onTransportReady.bind(this);
      this.onTransportFailed = this.onTransportFailed.bind(this);
      this.onP2PPeerConnected = this.onP2PPeerConnected.bind(this);
      this.onP2PInviteStatus = this.onP2PInviteStatus.bind(this);
      this.onP2PGuestStatus = this.onP2PGuestStatus.bind(this);
      this.onChatHidden = this.onChatHidden.bind(this);
      this.onKicked = this.onKicked.bind(this);

      this._toTrackPos = buildToTrackPos();

      // pointer handlers:
        this._onDocPointerMove = ev => {
            if (window.LRMP && window.LRMP.active && window.LRMP.currentTrackId) {
                const pos = { x: ev.clientX, y: ev.clientY };
                const p = this._toTrackPos(pos);

                let entities = [];
                let ops = [];
                const colorHex = this.state.color || DEFAULT_COLOR;
                const color = hexToMillionsColor(colorHex);
                const index = window.LRMP._lastParticipantsList.findIndex(p => p.clientId === CLIENT_ID) ?? 0;

                window.LRMP._wsSend({ type: 'request_cursor', clientId: CLIENT_ID, trackId: window.LRMP.currentTrackId,
                                    line: {index: index, p: p},
                                    color: colorHex
                                    });
          // 1212121212
        }
      };

      document.addEventListener("pointermove", this._onDocPointerMove, true);
    }

    toTrackPos(p) {
      return this._toTrackPos(p);
    }



      componentDidMount() {
        document.addEventListener('lrmp_participants', this.onParticipants);
        document.addEventListener('lrmp_server_ack', this.onServerAck);
        document.addEventListener('lrmp_ws_open', this.onWsOpen);
        document.addEventListener('lrmp_ws_closed', this.onWsClose);
        document.addEventListener('lrmp_chat_hidden', this.onChatHidden);
        document.addEventListener('lrmp_kicked', this.onKicked);
        document.addEventListener('lrmp_transport_ready', this.onTransportReady);
        document.addEventListener('lrmp_transport_failed', this.onTransportFailed);
        document.addEventListener('lrmp_p2p_peer_connected', this.onP2PPeerConnected);
        document.addEventListener('lrmp_p2p_invite_status', this.onP2PInviteStatus);
        document.addEventListener('lrmp_p2p_guest_status', this.onP2PGuestStatus);

        const st = window.store && window.store.getState && window.store.getState();
        if (st && st.trackData && st.trackData.label) this.setState({ hostDisplayName: st.trackData.label });


        this.prevZoom = window.store.getState().camera.editorZoom;

        this.unsubscribe = window.store.subscribe(() => {
          const zoom = window.store.getState().camera.editorZoom;
          if (zoom === this.prevZoom) return;
          this.prevZoom = zoom;

          const thickness = 20 / zoom;
          const oldEntities = window.LRMP.entities || [];

          const newEntities = oldEntities.map(e => {
            const p1 = e.p1;
            const p2 = e.p2;
            const color = new Millions.Color(e.p1.colorA.r, e.p1.colorA.g, e.p1.colorA.b, e.p1.colorA.a);
            const zIndex = e.zIndex;

            return new Millions.Line(
              { x: p1.x, y: p1.y, colorA: color, colorB: color, thickness },
              { x: p2.x, y: p2.y, colorA: color, colorB: color, thickness },
              5,
              zIndex
            );
          });

          // console.log("prev", window.LRMP.entities, "new", newEntities)
          window.LRMP.entities = newEntities;

          window.store.dispatch({
            type: 'SET_RENDERER_SCENE',
            payload: { key: 'edit', scene: Millions.Scene.fromEntities(newEntities) }
          });
        });

      }

  componentDidUpdate() {
    const k = 'MyMod::state::' + (this.props.instanceId || 'default');
    window[k] = this.state;
  }

      componentWillUnmount() {

    const k = 'MyMod::state::' + (this.props.instanceId || 'default');
    window[k] = this.state;

      document.removeEventListener("pointermove", this._onDocPointerMove, true);
        document.removeEventListener('lrmp_participants', this.onParticipants);
        document.removeEventListener('lrmp_server_ack', this.onServerAck);
        document.removeEventListener('lrmp_ws_open', this.onWsOpen);
        document.removeEventListener('lrmp_ws_closed', this.onWsClose);
        document.removeEventListener('lrmp_chat_hidden', this.onChatHidden);
        document.removeEventListener('lrmp_kicked', this.onKicked);
        document.removeEventListener('lrmp_transport_ready', this.onTransportReady);
        document.removeEventListener('lrmp_transport_failed', this.onTransportFailed);
        document.removeEventListener('lrmp_p2p_peer_connected', this.onP2PPeerConnected);
        document.removeEventListener('lrmp_p2p_invite_status', this.onP2PInviteStatus);
        document.removeEventListener('lrmp_p2p_guest_status', this.onP2PGuestStatus);

          if (this.unsubscribe) {
              this.unsubscribe();
          }
      }

      onWsOpen(ev) { this.setState({ connecting: false }); } // i don't think this one actually runs
      onWsClose(ev) { const url = ev && ev.detail && ev.detail.url ? ev.detail.url : '(server)'; Chat.addSystem('Disconnected from server'); this.setState({ connecting: false, transportReady: false }); }

      // Fires once the chosen transport (legacy WS, P2P host loopback, or
      // P2P guest data channel) is actually usable. Same post-connect
      // sequence regardless of which transport got us here.
      onTransportReady() {
        window.LRMP.active = true;
        try { installCommandMirrors(); } catch (e) { console.warn("installCommandMirrors failed:", e); }
        try { installEngineMirrors(); } catch (e) { console.warn("installEngineMirrors failed:", e); }
        try { installDispatchDetector(); } catch (e) { console.warn("installDispatchDetector failed:", e); }
        this.setState({ connecting: false, transportReady: true, chatVisible: true });
        const name = SAFE_GET(USERNAME_KEY, this.state.username || '');
        const color = SAFE_GET(COLOR_KEY, DEFAULT_COLOR);
        const version = CLIENT_VERSION;
        if (window.LRMP._wsSend) window.LRMP._wsSend({ type: 'hello', clientId: CLIENT_ID, username: name, color, version });
      }
      onTransportFailed(ev) {
        const reason = ev && ev.detail && ev.detail.reason;
        Chat.addSystem(reason === 'p2p' ? 'Failed to establish peer-to-peer connection' : 'Failed to connect to server');
        this.setState({ connecting: false, failedToConnect: true, chatVisible: true });
      }

      // Host side: fires once a guest's data channel actually opens and
      // identifies itself -- this is the real "connected" signal, unlike
      // hostAcceptAnswer() resolving (which only means the answer code was
      // syntactically valid, not that a live connection exists yet).
      onP2PPeerConnected(ev) {
        const { inviteId } = (ev && ev.detail) || {};
        if (!this.state.p2pPendingGuestId || inviteId === this.state.p2pPendingGuestId) {
          this.setState({ p2pPendingGuestId: null, p2pError: null, p2pDiag: '' });
        }
        Chat.addSystem('Peer connected.');
      }
      // Host side: live status while waiting for a specific pending invite
      // to actually finish connecting after "Connect peer" was clicked.
      onP2PInviteStatus(ev) {
        const { inviteId, status, diag } = (ev && ev.detail) || {};
        if (!this.state.p2pPendingGuestId || inviteId !== this.state.p2pPendingGuestId) return;
        if (status === 'failed') {
          this.setState({ p2pError: "Connection failed. This usually means a firewall or NAT is blocking a direct connection between you two. Diagnostic: " + diag, p2pDiag: diag });
        } else {
          this.setState({ p2pDiag: diag, p2pError: null });
        }
      }
      // Guest side: live status while waiting for the host to finish their
      // half. Our own ICE agent starts trying immediately once we've        YO CLAUDE WDYM BY ICE AGENT YOU CANNOT ADD THAT TO MY MOD
      // generated an answer code, well before the host necessarily gets to
      // paste it -- that's normal, not itself a failure.
      onP2PGuestStatus(ev) {
        const { status, diag } = (ev && ev.detail) || {};
        if (this.state.transportReady) return; // already connected, ignore late/stale reports
        if (status === 'failed') {
          this.setState({ p2pError: "Connection failed. This usually means a firewall or NAT is blocking a direct connection between you two. Diagnostic: " + diag, p2pDiag: diag });
        } else {
          this.setState({ p2pDiag: diag });
        }
      }

      onKicked(ev) {
        const m = ev.detail || {};
        if (m.targetClientId === CLIENT_ID) {
          Chat.addSystem('You were kicked from the track.');
          // close local membership
          this.setState({ inTrackId: null, participants: [], isHost: false});
          window.LRMP.currentTrackId = null;
        } else {
          // someone else was kicked — participants list update will show it
        }
      }

      onServerAck(ev) {
        const m = ev.detail || {};
        const targetName = (window.LRMP && window.LRMP._lastParticipantsList) ? (window.LRMP._lastParticipantsList.find(p=>p.clientId===m.targetClientId)||{}).username : (m.targetClientId||'user');
        // Friendly messages
        if (m && m.action) {
          if (m.action == 'chat' && m.ok === false && m.reason === 'muted') {
            Chat.addSystem('Chat is currently muted.');
            return;
          }
          if (!m.ok) { Chat.addSystem(m.action + ' failed: ' + (m.reason || 'unknown')); return; }
          switch (m.action) {
            case 'private_message':
              break;
            case 'set_mod':
              if (m.grant) Chat.addSystem(`${targetName} was added as a moderator.`);
              else Chat.addSystem(`${targetName} was removed as a moderator.`);
              break;
            case 'set_mode': {
              // messages for other users
              if (m.targetClientId && m.targetClientId !== CLIENT_ID) {
                Chat.addSystem(`${targetName} was set to ${m.mode} mode.`);
              } else {
                // ack for us
                Chat.addSystem(`You are now in ${m.mode} mode.`);
                try {
                  if (m.mode === 'view') {
                    window.LRMP.VIEW_MODE.enable()
                  } else { // edit mode
                    window.LRMP.VIEW_MODE.disable()
                  }
                } catch (e) { console.warn('lrmp: set_mode handling failed', e); }
              }
              break;
            }
            case 'mute_all':
              Chat.addSystem(m.mute ? 'Chat has been muted.' : 'Chat has been unmuted.');
              break;
            case 'mute':
              Chat.addSystem(m.mute ? `${targetName} was muted.` : `${targetName} was unmuted.`);
              break;
            case 'kick':
              Chat.addSystem(`${targetName} was kicked. (it says undefined bc it's the worst curse word in all of math)`);
              break;
            case 'ban':
              Chat.addSystem(`${targetName} was banned. (it says undefined bc it's the worst curse word in all of math)`);
              break;
            case 'perms':
              Chat.addSystem(`Permissions updated.`);
              break;
            case 'permsall':
              Chat.addSystem(`Permissions set to ${m.perms || 'unknown'} for everyone.`);
              break;
            default:
              Chat.addSystem(((m.ok === false) ? 'Failed: ' : 'OK: ') + (m.action || 'server'));
              break;
          }
        }

        const forMe = (typeof m.clientId === 'undefined') || m.clientId === CLIENT_ID;

        // hello ack
        if (m.type === 'hello_ack' && forMe) {
          if (m.success) {
          Chat.addSystem(m.connectedMessage);
          Chat.show();
          } else {
          Chat.addSystem('Failed to connect: outdated version! Opening new version in 2 seconds!');
            setTimeout(() => {
            window.open('http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/lrmp.user.js')
            this.toggleActive();
            }, 2000)
          }
        }

        // join ack
        if (m.type === 'join_ack' && forMe) {
          if (m.success) {
            this.setState({ panel: 'none', inTrackId: m.trackId || this.state.inTrackId });
            window.LRMP.currentTrackId = m.trackId || null;
            Chat.addSystem('Joined track');
          } else {
            Chat.addSystem('Failed to join: ' + (m.reason || 'unknown'));
          }
        }

        // host ack
        if (m.type === 'host_ack' && forMe) {
          if (m.success) {
            this.setState({ panel: 'none', inTrackId: m.trackId || this.state.inTrackId, isHost: true });
            window.LRMP.currentTrackId = m.trackId || null;
            Chat.addSystem('Now hosting track');
            // publish full engine
            try {
              const snap = buildTrackData();
              if (snap && window.LRMP._wsSend) {
                window.LRMP._wsSend({ type: 'track', clientId: CLIENT_ID, trackData: snap, trackId: m.trackId });
              }
            } catch (e) {}
          } else {
            Chat.addSystem('Failed to host: ' + (m.reason || 'unknown'));
          }
        }

        // leave ack
        if (m.type === 'leave_ack' && forMe) {
          if (m.success) {
            this.setState({ inTrackId: null, participants: [], isHost: false });
            window.LRMP.currentTrackId = null;
            window.LRMP.history = [{undo: [], redo: []}];
            window.LRMP.historyIndex = 0;
            window.LRMP.entities = [];
            window.store.dispatch(setEditScene(new Millions.Scene()));
            Chat.addSystem('Left track');
          } else {
            Chat.addSystem('Failed to leave: ' + (m.reason || 'unknown'));
          }
        }

        // end ack: when track ended by host or host's end succeeded
        if (m.type === 'end_ack' && forMe) {
            this.setState({ inTrackId: null, participants: [], isHost: false });
            window.LRMP.currentTrackId = null;
            window.LRMP.history = [{undo: [], redo: []}];
            window.LRMP.historyIndex = 0;
            window.LRMP.entities = [];
            window.store.dispatch(setEditScene(new Millions.Scene()));
          if (m.success) {
            Chat.addSystem('Track ended');
          } else {
            Chat.addSystem('Track ended: ' + (m.reason || 'unknown'));
          }
        }
      }

      onChatHidden() { this.setState({ chatVisible: false }); }

      onParticipants(ev) {
        const d = ev.detail || {};
        const hostId = d.hostClientId || null;
        const list = Array.isArray(d.participants) ? d.participants.slice() : [];

        // save my metadata if present in list
        for (const p of list) {
          if (p.clientId === CLIENT_ID) {
            const prevModeLocal = (window.LRMP.myMeta && window.LRMP.myMeta.mode) ? window.LRMP.myMeta.mode : null;
            window.LRMP.myMeta = { perms: p.perms || 'edit', mode: p.mode || 'edit', muted: !!p.muted, isMod: !!p.isMod, isHost: p.clientId === hostId }; // i dont actually use the mode one at all
          }
        }

        // builds maps to detect joins/left/name-changes
        const prevMap = this.prevParticipantsMap || {};
        const currMap = {};
        list.forEach(p => currMap[p.clientId] = p.username || 'Anonymous');

        const prevIds = Object.keys(prevMap);
        const nowIds = list.map(x=>x.clientId);
        const joined = nowIds.filter(x => !prevIds.includes(x));
        const left = prevIds.filter(x => !nowIds.includes(x));

        joined.forEach(cid => {
          const p = list.find(pp => pp.clientId === cid);
          if (p) Chat.addSystem((p.username || 'Someone') + ' joined the track');
        });
        left.forEach(cid => {
          const oldName = prevMap[cid] || cid;
          Chat.addSystem(oldName + ' left the track');
        });

        // detect name changes (but suppress if changer was muted or track is muted and changer not host/mod)
        const trackMuted = !!d.muteAll;
        nowIds.forEach(cid => {
          if (prevMap[cid] && currMap[cid] && prevMap[cid] !== currMap[cid]) {
            // find participant entry to see muted/isMod/isHost
            const pEntry = list.find(pp => pp.clientId === cid) || {};
            const isMuted = !!pEntry.muted;
            const isHost = !!pEntry.isHost;
            const isMod = !!pEntry.isMod;
            if (isMuted || (trackMuted && !isHost && !isMod)) {
              // do not announce
            } else {
              Chat.addSystem(`${prevMap[cid]} changed their name to ${currMap[cid]}`);
            }
          }
        });

        // store participants list for lookups
        window.LRMP._lastParticipantsList = list.map(p => ({ clientId: p.clientId, username: p.username || 'Anonymous', isHost: p.clientId === hostId, color: p.color || DEFAULT_COLOR, isMod: !!p.isMod, muted: !!p.muted, perms: p.perms || 'edit', mode: p.mode || 'edit' }));

        const friendly = list.map(p => ({ clientId: p.clientId, username: p.username || 'Anonymous', isHost: p.clientId === hostId, color: p.color || DEFAULT_COLOR, isMod: !!p.isMod, muted: !!p.muted, perms: p.perms || 'edit', mode: p.mode || 'edit' }));
        this.setState({ participants: friendly, inTrackId: d.trackId || null, isHost: CLIENT_ID === hostId });

        // track metadata
        try {
          const serverShareLayers = !!d.shareLayers;
            window.LRMP.shareLayers = serverShareLayers;
        } catch (e) {}

        this.prevParticipantsMap = list.reduce((acc, p) => { acc[p.clientId] = p.username || 'Anonymous'; return acc; }, {});
        if (d.name) window.LRMP.currentTrackName = d.name;
      }

      saveSettings() {
        const nm = (this.state.username || '').trim(); if (!nm) { Chat.addSystem('Username empty'); return; }
        const color = this.state.color || DEFAULT_COLOR;
        SAFE_SET(USERNAME_KEY, nm); SAFE_SET(COLOR_KEY, color);
        Chat.addSystem('Saved username: ' + nm);
        if (window.LRMP._wsSend) window.LRMP._wsSend({ type: 'update_username', clientId: CLIENT_ID, username: nm, color });
        this.setState({ username: nm, settingsOpen: false });
      }

      togglePanel(panel) {
        const next = this.state.panel === panel ? 'none' : panel;
        this.setState({ panel: next });
        if (next === 'load') {
          if (!this.state.transportReady) this.startP2PGuest();
        } else if (next === 'host') {
          if (!this.state.transportReady) this.startP2PHost();
        }
      }

      requestHost() {
        const snap = buildTrackData();
        if (!snap) { Chat.addSystem('Failed to read engine snapshot; cannot host'); return; }
        const payload = { name: this.state.hostDisplayName || (window.LRMP.currentTrackName || `${this.state.username}'s Track`), host: this.state.username || '', engine: snap };
        Chat.addSystem('Requesting host...');
          if (window.LRMP._wsSend) {
              window.LRMP._wsSend({ type: 'host_track', payload, clientId: CLIENT_ID, settings: {shareLayers: !!this.state.shareLayers} });
          }
      }

      leaveTrack() {
        if (!this.state.inTrackId) { Chat.addSystem('Not in track'); return; }
        if (window.LRMP._wsSend) window.LRMP._wsSend({ type: 'leave_track', trackId: this.state.inTrackId, clientId: CLIENT_ID });
        Chat.addSystem('Requesting leave...');
        // disconnect
        this.backToConnectChooser();
      }

      endHosting() {
        if (!this.state.inTrackId) return;
        if (window.LRMP._wsSend) window.LRMP._wsSend({ type: 'end_track', trackId: this.state.inTrackId, clientId: CLIENT_ID });
        Chat.addSystem('End hosting requested');
        // Ending the track ends the whole session -- disconnect every
        // connected guest and tear down the host engine. Small delay so the
        // end_track message above (dispatched via a deferred loopback) has
        // actually reached everyone before their connections get closed.
        setTimeout(() => this.backToConnectChooser(), 100);
      }

      kickClient(cid) {
        if (!this.state.inTrackId) return;
        if (window.LRMP._wsSend) window.LRMP._wsSend({ type: 'kick', trackId: this.state.inTrackId, targetClientId: cid, clientId: CLIENT_ID });
        Chat.addSystem('Kick requested');
      }

      // for host editing page
      saveHostChanges() {
        if (!this.state.inTrackId || !this.state.isHost) return;
        const payload = { name: this.state.hostDisplayName || (window.LRMP.currentTrackName || 'Track') };
        if (window.LRMP && window.LRMP._wsSend) {
          window.LRMP._wsSend({ type: 'update_track', trackId: this.state.inTrackId, payload, settings: {shareLayers: !!this.state.shareLayers} });
          Chat.addSystem('Host settings saved.');
        }
      }

      setShareLayers(on) {
        this.setState({ shareLayers: !!on});
      }

    toggleActive() {
      const next = !this.state.active;
      if (next) {
        // Opening the panel doesn't connect to anything by itself anymore --
        // clicking "Host a P2P session" or "Join a P2P session" (the
        // Host/Load tabs below) is what actually starts a transport, via
        // startP2PHost() / startP2PGuest().
        this.setState({ active: true, connecting: false, failedToConnect: false, transportReady: false, connectMode: null }, () => {
          SAFE_SET(USERNAME_KEY, this.state.username);
          SAFE_SET(COLOR_KEY, this.state.color || DEFAULT_COLOR);
        });
      } else {
        if (ws) try { ws.close(); } catch (e) {}
        try { P2P.teardown(); } catch (e) {}
        window.LRMP._wsSend = null;
        window.LRMP._wsOpen = false;

        // disable/uninstall things before flipping active off
        try { uninstallCommandMirrors(); } catch (e) { console.warn("uninstallCommandMirrors failed:", e); }
        try { uninstallEngineMirrors(); } catch (e) { console.warn("uninstallEngineMirrors failed:", e); }
        try { uninstallDispatchDetector(); } catch (e) { console.warn("uninstallDispatchDetector failed:", e); }

        window.LRMP.active = false;
        Chat.hide();
        this.setState({ active: false, connecting: false, transportReady: false, connectMode: null, inTrackId: null, participants: [], isHost: false, chatVisible: false });
        window.LRMP.currentTrackId = null;
        window.LRMP.history = [{undo: [], redo: []}];
        window.LRMP.historyIndex = 0;
        window.LRMP.entities = [];
        window.store.dispatch(setEditScene(new Millions.Scene()));
        window.LRMP.VIEW_MODE.disable()
      }
    }

    // ---- connection actions (called from the Host/Load tabs) ----

    // Not wired to any button anymore (removed per request), but left here
    // in case you want a way back to the dedicated-server mode later --
    // lrmp_server.js itself wasn't touched, this still works with it as-is.
    connectViaLegacyServer() {
      this.setState({ connectMode: 'ws', connecting: true, failedToConnect: false });
      connectWS((ok) => {
        if (ok) document.dispatchEvent(new CustomEvent('lrmp_transport_ready'));
        else document.dispatchEvent(new CustomEvent('lrmp_transport_failed', { detail: { reason: 'ws' } }));
      });
    }

    startP2PHost() {
      this.setState({ connectMode: 'p2p-host', connecting: false, failedToConnect: false, p2pError: null, p2pDiag: '' });
      try {
        P2P.hostBegin(); // local loopback registration; dispatches lrmp_transport_ready itself
      } catch (e) {
        this.setState({ p2pError: String((e && e.message) || e) });
      }
    }

    async createP2PInvite() {
      this.setState({ p2pError: null, p2pDiag: '', p2pCreatingInvite: true });
      try {
        const { guestClientId, code } = await P2P.hostCreateInvite();
        this.setState({ p2pPendingGuestId: guestClientId, p2pOfferCode: code, p2pAnswerInput: '', p2pCreatingInvite: false });
      } catch (e) {
        this.setState({ p2pError: String((e && e.message) || e), p2pCreatingInvite: false });
      }
    }

    async submitP2PAnswer() {
      this.setState({ p2pError: null, p2pDiag: '' });
      try {
        await P2P.hostAcceptAnswer(this.state.p2pPendingGuestId, this.state.p2pAnswerInput);
        // Don't declare success yet -- keep p2pPendingGuestId set so
        // onP2PPeerConnected/onP2PInviteStatus (real confirmation, once the
        // channel actually opens, or a definitive failure) can match against
        // it and update the UI themselves.
        this.setState({ p2pOfferCode: '', p2pAnswerInput: '' });
      } catch (e) {
        this.setState({ p2pError: String((e && e.message) || e) });
      }
    }

    startP2PGuest() {
      this.setState({ connectMode: 'p2p-guest', connecting: false, failedToConnect: false, p2pError: null, p2pDiag: '', p2pOfferInput: '', p2pAnswerCode: '' });
    }

    async submitP2POffer() {
      this.setState({ connecting: true, p2pError: null, p2pDiag: '' });
      try {
        const answerCode = await P2P.guestAcceptOffer(this.state.p2pOfferInput);
        this.setState({ p2pAnswerCode: answerCode, connecting: false });
        // lrmp_transport_ready fires on its own once the channel actually opens
      } catch (e) {
        this.setState({ p2pError: String((e && e.message) || e), connecting: false });
      }
    }

    backToConnectChooser() {
      try { P2P.teardown(); } catch (e) {}
      if (ws) try { ws.close(); } catch (e) {}
      window.LRMP._wsSend = null;
      window.LRMP._wsOpen = false;
      window.LRMP.currentTrackId = null;
      this.setState({ connectMode: null, connecting: false, failedToConnect: false, transportReady: false, p2pError: null, p2pDiag: '', p2pOfferCode: '', p2pAnswerCode: '', p2pOfferInput: '', p2pAnswerInput: '', p2pPendingGuestId: null, panel: 'none', inTrackId: null, participants: [], isHost: false });
    }

    toggleHidden() {
      this.setState({ hidden: !this.state.hidden });
    }

    toggleParticipantViewMode(p) {
      if (p.mode === 'view') {
        if (!p.isMod && !p.isHost) document.dispatchEvent(new CustomEvent('lrmp_chat_send', { detail: { text: `/perms ${p.username} edit`, files: null } })); // i think this is funny. it reminds me of getting lazy when making minecraft server plugins
        document.dispatchEvent(new CustomEvent('lrmp_chat_send', { detail: { text: `/mode ${p.username} edit`, files: null } }));
      } else {
        if (!p.isMod && !p.isHost) document.dispatchEvent(new CustomEvent('lrmp_chat_send', { detail: { text: `/perms ${p.username} view`, files: null } }));
        document.dispatchEvent(new CustomEvent('lrmp_chat_send', { detail: { text: `/mode ${p.username} view`, files: null } }));
      }
    }

      showChat() { Chat.show(); this.setState({ chatVisible: true }); }

      renderParticipant(p) {
        const emojiButtonProps = (title, onClick) => ({
          title,
          onClick,
          style: { padding: "2px 2px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "4px", lineHeight: 1,fontSize: "1em" },
          onMouseEnter: (ev) => { ev.target.style.background = "#f0f0f0"; },
          onMouseLeave: (ev) => { ev.target.style.background = "transparent"; },
          onMouseDown: (ev) => { ev.target.style.background = "#d0d0d0"; },
          onMouseUp: (ev) => { ev.target.style.background = "#f0f0f0"; }
        });
        const e = React.createElement;
        const myMeta = window.LRMP && window.LRMP.myMeta ? window.LRMP.myMeta : { isMod:false };
        const subtitle = p.muted ? 'Muted' : '';
        return e('div', { key: p.clientId, style: { border:'1px solid #eee', padding:'6px', marginBottom:'6px', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:'6px', background:'#fff' } }, [
          e('div', null,
            e('div', { style: { fontWeight:700, color: p.color || DEFAULT_COLOR } },
            (myMeta.isMod || myMeta.isHost) ? e("button", emojiButtonProps(`Toggle Mode`, () => this.toggleParticipantViewMode(p)), p.mode === 'view' ? '👁️‍🗨️' : '✏️') : p.mode === 'view' ? '👁️‍🗨️' : '✏️',
              `${p.username?.length > 12 ? p.username.slice(0, 12) + '...' : p.username || 'Anonymous'}`),
            subtitle ? e('div', { style: { fontSize:11, color:'#666' } }, subtitle) : null
          ),
          e('div', null,
            p.isHost ? e('span', { style: { padding:'2px 2px', borderRadius:'4px', }}, '👑') : null,
            (!this.state.isHost && !p.isHost) ? (p.isMod) ? e('span', { style: { padding:'2px 2px', borderRadius:'4px', }}, '🛡️') : '👤' : null,
            this.state.isHost && !p.isHost ? (p.isMod
                                              ? e('button', emojiButtonProps(`Deop`, ()=>{ if (window.LRMP._wsSend) window.LRMP._wsSend({ type:'set_mod', trackId: this.state.inTrackId, targetClientId: p.clientId, grant: false }); Chat.addSystem('Requested deop: ' + p.username); }), '🛡️')
                                              : e('button', emojiButtonProps(`Op`, ()=>{ if (window.LRMP._wsSend) window.LRMP._wsSend({ type:'set_mod', trackId: this.state.inTrackId, targetClientId: p.clientId, grant: true }); Chat.addSystem('Requested op: ' + p.username); } ), '👤')) : null
          )
        ]);
      }

      // Paste-code / generate-answer UI for joining a P2P session. Embedded
      // directly in the "Join a P2P session" tab body (see render()) rather
      // than a separate screen, since there's no longer a track directory
      // to browse until you've actually connected to someone's session.
      renderP2PGuestConnect() {
        const e = React.createElement;
        const mono = { width: '100%', minHeight: 70, fontFamily: 'monospace', fontSize: 11, marginTop: 6, marginBottom: 6, boxSizing: 'border-box' };
        const errNode = this.state.p2pError ? e('div', { style: { color: '#b00020', fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap' } }, this.state.p2pError) : null;
        const copyBtn = (text, label, stateKey) => e('button', { style: { marginRight: 6 }, onClick: () => {
          try { navigator.clipboard.writeText(text); } catch (e) {}
          this.setState({ [stateKey]: true });
          clearTimeout(this['_' + stateKey + 'Timer']);
          this['_' + stateKey + 'Timer'] = setTimeout(() => this.setState({ [stateKey]: false }), 1500);
        } }, this.state[stateKey] ? 'Copied!' : (label || 'Copy'));

        const body = !this.state.p2pAnswerCode
          ? e('div', null,
              e('div', { style: { marginBottom: 6 } }, "Paste the invite code your friend sent you:"),
              e('textarea', { value: this.state.p2pOfferInput, onChange: ev => this.setState({ p2pOfferInput: ev.target.value }), style: mono }),
              e('button', { style: { width: '100%' }, disabled: this.state.connecting, onClick: () => this.submitP2POffer() }, this.state.connecting ? 'Generating...' : 'Generate answer code')
            )
          : e('div', null,
              e('div', { style: { marginBottom: 6 } }, 'Send this answer code back to your friend:'),
              e('textarea', { readOnly: true, value: this.state.p2pAnswerCode, style: mono, onFocus: ev => ev.target.select() }),
              copyBtn(this.state.p2pAnswerCode, 'Copy answer code', 'p2pAnswerCopied'),
              e('div', { style: { marginTop: 6, fontSize: 11, color: '#666' } }, 'Waiting for your friend to accept...'),
              this.state.p2pDiag ? e('div', { style: { marginTop: 4, fontSize: 10, color: '#999', fontFamily: 'monospace' } }, this.state.p2pDiag) : null
            );

        return e('div', { style:{ border:'1px solid #ddd', padding:8, borderRadius:6, background:'#fafafa', marginBottom:8 } },
          body, errNode,
          e('button', { style: { marginTop: 10 }, onClick: () => this.backToConnectChooser() }, 'Cancel')
        );
      }

      render() {
        const e = React.createElement;
        const connectingIndicator = this.state.connecting ? e('div', { style:{ marginBottom:6, color:'#444' } }, 'Connecting...') : null;
        const failedToConnect = this.state.failedToConnect ? e('div', { style:{ marginBottom:6, color:'#444', whiteSpace: 'pre-wrap', textAlign: 'left'} }, 'Failed to connect. Try:\n\n- turning off any ad blockers\n- tell xaivlr computer turn on multiplaye r') : null;

        const emojiButtonProps = (title, onClick) => ({
          title,
          onClick,
          style: { padding: "2px 2px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "4px", lineHeight: 1,fontSize: "1em" },
          onMouseEnter: (ev) => { ev.target.style.background = "#f0f0f0"; },
          onMouseLeave: (ev) => { ev.target.style.background = "transparent"; },
          onMouseDown: (ev) => { ev.target.style.background = "#d0d0d0"; },
          onMouseUp: (ev) => { ev.target.style.background = "#f0f0f0"; }
        });

        if (!this.state.active) {
          return e('div', null, connectingIndicator, e('button', { onClick: ()=>this.toggleActive()}, 'Multiplayer Mod'));
        } else if (this.state.hidden) {
          return e('div', null, e('button', { style: { width:'100%', backgroundColor: 'lightblue' }, onClick: ()=>this.toggleHidden() }, 'Multiplayer Mod'))
        }

        const inTrackName = window.LRMP.currentTrackName || (this.state.inTrackId ? 'In track' : null);

        return e('div', null,
          connectingIndicator, failedToConnect,

          // Settings header
          e('div', { style: { marginBottom:8, cursor:'pointer' }, onClick: ()=>this.setState({ settingsOpen: !this.state.settingsOpen }) },
            e('span', null, this.state.settingsOpen ? '▲' : '▼'),
            e('label', { style: { marginLeft:6 } }, 'User Settings')
          ),

          this.state.settingsOpen ? e('div', { style: { marginTop:6, border:'1px solid #ddd', padding:8, borderRadius:6, background:'#fafafa' } }, [
            e('div', null, 'Username:'),
            e('input', { value: this.state.username, onChange: ev=>this.setState({ username: ev.target.value }), style: { width:'100%', marginBottom:8 } }),
            e('div', { style: { display:'flex', alignItems:'center', gap:8, marginBottom:8 } },
              e('div', null, 'Color:'),
              e('input', { type:'color', value: this.state.color || DEFAULT_COLOR, onChange: ev=>this.setState({ color: ev.target.value }) })
            ),
            e('div', null, e('button', { onClick: ()=>this.saveSettings() }, 'Save Changes'))
          ]) : null,

          // Load / Host toggle
          e('div', { style: { display:'flex', gap:8, marginTop:8, marginBottom:8 } },
            (!window.LRMP.currentTrackId ? e('button', { onClick: ()=>this.togglePanel('load'), style: this.state.panel === 'load' ? { backgroundColor: 'lightblue' } : null }, 'Join Track') : null),
            (this.state.isHost || (!window.LRMP.currentTrackId && !(this.state.connectMode === 'p2p-guest' && this.state.transportReady)))
              ? e('button', { onClick: ()=>this.togglePanel('host'), style: this.state.panel === 'host' ? { backgroundColor: 'lightblue' } : null }, this.state.isHost ? 'Host Track Settings' : 'Host Track') : null
          ),

          // Join tab
          this.state.panel === 'load' ? (
            !this.state.transportReady
              ? this.renderP2PGuestConnect()
              : (!this.state.inTrackId
                  ? e('div', { style:{ border:'1px solid #ddd', padding:8, borderRadius:6, background:'#fafafa', marginBottom:8 } },
                      e('div', null, "Connected. Waiting for the host to start a track..."))
                  : null) // already in the track -- the in-track panel below covers it
          ) : null,

          // Host panel
          this.state.panel === 'host' ? e('div', { style:{ border:'1px solid #ddd', padding:8, borderRadius:6, background:'#fafafa', marginBottom:8 } }, [
            e('div', { style: { textAlign: 'left' } }, 'Track Name:'),
            e('input', { placeholder: `${this.state.username}'s Track`, value: this.state.hostDisplayName || (window.LRMP.currentTrackName || ''), onChange: ev=>this.setState({ hostDisplayName: ev.target.value }), style:{ width:'100%', marginBottom:8 } }),
            e("div", { style: { height: "1px", backgroundColor: "#ccc", margin: "8px 0", flex: "0 0 auto" } }), // divider

            // extra settings
              e('div', { style:{ marginTop:6 } }, e('label', null, e('input', { type:'checkbox', checked: this.state.shareLayers, onChange: ev=>{ this.setShareLayers(ev.target.checked); }}), ' Shared Layers')),
            e("div", { style: { height: "1px", backgroundColor: "#ccc", margin: "8px 0", flex: "0 0 auto" } }), // divider

            this.state.isHost ? e('div', null, e('button', { onClick: ()=>this.saveHostChanges() }, 'Save Changes'))
            : e('div', null, e('button', { onClick: ()=>this.requestHost() }, 'Confirm'))
          ]) : null,

          (this.state.inTrackId) ? e('div', { style:{ marginTop:8, padding:8, borderRadius:6, border:'1px solid #eee', background:'#fff' } }, [
            e('div', { style:{ fontSize:13, color:'#333', fontWeight:700 } }, inTrackName || 'In track'),
            e('div', { style:{ marginTop:6 } }, this.state.inTrackId ? [
              e('div', { style:{ fontWeight:700, marginBottom:6 } }, 'Participants:'),
              (this.state.participants && this.state.participants.length) ? this.state.participants.map(p => this.renderParticipant(p)) : e('div', null, 'No participants yet'),
              e('div', { style:{ marginTop:8, display:'flex', gap:8 } }, this.state.isHost ? e('button', { onClick: ()=>this.endHosting() }, 'End Hosting') : e('button', { onClick: ()=>this.leaveTrack() }, 'Leave Track')),
              (this.state.connectMode === 'p2p-host') ? e('div', { style:{ marginTop:10, borderTop:'1px solid #eee', paddingTop:8 } },
                !this.state.p2pPendingGuestId
                  ? e('button', { onClick: ()=>this.createP2PInvite(), disabled: this.state.p2pCreatingInvite }, this.state.p2pCreatingInvite ? 'Generating invite code...' : '+ Invite another peer')
                  : this.state.p2pOfferCode
                  ? e('div', null,
                      e('div', { style:{ fontSize:11, marginBottom:4 } }, 'Send this code to your friend:'),
                      e('textarea', { readOnly: true, value: this.state.p2pOfferCode, style: { width:'100%', minHeight:60, fontFamily:'monospace', fontSize:11, boxSizing:'border-box' }, onFocus: ev => ev.target.select() }),
                      e('button', { onClick: () => { try { navigator.clipboard.writeText(this.state.p2pOfferCode); } catch (e) {} this.setState({ p2pOfferCopied: true }); clearTimeout(this._p2pOfferCopiedTimer); this._p2pOfferCopiedTimer = setTimeout(() => this.setState({ p2pOfferCopied: false }), 1500); } }, this.state.p2pOfferCopied ? 'Copied!' : 'Copy invite code'),
                      e('div', { style:{ fontSize:11, margin:'6px 0 2px' } }, "Paste their answer code:"),
                      e('textarea', { value: this.state.p2pAnswerInput, onChange: ev => this.setState({ p2pAnswerInput: ev.target.value }), style: { width:'100%', minHeight:60, fontFamily:'monospace', fontSize:11, boxSizing:'border-box' } }),
                      e('button', { onClick: ()=>this.submitP2PAnswer() }, 'Connect peer'),
                      this.state.p2pError ? e('div', { style:{ color:'#b00020', fontSize:11, marginTop:4 } }, this.state.p2pError) : null
                    )
                  : e('div', null,
                      e('div', { style:{ fontSize:11, color:'#666' } }, 'Connecting to peer...'),
                      this.state.p2pDiag ? e('div', { style:{ marginTop:4, fontSize:10, color:'#999', fontFamily:'monospace' } }, this.state.p2pDiag) : null,
                      this.state.p2pError ? e('div', { style:{ color:'#b00020', fontSize:11, marginTop:4, whiteSpace:'pre-wrap' } }, this.state.p2pError) : null,
                      e('button', { style:{ marginTop:6 }, onClick: () => { P2P.cancelInvite(this.state.p2pPendingGuestId); this.setState({ p2pPendingGuestId: null, p2pError: null, p2pDiag: '' }); } }, 'Cancel')
                    )
              ) : null
            ] : null)
          ]) : null,

          (!this.state.chatVisible && !this.state.connecting) ? e('div', { style:{ marginTop:8 } }, e('button', { onClick: ()=>this.showChat() }, 'Show Chat')) : null,

          (this.state.inTrackId) ? e('div', { style:{ marginTop:10 } }, e('button', { style: { width:'100%', backgroundColor: 'lightblue' }, onClick: ()=>this.toggleHidden() }, 'Multiplayer Mod'))
                 : e('div', { style:{ marginTop:10 } }, e('button', { style: { width:'100%', backgroundColor: 'lightblue' }, onClick: ()=>this.toggleActive() }, 'Multiplayer Mod'))
        );
      }
    }

    window.registerCustomSetting(MultiplayerModComponent);
  }

  if (window.registerCustomSetting) main(); else {
    const prevCb = window.onCustomToolsApiReady;
    window.onCustomToolsApiReady = () => { if (prevCb) prevCb(); main(); };
  }

})();