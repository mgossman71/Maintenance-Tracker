import { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "auto";

const THEME_KEY = "mt-theme-mode";

interface ThemeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: "auto", setMode: () => {} });

function applyMode(mode: ThemeMode) {
	const dark =
		mode === "dark" ||
		(mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [mode, setModeState] = useState<ThemeMode>(() => {
		const stored = localStorage.getItem(THEME_KEY);
		return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
	});

	useEffect(() => {
		applyMode(mode);
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => mode === "auto" && applyMode("auto");
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, [mode]);

	return (
		<ThemeContext.Provider
			value={{
				mode,
				setMode: (next) => {
					localStorage.setItem(THEME_KEY, next);
					setModeState(next);
				},
			}}
		>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	return useContext(ThemeContext);
}
