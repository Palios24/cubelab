# CubeLab sur Netlify

Site (HTML) + API (Netlify Function) + base de données **Netlify Blobs** (incluse dans Netlify, aucune configuration, aucun compte externe).

## Déployer
Le simple glisser-déposer ne suffit pas (il faut déployer la fonction). Deux options :

**A. Avec Git (recommandé)**
1. Mets ce dossier dans un dépôt GitHub / GitLab.
2. Sur Netlify : *Add new site → Import an existing project*, choisis le dépôt.
3. Netlify lit `netlify.toml` : rien à régler. Clique sur *Deploy*.

**B. Avec la CLI**
```
npm install
npm i -g netlify-cli
netlify login
netlify deploy --prod
```
(la première fois, `netlify init` ou `netlify link` pour créer / relier le site)

## Tester en local
```
npm install
netlify dev          # http://localhost:8888, avec une base Blobs locale
```

## Comment ça marche
- `public/index.html` : le site.
- `netlify/functions/api.mjs` : point d'entrée de l'API (`/api/*`).
- `netlify/lib/app.mjs` : comptes (scrypt + sel, cookie HttpOnly), méthodes, vérifications côté serveur.
- Données dans le store Blobs `cubelab` : `user/`, `name/` (unicité des pseudos), `sess/`, `algos/`, `pub/`, `rl/`.

## Limites
- Pas de « mot de passe oublié » ni de changement de mot de passe dans l'interface.
- Les sessions expirées et les compteurs anti-abus (`rl/`) ne sont pas purgés automatiquement : négligeable à petite échelle.
- La liste des méthodes publiques relit un document par membre ayant publié : très bien pour quelques centaines de membres, à revoir au-delà.
- Vérifie les quotas Netlify Blobs / Functions de ton offre.
- Utilise le HTTPS de Netlify (par défaut) : les mots de passe transitent par le réseau.
