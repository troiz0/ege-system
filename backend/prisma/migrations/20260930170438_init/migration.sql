-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "googleId" TEXT,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE',
    "proExpiresAt" DATETIME,
    "openrouterKeyEnc" TEXT,
    "openrouterKeyId" TEXT,
    "selectedAiModel" TEXT NOT NULL DEFAULT 'google/gemini-3.8-flash',
    "trafficUsedPercent" REAL NOT NULL DEFAULT 0,
    "freeAiRequestsLeft" INTEGER NOT NULL DEFAULT 3,
    "freeAiResetAt" DATETIME,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "promoCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL DEFAULT 10,
    "track" TEXT NOT NULL DEFAULT 'IT-класс',
    "prepStartDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prepEndDate" DATETIME,
    "prepMode" TEXT NOT NULL DEFAULT 'full_year',
    "pace" TEXT NOT NULL DEFAULT 'moderate',
    "weekdayStudyHours" REAL NOT NULL DEFAULT 2,
    "weekendStudyHours" REAL NOT NULL DEFAULT 4,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TargetSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "targetScore" INTEGER NOT NULL,
    "currentEstimatedScore" INTEGER,
    "examDate" DATETIME,
    CONSTRAINT "TargetSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "originalMeshName" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    CONSTRAINT "ScheduleItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" DATETIME NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
    "attachmentPath" TEXT,
    "detectedTopics" TEXT,
    "aiHint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Homework_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scaleType" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "maxScore" REAL NOT NULL,
    "normalizedPercent" REAL NOT NULL,
    "testDate" DATETIME NOT NULL,
    "mistakeTopics" TEXT,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MockExam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "examDate" DATETIME NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "primaryScore" INTEGER,
    "missedTasks" TEXT,
    "mistakeTopics" TEXT,
    "deltaScore" INTEGER,
    "aiVerdict" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MockExam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeakTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "lastFailedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "WeakTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicStudyMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "summaryTheory" TEXT NOT NULL,
    "formulas" TEXT,
    "pitfalls" TEXT,
    "algorithm" TEXT,
    "reshuEgeUrl" TEXT,
    "fipiUrl" TEXT,
    "videoQuery" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicStudyMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiAnalysisSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "demoMode" BOOLEAN NOT NULL DEFAULT false,
    "rawResponseJson" TEXT NOT NULL,
    CONSTRAINT "AiAnalysisSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyPlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'theory',
    "durationMinutes" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "materialId" TEXT,
    CONSTRAINT "StudyPlanItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_userId_idx" ON "PaymentTransaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "TargetSubject_userId_idx" ON "TargetSubject"("userId");

-- CreateIndex
CREATE INDEX "ScheduleItem_userId_dayOfWeek_idx" ON "ScheduleItem"("userId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Homework_userId_status_idx" ON "Homework"("userId", "status");

-- CreateIndex
CREATE INDEX "TestResult_userId_testDate_idx" ON "TestResult"("userId", "testDate");

-- CreateIndex
CREATE INDEX "MockExam_userId_subject_examDate_idx" ON "MockExam"("userId", "subject", "examDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeakTopic_userId_subject_topicName_key" ON "WeakTopic"("userId", "subject", "topicName");

-- CreateIndex
CREATE UNIQUE INDEX "TopicStudyMaterial_userId_subject_topicName_key" ON "TopicStudyMaterial"("userId", "subject", "topicName");

-- CreateIndex
CREATE INDEX "StudyPlanItem_userId_targetDate_idx" ON "StudyPlanItem"("userId", "targetDate");
