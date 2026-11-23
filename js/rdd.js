/*
    rdd - https://github.com/ActualMasterOogway/rdd

    Copyright (C) 2024-2026 Latte Softworks <latte.to> | MIT License
*/

const basePath = window.location.href.split("?")[0];
const usageMsg = `[*] USAGE: ${basePath}?channel=<CHANNEL_NAME>&binaryType=<BINARY_TYPE>&arch=<ARCH>&version=<VERSION_HASH>

    Binary Types:
    * WindowsPlayer
    * WindowsStudio64
    * MacPlayer
    * MacStudio
    * WebClientApp

    Extra Notes:
    * If \`channel\` isn't provided, it will default to "LIVE" (the production channel)
`;

const hostPath = "https://setup-aws.rbxcdn.com"; // Only the AWS mirror has proper CORS cfg

// Root extract locations for the Win manifests
const extractRoots = {
    player: {
        "RobloxApp.zip": "",
        "redist.zip": "",
        "shaders.zip": "shaders/",
        "ssl.zip": "ssl/",

        "WebView2.zip": "",
        "WebView2RuntimeInstaller.zip": "WebView2RuntimeInstaller/",

        "content-avatar.zip": "content/avatar/",
        "content-configs.zip": "content/configs/",
        "content-fonts.zip": "content/fonts/",
        "content-sky.zip": "content/sky/",
        "content-sounds.zip": "content/sounds/",
        "content-textures2.zip": "content/textures/",
        "content-models.zip": "content/models/",

        "content-platform-fonts.zip": "PlatformContent/pc/fonts/",
        "content-platform-dictionaries.zip": "PlatformContent/pc/shared_compression_dictionaries/",
        "content-terrain.zip": "PlatformContent/pc/terrain/",
        "content-textures3.zip": "PlatformContent/pc/textures/",

        "extracontent-luapackages.zip": "ExtraContent/LuaPackages/",
        "extracontent-translations.zip": "ExtraContent/translations/",
        "extracontent-models.zip": "ExtraContent/models/",
        "extracontent-textures.zip": "ExtraContent/textures/",
        "extracontent-places.zip": "ExtraContent/places/"
    },

    studio: {
        "RobloxStudio.zip": "",
        "RibbonConfig.zip": "RibbonConfig/",
        "redist.zip": "",
        "Libraries.zip": "",
        "LibrariesQt5.zip": "",

        "WebView2.zip": "",
        "WebView2RuntimeInstaller.zip": "",

        "shaders.zip": "shaders/",
        "ssl.zip": "ssl/",

        "Qml.zip": "Qml/",
        "Plugins.zip": "Plugins/",
        "StudioFonts.zip": "StudioFonts/",
        "BuiltInPlugins.zip": "BuiltInPlugins/",
        "ApplicationConfig.zip": "ApplicationConfig/",
        "BuiltInStandalonePlugins.zip": "BuiltInStandalonePlugins/",

        "content-qt_translations.zip": "content/qt_translations/",
        "content-sky.zip": "content/sky/",
        "content-fonts.zip": "content/fonts/",
        "content-avatar.zip": "content/avatar/",
        "content-models.zip": "content/models/",
        "content-sounds.zip": "content/sounds/",
        "content-configs.zip": "content/configs/",
        "content-api-docs.zip": "content/api_docs/",
        "content-textures2.zip": "content/textures/",
        "content-studio_svg_textures.zip": "content/studio_svg_textures/",

        "content-platform-fonts.zip": "PlatformContent/pc/fonts/",
        "content-platform-dictionaries.zip": "PlatformContent/pc/shared_compression_dictionaries/",
        "content-terrain.zip": "PlatformContent/pc/terrain/",
        "content-textures3.zip": "PlatformContent/pc/textures/",

        "extracontent-translations.zip": "ExtraContent/translations/",
        "extracontent-luapackages.zip": "ExtraContent/LuaPackages/",
        "extracontent-textures.zip": "ExtraContent/textures/",
        "extracontent-scripts.zip": "ExtraContent/scripts/",
        "extracontent-models.zip": "ExtraContent/models/",

        "studiocontent-models.zip": "StudioContent/models/",
        "studiocontent-textures.zip": "StudioContent/textures/"
    }
};

