/* ===== Data v prohlížeči (funguje i offline) ===== */
const KLIC = 'blog-cms-data'; // Název, pod kterým se data ukládají v prohlížeči
let data = nacistLokalne(); // Všechna data aplikace
let docasny = null; // Rozepsaný obsah pro náhled
let chyba = ''; // Text chyby u přihlášení
let serverOnline = navigator.onLine; // Je server opravdu dostupný? (na začátku odhad z prohlížeče)
let probiha = false; // Právě běží synchronizace? (zabrání dvojímu spuštění)

// Prázdná data (po odhlášení nebo při prvním spuštění)
function prazdnaData() {
    return {
        token: null, // Přihlašovací token
        user: null, // Přihlášený uživatel
        name: 'Redakce', // Název blogu
        cats: [], // Rubriky
        posts: [], // Příspěvky
        pages: [], // Stránky
        zmena: false, // true = změny ještě nejsou na serveru
    };
}

// Načte data z prohlížeče
function nacistLokalne() {
    const text = localStorage.getItem(KLIC); // Přečte uložený text
    if (text) {
        return JSON.parse(text); // Změní text na objekt
    }
    return prazdnaData(); // Nic uloženo -> prázdná data
}

// Uloží data do prohlížeče
function ulozitLokalne() {
    localStorage.setItem(KLIC, JSON.stringify(data)); // Změní objekt na text a uloží
}

// Uloží změnu lokálně a zkusí ji poslat na server
function ulozitZmenu() {
    data.zmena = true; // Poznačíme, že server ještě nemá poslední verzi
    ulozitLokalne(); // Uložíme do prohlížeče (funguje i offline)
    aktualizovatStav(); // Hned ukážeme "čeká na synchronizaci"
    synchronizovat(); // Zkusíme poslat na server (offline se nic nestane)
}

/* ===== Komunikace se serverem ===== */

// Pošle požadavek na server a vrátí odpověď
async function api(adresa, metoda, telo) {
    const odpoved = await fetch(adresa, {
        method: metoda || 'GET', // Výchozí metoda je GET
        headers: {
            'Content-Type': 'application/json', // Posíláme JSON
            Authorization: 'Bearer ' + data.token, // Token přihlášeného uživatele
        },
        body: telo ? JSON.stringify(telo) : undefined, // Tělo požadavku (pokud nějaké je)
    });
    const vysledek = await odpoved.json().catch(() => ({})); // Přečte JSON z odpovědi
    if (!odpoved.ok) {
        throw new Error(vysledek.error || 'Chyba serveru'); // Server vrátil chybu
    }
    return vysledek; // Vrátí výsledek
}

// Synchronizace: pošle změny na server, nebo z něj stáhne aktuální data
async function synchronizovat() {
    if (!data.token || !serverOnline || probiha) {
        return; // Nejsme přihlášeni, server není dostupný, nebo už synchronizace běží
    }
    probiha = true; // Poznačíme, že synchronizace běží
    let odesilali = false; // Pamatuje si, jestli jsme se pokoušeli odeslat změny
    try {
        if (data.zmena) {
            // Máme nové změny -> pošleme je na server
            odesilali = true;
            data.zmena = false; // Předem shodíme příznak (kdyby vznikla další změna během odesílání)
            await api('/api/state', 'PUT', {
                name: data.name,
                cats: data.cats,
                posts: data.posts,
                pages: data.pages,
            });
        } else {
            // Žádné změny -> stáhneme data ze serveru
            const server = await api('/api/state');
            if (!data.zmena) {
                // Použijeme je, jen když mezitím nevznikla nová lokální změna
                data.name = server.name; // Název blogu
                data.cats = server.cats; // Rubriky
                data.posts = server.posts; // Příspěvky
                data.pages = server.pages; // Stránky
                data.user = server.user; // Uživatel
            }
        }
        ulozitLokalne(); // Uložíme i do prohlížeče
    } catch (e) {
        if (odesilali) {
            data.zmena = true; // Odeslání selhalo -> změny zůstávají čekat
            ulozitLokalne(); // Uložíme příznak
        }
        if (e instanceof TypeError) {
            serverOnline = false; // Síťová chyba -> server není dostupný
        }
        if (e.message === 'Nepřihlášen') {
            probiha = false; // Synchronizace skončila
            odhlasit(false); // Token už neplatí -> odhlásíme
            return;
        }
    }
    probiha = false; // Synchronizace skončila
    aktualizovatStav(); // Aktualizuje text v menu
    if (!jeEditor()) {
        vykreslit(); // Překreslíme, ale ne během psaní v editoru
    }
}

