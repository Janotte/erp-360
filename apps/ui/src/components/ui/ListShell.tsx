import { Search } from 'lucide-react';
import { type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function ListPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold text-[#172337]">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[#64748b]">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function ListPanel({
  title,
  description,
  toolbar,
  children,
}: {
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#dfe5ee] bg-white p-4 shadow-[0_4px_22px_#1e293b0a] md:p-[22px]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-[19px] font-semibold text-[#172337]">{title}</h3>
          {description ? (
            <p className="mt-2 text-[13px] text-[#64748b]">{description}</p>
          ) : null}
        </div>
        {toolbar ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            {toolbar}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function ListSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative w-full sm:w-[235px]">
      <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[#64748b]" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[42px] border-[#cbd5e1] pl-9"
        aria-label={label}
      />
    </div>
  );
}

export function ListFilter<Value extends string>({
  value,
  onValueChange,
  label,
  allLabel,
  options,
}: {
  value: Value | 'all';
  onValueChange: (value: Value | 'all') => void;
  label: string;
  allLabel: string;
  options: readonly { value: Value; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as Value | 'all')}>
      <SelectTrigger
        className="h-[42px] w-full border-[#cbd5e1] sm:w-[235px]"
        aria-label={label}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ListMessage({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'error';
}) {
  return (
    <p
      className={cn(
        'px-3.5 py-8 text-center text-sm',
        tone === 'error' ? 'text-red-600' : 'text-[#64748b]',
      )}
    >
      {children}
    </p>
  );
}
