/* ============================================================================
   Visor de pedidos — dónde está cada carta y en qué orden recogerlas
   ----------------------------------------------------------------------------
   Pegas el mensaje que te manda el comprador (el mismo formato que exporta la
   portada) y la página cruza cada línea con cards.json para decirte en qué
   carpeta está. Las agrupa por carpeta y las ordena según TU ruta física, que
   se guarda en el navegador: así recorres cada carpeta una sola vez.

   Lo que no está en el catálogo se busca también en mazos.json, para poder
   distinguir "no la tengo" de "está montada en el mazo tal".

   Cada línea lleva la identidad de color (las carpetas están ordenadas por
   color, así que es lo primero que necesitas para saber dónde mirar), el tipo,
   el coste de maná, el precio unitario y el subtotal. Cuando tienes varias
   versiones de la misma carta puedes cambiar la edición a mano: el escaneo de
   Manabox no siempre acierta con la edición que espera el comprador.

   Todo el estado (texto del pedido, ruta, versiones elegidas, cartas ya
   recogidas y el mensaje de respuesta) vive en localStorage: si se bloquea el
   móvil a mitad de la recogida, no se pierde.
   ========================================================================== */

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const usd = v => (v === null || v === undefined || !v) ? ""
  : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RE_SIMBOLO = /\{[^}]+\}/g;

/* Cambia {2}{B} por las imágenes de símbolos que descarga el generador. */
function mana(txt) {
  if (!txt) return "";
  if (!META || !META.simbolos) return esc(txt);
  return esc(txt).replace(RE_SIMBOLO, s => {
    const a = META.simbolos[s];
    if (!a) return s;
    return `<img class="ms" src="assets/simbolos/${a}" alt="${s}" width="16" height="16" ` +
           `style="width:1em;height:1em;vertical-align:-.14em;display:inline-block" loading="lazy">`;
  });
}

/* La identidad de color viene como "WU" (o "" si es incolora). Se pinta con
   los mismos símbolos redondos que el coste: es lo que te dice si la carta
   está en la carpeta azul, en la multicolor o en la de incoloras. */
const ORDEN_CI = "WUBRG";
function identidad(ci) {
  const letras = (ci || "").split("").filter(l => ORDEN_CI.includes(l));
  if (!letras.length) return mana("{C}");
  letras.sort((a, b) => ORDEN_CI.indexOf(a) - ORDEN_CI.indexOf(b));
  return mana(letras.map(l => `{${l}}`).join(""));
}

/* Enlace a la carta en Star City Games. No se puede consultar el precio desde
   aquí (SCG no permite peticiones desde otro dominio), así que el botón abre
   su buscador en otra pestaña con el nombre exacto de la carta. */
const SCG_BUSCADOR = "https://starcitygames.com/search/?search_query=";
const scgUrl = c => SCG_BUSCADOR + encodeURIComponent(c.n.split("//")[0].trim());

const K_TXT = "pedido:texto", K_RUTA = "pedido:ruta", K_HECHAS = "pedido:hechas";
const K_VER = "pedido:versiones", K_MSG = "pedido:mensaje";
const guarda = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const lee = (k, pordefecto) => {
  try { const v = localStorage.getItem(k); return v === null ? pordefecto : JSON.parse(v); }
  catch (e) { return pordefecto; }
};

let META = null, IDX = new Map(), EN_MAZOS = new Map();
let RUTA = [], LINEAS = [], SIN = [], IGNORADAS = [];
let HECHAS = new Set(lee(K_HECHAS, []));
/* Versión elegida a mano: clave de petición → "SET|nº|foil". Se guarda la
   identidad de la carta y no su índice, porque el índice cambia cada vez que
   regeneras la web y apuntaría a otra carta distinta. */
let VERSIONES = lee(K_VER, {}) || {};
let MSG_AUTO = "";   // último mensaje generado, para saber si lo has editado

