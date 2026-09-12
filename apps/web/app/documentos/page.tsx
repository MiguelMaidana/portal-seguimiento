import Link from "next/link";
import { listarCarpetas, listarDocumentos } from "@tablero/db/documentos";
import { AutoRefresh } from "../../components/AutoRefresh";
import { DocumentoCard } from "../../components/DocumentoCard";
import { Nav } from "../../components/Nav";
import { SubirDocumentoForm } from "../../components/SubirDocumentoForm";
import { requireUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function Documentos({
  searchParams,
}: {
  searchParams: Promise<{ carpeta?: string }>;
}) {
  await requireUser();
  const { carpeta } = await searchParams;

  const [carpetas, documentos] = await Promise.all([
    listarCarpetas(),
    listarDocumentos(carpeta),
  ]);

  return (
    <>
      <AutoRefresh />
      <header className="board-head">
        <h1 className="board-title">Documentos</h1>
        <p className="board-date narrow">IA en TSOFT</p>
        <Nav activa="documentos" />
      </header>

      <SubirDocumentoForm carpetas={carpetas} />

      {carpetas.length > 0 && (
        <div className="tabs" role="tablist">
          <Link
            href="/documentos"
            className={`tab${!carpeta ? " tab-activa" : ""}`}
            aria-current={!carpeta ? "page" : undefined}
          >
            Todas
          </Link>
          {carpetas.map((c) => (
            <Link
              key={c}
              href={`/documentos?carpeta=${encodeURIComponent(c)}`}
              className={`tab${carpeta === c ? " tab-activa" : ""}`}
              aria-current={carpeta === c ? "page" : undefined}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {documentos.length === 0 ? (
        <div className="empty">
          <p>Todavía no subiste ningún documento.</p>
        </div>
      ) : (
        <div className="documentos-grid">
          {documentos.map((d) => (
            <DocumentoCard
              key={d.nombre_logico}
              nombreLogico={d.nombre_logico}
              ultima={d.ultima}
              anteriores={d.anteriores}
            />
          ))}
        </div>
      )}
    </>
  );
}
