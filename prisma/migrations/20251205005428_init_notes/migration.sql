-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "lecture_id" UUID NOT NULL,
    "user_id" UUID,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);
