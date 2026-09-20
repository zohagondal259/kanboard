import { useRouter } from "next/router";
import { useEffect } from "react";

import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { SettingsLayout } from "~/components/SettingsLayout";
import { useWorkspace } from "~/providers/workspace";
import WorkspaceSettings from "~/views/settings/WorkspaceSettings";

const WorkspaceSettingsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const isGuest = workspace.role === "guest";

  // The tab is hidden for guests, but the URL can still be typed. Send them
  // back to their own account settings rather than rendering the page.
  useEffect(() => {
    if (isGuest) void router.replace("/settings/account");
  }, [isGuest, router]);

  if (isGuest) return null;

  return (
    <SettingsLayout currentTab="workspace">
      <WorkspaceSettings />
      <Popup />
    </SettingsLayout>
  );
};

WorkspaceSettingsPage.getLayout = (page) => getDashboardLayout(page);

export default WorkspaceSettingsPage;
