import { type StatusTone } from '@/components/ui/statusTone';
import { type InboundStatus } from '@/services/inbound';

export const inboundStatusTone: Record<InboundStatus, StatusTone> = {
  posted: {
    background: '#ECFDF5',
    hover: '#D1FAE5',
    border: '#059669',
    text: '#047857',
  },
  divergent: {
    background: '#FEF2F2',
    hover: '#FEE2E2',
    border: '#DC2626',
    text: '#B91C1C',
  },
  pending: {
    background: '#EFF6FF',
    hover: '#DBEAFE',
    border: '#2563EB',
    text: '#1D4ED8',
  },
  pre_note: {
    background: '#FFF7ED',
    hover: '#FFEDD5',
    border: '#EA580C',
    text: '#C2410C',
  },
  discovered: {
    background: '#F5F3FF',
    hover: '#EDE9FE',
    border: '#7C3AED',
    text: '#6D28D9',
  },
  reversed: {
    background: '#F8FAFC',
    hover: '#F1F5F9',
    border: '#64748B',
    text: '#475569',
  },
  ignored: {
    background: '#F8FAFC',
    hover: '#F1F5F9',
    border: '#64748B',
    text: '#475569',
  },
};
