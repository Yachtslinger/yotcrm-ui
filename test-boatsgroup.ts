import { parseBoatsGroupEmail } from "./src/lib/matches/boatsgroup-parser";

// Representative sample from the real Feb 26 2026 email
const testEmail = `
EXTERNAL EMAIL: STOP, ASSESS, VERIFY!

BoatWizard Account:
wn@denisonyachting.com

New listings in the ProSeller Platform match your search criteria.


Customer Searches


70+ Motor Yachts New Listings USA


Search Criteria:

US$ 1,000,000, 1965, Used, 70-300 ft, North America, Central America,
Caribbean, 3 Days, Cruiser, Flybridge, Mega Yacht, Motor Yacht, Pilothouse,
Other, Trawler, Downeast, Lobster Boat, Power Catamaran, Sports Cruiser,
Troller, Tug, Unspecified, Utility

7 result(s)
<https://psp.boatwizard.com/search/type-power/class-power-cruiser+power-flybridge>


Ocean Alexander 72 Pilothouse
<https://psp.boatwizard.com/boat?id=10092869&currency=USD&lengthUnits=ft>

Length: 72ft Year: 2015 Price: $2,200,000
Location: Cape Coral FL, United States
 Brokerage: Atlantic Yacht & Ship, Inc.
Riva 86' DOMINO
<https://psp.boatwizard.com/boat?id=10076256&currency=USD&lengthUnits=ft>

Length: 86ft Year: 2014 Price: $2,999,000
Location: Hollywood FL, United States
 Brokerage: Allied Marine - Fort Lauderdale
Sunseeker 82 Yacht
<https://psp.boatwizard.com/boat?id=10033101&currency=USD&lengthUnits=ft>

Length: 82ft Year: 2005 Price: $1,099,000
Location: Dunedin FL, United States
 Brokerage: Denison Yachting Tampa Bay
Bertram 700
<https://psp.boatwizard.com/boat?id=10022350&currency=USD&lengthUnits=ft>

Length: 70ft Year: 2014 Price: $3,249,000
Location: West Palm Beach FL, United States
 Brokerage: Denison Yachting - Palm Beach
Hatteras 92 Cockpit Motor Yacht
<https://psp.boatwizard.com/boat?id=9902381&currency=USD&lengthUnits=ft>

Length: 93ft Year: 2002 Price: $2,245,000
Location: Miami FL, United States
 Brokerage: HOLA Yacht Sales


70+ Yachts Outside of North America


Search Criteria:

US$ 1,000,000, 1980, Used, 70-300 ft, Major European, Europe, 3 Days, Cruiser,
Flybridge, Mega Yacht, Motor Yacht, Pilothouse, Other, Trawler, Unspecified

18 result(s)
<https://mls.boatwizard.com/search/type-power/class-power-cruiser+power-flybridge>


Prestige 680
<https://psp.boatwizard.com/boat?id=10093365&currency=USD&lengthUnits=ft>

Length: 70ft Year: 2019 Price: $1,642,096
Location: Nord-Adriatico, Italia, Italy
 Brokerage: ForwardYachts - Italy
Sanlorenzo SL86
<https://psp.boatwizard.com/boat?id=10093089&currency=USD&lengthUnits=ft>

Length: 88ft Year: 2017 Price: $4,430,115
Location: Liguria, Italy
 Brokerage: ForwardYachts - Italy
Custom M/Y Seven Spices
<https://psp.boatwizard.com/boat?id=9792103&currency=USD&lengthUnits=ft>

Length: 131ft Year: 2007 Price: $3,199,000
Location: Al-Dhhyr Alshrauy, Egypt
 Brokerage: Allegiance Yachts


Brandon


Search Criteria:

US$ 5,000,000-10,000,000, 2010-2024, Used, 100-125 ft, Major European,
Mediterranean, Europe, North America, 100, All Power

1 result(s)
<https://psp.boatwizard.com/search/type-power/region>


Dad


Search Criteria:

US$ 175,000-600,000, 2004-2024, Used, 38-48 ft, North America, Diesel

5 result(s)
<https://mls.boatwizard.com/search/type-power/class-power-aft>

`;

const result = parseBoatsGroupEmail(testEmail);

console.log("=== Parse Results ===");
console.log(`Sections found: ${result.sections.length}`);
console.log(`Total extracted: ${result.totalExtracted}`);
console.log(`Ignored sections: ${result.ignoredSections.length}`);
console.log(`Parse errors: ${result.parseErrors.length}`);

for (const sec of result.sections) {
  console.log(`\n--- ${sec.name} (${sec.tag}) ---`);
  console.log(`  Claimed: ${sec.resultCount} | Extracted: ${sec.listings.length}`);
  for (const l of sec.listings) {
    console.log(`  ${l.year} ${l.loa}ft ${l.make} ${l.model} | $${l.asking_price} | ${l.location} | ${l.brokerage}`);
    if (l.listing_url) console.log(`    URL: ${l.listing_url.slice(0, 60)}...`);
  }
}

console.log("\n--- Ignored ---");
for (const s of result.ignoredSections) {
  console.log(`  ${s}`);
}

if (result.parseErrors.length > 0) {
  console.log("\n--- ERRORS ---");
  for (const e of result.parseErrors) {
    console.log(`  ⚠️  ${e}`);
  }
}

console.log("\n✅ Parser test complete");
