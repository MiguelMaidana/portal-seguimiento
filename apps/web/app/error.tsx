"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="empty" role="alert">
      <p>No se pudo cargar el tablero.</p>
      <button type="button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
