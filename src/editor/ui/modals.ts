import { closeModal } from '../state';
import { loadBibleTranslationSetting } from '../services/verseLookup';
import { populateQASectionDropdown } from './outlinePanel';

export { closeModal };

export function openModal(modalId: string): void {
  const modal = document.getElementById(modalId);
  if (modal) {
    // Populate Q&A section dropdown if opening that modal
    if (modalId === 'qa-pause-modal') {
      populateQASectionDropdown();
    }
    // Load current Bible translation setting for verse modal
    if (modalId === 'verse-modal') {
      loadBibleTranslationSetting();
    }
    document.querySelectorAll('.modal.is-open').forEach((openModalEl) => {
      openModalEl.classList.remove('is-open');
      openModalEl.setAttribute('aria-hidden', 'true');
    });
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }
}
