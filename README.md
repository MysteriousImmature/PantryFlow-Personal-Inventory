# PantryFlow

PantryFlow is a private, offline-first grocery and home inventory manager built with vanilla HTML, CSS, and JavaScript. It helps you track pantry stock, expiry dates, shopping lists, budgets, and household storage locations without sending your data to a server.

## Features

- Track item quantities, prices, expiry dates, notes, and low-stock thresholds.
- Organize inventory by location, category, subcategory, and measurement unit.
- Search, filter, sort, and switch between grid and list views.
- Monitor items that are low, depleted, expired, or expiring within seven days.
- View total stock, estimated inventory value, and an overall pantry-health score.
- Create multiple shopping lists with individual budgets.
- Mark shopping items as purchased and move purchased quantities into inventory.
- Export and import inventory data using SQL or CSV files.
- Validate imported records, duplicate IDs, and relationships before saving changes.
- Choose light, dark, or system theme and one of six supported currencies.
- Use a responsive interface designed for desktop, tablet, mobile, and print.
- Continue using the app offline after its files have been cached.

## Privacy and offline use

PantryFlow stores its data in the browser's `localStorage`. It does not require an account, backend, database server, analytics service, or external API.

The included Content Security Policy blocks external connections, and the service worker caches the application shell for offline use.

> **Important:** Clearing browser site data will remove your PantryFlow inventory. Export a SQL or CSV backup before clearing browser storage or moving to another device.

## Tech stack

| Layer | Technology |
| --- | --- |
| Structure | Semantic HTML5 |
| Styling | CSS3 with responsive layouts, custom properties, and dark mode |
| Application logic | Vanilla JavaScript |
| Persistence | Browser `localStorage` |
| Offline support | Service Worker and Cache API |
| Backup formats | SQL and CSV |

No framework, package manager, build step, or third-party dependency is required.

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/pantryflow.git
cd pantryflow
```

### 2. Start a local web server

Using Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also use another static server, such as VS Code Live Server.

> Opening `index.html` directly may allow the main interface to work, but serving the project through `localhost` is recommended because service workers are not registered on the `file://` protocol.

## How to use

1. Open PantryFlow. Example inventory data is added automatically on first launch.
2. Select **Add item** to record stock, price, expiry, shopping quantity, and notes.
3. Use the pantry controls to search, filter, sort, or quickly adjust stock.
4. Open **Shopping lists** to track purchases, estimates, budgets, and progress.
5. Select **Clear purchased & restock** to add purchased quantities to pantry stock.
6. Open **Settings** to manage locations, categories, units, lists, appearance, and backups.

Press `/` anywhere outside a form field to focus the global search box.

## Backup and restore

PantryFlow supports two portable backup formats:

### SQL

- Exports the relational table schema and `INSERT` statements in one `.sql` file.
- Restores all supported inventory datasets from a complete PantryFlow SQL backup.

### CSV

- Exports separate files for items, locations, categories, shopping lists, and units.
- Imports one or more supported PantryFlow CSV datasets.

Imports can either replace matching datasets or merge new records. Before changing local data, PantryFlow checks for malformed records, duplicate IDs, invalid numeric values, and broken relationships between items and their locations, categories, units, or shopping lists.

## Project structure

```text
pantryflow/
├── index.html   # Application structure, dialogs, controls, and SVG icons
├── style.css    # Responsive design, themes, print styles, and animations
├── script.js    # Storage, business rules, UI rendering, events, and service worker
└── README.md    # Project documentation
```

## Application architecture

The JavaScript uses a layered structure:

```text
DataStore → PantryService → AppView → AppController
```

- `DataStore` manages browser persistence and relational validation.
- `PantryService` contains inventory and shopping-list rules.
- `AppView` renders the interface and dialogs.
- `AppController` connects user events to application behavior.
- `BackupService` handles SQL and CSV import/export.

For debugging, the app exposes `window.PantryFlow`, including its version, storage keys, and a validation helper.

## Deploying with GitHub Pages

1. Push `index.html`, `style.css`, and `script.js` to the repository root.
2. Open the repository's **Settings** page.
3. Select **Pages**.
4. Choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save and open the published URL after deployment finishes.

All asset paths are relative, so the project can run from a GitHub Pages project subdirectory without a build step.

## Browser requirements

Use a current version of Chrome, Edge, Firefox, or Safari. The browser must support:

- `localStorage`
- HTML `<dialog>`
- Service Workers and the Cache API for offline caching
- Modern CSS features such as `color-mix()` and `:has()`

Offline caching requires HTTPS in production or `localhost` during development.

## Accessibility

The interface includes semantic labels, keyboard focus styles, live regions for dynamic updates, accessible dialog controls, descriptive button labels, reduced-motion support, and responsive mobile navigation.

## Contributing

Contributions are welcome. Fork the repository, create a focused branch, test the change in a modern browser, and open a pull request with a clear description.