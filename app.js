// ⚠️ À adapter après le déploiement du backend sur Render :
// remplace cette URL par celle de ton service Render
// (format: https://ton-service.onrender.com, SANS "/" à la fin)
const API_BASE = "https://ligue1-predictor-api.onrender.com";

const statusMsg = document.getElementById("statusMsg");
const matchesEl = document.getElementById("matches");
const rankingEl = document.getElementById("ranking");
const matchdayNavEl = document.getElementById("matchdayNav");
const matchdaySelectEl = document.getElementById("matchdaySelect");
const loadingBarEl = document.getElementById("loadingBar");
const leagueTabsEl = document.getElementById("leagueTabs");
const leagueTitleEl = document.getElementById("leagueTitle");
const viewTabsEl = document.getElementById("viewTabs");
const modeTabsEl = document.getElementById("modeTabs");
const championnatModeEl = document.getElementById("championnatMode");
const dateModeEl = document.getElementById("dateMode");
const dateMatchesEl = document.getElementById("dateMatches");
const dateInputEl = document.getElementById("dateInput");
const clModeEl = document.getElementById("clMode");
const clMatchesEl = document.getElementById("clMatches");
const clMatchdaySelectEl = document.getElementById("clMatchdaySelect");
const clMatchdayNavEl = document.getElementById("clMatchdayNav");
const clViewTabsEl = document.getElementById("clViewTabs");
const clRankingEl = document.getElementById("clRanking");
let currentClView = "journee"; // "journee" | "classement"

let currentLeague = localStorage.getItem("lastLeague") || "ligue-1";
let currentView = "journee"; // "journee" | "classement"
let currentMode = "championnat"; // "championnat" | "date"

// Protection contre les réponses "en retard" : si on change de championnat/vue
// pendant qu'une requête est en cours (ex: cold start Render de 30-60s sur un
// championnat, cf. message d'erreur plus bas), la réponse la plus ancienne ne
// doit jamais écraser l'affichage d'une sélection plus récente déjà rendue.
let fetchGen = 0;

