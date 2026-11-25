PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_refunds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reason` text NOT NULL,
	`amount_refunded` integer,
	`requested_at` text NOT NULL,
	`decided_at` text,
	`decided_by_user_id` integer,
	`decline_reason` text,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_refunds`("id", "purchase_id", "status", "reason", "amount_refunded", "requested_at", "decided_at", "decided_by_user_id", "decline_reason") SELECT "id", "purchase_id", CASE "status" WHEN 'requested' THEN 'open' ELSE "status" END, "reason", "amount_refunded", "requested_at", "resolved_at", "resolved_by_user_id", NULL FROM `refunds`;--> statement-breakpoint
DROP TABLE `refunds`;--> statement-breakpoint
ALTER TABLE `__new_refunds` RENAME TO `refunds`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `refunds_purchase_idx` ON `refunds` (`purchase_id`);--> statement-breakpoint
ALTER TABLE `enrollments` ADD `ended_at` text;