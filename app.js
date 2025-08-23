/* Minimal CSV -> dashboard */
(() => {
	const els = {
		file: document.getElementById('csvFile'),
		dropZone: document.getElementById('dropZone'),
		from: document.getElementById('fromDate'),
		to: document.getElementById('toDate'),
		// old multi-select may be absent; keep optional
		modelFilter: document.getElementById('modelFilter'),
		// new dropdown elements
		modelBtn: document.getElementById('modelFilterBtn'),
		modelPanel: document.getElementById('modelFilterPanel'),
		modelList: document.getElementById('modelList'),
		modelSearch: document.getElementById('modelSearch'),
		modelAll: document.getElementById('modelSelectAll'),
		modelNone: document.getElementById('modelSelectNone'),

		// Column filter UI
		colBtn: document.getElementById('colFilterBtn'),
		colPanel: document.getElementById('colFilterPanel'),
		colList: document.getElementById('colList'),
		colAll: document.getElementById('colSelectAll'),
		colNone: document.getElementById('colSelectNone'),

		btnApply: document.getElementById('applyFilters'),
		btnReset: document.getElementById('resetFilters'),
		kpiOpenRouterCost: document.getElementById('kpiOpenRouterCost'),
		kpiTotalCost: document.getElementById('kpiTotalCost'),
		kpiReq: document.getElementById('kpiRequests'),
		kpiAvg: document.getElementById('kpiAvgCost'),
		kpiWin: document.getElementById('kpiWindow'),
		tableBody: document.querySelector('#costTable tbody'),
		barCanvas: document.getElementById('barCostByModel'),
		lineCanvas: document.getElementById('lineCostOverTime'),
	};

	let COL = {};

	const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const fmtUSD_4dec = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });
	const fmtUSD_6dec = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 });
	const fmtInt = new Intl.NumberFormat('en-US');

	// Grouped default column visibility
	const DEFAULT_COL_VISIBILITY = {
		model: true, req: true, total: true, byok: true, web: true,
		cache: false, file: false, tp: true, avgTp: false, tc: false, 
		tokenOutput: true, avgTokenOutput: false, tr: true, avgTr: false, 
		genTime: true, ttft: false
	};

	const state = {
		rows: [], filtered: [], models: new Set(),
		selectedModels: new Set(),
		charts: { bar: null, line: null },
		// Load column visibility from localStorage or use defaults
		colVisibility: loadColumnVisibility()
	};

	// Column metadata
	const COL_KEYS = [
		'model','req','total','byok','web','cache','file',
		'tp','avgTp','tc','tokenOutput','avgTokenOutput','tr','avgTr','genTime','ttft'
	];
	const COL_LABELS = {
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

	// Parse helpers
	function toNum(v) {
		if (v == null || v === '') return 0;
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	}
	function parseLine(line) {
		// Simple CSV split (no quoted fields in sample)
		const parts = line.split(',');

		const ts = parts[COL.created]?.trim();
		let d = ts ? new Date(ts.replace(' ', 'T')) : null;
		// ensure valid date
		if (d && isNaN(+d)) d = null;
		const model = (parts[COL.model] || '').trim();

		const genTimeRaw = parts[COL.genTime];
		const genTime = toNum(genTimeRaw);
		const ttftRaw = parts[COL.ttft];
		const ttft = toNum(ttftRaw);
		
		// Debug: log first few rows to check data
		if (state.rows.length < 3) {
			console.log('Debug row:', {
				parts: parts.length,
				genTimeRaw,
				genTime,
				ttftRaw,
				ttft,
				model,
				created: ts,
				total: parts[COL.total]
			});
		}

		return {
			id: parts[COL.id],
			date: d,
			model,
			total: toNum(parts[COL.total]),
			web: toNum(parts[COL.web]),
			cache: toNum(parts[COL.cache]),
			file: toNum(parts[COL.file]),
			byok: toNum(parts[COL.byok]),
			tp: Math.trunc(toNum(parts[COL.tokPrompt])),
			tc: Math.trunc(toNum(parts[COL.tokCompletion])),
			tr: Math.trunc(toNum(parts[COL.tokReasoning])),
			genTime: genTime,
			ttft: ttft,
		};
	}

	function parseCSV(csvText) {
		const lines = csvText.trim().split('\n');
		if (lines.length < 2) return;

		// Parse header to get column mapping
		const header = lines[0].split(',').map(col => col.trim());
		COL = {
			id: header.indexOf('generation_id'),
			created: header.indexOf('created_at'),
			total: header.indexOf('cost_total'),
			web: header.indexOf('cost_web_search'),
			cache: header.indexOf('cost_cache'),
			file: header.indexOf('cost_file_processing'),
			byok: header.indexOf('byok_usage_inference'),
			tokPrompt: header.indexOf('tokens_prompt'),
			tokCompletion: header.indexOf('tokens_completion'),
			tokReasoning: header.indexOf('tokens_reasoning'),
			model: header.indexOf('model_permaslug'),
			provider: header.indexOf('provider_name'),
			genTime: header.indexOf('generation_time_ms'),
			ttft: header.indexOf('time_to_first_token_ms')
		};

		// Debug: log column mapping
		console.log('Column mapping:', COL);

		const rows = [];
		const models = new Set();

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;
			
			const r = parseLine(line);
			// skip rows with missing/invalid date or model
			if (!r || !r.date || !r.model) continue;
			rows.push(r);
			models.add(r.model);
		}
		
		state.rows = rows.sort((a, b) => a.date - b.date);
		state.models = models;
		populateModelFilter(models);
		// Clear filters when new file is loaded
		els.from.value = '';
		els.to.value = '';
		state.selectedModels.clear();
		if (els.modelFilter?.options) for (const opt of els.modelFilter.options) opt.selected = false; // legacy select if present
		updateModelButtonCaption();

		applyFilters();
	}

	function populateModelFilter(models) {
		// build checkbox list in dropdown
		if (!els.modelList) return;
		els.modelList.innerHTML = '';
		const arr = [...models].sort();
		for (const m of arr) {
			const id = 'mdl_' + btoa(m).replace(/=+$/,'')
			const wrap = document.createElement('label');
			wrap.className = 'model-item';
			wrap.innerHTML = `
				<input type="checkbox" value="${escapeHTML(m)}" id="${id}" />
				<span class="mono">${escapeHTML(m)}</span>
			`;
			const input = wrap.querySelector('input');
			input.addEventListener('change', () => {
				if (input.checked) state.selectedModels.add(m);
				else state.selectedModels.delete(m);
				updateModelButtonCaption();
				applyFilters();
			});
			els.modelList.appendChild(wrap);
		}
		// search
		els.modelSearch?.addEventListener('input', () => {
			const q = els.modelSearch.value.trim().toLowerCase();
			for (const el of els.modelList.children) {
				const txt = el.textContent.toLowerCase();
				el.style.display = txt.includes(q) ? '' : 'none';
			}
		});
		// select all/none
		els.modelAll?.addEventListener('click', () => {
			state.selectedModels = new Set(arr);
			for (const cb of els.modelList.querySelectorAll('input[type="checkbox"]')) cb.checked = true;
			updateModelButtonCaption(); applyFilters();
		});
		els.modelNone?.addEventListener('click', () => {
			state.selectedModels.clear();
			for (const cb of els.modelList.querySelectorAll('input[type="checkbox"]')) cb.checked = false;
			updateModelButtonCaption(); applyFilters();
		});
		// dropdown toggle
		els.modelBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			const hidden = els.modelPanel.hasAttribute('hidden');
			if (hidden) {
				els.modelPanel.removeAttribute('hidden');
				positionModelPanel();
			} else {
				els.modelPanel.setAttribute('hidden', '');
			}
		});
		document.addEventListener('click', (e) => {
			if (!els.modelPanel) return;
			if (els.modelPanel.hasAttribute('hidden')) return;
			if (els.modelPanel.contains(e.target) || els.modelBtn.contains(e.target)) return;
			els.modelPanel.setAttribute('hidden', '');
		});
		// keep panel in view on resize
		window.addEventListener('resize', () => {
			if (!els.modelPanel?.hasAttribute('hidden')) positionModelPanel();
		});
	}

	function positionModelPanel() {
		if (!els.modelPanel || !els.modelBtn) return;
		// reset alignment and clamp width to viewport
		els.modelPanel.classList.remove('align-right');
		els.modelPanel.style.maxWidth = Math.min(360, window.innerWidth - 16) + 'px';

		// compute if panel would overflow to the right; if so, align-right
		const btnRect = els.modelBtn.getBoundingClientRect();
		const panelRect = els.modelPanel.getBoundingClientRect();
		const margin = 8;
		const projectedRight = btnRect.left + panelRect.width;
		if (projectedRight > window.innerWidth - margin) {
			els.modelPanel.classList.add('align-right');
		}
	}

	function updateModelButtonCaption() {
		if (!els.modelBtn) return;
		const n = state.selectedModels.size;
		els.modelBtn.textContent = n === 0 ? 'All models' : `${n} model${n>1?'s':''} selected`;
	}

	// Filters
	function getSelectedModels() {
		// prefer new dropdown selection; fallback to legacy select if present
		if (state.selectedModels.size > 0) return [...state.selectedModels];
		if (els.modelFilter?.selectedOptions?.length) {
			return Array.from(els.modelFilter.selectedOptions).map(o => o.value);
		}
		return [];
	}
	function dateStartInclusive(dateStr) {
		if (!dateStr) return null;
		const d = new Date(dateStr + 'T00:00:00');
		return isNaN(+d) ? null : d;
	}
	function dateEndInclusive(dateStr) {
		if (!dateStr) return null;
		const d = new Date(dateStr + 'T23:59:59.999');
		return isNaN(+d) ? null : d;
	}

	function applyFilters() {
		if (state.rows.length === 0) { clearUI(); return; }
		const sel = getSelectedModels();
		const hasSel = sel.length > 0;
		const from = dateStartInclusive(els.from.value);
		const to = dateEndInclusive(els.to.value);

		state.filtered = state.rows.filter(r => {
			if (hasSel && !sel.includes(r.model)) return false;
			if (from && r.date < from) return false;
			if (to && r.date > to) return false;
			return true;
		});

		renderAll();
	}

	function resetFilters() {
		els.from.value = '';
		els.to.value = '';
		// legacy select (if present)
		if (els.modelFilter?.options) for (const opt of els.modelFilter.options) opt.selected = false;
		// new dropdown
		state.selectedModels.clear();
		for (const cb of els.modelList?.querySelectorAll?.('input[type="checkbox"]') || []) cb.checked = false;
		updateModelButtonCaption();

		state.filtered = state.rows.slice();
		renderAll();
	}

	// Rendering
	function clearUI() {
		els.kpiReq.textContent = '-';
		els.kpiOpenRouterCost.textContent = '-';
		els.kpiTotalCost.textContent = '-';
		els.kpiAvg.textContent = '-';
		els.kpiWin.textContent = '-';
		els.tableBody.innerHTML = '';
		if (state.charts.bar) { state.charts.bar.destroy(); state.charts.bar = null; }
		if (state.charts.line) { state.charts.line.destroy(); state.charts.line = null; }
	}

	function renderAll() {
		if (state.filtered.length === 0) {
			clearUI();
			return;
		}
		renderKPIs(state.filtered);
		renderTable(state.filtered);
		applyColumnVisibility(); // apply after table render
		renderBarByModel(state.filtered);
		renderLineOverTime(state.filtered);
	}

	function renderKPIs(rows) {
		const totalOpenRouter = rows.reduce((s, r) => s + r.total, 0);
		const totalByok = rows.reduce((s, r) => s + r.byok, 0);
		const totalWeb = rows.reduce((s, r) => s + r.web, 0);
		const totalFile = rows.reduce((s, r) => s + r.file, 0);
		const totalCache = rows.reduce((s, r) => s + r.cache, 0);
		const totalCost = totalOpenRouter + totalByok + totalWeb + totalFile + totalCache;
		const count = rows.length;
		const avg = count ? totalOpenRouter / count : 0;
		const minD = rows[0].date;
		const maxD = rows[rows.length - 1].date;
		const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

		els.kpiReq.textContent = fmtInt.format(count);
		els.kpiOpenRouterCost.textContent = fmtUSD_4dec.format(totalOpenRouter);
		els.kpiTotalCost.textContent = fmtUSD_4dec.format(totalCost);
		els.kpiAvg.textContent = count ? fmtUSD_6dec.format(avg) : '-';
		els.kpiWin.innerHTML = `${fmt(minD)}<br>${fmt(maxD)}`;
	}

	function renderTable(rows) {
		// Aggregate by model
		const byModel = new Map();
		for (const r of rows) {
			const m = byModel.get(r.model) || { total:0, web:0, cache:0, file:0, byok:0, tp:0, tc:0, tokenOutput:0, tr:0, req:0, genTime:0, ttft:0 };
			m.total += r.total;
			m.web += r.web;
			m.cache += r.cache;
			m.file += r.file;
			m.byok += r.byok;
			m.tp += r.tp;
			m.tc += r.tc;
			m.tokenOutput += (r.tc - r.tr);
			m.tr += r.tr;
			m.req += 1;
			m.genTime += r.genTime;
			m.ttft += r.ttft;
			byModel.set(r.model, m);
		}

		const sorted = [...byModel.entries()].sort((a, b) => b[1].total - a[1].total);

		// Debug: log aggregated data for first model
		if (sorted.length > 0) {
			console.log('Debug first model aggregation:', sorted[0][1]);
		}

		// Calculate totals for footer
		const totals = {
			models: sorted.length,
			req: 0,
			total: 0,
			byok: 0,
			web: 0,
			cache: 0,
			file: 0,
			tp: 0,
			tc: 0,
			tokenOutput: 0,
			tr: 0,
			genTime: 0,
			ttft: 0
		};

		for (const [, v] of sorted) {
			totals.req += v.req;
			totals.total += v.total;
			totals.byok += v.byok;
			totals.web += v.web;
			totals.cache += v.cache;
			totals.file += v.file;
			totals.tp += v.tp;
			totals.tc += v.tc;
			totals.tokenOutput += v.tokenOutput;
			totals.tr += v.tr;
			totals.genTime += v.genTime;
			totals.ttft += v.ttft;
		}

		// Calculate averages
		const avgTp = totals.req > 0 ? Math.round(totals.tp / totals.req) : 0;
		const avgTokenOutput = totals.req > 0 ? (totals.tokenOutput / totals.req) : 0;
		const avgTr = totals.req > 0 ? Math.round(totals.tr / totals.req) : 0;
		const avgGenTime = totals.req > 0 ? Math.round(totals.genTime / totals.req) : 0;
		const avgTtft = totals.req > 0 ? Math.round(totals.ttft / totals.req) : 0;

		els.tableBody.innerHTML = '';
		for (const [model, v] of sorted) {
			const avgGenTime = v.req > 0 ? Math.round(v.genTime / v.req) : 0;
			const avgTtft = v.req > 0 ? Math.round(v.ttft / v.req) : 0;
			const avgTp = v.req > 0 ? Math.round(v.tp / v.req) : 0;
			// Use 2 decimals for avgTokenOutput
			const avgTokenOutput = v.req > 0 ? (v.tokenOutput / v.req) : 0;
			const avgTr = v.req > 0 ? Math.round(v.tr / v.req) : 0;
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td data-col="model" class="model-col mono">${escapeHTML(model)}</td>
				<td data-col="req" class="mono">${v.req === 0 ? `<span class="zero-value">${fmtInt.format(v.req)}</span>` : fmtInt.format(v.req)}</td>
				<td data-col="total" class="mono">${v.total === 0 ? `<span class="zero-value">${fmtUSD_4dec.format(v.total)}</span>` : fmtUSD_4dec.format(v.total)}</td>
				<td data-col="byok" class="mono">${v.byok === 0 ? `<span class="zero-value">${fmtUSD.format(v.byok)}</span>` : fmtUSD.format(v.byok)}</td>
				<td data-col="web" class="mono">${v.web === 0 ? `<span class="zero-value">${fmtUSD.format(v.web)}</span>` : fmtUSD.format(v.web)}</td>
				<td data-col="cache" class="mono">${v.cache === 0 ? `<span class="zero-value">${fmtUSD.format(v.cache)}</span>` : fmtUSD.format(v.cache)}</td>
				<td data-col="file" class="mono">${v.file === 0 ? `<span class="zero-value">${fmtUSD.format(v.file)}</span>` : fmtUSD.format(v.file)}</td>
				<td data-col="tp" class="mono">${v.tp === 0 ? `<span class="zero-value">${fmtInt.format(v.tp)}</span>` : fmtInt.format(v.tp)}</td>
				<td data-col="avgTp" class="mono">${avgTp === 0 ? `<span class="zero-value">${fmtInt.format(avgTp)}</span>` : fmtInt.format(avgTp)}</td>
				<td data-col="tokenOutput" class="mono">${v.tokenOutput === 0 ? `<span class="zero-value">${fmtInt.format(v.tokenOutput)}</span>` : fmtInt.format(v.tokenOutput)}</td>
				<td data-col="avgTokenOutput" class="mono">${avgTokenOutput === 0 ? `<span class="zero-value">${avgTokenOutput.toFixed(2)}</span>` : avgTokenOutput.toFixed(2)}</td>
				<td data-col="tr" class="mono">${v.tr === 0 ? `<span class="zero-value">${fmtInt.format(v.tr)}</span>` : fmtInt.format(v.tr)}</td>
				<td data-col="avgTr" class="mono">${avgTr === 0 ? `<span class="zero-value">${fmtInt.format(avgTr)}</span>` : fmtInt.format(avgTr)}</td>
				<td data-col="tc" class="mono">${v.tc === 0 ? `<span class="zero-value">${fmtInt.format(v.tc)}</span>` : fmtInt.format(v.tc)}</td>
				<td data-col="genTime" class="mono">${avgGenTime === 0 ? `<span class="zero-value">${fmtInt.format(avgGenTime)}ms</span>` : `${fmtInt.format(avgGenTime)}ms`}</td>
				<td data-col="ttft" class="mono">${avgTtft === 0 ? `<span class="zero-value">${fmtInt.format(avgTtft)}ms</span>` : `${fmtInt.format(avgTtft)}ms`}</td>
			`;
			els.tableBody.appendChild(tr);
		}

		// Add totals row to footer
		const tableFooter = document.querySelector('#costTable tfoot');
		if (tableFooter) {
			tableFooter.innerHTML = `
				<tr>
					<td data-col="model" class="model-col mono">TOTAL (${totals.models} models)</td>
					<td data-col="req" class="mono">${totals.req === 0 ? `<span class="zero-value">${fmtInt.format(totals.req)}</span>` : fmtInt.format(totals.req)}</td>
					<td data-col="total" class="mono">${totals.total === 0 ? `<span class="zero-value">${fmtUSD_4dec.format(totals.total)}</span>` : fmtUSD_4dec.format(totals.total)}</td>
					<td data-col="byok" class="mono">${totals.byok === 0 ? `<span class="zero-value">${fmtUSD.format(totals.byok)}</span>` : fmtUSD.format(totals.byok)}</td>
					<td data-col="web" class="mono">${totals.web === 0 ? `<span class="zero-value">${fmtUSD.format(totals.web)}</span>` : fmtUSD.format(totals.web)}</td>
					<td data-col="cache" class="mono">${totals.cache === 0 ? `<span class="zero-value">${fmtUSD.format(totals.cache)}</span>` : fmtUSD.format(totals.cache)}</td>
					<td data-col="file" class="mono">${totals.file === 0 ? `<span class="zero-value">${fmtUSD.format(totals.file)}</span>` : fmtUSD.format(totals.file)}</td>
					<td data-col="tp" class="mono">${totals.tp === 0 ? `<span class="zero-value">${fmtInt.format(totals.tp)}</span>` : fmtInt.format(totals.tp)}</td>
					<td data-col="avgTp" class="mono">${avgTp === 0 ? `<span class="zero-value">${fmtInt.format(avgTp)}</span>` : fmtInt.format(avgTp)}</td>
					<td data-col="tokenOutput" class="mono">${totals.tokenOutput === 0 ? `<span class="zero-value">${fmtInt.format(totals.tokenOutput)}</span>` : fmtInt.format(totals.tokenOutput)}</td>
					<td data-col="avgTokenOutput" class="mono">${avgTokenOutput === 0 ? `<span class="zero-value">${avgTokenOutput.toFixed(2)}</span>` : avgTokenOutput.toFixed(2)}</td>
					<td data-col="tr" class="mono">${totals.tr === 0 ? `<span class="zero-value">${fmtInt.format(totals.tr)}</span>` : fmtInt.format(totals.tr)}</td>
					<td data-col="avgTr" class="mono">${avgTr === 0 ? `<span class="zero-value">${fmtInt.format(avgTr)}</span>` : fmtInt.format(avgTr)}</td>
					<td data-col="tc" class="mono">${totals.tc === 0 ? `<span class="zero-value">${fmtInt.format(totals.tc)}</span>` : fmtInt.format(totals.tc)}</td>
					<td data-col="genTime" class="mono">${avgGenTime === 0 ? `<span class="zero-value">${fmtInt.format(avgGenTime)}ms</span>` : `${fmtInt.format(avgGenTime)}ms`}</td>
					<td data-col="ttft" class="mono">${avgTtft === 0 ? `<span class="zero-value">${fmtInt.format(avgTtft)}ms</span>` : `${fmtInt.format(avgTtft)}ms`}</td>
				</tr>
			`;
		}
	}

	function renderBarByModel(rows) {
		const totals = new Map();
		for (const r of rows) totals.set(r.model, (totals.get(r.model) || 0) + r.total);

		const sorted = [...totals.entries()].sort((a,b) => b[1]-a[1]);
		const top = sorted.slice(0, 15);
		const labels = top.map(([m]) => m);
		const data = top.map(([_, v]) => v);

		if (state.charts.bar) { 
			state.charts.bar.destroy(); 
			state.charts.bar = null; 
		}
		
		// Ensure canvas is properly sized before creating chart
		const ctx = els.barCanvas.getContext('2d');
		ctx.clearRect(0, 0, els.barCanvas.width, els.barCanvas.height);
		
		state.charts.bar = new Chart(els.barCanvas, {
			type: 'bar',
			data: { labels, datasets: [{ label: 'Total Cost (USD)', data, backgroundColor: '#40a0ff' }] },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				layout: { padding: { bottom: 0 } },
				plugins: { legend: { display: false } },
				scales: {
					y: { ticks: { callback: v => fmtUSD.format(v) } },
					x: { ticks: { maxRotation: 60, minRotation: 0, autoSkip: true } }
				},
				animation: { duration: 0 } // Disable animations to prevent growth issues
			}
		});
	}

	function renderLineOverTime(rows) {
		// Group by hour (local)
		const bucket = new Map(); // key: YYYY-MM-DD HH
		for (const r of rows) {
			const d = r.date;
			const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
			bucket.set(key, (bucket.get(key) || 0) + r.total);
		}
		const sorted = [...bucket.entries()].sort((a,b) => a[0].localeCompare(b[0]));
		const labels = sorted.map(([k]) => k);
		const data = sorted.map(([_, v]) => v);

		if (state.charts.line) { 
			state.charts.line.destroy(); 
			state.charts.line = null; 
		}
		
		// Ensure canvas is properly sized before creating chart
		const ctx = els.lineCanvas.getContext('2d');
		ctx.clearRect(0, 0, els.lineCanvas.width, els.lineCanvas.height);
		
		state.charts.line = new Chart(els.lineCanvas, {
			type: 'line',
			data: { labels, datasets: [{ label: 'Total Cost (USD)', data, borderColor: '#40a0ff', backgroundColor: 'rgba(64,160,255,0.25)', tension: 0.2, fill: true }] },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				layout: { padding: { bottom: 0 } },
				plugins: { legend: { display: false } },
				interaction: { mode: 'index', intersect: false },
				scales: {
					y: { ticks: { callback: v => fmtUSD.format(v) } },
					x: { ticks: { maxRotation: 45, autoSkip: true } }
				},
				animation: { duration: 0 } // Disable animations to prevent growth issues
			}
		});
	}

	// Load column visibility from localStorage
	function loadColumnVisibility() {
		try {
			const saved = localStorage.getItem('openrouter-column-visibility');
			if (saved) {
				const parsed = JSON.parse(saved);
				// Merge saved preferences with defaults for any missing columns
				return { ...DEFAULT_COL_VISIBILITY, ...parsed };
			}
		} catch (e) {
			console.warn('Failed to load column visibility from localStorage:', e);
		}
		// Return defaults if no saved state or error
		return { ...DEFAULT_COL_VISIBILITY };
	}

	// Save column visibility to localStorage
	function saveColumnVisibility() {
		try {
			localStorage.setItem('openrouter-column-visibility', JSON.stringify(state.colVisibility));
		} catch (e) {
			console.warn('Failed to save column visibility to localStorage:', e);
		}
	}

	// Apply visibility to headers and cells
	function applyColumnVisibility() {
		const table = document.getElementById('costTable');
		if (!table) return;
		for (const key of COL_KEYS) {
			const show = !!state.colVisibility[key];
			table.querySelectorAll(`[data-col="${key}"]`).forEach(el => {
				if (show) el.classList.remove('col-hidden');
				else el.classList.add('col-hidden');
			});
		}
		// Save preferences after applying changes
		saveColumnVisibility();
	}

	// Column filter UI
	function initColumnFilterUI() {
		if (!els.colList) return;
		els.colList.innerHTML = '';

		for (const key of COL_KEYS) {
			const label = COL_LABELS[key] || key;
			const id = `col_${key}`;
			const row = document.createElement('label');
			row.className = 'model-item';
			// Make model, req, and total columns non-hideable
			const nonHideable = key === 'model' || key === 'req' || key === 'total';
			row.innerHTML = `
				<input type="checkbox" id="${id}" data-key="${key}" ${state.colVisibility[key] ? 'checked' : ''} ${nonHideable ? 'disabled' : ''}/>
				<span class="mono">${label}</span>
			`;
			const cb = row.querySelector('input');
			cb.addEventListener('change', () => {
				const k = cb.getAttribute('data-key');
				if (nonHideable) { cb.checked = true; return; }
				state.colVisibility[k] = cb.checked;
				applyColumnVisibility();
			});
			els.colList.appendChild(row);
		}

		// Insert Default button between All and None
		const defaultBtn = document.createElement('button');
		defaultBtn.id = 'colSelectDefault';
		defaultBtn.className = 'btn mini';
		defaultBtn.type = 'button';
		defaultBtn.textContent = 'Default';
		// Place between All and None
		const panelHead = els.colPanel?.querySelector('.model-panel-head');
		if (panelHead) {
			const allBtn = panelHead.querySelector('#colSelectAll');
			const noneBtn = panelHead.querySelector('#colSelectNone');
			if (allBtn && noneBtn) {
				panelHead.insertBefore(defaultBtn, noneBtn);
			}
		}

		// All/None/Default
		els.colAll?.addEventListener('click', () => {
			for (const k of COL_KEYS) {
				if (k === 'model' || k === 'req' || k === 'total') continue;
				state.colVisibility[k] = true;
			}
			for (const cb of els.colList.querySelectorAll('input[type="checkbox"]')) {
				if (cb.disabled) continue;
				cb.checked = true;
			}
			applyColumnVisibility();
		});
		defaultBtn.addEventListener('click', () => {
			// Restore default using the constant
			for (const k of COL_KEYS) {
				state.colVisibility[k] = DEFAULT_COL_VISIBILITY[k];
			}
			for (const cb of els.colList.querySelectorAll('input[type="checkbox"]')) {
				const k = cb.getAttribute('data-key');
				cb.checked = !!DEFAULT_COL_VISIBILITY[k];
			}
			applyColumnVisibility();
		});
		els.colNone?.addEventListener('click', () => {
			for (const k of COL_KEYS) {
				if (k === 'model' || k === 'req' || k === 'total') continue;
				state.colVisibility[k] = false;
			}
			for (const cb of els.colList.querySelectorAll('input[type="checkbox"]')) {
				if (cb.disabled) continue;
				cb.checked = false;
			}
			applyColumnVisibility();
		});

		// Toggle panel
		els.colBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			const hidden = els.colPanel.hasAttribute('hidden');
			if (hidden) {
				els.colPanel.removeAttribute('hidden');
				positionColPanel();
			} else {
				els.colPanel.setAttribute('hidden', '');
			}
		});
		document.addEventListener('click', (e) => {
			if (!els.colPanel) return;
			if (els.colPanel.hasAttribute('hidden')) return;
			if (els.colPanel.contains(e.target) || els.colBtn.contains(e.target)) return;
			els.colPanel.setAttribute('hidden', '');
		});
		window.addEventListener('resize', () => {
			if (!els.colPanel?.hasAttribute('hidden')) positionColPanel();
		});

		// Ensure defaults (hide cache, file, ttft) applied to current DOM
		applyColumnVisibility();
	}

	function positionColPanel() {
		if (!els.colPanel || !els.colBtn) return;
		els.colPanel.classList.remove('align-right');
		els.colPanel.style.maxWidth = Math.min(360, window.innerWidth - 16) + 'px';
		const btnRect = els.colBtn.getBoundingClientRect();
		const panelRect = els.colPanel.getBoundingClientRect();
		const margin = 8;
		const projectedRight = btnRect.left + panelRect.width;
		if (projectedRight > window.innerWidth - margin) {
			els.colPanel.classList.add('align-right');
		}
	}

	// Utils
	function escapeHTML(s) {
		return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
	}

	// File handling functions
	function handleFile(file) {
		if (!file || !file.name.toLowerCase().endsWith('.csv')) {
			alert('Please select a CSV file.');
			return;
		}
		
		const reader = new FileReader();
		reader.onload = () => {
			parseCSV(String(reader.result || ''));
			updateDropZoneState(file.name);
		};
		reader.readAsText(file);
	}

	function updateDropZoneState(filename) {
		if (!els.dropZone) return;
		
		if (filename) {
			els.dropZone.classList.add('has-file');
			const textEl = els.dropZone.querySelector('.drop-zone-text div:first-child');
			if (textEl) textEl.textContent = filename;
		} else {
			els.dropZone.classList.remove('has-file');
			const textEl = els.dropZone.querySelector('.drop-zone-text div:first-child');
			if (textEl) textEl.textContent = 'Drop CSV file here';
		}
	}

	// Events
	els.file?.addEventListener('change', (e) => {
		const f = e.target.files?.[0];
		if (f) handleFile(f);
	});

	// Drop zone events
	els.dropZone?.addEventListener('click', () => {
		els.file?.click();
	});

	els.dropZone?.addEventListener('dragover', (e) => {
		e.preventDefault();
		els.dropZone.classList.add('drag-over');
	});

	els.dropZone?.addEventListener('dragleave', (e) => {
		e.preventDefault();
		if (!els.dropZone.contains(e.relatedTarget)) {
			els.dropZone.classList.remove('drag-over');
		}
	});

	els.dropZone?.addEventListener('drop', (e) => {
		e.preventDefault();
		els.dropZone.classList.remove('drag-over');
		
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFile(files[0]);
		}
	});

	els.btnApply?.addEventListener('click', applyFilters);
	els.btnReset?.addEventListener('click', resetFilters);

	// Remove legacy auto-apply on select change (keep if select exists)
	els.modelFilter?.addEventListener('change', applyFilters);

	// Initial empty state
	clearUI();

	// Initialize column filter UI once
	initColumnFilterUI();
	// Ensure header reflects saved visibility on load
	applyColumnVisibility();
})();