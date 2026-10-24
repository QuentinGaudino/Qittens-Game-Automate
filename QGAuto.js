/* Qittens Game Automate 1.0: direct game API variant. */
if (globalThis.qgauto?.isRunning?.()) globalThis.qgauto.stop();

/** @typedef {{ craft: string, source: string, link: string, enabled: boolean, threshold: number }} CraftRecipe */
/** @typedef {{ enabled: boolean, minCount: number }} HuntSettings */
/** @typedef {{ enabled: boolean, threshold: number }} PraiseSettings */
/** @typedef {{ enabled: boolean, threshold: number, items: CraftRecipe[] }} CraftSettings */
/** @typedef {{ enabled: boolean, minCaravans: number, minInterval: number, nations: string[] }} TradeSettings */
/** @typedef {{ interval: number, hunt: HuntSettings, observe: { enabled: boolean }, praise: PraiseSettings, craft: CraftSettings, trade: TradeSettings, embassy: { enabled: boolean } }} QGAutoConfig */
/** @typedef {{ log: (message: string) => void, ratio: (resourceName: string) => number }} GameUtils */
/** @typedef {{ key: string, label: string, type: string, min?: number, max?: number, step?: number, scale?: number, options?: { value: string, label: string }[] }} ServiceSetting */
/** @typedef {{ id: string, label: string, description: string, settings?: ServiceSetting[], collection?: { key: string, itemLabel: (item: object) => string, fields: ServiceSetting[] }, run: (config: QGAutoConfig, utils: GameUtils, state: object) => void, createState?: () => object }} AutomationServiceDefinition */
/** @typedef {QGAutoController} QGAutoApi Public console API exposed as `globalThis.qgauto`. */

/** Stores the application modules and service definitions. */
class ModuleRegistry {
  constructor() {
    /** @type {Map<string, unknown>} */
    this.modules = new Map();
    /** @type {Map<string, AutomationServiceDefinition>} */
    this.serviceMap = new Map();
  }

  /** @param {string} name @param {() => unknown} factory */
  define(name, factory) {
    if (this.modules.has(name)) throw new Error(`Module already registered: ${name}`);
    this.modules.set(name, factory());
  }

  /** @template T @param {string} name @returns {T} */
  get(name) {
    if (!this.modules.has(name)) throw new Error(`Module not registered: ${name}`);
    return /** @type {T} */ (this.modules.get(name));
  }

  /** @param {AutomationServiceDefinition} service */
  registerService(service) {
    if (this.serviceMap.has(service.id)) throw new Error(`Service already registered: ${service.id}`);
    this.serviceMap.set(service.id, service);
  }

  /** @returns {AutomationServiceDefinition[]} */
  getServices() {
    return [...this.serviceMap.values()];
  }
}

globalThis.QGAutoModules = new ModuleRegistry();


/* src/config.js */
QGAutoModules.define('config', () => ({
  interval: 1000,
  hunt: { enabled: true, minCount: 20 },
  observe: { enabled: true },
  praise: { enabled: true, threshold: 0.95 },
  craft: {
    enabled: true,
    threshold: 0.98,
    items: [
      { craft: 'wood', source: 'catnip', link: '.craft-5pc', enabled: true, threshold: 0.98 },
      { craft: 'beam', source: 'wood', link: '.craft-5pc', enabled: true, threshold: 0.98 },
      { craft: 'slab', source: 'minerals', link: '.craft-5pc', enabled: true, threshold: 0.98 },
      { craft: 'plate', source: 'iron', link: '.craft-5pc', enabled: true, threshold: 0.98 },
      { craft: 'steel', source: 'coal', link: '.craft-5pc', enabled: true, threshold: 0.98 },
      { craft: 'manuscript', source: 'culture', link: '.all', enabled: true, threshold: 0.98 },
    ],
  },
  trade: {
    enabled: true,
    minCaravans: 15,
    minInterval: 3000,
    nations: ['Zèbres'],
  },
  embassy: { enabled: true },
}));


