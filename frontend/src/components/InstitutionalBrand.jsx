export {
  loadPdfImage,
  drawPdfHeader,
  drawPdfFooter,
} from '../utils/institutionalPdf.js';

export const InstitutionalHeader = () => (
  <div style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '32px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '56px' }}>
      <img
        src="/coat_logo.png"
        alt="COAT"
        crossOrigin="anonymous"
        style={{ height: '56px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingRight: '64px' }}>
        <span style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.05em', lineHeight: 1.2 }}>
          CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA
        </span>
        <span style={{ fontSize: '9pt', fontWeight: 500, color: '#334155', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '2px' }}>
          NARIZ • GARGANTA • OÍDO
        </span>
      </div>
    </div>
  </div>
);

export const InstitutionalFooter = () => (
  <div style={{ position: 'absolute', bottom: '40px', left: '64px', right: '64px' }}>
    <div style={{ borderTop: '2px solid #1e3a8a', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '8pt', color: '#64748b', fontWeight: 500 }}>
      <p>Urquiza 401 - Alberdi • Córdoba • Tel: (0351) 423-0530 / 423-9428 • WhatsApp: 3543579794</p>
      <p>Email: info@coat.com.ar • Web: www.coat.com.ar</p>
    </div>
  </div>
);
