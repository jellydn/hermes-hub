import { Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";

import { Button } from "#/components/ui/button";
import { githubRepoUrl } from "#/lib/github-repo";
import { cn } from "#/lib/utils";

type LandingCtasProps = {
	className?: string;
};

export function LandingCtas({ className }: LandingCtasProps) {
	return (
		<div className={cn("flex flex-wrap gap-3", className)}>
			<Button asChild>
				<Link to="/login">
					Deploy Hermes Agent
					<ArrowRight />
				</Link>
			</Button>
			<Button asChild variant="secondary">
				<a href={githubRepoUrl} target="_blank" rel="noopener noreferrer">
					View GitHub
					<ExternalLink />
				</a>
			</Button>
		</div>
	);
}
