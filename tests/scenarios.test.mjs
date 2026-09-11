import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { evaluate } from "../engine.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf-8"));

const tools = readJson("data/tools.json");
const questions = readJson("data/questions.json");
const scoring = readJson("data/scoring.json");
const eligibility = readJson("data/eligibility.json");

function run(answers) {
  return evaluate({
    tools,
    questions,
    scoringRules: scoring.rules,
    eligibilityRules: eligibility.rules,
    answers,
  });
}

const LICENSE_SAFE_IDS = tools.filter((tool) => tool.licensedContentSafe).map((tool) => tool.id).sort();

test("exactly five tools are marked safe for licensed content", () => {
  assert.deepEqual(
    LICENSE_SAFE_IDS,
    ["consensus", "copilot", "leapspace", "lexis_ai", "undermind"].sort()
  );
});

test("scénario A — documents sous licence des bibliothèques n'admet jamais un outil hors des cinq", () => {
  const discipline = ["multidisciplinary", "health_life_sciences", "social_humanities", "chemistry", "law", "other"];
  const use = ["find_documents", "generate_synthesis_corpus", "web_search_synthesis"];

  discipline.forEach((discipline_focus) => {
    use.forEach((desired_use) => {
      const result = run({ discipline_focus, desired_use, upload_intent: "library_license" });
      result.admissibleIds.forEach((id) => {
        assert.ok(LICENSE_SAFE_IDS.includes(id), `${id} ne devrait pas être admissible avec library_license`);
      });
    });
  });
});

test("scénario B — nature de documents inconnue n'admet jamais un outil hors des cinq", () => {
  const discipline = ["multidisciplinary", "health_life_sciences", "social_humanities", "chemistry", "law", "other"];
  const use = ["find_documents", "generate_synthesis_corpus", "web_search_synthesis"];

  discipline.forEach((discipline_focus) => {
    use.forEach((desired_use) => {
      const result = run({ discipline_focus, desired_use, upload_intent: "unknown_nature" });
      result.admissibleIds.forEach((id) => {
        assert.ok(LICENSE_SAFE_IDS.includes(id), `${id} ne devrait pas être admissible avec unknown_nature`);
      });
    });
  });
});

test("la règle de licence n'est jamais assouplie, même quand aucun outil ne survit", () => {
  // Chimie + repérage de documents + licence : parmi les cinq, seuls Undermind/Consensus
  // couvrent la chimie ; la règle de licence doit rester active même si peu d'outils passent.
  const result = run({
    discipline_focus: "chemistry",
    desired_use: "find_documents",
    upload_intent: "library_license",
  });

  assert.ok(!result.relaxedRules.some((rule) => rule.id === "licensed_content"));
  result.admissibleIds.forEach((id) => {
    assert.ok(LICENSE_SAFE_IDS.includes(id));
  });
});

test("scénario repère — SHS + repérage de documents + licence donne exactement 3 outils", () => {
  const result = run({
    discipline_focus: "social_humanities",
    desired_use: "find_documents",
    upload_intent: "library_license",
  });

  assert.deepEqual(result.admissibleIds.sort(), ["consensus", "leapspace", "undermind"].sort());
});

test("la justification n'est pas une formule générique identique pour tous les outils admissibles", () => {
  // Undermind, LeapSpace et Consensus.app satisfont ici exactement les mêmes règles
  // d'admissibilité : sans motif propre à l'outil, les trois blocs « Pourquoi cet
  // outil ? » afficheraient un texte strictement identique.
  const result = run({
    discipline_focus: "social_humanities",
    desired_use: "find_documents",
    upload_intent: "library_license",
  });

  const justifications = result.ranked.map((entry) => entry.justification.join(" | "));
  assert.equal(new Set(justifications).size, justifications.length, "justifications dupliquées entre outils");

  result.ranked.forEach((entry) => {
    const mentionsTool = entry.justification.some((reason) => reason.includes(entry.tool.name));
    assert.ok(mentionsTool, `${entry.tool.id} n'a aucun motif propre à l'outil dans sa justification`);
  });
});

