# Guía de Funcionamiento - Cirugías COAT 🩺

Este documento explica de manera detallada el funcionamiento de cada módulo de la aplicación **Cirugías COAT**, diseñada para la gestión administrativa y financiera de cirugías e ingresos diarios.

---

## 💰 1. Módulo de Caja (Caja Diaria)
Es el núcleo financiero de la aplicación. Permite liquidar honorarios entre múltiples médicos de forma inmediata.

- **Multiprofesional (1 a 3)**: Puedes asignar la cirugía a 1, 2 o 3 profesionales. El sistema permite dividir los honorarios de forma equitativa o manual.
- **Doble Divisa (ARS/USD)**: Maneja balances independientes en Pesos y Dólares. El cierre de caja muestra ambos totales por separado.
- **Saldo COAT**: Se calcula restando los honorarios profesionales del total recibido (`Total - Honorarios = Saldo COAT`).
- **Cierre de Caja**: Guarda el día en el historial y reinicia el formulario.

---

## 📋 2. Módulo de Órdenes (Surgical Orders)
Automatiza la generación de pedidos de internación y consentimientos.

- **Buscador Inteligente**: Al poner un código, el sistema trae el nombre automáticamente si existe en el catálogo o en tus asociaciones personalizadas.
- **Firmas Automáticas**: El sistema inserta la firma del profesional seleccionado (si el archivo PNG está registrado en el sistema).
- **Consentimientos Dinámicos**: Los botones de "Adulto" y "Menor" se activan si la cirugía tiene PDFs vinculados en el Panel Admin.

---

## ⚙️ 3. Panel de Administración e Inteligencia
Controla la "inteligencia" y los recursos de la App.

- **Monitoreo de Supabase**: Desde el Dashboard Admin puedes ver el espacio ocupado por firmas y PDFs.
- **Gestión Descentralizada**: Las firmas se suben desde el perfil de cada Profesional y los PDFs desde el módulo de Consentimientos.
- **Mapeo de Consentimientos**: Permite vincular códigos de cirugía con archivos PDF subidos a la nube.
- **Roles y Permisos**: Define quién puede editar, ver o borrar datos (SuperAdmin, Administrador, Viewer).

---

## 🔒 4. Seguridad (PIN y Roles)
- **PIN de Seguridad**: Cada usuario debe configurar un PIN en su perfil. Es obligatorio para **Editar o Borrar** registros del historial.
- **Roles**:
  - **SuperAdmin**: Control total, gestión de usuarios y backups.
  - **Administrador**: Gestión diaria de caja y órdenes.
  - **Viewer**: Solo lectura.

---

## 🚀 5. Gestión de Archivos (Supabase)
Ya no es necesario subir archivos manualmente al hosting. Todo se gestiona desde la interfaz:

1. **Firmas**: Ve a `Profesionales`, edita un médico y sube su firma (PNG/JPG). Se guardará automáticamente en Supabase.
2. **Consentimientos**: Ve a `Cirugías > Consentimientos`, sube los PDFs y luego asígnalos a los códigos de cirugía correspondientes.
3. **Sincronización**: Los cambios son instantáneos para todos los usuarios.

---
*Documentación actualizada: 1 de Mayo, 2026.*
