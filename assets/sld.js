/* ============================================================================
   Galería SLD — vitrina de Secret Lair
   ----------------------------------------------------------------------------
   Lee el mismo cards.json que la portada, pero se queda solo con las cartas
   marcadas como vitrina. No hay lista de intercambio aquí a propósito: estas
   cartas no se cambian, se enseñan.
   ========================================================================== */

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const RE_SIMBOLO = /\{[^}]+\}/g;
const usd = v => (v === null || v === undefined || !v) ? ""
  : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let META = null, CARTAS = [], ORACLE = null, ORACLE_LISTO = false;
let colores = new Set(), onlyFoil = false, filtradas = [];

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

async function iniciar() {
  try {
    $("loader-fill").style.width = "35%";
    META = await traer("data/meta.json");
    $("pie").textContent = "Actualizada el " +
      new Date(META.generated_at).toLocaleDateString("es",
        { day:"numeric", month:"long", year:"numeric" });

    $("loader-fill").style.width = "80%";
    const doc = await traer("data/cards.json");
    const tl = META.typelines, sets = META.sets, subs = META.subtipos,
          tipos = META.tipos, rar = META.rarezas;
    const iX = doc.cols.indexOf("x");

    CARTAS = doc.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => iX >= 0 && r[iX] === 1)
      .map(({ r, i }) => ({
        _i: i, id: r[0], n: r[1], tl: tl[r[2]] || "", mc: r[3],
        c: r[4] === null ? "" : r[4], r: rar[r[5]] || "",
        s: sets[r[6]] ? sets[r[6]][0] : "", sn: sets[r[6]] ? sets[r[6]][1] : "",
        cn: r[7], ci: r[8], f: r[10], q: r[11],
        sb: lista(r[15], subs, true), t: tipos[r[16]] || "Other",
        pt: r[17], p: r[18] === undefined ? null : r[18],
        ov: doc.overrides[String(i)] || ""
      }));

    const ex = META.exhibicion || {};
    $("stats").innerHTML = [
      [CARTAS.length, "Piezas"],
      [CARTAS.reduce((s,c) => s + c.q, 0), "Copias"],
      [CARTAS.filter(c => c.f).length, "Foils"],
      [[...new Set(CARTAS.map(c => c.t))].length, "Tipos"]
    ].map(([v,l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

    $("f-tipo").innerHTML = `<option value="">Todos</option>` +
      [...new Set(CARTAS.map(c => c.t))].sort()
        .map(t => `<option value="${t}">${t}</option>`).join("");

    $("loader").hidden = true;
    $("app").hidden = false;
    eventos();
    render();

    traer("data/oracle.json").then(d => { ORACLE = d.oracle || {}; ORACLE_LISTO = true; })
                             .catch(() => {});
  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>No se pudo cargar la galería.</b><br>${e.message}<br><br>
      Si no tienes ningún binder que empiece por "Secret Lair" en Manabox,
      esta página estará vacía.</div>`;
  }
}

function eventos() {
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  on("f-text", "input", render);
  on("f-tipo", "change", render);
  on("f-sort", "change", render);
  on("f-foil", "click", () => {
    onlyFoil = !onlyFoil; $("f-foil").classList.toggle("on", onlyFoil); render();
  });
  document.querySelectorAll(".pip").forEach(p => {
    const archivo = META.simbolos && META.simbolos["{" + p.dataset.c + "}"];
    if (archivo) {
      p.classList.add("svg");
      p.innerHTML = `<img src="assets/simbolos/${archivo}" alt="${p.dataset.c}" ` +
                    `width="32" height="32" style="width:100%;height:100%;display:block">`;
    }
    p.addEventListener("click", () => {
      const c = p.dataset.c;
      colores.has(c) ? colores.delete(c) : colores.add(c);
      p.classList.toggle("on", colores.has(c));
      render();
    });
  });
  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

function render() {
  const q = $("f-text").value.toLowerCase().trim();
  const tipo = $("f-tipo").value;

  filtradas = CARTAS.filter(c => {
    if (q && !c.n.toLowerCase().includes(q)) return false;
    if (tipo && c.t !== tipo) return false;
    if (onlyFoil && !c.f) return false;
    if (colores.size) {
      const arr = (c.ci || "").split("").filter(Boolean);
      const sel = [...colores], conC = sel.includes("C");
      const cols = sel.filter(x => x !== "C");
      if (!((conC && !arr.length) || cols.some(x => arr.includes(x)))) return false;
    }
    return true;
  });

  const sorts = {
    name: (a,b) => a.n.localeCompare(b.n),
    precio: (a,b) => (b.p || 0) - (a.p || 0) || a.n.localeCompare(b.n),
    cmc: (a,b) => (a.c === "" ? 99 : a.c) - (b.c === "" ? 99 : b.c) || a.n.localeCompare(b.n),
  };
  filtradas.sort(sorts[$("f-sort").value] || sorts.name);

  const copias = filtradas.reduce((s,c) => s + c.q, 0);
  $("count").innerHTML = `<b>${filtradas.length}</b> piezas · <b>${copias}</b> copias`;

  $("cartas").innerHTML = !filtradas.length
    ? `<div class="empty">Nada coincide con estos filtros.</div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:.9rem">` +
      filtradas.map(tarjeta).join("") + `</div>`;
}

function tarjeta(c) {
  const i = CARTAS.indexOf(c);
  return `<div class="card" onclick="detalle(${i})">
    ${c.f ? '<div class="badge foil">✦ Foil</div>' : ""}
    ${c.q > 1 ? `<div class="badge" style="top:auto;bottom:44px">×${c.q}</div>` : ""}
    ${(c.id || c.ov) ? `<img src="${img(c,'normal')}" srcset="${srcset(c)}"
             sizes="(max-width:600px) 46vw, 210px" alt="${esc(c.n)}" loading="lazy">`
           : `<div class="noimg"><div style="font-size:1.5rem">🃏</div><div>${esc(c.n)}</div></div>`}
    <div class="cfoot">
      <div class="nm">${esc(c.n)}</div>
      <div class="mt">${mana(c.mc)} ${c.s ? "· " + c.s : ""}${
        c.p ? ` · <span style="color:var(--ok)">${usd(c.p)}</span>` : ""}</div>
    </div>
  </div>`;
}

function detalle(i) {
  const c = CARTAS[i];
  const kv = (k,v) => v ? `<div class="kv"><span>${k}</span><span>${v}</span></div>` : "";
  const texto = ORACLE_LISTO ? (ORACLE[c.n] || "") : "";
  $("modal").innerHTML = `
    <span class="close" onclick="cerrar()">&times;</span>
    ${(c.id || c.ov) ? `<img src="${img(c,'large')}" alt="${esc(c.n)}">` : ""}
    <div class="info">
      <h2>${esc(c.n)}</h2>
      <div style="color:var(--text2);font-size:.85rem">${esc(c.tl)}</div>
      ${texto ? `<div class="ot">${mana(texto, true)}</div>` : ""}
      ${kv("Coste", mana(c.mc))}${kv("CMC", c.c)}${kv("Fuerza/Resistencia", c.pt)}
      ${kv("Identidad de color", c.ci || "Incolora")}
      ${kv("Edición", (c.sn || c.s) + (c.cn ? " · #" + c.cn : ""))}
      ${kv("Copias", c.q)}${kv("Foil", c.f ? "Sí" : "")}
      ${kv("Precio de mercado", usd(c.p))}
      <div class="count" style="margin-top:.8rem;color:var(--accent)">
        Pieza de colección — no disponible para intercambio
      </div>
      <div style="margin-top:1rem">
        <a class="btn" href="https://scryfall.com/card/${(c.s||"").toLowerCase()}/${c.cn}"
           target="_blank" rel="noopener">Ver en Scryfall</a>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");

if (typeof document !== "undefined" && $("loader")) iniciar();