const binaryTypes = {
    WindowsPlayer: {
        blobDirs: {
            "x86-64": "/"
        }
    },
    WindowsStudio64: {
        blobDirs: {
            "x86-64": "/"
        }
    },
    MacPlayer: {
        defaultArch: "arm64",
        blobDirs: {
            "arm64": "/mac/arm64/",
            "x86-64": "/mac/"
        }
    },
    MacStudio: {
        defaultArch: "arm64",
        blobDirs: {
            "arm64": "/mac/arm64/",
            "x86-64": "/mac/"
        }
    },
    WebClientApp: {
        blobDirs: {
            "wasm32": "/webclient/"
        }
    }
};

// Engine files not listed in WebClient.metadata.json
const webClientEngineFiles = [
    "WasmPlayer.js",
    "WebClient.js",
    "WebClient.wasm",
    "audio-processor-fast.js"
];

const urlParams = new URLSearchParams(window.location.search);

const consoleText = document.getElementById("consoleText");
const downloadForm = document.getElementById("downloadForm");
const downloadFormDiv = document.getElementById("downloadFormDiv");
const archSelect = document.getElementById("arch");
const binaryTypeSelect = document.getElementById("binaryType");
const versionInput = document.getElementById("version");

const progressContainer = document.getElementById("progressContainer");
const progressStatus = document.getElementById("progressStatus");
const progressBar = document.getElementById("progressBar");
const progressDetails = document.getElementById("progressDetails");

// Rolling speed & progress estimator (prevents wild ETA jumps)
class RollingEstimator {
    constructor() {
        this.startTime = Date.now();
        this.samples = [];
    }

    update(value) {
        const now = Date.now();
        this.samples.push({ time: now, value });
        while (this.samples.length > 2 && (now - this.samples[0].time) > 3500) {
            this.samples.shift();
        }
    }

    getStats() {
        const now = Date.now();
        const elapsed = (now - this.startTime) / 1000;
        if (this.samples.length < 2) {
            return { elapsed, speed: 0 };
        }
        const oldest = this.samples[0];
        const newest = this.samples[this.samples.length - 1];
        const dt = (newest.time - oldest.time) / 1000;
        const dv = newest.value - oldest.value;

        let speed = 0;
        if (dt > 0.1 && dv >= 0) {
            speed = dv / dt;
        } else {
            speed = newest.value / Math.max(0.5, elapsed);
        }
        return { elapsed, speed };
    }
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + " " + sizes[i];
}

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function shortenPath(path, maxLen = 32) {
    if (!path) return "";
    if (path.length <= maxLen) return path;
    return "..." + path.slice(-(maxLen - 3));
}

function showProgress(status = "In progress...") {
    if (progressContainer) {
        progressContainer.hidden = false;
        if (progressStatus) progressStatus.textContent = status;
        if (progressBar) progressBar.value = 0;
        if (progressDetails) progressDetails.textContent = "";
    }
}

function updateProgress(percent, status = null, details = null) {
    if (progressContainer) {
        progressContainer.hidden = false;
        const clamped = Math.min(100, Math.max(0, percent));
        if (progressBar) progressBar.value = clamped;
        if (status && progressStatus) progressStatus.textContent = status;
        if (details && progressDetails) progressDetails.textContent = details;
    }
}

function hideProgress() {
    if (progressContainer) {
        progressContainer.hidden = true;
    }
}

// Concurrency pool helper
async function mapConcurrent(items, concurrency, fn) {
    let index = 0;
    const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
        while (index < items.length) {
            const currentIndex = index++;
            await fn(items[currentIndex], currentIndex);
        }
    });
    await Promise.all(workers);
}

