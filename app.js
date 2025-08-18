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

	const COL = {
		id: 0, created: 1, total: 2, web: 3, cache: 4, file: 5, byok: 6,
		tokPrompt: 7, tokCompletion: 8, tokReasoning: 9, model: 10,
	};

	const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 6 });
	const fmtInt = new Intl.NumberFormat('en-US');
	// NEW: 2-decimal formatter for compact table cells
	const fmtUSD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
		if (parts.length < 11) return null;

		const ts = parts[COL.created]?.trim();
		let d = ts ? new Date(ts.replace(' ', 'T')) : null;
		// ensure valid date
		if (d && isNaN(+d)) d = null;
		const model = (parts[COL.model] || '').trim();

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
		};
	}

	function parseCSV(text) {
		const lines = text.split(/\r?\n/).filter(l => l.trim().length);
		const rows = [];
		const models = new Set();

		for (const line of lines) {
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
		els.kpiTotal.textContent = '-';
		els.kpiReq.textContent = '-';
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

		els.kpiTotal.textContent = fmtUSD.format(total);
		els.kpiReq.textContent = fmtInt.format(count);
		els.kpiAvg.textContent = count ? fmtUSD.format(avg) : '-';
		els.kpiWin.textContent = `${fmt(minD)} → ${fmt(maxD)}`;
	}

	function renderTable(rows) {
		// Aggregate by model
		const byModel = new Map();
		for (const r of rows) {
			const m = byModel.get(r.model) || { total:0, web:0, byok:0, tp:0, tc:0, tr:0, req:0 };
			m.total += r.total;
			m.web += r.web;
			m.byok += r.byok;
			m.tp += r.tp;
			m.tc += r.tc;
			m.tr += r.tr;
			m.req += 1;
			byModel.set(r.model, m);
		}

		const sorted = [...byModel.entries()].sort((a, b) => b[1].total - a[1].total);

		els.tableBody.innerHTML = '';
		for (const [model, v] of sorted) {
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td class="mono">${escapeHTML(model)}</td>
				<td class="mono">${fmtUSD2.format(v.total)}</td>
				<td class="mono">${fmtUSD2.format(v.web)}</td>
				<td class="mono">${fmtUSD2.format(v.byok)}</td>
				<td class="mono">${fmtInt.format(v.tp)}</td>
				<td class="mono">${fmtInt.format(v.tc)}</td>
				<td class="mono">${fmtInt.format(v.tr)}</td>
				<td class="mono">${fmtInt.format(v.req)}</td>
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
