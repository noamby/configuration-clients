"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const json5_1 = __importDefault(require("json5"));
const Secrets_1 = __importDefault(require("./Secrets"));
const Common_1 = require("./Common");
// TODO: should be moved higher up the monorepo to be included by all polyglot clients
const TWIST_GITHUB_ACCOUNT = 'Twistbioscience';
const CONFIGURATION_REPO = 'configuration';
const GIT_CONF_TOKEN_KEY = 'GIT_CONFIG_TOKEN';
class GithubEnvConfigLoader {
    constructor() {
        this.__environment = '';
        this.__fallbackList = [];
        this.__version = 1;
    }
    async setEnv(environment, fallback) {
        this.__environment = environment;
        this.__fallbackList = fallback;
        return this.__verifyEnvOrFallback();
    }
    setVersion(version) {
        this.__version = version;
    }
    getVersion() {
        return this.__version;
    }
    /**
     * for lazy loading single category configuration
     * @param category name to load
     */
    async load(category) {
        try {
            // get raw data from repo file that ends with json
            const raw = await this.__getFileContent(`${category}.json`, this.__environment);
            // console.log(`RAW DATA: ${JSON.stringify(raw)}`);
            // seems that axios will convert response to json if json content is pure
            // but will return text if JSON5 (with comments) are detected
            if (typeof raw === 'object') {
                return raw;
            }
            return json5_1.default.parse(raw);
        }
        catch (ex) {
            throw new Error(`Failed loading and parsing config json content from branch/env "${this.__environment}"\nexception: ${ex}`);
        }
    }
    /**
     * get list of json files in repo and return list of their names
     */
    async listCategories() {
        return this.__getRepoFileList();
    }
    static async __getGithubToken() {
        let githubToken;
        // first chance to env var...
        if (process.env[GIT_CONF_TOKEN_KEY]) {
            githubToken = process.env[GIT_CONF_TOKEN_KEY];
        }
        else {
            // otherwise fetch from secrets
            const common = await Secrets_1.default.get('common');
            githubToken = common[GIT_CONF_TOKEN_KEY];
        }
        if (githubToken === undefined || githubToken.trim() === '') {
            throw new Error(`Missing git configuration repo access token. See Vault::secret/common or set env var ${GIT_CONF_TOKEN_KEY}`);
        }
        return githubToken;
    }
    async __verifyEnvOrFallback() {
        const githubToken = await GithubEnvConfigLoader.__getGithubToken();
        const envList = [this.__environment, ...this.__fallbackList];
        for (const candidateEnv of envList) { // eslint-disable-line
            //  API reference: https://developer.github.com/v3/repos/contents/
            const githubApiURL = `https://api.github.com/repos/${TWIST_GITHUB_ACCOUNT}/${CONFIGURATION_REPO}/branches/${candidateEnv}`;
            const headers = {
                'Accept-Encoding': 'gzip, deflate',
                Accept: 'application/json',
                Authorization: `token ${githubToken}`,
            };
            console.log(`Verifying branch ${candidateEnv} in ${CONFIGURATION_REPO} repo...`);
            let res;
            try {
                res = await axios_1.default.get(githubApiURL, { headers }); // eslint-disable-line 
            }
            catch (ex) {
                console.log(`Failed fetching configuration repo branches ${githubApiURL}. Ex: ${ex}`);
                res = ex.response;
                // process.exit(0)
            }
            if (res.status === 200) {
                console.log(`branch ${candidateEnv} is verified. Using configuration from ${candidateEnv}`);
                this.__environment = candidateEnv;
                return true;
            }
            if (res.status === 404) {
                console.log(`${candidateEnv} does not exist on ${CONFIGURATION_REPO} trying next...`);
            }
            else {
                console.log(`Unknown response code ${res.status} while trying to verify branch ${candidateEnv} on ${CONFIGURATION_REPO}`);
                return false;
            }
        }
        return false;
    }
    /**
     * fetch repo file list
     * return only upper cased names of files without extention
     */
    async __getRepoFileList() {
        const githubToken = await GithubEnvConfigLoader.__getGithubToken();
        //  API reference: https://developer.github.com/v3/repos/contents/
        const githubApiURL = `https://api.github.com/repos/${TWIST_GITHUB_ACCOUNT}/${CONFIGURATION_REPO}/contents/?ref=${this.__environment}`;
        const headers = {
            'Accept-Encoding': 'gzip, deflate',
            Accept: 'application/json',
            Authorization: `token ${githubToken}`,
        };
        console.log(`Fetching file list from ${githubApiURL} on branch/env "${this.__environment}"`);
        let res;
        try {
            res = await axios_1.default.get(githubApiURL, { headers });
        }
        catch (ex) {
            throw new Error(`Failed fetching ${githubApiURL}. Ex: ${ex}`);
        }
        // console.log(`AXIOS RESP: ${JSON.stringify(res?.data)}`)
        // very unlikely however to stay sane...
        if (!res.data || res.data.length === 0) {
            throw new Error(`configuration repo at branch ${this.__environment} is empty!`);
        }
        // return list of uppercased name of JSON files only without the .json part (eg. ["SYSTEM", "GENES"])
        return res.data
            .filter((e) => e.name.endsWith('.json') && e.path.indexOf('/') === -1)
            .map((e) => e.name.replace('.json', '').toUpperCase());
    }
    /**
     * fetch file content from repo
     * @param filePath
     * @param branchName
     */
    async __getFileContent(filePath, branchName) {
        const githubToken = await GithubEnvConfigLoader.__getGithubToken();
        let folder = '';
        // in version 2, files reside in folder respective to fixed environment (dev, qa staging etc)
        if (this.__version === 2) {
            folder = `${this.__environment}/`;
            if (this.__environment.startsWith('dynamic-')) {
                folder = `${Common_1.getContextualEnv()}/`;
            }
        }
        const githubApiURL = `https://raw.githubusercontent.com/${TWIST_GITHUB_ACCOUNT}/${CONFIGURATION_REPO}/${branchName}/${folder}${filePath}`;
        const headers = {
            'Accept-Encoding': 'gzip, deflate',
            Accept: '*/*',
            Authorization: `token ${githubToken}`,
        };
        console.log(`Fetching category file from ${githubApiURL} on branch/env "${this.__environment}"`);
        let res;
        try {
            res = await axios_1.default.get(githubApiURL, { headers });
        }
        catch (ex) {
            throw new Error(`Failed fetching ${githubApiURL}. Ex: ${ex}`);
        }
        // console.log(`AXIOS RESP: ${JSON.stringify(res?.data)}`)
        return res.data;
    }
}
exports.default = GithubEnvConfigLoader;
//# sourceMappingURL=GithubEnvConfigLoader.js.map