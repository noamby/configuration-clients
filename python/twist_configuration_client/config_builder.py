#!/usr/bin/env python

import yaml
import os
import logging
from .os_vars import OSVars
from .env_config import EnvConfig
from .config_context_handler import EnvConfigContext
from .env_conf_loader_factory import EnvConfigLoaderFactory
from .secrets import Secrets
from .logger import Logger
from .common import get_contextual_env

yaml_type_to_python = {"String": str, "Bool": bool, "Int": int, "Float": float}


class ConfigBuilder:
    def __init__(self, context):
        self.__context = context

    def __build_os_vars(self, data):
        for (env_var_name, env_var_data) in data["env-vars"].items():
            # print(f"var name: {env_var_name}, var data: {env_var_data}")
            if "is_mandatory" in env_var_data and env_var_data["is_mandatory"] is True:
                OSVars.register_mandatory(
                    env_var_name,
                    env_var_data["description"],
                    yaml_type_to_python[env_var_data["type"]],
                )
            else:
                default_val = None
                if "default" in env_var_data:
                    default_val = env_var_data["default"]

                OSVars.register(
                    env_var_name,
                    env_var_data["description"],
                    yaml_type_to_python[env_var_data["type"]],
                    default_val,
                )
        # finally
        OSVars.initialize()

    def __build_conf(self, data):
        if "config" not in data:
            return

        conf_data = data["config"]

        conf_provider_name = None
        if "provider" in conf_data:
            conf_provider_name = conf_data["provider"]

        conf_loader = EnvConfigLoaderFactory().get_loader(conf_provider_name)

        conf_version = 1
        if "version" in conf_data:
            conf_version = conf_data["version"]
            Logger.info(f"Using configuration v{conf_version}")

        conf_loader.set_version(conf_version)

        if "parent_environments" in conf_data:
            EnvConfig.instance().set_env_fallback(conf_data["parent_environments"])

        # injecting config loader (github, gitlab or whatever else)
        EnvConfig.instance().set_loader(conf_loader)

        # injecting context handler and context data
        EnvConfig.instance().set_context_handler(EnvConfigContext(EnvConfig.env()))
        if self.__context is not None:
            for k, v in self.__context.items():
                EnvConfig.add_context(k, v)

        if "categories" not in conf_data:
            return

        for category in conf_data["categories"]:
            EnvConfig.instance().require_category(category)

    def __build_secrets(self, data):
        if "secrets" not in data:
            return

        secrets_conf = data["secrets"]

        if "required" in secrets_conf:
            # preping the subfolder to fetch secret from (staged / production)
            # actual context is the ROLE of the environment vs its name.
            # production is production, qa is qa, dev is dev but staging and all whats different than the aforementioned is staging!
            # adhering to the dynamic env plan. see common.py
            secret_env = get_contextual_env()

            Logger.debug(f"======= Actual Env: {secret_env} ========")

            secret_path = None
            for secret_category in secrets_conf["required"]:
                try:
                    secret_key = secrets_conf["required"][secret_category]
                    secret_path = f"secret/{secret_env}/{secret_key}"
                    Secrets.instance().require_secret(secret_category, secret_path)
                except Exception as e:
                    error_message = (
                        f"Failed fetching Secrets key {secret_path}. Error: {e}"
                    )
                    Logger.error(error_message)
                    raise Exception(error_message)

    def __build_logger(self, data):
        logging.getLogger("requests").setLevel(logging.WARNING)

        log_level = None
        colored = False

        if "logger" in data:
            if "level" in data["logger"]:
                log_level = data["logger"]["level"]
            if "colored" in data["logger"]:
                colored = data["logger"]["colored"]

        Logger.instance().initialize(log_level, colored)

    def build(self, path_to_env_yaml=None):
        path = path_to_env_yaml
        if path_to_env_yaml is None:
            path = os.getcwd() + "/.envConfig.yml"

        print(f"Attempting to read env config yaml from {path}")
        env_file = open(path, "r")
        data = yaml.load(env_file, Loader=yaml.Loader)
        # print(f"yaml data is {data}")

        self.__build_logger(data)

        self.__build_os_vars(data)

        self.__build_secrets(data)

        self.__build_conf(data)
