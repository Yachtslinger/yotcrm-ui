"use client";
import React from "react";

const BASE = "https://yotcrm-production.up.railway.app";

const code = "javascript:(function(){var d=null;try{var rd=window.__REDUX_STATE__&&window.__REDUX_STATE__.app&&window.__REDUX_STATE__.app.data;if(rd&&rd.id){var med=rd.media||[];var imgs=med.filter(function(m){return m.mediaType!=='video'&&!m.videoUrl;}).map(function(m){var s=m.originalImageUrl||m.url||m.thumbnailUrl||'';if(s.indexOf('//')==0)s='https:'+s;return{src:s,alt:m.title||''};}).filter(function(m){return m.src.indexOf('http')==0&&!/logo|icon|sprite|servedby/i.test(m.src);});var usd=rd.price&&rd.price.type&&rd.price.type.amount&&rd.price.type.amount.USD;var loc=rd.location&&rd.location.address;var dims=rd.specifications&&rd.specifications.dimensions;var spd=rd.specifications&&rd.specifications.speedDistance;var acc=rd.specifications&&rd.specifications.accommodation;var engs=rd.propulsion&&rd.propulsion.engines||[];var tanks=rd.tanks||{};d={name:rd.boatName||'',builder:rd.make||'',year:rd.year||null,price:usd?'$'+Number(usd).toLocaleString('en-US'):'',location:loc?[loc.city,loc.subdivision,loc.country].filter(Boolean).join(', '):'',description:(rd.descriptionNoHTML||'').slice(0,2000),loa:dims&&dims.lengths&&dims.lengths.nominal&&dims.lengths.nominal.ft?dims.lengths.nominal.ft+' ft / '+dims.lengths.nominal.m+' m':'',beam:dims&&dims.beam&&dims.beam.ft?dims.beam.ft+' ft / '+dims.beam.m+' m':'',draft:dims&&dims.maxDraft&&dims.maxDraft.ft?dims.maxDraft.ft+' ft / '+dims.maxDraft.m+' m':'',maxSpeed:spd&&spd.maxSpeed&&spd.maxSpeed.kn?spd.maxSpeed.kn+' kn':'',cruiseSpeed:spd&&spd.cruisingSpeed&&spd.cruisingSpeed.kn?spd.cruisingSpeed.kn+' kn':'',range:spd&&spd.range&&spd.range.nmi?spd.range.nmi+' nmi':'',staterooms:acc&&acc.cabins!=null?String(acc.cabins):'',guests:acc&&acc.passengers!=null?String(acc.passengers):'',crew:acc&&acc.crew!=null?String(acc.crew):'',engines:engs.length?((engs.length>1?engs.length+'x ':'')+[engs[0].make,engs[0].model].filter(Boolean).join(' ')):'',power:engs.length&&engs[0].power&&engs[0].power.hp?engs[0].power.hp+' hp':'',fuelTank:tanks.fuel&&tanks.fuel[0]&&tanks.fuel[0].capacity?Math.round(tanks.fuel[0].capacity.gal).toLocaleString('en-US')+' gal / '+Math.round(tanks.fuel[0].capacity.l).toLocaleString('en-US')+' lt':'',sourceUrl:location.href,images:imgs,features:[]};}}catch(e){}if(!d){var mt={};document.querySelectorAll('meta[property],meta[name]').forEach(function(el){var k=el.getAttribute('property')||el.getAttribute('name')||'';var v=el.getAttribute('content')||'';if(k&&v)mt[k]=v;});d={name:mt['og:title']||document.title||'',builder:'',year:null,price:'',location:'',description:mt['og:description']||'',loa:'',beam:'',draft:'',engines:'',images:mt['og:image']?[{src:mt['og:image'],alt:''}]:[],sourceUrl:location.href,features:[]};}window.name='__yotcrm__'+JSON.stringify(d);location.href='https://yotcrm-production.up.railway.app/brochures?ingest=name';})()";

export default function BookmarkletPage() {
  const [copied, setCopied] = React.useState(false);

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a1628",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#0f1b2d", border: "1px solid rgba(212,175,96,.3)",
        borderRadius: 20, padding: 40, maxWidth: 580, width: "100%", textAlign: "center",
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚓</div>
        <h1 style={{ color: "#d4af60", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          YotCRM Bookmarklet
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 32 }}>
          One click on any listing → branded brochure with your name on it
        </p>

        <a
          href={code}
          onClick={e => e.preventDefault()}
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #d4af60, #b8943a)",
            color: "#0a1628", fontSize: 17, fontWeight: 800,
            padding: "18px 28px", borderRadius: 14, textDecoration: "none",
            cursor: "grab", boxShadow: "0 4px 20px rgba(212,175,96,.4)",
            userSelect: "none", marginBottom: 10,
          }}
        >
          ⚓ YotCRM — drag me to your bookmarks bar
        </a>

        <p style={{ color: "#475569", fontSize: 12, marginBottom: 28 }}>
          {"Can't drag? "}
          <button onClick={copyCode} style={{
            background: "none", border: "none", color: "#d4af60",
            cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0,
          }}>
            {copied ? "✅ Copied!" : "Copy the code instead"}
          </button>
          {" → create bookmark → paste as URL"}
        </p>

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.06)", margin: "0 0 24px" }} />

        {[
          ["1", "Show your bookmarks bar", "Safari → View → Show Favorites Bar"],
          ["2", "Drag the gold button to your bar", "Or copy the code and paste it as a bookmark URL"],
          ["3", "Open any listing in your browser", "YachtWorld, Boat International, Superyacht Times, Denison…"],
          ["4", "Click ⚓ YotCRM", "It reads the page data, navigates to YotCRM, opens the brochure editor pre-filled with specs + photos"],
          ["5", "Hit Publish → send the link", "Your branded brochure, your name, not YachtWorld's"],
        ].map(([num, title, detail]) => (
          <div key={num} style={{ display: "flex", gap: 12, textAlign: "left", marginBottom: 14 }}>
            <div style={{
              background: "rgba(212,175,96,.15)", color: "#d4af60", fontWeight: 700,
              width: 28, height: 28, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13,
            }}>{num}</div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}>{title}</div>
              <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
