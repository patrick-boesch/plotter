import { makeDarkness, createSVG } from './path.js';

const $ = id => document.getElementById(id);
const ids = ['black', 'white', 'gamma', 'invert', 'density', 'looseness', 'detail', 'width', 'pen', 'margin'];
const defaults = { black: 25, white: 220, gamma: 1.1, invert: false, density: 1, looseness: 1, detail: 420, width: 180, pen: 0.35, margin: 10 };
const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
let source = null, sourceName = 'Lichtstudie (Demo)', grid = null, result = null;
let worker = null, timeout = null, debounce = null, loadVersion = 0;
let view = 'path', seed = 13, zoom = 1;
const canvas = $('preview'), ctx = canvas.getContext('2d');

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function parameters() {
  for (const id of ids) if (!$(id).checkValidity()) throw new Error(`Bitte einen gültigen Wert für ${$(id).labels?.[0]?.textContent.trim() || id} eingeben.`);
  const values = Object.fromEntries(ids.map(id => [id, id === 'invert' ? $(id).checked : Number($(id).value)]));
  if (values.black >= values.white) throw new Error('Der Schwarzpunkt muss unter dem Weißpunkt liegen.');
  return values;
}

function updateLabels() {
  for (const id of ['black', 'white', 'gamma', 'density', 'looseness']) {
    const value = Number($(id).value);
    $(`${id}-value`).value = id === 'density' ? `${Math.round(value * 100)} %` : id === 'gamma' || id === 'looseness' ? value.toFixed(2).replace('.', ',') : String(value);
  }
}

function stop() {
  clearTimeout(debounce); clearTimeout(timeout);
  worker?.terminate(); worker = null;
  $('progress').hidden = true; $('cancel').hidden = true;
  $('generate').disabled = !source;
}

