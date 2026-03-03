# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Présentation

Serveur web Node.js simple qui sert une page HTML affichant "Bonjour !".

## Commandes

```
node server.js   # démarrer le serveur
npm start        # équivalent à la commande ci-dessus
```

Le serveur tourne sur http://localhost:3000.

## Architecture

- `server.js` — serveur HTTP natif Node.js, sert les fichiers du dossier `public/`
- `public/index.html` — page web principale
