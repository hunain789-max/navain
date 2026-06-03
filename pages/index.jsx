import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MODEL = "claude-sonnet-4-20250514";

const NICHES = [
  "Spas","Salons","Dental Offices","Auto Repair","HVAC",
  "Plumbers","Chiropractors","Law Firms","Gyms","Veterinary Clinics",
  "Electricians","Landscaping","Roofing","Physical Therapy","Optometry"
];

const USA_CITIES = [
  "Salt Lake City, UT","Provo, UT","Ogden, UT",
  "Phoenix, AZ","Scottsdale, AZ","Tempe, AZ","Mesa, AZ",
  "Austin, TX","Houston, TX","Dallas, TX","San Antonio, TX","Fort Worth, TX",
  "Denver, CO","Colorado Springs, CO","Aurora, CO",
  "Miami, FL","Orlando, FL","Tampa, FL","Jacksonville, FL",
  "Seattle, WA","Spokane, WA","Bellevue, WA",
  "Atlanta, GA","Savannah, GA","Augusta, GA",
  "Chicago, IL","Naperville, IL","Rockford, IL",
  "Las Vegas, NV","Reno, NV","Henderson, NV",
  "Charlotte, NC","Raleigh, NC","Durham, NC","Greensboro, NC",
  "Nashville, TN","Memphis, TN","Knoxville, TN",
  "Portland, OR","Eugene, OR","Salem, OR",
  "Minneapolis, MN","Saint Paul, MN","Duluth, MN",
  "Kansas City, MO","St. Louis, MO","Springfield, MO",
  "Indianapolis, IN","Fort Wayne, IN","Evansville, IN",
  "Columbus, OH","Cleveland, OH","Cincinnati, OH",
  "Pittsburgh, PA","Philadelphia, PA","Allentown, PA",
  "Oklahoma City, OK","Tulsa, OK","Norman, OK",
  "Albuquerque, NM","Santa Fe, NM","Las Cruces, NM",
  "Boise, ID","Meridian, ID","Nampa, ID",
  "Louisville, KY","Lexington, KY","Bowling Green, KY",
  "Richmond, VA","Virginia Beach, VA","Chesapeake, VA",
  "Milwaukee, WI","Madison, WI","Green Bay, WI",
  "Little Rock, AR","Fort Smith, AR","Fayetteville, AR",
  "Birmingham, AL","Montgomery, AL","Huntsville, AL",
  "Omaha, NE","Lincoln, NE","Bellevue, NE",
  "Tucson, AZ","Chandler, AZ","Gilbert, AZ",
  "Los Angeles, CA","San Francisco, CA","San Diego, CA","Sacramento, CA",
  "New York, NY","Buffalo, NY","Albany, NY",
  "Boston, MA","Worcester, MA","Springfield, MA",
  "Detroit, MI","Grand Rapids, MI","Lansing, MI",
  "Baltimore, MD","Annapolis, MD","Frederick, MD",
  "New Orleans, LA","Baton Rouge, LA","Shreveport, LA",
  "Charleston, SC","Columbia, SC","Greenville, SC",
  "Jackson, MS","Gulfport, MS","Biloxi, MS",
  "Honolulu, HI","Anchorage, AK","Fairbanks, AK",
  "Burlington, VT","Portland, ME","Concord, NH",
  "Hartford, CT","Providence, RI","Newark, NJ",
];

const STATUS_COLORS = {
  New:"#3b82f6", Emailed:"#f59e0b",
  "Follow-Up 1":"#8b5cf6", "Follow-Up 2":"#ec4899",
  "Meeting Set":"#10b981", Closed:"#6b7280", Bounced:"#ef4444"
};

const TABS = ["Dashboard","Leads","Email Sender","Campaigns","Calendar","Agent Chat"];

// ─── Claude API — calls Vercel proxy ─────────────────────────────────────────
async function claude({ system, messages, max_tokens = 1500 }) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

// ─── Agent: Generate USA leads ────────────────────────────────────────────────
async function agentScrapeLeads(niche, city, count) {
  const system = `You are a lead-generation AI for USA businesses only. Generate realistic, diverse American business leads using your knowledge of typical service businesses. Do NOT use Apollo, Hunter.io, or any external database.

STRICT RULES:
- Return ONLY a valid JSON array. No markdown, no backticks, no explanation.
- Keys: name, owner, email, phone, city, state, niche, status
- "status" is always "New"
- city and state must be real USA locations
- Emails: realistic pattern like info@valleydental.com or drsmith@sunsetchiro.com
- Phone: correct area code for the city
- Business names: varied, realistic American small business names
- Owner names: diverse, American-sounding
- No duplicates`;

  const raw = await claude({
    system,
    messages: [{ role:"user", content:`Generate exactly ${count} ${niche} business leads in ${city}, USA. Return ONLY the JSON array.` }],
    max_tokens: 3000
  });
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Claude returned invalid JSON. Response: " + raw.slice(0,300));
  const leads = JSON.parse(match[0]);
  if (!Array.isArray(leads) || !leads[0]?.email) throw new Error("Unexpected format.");
  return leads.map(l => ({ ...l, status:"New", _source:"Claude AI", _addedAt: Date.now() }));
}

// ─── Agent: Write cold email ──────────────────────────────────────────────────
async function agentWriteEmail(lead) {
  const system = `You write short cold emails for Navain AI, a company selling AI voice receptionists to US service businesses.

RULES:
- 3-4 sentences MAX. First name only for owner.
- Mention ONE pain point relevant to their niche (missed calls, after-hours, no-show bookings)
- NO pricing. NO Calendly. NO "I hope this email finds you well."
- End with EXACTLY: "Just reply here and we'll find a time that works."
- Sign off: Hunain | Navain AI
- Output ONLY the email body. No subject. No markdown.`;

  return await claude({
    system,
    messages: [{ role:"user", content:`Write a cold email to ${lead.owner.split(" ")[0]}, owner of ${lead.name} (${lead.niche}) in ${lead.city}.` }]
  });
}

