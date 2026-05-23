# 🎨 Control de Pintores NZ — v1.2

PWA offline para control de horas, pagos e **impuestos Nueva Zelanda** de pintores.

## 📁 Estructura
```
control-pintores/
├── index.html              ← App principal
├── generar-licencia.html   ← Tu herramienta privada (solo tú)
├── sw.js                   ← Service Worker (offline)
├── manifest.json           ← Config PWA
├── css/styles.css          ← Estilos completos
├── js/
│   ├── db.js               ← IndexedDB
│   ├── license.js          ← Sistema trial + activación
│   ├── tax.js              ← Impuestos NZ (PAYE + WHT)
│   ├── app.js              ← Navegación e inicialización
│   ├── painters.js         ← Gestión de pintores
│   ├── shifts.js           ← Turnos (check-in / check-out)
│   ├── payments.js         ← Pagos y adelantos
│   ├── reports.js          ← Resúmenes + calculadora tax
│   └── export.js           ← CSV y PDF (incluye PAYE/WHT)
└── icons/
    ├── icon-192.png        ← (agregar manualmente)
    └── icon-512.png        ← (agregar manualmente)
```

## 🚀 Cómo usar

### Servidor local (para probar)
```bash
python3 -m http.server 8080
# Abrir: http://localhost:8080
```

### Hosting gratuito
- Netlify: arrastra la carpeta a netlify.com/drop
- GitHub Pages: sube el repositorio y activa Pages

## 🇳🇿 Sistema de impuestos NZ (IRD 2024-25)

### Por pintor puedes configurar:
- **Empleado → PAYE**: calcula impuesto de renta + ACC Earners' Levy (1.60%)
- **Contratista → WHT**: retención según la tasa del IR330C del contratista

### Calculadora de impuestos (tab 🇳🇿 Tax NZ):
- Calcula PAYE anualizado desde pagos semanales/quincenales/mensuales
- Calcula WHT para cualquier monto y tasa
- Muestra tabla de tramos PAYE 2024-25
- Resumen semanal por pintor con PAYE/WHT retenido

### Exportes (CSV y PDF):
- Incluyen columnas: Bruto, PAYE/WHT retenido, Neto

## 🔑 Licencias

### Para generar un código:
1. Abre `generar-licencia.html` en tu navegador
2. Escribe la referencia del cliente (ej: "JUAN")
3. Copia el código y envíaselo al cliente

### Cambiar tu número de WhatsApp:
En `js/license.js`, línea:
```javascript
const WHATSAPP = '+1234567890';  // ← cambia esto
```

## ⚠️ Notas IRD
- Tasas 2024-25. Verificar en ird.govt.nz ante cambios.
- Este es un estimador de referencia, no reemplaza asesoría contable.
- ACC Earners' Levy: 1.60% (cap $139,384 ganancias anuales).
- Contratistas deben completar formulario IR330C con su tasa WHT.