// Smart-paste for version field (auto-extracts hashes and removes quotes)
if (versionInput) {
    const sanitizeVersion = function() {
        const val = versionInput.value.trim();
        const match = val.match(/version-[a-f0-9]{16}/i) || val.match(/version-[a-f0-9]+/i);
        if (match) {
            versionInput.value = match[0].toLowerCase();
        } else if (val.startsWith('"') && val.endsWith('"')) {
            versionInput.value = val.slice(1, -1).trim();
        }
    };
    versionInput.addEventListener("input", sanitizeVersion);
    versionInput.addEventListener("paste", () => setTimeout(sanitizeVersion, 10));
}

function populateArchSelect(binaryTypeName) {
    archSelect.innerHTML = "";
    const binaryTypeObject = binaryTypes[binaryTypeName];
    if (!binaryTypeObject) {
        return;
    }

    const archs = Object.keys(binaryTypeObject.blobDirs);
    for (const archName of archs) {
        const option = document.createElement("option");
        option.value = archName;
        option.text = archName;
        archSelect.appendChild(option);
    }

    if (binaryTypeObject.defaultArch) {
        archSelect.value = binaryTypeObject.defaultArch;
    }

    const archRow = document.getElementById("archRow");
    if (archRow) {
        archRow.hidden = archs.length <= 1;
    }
}

binaryTypeSelect.addEventListener("change", function() {
    populateArchSelect(binaryTypeSelect.value);
});

downloadForm.compressZip.addEventListener("change", function() {
    downloadForm.compressionLevel.disabled = !downloadForm.compressZip.checked;
});
downloadForm.compressionLevel.disabled = !downloadForm.compressZip.checked;

populateArchSelect(binaryTypeSelect.value);

function getPermLink() {
    const channelName = downloadForm.channel.value.trim() || downloadForm.channel.placeholder;
    let queryString = `?channel=${encodeURIComponent(channelName)}&binaryType=${encodeURIComponent(downloadForm.binaryType.value)}`;

    const binaryTypeObj = binaryTypes[downloadForm.binaryType.value];
    const defaultArch = binaryTypeObj.defaultArch || Object.keys(binaryTypeObj.blobDirs)[0];
    if (archSelect.value !== defaultArch) {
        queryString += `&arch=${encodeURIComponent(archSelect.value)}`;
    }

    const versionHash = downloadForm.version.value.trim();
    if (versionHash !== "") {
        queryString += `&version=${encodeURIComponent(versionHash)}`;
    }

    const compressZip = downloadForm.compressZip.checked;
    const compressionLevel = downloadForm.compressionLevel.value;
    if (compressZip === true) {
        queryString += `&compressZip=true&compressionLevel=${compressionLevel}`;
    }

    return basePath + queryString;
}

function downloadFromForm() {
    window.open(getPermLink(), "_self");
}

function copyPermLink() {
    const link = getPermLink();
    navigator.clipboard.writeText(link).then(() => {
        log(`[+] Copied permanent link to clipboard: ${link}`);
    }).catch(() => {
        log(`[*] Permanent link: ${link}`);
    });
}

function scrollToBottom() {
    window.scrollTo({
        top: document.body.scrollHeight
    });
}

function escHtml(originalText) {
    return originalText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/ /g, "&nbsp;")
        .replace(/\n/g, "<br>");
}

function log(msg = "", end = "\n", autoScroll = true) {
    consoleText.append(msg + end);
    if (autoScroll) {
        scrollToBottom();
    }
}

// Prompt download
function downloadBinaryFile(fileName, data, mimeType = "application/zip") {
    const blob = new Blob([data], { type: mimeType });

    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;

    let button = document.createElement("button");
    button.innerText = `${fileName}`;
    link.appendChild(button);

    document.body.appendChild(link);
    scrollToBottom();

    button.click();
}

