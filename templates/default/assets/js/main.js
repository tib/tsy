const skyTimeLabel = document.querySelector("#sky-time-label");
const skyContext = document.querySelector("#sky-context");
const simulationButton = document.querySelector("#sky-simulation-toggle");
const simulationLabel = document.querySelector("#sky-simulation-label");
const simulationIcon = document.querySelector(".simulation-play-icon");
const skyThemeButtons = [...document.querySelectorAll("[data-sky-theme]")];
const celestialSun = document.querySelector(".celestial-sun");
const celestialMoon = document.querySelector(".celestial-moon");
const celestialTrack = document.querySelector(".footer-celestial");
const celestialArt = [...document.querySelectorAll(".celestial-art")];
const rootStyle = document.documentElement.style;
const solarLocationKey = "tsy-solar-location";

let solarLocation = readSolarLocation();
let previewMinutes = null;
let selectedPaletteKey = null;
let simulationRunning = false;
let simulationStartedAt = 0;
let simulationElapsed = 0;
let simulationFrame = null;
const simulatedDayDuration = 60_000;

const palettes = {
    night: {
        skyStart: "#121b2a", skyEnd: "#293c5a", text: "#eef2f7", muted: "#c0ccdb", accent: "#bfd8c2",
        surface: "#202d40", featured: "#293951", border: "#40536a", tag: "#34465b", tagText: "#e1e9f1",
        nav: "#d9e4ef", button: "#b6d2bb", buttonText: "#17251c", stars: 0.86, logo: 1.2, logoHue: 132, logoSaturation: 0.72,
    },
    predawn: {
        skyStart: "#28304d", skyEnd: "#554661", text: "#f4edf3", muted: "#d9ccdb", accent: "#f0bf91",
        surface: "#302d46", featured: "#3b3450", border: "#665574", tag: "#494056", tagText: "#f0e5ee",
        nav: "#e8ddeb", button: "#e8b894", buttonText: "#342832", stars: 0.42, logo: 1.12, logoHue: 34, logoSaturation: 0.78,
    },
    dawn: {
        skyStart: "#efad93", skyEnd: "#f7d39c", text: "#2d2525", muted: "#493431", accent: "#482b28",
        surface: "#fff3e6", featured: "#f5e4d1", border: "#d9b49e", tag: "#eed9c8", tagText: "#453b3c",
        nav: "#372627", button: "#526b54", buttonText: "#ffffff", stars: 0.08, logo: 1, logoHue: 10, logoSaturation: 0.85,
    },
    morning: {
        skyStart: "#a9d6e5", skyEnd: "#f8fbf7", text: "#263a3d", muted: "#455a5d", accent: "#354936",
        surface: "#f6f8f0", featured: "#e7eee1", border: "#cbd7c6", tag: "#e1e8dc", tagText: "#33463a",
        nav: "#344c40", button: "#526b54", buttonText: "#ffffff", stars: 0, logo: 1, logoHue: 128, logoSaturation: 0.78,
    },
    noon: {
        skyStart: "#84c9e0", skyEnd: "#f5fbf5", text: "#26383d", muted: "#344a4d", accent: "#2e5048",
        surface: "#f7faf4", featured: "#e4efe7", border: "#c6d8d1", tag: "#dcebe6", tagText: "#304d48",
        nav: "#314c48", button: "#426b62", buttonText: "#ffffff", stars: 0, logo: 1, logoHue: 171, logoSaturation: 0.76,
    },
    afternoon: {
        skyStart: "#a4cfce", skyEnd: "#f4edce", text: "#303b36", muted: "#3b483f", accent: "#394b3c",
        surface: "#f7f4e8", featured: "#e9eddd", border: "#d2d8bf", tag: "#e2e7d4", tagText: "#3b503f",
        nav: "#394d40", button: "#526b54", buttonText: "#ffffff", stars: 0, logo: 1, logoHue: 135, logoSaturation: 0.82,
    },
    golden: {
        skyStart: "#f0bf9b", skyEnd: "#f8dba5", text: "#302522", muted: "#49362e", accent: "#57301f",
        surface: "#fff0e4", featured: "#f5dfca", border: "#d9ae91", tag: "#f0d8c4", tagText: "#523d35",
        nav: "#3b2c26", button: "#805041", buttonText: "#ffffff", stars: 0.04, logo: 1, logoHue: 23, logoSaturation: 0.85,
    },
    dusk: {
        skyStart: "#403069", skyEnd: "#723e61", text: "#f7eef4", muted: "#e0d3e0", accent: "#f3c391",
        surface: "#302947", featured: "#3b3152", border: "#685474", tag: "#493b5c", tagText: "#f0e5f1",
        nav: "#f0e3ee", button: "#edb58f", buttonText: "#372b36", stars: 0.2, logo: 1.12, logoHue: 35, logoSaturation: 0.82,
    },
};