// Zjistí, jestli je otevřený editor nebo náhled
function jeEditor() {
    const h = location.hash; // Aktuální adresa (část za #)
    return h.startsWith('#/post/') || h.startsWith('#/page/') || h === '#/preview';
}

// Odhlášení uživatele
async function odhlasit(poslatZmeny) {
    if (poslatZmeny && data.zmena) {
        await synchronizovat(); // Nejdřív pošleme neuložené změny
    }
    data = prazdnaData(); // Smažeme data
    ulozitLokalne(); // Uložíme prázdná data
    location.hash = '#/login'; // Přejdeme na přihlášení
    vykreslit(); // Překreslíme stránku
}

/* ===== Stav připojení (Online / Offline) ===== */

// Vrátí text a barvu tečky podle připojení a synchronizace
function textStavu() {
    const online = serverOnline; // Je server opravdu dostupný?
    let text = ''; // Text pro menu
    if (online) {
        text = data.zmena ? 'Online · čeká na synchronizaci' : 'Online · synchronizováno'; // Online
    } else {
        text = data.zmena ? 'Offline · změny uloženy lokálně' : 'Offline · data z tohoto zařízení'; // Offline
    }
    return { text: text, tecka: online ? 'dot' : 'dot off' }; // Zelená nebo červená tečka
}

// Přepíše stav v menu bez překreslení celé stránky
function aktualizovatStav() {
    const misto = document.getElementById('stav'); // Najde místo ve vedlejším menu
    if (!misto) {
        return; // Menu není zobrazené (např. přihlášení)
    }
    const stav = textStavu(); // Aktuální stav
    misto.innerHTML = `<span class="${stav.tecka}"></span>${stav.text}`; // Vloží tečku a text
}

// Ověří, jestli server opravdu odpovídá (navigator.onLine na to nestačí)
async function overitServer() {
    const ridic = new AbortController(); // Umí přerušit dlouho trvající požadavek
    const casovac = setTimeout(() => ridic.abort(), 3000); // Po 3 sekundách požadavek zrušíme
    const drive = serverOnline; // Jaký byl stav před kontrolou
    try {
        await fetch('/api/ping', { cache: 'no-store', signal: ridic.signal }); // Jednoduchý dotaz na server
        serverOnline = true; // Server odpověděl -> je dostupný
    } catch (e) {
        serverOnline = false; // Dotaz selhal -> server není dostupný
    }
    clearTimeout(casovac); // Zrušíme časovač
    aktualizovatStav(); // Přepíše stav v menu
    if (serverOnline && (!drive || data.zmena)) {
        synchronizovat(); // Server se vrátil nebo čekají změny -> synchronizujeme
    }
}

/* ===== Pomocné funkce ===== */

// Vygeneruje náhodné id
function noveId() {
    return Math.random().toString(36).slice(2, 9);
}

// Vyrobí adresu (slug) z názvu: bez diakritiky, malá písmena, pomlčky
function slugovat(text) {
    return text
        .normalize('NFD') // Rozdělí písmena a háčky
        .replace(/[\u0300-\u036f]/g, '') // Smaže háčky a čárky
        .toLowerCase() // Malá písmena
        .replace(/[^a-z0-9]+/g, '-') // Vše ostatní na pomlčku
        .replace(/^-|-$/g, ''); // Smaže pomlčky na kraji
}

// Převede čas na české datum
function datum(cas) {
    return new Date(cas).toLocaleDateString('cs-CZ');
}

// Najde název rubriky podle id
function nazevRubriky(id) {
    const rubrika = data.cats.find((c) => c.id === id); // Najde rubriku
    if (rubrika) {
        return rubrika.name; // Vrátí název
    }
    return '—'; // Rubrika neexistuje
}