function exportAndDownloadZip(outputFileName) {
    log();
    if (compressZip) {
        log(`[!] NOTE: Compressing final zip (compression level ${compressionLevel}/9), this may take a while..`);
    }

    log(`[+] Exporting assembled zip file "${outputFileName}"..`);
    showProgress(compressZip ? "Compressing & packaging ZIP..." : "Packaging ZIP (STORE)...");

    const estimator = new RollingEstimator();
    let currentPercent = 0;
    let currentFile = "";
    let isPackaging = true;
    const totalFiles = Object.keys(zip.files).length;

    // Background UI updater to keep elapsed time & ETA ticking smoothly
    const ticker = setInterval(() => {
        if (!isPackaging) return;
        const stats = estimator.getStats();

        if (currentPercent >= 100) {
            updateProgress(
                100,
                "Finalizing ZIP archive...",
                `Compiling final archive buffer... (Elapsed: ${formatTime(stats.elapsed)})`
            );
            return;
        }

        let etaStr = "--:--";
        if (stats.speed > 0 && currentPercent > 0) {
            const remainingPercent = Math.max(0, 100 - currentPercent);
            etaStr = formatTime(remainingPercent / stats.speed);
        } else if (currentPercent > 0 && stats.elapsed > 0) {
            const avgRate = currentPercent / stats.elapsed;
            etaStr = formatTime((100 - currentPercent) / avgRate);
        }

        const estFilesPacked = Math.min(totalFiles, Math.floor((currentPercent / 100) * totalFiles));
        const fileTag = currentFile ? ` [${shortenPath(currentFile)}]` : "";

        updateProgress(
            currentPercent,
            `Packaging ZIP (${currentPercent.toFixed(0)}%)`,
            `${currentPercent.toFixed(1)}% | ${estFilesPacked}/${totalFiles} files | Elapsed: ${formatTime(stats.elapsed)} | ETA: ${etaStr}${fileTag}`
        );
    }, 150);

    zip.generateAsync({
        type: "arraybuffer",
        compression: compressZip ? "DEFLATE" : "STORE",
        compressionOptions: {
            level: compressionLevel
        }
    }, function onUpdate(metadata) {
        currentPercent = metadata.percent;
        currentFile = metadata.currentFile || "";
        estimator.update(currentPercent);
    }).then(function(outputZipData) {
        isPackaging = false;
        clearInterval(ticker);
        zip = null;

        log(`[+] Packaging done! (${formatBytes(outputZipData.byteLength)})`);
        updateProgress(100, "Complete!", `Saved ${outputFileName} (${formatBytes(outputZipData.byteLength)})`);
        downloadBinaryFile(outputFileName, outputZipData);
    }).catch(function(err) {
        isPackaging = false;
        clearInterval(ticker);
        hideProgress();
        log(`[!] Failed to generate zip archive: ${err}`);
    });
}

function requestBinary(url, callback, errorCallback, progressCallback) {
    const httpRequest = new XMLHttpRequest();

    httpRequest.open("GET", url, true);
    httpRequest.responseType = "arraybuffer";

    if (progressCallback) {
        httpRequest.onprogress = function(event) {
            progressCallback(event.loaded, event.total, event.lengthComputable);
        };
    }

    httpRequest.onload = function() {
        const statusCode = httpRequest.status;
        if (statusCode !== 200) {
            log(`[!] Binary request error (${statusCode}) @ ${url}`);
            if (errorCallback) errorCallback(new Error(`HTTP ${statusCode}`));
            return;
        }

        const arrayBuffer = httpRequest.response;
        if (!arrayBuffer) {
            log(`[!] Binary request error (${statusCode}) @ ${url} - Failed to get binary ArrayBuffer from response`);
            if (errorCallback) errorCallback(new Error("Empty ArrayBuffer"));
            return;
        }

        callback(arrayBuffer, statusCode);
    };

    httpRequest.onerror = function(e) {
        log(`[!] Binary request error @ ${url} - ${e}`);
        if (errorCallback) errorCallback(e);
    };

    httpRequest.send();
}

