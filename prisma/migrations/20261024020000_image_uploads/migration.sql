CREATE TABLE "ImageUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "receivedBytes" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ImageUpload_userId_expiresAt_idx" ON "ImageUpload"("userId", "expiresAt");
CREATE INDEX "ImageUpload_expiresAt_idx" ON "ImageUpload"("expiresAt");