// Ukáže krátké oznámení dole na stránce
function toast(text) {
    const okno = document.createElement('div'); // Vytvoří nový prvek
    okno.className = 'toast'; // Nastaví vzhled
    okno.textContent = text; // Nastaví text
    document.body.append(okno); // Přidá ho na stránku
    setTimeout(() => okno.remove(), 1800); // Po chvíli ho odstraní
}

// Vrátí štítek se stavem (Publikováno / Koncept)
function stitekStavu(stav) {
    if (stav === 'pub') {
        return '<span class="pill pub">Publikováno</span>'; // Zelený štítek
    }
    return '<span class="pill">Koncept</span>'; // Šedý štítek
}

/* ===== Šablony obrazovek (vrací HTML text) ===== */

// Přihlášení a registrace (podle parametru se liší nadpis a pole)
function htmlPrihlaseni(registrace) {
    const id = registrace ? 'reg' : 'login'; // Id formuláře
    const nadpis = registrace ? 'Vytvořte si účet' : 'Přihlaste se do administrace'; // Podnadpis
    const pole = registrace ? '<label>Jméno</label><input name="name" required>' : ''; // Jméno jen při registraci
    const tlacitko = registrace ? 'Registrovat' : 'Přihlásit'; // Text tlačítka
    const odkaz = registrace ? '<a href="#/login">Už mám účet</a>' : '<a href="#/register">Vytvořit účet</a>'; // Přepínací odkaz
    return `<div class="auth">
  <h1 class="serif">Redakce</h1>
  <p class="sub">${nadpis}</p>
  <div class="box">
    <form id="${id}">
      ${pole}
      <label>E-mail</label>
      <input name="email" type="email" required>
      <label>Heslo</label>
      <input name="pw" type="password" minlength="6" required>
      <p class="err">${esc(chyba)}</p>
      <button class="p siroke">${tlacitko}</button>
    </form>
  </div>
  <p class="mut">${odkaz}</p>
</div>`;
}

// Rám administrace: postranní menu + obsah
function htmlRam(aktivni, obsah) {
    const polozky = [
        ['dash', 'Přehled'],
        ['posts', 'Příspěvky'],
        ['pages', 'Stránky'],
        ['cats', 'Rubriky'],
        ['profile', 'Profil'],
    ]; // Položky menu
    let menu = ''; // Sem se poskládá menu
    polozky.forEach((p) => {
        let trida = ''; // Třída pro aktivní položku
        if (p[0] === aktivni) {
            trida = 'on'; // Zvýrazní aktuální stránku
        }
        menu += `<a href="#/${p[0]}" class="${trida}">${p[1]}</a>`; // Jeden odkaz v menu
    });
    const stav = textStavu(); // Text a tečka pro stav připojení
    return `<div class="shell">
  <aside>
    <div class="logo">Redakce</div>
    ${menu}
    <div class="sp"></div>
    <small id="stav"><span class="${stav.tecka}"></span>${stav.text}</small>
    <a href="#/out">Odhlásit (${esc(data.user.name)})</a>
  </aside>
  <main>${obsah}</main>
</div>`;
}

// Přehled (dashboard)
function htmlPrehled() {
    const publikovane = data.posts.filter((p) => p.status === 'pub').length; // Počet publikovaných
    const koncepty = data.posts.length - publikovane; // Počet konceptů
    const vse = []; // Příspěvky i stránky dohromady
    data.posts.forEach((p) => vse.push({ ...p, typ: 'post' })); // Přidá příspěvky
    data.pages.forEach((p) => vse.push({ ...p, typ: 'page' })); // Přidá stránky
    vse.sort((a, b) => b.upd - a.upd); // Nejnovější nahoře
    let radky = ''; // Sem se poskládají řádky tabulky
    vse.slice(0, 6).forEach((x) => {
        const druh = x.typ === 'post' ? 'Příspěvek' : 'Stránka'; // Druh obsahu
        radky += `<tr>
  <td class="t"><a href="#/${x.typ}/${x.id}">${esc(x.title)}</a></td>
  <td class="mut">${druh}</td>
  <td>${stitekStavu(x.status)}</td>
  <td class="mut">${datum(x.upd)}</td>
</tr>`; // Jeden řádek tabulky
    });
    if (radky === '') {
        radky = '<tr><td class="mut">Zatím žádný obsah.</td></tr>'; // Nic k zobrazení
    }
    const krestni = data.user.name.split(' ')[0]; // Křestní jméno
    return `<h1>Dobrý den, ${esc(krestni)}</h1>
<p class="sub">Co se dělo naposledy.</p>
<div class="ledger">
  <div><b>${publikovane}</b><span>publikované příspěvky</span></div>
  <div><b>${koncepty}</b><span>koncepty</span></div>
  <div><b>${data.pages.length}</b><span>stránky</span></div>
  <div><b>${data.cats.length}</b><span>rubriky</span></div>
</div>
<div class="bar">
  <h3 class="bez-okraje">Poslední úpravy</h3>
  <span><a class="btn p" href="#/post/new">Nový příspěvek</a> <a class="btn" href="#/page/new">Nová stránka</a></span>
</div>
<div class="tw"><table>${radky}</table></div>`;
}

