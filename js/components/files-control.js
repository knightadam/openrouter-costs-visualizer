import { els } from '../utils/dom.js';
import { state } from '../state.js';
import { parseCSV, escapeHTML } from '../services/parser.js';

function updateDropZoneState(count) {
	if (!els.dropZone) return;
	if (count > 0) {
		els.dropZone.classList.add('has-file');
		const textEl = els.dropZone.querySelector('.drop-zone-text div:first-child');
		if (textEl) textEl.textContent = count === 1 ? 'Add more files' : `${count} files added`;
	} else {
		els.dropZone.classList.remove('has-file');
		const textEl = els.dropZone.querySelector('.drop-zone-text div:first-child');
		if (textEl) textEl.textContent = 'Drop CSV files here';
	}
}

export function positionFilesContainer() {
	if (!els.filesContainer || els.filesContainer.hasAttribute('hidden')) return;
	const anchor = els.filesList;
	if (!anchor) return;

	const a = anchor.getBoundingClientRect();
	const panel = els.filesContainer;
	const panelWidth = panel.offsetWidth || 320;
	const margin = 6;

	let left = Math.round(a.left + (a.width / 2) - (panelWidth / 2));
	left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
	const top = Math.round(a.bottom + margin);

	panel.style.left = left + 'px';
	panel.style.top = top + 'px';
}

function updateFilesListUI(onChange) {
	els.filesCount.textContent = `${state.files.length} file${state.files.length !== 1 ? 's' : ''}`;

	if (state.files.length > 0) {
		els.filesList.removeAttribute('hidden');
	} else {
		els.filesList.setAttribute('hidden', '');
		els.filesContainer.setAttribute('hidden', '');
		els.filesList?.classList.remove('open');
		return;
	}

	els.filesContainer.innerHTML = '';

	for (const file of state.files) {
		const row = document.createElement('div');
		row.className = 'file-item';
		row.innerHTML = `
			<span class="file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</span>
			<button class="file-remove" data-file-id="${file.id}" title="Remove file">&times;</button>
		`;
		const removeBtn = row.querySelector('.file-remove');
		removeBtn.addEventListener('click', () => {
			state.files = state.files.filter(f => f.id !== file.id);
			updateFilesListUI(onChange);
			if (state.files.length === 0) updateDropZoneState(0);
			onChange?.();
		});
		els.filesContainer.appendChild(row);
	}

	if (!els.filesContainer.hasAttribute('hidden')) positionFilesContainer();
}

function addFile(file, onChange) {
	const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	const reader = new FileReader();
	reader.onload = () => {
		try {
			const { rows } = parseCSV(reader.result || '');
			state.files.push({ id: fileId, name: file.name, data: rows });
			updateFilesListUI(onChange);
			onChange?.();
		} catch (e) {
			alert(String(e?.message || e));
		}
	};
	reader.readAsText(file);
}

function handleFiles(files, onChange) {
	if (!files || !files.length) return;
	Array.from(files).forEach(f => {
		if (f.name.toLowerCase().endsWith('.csv')) addFile(f, onChange);
	});
	updateDropZoneState(files.length);
}

export function clearAllFiles(onChange) {
	state.files = [];
	updateFilesListUI(onChange);
	updateDropZoneState(0);
	onChange?.();
}

export function initFilesControl(onChange) {
	// input
	els.file?.addEventListener('change', e => {
		const files = e.target.files;
		if (files && files.length > 0) handleFiles(files, onChange);
	});

	// drop zone
	els.dropZone?.addEventListener('click', () => els.file?.click());
	els.dropZone?.addEventListener('dragover', e => {
		e.preventDefault();
		els.dropZone.classList.add('drag-over');
	});
	els.dropZone?.addEventListener('dragleave', e => {
		e.preventDefault();
		if (!els.dropZone.contains(e.relatedTarget)) els.dropZone.classList.remove('drag-over');
	});
	els.dropZone?.addEventListener('drop', e => {
		e.preventDefault();
		els.dropZone.classList.remove('drag-over');
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) handleFiles(files, onChange);
	});

	// clear button
	els.clearAllFiles?.addEventListener('click', () => clearAllFiles(onChange));

	// files panel toggle
	els.filesCount?.addEventListener('click', e => {
		e.stopPropagation();
		const hidden = els.filesContainer.hasAttribute('hidden');
		if (hidden && state.files.length > 0) {
			els.filesContainer.removeAttribute('hidden');
			els.filesList?.classList.add('open');
			positionFilesContainer();
		} else {
			els.filesContainer.setAttribute('hidden', '');
			els.filesList?.classList.remove('open');
		}
	});
	document.addEventListener('click', e => {
		if (els.filesContainer && !els.filesContainer.hasAttribute('hidden')) {
			if (!els.filesContainer.contains(e.target) && !els.filesCount.contains(e.target)) {
				els.filesContainer.setAttribute('hidden', '');
				els.filesList?.classList.remove('open');
			}
		}
	});
	window.addEventListener('resize', positionFilesContainer);
	window.addEventListener('scroll', positionFilesContainer, { passive: true });

	// initial UI
	updateFilesListUI(onChange);
	updateDropZoneState(0);
}
