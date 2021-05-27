from twist_configuration_client.abstract_env_conf_loader import EnvConfigLoader


class GithubMockEnvConfig(EnvConfigLoader):
    """
    Github environment aware config loader - mock.
    Implements EnvConfigLoader in order to be injected into EnvConfig
    """

    def __init__(self):
        super().__init__()

    def mock_set_categories(self, categories):
        self.__categories = categories

    def mock_set_data(self, data):
        self.__data = data

    def verify_env_or_fallback(self):
        return True

    def list_categories(self):
        return self.__categories

    def load(self, category):
        try:
            return self.__data[category.upper()]

        except Exception as ex:
            print(
                f'Failed loading and parsing config json content from branch/env "{self._env}"\nexception: {ex}'
            )
            return {}
