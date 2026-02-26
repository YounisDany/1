export function markdownToSlides(markdown) {
  const chunks = markdown
    .split(/\n(?=# )/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const title = lines[0].replace(/^#\s*/, '').trim();
    const bullets = lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
    const paragraph = lines.filter((line) => line && !line.startsWith('#') && !line.startsWith('- ') && !line.startsWith('>')).join(' ');
    const notes = lines.find((line) => line.startsWith('> Notes:'))?.replace('> Notes:', '').trim() || '';

    return { title, bullets, paragraph, notes };
  });
}
