# Qittens Game Automate

Version 1.0, sans dépendance externe. `QGAuto.js` est le seul fichier de script à partager et à modifier. Son code est organisé en classes de registre, services, utilitaires, contrôleur et interface, avec contrats JSDoc pour l’autocomplétion JavaScript/TypeScript des éditeurs. Le fichier s’exécute directement dans DevTools et ne demande aucune commande de build.

## Lancer le script

1. Ouvrir le jeu : https://kittensgame.com/web/#
2. Ouvrir les outils de développement avec `F12`, puis sélectionner **Console**.
3. Ouvrir `QGAuto.js` dans un éditeur, copier tout son contenu, le coller dans la console du jeu et valider.
4. Le bouton **⚙ QGAuto** apparaît près des onglets **Journal** et **File**. Cliquer dessus pour ouvrir les réglages.

Pour les lancements suivants, tu peux créer un **Snippet** dans DevTools : onglet **Sources**, section **Snippets**, nouveau snippet, puis coller le contenu de `QGAuto.js`. Sur l’onglet du jeu, exécute-le avec `Ctrl+Entrée`.

## Modifier et partager

Modifie directement `QGAuto.js`, puis exécute à nouveau son contenu dans la console. Pour la variante qui appelle les méthodes internes du jeu, modifier et lancer `QGAuto-API.js`. Si tu utilises un Snippet, remplace son contenu par la nouvelle version avant de l’exécuter : un snippet est une copie et ne se met pas à jour automatiquement.

Pour partager le script, transmets simplement `QGAuto.js` et ce README. Le destinataire suit les mêmes étapes ; il n’a pas à installer de dépendance ni à lancer de commande de compilation.

## Variante API directe

`QGAuto-API.js` est une alternative expérimentale avec la même interface et les mêmes réglages, mais qui utilise les méthodes internes de `gamePage` pour déclencher les actions. Elle ne lit pas les boutons de fabrication, de chasse, de louange, de commerce ou d’ambassade pour les exécuter. Le DOM reste utilisé pour intégrer la fenêtre QGAuto.

1. Recharger le jeu ou arrêter la version précédente.
2. Coller le contenu de `QGAuto-API.js` dans la console DevTools, ou remplacer le contenu du Snippet par ce fichier.

Les appels directs utilisés sont `gamePage.village.huntFraction()`, `gamePage.calendar.observeHandler()`, `gamePage.religion.praise()`, `gamePage.workshop.craft()` / `gamePage.craftAll()`, `gamePage.diplomacy.tradeAll()` et `EmbassyButtonController.buyItem()`. Les ambassades passent par le contrôleur officiel du jeu pour conserver les vérifications de coût, de déblocage, les effets et l’undo. Le commerce attend le minimum de caravanes configuré avant d’envoyer le maximum disponible. L’observation ne se déclenche que lorsqu’un événement astronomique est actif. Les actions sont suspendues en mode lecture seule.

Ces méthodes sont internes au jeu et peuvent changer lors d’une mise à jour. La variante est expérimentale ; `QGAuto.js` reste disponible en cas de régression.

## Architecture du script

- `ModuleRegistry` enregistre les services et les modules internes.
- `AutomationService` définit le contrat commun des services.
- `HuntService`, `ObserveService`, `PraiseService`, `CraftService`, `TradeService` et `EmbassyService` encapsulent chacun une automatisation.
- `GameUtils` fournit les accès partagés au DOM et aux ressources du jeu.
- `SettingsUI` construit la fenêtre de configuration depuis les métadonnées des services.
- `QGAutoController` exécute les services et expose l’API globale `qgauto`.

Pour ajouter une automatisation, créer une classe qui étend `AutomationService`, déclarer son identifiant, son libellé, sa description et ses champs dans le constructeur, puis implémenter `run(config, utils, state)`. L’enregistrer dans la liste située juste après les classes de services et ajouter son réglage `enabled` dans la configuration en haut du fichier. La modale récupère automatiquement les métadonnées.

Le navigateur interdit à un fichier local d’injecter automatiquement du code dans un autre site. Sans extension approuvée ou gestionnaire de userscripts, l’ouverture du jeu et l’exécution manuelle dans DevTools sont nécessaires.

## Commandes console

- `qgauto.help()` : afficher les commandes disponibles.
- `qgauto.openSettings()` : ouvrir la fenêtre de réglages.
- `qgauto.stop()` / `qgauto.start()` : arrêter ou relancer l’automatisation.
- `qgauto.toggleCraft()` : basculer la fabrication ; les autres tâches ont aussi leur commande `toggle` dédiée.
- `qgauto.config` : consulter ou modifier la configuration en direct.
