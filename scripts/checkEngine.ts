/**
 * Vérification du moteur backgammon : `npm run check:engine`
 * Génération de coups légaux, notation, évaluation, transcription.
 */

import { analyzeRoll, buildCommentary, inferPlayedMove } from "../src/lib/bg/analysis";
import type { BoardLike } from "../src/lib/bg/engine";
import {
  generatePlays,
  pipCounts,
  playNotation,
  standardBoard,
  toBoard,
  toPosition,
} from "../src/lib/bg/engine";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function emptyBoard(): BoardLike {
  return {
    points: Array.from({ length: 24 }, (_, i) => ({ index: i + 1, white: 0, black: 0 })),
    barWhite: 0,
    barBlack: 0,
    offWhite: 0,
    offBlack: 0,
  };
}

console.log("Position de départ");
{
  const b = standardBoard();
  const pips = pipCounts(b);
  check("pips blanc = 167", pips.white === 167, `obtenu ${pips.white}`);
  check("pips noir = 167", pips.black === 167, `obtenu ${pips.black}`);
  const whiteTotal = b.points.reduce((a, p) => a + p.white, 0);
  const blackTotal = b.points.reduce((a, p) => a + p.black, 0);
  check("15 pions par joueur", whiteTotal === 15 && blackTotal === 15);
}

console.log("Génération de coups (ouvertures classiques)");
{
  const pos = toPosition(standardBoard(), "white");

  const plays31 = generatePlays(pos, 3, 1);
  const notations31 = plays31.map((p) => playNotation(p.play));
  check(
    "3-1 : 8/5 6/5 présent (point d'or)",
    notations31.some((n) => n.includes("8/5") && n.includes("6/5")),
    notations31.slice(0, 5).join(" | "),
  );

  const analysis31 = analyzeRoll(standardBoard(), "white", [3, 1]);
  check(
    "3-1 : meilleur coup = 8/5 6/5",
    analysis31.best !== null &&
      analysis31.best.notation.includes("8/5") &&
      analysis31.best.notation.includes("6/5"),
    analysis31.best?.notation,
  );

  const plays66 = generatePlays(pos, 6, 6);
  check("double 6 : coups générés", plays66.length > 0, String(plays66.length));
  const notations66 = plays66.map((p) => playNotation(p.play));
  check(
    "double 6 : 24/18(2) 13/7(2) présent",
    notations66.some((n) => n.includes("24/18(2)") && n.includes("13/7(2)")),
    notations66.slice(0, 5).join(" | "),
  );

  const analysis66 = analyzeRoll(standardBoard(), "white", [6, 6]);
  check(
    "double 6 : meilleur = 24/18(2) 13/7(2)",
    analysis66.best?.notation.includes("24/18(2)") === true &&
      analysis66.best?.notation.includes("13/7(2)") === true,
    analysis66.best?.notation,
  );
}

console.log("Bar et dance");
{
  // Noir a un pion au bar : il entre dans le jan blanc (global 1–6).
  const b = emptyBoard();
  b.barBlack = 1;
  for (let i = 1; i <= 6; i++) b.points[i - 1].white = 2; // jan fermé
  b.points[23].black = 2;
  const analysis = analyzeRoll(b, "black", [3, 4]);
  check("jan fermé → dance", analysis.dance);
  const comment = buildCommentary(analysis);
  check("commentaire dance", comment.includes("bar"), comment);

  // Un point ouvert : l'entrée devient obligatoire.
  const b2 = emptyBoard();
  b2.barBlack = 1;
  for (let i = 1; i <= 6; i++) b2.points[i - 1].white = 2;
  b2.points[4 - 1].white = 0; // global 4 ouvert = 21-point du noir
  b2.points[23].black = 2;
  const a2 = analyzeRoll(b2, "black", [4, 2]);
  check("entrée du bar jouée", !a2.dance && a2.best !== null);
  check(
    "notation entrée bar/21 (numérotation noir)",
    a2.best?.notation.startsWith("bar/21") === true,
    a2.best?.notation,
  );
}

console.log("Frappe (hit)");
{
  const b = emptyBoard();
  b.points[12].white = 2; // blanc sur 13
  b.points[8 - 1].black = 1; // blotte noire sur 8 (global)
  b.points[0].black = 2;
  const analysis = analyzeRoll(b, "white", [5, 3]);
  check(
    "13/8* trouvé",
    analysis.plays.some((p) => p.notation.includes("13/8*")),
    analysis.plays.slice(0, 4).map((p) => p.notation).join(" | "),
  );
}

