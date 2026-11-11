import { useEffect, useState } from 'react';

export function useResource(load, dependencies) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    load()
      .then((data) => {
        if (active) setState({ data, error: '', loading: false });
      })
      .catch((error) => {
        if (active) setState({ data: null, error: error.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, dependencies);
  return [
    state,
    (data) =>
      setState((current) => ({
        ...current,
        data: typeof data === 'function' ? data(current.data) : data,
      })),
  ];
}