// Seznam příspěvků nebo stránek (podle parametru typ)
function htmlSeznam(typ) {
    const jePrispevek = typ === 'post'; // Je to seznam příspěvků?
    let polozky = jePrispevek ? data.posts.slice() : data.pages.slice(); // Kopie správného seznamu
    polozky.sort((a, b) => b.upd - a.upd); // Nejnovější nahoře
    const nadpis = jePrispevek ? 'Příspěvky' : 'Stránky'; // Nadpis
    const tlacitko = jePrispevek ? 'Nový příspěvek' : 'Nová stránka'; // Text tlačítka
    const hlavickaRubrika = jePrispevek ? '<th>Rubrika</th>' : ''; // Sloupec rubriky jen u příspěvků
    let radky = ''; // Sem se poskládají řádky
    polozky.forEach((x) => {
        const bunkaRubrika = jePrispevek ? `<td class="mut">${esc(nazevRubriky(x.cat))}</td>` : ''; // Buňka rubriky
        const textPublikace = x.status === 'pub' ? 'Zrušit publikaci' : 'Publikovat'; // Text tlačítka publikace
        radky += `<tr>
  <td class="t"><a href="#/${typ}/${x.id}">${esc(x.title)}</a></td>
  ${bunkaRubrika}
  <td>${stitekStavu(x.status)}</td>
  <td class="mut">${datum(x.upd)}</td>
  <td>
    <button class="l" data-akce="stav" data-typ="${typ}" data-id="${x.id}">${textPublikace}</button>
    <button class="l cervene" data-akce="smazat" data-typ="${typ}" data-id="${x.id}">Smazat</button>
  </td>
</tr>`; // Jeden řádek tabulky
    });
    if (radky === '') {
        radky = '<tr><td>Nic tu zatím není.</td></tr>'; // Prázdný seznam
    }
    return `<div class="bar">
  <div>
    <h1>${nadpis}</h1>
    <p class="sub bez-okraje">${polozky.length} celkem</p>
  </div>
  <a class="btn p" href="#/${typ}/new">${tlacitko}</a>
</div>
<div class="tw">
  <table>
    <tr><th>Název</th>${hlavickaRubrika}<th>Stav</th><th>Změněno</th><th></th></tr>
    ${radky}
  </table>
</div>`;
}

