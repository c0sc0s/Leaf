import { useEffect, useState } from 'react';

const isHome = (hash: string) => ['', '#', '#/', '#/library'].includes(hash);

export function useAppRoute() {
  const [route, setRoute] = useState(() => ({
    notFound: !isHome(location.hash),
    canReturn: false,
  }));
  useEffect(() => {
    const change = (event: HashChangeEvent) =>
      setRoute({
        notFound: !isHome(location.hash),
        canReturn: isHome(new URL(event.oldURL).hash),
      });
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const home = () => {
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    setRoute({ notFound: false, canReturn: false });
  };
  return { ...route, home };
}
