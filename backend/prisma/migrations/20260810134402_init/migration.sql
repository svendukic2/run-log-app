-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "runningLevel" TEXT NOT NULL,
    "defaultWeeklyGoalKm" INTEGER NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "km" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekTarget" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "targetKm" INTEGER NOT NULL,

    CONSTRAINT "WeekTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "effort" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachPlan" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "suggestedTargetKm" INTEGER NOT NULL,
    "deltaVsLastWeekPct" INTEGER NOT NULL,
    "sessions" TEXT NOT NULL,
    "keyWorkout" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeekTarget_weekStart_key" ON "WeekTarget"("weekStart");

-- CreateIndex
CREATE INDEX "Run_date_idx" ON "Run"("date");

-- CreateIndex
CREATE INDEX "CoachPlan_weekStart_idx" ON "CoachPlan"("weekStart");