/* Normaliza para comparar: "Azusa's Many Journeys" → "azusasmanyjourneys" */
function norm(t) {
  return (t || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/* Identidad estable de una versión concreta, para guardar tu elección. */
const idVersion = c => `${c.s}|${c.cn}|${c.f ? 1 : 0}`;

async function traer(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function iniciar() {
  try {
    // Los índices se montan en local y se publican al final. Si iniciar() se
    // ejecutara dos veces a la vez, indexar sobre el mapa global metería cada
    // carta por duplicado y el visor creería que tienes dos versiones iguales
    // de todo.
    const idx = new Map(), enMazos = new Map();

    META = await traer("data/meta.json");
    const doc = await traer("data/cards.json");
    const I = {}; doc.cols.forEach((c, i) => I[c] = i);
    const sets = META.sets, binders = META.binders.map(b => b[0]);
    const tipos = META.tipos || [];

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
        t:  tipos[r[I.t]] || "",
        mc: r[I.mc] || "",
        c:  r[I.cmc] === null || r[I.cmc] === undefined ? "" : r[I.cmc],
        ci: I.ci === undefined ? "" : (r[I.ci] || ""),
        nv: I.nv === undefined ? "" : (r[I.nv] || ""),
        p:  r[I.p] === undefined ? null : r[I.p],
        x:  I.x === undefined ? 0 : (r[I.x] || 0),
        b:  (Array.isArray(bs) ? bs : [bs]).map(k => binders[k]).filter(Boolean),
      };
      // Se indexa por el nombre completo y, en las de dos caras, por la cara
      // frontal: el comprador puede mandar cualquiera de las dos grafías.
      const claves = new Set([norm(carta.n)]);
      if (carta.n.includes("//")) claves.add(norm(carta.n.split("//")[0]));
      claves.forEach(k => {
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(carta);
      });
    });
    IDX = idx;

    // Las cartas montadas en mazos no están en cards.json: se miran aparte
    // para poder decir "está en el mazo X" en vez de "no la tengo".
    try {
      const m = await traer("data/mazos.json");
      (m.mazos || []).forEach(mazo => (mazo.lista || []).forEach(c => {
        const k = norm(c.n);
        if (!enMazos.has(k)) enMazos.set(k, mazo.nombre);
      }));
    } catch (e) { /* la web puede no tener mazos todavía */ }
    EN_MAZOS = enMazos;

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
    cerrarMensaje();
  });
  $("desmarcar").addEventListener("click", () => {
    HECHAS.clear(); guarda(K_HECHAS, []); pintar();
  });
  $("copiar").addEventListener("click", () => prepararMensaje());
  if ($("msg-copiar")) $("msg-copiar").addEventListener("click", copiarMensaje);
  if ($("msg-rehacer")) $("msg-rehacer").addEventListener("click", () => prepararMensaje(true));
  if ($("msg-cerrar")) $("msg-cerrar").addEventListener("click", cerrarMensaje);
  if ($("mensaje")) $("mensaje").addEventListener("input", () => {
    guarda(K_MSG, $("mensaje").value);
    pistaMensaje();
  });
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

  // Se agrupan las líneas repetidas: dos "The Misty Mountains Cold" son 2
  // copias. La clave es la PETICIÓN (nombre + edición pedida), no la carta
  // resuelta: así cambiar de versión no parte el grupo ni pierde lo marcado.
  const porCarta = new Map(), sinResolver = [];
  pedidos.forEach(p => {
    const clave = clavePeticion(p);
    if (porCarta.has(clave)) {
      const y = porCarta.get(clave);
      y.pedidas += p.qty;
      y.lineas.push(p.linea);
      return;
    }
    const r = resolver(p);
    if (!r.carta) { sinResolver.push({ ...p, motivo: r.motivo }); return; }
    porCarta.set(clave, {
      clave, carta: r.carta, versiones: r.versiones, alternativas: r.alternativas,
      avisoEdicion: r.avisoEdicion, manual: r.manual,
      pedidas: p.qty, lineas: [p.linea],
    });
  });

  LINEAS = [...porCarta.values()];
  SIN = sinResolver;
  IGNORADAS = ignoradas;
  pintar();
}

const clavePeticion = p => `${norm(p.name)}|${p.set}|${(p.cn || "").toLowerCase()}`;

/* Preferencia automática: primero lo que está a la venta, luego la no foil
   (más barata y la que el comprador espera si no pidió foil), luego la de más
   copias. Es también el orden del desplegable. */
const cmpVersion = (a, b) => (a.x - b.x) || (a.f - b.f) || (b.q - a.q);

