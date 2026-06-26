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
  const webappRef = useReveal<HTMLElement>()
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
            <a href="https://pinwall.raingpt.top" target="_blank" rel="noopener noreferrer">
              {t.nav_web}
            </a>
          </li>
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
              <div className="hero-version">{t.hero_version}</div>
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

                {/* Scattered cards */}
                <div className="mock-card" style={{
                  top: '8%', left: '6%', width: '185px',
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
                  top: '14%', right: '10%', width: '170px',
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
                  top: '42%', left: '30%', width: '160px',
                  background: 'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
                  transform: 'rotate(-3deg)', '--rot': '-3deg', animationDelay: '-3.2s',
                } as React.CSSProperties}>
                  <div className="mock-card-header">
                    <span className="mock-dot r" />
                    <span className="mock-dot y" />
                    <span className="mock-dot g" />
                    <span className="mock-card-title">{t.mock_card_4_title}</span>
                  </div>
                  <div className="mock-card-body">{renderText(t.mock_card_4_body)}</div>
                </div>

                {/* Card stack (bottom-left) — 3 stashed cards */}
                <div className="mock-stack">
                  <div className="mock-stack-card" style={{
                    background: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
                    transform: 'rotate(-4deg)', zIndex: 1,
                  }}>
                    <span className="mock-stack-card-title">{t.mock_card_3_title}</span>
                    <div className="mock-stack-line" style={{ width: '75%' }} />
                  </div>
                  <div className="mock-stack-card" style={{
                    background: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
                    transform: 'rotate(2deg) translate(14px, -8px)', zIndex: 2,
                  }}>
                    <span className="mock-stack-card-title">{t.stack_idea}</span>
                    <div className="mock-stack-line" style={{ width: '60%' }} />
                  </div>
                  <div className="mock-stack-card" style={{
                    background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                    transform: 'rotate(-1deg) translate(28px, -16px)', zIndex: 3,
                  }}>
                    <span className="mock-stack-card-title">{t.stack_notes}</span>
                    <div className="mock-stack-line" style={{ width: '85%' }} />
                  </div>
                  <div className="mock-stack-badge">3</div>
                </div>

                {/* Floating buttons (bottom-right) */}
                <div className="mock-floating">
                  <div className="mock-floating-btn mock-floating-settings">
                    <span>⚙️</span>
                  </div>
                  <div className="mock-floating-btn mock-floating-add">
                    <span>+</span>
                  </div>
                </div>
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

      {/* What's New */}
      <section className="whats-new-section reveal">
        <div className="container">
          <div className="section-label">{t.whats_new_label}</div>
          <h2 className="section-title">{t.whats_new_title}</h2>
          <p className="section-desc">{t.whats_new_desc}</p>

          <div className="whats-new-list">
            {[
              t.whats_new_item_1,
              t.whats_new_item_2,
              t.whats_new_item_3,
              t.whats_new_item_4,
            ].map((item, i) => (
              <div className="whats-new-item" key={i}>
                <svg className="whats-new-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{item}</span>
              </div>
            ))}
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
              ['🌐', t.cap_web, t.cap_web_desc],
              ['🔗', t.cap_share, t.cap_share_desc],
              ['📥', t.cap_export, t.cap_export_desc],
              ['🔍', t.cap_search, t.cap_search_desc],
              ['📊', t.cap_masonry, t.cap_masonry_desc],
              ['✅', t.cap_todo, t.cap_todo_desc],
              ['📋', t.cap_context_menu, t.cap_context_menu_desc],
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

      {/* Web App */}
      <section className="webapp-section reveal" ref={webappRef}>
        <div className="container">
          <div className="webapp-layout">
            <div className="webapp-info">
              <div className="section-label">{t.hero_web_badge}</div>
              <h2 className="webapp-title">{t.cap_title}</h2>
              <p className="webapp-desc">{t.hero_web_desc}</p>
              <div className="webapp-features">
                <div className="webapp-feature">
                  <span className="webapp-feature-icon">🌐</span>
                  <span>{t.cap_web}</span>
                </div>
                <div className="webapp-feature">
                  <span className="webapp-feature-icon">🔗</span>
                  <span>{t.cap_share}</span>
                </div>
                <div className="webapp-feature">
                  <span className="webapp-feature-icon">📥</span>
                  <span>{t.cap_export}</span>
                </div>
                <div className="webapp-feature">
                  <span className="webapp-feature-icon">🔍</span>
                  <span>{t.cap_search}</span>
                </div>
                <div className="webapp-feature">
                  <span className="webapp-feature-icon">📊</span>
                  <span>{t.cap_masonry}</span>
                </div>
                <div className="webapp-feature">
                  <span className="webapp-feature-icon">✅</span>
                  <span>{t.cap_todo}</span>
                </div>
              </div>
              <a
                href="https://pinwall.raingpt.top"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary btn-webapp"
              >
                {t.hero_web_link}
              </a>
            </div>
            <div className="webapp-screenshot">
              <div className="browser-mock">
                <div className="browser-bar">
                  <div className="browser-dots">
                    <span className="browser-dot r" />
                    <span className="browser-dot y" />
                    <span className="browser-dot g" />
                  </div>
                  <div className="browser-url">pinwall.raingpt.top</div>
                </div>
                <div className="browser-content">
                  <div className="masonry-demo">
                    <div className="masonry-card" style={{
                      gridColumn: 'span 1',
                      background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
                    }}>
                      <div className="masonry-card-line" style={{ width: '80%' }} />
                      <div className="masonry-card-line" style={{ width: '60%' }} />
                    </div>
                    <div className="masonry-card tall" style={{
                      background: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
                    }}>
                      <div className="masonry-card-line" style={{ width: '70%' }} />
                      <div className="masonry-card-line" style={{ width: '90%' }} />
                      <div className="masonry-card-line" style={{ width: '50%' }} />
                    </div>
                    <div className="masonry-card" style={{
                      background: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
                    }}>
                      <div className="masonry-card-line" style={{ width: '65%' }} />
                      <div className="masonry-card-line" style={{ width: '40%' }} />
                    </div>
                    <div className="masonry-card" style={{
                      background: 'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
                    }}>
                      <div className="masonry-card-line" style={{ width: '75%' }} />
                      <div className="masonry-card-line" style={{ width: '55%' }} />
                    </div>
                    <div className="masonry-card short" style={{
                      background: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
                    }}>
                      <div className="masonry-card-line" style={{ width: '60%' }} />
                    </div>
                    <div className="masonry-card" style={{
                      background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                    }}>
                      <div className="masonry-card-line" style={{ width: '85%' }} />
                      <div className="masonry-card-line" style={{ width: '45%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
              <a href="https://pinwall.raingpt.top" target="_blank" rel="noopener noreferrer" className="btn-secondary">
                🌐 {t.cta_web}
              </a>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                {t.cta_source}
              </a>
            </div>
            <p className="cta-note">{t.cta_note}</p>
            <p className="cta-web-note">{t.cta_web_note} · <a href="https://pinwall.raingpt.top" target="_blank" rel="noopener noreferrer">pinwall.raingpt.top</a></p>
            <p className="cta-version">{t.cta_version}</p>
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
              © 2026 PinWall. MIT License.
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
