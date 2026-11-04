-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "stores_managerId_idx" ON "stores"("managerId");

-- CreateIndex
CREATE INDEX "jobs_storeId_idx" ON "jobs"("storeId");

-- CreateIndex
CREATE INDEX "jobs_positionId_idx" ON "jobs"("positionId");

-- CreateIndex
CREATE INDEX "jobs_createdById_idx" ON "jobs"("createdById");

-- CreateIndex
CREATE INDEX "candidates_desiredStoreId_idx" ON "candidates"("desiredStoreId");

-- CreateIndex
CREATE INDEX "candidates_desiredPositionId_idx" ON "candidates"("desiredPositionId");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "candidate_notes_authorId_idx" ON "candidate_notes"("authorId");

-- CreateIndex
CREATE INDEX "stage_history_fromStageId_idx" ON "stage_history"("fromStageId");

-- CreateIndex
CREATE INDEX "stage_history_movedById_idx" ON "stage_history"("movedById");

-- CreateIndex
CREATE INDEX "interviews_createdById_idx" ON "interviews"("createdById");

-- CreateIndex
CREATE INDEX "interview_evaluations_evaluatorId_idx" ON "interview_evaluations"("evaluatorId");

-- CreateIndex
CREATE INDEX "messages_sentById_idx" ON "messages"("sentById");

-- CreateIndex
CREATE INDEX "messages_templateId_idx" ON "messages"("templateId");

-- CreateIndex
CREATE INDEX "message_templates_updatedById_idx" ON "message_templates"("updatedById");
