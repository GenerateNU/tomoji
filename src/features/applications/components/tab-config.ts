import type { ApplicationSortKey, ApplicationTab } from "../hooks/use-applications-table";

export type TableColumn = {
  label: string;
  sortKey: ApplicationSortKey;
  className?: string;
};

export type TabConfig = {
  noun: string;
  tableTitle: string;
  /** Every tab is named by its tab, so the table keeps its title for screen readers only. */
  hideTitle: boolean;
  /** Whether a row opens the offer. */
  opensModal: boolean;
  columns: TableColumn[];
};

const NAME_COLUMN = { label: "Name", sortKey: "name" } as const;
const COMPANY_COLUMN = { label: "Company", sortKey: "company" } as const;
const COMPENSATION_COLUMN = {
  label: "Compensation",
  sortKey: "compensation",
} as const;
const SUBMITTED_COLUMN = {
  label: "Submitted",
  sortKey: "submitted",
  className: "w-[15%]",
} as const;

export const TAB_CONFIG: Record<ApplicationTab, TabConfig> = {
  applications: {
    noun: "applications",
    tableTitle: "Applications",
    hideTitle: true,
    opensModal: false,
    columns: [
      { ...NAME_COLUMN, className: "w-[40%]" },
      { ...COMPANY_COLUMN, className: "w-[15%]" },
      { label: "Status", sortKey: "status", className: "w-[15%]" },
      SUBMITTED_COLUMN,
      COMPENSATION_COLUMN,
    ],
  },
  // The Offers tab's third column is when the offer ends, not where it stands.
  offers: {
    noun: "offers",
    tableTitle: "Offers",
    hideTitle: true,
    opensModal: true,
    columns: [
      { ...NAME_COLUMN, className: "w-[40%]" },
      { ...COMPANY_COLUMN, className: "w-[15%]" },
      { label: "Expiration date", sortKey: "expires", className: "w-[15%]" },
      SUBMITTED_COLUMN,
      COMPENSATION_COLUMN,
    ],
  },
  accepted: {
    noun: "accepted offers",
    tableTitle: "Accepted offers",
    hideTitle: true,
    opensModal: true,
    columns: [
      { ...NAME_COLUMN, className: "w-[40%]" },
      { ...COMPANY_COLUMN, className: "w-[20%]" },
      { label: "Accepted", sortKey: "accepted", className: "w-[20%]" },
      COMPENSATION_COLUMN,
    ],
  },
};
