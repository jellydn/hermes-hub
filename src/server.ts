import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { apiApp } from "#server/app";

const startHandler = createStartHandler(defaultStreamHandler);

const fetch = async (
	request: Request,
	requestOptions?: Parameters<typeof startHandler>[1],
) => {
	const url = new URL(request.url);

	if (url.pathname.startsWith("/api/")) {
		return apiApp.fetch(request);
	}

	return startHandler(request, requestOptions);
};

export default createServerEntry({ fetch });
