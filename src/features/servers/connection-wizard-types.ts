import { CheckCircle2, type KeyRound, Server, ShieldCheck } from "lucide-react";

export type AuthMethod = "password" | "ssh-key";

export type ConnectionDraft = {
	label: string;
	host: string;
	port: string;
	username: string;
	authMethod: AuthMethod;
	password: string;
	privateKey: string;
	storeCredential: boolean;
};

export const wizardSteps = [
	{
		number: 1,
		title: "Server basics",
		description: "Name the machine and point HermesHub at the right host.",
		icon: Server,
	},
	{
		number: 2,
		title: "Authentication",
		description:
			"Choose how HermesHub should sign in and whether to retain the secret.",
		icon: ShieldCheck,
	},
	{
		number: 3,
		title: "Review and connect",
		description:
			"Double-check the details before the backend verifies SSH access.",
		icon: CheckCircle2,
	},
] as const;

export const initialDraft: ConnectionDraft = {
	label: "",
	host: "",
	port: "22",
	username: "root",
	authMethod: "password",
	password: "",
	privateKey: "",
	storeCredential: true,
};

export { inputClassName } from "#/components/ui/input-class";

function isValidIpv6Host(host: string) {
	if (!host.includes(":")) {
		return false;
	}

	try {
		new URL(`http://[${host}]/`);
		return true;
	} catch {
		return false;
	}
}

export function isValidHost(host: string) {
	const trimmedHost = host.trim();
	if (!trimmedHost || /\s/.test(trimmedHost)) {
		return false;
	}

	const ipv4Pattern =
		/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
	const hostnamePattern =
		/^(?=.{1,253}$)(?!-)([a-zA-Z0-9-]{1,63}\.)*[a-zA-Z0-9-]{1,63}$/;

	return (
		ipv4Pattern.test(trimmedHost) ||
		hostnamePattern.test(trimmedHost) ||
		isValidIpv6Host(trimmedHost)
	);
}

export function maskSecret(value: string) {
	if (!value) {
		return "Not provided";
	}

	return "*".repeat(Math.min(Math.max(value.length, 8), 14));
}

export function summarizePrivateKey(value: string) {
	if (!value.trim()) {
		return "No private key provided";
	}

	const firstLine = value.trim().split("\n")[0] ?? "Private key pasted";
	return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
}

export type WizardFieldProps = {
	children: React.ReactNode;
	error?: string;
	hint: string;
	label: string;
	name: string;
};

export type AuthCardProps = {
	description: string;
	icon: typeof KeyRound;
	onSelect: () => void;
	selected: boolean;
	title: string;
};
