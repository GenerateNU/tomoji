"use client";

import {
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  EllipsisIcon,
  InfoIcon,
  LayoutGridIcon,
  ListIcon,
  TriangleAlertIcon,
  VideoIcon,
} from "lucide-react";
import { ActivityItem } from "@/components/activity-item";
import { IconContainer } from "@/components/icon-container";
import { AvatarLabel } from "@/components/avatar-label";
import { Stepper } from "@/components/stepper";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PreviewSection } from "./preview-section";

const AVATAR_SIZES = ["sm", "default", "lg", "xl"] as const;

/** A labelled example, so each one says which props produce it. */
function Example({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <code className="block text-body-xs text-muted-foreground">{label}</code>
      {children}
    </div>
  );
}

export function TagPreview() {
  return (
    <PreviewSection
      id="tag"
      title="Tag & filter chip"
      description="Tags label a status or attribute: primary for in-progress, destructive for overdue or blocking, neutral for the rest. Filter chips toggle a filter on and off; selected chips turn blue."
    >
      <div className="flex flex-wrap gap-8">
        <Example label='Badge size="sm" | "md"'>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Applied</Badge>
            <Badge>
              <ClockIcon />
              Waiting 6d
            </Badge>
            <Badge size="md">In Review</Badge>
            <Badge size="md">Due in 3 days</Badge>
          </div>
        </Example>
        <Example label='tone="primary" | "destructive"'>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">In progress</Badge>
            <Badge size="md" tone="destructive">
              <ClockIcon />
              Overdue
            </Badge>
          </div>
        </Example>
        <Example label='Toggle variant="chip"'>
          <div className="flex flex-wrap items-center gap-2">
            <Toggle variant="chip" defaultPressed>
              <CircleCheckIcon />
              Applied
            </Toggle>
            <Toggle variant="chip">
              Offers{" "}
              <span className="font-normal text-gray-400 group-data-pressed/toggle:text-blue-subtle">
                12
              </span>
            </Toggle>
            <Toggle variant="chip">Unread</Toggle>
          </div>
        </Example>
      </div>
    </PreviewSection>
  );
}

export function AvatarPreview() {
  return (
    <PreviewSection
      id="avatar"
      title="Avatar"
      description="Round for people, square for companies. Shows initials while the image loads or when there isn't one, and a placeholder when there are no initials either."
    >
      <div className="flex flex-wrap items-end gap-8">
        <Example label='size="sm" | "default" | "lg" | "xl"'>
          <div className="flex items-end gap-3">
            {AVATAR_SIZES.map((size) => (
              <Avatar key={size} size={size}>
                <AvatarFallback>JR</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </Example>
        <Example label="no initials">
          <div className="flex items-end gap-3">
            <Avatar>
              <AvatarFallback />
            </Avatar>
            <Avatar shape="square">
              <AvatarFallback />
            </Avatar>
          </div>
        </Example>
        <Example label='shape="square"'>
          <div className="flex items-end gap-3">
            {AVATAR_SIZES.map((size) => (
              <Avatar key={size} size={size} shape="square">
                <AvatarFallback>OA</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </Example>
        <Example label="AvatarLabel">
          <div className="-mx-2 flex flex-wrap items-center gap-2">
            <AvatarLabel
              render={<button type="button" />}
              className="hover:bg-gray-25"
              avatar={
                <Avatar size="sm">
                  <AvatarFallback />
                </Avatar>
              }
              name="Aaron"
              chevron
            />
            <AvatarLabel
              avatar={
                <Avatar size="sm">
                  <AvatarFallback>JR</AvatarFallback>
                </Avatar>
              }
              name="Julia Rowniewski"
              secondary="julia@ohani.com"
            />
            <AvatarLabel
              avatar={
                <Avatar size="sm" shape="square">
                  <AvatarFallback />
                </Avatar>
              }
              name="OpenAI"
            />
          </div>
        </Example>
        <Example label="AvatarGroup">
          <AvatarGroup>
            {["JR", "AM", "KC"].map((initials) => (
              <Avatar key={initials} size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            ))}
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </Example>
      </div>
    </PreviewSection>
  );
}

export function NavigationPreview() {
  return (
    <PreviewSection
      id="navigation"
      title="Breadcrumbs, tabs & segmented control"
      description="Breadcrumbs show where a detail view sits. Tabs switch between views of the same page. A segmented control picks one of 2–4 options or layouts."
    >
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#navigation">
              <Avatar size="sm" shape="square">
                <AvatarFallback />
              </Avatar>
              Anthropic
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Claude Opus 5.5</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">
            Applications <TabsCount>31</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-6">
        <ToggleGroup variant="segment" defaultValue={["live"]} aria-label="Campaign status">
          <ToggleGroupItem value="live">Live</ToggleGroupItem>
          <ToggleGroupItem value="scheduled">Scheduled</ToggleGroupItem>
          <ToggleGroupItem value="paused">Paused</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup variant="segment" size="icon" defaultValue={["grid"]} aria-label="Layout">
          <ToggleGroupItem value="grid" aria-label="Grid">
            <LayoutGridIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List">
            <ListIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </PreviewSection>
  );
}

const ACTIVITY = [
  {
    status: "unread",
    icon: <VideoIcon />,
    title: "Yeti Clear Cup is due in 3 days",
    description: "Go to the assignment and upload your video for review",
  },
  {
    status: "read",
    icon: <VideoIcon />,
    title: "Yeti Clear Cup is due in 3 days",
    description: "Go to the assignment and upload your video for review",
  },
  {
    status: "warning",
    icon: <TriangleAlertIcon />,
    title: "Your post for Claude Opus 5.5 was taken down",
    description: "Repost it within 24 hours to keep earning",
  },
] as const;

export function IconContainerPreview() {
  return (
    <PreviewSection
      id="icon-container"
      title="Icon container"
      description="A tinted square around a status icon, used in toasts, banners, list rows, and empty states."
    >
      <div className="flex items-center gap-3">
        <IconContainer tone="success">
          <CheckIcon />
        </IconContainer>
        <IconContainer>
          <InfoIcon />
        </IconContainer>
        <IconContainer tone="error">
          <TriangleAlertIcon />
        </IconContainer>
      </div>
    </PreviewSection>
  );
}

export function ProgressPreview() {
  return (
    <PreviewSection
      id="stepper"
      title="Stepper & activity item"
      description="A stepper shows progress through a multi-step flow. Activity items list notifications: unread ones get a blue tint and dot, warnings a red tint, an error icon, and a red dot."
    >
      <div className="max-w-xl space-y-6">
        <Stepper steps={["Connect X", "Basic info", "Content", "Portfolio"]} current={2} />
        <Stepper
          steps={["Opportunity Details", "Requirements", "Compensation", "Policy", "Review"]}
          current={0}
        />
      </div>
      <div className="max-w-sm space-y-3">
        {ACTIVITY.map((item) => (
          <ActivityItem
            key={item.status}
            status={item.status}
            icon={item.icon}
            title={item.title}
            description={item.description}
            timestamp="Oct 26 at 6:20pm"
            actions={
              <Button variant="secondary-ghost" size="icon-sm" aria-label="Notification options">
                <EllipsisIcon />
              </Button>
            }
          />
        ))}
      </div>
    </PreviewSection>
  );
}
