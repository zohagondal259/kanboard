import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { PageHead } from "~/components/PageHead";
import { usePermissions } from "~/hooks/usePermissions";
import { api } from "~/utils/api";
import { planDocErrorMessage } from "~/views/card/components/PlanDocPanel";

/**
 * The full plan doc of a card, on its own wide page so tables fit. It uses the
 * same login and the same `plandoc:view` check as the card panel.
 */
export default function PlanDocView() {
  const router = useRouter();
  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();

  const cardId = Array.isArray(router.query.cardId)
    ? router.query.cardId[0]
    : router.query.cardId;

  const canView = !isPermissionsLoading && hasPermission("plandoc:view");

  const { data, isLoading, error } = api.planDoc.getFull.useQuery(
    { cardPublicId: cardId ?? "" },
    { enabled: canView && !!cardId && cardId.length >= 12, retry: false },
  );

  const message =
    !isPermissionsLoading && !canView
      ? t`You do not have access to plan docs.`
      : error
        ? error.message
        : data?.error
          ? planDocErrorMessage(data.error)
          : null;

  return (
    <>
      <PageHead title={data?.title ?? t`Plan doc`} />
      <div className="h-full overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="flex items-center justify-between pb-6">
            <Link
              href={`/cards/${cardId ?? ""}`}
              className="text-sm font-medium text-light-1000 underline dark:text-dark-1000"
            >
              {t`Back to card`}
            </Link>
            {data?.link && (
              <p className="font-mono text-xs text-light-900 dark:text-dark-900">
                {data.link.repo}/{data.link.path}
                {data.link.ref ? ` @ ${data.link.ref}` : ""}
              </p>
            )}
          </div>

          {message ? (
            <p className="text-sm text-light-900 dark:text-dark-900">
              {message}
            </p>
          ) : isLoading || isPermissionsLoading ? (
            <p className="text-sm text-light-900 dark:text-dark-900">
              {t`Loading plan doc...`}
            </p>
          ) : (
            data?.markdown && (
              <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:block [&_table]:overflow-x-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.markdown}
                </ReactMarkdown>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}
