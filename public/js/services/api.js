export async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const generateDeck = (payload) => postJson('/api/generate', payload);
export const regenerateSlide = (payload) => postJson('/api/regenerate-slide', payload);
export const getDesignSuggestions = (payload) => postJson('/api/design-suggestions', payload);
export const exportPdf = (payload) => postJson('/api/export/pdf', payload);
export const exportPptx = (payload) => postJson('/api/export/pptx', payload);
