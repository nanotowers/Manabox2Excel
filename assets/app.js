/* ============================================================================
   Navegador de colección MTG — frontend estático
   ----------------------------------------------------------------------------
   Carga en tres tiempos para que la página sea usable en menos de un segundo:
     1. meta.json    → cabecera, estadísticas y todos los desplegables llenos
     2. cards.json   → el inventario; a partir de aquí funcionan los filtros
     3. oracle.json  → en segundo plano; habilita la búsqueda por texto
   El listado se virtualiza: solo existen en el DOM las filas visibles, así que
   da igual que el resultado sean 20 cartas o 14.000.
   ========================================================================== */

const $ = id => document.getElementById(id);
const val = id => { const e = $(id); return e ? e.value : ""; };
const RAR_ORDEN = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
const RAR_COLOR = { common: "#aaa", uncommon: "#8ab4f8", rare: "#ffd700",
                    mythic: "#ff8c00", special: "#9b59b6", bonus: "#3498db" };

let META = null, CARDS = [], ORACLE = null, ORACLE_LISTO = false;
let filtradas = [], picked = new Set();
let vista = "grid", colors = new Set(), cmode = "subset";
let ccount = "todos", onlyFoil = false;

/* ── Carga ───────────────────────────────────────────────────────────────── */

function progreso(pct, texto) {
  $("loader-fill").style.width = pct + "%";
  if (texto) $("loader-txt").textContent = texto;
}

async function traer(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function iniciar() {
  try {
    progreso(15, "Cargando información de la colección...");
    META = await traer("data/meta.json");
    pintarCabecera();

    progreso(45, "Cargando cartas...");
    const doc = await traer("data/cards.json");
    if (doc.schema_version !== META.schema_version) {
      console.warn("Versiones distintas entre meta.json y cards.json:",
                   META.schema_version, doc.schema_version);
    }
    CARDS = expandir(doc);

    progreso(100, "Listo");
    $("loader").hidden = true;
    $("app").hidden = false;
    prepararControles();
    render();

    // Tercer tiempo: los textos de reglas, sin bloquear nada
    // El enlace a los mazos solo aparece si de verdad hay mazos exportados
    fetch("data/mazos.json", { method: "HEAD" })
      .then(r => { if (r.ok) $("nav-mazos").hidden = false; })
      .catch(() => {});
    fetch("data/buscadas.json", { method: "HEAD" })
      .then(r => { if (r.ok) { $("nav-mazos").hidden = false;
                               $("link-buscadas").hidden = false; } })
      .catch(() => {});

    traer("data/oracle.json").then(d => {
      ORACLE = d.oracle || {};
      ORACLE_LISTO = true;
      $("f-text").placeholder = "sacrifice, Sol Ring, draw a card...";
    }).catch(() => {
      $("f-text").placeholder = "Buscar por nombre (textos no disponibles)";
    });

  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>No se pudieron cargar los datos.</b><br>${e.message}<br><br>
      Si abriste este archivo con doble clic desde tu disco, el navegador bloquea
      la lectura de los JSON por seguridad. Esta página necesita estar publicada
      en un servidor (GitHub Pages) o servida en local con
      <code>python -m http.server</code>.</div>`;
  }
}

/* Un índice suelto o una lista de índices: aceptamos ambos. Así una versión
   nueva del frontend no revienta con datos generados por un script viejo. */
function lista(v, dicc, sub) {
  const arr = Array.isArray(v) ? v : (v === undefined || v === null || v === -1 ? [] : [v]);
  return arr.map(k => {
    const e = dicc[k];
    if (e === undefined) return "";
    return sub ? (Array.isArray(e) ? e[0] : e) : e;
  }).filter(Boolean);
}

/* Reconstruye los objetos a partir del formato columnar */
function expandir(doc) {
  const { rows, overrides } = doc;
  const tl = META.typelines, sets = META.sets, subs = META.subtipos;
  const bind = META.binders, cond = META.condiciones, lang = META.idiomas;
  const tipos = META.tipos, rar = META.rarezas;

  return rows.map((r, i) => ({
    _i: i,
    id: r[0], n: r[1],
    tl: tl[r[2]] || "",
    mc: r[3],
    c: r[4] === null ? "" : r[4],
    r: rar[r[5]] || "",
    s: sets[r[6]] ? sets[r[6]][0] : "",
    sn: sets[r[6]] ? sets[r[6]][1] : "",
    cn: r[7], ci: r[8], co: r[9],
    f: r[10], q: r[11],
    b:  lista(r[12], bind, true),
    cd: lista(r[13], cond),
    lg: lista(r[14], lang),
    sb: lista(r[15], subs, true),
    t:  tipos[r[16]] || "Other",
    pt: r[17],
    ov: overrides[String(i)] || ""
  }));
}

/* ── Símbolos de maná ─────────────────────────────────────────────────────
   Convierte "{4}{U}{U}" en los símbolos redondos de verdad. Los SVG están en
   assets/simbolos/ y el mapa símbolo→archivo viene en meta.json. Si falta
   alguno, se deja el texto original: nunca se pierde información. */
const RE_SIMBOLO = /\{[^}]+\}/g;

function mana(txt, escapar) {
  if (!txt) return "";
  const base = escapar ? esc(txt) : txt;
  if (!META || !META.simbolos) return base;
  return base.replace(RE_SIMBOLO, s => {
    const archivo = META.simbolos[s];
    if (!archivo) return s;
    // Las dimensiones van también en el atributo y en línea: si el CSS no
    // cargara, un SVG sin tamaño intrínseco se dibujaría a 300x150 px
    return `<img class="ms" src="assets/simbolos/${archivo}" alt="${s}" ` +
           `width="16" height="16" style="width:1em;height:1em;` +
           `vertical-align:-.14em;display:inline-block" loading="lazy">`;
  });
}

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* URL de imagen: se deriva del UUID salvo que el generador dejara override */
function img(c, tam) {
  if (c.ov) return c.ov.replace("/normal/", "/" + tam + "/");
  if (!c.id || c.id.length < 2) return "";
  return `${META.img_base}${tam}/front/${c.id[0]}/${c.id[1]}/${c.id}.jpg`;
}

