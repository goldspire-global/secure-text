/**
 * Veil marketing — premium layer (motion, typography, glow).
 */
(function (global) {
  function revealOnScroll() {
    const nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length) return;

    if (!('IntersectionObserver' in window)) {
      nodes.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    nodes.forEach((el, index) => {
      el.style.setProperty('--reveal-delay', `${Math.min(index * 0.06, 0.36)}s`);
      observer.observe(el);
    });
  }

  function init() {
    revealOnScroll();
    document.body.classList.add('veil-premium-ready');
  }

  global.VeilMotion = { init, revealOnScroll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
