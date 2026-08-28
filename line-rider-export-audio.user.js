// ==UserScript==
// @name         Video Export With Audio
// @namespace    https://www.linerider.com/
// @author       xavi
// @description  exports video with audio offset and volume
// @version      2.3.0

// @match        https://www.linerider.com/*
// @match        https://*.official-linerider.com/*
// @match        http://localhost:*/*
// @match        https://*.surge.sh/*
// @icon         https://www.linerider.com/favicon.ico

// @downloadURL  http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-export-audio.user.js
// @updateURL    http://github.com/Xavi-LR/line-rider-mods-and-tools/raw/main/line-rider-export-audio.user.js
// @homepageURL  https://github.com/Xavi-LR/line-rider-mods-and-tools
// @run-at       document-start
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @connect      unpkg.com
// ==/UserScript==

/*
 * The relevant Line Rider code is:
 *
 *   FileReader -> dispatch(loadAudio(name, arraybuffer))
 *   LOAD_AUDIO -> AudioContext.decodeAudioData(arraybuffer)
 *
 * and the exporter is:
 *
 *   HME h264 encoder -> Blob([encodedBytes], {type:"video/mp4"})
 *   URL.createObjectURL(videoBlob)
 *   saveAs(videoBlob, title + ".mp4")
 *
 * We hook decodeAudioData BEFORE Line Rider calls it, so the audio is copied
 * while the ArrayBuffer is still valid. We hook URL.createObjectURL and the
 * FileSaver anchor click in the page context, so the exported Blob is the
 * actual Blob the exporter creates.
 */

