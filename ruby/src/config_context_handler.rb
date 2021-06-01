#############################################################################
# HEADER                                                                    #
#############################################################################

# Base class and implementation of config context

#############################################################################
# IMPORT MODULES                                                            #
#############################################################################
require_relative 'utils/logger'
require_relative 'common'

#############################################################################
# IMPLEMENTATION                                                            #
#############################################################################

CONTEXT_DECLARATION_KEY = '$context'
TEMPLATE_REGEX = /(?:[^{]*)({{)(\s*[\w_\-\.]+\s*)(}}).*/

# validation of a dictionary -
# making sure no templated token is left unreplaced in any of the json value leafs.
# Arguments:
#     json {dict} -- the validated dictionary
# Raises:
#     Exception: describing the unreplaced template
# Returns:
#     [bool] -- False - all ok, Exception otherwise
def validate_no_template_left(json)
  found = false
  json.values.each do |v|
    if v.is_a?(Hash)
      found = validate_no_template_left(v)
    elsif v.is_a?(String)
      found = !v.match(TEMPLATE_REGEX).nil?
    end

    raise("could not find a context data for templated value: #{v}") unless !found
  end
  false
end

class EnvConfigContext
  def initialize(env)
    @__env = env
    @__app_context_data = {}

    # Adding "TWIST_ENV" to context
    add(ENV_VAR_NAME, env)

    # Adding "ENV_NAME" as context variable referencing the actual env name (prefix "dynamic-" excluded)
    env_name_without_dynamic_part = env.gsub(/^dynamic-/, '')
    add('ENV_NAME', env_name_without_dynamic_part)

    if !ENV[ENV_DYNAMIC_BASE_VAR_NAME].nil?
      add('DYNAMIC_BASE', ENV[ENV_DYNAMIC_BASE_VAR_NAME])
    end

    # Adding "ENV_NAME_FOR_DOMAIN" as context variable referencing the env name (prefix "dynamic-" excluded)
    # to be used when referencing ingress like mailer-my-dyna-env.twistbioscience-dev.com
    env_name_for_domain = "-#{env_name_without_dynamic_part}"
    if !env.match?(/^dynamic-/)
      env_name_for_domain = ''
    end

    add('ENV_NAME_FOR_DOMAIN', env_name_for_domain)
  end

  def add(key, value)
    if @__app_context_data[key]
      Log.debug("Context data [#{key}] is being overriden from #{@__app_context_data[key]} to #{value}")
    end

    Log.debug("Adding context: #{key} => #{value}")
    @__app_context_data[key] = value
  end

  def __normalize(returned_json)
    # deleting the context declaration from the to-be-consumed config
    if returned_json[CONTEXT_DECLARATION_KEY]
      returned_json[CONTEXT_DECLARATION_KEY].clear
      returned_json.delete(CONTEXT_DECLARATION_KEY)
    end

    # ensuring no value is left with templated place holder (ie ' {{ key }} ')
    # the below will raise an exception
    validate_no_template_left(returned_json)

    returned_json
  end

  def __process_context(json_data, context_data)
    # traverse the json to look for {{ token }} templates to substitute with value from context
    json_data.each do |k, v|
      if v.is_a?(Hash)
        json_data[k] = __process_context(v, context_data)
      elsif v.is_a?(String)
        # attempt extracting the templated token from the provided string
        match = v.match(TEMPLATE_REGEX)

        while match
          # the template token lays inside the match.
          # this is sensitive assumption but it is protected by unit tests! (the regex)
          keyword = match.captures[1].strip

          # skip token if context data does not provide value (it will fail later in normalization)
          break if context_data[keyword].nil?

          # for non str value the config data s replaced as is with the provided context data (even if its dict!)
          # otherwise (string) is replaced "123{{ token  }}789" => "123456789" given context_data["token"] = "456"
          if context_data[keyword].is_a?(String)
            the_val = context_data[keyword]
            template = match.captures.join
            with_template = json_data[k]
            json_data[k] = json_data[k].gsub(template, the_val)
            # trying to find a next token if exists (ex. "Hello {{ FIRST_NAME }} {{ LAST_NAME }}")
            match = json_data[k].match(TEMPLATE_REGEX)
            # want to print once per cycle
            Log.debug("replacing config key #{k} value from #{with_template} to #{json_data[k]}") if !match
          else
            Log.debug("replacing config key #{k} value from #{json_data[k]} to #{context_data[keyword]}")
            json_data[k] = context_data[keyword]
            # assuming no composite var/token in a non str value
            break
          end
        end
      end
    end
    json_data
  end

  def process(config_json)
    if config_json.nil? || config_json.empty?
      return config_json
    end

    # ensuring manipulation of copied version, never original
    json_copy = Marshal.load(Marshal.dump(config_json))

    current_context = {}

    # per context for:
    # env_name: { .. } AND/OR
    # somthing: { ... }
    #
    # look for the context key in data (which is affected by TWIST_ENV but any app provided context keys when
    # calling to add method above) - when found - this is the context vlaues to use when parsing the rest
    # of the json
    context_decleration = json_copy[CONTEXT_DECLARATION_KEY] || {}
    context_decleration.each do |context_decl_key, context_data|
      # rubocop:disable Lint/UnusedBlockArgument
      @__app_context_data.each do |context_data_key, v|
        # puts "\n ===> context_decl_key: #{context_decl_key} context_data: " \
        # "#{context_data} context_data_key: #{context_data_key} v: #{v}"

        if context_decl_key.downcase == v.downcase
          # merge (spread) context_data into current_context
          context_data.each do |ck, cv|
            current_context[ck] = cv
          end
          break
        end
      end
      # rubocop:enable Lint/UnusedBlockArgument
    end

    # merging app data context into context found in config json context
    @__app_context_data.each do |app_context_key, context_data|
      # the cluster key override is allowed
      if app_context_key != 'CLUSTER' && !current_context[app_context_key].nil?
        raise "#{app_context_key} is already defined by config $context, use another key name"
      end

      current_context[app_context_key] = context_data
    end

    Log.debug("detected config context to use: #{current_context}")

    # replace the templated valued from chosen context
    processed_json = __process_context(json_copy, current_context)

    __normalize(processed_json)
  end
end
