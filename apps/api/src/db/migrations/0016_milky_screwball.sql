ALTER TABLE "card_brands" ADD COLUMN "code" varchar(2) NOT NULL;--> statement-breakpoint
ALTER TABLE "card_brands" ADD CONSTRAINT "card_brands_code_unique" UNIQUE("code");