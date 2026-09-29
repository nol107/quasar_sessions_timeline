# Rétroplanning QUASAR SESSIONS EP.2

Webapp mono-page statique (vanilla JS, zéro build), éditable dans l'UI, synchronisée via un GitHub Gist.

## Lancer en local

Les modules ES ne marchent pas en `file://` :

```bash
python -m http.server 8123
```

Puis <http://localhost:8123>. Tests : `node tests/run.mjs` ou ouvrir `tests.html`.

## Synchronisation Gist

1. Crée un **fine-grained token** GitHub avec uniquement la permission de compte **Gists : Read and write**.
2. ⚙ Réglages → colle le token → « Créer le gist à partir des données actuelles » (gist non listé, fichier `ep2-retroplanning.json`).
   Ou renseigne un Gist ID existant.
3. **Édition par toute l'équipe** : chacun saisit le même Gist ID + le même token partagé dans ⚙ Réglages. **Sans token = lecture seule.**
   ⚠ Un token « Gists » donne l'écriture sur **tous** les gists du compte qui le crée : le plus sûr est de créer un compte GitHub dédié au projet, de créer le gist et le token depuis ce compte, puis de partager ce token à l'équipe.

Le Gist ID peut être figé dans `js/store.js` (`DEFAULT_GIST_ID`) : c'est volontaire, il ne donne que la lecture. Le token, lui, ne va jamais dans le code.

Fonctionnement : offline-first (`localStorage`), sauvegarde auto ~1,5 s après une modif, poll toutes les 60 s onglet visible.
Avant chaque écriture le gist est relu puis fusionné **par tâche** (`updatedAt` le plus récent gagne, suppressions = tombstones).
En cas de conflit sur la même tâche, un toast propose de restaurer l'autre version.

⚠ Un gist secret n'est **pas privé** : toute personne ayant l'URL peut le lire. Ne mets rien de sensible dedans.
Le token reste dans le `localStorage` du navigateur, jamais dans le dépôt.

## Overlay des ressources

Google Slides / Sheets / Drive et SoundCloud s'ouvrent en iframe. Shotgun (`EMBED_BLOCKED` dans `js/embed.js`) s'ouvre directement dans un onglet.
Pour les autres sites, si rien ne s'affiche après 4 s, un message propose l'ouverture en onglet.
Les docs Google ne s'affichent que si le partage est « tous les utilisateurs disposant du lien » ; le blocage des cookies tiers (Safari, navigation privée) peut afficher un écran de connexion.

## Déploiement GitHub Pages

Settings → Pages → branche `main`, dossier `/`. Les fichiers inutiles en prod (`PLAN.md`, `seed-data.json`, `.xlsx`, `tests*`) peuvent rester ou être retirés.
