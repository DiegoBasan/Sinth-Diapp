# MVAVE Synth Lab

Sintetizador, detector de acordes y laboratorio de armonía para el **M-VAVE SMK-25**, hecho para correr en el navegador desde GitHub Pages. Sin instalación, sin dependencias, sin servidor: Web MIDI + Web Audio puros.

**▶ Abrir la app: https://diegobasan.github.io/Sinth-Diapp/**

---

## Qué hace

### Dos instrumentos

- **Sintetizador**: el motor de síntesis sustractiva descrito abajo.
- **Piano clásico**: un Yamaha C5 muestreado, el *Salamander Grand Piano v3* de Alexander Holm
  (CC-BY 3.0). Treinta notas por capa, una cada tercera menor, en cuatro dinámicas, más el ruido
  de apagador de cada una de las 88 teclas. Incluye afinación estirada, apagadores que frenan más
  despacio en los graves, pedal de sostenido, sordina y tres ambientes de sala.
  Las muestras (unos 23 MB) se descargan solo la primera vez que entras al modo piano, y puedes
  empezar a tocar en cuanto llega la primera dinámica.

El resto de la aplicación funciona igual con cualquiera de los dos: análisis de acordes,
sugerencias, arpegio, looper, pads y caja de ritmos.

### Sintetizador
- Dos osciladores con ocho formas de onda (sierra, cuadrada, triángulo, seno, dos pulsos, órgano y cristal), unísono de hasta 7 voces con apertura estéreo, sub-oscilador y generador de ruido.
- Filtro multimodo (paso bajo, paso alto, paso banda y notch) con resonancia, envolvente propia ADSR y seguimiento de teclado.
- Envolvente de amplitud ADSR con sensibilidad a la pulsación.
- LFO con cuatro ondas, sincronización al tempo y destinos de afinación, filtro y volumen; la rueda de modulación abre su profundidad.
- Modo monofónico con portamento y legato, pitch bend con rango configurable, pedal de sustain.
- Cadena de efectos: distorsión, chorus estéreo, eco con ping-pong y sincronía al tempo, y reverberación por convolución con impulso generado al vuelo.
- Limitador a la salida para que nada reviente.

### Análisis armónico en tiempo real
- **Detección de acordes** sobre cualquier voicing o inversión: tríadas, séptimas, sextas, suspendidos, novenas, oncenas, trecenas, alterados, disminuidos, semidisminuidos y aumentados. Dice la inversión y si falta la quinta.
- **Tonalidad** estimada con los perfiles de Krumhansl–Kessler, reforzada por las fundamentales de los acordes que vas tocando. Se puede fijar a mano en el círculo de quintas.
- **Grado funcional** en números romanos, con dominantes secundarias y acordes prestados escritos como tales.
- **Escala recomendada** para improvisar sobre el acorde que suena.
- **Sugerencias de continuación** explicadas: cadencias, movimientos por quintas, sustituciones tritonales, préstamos modales, cadencias rotas. Pasa el ratón por una y verás sus notas en el piano; clic para escucharla, doble clic para añadirla a la progresión.
- **Progresión**: los acordes se van apuntando con su número romano; se pueden reproducir, copiar como texto o generar automáticamente en la tonalidad actual.
- **Círculo de quintas** con la tonalidad, el acorde que suena y los acordes ya usados.

### Piano virtual
- Teclado en pantalla que muestra en tiempo real lo que tocas, con las notas del acorde etiquetadas por su función (1, 3, 5, ♭7, 9…).
- Notas de la escala resaltadas, tónica marcada, y notas fantasma de la sugerencia que estés mirando.
- Se toca con ratón o pantalla táctil, y la altura del clic define la fuerza.
- Rango ajustable, transposición por octavas, nombres en cifrado americano o en Do-Re-Mi.

### Ritmo y secuencia
- Arpegiador con ocho modos, sincronía al tempo, hasta cuatro octavas, swing, duración de nota y retención.
- Caja de ritmos de 16 pasos con ocho instrumentos sintetizados y diez patrones de fábrica (house, trap, boom bap, rock, funk, reggaetón, techno, bossa, drum & bass).
- Looper que graba y repite lo que toques, con cuantización opcional.
- Metrónomo y tap tempo.

### Extras
- 16 presets de fábrica y un generador aleatorio de sonidos por carácter (bajo, lead, pad, pluck, teclado).
- Tus presets se guardan en el navegador y se pueden exportar o importar como JSON.
- Grabación del audio a un archivo descargable.
- Osciloscopio y analizador de espectro.
- Tema claro y oscuro.

---

## Conectar el M-VAVE SMK-25

