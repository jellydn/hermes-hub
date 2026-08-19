#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY="jellydn/hermes-hub"
readonly DOKKU_KEY_NAME="hermes-hub-github-actions"
readonly REQUIRED_DEPLOY_SECRETS=(
	DOKKU_HOST
	DOKKU_SSH_PRIVATE_KEY
	DOKKU_APP
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
rerun_id=""
watch_run=true

usage() {
	cat <<'EOF'
Usage: scripts/setup-dokku-deploy-secrets.sh --host HOST [options]

Create and install a dedicated Dokku deployment key, then configure the
GitHub Actions secrets for jellydn/hermes-hub. HOST may instead be supplied in
DOKKU_HOST. Private key material is never printed.

Options:
  --host HOST          Dokku hostname or IP address (required)
  --port PORT          SSH port (default: 22)
  --app NAME           Dokku app name written to the DOKKU_APP secret
                       (default: hermes-hub)
  --database-url URL   DATABASE_URL secret (do not use a local .env URL)
  --encryption-key KEY ENCRYPTION_KEY secret
  --better-auth-secret SECRET
                       BETTER_AUTH_SECRET secret
  --better-auth-url URL
                       BETTER_AUTH_URL secret (public HTTPS origin)
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
developer .env cannot overwrite production.

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
		--database-url)
			(($# >= 2)) || fail "--database-url requires a value."
			database_url="$2"
			shift 2
			;;
		--encryption-key)
			(($# >= 2)) || fail "--encryption-key requires a value."
			encryption_key="$2"
			shift 2
			;;
		--better-auth-secret)
			(($# >= 2)) || fail "--better-auth-secret requires a value."
			better_auth_secret="$2"
			shift 2
			;;
		--better-auth-url)
			(($# >= 2)) || fail "--better-auth-url requires a value."
			better_auth_url="$2"
			shift 2
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

[[ -n "$dokku_host" ]] || fail "Dokku host is required. Pass --host HOST or set DOKKU_HOST."
[[ "$dokku_host" =~ ^[a-zA-Z0-9._:-]+$ ]] || fail "Dokku host contains unsupported characters."
[[ "$dokku_app" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "Dokku app name must be lowercase letters, digits, and hyphens."
[[ "$admin_user" =~ ^[a-zA-Z0-9._-]+$ ]] || fail "Admin user contains unsupported characters."
[[ "$dokku_port" =~ ^[0-9]+$ ]] || fail "SSH port must contain only digits."
(( ${#dokku_port} <= 5 )) || fail "SSH port must be between 1 and 65535."
dokku_port=$((10#$dokku_port))
((dokku_port >= 1 && dokku_port <= 65535)) || fail "SSH port must be between 1 and 65535."

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
	admin_ssh_options+=(-i "$admin_key")
fi

printf 'Checking administrative SSH access to the Dokku host...\n'
if ! ssh "${admin_ssh_options[@]}" "$admin_user@$dokku_host" dokku version >/dev/null; then
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
	ssh "${admin_ssh_options[@]}" "$admin_user@$dokku_host" \
		dokku ssh-keys:remove "$DOKKU_KEY_NAME" >/dev/null 2>&1 || true
	ssh "${admin_ssh_options[@]}" "$admin_user@$dokku_host" \
		dokku ssh-keys:add "$DOKKU_KEY_NAME" <"$deploy_public_key"
	ssh "${deploy_ssh_options[@]}" "dokku@$dokku_host" version >/dev/null || \
		fail "The dedicated deployment key was installed but could not connect."
fi

if ssh "${admin_ssh_options[@]}" "$admin_user@$dokku_host" dokku apps:exists "$dokku_app" >/dev/null 2>&1; then
	printf 'Copying existing %s config into GitHub Actions secrets (values hidden)...\n' "$dokku_app"
	[[ -n "$database_url" ]] || database_url="$(remote_app_config DATABASE_URL)"
	[[ -n "$encryption_key" ]] || encryption_key="$(remote_app_config ENCRYPTION_KEY)"
	[[ -n "$better_auth_secret" ]] || better_auth_secret="$(remote_app_config BETTER_AUTH_SECRET)"
	[[ -n "$better_auth_url" ]] || better_auth_url="$(remote_app_config BETTER_AUTH_URL)"
fi

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

require_github_secrets DOKKU_HOST DOKKU_APP DOKKU_SSH_PRIVATE_KEY
printf 'Dokku deployment key and GitHub secrets configured successfully.\n'

missing_deploy_secrets="$(missing_github_secrets "${REQUIRED_DEPLOY_SECRETS[@]}")"
if [[ -n "$missing_deploy_secrets" ]]; then
	printf 'Deploy still needs GitHub Actions secrets:\n'
	printf '%s\n' "$missing_deploy_secrets" | sed 's/^/  /'
	printf 'Do not re-run an old workflow from the GitHub UI; it will fail on the first missing secret.\n'
	printf 'Copy them from the Dokku app, or pass --database-url, --encryption-key, --better-auth-secret, and --better-auth-url.\n'
fi

if [[ -z "$rerun_id" ]]; then
	printf 'No workflow was started. Use --rerun RUN_ID when you are ready.\n'
	exit 0
fi

require_github_secrets "${REQUIRED_DEPLOY_SECRETS[@]}"

# GitHub reruns reuse the original run's secret snapshot. Newly written
# secrets such as DOKKU_HOST are invisible to `gh run rerun`.
printf 'Starting a new Deploy workflow (target=dokku). Rerunning %s would reuse its original secret snapshot.\n' "$rerun_id"
gh workflow run Deploy --repo "$REPOSITORY" --ref main --field target=dokku

if [[ "$watch_run" == true ]]; then
	printf 'Waiting for the dispatched Deploy run to appear...\n'
	dispatched_run_id=""
	for _ in $(seq 1 30); do
		dispatched_run_id="$(
			gh run list \
				--repo "$REPOSITORY" \
				--workflow Deploy \
				--event workflow_dispatch \
				--limit 1 \
				--json databaseId \
				--jq '.[0].databaseId // empty'
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
