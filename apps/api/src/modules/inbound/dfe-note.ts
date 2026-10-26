export type RecipientManifestation = 'none' | 'aware' | 'confirmed' | 'unaware' | 'not_performed';
export type NfeAuthorizationStatus = 'authorized' | 'denied' | 'cancelled';

export interface DfeNoteView {
  role: 'nfe' | 'event' | 'ignore';
  accessKey: string | null;
  emitterTaxId: string | null;
  emitterName: string | null;
  issueOn: string | null;
  number: string | null;
  series: string | null;
  amount: number | null;
  authorizationStatus: NfeAuthorizationStatus;
  manifestation: Exclude<RecipientManifestation, 'none'> | null;
  eventAt: string | null;
}

const manifestByEvent = {
  '210200': 'confirmed',
  '210210': 'aware',
  '210220': 'unaware',
  '210240': 'not_performed',
} as const;

function tag(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() || null;
}

function digitsFromKey(accessKey: string, start: number, length: number) {
  return accessKey.slice(start, start + length).replace(/^0+/, '') || '0';
}

export function readDfeNote(kind: string, xml: string): DfeNoteView {
  const accessKey = tag(xml, 'chNFe') ?? xml.match(/Id="NFe([0-9]{44})"/)?.[1] ?? null;
  const base = {
    accessKey,
    emitterTaxId: tag(xml, 'CNPJ'),
    emitterName: tag(xml, 'xNome'),
    issueOn: tag(xml, 'dhEmi')?.slice(0, 10) ?? null,
    number: accessKey ? digitsFromKey(accessKey, 25, 9) : null,
    series: accessKey ? digitsFromKey(accessKey, 22, 3) : null,
    amount: null as number | null,
    authorizationStatus: 'authorized' as NfeAuthorizationStatus,
    manifestation: null,
    eventAt: tag(xml, 'dhEvento'),
  };
  const amountText = tag(xml, 'vNF');
  const parsedAmount = amountText == null ? Number.NaN : Number(amountText);
  if (Number.isFinite(parsedAmount)) base.amount = Math.round(parsedAmount * 100);
  const situation = tag(xml, 'cSitNFe');
  if (situation === '2') base.authorizationStatus = 'denied';
  if (situation === '3') base.authorizationStatus = 'cancelled';
  const eventCode = tag(xml, 'tpEvento');
  if (kind === 'event' || kind === 'event_summary') {
    return {
      ...base,
      role: 'event',
      manifestation: manifestByEvent[eventCode as keyof typeof manifestByEvent] ?? null,
    };
  }
  if ((kind === 'summary' || kind === 'nfe') && accessKey && base.emitterTaxId) {
    return { ...base, role: 'nfe' };
  }
  return { ...base, role: 'ignore' };
}

export function discoveryAction(input: {
  status: string;
  authorizationStatus: NfeAuthorizationStatus;
  recipientManifestation: RecipientManifestation;
  hasCompleteXml: boolean;
}):
  | { kind: 'blocked'; message: string }
  | { kind: 'import' | 'manifest' | 'download' | 'none' } {
  if (input.status !== 'discovered') return { kind: 'none' };
  if (input.authorizationStatus === 'cancelled') {
    return { kind: 'blocked', message: 'Esta NF-e está cancelada na SEFAZ.' };
  }
  if (input.authorizationStatus === 'denied') {
    return { kind: 'blocked', message: 'Esta NF-e está denegada na SEFAZ.' };
  }
  if (input.hasCompleteXml) return { kind: 'import' };
  if (input.recipientManifestation === 'none') return { kind: 'manifest' };
  return { kind: 'download' };
}
