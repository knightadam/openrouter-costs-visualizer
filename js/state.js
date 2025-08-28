import { loadColumnVisibility } from './services/storage.js';

export const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtUSD_4dec = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });
export const fmtUSD_6dec = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 });
export const fmtInt = new Intl.NumberFormat('en-US');

export const DEFAULT_COL_VISIBILITY = {
	model: true, req: true, total: true, byok: true, web: true,
	cache: false, file: false, tp: true, avgTp: false, tc: false,
	tokenOutput: true, avgTokenOutput: false, tr: true, avgTr: false,
	genTime: true, ttft: false
};

export const COL_KEYS = [
	'model','req','total','byok','web','cache','file',
	'tp','avgTp','tc','tokenOutput','avgTokenOutput','tr','avgTr','genTime','ttft'
];

export const COL_LABELS = {
	model: 'Model',
	req: 'Requests',
	total: 'Total Cost',
	byok: 'BYOK',
	web: 'Web Search',
	cache: 'Cache',
	file: 'File Processing',
	tp: 'Tokens Prompt',
	avgTp: 'Avg Tokens Prompt',
	tc: 'Tokens Completion',
	tokenOutput: 'Token Output',
	avgTokenOutput: 'Avg Token Output',
	tr: 'Tokens Reasoning',
	avgTr: 'Avg Tokens Reasoning',
	genTime: 'Avg Gen Time',
	ttft: 'Avg TTFT'
};

export const state = {
	files: [],               // { id, name, data: parsed rows[] }
	rows: [],                // merged + deduped
	filtered: [],            // filtered for rendering
	models: new Set(),       // unique models
	selectedModels: new Set(),
	charts: { bar: null, line: null },
	colVisibility: loadColumnVisibility(DEFAULT_COL_VISIBILITY),
	sort: { col: 'total', dir: 'default' }
};
