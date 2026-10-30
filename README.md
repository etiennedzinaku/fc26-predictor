# FC26 Predictor

Outil statique pour analyser un match FC26 à partir des statistiques saisies manuellement. Aucun compte, serveur, API sportive ou cote externe n’est nécessaire.

## Utilisation

1. Ouvre l’application servie en HTTP. Le formulaire Analyse est affiché en premier.
2. Saisis le nom du championnat et sa moyenne de buts par équipe et par match. Elle se calcule au besoin comme `Total_GF / Total_MP` sur l’ensemble des équipes.
3. Pour chaque équipe, renseigne le nom, les matchs joués, les buts marqués/encaissés en saison et les trois derniers résultats. Saisis les matchs du plus récent au plus ancien.
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

Les buts attendus finaux utilisent `attaque équipe × défense adverse / moyenne du championnat`. Les résultats sont estimés par une distribution de Poisson. La queue de distribution et la masse couverte sont suivies ; les probabilités sont conditionnelles à cette masse lorsque la plage de scores est tronquée.

La mi-temps utilise les trois derniers scores MT/FT, avec lissage et ratios séparés pour les buts marqués et encaissés. Les buts de première et seconde période sont traités comme des incréments de Poisson indépendants. La confiance HT est indiquée comme faible en raison du petit échantillon.

Le modèle n’applique aucun coefficient de durée ou d’avantage à domicile. Les analyses sauvegardent l’entrée exacte et la version du modèle afin de pouvoir les reproduire. La saisie de résultats réels et le backtesting ne sont pas inclus dans cette version légère.

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

Pousse les fichiers sur ta branche GitHub, puis configure **Settings → Pages** pour publier la branche et le dossier contenant `index.html` (souvent `/(root)`). Les ressources utilisent des chemins relatifs afin de fonctionner sous une URL de projet comme `https://<utilisateur>.github.io/fc26-predictor/`.

Aucun dépôt Git n’était initialisé dans le workspace au moment de la création. Aucun push ni déploiement n’a été effectué.
