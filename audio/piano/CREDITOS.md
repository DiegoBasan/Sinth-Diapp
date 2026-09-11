# Muestras del piano clásico

El instrumento **Gran cola Yamaha C5** usa el **Salamander Grand Piano v3**, un Yamaha C5 muestreado
por **Alexander Holm**.

- Fuente original: https://archive.org/details/SalamanderGrandPianoV3
- Licencia: **Creative Commons Attribution 3.0** (CC-BY 3.0) — https://creativecommons.org/licenses/by/3.0/
- Los archivos MP3 incluidos aquí proceden del proyecto
  [@tonejs/piano](https://github.com/tambien/Piano) de Yotam Mann (código bajo licencia MIT),
  que recortó y codificó las muestras originales.

## Qué se incluye

- **120 muestras de nota**: 30 notas (una cada tercera menor, de A0 a C8) en cuatro
  capas de dinámica — `v3` (pianissimo), `v7` (mezzopiano), `v11` (mezzoforte) y `v15` (fortissimo).
- **88 muestras de soltado** (`rel1`–`rel88`): el ruido del macillo y el apagador al
  levantar cada tecla, una por cada tecla del piano.

Las notas que no están muestreadas se obtienen desplazando la afinación de la muestra
más cercana, que nunca queda a más de un semitono de distancia.

Si reutilizas estas muestras, mantén la atribución a Alexander Holm.

## Calidad

El selector de calidad de la aplicación decide cuántas capas se descargan de verdad:

| Calidad | Capas | Descarga | Memoria descodificada |
| --- | --- | --- | --- |
| Alta | v3, v7, v11, v15 | 23 MB | ~560 MB |
| Media | v7, v15 | 12 MB | ~290 MB |
| Ligera | v11 | 7 MB | ~150 MB |

Se elige sola según la memoria y el tamaño de pantalla del equipo, y se puede cambiar a mano.
