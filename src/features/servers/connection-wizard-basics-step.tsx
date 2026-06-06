import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { WizardField } from "./connection-wizard-field";
import {
	type ConnectionDraft,
	inputClassName,
} from "./connection-wizard-types";

type BasicsStepProps = {
	errors: FieldErrors<ConnectionDraft>;
	register: UseFormRegister<ConnectionDraft>;
};

export function ConnectionWizardBasicsStep({
	errors,
	register,
}: BasicsStepProps) {
	return (
		<div className="grid gap-5 md:grid-cols-2">
			<WizardField
				label="Server label"
				name="label"
				error={errors.label?.message}
				hint="A friendly name like Production VPS or Paris Node."
			>
				<input
					id="label"
					type="text"
					{...register("label")}
					className={inputClassName}
					placeholder="Production VPS"
				/>
			</WizardField>

			<WizardField
				label="Host"
				name="host"
				error={errors.host?.message}
				hint="Hostname or IP address that HermesHub will reach over SSH."
			>
				<input
					id="host"
					type="text"
					{...register("host")}
					className={inputClassName}
					placeholder="203.0.113.42"
				/>
			</WizardField>

			<WizardField
				label="Port"
				name="port"
				error={errors.port?.message}
				hint="Default SSH port is 22."
			>
				<input
					id="port"
					type="number"
					inputMode="numeric"
					min="1"
					max="65535"
					{...register("port")}
					className={inputClassName}
				/>
			</WizardField>

			<WizardField
				label="Username"
				name="username"
				error={errors.username?.message}
				hint="The SSH user HermesHub should use during setup."
			>
				<input
					id="username"
					type="text"
					{...register("username")}
					className={inputClassName}
					placeholder="root"
				/>
			</WizardField>
		</div>
	);
}
