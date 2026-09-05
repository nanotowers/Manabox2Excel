/* ============================================================================
   Visor de pedidos — dónde está cada carta y en qué orden recogerlas
   ----------------------------------------------------------------------------
   Pegas el mensaje que te manda el comprador (el mismo formato que exporta la
   portada) y la página cruza cada línea con cards.json para decirte en qué
   carpeta está. Las agrupa por carpeta y las ordena según TU ruta física, que
   se guarda en el navegador: así recorres cada carpeta una sola vez.

   Lo que no está en el catálogo se busca también en mazos.json, para poder
   distinguir "no la tengo" de "está montada en el mazo tal".

   Todo el estado (texto del pedido, ruta y cartas ya recogidas) vive en
   localStorage: si se bloquea el móvil a mitad de la recogida, no se pierde.
   ========================================================================== */

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const usd = v => (v === null || v === undefined || !v) ? ""
  : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const K_TXT = "pedido:texto", K_RUTA = "pedido:ruta", K_HECHAS = "pedido:hechas";
const guarda = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const lee = (k, pordefecto) => {
  try { const v = localStorage.getItem(k); return v === null ? pordefecto : JSON.parse(v); }
  catch (e) { return pordefecto; }
};

let META = null, IDX = new Map(), EN_MAZOS = new Map();
let RUTA = [], LINEAS = [], SIN = [], IGNORADAS = [];
let HECHAS = new Set(lee(K_HECHAS, []));

