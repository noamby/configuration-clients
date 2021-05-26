require 'yaml'
require_relative 'utils/logger'
require_relative 'os_vars'
require_relative 'env_config_loader_factory'
require_relative 'env_config'
require_relative 'secrets'
require_relative 'config_context_handler'
require_relative 'common'

module TwistConf
  #############################################################################
  # GLOBALS and CONSTANTS                                                     #
  #############################################################################

  YAML_TYPE_TO_RUBY = {
    'String' => String,
    'Bool' => TrueClass,
    'Int' => Integer,
    'Float' => Float
  }

  #############################################################################
  # IMPLEMENTATION                                                            #
  #############################################################################

  class ConfigBuilder
    def initialize(context)
      @__context = context
    end

    def __build_os_vars(data)
      if data['env-vars'].nil?
        return
      end

      data['env-vars'].each do |env_var_name, env_var_data|
        # puts "var name: #{env_var_name}, var data: #{env_var_data}"
        if env_var_data['is_mandatory'] == true
          OSVars.register_mandatory(
            env_var_name,
            env_var_data['description'],
            YAML_TYPE_TO_RUBY[env_var_data['type']]
          )
        else
          default_val = env_var_data['default']

          # registration expects string value (for when it comes from the real env as opposed to yaml)
          unless default_val.nil?
            default_val = default_val.to_s
          end

          OSVars.register(env_var_name, env_var_data['description'], YAML_TYPE_TO_RUBY[env_var_data['type']], default_val)
        end
      end
    end

    def __build_conf(data)
      if data['config'].nil?
        return
      end

      conf_data = data['config']
      conf_provider_name = conf_data['provider']
      factory = EnvConfigLoaderFactory.new
      conf_loader = factory.get_loader(conf_provider_name)

      conf_version = 1
      if conf_data['version']
        conf_version = conf_data['version']
        Log.info("Using configuration v#{conf_version}")
      end

      conf_loader.set_version(conf_version)

      # in case of dynamic that was forked from some base
      if !ENV[ENV_DYNAMIC_BASE_VAR_NAME].nil?
        EnvConfig.instance.set_env_fallback([ENV[ENV_DYNAMIC_BASE_VAR_NAME]])
      end

      # injecting config loader (github, gitlab or whatever else)
      EnvConfig.instance.inject_loader(conf_loader)

      # injecting context handler and context data
      EnvConfig.instance.set_context_handler(EnvConfigContext.new(EnvConfig.env))
      @__context.each do |k, v|
        EnvConfig.add_context(k, v)
      end

      # cluster is being overridden by the actual context or if its dynamic, it is forced to dev
      if ENV[ENV_VAR_NAME].match?(/^dynamic-/)
        EnvConfig.add_context('CLUSTER', 'dev')
      else
        EnvConfig.add_context('CLUSTER', get_contextual_env)
      end

      if conf_data['categories'].nil?
        return
      end

      conf_data['categories'].each do |category|
        EnvConfig.instance.require_category(category)
      end
    end

    def __build_secrets(data)
      if data['secrets'].nil?
        return
      end

      secrets_conf = data['secrets']

      return unless secrets_conf['required']

      # actual context is the ROLE of the environment vs its name.
      # production is production, qa is qa, dev is dev but staging and
      # all whats different than the aforementioned is staging!
      # adhering to the dynamic env plan. see common.rb
      secret_env = get_contextual_env

      Log.debug("======= Actual Env: #{secret_env} ========")

      secret_key = ''
      secrets_conf['required'].each do |secret_element|
        # rubocop:disable Style/RedundantBegin
        begin
          secret_key = "secret/#{secret_env}/#{secret_element[1]}"
          secret_category = secret_element[0]
          Secrets.instance.require_secret(secret_category, secret_key)
        rescue StandardError => e
          Log.error("Failed fetching Secrets key from #{secret_key}. Error: #{e}")
          exit(1)
        end
        # rubocop:enable Style/RedundantBegin
      end
    end

    def __build_logger(data)
      log_level = nil

      if data['logger']
        if data['logger']['level']
          log_level = data['logger']['level']
        end
        # not supported at the moment
        # if data['logger']['colored']
        #   colored = data['logger']['colored']
        # end
      end

      Log.instance.init(log_level)
    end

    def build(path_to_env_yaml = nil)
      actual_path = path_to_env_yaml
      if path_to_env_yaml.nil?
        actual_path = Dir.getwd + '/.envConfig.yml'
      end

      puts "Attempting to read env config yaml from #{actual_path}"
      env_file = File.open(actual_path)
      file_data = env_file.read
      env_file.close
      data = YAML.safe_load(file_data)

      # puts "yaml data is #{data}"

      __build_logger(data)

      __build_os_vars(data)
      OSVars.instance.init

      __build_secrets(data)

      __build_conf(data)
    end
  end
end
