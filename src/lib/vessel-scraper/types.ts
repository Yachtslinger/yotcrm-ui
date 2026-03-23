/**
 * VesselData — the canonical full-detail vessel record.
 * Used by both the brochure generator and campaign importer.
 * Every field is optional; scrapers fill what they can, users fill the rest.
 */
export interface VesselImage {
  src: string;
  alt: string;
  category?: "exterior" | "interior" | "technical" | "";
}

export interface VesselVideo {
  url: string;          // embeddable URL
  thumbnail?: string;   // poster image
  title?: string;
  type: "youtube" | "bunny" | "vimeo" | "other";
}

export interface VesselData {
  // ── Identity ──────────────────────────────────────────────────────────────
  name:           string;
  builder:        string;
  year:           number | null;
  location:       string;
  price:          string;
  stockNumber:    string;
  sourceUrl:      string;

  // ── Classification ───────────────────────────────────────────────────────
  classification: string;
  grossTonnage:   string;
  flagState:      string;

  // ── Dimensions ───────────────────────────────────────────────────────────
  loa:            string;   // Length Overall (metres or feet)
  lwl:            string;   // Length Waterline
  beam:           string;
  draft:          string;
  displacement:   string;

  // ── Hull & Design ─────────────────────────────────────────────────────────
  hullForm:       string;   // e.g. "Displacement monohull"
  hullMaterial:   string;   // e.g. "Steel hull, aluminium superstructure"
  superstructure: string;
  exteriorDesign: string;
  interiorDesign: string;
  navalArchitect: string;

  // ── Propulsion ────────────────────────────────────────────────────────────
  engines:        string;
  power:          string;   // e.g. "2 × 820 kW"
  gearbox:        string;
  propulsion:     string;   // e.g. "Twin shaft"
  propellers:     string;
  gensets:        string;
  bowThruster:    string;
  sternThruster:  string;
  airCon:         string;

  // ── Performance ───────────────────────────────────────────────────────────
  maxSpeed:       string;
  cruiseSpeed:    string;
  range:          string;   // e.g. "4,000 nm at 10 kn"

  // ── Tanks ─────────────────────────────────────────────────────────────────
  fuelTank:       string;
  freshWater:     string;
  holdingTank:    string;
  lubeOil:        string;

  // ── Accommodation ─────────────────────────────────────────────────────────
  guests:         string;
  staterooms:     string;
  crew:           string;
  crewCabins:     string;
  tender:         string;   // tender / garage description
  livingSpace:    string;   // total interior area

  // ── Systems ───────────────────────────────────────────────────────────────
  navigation:     string;
  stabilisers:    string;
  waterMaker:     string;

  // ── Extended fields (new) ─────────────────────────────────────────────────
  vatStatus?:      string;
  askingPriceEUR?: string;
  hullNumber?:     string;
  homePort?:       string;
  freeboard?:      string;
  keelType?:       string;
  deckMaterial?:   string;
  deckCount?:      string;
  navalClass?:     string;     // page key: navClass — alias handled in emptyVessel
  navClass?:       string;     // page-canonical name
  refitYear?:      string;
  refitDetails?:   string;
  paintSystem?:    string;
  windowGlazing?:  string;
  interiorStyle?:  string;
  colorScheme?:    string;
  engineHours?:    string;
  shaftCount?:     string;
  stabiliserMake?: string;     // alias
  stabilisersMake?: string;    // page-canonical name
  zeroSpeedStabs?: string;     // alias
  zeroSpeedStabilisers?: string; // page-canonical name
  economySpeed?:   string;
  rangeEconomy?:   string;     // alias
  transitRange?:   string;     // page-canonical name
  generatorKW?:    string;
  emergencyGen?:   string;     // alias
  emergencyGenerator?: string; // page-canonical name
  airConMake?:     string;
  shorepower?:     string;
  voltageSystem?:  string;
  fuelType?:       string;
  greyWater?:      string;
  sewageTreatment?: string;
  waterMakerCapacity?: string;
  lubeOilCapacity?: string;
  ownersCabin?:    string;
  guestCabins?:    string;
  crewMess?:       string;
  flybridge?:      string;
  beachClub?:      string;
  swimmingPlatform?: string;
  jacuzzi?:        string;
  gym?:            string;
  cinema?:         string;
  tenderCount?:    string;
  toys?:           string;
  garage?:         string;
  radar?:          string;
  chartPlotter?:   string;
  autopilot?:      string;
  satcom?:         string;
  aisSystem?:      string;
  anchoring?:      string;
  windlass?:       string;
  fireSuppression?: string;
  lifeRafts?:      string;
  mobSystem?:      string;
  helideck?:       string;
  lastSurvey?:     string;
  lastDrydock?:    string;
  lastService?:    string;
  imoNumber?:      string;
  mmsiNumber?:     string;
  registryPort?:   string;
  beamMax?:        string;
  draftMin?:       string;
  airDraft?:       string;
  gaImages?:       VesselImage[];

