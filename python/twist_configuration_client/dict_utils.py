from collections.abc import MutableMapping
import copy


def flatten_dict(d, parent_key="", sep="."):
    result = []
    for k, v in d.items():
        new_key = parent_key + sep + k if parent_key else k
        if isinstance(v, MutableMapping):
            result.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            result.append((new_key, v))
    return dict(result)


# behaves more or less like Object.assign in JS (see unit tests)
def override_dict(target, source):
    result = copy.deepcopy(target)

    for k, v in source.items():
        if k in result:
            if not isinstance(result[k], MutableMapping):
                result[k] = v
            else:
                result[k] = override_dict(result[k], v)
        else:
            result[k] = v

    return result
