-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scaleType" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "maxScore" REAL NOT NULL,
    "normalizedPercent" REAL NOT NULL,
    "testDate" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalKey" TEXT,
    "mistakeTopics" TEXT,
    "comment" TEXT,
    "photoPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TestResult" ("comment", "createdAt", "id", "maxScore", "mistakeTopics", "normalizedPercent", "photoPath", "scaleType", "score", "subject", "testDate", "title", "userId") SELECT "comment", "createdAt", "id", "maxScore", "mistakeTopics", "normalizedPercent", "photoPath", "scaleType", "score", "subject", "testDate", "title", "userId" FROM "TestResult";
DROP TABLE "TestResult";
ALTER TABLE "new_TestResult" RENAME TO "TestResult";
CREATE INDEX "TestResult_userId_testDate_idx" ON "TestResult"("userId", "testDate");
CREATE UNIQUE INDEX "TestResult_userId_externalKey_key" ON "TestResult"("userId", "externalKey");
CREATE TABLE "new_ScheduleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "originalMeshName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    CONSTRAINT "ScheduleItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleItem" ("dayOfWeek", "difficulty", "endTime", "id", "originalMeshName", "startTime", "subject", "userId") SELECT "dayOfWeek", "difficulty", "endTime", "id", "originalMeshName", "startTime", "subject", "userId" FROM "ScheduleItem";
DROP TABLE "ScheduleItem";
ALTER TABLE "new_ScheduleItem" RENAME TO "ScheduleItem";
CREATE INDEX "ScheduleItem_userId_dayOfWeek_idx" ON "ScheduleItem"("userId", "dayOfWeek");
CREATE TABLE "new_Homework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" DATETIME NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalKey" TEXT,
    "meshAttachments" TEXT,
    "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
    "attachmentPath" TEXT,
    "detectedTopics" TEXT,
    "aiHint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Homework_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Homework" ("aiHint", "attachmentPath", "createdAt", "deadline", "description", "detectedTopics", "estimatedMinutes", "hasAttachment", "id", "priority", "status", "subject", "title", "userId") SELECT "aiHint", "attachmentPath", "createdAt", "deadline", "description", "detectedTopics", "estimatedMinutes", "hasAttachment", "id", "priority", "status", "subject", "title", "userId" FROM "Homework";
DROP TABLE "Homework";
ALTER TABLE "new_Homework" RENAME TO "Homework";
CREATE INDEX "Homework_userId_status_idx" ON "Homework"("userId", "status");
CREATE UNIQUE INDEX "Homework_userId_externalKey_key" ON "Homework"("userId", "externalKey");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
