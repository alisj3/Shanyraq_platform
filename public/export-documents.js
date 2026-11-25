// Both formats are generated in the browser. Answers are never sent for conversion.
const BLUE = '155EEF';
const INK = '182230';
const MUTED = '52647A';
const scriptLoads = new Map();

async function loadLibrary(path, name) {
  if (globalThis[name]) return globalThis[name];
  if (!scriptLoads.has(path)) {
    scriptLoads.set(path, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => resolve(globalThis[name]);
      script.onerror = () => { scriptLoads.delete(path); script.remove(); reject(new Error('library_load')); };
      document.head.append(script);
    }));
  }
  const library = await scriptLoads.get(path);
  if (!library) throw new Error('library_unavailable');
  return library;
}

async function fetchAsset(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('asset_load');
  return new Uint8Array(await response.arrayBuffer());
}

function pngSize(bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: data.getUint32(16), height: data.getUint32(20) };
}

function fitImage(bytes, width, height) {
  const size = pngSize(bytes);
  const scale = Math.min(width / size.width, height / size.height);
  return { width: size.width * scale, height: size.height * scale };
}

const phrase = (model, ru, kk) => model.language === 'kk' ? kk : ru;
const anchor = id => `step_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

export async function createWord(model, library, asset = fetchAsset) {
  const {
    Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, PageNumber,
    HeadingLevel, Bookmark, InternalHyperlink, ExternalHyperlink, CheckBox,
    AlignmentType, PageBreak,
  } = library;
  const [brand, eu, efca, iteachme] = await Promise.all([
    asset(`/assets/shanyraq-${model.language}.png`), asset('/assets/eu.png'),
    asset('/assets/efca.png'), asset('/assets/iteachme.png'),
  ]);
  const run = (text, options = {}) => new TextRun({ text, font: 'Arial', size: 21, color: INK, ...options });
  const paragraph = (text, options = {}) => new Paragraph({
    children: [run(text, options.style === 'Small' ? { size: 18, color: MUTED } : options.style === 'SourceUrl' ? { size: 16, color: MUTED } : options.style === 'Subtitle' ? { size: 23, color: '000000' } : {})], spacing: { after: 110, line: 288 }, widowControl: true, ...options,
  });
  const heading = (title, level = HeadingLevel.HEADING_1, options = {}) => new Paragraph({
    text: title, heading: level, keepNext: true, spacing: { before: 250, after: 130 }, ...options,
  });
  const hyperlink = (title, url, options = {}) => new Paragraph({
    children: [new ExternalHyperlink({ link: url, children: [run(title, { color: BLUE, underline: {} })] })],
    spacing: { before: 40, after: 80 }, ...options,
  });
  const internal = (title, bookmark, options = {}) => new Paragraph({
    children: [new InternalHyperlink({ anchor: bookmark, children: [run(title, { color: BLUE, size: 20 })] })],
    spacing: { after: 100 }, ...options,
  });
  const checkbox = (title, done, alias, options = {}) => new Paragraph({
    children: [new CheckBox({
      checked: done, alias: title,
      checkedState: { value: '2612', font: 'DejaVu Sans' },
      uncheckedState: { value: '2610', font: 'DejaVu Sans' },
    }), run(`  ${title}`)],
    indent: { left: 250, hanging: 250 },
    spacing: { after: 100, line: 280 }, widowControl: true, ...options,
  });
  const image = (bytes, label, width, height) => new ImageRun({
    data: bytes, type: 'png', transformation: fitImage(bytes, width, height),
    altText: { title: label, description: label, name: label },
  });
  const children = [
    new Paragraph({ text: model.labels.title, heading: HeadingLevel.TITLE, spacing: { after: 140 } }),
    paragraph(model.labels.subtitle, { style: 'Subtitle' }),
    paragraph(`${model.labels.created} ${model.date}   |   ${model.labels.reviewed} ${model.reviewDate}`, { style: 'Small' }),
    paragraph(model.intro),
    new Paragraph({ children: [run(`${model.labels.chosen}  `, { bold: true }), run(model.selectedTitle, { color: BLUE })], spacing: { after: 180 } }),
  ];
  for (const item of model.profile) {
    children.push(new Paragraph({ children: [run(`${item.label}  `, { bold: true, size: 19 }), run(item.value, { size: 19 })], spacing: { after: 85 } }));
  }
  children.push(paragraph(phrase(model, `Перенесено выполненных шагов ${model.done} из ${model.tasks}`, `Орындалған қадамдар көшірілді ${model.done} / ${model.tasks}`), { style: 'Small', spacing: { before: 140, after: 90 } }));
  if (model.allHint) children.push(paragraph(model.allHint));
  children.push(paragraph(model.labels.instructions, { style: 'Small' }));
  children.push(paragraph(model.labels.docxHelp, { style: 'Small' }));
  children.push(paragraph(model.labels.localEdits, { style: 'Small' }));
  children.push(new Paragraph({ children: [new Bookmark({ id: 'contents', children: [run(model.labels.contents, { bold: true, size: 26, color: '000000' })] })], keepNext: true, spacing: { before: 180, after: 130 } }));
  for (const group of model.groups) {
    for (const step of group.steps) children.push(internal(`${String(step.number).padStart(2, '0')}  ${step.title}`, anchor(step.id)));
  }
  children.push(new Paragraph({ children: [image(eu, 'Funded by the European Union', 61, 61), run('      '), image(efca, 'EFCA', 35, 64), run('       '), image(iteachme, 'ITeachMe', 84, 85)], spacing: { before: 170, after: 90 } }));
  children.push(paragraph(model.project, { style: 'Small' }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  if (model.notices.length) {
    children.push(heading(model.labels.important));
    for (const notice of model.notices) children.push(paragraph(notice, { style: 'Small' }));
  }
  for (const group of model.groups) {
    children.push(heading(group.title));
    for (const step of group.steps) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2, keepNext: true,
        children: [new Bookmark({ id: anchor(step.id), children: [run(`${step.number}  ${step.title}`, { bold: true, size: 25, color: '000000' })] })],
        spacing: { before: 220, after: 110 },
      }));
      children.push(checkbox(model.labels.completed, step.done, `complete_${step.id}`, { style: 'Small', keepNext: true }));
      children.push(paragraph(model.labels.actions, { style: 'Small', keepNext: true }));
      step.actions.forEach((action, index) => children.push(checkbox(`${step.number}.${index + 1}  ${action}`, false, `${step.id}_${index}`, { keepNext: true })));
      children.push(new Paragraph({ children: [run(`${model.labels.result}  `, { bold: true, size: 19 }), run(step.result, { size: 19 })], spacing: { before: 90, after: 130 }, keepNext: true }));
      if (step.source) {
        children.push(hyperlink(step.source.title, step.source.url, { keepNext: true }));
        children.push(paragraph(step.source.url, { style: 'SourceUrl', keepNext: true }));
        if (step.source.note) children.push(paragraph(step.source.note, { style: 'Small', keepNext: true }));
      }
      children.push(paragraph(`${model.labels.record}  __________________________________`, { style: 'Small', keepNext: true }));
      children.push(paragraph(`${model.labels.notes}\n________________________________________________________________\n________________________________________________________________`, { style: 'Small' }));
      children.push(internal(model.labels.back, 'contents', { spacing: { after: 200 } }));
    }
  }
  if (model.programs.length) {
    children.push(heading(model.labels.conditions));
    for (const program of model.programs) {
      children.push(heading(program.title, HeadingLevel.HEADING_2));
      children.push(paragraph(program.description));
      children.push(paragraph(program.reason));
      for (const condition of program.conditions) children.push(paragraph(condition));
    }
  }
  children.push(heading(model.labels.answers, HeadingLevel.HEADING_1, { pageBreakBefore: true }));
  for (const answer of model.answers) {
    children.push(new Paragraph({ children: [run(`${answer.label}\n`, { bold: true, size: 19 }), run(answer.value, { size: 19 })], spacing: { after: 130 }, keepNext: false }));
  }
  children.push(heading(model.labels.sources));
  for (const source of model.sources) {
    children.push(hyperlink(source.title, source.url, { keepNext: true }));
    children.push(paragraph(source.url, { style: 'SourceUrl' }));
  }
  children.push(paragraph(model.labels.support));
  children.push(paragraph(model.safe, { style: 'Small' }));
  children.push(paragraph(model.labels.privacy, { style: 'Small' }));
  children.push(paragraph(model.disclaimer, { style: 'Small' }));
  const document = new Document({
    creator: 'ITeachMe', title: model.labels.title, subject: model.selectedTitle,
    description: model.labels.subtitle, language: model.language === 'kk' ? 'kk-KZ' : 'ru-RU',
    styles: {
      default: { document: { run: { font: 'Arial', size: 21, color: INK }, paragraph: { spacing: { line: 288, after: 110 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 42, bold: true, color: '000000' }, paragraph: { spacing: { after: 160 } } },
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', run: { size: 23, color: '000000' } },
        { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 29, bold: true, color: '000000' }, paragraph: { outlineLevel: 0, keepNext: true } },
        { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, color: '000000' }, paragraph: { outlineLevel: 1, keepNext: true } },
        { id: 'Small', name: 'Small', basedOn: 'Normal', run: { size: 18, color: MUTED }, paragraph: { spacing: { line: 252, after: 110 } } },
        { id: 'SourceUrl', name: 'Source URL', basedOn: 'Normal', run: { size: 16, color: MUTED }, paragraph: { spacing: { line: 220, after: 110 } } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1150, right: 1050, bottom: 1050, left: 1050, header: 440, footer: 440 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [image(brand, 'Shanyraq', 132, 35)], spacing: { after: 110 } })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [run(`Shanyraq · ${model.date}     `, { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })],
      })] }) },
      children,
    }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}

export async function createPdf(model, library, fontkit, asset = fetchAsset) {
  const { PDFDocument, rgb, PDFName, PDFString, PDFHexString, PDFDict } = library;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(model.labels.title);
  pdf.setSubject(model.selectedTitle);
  pdf.setAuthor('ITeachMe');
  pdf.setCreator('Shanyraq');
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of(model.language === 'kk' ? 'kk-KZ' : 'ru-RU'));
  const [regularBytes, boldBytes, logoBytes, euBytes, efcaBytes, itmBytes] = await Promise.all([
    asset('/assets/fonts/DejaVuSans.ttf'), asset('/assets/fonts/DejaVuSans-Bold.ttf'),
    asset(`/assets/shanyraq-${model.language}.png`), asset('/assets/eu.png'), asset('/assets/efca.png'), asset('/assets/iteachme.png'),
  ]);
  // The regular font remains complete so users can type new Russian and Kazakh notes.
  const regular = await pdf.embedFont(regularBytes);
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const logo = await pdf.embedPng(logoBytes);
  const eu = await pdf.embedPng(euBytes);
  const efca = await pdf.embedPng(efcaBytes);
  const itm = await pdf.embedPng(itmBytes);
  const form = pdf.getForm();
  // Form editors need a font resource as well as the existing appearance streams.
  // Without this, a reader can display the form but lose Cyrillic when editing it.
  const resources = form.acroForm.dict.lookupMaybe(PDFName.of('DR'), PDFDict) || pdf.context.obj({});
  const formFonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict) || pdf.context.obj({});
  formFonts.set(PDFName.of(regular.name), regular.ref);
  resources.set(PDFName.of('Font'), formFonts);
  form.acroForm.dict.set(PDFName.of('DR'), resources);
  form.acroForm.dict.set(PDFName.of('DA'), PDFString.of(`/${regular.name} 10 Tf 0 g`));
  const color = hex => rgb(...hex.match(/../g).map(value => parseInt(value, 16) / 255));
  const ink = color(INK), blue = color(BLUE), muted = color(MUTED), border = color('CBD7E6');
  const width = 595.28, height = 841.89, left = 46, right = 549.28, bottom = 49;
  let page, y, activeStep = null;
  const destinations = new Map();
  const pendingLinks = [];
  const outlineEntries = [];
  const pages = [];
  const addPage = () => {
    page = pdf.addPage([width, height]);
    pages.push(page);
    const size = logo.scaleToFit(120, 32);
    page.drawImage(logo, { x: left, y: height - 58, width: size.width, height: size.height });
    page.drawText(model.labels.subtitle, { x: 260, y: height - 41, font: regular, size: 7.7, color: muted, maxWidth: 289 });
    y = height - 88;
    if (activeStep) {
      page.drawText(phrase(model, `Шаг ${activeStep.number} продолжение`, `${activeStep.number} қадам жалғасы`), { x: left, y, font: regular, size: 8.5, color: muted });
      y -= 23;
    }
  };
  const ensure = need => { if (y - need < bottom) addPage(); };
  const wrap = (text, size = 10, font = regular, maxWidth = right - left) => {
    const lines = [];
    for (const part of String(text).split('\n')) {
      let line = '';
      for (const word of part.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
        if (line) { lines.push(line); line = ''; }
        if (font.widthOfTextAtSize(word, size) <= maxWidth) line = word;
        else {
          for (const character of word) {
            if (font.widthOfTextAtSize(line + character, size) > maxWidth && line) { lines.push(line); line = ''; }
            line += character;
          }
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const paragraph = (text, { size = 10.2, font = regular, x = left, maxWidth = right - x, lineHeight = size * 1.48, after = 9, fill = ink } = {}) => {
    const lines = wrap(text, size, font, maxWidth);
    for (const line of lines) {
      ensure(lineHeight + after);
      page.drawText(line, { x, y, size, font, color: fill });
      y -= lineHeight;
    }
    y -= after;
  };
  const heading = (title, size = 15) => { ensure(65); paragraph(title, { font: bold, size, lineHeight: size * 1.35, after: 15 }); };
  const destination = id => { destinations.set(id, { page, y: y + 14 }); };
  const addLink = (targetPage, rect, url, target) => {
    const annotation = { Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0] };
    if (url) annotation.A = { Type: 'Action', S: 'URI', URI: PDFString.of(url) };
    else if (target) annotation.Dest = [target.page.ref, PDFName.of('XYZ'), null, target.y, null];
    const ref = pdf.context.register(pdf.context.obj(annotation));
    targetPage.node.addAnnot(ref);
  };
  const link = (title, url, { size = 9.2, target = null, lineHeight = 14, after = 7 } = {}) => {
    const lines = wrap(title, size);
    ensure(lines.length * lineHeight + after + 3);
    const targetPage = page, top = y + size + 2;
    paragraph(title, { size, fill: blue, lineHeight, after });
    const rect = [left, y + 6, right, top];
    if (target) pendingLinks.push({ page: targetPage, rect, target });
    else addLink(targetPage, rect, url);
  };
  const checkbox = (text, name, done, { size = 10.1, font = regular } = {}) => {
    const lines = wrap(text, size, font, right - left - 23);
    ensure(lines.length * 15 + 10);
    const field = form.createCheckBox(name);
    field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(text));
    field.addToPage(page, { x: left, y: y - 2, width: 12, height: 12, borderWidth: .8, borderColor: border, backgroundColor: rgb(1, 1, 1), textColor: blue });
    if (done) field.check();
    else field.uncheck();
    paragraph(text, { size, font, x: left + 23, lineHeight: 15, after: 8 });
  };
  const notes = id => {
    ensure(94);
    paragraph(model.labels.record, { size: 8.4, after: 1, fill: muted });
    let field = form.createTextField(`${id}_record`);
    field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(model.labels.record));
    field.setMaxLength(100);
    field.addToPage(page, { x: left, y: y - 16, width: right - left, height: 19, borderWidth: .6, borderColor: border, backgroundColor: color('F8FAFD'), textColor: ink, font: regular });
    field.setFontSize(10);
    y -= 26;
    paragraph(model.labels.notes, { size: 8.4, after: 1, fill: muted });
    field = form.createTextField(`${id}_notes`);
    field.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(model.labels.notes));
    field.enableMultiline();
    field.setMaxLength(350);
    field.addToPage(page, { x: left, y: y - 30, width: right - left, height: 33, borderWidth: .6, borderColor: border, backgroundColor: color('F8FAFD'), textColor: ink, font: regular });
    field.setFontSize(9.5);
    y -= 42;
  };
  addPage();
  paragraph(model.labels.title, { size: 19.5, font: bold, lineHeight: 25, after: 8 });
  paragraph(model.labels.subtitle, { size: 11.3, after: 12, fill: muted });
  paragraph(`${model.labels.created} ${model.date}     |     ${model.labels.reviewed} ${model.reviewDate}`, { size: 8.1, fill: muted, after: 17 });
  paragraph(model.intro, { size: 10 });
  paragraph(model.labels.chosen, { font: bold, size: 9, after: 4 });
  paragraph(model.selectedTitle, { size: 12, fill: blue, after: 15 });
  for (const answer of model.profile) paragraph(`${answer.label}  ${answer.value}`, { size: 8.8, lineHeight: 13, after: 6 });
  paragraph(phrase(model, `Перенесено выполненных шагов ${model.done} из ${model.tasks}`, `Орындалған қадамдар көшірілді ${model.done} / ${model.tasks}`), { font: bold, size: 8.8, after: 12 });
  if (model.allHint) paragraph(model.allHint, { size: 9, fill: muted });
  paragraph(model.labels.instructions, { size: 8.7, fill: muted, lineHeight: 12.5, after: 7 });
  paragraph(model.labels.pdfHelp, { size: 8.7, fill: muted, lineHeight: 12.5, after: 7 });
  paragraph(model.labels.localEdits, { size: 8.2, fill: muted, lineHeight: 12, after: 15 });
  ensure(90);
  destination('contents');
  heading(model.labels.contents, 13);
  for (const group of model.groups) for (const step of group.steps) link(`${String(step.number).padStart(2, '0')}  ${step.title}`, null, { target: anchor(step.id), size: 9.1, lineHeight: 12.5, after: 4 });
  ensure(118);
  let imageX = left;
  for (const [image, maxW, maxH] of [[eu, 49, 49], [efca, 30, 55], [itm, 75, 75]]) {
    const size = image.scaleToFit(maxW, maxH);
    page.drawImage(image, { x: imageX, y: y - 65, width: size.width, height: size.height });
    imageX += size.width + 29;
  }
  y -= 80;
  paragraph(model.project, { size: 7.6, fill: muted, lineHeight: 11, after: 4 });
  addPage();
  if (model.notices.length) {
    heading(model.labels.important, 13);
    for (const notice of model.notices) paragraph(notice, { size: 9.1, fill: muted, after: 11 });
    y -= 6;
  }
  for (const group of model.groups) {
    activeStep = null;
    ensure(170);
    heading(group.title, 15);
    for (const step of group.steps) {
      activeStep = null;
      ensure(130);
      activeStep = step;
      destination(anchor(step.id));
      outlineEntries.push({ title: `${step.number} ${step.title}`, ...destinations.get(anchor(step.id)) });
      paragraph(`${step.number}  ${step.title}`, { font: bold, size: 12.1, lineHeight: 17, after: 10 });
      checkbox(model.labels.completed, `complete_${step.id}`, step.done, { size: 8.8 });
      paragraph(model.labels.actions, { size: 8.2, fill: muted, after: 8 });
      step.actions.forEach((action, index) => {
        // Keep the final action and the result fields together when possible.
        if (index === step.actions.length - 1) ensure(220);
        checkbox(`${step.number}.${index + 1}  ${action}`, `action_${step.id}_${index}`, false);
      });
      paragraph(`${model.labels.result}  ${step.result}`, { size: 8.9, lineHeight: 13, after: 11 });
      if (step.source) {
        link(step.source.title, step.source.url, { size: 8.6 });
        paragraph(step.source.url, { size: 7.4, fill: muted, lineHeight: 10.5, after: 5 });
        if (step.source.note) paragraph(step.source.note, { size: 8.1, fill: muted, lineHeight: 11.5, after: 10 });
      }
      notes(step.id);
      link(model.labels.back, null, { target: 'contents', size: 8 });
      y -= 13;
    }
  }
  activeStep = null;
  if (model.programs.length) {
    ensure(250); heading(model.labels.conditions);
    for (const program of model.programs) {
      ensure(180); heading(program.title, 12);
      paragraph(program.description);
      paragraph(program.reason, { fill: muted });
      for (const condition of program.conditions) paragraph(condition);
    }
  }
  ensure(150); heading(model.labels.answers);
  for (const answer of model.answers) {
    ensure(62); paragraph(answer.label, { font: bold, size: 9.2, after: 4 });
    paragraph(answer.value, { size: 9.5, fill: muted, after: 12 });
  }
  heading(model.labels.sources);
  for (const source of model.sources) {
    ensure(60); link(source.title, source.url);
    paragraph(source.url, { size: 7.6, fill: muted, lineHeight: 11, after: 12 });
  }
  ensure(145);
  paragraph(model.labels.support, { size: 9.4 });
  paragraph(model.safe, { size: 9 });
  paragraph(model.labels.privacy, { size: 8.5, fill: muted });
  paragraph(model.disclaimer, { size: 8, fill: muted });
  for (const pending of pendingLinks) addLink(pending.page, pending.rect, null, destinations.get(pending.target));
  // Native outline entries support navigation in desktop PDF readers as well.
  const outline = pdf.context.obj({ Type: 'Outlines', Count: outlineEntries.length });
  const outlineRef = pdf.context.register(outline);
  const refs = outlineEntries.map(item => pdf.context.register(pdf.context.obj({
    Title: PDFHexString.fromText(item.title), Parent: outlineRef,
    Dest: [item.page.ref, PDFName.of('XYZ'), null, item.y, null],
  })));
  refs.forEach((ref, index) => {
    const entry = pdf.context.lookup(ref);
    if (index) entry.set(PDFName.of('Prev'), refs[index - 1]);
    if (index < refs.length - 1) entry.set(PDFName.of('Next'), refs[index + 1]);
  });
  if (refs.length) { outline.set(PDFName.of('First'), refs[0]); outline.set(PDFName.of('Last'), refs.at(-1)); }
  pdf.catalog.set(PDFName.of('Outlines'), outlineRef);
  pages.forEach((item, index) => {
    item.drawText(`Shanyraq · ${model.date}`, { x: left, y: 25, font: regular, size: 7.5, color: muted });
    const count = `${index + 1} / ${pages.length}`;
    item.drawText(count, { x: right - regular.widthOfTextAtSize(count, 8), y: 25, font: regular, size: 8, color: muted });
  });
  form.updateFieldAppearances(regular);
  return pdf.save();
}

export async function createDownload(model, format) {
  if (format === 'docx') {
    const library = await loadLibrary('/vendor/docx.js', 'docx');
    return { bytes: await createWord(model, library), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  if (format === 'pdf') {
    const [library, fontkit] = await Promise.all([loadLibrary('/vendor/pdf-lib.js', 'PDFLib'), loadLibrary('/vendor/fontkit.js', 'fontkit')]);
    return { bytes: await createPdf(model, library, fontkit), type: 'application/pdf' };
  }
  throw new Error('unsupported_format');
}
