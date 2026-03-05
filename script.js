// ============================================================
//  MAGNETIC GRADIENT — Smooth Distorting Background
//  + Theme Toggle (Lamp) with localStorage persistence
//  Pure vanilla JS + Canvas — zero dependencies.
// ============================================================

(function () {
    'use strict';

    // ---------------------------------------------------------
    // THEME PALETTES
    // ---------------------------------------------------------
    const PALETTES = {
        light: [
            { r: 202, g: 211, b: 227 },   // #cad3e3 — page bg
            { r: 204, g: 219, b: 253 },   // #ccdbfd — Periwinkle
            { r: 215, g: 227, b: 252 },   // #d7e3fc — Lavender-2
            { r: 159, g: 165, b: 173 },   // #9fa5ad — dark neutral slate
        ],
        dark: [
            { r: 17, g: 24, b: 39 },   // #111827 — deep dark
            { r: 30, g: 27, b: 56 },   // Deep indigo
            { r: 22, g: 33, b: 52 },   // Dark navy
            { r: 38, g: 20, b: 50 },   // Dark plum
        ],
    };

    // ---------------------------------------------------------
    // CONFIG
    // ---------------------------------------------------------
    const CONFIG = {
        colors: [...PALETTES.light],       // Start with light (will be updated)

        // Magnetic influence
        influenceRadius: 0.45,
        influenceStrength: 0.35,
        ease: 0.025,

        // Ambient drift
        driftSpeed: 0.00015,
        driftAmount: 0.08,

        // Resolution
        resolution: 1,
    };

    // ---------------------------------------------------------
    // SETUP (deferred until DOM ready)
    // ---------------------------------------------------------
    let canvas, ctx;
    let width, height;
    let isActive = true;
    let time = 0;
    let mouse = { x: 0.5, y: 0.5 };
    let current = { x: 0.5, y: 0.5 };
    let activeColors = PALETTES.light.map(c => ({ ...c }));
    let targetColors = PALETTES.light.map(c => ({ ...c }));
    const COLOR_LERP = 0.02;
    let animationStarted = false;

    // ---------------------------------------------------------
    // THEME MANAGEMENT
    // ---------------------------------------------------------

    // Vanta.js colour config per theme.
    const VANTA_THEMES = {
        dark: {
            backgroundColor: 0x0a0e17,   // --bg-dark
            color: 0x755f99,   // violet  (complements --accent #A78BFA)
            color2: 0x4c1d95,   // deep violet
        },
        light: {
            backgroundColor: 0xb8c5da,   // --bg-dark (light)
            color: 0x405582,   // --accent
            color2: 0x2f4f8f,   // softer complementary blue
        },
    };

    let vantaEffect = null;

    /** Destroy any active Vanta instance. */
    function destroyVanta() {
        if (vantaEffect) {
            vantaEffect.destroy();
            vantaEffect = null;
        }
    }

    /** Create the Vanta instance. */
    function initVanta(theme) {
        destroyVanta();

        if (typeof VANTA === 'undefined') return;

        const el = document.getElementById('vanta-bg');
        if (!el) return;

        const cfg = VANTA_THEMES[theme] || VANTA_THEMES.light;

        // Briefly hide container to mask the re-init flash
        el.style.transition = 'opacity 0.2s ease';
        el.style.opacity = '0';

        setTimeout(() => {
            vantaEffect = VANTA.DOTS({
                el: el,
                THREE: typeof THREE !== 'undefined' ? THREE : undefined,
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200.00,
                minWidth: 200.00,
                scale: 1.00,
                scaleMobile: 1.00,
                size: 2.30,       // <-- You can tweak point size here (default ~4)
                spacing: 20.00,   // <-- You can tweak point spacing here (default ~40)
                color: cfg.color,
                color2: cfg.color2,
                backgroundColor: cfg.backgroundColor,
                showLines: false,
            });

            // Fade back in
            el.style.opacity = '1';
        }, 150); // slight delay to allow WebGL context to clear
    }

    /**
     * Transition Vanta colours to the target theme.
     * `setOptions` is buggy for colour updates in VANTA.DOTS. We destroy and recreate.
     */
    function transitionVanta(theme) {
        initVanta(theme);
    }

    // ---------------------------------------------------------
    // THEME GETTERS / SETTERS
    // ---------------------------------------------------------
    function getTheme() {
        return localStorage.getItem('portfolio-theme') || 'light';
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('portfolio-theme', theme);

        // Animate Vanta colours (no-ops gracefully if Vanta isn't ready yet)
        transitionVanta(theme);

        // Set gradient target colors (will smoothly transition)
        const palette = theme === 'dark' ? PALETTES.dark : PALETTES.light;
        targetColors = palette.map(c => ({ ...c }));

        // Update header shadow color for scroll handler
        updateHeaderShadow(theme);

        // Swap icon: moon in light mode, sun in dark mode
        const lampIcon = document.querySelector('#theme-lamp i');
        if (lampIcon) {
            const btn = document.getElementById('theme-lamp');
            btn.classList.add('spin');
            setTimeout(() => {
                lampIcon.className = 'bi';
                lampIcon.classList.add(theme === 'dark' ? 'bi-sun' : 'bi-moon-fill');
            }, 150);
            setTimeout(() => btn.classList.remove('spin'), 400);
        }
    }

    function updateHeaderShadow(theme) {
        window._portfolioTheme = theme;
    }

    function toggleTheme() {
        const current = getTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next);
    }

    // Apply theme CSS vars immediately (icon swap is a no-op since
    // the button isn't in the DOM yet, but data-theme IS set so
    // the correct palette renders before first paint).
    const savedTheme = getTheme();
    document.documentElement.setAttribute('data-theme', savedTheme);
    localStorage.setItem('portfolio-theme', savedTheme);
    window._portfolioTheme = savedTheme;
    // Vanta init is deferred to boot() when DOM + CDN scripts are ready.

    // ---------------------------------------------------------
    // RESIZE
    // ---------------------------------------------------------
    function resize() {
        if (!canvas) return;
        width = window.innerWidth;
        height = window.innerHeight;
        const scale = CONFIG.resolution;
        canvas.width = Math.floor(width * scale);
        canvas.height = Math.floor(height * scale);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }

    // ---------------------------------------------------------
    // LERP COLOR CHANNELS
    // ---------------------------------------------------------
    function lerpColor(current, target, t) {
        return {
            r: current.r + (target.r - current.r) * t,
            g: current.g + (target.g - current.g) * t,
            b: current.b + (target.b - current.b) * t,
        };
    }

    // ---------------------------------------------------------
    // DRAW GRADIENT
    // ---------------------------------------------------------
    function draw() {
        if (!canvas || !ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;

        const mx = current.x * w;
        const my = current.y * h;

        const driftX = Math.sin(time * CONFIG.driftSpeed) * CONFIG.driftAmount;
        const driftY = Math.cos(time * CONFIG.driftSpeed * 0.7 + 1.5) * CONFIG.driftAmount;

        // Smoothly lerp active colors toward target
        for (let i = 0; i < activeColors.length; i++) {
            activeColors[i] = lerpColor(activeColors[i], targetColors[i], COLOR_LERP);
        }

        // --- Layer 1: Base fill ---
        const base = activeColors[0];
        ctx.fillStyle = `rgb(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)})`;
        ctx.fillRect(0, 0, w, h);

        // --- Layer 2: Bottom-right ambient ---
        const c1 = activeColors[1];
        const grad1CenterX = w * (0.75 + driftX * 0.5);
        const grad1CenterY = h * (0.65 + driftY * 0.5);
        const grad1 = ctx.createRadialGradient(
            grad1CenterX, grad1CenterY, 0,
            grad1CenterX, grad1CenterY, w * 0.8
        );
        grad1.addColorStop(0, `rgba(${Math.round(c1.r)}, ${Math.round(c1.g)}, ${Math.round(c1.b)}, 0.4)`);
        grad1.addColorStop(0.5, `rgba(${Math.round(c1.r)}, ${Math.round(c1.g)}, ${Math.round(c1.b)}, 0.12)`);
        grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, w, h);

        // --- Layer 3: Top-left ambient ---
        const c2 = activeColors[2];
        const grad2CenterX = w * (0.2 - driftX * 0.4);
        const grad2CenterY = h * (0.25 - driftY * 0.4);
        const grad2 = ctx.createRadialGradient(
            grad2CenterX, grad2CenterY, 0,
            grad2CenterX, grad2CenterY, w * 0.7
        );
        grad2.addColorStop(0, `rgba(${Math.round(c2.r)}, ${Math.round(c2.g)}, ${Math.round(c2.b)}, 0.35)`);
        grad2.addColorStop(0.4, `rgba(${Math.round(c2.r)}, ${Math.round(c2.g)}, ${Math.round(c2.b)}, 0.08)`);
        grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, w, h);

        // --- Layer 4: Mouse magnetic ---
        const c3 = activeColors[3];
        const magnetRadius = Math.max(w, h) * CONFIG.influenceRadius;
        const magnetGrad = ctx.createRadialGradient(mx, my, 0, mx, my, magnetRadius);
        const strength = CONFIG.influenceStrength;
        magnetGrad.addColorStop(0, `rgba(${Math.round(c3.r)}, ${Math.round(c3.g)}, ${Math.round(c3.b)}, ${strength * 1.2})`);
        magnetGrad.addColorStop(0.3, `rgba(${Math.round(c3.r)}, ${Math.round(c3.g)}, ${Math.round(c3.b)}, ${strength * 0.5})`);
        magnetGrad.addColorStop(0.7, `rgba(${Math.round(c3.r)}, ${Math.round(c3.g)}, ${Math.round(c3.b)}, ${strength * 0.1})`);
        magnetGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = magnetGrad;
        ctx.fillRect(0, 0, w, h);

        // --- Layer 5: Secondary magnetic accent ---
        const c4 = activeColors[1];
        const mx2 = mx + w * 0.05;
        const my2 = my - h * 0.08;
        const magnetGrad2 = ctx.createRadialGradient(mx2, my2, 0, mx2, my2, magnetRadius * 0.6);
        magnetGrad2.addColorStop(0, `rgba(${Math.round(c4.r)}, ${Math.round(c4.g)}, ${Math.round(c4.b)}, ${strength * 0.3})`);
        magnetGrad2.addColorStop(0.5, `rgba(${Math.round(c4.r)}, ${Math.round(c4.g)}, ${Math.round(c4.b)}, ${strength * 0.05})`);
        magnetGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = magnetGrad2;
        ctx.fillRect(0, 0, w, h);
    }

    // ---------------------------------------------------------
    // ANIMATION
    // ---------------------------------------------------------
    function animate(timestamp) {
        requestAnimationFrame(animate);
        if (!isActive || !canvas || !ctx) return;

        time = timestamp || 0;

        current.x += (mouse.x - current.x) * CONFIG.ease;
        current.y += (mouse.y - current.y) * CONFIG.ease;

        draw();
    }

    // ---------------------------------------------------------
    // BOOT — deferred until DOM is ready so canvas exists
    // ---------------------------------------------------------
    function boot() {
        if (animationStarted) return;
        canvas = document.getElementById('bg-canvas');
        if (!canvas) {
            // Canvas not yet in DOM — retry shortly
            setTimeout(boot, 50);
            return;
        }
        ctx = canvas.getContext('2d');
        if (!ctx) return;
        animationStarted = true;

        // Initialize Vanta first so it exists when we trigger setTheme
        initVanta(getTheme());

        // Events
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX / window.innerWidth;
            mouse.y = e.clientY / window.innerHeight;
        });

        window.addEventListener('mouseleave', () => {
            mouse.x = 0.5;
            mouse.y = 0.5;
        });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                mouse.x = e.touches[0].clientX / window.innerWidth;
                mouse.y = e.touches[0].clientY / window.innerHeight;
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            mouse.x = 0.5;
            mouse.y = 0.5;
        });

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resize, 150);
        });

        document.addEventListener('visibilitychange', () => {
            isActive = !document.hidden;
        });

        // Lamp toggle click
        const lampBtn = document.getElementById('theme-lamp');
        if (lampBtn) {
            lampBtn.addEventListener('click', toggleTheme);
        }

        // Full setup now that DOM is completely loaded
        setTheme(getTheme());

        // Start animation loop
        resize();
        requestAnimationFrame(animate);
    }

    // Run boot when DOM is ready — use multiple strategies for reliability
    document.addEventListener('DOMContentLoaded', boot);
    window.addEventListener('load', boot);
    // Also try immediately in case the DOM is already ready
    if (document.readyState !== 'loading') {
        boot();
    }
})();


