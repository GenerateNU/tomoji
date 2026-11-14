"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { RiTwitterXLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { iconProps } from "@/lib/icons";
import { nextPath } from "../lib/steps";
import { OnboardingShell, StepHeading } from "./onboarding-shell";

/**
 * Step 1. Connecting leaves for X's own sign-in and authorize pages and comes
 * back through `/api/x/callback`, which returns to the app with `?x_link=`.
 * Nothing is saved here, so skipping just moves on.
 */
export function ConnectXStep({ alreadyConnected }: { alreadyConnected: boolean }) {
  const router = useRouter();
  const startLink = useAction(api.xAccounts.start);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const { authorizationUrl } = await startLink({});
      window.location.assign(authorizationUrl);
    } catch {
      setError("We couldn't open X just now. Try again, or skip for now.");
      setPending(false);
    }
  }

  return (
    <OnboardingShell
      slug="connect-x"
      asideClassName="bg-blue-primary p-0"
      aside={
        <div className="relative size-full">
          <Image
            src="/onboarding/onboarding.png"
            alt=""
            fill
            sizes="50vw"
            className="object-cover"
            priority
          />
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        <StepHeading
          title="Connect your X account to Ohani"
          description="Ohani uses X to showcase your portfolio to companies looking for creators and track your performance. Connect your X account to get started faster."
        />
        <div className="flex flex-col gap-4">
          <Button
            fullWidth
            disabled={pending || alreadyConnected}
            onClick={() => void connect()}
            trailingIcon={RiTwitterXLine}
          >
            {alreadyConnected ? "X connected" : pending ? "Opening X…" : "Connect with"}
          </Button>
          <Button
            variant="secondary-ghost"
            fullWidth
            onClick={() => router.push(nextPath("connect-x"))}
          >
            {alreadyConnected ? "Continue" : "Skip for now"}
          </Button>
          {error !== null && (
            <p role="alert" className="text-body-sm font-normal text-red-600">
              {error}
            </p>
          )}
          {alreadyConnected && (
            <p className="flex items-center gap-1.5 text-body-sm font-normal text-gray-500">
              <RiTwitterXLine {...iconProps} size={14} aria-hidden />
              Your X account is already connected.
            </p>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}
