import { TextLink } from "./text-link";

/** The way back for someone who remembered their password after all. */
export function BackToLogIn() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      Remembered it? <TextLink href="/login">Log in</TextLink>
    </p>
  );
}
