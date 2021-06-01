require 'singleton'
require 'set'
require_relative 'os_vars'
require_relative 'env_config_loader_factory'
require_relative 'utils/logger'
require_relative 'utils/dict_utils'
require_relative 'common'

module TwistConf
  #############################################################################
  # GLOBALS and CONSTANTS                                                     #
  #############################################################################
  TWIST_ENV_KEY = ENV_VAR_NAME
  CONFIGURATION_BASE_KEY = 'CONFIG_BASE_ENV'
  DEFAULT_ENV_FALLBACK = ['master']

  #############################################################################
  # IMPLEMENTATION                                                            #
  #############################################################################

  OSVars.register_mandatory(TWIST_ENV_KEY, 'Running environment var for twist modules', String)
  OSVars.register(CONFIGURATION_BASE_KEY, "Configuration environment to override #{TWIST_ENV_KEY}", String)

  class EnvConfig
    include Singleton

    def initialize
      @__env = OSVars.get(TWIST_ENV_KEY)

      @__config = {}
      # to be injected:
      @__config_loader = nil
      # to be injected:
      @__context = nil
      # the below is a Set - helper to hold collection of listed (yet not loaded) categories.
      @__config_categories = Set['___dummyKey__']
      @__env_fallback_list = DEFAULT_ENV_FALLBACK
    end

    def __get_env
      @__env
    end

    def self.env
      EnvConfig.instance.__get_env
    end

    # A list of environments that if the current running environment (indicated by TWIST_ENV)
    # is not present (ex. branch does not exist) the list will provide another branch to fallback to.
    # The list will be used from first to last (["ONE", "TWO", "master"] if TWIST_ENV branch doesn't exist, then
    # ONE, then TWO, finally master

    # @param fallback_list [list] -- list of branch names to fallback to
    def set_env_fallback(fallback_list)
      @__env_fallback_list = fallback_list
    end

    # Dependency injection of a config loader that adheres to the EnvConfigLoader interface
    #
    # @param config_loader [EnvConfigLoader] -- the concrete configuration loader
    # @return [void]
    def inject_loader(config_loader = nil)
      # has anyone provided his loader implementation, use it, otherwise the factory will do.
      if config_loader.nil?
        config_loader = EnvConfigLoaderFactory.new.get_loader
      end
      env_exists = config_loader.set_env(@__env, @__env_fallback_list)
      if env_exists == false
        Log.error("could not find configuration env using the following fallback list: #{[@__env] + @__env_fallback_list}")
        exit(1)
      end

      @__config_loader = config_loader
      # for the first time, query all environment existing categories.
      __load_categories
    end

    def require_category(category)
      __load_configuration_category(category)
      @__config[category.downcase] = __load_config(category)
    end

    # Dependency injection of a config context processor that adheres to EnvConfigContext interface
    # Arguments:
    #     context_handler {EnvConfigContext} -- concrete context processor
    def set_context_handler(context_handler)
      @__context = context_handler
    end

    def __add_context(key, val)
      @__context.add(key, val)
    end

    # proxy to internal context
    def self.add_context(key, val)
      EnvConfig.instance.__add_context(key, val)
    end

    # using injected config loader to get a hold of the data
    #
    # @param category [String] - name of category file to load config from
    # @return [void]
    def __load_config(category)
      if @__config_loader.nil?
        raise 'Cannot load config without a loader (implementing EnvConfigLoader). please set loader respectively'
      end

      begin
        raw_json = @__config_loader.load(category.downcase)
        @__context.process(raw_json)
      rescue StandardError => e
        Log.error("Failed loading config for provided environment #{@__env}. Exception: #{e}")
        exit(1)
      end
    end

    def __load_categories
      categories = @__config_loader.list_categories
      categories.each do |category|
        normalized_category = category.gsub('.json', '').upcase
        __load_configuration_category(normalized_category)
      end
    end

    def __load_configuration_category(category_name)
      # _dynamic_get_func = EnvConfig.__generate_get_function(category_name)
      # create a dynamic method based on loaded category name
      # setattr(EnvConfig, category_name, _dynamic_get_func)
      # make the above added method as static so one can call also directly (eg. EnvConf.SYSTEM)
      # setattr(
      #     EnvConfig,
      #     category_name,
      #     staticmethod(getattr(EnvConfig.instance(), category_name)),
      # )

      # add the new category to the set so we know it exists
      @__config_categories.add(category_name)
      Log.debug("Configuration category #{category_name} listed")
    end

    # helper to flatten all nested keys into simple flat map
    def self.to_flat_map(category = nil)
      EnvConfig.instance.__to_flat_map(category)
    end

    def __to_flat_map(category = nil)
      data_to_flatten_out = nil
      if category.nil?
        data_to_flatten_out = @__config
      else
        data_to_flatten_out = @__config[category.downcase]
      end

      flatten_dict(data_to_flatten_out)
    end

    # helper static function for easier access (EnvConfig.get)
    def self.get(category, section = nil, key = nil, default_value = nil)
      EnvConfig.instance.__get(category, section, key, default_value)
    end

    # main config accessor function
    #
    # @param category [String] - category name (in actuality the config json file name w/o suffix and uppercased)
    # @param section [String] - name of section within the configuration Hash (json)
    # @param key [String] - name of key within section
    # @param default_value [any] - value to return when above references to config (section + key) isnt found
    #
    # @return [any] default or actual value (can be any primitive type or a Hash representing the whole config json)
    def __get(category, section = nil, key = nil, default_value = nil)
      # detecting the first access ever to this instance,
      # it requires that we set a loader and initialize current environment configuration section (json files)
      if @__config_loader.nil?
        inject_loader
      end

      # allowing caller to send uppercased category names
      category = category.downcase

      # category is being accessed for the first time, load it
      if @__config[category].nil?
        @__config[category] = __load_config(category)
      end

      # someone wants to get a hold of the entire category config
      if section.nil?
        return @__config[category]
      end

      # someone wants to get a hold of an entire section structure
      if !section.nil? && key.nil? && !@__config[category][section].nil?
        return @__config[category][section]
      end

      # missing section
      if @__config[category][section].nil?
        return default_value
      end

      # missing key in section
      if @__config[category][section][key].nil?
        return default_value
      end

      # actual config indicated data
      @__config[category][section][key]
    end
  end
end
