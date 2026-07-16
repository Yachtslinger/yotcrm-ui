import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseLoaFt(loa: string): number {
  if (!loa) return 100;
  const m = loa.match(/([\d.]+)\s*m/i); if (m) return parseFloat(m[1])*3.28084;
  const ft = loa.match(/([\d.]+)\s*(ft|')/i); if (ft) return parseFloat(ft[1]);
  const n = parseFloat(loa); return !isNaN(n) ? (n>25?n:n*3.28084) : 100;
}
function parseYear(yr: string|number): number {
  const y = parseInt(String(yr).split("/")[0].split("-")[0]);
  return y>1960&&y<2030 ? y : 2010;
}
function parseGallons(val: string|number|undefined): number {
  if (!val) return 0;
  const s = String(val).replace(/,/g,"").replace(/[^\d.]/g,"");
  return parseFloat(s)||0;
}
function parseKnots(val: string|number|undefined): number {
  if (!val) return 0;
  const s = String(val).replace(/[^\d.]/g,"");
  return parseFloat(s)||0;
}
function r5(n: number) { return Math.round(n/5000)*5000; }
function r1(n: number) { return Math.round(n/1000)*1000; }

/* ─── CONSERVATIVE LOA — always round up to the next 5-foot mark ─────────
   A 90ft vessel bills as 95ft at the yard and marina.
   A 120ft vessel bills as 125ft. Adds a 1-5ft safety buffer on every model. */
function conservativeLoa(lft: number): number {
  return Math.floor(lft / 5) * 5 + 5;
}
/* ─── USAGE PATTERNS ──────────────────────────────────────────────────────── */
const USAGE_PATTERNS: Record<string,[number,number,number]> = {
  light_private:  [100,200,350],
  normal_private: [200,350,600],
  active_owner:   [350,600,900],
  charter_heavy:  [550,850,1300],
};

/* ─── CONDITION RATING ────────────────────────────────────────────────────── */
const CONDITION_FACTORS: Record<string,number> = {
  excellent:0.05, good:0.10, average:0.20, deferred:0.40, unknown:0.25,
};

/* ─── COMPLEXITY MODIFIER ─────────────────────────────────────────────────── */
const COMPLEXITY_MULT: Record<string,number> = {
  simple:0.90, normal:1.00, high:1.15, very_high:1.30,
};
// Auto-infer complexity from finish + age if not provided
function inferComplexity(finish: string, age: number): string {
  if (finish==="explorer") return "high";
  if (finish==="luxury" && age>15) return "high";
  if (finish==="luxury") return "high"; // luxury vessels are complex by default
  return "normal";
}
function applyComplexity(s:{low:number;mid:number;high:number}, mult:number) {
  return {low:r5(s.low*mult), mid:r5(s.mid*mult), high:r5(s.high*mult)};
}

/* ─── SIZE BRACKET ────────────────────────────────────────────────────────── */
type Band = "b70"|"b100"|"b130"|"b160"|"b190";
function band(lft:number):Band {
  if(lft<100)return"b70";if(lft<130)return"b100";if(lft<160)return"b130";if(lft<190)return"b160";return"b190";
}

/* ─── CREW SALARY TABLE ───────────────────────────────────────────────────── */
const SAL: Record<string,Record<Band,[number,number,number]>> = {
  captain:       {b70:[84,102,120],b100:[120,138,156],b130:[156,174,192],b160:[192,210,228],b190:[228,260,295]},
  first_officer: {b70:[54,60,66],  b100:[66,72,78],  b130:[78,84,90],   b160:[90,93,95],   b190:[102,115,130]},
  bosun:         {b70:[48,51,54],  b100:[54,57,60],  b130:[60,63,66],   b160:[66,69,72],   b190:[66,72,80]},
  deckhand:      {b70:[42,45,48],  b100:[48,51,54],  b130:[54,57,60],   b160:[60,63,66],   b190:[60,66,72]},
  chief_engineer:{b70:[72,78,84],  b100:[84,90,96],  b130:[96,108,120], b160:[120,132,144],b190:[144,162,180]},
  asst_engineer: {b70:[48,54,60],  b100:[60,63,66],  b130:[66,69,72],   b160:[72,78,84],   b190:[84,90,100]},
  chef_culinary: {b70:[60,66,72],  b100:[72,78,84],  b130:[84,90,96],   b160:[96,102,108], b190:[108,118,130]},
  chef_cook:     {b70:[54,57,60],  b100:[60,63,66],  b130:[66,69,72],   b160:[72,78,84],   b190:[84,90,100]},
  chief_stew:    {b70:[54,57,60],  b100:[60,63,66],  b130:[66,69,72],   b160:[72,78,84],   b190:[84,90,100]},
  stew_2nd:      {b70:[42,45,48],  b100:[48,51,54],  b130:[54,57,60],   b160:[60,63,66],   b190:[66,72,78]},
  stew_3rd:      {b70:[40,43,46],  b100:[45,48,52],  b130:[50,53,57],   b160:[55,58,62],   b190:[60,65,72]},
  eto_av:        {b70:[55,62,70],  b100:[65,73,82],  b130:[78,87,96],   b160:[90,100,112], b190:[105,118,132]},
};
const DAY_RATE_CAP: Record<Band,[number,number,number]> = {
  b70:[385,425,480],b100:[435,475,540],b130:[485,530,600],b160:[560,625,710],b190:[660,750,850],
};
function salScenario(key:string,b:Band){const t=SAL[key]?.[b]??SAL.deckhand[b];return{low:t[0]*1000,mid:t[1]*1000,high:t[2]*1000};}

/* ─── FUEL — 4-level hierarchy ────────────────────────────────────────────── */
interface FuelResult {
  low:number; mid:number; high:number;
  gphMid:number; basis:string; confidence:"high"|"medium"|"low";
}

function calcFuelHierarchy(opts:{
  knownGph?:number;
  hpTotal:number; hullType:string; lft:number;
  hrs:[number,number,number];
  fuelCapacityGal?:number; rangeNm?:number; cruiseSpeed?:number;
}): FuelResult {
  const {knownGph,hpTotal,hullType,lft,hrs,fuelCapacityGal,rangeNm,cruiseSpeed} = opts;
  const prices=[4.60,5.10,5.70];
  const factor=1.15; // generator + tender add-on fallback

  function calc(gph:number):FuelResult["low"|"mid"|"high"]{return r5(gph*hrs[0]*prices[0]*factor);}
  function calcAll(gph:number){
    return{low:r5(gph*hrs[0]*prices[0]*factor),mid:r5(gph*hrs[1]*prices[1]*factor),high:r5(gph*hrs[2]*prices[2]*factor)};
  }
  void calc;

  // Priority 1 — user-supplied known GPH
  if (knownGph&&knownGph>0) {
    return {...calcAll(knownGph),gphMid:knownGph,
      basis:`Known: ${knownGph} GPH at cruise (captain/survey/builder data)`,confidence:"high"};
  }

  // Priority 2 — range-derived GPH: (fuelCap × 0.90) ÷ (range ÷ speed)
  if (fuelCapacityGal&&fuelCapacityGal>100&&rangeNm&&rangeNm>50&&cruiseSpeed&&cruiseSpeed>3) {
    const rangeHrs = rangeNm/cruiseSpeed;
    const rangeGph = (fuelCapacityGal*0.90)/rangeHrs;
    // Cross-check against HP formula — range figures are often optimistic
    const loads:{[k:string]:[number,number,number]}={displacement:[0.22,0.32,0.48],semi:[0.35,0.52,0.72],planing:[0.52,0.68,0.88]};
    const hpMidLoad=(loads[hullType]??loads.semi)[1];
    const hpGph = hpTotal>0 ? (hpTotal*hpMidLoad*0.40)/7.2 : 0;
    const useGph = (hpGph===0||rangeGph>=hpGph*0.70) ? rangeGph : hpGph*0.85;
    const flagged = hpGph>0&&rangeGph<hpGph*0.70;
    return {...calcAll(useGph),gphMid:Math.round(useGph),
      basis:`Range-derived: ${Math.round(rangeGph)} GPH (${fuelCapacityGal.toFixed(0)} gal ÷ ${rangeNm} nm @ ${cruiseSpeed} kt)${flagged?" · capped vs HP formula — listing range may be optimistic":""}`,
      confidence:"medium"};
  }

  // Priority 3 — HP physics formula
  if (hpTotal>0) {
    const loads:{[k:string]:[number,number,number]}={displacement:[0.22,0.32,0.48],semi:[0.35,0.52,0.72],planing:[0.52,0.68,0.88]};
    const load=loads[hullType]??loads.semi;
    const gph=(i:number)=>(hpTotal*load[i]*0.40)/7.2;
    const midGph=Math.round(gph(1));
    return {low:r5(gph(0)*hrs[0]*prices[0]*factor),mid:r5(gph(1)*hrs[1]*prices[1]*factor),high:r5(gph(2)*hrs[2]*prices[2]*factor),gphMid:midGph,
      basis:`HP formula: ~${midGph} GPH from ${hpTotal}HP ${hullType} hull at cruise load`,confidence:"medium"};
  }

  // Priority 4 — LOA fallback
  const gphFb = hullType==="planing"?lft*0.50:hullType==="semi"?lft*0.30:lft*0.15;
  return {...calcAll(gphFb),gphMid:Math.round(gphFb),
    basis:`LOA estimate: ${Math.round(gphFb)} GPH estimated from vessel length — provide HP or known burn for accuracy`,confidence:"low"};
}

/* ─── CORRECTIVE REPAIR ───────────────────────────────────────────────────── */
function correctiveRepair(eng:{low:number;mid:number;high:number},condition:string){
  const f=CONDITION_FACTORS[condition]??CONDITION_FACTORS.unknown;
  return{low:r5(eng.low*f),mid:r5(eng.mid*f),high:r5(eng.high*f)};
}

/* ─── INSURANCE ───────────────────────────────────────────────────────────── */
function calcHullInsurance(av:number,age:number,isCharter:boolean){
  let r=0.0110;
  if(age>20)r+=0.0030;else if(age>15)r+=0.0020;else if(age>10)r+=0.0010;
  if(isCharter)r+=0.0025;
  return{low:r5(av*(r-0.0035)),mid:r5(av*r),high:r5(av*(r+0.0055))};
}
function estimatedAgreedValue(lft:number):number{
  if(lft<60)return 600000;if(lft<70)return 1100000;if(lft<80)return 2000000;
  if(lft<90)return 3200000;if(lft<100)return 4500000;if(lft<115)return 6500000;
  if(lft<130)return 9500000;if(lft<150)return 14000000;if(lft<165)return 19000000;
  if(lft<185)return 26000000;return 38000000;
}
// Parse an asking price string from a listing ("$4,500,000", "$4.5M", "4500000", etc.)
function parseAskingPrice(price:string|undefined|null):number|null{
  if(!price)return null;
  const s=String(price).replace(/[$,\s]/g,"").toUpperCase();
  const mMatch=s.match(/^([\d.]+)M$/);if(mMatch)return parseFloat(mMatch[1])*1_000_000;
  const kMatch=s.match(/^([\d.]+)K$/);if(kMatch)return parseFloat(kMatch[1])*1_000;
  const n=parseFloat(s.replace(/[^0-9.]/g,""));
  return(!isNaN(n)&&n>=100_000)?n:null;
}

/* ─── DOCKAGE — split into 3 visible subcomponents ───────────────────────── */
function dockageBreakdown(lft:number,port:string){
  const p=port.toLowerCase();
  let rates:[number,number,number];
  // Low = private dock / mooring ball / budget municipal
  // Mid = standard full-service private marina
  // High = premium mega-yacht facility, peak-season rates
  if(p.includes("mediterr")||p.includes(" med"))rates=[40,105,210];
  else if(p.includes("florida")||p.includes("east"))rates=[18,68,125];
  else if(p.includes("gulf"))rates=[14,52,95];
  else if(p.includes("caribbean"))rates=[15,55,105];
  else if(p.includes("pacific")||p.includes("alaska"))rates=[18,45,82];
  else if(p.includes("worldwide")||p.includes("expedi"))rates=[22,78,155];
  else rates=[18,68,125];
  const hb={low:r5(lft*rates[0]*12),mid:r5(lft*rates[1]*12),high:r5(lft*rates[2]*12)};
  const tr={low:r5(hb.low*0.18),mid:r5(hb.mid*0.18),high:r5(hb.high*0.18)};
  const pd={low:r5(hb.low*0.10),mid:r5(hb.mid*0.10),high:r5(hb.high*0.10)};
  return{
    homeBerth:hb, transient:tr, portDues:pd,
    total:{low:r5(hb.low+tr.low+pd.low),mid:r5(hb.mid+tr.mid+pd.mid),high:r5(hb.high+tr.high+pd.high)},
  };
}

/* ─── HAUL-OUT ────────────────────────────────────────────────────────────── */
function haulAntifoul(lft:number,port:string){
  const biennial=port.toLowerCase().includes("alaska")||port.toLowerCase().includes("pacific north");
  // $/LOA-ft: full annual bottom job — haul fee, blocking, 2-coat antifoul, zincs, prop polish
  // Warm water (annual): $170-400/ft · Cold water biennial ÷2: $90-200/ft
  const r=biennial?[90,140,200]:[170,255,400];
  return{low:r5(lft*r[0]),mid:r5(lft*r[1]),high:r5(lft*r[2])};
}

/* ─── ROUTINE ENGINEERING ─────────────────────────────────────────────────── */
function routineEngineering(lft:number,age:number,hpTotal:number){
  const hpBonus=Math.round(hpTotal/100)*800;
  const af=age>20?1.45:age>15?1.30:age>10?1.18:age>5?1.08:1.0;
  const base=lft*700*af+hpBonus;
  return{low:r5(base*0.70),mid:r5(base),high:r5(base*1.45)};
}

/* ─── RESERVE PLANNING — optional, NOT in headline total ─────────────────── */
function buildReservePlan(lft:number,lm:number,age:number,hpTotal:number,finish:string){
  const hpe=(hpTotal>0?hpTotal:lft*12)/2;
  const ovCost=hpe<300?35000:hpe<600?65000:hpe<1200?120000:hpe<2000?185000:280000;
  const ovInterval=hpe>=1200?17000:13000;
  const midHrs=350; // normal private mid
  const engAnnual=r5((ovCost*2)*(midHrs/ovInterval));
  const ageF=age>15?1.4:age>8?1.2:1.0;
  
  // Paint (annualised job ÷ cycle)
  const paintJob=lft*(finish==="explorer"?100:finish==="standard"?230:520);
  const paintCycle=finish==="explorer"?3:finish==="standard"?6:7;
  const paint={low:r5(paintJob*0.80/paintCycle),mid:r5(paintJob/paintCycle),high:r5(paintJob*1.35/paintCycle)};
  
  // Teak (luxury vessels only)
  const teakAnnual=finish==="luxury"?r5(lm*600*ageF):0;
  const teak={low:r5(teakAnnual*0.60),mid:teakAnnual,high:r5(teakAnnual*1.80)};

  // Engines
  const engines={low:r5(engAnnual*0.65),mid:r5(engAnnual),high:r5(engAnnual*1.50)};
  
  // Generators
  const gens={low:r5(lm*400*ageF),mid:r5(lm*750*ageF),high:r5(lm*1400*ageF)};
  
  // Stabilizers
  const stab=age>10?{low:r5(lm*300),mid:r5(lm*600),high:r5(lm*1100)}:{low:0,mid:0,high:0};
  
  // Electronics / Nav (refresh every 8yr)
  const elec={low:r5(lm*500),mid:r5(lm*950),high:r5(lm*1800)};
  
  // AV / IT (refresh every 5yr)
  const av={low:r5(lm*250),mid:r5(lm*500),high:r5(lm*950)};
  
  // Soft goods / interior (every 8yr)
  const soft={low:r5(lm*300),mid:r5(lm*600),high:r5(lm*1200)};
  
  // Tenders / toys (replacement every 7yr)
  const tenders={low:r5(lm*350),mid:r5(lm*700),high:r5(lm*1400)};
  
  // Class survey (biennial / 5yr special — amortised)
  const survey={low:r5(lm*150),mid:r5(lm*280),high:r5(lm*520)};
  
  // Other / contingency
  const other={low:r5(lm*180),mid:r5(lm*360),high:r5(lm*720)};

  const items=[paint,teak,engines,gens,stab,elec,av,soft,tenders,survey,other];
  type S3={low:number;mid:number;high:number};
  const total={
    low:items.reduce((a:number,b:S3)=>a+b.low,0),
    mid:items.reduce((a:number,b:S3)=>a+b.mid,0),
    high:items.reduce((a:number,b:S3)=>a+b.high,0),
  };

  return{paint,teak,engines,generators:gens,stabilizers:stab,electronics:elec,avIT:av,
         softGoods:soft,tenders,classSurvey:survey,other,total};
}

/* ─── CREW ────────────────────────────────────────────────────────────────── */
interface PositionResult{role:string;low:number;mid:number;high:number;}
const POSITION_LABELS:Record<string,string>={
  captain:"Captain",first_officer:"First Officer / Chief Officer",bosun:"Bosun / 2nd Mate",
  deckhand:"Deckhand",deckhand_2:"2nd Deckhand",chief_engineer:"Chief Engineer",
  asst_engineer:"Assistant Engineer / 2nd Engineer",chef_culinary:"Chef (Culinary-Trained)",
  chef_cook:"Chef / Cook",chief_stew:"Chief Stewardess",stew_2nd:"2nd Stewardess",
  stew_3rd:"3rd Stewardess",eto_av:"ETO / AV-IT Technician",
};
function dayRateCaptainAnnual(lft:number){const r=DAY_RATE_CAP[band(lft)];return{low:r5(r[0]*60),mid:r5(r[1]*100),high:r5(r[2]*160)};}
function buildCrewFromPositions(keys:string[],lft:number,isDayRate:boolean){
  const b=band(lft);const breakdown:PositionResult[]=[];
  for(const key of keys){const sal=(key==="captain"&&isDayRate)?dayRateCaptainAnnual(lft):salScenario(key==="deckhand_2"?"deckhand":key,b);breakdown.push({role:POSITION_LABELS[key]??key,...sal});}
  return{breakdown,totals:{low:breakdown.reduce((s,p)=>s+p.low,0),mid:breakdown.reduce((s,p)=>s+p.mid,0),high:breakdown.reduce((s,p)=>s+p.high,0)},count:keys.length,fullTimeCount:keys.filter(k=>!(k==="captain"&&isDayRate)).length};
}
function crewPresetPositions(preset:string,lft:number):{keys:string[];isDayRate:boolean}{
  if(preset==="owner")return{keys:[],isDayRate:false};if(preset==="captain_day")return{keys:["captain"],isDayRate:true};
  if(preset==="captain_only")return{keys:["captain"],isDayRate:false};if(preset==="captain_mate")return{keys:["captain","bosun"],isDayRate:false};
  if(preset==="cap_eng_stew")return{keys:["captain","chief_engineer","chief_stew"],isDayRate:false};
  if(preset==="full_private"){const b=["captain","chief_engineer","chef_culinary","chief_stew","deckhand"];if(lft>=130)b.push("stew_2nd");return{keys:b,isDayRate:false};}
  if(preset==="charter"){const b=["captain","chief_engineer","chef_culinary","chief_stew","stew_2nd","deckhand"];if(lft>=130){b.push("bosun");b.push("stew_3rd");}return{keys:b,isDayRate:false};}
  return{keys:[],isDayRate:false};
}
function crewSupportCosts(ftc:number,total:number,isLux:boolean){
  const r1l=(n:number)=>Math.round(n/1000)*1000; void isLux;
  return{
    foodBeverage:{low:r5(ftc*10*365),mid:r5(ftc*16*365),high:r5(ftc*26*365)}, // $10/$16/$26 per person/day
    crewHealth:{low:r5(ftc*4500),mid:r5(ftc*6000),high:r5(ftc*8500)},
    recruitment:{low:r1l(total*2500),mid:r1l(total*4000),high:r1l(total*7500)},
    travel:{low:r1l(ftc*3500),mid:r1l(ftc*5200),high:r1l(ftc*9000)},
    accommodation:{low:r1l(ftc*900),mid:r1l(ftc*1500),high:r1l(ftc*2600)},
    uniforms:{low:r1l(ftc*1000),mid:r1l(ftc*1600),high:r1l(ftc*2600)},
    training:{low:r1l(ftc*1400),mid:r1l(ftc*2200),high:r1l(ftc*3800)},
    medical:{low:r1l(ftc*800),mid:r1l(ftc*1300),high:r1l(ftc*2200)},
    dayWorkers:{low:r1l(8000),mid:r1l(ftc>0?14000:4000),high:r1l(28000)},
    entertainment:{low:r1l(ftc*450+1000),mid:r1l(ftc*800+1500),high:r1l(ftc*1500+3000)},
  };
}

/* ─── OPERATIONS, COMMS, ADMIN ────────────────────────────────────────────── */
function operationsItems(lft:number,lm:number,isLux:boolean){
  const gL=r5(Math.max(18000,lm*680)),gM=r5(Math.max(28000,lm*1100)),gH=r5(Math.max(55000,lm*1900));
  return{
    agency:{low:r1(lm*240),mid:r1(lm*440),high:r1(lm*800)},
    audioVisual:{low:r1(lm*70),mid:r1(lm*150),high:r1(lm*280)},
    auto:{low:r1(lm*80),mid:r1(lm*150),high:r1(lm*265)},
    bridge:{low:r1(lm*90),mid:r1(lm*165),high:r1(lm*285)},
    computer:{low:r1(lm*80),mid:r1(lm*150),high:r1(lm*260)},
    deck:{low:r1(lm*300),mid:r1(lm*520),high:r1(lm*880)},
    dockExpress:{low:r1(lm*55),mid:r1(lm*105),high:r1(lm*185)},
    galley:{low:gL,mid:gM,high:gH},
    interior:{low:r5(lm*(isLux?550:300)),mid:r5(lm*(isLux?1000:520)),high:r5(lm*(isLux?1600:820))},
    launches:{low:r1(lm*130),mid:r1(lm*230),high:r1(lm*420)},
    mailFreight:{low:r1(lm*50),mid:r1(lm*95),high:r1(lm*170)},
    office:{low:r1(lm*60),mid:r1(lm*110),high:r1(lm*190)},
    safetyMedical:{low:r1(lm*105),mid:r1(lm*190),high:r1(lm*345)},
    security:{low:r1(lm*60),mid:r1(lm*120),high:r1(lm*240)},
    survey:{low:r1(lm*160),mid:r1(lm*285),high:r1(lm*500)},
    warehousing:{low:r1(lm*75),mid:r1(lm*145),high:r1(lm*255)},
    lft, // pass through for complexity
  };
}
function commsItems(){return{phone:{low:7000,mid:10000,high:15000},satTV:{low:5000,mid:7000,high:11000},satcom:{low:18000,mid:28000,high:46000}};}
function adminItems(lm:number){return{professionalFees:{low:r1(lm*320),mid:r1(lm*580),high:r1(lm*1000)},bankCharges:{low:3000,mid:4500,high:7500},managementTravel:{low:r1(lm*80),mid:r1(lm*155),high:r1(lm*280)}};}
function managementFee(tier:string,sub:{low:number;mid:number;high:number}){
  if(tier==="admin")return{low:15000,mid:25000,high:40000};
  if(tier==="full")return{low:r5(sub.low*0.045),mid:r5(sub.mid*0.062),high:r5(sub.high*0.085)};
  return{low:0,mid:0,high:0};
}
function piAndCrewHealth(hm:{low:number;mid:number;high:number},ftc:number){
  return{pi:{low:r5(hm.low*0.10),mid:r5(hm.mid*0.10),high:r5(hm.high*0.10)},crewHealth:{low:r5(ftc*4500),mid:r5(ftc*6000),high:r5(ftc*8500)}};
}

/* ─── BUILD BUDGET ────────────────────────────────────────────────────────── */
function buildBudget(opts:{
  lft:number;lm:number;yr:number;age:number;hpTotal:number;hullType:string;
  agreedHullValue:number;annualHrsTriple:[number,number,number];port:string;
  finish:string;hullMaterial:string;positionKeys:string[];isDayRateCaptain:boolean;
  managementTier:string;vesselCondition:string;complexity:string;
  knownGph?:number;fuelCapacityGal?:number;rangeNm?:number;cruiseSpeed?:number;
  includeReservePlanning:boolean;
}){
  const{lft,lm,age,hpTotal,hullType,agreedHullValue,annualHrsTriple,port,
        finish,positionKeys,isDayRateCaptain,managementTier,vesselCondition,complexity,
        knownGph,fuelCapacityGal,rangeNm,cruiseSpeed,includeReservePlanning}=opts;
  const isLux=finish==="luxury";
  const complexMult=COMPLEXITY_MULT[complexity]??1.0;

  // Conservative LOA — always the next 5-foot mark above actual (90ft→95ft, 120ft→125ft)
  // Used for all LOA-based costs. Crew salaries and hull value use actual LOA.
  const cLft = conservativeLoa(lft);
  const cLm  = cLft / 3.28084;

  const crew    =buildCrewFromPositions(positionKeys,lft,isDayRateCaptain);  // actual LOA for salary brackets
  const support =crewSupportCosts(crew.fullTimeCount,crew.count,isLux);
  const fuelRes =calcFuelHierarchy({knownGph,hpTotal,hullType,lft,hrs:annualHrsTriple,fuelCapacityGal,rangeNm,cruiseSpeed});
  const hm      =calcHullInsurance(agreedHullValue,age,false);               // hull value-based, not LOA
  const{pi,crewHealth}=piAndCrewHealth(hm,crew.fullTimeCount);
  const dock    =dockageBreakdown(cLft,port);                                 // conservative LOA
  const engBase =routineEngineering(cLft,age,hpTotal>0?hpTotal:cLft*12);    // conservative LOA
  // Apply complexity to engineering, then corrective
  const eng     =applyComplexity(engBase,complexMult);
  const corrective=correctiveRepair(eng,vesselCondition);
  const opsBase =operationsItems(cLft,cLm,isLux);                            // conservative LOA
  // Apply complexity to deck, interior, survey, safety
  const ops={...opsBase,
    deck:    applyComplexity(opsBase.deck,complexMult),
    interior:applyComplexity(opsBase.interior,complexMult),
    survey:  applyComplexity(opsBase.survey,complexMult),
    safetyMedical:applyComplexity(opsBase.safetyMedical,complexMult),
  };
  const comms   =commsItems();
  const admin   =adminItems(cLm);                                             // conservative LOA
  const haul    =haulAntifoul(cLft,port);                                    // conservative LOA
  const reservePlan=includeReservePlanning?buildReservePlan(cLft,cLm,age,hpTotal>0?hpTotal:cLft*12,finish):null;

  const capitalEvents={disclaimer:`This model covers annual operating costs only. Major capital events — full paint refits, engine overhauls, electronics upgrades, and interior refits — are excluded. These vary enormously by vessel condition, engine hours, and maintenance history and cannot be responsibly estimated without a full pre-purchase survey. Plan for them as a separate budget conversation with your broker and captain.`};

  type S3={low:number;mid:number;high:number};
  const allItems:S3[]=[
    crew.totals,support.foodBeverage,support.recruitment,support.travel,support.accommodation,
    support.uniforms,support.training,support.medical,support.dayWorkers,support.entertainment,
    comms.phone,comms.satTV,comms.satcom,
    eng,corrective,fuelRes,dock.total,haul,
    ops.galley,ops.interior,ops.agency,ops.audioVisual,ops.auto,ops.bridge,ops.computer,
    ops.deck,ops.dockExpress,ops.launches,ops.mailFreight,ops.office,ops.safetyMedical,
    ops.security,ops.survey,ops.warehousing,
    hm,pi,crewHealth,admin.professionalFees,admin.bankCharges,admin.managementTravel,
  ];
  const subTotal:S3={low:allItems.reduce((a,b)=>a+b.low,0),mid:allItems.reduce((a,b)=>a+b.mid,0),high:allItems.reduce((a,b)=>a+b.high,0)};
  const mgmtFee=managementFee(managementTier,subTotal);
  const grandTotal:S3={low:subTotal.low+mgmtFee.low,mid:subTotal.mid+mgmtFee.mid,high:subTotal.high+mgmtFee.high};

  const model={
    crew:{salaries:{...crew.totals,breakdown:crew.breakdown},recruitment:support.recruitment,travel:support.travel,
          accommodation:support.accommodation,uniforms:support.uniforms,training:support.training,
          foodBeverage:support.foodBeverage,medical:support.medical,dayWorkers:support.dayWorkers,entertainment:support.entertainment},
    communications:{phone:comms.phone,satTV:comms.satTV,satcom:comms.satcom},
    operations:{
      agency:ops.agency,audioVisual:ops.audioVisual,auto:ops.auto,bridge:ops.bridge,computer:ops.computer,
      deck:ops.deck,dockExpress:ops.dockExpress,engineering:eng,corrective,
      fuels:{low:fuelRes.low,mid:fuelRes.mid,high:fuelRes.high},
      fuelBasis:fuelRes.basis, fuelConfidence:fuelRes.confidence, fuelGphMid:fuelRes.gphMid,
      galley:ops.galley,interior:ops.interior,launches:ops.launches,mailFreight:ops.mailFreight,
      office:ops.office,
      // Dockage — split into 3 lines + total
      dockage:dock.total, dockageHomeBerth:dock.homeBerth, dockageTransient:dock.transient, dockagePortDues:dock.portDues,
      safetyMedical:ops.safetyMedical,security:ops.security,survey:ops.survey,warehousing:ops.warehousing,
    },
    insurance:{hull:hm,pi,crewHealth},
    administrative:{professionalFees:admin.professionalFees,bankCharges:admin.bankCharges,managementFee:mgmtFee,managementTravel:admin.managementTravel},
    capital:{haulAntifoul:haul,av:{low:0,mid:0,high:0},engineeringDeck:{low:0,mid:0,high:0},interior:{low:0,mid:0,high:0},paint:{low:0,mid:0,high:0},tendersToys:{low:0,mid:0,high:0},other:{low:0,mid:0,high:0}},
    capitalEvents,
    reservePlan: reservePlan ?? null,
  };

  const perCrew={salJr:{low:45000,mid:58000,high:75000},foodDaily:{low:34,mid:isLux?48:38,high:65},health:{low:4500,mid:6000,high:8500},travel:{low:3500,mid:5200,high:9000},uniform:{low:1000,mid:1600,high:2600},training:{low:1400,mid:2200,high:3800},namedSalaries:crew.breakdown};

  return{model,grandTotal,subTotal,crew,perCrew,agreedHullValue};
}

/* ─── POST HANDLER ────────────────────────────────────────────────────────── */
export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const{
      vessel,url,agreedHullValue,engineHpTotal,hullType="semi",
      usagePattern="normal_private",annualHours,
      homePort="Florida / US East Coast",vesselFinish="luxury",
      managementTier="none",vesselCondition="unknown",
      vesselComplexity,                    // optional: simple/normal/high/very_high
      knownGph,                            // optional: user-supplied actual GPH
      segment = "super",                   // "super" | "small"
      crewMode = "full_private",           // small-vessel crew arrangement
      crewPreset: crewPresetArg,           // explicit preset overrides segment/crewMode
      customPositions,
      includeReservePlanning=false,        // optional: add reserve planning section
    }=body;

    // Resolve crew preset: explicit arg wins, then derive from segment+crewMode
    const crewPreset: string = crewPresetArg ?? (
      segment==="small"
        ? (crewMode==="owner"?"owner":crewMode==="captain_mate"?"captain_mate":"captain_day")
        : "full_private"
    );

    const v:Record<string,string>=vessel||{};
    const lft=parseLoaFt(v.loa||"100");
    const lm=lft/3.28084;
    const yr=parseYear(v.year||"2010");
    const age=2026-yr;
    const hpTotal=engineHpTotal||0;
    // Hull value — priority: user override → asking price from listing → LOA table
    const askingPrice = parseAskingPrice(v.price || v.askingPrice);
    const hullValue = agreedHullValue || askingPrice || estimatedAgreedValue(lft);
    const hullValueSource = agreedHullValue?"user-entered":askingPrice?"listing asking price (use as insurance value starting point — confirm with broker)":"LOA-based estimate (no price data found)";

    // Resolve hours
    const patternHrs=USAGE_PATTERNS[usagePattern];
    const midHrs=annualHours??patternHrs?.[1]??350;
    const annualHrsTriple:[number,number,number]=patternHrs??[Math.round(midHrs*0.55),midHrs,Math.round(midHrs*1.55)];

    // Fuel data from listing scrape
    const fuelCapacityGal=parseGallons(v.fuelCapacity)||undefined;
    const rangeNm=parseKnots(v.range)||undefined;
    const cruiseSpeed=parseKnots(v.cruiseSpeed)||parseKnots(v.speedCruise)||undefined;

    // Complexity — use provided or infer
    const complexity=vesselComplexity??inferComplexity(vesselFinish,age);

    // Crew
    let positionKeys:string[];let isDayRateCaptain:boolean;
    if(crewPreset==="custom"&&customPositions?.length){
      positionKeys=(customPositions as string[]).map((k:string)=>k==="captain_day"?"captain":k);
      isDayRateCaptain=(customPositions as string[]).includes("captain_day");
    }else{const preset=crewPresetPositions(crewPreset,lft);positionKeys=preset.keys;isDayRateCaptain=preset.isDayRate;}

    const budget=buildBudget({
      lft,lm,yr,age,hpTotal,hullType,agreedHullValue:hullValue,
      annualHrsTriple,port:homePort,finish:vesselFinish,
      hullMaterial:(v.hullMaterial||v.hull||"").toLowerCase(),
      positionKeys,isDayRateCaptain,managementTier,vesselCondition,complexity,
      knownGph:knownGph||undefined,fuelCapacityGal,rangeNm,cruiseSpeed,
      includeReservePlanning,
    });

    const gt=budget.grandTotal;const crew=budget.crew;
    const m=budget.model;
    const crewLine=crew.breakdown.length===0?"owner-operated, no paid crew":crew.breakdown.map(p=>`${p.role} ($${Math.round(p.mid/1000)}K)`).join(", ");
    const conditionLabel:Record<string,string>={excellent:"Excellent",good:"Good",average:"Average",deferred:"Deferred",unknown:"Unknown (no survey)"};

    const prompt=`You are a senior yacht management advisor. Write narrative for an estimated annual operating budget.
VESSEL: ${[v.name||"Vessel",v.builder?`by ${v.builder}`:"",yr?`(${yr})`:"",v.loa?`· ${v.loa}`:`· ${lft.toFixed(0)}ft`,hpTotal?`· ${hpTotal}HP ${hullType}`:""].filter(Boolean).join(" ")}
PROFILE: ${usagePattern} · ${annualHrsTriple[1]} hrs mid · ${homePort} · ${vesselFinish} · ${hullType} · complexity: ${complexity}
CONDITION: ${conditionLabel[vesselCondition]??vesselCondition}
FUEL BASIS: ${m.operations.fuelBasis} (confidence: ${m.operations.fuelConfidence})
CREW: ${crewLine} | salaries mid: $${crew.totals.mid.toLocaleString()}
HULL VALUE: $${(hullValue/1000000).toFixed(1)}M · MANAGEMENT: ${managementTier==="none"?"owner-managed":managementTier}
BUDGET: LOW $${gt.low.toLocaleString()} | MID $${gt.mid.toLocaleString()} | HIGH $${gt.high.toLocaleString()}
Respond with ONLY this JSON object — no preamble, no markdown fences.
{"assumptions":"2-3 sentences: crew, hull value, usage pattern, condition, fuel confidence level.","rangeExplanation":"2-3 sentences: what drives the spread — hours, dockage, corrective repair, complexity.","categoryBreakdown":"3-4 sentences: 4 biggest cost categories, mid dollar, % of total.","crewStructureNote":"2-3 sentences: crew package, positions, total cost, what removing one saves.","keyDrivers":"4 bullets: biggest cost drivers for this specific vessel."}`;

    const condL=conditionLabel[vesselCondition]??vesselCondition;
    let narrative={
      assumptions:`${age}-year-old vessel at $${(hullValue/1000000).toFixed(1)}M insured value. Condition: ${condL}. Usage: ${usagePattern} (${annualHrsTriple[0]}/${annualHrsTriple[1]}/${annualHrsTriple[2]} hrs). Fuel: ${m.operations.fuelBasis}. Crew: ${crewLine||"none"}.`,
      rangeExplanation:`Low (${annualHrsTriple[0]} hrs) reflects light use, economy dockage, and minimal corrective exposure. High (${annualHrsTriple[2]} hrs) reflects active use, premium berths, and elevated corrective repair.`,
      categoryBreakdown:`Crew ($${crew.totals.mid.toLocaleString()}, ~${Math.round(crew.totals.mid/gt.mid*100)}%) is the largest category. Insurance on the $${(hullValue/1000000).toFixed(1)}M hull, engineering and corrective repair, and dockage follow.`,
      crewStructureNote:crewLine==="owner-operated, no paid crew"?"Vessel is owner-operated — no professional crew cost in this model.":
        `Crew: ${crewLine}. Total mid: $${crew.totals.mid.toLocaleString()}. Removing one junior position typically saves $80-110K/yr fully loaded.`,
      keyDrivers:`• H&M insurance on $${(hullValue/1000000).toFixed(1)}M hull is the primary fixed cost. • ${hullType==="planing"?"High HP planing hull — fuel scales directly with hours.":hullType==="displacement"?"Displacement hull is fuel-efficient — fuel modest relative to size.":"Semi-displacement hull — fuel scales with hours."} • ${age>15?`At ${age} years, corrective allowance is elevated (${Math.round((CONDITION_FACTORS[vesselCondition]??0.25)*100)}% of routine engineering based on ${condL} condition).`:`At ${age} years, vessel is in early service life — corrective exposure is low.`} • ${complexity!=="normal"?`Complexity modifier (${complexity}) applied to engineering, deck, interior, and survey — vessel systems add ${Math.round((COMPLEXITY_MULT[complexity]??1.0-1)*100)}% to these categories.`:"Dockage in "+homePort+" is a significant fixed annual cost at this vessel size."}`
    };

    try{
      const aiRes=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},signal:AbortSignal.timeout(40000),body:JSON.stringify({model:"claude-opus-4-6",max_tokens:1800,messages:[{role:"user",content:prompt}]})});
      if(aiRes.ok){const aiData=await aiRes.json() as{content?:{type:string;text?:string}[]};const raw=aiData.content?.find(b=>b.type==="text")?.text||"";const s=raw.indexOf("{"),e=raw.lastIndexOf("}");if(s!==-1&&e>s){const p=JSON.parse(raw.slice(s,e+1));if(p.assumptions)narrative.assumptions=p.assumptions;if(p.rangeExplanation)narrative.rangeExplanation=p.rangeExplanation;if(p.categoryBreakdown)narrative.categoryBreakdown=p.categoryBreakdown;if(p.crewStructureNote)narrative.crewStructureNote=p.crewStructureNote;if(p.keyDrivers)narrative.keyDrivers=p.keyDrivers;}}
    }catch{/*non-fatal*/}

    const model={
      vesselName:v.name||"Vessel",vesselUrl:url||"",
      _meta:{crewCount:crew.count,fullTimeCount:crew.fullTimeCount,loa_m:lm,loa_ft:lft,buildYear:yr,age,hullType,hpTotal,agreedHullValue:hullValue,hullValueSource,conservativeLft:conservativeLoa(lft),managementTier,crewPreset,vesselCondition,usagePattern,annualHrsTriple,complexity,fuelBasis:m.operations.fuelBasis,fuelConfidence:m.operations.fuelConfidence,fuelGphMid:m.operations.fuelGphMid,perCrew:budget.perCrew,positionKeys,isDayRateCaptain},
      segment, crewMode,
      ...budget.model,...narrative,
    };
    return NextResponse.json({ok:true,model});
  }catch(err){
    console.error("Ownership generate error:",err);
    return NextResponse.json({ok:false,error:err instanceof Error?err.message:"Generation failed"},{status:500});
  }
}
