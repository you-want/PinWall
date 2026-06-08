import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { I18nContext, useI18n, getTranslations, type Lang } from './i18n'
import './index.css'

const GITHUB_URL = 'https://github.com/you-want/PinWall'
const RELEASES_URL = 'https://github.com/you-want/PinWall/releases'
const LICENSE_URL = 'https://github.com/you-want/PinWall/blob/main/LICENSE'

function useReveal<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

/* ─── GitHub Icon SVG ─────────────────────────── */
function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

/* ─── Download Icon SVG ────────────────────────── */
function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

/* ─── App (i18n provider wrapper) ──────────────── */
export default function App() {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('pinwall-lang')
    if (saved === 'en' || saved === 'zh') return saved
    return navigator.language.startsWith('zh') ? 'zh' : 'en'
  })

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem('pinwall-lang', l)
    document.documentElement.lang = l
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = getTranslations(lang)

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      <AppContent />
    </I18nContext.Provider>
  )
}

/* ─── AppContent (uses i18n) ───────────────────── */
function AppContent() {
  const { lang, t, setLang } = useI18n()
  const [scrolled, setScrolled] = useState(false)
  const featuresRef = useReveal<HTMLElement>()
  const howRef = useReveal<HTMLElement>()
  const capRef = useReveal<HTMLElement>()
  const ctaRef = useReveal<HTMLElement>()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const toggleLang = () => setLang(lang === 'zh' ? 'en' : 'zh')

  const renderText = (text: string) =>
    text.split('\n').map((line, i) => (
      <span key={i}>{i > 0 && <br />}{line}</span>
    ))

  return (
    <>
      <div className="grain" />

      {/* Nav */}
      <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-logo">
          <img src="/favicon.svg" alt="PinWall" className="nav-logo-icon" />
          PinWall
        </div>
        <ul className="nav-links">
          <li><a href="#features">{t.nav_features}</a></li>
          <li><a href="#how">{t.nav_how}</a></li>
          <li><a href="#capabilities">{t.nav_capabilities}</a></li>
          <li>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              {t.nav_download}
            </a>
          </li>
          <li>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-github"
              title="GitHub"
            >
              <GitHubIcon />
            </a>
          </li>
          <li>
            <button className="lang-toggle" onClick={toggleLang} type="button">
              {lang === 'zh' ? 'EN' : '中'}
            </button>
          </li>
        </ul>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-bg-element hero-bg-1" />
        <div className="hero-bg-element hero-bg-2" />
        <div className="container">
          <div className="hero-grid">
            <div className="hero-text">
              <div className="hero-badge">
                <span className="dot" />
                {t.hero_badge}
              </div>
              <h1 className="hero-title">
                {t.hero_title_1}<br />
                <span className="accent">{t.hero_title_accent}</span>{t.hero_title_2}
              </h1>
              <p className="hero-subtitle">{t.hero_subtitle}</p>
              <div className="hero-actions">
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  <DownloadIcon />
                  {t.hero_download}
                </a>
                <a href="#how" className="btn-secondary">
                  {t.hero_learn}
                </a>
              </div>
            </div>

            <div className="hero-visual">
              <div className="desktop-mock">
                <div className="desktop-mock-wallpaper" />

                <div className="mock-card" style={{
                  top: '12%', left: '8%', width: '160px',
                  background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
                  transform: 'rotate(-2deg)', '--rot': '-2deg',
                } as React.CSSProperties}>
                  <div className="mock-card-header">
                    <span className="mock-dot r" />
                    <span className="mock-dot y" />
                    <span className="mock-dot g" />
                    <span className="mock-card-title">{t.mock_card_1_title}</span>
                  </div>
                  <div className="mock-card-body">{renderText(t.mock_card_1_body)}</div>
                </div>

                <div className="mock-card" style={{
                  top: '18%', right: '12%', width: '140px',
                  background: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
                  transform: 'rotate(3deg)', '--rot': '3deg', animationDelay: '-1.5s',
                } as React.CSSProperties}>
                  <div className="mock-card-header">
                    <span className="mock-dot r" />
                    <span className="mock-dot y" />
                    <span className="mock-dot g" />
                    <span className="mock-card-title">{t.mock_card_2_title}</span>
                  </div>
                  <div className="mock-card-body">{renderText(t.mock_card_2_body)}</div>
                </div>

                <div className="mock-card" style={{
                  bottom: '20%', left: '15%', width: '150px',
                  background: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
                  transform: 'rotate(1deg)', '--rot': '1deg', animationDelay: '-2.5s',
                } as React.CSSProperties}>
                  <div className="mock-card-header">
                    <span className="mock-dot r" />
                    <span className="mock-dot y" />
                    <span className="mock-dot g" />
                    <span className="mock-card-title">{t.mock_card_3_title}</span>
                  </div>
                  <div className="mock-card-body">{renderText(t.mock_card_3_body)}</div>
                </div>

                <div className="mock-card" style={{
                  bottom: '15%', right: '18%', width: '130px',
                  background: 'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
                  transform: 'rotate(-4deg)', '--rot': '-4deg', animationDelay: '-3.2s',
                } as React.CSSProperties}>
                  <div className="mock-card-header">
                    <span className="mock-dot r" />
                    <span className="mock-dot y" />
                    <span className="mock-dot g" />
                    <span className="mock-card-title">{t.mock_card_4_title}</span>
                  </div>
                  <div className="mock-card-body">{renderText(t.mock_card_4_body)}</div>
                </div>

                <div style={{
                  position: 'absolute', bottom: '16px', right: '16px',
                  width: '36px', height: '36px',
                  background: 'rgba(247,243,238,0.9)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', fontWeight: 700, color: '#1A1612',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>+</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section reveal" id="features" ref={featuresRef}>
        <div className="container">
          <div className="section-label">{t.features_label}</div>
          <h2 className="section-title">{renderText(t.features_title)}</h2>
          <p className="section-desc">{t.features_desc}</p>

          <div className="features-grid">
            <div className="feature-card featured">
              <div>
                <div className="feature-icon">🪟</div>
                <h3 className="feature-title">{t.feature_transparent_title}</h3>
                <p className="feature-desc">{t.feature_transparent_desc}</p>
              </div>
              <div className="feature-visual">
                <div className="feature-visual-stack">
                  <div className="stack-card" style={{
                    background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
                    transform: 'rotate(-4deg)', zIndex: 1,
                  }}>
                    <div className="stack-card-title">{t.stack_morning}</div>
                    <div className="stack-card-line" style={{ width: '80%' }} />
                    <div className="stack-card-line" style={{ width: '60%' }} />
                  </div>
                  <div className="stack-card" style={{
                    background: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
                    transform: 'rotate(2deg) translate(20px, -10px)', zIndex: 2,
                  }}>
                    <div className="stack-card-title">{t.stack_idea}</div>
                    <div className="stack-card-line" style={{ width: '70%' }} />
                  </div>
                  <div className="stack-card" style={{
                    background: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
                    transform: 'rotate(-1deg) translate(40px, -20px)', zIndex: 3,
                  }}>
                    <div className="stack-card-title">{t.stack_notes}</div>
                    <div className="stack-card-line" style={{ width: '90%' }} />
                    <div className="stack-card-line" style={{ width: '50%' }} />
                  </div>
                  <div className="stack-badge">3</div>
                </div>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📌</div>
              <h3 className="feature-title">{t.feature_drag_title}</h3>
              <p className="feature-desc">{t.feature_drag_desc}</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🔔</div>
              <h3 className="feature-title">{t.feature_reminder_title}</h3>
              <p className="feature-desc">{t.feature_reminder_desc}</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📂</div>
              <h3 className="feature-title">{t.feature_stack_title}</h3>
              <p className="feature-desc">{t.feature_stack_desc}</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🎨</div>
              <h3 className="feature-title">{t.feature_color_title}</h3>
              <p className="feature-desc">{t.feature_color_desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-section reveal" id="how" ref={howRef}>
        <div className="container">
          <div className="section-label">{t.how_label}</div>
          <h2 className="section-title">{t.how_title}</h2>
          <p className="section-desc">{t.how_desc}</p>

          <div className="steps">
            <div className="step">
              <div className="step-number">01</div>
              <h3 className="step-title">{t.step1_title}</h3>
              <p className="step-desc">{t.step1_desc}</p>
            </div>
            <div className="step">
              <div className="step-number">02</div>
              <h3 className="step-title">{t.step2_title}</h3>
              <p className="step-desc">{t.step2_desc}</p>
              <div className="step-shortcut">
                <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>N</kbd>
              </div>
            </div>
            <div className="step">
              <div className="step-number">03</div>
              <h3 className="step-title">{t.step3_title}</h3>
              <p className="step-desc">{t.step3_desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="capabilities reveal" id="capabilities" ref={capRef}>
        <div className="container">
          <div className="section-label">{t.cap_label}</div>
          <h2 className="section-title">{t.cap_title}</h2>
          <p className="section-desc">{t.cap_desc}</p>

          <div className="cap-list">
            {[
              ['🪄', t.cap_transparent, t.cap_transparent_desc],
              ['🖱️', t.cap_click_through, t.cap_click_through_desc],
              ['📐', t.cap_free_layout, t.cap_free_layout_desc],
              ['⏰', t.cap_reminder, t.cap_reminder_desc],
              ['🗂️', t.cap_stack, t.cap_stack_desc],
              ['🔲', t.cap_fullscreen, t.cap_fullscreen_desc],
              ['🎨', t.cap_gradient, t.cap_gradient_desc],
              ['🖼️', t.cap_background, t.cap_background_desc],
              ['⚙️', t.cap_opacity, t.cap_opacity_desc],
              ['⌨️', t.cap_shortcut, t.cap_shortcut_desc],
              ['💾', t.cap_local, t.cap_local_desc],
              ['🍎', t.cap_native, t.cap_native_desc],
            ].map(([icon, title, desc], i) => (
              <div className="cap-item" key={i}>
                <div className="cap-icon">{icon}</div>
                <div className="cap-title">{title}</div>
                <div className="cap-desc">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section reveal" ref={ctaRef}>
        <div className="container">
          <div className="cta-card">
            <h2 className="cta-title">{t.cta_title}</h2>
            <p className="cta-desc">{t.cta_desc}</p>
            <div className="cta-buttons">
              <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <DownloadIcon />
                {t.cta_download}
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                {t.cta_source}
              </a>
            </div>
            <p className="cta-note">{t.cta_note}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-left">
              <img src="/favicon.svg" alt="PinWall" className="footer-logo-icon" />
              PinWall
            </div>
            <ul className="footer-links">
              <li><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a></li>
              <li><a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">{t.footer_download}</a></li>
              <li><a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">License</a></li>
            </ul>
            <div className="footer-right">
              © 2024 – 2026 PinWall. MIT License.
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