  // ── Davit / crane ─────────────────────────────────────────────────────────
  davitMake?:      string;   // e.g. "Opacmare", "Besenzoni", "Mar Quipt"
  davitModel?:     string;
  davitCapacity?:  string;   // e.g. "3 ton", "3,000 kg SWL"

  // ── Generator detail ──────────────────────────────────────────────────────
  generatorHours?: string;   // separate from generatorKW

  // ── Engine split fields ───────────────────────────────────────────────────
  engineMake?:     string;   // manufacturer only, e.g. "MTU", "CAT", "MAN"
  engineModel?:    string;   // model only, e.g. "12V 4000 M93"

  // ── Tender detail ─────────────────────────────────────────────────────────
  tenderMake?:     string;
  tenderModel?:    string;
  tenderLength?:   string;
  tenderHp?:       string;

  // ── Fuel consumption ─────────────────────────────────────────────────────
  fuelConsumption?: string;  // e.g. "450 lt/hr at cruise"

  // ── AI extraction metadata ────────────────────────────────────────────────
  aiExtracted?:    boolean;  // true if Layer 3 ran successfully

  // ── Content ───────────────────────────────────────────────────────────────
  description:    string;
  features:       string[];
  images:         VesselImage[];
  videos?:        VesselVideo[];
}

export function emptyVessel(sourceUrl = ""): VesselData {
  return {
    name: "", builder: "", year: null, location: "", price: "",
    stockNumber: "", sourceUrl,
    classification: "", grossTonnage: "", flagState: "",
    loa: "", lwl: "", beam: "", draft: "", displacement: "",
    hullForm: "", hullMaterial: "", superstructure: "",
    exteriorDesign: "", interiorDesign: "", navalArchitect: "",
    engines: "", power: "", gearbox: "", propulsion: "",
    propellers: "", gensets: "", bowThruster: "", sternThruster: "", airCon: "",
    maxSpeed: "", cruiseSpeed: "", range: "",
    fuelTank: "", freshWater: "", holdingTank: "", lubeOil: "",
    guests: "", staterooms: "", crew: "", crewCabins: "",
    tender: "", livingSpace: "",
    navigation: "", stabilisers: "", waterMaker: "",
    description: "", features: [], images: [],
  };
}

/** Full empty vessel with all extended fields initialised to empty string */
export function emptyVesselFull(sourceUrl = ""): VesselData {
  return {
    ...emptyVessel(sourceUrl),
    deckMaterial: "", deckCount: "", navalClass: "", refitYear: "", refitDetails: "",
    engineHours: "", shaftCount: "", generatorKW: "", airConMake: "",
    fuelType: "", greyWater: "", sewageTreatment: "", waterMakerCapacity: "",
    ownersCabin: "", guestCabins: "", crewMess: "",
    flybridge: "", beachClub: "", jacuzzi: "", gym: "", tenderCount: "", toys: "", garage: "",
    radar: "", satcom: "", aisSystem: "",
    fireSuppression: "", lastSurvey: "", lastDrydock: "",
    colorScheme: "", imoNumber: "", mmsiNumber: "", registryPort: "",
    beamMax: "", draftMin: "", airDraft: "",
    paintSystem: "", windowGlazing: "", interiorStyle: "",
    shorepower: "", voltageSystem: "", transitRange: "",
    gaImages: [],
  };
}
