-- Phase 3: board column, planned visit stage, dump fields, activity events, audit, idempotency

ALTER TABLE `jobs`
  ADD COLUMN `board_column` VARCHAR(32) NOT NULL DEFAULT 'ready';

CREATE INDEX `jobs_business_id_board_column_idx` ON `jobs`(`business_id`, `board_column`);

ALTER TABLE `visits`
  ADD COLUMN `planned_stage_key` VARCHAR(32) NULL;

ALTER TABLE `tasks`
  ADD COLUMN `destination` VARCHAR(255) NULL,
  ADD COLUMN `details` TEXT NULL,
  ADD COLUMN `dump_status` VARCHAR(32) NULL;

CREATE TABLE `activity_events` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NOT NULL,
  `visit_id` VARCHAR(191) NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `stage_key` VARCHAR(32) NULL,
  `work_date` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'valid',
  `message` TEXT NULL,
  `payload` JSON NULL,
  `reverses_event_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `activity_events_business_id_work_date_idx`(`business_id`, `work_date`),
  INDEX `activity_events_job_id_work_date_idx`(`job_id`, `work_date`),
  INDEX `activity_events_visit_id_idx`(`visit_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_changes` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `field` VARCHAR(64) NOT NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `reason` TEXT NULL,
  `activity_event_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `audit_changes_business_id_idx`(`business_id`),
  INDEX `audit_changes_job_id_idx`(`job_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `idempotency_records` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `request_id` VARCHAR(128) NOT NULL,
  `endpoint` VARCHAR(64) NOT NULL,
  `response_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idempotency_records_business_id_idx`(`business_id`),
  UNIQUE INDEX `idempotency_records_business_id_request_id_key`(`business_id`, `request_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `activity_events`
  ADD CONSTRAINT `activity_events_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `activity_events_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `activity_events_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `activity_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `audit_changes`
  ADD CONSTRAINT `audit_changes_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `audit_changes_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `audit_changes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `idempotency_records`
  ADD CONSTRAINT `idempotency_records_business_id_fkey` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
