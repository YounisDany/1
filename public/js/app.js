import { generateDeck, regenerateSlide, getDesignSuggestions, exportPdf, exportPptx } from './services/api.js';
import { markdownToSlides } from './utils/markdown.js';

const form = document.getElementById('generatorForm');
const slidesContainer = document.getElementById('slidesContainer');
const markdownEditor = document.getElementById('markdownEditor');
const loading = document.getElementById('loading');
const errorEl = document.getElementById('error');
const suggestBtn = document.getElementById('suggestBtn');
const suggestionsList = document.getElementById('suggestions');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportPptBtn = document.getElementById('exportPptBtn');
const applyEditsBtn = document.getElementById('applyEditsBtn');

let currentDeck = null;

function setLoading(state) {
  loading.classList.toggle('hidden', !state);
}

function setError(message = '') {
  errorEl.textContent = message;
}

function autoSelectTheme(topic) {
  const t = topic.toLowerCase();
  if (/finance|enterprise|strategy|business/.test(t)) return 'corporate';
  if (/art|design|brand|creative|story/.test(t)) return 'creative';
  if (/security|cloud|devops|data/.test(t)) return 'dark';
  return 'light';
}

function renderSlides(slides, theme) {
  slidesContainer.innerHTML = '';
  slides.forEach((slide, idx) => {
    const section = document.createElement('section');
    section.className = 'slide';
    section.style.setProperty('--bg', theme.bg);
    section.innerHTML = `
      <div class="media" style="background-image:url('${slide.image || ''}')"></div>
      <div class="content">
        <h2 contenteditable="true" data-field="title" data-idx="${idx}">${slide.title}</h2>
        <ul>${slide.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
        <p>${slide.paragraph || ''}</p>
        <button type="button" data-regenerate="${idx}">Regenerate Slide</button>
      </div>`;
    slidesContainer.appendChild(section);
  });
}

function bindRegenerateButtons() {
  document.querySelectorAll('[data-regenerate]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!currentDeck) return;
      const idx = Number(button.dataset.regenerate);
      try {
        button.disabled = true;
        const topic = document.getElementById('topic').value;
        const tone = document.getElementById('tone').value;
        const updated = await regenerateSlide({ topic, tone, slideIndex: idx });
        currentDeck.slides[idx] = updated;
        markdownEditor.value = currentDeckToMarkdown();
        renderSlides(currentDeck.slides, currentDeck.theme);
        bindRegenerateButtons();
      } catch (error) {
        setError(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function currentDeckToMarkdown() {
  return currentDeck.slides
    .map((slide) => `# ${slide.title}\n${slide.bullets.map((b) => `- ${b}`).join('\n')}\n\n${slide.paragraph || ''}\n${slide.notes ? `\n> Notes: ${slide.notes}` : ''}`)
    .join('\n\n');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  setLoading(true);

  const topic = document.getElementById('topic').value.trim();
  const tone = document.getElementById('tone').value;
  const slideCount = Number(document.getElementById('slideCount').value);
  const selectedTheme = document.getElementById('theme');
  selectedTheme.value = autoSelectTheme(topic);

  try {
    const deck = await generateDeck({ topic, tone, slideCount, theme: selectedTheme.value });
    currentDeck = deck;
    markdownEditor.value = deck.markdown;
    renderSlides(deck.slides, deck.theme);
    bindRegenerateButtons();
    exportPdfBtn.disabled = false;
    exportPptBtn.disabled = false;
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
});

applyEditsBtn.addEventListener('click', () => {
  if (!currentDeck) return;
  const parsed = markdownToSlides(markdownEditor.value);
  currentDeck.slides = parsed.map((slide, idx) => ({ ...currentDeck.slides[idx], ...slide }));
  renderSlides(currentDeck.slides, currentDeck.theme);
  bindRegenerateButtons();
});

suggestBtn.addEventListener('click', async () => {
  const topic = document.getElementById('topic').value || 'your topic';
  const tone = document.getElementById('tone').value;
  try {
    const { hints } = await getDesignSuggestions({ topic, tone });
    suggestionsList.innerHTML = hints.map((hint) => `<li>${hint}</li>`).join('');
  } catch (error) {
    setError(error.message);
  }
});

exportPdfBtn.addEventListener('click', async () => {
  if (!currentDeck) return;
  try {
    const deckHtml = Array.from(slidesContainer.children).map((slide) => slide.outerHTML).join('');
    const { file } = await exportPdf({ deckHtml });
    window.open(file, '_blank');
  } catch (error) {
    setError(error.message);
  }
});

exportPptBtn.addEventListener('click', async () => {
  if (!currentDeck) return;
  try {
    const { file } = await exportPptx({ deck: { slides: currentDeck.slides, theme: currentDeck.theme } });
    window.open(file, '_blank');
  } catch (error) {
    setError(error.message);
  }
});
