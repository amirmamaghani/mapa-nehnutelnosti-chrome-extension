<div align="center">

<img src="chrome-extension/public/icon-128.png" alt="Mapa Nehnuteľností" width="96" height="96" />

# Mapa Nehnuteľností

Chrome rozšírenie, ktoré pridáva interaktívnu mapu inzerátov priamo do [nehnutelnosti.sk](https://www.nehnutelnosti.sk).

</div>

![Náhľad](assets/preview.png)

## Čo to robí

Pri prehliadaní výpisu inzerátov na nehnutelnosti.sk sa v rohu stránky objaví prekrytie s mapou. Adresy z inzerátov sa automaticky geokódujú cez OpenStreetMap Nominatim a zobrazia ako značky na mape. Klikom na značku sa zobrazí náhľad inzerátu a opačne — výber inzerátu pan-uje mapu na jeho polohu.

## Funkcie

### Mapa a markery

- **Live mapa inzerátov** — všetky aktuálne načítané inzeráty z výpisu sú vykreslené na OpenStreetMap dlaždiciach; mapa sa updatuje s každou novou stránkou výsledkov
- **Auto-geokódovanie** — adresy z inzerátov sa na pozadí prekladajú na súradnice cez Nominatim s rate-limitingom (1 dotaz/s)
- **Štítky markerov** — namiesto bodky vie marker zobraziť **cenu**, **názov** alebo **plochu**; rýchly toggle v hlavičke (`·` → `€` → `T` → `m²`) alebo natrvalo cez Nastavenia
- **Indikátor priebehu** — pulzujúca bodka v hlavičke + tenký progress bar pri spodnom okraji ukazujú stav geokódovania
- **Náhľad inzerátu** — klik na marker otvorí kartu s thumbnail, cenou, plochou a odkazom na detail

### Zoznamy

- **Viacero zoznamov** — môžeš mať viacero pomenovaných zoznamov inzerátov a prepínať medzi nimi cez dropdown v hlavičke
- **Vytvorenie / premenovanie / mazanie** zoznamov priamo cez Nastavenia
- **Export do CSV** — každý zoznam je možné stiahnuť ako CSV súbor
- **Import z CSV** — vytvor nový zoznam z CSV (užitočné pre migráciu alebo zdieľanie medzi prehliadačmi)

### Filtre

- **Cena** — slider s krokom 10 €, max. = najvyššia cena spomedzi inzerátov v aktuálnom zozname
- **Plocha** — dual-handle slider rozsahu od–do (m²) s krokom 1 m²

### Okno overlayu

Tri nezávislé toggly v hlavičke:

- **`↔` Horizontálna expanzia** — okno na celú šírku obrazovky
- **`↕` Vertikálna expanzia** — okno na celú výšku obrazovky
- **`_` Minimalizácia** — zbalí overlay do plávajúcej bubliny s počtom geokódovaných inzerátov

Predvolená veľkosť je 40 vw × 40 vh; všetky 4 kombinácie expanzií fungujú nezávisle.

### Vzhľad

- **Poloprehľadné okno** (Nastavenia) — overlay sa stmaví na 40 % opacity, pri prejdení myšou sa plynulo vráti na 100 %. Hodí sa keď chceš vidieť obsah pod overlayom.

### Obľúbené

- Označ ⭐ inzerát v náhľade — uloží sa naprieč reštartmi a v mape sa odlíši žltou farbou

### Cache

- **Geokódované súradnice** sa cachujú v IndexedDB s expiráciou 7 dní — pri opätovnej návšteve sa už nedotazujú znova
- **„Vymazať cache"** v Nastaveniach vyčistí lokálnu cache

### Lokalizácia

- Slovenčina (predvolené) + angličtina

## Inštalácia do Chrome

> Funguje aj v Edge, Brave a iných Chromium-based prehliadačoch — postup je rovnaký.

1. **Stiahni `.zip`** z najnovšej [release](../../releases/latest) — súbor `mapa-nehnutelnosti-vX.Y.Z-chrome.zip`.
2. **Rozbaľ** ZIP do priečinka, ktorý nezmažeš (rozšírenie sa načítava priamo z neho — keď priečinok zmažeš, prestane fungovať).
3. **Otvor Chrome** a do adresného riadku napíš `chrome://extensions` → Enter.
4. **Zapni Developer mode** prepínačom v pravom hornom rohu.
5. Klikni **„Load unpacked"** (vľavo hore) a vyber **rozbalený priečinok** (nie ZIP súbor).
6. Rozšírenie sa objaví v zozname so svojou ikonou. Pripni si ho v lište cez puzzle ikonu 🧩 → 📌.
7. Otvor [nehnutelnosti.sk](https://www.nehnutelnosti.sk) a začni prehliadať inzeráty — overlay s mapou sa objaví v pravom dolnom rohu.

### Aktualizácia na novšiu verziu

1. Stiahni nový `.zip` z [Releases](../../releases/latest)
2. Rozbaľ ho **na to isté miesto**, prepíš starú verziu
3. V `chrome://extensions` klikni na ikonku ↻ (refresh) pri Mapa Nehnuteľností

### Odinštalovanie

V `chrome://extensions` klikni **Remove** pri Mapa Nehnuteľností. Lokálne dáta (zoznamy, obľúbené, cache) sa zmažú spolu s rozšírením.

### Firefox

V každej [release](../../releases/latest) je tiež `.xpi` súbor. Otvor `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → vyber `.xpi`. (Trvalá inštalácia mimo AMO vyžaduje signature, takže `.xpi` sa po reštarte Firefoxu odstráni.)

## Inštalácia (vývoj)

Repozitár používa **pnpm** workspaces a **Turborepo**.

```bash
pnpm install
pnpm dev
```

Build:

```bash
pnpm build
```

Načítanie do Chrome:

1. Otvoriť `chrome://extensions`
2. Zapnúť **Developer mode**
3. **Load unpacked** → vybrať priečinok `dist/`
4. Otvoriť ľubovoľný výpis na nehnutelnosti.sk

## Stack

- **React 19** + **TypeScript** + **Vite**
- **Leaflet** + **OpenStreetMap** dlaždice
- **Nominatim** geokóder s rate-limitingom v background service workeri
- **Tailwind CSS** + **Shadow DOM** izolácia overlayu
- **IndexedDB** cache, **chrome.storage** pre preferencie
- **Manifest V3**

## Súkromie

- Žiadne dáta neopúšťajú prehliadač okrem dotazov na verejné OSM služby (`tile.openstreetmap.org`, `nominatim.openstreetmap.org`)
- Žiadny tracking ani analytika
- Inzeráty, súradnice, zoznamy aj obľúbené sú uložené iba lokálne v prehliadači

## Autor

**Amir Mamaghani** — [amir@mamaghani.io](mailto:amir@mamaghani.io)

## Licencia

MIT © 2026 Amir Mamaghani
