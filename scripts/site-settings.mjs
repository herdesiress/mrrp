export const defaultSiteSettings = () => ({
  motif: { enabled: false, symbol: "", count: 3 },
  widgets: {
    viewCount: true,
    viewCounterEndpoint: "",
    lastUpdated: true,
    clocks: true,
    themeToggle: true,
    backToTop: true,
    spotify: { enabled: false, endpoint: "", placement: "fixed-bottom-right" }
  },
  games: { enabled: false }
});

export const normalizeSiteSettings = (settings = {}) => {
  const defaults = defaultSiteSettings();
  return {
    ...settings,
    motif: { ...defaults.motif, ...settings.motif },
    widgets: {
      ...defaults.widgets,
      ...settings.widgets,
      spotify: { ...defaults.widgets.spotify, ...settings.widgets?.spotify }
    },
    games: { ...defaults.games, ...settings.games }
  };
};

const validUrl = (value, allowLocalHttp = false) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    const localHttp = allowLocalHttp && url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    return (url.protocol === "https:" || localHttp) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
};

export const validSiteSettings = (settings) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings) ||
    typeof settings.motif?.symbol !== "string" || settings.motif.symbol.length > 32 ||
    typeof settings.motif.enabled !== "boolean" ||
    !(settings.motif.count === undefined || Number.isInteger(settings.motif.count) && settings.motif.count >= 1 && settings.motif.count <= 20)) {
    return false;
  }
  if (settings.games !== undefined &&
    (!settings.games || typeof settings.games !== "object" || typeof settings.games.enabled !== "boolean")) return false;
  if (settings.widgets === undefined) return true;
  const { widgets } = settings;
  return widgets && typeof widgets === "object" &&
    ["viewCount", "lastUpdated", "clocks", "themeToggle", "backToTop"].every((key) => typeof widgets[key] === "boolean") &&
    typeof widgets.viewCounterEndpoint === "string" && widgets.viewCounterEndpoint.length <= 2048 &&
    validUrl(widgets.viewCounterEndpoint, true) &&
    typeof widgets.spotify?.enabled === "boolean" &&
    typeof widgets.spotify.endpoint === "string" && widgets.spotify.endpoint.length <= 2048 &&
    validUrl(widgets.spotify.endpoint, true) &&
    ["fixed-bottom-right", "fixed-bottom-left", "top", "after-intro", "bottom"].includes(widgets.spotify.placement);
};
