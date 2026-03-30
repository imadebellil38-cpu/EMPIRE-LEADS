// Script de création des comptes utilisateurs
// Lance avec : node create-users.js

const bcrypt = require('bcryptjs');

const users = [
  { email: 'yanis@empireleads.fr',   password: 'Yanis#271',   credits: 100, plan: 'starter' },
  { email: 'remi@empireleads.fr',    password: 'Remi#482',    credits: 200, plan: 'starter' },
  { email: 'raphael@empireleads.fr', password: 'Raphael#639', credits: 500, plan: 'pro'     },
  { email: 'wasim@empireleads.fr',   password: 'Wasim#815',   credits: 250, plan: 'starter' },
  { email: 'adam@empireleads.fr',    password: 'Adam#524',    credits: 200, plan: 'starter' },
];

async function main() {
  console.log('\n=== EMPIRE LEADS — Création des comptes ===\n');
  console.log('Copiez ce SQL dans Supabase SQL Editor et cliquez Run :\n');
  console.log('-- Supprimer les comptes existants (si besoin)');
  console.log("DELETE FROM users WHERE email IN ('" + users.map(u => u.email).join("','") + "');\n");

  const inserts = [];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    inserts.push(`INSERT INTO users (email, password, credits, plan) VALUES ('${u.email}', '${hash}', ${u.credits}, '${u.plan}');`);
  }

  console.log(inserts.join('\n'));

  console.log('\n=== Identifiants de connexion ===\n');
  for (const u of users) {
    console.log(`${u.email.split('@')[0].toUpperCase().padEnd(10)} | ${u.email.padEnd(30)} | ${u.password.padEnd(15)} | ${u.credits} crédits`);
  }
  console.log('');
}

main().catch(console.error);
