"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_MS = 15_000;

/**
 * El tablero se actualiza vía chat/MCP fuera de esta pestaña, así que
 * el server component no se entera solo. Refresca en segundo plano
 * y al volver a la pestaña, sin pisar el estado de los client components.
 */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const intervalo = setInterval(() => router.refresh(), INTERVALO_MS);

    function alVolver() {
      if (document.visibilityState === "visible") router.refresh();
    }

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [router]);

  return null;
}
