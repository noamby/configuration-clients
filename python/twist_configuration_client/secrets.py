#!/usr/bin/env python

#############################################################################
# HEADER                                                                    #
#############################################################################
"""
encapsulation to secret management api using Vault
"""

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################
import hvac
from .os_vars import OSVars
from .logger import Logger
from .dict_utils import override_dict

from .common import ENV_VAR_NAME, ENVS_VAULT_KEY

# TODO: move to a common folder within the config clients monorepo
VAULT_URL_KEY = "VAULT_URL"
VAULT_DEFAULT_URL = "https://vault.twistbioscience-staging.com"
VAULT_USER_KEY = "VAULT_USER"
VAULT_PASS_KEY = "VAULT_PASSWORD"

#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################

OSVars.register_mandatory(VAULT_USER_KEY, "Vault secret management user name", str)
OSVars.register_mandatory(VAULT_PASS_KEY, "Vault secret management password", str)

OSVars.register(VAULT_URL_KEY, "Vault secret management server", str, VAULT_DEFAULT_URL)


class Secrets:
    """
    The Secret Management class serving application with credentials, keys and other secretive
    information that should not reside within the concealed configuration or environment variables.
    This is a read only implementation that can support dynamic environments, seperating dev, qa and staging
    secrets from production ones.

    Class Public Interface:

        connect
        get (already ensures call to connect)

    TODO: mem-encrypt cached elements for enhanced security
    TODO: add backward compatibility to old env secrets (qa | dev | staging)

    """

    __instance = None

    @staticmethod
    def instance():
        """ Static access method. """
        if Secrets.__instance is None:
            # the only place the Secrets constructor is being called.
            Secrets()
        return Secrets.__instance

    def __init__(self):
        if Secrets.__instance is None:
            Secrets.__instance = self
        else:
            # should anyone call Secrets directly, make a bold statement about it.
            raise Exception(
                """Secrets object already initialized - you cannot create another instance!
                (hint: use Secrets.instance()"""
            )
        # The vault client
        self.__client = None
        # secrets cache (key is category!)
        self.__cache = {}
        # secrets cache (key is path to secret)
        self.__path_to_secrets = {}

    def connect(self):
        if self.__client is not None:
            return True

        vault_url = OSVars.get(VAULT_URL_KEY)

        vault_user = OSVars.get(VAULT_USER_KEY)
        vault_pass = OSVars.get(VAULT_PASS_KEY)

        vault_pass_to_debug=vault_pass[0:2] + "*****" + vault_pass[-2:]

        Logger.info(f"connecting to vault on: {vault_url} with user: {vault_user}")
        Logger.debug(f"connecting to vault on: {vault_url} with pass: {vault_pass_to_debug}")

        try:
            self.__client = hvac.Client(url=vault_url, timeout=30)
            self.__client.auth_userpass(vault_user, vault_pass)
        except Exception as ex:
            Logger.error(f"Failed connecting to vault. error: {ex}")
            return False

        Logger.debug(f"connected to vault on {vault_url}")
        return True

    def __perform_override(self, secret, path_to_secret):
        twist_env = OSVars.get(ENV_VAR_NAME)

        if ENVS_VAULT_KEY in secret and twist_env in secret[ENVS_VAULT_KEY]:
            Logger.info(f"SECRET:: overriding env secret from {path_to_secret}/{ENVS_VAULT_KEY}/{twist_env}")
            overriding = secret[ENVS_VAULT_KEY][twist_env]
            secret[ENVS_VAULT_KEY] = None
            secret = override_dict(secret, overriding)
        return secret

    # ensuring secret exists + preload + inheritance
    def require_secret(self, secret_category, path_to_secret):

        try:
            secret = self.get_by_path(path_to_secret)
            secret = self.__perform_override(secret, path_to_secret)
            self.__cache[secret_category] = secret
            return True
        except Exception as ex:
            raise Exception(f"Failed loading secret at #{secret_category}. Ex: #{ex}")

    # get a secret without specifying category - for non declarative purposes (it will be cached regardless)
    def get_by_path(self, path_to_secret):
        self.connect()

        if path_to_secret in self.__path_to_secrets:
            return self.__path_to_secrets[path_to_secret]

        # else read remote
        if self.__client is None:
            raise Exception(
                """not connected to Secret-Management server.
                   Make sure to call connect first
                """
            )

        Logger.debug(f"Fetching secret from {path_to_secret}")

        secret = self.__client.read(path_to_secret)
        # using vault v2 the below is the new way to fetch a secret
        # secret = self.__client.secrets.kv.v2.read_secret_version(path)
        if secret is None or "data" not in secret:
            err = "Failed to read secret"
            Logger.error(err)
            raise Exception(err)

        self.__path_to_secrets[path_to_secret] = secret["data"]
        return secret["data"]

    @staticmethod
    def get(secret_category):
        """
        Get the secret (category) associated with the the provided category.
        Ex. Secrets.get("common") for common secrets in vault

        Arguments:
            category {str} -- pre required secret category (see require_secret)

        Raises:
            Exception: if SM not connected
            Exception: if SM category isn't found

        Returns:
            [dict] -- the secret
        """
        # ensures connection
        Secrets.instance().connect()
        return Secrets.instance().__get(secret_category)

    def __get(self, secret_category):
        """
        Get the secret associated with the the provided category key.
        Ex. Secrets.get("common") for common secrets in vault

        Arguments:
            category {str} -- pre required secret category (see require_secret)

        Raises:
            Exception: if SM not connected
            Exception: if SM category isn't found

        Returns:
            [dict] -- the secret
        """

        if secret_category not in self.__cache:
            raise Exception(f"Unknown secret category [{secret_category}]")

        return self.__cache[secret_category]
