import { DocSection } from "@/features/design-system/components/docs/section";

type Swatch = { step: string; hex: string; className: string };

const SCALES: { name: string; swatches: Swatch[] }[] = [
  {
    name: "blue",
    swatches: [
      { step: "primary", hex: "#3122ff", className: "bg-blue-primary" },
      { step: "subtle", hex: "#e6ebff", className: "bg-blue-subtle" },
      { step: "superlight", hex: "#f6f8ff", className: "bg-blue-superlight" },
    ],
  },
  {
    name: "mint",
    swatches: [
      { step: "primary", hex: "#24ffc8", className: "bg-mint-primary" },
      { step: "subtle", hex: "#e5fff9", className: "bg-mint-subtle" },
    ],
  },
  {
    name: "gray",
    swatches: [
      { step: "950", hex: "#050505", className: "bg-gray-950" },
      { step: "900", hex: "#18181b", className: "bg-gray-900" },
      { step: "800", hex: "#313135", className: "bg-gray-800" },
      { step: "700", hex: "#4a4a4f", className: "bg-gray-700" },
      { step: "600", hex: "#62626a", className: "bg-gray-600" },
      { step: "500", hex: "#7b7b84", className: "bg-gray-500" },
      { step: "400", hex: "#95959d", className: "bg-gray-400" },
      { step: "300", hex: "#b0b0b5", className: "bg-gray-300" },
      { step: "200", hex: "#cacace", className: "bg-gray-200" },
      { step: "100", hex: "#e5e5e6", className: "bg-gray-100" },
      { step: "50", hex: "#f2f2f3", className: "bg-gray-50" },
      { step: "25", hex: "#f8f8f9", className: "bg-gray-25" },
      { step: "10", hex: "#fcfcfd", className: "bg-gray-10" },
      { step: "0", hex: "#ffffff", className: "bg-gray-0" },
    ],
  },
  {
    name: "red",
    swatches: [
      { step: "50", hex: "#fef2f2", className: "bg-red-50" },
      { step: "100", hex: "#ffe2e2", className: "bg-red-100" },
      { step: "200", hex: "#ffc9c9", className: "bg-red-200" },
      { step: "300", hex: "#ffa2a2", className: "bg-red-300" },
      { step: "400", hex: "#ff6467", className: "bg-red-400" },
      { step: "500", hex: "#fb2c36", className: "bg-red-500" },
      { step: "600", hex: "#e7000b", className: "bg-red-600" },
      { step: "700", hex: "#c10007", className: "bg-red-700" },
      { step: "800", hex: "#9f0712", className: "bg-red-800" },
      { step: "900", hex: "#82181a", className: "bg-red-900" },
      { step: "950", hex: "#460809", className: "bg-red-950" },
    ],
  },
];

const ROLES: { token: string; hex: string; usedFor: string }[] = [
  {
    token: "mint-primary",
    hex: "#24ffc8",
    usedFor: "Special buttons, reserved for a premium product or tier; almost never used",
  },
  {
    token: "blue-primary",
    hex: "#3122ff",
    usedFor: "Primary buttons, selection (checkbox, switch, chips, tabs), focus borders",
  },
  {
    token: "blue-subtle",
    hex: "#e6ebff",
    usedFor: "Subtle primary buttons, success tints, selected cards",
  },
  { token: "gray-950", hex: "#050505", usedFor: "Primary text, secondary buttons" },
  { token: "gray-500", hex: "#7b7b84", usedFor: "Secondary text, labels, metadata" },
  { token: "gray-200", hex: "#cacace", usedFor: "Borders and dividers" },
  {
    token: "gray-50",
    hex: "#f2f2f3",
    usedFor: "Subtle secondary buttons, unread and hover tints",
  },
  { token: "gray-10", hex: "#fcfcfd", usedFor: "Sidebar backgrounds" },
  {
    token: "gray-0",
    hex: "#ffffff",
    usedFor: "Surfaces; text on primary and secondary buttons",
  },
  { token: "red-50", hex: "#fef2f2", usedFor: "Error fills (inputs, banners, warnings)" },
  { token: "red-600", hex: "#e7000b", usedFor: "Error borders and messages" },
  { token: "red-700", hex: "#c10007", usedFor: "Destructive text and icons" },
];

export function ColorsFoundation() {
  return (
    <>
      <DocSection title="Scales">
        {SCALES.map((scale) => (
          <div key={scale.name} className="mt-6 first:mt-0">
            <p className="text-body-sm font-medium capitalize">{scale.name}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-13">
              {scale.swatches.map((swatch) => (
                <div key={swatch.step}>
                  <div className={`h-14 rounded-lg border border-black/5 ${swatch.className}`} />
                  <p className="mt-1.5 truncate font-mono text-body-xs">{swatch.step}</p>
                  <p className="font-mono text-[11px] text-gray-400">{swatch.hex}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </DocSection>
      <DocSection
        title="Roles"
        description="Which color to reach for. Using the same color for the same job keeps screens consistent."
      >
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[560px] text-left text-body-sm leading-[1.4]">
            <caption className="sr-only">Color roles</caption>
            <thead className="bg-gray-25 text-body-xs text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Token
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Hex
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Used for
                </th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role.token} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5 font-mono text-code-lg">
                      <span
                        aria-hidden="true"
                        className="size-5 rounded border border-black/10"
                        style={{ background: role.hex }}
                      />
                      {role.token}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-code text-gray-500">{role.hex}</td>
                  <td className="px-4 py-3 text-gray-600">{role.usedFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>
    </>
  );
}
