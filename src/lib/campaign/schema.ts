import { z, Infer } from "../../vendor/zod";

export const TemplateIdSchema = z.enum(["listing", "announcement", "event"]);
export type TemplateId = Infer<typeof TemplateIdSchema>;

export const MediaAssetSchema = z.object({
  src: z.string().default(""),
  width: z.number().int().positive().default(1200),
  height: z.number().int().positive().default(675),
  alt: z.string().default(""),
  tags: z.array(z.string()).default([]),
});
export type MediaAsset = Infer<typeof MediaAssetSchema>;

export const BrokerCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().email(),
  headshotSrc: z.string().optional(),
});
export type BrokerCard = Infer<typeof BrokerCardSchema>;

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
});
export type NormalizedSpecs = Infer<typeof NormalizedSpecsSchema>;

const FooterSchema = z.object({
  disclaimer: z.string().default("You are receiving this email because you requested updates."),
});

const UTMSchema = z.object({
  source: z.string().default("email"),
  medium: z.string().default("campaign"),
  campaign: z.string().default(""),
  content: z.string().default(""),
});

const CtaSchema = z.object({
  label: z.string().default("Book a Tour"),
  href: z.string().default("https://denisonyachting.com"),
});

export const CampaignDataSchema = z.object({
  templateId: TemplateIdSchema,
  title: z.string().default(""),
  subtitle: z.string().default(""),
  hero: MediaAssetSchema,
  gallery: z.array(MediaAssetSchema).default([]),
  specs: NormalizedSpecsSchema,
  brokers: z.array(BrokerCardSchema).max(3).default([]),
  cta: CtaSchema,
  footer: FooterSchema,
  features: z.array(z.string()).default([]),
  utm: UTMSchema,
  bannerUrl: z.string().default("https://www.denisonyachtsales.com/wp-content/uploads/2023/08/Rectangle-557.png"),
});
export type CampaignData = Infer<typeof CampaignDataSchema>;

export function createBlankCampaignData(templateId: TemplateId): CampaignData {
  return CampaignDataSchema.parse({
    templateId,
    title: "",
    subtitle: "",
    hero: MediaAssetSchema.parse({
      src: "https://via.placeholder.com/1200x675/0B1A2B/FFFFFF?text=Hero",
      width: 1200,
      height: 675,
      alt: "",
      tags: ["hero"],
    }),
    gallery: [],
    specs: {},
    brokers: [],
    cta: {},
    footer: {},
    features: [],
    utm: {},
    bannerUrl: undefined,
  });
}