function readSolarLocation() {
    try {
        const stored = localStorage.getItem(solarLocationKey);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

function storeSolarLocation(location) {
    try {
        localStorage.setItem(solarLocationKey, JSON.stringify(location));
    } catch {
        // The current page can still use the location when storage is unavailable.
    }
}

function dayOfYear(date) {
    const start = Date.UTC(date.getFullYear(), 0, 0);
    const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((current - start) / 86400000);
}

function solarTimes(date, latitude, longitude) {
    const radians = Math.PI / 180;
    const yearProgress = (2 * Math.PI / 365) * (dayOfYear(date) - 1);
    const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(yearProgress) - 0.032077 * Math.sin(yearProgress) - 0.014615 * Math.cos(2 * yearProgress) - 0.040849 * Math.sin(2 * yearProgress));
    const declination = 0.006918 - 0.399912 * Math.cos(yearProgress) + 0.070257 * Math.sin(yearProgress) - 0.006758 * Math.cos(2 * yearProgress) + 0.000907 * Math.sin(2 * yearProgress) - 0.002697 * Math.cos(3 * yearProgress) + 0.00148 * Math.sin(3 * yearProgress);
    const latitudeRadians = latitude * radians;
    const cosineHourAngle = (Math.cos(90.833 * radians) / (Math.cos(latitudeRadians) * Math.cos(declination))) - Math.tan(latitudeRadians) * Math.tan(declination);

    if (cosineHourAngle <= -1) return { polarDay: true };
    if (cosineHourAngle >= 1) return { polarNight: true };

    const hourAngle = Math.acos(cosineHourAngle) / radians;
    const midnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const sunriseUtcMinutes = 720 - 4 * (longitude + hourAngle) - equationOfTime;
    const sunsetUtcMinutes = 720 - 4 * (longitude - hourAngle) - equationOfTime;
    return {
        sunrise: new Date(midnight + sunriseUtcMinutes * 60000),
        sunset: new Date(midnight + sunsetUtcMinutes * 60000),
    };
}

function fallbackSolarTimes(date) {
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return {
        sunrise: new Date(midnight.getTime() + 6 * 60 * 60000),
        sunset: new Date(midnight.getTime() + 18 * 60 * 60000),
        approximate: true,
    };
}

function localMinutes(date) {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function formatMinutes(value) {
    if (value >= 1440) return "24:00";
    const minutes = Math.floor(value) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}

function relativeLuminance(hex) {
    const [red, green, blue] = hexToRgb(hex).map((channel) => channel / 255).map((channel) => (
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixHex(first, second, amount) {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    const channels = a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getSolarEvents(date) {
    if (!solarLocation) return fallbackSolarTimes(date);
    return solarTimes(date, solarLocation.latitude, solarLocation.longitude);
}

function paletteStops(date) {
    const events = getSolarEvents(date);
    if (events.polarDay) return [{ time: 0, palette: palettes.morning }, { time: 720, palette: palettes.noon }, { time: 1440, palette: palettes.morning }];
    if (events.polarNight) return [{ time: 0, palette: palettes.night }, { time: 1440, palette: palettes.night }];

    const sunrise = localMinutes(events.sunrise);
    const sunset = localMinutes(events.sunset);
    const dayLength = Math.max(90, sunset - sunrise);
    const stops = [
        { time: 0, palette: palettes.night },
        { time: Math.max(0, sunrise - 75), palette: palettes.predawn },
        { time: sunrise + 20, palette: palettes.dawn },
        { time: sunrise + dayLength * 0.2, palette: palettes.morning },
        { time: sunrise + dayLength * 0.48, palette: palettes.noon },
        { time: sunrise + dayLength * 0.72, palette: palettes.afternoon },
        { time: Math.max(sunrise + 30, sunset - 55), palette: palettes.golden },
        { time: Math.min(1435, sunset + 65), palette: palettes.dusk },
        { time: 1440, palette: palettes.night },
    ].sort((a, b) => a.time - b.time);

    return stops.filter((stop, index) => index === stops.length - 1 || stop.time < stops[index + 1].time);
}

function paletteAt(time) {
    const stops = paletteStops(new Date());
    const upperIndex = stops.findIndex((stop) => stop.time > time);
    const lower = stops[Math.max(0, upperIndex - 1)];
    const upper = stops[Math.min(stops.length - 1, upperIndex < 0 ? stops.length - 1 : upperIndex)];
    const amount = Math.max(0, Math.min(1, (time - lower.time) / (upper.time - lower.time || 1)));

    // Do not blend pale text into a bright background (or dark text into a dark one)
    // while crossing sunrise or sunset. Keep each side's contrast-safe palette intact.
    const lowerIsDark = (relativeLuminance(lower.palette.skyStart) + relativeLuminance(lower.palette.skyEnd)) / 2 < 0.18;
    const upperIsDark = (relativeLuminance(upper.palette.skyStart) + relativeLuminance(upper.palette.skyEnd)) / 2 < 0.18;
    if (lowerIsDark !== upperIsDark) {
        return amount < 0.5 ? lower.palette : upper.palette;
    }

    const result = {};

    for (const key of Object.keys(lower.palette)) {
        const first = lower.palette[key];
        const second = upper.palette[key];
        result[key] = typeof first === "number" ? first + (second - first) * amount : mixHex(first, second, amount);
    }
    return result;
}

function applyPalette(palette, logoHueOverride = null) {
    const values = {
        "--sky-start": palette.skyStart,
        "--sky-end": palette.skyEnd,
        "--theme-text": palette.text,
        "--theme-muted": palette.muted,
        "--theme-accent": palette.accent,
        "--theme-surface": palette.surface,
        "--theme-featured": palette.featured,
        "--theme-border": palette.border,
        "--theme-tag-bg": palette.tag,
        "--theme-tag-text": palette.tagText,
        "--theme-nav": palette.nav,
        "--theme-button-bg": palette.button,
        "--theme-button-text": palette.buttonText,
        "--star-opacity": palette.stars,
        "--logo-brightness": palette.logo,
        "--logo-hue": `${logoHueOverride ?? palette.logoHue}deg`,
        "--logo-saturation": palette.logoSaturation,
        "--ink": palette.text,
        "--moss": palette.accent,
        "--sage": palette.featured,
        "--cream": palette.surface,
        "--gold": palette.accent,
        "--link-color": palette.accent,
        "--link-color-visited": palette.accent,
        "--link-color-hover": palette.accent,
        "--link-color-active": palette.accent,
    };

    for (const [name, value] of Object.entries(values)) {
        rootStyle.setProperty(name, typeof value === "number" ? String(value) : value);
    }
    const paletteIsDark = (relativeLuminance(palette.skyStart) + relativeLuminance(palette.skyEnd)) / 2 < 0.18;
    rootStyle.setProperty("color-scheme", paletteIsDark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.skyStart);
}

function updateCelestialPositions(time, events) {
    const sunrise = events.sunrise ? localMinutes(events.sunrise) : 360;
    const sunset = events.sunset ? localMinutes(events.sunset) : 1080;
    const daylightLength = Math.max(1, sunset - sunrise);
    const nightLength = Math.max(1, 1440 - daylightLength);
    const localTime = ((time % 1440) + 1440) % 1440;
    let orbitProgress;
    if (localTime >= sunrise && localTime < sunset) {
        const daylightProgress = (localTime - sunrise) / daylightLength;
        orbitProgress = daylightProgress * 0.5;
    } else {
        const nightProgress = localTime >= sunset
            ? (localTime - sunset) / nightLength
            : (localTime + 1440 - sunset) / nightLength;
        orbitProgress = 0.5 + nightProgress * 0.5;
    }

    const pointOnArc = (progress) => ({
        x: 720 + 720 * Math.cos(Math.PI + 2 * Math.PI * progress),
        y: 110 + 90 * Math.sin(Math.PI + 2 * Math.PI * progress),
    });
    const setPosition = (element, progress) => {
        const angle = Math.PI + 2 * Math.PI * progress;
        const point = pointOnArc(progress);
        const edgeDistance = 1 - Math.abs(Math.cos(angle));
        const opacity = 0.12 + 0.88 * Math.pow(Math.max(0, edgeDistance), 0.6);
        element?.setAttribute("transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
        element?.style.setProperty("opacity", opacity.toFixed(3));
    };

    setPosition(celestialSun, orbitProgress);
    setPosition(celestialMoon, (orbitProgress + 0.5) % 1);
}

function updateCelestialScale() {
    if (!celestialTrack) return;
    const { width, height } = celestialTrack.getBoundingClientRect();
    if (!width || !height) return;
    const horizontalCorrection = (height * 1440) / (width * 220);
    celestialArt.forEach((art) => art.setAttribute("transform", `scale(${horizontalCorrection.toFixed(4)} 1)`));
}

updateCelestialScale();
window.addEventListener("resize", updateCelestialScale);
if (celestialTrack && "ResizeObserver" in window) {
    new ResizeObserver(updateCelestialScale).observe(celestialTrack);
}

function updateSky() {
    const now = new Date();
    const time = previewMinutes === null ? localMinutes(now) : previewMinutes;
    const palette = selectedPaletteKey ? palettes[selectedPaletteKey] : paletteAt(time);
    const stops = paletteStops(now);
    const activeStop = stops.reduce((active, stop) => stop.time <= time ? stop : active, stops[0]);
    const activeScene = selectedPaletteKey || Object.keys(palettes).find((key) => palettes[key] === activeStop.palette) || "night";
    if (document.documentElement.dataset.skyScene !== activeScene) {
        document.documentElement.dataset.skyScene = activeScene;
    }
    const events = getSolarEvents(now);
    updateCelestialPositions(time, events);
    const isLiveSky = previewMinutes === null && selectedPaletteKey === null;
    applyPalette(palette, isLiveSky ? 200 : null);

    if (skyTimeLabel) skyTimeLabel.textContent = formatMinutes(time);
    for (const button of skyThemeButtons) {
        button.setAttribute("aria-pressed", String(button.dataset.skyTheme === selectedPaletteKey));
    }

    if (skyContext) {
        const context = selectedPaletteKey
            ? `Previewing the ${skyThemeButtons.find((button) => button.dataset.skyTheme === selectedPaletteKey)?.dataset.skyLabel || selectedPaletteKey} palette. Press Now to return to your local sky.`
            : events.polarDay
            ? "Polar daylight colors based on your current date and location."
            : events.polarNight
                ? "Polar night colors based on your current date and location."
                : `Sky colors follow local sunrise at ${events.sunrise.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} and sunset at ${events.sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${events.approximate ? ". These times are approximate; allow location access for a closer match" : " for your location"}.`;
        if (skyContext.textContent !== context) skyContext.textContent = context;
    }
}

function resetSimulationButton() {
    if (!simulationButton || !simulationLabel) return;
    simulationButton.setAttribute("aria-pressed", "false");
    simulationButton.setAttribute("aria-label", "Start a one-day sky simulation");
    simulationLabel.textContent = simulationElapsed >= simulatedDayDuration
        ? "Replay the day"
        : simulationElapsed > 0 ? "Resume simulation" : "Simulate one day";
    if (simulationIcon) simulationIcon.textContent = "▶";
}

function pauseDaySimulation() {
    if (!simulationRunning) return;
    simulationElapsed += performance.now() - simulationStartedAt;
    simulationRunning = false;
    if (simulationFrame !== null) cancelAnimationFrame(simulationFrame);
    simulationFrame = null;
    resetSimulationButton();
}

function advanceDaySimulation(timestamp) {
    if (!simulationRunning) return;
    const elapsed = simulationElapsed + timestamp - simulationStartedAt;
    const progress = Math.min(1, elapsed / simulatedDayDuration);
    previewMinutes = progress * 1440;
    selectedPaletteKey = null;
    updateSky();

    if (progress >= 1) {
        simulationRunning = false;
        simulationElapsed = simulatedDayDuration;
        simulationFrame = null;
        resetSimulationButton();
        return;
    }
    simulationFrame = requestAnimationFrame(advanceDaySimulation);
}

simulationButton?.addEventListener("click", () => {
    if (simulationRunning) {
        pauseDaySimulation();
        return;
    }

    if (simulationElapsed >= simulatedDayDuration) {
        simulationElapsed = 0;
        previewMinutes = 0;
    }
    selectedPaletteKey = null;
    simulationStartedAt = performance.now();
    simulationRunning = true;
    simulationButton.setAttribute("aria-pressed", "true");
    simulationButton.setAttribute("aria-label", "Pause the one-day sky simulation");
    if (simulationLabel) simulationLabel.textContent = "Pause simulation";
    if (simulationIcon) simulationIcon.textContent = "Ⅱ";
    updateSky();
    simulationFrame = requestAnimationFrame(advanceDaySimulation);
});

skyThemeButtons.forEach((button) => button.addEventListener("click", () => {
    pauseDaySimulation();
    simulationElapsed = 0;
    resetSimulationButton();
    selectedPaletteKey = button.dataset.skyTheme;
    if (selectedPaletteKey) {
        const matchingStop = paletteStops(new Date()).find((stop) => stop.palette === palettes[selectedPaletteKey]);
        previewMinutes = matchingStop?.time ?? localMinutes(new Date());
    }
    updateSky();
}));

function initializeSwallowCanvas() {
    const canvas = document.querySelector(".hero-sunset-birds");
    const context = canvas?.getContext("2d", { alpha: true, desynchronized: true });
    if (!canvas || !context) return;

    const width = 820;
    const height = 150;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const random = (min, max) => min + Math.random() * (max - min);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const angleDifference = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const wrap = (value, min, max) => value < min ? max - ((min - value) % (max - min)) : value > max ? min + ((value - max) % (max - min)) : value;
    const flock = Array.from({ length: 12 }, (_, index) => ({
        x: width * .5 + random(-135, 135),
        y: height * .5 + random(-42, 42),
        heading: random(-.7, .7),
        speed: random(45, 65),
        cruiseSpeed: random(58, 86),
        scale: random(.54, .76),
        phase: random(0, Math.PI * 2),
        dartIn: random(2, 6),
        dartFor: 0,
        dartHeading: 0,
        dartSpeed: 0,
        targetX: random(100, width - 100),
        targetY: random(24, height - 24),
        targetIn: random(2.5, 5),
        index,
    }));
    const leader = flock[0];
    let pointer = null;
    let frame = null;
    let previousTime = 0;
    let elapsed = 0;
    let intersectsViewport = true;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(rect.width * pixelRatio);
        canvas.height = Math.round(rect.height * pixelRatio);
        context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    }

    function pointerFlee(bird, radius) {
        if (!pointer) return null;
        const dx = bird.x - pointer.x;
        const dy = bird.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) return null;
        const angle = distance > .001 ? Math.atan2(dy, dx) : bird.phase;
        return { x: Math.cos(angle), y: Math.sin(angle), strength: 1 - distance / radius };
    }

    function moveLeader(dt) {
        leader.targetIn -= dt;
        if (leader.targetIn <= 0) {
            leader.targetX = random(70, width - 70);
            leader.targetY = random(20, height - 20);
            leader.targetIn = random(2.5, 5.5);
        }
        const flee = pointerFlee(leader, 80);
        const aim = flee
            ? Math.atan2(flee.y, flee.x)
            : Math.atan2(leader.targetY - leader.y, leader.targetX - leader.x);
        const weave = flee ? 0 : Math.sin(elapsed * 2.6 + leader.phase) * .18;
        leader.heading += clamp(angleDifference(leader.heading, aim + weave), -(flee ? 4.8 : 2.4) * dt, (flee ? 4.8 : 2.4) * dt);
        leader.dartIn -= dt;
        let targetSpeed = leader.cruiseSpeed + (flee ? flee.strength * 85 : 0);
        if (flee) leader.dartFor = 0;
        if (!flee && leader.dartIn <= 0 && leader.dartFor <= 0) {
            leader.dartFor = random(.12, .2);
            leader.dartHeading = leader.heading + random(-.8, .8);
            leader.dartSpeed = random(105, 145);
            leader.dartIn = random(3, 7);
        }
        if (leader.dartFor > 0) {
            leader.dartFor -= dt;
            leader.heading += angleDifference(leader.heading, leader.dartHeading) * Math.min(1, dt * 7);
            targetSpeed = leader.dartSpeed;
        }
        leader.speed += (targetSpeed - leader.speed) * Math.min(1, dt * 3.2);
        leader.x = wrap(leader.x + Math.cos(leader.heading) * leader.speed * dt, -35, width + 35);
        leader.y = wrap(leader.y + Math.sin(leader.heading) * leader.speed * dt, -28, height + 28);
    }

    function moveFollowers(dt) {
        const snapshots = flock.map(({ x, y, heading }) => ({ x, y, heading }));
        for (let index = 1; index < flock.length; index += 1) {
            const bird = flock[index];
            const own = snapshots[index];
            let centerX = 0;
            let centerY = 0;
            let alignX = 0;
            let alignY = 0;
            let separationX = 0;
            let separationY = 0;
            let neighbors = 0;

            for (let otherIndex = 0; otherIndex < snapshots.length; otherIndex += 1) {
                if (otherIndex === index) continue;
                const other = snapshots[otherIndex];
                const dx = other.x - own.x;
                const dy = other.y - own.y;
                const distance = Math.hypot(dx, dy);
                if (distance < 155) {
                    centerX += other.x;
                    centerY += other.y;
                    alignX += Math.cos(other.heading);
                    alignY += Math.sin(other.heading);
                    neighbors += 1;
                }
                if (distance > 0 && distance < 24) {
                    const strength = (24 - distance) / 24;
                    separationX -= dx / distance * strength;
                    separationY -= dy / distance * strength;
                }
            }

            let steerX = Math.cos(leader.heading) * .55;
            let steerY = Math.sin(leader.heading) * .55;
            if (neighbors) {
                centerX = centerX / neighbors - own.x;
                centerY = centerY / neighbors - own.y;
                const centerLength = Math.hypot(centerX, centerY) || 1;
                const alignLength = Math.hypot(alignX, alignY) || 1;
                steerX += centerX / centerLength * 1.1 + alignX / alignLength * .7;
                steerY += centerY / centerLength * 1.1 + alignY / alignLength * .7;
            }
            steerX += separationX * 1.5;
            steerY += separationY * 1.5;
            const flee = pointerFlee(bird, 72);
            if (flee) {
                steerX += flee.x * (2 + flee.strength * 2);
                steerY += flee.y * (2 + flee.strength * 2);
            }
            const desired = Math.atan2(steerY, steerX) + Math.sin(elapsed * 2 + bird.phase) * .1;
            bird.heading += clamp(angleDifference(bird.heading, desired), -(flee ? 4.6 : 3) * dt, (flee ? 4.6 : 3) * dt);
            bird.dartIn -= dt;
            let targetSpeed = bird.cruiseSpeed + (flee ? flee.strength * 72 : 0);
            if (flee) bird.dartFor = 0;
            if (!flee && bird.dartIn <= 0 && bird.dartFor <= 0) {
                bird.dartFor = random(.1, .17);
                bird.dartHeading = bird.heading + random(-.8, .8);
                bird.dartSpeed = random(105, 145);
                bird.dartIn = random(3, 7);
            }
            if (bird.dartFor > 0) {
                bird.dartFor -= dt;
                bird.heading += angleDifference(bird.heading, bird.dartHeading) * Math.min(1, dt * 8);
                targetSpeed = bird.dartSpeed;
            }
            bird.speed += (targetSpeed - bird.speed) * Math.min(1, dt * 3.6);
            const flutter = Math.sin(elapsed * 3.5 + bird.phase) * 2.5;
            bird.x = wrap(bird.x + (Math.cos(bird.heading) * bird.speed - Math.sin(bird.heading) * flutter + separationX * 28) * dt, -35, width + 35);
            bird.y = wrap(bird.y + (Math.sin(bird.heading) * bird.speed + Math.cos(bird.heading) * flutter + separationY * 28) * dt, -28, height + 28);
        }
    }

    function drawSwallow(bird, time) {
        context.save();
        context.translate(bird.x, bird.y);
        context.rotate(bird.heading);
        context.scale(bird.scale, bird.scale);
        const wingBeat = Math.sin(time * 8 + bird.phase);

        context.beginPath();
        context.moveTo(-7, -1.2);
        context.bezierCurveTo(-11, -2.6, -16, -2.5, -20, -2.4);
        context.quadraticCurveTo(-15.5, -.6, -9, .35);
        context.closePath();
        context.fill();
        context.beginPath();
        context.moveTo(-7, 1.2);
        context.bezierCurveTo(-11, 2.6, -16, 2.5, -20, 2.4);
        context.quadraticCurveTo(-15.5, .6, -9, -.35);
        context.closePath();
        context.fill();

        for (const side of [-1, 1]) {
            context.save();
            context.translate(1, side * .8);
            context.rotate(side * (.08 + wingBeat * .16));
            context.beginPath();
            context.moveTo(1, side * 1.4);
            context.bezierCurveTo(-1, side * 4, -4, side * 9, -14, side * 10);
            context.bezierCurveTo(-8, side * 6.5, -5, side * 2.5, -2.5, side * 2.4);
            context.quadraticCurveTo(-.5, side * 1.7, 1, side * 1.4);
            context.closePath();
            context.fill();
            context.restore();
        }

        context.beginPath();
        context.moveTo(7, 0);
        context.bezierCurveTo(3.5, -2.1, -1, -2.9, -6, -2.65);
        context.bezierCurveTo(-11, -2.3, -14, -1.05, -15.5, -.4);
        context.bezierCurveTo(-11, -.1, -8, .3, -5, .6);
        context.bezierCurveTo(-8.5, .95, -11, 1.55, -13.5, 2.1);
        context.bezierCurveTo(-7.5, 3.35, -1, 2.85, 4, 1.85);
        context.quadraticCurveTo(7, 1, 7, 0);
        context.closePath();
        context.fill();
        context.beginPath();
        context.arc(5.4, 0, 1.35, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(6.5, -.5);
        context.lineTo(8.5, 0);
        context.lineTo(6.5, .5);
        context.closePath();
        context.fill();
        context.restore();
    }

    function paint(timestamp) {
        context.clearRect(0, 0, width, height);
        context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--theme-muted").trim() || "#49362e";
        context.globalAlpha = 1;
        for (const bird of [...flock].sort((a, b) => a.y - b.y)) drawSwallow(bird, timestamp);
        context.globalAlpha = 1;
    }

    function stop() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        previousTime = 0;
        context.clearRect(0, 0, width, height);
    }

    function animate(timestamp) {
        frame = null;
        if (document.documentElement.dataset.skyScene !== "golden" || document.hidden || !intersectsViewport) {
            stop();
            return;
        }
        const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, .04) : 0;
        previousTime = timestamp;
        elapsed += dt;
        if (!reducedMotion.matches) {
            moveLeader(dt);
            moveFollowers(dt);
        }
        paint(elapsed);
        if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
    }

    function sync() {
        if (document.documentElement.dataset.skyScene !== "golden" || document.hidden || !intersectsViewport) {
            stop();
            return;
        }
        if (frame !== null) cancelAnimationFrame(frame);
        previousTime = 0;
        if (reducedMotion.matches) {
            paint(elapsed);
            return;
        }
        frame = requestAnimationFrame(animate);
    }

    window.addEventListener("pointermove", (event) => {
        const rect = canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            pointer = null;
            return;
        }
        pointer = {
            x: (event.clientX - rect.left) / rect.width * width,
            y: (event.clientY - rect.top) / rect.height * height,
        };
    }, { passive: true });
    window.addEventListener("resize", () => {
        resize();
        sync();
    }, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener?.("change", sync);
    new MutationObserver(sync).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-sky-scene"],
    });
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(([entry]) => {
            intersectsViewport = entry.isIntersecting;
            sync();
        }).observe(canvas);
    }
    resize();
    sync();
}

function initializeStarfieldCanvas() {
    const canvas = document.querySelector(".starfield-canvas");
    const scene = document.querySelector(".nature-scene");
    const svg = scene?.querySelector("svg");
    const context = canvas?.getContext("2d", { alpha: true, desynchronized: true });
    if (!canvas || !scene || !svg || !context) return;

    const viewBox = svg.viewBox.baseVal;
    const starsByScene = {};
    for (const [sceneName, selector] of [["night", ".night-stars"], ["predawn", ".predawn-stars"]]) {
        const sourceLayer = svg.querySelector(selector);
        if (!sourceLayer) continue;

        let index = 0;
        starsByScene[sceneName] = [...sourceLayer.querySelectorAll("circle")].flatMap((circle) => {
            const matrix = circle.getCTM();
            if (!matrix) return [];
            const point = svg.createSVGPoint();
            point.x = Number(circle.getAttribute("cx") || 0);
            point.y = Number(circle.getAttribute("cy") || 0);
            const position = point.matrixTransform(matrix);
            const sourceRadius = Number(circle.getAttribute("r") || 1);
            const isConstellation = Boolean(circle.closest(".constellation"));
            const scale = Math.hypot(matrix.a, matrix.b);
            const radius = Math.max(0.35, sourceRadius * scale * (isConstellation ? 0.70 : 0.78));
            const fill = getComputedStyle(circle).fill || "#eef3ff";
            const star = {
                x: position.x,
                y: position.y,
                radius,
                color: fill,
                glow: index % 10 < 3,
                phase: (index * 2.399963229728653) % (Math.PI * 2),
                rate: 0.002 + (index % 11) * 0.00024,
                constellation: isConstellation,
            };
            index += 1;
            return [star];
        });
        // The canvas now owns these points, so keep the SVG tree lean at runtime.
        sourceLayer.remove();
    }

    let frame = null;
    let lastPaint = 0;
    let intersectsViewport = true;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let synchronizedScene = null;
    let synchronizedActive = false;
    let synchronizedReducedMotion = reducedMotion.matches;
    let canvasWidth = viewBox.width;
    let canvasHeight = viewBox.height;
    let starfieldRotation = 0;
    let previousRotationTimestamp = null;
    function resizeCanvas() {
        const bounds = svg.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(bounds.width * pixelRatio);
        canvas.height = Math.round(bounds.height * pixelRatio);
        canvasWidth = viewBox.width;
        canvasHeight = viewBox.height;
        context.setTransform(canvas.width / canvasWidth, 0, 0, canvas.height / canvasHeight, 0, 0);
        lastPaint = 0;
    }

    function paint(timestamp) {
        const sceneName = document.documentElement.dataset.skyScene;
        const stars = starsByScene[sceneName];
        if (!stars || document.hidden || !intersectsViewport) return;
        if (timestamp - lastPaint < 40 && lastPaint !== 0) return;
        if (previousRotationTimestamp !== null) {
            starfieldRotation = (starfieldRotation + (timestamp - previousRotationTimestamp) * (Math.PI * 2 / 3600000)) % (Math.PI * 2);
        }
        previousRotationTimestamp = timestamp;
        lastPaint = timestamp;

        context.clearRect(0, 0, canvasWidth, canvasHeight);
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const cosine = Math.cos(starfieldRotation);
        const sine = Math.sin(starfieldRotation);

        for (const star of stars) {
            const wave = (Math.sin(timestamp * star.rate + star.phase) + 1) / 2;
            const sizePulse = star.glow ? 0.88 + wave * 0.24 : 0.9 + wave * 0.2;
            context.fillStyle = star.color;
            const offsetX = star.x - centerX;
            const offsetY = star.y - centerY;
            const x = centerX + offsetX * cosine - offsetY * sine;
            const y = centerY + offsetX * sine + offsetY * cosine;
            context.globalAlpha = 0.34 + wave * 0.56;
            context.shadowColor = star.glow ? star.color : "transparent";
            context.shadowBlur = star.glow ? 2 + wave * 3 : 0;
            context.beginPath();
            context.arc(x, y, star.radius * sizePulse, 0, Math.PI * 2);
            context.fill();
        }
    }

    function stopStarfield() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        lastPaint = 0;
        context.clearRect(0, 0, canvasWidth, canvasHeight);
    }

    function animate(timestamp) {
        frame = null;
        const sceneName = document.documentElement.dataset.skyScene;
        if (!starsByScene[sceneName] || document.hidden || !intersectsViewport) {
            stopStarfield();
            return;
        }
        paint(timestamp);
        if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
    }

    function syncStarfield(force = false) {
        const sceneName = document.documentElement.dataset.skyScene;
        const active = Boolean(starsByScene[sceneName]) && !document.hidden && intersectsViewport;
        const motionReduced = reducedMotion.matches;
        if (!force && sceneName === synchronizedScene && active === synchronizedActive && motionReduced === synchronizedReducedMotion) return;
        synchronizedScene = sceneName;
        synchronizedActive = active;
        synchronizedReducedMotion = motionReduced;
        if (!active) {
            stopStarfield();
            return;
        }
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        lastPaint = 0;
        paint(performance.now());
        if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
    }

    resizeCanvas();
    window.addEventListener("resize", () => {
        resizeCanvas();
        syncStarfield(true);
    }, { passive: true });
    document.addEventListener("visibilitychange", () => syncStarfield());
    reducedMotion.addEventListener?.("change", () => syncStarfield(true));
    new MutationObserver(() => syncStarfield()).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-sky-scene"],
    });
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(([entry]) => {
            intersectsViewport = entry.isIntersecting;
            syncStarfield();
        }).observe(scene);
    }
    syncStarfield();
}

solarLocation = readSolarLocation();
updateSky();
initializeStarfieldCanvas();
initializeSwallowCanvas();

if (navigator.geolocation && !solarLocation) {
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
            solarLocation = { latitude: coords.latitude, longitude: coords.longitude };
            storeSolarLocation(solarLocation);
            updateSky();
        },
        () => updateSky(),
        { enableHighAccuracy: false, maximumAge: 86400000, timeout: 5000 },
    );
}

window.setInterval(() => {
    if (previewMinutes === null) updateSky();
}, 30000);
