import { z } from "zod";

export const TemplateIdSchema = z.enum(["listing", "announcement", "event"]);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const MediaAssetSchema = z.object({
  src: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().default(""),
  tags: z.array(z.enum(["exterior", "interior", "hero", "profile", "detail", "misc"])).default([]),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const NormalizedSpecsSchema = z.object({
  length: z.string().default(""),
  beam: z.string().default(""),
  draft: z.string().default(""),
  year: z.string().default(""),
  staterooms: z.string().default(""),
  power: z.string().default(""),
  builder: z.string().default(""),
  model: z.string().default(""),
  location: z.string().default(""),
  price: z.string().default(""),
  raw: z.string().default(""),
});
export type NormalizedSpecs = z.infer<typeof NormalizedSpecsSchema>;

export const BrokerCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  phone: z.string(),
  email: z.string().email(),
  headshotSrc: z.string().url().optional(),
});
export type BrokerCard = z.infer<typeof BrokerCardSchema>;

const CtaSchema = z.object({
  label: z.string(),
  href: z.string().url(),
});

const FooterSchema = z.object({
  disclaimer: z.string().default("You are receiving this email because you requested updates."),
  links: z.array(z.object({ label: z.string(), href: z.string().url() })).default([]),
});

const UtmSchema = z.object({
  source: z.string().default("campaign"),
  medium: z.string().default("email"),
  campaign: z.string().default(""),
  content: z.string().default(""),
});

export const CampaignDataSchema = z.object({
  templateId: TemplateIdSchema,
  title: z.string(),
  subtitle: z.string().default(""),
  hero: MediaAssetSchema,
  gallery: z.array(MediaAssetSchema).default([]),
  specs: NormalizedSpecsSchema,
  brokers: z.array(BrokerCardSchema).max(3),
  cta: CtaSchema,
  features: z.array(z.string()).default([]),
  footer: FooterSchema,
  utm: UtmSchema,
});
export type CampaignData = z.infer<typeof CampaignDataSchema>;

export function createBlankCampaignData(templateId: TemplateId): CampaignData {
  return CampaignDataSchema.parse({
    templateId,
    title: "",
    subtitle: "",
    hero: {
      src: "https://via.placeholder.com/1200x675?text=Hero",
      width: 1200,
      height: 675,
      alt: "",
      tags: ["hero"],
    },
    gallery: [],
    specs: {},
    brokers: [],
    cta: { label: "Book a Tour", href: "https://denisonyachting.com" },
    features: [],
    footer: {},
    utm: {},
  });
}
