"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { errorMessage } from "@/lib/errors";
import { formatDate, roleLabel, userName, type DirectoryUser } from "../lib/labels";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-body font-medium text-gray-500">{label}</dt>
      <dd className="text-body-sm text-gray-950">{children}</dd>
    </div>
  );
}

/**
 * One account's details, with the activate / deactivate control.
 * Deactivation is the soft delete: the row stays and every reference to it
 * keeps resolving, but the person can no longer sign in.
 */
export function UserDetailModal({
  user,
  onClose,
}: {
  user: DirectoryUser | null;
  onClose: () => void;
}) {
  const setActive = useMutation(api.users.setActive);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    if (user === null || pending) return;
    setPending(true);
    try {
      await setActive({ userId: user._id, isActive: !user.isActive });
      toast.success(
        user.isActive
          ? `${userName(user)} can no longer sign in.`
          : `${userName(user)} can sign in again.`,
      );
      onClose();
    } catch (error) {
      toast.error(
        errorMessage(error, {
          invalid_state:
            "This account can't be reactivated: its email or company membership is no longer available.",
        }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      titleSize="lg"
      title={user ? userName(user) : ""}
      titleAddon={
        user && !user.isActive ? (
          <Tag size="md" tone="destructive">
            Deactivated
          </Tag>
        ) : null
      }
      className="sm:max-w-[36rem]"
      footer={
        user && (
          <Button
            variant={user.isActive ? "destructive-subtle" : "primary"}
            disabled={pending}
            onClick={() => void toggleActive()}
          >
            {user.isActive ? "Deactivate account" : "Reactivate account"}
          </Button>
        )
      }
    >
      {user && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar size={48} initials={getInitials(userName(user))} />
            <span className="min-w-0 truncate text-body-sm text-gray-500">{user.email}</span>
          </div>
          <Separator />
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Fact label="Account type">{roleLabel(user.role)}</Fact>
            <Fact label="Joined">{formatDate(user._creationTime)}</Fact>
            {user.company && (
              <>
                <Fact label="Company">{user.company.name}</Fact>
                <Fact label="Company role">
                  {user.company.role === "admin" ? "Admin" : "Member"}
                </Fact>
              </>
            )}
            <Fact label="Status">{user.isActive ? "Active" : "Deactivated"}</Fact>
          </dl>
          <p className="text-body-sm text-gray-500">
            Deactivating is a soft delete. The account and everything that references it stay in
            place, and the person is refused at sign-in until they are reactivated.
          </p>
        </div>
      )}
    </Modal>
  );
}
