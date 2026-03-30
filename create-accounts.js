/**
 * Script de création des comptes Empire Leads
 * Usage: node create-accounts.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const accounts = [
  { email: 'admin@empireleads.fr',   password: 'Admin2026!', display_name: 'Admin',   credits: 999999, theme_url: '',       is_admin: true },
  { email: 'yanis@empireleads.fr',   password: 'Yanis123',   display_name: 'Yanis',   credits: 100,    theme_url: 'manga',  is_admin: false },
  { email: 'remi@empireleads.fr',    password: 'Remi123',    display_name: 'Remi',    credits: 200,    theme_url: 'naruto', is_admin: false },
  { email: 'raphael@empireleads.fr', password: 'Raphael123', display_name: 'Raphael', credits: 500,    theme_url: 'goggins',is_admin: false },
  { email: 'wasim@empireleads.fr',   password: 'Wasim123',   display_name: 'Wasim',   credits: 250,    theme_url: 'candy',  is_admin: false },
  { email: 'adam@empireleads.fr',    password: 'Adam123',    display_name: 'Adam',    credits: 200,    theme_url: 'wolf',   is_admin: false },
  { email: 'demo@empireleads.fr',   password: 'Demo2026',   display_name: 'Découverte', credits: 0,      theme_url: '',       is_admin: false },
  { email: 'axel@empireleads.fr',  password: 'Axel123',   display_name: 'Axel',       credits: 100,    theme_url: '',       is_admin: false },
  { email: 'alex@empireleads.fr',  password: 'Alex123',   display_name: 'Alex',       credits: 100,    theme_url: '',       is_admin: false },
];

async function run() {
  console.log('🚀 Création des comptes Empire Leads...\n');

  // Add columns if they don't exist yet
  try {
    await db.run(`ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''`);
    console.log('✅ Colonne display_name ajoutée');
  } catch (e) { console.log('ℹ️  display_name existe déjà'); }

  try {
    await db.run(`ALTER TABLE users ADD COLUMN theme_url TEXT DEFAULT ''`);
    console.log('Colonne theme_url ajoutee');
  } catch (e) { console.log('theme_url existe deja'); }

  try {
    await db.run(`ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0`);
    console.log('Colonne is_disabled ajoutee');
  } catch (e) { console.log('is_disabled existe deja'); }

  console.log('');

  for (const acc of accounts) {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [acc.email]);
    if (existing) {
      // Update existing account + reset password
      const hash = bcrypt.hashSync(acc.password, 12);
      await db.run(
        'UPDATE users SET password = ?, credits = ?, theme_url = ?, display_name = ?, is_admin = ? WHERE email = ?',
        [hash, acc.credits, acc.theme_url, acc.display_name, acc.is_admin ? 1 : 0, acc.email]
      );
      console.log(`Compte mis a jour : ${acc.email}`);
    } else {
      const hash = bcrypt.hashSync(acc.password, 12);
      const referralCode = crypto.randomBytes(4).toString('hex');
      await db.run(
        `INSERT INTO users (email, password, display_name, plan, credits, theme_url, referral_code, is_admin)
         VALUES (?, ?, ?, 'pro', ?, ?, ?, ?)`,
        [acc.email, hash, acc.display_name, acc.credits, acc.theme_url, referralCode, acc.is_admin ? 1 : 0]
      );
      console.log(`Compte cree : ${acc.email} -- mot de passe: ${acc.password} -- ${acc.credits} credits`);
    }
  }

  // ── Insérer 3 prospects de démo dans le compte découverte ──
  const demoUser = await db.get('SELECT id FROM users WHERE email = ?', ['demo@empireleads.fr']);
  if (demoUser) {
    const demoProspects = [
      { name: 'Boulangerie Le Fournil', address: '12 rue des Lilas, 75011 Paris', phone: '01 43 55 12 34', rating: 4.7, reviews: 312, niche: 'Boulangerie', city: 'Paris', website_url: '', notes: 'Pas de site web, pas de réseaux sociaux. Fort potentiel — 312 avis Google.' },
      { name: 'Garage Auto Martin', address: '45 avenue Jean Jaurès, 69007 Lyon', phone: '04 78 61 23 45', rating: 4.3, reviews: 89, niche: 'Garage automobile', city: 'Lyon', website_url: '', notes: 'Aucune présence en ligne. Garage bien établi avec clientèle locale fidèle.' },
      { name: 'Salon de Coiffure Élégance', address: '8 place du Marché, 33000 Bordeaux', phone: '05 56 44 78 90', rating: 4.5, reviews: 156, niche: 'Salon de coiffure', city: 'Bordeaux', website_url: '', notes: 'Aucun site web. Bonne opportunité pour création de site.' }
    ];

    await db.run('DELETE FROM prospects WHERE user_id = ?', [demoUser.id]);

    for (const p of demoProspects) {
      await db.run(
        `INSERT INTO prospects (user_id, name, address, phone, rating, reviews, niche, city, website_url, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo')`,
        [demoUser.id, p.name, p.address, p.phone, p.rating, p.reviews, p.niche, p.city, p.website_url, p.notes]
      );
    }
    console.log('\n📋 3 prospects de démo ajoutés au compte découverte');
  }

  console.log('\n🎉 Tous les comptes sont prêts !\n');
  console.log('Récapitulatif :');
  console.log('─────────────────────────────────────────────────────');
  for (const acc of accounts) {
    console.log(`  ${acc.display_name.padEnd(10)} ${acc.email.padEnd(30)} ${acc.password}`);
  }
  console.log('─────────────────────────────────────────────────────');

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