function pct(x) {
  return Math.round(x * 100) + "%";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateOnly(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fatigueBadge() {
  return `<span class="fatigue-badge" title="A joué en coupe d'Europe récemment">🔻 Europe</span>`;
}
function promuBadge() {
  return `<span class="promu-badge" title="Équipe promue cette saison : peu d'historique disponible, prédiction moins fiable">🆕 Promu</span>`;
}

function matchCardHTML(m, index) {
  const home = pct(m.prob_home_win);
  const draw = pct(m.prob_draw);
  const away = pct(m.prob_away_win);

  const scoresHTML = m.top_scores
    .slice(0, 5)
    .map(s => `<span class="score-chip"><b>${s.home_goals}-${s.away_goals}</b> ${pct(s.probability)}</span>`)
    .join("");

  return `
    <article class="match-card" style="animation-delay:${index * 0.06}s">
      <div class="match-meta">
        <span>${formatDate(m.date_utc)}${m.location ? " · " + m.location : ""}</span>
        ${m.championnat_label ? `<span class="match-league-badge">${m.flag} ${m.championnat_label}</span>` : ""}
        ${m.played ? '<span class="played-badge">Match joué</span>' : ""}
      </div>
      <div class="teams-row">
        <div class="team-name home">${m.home_team}${m.home_fatigue ? fatigueBadge() : ""}${m.home_promu ? promuBadge() : ""}</div>
        <div class="expected-score">${m.expected_goals_home.toFixed(1)}<span class="sep">–</span>${m.expected_goals_away.toFixed(1)}</div>
        <div class="team-name away">${m.away_team}${m.away_fatigue ? fatigueBadge() : ""}${m.away_promu ? promuBadge() : ""}</div>
      </div>
      <div class="prob-bar">
        <div class="prob-seg home ${m.prob_home_win < 0.12 ? 'tiny' : ''}" style="flex-grow:${m.prob_home_win}">${home}</div>
        <div class="prob-seg draw ${m.prob_draw < 0.12 ? 'tiny' : ''}" style="flex-grow:${m.prob_draw}">${draw}</div>
        <div class="prob-seg away ${m.prob_away_win < 0.12 ? 'tiny' : ''}" style="flex-grow:${m.prob_away_win}">${away}</div>
      </div>
      <div class="prob-legend">
        <span>1 · ${m.home_team}</span>
        <span>Nul</span>
        <span>2 · ${m.away_team}</span>
      </div>
      <div class="top-scores">${scoresHTML}</div>
    </article>
  `;
}

function populateMatchdaySelect(totalRounds, currentRound, targetEl = matchdaySelectEl) {
  const total = Math.max(totalRounds || currentRound, currentRound);
  let opts = "";
  for (let i = 1; i <= total; i++) {
    opts += `<option value="${i}"${i === currentRound ? " selected" : ""}>Journée ${i}</option>`;
  }
  targetEl.innerHTML = opts;
}

function rankingRowHTML(entry, index, minElo, maxElo) {
  const range = Math.max(maxElo - minElo, 1);
  const fillPct = Math.round(((entry.elo - minElo) / range) * 100);
  const top3 = entry.rank <= 3 ? " top3" : "";
  return `
    <div class="rank-row${top3}" style="animation-delay:${index * 0.03}s">
      <span class="rank-number">${entry.rank}</span>
      <span class="rank-team">${escapeHtml(entry.team)}${entry.promu ? promuBadge() : ""}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${fillPct}%"></div></div>
      <span class="rank-elo">${Math.round(entry.elo)}</span>
    </div>
  `;
}

function renderRanking(data) {
  const rows = data.classement || [];
  if (rows.length === 0) {
    rankingEl.innerHTML = "";
    statusMsg.textContent = "Aucun classement disponible pour ce championnat.";
    statusMsg.classList.remove("hidden");
    return;
  }
  const elos = rows.map(r => r.elo);
  const minElo = Math.min(...elos);
  const maxElo = Math.max(...elos);
  rankingEl.innerHTML = `
    <p class="ranking-updated">Dernière mise à jour des données : ${formatDateOnly(data.computed_up_to)}</p>
    <p class="ranking-note">
      Classement de force Elo (calculé sur l'historique complet) — à ne pas confondre
      avec le classement officiel du championnat, et sans lien avec le calcul des
      prédictions ci-dessus, qui repose uniquement sur le modèle Dixon-Coles.
    </p>
    <div class="ranking-table">
      ${rows.map((r, i) => rankingRowHTML(r, i, minElo, maxElo)).join("")}
    </div>
  `;
  statusMsg.classList.add("hidden");
}

async function fetchRanking() {
  const myGen = ++fetchGen;
  loadingBarEl.classList.add("active");
  statusMsg.classList.remove("hidden", "error");
  statusMsg.textContent = "Chargement du classement…";
  try {
    const res = await fetch(`${API_BASE}/api/${currentLeague}/classement`);
    if (myGen !== fetchGen) return; // une sélection plus récente a eu lieu entre-temps
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (myGen !== fetchGen) return;
    renderRanking(data);
  } catch (err) {
    if (myGen !== fetchGen) return;
    rankingEl.innerHTML = "";
    statusMsg.classList.add("error");
    statusMsg.textContent =
      "Impossible de contacter le serveur de prédictions. " +
      "Vérifie que le service Render est bien démarré (il peut mettre 30-60s à se réveiller " +
      "s'il était en veille), ou réessaie dans quelques instants.";
    console.error(err);
  } finally {
    if (myGen === fetchGen) loadingBarEl.classList.remove("active");
  }
}

function render(data) {
  populateMatchdaySelect(data.total_rounds, data.round_number);
  matchesEl.innerHTML = data.matches.map((m, i) => matchCardHTML(m, i)).join("");
  statusMsg.classList.add("hidden");
}

async function fetchJourney(path) {
  const myGen = ++fetchGen;
  loadingBarEl.classList.add("active");
  statusMsg.classList.remove("hidden", "error");
  statusMsg.textContent = "Chargement des prédictions…";
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (myGen !== fetchGen) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (myGen !== fetchGen) return;
    if (!data.matches || data.matches.length === 0) {
      matchesEl.innerHTML = "";
      statusMsg.textContent = "Aucun match trouvé pour cette journée.";
      return;
    }
    render(data);
  } catch (err) {
    if (myGen !== fetchGen) return;
    matchesEl.innerHTML = "";
    statusMsg.classList.add("error");
    statusMsg.textContent =
      "Impossible de contacter le serveur de prédictions. " +
      "Vérifie que le service Render est bien démarré (il peut mettre 30-60s à se réveiller " +
      "s'il était en veille), ou réessaie dans quelques instants.";
    console.error(err);
  } finally {
    if (myGen === fetchGen) loadingBarEl.classList.remove("active");
  }
}

function loadCurrentView() {
  // Affiche/masque les blocs pertinents pour la vue active, puis charge ses données.
  const isJournee = currentView === "journee";
  matchdayNavEl.classList.toggle("hidden", !isJournee);
  matchesEl.classList.toggle("hidden", !isJournee);
  rankingEl.classList.toggle("hidden", isJournee);
  if (isJournee) {
    fetchJourney(`/api/${currentLeague}/journee/courante`);
  } else {
    fetchRanking();
  }
}

function selectView(view) {
  currentView = view;
  viewTabsEl.querySelectorAll(".view-tab").forEach(btn => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  loadCurrentView();
}

function selectLeague(code, label) {
  currentLeague = code;
  localStorage.setItem("lastLeague", code);
  leagueTitleEl.innerHTML = `${label.toUpperCase()}<span class="accent-dot">.</span>`;
  document.querySelectorAll(".league-tab").forEach(btn => {
    const isActive = btn.dataset.code === code;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  // recharge la vue active (journée ou classement) pour le nouveau championnat
  loadCurrentView();
}

viewTabsEl.querySelectorAll(".view-tab").forEach(btn => {
  btn.addEventListener("click", () => selectView(btn.dataset.view));
});

async function initLeagueTabs() {
  try {
    const res = await fetch(`${API_BASE}/api/championnats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const leagues = data.championnats || [];

    leagueTabsEl.innerHTML = leagues.map(l => `
      <button class="league-tab" data-code="${l.code}" data-label="${l.label}"
              role="tab" aria-selected="false">
        ${l.flag} ${l.label}
      </button>
    `).join("");

    leagueTabsEl.querySelectorAll(".league-tab").forEach(btn => {
      btn.addEventListener("click", () => selectLeague(btn.dataset.code, btn.dataset.label));
    });

    // sélectionne le championnat mémorisé (ou Ligue 1 par défaut) s'il existe bien dans la liste
    const found = leagues.find(l => l.code === currentLeague);
    const initial = found || leagues[0];
    if (initial) {
      selectLeague(initial.code, initial.label);
    } else {
      statusMsg.textContent = "Aucun championnat disponible.";
    }
  } catch (err) {
    // si la liste des championnats échoue, on retombe sur Ligue 1 par défaut
    // pour que le site reste utilisable même si cet appel spécifique rate
    console.error(err);
    selectLeague("ligue-1", "Ligue 1");
  }
}

matchdaySelectEl.addEventListener("change", () => {
  const numero = parseInt(matchdaySelectEl.value, 10);
  if (numero) fetchJourney(`/api/${currentLeague}/journee/${numero}`);
});

function todayIsoDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchMatchsDuJour(date) {
  const myGen = ++fetchGen;
  loadingBarEl.classList.add("active");
  statusMsg.classList.remove("hidden");
  statusMsg.textContent = "Chargement des prédictions…";
  dateMatchesEl.innerHTML = "";
  try {
    const res = await fetch(`${API_BASE}/api/matchs-du-jour?date=${date}`);
    if (myGen !== fetchGen) return; // une selection plus recente a deja pris le relais
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (myGen !== fetchGen) return;

    const matches = data.matches || [];
    if (matches.length === 0) {
      dateMatchesEl.innerHTML = "";
      statusMsg.textContent = "Aucun match ce jour-là dans les championnats disponibles.";
      statusMsg.classList.remove("hidden");
      return;
    }
    dateMatchesEl.innerHTML = matches.map((m, i) => matchCardHTML(m, i)).join("");
    statusMsg.classList.add("hidden");

    if (data.championnats_indisponibles && data.championnats_indisponibles.length > 0) {
      const note = document.createElement("p");
      note.className = "ranking-note";
      note.textContent = `Championnats indisponibles pour le moment (non inclus ci-dessus) : ${data.championnats_indisponibles.join(", ")}.`;
      dateMatchesEl.prepend(note);
    }
  } catch (err) {
    if (myGen !== fetchGen) return;
    dateMatchesEl.innerHTML = "";
    statusMsg.classList.remove("hidden");
    statusMsg.textContent =
      "Impossible de contacter le serveur de prédictions. " +
      "Vérifie que le service Render est bien démarré (il peut mettre 30-60s à se réveiller " +
      "s'il était en veille), ou réessaie dans quelques instants.";
    console.error(err);
  } finally {
    if (myGen === fetchGen) loadingBarEl.classList.remove("active");
  }
}

async function fetchChampionsLeague(numero) {
  const myGen = ++fetchGen;
  loadingBarEl.classList.add("active");
  statusMsg.classList.remove("hidden");
  statusMsg.textContent = "Chargement des prédictions…";
  clMatchesEl.innerHTML = "";
  try {
    const url = numero
      ? `${API_BASE}/api/champions-league/journee/${numero}`
      : `${API_BASE}/api/champions-league/journee/courante`;
    const res = await fetch(url);
    if (myGen !== fetchGen) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (myGen !== fetchGen) return;

    if (data.round_number) {
      populateMatchdaySelect(data.total_rounds, data.round_number, clMatchdaySelectEl);
    }

    const matches = data.matches || [];
    if (matches.length === 0) {
      statusMsg.textContent = "Aucun match à venir trouvé pour la Ligue des Champions.";
      statusMsg.classList.remove("hidden");
      return;
    }
    clMatchesEl.innerHTML = matches.map((m, i) => matchCardHTML(m, i)).join("");
    statusMsg.classList.add("hidden");
  } catch (err) {
    if (myGen !== fetchGen) return;
    clMatchesEl.innerHTML = "";
    statusMsg.classList.remove("hidden");
    statusMsg.textContent =
      "Impossible de contacter le serveur de prédictions. " +
      "Vérifie que le service Render est bien démarré (il peut mettre 30-60s à se réveiller " +
      "s'il était en veille), ou réessaie dans quelques instants.";
    console.error(err);
  } finally {
    if (myGen === fetchGen) loadingBarEl.classList.remove("active");
  }
}

clMatchdaySelectEl.addEventListener("change", () => {
  const numero = parseInt(clMatchdaySelectEl.value, 10);
  if (numero) fetchChampionsLeague(numero);
});

function renderClRanking(data) {
  const rows = data.classement || [];
  if (rows.length === 0) {
    clRankingEl.innerHTML = "";
    statusMsg.textContent = "Aucun classement disponible pour la Ligue des Champions.";
    statusMsg.classList.remove("hidden");
    return;
  }
  const elos = rows.map(r => r.elo);
  const minElo = Math.min(...elos);
  const maxElo = Math.max(...elos);
  clRankingEl.innerHTML = `
    <p class="ranking-updated">Dernière mise à jour des données : ${formatDateOnly(data.computed_up_to)}</p>
    <p class="ranking-note">
      ⚠️ ${data.avertissement || "Estimation de force Elo, pas le classement officiel de la phase de ligue."}
    </p>
    <div class="ranking-table">
      ${rows.map((r, i) => rankingRowHTML(r, i, minElo, maxElo)).join("")}
    </div>
  `;
  statusMsg.classList.add("hidden");
}

async function fetchClRanking() {
  const myGen = ++fetchGen;
  loadingBarEl.classList.add("active");
  statusMsg.classList.remove("hidden");
  statusMsg.textContent = "Chargement du classement…";
  try {
    const res = await fetch(`${API_BASE}/api/champions-league/classement`);
    if (myGen !== fetchGen) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (myGen !== fetchGen) return;
    renderClRanking(data);
  } catch (err) {
    if (myGen !== fetchGen) return;
    clRankingEl.innerHTML = "";
    statusMsg.classList.remove("hidden");
    statusMsg.textContent =
      "Impossible de contacter le serveur de prédictions. " +
      "Vérifie que le service Render est bien démarré (il peut mettre 30-60s à se réveiller " +
      "s'il était en veille), ou réessaie dans quelques instants.";
    console.error(err);
  } finally {
    if (myGen === fetchGen) loadingBarEl.classList.remove("active");
  }
}

function selectClView(view) {
  currentClView = view;
  clViewTabsEl.querySelectorAll(".view-tab").forEach(btn => {
    const isActive = btn.dataset.clview === view;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  const isJournee = view === "journee";
  clMatchesEl.classList.toggle("hidden", !isJournee);
  clMatchdayNavEl.classList.toggle("hidden", !isJournee);
  clRankingEl.classList.toggle("hidden", isJournee);
  if (isJournee) {
    fetchChampionsLeague();
  } else {
    fetchClRanking();
  }
}

clViewTabsEl.querySelectorAll(".view-tab").forEach(btn => {
  btn.addEventListener("click", () => selectClView(btn.dataset.clview));
});

function selectMode(mode) {
  currentMode = mode;
  modeTabsEl.querySelectorAll(".mode-tab").forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  championnatModeEl.classList.toggle("hidden", mode !== "championnat");
  dateModeEl.classList.toggle("hidden", mode !== "date");
  clModeEl.classList.toggle("hidden", mode !== "champions-league");
  dateMatchesEl.classList.toggle("hidden", mode !== "date");
  // les deux sous-vues C1 (matches/ranking) sont masquees ici par defaut ;
  // selectClView() re-affiche la bonne des deux si on entre dans ce mode
  clMatchesEl.classList.add("hidden");
  clRankingEl.classList.add("hidden");
  // les blocs de la vue "championnat" (matches/ranking) restent geres par
  // loadCurrentView -> on les masque explicitement ici si on quitte ce mode
  if (mode === "championnat") {
    loadCurrentView();
    return;
  }
  matchesEl.classList.add("hidden");
  rankingEl.classList.add("hidden");
  matchdayNavEl.classList.add("hidden");

  if (mode === "date") {
    if (!dateInputEl.value) dateInputEl.value = todayIsoDate();
    fetchMatchsDuJour(dateInputEl.value);
  } else if (mode === "champions-league") {
    selectClView(currentClView);
  }
}

modeTabsEl.querySelectorAll(".mode-tab").forEach(btn => {
  btn.addEventListener("click", () => selectMode(btn.dataset.mode));
});

dateInputEl.addEventListener("change", () => {
  if (dateInputEl.value) fetchMatchsDuJour(dateInputEl.value);
});

initLeagueTabs();
