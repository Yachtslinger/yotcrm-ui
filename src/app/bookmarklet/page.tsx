export default function BookmarkletPage() {
  const BASE = "https://yotcrm-production.up.railway.app";
  const code = `javascript:(function(){const B="${BASE}";const o=document.createElement("div");o.style.cssText="position:fixed;top:20px;right:20px;z-index:999999;background:#0f1b2d;color:#d4af60;font:600 14px/1 system-ui;padding:14px 20px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.5);border:1px solid rgba(212,175,96,.4);min-width:220px;text-align:center";o.textContent="⚓ YotCRM — Reading page…";document.body.appendChild(o);let rs=null;try{rs=window.__REDUX_STATE__||null}catch(_){}const jl=[];document.querySelectorAll('script[type="application/ld+json"]').forEach(e=>{try{const p=JSON.parse(e.textContent||"");(Array.isArray(p)?p:p["@graph"]?p["@graph"]:[p]).forEach(n=>n&&jl.push(n))}catch(_){}});const mt={};document.querySelectorAll("meta[property],meta[name]").forEach(e=>{const k=e.getAttribute("property")||e.getAttribute("name")||"";const v=e.getAttribute("content")||"";if(k&&v)mt[k]=v});const imgs=[];document.querySelectorAll("img[src]").forEach(i=>{const s=i.src||"";if(s.startsWith("http")&&i.naturalWidth>200&&!/logo|icon|sprite|avatar|favicon/i.test(s))imgs.push(s)});o.textContent="⚓ YotCRM — Sending…";fetch(B+"/api/brochures/ingest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pageUrl:location.href,reduxState:rs,metaTags:mt,jsonLd:jl,images:imgs.slice(0,50),title:document.title}),credentials:"include"}).then(r=>r.json()).then(d=>{if(!d.ok||!d.vessel)throw new Error(d.error||"Failed");sessionStorage.setItem("__yotcrm_ingest",JSON.stringify(d.vessel));o.textContent="✅ Opening editor…";setTimeout(()=>{o.remove();window.open(B+"/brochures?ingest=1","_blank")},600)}).catch(e=>{o.textContent="❌ "+(e.message||"Error");setTimeout(()=>o.remove(),4000)})})();`;

  return (
    <html>
      <head>
        <title>⚓ YotCRM Bookmarklet</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0a1628; font-family: system-ui, sans-serif; min-height: 100vh;
            display: flex; align-items: center; justify-content: center; padding: 24px; }
          .card { background: #0f1b2d; border: 1px solid rgba(212,175,96,.3); border-radius: 20px;
            padding: 40px; max-width: 560px; width: 100%; text-align: center; }
          .anchor { font-size: 56px; margin-bottom: 16px; }
          h1 { color: #d4af60; font-size: 24px; font-weight: 700; margin-bottom: 8px; }
          .sub { color: #64748b; font-size: 14px; margin-bottom: 36px; }
          .drag-btn {
            display: inline-block;
            background: linear-gradient(135deg, #d4af60, #b8943a);
            color: #0a1628; font-size: 18px; font-weight: 800;
            padding: 18px 32px; border-radius: 14px; text-decoration: none;
            cursor: grab; border: none;
            box-shadow: 0 4px 20px rgba(212,175,96,.4);
            user-select: none;
          }
          .drag-btn:active { cursor: grabbing; }
          .instruction { margin-top: 28px; }
          .step { display: flex; align-items: flex-start; gap: 12px; text-align: left;
            margin-bottom: 14px; }
          .num { background: rgba(212,175,96,.15); color: #d4af60; font-weight: 700;
            width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center;
            justify-content: center; flex-shrink: 0; font-size: 13px; }
          .step-text { color: #94a3b8; font-size: 14px; line-height: 1.5; padding-top: 4px; }
          .step-text strong { color: #cbd5e1; }
          .divider { border: none; border-top: 1px solid rgba(255,255,255,.06); margin: 28px 0; }
          .works { color: #64748b; font-size: 12px; }
          .works span { color: #d4af60; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="anchor">⚓</div>
          <h1>YotCRM Bookmarklet</h1>
          <p className="sub">One click → branded brochure from any listing page</p>

          <a href={code} className="drag-btn" onClick={e => e.preventDefault()}>
            ⚓ YotCRM — drag me to your bookmarks bar
          </a>

          <div className="instruction" style={{marginTop: 32}}>
            <div className="step">
              <div className="num">1</div>
              <div className="step-text"><strong>Make sure your bookmarks bar is visible</strong> — Safari menu → View → Show Favorites Bar</div>
            </div>
            <div className="step">
              <div className="num">2</div>
              <div className="step-text"><strong>Drag the gold button above</strong> up to your bookmarks bar and drop it there</div>
            </div>
            <div className="step">
              <div className="num">3</div>
              <div className="step-text"><strong>Go to any listing</strong> on YachtWorld, Boat International, Superyacht Times, Denison — then click ⚓ YotCRM in your bar</div>
            </div>
            <div className="step">
              <div className="num">4</div>
              <div className="step-text"><strong>Brochure editor opens</strong> pre-filled with all specs and photos, branded with your name — publish and send the link</div>
            </div>
          </div>

          <hr className="divider" />
          <p className="works">Works on: <span>YachtWorld · Boat International · Superyacht Times · Denison · any listing site</span></p>
        </div>
      </body>
    </html>
  );
}
