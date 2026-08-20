/* ============================================================================
   Mis mazos Commander
   ----------------------------------------------------------------------------
   Dos vistas en una página: el listado de mazos y el detalle de uno concreto.
   El mazo activo va en el hash de la URL (#gishath), así que se puede enlazar
   un mazo suelto y el botón Atrás del navegador funciona como se espera.
   ========================================================================== */

const $ = id => document.getElementById(id);
const RAR_COLOR = { common:"#aaa", uncommon:"#8ab4f8", rare:"#ffd700",
                    mythic:"#ff8c00", special:"#9b59b6", bonus:"#3498db" };
const ORDEN_TIPOS = ["Commander","Planeswalker","Creature","Enchantment",
                     "Artifact","Instant","Sorcery","Land","Other"];
const COLOR_TIPO = {
  Commander:"#e94560", Planeswalker:"#b5451b", Creature:"#16213e",
  Enchantment:"#2d6a4f", Artifact:"#4a4e69", Instant:"#0f3460",
  Sorcery:"#533483", Land:"#6b4226", Other:"#3d3d3d"
};
const COLOR_MANA = { W:"#f8f6d8", U:"#c1d7e9", B:"#6b6b6b", R:"#e4a08a", G:"#a3c095", C:"#cac5c0" };

const usd = v => (v === null || v === undefined || !v) ? ""
  : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let META = null, MAZOS = [], ORACLE = null, ORACLE_LISTO = false;
let actual = null;

const RE_SIMBOLO = /\{[^}]+\}/g;
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

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

function img(id, tam) {
  if (!id || id.length < 2) return "";
  const base = (META && META.img_base) || "https://cards.scryfall.io/";
  return `${base}${tam}/front/${id[0]}/${id[1]}/${id}.jpg`;
}
const srcset = id => id
  ? `${img(id,"small")} 146w, ${img(id,"normal")} 488w, ${img(id,"large")} 672w` : "";

/* ── Carga ───────────────────────────────────────────────────────────────── */

