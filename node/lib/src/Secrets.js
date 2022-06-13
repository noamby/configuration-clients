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
Object.defineProperty(exports, "__esModule", { value: true });
const OSVars_1 = __importStar(require("./OSVars"));
const jsonUtils_1 = require("./utils/jsonUtils");
const Common_1 = require("./Common");
// TODO: move to a common folder within the config clients monorepo
const VAULT_API_VERSION = 'v1';
const VAULT_URL_KEY = 'VAULT_URL';
const VAULT_DEFAULT_URL = 'https://vault.twistbioscience-staging.com';
const VAULT_USER_KEY = 'VAULT_USER';
const VAULT_PASS_KEY = 'VAULT_PASSWORD';
OSVars_1.default.registerMandatory(VAULT_USER_KEY, 'Vault secret management user name', OSVars_1.OSVarType.String);
OSVars_1.default.registerMandatory(VAULT_PASS_KEY, 'Vault secret management password', OSVars_1.OSVarType.String);
OSVars_1.default.registerMandatory(Common_1.ENV_VAR_NAME, 'Twist running environment name', OSVars_1.OSVarType.String);
OSVars_1.default.register(VAULT_URL_KEY, 'Vault secret management server', OSVars_1.OSVarType.String, VAULT_DEFAULT_URL);
class Secrets {
    constructor() {
        const options = {
            apiVersion: VAULT_API_VERSION,
            endpoint: OSVars_1.default.get(VAULT_URL_KEY),
        };
        this.__vault = require('node-vault')(options); // eslint-disable-line
        this.__loggedIn = false;
        this.__secrets = {};
        this.__pathToSecrets = {};
    }
    static get instance() {
        if (!Secrets.__instance) {
            Secrets.__instance = new Secrets();
        }
        return Secrets.__instance;
    }
    async login() {
        if (this.__loggedIn) {
            return true;
        }
        try {
            const ret = await this.__vault.userpassLogin({
                username: OSVars_1.default.get(VAULT_USER_KEY).trim(),
                password: OSVars_1.default.get(VAULT_PASS_KEY).trim()
            });
            this.__vault.token = ret.auth.client_token;
            console.log(`successfully connected to Vault on ${OSVars_1.default.get(VAULT_URL_KEY)}`);
            this.__loggedIn = true;
            return true;
        }
        catch (ex) {
            throw new Error(`failed login to Vault. Check your environment config file for vault user and password: ${ex}`);
        }
    }
    __performOverride(secret, pathToSecret) {
        const twistEnv = OSVars_1.default.get(Common_1.ENV_VAR_NAME);
        let result = JSON.parse(JSON.stringify(secret));
        if (Common_1.ENVS_VAULT_KEY in result && twistEnv in result[Common_1.ENVS_VAULT_KEY]) {
            console.log(`SECRET:: overriding env secret from ${pathToSecret}/${Common_1.ENVS_VAULT_KEY}/${twistEnv}`);
            const overriding = result[Common_1.ENVS_VAULT_KEY][twistEnv];
            delete result[Common_1.ENVS_VAULT_KEY];
            result = jsonUtils_1.jsonOverride(result, overriding);
        }
        return result;
    }
    // ensuring secret exists + preload
    async requireSecret(secretCategory, pathToSecret) {
        let secret = await this.getByPath(pathToSecret);
        secret = this.__performOverride(secret, pathToSecret);
        this.__secrets[secretCategory] = secret;
        return true;
    }
    // get a secret without specifying category - for non declarative purposes (it will be cached regardless)
    async getByPath(pathToSecret) {
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
        }
        catch (ex) {
            throw new Error(`failed reading [${pathToSecret}] from Vault! Exception details: ${ex}`);
        }
    }
    static async get(secretCategory) {
        await Secrets.instance.login();
        return Secrets.instance.__get(secretCategory);
    }
    __get(secretCategory) {
        if (!(secretCategory in this.__secrets)) {
            throw new Error(`Unknown secret category [${secretCategory}`);
        }
        return this.__secrets[secretCategory];
    }
}
exports.default = Secrets;
//# sourceMappingURL=Secrets.js.map