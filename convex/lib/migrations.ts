import { Migrations } from "@convex-dev/migrations";
import { components } from "../_generated/api";
import { internalMutation } from "../_generated/server";

export const migrations = new Migrations(components.migrations, { internalMutation });
