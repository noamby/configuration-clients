#!/usr/bin/python

#############################################################################
# HEADER                                                                    #
#############################################################################
"""
  Logger singleton for all logging purposes
"""

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################
import logging
import sys
import os
import termcolor
import traceback

#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################
FORMATTER = logging.Formatter("%(asctime)s — %(name)s — %(levelname)s — %(message)s")

log_levels_map = {"none": 0, "debug": 10, "info": 20, "warning": 30, "error": 40, "critical": 50}


# if env var is provided, console logs will get colored (warning - not to be used with log aggregator (ex. elastic)
# as it will add color control characters)
def colored(msg, color, _attrs=None):
    """
    This is a wrapper function to feature switch
    """

    if Logger.colored:
        return termcolor.colored(msg, color, attrs=_attrs)
    return msg


class Logger:
    """
    The logger class handling all application logs.
    Filtering messages based on configured log level.
    Can direct log messages to:
        Console (stdout | commandline)
        File (rotatable. Path defined via config)

    Class Public Interface:

        set_log_name
        set_app_name
        debug
        info
        warning
        error
        critical
    """

    # The singleton instance (the only instance of config in our entire running space)
    __instance = None
    colored = False

    @staticmethod
    def instance():
        """ Static access method. """
        if Logger.__instance is None:
            # the only place the Logger constructor is being called.
            Logger()
        return Logger.__instance

    def __init__(self):
        """ This is actually a private constructor. """
        # should anyone call Logger directly, make a bold statement about it.
        if Logger.__instance is not None:
            raise Exception("Logger class is a singleton!")

        Logger.__instance = self

        self.__log_name = None
        self.__app_name = None
        self.__app_version = None
        self.__file_handler = None
        self.__initialized = False
        self.__log_level = "info"
        self.__logger = None

    # the ExlInitializer registered function (initializing the logger in order after the conf)
    def initialize(self, log_level=None, colored=False):
        Logger.colored = colored

        if log_level is not None:
            self.__log_level = log_level

        try:
            self.__build_logger()
        except Exception as ex:
            print(f"failed initializing logger: {ex}")
            return False
        return True

    # calling the low level logger module along with the app preference of using it.
    def __build_logger(self):
        global log_levels_map
        self.__logger = logging.getLogger("twist-conf")

        # 1st priority to LOG_LEVEL defined in process env
        if "CONFIG_LOG_LEVEL" in os.environ:
            self.__log_level = os.environ["CONFIG_LOG_LEVEL"]

        if self.__log_level not in log_levels_map:
            raise Exception(
                f"invalid log level {self.__log_level}! Use any of: {list(log_levels_map.keys())}"
            )

        self.__logger.setLevel(log_levels_map[self.__log_level])
        self.__add_console_handler()
        self.__initialized = True
        Logger.info(f"CONFIGURATION log level: {self.__log_level}")

    def __add_console_handler(self):
        stdout_handler = logging.StreamHandler()
        stdout_handler.setFormatter(FORMATTER)
        self.__logger.addHandler(stdout_handler)

    def set_app_name(self, app_name):
        """
        Set the name of the application to be associated with all of its log records sent to log aggregator

        Arguments:
            app_name {str} -- name of app - keep short and UNIQUE!
        """
        self.__app_name = app_name

    def set_app_version(self, app_version):
        """
        Set the version info of the application to be associated with all of its log records sent to log aggregator

        Arguments:
            app_version {str} -- version of app - ie "0.3.4567"
        """
        self.__app_version = app_version

    # the main logging function
    def __log(self, msg, severity=0):
        # sanity check
        if not self.__initialized:
            msg = "Someone called logger.log before it is initialized!!!"
            print(msg)
            traceback.print_exc(file=sys.stdout)
            raise Exception(msg)

        # low level call
        self.__logger.log(severity, msg)

    @staticmethod
    def debug(msg):
        """
        The debug level related logging method

        Arguments:
            msg {str} -- message
        """
        Logger.instance().__log(colored(msg, "white"), logging.DEBUG)

    @staticmethod
    def info(msg):
        """
        The info level related logging method

        Arguments:
            msg {str} -- message
        """
        Logger.instance().__log(colored(msg, "yellow"), logging.INFO)

    @staticmethod
    def warning(msg):
        """
        The warning level related logging method

        Arguments:
            msg {str} -- message
        """
        Logger.instance().__log(colored(msg, "magenta"), logging.WARNING)

    def error(msg):
        """
        The error level related logging method

        Arguments:
            msg {str} -- message
        """
        Logger.instance().__log(colored(msg, "red"), logging.ERROR)

    def critical(msg):
        """
        The critical level related logging method

        Arguments:
            msg {str} -- message
        """
        Logger.instance().__log(colored(msg, "red", ["bold"]), logging.CRITICAL)
