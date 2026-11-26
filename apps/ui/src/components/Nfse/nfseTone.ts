import { type StatusTone } from '@/components/ui/statusTone';
import { type NfseListStatus } from '@/services/nfse';

export const nfseStatusTone: Record<NfseListStatus, StatusTone> = {
  pending: {
    background: '#EFF6FF',
    hover: '#DBEAFE',
    border: '#2563EB',
    text: '#1D4ED8',
  },
  authorized: {
    background: '#ECFDF5',
    hover: '#D1FAE5',
    border: '#059669',
    text: '#047857',
  },
  rejected: {
    background: '#FEF2F2',
    hover: '#FEE2E2',
    border: '#DC2626',
    text: '#B91C1C',
  },
  canceled: {
    background: '#F8FAFC',
    hover: '#F1F5F9',
    border: '#64748B',
    text: '#475569',
  },
};
