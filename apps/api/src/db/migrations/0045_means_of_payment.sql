CREATE TYPE "public"."means_fiscal_group" AS ENUM('none', 'card', 'electronic', 'other');--> statement-breakpoint
ALTER TABLE "payment_methods" RENAME TO "means_of_payment";--> statement-breakpoint
ALTER TABLE "means_of_payment" RENAME COLUMN "payment_type_code" TO "code";--> statement-breakpoint
ALTER TABLE "means_of_payment" ALTER COLUMN "description" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "means_of_payment" RENAME CONSTRAINT "payment_methods_type_code_unique" TO "means_of_payment_code_unique";--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD COLUMN "fiscal_group" "means_fiscal_group";--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD COLUMN "is_selectable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD COLUMN "ends_on" date;--> statement-breakpoint
UPDATE "means_of_payment" SET "fiscal_group" = 'none', "starts_on" = DATE '2020-01-01' WHERE "fiscal_group" IS NULL OR "starts_on" IS NULL;--> statement-breakpoint
ALTER TABLE "means_of_payment" ALTER COLUMN "fiscal_group" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "means_of_payment" ALTER COLUMN "starts_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receivables" RENAME COLUMN "payment_method_id" TO "means_of_payment_id";--> statement-breakpoint
ALTER TABLE "receivables" RENAME CONSTRAINT "receivables_payment_method_id_payment_methods_id_fk" TO "receivables_means_of_payment_id_means_of_payment_id_fk";--> statement-breakpoint
INSERT INTO "means_of_payment" ("code", "description", "notes", "fiscal_group", "is_selectable", "starts_on")
VALUES
  ('01', 'Dinheiro', NULL, 'none', true, DATE '2020-01-01'),
  ('02', 'Cheque', NULL, 'none', true, DATE '2020-01-01'),
  ('03', 'Cartão de Crédito', NULL, 'card', true, DATE '2020-01-01'),
  ('04', 'Cartão de Débito', NULL, 'card', true, DATE '2020-01-01'),
  ('05', 'Cartão da Loja (Private Label), Crediário Digital, Outros Crediários', 'Crediário e private label. Cartão de loja bandeirado usa 03 ou 04.', 'none', true, DATE '2020-01-01'),
  ('10', 'Vale Alimentação', NULL, 'none', true, DATE '2020-01-01'),
  ('11', 'Vale Refeição', NULL, 'none', true, DATE '2020-01-01'),
  ('12', 'Vale Presente', NULL, 'none', true, DATE '2020-01-01'),
  ('13', 'Vale Combustível', NULL, 'none', true, DATE '2020-01-01'),
  ('14', 'Duplicata Mercantil', NULL, 'none', true, DATE '2020-01-01'),
  ('15', 'Boleto Bancário', NULL, 'none', true, DATE '2020-01-01'),
  ('16', 'Depósito Bancário', NULL, 'none', true, DATE '2020-01-01'),
  ('17', 'Pagamento Instantâneo (PIX) - Dinâmico', 'QR Code ou URL dinâmicos. Há UF que exige o identificador da transação.', 'electronic', true, DATE '2020-01-01'),
  ('18', 'TED (Transferência Eletrônica Disponível)', 'Transferência entre bancos diferentes.', 'none', true, DATE '2020-01-01'),
  ('19', 'Programa de fidelidade, Cashback, Crédito Virtual', NULL, 'none', true, DATE '2020-01-01'),
  ('20', 'Pagamento Instantâneo (PIX) - Estático', 'QR estático, chave Pix, ou agência e conta.', 'electronic', true, DATE '2024-07-01'),
  ('21', 'Crédito em Loja', 'Crédito da loja por adiantamento ou devolução. É consumo de saldo, distinto do crediário do 05.', 'none', true, DATE '2024-07-01'),
  ('22', 'Pagamento Eletrônico não Informado - falha de hardware do sistema emissor', 'Contingência de hardware. Fica no catálogo para a NF-e e fora do cadastro comercial.', 'none', false, DATE '2024-07-01'),
  ('23', 'Pagamento Instantâneo (PIX) - Automático', NULL, 'electronic', true, DATE '2026-05-04'),
  ('24', 'TEF - Book Transfer', 'Transferência entre contas do mesmo banco, via TEF.', 'electronic', true, DATE '2026-05-04'),
  ('90', 'Sem Pagamento', 'Documento sem pagamento.', 'none', false, DATE '2020-01-01'),
  ('91', 'Pagamento Posterior', 'O pagamento ocorre depois da emissão.', 'none', true, DATE '2025-11-03'),
  ('99', 'Outros', 'A descrição livre vai em xPag.', 'other', true, DATE '2020-01-01')
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "notes" = EXCLUDED."notes",
  "fiscal_group" = EXCLUDED."fiscal_group",
  "is_selectable" = EXCLUDED."is_selectable",
  "starts_on" = EXCLUDED."starts_on",
  "ends_on" = EXCLUDED."ends_on";--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD CONSTRAINT "means_of_payment_code_format" CHECK ("means_of_payment"."code" ~ '^[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD CONSTRAINT "means_of_payment_description_not_blank" CHECK (length(trim("means_of_payment"."description")) > 0);--> statement-breakpoint
ALTER TABLE "means_of_payment" ADD CONSTRAINT "means_of_payment_validity" CHECK ("means_of_payment"."ends_on" is null or "means_of_payment"."ends_on" >= "means_of_payment"."starts_on");