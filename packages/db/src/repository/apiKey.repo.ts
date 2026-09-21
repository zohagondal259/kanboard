import { and, eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { apikey } from "@kan/db/schema";

/** Removes a user's keys carrying the given name. The gateway mints its key
 *  under one fixed name, so re-minting replaces rather than accumulates. */
export const deleteByUserIdAndName = (
  db: dbClient,
  userId: string,
  name: string,
) =>
  db
    .delete(apikey)
    .where(and(eq(apikey.userId, userId), eq(apikey.name, name)));
