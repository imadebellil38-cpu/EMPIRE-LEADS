// Crée les comptes dans Supabase (PostgreSQL)
// Lance avec : node create-users-local.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const users = [
  { email: 'yanis@empireleads.fr',   password: 'Yanis#271',   credits: 100, plan: 'starter' },
  { email: 'remi@empireleads.fr',    password: 'Remi#482',    credits: 200, plan: 'starter' },
  { email: 'raphael@empireleads.fr', password: 'Raphael#639', credits: 500, plan: 'pro'     },
  { email: 'wasim@empireleads.fr',   password: 'Wasim#815',   credits: 250, plan: 'starter' },
  { email: 'adam@empireleads.fr',    password: 'Adam#524',    credits: 200, plan: 'starter' },
];

async function main() {
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    try {
      await pool.query(`DELETE FROM users WHERE email = $1`, [u.email]);
      await pool.query(
        `INSERT INTO users (email, password, credits, plan) VALUES ($1, $2, $3, $4)`,
        [u.email, hash, u.credits, u.plan]
      );
      console.log(`✅ ${u.email} créé (${u.credits} crédits)`);
    } catch (e) {
      console.log(`❌ ${u.email} — ${e.message}`);
    }
  }
  await pool.end();
  console.log('\nDone. Tu peux te connecter maintenant.');
}

main();