function getQuery(queryString) {
    if (!urlParams.has(queryString)) {
        return null;
    }
    return urlParams.get(queryString) || null;
}

let channel = getQuery("channel");
let version = getQuery("version") || getQuery("guid");
let binaryType = getQuery("binaryType");
let blobDir = getQuery("blobDir");
let arch = getQuery("arch");

let compressZip = getQuery("compressZip");
let compressionLevel = getQuery("compressionLevel");

let channelPath;
let versionPath;

let binExtractRoots;
let zip;

main();

function main() {
    if (window.location.search === "") {
        downloadFormDiv.hidden = false;
        log(usageMsg, "\n", false);
        return;
    }

    // Query params
    if (channel !== null) {
        if (channel !== "LIVE") {
            channel = channel.toLowerCase();
        }
    } else {
        channel = "LIVE";
    }

    if (channel === "LIVE") {
        channelPath = `${hostPath}`;
    } else {
        channelPath = `${hostPath}/channel/${channel}`;
    }

    if (version !== null) {
        version = version.toLowerCase().replace(/['"]/g, "").trim();
        const match = version.match(/version-[a-f0-9]+/i);
        if (match) {
            version = match[0];
        } else if (!version.startsWith("version-")) {
            version = "version-" + version;
        }
    }

    if (version && !binaryType) {
        log("[!] Error: If you provide a specific `version`, you need to set the `binaryType` aswell! See the usage doc below for examples of various `binaryType` inputs:", "\n\n");
        log(usageMsg, "\n", false);
        return;
    }

    if (blobDir !== null && blobDir !== "") {
        if (blobDir.slice(0) !== "/") {
            blobDir = "/" + blobDir;
        }
        if (blobDir.slice(-1) !== "/") {
            blobDir += "/";
        }
    }

    if (compressZip !== null) {
        if (compressZip !== "true" && compressZip !== "false") {
            log(`[!] Error: The \`compressZip\` query must be "true" or "false", got "${compressZip}"`);
        }
        compressZip = (compressZip === "true");
    } else {
        compressZip = downloadForm.compressZip.checked;
    }

    if (compressionLevel !== null) {
        try {
            compressionLevel = parseInt(compressionLevel);
        } catch (err) {
            log(`[!] Error: Failed to parse \`compressionLevel\` query: ${err}`, "\n\n");
            log(usageMsg, "\n", false);
            return;
        }

        if (compressionLevel > 9 || compressionLevel < 1) {
            log(`[!] Error: The \`compressionLevel\` query must be a value between 1 and 9, got ${compressionLevel}`, "\n\n");
            log(usageMsg, "\n", false);
            return;
        }
    } else {
        compressionLevel = downloadForm.compressionLevel.value;
    }

    if (!binaryType) {
        log("[!] Error: Missing required `binaryType` query, are you using an old perm link for a specific version?", "\n\n");
        log(usageMsg, "\n", false);
        return;
    }

    if (binaryType in binaryTypes) {
        const binaryTypeObject = binaryTypes[binaryType];

        if (!arch) {
            arch = binaryTypeObject.defaultArch || Object.keys(binaryTypeObject.blobDirs)[0];
        }

        if (!blobDir) {
            blobDir = binaryTypeObject.blobDirs[arch];
        }
    } else {
        log(`[!] Error: \`binaryType\` "${binaryType}" not supported. See below for supported \`binaryType\` inputs:`, "\n\n");
        log(usageMsg);
        return;
    }

    if (version) {
        fetchManifest();
    } else {
        const binaryTypeEncoded = escHtml(binaryType);
        const channelNameEncoded = escHtml(channel);

        const clientSettingsUrl = `https://clientsettings.roblox.com/v2/client-version/${binaryTypeEncoded}/channel/${channelNameEncoded}`;
        log("Copy the version hash (the area with \"version-xxxxxxxxxxxxxxxx\" in double-quotes) from the page in the link below (we can't because of CORS), and paste it in the field named \"Version Hash\" in the form above\n");
        consoleText.innerHTML += `<a target="_blank" href="${clientSettingsUrl}">${clientSettingsUrl}</a><br><br><br>`;

        downloadForm.channel.value = channelNameEncoded;
        downloadForm.binaryType.value = binaryTypeEncoded;
        populateArchSelect(binaryType);
        archSelect.value = arch;
        downloadForm.compressZip.checked = compressZip;
        downloadForm.compressionLevel.value = compressionLevel;

        downloadFormDiv.hidden = false;
    }
}

async function fetchManifest() {
    versionPath = `${channelPath}${blobDir}${version}-`;

    if (binaryType === "MacPlayer" || binaryType === "MacStudio") {
        const zipFileName = (binaryType == "MacPlayer" && "RobloxPlayer.zip") || (binaryType == "MacStudio" && "RobloxStudioApp.zip");
        log(`[+] Fetching zip archive for BinaryType "${binaryType}" (${zipFileName})`);

        const outputFileName = `${channel}-${binaryType}-${version}.zip`;
        log(`[+] (Please wait!) Downloading ${outputFileName}..`);

        showProgress(`Downloading ${zipFileName}...`);
        const estimator = new RollingEstimator();

        requestBinary(
            versionPath + zipFileName,
            function(zipData) {
                log(`[+] Download completed! (${formatBytes(zipData.byteLength)})`);
                updateProgress(100, "Complete!", `Saved ${outputFileName} (${formatBytes(zipData.byteLength)})`);
                downloadBinaryFile(outputFileName, zipData);
            },
            function(err) {
                log(`[!] Failed to download ${zipFileName}: ${err.message || err}`);
                hideProgress();
            },
            function(loaded, total, lengthComputable) {
                estimator.update(loaded);
                const stats = estimator.getStats();

                if (lengthComputable && total > 0) {
                    const percent = (loaded / total) * 100;
                    const eta = stats.speed > 0 ? (total - loaded) / stats.speed : -1;
                    updateProgress(
                        percent,
                        `Downloading ${zipFileName}`,
                        `${percent.toFixed(1)}% | ${formatBytes(loaded)} / ${formatBytes(total)} | ${formatBytes(stats.speed)}/s | ETA: ${formatTime(eta)}`
                    );
                } else {
                    updateProgress(
                        0,
                        `Downloading ${zipFileName}`,
                        `${formatBytes(loaded)} downloaded | ${formatBytes(stats.speed)}/s | Elapsed: ${formatTime(stats.elapsed)}`
                    );
                }
            }
        );
    } else if (binaryType === "WebClientApp") {
        downloadWebClient();
    } else {
        log(`[+] Fetching rbxPkgManifest for ${version}@${channel}..`);

        let manifestBody = "";
        let resp = await fetch(versionPath + "rbxPkgManifest.txt");
        if (!resp.ok) {
            channelPath = `${hostPath}/channel/common`;
            versionPath = `${channelPath}${blobDir}${version}-`;
            resp = await fetch(versionPath + "rbxPkgManifest.txt");
        }

        if (!resp.ok) {
            log(`[!] Failed to fetch rbxPkgManifest: (status: ${resp.status}, err: ${(await resp.text()) || "<failed to get response from server>"})`);
            return;
        }

        manifestBody = await resp.text();
        downloadZipsFromManifest(manifestBody);
    }
}

async function downloadPackage(packageName, onProgress) {
    const blobUrl = versionPath + packageName;
    const blobData = await new Promise((resolve, reject) => {
        requestBinary(blobUrl, resolve, reject, onProgress);
    });

    if (packageName in binExtractRoots === false) {
        log(`[*] Package "${packageName}" not defined in extraction roots, moving directly to root.`);
        zip.file(packageName, blobData);
        return blobData.byteLength;
    }

    log(`[+] Extracting "${packageName}"..`);
    const extractRootFolder = binExtractRoots[packageName];
    const packageZip = await JSZip.loadAsync(blobData);
    const fileGetPromises = [];

    packageZip.forEach(function(path, object) {
        if (path.endsWith("\\") || path.endsWith("/")) {
            return;
        }

        const fixedPath = path.replace(/\\/g, "/");
        const fileGetPromise = object.async("arraybuffer").then(function(data) {
            zip.file(extractRootFolder + fixedPath, data);
        });

        fileGetPromises.push(fileGetPromise);
    });

    await Promise.all(fileGetPromises);
    return blobData.byteLength;
}

async function downloadZipsFromManifest(manifestBody) {
    const pkgManifestLines = manifestBody.split("\n").map(line => line.trim());

    if (pkgManifestLines[0] !== "v0") {
        log(`[!] Error: unknown rbxPkgManifest format version; expected "v0", got "${pkgManifestLines[0]}"`);
        return;
    }

    if (pkgManifestLines.includes("RobloxApp.zip")) {
        binExtractRoots = extractRoots.player;
        if (binaryType === "WindowsStudio64") {
            log(`[!] Error: BinaryType \`${binaryType}\` given, but "RobloxApp.zip" was found in the manifest!`);
            return;
        }
    } else if (pkgManifestLines.includes("RobloxStudio.zip")) {
        binExtractRoots = extractRoots.studio;
        if (binaryType === "WindowsPlayer") {
            log(`[!] Error: BinaryType \`${binaryType}\` given, but "RobloxStudio.zip" was found in the manifest!`);
            return;
        }
    } else {
        log("[!] Error: Bad/unrecognized rbxPkgManifest, aborting");
        return;
    }

    const packages = [];
    let totalExpectedBytes = 0;
    for (let i = 1; i < pkgManifestLines.length; i++) {
        if (pkgManifestLines[i].endsWith(".zip")) {
            packages.push(pkgManifestLines[i]);
            totalExpectedBytes += parseInt(pkgManifestLines[i + 2], 10) || 0;
        }
    }
    log(`[+] Found ${packages.length} packages (${formatBytes(totalExpectedBytes)}) for BinaryType \`${binaryType}\`..`);

    zip = new JSZip();

    zip.file("AppSettings.xml", `<?xml version="1.0" encoding="UTF-8"?>
<Settings>
\t<ContentFolder>content</ContentFolder>
\t<BaseUrl>http://www.roblox.com</BaseUrl>
</Settings>
`);

    showProgress("Downloading and extracting packages...");

    let completedPackages = 0;
    let totalBytesLoaded = 0;
    const activePackages = {};
    const estimator = new RollingEstimator();

    function updateDownloadStats() {
        let activeBytesSum = 0;
        for (const pkg in activePackages) {
            activeBytesSum += activePackages[pkg].loaded || 0;
        }

        const currentTotalBytes = totalBytesLoaded + activeBytesSum;
        estimator.update(currentTotalBytes);
        const stats = estimator.getStats();

        const percent = totalExpectedBytes > 0
            ? Math.min(99.9, (currentTotalBytes / totalExpectedBytes) * 100)
            : Math.min(99.9, (completedPackages / packages.length) * 100);

        const remainingBytes = Math.max(0, totalExpectedBytes - currentTotalBytes);
        const etaStr = (stats.speed > 0 && totalExpectedBytes > 0)
            ? formatTime(remainingBytes / stats.speed)
            : "--:--";

        updateProgress(
            percent,
            `Downloading & extracting (${completedPackages}/${packages.length})`,
            `${percent.toFixed(1)}% | ${completedPackages}/${packages.length} pkgs | ${formatBytes(currentTotalBytes)} / ${formatBytes(totalExpectedBytes)} | ${formatBytes(stats.speed)}/s | ETA: ${etaStr}`
        );
    }

    // Concurrency limit of 4 to avoid browser network throttling and excessive memory usage
    const concurrency = 4;
    await mapConcurrent(packages, concurrency, async (packageName) => {
        try {
            const bytes = await downloadPackage(packageName, (loaded, total, lengthComputable) => {
                activePackages[packageName] = { loaded, total: lengthComputable ? total : 0 };
                updateDownloadStats();
            });
            totalBytesLoaded += bytes;
            delete activePackages[packageName];
            completedPackages++;
            updateDownloadStats();
        } catch (err) {
            delete activePackages[packageName];
            completedPackages++;
            updateDownloadStats();
            log(`[!] Error processing package "${packageName}": ${err.message || err}`);
        }
    });

    exportAndDownloadZip(`${channel}-${binaryType}-${version}.zip`);
}

function parseFsIndex(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length || !lines[0].startsWith("rbxfsindex ")) {
        throw new Error(`Unexpected fsindex header: "${lines[0] || ""}"`);
    }

    let prev = "";
    const paths = [];
    for (let i = 1; i < lines.length; i++) {
        const [prefixLenStr, suffix] = lines[i].split("\t");
        if (suffix === undefined) continue;
        prev = prev.slice(0, Number(prefixLenStr)) + suffix;
        paths.push(prev.replace(/^\//, ""));
    }
    return paths;
}

async function downloadWebClient() {
    const webClientPath = `${versionPath}RobloxWebClient/`;

    let indexName = "WebClient.fsindex.txt";
    log(`[+] Fetching ${indexName} for ${version}..`);
    let resp = await fetch(webClientPath + indexName);
    if (!resp.ok) {
        indexName = "WebClient.metadata.json";
        log(`[*] Falling back to ${indexName}..`);
        resp = await fetch(webClientPath + indexName);
        if (!resp.ok) {
            log(`[!] Failed to fetch WebClient index: (status: ${resp.status})`);
            return;
        }
    }

    const indexBody = await resp.text();
    const indexedFiles = indexName === "WebClient.fsindex.txt"
        ? parseFsIndex(indexBody)
        : JSON.parse(indexBody).map(entry => entry.path.replace(/^\//, ""));
    const files = webClientEngineFiles.concat(indexedFiles);

    zip = new JSZip();
    zip.file(indexName, indexBody);

    log(`[+] Fetching ${files.length} files for BinaryType \`${binaryType}\`..`);
    showProgress("Downloading WebClient files...");

    let filesDone = 0;
    let totalBytesLoaded = 0;
    const estimator = new RollingEstimator();

    const concurrency = 16;
    await mapConcurrent(files, concurrency, async (filePath) => {
        const fileUrl = webClientPath + filePath.split("/").map(encodeURIComponent).join("/");
        try {
            const fileResp = await fetch(fileUrl);
            if (!fileResp.ok) {
                log(`[!] Binary request error (${fileResp.status}) @ ${fileUrl}`);
                return;
            }
            const buf = await fileResp.arrayBuffer();
            totalBytesLoaded += buf.byteLength;
            zip.file(filePath, buf);
        } catch (err) {
            log(`[!] Binary request error @ ${fileUrl} - ${err}`);
        } finally {
            filesDone++;
            estimator.update(totalBytesLoaded);
            const stats = estimator.getStats();

            const percent = (filesDone / files.length) * 100;
            const remainingFiles = files.length - filesDone;
            const fileRate = stats.elapsed > 0 ? filesDone / stats.elapsed : 0;
            const eta = fileRate > 0 ? remainingFiles / fileRate : -1;

            // Updated INSTANTLY on every single completed file
            updateProgress(
                percent,
                `Downloading files (${filesDone}/${files.length})`,
                `${percent.toFixed(1)}% | ${filesDone}/${files.length} files | ${formatBytes(totalBytesLoaded)} | ${formatBytes(stats.speed)}/s | ETA: ${formatTime(eta)}`
            );
        }
    });

    log(`[+] Downloaded all ${filesDone}/${files.length} files!`);
    exportAndDownloadZip(`${channel}-${binaryType}-${version}.zip`);
}