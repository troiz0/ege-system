-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Новый диалог',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "frontText" TEXT NOT NULL,
    "backText" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Flashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExamSimulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "variantNumber" INTEGER NOT NULL DEFAULT 1,
    "targetScore" INTEGER NOT NULL,
    "actualScore" INTEGER,
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "answers" TEXT NOT NULL,
    "feedback" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamSimulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WeakTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "lastFailedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "masteryLevel" REAL NOT NULL DEFAULT 0.0,
    "lastTestedAt" DATETIME,
    CONSTRAINT "WeakTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WeakTopic" ("frequency", "id", "isResolved", "lastFailedDate", "subject", "topicName", "userId") SELECT "frequency", "id", "isResolved", "lastFailedDate", "subject", "topicName", "userId" FROM "WeakTopic";
DROP TABLE "WeakTopic";
ALTER TABLE "new_WeakTopic" RENAME TO "WeakTopic";
CREATE UNIQUE INDEX "WeakTopic_userId_subject_topicName_key" ON "WeakTopic"("userId", "subject", "topicName");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Flashcard_userId_nextReviewDate_idx" ON "Flashcard"("userId", "nextReviewDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamSimulation_userId_subject_idx" ON "ExamSimulation"("userId", "subject");
