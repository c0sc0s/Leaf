import { useCallback, useEffect, useRef, useState } from 'react';

export function usePasswordPrompt() {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const pending = useRef<Array<(value: string | null) => void>>([]);
  const askPassword = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        pending.current.push(resolve);
        if (pending.current.length === 1) {
          setPassword('此 PDF 受密码保护');
          setPasswordValue('');
        }
      }),
    [],
  );
  const finishPassword = useCallback((value: string | null) => {
    pending.current.shift()?.(value);
    setPassword(pending.current.length ? '此 PDF 受密码保护' : null);
    setPasswordValue('');
  }, []);
  useEffect(
    () => () => {
      for (const resolve of pending.current.splice(0)) resolve(null);
    },
    [],
  );
  return { password, passwordValue, setPasswordValue, askPassword, finishPassword };
}
