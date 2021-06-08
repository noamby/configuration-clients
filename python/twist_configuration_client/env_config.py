#!/usr/bin/env python


#############################################################################
# HEADER                                                                    #
#############################################################################
"""
properties configuration loader Singleton class with data overriding,
type conversions and defaults
"""

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################

import os
import sys
from .env_conf_loader_factory import EnvConfigLoaderFactory
from .os_vars import OSVars
from .logger import Logger
from .common import ENV_VAR_NAME
from .dict_utils import flatten_dict

#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################
TWIST_ENV_KEY = ENV_VAR_NAME
CONFIGURATION_BASE_KEY = "CONFIG_BASE_ENV"
DEFAULT_ENV_FALLBACK = ["master"]


OSVars.register_mandatory(
    TWIST_ENV_KEY, "Running environment var for twist modules", str
)
OSVars.register(
    CONFIGURATION_BASE_KEY,
    f"Configuration environment to override {TWIST_ENV_KEY}",
    str,
)


class EnvConfigMetaClass(type):
    env_conf_categories_loaded = False

    def __getattr__(self, attr):
        """
        This function is called everytime EnvConf is being accessed (using dot operator)
        It is purposed to allow first time load of config categories that are dynamically translated into static methods
        (example, one would call EnvConfig.SYSTEM where the SYSTEM static method is generated within the load_config_categories)
        """
        # past initial loading of conf categories, this function is useless.
        if EnvConfigMetaClass.env_conf_categories_loaded is True:
            return

        # checking whether EnvConfig already has the requested attribute
        has_attr = True
        try:
            EnvConfig.__getattribute__(EnvConfig, attr)
        except AttributeError:
            has_attr = False

        # check whether accessed attribute exists after categories loading
        if not has_attr:
            EnvConfig.instance().set_loader()

            new_dynamic_func = None
            try:
                new_dynamic_func = EnvConfig.__getattribute__(EnvConfig, attr)
            except AttributeError:
                pass

            # accessed attribute is unknown (not a dynamically loaded category as function)
            if new_dynamic_func is None:
                raise AttributeError(f"EnvConfig has no attribute '{attr}'")

            return new_dynamic_func.__func__