/* Normaliza para comparar: "Azusa's Many Journeys" → "azusasmanyjourneys" */
function norm(t) {
  return (t || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function traer(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function iniciar() {
  try {
    META = await traer("data/meta.json");
    const doc = await traer("data/cards.json");
    const I = {}; doc.cols.forEach((c, i) => I[c] = i);
    const sets = META.sets, binders = META.binders.map(b => b[0]);

    doc.rows.forEach((r, i) => {
      const bs = r[I.b];
      const carta = {
        i,
        n:  r[I.n],
        s:  sets[r[I.s]] ? sets[r[I.s]][0] : "",
        sn: sets[r[I.s]] ? sets[r[I.s]][1] : "",
        cn: r[I.cn],
        f:  r[I.f],
        q:  r[I.q],
        p:  r[I.p] === undefined ? null : r[I.p],
        x:  I.x === undefined ? 0 : (r[I.x] || 0),
        b:  (Array.isArray(bs) ? bs : [bs]).map(k => binders[k]).filter(Boolean),
      };
      // Se indexa por el nombre completo y, en las de dos caras, por la cara
      // frontal: el comprador puede mandar cualquiera de las dos grafías.
      const claves = new Set([norm(carta.n)]);
      if (carta.n.includes("//")) claves.add(norm(carta.n.split("//")[0]));
      claves.forEach(k => {
        if (!IDX.has(k)) IDX.set(k, []);
        IDX.get(k).push(carta);
      });
    });

    // Las cartas montadas en mazos no están en cards.json: se miran aparte
    // para poder decir "está en el mazo X" en vez de "no la tengo".
    try {
      const m = await traer("data/mazos.json");
      (m.mazos || []).forEach(mazo => (mazo.lista || []).forEach(c => {
        const k = norm(c.n);
        if (!EN_MAZOS.has(k)) EN_MAZOS.set(k, mazo.nombre);
      }));
    } catch (e) { /* la web puede no tener mazos todavía */ }

    RUTA = ordenGuardado(binders);

    $("loader").hidden = true;
    $("app").hidden = false;
    eventos();

    const previo = lee(K_TXT, "");
    if (previo) { $("entrada").value = previo; analizar(); }
  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>No se pudieron cargar los datos de la colección.</b><br>${esc(e.message)}</div>`;
  }
}

/* La ruta guardada manda; las carpetas nuevas se añaden al final. */
function ordenGuardado(binders) {
  const guardada = lee(K_RUTA, null);
  if (!Array.isArray(guardada)) return binders.slice();
  const vistas = new Set(guardada);
  return guardada.filter(b => binders.includes(b))
                 .concat(binders.filter(b => !vistas.has(b)));
}

function eventos() {
  $("analizar").addEventListener("click", analizar);
  $("limpiar").addEventListener("click", () => {
    $("entrada").value = ""; HECHAS.clear();
    guarda(K_TXT, ""); guarda(K_HECHAS, []);
    LINEAS = []; SIN = []; IGNORADAS = [];
    $("resultado").innerHTML = ""; $("avisos").innerHTML = "";
    $("stats").innerHTML = ""; $("barra-prog").hidden = true;
  });
  $("desmarcar").addEventListener("click", () => {
    HECHAS.clear(); guarda(K_HECHAS, []); pintar();
  });
  $("copiar").addEventListener("click", copiarRespuesta);
}

/* ── Interpretación del mensaje ─────────────────────────────────────────────
   Formato esperado (el que exporta la portada):  "1 Sol Ring (LTC) 284"
   La cantidad, la edición y el número son opcionales.                        */
const RE_LINEA = /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w\-\*]+))?)?\s*$/;

function analizar() {
  const texto = $("entrada").value;
  guarda(K_TXT, texto);

  const pedidos = [], ignoradas = [];
  texto.split("\n").forEach(cruda => {
    const linea = cruda.trim().replace(/^[-•*]\s*/, "");
    if (!linea) return;
    // Saludos, totales y despedidas: no son cartas
    if (/^total/i.test(linea) || linea.endsWith(":") || linea.includes("$")) {
      ignoradas.push(linea); return;
    }
    const m = RE_LINEA.exec(linea);
    if (!m) { ignoradas.push(linea); return; }
    const explicita = /^\d+\s*[xX]?\s+/.test(linea);
    const p = {
      qty: parseInt(m[1] || "1", 10),
      name: (m[2] || "").trim(),
      set: (m[3] || "").toUpperCase(),
      cn: m[4] || "",
      linea, explicita,
    };
    if (!p.name) { ignoradas.push(linea); return; }
    // Una línea sin cantidad que no coincide con nada es prosa, no una carta
    if (!p.explicita && !IDX.has(norm(p.name))) { ignoradas.push(linea); return; }
    pedidos.push(p);
  });

  // Se agrupan las líneas repetidas: dos "The Misty Mountains Cold" son 2 copias
  const porCarta = new Map(), sinResolver = [];
  pedidos.forEach(p => {
    const r = resolver(p);
    if (!r.carta) { sinResolver.push({ ...p, motivo: r.motivo }); return; }
    const clave = r.carta.i;
    if (porCarta.has(clave)) {
      const y = porCarta.get(clave);
      y.pedidas += p.qty;
      y.lineas.push(p.linea);
    } else {
      porCarta.set(clave, {
        carta: r.carta, alternativas: r.alternativas, avisoEdicion: r.avisoEdicion,
        pedidas: p.qty, lineas: [p.linea],
      });
    }
  });

  LINEAS = [...porCarta.values()];
  SIN = sinResolver;
  IGNORADAS = ignoradas;
  pintar();
}

function resolver(p) {
  let cands = IDX.get(norm(p.name));
  if (!cands || !cands.length) {
    const mazo = EN_MAZOS.get(norm(p.name));
    return { carta: null, motivo: mazo ? `montada en el mazo ${mazo}` : "no está en tu colección" };
  }

  let avisoEdicion = "";
  if (p.set) {
    const f = cands.filter(c => (c.s || "").toUpperCase() === p.set);
    if (f.length) cands = f;
    else avisoEdicion = `no tienes la de ${p.set}; esta es de otra edición`;
  }
  if (p.cn) {
    const f = cands.filter(c => String(c.cn).toLowerCase() === p.cn.toLowerCase());
    if (f.length) cands = f;
  }

  // Preferencia: primero lo que está a la venta, luego la no foil (más barata
  // y la que el comprador espera si no pidió foil), luego la de más copias.
  const orden = [...cands].sort((a, b) =>
    (a.x - b.x) || (a.f - b.f) || (b.q - a.q));

  return { carta: orden[0], alternativas: orden.slice(1), avisoEdicion };
}

/* ── Pintado ────────────────────────────────────────────────────────────── */
function pintar() {
  const grupos = new Map();
  LINEAS.forEach(l => {
    const carpeta = l.carta.b[0] || "(sin carpeta)";
    if (!grupos.has(carpeta)) grupos.set(carpeta, []);
    grupos.get(carpeta).push(l);
  });

  // Toda carpeta que aparezca en un pedido entra en la ruta, para que se
  // pueda reordenar aunque sea nueva.
  grupos.forEach((_, b) => { if (!RUTA.includes(b)) RUTA.push(b); });
  const conCartas = RUTA.filter(b => grupos.has(b));

  const copias = LINEAS.reduce((s, l) => s + l.pedidas, 0);
  const hechas = LINEAS.filter(l => HECHAS.has(String(l.carta.i)))
                       .reduce((s, l) => s + l.pedidas, 0);
  const valor = LINEAS.reduce((s, l) => s + (l.carta.p || 0) * l.pedidas, 0);

  $("stats").innerHTML = [
    [LINEAS.length, "Cartas"],
    [copias, "Copias"],
    [conCartas.length, "Carpetas"],
    [usd(valor) || "$0.00", "Valor"],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  $("barra-prog").hidden = !LINEAS.length;
  $("prog-fill").style.width = copias ? (hechas / copias * 100) + "%" : "0";
  $("prog-txt").innerHTML = `<b>${hechas}</b> de <b>${copias}</b> copias recogidas`;

  $("resultado").innerHTML = !conCartas.length
    ? `<div class="empty">Pega el mensaje del comprador y pulsa “Buscar en la colección”.</div>`
    : conCartas.map((carpeta, pos) => bloqueCarpeta(carpeta, grupos.get(carpeta), pos, conCartas.length)).join("");

  pintarAvisos();
  enganchar();
}

function bloqueCarpeta(carpeta, lineas, pos, total) {
  const copias = lineas.reduce((s, l) => s + l.pedidas, 0);
  const listas = lineas.every(l => HECHAS.has(String(l.carta.i)));
  return `<section class="carpeta${listas ? " lista" : ""}">
    <div class="ch">
      <div class="ct">
        <span class="cnum">${pos + 1}</span>
        <span class="cnom">${esc(carpeta)}</span>
        <span class="ccnt">${lineas.length} carta${lineas.length > 1 ? "s" : ""} · ${copias} copia${copias > 1 ? "s" : ""}</span>
      </div>
      <div class="cmov">
        <button class="btn mini" data-sube="${esc(carpeta)}" ${pos === 0 ? "disabled" : ""} title="Subir en la ruta">↑</button>
        <button class="btn mini" data-baja="${esc(carpeta)}" ${pos === total - 1 ? "disabled" : ""} title="Bajar en la ruta">↓</button>
      </div>
    </div>
    ${lineas.map(fila).join("")}
  </section>`;
}

function fila(l) {
  const c = l.carta, hecha = HECHAS.has(String(c.i));
  const otras = c.b.length > 1 ? ` · también en ${esc(c.b.slice(1).join(", "))}` : "";
  const marcas = [
    c.f ? `<span class="mk foil">✦ Foil</span>` : "",
    c.x === 2 ? `<span class="mk no">No a la venta</span>` : "",
    c.x === 1 ? `<span class="mk sld">Vitrina</span>` : "",
    l.pedidas > c.q ? `<span class="mk no">Solo tienes ${c.q}</span>` : "",
    l.avisoEdicion ? `<span class="mk avi">${esc(l.avisoEdicion)}</span>` : "",
    l.alternativas.length ? `<span class="mk avi">${l.alternativas.length} versión(es) más</span>` : "",
  ].filter(Boolean).join("");
  return `<label class="linea${hecha ? " hecha" : ""}">
    <input type="checkbox" data-id="${c.i}"${hecha ? " checked" : ""}>
    <span class="qty">${l.pedidas}×</span>
    <span class="nom">${esc(c.n)}</span>
    <span class="ed">${esc(c.s)}${c.cn ? " #" + esc(c.cn) : ""}${otras}</span>
    ${marcas}
    <span class="pre">${usd(c.p)}</span>
  </label>`;
}

function pintarAvisos() {
  const sin = SIN, ign = IGNORADAS;
  let html = "";
  if (sin.length) {
    html += `<div class="aviso"><b>${sin.length} línea(s) que no puedes servir:</b><ul>` +
      sin.map(s => `<li>${esc(s.linea)} — <i>${esc(s.motivo)}</i></li>`).join("") + `</ul></div>`;
  }
  const alt = LINEAS.filter(l => l.alternativas.length);
  if (alt.length) {
    html += `<div class="aviso info"><b>${alt.length} carta(s) con varias versiones.</b>
      Te muestro la que tiene más sentido servir; si el comprador quería otra, aquí están:
      <ul>` + alt.map(l => `<li>${esc(l.carta.n)} → ` +
        [l.carta, ...l.alternativas].map(c =>
          `${esc(c.s)} #${esc(c.cn)}${c.f ? " foil" : ""} en <b>${esc(c.b[0] || "?")}</b>`).join(" · ") +
      `</li>`).join("") + `</ul></div>`;
  }
  if (ign.length) {
    html += `<details class="aviso info"><summary>${ign.length} línea(s) ignoradas (saludos, totales…)</summary>
      <ul>${ign.map(t => `<li>${esc(t)}</li>`).join("")}</ul></details>`;
  }
  $("avisos").innerHTML = html;
}

function enganchar() {
  document.querySelectorAll("#resultado input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      cb.checked ? HECHAS.add(id) : HECHAS.delete(id);
      guarda(K_HECHAS, [...HECHAS]);
      pintar();
    });
  });
  document.querySelectorAll("[data-sube],[data-baja]").forEach(b => {
    b.addEventListener("click", () => {
      const carpeta = b.dataset.sube || b.dataset.baja;
      mover(carpeta, b.dataset.sube ? -1 : 1);
    });
  });
}

