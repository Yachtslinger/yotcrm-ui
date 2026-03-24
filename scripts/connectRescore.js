#!/usr/bin/env node
// scripts/connectRescore.js
// Nightly Connect engine rescore — scores all active leads against all brochures.
// Run via cron: 0 2 * * * node /app/scripts/connectRescore.js
// Or trigger manually: node scripts/connectRescore.js

const path = require('path');

// Resolve DB path same way the app does
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/yotcrm.db');
process.env.DB_PATH = DB_PATH;

// Use ts-node/register or the compiled JS — for Railway the build output is used.
// In development, run via: npx ts-node scripts/connectRescore.js

async function main() {
  const start = Date.now();
  console.log(`[connect-rescore] Starting nightly rescore — ${new Date().toISOString()}`);
  console.log(`[connect-rescore] DB: ${DB_PATH}`);

  try {
    // Dynamic require after env is set
    const { runFullRescore } = require('../.next/server/chunks/connect-storage.js');
    throw new Error('use-ts-node'); // force ts-node path below
  } catch {
    // ts-node path for development / Railway with ts-node available
    try {
      require('ts-node').register({ transpileOnly: true, skipProject: true });
      const { runFullRescore } = require('../src/lib/connect/storage.ts');
      const { initConnectTables } = require('../src/lib/connect/db.ts');

      initConnectTables();
      const result = runFullRescore();

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[connect-rescore] Done — ${result.pairs} pairs scored, ${result.errors} errors, ${elapsed}s`);
      process.exit(result.errors > 0 ? 1 : 0);
    } catch (err) {
      console.error('[connect-rescore] Fatal:', err.message);
      process.exit(1);
    }
  }
}

main();
