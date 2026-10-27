import { apiError } from "../lib/errors";
import {
  catalogOption,
  listCatalogOptions,
  requireCatalogOption,
  type CatalogOption,
} from "./catalog";

/**
 * The 46 options in Figma's Niches engineering note (5386:3183), in design order.
 * Reuse existing stored names for corresponding options; labels follow the design.
 */
export const NICHES = [
  { name: "frontend-development", label: "Frontend Development" },
  { name: "backend-development", label: "Backend Development" },
  { name: "full-stack-development", label: "Full-Stack Development" },
  { name: "mobile-development", label: "Mobile App Development" },
  { name: "web-development", label: "Web Development" },
  { name: "databases", label: "Database Management" },
  { name: "cloud-computing", label: "Cloud Computing" },
  { name: "devops", label: "DevOps & Infrastructure" },
  { name: "site-reliability-engineering", label: "Site Reliability Engineering" },
  { name: "systems-design-architecture", label: "Systems Design & Architecture" },
  { name: "api-development", label: "API Development" },
  { name: "software-testing-qa", label: "Software Testing & QA" },
  { name: "cybersecurity", label: "Cybersecurity" },
  { name: "networking", label: "Networking" },
  { name: "data-science", label: "Data Science" },
  { name: "data-engineering", label: "Data Engineering" },
  { name: "data-analytics-business-intelligence", label: "Data Analytics & Business Intelligence" },
  { name: "artificial-intelligence", label: "Artificial Intelligence" },
  { name: "machine-learning", label: "Machine Learning" },
  { name: "generative-ai", label: "Generative AI & LLMs" },
  { name: "robotics", label: "Robotics" },
  { name: "embedded-systems-iot", label: "Embedded Systems & IoT" },
  { name: "hardware", label: "Hardware & Electronics" },
  { name: "game-dev", label: "Game Development" },
  { name: "ar-vr", label: "AR / VR" },
  { name: "web3", label: "Blockchain & Web3" },
  { name: "open-source", label: "Open Source" },
  { name: "developer-tools", label: "Developer Tools & Productivity" },
  { name: "programming", label: "Programming Languages" },
  { name: "computer-science-fundamentals", label: "Computer Science Fundamentals" },
  { name: "algorithms-data-structures", label: "Algorithms & Data Structures" },
  { name: "interview-prep-coding-challenges", label: "Interview Prep & Coding Challenges" },
  { name: "design", label: "UI / UX Design" },
  { name: "product-management", label: "Product Management" },
  { name: "technical-writing-documentation", label: "Technical Writing & Documentation" },
  { name: "tech-careers", label: "Tech Careers & Job Hunting" },
  { name: "startups", label: "Startups & Entrepreneurship" },
  { name: "freelancing-indie-hacking", label: "Freelancing & Indie Hacking" },
  { name: "no-code", label: "No-Code / Low-Code" },
  { name: "automation-scripting", label: "Automation & Scripting" },
  { name: "operating-systems-linux", label: "Operating Systems & Linux" },
  { name: "it-sysadmin", label: "IT & Sysadmin" },
  { name: "quantum-computing", label: "Quantum Computing" },
  { name: "tech-news-industry-trends", label: "Tech News & Industry Trends" },
  { name: "tech-reviews-gadgets", label: "Tech Reviews & Gadgets" },
  { name: "learning-to-code", label: "Learning to Code / Beginners" },
  // Keep these legacy selections available; they are not separate options in Figma.
  // Do not merge their saved values without an explicit migration decision.
  { name: "llms", label: "LLMs" },
  { name: "ai-agents", label: "AI Agents" },
  { name: "productivity", label: "Productivity Tools" },
] as const;

export const niche = catalogOption;
export type Niche = CatalogOption;

/** Most niches an opportunity or creator can pick, so tags stay meaningful. */
export const MAX_NICHES = 5;

/** Lists the predefined niche options, optionally matching a name or display label. */
export function listNiches(search?: string): Niche[] {
  return listCatalogOptions(NICHES, search);
}

/**
 * Returns the stored name for a niche. Input is matched loosely: case and
 * surrounding spaces are ignored, and spaces or underscores between words
 * count as hyphens, so `"AI Agents"` and `"ai_agents"` both mean `ai-agents`.
 *
 * @throws `invalid_state` with `invalid_niche` if it isn't on the list.
 */
export function requireNiche(input: string): string {
  return requireCatalogOption(NICHES, input, "niche");
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