async function traer(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function iniciar() {
  try {
    $("loader-fill").style.width = "30%";
    META = await traer("data/meta.json");
    if (META.banner) {
      const h = $("hero");
      h.src = META.banner; h.hidden = false;
      $("titulo").style.fontSize = "1.4rem";
    }
    $("pie").textContent = "Actualizada el " +
      new Date(META.generated_at).toLocaleDateString("es",
        { day:"numeric", month:"long", year:"numeric" });

    $("loader-fill").style.width = "70%";
    const doc = await traer("data/mazos.json");
    MAZOS = doc.mazos || [];

    $("loader").hidden = true;
    pintarStats();
    eventos();
    ruta();

    traer("data/oracle.json").then(d => { ORACLE = d.oracle || {}; ORACLE_LISTO = true; })
                             .catch(() => {});
  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>No se pudieron cargar los mazos.</b><br>${e.message}<br><br>
      Si todavía no has marcado ningún binder con el prefijo del script en Manabox,
      este archivo aún no existe. También puede ser que estés abriendo la página
      desde el disco: necesita un servidor.</div>`;
  }
}

function pintarStats() {
  const cartas = MAZOS.reduce((s,m) => s + m.copias, 0);
  $("stats").innerHTML = [
    [MAZOS.length, "Mazos armados"], [cartas, "Cartas en mazos"]
  ].map(([v,l]) => `<div class="stat"><b>${v.toLocaleString("es")}</b><span>${l}</span></div>`).join("");
}

/* ── Listado ─────────────────────────────────────────────────────────────── */

function pips(ci) {
  if (!ci) return `<span style="color:var(--text2);font-size:.72rem">Incoloro</span>`;
  return ci.split("").map(c => {
    const a = META.simbolos && META.simbolos["{" + c + "}"];
    return a ? `<img src="assets/simbolos/${a}" alt="${c}" width="18" height="18"
                     style="width:18px;height:18px;display:inline-block;margin-right:2px">`
             : c;
  }).join("");
}

function verListado() {
  actual = null;
  $("detalle").hidden = true;
  $("lista-mazos").hidden = false;

  const q = $("buscar-mazo").value.toLowerCase().trim();
  const vis = MAZOS.filter(m => !q || m.nombre.toLowerCase().includes(q)
                             || (m.comandante || "").toLowerCase().includes(q));

  $("count-mazos").innerHTML = `<b>${vis.length}</b> mazo(s)`;
  $("mazos-grid").innerHTML = vis.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem">` +
      vis.map(m => `
        <div class="card" onclick="abrirMazo('${m.slug}')" style="cursor:pointer">
          ${m.portada
            ? `<img src="${img(m.portada,"normal")}" srcset="${srcset(m.portada)}"
                    sizes="230px" alt="${esc(m.nombre)}" loading="lazy">`
            : `<div class="noimg"><div style="font-size:1.6rem">🎴</div></div>`}
          <div class="cfoot" style="padding:.6rem">
            <div class="nm" style="font-size:.9rem">${esc(m.nombre)}</div>
            <div class="mt" style="margin:.35rem 0">${pips(m.ci)}</div>
            ${m.comandante
              ? `<div class="mt">${esc(m.comandante)}</div>`
              : `<div class="mt" style="color:var(--accent)">Comandante sin identificar</div>`}
            <div class="mt" style="margin-top:.3rem">${m.copias} cartas${
              m.proxies ? ` · ${m.proxies} proxies` : ""} · CMC ${m.cmc_medio}</div>
            ${m.valor_usd ? `<div class="mt" style="color:var(--ok)">${usd(m.valor_usd)}</div>` : ""}
          </div>
        </div>`).join("") + `</div>`
    : `<div class="empty">Ningún mazo coincide con esa búsqueda.</div>`;
}

/* ── Detalle ─────────────────────────────────────────────────────────────── */

function abrirMazo(slug) {
  location.hash = slug;   // el resto lo hace ruta()
}

function verMazo(m) {
  actual = m;
  $("lista-mazos").hidden = true;
  $("detalle").hidden = false;
  window.scrollTo(0, 0);

  const tipos = ORDEN_TIPOS.filter(t => m.tipos[t]);
  $("d-tipo").innerHTML = `<option value="">Todos los tipos</option>` +
    tipos.map(t => `<option value="${t}">${t} (${m.tipos[t]})</option>`).join("");

  const g = m.guia || {};
  const tieneGuia = !!(g.texto || g.audio || (g.imagenes || []).length);
  $("d-tabs").innerHTML = `
    <button class="chip on" id="tab-mazo">Mazo</button>
    <button class="chip" id="tab-guia">Guía${tieneGuia ? "" : " ·"}</button>`;
  $("tab-mazo").onclick = () => {
    $("tab-mazo").classList.add("on"); $("tab-guia").classList.remove("on");
    $("d-filtros").hidden = false; pintarCartas();
  };
  $("tab-guia").onclick = () => {
    $("tab-guia").classList.add("on"); $("tab-mazo").classList.remove("on");
    $("d-filtros").hidden = true; verGuia(m);
  };

  $("d-cabecera").innerHTML = `
    <div class="panel" style="display:flex;gap:1.25rem;flex-wrap:wrap;align-items:center">
      ${m.portada ? `<img src="${img(m.portada,"normal")}" alt="" style="width:150px;border-radius:10px">` : ""}
      <div style="flex:1;min-width:220px">
        <h2 style="color:#fff;margin-bottom:.3rem">${esc(m.nombre)}</h2>
        ${m.comandante ? `<div style="color:var(--text2);font-size:.9rem;margin-bottom:.5rem">
          Comandante: <b style="color:var(--text)">${esc(m.comandante)}</b></div>` : ""}
        ${m.aviso ? `<div style="color:var(--accent);font-size:.78rem;margin-bottom:.5rem">
          ⚠ ${esc(m.aviso)}</div>` : ""}
        <div style="margin-bottom:.6rem">${pips(m.ci)}</div>
        <div class="count"><b>${m.copias}</b> cartas${m.proxies
            ? ` (<b style="color:var(--accent)">${m.proxies} proxies</b>)` : ""} ·
          CMC medio <b>${m.cmc_medio}</b> ·
          ${m.valor_usd ? `valor <b style="color:var(--ok)">${usd(m.valor_usd)}</b> · ` : ""}
          ${tipos.map(t => `${t} ${m.tipos[t]}`).join(" · ")}</div>
      </div>
    </div>`;
  pintarCartas();
}

function pintarCartas() {
  const m = actual;
  const tipo = $("d-tipo").value;
  const orden = $("d-sort").value;
  let cartas = m.lista.filter(c => !tipo || c.t === tipo);

  const sorts = {
    cmc:  (a,b) => (a.c ?? 99) - (b.c ?? 99) || a.n.localeCompare(b.n),
    name: (a,b) => a.n.localeCompare(b.n),
  };

  if (orden === "tipo") {
    // El comandante va aparte, arriba del todo; el resto por grupos
    const grupos = {};
    cartas.forEach(c => {
      const k = c.cmd ? "Commander" : c.t;
      (grupos[k] = grupos[k] || []).push(c);
    });
    Object.values(grupos).forEach(g => g.sort((a,b) =>
      (a.c ?? 99) - (b.c ?? 99) || a.n.localeCompare(b.n)));

    $("d-cartas").innerHTML = ORDEN_TIPOS.filter(t => grupos[t]).map(t => `
      <div style="margin-bottom:1.6rem">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.7rem;
                    padding:.5rem .8rem;border-radius:8px;
                    background:${COLOR_TIPO[t]}33;border-left:4px solid ${COLOR_TIPO[t]}">
          <h3 style="color:#fff;font-size:1rem">${t === "Commander" ? "Comandante" : t}</h3>
          <span class="count">${grupos[t].reduce((s,c)=>s+c.q,0)}</span>
        </div>
        ${rejilla(grupos[t])}
      </div>`).join("") + panelMetricas(m) + panelEstadisticas(m);
  } else {
    cartas.sort(sorts[orden] || sorts.name);
    $("d-cartas").innerHTML = rejilla(cartas) + panelMetricas(m) + panelEstadisticas(m);
  }
}

const rejilla = arr =>
  `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:.9rem">` +
  arr.map(tarjetaCarta).join("") + `</div>`;

function tarjetaCarta(c) {
  const i = actual.lista.indexOf(c);
  return `<div class="card" onclick="detalleCarta(${i})">
    ${c.cmd ? `<div class="badge" style="left:5px;right:auto;background:var(--accent)">Comandante</div>`
            : c.px ? `<div class="badge" style="left:5px;right:auto;background:#7a5c00">Proxy</div>` : ""}
    ${c.f ? '<div class="badge foil">✦</div>' : ""}
    ${c.q > 1 ? `<div class="badge" style="top:auto;bottom:44px">×${c.q}</div>` : ""}
    ${c.id ? `<img src="${img(c.id,"normal")}" srcset="${srcset(c.id)}"
                   sizes="(max-width:600px) 46vw, 210px" alt="${esc(c.n)}" loading="lazy">`
           : `<div class="noimg"><div style="font-size:1.5rem">🃏</div><div>${esc(c.n)}</div></div>`}
    <div class="cfoot">
      <div class="nm">${esc(c.n)}</div>
      <div class="mt">${mana(c.mc)} ${c.s ? "· " + c.s : ""}</div>
    </div>
  </div>`;
}

/* ── Estadísticas del mazo ───────────────────────────────────────────────── */

function estadisticas(m) {
  const curva = {}, tipos = {}, simbolos = {};
  let tierras = 0, sumaCmc = 0, conCmc = 0;

  m.lista.forEach(c => {
    const q = c.q || 1;
    tipos[c.t] = (tipos[c.t] || 0) + q;

    if (c.t === "Land") { tierras += q; }
    else if (c.c !== null && c.c !== undefined && c.c !== "") {
      const k = Math.min(7, Math.floor(c.c));   // 7 agrupa "7 o más"
      curva[k] = (curva[k] || 0) + q;
      sumaCmc += c.c * q; conCmc += q;
    }

    // Cuenta de símbolos de color en los costes: es lo que de verdad dice
    // cuánta tierra de cada color necesita el mazo
    (c.mc || "").match(/\{[^}]+\}/g)?.forEach(sim => {
      "WUBRG".split("").forEach(col => {
        if (sim.includes(col)) simbolos[col] = (simbolos[col] || 0) + q;
      });
    });
  });

  return { curva, tipos, simbolos, tierras,
           cmcMedio: conCmc ? (sumaCmc / conCmc) : 0, conCmc };
}


/* ── Métricas de salud del mazo ───────────────────────────────────────────
   Tres indicadores que responden preguntas reales, en vez de contar cartas:
     1. Fuentes por color frente a los símbolos que pide la curva
     2. Probabilidad de mano jugable (distribución hipergeométrica)
     3. Dependencia del comandante: cuánto se cae el mazo si te lo matan
   ------------------------------------------------------------------------ */

const TIPOS_BASICA = { Plains:"W", Island:"U", Swamp:"B", Mountain:"R", Forest:"G" };

/* Combinatoria en logaritmos: con mazos de 100 cartas los factoriales se
   desbordan enseguida y las probabilidades salen mal. */
function logFact(n) {
  let r = 0;
  for (let i = 2; i <= n; i++) r += Math.log(i);
  return r;
}
const logComb = (n, k) => (k < 0 || k > n) ? -Infinity
  : logFact(n) - logFact(k) - logFact(n - k);

/* P(exactamente k éxitos al robar n cartas de un mazo de N con K éxitos) */
function hiper(N, K, n, k) {
  const l = logComb(K, k) + logComb(N - K, n - k) - logComb(N, n);
  return isFinite(l) ? Math.exp(l) : 0;
}
function pEntre(N, K, n, kmin, kmax) {
  let p = 0;
  for (let k = kmin; k <= Math.min(kmax, n, K); k++) p += hiper(N, K, n, k);
  return p;
}
const pAlMenos = (N, K, n, kmin) => pEntre(N, K, n, kmin, n);

/* Fuentes de maná de cada color: tierras básicas por su subtipo, y cualquier
   carta cuyo texto añada ese color (duales, rocas, criaturas de maná). */
function fuentesPorColor(m) {
  const f = { W:0, U:0, B:0, R:0, G:0 };
  m.lista.forEach(c => {
    const q = c.q || 1;
    const colores = new Set();

    Object.keys(TIPOS_BASICA).forEach(sub => {
      if ((c.tl || "").includes(sub)) colores.add(TIPOS_BASICA[sub]);
    });

    const txt = (ORACLE_LISTO && ORACLE[c.n]) ? ORACLE[c.n] : "";
    if (txt) {
      // Exigimos que "any color" venga detrás de "add": si no, se colaría
      // texto como "protection from any color", que no produce maná
      if (/add\s+(?:\w+\s+){0,4}mana of any (?:one )?color/i.test(txt))
        "WUBRG".split("").forEach(x => colores.add(x));
      const añade = txt.match(/add\s+((?:\{[^}]+\}|\s|or)+)/gi) || [];
      añade.forEach(frag => "WUBRG".split("").forEach(x => {
        if (frag.includes("{" + x + "}") || frag.includes("/" + x + "}")) colores.add(x);
      }));
    }
    colores.forEach(x => { if (f[x] !== undefined) f[x] += q; });
  });
  return f;
}

