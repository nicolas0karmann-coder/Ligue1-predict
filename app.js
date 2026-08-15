// ⚠️ À adapter après le déploiement du Space Hugging Face :
// remplace cette URL par celle de ton Space
// (format: https://<ton-username>-<nom-du-space>.hf.space)
const API_BASE = "https://ligue1-predictor-api.onrender.com";

const statusMsg = document.getElementById("statusMsg");
const matchesEl = document.getElementById("matches");
const matchdayNumberEl = document.getElementById("matchdayNumber");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

let currentRound = null;

function pct(x) {
  return Math.round(x * 100) + "%";
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
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
        ${m.played ? '<span class="played-badge">Match joué</span>' : ""}
      </div>
      <div class="teams-row">
        <div class="team-name home">${m.home_team}</div>
        <div class="expected-score">${m.expected_goals_home.toFixed(1)}<span class="sep">–</span>${m.expected_goals_away.toFixed(1)}</div>
        <div class="team-name away">${m.away_team}</div>
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

function render(data) {
  currentRound = data.round_number;
  matchdayNumberEl.textContent = data.round_number;
  matchesEl.innerHTML = data.matches.map((m, i) => matchCardHTML(m, i)).join("");
  statusMsg.classList.add("hidden");
}

async function fetchJourney(path) {
  statusMsg.classList.remove("hidden", "error");
  statusMsg.textContent = "Chargement des prédictions…";
  matchesEl.innerHTML = "";
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.matches || data.matches.length === 0) {
      statusMsg.textContent = "Aucun match trouvé pour cette journée.";
      return;
    }
    render(data);
  } catch (err) {
    statusMsg.classList.add("error");
    statusMsg.textContent =
      "Impossible de contacter le serveur de prédictions. " +
      "Vérifie que le Space Hugging Face est bien démarré, ou réessaie dans quelques instants.";
    console.error(err);
  }
}

prevBtn.addEventListener("click", () => {
  if (currentRound && currentRound > 1) fetchJourney(`/api/journee/${currentRound - 1}`);
});
nextBtn.addEventListener("click", () => {
  if (currentRound) fetchJourney(`/api/journee/${currentRound + 1}`);
});

fetchJourney("/api/journee/courante");
