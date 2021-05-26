import * as env from 'env-var';
import { ENV_VAR_NAME } from './Common';
import EnvConfigLoaderFactory from './EnvConfigLoaderFactory';
import IEnvConfigLoader from './IEnvConfigLoader';
import IConfigContext from './IConfigContext';
import flattenJsonKeys from './utils/jsonUtils';

/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: the below should be common to this monorepo (share with with python, ruby etc.)
const TWIST_ENV_KEY = ENV_VAR_NAME;
const DEFAULT_ENV_FALLBACK = ['master'];

export default class EnvConfig {
    private static __theInstance: EnvConfig;

    public static readonly TWIST_ENV_KEY: string = TWIST_ENV_KEY;

    private __environment: string;

    private __configJSON: any;

    // @injectable
    private __configLoader: IEnvConfigLoader | undefined;

    private __context: IConfigContext | undefined = undefined;

    private __configCategories: Set<string>;

    private __env_fallback: Array<string>;

    /**
     * The singleton access method
     * @readonly
     * @static
     * @type {EnvConfig}
     */
    public static get instance(): EnvConfig {
        if (!EnvConfig.__theInstance) {
            EnvConfig.__theInstance = new EnvConfig();
        }

        return EnvConfig.__theInstance;
    }

    private constructor() {
        // - Preventing multi instantiation
        // - initializing member variables with defaults

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
        this.__configCategories = new Set<string>();

        this.__env_fallback = DEFAULT_ENV_FALLBACK;
    }

    // env source of truth
    public static get env(): string {
        return EnvConfig.instance.__environment;
    }

    /**
     * Dependency injection of a config context processor that adheres to IConfigContext interface
     * @param configContext concrete context processor
     */
    public setContextHandler(configContext: IConfigContext): void {
        this.__context = configContext;
    }

    public static addContext(key: string, value: any): void {
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
    public setEnvFallback(fallbackList: Array<string>): void {
        this.__env_fallback = fallbackList;
    }

    /**
     * @description Dependency injection of a config loader that adheres to the IEnvConfigLoader interface
     * @param configLoader - the injected object
     */
    public async setLoader(configLoader?: IEnvConfigLoader): Promise<void> {
        if (!configLoader) {
            this.__configLoader = new EnvConfigLoaderFactory().getLoader();
        } else {
            this.__configLoader = configLoader;
        }
        const envResult = await this.__configLoader.setEnv(this.__environment, this.__env_fallback);
        if (!envResult) {
            console.log(
                `could not find configuration env using the following fallback list: ${[
                    this.__environment,
                    ...this.__env_fallback,
                ]}`,
            );
            process.exit(1);
        }
        await this.__loadCategories();
    }

    // eslint-disable-next-line consistent-return
    public async requireCategory(category: string): Promise<boolean> {
        try {
            const res: any = await this.__loadConfig(category.toLowerCase());
            this.__configJSON[category.toLowerCase()] = res;
            return true;
        } catch (ex) {
            console.log(`Failed loading category [${category}]. Ex: ${ex}`);
            process.exit(1);
        }
    }

    /**
     * helper private method to list required and config-found categories
     * @param category
     */
    private __listConfigurationCategory(category: string): void {
        this.__configCategories.add(category);
        console.log(`EnvConfig category ${category} listed`);
    }

    /**
     * private method to calling loader to list all possible config categories
     */
    private async __loadCategories(): Promise<void> {
        if (!this.__configLoader) {
            throw new Error('config loader has not been set');
        }

        const categories = await this.__configLoader.listCategories();

        categories.forEach((category: string) => {
            // TODO: this should be moved to concrete impl of loader
            const normalizedCategoryName = category.replace('.json', '').toUpperCase();
            this.__listConfigurationCategory(normalizedCategoryName);
        });
    }

    public static toFlatMap(categoryName?: string): any {
        return EnvConfig.instance.__toFlatMap(categoryName);
    }

    private __toFlatMap(categoryName?: string): any {
        let toFlatten = this.__configJSON;
        if (categoryName) {
            toFlatten = this.__configJSON[categoryName];
        }

        return flattenJsonKeys(toFlatten);
    }

    /**
     * public static facade to __get method
     */
    public static async get(category: string, section?: string, key?: string, defaultValue?: any): Promise<any> {
        return EnvConfig.instance.__get(category.toLowerCase(), section, key, defaultValue);
    }

    /**
     *  using config loader to loading a category-specific configuration
     * @param category
     */
    private async __loadConfig(category: string): Promise<any> {
        if (!this.__configLoader) {
            throw new Error(
                'Cannot load config without a loader (implementing EnvConfigLoader). please call set_loader respectively',
            );
        }

        if (!this.__context) {
            throw new Error('config context is undefined');
        }

        try {
            const rawJson: any = await this.__configLoader.load(category);
            return this.__context.process(rawJson);
        } catch (ex) {
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
    private async __get(category: string, section?: string, key?: string, defaultValue?: any): Promise<any> {
        // detecting the first access ever to this instance,
        // it requires that we set a loader and initialize current environment configuration section (json files for git config storage)
        if (!this.__configLoader) {
            await this.setLoader();
        }

        // category is being accessed for the first time, load it
        if (this.__configJSON[category] === undefined) {
            console.log(
                `WARNING: category ${category} is loaded for the first time. consider require before use (see .envConfig.yml)`,
            );
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