/* src/utils.js */
QGAutoModules.define('utils', () => {
  /** Shared accessors for the game DOM and resource pool. */
  class GameUtils {
    /** @param {string} message */
    static log(message) {
      console.log(`[qgauto] ${message}`);
    }

    /** @param {string} resourceName @returns {number} Resource storage ratio from 0 to 1. */
    static ratio(resourceName) {
      const resource = globalThis.gamePage?.resPool?.get(resourceName);
      return resource?.maxValue ? resource.value / resource.maxValue : 0;
    }
  }

  return GameUtils;
});


/** Base contract shared by all automation services. */
class AutomationService {
  /** @param {AutomationServiceDefinition} metadata */
  constructor(metadata) {
    Object.assign(this, metadata);
  }

  /** @returns {object} Mutable per-service state. */
  createState() {
    return {};
  }

  /** @param {object} _config @param {object} _utils @param {object} _state */
  run(_config, _utils, _state) {
    throw new Error(`Service ${this.id} must implement run()`);
  }
}

/** Sends hunter squads through VillageManager without reading the hunt UI. */
class HuntService extends AutomationService {
  constructor() {
    super({
      id: 'hunt',
      label: 'Chasses',
      description: 'Envoie les chasseurs quand le compteur atteint le seuil.',
      settings: [
        { key: 'minCount', label: 'Minimum de chasses', type: 'number', min: 1, max: 999, step: 1 },
      ],
    });
  }

  /** @param {QGAutoConfig} config @param {GameUtils} utils @returns {void} */
  run(config, utils) {
    const game = globalThis.gamePage;
    const maxHunts = game?.village?.getMaxHuntAmt?.() ?? 0;
    const huntCost = 100 - game.getEffect('huntCatpowerDiscount');
    const affordableHunts = Math.floor(game.resPool.get('manpower').value / huntCost);
    if (affordableHunts < config.hunt.minCount || maxHunts < config.hunt.minCount) return;

    game.village.huntFraction(1);
    utils.log(`${affordableHunts} chasses envoyées via VillageManager`);
  }
}

/** Resolves an active astronomical event directly through Calendar. */
class ObserveService extends AutomationService {
  constructor() {
    super({ id: 'observe', label: 'Observation', description: 'Observe automatiquement le ciel.' });
  }

  /** @param {QGAutoConfig} _config @param {GameUtils} utils @returns {void} */
  run(_config, utils) {
    const calendar = globalThis.gamePage?.calendar;
    if (!calendar || calendar.observeRemainingTime <= 0) return;
    calendar.observeHandler();
    utils.log('événement astronomique observé via Calendar');
  }
}

/** Praises the sun through ReligionManager when faith reaches its configured ratio. */
class PraiseService extends AutomationService {
  constructor() {
    super({
      id: 'praise',
      label: 'Louanges',
      description: 'Loue le soleil lorsque le seuil de foi est atteint.',
      settings: [
        { key: 'threshold', label: 'Seuil de foi (%)', type: 'number', min: 0, max: 100, step: 1, scale: 0.01 },
      ],
    });
  }

  /** @param {QGAutoConfig} config @param {GameUtils} utils @returns {void} */
  run(config, utils) {
    if (utils.ratio('faith') < config.praise.threshold) return;
    globalThis.gamePage.religion.praise();
    utils.log('soleil loué via ReligionManager');
  }
}

/** Crafts at most one recipe per tick using WorkshopManager. */
class CraftService extends AutomationService {
  constructor() {
    super({
      id: 'craft',
      label: 'Fabrication',
      description: 'Active et règle chaque recette séparément.',
      collection: {
        key: 'items',
        itemLabel: (item) => item.craft,
        fields: [
          { key: 'threshold', label: 'Seuil de stock (%)', type: 'number', min: 0, max: 100, step: 1, scale: 0.01 },
          {
            key: 'link',
            label: 'Quantité à fabriquer',
            type: 'select',
            options: [
              { value: '.craft-1pc', label: '1 %' },
              { value: '.craft-5pc', label: '5 %' },
              { value: '.craft-10pc', label: '10 %' },
              { value: '.all', label: 'Max' },
            ],
          },
        ],
      },
    });
  }

