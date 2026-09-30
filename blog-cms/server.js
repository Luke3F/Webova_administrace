/* ===== Načtení knihoven ===== */
const express = require('express'); // Webový server Express
const fs = require('fs'); // Práce se soubory
const path = require('path'); // Práce s cestami k souborům
const crypto = require('crypto'); // Hashování hesel a náhodné texty
const { md, esc } = require('./public/md.js'); // Markdown a ošetření textu (sdílí server i prohlížeč)

/* ===== Nastavení serveru ===== */
const app = express(); // Vytvoří aplikaci
const SOUBOR = path.join(__dirname, 'data.json'); // Do tohoto souboru se ukládají data
app.use(express.json({ limit: '5mb' })); // Server umí číst JSON z požadavků
app.use(express.static(path.join(__dirname, 'public'))); // Složka public je dostupná (css, js)
// Jednoduchá adresa pro ověření, že server běží (používá ji administrace)
app.get('/api/ping', (req, res) => {
    res.json({ ok: true }); // Server odpoví, tedy je dostupný
});

/* ===== Data ===== */
let db = {
    users: [], // Žádný předvytvořený uživatel
    sessions: {}, // Přihlášení: token -> id uživatele
    name: 'Redakce', // Název blogu
    cats: [{ id: 'c1', name: 'Obecné' }], // Jedna výchozí rubrika
    posts: [], // Příspěvky
    pages: [], // Stránky
};

// Pokud už existuje soubor s daty, načteme je
if (fs.existsSync(SOUBOR)) {
    db = JSON.parse(fs.readFileSync(SOUBOR, 'utf8')); // Přečte soubor a změní text na objekt
}

// Uloží všechna data do souboru
function ulozit() {
    fs.writeFileSync(SOUBOR, JSON.stringify(db, null, 2)); // Zapíše objekt jako čitelný JSON
}

/* ===== Pomocné funkce ===== */

// Vytvoří náhodný text (pro id, sůl a token)
function nahodnyText() {
    return crypto.randomBytes(16).toString('hex');
}

// Zahashuje heslo (heslo se nikdy neukládá jako čistý text)
function hashHesla(heslo, sul) {
    return crypto.scryptSync(heslo, sul, 32).toString('hex');
}

// Vrátí uživatele bez hesla (to nechceme posílat do prohlížeče)
function verejnyUzivatel(u) {
    return { name: u.name, email: u.email, bio: u.bio };
}

// Vytvoří přihlášení a pošle token do prohlížeče
function prihlasit(uzivatel, res) {
    const token = nahodnyText(); // Nový náhodný token
    db.sessions[token] = uzivatel.id; // Zapamatujeme si, komu token patří
    ulozit(); // Uložíme do souboru
    res.json({ token: token, user: verejnyUzivatel(uzivatel) }); // Pošleme odpověď
}

// Kontrola, jestli je uživatel přihlášený (používá se u chráněných adres)
function jePrihlasen(req, res, next) {
    const hlavicka = req.headers.authorization || ''; // Hlavička s tokenem
    const token = hlavicka.replace('Bearer ', ''); // Odstraní slovo Bearer
    const id = db.sessions[token]; // Najde id uživatele podle tokenu
    const uzivatel = db.users.find((u) => u.id === id); // Najde uživatele podle id
    if (!uzivatel) {
        return res.status(401).json({ error: 'Nepřihlášen' }); // Není přihlášen
    }
    req.user = uzivatel; // Uložíme uživatele pro další funkce
    next(); // Pokračujeme dál
}

/* ===== API: registrace a přihlášení ===== */

// Registrace nového uživatele
app.post('/api/register', (req, res) => {
    const jmeno = req.body.name; // Jméno z formuláře
    const email = req.body.email; // E-mail z formuláře
    const heslo = req.body.pw; // Heslo z formuláře
    if (!jmeno || !email || !heslo || heslo.length < 6) {
        return res.status(400).json({ error: 'Vyplňte jméno, e-mail a heslo (min. 6 znaků).' }); // Špatné údaje
    }
    const emailMale = email.toLowerCase(); // E-mail malými písmeny
    const existuje = db.users.find((u) => u.email === emailMale); // Najde uživatele podle e-mailu
    if (existuje) {
        return res.status(400).json({ error: 'Tento e-mail už existuje.' }); // E-mail je obsazený
    }
    const sul = nahodnyText(); // Náhodná sůl k heslu
    const novy = {
        id: nahodnyText(), // Id uživatele
        name: jmeno, // Jméno
        email: emailMale, // E-mail
        salt: sul, // Sůl
        pw: hashHesla(heslo, sul), // Zahashované heslo
        bio: '', // Krátký popis (zatím prázdný)
    };
    db.users.push(novy); // Přidá uživatele do dat
    ulozit(); // Uloží data
    prihlasit(novy, res); // Rovnou ho přihlásí
});

