ALTER TABLE "accounts_receivable" ADD COLUMN "receive_date" date;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "amount_received" integer;--> statement-breakpoint
ALTER TABLE "accounts_receivable" DROP COLUMN "payment_date";--> statement-breakpoint
ALTER TABLE "accounts_receivable" DROP COLUMN "amount_paid";