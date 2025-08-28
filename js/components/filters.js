import { els } from '../utils/dom.js';
import { state } from '../state.js';

export function updateModelButtonCaption() {
	if (!els.modelBtn) return;
	const n = state.selectedModels.size;
	els.modelBtn.textContent = n === 0 ? 'All models' : `${n} model${n>1?'s':''} selected`;
}

export function populateModelFilter(models) {
	if (!els.modelList) return;
	els.modelList.innerHTML = '';
	const arr = [...models].sort();
	for (const m of arr) {
		const id = 'mdl_' + btoa(m).replace(/=+$/,'');
		const wrap = document.createElement('label');
		wrap.className = 'model-item';
		wrap.innerHTML = `
			<input type="checkbox" value="${m}" id="${id}" />
			<span class="mono">${m}</span>
		`;
		const input = wrap.querySelector('input');
		input.addEventListener('change', () => {
			if (input.checked) state.selectedModels.add(m);
			else state.selectedModels.delete(m);
			updateModelButtonCaption();
		});
		els.modelList.appendChild(wrap);
	}

	// reset and rebind head controls to avoid multiple listeners
	const newSearch = els.modelSearch.cloneNode(true);
	els.modelSearch.parentNode.replaceChild(newSearch, els.modelSearch);
	els.modelSearch = newSearch;

	const newAll = els.modelAll.cloneNode(true);
	els.modelAll.parentNode.replaceChild(newAll, els.modelAll);
	els.modelAll = newAll;

	const newNone = els.modelNone.cloneNode(true);
	els.modelNone.parentNode.replaceChild(newNone, els.modelNone);
	els.modelNone = newNone;

	els.modelSearch?.addEventListener('input', () => {
		const q = els.modelSearch.value.trim().toLowerCase();
		for (const el of els.modelList.children) {
			const txt = el.textContent.toLowerCase();
			el.style.display = txt.includes(q) ? '' : 'none';
		}
	});
	els.modelAll?.addEventListener('click', () => {
		if (state.models.size > 0) {
			state.selectedModels = new Set([...state.models]);
			for (const cb of els.modelList.querySelectorAll('input[type="checkbox"]')) cb.checked = true;
			updateModelButtonCaption();
		}
	});
	els.modelNone?.addEventListener('click', () => {
		state.selectedModels.clear();
		for (const cb of els.modelList.querySelectorAll('input[type="checkbox"]')) cb.checked = false;
		updateModelButtonCaption();
	});

	if (!populateModelFilter._dropdownSetup) {
		els.modelBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			if (state.models.size > 0) {
				const hidden = els.modelPanel.hasAttribute('hidden');
				if (hidden) {
					els.modelPanel.removeAttribute('hidden');
					positionModelPanel();
				} else {
					els.modelPanel.setAttribute('hidden', '');
				}
			}
		});
		document.addEventListener('click', (e) => {
			if (!els.modelPanel) return;
			if (els.modelPanel.hasAttribute('hidden')) return;
			if (els.modelPanel.contains(e.target) || els.modelBtn.contains(e.target)) return;
			els.modelPanel.setAttribute('hidden', '');
		});
		window.addEventListener('resize', () => {
			if (!els.modelPanel?.hasAttribute('hidden')) positionModelPanel();
		});
		populateModelFilter._dropdownSetup = true;
	}

	// keep only existing selections
	const existingSelected = new Set();
	for (const s of state.selectedModels) if (models.has(s)) existingSelected.add(s);
	state.selectedModels = existingSelected;

	for (const cb of els.modelList.querySelectorAll('input[type="checkbox"]')) {
		cb.checked = state.selectedModels.has(cb.value);
	}
	if (els.modelSearch) els.modelSearch.value = '';
	updateModelButtonCaption();
}

export function positionModelPanel() {
	if (!els.modelPanel || !els.modelBtn) return;
	els.modelPanel.classList.remove('align-right');
	els.modelPanel.style.maxWidth = Math.min(360, window.innerWidth - 16) + 'px';
	const btnRect = els.modelBtn.getBoundingClientRect();
	const panelRect = els.modelPanel.getBoundingClientRect();
	const margin = 8;
	const projectedRight = btnRect.left + panelRect.width;
	if (projectedRight > window.innerWidth - margin) els.modelPanel.classList.add('align-right');
}

export function getSelectedModels() {
	if (state.selectedModels.size > 0) return [...state.selectedModels];
	if (els.modelFilter?.selectedOptions?.length) {
		return Array.from(els.modelFilter.selectedOptions).map(o => o.value);
	}
	return [];
}

export function dateStartInclusive(dateStr) {
	if (!dateStr) return null;
	const d = new Date(dateStr + 'T00:00:00');
	return isNaN(+d) ? null : d;
}
export function dateEndInclusive(dateStr) {
	if (!dateStr) return null;
	const d = new Date(dateStr + 'T23:59:59.999');
	return isNaN(+d) ? null : d;
}

export function applyFilters(renderAll) {
	if (state.rows.length === 0) { renderAll([]); return; }
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

	renderAll(state.filtered);
}

export function resetFilters(renderAll) {
	els.from.value = '';
	els.to.value = '';
	if (els.modelFilter?.options) for (const opt of els.modelFilter.options) opt.selected = false;
	state.selectedModels.clear();
	for (const cb of els.modelList?.querySelectorAll?.('input[type="checkbox"]') || []) cb.checked = false;
	updateModelButtonCaption();

	state.filtered = state.rows.slice();
	renderAll(state.filtered);
}

export function initFilters({ onApply }) {
	els.btnApply?.addEventListener('click', () => applyFilters(onApply));
	els.btnReset?.addEventListener('click', () => resetFilters(onApply));
	// legacy select
	els.modelFilter?.addEventListener('change', () => applyFilters(onApply));
}
