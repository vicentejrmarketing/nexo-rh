-- AlterTable
ALTER TABLE "users" ADD COLUMN     "customPermissions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_permissions" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateIndex
CREATE INDEX "user_permissions_permissionId_idx" ON "user_permissions"("permissionId");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segurança: a Data API do Supabase fica sem acesso, só o papel da aplicação lê e grava.
ALTER TABLE "user_permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY nexo_app_all ON "user_permissions" FOR ALL USING (current_user = 'nexo_app') WITH CHECK (current_user = 'nexo_app');

