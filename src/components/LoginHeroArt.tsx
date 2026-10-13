export function LoginHeroArt() {
  return (
    <div className="t2s-hero-stage" aria-hidden>
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
              <svg className="t2s-hero-chart" viewBox="0 0 320 90" preserveAspectRatio="none">
                <path d="M0 70 C40 66 60 48 90 52 C120 56 140 28 180 34 C220 40 250 16 320 8" fill="none" stroke="#fd6b01" strokeWidth="3" />
                <path d="M0 78 C50 72 80 60 120 64 C160 68 200 46 320 22" fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0.45" />
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
          <div className="t2s-phone-dock">
            <b>BUY</b>
            <b>SELL</b>
          </div>
        </div>
      </div>
    </div>
  );
}
