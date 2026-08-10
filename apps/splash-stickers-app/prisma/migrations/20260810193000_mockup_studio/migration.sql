-- AlterTable
ALTER TABLE "Mockup" ADD COLUMN "scene" TEXT NOT NULL DEFAULT 'phone';
ALTER TABLE "Mockup" ADD COLUMN "options" JSONB;

-- CreateIndex
CREATE INDEX "Mockup_designId_scene_createdAt_idx" ON "Mockup"("designId", "scene", "createdAt");
