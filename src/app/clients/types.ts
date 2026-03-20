export type Boat = {
  id: number;
  make: string;
  model: string;
  year: string;
  length: string;
  price: string;
  location: string;
  listing_url: string;
  source_email: string;
  added_at: string;
};

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string[];
  status?: string;
  notes: string;
  source?: string;
  createdAt?: number | string;
  boats?: Boat[];
  // Flat fields for backward compat (first boat)
  boat_make?: string;
  boat_model?: string;
  boat_year?: string;
  boat_length?: string;
  boat_price?: string;
  boat_location?: string;
  listing_url?: string;
  intel_score?: number | null;
  intel_band?: string | null;
  occupation?: string;
  employer?: string;
  city?: string;
  state?: string;
  zip?: string;
  linkedin_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  twitter_url?: string;
  net_worth_range?: string;
  net_worth_confidence?: string;
  board_positions?: string;
  yacht_clubs?: string;
  nonprofit_roles?: string;
  total_donations?: string;
  property_summary?: string;
  wikipedia_url?: string;
  website_url?: string;
  media_mentions?: number;
  // Deep background fields
  estimated_net_worth?: string;
  net_worth_breakdown?: string;
  date_of_birth?: string;
  age?: string;
  spouse_name?: string;
  spouse_employer?: string;
  primary_address?: string;
  secondary_addresses?: string;
  identity_confidence?: number;
  identity_verifications?: string;
  manual_corrections?: string;
  // Phase 3: reverify deep dive
  court_records?: string;
  professional_history?: string;
  relatives?: string;
  additional_properties?: string;
  reverify_status?: string;
  broker_notes?: string;
  // ── Buyer Criteria (Phase 3) — feed directly into matching engine ──────────
  budget_min?: string;       // e.g. "1000000"
  budget_max?: string;       // e.g. "3500000"
  loa_min?: string;          // feet e.g. "70"
  loa_max?: string;          // feet e.g. "95"
  year_min?: string;         // e.g. "2015"
  year_max?: string;         // e.g. "2024"
  make_preference?: string;  // e.g. "Azimut"
  preferred_location?: string; // e.g. "Florida, Mediterranean"
  vessel_type_pref?: string; // motor_yacht | sailing | explorer | sport | catamaran | mega
  flybridge_pref?: string;   // yes | no | any
  stabilizers_pref?: string; // yes | no
  min_cabins?: string;       // "3"
  engine_type_pref?: string; // diesel | gas | hybrid
};
