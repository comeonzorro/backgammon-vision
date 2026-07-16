/**
 * Évaluation positionnelle heuristique (inspirée des critères classiques
 * utilisés par GNU Backgammon / eXtreme Gammon en cubeless) :
 * course aux pips, blots pondérés par les tirs directs, points construits,
 * primes, ancres, pions au bar, bear-off, distribution.
 */

import type { Position } from "./engine";
import { oppAtOwn } from "./engine";

export interface Blot {
  /** Coordonnée dans la numérotation du joueur au trait. */
  coord: number;
  /** Nombre de jets adverses (sur 36) contenant au moins un tir direct. */
  rolls: number;
}

export interface EvalFeatures {
  ownPip: number;
  oppPip: number;
  pipLead: number;
  contact: boolean;
  blots: Blot[];
  /** Somme des jets frappeurs (peut dépasser 36 si plusieurs blots). */
  totalShotRolls: number;
  homePoints: number;
  madePoints: number[];
  primeLength: number;
  primeTrapsOpp: boolean;
  anchors: number[];
  oppBar: number;
  ownOff: number;
}

export interface Evaluation {
  score: number;
  winProb: number;
  equity: number;
  features: EvalFeatures;
}

function pip(own: number[], bar: number): number {
  let total = bar * 25;
  for (let i = 1; i <= 24; i++) total += own[i] * i;
  return total;
}

function hasContact(pos: Position): boolean {
  let highestOwn = pos.ownBar > 0 ? 25 : 0;
  for (let i = 24; i >= 1; i--) {
    if (pos.own[i] > 0) {
      highestOwn = Math.max(highestOwn, i);
      break;
    }
  }

  // Adverses en coordonnées du joueur : opp[j] est au point own 25-j ;
  // l'adversaire remonte vers les coordonnées élevées.
  let lowestOpp = pos.oppBar > 0 ? 0 : 25;
  for (let j = 24; j >= 1; j--) {
    if (pos.opp[j] > 0) {
      lowestOpp = Math.min(lowestOpp, 25 - j);
    }
  }

  return highestOwn > lowestOpp;
}

/** Jets adverses (sur 36) contenant un tir direct sur la coordonnée donnée. */
function directShotRolls(pos: Position, blotCoord: number): number {
  const hitDice = new Set<number>();

  for (let d = 1; d <= 6; d++) {
    const source = blotCoord - d;
    if (source >= 1 && oppAtOwn(pos, source) > 0) hitDice.add(d);
  }
  // Entrée directe depuis le bar adverse (l'adversaire entre en own 1..6).
  if (pos.oppBar > 0 && blotCoord <= 6) hitDice.add(blotCoord);

  const misses = 6 - hitDice.size;
  return 36 - misses * misses;
}

const POINT_VALUE: Record<number, number> = {
  1: 1.6,
  2: 2.2,
  3: 3.2,
  4: 4.8,
  5: 6.4,
  6: 5.6,
  7: 4.6,
  8: 2.6,
  9: 1.6,
  10: 1.4,
  11: 1.6,
  12: 1.2,
};

const ANCHOR_VALUE: Record<number, number> = {
  24: 1.4,
  23: 1.8,
  22: 2.4,
  21: 3.8,
  20: 4.8,
  19: 3.2,
};

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function evaluate(pos: Position): Evaluation {
  const ownPip = pip(pos.own, pos.ownBar);
  const oppPipCount = pip(pos.opp, pos.oppBar);
  const pipLead = oppPipCount - ownPip;
  const contact = hasContact(pos);

  const blots: Blot[] = [];
  let totalShotRolls = 0;
  let riskPips = 0;

  if (contact) {
    for (let i = 1; i <= 24; i++) {
      if (pos.own[i] !== 1) continue;
      const rolls = directShotRolls(pos, i);
      if (rolls > 0) {
        blots.push({ coord: i, rolls });
        totalShotRolls += rolls;
        riskPips += (rolls / 36) * (25 - i) * 0.85;
      }
    }
  }

  const madePoints: number[] = [];
  let homePoints = 0;
  let pointScore = 0;
  for (let i = 1; i <= 24; i++) {
    if (pos.own[i] < 2) continue;
    madePoints.push(i);
    if (i <= 6) homePoints++;
    if (contact) {
      pointScore += POINT_VALUE[i] ?? 0.6;
      if (i >= 19) pointScore += ANCHOR_VALUE[i] ?? 0;
    }
  }

  const anchors = madePoints.filter((p) => p >= 19);

  // Prime : plus longue suite de points consécutifs (coords 1–12).
  let primeLength = 0;
  let primeLow = 0;
  let run = 0;
  for (let i = 1; i <= 12; i++) {
    if (pos.own[i] >= 2) {
      run++;
      if (run > primeLength) {
        primeLength = run;
        primeLow = i - run + 1;
      }
    } else {
      run = 0;
    }
  }

  let primeTrapsOpp = false;
  if (primeLength >= 3) {
    for (let i = 1; i < primeLow; i++) {
      if (oppAtOwn(pos, i) > 0) {
        primeTrapsOpp = true;
        break;
      }
    }
    if (pos.oppBar > 0) primeTrapsOpp = true;
  }

  let primeScore = 0;
  if (contact && primeLength >= 3) {
    primeScore = 1.8 * Math.pow(primeLength - 2, 1.6);
    if (primeTrapsOpp) primeScore *= 1.7;
  }

  const barScore = contact ? pos.oppBar * (3 + 1.3 * homePoints) : 0;

  let stackPenalty = 0;
  for (let i = 1; i <= 24; i++) {
    if (pos.own[i] > 5) stackPenalty += (pos.own[i] - 5) * 0.7;
  }

  const offScore = pos.ownOff * 2.6 - pos.oppOff * 2.6;

  const pipWeight = contact ? 0.32 : 0.85;
  const score =
    pipLead * pipWeight +
    pointScore +
    primeScore +
    barScore +
    offScore -
    riskPips -
    stackPenalty;

  // Probabilité de gain (approximation cubeless, adversaire au jet) :
  // course pure → formule pip ; contact → mélange positionnel + course.
  const raceScale = 2.5 + 0.09 * Math.max(20, ownPip);
  const raceWin = logistic((pipLead - 4) / raceScale);
  const contactWin = logistic(score / 9.5);
  const winProb = contact ? 0.6 * contactWin + 0.4 * raceWin : raceWin;
  const equity = Math.max(-1, Math.min(1, 2 * winProb - 1));

  return {
    score,
    winProb,
    equity,
    features: {
      ownPip,
      oppPip: oppPipCount,
      pipLead,
      contact,
      blots,
      totalShotRolls,
      homePoints,
      madePoints,
      primeLength,
      primeTrapsOpp,
      anchors,
      oppBar: pos.oppBar,
      ownOff: pos.ownOff,
    },
  };
}
