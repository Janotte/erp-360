CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" varchar(255) NOT NULL,
	"documento" varchar(20),
	"email" varchar(255),
	"telefone" varchar(20),
	"is_cliente" boolean DEFAULT false NOT NULL,
	"is_fornecedor" boolean DEFAULT false NOT NULL,
	"is_colaborador" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "persons" CASCADE;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;