/* Cartas que solo funcionan con el comandante en mesa: mencionan su nombre o
   dependen del "commander" genérico. Es el punto único de fallo del mazo. */
function dependenciaComandante(m) {
  if (!ORACLE_LISTO || !m.comandante) return null;
  const nombres = m.comandante.split(" + ").map(n => n.split(",")[0].trim().toLowerCase());
  let dependientes = 0, total = 0;
  const ejemplos = [];
  m.lista.forEach(c => {
    if (c.cmd) return;
    total += c.q || 1;
    const txt = (ORACLE[c.n] || "").toLowerCase();
    if (!txt) return;
    const menciona = nombres.some(n => n && txt.includes(n));
    const generico = /your commander|commander creature|commander you control|commander's/.test(txt);
    if (menciona || generico) {
      dependientes += c.q || 1;
      if (ejemplos.length < 8) ejemplos.push(c.n);
    }
  });
  return { dependientes, total, pct: total ? dependientes / total * 100 : 0, ejemplos };
}

function panelMetricas(m) {
  const e = estadisticas(m);
  const total = m.copias || m.lista.reduce((s,c) => s + c.q, 0);
  const tierras = e.tierras;

  // 1. Mano jugable: 3 a 5 tierras en las 7 iniciales
  const pJugable = pEntre(total, tierras, 7, 3, 5) * 100;
  const pSinTierra = pEntre(total, tierras, 7, 0, 1) * 100;
  const pInundada = pAlMenos(total, tierras, 7, 6) * 100;

  const semaforo = v => v >= 85 ? "var(--ok)" : v >= 70 ? "#d4a017" : "var(--accent)";

  const f = fuentesPorColor(m);
  const filasColor = "WUBRG".split("").filter(c => e.simbolos[c] || f[c]).map(c => {
    const arch = META.simbolos && META.simbolos["{" + c + "}"];
    // Probabilidad de tener al menos una fuente de ese color en el turno 3
    const pT3 = pAlMenos(total, f[c], 9, 1) * 100;
    return `<tr>
      <td>${arch ? `<img src="assets/simbolos/${arch}" alt="${c}" width="18" height="18"
                        style="width:18px;height:18px">` : c}</td>
      <td><b>${f[c]}</b></td>
      <td>${e.simbolos[c] || 0}</td>
      <td style="color:${semaforo(pT3)}">${pT3.toFixed(0)}%</td>
    </tr>`;
  }).join("");

  const dep = dependenciaComandante(m);

  return `
  <div class="panel" style="margin-top:1.25rem">
    <h3 style="color:#fff;margin-bottom:.4rem">Salud del mazo</h3>
    <div class="count" style="margin-bottom:1rem">
      Indicadores calculados sobre las ${total} cartas del mazo
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1.75rem">

      <div>
        <div class="fgroup"><label>Mano inicial</label></div>
        <div style="font-size:2.4rem;font-weight:700;color:${semaforo(pJugable)};line-height:1.1">
          ${pJugable.toFixed(1)}%
        </div>
        <div class="count" style="margin-bottom:.7rem">manos jugables (3-5 tierras de 7)</div>
        <div class="kv"><span>Riesgo de mano seca (0-1 tierras)</span><span>${pSinTierra.toFixed(1)}%</span></div>
        <div class="kv"><span>Riesgo de inundación (6+ tierras)</span><span>${pInundada.toFixed(1)}%</span></div>
        <div class="kv"><span>Tierras en el mazo</span><span>${tierras} de ${total}</span></div>
        <div class="count" style="margin-top:.6rem">Por encima del 85% se considera sano</div>
      </div>

      <div>
        <div class="fgroup" style="margin-bottom:.5rem"><label>Fuentes por color</label></div>
        <table style="font-size:.8rem">
          <thead><tr><th></th><th>Fuentes</th><th>Pips</th><th>Turno 3</th></tr></thead>
          <tbody>${filasColor || '<tr><td colspan="4">Mazo incoloro</td></tr>'}</tbody>
        </table>
        <div class="count" style="margin-top:.6rem">
          "Turno 3" es la probabilidad de tener al menos una fuente de ese color
          habiendo visto 9 cartas${ORACLE_LISTO ? "" : " · cargando textos..."}
        </div>
      </div>

      <div>
        <div class="fgroup" style="margin-bottom:.5rem"><label>Dependencia del comandante</label></div>
        ${dep ? `
          <div style="font-size:2.4rem;font-weight:700;line-height:1.1;
                      color:${dep.pct > 35 ? "var(--accent)" : dep.pct > 20 ? "#d4a017" : "var(--ok)"}">
            ${dep.pct.toFixed(0)}%
          </div>
          <div class="count" style="margin-bottom:.7rem">
            ${dep.dependientes} de ${dep.total} cartas lo necesitan en mesa
          </div>
          ${dep.ejemplos.length ? `<div class="count" style="line-height:1.6">
            ${dep.ejemplos.map(esc).join(" · ")}${dep.dependientes > dep.ejemplos.length ? "…" : ""}
          </div>` : ""}
          <div class="count" style="margin-top:.6rem">
            Cuanto más alta, más protección conviene llevar
          </div>`
        : `<div class="count">Necesita los textos de las cartas${
             m.comandante ? " (cargando...)" : " y un comandante identificado"}</div>`}
      </div>

    </div>
  </div>`;
}

