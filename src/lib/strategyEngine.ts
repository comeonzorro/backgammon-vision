import type { BackgammonPoint, GameSnapshot, StrategyAdvice } from "../types";
import { analyzeRoll, buildCommentary, inferPlayedMove } from "./bg/analysis";
import type { BoardLike, Player } from "./bg/engine";
import { pipCounts, playerLabel, standardBoard } from "./bg/engine";

export type { InferredMove } from "./bg/analysis";

export function createInitialBoard(): BackgammonPoint[] {
  return standardBoard().points;
}

function snapshotToBoard(s: GameSnapshot): BoardLike {
  return {
    points: s.points,
    barWhite: s.barWhite,
    barBlack: s.barBlack,
    offWhite: s.offWhite,
    offBlack: s.offBlack,
  };
}

export function snapshotFromDice(
  dice: number[],
  previous?: GameSnapshot,
): GameSnapshot {
  const base = previous ?? {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dice: [],
    points: createInitialBoard(),
    barWhite: 0,
    barBlack: 0,
    offWhite: 0,
    offBlack: 0,
    activePlayer: "white" as const,
  };

  // Premier jet de la partie : pas d'alternance (attribué au joueur courant).
  const nextPlayer =
    base.dice.length === 0
      ? base.activePlayer
      : base.activePlayer === "white"
        ? "black"
        : "white";

  return {
    ...base,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dice,
    activePlayer: nextPlayer,
  };
}

/**
 * Analyse réelle du jet : génération complète des coups légaux, évaluation
 * positionnelle, meilleur coup en notation standard, alternatives classées
 * par équité et commentaire analytique dérivé de la position.
 */
export function analyzePosition(
  snapshot: GameSnapshot,
  dice: number[],
): StrategyAdvice {
  const mover: Player = snapshot.activePlayer;
  const board = snapshotToBoard(snapshot);
  const analysis = analyzeRoll(board, mover, dice);
  const pips = pipCounts(board);
  const label = playerLabel(mover);

  if (analysis.dance || !analysis.best) {
    return {
      bestMove: `${label} : aucun coup possible (dance)`,
      equity: 0,
      winChance: 50,
      spectatorComment: buildCommentary(analysis),
      alternatives: [],
      riskLevel: "low",
      pipCounts: pips,
      mover,
    };
  }

  const best = analysis.best;
  const alternatives = analysis.plays.slice(1, 4).map((p) => {
    const delta = p.equity - best.equity;
    return `${p.notation} — éq. ${fmtEquity(p.equity)} (Δ ${delta.toFixed(3)})`;
  });

  const shots = best.features.totalShotRolls;
  const riskLevel: StrategyAdvice["riskLevel"] =
    shots === 0 ? "low" : shots <= 12 ? "medium" : "high";

  return {
    bestMove: `${label} : ${best.notation}`,
    equity: Math.round(best.equity * 1000) / 1000,
    winChance: Math.round(best.winProb * 100),
    spectatorComment: buildCommentary(analysis),
    alternatives,
    riskLevel,
    pipCounts: pips,
    mover,
  };
}

function fmtEquity(e: number): string {
  return `${e >= 0 ? "+" : ""}${e.toFixed(3)}`;
}

/**
 * Transcription du coup joué : compare la position détectée par la caméra
 * aux positions légales atteignables et recale sur la plus proche.
 */
export function inferMoveFromSnapshots(
  previous: GameSnapshot,
  detectedPoints: BackgammonPoint[],
  detectedBarWhite: number,
  detectedBarBlack: number,
  mover: Player,
  dice: number[],
) {
  const prevBoard = snapshotToBoard(previous);
  const detected: BoardLike = {
    points: detectedPoints,
    barWhite: detectedBarWhite,
    barBlack: detectedBarBlack,
    // La détection caméra ne voit pas les pions sortis : on les déduit.
    offWhite: Math.max(
      0,
      15 - detectedPoints.reduce((a, p) => a + p.white, 0) - detectedBarWhite,
    ),
    offBlack: Math.max(
      0,
      15 - detectedPoints.reduce((a, p) => a + p.black, 0) - detectedBarBlack,
    ),
  };
  return inferPlayedMove(prevBoard, detected, mover, dice);
}
