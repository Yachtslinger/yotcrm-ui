#!/usr/bin/env node
/**
 * YachtWorld → Denison Branded PDF (One-Click)
 * 
 * Usage: node yachtToPDF.js <yachtworld-url>
 * 
 * 1. Scrapes the YachtWorld listing (specs, images, description)
 * 2. Generates a branded Denison Yachting PDF
 * 3. Opens the PDF in Preview
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const brokerArg = args.find(a => a.startsWith('--broker='));
const brokerFlag = brokerArg || '--broker=will';

if (!url || !url.includes('yachtworld.com')) {
  console.log('🚢 SLINGER / Denison Yachting — PDF Generator');
  console.log('━'.repeat(50));
  console.log('');
  console.log('Usage: node yachtToPDF.js <yachtworld-url> [--broker=will|paolo|both]');
  console.log('');
  console.log('Example:');
  console.log('  node yachtToPDF.js https://www.yachtworld.com/yacht/2023-cantiere-delle-marche-rj-115-10020622/');
  console.log('  node yachtToPDF.js <url> --broker=both');
  console.log('');
  process.exit(1);
}

const SCRIPTS_DIR = __dirname;
const DATA_DIR = path.join(SCRIPTS_DIR, '..', 'Data', 'listings');

async function run() {
  console.log('🚢 SLINGER / Denison Yachting — PDF Generator');
  console.log('━'.repeat(50));
  console.log('');

  // Step 1: Scrape
  console.log('📡 Step 1: Scraping YachtWorld listing...');
  console.log(`   URL: ${url}`);
  console.log('');
  
  try {
    execSync(`node "${path.join(SCRIPTS_DIR, 'scrapeYachtWorld.js')}" "${url}"`, {
      stdio: 'inherit',
      cwd: path.join(SCRIPTS_DIR, '..'),
    });
  } catch (err) {
    console.error('❌ Scraping failed');
    process.exit(1);
  }
  
  // Find the most recently created listing directory
  const dirs = fs.readdirSync(DATA_DIR)
    .map(d => ({ name: d, path: path.join(DATA_DIR, d) }))
    .filter(d => fs.statSync(d.path).isDirectory())
    .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);
  
  if (dirs.length === 0) {
    console.error('❌ No listing directory found');
    process.exit(1);
  }
  
  const listingDir = dirs[0].path;
  console.log('');
  console.log('━'.repeat(45));
  
  // Step 2: Generate PDF
  console.log('📄 Step 2: Generating branded PDF...');
  console.log('');
  
  try {
    execSync(`node "${path.join(SCRIPTS_DIR, 'generateListingPDF.js')}" "${listingDir}" ${brokerFlag}`, {
      stdio: 'inherit',
      cwd: path.join(SCRIPTS_DIR, '..'),
    });
  } catch (err) {
    console.error('❌ PDF generation failed');
    process.exit(1);
  }
  
  // Step 3: Open PDF
  const pdfFiles = fs.readdirSync(listingDir).filter(f => f.endsWith('.pdf'));
  if (pdfFiles.length > 0) {
    const pdfPath = path.join(listingDir, pdfFiles[0]);
    console.log('');
    console.log('━'.repeat(45));
    console.log('🎉 Opening PDF in Preview...');
    execSync(`open "${pdfPath}"`);
  }
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