function panelEstadisticas(m) {
  const e = estadisticas(m);
  const maxCurva = Math.max(1, ...Object.values(e.curva));
  const totalSim = Object.values(e.simbolos).reduce((a,b) => a+b, 0) || 1;
  const maxTipo = Math.max(1, ...Object.values(e.tipos));

  const barrasCurva = [0,1,2,3,4,5,6,7].map(k => {
    const v = e.curva[k] || 0;
    const alto = Math.round((v / maxCurva) * 110);
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:.3rem;flex:1">
      <div style="font-size:.72rem;color:var(--text2)">${v || ""}</div>
      <div style="width:100%;max-width:38px;height:${alto}px;min-height:${v?4:0}px;
                  background:linear-gradient(180deg,var(--accent),#8e2b3c);border-radius:4px 4px 0 0"></div>
      <div style="font-size:.72rem;color:var(--text2)">${k === 7 ? "7+" : k}</div>
    </div>`;
  }).join("");

  const barrasTipo = ORDEN_TIPOS.filter(t => e.tipos[t]).map(t => `
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem">
      <span style="width:96px;font-size:.75rem;color:var(--text2)">${t === "Commander" ? "Comandante" : t}</span>
      <div style="flex:1;background:var(--surface2);border-radius:4px;height:14px;overflow:hidden">
        <div style="width:${(e.tipos[t]/maxTipo*100).toFixed(1)}%;height:100%;
                    background:${COLOR_TIPO[t]}"></div>
      </div>
      <b style="font-size:.78rem;width:26px;text-align:right">${e.tipos[t]}</b>
    </div>`).join("");

  const barrasColor = "WUBRG".split("").filter(c => e.simbolos[c]).map(c => {
    const arch = META.simbolos && META.simbolos["{" + c + "}"];
    const pct = (e.simbolos[c] / totalSim * 100);
    return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem">
      ${arch ? `<img src="assets/simbolos/${arch}" alt="${c}" width="18" height="18"
                     style="width:18px;height:18px">` : `<span style="width:18px">${c}</span>`}
      <div style="flex:1;background:var(--surface2);border-radius:4px;height:14px;overflow:hidden">
        <div style="width:${pct.toFixed(1)}%;height:100%;background:${COLOR_MANA[c]}"></div>
      </div>
      <b style="font-size:.78rem;width:52px;text-align:right">${e.simbolos[c]} · ${pct.toFixed(0)}%</b>
    </div>`;
  }).join("");

  return `
  <div class="panel" style="margin-top:2rem">
    <h3 style="color:#fff;margin-bottom:1rem">Estadísticas del mazo</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.75rem">

      <div>
        <div class="fgroup"><label>Curva de maná (sin tierras)</label></div>
        <div style="display:flex;align-items:flex-end;gap:.35rem;height:160px;margin-top:.5rem">
          ${barrasCurva}
        </div>
        <div class="count" style="margin-top:.5rem">
          CMC medio <b>${e.cmcMedio.toFixed(2)}</b> · <b>${e.conCmc}</b> hechizos ·
          <b>${e.tierras}</b> tierras
        </div>
      </div>

      <div>
        <div class="fgroup" style="margin-bottom:.6rem"><label>Reparto por tipo</label></div>
        ${barrasTipo}
      </div>

      <div>
        <div class="fgroup" style="margin-bottom:.6rem"><label>Símbolos de maná en los costes</label></div>
        ${barrasColor || '<div class="count">Mazo sin símbolos de color</div>'}
        <div class="count" style="margin-top:.6rem">
          Proporción útil para repartir las tierras de cada color
        </div>
      </div>

    </div>
  </div>`;
}

function detalleCarta(i) {
  const c = actual.lista[i];
  const kv = (k,v) => v ? `<div class="kv"><span>${k}</span><span>${v}</span></div>` : "";
  const texto = ORACLE_LISTO ? (ORACLE[c.n] || "") : "";
  $("modal").innerHTML = `
    <span class="close" onclick="cerrar()">&times;</span>
    ${c.id ? `<img src="${img(c.id,"large")}" alt="${esc(c.n)}">` : ""}
    <div class="info">
      <h2>${esc(c.n)}</h2>
      <div style="color:var(--text2);font-size:.85rem">${esc(c.tl)}</div>
      ${texto ? `<div class="ot">${mana(texto, true)}</div>` : ""}
      ${kv("Coste", mana(c.mc))}${kv("CMC", c.c)}${kv("Fuerza/Resistencia", c.pt)}
      ${kv("Identidad de color", c.ci || "Incolora")}${kv("Rareza", c.r)}
      ${kv("Edición", c.s + (c.cn ? " · #" + c.cn : ""))}
      ${kv("Precio de mercado", usd(c.p))}${kv("Copias en el mazo", c.q)}${kv("Foil", c.f ? "Sí" : "")}
      <div style="margin-top:1rem">
        <a class="btn" href="https://scryfall.com/card/${(c.s||"").toLowerCase()}/${c.cn}"
           target="_blank" rel="noopener">Ver en Scryfall</a>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");


/* ── Guía del mazo ───────────────────────────────────────────────────────
   Material de apoyo en ColeccionWeb/guias/: texto en markdown, un podcast
   y las infografías que quieras. Se detectan por el slug del mazo. */

function md(texto) {
  const lineas = esc(texto).split("\n");
  let html = "", enLista = false;
  const inline = t => t
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<i>$2</i>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((https?:[^)]+)\)/g,
             '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');

  for (let l of lineas) {
    l = l.trimEnd();
    const li = l.match(/^\s*[-*+]\s+(.*)$/);
    if (li) {
      if (!enLista) { html += "<ul style='margin:.4rem 0 .8rem 1.2rem'>"; enLista = true; }
      html += `<li style="margin:.2rem 0">${inline(li[1])}</li>`;
      continue;
    }
    if (enLista) { html += "</ul>"; enLista = false; }

    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const n = h[1].length;
      const tam = [1.5, 1.25, 1.05, .95][n - 1];
      html += `<h${n} style="color:#fff;font-size:${tam}rem;margin:1.2rem 0 .5rem">${inline(h[2])}</h${n}>`;
    } else if (!l.trim()) {
      html += "";
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      html += `<hr style="border:none;border-top:1px solid var(--border);margin:1rem 0">`;
    } else {
      html += `<p style="margin:.5rem 0;line-height:1.65">${inline(l)}</p>`;
    }
  }
  if (enLista) html += "</ul>";
  return html;
}

async function verGuia(m) {
  const g = m.guia || {};
  const tieneAlgo = !!(g.texto || g.audio || (g.imagenes || []).length);

  // Sin material todavía: en vez de un hueco vacío, una página de cortesía
  if (!tieneAlgo) {
    $("d-cartas").innerHTML = `
      <div class="panel" style="text-align:center;padding:1.5rem 1rem">
        <img src="assets/banner-proximamente.jpg"
             alt="Estamos trabajando en nuevo contenido"
             style="width:100%;max-width:1000px;border-radius:14px;
                    box-shadow:0 10px 34px rgba(0,0,0,.6);margin-bottom:1.5rem">
        <h2 style="color:#fff;margin-bottom:.5rem">
          La guía de ${esc(m.nombre)} está en preparación
        </h2>
        <p style="color:var(--text2);max-width:620px;margin:0 auto 1.5rem;line-height:1.7">
          Estoy grabando el podcast, armando las infografías y escribiendo el manual
          de pilotaje de este mazo. Vuelve pronto.
        </p>
        <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap">
          <button class="btn solid" onclick="document.getElementById('tab-mazo').click()">
            Ver la lista del mazo</button>
          <a class="btn" href="mazos.html">Otros mazos</a>
        </div>
        <div class="count" style="margin-top:1.75rem;opacity:.55">
          Para publicarla: añade <code>guias/${m.slug}.md</code>,
          <code>guias/${m.slug}.mp3</code> o <code>guias/${m.slug}-1.png</code>
        </div>
      </div>`;
    return;
  }

  let texto = "";
  if (g.texto) {
    try {
      const r = await fetch(g.texto, { cache: "no-cache" });
      if (r.ok) texto = await r.text();
    } catch {}
  }
  $("d-cartas").innerHTML = `
    <div class="panel">
      ${g.audio ? `
        <div style="margin-bottom:1.5rem">
          <div class="fgroup" style="margin-bottom:.5rem"><label>Podcast del mazo</label></div>
          <audio controls preload="none" style="width:100%">
            <source src="${g.audio}">
          </audio>
        </div>` : ""}
      ${texto ? `<div style="max-width:820px">${md(texto)}</div>` : ""}
      ${(g.imagenes || []).length ? `
        <div style="margin-top:1.5rem">
          <div class="fgroup" style="margin-bottom:.6rem"><label>Infografías</label></div>
          ${g.imagenes.map(src => `
            <img src="${src}" alt="Infografía" loading="lazy"
                 onclick="window.open('${src}','_blank')"
                 style="width:100%;max-width:900px;border-radius:12px;margin-bottom:1rem;
                        cursor:zoom-in;display:block">`).join("")}
        </div>` : ""}
    </div>`;
}

/* ── Exportación en CSV con todo el detalle, para dárselo a una IA ──────── */

function csvMazo(m) {
  const cols = ["is_commander","proxy","qty","name","foil","mana_cost","cmc","type_line",
                "oracle_text","power_toughness","color_identity","rarity","set_code",
                "collector_number","card_type","precio_usd"];
  const escapa = v => {
    const t = (v === null || v === undefined) ? "" : String(v);
    return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const filas = m.lista.map(c => [
    c.cmd ? "YES" : "", c.px ? "YES" : "", c.q, c.n, c.f ? "FOIL" : "",
    c.mc, (c.c ?? ""), c.tl,
    (ORACLE_LISTO ? (ORACLE[c.n] || "") : "").replace(/\r?\n/g, " / "),
    c.pt, c.ci, c.r, c.s, c.cn, c.t, (c.p ?? "")
  ].map(escapa).join(","));

  const cabecera = [
    `# Mazo: ${m.nombre}`,
    `# Comandante: ${m.comandante || "sin identificar"}`,
    `# Identidad de color: ${m.ci || "incolora"}`,
    `# Cartas: ${m.copias} (${m.proxies || 0} proxies)`,
    `# CMC medio: ${m.cmc_medio}`,
    `# Valor estimado: ${usd(m.valor_usd) || "n/d"}`,
    `# Generado: ${new Date().toISOString().slice(0,10)}`,
  ].join("\n");

  return cabecera + "\n" + cols.join(",") + "\n" + filas.join("\n");
}

/* ── Navegación por hash ─────────────────────────────────────────────────── */

function ruta() {
  const slug = decodeURIComponent(location.hash.replace("#", ""));
  const m = MAZOS.find(x => x.slug === slug);
  m ? verMazo(m) : verListado();
}

function eventos() {
  window.addEventListener("hashchange", ruta);
  $("volver").addEventListener("click", () => { location.hash = ""; });
  $("buscar-mazo").addEventListener("input", verListado);
  $("d-tipo").addEventListener("change", pintarCartas);
  $("d-sort").addEventListener("change", pintarCartas);
  const bajar = (contenido, nombre, tipo) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre; a.click(); URL.revokeObjectURL(a.href);
  };

  $("d-export").addEventListener("click", () => {
    if (!actual) return;
    bajar(actual.lista.map(c =>
      `${c.q} ${c.n}${c.s ? ` (${c.s})` : ""}${c.cn ? ` ${c.cn}` : ""}${c.f ? " *F*" : ""}`).join("\n"),
      actual.slug + ".txt", "text/plain");
  });

  $("d-csv").addEventListener("click", () => {
    if (!actual) return;
    if (!ORACLE_LISTO) {
      alert("Los textos de las cartas todavía se están cargando. Prueba en unos segundos.");
      return;
    }
    // BOM para que Excel respete los acentos al abrirlo
    bajar("\ufeff" + csvMazo(actual), actual.slug + "_completo.csv", "text/csv;charset=utf-8");
  });
  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

if (typeof document !== "undefined" && $("loader")) iniciar();
