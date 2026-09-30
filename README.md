# Webová administrace

Jednoduchý blog s administrací. Veřejná část blogu se renderuje na serveru (SSR)
pomocí Node.js a Expressu. Administrace běží v prohlížeči a funguje i offline
(Service Worker + localStorage).

## Požadavky
- Node.js 18 nebo novější (kontrola: `node -v`)

## Spuštění
1. Otevřete terminál ve složce projektu a přejděte do složky blog-cms příkazem `cd blog-cms`.
2. Nainstalujte závislosti:
```
   npm install
```
3. Spusťte server:
```
   npm start
```
4. V terminálu se objeví `Blog běží na http://localhost:3000`.

## Adresy v prohlížeči
- Veřejný blog (SSR): http://localhost:3000
- Administrace: http://localhost:3000/admin

## První použití
Aplikace neobsahuje žádný předvytvořený účet.
1. Otevřete http://localhost:3000/admin
2. Klikněte na „Vytvořit účet“ a zaregistrujte se.
3. Poté se můžete přihlásit a vytvářet příspěvky, stránky a rubriky.

## Struktura projektu
- `server.js` – server, API a SSR šablony veřejného blogu
- `public/admin.html` – stránka administrace
- `public/admin.js` – kód administrace
- `public/md.js` – převod Markdownu na HTML (sdílí server i prohlížeč)
- `public/style.css` – vzhled
- `public/sw.js` – Service Worker pro offline režim
- `data.json` – databáze v souboru (vznikne při první registraci)

## Poznámky
- Smazáním `data.json` a zastavením serveru začnete od nuly.
- Offline režim: po prvním načtení administrace jde znovu otevřít i bez připojení.
  Změny se uloží do prohlížeče a po obnovení připojení se odešlou na server.
- Přihlášení a registrace potřebují běžící server.
- Server se zastaví klávesami Ctrl+C v terminálu.