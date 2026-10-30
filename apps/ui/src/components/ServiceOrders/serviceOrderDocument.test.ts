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
      stateRegistration: '253443830',
      addressLine: 'Avenida Prefeito Wittich Freitag, 1180 - Sala 03',
      cityLine: 'Iririú - Joinville/SC - 89227-025',
      phone: '(47) 3472-3260',
      mobilePhone: '(47) 99999-0000',
      whatsapp: '(47) 98888-0000',
      email: 'atendimento@hobby.inf.br',
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
    assert.match(sheet, /<h3>Hobby Informática Ltda<\/h3>/);
    assert.match(sheet, /CNPJ: 01\.338\.319\/0001-94 - IE: 253443830/);
    assert.match(
      sheet,
      /<p>Avenida Prefeito Wittich Freitag, 1180 - Sala 03<\/p><p>Iririú - Joinville\/SC - 89227-025<\/p>/,
    );
    assert.equal((sheet.match(/contact-icon/g) ?? []).length, 4);
    assert.match(sheet, /\(47\) 3472-3260/);
    assert.match(sheet, /\(47\) 99999-0000/);
    assert.match(sheet, /\(47\) 98888-0000/);
    assert.match(sheet, /atendimento@hobby\.inf\.br/);
    assert.match(sheet, /grid-column: span 12/);
    assert.equal(sheet.includes('____'), false);
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

  it('separa as linhas do objeto como as informações do cliente', () => {
    const sheet = serviceOrderDocument(
      model({
        fields: [
          { slot: 'field01', label: 'Descrição', value: 'Notebook', width: 12 },
          { slot: 'field02', label: 'Marca', value: 'Dell', width: 4 },
          { slot: 'field03', label: 'Modelo', value: 'Latitude', width: 4 },
          { slot: 'field04', label: 'Número de série', value: 'FX1', width: 4 },
        ],
      }),
      '',
    );
    const section = sheet.split('Informações do objeto')[1]?.split('<table>')[0] ?? '';
    assert.equal((section.match(/class="grid-row"/g) ?? []).length, 2);
    assert.match(section, /span 4[\s\S]*span 4[\s\S]*span 4/);
  });
});