// ─── Agent: Write follow-up ───────────────────────────────────────────────────
async function agentWriteFollowUp(lead, num = 1) {
  const system = `You write short follow-up emails for Navain AI.

RULES:
- Follow-up #1: 2 sentences. Reference the prior email. Casual, not pushy.
- Follow-up #2: 1 sentence. Final bump. Slightly more urgent but still human.
- NO pricing. NO Calendly.
- End with: "Just reply and we can chat."
- Sign off: Hunain | Navain AI
- Output ONLY the email body. No subject. No markdown.`;

  return await claude({
    system,
    messages: [{ role:"user", content:`Write follow-up #${num} to ${lead.owner.split(" ")[0]} at ${lead.name} (${lead.niche}). We pitched our AI voice receptionist earlier.` }]
  });
}

// ─── Agent: Subject line ──────────────────────────────────────────────────────
async function agentSubject(lead, type = "cold") {
  const system = `Write a single cold email subject line for a US service business owner. Max 7 words. No spam words, no emojis, no exclamation marks. Curiosity or relevance-based. Return only the subject line text, nothing else.`;
  const prompt = type === "cold"
    ? `Subject for cold email to a ${lead.niche} owner in ${lead.city}.`
    : `Subject for follow-up email to ${lead.niche} owner who hasn't replied.`;
  const s = await claude({ system, messages: [{ role:"user", content: prompt }] });
  return s.trim().replace(/^["']|["']$/g, "");
}

// ─── Agent: Chat ──────────────────────────────────────────────────────────────
async function agentChat(history, msg) {
  const system = `You are NavainBot — AI sales agent for Navain AI, which sells AI voice receptionists to US service businesses (spas, salons, dental, auto repair, HVAC, trades, etc.).

Navain AI offer: AI receptionist answers calls 24/7, books appointments, handles FAQs. One-time setup = first month covered. Second month free. No contracts.

You help Hunain with: outreach strategy, objection handling, email tips, niche targeting, pricing conversations, follow-up cadence.

Personality: sharp, direct, confident. No fluff.
UI note: tell users to use the dedicated buttons for lead generation and sending emails — the UI handles execution.`;

  return await claude({ system, messages: [...history.filter(m => m.role !== "system"), { role:"user", content:msg }] });
}

// ─── EmailJS sender via Vercel backend (no origin restrictions) ───────────────
async function sendViaEmailJS({ serviceId, templateId, publicKey, to, toName, subject, body, fromName }) {
  const res = await fetch("/api/sendemail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceId,
      templateId,
      publicKey,
      templateParams: {
        to_email: to,
        to_name: toName,
        from_name: fromName || "Hunain | Navain AI",
        subject,
        message: body,
        reply_to: fromName || "Navain AI"
      }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Email send failed");
  return data;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function Spinner({ size = 14, color = "#fff" }) {
  return <span style={{ display:"inline-block", width:size, height:size, border:`2px solid rgba(255,255,255,0.2)`, borderTopColor:color, borderRadius:"50%", animation:"spin 0.6s linear infinite", verticalAlign:"middle", flexShrink:0 }} />;
}

function Badge({ status }) {
  const c = STATUS_COLORS[status] || "#64748b";
  return <span style={{ background:`${c}20`, color:c, border:`1px solid ${c}40`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{status}</span>;
}

function AgentPill({ running }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:20, fontSize:11,
      background: running?"rgba(74,222,128,0.12)":"rgba(100,116,139,0.1)",
      color: running?"#4ade80":"#64748b",
      border:`1px solid ${running?"rgba(74,222,128,0.3)":"rgba(100,116,139,0.2)"}`,
      fontWeight:600, letterSpacing:0.5, textTransform:"uppercase" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:running?"#4ade80":"#64748b", animation:running?"pulse 1.2s infinite":"none" }} />
      {running ? "Agent Working…" : "Agent Ready"}
    </span>
  );
}

function StatCard({ label, value, icon, color, note }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:"20px 22px", flex:1, minWidth:120 }}>
      <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'Sora',sans-serif", lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:12, color:"#7c8aaa", marginTop:4 }}>{label}</div>
      {note && <div style={{ fontSize:11, color:"#4ade80", marginTop:3 }}>{note}</div>}
    </div>
  );
}

function Toast({ msg, type = "success", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, []);
  const color = type === "error" ? "#f87171" : type === "warn" ? "#fbbf24" : "#4ade80";
  const icon = type === "error" ? "✗" : type === "warn" ? "⚠" : "✓";
  return (
    <div style={{ position:"fixed", bottom:24, right:24, background:"#1a2236", border:`1px solid ${color}40`, borderRadius:12, padding:"14px 20px", color:"#f0f4ff", fontSize:13, fontWeight:600, zIndex:9999, display:"flex", alignItems:"center", gap:12, boxShadow:"0 8px 40px rgba(0,0,0,0.6)", animation:"fadeIn 0.2s ease", maxWidth:380 }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:18, lineHeight:1, padding:0 }}>×</button>
    </div>
  );
}

