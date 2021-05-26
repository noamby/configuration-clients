import axios from 'axios';
import JSON5 from 'json5';
import IEnvConfigLoader from './IEnvConfigLoader';
import Secrets from './Secrets';
import { getContextualEnv } from './Common';

// TODO: should be moved higher up the monorepo to be included by all polyglot clients
const TWIST_GITHUB_ACCOUNT = 'Twistbioscience';
const CONFIGURATION_REPO = 'configuration';
const GIT_CONF_TOKEN_KEY = 'GIT_CONFIG_TOKEN';

export default class GithubEnvConfigLoader implements IEnvConfigLoader {
    private __environment: string;

    private __version: number;

    private __fallbackList: Array<string>;

    constructor() {
        this.__environment = '';
        this.__fallbackList = [];
        this.__version = 1;
    }

    public async setEnv(environment: string, fallback: Array<string>): Promise<boolean> {
        this.__environment = environment;
        this.__fallbackList = fallback;
        return this.__verifyEnvOrFallback();
    }

    public setVersion(version: number): void {
        this.__version = version;
    }

    public getVersion(): number {
        return this.__version;
    }

    /**
     * for lazy loading single category configuration
     * @param category name to load
     */
    public async load(category: string): Promise<any> {
        try {
            // get raw data from repo file that ends with json
            const raw = await this.__getFileContent(`${category}.json`, this.__environment);
            // console.log(`RAW DATA: ${JSON.stringify(raw)}`);

            // seems that axios will convert response to json if json content is pure
            // but will return text if JSON5 (with comments) are detected
            if (typeof raw === 'object') {
                return raw;
            }

            return JSON5.parse(raw);
        } catch (ex) {
            throw new Error(
                `Failed loading and parsing config json content from branch/env "${this.__environment}"\nexception: ${ex}`,
            );
        }
    }

    /**
     * get list of json files in repo and return list of their names
     */
    public async listCategories(): Promise<Array<string>> {
        return this.__getRepoFileList();
    }

    private static async __getGithubToken(): Promise<string> {
        let githubToken;

        // first chance to env var...
        if (process.env[GIT_CONF_TOKEN_KEY]) {
            githubToken = process.env[GIT_CONF_TOKEN_KEY];
        } else {
            // otherwise fetch from secrets
            const common = await Secrets.get('common');
            githubToken = common[GIT_CONF_TOKEN_KEY];
        }

        if (githubToken === undefined || githubToken.trim() === '') {
            throw new Error(
                `Missing git configuration repo access token. See Vault::secret/common or set env var ${GIT_CONF_TOKEN_KEY}`,
            );
        }

        return githubToken;
    }

    private async __verifyEnvOrFallback(): Promise<boolean> {
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
                res = await axios.get(githubApiURL, { headers }); // eslint-disable-line 
            } catch (ex) {
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
            } else {
                console.log(
                    `Unknown response code ${res.status} while trying to verify branch ${candidateEnv} on ${CONFIGURATION_REPO}`,
                );
                return false;
            }
        }
        return false;
    }

    /**
     * fetch repo file list
     * return only upper cased names of files without extention
     */
    private async __getRepoFileList(): Promise<Array<string>> {
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
            res = await axios.get(githubApiURL, { headers });
        } catch (ex) {
            throw new Error(`Failed fetching ${githubApiURL}. Ex: ${ex}`);
        }

        // console.log(`AXIOS RESP: ${JSON.stringify(res?.data)}`)

        // very unlikely however to stay sane...
        if (!res.data || res.data.length === 0) {
            throw new Error(`configuration repo at branch ${this.__environment} is empty!`);
        }

        // return list of uppercased name of JSON files only without the .json part (eg. ["SYSTEM", "GENES"])
        return res.data
            .filter((e: any) => e.name.endsWith('.json') && e.path.indexOf('/') === -1)
            .map((e: any) => e.name.replace('.json', '').toUpperCase());
    }

    /**
     * fetch file content from repo
     * @param filePath
     * @param branchName
     */
    private async __getFileContent(filePath: string, branchName: string): Promise<any> {
        const githubToken = await GithubEnvConfigLoader.__getGithubToken();

        let folder = '';
        // in version 2, files reside in folder respective to fixed environment (dev, qa staging etc)
        if (this.__version === 2) {
            folder = `${this.__environment}/`;
            if (this.__environment.startsWith('dynamic-')) {
                folder = `${getContextualEnv()}/`;
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
            res = await axios.get(githubApiURL, { headers });
        } catch (ex) {
            throw new Error(`Failed fetching ${githubApiURL}. Ex: ${ex}`);
        }

        // console.log(`AXIOS RESP: ${JSON.stringify(res?.data)}`)
        return res.data;
    }
}
