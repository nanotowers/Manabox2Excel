/* ============================================================================
   Constructor de mazos Commander
   ----------------------------------------------------------------------------
   Deja armar un mazo con las cartas REALES de la colección y exportarlo para
   mandárselo al dueño. Aplica las reglas del formato mientras construyes:
     · Solo cartas dentro de la identidad de color del comandante
     · Una copia de cada carta, salvo tierras básicas
     · Nunca más copias de las que hay disponibles en la colección
   ========================================================================== */

const $ = id => document.getElementById(id);
const val = id => { const e = $(id); return e ? e.value : ""; };
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const RE_SIMBOLO = /\{[^}]+\}/g;
const BASICAS = ["Plains","Island","Swamp","Mountain","Forest","Wastes"];
const ORDEN_TIPOS = ["Commander","Planeswalker","Creature","Enchantment",
                     "Artifact","Instant","Sorcery","Land","Other"];
const CLAVE_GUARDADO = "constructor_mazo";
const usd = v => (v === null || v === undefined || !v) ? ""
  : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let META = null, CARDS = [], ORACLE = null, ORACLE_LISTO = false;
let comandante = null, mazo = new Map(), filtradas = [];

/* ── Utilidades compartidas ──────────────────────────────────────────────── */

function mana(txt, escapar) {
  if (!txt) return "";
  const base = escapar ? esc(txt) : txt;
  if (!META || !META.simbolos) return base;
  return base.replace(RE_SIMBOLO, s => {
    const a = META.simbolos[s];
    if (!a) return s;
    return `<img class="ms" src="assets/simbolos/${a}" alt="${s}" width="16" height="16" ` +
           `style="width:1em;height:1em;vertical-align:-.14em;display:inline-block" loading="lazy">`;
  });
}

function img(c, tam) {
  if (c.ov) return c.ov.replace("/normal/", "/" + tam + "/");
  if (!c.id || c.id.length < 2) return "";
  return `${META.img_base}${tam}/front/${c.id[0]}/${c.id[1]}/${c.id}.jpg`;
}
const srcset = c => (c.id || c.ov)
  ? `${img(c,"small")} 146w, ${img(c,"normal")} 488w, ${img(c,"large")} 672w` : "";

function lista(v, dicc, sub) {
  const arr = Array.isArray(v) ? v : (v === undefined || v === null || v === -1 ? [] : [v]);
  return arr.map(k => { const e = dicc[k];
    return e === undefined ? "" : (sub ? (Array.isArray(e) ? e[0] : e) : e); }).filter(Boolean);
}

