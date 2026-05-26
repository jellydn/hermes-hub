import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuthSession } from "../../server/auth";

export const getCurrentSession = createServerFn({ method: "GET" }).handler(
	async () => {
		return getAuthSession(getRequestHeaders());
	},
);
