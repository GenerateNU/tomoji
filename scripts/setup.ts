/**
 * Creates .env.local from the template if it doesn't exist yet, then prints
 * the remaining first-day steps.
 */
import { copyFileSync, existsSync } from "node:fs";

const TEMPLATE = ".env.template";
const TARGET = ".env.local";

if (existsSync(TARGET)) {
  console.log(`${TARGET} already exists — leaving it alone.`);
} else {
  copyFileSync(TEMPLATE, TARGET);
  console.log(`Created ${TARGET} from ${TEMPLATE}.`);
}

console.log(`
Next:
  1. Fill in the WORKOS_* values in ${TARGET} (ask a TL)
  2. just bd           # creates your Convex dev deployment
  3. just convex-env   # give that deployment the WorkOS client id
`);