function invalidate() {
  stop(); result = null; $('export').disabled = true;
  $('length').textContent = '—'; $('points').textContent = '—';
  $('path-badge').textContent = 'VORSCHAU WIRD AKTUALISIERT';
  // Remove the last drawing immediately, including when a number input is
  // temporarily empty or invalid and no replacement can yet be generated.
  if (view === 'path') { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

function prepare(p) {
  const factor = p.detail / Math.max(source.naturalWidth, source.naturalHeight);
  const width = Math.max(2, Math.round(source.naturalWidth * factor));
  const height = Math.max(2, Math.round(source.naturalHeight * factor));
  const offscreen = document.createElement('canvas');
  offscreen.width = width; offscreen.height = height;
  const context = offscreen.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);
  const field = makeDarkness(context.getImageData(0, 0, width, height).data, p);
  const tones = context.createImageData(width, height);
  for (let i = 0; i < field.length; i++) {
    tones.data[i * 4] = tones.data[i * 4 + 1] = tones.data[i * 4 + 2] = Math.round((1 - field[i]) * 255);
    tones.data[i * 4 + 3] = 255;
  }
  context.putImageData(tones, 0, 0);
  grid = { width, height, field, tones: offscreen, p };
}

function schedule() {
  updateLabels(); invalidate();
  if (!source) return;
  try { prepare(parameters()); render(); status('Änderungen werden berechnet …'); }
  catch (error) { status(error.message, true); $('path-badge').textContent = 'EINSTELLUNGEN PRÜFEN'; return; }
  debounce = setTimeout(generate, 280);
}

function generate() {
  stop();
  if (!source) return;
  invalidate();
  try {
    const p = parameters(); prepare(p); render();
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const current = worker;
    $('generate').disabled = true; $('cancel').hidden = false;
    $('progress').hidden = false; $('progress').value = 0;
    status('Die Linie findet ihren Weg …');
    const fail = message => { stop(); status(message, true); $('path-badge').textContent = 'KEIN AKTUELLER PFAD'; };
    timeout = setTimeout(() => fail('Berechnung nach 45 Sekunden abgebrochen. Bitte Detailgrad oder Liniendichte reduzieren.'), 45000);
    current.onerror = () => fail('Berechnung konnte nicht gestartet werden. Bitte über „npm start“ öffnen und neu versuchen.');
    current.onmessage = ({ data }) => {
      if (worker !== current) return;
      if (data.type === 'progress') { $('progress').value = data.progress; return; }
      if (data.type === 'error') { fail(data.message); return; }
      stop();
      if (!data.points.length) {
        status('Das Bild ist mit diesen Schwellenwerten vollständig weiß. Weißpunkt erhöhen oder Tonwerte invertieren.');
        $('path-badge').textContent = 'KEINE DUNKLEN BEREICHE'; render(); return;
      }
      result = { ...data, gridWidth: grid.width, gridHeight: grid.height, widthMM: p.width, marginMM: p.margin, penMM: p.pen };
      $('export').disabled = false;
      $('length').textContent = `${number.format(data.length * p.width / (grid.width - 1) / 1000)} m`;
      $('points').textContent = new Intl.NumberFormat('de-DE').format(data.points.length / 2);
      $('path-badge').textContent = '1 DURCHGEHENDER PFAD';
      status(data.capped ? 'Pfad fertig · Detailgrenze erreicht. Für mehr Deckung Motivbreite oder Dichte reduzieren.' : 'Bereit zum Plotten. Ein Pfad, von Anfang bis Ende.');
      render();
    };
    current.postMessage({ field: grid.field, width: grid.width, height: grid.height, options: {
      density: p.density, looseness: p.looseness, seed, penPixels: p.pen / p.width * (grid.width - 1),
    } });
  } catch (error) { stop(); status(error.message, true); }
}

function render() {
  if (!grid) return;
  const { width, height, p } = grid;
  const mmScale = p.width / (width - 1);
  const imageHeight = (height - 1) * mmScale;
  const pageWidth = p.width + p.margin * 2, pageHeight = imageHeight + p.margin * 2;
  $('dimensions').textContent = `${number.format(pageWidth)} × ${number.format(pageHeight)} mm`;
  const stage = $('stage');
  const availableWidth = Math.max(160, stage.clientWidth - 64);
  const availableHeight = Math.max(240, stage.clientHeight - 64);
  const fit = Math.min(availableWidth / pageWidth, availableHeight / pageHeight);
  const displayWidth = pageWidth * fit * zoom, displayHeight = pageHeight * fit * zoom;
  $('paper').style.width = `${displayWidth}px`; $('paper').style.height = `${displayHeight}px`;
  const resolution = Math.min(window.devicePixelRatio || 1, 2400 / Math.max(displayWidth, displayHeight));
  canvas.width = Math.max(1, Math.round(displayWidth * resolution));
  canvas.height = Math.max(1, Math.round(displayHeight * resolution));
  ctx.setTransform(canvas.width / pageWidth, 0, 0, canvas.height / pageHeight, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pageWidth, pageHeight);
  if (view === 'original') ctx.drawImage(source, p.margin, p.margin, p.width, imageHeight);
  else if (view === 'tones') ctx.drawImage(grid.tones, p.margin, p.margin, p.width, imageHeight);
  else if (result) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = p.pen; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < result.points.length; i += 2) {
      const x = p.margin + result.points[i] * mmScale, y = p.margin + result.points[i + 1] * mmScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  $('fit').textContent = `${Math.round(zoom * 100)} %`;
}

async function loadImage(url, name) {
  const version = ++loadVersion;
  invalidate(); $('generate').disabled = true;
  status('Bild wird geladen …');
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (version !== loadVersion) return;
    if (image.naturalWidth < 2 || image.naturalHeight < 2) throw new Error('Das Bild muss mindestens 2 × 2 Pixel groß sein.');
    if (Math.max(image.naturalWidth / image.naturalHeight, image.naturalHeight / image.naturalWidth) > 20) throw new Error('Bitte ein Bild mit einem Seitenverhältnis zwischen 1:20 und 20:1 verwenden.');
    source = image; sourceName = name; zoom = 1;
    $('thumb').src = url; $('filename').textContent = name;
    $('source-size').textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    generate();
  } catch (error) {
    if (version === loadVersion) {
      $('generate').disabled = !source;
      $('path-badge').textContent = 'BILD NICHT GELADEN';
      status(error.name === 'EncodingError' ? 'Dieses Bildformat konnte nicht gelesen werden. Bitte JPG, PNG oder WebP verwenden.' : error.message, true);
    }
  } finally {
    if (url.startsWith('blob:')) {
      // The full image and thumbnail have already been decoded before revoking.
      if ($('thumb').src === url) await $('thumb').decode().catch(() => {});
      URL.revokeObjectURL(url);
    }
  }
}

