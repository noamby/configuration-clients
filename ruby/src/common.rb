ENV_DYNAMIC_BASE_VAR_NAME = 'DYNAMIC_BASE' # os var name holding the base origin of this branch (dev / staging / qa or other)

PRODUCTION_ENV_CONTEXT_NAME = 'production'
DEVELOPMENT_ENV_CONTEXT_NAME = 'dev'
QA_ENV_CONTEXT_NAME = 'qa'
STAGING_ENV_CONTEXT_NAME = 'staging'
PRODUCTION_BRANCH_NAME = 'production'
QA_BRANCH_NAME = 'qa'
STAGING_BRANCH_NAME = 'staging'
ENV_VAR_NAME = 'TWIST_ENV'
ENVS_VAULT_KEY = 'envs' # key in secret json/dict refering to env overriding value

# while we might end up using a different contextual environments pipeline
# (for example: staging -> production or qa -> staging -> production )
# the below is a tool to defining the actual context based on branch name.add()
# Based on the current logic implemented via config-context, the below suggests that:
#
# "production" branch is production
# "dev" or "develop" branch names are dev
# "qa" branch name is qa
# "staging" is the branch name and SO ARE ALL THE REST (anything other than production, dev, develop, qa) is staging!
#
# the context is majorly used in order to determine the below functionality:
# 1. what vault name to pull secrets from (secret/staged/* vs secret/qa/* etc)
# 2. Legacy hard coded conditions refering to different env based behavior.
# 3. Cluster to apply deployment to (yet not impl)
ENV_CONTEXT_TO_BRANCH_NAME_MAPPING = {
  PRODUCTION_ENV_CONTEXT_NAME => [PRODUCTION_BRANCH_NAME],
  DEVELOPMENT_ENV_CONTEXT_NAME => ['dev', 'develop'],
  QA_ENV_CONTEXT_NAME => [QA_BRANCH_NAME],
  STAGING_ENV_CONTEXT_NAME => [STAGING_BRANCH_NAME]
}

FIXED_ENVS = [PRODUCTION_BRANCH_NAME, DEVELOPMENT_ENV_CONTEXT_NAME, 'develop', QA_BRANCH_NAME, STAGING_BRANCH_NAME]

def is_production
  ENV[ENV_VAR_NAME] == PRODUCTION_BRANCH_NAME
end

def get_contextual_env
  actual_branch_name = ENV[ENV_VAR_NAME]

  # if TWIST_ENV is fixed than its fixed
  # for dynamic env, the fallback contextual env is determined below using DYNAMIC_BASE
  ENV_CONTEXT_TO_BRANCH_NAME_MAPPING.each do |context_name, context_related_branch_names|
    if context_related_branch_names.include?(actual_branch_name)
      return context_name
    end
  end

  if !ENV[ENV_DYNAMIC_BASE_VAR_NAME].nil?
    return ENV[ENV_DYNAMIC_BASE_VAR_NAME]
  end

  # default env context for all dynamic branches
  DEVELOPMENT_ENV_CONTEXT_NAME
end
