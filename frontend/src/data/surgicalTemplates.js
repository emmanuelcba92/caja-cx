export const SURGICAL_TEMPLATES = [
  {
    id: 'amigdalectomia',
    name: 'Amigdalectomía y Adenoidectomía',
    category: 'ORL - Faringe / Laringe',
    diagnostico: 'Hipertrofia adenoamigdalina / Apnea obstructiva del sueño infantil / Amigdalitis recurrente',
    anestesia: 'General',
    duracion: '0:45 hs',
    requiereMaterial: 'NO',
    materiales: '',
    codigos: ['031301'],
    notasDoctor: 'Ablación quirúrgica por técnica convencional con hemostasia por electrocoagulación.'
  },
  {
    id: 'septumplastia_cornetes',
    name: 'Septumplastia + Turbinoplastia (Cornetes)',
    category: 'ORL - Rinología',
    diagnostico: 'Desviación septal obstructiva e hipertrofia de cornetes inferiores',
    anestesia: 'General',
    duracion: '1:00 hs',
    requiereMaterial: 'SI',
    materiales: 'Splints septales de silicona, taponamiento nasal reabsorbible o merocel.',
    codigos: ['030411', '030412'],
    notasDoctor: 'Septumplastia reglada con corrección de espolón y radiofrecuencia/cauterización de cornetes inferiores.'
  },
  {
    id: 'cens_poliposis',
    name: 'Cirugía Endoscópica Nasosinusal (CENS)',
    category: 'ORL - Rinología',
    diagnostico: 'Rinosinusitis crónica con poliposis nasosinusal / Pansinusitis',
    anestesia: 'General',
    duracion: '1:30 hs',
    requiereMaterial: 'SI',
    materiales: 'Láminas de shaver descartable nasosinusal, hemostático de colágeno o matriz hemostática, taponamiento nasosinusal.',
    codigos: ['030517', '030508'],
    notasDoctor: 'Abordaje endoscópico guiado por óptica rígida. Etmoidectomía anterior/posterior y antrostomía maxilar amplia.'
  },
  {
    id: 'timpanoplastia',
    name: 'Timpanoplastia (Cierre timpánico)',
    category: 'ORL - Otología',
    diagnostico: 'Otitis media crónica simple con perforación timpánica seca',
    anestesia: 'General',
    duracion: '1:30 hs',
    requiereMaterial: 'SI',
    materiales: 'Gelfoam, esponjas de PVA para conducto, microinstrumental otológico.',
    codigos: ['030202'],
    notasDoctor: 'Abordaje transcanal / retroauricular. Injerto de fascia temporal o pericondrio tragal para miringoplastia/timpanoplastia.'
  },
  {
    id: 'miringotomia_diabolos',
    name: 'Miringotomía con Tubos de Ventilación',
    category: 'ORL - Otología',
    diagnostico: 'Otitis media con efusión (serosa persistente) / Disfunción tubaria',
    anestesia: 'General',
    duracion: '0:30 hs',
    requiereMaterial: 'SI',
    materiales: 'Tubos de ventilación timpánica (diábolos de fluoroplástico / titanio) bilaterales.',
    codigos: ['030203'],
    notasDoctor: 'Miringotomía bajo microscopio quirúrgico en cuadrante anteroinferior y aspiración de secreciones antes de colocación.'
  },
  {
    id: 'microcirugia_laringe',
    name: 'Microcirugía de Laringe / Pólipo Vocal',
    category: 'ORL - Faringe / Laringe',
    diagnostico: 'Disfonía crónica por lesión benigna de cuerda vocal (pólipo / nódulo / quiste cordal)',
    anestesia: 'General',
    duracion: '0:45 hs',
    requiereMaterial: 'NO',
    materiales: '',
    codigos: ['030608', '030609'],
    notasDoctor: 'Laringoscopía de suspensión bajo microscopio con técnica de microcirugía fría y preservación de mucosa del borde libre.'
  },
  {
    id: 'turbinoplastia',
    name: 'Turbinoplastia / Cauterización de Cornetes',
    category: 'ORL - Rinología',
    diagnostico: 'Rinitis hipertrófica medicamentosa o vasomotora rebelde a tratamiento',
    anestesia: 'General',
    duracion: '0:30 hs',
    requiereMaterial: 'NO',
    materiales: '',
    codigos: ['030412'],
    notasDoctor: 'Reducción volumétrica de cornetes inferiores bilateral.'
  }
];
