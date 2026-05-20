# Plan de desarrollo: App de Caja y Liquidaciones Médicas

## 🎯 Objetivo
Crear una aplicación web liviana y visualmente amigable que permita:
- Ingresar datos diarios de caja en un formato igual al modelo Excel.
- Generar automáticamente liquidaciones por profesional.
- Exportar planillas y recibos en formato Excel o PDF respetando el diseño actual.

---

## 🧱 Estructura del proyecto

### 1. Frontend
- **Framework**: React + Vite
- **Estilos**: Tailwind CSS (simula estética de Excel)
- **Componentes clave**:
  - `CajaForm`: tabla editable con los campos del modelo.
  - `LiquidacionView`: vista por profesional con totales y recibo.
  - `ExportButton`: exporta a Excel usando plantilla.

### 2. Backend
- **Lenguaje**: Python
- **Framework**: Flask
- **Endpoints**:
  - `/guardar-caja`: guarda datos del día.
  - `/liquidacion/:profesional`: genera liquidación automática.
  - `/exportar`: devuelve Excel o PDF con formato.

### 3. Base de datos
- **SQLite** (local) o PostgreSQL (nube)
- **Tablas**:
  - `caja_diaria`
  - `profesionales`
  - `liquidaciones`

### 4. Automatización
- Al guardar la caja:
  - Se calculan automáticamente las liquidaciones.
  - Se generan recibos por profesional.
  - Se exportan planillas con formato idéntico.

---

## 📦 Funcionalidades

### Caja diaria
- Ingreso de datos en tabla editable.
- Validación de montos.
- Botón para guardar y exportar.

### Liquidación por profesional
- Filtro automático por nombre.
- Cálculo de totales.
- Ajustes (vueltos, honorarios compartidos).
- Recibo imprimible con firma.

### Exportación
- Uso de plantillas Excel (`openpyxl`, `xlsxwriter`).
- Exportación a PDF (`reportlab`, `pdfkit`).

---

## 🚀 Hosting y despliegue
- **Frontend**: GitHub Pages
- **Backend**: Railway o Render
- **Automatización**: GitHub Actions

---

## 🧠 Prompt para Antigravity

> "Quiero una aplicación web liviana en React + Flask que permita ingresar datos de caja médica en formato tipo Excel, generar automáticamente liquidaciones por profesional, y exportar planillas y recibos en formato Excel respetando el diseño actual. La interfaz debe ser clara, editable como tabla, y debe incluir validaciones, filtros por profesional, y botones de exportación."

---

## 📌 Notas finales
- Mantener estética Excel para evitar resistencia al cambio.
- Permitir correcciones manuales antes de exportar.
- Escalable para múltiples días y profesionales.