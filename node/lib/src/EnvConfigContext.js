"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNoTemplateLeft = exports.CONTEXT_DECLARATION_KEY = void 0;
const Common_1 = require("./Common");
exports.CONTEXT_DECLARATION_KEY = '$context';
const TEMPLATE_REGEX = /(?:[^{]*)({{)(\s*[\w_\-.]+\s*)(}}).*/;
/**
 * json validation -
   making sure no templated token is left unreplaced in any of the json value leafs.
 * @param json
 * @returns boolean
 */
function validateNoTemplateLeft(json) {
    let found = false;
    Object.values(json).forEach((v) => {
        if (typeof v === 'object') {
            found = validateNoTemplateLeft(v);
        }
        else {
            found = TEMPLATE_REGEX.exec(v) !== null;
        }
        if (found) {
            throw new Error(`could not find a context data for templated value: ${v}`);
        }
    });
    return false;
}
exports.validateNoTemplateLeft = validateNoTemplateLeft;
class EnvConfigContext {
    constructor(env) {
        // app_context_data is context added by application to dynamic use in conjunction with conf json $context
        this.__appContextData = {};
        this.__env = env;
        // Adding "TWIST_ENV" to context
        this.add(Common_1.ENV_VAR_NAME, this.__env);
        // Adding "ENV_NAME" as context variable referencing the env name(prefix "dynamic-" excluded)
        // to be used when referencing ingress like mailer - my - dyna - env.twistbioscience - dev.com
        const envNameWithoutDynamicPart = env.replace(/^dynamic-/, '');
        this.add('ENV_NAME', envNameWithoutDynamicPart);
        if (Common_1.ENV_DYNAMIC_BASE_VAR_NAME in process.env) {
            this.add('DYNAMIC_BASE', process.env[Common_1.ENV_DYNAMIC_BASE_VAR_NAME]);
        }
        // Adding "ENV_NAME_FOR_DOMAIN" as context variable referencing the env name (prefix "dynamic-" excluded)
        // to be used when referencing ingress like mailer-my-dyna-env.twistbioscience-dev.com
        let envNameForDomain = `-${envNameWithoutDynamicPart}`;
        if (!this.__env.startsWith('dynamic-')) {
            envNameForDomain = '';
        }
        this.add('ENV_NAME_FOR_DOMAIN', envNameForDomain);
    }
    /**
     * set contextual data that can be used for config context processing
     * @param key name of context data
     * @param value value of context data. can be str int or anything dictated in context declaration
     */
    add(key, value) {
        if (this.__appContextData[key] !== undefined) {
            console.warn(`Context data [${key}] is being overridden from ${this.__appContextData[key]} to ${value}`);
        }
        const theValue = value;
        console.log(`Adding context: ${key} => ${theValue}`);
        this.__appContextData[key] = theValue;
    }
    __normalize(returnedJson) {
        const theReturnedJson = returnedJson;
        // deleting the context declaration from the to-be-consumed config
        if (returnedJson[exports.CONTEXT_DECLARATION_KEY] !== undefined) {
            delete theReturnedJson[exports.CONTEXT_DECLARATION_KEY];
        }
        // ensuring no value is left with templated place holder(ie " {{ key }} ")
        // the below will raise an exception
        validateNoTemplateLeft(theReturnedJson);
        return theReturnedJson;
    }
    __processContext(jsonData, contextData) {
        const theJsonData = jsonData;
        // traverse the jsonData to look for {{ token }} templates to substitute with value from contextData
        // eslint-disable-next-line no-restricted-syntax
        for (const [k, v] of Object.entries(theJsonData)) {
            if (typeof v === 'object') {
                theJsonData[k] = this.__processContext(v, contextData);
            }
            else if (typeof v === 'string') {
                // attempt extracting the templated token from the provided string
                let match = TEMPLATE_REGEX.exec(v);
                // looping in order to find and convert multiple tokens (ex. "Hello {{ FIRST_NAME }} {{ LAST_NAME }}")
                while (match !== null) {
                    // Logger.debug(f"for v: {v} match: {match} and groups: {match.groups()}")
                    // ignore. values that are not templated
                    if (!match || match.length !== 4) {
                        continue; // eslint-disable-line no-continue
                    }
                    // the template token lays inside the match.
                    // this is sensitive assumption but it is protected by unit tests! (the regex)
                    const keyword = match[2].trim();
                    // skip token if context data does not provide value (it will fail later in normalization)
                    if (contextData[keyword] === undefined) {
                        break; // eslint-disable-line no-continue
                    }
                    // for non str value the config data s replaced as is with the provided context data(even if its dict!)
                    // otherwise(string) is replaced "123{{ token  }}789" => "123456789" given contextData["token"] = "456"
                    if (typeof contextData[keyword] !== 'string') {
                        console.log(`replacing config key ${k} value from ${theJsonData[k]} to ${contextData[keyword]}`);
                        theJsonData[k] = contextData[keyword];
                        break; // assuming no composite var/token in a non str value
                    }
                    else {
                        const theVal = contextData[keyword];
                        const template = [match[1], match[2], match[3]].join('');
                        const withTemplate = theJsonData[k];
                        theJsonData[k] = theJsonData[k].replace(template, theVal);
                        // trying to find a next token if exists (ex. "Hello {{ FIRST_NAME }} {{ LAST_NAME }}")
                        match = TEMPLATE_REGEX.exec(theJsonData[k]);
                        // want to print once per cycle
                        if (match === null) {
                            console.log(`replacing config key ${k} value from ${withTemplate} to ${theJsonData[k]}`);
                        }
                    }
                }
            }
        }
        return theJsonData;
    }
    process(configJson) {
        // ensuring manipulation of copied version, never original
        const jsonCopy = JSON.parse(JSON.stringify(configJson));
        let currentContext = {};
        // per context for:
        // env_name: { ..} AND / OR
        // something: { ... }
        //
        // look for the context key in data(which is affected by TWIST_ENV but any app provided context keys when
        // calling to add method above) - when found - this is the context vlaues to use when parsing the rest
        // of the json
        const contextDeclaration = jsonCopy[exports.CONTEXT_DECLARATION_KEY] || {};
        // eslint-disable-next-line no-restricted-syntax
        for (const [contextDeclKey, contextData] of Object.entries(contextDeclaration)) {
            // eslint-disable-next-line no-restricted-syntax
            for (const v of Object.values(this.__appContextData)) {
                // console.log(
                //     `\n ===> context_decl_key: ${contextDeclKey} context_data: ${JSON.stringify(
                //         contextData,
                //     )} context_data_key: ${contextDataKey} v: ${v}`,
                // );
                const contextValue = v;
                if (contextDeclKey.toLowerCase() === contextValue.toString().toLowerCase()) {
                    const anyContextData = contextData;
                    currentContext = {
                        ...currentContext,
                        ...anyContextData,
                    };
                    break;
                }
            }
        }
        // merging app data context into context found in config json context
        // eslint-disable-next-line no-restricted-syntax
        for (const [appContextKey, contextData] of Object.entries(this.__appContextData)) {
            // the cluster key override is allowed
            if (appContextKey !== 'CLUSTER' && currentContext[appContextKey] !== undefined) {
                throw new Error(`${appContextKey} is already defined by config $context, use another key name`);
            }
            currentContext[appContextKey] = contextData;
        }
        console.log(`detected config context to use: ${JSON.stringify(currentContext)}`);
        // replace the templated values from chosen context
        const processedJson = this.__processContext(jsonCopy, currentContext);
        return this.__normalize(processedJson);
    }
}
exports.default = EnvConfigContext;
//# sourceMappingURL=EnvConfigContext.js.map