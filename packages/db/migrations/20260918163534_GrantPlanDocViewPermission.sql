-- Permission checks read role rows from the database, not the code defaults,
-- so existing workspaces need the new permission granted explicitly.
-- Admins and members get it; guests (clients) never do. Custom roles are left
-- alone: an admin can grant it to them from the role settings.
INSERT INTO "workspace_role_permissions" ("workspaceRoleId", "permission", "granted", "createdAt")
SELECT wr.id, 'plandoc:view', true, NOW()
FROM "workspace_roles" wr
WHERE wr."name" IN ('admin', 'member') AND wr."isSystem" = true
AND NOT EXISTS (
  SELECT 1 FROM "workspace_role_permissions" wrp
  WHERE wrp."workspaceRoleId" = wr.id AND wrp."permission" = 'plandoc:view'
);
