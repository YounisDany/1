const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const marked = require('marked');
const PptxGenJS = require('pptxgenjs');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;
const HF_TEXT_MODEL = process.env.HF_TEXT_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
const HF_IMAGE_MODEL = process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';

const DEFAULT_GENERATED_DIR = path.join(__dirname, 'generated');
const SERVERLESS_TMP_DIR = '/tmp/generated';
const IS_SERVERLESS_RUNTIME =
  __dirname.startsWith('/var/task') || Boolean(process.env.VERCEL) || Boolean(process.env.AWS_EXECUTION_ENV);
const GENERATED_DIR =
  process.env.GENERATED_DIR || process.env.TMPDIR || (IS_SERVERLESS_RUNTIME ? SERVERLESS_TMP_DIR : DEFAULT_GENERATED_DIR);
const SLIDES_DIR = path.join(GENERATED_DIR, 'slides');
const IMAGES_DIR = path.join(GENERATED_DIR, 'images');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/generated', express.static(GENERATED_DIR));

const THEME_PRESETS = {
  light: { bg: 'F9FAFB', card: 'FFFFFF', accent: '2563EB', text: '111827' },
  dark: { bg: '0F172A', card: '1E293B', accent: '38BDF8', text: 'F1F5F9' },
  corporate: { bg: 'EEF2FF', card: 'FFFFFF', accent: '1D4ED8', text: '1F2937' },
  creative: { bg: '1A102B', card: '2A1F42', accent: 'F472B6', text: 'FAFAFF' }
};

async function ensureDirectories() {
  await fs.mkdir(SLIDES_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

function generatedUrlFor(filePath) {
  return `/generated/${path.relative(GENERATED_DIR, filePath).replace(/\\/g, '/')}`;
}

function generatedFilePathFromUrl(generatedUrl) {
  return path.join(GENERATED_DIR, generatedUrl.replace(/^\/generated\//, ''));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function fallbackSlides(topic, slideCount, tone) {
  return Array.from({ length: slideCount }).map((_, idx) => ({
    title: `${topic} - الشريحة ${idx + 1}`,
    bullets: [
      `النبرة المطلوبة: ${tone}`,
      `الفكرة الرئيسية ${idx + 1} حول ${topic}`,
      `خطوة عملية مقترحة ${idx + 1}`
    ],
    paragraph: `تلخص هذه الشريحة جانبًا مهمًا من ${topic} مع شرح موجز وأمثلة عملية تناسب الجمهور العربي.`,
    notes: `يمكنك إضافة أمثلة محلية وإحصاءات حديثة لدعم الرسالة.`
  }));
}

async function generateSlidesWithHF({ topic, tone, slideCount }) {
  if (!HF_TOKEN) {
    return fallbackSlides(topic, slideCount, tone);
  }

  const prompt = `أنت خبير في إعداد العروض التقديمية باللغة العربية. أعد فقط JSON صالح بهذا الشكل:\n{\n  "slides": [\n    {"title":"...","bullets":["..."],"paragraph":"...","notes":"..."}\n  ]\n}\nأنشئ ${slideCount} شرائح حول "${topic}" بنبرة ${tone}.\nالشروط:\n- الكتابة بالعربية الفصحى المبسطة.\n- العنوان قصير وجذاب لكل شريحة.\n- 3 إلى 5 نقاط موجزة لكل شريحة.\n- فقرة قصيرة داعمة.\n- ملاحظات متحدث اختيارية باللغة العربية.`;

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_TEXT_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 1200, temperature: 0.7, return_full_text: false }
    })
  });

  if (!response.ok) throw new Error(`Text generation failed: ${response.status}`);
  const data = await response.json();

  const rawText = Array.isArray(data) && data[0]?.generated_text ? data[0].generated_text : JSON.stringify(data);
  const parsed = safeJsonParse(rawText);

  if (!parsed?.slides?.length) {
    return fallbackSlides(topic, slideCount, tone);
  }

  return parsed.slides.slice(0, slideCount).map((slide, i) => ({
    title: slide.title || `${topic} ${i + 1}`,
    bullets: Array.isArray(slide.bullets) && slide.bullets.length ? slide.bullets : [`نقطة رئيسية ${i + 1}`],
    paragraph: slide.paragraph || '',
    notes: slide.notes || ''
  }));
}

function slidesToMarkdown(slides) {
  return slides
    .map((slide) => {
      const bulletText = slide.bullets.map((point) => `- ${point}`).join('\n');
      const notes = slide.notes ? `\n\n> ملاحظات: ${slide.notes}` : '';
      return `# ${slide.title}\n${bulletText}\n\n${slide.paragraph || ''}${notes}`;
    })
    .join('\n\n');
}

async function downloadAndOptimizeImage(imageUrl, outputPath) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Unable to download image');

  const arrayBuffer = await response.arrayBuffer();
  await sharp(Buffer.from(arrayBuffer)).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(outputPath);
}

