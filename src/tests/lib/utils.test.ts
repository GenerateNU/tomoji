import { describe, expect, test } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  test("keeps a design-system text size beside a text color", () => {
    expect(cn("text-body-sm text-muted-foreground")).toBe("text-body-sm text-muted-foreground");
    expect(cn("text-heading-lg text-primary")).toBe("text-heading-lg text-primary");
  });

  test("lets a later text size replace an earlier one", () => {
    expect(cn("text-body text-body-sm")).toBe("text-body-sm");
    expect(cn("text-sm text-heading-xxl")).toBe("text-heading-xxl");
  });
});