1. Conecta el teclado por USB (o por Bluetooth con el receptor MS1) **antes** de abrir la página.
2. Abre la app en **Chrome, Edge u Opera**. Firefox y Safari todavía no traen Web MIDI.
3. Acepta el permiso de dispositivos MIDI. El SMK-25 se selecciona solo; si no, elígelo en la lista de arriba.
4. Si no aparece, cierra cualquier DAW que lo tenga tomado y recarga la página.

### Mapa de fábrica

| Control | Mensaje MIDI | Destino por defecto |
| --- | --- | --- |
| Perilla 1 | CC 21 | Frecuencia del filtro |
| Perilla 2 | CC 22 | Resonancia |
| Perilla 3 | CC 23 | Ataque de amplitud |
| Perilla 4 | CC 24 | Relajación de amplitud |
| Perilla 5 | CC 25 | Mezcla del eco |
| Perilla 6 | CC 26 | Mezcla de la reverberación |
| Perilla 7 | CC 27 | Velocidad del LFO |
| Perilla 8 | CC 28 | Volumen general |
| Pads 1–8 | Notas 36–43 | Batería |
| Rueda de modulación | CC 1 | Profundidad del LFO |
| Pedal | CC 64 | Sustain |

Cada perilla se puede reasignar a más de 45 destinos distintos. Si tu unidad manda otros números de CC (el SMK-25 es configurable desde su editor), pulsa **⟳** junto a la perilla o haz Shift + clic sobre ella y muévela: queda aprendida y se guarda en el navegador. Con los pads es igual, con Shift + clic sobre el pad en pantalla.

### Modos de los pads

- **Batería**: bombo, caja, palmas, hi-hat cerrado y abierto, dos toms y cencerro.
- **Acordes de la tonalidad**: los siete grados de la tonalidad detectada, con conducción de voces suave entre pads.
- **Sugerencias**: dispara directamente los acordes que propone el analizador.
- **Cambiar preset**: los ocho primeros sonidos de la lista.
- **Transporte**: arpegio, retener, grabar loop, reproducir, borrar, metrónomo y cambio de octava.

---

## Sin teclado MIDI

También funciona con el ratón sobre el piano y con el teclado de la computadora:

| Tecla | Acción |
| --- | --- |
| `A` `W` `S` `E` `D` `F` `T` `G` `Y` `H` `U` `J` `K` … | Tocar notas |
| `Z` / `X` | Bajar / subir una octava |
| `I` | Cambiar entre sintetizador y piano clásico |
| `C` | Sostener el acorde |
| `V` | Arpegio |
| `1`–`9` | Escuchar la sugerencia correspondiente |
| `R` | Sonido aleatorio |
| `Espacio` | Reloj on/off |
| `Esc` | Pánico: silenciar todo |

---

## Correrlo en local

No hace falta compilar nada, pero sí un servidor (los módulos ES no cargan desde `file://`):

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## Publicación

Cada push a `main` dispara el flujo de `.github/workflows/pages.yml`, que sube el repositorio entero a GitHub Pages. Para activarlo la primera vez: **Settings → Pages → Source: GitHub Actions**.

## Créditos y licencias

El código es de este repositorio. Las muestras del piano son el
[**Salamander Grand Piano v3**](https://archive.org/details/SalamanderGrandPianoV3) de
**Alexander Holm**, publicadas bajo [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/);
los MP3 incluidos vienen del proyecto [@tonejs/piano](https://github.com/tambien/Piano) de
Yotam Mann (código MIT), que recortó y codificó los originales. Los detalles están en
[`audio/piano/CREDITOS.md`](audio/piano/CREDITOS.md).

## Estructura

```
audio/piano/        Muestras del Salamander Grand Piano (CC-BY 3.0)
index.html          Estructura mínima; la interfaz se construye desde JavaScript
css/style.css       Estilos, temas claro y oscuro
js/theory.js        Notas, acordes, escalas, tonalidad, grados y sugerencias
js/engine.js        Motor de síntesis, efectos y batería (Web Audio)
js/midi.js          Web MIDI: dispositivos y parseo de mensajes
js/controller.js    Mapa del SMK-25, destinos asignables y MIDI Learn
js/arp.js           Reloj, arpegiador, secuenciador y looper
js/presets.js       Presets de fábrica y generador aleatorio
js/sampler.js       Piano clásico por muestras (Salamander Grand Piano)
js/piano.js         Teclado virtual en SVG
js/visualizer.js    Osciloscopio y espectro
js/ui.js            Perillas, círculo de quintas, avisos y modales
js/app.js           Interfaz y pegamento entre todas las piezas
```

Los módulos de teoría musical no tocan el DOM, así que se pueden probar directamente con Node:

```bash
node --input-type=module -e "
  import * as T from './js/theory.js';
  const c = T.detectChord([64, 67, 72]);
  console.log(c.label, c.description);
"
```