/* Mover una carpeta cambia TU ruta física, no solo esta pantalla: por eso se
   guarda y se respeta en los siguientes pedidos. */
function mover(carpeta, dir) {
  const activas = [...new Set(LINEAS.map(l => l.carta.b[0] || "(sin carpeta)"))]
    .sort((a, b) => RUTA.indexOf(a) - RUTA.indexOf(b));
  const destino = activas.indexOf(carpeta) + dir;
  if (activas.indexOf(carpeta) < 0 || destino < 0 || destino >= activas.length) return;

  // Intercambiar las dos carpetas en la ruta completa también intercambia su
  // orden relativo entre las carpetas de este pedido, que es lo que se ve.
  const i = RUTA.indexOf(carpeta), j = RUTA.indexOf(activas[destino]);
  if (i < 0 || j < 0) return;
  RUTA[i] = activas[destino];
  RUTA[j] = carpeta;
  guarda(K_RUTA, RUTA);
  pintar();
}

/* ── Respuesta lista para pegar en WhatsApp ─────────────────────────────── */
function copiarRespuesta() {
  if (!LINEAS.length) return;
  const hay = LINEAS.filter(l => l.carta.x === 0 && l.pedidas <= l.carta.q);
  const no = LINEAS.filter(l => l.carta.x !== 0 || l.pedidas > l.carta.q);
  const total = hay.reduce((s, l) => s + (l.carta.p || 0) * l.pedidas, 0);

  let t = `Confirmadas (${hay.length}):\n` +
    hay.map(l => `${l.pedidas} ${l.carta.n} (${l.carta.s})`).join("\n") +
    `\n\nTotal aproximado: ${usd(total)}`;

  const faltan = no.concat(SIN.map(s => ({ _texto: s.linea, _motivo: s.motivo })));
  if (faltan.length) {
    t += `\n\nNo puedo servirte:\n` + faltan.map(l => l._texto
      ? `- ${l._texto} (${l._motivo})`
      : `- ${l.carta.n} (${l.carta.x !== 0 ? "no está a la venta" : "solo me queda " + l.carta.q})`
    ).join("\n");
  }

  navigator.clipboard.writeText(t).then(
    () => { $("copiar").textContent = "¡Copiada!"; setTimeout(() => $("copiar").textContent = "Copiar respuesta", 1800); },
    () => { $("copiar").textContent = "No se pudo copiar"; setTimeout(() => $("copiar").textContent = "Copiar respuesta", 1800); });
}

if (typeof document !== "undefined" && $("loader")) iniciar();
