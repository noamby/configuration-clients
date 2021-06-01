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
const yaml_1 = __importDefault(require("yaml"));
const fs_1 = __importDefault(require("fs"));
const OSVars_1 = __importStar(require("./OSVars"));
const Common_1 = require("./Common");
const Secrets_1 = __importDefault(require("./Secrets"));
const EnvConfigLoaderFactory_1 = __importDefault(require("./EnvConfigLoaderFactory"));
const EnvConfig_1 = __importDefault(require("./EnvConfig"));
const EnvConfigContext_1 = __importDefault(require("./EnvConfigContext"));
function yamlTypeToTypescript(type) {
    const conversionMap = {
        String: OSVars_1.OSVarType.String,
        Int: OSVars_1.OSVarType.Int,
        Float: OSVars_1.OSVarType.Float,
        Bool: OSVars_1.OSVarType.Boolean,
    };
    return conversionMap[type];
}
class ConfigBuilder {
    constructor(context) {
        this.__context = context;
    }
    __buildOSVars(data) {
        if (data['env-vars']) {
            Object.keys(data['env-vars']).forEach(envVarName => {
                const envVarData = data['env-vars'][envVarName];
                if (envVarData.is_mandatory) {
                    OSVars_1.default.registerMandatory(envVarName, envVarData.description, yamlTypeToTypescript(envVarData.type));
                }
                else {
                    OSVars_1.default.register(envVarName, envVarData.description, yamlTypeToTypescript(envVarData.type), envVarData.default !== undefined ? envVarData.default.toString() : undefined);
                }
            });
        }
        OSVars_1.default.initialize();
    }
    async __buildSecrets(data) {
        if (data.secrets) {
            const secretsConf = data.secrets;
            // determining the folder from which to pull the secret from ("staged" or "production")
            // actual context is the ROLE of the environment vs its name.
            // production is production, qa is qa, dev is dev but staging and all whats different than the aforementioned is staging!
            // adhering to the dynamic env plan. see Common.ts
            const secretEnv = Common_1.getContextualEnv();
            console.log(`======= Actual Env: ${secretEnv} ========`);
            if (secretsConf.required) {
                for (const [secretCategory, anySecretKey] of Object.entries(secretsConf.required)) { // eslint-disable-line
                    // all required / declared secrets must exists upon conf initialization
                    let secretKey = anySecretKey;
                    try {
                        secretKey = `secret/${secretEnv}/${secretKey}`;
                        await Secrets_1.default.instance.requireSecret(secretCategory, secretKey); // eslint-disable-line
                    }
                    catch (ex) {
                        console.log(`Failed fetching Secrets key ${secretKey}. Error: ${ex}`);
                        process.exit(1);
                    }
                }
            }
        }
    }
    async __buildConf(data) {
        var _a;
        if (data.config) {
            const confData = data.config;
            const confLoader = new EnvConfigLoaderFactory_1.default().getLoader(confData.provider);
            if (confData.version) {
                confLoader.setVersion(confData.version);
                console.log(`Using configuration v${confData.version}`);
            }
            // in case of dynamic that was forked from some base
            if (Common_1.ENV_DYNAMIC_BASE_VAR_NAME in process.env) {
                const fb = process.env[Common_1.ENV_DYNAMIC_BASE_VAR_NAME];
                EnvConfig_1.default.instance.setEnvFallback([fb]);
            }
            // injecting config loader (github, gitlab or whatever else)
            await EnvConfig_1.default.instance.setLoader(confLoader);
            // injecting context handler and context data
            EnvConfig_1.default.instance.setContextHandler(new EnvConfigContext_1.default(EnvConfig_1.default.env));
            if (this.__context) {
                Object.entries(this.__context).forEach(([k, v]) => {
                    EnvConfig_1.default.addContext(k, v);
                });
            }
            // cluster is being overridden by the actual context or if its dynamic, it is forced to dev
            if ((_a = process.env[Common_1.ENV_VAR_NAME]) === null || _a === void 0 ? void 0 : _a.startsWith('dynamic-')) {
                EnvConfig_1.default.addContext('CLUSTER', 'dev');
            }
            else {
                EnvConfig_1.default.addContext('CLUSTER', Common_1.getContextualEnv());
            }
            if (confData.categories) {
                for (const category of confData.categories) { // eslint-disable-line
                    await EnvConfig_1.default.instance.requireCategory(category.toLowerCase()); // eslint-disable-line
                }
            }
        }
    }
    async build(pathToYaml) {
        let path = pathToYaml || '';
        if (pathToYaml === '') {
            path = `${process.cwd()}/.envConfig.yml`;
        }
        console.log(`Attempting to read env config yaml from ${path}`);
        const fileData = fs_1.default.readFileSync(path, 'utf8');
        const data = yaml_1.default.parse(fileData);
        this.__buildOSVars(data);
        await this.__buildSecrets(data);
        await this.__buildConf(data);
        return true;
    }
}
exports.default = ConfigBuilder;
//# sourceMappingURL=ConfigBuilder.js.map