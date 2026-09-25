// =====================================================================
// Web Components propios. Se usan como etiquetas HTML normales:
//
//   <count-down to="2026-12-01T18:00:00Z" size="lg"></count-down>
//   <count-up value="1234"></count-up>
//   <lite-youtube videoid="dQw4w9WgXcQ"></lite-youtube>
//   <image-drop for="campoUrl" folder="juegos"></image-drop>
// =====================================================================
import { html, render } from './html.js';
import { reducedMotion } from './dom.js';
import * as fmt from './format.js';

// ---------- <count-down> ----------
// Dispara el evento "end" cuando llega a cero. Se pausa sola si sale de la página.
class CountDown extends HTMLElement {
  static observedAttributes = ['to'];
  #timer = 0;

  connectedCallback() {
    this.classList.add('countdown');
    if (this.getAttribute('size') === 'lg') this.classList.add('countdown-lg');
    this.setAttribute('role', 'timer');
    this.#start();
  }
  disconnectedCallback() { clearInterval(this.#timer); }
  attributeChangedCallback() { if (this.isConnected) this.#start(); }

  #start() {
    clearInterval(this.#timer);
    const target = new Date(this.getAttribute('to')).getTime();
    if (Number.isNaN(target)) return;
    this.setAttribute('aria-label', `Falta hasta el ${fmt.dateTime(target)}`);
    const tick = () => {
      const left = Math.max(0, target - Date.now());
      const parts = [
        [Math.floor(left / 86400000), 'días', 'día'],
        [Math.floor(left / 3600000) % 24, 'horas', 'hora'],
        [Math.floor(left / 60000) % 60, 'min', 'min'],
        [Math.floor(left / 1000) % 60, 'seg', 'seg'],
      ];
      render(this, parts.map(([v, many, one], i) => html`
        <div class="cd-box"><b>${i ? String(v).padStart(2, '0') : v}</b><span>${v === 1 ? one : many}</span></div>`));
      if (left === 0) {
        clearInterval(this.#timer);
        this.dispatchEvent(new CustomEvent('end', { bubbles: true }));
      }
    };
    tick();
    // Se sincroniza con el cambio de segundo para que todos los contadores avancen juntos
    setTimeout(() => { tick(); this.#timer = setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
  }
}

// ---------- <count-up> ----------
// Cuenta desde 0 hasta "value" cuando aparece en pantalla.
class CountUp extends HTMLElement {
  static observedAttributes = ['value'];
  #shown = 0;
  #visible = false;
  #io;

  connectedCallback() {
    this.textContent ||= '–';
    this.#io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      this.#visible = true;
      this.#io.disconnect();
      this.#run();
    });
    this.#io.observe(this);
  }
  disconnectedCallback() { this.#io?.disconnect(); }
  attributeChangedCallback() { if (this.#visible) this.#run(); }

  #run() {
    const target = Number(this.getAttribute('value'));
    if (!this.hasAttribute('value') || Number.isNaN(target)) return;
    const from = this.#shown;
    if (reducedMotion() || target === from) { this.#shown = target; this.textContent = fmt.number(target); return; }
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 1400);
      this.#shown = Math.round(from + (target - from) * (1 - (1 - k) ** 4));
      this.textContent = fmt.number(this.#shown);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ---------- <lite-youtube> ----------
// Muestra la miniatura del video y recién carga el reproductor de YouTube al tocar "play".
// La página carga mucho más rápido que con el iframe desde el principio.
class LiteYoutube extends HTMLElement {
  connectedCallback() {
    const id = this.getAttribute('videoid');
    if (!/^[\w-]{11}$/.test(id ?? '')) return;
    this.classList.add('video');
    render(this, html`
      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
      <button type="button" class="yt-play" aria-label="Reproducir video"><svg viewBox="0 0 68 48" aria-hidden="true"><path d="M66.5 7.7A8.5 8.5 0 0 0 60.5 1.7C55.2.3 34 .3 34 .3S12.8.3 7.5 1.7a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6c5.3 1.4 26.5 1.4 26.5 1.4s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z"/><path d="M45 24 27 14v20" fill="#fff"/></svg></button>`);
    this.querySelector('button').addEventListener('click', () => {
      render(this, html`<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" title="Video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`);
    }, { once: true });
    // Precalienta la conexión a YouTube cuando el mouse se acerca
    this.addEventListener('pointerenter', () => {
      if (document.querySelector('link[href="https://www.youtube-nocookie.com"]')) return;
      document.head.append(Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://www.youtube-nocookie.com' }));
    }, { once: true });
  }
}

// ---------- <image-drop> ----------
// Zona para arrastrar, pegar (Ctrl+V) o elegir imágenes. Las comprime y las sube.
// Necesita que le asignen la función de subida:  el.uploader = (file) => Promise<url>
// Con for="idDelCampo" completa ese campo con la URL; si no, dispara el evento "uploaded".
class ImageDrop extends HTMLElement {
  uploader = null;

  connectedCallback() {
    const multiple = this.hasAttribute('multiple');
    this.tabIndex = 0;
    this.setAttribute('role', 'button');
    this.setAttribute('aria-label', 'Subir imagen: arrastrá, pegá o elegí un archivo');
    render(this, html`
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ${multiple ? html`multiple` : ''} hidden>
      <span class="drop-preview" aria-hidden="true"></span>
      <span class="drop-text"><b>Soltá ${multiple ? 'imágenes' : 'una imagen'} acá</b><small>o hacé clic · también podés pegar con Ctrl+V · se comprime sola</small></span>`);
    const input = this.querySelector('input');
    this.addEventListener('click', () => input.click());
    this.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { this.#handle([...input.files]); input.value = ''; });
    this.addEventListener('dragenter', (e) => { e.preventDefault(); this.classList.add('over'); });
    this.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    this.addEventListener('dragleave', (e) => { if (!this.contains(e.relatedTarget)) this.classList.remove('over'); });
    this.addEventListener('drop', (e) => { e.preventDefault(); this.classList.remove('over'); this.#handle([...e.dataTransfer.files]); });
    this.addEventListener('paste', (e) => this.#handle([...e.clipboardData.files]));
    this.#preview(document.getElementById(this.getAttribute('for'))?.value);
    document.getElementById(this.getAttribute('for'))?.addEventListener('input', (e) => this.#preview(e.target.value));
  }

  #preview(url) {
    const box = this.querySelector('.drop-preview');
    if (box) box.style.backgroundImage = /^https:\/\//.test(url ?? '') ? `url("${encodeURI(url)}")` : '';
    this.classList.toggle('has-image', /^https:\/\//.test(url ?? ''));
  }

  async #handle(files) {
    files = files.filter((f) => f.type.startsWith('image/'));
    if (!files.length || !this.uploader || this.classList.contains('busy')) return;
    if (!this.hasAttribute('multiple')) files = files.slice(0, 1);
    this.classList.add('busy');
    const text = this.querySelector('.drop-text b');
    const urls = [];
    try {
      for (const [i, f] of files.entries()) {
        text.textContent = files.length > 1 ? `Subiendo ${i + 1} de ${files.length}...` : 'Subiendo...';
        urls.push(await this.uploader(f));
      }
      const field = document.getElementById(this.getAttribute('for'));
      if (field) { field.value = urls[0]; field.dispatchEvent(new Event('input', { bubbles: true })); }
      this.dispatchEvent(new CustomEvent('uploaded', { detail: { urls }, bubbles: true }));
    } catch (err) {
      this.dispatchEvent(new CustomEvent('uploaderror', { detail: err, bubbles: true }));
    } finally {
      this.classList.remove('busy');
      text.textContent = this.hasAttribute('multiple') ? 'Soltá imágenes acá' : 'Soltá una imagen acá';
    }
  }
}

const define = (name, cls) => customElements.get(name) || customElements.define(name, cls);
define('count-down', CountDown);
define('count-up', CountUp);
define('lite-youtube', LiteYoutube);
define('image-drop', ImageDrop);