async function traer(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/* ── Carga ───────────────────────────────────────────────────────────────── */

async function iniciar() {
  try {
    $("loader-fill").style.width = "25%";
    META = await traer("data/meta.json");
    if (META.banner) { const h = $("hero"); h.src = META.banner; h.hidden = false;
                       $("titulo").style.fontSize = "1.4rem"; }
    $("pie").textContent = "Colección actualizada el " +
      new Date(META.generated_at).toLocaleDateString("es",
        { day:"numeric", month:"long", year:"numeric" });

    $("loader-fill").style.width = "70%";
    const doc = await traer("data/cards.json");
    const tl = META.typelines, sets = META.sets, subs = META.subtipos, tipos = META.tipos,
          rar = META.rarezas;
    CARDS = doc.rows.map((r, i) => ({
      _i: i, id: r[0], n: r[1], tl: tl[r[2]] || "", mc: r[3],
      c: r[4] === null ? "" : r[4], r: rar[r[5]] || "",
      s: sets[r[6]] ? sets[r[6]][0] : "", sn: sets[r[6]] ? sets[r[6]][1] : "",
      cn: r[7], ci: r[8], co: r[9], f: r[10], q: r[11],
      sb: lista(r[15], subs, true), t: tipos[r[16]] || "Other", pt: r[17],
      p: r[18] === undefined ? null : r[18],
      ov: doc.overrides[String(i)] || ""
    }));

    // Copias totales por nombre: es el tope real de lo que se puede pedir
    CARDS.forEach(c => { c.disp = 0; });
    const porNombre = {};
    CARDS.forEach(c => { (porNombre[c.n] = porNombre[c.n] || []).push(c); });
    Object.values(porNombre).forEach(g => {
      const total = g.reduce((s,c) => s + c.q, 0);
      g.forEach(c => { c.disp = total; });
    });

    $("loader").hidden = true;
    prepararComandantes();
    eventos();
    restaurar();

    traer("data/oracle.json").then(d => { ORACLE = d.oracle || {}; ORACLE_LISTO = true; })
                             .catch(() => {});
  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>No se pudieron cargar los datos.</b><br>${e.message}</div>`;
  }
}

/* ── Paso 1: comandante ──────────────────────────────────────────────────── */

function esComandante(c) {
  return (c.tl.includes("Legendary") && c.tl.includes("Creature"))
      || (ORACLE_LISTO && (ORACLE[c.n] || "").toLowerCase().includes("can be your commander"));
}

function prepararComandantes() {
  $("paso-cmd").hidden = false;
  const nombres = Object.keys(META.comandantes || {});
  $("cmd-list").innerHTML = nombres.map(n => `<option value="${esc(n)}">`).join("");
  $("cmd-status").textContent = `${nombres.length} comandantes disponibles`;

  const candidatos = CARDS.filter(c => META.comandantes[c.n] !== undefined)
    .filter((c,i,arr) => arr.findIndex(x => x.n === c.n) === i)
    .sort((a,b) => a.n.localeCompare(b.n));

  $("cmd-grid").innerHTML =
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:.9rem">` +
    candidatos.slice(0, 60).map(c => `
      <div class="card" onclick="elegirComandante('${esc(c.n).replace(/'/g,"\\'")}')">
        ${c.id ? `<img src="${img(c,'normal')}" srcset="${srcset(c)}" sizes="210px"
                       alt="${esc(c.n)}" loading="lazy">`
               : `<div class="noimg">${esc(c.n)}</div>`}
        <div class="cfoot"><div class="nm">${esc(c.n)}</div>
          <div class="mt">${mana(c.mc)}</div></div>
      </div>`).join("") + `</div>` +
    (candidatos.length > 60
      ? `<div class="count" style="margin-top:1rem">Se muestran 60 de ${candidatos.length}.
         Usa el buscador de arriba para el resto.</div>` : "");
}

function elegirComandante(nombre) {
  const carta = CARDS.find(c => c.n === nombre) ||
                CARDS.find(c => c.n.toLowerCase() === nombre.toLowerCase()) ||
                CARDS.find(c => c.n.toLowerCase().includes(nombre.toLowerCase()));
  if (!carta) { $("cmd-status").textContent = "No encuentro esa carta en la colección."; return; }
  if (META.comandantes[carta.n] === undefined) {
    $("cmd-status").textContent = `${carta.n} no puede ser comandante.`; return;
  }
  comandante = carta;
  mazo = new Map();
  construir();
}

/* ── Paso 2: construcción ────────────────────────────────────────────────── */

function construir() {
  $("paso-cmd").hidden = true;
  $("paso-build").hidden = false;
  $("deckbar").hidden = false;
  window.scrollTo(0, 0);

  const ci = comandante.ci || "";
  $("cmd-cabecera").innerHTML = `
    <div style="display:flex;gap:1.25rem;flex-wrap:wrap;align-items:center">
      ${comandante.id ? `<img src="${img(comandante,'normal')}" alt=""
                              style="width:120px;border-radius:10px">` : ""}
      <div style="flex:1;min-width:200px">
        <div class="count">Comandante</div>
        <h2 style="color:#fff;margin:.2rem 0 .4rem">${esc(comandante.n)}</h2>
        <div>${pips(ci)}</div>
        <div class="count" style="margin-top:.5rem">
          Solo se muestran cartas legales en esta identidad de color
        </div>
      </div>
    </div>`;

  const tipos = [...new Set(legales().map(c => c.t))].sort(
    (a,b) => ORDEN_TIPOS.indexOf(a) - ORDEN_TIPOS.indexOf(b));
  $("f-tipo").innerHTML = `<option value="">Todos</option>` +
    tipos.map(t => `<option value="${t}">${t}</option>`).join("");

  const subsUsados = {};
  legales().forEach(c => c.sb.forEach(s => subsUsados[s] = (subsUsados[s] || 0) + 1));
  $("f-sub").innerHTML = `<option value="">Todos</option>` +
    Object.keys(subsUsados).sort().map(s =>
      `<option value="${esc(s)}">${esc(s)} (${subsUsados[s]})</option>`).join("");

  render();
  guardar();
}

function pips(ci) {
  if (!ci) return `<span class="count">Incoloro</span>`;
  return ci.split("").map(c => {
    const a = META.simbolos && META.simbolos["{" + c + "}"];
    return a ? `<img src="assets/simbolos/${a}" alt="${c}" width="22" height="22"
                     style="width:22px;height:22px;margin-right:3px">` : c;
  }).join("");
}

/* Legal en Commander: la identidad de la carta cabe en la del comandante */
function legales() {
  const permitidos = (comandante.ci || "").split("").filter(Boolean);
  return CARDS.filter(c => {
    if (c.n === comandante.n) return false;
    return (c.ci || "").split("").filter(Boolean).every(x => permitidos.includes(x));
  });
}

function render() {
  const q = val("f-text").toLowerCase().trim();
  const tipo = val("f-tipo"), sub = val("f-sub");
  const cmin = val("f-cmin") === "" ? -1 : +val("f-cmin");
  const cmax = val("f-cmax") === "" ? 99 : +val("f-cmax");

  const vistos = new Set();
  filtradas = legales().filter(c => {
    if (vistos.has(c.n)) return false;      // una tarjeta por nombre
    if (q) {
      const enTexto = ORACLE_LISTO && (ORACLE[c.n] || "").toLowerCase().includes(q);
      if (!c.n.toLowerCase().includes(q) && !enTexto) return false;
    }
    if (tipo && c.t !== tipo) return false;
    if (sub && !c.sb.includes(sub)) return false;
    if (c.c !== "" && (c.c < cmin || c.c > cmax)) return false;
    vistos.add(c.n);
    return true;
  });

  const sorts = {
    name: (a,b) => a.n.localeCompare(b.n),
    cmc:  (a,b) => (a.c === "" ? 99 : a.c) - (b.c === "" ? 99 : b.c) || a.n.localeCompare(b.n),
    rarity:(a,b)=> ({mythic:0,rare:1,uncommon:2,common:3}[a.r] ?? 9) -
                   ({mythic:0,rare:1,uncommon:2,common:3}[b.r] ?? 9) || a.n.localeCompare(b.n),
  };
  filtradas.sort(sorts[val("f-sort")] || sorts.name);

  $("count").innerHTML = `<b>${filtradas.length}</b> cartas disponibles para este comandante`;

  const tope = filtradas.slice(0, 120);
  $("grid").innerHTML =
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:.9rem">` +
    tope.map(tarjeta).join("") + `</div>` +
    (filtradas.length > tope.length
      ? `<div class="count" style="text-align:center;margin-top:1rem">
         Mostrando ${tope.length} de ${filtradas.length}. Afina los filtros para ver más.</div>` : "");
  actualizarBarra();
}

function tarjeta(c) {
  const enMazo = mazo.get(c.n);
  const n = enMazo ? enMazo.q : 0;
  return `<div class="card ${n ? "picked" : ""}">
    <div class="pick" onclick="quitar('${esc(c.n).replace(/'/g,"\\'")}')"
         style="${n ? "" : "display:none"}">−</div>
    ${n ? `<div class="badge" style="background:var(--ok)">×${n}</div>` : ""}
    <div onclick="agregar('${esc(c.n).replace(/'/g,"\\'")}')">
      ${(c.id || c.ov) ? `<img src="${img(c,'normal')}" srcset="${srcset(c)}"
              sizes="(max-width:600px) 46vw, 210px" alt="${esc(c.n)}" loading="lazy">`
            : `<div class="noimg"><div style="font-size:1.5rem">🃏</div><div>${esc(c.n)}</div></div>`}
    </div>
    <div class="cfoot">
      <div class="nm">${esc(c.n)}</div>
      <div class="mt">${mana(c.mc)} · ${esBasica(c) ? "sin límite"
        : c.disp + " disponible" + (c.disp === 1 ? "" : "s")}</div>
      ${c.p ? `<div class="mt" style="color:var(--ok)">${usd(c.p)}</div>` : ""}
    </div>
  </div>`;
}

/* ── Reglas del mazo ─────────────────────────────────────────────────────── */

const esBasica = c => BASICAS.some(b => c.tl.includes("Basic Land — " + b) || c.n === b);

function agregar(nombre) {
  const c = CARDS.find(x => x.n === nombre);
  if (!c) return;
  const actual = mazo.get(nombre);

  if (actual) {
    // Repetir solo tiene sentido en básicas. Y las básicas no se limitan por
    // el inventario: siempre hay de sobra y hacen falta para cerrar el mazo.
    if (!esBasica(c)) { avisar(`${nombre}: en Commander solo se permite una copia.`); return; }
    if (total() >= 100) { avisar("El mazo ya tiene 100 cartas."); return; }
    actual.q++;
  } else {
    if (total() >= 100) { avisar("El mazo ya tiene 100 cartas."); return; }
    mazo.set(nombre, { c, q: 1 });
  }
  render(); guardar();
}

function quitar(nombre) {
  const e = mazo.get(nombre);
  if (!e) return;
  e.q--;
  if (e.q <= 0) mazo.delete(nombre);
  render(); guardar();
}

const total = () => 1 + [...mazo.values()].reduce((s,e) => s + e.q, 0);   // +1 comandante

function avisar(txt) {
  const el = $("aviso-legal");
  el.innerHTML = `<span style="color:var(--accent)">${esc(txt)}</span>`;
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => { el.innerHTML = ""; }, 4000);
}

function actualizarBarra() {
  const t = total();
  $("dk-total").textContent = t;
  $("dk-fill").style.width = Math.min(100, t) + "%";
  $("dk-fill").style.background = t === 100 ? "var(--ok)" : "var(--accent)";

  const tierras = [...mazo.values()].filter(e => e.c.t === "Land").reduce((s,e) => s + e.q, 0);
  const hechizos = [...mazo.values()].filter(e => e.c.t !== "Land" && e.c.c !== "");
  const cmc = hechizos.reduce((s,e) => s + e.c.c * e.q, 0);
  const nHech = hechizos.reduce((s,e) => s + e.q, 0);
  const valor = [...mazo.values()].reduce((s,e) => s + (e.c.p || 0) * e.q, 0)
              + (comandante && comandante.p ? comandante.p : 0);
  $("dk-detalle").textContent =
    `· ${tierras} tierras · CMC medio ${nHech ? (cmc/nHech).toFixed(2) : "0.00"}` +
    (valor ? ` · ${usd(valor)}` : "") +
    (t === 100 ? " · ¡completo!" : ` · faltan ${100 - t}`);
}


/* ── Asistente de tierras básicas ─────────────────────────────────────────
   Reparte las básicas en proporción a los símbolos de maná que pide el mazo,
   descontando las fuentes de color que ya aportan las tierras no básicas.
   Es el mismo criterio que usa cualquier guía de construcción: lo que manda
   no es cuántas cartas de cada color llevas, sino cuántos pips piden.
   ------------------------------------------------------------------------ */

const BASICA_DE = { W:"Plains", U:"Island", B:"Swamp", R:"Mountain", G:"Forest" };

function cartaBasica(nombre) {
  return CARDS.find(c => c.n === nombre && c.tl.includes("Basic Land"))
      || CARDS.find(c => c.n === nombre)
      // Si no tuviera ninguna en la colección, la creamos igualmente: las
      // básicas son ilimitadas y todo el mundo las consigue
      || { n: nombre, tl: `Basic Land — ${nombre}`, t: "Land", c: 0, mc: "",
           s: "", cn: "", r: "common", ci: "", sb: [], q: 0, disp: 0,
           id: "", ov: "", _i: -1 };
}

function calcularTierras() {
  const permitidos = (comandante.ci || "").split("").filter(Boolean);

  // Pips de cada color en el mazo, comandante incluido
  const pips = {}; permitidos.forEach(c => pips[c] = 0);
  const contar = (mc, q) => (mc || "").match(RE_SIMBOLO)?.forEach(sim =>
    permitidos.forEach(col => { if (sim.includes(col)) pips[col] += q; }));
  contar(comandante.mc, 1);
  [...mazo.values()].forEach(e => { if (e.c.t !== "Land") contar(e.c.mc, e.q); });
  const totalPips = permitidos.reduce((s,c) => s + pips[c], 0);

  // Cuántas tierras quiere el mazo según su curva
  const hech = [...mazo.values()].filter(e => e.c.t !== "Land" && e.c.c !== "");
  const nH = hech.reduce((s,e) => s + e.q, 0);
  const cmcMedio = nH ? hech.reduce((s,e) => s + e.c.c * e.q, 0) / nH : 3;
  const objetivo = cmcMedio < 2.5 ? 35 : cmcMedio > 3.5 ? 38 : 37;

  // Lo que ya aportan las tierras no básicas
  const noBasicas = [...mazo.values()].filter(e => e.c.t === "Land" && !esBasica(e.c));
  const nNoBasicas = noBasicas.reduce((s,e) => s + e.q, 0);
  const fuentesFijas = {}; permitidos.forEach(c => fuentesFijas[c] = 0);
  noBasicas.forEach(e => {
    const txt = ORACLE_LISTO ? (ORACLE[e.c.n] || "") : "";
    permitidos.forEach(col => {
      const basicaCol = BASICA_DE[col];
      if (e.c.tl.includes(basicaCol) ||
          /add\s+(?:\w+\s+){0,4}mana of any (?:one )?color/i.test(txt) ||
          txt.includes("{" + col + "}")) fuentesFijas[col] += e.q;
    });
  });

  const basicasActuales = [...mazo.values()]
    .filter(e => esBasica(e.c)).reduce((s,e) => s + e.q, 0);
  const otrasCartas = total() - basicasActuales;          // comandante incluido
  const huecos = Math.max(0, 100 - otrasCartas);
  const nBasicas = Math.max(0, Math.min(huecos, objetivo - nNoBasicas));

  // Reparto proporcional a los pips, descontando lo que ya cubren las duales
  const reparto = {};
  if (!permitidos.length || !totalPips) {
    reparto["Wastes"] = nBasicas;                          // mazo incoloro
  } else {
    const deseado = {}, sinAjustar = {};
    permitidos.forEach(col => {
      const cuota = pips[col] / totalPips * (nNoBasicas + nBasicas);
      sinAjustar[col] = Math.max(0, cuota - fuentesFijas[col]);
    });
    const suma = permitidos.reduce((s,c) => s + sinAjustar[c], 0) || 1;

    // Método del resto mayor: reparte los enteros y los sobrantes van a los
    // colores con mayor fracción pendiente
    let asignadas = 0;
    const restos = [];
    permitidos.forEach(col => {
      const exacto = sinAjustar[col] / suma * nBasicas;
      deseado[col] = Math.floor(exacto);
      asignadas += deseado[col];
      restos.push([col, exacto - Math.floor(exacto)]);
    });
    restos.sort((a,b) => b[1] - a[1]);
    for (let i = 0; asignadas < nBasicas; i++, asignadas++)
      deseado[restos[i % restos.length][0]]++;

    permitidos.forEach(col => { if (deseado[col] > 0) reparto[BASICA_DE[col]] = deseado[col]; });
  }

  return { reparto, nBasicas, objetivo, nNoBasicas, pips, totalPips,
           cmcMedio, huecos, basicasActuales, permitidos, fuentesFijas };
}

function proponerTierras() {
  const r = calcularTierras();
  const filas = r.permitidos.map(col => {
    const a = META.simbolos && META.simbolos["{" + col + "}"];
    const nombre = BASICA_DE[col];
    return `<tr>
      <td>${a ? `<img src="assets/simbolos/${a}" alt="${col}" width="18" height="18"
                      style="width:18px;height:18px">` : col}</td>
      <td>${nombre}</td>
      <td>${r.pips[col]}</td>
      <td>${r.fuentesFijas[col]}</td>
      <td><b style="color:var(--accent)">${r.reparto[nombre] || 0}</b></td>
    </tr>`;
  }).join("");

  const totalReparto = Object.values(r.reparto).reduce((s,v) => s + v, 0);

  $("modal").innerHTML = `<span class="close" onclick="cerrar()">&times;</span>
    <div class="info" style="flex:1">
      <h2>Completar la base de tierras</h2>
      <div class="count" style="margin-bottom:1rem">
        Reparto calculado según los símbolos de maná que pide tu mazo
      </div>
      ${r.permitidos.length ? `
        <table style="font-size:.85rem;margin-bottom:1rem">
          <thead><tr><th></th><th>Tierra</th><th>Pips</th><th>Ya cubierto</th><th>Añadir</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>`
      : `<div class="count" style="margin-bottom:1rem">
           Mazo incoloro: ${r.reparto["Wastes"] || 0} Wastes</div>`}

      <div class="kv"><span>Tierras recomendadas para tu curva</span>
        <span>${r.objetivo} (CMC medio ${r.cmcMedio.toFixed(2)})</span></div>
      <div class="kv"><span>Tierras no básicas que ya llevas</span><span>${r.nNoBasicas}</span></div>
      <div class="kv"><span>Básicas a añadir</span><span>${totalReparto}</span></div>
      <div class="kv"><span>El mazo quedaría en</span>
        <span>${total() - r.basicasActuales + totalReparto} / 100</span></div>

      <div class="count" style="margin:.9rem 0">
        Se reemplazan las básicas que tengas ahora. Las no básicas y los hechizos
        no se tocan.${ORACLE_LISTO ? "" : " Los textos aún se están cargando, así que las duales podrían no contarse."}
      </div>

      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn solid" onclick="aplicarTierras()">Aplicar reparto</button>
        <button class="btn" onclick="cerrar()">Cancelar</button>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}

function aplicarTierras() {
  const { reparto } = calcularTierras();
  [...mazo.keys()].forEach(n => { if (esBasica(mazo.get(n).c)) mazo.delete(n); });
  Object.entries(reparto).forEach(([nombre, q]) => {
    if (q > 0) mazo.set(nombre, { c: cartaBasica(nombre), q });
  });
  cerrar(); render(); guardar();
  avisar(`Base de tierras completada: ${Object.entries(reparto)
    .map(([n,q]) => `${q} ${n}`).join(", ")}`);
}

/* ── Mazo, exportación y guardado ────────────────────────────────────────── */

function textoMazo() {
  const valor = [...mazo.values()].reduce((s,e) => s + (e.c.p || 0) * e.q, 0)
              + (comandante.p || 0);
  const l = [];
  if (valor) l.push(`# Valor aproximado: ${usd(valor)}`, "");
  l.push(`1 ${comandante.n}${comandante.s ? ` (${comandante.s})` : ""}   # COMANDANTE`);
  ORDEN_TIPOS.forEach(t => {
    const grupo = [...mazo.values()].filter(e => e.c.t === t)
                                    .sort((a,b) => a.c.n.localeCompare(b.c.n));
    if (!grupo.length) return;
    l.push("", `// ${t}`);
    grupo.forEach(e => l.push(`${e.q} ${e.c.n}${e.c.s ? ` (${e.c.s})` : ""}`));
  });
  return l.join("\n");
}

function verMazo() {
  const t = total();
  const porTipo = ORDEN_TIPOS.map(tp => {
    const g = [...mazo.values()].filter(e => e.c.t === tp);
    if (!g.length) return "";
    const n = g.reduce((s,e) => s + e.q, 0);
    return `<div style="margin-bottom:.8rem">
      <div style="color:var(--accent);font-size:.8rem;text-transform:uppercase;
                  letter-spacing:.06em;margin-bottom:.3rem">${tp} (${n})</div>
      ${g.sort((a,b) => (a.c.c||0)-(b.c.c||0) || a.c.n.localeCompare(b.c.n)).map(e =>
        `<div style="display:flex;justify-content:space-between;gap:.5rem;padding:.15rem 0;font-size:.85rem">
           <span>${e.q}× ${esc(e.c.n)}</span>
           <span>${mana(e.c.mc)}${e.c.p
             ? ` <span style="color:var(--ok)">${usd(e.c.p * e.q)}</span>` : ""}</span>
         </div>`).join("")}
    </div>`;
  }).join("");

  $("modal").innerHTML = `<span class="close" onclick="cerrar()">&times;</span>
    <div class="info" style="flex:1">
      <h2>${esc(comandante.n)}</h2>
      <div class="count" style="margin-bottom:1rem">${t} / 100 cartas${(() => {
        const v = [...mazo.values()].reduce((s,e) => s + (e.c.p || 0) * e.q, 0)
                + (comandante.p || 0);
        return v ? ` · valor aproximado <b style="color:var(--ok)">${usd(v)}</b>` : "";
      })()}</div>
      ${porTipo || '<div class="count">El mazo está vacío.</div>'}
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn solid" onclick="copiar(this)">Copiar lista</button>
        <button class="btn" onclick="descargar()">Descargar TXT</button>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");

function descargar() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([textoMazo()], { type:"text/plain" }));
  a.download = "mazo_" + comandante.n.split(",")[0].toLowerCase().replace(/[^a-z0-9]+/g,"-") + ".txt";
  a.click(); URL.revokeObjectURL(a.href);
}

function copiar(btn) {
  navigator.clipboard.writeText(textoMazo()).then(() => {
    const t = btn.textContent; btn.textContent = "¡Copiado!";
    setTimeout(() => btn.textContent = t, 1500);
  }).catch(() => alert("El navegador bloqueó el portapapeles. Usa Descargar TXT."));
}

/* Guardado local para no perder el trabajo al recargar. Si el navegador lo
   bloquea (modo incógnito, permisos), simplemente no se guarda. */
function guardar() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify({
      cmd: comandante ? comandante.n : "",
      cartas: [...mazo.entries()].map(([n, e]) => [n, e.q])
    }));
  } catch {}
}

function restaurar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_GUARDADO) || "null");
    if (!d || !d.cmd) return;
    const c = CARDS.find(x => x.n === d.cmd);
    if (!c) return;
    comandante = c;
    mazo = new Map();
    d.cartas.forEach(([n, q]) => {
      const carta = CARDS.find(x => x.n === n);
      if (carta) mazo.set(n, { c: carta, q });
    });
    construir();
  } catch {}
}

/* ── Eventos ─────────────────────────────────────────────────────────────── */

function eventos() {
  ["f-text","f-cmin","f-cmax"].forEach(id => $(id).addEventListener("input", render));
  ["f-tipo","f-sub","f-sort"].forEach(id => $(id).addEventListener("change", render));

  $("cmd-go").addEventListener("click", () => elegirComandante($("cmd-input").value.trim()));
  $("cmd-input").addEventListener("keydown", e => {
    if (e.key === "Enter") elegirComandante($("cmd-input").value.trim());
  });
  $("cambiar-cmd").addEventListener("click", () => {
    if (mazo.size && !confirm("Se perderán las cartas que llevas. ¿Cambiar de comandante?")) return;
    comandante = null; mazo = new Map();
    $("paso-build").hidden = true; $("deckbar").hidden = true;
    $("paso-cmd").hidden = false; guardar();
  });

  $("dk-tierras").addEventListener("click", proponerTierras);
  $("dk-ver").addEventListener("click", verMazo);
  $("dk-txt").addEventListener("click", descargar);
  $("dk-copiar").addEventListener("click", e => copiar(e.target));
  $("dk-vaciar").addEventListener("click", () => {
    if (!mazo.size || !confirm("¿Vaciar el mazo?")) return;
    mazo = new Map(); render(); guardar();
  });

  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

if (typeof document !== "undefined" && $("loader")) iniciar();
