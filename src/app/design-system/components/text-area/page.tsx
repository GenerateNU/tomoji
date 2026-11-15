import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { TextAreaExamples } from "@/features/design-system/examples/text-area";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("text-area");

export default function Page() {
  return (
    <ComponentDocPage
      slug="text-area"
      importCode={`import { TextAreaField } from "@/components/text-area-field";`}
      examples={<TextAreaExamples />}
      usage={{
        whenToUse: [
          "Longer free-text answers: descriptions, notes to a reviewer, messages.",
          "Set maxLength to show the 0/200 counter when there's a limit.",
        ],
        do: [
          "Use helper to explain what the text is for; it turns red and is replaced by error when there's a problem.",
        ],
        dont: ["Don't use it for one-line answers — use TextField."],
      }}
      props={[
        {
          component: "TextAreaField",
          rows: [
            {
              name: "label",
              type: "string",
              description: "Gray-500 label above the box; darkens to gray-950 while focused.",
            },
            {
              name: "required",
              type: "boolean",
              default: "false",
              description: "Red asterisk after the label.",
            },
            {
              name: "helper",
              type: "string",
              description: "Gray-500 note under the box. Figma: Helper Text + Show Helper.",
            },
            {
              name: "error",
              type: "string",
              description:
                "Red fill and border; the message shows in place of the helper in red-600.",
            },
            {
              name: "maxLength",
              type: "number",
              description: "Limits the length and drives the counter.",
            },
            {
              name: "showCount",
              type: "boolean",
              default: "true",
              description: "Shows {length}/{maxLength} bottom right when maxLength is set.",
            },
            {
              name: "...textarea props",
              type: 'ComponentProps<"textarea">',
              description:
                "value, defaultValue, onChange, placeholder, rows and the rest pass to the native textarea. className styles the whole field.",
            },
          ],
        },
      ]}
      names={[
        "text area",
        "textarea",
        "multi-line input",
        "message box",
        "note field",
        "description field",
        "comment box",
      ]}
    />
  );
}