// ============================================================
// Scroll Reveal & Header Logic
// ============================================================
document.addEventListener("DOMContentLoaded", () => {

    // --- Hero Name: Per-letter reveal ---
    const heroName = document.getElementById('hero-name');
    if (heroName) {
        const text = heroName.textContent;
        heroName.textContent = '';
        [...text].forEach((char, i) => {
            if (char === ' ') {
                const space = document.createElement('span');
                space.classList.add('letter-space');
                heroName.appendChild(space);
            } else {
                const span = document.createElement('span');
                span.classList.add('letter');
                span.textContent = char;
                span.style.animationDelay = `${0.4 + i * 0.04}s`;
                heroName.appendChild(span);
            }
        });
    }

    // --- Subtitle: Typewriter effect ---
    const subtitle = document.getElementById('hero-subtitle');
    if (subtitle) {
        const fullText = subtitle.getAttribute('data-text') || '';
        let charIndex = 0;

        // Create a text node for typed chars + a cursor span
        const textNode = document.createTextNode('');
        const cursor = document.createElement('span');
        cursor.classList.add('cursor');
        cursor.textContent = '|';
        subtitle.appendChild(textNode);
        subtitle.appendChild(cursor);

        // Start after the name reveal finishes (~1.2s)
        setTimeout(() => {
            function typeChar() {
                if (charIndex < fullText.length) {
                    textNode.textContent += fullText[charIndex];
                    charIndex++;
                    setTimeout(typeChar, 40);
                } else {
                    // Fade out cursor almost immediately
                    setTimeout(() => cursor.classList.add('done'), 100);
                }
            }
            typeChar();
        }, 1200);
    }

    const reveals = document.querySelectorAll(".reveal");

    const revealOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("active");
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    });

    reveals.forEach(reveal => {
        revealOnScroll.observe(reveal);
    });

    let lastScroll = 0;
    const header = document.querySelector('.header');

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        const isDark = window._portfolioTheme === 'dark';

        if (currentScroll <= 0) {
            header.style.boxShadow = 'none';
        } else {
            header.style.boxShadow = isDark
                ? '0 10px 30px -10px rgba(0, 0, 0, 0.5)'
                : '0 10px 30px -10px rgba(47, 79, 143, 0.2)';
        }

        if (currentScroll > lastScroll && currentScroll > 80) {
            header.style.transform = 'translateY(-100%)';
        } else {
            header.style.transform = 'translateY(0)';
        }

        lastScroll = currentScroll;
    });
});

