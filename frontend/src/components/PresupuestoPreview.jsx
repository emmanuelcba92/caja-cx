import { useState } from 'react';
import { Download, Printer, Loader2 } from 'lucide-react';
import {
  calculateValidUntil,
  defaultConditions,
  ivaSuffix,
  resolveConditionsEnabled,
} from '../data/presupuestoRules.js';
import {
  formatDate,
  formatDocumentDate,
  getItemAmountText,
  parseRichText,
} from '../utils/presupuestoFormat.js';
import { downloadPresupuestoPdf } from '../utils/presupuestoPdf.js';
import { InstitutionalHeader, InstitutionalFooter } from './InstitutionalBrand.jsx';

function RichText({ text }) {
  return parseRichText(text).map((token, idx) =>
    token.bold ? <strong key={idx}>{token.text}</strong> : <span key={idx}>{token.text}</span>
  );
}

function QuoteItemRow({ item, index, numbered = false }) {
  const amount = getItemAmountText(item);
  const suffix = ivaSuffix(item?.iva);

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px', fontSize: '10.5pt', lineHeight: 1.4 }}>
      {numbered && (
        <span style={{ width: '20px', flexShrink: 0, fontWeight: 600 }}>{index + 1})</span>
      )}
      <span style={{ flexShrink: 1 }}>
        {!numbered && item?.codigo ? `${item.codigo} ` : ''}
        {item?.descripcion || ''}
      </span>
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          minWidth: '24px',
          borderBottom: '1px dotted #94a3b8',
          transform: 'translateY(-3px)',
        }}
      />
      <span style={{ flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {amount}
        {suffix ? <span style={{ fontWeight: 600 }}>{` ${suffix}`}</span> : null}
      </span>
    </div>
  );
}

