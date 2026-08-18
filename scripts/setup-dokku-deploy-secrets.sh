#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY="jellydn/hermes-hub"
readonly DOKKU_HOST="95.111.232.131"
readonly DOKKU_PORT="22"

key_path=""
rerun_id=""
watch_run=true

usage() {
	cat <<'EOF'
Usage: scripts/setup-dokku-deploy-secrets.sh [options]

Configure the GitHub Actions secrets needed to deploy jellydn/hermes-hub to
dokku@95.111.232.131:22. The private key is sent directly to gh over stdin and
is never printed.

Options:
  --key PATH       Use PATH as the SSH private key (otherwise prompt for one)
  --rerun RUN_ID   Rerun failed jobs from a completed Deploy workflow run
  --no-watch       Do not monitor the rerun after starting it
  -h, --help       Show this help
EOF
}

fail() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "'$1' is required but was not found in PATH."
}

while (($# > 0)); do
	case "$1" in
		--key)
			(($# >= 2)) || fail "--key requires a path."
			key_path="$2"
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

printf 'Checking GitHub authentication and repository access...\n'
gh auth status --hostname github.com >/dev/null
gh repo view "$REPOSITORY" >/dev/null

if [[ -z "$key_path" ]]; then
	[[ -t 0 ]] || fail "No interactive terminal detected. Pass the private key path with --key."

	default_key=""
	for candidate in "$HOME/.ssh/id_ed25519" "$HOME/.ssh/id_ecdsa" "$HOME/.ssh/id_rsa"; do
		if [[ -f "$candidate" ]]; then
			default_key="$candidate"
			break
		fi
	done

	if [[ -n "$default_key" ]]; then
		read -r -p "SSH private key path [$default_key]: " key_path
		key_path="${key_path:-$default_key}"
	else
		read -r -p "SSH private key path: " key_path
	fi
fi

key_path="${key_path/#\~/$HOME}"
[[ -f "$key_path" ]] || fail "Private key not found: $key_path"
[[ -r "$key_path" ]] || fail "Private key is not readable: $key_path"
[[ "$key_path" != *.pub ]] || fail "Expected a private key, not a .pub file."

# GitHub Actions cannot unlock a passphrase-protected key in this workflow.
if ! ssh-keygen -y -P "" -f "$key_path" >/dev/null 2>&1; then
	fail "The key is invalid or passphrase-protected. Use a dedicated, unencrypted Dokku deployment key."
fi

printf 'Checking SSH access to dokku@%s:%s...\n' "$DOKKU_HOST" "$DOKKU_PORT"
ssh \
	-i "$key_path" \
	-p "$DOKKU_PORT" \
	-o BatchMode=yes \
	-o ConnectTimeout=10 \
	-o IdentitiesOnly=yes \
	-o StrictHostKeyChecking=ask \
	"dokku@$DOKKU_HOST" version >/dev/null

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

printf 'Setting DOKKU_HOST for %s...\n' "$REPOSITORY"
printf '%s' "$DOKKU_HOST" | gh secret set DOKKU_HOST --repo "$REPOSITORY"

printf 'Setting DOKKU_SSH_PRIVATE_KEY from %s (contents hidden)...\n' "$key_path"
gh secret set DOKKU_SSH_PRIVATE_KEY --repo "$REPOSITORY" <"$key_path"

# Port 22 is the workflow default. Remove a stale override instead of storing it.
if gh secret list --repo "$REPOSITORY" --json name --jq '.[].name' | grep -Fxq DOKKU_SSH_PORT; then
	printf 'Removing DOKKU_SSH_PORT because Dokku uses the default port 22...\n'
	gh secret delete DOKKU_SSH_PORT --repo "$REPOSITORY"
fi

printf 'Dokku deployment secrets configured successfully.\n'

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
