// ---------------------------------------------------------------------------
// midi.js — acceso Web MIDI, selección de dispositivo y parseo de mensajes.
// ---------------------------------------------------------------------------
export class MidiManager extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.input = null;
    this.inputs = [];
    this.supported = !!navigator.requestMIDIAccess;
    this.preferred = /smk|m-?vave|mvave|cuvave/i;
    this.log = [];
  }

  async init() {
    if (!this.supported) {
      this.emit('status', { state: 'unsupported', message: 'Este navegador no soporta Web MIDI. Usa Chrome, Edge u Opera.' });
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.emit('status', { state: 'denied', message: 'Permiso MIDI denegado: ' + e.message });
      return false;
    }
    this.access.onstatechange = () => this.refresh(true);
    this.refresh(true);
    return true;
  }

  refresh(autoSelect = false) {
    if (!this.access) return;
    this.inputs = [...this.access.inputs.values()];
    this.emit('devices', { inputs: this.inputs });
    if (this.input && !this.inputs.find((i) => i.id === this.input.id)) {
      this.select(null);
    }
    if (autoSelect && !this.input && this.inputs.length) {
      const fav = this.inputs.find((i) => this.preferred.test(i.name || '')) || this.inputs[0];
      this.select(fav.id);
    }
  }

  select(id) {
    if (this.input) {
      this.input.onmidimessage = null;
    }
    this.input = this.inputs.find((i) => i.id === id) || null;
    if (this.input) {
      this.input.onmidimessage = (e) => this.handle(e.data, e.timeStamp);
      const isSmk = this.preferred.test(this.input.name || '');
      this.emit('status', { state: 'connected', message: `Conectado: ${this.input.name}${isSmk ? ' ✓ SMK-25 detectado' : ''}`, name: this.input.name, isSmk });
    } else {
      this.emit('status', { state: 'disconnected', message: this.inputs.length ? 'Selecciona un dispositivo MIDI' : 'No hay dispositivos MIDI. Conecta el SMK-25 por USB.' });
    }
    this.emit('devices', { inputs: this.inputs });
  }

  simulate(bytes) { this.handle(Uint8Array.from(bytes), performance.now()); }

  handle(data, timeStamp) {
    if (!data || !data.length) return;
    const status = data[0];
    if (status >= 0xf8) return; // reloj / active sensing
    const cmd = status & 0xf0;
    const channel = status & 0x0f;
    const d1 = data[1] || 0;
    const d2 = data[2] || 0;
    this.pushLog(data, timeStamp);
    switch (cmd) {
      case 0x90:
        if (d2 === 0) this.emit('note', { note: d1, velocity: 0, on: false, channel });
        else this.emit('note', { note: d1, velocity: d2, on: true, channel });
        break;
      case 0x80:
        this.emit('note', { note: d1, velocity: d2, on: false, channel });
        break;
      case 0xb0:
        this.emit('cc', { cc: d1, value: d2, channel });
        break;
      case 0xe0:
        this.emit('bend', { value: ((d2 << 7) | d1) / 8192 - 1, channel });
        break;
      case 0xd0:
        this.emit('aftertouch', { value: d1 / 127, channel });
        break;
      case 0xa0:
        this.emit('polyaftertouch', { note: d1, value: d2 / 127, channel });
        break;
      case 0xc0:
        this.emit('program', { program: d1, channel });
        break;
      default:
        break;
    }
  }

  pushLog(data, timeStamp) {
    const entry = { bytes: [...data], time: timeStamp, text: describe(data) };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.emit('raw', entry);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

export function describe(data) {
  const status = data[0];
  const cmd = status & 0xf0;
  const ch = (status & 0x0f) + 1;
  const hex = [...data].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  let text = '';
  switch (cmd) {
    case 0x90: text = data[2] ? `Note On  ${data[1]} vel ${data[2]}` : `Note Off ${data[1]}`; break;
    case 0x80: text = `Note Off ${data[1]}`; break;
    case 0xb0: text = `CC ${data[1]} = ${data[2]}`; break;
    case 0xe0: text = `Pitch Bend ${((data[2] << 7) | data[1]) - 8192}`; break;
    case 0xd0: text = `Aftertouch ${data[1]}`; break;
    case 0xa0: text = `Poly AT ${data[1]} = ${data[2]}`; break;
    case 0xc0: text = `Program ${data[1]}`; break;
    default: text = 'Mensaje'; break;
  }
  return `ch${ch}  ${text}  [${hex}]`;
}
