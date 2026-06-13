import { FormFeedback } from "#/components/ui/form-feedback";

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
		<FormFeedback className={className} tone={message.type}>
			{message.text}
		</FormFeedback>
	);
}
