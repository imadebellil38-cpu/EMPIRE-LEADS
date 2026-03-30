# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Présentation

**Empire Leads** — SaaS de prospection commerciale B2B.
Trouve des entreprises sans site web / sans réseaux sociaux via Google Maps, génère des pitchs IA, et gère les prospects dans un CRM pipeline.

## Stack

- **Backend** : Node.js + Express 5
- **Base de données** : SQLite (`better-sqlite3`) en local, PostgreSQL (`pg`) en prod
- **Auth** : JWT (`jsonwebtoken`) + bcryptjs
- **Frontend** : HTML/CSS/JS vanilla (pas de framework)
- **IA** : API Anthropic (Claude) pour les pitchs
- **Paiement** : Stripe (routes + webhooks)
- **PDF** : pdfkit pour devis/exports

## Commandes

```bash
node server.js          # démarrer le serveur (port 3000)
npm test                # lancer tous les tests Jest
npx jest tests/auth.test.js  # lancer un seul fichier de test
```

## Architecture

### Flux principal
`server.js` → charge `db.js` (init tables + migrations auto) → monte les routes → sert les fichiers statiques de `public/`.

### Routes (`routes/`)
Chaque fichier exporte un `express.Router()` monté dans `server.js` :
- `auth.js` — register, login, reset password, referral
- `search.js` — recherche Google Maps + mode Instagram (via Google CSE)
- `prospects.js` — CRUD prospects, pipeline stages
- `pitch.js` — génération pitch IA (Anthropic)
- `quotes.js` — devis avec signature et PDF
- `subscription.js` — plans et abonnements
- `stripe.js` / `stripeWebhook.js` — paiement Stripe
- `admin.js` — dashboard admin
- `referral.js` — parrainage

### Services (`services/`)
Logique métier découplée des routes :
- `googlePlaces.js` — API Google Places
- `claude.js` — API Anthropic
- `socialCheck.js` — vérification présence réseaux sociaux via Google CSE
- `instagramSearch.js` — recherche profils Instagram via Google CSE
- `searchCache.js` — cache des résultats de recherche
- `emailFinder.js` — découverte d'emails
- `email.js` — envoi d'emails (nodemailer)
- `pdf.js` — génération PDF
- `pappers.js` — données entreprises françaises

### Frontend (`public/`)
- `app.js` — logique principale (pipeline CRM, scan, pitch, analytics)
- `ig-finder.js` — bookmarklet Instagram Finder (injecté sur instagram.com)
- Pages servies : `/` (landing), `/app` (CRM), `/login`, `/admin`, `/pricing`, `/instagram-finder`

### Bookmarklet Instagram Finder
`public/ig-finder.js` est un script autonome encodé en `javascript:` URI. Il tourne directement sur instagram.com avec la session de l'utilisateur. Il utilise les API internes Instagram (`/api/v1/`) avec le header `X-IG-App-ID: 936619743392459`. La page `instagram-finder.html` sert de landing pour copier le code.

## Base de données

Tables : `users`, `prospects`, `searches`, `activity_log`, `call_attempts`, `search_cache`, `quotes`
Migrations appliquées automatiquement au démarrage dans `db.js`.

## Tests

Jest avec `supertest`. Fichiers dans `tests/`. Setup commun dans `tests/setup.js`.
Les tests couvrent : auth, prospects, search, pitch, quotes, admin, security (XSS, CORS, rate limiting).

## Variables d'environnement

Voir `.env.example`. Critiques : `JWT_SECRET`, `PORT`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`.

## Conventions

- Le frontend est en français (labels, messages utilisateur)
- Ne jamais mentionner "gratuit", "sans API", ou "aucune API" dans l'UI
- Le serveur de dev tourne sur le port 3012 (via `.claude/launch.json`)
