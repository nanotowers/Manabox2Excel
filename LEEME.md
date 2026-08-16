# Colección Web — estructura

```
ColeccionWeb/                 <- repositorio público (GitHub Pages)
├── index.html                <- página, se edita a mano
├── publicar.bat              <- doble clic para subir cambios
├── assets/
│   ├── app.js                <- lógica: filtros, virtualización
│   ├── styles.css            <- estilos
│   ├── banner.jpg            <- cabecera
│   └── favicon.png           <- icono de pestaña
└── data/                     <- LO GENERA EL SCRIPT, no editar
    ├── meta.json             <- totales, subtipos, comandantes
    ├── cards.json            <- inventario
    └── oracle.json           <- textos de reglas
```

## Actualizar la colección

1. Escanear en Manabox y exportar el CSV
2. Generar los datos:

```
cd /d "G:\MIS DOCUMENTOS\MTG\Desarrollo\Manabox2Excel"
python manabox_to_excel.py Collection.csv --web "G:\MIS DOCUMENTOS\MTG\Desarrollo\ColeccionWeb"
```

3. Doble clic en `publicar.bat`

## Probar en local antes de publicar

Los JSON no se pueden leer abriendo el HTML con doble clic (el navegador lo
bloquea por seguridad). Hay que levantar un servidor local:

```
cd /d "G:\MIS DOCUMENTOS\MTG\Desarrollo\ColeccionWeb"
python -m http.server 8000
```

Y abrir http://localhost:8000
