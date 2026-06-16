import { areAdjacent } from "./hexGrid.js";

export function resolveAttack(attackPoints, defense, vitality) {
  const safeDefense = Math.max(1, defense);
  let remainingAttack = Math.max(0, attackPoints);
  let remainingVitality = Math.max(0, vitality);
  let hits = 0;

  while (remainingAttack >= safeDefense && remainingVitality > 0) {
    remainingAttack -= safeDefense;
    remainingVitality -= 1;
    hits += 1;
  }

  return {
    hits,
    spentAttack: hits * safeDefense,
    remainingAttack,
    remainingVitality,
    defeated: remainingVitality <= 0,
  };
}

export function heroesAreAdjacent(heroes) {
  if (!heroes.paladin.position || !heroes.squire.position) return false;
  return areAdjacent(heroes.paladin.position, heroes.squire.position);
}

export function getCombinedDefense(state, targetHeroId) {
  if (!heroesAreAdjacent(state.heroes) || state.heroes.squire.vitality <= 0) {
    return state.available[targetHeroId].defense;
  }

  return state.available.paladin.defense + state.available.squire.defense;
}

export function canTargetFrom(sourceKey, targetKey) {
  return areAdjacent(sourceKey, targetKey);
}
