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
};

function fastifyClientStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null;
  const statusCode = error.statusCode;
  if (typeof statusCode !== 'number' || statusCode >= 500) return null;
  return statusCode;
}

function httpError(error: unknown): { status: number; message: string } | null {
  if (!(error instanceof Error) || !('status' in error) || 'statusCode' in error) return null;
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
  return 'Operação inválida por vínculo com outro registro.';
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

    request.log.error({ err: error }, 'falha não tratada');
    return reply.status(500).send({ message: 'Erro interno no servidor.' });
  });
}
