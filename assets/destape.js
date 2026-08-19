/* ============================================================================
   Mi último destape — las cartas de las ediciones recién abiertas
   ========================================================================== */

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const RE_SIMBOLO = /\{[^}]+\}/g;
const RAR_COLOR = { common:"#aaa", uncommon:"#8ab4f8", rare:"#ffd700",
                    mythic:"#ff8c00", special:"#9b59b6", bonus:"#3498db" };
const RAR_NOMBRE = { common:"Común", uncommon:"Infrecuente", rare:"Rara",
                     mythic:"Mítica", special:"Especial", bonus:"Bonus" };

let META = null, DOC = null, CARTAS = [], ORACLE = null, ORACLE_LISTO = false;
let rareza = "", filtradas = [];

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
    $("loader-fill").style.width = "80%";
    DOC = await traer("data/destape.json");
    CARTAS = DOC.cartas || [];

    document.title = (DOC.titulo || "Mi último destape") + " — Colección MTG";
    $("subtitulo").textContent = DOC.titulo ||
      ("Cartas de " + (DOC.sets || []).map(s => s[1] || s[0]).join(", "));
    $("pie").textContent = "Actualizado el " +
      new Date(DOC.generated_at).toLocaleDateString("es",
        { day:"numeric", month:"long", year:"numeric" });

    const t = DOC.totales || {};
    $("stats").innerHTML = [
      [t.cartas, "Cartas"], [t.miticas, "Míticas"],
      [t.raras, "Raras"], [t.foils, "Foils"]
    ].map(([v,l]) => `<div class="stat"><b>${v || 0}</b><span>${l}</span></div>`).join("");

    $("f-set").innerHTML = `<option value="">Todas</option>` +
      (DOC.sets || []).map(([c,n]) => `<option value="${c}">${c}${n ? " · " + n : ""}</option>`).join("");

    $("loader").hidden = true;
    $("app").hidden = false;
    eventos();
    render();

    traer("data/oracle.json").then(d => { ORACLE = d.oracle || {}; ORACLE_LISTO = true; })
                             .catch(() => {});
  } catch (e) {
    $("loader").innerHTML = `<div class="aviso">
      <b>Todavía no hay ningún destape publicado.</b><br>${e.message}<br><br>
      Crea <code>destape.txt</code> junto al script con las siglas de las
      ediciones y vuelve a generar.</div>`;
  }
}

function eventos() {
  $("f-text").addEventListener("input", render);
  $("f-set").addEventListener("change", render);
  $("f-sort").addEventListener("change", render);
  document.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-r]").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); rareza = b.dataset.r; render();
  }));
  $("overlay").addEventListener("click", e => { if (e.target.id === "overlay") cerrar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

function render() {
  const q = $("f-text").value.toLowerCase().trim();
  const set = $("f-set").value;

  filtradas = CARTAS.filter(c => {
    if (q && !c.n.toLowerCase().includes(q)) return false;
    if (set && c.s !== set) return false;
    if (rareza === "foil" && !c.f) return false;
    if (rareza && rareza !== "foil" && c.r !== rareza) return false;
    return true;
  });

  const orden = { mythic:0, rare:1, special:2, bonus:3, uncommon:4, common:5 };
  const sorts = {
    rareza: (a,b) => (orden[a.r] ?? 9) - (orden[b.r] ?? 9) || b.f - a.f || a.n.localeCompare(b.n),
    name: (a,b) => a.n.localeCompare(b.n),
    cmc: (a,b) => (a.c ?? 99) - (b.c ?? 99) || a.n.localeCompare(b.n),
  };
  filtradas.sort(sorts[$("f-sort").value] || sorts.rareza);

  const copias = filtradas.reduce((s,c) => s + c.q, 0);
  $("count").innerHTML = `<b>${filtradas.length}</b> cartas distintas · <b>${copias}</b> copias`;

  if (!filtradas.length) {
    $("cartas").innerHTML = `<div class="empty">Nada coincide con estos filtros.</div>`;
    return;
  }

  if ($("f-sort").value === "rareza") {
    const grupos = {};
    filtradas.forEach(c => { const k = RAR_NOMBRE[c.r] || c.r || "Otras";
                             (grupos[k] = grupos[k] || []).push(c); });
    $("cartas").innerHTML = Object.keys(grupos).map(k => {
      const col = RAR_COLOR[Object.keys(RAR_NOMBRE).find(x => RAR_NOMBRE[x] === k)] || "#888";
      return `<div style="margin-bottom:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:.55rem .9rem;border-radius:8px;margin-bottom:.8rem;
                    background:var(--surface);border-left:4px solid ${col}">
          <h3 style="color:#fff;font-size:1rem">${k}</h3>
          <span class="count">${grupos[k].reduce((s,c)=>s+c.q,0)}</span>
        </div>
        ${rejilla(grupos[k])}
      </div>`;
    }).join("");
  } else {
    $("cartas").innerHTML = rejilla(filtradas);
  }
}

const rejilla = arr =>
  `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-w),1fr));gap:.9rem">` +
  arr.map(tarjeta).join("") + `</div>`;

function tarjeta(c) {
  const i = CARTAS.indexOf(c);
  return `<div class="card" onclick="detalle(${i})">
    ${c.f ? '<div class="badge foil">✦ Foil</div>' : ""}
    ${c.q > 1 ? `<div class="badge" style="top:auto;bottom:44px">×${c.q}</div>` : ""}
    ${c.mazo ? `<div class="badge" style="left:5px;right:auto;background:var(--ok)">En ${esc(c.mazo)}</div>` : ""}
    ${c.id ? `<img src="${img(c.id,'normal')}" srcset="${srcset(c.id)}"
                   sizes="(max-width:600px) 46vw, 210px" alt="${esc(c.n)}" loading="lazy">`
           : `<div class="noimg"><div style="font-size:1.5rem">🃏</div><div>${esc(c.n)}</div></div>`}
    <div class="cfoot">
      <div class="nm">${esc(c.n)}</div>
      <div class="mt">${mana(c.mc)} · <span style="color:${RAR_COLOR[c.r]||"#888"}">${c.s}</span></div>
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
      ${kv("Rareza", RAR_NOMBRE[c.r] || c.r)}${kv("Edición", c.s)}
      ${kv("Copias", c.q)}${kv("Foil", c.f ? "Sí" : "")}
      ${kv("Ya está en el mazo", c.mazo)}
      <div style="margin-top:1rem">
        <a class="btn" href="https://scryfall.com/card/${(c.s||"").toLowerCase()}/${c.cn}"
           target="_blank" rel="noopener">Ver en Scryfall</a>
      </div>
    </div>`;
  $("overlay").classList.add("show");
}
const cerrar = () => $("overlay").classList.remove("show");

if (typeof document !== "undefined" && $("loader")) iniciar();
