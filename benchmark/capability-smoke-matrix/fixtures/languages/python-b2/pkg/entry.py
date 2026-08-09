from .helpers import python_b2_helper as imported_helper
from .helpers import PythonB2Base


def python_b2_entry():
    return imported_helper()


class PythonB2Child(PythonB2Base):
    pass
