document.addEventListener("click", (event) => {
  const spoiler = event.target.closest(".spoiler");
  if (spoiler) {
    spoiler.classList.toggle("revealed");
    return;
  }
  const expand = event.target.closest(".video-expand");
  if (!expand) return;
  const video = expand.closest(".video-embed")?.querySelector("video");
  if (!video) return;

  const inlineParent = video.parentNode;
  const inlineNextSibling = video.nextSibling;
  const inlineStyle = video.getAttribute("style");
  video.pause();
  const dialog = document.createElement("dialog");
  dialog.className = "video-dialog";
  const close = document.createElement("button");
  close.className = "video-close";
  close.type = "button";
  close.textContent = "close";
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (click) => {
    if (click.target === dialog) dialog.close();
  });
  video.style.maxWidth = "";
  video.style.maxHeight = "";
  dialog.append(video, close);
  dialog.addEventListener("close", () => {
    const shouldResume = !video.paused && !video.ended;
    video.pause();
    if (inlineNextSibling?.parentNode === inlineParent) inlineParent.insertBefore(video, inlineNextSibling);
    else inlineParent.append(video);
    if (inlineStyle === null) video.removeAttribute("style");
    else video.setAttribute("style", inlineStyle);
    if (shouldResume) video.play().catch(() => {});
    dialog.remove();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  video.play().catch(() => {});
});

const siteTools = document.querySelector(".site-tools");
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Melbourne" });
const localClockFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
const updateClocks = () => {
  const now = new Date();
  const melbourne = siteTools?.querySelector('[data-clock="melbourne"]');
  const local = siteTools?.querySelector('[data-clock="local"]');
  if (melbourne) melbourne.textContent = clockFormat.format(now);
  if (local) local.textContent = localClockFormat.format(now);
};
if (siteTools?.querySelector("[data-clock]")) {
  updateClocks();
  setInterval(updateClocks, 30_000);
}

const viewCount = siteTools?.querySelector("[data-view-count]");
if (viewCount?.dataset.viewCountEndpoint) {
  fetch(viewCount.dataset.viewCountEndpoint, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`View counter returned ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const count = Number(data.count);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("View counter returned an invalid count");
      viewCount.textContent = new Intl.NumberFormat().format(count);
    })
    .catch(() => {
      viewCount.textContent = "unavailable";
    });
}

const themeToggle = siteTools?.querySelector(".theme-toggle");
if (themeToggle) {
  let theme = "dark";
  try {
    theme = localStorage.getItem("mrrp-theme") === "light" ? "light" : "dark";
  } catch {}
  document.documentElement.dataset.theme = theme;
  const updateThemeLabel = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    themeToggle.textContent = next;
    themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
  };
  updateThemeLabel();
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("mrrp-theme", next);
    } catch {}
    updateThemeLabel();
  });
}

const backToTop = document.querySelector(".back-to-top");
if (backToTop) {
  const updateBackToTop = () => {
    const visible = window.scrollY > Math.max(1000, window.innerHeight * 1.5);
    backToTop.classList.toggle("visible", visible);
    backToTop.setAttribute("aria-hidden", String(!visible));
    backToTop.tabIndex = visible ? 0 : -1;
  };
  window.addEventListener("scroll", updateBackToTop, { passive: true });
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  updateBackToTop();
}

const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

const spotifyCard = document.querySelector(".spotify-card");
if (spotifyCard) {
  const endpoint = spotifyCard.dataset.spotifyEndpoint;
  const status = spotifyCard.querySelector(".spotify-status");
  const artwork = spotifyCard.querySelector(".spotify-artwork");
  const title = spotifyCard.querySelector(".spotify-title");
  const artist = spotifyCard.querySelector(".spotify-artist");
  const progress = spotifyCard.querySelector(".spotify-progress span");
  const position = spotifyCard.querySelector(".spotify-position");
  const duration = spotifyCard.querySelector(".spotify-duration");
  const link = spotifyCard.querySelector(".spotify-link");
  let basePosition = 0;
  let durationSeconds = 0;
  let playing = false;
  let artworkUrl = "";
  let positionUpdatedAt = performance.now();
  const updateProgress = () => {
    const rawElapsed = basePosition + (playing ? (performance.now() - positionUpdatedAt) / 1000 : 0);
    const elapsed = Math.min(durationSeconds || Number.POSITIVE_INFINITY, Math.max(0, rawElapsed));
    position.textContent = formatTime(elapsed);
    progress.style.width = `${durationSeconds ? Math.min(100, elapsed / durationSeconds * 100) : 0}%`;
  };
  const updateTrack = async () => {
    if (!endpoint) {
      status.textContent = "Add a public DiscSpot endpoint in site settings";
      spotifyCard.dataset.state = "unconfigured";
      return;
    }
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`Tracker returned ${response.status}`);
      const snapshot = await response.json();
      const track = snapshot.track;
      if (!track) {
        status.textContent = "nothing playing";
        title.textContent = "";
        artist.textContent = "";
        artwork.replaceChildren();
        artworkUrl = "";
        basePosition = 0;
        durationSeconds = 0;
        playing = false;
        positionUpdatedAt = performance.now();
        updateProgress();
        duration.textContent = "0:00";
        link.href = "https://open.spotify.com/";
        spotifyCard.dataset.state = "idle";
        return;
      }
      const coverUrl = /^https:\/\//i.test(track.cover_url || "") ? track.cover_url : "";
      if (coverUrl !== artworkUrl) {
        artworkUrl = coverUrl;
        artwork.replaceChildren();
        if (coverUrl) {
          const image = document.createElement("img");
          image.src = coverUrl;
          image.alt = "";
          image.decoding = "async";
          image.loading = "eager";
          artwork.append(image);
        }
      }
      title.textContent = track.title || "Unknown track";
      artist.textContent = track.artist || "";
      const isPlaying = Boolean(track.playing);
      status.textContent = isPlaying ? "listening to spotify" : "spotify paused";
      spotifyCard.dataset.state = isPlaying ? "playing" : "paused";
      basePosition = Number(snapshot.position) || 0;
      durationSeconds = Number(track.duration_s) || 0;
      playing = isPlaying;
      const publishedAt = Number(snapshot.updatedAt);
      const snapshotAge = Number.isFinite(publishedAt) ? Math.max(0, Date.now() - publishedAt) : 0;
      positionUpdatedAt = performance.now() - snapshotAge;
      duration.textContent = formatTime(durationSeconds);
      updateProgress();
      const trackId = /^[a-z\d]{22}$/i.test(track.track_id || "") ? track.track_id : "";
      link.href = trackId ? `https://open.spotify.com/track/${trackId}` : "https://open.spotify.com/";
    } catch {
      status.textContent = "discspot is unavailable";
      spotifyCard.dataset.state = "error";
    }
    window.setTimeout(updateTrack, 1200);
  };
  updateTrack();
  setInterval(updateProgress, 250);
}