async function fetchImageForSlide(slide, index) {
  const query = encodeURIComponent(slide.title.split(':')[0]);
  const fileName = `slide-${Date.now()}-${index}.jpg`;
  const outputPath = path.join(IMAGES_DIR, fileName);

  try {
    if (HF_TOKEN) {
      const response = await fetch(`https://api-inference.huggingface.co/models/${HF_IMAGE_MODEL}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: `${slide.title}, Arabic business presentation style, modern minimal layout, high quality`,
          options: { wait_for_model: true }
        })
      });

      if (response.ok && response.headers.get('content-type')?.includes('image')) {
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        await sharp(imageBuffer).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(outputPath);
        return generatedUrlFor(outputPath);
      }
    }

    const fallbackUrl = `https://picsum.photos/seed/${query}/1280/720`;
    await downloadAndOptimizeImage(fallbackUrl, outputPath);
    return generatedUrlFor(outputPath);
  } catch {
    return `https://picsum.photos/seed/${query}/1280/720`;
  }
}

function toHtmlSlides(slides, theme) {
  return slides
    .map(
      (slide, index) => `
      <section class="slide" style="--bg:${theme.bg}; --card:${theme.card}; --accent:${theme.accent}; --text:${theme.text};">
        <div class="media" style="background-image:url('${slide.image || ''}')"></div>
        <div class="content">
          <h2>${slide.title}</h2>
          <ul>${slide.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
          <p>${slide.paragraph || ''}</p>
          <small>Slide ${index + 1}</small>
        </div>
      </section>`
    )
    .join('\n');
}

async function exportPptx(deck) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  deck.slides.forEach((slide) => {
    const page = pptx.addSlide();
    page.background = { color: deck.theme.bg };
    page.addText(slide.title, { x: 0.4, y: 0.3, w: 12.4, h: 0.7, fontSize: 30, bold: true, color: deck.theme.text });
    page.addText(slide.bullets.map((b) => `• ${b}`).join('\n'), {
      x: 0.5,
      y: 1.2,
      w: 6.6,
      h: 4,
      fontSize: 18,
      color: deck.theme.text,
      breakLine: true
    });
    if (slide.image?.startsWith('/generated')) {
      page.addImage({ path: generatedFilePathFromUrl(slide.image), x: 7, y: 1.2, w: 5.7, h: 3.2 });
    }
    page.addText(slide.paragraph || '', { x: 0.5, y: 5.4, w: 12, h: 1.2, fontSize: 14, color: deck.theme.text });
  });

  const filename = `deck-${Date.now()}.pptx`;
  const outputPath = path.join(SLIDES_DIR, filename);
  await pptx.writeFile({ fileName: outputPath });
  return generatedUrlFor(outputPath);
}

async function exportPdf(deckHtml) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(deckHtml, { waitUntil: 'networkidle0' });

  const filename = `deck-${Date.now()}.pdf`;
  const outputPath = path.join(SLIDES_DIR, filename);

  await page.pdf({ path: outputPath, format: 'A4', printBackground: true, landscape: true });
  await browser.close();
  return generatedUrlFor(outputPath);
}

app.post('/api/generate', async (req, res) => {
  try {
    const { topic, tone = 'professional', slideCount = 6, theme = 'corporate' } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    await ensureDirectories();
    const themeObj = THEME_PRESETS[theme] || THEME_PRESETS.corporate;

    const slideData = await generateSlidesWithHF({ topic, tone, slideCount: Number(slideCount) });
    const slidesWithImages = await Promise.all(
      slideData.map(async (slide, idx) => ({ ...slide, image: await fetchImageForSlide(slide, idx) }))
    );

    const markdown = slidesToMarkdown(slidesWithImages);
    const htmlSlides = toHtmlSlides(slidesWithImages, themeObj);
    const markdownPath = path.join(SLIDES_DIR, `deck-${Date.now()}.md`);
    await fs.writeFile(markdownPath, markdown, 'utf8');

    res.json({
      topic,
      theme: themeObj,
      markdown,
      markdownFile: generatedUrlFor(markdownPath),
      slides: slidesWithImages,
      htmlSlides,
      htmlPreview: marked.parse(markdown)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate deck.' });
  }
});

app.post('/api/regenerate-slide', async (req, res) => {
  try {
    const { topic, tone, slideIndex } = req.body;
    const [newSlide] = await generateSlidesWithHF({ topic, tone, slideCount: 1 });
    newSlide.image = await fetchImageForSlide(newSlide, slideIndex || 0);
    res.json(newSlide);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Slide regeneration failed.' });
  }
});

app.post('/api/design-suggestions', (req, res) => {
  const { topic, tone } = req.body;
  const hints = [
    `استخدم عناوين واضحة وعالية التباين في عرض "${topic}" لتسهيل القراءة داخل القاعات.`,
    `بما أن النبرة المطلوبة هي (${tone})، اجعل كل سطر نقطة واحدة فقط بدون إطالة.`,
    'وازن بين النص والصور عبر إضافة شريحة مرئية بعد كل شريحتين نصيتين.',
    'حافظ على هوية بصرية موحدة: لون رئيسي واحد مع لون مساعد للإبراز.'
  ];
  res.json({ hints });
});

app.post('/api/export/pptx', async (req, res) => {
  try {
    const { deck } = req.body;
    const file = await exportPptx(deck);
    res.json({ file });
  } catch (error) {
    res.status(500).json({ error: error.message || 'PPTX export failed.' });
  }
});

app.post('/api/export/pdf', async (req, res) => {
  try {
    const { deckHtml } = req.body;
    const html = `
      <html><head><style>
      body{margin:0;font-family:Inter,Arial,sans-serif;background:#f8fafc;}
      .slide{height:100vh;display:grid;grid-template-columns:1fr 1.2fr;gap:20px;padding:32px;box-sizing:border-box;page-break-after:always;}
      .media{border-radius:18px;background-size:cover;background-position:center;box-shadow:0 10px 30px rgba(2,6,23,.2)}
      .content{background:rgba(255,255,255,.9);padding:24px;border-radius:18px;}
      h2{margin-top:0;font-size:34px;} li{margin-bottom:10px;} p{font-size:20px;}
      </style></head><body>${deckHtml}</body></html>`;
    const file = await exportPdf(html);
    res.json({ file });
  } catch (error) {
    res.status(500).json({ error: error.message || 'PDF export failed.' });
  }
});

app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Generated assets directory: ${GENERATED_DIR}`);
});
