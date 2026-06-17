import assert from "node:assert/strict";
import test from "node:test";
import {
  areAdjacent,
  generateHexCells,
  hexDistance,
  hexKey,
  reachableCells,
} from "../src/hexGrid.js";

test("genera tableros hexagonales con el conteo esperado", () => {
  assert.equal(generateHexCells(4).length, 37);
  assert.equal(generateHexCells(5).length, 61);
  assert.equal(generateHexCells(6).length, 91);
});

test("detecta adyacencia axial", () => {
  assert.equal(areAdjacent(hexKey(0, 0), hexKey(1, 0)), true);
  assert.equal(areAdjacent(hexKey(0, 0), hexKey(1, -1)), true);
  assert.equal(areAdjacent(hexKey(0, 0), hexKey(2, 0)), false);
  assert.equal(hexDistance(hexKey(0, 0), hexKey(2, -1)), 2);
});

test("casillas alcanzables respetan muros y ocupantes", () => {
  const board = {
    side: 3,
    cells: generateHexCells(3),
    walls: [hexKey(1, 0)],
    stairs: hexKey(-2, 0),
  };
  const occupied = new Set([hexKey(0, 1)]);
  const reachable = new Set(
    reachableCells(board, hexKey(0, 0), 1, occupied).map((entry) => entry.key),
  );

  assert.equal(reachable.has(hexKey(0, 0)), true);
  assert.equal(reachable.has(hexKey(1, 0)), false);
  assert.equal(reachable.has(hexKey(0, 1)), false);
  assert.equal(reachable.has(hexKey(-1, 0)), true);
});