(function () {
    "use strict";

    const PAGE_CODE = String.raw`
(() => {
    "use strict";

    const TAG = "[LR Audio Export]";
    const FFMPEG_SCRIPT =
        "https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js";
    // The page cannot fetch unpkg's ffmpeg-core.js because linerider.com's
    // service worker enforces CORS on fetch(). The outer Tampermonkey
    // sandbox fetches the two assets with GM_xmlhttpRequest and later supplies
    // same-origin blob URLs through this page-context setter.
    let FFMPEG_CORE = null;
    let ffmpegAssetsResolve;
    let ffmpegAssetsReject;
    const ffmpegAssetsPromise = new Promise((resolve, reject) => {
        ffmpegAssetsResolve = resolve;
        ffmpegAssetsReject = reject;
    });

    window.__LR_SET_FFMPEG_CORE__ = function (coreURL) {
        FFMPEG_CORE = coreURL;
        ffmpegAssetsResolve();
    };

    window.__LR_REJECT_FFMPEG_ASSETS__ = function (error) {
        ffmpegAssetsReject(error);
    };

    // ------------------------------------------------------------------
    // State captured from Line Rider.
    // ------------------------------------------------------------------

    let audioBytes = null;
    let audioName = "linerider-audio.bin";
    let audioCapturedAt = 0;

    // Every exported video Blob is associated with one mux promise.
    const videoJobs = new WeakMap();

    // Original video object URL -> original video Blob.
    const videoUrls = new Map();

    // Original video object URL -> muxed object URL.
    const muxedUrls = new Map();

    // Blob objects produced by this mod. Their object URLs must NOT be
    // treated as new Line Rider exports, or the muxed MP4 would recursively
    // trigger another mux operation.
    const muxedBlobs = new WeakSet();


    // ------------------------------------------------------------------
    // Utility
    // ------------------------------------------------------------------

    function log() {
        try {
            console.log.apply(console, [TAG].concat([].slice.call(arguments)));
        } catch (_) {}
    }

    function warn() {
        try {
            console.warn.apply(console, [TAG].concat([].slice.call(arguments)));
        } catch (_) {}
    }

    function copyArrayBuffer(ab) {
        if (!(ab instanceof ArrayBuffer)) {
            return null;
        }

        try {
            // This makes a completely independent copy. Do NOT use
            // ab.slice() here: detached buffers throw, which was the bug
            // in the previous version.
            return new Uint8Array(ab).slice().buffer;
        } catch (e) {
            warn("Could not copy ArrayBuffer:", e);
            return null;
        }
    }

    function currentAudioSettings() {
        try {
            if (
                window.store &&
                typeof window.store.getState === "function"
            ) {
                const state = window.store.getState();
                const a = state && state.audio;

                if (a) {
                    return {
                        enabled: !!a.enabled,
                        offset: Number.isFinite(Number(a.offset))
                            ? Number(a.offset)
                            : 0,
                        volume: Number.isFinite(Number(a.volume))
                            ? Math.max(0, Math.min(1, Number(a.volume)))
                            : 1,
                        name: a.name || audioName
                    };
                }
            }
        } catch (e) {
            warn("Could not read Line Rider audio settings:", e);
        }

        return {
            enabled: true,
            offset: 0,
            volume: 1,
            name: audioName
        };
    }

    function extension(name) {
        const m = /\\.([a-z0-9]{1,8})$/i.exec(name || "");
        return m ? "." + m[1].toLowerCase() : ".bin";
    }

    // ------------------------------------------------------------------
    // Capture the audio BEFORE Line Rider's decodeAudioData consumes it.
    //
    // This is the important fix.
    // ------------------------------------------------------------------

    const AudioContextCtor =
        window.AudioContext || window.webkitAudioContext;

    if (AudioContextCtor) {
        const decodeOwner = AudioContextCtor.prototype;

        if (
            decodeOwner.decodeAudioData &&
            !decodeOwner.decodeAudioData.__lrAudioExportHook
        ) {
            const originalDecode = decodeOwner.decodeAudioData;

            decodeOwner.decodeAudioData = function () {
                const args = arguments;
                const input = args[0];

                // Copy immediately, synchronously, before the real decoder
                // gets the chance to detach/consume the input buffer.
                if (input instanceof ArrayBuffer) {
                    const copied = copyArrayBuffer(input);

                    if (copied) {
                        audioBytes = copied;
                        audioCapturedAt = Date.now();

                        log(
                            "Captured audio through decodeAudioData:",
                            audioName,
                            copied.byteLength,
                            "bytes"
                        );
                    }
                }

                return originalDecode.apply(this, args);
            };

            decodeOwner.decodeAudioData.__lrAudioExportHook = true;
            decodeOwner.decodeAudioData.__lrAudioExportOriginal =
                originalDecode;

            log("Installed decodeAudioData hook.");
        }
    } else {
        warn("AudioContext is unavailable.");
    }

    // ------------------------------------------------------------------
    // Capture the filename from Redux.
    //
    // We also copy LOAD_AUDIO's ArrayBuffer here if possible. This is a
    // second safety net, and it runs BEFORE the original dispatch/middleware.
    // ------------------------------------------------------------------

    function hookStoreDispatch() {
        const store = window.store;

        if (!store || typeof store.dispatch !== "function") {
            return false;
        }

        if (store.dispatch.__lrAudioExportHook) {
            return true;
        }

        const originalDispatch = store.dispatch;

        function dispatchHook(action) {
            try {
                if (action && action.type === "LOAD_AUDIO") {
                    if (action.payload && action.payload.name) {
                        audioName = action.payload.name;
                    }

                    const ab =
                        action.payload &&
                        action.payload.arraybuffer;

                    if (ab instanceof ArrayBuffer) {
                        const copied = copyArrayBuffer(ab);

                        if (copied) {
                            audioBytes = copied;
                            audioCapturedAt = Date.now();

                            log(
                                "Captured LOAD_AUDIO buffer:",
                                audioName,
                                copied.byteLength,
                                "bytes"
                            );
                        }
                    }
                }

                if (action && action.type === "REMOVE_AUDIO") {
                    audioBytes = null;
                    audioCapturedAt = 0;
                    log("Audio removed.");
                }
            } catch (e) {
                warn("Error inspecting Redux action:", e);
            }

            return originalDispatch.apply(this, arguments);
        }

        dispatchHook.__lrAudioExportHook = true;
        dispatchHook.__lrAudioExportOriginal = originalDispatch;
        store.dispatch = dispatchHook;

        log("Installed Line Rider store.dispatch hook.");
        return true;
    }

    const storeTimer = setInterval(() => {
        if (hookStoreDispatch()) {
            clearInterval(storeTimer);
        }
    }, 50);

    // ------------------------------------------------------------------
    // Load ffmpeg.wasm into PAGE context.
    // The outer Tampermonkey sandbox rewrites the core's WASM filename to a
    // blob URL before injecting the core, so no cross-origin WASM fetch is
    // needed here.
    // ------------------------------------------------------------------

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(
                'script[data-lr-audio-export="' + src + '"]'
            );

            if (existing) {
                if (window.FFmpeg) {
                    resolve();
                    return;
                }

                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener(
                    "error",
                    () => reject(new Error("Could not load " + src)),
                    { once: true }
                );
                return;
            }

            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.dataset.lrAudioExport = src;

            s.onload = () => resolve();
            s.onerror = () =>
                reject(new Error("Could not load " + src));

            (document.head || document.documentElement).appendChild(s);
        });
    }

    async function getFFmpeg() {
        await ffmpegAssetsPromise;
        await loadScript(FFMPEG_SCRIPT);

        if (
            !window.FFmpeg ||
            typeof window.FFmpeg.createFFmpeg !== "function"
        ) {
            throw new Error(
                "ffmpeg.wasm library did not initialize."
            );
        }

        // Create a fresh FFmpeg worker for each mux. Some ffmpeg.wasm builds
        // can terminate their worker after a successful run, and reusing the
        // dead instance leads to the observed ExitStatus 0 on the next export.
        const ffmpeg = window.FFmpeg.createFFmpeg({
            log: false,
            mainName: "main",
            corePath: FFMPEG_CORE
        });

        await ffmpeg.load();
        return ffmpeg;
    }

    // ------------------------------------------------------------------
    // MP4 duration parser.
    //
    // The exporter creates a normal ISO-BMFF MP4. Reading mvhd lets us keep
    // the original video duration without re-encoding the video.
    // ------------------------------------------------------------------

    function u32(view, p) {
        return view.getUint32(p, false);
    }

    function u64(view, p) {
        const hi = view.getUint32(p, false);
        const lo = view.getUint32(p + 4, false);
        return hi * 4294967296 + lo;
    }

    function fourcc(view, p) {
        return String.fromCharCode(
            view.getUint8(p),
            view.getUint8(p + 1),
            view.getUint8(p + 2),
            view.getUint8(p + 3)
        );
    }

    function findMvhd(view, start, end) {
        let p = start;

        while (p + 8 <= end) {
            let size = u32(view, p);
            const type = fourcc(view, p + 4);
            let header = 8;

            if (size === 1) {
                if (p + 16 > end) {
                    return null;
                }

                size = u64(view, p + 8);
                header = 16;
            } else if (size === 0) {
                size = end - p;
            }

            if (size < header || p + size > end) {
                return null;
            }

            const payload = p + header;

            if (type === "moov") {
                const result = findMvhd(
                    view,
                    payload,
                    p + size
                );

                if (result !== null) {
                    return result;
                }
            } else if (type === "mvhd") {
                return payload;
            }

            p += size;
        }

        return null;
    }

    async function mp4Duration(blob) {
        const ab = await blob.arrayBuffer();
        const view = new DataView(ab);
        const mvhd = findMvhd(view, 0, view.byteLength);

        if (mvhd === null) {
            throw new Error("Could not locate MP4 mvhd box.");
        }

        const version = view.getUint8(mvhd);

        if (version === 0) {
            const timescale = u32(view, mvhd + 12);
            const duration = u32(view, mvhd + 16);

            if (!timescale) {
                throw new Error("Invalid MP4 timescale.");
            }

            return duration / timescale;
        }

        if (version === 1) {
            const timescale = u32(view, mvhd + 20);
            const duration = u64(view, mvhd + 24);

            if (!timescale) {
                throw new Error("Invalid MP4 timescale.");
            }

            return duration / timescale;
        }

        throw new Error("Unsupported MP4 mvhd version.");
    }

    // ------------------------------------------------------------------
    // Muxing.
    //
    // Line Rider's audio player does:
    //
    //   e += initialOffset
    //   source.start(..., e)
    //
    // Therefore:
    //
    //   offset < 0  => delay audio by -offset
    //   offset > 0  => skip offset seconds from the beginning of the audio
    //
    // This is NOT equivalent to simply applying -itsoffset for both signs.
    // ------------------------------------------------------------------

    async function mux(videoBlob) {
        if (!(videoBlob instanceof Blob)) {
            throw new Error("Video exporter did not produce a Blob.");
        }

        if (!audioBytes || !audioBytes.byteLength) {
            throw new Error(
                "No Line Rider audio was captured. Load the audio again, then export."
            );
        }

        const settings = currentAudioSettings();

        if (settings.enabled === false) {
            throw new Error(
                "Line Rider audio is currently disabled."
            );
        }

        const duration = await mp4Duration(videoBlob);
        const ffmpeg = await getFFmpeg();

        const videoFile = "lr_export_video.mp4";
        const audioFile =
            "lr_export_audio" + extension(audioName);
        const outputFile = "lr_export_muxed.mp4";

        try {
            ffmpeg.FS(
                "writeFile",
                videoFile,
                new Uint8Array(await videoBlob.arrayBuffer())
            );

            ffmpeg.FS(
                "writeFile",
                audioFile,
                new Uint8Array(audioBytes)
            );

            const args = [
                "-y",
                "-i",
                videoFile
            ];

            const offset = Number(settings.offset) || 0;

            if (offset < 0) {
                // Audio begins later.
                args.push(
                    "-itsoffset",
                    String(-offset),
                    "-i",
                    audioFile
                );
            } else if (offset > 0) {
                // Audio is already part-way through when Line Rider's
                // playback starts, so skip that much of the source.
                args.push(
                    "-ss",
                    String(offset),
                    "-i",
                    audioFile
                );
            } else {
                args.push("-i", audioFile);
            }

            args.push(
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "copy",
                "-c:a",
                "aac"
            );

            const volume = Number(settings.volume);

            if (Number.isFinite(volume) && volume !== 1) {
                args.push(
                    "-af",
                    "volume=" + Math.max(0, Math.min(1, volume))
                );
            }

            args.push(
                "-t",
                String(Math.max(0.001, duration)),
                "-movflags",
                "+faststart",
                outputFile
            );

            log("Muxing exported video with Line Rider audio.", {
                duration,
                audioOffset: offset,
                audioVolume: settings.volume,
                audioName
            });

            await ffmpeg.run.apply(ffmpeg, args);

            const data = ffmpeg.FS("readFile", outputFile);

            // Uint8Array.buffer can be larger than the actual view in some
            // environments. Make an exact Blob from the returned bytes.
            return new Blob(
                [new Uint8Array(data)],
                { type: "video/mp4" }
            );
        } finally {
            for (const name of [
                videoFile,
                audioFile,
                outputFile
            ]) {
                try {
                    ffmpeg.FS("unlink", name);
                } catch (_) {}
            }
        }
    }

    function ensureVideoJob(blob, url) {
        let job = videoJobs.get(blob);

        if (!job) {
            job = {
                url,
                startedAt: Date.now(),
                promise: mux(blob)
                    .then((muxedBlob) => {
                        // Mark the output before creating its object URL.
                        // URL.createObjectURL is hooked below, so without this
                        // guard our own muxed MP4 would be mistaken for a new
                        // Line Rider export and muxed again recursively.
                        muxedBlobs.add(muxedBlob);

                        const muxedUrl =
                            URL.createObjectURL(muxedBlob);

                        muxedUrls.set(url, muxedUrl);

                        // Replace Line Rider's post-render preview.
                        for (const video of document.querySelectorAll("video")) {
                            try {
                                if (video.src === url) {
                                    const t = video.currentTime;
                                    video.src = muxedUrl;
                                    video.load();

                                    try {
                                        video.currentTime = t;
                                    } catch (_) {}
                                }
                            } catch (_) {}
                        }

                        log("Mux complete:", muxedUrl);
                        return {
                            blob: muxedBlob,
                            url: muxedUrl
                        };
                    })
                    .catch((e) => {
                        warn("Mux failed:", e);
                        throw e;
                    })
            };

            videoJobs.set(blob, job);
        }

        return job;
    }

    // ------------------------------------------------------------------
    // Hook URL.createObjectURL.
    //
    // The exporter does this immediately after i.finalize():
    //
    //   const s = new Blob([...], {type:"video/mp4"});
    //   this.onSave = (() => this.props.onSave(s));
    //   this.setState({..., videoUrl: URL.createObjectURL(s)})
    //
    // Starting the mux here gives it the entire time that the user spends
    // looking at the preview before pressing Save.
    // ------------------------------------------------------------------

    const originalCreateObjectURL =
        URL.createObjectURL.bind(URL);

    if (!URL.createObjectURL.__lrAudioExportHook) {
        URL.createObjectURL = function (object) {
            const url = originalCreateObjectURL(object);

            try {
                if (
                    object instanceof Blob &&
                    object.type === "video/mp4" &&
                    !muxedBlobs.has(object) &&
                    audioBytes &&
                    audioBytes.byteLength
                ) {
                    videoUrls.set(url, object);
                    ensureVideoJob(object, url);
                }
            } catch (e) {
                warn("Could not inspect object URL:", e);
            }

            return url;
        };

        URL.createObjectURL.__lrAudioExportHook = true;
        URL.createObjectURL.__lrAudioExportOriginal =
            originalCreateObjectURL;

        log("Installed URL.createObjectURL hook.");
    }

    // ------------------------------------------------------------------
    // FileSaver hook.
    //
    // Line Rider's bundled FileSaver implementation eventually does:
    //
    //   n.href = f
    //   n.download = c
    //   e.dispatchEvent(new MouseEvent("click"))
    //
    // Intercept that exact synthetic click and wait for our mux.
    // ------------------------------------------------------------------

    const originalDispatchEvent =
        HTMLAnchorElement.prototype.dispatchEvent;

    if (!HTMLAnchorElement.prototype.dispatchEvent.__lrAudioExportHook) {
        HTMLAnchorElement.prototype.dispatchEvent = function (event) {
            try {
                if (
                    event &&
                    event.type === "click" &&
                    this.href &&
                    videoUrls.has(this.href) &&
                    !event.__lrAudioExportReplay
                ) {
                    const originalUrl = this.href;
                    const videoBlob = videoUrls.get(originalUrl);
                    const job = videoJobs.get(videoBlob);

                    if (job) {
                        event.preventDefault();

                        const anchor = this;

                        log("Save requested; waiting for audio mux...");

                        job.promise
                            .then((result) => {
                                // Use the same anchor so FileSaver's
                                // download name is retained.
                                anchor.href = result.url;

                                const replay = new MouseEvent(
                                    "click",
                                    {
                                        bubbles: true,
                                        cancelable: true,
                                        view: window
                                    }
                                );

                                Object.defineProperty(
                                    replay,
                                    "__lrAudioExportReplay",
                                    { value: true }
                                );

                                originalDispatchEvent.call(
                                    anchor,
                                    replay
                                );

                                log("Downloaded muxed MP4.");
                            })
                            .catch((error) => {
                                // If muxing fails, don't break Line Rider's
                                // normal export. Fall back to the original
                                // video-only file.
                                warn(
                                    "Audio mux failed; downloading original video instead.",
                                    error
                                );

                                const replay = new MouseEvent(
                                    "click",
                                    {
                                        bubbles: true,
                                        cancelable: true,
                                        view: window
                                    }
                                );

                                Object.defineProperty(
                                    replay,
                                    "__lrAudioExportReplay",
                                    { value: true }
                                );

                                originalDispatchEvent.call(
                                    anchor,
                                    replay
                                );
                            });

                        return true;
                    }
                }
            } catch (e) {
                warn("Save hook error:", e);
            }

            return originalDispatchEvent.call(this, event);
        };

        HTMLAnchorElement.prototype.dispatchEvent.__lrAudioExportHook =
            true;

        HTMLAnchorElement.prototype.dispatchEvent.__lrAudioExportOriginal =
            originalDispatchEvent;

        log("Installed FileSaver click hook.");
    }

    // ------------------------------------------------------------------
    // Also support a direct anchor.click() path, although the current
    // Line Rider FileSaver uses dispatchEvent().
    // ------------------------------------------------------------------

    const originalAnchorClick =
        HTMLAnchorElement.prototype.click;

    if (!HTMLAnchorElement.prototype.click.__lrAudioExportHook) {
        HTMLAnchorElement.prototype.click = function () {
            try {
                if (
                    this.href &&
                    videoUrls.has(this.href) &&
                    !this.__lrAudioExportReplay
                ) {
                    const videoBlob = videoUrls.get(this.href);
                    const job = videoJobs.get(videoBlob);

                    if (job) {
                        const anchor = this;

                        job.promise.then((result) => {
                            anchor.href = result.url;
                            anchor.__lrAudioExportReplay = true;
                            originalAnchorClick.call(anchor);
                        });

                        return;
                    }
                }
            } catch (e) {
                warn("anchor.click hook error:", e);
            }

            return originalAnchorClick.call(this);
        };

        HTMLAnchorElement.prototype.click.__lrAudioExportHook = true;
    }

    log("Installed successfully.");
})();
`;

    const CORE_URL =
        "https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js";
    const WASM_URL =
        "https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.wasm";

    function gmGetArrayBuffer(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: "arraybuffer",
                onload: (response) => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(
                            new Error(
                                "HTTP " + response.status + " while fetching " + url
                            )
                        );
                        return;
                    }

                    if (!(response.response instanceof ArrayBuffer)) {
                        reject(
                            new Error(
                                "Expected ArrayBuffer from " + url +
                                ", got " + typeof response.response
                            )
                        );
                        return;
                    }

                    resolve(response.response);
                },
                onerror: () =>
                    reject(new Error("Network error while fetching " + url)),
                ontimeout: () =>
                    reject(new Error("Timeout while fetching " + url))
            });
        });
    }

    function gmGetText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                responseType: "text",
                onload: (response) => {
                    if (response.status < 200 || response.status >= 300) {
                        reject(
                            new Error(
                                "HTTP " + response.status + " while fetching " + url
                            )
                        );
                        return;
                    }
                    resolve(String(response.responseText || response.response || ""));
                },
                onerror: () =>
                    reject(new Error("Network error while fetching " + url)),
                ontimeout: () =>
                    reject(new Error("Timeout while fetching " + url))
            });
        });
    }

    function makeBlobURL(data, type) {
        return URL.createObjectURL(new Blob([data], { type }));
    }

    try {
        // Install the audio/export hooks immediately, before Line Rider has a
        // chance to decode or detach the uploaded audio ArrayBuffer.
        GM_addElement("script", {
            textContent: PAGE_CODE
        });
    } catch (e) {
        console.error("[LR Audio Export] Could not inject page hook:", e);
    }

    (async () => {
        try {
            // Fetch both assets outside the page's fetch/service-worker path.
            // The critical detail is that ffmpeg-core.wasm must be actual
            // WebAssembly bytes. We therefore fetch it as an ArrayBuffer,
            // verify its WASM magic bytes, then rewrite the core JavaScript so
            // its normal ffmpeg-core.wasm lookup points directly at that blob.
            // This avoids relying on a page-context fetch/XHR for the WASM.
            const [coreText, wasmBuffer] = await Promise.all([
                gmGetText(CORE_URL),
                gmGetArrayBuffer(WASM_URL)
            ]);

            const wasmBytes = new Uint8Array(wasmBuffer);
            if (
                wasmBytes.length < 4 ||
                wasmBytes[0] !== 0x00 ||
                wasmBytes[1] !== 0x61 ||
                wasmBytes[2] !== 0x73 ||
                wasmBytes[3] !== 0x6d
            ) {
                const preview = Array.from(wasmBytes.slice(0, 16))
                    .map((x) => x.toString(16).padStart(2, "0"))
                    .join(" ");
                throw new Error(
                    "Downloaded ffmpeg-core.wasm is not WebAssembly; first bytes: " +
                    preview
                );
            }

            const wasmBlobURL = makeBlobURL(wasmBuffer, "application/wasm");

            // Emscripten's core contains the literal filename
            // "ffmpeg-core.wasm". Replace that filename with the verified
            // same-origin blob URL. This is more reliable than intercepting
            // fetch(), because the core can use its own loading primitive.
            const rewrittenCoreText = coreText.replace(
                /ffmpeg-core\.wasm/g,
                wasmBlobURL
            );

            if (rewrittenCoreText === coreText) {
                throw new Error(
                    "Could not find ffmpeg-core.wasm reference inside ffmpeg-core.js."
                );
            }

            const coreBlobURL = makeBlobURL(
                rewrittenCoreText,
                "text/javascript"
            );

            GM_addElement("script", {
                textContent:
                    "window.__LR_SET_FFMPEG_CORE__(" +
                    JSON.stringify(coreBlobURL) +
                    ");"
            });

            console.log(
                "[LR Audio Export] Supplied verified CORS-safe ffmpeg core + WASM assets."
            );
        } catch (e) {
            try {
                GM_addElement("script", {
                    textContent:
                        "window.__LR_REJECT_FFMPEG_ASSETS__(" +
                        JSON.stringify(String(e && e.message ? e.message : e)) +
                        ");"
                });
            } catch (_) {}

            console.error(
                "[LR Audio Export] Could not prepare ffmpeg.wasm assets:",
                e
            );
        }
    })();
})();
