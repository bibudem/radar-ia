# Radar IA

Questionnaire interactif qui recommande des outils d'IA générative pour la
recherche universitaire, développé pour les Bibliothèques de l'Université de
Montréal.

L'usager répond à trois questions (discipline, type de résultat recherché,
intention de téléversement) ; l'outil filtre les 21 outils évalués selon des
règles d'admissibilité déclaratives, puis classe les outils admissibles pour
présenter un top 3 et une section « Autres outils à considérer ».

> Ce site (code, données et interface) a été généré avec Claude Code
> (Claude Sonnet 5, Anthropic).

## Démarrer le projet

Aucune dépendance, aucune étape de build. Il faut simplement servir les
fichiers via HTTP (ouvrir `index.html` directement avec `file://` empêche le
navigateur de charger les fichiers `data/*.json`).

```bash
npm start        # sert le site sur http://localhost:8000 (python3 -m http.server)
```

## Tests

```bash
npm test         # exécute tests/*.test.mjs avec le test runner intégré de Node
```

Aucune dépendance externe n'est requise (pas de jsdom, pas de framework de
test) : les tests exercent directement `engine.js`, qui est un module pur
sans accès au DOM.

## Structure du projet

```
index.html          Structure de la page
app.js               Rendu DOM, gestion des événements, état de l'UI
engine.js            Logique de recommandation, pure (aucun accès au DOM)
styles.css           Styles
data/
  questions.json     Les 3 questions du questionnaire et leurs options
  tools.json          Les outils évalués et leurs métadonnées d'admissibilité
  eligibility.json    Règles d'exclusion déclaratives
  scoring.json        Règles de pondération utilisées pour le classement
tests/
  scenarios.test.mjs  Scénarios de bout en bout sur engine.js
```

## Fonctionnement de la recommandation

La chaîne de traitement, dans `engine.js`, est strictement séquentielle :

```
réponses → filtres d'exclusion → outils admissibles → score → classement → affichage
```

Un outil écarté à l'étape des filtres ne peut plus réapparaître ensuite,
même dans la section « Autres outils à considérer » : les deux sections
affichées sont deux tranches du même ensemble d'outils admissibles.

Les règles d'exclusion (`data/eligibility.json`) s'appuient uniquement sur
des propriétés déclarées dans `data/tools.json` (`disciplines`,
`capabilities`, `requiresUpload`, `licensedContentSafe`, etc.) — aucune
liste d'outils n'est codée en dur dans la logique. La règle sur les
documents sous licence des bibliothèques est prioritaire et n'est jamais
assouplie ; les autres règles peuvent l'être progressivement si aucun outil
ne survit aux filtres.

## Mettre à jour les données

| Besoin | Fichier |
| --- | --- |
| Ajouter, retirer ou décrire un outil | `data/tools.json` |
| Changer une règle d'exclusion | `data/eligibility.json` |
| Ajuster un poids de classement | `data/scoring.json` |
| Modifier une question ou une option | `data/questions.json` |

Après toute modification de ces fichiers, relancer `npm test` pour vérifier
qu'aucun scénario n'est cassé (règle des licences, disciplines exclues,
absence de doublons sur les combinaisons de réponses possibles, etc.).
