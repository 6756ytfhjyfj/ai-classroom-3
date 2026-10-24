CREATE TABLE "ImageUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "receivedBytes" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageUpload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImageUpload_userId_expiresAt_idx" ON "ImageUpload"("userId", "expiresAt");
CREATE INDEX "ImageUpload_expiresAt_idx" ON "ImageUpload"("expiresAt");
ALTER TABLE "ImageUpload" ADD CONSTRAINT "ImageUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageUpload" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_only ON "ImageUpload" TO ac_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON "ImageUpload" TO ac_runtime;
REVOKE ALL ON "ImageUpload" FROM anon,authenticated;
