CREATE TABLE IF NOT EXISTS "card_plan_doc" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cardId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"repo" varchar(255) NOT NULL,
	"path" varchar(1024) NOT NULL,
	"ref" varchar(255),
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "card_plan_doc_cardId_unique" UNIQUE("cardId")
);
--> statement-breakpoint
ALTER TABLE "card_plan_doc" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_plan_doc" ADD CONSTRAINT "card_plan_doc_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_plan_doc" ADD CONSTRAINT "card_plan_doc_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_plan_doc" ADD CONSTRAINT "card_plan_doc_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_plan_doc_workspace_idx" ON "card_plan_doc" USING btree ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "card_plan_doc_workspace_doc_idx" ON "card_plan_doc" USING btree ("workspaceId","repo","path");