import YAML from 'yaml';

import fs from 'fs';
import OSVars, { OSVarType } from './OSVars';
import { getContextualEnv, ENV_DYNAMIC_BASE_VAR_NAME, ENV_VAR_NAME } from './Common';
import Secrets from './Secrets';
import EnvConfigLoaderFactory from './EnvConfigLoaderFactory';
import EnvConfig from './EnvConfig';
import EnvConfigContext from './EnvConfigContext';

function yamlTypeToTypescript(type: string): OSVarType {
    const conversionMap: any = {
        String: OSVarType.String,
        Int: OSVarType.Int,
        Float: OSVarType.Float,
        Bool: OSVarType.Boolean,
    };

    return conversionMap[type];
}

export default class ConfigBuilder {
    private __context: any;

    constructor(context: any) {
        this.__context = context;
    }

    private __buildOSVars(data: any): void {
        if (data['env-vars']) {
            Object.keys(data['env-vars']).forEach(envVarName => {
                const envVarData: any = data['env-vars'][envVarName];
                if (envVarData.is_mandatory) {
                    OSVars.registerMandatory(envVarName, envVarData.description, yamlTypeToTypescript(envVarData.type));
                } else {
                    OSVars.register(
                        envVarName,
                        envVarData.description,
                        yamlTypeToTypescript(envVarData.type),
                        envVarData.default !== undefined ? envVarData.default.toString() : undefined,
                    );
                }
            });
        }
        OSVars.initialize();
    }

    private async __buildSecrets(data: any): Promise<void> {
        if (data.secrets) {
            const secretsConf = data.secrets;
            // determining the folder from which to pull the secret from ("staged" or "production")
            // actual context is the ROLE of the environment vs its name.
            // production is production, qa is qa, dev is dev but staging and all whats different than the aforementioned is staging!
            // adhering to the dynamic env plan. see Common.ts
            const secretEnv = getContextualEnv();
            console.log(`======= Actual Env: ${secretEnv} ========`);

            if (secretsConf.required) {
                for (const [secretCategory, anySecretKey] of Object.entries(secretsConf.required)) { // eslint-disable-line
                    // all required / declared secrets must exists upon conf initialization
                    let secretKey: any = anySecretKey;
                    try {
                        secretKey = `secret/${secretEnv}/${secretKey}`;
                        await Secrets.instance.requireSecret(secretCategory, secretKey); // eslint-disable-line
                    } catch (ex) {
                        console.log(`Failed fetching Secrets key ${secretKey}. Error: ${ex}`);
                        process.exit(1);
                    }
                }
            }
        }
    }

    private async __buildConf(data: any): Promise<void> {
        if (data.config) {
            const confData = data.config;

            const confLoader = new EnvConfigLoaderFactory().getLoader(confData.provider);

            if (confData.version) {
                confLoader.setVersion(confData.version);
                console.log(`Using configuration v${confData.version}`);
            }

            // in case of dynamic that was forked from some base
            if (ENV_DYNAMIC_BASE_VAR_NAME in process.env) {
                const fb: any = process.env[ENV_DYNAMIC_BASE_VAR_NAME];
                EnvConfig.instance.setEnvFallback([fb]);
            }

            // injecting config loader (github, gitlab or whatever else)
            await EnvConfig.instance.setLoader(confLoader);

            // injecting context handler and context data
            EnvConfig.instance.setContextHandler(new EnvConfigContext(EnvConfig.env));
            if (this.__context) {
                Object.entries(this.__context).forEach(([k, v]) => {
                    EnvConfig.addContext(k, v);
                });
            }

            // cluster is being overridden by the actual context or if its dynamic, it is forced to dev
            if (process.env[ENV_VAR_NAME]?.startsWith('dynamic-')) {
                EnvConfig.addContext('CLUSTER', 'dev');
            } else {
                EnvConfig.addContext('CLUSTER', getContextualEnv());
            }

            if (confData.categories) {
                for (const category of confData.categories) { // eslint-disable-line
                    await EnvConfig.instance.requireCategory(category.toLowerCase()); // eslint-disable-line
                }
            }
        }
    }

    public async build(pathToYaml?: string): Promise<boolean> {
        let path: string = pathToYaml || '';
        if (pathToYaml === '') {
            path = `${process.cwd()}/.envConfig.yml`;
        }

        console.log(`Attempting to read env config yaml from ${path}`);
        const fileData = fs.readFileSync(path, 'utf8');
        const data = YAML.parse(fileData);

        this.__buildOSVars(data);
        await this.__buildSecrets(data);
        await this.__buildConf(data);
        return true;
    }
}