function srcset(c) {
  if (!c.id && !c.ov) return "";
  return `${img(c,"small")} 146w, ${img(c,"normal")} 488w, ${img(c,"large")} 672w`;
}

/* ── Cabecera y controles ────────────────────────────────────────────────── */

function pintarCabecera() {
  document.title = META.titulo + " — Colección MTG";
  $("titulo").textContent = META.titulo;
  $("subtitulo").textContent = META.subtitulo;
  if (META.banner) {
    const h = $("hero");
    h.src = META.banner; h.alt = META.titulo; h.hidden = false;
    $("titulo").hidden = true;
  }
  const t = META.totales;
  $("stats").innerHTML = [
    [t.distintas, "Cartas distintas"], [t.copias, "Copias totales"],
    [t.sets, "Ediciones"], [t.foils, "Foils"], [t.comandantes, "Comandantes"]
  ].map(([v, l]) => `<div class="stat"><b>${v.toLocaleString("es")}</b><span>${l}</span></div>`).join("");
  $("pie").textContent = "Actualizada el " +
    new Date(META.generated_at).toLocaleDateString("es", { day:"numeric", month:"long", year:"numeric" });
}

function opciones(sel, items, placeholder) {
  const e = $(sel);
  e.innerHTML = `<option value="">${placeholder}</option>` +
    items.map(([v, txt]) => `<option value="${v}">${txt}</option>`).join("");
}

function prepararControles() {
  opciones("f-tipo", META.tipos.map(t => [t, t]), "Todos");
  opciones("f-sub", META.subtipos.slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([s, n]) => [s, `${s} (${n})`]), `Todos (${META.subtipos.length})`);
  opciones("f-set", META.sets.slice()
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c, nm, n]) => [c, `${c} (${n})`]), "Todas");

  if (META.binders.length) {
    $("g-binder").hidden = false;
    opciones("f-binder", META.binders.map(([b, n]) => [b, `${b} (${n})`]), "Todas");
  }
  if (META.condiciones.length) {
    $("g-cond").hidden = false;
    opciones("f-cond", META.condiciones.map(c => [c, c]), "Todas");
  }
  if (META.idiomas.length) {
    $("g-lang").hidden = false;
    opciones("f-lang", META.idiomas.map(l => [l, l]), "Todos");
  }

  // Los pips del filtro pasan a ser los símbolos reales de Scryfall.
  // Si algún símbolo faltara, se queda la letra de siempre.
  document.querySelectorAll(".pip").forEach(p => {
    const archivo = META.simbolos && META.simbolos["{" + p.dataset.c + "}"];
    if (!archivo) return;
    p.classList.add("svg");
    p.innerHTML = `<img src="assets/simbolos/${archivo}" alt="${p.dataset.c}" ` +
                  `width="32" height="32" style="width:100%;height:100%;display:block">`;
  });

  const cmds = Object.keys(META.comandantes);
  $("cmd-list").innerHTML = cmds.map(n => `<option value="${n}">`).join("");
  $("cmd-status").textContent = `${cmds.length} comandantes detectados en esta colección`;
  eventos();
}

