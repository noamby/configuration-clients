#!/usr/bin/env python

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################
import unittest
from mock import patch, Mock
from twist_configuration_client.env_config import EnvConfig
from twist_configuration_client.config_context_handler import EnvConfigContext
from twist_configuration_client.env_config import TWIST_ENV_KEY

from twist_configuration_client.logger import Logger
from .mock_env_loader import GithubMockEnvConfig

Logger.instance = Mock()

ENV_NAME = "dummy_env_name"
GLOBAL_CATEGORY = "GLOBAL"
GENE_CATEGORY = "GENE"
MANY_CATEGORIES = [GLOBAL_CATEGORY, GENE_CATEGORY]
SECTION_NAME = "section"
NON_EXISTING_SECTION_NAME = "non-existing-section"
NON_EXISTING_KEY_NAME = "non-existing-key"
GLOBAL_KEY_NAME_A = "globalKeyA"
GLOBAL_KEY_VALUE_A = 1
GENE_KEY_NAME_A = "geneKeyA"
GENE_KEY_VALUE_A = 1
DEFAULT_VALUE = "default-val"

MOCK_DATA = {
    GLOBAL_CATEGORY: {SECTION_NAME: {GLOBAL_KEY_NAME_A: GLOBAL_KEY_VALUE_A}},
    GENE_CATEGORY: {SECTION_NAME: {GENE_KEY_NAME_A: GENE_KEY_VALUE_A}},
}

#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################


class EnvConfigTester(unittest.TestCase):

    testee = None

    @patch.dict("os.environ", {TWIST_ENV_KEY: ENV_NAME})
    def setUp(self):
        self.testee = EnvConfig.instance()
        self.testee.set_context_handler(EnvConfigContext(ENV_NAME))
        self.conf_loader = GithubMockEnvConfig()
        self.conf_loader.set_env("dummy", [])

    def mock_conf(self, categories, data):
        self.conf_loader.mock_set_categories(categories)
        self.conf_loader.mock_set_data(data)
        self.testee.set_loader(self.conf_loader)

    def test_none_existing_section_returns_default(self):
        self.mock_conf([GLOBAL_CATEGORY], MOCK_DATA)

        expected = DEFAULT_VALUE
        actual = EnvConfig.GLOBAL(
            NON_EXISTING_SECTION_NAME, NON_EXISTING_KEY_NAME, default_value=expected
        )

        self.assertEqual(
            actual,
            expected,
            "expected get of non existing section to return a default value",
        )

    def test_none_existing_key_returns_default(self):
        self.mock_conf([GLOBAL_CATEGORY], MOCK_DATA)

        expected = DEFAULT_VALUE
        actual = EnvConfig.GLOBAL(
            SECTION_NAME, NON_EXISTING_KEY_NAME, default_value=expected
        )

        self.assertEqual(
            actual,
            expected,
            "expected get of non existing key to return a default value",
        )

    def test_none_existing_category_throws_exception(self):
        self.mock_conf([GLOBAL_CATEGORY], MOCK_DATA)

        expected = None
        actual = None
        try:
            EnvConfig.DUMMY(SECTION_NAME, NON_EXISTING_KEY_NAME, default_value=expected)
        except Exception as ex:
            actual = ex

        self.assertNotEqual(
            actual, None, "expected get of non existing category to raise an exception",
        )

    def test_existing_key_to_return_actual_value(self):
        self.mock_conf([GLOBAL_CATEGORY, GENE_CATEGORY], MOCK_DATA)

        expected = GENE_KEY_VALUE_A
        actual = EnvConfig.GENE(SECTION_NAME, GENE_KEY_NAME_A)

        self.assertEqual(
            actual, expected, "expected get of existing value to return the value",
        )

    def test_existing_key_to_return_actual_value_even_when_default_provided(self):
        self.mock_conf([GLOBAL_CATEGORY, GENE_CATEGORY], MOCK_DATA)

        expected = GENE_KEY_VALUE_A
        actual = EnvConfig.GENE(
            SECTION_NAME, GENE_KEY_NAME_A, default_value=DEFAULT_VALUE
        )

        self.assertEqual(
            actual, expected, "expected get of existing value to return the value",
        )

    def test_get_none_key_section_to_return_whole_section(self):
        self.mock_conf([GENE_CATEGORY], MOCK_DATA)

        expected = {GENE_KEY_NAME_A: GENE_KEY_VALUE_A}
        actual = EnvConfig.GENE(SECTION_NAME, None)

        self.assertEqual(
            actual, expected, "expected get of existing value to return the value",
        )

    def test_get_none_section_to_return_whole_category_config(self):
        self.mock_conf([GENE_CATEGORY], MOCK_DATA)

        expected = {SECTION_NAME: {GENE_KEY_NAME_A: GENE_KEY_VALUE_A}}
        actual = EnvConfig.GENE(None, None)

        self.assertEqual(
            actual, expected, "expected get of existing value to return the value",
        )