/* =========================================
   Interactive Cat Logic
   ========================================= */
const catWrapper = document.getElementById('interactive-cat-wrapper');
const catInner = document.getElementById('interactive-cat-inner');
let catTimer;
let catHideTimer;
let catScrollStartY = 0;
let catIsViewportAnchored = true;

function spawnCat() {
    if (!catWrapper || !catInner) return;

    // Reset escape states
    catInner.classList.remove('escaping');
    catInner.classList.remove('visible');
    clearTimeout(catHideTimer);

    const catSize = 60;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Array to hold viable spawning anchor points and rotations
    let edges = [];

    // 1. Viewport edges (top, bottom, left, right)

    // For top edge, avoid the middle ~600px where the navbar is usually centered.
    // Pick left side (0 to vw/2 - 300) OR right side (vw/2 + 300 to vw - catSize)
    let topX;
    const navAvoidWidth = 350; // half of the avoidance zone
    if (Math.random() > 0.5 && vw > (vw / 2 + navAvoidWidth + catSize)) {
        // Right side
        topX = (vw / 2) + navAvoidWidth + Math.random() * ((vw / 2) - navAvoidWidth - catSize);
    } else {
        // Left side
        topX = Math.random() * Math.max(0, (vw / 2) - navAvoidWidth - catSize);
    }

    edges.push({ type: 'viewport-top', x: topX, y: 0, rot: 180 });
    edges.push({ type: 'viewport-bottom', x: Math.random() * (vw - catSize), y: vh - catSize, rot: 0 });
    edges.push({ type: 'viewport-left', x: 0, y: Math.random() * (vh - catSize), rot: 90 });
    edges.push({ type: 'viewport-right', x: vw - catSize, y: Math.random() * (vh - catSize), rot: -90 });

    // 2. Visible Card edges inside sections
    // Use MAIN containers ONLY so the cat doesn't spawn inside/between parallel blocks
    const cards = document.querySelectorAll('.timeline, .edu-grid, .skills-container, .projects-grid');
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        // Check if card is currently mostly within the viewport
        if (rect.top > catSize && rect.bottom < vh - catSize && rect.left > catSize && rect.right < vw - catSize) {
            // Card Top edge
            edges.push({ type: 'card-top', x: rect.left + Math.random() * Math.max(0, rect.width - catSize), y: rect.top - catSize, rot: 0 });
            // Card Bottom edge
            edges.push({ type: 'card-bottom', x: rect.left + Math.random() * Math.max(0, rect.width - catSize), y: rect.bottom, rot: 180 });
            // Card Left edge
            edges.push({ type: 'card-left', x: rect.left - catSize, y: rect.top + Math.random() * Math.max(0, rect.height - catSize), rot: -90 });
            // Card Right edge
            edges.push({ type: 'card-right', x: rect.right, y: rect.top + Math.random() * Math.max(0, rect.height - catSize), rot: 90 });
        }
    });

    // Pick a random edge
    const edge = edges[Math.floor(Math.random() * edges.length)];

    // Store states for auto-scrolling escape logic
    catIsViewportAnchored = edge.type.startsWith('viewport');
    catScrollStartY = window.scrollY;

    // Apply position, scroll offset, and rotation
    if (catIsViewportAnchored) {
        catWrapper.style.position = 'fixed';
        catWrapper.style.left = `${edge.x}px`;
        catWrapper.style.top = `${edge.y}px`;
    } else {
        catWrapper.style.position = 'absolute';
        catWrapper.style.left = `${edge.x + window.scrollX}px`;
        catWrapper.style.top = `${edge.y + window.scrollY}px`;
    }

    catWrapper.style.transform = `rotate(${edge.rot}deg)`;

    // Slight delay to ensure wrapper Transform is applied before sliding out
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            catInner.classList.add('visible');

            // Auto hide after 4 seconds
            catHideTimer = setTimeout(() => escapeCat(null), 4000);
        });
    });
}

