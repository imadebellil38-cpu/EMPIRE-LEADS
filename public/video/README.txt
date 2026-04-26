═══════════════════════════════════════════════════════════════════
  DOSSIER VIDEOS — EMPIRE LEADS
  Comment activer la video de fond sur la page d'accueil (landing.html)
═══════════════════════════════════════════════════════════════════

COMMENT CA MARCHE
─────────────────
La page d'accueil (prospecthunter.vercel.app/) cherche automatiquement
le fichier /video/hero.mp4 au chargement.
  → Si trouve : la video s'affiche en fond du hero, texte passe en blanc,
    overlay sombre auto-ajoute pour que ca reste lisible.
  → Si absent : le gradient vert reste (aucun bug, aucun log d'erreur).

Tu n'as rien a coder. Juste deposer le fichier au bon endroit.


FICHIERS ATTENDUS
─────────────────
  public/video/hero.mp4           ← Video principale (OBLIGATOIRE)
  public/video/hero.webm          ← Version alternative (optionnel, plus legere)
  public/video/hero-poster.jpg    ← Image affichee avant que la video charge (recommande)


SPECS TECHNIQUES RECOMMANDEES (pour un rendu pro)
─────────────────────────────────────────────────
  Duree        : 8 a 20 secondes (loop en boucle)
  Resolution   : 1920 x 1080 (Full HD) — pas besoin de 4K, ca alourdit
  Codec video  : H.264 (mp4) / VP9 (webm)
  Framerate    : 24 ou 30 fps
  Bitrate      : 2 a 5 Mbps max (pour que la page reste rapide)
  Poids final  : vise 2 a 5 Mo max pour le MP4
  Audio        : AUCUN (la video est muette en autoplay obligatoire)
  Orientation  : paysage 16:9

IMPORTANT pour l'autoplay :
  - La video DOIT etre muette (attribut `muted` deja en place)
  - Ne pas mettre de piste audio dans le fichier (poids inutile)


COMMENT COMPRESSER UNE VIDEO GRATUITEMENT
─────────────────────────────────────────
Option 1 — Handbrake (desktop, gratuit)
  https://handbrake.fr/
  Preset : "Web > Vimeo YouTube HD 1080p30"
  Filtre : desactive audio

Option 2 — En ligne (rapide, sans install)
  https://www.freeconvert.com/video-compressor
  → Choisir "Advanced Settings" → Bitrate 3 Mbps, pas d'audio


IDEES DE VIDEOS QUI RENDENT PRO (inspiration)
─────────────────────────────────────────────
  - Time-lapse d'une ville de nuit (lights, Paris, NY)
  - Plan aerien de data-centers ou bureaux modernes
  - Animation abstraite de particules / reseaux / noeuds
  - Dashboard / ecran d'ordinateur en mouvement
  - Images de team au travail (meetings, brainstorm)
  - Flux de donnees / code / graphiques animes

SOURCES GRATUITES (libres de droits, qualite pro) :
  - Pexels Videos     https://www.pexels.com/videos/
  - Coverr            https://coverr.co/
  - Mixkit            https://mixkit.co/free-stock-video/
  - Pixabay Videos    https://pixabay.com/videos/

Mots-cles a chercher : "business", "technology", "data", "network",
"city night", "office", "abstract particles", "dashboard"


TU TOURNES TES PROPRES VIDEOS PRO ?
───────────────────────────────────
Parfait. Checklist avant de tourner :
  □ Trepied obligatoire (pas de tremblement)
  □ Lumiere naturelle ou softbox (pas de neon direct)
  □ 4K 30fps natif, tu re-exporteras en 1080p apres
  □ Pense au loop : la fin doit pouvoir se raccorder au debut
  □ Pas de personnes identifiables sans leur accord (RGPD)


DEPLOYER APRES AJOUT
────────────────────
Une fois le fichier hero.mp4 place dans ce dossier, depuis C:/i1/exemple-fix :
  npx vercel --prod --yes

La video sera live sur prospecthunter.vercel.app/ en 15 secondes.


DESACTIVER LA VIDEO
───────────────────
Renommer ou supprimer hero.mp4. Le gradient reprend automatiquement.
