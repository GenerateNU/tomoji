import { InviteTeammate } from "@/features/team/components/invite-teammate";
import { PendingInvitations } from "@/features/team/components/pending-invitations";

/** Shares the workspace's invitation controls with the standalone admin view. */
export function TeammateInvites() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Invite teammates</h1>
        <p className="text-muted-foreground">Add members to manage your campaigns.</p>
      </header>
      <InviteTeammate />
      <PendingInvitations />
    </div>
  );
}