function escapeCat(e) {
    if (e) e.preventDefault();

    // Trigger escape CSS animations
    catInner.classList.add('escaping');
    catInner.classList.remove('visible');

    clearTimeout(catTimer);
    clearTimeout(catHideTimer);

    // Let the escape animation play (0.4s), then spawn again after a longer gap (5-8 seconds)
    catTimer = setTimeout(() => {
        setTimeout(spawnCat, 5000 + Math.random() * 3000);
    }, 400);
}

// Scroll listener to hide non-viewport cats and top/bottom viewport cats
window.addEventListener('scroll', () => {
    if (catInner && catInner.classList.contains('visible')) {
        // Needs to hide if it's anchored to a scrolled document card
        // OR if it's anchored to the top/bottom viewport edges
        const isTopOrBottomViewport = catIsViewportAnchored && (catWrapper.style.top === '0px' || parseInt(catWrapper.style.top) > window.innerHeight / 2);

        if (!catIsViewportAnchored || isTopOrBottomViewport) {
            if (Math.abs(window.scrollY - catScrollStartY) > 50) {
                escapeCat(null);
            }
        }
    }
});

if (catWrapper && catInner) {
    // Trigger escape on click/tap
    catInner.addEventListener('mousedown', escapeCat);
    catInner.addEventListener('touchstart', escapeCat, { passive: false });

    // Initial spawn (2 seconds after page setup)
    catTimer = setTimeout(spawnCat, 2000);
}

