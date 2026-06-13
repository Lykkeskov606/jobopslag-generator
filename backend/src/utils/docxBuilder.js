const { Document, Paragraph, TextRun, AlignmentType, Packer } = require('docx');

function buildParagraphs(content) {
  return content.split('\n').map((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return new Paragraph({ spacing: { after: 100 } });
    }

    if (trimmed.endsWith(':') && trimmed.length < 70 && !trimmed.includes('. ')) {
      return new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 24 })],
        spacing: { before: 280, after: 80 },
      });
    }

    if (/^[•\-\*]\s/.test(trimmed)) {
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun(trimmed.replace(/^[•\-\*]\s*/, ''))],
        spacing: { after: 80 },
      });
    }

    return new Paragraph({
      children: [new TextRun(trimmed)],
      spacing: { after: 120 },
    });
  });
}

async function buildDocxBuffer(title, content) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, size: 36 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
        }),
        ...buildParagraphs(content),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildParagraphs, buildDocxBuffer };
