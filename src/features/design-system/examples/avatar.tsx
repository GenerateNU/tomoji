"use client";

import { AvatarLabel } from "@/components/avatar-label";
import { Avatar, CompanyAvatar } from "@/components/ui/avatar";
import { Example } from "@/features/design-system/components/docs/example";

const SIZES = [24, 32, 40, 48] as const;

export function AvatarExamples() {
  return (
    <>
      <Example
        title="Avatar"
        description="People: blue initials, or a gray placeholder until there's a photo (pass src)."
        code={`<Avatar size={40} initials="AR" />
<Avatar size={40} />
<Avatar size={40} src="/photo.jpg" alt="Aaron" />`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-6">
            {SIZES.map((size) => (
              <Avatar key={size} size={size} initials="AR" />
            ))}
          </div>
          <div className="flex items-center gap-6">
            {SIZES.map((size) => (
              <Avatar key={size} size={size} />
            ))}
          </div>
        </div>
      </Example>
      <Example
        title="Company Avatar"
        description="Companies: a rounded square with gray initials, a logo, or a building placeholder."
        code={`<CompanyAvatar size={40} initials="O" />
<CompanyAvatar size={40} />`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-6">
            {SIZES.map((size) => (
              <CompanyAvatar key={size} size={size} initials="O" />
            ))}
          </div>
          <div className="flex items-center gap-6">
            {SIZES.map((size) => (
              <CompanyAvatar key={size} size={size} />
            ))}
          </div>
        </div>
      </Example>
      <Example
        title="Avatar Label"
        description="Name with initials by default; a second line; a company; and a clickable account switcher whose chevron shows on hover."
        code={`<AvatarLabel name="Aaron" />
<AvatarLabel name="Julia Rowniewski" secondary="julia@ohani.com" avatar={<Avatar />} />
<AvatarLabel name="OpenAI" avatar={<CompanyAvatar initials="O" />} />
<AvatarLabel name="Aaron" chevron onClick={openAccountMenu} />`}
      >
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <AvatarLabel name="Aaron" />
            <AvatarLabel name="Julia Rowniewski" secondary="julia@ohani.com" avatar={<Avatar />} />
            <AvatarLabel name="OpenAI" avatar={<CompanyAvatar initials="O" />} />
          </div>
          <AvatarLabel name="Aaron" chevron onClick={() => {}} />
        </div>
      </Example>
      <Example
        title="Avatar group"
        description="Overlap 24px avatars with a white ring and end with a count."
        code={`<div className="flex -space-x-1">
  <Avatar initials="AR" className="ring-2 ring-gray-0" />
  <Avatar className="ring-2 ring-gray-0" />
  <Avatar initials="JR" className="ring-2 ring-gray-0" />
  <Avatar className="ring-2 ring-gray-0" />
  <span className="flex size-6 items-center justify-center rounded-full bg-gray-50 text-body-xs font-medium text-gray-500 ring-2 ring-gray-0">
    +3
  </span>
</div>`}
      >
        <div className="flex -space-x-1">
          <Avatar initials="AR" className="ring-2 ring-gray-0" />
          <Avatar className="ring-2 ring-gray-0" />
          <Avatar initials="JR" className="ring-2 ring-gray-0" />
          <Avatar className="ring-2 ring-gray-0" />
          <span className="flex size-6 items-center justify-center rounded-full bg-gray-50 text-body-xs font-medium text-gray-500 ring-2 ring-gray-0">
            +3
          </span>
        </div>
      </Example>
    </>
  );
}
