# 🔥 Firebase-Database — Backend central (App + Web)

Esta carpeta es el **punto único de datos**: la página web (Pagina-sentinela) y la
app móvil (App-Sentinela) apuntan al **mismo proyecto de Firebase** en la nube, por
eso comparten exactamente los mismos datos.

> **Importante:** los datos *viven* en la nube (proyecto `centinela-2b390`), no en
> esta carpeta. Lo que hay acá es la **definición del backend**: configuración,
> reglas de seguridad, índices, servicios y el seed. Esta carpeta es la **fuente de
> verdad** de la que arrancan los dos proyectos.

```
 ┌─────────────────────┐        ┌──────────────────────┐
 │  Página web         │        │  App móvil           │
 │  (React + Vite)     │        │  (Expo / React Nat)  │
 └──────────┬──────────┘        └──────────┬───────────┘
            │   mismas claves de           │
            │   firebase.config            │
            ▼                              ▼
 ┌────────────────────────────────────────────────────┐
 │        FIREBASE — proyecto centinela-2b390         │
 │   Authentication  +  Firestore (region nam5)       │
 │  usuarios · cursos · materias · asistencias ·      │
 │  notas · horarios · sesionesQR · novedades …       │
 └────────────────────────────────────────────────────┘
```

## 📦 Contenido

| Archivo / carpeta | Para qué sirve |
|---|---|
| `.firebaserc` | Proyecto por defecto: **`centinela-2b390`** |
| `firebase.json` | Config de deploy (reglas + índices de Firestore) |
| `firestore.rules` | Reglas de seguridad por rol (administrador, directivo, preceptor, profesor, alumno, padre) |
| `firestore.indexes.json` | Índices para búsquedas rápidas |
| `firebase.config.json` | **Config real del cliente** (claves públicas, únicas para app y web) |
| `firebase.js` | Inicializador del SDK (versión app Expo) |
| `services/` | **Capa de datos canónica** (17 módulos + `index.js`) — origen de `src/services/firestore/` de la app |
| `scripts/` | Seed con Firebase Admin (`seed.js`, `seedData.js`, `target.js`) |
| `web/` | Capa Firebase de la página: config con `.env`, `collections`, `roles` y `services/` |

**Origen:** extraído de las ramas `rama-ramiro-firestore2` (app) y
`rama-ramiro-firebase` (web). Si esas ramas evolucionan, volvé a extraer los
archivos para mantener esta carpeta al día (`git show rama:ruta > archivo`).

---

## 🚀 Puesta en marcha (solo una vez)

1. **Acceso al proyecto:** el proyecto `centinela-2b390` tiene que estar en tu
   cuenta de Google (consola Firebase → Usuarios y permisos).
2. **Habilitar Authentication:** Consola Firebase → Authentication →
   *Comencemos* → **Correo/contraseña** → Habilitar.
3. **Firestore ya creado** (región `nam5`, modo producción).
4. **Publicar reglas e índices** (requiere [Firebase CLI](https://firebase.google.com/docs/cli)):
   ```bash
   npm install -g firebase-tools
   firebase login                      # abre el navegador de Google
   cd firebase-database
   firebase deploy --only firestore:rules,firestore:indexes
   ```
5. **Cargar datos demo (seed):**
   - Consola Firebase → *Configuración del proyecto* → *Cuentas de servicio* →
     **Generar nueva clave privada** (se descarga un JSON — **nunca subirlo a git**).
   ```bash
   cd firebase-database/scripts
   npm install
   npm run seed:dry                    # prueba sin escribir nada
   npm run seed -- --credential "C:\ruta\al\centinela-...json"
   ```
   También acepta `GOOGLE_APPLICATION_CREDENTIALS` o Application Default Credentials.
   > El seed solo puebla **Firestore**: los usuarios de correo/contraseña de
   > Authentication se dan de alta desde la app (registro o pantalla de Usuarios).

---

## 🔌 Cómo lo consumen los proyectos

### App móvil (Expo) — desde esta carpeta

```bash
npx expo install firebase
```

| Copiar de acá | Hacia la app |
|---|---|
| `firebase.config.json` | `src/firebase.config.json` |
| `firebase.js` | `src/firebase.js` |
| `services/` | `src/services/firestore/` ← así resuelven los imports `../../firebase` |

### Página web (Vite) — desde esta carpeta

```bash
npm install firebase
```

| Copiar de acá | Hacia la web |
|---|---|
| `web/` (carpeta completa) | `src/Firebase/` |
| `web/.env.example` | `.env.local` (opcional, para sobreescribir claves) |

---

## 🛡️ Roles y permisos

| Rol | Puede |
|---|---|
| **administrador** | Todo: usuarios, configuración, reportes |
| **directivo** | Lectura general, reportes y auditoría |
| **preceptor** | Asistencia general, autorizar ingresos/salidas, avisos |
| **profesor** | Asistencia y notas de sus materias, avisos de tipo evaluación/TP |
| **alumno** | Ver su asistencia, notas y avisos; justificar inasistencias |
| **padre** | Ver asistencia/notas del hijo y justificar |

## 🗂 Colecciones principales

`usuarios` · `alumnos` · `padres` · `cursos` · `materias` · `inscripciones` ·
`horarios` · `asistencias` · `sesionesQR` · `justificaciones` · `notificaciones` ·
`auditoria` · `notas` · `examenes` · `trabajosPracticos` · `entregasTP` · `novedades`

## ⚠️ Notas

- Esta carpeta **no es un repo git**: editala con cuidado (si querés, inicializá
  un repo propio y subilo a GitHub como backend compartido).
- Las claves de `firebase.config.json` son **públicas de cliente** (las necesita el
  SDK). Lo privado son las service accounts: jamás commitearlas.
- Servicios de la app ↔ web: `services/` es la capa canónica (app); `web/` mantiene
  la capa TypeScript propia de la página. Si cambiás un servicio, reflejá el cambio
  en ambos lados.
