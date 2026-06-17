import {
  applyUpgrade,
  createNewGame,
  deserializeState,
  endHeroAttack,
  finishTurn,
  getAdjacentMonsterIds,
  getExpectedAction,
  getNearestMonsterId,
  getPaladinReachable,
  getPhaseLabel,
  heroAttackMonster,
  inspectCell,
  movePaladin,
  PHASES,
  previewHeroAttack,
  resolveMonsterTurn,
  resolvePendingChestChoice,
  resolveSquireMove,
  rollForTurn,
  serializeState,
  setSquireCommand,
  TURN_FLOW,
  useItem,
} from "./gameState.js";

const SAVE_KEY = "hexacumba-save-v2";
const app = document.querySelector("#app");

let state = null;
const ui = {
  commandType: "follow",
  commandMonsterId: null,
  attackTargetId: null,
  attackSource: "paladin",
  attackPreference: "paladin-first",
  selectedCell: null,
};

function localLog(message) {
  if (!state) return;
  state.lastMessage = message;
  state.log = [message, ...(state.log ?? [])].slice(0, 80);
}

function loadSavedState() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return null;

  try {
    return deserializeState(saved);
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

function normalizeSelections() {
  if (!state) return;

  const boardKeys = new Set(state.board.cells.map((cell) => cell.key));
  if (!ui.selectedCell || !boardKeys.has(ui.selectedCell)) {
    ui.selectedCell = state.heroes.paladin.position;
  }

  if (!ui.commandMonsterId || !state.monsters.some((monster) => monster.id === ui.commandMonsterId)) {
    ui.commandMonsterId = getNearestMonsterId(state, state.heroes.paladin.position);
  }

  const adjacent = Array.from(getAdjacentMonsterIds(state));
  if (!adjacent.includes(ui.attackTargetId)) {
    ui.attackTargetId = adjacent[0] ?? state.monsters[0]?.id ?? null;
  }

  if (ui.attackSource === "combined" && !heroesAdjacent()) {
    ui.attackSource = "paladin";
  }
}

function heroesAdjacent() {
  if (!state) return false;
  const paladin = state.heroes.paladin.position;
  const squire = state.heroes.squire.position;
  if (!paladin || !squire) return false;
  const [pq, pr] = paladin.split(",").map(Number);
  const [sq, sr] = squire.split(",").map(Number);
  const ds = -pq - pr - (-sq - sr);
  return (Math.abs(pq - sq) + Math.abs(pr - sr) + Math.abs(ds)) / 2 === 1;
}

function saveGame() {
  if (!state) return;
  localStorage.setItem(SAVE_KEY, serializeState(state));
  localLog("Partida guardada en este navegador.");
  render();
}

function deleteSavedGame() {
  localStorage.removeItem(SAVE_KEY);
  if (state) localLog("Partida guardada borrada.");
  render();
}

function startNewGame() {
  const form = document.querySelector("#setup-form");
  const data = new FormData(form);
  state = createNewGame({
    cursedChests: data.get("cursedChests") === "on",
    paladinAvatar: data.get("paladinAvatar") || "macho",
    squireAvatar: data.get("squireAvatar") || "macho",
  });
  ui.selectedCell = state.heroes.paladin.position;
  normalizeSelections();
  render();
}

function continueGame() {
  const loaded = loadSavedState();
  if (!loaded) return;
  state = loaded;
  normalizeSelections();
  render();
}

function render() {
  normalizeSelections();
  app.innerHTML = state ? renderGame() : renderSetup();
}

function renderSetup() {
  const hasSave = Boolean(localStorage.getItem(SAVE_KEY));
  return `
    <main class="app-shell setup-shell">
      <section class="title-panel">
        <p class="eyebrow">Dungeon crawler tactico minimalista</p>
        <h1>Hexacumba</h1>
        <p class="subtitle">Paladin felino, Escudero canino AI, doce rondas bajo tierra.</p>
      </section>
      <form id="setup-form" class="setup-grid">
        <fieldset>
          <legend>Paladin</legend>
          <label><input type="radio" name="paladinAvatar" value="macho" checked> Gato macho</label>
          <label><input type="radio" name="paladinAvatar" value="hembra"> Gata hembra</label>
        </fieldset>
        <fieldset>
          <legend>Escudero</legend>
          <label><input type="radio" name="squireAvatar" value="macho" checked> Perro macho</label>
          <label><input type="radio" name="squireAvatar" value="hembra"> Perra hembra</label>
        </fieldset>
        <fieldset>
          <legend>Modo</legend>
          <label class="toggle-line"><input type="checkbox" name="cursedChests"> Cofres malditos</label>
        </fieldset>
        <div class="setup-actions">
          <button type="button" class="primary" data-action="new-game">Nueva partida</button>
          <button type="button" data-action="continue" ${hasSave ? "" : "disabled"}>Continuar partida</button>
          <button type="button" data-action="delete-save" ${hasSave ? "" : "disabled"}>Borrar guardado</button>
        </div>
      </form>
    </main>
  `;
}

function renderGame() {
  return `
    <main class="app-shell game-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Hexacumba</p>
          <h1>Paladin y Escudero</h1>
        </div>
        <div class="status-strip">
          <span>Ronda ${state.round}/12</span>
          <span>Nivel ${state.level}</span>
          <span>${getPhaseLabel(state.phase)}</span>
        </div>
        <div class="top-actions">
          <button type="button" data-action="reset">Nueva partida</button>
          <button type="button" data-action="save">Guardar partida</button>
          <button type="button" data-action="continue" ${localStorage.getItem(SAVE_KEY) ? "" : "disabled"}>Continuar partida</button>
          <button type="button" data-action="delete-save" ${localStorage.getItem(SAVE_KEY) ? "" : "disabled"}>Borrar guardado</button>
        </div>
      </header>
      ${renderPhaseRail()}
      <section class="main-grid">
        <aside class="side-panel">
          ${renderHeroCard("paladin")}
          ${renderHeroCard("squire")}
          ${renderSelectionPanel()}
        </aside>
        <section class="board-panel">
          ${renderBoard()}
        </section>
        <aside class="side-panel">
          ${renderControls()}
          ${renderSquireAiPanel()}
          ${renderMonsterList()}
          ${renderLog()}
        </aside>
      </section>
    </main>
  `;
}

function renderPhaseRail() {
  const currentIndex = TURN_FLOW.indexOf(state.phase);
  const labels = TURN_FLOW.map((phase, index) => {
    const className =
      phase === state.phase
        ? "current"
        : currentIndex > index || (currentIndex === -1 && state.phase !== PHASES.ROUND_COMPLETE)
          ? "done"
          : "";
    return `<span class="${className}">${getPhaseLabel(phase)}</span>`;
  }).join("");

  return `
    <section class="phase-panel">
      <div class="phase-rail">${labels}</div>
      <p>${getExpectedAction(state)}</p>
      ${state.lastMessage ? `<strong>${state.lastMessage}</strong>` : ""}
    </section>
  `;
}

function renderHeroCard(heroId) {
  const hero = state.heroes[heroId];
  const dice = state.dice?.[heroId] ?? { mobility: 0, attack: 0, defense: 0 };
  const available = state.available[heroId];
  const avatarLabel =
    heroId === "paladin"
      ? hero.avatar === "hembra"
        ? "Gata"
        : "Gato"
      : hero.avatar === "hembra"
        ? "Perra"
        : "Perro";

  return `
    <section class="panel hero-panel ${heroId}" data-select-cell="${hero.position}">
      <div class="panel-title">
        ${tokenSvg(heroId, heroId === "paladin" ? "P" : "E")}
        <div>
          <h2>${hero.name}</h2>
          <p>${avatarLabel} | ${hero.vitality > 0 ? "Activo" : "Fuera de combate"}</p>
        </div>
      </div>
      <div class="vitality" aria-label="Vitalidad">${renderHearts(hero.vitality, hero.maxVitality)}</div>
      <div class="stat-grid">
        <span>Mov ${hero.stats.mobility}</span>
        <span>Ata ${hero.stats.attack}</span>
        <span>Def ${hero.stats.defense}</span>
      </div>
      <div class="dice-grid">
        <span>Dado M ${dice.mobility}</span>
        <span>Dado A ${dice.attack}</span>
        <span>Dado D ${dice.defense}</span>
      </div>
      <div class="available-grid">
        <strong>${available.mobility}</strong><span>mov</span>
        <strong>${available.attack}</strong><span>ata</span>
        <strong>${available.defense}</strong><span>def</span>
      </div>
      <div class="inventory">
        <h3>Inventario ${hero.inventory.length}/${hero.inventoryCapacity}</h3>
        ${
          hero.inventory.length
            ? hero.inventory
                .map(
                  (item, index) => `
                    <button type="button" class="item-button" data-use-item-index="${index}" data-hero="${heroId}" title="${item.description}">
                      ${item.name}
                    </button>
                  `,
                )
                .join("")
            : "<p class=\"empty-text\">Sin objetos</p>"
        }
      </div>
    </section>
  `;
}

function renderHearts(vitality, maxVitality) {
  return Array.from({ length: maxVitality }, (_, index) =>
    `<span class="${index < vitality ? "heart full" : "heart"}"></span>`,
  ).join("");
}

function renderBoard() {
  const { board } = state;
  const side = board.side;
  const size = getHexSize(side);
  const hexWidth = size * 2;
  const hexHeight = Math.sqrt(3) * size;
  const points = board.cells.map((cell) => ({
    ...cell,
    x: size * 1.5 * cell.q,
    y: hexHeight * (cell.r + cell.q / 2),
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = 14;
  const reachable = state.phase === PHASES.MOVE
    ? new Set(getPaladinReachable(state).map((entry) => entry.key))
    : new Set();
  const attackable = state.phase === PHASES.ATTACK
    ? new Set(
        state.monsters
          .filter((monster) => getAdjacentMonsterIds(state).has(monster.id))
          .map((monster) => monster.position),
      )
    : new Set();

  const cells = points
    .map((cell) => {
      const wall = board.walls.includes(cell.key);
      const chest = state.chests.find((entry) => entry.position === cell.key && !entry.opened);
      const monster = state.monsters.find((entry) => entry.position === cell.key);
      const hero = Object.values(state.heroes).find((entry) => entry.position === cell.key);
      const isStairs = board.stairs === cell.key;
      const selected = ui.selectedCell === cell.key;
      const classes = [
        "hex-cell",
        wall ? "wall" : "",
        isStairs ? "stairs" : "",
        isStairs && state.phase === PHASES.STAIRS ? "stairs-active" : "",
        chest ? "chest-cell" : "",
        monster ? "monster-cell" : "",
        hero?.id === "paladin" ? "paladin-cell" : "",
        hero?.id === "squire" ? "squire-cell" : "",
        reachable.has(cell.key) ? "reachable selectable" : "",
        attackable.has(cell.key) ? "attackable selectable" : "",
        selected ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <button
          type="button"
          class="${classes}"
          data-cell="${cell.key}"
          title="${renderCellTitle(cell.key)}"
          style="left:${cell.x - minX + padding}px;top:${cell.y - minY + padding}px;width:${hexWidth}px;height:${hexHeight}px;"
        >
          ${wall ? "<span class=\"wall-mark\">##</span>" : ""}
          ${isStairs && !wall ? tokenSvg("stairs", "S") : ""}
          ${chest && !wall ? tokenSvg("chest", "C") : ""}
          ${monster && !wall ? tokenSvg("monster", monster.marker) : ""}
          ${hero && !wall ? tokenSvg(hero.id, hero.id === "paladin" ? "P" : "E") : ""}
        </button>
      `;
    })
    .join("");

  return `
    <div class="board-wrap">
      <div class="hex-board" style="width:${maxX - minX + hexWidth + padding * 2}px;height:${maxY - minY + hexHeight + padding * 2}px;">
        ${cells}
      </div>
    </div>
  `;
}

function getHexSize(side) {
  const width = window.innerWidth;
  if (width < 560) return side >= 6 ? 18 : side >= 5 ? 21 : 24;
  if (width < 980) return side >= 6 ? 22 : side >= 5 ? 26 : 30;
  return side >= 6 ? 27 : side >= 5 ? 31 : 36;
}

function renderCellTitle(key) {
  const info = inspectCell(state, key);
  return `${info.name} | ${info.type} | ${info.state}`;
}

function tokenSvg(kind, label) {
  return `
    <svg class="token ${kind}" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="18"></circle>
      <path d="M24 8 L38 18 L34 38 L14 38 L10 18 Z"></path>
      <text x="24" y="29" text-anchor="middle">${label}</text>
    </svg>
  `;
}

function renderSelectionPanel() {
  const info = inspectCell(state, ui.selectedCell);
  const statRows =
    info.kind === "hero" || info.kind === "monster"
      ? `
        <div class="inspect-stats">
          <span>PV <strong>${info.vitality}/${info.maxVitality}</strong></span>
          <span>Mov <strong>${info.mobility}</strong></span>
          <span>Ata <strong>${info.attack}</strong></span>
          <span>Def <strong>${info.defense}</strong></span>
        </div>
      `
      : "";

  return `
    <section class="panel inspect-panel ${info.kind}">
      <h2>Casilla seleccionada</h2>
      <p class="inspect-key">${info.key}</p>
      <strong>${info.name}</strong>
      <span>${info.type}</span>
      ${statRows}
      <p>${info.state}</p>
    </section>
  `;
}

function renderControls() {
  if (state.pendingChestChoice) return renderPendingChestChoice();

  if (state.phase === PHASES.VICTORY || state.phase === PHASES.DEFEAT) {
    return renderTerminalPanel();
  }

  if (state.phase === PHASES.ROLL) {
    return `
      <section class="panel control-panel">
        <h2>Tirada</h2>
        <p>Prepara los dados del Paladin y del Escudero.</p>
        <button type="button" class="primary" data-action="roll">Tirar dados</button>
      </section>
    `;
  }

  if (state.phase === PHASES.COMMAND) {
    return `
      <section class="panel control-panel">
        <h2>Orden al Escudero</h2>
        <label>Orden
          <select data-bind="commandType">
            <option value="approach" ${ui.commandType === "approach" ? "selected" : ""}>Acercate al monstruo</option>
            <option value="follow" ${ui.commandType === "follow" ? "selected" : ""}>Quedate cerca de mi</option>
            <option value="stay" ${ui.commandType === "stay" ? "selected" : ""}>No te muevas</option>
          </select>
        </label>
        <label>Objetivo
          <select data-bind="commandMonsterId" ${ui.commandType === "approach" ? "" : "disabled"}>
            ${state.monsters.map((monster) => monsterOption(monster, ui.commandMonsterId)).join("")}
          </select>
        </label>
        <button type="button" class="primary" data-action="confirm-command">Confirmar orden</button>
      </section>
    `;
  }

  if (state.phase === PHASES.MOVE) {
    return `
      <section class="panel control-panel">
        <h2>Movimiento del Paladin</h2>
        <p>Casillas verdes: movilidad actual ${state.available.paladin.mobility}.</p>
        <button type="button" data-cell="${state.heroes.paladin.position}">Quedarse aqui</button>
      </section>
    `;
  }

  if (state.phase === PHASES.SQUIRE_MOVE) {
    return `
      <section class="panel control-panel">
        <h2>Movimiento del Escudero</h2>
        <p>Orden actual: ${state.command.type}. Obedece con 75% de probabilidad.</p>
        <button type="button" class="primary" data-action="resolve-squire">Resolver Escudero</button>
      </section>
    `;
  }

  if (state.phase === PHASES.ATTACK) {
    return renderAttackControls();
  }

  if (state.phase === PHASES.MONSTER_TURN) {
    return `
      <section class="panel control-panel">
        <h2>Turno de monstruos</h2>
        <p>Resolveran movimiento, objetivo y ataque.</p>
        <button type="button" class="primary" data-action="resolve-monsters">Resolver monstruos</button>
      </section>
    `;
  }

  if (state.phase === PHASES.END_TURN) {
    return `
      <section class="panel control-panel">
        <h2>Fin de turno</h2>
        <p>Turnos jugados: ${state.stats.turnsPlayed}</p>
        <button type="button" class="primary" data-action="finish-turn">Nueva tirada</button>
      </section>
    `;
  }

  if (state.phase === PHASES.STAIRS) {
    return `
      <section class="panel control-panel">
        <h2>Escaleras</h2>
        <p>Ronda limpia. Selecciona la casilla de escaleras o usa el boton.</p>
        <button type="button" class="primary" data-action="enter-stairs">Ir a escaleras</button>
      </section>
    `;
  }

  return `
    <section class="panel control-panel">
      <h2>Mejoras</h2>
      ${state.pendingUpgrades.map((heroId) => renderUpgradeControl(heroId)).join("")}
    </section>
  `;
}

function renderAttackControls() {
  const adjacent = state.monsters.filter((monster) => getAdjacentMonsterIds(state).has(monster.id));
  const preview = ui.attackTargetId
    ? previewHeroAttack(state, ui.attackTargetId, ui.attackSource)
    : { hits: 0, attackPoints: 0, defeated: false, valid: false };
  const combinedReady = heroesAdjacent();

  return `
    <section class="panel control-panel">
      <h2>Ataque humano</h2>
      <div class="attack-summary">
        <span>Paladin: ${state.available.paladin.attack}</span>
        <span>Escudero: ${state.available.squire.attack}</span>
        <span>Combinado: ${combinedReady ? "listo" : "requiere adyacencia"}</span>
      </div>
      <label>Objetivo
        <select data-bind="attackTargetId" ${adjacent.length ? "" : "disabled"}>
          ${adjacent.length ? adjacent.map((monster) => monsterOption(monster, ui.attackTargetId)).join("") : "<option>Sin objetivos adyacentes</option>"}
        </select>
      </label>
      <label>Fuente
        <select data-bind="attackSource">
          <option value="paladin" ${ui.attackSource === "paladin" ? "selected" : ""}>Paladin</option>
          <option value="squire" ${ui.attackSource === "squire" ? "selected" : ""}>Escudero</option>
          <option value="combined" ${ui.attackSource === "combined" ? "selected" : ""} ${combinedReady ? "" : "disabled"}>Combinado</option>
        </select>
      </label>
      <label>Gastar primero
        <select data-bind="attackPreference" ${ui.attackSource === "combined" ? "" : "disabled"}>
          <option value="paladin-first" ${ui.attackPreference === "paladin-first" ? "selected" : ""}>Paladin</option>
          <option value="squire-first" ${ui.attackPreference === "squire-first" ? "selected" : ""}>Escudero</option>
        </select>
      </label>
      <div class="attack-preview">
        <strong>${preview.hits}</strong>
        <span>impacto(s) posibles con ${preview.attackPoints} ataque</span>
        <span>${preview.defeated ? "Derrota al objetivo" : "No derrota aun"}</span>
      </div>
      <button type="button" class="primary" data-action="attack" ${adjacent.length && preview.valid ? "" : "disabled"}>Atacar</button>
      <button type="button" data-action="end-attack">Terminar ataque</button>
    </section>
  `;
}

function renderPendingChestChoice() {
  const pending = state.pendingChestChoice;
  const hero = state.heroes[pending.heroId];
  return `
    <section class="panel control-panel chest-choice">
      <h2>Inventario lleno</h2>
      <p>${hero.name} encontro ${pending.item.name}.</p>
      <button type="button" data-action="discard-pending">Descartar objeto nuevo</button>
      ${hero.inventory
        .map(
          (item, index) => `
            <button type="button" data-action="replace-pending" data-index="${index}">
              Reemplazar ${item.name}
            </button>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderTerminalPanel() {
  const victory = state.phase === PHASES.VICTORY;
  return `
    <section class="panel control-panel terminal-panel">
      <h2>${victory ? "Victoria" : "Derrota"}</h2>
      <p>${victory ? "La Hexacumba queda sellada." : "El Paladin llego a 0 vitalidad."}</p>
      ${renderSummary()}
      <button type="button" class="primary" data-action="reset">Nueva partida</button>
    </section>
  `;
}

function renderSummary() {
  return `
    <div class="summary-grid">
      <span>Rondas</span><strong>${state.stats.roundsCompleted}</strong>
      <span>Monstruos</span><strong>${state.stats.monstersDefeated}</strong>
      <span>Cofres</span><strong>${state.stats.chestsOpened}</strong>
      <span>Objetos</span><strong>${state.stats.objectsUsed}</strong>
      <span>Turnos</span><strong>${state.stats.turnsPlayed}</strong>
    </div>
  `;
}

function renderUpgradeControl(heroId) {
  const hero = state.heroes[heroId];
  return `
    <div class="upgrade-row">
      <label>${hero.name}
        <select data-upgrade-stat="${heroId}">
          <option value="mobility">Movilidad</option>
          <option value="attack">Ataque</option>
          <option value="defense">Defensa</option>
          <option value="maxVitality">Vitalidad maxima</option>
        </select>
      </label>
      <button type="button" data-action="upgrade" data-hero="${heroId}">Aplicar</button>
    </div>
  `;
}

function monsterOption(monster, selectedId) {
  return `
    <option value="${monster.id}" ${monster.id === selectedId ? "selected" : ""}>
      ${monster.name} (${monster.vitality}/${monster.maxVitality})
    </option>
  `;
}

function renderSquireAiPanel() {
  const ai = state.lastSquireAi;
  return `
    <section class="panel ai-panel">
      <h2>Escudero AI</h2>
      <div class="mini-grid">
        <span>Orden</span><strong>${ai?.order ?? "Sin resolver"}</strong>
        <span>Resultado</span><strong>${ai ? (ai.obeyed ? "Obedecio" : "Desobedecio") : "-"}</strong>
        <span>Motivo</span><strong>${ai?.reason ?? "-"}</strong>
        <span>Ruta</span><strong>${ai ? `${ai.from} -> ${ai.to}` : "-"}</strong>
      </div>
    </section>
  `;
}

function renderMonsterList() {
  return `
    <section class="panel monster-panel">
      <h2>Monstruos</h2>
      ${
        state.monsters.length
          ? state.monsters
              .map(
                (monster) => `
                  <button type="button" class="monster-row" data-select-cell="${monster.position}">
                    ${tokenSvg("monster", monster.marker)}
                    <div>
                      <strong>${monster.name}</strong>
                      <span>PV ${monster.vitality}/${monster.maxVitality} | Mov ${monster.mobility} | Ata ${monster.attack} | Def ${monster.defense}</span>
                    </div>
                  </button>
                `,
              )
              .join("")
          : "<p class=\"empty-text\">Sin monstruos en pie</p>"
      }
    </section>
  `;
}

function renderLog() {
  return `
    <section class="panel log-panel">
      <h2>Bitacora</h2>
      <ol>
        ${(state.log ?? []).map((entry) => `<li>${entry}</li>`).join("")}
      </ol>
    </section>
  `;
}

function handleCellClick(key) {
  ui.selectedCell = key;
  const monster = state.monsters.find((entry) => entry.position === key);
  if (monster) ui.attackTargetId = monster.id;

  if (state.phase === PHASES.MOVE) {
    movePaladin(state, key);
  } else if (state.phase === PHASES.STAIRS && key === state.board.stairs) {
    movePaladin(state, key);
  }

  render();
}

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  const itemButton = event.target.closest("[data-use-item-index]");
  const selectCellButton = event.target.closest("[data-select-cell]");
  const cellButton = event.target.closest("[data-cell]");

  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "new-game") startNewGame();
    if (action === "continue") continueGame();
    if (action === "save") saveGame();
    if (action === "delete-save") deleteSavedGame();
    if (action === "reset") {
      state = null;
      render();
    }
    if (action === "roll") {
      rollForTurn(state);
      render();
    }
    if (action === "confirm-command") {
      setSquireCommand(state, {
        type: ui.commandType,
        monsterId: ui.commandMonsterId,
      });
      render();
    }
    if (action === "resolve-squire") {
      resolveSquireMove(state);
      render();
    }
    if (action === "attack") {
      heroAttackMonster(state, ui.attackTargetId, ui.attackSource, ui.attackPreference);
      render();
    }
    if (action === "end-attack") {
      endHeroAttack(state);
      render();
    }
    if (action === "resolve-monsters") {
      resolveMonsterTurn(state);
      render();
    }
    if (action === "finish-turn") {
      finishTurn(state);
      render();
    }
    if (action === "enter-stairs") {
      movePaladin(state, state.board.stairs);
      ui.selectedCell = state.heroes.paladin.position;
      render();
    }
    if (action === "discard-pending") {
      resolvePendingChestChoice(state, "discard");
      render();
    }
    if (action === "replace-pending") {
      resolvePendingChestChoice(state, "replace", Number(actionButton.dataset.index));
      render();
    }
    if (action === "upgrade") {
      const heroId = actionButton.dataset.hero;
      const select = document.querySelector(`[data-upgrade-stat="${heroId}"]`);
      applyUpgrade(state, heroId, select.value);
      ui.selectedCell = state.heroes.paladin.position;
      render();
    }
    return;
  }

  if (itemButton && state) {
    useItem(state, itemButton.dataset.hero, Number(itemButton.dataset.useItemIndex));
    render();
    return;
  }

  if (selectCellButton && state) {
    ui.selectedCell = selectCellButton.dataset.selectCell;
    render();
    return;
  }

  if (cellButton && state) {
    handleCellClick(cellButton.dataset.cell);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target.closest("[data-bind]");
  if (!target) return;
  ui[target.dataset.bind] = target.value;

  if (target.dataset.bind === "commandType" && target.value !== "approach") {
    ui.commandMonsterId = getNearestMonsterId(state, state.heroes.paladin.position);
  }

  render();
});

window.addEventListener("resize", () => {
  if (state) render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

render();
