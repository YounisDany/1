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
    const notesLine = lines.find((line) => line.startsWith('> Notes:') || line.startsWith('> ملاحظات:')) || '';
    const notes = notesLine.replace('> Notes:', '').replace('> ملاحظات:', '').trim();

    return { title, bullets, paragraph, notes };
  });
}
