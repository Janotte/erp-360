import type { FastifyInstance } from 'fastify';

import { findPgError, uniqueConflictMessage } from './postgres-errors.ts';

const uniqueMessages: Record<string, string> = {
  tenants_cnpj_unique: 'CNPJ já cadastrado.',
  users_email_unique: 'E-mail já cadastrado.',
  persons_tenant_tax_id_unique: 'Já existe uma pessoa com este documento.',
  tax_id: 'Já existe uma pessoa com este documento.',
  persons_tenant_name_unique: 'Já existe uma pessoa com este nome.',
  plan_accounts_tenant_account_code_unique:
    'Já existe um plano de contas com este código.',
  account_code: 'Já existe um plano de contas com este código.',
  plan_accounts_tenant_name_unique: 'Já existe um plano de contas com este nome.',
  person_addresses_role_per_person: 'Esta pessoa já possui um endereço deste tipo.',
  person_contacts_one_principal: 'Esta pessoa já possui um contato Principal.',
  measures_tenant_name_unique: 'Já existe uma medida com este nome.',
  measures_tenant_abbreviation_unique: 'Já existe uma medida com esta sigla.',
  catalog_categories_sibling_name_unique:
    'Já existe uma categoria com este nome neste nível.',
  catalog_categories_root_name_unique:
    'Já existe uma categoria com este nome neste nível.',
  catalog_items_tenant_code_unique: 'Já existe um item com este código.',
  catalog_items_tenant_sku_unique: 'Já existe um item com este SKU.',
  tenant_certificates_one_active_per_environment:
    'Já existe um certificado ativo neste ambiente.',
  inbound_documents_tenant_access_key_unique: 'Esta nota já está na entrada.',
  operation_natures_tenant_code_unique: 'Já existe uma natureza com este código.',
  cfop_entry_rules_identity_unique: 'Já existe uma regra para este CFOP e esta finalidade.',
  catalog_items_tenant_barcode_unique: 'Já existe um item com este código de barras.',
  payment_methods_tenant_code_unique: 'Já existe uma forma de pagamento com este código.',
  payment_methods_tenant_name_unique: 'Já existe uma forma de pagamento com este nome.',
  payment_method_terms_method_count_unique:
    'Cada quantidade de parcelas só pode aparecer uma vez.',
};

function fastifyClientStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null;
  const statusCode = error.statusCode;
  if (typeof statusCode !== 'number' || statusCode >= 500) return null;
  return statusCode;
}

function httpError(error: unknown): { status: number; message: string } | null {
  if (!(error instanceof Error) || !('status' in error) || 'statusCode' in error)
    return null;
  const status = error.status;
  if (typeof status !== 'number') return null;
  return { status, message: error.message };
}

function foreignKeyMessage(error: unknown): string | null {
  const violation = findPgError(error, '23503');
  if (!violation) return null;

  const haystack =
    `${violation.constraint ?? ''} ${violation.detail ?? ''}`.toLowerCase();
  if (haystack.includes('city')) return 'Cidade informada não existe.';
  if (haystack.includes('catalog_items_measure')) {
    return haystack.includes('still referenced')
      ? 'Não é possível excluir esta medida porque ela está em uso.'
      : 'A medida informada não existe.';
  }
  if (haystack.includes('catalog_items_category')) {
    return haystack.includes('still referenced')
      ? 'Não é possível excluir esta categoria porque ela está em uso.'
      : 'A categoria informada não existe.';
  }
  if (haystack.includes('ncm_code')) return 'A NCM informada não existe.';
  if (haystack.includes('operation_natures_plan_account')) {
    return 'A conta informada não existe.';
  }
  if (haystack.includes('inbound_documents_nature')) {
    return 'Não é possível excluir esta natureza porque ela está em uma nota.';
  }
  if (haystack.includes('catalog_categories_parent')) {
    if (haystack.includes('still referenced')) {
      return 'Não é possível excluir esta categoria porque ela possui subcategorias.';
    }
    return 'A categoria pai informada não existe.';
  }
  return 'Operação inválida por vínculo com outro registro.';
}

function checkMessage(error: unknown): string | null {
  const violation = findPgError(error, '23514');
  if (!violation) return null;
  const name = violation.constraint ?? '';
  if (name.includes('measures_abbreviation_uppercase')) {
    return 'A sigla deve estar em maiúsculas.';
  }
  if (name.includes('measures_visibility')) {
    return 'Marque produto, serviço ou os dois.';
  }
  if (
    name.includes('measures_name') ||
    name.includes('measures_abbreviation_not_blank')
  ) {
    return 'Preencha nome e sigla.';
  }
  if (name.includes('catalog_categories_name')) return 'Informe o nome.';
  if (name.includes('catalog_categories_parent_not_self')) {
    return 'A categoria não pode ser pai de si mesma.';
  }
  if (name.includes('catalog_items_fiscal_type')) {
    return 'O tipo fiscal não confere com produto ou serviço.';
  }
  if (name.includes('catalog_items_barcode')) {
    return 'O código de barras precisa ter 8, 12, 13 ou 14 dígitos.';
  }
  if (name.includes('catalog_items_cest')) return 'O CEST precisa ter 7 dígitos.';
  if (name.includes('catalog_items_list_price')) {
    return 'O preço de tabela não pode ser negativo.';
  }
  if (name.includes('catalog_items_measures')) {
    return 'Peso e dimensões não podem ser negativos.';
  }
  if (name.includes('catalog_items_sku')) return 'O SKU não pode ficar em branco.';
  if (name.includes('catalog_items_code_format')) {
    return 'O código do item precisa ter 6 dígitos.';
  }
  if (name.includes('catalog_items_name')) return 'Informe o nome.';
  if (name.includes('cfop_entry_rules_digits')) return 'O CFOP precisa ter 4 dígitos.';
  if (name.includes('payment_methods_code_format')) {
    return 'O código usa letras, números e hífen, em maiúsculas.';
  }
  if (name.includes('payment_methods_name')) return 'Informe o nome da forma.';
  if (name.includes('payment_methods_channel')) {
    return 'Marque ao menos um uso: orçamento, venda, PDV ou ordem de serviço.';
  }
  if (name.includes('payment_methods_settlement_days_kind')) {
    return 'O prazo de crédito da credenciadora só vale para recebível da adquirente.';
  }
  if (name.includes('payment_methods_acquirer') || name.includes('payment_methods_integrated')) {
    return 'Informe a credenciadora.';
  }
  if (name.includes('payment_method_terms_interval')) {
    return 'O intervalo entre parcelas não confere com a quantidade.';
  }
  if (name.includes('payment_method_terms_interest')) {
    return 'A taxa de juros não confere com o tipo de juros.';
  }
  return null;
}

export function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = fastifyClientStatus(error);
    if (statusCode) {
      const message =
        error instanceof Error && error.message ? error.message : 'Requisição recusada.';
      return reply.status(statusCode).send({ message });
    }

    const http = httpError(error);
    if (http) {
      return reply.status(http.status).send({ message: http.message });
    }

    const duplicate = uniqueConflictMessage(
      error,
      uniqueMessages,
      'Já existe um cadastro com estes dados.',
    );
    if (duplicate) return reply.status(409).send({ message: duplicate });

    const foreignKey = foreignKeyMessage(error);
    if (foreignKey) return reply.status(400).send({ message: foreignKey });

    const check = checkMessage(error);
    if (check) return reply.status(400).send({ message: check });

    request.log.error({ err: error }, 'falha não tratada');
    return reply.status(500).send({ message: 'Erro interno no servidor.' });
  });
}
