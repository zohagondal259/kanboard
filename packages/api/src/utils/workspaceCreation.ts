/**
 * Self-hosted instances can restrict who may create workspaces by setting
 * WORKSPACE_CREATOR_EMAILS to a comma-separated list of email addresses.
 *
 * Unset or empty keeps the default behaviour: any signed-in user can create
 * a workspace. When set, everyone else (for example a client invited as a
 * guest) can only use the workspaces they were invited to.
 */
export const getWorkspaceCreatorEmails = (): string[] =>
  (process.env.WORKSPACE_CREATOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

export const canCreateWorkspace = (
  userEmail: string | null | undefined,
): boolean => {
  const allowedEmails = getWorkspaceCreatorEmails();

  if (allowedEmails.length === 0) return true;
  if (!userEmail) return false;

  return allowedEmails.includes(userEmail.trim().toLowerCase());
};
