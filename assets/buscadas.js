/* ============================================================================
   Cartas que busco — proxies por sustituir y lista de deseos
   ========================================================================== */

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const RE_SIMBOLO = /\{[^}]+\}/g;

const usd = v => (v === null || v === undefined || !v) ? ""
  : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let META = null, CARTAS = [], ORACLE = null, ORACLE_LISTO = false;
let motivo = "todas", filtradas = [];

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

async function traer(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function iniciar() {
  try {
    $("loader-fill").style.width = "40%";
    META = await traer("data/meta.json");
    if (META.banner) { const h = $("hero"); h.src = META.banner; h.hidden = false;
                       $("titulo").style.fontSize = "1.4rem"; }
    $("pie").textContent = "Actualizada el " +
      new Date(META.generated_at).toLocaleDateString("es",
        { day:"numeric", month:"long", year:"numeric" });

    $("loader-fill").style.width = "80%";
    CARTAS = (await traer("data/buscadas.json")).cartas || [];

    $("loader").hidden = true;
    $("app").hidden = false;
    preparar();
    render();

    traer("data/oracle.json").then(d => { ORACLE = d.oracle || {}; ORACLE_LISTO = true; })
                             .catch(() => {});
  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>No hay lista de búsqueda todavía.</b><br>${e.message}<br><br>
      Crea el archivo <code>buscadas.txt</code> junto al script y vuelve a generar.</div>`;
  }
}

function preparar() {
  const mazos = [...new Set(CARTAS.map(c => c.mazo).filter(Boolean))].sort();
  $("f-mazo").innerHTML = `<option value="">Todos</option>` +
    `<option value="__sin__">Sin mazo (deseos)</option>` +
    mazos.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");

  const total = CARTAS.reduce((s,c) => s + c.q, 0);
  const px = CARTAS.filter(c => c.px).reduce((s,c) => s + c.q, 0);
  const notengo = CARTAS.filter(c => !c.tengo).length;
  $("stats").innerHTML = [
    [total, "Cartas buscadas"], [px, "Proxies por sustituir"],
    [mazos.length, "Mazos afectados"], [notengo, "No tengo ninguna"]
  ].map(([v,l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  $("f-text").addEventListener("input", render);
  $("f-mazo").addEventListener("change", render);
  $("f-sort").addEventListener("change", render);
  document.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-m]").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); motivo = b.dataset.m; render();
  }));
  $("copiar").addEventListener("click", e => {
    navigator.clipboard.writeText(texto()).then(() => {
      const t = e.target.textContent; e.target.textContent = "¡Copiado!";
      setTimeout(() => e.target.textContent = t, 1500);
    }).catch(() => alert("El navegador bloqueó el portapapeles."));
  });
  $("descargar").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto()], { type:"text/plain" }));
    a.download = "cartas_que_busco.txt"; a.click(); URL.revokeObjectURL(a.href);
  });
  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

const texto = () => filtradas.map(c =>
  `${c.q} ${c.n}${c.s ? ` (${c.s})` : ""}${c.mazo ? `   # ${c.mazo}` : ""}`).join("\n");

function render() {
  const q = $("f-text").value.toLowerCase().trim();
  const mazo = $("f-mazo").value;

  filtradas = CARTAS.filter(c => {
    if (q && !c.n.toLowerCase().includes(q)) return false;
    if (mazo === "__sin__" && c.mazo) return false;
    if (mazo && mazo !== "__sin__" && c.mazo !== mazo) return false;
    if (motivo === "proxy" && !c.px) return false;
    if (motivo === "deseo" && c.px) return false;
    if (motivo === "notengo" && c.tengo) return false;
    return true;
  });

  const sorts = {
    mazo: (a,b) => (a.mazo || "zzz").localeCompare(b.mazo || "zzz") || a.n.localeCompare(b.n),
    name: (a,b) => a.n.localeCompare(b.n),
    cmc:  (a,b) => (a.c ?? 99) - (b.c ?? 99) || a.n.localeCompare(b.n),
  };
  filtradas.sort(sorts[$("f-sort").value] || sorts.mazo);

  const copias = filtradas.reduce((s,c) => s + c.q, 0);
  const valor = filtradas.reduce((s,c) => s + (c.p || 0) * c.q, 0);
  $("count").innerHTML = `<b>${filtradas.length}</b> cartas distintas · <b>${copias}</b> copias buscadas` +
                         (valor ? ` · costarían <b>${usd(valor)}</b>` : "");

  if (!filtradas.length) {
    $("cartas").innerHTML = `<div class="empty">Nada coincide con estos filtros.</div>`;
    return;
  }

  if ($("f-sort").value === "mazo") {
    const grupos = {};
    filtradas.forEach(c => { const k = c.mazo || "Lista de deseos";
                             (grupos[k] = grupos[k] || []).push(c); });
    $("cartas").innerHTML = Object.keys(grupos).map(k => `
      <div class="type-section" style="margin-bottom:1.5rem">
        <div class="type-header" style="background:var(--surface);border-left:4px solid var(--accent);
             padding:.6rem .9rem;border-radius:8px;margin-bottom:.8rem;display:flex;
             justify-content:space-between;align-items:center">
          <h3 style="color:#fff;font-size:1rem">${esc(k)}</h3>
          <span class="count">${grupos[k].reduce((s,c)=>s+c.q,0)} cartas</span>
        </div>
        ${rejilla(grupos[k])}
      </div>`).join("");
  } else {
    $("cartas").innerHTML = rejilla(filtradas);
  }
}

const rejilla = arr =>
  `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:.9rem">` +
  arr.map(c => tarjeta(c)).join("") + `</div>`;

function tarjeta(c) {
  const i = CARTAS.indexOf(c);
  return `<div class="card" onclick="detalle(${i})">
    ${c.px ? `<div class="badge" style="left:5px;right:auto;background:var(--accent)">Proxy</div>` : ""}
    ${c.q > 1 ? `<div class="badge">×${c.q}</div>` : ""}
    ${c.id ? `<img src="${img(c.id,'normal')}" srcset="${srcset(c.id)}"
                   sizes="(max-width:600px) 46vw, 210px" alt="${esc(c.n)}" loading="lazy">`
           : `<div class="noimg"><div style="font-size:1.5rem">🃏</div><div>${esc(c.n)}</div></div>`}
    <div class="cfoot">
      <div class="nm">${esc(c.n)}</div>
      <div class="mt">${mana(c.mc)} ${c.s ? "· " + c.s : ""}${
        c.p ? ` · <span style="color:var(--ok)">${usd(c.p)}</span>` : ""}</div>
      <div class="mt" style="color:${c.tengo ? "var(--ok)" : "var(--text2)"}">
        ${c.tengo ? `Tengo ${c.tengo} en la colección` : "No la tengo"}
      </div>
    </div>
  </div>`;
}

function detalle(i) {
  const c = CARTAS[i];
  const kv = (k,v) => v ? `<div class="kv"><span>${k}</span><span>${v}</span></div>` : "";
  const texto = ORACLE_LISTO ? (ORACLE[c.n] || "") : "";
  $("modal").innerHTML = `
    <span class="close" onclick="cerrar()">&times;</span>
    ${c.id ? `<img src="${img(c.id,'large')}" alt="${esc(c.n)}">` : ""}
    <div class="info">
      <h2>${esc(c.n)}</h2>
      <div style="color:var(--text2);font-size:.85rem">${esc(c.tl)}</div>
      ${texto ? `<div class="ot">${mana(texto, true)}</div>` : ""}
      ${kv("Coste", mana(c.mc))}${kv("CMC", c.c)}
      ${kv("Precio de mercado", usd(c.p))}${kv("Busco", c.q + " copia(s)")}
      ${kv("Motivo", c.px ? `Proxy en el mazo ${c.mazo}` : "Lista de deseos")}
      ${kv("En mi colección", c.tengo ? `${c.tengo} copia(s)` : "ninguna")}
      ${kv("Edición preferida", c.s)}
      <div style="margin-top:1rem">
        <a class="btn" href="https://scryfall.com/search?q=${encodeURIComponent('!"'+c.n+'"')}"
           target="_blank" rel="noopener">Ver en Scryfall</a>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");

if (typeof document !== "undefined" && $("loader")) iniciar();
