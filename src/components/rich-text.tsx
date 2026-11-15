"use client";

import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  RiBold,
  RiItalic,
  RiLink,
  RiLinkUnlink,
  RiListOrdered2,
  RiListUnordered,
} from "@remixicon/react";
import { useId, useState, type FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { iconProps, type IconComponent } from "@/lib/icons";
import { fieldBox, fieldBoxState, focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Only what briefs need: paragraphs, bold, italics, lists, and links. Text is
 * stored as Markdown in the existing string fields; `breaks` keeps single line
 * breaks, so briefs written before formatting existed still read line by line.
 */
function extensions() {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["https"],
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
  ];
}

const proseClass =
  "text-body text-gray-950 [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p:not(:last-child)]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li>p]:mb-0";

/** Formatted text from a brief field, e.g. an opportunity's requirements. */
export function RichText({ markdown, className }: { markdown: string; className?: string }) {
  const editor = useEditor(
    {
      extensions: extensions(),
      content: markdown,
      contentType: "markdown",
      editable: false,
      immediatelyRender: false,
      editorProps: { attributes: { class: cn(proseClass, className) } },
    },
    [markdown],
  );
  // Before the editor mounts, show the raw text so nothing jumps or goes blank.
  if (editor === null)
    return <p className={cn("text-body whitespace-pre-line", className)}>{markdown}</p>;
  return <EditorContent editor={editor} />;
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-7 cursor-pointer items-center justify-center rounded-xs text-gray-700 hover:bg-gray-50 aria-pressed:bg-blue-subtle aria-pressed:text-primary",
        focusRing,
      )}
    >
      <Icon {...iconProps} />
    </button>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [href, setHref] = useState(() => editor.getAttributes("link").href ?? "");
  function submit(event: FormEvent) {
    event.preventDefault();
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url === "") chain.unsetLink().run();
    else chain.setLink({ href: /^https:\/\//.test(url) ? url : `https://${url}` }).run();
    onDone();
  }
  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 border-t border-gray-100 px-2 py-1.5"
    >
      <input
        autoFocus
        type="url"
        aria-label="Link address"
        placeholder="https://example.com"
        value={href}
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onDone()}
        className="min-w-0 flex-1 bg-transparent text-body-sm outline-none placeholder:text-gray-400"
      />
      <button
        type="submit"
        className={cn("rounded-xs px-2 text-body-sm font-medium text-primary", focusRing)}
      >
        Save
      </button>
    </form>
  );
}

/**
 * A labelled rich text field with a small toolbar (bold, italics, lists,
 * links). `value` and `onChange` speak Markdown, so the backend keeps storing
 * a plain string.
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  required,
  helper,
  error,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (markdown: string) => void;
  required?: boolean;
  helper?: string;
  error?: string;
  placeholder?: string;
  className?: string;
}) {
  const labelId = useId();
  const messageId = useId();
  const [editingLink, setEditingLink] = useState(false);
  const editor = useEditor({
    extensions: extensions(),
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        ...(error ? { "aria-invalid": "true" } : {}),
        ...(error || helper ? { "aria-describedby": messageId } : {}),
        ...(placeholder ? { "aria-placeholder": placeholder } : {}),
        class: cn(proseClass, "min-h-28 px-3 py-2.5 outline-none"),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getMarkdown()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      bullet: current?.isActive("bulletList") ?? false,
      ordered: current?.isActive("orderedList") ?? false,
      link: current?.isActive("link") ?? false,
    }),
  });
  const message = error ?? helper;

  return (
    <div className={cn("group flex flex-col gap-2", className)}>
      <Label id={labelId} className="gap-0.5">
        {label}
        {required && (
          <span aria-hidden className="text-red-600">
            *
          </span>
        )}
      </Label>
      <div className={cn(fieldBox, fieldBoxState(!!error), "relative flex-col")}>
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          className="flex gap-0.5 border-b border-gray-100 p-1"
        >
          <ToolbarButton
            icon={RiBold}
            label="Bold"
            active={state?.bold}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            icon={RiItalic}
            label="Italic"
            active={state?.italic}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            icon={RiListUnordered}
            label="Bulleted list"
            active={state?.bullet}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            icon={RiListOrdered2}
            label="Numbered list"
            active={state?.ordered}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            icon={state?.link ? RiLinkUnlink : RiLink}
            label={state?.link ? "Edit link" : "Add link"}
            active={state?.link || editingLink}
            onClick={() => setEditingLink((open) => !open)}
          />
        </div>
        {editor && editingLink && <LinkForm editor={editor} onDone={() => setEditingLink(false)} />}
        {placeholder && value.trim() === "" && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-12.5 left-3 text-body text-gray-400"
          >
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
      {message && (
        <p id={messageId} className={cn("text-body-sm", error ? "text-red-600" : "text-gray-500")}>
          {message}
        </p>
      )}
    </div>
  );
}
