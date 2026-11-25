import { CompanyAvatar as DesignSystemCompanyAvatar } from "@/components/ui/avatar";

/**
 * The company mark on opportunity cards, rows, and the modal: the design
 * system's 24px company avatar with the first letter of the name, until
 * companies have logos on the feed. Hidden from screen readers because the
 * company name always sits beside it.
 */
export function CompanyAvatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex shrink-0">
      <DesignSystemCompanyAvatar size={24} initials={name.slice(0, 1).toUpperCase()} />
    </span>
  );
}
