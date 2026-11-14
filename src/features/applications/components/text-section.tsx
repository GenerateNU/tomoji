import { Section } from "./section";

/** A labelled paragraph, left out entirely when the company wrote nothing. */
export function TextSection({ label, text }: { label: string; text: string }) {
  if (text.trim() === "") return null;
  return (
    <Section label={label}>
      <p className="whitespace-pre-line">{text}</p>
    </Section>
  );
}
