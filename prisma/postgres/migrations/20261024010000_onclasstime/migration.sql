-- DropForeignKey
ALTER TABLE "AuthSession" DROP CONSTRAINT "AuthSession_deviceId_fkey";

-- AlterTable
ALTER TABLE "AuthSession" ALTER COLUMN "deviceId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuestionRecord" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "options" TEXT NOT NULL DEFAULT '[]',
    "answer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrongProblem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "answer" TEXT NOT NULL DEFAULT '',
    "correctAnswer" TEXT NOT NULL DEFAULT '',
    "explanation" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "questionId" TEXT,
    "imageData" TEXT,
    "imageMime" TEXT,
    "imageBytes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "reviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrongProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notebook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6578e6',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '未命名笔记',
    "content" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT 'math',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionRecord_subjectId_topic_difficulty_idx" ON "QuestionRecord"("subjectId", "topic", "difficulty");

-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_createdAt_idx" ON "QuestionAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_questionId_idx" ON "QuestionAttempt"("userId", "questionId");

-- CreateIndex
CREATE INDEX "WrongProblem_userId_subjectId_status_idx" ON "WrongProblem"("userId", "subjectId", "status");

-- CreateIndex
CREATE INDEX "WrongProblem_userId_reviewAt_idx" ON "WrongProblem"("userId", "reviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "WrongProblem_userId_questionId_key" ON "WrongProblem"("userId", "questionId");

-- CreateIndex
CREATE INDEX "Notebook_userId_updatedAt_idx" ON "Notebook"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_userId_notebookId_updatedAt_idx" ON "Note"("userId", "notebookId", "updatedAt");

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongProblem" ADD CONSTRAINT "WrongProblem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notebook" ADD CONSTRAINT "Notebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "QuestionRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_only ON "QuestionRecord" TO ac_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON "QuestionRecord" TO ac_runtime;
REVOKE ALL ON "QuestionRecord" FROM anon,authenticated;

ALTER TABLE "QuestionAttempt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_only ON "QuestionAttempt" TO ac_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON "QuestionAttempt" TO ac_runtime;
REVOKE ALL ON "QuestionAttempt" FROM anon,authenticated;

ALTER TABLE "WrongProblem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_only ON "WrongProblem" TO ac_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON "WrongProblem" TO ac_runtime;
REVOKE ALL ON "WrongProblem" FROM anon,authenticated;

ALTER TABLE "Notebook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_only ON "Notebook" TO ac_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON "Notebook" TO ac_runtime;
REVOKE ALL ON "Notebook" FROM anon,authenticated;

ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_only ON "Note" TO ac_runtime USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON "Note" TO ac_runtime;
REVOKE ALL ON "Note" FROM anon,authenticated;
