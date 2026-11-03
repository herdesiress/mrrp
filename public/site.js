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
const siteToolsReopen = document.querySelector(".site-tools-reopen");
const siteToolsClose = document.querySelector(".site-tools-close");
let siteToolsHideTimer;
const setSiteToolsVisible = (visible) => {
  if (!siteTools || !siteToolsReopen) return;
  clearTimeout(siteToolsHideTimer);
  if (visible) {
    siteTools.hidden = false;
    siteTools.classList.remove("is-closing");
    siteToolsReopen.hidden = true;
  } else {
    siteTools.classList.add("is-closing");
    siteToolsHideTimer = setTimeout(() => {
      siteTools.hidden = true;
      siteTools.classList.remove("is-closing");
      siteToolsReopen.hidden = false;
    }, 180);
  }
  siteToolsReopen.setAttribute("aria-expanded", String(visible));
  try {
    localStorage.setItem("mrrp-site-tools-hidden", String(!visible));
  } catch {}
};
if (siteTools && siteToolsReopen) {
  let hidden = false;
  try {
    hidden = localStorage.getItem("mrrp-site-tools-hidden") === "true";
  } catch {}
  siteTools.hidden = hidden;
  siteToolsReopen.hidden = !hidden;
  siteToolsReopen.setAttribute("aria-expanded", String(!hidden));
  siteToolsClose?.addEventListener("click", () => setSiteToolsVisible(false));
  siteToolsReopen.addEventListener("click", () => setSiteToolsVisible(true));
}

const gamesToggle = document.querySelector(".games-toggle");
const gamesPanel = document.querySelector(".games-panel");
let gamesPanelHideTimer;
gamesToggle?.addEventListener("click", () => {
  const visible = gamesToggle.getAttribute("aria-expanded") !== "true";
  clearTimeout(gamesPanelHideTimer);
  if (visible) {
    gamesPanel.hidden = false;
    gamesPanel.classList.remove("is-closing");
  } else {
    gamesPanel.classList.add("is-closing");
    gamesPanelHideTimer = setTimeout(() => {
      gamesPanel.hidden = true;
      gamesPanel.classList.remove("is-closing");
    }, 180);
  }
  gamesToggle.setAttribute("aria-expanded", String(visible));
  gamesToggle.setAttribute("aria-label", visible ? "Close games" : "Open games");
});

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
  const spotifyReopen = document.querySelector(".spotify-reopen");
  const spotifyClose = spotifyCard.querySelector(".spotify-close");
  let spotifyHideTimer;
  const setSpotifyVisible = (visible) => {
    clearTimeout(spotifyHideTimer);
    if (visible) {
      spotifyCard.hidden = false;
      spotifyCard.classList.remove("is-closing");
      if (spotifyReopen) spotifyReopen.hidden = true;
    } else {
      spotifyCard.classList.add("is-closing");
      spotifyHideTimer = setTimeout(() => {
        spotifyCard.hidden = true;
        spotifyCard.classList.remove("is-closing");
        if (spotifyReopen) spotifyReopen.hidden = false;
      }, 180);
    }
    if (spotifyReopen) {
      spotifyReopen.setAttribute("aria-expanded", String(visible));
    }
    try {
      localStorage.setItem("mrrp-spotify-hidden", String(!visible));
    } catch {}
  };
  let spotifyHidden = false;
  try {
    spotifyHidden = localStorage.getItem("mrrp-spotify-hidden") === "true";
  } catch {}
  setSpotifyVisible(!spotifyHidden);
  spotifyClose?.addEventListener("click", () => setSpotifyVisible(false));
  spotifyReopen?.addEventListener("click", () => setSpotifyVisible(true));
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