class EnvConfig(metaclass=EnvConfigMetaClass):
    """
    Environment aware configuration reader.
    Provides an easy access to reading config values. It uses defaults and it is running-environment aware
    meaning, when running in env X it will pull/load the central configuration related to env X only.

    Config file structure is expected in the JSON form. Please ** ADHERE ** to the below format when defining your configs,
    it is going to help in making a more organized, contextual configuration scheme.
        ------- gene.json --------
        {
          "section1": {
            "key1": 1,
            "key2": "val2",
            "key3", true,
            "key4": [1,2,3]
          }
        }

    Configuration is divided into categories. In case of git/github based config each category is represented using a json file in
    the config repo. Once EnvConfig is instantiated it will list the repo files and generate dynamic getters.

    Some common usage examples for a config with global and gene categories:

        EnvConfig.get("gene", "section1", "key1", "some_default") # yields 1
        EnvConfig.GENE("section1", "key2", "some_default") # yields "val2"
        EnvConfig.GENE("section1", "key3") # yields True
        EnvConfig.GENE("section1", "key4") # yields [ 1, 2, 3 ]
        EnvConfig.GENE("section1", "key5", "some_default") # yields "some_default"
        EnvConfig.GLOBAL("sectionX") # yields a dict having keys & values of "sectionX"

    # TODO: support nested object accessor such as:
        EnvConfig.SHIPPING("person/address/city", "name")
    """

    TWIST_ENV_KEY = TWIST_ENV_KEY

    # The singleton instance (the only instance of EnvConfig in our entire running space)
    __instance = None

    @staticmethod
    def instance():
        """ Static access method of our singleton """
        if EnvConfig.__instance is None:
            # the only place the EnvConfig ctor is being called.
            EnvConfig()
        return EnvConfig.__instance

    def __init__(self):
        """
        This is actually a private ctor.
        - Preventing multi instantiation (by exception)
        - initializing singleton instance to self
        - initializing member variables with defaults
        """
        # should anyone call EnvConfig directly, make a bold statement about it.
        if EnvConfig.__instance is not None:
            raise Exception("EnvConfig class is a singleton!")

        if TWIST_ENV_KEY not in os.environ:
            raise Exception(f"Cannot run configuration without {TWIST_ENV_KEY}")

        EnvConfig.__instance = self
        self.__env = os.environ[TWIST_ENV_KEY]

        # someone is overriding the running environment to pull config from somewhere else
        if CONFIGURATION_BASE_KEY in os.environ:
            self.__env = os.environ[CONFIGURATION_BASE_KEY]
            Logger.info(
                f"**** !!! PULLING CONFIGURATION from {self.__env} instead of {os.environ[TWIST_ENV_KEY]} because overriding {CONFIGURATION_BASE_KEY} is provided"
            )
        self.__config_json = {}
        # to be injected:
        self.__config_loader = None
        # to be injected:
        self.__context = None
        # the below is a Set - helper to hold collection of listed (yet not loaded) categories.
        self.__config_categories = {"___dummyKey__"}
        self.__env_fallback_list = DEFAULT_ENV_FALLBACK

    @staticmethod
    def env():
        return EnvConfig.instance().__env

    def set_env_fallback(self, fallback_list):
        """
        A list of environments that if the current running environment (indicated by TWIST_ENV)
        is not present (ex. branch does not exist) the list will provide another branch to fallback to.
        The list will be used from first to last (["ONE", "TWO", "master"] if TWIST_ENV branch doesn't exist, then ONE, then TWO, finally master

        Arguments:
            fallback_list {[list]} -- list of branch names to fallback to
        """
        self.__env_fallback_list = fallback_list

    def set_loader(self, config_loader=None):
        """
        Dependency injection of a config loader that adheres to the EnvConfigLoader interface

        Arguments:
            config_loader {EnvConfigLoader} -- the concrete configuration loader
        """
        if config_loader is None:
            config_loader = EnvConfigLoaderFactory().get_loader()

        env_exists = config_loader.set_env(self.__env, self.__env_fallback_list)
        if not env_exists:
            Logger.error(
                f"could not find configuration env using the following fallback list: {[self.__env] + self.__env_fallback_list}"
            )
            sys.exit(1)

        Logger.debug(f"Config loader has been set to: {config_loader}")

        self.__config_loader = config_loader
        # for the first time, query all environment existing categories.
        self.__list_categories()

        EnvConfigMetaClass.env_conf_categories_loaded = True

    def set_context_handler(self, context_handler):
        """
        Dependency injection of a config context processor that adheres to EnvConfigContext interface

        Arguments:
            context_handler {EnvConfigContext} -- concrete context processor
        """
        self.__context = context_handler

    @staticmethod
    def add_context(key, val):
        EnvConfig.instance().__context.add(key, val)

    def __load_config(self, category):
        """
        using injected config loader to get a hold of the data
        """

        if self.__config_loader is None:
            raise Exception(
                "Cannot load config without a loader (implementing EnvConfigLoader). please call set_loader respectively"
            )

        try:
            raw_json = self.__config_loader.load(category.lower())
            return self.__context.process(raw_json)
        except Exception as ex:
            Logger.error(
                f"Failed loading config for provided environment {self.__env}. Exception: {ex}"
            )
            sys.exit(1)

    def require_category(self, category):
        EnvConfig.load_configuration_category(category)
        self.__config_json[category.lower()] = self.__load_config(category)

    def __list_categories(self):
        categories = self.__config_loader.list_categories()
        for category in categories:
            normalized_category = category.replace(".json", "").upper()
            EnvConfig.load_configuration_category(normalized_category)

    @staticmethod
    def __generate_get_function(func_name):
        def _func(self, section, key, default_value=None):
            return self.__get(func_name.lower(), section, key, default_value)

        return _func

    @staticmethod
    def load_configuration_category(category_name):
        _dynamic_get_func = EnvConfig.__generate_get_function(category_name)
        # create a dynamic method based on loaded category name
        setattr(EnvConfig, category_name, _dynamic_get_func)
        # make the above added method as static so one can call also directly (eg. EnvConf.SYSTEM)
        setattr(
            EnvConfig,
            category_name,
            staticmethod(getattr(EnvConfig.instance(), category_name)),
        )

        # add the new category to the set so we know it exists
        EnvConfig.instance().__config_categories.add(category_name)
        Logger.debug(f"Configuration category {category_name} listed")

    def __getattr__(self, key):
        if key not in self.__config_categories:
            raise Exception(f"Unknown configuration category {key} or method name")
        return super().__getattr__(key)

    @staticmethod
    def to_flat_map(category=None):
        return EnvConfig.instance().__to_flat_map(category)

    def __to_flat_map(self, category=None):
        """
        This method will convert all configuration entries to a flat map so
        nested entries are keyed in the following manner:
        "category.section.key.sub_key": value

        (or if category is provided to this method, the category part will be omitted)
        "section.key.sub_key": value

        Keyword Arguments:
            category {string} -- flatten only this provided category or else flatten the entire loaded config (default: {None})
        """
        data_to_flatten_out = self.__config_json

        if category is not None:
            data_to_flatten_out = self.__config_json[category]

        return flatten_dict(data_to_flatten_out)

    @staticmethod
    def get(category, section, key, default_value=None):
        """
        Main configuration accessor.
        Get configuration by section, section + key or entire config.

        Arguments:
            category {string} -- name of category for the queried config
            section {string} -- name of section / object name
            key {string} -- name of key under provided section

        Keyword Arguments:
            default_value {any} -- default value to use when section/key isn't present in loaded config data (default: {None})

        Returns:
            any -- value associated with section/key. Can be as simple as string or int or as complex as a whole dict
        """
        return EnvConfig.instance().__get(category.lower(), section, key, default_value)

    def __get(self, category, section, key, default_value=None):
        """
        Main configuration accessor.
        Get configuration by section, section + key or entire config.

        Arguments:
        category {string} -- name of category for the queried config
        section {string} -- name of section / object name
        key {string} -- name of key under provided section

        Keyword Arguments:
        default_value {any} -- default value to use when section/key isn't present in loaded config data (default: {None})

        Returns:
        any -- value associated with section/key. Can be as simple as string or int or as complex as a whole dict
        """
        # detecting the first access ever to this instance,
        # it requires that we set a loader and initialize current environment configuration section (json files)
        if self.__config_loader is None:
            self.set_loader()

        # category is being accessed for the first time, load it
        if category not in self.__config_json:
            self.__config_json[category] = self.__load_config(category)

        # someone wants to get a hold of the entire category config
        if section is None:
            return self.__config_json[category]

        # someone wants to get a hold of an entire section structure
        if (
            section is not None
            and key is None
            and section in self.__config_json[category]
        ):
            return self.__config_json[category][section]

        # missing section
        if section not in self.__config_json[category]:
            return default_value

        # missing key in section
        if key not in self.__config_json[category][section]:
            return default_value

        # actual config indicated data
        return self.__config_json[category][section][key]
