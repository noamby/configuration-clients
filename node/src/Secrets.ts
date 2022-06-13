import OSVars, { OSVarType } from './OSVars';
import { jsonOverride } from './utils/jsonUtils';
import { ENVS_VAULT_KEY, ENV_VAR_NAME } from './Common';

// TODO: move to a common folder within the config clients monorepo
const VAULT_API_VERSION = 'v1';
const VAULT_URL_KEY = 'VAULT_URL';
const VAULT_DEFAULT_URL = 'https://vault.twistbioscience-staging.com';
const VAULT_USER_KEY = 'VAULT_USER';
const VAULT_PASS_KEY = 'VAULT_PASSWORD';

OSVars.registerMandatory(VAULT_USER_KEY, 'Vault secret management user name', OSVarType.String);
OSVars.registerMandatory(VAULT_PASS_KEY, 'Vault secret management password', OSVarType.String);
OSVars.registerMandatory(ENV_VAR_NAME, 'Twist running environment name', OSVarType.String);

OSVars.register(VAULT_URL_KEY, 'Vault secret management server', OSVarType.String, VAULT_DEFAULT_URL);

export default class Secrets {
    private static __instance: Secrets;

    private __loggedIn: boolean;

    private __secrets: any;

    private __pathToSecrets: any;

    private __vault: any;

    private constructor() {
        const options = {
            apiVersion: VAULT_API_VERSION,
            endpoint: OSVars.get(VAULT_URL_KEY),
        };

        this.__vault = require('node-vault')(options); // eslint-disable-line
        this.__loggedIn = false;
        this.__secrets = {};
        this.__pathToSecrets = {};
    }

    public static get instance(): Secrets {
        if (!Secrets.__instance) {
            Secrets.__instance = new Secrets();
        }

        return Secrets.__instance;
    }

    async login(): Promise<boolean> {
        if (this.__loggedIn) {
            return true;
        }

        try {
            const ret = await this.__vault.userpassLogin({
                username: OSVars.get(VAULT_USER_KEY).trim(),
                password: OSVars.get(VAULT_PASS_KEY).trim()
            });

            this.__vault.token = ret.auth.client_token;
            console.log(`successfully connected to Vault on ${OSVars.get(VAULT_URL_KEY)}`);
            this.__loggedIn = true;

            return true;
        } catch (ex) {
            throw new Error(
                `failed login to Vault. Check your environment config file for vault user and password: ${ex}`,
            );
        }
    }

    private __performOverride(secret: any, pathToSecret: string): any {
        const twistEnv: string = OSVars.get(ENV_VAR_NAME);
        let result = JSON.parse(JSON.stringify(secret));

        if (ENVS_VAULT_KEY in result && twistEnv in result[ENVS_VAULT_KEY]) {
            console.log(`SECRET:: overriding env secret from ${pathToSecret}/${ENVS_VAULT_KEY}/${twistEnv}`);
            const overriding: any = result[ENVS_VAULT_KEY][twistEnv];
            delete result[ENVS_VAULT_KEY];
            result = jsonOverride(result, overriding);
        }
        return result;
    }

    // ensuring secret exists + preload
    public async requireSecret(secretCategory: string, pathToSecret: string): Promise<boolean> {
        let secret: any = await this.getByPath(pathToSecret);
        secret = this.__performOverride(secret, pathToSecret);
        this.__secrets[secretCategory] = secret;
        return true;
    }

    // get a secret without specifying category - for non declarative purposes (it will be cached regardless)
    public async getByPath(pathToSecret: string): Promise<any> {
        await this.login();

        if (this.__pathToSecrets[pathToSecret]) {
            return this.__pathToSecrets[pathToSecret];
        }

        try {
            console.log(`Fetching secret from ${pathToSecret}`);
            const secret = await this.__vault.read(pathToSecret);
            // using vault v2 the below is the new way to fetch a secret
            // secret = self.__client.secrets.kv.v2.read_secret_version(path)

            if (!secret || !('data' in secret)) {
                throw new Error(`Could not find [${pathToSecret}] in Vault!`);
            }

            this.__pathToSecrets[pathToSecret] = secret.data;
            return secret.data;
        } catch (ex) {
            throw new Error(`failed reading [${pathToSecret}] from Vault! Exception details: ${ex}`);
        }
    }

    public static async get(secretCategory: string): Promise<any> {
        await Secrets.instance.login();
        return Secrets.instance.__get(secretCategory);
    }

    private __get(secretCategory: string): any {
        if (!(secretCategory in this.__secrets)) {
            throw new Error(`Unknown secret category [${secretCategory}`);
        }

        return this.__secrets[secretCategory];
    }
}
