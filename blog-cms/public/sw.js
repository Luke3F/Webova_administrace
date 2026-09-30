/* ===== Service Worker: offline režim administrace ===== */

const CACHE = 'blog-admin-v2'; // Název cache (nová verze vynutí přeinstalaci a čerstvé soubory)

// Soubory, které se uloží pro offline použití
const SOUBORY = [
    '/admin', // Adresa administrace
    '/admin.html', // Stránka administrace
    '/admin.js', // Kód administrace
    '/md.js', // Markdown funkce
    '/style.css', // Vzhled
];

// Instalace: při prvním načtení uloží soubory do cache
self.addEventListener('install', (udalost) => {
    udalost.waitUntil(
        caches.open(CACHE).then((cache) => {
            return cache.addAll(SOUBORY.map((s) => new Request(s, { cache: 'no-store' }))); // Stáhne čerstvé soubory
        })
    );
    self.skipWaiting(); // Nový Service Worker se aktivuje hned
});

// Aktivace: smaže staré cache z dřívějších verzí
self.addEventListener('activate', (udalost) => {
    udalost.waitUntil(
        caches.keys().then((nazvy) => {
            const stare = nazvy.filter((n) => n !== CACHE); // Všechny cache kromě aktuální
            return Promise.all(stare.map((n) => caches.delete(n))); // Smaže je
        })
    );
    self.clients.claim(); // Převezme řízení otevřených stránek
});

// Každý požadavek prohlížeče projde tudy
self.addEventListener('fetch', (udalost) => {
    const pozadavek = udalost.request; // Aktuální požadavek
    if (pozadavek.method !== 'GET') {
        return; // POST a PUT (API) necháme jít přímo na server
    }
    const url = new URL(pozadavek.url); // Rozebraná adresa
    if (url.origin !== location.origin) {
        return; // Cizí weby (např. Google Fonts) neřešíme
    }
    if (!SOUBORY.includes(url.pathname)) {
        return; // Veřejný web (SSR) a API (i /api/ping) necháme na serveru
    }
    udalost.respondWith(
        fetch(pozadavek, { cache: 'no-store' }) // Vždy se nejdřív zeptáme serveru
            .then((odpoved) => {
                // Server odpověděl -> uložíme čerstvou kopii do cache
                if (odpoved.ok) {
                    const kopie = odpoved.clone(); // Odpověď jde použít jen jednou, proto kopie
                    caches.open(CACHE).then((cache) => cache.put(url.pathname, kopie)); // Uloží kopii
                }
                return odpoved; // Vrátí odpověď serveru
            })
            .catch(() => {
                // Server není dostupný (offline) -> vrátíme soubor z cache
                return caches.match(url.pathname);
            })
    );
});