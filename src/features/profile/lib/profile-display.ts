/** Older accounts can use their email as a name fallback; keep that private. */
export function profileDisplayName(profile: {
  firstName: string;
  lastName: string;
  email: string;
}): string {
  return (
    [profile.firstName, profile.lastName]
      .map((part) => part.trim())
      .filter((part) => part && part.toLowerCase() !== profile.email.trim().toLowerCase())
      .join(" ") || "Your profile"
  );
}

export function ageFromBirthdate(dateOfBirth: number | undefined, now: number): number | null {
  if (dateOfBirth === undefined || !Number.isFinite(dateOfBirth)) return null;
  const birthdate = new Date(dateOfBirth);
  const today = new Date(now);
  let age = today.getUTCFullYear() - birthdate.getUTCFullYear();
  if (
    today.getUTCMonth() < birthdate.getUTCMonth() ||
    (today.getUTCMonth() === birthdate.getUTCMonth() && today.getUTCDate() < birthdate.getUTCDate())
  ) {
    age -= 1;
  }
  return age < 0 ? null : age;
}
