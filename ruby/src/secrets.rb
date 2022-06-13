require 'singleton'
require 'vault'
require_relative 'os_vars'
require_relative 'utils/logger'
require_relative 'utils/dict_utils'

module TwistConf
  #############################################################################
  # GLOBALS and CONSTANTS                                                     #
  #############################################################################

  # TODO: move to a common folder within the config clients monorepo
  VAULT_API_VERSION = 'v1'
  VAULT_URL_KEY = 'VAULT_URL'
  VAULT_DEFAULT_URL = 'https://vault.twistbioscience-staging.com'
  VAULT_USER_KEY = 'VAULT_USER'
  VAULT_PASS_KEY = 'VAULT_PASSWORD'
  ENVS_VAULT_KEY = 'envs'

  #############################################################################
  # IMPLEMENTATION                                                            #
  #############################################################################

  OSVars.register_mandatory(VAULT_USER_KEY, 'Vault secret management user name', String)
  OSVars.register_mandatory(VAULT_PASS_KEY, 'Vault secret management password', String)
  OSVars.register(VAULT_URL_KEY, 'Vault secret management server', String, VAULT_DEFAULT_URL)

  class Secrets
    include Singleton

    def initialize
      @__logged_in = false
      # secrets cache (key is category!)
      @__secrets = {}
      # secrets cache (key is path to secret)
      @__path_to_secret = {}
      @__vault = nil
    end

    # login to vault secret management server
    #
    # @return [void or throws]
    def login
      if @__logged_in
        return true
      end

      vault_url = OSVars.get(VAULT_URL_KEY)
      Log.info("connecting to vault via #{vault_url}")

      begin
        # TODO: might need to provide interface to services insisting on configuring vault client
        # Vault.configure do |config|
        #   config.timeout = 30
        #   config.ssl_timeout  = 5
        #   config.open_timeout = 5
        #   config.read_timeout = 30
        # end
        Vault.address = vault_url
        v_user = OSVars.get(VAULT_USER_KEY).strip
        v_pass = OSVars.get(VAULT_PASS_KEY).strip
        Vault.auth.userpass(v_user, v_pass)

        @__logged_in = true
      rescue StandardError => e
        raise "Failed connecting to vault on #{vault_url} error details: #{e}"
      end
    end

    def __perform_override(secret, path_to_secret)
      twist_env = OSVars.get('TWIST_ENV')
      result = nil

      if !secret[ENVS_VAULT_KEY.to_sym].nil? && !secret[ENVS_VAULT_KEY.to_sym][twist_env.to_sym].nil?
        Log.info("SECRET:: overriding env secret from #{path_to_secret}/#{ENVS_VAULT_KEY}/#{twist_env}")
        overriding = secret[ENVS_VAULT_KEY.to_sym][twist_env.to_sym]
        result = override_dict(secret, overriding)
        result.delete(ENVS_VAULT_KEY.to_sym)
      else
        result = secret
      end
      result
    end

    # ensuring secret exists + preload
    def require_secret(secret_category, path_to_secret)
      secret = get_by_path(path_to_secret)
      secret = Hash[__perform_override(secret, path_to_secret)]
      @__secrets[secret_category] = secret
      true
    rescue StandardError => e
      raise "Failed loading secret at #{secret_category}. Ex: #{e}"
    end

    # get a secret without specifying category - for non declarative purposes (it will be cached regardless)
    def get_by_path(path_to_secret)
      login
      # trying to hit internal cache
      return @__path_to_secret[path_to_secret] unless @__path_to_secret[path_to_secret].nil?

      secret_hash = nil
      # or read remote
      Vault.with_retries(Vault::HTTPConnectionError, Vault::HTTPError) do |attempt, e|
        # Note: Using puts since Rails logger won't yet be initialized
        raise "Failed fetching secret #{path_to_secret} from Vault. exception #{e} - attempt #{attempt}" if e

        Log.debug("Fetching secret from #{path_to_secret}")
        secret_hash = Vault.logical.read(path_to_secret).data
      end
      @__path_to_secret[path_to_secret] = secret_hash
      secret_hash
    end

    # helper static method for easier access (Secrets.get) without calling login
    def self.get(secret_category)
      Secrets.instance.login
      Secrets.instance.__get(secret_category)
    end

    # Main secret accessor. Uses internal cache (naive)
    #
    # @param secret_category [String]
    # @return [Hash or throws]
    def __get(secret_category)
      unless @__logged_in
        raise 'not connected to Secret-Management server.' \
              'Make sure to call connect first'
      end

      # category was not required and preloaded
      if @__secrets[secret_category].nil?
        raise "Unknown secret category [#{secret_category}]"
      end

      @__secrets[secret_category]
    end
  end
end

# see kitchen_sink.rb for better usage examples.
#
# OSVars.instance.init
# Secrets.instance.login
# sec = Secrets.get_by_path("secret/common")
# puts "common secret is... #{sec}"