// Editor příspěvku nebo stránky
function htmlEditor(typ, id) {
    const jePrispevek = typ === 'post'; // Příspěvek nebo stránka?
    const seznam = jePrispevek ? data.posts : data.pages; // Správný seznam
    let polozka = null; // Upravovaná položka
    if (docasny && docasny.typ === typ && docasny.id === id) {
        polozka = docasny.polozka; // Návrat z náhledu -> vrátíme rozepsaný text
    } else {
        polozka = seznam.find((x) => x.id === id); // Najde položku podle id
    }
    if (!polozka) {
        // Nová položka
        polozka = { title: '', slug: '', cat: '', excerpt: '', body: '', status: 'draft' };
        if (data.cats.length > 0) {
            polozka.cat = data.cats[0].id; // První rubrika jako výchozí
        }
    }
    const nadpis = id === 'new' ? 'Nový obsah' : 'Úprava'; // Nadpis stránky
    const druh = jePrispevek ? 'Příspěvek' : 'Stránka'; // Druh obsahu
    let poleRubrika = ''; // Rubrika a perex jen u příspěvků
    if (jePrispevek) {
        let moznosti = ''; // Možnosti výběru rubriky
        data.cats.forEach((c) => {
            const vybrano = c.id === polozka.cat ? 'selected' : ''; // Předvybraná rubrika
            moznosti += `<option value="${c.id}" ${vybrano}>${esc(c.name)}</option>`; // Jedna možnost
        });
        poleRubrika = `<label>Rubrika</label>
      <select name="cat">${moznosti}</select>
      <label>Perex</label>
      <input name="excerpt" value="${esc(polozka.excerpt)}">`;
    }
    const vybranoPub = polozka.status === 'pub' ? 'selected' : ''; // Předvybraný stav
    let tlacitkoSmazat = ''; // Smazat jde jen u existující položky
    if (id !== 'new') {
        tlacitkoSmazat = `<button type="button" class="d" data-akce="smazat" data-typ="${typ}" data-id="${id}">Smazat</button>`;
    }
    return `<div class="bar">
  <div>
    <h1>${nadpis}</h1>
    <p class="sub bez-okraje">${druh} · koncepty se ukládají do zařízení</p>
  </div>
  <a href="#/${typ}s">← Zpět</a>
</div>
<form id="editor" data-typ="${typ}" data-id="${id}">
  <div class="ed">
    <div class="box">
      <label class="prvni">Název</label>
      <input name="title" value="${esc(polozka.title)}" required>
      <label>URL (slug)</label>
      <input name="slug" value="${esc(polozka.slug)}" placeholder="vygeneruje se z názvu">
      ${poleRubrika}
      <label>Stav</label>
      <select name="status">
        <option value="draft">Koncept</option>
        <option value="pub" ${vybranoPub}>Publikováno</option>
      </select>
      <div class="tb">
        <button type="button" data-akce="format" data-znak="**">B</button>
        <button type="button" data-akce="format" data-znak="*">I</button>
        <button type="button" data-akce="format" data-znak="## ">H</button>
        <button type="button" data-akce="format" data-znak="- ">•</button>
        <button type="button" data-akce="format" data-znak="[]">🔗</button>
      </div>
      <textarea name="body">${esc(polozka.body)}</textarea>
    </div>
    <div class="box">
      <label class="prvni">Živý náhled</label>
      <div class="art" id="zivy"></div>
    </div>
  </div>
  <p class="odstup">
    <button class="p">Uložit</button>
    <button type="button" data-akce="nahled">Náhled jako na webu</button>
    ${tlacitkoSmazat}
  </p>
</form>`;
}

// Správa rubrik
function htmlRubriky() {
    let radky = ''; // Sem se poskládají řádky
    data.cats.forEach((c) => {
        const pocet = data.posts.filter((p) => p.cat === c.id).length; // Kolik příspěvků rubrika má
        radky += `<tr>
  <td class="t">${esc(c.name)}</td>
  <td class="mut">${pocet} příspěvků</td>
  <td>
    <button class="l" data-akce="prejmenovat" data-id="${c.id}">Přejmenovat</button>
    <button class="l cervene" data-akce="smazat-rubriku" data-id="${c.id}">Odstranit</button>
  </td>
</tr>`; // Jeden řádek tabulky
    });
    return `<div class="bar">
  <div>
    <h1>Rubriky</h1>
    <p class="sub bez-okraje">Třídí příspěvky na veřejném webu.</p>
  </div>
</div>
<form id="rubrika" class="nova-rubrika">
  <input name="name" placeholder="Název nové rubriky" required>
  <button class="p">Přidat</button>
</form>
<div class="tw"><table>${radky}</table></div>`;
}