  /** @param {QGAutoConfig} config @param {GameUtils} utils @returns {void} */
  run(config, utils) {
    const game = globalThis.gamePage;
    for (const item of config.craft.items) {
      if (item.enabled === false || utils.ratio(item.source) < (item.threshold ?? config.craft.threshold)) continue;

      const craftableCount = game.workshop.getCraftAllCount(item.craft);
      if (craftableCount < 1) continue;

      if (item.link === '.all') {
        game.craftAll(item.craft);
        utils.log(`${item.craft} fabriqué au maximum via GamePage`);
        return;
      }

      const batch = this.getBatchSize(item.link, craftableCount);
      if (batch < 1 || !game.workshop.craft(item.craft, batch)) continue;
      game.updateResources();
      utils.log(`${item.craft} fabriqué`);
      return;
    }
  }

  /** @param {string} link @param {number} craftableCount @returns {number} */
  getBatchSize(link, craftableCount) {
    const fixedBatch = {
      '.craft-1pc': 1,
      '.craft-5pc': 25,
      '.craft-10pc': 100,
    }[link] ?? 0;
    if (link === '.all') return craftableCount;
    const percentage = Number.parseFloat(link.match(/\d+/)?.[0] ?? '0') / 100;
    return Math.min(craftableCount, Math.max(fixedBatch, Math.floor(craftableCount * percentage)));
  }
}

/** Sends recurring caravans directly through DiplomacyManager. */
class TradeService extends AutomationService {
  constructor() {
    super({
      id: 'trade',
      label: 'Commerce',
      description: 'Envoie une caravane dès que le maximum disponible atteint le seuil.',
      settings: [
        { key: 'minCaravans', label: 'Caravanes minimum', type: 'number', min: 1, max: 999, step: 1 },
        { key: 'minInterval', label: 'Délai entre échanges (secondes)', type: 'number', min: 1, max: 3600, step: 1, scale: 1000 },
        { key: 'nations', label: 'Nations ciblées, séparées par des virgules', type: 'list' },
      ],
    });
  }

  /** @returns {{ lastTradeAt: number }} */
  createState() {
    return { lastTradeAt: 0 };
  }

  /** @param {QGAutoConfig} config @param {GameUtils} utils @param {{ lastTradeAt: number }} state @returns {void} */
  run(config, utils, state) {
    const now = Date.now();
    if (now - state.lastTradeAt < config.trade.minInterval) return;

    const diplomacy = globalThis.gamePage?.diplomacy;
    if (!diplomacy) return;
    for (const nationName of config.trade.nations) {
      const race = diplomacy.races.find(
        (candidate) => candidate.name === nationName || candidate.title === nationName,
      );
      if (!race?.unlocked) continue;
      const maxCaravans = diplomacy.getMaxTradeAmt(race);
      if (!Number.isFinite(maxCaravans) || maxCaravans < config.trade.minCaravans) continue;

      diplomacy.tradeAll(race);
      state.lastTradeAt = now;
      utils.log(`caravane x${maxCaravans} envoyée aux ${race.title} via DiplomacyManager`);
      return;
    }
  }
}

/** Buys one embassy using the game's EmbassyButtonController validation and build logic. */
class EmbassyService extends AutomationService {
  constructor() {
    super({
      id: 'embassy',
      label: 'Ambassades',
      description: 'Construit une ambassade dès qu’un bouton est disponible.',
    });
  }

  /** @param {QGAutoConfig} _config @param {GameUtils} utils @returns {void} */
  run(_config, utils) {
    const game = globalThis.gamePage;
    const controllerType = globalThis.classes?.diplomacy?.ui?.EmbassyButtonController;
    if (!game?.science || !controllerType) return;

    for (const race of game.diplomacy.races) {
      if (!race.unlocked || !race.embassyPrices || race.name === 'leviathans') continue;

      const controller = new controllerType(game);
      const model = controller.fetchModel({ race, prices: race.embassyPrices });
      controller.updateVisible(model);
      controller.updateEnabled(model);
      if (!model.visible || !model.enabled) continue;

      const result = controller.buyItem(model, null);
      if (result?.itemBought) {
        utils.log(`ambassade construite chez les ${race.title} via EmbassyButtonController`);
        return;
      }
    }
  }
}