function Section({ title, sub, children, action }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:18, padding:26, marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:"#f0f4ff" }}>{title}</div>
          {sub && <div style={{ fontSize:12, color:"#7c8aaa", marginTop:3 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const inp = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:13, outline:"none", fontFamily:"inherit", width:"100%" };
const sel = { ...inp, cursor:"pointer" };
const pBtn = (disabled) => ({ background:disabled?"rgba(100,116,139,0.3)":"linear-gradient(135deg,#00e5ff,#7c3aed)", border:"none", color:disabled?"#64748b":"#fff", borderRadius:11, padding:"11px 22px", fontWeight:700, fontSize:13, cursor:disabled?"not-allowed":"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:8, whiteSpace:"nowrap", transition:"all 0.15s" });
const secBtn = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", color:"#e2e8f0", borderRadius:11, padding:"10px 20px", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" };
const microBtn = (color, disabled) => ({ background:`${color}15`, border:`1px solid ${color}40`, color, borderRadius:8, padding:"5px 11px", fontSize:11, cursor:disabled?"not-allowed":"pointer", fontWeight:700, fontFamily:"inherit", opacity:disabled?0.45:1, whiteSpace:"nowrap" });

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Dashboard");
  const [agentRunning, setAgentRunning] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
  }, []);

  // ── Leads ──
  const [leads, setLeads] = useState([
    { name:"Mountain View Dental", owner:"Dr. Rachel Kim", email:"rachel@mountainviewdental.com", phone:"801-555-0112", city:"Salt Lake City", state:"UT", niche:"Dental Offices", status:"New", _source:"Claude AI", _addedAt:Date.now()-86400000 },
    { name:"Desert Bloom Spa", owner:"Monica Reyes", email:"monica@desertbloomspa.com", phone:"602-555-0247", city:"Phoenix", state:"AZ", niche:"Spas", status:"Emailed", _source:"Claude AI", _addedAt:Date.now()-72000000 },
    { name:"Capital City Auto Care", owner:"James Pittman", email:"james@capcityauto.com", phone:"512-555-0331", city:"Austin", state:"TX", niche:"Auto Repair", status:"Follow-Up 1", _source:"Claude AI", _addedAt:Date.now()-48000000 },
    { name:"Rocky Mountain Chiropractic", owner:"Dr. Ben Walsh", email:"ben@rmchiro.com", phone:"720-555-0198", city:"Denver", state:"CO", niche:"Chiropractors", status:"Meeting Set", _source:"Claude AI", _addedAt:Date.now()-24000000 },
  ]);

  const [scrapeNiche, setScrapeNiche] = useState("Spas");
  const [scrapeCity, setScrapeCity] = useState("Salt Lake City, UT");
  const [scrapeCount, setScrapeCount] = useState(10);
  const [scraping, setScraping] = useState(false);
  const [scrapeErr, setScrapeErr] = useState("");
  const [leadFilter, setLeadFilter] = useState("All");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadActions, setLeadActions] = useState({});

  // ── Calendar ──
  const [calendar, setCalendar] = useState([
    { title:"Demo – Rocky Mountain Chiropractic", date:"2026-06-08", time:"10:00 AM", with:"Dr. Ben Walsh", email:"ben@rmchiro.com", notes:"Wants to reduce missed calls after hours" },
    { title:"Demo – Desert Bloom Spa", date:"2026-06-10", time:"2:30 PM", with:"Monica Reyes", email:"monica@desertbloomspa.com", notes:"Interested in appointment booking automation" },
  ]);

  // ── Email Sender Config (persisted to localStorage) ──
  const [emailConfig, setEmailConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("navain_emailjs_config");
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { serviceId: "", templateId: "", publicKey: "", fromName: "Hunain | Navain AI", configured: false };
  });
  const [showConfig, setShowConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState(() => {
    try {
      const saved = localStorage.getItem("navain_emailjs_config");
      if (saved) { const p = JSON.parse(saved); return { serviceId:p.serviceId||"", templateId:p.templateId||"", publicKey:p.publicKey||"", fromName:p.fromName||"Hunain | Navain AI" }; }
    } catch(e) {}
    return { serviceId:"", templateId:"", publicKey:"", fromName:"Hunain | Navain AI" };
  });

  // ── Email Queue & Sending ──
  const [sendQueue, setSendQueue] = useState([]);
  const [sending, setSending] = useState(false);
  const [autoFollowUp, setAutoFollowUp] = useState(false);
  const [followUpDelay, setFollowUpDelay] = useState(3);
  const [bulkSelectNiche, setBulkSelectNiche] = useState("All");
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const autoFollowTimers = useRef({});

  // ── Chat ──
  const [messages, setMessages] = useState([
    { role:"assistant", content:"👋 I'm NavainBot — your AI sales agent for Navain AI.\n\nAll leads are USA-only and generated by Claude through a secure Vercel backend — no API key exposed in the browser.\n\nHead to the Email Sender tab to configure EmailJS, then start generating and sending!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, chatLoading]);

  // ── Stats ──
  const totalLeads = leads.length;
  const emailedCount = leads.filter(l => ["Emailed","Follow-Up 1","Follow-Up 2","Meeting Set"].includes(l.status)).length;
  const meetingsCount = leads.filter(l => l.status === "Meeting Set").length;
  const sentEmails = sendQueue.filter(e => e.status === "sent").length;
  const failedEmails = sendQueue.filter(e => e.status === "failed").length;

  // ── Scrape leads ──
  async function handleScrape() {
    setScraping(true); setScrapeErr(""); setAgentRunning(true);
    try {
      const newLeads = await agentScrapeLeads(scrapeNiche, scrapeCity, scrapeCount);
      setLeads(prev => {
        const ex = new Set(prev.map(l => l.email));
        return [...prev, ...newLeads.filter(l => !ex.has(l.email))];
      });
      addToast(`${newLeads.length} ${scrapeNiche} leads generated for ${scrapeCity}`);
      setTab("Leads");
    } catch(e) { setScrapeErr(e.message); addToast("Lead generation failed: " + e.message, "error"); }
    setScraping(false); setAgentRunning(false);
  }

  // ── Generate email for a lead ──
  async function handleGenerateEmail(lead) {
    setLeadActions(p => ({ ...p, [lead.email]: { ...p[lead.email], loading:true } }));
    setAgentRunning(true);
    try {
      const [body, subject] = await Promise.all([agentWriteEmail(lead), agentSubject(lead, "cold")]);
      setLeadActions(p => ({ ...p, [lead.email]: { loading:false, subject, body, type:"cold" } }));
      addToast(`Email drafted for ${lead.name}`);
    } catch(e) {
      setLeadActions(p => ({ ...p, [lead.email]: { loading:false, error:e.message } }));
      addToast("Email draft failed", "error");
    }
    setAgentRunning(false);
  }

  // ── Add to send queue ──
  function addToQueue(lead, subject, body, type = "cold") {
    setSendQueue(p => {
      const exists = p.find(q => q.lead.email === lead.email && q.type === type);
      if (exists) return p;
      return [...p, { id: Date.now() + Math.random(), lead, type, subject, body, status:"queued", sentAt:null, error:null }];
    });
    addToast(`${lead.name} added to send queue`);
  }

  // ── Send one email via EmailJS ──
  async function sendOne(item) {
    if (!emailConfig.configured) throw new Error("EmailJS not configured");
    setSendQueue(p => p.map(q => q.id === item.id ? { ...q, status:"sending" } : q));
    try {
      await sendViaEmailJS({
        serviceId: emailConfig.serviceId,
        templateId: emailConfig.templateId,
        publicKey: emailConfig.publicKey,
        fromName: emailConfig.fromName,
        to: item.lead.email,
        toName: item.lead.owner,
        subject: item.subject,
        body: item.body
      });
      setSendQueue(p => p.map(q => q.id === item.id ? { ...q, status:"sent", sentAt:new Date().toLocaleTimeString() } : q));
      setLeads(p => p.map(l => l.email === item.lead.email ? { ...l, status: item.type === "cold" ? "Emailed" : item.type === "fu1" ? "Follow-Up 1" : "Follow-Up 2" } : l));
      addToast(`✉ Sent to ${item.lead.name}`);
      if (autoFollowUp && item.type === "cold") scheduleFollowUp(item.lead, 1);
      if (autoFollowUp && item.type === "fu1") scheduleFollowUp(item.lead, 2);
    } catch(e) {
      setSendQueue(p => p.map(q => q.id === item.id ? { ...q, status:"failed", error:e.message } : q));
      addToast(`Failed: ${item.lead.name} — ${e.message}`, "error");
    }
  }

  // ── Send all queued ──
  async function sendAll() {
    if (!emailConfig.configured) { addToast("Configure EmailJS first in the Email Sender tab", "warn"); setTab("Email Sender"); return; }
    setSending(true);
    const queued = sendQueue.filter(q => q.status === "queued");
    for (const item of queued) {
      await sendOne(item);
      await new Promise(r => setTimeout(r, 1200));
    }
    setSending(false);
  }

  // ── Auto follow-up scheduler ──
  function scheduleFollowUp(lead, num) {
    const key = `${lead.email}_fu${num}`;
    if (autoFollowTimers.current[key]) return;
    const delayMs = followUpDelay * 1000;
    autoFollowTimers.current[key] = setTimeout(async () => {
      try {
        const [body, subject] = await Promise.all([agentWriteFollowUp(lead, num), agentSubject(lead, "followup")]);
        addToQueue(lead, subject, body, num === 1 ? "fu1" : "fu2");
        addToast(`Auto follow-up #${num} queued for ${lead.name}`, "warn");
      } catch(e) { addToast(`Follow-up gen failed for ${lead.name}`, "error"); }
    }, delayMs);
  }

  // ── Bulk queue all leads of niche ──
  async function handleBulkQueue() {
    setBulkGenerating(true); setAgentRunning(true);
    const targets = bulkSelectNiche === "All" ? leads.filter(l => l.status === "New") : leads.filter(l => l.niche === bulkSelectNiche && l.status === "New");
    let count = 0;
    for (const lead of targets) {
      try {
        const [body, subject] = await Promise.all([agentWriteEmail(lead), agentSubject(lead, "cold")]);
        addToQueue(lead, subject, body, "cold");
        count++;
      } catch(e) {}
      await new Promise(r => setTimeout(r, 400));
    }
    addToast(`${count} emails queued and ready to send`);
    setBulkGenerating(false); setAgentRunning(false);
  }

  // ── Per-lead schedule ──
  async function handleSchedule(lead) {
    setLeadActions(p => ({ ...p, [lead.email]: { ...p[lead.email], scheduling:true } }));
    const days = [7,8,9,10,11,12,13,14];
    const times = ["9:00 AM","10:00 AM","11:00 AM","2:00 PM","3:00 PM","4:00 PM"];
    const day = days[Math.floor(Math.random() * days.length)];
    const time = times[Math.floor(Math.random() * times.length)];
    setCalendar(p => [...p, {
      title: `Demo – ${lead.name}`,
      date: `2026-06-${String(day).padStart(2,"0")}`,
      time, with: lead.owner, email: lead.email,
      notes: `${lead.niche} in ${lead.city}, ${lead.state}`
    }]);
    setLeads(p => p.map(l => l.email === lead.email ? { ...l, status:"Meeting Set" } : l));
    setLeadActions(p => ({ ...p, [lead.email]: { scheduling:false } }));
    addToast(`Meeting booked with ${lead.owner} — Jun ${day} at ${time}`);
    setTab("Calendar");
  }

  // ── Chat ──
  async function handleChat() {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim(); setChatInput("");
    setMessages(p => [...p, { role:"user", content:msg }]);
    setChatLoading(true); setAgentRunning(true);
    try {
      const reply = await agentChat(messages, msg);
      setMessages(p => [...p, { role:"assistant", content:reply }]);
    } catch(e) {
      setMessages(p => [...p, { role:"assistant", content:"⚠️ " + e.message }]);
    }
    setChatLoading(false); setAgentRunning(false);
  }

  const filteredLeads = leads.filter(l => {
    const matchFilter = leadFilter === "All" || l.status === leadFilter;
    const matchSearch = !leadSearch || l.name.toLowerCase().includes(leadSearch.toLowerCase()) || l.owner.toLowerCase().includes(leadSearch.toLowerCase()) || l.city.toLowerCase().includes(leadSearch.toLowerCase());
    return matchFilter && matchSearch;
  });

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#070b12", fontFamily:"'DM Sans',system-ui,sans-serif", color:"#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Sora:wght@700;800&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:4px}
        input::placeholder,textarea::placeholder{color:#4b5563}
        select option{background:#0f172a}
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ position:"fixed", left:0, top:0, bottom:0, width:220, background:"rgba(7,11,18,0.98)", borderRight:"1px solid rgba(255,255,255,0.06)", display:"flex", flexDirection:"column", padding:"24px 14px", zIndex:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#00e5ff,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:17, color:"#fff", fontFamily:"'Sora',sans-serif", flexShrink:0 }}>N</div>
          <div>
            <div style={{ fontFamily:"'Sora',sans-serif", fontSize:17, fontWeight:800, color:"#f0f4ff", letterSpacing:-0.5 }}>Navain AI</div>
            <div style={{ fontSize:9, color:"#475569", letterSpacing:1.2, textTransform:"uppercase" }}>Sales Command Center</div>
          </div>
        </div>

        <AgentPill running={agentRunning} />

        <nav style={{ marginTop:24, flex:1 }}>
          {TABS.map(t => {
            const icons = { Dashboard:"⬛", Leads:"👥", "Email Sender":"✉", Campaigns:"📊", Calendar:"📅", "Agent Chat":"🤖" };
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:active?"rgba(0,229,255,0.08)":"transparent", border:active?"1px solid rgba(0,229,255,0.18)":"1px solid transparent", color:active?"#00e5ff":"#64748b", fontSize:13, fontWeight:active?700:500, cursor:"pointer", fontFamily:"inherit", marginBottom:4, transition:"all 0.15s", textAlign:"left" }}>
                <span style={{ fontSize:14 }}>{icons[t]}</span>{t}
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:16, marginTop:8 }}>
          <div style={{ fontSize:11, color:"#1e293b", marginBottom:6 }}>USA LEADS ONLY</div>
          <div style={{ fontSize:11, color:"#334155" }}>Powered by Claude via</div>
          <div style={{ fontSize:11, color:"#00e5ff", fontWeight:700 }}>Vercel Proxy API</div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ marginLeft:220, padding:"32px 36px", maxWidth:1100 }}>

        {/* ════ DASHBOARD ════ */}
        {tab === "Dashboard" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:28, fontWeight:800, color:"#f0f4ff", letterSpacing:-0.5 }}>Sales Dashboard</h1>
              <p style={{ color:"#475569", fontSize:13, marginTop:4 }}>AI-powered outreach for Navain AI · USA only · Secured via Vercel</p>
            </div>

            <div style={{ display:"flex", gap:14, marginBottom:22, flexWrap:"wrap" }}>
              <StatCard label="Total Leads" value={totalLeads} icon="👥" color="#00e5ff" />
              <StatCard label="Emailed" value={emailedCount} icon="✉️" color="#f59e0b" />
              <StatCard label="Meetings Booked" value={meetingsCount} icon="📅" color="#10b981" note={meetingsCount > 0 ? "🔥 Active" : ""} />
              <StatCard label="Emails Sent" value={sentEmails} icon="📤" color="#a78bfa" />
              {failedEmails > 0 && <StatCard label="Failed" value={failedEmails} icon="⚠️" color="#f87171" />}
            </div>

            <Section title="🚀 Quick: Generate Leads" sub="Claude AI generates realistic USA business leads — no external database">
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
                <div style={{ flex:1, minWidth:150 }}>
                  <label style={{ fontSize:11, color:"#64748b", display:"block", marginBottom:5 }}>NICHE</label>
                  <select value={scrapeNiche} onChange={e=>setScrapeNiche(e.target.value)} style={sel}>
                    {NICHES.map(n=><option key={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ flex:1, minWidth:180 }}>
                  <label style={{ fontSize:11, color:"#64748b", display:"block", marginBottom:5 }}>CITY (USA)</label>
                  <select value={scrapeCity} onChange={e=>setScrapeCity(e.target.value)} style={sel}>
                    {USA_CITIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ width:90 }}>
                  <label style={{ fontSize:11, color:"#64748b", display:"block", marginBottom:5 }}>COUNT</label>
                  <select value={scrapeCount} onChange={e=>setScrapeCount(+e.target.value)} style={sel}>
                    {[5,10,15,20].map(n=><option key={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={handleScrape} disabled={scraping} style={pBtn(scraping)}>
                  {scraping ? <><Spinner/>Generating…</> : "⚡ Generate Leads"}
                </button>
              </div>
              {scrapeErr && <div style={{ color:"#f87171", fontSize:12, marginTop:10, background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:8, padding:"8px 12px" }}>⚠ {scrapeErr}</div>}
            </Section>

            <Section title="📤 Send Queue" sub={`${sendQueue.filter(q=>q.status==="queued").length} queued · ${sentEmails} sent`}
              action={<button onClick={sendAll} disabled={sending || !sendQueue.some(q=>q.status==="queued")} style={pBtn(sending || !sendQueue.some(q=>q.status==="queued"))}>
                {sending ? <><Spinner/>Sending…</> : "Send All →"}
              </button>}>
              {sendQueue.length === 0 && <div style={{ color:"#334155", textAlign:"center", padding:30, fontSize:13 }}>No emails queued. Generate leads then click "Generate Email" on each lead.</div>}
              {sendQueue.slice(-10).reverse().map(item => {
                const statusColor = item.status === "sent" ? "#4ade80" : item.status === "failed" ? "#f87171" : item.status === "sending" ? "#fbbf24" : "#64748b";
                return (
                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:"#f0f4ff" }}>{item.lead.name}</div>
                      <div style={{ fontSize:11, color:"#64748b" }}>{item.lead.email} · {item.type === "cold" ? "Cold Email" : item.type === "fu1" ? "Follow-Up 1" : "Follow-Up 2"}</div>
                      <div style={{ fontSize:11, color:"#475569", marginTop:1 }}>Subj: {item.subject}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <span style={{ fontSize:11, color:statusColor, fontWeight:700, textTransform:"uppercase" }}>{item.status}</span>
                      {item.sentAt && <div style={{ fontSize:10, color:"#475569" }}>Sent {item.sentAt}</div>}
                      {item.error && <div style={{ fontSize:10, color:"#f87171", maxWidth:180, wordBreak:"break-all" }}>{item.error}</div>}
                    </div>
                    {item.status === "queued" && (
                      <button onClick={()=>sendOne(item)} disabled={!emailConfig.configured || sending} style={microBtn("#00e5ff", !emailConfig.configured || sending)}>Send</button>
                    )}
                    {item.status === "failed" && (
                      <button onClick={()=>{setSendQueue(p=>p.map(q=>q.id===item.id?{...q,status:"queued",error:null}:q));}} style={microBtn("#f87171", false)}>Retry</button>
                    )}
                  </div>
                );
              })}
            </Section>
          </div>
        )}

        {/* ════ LEADS ════ */}
        {tab === "Leads" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
              <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:"#f0f4ff" }}>Leads <span style={{ color:"#334155", fontSize:18 }}>({filteredLeads.length})</span></h1>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <input value={leadSearch} onChange={e=>setLeadSearch(e.target.value)} placeholder="Search leads…" style={{ ...inp, width:180 }} />
                <select value={leadFilter} onChange={e=>setLeadFilter(e.target.value)} style={{ ...sel, width:140 }}>
                  {["All","New","Emailed","Follow-Up 1","Follow-Up 2","Meeting Set","Closed","Bounced"].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Bulk actions */}
            <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
              <select value={bulkSelectNiche} onChange={e=>setBulkSelectNiche(e.target.value)} style={{ ...sel, width:160 }}>
                <option value="All">All Niches</option>
                {NICHES.map(n=><option key={n}>{n}</option>)}
              </select>
              <button onClick={handleBulkQueue} disabled={bulkGenerating} style={pBtn(bulkGenerating)}>
                {bulkGenerating ? <><Spinner/>Writing emails…</> : "⚡ Bulk Generate Emails"}
              </button>
              <span style={{ color:"#334155", fontSize:12 }}>Generates cold emails for all New leads</span>
            </div>

            {filteredLeads.length === 0 && (
              <div style={{ textAlign:"center", padding:60, color:"#334155" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
                <div>No leads found. Generate some from the Dashboard!</div>
              </div>
            )}

            {filteredLeads.map(lead => {
              const action = leadActions[lead.email] || {};
              return (
                <div key={lead.email} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18, marginBottom:10, animation:"fadeIn 0.2s ease" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:"#f0f4ff" }}>{lead.name}</div>
                      <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>{lead.owner} · {lead.phone}</div>
                      <div style={{ color:"#475569", fontSize:12 }}>{lead.city}, {lead.state} · {lead.niche}</div>
                      <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>✉ {lead.email}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <Badge status={lead.status} />
                      {!action.body && (
                        <button onClick={()=>handleGenerateEmail(lead)} disabled={action.loading} style={microBtn("#00e5ff", action.loading)}>
                          {action.loading ? <Spinner size={11}/> : "Draft Email"}
                        </button>
                      )}
                      {action.body && (
                        <button onClick={()=>addToQueue(lead, action.subject, action.body, action.type||"cold")} style={microBtn("#4ade80", false)}>
                          + Queue
                        </button>
                      )}
                      {lead.status !== "Meeting Set" && (
                        <button onClick={()=>handleSchedule(lead)} disabled={action.scheduling} style={microBtn("#f59e0b", action.scheduling)}>
                          {action.scheduling ? <Spinner size={11}/> : "📅 Schedule"}
                        </button>
                      )}
                      <button onClick={()=>setLeads(p=>p.map(l=>l.email===lead.email?{...l,status:"Bounced"}:l))} style={microBtn("#ef4444", false)}>Bounce</button>
                    </div>
                  </div>

                  {action.error && <div style={{ color:"#f87171", fontSize:12, marginTop:8 }}>⚠ {action.error}</div>}

                  {action.body && (
                    <div style={{ marginTop:14, background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.12)", borderRadius:10, padding:14 }}>
                      <div style={{ fontSize:11, color:"#00e5ff", fontWeight:700, marginBottom:6 }}>✉ DRAFT · Subject: {action.subject}</div>
                      <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{action.body}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ════ EMAIL SENDER ════ */}
        {tab === "Email Sender" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:"#f0f4ff", marginBottom:6 }}>✉ Email Sender</h1>
            <p style={{ color:"#475569", fontSize:13, marginBottom:22 }}>Configured with EmailJS — emails sent from your Gmail account.</p>

            {/* Config Panel */}
            <Section title="EmailJS Configuration" sub={emailConfig.configured ? "✓ Connected & ready to send" : "⚠ Not configured — emails won't send"}
              action={<button onClick={()=>setShowConfig(p=>!p)} style={secBtn}>{showConfig?"Hide":"Configure"}</button>}>

              {!emailConfig.configured && !showConfig && (
                <div style={{ color:"#f59e0b", fontSize:13, background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.18)", borderRadius:8, padding:"10px 14px" }}>
                  ⚠ EmailJS is not configured. Click "Configure" to add your credentials.
                </div>
              )}

              {emailConfig.configured && !showConfig && (
                <div style={{ color:"#4ade80", fontSize:13 }}>Service: {emailConfig.serviceId} · Template: {emailConfig.templateId} · Sender: {emailConfig.fromName}</div>
              )}

              {showConfig && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.12)", borderRadius:10, padding:14, fontSize:12, color:"#64748b", lineHeight:1.8 }}>
                    <strong style={{ color:"#00e5ff" }}>Setup steps:</strong><br/>
                    1. Sign up at <strong style={{color:"#e2e8f0"}}>emailjs.com</strong> → connect your Gmail<br/>
                    2. Create a template with variables: <code style={{color:"#a78bfa"}}>{"{{subject}} {{message}} {{to_email}} {{to_name}} {{from_name}} {{reply_to}}"}</code><br/>
                    3. Copy your Service ID, Template ID, and Public Key below
                  </div>
                  {[["Service ID","serviceId","service_abc123"],["Template ID","templateId","template_xyz789"],["Public Key","publicKey","your_public_key"],["From Name","fromName","Hunain | Navain AI"]].map(([label,key,ph])=>(
                    <div key={key}>
                      <label style={{ fontSize:11, color:"#64748b", display:"block", marginBottom:5 }}>{label.toUpperCase()}</label>
                      <input type={key==="publicKey"?"password":"text"} placeholder={ph} value={configDraft[key]} onChange={e=>setConfigDraft(p=>({...p,[key]:e.target.value}))} style={inp} />
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={()=>{
                      if(!configDraft.serviceId||!configDraft.templateId||!configDraft.publicKey) { addToast("Fill all fields","warn"); return; }
                      const cfg = {...configDraft, configured:true};
                      setEmailConfig(cfg);
                      try { localStorage.setItem("navain_emailjs_config", JSON.stringify(cfg)); } catch(e) {}
                      setShowConfig(false);
                      addToast("EmailJS saved permanently ✓");
                    }} style={pBtn(false)}>Save Configuration</button>
                    <button onClick={()=>setShowConfig(false)} style={secBtn}>Cancel</button>
                  </div>
                </div>
              )}
            </Section>

            {/* Auto Follow-Up */}
            <Section title="⏱ Auto Follow-Up" sub="Automatically queue follow-ups after emails are sent">
              <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13 }}>
                  <input type="checkbox" checked={autoFollowUp} onChange={e=>setAutoFollowUp(e.target.checked)} style={{ width:16, height:16, cursor:"pointer" }} />
                  <span style={{ color:autoFollowUp?"#4ade80":"#64748b", fontWeight:600 }}>Enable auto follow-up</span>
                </label>
                {autoFollowUp && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <label style={{ fontSize:12, color:"#64748b" }}>Delay (days):</label>
                    <select value={followUpDelay} onChange={e=>setFollowUpDelay(+e.target.value)} style={{ ...sel, width:80 }}>
                      {[1,2,3,5,7,10].map(n=><option key={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Section>

            {/* Send Queue */}
            <Section title="📤 Send Queue" sub={`${sendQueue.filter(q=>q.status==="queued").length} queued · ${sentEmails} sent · ${failedEmails} failed`}
              action={<button onClick={sendAll} disabled={sending||!sendQueue.some(q=>q.status==="queued")} style={pBtn(sending||!sendQueue.some(q=>q.status==="queued"))}>
                {sending?<><Spinner/>Sending…</>:"Send All →"}
              </button>}>
              {sendQueue.length === 0 && <div style={{ color:"#334155", textAlign:"center", padding:30, fontSize:13 }}>No emails in queue. Go to Leads and click "Draft Email" then "+ Queue".</div>}
              {sendQueue.map(item => {
                const statusColor = item.status==="sent"?"#4ade80":item.status==="failed"?"#f87171":item.status==="sending"?"#fbbf24":"#64748b";
                return (
                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:"#f0f4ff" }}>{item.lead.name}</div>
                      <div style={{ fontSize:11, color:"#64748b" }}>{item.lead.email} · {item.type==="cold"?"Cold Email":item.type==="fu1"?"Follow-Up 1":"Follow-Up 2"}</div>
                      <div style={{ fontSize:11, color:"#475569", marginTop:1 }}>Subj: {item.subject}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <span style={{ fontSize:11, color:statusColor, fontWeight:700, textTransform:"uppercase" }}>{item.status}</span>
                      {item.sentAt && <div style={{ fontSize:10, color:"#475569" }}>Sent {item.sentAt}</div>}
                      {item.error && <div style={{ fontSize:10, color:"#f87171", maxWidth:180, wordBreak:"break-all" }}>{item.error}</div>}
                    </div>
                    {item.status==="queued" && (
                      <button onClick={()=>sendOne(item)} disabled={!emailConfig.configured||sending} style={microBtn("#00e5ff",!emailConfig.configured||sending)}>Send</button>
                    )}
                    {item.status==="failed" && (
                      <button onClick={()=>setSendQueue(p=>p.map(q=>q.id===item.id?{...q,status:"queued",error:null}:q))} style={microBtn("#f87171",false)}>Retry</button>
                    )}
                  </div>
                );
              })}
            </Section>
          </div>
        )}

        {/* ════ CAMPAIGNS ════ */}
        {tab === "Campaigns" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:"#f0f4ff", marginBottom:20 }}>Campaigns</h1>
            {[
              { name:"Spas – Salt Lake City, UT", status:"Active", sent:24, replied:6, meetings:2, created:"Jun 1" },
              { name:"Auto Repair – Phoenix, AZ", status:"Active", sent:18, replied:4, meetings:1, created:"Jun 2" },
              { name:"Dental Offices – Austin, TX", status:"Paused", sent:11, replied:2, meetings:0, created:"Jun 3" },
            ].map((c,i) => (
              <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:22, marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:"#f0f4ff" }}>{c.name}</div>
                    <div style={{ fontSize:12, color:"#475569" }}>Started {c.created} · USA only</div>
                  </div>
                  <span style={{ background:c.status==="Active"?"rgba(74,222,128,0.12)":"rgba(100,116,139,0.12)", color:c.status==="Active"?"#4ade80":"#64748b", padding:"4px 14px", borderRadius:20, fontSize:11, fontWeight:700 }}>● {c.status}</span>
                </div>
                <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                  {[["Sent",c.sent,"#00e5ff"],["Replied",c.replied,"#a78bfa"],["Meetings",c.meetings,"#4ade80"],["Reply Rate",`${Math.round(c.replied/c.sent*100)}%`,"#fb923c"]].map(([l,v,col]) => (
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:24, fontWeight:800, color:col, fontFamily:"'Sora',sans-serif" }}>{v}</div>
                      <div style={{ fontSize:11, color:"#475569" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div onClick={()=>setTab("Agent Chat")} style={{ border:"2px dashed rgba(0,229,255,0.12)", borderRadius:14, padding:26, textAlign:"center", cursor:"pointer", background:"rgba(0,229,255,0.02)" }}>
              <div style={{ color:"#00e5ff", fontWeight:700, fontSize:14 }}>+ New Campaign</div>
              <div style={{ color:"#334155", fontSize:12, marginTop:4 }}>Ask the agent to set up a targeted USA campaign</div>
            </div>
          </div>
        )}

        {/* ════ CALENDAR ════ */}
        {tab === "Calendar" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:"#f0f4ff", marginBottom:6 }}>📅 Meeting Calendar</h1>
            <p style={{ color:"#475569", fontSize:13, marginBottom:22 }}>Scheduled demo calls. Book more from the Leads tab.</p>
            {calendar.length === 0 && <div style={{ color:"#334155", textAlign:"center", padding:60 }}>No meetings yet. Go to Leads → Schedule.</div>}
            {calendar.map((m,i) => {
              const day = m.date?.split("-")[2] || "?";
              return (
                <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:20, marginBottom:10, display:"flex", gap:16, alignItems:"center", animation:"fadeIn 0.25s ease" }}>
                  <div style={{ background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.18)", borderRadius:12, padding:"12px 16px", textAlign:"center", minWidth:52, flexShrink:0 }}>
                    <div style={{ fontSize:22, fontWeight:800, color:"#4ade80", fontFamily:"'Sora',sans-serif", lineHeight:1 }}>{day}</div>
                    <div style={{ fontSize:10, color:"#10b981", textTransform:"uppercase", letterSpacing:0.5, marginTop:2 }}>Jun</div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#f0f4ff" }}>{m.title}</div>
                    <div style={{ color:"#64748b", fontSize:12, marginTop:3 }}>{m.time} · {m.with}</div>
                    <div style={{ color:"#475569", fontSize:12 }}>{m.email}</div>
                    {m.notes && <div style={{ color:"#4ade80", fontSize:12, marginTop:4 }}>"{m.notes}"</div>}
                  </div>
                  <span style={{ background:"rgba(74,222,128,0.1)", color:"#4ade80", padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700 }}>Confirmed</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ════ AGENT CHAT ════ */}
        {tab === "Agent Chat" && (
          <div style={{ animation:"fadeIn 0.3s ease", display:"flex", flexDirection:"column", height:"calc(100vh - 64px)" }}>
            <div style={{ marginBottom:14 }}>
              <h1 style={{ fontFamily:"'Sora',sans-serif", fontSize:26, fontWeight:800, color:"#f0f4ff" }}>🤖 NavainBot</h1>
              <p style={{ color:"#475569", fontSize:13, marginTop:3 }}>Powered by Claude via Vercel · Strategy, sequences, objection handling</p>
            </div>
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              {["Best USA niches for AI receptionists?","How do I handle price objections?","Write a 3-email sequence for dental offices","What's the close rate strategy for cold outreach?"].map((q,i) => (
                <button key={i} onClick={()=>setChatInput(q)} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", color:"#94a3b8", borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{q}</button>
              ))}
            </div>
            <div ref={chatRef} style={{ flex:1, overflowY:"auto", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:14, marginBottom:14 }}>
              {messages.map((m,i) => (
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", animation:"fadeIn 0.2s ease" }}>
                  <div style={{ maxWidth:"82%", padding:"12px 16px", borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px", background:m.role==="user"?"rgba(0,229,255,0.09)":"rgba(255,255,255,0.04)", border:`1px solid ${m.role==="user"?"rgba(0,229,255,0.18)":"rgba(255,255,255,0.07)"}`, fontSize:13, lineHeight:1.7, color:"#e2e8f0", whiteSpace:"pre-wrap" }}>
                    {m.role==="assistant" && <div style={{ fontSize:10, color:"#00e5ff", marginBottom:5, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>NavainBot · Claude</div>}
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && <div style={{ display:"flex", gap:5, padding:8 }}>{[0,1,2].map(j=><span key={j} style={{ width:7,height:7,borderRadius:"50%",background:"#00e5ff",animation:`pulse 1s infinite ${j*0.18}s` }}/>)}</div>}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleChat()} placeholder="Ask about strategy, niches, objections, follow-up cadence…" style={{ flex:1, ...inp }} />
              <button onClick={handleChat} disabled={chatLoading||!chatInput.trim()} style={pBtn(chatLoading||!chatInput.trim())}>
                {chatLoading ? <Spinner/> : "Send ↑"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div style={{ position:"fixed", bottom:24, right:24, display:"flex", flexDirection:"column", gap:10, zIndex:9999 }}>
        {toasts.map(t => <Toast key={t.id} msg={t.msg} type={t.type} onClose={()=>setToasts(p=>p.filter(x=>x.id!==t.id))} />)}
      </div>
    </div>
  );
}
