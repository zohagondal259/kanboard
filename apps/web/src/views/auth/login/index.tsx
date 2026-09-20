import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { env } from "next-runtime-env";
import { useState } from "react";

import { authClient } from "@kan/auth/client";

import { Auth } from "~/components/AuthForm";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";

export default function LoginPage() {
  const router = useRouter();
  const isSignUpDisabled = env("NEXT_PUBLIC_DISABLE_SIGN_UP") === "true";
  const [isMagicLinkSent, setIsMagicLinkSent] = useState<boolean>(false);
  const [magicLinkRecipient, setMagicLinkRecipient] = useState<string>("");

  const searchParams = useSearchParams();
  const redirect = searchParams.get("next");
  const signInError = searchParams.get("error");

  // Better Auth reports a blocked sign-up as `failed_to_create_user`: the link
  // itself was valid, but the address has no account and sign-up is disabled.
  const signInErrorMessage =
    signInError === "failed_to_create_user"
      ? t`There's no account for this email address. Ask for an invite, then sign in with the address it was sent to.`
      : signInError
        ? t`That sign-in link didn't work. Request a new one below.`
        : null;

  const handleMagicLinkSent = (value: boolean, recipient: string) => {
    setIsMagicLinkSent(value);
    setMagicLinkRecipient(recipient);
  };

  const { data } = authClient.useSession();

  if (data?.user.id) router.push(redirect ?? "/boards");

  return (
    <>
      <PageHead title={t`Login | kan.bn`} />
      <main className="h-screen bg-light-100 pt-20 dark:bg-dark-50 sm:pt-0">
        <div className="justify-top flex h-full flex-col items-center px-4 sm:justify-center">
          <div className="z-10 flex w-full flex-col items-center">
            <Link href="/">
              <h1 className="mb-6 text-lg font-bold tracking-tight text-light-1000 dark:text-dark-1000">
                kan.bn
              </h1>
            </Link>
            <p className="mb-10 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              {isMagicLinkSent ? t`Check your inbox` : t`Welcome back`}
            </p>
            {isMagicLinkSent ? (
              <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                <p className="text-md mt-2 text-center text-light-1000 dark:text-dark-1000">
                  <Trans>
                    Click on the link we've sent to {magicLinkRecipient} to sign
                    in.
                  </Trans>
                </p>
              </div>
            ) : (
              <div className="w-full rounded-lg border border-light-500 bg-light-300 px-4 py-10 dark:border-dark-400 dark:bg-dark-200 sm:max-w-md lg:px-10">
                <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                  {signInErrorMessage && (
                    <p className="mb-6 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      {signInErrorMessage}
                    </p>
                  )}
                  <Auth setIsMagicLinkSent={handleMagicLinkSent} />
                </div>
              </div>
            )}
            {(!isSignUpDisabled || redirect?.startsWith("/invite/")) && (
              <p className="mt-4 text-sm text-light-1000 dark:text-dark-1000">
                <Trans>
                  Don't have an account?{" "}
                  <span className="underline">
                    <Link
                      href={redirect ? `/signup?next=${redirect}` : "/signup"}
                    >
                      Sign up
                    </Link>
                  </span>
                </Trans>
              </p>
            )}
          </div>
          <PatternedBackground />
        </div>
      </main>
    </>
  );
}
