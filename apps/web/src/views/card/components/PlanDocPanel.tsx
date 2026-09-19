import Link from "next/link";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { usePermissions } from "~/hooks/usePermissions";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export const planDocErrorMessage = (code: string): string => {
  switch (code) {
    case "NOT_CONFIGURED":
      return t`Plan docs are not set up on this server.`;
    case "REPO_NOT_ALLOWED":
      return t`This repository is not allowed for plan docs.`;
    case "PATH_NOT_ALLOWED":
      return t`This workspace may not show plan docs from that folder.`;
    case "NOT_FOUND":
      return t`The plan doc was not found. It may have been moved or not pushed yet.`;
    case "TOO_LARGE":
      return t`The plan doc is too large to display.`;
    case "INVALID_PATH":
    case "INVALID_REF":
      return t`The plan doc link is not valid.`;
    default:
      return t`The plan doc could not be loaded. Try again shortly.`;
  }
};

const markdownClassName =
  "prose prose-sm max-w-none dark:prose-invert [&_li]:my-0.5 [&_p]:my-1 [&_ul]:my-1";

/**
 * Shows the banner and the newest STATE entries of the plan doc linked to a
 * card. Only people holding `plandoc:view` ever mount the query, and the server
 * checks the same permission, so guests neither see nor fetch anything.
 */
export default function PlanDocPanel({
  cardPublicId,
}: {
  cardPublicId: string;
}) {
  const { hasPermission, canEditCard, isLoading } = usePermissions();
  const canView = !isLoading && hasPermission("plandoc:view");

  const { data, isLoading: isPlanDocLoading } = api.planDoc.get.useQuery(
    { cardPublicId },
    { enabled: canView && cardPublicId.length >= 12 },
  );

  if (!canView || isPlanDocLoading || !data) return null;

  // Nothing to show and nothing the viewer could do about it.
  if (!data.configured) return null;
  if (!data.link && !canEditCard) return null;

  return (
    <div className="mb-10 border-t-[1px] border-light-300 pt-12 dark:border-dark-300">
      <div className="flex items-center justify-between pb-4">
        <h2 className="text-md font-medium text-light-1000 dark:text-dark-1000">
          {t`Plan doc`}
        </h2>
        {data.link && !data.error && (
          <Link
            href={`/cards/${cardPublicId}/plan-doc`}
            className="text-sm font-medium text-light-1000 underline dark:text-dark-1000"
          >
            {t`Open full plan doc`}
          </Link>
        )}
      </div>

      {data.link ? (
        <>
          {data.error ? (
            <p className="text-sm text-light-900 dark:text-dark-900">
              {planDocErrorMessage(data.error)}
            </p>
          ) : (
            data.summary && (
              <div className="rounded-md border border-light-300 p-4 dark:border-dark-300">
                {data.summary.title && (
                  <p className="pb-2 text-sm font-bold text-light-1000 dark:text-dark-1000">
                    {data.summary.title}
                  </p>
                )}
                {data.summary.banner && (
                  <div
                    className={`${markdownClassName} mb-3 border-l-2 border-light-600 pl-3 dark:border-dark-600`}
                  >
                    <ReactMarkdown>{data.summary.banner}</ReactMarkdown>
                  </div>
                )}
                {data.summary.stateEntries.length > 0 ? (
                  <div className={markdownClassName}>
                    <ReactMarkdown>
                      {data.summary.stateEntries.join("\n\n")}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-light-900 dark:text-dark-900">
                    {t`This doc has no STATE section yet.`}
                  </p>
                )}
                {data.summary.totalStateEntries >
                  data.summary.stateEntries.length && (
                  <p className="pt-3 text-xs text-light-900 dark:text-dark-900">
                    {t`Showing the newest ${data.summary.stateEntries.length} of ${data.summary.totalStateEntries} STATE entries.`}
                  </p>
                )}
              </div>
            )
          )}
          <p className="pt-2 font-mono text-xs text-light-900 dark:text-dark-900">
            {data.link.repo}/{data.link.path}
            {data.link.ref ? ` @ ${data.link.ref}` : ""}
          </p>
          {canEditCard && <UnlinkButton cardPublicId={cardPublicId} />}
        </>
      ) : (
        <LinkForm cardPublicId={cardPublicId} />
      )}
    </div>
  );
}

function LinkForm({ cardPublicId }: { cardPublicId: string }) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");

  const setPlanDoc = api.planDoc.set.useMutation({
    onSuccess: () => utils.planDoc.get.invalidate({ cardPublicId }),
    onError: (error) =>
      showPopup({
        header: t`Unable to link the plan doc`,
        message: error.message,
        icon: "error",
      }),
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setPlanDoc.mutate({
          cardPublicId,
          repo: repo.trim(),
          path: path.trim(),
        });
      }}
    >
      <Input
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
        placeholder={t`Repository, for example owner/docs`}
      />
      <Input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder={t`Path, for example INPROGRESS_PLAN.md`}
      />
      <div>
        <Button
          type="submit"
          variant="secondary"
          isLoading={setPlanDoc.isPending}
          disabled={setPlanDoc.isPending || !repo.trim() || !path.trim()}
        >
          {t`Link plan doc`}
        </Button>
      </div>
    </form>
  );
}

function UnlinkButton({ cardPublicId }: { cardPublicId: string }) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();

  const removePlanDoc = api.planDoc.remove.useMutation({
    onSuccess: () => utils.planDoc.get.invalidate({ cardPublicId }),
    onError: (error) =>
      showPopup({
        header: t`Unable to unlink the plan doc`,
        message: error.message,
        icon: "error",
      }),
  });

  return (
    <button
      type="button"
      className="pt-2 text-xs text-light-900 underline dark:text-dark-900"
      disabled={removePlanDoc.isPending}
      onClick={() => removePlanDoc.mutate({ cardPublicId })}
    >
      {t`Unlink plan doc`}
    </button>
  );
}
