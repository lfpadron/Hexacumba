import assert from "node:assert/strict";
import test from "node:test";
import { resolveAttack } from "../src/combat.js";
import {
  checkTerminalState,
  createNewGame,
  openChestForHero,
  PHASES,
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
