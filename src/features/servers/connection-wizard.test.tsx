// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionWizard } from "./connection-wizard";

afterEach(() => {
	cleanup();
});

describe("ConnectionWizard", () => {
	it("blocks progress until step-one fields are valid", () => {
		render(<ConnectionWizard onSubmit={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: /next/i }));

		expect(screen.getByText(/enter a label/i)).toBeTruthy();
		expect(screen.getByText(/enter a hostname or ip address/i)).toBeTruthy();
		expect(screen.getByText(/step 1 of 3/i)).toBeTruthy();
	});

	it("shows ssh key input when that auth method is selected", () => {
		render(<ConnectionWizard onSubmit={vi.fn()} />);

		fillStepOne();
		fireEvent.click(screen.getByRole("button", { name: /next/i }));
		fireEvent.click(screen.getByRole("button", { name: /ssh private key/i }));

		expect(screen.getByLabelText(/private key/i)).toBeTruthy();
		expect(screen.queryByLabelText(/server password/i)).toBeNull();
	});

	it("submits the collected draft from the review step", () => {
		const handleSubmit = vi.fn();
		render(<ConnectionWizard onSubmit={handleSubmit} />);

		fillStepOne();
		fireEvent.click(screen.getByRole("button", { name: /next/i }));

		fireEvent.click(screen.getByRole("button", { name: /ssh private key/i }));
		fireEvent.change(screen.getByLabelText(/private key/i), {
			target: { value: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc123" },
		});
		fireEvent.click(screen.getByRole("button", { name: /next/i }));

		expect(screen.getByText(/step 3 of 3/i)).toBeTruthy();
		expect(screen.getByText("demo-vps.example.com")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /connect/i }));

		expect(handleSubmit).toHaveBeenCalledWith({
			label: "Primary VPS",
			host: "demo-vps.example.com",
			port: "22",
			username: "root",
			authMethod: "ssh-key",
			password: "",
			privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc123",
			storeCredential: true,
		});
	});
});

function fillStepOne() {
	fireEvent.change(screen.getByLabelText(/server label/i), {
		target: { value: "Primary VPS" },
	});
	fireEvent.change(screen.getByLabelText(/^host$/i), {
		target: { value: "demo-vps.example.com" },
	});
	fireEvent.change(screen.getByLabelText(/username/i), {
		target: { value: "root" },
	});
}
