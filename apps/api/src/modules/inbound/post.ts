import { catalogItems } from '@erp-360/mod-catalog';
import { payables } from '@erp-360/mod-financial';
import {
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  operationNatures,
  stockBalances,
  stockMovements,
} from '@erp-360/mod-inbound';
import { persons } from '@erp-360/mod-persons';
import { civilDate } from '@erp-360/shared';
import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import {
  lineUnitCost,
  nextAverage,
  payableDocumentNumber,
  reversedBalance,
  round4,
} from './cost.ts';
import { InboundError } from './errors.ts';

function money(value: string | number) {
  return Number(value);
}

export async function postInboundDocument(tenantId: string, documentId: string) {
  await db.transaction(async (tx) => {
    const [document] = await tx
      .select()
      .from(inboundDocuments)
      .where(
        and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
      )
      .for('update');
    if (!document) throw new InboundError(404, 'Nota não encontrada.');
    if (document.status === 'posted') {
      throw new InboundError(409, 'Esta nota já foi lançada.');
    }
    if (document.status === 'reversed' || document.status === 'ignored') {
      throw new InboundError(400, 'Esta nota não pode ser lançada.');
    }
    if (!document.supplierId || !document.natureId) {
      throw new InboundError(400, 'Informe o fornecedor e a natureza antes de lançar.');
    }
    if (document.accessKey && !document.hasProtocol) {
      throw new InboundError(400, 'A NF-e está sem protocolo de autorização.');
    }

    const [supplier] = await tx
      .select({ isActive: persons.isActive })
      .from(persons)
      .where(and(eq(persons.id, document.supplierId), eq(persons.tenantId, tenantId)))
      .limit(1);
    if (!supplier?.isActive) {
      throw new InboundError(400, 'O fornecedor está inativo.');
    }

    const [nature] = await tx
      .select()
      .from(operationNatures)
      .where(
        and(
          eq(operationNatures.id, document.natureId),
          eq(operationNatures.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!nature) throw new InboundError(400, 'Natureza de operação não encontrada.');

    const lines = await tx
      .select()
      .from(inboundDocumentLines)
      .where(
        and(
          eq(inboundDocumentLines.documentId, documentId),
          eq(inboundDocumentLines.tenantId, tenantId),
        ),
      );
    const installments = await tx
      .select()
      .from(inboundDocumentInstallments)
      .where(
        and(
          eq(inboundDocumentInstallments.documentId, documentId),
          eq(inboundDocumentInstallments.tenantId, tenantId),
        ),
      );

    if (lines.length === 0) throw new InboundError(400, 'A nota não tem itens.');
    for (const line of lines) {
      if (!line.itemId) {
        throw new InboundError(
          400,
          `O item ${line.lineNumber} ainda não está vinculado.`,
        );
      }
      if (!line.entryCfop) {
        throw new InboundError(
          400,
          `O item ${line.lineNumber} está sem CFOP de entrada.`,
        );
      }
    }
    if (nature.createsPayable && (document.totalAmount > 0 || installments.length > 0)) {
      const sum = installments.reduce(
        (total, installment) => total + installment.amount,
        0,
      );
      if (installments.length === 0) {
        throw new InboundError(400, 'A nota não tem parcelas.');
      }
      if (Math.abs(sum - document.totalAmount) > 1) {
        throw new InboundError(400, 'A soma das parcelas não fecha com o total da nota.');
      }
    }

    const inboundOn = civilDate();
    const ordered = [...lines].sort((left, right) =>
      (left.itemId ?? '').localeCompare(right.itemId ?? ''),
    );

    for (const line of ordered) {
      const itemId = line.itemId;
      if (!itemId) continue;
      const [item] = await tx
        .select({
          tracksStock: catalogItems.tracksStock,
          grossMargin: catalogItems.grossMargin,
        })
        .from(catalogItems)
        .where(and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)))
        .for('update');
      if (!item) throw new InboundError(400, `O item ${line.lineNumber} não existe.`);

      const stockQty = round4(money(line.commercialQty) * money(line.factor));
      if (stockQty <= 0) {
        throw new InboundError(
          400,
          `O item ${line.lineNumber} ficou com quantidade zero.`,
        );
      }

      let unitCost: string | null = null;
      const moves = nature.movesStock && nature.updatesAverageCost && item.tracksStock;
      if (moves) {
        const cost = lineUnitCost(
          {
            lineAmountCents: line.lineAmount,
            freightCents: line.freightAmount,
            insuranceCents: line.insuranceAmount,
            otherCents: line.otherAmount,
            discountCents: line.discountAmount,
            ipiCents: line.ipiAmount,
            stCents: line.stAmount,
            icmsCents: line.icmsAmount,
            stockQty,
          },
          nature,
        );
        unitCost = cost.toFixed(4);
        await tx
          .insert(stockBalances)
          .values({ tenantId, itemId, quantity: '0.0000', averageCost: '0.0000' })
          .onConflictDoNothing();
        const [balance] = await tx
          .select()
          .from(stockBalances)
          .where(
            and(eq(stockBalances.itemId, itemId), eq(stockBalances.tenantId, tenantId)),
          )
          .for('update');
        if (!balance)
          throw new InboundError(500, 'Não foi possível ler o saldo do item.');
        const currentQty = money(balance.quantity);
        const average = nextAverage(
          currentQty,
          money(balance.averageCost),
          stockQty,
          cost,
        );
        await tx
          .update(stockBalances)
          .set({
            quantity: round4(currentQty + stockQty).toFixed(4),
            averageCost: average.toFixed(4),
          })
          .where(
            and(eq(stockBalances.itemId, itemId), eq(stockBalances.tenantId, tenantId)),
          );
        await tx.insert(stockMovements).values({
          tenantId,
          itemId,
          documentId,
          lineId: line.id,
          direction: 'in',
          quantity: stockQty.toFixed(4),
          unitCost,
          occurredOn: inboundOn,
        });
      }

      await tx
        .update(inboundDocumentLines)
        .set({ unitCost })
        .where(eq(inboundDocumentLines.id, line.id));
      const suggestedPrice =
        nature.suggestsListPrice && item.grossMargin != null && unitCost != null
          ? round4(Number(unitCost) * (1 + money(item.grossMargin) / 100)).toFixed(4)
          : null;
      await tx
        .update(catalogItems)
        .set({ lastInboundOn: inboundOn })
        .where(
          and(
            eq(catalogItems.id, itemId),
            eq(catalogItems.tenantId, tenantId),
            or(
              isNull(catalogItems.lastInboundOn),
              lte(catalogItems.lastInboundOn, inboundOn),
            ),
          ),
        );
      if (suggestedPrice) {
        await tx
          .update(catalogItems)
          .set({ listPrice: suggestedPrice })
          .where(and(eq(catalogItems.id, itemId), eq(catalogItems.tenantId, tenantId)));
      }
    }

    if (nature.createsPayable) {
      for (const installment of installments) {
        const [payable] = await tx
          .insert(payables)
          .values({
            tenantId,
            creditorId: document.supplierId,
            documentNumber: payableDocumentNumber(document.number, document.series),
            description:
              `Entrada NF ${document.number} parcela ${installment.number}`.slice(0, 255),
            issueOn: document.issueOn,
            dueOn: installment.dueOn,
            installmentAmount: installment.amount,
            planAccountId: nature.planAccountId,
            status: 'pendente',
          })
          .returning({ id: payables.id });
        await tx
          .update(inboundDocumentInstallments)
          .set({ payableId: payable.id })
          .where(eq(inboundDocumentInstallments.id, installment.id));
      }
    }

    await tx
      .update(inboundDocuments)
      .set({
        status: 'posted',
        inboundOn,
        postedAt: new Date(),
        movesStock: nature.movesStock,
        createsPayable: nature.createsPayable,
        updatesAverageCost: nature.updatesAverageCost,
      })
      .where(eq(inboundDocuments.id, documentId));
  });
}