function resolver(p) {
  let cands = IDX.get(norm(p.name));
  if (!cands || !cands.length) {
    const mazo = EN_MAZOS.get(norm(p.name));
    return { carta: null, motivo: mazo ? `montada en el mazo ${mazo}` : "no está en tu colección" };
  }

  // Todas las versiones que tienes de esa carta: son las opciones del
  // desplegable, aunque el comprador haya pedido una edición concreta.
  const versiones = [...cands].sort(cmpVersion);

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

  const orden = [...cands].sort(cmpVersion);

  // Si ya elegiste una versión a mano para esta petición, manda esa.
  let carta = orden[0], manual = false;
  const guardada = VERSIONES[clavePeticion(p)];
  if (guardada) {
    const elegida = versiones.find(c => idVersion(c) === guardada);
    if (elegida) { carta = elegida; manual = true; avisoEdicion = ""; }
  }

  // Para el aviso de "varias versiones" solo cuentan las que encajan con lo
  // que pidió el comprador: si te pidió la de LTC y solo tienes esa, no hay
  // nada que avisar aunque tengas la misma carta en otras tres ediciones.
  // El desplegable sí las ofrece todas.
  return {
    carta, versiones, manual, avisoEdicion,
    alternativas: (manual ? versiones : orden).filter(c => c !== carta),
  };
}

/* ── Pintado ────────────────────────────────────────────────────────────── */
const subtotal = l => (l.carta.p || 0) * l.pedidas;
/* Una línea se puede cobrar si está a la venta y te quedan suficientes. */
const servible = l => l.carta.x === 0 && l.pedidas <= l.carta.q;

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
  const hechas = LINEAS.filter(l => HECHAS.has(l.clave))
                       .reduce((s, l) => s + l.pedidas, 0);

  // El total se parte en lo que puedes cobrar y lo que no vas a servir: el
  // número que le pasas al comprador es solo el primero.
  const suma = f => LINEAS.filter(f).reduce((s, l) => s + subtotal(l), 0);
  const cobrable = suma(servible), fuera = suma(l => !servible(l));

  $("stats").innerHTML = [
    [LINEAS.length, "Cartas"],
    [copias, "Copias"],
    [conCartas.length, "Carpetas"],
    [usd(cobrable) || "$0.00", "A cobrar"],
    ...(fuera ? [[usd(fuera), "No vendible"]] : []),
    ...(fuera ? [[usd(cobrable + fuera), "Total pedido"]] : []),
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  $("barra-prog").hidden = !LINEAS.length;
  $("prog-fill").style.width = copias ? (hechas / copias * 100) + "%" : "0";
  $("prog-txt").innerHTML = `<b>${hechas}</b> de <b>${copias}</b> copias recogidas`;

  $("resultado").innerHTML = !conCartas.length
    ? `<div class="empty">Pega el mensaje del comprador y pulsa “Buscar en la colección”.</div>`
    : conCartas.map((carpeta, pos) => bloqueCarpeta(carpeta, grupos.get(carpeta), pos, conCartas.length)).join("");

  pintarAvisos();
  enganchar();
  pistaMensaje();
}