// Profil a nastavení blogu
function htmlProfil() {
    return `<h1>Profil</h1>
<p class="sub">Údaje autora a nastavení webu.</p>
<form id="profil" class="box uzky">
  <label class="prvni">Jméno</label>
  <input name="name" value="${esc(data.user.name)}" required>
  <label>E-mail</label>
  <input name="email" type="email" value="${esc(data.user.email)}" required>
  <label>O mně</label>
  <input name="bio" value="${esc(data.user.bio)}">
  <label>Název blogu</label>
  <input name="site" value="${esc(data.name)}">
  <label>Nové heslo (nepovinné)</label>
  <input name="pw" type="password" minlength="6">
  <p><button class="p">Uložit profil</button></p>
</form>`;
}

/* ===== Náhled ===== */

// Zobrazí náhled: HTML vyrenderuje server, offline se použije jednoduchá verze
async function zobrazitNahled(app) {
    const polozka = docasny.polozka; // Rozepsaný obsah
    let stav = 'Náhled – obsah ještě není publikován'; // Text v červeném pruhu
    if (polozka.status === 'pub') {
        stav = 'Náhled publikovaného obsahu'; // Jiný text pro publikovaný obsah
    }
    app.innerHTML = `<div class="ban">
  <span>${stav}</span>
  <button data-akce="zpet">← Zpět do editoru</button>
</div>
<iframe id="ramec" class="ramec"></iframe>`; // Pruh nahoře + rámeček pro náhled
    let html = ''; // Sem přijde HTML náhledu
    try {
        const odpoved = await fetch('/api/preview', {
            method: 'POST', // Posíláme data
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.token }, // Hlavičky
            body: JSON.stringify(polozka), // Obsah z editoru
        });
        html = await odpoved.text(); // HTML vyrenderované serverem
    } catch (e) {
        // Server není dostupný (offline) -> jednoduchý náhled v prohlížeči
        html = '<link rel="stylesheet" href="/style.css"><div class="site"><article><h1>' + esc(polozka.title) + '</h1><div class="art">' + md(polozka.body) + '</div></article></div>';
    }
    document.getElementById('ramec').srcdoc = html; // Vloží náhled do rámečku
}

/* ===== Router (přepínání obrazovek podle adresy) ===== */

// Vykreslí správnou obrazovku
function vykreslit() {
    const casti = location.hash.replace('#/', '').split('/'); // Adresa rozdělená na části
    const stranka = casti[0] || 'dash'; // První část adresy
    const app = document.getElementById('app'); // Místo pro obsah
    if (stranka === 'out') {
        odhlasit(true); // Odhlášení
        return;
    }
    if (!data.token) {
        app.innerHTML = htmlPrihlaseni(stranka === 'register'); // Nepřihlášený vidí přihlášení
        return;
    }
    if (stranka === 'login' || stranka === 'register') {
        location.hash = '#/dash'; // Přihlášený nemá být na přihlášení
        return;
    }
    if (stranka === 'preview' && docasny) {
        zobrazitNahled(app); // Náhled
        return;
    }
    let obsah = ''; // Obsah obrazovky
    let menu = stranka; // Která položka menu je aktivní
    if ((stranka === 'post' || stranka === 'page') && casti[1]) {
        obsah = htmlEditor(stranka, casti[1]); // Editor
        menu = stranka + 's'; // V menu zůstane zvýrazněný seznam
    } else if (stranka === 'posts') {
        obsah = htmlSeznam('post'); // Seznam příspěvků
    } else if (stranka === 'pages') {
        obsah = htmlSeznam('page'); // Seznam stránek
    } else if (stranka === 'cats') {
        obsah = htmlRubriky(); // Rubriky
    } else if (stranka === 'profile') {
        obsah = htmlProfil(); // Profil
    } else {
        obsah = htmlPrehled(); // Jinak přehled
        menu = 'dash';
    }
    app.innerHTML = htmlRam(menu, obsah); // Vloží menu a obsah na stránku
    if (document.getElementById('zivy')) {
        aktualizovatZivyNahled(); // V editoru hned ukáže náhled textu
    }
}

// Přepíše živý náhled vedle editoru
function aktualizovatZivyNahled() {
    const text = document.getElementById('editor').body.value; // Text z políčka
    document.getElementById('zivy').innerHTML = md(text); // Převede Markdown na HTML
}

// Přečte hodnoty z formuláře do objektu
function hodnotyFormulare(formular) {
    return Object.fromEntries(new FormData(formular));
}

/* ===== Události ===== */

