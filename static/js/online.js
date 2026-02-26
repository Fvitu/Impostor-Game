/* =======================================================================
   El Impostor – Online Multiplayer (SocketIO) client
   ======================================================================= */
(function () {
  "use strict";

  // ---- Globals --------------------------------------------------------
  const socket = io({ reconnection: true, reconnectionAttempts: 10 });
  let myName = "";
  let roomCode = "";
  let currentState = null;
  let roleRevealed = false;

  // ---- DOM refs -------------------------------------------------------
  const $lobbyOpts   = document.getElementById("lobby-options");
  const $roomView    = document.getElementById("room-view");
  const $toasts      = document.getElementById("toasts");

  // ---- Helpers --------------------------------------------------------
  function toast(msg, type = "error") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $toasts.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  async function api(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "No se pudo completar la operación.");
    }
    return data;
  }

  // ---- Toggle helper --------------------------------------------------
  document.querySelectorAll(".toggle").forEach((t) => {
    t.addEventListener("click", () => {
      const on = t.classList.toggle("active");
      t.setAttribute("aria-checked", on);
    });
    t.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); t.click(); }
    });
  });

  // ---- Tab navigation -------------------------------------------------
  document.querySelectorAll(".tab-nav .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab-nav .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      if (target === "create") {
        const c = document.getElementById("tab-create");
        const j = document.getElementById("tab-join");
        if (c) c.classList.remove("hidden");
        if (j) j.classList.add("hidden");
      } else {
        const c = document.getElementById("tab-create");
        const j = document.getElementById("tab-join");
        if (c) c.classList.add("hidden");
        if (j) j.classList.remove("hidden");
      }
    });
  });

  // ---- Handle direct room URL -----------------------------------------
  (function checkDirectJoin() {
    const rv = document.querySelector("#room-view[data-code]");
    if (rv && rv.dataset.code && rv.dataset.name) {
      roomCode = rv.dataset.code;
      myName = rv.dataset.name;
      if ($lobbyOpts) $lobbyOpts.classList.add("hidden");
      $roomView.classList.remove("hidden");
      socket.emit("reconnect_room", { code: roomCode, name: myName });
    }
  })();

  // ---- Lobby buttons --------------------------------------------------
  const btnCreate = document.getElementById("btn-create");
  const btnJoin = document.getElementById("btn-join");

  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      const name = document.getElementById("host-name").value.trim();
      if (!name) return toast("Escribe tu nombre.");
      const helpOn = document.getElementById("help-toggle").classList.contains("active");
      myName = name;
      try {
        const data = await api("/api/online/create", { name, impostor_help: helpOn });
        roomCode = data.code;
        if ($lobbyOpts) $lobbyOpts.classList.add("hidden");
        if ($roomView) $roomView.classList.remove("hidden");
        socket.emit("reconnect_room", { code: roomCode, name: myName });
      } catch (error) {
        toast(error.message || "No se pudo crear la sala.");
      }
    });
  }

  if (btnJoin) {
    btnJoin.addEventListener("click", async () => {
      const name = document.getElementById("join-name").value.trim();
      const code = document.getElementById("join-code").value.trim().toUpperCase();
      if (!name || !code) return toast("Nombre y código son necesarios.");
      myName = name;
      try {
        const data = await api("/api/online/join", { code, name });
        roomCode = data.code;
        if ($lobbyOpts) $lobbyOpts.classList.add("hidden");
        if ($roomView) $roomView.classList.remove("hidden");
        socket.emit("reconnect_room", { code: roomCode, name: myName });
      } catch (error) {
        toast(error.message || "No se pudo unir a la sala.");
      }
    });
  }

  // ---- Socket events --------------------------------------------------
  socket.on("error", (data) => toast(data.msg));

  socket.on("player_disconnected", (data) => {
    toast(`${data.name} se desconectó`, "error");
  });

  socket.on("state_update", (state) => {
    currentState = state;
    renderRoom(state);
  });

  socket.on("round_result", (result) => {
    showResultOverlay(result);
  });

  socket.on("room_deleted", (data) => {
    const code = data && data.code ? data.code : roomCode;
    toast(`La sala ${code} fue eliminada.`, "success");
    roomCode = "";
    currentState = null;
    if ($roomView) {
      $roomView.classList.add("hidden");
      $roomView.innerHTML = "";
    }
    if ($lobbyOpts) $lobbyOpts.classList.remove("hidden");
    if (window.SPA && typeof window.SPA.showView === "function") {
      window.SPA.showView("menu", true);
    }
  });

  // ---- Renderers ------------------------------------------------------
  function renderRoom(s) {
    const isHost = myName === s.host;
    const me = s.players.find((p) => p.name === myName);
    let html = "";

    // Header
    html += `<div class="flex items-center room-topbar" style="justify-content:space-between;margin-bottom:.5rem">
      <button type="button" class="back-link back-btn" data-spa-view="menu"><span class="arrow">&larr;</span> Inicio</button>
      <div class="room-code-display" style="font-size:1rem;padding:.3rem .8rem">${s.room_code}</div>
      ${isHost ? '<button id="btn-delete-room" class="btn btn-danger" style="padding:.6rem 1rem;font-size:.8rem">🗑️ Eliminar Sala</button>' : '<div></div>'}
    </div>`;

    // Round indicator
    if (s.round_number > 0) {
      html += `<div class="round-indicator mt-2">`;
      for (let i = 1; i <= s.max_rounds; i++) {
        const cls = i < s.round_number ? "completed" : i === s.round_number ? "active" : "";
        html += `<div class="round-dot ${cls}"></div>`;
      }
      html += `<span class="text-muted" style="font-size:.85rem;margin-left:.5rem">Ronda ${s.round_number} / ${s.max_rounds}</span></div>`;
    }

    switch (s.phase) {
      case "lobby":
        html += renderLobby(s, isHost);
        break;
      case "roles":
        html += renderRoles(s, me);
        break;
      case "clues":
        html += renderClues(s, me);
        break;
      case "voting":
        html += renderVoting(s, me);
        break;
      case "resolution":
        html += `<div class="phase-banner"><h2>Calculando resultados…</h2></div>`;
        break;
      case "game_over":
        html += renderGameOver(s);
        break;
    }

    $roomView.innerHTML = html;
    bindDynamicEvents(s);
  }

  /* -- Lobby ---------------------------------------------------------- */
  function renderLobby(s, isHost) {
    let h = `<div class="phase-banner">`;
    h += `<div class="illustration-row" style="margin:0 0 .75rem">`;
    // Waiting character placeholders
    s.players.forEach(() => {
      h += `<div class="mascot-wrapper-sm"><span style="font-size:1.8rem">😊</span></div>`;
    });
    h += `</div>`;
    h += `<h2>Sala de Espera</h2>`;
    h += `<p class="text-muted">Comparte el código con tus amigos</p>`;
    h += `<div class="room-code-display" style="margin-top:.75rem">${s.room_code}</div>`;
    h += `</div>`;
    h += `<div class="card mb-2"><h3 class="mb-1">👥 Jugadores (${s.players.length})</h3><ul class="player-list">`;
    s.players.forEach((p) => {
      const hostBadge = p.name === s.host ? ' <span class="badge badge-warning" style="font-size:.65rem">👑 HOST</span>' : '';
      h += `<li class="player-item"><span class="player-name">${esc(p.name)}${hostBadge}</span></li>`;
    });
    h += `</ul></div>`;
    if (isHost) {
      const canStart = s.players.length >= 4;
      h += `<button id="btn-start-game" class="btn btn-primary btn-block btn-lg btn-bounce" ${canStart ? '' : 'disabled'}>
        🎮 Iniciar Partida ${canStart ? '' : '(mín. 4)'}
      </button>`;
    } else {
      h += `<div class="text-center mt-2"><div class="mascot-wrapper-sm pulse-glow" style="margin:0 auto .5rem"><span style="font-size:2rem">⏳</span></div><p class="text-muted" style="font-weight:700">Esperando a que el anfitrión inicie…</p></div>`;
    }
    return h;
  }

  /* -- Roles ---------------------------------------------------------- */
  function renderRoles(s, me) {
    roleRevealed = false;
    let h = `<div class="phase-banner">`;
    h += `<div class="mascot-wrapper" style="margin:0 auto .75rem"><span style="font-size:3rem">🤫</span></div>`;
    h += `<h2>Tu Rol</h2><p class="text-muted">Mantén presionado para ver tu rol. ¡No lo muestres a nadie!</p></div>`;
    h += `<div id="reveal-area" class="reveal-btn">👆 Mantener presionado para ver</div>`;
    h += `<button id="btn-role-ready" class="btn btn-primary btn-block mt-2">✅ Listo</button>`;
    return h;
  }

  /* -- Clues ---------------------------------------------------------- */
  function renderClues(s, me) {
    const currentTurn = s.clue_order[s.current_clue_index] || null;
    const isMyTurn = currentTurn === myName;
    let h = `<div class="phase-banner">`;
    h += `<div class="mascot-wrapper-sm" style="margin:0 auto .5rem"><span style="font-size:2rem">💬</span></div>`;
    h += `<h2>Fase de Pistas</h2>`;
    if (s.secret_word) {
      h += `<p>Palabra: <strong style="color:var(--accent)">${esc(s.secret_word)}</strong></p>`;
    } else if (s.category) {
      h += `<p>Categoría: <strong style="color:var(--warning)">${esc(s.category)}</strong></p>`;
    } else {
      h += `<p class="text-muted" style="font-weight:700">No conoces la palabra. ¡Improvisa!</p>`;
    }
    h += `</div>`;

    // Submitted clues
    const clued = s.players.filter((p) => p.clue);
    if (clued.length) {
      h += `<div class="mb-2">`;
      clued.forEach((p) => {
        h += `<div class="clue-bubble"><div class="author">${esc(p.name)}</div><div class="text">${esc(p.clue)}</div></div>`;
      });
      h += `</div>`;
    }

    if (currentTurn) {
      h += `<p class="text-center mb-1" style="font-size:1rem;font-weight:700">Turno de: <strong style="color:var(--accent)">${esc(currentTurn)}</strong></p>`;
    }

    if (isMyTurn && me && me.alive && !me.clue) {
      h += `<div class="card"><div class="input-group mb-1"><label>Tu pista</label>
        <input id="clue-input" class="input" placeholder="Escribe tu pista…" maxlength="120" /></div>
        <button id="btn-submit-clue" class="btn btn-primary btn-block">✏️ Enviar Pista</button></div>`;
    } else if (!isMyTurn) {
      h += `<div class="text-center mt-2"><div class="mascot-wrapper-sm pulse-glow" style="margin:0 auto .5rem"><span style="font-size:2rem">⏳</span></div><p class="text-muted" style="font-weight:700">Esperando…</p></div>`;
    }
    return h;
  }

  /* -- Voting --------------------------------------------------------- */
  function renderVoting(s, me) {
    const hasVoted = me && me.alive && s.players.find((p) => p.name === myName);
    let h = `<div class="phase-banner">`;
    h += `<div class="mascot-wrapper-sm" style="margin:0 auto .5rem"><span style="font-size:2rem">🗳️</span></div>`;
    h += `<h2>Votación</h2><p class="text-muted">¿Quién es el impostor?</p></div>`;

    // Show all clues
    const clued = s.players.filter((p) => p.clue);
    if (clued.length) {
      h += `<div class="mb-2">`;
      clued.forEach((p) => {
        h += `<div class="clue-bubble"><div class="author">${esc(p.name)}</div><div class="text">${esc(p.clue)}</div></div>`;
      });
      h += `</div>`;
    }

    h += `<div class="card mb-2"><h3 class="mb-1">🔍 Vota</h3><ul class="player-list" id="vote-list">`;
    s.players.filter((p) => p.alive && p.name !== myName).forEach((p) => {
      h += `<li class="player-item vote-option" data-name="${esc(p.name)}">
        <span class="player-name">${esc(p.name)}</span>
        <span class="badge badge-accent" style="opacity:0">✓</span>
      </li>`;
    });
    h += `</ul></div>`;
    h += `<button id="btn-confirm-vote" class="btn btn-danger btn-block btn-lg" disabled>⚡ Confirmar Voto</button>`;
    return h;
  }

  /* -- Game Over ------------------------------------------------------ */
  function renderGameOver(s) {
    let h = `<div class="phase-banner">`;
    h += `<div class="scene-illustration" style="margin:0 auto 1rem"><span style="font-size:4rem">🏆</span></div>`;
    h += `<h2>Fin de la Partida</h2>`;
    h += `<p>Palabra secreta: <strong style="color:var(--accent)">${esc(s.secret_word)}</strong> (${esc(s.category)})</p></div>`;

    // Scoreboard
    const sorted = [...s.players].sort((a, b) => b.total_score - a.total_score);
    h += `<div class="card mb-2"><h3 class="mb-1">🏅 Puntuaciones</h3><table class="score-table">
      <thead><tr><th>Jugador</th><th>Rol</th><th>Puntos</th></tr></thead><tbody>`;
    sorted.forEach((p, i) => {
      const crown = i === 0 ? ' 👑' : '';
      const role = p.role === 'impostor' ? '<span class="badge badge-danger">Impostor</span>' : '<span class="badge badge-success">Amigo</span>';
      h += `<tr><td>${esc(p.name)}${crown}</td><td>${role}</td><td style="font-weight:900;color:var(--accent)">${p.total_score}</td></tr>`;
    });
    h += `</tbody></table></div>`;
    h += `<button type="button" class="btn btn-primary btn-block btn-lg" data-spa-view="menu">🏠 Volver al Inicio</button>`;
    return h;
  }

  // ---- Result overlay -------------------------------------------------
  function showResultOverlay(r) {
    // Remove existing overlay
    const existing = document.querySelector(".overlay");
    if (existing) existing.remove();

    const overlay = el("div", "overlay");
    const card = el("div", "overlay-card");

    let inner = '';
    // Scene illustration placeholder
    inner += '<div class="scene-illustration" style="margin:0 auto 1rem;max-width:200px;height:140px">';
    if (r.game_over) {
      if (r.friends_win) {
        inner += '<span style="font-size:3.5rem">🎉</span>';
      } else {
        inner += '<span style="font-size:3.5rem">😈</span>';
      }
    } else {
      if (r.tie) {
        inner += '<span style="font-size:3.5rem">⚖️</span>';
      } else {
        inner += '<span style="font-size:3.5rem">🚪</span>';
      }
    }
    inner += '</div>';

    if (r.game_over) {
      if (r.friends_win) {
        inner += `<h2 style="color:var(--success)">¡Los Amigos Ganan!</h2>`;
        inner += `<p class="mt-1">El impostor era <strong style="color:#fff">${esc(r.impostor_name)}</strong></p>`;
      } else {
        inner += `<h2 style="color:var(--danger)">¡El Impostor Gana!</h2>`;
        inner += `<p class="mt-1"><strong style="color:#fff">${esc(r.impostor_name)}</strong> sobrevivió</p>`;
      }
    } else {
      if (r.tie) {
        inner += `<h2 style="color:var(--warning)">¡Empate!</h2>`;
        inner += `<p class="mt-1">Nadie fue eliminado. El impostor sobrevive esta ronda.</p>`;
      } else {
        inner += `<h2 style="color:var(--danger)">Eliminado: ${esc(r.eliminated)}</h2>`;
        inner += `<p class="mt-1 text-muted">El juego continúa a la ronda ${r.round_number}…</p>`;
      }
    }

    // Vote tally
    if (r.vote_counts && Object.keys(r.vote_counts).length) {
      const maxV = Math.max(...Object.values(r.vote_counts));
      inner += `<div class="mt-2" style="text-align:left">`;
      for (const [name, cnt] of Object.entries(r.vote_counts)) {
        const pct = maxV ? Math.round((cnt / maxV) * 100) : 0;
        inner += `<div style="margin-bottom:.5rem"><span style="font-weight:600">${esc(name)}</span> <span class="text-muted">(${cnt})</span>
          <div class="vote-bar-wrap"><div class="vote-bar"><div class="vote-bar-fill" style="width:${pct}%"></div></div></div></div>`;
      }
      inner += `</div>`;
    }

    inner += `<button class="btn btn-primary btn-block mt-2" id="btn-dismiss-result">▶ Continuar</button>`;
    card.innerHTML = inner;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById("btn-dismiss-result").addEventListener("click", () => {
      overlay.remove();
      if (!r.game_over) {
        socket.emit("next_round_ready", { code: roomCode });
        socket.emit("players_ready", { code: roomCode });
      }
    });
  }

  // ---- Dynamic event binding ----------------------------------------
  function bindDynamicEvents(s) {
    // Start game
    const btnStart = document.getElementById("btn-start-game");
    if (btnStart) {
      btnStart.addEventListener("click", () => socket.emit("start_game", { code: roomCode }));
    }

    const btnDeleteRoom = document.getElementById("btn-delete-room");
    if (btnDeleteRoom) {
      btnDeleteRoom.addEventListener("click", () => {
        const confirmed = window.confirm("¿Seguro que quieres eliminar la sala para todos?");
        if (!confirmed) return;
        socket.emit("delete_room", { code: roomCode });
      });
    }

    // Role reveal (hold to view)
    const revealArea = document.getElementById("reveal-area");
    if (revealArea) {
      const me = s.players.find((p) => p.name === myName);
      let holdTimer = null;

      const showRole = () => {
        revealArea.classList.add("holding");
        let info = "";
        if (s.secret_word) {
          info = `<div class="reveal-content">Amigo<br/><span style="font-size:.9rem;color:var(--text-muted)">Palabra:</span> ${esc(s.secret_word)}</div>`;
        } else if (s.category) {
          info = `<div class="reveal-content" style="color:var(--warning)">Impostor<br/><span style="font-size:.9rem;color:var(--text-muted)">Categoría:</span> ${esc(s.category)}</div>`;
        } else {
          info = `<div class="reveal-content" style="color:var(--danger)">Impostor<br/><span style="font-size:.9rem;color:var(--text-muted)">Sin pistas</span></div>`;
        }
        revealArea.innerHTML = info;
      };
      const hideRole = () => {
        clearTimeout(holdTimer);
        revealArea.classList.remove("holding");
        revealArea.innerHTML = "👆 Mantener presionado para ver";
      };

      revealArea.addEventListener("mousedown", showRole);
      revealArea.addEventListener("mouseup", hideRole);
      revealArea.addEventListener("mouseleave", hideRole);
      revealArea.addEventListener("touchstart", (e) => { e.preventDefault(); showRole(); });
      revealArea.addEventListener("touchend", hideRole);
      revealArea.addEventListener("touchcancel", hideRole);
    }

    // Ready button
    const btnReady = document.getElementById("btn-role-ready");
    if (btnReady) {
      btnReady.addEventListener("click", () => {
        socket.emit("players_ready", { code: roomCode });
      });
    }

    // Submit clue
    const btnClue = document.getElementById("btn-submit-clue");
    if (btnClue) {
      btnClue.addEventListener("click", () => {
        const inp = document.getElementById("clue-input");
        const clue = inp ? inp.value.trim() : "";
        if (!clue) return toast("Escribe una pista.");
        socket.emit("submit_clue", { code: roomCode, name: myName, clue });
      });
    }

    // Voting
    let selectedVote = null;
    document.querySelectorAll(".vote-option").forEach((item) => {
      item.addEventListener("click", () => {
        document.querySelectorAll(".vote-option").forEach((i) => {
          i.classList.remove("selected");
          i.querySelector(".badge").style.opacity = "0";
        });
        item.classList.add("selected");
        item.querySelector(".badge").style.opacity = "1";
        selectedVote = item.dataset.name;
        const btn = document.getElementById("btn-confirm-vote");
        if (btn) btn.disabled = false;
      });
    });

    const btnVote = document.getElementById("btn-confirm-vote");
    if (btnVote) {
      btnVote.addEventListener("click", () => {
        if (!selectedVote) return;
        socket.emit("cast_vote", { code: roomCode, voter: myName, target: selectedVote });
        btnVote.disabled = true;
        btnVote.textContent = "Voto enviado ✓";
        document.querySelectorAll(".vote-option").forEach((i) => (i.style.pointerEvents = "none"));
      });
    }
  }

  // ---- Escape HTML ----------------------------------------------------
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }
})();