function importFile(file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) { status('Bitte ein Bild bis 30 MB auswählen.', true); return; }
  loadImage(URL.createObjectURL(file), file.name);
}

function loadDemo() {
  // A procedural light study, independent of any uploaded photograph.
  const demo = document.createElement('canvas'); demo.width = 420; demo.height = 480;
  const draw = demo.getContext('2d');
  draw.fillStyle = '#fff'; draw.fillRect(0, 0, 420, 480);
  const shadow = draw.createRadialGradient(226, 378, 5, 226, 378, 150);
  shadow.addColorStop(0, '#444'); shadow.addColorStop(0.5, '#c0c0c0'); shadow.addColorStop(1, '#fff');
  draw.save(); draw.translate(0, 255); draw.scale(1, 0.33);
  draw.fillStyle = shadow; draw.fillRect(50, 200, 340, 340); draw.restore();
  const sphere = draw.createRadialGradient(156, 168, 4, 210, 238, 147);
  sphere.addColorStop(0, '#fff'); sphere.addColorStop(0.32, '#e0e0e0'); sphere.addColorStop(0.72, '#777'); sphere.addColorStop(1, '#171717');
  draw.fillStyle = sphere; draw.beginPath(); draw.arc(210, 238, 140, 0, Math.PI * 2); draw.fill();
  loadImage(demo.toDataURL('image/png'), 'Lichtstudie (Demo)');
}

for (const id of ids) {
  // Number inputs must not treat an empty intermediate value as zero.
  if ($(id).type === 'number') $(id).required = true;
  $(id).addEventListener('input', () => {
    if (id === 'black' && +$('black').value >= +$('white').value) $('white').value = +$('black').value + 1;
    if (id === 'white' && +$('white').value <= +$('black').value) $('black').value = +$('white').value - 1;
    schedule();
  });
}
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  const presets = { portrait: [25, 220, 1.1], contrast: [65, 195, 1.35], threshold: [127, 128, 1] };
  ['black', 'white', 'gamma'].forEach((id, i) => { $(id).value = presets[button.dataset.preset][i]; });
  schedule();
}));
$('reset').addEventListener('click', () => {
  for (const [id, value] of Object.entries(defaults)) {
    if (id === 'invert') $(id).checked = value; else $(id).value = value;
  }
  seed = 13; schedule();
});
$('shuffle').addEventListener('click', () => { seed++; schedule(); });
$('generate').addEventListener('click', generate);
$('cancel').addEventListener('click', () => { stop(); status('Berechnung abgebrochen. Mit „Pfad neu berechnen“ fortsetzen.'); $('path-badge').textContent = 'ABGEBROCHEN'; });
$('file').addEventListener('change', event => { importFile(event.target.files[0]); event.target.value = ''; });
$('example').addEventListener('click', loadDemo);
const dropzone = $('dropzone');
for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', e => importFile(e.dataTransfer.files[0]));
// Prevent a missed drop from replacing the application with the source image.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(other => {
    other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button));
  });
  render();
}));
$('zoom-in').addEventListener('click', () => { zoom = Math.min(4, zoom + 0.25); render(); });
$('zoom-out').addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.25); render(); });
$('fit').addEventListener('click', () => { zoom = 1; render(); });
let resizeFrame;
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(render); }).observe($('stage'));
$('export').addEventListener('click', () => {
  if (!result) return;
  const blob = new Blob([createSVG(result.points, result)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  const stem = sourceName.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'bild';
  link.href = url; link.download = `${stem}-one-line.svg`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateLabels();
loadDemo();
