import { useState, useRef } from 'react';
import { Printer, Download, X, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { expandCodes, ESTUDIOS_BAJO_ANESTESIA } from '../data/clinicalCodes';
import { CONSENTIMIENTOS_MAP, CONSENTIMIENTOS_COMBO, CONSENTIMIENTO_GENERICO } from '../data/consentimientos';
import { formatDoctorDisplayName, shortDoctorName } from '../utils/doctorName';

const formatPrintDateNumeric = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

const formatLongDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getApplicableConsents = (surgery) => {
  const codesInput = surgery.codigosAuditados || surgery.codigos || '';
  let raw = [];
  if (Array.isArray(codesInput)) {
    raw = codesInput.map(c => typeof c === 'object' && c ? (c.codigo || c.name || '') : String(c)).filter(Boolean);
  } else if (typeof codesInput === 'string') {
    if (codesInput.includes('\n')) {
      raw = codesInput.split('\n').map(c => c.trim()).filter(Boolean);
    } else {
      raw = codesInput.split(/\s+/).filter(c => c.trim());
    }
  }
  if (raw.length === 0) return [];

  const consents = [];
  const addedNames = new Set();

  for (const code of raw) {
    const trimmed = code.trim();

    for (const combo of CONSENTIMIENTOS_COMBO) {
      if (combo.codigos.includes(trimmed)) {
        const key = combo.nombre;
        if (!addedNames.has(key)) {
          addedNames.add(key);
          consents.push({
            nombre: combo.nombre,
            codigos: combo.codigos,
            adulto: combo.adulto,
            menor: combo.menor
          });
        }
      }
    }

    if (CONSENTIMIENTOS_MAP[trimmed]) {
      const c = CONSENTIMIENTOS_MAP[trimmed];
      if (!addedNames.has(c.nombre)) {
        addedNames.add(c.nombre);
        consents.push({ nombre: c.nombre, codigos: [trimmed], adulto: c.adulto, menor: c.menor });
      }
    }
  }

  return consents.filter(c => c.adulto || c.menor);
};

const ProfessionalHeader = () => (
  <div style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '32px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '56px' }}>
      <img src="/coat_logo.png" alt="COAT" crossOrigin="anonymous" style={{ height: '56px', width: 'auto', objectFit: 'contain', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
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

const ProfessionalFooter = () => (
  <div style={{ position: 'absolute', bottom: '40px', left: '64px', right: '64px' }}>
    <div style={{ borderTop: '2px solid #1e3a8a', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '8pt', color: '#64748b', fontWeight: 500 }}>
      <p>Urquiza 401 - Alberdi • Córdoba • Tel: (0351) 423-0530 / 423-9428 • WhatsApp: 3543579794</p>
      <p>Email: info@coat.com.ar • Web: www.coat.com.ar</p>
    </div>
  </div>
);

const SignatureBlock = ({ nombreProfesional, especialidad, mp, me, firmaUrl }) => {
  const cleanName = formatDoctorDisplayName(nombreProfesional);
  const displayEspecialidad = especialidad === 'ORL' ? 'Otorrinolaringología' : (especialidad || 'Otorrinolaringología');
  return (
    <div style={{ position: 'absolute', bottom: '95px', right: '64px', textAlign: 'center', width: '270px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {firmaUrl ? (
          <img 
            src={firmaUrl} 
            alt="Firma digital" 
            crossOrigin="anonymous"
            style={{ maxHeight: '145px', maxWidth: '270px', objectFit: 'contain', marginBottom: '6px' }} 
          />
        ) : (
          <div style={{ height: '70px' }} />
        )}
        <div style={{ borderTop: '1.5px solid #000', width: '100%', paddingTop: '6px', fontSize: '8.5pt', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.25, fontFamily: '"Arial Black", Arial, sans-serif' }}>
          <p>{cleanName || ''}</p>
          <p>{displayEspecialidad}</p>
          <p>{mp ? `MP ${mp}` : 'MP —'} {me ? `- ME ${me}` : '- ME —'}</p>
        </div>
      </div>
    </div>
  );
};

const buildStudyOrderLines = (surgery, codesLines) => {
  const isEstudio = surgery.tipoProcedimiento === 'ESTUDIO' || !!surgery.estudioBajoAnestesia;
  if (!isEstudio) return null;

  const rawCodes = (surgery.codigosAuditados || surgery.codigos || '').split('\n').map(c => c.trim()).filter(Boolean);
  const isDiseOnly = rawCodes.length > 0 && rawCodes.every(c => c.toUpperCase() === 'DISE' || c.toUpperCase().includes('DISE'));

  const convenios = surgery.conveniosEstudios || {};
  const lines = [];

  const getConvenioConfig = (keyName) => {
    if (!keyName) return {};
    if (convenios[keyName]) return convenios[keyName];
    const lowerKey = keyName.toLowerCase().trim();
    for (const [k, v] of Object.entries(convenios)) {
      const kLower = k.toLowerCase().trim();
      if (kLower === lowerKey || lowerKey.includes(kLower) || kLower.includes(lowerKey)) return v;
    }
    const est = ESTUDIOS_BAJO_ANESTESIA.find(e => e.name.toLowerCase() === lowerKey || e.code.toLowerCase() === lowerKey);
    if (est) {
      if (convenios[est.name]) return convenios[est.name];
      if (convenios[est.code]) return convenios[est.code];
    }
    return {};
  };

  // Items de estudios seleccionados
  codesLines.forEach((name) => {
    const cfg = getConvenioConfig(name);
    const isConvenido = cfg.convenido !== false; // por defecto true
    const valor = cfg.valor ? String(cfg.valor).replace('$', '').trim() : '';

    let tag = '';
    if (isConvenido) {
      tag = '(practica nomenclada: Valor convenio)';
    } else {
      tag = valor ? `(practica no nomenclada: Valor $${valor})` : '(practica no nomenclada)';
    }
    lines.push(`${name} ${tag}`);
  });

  // Si no es DISE, agregar internación breve y medicamentos/descartables
  if (!isDiseOnly) {
    const cfgInternacion = getConvenioConfig('INTERNACION_BREVE') || {};
    const intConvenido = cfgInternacion.convenido !== false;
    const intValor = cfgInternacion.valor ? String(cfgInternacion.valor).replace('$', '').trim() : '';
    const tagInternacion = intConvenido ? '(valor convenio)' : (intValor ? `(Valor $${intValor})` : '(no convenido)');
    lines.push(`Internación breve, uso de quirófano ${tagInternacion}`);

    const cfgMed = getConvenioConfig('MEDICAMENTOS_DESCARTABLES') || {};
    const medConvenido = cfgMed.convenido !== false;
    const medValor = cfgMed.valor ? String(cfgMed.valor).replace('$', '').trim() : '';
    const tagMed = medConvenido ? '(valor convenio)' : (medValor ? `(Valor $${medValor})` : '(no convenido)');
    lines.push(`Medicamentos y descartables ${tagMed}`);
  }

  return lines;
};

export default function PrintConsole({ surgery, onClose }) {
  const [activeTab, setActiveTab] = useState('internacion');
  const [isDownloading, setIsDownloading] = useState(false);
  const printRef = useRef(null);

  if (!surgery) return null;

  const isSM = surgery.obraSocial?.toUpperCase().includes('SWISS');
  const isIOSFA = surgery.obraSocial?.toUpperCase().includes('IOSFA');
  const isEstudio = surgery.tipoProcedimiento === 'ESTUDIO' || !!surgery.estudioBajoAnestesia;
  const isParticular = surgery.obraSocial?.toLowerCase() === 'particular';

  const codesLines = expandCodes(surgery.codigosAuditados || surgery.codigos || '', isSM, isIOSFA);
  const studyOrderLines = buildStudyOrderLines(surgery, codesLines);
  const applicableConsents = getApplicableConsents(surgery);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (isDownloading) return;

    if (activeTab === 'generico') {
      const link = document.createElement('a');
      link.href = getConsentUrl(CONSENTIMIENTO_GENERICO);
      link.download = 'Consentimiento_Generico.pdf';
      link.target = '_blank';
      link.click();
      return;
    }

    if (!printRef.current) return;

    try {
      setIsDownloading(true);
      const toastId = toast.loading('Generando PDF...');

      const container = printRef.current;
      const pageElements = container.querySelectorAll('[data-pdf-page="true"]');
      const targets = pageElements.length > 0 ? Array.from(pageElements) : [container];

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const canvases = await Promise.all(
        targets.map(pageEl =>
          html2canvas(pageEl, {
            scale: 1.8,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
          })
        )
      );

      canvases.forEach((canvas, idx) => {
        if (idx > 0) {
          pdf.addPage('a4', 'portrait');
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      });

      const cleanPatient = (surgery.paciente || 'Cirugia')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');

      const fileName = `Orden_${cleanPatient}_${activeTab.toUpperCase()}.pdf`;
      pdf.save(fileName);
      toast.dismiss(toastId);
      toast.success('PDF descargado correctamente');
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('Error al generar el PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const getConsentUrl = (fileOrUrl) => {
    if (!fileOrUrl) return '#';
    if (fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://')) {
      return fileOrUrl;
    }
    return `/consentimientos/${fileOrUrl}`;
  };

  const renderInternacion = () => (
    <div data-pdf-page="true" className="max-w-[210mm] mx-auto bg-white px-16 py-12 overflow-hidden" style={{ height: '297mm', width: '210mm', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', position: 'relative' }}>
      <ProfessionalHeader />
      <p style={{ textAlign: 'right', marginBottom: '40px', fontSize: '11pt', color: '#000' }}>
        Córdoba, {formatLongDate(surgery.fechaSolicitud || (surgery.fechaCreacion ? surgery.fechaCreacion.slice(0, 10) : surgery.fecha))}
      </p>
      <h1 style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 700, marginBottom: '40px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#000' }}>
        {isEstudio ? 'PEDIDO DE ESTUDIO BAJO ANESTESIA' : 'ORDEN DE INTERNACIÓN'}
      </h1>
      <div style={{ fontSize: '11pt', lineHeight: 1.8, color: '#000' }}>
        <p><strong>Afiliado:</strong> {surgery.paciente?.toUpperCase() || ''}</p>
        <p><strong>Obra social:</strong> {surgery.obraSocial?.toUpperCase() || ''}</p>
        {!isParticular && (
          <p><strong>Número de afiliado:</strong> {surgery.nroAfiliado || ''}</p>
        )}
        {surgery.dni && <p><strong>DNI:</strong> {surgery.dni}</p>}
        {isEstudio ? (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            <p style={{ fontWeight: 700, marginBottom: '6px' }}>Estudios solicitados:</p>
            <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(studyOrderLines || []).map((line, idx) => (
                <p key={idx} style={{ lineHeight: 1.4, fontSize: '11pt' }}>
                  <strong>{idx + 1}-</strong> {line}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: '8px', display: 'flex', gap: '8px' }}>
            <strong style={{ flexShrink: 0 }}>Códigos de cirugía:</strong>
            <div>
              {codesLines.map((line, idx) => (
                <p key={idx} style={{ lineHeight: 1.2 }}>{line}</p>
              ))}
            </div>
          </div>
        )}
        <p style={{ paddingTop: '8px' }}><strong>Tipo de anestesia:</strong> {surgery.anestesia?.toLowerCase() || ''}</p>
        <p style={{ paddingTop: '8px' }}><strong>{isEstudio ? 'Fecha del estudio:' : 'Fecha de cirugía:'}</strong> {formatPrintDateNumeric(surgery.fecha)}</p>
        <p style={{ paddingTop: '8px' }}><strong>Material:</strong> {surgery.materiales?.trim() ? 'Sí' : 'No'}</p>
        <p style={{ paddingTop: '8px' }}><strong>Diagnóstico:</strong> {surgery.justificacion?.toUpperCase() || ''}</p>
      </div>
      <SignatureBlock 
        nombreProfesional={surgery.nombreProfesional} 
        especialidad={surgery.especialidad}
        mp={surgery.mp}
        me={surgery.me}
        firmaUrl={surgery.firmaUrl}
      />
      <ProfessionalFooter />
    </div>
  );

  const renderMaterial = () => (
    <div data-pdf-page="true" className="max-w-[210mm] mx-auto bg-white px-16 py-12 overflow-hidden" style={{ height: '297mm', width: '210mm', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', position: 'relative' }}>
      <ProfessionalHeader />
      <p style={{ textAlign: 'right', marginBottom: '40px', fontSize: '11pt', color: '#000' }}>
        Córdoba, {formatLongDate(surgery.fechaSolicitud || (surgery.fechaCreacion ? surgery.fechaCreacion.slice(0, 10) : surgery.fecha))}
      </p>
      <h1 style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 700, marginBottom: '40px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#000' }}>
        ORDEN DE PEDIDO DE MATERIAL
      </h1>
      <div style={{ fontSize: '11pt', lineHeight: 1.8, color: '#000' }}>
        <p><strong>Afiliado:</strong> {surgery.paciente?.toUpperCase() || ''}</p>
        <p><strong>Obra social:</strong> {surgery.obraSocial?.toUpperCase() || ''}</p>
        {!isParticular && (
          <p><strong>Número de afiliado:</strong> {surgery.nroAfiliado || ''}</p>
        )}
        {surgery.dni && <p><strong>DNI:</strong> {surgery.dni}</p>}
        <div style={{ paddingTop: '8px' }}>
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Material solicitado:</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{surgery.materiales}</p>
        </div>
        <p style={{ paddingTop: '8px' }}><strong>Tipo de anestesia:</strong> {surgery.anestesia?.toLowerCase() || ''}</p>
        <p style={{ paddingTop: '8px' }}><strong>Fecha de cirugía:</strong> {formatPrintDateNumeric(surgery.fecha)}</p>
        <p style={{ paddingTop: '8px' }}><strong>Diagnóstico:</strong> {surgery.justificacion?.toUpperCase() || ''}</p>
      </div>
      <SignatureBlock 
        nombreProfesional={surgery.nombreProfesional} 
        especialidad={surgery.especialidad}
        mp={surgery.mp}
        me={surgery.me}
        firmaUrl={surgery.firmaUrl}
      />
      <ProfessionalFooter />
    </div>
  );

  const renderCaratula = () => (
    <div data-pdf-page="true" className="max-w-[210mm] mx-auto bg-white flex flex-col items-center justify-start text-center overflow-hidden"
      style={{ height: '297mm', width: '210mm', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', position: 'relative', color: '#000', lineHeight: '1.2', paddingTop: '4.5cm' }}>
      {surgery.habitacion && (
        <div style={{ position: 'absolute', top: '1cm', right: '2cm', fontSize: '19pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
          {surgery.habitacion.toUpperCase()}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '24pt', display: 'block' }}>{(surgery.paciente || '').toUpperCase()}</span>
        <span style={{ fontSize: '24pt', display: 'block' }}>DNI {surgery.dni || '-'}</span>
        <span style={{ fontSize: '24pt', display: 'block' }}>{(surgery.obraSocial || '').toUpperCase()}</span>
        <span style={{ fontSize: '24pt', display: 'block' }}>{(shortDoctorName(surgery.nombreProfesional) || '').toUpperCase()}</span>
        <span style={{ fontSize: '24pt', display: 'block' }}>{formatPrintDateNumeric(surgery.fecha)}</span>
        <span style={{ fontSize: '24pt', display: 'block' }}>ALERGIA (-)</span>
      </div>
    </div>
  );

  const renderGenerico = () => (
    <div data-pdf-page="true" className="max-w-[210mm] mx-auto bg-white shadow-2xl flex flex-col items-center justify-center p-12 text-center" style={{ height: '297mm', width: '210mm' }}>
      <div className="p-10 border-2 border-dashed border-slate-200 rounded-3xl max-w-md w-full">
        <FileText size={48} className="mx-auto text-blue-500 mb-4" />
        <h3 className="text-slate-800 font-black uppercase tracking-wider text-base mb-2">Consentimiento Genérico</h3>
        <p className="text-xs text-slate-500 mb-6">Documento estándar de consentimiento informado institucional.</p>
        <a 
          href={getConsentUrl(CONSENTIMIENTO_GENERICO)} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
        >
          <Download size={14} /> Abrir Consentimiento Genérico
        </a>
      </div>
    </div>
  );

  const renderConsentimientos = () => {
    if (applicableConsents.length === 0) {
      return (
        <div data-pdf-page="true" className="max-w-[210mm] mx-auto bg-white shadow-2xl flex items-center justify-center" style={{ height: '297mm', width: '210mm' }}>
          <div className="text-center p-10 border-2 border-dashed border-slate-200 rounded-3xl">
            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Sin consentimientos aplicables</p>
            <p className="text-[10px] text-slate-400 mt-2">No se encontraron consentimientos para los códigos de esta cirugía</p>
          </div>
        </div>
      );
    }

    return (
      <div data-pdf-page="true" className="max-w-[210mm] mx-auto bg-white shadow-2xl p-10" style={{ minHeight: '297mm', width: '210mm', boxSizing: 'border-box' }}>
        <h2 className="text-lg font-black uppercase tracking-wider mb-6 text-center">Consentimientos Aplicables</h2>
        <div className="space-y-4">
          {applicableConsents.map((consent, idx) => (
            <div key={idx} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{consent.nombre}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{consent.codigos?.join(' + ')}</p>
                </div>
                <div className="flex gap-2">
                  {consent.adulto && (
                    <a href={getConsentUrl(consent.adulto)} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[10px] font-bold uppercase hover:bg-blue-700 transition-all cursor-pointer inline-block">
                      Adulto
                    </a>
                  )}
                  {consent.menor && (
                    <a href={getConsentUrl(consent.menor)} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-pink-600 text-white text-[10px] font-bold uppercase hover:bg-pink-700 transition-all cursor-pointer inline-block">
                      Menor
                    </a>
                  )}
                  {!consent.adulto && !consent.menor && (
                    <span className="px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-[10px] font-bold uppercase">No disponible</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'internacion': return renderInternacion();
      case 'material': return renderMaterial();
      case 'ambas': return (
        <>
          {renderInternacion()}
          <div style={{ pageBreakBefore: 'always', breakBefore: 'page' }}></div>
          {renderMaterial()}
        </>
      );
      case 'caratula': return renderCaratula();
      case 'generico': return renderGenerico();
      case 'consentimientos': return renderConsentimientos();
      default: return renderInternacion();
    }
  };

  const hasMaterial = surgery.materiales?.trim() || surgery.requiereMaterial === 'SI';
  const tabs = [
    { id: 'internacion', label: isEstudio ? 'ESTUDIO' : 'INTERNACIÓN', color: 'text-indigo-600' },
    ...(hasMaterial ? [
      { id: 'material', label: 'MATERIAL', color: 'text-emerald-600' },
      { id: 'ambas', label: 'AMBAS', color: 'text-purple-600' },
    ] : []),
    { id: 'caratula', label: 'CARÁTULA', color: 'text-blue-600' },
    { id: 'generico', label: 'GENÉRICO', color: 'text-slate-600' },
    { id: 'consentimientos', label: 'CONSENTIMIENTOS', color: 'text-rose-600' },
  ];

  return (
    <div className="print-console-modal-root fixed inset-0 z-[200] flex flex-col bg-white">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          #print-console-content, #print-console-content * {
            visibility: visible;
          }
          #print-console-toolbar {
            display: none !important;
          }
          .print-console-modal-root {
            position: static !important;
            background: transparent !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }
          #print-console-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          #print-console-content > div {
            box-shadow: none !important;
            margin: 0 auto !important;
          }
          .page-break {
            page-break-before: always !important;
            break-before: page !important;
          }
        }
`}</style>
      <div id="print-console-toolbar" className="flex items-center justify-between px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === tab.id ? `bg-white ${tab.color} shadow-sm border border-slate-200` : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button 
            onClick={handleDownloadPDF} 
            disabled={isDownloading}
            className={`h-9 px-4 bg-slate-900 text-white rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-slate-800 transition-all flex items-center gap-2 ${isDownloading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isDownloading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Generando...
              </>
            ) : (
              <>
                <Download size={14} /> PDF
              </>
            )}
          </button>
          <button onClick={handlePrint} className="h-9 px-4 bg-teal-600 text-white rounded-lg font-black text-[10px] uppercase tracking-wider hover:bg-teal-700 transition-all flex items-center gap-2">
            <Printer size={14} /> Imprimir
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
            <X size={18} />
          </button>
        </div>
      </div>
      <div id="print-console-content" className="flex-1 overflow-auto bg-slate-100 p-6 flex justify-center items-start">
        <div className="bg-white shadow-2xl" ref={printRef}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
