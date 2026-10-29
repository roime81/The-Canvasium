CREATE TABLE "Canvas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Canvas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromptEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Canvas_userId_key" ON "Canvas"("userId");
CREATE INDEX "PromptEvent_userId_createdAt_idx" ON "PromptEvent"("userId", "createdAt");

ALTER TABLE "Canvas" ADD CONSTRAINT "Canvas_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptEvent" ADD CONSTRAINT "PromptEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
