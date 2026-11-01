const skyTimeSlider = document.querySelector("#sky-time");
const skyTimeLabel = document.querySelector("#sky-time-label");
const skyContext = document.querySelector("#sky-context");
const liveTimeButton = document.querySelector("#sky-live-time");
const skyPaletteSelect = document.querySelector("#sky-palette");
const rootStyle = document.documentElement.style;
const solarLocationKey = "tsy-solar-location";

let solarLocation = readSolarLocation();
let previewMinutes = null;
let selectedPaletteKey = null;

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

function updateSky() {
    const now = new Date();
    const time = previewMinutes === null ? localMinutes(now) : previewMinutes;
    const palette = selectedPaletteKey ? palettes[selectedPaletteKey] : paletteAt(time);
    const events = getSolarEvents(now);
    const isLiveSky = previewMinutes === null && selectedPaletteKey === null;
    applyPalette(palette, isLiveSky ? 200 : null);

    if (skyTimeSlider) {
        skyTimeSlider.value = String(Math.floor(time));
        skyTimeSlider.setAttribute("aria-valuetext", `${formatMinutes(time)} local time`);
        skyTimeSlider.style.setProperty("--progress", `${(time / 1439) * 100}%`);
    }
    if (skyTimeLabel) skyTimeLabel.textContent = formatMinutes(time);
    if (skyPaletteSelect && skyPaletteSelect.value !== (selectedPaletteKey || "")) {
        skyPaletteSelect.value = selectedPaletteKey || "";
    }

    if (skyContext) {
        const context = selectedPaletteKey
            ? `Previewing the ${skyPaletteSelect?.selectedOptions[0]?.textContent || selectedPaletteKey} palette. Press Now to return to your local sky.`
            : events.polarDay
            ? "Polar daylight colors based on your current date and location."
            : events.polarNight
                ? "Polar night colors based on your current date and location."
                : `Sky colors follow local sunrise at ${events.sunrise.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} and sunset at ${events.sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${events.approximate ? ". These times are approximate; allow location access for a closer match" : " for your location"}.`;
        if (skyContext.textContent !== context) skyContext.textContent = context;
    }
}

skyTimeSlider?.addEventListener("input", (event) => {
    previewMinutes = Number(event.currentTarget.value);
    selectedPaletteKey = null;
    updateSky();
});

skyPaletteSelect?.addEventListener("change", (event) => {
    selectedPaletteKey = event.currentTarget.value || null;
    if (selectedPaletteKey) {
        const matchingStop = paletteStops(new Date()).find((stop) => stop.palette === palettes[selectedPaletteKey]);
        previewMinutes = matchingStop?.time ?? localMinutes(new Date());
        if (skyContext) skyContext.textContent = `Previewing the ${event.currentTarget.selectedOptions[0].textContent} palette. Press Now to return to your local sky.`;
    } else {
        previewMinutes = null;
    }
    updateSky();
});

liveTimeButton?.addEventListener("click", () => {
    previewMinutes = null;
    selectedPaletteKey = null;
    updateSky();
    skyTimeSlider?.focus();
});

solarLocation = readSolarLocation();
updateSky();

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
