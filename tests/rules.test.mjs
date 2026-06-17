import assert from "node:assert/strict";
import test from "node:test";
import { resolveAttack } from "../src/combat.js";
import {
  applyUpgrade,
  checkTerminalState,
  completeRoundIfNeeded,
  createNewGame,
  deserializeState,
  enterStairs,
  getPaladinReachable,
  heroAttackMonster,
  openChestForHero,
  PHASES,
  previewHeroAttack,
  resolvePendingChestChoice,
  serializeState,
} from "../src/gameState.js";
import { ITEM_TYPES } from "../src/items.js";

function seededRng() {
  let seed = 123456789;
  return () => {
    seed = (1103515245 * seed + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test("combate aplica golpes mientras ataque supera defensa", () => {
  const result = resolveAttack(7, 2, 3);
  assert.equal(result.hits, 3);
  assert.equal(result.spentAttack, 6);
  assert.equal(result.remainingAttack, 1);
  assert.equal(result.remainingVitality, 0);
  assert.equal(result.defeated, true);
});

test("abrir cofre positivo agrega objeto al inventario", () => {
  const state = createNewGame({ rng: seededRng() });
  state.chests = [
    {
      id: "test-chest",
      position: state.heroes.paladin.position,
      opened: false,
      item: {
        id: "solarAxe",
        name: "Hacha solar",
        type: ITEM_TYPES.POSITIVE,
        description: "Test item",
      },
    },
  ];

  openChestForHero(state, "paladin", "test-chest", seededRng());

  assert.equal(state.chests[0].opened, true);
  assert.equal(state.heroes.paladin.inventory.length, 1);
  assert.equal(state.heroes.paladin.inventory[0].id, "solarAxe");
});

test("inventario lleno permite reemplazar objeto encontrado", () => {
  const state = createNewGame({ rng: seededRng() });
  const filler = {
    id: "dungeonBread",
    name: "Pan de mazmorra",
    type: ITEM_TYPES.POSITIVE,
    description: "Test item",
  };
  state.heroes.paladin.inventory = [structuredClone(filler), structuredClone(filler)];
  state.chests = [
    {
      id: "full-chest",
      position: state.heroes.paladin.position,
      opened: false,
      item: {
        id: "solarAxe",
        name: "Hacha solar",
        type: ITEM_TYPES.POSITIVE,
        description: "Test item",
      },
    },
  ];

  openChestForHero(state, "paladin", "full-chest", seededRng());
  assert.equal(Boolean(state.pendingChestChoice), true);

  resolvePendingChestChoice(state, "replace", 1);

  assert.equal(state.pendingChestChoice, null);
  assert.equal(state.heroes.paladin.inventory.length, 2);
  assert.equal(state.heroes.paladin.inventory[1].id, "solarAxe");
});

test("movimiento del Paladin bloquea casillas ocupadas por unidades", () => {
  const state = createNewGame({ rng: seededRng() });
  const reachable = new Set(getPaladinReachable(state).map((entry) => entry.key));

  assert.equal(reachable.has(state.heroes.squire.position), false);
});

test("ataque combinado remueve monstruo derrotado", () => {
  const state = createNewGame({ rng: seededRng() });
  state.phase = PHASES.ATTACK;
  state.heroes.paladin.position = "0,0";
  state.heroes.squire.position = "1,0";
  state.available.paladin.attack = 2;
  state.available.squire.attack = 2;
  state.monsters = [
    {
      id: "target",
      type: "skeleton",
      name: "Esqueleto",
      marker: "ES",
      position: "0,1",
      vitality: 1,
      maxVitality: 1,
      mobility: 1,
      attack: 1,
      defense: 2,
      trait: "Test",
    },
  ];

  heroAttackMonster(state, "target", "combined", "paladin-first");

  assert.equal(state.monsters.length, 0);
  assert.equal(state.stats.monstersDefeated, 1);
  assert.equal(state.phase, PHASES.STAIRS);
});

test("ataque combinado puede impactar si solo el Escudero esta en rango", () => {
  const state = createNewGame({ rng: seededRng() });
  state.phase = PHASES.ATTACK;
  state.heroes.paladin.position = "0,0";
  state.heroes.squire.position = "1,0";
  state.available.paladin.attack = 7;
  state.available.squire.attack = 5;
  state.monsters = [
    {
      id: "skeleton",
      type: "skeleton",
      name: "Esqueleto",
      marker: "ES",
      position: "2,0",
      vitality: 3,
      maxVitality: 3,
      mobility: 4,
      attack: 2,
      defense: 2,
      trait: "Test",
    },
  ];

  const preview = previewHeroAttack(state, "skeleton", "combined");
  assert.equal(preview.valid, true);
  assert.equal(preview.attackPoints, 12);
  assert.equal(preview.hits, 1);
  assert.equal(preview.spentAttack, 2);
  assert.equal(preview.remainingAttack, 10);
  assert.equal(preview.remainingVitality, 2);

  heroAttackMonster(state, "skeleton", "combined", "squire-first");

  assert.equal(state.monsters[0].vitality, 2);
  assert.equal(state.available.paladin.attack, 7);
  assert.equal(state.available.squire.attack, 3);
  assert.equal(state.phase, PHASES.ATTACK);
});

test("limpiar ronda pide escaleras y luego avanza tras mejoras", () => {
  const state = createNewGame({ rng: seededRng() });
  state.phase = PHASES.ATTACK;
  state.monsters = [];

  completeRoundIfNeeded(state);
  assert.equal(state.phase, PHASES.STAIRS);

  enterStairs(state, seededRng());
  assert.equal(state.phase, PHASES.ROUND_COMPLETE);
  assert.equal(state.stats.roundsCompleted, 1);

  applyUpgrade(state, "paladin", "attack", seededRng());
  applyUpgrade(state, "squire", "defense", seededRng());

  assert.equal(state.round, 2);
  assert.equal(state.phase, PHASES.COMMAND);
});

test("victoria al llegar a escaleras tras limpiar ronda 12", () => {
  const state = createNewGame({ rng: seededRng() });
  state.round = 12;
  state.phase = PHASES.ATTACK;
  state.monsters = [];

  completeRoundIfNeeded(state);
  enterStairs(state, seededRng());

  assert.equal(state.phase, PHASES.VICTORY);
});

test("condicion de victoria se activa al limpiar la ronda 12", () => {
  const state = createNewGame({ rng: seededRng() });
  state.round = 12;
  state.monsters = [];

  checkTerminalState(state);

  assert.equal(state.phase, PHASES.VICTORY);
});

test("condicion de derrota se activa si cae el Paladin", () => {
  const state = createNewGame({ rng: seededRng() });
  state.heroes.paladin.vitality = 0;

  checkTerminalState(state);

  assert.equal(state.phase, PHASES.DEFEAT);
});

test("serializa y deserializa estado guardado", () => {
  const state = createNewGame({ rng: seededRng(), cursedChests: true });
  state.stats.turnsPlayed = 3;
  state.log = ["evento reciente"];

  const restored = deserializeState(serializeState(state));

  assert.equal(restored.round, state.round);
  assert.equal(restored.level, state.level);
  assert.equal(restored.settings.cursedChests, true);
  assert.equal(restored.board.cells.length, state.board.cells.length);
  assert.equal(restored.heroes.paladin.inventory.length, state.heroes.paladin.inventory.length);
  assert.equal(restored.stats.turnsPlayed, 3);
  assert.deepEqual(restored.log, ["evento reciente"]);
});
