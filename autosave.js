const { execSync } = require('child_process');
const fs = require('fs');

const dossier = __dirname;
let timer = null;

// Fichiers/dossiers à ne jamais commiter
const IGNORE = ['.git', 'node_modules', 'autosave', '.env', 'prospecthunter.db', 'package-lock.json'];

console.log('✅ Sauvegarde automatique activée — je surveille ton projet...');

fs.watch(dossier, { recursive: true }, (event, fichier) => {
  if (!fichier) return;
  if (IGNORE.some(ig => fichier.includes(ig))) return;

  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      // N'ajoute que les fichiers trackés ou nouvellement créés — respecte le .gitignore
      execSync(`git -C "${dossier}" add --all -- . ':!.env' ':!*.db' ':!package-lock.json'`, { stdio: 'pipe' });

      // Vérifie s'il y a vraiment des changements à commiter
      const status = execSync(`git -C "${dossier}" status --porcelain`, { stdio: 'pipe' }).toString().trim();
      if (!status) return;

      const date = new Date().toLocaleString('fr-FR');
      execSync(`git -C "${dossier}" commit -m "autosave: ${date} (${fichier})"`, { stdio: 'pipe' });
      console.log(`💾 Sauvegardé — ${date} (${fichier})`);
    } catch (e) {
      // Rien à commiter
    }
  }, 2000);
});
