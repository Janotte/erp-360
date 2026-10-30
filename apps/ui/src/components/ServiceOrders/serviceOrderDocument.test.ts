import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { serviceOrderDocument, type ServiceOrderPrint } from './serviceOrderDocument.ts';

function model(patch: Partial<ServiceOrderPrint> = {}): ServiceOrderPrint {
  return {
    number: '000.000.001',
    logoUrl: null,
    logoText: 'Hobby',
    tenant: {
      tradeName: 'Hobby',
      name: 'Hobby Informática Ltda',
      cnpj: '01.338.319/0001-94',
      stateRegistration: null,
      addressLine: 'Rua das Flores, 10',
      cityLine: 'Joinville / SC',
      phone: '(47) 3472-3260',
      mobilePhone: null,
      whatsapp: null,
      email: null,
    },
    openedByName: 'João',
    openedAt: '29/10/2026 21:00',
    promisedAt: '',
    attendanceLabel: 'Avulso',
    statusLabel: 'Aberta',
    originNumber: null,
    customer: {
      taxId: null,
      name: 'Cliente <b>',
      phone: null,
      mobilePhone: null,
      whatsapp: null,
      email: null,
      streetLine: null,
      neighborhood: null,
      cityLine: null,
    },
    sectionTitle: 'Informações do objeto',
    fields: [{ slot: 'field01', label: 'Descrição', value: '', width: 12 }],
    productsTitle: 'Produtos',
    servicesTitle: 'Serviços',
    products: [],
    services: [],
    totals: {
      productsAmount: 0,
      servicesAmount: 0,
      freightAmount: 0,
      adjustmentAmount: 0,
      totalAmount: 0,
    },
    payment: {
      methodDescription: 'Dinheiro',
      meansDescription: 'Dinheiro',
      installmentsLabel: 'À vista',
    },
    notes: [],
    technicianSignatureLabel: 'Responsável técnico',
    customerSignatureLabel: 'Assinatura do cliente',
    ...patch,
  };
}

describe('folha da ordem de serviço', () => {
  it('monta a folha com o número, a logo e o nome escapado', () => {
    const sheet = serviceOrderDocument(model(), 'body{color:red}');
    assert.match(sheet, /os-container/);
    assert.match(sheet, /000\.000\.001/);
    assert.match(sheet, /body\{color:red\}/);
    assert.match(sheet, /company-logo[\s\S]*Hobby/);
    assert.doesNotMatch(sheet, /<img/);
    assert.match(sheet, /Cliente &lt;b&gt;/);
    assert.equal(sheet.includes('Cliente <b>'), false);
    assert.match(sheet, /grid-column: span 12/);
    assert.equal(sheet.includes('Celular'), false);
    assert.equal(sheet.includes('WhatsApp'), false);

    const withPhones = serviceOrderDocument(
      model({
        customer: {
          ...model().customer,
          mobilePhone: '(47) 99999-0000',
          whatsapp: '(47) 98888-0000',
        },
      }),
      'body{color:red}',
    );
    assert.match(withPhones, /Celular/);
    assert.match(withPhones, /\(47\) 99999-0000/);
    assert.match(withPhones, /WhatsApp/);

    const withLogo = serviceOrderDocument(
      model({ logoUrl: 'https://cdn.example/x.png" onerror="alert(1)' }),
      'body{color:red}',
    );
    assert.match(withLogo, /<img/);
    assert.equal(withLogo.includes('onerror="alert(1)"'), false);
  });
});
