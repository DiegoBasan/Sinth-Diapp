# Cuerdas del soundfont FluidR3 GM

Los diez instrumentos de esta carpeta proceden del soundfont **FluidR3 GM**, empaquetado
como archivos MP3 por **Benjamin Gleitzman** en
[midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts).

- Licencia del empaquetado: **MIT**
- Cada instrumento trae las **88 teclas muestreadas una por una**, así que ninguna nota
  se reproduce desplazando la afinación de otra.

## Secciones y solos

| Carpeta | En la aplicación | Sostiene |
| --- | --- | --- |
| `string_ensemble_1` | Cuerdas de orquesta | sí |
| `string_ensemble_2` | Cuerdas cálidas | sí |
| `synth_strings_1` | Cuerdas sintéticas | sí |
| `tremolo_strings` | Cuerdas en trémolo | sí |
| `violin` | Violín | sí |
| `viola` | Viola | sí |
| `cello` | Violonchelo | sí |
| `contrabass` | Contrabajo | sí |
| `pizzicato_strings` | Pizzicato | no |
| `orchestral_harp` | Arpa | no |

## Por qué hacen falta bucles

Estas muestras duran 3,13 segundos y terminan **a pleno volumen**, sin decaer. Si se
reprodujeran tal cual, cualquier acorde sostenido se cortaría de golpe a los tres segundos.

La aplicación construye un bucle al descodificar cada muestra: toma la región que va del
45 % del archivo hasta casi el final y funde sus últimos 140 ms con los 140 ms que preceden
al punto de retorno, con un fundido de potencia constante. Así, al saltar al principio del
bucle la onda ya coincide con la que sigue y no se oye ningún clic. Medido sobre la nota C4
de las cuerdas de orquesta, el salto del bucle es 0,41 veces el paso normal entre dos
muestras vecinas: menos que el movimiento natural de la onda.

Las muestras que sí decaen solas, el pizzicato y el arpa, no llevan bucle.
