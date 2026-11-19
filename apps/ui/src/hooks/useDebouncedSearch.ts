import { useEffect, useRef, useState } from 'react';

export function useDebouncedSearch(
  onCommit: (value: string) => void,
  delay = 400,
  initial = '',
) {
  const [text, setText] = useState(initial);
  const onCommitRef = useRef(onCommit);
  const committed = useRef(initial.trim());

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim();
      if (committed.current === next) return;
      committed.current = next;
      onCommitRef.current(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, text]);

  return { text, setText };
}
