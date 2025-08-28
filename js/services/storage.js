const KEY = 'openrouter-column-visibility';

export function loadColumnVisibility(defaults) {
	try {
		const saved = localStorage.getItem(KEY);
		if (!saved) return { ...defaults };
		const parsed = JSON.parse(saved);
		return { ...defaults, ...parsed };
	} catch {
		return { ...defaults };
	}
}

export function saveColumnVisibility(colVisibility) {
	try {
		localStorage.setItem(KEY, JSON.stringify(colVisibility));
	} catch {
		// ignore
	}
}
