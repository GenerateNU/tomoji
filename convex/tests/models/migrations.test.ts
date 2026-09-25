import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { normalizeLegacyUser } from "../../models/migrations";

const legacyUser = {
  workosId: "workos_legacy",
  name: "María del Carmen García",
  email: "maria@example.com",
  role: "creator" as const,
  isActive: true,
};

describe("normalizeLegacyUser", () => {
  test("preserves an unsplit legacy name without guessing its parts", () => {
    const replacement = normalizeLegacyUser(legacyUser);

    expect(replacement).toEqual({
      workosId: "workos_legacy",
      firstName: "María del Carmen García",
      lastName: "",
      email: "maria@example.com",
      role: "creator",
      isActive: true,
    });
  });

  test("uses authoritative name parts when the legacy record has none", () => {
    expect(
      normalizeLegacyUser(legacyUser, { firstName: "María del Carmen", lastName: "García" }),
    ).toMatchObject({ firstName: "María del Carmen", lastName: "García" });
  });

  test.each([
    [{ firstName: "Stored" }, { firstName: "Source", lastName: "Family" }, "Stored", "Family"],
    [{ lastName: "Stored" }, { firstName: "Given", lastName: "Source" }, "Given", "Stored"],
    [{ firstName: "", lastName: "" }, { firstName: "Source", lastName: "Name" }, "", ""],
    [{ lastName: "Known" }, null, "", "Known"],
    [{}, { firstName: null, lastName: "Known" }, "", "Known"],
    [{}, { firstName: "", lastName: null }, "", ""],
  ])("preserves independently supplied name parts (%j)", (stored, source, firstName, lastName) => {
    expect(normalizeLegacyUser({ ...legacyUser, ...stored }, source)).toMatchObject({
      firstName,
      lastName,
    });
  });

  test("falls back to the intact legacy name when cached name parts are missing", () => {
    expect(normalizeLegacyUser(legacyUser, { firstName: null, lastName: undefined })).toMatchObject(
      { firstName: legacyUser.name, lastName: "" },
    );
  });

  test("retains the email display fallback without putting an email in name fields", () => {
    expect(normalizeLegacyUser({ ...legacyUser, name: legacyUser.email })).toMatchObject({
      firstName: "",
      lastName: "",
    });
    expect(normalizeLegacyUser({ ...legacyUser, name: undefined })).toMatchObject({
      firstName: "",
      lastName: "",
    });
  });

  test("preserves identity, permissions, inactivity, and profile while omitting system fields", () => {
    const original = {
      ...legacyUser,
      _id: "existing_user" as Id<"users">,
      _creationTime: 123,
      role: "operator" as const,
      isActive: false,
      profilePicture: "https://example.com/avatar.jpg",
    };

    const replacement = normalizeLegacyUser(original);

    expect(replacement).toEqual({
      workosId: original.workosId,
      email: original.email,
      role: original.role,
      isActive: original.isActive,
      profilePicture: original.profilePicture,
      firstName: original.name,
      lastName: "",
    });
    expect(original).toHaveProperty("name", legacyUser.name);
    expect(original).toHaveProperty("_id", "existing_user");
  });

  test("is idempotent even if the cached source changes after migration", () => {
    const migrated = normalizeLegacyUser(legacyUser);
    expect(normalizeLegacyUser(migrated, { firstName: "Different", lastName: "Person" })).toEqual(
      migrated,
    );
  });
});