export default function PresupuestoPreview({
  quote,
  showActions = true,
  onPrint,
  onDownloadError,
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!quote) return null;

  const isObraSocial = quote.tipo === 'obra-social';
  const condiciones = {
    ...defaultConditions(quote.tipo),
    ...(quote.condiciones || {}),
  };
  const condicionesActivas = resolveConditionsEnabled(quote.tipo, quote.condicionesActivas);
  const hasAnyObraSocialCondition =
    condicionesActivas.inclusiones ||
    condicionesActivas.anestesista ||
    condicionesActivas.exclusiones ||
    condicionesActivas.nota;
  const hasAnyParticularCondition =
    condicionesActivas.incluye ||
    condicionesActivas.excluye ||
    condicionesActivas.nota ||
    condicionesActivas.facturacion ||
    condicionesActivas.transferencia;
  const validUntil = quote.validUntil || calculateValidUntil(quote.fecha, quote.tipo);

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadPresupuestoPdf(quote);
    } catch (err) {
      if (typeof onDownloadError === 'function') {
        onDownloadError(err);
      } else {
        console.error('[PresupuestoPreview] Error generando PDF:', err);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (typeof onPrint === 'function') {
      onPrint(quote);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      {showActions && (
        <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-xs transition-all"
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-60"
          >
            {isDownloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {isDownloading ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </div>
      )}

      <div className="w-full overflow-x-auto pb-2 print:overflow-visible">
        <div
          className="mx-auto bg-white text-slate-900 shadow-lg border border-slate-200 print:shadow-none print:border-0"
        style={{
          position: 'relative',
          width: '210mm',
          minHeight: '297mm',
          paddingTop: '48px',
          paddingLeft: '64px',
          paddingRight: '64px',
          paddingBottom: '110px',
          boxSizing: 'border-box',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <InstitutionalHeader />

        <div style={{ textAlign: 'right', fontSize: '10.5pt', lineHeight: 1.4 }}>
          <div>{formatDocumentDate(quote.fecha)}</div>
        </div>

        {isObraSocial && (
          <div style={{ marginTop: '6px', fontSize: '10.5pt', fontWeight: 700 }}>
            O. Soc. {quote.obraSocial}
          </div>
        )}

        <h1 style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 800, marginTop: '10px', marginBottom: '18px', letterSpacing: '0.02em' }}>
          PRESUPUESTO PARA CIRUGIA
        </h1>

        {isObraSocial ? (
          <div style={{ fontSize: '10.5pt', lineHeight: 1.5, marginBottom: '20px' }}>
            <div>Apellido y Nombre: {quote.paciente}</div>
            <div>DNI: {quote.dni}</div>
            <div>AF. N.º: {quote.numeroAfiliado}</div>
          </div>
        ) : (
          <div style={{ fontSize: '10.5pt', lineHeight: 1.5, marginBottom: '20px' }}>
            <div><strong>Paciente:</strong> {quote.paciente}</div>
            <div><strong>D.N.I.:</strong> {quote.dni}</div>
            <div><strong>Cirugía:</strong> {quote.cirugia}</div>
          </div>
        )}

        <div style={{ marginBottom: '22px' }}>
          {(quote.items || []).map((item, idx) => (
            <QuoteItemRow
              key={item?.id || idx}
              item={item}
              index={idx}
              numbered={!isObraSocial}
            />
          ))}
        </div>

        {isObraSocial ? (
          hasAnyObraSocialCondition && (
            <div style={{ fontSize: '9.8pt', lineHeight: 1.48 }} className="space-y-2.5">
              <h2 style={{ fontSize: '10.2pt', fontWeight: 800, marginBottom: '4px' }}>MÓDULO QUIRÚRGICO:</h2>
              {condicionesActivas.inclusiones && (
                <p>
                  <strong style={{ textDecoration: 'underline' }}>INCLUSIONES:</strong>{' '}
                  <RichText text={condiciones.inclusiones} />
                </p>
              )}
              {condicionesActivas.anestesista && (
                <p>
                  <strong style={{ textDecoration: 'underline' }}>Honorarios del Anestesista:</strong>{' '}
                  <RichText text={condiciones.anestesista} />
                </p>
              )}
              {condicionesActivas.exclusiones && (
                <p>
                  <strong style={{ textDecoration: 'underline' }}>EXCLUSIONES:</strong>{' '}
                  <RichText text={condiciones.exclusiones} />
                </p>
              )}
              {condicionesActivas.nota && (
                <p>
                  <span style={{ textDecoration: 'underline' }}>Nota:</span>{' '}
                  <RichText text={condiciones.nota} />
                </p>
              )}
            </div>
          )
        ) : (
          hasAnyParticularCondition && (
            <div style={{ fontSize: '9.8pt', lineHeight: 1.48 }} className="space-y-2.5">
              {condicionesActivas.incluye && (
                <p>
                  <strong style={{ textDecoration: 'underline' }}>Incluye:</strong>{' '}
                  <RichText text={condiciones.incluye} />
                </p>
              )}
              {condicionesActivas.excluye && (
                <p>
                  <strong style={{ textDecoration: 'underline' }}>Excluye:</strong>{' '}
                  <RichText text={condiciones.excluye} />
                </p>
              )}
              {condicionesActivas.nota && (
                <p>
                  <span style={{ textDecoration: 'underline' }}>Nota:</span>{' '}
                  <RichText text={condiciones.nota} />
                </p>
              )}
              {condicionesActivas.facturacion && (
                <p>
                  <strong>FACTURACION INDIVIDUAL (Cirujano, Anestesista, Clínica):</strong>{' '}
                  <RichText text={condiciones.facturacion} />
                </p>
              )}
              {condicionesActivas.transferencia && (
                <p>
                  <strong>TRANSFERENCIA:</strong>{' '}
                  <RichText text={condiciones.transferencia} />
                </p>
              )}
            </div>
          )
        )}

        <InstitutionalFooter />
        </div>
      </div>
    </div>
  );
}
