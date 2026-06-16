import assert from "node:assert/strict";
import test from "node:test";
import { areAdjacent, generateHexCells, hexDistance, hexKey } from "../src/hexGrid.js";

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
