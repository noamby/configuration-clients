#!/usr/bin/env python


#############################################################################
# HEADER                                                                    #
#############################################################################
"""
Abstract base class for all EnvConfigLoaders...
"""

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################

from abc import ABC, abstractmethod

#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################


class EnvConfigLoader(ABC):
    """
    A base class for any environment aware config loader.
    To be injected into EnvConfig (see EnvConfig::load_config)
    """

    def __init__(self):
        super().__init__()

    def set_env(self, environment, fallback_list):
        self._env = environment
        self._fallback_list = fallback_list
        return self.verify_env_or_fallback()

    def set_version(self, version):
        self._version = version

    @abstractmethod
    def verify_env_or_fallback(self):
        """
        This method should verify that current self._env is valid and if not,
        it should try another env provided by self._fallback_list (usually it should be only "master")
        and if none exists - it shall return False
        """
        pass

    @abstractmethod
    def load(self):
        """
        Performs the actual configuration reading (from whatever source concrete impl represents)

        Returns: dict (json)
        """
        pass

    @abstractmethod
    def list_categories(self):
        """
        This should return a list of env found categories list
        (ex. ["SYSTEM", "GLOBAL", "ECOMMERCE" ...])
        """
        pass
