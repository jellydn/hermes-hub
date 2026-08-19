#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY="jellydn/hermes-hub"
readonly DOKKU_KEY_NAME="hermes-hub-github-actions"

dokku_host="${DOKKU_HOST:-}"
dokku_port="${DOKKU_SSH_PORT:-22}"
admin_user="${DOKKU_ADMIN_USER:-root}"
admin_key="${DOKKU_ADMIN_KEY:-}"
deploy_key="${DOKKU_DEPLOY_KEY:-$HOME/.ssh/hermes-hub-dokku-deploy}"
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
  --admin-user USER    Bootstrap SSH user able to run Dokku commands (default: root)
  --admin-key PATH     Existing private key for bootstrap SSH access
  --deploy-key PATH    Dedicated key path to create/reuse
                       (default: ~/.ssh/hermes-hub-dokku-deploy)
  --rerun RUN_ID       Rerun failed jobs from a completed Deploy workflow run
  --no-watch           Do not monitor the rerun after starting it
  -h, --help           Show this help

Environment alternatives: DOKKU_HOST, DOKKU_SSH_PORT, DOKKU_ADMIN_USER,
DOKKU_ADMIN_KEY, and DOKKU_DEPLOY_KEY.
EOF
}

fail() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but was not found in PATH."
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
[[ "$admin_user" =~ ^[a-zA-Z0-9._-]+$ ]] || fail "Admin user contains unsupported characters."
[[ "$dokku_port" =~ ^[0-9]+$ ]] || fail "SSH port must contain only digits."
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

printf 'Setting DOKKU_HOST for %s...\n' "$REPOSITORY"
printf '%s' "$dokku_host" | gh secret set DOKKU_HOST --repo "$REPOSITORY"

printf 'Setting DOKKU_SSH_PRIVATE_KEY from %s (contents hidden)...\n' "$deploy_key"
gh secret set DOKKU_SSH_PRIVATE_KEY --repo "$REPOSITORY" <"$deploy_key"

if [[ "$dokku_port" == "22" ]]; then
	if gh secret list --repo "$REPOSITORY" --json name --jq '.[].name' | grep -Fxq DOKKU_SSH_PORT; then
		printf 'Removing DOKKU_SSH_PORT because the target uses the default port 22...\n'
		gh secret delete DOKKU_SSH_PORT --repo "$REPOSITORY"
	fi
else
	printf 'Setting DOKKU_SSH_PORT for the non-default port...\n'
	printf '%s' "$dokku_port" | gh secret set DOKKU_SSH_PORT --repo "$REPOSITORY"
fi

printf 'Dokku deployment key and GitHub secrets configured successfully.\n'

if [[ -z "$rerun_id" ]]; then
	printf 'No workflow was rerun. Use --rerun RUN_ID when you are ready.\n'
	exit 0
fi

printf 'Rerunning failed jobs for Deploy run %s...\n' "$rerun_id"
gh run rerun "$rerun_id" --failed --repo "$REPOSITORY"

if [[ "$watch_run" == true ]]; then
	printf 'Monitoring run %s until it completes...\n' "$rerun_id"
	gh run watch "$rerun_id" --exit-status --repo "$REPOSITORY"
else
	run_url="$(gh run view "$rerun_id" --repo "$REPOSITORY" --json url --jq .url)"
	printf 'Rerun started: %s\n' "$run_url"
fi
