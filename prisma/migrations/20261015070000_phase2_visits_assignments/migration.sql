-- Phase 2: visits, workers, assignments, stage/task placeholders, scheduling fields

ALTER TABLE `jobs`
  ADD COLUMN `ready_for_scheduling` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `canceled_at` DATETIME(3) NULL;

CREATE TABLE `workers` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(64) NULL,
  `role` VARCHAR(128) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `workers_business_id_idx`(`business_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `visits` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NOT NULL,
  `work_date` DATE NOT NULL,
  `all_day` BOOLEAN NOT NULL DEFAULT true,
  `start_time` VARCHAR(8) NULL,
  `end_time` VARCHAR(8) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  `notes` TEXT NULL,
  `canceled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `visits_business_id_work_date_idx`(`business_id`, `work_date`),
  INDEX `visits_job_id_idx`(`job_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_stages` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(32) NOT NULL,
  `label` VARCHAR(64) NOT NULL,
  `progress` VARCHAR(32) NOT NULL DEFAULT 'not_started',
  `sort_order` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `job_stages_business_id_idx`(`business_id`),
  UNIQUE INDEX `job_stages_job_id_key_key`(`job_id`, `key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tasks` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(32) NOT NULL DEFAULT 'general',
  `stage_key` VARCHAR(32) NULL,
  `work_date` DATE NULL,
  `done` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `tasks_business_id_idx`(`business_id`),
  INDEX `tasks_job_id_idx`(`job_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `assignments` (
  `id` VARCHAR(191) NOT NULL,
  `business_id` VARCHAR(191) NOT NULL,
  `worker_id` VARCHAR(191) NOT NULL,
  `job_id` VARCHAR(191) NOT NULL,
  `visit_id` VARCHAR(191) NULL,
  `stage_id` VARCHAR(191) NULL,
  `task_id` VARCHAR(191) NULL,
  `conflict_override_reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `assignments_business_id_idx`(`business_id`),
  INDEX `assignments_worker_id_idx`(`worker_id`),
  INDEX `assignments_job_id_idx`(`job_id`),
  INDEX `assignments_visit_id_idx`(`visit_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workers`
  ADD CONSTRAINT `workers_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `visits`
  ADD CONSTRAINT `visits_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `visits`
  ADD CONSTRAINT `visits_job_id_fkey`
  FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `job_stages`
  ADD CONSTRAINT `job_stages_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `job_stages`
  ADD CONSTRAINT `job_stages_job_id_fkey`
  FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `tasks`
  ADD CONSTRAINT `tasks_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `tasks`
  ADD CONSTRAINT `tasks_job_id_fkey`
  FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_business_id_fkey`
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_worker_id_fkey`
  FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_job_id_fkey`
  FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_visit_id_fkey`
  FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_stage_id_fkey`
  FOREIGN KEY (`stage_id`) REFERENCES `job_stages`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `assignments`
  ADD CONSTRAINT `assignments_task_id_fkey`
  FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
