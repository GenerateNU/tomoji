import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { TextFieldExamples } from "@/features/design-system/examples/text-field";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("text-field");

export default function Page() {
  return (
    <ComponentDocPage
      slug="text-field"
      importCode={`import { TextField } from "@/components/text-field";`}
      examples={<TextFieldExamples />}
      usage={{
        whenToUse: [
          "Any short free-text answer in a form: name, email, phone number, link.",
          "With a leading icon (RiSearchLine, RiPhoneLine) when the icon makes the expected input clearer.",
        ],
        do: [
          "Write the label as a noun (Email, Phone Number) and use the placeholder for an example value.",
          "Pass error with a specific message (Invalid phone number) rather than a generic one.",
        ],
        dont: [
          "Don't use it for multi-line answers — use TextAreaField.",
          "Don't rely on the placeholder as the label.",
        ],
      }}
      props={[
        {
          component: "TextField",
          rows: [
            {
              name: "label",
              type: "string",
              description: "Gray-500 label above the box; darkens to gray-950 while focused.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description: "Leading Remix icon, e.g. icon={RiPhoneLine}. Figma: Show Icon + Icon.",
            },
            {
              name: "trailing",
              type: "ReactNode",
              description:
                "Content after the input inside the box, such as a unit or a small button.",
            },
            {
              name: "helper",
              type: "string",
              description: "Gray-500 note under the box. Replaced by error when there is one.",
            },
            {
              name: "error",
              type: "string",
              description:
                "Red-50 fill, 2px red-600 border and this message below. Sets aria-invalid and links the message with aria-describedby.",
            },
            {
              name: "required",
              type: "boolean",
              default: "false",
              description: "Adds a red asterisk after the label.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the whole field to 40%.",
            },
            {
              name: "...input props",
              type: 'ComponentProps<"input">',
              description:
                "value, defaultValue, onChange, placeholder, type and the rest pass to the native input. className styles the whole field.",
            },
          ],
        },
      ]}
      names={[
        "text field",
        "input",
        "text input",
        "form field",
        "email field",
        "search field",
        "phone field",
      ]}
    />
  );
}
