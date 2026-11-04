import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { overlayCnpjDetail } from '../src/modules/persons/cnpj-lookup.ts';

describe('complemento da consulta de CNPJ', () => {
  it('preenche rua, telefone, e-mail e inscrição quando a primeira base vem vazia', () => {
    const merged = overlayCnpjDetail(
      {
        razao_social: 'T.C. DE SOUSA',
        nome_fantasia: 'MAISSNEGOCIOS - SISTEMAS DE SEGURANCA',
        data_inicio_atividade: '2019-06-06',
        email: null,
        uf: 'SP',
        municipio: 'MAIRIPORA',
        codigo_municipio_ibge: 3528502,
        cep: '07666050',
        descricao_tipo_de_logradouro: '',
        logradouro: '',
        numero: '',
        bairro: 'CORUMBA (TERRA PRETA)',
        cnae_fiscal: 4744099,
        ddd_telefone_1: '',
      },
      {
        razao_social: 'T.C. DE SOUSA',
        estabelecimento: {
          nome_fantasia: 'MAISSNEGOCIOS - SISTEMAS DE SEGURANCA',
          tipo_logradouro: 'ESTRADA',
          logradouro: 'JONAS SIAULYS',
          numero: '0',
          bairro: 'CORUMBA (TERRA PRETA)',
          cep: '07666050',
          email: 'maissnegocios@gmail.com',
          ddd1: '11',
          telefone1: '35310437',
          cidade: { nome: 'Mairiporã', ibge_id: 3528502 },
          estado: { sigla: 'SP' },
          inscricoes_estaduais: [
            {
              inscricao_estadual: '433229250110',
              ativo: true,
              estado: { sigla: 'SP' },
            },
          ],
        },
      },
    );

    assert.equal(merged.razao_social, 'T.C. DE SOUSA');
    assert.equal(merged.logradouro, 'JONAS SIAULYS');
    assert.equal(merged.descricao_tipo_de_logradouro, 'ESTRADA');
    assert.equal(merged.numero, '0');
    assert.equal(merged.ddd_telefone_1, '1135310437');
    assert.equal(merged.email, 'maissnegocios@gmail.com');
    assert.equal(merged.bairro, 'CORUMBA (TERRA PRETA)');
    assert.equal(merged.cnae_fiscal, 4744099);
    assert.deepEqual(merged.inscricoes_estaduais, [
      {
        inscricao_estadual: '433229250110',
        ativo: true,
        estado: { sigla: 'SP' },
      },
    ]);
  });
});