function bloqueCarpeta(carpeta, lineas, pos, total) {
  const copias = lineas.reduce((s, l) => s + l.pedidas, 0);
  const listas = lineas.every(l => HECHAS.has(l.clave));
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

/* Etiqueta corta de una versión, para el desplegable. Lleva la carpeta porque
   cambiar de edición casi siempre te manda a otra carpeta distinta. */
function etiquetaVersion(c) {
  return [
    c.s + (c.cn ? " #" + c.cn : ""),
    c.f ? "foil" : "",
    c.b[0] || "sin carpeta",
    `${c.q} ${c.q === 1 ? "copia" : "copias"}`,
    c.x === 2 ? "no a la venta" : (c.x === 1 ? "vitrina" : ""),
    usd(c.p),
  ].filter(Boolean).join(" · ");
}

/* Los id de HTML no admiten cualquier carácter y la clave de petición lleva
   apóstrofes y barras: se convierte en un número estable. */
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function fila(l) {
  const c = l.carta, hecha = HECHAS.has(l.clave), cb = "cb-" + hash(l.clave);
  const otras = c.b.length > 1 ? ` · también en ${esc(c.b.slice(1).join(", "))}` : "";
  const marcas = [
    c.f ? `<span class="mk foil">✦ Foil</span>` : "",
    c.x === 2 ? `<span class="mk no">No a la venta${c.nv ? ": " + esc(c.nv) : ""}</span>` : "",
    c.x === 1 ? `<span class="mk sld">Vitrina</span>` : "",
    l.pedidas > c.q ? `<span class="mk no">Solo tienes ${c.q}</span>` : "",
    l.avisoEdicion ? `<span class="mk avi">${esc(l.avisoEdicion)}</span>` : "",
    l.manual ? `<span class="mk ok">Edición elegida a mano</span>` : "",
  ].filter(Boolean).join("");

  // El coste va en dos formas a propósito: los símbolos para reconocer la
  // carta de un vistazo y el CMC para no tener que sumarlos mentalmente.
  const coste = [
    c.mc ? `<span class="mana">${mana(c.mc)}</span>` : "",
    c.c === "" ? "" : `<span class="cmc">CMC ${c.c}</span>`,
  ].filter(Boolean).join(" ");

  // El desplegable solo aparece cuando de verdad hay entre qué elegir.
  const selector = l.versiones.length > 1
    ? `<select class="vsel" data-k="${esc(l.clave)}" aria-label="Edición que vas a servir"` +
      ` title="Cambiar la edición que vas a servir">` +
      l.versiones.map(v => `<option value="${esc(idVersion(v))}"${v === c ? " selected" : ""}>` +
        `${esc(etiquetaVersion(v))}</option>`).join("") + `</select>`
    : "";

  // Precio de la línea: el total arriba y, si pide varias copias, el desglose.
  // Debajo, el enlace a SCG: es donde vas a mirar si ese precio sigue vigente.
  const precio = c.p
    ? (l.pedidas > 1
        ? `<b>${usd(subtotal(l))}</b><small>${l.pedidas} × ${usd(c.p)}</small>`
        : `<b>${usd(c.p)}</b>`)
    : `<b class="sinp">sin precio</b>`;

  return `<div class="linea${hecha ? " hecha" : ""}">
    <input type="checkbox" id="${cb}" data-k="${esc(l.clave)}"${hecha ? " checked" : ""}>
    <span class="tx">
      <label class="nom" for="${cb}"><span class="qty">${l.pedidas}×</span><span class="ci" title="Identidad de color: ${esc(c.ci || "incolora")}">${identidad(c.ci)}</span>${esc(c.n)}</label>
      <label class="sub" for="${cb}">
        ${c.t ? `<span class="tipo">${esc(c.t)}</span>` : ""}
        ${coste}
        <span class="ed">${esc(c.s)}${c.cn ? " #" + esc(c.cn) : ""}${otras}</span>
        ${marcas}
      </label>
      ${selector ? `<span class="acc">${selector}</span>` : ""}
    </span>
    <span class="pre">${precio}<a class="btn mini scg" href="${esc(scgUrl(c))}" target="_blank"
       rel="noopener" title="Ver el precio actual en Star City Games">SCG ↗</a></span>
  </div>`;
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
      Te muestro la que tiene más sentido servir; si el comprador quería otra, cámbiala
      en el desplegable de su línea.
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
      const k = cb.dataset.k;
      cb.checked ? HECHAS.add(k) : HECHAS.delete(k);
      guarda(K_HECHAS, [...HECHAS]);
      pintar();
    });
  });
  document.querySelectorAll("#resultado .vsel").forEach(sel => {
    sel.addEventListener("change", () => elegirVersion(sel.dataset.k, sel.value));
  });
  document.querySelectorAll("[data-sube],[data-baja]").forEach(b => {
    b.addEventListener("click", () => {
      const carpeta = b.dataset.sube || b.dataset.baja;
      mover(carpeta, b.dataset.sube ? -1 : 1);
    });
  });
}

/* Cambiar de edición es una decisión tuya sobre ESTA carta: se recuerda entre
   pedidos, porque si el escaneo tiene mal la edición la va a tener mal
   siempre. Se borra volviendo a elegir la versión que el visor propone. */