export async function reverseInboundDocument(tenantId: string, documentId: string) {
  await db.transaction(async (tx) => {
    const [document] = await tx
      .select()
      .from(inboundDocuments)
      .where(
        and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
      )
      .for('update');
    if (!document) throw new InboundError(404, 'Nota não encontrada.');
    if (document.status !== 'posted') {
      throw new InboundError(400, 'Somente uma nota lançada pode ser estornada.');
    }

    const installments = await tx
      .select({
        id: inboundDocumentInstallments.id,
        payableId: inboundDocumentInstallments.payableId,
        status: payables.status,
      })
      .from(inboundDocumentInstallments)
      .leftJoin(payables, eq(payables.id, inboundDocumentInstallments.payableId))
      .where(
        and(
          eq(inboundDocumentInstallments.documentId, documentId),
          eq(inboundDocumentInstallments.tenantId, tenantId),
        ),
      );
    if (
      installments.some(
        (installment) => installment.payableId && installment.status !== 'pendente',
      )
    ) {
      throw new InboundError(
        400,
        'Estorne a baixa dos títulos antes de estornar a nota.',
      );
    }

    const movements = await tx
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.documentId, documentId),
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.direction, 'in'),
        ),
      );

    const inboundOn = civilDate();
    for (const movement of [...movements].sort((left, right) =>
      left.itemId.localeCompare(right.itemId),
    )) {
      await tx
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(
          and(eq(catalogItems.id, movement.itemId), eq(catalogItems.tenantId, tenantId)),
        )
        .for('update');
      const [balance] = await tx
        .select()
        .from(stockBalances)
        .where(
          and(
            eq(stockBalances.itemId, movement.itemId),
            eq(stockBalances.tenantId, tenantId),
          ),
        )
        .for('update');
      if (!balance) throw new InboundError(400, 'O saldo do item não foi encontrado.');
      const next = reversedBalance(
        money(balance.quantity),
        money(balance.averageCost),
        money(movement.quantity),
        money(movement.unitCost),
      );
      if (!next) {
        throw new InboundError(400, 'O estorno deixaria o estoque negativo.');
      }
      await tx
        .update(stockBalances)
        .set({
          quantity: next.quantity.toFixed(4),
          averageCost: next.averageCost.toFixed(4),
        })
        .where(
          and(
            eq(stockBalances.itemId, movement.itemId),
            eq(stockBalances.tenantId, tenantId),
          ),
        );
      await tx.insert(stockMovements).values({
        tenantId,
        itemId: movement.itemId,
        documentId,
        lineId: movement.lineId,
        direction: 'out',
        quantity: movement.quantity,
        unitCost: movement.unitCost,
        occurredOn: inboundOn,
      });
    }

    const payableIds = installments.flatMap((installment) =>
      installment.payableId ? [installment.payableId] : [],
    );
    if (payableIds.length > 0) {
      await tx
        .update(inboundDocumentInstallments)
        .set({ payableId: null })
        .where(
          and(
            eq(inboundDocumentInstallments.documentId, documentId),
            eq(inboundDocumentInstallments.tenantId, tenantId),
          ),
        );
      await tx
        .delete(payables)
        .where(and(eq(payables.tenantId, tenantId), inArray(payables.id, payableIds)));
    }

    await tx
      .update(inboundDocuments)
      .set({ status: 'reversed' })
      .where(eq(inboundDocuments.id, documentId));
  });
}

