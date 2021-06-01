"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env = __importStar(require("env-var"));
const Common_1 = require("./Common");
const EnvConfigLoaderFactory_1 = __importDefault(require("./EnvConfigLoaderFactory"));
const jsonUtils_1 = __importDefault(require("./utils/jsonUtils"));
/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: the below should be common to this monorepo (share with with python, ruby etc.)
const TWIST_ENV_KEY = Common_1.ENV_VAR_NAME;
const DEFAULT_ENV_FALLBACK = ['master'];
class EnvConfig {
    constructor() {
        // - Preventing multi instantiation
        // - initializing member variables with defaults
        this.__context = undefined;
        // the process working env
        this.__environment = env
            .get(TWIST_ENV_KEY)
            .required()
            .asString();
        // the config mem db
        this.__configJSON = {};
        // the concrete config loader (injected)
        this.__configLoader = undefined;
        this.__context = undefined;
        // the below is a helper to hold collection of listed (not surely yet loaded) categories.
        this.__configCategories = new Set();
        this.__env_fallback = DEFAULT_ENV_FALLBACK;
    }
    /**
     * The singleton access method
     * @readonly
     * @static
     * @type {EnvConfig}
     */
    static get instance() {
        if (!EnvConfig.__theInstance) {
            EnvConfig.__theInstance = new EnvConfig();
        }
        return EnvConfig.__theInstance;
    }
    // env source of truth
    static get env() {
        return EnvConfig.instance.__environment;
    }
    /**
     * Dependency injection of a config context processor that adheres to IConfigContext interface
     * @param configContext concrete context processor
     */
    setContextHandler(configContext) {
        this.__context = configContext;
    }
    static addContext(key, value) {
        if (!EnvConfig.instance.__context) {
            throw new Error('IConfigContext has not been injected to EnvConfig!');
        }
        EnvConfig.instance.__context.add(key, value);
    }
    /**
     * @description A list of environments that if the current running environment (indicated by TWIST_ENV)
     * is not present (ex. branch does not exist) the list will provide another branch to fallback to.
     * The list will be used from first to last (["ONE", "TWO", "master"] if TWIST_ENV branch doesn't exist, then ONE, then TWO, finally master
     * @param fallbackList  -- list of branch names to fallback to
     */
    setEnvFallback(fallbackList) {
        this.__env_fallback = fallbackList;
    }
    /**
     * @description Dependency injection of a config loader that adheres to the IEnvConfigLoader interface
     * @param configLoader - the injected object
     */
    async setLoader(configLoader) {
        if (!configLoader) {
            this.__configLoader = new EnvConfigLoaderFactory_1.default().getLoader();
        }
        else {
            this.__configLoader = configLoader;
        }
        const envResult = await this.__configLoader.setEnv(this.__environment, this.__env_fallback);
        if (!envResult) {
            console.log(`could not find configuration env using the following fallback list: ${[
                this.__environment,
                ...this.__env_fallback,
            ]}`);
            process.exit(1);
        }
        await this.__loadCategories();
    }
    // eslint-disable-next-line consistent-return
    async requireCategory(category) {
        try {
            const res = await this.__loadConfig(category.toLowerCase());
            this.__configJSON[category.toLowerCase()] = res;
            return true;
        }
        catch (ex) {
            console.log(`Failed loading category [${category}]. Ex: ${ex}`);
            process.exit(1);
        }
    }
    /**
     * helper private method to list required and config-found categories
     * @param category
     */
    __listConfigurationCategory(category) {
        this.__configCategories.add(category);
        console.log(`EnvConfig category ${category} listed`);
    }
    /**
     * private method to calling loader to list all possible config categories
     */
    async __loadCategories() {
        if (!this.__configLoader) {
            throw new Error('config loader has not been set');
        }
        const categories = await this.__configLoader.listCategories();
        categories.forEach((category) => {
            // TODO: this should be moved to concrete impl of loader
            const normalizedCategoryName = category.replace('.json', '').toUpperCase();
            this.__listConfigurationCategory(normalizedCategoryName);
        });
    }
    static toFlatMap(categoryName) {
        return EnvConfig.instance.__toFlatMap(categoryName);
    }
    __toFlatMap(categoryName) {
        let toFlatten = this.__configJSON;
        if (categoryName) {
            toFlatten = this.__configJSON[categoryName];
        }
        return jsonUtils_1.default(toFlatten);
    }
    /**
     * public static facade to __get method
     */
    static async get(category, section, key, defaultValue) {
        return EnvConfig.instance.__get(category.toLowerCase(), section, key, defaultValue);
    }
    /**
     *  using config loader to loading a category-specific configuration
     * @param category
     */
    async __loadConfig(category) {
        if (!this.__configLoader) {
            throw new Error('Cannot load config without a loader (implementing EnvConfigLoader). please call set_loader respectively');
        }
        if (!this.__context) {
            throw new Error('config context is undefined');
        }
        try {
            const rawJson = await this.__configLoader.load(category);
            return this.__context.process(rawJson);
        }
        catch (ex) {
            console.log(`Failed loading config for provided environment ${this.__environment}. Exception: ${ex}`);
        }
        return undefined;
    }
    /**
     *  main config getter method
     *  example to config structure:
     *  genes.json
     *  { constraints: { max_length: 300 }}
     *  getter of max gene length: EnvConfig.get('genes', 'constraints', 'max_length', 301)
     * @param category - category name
     * @param section - section name - if undefined the entire category config is returned
     * @param key - key within section, if undefined, entire config section is returned
     * @param defaultValue - if requested config data (certain key, or whole section) is not found, the provided value is returned instead
     */
    async __get(category, section, key, defaultValue) {
        // detecting the first access ever to this instance,
        // it requires that we set a loader and initialize current environment configuration section (json files for git config storage)
        if (!this.__configLoader) {
            await this.setLoader();
        }
        // category is being accessed for the first time, load it
        if (this.__configJSON[category] === undefined) {
            console.log(`WARNING: category ${category} is loaded for the first time. consider require before use (see .envConfig.yml)`);
            this.__configJSON[category.toLowerCase()] = await this.__loadConfig(category);
        }
        // someone wants to get a hold of the entire category config
        if (!section) {
            return this.__configJSON[category];
        }
        // someone wants to get a hold of an entire section structure
        if (this.__configJSON[category] !== undefined && key === undefined) {
            return this.__configJSON[category][section];
        }
        // missing section
        if (this.__configJSON[category][section] === undefined) {
            return defaultValue;
        }
        // missing key in section
        if (key !== undefined && this.__configJSON[category][section][key] === undefined) {
            return defaultValue;
        }
        // actual config indicated data
        if (key !== undefined) {
            return this.__configJSON[category][section][key];
        }
        return undefined;
    }
}
exports.default = EnvConfig;
EnvConfig.TWIST_ENV_KEY = TWIST_ENV_KEY;
//# sourceMappingURL=EnvConfig.js.map