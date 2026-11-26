/* ---------- Your content: edit these arrays ---------- */
const POSTS = [
  {title:"Funding is a price, not a signal", date:"2026-11-10", tags:["Perpetuals","Funding"], url:"#",
   summary:"Why persistently high funding says more about who is paying for leverage than about where price goes next."},
  {title:"Reading the basis curve before a big move", date:"2026-10-22", tags:["Futures","Basis"], url:"#",
   summary:"A term-structure view of futures premiums, and what steepening or inversion has meant for risk appetite."},
  {title:"Open interest without the narrative", date:"2026-10-02", tags:["Positioning"], url:"#",
   summary:"Separating rising open interest that adds fragility from open interest that is simply hedged carry."},
  {title:"Options skew as a risk dashboard", date:"2026-09-15", tags:["Options","Positioning"], url:"#",
   summary:"Using 25-delta skew and term structure to size hedges, not to predict direction."}
];
const DATASETS = [
  {name:"Sample basis term structure", desc:"Annualized basis by expiry (illustrative values).", file:"basis-term-structure.csv",
   rows:[["expiry_days","annualized_basis_pct"],[7,9.1],[30,10.4],[60,11.2],[90,11.8],[180,12.3],[270,12.6]]},
  {name:"Sample funding history", desc:"Daily average 8h funding rate, percent (illustrative values).", file:"funding-history.csv",
   rows:[["date","avg_funding_8h_pct"],["2026-11-01",0.010],["2026-11-02",0.012],["2026-11-03",0.008],["2026-11-04",-0.002],["2026-11-05",0.015]]}
];
const CURVE = [[7,9.1],[30,10.4],[60,11.2],[90,11.8],[180,12.3],[270,12.6]];

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const fmt = (n,d=2) => n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const usd = n => "$" + fmt(n,0);

/* ---------- Writing ---------- */
let activeTag = "All";
function renderPosts(){
  const tags = ["All", ...new Set(POSTS.flatMap(p => p.tags))];
  const f = $("filters"); f.innerHTML = "";
  tags.forEach(t => {
    const b = document.createElement("button");
    b.textContent = t; b.setAttribute("aria-pressed", t === activeTag);
    b.onclick = () => { activeTag = t; renderPosts(); };
    f.appendChild(b);
  });
  $("posts").innerHTML = POSTS
    .filter(p => activeTag === "All" || p.tags.includes(activeTag))
    .sort((a,b) => b.date.localeCompare(a.date))
    .map(p => `<li><a href="${p.url}"><h3>${p.title}</h3></a>
      <div class="meta">${new Date(p.date+"T00:00").toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})} · ${p.tags.join(", ")}</div>
      <p>${p.summary}</p></li>`).join("");
}

/* ---------- Tools ---------- */
function calcFunding(){
  const r = parseFloat($("f-rate").value)/100, h = parseFloat($("f-int").value), s = parseFloat($("f-size").value);
  const out = $("f-out");
  if ([r,h,s].some(isNaN)) { out.textContent = "Enter a rate, interval and size."; return; }
  const apr = r * (24/h) * 365, yearly = apr * s;
  out.innerHTML = `<strong class="${apr<0?'neg':''}">${fmt(apr*100)}% per year</strong>
    ${usd(yearly)} per year on ${usd(s)}, before fees and compounding. ${apr>=0?"Longs pay shorts at this rate.":"Shorts pay longs at this rate."}`;
}
function calcBasis(){
  const s = parseFloat($("b-spot").value), f = parseFloat($("b-fut").value), d = parseFloat($("b-days").value);
  const out = $("b-out");
  if (!(s>0) || !(f>0) || !(d>0)) { out.textContent = "Enter positive prices and days to expiry."; return; }
  const raw = f/s - 1, ann = raw * 365/d;
  out.innerHTML = `<strong class="${ann<0?'neg':''}">${fmt(ann*100)}% annualized</strong>
    Raw premium ${fmt(raw*100)}% over ${d} days. ${ann>=0?"Contango: carry for cash-and-carry.":"Backwardation: futures trade below spot."}`;
}
["f-rate","f-int","f-size"].forEach(i => $(i).addEventListener("input", calcFunding));
["b-spot","b-fut","b-days"].forEach(i => $(i).addEventListener("input", calcBasis));

/* ---------- Data downloads ---------- */
$("datasets").innerHTML = DATASETS.map((d,i) =>
  `<li><div><h3>${d.name}</h3><p>${d.desc}</p></div><button class="btn ghost" data-i="${i}">Download CSV</button></li>`).join("");
$("datasets").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const d = DATASETS[b.dataset.i];
  const blob = new Blob([d.rows.map(r => r.join(",")).join("\n")], {type:"text/csv"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = d.file;
  a.click(); URL.revokeObjectURL(a.href);
});

/* ---------- Hero term-structure chart ---------- */
(function curve(){
  const svg = $("curve"), W = 520, H = 300, m = {l:44,r:16,t:16,b:32};
  const xs = CURVE.map(p => p[0]), ys = CURVE.map(p => p[1]);
  const X = v => m.l + (v - 0) / (Math.max(...xs)) * (W-m.l-m.r);
  const lo = 0, hi = Math.ceil(Math.max(...ys)/2)*2 + 2;
  const Y = v => H-m.b - (v-lo)/(hi-lo)*(H-m.t-m.b);
  let g = "";
  for (let v = lo; v <= hi; v += 4) g += `<line class="grid" x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l-8}" y="${Y(v)+4}" text-anchor="end">${v}%</text>`;
  CURVE.forEach(p => g += `<text x="${X(p[0])}" y="${H-10}" text-anchor="middle">${p[0]}d</text>`);
  const path = CURVE.map((p,i) => (i?"L":"M") + X(p[0]) + " " + Y(p[1])).join(" ");
  svg.innerHTML = g + `<path class="line" d="${path}"/><circle class="dot" r="6" cx="-20" cy="-20"/>`;
  const dot = svg.querySelector(".dot"), cap = $("curve-cap"), base = cap.textContent;
  function pick(e){
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left)/r.width*W;
    const p = CURVE.reduce((a,b) => Math.abs(X(b[0])-x) < Math.abs(X(a[0])-x) ? b : a);
    dot.setAttribute("cx", X(p[0])); dot.setAttribute("cy", Y(p[1]));
    cap.textContent = `${p[0]}-day future: ${fmt(p[1],1)}% annualized basis (illustrative).`;
  }
  svg.addEventListener("pointermove", pick); svg.addEventListener("pointerdown", pick);
  svg.addEventListener("pointerleave", () => { dot.setAttribute("cx",-20); cap.textContent = base; });
})();

renderPosts(); calcFunding(); calcBasis();
$("yr").textContent = new Date().getFullYear();
