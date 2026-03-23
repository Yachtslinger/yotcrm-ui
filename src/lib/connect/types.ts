// src/lib/connect/types.ts
// Connect engine — shared TypeScript types

export type ConnectLead = {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  notes: string;
  budget_min: string;
  budget_max: string;
  loa_min: string;
  loa_max: string;
  year_min: string;
  year_max: string;
  make_preference: string;
  preferred_location: string;
  vessel_type_pref: string;
  flybridge_pref: string;
  stabilizers_pref: string;
  min_cabins: string;
  engine_type_pref: string;
  last_contacted_at: string;
  updated_at: string;
  created_at: string;
};

export type ConnectVessel = {
  price?: string;
  loa?: string;
  location?: string;
  classification?: string;
  hullMaterial?: string;
  flybridge?: string;
  stabilisers?: string;
  engines?: string;
  staterooms?: string;
  guestCabins?: string;
  description?: string;
  features?: string[];
  maxSpeed?: string;
  cruiseSpeed?: string;
  range?: string;
  lastDrydock?: string;
  lastService?: string;
  beam?: string;
  draft?: string;
};

export type ConnectBrochure = {
  id: number;
  slug: string;
  vessel_name: string;
  builder: string;
  year: number | null;
  source_url: string;
  created_at: string;
  is_pocket_listing: number;
  vessel: ConnectVessel;
};

export type ScoreBreakdown = {
  price_fit: number;
  length_fit: number;
  year_fit: number;
  builder_fit: number;
  category_fit: number;
  flybridge_fit: number;
  stabilizers_fit: number;
  cabins_fit: number;
  engine_fit: number;
  location_fit: number;
  listing_freshness: number;
  engagement_boost: number;
  exposure_decay: number;
  broker_override: number;
  total: number;
};

export type ExplanationReason = {
  label: string;
  impact: number;
  field: string;
};

export type CautionFlag = {
  label: string;
  severity: 'low' | 'medium' | 'high';
};

export type NextAction = {
  action: string;
  label: string;
  reason: string;
};

export type ConnectExplanation = {
  summary_sentence: string;
  top_reasons: ExplanationReason[];
  top_penalties: ExplanationReason[];
  caution_flags: CautionFlag[];
  next_best_action: NextAction;
  score_breakdown: ScoreBreakdown;
  routing_reason: string;
};

export type ConnectScoreResult = {
  score: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  routing: 'manual_queue' | 'bot_queue' | 'suppressed';
  hardFail: boolean;
  hardFailReason?: string;
  explanation: ConnectExplanation;
};

export type MatchRow = {
  id: number;
  lead_id: number;
  brochure_id: number;
  score: number;
  confidence: string;
  routing: string;
  manual_priority_score: number;
  score_version: number;
  is_stale: number;
  scored_at: string;
};

export type MatchListItem = {
  id: number;
  lead_id: number;
  brochure_id: number;
  score: number;
  confidence: string;
  routing: string;
  manual_priority_score: number;
  scored_at: string;
  // Lead fields
  lead_name: string;
  lead_email: string;
  lead_status: string;
  // Brochure fields
  vessel_name: string;
  builder: string;
  year: number | null;
  slug: string;
  // Explanation summary
  summary_sentence: string;
  top_reasons: ExplanationReason[];
  // Exposure
  sent_count: number;
  last_sent_at: string | null;
};

export type MatchDetail = MatchRow & {
  lead: ConnectLead;
  brochure: ConnectBrochure;
  explanation: ConnectExplanation | null;
  exposure_history: ExposureEntry[];
  active_override: OverrideRow | null;
};

export type ExposureEntry = {
  id: number;
  sent_at: string;
  channel: string;
  sent_by: string;
  score_at_send: number;
};

export type OverrideRow = {
  id: number;
  override_type: string;
  boost_value: number;
  reason: string;
  expires_at: string | null;
  created_at: string;
};
