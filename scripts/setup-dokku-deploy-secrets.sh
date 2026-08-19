#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY="jellydn/hermes-hub"
readonly DOKKU_KEY_NAME="hermes-hub-github-actions"
readonly ACL_PLUGIN_GIT="https://github.com/dokku-community/dokku-acl.git"
readonly REQUIRED_DEPLOY_SECRETS=(
	DOKKU_HOST
	DOKKU_SSH_PRIVATE_KEY
	DOKKU_APP
	DOKKU_SSH_KNOWN_HOSTS
	DATABASE_URL
	ENCRYPTION_KEY
	BETTER_AUTH_SECRET
	BETTER_AUTH_URL
)

dokku_host="${DOKKU_HOST:-}"
dokku_port="${DOKKU_SSH_PORT:-22}"
dokku_app="${DOKKU_APP:-hermes-hub}"
admin_user="${DOKKU_ADMIN_USER:-root}"
admin_key="${DOKKU_ADMIN_KEY:-}"
deploy_key="${DOKKU_DEPLOY_KEY:-$HOME/.ssh/hermes-hub-dokku-deploy}"
database_url="${DOKKU_DATABASE_URL:-}"
encryption_key="${DOKKU_ENCRYPTION_KEY:-}"
better_auth_secret="${DOKKU_BETTER_AUTH_SECRET:-}"
better_auth_url="${DOKKU_BETTER_AUTH_URL:-}"
database_url_file=""
encryption_key_file=""
better_auth_secret_file=""
better_auth_url_file=""
rerun_id=""
watch_run=true

usage() {
	cat <<'EOF'
Usage: scripts/setup-dokku-deploy-secrets.sh --host HOST [options]

Create and install a dedicated Dokku deployment key, then configure the
GitHub Actions secrets for jellydn/hermes-hub. HOST may instead be supplied in
DOKKU_HOST. Private key material and app config secrets are never printed
and must not be passed on the command line.

Options:
  --host HOST          Dokku hostname or IP address (required)
  --port PORT          SSH port (default: 22)
  --app NAME           Dokku app name written to the DOKKU_APP secret
                       (default: hermes-hub)
  --database-url-file PATH
                       File containing DATABASE_URL (not a local .env URL)
  --encryption-key-file PATH
                       File containing ENCRYPTION_KEY
  --better-auth-secret-file PATH
                       File containing BETTER_AUTH_SECRET
  --better-auth-url-file PATH
                       File containing BETTER_AUTH_URL (https:// origin)
  --admin-user USER    Bootstrap SSH user able to run Dokku commands (default: root)
  --admin-key PATH     Existing private key for bootstrap SSH access
  --deploy-key PATH    Dedicated key path to create/reuse
                       (default: ~/.ssh/hermes-hub-dokku-deploy)
  --rerun RUN_ID       After setup, start a new dokku Deploy workflow. RUN_ID
                       must be a completed failed Deploy run. GitHub reruns
                       reuse that run's original secret snapshot, so this
                       dispatches a fresh workflow instead.
  --no-watch           Do not monitor the dispatched workflow after starting it
  -h, --help           Show this help

If the Dokku app already exists, missing app config secrets are copied
from `dokku config:get` and never printed. Local DATABASE_URL /
ENCRYPTION_KEY / BETTER_AUTH_* environment variables are ignored so a
developer .env cannot overwrite production. Use DOKKU_DATABASE_URL,
DOKKU_ENCRYPTION_KEY, DOKKU_BETTER_AUTH_SECRET, and DOKKU_BETTER_AUTH_URL
or the *-file options instead.

The GitHub Actions key is restricted to this app with dokku-acl (installed
if missing). Host keys from ssh-keyscan are stored as DOKKU_SSH_KNOWN_HOSTS
so CI does not trust the host on first connect.

Environment alternatives: DOKKU_HOST, DOKKU_SSH_PORT, DOKKU_APP,
DOKKU_DATABASE_URL, DOKKU_ENCRYPTION_KEY, DOKKU_BETTER_AUTH_SECRET,
DOKKU_BETTER_AUTH_URL, DOKKU_ADMIN_USER, DOKKU_ADMIN_KEY, and
DOKKU_DEPLOY_KEY.
EOF
}

fail() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but was not found in PATH."
}

github_secret_names() {
	gh secret list --repo "$REPOSITORY" --json name --jq '.[].name'
}

