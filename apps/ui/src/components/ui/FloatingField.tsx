import { ChevronDown } from 'lucide-react';
import {
  type ComponentProps,
  type ReactNode,
  useId,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

type FieldChrome = {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
  filled: boolean;
  multiline?: boolean;
  control: (field: {
    id: string;
    describedBy?: string;
    floated: boolean;
  }) => ReactNode;
};

function FieldChrome({
  id,
  label,
  required,
  error,
  disabled,
  className,
  filled,
  multiline = false,
  control,
}: FieldChrome) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const [focused, setFocused] = useState(false);
  const floated = focused || filled;

  return (
    <div
      className={cn('relative', className)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div
        className={cn(
          'relative rounded-md border bg-transparent transition-colors',
          error ? 'border-destructive' : focused ? 'border-primary' : 'border-input',
          disabled && 'border-zinc-300',
        )}
      >
        {control({
          id: fieldId,
          describedBy: error ? errorId : undefined,
          floated,
        })}
        <label
          htmlFor={fieldId}
          className={cn(
            'absolute left-2.5 z-10 max-w-[calc(100%-1.25rem)] truncate leading-none transition-all',
            floated
              ? 'top-0 -translate-y-1/2 bg-white px-1 text-xs font-medium'
              : multiline
                ? 'top-3 bg-transparent px-0 text-sm'
                : 'top-1/2 -translate-y-1/2 bg-transparent px-0 text-sm',
            error
              ? 'text-destructive'
              : focused
                ? 'text-primary'
                : disabled
                  ? 'text-zinc-700'
                  : 'text-muted-foreground',
          )}
        >
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </label>
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  'w-full bg-transparent text-sm text-zinc-900 outline-none disabled:cursor-not-allowed disabled:text-zinc-800';

function keepsLabelUp(type: string | undefined) {
  return type === 'date' || type === 'datetime-local' || type === 'time' || type === 'month';
}

type FloatingInputProps = Omit<ComponentProps<'input'>, 'id' | 'className' | 'size'> & {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
};

export function FloatingInput({
  id,
  label,
  required,
  error,
  disabled,
  className,
  value,
  type,
  ...props
}: FloatingInputProps) {
  const filled = keepsLabelUp(type) || (value != null && String(value) !== '');
  return (
    <FieldChrome
      id={id}
      label={label}
      required={required}
      error={error}
      disabled={disabled}
      className={className}
      filled={filled}
      control={({ id: fieldId, describedBy }) => (
        <input
          {...props}
          id={fieldId}
          type={type}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          className={cn(controlClass, 'h-11 px-3')}
        />
      )}
    />
  );
}

type FloatingTextareaProps = Omit<ComponentProps<'textarea'>, 'id' | 'className'> & {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
};

export function FloatingTextarea({
  id,
  label,
  required,
  error,
  disabled,
  className,
  value,
  ...props
}: FloatingTextareaProps) {
  const filled = value != null && String(value) !== '';
  return (
    <FieldChrome
      id={id}
      label={label}
      required={required}
      error={error}
      disabled={disabled}
      className={className}
      filled={filled}
      multiline
      control={({ id: fieldId, describedBy }) => (
        <textarea
          {...props}
          id={fieldId}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          className={cn(controlClass, 'min-h-24 resize-y px-3 pt-4 pb-2')}
        />
      )}
    />
  );
}

type FloatingSelectProps = Omit<ComponentProps<'select'>, 'id' | 'className'> & {
  id?: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
};

export function FloatingSelect({
  id,
  label,
  required,
  error,
  disabled,
  className,
  value,
  children,
  ...props
}: FloatingSelectProps) {
  const filled = value != null && String(value) !== '';
  return (
    <FieldChrome
      id={id}
      label={label}
      required={required}
      error={error}
      disabled={disabled}
      className={className}
      filled={filled}
      control={({ id: fieldId, describedBy, floated }) => (
        <>
          <select
            {...props}
            id={fieldId}
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            className={cn(
              controlClass,
              'h-11 appearance-none px-3 pr-8',
              !floated && 'text-transparent',
              '[&>option]:text-zinc-900',
            )}
          >
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
        </>
      )}
    />
  );
}
