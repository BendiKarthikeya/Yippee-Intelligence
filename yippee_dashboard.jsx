import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";

const DEFAULT_SHEET_ID = "1gb8Ci26C1x53DbHiqCM7XBSxPbb6vK-IxtnrYMIXgrk";

const WEBHOOKS = {
  x:       "https://n8n.srv1263670.hstgr.cloud/webhook/665abd9e-95ce-4ce6-bfc1-e55b57312130",
  reddit:  "https://n8n.srv1263670.hstgr.cloud/webhook/6e481b16-9ed5-4e76-91a1-1c0f97e2ceaf",
  threads: null,
};

const TABS = [
  { key: "x", label: "𝕏 Twitter", sheet: "X", color: "#1DA1F2", icon: "𝕏" },
  { key: "reddit", label: "Reddit", sheet: "Reddit", color: "#FF4500", icon: "⬡" },
  { key: "threads", label: "Threads", sheet: "Threads", color: "#8B5CF6", icon: "◎" },
];
const COLORS = ["#FF6B35","#1DA1F2","#FF4500","#00C49F","#FFBB28","#8B5CF6","#EC4899","#14B8A6"];

/* ── CSV parser — handles quoted multiline fields ── */
function parseCSV(text) {
  // Tokenise character-by-character so quoted newlines don't split rows
  const records = [];
  let field = "", inQ = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { field += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(field); field = "";
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = "";
      if (row.some(v => v.trim())) records.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(v => v.trim())) records.push(row);

  if (records.length < 2) return [];
  const headers = records[0].map(h => h.trim());
  return records.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || "").trim(); });
    return obj;
  });
}

/* ── Google Viz JSON parser ── */
function parseGvizJson(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?$/);
  const json = JSON.parse(match ? match[1] : text);
  if (!json.table) return [];
  const headers = json.table.cols.map(c => c.label || c.id);
  return json.table.rows.map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r.c[i]?.v ?? r.c[i]?.f ?? ""; });
    return obj;
  });
}

/* ── Fetch helpers ── */
async function fetchSheetCSV(sheetId, sheetName) {
  // Method 1: gviz CSV
  try {
    const url1 = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const r1 = await fetch(url1);
    if (r1.ok) {
      const t = await r1.text();
      if (t.startsWith('"') || t.includes(',')) {
        const rows = parseCSV(t);
        if (rows.length > 0) return { rows, method: "gviz-csv" };
      }
    }
  } catch(e) {}

  // Method 2: gviz JSON
  try {
    const url2 = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    const r2 = await fetch(url2);
    if (r2.ok) {
      const t = await r2.text();
      const rows = parseGvizJson(t);
      if (rows.length > 0) return { rows, method: "gviz-json" };
    }
  } catch(e) {}

  // Method 3: export CSV (first sheet only, no sheet name support)
  try {
    const url3 = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const r3 = await fetch(url3);
    if (r3.ok) {
      const t = await r3.text();
      const rows = parseCSV(t);
      if (rows.length > 0) return { rows, method: "export-csv" };
    }
  } catch(e) {}

  return { rows: [], method: "failed" };
}

/* ── Small components ── */
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 24px", minWidth:140, flex:1 }}>
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.5, color:"rgba(255,255,255,0.4)", marginBottom:8, fontFamily:"monospace" }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color:accent||"#fff", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:6, fontFamily:"monospace" }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:24, flex:1, minWidth:280 }}>
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.5, color:"rgba(255,255,255,0.4)", marginBottom:16, fontFamily:"monospace" }}>{title}</div>
      {children}
    </div>
  );
}

