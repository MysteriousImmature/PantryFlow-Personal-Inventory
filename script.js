/* PantryFlow — offline grocery & pantry inventory
 * Layered Vanilla JavaScript architecture:
 * DataStore (persistence) → PantryService (domain rules) → AppView (DOM) → AppController (events)
 */

if (typeof document === "undefined") {
  const CACHE_NAME = "pantryflow-shell-v1";
  const APP_SHELL = ["./", "./index.html", "./style.css", "./script.js"];

  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
  });
} else {
  (() => {
    "use strict";

    const STORAGE = Object.freeze({
      locations: "app_locations",
      groceryLists: "app_grocery_lists",
      items: "app_items",
      mainCategories: "app_main_categories",
      subcategories: "app_subcategories",
      units: "app_units",
      preferences: "app_preferences"
    });

    const ARRAY_KEYS = Object.freeze([
      "locations",
      "groceryLists",
      "items",
      "mainCategories",
      "subcategories",
      "units"
    ]);

    const ICONS = new Set(["pantry", "fridge", "snowflake", "spice", "garage", "produce", "dairy", "grain", "household", "box", "cart", "list"]);

    const ENTITY_CONFIG = Object.freeze({
      location: { collection: "locations", itemField: "locationId", label: "location" },
      category: { collection: "mainCategories", itemField: "mainCategoryId", label: "main category" },
      subcategory: { collection: "subcategories", itemField: "subcategoryId", label: "subcategory" },
      unit: { collection: "units", itemField: "unitId", label: "unit" },
      list: { collection: "groceryLists", itemField: "listId", label: "shopping list" }
    });

    const TABLE_DEFINITIONS = Object.freeze([
      {
        table: "app_locations",
        stateKey: "locations",
        fields: [["id", "string"], ["name", "string"], ["color", "string"], ["icon", "string"]],
        create: `CREATE TABLE "app_locations" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "icon" TEXT NOT NULL)`
      },
      {
        table: "app_main_categories",
        stateKey: "mainCategories",
        fields: [["id", "string"], ["name", "string"], ["color", "string"], ["icon", "string"]],
        create: `CREATE TABLE "app_main_categories" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "icon" TEXT NOT NULL)`
      },
      {
        table: "app_subcategories",
        stateKey: "subcategories",
        fields: [["id", "string"], ["mainCategoryId", "string"], ["name", "string"]],
        create: `CREATE TABLE "app_subcategories" ("id" TEXT PRIMARY KEY, "mainCategoryId" TEXT NOT NULL, "name" TEXT NOT NULL, FOREIGN KEY ("mainCategoryId") REFERENCES "app_main_categories"("id"))`
      },
      {
        table: "app_units",
        stateKey: "units",
        fields: [["id", "string"], ["name", "string"], ["abbreviation", "string"]],
        create: `CREATE TABLE "app_units" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "abbreviation" TEXT NOT NULL)`
      },
      {
        table: "app_grocery_lists",
        stateKey: "groceryLists",
        fields: [["id", "string"], ["name", "string"], ["budget", "number"], ["color", "string"], ["icon", "string"]],
        create: `CREATE TABLE "app_grocery_lists" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "budget" REAL NOT NULL DEFAULT 0, "color" TEXT NOT NULL, "icon" TEXT NOT NULL)`
      },
      {
        table: "app_items",
        stateKey: "items",
        fields: [["id", "string"], ["name", "string"], ["locationId", "string"], ["mainCategoryId", "string"], ["subcategoryId", "string"], ["unitId", "string"], ["inStock", "number"], ["toBuy", "number"], ["lowStockThreshold", "number"], ["pricePerUnit", "number"], ["expiryDate", "string"], ["notes", "string"], ["listId", "nullable"], ["shoppingStatus", "string"], ["createdAt", "string"], ["updatedAt", "string"]],
        create: `CREATE TABLE "app_items" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "locationId" TEXT NOT NULL, "mainCategoryId" TEXT NOT NULL, "subcategoryId" TEXT NOT NULL, "unitId" TEXT NOT NULL, "inStock" REAL NOT NULL DEFAULT 0 CHECK ("inStock" >= 0), "toBuy" REAL NOT NULL DEFAULT 0 CHECK ("toBuy" >= 0), "lowStockThreshold" REAL NOT NULL DEFAULT 0 CHECK ("lowStockThreshold" >= 0), "pricePerUnit" REAL NOT NULL DEFAULT 0 CHECK ("pricePerUnit" >= 0), "expiryDate" TEXT NOT NULL DEFAULT '', "notes" TEXT NOT NULL DEFAULT '', "listId" TEXT, "shoppingStatus" TEXT NOT NULL DEFAULT 'pending' CHECK ("shoppingStatus" IN ('pending','purchased')), "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL, FOREIGN KEY ("locationId") REFERENCES "app_locations"("id"), FOREIGN KEY ("mainCategoryId") REFERENCES "app_main_categories"("id"), FOREIGN KEY ("subcategoryId") REFERENCES "app_subcategories"("id"), FOREIGN KEY ("unitId") REFERENCES "app_units"("id"), FOREIGN KEY ("listId") REFERENCES "app_grocery_lists"("id"))`
      }
    ]);

    const TABLE_BY_NAME = new Map(TABLE_DEFINITIONS.map((definition) => [definition.table, definition]));

    class DataValidationError extends Error {
      constructor(message) {
        super(message);
        this.name = "DataValidationError";
      }
    }

    const Utils = Object.freeze({
      uid(prefix = "id") {
        if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      },
      clone(value) {
        return JSON.parse(JSON.stringify(value));
      },
      number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      },
      cleanNumber(value, fallback = 0) {
        return Math.max(0, Math.round(Utils.number(value, fallback) * 100) / 100);
      },
      escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      },
      safeColor(value, fallback = "#0f766e") {
        return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback;
      },
      safeIcon(value) {
        return ICONS.has(value) ? value : "box";
      },
      icon(name) {
        return `<svg aria-hidden="true"><use href="#icon-${Utils.safeIcon(name)}"></use></svg>`;
      },
      today(offsetDays = 0) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() + offsetDays);
        return date.toISOString().slice(0, 10);
      },
      daysUntil(dateString) {
        if (!dateString) return null;
        const target = new Date(`${dateString}T12:00:00`);
        if (Number.isNaN(target.getTime())) return null;
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        return Math.ceil((target - today) / 86400000);
      },
      formatDate(dateString) {
        if (!dateString) return "No expiry";
        const date = new Date(`${dateString}T12:00:00`);
        if (Number.isNaN(date.getTime())) return "Invalid date";
        return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }).format(date);
      },
      formatQuantity(value) {
        const number = Utils.number(value);
        return Number.isInteger(number) ? String(number) : number.toLocaleString(undefined, { maximumFractionDigits: 2 });
      },
      currencySymbol(currency) {
        try {
          return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 })
            .formatToParts(0)
            .find((part) => part.type === "currency")?.value || currency;
        } catch {
          return currency;
        }
      },
      formatCurrency(value, currency = "USD", compact = false) {
        try {
          return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            notation: compact ? "compact" : "standard",
            maximumFractionDigits: compact ? 1 : 2
          }).format(Utils.number(value));
        } catch {
          return `${currency} ${Utils.number(value).toFixed(2)}`;
        }
      },
      status(item) {
        const days = Utils.daysUntil(item.expiryDate);
        return {
          depleted: item.inStock <= 0,
          low: item.inStock <= item.lowStockThreshold,
          expired: days !== null && days < 0,
          expiring: days !== null && days >= 0 && days <= 7,
          days
        };
      },
      plural(count, singular, plural = `${singular}s`) {
        return `${count} ${count === 1 ? singular : plural}`;
      },
      relativeUpdated(iso) {
        if (!iso) return "Recently updated";
        const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        if (minutes < 2) return "Updated just now";
        if (minutes < 60) return `Updated ${minutes}m ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `Updated ${hours}h ago`;
        return `Updated ${Math.round(hours / 24)}d ago`;
      }
    });

    function buildSampleData() {
      const now = new Date().toISOString();
      return {
        locations: [
          { id: "loc_fridge", name: "Fridge", color: "#168c83", icon: "fridge" },
          { id: "loc_pantry", name: "Pantry", color: "#b36b32", icon: "pantry" },
          { id: "loc_freezer", name: "Freezer", color: "#3986ad", icon: "snowflake" },
          { id: "loc_spice", name: "Spice rack", color: "#a34c65", icon: "spice" }
        ],
        mainCategories: [
          { id: "cat_produce", name: "Produce", color: "#4d9a55", icon: "produce" },
          { id: "cat_dairy", name: "Dairy & eggs", color: "#3a91b5", icon: "dairy" },
          { id: "cat_grains", name: "Grains & staples", color: "#ba762e", icon: "grain" },
          { id: "cat_household", name: "Household", color: "#7b62ad", icon: "household" },
          { id: "cat_frozen", name: "Frozen food", color: "#4b82bb", icon: "snowflake" },
          { id: "cat_spices", name: "Spices", color: "#b85165", icon: "spice" }
        ],
        subcategories: [
          { id: "sub_fruit", mainCategoryId: "cat_produce", name: "Fruit" },
          { id: "sub_vegetables", mainCategoryId: "cat_produce", name: "Vegetables" },
          { id: "sub_milk", mainCategoryId: "cat_dairy", name: "Milk & cream" },
          { id: "sub_yogurt", mainCategoryId: "cat_dairy", name: "Yogurt" },
          { id: "sub_eggs", mainCategoryId: "cat_dairy", name: "Eggs" },
          { id: "sub_rice", mainCategoryId: "cat_grains", name: "Rice" },
          { id: "sub_flour", mainCategoryId: "cat_grains", name: "Flour" },
          { id: "sub_cleaning", mainCategoryId: "cat_household", name: "Cleaning" },
          { id: "sub_frozenveg", mainCategoryId: "cat_frozen", name: "Frozen vegetables" },
          { id: "sub_wholespice", mainCategoryId: "cat_spices", name: "Whole spices" }
        ],
        units: [
          { id: "unit_piece", name: "Piece", abbreviation: "pc" },
          { id: "unit_kg", name: "Kilogram", abbreviation: "kg" },
          { id: "unit_g", name: "Gram", abbreviation: "g" },
          { id: "unit_l", name: "Litre", abbreviation: "L" },
          { id: "unit_ml", name: "Millilitre", abbreviation: "ml" },
          { id: "unit_pack", name: "Pack", abbreviation: "pack" }
        ],
        groceryLists: [
          { id: "list_weekly", name: "Weekly groceries", budget: 120, color: "#0f766e", icon: "cart" },
          { id: "list_bulk", name: "Bulk restock", budget: 180, color: "#9a6735", icon: "box" }
        ],
        items: [
          { id: "item_milk", name: "Whole milk", locationId: "loc_fridge", mainCategoryId: "cat_dairy", subcategoryId: "sub_milk", unitId: "unit_l", inStock: 1, toBuy: 2, lowStockThreshold: 1, pricePerUnit: 3.49, expiryDate: Utils.today(3), notes: "2% is fine if whole milk is unavailable.", listId: "list_weekly", shoppingStatus: "pending", createdAt: now, updatedAt: now },
          { id: "item_banana", name: "Bananas", locationId: "loc_pantry", mainCategoryId: "cat_produce", subcategoryId: "sub_fruit", unitId: "unit_piece", inStock: 5, toBuy: 0, lowStockThreshold: 3, pricePerUnit: 0.55, expiryDate: Utils.today(5), notes: "Slightly green.", listId: null, shoppingStatus: "pending", createdAt: now, updatedAt: now },
          { id: "item_yogurt", name: "Greek yogurt", locationId: "loc_fridge", mainCategoryId: "cat_dairy", subcategoryId: "sub_yogurt", unitId: "unit_pack", inStock: 2, toBuy: 0, lowStockThreshold: 1, pricePerUnit: 1.89, expiryDate: Utils.today(-1), notes: "Check before consuming.", listId: null, shoppingStatus: "pending", createdAt: now, updatedAt: now },
          { id: "item_rice", name: "Basmati rice", locationId: "loc_pantry", mainCategoryId: "cat_grains", subcategoryId: "sub_rice", unitId: "unit_kg", inStock: 0.8, toBuy: 5, lowStockThreshold: 1, pricePerUnit: 4.2, expiryDate: Utils.today(120), notes: "Large bag for bulk restock.", listId: "list_bulk", shoppingStatus: "pending", createdAt: now, updatedAt: now },
          { id: "item_eggs", name: "Free-range eggs", locationId: "loc_fridge", mainCategoryId: "cat_dairy", subcategoryId: "sub_eggs", unitId: "unit_piece", inStock: 4, toBuy: 12, lowStockThreshold: 6, pricePerUnit: 0.42, expiryDate: Utils.today(9), notes: "Large eggs.", listId: "list_weekly", shoppingStatus: "purchased", createdAt: now, updatedAt: now },
          { id: "item_peas", name: "Frozen peas", locationId: "loc_freezer", mainCategoryId: "cat_frozen", subcategoryId: "sub_frozenveg", unitId: "unit_pack", inStock: 3, toBuy: 0, lowStockThreshold: 1, pricePerUnit: 2.3, expiryDate: Utils.today(90), notes: "", listId: null, shoppingStatus: "pending", createdAt: now, updatedAt: now },
          { id: "item_soap", name: "Dish soap", locationId: "loc_pantry", mainCategoryId: "cat_household", subcategoryId: "sub_cleaning", unitId: "unit_piece", inStock: 0, toBuy: 2, lowStockThreshold: 1, pricePerUnit: 3.8, expiryDate: "", notes: "Unscented preferred.", listId: "list_weekly", shoppingStatus: "pending", createdAt: now, updatedAt: now },
          { id: "item_cumin", name: "Cumin seeds", locationId: "loc_spice", mainCategoryId: "cat_spices", subcategoryId: "sub_wholespice", unitId: "unit_g", inStock: 180, toBuy: 0, lowStockThreshold: 50, pricePerUnit: 0.03, expiryDate: Utils.today(210), notes: "", listId: null, shoppingStatus: "pending", createdAt: now, updatedAt: now }
        ],
        preferences: { schemaVersion: 1, theme: "system", currency: "USD", inventoryLayout: "grid" }
      };
    }

    class DataStore {
      constructor(storage = window.localStorage) {
        this.storage = storage;
        this.listeners = new Set();
        this.initialize();
      }

      initialize() {
        const hasSchema = ARRAY_KEYS.every((key) => this.storage.getItem(STORAGE[key]) !== null);
        if (!hasSchema) this.writeState(buildSampleData(), false);
        else if (!this.storage.getItem(STORAGE.preferences)) {
          this.storage.setItem(STORAGE.preferences, JSON.stringify(buildSampleData().preferences));
        }
        this.validate(this.getState());
      }

      getState() {
        const state = {};
        for (const key of ARRAY_KEYS) {
          const raw = this.storage.getItem(STORAGE[key]);
          try {
            state[key] = raw ? JSON.parse(raw) : [];
          } catch {
            throw new DataValidationError(`Stored ${STORAGE[key]} data is not valid JSON.`);
          }
        }
        try {
          state.preferences = JSON.parse(this.storage.getItem(STORAGE.preferences) || "{}") || {};
        } catch {
          state.preferences = {};
        }
        state.preferences = { schemaVersion: 1, theme: "system", currency: "USD", inventoryLayout: "grid", ...state.preferences };
        return state;
      }

      transaction(mutator) {
        const draft = Utils.clone(this.getState());
        const result = mutator(draft);
        this.validate(draft);
        this.writeState(draft);
        return result;
      }

      replaceState(nextState) {
        const candidate = Utils.clone(nextState);
        this.validate(candidate);
        this.writeState(candidate);
      }

      writeState(state, notify = true) {
        for (const key of ARRAY_KEYS) this.storage.setItem(STORAGE[key], JSON.stringify(state[key] || []));
        this.storage.setItem(STORAGE.preferences, JSON.stringify(state.preferences || { schemaVersion: 1, theme: "system", currency: "USD", inventoryLayout: "grid" }));
        if (notify) this.listeners.forEach((listener) => listener(this.getState()));
      }

      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }

      validate(state) {
        for (const key of ARRAY_KEYS) {
          if (!Array.isArray(state[key])) throw new DataValidationError(`${STORAGE[key]} must be an array.`);
          const ids = new Set();
          for (const record of state[key]) {
            if (!record || typeof record !== "object" || Array.isArray(record)) throw new DataValidationError(`${STORAGE[key]} contains a non-object record.`);
            if (!record.id || typeof record.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(record.id)) throw new DataValidationError(`${STORAGE[key]} contains a record without a safe, valid ID.`);
            if (ids.has(record.id)) throw new DataValidationError(`Duplicate ID “${record.id}” found in ${STORAGE[key]}.`);
            ids.add(record.id);
          }
        }

        const locationIds = new Set(state.locations.map((row) => row.id));
        const categoryIds = new Set(state.mainCategories.map((row) => row.id));
        const subcategoryMap = new Map(state.subcategories.map((row) => [row.id, row]));
        const unitIds = new Set(state.units.map((row) => row.id));
        const listIds = new Set(state.groceryLists.map((row) => row.id));

        for (const [collectionName, records] of [["location", state.locations], ["main category", state.mainCategories], ["subcategory", state.subcategories], ["unit", state.units], ["shopping list", state.groceryLists]]) {
          for (const record of records) {
            if (!String(record.name || "").trim()) throw new DataValidationError(`A ${collectionName} record has no name.`);
          }
        }
        for (const record of [...state.locations, ...state.mainCategories, ...state.groceryLists]) {
          if (!/^#[0-9a-f]{6}$/i.test(String(record.color || ""))) throw new DataValidationError(`“${record.name}” has an invalid color.`);
          if (!ICONS.has(record.icon)) throw new DataValidationError(`“${record.name}” has an unsupported icon.`);
        }
        for (const unit of state.units) {
          if (!String(unit.abbreviation || "").trim()) throw new DataValidationError(`Unit “${unit.name}” has no abbreviation.`);
        }

        for (const subcategory of state.subcategories) {
          if (!categoryIds.has(subcategory.mainCategoryId)) throw new DataValidationError(`Subcategory “${subcategory.name || subcategory.id}” references a missing main category.`);
        }

        for (const item of state.items) {
          if (!String(item.name || "").trim()) throw new DataValidationError(`Item ${item.id} has no name.`);
          if (!locationIds.has(item.locationId)) throw new DataValidationError(`Item “${item.name}” references a missing location.`);
          if (!categoryIds.has(item.mainCategoryId)) throw new DataValidationError(`Item “${item.name}” references a missing main category.`);
          const subcategory = subcategoryMap.get(item.subcategoryId);
          if (!subcategory) throw new DataValidationError(`Item “${item.name}” references a missing subcategory.`);
          if (subcategory.mainCategoryId !== item.mainCategoryId) throw new DataValidationError(`Item “${item.name}” has a subcategory outside its main category.`);
          if (!unitIds.has(item.unitId)) throw new DataValidationError(`Item “${item.name}” references a missing unit.`);
          if (item.listId && !listIds.has(item.listId)) throw new DataValidationError(`Item “${item.name}” references a missing shopping list.`);
          for (const field of ["inStock", "toBuy", "lowStockThreshold", "pricePerUnit"]) {
            if (!Number.isFinite(Number(item[field])) || Number(item[field]) < 0) throw new DataValidationError(`Item “${item.name}” has an invalid ${field} value.`);
          }
          if (!["pending", "purchased"].includes(item.shoppingStatus)) throw new DataValidationError(`Item “${item.name}” has an invalid shopping status.`);
          if (item.expiryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate) || Utils.daysUntil(item.expiryDate) === null)) throw new DataValidationError(`Item “${item.name}” has an invalid expiration date.`);
        }

        for (const list of state.groceryLists) {
          if (!Number.isFinite(Number(list.budget)) || Number(list.budget) < 0) throw new DataValidationError(`Shopping list “${list.name || list.id}” has an invalid budget.`);
        }
        return true;
      }
    }

    class PantryService {
      constructor(store) {
        this.store = store;
      }

      getState() { return this.store.getState(); }

      saveItem(input) {
        const now = new Date().toISOString();
        let saved;
        this.store.transaction((draft) => {
          const existingIndex = draft.items.findIndex((item) => item.id === input.id);
          const record = {
            id: input.id || Utils.uid("item"),
            name: String(input.name || "").trim(),
            locationId: input.locationId,
            mainCategoryId: input.mainCategoryId,
            subcategoryId: input.subcategoryId,
            unitId: input.unitId,
            inStock: Utils.cleanNumber(input.inStock),
            toBuy: Utils.cleanNumber(input.toBuy),
            lowStockThreshold: Utils.cleanNumber(input.lowStockThreshold),
            pricePerUnit: Utils.cleanNumber(input.pricePerUnit),
            expiryDate: input.expiryDate || "",
            notes: String(input.notes || "").trim(),
            listId: input.toBuy > 0 ? (input.listId || draft.groceryLists[0]?.id || null) : null,
            shoppingStatus: input.toBuy > 0 && input.shoppingStatus === "purchased" ? "purchased" : "pending",
            createdAt: existingIndex >= 0 ? draft.items[existingIndex].createdAt : now,
            updatedAt: now
          };
          if (!record.name) throw new DataValidationError("Item name is required.");
          if (record.toBuy > 0 && !record.listId) throw new DataValidationError("Create a shopping list before adding a quantity to buy.");
          if (existingIndex >= 0) draft.items.splice(existingIndex, 1, record);
          else draft.items.unshift(record);
          saved = record;
        });
        return saved;
      }

      deleteItem(id) {
        this.store.transaction((draft) => {
          const item = draft.items.find((row) => row.id === id);
          if (!item) throw new DataValidationError("That item no longer exists.");
          draft.items = draft.items.filter((row) => row.id !== id);
        });
      }

      adjustStock(id, amount) {
        this.store.transaction((draft) => {
          const item = draft.items.find((row) => row.id === id);
          if (!item) throw new DataValidationError("That item no longer exists.");
          item.inStock = Utils.cleanNumber(item.inStock + amount);
          item.updatedAt = new Date().toISOString();
        });
      }

      markEmpty(id, addToList = false, listId = null) {
        this.store.transaction((draft) => {
          const item = draft.items.find((row) => row.id === id);
          if (!item) throw new DataValidationError("That item no longer exists.");
          item.inStock = 0;
          if (addToList) {
            const targetList = draft.groceryLists.find((list) => list.id === listId) || draft.groceryLists[0];
            if (!targetList) throw new DataValidationError("Create a shopping list before adding this item.");
            item.toBuy = Math.max(item.toBuy, item.lowStockThreshold || 1);
            item.listId = targetList.id;
            item.shoppingStatus = "pending";
          }
          item.updatedAt = new Date().toISOString();
        });
      }

      togglePurchased(id) {
        this.store.transaction((draft) => {
          const item = draft.items.find((row) => row.id === id && row.toBuy > 0);
          if (!item) throw new DataValidationError("That shopping item no longer exists.");
          item.shoppingStatus = item.shoppingStatus === "purchased" ? "pending" : "purchased";
          item.updatedAt = new Date().toISOString();
        });
      }

      clearPurchased(listId) {
        let count = 0;
        this.store.transaction((draft) => {
          for (const item of draft.items) {
            if (item.listId === listId && item.toBuy > 0 && item.shoppingStatus === "purchased") {
              item.inStock = Utils.cleanNumber(item.inStock + item.toBuy);
              item.toBuy = 0;
              item.listId = null;
              item.shoppingStatus = "pending";
              item.updatedAt = new Date().toISOString();
              count += 1;
            }
          }
        });
        return count;
      }

      saveEntity(type, input) {
        const config = ENTITY_CONFIG[type];
        if (!config) throw new DataValidationError("Unknown record type.");
        let saved;
        this.store.transaction((draft) => {
          const collection = draft[config.collection];
          const name = String(input.name || "").trim();
          if (!name) throw new DataValidationError("A name is required.");
          const duplicate = collection.find((row) => row.id !== input.id && String(row.name).toLowerCase() === name.toLowerCase());
          if (duplicate) throw new DataValidationError(`${name} already exists.`);
          const existingIndex = collection.findIndex((row) => row.id === input.id);
          const base = existingIndex >= 0 ? collection[existingIndex] : { id: input.id || Utils.uid(type) };
          if (type === "location" || type === "category") saved = { ...base, name, color: Utils.safeColor(input.color), icon: Utils.safeIcon(input.icon) };
          if (type === "subcategory") saved = { ...base, name, mainCategoryId: input.mainCategoryId };
          if (type === "unit") {
            const abbreviation = String(input.abbreviation || "").trim();
            if (!abbreviation) throw new DataValidationError("An abbreviation is required.");
            saved = { ...base, name, abbreviation };
          }
          if (type === "list") saved = { ...base, name, budget: Utils.cleanNumber(input.budget), color: Utils.safeColor(input.color), icon: Utils.safeIcon(input.icon || "cart") };
          if (existingIndex >= 0) collection.splice(existingIndex, 1, saved);
          else collection.push(saved);
        });
        return saved;
      }

      getEntityUsage(type, id) {
        const state = this.getState();
        const config = ENTITY_CONFIG[type];
        if (!config) return 0;
        let count = state.items.filter((item) => item[config.itemField] === id).length;
        if (type === "category") count += state.subcategories.filter((row) => row.mainCategoryId === id).length;
        return count;
      }

      getReassignTargets(type, sourceId) {
        const state = this.getState();
        const config = ENTITY_CONFIG[type];
        if (!config) return [];
        const source = state[config.collection].find((row) => row.id === sourceId);
        let targets = state[config.collection].filter((row) => row.id !== sourceId);
        if (type === "subcategory" && source) targets = targets.filter((row) => row.mainCategoryId === source.mainCategoryId);
        return targets;
      }

      deleteEntity(type, id, targetId = null) {
        const config = ENTITY_CONFIG[type];
        if (!config) throw new DataValidationError("Unknown record type.");
        this.store.transaction((draft) => {
          const collection = draft[config.collection];
          const record = collection.find((row) => row.id === id);
          if (!record) throw new DataValidationError("That record no longer exists.");
          const itemUsage = draft.items.filter((item) => item[config.itemField] === id);
          const dependentSubcategories = type === "category" ? draft.subcategories.filter((row) => row.mainCategoryId === id) : [];
          if ((itemUsage.length || dependentSubcategories.length) && !targetId) throw new DataValidationError(`Reassign records before deleting this ${config.label}.`);
          if (targetId && !collection.some((row) => row.id === targetId && row.id !== id)) throw new DataValidationError("Choose a valid reassignment target.");

          if (targetId) {
            for (const item of itemUsage) item[config.itemField] = targetId;
            if (type === "category") {
              for (const subcategory of dependentSubcategories) subcategory.mainCategoryId = targetId;
            }
            if (type === "subcategory") {
              const target = draft.subcategories.find((row) => row.id === targetId);
              for (const item of itemUsage) item.mainCategoryId = target.mainCategoryId;
            }
            if (type === "list") {
              for (const item of itemUsage) item.listId = targetId;
            }
          }
          draft[config.collection] = collection.filter((row) => row.id !== id);
        });
      }

      savePreferences(patch) {
        this.store.transaction((draft) => {
          draft.preferences = { ...draft.preferences, ...patch };
        });
      }

      restoreSample() { this.store.replaceState(buildSampleData()); }

      eraseAll() {
        const sample = buildSampleData();
        this.store.replaceState({
          locations: sample.locations,
          mainCategories: sample.mainCategories,
          subcategories: sample.subcategories,
          units: sample.units,
          groceryLists: sample.groceryLists,
          items: [],
          preferences: sample.preferences
        });
      }
    }

    class BackupService {
      constructor(store) {
        this.store = store;
      }

      exportSql() {
        const state = this.store.getState();
        const lines = [
          "-- PantryFlow relational backup",
          `-- Exported ${new Date().toISOString()}`,
          "PRAGMA foreign_keys = OFF;",
          "BEGIN TRANSACTION;",
          ""
        ];
        for (const definition of [...TABLE_DEFINITIONS].reverse()) lines.push(`DROP TABLE IF EXISTS "${definition.table}";`);
        lines.push("");
        for (const definition of TABLE_DEFINITIONS) lines.push(`${definition.create};`);
        lines.push("");
        for (const definition of TABLE_DEFINITIONS) {
          const columns = definition.fields.map(([field]) => `"${field}"`).join(", ");
          for (const record of state[definition.stateKey]) {
            const values = definition.fields.map(([field, type]) => this.toSqlLiteral(record[field], type)).join(", ");
            lines.push(`INSERT INTO "${definition.table}" (${columns}) VALUES (${values});`);
          }
          lines.push("");
        }
        lines.push("COMMIT;", "PRAGMA foreign_keys = ON;", "");
        this.download(`pantryflow-backup-${Utils.today()}.sql`, lines.join("\n"), "application/sql;charset=utf-8");
      }

      exportCsvFiles() {
        const state = this.store.getState();
        const date = Utils.today();
        const exports = [
          {
            filename: `pantryflow-items-${date}.csv`,
            headers: TABLE_BY_NAME.get("app_items").fields.map(([field]) => field),
            rows: state.items
          },
          {
            filename: `pantryflow-locations-${date}.csv`,
            headers: ["id", "name", "color", "icon"],
            rows: state.locations
          },
          {
            filename: `pantryflow-categories-${date}.csv`,
            headers: ["recordType", "id", "name", "color", "icon", "mainCategoryId"],
            rows: [
              ...state.mainCategories.map((row) => ({ recordType: "main", id: row.id, name: row.name, color: row.color, icon: row.icon, mainCategoryId: "" })),
              ...state.subcategories.map((row) => ({ recordType: "sub", id: row.id, name: row.name, color: "", icon: "", mainCategoryId: row.mainCategoryId }))
            ]
          },
          {
            filename: `pantryflow-lists-${date}.csv`,
            headers: ["id", "name", "budget", "color", "icon"],
            rows: state.groceryLists
          },
          {
            filename: `pantryflow-units-${date}.csv`,
            headers: ["id", "name", "abbreviation"],
            rows: state.units
          }
        ];
        exports.forEach((entry, index) => {
          setTimeout(() => this.download(entry.filename, this.toCsv(entry.headers, entry.rows), "text/csv;charset=utf-8"), index * 160);
        });
        return exports.length;
      }

      async importSql(file, mode = "replace") {
        if (!file || !String(file.name).toLowerCase().endsWith(".sql")) throw new DataValidationError("Choose a .sql backup file.");
        const text = await this.readFile(file);
        const parsed = this.parseSql(text);
        const missing = TABLE_DEFINITIONS.filter((definition) => !Object.hasOwn(parsed, definition.stateKey));
        if (missing.length) throw new DataValidationError(`SQL backup is incomplete. Missing ${missing.map((row) => row.table).join(", ")}.`);
        const candidate = this.composeCandidate(parsed, mode, TABLE_DEFINITIONS.map((row) => row.stateKey));
        this.store.replaceState(candidate);
        return parsed.items.length;
      }

      async importCsv(files, mode = "replace") {
        const fileList = [...(files || [])];
        if (!fileList.length) throw new DataValidationError("Choose at least one CSV file.");
        const incoming = {};
        const providedKeys = new Set();
        for (const file of fileList) {
          if (!String(file.name).toLowerCase().endsWith(".csv")) throw new DataValidationError(`${file.name} is not a CSV file.`);
          const text = await this.readFile(file);
          const { headers, rows } = this.parseCsv(text);
          const type = this.detectCsvType(file.name, headers);
          if (!type) throw new DataValidationError(`Could not identify the dataset in ${file.name}.`);
          if (type === "categories") {
            if (providedKeys.has("mainCategories") || providedKeys.has("subcategories")) throw new DataValidationError("Select only one categories CSV file.");
            incoming.mainCategories = [];
            incoming.subcategories = [];
            for (const row of rows) {
              if (row.recordType === "main") incoming.mainCategories.push(this.normalizeRecord(TABLE_BY_NAME.get("app_main_categories"), row));
              else if (row.recordType === "sub") incoming.subcategories.push(this.normalizeRecord(TABLE_BY_NAME.get("app_subcategories"), row));
              else throw new DataValidationError(`Categories CSV contains an invalid recordType “${row.recordType || "blank"}”.`);
            }
            providedKeys.add("mainCategories");
            providedKeys.add("subcategories");
          } else {
            const definition = TABLE_DEFINITIONS.find((entry) => entry.stateKey === type);
            if (providedKeys.has(type)) throw new DataValidationError(`Select only one ${type} CSV file.`);
            incoming[type] = rows.map((row) => this.normalizeRecord(definition, row));
            providedKeys.add(type);
          }
        }
        const candidate = this.composeCandidate(incoming, mode, [...providedKeys]);
        this.store.replaceState(candidate);
        return { files: fileList.length, records: [...providedKeys].reduce((sum, key) => sum + incoming[key].length, 0) };
      }

      composeCandidate(incoming, mode, providedKeys) {
        const current = this.store.getState();
        const candidate = Utils.clone(current);
        for (const key of providedKeys) {
          if (!ARRAY_KEYS.includes(key)) continue;
          candidate[key] = mode === "merge" ? [...candidate[key], ...incoming[key]] : incoming[key];
        }
        return candidate;
      }

      normalizeRecord(definition, source) {
        if (!definition) throw new DataValidationError("Unknown imported dataset.");
        const normalized = {};
        for (const [field, type] of definition.fields) {
          if (!Object.hasOwn(source, field)) throw new DataValidationError(`${definition.table} is missing the “${field}” column.`);
          const value = source[field];
          if (type === "number") {
            if (value === "" || value === null || !Number.isFinite(Number(value))) throw new DataValidationError(`${definition.table}.${field} must be a number.`);
            normalized[field] = Number(value);
          } else if (type === "nullable") normalized[field] = value === "" || value === null || String(value).toUpperCase() === "NULL" ? null : String(value);
          else normalized[field] = String(value ?? "");
        }
        return normalized;
      }

      toSqlLiteral(value, type) {
        if (type === "nullable" && (value === null || value === "" || value === undefined)) return "NULL";
        if (type === "number") return String(Utils.number(value));
        return `'${String(value ?? "").replaceAll("'", "''")}'`;
      }

      parseSql(text) {
        const parsed = {};
        for (const statement of this.splitSqlStatements(text)) {
          const match = statement.match(/INSERT\s+INTO\s+["`\[]?([a-zA-Z_][\w]*)["`\]]?\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)\s*$/i);
          if (!match) continue;
          const [, tableName, rawColumns, rawValues] = match;
          const definition = TABLE_BY_NAME.get(tableName);
          if (!definition) continue;
          const columns = rawColumns.split(",").map((column) => column.trim().replace(/^["`\[]|["`\]]$/g, ""));
          const tokens = this.splitSqlValues(rawValues);
          if (columns.length !== tokens.length) throw new DataValidationError(`SQL INSERT for ${tableName} has mismatched columns and values.`);
          const source = {};
          columns.forEach((column, index) => { source[column] = this.parseSqlValue(tokens[index]); });
          parsed[definition.stateKey] ||= [];
          parsed[definition.stateKey].push(this.normalizeRecord(definition, source));
        }
        if (!Object.keys(parsed).length) throw new DataValidationError("No supported INSERT statements were found in the SQL file.");
        return parsed;
      }

      splitSqlStatements(text) {
        const statements = [];
        let current = "";
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
          const character = text[index];
          current += character;
          if (character === "'") {
            if (quoted && text[index + 1] === "'") {
              current += text[index + 1];
              index += 1;
            } else quoted = !quoted;
          }
          if (character === ";" && !quoted) {
            const statement = current.slice(0, -1).trim();
            if (statement) statements.push(statement);
            current = "";
          }
        }
        if (current.trim()) statements.push(current.trim());
        return statements;
      }

      splitSqlValues(text) {
        const values = [];
        let current = "";
        let quoted = false;
        for (let index = 0; index < text.length; index += 1) {
          const character = text[index];
          if (character === "'") {
            current += character;
            if (quoted && text[index + 1] === "'") {
              current += text[index + 1];
              index += 1;
            } else quoted = !quoted;
          } else if (character === "," && !quoted) {
            values.push(current.trim());
            current = "";
          } else current += character;
        }
        values.push(current.trim());
        return values;
      }

      parseSqlValue(token) {
        const trimmed = token.trim();
        if (/^NULL$/i.test(trimmed)) return null;
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
        const number = Number(trimmed);
        return Number.isFinite(number) ? number : trimmed;
      }

      toCsv(headers, rows) {
        const escape = (value) => {
          const text = String(value ?? "");
          return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        };
        return `\uFEFF${[headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\r\n")}\r\n`;
      }

      parseCsv(text) {
        const input = String(text).replace(/^\uFEFF/, "");
        const matrix = [];
        let row = [];
        let cell = "";
        let quoted = false;
        for (let index = 0; index < input.length; index += 1) {
          const character = input[index];
          if (quoted) {
            if (character === '"' && input[index + 1] === '"') {
              cell += '"';
              index += 1;
            } else if (character === '"') quoted = false;
            else cell += character;
          } else if (character === '"') quoted = true;
          else if (character === ",") { row.push(cell); cell = ""; }
          else if (character === "\n") {
            row.push(cell.replace(/\r$/, ""));
            if (row.some((value) => value !== "")) matrix.push(row);
            row = [];
            cell = "";
          } else cell += character;
        }
        row.push(cell.replace(/\r$/, ""));
        if (row.some((value) => value !== "")) matrix.push(row);
        if (quoted) throw new DataValidationError("CSV contains an unclosed quoted value.");
        if (matrix.length < 1) throw new DataValidationError("CSV file is empty.");
        const headers = matrix.shift().map((header) => header.trim());
        if (headers.some((header) => !header)) throw new DataValidationError("CSV contains a blank column name.");
        if (new Set(headers).size !== headers.length) throw new DataValidationError("CSV contains duplicate column names.");
        const rows = matrix.map((values, rowIndex) => {
          if (values.length !== headers.length) throw new DataValidationError(`CSV row ${rowIndex + 2} has ${values.length} values; expected ${headers.length}.`);
          return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
        });
        return { headers, rows };
      }

      detectCsvType(filename, headers) {
        const lower = filename.toLowerCase();
        if (lower.includes("categor") || headers.includes("recordType")) return "categories";
        if (lower.includes("item") || headers.includes("locationId")) return "items";
        if (lower.includes("unit") || headers.includes("abbreviation")) return "units";
        if (lower.includes("list") || headers.includes("budget")) return "groceryLists";
        if (lower.includes("location") || (headers.includes("color") && headers.includes("icon"))) return "locations";
        return null;
      }

      readFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new DataValidationError(`Could not read ${file.name}.`));
          reader.readAsText(file, "utf-8");
        });
      }

      download(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
    }

    class AppView {
      constructor() {
        this.refs = {
          panels: [...document.querySelectorAll("[data-view-panel]")],
          navButtons: [...document.querySelectorAll("[data-view]")],
          search: document.querySelector("#globalSearch"),
          inventoryGrid: document.querySelector("#inventoryGrid"),
          filterLocation: document.querySelector("#filterLocation"),
          filterCategory: document.querySelector("#filterCategory"),
          filterStatus: document.querySelector("#filterStatus"),
          inventorySort: document.querySelector("#inventorySort"),
          itemDialog: document.querySelector("#itemDialog"),
          entityDialog: document.querySelector("#entityDialog"),
          reassignDialog: document.querySelector("#reassignDialog"),
          importDialog: document.querySelector("#importDialog"),
          confirmDialog: document.querySelector("#confirmDialog"),
          toastRegion: document.querySelector("#toastRegion")
        };
      }

      setTheme(theme) {
        if (theme === "system") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.dataset.theme = theme;
        document.querySelectorAll("[data-theme-choice]").forEach((button) => button.classList.toggle("is-active", button.dataset.themeChoice === theme));
      }

      setView(viewName) {
        this.refs.panels.forEach((panel) => {
          const active = panel.dataset.viewPanel === viewName;
          panel.hidden = !active;
          panel.classList.toggle("is-active", active);
        });
        this.refs.navButtons.forEach((button) => {
          const active = button.dataset.view === viewName;
          button.classList.toggle("is-active", active);
          if (button.classList.contains("nav-link")) {
            if (active) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
          }
        });
        const titleMap = { pantry: "Pantry", shopping: "Shopping lists", settings: "Settings" };
        document.title = `${titleMap[viewName] || "PantryFlow"} — PantryFlow`;
        document.querySelector("#mainContent")?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      render(state, ui) {
        this.setTheme(state.preferences.theme || "system");
        this.populateSharedOptions(state, ui);
        this.renderNavAndHealth(state);
        this.renderStats(state);
        this.renderPantry(state, ui);
        this.renderShopping(state, ui);
        this.renderSettings(state);
        this.syncPreferences(state, ui);
      }

      populateSelect(select, records, current, allLabel = null, label = (row) => row.name) {
        if (!select) return;
        const fragment = document.createDocumentFragment();
        if (allLabel !== null) {
          const option = document.createElement("option");
          option.value = allLabel.value;
          option.textContent = allLabel.label;
          fragment.append(option);
        }
        for (const row of records) {
          const option = document.createElement("option");
          option.value = row.id;
          option.textContent = label(row);
          fragment.append(option);
        }
        select.replaceChildren(fragment);
        if ([...select.options].some((option) => option.value === current)) select.value = current;
      }

      populateSharedOptions(state, ui) {
        this.populateSelect(this.refs.filterLocation, state.locations, ui.filters.location, { value: "all", label: "All locations" });
        this.populateSelect(this.refs.filterCategory, state.mainCategories, ui.filters.category, { value: "all", label: "All categories" });
        this.refs.filterStatus.value = ui.filters.status;
        this.refs.inventorySort.value = ui.sort;
      }

      renderNavAndHealth(state) {
        const shoppingItems = state.items.filter((item) => item.toBuy > 0);
        document.querySelector("#pantryNavCount").textContent = state.items.length;
        document.querySelector("#shoppingNavCount").textContent = shoppingItems.length;
        document.querySelector("#mobileShoppingCount").textContent = shoppingItems.length;
        const low = state.items.filter((item) => Utils.status(item).low).length;
        const expired = state.items.filter((item) => Utils.status(item).expired).length;
        const expiring = state.items.filter((item) => Utils.status(item).expiring).length;
        const score = state.items.length ? Math.max(0, Math.round(100 - (low / state.items.length) * 35 - (expired / state.items.length) * 35 - (expiring / state.items.length) * 15)) : 100;
        document.querySelector("#healthScore").textContent = `${score}%`;
        document.querySelector("#healthBar").style.width = `${score}%`;
        document.querySelector("#healthCopy").textContent = score >= 85 ? "Looking fresh—your pantry is in great shape." : score >= 60 ? "A few items need attention this week." : "Review low-stock and expired items soon.";
      }

      renderStats(state) {
        const active = state.items.filter((item) => item.inStock > 0);
        const totalQuantity = active.reduce((sum, item) => sum + item.inStock, 0);
        const low = state.items.filter((item) => Utils.status(item).low).length;
        const expiring = state.items.filter((item) => {
          const status = Utils.status(item);
          return status.expiring || status.expired;
        }).length;
        const value = state.items.reduce((sum, item) => sum + item.inStock * item.pricePerUnit, 0);
        document.querySelector("#statInStock").textContent = Utils.formatQuantity(totalQuantity);
        document.querySelector("#statInStockNote").textContent = Utils.plural(active.length, "item type");
        document.querySelector("#statLow").textContent = low;
        document.querySelector("#statExpiring").textContent = expiring;
        document.querySelector("#statValue").textContent = Utils.formatCurrency(value, state.preferences.currency, true);
        document.querySelector("#pantrySubtitle").textContent = state.items.length ? `Tracking ${Utils.plural(state.items.length, "item")} across ${Utils.plural(state.locations.length, "location")}.` : "Add your first item to start tracking your home inventory.";
      }

      getFilteredItems(state, ui) {
        const query = ui.search.trim().toLowerCase();
        const locationById = new Map(state.locations.map((row) => [row.id, row]));
        const categoryById = new Map(state.mainCategories.map((row) => [row.id, row]));
        let items = state.items.filter((item) => {
          if (ui.filters.location !== "all" && item.locationId !== ui.filters.location) return false;
          if (ui.filters.category !== "all" && item.mainCategoryId !== ui.filters.category) return false;
          const status = Utils.status(item);
          if (ui.filters.status === "low" && !status.low) return false;
          if (ui.filters.status === "expiring" && !status.expiring) return false;
          if (ui.filters.status === "expired" && !status.expired) return false;
          if (ui.filters.status === "depleted" && !status.depleted) return false;
          if (ui.filters.status === "healthy" && (status.low || status.expiring || status.expired)) return false;
          if (query) {
            const haystack = [item.name, item.notes, locationById.get(item.locationId)?.name, categoryById.get(item.mainCategoryId)?.name].join(" ").toLowerCase();
            if (!haystack.includes(query)) return false;
          }
          return true;
        });

        const sorters = {
          name: (a, b) => a.name.localeCompare(b.name),
          expiry: (a, b) => (a.expiryDate || "9999-12-31").localeCompare(b.expiryDate || "9999-12-31"),
          "stock-asc": (a, b) => a.inStock - b.inStock || a.name.localeCompare(b.name),
          "value-desc": (a, b) => b.inStock * b.pricePerUnit - a.inStock * a.pricePerUnit,
          updated: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))
        };
        items.sort(sorters[ui.sort] || sorters.name);
        return items;
      }

      renderPantry(state, ui) {
        const items = this.getFilteredItems(state, ui);
        const locations = new Map(state.locations.map((row) => [row.id, row]));
        const categories = new Map(state.mainCategories.map((row) => [row.id, row]));
        const subcategories = new Map(state.subcategories.map((row) => [row.id, row]));
        const units = new Map(state.units.map((row) => [row.id, row]));
        document.querySelector("#inventoryResultCount").textContent = `${Utils.plural(items.length, "item")} shown`;
        this.refs.inventoryGrid.classList.toggle("is-list", ui.layout === "list");
        document.querySelectorAll("[data-layout]").forEach((button) => {
          const active = button.dataset.layout === ui.layout;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });

        const fragment = document.createDocumentFragment();
        if (!items.length) {
          const empty = document.createElement("div");
          empty.className = "empty-state";
          const hasAny = state.items.length > 0;
          empty.innerHTML = `<div><span class="empty-icon"><svg><use href="#icon-${hasAny ? "search" : "box"}"></use></svg></span><h3>${hasAny ? "No matching items" : "Your pantry is ready"}</h3><p>${hasAny ? "Try changing or clearing the active filters." : "Add your first grocery item and it will stay stored on this device."}</p><button class="button ${hasAny ? "button-secondary" : "button-primary"}" type="button" data-action="${hasAny ? "clear-filters" : "add-item"}">${hasAny ? "Clear filters" : "Add first item"}</button></div>`;
          fragment.append(empty);
        } else {
          for (const item of items) {
            const location = locations.get(item.locationId);
            const category = categories.get(item.mainCategoryId);
            const subcategory = subcategories.get(item.subcategoryId);
            const unit = units.get(item.unitId);
            const status = Utils.status(item);
            const card = document.createElement("article");
            card.className = `inventory-card${status.expired ? " is-expired" : status.expiring ? " is-expiring" : status.low ? " is-low" : ""}`;
            card.dataset.itemId = item.id;
            card.style.setProperty("--item-color", Utils.safeColor(category?.color));
            card.style.setProperty("--item-soft", `color-mix(in srgb, ${Utils.safeColor(category?.color)} 12%, var(--surface))`);

            let expiryBadge = "";
            if (status.expired) expiryBadge = `<span class="badge danger"><svg><use href="#icon-alert"></use></svg>Expired ${Math.abs(status.days)}d ago</span>`;
            else if (status.expiring) expiryBadge = `<span class="badge warning"><svg><use href="#icon-calendar"></use></svg>${status.days === 0 ? "Expires today" : `Expires in ${status.days}d`}</span>`;
            else if (item.expiryDate) expiryBadge = `<span class="badge"><svg><use href="#icon-calendar"></use></svg>${Utils.formatDate(item.expiryDate)}</span>`;

            const stockBadge = status.depleted ? `<span class="badge danger">Depleted</span>` : status.low ? `<span class="badge warning">Low stock</span>` : `<span class="badge success">In stock</span>`;
            card.innerHTML = `
              <div class="inventory-card-header">
                <span class="item-icon">${Utils.icon(category?.icon || "box")}</span>
                <div class="item-title"><h3 title="${Utils.escapeHtml(item.name)}">${Utils.escapeHtml(item.name)}</h3><p>${Utils.escapeHtml(subcategory?.name || category?.name || "Uncategorized")} · ${Utils.escapeHtml(location?.name || "Unknown")}</p></div>
                <button class="icon-button more-button" type="button" data-action="edit-item" data-id="${item.id}" aria-label="Edit ${Utils.escapeHtml(item.name)}"><svg><use href="#icon-more"></use></svg></button>
              </div>
              <div class="item-badges">${stockBadge}${expiryBadge}</div>
              <div class="stock-summary">
                <div class="stock-copy"><span>Current stock</span><strong>${Utils.formatQuantity(item.inStock)}</strong><small>${Utils.escapeHtml(unit?.abbreviation || "unit")}</small></div>
                <div class="stock-stepper" aria-label="Adjust ${Utils.escapeHtml(item.name)} stock"><button type="button" data-action="adjust-stock" data-id="${item.id}" data-amount="-1" aria-label="Decrease stock"><svg><use href="#icon-minus"></use></svg></button><button type="button" data-action="adjust-stock" data-id="${item.id}" data-amount="1" aria-label="Increase stock"><svg><use href="#icon-plus"></use></svg></button></div>
              </div>
              <div class="item-footer"><span>${Utils.relativeUpdated(item.updatedAt)}</span><div class="quick-actions"><button type="button" data-action="consume-item" data-id="${item.id}">Consume 1</button><button type="button" data-action="mark-empty" data-id="${item.id}">Mark empty</button></div></div>`;
            fragment.append(card);
          }
        }
        this.refs.inventoryGrid.replaceChildren(fragment);
      }

      renderShopping(state, ui) {
        const currency = state.preferences.currency;
        const allShoppingItems = state.items.filter((item) => item.toBuy > 0 && item.listId);
        const purchasedCount = allShoppingItems.filter((item) => item.shoppingStatus === "purchased").length;
        const progress = allShoppingItems.length ? Math.round((purchasedCount / allShoppingItems.length) * 100) : 0;
        const estimate = allShoppingItems.reduce((sum, item) => sum + item.toBuy * item.pricePerUnit, 0);
        const activeListIds = new Set(allShoppingItems.map((item) => item.listId));
        const budget = state.groceryLists.filter((list) => activeListIds.has(list.id)).reduce((sum, list) => sum + list.budget, 0);
        document.querySelector("#shoppingProgressPercent").textContent = `${progress}%`;
        document.querySelector("#shoppingProgressRing").style.setProperty("--progress", `${progress * 3.6}deg`);
        document.querySelector("#shoppingProgressCopy").textContent = allShoppingItems.length ? `${purchasedCount} of ${allShoppingItems.length} items purchased` : "Nothing planned yet";
        document.querySelector("#shoppingProgressDetail").textContent = allShoppingItems.length ? (progress === 100 ? "Everything is ready to restock." : `${allShoppingItems.length - purchasedCount} still to pick up.`) : "Add an item to get started.";
        document.querySelector("#shoppingEstimate").textContent = Utils.formatCurrency(estimate, currency);
        document.querySelector("#shoppingBudget").textContent = Utils.formatCurrency(budget, currency);
        const budgetPercent = budget > 0 ? Math.min(100, Math.round((estimate / budget) * 100)) : 0;
        const budgetBar = document.querySelector("#budgetBar");
        budgetBar.style.width = `${budgetPercent}%`;
        budgetBar.parentElement.classList.toggle("is-over", estimate > budget && budget > 0);
        document.querySelector("#budgetStatus").textContent = budget > 0 ? (estimate > budget ? `${Utils.formatCurrency(estimate - budget, currency)} over budget` : `${Utils.formatCurrency(budget - estimate, currency)} remaining`) : "No active budget";

        const tabs = document.createDocumentFragment();
        const tabData = [{ id: "all", name: "All lists", count: allShoppingItems.length }, ...state.groceryLists.map((list) => ({ ...list, count: allShoppingItems.filter((item) => item.listId === list.id).length }))];
        for (const tab of tabData) {
          const button = document.createElement("button");
          button.type = "button";
          button.role = "tab";
          button.dataset.action = "filter-shopping-list";
          button.dataset.id = tab.id;
          button.classList.toggle("is-active", ui.shoppingList === tab.id);
          button.setAttribute("aria-selected", String(ui.shoppingList === tab.id));
          button.innerHTML = `${Utils.escapeHtml(tab.name)}<i>${tab.count}</i>`;
          tabs.append(button);
        }
        document.querySelector("#shoppingListTabs").replaceChildren(tabs);

        const container = document.querySelector("#shoppingListsContainer");
        const fragment = document.createDocumentFragment();
        const locations = new Map(state.locations.map((row) => [row.id, row]));
        const units = new Map(state.units.map((row) => [row.id, row]));
        const listsToRender = state.groceryLists.filter((list) => ui.shoppingList === "all" || ui.shoppingList === list.id);
        let rendered = 0;
        for (const list of listsToRender) {
          const items = allShoppingItems.filter((item) => item.listId === list.id);
          if (!items.length && ui.shoppingList === "all") continue;
          rendered += 1;
          const purchased = items.filter((item) => item.shoppingStatus === "purchased").length;
          const listEstimate = items.reduce((sum, item) => sum + item.toBuy * item.pricePerUnit, 0);
          const percent = items.length ? Math.round((purchased / items.length) * 100) : 0;
          const card = document.createElement("section");
          card.className = "shopping-list-card";
          card.style.setProperty("--list-color", Utils.safeColor(list.color));
          card.innerHTML = `
            <header class="shopping-list-header">
              <div class="list-name-wrap"><span class="list-color"></span><div><h2>${Utils.escapeHtml(list.name)}</h2><p>${Utils.plural(items.length, "item")} · ${purchased} purchased</p></div></div>
              <div class="list-summary"><div><span>Estimate</span><strong>${Utils.formatCurrency(listEstimate, currency)}</strong></div><div><span>Budget</span><strong>${Utils.formatCurrency(list.budget, currency)}</strong></div><button class="icon-button" type="button" data-action="edit-entity" data-entity="list" data-id="${list.id}" aria-label="Edit ${Utils.escapeHtml(list.name)}"><svg><use href="#icon-more"></use></svg></button></div>
            </header>`;
          const rows = document.createElement("div");
          rows.className = "shopping-items";
          if (!items.length) {
            rows.innerHTML = `<div class="empty-state"><div><span class="empty-icon"><svg><use href="#icon-cart"></use></svg></span><h3>This list is empty</h3><p>Add an item and choose ${Utils.escapeHtml(list.name)} as its shopping list.</p><button class="button button-primary" type="button" data-action="add-shopping-item" data-list-id="${list.id}">Add item</button></div></div>`;
          } else {
            const rowsFragment = document.createDocumentFragment();
            for (const item of items.sort((a, b) => Number(a.shoppingStatus === "purchased") - Number(b.shoppingStatus === "purchased") || a.name.localeCompare(b.name))) {
              const row = document.createElement("div");
              row.className = `shopping-row${item.shoppingStatus === "purchased" ? " is-purchased" : ""}`;
              row.dataset.itemId = item.id;
              row.innerHTML = `
                <button class="purchase-check${item.shoppingStatus === "purchased" ? " is-checked" : ""}" type="button" data-action="toggle-purchased" data-id="${item.id}" aria-label="${item.shoppingStatus === "purchased" ? "Mark pending" : "Mark purchased"}" aria-pressed="${item.shoppingStatus === "purchased"}"><svg><use href="#icon-check"></use></svg></button>
                <div class="shopping-item-main"><span class="shopping-item-name">${Utils.escapeHtml(item.name)}</span><span class="shopping-item-meta">${Utils.escapeHtml(locations.get(item.locationId)?.name || "Unknown location")}${item.notes ? ` · ${Utils.escapeHtml(item.notes)}` : ""}</span></div>
                <div><span class="shopping-row-label">Quantity</span><span class="shopping-row-value">${Utils.formatQuantity(item.toBuy)} ${Utils.escapeHtml(units.get(item.unitId)?.abbreviation || "unit")}</span></div>
                <div><span class="shopping-row-label">Estimate</span><span class="shopping-row-value">${Utils.formatCurrency(item.toBuy * item.pricePerUnit, currency)}</span></div>
                <div class="shopping-row-actions"><button class="icon-button" type="button" data-action="edit-item" data-id="${item.id}" aria-label="Edit ${Utils.escapeHtml(item.name)}"><svg><use href="#icon-edit"></use></svg></button><button class="icon-button" type="button" data-action="delete-item" data-id="${item.id}" aria-label="Delete ${Utils.escapeHtml(item.name)}"><svg><use href="#icon-trash"></use></svg></button></div>`;
              rowsFragment.append(row);
            }
            rows.append(rowsFragment);
          }
          card.append(rows);
          const footer = document.createElement("footer");
          footer.className = "list-footer";
          footer.innerHTML = `<div class="list-progress"><span>${percent}% complete</span><span class="mini-track"><span style="width:${percent}%"></span></span></div><button class="button button-small button-secondary" type="button" data-action="clear-purchased" data-id="${list.id}" ${purchased ? "" : "disabled"}><svg><use href="#icon-box"></use></svg>Clear purchased &amp; restock</button>`;
          card.append(footer);
          fragment.append(card);
        }

        if (!rendered) {
          const empty = document.createElement("div");
          empty.className = "empty-state";
          empty.innerHTML = `<div><span class="empty-icon"><svg><use href="#icon-cart"></use></svg></span><h3>No shopping items yet</h3><p>Add a quantity to buy, choose a list, and it will appear here.</p><button class="button button-primary" type="button" data-action="add-shopping-item">Add shopping item</button></div>`;
          fragment.append(empty);
        }
        container.replaceChildren(fragment);
      }

      renderSettings(state) {
        this.renderEntityRows(document.querySelector("#locationsList"), state.locations, (row) => state.items.filter((item) => item.locationId === row.id).length, "location");
        this.renderEntityRows(document.querySelector("#groceryListsList"), state.groceryLists, (row) => state.items.filter((item) => item.listId === row.id && item.toBuy > 0).length, "list", state.preferences.currency);

        const categoryFragment = document.createDocumentFragment();
        for (const category of state.mainCategories) {
          const group = document.createElement("div");
          group.className = "category-group";
          const children = state.subcategories.filter((row) => row.mainCategoryId === category.id);
          group.innerHTML = `<div class="category-main"><span class="entity-icon" style="--entity-color:${Utils.safeColor(category.color)}">${Utils.icon(category.icon)}</span><div><strong>${Utils.escapeHtml(category.name)}</strong><small>${Utils.plural(children.length, "subcategory", "subcategories")}</small></div><span class="entity-meta">${Utils.plural(state.items.filter((item) => item.mainCategoryId === category.id).length, "item")}</span><div class="row-actions"><button type="button" data-action="edit-entity" data-entity="category" data-id="${category.id}" aria-label="Edit ${Utils.escapeHtml(category.name)}"><svg><use href="#icon-edit"></use></svg></button><button type="button" data-action="delete-entity" data-entity="category" data-id="${category.id}" aria-label="Delete ${Utils.escapeHtml(category.name)}"><svg><use href="#icon-trash"></use></svg></button></div></div>`;
          const childList = document.createElement("div");
          childList.className = "subcategory-list";
          for (const child of children) {
            const row = document.createElement("div");
            row.className = "subcategory-row";
            row.innerHTML = `<span>${Utils.escapeHtml(child.name)}</span><div class="row-actions"><button type="button" data-action="edit-entity" data-entity="subcategory" data-id="${child.id}" aria-label="Edit ${Utils.escapeHtml(child.name)}"><svg><use href="#icon-edit"></use></svg></button><button type="button" data-action="delete-entity" data-entity="subcategory" data-id="${child.id}" aria-label="Delete ${Utils.escapeHtml(child.name)}"><svg><use href="#icon-trash"></use></svg></button></div>`;
            childList.append(row);
          }
          group.append(childList);
          categoryFragment.append(group);
        }
        document.querySelector("#categoriesList").replaceChildren(categoryFragment);

        const unitFragment = document.createDocumentFragment();
        for (const unit of state.units) {
          const chip = document.createElement("span");
          chip.className = "unit-chip";
          chip.innerHTML = `${Utils.escapeHtml(unit.name)} (${Utils.escapeHtml(unit.abbreviation)})<button type="button" data-action="edit-entity" data-entity="unit" data-id="${unit.id}" aria-label="Edit ${Utils.escapeHtml(unit.name)}"><svg><use href="#icon-edit"></use></svg></button><button type="button" data-action="delete-entity" data-entity="unit" data-id="${unit.id}" aria-label="Delete ${Utils.escapeHtml(unit.name)}"><svg><use href="#icon-close"></use></svg></button>`;
          unitFragment.append(chip);
        }
        document.querySelector("#unitsList").replaceChildren(unitFragment);
      }

      renderEntityRows(container, records, countFn, type, currency = "USD") {
        const fragment = document.createDocumentFragment();
        for (const row of records) {
          const count = countFn(row);
          const element = document.createElement("div");
          element.className = "entity-row";
          const meta = type === "list" ? `${Utils.formatCurrency(row.budget, currency)} budget` : Utils.plural(count, "item");
          element.innerHTML = `<span class="entity-icon" style="--entity-color:${Utils.safeColor(row.color)}">${Utils.icon(row.icon || (type === "list" ? "cart" : "box"))}</span><div><strong>${Utils.escapeHtml(row.name)}</strong><small>${type === "list" ? `${count} active shopping ${count === 1 ? "item" : "items"}` : meta}</small></div><span class="entity-meta">${type === "list" ? meta : ""}</span><div class="row-actions"><button type="button" data-action="edit-entity" data-entity="${type}" data-id="${row.id}" aria-label="Edit ${Utils.escapeHtml(row.name)}"><svg><use href="#icon-edit"></use></svg></button><button type="button" data-action="delete-entity" data-entity="${type}" data-id="${row.id}" aria-label="Delete ${Utils.escapeHtml(row.name)}"><svg><use href="#icon-trash"></use></svg></button></div>`;
          fragment.append(element);
        }
        container.replaceChildren(fragment);
      }

      syncPreferences(state, ui) {
        document.querySelector("#currencySelect").value = state.preferences.currency;
        document.querySelector("#currencyPrefix").textContent = Utils.currencySymbol(state.preferences.currency);
        this.refs.search.value = ui.search;
      }

      openItemDialog(state, item = null, defaults = {}) {
        const form = document.querySelector("#itemForm");
        form.reset();
        const isEdit = Boolean(item);
        document.querySelector("#itemDialogTitle").textContent = isEdit ? `Edit ${item.name}` : defaults.shopping ? "Add a shopping item" : "Add an item";
        document.querySelector("#itemDeleteButton").hidden = !isEdit;
        const categoryId = item?.mainCategoryId || state.mainCategories[0]?.id || "";
        this.populateSelect(document.querySelector("#itemLocation"), state.locations, item?.locationId || state.locations[0]?.id || "");
        this.populateSelect(document.querySelector("#itemMainCategory"), state.mainCategories, categoryId);
        this.updateSubcategoryOptions(state, categoryId, item?.subcategoryId);
        this.populateSelect(document.querySelector("#itemUnit"), state.units, item?.unitId || state.units[0]?.id || "", null, (row) => `${row.name} (${row.abbreviation})`);
        this.populateSelect(document.querySelector("#itemList"), state.groceryLists, item?.listId || defaults.listId || state.groceryLists[0]?.id || "", { value: "", label: "Not on a list" });
        document.querySelector("#itemId").value = item?.id || "";
        document.querySelector("#itemName").value = item?.name || "";
        document.querySelector("#itemInStock").value = item?.inStock ?? 0;
        document.querySelector("#itemLowThreshold").value = item?.lowStockThreshold ?? 1;
        document.querySelector("#itemPrice").value = item?.pricePerUnit ?? 0;
        document.querySelector("#itemToBuy").value = item?.toBuy ?? (defaults.shopping ? 1 : 0);
        document.querySelector("#itemShoppingStatus").value = item?.shoppingStatus || "pending";
        document.querySelector("#itemExpiry").value = item?.expiryDate || "";
        document.querySelector("#itemNotes").value = item?.notes || "";
        document.querySelector("#currencyPrefix").textContent = Utils.currencySymbol(state.preferences.currency);
        this.refs.itemDialog.showModal();
        requestAnimationFrame(() => document.querySelector("#itemName").focus());
      }

      updateSubcategoryOptions(state, categoryId, selected = null) {
        const options = state.subcategories.filter((row) => row.mainCategoryId === categoryId);
        this.populateSelect(document.querySelector("#itemSubcategory"), options, selected || options[0]?.id || "");
      }

      openEntityDialog(state, type, record = null) {
        const labels = {
          location: ["Storage location", "location", "Create a place where inventory can live."],
          category: ["Main category", "main category", "Add a top-level grouping for inventory."],
          subcategory: ["Subcategory", "subcategory", "Nest this beneath a main category."],
          unit: ["Measurement", "unit", "Add a reusable quantity unit."],
          list: ["Shopping", "shopping list", "Create a trip with its own budget."]
        };
        const [eyebrow, label, help] = labels[type];
        document.querySelector("#entityEyebrow").textContent = eyebrow;
        document.querySelector("#entityDialogTitle").textContent = `${record ? "Edit" : "Add"} ${label}`;
        document.querySelector("#entityDialogHelp").textContent = help;
        document.querySelector("#entityType").value = type;
        document.querySelector("#entityId").value = record?.id || "";
        document.querySelector("#entityName").value = record?.name || "";
        document.querySelector("#entityColor").value = Utils.safeColor(record?.color);
        document.querySelector("#entityIcon").value = Utils.safeIcon(record?.icon || (type === "list" ? "cart" : type === "location" ? "pantry" : type === "category" ? "produce" : "box"));
        document.querySelector("#entityBudget").value = record?.budget ?? 0;
        document.querySelector("#entityAbbreviation").value = record?.abbreviation || "";
        document.querySelector("#entityParentField").hidden = type !== "subcategory";
        document.querySelector("#entityBudgetField").hidden = type !== "list";
        document.querySelector("#entityColorField").hidden = !["location", "category", "list"].includes(type);
        document.querySelector("#entityIconField").hidden = !["location", "category", "list"].includes(type);
        document.querySelector("#entityAbbreviationField").hidden = type !== "unit";
        if (type === "subcategory") this.populateSelect(document.querySelector("#entityParent"), state.mainCategories, record?.mainCategoryId || state.mainCategories[0]?.id || "");
        this.refs.entityDialog.showModal();
        requestAnimationFrame(() => document.querySelector("#entityName").focus());
      }

      openReassignDialog(type, source, targets, usage) {
        document.querySelector("#reassignType").value = type;
        document.querySelector("#reassignSourceId").value = source.id;
        document.querySelector("#reassignHelp").textContent = `${Utils.plural(usage, "record")} still ${usage === 1 ? "uses" : "use"} “${source.name}”. Choose a new ${ENTITY_CONFIG[type].label} before deleting it.`;
        this.populateSelect(document.querySelector("#reassignTarget"), targets, targets[0]?.id || "");
        this.refs.reassignDialog.showModal();
      }

      openImportDialog(type) {
        const input = document.querySelector("#importFiles");
        const isCsv = type === "csv";
        document.querySelector("#importType").value = type;
        document.querySelector("#importDialogTitle").textContent = isCsv ? "Import CSV datasets" : "Import SQL backup";
        document.querySelector("#importPlural").textContent = isCsv ? "s" : "";
        document.querySelector("#importFileHelp").textContent = isCsv ? "Select one or more PantryFlow .csv files" : "Select one complete PantryFlow .sql file";
        document.querySelector("#importFileList").textContent = "No file selected";
        input.value = "";
        input.accept = isCsv ? ".csv,text/csv" : ".sql,application/sql,text/plain";
        input.multiple = isCsv;
        this.refs.importDialog.showModal();
      }

      closeDialog(id) {
        const dialog = document.getElementById(id);
        if (dialog?.open) dialog.close();
      }

      showToast(title, message = "", type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast${type === "error" ? " is-error" : ""}`;
        toast.innerHTML = `<span class="toast-icon"><svg><use href="#icon-${type === "error" ? "alert" : "check"}"></use></svg></span><div><strong>${Utils.escapeHtml(title)}</strong>${message ? `<span>${Utils.escapeHtml(message)}</span>` : ""}</div><button type="button" aria-label="Dismiss"><svg><use href="#icon-close"></use></svg></button>`;
        const dismiss = () => {
          toast.classList.add("is-leaving");
          setTimeout(() => toast.remove(), 210);
        };
        toast.querySelector("button").addEventListener("click", dismiss);
        this.refs.toastRegion.append(toast);
        setTimeout(dismiss, 4200);
      }
    }

    class AppController {
      constructor(service, backup, view) {
        this.service = service;
        this.backup = backup;
        this.view = view;
        const preferences = service.getState().preferences;
        this.ui = {
          view: "pantry",
          search: "",
          filters: { location: "all", category: "all", status: "all" },
          sort: "name",
          layout: preferences.inventoryLayout || "grid",
          shoppingList: "all"
        };
        this.pendingConfirm = null;
      }

      init() {
        this.bindEvents();
        this.service.store.subscribe(() => this.refresh());
        this.refresh();
        this.view.setView(this.ui.view);
        this.updateConnectionStatus();
        this.registerServiceWorker();
      }

      refresh() {
        const state = this.service.getState();
        this.view.render(state, this.ui);
      }

      bindEvents() {
        document.addEventListener("click", (event) => this.handleClick(event));
        document.addEventListener("keydown", (event) => {
          if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
            event.preventDefault();
            this.view.refs.search.focus();
          }
        });
        this.view.refs.search.addEventListener("input", (event) => {
          this.ui.search = event.target.value;
          this.refresh();
        });
        this.view.refs.filterLocation.addEventListener("change", (event) => { this.ui.filters.location = event.target.value; this.refresh(); });
        this.view.refs.filterCategory.addEventListener("change", (event) => { this.ui.filters.category = event.target.value; this.refresh(); });
        this.view.refs.filterStatus.addEventListener("change", (event) => { this.ui.filters.status = event.target.value; this.refresh(); });
        this.view.refs.inventorySort.addEventListener("change", (event) => { this.ui.sort = event.target.value; this.refresh(); });
        document.querySelector("#itemMainCategory").addEventListener("change", (event) => this.view.updateSubcategoryOptions(this.service.getState(), event.target.value));
        document.querySelector("#itemForm").addEventListener("submit", (event) => this.handleItemSubmit(event));
        document.querySelector("#entityForm").addEventListener("submit", (event) => this.handleEntitySubmit(event));
        document.querySelector("#reassignForm").addEventListener("submit", (event) => this.handleReassignSubmit(event));
        document.querySelector("#confirmForm").addEventListener("submit", (event) => this.handleConfirmSubmit(event));
        document.querySelector("#importForm").addEventListener("submit", (event) => this.handleImportSubmit(event));
        document.querySelector("#importFiles").addEventListener("change", (event) => {
          const names = [...event.target.files].map((file) => file.name);
          document.querySelector("#importFileList").textContent = names.length ? names.join(" · ") : "No file selected";
        });
        document.querySelector("#currencySelect").addEventListener("change", (event) => this.service.savePreferences({ currency: event.target.value }));
        window.addEventListener("online", () => this.updateConnectionStatus());
        window.addEventListener("offline", () => this.updateConnectionStatus());
      }

      handleClick(event) {
        const button = event.target.closest("button, [data-action]");
        if (!button) return;
        const action = button.dataset.action;

        if (button.dataset.view) {
          this.ui.view = button.dataset.view;
          this.view.setView(this.ui.view);
          return;
        }
        if (button.dataset.closeDialog) {
          this.view.closeDialog(button.dataset.closeDialog);
          return;
        }
        if (button.dataset.layout) {
          this.ui.layout = button.dataset.layout;
          this.service.savePreferences({ inventoryLayout: this.ui.layout });
          return;
        }
        if (button.dataset.quickFilter) {
          this.ui.filters.status = button.dataset.quickFilter;
          this.refresh();
          document.querySelector("#inventoryHeading")?.scrollIntoView({ behavior: "smooth" });
          return;
        }
        if (button.dataset.themeChoice) {
          this.service.savePreferences({ theme: button.dataset.themeChoice });
          return;
        }

        try {
          switch (action) {
            case "toggle-theme": this.toggleTheme(); break;
            case "add-item": this.view.openItemDialog(this.service.getState()); break;
            case "add-shopping-item": this.view.openItemDialog(this.service.getState(), null, { shopping: true, listId: button.dataset.listId }); break;
            case "edit-item": this.openItem(button.dataset.id); break;
            case "delete-item": this.confirmDeleteItem(button.dataset.id); break;
            case "delete-current-item": {
              const id = document.querySelector("#itemId").value;
              this.view.closeDialog("itemDialog");
              this.confirmDeleteItem(id);
              break;
            }
            case "adjust-stock": this.adjustStock(button.dataset.id, Number(button.dataset.amount)); break;
            case "consume-item": this.adjustStock(button.dataset.id, -1); break;
            case "mark-empty": this.confirmMarkEmpty(button.dataset.id); break;
            case "toggle-purchased": this.service.togglePurchased(button.dataset.id); break;
            case "clear-purchased": this.confirmClearPurchased(button.dataset.id); break;
            case "filter-shopping-list": this.ui.shoppingList = button.dataset.id; this.refresh(); break;
            case "clear-filters": this.clearFilters(); break;
            case "toggle-filters": document.querySelector("#inventoryFilters").classList.toggle("is-open"); break;
            case "manage-entity": this.view.openEntityDialog(this.service.getState(), button.dataset.entity); break;
            case "manage-list": this.view.openEntityDialog(this.service.getState(), "list"); break;
            case "edit-entity": this.openEntity(button.dataset.entity, button.dataset.id); break;
            case "delete-entity": this.startDeleteEntity(button.dataset.entity, button.dataset.id); break;
            case "restore-sample": this.confirmRestoreSample(); break;
            case "erase-data": this.confirmEraseData(); break;
            case "export-sql": this.backup.exportSql(); this.view.showToast("SQL backup exported", "A complete relational backup was created."); break;
            case "import-sql": this.view.openImportDialog("sql"); break;
            case "export-csv": {
              const count = this.backup.exportCsvFiles();
              this.view.showToast("CSV exports started", `${count} separate data files are being created.`);
              break;
            }
            case "import-csv": this.view.openImportDialog("csv"); break;
            default: break;
          }
        } catch (error) {
          this.handleError(error);
        }
      }

      handleItemSubmit(event) {
        event.preventDefault();
        const input = {
          id: document.querySelector("#itemId").value || null,
          name: document.querySelector("#itemName").value,
          locationId: document.querySelector("#itemLocation").value,
          mainCategoryId: document.querySelector("#itemMainCategory").value,
          subcategoryId: document.querySelector("#itemSubcategory").value,
          unitId: document.querySelector("#itemUnit").value,
          inStock: document.querySelector("#itemInStock").value,
          toBuy: document.querySelector("#itemToBuy").value,
          lowStockThreshold: document.querySelector("#itemLowThreshold").value,
          pricePerUnit: document.querySelector("#itemPrice").value,
          expiryDate: document.querySelector("#itemExpiry").value,
          notes: document.querySelector("#itemNotes").value,
          listId: document.querySelector("#itemList").value || null,
          shoppingStatus: document.querySelector("#itemShoppingStatus").value
        };
        try {
          const isEdit = Boolean(input.id);
          const saved = this.service.saveItem(input);
          this.view.closeDialog("itemDialog");
          this.view.showToast(isEdit ? "Item updated" : "Item added", `${saved.name} is saved on this device.`);
        } catch (error) { this.handleError(error); }
      }

      handleEntitySubmit(event) {
        event.preventDefault();
        const type = document.querySelector("#entityType").value;
        const input = {
          id: document.querySelector("#entityId").value || null,
          name: document.querySelector("#entityName").value,
          color: document.querySelector("#entityColor").value,
          icon: document.querySelector("#entityIcon").value,
          budget: document.querySelector("#entityBudget").value,
          abbreviation: document.querySelector("#entityAbbreviation").value,
          mainCategoryId: document.querySelector("#entityParent").value
        };
        try {
          const isEdit = Boolean(input.id);
          const saved = this.service.saveEntity(type, input);
          this.view.closeDialog("entityDialog");
          this.view.showToast(isEdit ? "Saved changes" : "Created", `${saved.name} is ready to use.`);
        } catch (error) { this.handleError(error); }
      }

      handleReassignSubmit(event) {
        event.preventDefault();
        const type = document.querySelector("#reassignType").value;
        const sourceId = document.querySelector("#reassignSourceId").value;
        const targetId = document.querySelector("#reassignTarget").value;
        try {
          this.service.deleteEntity(type, sourceId, targetId);
          this.view.closeDialog("reassignDialog");
          this.view.showToast("Reassigned and deleted", "All related records remain connected.");
        } catch (error) { this.handleError(error); }
      }

      handleConfirmSubmit(event) {
        event.preventDefault();
        if (!this.pendingConfirm) return;
        const callback = this.pendingConfirm;
        this.pendingConfirm = null;
        this.view.closeDialog("confirmDialog");
        try { callback(); } catch (error) { this.handleError(error); }
      }

      async handleImportSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector("button[type='submit']");
        const type = document.querySelector("#importType").value;
        const files = document.querySelector("#importFiles").files;
        const mode = form.querySelector("input[name='importMode']:checked")?.value || "replace";
        button.disabled = true;
        button.textContent = "Validating…";
        try {
          if (type === "sql") {
            if (files.length !== 1) throw new DataValidationError("Choose exactly one SQL backup file.");
            const itemCount = await this.backup.importSql(files[0], mode);
            this.view.showToast("SQL backup imported", `${Utils.plural(itemCount, "item")} restored after relational validation.`);
          } else {
            const result = await this.backup.importCsv(files, mode);
            this.view.showToast("CSV data imported", `${result.records} records from ${Utils.plural(result.files, "file")} passed validation.`);
          }
          this.view.closeDialog("importDialog");
          this.clearFilters(false);
          this.refresh();
        } catch (error) {
          this.handleError(error);
        } finally {
          button.disabled = false;
          button.innerHTML = `<svg><use href="#icon-upload"></use></svg>Validate &amp; import`;
        }
      }

      askConfirm({ title, message, actionLabel = "Continue", action, extraHtml = "" }) {
        document.querySelector("#confirmTitle").textContent = title;
        document.querySelector("#confirmMessage").textContent = message;
        document.querySelector("#confirmAction").textContent = actionLabel;
        document.querySelector("#confirmExtra").innerHTML = extraHtml;
        this.pendingConfirm = action;
        this.view.refs.confirmDialog.showModal();
      }

      openItem(id) {
        const state = this.service.getState();
        const item = state.items.find((row) => row.id === id);
        if (!item) throw new DataValidationError("That item no longer exists.");
        this.view.openItemDialog(state, item);
      }

      openEntity(type, id) {
        const config = ENTITY_CONFIG[type];
        const state = this.service.getState();
        const record = config ? state[config.collection].find((row) => row.id === id) : null;
        if (!record) throw new DataValidationError("That record no longer exists.");
        this.view.openEntityDialog(state, type, record);
      }

      adjustStock(id, amount) {
        const item = this.service.getState().items.find((row) => row.id === id);
        if (!item) throw new DataValidationError("That item no longer exists.");
        if (amount < 0 && item.inStock <= 0) {
          this.view.showToast("Already empty", `${item.name} has no stock to consume.`, "error");
          return;
        }
        this.service.adjustStock(id, amount);
      }

      confirmMarkEmpty(id) {
        const state = this.service.getState();
        const item = state.items.find((row) => row.id === id);
        if (!item) throw new DataValidationError("That item no longer exists.");
        const listOptions = state.groceryLists.map((list) => `<option value="${list.id}"${item.listId === list.id ? " selected" : ""}>${Utils.escapeHtml(list.name)}</option>`).join("");
        const extraHtml = state.groceryLists.length ? `<div class="confirm-extra-field"><label><span><input type="checkbox" id="emptyAddToList" checked> Add to a shopping list</span><select id="emptyListTarget">${listOptions}</select></label></div>` : "";
        this.askConfirm({
          title: `Mark ${item.name} empty?`,
          message: state.groceryLists.length ? "Stock will become zero. You can also add the refill quantity to a shopping list." : "Stock will become zero. Create a shopping list later if you want to restock it.",
          actionLabel: "Mark empty",
          extraHtml,
          action: () => {
            const add = Boolean(document.querySelector("#emptyAddToList")?.checked);
            const listId = document.querySelector("#emptyListTarget")?.value || null;
            this.service.markEmpty(id, add, listId);
            this.view.showToast("Marked empty", add ? `${item.name} was added to your shopping list.` : `${item.name} stock is now zero.`);
          }
        });
      }

      confirmDeleteItem(id) {
        const item = this.service.getState().items.find((row) => row.id === id);
        if (!item) throw new DataValidationError("That item no longer exists.");
        this.askConfirm({
          title: `Delete ${item.name}?`,
          message: "Its inventory and shopping history in this browser will be removed.",
          actionLabel: "Delete item",
          action: () => { this.service.deleteItem(id); this.view.showToast("Item deleted", `${item.name} was removed.`); }
        });
      }

      confirmClearPurchased(listId) {
        const state = this.service.getState();
        const list = state.groceryLists.find((row) => row.id === listId);
        const count = state.items.filter((item) => item.listId === listId && item.toBuy > 0 && item.shoppingStatus === "purchased").length;
        if (!count) return;
        this.askConfirm({
          title: `Restock ${Utils.plural(count, "purchased item")}?`,
          message: `Purchased quantities from ${list?.name || "this list"} will be added to pantry stock, then cleared from the shopping list.`,
          actionLabel: "Clear & restock",
          action: () => {
            const moved = this.service.clearPurchased(listId);
            this.view.showToast("Pantry restocked", `${Utils.plural(moved, "item")} moved into inventory.`);
          }
        });
      }

      startDeleteEntity(type, id) {
        const config = ENTITY_CONFIG[type];
        const state = this.service.getState();
        const record = config ? state[config.collection].find((row) => row.id === id) : null;
        if (!record) throw new DataValidationError("That record no longer exists.");
        const usage = this.service.getEntityUsage(type, id);
        if (usage > 0) {
          const targets = this.service.getReassignTargets(type, id);
          if (!targets.length) {
            this.view.showToast("Cannot delete yet", `Create another ${config.label} first so assigned records have somewhere to go.`, "error");
            return;
          }
          this.view.openReassignDialog(type, record, targets, usage);
          return;
        }
        this.askConfirm({
          title: `Delete ${record.name}?`,
          message: `This ${config.label} is not assigned to any inventory records.`,
          actionLabel: "Delete",
          action: () => { this.service.deleteEntity(type, id); this.view.showToast("Deleted", `${record.name} was removed.`); }
        });
      }

      confirmRestoreSample() {
        this.askConfirm({ title: "Restore the sample pantry?", message: "This replaces all current local data with a fresh set of example items.", actionLabel: "Restore sample", action: () => { this.service.restoreSample(); this.clearFilters(false); this.view.showToast("Sample restored", "The example pantry is ready."); } });
      }

      confirmEraseData() {
        this.askConfirm({ title: "Erase all inventory items?", message: "Items will be removed, while starter locations, categories, lists, and units stay available.", actionLabel: "Erase items", action: () => { this.service.eraseAll(); this.clearFilters(false); this.view.showToast("Inventory erased", "Your item records have been removed."); } });
      }

      clearFilters(refresh = true) {
        this.ui.search = "";
        this.ui.filters = { location: "all", category: "all", status: "all" };
        this.ui.sort = "name";
        if (refresh) this.refresh();
      }

      toggleTheme() {
        const state = this.service.getState();
        const isDark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
        this.service.savePreferences({ theme: isDark ? "light" : "dark" });
      }

      updateConnectionStatus() {
        document.body.classList.toggle("is-offline", !navigator.onLine);
        document.querySelector("#connectionLabel").textContent = navigator.onLine ? "Offline ready" : "Working offline";
      }

      registerServiceWorker() {
        if ("serviceWorker" in navigator && location.protocol !== "file:") {
          navigator.serviceWorker.register("./script.js?sw=1", { scope: "./" }).catch(() => {
            this.view.showToast("Offline shell unavailable", "Local data still works, but this browser could not cache the app shell.", "error");
          });
        }
      }

      handleError(error) {
        console.error(error);
        const message = error instanceof DataValidationError ? error.message : "Something went wrong while updating local data.";
        this.view.showToast("Could not complete that action", message, "error");
      }
    }

    function boot() {
      try {
        const store = new DataStore();
        const service = new PantryService(store);
        const backup = new BackupService(store);
        const view = new AppView();
        const controller = new AppController(service, backup, view);
        controller.init();
        window.PantryFlow = Object.freeze({ version: "1.0.0", storageKeys: STORAGE, validate: () => store.validate(store.getState()) });
      } catch (error) {
        console.error(error);
        document.body.innerHTML = `<main class="fatal-error"><h1>PantryFlow could not start</h1><p>${Utils.escapeHtml(error.message || "Browser storage is unavailable.")}</p><p>Please allow local storage for this page and reload.</p></main>`;
      }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  })();
}
