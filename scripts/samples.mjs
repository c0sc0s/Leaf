import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile, mkdir } from 'node:fs/promises';
const specimens = [
  {
    slug: 'art-of-noticing',
    title: 'The Art of Noticing',
    author: 'Folio Editions',
    category: '设计与灵感',
    color: '#c85639',
    ink: '#f7ebd2',
    lines: ['THE ART', 'OF', 'NOTICING'],
    subtitle: 'A field guide to everyday attention',
    shape: 'sun',
  },
  {
    slug: 'quiet-spaces',
    title: 'Quiet Spaces',
    author: 'Folio Editions',
    category: '设计与灵感',
    color: '#d6d9cd',
    ink: '#294a44',
    lines: ['Quiet', 'Spaces'],
    subtitle: 'Finding room for a slower life',
    shape: 'arch',
  },
  {
    slug: 'designing-systems',
    title: 'Designing Systems',
    author: 'Folio Editions',
    category: '技术与思考',
    color: '#253a96',
    ink: '#f2ad68',
    lines: ['designing', 'systems.'],
    subtitle: 'Small rules. Meaningful connections.',
    shape: 'grid',
  },
  {
    slug: 'creative-practice',
    title: 'A Creative Practice',
    author: 'Folio Editions',
    category: '设计与灵感',
    color: '#eaca70',
    ink: '#313e39',
    lines: ['A CREATIVE', 'PRACTICE'],
    subtitle: 'Make something. Learn something.',
    shape: 'circle',
  },
  {
    slug: 'ways-of-seeing',
    title: 'Ways of Seeing Slowly',
    author: 'Folio Editions',
    category: '生活与阅读',
    color: '#e8dcd2',
    ink: '#8e403b',
    lines: ['ways of', 'seeing', 'slowly'],
    subtitle: 'Notes on the everyday',
    shape: 'lines',
  },
  {
    slug: 'less-but-better',
    title: 'Less, but Better',
    author: 'Folio Editions',
    category: '设计与灵感',
    color: '#353b35',
    ink: '#ece6cc',
    lines: ['LESS,', 'BUT', 'BETTER.'],
    subtitle: 'A reader on thoughtful simplicity',
    shape: 'sun',
  },
  {
    slug: 'human-interface',
    title: 'The Human Interface',
    author: 'Folio Editions',
    category: '技术与思考',
    color: '#96bbce',
    ink: '#233b50',
    lines: ['THE HUMAN', 'INTERFACE'],
    subtitle: 'Building with empathy',
    shape: 'arch',
  },
  {
    slug: 'collected-thoughts',
    title: 'Collected Thoughts',
    author: 'Folio Editions',
    category: '生活与阅读',
    color: '#c69ba7',
    ink: '#4e2940',
    lines: ['Collected', 'Thoughts'],
    subtitle: 'A small notebook of big questions',
    shape: 'circle',
  },
];
function color(hex) {
  return rgb(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
}
const chapters = [
  [
    'The beginning of attention',
    [
      'We move through the world surrounded by more information than we can possibly hold. A page, a room, or an ordinary morning can become a place to begin again. The first task is not to collect more, but to notice what is already here.',
      'Attention is a practice. It grows when we make a little space for it. Put a familiar object on the table and look at it for a full minute. Notice the edge, the shadow, and the quiet decisions that give it its shape. There is no correct answer to find.',
      'Good reading creates a similar space. The page should invite us in without asking us to understand the machinery behind it. Type, rhythm, and generous margins work together to make a thought feel approachable.',
      'The details matter because they shape how we feel. A comfortable line length allows the eye to return without effort. A clear heading helps us remember where we are. A quiet background leaves enough room for an idea to develop.',
      'Try a small experiment today: choose one thing that you normally overlook. Write three sentences about it. Return tomorrow and write three more. What changes is not only the object, but the quality of your attention.',
    ],
  ],
  [
    'A rhythm of your own',
    [
      'A useful practice fits into the life you actually have. It does not require a perfect studio, a long holiday, or a different personality. Start with a small repeatable action and allow it to become familiar.',
      'Make a place for reading. It might be a chair near a window or ten quiet minutes at the end of the day. The particular place matters less than the possibility of returning. Repetition gives an ordinary moment a little depth.',
      'When an idea catches your attention, mark it. A highlight is a conversation with your future self. A note is a way of making the conversation specific. Ask what the passage means in the context of your own work.',
      '1. Begin with a question that is small enough to answer.',
      '2. Look for patterns before you look for conclusions.',
      '3. Make a note of what surprised you.',
      '4. Leave enough time to return and reflect.',
      'The point is not to finish every page as quickly as possible. It is to discover which pages deserve your time. Reading slowly can be a practical decision, especially when an idea is likely to change what you do next.',
    ],
  ],
  [
    'Making room for ideas',
    [
      'Simplicity is not emptiness. It is a careful relationship between what remains and what has been removed. A simple interface can carry considerable thought, provided that the thought appears at the moment it is useful.',
      'A library is a record of curiosity. Its value is not measured only by the number of volumes it contains. It is also measured by the connections between them and by the invitations they offer to begin a new line of thought.',
      'Arrange your materials in a way that helps you return to them. Some people think in subjects, others in projects or moods. A good tool should leave enough room for these differences instead of enforcing one rigid model.',
      'Digital reading offers a useful possibility: the same words can find a different form. Larger type, a darker page, or a narrower measure can make a difficult document easier to approach. The content remains the anchor.',
      'Be honest about what changes in translation. A table is a relationship, not just a collection of words. An illustration can explain something that a paragraph cannot. Keep the original close when a new form leaves something behind.',
    ],
  ],
  [
    'A small conclusion',
    [
      'The most useful tools often become quiet through use. They do not disappear entirely; they simply make fewer demands on our attention. We remember the book, the idea, and the mark we left beside an important sentence.',
      'This specimen was written for Folio to demonstrate real PDF rendering, selectable text, reflow, and annotations. It is an original sample document rather than an excerpt from a published book.',
      'Take what is useful and make it your own. Keep a record of the passages you return to. Let a reading practice be something that grows with you, one page at a time.',
    ],
  ],
];
await mkdir('public/samples', { recursive: true });
for (const spec of specimens) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setAuthor(spec.author);
  pdf.setSubject('Original Folio sample document');
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const cover = pdf.addPage([480, 660]);
  cover.drawRectangle({ x: 0, y: 0, width: 480, height: 660, color: color(spec.color) });
  cover.drawRectangle({ x: 0, y: 0, width: 13, height: 660, color: rgb(0, 0, 0), opacity: 0.12 });
  cover.drawText('FOLIO  /  READING EDITIONS', {
    x: 38,
    y: 611,
    size: 10,
    font: sans,
    color: color(spec.ink),
  });
  let y = 515;
  for (const line of spec.lines) {
    const size = line.length > 12 ? 36 : 52;
    cover.drawText(line, {
      x: 36,
      y,
      size,
      font: spec.slug === 'quiet-spaces' || spec.slug === 'collected-thoughts' ? serif : bold,
      color: color(spec.ink),
    });
    y -= size * 1.1;
  }
  if (spec.shape === 'sun' || spec.shape === 'circle') {
    cover.drawCircle({ x: 335, y: 178, size: 105, color: color(spec.ink), opacity: 0.8 });
    cover.drawCircle({
      x: 335,
      y: 178,
      size: spec.shape === 'circle' ? 85 : 44,
      color: color(spec.color),
    });
  }
  if (spec.shape === 'arch') {
    cover.drawEllipse({
      x: 240,
      y: 205,
      xScale: 140,
      yScale: 125,
      color: color(spec.ink),
      opacity: 0.9,
    });
    cover.drawRectangle({ x: 100, y: 70, width: 280, height: 135, color: color(spec.ink) });
    cover.drawEllipse({ x: 240, y: 186, xScale: 90, yScale: 95, color: color(spec.color) });
    cover.drawRectangle({ x: 150, y: 70, width: 180, height: 115, color: color(spec.color) });
  }
  if (spec.shape === 'grid' || spec.shape === 'lines')
    for (let i = 0; i < 7; i++)
      cover.drawLine({
        start: { x: 36 + i * 55, y: 100 },
        end: { x: 150 + i * 40, y: 270 },
        thickness: 2,
        color: color(spec.ink),
        opacity: 0.6,
      });
  cover.drawText(spec.subtitle, { x: 38, y: 45, size: 12, font: serif, color: color(spec.ink) });
  for (let c = 0; c < chapters.length; c++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(spec.title.toUpperCase(), {
      x: 58,
      y: 790,
      size: 9,
      font: sans,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawLine({
      start: { x: 58, y: 775 },
      end: { x: 537, y: 775 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    page.drawText(`0${c + 1}`, { x: 58, y: 706, size: 12, font: sans, color: color(spec.color) });
    page.drawText(chapters[c][0], {
      x: 58,
      y: 666,
      size: 27,
      font: serif,
      color: rgb(0.15, 0.17, 0.16),
    });
    let cy = 613;
    for (const paragraph of chapters[c][1]) {
      let line = '';
      const wrapped = [];
      for (const word of paragraph.split(' ')) {
        if (serif.widthOfTextAtSize(line + ' ' + word, 13) > 468) {
          wrapped.push(line);
          line = word;
        } else line += (line ? ' ' : '') + word;
      }
      wrapped.push(line);
      for (const text of wrapped) {
        page.drawText(text, { x: 58, y: cy, size: 13, font: serif, color: rgb(0.2, 0.22, 0.21) });
        cy -= 21;
      }
      cy -= 17;
    }
    page.drawText(`${c + 2}  /  5`, {
      x: 510,
      y: 35,
      size: 9,
      font: sans,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
  await writeFile(`public/samples/${spec.slug}.pdf`, await pdf.save());
}
await writeFile('public/samples/manifest.json', JSON.stringify(specimens, null, 2));
console.log('Created 8 original, selectable sample PDFs.');