console.log("Bear-off");
{
  const b = emptyBoard();
  b.points[5].white = 3; // blanc 6-point
  b.points[3].white = 2; // blanc 4-point
  const analysis = analyzeRoll(b, "white", [6, 4]);
  check(
    "6/off 4/off trouvé",
    analysis.plays.some((p) => p.notation.includes("6/off") && p.notation.includes("4/off")),
    analysis.plays.slice(0, 4).map((p) => p.notation).join(" | "),
  );

  // Dé supérieur au point le plus haut : sortie depuis le plus haut.
  const b2 = emptyBoard();
  b2.points[2].white = 2; // blanc 3-point uniquement
  const a2 = analyzeRoll(b2, "white", [6, 5]);
  check(
    "overshoot : 3/off(2)",
    a2.plays.some((p) => p.notation.includes("3/off(2)")),
    a2.plays.slice(0, 4).map((p) => p.notation).join(" | "),
  );
}

console.log("Règle du dé fort");
{
  // Blanc : un seul pion sur 24 ; noir bloque 23, 22, 20 et 19.
  const b = emptyBoard();
  b.points[23].white = 1;
  for (const pt of [23, 22, 20, 19]) b.points[pt - 1].black = 2;
  b.points[0].black = 2;
  // Dés 1-3 : 24/23 bloqué, 24/21 ok (3), puis 21/20 bloqué et 21/18… non :
  // après 24/21, dé 1 → 21/20 bloqué. Après 24/23 impossible. Un seul dé
  // jouable → le 3 (le plus fort des jouables).
  const analysis = analyzeRoll(b, "white", [1, 3]);
  check("un seul dé jouable", analysis.best?.play.hops.length === 1);
  check("dé 3 imposé", analysis.best?.play.hops[0]?.die === 3, analysis.best?.notation);
}

console.log("Symétrie blanc/noir");
{
  const b = standardBoard();
  const posW = toPosition(b, "white");
  const posB = toPosition(b, "black");
  check(
    "positions own identiques au départ",
    JSON.stringify(posW.own) === JSON.stringify(posB.own),
  );
  const roundTrip = toBoard(posB, "black");
  check(
    "conversion aller-retour noir",
    JSON.stringify(roundTrip.points) === JSON.stringify(b.points),
  );
}

console.log("Transcription (inférence du coup joué)");
{
  const before = standardBoard();
  const analysis = analyzeRoll(before, "white", [3, 1]);
  const played = analysis.plays.find((p) => p.notation.includes("8/5") && p.notation.includes("6/5"))!;
  const after = toBoard(played.result, "white");

  const inferred = inferPlayedMove(before, after, "white", [3, 1]);
  check("coup retrouvé exactement", inferred?.exact === true, String(inferred?.distance));
  check(
    "notation retrouvée = 8/5 6/5",
    inferred?.notation.includes("8/5") === true && inferred?.notation.includes("6/5") === true,
    inferred?.notation,
  );

  // Détection bruitée : un pion mal compté → recalage sur le coup légal.
  const noisy: BoardLike = {
    ...after,
    points: after.points.map((p) =>
      p.index === 13 ? { ...p, white: Math.max(0, p.white - 1) } : { ...p },
    ),
  };
  const inferredNoisy = inferPlayedMove(before, noisy, "white", [3, 1]);
  check(
    "recalage sur position légale malgré le bruit",
    inferredNoisy !== null && inferredNoisy.distance <= 2 &&
      inferredNoisy.notation.includes("8/5"),
    `${inferredNoisy?.notation} (d=${inferredNoisy?.distance})`,
  );
}

console.log("Commentaire analytique");
{
  const analysis = analyzeRoll(standardBoard(), "white", [3, 1]);
  const comment = buildCommentary(analysis);
  check("mentionne le point construit", comment.includes("5-point"), comment);
  check("mentionne la course", comment.toLowerCase().includes("pips"), comment);
  console.log(`  → « ${comment} »`);

  const a66 = analyzeRoll(standardBoard(), "black", [6, 6]);
  console.log(`  → double 6 noir : ${a66.best?.notation} | « ${buildCommentary(a66)} »`);
}

if (failures > 0) {
  console.error(`\n${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log("\nToutes les vérifications moteur passent.");