function elegirVersion(clave, id) {
  const l = LINEAS.find(x => x.clave === clave);
  if (!l) return;
  const elegida = l.versiones.find(v => idVersion(v) === id);
  if (!elegida) return;
  l.carta = elegida;
  l.manual = true;
  l.avisoEdicion = "";
  l.alternativas = l.versiones.filter(v => v !== elegida);
  VERSIONES[clave] = id;
  guarda(K_VER, VERSIONES);
  pintar();
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

/* ── Respuesta para WhatsApp ────────────────────────────────────────────────
   El mensaje se genera con los precios y se deja en un cuadro editable: casi
   siempre quieres redondear, quitar una carta o añadir el envío antes de
   mandarlo. Lo que edites se guarda y no se pisa solo; "Rehacer" vuelve al
   texto automático. */
function textoRespuesta() {
  const hay = LINEAS.filter(servible);
  const no = LINEAS.filter(l => !servible(l));
  const total = hay.reduce((s, l) => s + subtotal(l), 0);

  let t = `Confirmadas (${hay.length}):\n` + hay.map(l => {
    const c = l.carta;
    const precio = c.p
      ? (l.pedidas > 1 ? ` — ${usd(c.p)} c/u = ${usd(subtotal(l))}` : ` — ${usd(c.p)}`)
      : "";
    return `${l.pedidas} ${c.n} (${c.s})${c.f ? " foil" : ""}${precio}`;
  }).join("\n") + `\n\nTotal aproximado: ${usd(total) || "$0.00"}`;

  const faltan = no.concat(SIN.map(s => ({ _texto: s.linea, _motivo: s.motivo })));
  if (faltan.length) {
    t += `\n\nNo puedo servirte:\n` + faltan.map(l => l._texto
      ? `- ${l._texto} (${l._motivo})`
      : `- ${l.carta.n} (${l.carta.x !== 0 ? "no está a la venta" : "solo me queda " + l.carta.q})`
    ).join("\n");
  }
  return t;
}

/* Abre el editor. Con `forzar` rehace el texto aunque lo hayas tocado. */
function prepararMensaje(forzar) {
  if (!LINEAS.length && !SIN.length) return;
  const caja = $("mensaje");
  if (!caja) { copiarRespuesta(); return; }   // por si el HTML es el antiguo

  const guardado = lee(K_MSG, "");
  const editado = guardado && guardado !== MSG_AUTO;
  if (forzar === true || !editado) {
    MSG_AUTO = textoRespuesta();
    caja.value = MSG_AUTO;
    guarda(K_MSG, MSG_AUTO);
  } else if (!caja.value) {
    caja.value = guardado;
  }
  if ($("salida")) $("salida").hidden = false;
  pistaMensaje();
  try { caja.focus(); } catch (e) {}
}

function cerrarMensaje() {
  if ($("salida")) $("salida").hidden = true;
  if ($("mensaje")) $("mensaje").value = "";
  if ($("msg-pista")) $("msg-pista").textContent = "";
  MSG_AUTO = "";
  guarda(K_MSG, "");
}

/* Avisa cuando el texto que tienes escrito ya no cuadra con el pedido. */
function pistaMensaje() {
  const pista = $("msg-pista"), caja = $("mensaje"), panel = $("salida");
  if (!pista || !caja || !panel || panel.hidden) return;
  pista.textContent = caja.value === textoRespuesta() ? ""
    : "Lo has editado (o el pedido ha cambiado desde que lo generaste). «Rehacer» vuelve al texto automático.";
}

function copiarMensaje() {
  const caja = $("mensaje");
  const t = caja ? caja.value : textoRespuesta();
  const btn = $("msg-copiar") || $("copiar");
  navigator.clipboard.writeText(t).then(
    () => { btn.textContent = "¡Copiado!"; setTimeout(() => btn.textContent = "Copiar", 1800); },
    () => { btn.textContent = "No se pudo copiar"; setTimeout(() => btn.textContent = "Copiar", 1800); });
}

/* Copia directa sin pasar por el editor: la usan las pruebas y sigue valiendo
   si alguien llega con el pedido.html antiguo en caché. */
function copiarRespuesta() {
  if (!LINEAS.length) return;
  const caja = $("mensaje");
  const t = (caja && caja.value) || textoRespuesta();
  navigator.clipboard.writeText(t).then(() => {}, () => {});
}

if (typeof document !== "undefined" && $("loader")) iniciar();
