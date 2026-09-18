import { Heading } from "@react-email/heading";
import { Hr } from "@react-email/hr";
import { Link } from "@react-email/link";
import { Text } from "@react-email/text";
import { env } from "next-runtime-env";
import * as React from "react";

/**
 * Self-hosted instances can brand their emails:
 * - NEXT_PUBLIC_APP_NAME replaces the product name in headings and copy.
 * - NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY=true hides the "powered by" footer,
 *   and the default heading when no app name is set.
 */
const customAppName = (): string | undefined => {
  const name = env("NEXT_PUBLIC_APP_NAME")?.trim();
  return name ? name : undefined;
};

const isWhiteLabel = (): boolean =>
  env("NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY") === "true";

/** Product name for use inside sentences, e.g. "Login to your Kan account". */
export const appName = (): string => customAppName() ?? "Kan";

export const BrandHeading = ({ fallback }: { fallback: string }) => (
  <Heading
    style={{
      marginTop: "2.5rem",
      marginBottom: "2.5rem",
      fontSize: "24px",
      fontWeight: "bold",
      color: "#232323",
    }}
  >
    {customAppName() ?? (isWhiteLabel() ? "" : fallback)}
  </Heading>
);

export const BrandFooter = () =>
  isWhiteLabel() ? null : (
    <>
      <Hr
        style={{
          marginTop: "2.5rem",
          marginBottom: "2rem",
          borderWidth: "1px",
        }}
      />
      <Text style={{ color: "#7e7e7e" }}>
        <Link
          href={env("NEXT_PUBLIC_BASE_URL")}
          target="_blank"
          style={{ color: "#7e7e7e", textDecoration: "underline" }}
        >
          Kan
        </Link>
        , the open source Trello alternative.
      </Text>
    </>
  );
