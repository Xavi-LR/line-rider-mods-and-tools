// ==UserScript==
// @name         Line Rider Layer FX
// @namespace    https://linerider.com/
// @author       xavi
// @description  layer opacity, blur, blend modes, gradients, parallax, and keyframes that save to track file
// @version      1.10.6
// @license      LGPL 3; https://www.gnu.org/licenses/lgpl-3.0.en.html#license-text

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*
// @icon         https://www.linerider.com/favicon.ico

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-layer-fx.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-layer-fx.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools

// @match        https://www.linerider.com/*
// @match        https://linerider.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    var LAYER_TYPE_LAYER = 0;
    var LAYER_TYPE_FOLDER = 1;
    var TRACK_FX_KEY = 'layerFX';
    var TRACK_FX_VERSION = 7;

    var GRADIENT_EDITOR_Z = 1000001;
    var UI_SCAN_INTERVAL_MS = 500;
    var RENDER_SCAN_INTERVAL_MS = 500;
    var MAX_BLUR_PX = 50;

    var BLEND_MODES = [
        { value: 'normal', label: 'Normal' },
        { value: 'multiply', label: 'Multiply' },
        { value: 'screen', label: 'Screen' },
        { value: 'overlay', label: 'Overlay' },
        { value: 'darken', label: 'Darken' },
        { value: 'lighten', label: 'Lighten' },
        { value: 'color-dodge', label: 'Color Dodge' },
        { value: 'color-burn', label: 'Color Burn' },
        { value: 'hard-light', label: 'Hard Light' },
        { value: 'soft-light', label: 'Soft Light' },
        { value: 'difference', label: 'Difference' },
        { value: 'exclusion', label: 'Exclusion' },
        { value: 'hue', label: 'Hue' },
        { value: 'saturation', label: 'Saturation' },
        { value: 'color', label: 'Color' },
        { value: 'luminosity', label: 'Luminosity' },
        { value: 'invert', label: 'Invert Colors' }
    ];

    var BLEND_MODE_CODES = {
        normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5,
        'color-dodge': 6, 'color-burn': 7, 'hard-light': 8, 'soft-light': 9,
        difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15
    };

    var COMPOSITE_VERTEX_SRC = [
        'attribute vec2 aPos;',
        'varying vec2 vUv;',
        'void main() {',
        '    vUv = aPos * 0.5 + 0.5;',
        '    gl_Position = vec4(aPos, 0.0, 1.0);',
        '}'
    ].join('\n');

    var COMPOSITE_FRAGMENT_SRC = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uSrc;',
        'uniform sampler2D uDst;',
        'uniform float uOpacity;',
        'uniform int uBlendMode;',
        'uniform bool uInvert;',
        '',
        'float lumOf(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }',
        '',
        'vec3 clipColor(vec3 c) {',
        '    float l = lumOf(c);',
        '    float n = min(min(c.r, c.g), c.b);',
        '    float x = max(max(c.r, c.g), c.b);',
        '    if (n < 0.0) c = l + (c - l) * (l / max(l - n, 0.0001));',
        '    if (x > 1.0) c = l + (c - l) * ((1.0 - l) / max(x - l, 0.0001));',
        '    return c;',
        '}',
        '',
        'vec3 setLum(vec3 c, float l) { return clipColor(c + vec3(l - lumOf(c))); }',
        '',
        'float satOf(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }',
        '',
        'vec3 setSat(vec3 c, float s) {',
        '    float cmax = max(max(c.r, c.g), c.b);',
        '    float cmin = min(min(c.r, c.g), c.b);',
        '    if (cmax > cmin) return (c - vec3(cmin)) * (s / (cmax - cmin));',
        '    return vec3(0.0);',
        '}',
        '',
        'vec3 blendChannel(int mode, vec3 cb, vec3 cs) {',
        '    if (mode == 1) return cb * cs;',
        '    if (mode == 2) return cb + cs - cb * cs;',
        '    if (mode == 3) {',
        '        vec3 lo = 2.0 * cb * cs;',
        '        vec3 hi = vec3(1.0) - 2.0 * (vec3(1.0) - cb) * (vec3(1.0) - cs);',
        '        return vec3(cb.r <= 0.5 ? lo.r : hi.r, cb.g <= 0.5 ? lo.g : hi.g, cb.b <= 0.5 ? lo.b : hi.b);',
        '    }',
        '    if (mode == 4) return min(cb, cs);',
        '    if (mode == 5) return max(cb, cs);',
        '    if (mode == 6) {',
        '        return vec3(',
        '            cs.r >= 1.0 ? 1.0 : min(1.0, cb.r / (1.0 - cs.r)),',
        '            cs.g >= 1.0 ? 1.0 : min(1.0, cb.g / (1.0 - cs.g)),',
        '            cs.b >= 1.0 ? 1.0 : min(1.0, cb.b / (1.0 - cs.b))',
        '        );',
        '    }',
        '    if (mode == 7) {',
        '        return vec3(',
        '            cs.r <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.r) / cs.r),',
        '            cs.g <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.g) / cs.g),',
        '            cs.b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.b) / cs.b)',
        '        );',
        '    }',
        '    if (mode == 8) {',
        '        vec3 lo = 2.0 * cb * cs;',
        '        vec3 hi = vec3(1.0) - 2.0 * (vec3(1.0) - cb) * (vec3(1.0) - cs);',
        '        return vec3(cs.r <= 0.5 ? lo.r : hi.r, cs.g <= 0.5 ? lo.g : hi.g, cs.b <= 0.5 ? lo.b : hi.b);',
        '    }',
        '    if (mode == 9) {',
        '        vec3 d = vec3(',
        '            cb.r <= 0.25 ? ((16.0 * cb.r - 12.0) * cb.r + 4.0) * cb.r : sqrt(cb.r),',
        '            cb.g <= 0.25 ? ((16.0 * cb.g - 12.0) * cb.g + 4.0) * cb.g : sqrt(cb.g),',
        '            cb.b <= 0.25 ? ((16.0 * cb.b - 12.0) * cb.b + 4.0) * cb.b : sqrt(cb.b)',
        '        );',
        '        vec3 lo = cb - (vec3(1.0) - 2.0 * cs) * cb * (vec3(1.0) - cb);',
        '        vec3 hi = cb + (2.0 * cs - vec3(1.0)) * (d - cb);',
        '        return vec3(cs.r <= 0.5 ? lo.r : hi.r, cs.g <= 0.5 ? lo.g : hi.g, cs.b <= 0.5 ? lo.b : hi.b);',
        '    }',
        '    if (mode == 10) return abs(cb - cs);',
        '    if (mode == 11) return cb + cs - 2.0 * cb * cs;',
        '    if (mode == 12) return setLum(setSat(cs, satOf(cb)), lumOf(cb));',
        '    if (mode == 13) return setLum(setSat(cb, satOf(cs)), lumOf(cb));',
        '    if (mode == 14) return setLum(cs, lumOf(cb));',
        '    if (mode == 15) return setLum(cb, lumOf(cs));',
        '    return cs;',
        '}',
        '',
        'void main() {',
        '    vec4 src = texture2D(uSrc, vUv);',
        '    vec4 dst = texture2D(uDst, vUv);',
        '    vec3 cs = uInvert ? (vec3(1.0) - src.rgb) : src.rgb;',
        '    float as = src.a * uOpacity;',
        '    vec3 blended = blendChannel(uBlendMode, dst.rgb, cs);',
        '    gl_FragColor = vec4(mix(dst.rgb, blended, as), 1.0);',
        '}'
    ].join('\n');

    function log() {
        var args = ['[LR Layer FX]'].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }
    function warn() {
        var args = ['[LR Layer FX]'].concat(Array.prototype.slice.call(arguments));
        console.warn.apply(console, args);
    }
    function err() {
        var args = ['[LR Layer FX]'].concat(Array.prototype.slice.call(arguments));
        console.error.apply(console, args);
    }

    var modDisabled = false;

    var settings = new Map();

    var GRADIENT_MODES = [
        { value: 'linear', label: 'Linear' },
        { value: 'radial', label: 'Radial' },
        { value: 'freeform', label: 'Freeform (Points)' },
        { value: 'barycentric', label: 'Barycentric (3 Points)' }
    ];

    function normalizeGradientMode(mode) {

        if (mode === 'idw') mode = 'freeform';
        return GRADIENT_MODES.some(function (m) { return m.value === mode; }) ? mode : 'linear';
    }

    function defaultSetting() {
        return { opacity: 1, blur: 0, blend: 'normal', front: false, visible: true, gradient: null, gradientMode: 'linear', parallax: false, parallaxZ: 0, parallaxPitch: 0, parallaxYaw: 0, parallaxScaleLines: true, keyframes: [] };
    }

    function normalizeHexColor(color) {
        if (typeof color !== 'string') return '#000000';
        var m = color.trim().match(/^#?([0-9a-fA-F]{6})$/);
        return m ? ('#' + m[1].toUpperCase()) : '#000000';
    }

    function normalizeGradient(gradient) {
        if (!gradient || !Array.isArray(gradient.stops)) return null;
        var stops = [];
        gradient.stops.forEach(function (stop) {
            if (!stop || !Number.isFinite(Number(stop.x)) || !Number.isFinite(Number(stop.y))) return;
            stops.push({
                x: Number(stop.x),
                y: Number(stop.y),
                color: normalizeHexColor(stop.color)
            });
        });
        return stops.length ? { stops: stops } : null;
    }

    function normalizeKeyframes(keyframes) {
        if (!Array.isArray(keyframes)) return [];
        var out = [];
        keyframes.forEach(function (kf) {
            if (!kf || !Number.isInteger(Number(kf.frame)) || Number(kf.frame) < 0) return;
            var item = {
                frame: Number(kf.frame),
                opacity: Math.max(0, Math.min(1, typeof kf.opacity === 'number' ? kf.opacity : 1)),
                blur: Math.max(0, Math.min(MAX_BLUR_PX, Number.isFinite(Number(kf.blur)) ? Number(kf.blur) : 0)),
                blend: typeof kf.blend === 'string' ? kf.blend : 'normal',
                visible: kf.visible !== false,
                parallaxZ: Number.isFinite(Number(kf.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(kf.parallaxZ))) : 0,
                parallaxPitch: Number.isFinite(Number(kf.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(kf.parallaxPitch))) : 0,
                parallaxYaw: Number.isFinite(Number(kf.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(kf.parallaxYaw))) : 0
            };
            var g = normalizeGradient(kf.gradient);
            if (g) item.gradient = g;
            else if (typeof kf.color === 'string') item.color = normalizeHexColor(kf.color);
            out.push(item);
        });
        out.sort(function (a, b) { return a.frame - b.frame; });
        var dedup = [];
        out.forEach(function (item) {
            if (dedup.length && dedup[dedup.length - 1].frame === item.frame) dedup[dedup.length - 1] = item;
            else dedup.push(item);
        });
        return dedup;
    }

    function cloneSettingObject(s) {
        return {
            opacity: typeof s.opacity === 'number' ? Math.max(0, Math.min(1, s.opacity)) : 1,
            blur: Number.isFinite(Number(s.blur)) ? Math.max(0, Math.min(MAX_BLUR_PX, Number(s.blur))) : 0,
            blend: typeof s.blend === 'string' ? s.blend : 'normal',
            front: !!s.front,
            visible: s.visible !== false,
            gradient: normalizeGradient(s.gradient),
            gradientMode: normalizeGradientMode(s.gradientMode),
            parallax: !!s.parallax,
            parallaxZ: Number.isFinite(Number(s.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(s.parallaxZ))) : 0,
            parallaxPitch: Number.isFinite(Number(s.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(s.parallaxPitch))) : 0,
            parallaxYaw: Number.isFinite(Number(s.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(s.parallaxYaw))) : 0,
            parallaxScaleLines: s.parallaxScaleLines !== false,
            keyframes: normalizeKeyframes(s.keyframes)
        };
    }

    function getCurrentFrame() {
        try {
            var n = window.Selectors.getPlayerIndex();
            return Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0;
        } catch (e) { return 0; }
    }

    function getFrameForInstance(inst, rig) {
        try {
            if (rig && rig.isSecondary && inst && inst.props) {
                var index = Number(inst.props.index);
                if (Number.isFinite(index) && index >= 0) {
                    return Math.max(0, Math.floor(index));
                }
            }
        } catch (e) {}
        return getCurrentFrame();
    }

    function getFrameCameraZoom(inst, rig) {
        try {
            if (rig && rig.lastCamera && Number.isFinite(Number(rig.lastCamera.zoom)) && Number(rig.lastCamera.zoom) > 0) return Number(rig.lastCamera.zoom);
            if (inst && inst.props && inst.props.camera && Number.isFinite(Number(inst.props.camera.zoom)) && Number(inst.props.camera.zoom) > 0) return Number(inst.props.camera.zoom);
        } catch (e) {}
        return 1;
    }

    function getSetting(layerId) {
        var s = settings.get(layerId);
        if (!s) return defaultSetting();
        return {
            opacity: typeof s.opacity === 'number' ? Math.max(0, Math.min(1, s.opacity)) : 1,
            blur: Number.isFinite(Number(s.blur)) ? Math.max(0, Math.min(MAX_BLUR_PX, Number(s.blur))) : 0,
            blend: typeof s.blend === 'string' ? s.blend : 'normal',
            front: !!s.front,
            visible: s.visible !== false,
            gradient: normalizeGradient(s.gradient),
            gradientMode: normalizeGradientMode(s.gradientMode),
            parallax: !!s.parallax,
            parallaxZ: Number.isFinite(Number(s.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(s.parallaxZ))) : 0,
            parallaxPitch: Number.isFinite(Number(s.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(s.parallaxPitch))) : 0,
            parallaxYaw: Number.isFinite(Number(s.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(s.parallaxYaw))) : 0,
            parallaxScaleLines: s.parallaxScaleLines !== false,
            keyframes: normalizeKeyframes(s.keyframes)
        };
    }

    function isDefaultSetting(s) {
        if (!s) return true;
        var gradient = normalizeGradient(s.gradient);
        return (!('opacity' in s) || s.opacity >= 1) &&
            (!('blur' in s) || !Number(s.blur)) &&
            (!('blend' in s) || s.blend === 'normal' || !s.blend) &&
            !s.front && s.visible !== false && !gradient && normalizeGradientMode(s.gradientMode) === 'linear' && !s.parallax && !Number(s.parallaxZ) && !Number(s.parallaxPitch) && !Number(s.parallaxYaw) && s.parallaxScaleLines !== false && normalizeKeyframes(s.keyframes).length === 0;
    }

    function settingsEqual(a, b) {
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }

    function cleanSettingForTrack(s) {
        var out = {
            opacity: Math.max(0, Math.min(1, typeof s.opacity === 'number' ? s.opacity : 1)),
            blur: Math.max(0, Math.min(MAX_BLUR_PX, Number.isFinite(Number(s.blur)) ? Number(s.blur) : 0)),
            blend: typeof s.blend === 'string' ? s.blend : 'normal',
            front: !!s.front,
            visible: s.visible !== false,
            gradientMode: normalizeGradientMode(s.gradientMode),
            parallax: !!s.parallax,
            parallaxZ: Number.isFinite(Number(s.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(s.parallaxZ))) : 0,
            parallaxPitch: Number.isFinite(Number(s.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(s.parallaxPitch))) : 0,
            parallaxYaw: Number.isFinite(Number(s.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(s.parallaxYaw))) : 0,
            parallaxScaleLines: s.parallaxScaleLines !== false
        };
        var gradient = normalizeGradient(s.gradient);
        if (gradient) {
            out.gradientMode = normalizeGradientMode(s.gradientMode);
            out.gradient = { stops: gradient.stops.map(function (stop) {
                return { x: stop.x, y: stop.y, color: stop.color };
            }) };
        }
        var keyframes = normalizeKeyframes(s.keyframes);
        if (keyframes.length) {
            out.keyframes = keyframes.map(function (kf) {
                var item = { frame: kf.frame, opacity: kf.opacity, blur: Math.max(0, Math.min(MAX_BLUR_PX, Number.isFinite(Number(kf.blur)) ? Number(kf.blur) : 0)), blend: typeof kf.blend === 'string' ? kf.blend : 'normal', visible: kf.visible !== false, parallaxZ: Number.isFinite(Number(kf.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(kf.parallaxZ))) : 0, parallaxPitch: Number.isFinite(Number(kf.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(kf.parallaxPitch))) : 0, parallaxYaw: Number.isFinite(Number(kf.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(kf.parallaxYaw))) : 0 };
                if (kf.gradient) item.gradient = { stops: kf.gradient.stops.map(function (stop) { return { x: stop.x, y: stop.y, color: stop.color }; }) };
                else if (kf.color) item.color = kf.color;
                return item;
            });
        }
        return out;
    }

    function rgbFromHex(color) {
        var c = normalizeHexColor(color).slice(1);
        return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
    }
    function hexFromRgb(c) {
        function h(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase(); }
        return '#' + h(c.r) + h(c.g) + h(c.b);
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(a, b, t) {
        var x = rgbFromHex(a), y = rgbFromHex(b);
        return hexFromRgb({ r: lerp(x.r,y.r,t), g: lerp(x.g,y.g,t), b: lerp(x.b,y.b,t) });
    }
    function keyframeAt(setting, frame) {
        var kfs = normalizeKeyframes(setting && setting.keyframes);
        for (var i=0;i<kfs.length;i++) if (kfs[i].frame === frame) return kfs[i];
        return null;
    }
    function keyframeNeighbors(setting, frame) {
        var kfs = normalizeKeyframes(setting && setting.keyframes), prev = null, next = null;
        for (var i=0;i<kfs.length;i++) {
            if (kfs[i].frame < frame) prev = kfs[i];
            else if (kfs[i].frame > frame) { next = kfs[i]; break; }
        }
        return { prev: prev, next: next, current: keyframeAt(setting, frame) };
    }
    function makeSolidGradientFromColor(color, refGradient) {
        if (!refGradient || !refGradient.stops.length) return null;
        return { stops: refGradient.stops.map(function (s) { return { x: s.x, y: s.y, color: color }; }) };
    }
    function interpolateGradient(a, b, t) {
        var ga = normalizeGradient(a && a.gradient), gb = normalizeGradient(b && b.gradient);
        var ca = !ga ? normalizeHexColor(a && a.color) : null;
        var cb = !gb ? normalizeHexColor(b && b.color) : null;
        if (!ga && !gb) return null;
        var count = ga ? ga.stops.length : gb.stops.length;
        if (count === 0) return null;
        var templateA = ga || makeSolidGradientFromColor(ca, gb);
        var templateB = gb || makeSolidGradientFromColor(cb, ga);
        if (!templateA || !templateB) return null;
        count = Math.max(templateA.stops.length, templateB.stops.length);
        var stops = [];
        for (var i=0;i<count;i++) {
            var sa = templateA.stops[Math.min(i, templateA.stops.length-1)];
            var sb = templateB.stops[Math.min(i, templateB.stops.length-1)];
            stops.push({ x: lerp(sa.x,sb.x,t), y: lerp(sa.y,sb.y,t), color: lerpColor(sa.color,sb.color,t) });
        }
        return { stops: stops };
    }
    function snapshotForKeyframe(layerId, effective) {
        var layer = getLayerById(layerId);
        var frame = getCurrentFrame();
        var item = { frame: frame, opacity: effective.opacity, blur: Math.max(0, Math.min(MAX_BLUR_PX, Number(effective.blur) || 0)), blend: typeof effective.blend === 'string' ? effective.blend : 'normal', visible: effective.visible !== false, parallaxZ: Number.isFinite(Number(effective.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(effective.parallaxZ))) : 0, parallaxPitch: Number.isFinite(Number(effective.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(effective.parallaxPitch))) : 0, parallaxYaw: Number.isFinite(Number(effective.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(effective.parallaxYaw))) : 0 };
        if (layer && layer.type === LAYER_TYPE_LAYER) {
            var g = normalizeGradient(effective.gradient);
            if (g) item.gradient = g;
            else item.color = normalizeHexColor(effective.color || getLayerColor(layerId));
        }
        return item;
    }
    function getEffectiveSetting(layerId, frame) {
        var base = cloneSettingObject(getSetting(layerId));
        var kfs = normalizeKeyframes(base.keyframes);
        if (!kfs.length) return base;
        frame = Number.isFinite(Number(frame)) ? Math.max(0, Math.floor(Number(frame))) : getCurrentFrame();
        var exact = null, prev = null, next = null;
        for (var i=0;i<kfs.length;i++) {
            if (kfs[i].frame === frame) exact = kfs[i];
            else if (kfs[i].frame < frame) prev = kfs[i];
            else if (kfs[i].frame > frame) { next = kfs[i]; break; }
        }
        if (!prev && !next && exact) { prev = exact; }
        if (exact) {
            base.opacity = exact.opacity;
            base.blur = exact.blur;
            base.blend = typeof exact.blend === 'string' ? exact.blend : base.blend;
            base.visible = exact.visible !== false;
            base.parallaxZ = Number.isFinite(Number(exact.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(exact.parallaxZ))) : base.parallaxZ;
            base.parallaxPitch = Number.isFinite(Number(exact.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(exact.parallaxPitch))) : base.parallaxPitch;
            base.parallaxYaw = Number.isFinite(Number(exact.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(exact.parallaxYaw))) : base.parallaxYaw;
            if (exact.gradient) { base.gradient = normalizeGradient(exact.gradient); base.color = undefined; }
            else if (exact.color) { base.gradient = null; base.color = normalizeHexColor(exact.color); }
            return base;
        }
        if (prev && next) {
            var t = (frame - prev.frame) / Math.max(1, next.frame - prev.frame);
            base.opacity = lerp(prev.opacity, next.opacity, t);
            base.blur = lerp(prev.blur, next.blur, t);
            base.blend = typeof prev.blend === 'string' ? prev.blend : base.blend;
            base.visible = prev.visible !== false;
            base.parallaxZ = lerp(Number(prev.parallaxZ) || 0, Number(next.parallaxZ) || 0, t);
            base.parallaxPitch = lerp(Number(prev.parallaxPitch) || 0, Number(next.parallaxPitch) || 0, t);
            base.parallaxYaw = lerp(Number(prev.parallaxYaw) || 0, Number(next.parallaxYaw) || 0, t);
            if (getLayerType(layerId) === LAYER_TYPE_LAYER) {
                var g = interpolateGradient(prev, next, t);
                if (g) { base.gradient = g; base.color = undefined; }
                else if (prev.color && next.color) { base.gradient = null; base.color = lerpColor(prev.color, next.color, t); }
            }
            return base;
        }
        if (prev) {
            base.opacity = prev.opacity;
            base.blur = prev.blur;
            base.blend = typeof prev.blend === 'string' ? prev.blend : base.blend;
            base.visible = prev.visible !== false;
            base.parallaxZ = Number.isFinite(Number(prev.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(prev.parallaxZ))) : base.parallaxZ;
            base.parallaxPitch = Number.isFinite(Number(prev.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(prev.parallaxPitch))) : base.parallaxPitch;
            base.parallaxYaw = Number.isFinite(Number(prev.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(prev.parallaxYaw))) : base.parallaxYaw;
            if (getLayerType(layerId) === LAYER_TYPE_LAYER) {
                if (prev.gradient) { base.gradient = normalizeGradient(prev.gradient); base.color = undefined; }
                else if (prev.color) { base.gradient = null; base.color = normalizeHexColor(prev.color); }
            }
        }
        return base;
    }
    function updateKeyframeSnapshot(layerId, patch) {
        var frame = getCurrentFrame();
        var base = getSetting(layerId);
        var kfs = normalizeKeyframes(base.keyframes);
        var idx = kfs.findIndex(function (kf) { return kf.frame === frame; });
        if (idx < 0) return false;
        var kf = Object.assign({}, kfs[idx]);
        if (Object.prototype.hasOwnProperty.call(patch, 'opacity')) kf.opacity = Math.max(0, Math.min(1, Number(patch.opacity)));
        if (Object.prototype.hasOwnProperty.call(patch, 'blur')) kf.blur = Math.max(0, Math.min(MAX_BLUR_PX, Number(patch.blur) || 0));
        if (Object.prototype.hasOwnProperty.call(patch, 'blend')) kf.blend = typeof patch.blend === 'string' ? patch.blend : 'normal';
        if (Object.prototype.hasOwnProperty.call(patch, 'visible')) kf.visible = patch.visible !== false;
        if (Object.prototype.hasOwnProperty.call(patch, 'parallaxZ')) kf.parallaxZ = Math.max(-2000, Math.min(2000, Number(patch.parallaxZ) || 0));
        if (Object.prototype.hasOwnProperty.call(patch, 'parallaxPitch')) kf.parallaxPitch = Math.max(-20, Math.min(20, Number(patch.parallaxPitch) || 0));
        if (Object.prototype.hasOwnProperty.call(patch, 'parallaxYaw')) kf.parallaxYaw = Math.max(-20, Math.min(20, Number(patch.parallaxYaw) || 0));
        if (Object.prototype.hasOwnProperty.call(patch, 'gradient')) {
            var g = normalizeGradient(patch.gradient);
            if (g) { kf.gradient = g; delete kf.color; }
            else { kf.gradient = null; kf.color = normalizeHexColor(getLayerColor(layerId)); }
        }
        kfs[idx] = kf;
        settings.set(layerId, Object.assign({}, base, { keyframes: kfs }));
        return true;
    }

    function markTrackDirtyForFX() {
        try {
            var state = window.store.getState();
            var script = state && state.trackData ? (state.trackData.script || '') : '';

            window.store.dispatch({ type: 'trackData/SET_TRACK_SCRIPT', payload: script });
        } catch (e) {
            err('failed to mark track dirty after FX change', e);
        }
    }

    function syncLayerFXProperty(layerId) {
        try {
            var layer = getLayerById(layerId);
            if (!layer) return;
            var setting = settings.get(layerId);
            if (setting && !isDefaultSetting(setting)) {
                layer[TRACK_FX_KEY] = cleanSettingForTrack(setting);
                layer[TRACK_FX_KEY].version = TRACK_FX_VERSION;
            } else {
                delete layer[TRACK_FX_KEY];
            }
        } catch (e) {}
    }

    function setSetting(layerId, patch, options) {
        options = options || {};
        var cur = getSetting(layerId);
        var updatedKeyframe = false;
        if (!options.forceBase && Object.prototype.hasOwnProperty.call(patch, 'opacity')) {
            updatedKeyframe = updateKeyframeSnapshot(layerId, { opacity: patch.opacity }) || updatedKeyframe;
        }
        if (!options.forceBase && Object.prototype.hasOwnProperty.call(patch, 'blur')) {
            var blurFrame = getCurrentFrame();
            var blurKfs = normalizeKeyframes(cur.keyframes);
            var blurHasKeyframes = blurKfs.length > 0;
            var blurHasCurrentKeyframe = blurKfs.some(function (kf) { return kf.frame === blurFrame; });
            if (blurHasKeyframes && !blurHasCurrentKeyframe) {
                var blurEffective = getEffectiveSetting(layerId, blurFrame);
                var blurNewKf = snapshotForKeyframe(layerId, blurEffective);
                blurNewKf.blur = Math.max(0, Math.min(MAX_BLUR_PX, Number(patch.blur) || 0));
                blurKfs.push(blurNewKf);
                settings.set(layerId, Object.assign({}, cur, { keyframes: normalizeKeyframes(blurKfs) }));
                updatedKeyframe = true;
            } else {
                updatedKeyframe = updateKeyframeSnapshot(layerId, { blur: patch.blur }) || updatedKeyframe;
            }
        }
        if (!options.forceBase && Object.prototype.hasOwnProperty.call(patch, 'blend')) {
            var blendFrame = getCurrentFrame();
            var blendKfs = normalizeKeyframes(cur.keyframes);
            if (blendKfs.length > 0) {
                var blendIdx = blendKfs.findIndex(function (kf) { return kf.frame === blendFrame; });
                if (blendIdx < 0) {
                    var blendEffective = getEffectiveSetting(layerId, blendFrame);
                    var blendNewKf = snapshotForKeyframe(layerId, blendEffective);
                    blendNewKf.blend = typeof patch.blend === 'string' ? patch.blend : 'normal';
                    blendKfs.push(blendNewKf);
                    settings.set(layerId, Object.assign({}, cur, { keyframes: normalizeKeyframes(blendKfs) }));
                } else {
                    blendKfs[blendIdx].blend = typeof patch.blend === 'string' ? patch.blend : 'normal';
                    settings.set(layerId, Object.assign({}, cur, { keyframes: normalizeKeyframes(blendKfs) }));
                }
                updatedKeyframe = true;
            }
        }
        if (!options.forceBase && Object.prototype.hasOwnProperty.call(patch, 'visible')) {
            var visFrame = getCurrentFrame();
            var visKfs = normalizeKeyframes(cur.keyframes);
            if (visKfs.length > 0) {
                var visIdx = visKfs.findIndex(function (kf) { return kf.frame === visFrame; });
                if (visIdx < 0) {
                    var visEffective = getEffectiveSetting(layerId, visFrame);
                    var visNewKf = snapshotForKeyframe(layerId, visEffective);
                    visNewKf.visible = patch.visible !== false;
                    visKfs.push(visNewKf);
                } else {
                    visKfs[visIdx].visible = patch.visible !== false;
                }
                settings.set(layerId, Object.assign({}, cur, { keyframes: normalizeKeyframes(visKfs) }));
                updatedKeyframe = true;
            }
        }
        if (!options.forceBase && Object.prototype.hasOwnProperty.call(patch, 'gradient')) {
            updatedKeyframe = updateKeyframeSnapshot(layerId, { gradient: patch.gradient }) || updatedKeyframe;
        }
        if (!options.forceBase && (Object.prototype.hasOwnProperty.call(patch, 'parallaxZ') || Object.prototype.hasOwnProperty.call(patch, 'parallaxPitch') || Object.prototype.hasOwnProperty.call(patch, 'parallaxYaw'))) {
            var parFrame = getCurrentFrame();
            var parKfs = normalizeKeyframes(cur.keyframes);
            if (parKfs.length > 0) {
                var parIdx = parKfs.findIndex(function (kf) { return kf.frame === parFrame; });
                if (parIdx < 0) {
                    var parEffective = getEffectiveSetting(layerId, parFrame);
                    parKfs.push(snapshotForKeyframe(layerId, parEffective));
                    parKfs = normalizeKeyframes(parKfs);
                    parIdx = parKfs.findIndex(function (kf) { return kf.frame === parFrame; });
                }
                var parKf = Object.assign({}, parKfs[parIdx]);
                if (Object.prototype.hasOwnProperty.call(patch, 'parallaxZ')) parKf.parallaxZ = Math.max(-2000, Math.min(2000, Number(patch.parallaxZ) || 0));
                if (Object.prototype.hasOwnProperty.call(patch, 'parallaxPitch')) parKf.parallaxPitch = Math.max(-20, Math.min(20, Number(patch.parallaxPitch) || 0));
                if (Object.prototype.hasOwnProperty.call(patch, 'parallaxYaw')) parKf.parallaxYaw = Math.max(-20, Math.min(20, Number(patch.parallaxYaw) || 0));
                parKfs[parIdx] = parKf;
                settings.set(layerId, Object.assign({}, cur, { keyframes: normalizeKeyframes(parKfs) }));
                updatedKeyframe = true;
            }
        }
        var basePatch = Object.assign({}, patch);
        if (updatedKeyframe) { delete basePatch.opacity; delete basePatch.blur; delete basePatch.gradient; delete basePatch.blend; delete basePatch.visible; delete basePatch.parallaxZ; delete basePatch.parallaxPitch; delete basePatch.parallaxYaw; }
        var effectiveBase = updatedKeyframe ? getSetting(layerId) : cur;
        var next = Object.assign({}, effectiveBase, basePatch);
        next.opacity=Math.max(0,Math.min(1,typeof next.opacity==='number'?next.opacity:1));
        next.blur=Math.max(0,Math.min(MAX_BLUR_PX,Number.isFinite(Number(next.blur))?Number(next.blur):0));
        next.blend=typeof next.blend==='string'?next.blend:'normal';
        next.front=!!next.front;
        next.visible=next.visible !== false;
        next.gradient=normalizeGradient(next.gradient);
        next.gradientMode=normalizeGradientMode(next.gradientMode);
        next.parallax=!!next.parallax;
        next.parallaxZ=Math.max(-2000,Math.min(2000,Number.isFinite(Number(next.parallaxZ))?Number(next.parallaxZ):0));
        next.parallaxPitch=Math.max(-20,Math.min(20,Number.isFinite(Number(next.parallaxPitch))?Number(next.parallaxPitch):0));
        next.parallaxYaw=Math.max(-20,Math.min(20,Number.isFinite(Number(next.parallaxYaw))?Number(next.parallaxYaw):0));
        next.parallaxScaleLines=next.parallaxScaleLines !== false;
        next.keyframes=normalizeKeyframes(next.keyframes);
        if (isDefaultSetting(next)) settings.delete(layerId); else settings.set(layerId,next);
        syncLayerFXProperty(layerId);
        if (!settingsEqual(cur,getSetting(layerId)) && !options.skipDirty) markTrackDirtyForFX();
        scheduleUIRescan(); scheduleRenderReconcile();
    }

    function replaceSettingMap(map, skipDirty) {
        settings = map || new Map();
        if (!skipDirty) markTrackDirtyForFX();
        scheduleUIRescan();
        scheduleRenderReconcile();
    }

    function resetSetting(layerId) {
        if (!settings.has(layerId)) return;
        settings.delete(layerId);
        markTrackDirtyForFX();
        if (activeGradientEditor && activeGradientEditor.layerId === layerId) exitGradientEditor();
        scheduleUIRescan();
        scheduleRenderReconcile();
    }

    function anyCustomized() {
        var found = false;
        settings.forEach(function (s) {
            if (!isDefaultSetting(s)) found = true;
        });
        return found;
    }

    var trackSerializationHooked = false;
    var originalLayerToJSON = null;

    function findBaseToJSONPrototype(layer) {
        var proto = layer && Object.getPrototypeOf(layer);
        while (proto) {
            if (Object.prototype.hasOwnProperty.call(proto, 'toJSON') && typeof proto.toJSON === 'function') {
                return proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return null;
    }

    function hookTrackFileSerialization() {
        if (trackSerializationHooked) return;
        try {
            var layers = window.Selectors.getTrackLayers();
            if (!layers || !layers.length) return;
            var proto = findBaseToJSONPrototype(layers[0]);
            if (!proto || typeof proto.toJSON !== 'function') return;
            if (proto.toJSON.__lrmodTrackFX) {
                trackSerializationHooked = true;
                return;
            }
            originalLayerToJSON = proto.toJSON;
            var wrapped = function () {
                var out = originalLayerToJSON.call(this);
                try {
                    var setting = settings.get(this.id);
                    if (setting && !isDefaultSetting(setting)) {
                        out[TRACK_FX_KEY] = cleanSettingForTrack(setting);
                        out[TRACK_FX_KEY].version = TRACK_FX_VERSION;
                    } else {
                        delete out[TRACK_FX_KEY];
                    }
                } catch (e) {
                    err('failed to serialize FX for layer ' + this.id, e);
                }
                return out;
            };
            wrapped.__lrmodTrackFX = true;
            wrapped.__lrmodOriginal = originalLayerToJSON;
            proto.toJSON = wrapped;
            trackSerializationHooked = true;
            log('track-file serializer hook installed');
        } catch (e) {
            err('failed to hook track-file serialization', e);
        }
    }

    function normalizeTrackFXSetting(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var setting = {
            opacity: typeof raw.opacity === 'number' ? raw.opacity : 1,
            blur: Number.isFinite(Number(raw.blur)) ? Math.max(0, Math.min(MAX_BLUR_PX, Number(raw.blur))) : 0,
            blend: typeof raw.blend === 'string' ? raw.blend : 'normal',
            front: !!raw.front,
            visible: raw.visible !== false,
            gradient: normalizeGradient(raw.gradient),
            gradientMode: normalizeGradientMode(raw.gradientMode),
            parallax: !!raw.parallax,
            parallaxZ: Number.isFinite(Number(raw.parallaxZ)) ? Math.max(-2000, Math.min(2000, Number(raw.parallaxZ))) : 0,
            parallaxPitch: Number.isFinite(Number(raw.parallaxPitch)) ? Math.max(-20, Math.min(20, Number(raw.parallaxPitch))) : 0,
            parallaxYaw: Number.isFinite(Number(raw.parallaxYaw)) ? Math.max(-20, Math.min(20, Number(raw.parallaxYaw))) : 0,
            parallaxScaleLines: raw.parallaxScaleLines !== false,
            keyframes: normalizeKeyframes(raw.keyframes)
        };
        return isDefaultSetting(setting) ? null : setting;
    }

    function readFXFromTrackPayload(payload) {
        var map = new Map();
        try {
            var layers = payload && Array.isArray(payload.layers) ? payload.layers : [];
            layers.forEach(function (layer) {
                if (!layer || !Number.isFinite(Number(layer.id))) return;
                var raw = layer[TRACK_FX_KEY];
                if (!raw) return;
                var setting = normalizeTrackFXSetting(raw);
                if (setting) map.set(Number(layer.id), setting);
            });
        } catch (e) {
            err('failed to read FX metadata from track payload', e);
        }
        return map;
    }

    function readFXFromLiveLayers() {
        var map = new Map();
        try {
            var layers = window.Selectors.getTrackLayers();
            layers.forEach(function (layer) {
                if (!layer || !Number.isFinite(Number(layer.id))) return;
                var raw = layer[TRACK_FX_KEY];
                if (!raw) return;
                var setting = normalizeTrackFXSetting(raw);
                if (setting) map.set(Number(layer.id), setting);
            });
        } catch (e) {}
        return map;
    }

    var pendingTrackLoadToken = 0;
    function loadSettingsFromTrackPayload(payload) {
        var token = ++pendingTrackLoadToken;
        var fromPayload = readFXFromTrackPayload(payload);
        settings = fromPayload;
        activeGradientEditor = null;
        removeGradientEditorMarkers();

        setTimeout(function () {
            if (token !== pendingTrackLoadToken) return;
            var live = readFXFromLiveLayers();
            if (live.size > 0 && settings.size === 0) settings = live;
            hookTrackFileSerialization();
            log('loaded ' + settings.size + ' layer/folder FX record(s) from track file');
            scheduleUIRescan();
            scheduleRenderReconcile();
        }, 0);
    }

    function pruneDeletedLayers() {
        try {
            var layers = window.Selectors.getTrackLayers();
            var validIds = {};
            layers.forEach(function (l) { validIds[l.id] = true; });
            var changed = false;
            Array.from(settings.keys()).forEach(function (id) {
                if (!validIds[id]) {
                    settings.delete(id);
                    changed = true;
                }
            });
            if (changed) markTrackDirtyForFX();
        } catch (e) {}
        cleanupOrphanedCanvases();
    }

    var reduxHooked = false;

    function initReduxHookIfNeeded() {
        if (reduxHooked) return;
        if (typeof window.addModMiddleware !== 'function') return;
        try {
            window.addModMiddleware(function () {
                return function (next) {
                    return function (action) {

                        if (action && action.type === 'LOAD_TRACK') {
                            try { handleAction(action); } catch (e) { err('action handler failed', e); }
                        }
                        var result = next(action);
                        if (!action || action.type !== 'LOAD_TRACK') {
                            try { handleAction(action); } catch (e) { err('action handler failed', e); }
                        } else {
                            setTimeout(hookTrackFileSerialization, 0);
                            scheduleUIRescan();
                            scheduleRenderReconcile();
                        }
                        return result;
                    };
                };
            });
            reduxHooked = true;
            log('redux middleware hooked');
        } catch (e) {
            err('failed to hook redux middleware', e);
        }
    }

    function refreshPrimaryFrameNow() {
        var frame = getCurrentFrame();
        knownInstances.forEach(function (inst) {
            var rig = instanceRigs.get(inst);
            if (!rig || !rig.active || rig.isSecondary) return;
            try {
                rig._currentFrame = frame;

                inst.rerender();
                layoutOverlayCanvases(inst, rig);
            } catch (e) { err('immediate FX frame refresh failed', e); }
        });
        if (activeGradientEditor) updateGradientEditorMarkers();
    }

    function handleAction(action) {
        if (!action || !action.type) return;
        switch (action.type) {
            case 'LOAD_TRACK':
                clearAllRenderOverlays();
                loadSettingsFromTrackPayload(action.payload);
                break;
            case 'NEW_TRACK':
                clearAllRenderOverlays();
                pendingTrackLoadToken++;
                settings = new Map();
                activeGradientEditor = null;
                removeGradientEditorMarkers();
                scheduleUIRescan();
                scheduleRenderReconcile();
                break;
            case 'SET_PLAYER_INDEX':
                refreshPrimaryFrameNow();

                setTimeout(function () { try { refreshPrimaryFrameNow(); } catch (e0) { err('deferred FX frame refresh failed', e0); } }, 0);
                scheduleUIRescan();
                scheduleRenderReconcile();
                if (activePopover) refreshOpenPopover(activePopover.layerId);
                break;
            case 'SAVE_TRACK':

                setTimeout(hookTrackFileSerialization, 0);
                break;
            case 'ADD_LAYER':
            case 'ADD_FOLDER':
            case 'MOVE_LAYER':
            case 'MOVE_FOLDER':
            case 'COPY_LAYER':
            case 'RENAME_LAYER':
            case 'RENAME_FOLDER':
                hookTrackFileSerialization();
                scheduleUIRescan();
                scheduleRenderReconcile();
                break;
            case 'REMOVE_LAYER':
            case 'REMOVE_FOLDER':
                setTimeout(pruneDeletedLayers, 0);
                scheduleUIRescan();
                scheduleRenderReconcile();
                break;
            default:
                break;
        }
    }

    function getFiberKey(domNode) {
        var keys = Object.keys(domNode);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('__reactFiber$') === 0 || keys[i].indexOf('__reactInternalInstance$') === 0) {
                return keys[i];
            }
        }
        return null;
    }

    function looksLikeGLDisplayInstance(inst) {
        if (!inst || typeof inst !== 'object') return false;
        if (inst instanceof Node) return false;
        return !!(inst.canvas &&
            inst.bgRenderer &&
            inst.layerRenderers instanceof Map &&
            Array.isArray(inst.spriteRenderers) &&
            typeof inst.rerender === 'function');
    }

    function isPrimaryInstance(inst) {
        try { return !(inst.props && inst.props.secondary); } catch (e) { return true; }
    }

    function getRenderInstanceForCanvas(canvasEl) {
        try {
            var key = getFiberKey(canvasEl);
            if (!key) return null;
            var node = canvasEl[key];
            for (var i = 0; i < 50 && node; i++, node = node.return) {
                if (looksLikeGLDisplayInstance(node.stateNode)) {
                    return node.stateNode;
                }
            }
        } catch (e) {}
        return null;
    }

    function findAllRenderInstances() {
        var found = [];
        try {
            var canvases = document.querySelectorAll('canvas');
            for (var i = 0; i < canvases.length; i++) {
                var inst = getRenderInstanceForCanvas(canvases[i]);
                if (inst && found.indexOf(inst) === -1) found.push(inst);
            }
        } catch (e) {
            err('failed to scan for render instances', e);
        }
        return found;
    }

    var instanceRigs = new WeakMap();
    var knownInstances = [];

    function ensureRig(inst) {
        var rig = instanceRigs.get(inst);
        if (!rig) {
            rig = {
                inst: inst,
                active: false,
                isSecondary: false,
                layerCanvases: new Map(),
                folderGroups: new Map(),
                folderCompositeCanvases: new Map(),
                toolCanvases: new Map(),
                riderCanvas: null,
                riderGl: null,
                riderRenderers: null,
                _bakeOrder: null,
                secondaryCompositeCanvas: null,
                secondaryCompositeCtx: null,
                secondaryCompositeVisible: false,

                secondaryLayerCaptureCanvas: null,
                secondaryLayerCaptureGl: null,
                secondaryLayerCaptureRenderer: null,
                secondaryLayerCapturePixels: null,
                secondaryLayerCaptureImageData: null,
                secondaryLayerCaptureW: 0,
                secondaryLayerCaptureH: 0,

                layerCaptureCanvas: null,
                layerCaptureGl: null,
                layerCaptureRenderer: null,
                layerCapturePixels: null,
                layerCaptureImageData: null,
                layerCaptureW: 0,
                layerCaptureH: 0,
                _secondaryLastCompositeSerial: -1,
                _secondaryRenderSerial: 0,
                _secondaryFrameInitialized: false,
                _secondaryFrame: 0,
                _secondaryExplicitFrame: false,
                _secondaryExplicitFrameLast: null,
                _secondaryConsumedRenderSerial: -1
            };
            instanceRigs.set(inst, rig);
            knownInstances.push(inst);
        }
        return rig;
    }

    function pruneKnownInstances() {
        knownInstances = knownInstances.filter(function (inst) {
            var alive = inst && inst.canvas && inst.canvas.isConnected;
            if (!alive) {
                var rig = instanceRigs.get(inst);
                if (rig) disposeRig(rig);
                instanceRigs.delete(inst);
            }
            return alive;
        });
        restoreSecondaryGetPixelsHookIfUnused();
    }

    function disposeRig(rig) {
        try {
            rig.layerCanvases.forEach(function (entry) {
                if (entry) {
                    clear2DCanvas(entry.captureCanvas);
                    clear2DCanvas(entry.displayCanvas);
                    if (entry.captureCanvas && entry.captureCanvas.parentNode) entry.captureCanvas.parentNode.removeChild(entry.captureCanvas);
                    if (entry.displayCanvas && entry.displayCanvas.parentNode) entry.displayCanvas.parentNode.removeChild(entry.displayCanvas);
                }
            });
            rig.layerCanvases.clear();
            rig.folderGroups.forEach(function (node) {
                if (node && node.parentNode) node.parentNode.removeChild(node);
            });
            rig.folderGroups.clear();
            rig.folderCompositeCanvases.forEach(function (canvas) {
                if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
            });
            rig.folderCompositeCanvases.clear();
            rig.toolCanvases.forEach(function (entry) {
                disposeGlEntry(entry);
            });
            rig.toolCanvases.clear();
            if (rig.riderCanvas) {
                disposeGlEntry({ canvas: rig.riderCanvas, gl: rig.riderGl });
                rig.riderCanvas = null;
                rig.riderGl = null;
                rig.riderRenderers = null;
            }
            if (rig.secondaryCompositeCanvas && rig.secondaryCompositeCanvas.parentNode) {
                rig.secondaryCompositeCanvas.parentNode.removeChild(rig.secondaryCompositeCanvas);
            }
            rig.secondaryCompositeCanvas = null;
            rig.secondaryCompositeCtx = null;
            disposeSharedCaptureOnly(rig);
        } catch (e) {}
    }

    function disposeGlEntry(entry) {
        try {
            if (entry.canvas && entry.canvas.parentNode) entry.canvas.parentNode.removeChild(entry.canvas);
            if (entry.gl) {
                var ext = entry.gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
            }
        } catch (e) {}
    }

    function patchGlForCorrectAlpha(gl) {
        if (!gl || gl.__lrmodAlphaPatched) return;
        var original = gl.blendFunc.bind(gl);
        gl.blendFunc = function (sfactor, dfactor) {
            if (sfactor === gl.SRC_ALPHA && dfactor === gl.ONE_MINUS_SRC_ALPHA) {
                gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                original(sfactor, dfactor);
            }
        };
        gl.__lrmodAlphaPatched = true;
    }

    function makeTransparentGlCanvas() {
        var canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        var attrs = { premultipliedAlpha: true, alpha: true, antialias: false };
        var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
        if (gl) patchGlForCorrectAlpha(gl);
        return { canvas: canvas, gl: gl };
    }

    function syncCanvasSize(overlayCanvas, hostCanvas) {
        if (!hostCanvas) return;
        var w = hostCanvas.width || 2;
        var h = hostCanvas.height || 2;
        if (overlayCanvas.width !== w) overlayCanvas.width = w;
        if (overlayCanvas.height !== h) overlayCanvas.height = h;
    }

    function getWebGLRendererClass(inst) {
        return inst.bgRenderer && inst.bgRenderer.constructor;
    }

    function getSpriteRendererClass(inst) {
        return inst.spriteRenderers && inst.spriteRenderers[0] && inst.spriteRenderers[0].constructor;
    }

    function getOrCreateNamedEntry(inst, map, key, slotLabel) {
        var entry = map.get(key);
        if (entry) return entry;
        var RendererClass = getWebGLRendererClass(inst);
        if (!RendererClass) return null;
        var made = makeTransparentGlCanvas();
        if (!made.gl) {
            warn('could not create WebGL context for overlay canvas (' + slotLabel + ')');
            return null;
        }
        var renderer;
        try {
            renderer = new RendererClass(made.canvas, made.gl);
        } catch (e) {
            err('failed to construct renderer for overlay (' + slotLabel + ')', e);
            return null;
        }
        made.canvas.dataset.lrmodSlot = slotLabel;
        entry = { canvas: made.canvas, gl: made.gl, renderer: renderer };
        map.set(key, entry);
        return entry;
    }

    function ensureSharedLayerCaptureRig(inst, rig) {
        var host = inst && inst.canvas;
        if (!host) return null;
        var RendererClass = getWebGLRendererClass(inst);
        if (!RendererClass) return null;

        if (!rig.layerCaptureCanvas) {
            var made = makeTransparentGlCanvas();
            if (!made.gl) {
                warn('could not create shared layer capture WebGL context');
                return null;
            }
            made.canvas.style.display = 'block';
            made.canvas.style.visibility = 'hidden';
            made.canvas.style.width = '1px';
            made.canvas.style.height = '1px';
            made.canvas.style.position = 'absolute';
            made.canvas.style.left = '-10000px';
            made.canvas.style.top = '-10000px';
            made.canvas.style.pointerEvents = 'none';
            made.canvas.dataset.lrmodSharedLayerCapture = '1';
            try {
                rig.layerCaptureRenderer = new RendererClass(made.canvas, made.gl);
            } catch (e) {
                err('failed to construct shared layer capture renderer', e);
                try {
                    var ext = made.gl.getExtension('WEBGL_lose_context');
                    if (ext) ext.loseContext();
                } catch (e2) {}
                return null;
            }
            rig.layerCaptureCanvas = made.canvas;
            rig.layerCaptureGl = made.gl;
        }

        var w = host.width || 2, h = host.height || 2;
        if (rig.layerCaptureCanvas.width !== w) rig.layerCaptureCanvas.width = w;
        if (rig.layerCaptureCanvas.height !== h) rig.layerCaptureCanvas.height = h;
        if (rig.layerCaptureW !== w || rig.layerCaptureH !== h || !rig.layerCapturePixels) {
            rig.layerCapturePixels = new Uint8Array(w * h * 4);
            rig.layerCaptureW = w;
            rig.layerCaptureH = h;
            rig.layerCaptureImageData = null;
        }
        return rig.layerCaptureCanvas;
    }

    function ensureSecondaryLayerCaptureRig(inst, rig) {
        return ensureSharedLayerCaptureRig(inst, rig);
    }

    function getOrCreateSecondaryLayerEntry(inst, rig, layerId) {
        var entry = rig.layerCanvases.get(layerId);
        if (entry) return entry;
        if (!ensureSecondaryLayerCaptureRig(inst, rig)) return null;
        var c = document.createElement('canvas');
        c.width = inst.canvas.width || 2;
        c.height = inst.canvas.height || 2;
        c.dataset.lrmodLayerCapture = String(layerId);
        c.style.display = 'none';
        entry = {
            canvas: rig.layerCaptureCanvas,
            gl: rig.layerCaptureGl,
            renderer: rig.layerCaptureRenderer,
            captureCanvas: c,
            captureCtx: c.getContext('2d'),
            displayCanvas: null,
            displayCtx: null,
            secondaryCaptureSerial: -1
        };
        rig.layerCanvases.set(layerId, entry);
        return entry;
    }

    function getOrCreatePrimaryLayerEntry(inst, rig, layerId) {
        var entry = rig.layerCanvases.get(layerId);
        if (entry) return entry;
        if (!ensureSharedLayerCaptureRig(inst, rig)) return null;

        var c = document.createElement('canvas');
        c.className = 'lrmod-layer-fx-display';
        c.style.position = 'absolute';
        c.style.top = '0';
        c.style.left = '0';
        c.style.width = '100%';
        c.style.height = '100%';
        c.style.pointerEvents = 'none';
        c.dataset.lrmodLayerCapture = String(layerId);
        var ctx = c.getContext('2d');
        entry = {
            canvas: rig.layerCaptureCanvas,
            gl: rig.layerCaptureGl,
            renderer: rig.layerCaptureRenderer,
            captureCanvas: c,
            captureCtx: ctx,
            displayCanvas: c,
            displayCtx: ctx,
            secondaryCaptureSerial: -1
        };
        rig.layerCanvases.set(layerId, entry);
        return entry;
    }

    function getOrCreateLayerEntry(inst, rig, layerId) {
        return rig.isSecondary
            ? getOrCreateSecondaryLayerEntry(inst, rig, layerId)
            : getOrCreatePrimaryLayerEntry(inst, rig, layerId);
    }

    function getOrCreateToolEntry(inst, rig, field) {
        return getOrCreateNamedEntry(inst, rig.toolCanvases, field, 'tool-' + field);
    }

    function ensureRiderRig(inst, rig) {
        if (rig.riderCanvas) return;
        var made = makeTransparentGlCanvas();
        if (!made.gl) {
            warn('could not create WebGL context for rider overlay canvas');
            return;
        }
        made.canvas.dataset.lrmodSlot = 'rider';
        rig.riderCanvas = made.canvas;
        rig.riderGl = made.gl;
        rig.riderRenderers = [];
    }

    function beginSharedFrame(rig, key) {
        var flagKey = '_sharedFrameCleared_' + key;
        if (rig[flagKey]) return false;
        rig[flagKey] = true;
        Promise.resolve().then(function () { rig[flagKey] = false; });
        return true;
    }

    function redrawIntoEntry(entry, hostCanvas, drawFn, clear) {
        syncCanvasSize(entry.canvas, hostCanvas);
        var gl = entry.gl;
        gl.viewport(0, 0, entry.canvas.width, entry.canvas.height);
        if (clear !== false) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        drawFn();
    }

    var PARALLAX_PERSPECTIVE_DISTANCE = 4000;

    function cloneSpatialPoint(point) {
        if (!point || typeof point !== 'object') return point;
        var out = Object.assign(Object.create(Object.getPrototypeOf(point)), point);
        return out;
    }

    function parallaxTransformPoint(point, camera, setting) {
        if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
        var camX = camera && Number.isFinite(Number(camera.focalX)) ? Number(camera.focalX) : 0;
        var camY = camera && Number.isFinite(Number(camera.focalY)) ? Number(camera.focalY) : 0;
        var yaw = Number(setting.parallaxYaw) || 0;
        var pitch = Number(setting.parallaxPitch) || 0;
        var zDistance = Number(setting.parallaxZ) || 0;

        var x = Number(point.x);
        var y = Number(point.y);
        var rawZ = x * yaw + y * pitch + zDistance;

        var zoom = camera && Number.isFinite(Number(camera.zoom)) && Number(camera.zoom) > 0 ? Number(camera.zoom) : 1;
        var z = rawZ * zoom;
        var perspective = PARALLAX_PERSPECTIVE_DISTANCE;
        var denom = perspective - z;
        if (denom < perspective * 0.05) denom = perspective * 0.05;
        var scale = perspective / denom;

        var out = cloneSpatialPoint(point);
        out.x = camX + (x - camX) * scale;
        out.y = camY + (y - camY) * scale;
        out.__lrmodParallaxScale = scale;
        return out;
    }

    function transformParallaxScene(scene, camera, setting) {
        if (!scene || !scene.layers || !setting || !setting.parallax) return scene;
        var transformedScene = scene.__clone ? scene.__clone() : Object.assign(Object.create(Object.getPrototypeOf(scene)), scene);
        transformedScene.layers = scene.layers.map(function (layer) {
            if (!layer || !layer.entities || typeof layer.entities.map !== 'function') return layer;
            var nextLayer = layer.__clone ? layer.__clone() : Object.assign(Object.create(Object.getPrototypeOf(layer)), layer);
            nextLayer.entities = layer.entities.map(function (entity) {
                if (!entity || typeof entity !== 'object') return entity;
                var changed = false;
                var next = Object.assign(Object.create(Object.getPrototypeOf(entity)), entity);
                ['p1','p2','p3','p4','center','radialPoint'].forEach(function (key) {
                    if (!entity[key] || typeof entity[key].x !== 'number' || typeof entity[key].y !== 'number') return;
                    var tp = parallaxTransformPoint(entity[key], camera, setting);
                    if (!tp) return;

                    if (setting.parallaxScaleLines !== false && typeof entity[key].thickness === 'number') {
                        tp.thickness = entity[key].thickness * tp.__lrmodParallaxScale;
                    }
                    delete tp.__lrmodParallaxScale;
                    next[key] = tp;
                    changed = true;
                });
                return changed ? next : entity;
            });
            return nextLayer;
        });
        return transformedScene;
    }

    function captureLayerTo2D(inst, rig, entry, layerId, scene, camera, opts) {
        var sharedCanvas = rig.layerCaptureCanvas;
        var gl = rig.layerCaptureGl;
        var renderer = rig.layerCaptureRenderer;
        if (!sharedCanvas || !gl || !renderer) return false;
        syncCanvasSize(sharedCanvas, inst.canvas);
        var w = sharedCanvas.width, h = sharedCanvas.height;
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        var renderScene = scene;
        var containingFolderId = getContainingFolderId(layerId);
        if (containingFolderId >= 0) {
            var folderEffective = getEffectiveSetting(containingFolderId, getFrameForInstance(inst, rig));
            if (folderEffective.parallax && isLayerFXVisibleAtFrame(containingFolderId, getFrameForInstance(inst, rig))) {
                renderScene = transformParallaxScene(scene, camera, folderEffective);
            }
        }
        renderer.render(renderScene, camera, Object.assign({}, opts || {}, { transparent: true }));

        var effective = getEffectiveSetting(layerId, getFrameForInstance(inst, rig));
        var gradient = normalizeGradient(effective.gradient);
        if (gradient && gradient.stops.length) {
            apply2DPointGradientToSharedCapture(gl, sharedCanvas, gradient, camera, opts, effective.gradientMode);
        }

        entry.secondaryCaptureSerial = rig._secondaryRenderSerial;

        if (!rig.isSecondary) {
            var targetPrimary = entry.captureCanvas;
            var ctxPrimary = entry.captureCtx;
            if (!targetPrimary || !ctxPrimary) return false;
            syncCanvasSize(targetPrimary, inst.canvas);
            try { gl.flush(); } catch (e) {}
            ctxPrimary.setTransform(1, 0, 0, 1, 0, 0);
            ctxPrimary.globalCompositeOperation = 'source-over';
            ctxPrimary.globalAlpha = 1;
            ctxPrimary.filter = 'none';
            ctxPrimary.clearRect(0, 0, targetPrimary.width, targetPrimary.height);
            ctxPrimary.drawImage(sharedCanvas, 0, 0, targetPrimary.width, targetPrimary.height);
            var solidColorPrimary = (!gradient && effective.color) ? normalizeHexColor(effective.color) : null;
            if (solidColorPrimary) {
                ctxPrimary.globalCompositeOperation = 'source-in';
                ctxPrimary.fillStyle = solidColorPrimary;
                ctxPrimary.fillRect(0, 0, targetPrimary.width, targetPrimary.height);
                ctxPrimary.globalCompositeOperation = 'source-over';
            }
            return true;
        }

        var target = entry.captureCanvas;
        var ctx = entry.captureCtx;
        if (!target || !ctx) return false;
        syncCanvasSize(target, inst.canvas);
        if (!rig.layerCapturePixels || rig.layerCapturePixels.length !== w * h * 4) {
            rig.layerCapturePixels = new Uint8Array(w * h * 4);
        }
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rig.layerCapturePixels);
        var imageData = ctx.createImageData(w, h);
        var src = rig.layerCapturePixels;
        var dst = imageData.data;
        var rowBytes = w * 4;
        for (var y = 0; y < h; y++) {
            var srcOff = (h - 1 - y) * rowBytes;
            dst.set(src.subarray(srcOff, srcOff + rowBytes), y * rowBytes);
        }
        ctx.putImageData(imageData, 0, 0);
        return true;
    }

    function getLayerById(layerId) {
        try {
            var layers = window.Selectors.getTrackLayers();
            for (var i = 0; i < layers.length; i++) if (layers[i].id === layerId) return layers[i];
        } catch (e) {}
        return null;
    }

    function getLayerType(layerId) {
        var layer = getLayerById(layerId);
        return layer ? layer.type : null;
    }

    function getContainingFolderId(layerId) {
        var layer = getLayerById(layerId);
        if (!layer || layer.type !== LAYER_TYPE_LAYER) return -1;
        return typeof layer.folderId === 'number' ? layer.folderId : -1;
    }

    function getFolderChildren(folderId) {
        var children = [];
        try {
            var layers = window.Selectors.getTrackLayers();
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer.type === LAYER_TYPE_LAYER && layer.folderId === folderId) children.push(layer);
            }
        } catch (e) {}
        return children;
    }

    function isDirectlyCustomized(layerId) {
        return !isDefaultSetting(settings.get(layerId));
    }

    function getFolderSettingForLayer(layerId) {
        var folderId = getContainingFolderId(layerId);
        return folderId >= 0 ? getSetting(folderId) : null;
    }

    function isLayerFXVisibleAtFrame(layerId, frame) {
        var effective = getEffectiveSetting(layerId, frame);
        if (effective.visible === false) return false;
        try {
            if (typeof window.getLayerVisibleAtTime === 'function') {
                return window.getLayerVisibleAtTime(layerId, frame) !== false;
            }
        } catch (e) {}
        var layer = getLayerById(layerId);
        return !layer || layer.visible !== false;
    }

    function isLayerCaptureNeeded(layerId) {
        if (isDirectlyCustomized(layerId)) return true;
        var folderId = getContainingFolderId(layerId);
        return folderId >= 0 && !isDefaultSetting(settings.get(folderId));
    }

    function layerParticipatesInCustomFolder(layerId) {
        var folderId = getContainingFolderId(layerId);
        return folderId >= 0 && !isDefaultSetting(settings.get(folderId));
    }

    function getLayerColor(layerId) {
        var layer = getLayerById(layerId);
        var name = layer && typeof layer.name === 'string' ? layer.name : '';
        var m = name.match(/^#([0-9a-fA-F]{6})/);
        return m ? ('#' + m[1].toUpperCase()) : '#000000';
    }

    function getLayerNameWithoutColor(layerId) {
        var layer = getLayerById(layerId);
        var name = layer && typeof layer.name === 'string' ? layer.name : '';
        return name.replace(/^#[0-9a-fA-F]{6}/, '');
    }

    function getEffectiveLayerColor(layerId, frame) {
        var s = getEffectiveSetting(layerId, frame);
        return normalizeHexColor(s.color || getLayerColor(layerId));
    }

    function setNativeLayerColor(layerId, color) {
        try {
            var layer = getLayerById(layerId);
            if (!layer || layer.type !== LAYER_TYPE_LAYER) return;
            var next = normalizeHexColor(color) + getLayerNameWithoutColor(layerId);
            if (typeof window.Actions.renameLayer === 'function') {
                window.Actions.renameLayer(layerId, next);
            } else {
                window.store.dispatch({ type: 'RENAME_LAYER', payload: { id: layerId, name: next } });
            }
        } catch (e) {
            err('failed to set native layer color', e);
        }
    }

    var GRADIENT_MAX_STOPS = 32;
    var GRADIENT_VERTEX_SRC = [
        'attribute vec2 aPos;',
        'varying vec2 vUv;',
        'void main() {',
        '    vUv = aPos * 0.5 + 0.5;',
        '    gl_Position = vec4(aPos, 0.0, 1.0);',
        '}'
    ].join('\n');
    var GRADIENT_FRAGMENT_SRC = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uSource;',
        'uniform int uCount;',
        'uniform int uMode;',
        'uniform vec2 uPoints[' + GRADIENT_MAX_STOPS + '];',
        'uniform float uOffsets[' + GRADIENT_MAX_STOPS + '];',
        'uniform float uSpreads[' + GRADIENT_MAX_STOPS + '];',
        'uniform vec2 uLinearA;',
        'uniform vec2 uLinearB;',
        'uniform vec2 uRadialCenter;',
        'uniform vec2 uRadialCenterWorld;',
        'uniform vec2 uViewportSize;',
        'uniform vec2 uCameraFocal;',
        'uniform float uCameraZoom;',
        'uniform vec3 uColors[' + GRADIENT_MAX_STOPS + '];',
        '',
        'vec3 triangleColor() {',
        '    vec2 p0 = uPoints[0], p1 = uPoints[1], p2 = uPoints[2];',
        '    float den = (p1.y-p2.y)*(p0.x-p2.x) + (p2.x-p1.x)*(p0.y-p2.y);',
        '    if (abs(den) < 0.000001) return uColors[0];',
        '    float w0 = ((p1.y-p2.y)*(vUv.x-p2.x) + (p2.x-p1.x)*(vUv.y-p2.y)) / den;',
        '    float w1 = ((p2.y-p0.y)*(vUv.x-p2.x) + (p0.x-p2.x)*(vUv.y-p2.y)) / den;',
        '    float w2 = 1.0 - w0 - w1;',
        '    return clamp(uColors[0]*w0 + uColors[1]*w1 + uColors[2]*w2, 0.0, 1.0);',
        '}',
        'vec3 linearColor() {',
        '    if (uCount <= 1) return uColors[0];',
        '    vec2 line = uLinearB - uLinearA;',
        '    float lineLen2 = max(dot(line, line), 0.000001);',
        '    float t = clamp(dot(vUv - uLinearA, line) / lineLen2, 0.0, 1.0);',
        '    for (int i = 0; i < ' + GRADIENT_MAX_STOPS + '; i++) {',
        '        if (i >= uCount - 1) break;',
        '        float a = uOffsets[i];',
        '        float b = uOffsets[i + 1];',
        '        if (t <= b || i == uCount - 2) {',
        '            float span = max(b - a, 0.000001);',
        '            float localT = clamp((t - a) / span, 0.0, 1.0);',
        '            return mix(uColors[i], uColors[i + 1], localT);',
        '        }',
        '    }',
        '    if (uCount >= 32) return uColors[31];',
        '    if (uCount == 31) return uColors[30];',
        '    if (uCount == 30) return uColors[29];',
        '    if (uCount == 29) return uColors[28];',
        '    if (uCount == 28) return uColors[27];',
        '    if (uCount == 27) return uColors[26];',
        '    if (uCount == 26) return uColors[25];',
        '    if (uCount == 25) return uColors[24];',
        '    if (uCount == 24) return uColors[23];',
        '    if (uCount == 23) return uColors[22];',
        '    if (uCount == 22) return uColors[21];',
        '    if (uCount == 21) return uColors[20];',
        '    if (uCount == 20) return uColors[19];',
        '    if (uCount == 19) return uColors[18];',
        '    if (uCount == 18) return uColors[17];',
        '    if (uCount == 17) return uColors[16];',
        '    if (uCount == 16) return uColors[15];',
        '    if (uCount == 15) return uColors[14];',
        '    if (uCount == 14) return uColors[13];',
        '    if (uCount == 13) return uColors[12];',
        '    if (uCount == 12) return uColors[11];',
        '    if (uCount == 11) return uColors[10];',
        '    if (uCount == 10) return uColors[9];',
        '    if (uCount == 9) return uColors[8];',
        '    if (uCount == 8) return uColors[7];',
        '    if (uCount == 7) return uColors[6];',
        '    if (uCount == 6) return uColors[5];',
        '    if (uCount == 5) return uColors[4];',
        '    if (uCount == 4) return uColors[3];',
        '    if (uCount == 3) return uColors[2];',
        '    if (uCount == 2) return uColors[1];',
        '    return uColors[0];',
        '}',
        'vec3 radialColor() {',
        '    if (uCount <= 1) return uColors[0];',
        '    vec2 pixel = vec2(vUv.x * uViewportSize.x, (1.0 - vUv.y) * uViewportSize.y);',
        '    vec2 world = vec2(',
        '        (pixel.x - uViewportSize.x * 0.5) / max(uCameraZoom, 0.000001) + uCameraFocal.x,',
        '        (pixel.y - uViewportSize.y * 0.5) / max(uCameraZoom, 0.000001) + uCameraFocal.y',
        '    );',
        '    float radius = distance(world, uRadialCenterWorld);',
        '    for (int i = 1; i < ' + GRADIENT_MAX_STOPS + '; i++) {',
        '        if (i >= uCount) break;',
        '        float a = uOffsets[i - 1];',
        '        float b = uOffsets[i];',
        '        if (radius <= b || i == uCount - 1) {',
        '            float span = max(b - a, 0.000001);',
        '            float localT = clamp((radius - a) / span, 0.0, 1.0);',
        '            return mix(uColors[i - 1], uColors[i], localT);',
        '        }',
        '    }',
        '    if (uCount >= 32) return uColors[31];',
        '    if (uCount == 31) return uColors[30];',
        '    if (uCount == 30) return uColors[29];',
        '    if (uCount == 29) return uColors[28];',
        '    if (uCount == 28) return uColors[27];',
        '    if (uCount == 27) return uColors[26];',
        '    if (uCount == 26) return uColors[25];',
        '    if (uCount == 25) return uColors[24];',
        '    if (uCount == 24) return uColors[23];',
        '    if (uCount == 23) return uColors[22];',
        '    if (uCount == 22) return uColors[21];',
        '    if (uCount == 21) return uColors[20];',
        '    if (uCount == 20) return uColors[19];',
        '    if (uCount == 19) return uColors[18];',
        '    if (uCount == 18) return uColors[17];',
        '    if (uCount == 17) return uColors[16];',
        '    if (uCount == 16) return uColors[15];',
        '    if (uCount == 15) return uColors[14];',
        '    if (uCount == 14) return uColors[13];',
        '    if (uCount == 13) return uColors[12];',
        '    if (uCount == 12) return uColors[11];',
        '    if (uCount == 11) return uColors[10];',
        '    if (uCount == 10) return uColors[9];',
        '    if (uCount == 9) return uColors[8];',
        '    if (uCount == 8) return uColors[7];',
        '    if (uCount == 7) return uColors[6];',
        '    if (uCount == 6) return uColors[5];',
        '    if (uCount == 5) return uColors[4];',
        '    if (uCount == 4) return uColors[3];',
        '    if (uCount == 3) return uColors[2];',
        '    if (uCount == 2) return uColors[1];',
        '    return uColors[0];',
        '}',
        'vec3 freeformColor() {',
        '    float sumW = 0.0;',
        '    vec3 sumC = vec3(0.0);',
        '    for (int i = 0; i < ' + GRADIENT_MAX_STOPS + '; i++) {',
        '        if (i >= uCount) break;',
        '        vec2 delta = vUv - uPoints[i];',
        '        float d2 = dot(delta, delta);',
        '        if (d2 < 0.000001) return uColors[i];',
        '        float w = 1.0 / d2;',
        '        sumW += w;',
        '        sumC += uColors[i] * w;',
        '    }',
        '    return sumC / max(sumW, 0.00001);',
        '}',
        'void main() {',
        '    vec4 src = texture2D(uSource, vUv);',
        '    vec3 color = uColors[0];',
        '    if (uMode == 0) color = linearColor();',
        '    else if (uMode == 1) color = radialColor();',
        '    else if (uMode == 2) color = freeformColor();',
        '    else if (uMode == 3 && uCount >= 3) color = triangleColor();',
        '    else if (uCount == 1) color = uColors[0];',
        '    else color = linearColor();',
        '    gl_FragColor = vec4(color * src.a, src.a);',
        '}'
    ].join('\n');

    function ensureGradientProgram(gl) {
        if (gl.__lrmodGradientProgram) return gl.__lrmodGradientProgram;
        var vs = compileShader(gl, gl.VERTEX_SHADER, GRADIENT_VERTEX_SRC);
        var fs = compileShader(gl, gl.FRAGMENT_SHADER, GRADIENT_FRAGMENT_SRC);
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            var info = gl.getProgramInfoLog(prog);
            throw new Error('gradient program link error: ' + info);
        }
        var out = {
            program: prog,
            aPos: gl.getAttribLocation(prog, 'aPos'),
            uSource: gl.getUniformLocation(prog, 'uSource'),
            uCount: gl.getUniformLocation(prog, 'uCount'),
            uMode: gl.getUniformLocation(prog, 'uMode'),
            uOffsets: gl.getUniformLocation(prog, 'uOffsets'),
            uSpreads: gl.getUniformLocation(prog, 'uSpreads'),
            uLinearA: gl.getUniformLocation(prog, 'uLinearA'),
            uLinearB: gl.getUniformLocation(prog, 'uLinearB'),
            uRadialCenter: gl.getUniformLocation(prog, 'uRadialCenter'),
            uRadialCenterWorld: gl.getUniformLocation(prog, 'uRadialCenterWorld'),
            uViewportSize: gl.getUniformLocation(prog, 'uViewportSize'),
            uCameraFocal: gl.getUniformLocation(prog, 'uCameraFocal'),
            uCameraZoom: gl.getUniformLocation(prog, 'uCameraZoom'),
            uPoints: gl.getUniformLocation(prog, 'uPoints'),
            uColors: gl.getUniformLocation(prog, 'uColors')
        };
        gl.__lrmodGradientProgram = out;
        return out;
    }

    function ensureGradientSourceTexture(gl) {
        if (gl.__lrmodGradientSourceTexture) return gl.__lrmodGradientSourceTexture;
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.__lrmodGradientSourceTexture = tex;
        return tex;
    }

    function apply2DPointGradientToSharedCapture(gl, canvas, gradient, camera, opts, mode) {
        if (!gl || !canvas || !gradient || !gradient.stops || !gradient.stops.length) return;
        var sourceStops = gradient.stops.slice(0, GRADIENT_MAX_STOPS).map(function (p) { return { x: p.x, y: p.y, color: p.color }; });
        mode = normalizeGradientMode(mode);
        var w = opts && opts.width ? opts.width : canvas.width;
        var h = opts && opts.height ? opts.height : canvas.height;
        var zoom = camera && Number(camera.zoom) > 0 ? Number(camera.zoom) : 1;
        var fx = camera && Number.isFinite(Number(camera.focalX)) ? Number(camera.focalX) : 0;
        var fy = camera && Number.isFinite(Number(camera.focalY)) ? Number(camera.focalY) : 0;
        function toUv(p) {
            var sx = ((p.x - fx) * zoom + w / 2) / w;
            var sy = 1 - (((p.y - fy) * zoom + h / 2) / h);
            return { x: sx, y: sy };
        }
        var points = sourceStops.map(function (p) {
            var uv = toUv(p);
            return { x: uv.x, y: uv.y, color: p.color, x0: p.x, y0: p.y };
        });

        var radialCenter = points[0] || { x: 0.5, y: 0.5 };
        if (mode === 'radial' && points.length > 1) {
            var centerWorld = sourceStops[0];
            var others = points.slice(1);
            others.sort(function (a, b) {
                var da = (a.x0-centerWorld.x)*(a.x0-centerWorld.x) + (a.y0-centerWorld.y)*(a.y0-centerWorld.y);
                var db = (b.x0-centerWorld.x)*(b.x0-centerWorld.x) + (b.y0-centerWorld.y)*(b.y0-centerWorld.y);
                return da - db;
            });
            points = [points[0]].concat(others);
        } else if (mode === 'linear' && points.length > 1) {
            var linearA0 = points[0], linearB0 = points[points.length - 1];
            var ldx = linearB0.x - linearA0.x, ldy = linearB0.y - linearA0.y;
            var lden = Math.max(ldx * ldx + ldy * ldy, 0.000001);
            points.forEach(function (pt) {
                pt._offset = ((pt.x-linearA0.x)*ldx + (pt.y-linearA0.y)*ldy) / lden;
            });
            points.sort(function (a, b) { return a._offset - b._offset; });
            var lmin = points[0]._offset, lmax = points[points.length - 1]._offset;
            var lspan = Math.max(0.000001, lmax-lmin);
            points.forEach(function (pt) { pt._offset = (pt._offset-lmin)/lspan; });
        }
        var program;
        try {
            program = ensureGradientProgram(gl);
            var texture = ensureGradientSourceTexture(gl);
            var quad = ensureQuadBuffer(gl);
            var prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);
            var prevBlend = gl.getParameter(gl.BLEND);
            var prevArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            var prevActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
            var prevViewport = gl.getParameter(gl.VIEWPORT);

            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.disable(gl.BLEND);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, canvas.width, canvas.height, 0);
            gl.useProgram(program.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(program.aPos);
            gl.vertexAttribPointer(program.aPos, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(program.uSource, 0);
            gl.uniform1i(program.uCount, points.length);
            var modeCode = mode === 'linear' ? 0 : (mode === 'radial' ? 1 : (mode === 'freeform' ? 2 : 3));
            gl.uniform1i(program.uMode, modeCode);

            var linearA = points[0] || { x: 0.5, y: 0.5 };
            var linearB = points.length > 1 ? points[points.length - 1] : linearA;
            gl.uniform2f(program.uLinearA, linearA.x, linearA.y);
            gl.uniform2f(program.uLinearB, linearB.x, linearB.y);
            gl.uniform2f(program.uRadialCenter, radialCenter.x, radialCenter.y);
            var radialCenterWorld0 = sourceStops[0] || { x: 0, y: 0 };
            gl.uniform2f(program.uRadialCenterWorld, radialCenterWorld0.x, radialCenterWorld0.y);
            gl.uniform2f(program.uViewportSize, w, h);
            gl.uniform2f(program.uCameraFocal, fx, fy);
            gl.uniform1f(program.uCameraZoom, zoom);

            var offsetData = new Float32Array(points.length);
            if (points.length) offsetData[0] = 0;
            if (mode === 'radial' && points.length > 1) {
                var centerWorld0 = sourceStops[0];
                var radii = points.slice(1).map(function (p) {
                    return Math.hypot(p.x0-centerWorld0.x, p.y0-centerWorld0.y);
                });

                radii.forEach(function (r, i) { offsetData[i+1] = r; });
            } else {
                points.forEach(function (p, i) { offsetData[i] = Number.isFinite(p._offset) ? p._offset : 0; });
            }

            var spreadData = new Float32Array(points.length);
            for (var si = 0; si < points.length; si++) {
                var nearest = Infinity;
                for (var sj = 0; sj < points.length; sj++) {
                    if (si === sj) continue;
                    var ddx = points[si].x - points[sj].x, ddy = points[si].y - points[sj].y;
                    var d2 = ddx*ddx + ddy*ddy;
                    if (d2 > 0 && d2 < nearest) nearest = d2;
                }
                spreadData[si] = Number.isFinite(nearest) ? Math.sqrt(nearest) * 1.5 : 0.25;
            }

            var pointData = new Float32Array(points.length * 2);
            var colorData = new Float32Array(points.length * 3);
            points.forEach(function (stop, i) {
                pointData[i * 2] = stop.x;
                pointData[i * 2 + 1] = stop.y;
                var rgb = rgbFromHex(stop.color);
                colorData[i * 3] = rgb.r / 255;
                colorData[i * 3 + 1] = rgb.g / 255;
                colorData[i * 3 + 2] = rgb.b / 255;
            });
            gl.uniform2fv(program.uPoints, pointData);
            gl.uniform1fv(program.uOffsets, offsetData);
            gl.uniform1fv(program.uSpreads, spreadData);
            gl.uniform3fv(program.uColors, colorData);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            gl.disableVertexAttribArray(program.aPos);
            gl.bindBuffer(gl.ARRAY_BUFFER, prevArrayBuffer);
            gl.useProgram(prevProgram);
            if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
            gl.activeTexture(prevActiveTexture);
            gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        } catch (e) {
            err('gradient GPU pass failed', e);
        }
    }

    function ensureLayerDisplayCanvas(inst, rig, layerId, entry) {

        if (!rig.isSecondary && entry.captureCanvas) {
            syncCanvasSize(entry.captureCanvas, inst.canvas);
            entry.displayCanvas = entry.captureCanvas;
            entry.displayCtx = entry.captureCtx || entry.captureCanvas.getContext('2d');
            return entry.captureCanvas;
        }

        var s = getEffectiveSetting(layerId, getFrameForInstance(inst, rig));
        var gradient = normalizeGradient(s.gradient);
        var solidColor = (!gradient && s.color) ? normalizeHexColor(s.color) : null;
        if (!entry.displayCanvas) {
            var c = document.createElement('canvas');
            c.className = 'lrmod-layer-gradient-display';
            c.style.position = 'absolute';
            c.style.top = '0';
            c.style.left = '0';
            c.style.width = '100%';
            c.style.height = '100%';
            c.style.pointerEvents = 'none';
            c.dataset.lrmodGradientLayer = String(layerId);
            entry.displayCanvas = c;
            entry.displayCtx = c.getContext('2d');
        }
        syncCanvasSize(entry.displayCanvas, inst.canvas);
        var ctx = entry.displayCtx;
        if (!ctx) return entry.canvas;
        ctx.clearRect(0, 0, entry.displayCanvas.width, entry.displayCanvas.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.drawImage(entry.captureCanvas || entry.canvas, 0, 0);
        if (solidColor) {
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = solidColor;
            ctx.fillRect(0, 0, entry.displayCanvas.width, entry.displayCanvas.height);
        }
        ctx.globalCompositeOperation = 'source-over';
        return entry.displayCanvas;
    }

    function getLayerVisualCanvas(inst, rig, layerId, entry) {
        if (!entry) return null;

        if (!rig.isSecondary && entry.captureCanvas) return entry.captureCanvas;
        if (rig.isSecondary) {
            var effective = getEffectiveSetting(layerId, getFrameForInstance(inst, rig));
            if (!normalizeGradient(effective.gradient) && !effective.color) return entry.captureCanvas || entry.canvas;
        }
        return ensureLayerDisplayCanvas(inst, rig, layerId, entry);
    }

    function clearLayerCaptureForVisibility(inst, rig, layerId) {
        var entry = rig.layerCanvases.get(layerId);
        if (!entry) return;
        try {
            clear2DCanvas(entry.captureCanvas);
            clear2DCanvas(entry.displayCanvas);
            entry.secondaryCaptureSerial = rig._secondaryRenderSerial;
        } catch (e) {}
    }

    function clearHiddenCustomLayerOverlays(inst, rig) {
        if (!rig || !rig.active) return;
        var layers = window.Selectors.getTrackLayers();
        layers.forEach(function (layer) {
            if (layer.type !== LAYER_TYPE_LAYER) return;
            if (!isLayerCaptureNeeded(layer.id)) return;
            var frame = getFrameForInstance(inst, rig);
            if (isLayerFXVisibleAtFrame(layer.id, frame)) return;
            clearLayerCaptureForVisibility(inst, rig, layer.id);
        });
    }

    function patchLayerRendererInstance(inst, rig, layerId, rendererObj) {
        if (!rendererObj || rendererObj.__lrmodPatched) return;
        var original = rendererObj.render.bind(rendererObj);
        rendererObj.render = function (scene, camera, opts) {
            try {
                if (modDisabled || !isLayerCaptureNeeded(layerId)) return original(scene, camera, opts);
                rig.lastCamera = camera;
                rig.lastRenderOpts = opts || rig.lastRenderOpts;
                var renderFrame = getFrameForInstance(inst, rig);
                if (!isLayerFXVisibleAtFrame(layerId, renderFrame)) {
                    clearLayerCaptureForVisibility(inst, rig, layerId);

                    return;
                }

                var entry = getOrCreateLayerEntry(inst, rig, layerId);
                if (!entry || !captureLayerTo2D(inst, rig, entry, layerId, scene, camera, opts)) {
                    return original(scene, camera, opts);
                }
                ensureLayerDisplayCanvas(inst, rig, layerId, entry);
                var liveSetting = getEffectiveSetting(layerId, renderFrame);
                var liveVisual = getLayerVisualCanvas(inst, rig, layerId, entry);
                if (liveVisual) applyOverlayStyle(liveVisual, liveSetting, getFrameCameraZoom(inst, rig));
                return;
            } catch (e) {
                err('layer render redirect failed for layer ' + layerId + ', falling back to normal render', e);
                try { return original(scene, camera, opts); } catch (e2) {}
            }
        };
        rendererObj.render.__lrmodOriginal = original;
        rendererObj.__lrmodPatched = true;
    }

    function unpatchRendererInstance(rendererObj) {
        if (rendererObj && rendererObj.__lrmodPatched && rendererObj.render && rendererObj.render.__lrmodOriginal) {
            rendererObj.render = rendererObj.render.__lrmodOriginal;
            rendererObj.__lrmodPatched = false;
        }
    }

    function unpatchAllRenderersForInstance(inst) {
        if (!inst) return;
        try {
            if (inst.layerRenderers && typeof inst.layerRenderers.forEach === 'function') {
                inst.layerRenderers.forEach(function (pair) {
                    if (pair) {
                        unpatchRendererInstance(pair.edit);
                        unpatchRendererInstance(pair.playback);
                    }
                });
            }
            unpatchRendererInstance(inst.editRenderer);
            unpatchRendererInstance(inst.playbackRenderer);
            unpatchSpriteRenderers(inst);
            unpatchToolRenderers(inst);
        } catch (e) {}
    }

    function clear2DCanvas(canvas) {
        try {
            if (!canvas) return;
            var ctx = canvas.getContext && canvas.getContext('2d');
            if (ctx) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        } catch (e) {}
    }

    function disposeSharedCaptureOnly(rig) {
        if (!rig) return;
        try {
            if (rig.layerCaptureGl) {
                var ext = rig.layerCaptureGl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
            }
        } catch (e) {}
        rig.layerCaptureCanvas = null;
        rig.layerCaptureGl = null;
        rig.layerCaptureRenderer = null;
        rig.layerCapturePixels = null;
        rig.layerCaptureImageData = null;
        rig.layerCaptureW = 0;
        rig.layerCaptureH = 0;

        rig.secondaryLayerCaptureCanvas = null;
        rig.secondaryLayerCaptureGl = null;
        rig.secondaryLayerCaptureRenderer = null;
        rig.secondaryLayerCapturePixels = null;
        rig.secondaryLayerCaptureImageData = null;
        rig.secondaryLayerCaptureW = 0;
        rig.secondaryLayerCaptureH = 0;
    }

    function clearRiderOverlay(rig, dispose) {
        if (!rig) return;
        try {
            if (rig.riderGl && rig.riderCanvas) {
                rig.riderGl.viewport(0, 0, rig.riderCanvas.width, rig.riderCanvas.height);
                rig.riderGl.clearColor(0, 0, 0, 0);
                rig.riderGl.clear(rig.riderGl.COLOR_BUFFER_BIT);
            }
        } catch (e) {}
        if (rig.riderCanvas) {
            rig.riderCanvas.style.display = 'none';
        }
        if (dispose && rig.riderCanvas) {
            try { disposeGlEntry({ canvas: rig.riderCanvas, gl: rig.riderGl }); } catch (e) {}
            rig.riderCanvas = null;
            rig.riderGl = null;
            rig.riderRenderers = null;
        }
    }

    function clearAllRenderOverlays() {
        knownInstances.forEach(function (inst) {
            var rig = instanceRigs.get(inst);
            if (!rig) return;
            try {

                unpatchAllRenderersForInstance(inst);
                rig.layerCanvases.forEach(function (entry) {
                    clear2DCanvas(entry.captureCanvas);
                    clear2DCanvas(entry.displayCanvas);
                });
                if (rig.layerCaptureGl && rig.layerCaptureCanvas) {
                    rig.layerCaptureGl.viewport(0, 0, rig.layerCaptureCanvas.width, rig.layerCaptureCanvas.height);
                    rig.layerCaptureGl.clearColor(0, 0, 0, 0);
                    rig.layerCaptureGl.clear(rig.layerCaptureGl.COLOR_BUFFER_BIT);
                }
                rig.toolCanvases.forEach(function (entry) {
                    if (entry.gl && entry.canvas) {
                        entry.gl.viewport(0, 0, entry.canvas.width, entry.canvas.height);
                        entry.gl.clearColor(0, 0, 0, 0);
                        entry.gl.clear(entry.gl.COLOR_BUFFER_BIT);
                    }
                });
                clear2DCanvas(rig.secondaryCompositeCanvas);
                clearRiderOverlay(rig, true);
                rig._secondaryFrameInitialized = false;
                rig._secondaryFrame = 0;
                rig._secondaryExplicitFrameLast = null;
            } catch (e) {}
        });
    }

    function getLayerRendererPair(inst, layerId) {
        if (layerId === 0) {
            return { edit: inst.editRenderer, playback: inst.playbackRenderer };
        }
        var pair = inst.layerRenderers && inst.layerRenderers.get(layerId);
        return pair || null;
    }

    function patchSpriteRenderers(inst, rig) {
        if (!inst.spriteRenderers || inst.spriteRenderers.length === 0) return;
        ensureRiderRig(inst, rig);
        if (!rig.riderCanvas) return;
        var SpriteClass = getSpriteRendererClass(inst);
        if (!SpriteClass) return;

        inst.spriteRenderers.forEach(function (rendererObj, idx) {
            if (!rendererObj || rendererObj.__lrmodPatched) return;
            var original = rendererObj.render.bind(rendererObj);
            rendererObj.render = function (bg, onion, fg, spriteSvg, image, camera, opts) {
                try {
                    if (modDisabled || !rig.active) {
                        return original(bg, onion, fg, spriteSvg, image, camera, opts);
                    }
                    if (!rig.riderRenderers[idx]) {
                        try {
                            var sharedGl = rig.riderRenderers[0] ? rig.riderRenderers[0].gl : rig.riderGl;
                            rig.riderRenderers[idx] = new SpriteClass(rig.riderCanvas, sharedGl);
                        } catch (e) {
                            err('failed to construct rider overlay renderer', e);
                            return original(bg, onion, fg, spriteSvg, image, camera, opts);
                        }
                    }
                    var mine = rig.riderRenderers[idx];

                    redrawIntoEntry({ canvas: rig.riderCanvas, gl: rig.riderGl }, inst.canvas, function () {
                        mine.render(bg, onion, fg, spriteSvg, image, camera, Object.assign({}, opts, { transparent: true }));
                    }, beginSharedFrame(rig, 'rider'));
                } catch (e) {
                    err('rider render redirect failed, falling back to normal render', e);
                    try { return original(bg, onion, fg, spriteSvg, image, camera, opts); } catch (e2) {}
                }
            };
            rendererObj.render.__lrmodOriginal = original;
            rendererObj.__lrmodPatched = true;
        });
    }

    function unpatchSpriteRenderers(inst) {
        if (!inst.spriteRenderers) return;
        inst.spriteRenderers.forEach(unpatchRendererInstance);
    }

    var TOOL_RENDERER_FIELDS = ['hitboxRenderer', 'hittestRenderer', 'skeletonRenderer', 'skeletonsRenderer', 'toolRenderer'];

    function patchToolRenderers(inst, rig) {
        TOOL_RENDERER_FIELDS.forEach(function (field) {
            var rendererObj = inst[field];
            if (!rendererObj || rendererObj.__lrmodPatched) return;
            var original = rendererObj.render.bind(rendererObj);
            rendererObj.render = function (scene, camera, opts) {
                try {
                    if (modDisabled || !rig.active) return original(scene, camera, opts);
                    var entry = getOrCreateToolEntry(inst, rig, field);
                    if (!entry) return original(scene, camera, opts);
                    redrawIntoEntry(entry, inst.canvas, function () {
                        entry.renderer.render(scene, camera, Object.assign({}, opts, { transparent: true }));
                    });
                } catch (e) {
                    err('tool overlay redirect failed for ' + field + ', falling back to normal render', e);
                    try { return original(scene, camera, opts); } catch (e2) {}
                }
            };
            rendererObj.render.__lrmodOriginal = original;
            rendererObj.__lrmodPatched = true;
        });
    }

    function unpatchToolRenderers(inst) {
        TOOL_RENDERER_FIELDS.forEach(function (field) {
            unpatchRendererInstance(inst[field]);
        });
    }

    var SKELETON_GATED_FIELDS = ['hitboxRenderer', 'hittestRenderer', 'skeletonRenderer', 'skeletonsRenderer'];
    var onDisplayRenderHooked = false;

    function onDisplayRenderTick() {
        knownInstances.forEach(function (inst) {
            var rig = instanceRigs.get(inst);
            if (!rig || !rig.active) return;
            var skeletonOn = !!(inst.props && inst.props.skeleton);
            if (!skeletonOn) {
                SKELETON_GATED_FIELDS.forEach(function (field) {
                    var entry = rig.toolCanvases.get(field);
                    if (!entry) return;
                    var gl = entry.gl;
                    gl.viewport(0, 0, entry.canvas.width, entry.canvas.height);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                });
            }

            clearHiddenCustomLayerOverlays(inst, rig);
            if (!rig.isSecondary) {
                var displayZoom = getFrameCameraZoom(inst, rig);
                var displayFrame = getFrameForInstance(inst, rig);
                rig.layerCanvases.forEach(function (entry, layerId) {
                    if (!entry || !entry.displayCanvas) return;
                    var effective = getEffectiveSetting(layerId, displayFrame);
                    if (!isLayerFXVisibleAtFrame(layerId, displayFrame)) {
                        entry.displayCanvas.style.display = 'none';
                        return;
                    }
                    entry.displayCanvas.style.display = 'block';
                    applyOverlayStyle(entry.displayCanvas, effective, displayZoom);
                });
                rig.folderGroups.forEach(function (group, folderId) {
                    if (!group) return;
                    var folderSetting = getEffectiveSetting(folderId, displayFrame);
                    var folderVisible = isLayerFXVisibleAtFrame(folderId, displayFrame);
                    group.style.display = folderVisible ? 'block' : 'none';
                    if (folderVisible) { applyOverlayStyle(group, folderSetting, displayZoom); applyFolderParallaxStyle(group, folderSetting); }
                    else applyFolderParallaxStyle(group, folderSetting);
                });
            }
            if (!rig.isSecondary && activeGradientEditor) {
                updateGradientEditorMarkers();
            }
            if (rig.isSecondary) {
                rig._secondaryRenderSerial += 1;
                try { compositeSecondaryPreview(inst, rig); } catch (e) { err('secondary preview composite failed', e); }
            }
        });
    }

    function hookOnDisplayRender() {
        if (onDisplayRenderHooked) return;
        var previous = window.onDisplayRender;
        window.onDisplayRender = function () {
            try { onDisplayRenderTick(); } catch (e) { err('onDisplayRender tick failed', e); }
            if (typeof previous === 'function') {
                try { previous(); } catch (e2) {}
            }
        };
        onDisplayRenderHooked = true;
    }

    function compileShader(gl, type, src) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            var info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('shader compile error: ' + info);
        }
        return shader;
    }

    function ensureCompositeProgram(gl) {
        if (gl.__lrmodComposite) return gl.__lrmodComposite;
        var vs = compileShader(gl, gl.VERTEX_SHADER, COMPOSITE_VERTEX_SRC);
        var fs = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SRC);
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            var info = gl.getProgramInfoLog(prog);
            throw new Error('program link error: ' + info);
        }
        var handle = {
            program: prog,
            aPos: gl.getAttribLocation(prog, 'aPos'),
            uSrc: gl.getUniformLocation(prog, 'uSrc'),
            uDst: gl.getUniformLocation(prog, 'uDst'),
            uOpacity: gl.getUniformLocation(prog, 'uOpacity'),
            uBlendMode: gl.getUniformLocation(prog, 'uBlendMode'),
            uInvert: gl.getUniformLocation(prog, 'uInvert')
        };
        gl.__lrmodComposite = handle;
        return handle;
    }

    function ensureQuadBuffer(gl) {
        if (gl.__lrmodQuadBuffer) return gl.__lrmodQuadBuffer;
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        var verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.__lrmodQuadBuffer = buf;
        return buf;
    }

    function ensureScratchTextures(gl) {
        if (gl.__lrmodScratchTex) return gl.__lrmodScratchTex;
        function makeTex() {
            var t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
        }
        var scratch = { src: makeTex(), dst: makeTex() };
        gl.__lrmodScratchTex = scratch;
        return scratch;
    }

    function compositeOverlaysOntoCanvas(gl, canvas, orderedEntries) {
        if (!orderedEntries.length) return;
        var w = canvas.width, h = canvas.height;
        if (!w || !h) return;

        var handle, quadBuf, scratch;
        try {
            handle = ensureCompositeProgram(gl);
            quadBuf = ensureQuadBuffer(gl);
            scratch = ensureScratchTextures(gl);
        } catch (e) {
            err('failed to set up export compositing shader', e);
            return;
        }

        var prevProgram = gl.getParameter(gl.CURRENT_PROGRAM);
        var prevBlend = gl.getParameter(gl.BLEND);
        var prevCull = gl.getParameter(gl.CULL_FACE);
        var prevActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
        var prevArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        var prevViewport = gl.getParameter(gl.VIEWPORT);

        try {
            gl.disable(gl.CULL_FACE);
            gl.disable(gl.BLEND);
            gl.viewport(0, 0, w, h);
            gl.useProgram(handle.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
            gl.enableVertexAttribArray(handle.aPos);
            gl.vertexAttribPointer(handle.aPos, 2, gl.FLOAT, false, 0, 0);

            orderedEntries.forEach(function (item) {

                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, scratch.dst);
                gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0);

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, scratch.src);

                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, item.canvas);
                } finally {
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                }

                gl.uniform1i(handle.uSrc, 0);
                gl.uniform1i(handle.uDst, 1);
                gl.uniform1f(handle.uOpacity, item.opacity);
                gl.uniform1i(handle.uBlendMode, item.blendModeCode);
                gl.uniform1i(handle.uInvert, item.invert ? 1 : 0);

                gl.drawArrays(gl.TRIANGLES, 0, 6);
            });
        } catch (e) {
            err('export compositing pass failed', e);
        } finally {
            gl.disableVertexAttribArray(handle.aPos);
            gl.bindBuffer(gl.ARRAY_BUFFER, prevArrayBuffer);
            gl.useProgram(prevProgram);
            if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
            if (prevCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
            gl.activeTexture(prevActiveTexture);
            gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        }
    }

    function ensureSecondaryCompositeCanvas(inst, rig) {
        var host = inst.canvas;
        if (!host) return null;
        if (!rig.secondaryCompositeCanvas) {
            var c = document.createElement('canvas');
            c.className = 'lrmod-secondary-composite';
            c.style.position = 'absolute';
            c.style.top = '0';
            c.style.left = '0';
            c.style.width = '100%';
            c.style.height = '100%';
            c.style.pointerEvents = 'none';
            c.style.zIndex = '2';
            c.dataset.lrmodSecondaryComposite = '1';
            rig.secondaryCompositeCanvas = c;
            rig.secondaryCompositeCtx = c.getContext('2d');
        }
        var compositeCanvas = rig.secondaryCompositeCanvas;
        var ctx = rig.secondaryCompositeCtx;
        if (!ctx) return null;
        syncCanvasSize(compositeCanvas, host);
        var parent = host.parentNode;
        if (parent && compositeCanvas.parentNode !== parent) parent.appendChild(compositeCanvas);
        return compositeCanvas;
    }

    function getCanvasBlendMode(blend) {
        var supported = {
            normal: true, multiply: true, screen: true, overlay: true,
            darken: true, lighten: true, 'color-dodge': true, 'color-burn': true,
            'hard-light': true, 'soft-light': true, difference: true,
            exclusion: true, hue: true, saturation: true, color: true,
            luminosity: true
        };
        return supported[blend] ? blend : 'source-over';
    }

    function buildFilterForSetting(s, zoom) {
        var filters = [];
        if (s && Number(s.blur) > 0) {
            var z = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
            var blurPx = Math.max(0, Math.min(MAX_BLUR_PX, Number(s.blur))) * z;
            filters.push('blur(' + blurPx + 'px)');
        }
        if (s && s.blend === 'invert') filters.push('invert(1)');
        return filters.length ? filters.join(' ') : 'none';
    }

    function drawSecondaryLayer(ctx, entry, opacity, blend, filter) {
        if (!entry || !entry.canvas || opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.globalCompositeOperation = blend === 'invert' ? 'source-over' : getCanvasBlendMode(blend || 'normal');
        ctx.filter = filter || 'none';
        ctx.drawImage(entry.canvas, 0, 0);
        ctx.restore();
    }

    function ensureFolderCompositeCanvas(rig, folderId, host) {
        var c = rig.folderCompositeCanvases.get(folderId);
        if (!c) {
            c = document.createElement('canvas');
            c.width = host.width || 2;
            c.height = host.height || 2;
            c.dataset.lrmodFolderComposite = String(folderId);
            rig.folderCompositeCanvases.set(folderId, c);
        }
        if (c.width !== host.width) c.width = host.width;
        if (c.height !== host.height) c.height = host.height;
        return c;
    }

    function buildSecondaryCompositingItems(inst, rig) {
        var layers = window.Selectors.getTrackLayers();
        var items = [];
        var seenFolders = {};
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.type === LAYER_TYPE_FOLDER) {
                if (!isDefaultSetting(settings.get(layer.id))) {
                    seenFolders[layer.id] = true;
                    items.push({ kind: 'folder', id: layer.id, order: i });
                }
                continue;
            }
            if (!isLayerCaptureNeeded(layer.id)) continue;
            if (layerParticipatesInCustomFolder(layer.id)) continue;
            items.push({ kind: 'layer', id: layer.id, order: i });
        }
        rig._secondaryFolderIds = seenFolders;
        return items;
    }

    function composeSecondaryFolderCanvas(inst, rig, folderId) {
        var canvas = ensureFolderCompositeCanvas(rig, folderId, inst.canvas);
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var children = getFolderChildren(folderId);
        children.sort(function (a, b) { return layerOrderIndex(a.id) - layerOrderIndex(b.id); });
        children.forEach(function (child) {

            if (child.visible === false) return;
            if (!isLayerFXVisibleAtFrame(child.id, getFrameForInstance(inst, rig))) return;
            var entry = rig.layerCanvases.get(child.id);
            if (!entry) return;
            var s = getEffectiveSetting(child.id, getFrameForInstance(inst, rig));
            var visualCanvas = getLayerVisualCanvas(inst, rig, child.id, entry);
            drawSecondaryLayer(ctx, { canvas: visualCanvas }, s.opacity, s.blend, buildFilterForSetting(s, rig.lastCamera && rig.lastCamera.zoom));
        });
        return canvas;
    }

    function getSecondaryOrderedEntries(inst, rig) {
        var frame = getFrameForInstance(inst, rig);
        var compositeItems = buildSecondaryCompositingItems(inst, rig);
        var behind = [];
        var front = [];
        compositeItems.forEach(function (item) {
            var setting = getEffectiveSetting(item.id, frame);
            if (setting.visible === false) return;
            if (typeof window.getLayerVisibleAtTime === 'function') {
                try { if (window.getLayerVisibleAtTime(item.id, frame) === false) return; } catch (e) {}
            }
            var canvas = null;
            if (item.kind === 'folder') {
                canvas = composeSecondaryFolderCanvas(inst, rig, item.id);
            } else {
                var entry = rig.layerCanvases.get(item.id);
                canvas = getLayerVisualCanvas(inst, rig, item.id, entry);
            }
            var out = { order: item.order, kind: item.kind, canvas: canvas, setting: setting, id: item.id };
            (setting.front ? front : behind).push(out);
        });
        behind.sort(function (a, b) { return a.order - b.order; });
        front.sort(function (a, b) { return a.order - b.order; });
        var out = behind;

        out.push({ kind: 'rider', order: Number.MAX_SAFE_INTEGER / 2, canvas: rig.riderCanvas, setting: defaultSetting(), id: '__rider__' });
        return out.concat(front);
    }

    function compositeSecondaryPreview(inst, rig) {
        var frame = getFrameForInstance(inst, rig);
        var c = ensureSecondaryCompositeCanvas(inst, rig);
        if (!c) return;
        var ctx = rig.secondaryCompositeCtx;
        var w = inst.canvas.width, h = inst.canvas.height;
        if (!w || !h) return;

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = 'none';
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(inst.canvas, 0, 0);
        ctx.restore();

        var ordered = getSecondaryOrderedEntries(inst, rig);
        ordered.forEach(function (item) {
            if (!item.canvas) return;
            if (item.kind === 'folder') {
                drawSecondaryLayer(ctx, { canvas: item.canvas }, item.setting.opacity, item.setting.blend, buildFilterForSetting(item.setting, rig.lastCamera && rig.lastCamera.zoom));
            } else if (item.kind === 'layer') {
                drawSecondaryLayer(ctx, { canvas: item.canvas }, item.setting.opacity, item.setting.blend, buildFilterForSetting(item.setting, rig.lastCamera && rig.lastCamera.zoom));
            } else {
                drawSecondaryLayer(ctx, { canvas: item.canvas }, 1, 'normal');
            }
        });
        rig.secondaryCompositeVisible = true;
        rig._secondaryLastCompositeSerial = rig._secondaryRenderSerial;
    }

    var secondaryGetPixelsHooked = false;
    var secondaryGetPixelsProto = null;
    var secondaryGetPixelsOriginal = null;
    function hookSecondaryGetPixels(inst) {
        if (secondaryGetPixelsHooked || !inst || !inst.bgRenderer || !inst.bgRenderer.constructor) return;
        var RendererClass = inst.bgRenderer.constructor;
        var proto = RendererClass.prototype;
        if (!proto || typeof proto.getPixels !== 'function') return;
        var original = proto.getPixels;
        if (original.__lrmodSecondaryGetPixels) {
            secondaryGetPixelsHooked = true;
            return;
        }
        proto.getPixels = function (out, scratch) {
            try {
                var canvas = this && this.gl && this.gl.canvas;
                var rig = canvas && getRigForCanvas(canvas);
                if (rig && rig.isSecondary && rig.active) {
                    var owner = rig.inst;
                    compositeSecondaryPreview(owner, rig);
                    var ctx = rig.secondaryCompositeCtx;
                    if (ctx) {
                        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                        if (!out || out.length !== data.length) out = new Uint8Array(data.length);
                        out.set(data);

                        if (!rig._secondaryExplicitFrame && rig._secondaryConsumedRenderSerial !== rig._secondaryRenderSerial) {
                            rig._secondaryConsumedRenderSerial = rig._secondaryRenderSerial;
                            rig._secondaryFrame += 1;
                        }
                        return out;
                    }
                }
            } catch (e) {
                err('secondary getPixels hook failed; using vanilla readback', e);
            }
            return original.call(this, out, scratch);
        };
        proto.getPixels.__lrmodSecondaryGetPixels = true;
        proto.getPixels.__lrmodOriginal = original;
        secondaryGetPixelsProto = proto;
        secondaryGetPixelsOriginal = original;
        secondaryGetPixelsHooked = true;
    }

    function restoreSecondaryGetPixelsHookIfUnused() {
        if (!secondaryGetPixelsHooked || !secondaryGetPixelsProto || !secondaryGetPixelsOriginal) return;
        var hasSecondary = false;
        for (var i = 0; i < knownInstances.length; i++) {
            var inst = knownInstances[i];
            var rig = inst && instanceRigs.get(inst);
            if (rig && rig.isSecondary && inst.canvas && inst.canvas.isConnected) {
                hasSecondary = true;
                break;
            }
        }
        if (hasSecondary) return;
        try {
            if (secondaryGetPixelsProto.getPixels && secondaryGetPixelsProto.getPixels.__lrmodSecondaryGetPixels) {
                secondaryGetPixelsProto.getPixels = secondaryGetPixelsOriginal;
            }
        } catch (e) {}
        secondaryGetPixelsHooked = false;
        secondaryGetPixelsProto = null;
        secondaryGetPixelsOriginal = null;
    }

    function getRigForCanvas(canvas) {
        for (var i = 0; i < knownInstances.length; i++) {
            var inst = knownInstances[i];
            if (!inst) continue;
            var rig = instanceRigs.get(inst);
            if (rig && rig.isSecondary && inst.canvas === canvas) return rig;
        }
        return null;
    }

    function layerOrderIndex(layerId) {
        try {
            var layers = window.Selectors.getTrackLayers();
            for (var i = 0; i < layers.length; i++) {
                if (layers[i].id === layerId) return i;
            }
        } catch (e) {}
        return 0;
    }

    function applyOverlayStyle(canvas, s, zoom) {
        canvas.style.opacity = String(Math.max(0, Math.min(1, s.opacity)));
        canvas.style.mixBlendMode = s.blend === 'invert' ? 'normal' : (s.blend || 'normal');
        canvas.style.filter = buildFilterForSetting(s, zoom);
    }

    function ensureFolderGroup(rig, folderId) {
        var group = rig.folderGroups.get(folderId);
        if (!group) {
            group = document.createElement('div');
            group.className = 'lrmod-folder-fx-group';
            group.style.position = 'absolute';
            group.style.top = '0';
            group.style.left = '0';
            group.style.width = '100%';
            group.style.height = '100%';
            group.style.pointerEvents = 'none';
            group.style.isolation = 'isolate';
            group.dataset.lrmodFolderId = String(folderId);
            rig.folderGroups.set(folderId, group);
        }
        return group;
    }

    function attachLayerVisualForPrimary(entry, visual, parentHint) {
        if (!entry) return;
        if (entry.canvas && entry.canvas !== visual && entry.canvas.parentNode) {
            entry.canvas.parentNode.removeChild(entry.canvas);
        }
        if (entry.displayCanvas && entry.displayCanvas !== visual && entry.displayCanvas.parentNode) {
            entry.displayCanvas.parentNode.removeChild(entry.displayCanvas);
        }

        return visual;
    }

    function applyFolderParallaxStyle(group, setting) {
        if (!group) return;
        group.style.perspective = '';
        group.style.transformStyle = '';
        group.style.transformOrigin = '';
        group.style.transform = '';
        group.style.willChange = '';
    }