require_github_secrets() {
	local names missing name
	names="$(github_secret_names)"
	missing=()
	for name in "$@"; do
		if ! printf '%s\n' "$names" | grep -Fxq "$name"; then
			missing+=("$name")
		fi
	done
	if ((${#missing[@]} > 0)); then
		fail "${missing[0]} secret is required. Missing GitHub Actions secrets: ${missing[*]}."
	fi
}

missing_github_secrets() {
	local names name
	names="$(github_secret_names)"
	for name in "$@"; do
		if ! printf '%s\n' "$names" | grep -Fxq "$name"; then
			printf '%s\n' "$name"
		fi
	done
}

set_github_secret() {
	local name="$1"
	local value="$2"
	[[ -n "$value" ]] || return 0
	printf 'Setting %s for %s (contents hidden)...\n' "$name" "$REPOSITORY"
	printf '%s' "$value" | gh secret set "$name" --repo "$REPOSITORY"
}

remote_app_config() {
	ssh "${admin_ssh_options[@]}" "$admin_user@$dokku_host" \
		dokku config:get "$dokku_app" "$1" 2>/dev/null | tr -d '\r\n' || true
}

expand_home() {
	printf '%s' "${1/#\~/$HOME}"
}

read_secret_file() {
	local label="$1"
	local path="$2"
	path="$(expand_home "$path")"
	[[ -f "$path" && -r "$path" ]] || fail "$label is not a readable file: $path"
	tr -d '\r\n' <"$path"
}

file_mode() {
	# GNU stat accepts -f as --file-system, so do not probe BSD syntax first.
	case "$(uname -s)" in
		Linux) stat -c %a "$1" ;;
		*) stat -f %Lp "$1" ;;
	esac
}

ensure_private_key_mode() {
	local key="$1"
	local mode
	chmod 600 "$key"
	mode="$(file_mode "$key")"
	[[ "$mode" == "600" || "$mode" == "400" ]] || \
		fail "Deploy key $key must be mode 600 or 400 (got $mode)."
}

admin_ssh() {
	ssh "${admin_ssh_options[@]}" "$admin_user@$dokku_host" "$@"
}

plugin_enabled() {
	admin_ssh dokku plugin:list 2>/dev/null | awk '{ print $1 }' | grep -Fxq "$1"
}

ensure_app_acl() {
	if ! plugin_enabled acl; then
		printf 'Installing dokku-acl so the GitHub Actions key cannot push other apps...\n'
		admin_ssh dokku plugin:install "$ACL_PLUGIN_GIT" acl >/dev/null
	fi
	printf 'Restricting SSH key %s to app %s...\n' "$DOKKU_KEY_NAME" "$dokku_app"
	admin_ssh dokku acl:add "$dokku_app" "$DOKKU_KEY_NAME" >/dev/null
	admin_ssh dokku acl:list "$dokku_app" 2>/dev/null | grep -Fxq "$DOKKU_KEY_NAME" || \
		fail "dokku-acl did not list $DOKKU_KEY_NAME for $dokku_app."
}

capture_known_hosts() {
	local scan
	scan="$(ssh-keyscan -p "$dokku_port" "$dokku_host" 2>/dev/null || true)"
	[[ -n "$scan" ]] || fail "ssh-keyscan returned no host keys for $dokku_host."
	printf '%s\n' "$scan" | grep -Eq 'ssh-(ed25519|rsa)|ecdsa-sha2-' || \
		fail "ssh-keyscan output for $dokku_host did not contain a host key."
	printf 'Setting DOKKU_SSH_KNOWN_HOSTS for %s (contents hidden)...\n' "$REPOSITORY"
	printf '%s\n' "$scan" | gh secret set DOKKU_SSH_KNOWN_HOSTS --repo "$REPOSITORY"
}

validate_optional_secrets() {
	if [[ -n "$database_url" ]]; then
		[[ "$database_url" =~ ^postgres(ql)?:// ]] || \
			fail "DATABASE_URL must be a postgres:// or postgresql:// URL."
	fi
	if [[ -n "$encryption_key" ]]; then
		((${#encryption_key} >= 16)) || fail "ENCRYPTION_KEY must be at least 16 characters."
		[[ "$encryption_key" != *[[:space:]]* ]] || fail "ENCRYPTION_KEY must not contain whitespace."
	fi
	if [[ -n "$better_auth_secret" ]]; then
		((${#better_auth_secret} >= 16)) || fail "BETTER_AUTH_SECRET must be at least 16 characters."
	fi
	if [[ -n "$better_auth_url" ]]; then
		[[ "$better_auth_url" =~ ^https:// ]] || fail "BETTER_AUTH_URL must start with https://."
	fi
}

while (($# > 0)); do
	case "$1" in
		--host)
			(($# >= 2)) || fail "--host requires a value."
			dokku_host="$2"
			shift 2
			;;
		--port)
			(($# >= 2)) || fail "--port requires a value."
			dokku_port="$2"
			shift 2
			;;
		--app)
			(($# >= 2)) || fail "--app requires a Dokku app name."
			dokku_app="$2"
			shift 2
			;;
		--database-url-file)
			(($# >= 2)) || fail "--database-url-file requires a path."
			database_url_file="$2"
			shift 2
			;;
		--encryption-key-file)
			(($# >= 2)) || fail "--encryption-key-file requires a path."
			encryption_key_file="$2"
			shift 2
			;;
		--better-auth-secret-file)
			(($# >= 2)) || fail "--better-auth-secret-file requires a path."
			better_auth_secret_file="$2"
			shift 2
			;;
		--better-auth-url-file)
			(($# >= 2)) || fail "--better-auth-url-file requires a path."
			better_auth_url_file="$2"
			shift 2
			;;
		--database-url | --encryption-key | --better-auth-secret | --better-auth-url)
			fail "$1 is not accepted because it exposes secrets in process arguments and shell history. Use ${1}-file PATH or the matching DOKKU_* environment variable."
			;;
		--admin-user)
			(($# >= 2)) || fail "--admin-user requires a value."
			admin_user="$2"
			shift 2
			;;
		--admin-key)
			(($# >= 2)) || fail "--admin-key requires a path."
			admin_key="$2"
			shift 2
			;;
		--deploy-key)
			(($# >= 2)) || fail "--deploy-key requires a path."
			deploy_key="$2"
			shift 2
			;;
		--rerun)
			(($# >= 2)) || fail "--rerun requires a GitHub Actions run ID."
			rerun_id="$2"
			shift 2
			;;
		--no-watch)
			watch_run=false
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			fail "Unknown option: $1"
			;;
	esac
done

require_command gh
require_command ssh
require_command ssh-keygen
require_command ssh-keyscan

[[ -n "$dokku_host" ]] || fail "Dokku host is required. Pass --host HOST or set DOKKU_HOST."
[[ "$dokku_host" =~ ^[a-zA-Z0-9._:-]+$ ]] || fail "Dokku host contains unsupported characters."
[[ "$dokku_app" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "Dokku app name must be lowercase letters, digits, and hyphens."
[[ "$admin_user" =~ ^[a-zA-Z0-9._-]+$ ]] || fail "Admin user contains unsupported characters."
[[ "$dokku_port" =~ ^[0-9]+$ ]] || fail "SSH port must contain only digits."
(( ${#dokku_port} <= 5 )) || fail "SSH port must be between 1 and 65535."
dokku_port=$((10#$dokku_port))
((dokku_port >= 1 && dokku_port <= 65535)) || fail "SSH port must be between 1 and 65535."

[[ -z "$database_url_file" ]] || database_url="$(read_secret_file "--database-url-file" "$database_url_file")"
[[ -z "$encryption_key_file" ]] || encryption_key="$(read_secret_file "--encryption-key-file" "$encryption_key_file")"
[[ -z "$better_auth_secret_file" ]] || better_auth_secret="$(read_secret_file "--better-auth-secret-file" "$better_auth_secret_file")"
[[ -z "$better_auth_url_file" ]] || better_auth_url="$(read_secret_file "--better-auth-url-file" "$better_auth_url_file")"

admin_key="$(expand_home "$admin_key")"
deploy_key="$(expand_home "$deploy_key")"
deploy_public_key="$deploy_key.pub"

if [[ -n "$admin_key" ]]; then
	[[ -f "$admin_key" && -r "$admin_key" ]] || fail "Admin key is not a readable file: $admin_key"
	[[ "$admin_key" != *.pub ]] || fail "--admin-key expects a private key, not a .pub file."
fi

printf 'Checking GitHub authentication and repository access...\n'
gh auth status --hostname github.com >/dev/null
gh repo view "$REPOSITORY" >/dev/null

if [[ -n "$rerun_id" ]]; then
	[[ "$rerun_id" =~ ^[0-9]+$ ]] || fail "Run ID must contain only digits."
	IFS=$'\t' read -r workflow_name run_status run_conclusion < <(
		gh run view "$rerun_id" \
			--repo "$REPOSITORY" \
			--json workflowName,status,conclusion \
			--jq '[.workflowName, .status, .conclusion] | @tsv'
	)
	[[ "$workflow_name" == "Deploy" ]] || fail "Run $rerun_id belongs to '$workflow_name', not the Deploy workflow."
	[[ "$run_status" == "completed" ]] || fail "Run $rerun_id is '$run_status'; only completed runs can be rerun."
	[[ "$run_conclusion" == "failure" ]] || fail "Run $rerun_id concluded '$run_conclusion', not 'failure'."
fi

ssh_options=(
	-p "$dokku_port"
	-o ConnectTimeout=10
	-o StrictHostKeyChecking=ask
)
admin_ssh_options=("${ssh_options[@]}")
if [[ -n "$admin_key" ]]; then
	admin_ssh_options+=(-i "$admin_key" -o IdentitiesOnly=yes -o BatchMode=yes)
fi

printf 'Checking administrative SSH access to the Dokku host...\n'
if ! admin_ssh dokku version >/dev/null; then
	fail "Administrative SSH bootstrap failed. No deployment key was created or installed. Check --admin-user, --admin-key, and SSH access, then retry."
fi
printf 'Administrative SSH bootstrap access confirmed.\n'

if [[ -e "$deploy_key" || -e "$deploy_public_key" ]]; then
	[[ -f "$deploy_key" && -f "$deploy_public_key" ]] || fail "Both $deploy_key and $deploy_public_key must exist, or neither."
	printf 'Reusing dedicated deployment key at %s.\n' "$deploy_key"
else
	printf 'Creating dedicated deployment key at %s...\n' "$deploy_key"
	umask 077
	mkdir -p "$(dirname "$deploy_key")"
	ssh-keygen -q -t ed25519 -N "" -C "github-actions:$REPOSITORY" -f "$deploy_key"
fi
ensure_private_key_mode "$deploy_key"

[[ -r "$deploy_key" && -r "$deploy_public_key" ]] || fail "Generated deployment key files are not readable."
derived_public_key="$(ssh-keygen -y -P "" -f "$deploy_key" 2>/dev/null | awk 'NF >= 2 { print $1 " " $2; exit }')" || \
	fail "Deployment key is invalid or passphrase-protected."
stored_public_key="$(awk 'NF >= 2 { print $1 " " $2; exit }' "$deploy_public_key")"
[[ -n "$derived_public_key" && -n "$stored_public_key" ]] || fail "Deployment key pair has an invalid public-key format."
[[ "$derived_public_key" == "$stored_public_key" ]] || fail "Deployment public key does not match its private key."

deploy_ssh_options=("${ssh_options[@]}" -i "$deploy_key" -o BatchMode=yes -o IdentitiesOnly=yes)
if ssh "${deploy_ssh_options[@]}" "dokku@$dokku_host" version >/dev/null 2>&1; then
	printf 'Dedicated deployment key is already installed; leaving remote keys unchanged.\n'
else
	printf 'Installing dedicated deployment public key through the admin connection...\n'
	admin_ssh dokku ssh-keys:remove "$DOKKU_KEY_NAME" >/dev/null 2>&1 || true
	admin_ssh dokku ssh-keys:add "$DOKKU_KEY_NAME" <"$deploy_public_key"
	ssh "${deploy_ssh_options[@]}" "dokku@$dokku_host" version >/dev/null || \
		fail "The dedicated deployment key was installed but could not connect."
fi
ensure_app_acl
capture_known_hosts

if admin_ssh dokku apps:exists "$dokku_app" >/dev/null 2>&1; then
	printf 'Copying existing %s config into GitHub Actions secrets (values hidden)...\n' "$dokku_app"
	if [[ -z "$database_url" ]]; then
		database_url="$(remote_app_config DATABASE_URL)"
	fi
	if [[ -z "$encryption_key" ]]; then
		encryption_key="$(remote_app_config ENCRYPTION_KEY)"
	fi
	if [[ -z "$better_auth_secret" ]]; then
		better_auth_secret="$(remote_app_config BETTER_AUTH_SECRET)"
	fi
	if [[ -z "$better_auth_url" ]]; then
		remote_auth_url="$(remote_app_config BETTER_AUTH_URL)"
		if [[ -n "$remote_auth_url" && "$remote_auth_url" =~ ^https:// ]]; then
			better_auth_url="$remote_auth_url"
		elif [[ -n "$remote_auth_url" ]]; then
			printf 'Ignoring remote BETTER_AUTH_URL because it is not https://.\n'
		fi
	fi
fi
validate_optional_secrets

printf 'Setting DOKKU_HOST for %s...\n' "$REPOSITORY"
printf '%s' "$dokku_host" | gh secret set DOKKU_HOST --repo "$REPOSITORY"

printf 'Setting DOKKU_APP for %s...\n' "$REPOSITORY"
printf '%s' "$dokku_app" | gh secret set DOKKU_APP --repo "$REPOSITORY"

printf 'Setting DOKKU_SSH_PRIVATE_KEY from %s (contents hidden)...\n' "$deploy_key"
gh secret set DOKKU_SSH_PRIVATE_KEY --repo "$REPOSITORY" <"$deploy_key"

set_github_secret DATABASE_URL "$database_url"
set_github_secret ENCRYPTION_KEY "$encryption_key"
set_github_secret BETTER_AUTH_SECRET "$better_auth_secret"
set_github_secret BETTER_AUTH_URL "$better_auth_url"

if [[ "$dokku_port" == "22" ]]; then
	if github_secret_names | grep -Fxq DOKKU_SSH_PORT; then
		printf 'Removing DOKKU_SSH_PORT because the target uses the default port 22...\n'
		gh secret delete DOKKU_SSH_PORT --repo "$REPOSITORY"
	fi
else
	printf 'Setting DOKKU_SSH_PORT for the non-default port...\n'
	printf '%s' "$dokku_port" | gh secret set DOKKU_SSH_PORT --repo "$REPOSITORY"
fi

require_github_secrets DOKKU_HOST DOKKU_APP DOKKU_SSH_PRIVATE_KEY DOKKU_SSH_KNOWN_HOSTS
printf 'Dokku deployment key and GitHub secrets configured successfully.\n'

missing_deploy_secrets="$(missing_github_secrets "${REQUIRED_DEPLOY_SECRETS[@]}")"
if [[ -n "$missing_deploy_secrets" ]]; then
	printf 'Deploy still needs GitHub Actions secrets:\n'
	printf '%s\n' "$missing_deploy_secrets" | sed 's/^/  /'
	printf 'Do not re-run an old workflow from the GitHub UI; it will fail on the first missing secret.\n'
	printf 'Copy them from the Dokku app, or pass --database-url-file, --encryption-key-file, --better-auth-secret-file, and --better-auth-url-file.\n'
fi

if [[ -z "$rerun_id" ]]; then
	printf 'No workflow was started. Use --rerun RUN_ID when you are ready.\n'
	exit 0
fi

require_github_secrets "${REQUIRED_DEPLOY_SECRETS[@]}"

# GitHub reruns reuse the original run's secret snapshot. Newly written
# secrets such as DOKKU_HOST are invisible to `gh run rerun`.
correlation="dokku-setup-$(date +%s)-$RANDOM"
printf 'Starting a new Deploy workflow (target=dokku, correlation=%s). Rerunning %s would reuse its original secret snapshot.\n' "$correlation" "$rerun_id"
gh workflow run Deploy \
	--repo "$REPOSITORY" \
	--ref main \
	--field target=dokku \
	--field correlation="$correlation"

if [[ "$watch_run" == true ]]; then
	printf 'Waiting for the dispatched Deploy run to appear...\n'
	dispatched_run_id=""
	for _ in $(seq 1 30); do
		dispatched_run_id="$(
			gh run list \
				--repo "$REPOSITORY" \
				--workflow Deploy \
				--event workflow_dispatch \
				--limit 20 \
				--json databaseId,displayTitle \
				--jq ".[] | select(.displayTitle | contains(\"$correlation\")) | .databaseId" |
				awk 'NR == 1 { print; exit }'
		)"
		if [[ -n "$dispatched_run_id" && "$dispatched_run_id" != "$rerun_id" ]]; then
			break
		fi
		dispatched_run_id=""
		sleep 1
	done
	[[ -n "$dispatched_run_id" ]] || fail "Timed out waiting for the dispatched Deploy run."
	printf 'Monitoring run %s until it completes...\n' "$dispatched_run_id"
	gh run watch "$dispatched_run_id" --exit-status --repo "$REPOSITORY"
else
	printf 'Deploy workflow dispatched with target=dokku.\n'
fi
