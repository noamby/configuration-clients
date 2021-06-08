#!/usr/bin/env python

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################
import unittest

from twist_configuration_client.dict_utils import override_dict


#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################


class DictUtilsTester(unittest.TestCase):
    def test_simple_add(self):
        a = {"a": 1}
        b = {"b": 2}
        expected = {"a": 1, "b": 2}

        c = override_dict(a, b)
        self.assertEqual(
            c,
            expected,
            "expected to find a simple additive override ",
        )

    def test_simple_override(self):
        a = {"a": 1}
        b = {"a": 2}
        expected = {"a": 2}

        c = override_dict(a, b)
        self.assertEqual(
            c,
            expected,
            "expected to find a simple override ",
        )

    def test_nested_add(self):
        a = {"a": 1, "n": {"x": 1}}
        b = {"n": {"y": 2}}
        expected = {"a": 1, "n": {"x": 1, "y": 2}}

        c = override_dict(a, b)
        self.assertEqual(
            c,
            expected,
            "expected to find a nested additive override ",
        )

    def test_nested_override(self):
        a = {"a": 1, "n": {"x": 1}}
        b = {"n": {"x": 2}}
        expected = {"a": 1, "n": {"x": 2}}

        c = override_dict(a, b)
        self.assertEqual(
            c,
            expected,
            "expected to find a nested override ",
        )

    def test_nested_list_override(self):
        a = {"a": 1, "n": {"x": ['a', 'b']}}
        b = {"n": {"x": [1, 2, 3]}}
        expected = {"a": 1, "n": {"x": [1, 2, 3]}}

        c = override_dict(a, b)
        self.assertEqual(
            c,
            expected,
            "expected to find a nested_list_override ",
        )

    def test_nested_list_override_and_add_mix(self):
        a = {"a": 1, "n": {"x": ['a', 'b']}}
        b = {"b": 2, "n": {"x": [1, 2, 3], "z": "abc"}}
        expected = {"a": 1, "b": 2, "n": {"x": [1, 2, 3], "z": "abc"}}

        c = override_dict(a, b)
        self.assertEqual(
            c,
            expected,
            "expected to find a list_override_and_add_mix ",
        )
