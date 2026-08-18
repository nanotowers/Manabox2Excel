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
      </div>`).join("") + panelEstadisticas(m);
  } else {
    cartas.sort(sorts[orden] || sorts.name);
    $("d-cartas").innerHTML = rejilla(cartas) + panelEstadisticas(m);
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
      ${kv("Copias en el mazo", c.q)}${kv("Foil", c.f ? "Sí" : "")}
      <div style="margin-top:1rem">
        <a class="btn" href="https://scryfall.com/card/${(c.s||"").toLowerCase()}/${c.cn}"
           target="_blank" rel="noopener">Ver en Scryfall</a>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");

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
  $("d-export").addEventListener("click", () => {
    if (!actual) return;
    const txt = actual.lista.map(c =>
      `${c.q} ${c.n}${c.s ? ` (${c.s})` : ""}${c.cn ? ` ${c.cn}` : ""}${c.f ? " *F*" : ""}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type:"text/plain" }));
    a.download = actual.slug + ".txt"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

if (typeof document !== "undefined" && $("loader")) iniciar();
