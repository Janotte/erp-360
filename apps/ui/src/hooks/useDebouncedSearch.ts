import { useEffect, useRef, useState } from 'react';

export function useDebouncedSearch(onCommit: (value: string) => void, delay = 400) {
  const [text, setText] = useState('');
  const onCommitRef = useRef(onCommit);
  const committed = useRef('');

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