export async function deleteInboundDocument(tenantId: string, documentId: string) {
  await db.transaction(async (tx) => {
    const [document] = await tx
      .select()
      .from(inboundDocuments)
      .where(
        and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
      )
      .for('update');
    if (!document) throw new InboundError(404, 'Nota não encontrada.');
    if (document.status === 'posted') {
      throw new InboundError(400, 'Estorne a nota antes de excluir.');
    }

    const installments = await tx
      .select({
        payableId: inboundDocumentInstallments.payableId,
        status: payables.status,
      })
      .from(inboundDocumentInstallments)
      .leftJoin(payables, eq(payables.id, inboundDocumentInstallments.payableId))
      .where(
        and(
          eq(inboundDocumentInstallments.documentId, documentId),
          eq(inboundDocumentInstallments.tenantId, tenantId),
        ),
      );
    if (installments.some((installment) => installment.status === 'pago')) {
      throw new InboundError(400, 'Estorne a baixa dos títulos antes de excluir a nota.');
    }

    const payableIds = installments.flatMap((installment) =>
      installment.payableId ? [installment.payableId] : [],
    );
    if (payableIds.length > 0) {
      await tx
        .update(inboundDocumentInstallments)
        .set({ payableId: null })
        .where(
          and(
            eq(inboundDocumentInstallments.documentId, documentId),
            eq(inboundDocumentInstallments.tenantId, tenantId),
          ),
        );
      await tx
        .delete(payables)
        .where(and(eq(payables.tenantId, tenantId), inArray(payables.id, payableIds)));
    }

    await tx
      .delete(stockMovements)
      .where(
        and(
          eq(stockMovements.documentId, documentId),
          eq(stockMovements.tenantId, tenantId),
        ),
      );
    await tx
      .delete(inboundDocuments)
      .where(
        and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
      );
  });
}
