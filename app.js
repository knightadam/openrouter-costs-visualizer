/* Minimal CSV -> dashboard */
(() => {
	const els = {
		file: document.getElementById('csvFile'),
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

		btnApply: document.getElementById('applyFilters'),
		btnReset: document.getElementById('resetFilters'),
		kpiTotal: document.getElementById('kpiTotalCost'),
		kpiReq: document.getElementById('kpiRequests'),
		kpiAvg: document.getElementById('kpiAvgCost'),
		kpiWin: document.getElementById('kpiWindow'),
		tableBody: document.querySelector('#costTable tbody'),
		barCanvas: document.getElementById('barCostByModel'),
		lineCanvas: document.getElementById('lineCostOverTime'),
	};

	let COL = {};

	const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const fmtUSD_total = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });
	const fmtInt = new Intl.NumberFormat('en-US');

	const state = {
		rows: [], filtered: [], models: new Set(),
		selectedModels: new Set(),
		charts: { bar: null, line: null },
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
		
		// Debug: log first few rows to check data
		if (state.rows.length < 3) {
			console.log('Debug row:', {
				parts: parts.length,
				genTimeRaw,
				genTime,
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
			genTime: header.indexOf('generation_time_ms')
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
		els.kpiTotal.textContent = '-';
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
		renderBarByModel(state.filtered);
		renderLineOverTime(state.filtered);
	}

	function renderKPIs(rows) {
		const total = rows.reduce((s, r) => s + r.total, 0);
		const count = rows.length;
		const avg = count ? total / count : 0;
		const minD = rows[0].date;
		const maxD = rows[rows.length - 1].date;
		const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

		els.kpiReq.textContent = fmtInt.format(count);
		els.kpiTotal.textContent = fmtUSD.format(total);
		els.kpiAvg.textContent = count ? fmtUSD.format(avg) : '-';
		els.kpiWin.innerHTML = `${fmt(minD)}<br>${fmt(maxD)}`;
	}

	function renderTable(rows) {
		// Aggregate by model
		const byModel = new Map();
		for (const r of rows) {
			const m = byModel.get(r.model) || { total:0, web:0, byok:0, tp:0, tc:0, tr:0, req:0, genTime:0 };
			m.total += r.total;
			m.web += r.web;
			m.byok += r.byok;
			m.tp += r.tp;
			m.tc += r.tc;
			m.tr += r.tr;
			m.req += 1;
			m.genTime += r.genTime;
			byModel.set(r.model, m);
		}

		const sorted = [...byModel.entries()].sort((a, b) => b[1].total - a[1].total);

		// Debug: log aggregated data for first model
		if (sorted.length > 0) {
			console.log('Debug first model aggregation:', sorted[0][1]);
		}

		els.tableBody.innerHTML = '';
		for (const [model, v] of sorted) {
			const avgGenTime = v.req > 0 ? Math.round(v.genTime / v.req) : 0;
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td class="model-col mono">${escapeHTML(model)}</td>
				<td class="mono">${v.req === 0 ? `<span class="zero-value">${fmtInt.format(v.req)}</span>` : fmtInt.format(v.req)}</td>
				<td class="mono">${v.total === 0 ? `<span class="zero-value">${fmtUSD_total.format(v.total)}</span>` : fmtUSD_total.format(v.total)}</td>
				<td class="mono">${v.web === 0 ? `<span class="zero-value">${fmtUSD.format(v.web)}</span>` : fmtUSD.format(v.web)}</td>
				<td class="mono">${v.byok === 0 ? `<span class="zero-value">${fmtUSD.format(v.byok)}</span>` : fmtUSD.format(v.byok)}</td>
				<td class="mono">${v.tp === 0 ? `<span class="zero-value">${fmtInt.format(v.tp)}</span>` : fmtInt.format(v.tp)}</td>
				<td class="mono">${v.tc === 0 ? `<span class="zero-value">${fmtInt.format(v.tc)}</span>` : fmtInt.format(v.tc)}</td>
				<td class="mono">${v.tr === 0 ? `<span class="zero-value">${fmtInt.format(v.tr)}</span>` : fmtInt.format(v.tr)}</td>
				<td class="mono">${avgGenTime === 0 ? `<span class="zero-value">${fmtInt.format(avgGenTime)}ms</span>` : `${fmtInt.format(avgGenTime)}ms`}</td>
			`;
			els.tableBody.appendChild(tr);
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

	// Utils
	function escapeHTML(s) {
		return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
	}

	// Events
	els.file?.addEventListener('change', (e) => {
		const f = e.target.files?.[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => parseCSV(String(reader.result || ''));
		reader.readAsText(f);
	});

	els.btnApply?.addEventListener('click', applyFilters);
	els.btnReset?.addEventListener('click', resetFilters);

	// Remove legacy auto-apply on select change (keep if select exists)
	els.modelFilter?.addEventListener('change', applyFilters);

	// Initial empty state
	clearUI();
})();