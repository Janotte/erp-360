import type { KeyboardEvent } from 'react';

export function focusNextEnterField(form: HTMLFormElement, current: HTMLElement) {
  const fields = Array.from(
    form.querySelectorAll<HTMLElement>('[data-enter-sequence]'),
  ).filter((field) => !field.hasAttribute('disabled'));
  const index = fields.findIndex((field) => field === current || field.contains(current));
  if (index < 0) return;
  fields[index + 1]?.focus();
}

/** Enter avança o foco. Shift+Enter quebra linha. O botão de enviar confirma. */
export function onEnterSequence(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.defaultPrevented)
    return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target instanceof HTMLTextAreaElement && event.shiftKey) return;
  if (target instanceof HTMLButtonElement && target.type === 'submit') return;
  const field = target.closest<HTMLElement>('[data-enter-sequence]');
  if (
    !field &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  ) {
    event.preventDefault();
    return;
  }
  if (!field || field.hasAttribute('disabled')) return;
  event.preventDefault();
  focusNextEnterField(event.currentTarget, field);
}

/** Enter numa lista fechada avança. Espaço continua abrindo a lista. */
export function onEnterSequenceCapture(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.getAttribute('role') !== 'combobox') return;
  if (target.getAttribute('data-state') === 'open') return;
  const field = target.closest<HTMLElement>('[data-enter-sequence]');
  if (!field || field.hasAttribute('disabled')) return;
  event.preventDefault();
  event.stopPropagation();
  focusNextEnterField(event.currentTarget, field);
}