test("fusion Undermind — un seul outil, aucune référence brisée, aucun score dédoublé", () => {
  const undermindTools = tools.filter((tool) => tool.id === "undermind" || tool.id === "undermind_classic" || tool.id === "undermind_project");
  assert.equal(undermindTools.length, 1);
  assert.equal(undermindTools[0].id, "undermind");
  assert.deepEqual(undermindTools[0].legacyIds?.sort(), ["undermind_classic", "undermind_project"]);

  // Aucune règle de score ne doit plus référencer les anciens identifiants.
  scoring.rules.forEach((rule) => {
    rule.effects.forEach((effect) => {
      assert.notEqual(effect.toolId, "undermind_classic");
      assert.notEqual(effect.toolId, "undermind_project");
    });
  });

  // Un seul effet par (question, option) pour "undermind" : pas de score dédoublé.
  scoring.rules.forEach((rule) => {
    const matches = rule.effects.filter((effect) => effect.toolId === "undermind");
    assert.ok(matches.length <= 1, `score dédoublé pour undermind sur ${rule.questionId}:${rule.optionId}`);
  });

  const result = run({
    discipline_focus: "social_humanities",
    desired_use: "generate_synthesis_corpus",
    upload_intent: "library_license",
  });
  const undermindEntry = result.ranked.find((entry) => entry.tool.id === "undermind");
  assert.ok(undermindEntry);
  // Un seul effet par question répondue doit avoir contribué au score d'Undermind.
  const questionIds = undermindEntry.contributions.map((c) => c.questionId);
  assert.equal(new Set(questionIds).size, questionIds.length);
});

test("NotebookLM a été remplacé par Gemini Notebook (id, nom, url conservée)", () => {
  const notebook = tools.find((tool) => tool.id === "gemini_notebook");
  assert.ok(notebook);
  assert.equal(notebook.name, "Gemini Notebook");
  assert.equal(notebook.url, "https://notebooklm.google.com/");
  assert.deepEqual(notebook.legacyIds, ["notebooklm"]);
  assert.ok(!tools.some((tool) => tool.id === "notebooklm"));
});

test("CAIRN SophIA est admissible pour repérer des documents en SHS, jamais pour une synthèse de corpus", () => {
  const cairn = tools.find((tool) => tool.id === "cairn_sophia");
  assert.ok(cairn);
  assert.equal(cairn.institutionalLicense, true);

  const findResult = run({ discipline_focus: "social_humanities", desired_use: "find_documents" });
  assert.ok(findResult.admissibleIds.includes("cairn_sophia"));

  const synthesisResult = run({ discipline_focus: "social_humanities", desired_use: "generate_synthesis_corpus" });
  assert.ok(!synthesisResult.admissibleIds.includes("cairn_sophia"));
});

test("Copilot porte le drapeau de licence institutionnelle et reste admissible avec des documents sous licence", () => {
  const copilot = tools.find((tool) => tool.id === "copilot");
  assert.ok(copilot);
  assert.equal(copilot.institutionalLicense, true);
  assert.equal(copilot.licensedContentSafe, true);

  // Mais Copilot n'a pas la capacité de repérer des documents : il reste exclu dans ce cas précis.
  const result = run({ desired_use: "find_documents", upload_intent: "library_license" });
  assert.ok(!result.admissibleIds.includes("copilot"));
});

test("JSTOR AI et Scifinder AI ont la licence institutionnelle sans être admissibles pour documents sous licence", () => {
  ["jstor_ai", "scifinder_ai"].forEach((id) => {
    const tool = tools.find((item) => item.id === id);
    assert.ok(tool.institutionalLicense);
    assert.equal(tool.licensedContentSafe, false);
  });

  const result = run({ upload_intent: "library_license" });
  assert.ok(!result.admissibleIds.includes("jstor_ai"));
  assert.ok(!result.admissibleIds.includes("scifinder_ai"));
});

