import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SelectExamples } from "@/features/design-system/examples/select";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("select");

export default function Page() {
  return (
    <ComponentDocPage
      slug="select"
      importCode={`import { SelectField } from "@/components/select-field";
import { MultiSelectField } from "@/components/multi-select-field";`}
      examples={<SelectExamples />}
      usage={{
        whenToUse: [
          "Choosing one value from a known list (Type, Sort by).",
          "MultiSelectField for picking several values from a long list (Niches, Skills).",
          "A row of selects as filters above a list of opportunities.",
        ],
        do: [
          "Write the placeholder as an instruction (Select type, Select one or more niches).",
          "Use helper for limits like Pick up to 5.",
        ],
        dont: [
          "Don't use a select for two or three options that fit on screen — use a Segmented Control or Checkboxes.",
        ],
      }}
      props={[
        {
          component: "SelectField",
          rows: [
            {
              name: "options",
              type: "{ value: string; label: string }[]",
              description: "The choices.",
            },
            {
              name: "value",
              type: "string | null",
              description: "Controlled value.",
            },
            {
              name: "defaultValue",
              type: "string | null",
              description: "Initial value when uncontrolled.",
            },
            {
              name: "onValueChange",
              type: "(value: string | null) => void",
              description: "Called with the new value.",
            },
            { name: "label", type: "ReactNode", description: "Label above the trigger." },
            {
              name: "placeholder",
              type: "string",
              default: '"Select"',
              description: "Gray-400 text when nothing is chosen.",
            },
            {
              name: "helper",
              type: "string",
              description: "Gray note under the trigger.",
            },
            {
              name: "error",
              type: "string",
              description: "Red fill and border; replaces the helper in red-600.",
            },
            {
              name: "required",
              type: "boolean",
              default: "false",
              description: "Red asterisk after the label.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the field and stops it opening.",
            },
          ],
        },
        {
          component: "MultiSelectField",
          rows: [
            {
              name: "options",
              type: "{ value: string; label: string }[]",
              description: "The choices.",
            },
            {
              name: "value",
              type: "string[]",
              description: "Controlled values. They show as md Tags.",
            },
            {
              name: "defaultValue",
              type: "string[]",
              default: "[]",
              description: "Initial values when uncontrolled.",
            },
            {
              name: "maxVisibleTags",
              type: "number",
              description:
                "Optional limit on visible selected tags; the rest appear as +N. All choices remain available in the dropdown.",
            },
            {
              name: "onValueChange",
              type: "(value: string[]) => void",
              description: "Called with the new values.",
            },
            {
              name: "searchPlaceholder",
              type: "string",
              default: '"Search"',
              description: "Placeholder of the search row in the open panel.",
            },
            {
              name: "label / placeholder / helper / error / required / disabled",
              type: "as SelectField",
              description: "Same as SelectField.",
            },
          ],
        },
      ]}
      names={[
        "select",
        "dropdown",
        "picker",
        "combobox",
        "multi-select",
        "multiselect",
        "filter dropdown",
        "sort by",
      ]}
    />
  );
}
