/**
 * extract_from_texts.js — deep prospect profiles from iMessage history.
 * PRIVACY SCOPE (hard rules, enforced below):
 *  - Reads ONLY threads whose handle matches a CRM lead (phone/email).
 *  - Sends thread text to the AI for extraction; STORES only derived fields:
 *    criteria (as drafts), a dossier summary, source ref. Raw texts are never stored.
 *  - Never overwrites APPROVED criteria. Dossier is additive intel.
 * Run: node scripts/extract_from_texts.js [--tier=A|B] (A=active buyers, B=recent unsorted)
 */
const fs=require("fs"), os=require("os");
const Database=require("better-sqlite3");
try{for(const line of fs.readFileSync(".env.local","utf8").split("\n")){
  const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch{}
const KEY=process.env.ANTHROPIC_API_KEY; if(!KEY){console.error("no key");process.exit(1);}
const TIER=(process.argv.find(a=>a.startsWith("--tier="))||"--tier=A").split("=")[1];

const msg=new Database(os.homedir()+"/Library/Messages/chat.db",{readonly:true});
const crm=new Database("/Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db");

// Decode attributedBody blobs: longest printable UTF-8 runs, minus framework tokens
const JUNK=/^(NSString|NSAttributedString|NSDictionary|NSNumber|NSObject|NSMutableString|streamtyped|__kIM\w*|\+?[A-Za-z]{1,2})$/;
function decodeBlob(buf){
  if(!buf)return "";
  const s=buf.toString("utf8");
  const runs=s.match(/[\x20-\x7E\u00A0-\uFFFF]{3,}/g)||[];
  const good=runs.filter(r=>!JUNK.test(r.trim())&&!r.startsWith("bplist"));
  good.sort((a,b)=>b.length-a.length);
  return (good[0]||"").slice(0,800);
}
const toISO=d=>d?new Date(d/1e6+978307200000).toISOString().slice(0,10):"";

const targets = TIER==="A"
  ? crm.prepare(`SELECT l.id, l.first_name, l.last_name, l.profile_status, s.handle_rid
      FROM leads l JOIN lead_text_stats s ON s.lead_id=l.id
      WHERE l.category='active_buyer' AND (l.dossier IS NULL OR l.dossier='')`).all()
  : crm.prepare(`SELECT l.id, l.first_name, l.last_name, l.profile_status, s.handle_rid
      FROM leads l JOIN lead_text_stats s ON s.lead_id=l.id
      WHERE l.category IS NULL AND s.last_msg_at>=datetime('now','-180 days')
        AND s.msg_count>=5 AND (l.dossier IS NULL OR l.dossier='')`).all();
console.log(`Tier ${TIER}: ${targets.length} threads to profile`);

const getMsgs=msg.prepare(`SELECT text, attributedBody, is_from_me, date FROM message
  WHERE handle_id=? ORDER BY date DESC LIMIT 120`);

async function extract(name, transcript){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
    headers:{"content-type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:900,messages:[{role:"user",content:
`You are building a yacht broker's client intelligence file from his text thread with ${name}. "ME" = the broker (Will). Return JSON only:
{"budget_min":int|null,"budget_max":int|null,"loa_min":int|null,"loa_max":int|null,"year_min":int|null,"year_max":int|null,
"make_preference":str|null,"vessel_type_pref":str|null,"confidence":{"field":0-1},
"dossier":"3-6 sentence broker brief: who they are, boats owned/discussed, what they want, budget signals, family/personal details mentioned, deal history, how to approach them",
"temperature":"hot|warm|cool|cold"|null,"is_prospect":true|false}
Rules: sizes in feet (convert meters x3.28). Only state criteria actually evidenced. Meters notation like 35M means meters. is_prospect=false if clearly not a boat buyer/seller relationship.
THREAD (newest first):
${transcript.slice(0,12000)}`}]})});
  if(!res.ok)throw new Error("API "+res.status);
  const data=await res.json();
  const t=data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
  const a=t.indexOf("{"),b=t.lastIndexOf("}");
  return JSON.parse(t.slice(a,b+1));
}

const saveCrit=crm.prepare(`UPDATE leads SET
  budget_min=COALESCE(@budget_min,budget_min), budget_max=COALESCE(@budget_max,budget_max),
  loa_min=COALESCE(@loa_min,loa_min), loa_max=COALESCE(@loa_max,loa_max),
  year_min=COALESCE(@year_min,year_min), year_max=COALESCE(@year_max,year_max),
  make_preference=COALESCE(@make_preference,make_preference),
  vessel_type_pref=COALESCE(@vessel_type_pref,vessel_type_pref),
  profile_status='draft', profile_confidence_json=@conf, profile_source_ref='texts:thread'
  WHERE id=@id AND profile_status IN ('none','draft')`);
const saveDossier=crm.prepare(`UPDATE leads SET dossier=@d WHERE id=@id`);
const suggestCat=crm.prepare(`UPDATE leads SET suggested_category=@c, prospect_score=@s, suggest_reason=@r
  WHERE id=@id AND category IS NULL`);

(async()=>{
  let ok=0,fail=0,nonProspect=0;
  for(const t of targets){
    try{
      const rows=getMsgs.all(t.handle_rid);
      const lines=[];
      for(const r of rows.reverse()){
        const txt=(r.text&&r.text.trim())||decodeBlob(r.attributedBody);
        if(!txt||txt.length<2)continue;
        lines.push(`[${toISO(r.date)}] ${r.is_from_me?"ME":name0(t)}: ${txt.slice(0,300)}`);
      }
      if(lines.length<3){fail++;continue;}
      const p=await extract(`${t.first_name} ${t.last_name}`.trim(), lines.join("\n"));
      if(p.dossier)saveDossier.run({id:t.id,d:p.dossier});
      if(p.is_prospect!==false){
        saveCrit.run({id:t.id,budget_min:p.budget_min,budget_max:p.budget_max,loa_min:p.loa_min,
          loa_max:p.loa_max,year_min:p.year_min,year_max:p.year_max,make_preference:p.make_preference,
          vessel_type_pref:p.vessel_type_pref,conf:JSON.stringify(p.confidence||{})});
        if(TIER==="B")suggestCat.run({id:t.id,c:"active_buyer",s:75,r:"active text relationship, boat interest evidenced"});
      } else { nonProspect++; if(TIER==="B")suggestCat.run({id:t.id,c:null,s:10,r:"texts show non-prospect relationship"}); }
      ok++;process.stdout.write(".");
      await new Promise(r=>setTimeout(r,250));
    }catch(e){fail++;console.error(`\n#${t.id}: ${e.message}`);}
  }
  function name0(t){return t.first_name||"THEM";}
  console.log(`\nDone. profiled=${ok} nonProspect=${nonProspect} failed=${fail}`);
  msg.close();crm.close();
})();
function name0(t){return t.first_name||"THEM";}