/* ── Filtrado ────────────────────────────────────────────────────────────── */

/* subset = la identidad de la carta cabe dentro de la marcada. Es la regla real
   de Commander: legal si su identidad es subconjunto de la del comandante. */
function colorOK(c) {
  const arr = (c.ci || "").split("").filter(Boolean), n = arr.length;
  if (ccount === "mono" && n !== 1) return false;
  if (ccount === "multi" && n < 2) return false;
  if (ccount === "incoloro" && n !== 0) return false;
  if (!colors.size) return true;

  const sel = [...colors], conC = sel.includes("C"), cols = sel.filter(x => x !== "C");
  if (cmode === "subset") return arr.every(x => cols.includes(x));
  if (cmode === "any") return (conC && n === 0) || cols.some(x => arr.includes(x));
  if (cmode === "all") return cols.length ? cols.every(x => arr.includes(x)) : (conC ? n === 0 : true);
  if (!cols.length) return n === 0;
  return n === cols.length && cols.every(x => arr.includes(x));
}

function aplicar() {
  const q = val("f-text").toLowerCase().trim();
  const tipo = val("f-tipo");
  const sub = (val("f-sub") || val("f-subtxt").trim()).toLowerCase();
  const rar = val("f-rar"), set = val("f-set");
  const bind = val("f-binder"), cond = val("f-cond"), lang = val("f-lang");
  const cmin = val("f-cmin") === "" ? -1 : +val("f-cmin");
  const cmax = val("f-cmax") === "" ? 99 : +val("f-cmax");

  return CARDS.filter(c => {
    if (q) {
      const enNombre = c.n.toLowerCase().includes(q);
      const enTexto = ORACLE_LISTO && (ORACLE[c.n] || "").toLowerCase().includes(q);
      if (!enNombre && !enTexto) return false;
    }
    if (tipo && c.t !== tipo) return false;
    if (sub && !c.sb.some(s => s.toLowerCase().includes(sub))) return false;
    if (rar && c.r !== rar) return false;
    if (set && c.s !== set) return false;
    if (bind && !c.b.includes(bind)) return false;
    if (cond && !c.cd.includes(cond)) return false;
    if (lang && !c.lg.includes(lang)) return false;
    if (onlyFoil && !c.f) return false;
    if (c.c !== "" && (c.c < cmin || c.c > cmax)) return false;
    return colorOK(c);
  });
}

const SORTS = {
  name: (a, b) => a.n.localeCompare(b.n),
  cmc: (a, b) => (a.c === "" ? 99 : a.c) - (b.c === "" ? 99 : b.c) || a.n.localeCompare(b.n),
  rarity: (a, b) => (RAR_ORDEN[a.r] ?? 9) - (RAR_ORDEN[b.r] ?? 9) || a.n.localeCompare(b.n),
  set: (a, b) => (a.s || "").localeCompare(b.s || "") || a.n.localeCompare(b.n),
  qty: (a, b) => b.q - a.q || a.n.localeCompare(b.n),
};

/* ── Render ──────────────────────────────────────────────────────────────── */

function render() {
  filtradas = aplicar();
  filtradas.sort(SORTS[val("f-sort")] || SORTS.name);

  const copias = filtradas.reduce((s, c) => s + c.q, 0);
  $("count").innerHTML = `<b>${filtradas.length.toLocaleString("es")}</b> cartas distintas · ` +
                         `<b>${copias.toLocaleString("es")}</b> copias`;

  if (vista === "grid") {
    $("viewport").hidden = false; $("tablewrap").hidden = true;
    dibujarGrid();
  } else {
    $("viewport").hidden = true; $("tablewrap").hidden = false;
    dibujarTabla();
  }
}

/* Virtualización: calculamos qué filas caen en pantalla y solo pintamos esas.
   El contenedor mantiene la altura total para que la barra de scroll sea real. */
let colsCache = 0, filaAlto = 0;