test("les moteurs bâtis sur Semantic Scholar disparaissent en droit", () => {
  const semanticScholarIds = [
    "elicit",
    "scispace",
    "consensus",
    "undermind",
    "asta_paper_finder",
    "asta_generate_report",
    "platform",
    "liner",
  ];

  const result = run({ discipline_focus: "law" });
  semanticScholarIds.forEach((id) => {
    assert.ok(!result.admissibleIds.includes(id), `${id} ne devrait pas être admissible en droit`);
  });
});

test("les IAg généralistes disparaissent quand l'usager cherche des références", () => {
  const generalistIds = ["claude", "chatgpt", "gemini", "copilot", "perplexity"];
  const result = run({ desired_use: "find_documents" });
  generalistIds.forEach((id) => {
    assert.ok(!result.admissibleIds.includes(id), `${id} ne devrait pas être admissible pour repérer des documents`);
  });
});

test("aucune liste blanche codée en dur : chaque exclusion provient des propriétés de tools.json", () => {
  // Un outil ne devrait être exclu (hors relaxation) que par une règle dont il ne satisfait
  // pas le champ déclaré, jamais par une comparaison sur son id.
  eligibility.rules.forEach((rule) => {
    assert.equal(typeof rule.require.type, "string");
    assert.ok(["flagTrue", "flagFalse", "listIncludesOption", "listIncludesValue"].includes(rule.require.type));
  });
});

test("aucun doublon et un outil exclu ne réapparaît jamais dans les 72 combinaisons possibles", () => {
  const disciplineOptions = questions.find((q) => q.id === "discipline_focus").options.map((o) => o.id);
  const useOptions = questions.find((q) => q.id === "desired_use").options.map((o) => o.id);
  const uploadOptions = questions.find((q) => q.id === "upload_intent").options.map((o) => o.id);

  assert.equal(disciplineOptions.length * useOptions.length * uploadOptions.length, 72);

  disciplineOptions.forEach((discipline_focus) => {
    useOptions.forEach((desired_use) => {
      uploadOptions.forEach((upload_intent) => {
        const answers = { discipline_focus, desired_use, upload_intent };
        const result = run(answers);

        // Pas de doublon dans le classement.
        const ids = result.ranked.map((entry) => entry.tool.id);
        assert.equal(new Set(ids).size, ids.length, `doublon détecté pour ${JSON.stringify(answers)}`);

        // Un outil exclu à l'étape A n'apparaît jamais dans le classement ni dans "primary"/"secondary".
        const excludedIds = new Set(result.excluded.map((entry) => entry.tool.id));
        ids.forEach((id) => {
          assert.ok(!excludedIds.has(id), `${id} est à la fois exclu et classé pour ${JSON.stringify(answers)}`);
        });

        // primary + secondary sont deux tranches du même ensemble admissible, sans chevauchement.
        const primaryIds = result.primary.map((entry) => entry.tool.id);
        const secondaryIds = result.secondary.map((entry) => entry.tool.id);
        primaryIds.forEach((id) => assert.ok(!secondaryIds.includes(id)));

        // La règle de licence, non assouplissable, est toujours respectée si active.
        if (upload_intent === "library_license" || upload_intent === "unknown_nature") {
          ids.forEach((id) => {
            assert.ok(LICENSE_SAFE_IDS.includes(id), `${id} viole la règle de licence pour ${JSON.stringify(answers)}`);
          });
        }
      });
    });
  });
});

test("besoin très spécifique — peu de résultats, aucun doublon, classement explicable", () => {
  const result = run({
    discipline_focus: "chemistry",
    desired_use: "generate_synthesis_corpus",
    upload_intent: "no_upload",
  });

  const ids = result.ranked.map((entry) => entry.tool.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(result.ranked.length < tools.length);

  result.ranked.forEach((entry) => {
    assert.ok(entry.justification.length > 0, `${entry.tool.id} n'a pas de justification`);
  });
});