// =========================================
// Projects Carousel
// =========================================
(function initCarousel() {
    const track = document.getElementById('carousel-track');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const dotsContainer = document.getElementById('carousel-dots');

    if (!track || !prevBtn || !nextBtn || !dotsContainer) return;

    const cards = track.querySelectorAll('.project-card');
    const gapPx = 20;
    let perPage, totalPages, currentPage = 0;

    function getPerPage() {
        return 1;
    }

    function buildDots() {
        dotsContainer.innerHTML = '';
        for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement('span');
            dot.classList.add('carousel-dot');
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToPage(i));
            dotsContainer.appendChild(dot);
        }
    }

    function goToPage(page) {
        currentPage = page;

        // Each card is (100/perPage)% of the viewport width
        // Each page shifts by 100% of the viewport + gap per page
        const offset = page * 100; // percentage
        const gapOffset = page * gapPx; // pixels for gaps

        track.style.transform = `translateX(calc(-${offset}% - ${gapOffset}px))`;

        // Update dots
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((d, i) => {
            d.classList.toggle('active', i === currentPage);
        });

        // Arrow visibility
        prevBtn.style.visibility = currentPage === 0 ? 'hidden' : 'visible';
        nextBtn.style.visibility = currentPage >= totalPages - 1 ? 'hidden' : 'visible';
    }

    function setup() {
        const newPerPage = getPerPage();
        const newTotalPages = Math.ceil(cards.length / newPerPage);

        // Only rebuild if layout changed
        if (newPerPage !== perPage || newTotalPages !== totalPages) {
            perPage = newPerPage;
            totalPages = newTotalPages;

            // Clamp current page
            if (currentPage >= totalPages) {
                currentPage = totalPages - 1;
            }

            buildDots();
        }

        goToPage(currentPage);
    }

    prevBtn.addEventListener('click', () => {
        if (currentPage > 0) goToPage(currentPage - 1);
    });

    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages - 1) goToPage(currentPage + 1);
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchEndX = 0;

    track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) {
            if (diff > 0 && currentPage < totalPages - 1) {
                goToPage(currentPage + 1);
            } else if (diff < 0 && currentPage > 0) {
                goToPage(currentPage - 1);
            }
        }
    }, { passive: true });

    // Recalculate on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setup, 150);
    });

    // Initial setup
    setup();
})();