const connectFourBoard = document.querySelector(".connect-four-board");
if (connectFourBoard) {
  const rows = 6;
  const columns = 7;
  const human = 1;
  const bot = 2;
  const centerFirst = [3, 2, 4, 1, 5, 0, 6];
  const status = document.querySelector(".connect-four-status");
  let board = Array.from({ length: rows }, () => Array(columns).fill(0));
  let gameOver = false;
  let botThinking = false;
  let botTimer;

  const openColumns = (state) => centerFirst.filter((column) => state[0][column] === 0);
  const dropDisc = (state, column, player) => {
    for (let row = rows - 1; row >= 0; row -= 1) {
      if (state[row][column] === 0) {
        state[row][column] = player;
        return row;
      }
    }
    return -1;
  };
  const hasWon = (state, row, column, player) => {
    for (const [rowStep, columnStep] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let total = 1;
      for (const direction of [-1, 1]) {
        let nextRow = row + rowStep * direction;
        let nextColumn = column + columnStep * direction;
        while (nextRow >= 0 && nextRow < rows && nextColumn >= 0 && nextColumn < columns &&
          state[nextRow][nextColumn] === player) {
          total += 1;
          nextRow += rowStep * direction;
          nextColumn += columnStep * direction;
        }
      }
      if (total >= 4) return true;
    }
    return false;
  };
  const scoreBoard = (state) => {
    let score = 0;
    for (let row = 0; row < rows; row += 1) {
      if (state[row][3] === bot) score += 4;
      if (state[row][3] === human) score -= 4;
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        for (const [rowStep, columnStep] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const endRow = row + rowStep * 3;
          const endColumn = column + columnStep * 3;
          if (endRow < 0 || endRow >= rows || endColumn < 0 || endColumn >= columns) continue;
          const window = Array.from({ length: 4 }, (_, index) => state[row + rowStep * index][column + columnStep * index]);
          const botCount = window.filter((cell) => cell === bot).length;
          const humanCount = window.filter((cell) => cell === human).length;
          const emptyCount = window.filter((cell) => cell === 0).length;
          if (humanCount === 0) score += [0, 2, 12, 90, 0][botCount] * (emptyCount ? 1 : 0);
          if (botCount === 0) score -= [0, 2, 14, 110, 0][humanCount] * (emptyCount ? 1 : 0);
        }
      }
    }
    return score;
  };
  const minimax = (state, depth, alpha, beta, maximizing, lastMove) => {
    if (lastMove && hasWon(state, lastMove.row, lastMove.column, lastMove.player)) {
      return lastMove.player === bot ? 100000 + depth : -100000 - depth;
    }
    const available = openColumns(state);
    if (depth === 0 || !available.length) return scoreBoard(state);
    if (maximizing) {
      let value = Number.NEGATIVE_INFINITY;
      for (const column of available) {
        const next = state.map((row) => row.slice());
        const row = dropDisc(next, column, bot);
        value = Math.max(value, minimax(next, depth - 1, alpha, beta, false, { row, column, player: bot }));
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }
    let value = Number.POSITIVE_INFINITY;
    for (const column of available) {
      const next = state.map((row) => row.slice());
      const row = dropDisc(next, column, human);
      value = Math.min(value, minimax(next, depth - 1, alpha, beta, true, { row, column, player: human }));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  };
  const chooseBotMove = () => {
    let bestColumn = centerFirst[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const column of openColumns(board)) {
      const next = board.map((row) => row.slice());
      const row = dropDisc(next, column, bot);
      const score = minimax(next, 4, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, false, { row, column, player: bot });
      if (score > bestScore) {
        bestScore = score;
        bestColumn = column;
      }
    }
    return bestColumn;
  };
  const renderBoard = () => {
    connectFourBoard.querySelectorAll(".connect-four-column").forEach((button) => {
      const column = Number(button.dataset.column);
      button.disabled = gameOver || botThinking || board[0][column] !== 0;
      button.querySelectorAll(".connect-four-cell").forEach((cell, index) => {
        const player = board[index][column];
        cell.dataset.player = player ? String(player) : "";
        cell.setAttribute("aria-hidden", "true");
      });
    });
  };
  const resetGame = () => {
    clearTimeout(botTimer);
    board = Array.from({ length: rows }, () => Array(columns).fill(0));
    gameOver = false;
    botThinking = false;
    status.textContent = "your turn · drop a disc";
    renderBoard();
  };
  connectFourBoard.addEventListener("click", (event) => {
    const button = event.target.closest(".connect-four-column");
    if (!button || gameOver || botThinking) return;
    const column = Number(button.dataset.column);
    const row = dropDisc(board, column, human);
    if (row < 0) return;
    if (hasWon(board, row, column, human)) {
      gameOver = true;
      status.textContent = "you win · nice one";
      renderBoard();
      return;
    }
    if (!openColumns(board).length) {
      gameOver = true;
      status.textContent = "draw · try again";
      renderBoard();
      return;
    }
    botThinking = true;
    status.textContent = "bot thinking…";
    renderBoard();
    botTimer = setTimeout(() => {
      const botColumn = chooseBotMove();
      const botRow = dropDisc(board, botColumn, bot);
      botThinking = false;
      if (hasWon(board, botRow, botColumn, bot)) {
        gameOver = true;
        status.textContent = "bot wins · run it back?";
      } else if (!openColumns(board).length) {
        gameOver = true;
        status.textContent = "draw · try again";
      } else {
        status.textContent = "your turn · drop a disc";
      }
      renderBoard();
    }, 240);
  });
  document.querySelector(".game-reset")?.addEventListener("click", resetGame);
  renderBoard();
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