// Přihlášení existujícího uživatele
app.post('/api/login', (req, res) => {
    const email = (req.body.email || '').toLowerCase(); // E-mail malými písmeny
    const heslo = req.body.pw || ''; // Heslo
    const uzivatel = db.users.find((u) => u.email === email); // Najde uživatele podle e-mailu
    if (!uzivatel || hashHesla(heslo, uzivatel.salt) !== uzivatel.pw) {
        return res.status(401).json({ error: 'Nesprávný e-mail nebo heslo.' }); // Špatné údaje
    }
    prihlasit(uzivatel, res); // Přihlásí uživatele
});

/* ===== API: obsah a profil ===== */

// Pošle do prohlížeče všechna data blogu
app.get('/api/state', jePrihlasen, (req, res) => {
    res.json({
        user: verejnyUzivatel(req.user), // Přihlášený uživatel
        name: db.name, // Název blogu
        cats: db.cats, // Rubriky
        posts: db.posts, // Příspěvky
        pages: db.pages, // Stránky
    });
});

// Přijme data z prohlížeče a uloží je
app.put('/api/state', jePrihlasen, (req, res) => {
    db.name = req.body.name || 'Redakce'; // Název blogu
    db.cats = req.body.cats; // Rubriky
    db.posts = req.body.posts; // Příspěvky
    db.pages = req.body.pages; // Stránky
    ulozit(); // Uloží do souboru
    res.json({ ok: true }); // Odpoví, že je hotovo
});

// Uloží změny v profilu
app.put('/api/profile', jePrihlasen, (req, res) => {
    const email = (req.body.email || '').toLowerCase(); // Nový e-mail
    if (!req.body.name || !email) {
        return res.status(400).json({ error: 'Vyplňte jméno a e-mail.' }); // Chybí údaje
    }
    const obsazeno = db.users.find((u) => u.email === email && u !== req.user); // Používá e-mail někdo jiný?
    if (obsazeno) {
        return res.status(400).json({ error: 'E-mail už používá jiný účet.' }); // Obsazeno
    }
    req.user.name = req.body.name; // Nové jméno
    req.user.email = email; // Nový e-mail
    req.user.bio = req.body.bio || ''; // Nový popis
    if (req.body.pw) {
        if (req.body.pw.length < 6) {
            return res.status(400).json({ error: 'Heslo musí mít aspoň 6 znaků.' }); // Krátké heslo
        }
        req.user.salt = nahodnyText(); // Nová sůl
        req.user.pw = hashHesla(req.body.pw, req.user.salt); // Nové zahashované heslo
    }
    ulozit(); // Uloží data
    res.json({ user: verejnyUzivatel(req.user) }); // Pošle nový profil
});

/* ===== SSR: šablony veřejného webu (HTML se skládá na serveru) ===== */

// Převede čas na české datum
function datum(cas) {
    return new Date(cas).toLocaleDateString('cs-CZ');
}

// Najde název rubriky podle id
function nazevRubriky(id) {
    const rubrika = db.cats.find((c) => c.id === id); // Najde rubriku
    if (rubrika) {
        return rubrika.name; // Vrátí její název
    }
    return '—'; // Rubrika neexistuje
}

