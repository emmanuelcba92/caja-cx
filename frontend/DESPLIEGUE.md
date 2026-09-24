# Publicación en test y producción

Esta guía publica solo el frontend generado en `dist`. No cambia colecciones,
documentos ni reglas de Firestore.

## Destinos configurados

| Entorno | Firebase Hosting | URL |
| --- | --- | --- |
| Test | `test` → `coat-test` | https://coat-test.web.app |
| Producción | `live` → `cajacx` | https://cajacx.web.app |

Ambos sitios pertenecen al proyecto Firebase `caja-de-cirugia` y comparten el
mismo Firestore. En test no deben realizarse pruebas que creen o modifiquen
datos reales salvo que estén deliberadamente controladas. La aplicación bloquea
los borrados en el entorno de prueba.

## Requisitos

- Node.js y npm instalados.
- Acceso a Firebase con permisos sobre `caja-de-cirugia`.
- Acceso de escritura al repositorio de GitHub.

La primera vez que se use Firebase CLI en un equipo, iniciar sesión:

```powershell
npx --yes firebase-tools login
```

## Publicar en test

Desde la carpeta `frontend` del repositorio:

```powershell
npm ci
npm run build
npx --yes firebase-tools deploy --only hosting:test --project caja-de-cirugia
```

Después verificar https://coat-test.web.app y probar el flujo modificado.

## Publicar en producción

Primero registrar el cambio en GitHub y, tras validarlo en test, publicar el
mismo código en Firebase Hosting:

```powershell
git status
git add .
git commit -m "Descripción breve del cambio"
git push origin main

cd frontend
npm run build
npx --yes firebase-tools deploy --only hosting:live --project caja-de-cirugia
```

Después verificar https://cajacx.web.app con una sesión normal.

## Regla práctica

- Cambio en desarrollo: publicar en `test`.
- Cambio validado: subir a GitHub y publicar en `live`.
- Nunca usar `hosting:live` para una prueba rápida.
- No desplegar reglas, índices ni datos de Firestore dentro de este procedimiento.
