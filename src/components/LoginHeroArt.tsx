export function LoginHeroArt() {
  return (
    <div className="t2s-hero-stage" aria-hidden>
      <svg className="t2s-hero-wash" viewBox="0 0 640 280" preserveAspectRatio="xMaxYMid meet">
        <path d="M48 228 C92 188 128 206 168 140 C206 78 248 92 292 48 C340 8 400 54 468 22 C520 0 572 28 620 10" fill="none" stroke="#FF6900" strokeWidth="3" opacity="0.7" />
        <polygon points="608,22 632,6 618,34" fill="#FF6900" opacity="0.9" />
        <g fill="#08254B" opacity="0.12">
          <rect x="80" y="168" width="8" height="42" rx="1" />
          <rect x="96" y="148" width="8" height="62" rx="1" />
          <rect x="112" y="178" width="8" height="32" rx="1" />
          <rect x="160" y="128" width="8" height="82" rx="1" />
          <rect x="176" y="150" width="8" height="60" rx="1" />
          <rect x="248" y="98" width="8" height="92" rx="1" />
          <rect x="264" y="118" width="8" height="72" rx="1" />
          <rect x="312" y="70" width="8" height="110" rx="1" />
          <rect x="368" y="108" width="8" height="72" rx="1" />
          <rect x="430" y="48" width="8" height="120" rx="1" />
          <rect x="446" y="78" width="8" height="90" rx="1" />
          <rect x="510" y="88" width="8" height="70" rx="1" />
        </g>
      </svg>

      <div className="t2s-quote t2s-quote-nifty">
        <span>NIFTY 50</span>
        <strong>24,716.80</strong>
        <em>+182.40 (+0.74%)</em>
      </div>
      <div className="t2s-quote t2s-quote-bank">
        <span>BANKNIFTY</span>
        <strong>52,340.15</strong>
        <em>+412.25 (+0.79%)</em>
      </div>

      <div className="t2s-desk">
        <div className="t2s-laptop">
          <div className="t2s-laptop-lid">
            <div className="t2s-laptop-screen">
              <img src="/t2s-logo.png" alt="" className="t2s-hero-art" />
              <svg className="t2s-hero-chart" viewBox="0 0 320 110" preserveAspectRatio="none">
                <rect x="18" y="58" width="7" height="28" fill="#12b76a" opacity="0.85" />
                <rect x="32" y="46" width="7" height="40" fill="#f04438" opacity="0.75" />
                <rect x="46" y="62" width="7" height="24" fill="#12b76a" opacity="0.85" />
                <rect x="60" y="38" width="7" height="48" fill="#12b76a" opacity="0.8" />
                <rect x="74" y="50" width="7" height="36" fill="#f04438" opacity="0.7" />
                <rect x="88" y="30" width="7" height="56" fill="#12b76a" opacity="0.85" />
                <rect x="102" y="42" width="7" height="44" fill="#12b76a" opacity="0.75" />
                <rect x="116" y="24" width="7" height="62" fill="#f04438" opacity="0.7" />
                <rect x="130" y="18" width="7" height="68" fill="#12b76a" opacity="0.85" />
                <path d="M12 78 C48 70 72 52 108 48 C150 44 176 28 220 22 C260 16 290 12 312 8" fill="none" stroke="#FF6900" strokeWidth="2.6" />
                <path d="M12 88 C56 80 90 66 140 62 C190 58 240 40 312 26" fill="none" stroke="#94a3b8" strokeWidth="1.6" opacity="0.45" />
              </svg>
            </div>
          </div>
          <div className="t2s-laptop-hinge" />
          <div className="t2s-laptop-base" />
        </div>
        <div className="t2s-phone">
          <i className="t2s-phone-notch" />
          <span>NIFTY 50</span>
          <strong>24,716.80</strong>
          <em>+182.40 (+0.74%)</em>
          <svg className="t2s-phone-spark" viewBox="0 0 80 24">
            <path d="M2 18 C16 16 22 10 34 12 C46 14 54 6 78 4" fill="none" stroke="#12b76a" strokeWidth="2" />
          </svg>
          <div className="t2s-phone-dock">
            <b>BUY</b>
            <b>SELL</b>
          </div>
        </div>
      </div>
    </div>
  );
}
