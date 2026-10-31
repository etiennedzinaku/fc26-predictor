# FC26 Predictor

Outil statique pour analyser un match FC26 à partir des statistiques saisies manuellement. Aucun compte, serveur, API sportive ou cote externe n’est nécessaire.

## Utilisation

1. Ouvre l’application servie en HTTP. Le formulaire Analyse est affiché en premier.
2. Le nom du championnat est facultatif. Aucune moyenne ni donnée globale de championnat n’est demandée.
3. Pour chaque équipe, renseigne le nom, les matchs joués, les buts marqués/encaissés en saison et les trois derniers résultats. Saisis les matchs du plus récent au plus ancien. L’adversaire et le lieu sont facultatifs et archivés pour les analyses futures ; ils ne changent pas encore le calcul. Aucune date n’est demandée.
4. Clique sur **Analyser le match**. Le rapport affiche xG, score exacts les plus probables, 1X2, Over/Under, BTTS, estimation mi-temps et combinaisons HT/FT.
5. Après la première analyse, les vues Dashboard et Historique apparaissent. Les analyses sont automatiquement conservées dans le stockage local du navigateur.

Aucune donnée sportive de démonstration n’est préchargée. Une estimation statistique n’est jamais une garantie de résultat.

## Sauvegarde JSON

Les analyses restent automatiquement dans le navigateur utilisé. Elles ne sont pas synchronisées entre appareils et peuvent disparaître si les données du navigateur sont effacées.

- **Exporter JSON** télécharge une archive complète qui peut être conservée ou transférée.
- **Importer JSON** fusionne une archive avec les analyses locales, sans supprimer les entrées existantes.
- **Lier un fichier** utilise l’accès aux fichiers du navigateur lorsque celui-ci le prend en charge et que tu l’autorises. Le fichier est actualisé à chaque nouvelle analyse tant que l’onglet reste ouvert. Après un rechargement, il faut relier le fichier. Si cette API n’est pas disponible, un fichier JSON est téléchargé à la place.

GitHub Pages ne permet pas à une page statique d’écrire dans un fichier du dépôt ni de synchroniser les données de plusieurs appareils. Pour changer d’appareil, exporte le JSON, puis importe-le sur l’autre appareil.

## Moteur

Les paramètres sont centralisés dans `assets/js/engine/config.js` : poids récents 50/30/20, mélange saison/forme 65/35, lissage HT et tolérance Poisson. Ces poids sont des valeurs initiales, pas des paramètres optimisés.

Le moteur compare trois variantes de la même famille Poisson : statistiques de saison seules, forme récente seule et combinaison saison/forme à 65/35. Les matrices de scores sont mélangées à poids égaux pour former le consensus 1/X/2, le score modal et les marchés. Les poids sont des valeurs initiales et non calibrées ; ces variantes ne constituent pas trois modèles indépendants ni une preuve de fiabilité. Les buts attendus de chaque variante sont la moyenne arithmétique entre la force offensive d’une équipe et le taux de buts encaissés par son adversaire. Le modèle n’utilise aucune moyenne ou statistique globale du championnat. Cette formule simple est une approximation, pas un modèle calibré sur une compétition. Le rapport affiche l’issue la plus probable et son pourcentage, ainsi que les probabilités de chaque variante. Ces pourcentages ne sont pas une garantie. La queue de distribution et la masse couverte sont suivies ; les probabilités sont conditionnelles à cette masse lorsque la plage de scores est tronquée.

## Évaluation par résultats réels

Dans l’historique, saisis les scores HT et FT une fois le match terminé. Le résultat réel est ajouté à l’analyse JSON sans modifier sa prévision initiale. Le dashboard compare ensuite les prévisions enregistrées aux résultats avec Brier Score, Log Loss, justesse, calibration, log-loss du score exact et erreur moyenne sur les buts attendus.

Le backtest walk-forward compare des pondérations candidates des trois variantes : pour chaque analyse testée, les poids sont choisis uniquement avec des résultats saisis avant la date de cette prédiction. Les premières analyses servent d’entraînement ; le résultat évalué et tout résultat saisi après la prévision sont exclus. Le backtest est une mesure hors-échantillon, pas un apprentissage automatique : il ne modifie ni les prévisions archivées ni les poids du modèle courant. Il faut davantage de données avant de tirer des conclusions fiables.
Le backtest walk-forward compare des pondérations candidates des trois variantes : pour chaque analyse testée, les poids sont choisis uniquement avec des résultats saisis avant la date de cette prédiction. Les premières analyses servent d’entraînement ; le résultat évalué et tout résultat saisi après la prévision sont exclus. Le backtest est une mesure hors-échantillon, pas un apprentissage automatique : il ne modifie ni les prévisions archivées ni les poids du modèle courant. Il faut au moins cinq résultats connus avant une prédiction ultérieure, puis des analyses de test, et davantage de données avant de tirer des conclusions fiables.

La mi-temps utilise les trois derniers scores MT/FT, avec lissage et ratios séparés pour les buts marqués et encaissés. Les buts de première et seconde période sont traités comme des incréments de Poisson indépendants. La confiance HT est indiquée comme faible en raison du petit échantillon.

Le modèle n’applique aucun coefficient de durée ou d’avantage à domicile. Les analyses sauvegardent l’entrée exacte et la version du modèle afin de pouvoir les reproduire. L’adversaire et le lieu des matchs récents sont archivés s’ils sont renseignés, mais ne sont pas encore utilisés dans les calculs.

## Lancer localement

Les modules ES doivent être servis via HTTP et non ouverts avec `file://`. Avec Python installé, depuis la racine du dossier :

```powershell
python -m http.server 8000
```

Ouvre `http://localhost:8000/`. Ce serveur sert seulement les fichiers pendant le développement ; l’hébergement de production reste statique.

Lancer les tests du moteur :

```powershell
node --test tests/engine.test.js
```

Node.js est requis uniquement pour lancer les tests, pas pour utiliser ni héberger le site.

## GitHub Pages

Le dépôt source est [etiennedzinaku/fc26-predictor](https://github.com/etiennedzinaku/fc26-predictor), sur la branche `main`. Le site est publié sur [etiennedzinaku.github.io/fc26-predictor](https://etiennedzinaku.github.io/fc26-predictor/). Les ressources et modules ES utilisent des URLs relatives et des versions de cache afin de fonctionner sous le chemin du projet.

Les analyses restent locales au navigateur. GitHub Pages publie l’application, mais ne synchronise pas ses archives JSON entre appareils.
