/* ===== Ošetření textu a Markdown (používá server i prohlížeč) ===== */

// Zamění nebezpečné znaky, aby v textu nešel spustit cizí HTML kód
function esc(text) {
    return String(text || '') // Změní na text (prázdné hodnoty na '')
        .replace(/&/g, '&amp;') // & na &amp;
        .replace(/</g, '&lt;') // < na &lt;
        .replace(/>/g, '&gt;') // > na &gt;
        .replace(/"/g, '&quot;'); // " na &quot;
}

// Převede Markdown text na HTML
function md(text) {
    const bezpecny = esc(text); // Nejdřív ošetříme znaky
    const odstavce = bezpecny.split(/\n{2,}/); // Rozdělí text podle prázdných řádků
    let html = ''; // Sem se poskládá výsledek
    odstavce.forEach((o) => {
        if (o.startsWith('## ')) {
            html += '<h2>' + o.slice(3) + '</h2>'; // Nadpis (##)
        } else if (o.startsWith('# ')) {
            html += '<h2>' + o.slice(2) + '</h2>'; // Nadpis (#)
        } else if (o.startsWith('- ')) {
            const radky = o.split('\n'); // Jednotlivé řádky seznamu
            html += '<ul>'; // Začátek seznamu
            radky.forEach((r) => {
                html += '<li>' + r.replace('- ', '') + '</li>'; // Jedna položka seznamu
            });
            html += '</ul>'; // Konec seznamu
        } else {
            html += '<p>' + o.replace(/\n/g, '<br>') + '</p>'; // Obyčejný odstavec
        }
    });
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); // **text** -> tučně
    html = html.replace(/\*(.+?)\*/g, '<i>$1</i>'); // *text* -> kurzíva
    html = html.replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>'); // [text](adresa) -> odkaz
    return html; // Vrátí hotové HTML
}

// Na serveru (Node) zpřístupní funkce přes require
if (typeof module !== 'undefined') {
    module.exports = { esc: esc, md: md };
}