/* ── Column Filter ── */
function ColumnFilter({ columns, visible, onToggle, onAll, onClear, accent }) {
  const [open, setOpen] = useState(false);
  const ct = columns.filter(c => visible[c.key]).length;
  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => setOpen(!open)} style={{ display:"flex", alignItems:"center", gap:6, background:open?`${accent}18`:"rgba(255,255,255,0.05)", border:`1px solid ${open?accent+"44":"rgba(255,255,255,0.08)"}`, color:open?accent:"rgba(255,255,255,0.6)", padding:"7px 14px", borderRadius:9, cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>
        ⊞ Columns <span style={{ background:`${accent}30`, color:accent, padding:"1px 7px", borderRadius:5, fontSize:9, fontWeight:600 }}>{ct}/{columns.length}</span>
      </button>
      {open && <>
        <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, zIndex:99 }} />
        <div style={{ position:"absolute", top:"110%", right:0, zIndex:100, background:"#1a1a1c", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, padding:"10px 0", minWidth:230, maxHeight:380, overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
          <div style={{ display:"flex", gap:8, padding:"6px 16px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={onAll} style={{ background:"rgba(255,255,255,0.06)", border:"none", color:"rgba(255,255,255,0.5)", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontFamily:"monospace" }}>All</button>
            <button onClick={onClear} style={{ background:"rgba(255,255,255,0.06)", border:"none", color:"rgba(255,255,255,0.5)", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontFamily:"monospace" }}>Clear</button>
          </div>
          {columns.map(col => (
            <div key={col.key} onClick={() => onToggle(col.key)} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 16px", cursor:"pointer" }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${visible[col.key]?accent:"rgba(255,255,255,0.15)"}`, background:visible[col.key]?`${accent}25`:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {visible[col.key] && <span style={{ color:accent, fontSize:10, fontWeight:700 }}>✓</span>}
              </div>
              <div style={{ fontSize:12, color:visible[col.key]?"#fff":"rgba(255,255,255,0.4)" }}>{col.label}</div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

/* ── Data Table ── */
function DataTable({ data, columns, visibleCols, accent }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const PP = 15;
  const active = columns.filter(c => visibleCols[c.key]);
  const sorted = useMemo(() => {
    if (!sortCol) return data;
    return [...data].sort((a,b) => {
      const av = isNaN(Number(a[sortCol])) ? (a[sortCol]||"").toLowerCase() : Number(a[sortCol]);
      const bv = isNaN(Number(b[sortCol])) ? (b[sortCol]||"").toLowerCase() : Number(b[sortCol]);
      return sortDir==="asc" ? (av<bv?-1:av>bv?1:0) : (av>bv?-1:av<bv?1:0);
    });
  }, [data, sortCol, sortDir]);
  const paged = sorted.slice(page*PP, (page+1)*PP);
  const tp = Math.ceil(sorted.length/PP);
  useEffect(() => setPage(0), [data, visibleCols]);
  if (active.length===0) return <div style={{ textAlign:"center", padding:40, color:"rgba(255,255,255,0.25)", fontFamily:"monospace", fontSize:12 }}>No columns selected. Click ⊞ Columns to add.</div>;
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:"monospace" }}>
        <thead><tr>{active.map(c => (
          <th key={c.key} onClick={() => { sortCol===c.key ? setSortDir(d=>d==="asc"?"desc":"asc") : (setSortCol(c.key), setSortDir("desc")); }} style={{ padding:"12px 14px", textAlign:"left", borderBottom:"1px solid rgba(255,255,255,0.08)", color:sortCol===c.key?accent:"rgba(255,255,255,0.45)", cursor:"pointer", whiteSpace:"nowrap", fontSize:10, textTransform:"uppercase", letterSpacing:1.2, userSelect:"none" }}>
            {c.label} {sortCol===c.key?(sortDir==="asc"?"↑":"↓"):""}
          </th>
        ))}</tr></thead>
        <tbody>{paged.map((row,i) => (
          <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            {active.map(c => (
              <td key={c.key} style={{ padding:"10px 14px", color:"rgba(255,255,255,0.75)", maxWidth:c.maxW||300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:c.wrap?"normal":"nowrap" }}>
                {c.render ? c.render(row[c.key], row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}</tbody>
      </table>
      {tp>1 && <div style={{ display:"flex", justifyContent:"center", gap:12, marginTop:16, alignItems:"center" }}>
        <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{ background:"rgba(255,255,255,0.06)", border:"none", color:page===0?"rgba(255,255,255,0.2)":"#fff", padding:"6px 16px", borderRadius:8, cursor:page===0?"default":"pointer", fontSize:12 }}>← Prev</button>
        <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12, fontFamily:"monospace" }}>{page+1}/{tp}</span>
        <button onClick={()=>setPage(p=>Math.min(tp-1,p+1))} disabled={page>=tp-1} style={{ background:"rgba(255,255,255,0.06)", border:"none", color:page>=tp-1?"rgba(255,255,255,0.2)":"#fff", padding:"6px 16px", borderRadius:8, cursor:page>=tp-1?"default":"pointer", fontSize:12 }}>Next →</button>
      </div>}
    </div>
  );
}

/* ── Column definitions ── */
const xCols = [
  { key:"global_rank", label:"#", maxW:40 },
  { key:"author_username", label:"Username", render:(v,r)=><a href={r.tweet_url} target="_blank" rel="noopener" style={{color:"#1DA1F2",textDecoration:"none"}}>@{v}</a> },
  { key:"text", label:"Tweet", maxW:260, wrap:true },
  { key:"hashtags", label:"Hashtags" },
  { key:"mentions", label:"Mentions" },
  { key:"likes", label:"♥" }, { key:"retweets", label:"🔁" }, { key:"replies", label:"💬" },
  { key:"total_engagement", label:"Eng." },
  { key:"engagement_rate", label:"Rate%" },
  { key:"author_followers", label:"Followers" },
  { key:"influencer_tier", label:"Tier" },
  { key:"posted_at", label:"Time", render:v=>v?new Date(v).toLocaleDateString():"" },
  { key:"composite_rank", label:"Score" },
  { key:"tweet_url", label:"Link", render:v=>v?<a href={v} target="_blank" rel="noopener" style={{color:"#1DA1F2"}}>↗</a>:"" },
  { key:"author_name", label:"Name" }, { key:"author_bio", label:"Bio", maxW:200, wrap:true },
  { key:"author_verified", label:"Verified" }, { key:"media_type", label:"Media" },
  { key:"hour_of_day", label:"Hour" }, { key:"day_of_week", label:"Day" },
  { key:"relevance_score", label:"Relevance" }, { key:"virality_score", label:"Virality" },
  { key:"influence_score", label:"Influence" }, { key:"search_keyword", label:"Keyword" },
];
const redditCols = [
  { key:"global_rank", label:"#", maxW:40 },
  { key:"subreddit", label:"Sub", render:v=><span style={{color:"#FF4500"}}>r/{v}</span> },
  { key:"author", label:"User" },
  { key:"title", label:"Title", maxW:260, wrap:true },
  { key:"score", label:"⬆" }, { key:"comments", label:"💬" },
  { key:"total_engagement", label:"Eng." },
  { key:"tone_tag", label:"Tone" }, { key:"flair", label:"Flair" },
  { key:"posted_at", label:"Time", render:v=>v?new Date(v).toLocaleDateString():"" },
  { key:"composite_rank", label:"Score" },
  { key:"permalink", label:"Link", render:v=>v?<a href={v} target="_blank" rel="noopener" style={{color:"#FF4500"}}>↗</a>:"" },
  { key:"text", label:"Text", maxW:200, wrap:true }, { key:"upvote_ratio", label:"Upvote%" },
  { key:"subreddit_subscribers", label:"Sub Size" }, { key:"media_type", label:"Media" },
  { key:"hour_of_day", label:"Hour" }, { key:"day_of_week", label:"Day" },
  { key:"relevance_score", label:"Relevance" }, { key:"virality_score", label:"Virality" },
];
const threadsCols = [
  { key:"global_rank", label:"#", maxW:40 },
  { key:"author_username", label:"User", render:v=><span style={{color:"#8B5CF6"}}>@{v}</span> },
  { key:"text", label:"Post", maxW:260, wrap:true },
  { key:"likes", label:"♥" }, { key:"replies", label:"💬" }, { key:"reposts", label:"🔁" },
  { key:"total_engagement", label:"Eng." },
  { key:"author_followers", label:"Followers" }, { key:"influencer_tier", label:"Tier" },
  { key:"posted_at", label:"Time", render:v=>v?new Date(v).toLocaleDateString():"" },
  { key:"composite_rank", label:"Score" },
  { key:"permalink", label:"Link", render:v=>v?<a href={v} target="_blank" rel="noopener" style={{color:"#8B5CF6"}}>↗</a>:"" },
  { key:"media_type", label:"Media" }, { key:"hour_of_day", label:"Hour" }, { key:"day_of_week", label:"Day" },
];

const DEF_VIS = {
  x:{global_rank:true,author_username:true,text:true,hashtags:true,likes:true,retweets:true,replies:true,total_engagement:true,author_followers:true,influencer_tier:true,posted_at:true,composite_rank:true,tweet_url:true},
  reddit:{global_rank:true,subreddit:true,author:true,title:true,score:true,comments:true,total_engagement:true,tone_tag:true,posted_at:true,composite_rank:true,permalink:true},
  threads:{global_rank:true,author_username:true,text:true,likes:true,replies:true,reposts:true,total_engagement:true,author_followers:true,influencer_tier:true,posted_at:true,composite_rank:true,permalink:true},
};

function computeStats(data, platform) {
  const n = data.length;
  if (!n) return {total:0,totalEng:0,avgEng:0,uniq:0,topHour:"-",hourData:[],tierData:[],dayData:[]};
  const totalEng = data.reduce((s,r)=>s+(Number(r.total_engagement)||0),0);
  const af = platform==="reddit"?"author":"author_username";
  const uniq = new Set(data.map(r=>r[af]).filter(Boolean)).size;
  const hrs={}; data.forEach(r=>{const h=r.hour_of_day||"0"; hrs[h]=(hrs[h]||0)+1;});
  const hourData = Object.entries(hrs).map(([h,c])=>({hour:`${h}h`,count:c})).sort((a,b)=>parseInt(a.hour)-parseInt(b.hour));
  const topH = Object.entries(hrs).sort((a,b)=>b[1]-a[1])[0];
  const tiers={}; data.forEach(r=>{const t=r.influencer_tier||"?"; tiers[t]=(tiers[t]||0)+1;});
  const tierData = Object.entries(tiers).map(([name,value])=>({name,value}));
  const ds={}; data.forEach(r=>{const d=r.day_of_week||"?"; ds[d]=(ds[d]||0)+1;});
  const dayData = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>({day:d,count:ds[d]||0}));
  return {total:n, totalEng, avgEng:Math.round(totalEng/n), uniq, topHour:topH?`${topH[0]}:00`:"-", hourData, tierData, dayData};
}

/* ── Keyword Scrape Panel ── */
/* ── Toast ── */
function Toast({ toasts }) {
  return (
    <div style={{ position:"fixed", bottom:28, right:28, zIndex:9999, display:"flex", flexDirection:"column", gap:10, pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display:"flex", alignItems:"center", gap:12,
          background: t.type === "success" ? "#0f2a1e" : "#2a0f0f",
          border: `1px solid ${t.type === "success" ? "#00C49F44" : "#FF450044"}`,
          borderLeft: `3px solid ${t.type === "success" ? "#00C49F" : "#FF4500"}`,
          borderRadius:12, padding:"13px 18px", minWidth:280, maxWidth:400,
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          animation:"slideIn 0.25s ease",
        }}>
          <span style={{ fontSize:18, flexShrink:0 }}>{t.type === "success" ? "✅" : "❌"}</span>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:2 }}>
              {t.type === "success" ? "Scrape Triggered!" : "Failed"}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", fontFamily:"monospace", lineHeight:1.4 }}>{t.msg}</div>
          </div>
        </div>
      ))}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

function KeywordPanel({ platform, accent, webhookUrl, onToast }) {
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);

  const kws = keywords.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
  const suffix = platform === "x" ? " -is:retweet lang:en" : "";

  async function handleSubmit() {
    if (!kws.length) return;
    if (!webhookUrl) { onToast("error", "Webhook not configured for this platform yet"); return; }
    setLoading(true);
    try {
      let body;
      if (platform === "x") {
        body = {
          campaign: { brand: "ITC Yippee", keywords: kws, hashtags: ["YippeeNoodles","InstantNoodles","DesiFood"], geo: "IN" },
          filters:  { min_engagement: 10, min_follower_count: 500 }
        };
      } else if (platform === "reddit") {
        body = {
          keywords: kws,
          config: {
            campaign: { brand: "ITC Yippee", hashtags: ["YippeeNoodles","InstantNoodles","DesiFood"] },
            filters:  { min_engagement: 10, min_score: 5 }
          }
        };
      } else {
        body = { keywords: kws };
      }
      const res = await fetch(webhookUrl, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onToast("success", `${kws.length} keyword${kws.length > 1 ? "s" : ""} sent — data will appear in the sheet shortly`);
      setKeywords("");
    } catch(e) {
      onToast("error", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop:28, background:`${accent}08`, border:`1px solid ${accent}22`, borderRadius:16, padding:"20px 22px" }}>
      <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:1.5, color:accent, fontFamily:"monospace", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
        <span>⚡</span> Trigger Scrape — Add Keywords
        {platform === "threads" && <span style={{ color:"rgba(255,255,255,0.25)", fontSize:9, marginLeft:4 }}>(webhook coming soon)</span>}
      </div>
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"flex-start" }}>
        <div style={{ flex:1, minWidth:280 }}>
          <textarea
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder={"Enter keywords — one per line or comma-separated\ne.g. yippee noodles, maggi vs yippee, 2am noodles hostel"}
            rows={3}
            style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${accent}30`, borderRadius:9, padding:12, color:"#fff", fontSize:12, fontFamily:"monospace", outline:"none", resize:"vertical", boxSizing:"border-box" }}
          />
          {kws.length > 0 && (
            <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:6 }}>
              {kws.map((kw, i) => (
                <span key={i} style={{ background:`${accent}18`, border:`1px solid ${accent}35`, color:accent, borderRadius:6, padding:"3px 10px", fontSize:11, fontFamily:"monospace" }}>
                  {kw}{suffix}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !kws.length || !webhookUrl}
          style={{ background:accent, border:"none", color:"#fff", padding:"11px 22px", borderRadius:9, cursor:(kws.length && webhookUrl && !loading) ? "pointer":"default", fontSize:12, fontWeight:700, opacity:(kws.length && webhookUrl) ? 1 : 0.45, letterSpacing:0.5, alignSelf:"flex-start" }}>
          {loading ? "◎  Triggering…" : "⚡  Trigger Scrape"}
        </button>
      </div>
    </div>
  );
}

/* ── Main Dashboard ── */
export default function App() {
  const [tab, setTab] = useState("reddit");
  const [data, setData] = useState({x:[],reddit:[],threads:[]});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vis, setVis] = useState(DEF_VIS);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTab, setPasteTab] = useState("x");
  const [sheetId, setSheetId] = useState(DEFAULT_SHEET_ID);
  const [sheetInput, setSheetInput] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [toasts, setToasts] = useState([]);

  function addToast(type, msg) {
    const id = Date.now();
    setToasts(p => [...p, { id, type, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }

  async function loadData(sid) {
    setLoading(true);
    const res = {};
    for (const t of TABS) {
      const {rows} = await fetchSheetCSV(sid, t.sheet);
      res[t.key] = rows;
    }
    setData(res);
    setLoading(false);
  }

  useEffect(() => { loadData(sheetId); }, []);

  function handlePaste() {
    if (!pasteText.trim()) return;
    try {
      const rows = parseCSV(pasteText);
      setData(p => ({...p, [pasteTab]: rows}));
      setShowPaste(false);
      setPasteText("");
    } catch(e) { console.error(e); }
  }

  function handleSheetLoad() {
    const m = sheetInput.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) { setSheetId(m[1]); loadData(m[1]); setShowSheet(false); }
  }

  const curTab = TABS.find(t=>t.key===tab);
  const allCols = tab==="x"?xCols:tab==="reddit"?redditCols:threadsCols;
  const curVis = vis[tab]||{};
  const curData = useMemo(()=>{
    let d=data[tab]||[];
    if(search.trim()){const q=search.toLowerCase(); d=d.filter(r=>Object.values(r).some(v=>(v||"").toString().toLowerCase().includes(q)));}
    return d;
  },[data,tab,search]);
  const stats = computeStats(curData, tab);

  return (
    <div style={{ minHeight:"100vh", background:"#0A0A0B", color:"#fff", fontFamily:"system-ui,sans-serif", padding:"0 24px 60px" }}>

      {/* Header */}
      <div style={{ padding:"28px 0 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#FF6B35,#FF4500)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700 }}>Y</div>
          <div>
            <h1 style={{ margin:0, fontSize:20, fontWeight:700 }}>Yippee Intelligence</h1>
            <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"monospace" }}>SOCIAL LISTENING DASHBOARD</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>loadData(sheetId)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", color:"#fff", padding:"7px 14px", borderRadius:9, cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>↻ Refresh</button>
          <button onClick={()=>setShowSheet(!showSheet)} style={{ background:showSheet?"rgba(255,107,53,0.15)":"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", color:"#fff", padding:"7px 14px", borderRadius:9, cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>⚙ Sheet</button>
          <button onClick={()=>setShowPaste(!showPaste)} style={{ background:showPaste?"rgba(139,92,246,0.15)":"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", color:"#fff", padding:"7px 14px", borderRadius:9, cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>📋 Paste CSV</button>
        </div>
      </div>

      {/* Sheet URL */}
      {showSheet && (
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:16, marginBottom:16, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input value={sheetInput} onChange={e=>setSheetInput(e.target.value)} placeholder="Paste Google Sheets URL..."
            style={{ flex:1, minWidth:280, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:9, padding:"9px 14px", color:"#fff", fontSize:11, fontFamily:"monospace", outline:"none" }} />
          <button onClick={handleSheetLoad} style={{ background:"#FF6B35", border:"none", color:"#fff", padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:11, fontWeight:600 }}>Load</button>
          <div style={{ width:"100%", fontSize:10, color:"rgba(255,255,255,0.25)", fontFamily:"monospace" }}>Sheet must be "Anyone with the link can view". Tabs: X, Reddit, Threads</div>
        </div>
      )}

      {/* Paste CSV */}
      {showPaste && (
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontFamily:"monospace" }}>Load into:</span>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setPasteTab(t.key)} style={{ background:pasteTab===t.key?`${t.color}25`:"rgba(255,255,255,0.05)", border:`1px solid ${pasteTab===t.key?t.color+"44":"rgba(255,255,255,0.08)"}`, color:pasteTab===t.key?t.color:"rgba(255,255,255,0.5)", padding:"5px 12px", borderRadius:7, cursor:"pointer", fontSize:11, fontFamily:"monospace" }}>{t.label}</button>
            ))}
          </div>
          <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder="Paste CSV data here (copy from Google Sheets → File → Download as CSV, then paste)..." rows={6}
            style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:9, padding:12, color:"#fff", fontSize:11, fontFamily:"monospace", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
          <button onClick={handlePaste} style={{ marginTop:8, background:"#8B5CF6", border:"none", color:"#fff", padding:"9px 18px", borderRadius:9, cursor:"pointer", fontSize:11, fontWeight:600 }}>Load CSV Data</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:24, flexWrap:"wrap", justifyContent:"center" }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>{setTab(t.key);setSearch("");}} style={{
            display:"flex", alignItems:"center", gap:8, padding:"9px 18px",
            background:tab===t.key?`${t.color}18`:"rgba(255,255,255,0.03)",
            border:`1px solid ${tab===t.key?t.color+"40":"rgba(255,255,255,0.06)"}`,
            borderRadius:11, color:tab===t.key?t.color:"rgba(255,255,255,0.45)",
            cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.2s",
          }}>
            <span style={{fontSize:15}}>{t.icon}</span> {t.label}
            <span style={{ background:tab===t.key?t.color+"28":"rgba(255,255,255,0.06)", padding:"2px 8px", borderRadius:6, fontSize:10, fontFamily:"monospace" }}>{(data[t.key]||[]).length}</span>
          </button>
        ))}
      </div>

      <KeywordPanel platform={tab} accent={curTab.color} webhookUrl={WEBHOOKS[tab]} onToast={addToast} />

      {loading ? (
        <div style={{ textAlign:"center", padding:80, color:"rgba(255,255,255,0.3)" }}>
          <div style={{ fontSize:32, marginBottom:12, animation:"spin 1s linear infinite" }}>◎</div>
          <div style={{ fontFamily:"monospace", fontSize:12 }}>Loading data...</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : curData.length===0 && !search ? (
        <>
          <div style={{ textAlign:"center", padding:60, color:"rgba(255,255,255,0.2)" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>∅</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>No data for "{curTab.sheet}"</div>
            <div style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.2)", marginBottom:16 }}>
              If auto-fetch failed, use 📋 Paste CSV to load data manually.
            </div>
            <div style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.15)" }}>
              Open your sheet → File → Download → CSV → paste here
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ display:"flex", gap:10, marginBottom:24, flexWrap:"wrap" }}>
            <StatCard label="Total Posts" value={stats.total} accent={curTab.color} />
            <StatCard label="Total Engagement" value={stats.totalEng.toLocaleString()} sub="likes + replies + shares" />
            <StatCard label="Avg Engagement" value={stats.avgEng.toLocaleString()} sub="per post" />
            <StatCard label="Unique Authors" value={stats.uniq} />
            <StatCard label="Peak Hour" value={stats.topHour} sub="UTC" />
          </div>

          <div style={{ display:"flex", gap:14, marginBottom:24, flexWrap:"wrap" }}>
            <ChartCard title="Posts by Hour">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.hourData}>
                  <XAxis dataKey="hour" tick={{fill:"rgba(255,255,255,0.3)",fontSize:9}} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip contentStyle={{background:"#1a1a1b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11}}/>
                  <Bar dataKey="count" fill={curTab.color} radius={[4,4,0,0]} opacity={0.8}/>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Influencer Tiers">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={stats.tierData} cx="50%" cy="50%" innerRadius={38} outerRadius={65} paddingAngle={3} dataKey="value"
                    label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{fontSize:10,fontFamily:"monospace"}}>
                    {stats.tierData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:"#1a1a1b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11}}/>
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Posts by Day">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={stats.dayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="day" tick={{fill:"rgba(255,255,255,0.3)",fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip contentStyle={{background:"#1a1a1b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:11}}/>
                  <Line type="monotone" dataKey="count" stroke={curTab.color} strokeWidth={2} dot={{fill:curTab.color,r:4}}/>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"18px 0" }}>
            <div style={{ padding:"0 20px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:1.5, color:"rgba(255,255,255,0.4)", fontFamily:"monospace" }}>
                {curTab.label} — {curData.length} posts
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <div style={{ position:"relative", maxWidth:240 }}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                    style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:9, padding:"8px 12px", color:"#fff", fontSize:12, fontFamily:"monospace", outline:"none", boxSizing:"border-box" }}/>
                </div>
                <ColumnFilter columns={allCols} visible={curVis}
                  onToggle={k=>setVis(p=>({...p,[tab]:{...p[tab],[k]:!p[tab][k]}}))}
                  onAll={()=>{const a={};allCols.forEach(c=>{a[c.key]=true});setVis(p=>({...p,[tab]:a}));}}
                  onClear={()=>setVis(p=>({...p,[tab]:{}}))}
                  accent={curTab.color}/>
              </div>
            </div>
            <div style={{padding:"0 10px"}}>
              <DataTable data={curData} columns={allCols} visibleCols={curVis} accent={curTab.color}/>
            </div>
          </div>

        </>
      )}

      <div style={{ textAlign:"center", marginTop:36, color:"rgba(255,255,255,0.12)", fontSize:9, fontFamily:"monospace" }}>
        YIPPEE INTELLIGENCE · ITC CAMPAIGN · N8N + GOOGLE SHEETS
      </div>

      <Toast toasts={toasts} />
    </div>
  );
}
