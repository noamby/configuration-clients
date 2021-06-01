"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFixedEnv = exports.getContextualEnv = exports.STAGING_BRANCH_NAME = exports.QA_BRANCH_NAME = exports.STAGING_ENV_CONTEXT_NAME = exports.QA_ENV_CONTEXT_NAME = exports.DEVELOPMENT_ENV_CONTEXT_NAME = exports.PRODUCTION_ENV_CONTEXT_NAME = exports.ENVS_VAULT_KEY = exports.ENV_VAR_NAME = exports.PRODUCTION_BRANCH_NAME = exports.ENV_DYNAMIC_BASE_VAR_NAME = exports.CONFIGURATION_BASE_KEY = void 0;
exports.CONFIGURATION_BASE_KEY = 'FORCE_CONFIG'; // os var name to override config origin
exports.ENV_DYNAMIC_BASE_VAR_NAME = 'DYNAMIC_BASE'; // os var name holding the base origin of this branch (dev / staging / qa or other)
exports.PRODUCTION_BRANCH_NAME = 'production';
exports.ENV_VAR_NAME = 'TWIST_ENV';
exports.ENVS_VAULT_KEY = 'envs';
exports.PRODUCTION_ENV_CONTEXT_NAME = 'production';
exports.DEVELOPMENT_ENV_CONTEXT_NAME = 'dev';
exports.QA_ENV_CONTEXT_NAME = 'qa';
exports.STAGING_ENV_CONTEXT_NAME = 'staging';
exports.QA_BRANCH_NAME = 'qa';
exports.STAGING_BRANCH_NAME = 'staging';
// while we might end up using a different contextual environments pipeline (for example: staging -> production or qa -> staging -> production )
// the below is a tool to defining the actual context based on branch name.add()
// Based on the current logic implemented via config-context, the below suggests that:
//
// "production" branch is production
// "dev" or "develop" branch names are dev
// "qa" branch name is qa
// "staging" is the branch name and SO ARE ALL THE REST (anything other than production, dev, develop, qa) is staging!
//
// the context is majorly used in order to determine the below functionality:
// 1. what vault name to pull secrets from (secret/staged/* vs secret/qa/* etc)
// 2. Legacy hard coded conditions refering to different env based behavior.
// 3. Cluster to apply deployment to (yet not impl)
const ENV_CONTEXT_TO_BRANCH_NAME_MAPPING = {
    [exports.PRODUCTION_ENV_CONTEXT_NAME]: [exports.PRODUCTION_BRANCH_NAME],
    [exports.DEVELOPMENT_ENV_CONTEXT_NAME]: ['dev', 'develop'],
    [exports.QA_ENV_CONTEXT_NAME]: [exports.QA_BRANCH_NAME],
    [exports.STAGING_ENV_CONTEXT_NAME]: [exports.STAGING_BRANCH_NAME],
};
const FIXED_ENVS = [
    exports.PRODUCTION_ENV_CONTEXT_NAME,
    exports.DEVELOPMENT_ENV_CONTEXT_NAME,
    'develop',
    exports.QA_ENV_CONTEXT_NAME,
    exports.STAGING_ENV_CONTEXT_NAME,
];
function isProduction() {
    return process.env[exports.ENV_VAR_NAME] === exports.PRODUCTION_BRANCH_NAME;
}
exports.default = isProduction;
function getContextualEnv() {
    const actualBranchName = process.env[exports.ENV_VAR_NAME] || '';
    // the default env context for dynamic env (non-production)
    let result = null;
    Object.entries(ENV_CONTEXT_TO_BRANCH_NAME_MAPPING).forEach(([contextName, contextRelatedBranchNames]) => {
        if (contextRelatedBranchNames.includes(actualBranchName)) {
            result = contextName;
        }
    });
    if (result !== null) {
        return result;
    }
    if (exports.ENV_DYNAMIC_BASE_VAR_NAME in process.env) {
        return process.env[exports.ENV_DYNAMIC_BASE_VAR_NAME];
    }
    return exports.DEVELOPMENT_ENV_CONTEXT_NAME;
}
exports.getContextualEnv = getContextualEnv;
function isFixedEnv(envName) {
    return FIXED_ENVS.includes(envName);
}
exports.isFixedEnv = isFixedEnv;
//# sourceMappingURL=Common.js.map