document.addEventListener("keydown", (event) => {
  const spoiler = event.target.closest(".spoiler");
  if (spoiler && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    spoiler.classList.toggle("revealed");
  }
});

const motif = document.querySelector(".floating-motif");
if (motif?.dataset.enabled === "true" && motif.dataset.symbol) {
  const symbol = motif.dataset.symbol;
  const count = Math.max(1, Math.min(20, Number.parseInt(motif.dataset.count, 10) || 3));
  const movers = Array.from({ length: count }, (_, index) => {
    const element = document.createElement("span");
    element.className = "floating-symbol";
    element.textContent = symbol;
    motif.append(element);
    return {
      element,
      x: Math.random() * Math.max(0, innerWidth - 80),
      y: Math.random() * Math.max(0, innerHeight - 40),
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.008 + Math.random() * 0.012),
      vy: (Math.random() < 0.5 ? -1 : 1) * (0.006 + Math.random() * 0.01),
      phase: index * 2.1
    };
  });
  let previousTime = 0;
  const move = (time) => {
    const delta = Math.min(time - (previousTime || time), 40);
    previousTime = time;
    for (const mover of movers) {
      mover.x += mover.vx * delta;
      mover.y += mover.vy * delta;
      const maxX = Math.max(0, innerWidth - mover.element.offsetWidth);
      const maxY = Math.max(0, innerHeight - mover.element.offsetHeight);
      if (mover.x < 0 || mover.x > maxX) mover.vx *= -1;
      if (mover.y < 0 || mover.y > maxY) mover.vy *= -1;
      mover.x = Math.min(maxX, Math.max(0, mover.x));
      mover.y = Math.min(maxY, Math.max(0, mover.y));
      const twitch = Math.sin(time / 330 + mover.phase) * 2;
      mover.element.style.transform = `translate(${mover.x}px, ${mover.y + twitch}px) rotate(${Math.sin(time / 780 + mover.phase) * 3}deg)`;
    }
    requestAnimationFrame(move);
  };
  for (const mover of movers) {
    mover.element.addEventListener("click", () => {
      mover.element.classList.remove("twitch");
      void mover.element.offsetWidth;
      mover.element.classList.add("twitch");
    });
  }
  requestAnimationFrame(move);
}
