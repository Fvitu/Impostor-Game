const PLAYER_NAME_MIN_LENGTH = 2;
const PLAYER_NAME_MAX_LENGTH = 20;
const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface PlayerNameValidationResult {
	isValid: boolean;
	value: string;
	error?: string;
}

export function normalizePlayerName(value: string): string {
	return value.trim();
}

export function validatePlayerName(value: string): PlayerNameValidationResult {
	const normalized = normalizePlayerName(value);

	if (normalized.length < PLAYER_NAME_MIN_LENGTH || normalized.length > PLAYER_NAME_MAX_LENGTH) {
		return {
			isValid: false,
			value: normalized,
			error: "Username must be 2-20 characters",
		};
	}

	if (!PLAYER_NAME_PATTERN.test(normalized)) {
		return {
			isValid: false,
			value: normalized,
			error: "Username can only contain letters, numbers, hyphens and underscores",
		};
	}

	return {
		isValid: true,
		value: normalized,
	};
}

export function isValidPlayerName(value: string): boolean {
	return validatePlayerName(value).isValid;
}