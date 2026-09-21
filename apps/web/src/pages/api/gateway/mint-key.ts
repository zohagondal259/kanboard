import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

import { withRateLimit } from "@kan/api/utils/rateLimit";
import { initAuth } from "@kan/auth/server";
import { createDrizzleClient } from "@kan/db/client";
import * as apiKeyRepo from "@kan/db/repository/apiKey.repo";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as userRepo from "@kan/db/repository/user.repo";

/** Mints an API key for an existing workspace member, on behalf of the MCP
 * gateway.
 *
 * The gateway signs people in with a magic link to the email their workspace
 * invite went to, then calls this route so the person never handles a key
 * themselves. Better Auth's create endpoint only honours a foreign `userId`
 * when invoked from server code — an HTTP caller cannot reach that path — so
 * this route is the one deliberate opening, and it is shaped narrowly:
 *
 * - It is dark unless `MCP_GATEWAY_MINT_SECRET` is set, and answers 404, not
 *   401, so probing does not reveal it exists.
 * - Only an existing user with an active workspace membership gets a key.
 *   Denied callers produce no rows at all.
 * - One key per user, under one fixed name: minting again replaces the old
 *   key, so a re-mint is a rotation, and the key stays visible to its owner
 *   in Settings -> API like any other.
 */

const KEY_NAME = "MCP gateway";

const db = createDrizzleClient();
const auth = initAuth(db);

const secretsMatch = (presented: string, expected: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.MCP_GATEWAY_MINT_SECRET;
  if (!secret) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const presented = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!presented || !secretsMatch(presented, secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email = (req.body as { email?: string } | undefined)?.email
    ?.trim()
    .toLowerCase();
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const user = await userRepo.getByEmail(db, email);
  const membership =
    user && (await memberRepo.getByEmailAndStatus(db, email, "active"));
  if (!user || !membership) {
    // One message for both cases: the caller learns nothing about which
    // half failed, only that this email gets no key.
    res.status(403).json({ error: "Not an active workspace member" });
    return;
  }

  await apiKeyRepo.deleteByUserIdAndName(db, user.id, KEY_NAME);
  const created = await auth.api.createApiKey({
    body: { name: KEY_NAME, prefix: "kan_", userId: user.id },
  });

  console.log(
    `[gateway] minted API key ${created.id} for ${email} (${user.id})`,
  );
  res.status(200).json({ key: created.key });
}

export default withRateLimit({ points: 30, duration: 60 }, handler);