// Při změně adresy se stránka překreslí
window.addEventListener('hashchange', () => {
    chyba = ''; // Smaže starou chybu
    vykreslit();
});

// Prohlížeč hlásí, že se vrátila síť -> ověříme, jestli odpovídá i server
window.addEventListener('online', () => {
    overitServer();
});

// Prohlížeč hlásí, že síť zmizela -> hned nastavíme Offline
window.addEventListener('offline', () => {
    serverOnline = false;
    aktualizovatStav();
});

// Každých 5 sekund ověříme dostupnost serveru
setInterval(overitServer, 5000);

// Psaní v editoru -> živý náhled
document.addEventListener('input', (e) => {
    if (e.target.form && e.target.form.id === 'editor') {
        aktualizovatZivyNahled();
    }
});

// Odeslání formulářů
document.addEventListener('submit', async (e) => {
    e.preventDefault(); // Zabrání znovunačtení stránky
    const formular = e.target; // Odeslaný formulář
    const hodnoty = hodnotyFormulare(formular); // Hodnoty z formuláře

    if (formular.id === 'login' || formular.id === 'reg') {
        // Přihlášení nebo registrace (potřebuje dostupný server)
        let adresa = '/api/login'; // Adresa pro přihlášení
        if (formular.id === 'reg') {
            adresa = '/api/register'; // Adresa pro registraci
        }
        try {
            const odpoved = await api(adresa, 'POST', hodnoty); // Pošle údaje na server
            data = prazdnaData(); // Začneme s čistými daty
            data.token = odpoved.token; // Uložíme token
            data.user = odpoved.user; // Uložíme uživatele
            ulozitLokalne(); // Uložíme do prohlížeče
            await synchronizovat(); // Stáhneme data ze serveru
            location.hash = '#/dash'; // Přejdeme na přehled
            vykreslit();
        } catch (x) {
            chyba = x.message === 'Failed to fetch' ? 'Server není dostupný.' : x.message; // Text chyby
            vykreslit(); // Ukáže chybu
        }
    } else if (formular.id === 'profil') {
        // Uložení profilu
        try {
            const odpoved = await api('/api/profile', 'PUT', {
                name: hodnoty.name,
                email: hodnoty.email,
                bio: hodnoty.bio,
                pw: hodnoty.pw,
            }); // Pošle profil na server
            data.user = odpoved.user; // Uloží nový profil
            data.name = hodnoty.site || 'Redakce'; // Uloží název blogu
            ulozitZmenu(); // Uloží změny
            toast('Profil uložen');
            vykreslit();
        } catch (x) {
            toast(x.message === 'Failed to fetch' ? 'Profil jde uložit jen online.' : x.message); // Ukáže chybu
        }
    } else if (formular.id === 'rubrika') {
        // Nová rubrika
        data.cats.push({ id: noveId(), name: hodnoty.name.trim() }); // Přidá rubriku
        ulozitZmenu();
        vykreslit();
    } else if (formular.id === 'editor') {
        // Uložení příspěvku nebo stránky
        const typ = formular.dataset.typ; // post nebo page
        const id = formular.dataset.id; // id nebo "new"
        const seznam = typ === 'post' ? data.posts : data.pages; // Správný seznam
        const polozka = {
            ...hodnoty, // Hodnoty z formuláře
            slug: slugovat(hodnoty.slug || hodnoty.title), // Adresa z názvu
            upd: Date.now(), // Čas úpravy
        };
        if (id === 'new') {
            polozka.id = noveId(); // Nové id
            seznam.push(polozka); // Přidá novou položku
        } else {
            const stara = seznam.find((x) => x.id === id); // Najde původní položku
            Object.assign(stara, polozka); // Přepíše ji novými hodnotami
        }
        docasny = null; // Rozepsaný obsah už není potřeba
        ulozitZmenu();
        toast(polozka.status === 'pub' ? 'Publikováno' : 'Uloženo jako koncept');
        location.hash = '#/' + typ + 's'; // Zpět na seznam
    }
});

