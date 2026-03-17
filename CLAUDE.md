# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Présentation

**ProspectHunter** — SaaS de prospection commerciale B2B.
Trouve des entreprises sans site web / sans réseaux sociaux via Google Maps, génère des pitchs IA, et gère les prospects dans un CRM pipeline.

## Stack

- **Backend** : Node.js + Express
- **Base de données** : SQLite via `better-sqlite3`
- **Auth** : JWT (jsonwebtoken)
- **Frontend** : HTML/CSS/JS vanilla (pas de framework)
- **IA** : API Anthropic (Claude) pour les pitchs

## Commandes

```bash
npm start          # démarrer le serveur (production)
node server.js     # démarrer le serveur (développement)
npm test           # lancer les tests Jest
```

Le serveur tourne sur http://localhost:3000.

## Architecture

### Racine
- `server.js` — point d'entrée Express, middleware, routes
- `db.js` — initialisation SQLite, création des tables, migrations
- `auth.js` — JWT : createToken, requireAuth, requireAdmin

### Routes (`routes/`)
- `auth.js` — register, login
- `prospects.js` — CRUD prospects
- `search.js` — recherche Google Maps
- `pitch.js` — génération de pitch IA
- `admin.js` — routes admin
- `subscription.js` — gestion abonnements
- `referral.js` — parrainage

### Services (`services/`)
- Logique métier découplée des routes

### Frontend (`public/`)
- `index.html` — app principale (pipeline CRM) — servie sur `/app`
- `landing.html` — page d'accueil — servie sur `/`
- `login.html` — authentification — servie sur `/login`
- `admin.html` — dashboard admin — servie sur `/admin`
- `pricing.html` — page tarifs — servie sur `/pricing`
- `app.js` — logique frontend (pipeline, scan, pitch, analytics)
- `style.css` — styles de l'app
- `shared.css` — styles partagés

## Base de données

Tables : `users`, `prospects`, `searches`, `activity_log`, `call_attempts`
Migrations appliquées automatiquement au démarrage dans `db.js`.

## Variables d'environnement

Voir `.env.example` pour la liste complète.
Variables critiques : `JWT_SECRET`, `PORT`, `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`
