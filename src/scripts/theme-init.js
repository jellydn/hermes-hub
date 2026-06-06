(() => {
	var stored;
	var mode;
	var prefersDark;
	var resolved;
	var root;

	try {
		stored = window.localStorage.getItem("theme");
		mode =
			stored === "light" || stored === "dark" || stored === "auto"
				? stored
				: "auto";
		prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;
		root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(resolved);
		if (mode === "auto") {
			root.removeAttribute("data-theme");
		} else {
			root.setAttribute("data-theme", mode);
		}
		root.style.colorScheme = resolved;
	} catch {}
})();