for (const Service of [HuntService, ObserveService, PraiseService, CraftService, TradeService, EmbassyService]) {
  QGAutoModules.registerService(new Service());
}


/* src/ui.js */
QGAutoModules.define('ui', () => {
  const config = QGAutoModules.get('config');
  const services = QGAutoModules.getServices();

  const styles = `
    #qgauto-settings-overlay { position: fixed; inset: 0; z-index: 100000; display: none; align-items: center; justify-content: center; padding: 18px; background: rgba(0,0,0,.62); }
    #qgauto-settings-modal { width: min(680px, 100%); max-height: min(84vh, 780px); overflow: auto; padding: 18px; color: #eee; background: #242424; border: 1px solid #777; box-shadow: 0 12px 48px rgba(0,0,0,.55); font: 14px/1.4 sans-serif; }
    #qgauto-settings-modal * { box-sizing: border-box; }
    .qgauto-header, .qgauto-toolbar, .qgauto-service-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .qgauto-header { padding-bottom: 12px; border-bottom: 1px solid #666; }
    .qgauto-header h2 { margin: 0; font-size: 20px; }
    .qgauto-toolbar { padding: 12px 0; }
    .qgauto-service { padding: 12px 0; border-bottom: 1px solid #505050; }
    .qgauto-service p { margin: 4px 0 8px; color: #c4c4c4; }
    .qgauto-switch { width: 18px; height: 18px; accent-color: #82bd68; }
    .qgauto-fields { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 14px; margin-top: 10px; }
    .qgauto-item-settings { display: grid; gap: 8px; margin-top: 10px; }
    .qgauto-item { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(0, 2fr); align-items: center; gap: 12px; padding: 10px; background: rgba(255,255,255,.04); }
    .qgauto-item-controls { display: grid; grid-template-columns: 24px repeat(2, minmax(100px, 1fr)); align-items: center; gap: 10px; }
    .qgauto-item-controls > label:first-child { display: flex; justify-content: center; }
    .qgauto-field { display: grid; min-width: 0; gap: 4px; flex: 1 1 180px; }
    .qgauto-field span { color: #ccc; font-size: 12px; }
    .qgauto-field input, .qgauto-field select, .qgauto-action { min-width: 0; padding: 6px 8px; color: #eee; background: #111; border: 1px solid #777; }
    .qgauto-action { background: #444; cursor: pointer; }
    .qgauto-action:hover { background: #555; }
    .qgauto-status { color: #aaa; }
    @media (max-width: 560px) { #qgauto-settings-overlay { padding: 8px; } #qgauto-settings-modal { padding: 12px; max-height: 90vh; } .qgauto-item { grid-template-columns: 1fr; gap: 8px; } .qgauto-item-controls { grid-template-columns: 24px repeat(2, minmax(0, 1fr)); } }
  `;

  const renderField = (fieldConfig, value, onChange) => {
    const field = document.createElement('label');
    field.className = 'qgauto-field';
    const caption = document.createElement('span');
    caption.textContent = fieldConfig.label;
    let input;

    if (fieldConfig.type === 'select') {
      input = document.createElement('select');
      for (const optionConfig of fieldConfig.options) {
        const option = document.createElement('option');
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        input.append(option);
      }
      input.value = value;
      input.addEventListener('change', () => onChange(input.value));
    } else {
      input = document.createElement('input');
      input.type = fieldConfig.type === 'list' ? 'text' : 'number';
      if (fieldConfig.min !== undefined) input.min = String(fieldConfig.min);
      if (fieldConfig.max !== undefined) input.max = String(fieldConfig.max);
      if (fieldConfig.step !== undefined) input.step = String(fieldConfig.step);
      const scale = fieldConfig.scale ?? 1;
      input.value = fieldConfig.type === 'list' ? value.join(', ') : String(value / scale);
      input.addEventListener('change', () => {
        if (fieldConfig.type === 'list') {
          const list = input.value.split(',').map((name) => name.trim()).filter(Boolean);
          onChange(list);
          input.value = list.join(', ');
          return;
        }
        const number = Number(input.value);
        if (!Number.isFinite(number) || number < fieldConfig.min || number > fieldConfig.max) {
          input.value = String(value / scale);
          return;
        }
        onChange(number * scale);
      });
    }

    field.append(caption, input);
    return field;
  };

  const renderSettings = (overlay, controller) => {
    const serviceList = overlay.querySelector('#qgauto-service-list');
    serviceList.replaceChildren();

    for (const service of services) {
      const row = document.createElement('section');
      row.className = 'qgauto-service';
      const header = document.createElement('div');
      header.className = 'qgauto-service-head';
      const title = document.createElement('strong');
      title.textContent = service.label;
      const serviceSwitch = document.createElement('input');
      serviceSwitch.className = 'qgauto-switch';
      serviceSwitch.type = 'checkbox';
      serviceSwitch.checked = config[service.id].enabled;
      serviceSwitch.setAttribute('aria-label', `Activer ${service.label}`);
      serviceSwitch.addEventListener('change', () => controller.toggle(service.id, serviceSwitch.checked));
      header.append(title, serviceSwitch);
      row.append(header);

      const description = document.createElement('p');
      description.textContent = service.description;
      row.append(description);

      if (service.settings?.length) {
        const fields = document.createElement('div');
        fields.className = 'qgauto-fields';
        for (const setting of service.settings) {
          fields.append(renderField(setting, config[service.id][setting.key], (value) => {
            config[service.id][setting.key] = value;
          }));
        }
        row.append(fields);
      }

      if (service.collection) {
        const itemList = document.createElement('div');
        itemList.className = 'qgauto-item-settings';
        for (const item of config[service.id][service.collection.key]) {
          const itemRow = document.createElement('div');
          itemRow.className = 'qgauto-item';
          const itemTitle = document.createElement('strong');
          itemTitle.textContent = service.collection.itemLabel(item);
          const controls = document.createElement('div');
          controls.className = 'qgauto-item-controls';
          const itemSwitch = document.createElement('input');
          itemSwitch.className = 'qgauto-switch';
          itemSwitch.type = 'checkbox';
          itemSwitch.checked = item.enabled !== false;
          itemSwitch.setAttribute('aria-label', `Activer ${itemTitle.textContent}`);
          itemSwitch.addEventListener('change', () => { item.enabled = itemSwitch.checked; });
          const switchLabel = document.createElement('label');
          switchLabel.append(itemSwitch);
          controls.append(switchLabel);
          for (const setting of service.collection.fields) {
            controls.append(renderField(setting, item[setting.key], (value) => {
              item[setting.key] = value;
            }));
          }
          itemRow.append(itemTitle, controls);
          itemList.append(itemRow);
        }
        row.append(itemList);
      }
      serviceList.append(row);
    }
  };

  /** Renders the settings dialog and its game navigation entry. */
  class SettingsUI {
    /** @param {QGAutoController} controller */
    static create(controller) {
    if (document.getElementById('qgauto-settings-modal')) return;
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);

    const overlay = document.createElement('div');
    overlay.id = 'qgauto-settings-overlay';
    overlay.innerHTML = `
      <section id="qgauto-settings-modal" role="dialog" aria-modal="true" aria-labelledby="qgauto-settings-title">
        <header class="qgauto-header"><h2 id="qgauto-settings-title">Qittens Game Automate</h2><button class="qgauto-action" type="button" data-close>Fermer</button></header>
        <div class="qgauto-toolbar"><span class="qgauto-status" id="qgauto-run-status"></span><button class="qgauto-action" type="button" id="qgauto-run-button"></button></div>
        <div id="qgauto-service-list"></div>
      </section>`;
    document.body.append(overlay);

    const syncControls = () => {
      const running = controller.isRunning();
      overlay.querySelector('#qgauto-run-status').textContent = running
        ? 'Automatisations en cours'
        : 'Automatisations arrêtées';
      overlay.querySelector('#qgauto-run-button').textContent = running ? 'Tout arrêter' : 'Tout démarrer';
    };
    const close = () => { overlay.style.display = 'none'; };
    overlay.querySelector('[data-close]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    overlay.querySelector('#qgauto-run-button').addEventListener('click', () => {
      if (controller.isRunning()) controller.stop();
      else controller.start();
      syncControls();
    });

    const queueLink = document.getElementById('queueLink');
    if (queueLink && !document.getElementById('qgauto-settings-button')) {
      const openLink = document.createElement('a');
      openLink.id = 'qgauto-settings-button';
      openLink.href = '#';
      openLink.style.marginLeft = '6px';
      openLink.innerHTML = '<span aria-hidden="true">⚙</span> QGAuto';
      openLink.title = 'Ouvrir les réglages des automatisations';
      openLink.addEventListener('click', (event) => {
        event.preventDefault();
        overlay.style.display = 'flex';
        renderSettings(overlay, controller);
        syncControls();
        overlay.querySelector('[data-close]').focus();
      });
      queueLink.insertAdjacentElement('afterend', openLink);
    }
    renderSettings(overlay, controller);
    syncControls();
    }
  }

  return SettingsUI;
});


