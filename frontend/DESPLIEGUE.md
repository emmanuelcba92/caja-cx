# Guía de Entornos, Compilación y Publicación — COAT Cirugías 2.0

## 1. Separación de entornos (Desarrollo vs. Producción)

| Entorno | Modo Vite | Archivo `.env` (ignorado por Git) | Proyecto Firebase | Hosting | Supabase / Servicios externos |
| --- | --- | --- | --- | --- | --- |
| **Desarrollo aislado** (por defecto) | `development` (`npm run dev`, `npm run build`, `npm test`) | `.env.development` | `coatcx` (`392377174292`) | `coatcx.web.app` | Deshabilitados (`EXTERNAL_SERVICES_ENABLED = false`) |
| **Producción explícita** | `production` (`npm run build:production`) | `.env.production.local` (`VITE_ALLOW_PRODUCTION_FIREBASE=true`) | `caja-de-cirugia` (`1004973900727`) | `coat-test.web.app` (pruebas) y `cajacx.web.app` (producción) | Habilitados (`qmjycvqcwerzbfsbbnla.supabase.co`, bucket `Cirugias`, Gemini) |

> **Importante:** Ambos sitios de Hosting del proyecto principal (`coat-test` y `cajacx`) pertenecen a `caja-de-cirugia` y **comparten la misma base de datos Firestore y el mismo bucket de Supabase**.

---

## 2. Trabajo en desarrollo (`coatcx`)

```powershell
npm.cmd run verify:isolation
npm.cmd run dev
npm.cmd test
```

- `npm.cmd run build` compila en `--mode development` apuntando exclusivamente a `coatcx`.
- Si algún archivo cargado en modo desarrollo contiene identificadores de producción, `verify-isolation.mjs` y `envGuard.js` detienen la ejecución automáticamente.

---

## 3. Procedimiento explícito de compilación para Producción (`caja-de-cirugia`)

Desde `frontend`:

```powershell
npm.cmd run build:production
```

Este comando ejecuta en orden:
1. `prebuild:production`: `node scripts/verify-isolation.mjs --mode production --allow-production` (verifica que `.env.production.local` tenga `VITE_ALLOW_PRODUCTION_FIREBASE=true`, apunte a `caja-de-cirugia` sin emuladores, tenga configurado Supabase `qmjycvqcwerzbfsbbnla` con clave pública `anon`, que `firebase.production.json` apunte a `firestore.production.rules` y que no existan credenciales privadas).
2. `build:production`: `vite build --mode production` (genera `dist/` con la configuración de `caja-de-cirugia` y servicios externos habilitados).
3. `postbuild:production`: `node scripts/verify-isolation.mjs --mode production --allow-production --dist` (inspecciona `dist/` comprobando que el bundle contenga `caja-de-cirugia` y `qmjycvqcwerzbfsbbnla.supabase.co`, y que no contenga `coatcx` ni credenciales privadas).

---

## 4. Comandos de publicación en Firebase Hosting (SOLO cuando esté autorizado)

El archivo `firebase.production.json` define los sitios `coat-test` y `cajacx` y vincula `firestore.rules` a `firestore.production.rules` (evitando cualquier uso accidental de `firestore.rules` de `coatcx`). El uso de `--only hosting:<sitio>` asegura que **únicamente** se publique el frontend estático (`dist/`), sin tocar reglas, índices ni otros servicios.

### Paso 1: Publicar primero en el sitio de pruebas (`coat-test`)

```powershell
npm.cmd run build:production
npx.cmd --yes firebase-tools deploy --config firebase.production.json --only hosting:coat-test --project caja-de-cirugia
```

Verificar en `https://coat-test.web.app` (recordando que lee el Firestore principal de `caja-de-cirugia`).

### Paso 2: Publicar en el sitio principal de producción (`cajacx`)

Una vez validado en `coat-test`:

```powershell
npx.cmd --yes firebase-tools deploy --config firebase.production.json --only hosting:cajacx --project caja-de-cirugia
```

Verificar en `https://cajacx.web.app`.

### Publicación separada de reglas de Firestore (SOLO si se autoriza expresamente para habilitar el bloqueo de escritura del rol `CONSULTA`)

```powershell
npx.cmd --yes firebase-tools deploy --config firebase.production.json --only firestore:rules --project caja-de-cirugia
```

---

## 5. Cómo restaurar la versión anterior de Hosting (Rollback)

Si fuera necesario revertir `coat-test` o `cajacx` a la versión inmediata anterior:

- **Opción A (Consola web de Firebase — inmediata, sin recompilar):**
  1. Ingresar a Firebase Console → proyecto `caja-de-cirugia` → **Hosting**.
  2. Seleccionar el sitio (`coat-test` o `cajacx`).
  3. En la tabla **Historial de lanzamientos (Release history)**, abrir el menú de la versión anterior y elegir **Revertir (Rollback)**.

- **Opción B (Desde la copia local de la versión anterior en `C:\Proyectos con IA\Antigravity\COAT\Caja\frontend`):**
  ```powershell
  cd "C:\Proyectos con IA\Antigravity\COAT\Caja\frontend"
  npx.cmd --yes firebase-tools deploy --only hosting:live --project caja-de-cirugia
  ```
