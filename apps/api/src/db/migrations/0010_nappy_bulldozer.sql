CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"code" varchar(7) NOT NULL,
	"state_id" uuid NOT NULL,
	"is_capital" boolean DEFAULT false NOT NULL,
	"latitude" numeric(10, 8),
	"longitude" numeric(10, 8),
	"population" integer,
	"timezone" varchar(20)
);
--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE restrict ON UPDATE no action;