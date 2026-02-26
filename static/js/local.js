/* =======================================================================
   El Impostor – Pass‑and‑Play (Single Device) client
   All game logic runs locally in the browser.
   ======================================================================= */
(function () {
  "use strict";

  // ---- Word bank (mirrored from server for offline play) ---------------
  const WORD_BANK = {
    "Animales": ["Perro","Gato","Elefante","Delfín","Águila","Tiburón","Mariposa","Caballo","Tortuga","León","Canguro","Búho","Pingüino","Cocodrilo","Jirafa","Oso","Lobo","Serpiente"],
    "Comida": ["Pizza","Sushi","Tacos","Hamburguesa","Paella","Croissant","Helado","Chocolate","Empanada","Ceviche","Ramen","Lasaña","Churros","Guacamole","Pancakes","Brownie","Falafel","Nachos"],
    "Películas": ["Titanic","Avatar","Matrix","Inception","Gladiator","Interstellar","Frozen","Coco","Joker","Parasite","Shrek","Toy Story","Batman","Avengers","Jurassic Park"],
    "Deportes": ["Fútbol","Basketball","Tennis","Natación","Ciclismo","Boxeo","Surf","Escalada","Rugby","Golf","Volleyball","Karate","Esgrima","Hockey","Atletismo"],
    "Países": ["Japón","Brasil","Francia","Australia","Egipto","Canadá","México","Italia","India","Alemania","Argentina","Tailandia","Noruega","Colombia","Grecia"],
    "Profesiones": ["Médico","Astronauta","Chef","Piloto","Bombero","Arquitecto","Detective","Veterinario","Profesor","Músico","Periodista","Abogado","Ingeniero","Fotógrafo"],
    "Objetos": ["Espejo","Reloj","Paraguas","Guitarra","Telescopio","Brújula","Martillo","Vela","Corona","Candado","Sombrero","Mochila","Llave","Cámara"],
    "Lugares": ["Playa","Biblioteca","Hospital","Castillo","Volcán","Aeropuerto","Desierto","Museo","Selva","Parque","Faro","Mercado","Acuario","Catedral"],
  };

  // ---- State -----------------------------------------------------------
  let players = [];          // [{name, role, alive, clue, scores[], caughtImpostorRounds[]}]
  let impostorHelp = false;
  let secretWord = "";
  let category = "";
  let roundNumber = 0;
  let maxRounds = 3;
  let currentRevealIdx = 0;  // for role reveal pass‑around
  let phase = "setup";       // setup | reveal | discussion | elimination | result | gameover
  let selectedEliminated = null;

  // ---- DOM refs --------------------------------------------------------
  const $setup    = document.getElementById("setup-view");
  const $game     = document.getElementById("game-view");
  const $list     = document.getElementById("player-list");
  const $toasts   = document.getElementById("toasts");

  // ---- Helpers ---------------------------------------------------------
  function toast(msg, type = "error") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $toasts.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
  function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---- Setup phase -----------------------------------------------------
  const $inp    = document.getElementById("player-name-input");
  const $btnAdd = document.getElementById("btn-add-player");
  const $btnStart = document.getElementById("btn-start-local");
  const $helpToggle = document.getElementById("help-toggle-local");

  function renderPlayerList() {
    $list.innerHTML = "";
    players.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "player-item";
      li.innerHTML = `<span class="player-name">${esc(p.name)}</span>
        <button class="btn btn-danger" style="padding:.3rem .6rem;font-size:.75rem" data-idx="${i}">✕</button>`;
      $list.appendChild(li);
    });
    $list.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        players.splice(parseInt(btn.dataset.idx), 1);
        renderPlayerList();
      });
    });
    $btnStart.disabled = players.length < 4;
  }

  function addPlayer() {
    const name = $inp.value.trim();
    if (!name) return;
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return toast("Nombre duplicado.");
    }
    if (players.length >= 12) return toast("Máximo 12 jugadores.");
    players.push({ name, role: "friend", alive: true, clue: "", scores: [], caughtImpostorRounds: [] });
    $inp.value = "";
    $inp.focus();
    renderPlayerList();
  }

  $btnAdd.addEventListener("click", addPlayer);
  $inp.addEventListener("keydown", (e) => { if (e.key === "Enter") addPlayer(); });

  if ($helpToggle) {
    $helpToggle.addEventListener("change", () => {
      impostorHelp = $helpToggle.checked;
    });
  }

  $btnStart.addEventListener("click", () => {
    if (players.length < 4) return;
    startGame();
  });

  // ---- Game logic ------------------------------------------------------
  function startGame() {
    roundNumber = 1;
    players.forEach((p) => { p.alive = true; p.scores = []; p.caughtImpostorRounds = []; });
    setupRound();
  }

  function setupRound() {
    // Pick word
    const cats = Object.keys(WORD_BANK);
    category = pick(cats);
    secretWord = pick(WORD_BANK[category]);

    // Assign roles
    const alive = players.filter((p) => p.alive);
    alive.forEach((p) => { p.role = "friend"; p.clue = ""; });
    const imp = pick(alive);
    imp.role = "impostor";

    currentRevealIdx = 0;
    selectedEliminated = null;
    phase = "reveal";
    $setup.classList.add("hidden");
    $game.classList.remove("hidden");
    render();
  }

  // ---- Render engine ---------------------------------------------------
  function render() {
    let h = "";

    // Round dots
    h += `<div class="round-indicator mt-2">`;
    for (let i = 1; i <= maxRounds; i++) {
      const cls = i < roundNumber ? "completed" : i === roundNumber ? "active" : "";
      h += `<div class="round-dot ${cls}"></div>`;
    }
    h += `<span class="text-muted" style="font-size:.85rem;margin-left:.5rem">Ronda ${roundNumber} / ${maxRounds}</span></div>`;

    switch (phase) {
      case "reveal":  h += renderReveal(); break;
      case "discussion": h += renderDiscussion(); break;
      case "elimination": h += renderElimination(); break;
      case "result":  h += renderResult(); break;
      case "gameover": h += renderGameOver(); break;
    }
    $game.innerHTML = h;
    bindEvents();
  }

  /* -- Reveal --------------------------------------------------------- */
  function renderReveal() {
    const alive = players.filter((p) => p.alive);
    if (currentRevealIdx >= alive.length) {
      // Everyone has seen their role
      phase = "discussion";
      return renderDiscussion();
    }
    const p = alive[currentRevealIdx];
    let h = `<div class="phase-banner">`;
    h += `<div class="mascot-wrapper" style="margin:0 auto .75rem"><span style="font-size:3rem">🤫</span></div>`;
    h += `<h2>Pasa el dispositivo a</h2><p style="font-size:1.4rem;font-weight:900;color:var(--accent)">${esc(p.name)}</p></div>`;
    h += `<div id="reveal-area" class="reveal-btn" data-idx="${currentRevealIdx}">👆 Mantener presionado para ver tu rol</div>`;
    h += `<button id="btn-next-reveal" class="btn btn-primary btn-block mt-2" disabled>Siguiente Jugador ➜</button>`;
    return h;
  }

  /* -- Discussion ----------------------------------------------------- */
  function renderDiscussion() {
    const alive = players.filter((p) => p.alive);
    let h = `<div class="phase-banner">`;
    h += `<div class="mascot-wrapper-sm" style="margin:0 auto .5rem"><span style="font-size:2rem">💬</span></div>`;
    h += `<h2>Discusión en Persona</h2>`;
    h += `<p class="text-muted">Hablen entre ustedes y decidan a quién eliminar.</p></div>`;

    h += `<div class="card mt-2">`;
    h += `<h3 class="mb-1">Jugadores activos (${alive.length})</h3>`;
    h += `<ul class="player-list">`;
    alive.forEach((p) => {
      h += `<li class="player-item"><span class="player-name">${esc(p.name)}</span></li>`;
    });
    h += `</ul>`;
    h += `<button id="btn-go-elimination" class="btn btn-danger btn-block mt-2">🗳️ Registrar Eliminación</button>`;
    h += `</div>`;
    return h;
  }

  /* -- Elimination ---------------------------------------------------- */
  function renderElimination() {
    const alive = players.filter((p) => p.alive);
    let h = `<div class="phase-banner">`;
    h += `<div class="mascot-wrapper-sm" style="margin:0 auto .5rem"><span style="font-size:2rem">🗳️</span></div>`;
    h += `<h2>¿A quién eliminaron?</h2><p class="text-muted">Selecciona al jugador votado por el grupo.</p></div>`;

    h += `<div class="card mt-2"><h3 class="mb-1">Jugador Eliminado</h3><ul class="player-list" id="elimination-list">`;
    alive.forEach((p) => {
      h += `<li class="player-item elimination-option" data-name="${esc(p.name)}">
        <span class="player-name">${esc(p.name)}</span>
        <span class="badge badge-accent" style="opacity:0">✓</span>
      </li>`;
    });
    h += `</ul>`;
    h += `<button id="btn-confirm-impostor" class="btn btn-danger btn-block mt-1" disabled>😈 Confirmar: Era Impostor</button>`;
    h += `<button id="btn-confirm-friend" class="btn btn-primary btn-block mt-1" disabled>🙂 Confirmar: No Era Impostor</button>`;
    h += `<button id="btn-back-discussion" class="btn btn-ghost btn-block mt-1">⬅ Volver a Discusión</button></div>`;
    return h;
  }

  /* -- Resolve -------------------------------------------------------- */
  let lastResult = null;

  function resolveRound(eliminated, eliminatedWasImpostor) {
    const alive = players.filter((p) => p.alive);
    const imp = alive.find((p) => p.role === "impostor") || players.find((p) => p.role === "impostor");
    const impName = imp ? imp.name : "";

    const eliminatedPlayer = players.find((p) => p.name === eliminated);
    if (eliminatedPlayer) eliminatedPlayer.alive = false;

    const impostorSurvived = !eliminatedWasImpostor;

    // Scoring
    alive.forEach((p) => {
      let pts = 0;
      if (p.role === "friend") {
        if (eliminatedWasImpostor) {
          pts += 2;
          p.caughtImpostorRounds.push(true);
        } else {
          p.caughtImpostorRounds.push(false);
        }
      }
      p.scores.push(pts);
    });

    if (imp && imp.alive) imp.scores.push(2);

    let gameOver = false, friendsWin = false, impostorWins = false;

    if (!impostorSurvived) {
      gameOver = true; friendsWin = true;
    } else if (roundNumber >= maxRounds) {
      gameOver = true; impostorWins = true;
    } else if (players.filter((p) => p.alive).length <= 2) {
      gameOver = true; impostorWins = true;
    }

    // Bonus
    if (gameOver) {
      if (friendsWin) {
        players.forEach((p) => {
          if (p.role === "friend" && p.caughtImpostorRounds.length && p.caughtImpostorRounds.every(Boolean)) p.scores.push(10);
        });
      }
      if (impostorWins && imp) imp.scores.push(10);
    }

    lastResult = { eliminated, eliminatedWasImpostor, gameOver, friendsWin, impostorWins, impName };

    if (gameOver) {
      phase = "gameover";
    } else {
      phase = "result";
    }
  }

  function renderResult() {
    const r = lastResult;
    if (!r) return "";
    let h = `<div class="overlay-card" style="margin:2rem auto">`;
    h += `<h2 style="color:var(--danger)">Eliminado: ${esc(r.eliminated)}</h2>`;
    if (r.eliminatedWasImpostor) {
      h += `<p class="mt-1" style="color:var(--success);font-weight:800">¡Era el impostor!</p>`;
    } else {
      h += `<p class="mt-1 text-muted">No era el impostor. La partida continúa.</p>`;
    }
    h += `<button id="btn-next-round" class="btn btn-primary btn-block mt-2">Siguiente Ronda</button>`;
    h += `</div>`;
    return h;
  }

  function renderGameOver() {
    const r = lastResult;
    let h = `<div class="phase-banner">`;
    h += `<div class="scene-illustration" style="margin:0 auto 1rem">`;
    if (r.friendsWin) {
      h += `<span style="font-size:4rem">🎉</span>`;
    } else {
      h += `<span style="font-size:4rem">😈</span>`;
    }
    h += `</div>`;
    h += `<h2>${r.friendsWin ? '<span style="color:var(--success)">¡Los Amigos Ganan!</span>' : '<span style="color:var(--danger)">¡El Impostor Gana!</span>'}</h2>`;
    h += `<p>Palabra: <strong style="color:var(--accent)">${esc(secretWord)}</strong> (${esc(category)})</p>`;
    h += `<p class="text-muted">El impostor era <strong style="color:#fff">${esc(r.impName)}</strong></p></div>`;

    const sorted = [...players].sort((a, b) => b.scores.reduce((s, v) => s + v, 0) - a.scores.reduce((s, v) => s + v, 0));
    h += `<div class="card mb-2"><h3 class="mb-1">Puntuaciones</h3><table class="score-table">
      <thead><tr><th>Jugador</th><th>Rol</th><th>Puntos</th></tr></thead><tbody>`;
    sorted.forEach((p, i) => {
      const crown = i === 0 ? " 👑" : "";
      const total = p.scores.reduce((s, v) => s + v, 0);
      const role = p.role === "impostor" ? '<span class="badge badge-danger">Impostor</span>' : '<span class="badge badge-success">Amigo</span>';
      h += `<tr><td>${esc(p.name)}${crown}</td><td>${role}</td><td style="font-weight:700">${total}</td></tr>`;
    });
    h += `</tbody></table></div>`;
    h += `<button id="btn-local-restart" class="btn btn-primary btn-block mb-1">🔄 Jugar de Nuevo</button>`;
    h += `<button type="button" class="btn btn-ghost btn-block" data-spa-view="menu">🏠 Volver al Inicio</button>`;
    return h;
  }

  // ---- Event binding ---------------------------------------------------
  function bindEvents() {
    // Reveal hold
    const revealArea = document.getElementById("reveal-area");
    if (revealArea) {
      const alive = players.filter((p) => p.alive);
      const idx = parseInt(revealArea.dataset.idx);
      const p = alive[idx];

      const show = () => {
        revealArea.classList.add("holding");
        let info = "";
        if (p.role === "friend") {
          info = `<div class="reveal-content">Amigo<br/><span style="font-size:.9rem;color:var(--text-muted)">Palabra:</span> ${esc(secretWord)}</div>`;
        } else if (impostorHelp) {
          info = `<div class="reveal-content" style="color:var(--warning)">Impostor<br/><span style="font-size:.9rem;color:var(--text-muted)">Categoría:</span> ${esc(category)}</div>`;
        } else {
          info = `<div class="reveal-content" style="color:var(--danger)">Impostor<br/><span style="font-size:.9rem;color:var(--text-muted)">Sin pistas</span></div>`;
        }
        revealArea.innerHTML = info;
        const btn = document.getElementById("btn-next-reveal");
        if (btn) btn.disabled = false;
      };
      const hide = () => {
        revealArea.classList.remove("holding");
        revealArea.innerHTML = "👆 Mantener presionado para ver tu rol";
      };

      revealArea.addEventListener("mousedown", show);
      revealArea.addEventListener("mouseup", hide);
      revealArea.addEventListener("mouseleave", hide);
      revealArea.addEventListener("touchstart", (e) => { e.preventDefault(); show(); });
      revealArea.addEventListener("touchend", hide);
      revealArea.addEventListener("touchcancel", hide);
    }

    // Next reveal
    const btnNext = document.getElementById("btn-next-reveal");
    if (btnNext) {
      btnNext.addEventListener("click", () => {
        currentRevealIdx++;
        render();
      });
    }

    const btnGoElimination = document.getElementById("btn-go-elimination");
    if (btnGoElimination) {
      btnGoElimination.addEventListener("click", () => {
        phase = "elimination";
        selectedEliminated = null;
        render();
      });
    }

    // Elimination
    document.querySelectorAll(".elimination-option").forEach((item) => {
      item.addEventListener("click", () => {
        document.querySelectorAll(".elimination-option").forEach((i) => {
          i.classList.remove("selected");
          i.querySelector(".badge").style.opacity = "0";
        });
        item.classList.add("selected");
        item.querySelector(".badge").style.opacity = "1";
        selectedEliminated = item.dataset.name;
        const btnImp = document.getElementById("btn-confirm-impostor");
        const btnFriend = document.getElementById("btn-confirm-friend");
        if (btnImp) btnImp.disabled = false;
        if (btnFriend) btnFriend.disabled = false;
      });
    });

    const btnConfirmImp = document.getElementById("btn-confirm-impostor");
    if (btnConfirmImp) {
      btnConfirmImp.addEventListener("click", () => {
        if (!selectedEliminated) return;
        resolveRound(selectedEliminated, true);
        selectedEliminated = null;
        render();
      });
    }

    const btnConfirmFriend = document.getElementById("btn-confirm-friend");
    if (btnConfirmFriend) {
      btnConfirmFriend.addEventListener("click", () => {
        if (!selectedEliminated) return;
        resolveRound(selectedEliminated, false);
        selectedEliminated = null;
        render();
      });
    }

    const btnBackDiscussion = document.getElementById("btn-back-discussion");
    if (btnBackDiscussion) {
      btnBackDiscussion.addEventListener("click", () => {
        phase = "discussion";
        selectedEliminated = null;
        render();
      });
    }

    // Next round
    const btnNextRound = document.getElementById("btn-next-round");
    if (btnNextRound) {
      btnNextRound.addEventListener("click", () => {
        roundNumber++;
        setupRound();
      });
    }

    const btnRestart = document.getElementById("btn-local-restart");
    if (btnRestart) {
      btnRestart.addEventListener("click", () => {
        players.forEach((p) => {
          p.role = "friend";
          p.alive = true;
          p.clue = "";
          p.scores = [];
          p.caughtImpostorRounds = [];
        });
        phase = "setup";
        roundNumber = 0;
        currentRevealIdx = 0;
        selectedEliminated = null;
        $game.classList.add("hidden");
        $setup.classList.remove("hidden");
        renderPlayerList();
      });
    }
  }
})();