// Celá HTML stránka: hlavička dokumentu + obsah
function htmlStranka(titulek, obsah) {
    return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(titulek)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>${obsah}</body>
</html>`;
}

// Rám veřejného webu: hlavička s názvem a menu stránek, pod ní obsah
function rozlozeni(obsah) {
    const publikovane = db.pages.filter((p) => p.status === 'pub'); // Jen publikované stránky
    let menu = ''; // Sem se poskládá menu
    publikovane.forEach((p) => {
        menu += `<a href="/stranka/${p.slug}">${esc(p.title)}</a>`; // Odkaz na stránku
    });
    return `<div class="site">
  <header>
    <a class="serif nazev" href="/">${esc(db.name)}</a>
    <nav>${menu}</nav>
  </header>
  ${obsah}
  <p class="mut odstup"><a href="/admin">Administrace</a></p>
</div>`;
}

// Jeden celý článek (příspěvek nebo stránka)
function clanek(polozka, zobrazitRubriku) {
    let popis = datum(polozka.upd); // Datum úpravy
    if (zobrazitRubriku) {
        popis = esc(nazevRubriky(polozka.cat)) + ' · ' + popis; // Přidá rubriku před datum
    }
    return `<article>
  <p class="mut">${popis}</p>
  <h1 class="velky">${esc(polozka.title)}</h1>
  <div class="art">${md(polozka.body)}</div>
</article>`;
}

/* ===== SSR: adresy veřejného webu ===== */

// Náhled z editoru (i nepublikovaný obsah) – HTML taky skládá server
app.post('/api/preview', jePrihlasen, (req, res) => {
    const polozka = req.body; // Rozepsaný obsah z editoru
    polozka.upd = Date.now(); // Datum nastavíme na teď
    const jePrispevek = polozka.type === 'post'; // Je to příspěvek?
    res.send(htmlStranka(polozka.title || 'Náhled', rozlozeni(clanek(polozka, jePrispevek)))); // Pošle hotové HTML
});

// Administrace (klientská aplikace)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html')); // Pošle soubor admin.html
});

// Hlavní stránka (a stejná šablona pro filtr podle rubriky)
app.get(['/', '/rubrika/:id'], (req, res) => {
    const idRubriky = req.params.id; // Id rubriky z adresy (na hlavní stránce žádné není)
    let clanky = db.posts.filter((p) => p.status === 'pub'); // Jen publikované příspěvky
    if (idRubriky) {
        clanky = clanky.filter((p) => p.cat === idRubriky); // Jen z vybrané rubriky
    }
    clanky.sort((a, b) => b.upd - a.upd); // Nejnovější nahoře
    let odkazy = ''; // Sem se poskládají odkazy na rubriky
    db.cats.forEach((c) => {
        odkazy += `<a href="/rubrika/${c.id}">${esc(c.name)}</a> · `; // Odkaz na rubriku
    });
    let vypis = ''; // Sem se poskládá seznam příspěvků
    clanky.forEach((p) => {
        vypis += `<div class="it">
  <span class="mut">${esc(nazevRubriky(p.cat))} · ${datum(p.upd)}</span>
  <h2><a href="/post/${p.slug}">${esc(p.title)}</a></h2>
  <div>${esc(p.excerpt)}</div>
</div>`;
    });
    if (vypis === '') {
        vypis = '<p>Zatím nic nepublikováno.</p>'; // Žádný příspěvek
    }
    res.send(htmlStranka(db.name, rozlozeni(`<p class="mut">${odkazy}</p>${vypis}`))); // Pošle hotovou stránku
});

// Detail příspěvku
app.get('/post/:slug', (req, res, next) => {
    const p = db.posts.find((x) => x.slug === req.params.slug && x.status === 'pub'); // Najde publikovaný příspěvek
    if (!p) {
        return next(); // Nenalezen -> půjde na 404
    }
    res.send(htmlStranka(p.title + ' – ' + db.name, rozlozeni(clanek(p, true)))); // Pošle hotovou stránku
});

// Detail veřejné stránky
app.get('/stranka/:slug', (req, res, next) => {
    const s = db.pages.find((x) => x.slug === req.params.slug && x.status === 'pub'); // Najde publikovanou stránku
    if (!s) {
        return next(); // Nenalezena -> půjde na 404
    }
    res.send(htmlStranka(s.title + ' – ' + db.name, rozlozeni(clanek(s, false)))); // Pošle hotovou stránku
});

// Stránka 404 (spustí se, když nic jiného nesedí)
app.use((req, res) => {
    const obsah = '<h1>404</h1><p>Stránka nenalezena.</p><p><a href="/">← Zpět na blog</a></p>'; // Text chyby
    res.status(404).send(htmlStranka('404', rozlozeni(obsah))); // Pošle s kódem 404
});

/* ===== Spuštění ===== */
app.listen(3000, () => {
    console.log('Blog běží na http://localhost:3000'); // Vypíše adresu
    console.log('Administrace: http://localhost:3000/admin'); // Vypíše adresu administrace
});