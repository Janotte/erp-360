import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { catalogCategories, catalogItems, measures } from '@erp-360/mod-catalog';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

type CategoryOption = { id: string; path: string };

describe('visibilidade da categoria', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';
  let measureId = '';

  before(async () => {
    assert.equal(env.database.name, 'erp360_test', 'Os testes só rodam no banco erp360_test.');
    await app.ready();
    const company = await createCompany('Categoria');
    tenantId = company.tenantId;
    token = app.jwt.sign({ userId: company.userId, tenantId });
    const [measure] = await db
      .insert(measures)
      .values({
        tenantId,
        name: 'Unidade',
        abbreviation: 'UN',
        measureType: 'unit',
        showOnProduct: true,
        showOnService: true,
      })
      .returning({ id: measures.id });
    measureId = measure.id;
  });

  after(async () => {
    if (tenantId) {
      await db.delete(catalogItems).where(eq(catalogItems.tenantId, tenantId));
      await db.delete(catalogCategories).where(eq(catalogCategories.tenantId, tenantId));
      await db.delete(measures).where(eq(measures.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    await app.close();
  });

  function auth(method: 'GET' | 'POST', url: string, payload?: unknown) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createCategory(name: string, showOnProduct: boolean, showOnService: boolean) {
    const response = await auth('POST', '/catalog/categories', {
      name,
      showOnProduct,
      showOnService,
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json() as { id: string; showOnProduct: boolean; showOnService: boolean };
  }

  it('lista só as categorias marcadas para o tipo do item', async () => {
    const blank = await auth('POST', '/catalog/categories', { name: 'Sem marca' });
    assert.equal(blank.statusCode, 400);
    assert.match(blank.json().message, /produto, serviço ou os dois/);

    const product = await createCategory('Peças', true, false);
    const service = await createCategory('Mão de obra', false, true);
    const both = await createCategory('Geral', true, true);
    assert.equal(product.showOnProduct, true);
    assert.equal(product.showOnService, false);

    const products = await auth('GET', '/catalog/categories/options?usage=product');
    assert.equal(products.statusCode, 200);
    const productIds = (products.json() as CategoryOption[]).map((row) => row.id);
    assert.deepEqual(productIds.sort(), [product.id, both.id].sort());

    const services = await auth('GET', '/catalog/categories/options?usage=service');
    assert.equal(services.statusCode, 200);
    const serviceIds = (services.json() as CategoryOption[]).map((row) => row.id);
    assert.deepEqual(serviceIds.sort(), [service.id, both.id].sort());

    const item = (type: 'product' | 'service', categoryId: string) =>
      auth('POST', '/catalog/items', {
        name: `${type} ${categoryId}`,
        type,
        fiscalItemType: type === 'service' ? 'service' : 'resale',
        measureId,
        categoryId,
      });

    const wrongProduct = await item('product', service.id);
    assert.equal(wrongProduct.statusCode, 400);
    assert.equal(wrongProduct.json().message, 'Esta categoria não aparece em produto.');

    const wrongService = await item('service', product.id);
    assert.equal(wrongService.statusCode, 400);
    assert.equal(wrongService.json().message, 'Esta categoria não aparece em serviço.');

    const saved = await item('product', product.id);
    assert.equal(saved.statusCode, 201, saved.body);
    assert.equal(saved.json().categoryId, product.id);
  });
});