// =========================================
// Hero to Experience Scroll Snap
// =========================================
(function initHeroScrollSnap() {
    let isSnapping = false;
    let touchStartY = 0;

    function handleScrollDown(e) {
        // Only intercept if we are at the very top of the page
        if (window.scrollY > 10) return;

        // Determine if the user is scrolling visually DOWN the page
        let isScrollDown = false;

        if (e.type === 'wheel') {
            if (e.deltaY > 0) isScrollDown = true;
        } else if (e.type === 'touchmove') {
            const currentY = e.touches[0].clientY;
            if (touchStartY - currentY > 10) isScrollDown = true;
        }

        if (isScrollDown && !isSnapping) {
            e.preventDefault();
            isSnapping = true;

            const expSection = document.getElementById('experience');
            if (expSection) {
                const headerOffset = 80;
                const startY = window.pageYOffset;
                const elementY = expSection.getBoundingClientRect().top;
                const targetY = elementY + startY - headerOffset;
                const distance = targetY - startY;
                const duration = 1200; // 1.2 seconds for a cinematic, soft glide
                let startTime = null;

                // Easing function for smooth acceleration and deceleration (easeInOutCubic)
                function easeInOutCubic(t) {
                    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                }

                function animation(currentTime) {
                    if (startTime === null) startTime = currentTime;
                    const timeElapsed = currentTime - startTime;
                    const progress = Math.min(timeElapsed / duration, 1);

                    window.scrollTo(0, startY + distance * easeInOutCubic(progress));

                    if (timeElapsed < duration) {
                        requestAnimationFrame(animation);
                    } else {
                        // Release lock exactly when the precise animation fully stops
                        isSnapping = false;
                    }
                }

                requestAnimationFrame(animation);
            } else {
                setTimeout(() => { isSnapping = false; }, 1000);
            }
        }
    }

    // Use passive: false so we can call preventDefault()
    window.addEventListener('wheel', handleScrollDown, { passive: false });

    window.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', handleScrollDown, { passive: false });
})();

// =========================================
// Hero Contact Button Smooth Scroll
// =========================================
(function initContactScroll() {
    const contactBtn = document.getElementById('hero-contact-btn');
    if (!contactBtn) return;

    contactBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const contactSection = document.getElementById('contact');
        if (!contactSection) return;

        const headerOffset = 80;
        const startY = window.pageYOffset;
        const elementY = contactSection.getBoundingClientRect().top;
        const targetY = elementY + startY - headerOffset;
        const distance = targetY - startY;
        const duration = 1200; // 1.2 seconds for cinematic glide
        let startTime = null;

        function easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);

            window.scrollTo(0, startY + distance * easeInOutCubic(progress));

            if (timeElapsed < duration) {
                requestAnimationFrame(animation);
            }
        }

        requestAnimationFrame(animation);
    });
})();

// =========================================
// Terminal Email Copy to Clipboard
// =========================================
(function initEmailCopy() {
    const copyEmailBtn = document.getElementById('copy-email');
    const copyToast = document.getElementById('copy-toast');

    if (!copyEmailBtn || !copyToast) return;

    copyEmailBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const emailToCopy = copyEmailBtn.getAttribute('data-email');
        if (!emailToCopy) return;

        try {
            await navigator.clipboard.writeText(emailToCopy);

            // Show toast
            copyToast.classList.add('show');

            // Hide toast after 2 seconds
            setTimeout(() => {
                copyToast.classList.remove('show');
            }, 2000);

        } catch (err) {
            console.error('Failed to copy email to clipboard', err);
        }
    });
})();
