import {
  applyUpgrade,
  createNewGame,
  deserializeState,
  endHeroAttack,
  getAdjacentMonsterIds,
  getNearestMonsterId,
  getPaladinReachable,
  getPhaseLabel,
  heroAttackMonster,
  movePaladin,
  PHASES,
  serializeState,
  setSquireCommand,
  useItem,
} from "./gameState.js";
import { hexDistance } from "./hexGrid.js";

const SAVE_KEY = "hexacumba-save-v1";
const app = document.querySelector("#app");

let state = null;
const ui = {
  commandType: "follow",
  commandMonsterId: null,
  attackTargetId: null,
  attackSource: "paladin",
  attackPreference: "paladin-first",
};

function localLog(message) {
  if (!state) return;
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

  if (!ui.commandMonsterId || !state.monsters.some((monster) => monster.id === ui.commandMonsterId)) {
    ui.commandMonsterId = getNearestMonsterId(state, state.heroes.paladin.position);
  }

  const adjacent = Array.from(getAdjacentMonsterIds(state));
  if (!adjacent.includes(ui.attackTargetId)) {
    ui.attackTargetId = adjacent[0] ?? state.monsters[0]?.id ?? null;
  }
}

function saveGame() {
  if (!state) return;
  localStorage.setItem(SAVE_KEY, serializeState(state));
  localLog("Partida guardada en este navegador.");
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
  normalizeSelections();
  render();
}

function continueGame() {
  state = loadSavedState();
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
        </div>
      </form>
    </main>
  `;
}

function renderGame() {
  const roundLabel = `Ronda ${state.round}/12`;
  const levelLabel = `Nivel ${state.level}`;
  return `
    <main class="app-shell game-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Hexacumba</p>
          <h1>Paladin y Escudero</h1>
        </div>
        <div class="status-strip">
          <span>${roundLabel}</span>
          <span>${levelLabel}</span>
          <span>${getPhaseLabel(state.phase)}</span>
        </div>
        <div class="top-actions">
          <button type="button" data-action="save">Guardar</button>
          <button type="button" data-action="continue">Continuar</button>
          <button type="button" data-action="reset">Nueva</button>
        </div>
      </header>
      <section class="main-grid">
        <aside class="side-panel">
          ${renderHeroCard("paladin")}
          ${renderHeroCard("squire")}
        </aside>
        <section class="board-panel">
          ${renderBoard()}
        </section>
        <aside class="side-panel">
          ${renderControls()}
          ${renderMonsterList()}
          ${renderLog()}
        </aside>
      </section>
    </main>
  `;
}

function renderHeroCard(heroId) {
  const hero = state.heroes[heroId];
  const dice = state.dice[heroId];
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
    <section class="panel hero-panel ${heroId}">
      <div class="panel-title">
        ${tokenSvg(heroId, heroId === "paladin" ? "P" : "E")}
        <div>
          <h2>${hero.name}</h2>
          <p>${avatarLabel}</p>
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
                  (item) => `
                    <button type="button" class="item-button" data-use-item="${item.id}" data-hero="${heroId}" title="${item.description}">
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
      const classes = [
        "hex-cell",
        wall ? "wall" : "",
        isStairs ? "stairs" : "",
        reachable.has(cell.key) ? "reachable" : "",
        attackable.has(cell.key) ? "attackable" : "",
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
  const parts = [`Casilla ${key}`];
  if (state.board.walls.includes(key)) parts.push("Muro");
  if (state.board.stairs === key) parts.push("Escaleras");
  const chest = state.chests.find((entry) => entry.position === key && !entry.opened);
  if (chest) parts.push("Cofre");
  const monster = state.monsters.find((entry) => entry.position === key);
  if (monster) parts.push(`${monster.name} (${monster.vitality} PV)`);
  const hero = Object.values(state.heroes).find((entry) => entry.position === key);
  if (hero) parts.push(hero.name);
  return parts.join(" | ");
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

function renderControls() {
  if (state.phase === PHASES.VICTORY || state.phase === PHASES.DEFEAT) {
    return `
      <section class="panel control-panel terminal-panel">
        <h2>${state.phase === PHASES.VICTORY ? "Victoria" : "Derrota"}</h2>
        <p>${state.phase === PHASES.VICTORY ? "La ronda 12 fue despejada." : "El Paladin llego a 0 vitalidad."}</p>
        <button type="button" class="primary" data-action="reset">Nueva partida</button>
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
        <h2>Movimiento</h2>
        <p>Selecciona una casilla resaltada para mover al Paladin.</p>
        <button type="button" data-cell="${state.heroes.paladin.position}">Quedarse aqui</button>
      </section>
    `;
  }

  if (state.phase === PHASES.ATTACK) {
    const adjacent = state.monsters.filter((monster) => getAdjacentMonsterIds(state).has(monster.id));
    return `
      <section class="panel control-panel">
        <h2>Ataque humano</h2>
        <label>Objetivo
          <select data-bind="attackTargetId" ${adjacent.length ? "" : "disabled"}>
            ${adjacent.length ? adjacent.map((monster) => monsterOption(monster, ui.attackTargetId)).join("") : "<option>Sin objetivos adyacentes</option>"}
          </select>
        </label>
        <label>Fuente
          <select data-bind="attackSource">
            <option value="paladin" ${ui.attackSource === "paladin" ? "selected" : ""}>Paladin</option>
            <option value="squire" ${ui.attackSource === "squire" ? "selected" : ""}>Escudero</option>
            <option value="combined" ${ui.attackSource === "combined" ? "selected" : ""}>Combinado</option>
          </select>
        </label>
        <label>Gastar primero
          <select data-bind="attackPreference" ${ui.attackSource === "combined" ? "" : "disabled"}>
            <option value="paladin-first" ${ui.attackPreference === "paladin-first" ? "selected" : ""}>Paladin</option>
            <option value="squire-first" ${ui.attackPreference === "squire-first" ? "selected" : ""}>Escudero</option>
          </select>
        </label>
        <button type="button" class="primary" data-action="attack" ${adjacent.length ? "" : "disabled"}>Atacar</button>
        <button type="button" data-action="end-attack">Terminar ataque</button>
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

function renderMonsterList() {
  return `
    <section class="panel monster-panel">
      <h2>Monstruos</h2>
      ${
        state.monsters.length
          ? state.monsters
              .map(
                (monster) => `
                  <div class="monster-row">
                    ${tokenSvg("monster", monster.marker)}
                    <div>
                      <strong>${monster.name}</strong>
                      <span>PV ${monster.vitality}/${monster.maxVitality} | Mov ${monster.mobility} | Ata ${monster.attack} | Def ${monster.defense}</span>
                    </div>
                  </div>
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

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  const itemButton = event.target.closest("[data-use-item]");
  const cellButton = event.target.closest("[data-cell]");

  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "new-game") startNewGame();
    if (action === "continue") continueGame();
    if (action === "save") saveGame();
    if (action === "reset") {
      state = null;
      render();
    }
    if (action === "confirm-command") {
      setSquireCommand(state, {
        type: ui.commandType,
        monsterId: ui.commandMonsterId,
      });
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
    if (action === "upgrade") {
      const heroId = actionButton.dataset.hero;
      const select = document.querySelector(`[data-upgrade-stat="${heroId}"]`);
      applyUpgrade(state, heroId, select.value);
      render();
    }
    return;
  }

  if (itemButton && state) {
    useItem(state, itemButton.dataset.hero, itemButton.dataset.useItem);
    render();
    return;
  }

  if (cellButton && state?.phase === PHASES.MOVE) {
    movePaladin(state, cellButton.dataset.cell);
    render();
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
