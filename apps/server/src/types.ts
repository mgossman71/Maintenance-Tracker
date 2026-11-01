import type { SessionInfo } from "./auth/sessions";

export interface AppVariables {
	Variables: {
		session: SessionInfo | undefined;
	};
}