// Kliknutí na tlačítka s atributem data-akce
document.addEventListener('click', (e) => {
    const tlacitko = e.target.closest('[data-akce]'); // Najde tlačítko, na které se kliklo
    if (!tlacitko) {
        return; // Kliklo se jinam
    }
    const akce = tlacitko.dataset.akce; // Co má tlačítko dělat
    const typ = tlacitko.dataset.typ; // post nebo page
    const id = tlacitko.dataset.id; // id položky

    if (akce === 'stav') {
        // Publikovat / zrušit publikaci
        const seznam = typ === 'post' ? data.posts : data.pages; // Správný seznam
        const x = seznam.find((p) => p.id === id); // Najde položku
        x.status = x.status === 'pub' ? 'draft' : 'pub'; // Přepne stav
        x.upd = Date.now(); // Nový čas úpravy
        ulozitZmenu();
        vykreslit();
    } else if (akce === 'smazat') {
        // Smazání příspěvku nebo stránky
        if (confirm('Opravdu smazat?')) {
            if (typ === 'post') {
                data.posts = data.posts.filter((p) => p.id !== id); // Odstraní příspěvek
            } else {
                data.pages = data.pages.filter((p) => p.id !== id); // Odstraní stránku
            }
            ulozitZmenu();
            location.hash = '#/' + typ + 's'; // Zpět na seznam
            vykreslit();
        }
    } else if (akce === 'prejmenovat') {
        // Přejmenování rubriky
        const rubrika = data.cats.find((c) => c.id === id); // Najde rubriku
        const novy = prompt('Nový název rubriky', rubrika.name); // Zeptá se na nový název
        if (novy && novy.trim()) {
            rubrika.name = novy.trim(); // Změní název
            ulozitZmenu();
            vykreslit();
        }
    } else if (akce === 'smazat-rubriku') {
        // Odstranění rubriky
        if (confirm('Odstranit rubriku? Příspěvky zůstanou bez rubriky.')) {
            data.cats = data.cats.filter((c) => c.id !== id); // Odstraní rubriku
            ulozitZmenu();
            vykreslit();
        }
    } else if (akce === 'format') {
        // Tlačítka nad editorem (tučně, kurzíva, ...)
        const pole = document.getElementById('editor').body; // Textové pole
        const od = pole.selectionStart; // Začátek výběru
        const do_ = pole.selectionEnd; // Konec výběru
        const vyber = pole.value.slice(od, do_) || 'text'; // Vybraný text (nebo slovo "text")
        const znak = tlacitko.dataset.znak; // Jaký formát se má vložit
        let vlozit = ''; // Text, který se vloží
        if (znak === '[]') {
            vlozit = '[' + vyber + '](https://)'; // Odkaz
        } else if (znak === '## ' || znak === '- ') {
            vlozit = znak + vyber; // Nadpis nebo seznam (znak jen na začátku)
        } else {
            vlozit = znak + vyber + znak; // Tučně nebo kurzíva (znak na obou stranách)
        }
        pole.setRangeText(vlozit, od, do_, 'end'); // Nahradí výběr novým textem
        pole.focus(); // Vrátí kurzor do pole
        aktualizovatZivyNahled();
    } else if (akce === 'nahled') {
        // Náhled rozepsaného obsahu
        const formular = document.getElementById('editor'); // Formulář editoru
        const hodnoty = hodnotyFormulare(formular); // Aktuální hodnoty
        docasny = {
            typ: formular.dataset.typ, // post nebo page
            id: formular.dataset.id, // id nebo "new"
            polozka: {
                ...hodnoty, // Hodnoty z formuláře
                slug: slugovat(hodnoty.slug || hodnoty.title), // Adresa z názvu
                type: formular.dataset.typ, // Server podle toho pozná příspěvek
            },
        };
        location.hash = '#/preview'; // Otevře náhled
    } else if (akce === 'zpet') {
        history.back(); // Návrat do editoru
    }
});

/* ===== Service Worker (offline režim) ===== */

// Zaregistruje Service Worker, pokud ho prohlížeč umí
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register('/sw.js') // Soubor sw.js z veřejné složky
        .catch((e) => {
            console.log('Service Worker se nepodařilo zaregistrovat', e); // Vypíše chybu do konzole
        });
}

/* ===== Start aplikace ===== */
vykreslit();
synchronizovat();
overitServer();