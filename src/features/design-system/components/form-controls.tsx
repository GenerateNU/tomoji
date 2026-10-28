"use client";

import { useState } from "react";
import { EllipsisIcon, PhoneIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PreviewSection } from "./preview-section";

const VARIANTS = ["default", "secondary", "ghost"] as const;

const NICHES = [
  { value: "frontend", label: "Frontend Development" },
  { value: "backend", label: "Backend Development" },
  { value: "devops", label: "DevOps & Infrastructure" },
];

const SORTS = [
  { value: "views", label: "Most Views" },
  { value: "recent", label: "Most Recent" },
];

const NOTE_LIMIT = 200;

/** A labelled grid cell, so each example says which props produce it. */
function Example({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <code className="block text-body-xs text-muted-foreground">{label}</code>
      {children}
    </div>
  );
}

export function ButtonPreview() {
  return (
    <PreviewSection
      id="button"
      title="Button"
      description="Primary for the main action, secondary for the rest, ghost for low-emphasis actions. Destructive tone for anything that deletes or cancels."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        {VARIANTS.map((variant) => (
          <div key={variant} className="space-y-4">
            <Example label={`variant="${variant}"`}>
              <div className="flex flex-wrap gap-3">
                <Button variant={variant}>Button</Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
              </div>
            </Example>
            <Example label={`variant="${variant}" tone="destructive"`}>
              <div className="flex flex-wrap gap-3">
                <Button variant={variant} tone="destructive">
                  Delete
                </Button>
                <Button variant={variant} tone="destructive" disabled>
                  Delete
                </Button>
              </div>
            </Example>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <Example label='size="sm" | "default" | "lg"'>
          <div className="flex items-center gap-3">
            <Button size="sm">Apply</Button>
            <Button>Apply</Button>
            <Button size="lg">Apply</Button>
          </div>
        </Example>
        <Example label="with an icon">
          <Button>
            <PlusIcon />
            Create New Campaign
          </Button>
        </Example>
        <Example label='size="icon"'>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="icon" aria-label="More actions">
              <EllipsisIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="More actions">
              <EllipsisIcon />
            </Button>
          </div>
        </Example>
        <Example label='className="w-64"'>
          <Button className="w-64">Submit application</Button>
        </Example>
      </div>
    </PreviewSection>
  );
}

export function TextFieldPreview() {
  const [note, setNote] = useState("");

  return (
    <PreviewSection
      id="text-field"
      title="Text field & text area"
      description="Wrap a control in Field with a FieldLabel. The label darkens while the field has focus. Mark errors with aria-invalid and a FieldError."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ds-email">Email</FieldLabel>
          <Input id="ds-email" type="email" placeholder="you@example.com" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ds-email-filled">Email</FieldLabel>
          <Input id="ds-email-filled" type="email" defaultValue="cole@ohani.com" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ds-search">Search</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput id="ds-search" placeholder="Search opportunities" />
          </InputGroup>
        </Field>
        <Field data-invalid>
          <FieldLabel htmlFor="ds-phone">Phone Number</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <PhoneIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="ds-phone"
              type="tel"
              defaultValue="(123) 456-78"
              aria-invalid
              aria-describedby="ds-phone-error"
            />
          </InputGroup>
          <FieldError id="ds-phone-error">Invalid phone number</FieldError>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="ds-note" className="gap-0.5">
            Description<span className="text-destructive">*</span>
          </FieldLabel>
          <Textarea
            id="ds-note"
            placeholder="Write a message…"
            maxLength={NOTE_LIMIT}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby="ds-note-count"
          />
          <FieldDescription id="ds-note-count">
            {note.length}/{NOTE_LIMIT}
          </FieldDescription>
        </Field>
      </div>
    </PreviewSection>
  );
}

export function SelectPreview() {
  return (
    <PreviewSection
      id="select"
      title="Select"
      description="The default size is a form field; sm is the compact select for toolbars and filter bars."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <Field>
          <FieldLabel id="ds-niche-label">Niche</FieldLabel>
          <Select items={NICHES}>
            <SelectTrigger aria-labelledby="ds-niche-label" className="w-full">
              <SelectValue placeholder="Select a niche" />
            </SelectTrigger>
            <SelectContent>
              {NICHES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel id="ds-niche-filled-label">Niche</FieldLabel>
          <Select items={NICHES} defaultValue="backend">
            <SelectTrigger aria-labelledby="ds-niche-filled-label" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NICHES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid>
          <FieldLabel id="ds-niche-error-label">Niche</FieldLabel>
          <Select items={NICHES}>
            <SelectTrigger
              aria-labelledby="ds-niche-error-label"
              aria-invalid
              aria-describedby="ds-niche-error"
              className="w-full"
            >
              <SelectValue placeholder="Select a niche" />
            </SelectTrigger>
            <SelectContent>
              {NICHES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="ds-niche-error">Select at least one niche</FieldError>
        </Field>
      </div>
      <Example label='size="sm"'>
        <Select items={SORTS} defaultValue="views">
          <SelectTrigger size="sm" aria-label="Sort">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Example>
    </PreviewSection>
  );
}

export function ChoicePreview() {
  return (
    <PreviewSection
      id="checkbox-switch"
      title="Checkbox & switch"
      description="A checkbox picks items from a list. A switch turns a setting on or off immediately."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Field orientation="horizontal">
            <Checkbox id="ds-terms" defaultChecked />
            <FieldLabel htmlFor="ds-terms">Frontend Development</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="ds-terms-2" />
            <FieldLabel htmlFor="ds-terms-2">Full-Stack Development</FieldLabel>
          </Field>
        </div>
        <div className="space-y-4">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="ds-claim">Allow anyone to claim a spot</FieldLabel>
              <FieldDescription>Anyone will be able to claim a spot</FieldDescription>
            </FieldContent>
            <Switch id="ds-claim" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="ds-slack">Get notifications in Slack</FieldLabel>
              <FieldDescription>
                Get a DM from ohanibot every time someone applies to your opportunity
              </FieldDescription>
            </FieldContent>
            <Switch id="ds-slack" defaultChecked />
          </Field>
          <Example label='size="sm"'>
            <Switch size="sm" aria-label="Compact switch" defaultChecked />
          </Example>
        </div>
      </div>
    </PreviewSection>
  );
}
