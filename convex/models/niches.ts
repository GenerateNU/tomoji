import { v, type Infer } from "convex/values";
import { apiError } from "../lib/errors";

/**
 * The fixed niche list. Opportunities and creators store niches by `name`, so
 * when niches move to a table (so anyone can add one), `name` becomes that
 * table's key and stored values keep working. Never rename a `name`; change
 * the `label` instead.
 */
export const NICHES = [
  { name: "llms", label: "LLMs" },
  { name: "ai-agents", label: "AI Agents" },
  { name: "machine-learning", label: "Machine Learning" },
  { name: "generative-ai", label: "Generative AI" },
  { name: "developer-tools", label: "Developer Tools" },
  { name: "web-development", label: "Web Development" },
  { name: "mobile-development", label: "Mobile Development" },
  { name: "devops", label: "DevOps & Cloud" },
  { name: "databases", label: "Databases" },
  { name: "data-science", label: "Data Science" },
  { name: "cybersecurity", label: "Cybersecurity" },
  { name: "open-source", label: "Open Source" },
  { name: "programming", label: "Programming Languages" },
  { name: "startups", label: "Startups & SaaS" },
  { name: "productivity", label: "Productivity Tools" },
  { name: "no-code", label: "No-Code & Low-Code" },
  { name: "hardware", label: "Hardware & Gadgets" },
  { name: "game-dev", label: "Game Development" },
  { name: "web3", label: "Web3 & Crypto" },
  { name: "design", label: "Product & UX Design" },
  { name: "tech-careers", label: "Tech Careers" },
] as const;

export const niche = v.object({ name: v.string(), label: v.string() });
export type Niche = Infer<typeof niche>;

/** Most niches an opportunity or creator can pick, so tags stay meaningful. */
export const MAX_NICHES = 5;

const NICHE_NAMES: ReadonlySet<string> = new Set(NICHES.map((entry) => entry.name));

/**
 * Returns the stored name for a niche. Input is matched loosely: case and
 * surrounding spaces are ignored, and spaces or underscores between words
 * count as hyphens, so `"AI Agents"` and `"ai_agents"` both mean `ai-agents`.
 *
 * @throws `invalid_state` with `invalid_niche` if it isn't on the list.
 */
export function requireNiche(input: string): string {
  const name = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (!NICHE_NAMES.has(name)) {
    throw apiError("invalid_state", { reason: "invalid_niche", niche: input });
  }
  return name;
}

/**
 * Returns the stored names with repeats removed (after normalizing, so
 * `"LLMs"` and `"llms"` count once), keeping their order.
 *
 * @throws `invalid_state` with `invalid_niche` for a name not on the list, or
 * `too_many_niches` for more than `MAX_NICHES`.
 */
export function requireNiches(names: string[]): string[] {
  const unique = [...new Set(names.map(requireNiche))];
  if (unique.length > MAX_NICHES) {
    throw apiError("invalid_state", { reason: "too_many_niches", max: MAX_NICHES });
  }
  return unique;
}