/** Coordinates service execution and exposes the public qgauto console API. */
class QGAutoController {
  /** @param {ModuleRegistry} registry @param {QGAutoConfig} config @param {GameUtils} utils */
  constructor(registry, config, utils) {
    this.registry = registry;
    this.config = config;
    this.utils = utils;
    this.serviceStates = new Map();
    this.#timer = null;

    for (const service of registry.getServices()) {
      this.serviceStates.set(service.id, service.createState());
    }
  }

  /** @type {number | null} */
  #timer;

  /** Execute one guarded automation cycle. */
  tick() {
    if (globalThis.gamePage?.isReadOnly?.()) return;
    for (const service of this.registry.getServices()) {
      if (!this.config[service.id]?.enabled) continue;
      try {
        service.run(this.config, this.utils, this.serviceStates.get(service.id));
      } catch (error) {
        console.warn(`[qgauto] ${service.id}:`, error);
      }
    }
  }

  /** Start periodic service execution. */
  start() {
    if (this.#timer !== null) return;
    this.#timer = globalThis.setInterval(() => this.tick(), this.config.interval);
    this.utils.log('démarré');
  }

  /** Stop periodic service execution. */
  stop() {
    if (this.#timer === null) return;
    globalThis.clearInterval(this.#timer);
    this.#timer = null;
    this.utils.log('arrêté');
  }

  /** @returns {boolean} Whether the controller is currently running. */
  isRunning() {
    return this.#timer !== null;
  }

  /** @param {string} serviceId @param {boolean} [enabled] */
  toggle(serviceId, enabled = !this.config[serviceId]?.enabled) {
    if (!Object.hasOwn(this.config, serviceId) || typeof this.config[serviceId].enabled !== 'boolean') {
      throw new Error(`Unknown service: ${serviceId}`);
    }
    this.config[serviceId].enabled = enabled;
    this.utils.log(`${serviceId} ${enabled ? 'activé' : 'désactivé'}`);
  }

  /** Open the settings dialog. */
  openSettings() {
    this.registry.get('ui').create(this);
    const overlay = document.getElementById('qgauto-settings-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  /** Print available console commands and their purpose. */
  help() {
    console.group('qgauto - Qittens Game Automate');
    console.log('qgauto.start() - démarrer les automatisations');
    console.log('qgauto.stop() - arrêter les automatisations');
    console.log('qgauto.openSettings() - ouvrir les réglages');
    for (const service of this.registry.getServices()) {
      console.log(`qgauto.toggle('${service.id}') - basculer ${service.label.toLowerCase()}`);
    }
    console.log('qgauto.config - consulter ou modifier les réglages');
    console.groupEnd();
  }
}

QGAutoModules.define('controller', () => new QGAutoController(
  QGAutoModules,
  QGAutoModules.get('config'),
  QGAutoModules.get('utils'),
));


/* src/app.js */
(() => {
  const waitForGame = setInterval(() => {
    if (!globalThis.gamePage?.resPool) return;
    clearInterval(waitForGame);

    const controller = QGAutoModules.get('controller');
    globalThis.qgauto = controller;
    QGAutoModules.get('ui').create(controller);
    controller.start();
  }, 500);
})();
