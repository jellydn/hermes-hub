export type McpFormMessage = { type: "success" | "error"; text: string };

type McpFormMessageBannerProps = {
	message: McpFormMessage | null;
	className?: string;
};

export function McpFormMessageBanner({
	message,
	className = "m-0 text-sm",
}: McpFormMessageBannerProps) {
	if (!message) {
		return null;
	}

	return (
		<p
			className={`${className} ${
				message.type === "error" ? "text-red-600" : "text-emerald-600"
			}`}
		>
			{message.text}
		</p>
	);
}