function layoutOverlayCanvases(inst, rig) {
        var host = inst.canvas;
        if (!host || !host.parentNode) return;
        hookTrackFileSerialization();

        if (rig.isSecondary) {
            rig._secondaryRenderSerial = rig._secondaryRenderSerial || 0;
            return;
        }
        if (!rig.active) {
            if (rig.riderCanvas && rig.riderCanvas.parentNode) rig.riderCanvas.parentNode.removeChild(rig.riderCanvas);
            rig.folderGroups.forEach(function (g) { if (g && g.parentNode) g.parentNode.removeChild(g); });
            rig.folderGroups.clear();
            return;
        }

        var layers = window.Selectors.getTrackLayers();
        var behind = [];
        var front = [];
        var usedFolderGroups = {};
        var usedLayerCanvases = {};
                layers.forEach(function (layer, idx) {
            if (layer.type === LAYER_TYPE_FOLDER) {
                if (!isDefaultSetting(settings.get(layer.id))) {
                    var group = ensureFolderGroup(rig, layer.id);
                    var folderSetting = getEffectiveSetting(layer.id, getFrameForInstance(inst, rig));
                    if (!isLayerFXVisibleAtFrame(layer.id, getFrameForInstance(inst, rig))) {
                        if (group.parentNode) group.parentNode.removeChild(group);
                        return;
                    }
                    while (group.firstChild) group.removeChild(group.firstChild);
                    var children = getFolderChildren(layer.id);
                    children.sort(function (a, b) { return layerOrderIndex(a.id) - layerOrderIndex(b.id); });
                    children.forEach(function (child) {
                        var entry = rig.layerCanvases.get(child.id);
                        if (!entry || !isLayerCaptureNeeded(child.id)) return;
                        var visual = getLayerVisualCanvas(inst, rig, child.id, entry);
                        attachLayerVisualForPrimary(entry, visual);
                        var childSetting = getEffectiveSetting(child.id, getFrameForInstance(inst, rig));
                        if (!isLayerFXVisibleAtFrame(child.id, getFrameForInstance(inst, rig))) return;
                        applyOverlayStyle(visual, childSetting, getFrameCameraZoom(inst, rig));
                        group.appendChild(visual);
                        usedLayerCanvases[child.id] = true;
                    });
                    applyOverlayStyle(group, folderSetting, getFrameCameraZoom(inst, rig));
                    applyFolderParallaxStyle(group, folderSetting);
                    usedFolderGroups[layer.id] = true;
                    var folderItem = { kind: 'folder', id: layer.id, node: group, order: idx, front: !!folderSetting.front };
                    (folderSetting.front ? front : behind).push(folderItem);
                }
                return;
            }

            if (!isLayerCaptureNeeded(layer.id) || layerParticipatesInCustomFolder(layer.id)) return;
            var entry = rig.layerCanvases.get(layer.id);
            if (!entry) return;
            var visual = getLayerVisualCanvas(inst, rig, layer.id, entry);
            attachLayerVisualForPrimary(entry, visual);
            var setting = getEffectiveSetting(layer.id, getCurrentFrame());
            if (!isLayerFXVisibleAtFrame(layer.id, getCurrentFrame())) return;
            applyOverlayStyle(visual, setting, getFrameCameraZoom(inst, rig));
            usedLayerCanvases[layer.id] = true;
            (setting.front ? front : behind).push({ kind: 'layer', id: layer.id, node: visual, order: idx, front: !!setting.front });
        });

        rig.folderGroups.forEach(function (group, folderId) {
            if (!usedFolderGroups[folderId] && group.parentNode) group.parentNode.removeChild(group);
        });
        rig.layerCanvases.forEach(function (entry, layerId) {
            if (entry.displayCanvas && entry.displayCanvas.parentNode && !usedLayerCanvases[layerId]) {
                entry.displayCanvas.parentNode.removeChild(entry.displayCanvas);
            }
            if (entry.canvas && entry.canvas.parentNode && !usedLayerCanvases[layerId]) {
                entry.canvas.parentNode.removeChild(entry.canvas);
            }
        });

        var parent = host.parentNode;
        var order = [];
        behind.sort(function (a, b) { return a.order - b.order; });
        front.sort(function (a, b) { return a.order - b.order; });
        behind.forEach(function (item) { order.push(item.node); });
        if (rig.riderCanvas) order.push(rig.riderCanvas);
        front.forEach(function (item) { order.push(item.node); });
        rig.toolCanvases.forEach(function (entry) { order.push(entry.canvas); });
        order.forEach(function (node) { parent.appendChild(node); });
    }

    function reconcileInstance(inst) {
        var rig = ensureRig(inst);
        rig.isSecondary = !isPrimaryInstance(inst);
        rig.active = !modDisabled && anyCustomized();
        hookTrackFileSerialization();
        if (rig.isSecondary) hookSecondaryGetPixels(inst);

        if (!rig.active) {
            unpatchAllRenderersForInstance(inst);
            clearRiderOverlay(rig, true);
            rig.folderGroups.forEach(function(g){ if(g&&g.parentNode)g.parentNode.removeChild(g); });
            rig.folderGroups.clear();
            rig.layerCanvases.forEach(function(e){
                clear2DCanvas(e.captureCanvas);
                clear2DCanvas(e.displayCanvas);
                if(e.captureCanvas&&e.captureCanvas.parentNode)e.captureCanvas.parentNode.removeChild(e.captureCanvas);
                if(e.displayCanvas&&e.displayCanvas.parentNode)e.displayCanvas.parentNode.removeChild(e.displayCanvas);
            });
            rig.layerCanvases.clear();
            rig.toolCanvases.forEach(function(e){ if(e.canvas&&e.canvas.parentNode)e.canvas.parentNode.removeChild(e.canvas); clear2DCanvas(e.canvas); });
            disposeSharedCaptureOnly(rig);
            try { inst.rerender(); } catch (e) { err('vanilla rerender after FX disable failed', e); }
        }
        if (rig.active) {
            var layers = window.Selectors.getTrackLayers();
            layers.forEach(function (layer) {
                if (layer.type !== LAYER_TYPE_LAYER) return;
                if (!isLayerCaptureNeeded(layer.id)) return;
                var pair = getLayerRendererPair(inst, layer.id);
                if (!pair) return;
                if (pair.edit) patchLayerRendererInstance(inst, rig, layer.id, pair.edit);
                if (pair.playback) patchLayerRendererInstance(inst, rig, layer.id, pair.playback);
            });
            patchSpriteRenderers(inst, rig);
            if (!rig.isSecondary) patchToolRenderers(inst, rig);
            try { inst.rerender(); } catch (e) { err('forced rerender failed', e); }
            clearHiddenCustomLayerOverlays(inst, rig);
        }

        try { layoutOverlayCanvases(inst, rig); } catch (e) { err('layout failed', e); }
        if (rig.isSecondary && rig.active) {
            try { compositeSecondaryPreview(inst, rig); } catch (e) { err('secondary preview composite failed', e); }
        }
    }

    function cleanupOrphanedCanvases() {
        var valid = {};
        try {
            window.Selectors.getTrackLayers().forEach(function (l) { valid[l.id] = true; });
        } catch (e) {}
        knownInstances.forEach(function (inst) {
            var rig = instanceRigs.get(inst);
            if (!rig) return;
            Array.from(rig.layerCanvases.keys()).forEach(function (layerId) {
                if (!valid[layerId] || !isLayerCaptureNeeded(layerId)) {
                    var entry = rig.layerCanvases.get(layerId);
                    if (entry && entry.captureCanvas) {
                        clear2DCanvas(entry.captureCanvas);
                        if (entry.captureCanvas.parentNode) entry.captureCanvas.parentNode.removeChild(entry.captureCanvas);
                    }
                    if (entry && entry.displayCanvas) {
                        clear2DCanvas(entry.displayCanvas);
                        if (entry.displayCanvas.parentNode) entry.displayCanvas.parentNode.removeChild(entry.displayCanvas);
                    }
                    rig.layerCanvases.delete(layerId);
                }
            });
            Array.from(rig.folderGroups.keys()).forEach(function (folderId) {
                if (!valid[folderId] || isDefaultSetting(settings.get(folderId))) {
                    var group = rig.folderGroups.get(folderId);
                    if (group && group.parentNode) group.parentNode.removeChild(group);
                    rig.folderGroups.delete(folderId);
                }
            });
            Array.from(rig.folderCompositeCanvases.keys()).forEach(function (folderId) {
                if (!valid[folderId] || isDefaultSetting(settings.get(folderId))) rig.folderCompositeCanvases.delete(folderId);
            });
        });
        restoreSecondaryGetPixelsHookIfUnused();
    }

    var renderReconcileTimer = null;
    function scheduleRenderReconcile() {
        if (renderReconcileTimer) clearTimeout(renderReconcileTimer);
        renderReconcileTimer = setTimeout(function () {
            renderReconcileTimer = null;
            try {
                pruneKnownInstances();
                var insts = findAllRenderInstances();
                insts.forEach(function (inst) {
                    ensureRig(inst);
                    reconcileInstance(inst);
                });
            } catch (e) {
                err('render reconcile failed', e);
            }
        }, 30);
    }

    function disableMod() {
        modDisabled = true;
        exitGradientEditor();
        knownInstances.forEach(function (inst) {
            try {
                inst.layerRenderers.forEach(function (pair) {
                    unpatchRendererInstance(pair.edit);
                    unpatchRendererInstance(pair.playback);
                });
                unpatchRendererInstance(inst.editRenderer);
                unpatchRendererInstance(inst.playbackRenderer);
                unpatchSpriteRenderers(inst);
                unpatchToolRenderers(inst);
                var rig = instanceRigs.get(inst);
                if (rig) { rig.active=false; }
            } catch (e) {}
        });
        log('mod disabled - rendering reverted to vanilla. Run window.LRLayerFX.enable() to re-enable.');
    }

    function enableMod() {
        modDisabled = false;
        scheduleRenderReconcile();
        log('mod enabled');
    }

    window.LRLayerFX = {
        disable: disableMod,
        enable: enableMod,
        getSettings: function () {
            var out = {};
            settings.forEach(function (s, id) { out[id] = s; });
            return out;
        },
        exitGradientEditor: exitGradientEditor
    };

    var POPOVER_CLASS = 'lrmod-fx-popover';
    var activePopover = null;
    var activeGradientEditor = null;

    function findLayerRows() {

        return document.querySelectorAll('input[type="checkbox"][id^="Check"]');
    }

    function parseLayerIdFromCheckboxId(id) {
        var n = parseInt(id.slice('Check'.length), 10);
        return Number.isNaN(n) ? null : n;
    }

    function updateButtonAppearance(btn, layerId) {
        if (!btn) return;
        var s = getEffectiveSetting(layerId, getCurrentFrame());
        var active = !isDefaultSetting(getSetting(layerId));
        btn.style.background=active?'#cfe8ff':'#ffffff'; btn.style.borderColor=active?'#0075FF':'#999999'; btn.style.color=active?'#0057c2':'#333333';
        btn.title=(getLayerType(layerId)===LAYER_TYPE_FOLDER?'Folder':'Layer')+' FX'+(keyframeAt(getSetting(layerId),getCurrentFrame())?' • keyframe at current frame':'');
    }
    function getAdjacentKeyframe(layerId, dir) {
        var kfs=normalizeKeyframes(getSetting(layerId).keyframes), f=getCurrentFrame(), out=null;
        kfs.forEach(function(k){ if(dir<0 && k.frame<f) out=k; if(dir>0 && k.frame>f && !out) out=k; });
        return out;
    }
    function goToFrame(frame) {
        try { window.store.dispatch({type:'SET_PLAYER_INDEX',payload:Math.max(0,Math.floor(frame))}); } catch(e){}
        scheduleUIRescan();
        scheduleRenderReconcile();
    }
    function toggleKeyframe(layerId) {
        var base=getSetting(layerId), frame=getCurrentFrame(), kfs=normalizeKeyframes(base.keyframes), idx=kfs.findIndex(function(k){return k.frame===frame;});
        if(idx>=0) kfs.splice(idx,1); else kfs.push(snapshotForKeyframe(layerId,getEffectiveSetting(layerId,frame)));
        kfs=normalizeKeyframes(kfs);
        setSetting(layerId,{keyframes:kfs},{forceBase:true});
    }

    function ensureFXButton(checkboxEl, layerId, type) {
        var container = checkboxEl.parentElement;
        if (!container) return;
        var btn = container.querySelector('button.lrmod-fx-btn');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lrmod-fx-btn';
            btn.textContent = 'fx';
            btn.style.width = '22px';
            btn.style.height = '20px';
            btn.style.fontSize = '10px';
            btn.style.lineHeight = '18px';
            btn.style.padding = '0';
            btn.style.marginRight = '3px';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid #999';
            btn.style.borderRadius = '3px';
            btn.style.background = '#fff';
            btn.style.fontFamily = 'sans-serif';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                togglePopover(btn, layerId);
            });
            container.insertBefore(btn, checkboxEl);
        }
        btn.title = type === LAYER_TYPE_FOLDER
            ? 'Folder FX: opacity, blur, blend mode, visibility, render in front of rider, parallax'
            : 'Layer FX: opacity, blur, blend mode, render in front of rider, gradient';
        btn.dataset.lrmodLayerId = String(layerId);
        btn.dataset.lrmodLayerType = String(type);
        updateButtonAppearance(btn, layerId);
    }

    var uiScanTimer = null;
    function scheduleUIRescan() {
        if (uiScanTimer) clearTimeout(uiScanTimer);
        uiScanTimer = setTimeout(function () {
            uiScanTimer = null;
            try { uiRescan(); } catch (e) { err('UI rescan failed', e); }
        }, 30);
    }

    function uiRescan() {
        var rows = findLayerRows();
        for (var i = 0; i < rows.length; i++) {
            var chk = rows[i];
            var layerId = parseLayerIdFromCheckboxId(chk.id);
            if (layerId === null) continue;
            var type = getLayerType(layerId);
            if (type !== LAYER_TYPE_LAYER && type !== LAYER_TYPE_FOLDER) continue;
            ensureFXButton(chk, layerId, type);
            if (type === LAYER_TYPE_LAYER) {
                var row = chk.parentElement && chk.parentElement.parentElement;
                var colorInput = row && row.querySelector('input[type="color"]');
                if (colorInput) {
                    interceptLayerColorInput(colorInput, layerId);
                    if (getSetting(layerId).keyframes.length) colorInput.value = getEffectiveLayerColor(layerId, getCurrentFrame());
                }
            }
        }
        if (activePopover && activePopover.anchorBtn && !document.body.contains(activePopover.anchorBtn)) closePopover();
    }

    function closePopover() {
        if (activePopover) {
            if (activePopover.el.parentNode) activePopover.el.parentNode.removeChild(activePopover.el);
            document.removeEventListener('mousedown', onDocMouseDownForPopover, true);
            window.removeEventListener('resize', closePopover);
            activePopover = null;
        }
    }

    function onDocMouseDownForPopover(e) {
        if (activePopover && !activePopover.el.contains(e.target) && e.target !== activePopover.anchorBtn) closePopover();
    }

    function makeRow(labelText) {
        var row = document.createElement('div');
        row.style.marginTop = '8px';
        var label = document.createElement('div');
        label.textContent = labelText;
        label.style.marginBottom = '2px';
        row.appendChild(label);
        return { row: row, label: label };
    }

    function setLayerColorForCurrentFrame(layerId, color) {
        var normalized = normalizeHexColor(color);
        var frame = getCurrentFrame();
        var base = getSetting(layerId);
        var kfs = normalizeKeyframes(base.keyframes);
        if (!kfs.length) {
            setNativeLayerColor(layerId, normalized);
            return;
        }
        var idx = kfs.findIndex(function (kf) { return kf.frame === frame; });
        if (idx < 0) {
            var effective = getEffectiveSetting(layerId, frame);
            var kf = snapshotForKeyframe(layerId, effective);
            kf.color = normalized;
            delete kf.gradient;
            kfs.push(kf);
        } else {
            kfs[idx] = Object.assign({}, kfs[idx], { color: normalized });
            delete kfs[idx].gradient;
        }
        setSetting(layerId, { keyframes: normalizeKeyframes(kfs) }, { forceBase: true });
    }

    function interceptLayerColorInput(input, layerId) {
        if (!input || input.__lrmodColorHooked) return;
        input.__lrmodColorHooked = true;
        function handleNativeColorEvent(e) {
            try {
                var base = getSetting(layerId);
                if (!base.keyframes || !base.keyframes.length) return;

                e.preventDefault();
                e.stopImmediatePropagation();
                setLayerColorForCurrentFrame(layerId, input.value);
                input.value = getEffectiveLayerColor(layerId, getCurrentFrame());
                updateButtonAppearance(findFxButtonForLayer(layerId), layerId);
                refreshOpenPopover(layerId);
            } catch (err0) { err('layer color keyframe interception failed', err0); }
        }
        input.addEventListener('input', handleNativeColorEvent, true);
        input.addEventListener('change', handleNativeColorEvent, true);
    }

    function findFxButtonForLayer(layerId) {
        var el = document.querySelector('button.lrmod-fx-btn[data-lrmod-layer-id="' + String(layerId) + '"]');
        return el;
    }

    function setGradientForLayer(layerId, gradient) {
        var normalized = normalizeGradient(gradient);
        var frame = getCurrentFrame();
        var base = getSetting(layerId);
        var kfs = normalizeKeyframes(base.keyframes);
        if (!kfs.length) {

            setSetting(layerId, { gradient: normalized });
            return;
        }
        var idx = kfs.findIndex(function (kf) { return kf.frame === frame; });
        if (idx >= 0) {
            kfs[idx] = Object.assign({}, kfs[idx], {
                gradient: normalized
            });
            if (!normalized) {
                delete kfs[idx].gradient;
                kfs[idx].color = normalizeHexColor(getLayerColor(layerId));
            } else {
                delete kfs[idx].color;
            }
            setSetting(layerId, { keyframes: normalizeKeyframes(kfs) }, { forceBase: true });
            return;
        }
        var effective = getEffectiveSetting(layerId, frame);
        var kf = snapshotForKeyframe(layerId, effective);
        if (normalized) {
            kf.gradient = normalized;
            delete kf.color;
        } else {
            delete kf.gradient;
            kf.color = normalizeHexColor(getLayerColor(layerId));
        }
        kfs.push(kf);
        setSetting(layerId, { keyframes: normalizeKeyframes(kfs) }, { forceBase: true });
    }

    function refreshOpenPopover(layerId) {
        if (!activePopover || activePopover.layerId !== layerId || !activePopover.anchorBtn) return;
        var anchor = activePopover.anchorBtn;
        setTimeout(function(){
            if (!anchor.isConnected) return;
            closePopover();
            togglePopover(anchor, layerId);
        }, 0);
    }

    function exitGradientEditor() {
        var layerId = activeGradientEditor && activeGradientEditor.layerId;
        activeGradientEditor = null;
        removeGradientEditorMarkers();
        updateGradientEditorButtonState();
        scheduleUIRescan();
        if (layerId != null) refreshOpenPopover(layerId);
        scheduleRenderReconcile();
    }

    function openGradientEditor(layerId) {
        var primary = null;
        for (var i = 0; i < knownInstances.length; i++) {
            var candidate = knownInstances[i];
            if (candidate && isPrimaryInstance(candidate) && candidate.canvas && candidate.canvas.isConnected) {
                primary = candidate;
                break;
            }
        }
        if (!primary) {
            warn('could not find primary Line Rider canvas for gradient editor');
            return;
        }

        activeGradientEditor = { layerId: layerId, inst: primary };
        updateGradientEditorButtonState();
        scheduleRenderReconcile();
        installGradientEditorInputHandler();
        ensureGradientEditorOverlay();
        updateGradientEditorMarkers();
    }

    var gradientInputHandlerInstalled = false;
    function isClientPointInCanvas(inst, clientX, clientY) {
        if (!inst || !inst.canvas || !inst.canvas.isConnected) return false;
        var rect = inst.canvas.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }

    function trackPositionFromClientPoint(inst, clientX, clientY) {
        var rig = instanceRigs.get(inst);
        if (!rig) return null;
        if (!rig.lastCamera) { try { var ep=window.Selectors.getEditorPosition(); var ez=window.Selectors.getEditorZoom(); rig.lastCamera={focalX:ep&&ep.x||0,focalY:ep&&ep.y||0,zoom:ez||1}; } catch(e) {} }
        if (!rig.lastRenderOpts) rig.lastRenderOpts={width:inst.canvas.width||1,height:inst.canvas.height||1};
        var rect = inst.canvas.getBoundingClientRect();
        var w = rig.lastRenderOpts.width, h = rig.lastRenderOpts.height;
        if (!rect.width || !rect.height || !w || !h) return null;
        var logicalX = (clientX - rect.left) * w / rect.width;
        var logicalY = (clientY - rect.top) * h / rect.height;
        var camera = rig.lastCamera;
        return {
            x: (logicalX - w / 2) / camera.zoom + camera.focalX,
            y: (logicalY - h / 2) / camera.zoom + camera.focalY
        };
    }

    function addGradientStopAtClientPoint(clientX, clientY) {
        if (!activeGradientEditor) return;
        var inst = activeGradientEditor.inst;
        var pos = trackPositionFromClientPoint(inst, clientX, clientY);
        if (!pos) return;
        var s = getEffectiveSetting(activeGradientEditor.layerId, getCurrentFrame());
        var gradient = normalizeGradient(s.gradient) || { stops: [] };
        gradient.stops.push({ x: pos.x, y: pos.y, color: getLayerColor(activeGradientEditor.layerId) });
        setGradientForLayer(activeGradientEditor.layerId, gradient);
        updateGradientEditorMarkers();
    }

    function installGradientEditorInputHandler() {
        if (gradientInputHandlerInstalled) return;
        gradientInputHandlerInstalled = true;

        document.addEventListener('pointerdown', function (e) {
            if (!activeGradientEditor) return;

            if (e.button !== 0) return;
            if (e.target && e.target.closest && (e.target.closest('#lrmod-gradient-editor-overlay') || e.target.closest('.lrmod-fx-popover'))) return;
            if (!isClientPointInCanvas(activeGradientEditor.inst, e.clientX, e.clientY)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);

        document.addEventListener('pointerup', function (e) {
            if (!activeGradientEditor) return;

            if (e.button !== 0) return;
            if (e.target && e.target.closest && (e.target.closest('#lrmod-gradient-editor-overlay') || e.target.closest('.lrmod-fx-popover'))) return;
            if (!isClientPointInCanvas(activeGradientEditor.inst, e.clientX, e.clientY)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);

        document.addEventListener('pointercancel', function () {
        }, true);

        document.addEventListener('contextmenu', function (e) {
            if (!activeGradientEditor) return;
            if (e.target && e.target.closest && (e.target.closest('#lrmod-gradient-editor-overlay') || e.target.closest('.lrmod-fx-popover'))) return;
            if (!isClientPointInCanvas(activeGradientEditor.inst, e.clientX, e.clientY)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);

        document.addEventListener('dblclick', function (e) {
            if (!activeGradientEditor) return;
            if (e.target && e.target.closest && (e.target.closest('#lrmod-gradient-editor-overlay') || e.target.closest('.lrmod-fx-popover'))) return;
            if (!isClientPointInCanvas(activeGradientEditor.inst, e.clientX, e.clientY)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            addGradientStopAtClientPoint(e.clientX, e.clientY);
        }, true);
    }

    function ensureGradientEditorOverlay() {
        if (document.getElementById('lrmod-gradient-editor-overlay')) return document.getElementById('lrmod-gradient-editor-overlay');
        var overlay = document.createElement('div');
        overlay.id = 'lrmod-gradient-editor-overlay';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.width = '0';
        overlay.style.height = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = String(GRADIENT_EDITOR_Z);
        document.body.appendChild(overlay);
        return overlay;
    }

    function removeGradientEditorMarkers() {
        var overlay = document.getElementById('lrmod-gradient-editor-overlay');
        if (!overlay) return;
        while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    }

    function openColorPickerForStop(color, onColor, anchorX, anchorY) {
        var input = document.createElement('input');
        input.type = 'color';
        input.value = normalizeHexColor(color);
        input.style.position = 'fixed';

        input.style.left = Math.max(0, Math.round(Number(anchorX) || 0)) + 'px';
        input.style.top = Math.max(0, Math.round(Number(anchorY) || 0)) + 'px';
        input.style.width = '20px';
        input.style.height = '20px';
        input.style.opacity = '0.01';
        input.style.pointerEvents = 'none';
        input.style.zIndex = '2147483647';
        document.body.appendChild(input);
        var done = false;
        function apply() {
            if (done) return;
            onColor(normalizeHexColor(input.value));
            done = true;
            if (input.parentNode) input.parentNode.removeChild(input);
        }
        input.addEventListener('input', function () { onColor(normalizeHexColor(input.value)); });
        input.addEventListener('change', apply);
        input.addEventListener('blur', function () { setTimeout(function () { if (!done) apply(); }, 0); });
        input.focus();
        try { input.click(); } catch (e) {}
    }

    function screenPositionForGradientStop(inst, stop) {
        var rig = instanceRigs.get(inst);
        if (!rig) return null;
        if (!rig.lastCamera) { try { var ep=window.Selectors.getEditorPosition(); var ez=window.Selectors.getEditorZoom(); rig.lastCamera={focalX:ep&&ep.x||0,focalY:ep&&ep.y||0,zoom:ez||1}; } catch(e) {} }
        if (!rig.lastRenderOpts) rig.lastRenderOpts={width:inst.canvas.width||1,height:inst.canvas.height||1};
        var rect = inst.canvas.getBoundingClientRect();
        var w = rig.lastRenderOpts.width, h = rig.lastRenderOpts.height;
        if (!w || !h || !rect.width || !rect.height) return null;
        var lx = (stop.x - rig.lastCamera.focalX) * rig.lastCamera.zoom + w / 2;
        var ly = (stop.y - rig.lastCamera.focalY) * rig.lastCamera.zoom + h / 2;
        return {
            x: rect.left + lx * rect.width / w,
            y: rect.top + ly * rect.height / h
        };
    }

    function updateGradientEditorMarkers() {
        var overlay = ensureGradientEditorOverlay();
        if (!activeGradientEditor || !activeGradientEditor.inst || !activeGradientEditor.inst.canvas || !activeGradientEditor.inst.canvas.isConnected) {
            removeGradientEditorMarkers();
            return;
        }
        var s = getEffectiveSetting(activeGradientEditor.layerId, getCurrentFrame());
        var gradient = normalizeGradient(s.gradient);
        if (!gradient) {
            removeGradientEditorMarkers();
            return;
        }
        var stops = gradient.stops;
        var existing = Array.prototype.slice.call(overlay.children);
        var rebuild = existing.length !== stops.length;
        if (rebuild) removeGradientEditorMarkers();

        if (rebuild) {
            existing = [];
            stops.forEach(function (stop, index) {
                var marker = document.createElement('div');
                marker.dataset.lrmodGradientStop = String(index);
                marker.style.position = 'fixed';
                marker.style.width = '14px';
                marker.style.height = '14px';
                marker.style.borderRadius = '50%';
                marker.style.border = '2px solid #fff';
                marker.style.boxShadow = '0 0 0 1px #000, 0 1px 5px rgba(0,0,0,.45)';
                marker.style.pointerEvents = 'auto';
                marker.style.cursor = 'grab';
                marker.title = 'Drag to move • left click to change color • right click to remove';
                var dragging = false;
                var moved = false;
                var dragStartX = 0, dragStartY = 0;
                function moveStop(ev) {
                    if (!dragging || !activeGradientEditor) return;
                    var rig = instanceRigs.get(activeGradientEditor.inst);
                    if (!rig || !rig.lastCamera || !rig.lastRenderOpts) return;
                    moved = true;
                    var rect = activeGradientEditor.inst.canvas.getBoundingClientRect();
                    var lx = (ev.clientX - rect.left) * rig.lastRenderOpts.width / rect.width;
                    var ly = (ev.clientY - rect.top) * rig.lastRenderOpts.height / rect.height;
                    var frame = getCurrentFrame();
                    var g = normalizeGradient(getEffectiveSetting(activeGradientEditor.layerId, frame).gradient);
                    if (!g || !g.stops[index]) return;
                    g.stops[index].x = (lx - rig.lastRenderOpts.width / 2) / rig.lastCamera.zoom + rig.lastCamera.focalX;
                    g.stops[index].y = (ly - rig.lastRenderOpts.height / 2) / rig.lastCamera.zoom + rig.lastCamera.focalY;
                    setGradientForLayer(activeGradientEditor.layerId, g);
                    scheduleRenderReconcile();
                    var pos = screenPositionForGradientStop(activeGradientEditor.inst, g.stops[index]);
                    if (pos) {
                        marker.style.left = (pos.x - 7) + 'px';
                        marker.style.top = (pos.y - 7) + 'px';
                    }
                }
                function finishDrag(ev) {
                    if (!dragging) return;
                    dragging = false;
                    document.removeEventListener('pointermove', moveStop, true);
                    document.removeEventListener('pointerup', finishDrag, true);
                    marker.style.cursor = 'grab';
                    if (moved) {
                        markTrackDirtyForFX();
                        updateGradientEditorMarkers();
                    } else if (Math.abs(ev.clientX - dragStartX) < 4 && Math.abs(ev.clientY - dragStartY) < 4) {
                        var stopPos = screenPositionForGradientStop(activeGradientEditor.inst,
                            getEffectiveSetting(activeGradientEditor.layerId, getCurrentFrame()).gradient.stops[index]);
                        openColorPickerForStop(
                            getEffectiveSetting(activeGradientEditor.layerId, getCurrentFrame()).gradient.stops[index].color,
                            function (color) {
                                var live = normalizeGradient(getEffectiveSetting(activeGradientEditor.layerId, getCurrentFrame()).gradient);
                                if (!live || !live.stops[index]) return;
                                live.stops[index].color = color;
                                setGradientForLayer(activeGradientEditor.layerId, live);
                                markTrackDirtyForFX();
                                updateGradientEditorMarkers();
                            },
                            stopPos ? stopPos.x : ev.clientX,
                            stopPos ? stopPos.y : ev.clientY
                        );
                    }
                }
                marker.addEventListener('pointerdown', function (ev) {
                    if (ev.button !== 0) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    dragging = true;
                    moved = false;
                    dragStartX = ev.clientX;
                    dragStartY = ev.clientY;
                    marker.style.cursor = 'grabbing';
                    document.addEventListener('pointermove', moveStop, true);
                    document.addEventListener('pointerup', finishDrag, true);
                }, true);
                marker.addEventListener('contextmenu', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var live = normalizeGradient(getEffectiveSetting(activeGradientEditor.layerId, getCurrentFrame()).gradient);
                    if (!live || !live.stops[index]) return;
                    live.stops.splice(index, 1);
                    setGradientForLayer(activeGradientEditor.layerId, live);
                    if (!normalizeGradient(live)) exitGradientEditor(); else updateGradientEditorMarkers();
                }, true);
                overlay.appendChild(marker);
                existing.push(marker);
            });
        }

        existing = Array.prototype.slice.call(overlay.children);
        stops.forEach(function (stop, index) {
            var marker = existing[index];
            if (!marker) return;
            var pos = screenPositionForGradientStop(activeGradientEditor.inst, stop);
            if (!pos) return;
            marker.style.left = (pos.x - 7) + 'px';
            marker.style.top = (pos.y - 7) + 'px';
            marker.style.background = stop.color;
        });
    }

    function updateGradientEditorButtonState() {
        if (!activePopover || !activePopover.gradientButton) return;
        var layerId = activePopover.layerId;
        activePopover.gradientButton.textContent = activeGradientEditor && activeGradientEditor.layerId === layerId
            ? 'Done Editing Gradient' : 'Edit Gradient';
    }

    function addEditGradientButton(panel, btn, layerId) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = activeGradientEditor && activeGradientEditor.layerId === layerId ? 'Done Editing Gradient' : 'Edit Gradient';
        b.className = 'lrmod-edit-gradient-btn';
        b.style.marginTop = '10px';
        b.style.width = '100%';
        b.style.cursor = 'pointer';
        b.style.padding = '4px 0';
        b.addEventListener('click', function () {
            if (activeGradientEditor && activeGradientEditor.layerId === layerId) exitGradientEditor();
            else openGradientEditor(layerId);
        });
        panel.appendChild(b);
    }

    function togglePopover(btn, layerId) {
        if (activePopover && activePopover.layerId === layerId) {
            closePopover();
            return;
        }
        closePopover();
        var s = getEffectiveSetting(layerId, getCurrentFrame());
        var type = getLayerType(layerId);
        var rect = btn.getBoundingClientRect();
        var panel = document.createElement('div');
        panel.className = POPOVER_CLASS;
        panel.style.position = 'fixed';
        panel.style.top = (rect.bottom + 4) + 'px';
        panel.style.left = Math.max(4, rect.right - 250) + 'px';
        panel.style.width = '250px';
        panel.style.background = '#ffffff';
        panel.style.border = '1px solid #999';
        panel.style.borderRadius = '6px';
        panel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
        panel.style.padding = '10px';
        panel.style.zIndex = '999999';
        panel.style.fontFamily = 'sans-serif';
        panel.style.fontSize = '12px';
        panel.style.color = '#222';

        var title = document.createElement('div');
        title.textContent = (type === LAYER_TYPE_FOLDER ? 'Folder ' : 'Layer ') + layerId + ' FX';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '6px';
        panel.appendChild(title);

        var krow=document.createElement('div'); krow.style.display='flex'; krow.style.alignItems='center'; krow.style.justifyContent='center'; krow.style.gap='4px'; krow.style.margin='7px 0 2px';
        var prevBtn=document.createElement('button'); prevBtn.type='button'; prevBtn.textContent='◀'; prevBtn.style.width='24px'; prevBtn.style.padding='2px';
        var keyBtn=document.createElement('button'); keyBtn.type='button'; keyBtn.textContent='◆'; keyBtn.title='Toggle keyframe at current frame'; keyBtn.style.width='46px'; keyBtn.style.padding='2px';
        var nextBtn=document.createElement('button'); nextBtn.type='button'; nextBtn.textContent='▶'; nextBtn.style.width='24px'; nextBtn.style.padding='2px';
        var prevK=getAdjacentKeyframe(layerId,-1), nextK=getAdjacentKeyframe(layerId,1), curK=keyframeAt(getSetting(layerId),getCurrentFrame());
        prevBtn.disabled=!prevK; nextBtn.disabled=!nextK; keyBtn.style.background=curK?'#cfe8ff':'#fff'; keyBtn.style.borderColor=curK?'#0075FF':'#999';
        prevBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(prevK){goToFrame(prevK.frame);refreshOpenPopover(layerId);}});
        nextBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(nextK){goToFrame(nextK.frame);refreshOpenPopover(layerId);}});
        keyBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();toggleKeyframe(layerId);refreshOpenPopover(layerId);});
        krow.appendChild(prevBtn); krow.appendChild(keyBtn); krow.appendChild(nextBtn); panel.appendChild(krow);

        var frameHint=document.createElement('div'); frameHint.style.textAlign='center'; frameHint.style.fontSize='10px'; frameHint.style.color='#666'; frameHint.textContent='Frame '+getCurrentFrame()+(curK?' • keyframe':''); panel.appendChild(frameHint);

        function addNumericSliderRow(labelText, value, min, max, step, suffix, toValue, onValue) {
            var row = document.createElement('div');
            row.style.marginTop = '8px';
            var header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.gap = '8px';
            var label = document.createElement('span');
            label.textContent = labelText;
            var number = document.createElement('input');
            number.type = 'number';
            number.min = String(min);
            number.max = String(max);
            number.step = String(step);
            number.value = String(value);
            number.style.width = '72px';
            number.style.boxSizing = 'border-box';
            var slider = document.createElement('input');
            slider.type = 'range';
            slider.min = String(min);
            slider.max = String(max);
            slider.step = String(step);
            slider.value = String(value);
            slider.style.width = '100%';

            function format(v) {
                return String(v) + (suffix || '');
            }
            function clamp(v) {
                if (!Number.isFinite(v)) v = Number(value) || 0;
                return Math.max(Number(min), Math.min(Number(max), v));
            }
            function commit(v, source) {
                v = clamp(v);
                slider.value = String(v);
                number.value = String(v);
                onValue(v);
                if (source === 'input' || source === 'number') updateButtonAppearance(btn, layerId);
            }

            slider.addEventListener('input', function () {
                commit(Number(slider.value), 'input');
            });
            number.addEventListener('change', function () {
                commit(Number(number.value), 'number');
            });
            number.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    number.blur();
                }
            });

            header.appendChild(label);
            header.appendChild(number);
            row.appendChild(header);
            row.appendChild(slider);
            return { row: row, label: label, number: number, slider: slider, format: format };
        }

        var opControl = addNumericSliderRow('Opacity:', Math.round(s.opacity * 100), 0, 100, 1, '%', null, function (v) {
            setSetting(layerId, { opacity: v / 100 });
        });
        panel.appendChild(opControl.row);

        var blurControl = addNumericSliderRow('Blur:', Math.round(s.blur), 0, MAX_BLUR_PX, 1, ' px', null, function (v) {
            setSetting(layerId, { blur: v });
        });
        panel.appendChild(blurControl.row);

        var blendRow = makeRow('Blend mode:');
        var select = document.createElement('select');
        select.style.width = '100%';
        BLEND_MODES.forEach(function (bm) {
            var opt = document.createElement('option');
            opt.value = bm.value;
            opt.textContent = bm.label;
            if (s.blend === bm.value) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', function () {
            setSetting(layerId, { blend: select.value });
            updateButtonAppearance(btn, layerId);
        });
        blendRow.row.appendChild(select);
        panel.appendChild(blendRow.row);

        if (type === LAYER_TYPE_LAYER) {
            var gradientModeRow = makeRow('Gradient mode:');
            var gradientModeSelect = document.createElement('select');
            gradientModeSelect.style.width = '100%';
            GRADIENT_MODES.forEach(function (gm) {
                var gmOpt = document.createElement('option');
                gmOpt.value = gm.value;
                gmOpt.textContent = gm.label;
                if (s.gradientMode === gm.value) gmOpt.selected = true;
                gradientModeSelect.appendChild(gmOpt);
            });
            gradientModeSelect.addEventListener('change', function () {
                setSetting(layerId, { gradientMode: gradientModeSelect.value });
                updateButtonAppearance(btn, layerId);
            });
            gradientModeRow.row.appendChild(gradientModeSelect);
            panel.appendChild(gradientModeRow.row);
        }

        if (type === LAYER_TYPE_FOLDER) {
            var parallaxWrap = document.createElement('label');
            parallaxWrap.style.display = 'flex';
            parallaxWrap.style.alignItems = 'center';
            parallaxWrap.style.marginTop = '10px';
            parallaxWrap.style.cursor = 'pointer';
            var parallaxCb = document.createElement('input');
            parallaxCb.type = 'checkbox';
            parallaxCb.checked = !!s.parallax;
            parallaxWrap.appendChild(parallaxCb);
            var parallaxText = document.createElement('span');
            parallaxText.textContent = ' Enable parallax';
            parallaxText.style.marginLeft = '4px';
            parallaxWrap.appendChild(parallaxText);
            panel.appendChild(parallaxWrap);

            var parallaxOptions = document.createElement('div');
            parallaxOptions.style.display = s.parallax ? 'block' : 'none';
            panel.appendChild(parallaxOptions);

            var zControl = addNumericSliderRow('Z distance:', Math.round(s.parallaxZ), -2000, 2000, 1, ' px', null, function (v) {
                setSetting(layerId, { parallaxZ: v });
            });
            parallaxOptions.appendChild(zControl.row);

            var pitchControl = addNumericSliderRow('Pitch:', Number(s.parallaxPitch).toFixed(2), -20, 20, 0.01, '', null, function (v) {
                setSetting(layerId, { parallaxPitch: v });
            });
            parallaxOptions.appendChild(pitchControl.row);

            var yawControl = addNumericSliderRow('Yaw:', Number(s.parallaxYaw).toFixed(2), -20, 20, 0.01, '', null, function (v) {
                setSetting(layerId, { parallaxYaw: v });
            });
            parallaxOptions.appendChild(yawControl.row);

            var scaleWrap = document.createElement('label'); scaleWrap.style.display = 'flex'; scaleWrap.style.alignItems = 'center'; scaleWrap.style.marginTop = '8px'; scaleWrap.style.cursor = 'pointer';
            var scaleCb = document.createElement('input'); scaleCb.type = 'checkbox'; scaleCb.checked = s.parallaxScaleLines !== false;
            scaleCb.addEventListener('change', function () { setSetting(layerId, { parallaxScaleLines: scaleCb.checked }); updateButtonAppearance(btn, layerId); });
            scaleWrap.appendChild(scaleCb); var scaleText = document.createElement('span'); scaleText.textContent = ' Scale line width to depth'; scaleText.style.marginLeft = '4px'; scaleWrap.appendChild(scaleText); parallaxOptions.appendChild(scaleWrap);

            parallaxCb.addEventListener('change', function () {
                parallaxOptions.style.display = parallaxCb.checked ? 'block' : 'none';
                setSetting(layerId, { parallax: parallaxCb.checked });
                updateButtonAppearance(btn, layerId);
            });
        }

        var frontWrap = document.createElement('label');
        frontWrap.style.display = 'flex';
        frontWrap.style.alignItems = 'center';
        frontWrap.style.marginTop = '10px';
        frontWrap.style.cursor = 'pointer';
        var frontCb = document.createElement('input');
        frontCb.type = 'checkbox';
        frontCb.checked = !!s.front;
        frontCb.addEventListener('change', function () {
            setSetting(layerId, { front: frontCb.checked });
            updateButtonAppearance(btn, layerId);
        });
        frontWrap.appendChild(frontCb);
        var frontText = document.createElement('span');
        frontText.textContent = ' Render in front of rider';
        frontText.style.marginLeft = '4px';
        frontWrap.appendChild(frontText);
        panel.appendChild(frontWrap);

        var visibilityWrap = document.createElement('label');
        visibilityWrap.style.display = 'flex';
        visibilityWrap.style.alignItems = 'center';
        visibilityWrap.style.marginTop = '10px';
        visibilityWrap.style.cursor = 'pointer';
        var visibilityCb = document.createElement('input');
        visibilityCb.type = 'checkbox';
        visibilityCb.checked = s.visible !== false;
        visibilityCb.addEventListener('change', function () {
            setSetting(layerId, { visible: visibilityCb.checked });
            updateButtonAppearance(btn, layerId);
        });
        visibilityWrap.appendChild(visibilityCb);
        var visibilityText = document.createElement('span');
        visibilityText.textContent = ' Visible';
        visibilityText.style.marginLeft = '4px';
        visibilityWrap.appendChild(visibilityText);
        panel.appendChild(visibilityWrap);

        if (type === LAYER_TYPE_LAYER) {
            if (!normalizeGradient(s.gradient)) {
                var colorRow = makeRow('Color:');
                var colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = getEffectiveLayerColor(layerId, getCurrentFrame());
                colorInput.style.width = '100%';
                colorInput.style.height = '28px';
                colorInput.style.padding = '0';
                colorInput.addEventListener('input', function () {
                    setLayerColorForCurrentFrame(layerId, colorInput.value);
                    updateButtonAppearance(btn, layerId);
                });
                colorInput.addEventListener('change', function () {
                    setLayerColorForCurrentFrame(layerId, colorInput.value);
                    updateButtonAppearance(btn, layerId);
                });
                colorRow.row.appendChild(colorInput);
                panel.appendChild(colorRow.row);
            }
            addEditGradientButton(panel, btn, layerId);
            var g = normalizeGradient(s.gradient);
            if (g) {
                var count = document.createElement('div');
                count.style.marginTop = '6px';
                count.style.fontSize = '10px';
                count.style.color = '#666';
                count.textContent = g.stops.length + ' gradient stop' + (g.stops.length === 1 ? '' : 's');
                panel.appendChild(count);
            }
        }

        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.textContent = 'Reset to default';
        resetBtn.style.marginTop = '12px';
        resetBtn.style.width = '100%';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.padding = '4px 0';
        resetBtn.addEventListener('click', function () {
            resetSetting(layerId);
            updateButtonAppearance(btn, layerId);
            closePopover();
        });
        panel.appendChild(resetBtn);

        document.body.appendChild(panel);
        activePopover = {
            el: panel,
            layerId: layerId,
            anchorBtn: btn,
            gradientButton: panel.querySelector('button.lrmod-edit-gradient-btn')
        };
        updateGradientEditorButtonState();
        setTimeout(function () {
            document.addEventListener('mousedown', onDocMouseDownForPopover, true);
            window.addEventListener('resize', closePopover);
        }, 0);
    }

    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && activeGradientEditor) exitGradientEditor();
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') && activePopover) {
            var before = getCurrentFrame();
            setTimeout(function () {
                try {
                    var after = getCurrentFrame();
                    if (after !== before && activePopover) refreshOpenPopover(activePopover.layerId);
                } catch (e2) {}
            }, 0);
        }
    }, true);

    function waitForGameApi() {
        return new Promise(function (resolve) {
            (function check() {
                if (window.store && window.Selectors && window.Actions && typeof window.addModMiddleware === 'function') {
                    resolve();
                } else {
                    setTimeout(check, 150);
                }
            })();
        });
    }

    function boot() {
        waitForGameApi().then(function () {
            initReduxHookIfNeeded();
            hookOnDisplayRender();
            hookTrackFileSerialization();
            try { loadSettingsFromTrackPayload({ layers: window.Selectors.getTrackLayers().map(function (l) { return l.toJSON ? l.toJSON() : l; }) }); } catch (e) {}
            scheduleUIRescan();
            scheduleRenderReconcile();
            setInterval(function () { try { scheduleUIRescan(); } catch (e) {} }, UI_SCAN_INTERVAL_MS);
            setInterval(function () { try { scheduleRenderReconcile(); } catch (e) {} }, RENDER_SCAN_INTERVAL_MS);

            try {
                var millionsEnabled = window.store.getState().renderer.millionsEnabled;
                if (!millionsEnabled) {
                    warn('WebGL "Millions" renderer is not active in this browser - layer FX visuals will not apply (UI/persistence still work). This is normal on old/unaccelerated browsers.');
                }
            } catch (e) {}

            log('ready. Layer/folder FX buttons are active; FX is stored in track files. window.LRLayerFX.disable()/.enable() available if needed.');
        });
    }

    boot();
})();