function metricas() {
  const vp = $("viewport");
  const ancho = vp.clientWidth || 1200;
  const cw = parseInt(getComputedStyle(document.documentElement)
                .getPropertyValue("--card-w")) || 170;
  const gap = 14;
  const cols = Math.max(1, Math.floor((ancho + gap) / (cw + gap)));
  const anchoReal = (ancho - gap * (cols - 1)) / cols;
  return { cols, alto: anchoReal * (680 / 488) + 52 + gap };
}

function dibujarGrid() {
  const vp = $("viewport"), grid = $("grid");
  const { cols, alto } = metricas();
  colsCache = cols; filaAlto = alto;

  const filas = Math.ceil(filtradas.length / cols);
  vp.style.height = (filas * alto) + "px";

  if (!filtradas.length) {
    grid.style.transform = "translateY(0)";
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Ninguna carta coincide con estos filtros.</div>`;
    vp.style.height = "160px";
    return;
  }
  pintarVentana();
}

function pintarVentana() {
  if (vista !== "grid" || !filtradas.length) return;
  const vp = $("viewport"), grid = $("grid");
  const top = Math.max(0, window.scrollY - vp.offsetTop);
  const primera = Math.max(0, Math.floor(top / filaAlto) - 2);
  const visibles = Math.ceil(window.innerHeight / filaAlto) + 4;
  const desde = primera * colsCache;
  const hasta = Math.min(filtradas.length, desde + visibles * colsCache);

  grid.style.transform = `translateY(${primera * filaAlto}px)`;
  grid.innerHTML = filtradas.slice(desde, hasta).map(tarjeta).join("");
}

function tarjeta(c) {
  const i = c._i;
  const cuerpo = (c.id || c.ov)
    ? `<img src="${img(c,'normal')}" srcset="${srcset(c)}"
            sizes="(max-width:600px) 46vw, (max-width:900px) 24vw, 210px"
            alt="${c.n}" loading="lazy" decoding="async">`
    : `<div class="noimg"><div style="font-size:1.5rem">🃏</div><div>${c.n}</div></div>`;
  return `<div class="card ${picked.has(i) ? "picked" : ""}">
    <div class="pick" onclick="togglePick(event,${i})">${picked.has(i) ? "✓" : "+"}</div>
    ${c.f ? '<div class="badge foil">✦</div>' : ""}
    ${c.q > 1 ? `<div class="badge" style="top:auto;bottom:44px">×${c.q}</div>` : ""}
    <div onclick="abrir(${i})">${cuerpo}</div>
    <div class="cfoot" onclick="abrir(${i})">
      <div class="nm">${c.n}</div>
      <div class="mt">${mana(c.mc)} ${c.s ? "· " + c.s : ""}</div>
    </div>
  </div>`;
}

function dibujarTabla() {
  const tope = filtradas.slice(0, 500);
  const filas = tope.map(c => `<tr class="${picked.has(c._i) ? "picked" : ""}">
    <td><button class="chip ${picked.has(c._i) ? "on" : ""}" onclick="togglePick(event,${c._i})">${picked.has(c._i) ? "✓" : "+"}</button></td>
    <td class="tname" onclick="abrir(${c._i})">${c.n}${c.f ? ' <span style="color:#ffd700">✦</span>' : ""}</td>
    <td>${c.q}</td><td>${mana(c.mc)}</td><td>${c.c === "" ? "" : c.c}</td>
    <td style="font-size:.72rem">${c.tl}</td>
    <td><span style="color:${RAR_COLOR[c.r] || "#888"}">●</span> ${c.s}</td>
    <td>${c.cn || ""}</td><td>${c.cd.join(", ")}</td><td>${c.b.join(", ")}</td></tr>`).join("");

  $("tablewrap").innerHTML = !filtradas.length
    ? `<div class="empty">Ninguna carta coincide con estos filtros.</div>`
    : `<table><thead><tr><th></th><th>Carta</th><th>Cant</th><th>Coste</th><th>CMC</th>
       <th>Tipo</th><th>Edición</th><th>N.º</th><th>Cond</th><th>Carpeta</th></tr></thead>
       <tbody>${filas}</tbody></table>` +
      (filtradas.length > 500
        ? `<div class="empty">Mostrando las primeras 500 de ${filtradas.length}. Afina los filtros o usa la galería.</div>`
        : "");
}

/* ── Lista de intercambio ────────────────────────────────────────────────── */

function togglePick(ev, i) {
  ev.stopPropagation();
  picked.has(i) ? picked.delete(i) : picked.add(i);
  $("pick-count").textContent = picked.size;
  $("tradebar").classList.toggle("show", picked.size > 0);
  vista === "grid" ? pintarVentana() : dibujarTabla();
}

const listaTexto = items => items.map(c =>
  `${c.q} ${c.n}${c.s ? ` (${c.s})` : ""}${c.cn ? ` ${c.cn}` : ""}${c.f ? " *F*" : ""}`).join("\n");

const seleccionadas = () => [...picked].map(i => CARDS[i]);

function descargar(texto, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "text/plain" }));
  a.download = nombre; a.click(); URL.revokeObjectURL(a.href);
}

function copiar(texto, btn) {
  navigator.clipboard.writeText(texto).then(() => {
    const t = btn.textContent; btn.textContent = "¡Copiado!";
    setTimeout(() => btn.textContent = t, 1500);
  }).catch(() => alert("El navegador bloqueó el portapapeles. Usa 'Ver lista' y copia a mano."));
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

function abrir(i) {
  const c = CARDS[i];
  const kv = (k, v) => v ? `<div class="kv"><span>${k}</span><span>${v}</span></div>` : "";
  const texto = ORACLE_LISTO ? (ORACLE[c.n] || "") : "";
  $("modal").innerHTML = `
    <span class="close" onclick="cerrar()">&times;</span>
    ${(c.id || c.ov) ? `<img src="${img(c,'large')}" alt="${c.n}">` : ""}
    <div class="info">
      <h2>${c.n}</h2>
      <div style="color:var(--text2);font-size:.85rem">${c.tl}</div>
      ${texto ? `<div class="ot">${mana(texto, true)}</div>` : ""}
      ${kv("Coste", mana(c.mc))}${kv("CMC", c.c)}${kv("Fuerza/Resistencia", c.pt)}
      ${kv("Identidad de color", c.ci || "Incolora")}${kv("Rareza", c.r)}
      ${kv("Edición", (c.sn || c.s) + (c.cn ? " · #" + c.cn : ""))}
      ${kv("Copias", c.q)}${kv("Foil", c.f ? "Sí" : "")}${kv("Condición", c.cd.join(", "))}
      ${kv("Idioma", c.lg.join(", "))}${kv(c.b.length > 1 ? "Carpetas" : "Carpeta", c.b.join(", "))}
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn solid" onclick="togglePick(event,${i});cerrar()">
          ${picked.has(i) ? "Quitar de la lista" : "Añadir a intercambio"}</button>
        ${c.id ? `<a class="btn" href="https://scryfall.com/card/${c.s.toLowerCase()}/${c.cn}" target="_blank" rel="noopener">Ver en Scryfall</a>` : ""}
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");

/* ── Comandante ──────────────────────────────────────────────────────────── */

function aplicarIdentidad(nombre, ci) {
  colors.clear();
  (ci || "").split("").forEach(x => colors.add(x));
  if (!ci) colors.add("C");   // incoloro: solo cartas sin identidad
  document.querySelectorAll(".pip").forEach(p => p.classList.toggle("on", colors.has(p.dataset.c)));
  cmode = "subset"; $("f-cmode").value = "subset";
  $("cmd-status").textContent = ci
    ? `Mostrando lo legal en ${nombre} — identidad ${ci}`
    : `${nombre} es incoloro — solo cartas incoloras`;
  render();
}

async function buscarComandante() {
  const nombre = $("cmd-input").value.trim();
  if (!nombre) return;
  const claves = Object.keys(META.comandantes);
  const exacto = claves.find(n => n.toLowerCase() === nombre.toLowerCase());
  const parcial = exacto || claves.find(n => n.toLowerCase().includes(nombre.toLowerCase()));
  if (parcial) { aplicarIdentidad(parcial, META.comandantes[parcial]); return; }

  $("cmd-status").textContent = "Buscando en Scryfall...";
  try {
    const r = await fetch("https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(nombre));
    if (!r.ok) throw new Error();
    const d = await r.json();
    aplicarIdentidad(d.name, (d.color_identity || []).join(""));
  } catch {
    $("cmd-status").textContent = "No se encontró ese comandante.";
  }
}

/* ── Eventos ─────────────────────────────────────────────────────────────── */

function eventos() {
  ["f-text", "f-subtxt", "f-cmin", "f-cmax"].forEach(id => $(id).addEventListener("input", () => render()));
  ["f-tipo", "f-sub", "f-rar", "f-set", "f-sort", "f-binder", "f-cond", "f-lang"]
    .forEach(id => { const e = $(id); if (e) e.addEventListener("change", () => render()); });

  $("f-sub").addEventListener("change", () => { if (val("f-sub")) $("f-subtxt").value = ""; });
  $("f-subtxt").addEventListener("input", () => { if (val("f-subtxt")) $("f-sub").value = ""; });

  document.querySelectorAll(".pip").forEach(p => p.addEventListener("click", () => {
    const c = p.dataset.c;
    colors.has(c) ? colors.delete(c) : colors.add(c);
    p.classList.toggle("on", colors.has(c));
    render();
  }));
  $("f-cmode").addEventListener("change", e => { cmode = e.target.value; render(); });
  document.querySelectorAll("[data-cc]").forEach(ch => ch.addEventListener("click", () => {
    document.querySelectorAll("[data-cc]").forEach(x => x.classList.remove("on"));
    ch.classList.add("on"); ccount = ch.dataset.cc; render();
  }));
  $("f-foil").addEventListener("click", () => {
    onlyFoil = !onlyFoil; $("f-foil").classList.toggle("on", onlyFoil); render();
  });

  $("v-grid").addEventListener("click", () => {
    vista = "grid"; $("v-grid").classList.add("on"); $("v-table").classList.remove("on"); render();
  });
  $("v-table").addEventListener("click", () => {
    vista = "table"; $("v-table").classList.add("on"); $("v-grid").classList.remove("on"); render();
  });
  $("f-size").addEventListener("change", e => {
    if (e.target.value) document.documentElement.style.setProperty("--card-w", e.target.value + "px");
    else document.documentElement.style.removeProperty("--card-w");
    render();
  });

  $("cmd-go").addEventListener("click", buscarComandante);
  $("cmd-input").addEventListener("keydown", e => { if (e.key === "Enter") buscarComandante(); });
  $("cmd-clear").addEventListener("click", () => {
    colors.clear();
    document.querySelectorAll(".pip").forEach(p => p.classList.remove("on"));
    $("cmd-input").value = "";
    $("cmd-status").textContent = `${Object.keys(META.comandantes).length} comandantes detectados en esta colección`;
    render();
  });

  $("f-clear").addEventListener("click", () => {
    colors.clear();
    document.querySelectorAll(".pip").forEach(p => p.classList.remove("on"));
    cmode = "subset"; $("f-cmode").value = "subset";
    ccount = "todos";
    document.querySelectorAll("[data-cc]").forEach(x => x.classList.remove("on"));
    document.querySelector('[data-cc="todos"]').classList.add("on");
    onlyFoil = false; $("f-foil").classList.remove("on");
    ["f-text", "f-subtxt", "f-cmin", "f-cmax", "f-tipo", "f-sub", "f-rar",
     "f-set", "f-binder", "f-cond", "f-lang", "cmd-input"]
      .forEach(id => { const e = $(id); if (e) e.value = ""; });
    $("cmd-status").textContent = `${Object.keys(META.comandantes).length} comandantes detectados en esta colección`;
    render();
  });

  $("export-filtro").addEventListener("click", () => {
    if (filtradas.length) descargar(listaTexto(filtradas), "coleccion_filtrada.txt");
  });
  $("pick-copy").addEventListener("click", e => copiar(listaTexto(seleccionadas()), e.target));
  $("pick-download").addEventListener("click", () => descargar(listaTexto(seleccionadas()), "intercambio.txt"));
  $("pick-clear").addEventListener("click", () => {
    picked.clear(); $("pick-count").textContent = "0";
    $("tradebar").classList.remove("show");
    vista === "grid" ? pintarVentana() : dibujarTabla();
  });
  $("pick-view").addEventListener("click", () => {
    $("modal").innerHTML = `<span class="close" onclick="cerrar()">&times;</span>
      <div class="info" style="flex:1">
        <h2>Lista de intercambio (${picked.size})</h2>
        <p style="color:var(--text2);font-size:.8rem;margin-bottom:.7rem">
          Copia este texto y mándaselo al dueño de la colección.</p>
        <textarea readonly>${listaTexto(seleccionadas())}</textarea>
      </div>`;
    $("overlay").classList.add("show");
  });

  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });

  let tick = false;
  window.addEventListener("scroll", () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => { pintarVentana(); tick = false; });
  }, { passive: true });

  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (vista === "grid") dibujarGrid(); }, 150);
  });
}

if (typeof document !== "undefined" && document.getElementById("loader")) iniciar();
